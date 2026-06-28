import type { CardData, GameState, Keyword, Race } from '../types'; // [修改] 新增 Keyword 的引入
import { EFFECT_DB } from '../data/effectRegistry';
import { createCard } from '../data/cards';
import { cloneUnitState, accumulateMauxirDamage, isSummonerOrSummon } from '../utils/gameRules'; // [新增] 引入完美复印机与猫汐尔经验收集器
import { eventBus, GameEvents } from '../utils/eventBus';
import { applyFrostbite } from './keywords'; // [新增] 引入绝对零度处理器

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
    summonZone?: 'bench' | 'combat' | 'hand'; // [修改] 增加 hand 选项，支持生成衍生卡到手牌
    summonCount?: number;            // [新增] 生成数量，支持一次性召唤/生成多张
    presenceRequirement?: string[];
    targetKeyRequirement?: string[];
    raceFilter?: Race[];
    // === 👇 新增以下参数，给新机制上户口 ===
    roundEndBuff?: boolean;
    buffCounterKey?: string;
    buffThreshold?: number;
    buffRewardKey?: string;
    excludeSelf?: boolean; // [新增] 是否排除施法者自身（防止鳄鱼奶自己）
    excludeKeys?: string[]; // [新增] 黑名单：按 key 排除目标单位（防止医疗鳄互刷）
    selfDamage?: number;    // [新增] 反噬契约：效果执行后对施法者自身造成 N 点伤害
    condition?: string;
    bonusValue?: number;
    splashAdjacent?: boolean;
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
                const t = context.owner === 'player' ? 'enemy_nexus' : 'player_nexus';
                // [核心修复] 补上 id 参数！如果不传 id，法球组件在全屏索敌时会变成瞎子，导致不发射特效！
                finalTargets.push({ type: t, id: t });
            }
            // 自动填充我方水晶
            else if (req.type === 'PLAYER_NEXUS') {
                const t = context.owner === 'player' ? 'player_nexus' : 'enemy_nexus';
                finalTargets.push({ type: t, id: t });
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

        // [修复] 同时收集交战区中属于己方的单位，防止BUFF法术遗漏战场单位
        if (nextCombatField) {
            nextCombatField.forEach(fight => {
                // 攻击者属于 fight.owner 方
                if (fight.attacker && fight.owner === context.owner) {
                    finalTargets.push({ type: 'ally', id: fight.attacker.id });
                }
                // 阻挡者属于 fight.owner 的对方
                if (fight.blocker && fight.owner !== context.owner) {
                    finalTargets.push({ type: 'ally', id: fight.blocker.id });
                }
            });
        }

        // [2026-06-27 巴德尔试剂] 水晶也纳入治疗范围
        if (effect.params?.targetCondition === 'all_allies_include_nexus') {
            const nexusType = context.owner === 'player' ? 'player_nexus' : 'enemy_nexus';
            finalTargets.push({ type: nexusType, id: nexusType });
        }
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

                // [修复] 直接用 target.type 绝对坐标判断，不再做二次相对转换
                // target.type 在 auto-target 时已被解析为绝对坐标：
                //   'enemy_nexus'  → 永远指敌方阵营的水晶
                //   'player_nexus' → 永远指我方阵营的水晶
                if (target.type === 'enemy_nexus') {
                    nextGame.enemyNexus -= dmg;
                    events.push({ type: 'nexus_damage', payload: { target: 'enemy', amount: dmg } });
                } else if (target.type === 'player_nexus') {
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
                            let nextCard = { ...c };
                            let actualDmg = dmg;

                            // 1. 结算护盾与伤害
                            if (nextCard.keywords.includes('Barrier') && actualDmg > 0) {
                                events.push({ type: 'sfx_shield_break', payload: null });
                                nextCard.depletedKeywords = [...(nextCard.depletedKeywords || []), 'Barrier'];
                                nextCard.animState = 'hit' as const;
                                actualDmg = 0; // 伤害被抵挡
                            }

                            if (actualDmg > 0) {
                                events.push({ type: 'unit_damage', payload: { id: nextCard.id, amount: actualDmg } });
                                nextCard.damageTaken = (nextCard.damageTaken || 0) + actualDmg;
                                nextCard.animState = 'hit' as const;

                                // ==========================================
                                // [新增] 埋点 B-1：猫汐尔经验收集 - 拦截数值炮击
                                // ==========================================
                                if (context.sourceCard && isSummonerOrSummon(context.sourceCard)) {
                                    accumulateMauxirDamage(nextPlayerBench, nextCombatField || [], actualDmg, (newBench) => { nextPlayerBench = newBench; }, nextPlayerHand, (newHand) => { nextPlayerHand = newHand; }, nextPlayerDeck, (newDeck) => { if (newDeck) nextPlayerDeck = newDeck; });
                                }
                            }

                            // 2. [新增] 伴泽而生：条件冻结判定 (原子化拦截)
                            if (effect.params.condition === 'freeze_if_health_equals_1') {
                                const remainingHealth = (nextCard.health || 0) + (nextCard.buffs?.health || 0) - (nextCard.damageTaken || 0);
                                if (remainingHealth === 1) {
                                    // 触发冻结，调用绝对零度处理器
                                    nextCard = applyFrostbite(nextCard);
                                    events.push({ type: 'sfx_buff', payload: null }); // 附加冰冻音效
                                }
                            }

                            return nextCard;
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

                // [核心修复] 法术寻的雷达扩域！同时扫描备战席与交战区！
                const findUnit = (id: string) => {
                    let unit = nextPlayerBench.find(c => c.id === id) || nextEnemyBench.find(c => c.id === id);
                    if (!unit && nextCombatField) {
                        const fight = nextCombatField.find(f => (f.attacker && f.attacker.id === id) || (f.blocker && f.blocker.id === id));
                        if (fight) unit = fight.attacker?.id === id ? fight.attacker : fight.blocker;
                    }
                    return unit;
                };

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

                            // 法术单挑：屏障抵挡伤害后从关键词移除
                            const hasActiveBarrier = c.keywords.includes('Barrier');
                            if (hasActiveBarrier && finalDmg > 0) {
                                events.push({ type: 'sfx_shield_break', payload: null });
                                finalDmg = 0; // 伤害被抵挡
                            }

                            // [致命 Bug 修复] 绝不减 c.health，只累加 damageTaken
                            let newDamageTaken = (c.damageTaken || 0) + finalDmg;
                            if (finalDmg > 0) {
                                events.push({ type: 'unit_damage', payload: { id: c.id, amount: finalDmg } });

                                // ==========================================
                                // [新增] 埋点 B-2：猫汐尔经验收集 - 拦截法术单挑
                                // ==========================================
                                // 在单挑中，如果该法术的施法者(打出这张法术牌的人，通常是英雄本身或随从) 是召唤系，计入经验。
                                // (注意：这里追踪的是法术的来源，而不是参与单挑的两个受害者的种族。这符合LOR等游戏的通用规则：谁打出的法术，谁就是伤害来源。)
                                if (context.sourceCard && isSummonerOrSummon(context.sourceCard)) {
                                    accumulateMauxirDamage(nextPlayerBench, nextCombatField || [], finalDmg, (newBench) => { nextPlayerBench = newBench; }, nextPlayerHand, (newHand) => { nextPlayerHand = newHand; }, nextPlayerDeck, (newDeck) => { if (newDeck) nextPlayerDeck = newDeck; });
                                }
                            }

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

                            // [核心修复] 补回丢失的打击计数账本！
                            // 只要该单位在法术中挥出了武器 (didStrike)，就必须记入总打击数 (strikeCount) 和 本回合打击数 (roundStrikes)！
                            return {
                                ...c,
                                keywords: hasActiveBarrier ? c.keywords.filter((k: string) => k !== 'Barrier') : c.keywords,
                                damageTaken: newDamageTaken,
                                animState: 'hit' as const,
                                strikeCount: didStrike ? (c.strikeCount || 0) + 1 : (c.strikeCount || 0),
                                roundStrikes: didStrike ? (c.roundStrikes || 0) + 1 : (c.roundStrikes || 0)
                            };
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
                // [2026-06-27 buffTag] 如果目标有 buffRules，过滤不匹配的攻 Buff
                if (params.buffTag && (c as any).buffRules?.power?.allowedTags) {
                    if (!(c as any).buffRules.power.allowedTags.includes(params.buffTag)) {
                        actualP = 0;
                    }
                }

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
                    // [核心重构] 彻底实现表里分离！永久归永久，临时归临时！
                    buffs: {
                        power: (c.buffs?.power || 0) + (duration === 'PERMANENT' ? actualP : 0),
                        health: (c.buffs?.health || 0) + (duration === 'PERMANENT' ? h : 0)
                    },
                    roundBuffs: {
                        power: (c.roundBuffs?.power || 0) + (duration === 'ROUND' ? actualP : 0),
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

            let successfullyBuffedCount = 0; // [新增] 记账本：记录本次到底成功 BUFF 了多少个单位

            finalTargets.forEach(target => {
                if (!target.id) return; // BUFF 只能给单位，不能给水晶

                let wasBuffed = false; // [新增] 标记当前目标是否真的吃到了 BUFF

                // [修改] 车间调度员：显式声明返回值，并将原料卡送进两条流水线
                const applyBuff = (c: CardData): CardData => {
                    // =====================================
                    // [新增] 避嫌机制：如果法术要求排除施法者，直接跳过！
                    // =====================================
                    if (params.excludeSelf && context.sourceCard && c.id === context.sourceCard.id) {
                        return c;
                    }

                    // =====================================
                    // [新增] 黑名单机制：如果目标单位的 key 命中了排除列表，直接原样退回！
                    // =====================================
                    if (params.excludeKeys && params.excludeKeys.some(k => c.key.includes(k))) {
                        return c;
                    }

                    // =====================================
                    // [新增] 专属发牌过滤：如果设定了白名单，核对身份证！
                    // =====================================
                    if (params.targetKeyRequirement && params.targetKeyRequirement.length > 0) {
                        const isAuthorized = params.targetKeyRequirement.some(reqKey => c.key.includes(reqKey));
                        if (!isAuthorized) return c; // 身份不符，原样退回，不发 Buff 也不亮高光
                    }

                    // =====================================
                    // [新增] 种族过滤：只有目标种族匹配才发 Buff
                    // =====================================
                    if (params.raceFilter && params.raceFilter.length > 0) {
                        const isAuthorized = c.race && c.race.some(r => params.raceFilter?.includes(r));
                        if (!isAuthorized) return c; // 种族不符，不发 Buff
                    }

                    wasBuffed = true; // [新增] 走到这里说明安检全过，确实吃到了 BUFF

                    let processed = { ...c };

                    processed = applyStats(processed, power, health);

                    // [核心修复] 拦截冻结词条，将其移交给绝对零度引擎处理动态对冲逻辑！
                    if (keywords.includes('Frostbite')) {
                        // 先贴上可能存在的其他普通词条
                        const otherKeywords = keywords.filter(k => k !== 'Frostbite');
                        processed = applyKeywords(processed, otherKeywords);
                        // 再执行攻击力清零对冲
                        processed = applyFrostbite(processed);
                    } else {
                        processed = applyKeywords(processed, keywords);
                    }

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

                // [新增] 核实当前目标是否被 BUFF，计入总账
                if (wasBuffed) {
                    successfullyBuffedCount++;
                }
            });

            // =====================================
            // [核心新增] 结算 BUFF 计数器与发奖机制 (如：清泉医疗鳄产出无人机)
            // =====================================
            if (successfullyBuffedCount > 0 && context.sourceCard) {
                const counterKey = params.buffCounterKey;

                // 1. 如果字典里配置了计数器，且施法者刚好是这把计数器的持有者
                if (counterKey && context.sourceCard.key === counterKey) {
                    const threshold = params.buffThreshold || 5;
                    const rewardKey = params.buffRewardKey;
                    const sourceId = context.sourceCard.id;

                    const updateProgressAndReward = (c: CardData) => {
                        const newProgress = (c.customProgress || 0) + successfullyBuffedCount;
                        if (newProgress >= threshold) {
                            // 发放奖励 (生成卡牌推入手牌)
                            if (rewardKey) {
                                const newRewardCard = {
                                    ...createCard(rewardKey),
                                    id: Math.random().toString(36).substr(2, 9),
                                    animState: 'idle' as const,
                                    damageTaken: 0,
                                    buffs: { power: 0, health: 0 },
                                    roundBuffs: { power: 0, health: 0 },
                                    keywords: []
                                } as CardData;
                                setEliceInitialCharge(newRewardCard); // 沿用原本的充能器安检

                                if (context.owner === 'player' && nextPlayerHand.length < 10) {
                                    nextPlayerHand.push(newRewardCard);
                                } else if (context.owner === 'enemy' && nextEnemyHand.length < 10) {
                                    nextEnemyHand.push(newRewardCard);
                                }
                            }
                            return { ...c, customProgress: newProgress % threshold }; // 溢出补偿机制
                        }
                        return { ...c, customProgress: newProgress };
                    };

                    // 回写进度到施法者身上
                    if (context.owner === 'player') {
                        nextPlayerBench = updateCardInList(nextPlayerBench, sourceId, updateProgressAndReward);
                    } else {
                        nextEnemyBench = updateCardInList(nextEnemyBench, sourceId, updateProgressAndReward);
                    }
                }

                // 2. 猫汐尔的全域经验追踪：我方的召唤系卡牌进行了群体 BUFF，计入经验！
                // 这完美衔接了我们刚刚给 accumulateMauxirDamage 设计的 Everywhere 全域广播入参！
                if (context.owner === 'player' && isSummonerOrSummon(context.sourceCard)) {
                    accumulateMauxirDamage(
                        nextPlayerBench, nextCombatField || [], successfullyBuffedCount,
                        (newBench) => { nextPlayerBench = newBench; },
                        nextPlayerHand, (newHand) => { nextPlayerHand = newHand; },
                        nextPlayerDeck, (newDeck) => { if (newDeck) nextPlayerDeck = newDeck; }
                    );
                }
            }

            // =====================================
            // [新增] 血魔法反噬：效果执行完毕后，要求施法者支付设定的生命代价
            // =====================================
            if (params.selfDamage && context.sourceCard) {
                const dmgAmount = params.selfDamage;
                const sourceId = context.sourceCard.id;

                const applySelfHarm = (c: CardData): CardData => {
                    events.push({ type: 'unit_damage', payload: { id: c.id, amount: dmgAmount } });
                    return {
                        ...c,
                        damageTaken: (c.damageTaken || 0) + dmgAmount,
                        animState: 'hit' as const // 触发受击红闪动画
                    };
                };

                if (context.owner === 'player') {
                    nextPlayerBench = updateCardInList(nextPlayerBench, sourceId, applySelfHarm);
                } else {
                    nextEnemyBench = updateCardInList(nextEnemyBench, sourceId, applySelfHarm);
                }

                // 顺藤摸瓜：如果施法者（虽然极少见）当前处于交战区，同步更新！
                if (nextCombatField) {
                    nextCombatField = nextCombatField.map(fight => {
                        let newFight = { ...fight };
                        if (newFight.owner === context.owner) {
                            if (newFight.attacker.id === sourceId) newFight.attacker = applySelfHarm(newFight.attacker);
                        } else {
                            if (newFight.blocker && newFight.blocker.id === sourceId) newFight.blocker = applySelfHarm(newFight.blocker);
                        }
                        return newFight;
                    });
                }
            }

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
        // [2026-06-27 能量补充] 支持动态检索：按选中的天启者搜重复英雄 → 支援法术
        // =====================================
        case 'TUTOR': {
            const params = effect.params as EffectParams;
            let targetKey = params.summonKey; // 优先使用预设的静态检索目标

            // 动态检索：按优先级搜索重复天启者 → 支援法术 → 抉择法术
            if (!targetKey && finalTargets.length > 0) {
                const selectedId = finalTargets[0].id;
                // 遍历己方备战席和交战区，找到选中的天启者
                const allyBench = context.owner === 'player' ? nextPlayerBench : nextEnemyBench;
                const selectedChampion = allyBench.find(c => c.id === selectedId)
                    || (nextCombatField ? nextCombatField.reduce((found, fight) => {
                        if (found) return found;
                        if (fight.attacker && fight.attacker.id === selectedId) return fight.attacker;
                        if (fight.blocker && fight.blocker.id === selectedId) return fight.blocker;
                        return null;
                    }, null) : null);

                if (selectedChampion) {
                    const championKey = selectedChampion.key;
                    const targetDeck = context.owner === 'player' ? nextPlayerDeck : nextEnemyDeck;

                    if (targetDeck) {
                        // 🥇 搜牌库中同名的重复天启者
                        const championIdx = targetDeck.findIndex(c => c.key === championKey && c.isChampion);
                        if (championIdx !== -1) {
                            targetKey = championKey;
                            console.log(`[Tutor] 动态检索：找到重复天启者 ${championKey}`);
                        }

                        // 🥈 没找到重复天启者，改搜支援法术
                        if (!targetKey) {
                            const supportKey = championKey + '_support';
                            const supportIdx = targetDeck.findIndex(c => c.key === supportKey);
                            if (supportIdx !== -1) {
                                targetKey = supportKey;
                                console.log(`[Tutor] 动态检索：找到支援法术 ${supportKey}`);
                            }
                        }

                        // 🥉 还没找到，改搜天启者抉择法术
                        if (!targetKey && selectedChampion.associatedSpellKey) {
                            const spellIdx = targetDeck.findIndex(c => c.key === selectedChampion.associatedSpellKey);
                            if (spellIdx !== -1) {
                                targetKey = selectedChampion.associatedSpellKey;
                                console.log(`[Tutor] 动态检索：找到抉择法术 ${selectedChampion.associatedSpellKey}`);
                            }
                        }

                        if (!targetKey) {
                            console.warn(`[Tutor] 动态检索失败：牌库中没有${championKey}的重复天启者、支援法术或抉择法术`);
                        }
                    } else {
                        console.warn("[Tutor] 动态检索失败：未能在上下文中获得牌库的读写权限。");
                    }
                } else {
                    console.warn("[Tutor] 动态检索失败：未在场上找到选中的天启者");
                }
            }
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
            // [新增] 千莲叠绽——条件分支：格挡替换 vs 召唤
            // =====================================
            if (effect.id === 'effect_mauxir_lotus_rush') {
                // 检测己方猫汐尔是否在格挡（交战区 blocker 位置）
                const isBlocking = nextCombatField?.some(f =>
                    f.blocker?.key === 'mauxir_lotus_drive' && f.owner !== context.owner
                );

                if (isBlocking && nextCombatField) {
                    // --- 格挡模式：与目标基座调换位置 ---
                    const target = finalTargets[0];
                    if (!target || !target.id) break; // 没有选择目标，法术无法执行

                    const bench = context.owner === 'player' ? nextPlayerBench : nextEnemyBench;
                    const pedIndex = bench.findIndex(c => c.id === target.id);
                    if (pedIndex === -1) break; // 目标不在备战席，终止

                    const pedestal = bench[pedIndex];
                    if (pedestal.key !== 'mauxir_lotus_pedestal') break; // 目标不是基座，终止

                    // 从备战席移除基座
                    const newBench = [...bench];
                    newBench.splice(pedIndex, 1);

                    // 找到格挡中的猫汐尔
                    const fightIndex = nextCombatField.findIndex(f =>
                        f.blocker?.key === 'mauxir_lotus_drive' && f.owner !== context.owner
                    );
                    if (fightIndex === -1) break;

                    const fight = nextCombatField[fightIndex];
                    const cat = fight.blocker;

                     const buffedPedestal = {
                            ...pedestal,
                            buffs: {
                                        ...(pedestal.buffs || {}),
                                        health: (pedestal.buffs?.health || 0) + 2
                                    }
                     };
                    // 互换位置：猫汐尔回备战席，基座代替格挡
                    newBench.push({ ...cat, animState: 'idle' as const });
                    nextCombatField[fightIndex] = {
                        ...fight,
                        blocker: { ...buffedPedestal, animState: 'idle' as const }
                    };

                    // 写回备战席
                    if (context.owner === 'player') {
                        nextPlayerBench = newBench;
                    } else {
                        nextEnemyBench = newBench;
                    }

                    events.push({ type: 'sfx_recall_block', payload: null });
                    break; // 跳出 SUMMON，不执行召唤
                }
                // 未格挡 → 穿透到下面的正常 SUMMON 逻辑
            }

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
            const count = params.summonCount || 1; // [新增] 提取召唤数量，默认为 1

            if (cardKey) {
                // [新增] 开启循环，支持生成多张卡牌
                for (let i = 0; i < count; i++) {
                    let newCard = createCard(cardKey);
                    setEliceInitialCharge(newCard);

                    // =====================================
                    // [全域光环安检] 确保新召唤的单位不会错失之前贴过的 Everywhere Buff
                    // [2026-06-27 巴德尔试剂] 增加 owner 匹配，只继承己方光环
                    // =====================================
                    const globalAuras = (nextGame as any).everywhereBuffs || [];
                    globalAuras.forEach((aura: any) => {
                        if (aura.owner && aura.owner !== context.owner) return; // 不是己方的光环跳过
                        if (aura.targetKeyRequirement && aura.targetKeyRequirement.some((req: string) => newCard.key.includes(req))) {
                            newCard.buffs = {
                                power: (newCard.buffs?.power || 0) + (aura.power || 0),
                                health: (newCard.buffs?.health || 0) + (aura.health || 0)
                            };
                            newCard.keywords = Array.from(new Set([...newCard.keywords, ...(aura.keywords || [])]));
                        }
                    });

                    // 动态获取当前施法者对应的备战席和手牌
                    const targetBench = context.owner === 'player' ? nextPlayerBench : nextEnemyBench;
                    const targetHand = context.owner === 'player' ? nextPlayerHand : nextEnemyHand;

                    if (zone === 'hand') {
                        // =====================================
                        // [新增] 生成入手牌逻辑
                        // =====================================
                        if (targetHand.length < 10) {
                            targetHand.push(newCard);
                            events.push({ type: 'summon', payload: newCard }); // 复用召唤音效作为入牌音效
                        } else {
                            console.log(`[Summon] 手牌已满，无法将 ${newCard.name} 加入手牌。`);
                        }
                    } else if (zone === 'combat' && nextCombatField) {
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
            }

            break;
        }

        // =====================================
        // [新增] 机制 6：治疗 (HEAL)
        // =====================================
        case 'HEAL': {
            const amount = effect.params.value || 0;
            if (amount <= 0) break;

            const NEXUS_MAX_HP = 20;

            finalTargets.forEach(target => {
                // [2026-06-27 生机补充] 支持治疗水晶
                if (target.type === 'player_nexus' || target.type === 'enemy_nexus') {
                    const isPlayer = target.type === 'player_nexus';
                    const currentHP = isPlayer ? nextGame.playerNexus : nextGame.enemyNexus;
                    const actualHeal = Math.min(NEXUS_MAX_HP - currentHP, amount);

                    if (actualHeal > 0) {
                        if (isPlayer) {
                            nextGame.playerNexus += actualHeal;
                        } else {
                            nextGame.enemyNexus += actualHeal;
                        }
                        events.push({ type: 'nexus_heal', payload: { target: isPlayer ? 'player' : 'enemy', amount: actualHeal } });
                        console.log(`[HEAL] 治疗水晶 ${isPlayer ? 'player' : 'enemy'} +${actualHeal} (${currentHP} → ${isPlayer ? nextGame.playerNexus : nextGame.enemyNexus})`);
                    }
                    return;
                }

                if (!target.id) return; // 只能治疗单位

                const applyHeal = (c: CardData): CardData => {
                    const currentDamage = c.damageTaken || 0;
                    const actualHeal = Math.min(currentDamage, amount);

                    if (actualHeal > 0) {
                        // 发送独立的治疗飘字事件 (UI 层可监听渲染绿字)
                        events.push({ type: 'unit_heal', payload: { id: c.id, amount: actualHeal } });
                    }

                    return {
                        ...c,
                        // 精准扣减，下限为 0，绝对不会出现负数受伤
                        damageTaken: Math.max(0, currentDamage - amount),
                        animState: 'buff' as const // 借用 buff 的绿色光晕动画
                    };
                };

                nextPlayerBench = updateCardInList(nextPlayerBench, target.id, applyHeal);
                nextEnemyBench = updateCardInList(nextEnemyBench, target.id, applyHeal);

                if (nextCombatField) {
                    nextCombatField = nextCombatField.map(fight => {
                        let newFight = { ...fight };
                        if (newFight.attacker && newFight.attacker.id === target.id) {
                            newFight.attacker = applyHeal(newFight.attacker);
                        }
                        if (newFight.blocker && newFight.blocker.id === target.id) {
                            newFight.blocker = applyHeal(newFight.blocker);
                        }
                        return newFight;
                    });
                }
            });

            // 播放治疗音效
            events.push({ type: 'sfx_heal', payload: null });
            break;
        }

        // =====================================
        // [新增] 机制 7：全域光环 (BUFF_EVERYWHERE)
        // =====================================
        case 'BUFF_EVERYWHERE': {
            const params = effect.params as EffectParams;
            const power = params.power || 0;
            const health = params.health || 0;
            const keywords = params.keywords || [];
            const reqKeys = params.targetKeyRequirement || [];
            const isOwnerBuff = params.ownerSide ?? true; // [2026-06-27] 默认只 Buff 己方

            const applyEverywhereBuff = (c: CardData): CardData => {
                // 核对身份，只有符合白名单的单位才能吃到光环
                // [2026-06-27 buffTag] 如果目标有 buffRules，过滤不匹配的攻 Buff
                let ewPower = power;
                if (params.buffTag && (c as any).buffRules?.power?.allowedTags) {
                    if (!(c as any).buffRules.power.allowedTags.includes(params.buffTag)) {
                        ewPower = 0;
                    }
                }
                if (reqKeys.length > 0 && !reqKeys.some(req => c.key.includes(req))) return c;
                return {
                    ...c,
                    buffs: {
                        power: (c.buffs?.power || 0) + ewPower,
                        health: (c.buffs?.health || 0) + health
                    },
                    keywords: Array.from(new Set([...c.keywords, ...keywords])),
                    animState: 'buff' as const // 触发一次发光动画
                };
            };

            // [2026-06-27 巴德尔试剂] 按 owner 过滤，只 Buff 己方单位
            // 1. 扫荡场上 (备战席 + 交战区)——只 Buff 己方
            if (isOwnerBuff) {
                const myBench = context.owner === 'player' ? nextPlayerBench : nextEnemyBench;
                myBench.forEach((c, i) => {
                    const buffed = applyEverywhereBuff(c);
                    if (context.owner === 'player') nextPlayerBench[i] = buffed;
                    else nextEnemyBench[i] = buffed;
                });
                if (nextCombatField) {
                    nextCombatField = nextCombatField.map(fight => {
                        let newFight = { ...fight };
                        if (fight.owner === context.owner) {
                            newFight.attacker = applyEverywhereBuff(fight.attacker);
                        }
                        if (fight.owner !== context.owner && fight.blocker) {
                            newFight.blocker = applyEverywhereBuff(fight.blocker);
                        }
                        return newFight;
                    });
                }
            } else {
                // 旧行为：双方都 Buff（保留给需要全局光环的场景）
                nextPlayerBench = nextPlayerBench.map(applyEverywhereBuff);
                nextEnemyBench = nextEnemyBench.map(applyEverywhereBuff);
                if (nextCombatField) {
                    nextCombatField = nextCombatField.map(fight => ({
                        ...fight,
                        attacker: applyEverywhereBuff(fight.attacker),
                        blocker: fight.blocker ? applyEverywhereBuff(fight.blocker) : null
                    }));
                }
            }

            // 2. 扫荡手牌——只有 everywhere 标记才影响手牌/牌库
            if (params.everywhere) {
                if (context.owner === 'player') {
                    nextPlayerHand = nextPlayerHand.map(applyEverywhereBuff);
                } else {
                    nextEnemyHand = nextEnemyHand.map(applyEverywhereBuff);
                }
            }

            // 3. 扫荡牌库——只有 everywhere 标记才影响牌库
            if (params.everywhere) {
                if (context.owner === 'player') {
                    if (nextPlayerDeck) nextPlayerDeck = nextPlayerDeck.map(applyEverywhereBuff);
                } else {
                    if (nextEnemyDeck) nextEnemyDeck = nextEnemyDeck.map(applyEverywhereBuff);
                }
            }

            // 4. [核心] 记入全局光环账本，只记录真正"各处"生效的 Buff
            if (params.everywhere) {
                nextGame = {
                    ...nextGame,
                    everywhereBuffs: [
                        ...((nextGame as any).everywhereBuffs || []),
                        { power, health, keywords, targetKeyRequirement: reqKeys, owner: context.owner }
                    ]
                } as GameState;
            }

            events.push({ type: 'sfx_buff', payload: null });
            break;
        }

        // =====================================
        // [新增] 机制 8：撤回并替身替换 (RECALL_AND_REPLACE)
        // =====================================
        case 'RECALL_AND_REPLACE': {
            const target = finalTargets[0];
            if (!target || !target.id) break;

            const params = effect.params as EffectParams;
            const summonKey = params.summonKey;

            if (!summonKey) {
                console.warn("[EffectProcessor] RECALL_AND_REPLACE 缺少 summonKey");
                break;
            }

            if (nextCombatField) {
                const combatIdx = nextCombatField.findIndex(f => f.attacker?.id === target.id || f.blocker?.id === target.id);
                if (combatIdx !== -1) {
                    const fight = nextCombatField[combatIdx];
                    const isAttacker = fight.attacker?.id === target.id;
                    const recalledUnit = isAttacker ? fight.attacker! : fight.blocker!;

                    // 1. 生成替身 (如: 镜爻)
                    let mirrorCard = createCard(summonKey);
                    mirrorCard.animState = 'idle';

                    // [全域光环安检] 替身落地，检查是否有它的光环
                    // [2026-06-27 巴德尔试剂] 增加 owner 匹配，只继承己方光环
                    const globalAuras = (nextGame as any).everywhereBuffs || [];
                    globalAuras.forEach((aura: any) => {
                        if (aura.owner && aura.owner !== context.owner) return; // 不是己方的光环跳过
                        if (aura.targetKeyRequirement && aura.targetKeyRequirement.some((req: string) => mirrorCard.key.includes(req))) {
                            mirrorCard.buffs = {
                                power: (mirrorCard.buffs?.power || 0) + (aura.power || 0),
                                health: (mirrorCard.buffs?.health || 0) + (aura.health || 0)
                            };
                            mirrorCard.keywords = Array.from(new Set([...mirrorCard.keywords, ...(aura.keywords || [])]));
                        }
                    });

                    // 2. 剥离旧单位，并原地塞入替身 (完全继承原本的攻防位置)
                    if (isAttacker) {
                        nextCombatField[combatIdx] = { ...fight, attacker: mirrorCard };
                    } else {
                        nextCombatField[combatIdx] = { ...fight, blocker: mirrorCard };
                    }

                    // 3. 将被撤回的旧单位洗除战斗状态，安全放回备战席
                    const safeRecalledUnit = { ...recalledUnit, animState: 'idle' as const };
                    const bench = context.owner === 'player' ? nextPlayerBench : nextEnemyBench;
                    bench.push(safeRecalledUnit);

                    events.push({ type: 'sfx_recall_block', payload: null });
                    events.push({ type: 'summon_combat', payload: mirrorCard });
                    break;
                }
            }
            break;
        }

        // =====================================
        // [新增] 机制 9：弃牌 (DISCARD)
        // [2026-06-27 暗箱操作] 从手牌移除选中卡牌
        // =====================================
        case 'DISCARD': {
            if (finalTargets.length > 0) {
                const discardId = finalTargets[0].id;
                if (context.owner === 'player') {
                    nextPlayerHand = nextPlayerHand.filter(c => c.id !== discardId);
                } else {
                    nextEnemyHand = nextEnemyHand.filter(c => c.id !== discardId);
                }
                events.push({ type: 'sfx_discard', payload: { id: discardId } });
                console.log(`[Discard] 已丢弃手牌 ${discardId}`);
            } else {
                console.warn("[Discard] 没有指定要丢弃的手牌目标");
            }
            break;
        }

        // =====================================
        // [新增] 机制 10：抽牌 (DRAW)
        // [2026-06-27 暗箱操作] 从牌库抽 N 张到手上
        // =====================================
        case 'DRAW': {
            const drawCount = effect.params.value || 1;
            const deck = context.owner === 'player' ? nextPlayerDeck : nextEnemyDeck;
            const HAND_MAX = 10;

            if (!deck) { console.warn("[Draw] 无牌库引用，无法抽牌"); break; }

            const ownerHand = context.owner === 'player' ? nextPlayerHand : nextEnemyHand;

            for (let i = 0; i < drawCount; i++) {
                if (deck.length === 0) {
                    console.log(`[Draw] 牌库已空，无法继续抽牌`);
                    events.push({ type: 'sfx_draw_fatigue', payload: null });
                    break;
                }
                if (ownerHand.length >= HAND_MAX) {
                    const burnedCard = deck.shift()!;
                    console.log(`[Draw] 手牌已满 ${HAND_MAX} 张，${burnedCard.name} 被爆牌销毁`);
                    events.push({ type: 'sfx_draw_burn', payload: burnedCard });
                    continue;
                }
                const drawnCard = deck.shift()!;
                ownerHand.push(drawnCard);
                events.push({ type: 'sfx_draw', payload: drawnCard });
                console.log(`[Draw] 抽到 ${drawnCard.name}`);
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
    const summonEvent = events.find(e => e.type.includes('summon'));
     if (summonEvent) {
          const summonedKey = (summonEvent.payload as any)?.key;
          if (summonedKey === 'mauxir_lotus_pedestal') {
              eventBus.emit(GameEvents.SFX_MAUXIR_SUMMON);
          } else {
              eventBus.emit(GameEvents.SFX_SUMMON);
          }
    }

    // [2026-06-27 maxPerSide] 收束：检查双方备战席，超出上限的卡牌被拦截
    const enforceMaxPerSide = (bench: CardData[]): CardData[] => {
        const counts = new Map<string, number>();
        return bench.filter(c => {
            const max = c.maxPerSide;
            if (!max) return true;
            const current = counts.get(c.key) || 0;
            if (current >= max) {
                console.log(`[maxPerSide] ${c.name} 已达场上限 ${max}，已拦截`);
                return false;
            }
            counts.set(c.key, current + 1);
            return true;
        });
    };
    nextPlayerBench = enforceMaxPerSide(nextPlayerBench);
    nextEnemyBench = enforceMaxPerSide(nextEnemyBench);

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