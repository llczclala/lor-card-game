import type { CardData, GameState, Keyword } from '../types'; // [修改] 新增 Keyword 的引入
import { EFFECT_DB } from '../data/effectRegistry';
import { createCard } from '../data/cards';
import { cloneUnitState } from '../utils/gameRules'; // [新增] 引入我们的完美复印机
import { eventBus, GameEvents } from '../utils/eventBus';

/**
 * 上下文接口：描述执行法术时所需的全部游戏状态
 */
export interface EffectContext {
    game: GameState;
    playerBench: CardData[];
    enemyBench: CardData[];
    playerHand: CardData[];
    enemyHand: CardData[];
    playerDeck?: CardData[]; // [新增] 最高权限：授予我方牌库物理读写权
    enemyDeck?: CardData[];  // [新增] 最高权限：授予敌方牌库物理读写权
    combatField?: any[]; // [新增] 授予交战区数据读写权限
    owner: 'player' | 'enemy'; // 施法者是谁
    sourceCard?: CardData; // [新增] 记录是谁触发了这个效果（复印机的扫描源头）
}

export interface EffectParams {
    value?: number;
    power?: number;
    health?: number;
    strikeMode?: 'MUTUAL' | 'ONE_WAY';
    duration?: 'ROUND' | 'PERMANENT';
    relatedCardKey?: string;
    keywords?: Keyword[]; // [新增] 补全缺失的关键词参数，这是粉碎 TS 类型拓宽报错的核心
    summonKey?: string;              // [新增] 召唤物的卡牌 Key
    summonZone?: 'bench' | 'combat'; // [新增] 召唤的降落点（备战席 或 交战区）
    presenceRequirement?: string[];
    targetKeyRequirement?: string[];
}

/**
 * 结果接口：描述法术执行后产生的状态变更
 */
export interface EffectResult {
    game: GameState;
    playerBench: CardData[];
    enemyBench: CardData[];
    playerHand: CardData[];
    enemyHand: CardData[];
    playerDeck?: CardData[]; // [新增] 吐出修改后的我方牌库
    enemyDeck?: CardData[];  // [新增] 吐出修改后的敌方牌库
    combatField?: any[]; // [新增] 返回更新后的交战区数据
    events: { type: string, payload?: any }[]; // 需要触发的副作用事件 (如特效、音效)
}

/**
 * 辅助函数：根据 ID 在列表中查找并更新卡牌
 */
const updateCardInList = (list: CardData[], targetId: string, updater: (c: CardData) => CardData): CardData[] => {
    return list.map(c => c.id === targetId ? updater(c) : c);
};

const setEliceInitialCharge = (card: CardData) => {
    if (card.key === 'Chongye_Squad_Elice') {
        card.customProgress = 1;
        console.log(`[Elice] 入场成功，初始充能已设置为 ${card.customProgress}`);
    }
};

/**
 * 目标验证器 (Validator)
 * 检查选定的目标是否符合 Effect 定义的要求
 */
export const validateTargets = (effectId: string, targets: any[]): boolean => {
    const effect = EFFECT_DB[effectId];
    if (!effect) return false;

    // 计算需要手动选择的目标总数
    // 排除掉 'ALL' (全体), 'SELF' (自身), 'NEXUS' (水晶) 等自动目标
    const requiredCount = effect.targetRequirements.reduce((sum, req) => {
        if (typeof req.count === 'string' && req.count === 'ALL') return sum;
        if (['SELF', 'PLAYER_NEXUS', 'ENEMY_NEXUS', 'PLAYER_DECK', 'ENEMY_DECK'].includes(req.type)) return sum;
        const count = typeof req.count === 'number' ? req.count : 0;
        return sum + count;
    }, 0);

    // 如果不需要目标，targets 应该为空 (或忽略)
    if (requiredCount === 0) return true;

    // 检查数量是否匹配
    if (targets.length !== requiredCount) return false;

    return true;
};

/**
 * 核心处理函数 (The Engine)
 */
export const processEffect = (
    effectId: string,
    targets: any[],
    context: EffectContext
): EffectResult => {
    const effect = EFFECT_DB[effectId];

    // 1. 初始化结果副本
    let nextGame = { ...context.game };
    let nextPlayerBench = [...context.playerBench];
    let nextEnemyBench = [...context.enemyBench];
    let nextPlayerHand = [...context.playerHand];
    let nextEnemyHand = [...context.enemyHand];
    let nextPlayerDeck = context.playerDeck ? [...context.playerDeck] : undefined; // [新增]
    let nextEnemyDeck = context.enemyDeck ? [...context.enemyDeck] : undefined;    // [新增]
    let nextCombatField = context.combatField ? [...context.combatField] : undefined; // [新增] 战场副本
    const events: { type: string, payload?: any }[] = [];

    if (!effect) {
        console.warn(`[EffectProcessor] Effect [${effectId}] not found in registry.`);
        return { game: nextGame, playerBench: nextPlayerBench, enemyBench: nextEnemyBench, playerHand: nextPlayerHand, enemyHand: nextEnemyHand, events };
    }

    // [新增] 拦截并触发卜卜专属大招音效
    if (effectId === 'effect_pupu_specular_soul_ultimate') {
        eventBus.emit(GameEvents.SFX_PUPU_ULTIMATE);
    }

    // [新增] 智能目标填充 (Implicit Target Handling)
    // 如果没有传入目标，但法术配置了自动目标 (如 NEXUS/SELF)，则自动构建目标对象
    const finalTargets = [...targets];
    if (finalTargets.length === 0 && effect.targetRequirements.length > 0) {
        effect.targetRequirements.forEach(req => {
            // 自动填充敌方水晶
            if (req.type === 'ENEMY_NEXUS') {
                finalTargets.push({ type: context.owner === 'player' ? 'enemy_nexus' : 'player_nexus' });
            }
            // 自动填充我方水晶
            else if (req.type === 'PLAYER_NEXUS') {
                finalTargets.push({ type: context.owner === 'player' ? 'player_nexus' : 'enemy_nexus' });
            }
            // SELF 目标
            else if (String(req.type) === 'SELF') {
                // [核心修复] 真正实装 SELF 目标的解析！将传进来的 sourceCard 转化为合法的目标对象
                if (context.sourceCard && context.sourceCard.id) {
                    finalTargets.push({ type: 'ally', id: context.sourceCard.id });
                } else {
                    console.warn(`[EffectProcessor] 解析 SELF 目标失败：缺少 sourceCard`);
                }
            }
        });
    }

    if (effect.targetRequirements.some(req => req.type === 'ALL_ALLIES')) {
        const bench = context.owner === 'player' ? nextPlayerBench : nextEnemyBench;
        bench.forEach(c => finalTargets.push({ type: 'ally', id: c.id }));
    }

    // --- 根据效能类型 (Class) 分发逻辑 ---

    switch (effect.class) {
        case 'STRIKE': {
            // 法术打击逻辑

            // A. 直接数值打击 (如: 暗箭, 破坏, 秘术射击, 镜涌万象)
            if (effect.params.value) {
                const target = finalTargets[0];
                if (!target) break;

                // =====================================
                // [新增] 第一层：动态载荷判定 (Dynamic Payload)
                // =====================================
                let dmg = effect.params.value;
                let shouldSplash = effect.params.splashAdjacent; // [新增] 动态溅射开关

                // 拦截器：如果存在增伤条件
                if (effect.params.condition === 'pupu_strike_check' && effect.params.bonusValue !== undefined) {
                    // 全场雷达扫描：我方备战席和交战区，是否有参与过打击的卜卜
                    const hasUpgradedPupu =
                        nextPlayerBench.some(c => c.key.includes('pupu_specular_soul') && (c.roundStrikes || 0) > 0) ||
                        (nextCombatField && nextCombatField.some(f =>
                            (f.owner === 'player' && f.attacker.key.includes('pupu_specular_soul') && (f.attacker.roundStrikes || 0) > 0) ||
                            (f.owner === 'enemy' && f.blocker && f.blocker.key.includes('pupu_specular_soul') && (f.blocker.roundStrikes || 0) > 0)
                        ));

                    if (hasUpgradedPupu) {
                        dmg = effect.params.bonusValue;
                        shouldSplash = false; // [核心修复] 载荷升级后，强制关闭溅射阀门！
                        eventBus.emit(GameEvents.SFX_PUPU_SKILL1_UPGRADED); // [新增] 播放强化版音效
                        console.log(`[Splash Engine] 满足联动条件，法术载荷升级为 ${dmg}，已取消溅射！`);
                    } else {
                        eventBus.emit(GameEvents.SFX_PUPU_SKILL1); // [新增] 播放未强化版音效
                    }
                }

                const isHittingEnemyNexus = (context.owner === 'player' && target.type === 'enemy_nexus') ||
                                          (context.owner === 'enemy' && target.type === 'player_nexus');
                const isHittingPlayerNexus = (context.owner === 'player' && target.type === 'player_nexus') ||
                                           (context.owner === 'enemy' && target.type === 'enemy_nexus');

                if (isHittingEnemyNexus) {
                    nextGame.enemyNexus -= dmg;
                    events.push({ type: 'nexus_damage', payload: { target: 'enemy', amount: dmg } });
                } else if (isHittingPlayerNexus) {
                    nextGame.playerNexus -= dmg;
                    events.push({ type: 'nexus_damage', payload: { target: 'player', amount: dmg } });
                } else if (target.id) {

                    // =====================================
                    // [新增] 第二层：相邻溅射雷达 (Splash Radar)
                    // =====================================
                    const targetsToHit: string[] = [target.id]; // 默认只有主目标

                    if (shouldSplash) { // [核心修复] 改为判定动态开关
                        // 1. 扫描敌方备战席 (如果是以玩家身份施法，敌人就是 enemyBench)
                        const targetBench = context.owner === 'player' ? nextEnemyBench : nextPlayerBench;
                        const benchIdx = targetBench.findIndex(c => c.id === target.id);

                        if (benchIdx !== -1) {
                            // 抓取左右邻居并入列
                            if (benchIdx > 0) targetsToHit.push(targetBench[benchIdx - 1].id);
                            if (benchIdx < targetBench.length - 1) targetsToHit.push(targetBench[benchIdx + 1].id);
                        } else if (nextCombatField) {
                            // 2. 扫描交战区 (通过寻找所在的交锋槽位)
                            const combatIdx = nextCombatField.findIndex(f => (f.attacker && f.attacker.id === target.id) || (f.blocker && f.blocker.id === target.id));
                            if (combatIdx !== -1) {
                                // 判定主目标是处于进攻位还是防守位，以确保只会溅射到同一侧的单位
                                const isAttacker = nextCombatField[combatIdx].attacker?.id === target.id;

                                if (combatIdx > 0) {
                                    const adj = nextCombatField[combatIdx - 1];
                                    const id = isAttacker ? adj.attacker?.id : adj.blocker?.id;
                                    if (id) targetsToHit.push(id);
                                }
                                if (combatIdx < nextCombatField.length - 1) {
                                    const adj = nextCombatField[combatIdx + 1];
                                    const id = isAttacker ? adj.attacker?.id : adj.blocker?.id;
                                    if (id) targetsToHit.push(id);
                                }
                            }
                        }
                    }

                    // =====================================
                    // [修改] 第三层：批量火力覆盖 (Carpet Bombing)
                    // =====================================
                    targetsToHit.forEach(hitId => {
                        const applyDmg = (c: CardData) => {
                            // [核心修复：法术不穿盾] 优先检查屏障拦截
                            if (c.keywords.includes('Barrier') && dmg > 0) {
                                events.push({ type: 'sfx_shield_break', payload: null });
                                return { ...c, keywords: c.keywords.filter(k => k !== 'Barrier'), animState: 'hit' as const };
                            }
                            if (dmg > 0) events.push({ type: 'unit_damage', payload: { id: c.id, amount: dmg } });
                            return { ...c, damageTaken: (c.damageTaken||0) + dmg, animState: 'hit' as const };
                        };

                        // 盲扫更新 (利用现成的封装好的 updateCardInList)
                        nextPlayerBench = updateCardInList(nextPlayerBench, hitId, applyDmg);
                        nextEnemyBench = updateCardInList(nextEnemyBench, hitId, applyDmg);
                        if (nextCombatField) {
                            nextCombatField = nextCombatField.map(fight => {
                                let newFight = { ...fight };
                                if (newFight.attacker && newFight.attacker.id === hitId) {
                                    newFight.attacker = applyDmg(newFight.attacker);
                                }
                                if (newFight.blocker && newFight.blocker.id === hitId) {
                                    newFight.blocker = applyDmg(newFight.blocker);
                                }
                                return newFight;
                            });
                        }
                    });
                }
            }
            // B. 单位相互打击 (如: 单挑)
            else {
                const attackerId = finalTargets.find(t => t.type?.includes('ally'))?.id;
                const defenderId = finalTargets.find(t => t.type?.includes('enemy'))?.id;

                const findUnit = (id: string) =>
                    nextPlayerBench.find(c => c.id === id) || nextEnemyBench.find(c => c.id === id);

                if (attackerId && defenderId) {
                    const attacker = findUnit(attackerId);
                    const defender = findUnit(defenderId);

                    if (attacker && defender) {
                        // [核心修复] 提取当前真实面板攻击力（基础 + 永久 Buff + 临时 Buff）
                        const getRealPower = (c: CardData) => (c.power || 0) + (c.buffs?.power || 0);

                        const damageToDef = getRealPower(attacker);
                        const damageToAtk = getRealPower(defender);

                        const applyDamage = (c: CardData, dmg: number, didStrike: boolean) => {
                            let nextKeywords = c.keywords;
                            let finalDmg = dmg;

                            // [核心修复：法术单挑不穿盾] 优先检查屏障拦截
                            if (c.keywords.includes('Barrier') && finalDmg > 0) {
                                events.push({ type: 'sfx_shield_break', payload: null });
                                nextKeywords = nextKeywords.filter(k => k !== 'Barrier');
                                finalDmg = 0; // 伤害被抵挡
                            }

                            // [致命 Bug 修复] 绝不减 c.health，只累加 damageTaken
                            let newDamageTaken = (c.damageTaken || 0) + finalDmg;
                            if (finalDmg > 0) events.push({ type: 'unit_damage', payload: { id: c.id, amount: finalDmg } });

                            // [新增核心] 法术附带碾压 (Overwhelm) 激光穿透判定
                            if (attacker.keywords.includes('Overwhelm')) {
                                const currentHealth = c.health + (c.buffs?.health || 0) - (c.damageTaken || 0);
                                if (finalDmg > currentHealth) {
                                    const excess = finalDmg - currentHealth;
                                    if (context.owner === 'player') {
                                        nextGame.enemyNexus -= excess;
                                        events.push({ type: 'nexus_damage', payload: { target: 'enemy', amount: excess } });
                                    } else {
                                        nextGame.playerNexus -= excess;
                                        events.push({ type: 'nexus_damage', payload: { target: 'player', amount: excess } });
                                    }
                                }
                            }

                            // [新增] 幻象(Ephemeral) 打击后致死判定
                            // 如果参与了打击且带有幻象，注入致死伤害，交由全局收尸系统接管死亡特效与判定
                            if (didStrike && c.keywords.includes('Ephemeral')) {
                                newDamageTaken += 9999;
                            }

                            return { ...c, keywords: nextKeywords, damageTaken: newDamageTaken, animState: 'hit' as const };
                        };

                        // [致命 Bug 修复] 梳理打击逻辑，彻底移除复制粘贴导致的重复扣血！
                        const mode = effect.params.strikeMode || 'MUTUAL';
                        // [新增] 判定防守方是否挥出了反击
                        const defenderDidStrike = mode === 'MUTUAL';

                        // 1. 防御方承受伤害 (备战席)
                        nextPlayerBench = updateCardInList(nextPlayerBench, defenderId, c => applyDamage(c, damageToDef, defenderDidStrike));
                        nextEnemyBench = updateCardInList(nextEnemyBench, defenderId, c => applyDamage(c, damageToDef, defenderDidStrike));

                        // 2. 攻击方承受反击伤害或仅接受打击动作裁决 (备战席)
                        if (mode === 'MUTUAL') {
                            nextPlayerBench = updateCardInList(nextPlayerBench, attackerId, c => applyDamage(c, damageToAtk, true));
                            nextEnemyBench = updateCardInList(nextEnemyBench, attackerId, c => applyDamage(c, damageToAtk, true));
                        } else {
                            // [新增] 单向打击下，攻击方虽然不承受反击伤害，但也挥出了一击，必须接受幻象安检！
                            nextPlayerBench = updateCardInList(nextPlayerBench, attackerId, c => applyDamage(c, 0, true));
                            nextEnemyBench = updateCardInList(nextEnemyBench, attackerId, c => applyDamage(c, 0, true));
                        }

                        // 3. [新增] 顺藤摸瓜，同步更新交战区 (combatField) 中的单位
                        if (nextCombatField) {
                            nextCombatField = nextCombatField.map(fight => {
                                let newFight = { ...fight };

                                // 检查交战区中的 attacker 是否参与了单挑
                                if (newFight.attacker) {
                                    if (newFight.attacker.id === defenderId) {
                                        newFight.attacker = applyDamage(newFight.attacker, damageToDef, defenderDidStrike);
                                    } else if (newFight.attacker.id === attackerId) {
                                        newFight.attacker = applyDamage(newFight.attacker, mode === 'MUTUAL' ? damageToAtk : 0, true);
                                    }
                                }

                                // 检查交战区中的 blocker 是否参与了单挑
                                if (newFight.blocker) {
                                    if (newFight.blocker.id === defenderId) {
                                        newFight.blocker = applyDamage(newFight.blocker, damageToDef, defenderDidStrike);
                                    } else if (newFight.blocker.id === attackerId) {
                                        newFight.blocker = applyDamage(newFight.blocker, mode === 'MUTUAL' ? damageToAtk : 0, true);
                                    }
                                }

                                return newFight;
                            });
                        }

                        events.push({ type: 'sfx_strike', payload: null });
                    }
                }
            }
            break;
        }
        // [新增] BUFF 处理器 (处理 GRANT 类型效果)
        case 'BUFF': {
            // [修复] 显式断言 effect.params 为 EffectParams，让 TS 知道 keywords 的合法身份
            const params = effect.params as EffectParams;

            // =====================================
            // [重构] 战场前置条件通用扫描仪 (数据驱动版)
            // =====================================
            if (params.presenceRequirement && params.presenceRequirement.length > 0) {
                const targetBench = context.owner === 'player' ? nextPlayerBench : nextEnemyBench;
                const requiredKeys = params.presenceRequirement;

                // 辅助函数：只要卡牌的 key 包含名单中的任意一项，即为通过安检
                const isValidUnit = (c: CardData | null | undefined) =>
                    c && requiredKeys.some(reqKey => c.key.includes(reqKey));

                // 1. 扫描备战席
                let hasRequiredUnit = targetBench.some(isValidUnit);

                // 2. 如果备战席没有，扫描交战区
                if (!hasRequiredUnit && nextCombatField) {
                    hasRequiredUnit = nextCombatField.some(fight => {
                        const myUnit = fight.owner === context.owner ? fight.attacker : fight.blocker;
                        return isValidUnit(myUnit);
                    });
                }

                // 3. 拦截裁决
                if (!hasRequiredUnit) {
                    console.log(`[EffectProcessor] 条件未满足：场上缺少 ${requiredKeys.join('/')}，取消发放 BUFF。`);
                    break; // 找不到名单上的单位，直接终止法术结算！
                }
            }

            const power = params.power || 0;
            const health = params.health || 0;
            const duration = params.duration || 'PERMANENT'; // [新增] 提取增益持续时间
            const keywords = params.keywords || [];

            // [新增] 机器 A：专属“数值改造机”
            const applyStats = (c: CardData, p: number, h: number): CardData => {
                let actualP = p;
                let nextProgress = c.customProgress || 0;

                // [芬妮专属拦截] 利用 customProgress 位运算思想记录是否触发过 (1=1级触发过, 2=2级触发过, 3=都触发过)
                if (params.condition === 'fenny_first_attack_lv1') {
                    if (nextProgress === 1 || nextProgress === 3) return c; // 已经触发过了
                    actualP = 3;
                    nextProgress += 1;
                } else if (params.condition === 'fenny_first_attack_lv2') {
                    if (nextProgress === 2 || nextProgress === 3) return c; // 已经触发过了
                    actualP = 5;
                    nextProgress += 2;
                } else if (p === 0 && h === 0) {
                    return c;
                }

                return {
                    ...c,
                    customProgress: nextProgress, // 记录触发状态
                    buffs: {
                        power: (c.buffs?.power || 0) + actualP,
                        health: (c.buffs?.health || 0) + h
                    },
                    // [核心修复] 如果是单回合持续，把增益同步记录到“临时账本 (roundBuffs)”中
                    roundBuffs: {
                        power: (c.roundBuffs?.power || 0) + (duration === 'ROUND' ? p : 0),
                        health: (c.roundBuffs?.health || 0) + (duration === 'ROUND' ? h : 0)
                    }
                };
            };
            // [新增] 机器 B：专属“词条烙印机”
            const applyKeywords = (c: CardData, kws: Keyword[]): CardData => {
                if (kws.length === 0) return c;

                // [核心重构] 记账逻辑：只把单位原本【没有】的词条记入临时账本
                let newRoundKeywords = c.roundKeywords || [];
                if (duration === 'ROUND') {
                    // 过滤出真正属于“新加”的词条
                    const newlyAdded = kws.filter(k => !c.keywords.includes(k));
                    newRoundKeywords = Array.from(new Set([...newRoundKeywords, ...newlyAdded]));
                }

                return {
                    ...c,
                    // TS 此时已经知道 c.keywords 和 kws 都是合法的 Keyword[]
                    keywords: Array.from(new Set([...c.keywords, ...kws])),
                    roundKeywords: newRoundKeywords // [新增] 保存词条临时账本
                };
            };

            finalTargets.forEach(target => {
                if (!target.id) return; // BUFF 只能给单位，不能给水晶

                // [修改] 车间调度员：显式声明返回值，并将原料卡送进两条流水线
                const applyBuff = (c: CardData): CardData => {
                    // =====================================
                    // [新增] 专属发牌过滤：如果设定了白名单，核对身份证！
                    // =====================================
                    if (params.targetKeyRequirement && params.targetKeyRequirement.length > 0) {
                        const isAuthorized = params.targetKeyRequirement.some(reqKey => c.key.includes(reqKey));
                        if (!isAuthorized) return c; // 身份不符，原样退回，不发 Buff 也不亮高光
                    }

                    let processed = { ...c };

                    processed = applyStats(processed, power, health);
                    processed = applyKeywords(processed, keywords);

                    return {
                        ...processed,
                        animState: 'buff' as const // 触发发光动画
                    };
                };

                nextPlayerBench = updateCardInList(nextPlayerBench, target.id, applyBuff);
                nextEnemyBench = updateCardInList(nextEnemyBench, target.id, applyBuff);

                // [新增] 顺藤摸瓜，同步搜索并更新交战区 (combatField) 中的单位
                if (nextCombatField) {
                    nextCombatField = nextCombatField.map(fight => {
                        let newFight = { ...fight };
                        // 如果攻击者是目标，贴 BUFF
                        if (newFight.attacker && newFight.attacker.id === target.id) {
                            newFight.attacker = applyBuff(newFight.attacker);
                        }
                        // 如果防守者是目标，贴 BUFF
                        if (newFight.blocker && newFight.blocker.id === target.id) {
                            newFight.blocker = applyBuff(newFight.blocker);
                        }
                        return newFight;
                    });
                }
            });

            events.push({ type: 'sfx_buff', payload: null }); // 触发音效
            break;
        }

        // =====================================
        // [新增] 机制：折返与战术规避 (RECALL)
        // =====================================
        case 'RECALL': {
            const target = finalTargets[0];
            if (!target || !target.id) break;

            const params = effect.params as EffectParams;
            const keywordsToGrant = params.keywords || [];

            const applyRecallBuff = (c: CardData) => ({
                ...c,
                keywords: Array.from(new Set([...c.keywords, ...keywordsToGrant]))
            });

            // 检查目标是否在交战区
            if (nextCombatField) {
                const combatIdx = nextCombatField.findIndex(f => f.attacker?.id === target.id || f.blocker?.id === target.id);
                if (combatIdx !== -1) {
                    const fight = nextCombatField[combatIdx];
                    const isAttacker = fight.attacker?.id === target.id;
                    let recalledUnit = isAttacker ? fight.attacker! : fight.blocker!;

                    // 赋予屏障等 buff
                    recalledUnit = applyRecallBuff(recalledUnit);

                    // 从交战区拔除
                    if (isAttacker) {
                        nextCombatField.splice(combatIdx, 1); // 攻击者撤退，这一路交锋直接取消
                    } else {
                        // [核心铺垫：空气墙机制] 不仅仅是 blocker: null，必须打上 isGhostBlocked 标记！
                        nextCombatField[combatIdx] = { ...fight, blocker: null, isGhostBlocked: true } as any;
                    }

                    // 放回对应的备战席
                    const bench = context.owner === 'player' ? nextPlayerBench : nextEnemyBench;
                    bench.push(recalledUnit);

                    events.push({ type: 'sfx_recall_block', payload: null });
                    events.push({ type: 'sfx_buff', payload: null });
                    break;
                }
            }

            // 如果不在交战区，就在原地赋予屏障
            nextPlayerBench = updateCardInList(nextPlayerBench, target.id, applyRecallBuff);
            nextEnemyBench = updateCardInList(nextEnemyBench, target.id, applyRecallBuff);
            events.push({ type: 'sfx_buff', payload: null });
            break;
        }

        // [新增] 处理备战效果 (Rally)
        case 'RALLY': {
            // [修正] 核心逻辑：赋予施法者独立的备战标识 (Rally Token)
            // 使用对象展开，确保不影响对手的 Token 状态
            nextGame.attackToken = {
                ...nextGame.attackToken,
                [context.owner]: 'rally' // 将自己的状态设为 'rally' (蓝色)
            };

            // 触发特殊事件，供 UI 层显示蓝色宝剑特效
            events.push({ type: 'gain_token_rally', payload: { owner: context.owner } });
            break;
        }
        // =====================================
        // [新增] 机制 4：状态快照与完美克隆
        // =====================================
        case 'CLONE_AND_SUMMON': {
            const params = effect.params as EffectParams;
            const cardKey = params.summonKey;
            const zone = params.summonZone || 'bench';

            if (cardKey && context.sourceCard) {
                // 1. 提取空白的模板卡（镜爻 卜卜）
                const templateCard = createCard(cardKey);

                // 2. 启动复印机：将本体 (sourceCard) 的当前身材完美印在模板上
                const clonedCard = cloneUnitState(context.sourceCard, templateCard);

                const targetBench = context.owner === 'player' ? nextPlayerBench : nextEnemyBench;

                // 3. 空降逻辑 (完美复用 SUMMON 的安全气囊机制)
                if (zone === 'combat' && nextCombatField) {
                    if (nextCombatField.length < 6) {
                        nextCombatField.push({
                            attacker: { ...clonedCard, animState: 'idle' },
                            blocker: null,
                            owner: context.owner
                        });
                        events.push({ type: 'summon_combat', payload: clonedCard });
                    }
                    else if (targetBench.length < 6) {
                        targetBench.push(clonedCard);
                        events.push({ type: 'summon', payload: clonedCard });
                    }
                } else {
                    if (targetBench.length < 6) {
                        targetBench.push(clonedCard);
                        events.push({ type: 'summon', payload: clonedCard });
                    }
                }
            } else {
                console.warn("[EffectProcessor] CLONE_AND_SUMMON 失败：缺少 summonKey 或未传入 sourceCard。");
            }
            break;
        }
        // =====================================
        // [新增] 机制 5：牌库检索与置顶 (The Tutor Engine)
        // =====================================
        case 'TUTOR': {
            const params = effect.params as EffectParams;
            const targetKey = params.summonKey; // 我们借用 summonKey 字段来传递检索目标

            if (targetKey) {
                const targetDeck = context.owner === 'player' ? nextPlayerDeck : nextEnemyDeck;

                if (targetDeck) {
                    // 1. 寻找猎物：从牌库顶往下找，找到第一张符合 Key 的卡牌
                    const foundIndex = targetDeck.findIndex(c => c.key === targetKey);

                    if (foundIndex !== -1) {
                        // 2. 物理提取：用 splice 把它从牌库深处强行挖出来
                        const [tutoredCard] = targetDeck.splice(foundIndex, 1);

                        // 3. 强制置顶：把它塞到牌库的绝对第 0 位
                        targetDeck.unshift(tutoredCard);

                        console.log(`[Tutor] 成功将 ${tutoredCard.name} 从位置 ${foundIndex} 提取并置于牌库顶！`);
                        events.push({ type: 'sfx_tutor', payload: tutoredCard });
                    } else {
                        console.log(`[Tutor] 检索失败：牌库中已没有 ${targetKey}。`);
                    }
                } else {
                    console.warn("[EffectProcessor] TUTOR 失败：未能在上下文中获得牌库的读写权限。");
                }
            }
            break;
        }

        case 'SUMMON': {
            const params = effect.params as EffectParams;

            // =====================================
            // [新增] 伊莉斯充能校验 (Elice Charge Engine)
            // =====================================
            if (params.condition === 'elice_charge_check') {
                // 找到当前施法者本体 (通过 sourceCard)
                const source = context.sourceCard;
                if (!source || (source.customProgress || 0) < 1) {
                    console.log("[Elice] 充能不足，无法召唤机器人。");
                    break; // 充能不足，终止召唤
                }
                // 扣除充能 (我们直接在这里修改 sourceCard 的状态，通过 updateCardInList 同步)
                const chargeUpdater = (c: CardData) => ({ ...c, customProgress: 0 });
                nextPlayerBench = updateCardInList(nextPlayerBench, source.id, chargeUpdater);
                nextEnemyBench = updateCardInList(nextEnemyBench, source.id, chargeUpdater);
            }

            const cardKey = params.summonKey || params.relatedCardKey;
            const zone = params.summonZone || 'bench';

            if (cardKey) {
                const newCard = createCard(cardKey);
                setEliceInitialCharge(newCard);

                // 动态获取当前施法者对应的备战席
                const targetBench = context.owner === 'player' ? nextPlayerBench : nextEnemyBench;

                if (zone === 'combat' && nextCombatField) {
                    // =====================================
                    // [新增] 空降交战区逻辑与“安全气囊”
                    // =====================================
                    // 优先级 1: 降落交战区 (上限 6 人)
                    if (nextCombatField.length < 6) {
                        // [核心包装] 将新卡牌包装成具有攻击意图的战术实体！
                        nextCombatField.push({
                            attacker: { ...newCard, animState: 'idle' }, // 给予攻击状态动画
                            blocker: null,
                            owner: context.owner
                        });
                        events.push({ type: 'summon_combat', payload: newCard });
                    }
                    // 优先级 2 (安全气囊): 交战区已满，退格空降到备战席
                    else if (targetBench.length < 6) {
                        console.log(`[Summon] 交战区已满，${newCard.name} 退格召唤至备战席。`);
                        targetBench.push(newCard);
                        events.push({ type: 'summon', payload: newCard });
                    }
                    // 优先级 3: 全场爆满，召唤失败（灰飞烟灭），什么都不做
                } else {
                    // =====================================
                    // [常规] 传统备战席召唤逻辑
                    // =====================================
                    if (targetBench.length < 6) {
                        targetBench.push(newCard);
                        events.push({ type: 'summon', payload: newCard });
                    }
                }
            }

            break;
        }

        default:
            console.warn(`[EffectProcessor] Unknown effect class: ${effect.class}`);
    }

    // =====================================
    // [核心修复] 万能召唤音效触发器
    // 只要本次结算往队列里塞入了 'summon' 或 'summon_combat' 事件，立刻播放召唤音效！
    // 完美覆盖法术、战吼、回合开始、攻击宣告等所有场景！
    // =====================================
    if (events.some(e => e.type.includes('summon'))) {
        eventBus.emit(GameEvents.SFX_SUMMON);
    }

    return {
        game: nextGame,
        playerBench: nextPlayerBench,
        enemyBench: nextEnemyBench,
        playerHand: nextPlayerHand,
        enemyHand: nextEnemyHand,
        playerDeck: nextPlayerDeck, // [新增]
        enemyDeck: nextEnemyDeck,   // [新增]
        combatField: nextCombatField,
        events
    };
};