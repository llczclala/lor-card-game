import type { CardData, GameState, Keyword, Race } from '../types'; // [修改] 新增 Keyword 的引入
import { EFFECT_DB } from '../data/effectRegistry';
import { createCard, CARD_DB } from '../data/cards';
import { cloneUnitState, accumulateMauxirDamage, isSummonerOrSummon, buffTopUnitInDeck, buffAllUnitsInDeck, getLeveledUpCard, upgradeAcaciaHand, demoteAcaciaHand, markLeveledUp, unmarkLeveledUp, assembleBeaconCard } from '../utils/gameRules'; // [新增] 引入牌库BUFF · [2026-09-19] 引入信标落场装配器
import { eventBus, GameEvents } from '../utils/eventBus';
import { nextAnimId } from '../utils/animId'; // [2026-09-04 莉莉子] 全局唯一动画 ID（替代 Date.now()，修抽卡动画 key 撞车）
import { applyFrostbite, getPower, getHealth, executeTitanPulse, deadlyLethalInject } from './keywords'; // [新增] 引入绝对零度处理器 & 真实攻击力/血量函数 & 泰坦脉冲 & [2026-09-12 莉莉子 剧毒] 擦伤即解构判定
import { applyStrikeEnhancement, isStrikeTargetAlive, findStrongestUnit } from './rogueBattle'; // [2026-08-30 莉莉子] after_attack/after_attacked 强化（单挑互打也算打击）· [2026-09-15] isStrikeTargetAlive 存活判据 · [2026-09-17 松露小队] findStrongestUnit（通用纯函数，非迷宫专用）

// ==========================================
// [2026-08-15 莉莉子] 泰坦降临·预算均衡拆分（程重定义设计）
// 把燃尽值（费用预算）随机拆成一组泰坦费用块，满足：
//   ① 总费用 恒 = budget（预算）
//   ② 块数 ≤ maxCount（场上空位兜底）
//   ③ 偏向均衡：平均单块费用接近 targetAvg(2.5) 的组合权重更高
//      （2+2 / 1+3 这类中间态更常出，4×1 或单个大费这类极端组合概率低）
// 例：预算2 → [1,1] 或 [2]；预算4 → [1,1,1,1] / [2,2] / [1,3] / [4] 等
// ==========================================
const buildBalancedBurnoutSplit = (budget: number, maxCount: number, availCosts: number[]): number[] => {
    if (budget <= 0 || maxCount <= 0 || availCosts.length === 0) return [];
    const maxCost = Math.max(...availCosts);
    const splits: number[][] = [];
    const backtrack = (remaining: number, parts: number[], minIdx: number) => {
        if (remaining === 0) { splits.push([...parts]); return; }
        if (parts.length >= maxCount) return;
        for (let i = minIdx; i < availCosts.length; i++) {
            const c = availCosts[i];
            if (c > remaining) continue;
            const remainParts = maxCount - parts.length - 1;
            if (remaining - c > remainParts * maxCost) continue; // 剩余块容量不够
            parts.push(c);
            backtrack(remaining - c, parts, i);
            parts.pop();
        }
    };
    backtrack(budget, [], 0);
    if (splits.length === 0) return [];
    // 偏向均衡：平均单块费用接近 targetAvg 的组合权重更高（高斯加权）
    const targetAvg = 2.5;
    const sigma = 0.9;
    const weights = splits.map(s => {
        const avg = budget / s.length;
        const d = (avg - targetAvg) / sigma;
        return Math.exp(-d * d);
    });
    const total = weights.reduce((a, b) => a + b, 0);
    let roll = Math.random() * total;
    for (let i = 0; i < splits.length; i++) {
        roll -= weights[i];
        if (roll <= 0) return splits[i];
    }
    return splits[splits.length - 1];
};

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
    summonSide?: 'self' | 'opponent'; // [2026-09-16 茉莉安] 召唤落点的阵营：'self' 己方（默认）/ 'opponent' 落到对方半场（獠牙信标）
    gameStartSummon?: string;         // [2026-09-16 茉莉安] ④【库效】对局开始：召唤该 Key 落场（只触发一次）
    spreadDamageTotal?: number;       // [2026-09-16 茉莉安] SPREAD_DAMAGE：对己方全体分摊的总伤害量
    summonOnlyIfAbsent?: boolean;     // [2026-09-16 茉莉安] SUMMON：落点已有同名单位则不召唤（信标「最多 1 个」）
    entryVoucher?: boolean;           // [2026-09-19 T44 茉莉安] SUMMON：本次入场发放一张「补兵券」（信标被击败时兑现）
    damageBeaconBy?: number;          // [2026-09-16 茉莉安] 钢羽傍身：对獠牙信标造成 N 点伤害（来源=法术卡本身）
    damageBeaconSide?: 'both' | 'opponent'; // [2026-09-17 松露小队] 限定只打【对面】的信标（缺省 'both' 保持钢羽傍身的历史行为）
    damageBeaconBySelfPower?: boolean;  // [2026-09-17 松露小队 · 流萤] 伤害取「施法者自身当前攻击力」，覆盖 damageBeaconBy 的静态值
    summonCountPerExposedEnemy?: number; // [2026-09-17 松露小队 · 榆] 动态召唤数：每有一个【暴露】的敌人召唤一个，本值 = 上限
    gameStartSummonSide?: 'self' | 'opponent'; // [2026-09-16 茉莉安] 落点阵营：缺省 'self'；'opponent' = 落到对方半场（獠牙信标）
                                      // ⚠️ 本接口与 effectRegistry.ts:80 的同名接口是【两份独立定义】，已分叉。
                                      //    新增字段需【两边同步补】，否则数据侧能写、消费侧 TS 报错。
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
    // [2026-07-14 锻造者] 法术增伤与手牌召唤参数
    spellDamageBuff?: number;    // 法术增伤光环数值
    triggerOnPlay?: boolean;     // 从手牌召唤时是否触发入场效果
    cardTypeFilter?: 'unit' | 'spell'; // 手牌选择过滤
    // [2026-08-05 莉莉子] 燃尽召唤 / 无效化参数
    useBurnout?: boolean;        // 燃尽：消耗全部法力后按燃尽值召唤泰坦（法术12）
    negateAllEnemies?: boolean;  // NEGATE：无效化堆叠中所有敌方法术（法术8）
    stackCostBelow?: number;     // SPELL_ON_STACK 目标费用上限（不含，法术6）
    stackSpeedFilter?: string[]; // SPELL_ON_STACK 目标速度白名单（法术6/7）
    // [2026-08-06 莉莉子] 接口字段补齐：历史效果新增参数统一登记
    generateKey?: string;        // 生成卡牌 Key
    placeOnTop?: boolean;        // 检索/生成目标放牌库顶
    maxCost?: number;            // 费用上限过滤
    sacrificeValue?: number;     // 献祭/自损数值
    targetAllUnits?: boolean;    // 全场单位 AOE（含双方）
    targetAllAllies?: boolean;   // 全体友方
    targetAllEnemies?: boolean;  // 全体敌方
    enlightenOverwhelm?: boolean; // [2026-09-23 莉莉子] targetAllEnemies 路径的「觉悟·全场碾压」开关；缺省=开（巨偶一瞥原行为），显式 false 关闭
    targetCombatOnly?: boolean;  // 仅交战区
    targetEnemyNexus?: boolean;  // 目标敌方水晶
    targetFilter?: string;       // 目标过滤暗号
    allAlliesBuff?: { power?: number; health?: number };     // 全体友方增益
    allEnemiesDebuff?: { power?: number; health?: number };  // 全体敌方削弱
    ownerSide?: boolean;         // Buff 侧别（默认己方）
    buffTag?: string;            // Buff 标签
    everywhere?: boolean;        // 各处传染
    removeKeywords?: string[];   // 移除关键词
    returnToHand?: boolean;      // 撤回回手牌
    freezeAllEnemies?: boolean;  // 冻结全体敌方
    calibrateCount?: number;     // 校准选牌数量
    count?: number;              // 通用数量
    targetType?: string;         // 目标类型
    grantMaxMana?: boolean;      // 授予最大法力
    useDiscardCount?: boolean;   // 亡语弃牌计数
    reduceCostIfDuplicate?: boolean; // 手牌重复减费
    nexusFallback?: boolean;     // 无合法目标时回退水晶
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
/**
 * [2026-09-19 BUG修复] 把效果产出的内部事件转发到游戏总线
 *
 * ── 病根：`unit_damage` / `nexus_damage` 是 effectProcessor 塞进 `events` 数组的**内部事件**，
 *    必须由**调用方**转发上总线（飘字、受击音都靠它）。
 *    而全项目**只有 spells.ts 一个调用方做了转发** ✗
 *    ⇒ 非法术来源的伤害（入场效果 / 回合开始 / 打击水晶触发 / 亡语…）**既没飘字也没受击音**。
 *    （程实测：夜视监察无人机、茉莉安狙击打信标时，信标掉血无声）
 *
 * ── 各调用方在处理自己的动画事件之后调一下本函数即可，**不要各抄一遍**。
 * ⚠️ spells.ts 不用调（它自己转发 + 另有 triggerShake，调了会重复）。
 */
export const relayEffectEvents = (events: { type: string; payload?: any }[] | undefined): void => {
    (events || []).forEach(e => {
        if (e.type === 'unit_damage') eventBus.emit('unit_damage', e.payload);
        else if (e.type === 'nexus_damage') eventBus.emit(GameEvents.NEXUS_STRIKED, e.payload);
    });
};

/**
 * [2026-09-23 莉莉子 · 重器制空重做] 「某半场是否存在【存活】的指定单位」—— 备战席 + 交战区
 *
 * ⚠️ 为什么要收成一个函数：信标的存在性判定此前散落三处、口径还不一致 ——
 *    `gameRules.getSpellPlayBlockReason` 两区都查（正确）、
 *    SUMMON 分支的 `summonOnlyIfAbsent` 只查备战席（漏交战区）、
 *    `useGameState` 的补兵落点又是另一套。
 *    而信标可以被打法①【挑战者】拖到战场上格挡（设计文档 3.9）——
 *    只查备战席就会把「人在战场上」误判成「场上没有」⇒ **多召唤一个**，
 *    破坏设计文档 3.6 的「同时最多存在 1 个」。
 *
 * 归属约定（与 `hitBeaconInField` 同源）：attacker 属 `fight.owner`，blocker 属其对面。
 */
const hasLiveUnitOfSide = (
    side: 'player' | 'enemy',
    playerBench: CardData[],
    enemyBench: CardData[],
    combatField: any[] | undefined,
    key: string,
): boolean => {
    const isLiveKey = (c?: CardData | null): boolean =>
        !!c && c.key === key
        && !c.isDead
        && c.animState !== 'dying'
        && c.animState !== 'ephemeral_dying';

    if ((side === 'player' ? playerBench : enemyBench).some(isLiveKey)) return true;
    if (!combatField) return false;

    return combatField.some(fight => {
        if (!fight) return false;
        if (fight.attacker && fight.owner === side && isLiveKey(fight.attacker)) return true;
        const blockerSide: 'player' | 'enemy' = fight.owner === 'player' ? 'enemy' : 'player';
        return !!fight.blocker && blockerSide === side && isLiveKey(fight.blocker);
    });
};

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
    let finalTargets = [...targets]; // [2026-08-27] const→let：SummonFromHand 分支会整体替换目标
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
        // [SpiritDebug] 斯涅妮卡入场BUFF目标扫描
        if (effect.id === 'effect_spirit_snenika_aura') {
            const bench = context.owner === 'player' ? nextPlayerBench : nextEnemyBench;
            console.log(`[SpiritDebug] ALL_ALLIES扫描: owner=${context.owner}, 备战席${bench.length}个单位:`, bench.map(c => `${c.name}(id=${c.id})`));
        }
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

    // =============================================
    // [2026-07-14 锻造者] 法术增伤光环检测
    // 检查施法者方场上是否有缇坦妮娅（法术伤害+1）
    // =============================================
    const getSpellDamageBonus = (owner: 'player' | 'enemy'): number => {
        const bench = owner === 'player' ? nextPlayerBench : nextEnemyBench;
        const hasTatiana = bench.some(c => c.key === 'The_Forger_Squad_Tatiana' && !c.isDead);
        // 也检查交战区
        let inCombat = false;
        if (nextCombatField) {
            inCombat = nextCombatField.some(fight => {
                const attacker = fight.attacker;
                const blocker = fight.blocker;
                const ownerSide = fight.owner;
                return (attacker?.key === 'The_Forger_Squad_Tatiana' && !attacker?.isDead && ownerSide === owner)
                    || (blocker?.key === 'The_Forger_Squad_Tatiana' && !blocker?.isDead && ownerSide !== owner);
            });
        }
        return (hasTatiana || inCombat) ? 1 : 0;
    };

    // [2026-08-27] 法术狂潮：持有方法术伤害翻倍（红·常驻全局，直接查强化 id 不走 trigger）
    const getSpellDamageMultiplier = (owner: 'player' | 'enemy'): number => {
        const enh = owner === 'player' ? nextGame.rogueEnhancements : nextGame.enemyEnhancements;
        return enh?.includes('arcane_overload') ? 2 : 1;
    };

    // --- 根据效能类型 (Class) 分发逻辑 ---

    switch (effect.class) {
        case 'STRIKE': {
            // 法术打击逻辑

            // A0.3 [2026-08-05 莉莉子 法术1] 双方全场清场：对场上所有单位（双方备战席+交战区）造成伤害
            // 999 伤害远超生命上限 → 走标准死亡流程（judgeLifeAndDeath），无需额外处决逻辑
            if (effect.params.value && effect.params.targetAllUnits) {
                const dmg = effect.params.value;
                const dealDamage = (c: CardData): CardData => {
                    let result: CardData = c;
                    if (result.keywords.includes('Barrier') && dmg > 0) {
                        events.push({ type: 'sfx_shield_break', payload: null });
                        result.depletedKeywords = [...(result.depletedKeywords || []), 'Barrier'];
                        result.animState = 'hit';
                    } else {
                        let actualDmg = dmg;
                        if (result.keywords.includes('Tough') && actualDmg > 0) actualDmg = Math.max(0, actualDmg - 1);
                        if (actualDmg > 0) {
                            events.push({ type: 'unit_damage', payload: { id: result.id, amount: actualDmg } });
                            result.damageTaken = (result.damageTaken || 0) + actualDmg + deadlyLethalInject(result, actualDmg); // [2026-09-12 莉莉子 剧毒] 擦伤即解构
                            result.animState = 'hit';
                        }
                    }
                    return result;
                };
                // 双方备战席
                nextPlayerBench = nextPlayerBench.map(dealDamage);
                nextEnemyBench = nextEnemyBench.map(dealDamage);
                // 双方交战区
                if (nextCombatField) {
                    nextCombatField = nextCombatField.map(fight => {
                        let newFight = { ...fight };
                        if (newFight.attacker) newFight.attacker = dealDamage({ ...newFight.attacker });
                        if (newFight.blocker) newFight.blocker = dealDamage({ ...newFight.blocker });
                        return newFight;
                    });
                }
                break;
            }

            // A0. 献祭打击模式（如：毁灭仪式 — 先杀友方祭品，再伤敌方）
            if (effect.params.sacrificeValue) {
                const sacrificeTarget = finalTargets[0];
                const damageTarget = finalTargets[1];
                if (!sacrificeTarget || !damageTarget) break;

                // [2026-08-29 修复] 献祭目标已死 → 仪式失效（无祭品可献，不造成伤害）。
                // finalTargets 是入栈快照，须从最新战场按 id 找实时实例校验存活（防"单挑先击杀祭品、仪式仍生效"）。
                const liveSacrifice = [...nextPlayerBench, ...nextEnemyBench, ...(nextCombatField ? nextCombatField.flatMap(f => [f.attacker, f.blocker]) : [])]
                    .find(c => c && c.id === sacrificeTarget.id);
                if (liveSacrifice) {
                    const sacHp = (liveSacrifice.health || 0) + (liveSacrifice.buffs?.health || 0) + (liveSacrifice.roundBuffs?.health || 0) - (liveSacrifice.damageTaken || 0);
                    if (liveSacrifice.isDead || liveSacrifice.animState === 'dying' || liveSacrifice.animState === 'ephemeral_dying' || sacHp <= 0) break;
                } else {
                    break; // 战场已无该祭品（被移除/回收）→ 同样失效
                }

                // ① 献祭友方（高额伤害确保击杀）
                const applySacrifice = (c: CardData) => ({
                    ...c,
                    damageTaken: (c.damageTaken || 0) + (effect.params.sacrificeValue || 0),
                    animState: 'hit' as const,
                });
                nextPlayerBench = updateCardInList(nextPlayerBench, sacrificeTarget.id, applySacrifice);
                nextEnemyBench = updateCardInList(nextEnemyBench, sacrificeTarget.id, applySacrifice);
                if (nextCombatField) {
                    nextCombatField = nextCombatField.map(fight => {
                        let newFight = { ...fight };
                        if (newFight.attacker && newFight.attacker.id === sacrificeTarget.id)
                            newFight.attacker = applySacrifice(newFight.attacker);
                        if (newFight.blocker && newFight.blocker.id === sacrificeTarget.id)
                            newFight.blocker = applySacrifice(newFight.blocker);
                        return newFight;
                    });
                }
                events.push({ type: 'unit_damage', payload: { id: sacrificeTarget.id, amount: effect.params.sacrificeValue } });

                // ② 打击敌方
                let dmg = effect.params.value || 0;
                const applyDmg = (c: CardData) => {
                    let nextCard = { ...c };
                    if (nextCard.keywords.includes('Barrier') && dmg > 0) {
                        events.push({ type: 'sfx_shield_break', payload: null });
                        nextCard.depletedKeywords = [...(nextCard.depletedKeywords || []), 'Barrier'];
                        nextCard.animState = 'hit' as const;
                        dmg = 0;
                    }
                    // [2026-07-11 修复] 坚韧：法术伤害减1
                    if (nextCard.keywords.includes('Tough') && dmg > 0) {
                        dmg = Math.max(0, dmg - 1);
                    }
                    if (dmg > 0) {
                        events.push({ type: 'unit_damage', payload: { id: nextCard.id, amount: dmg } });
                        nextCard.damageTaken = (nextCard.damageTaken || 0) + dmg + deadlyLethalInject(nextCard, dmg); // [2026-09-12 莉莉子 剧毒] 擦伤即解构
                        nextCard.animState = 'hit' as const;
                    }
                    return nextCard;
                };
                nextPlayerBench = updateCardInList(nextPlayerBench, damageTarget.id, applyDmg);
                nextEnemyBench = updateCardInList(nextEnemyBench, damageTarget.id, applyDmg);
                if (nextCombatField) {
                    nextCombatField = nextCombatField.map(fight => {
                        let newFight = { ...fight };
                        if (newFight.attacker && newFight.attacker.id === damageTarget.id)
                            newFight.attacker = applyDmg(newFight.attacker);
                        if (newFight.blocker && newFight.blocker.id === damageTarget.id)
                            newFight.blocker = applyDmg(newFight.blocker);
                        return newFight;
                    });
                }
                break;
            }

            // A0. [2026-07-14 梵音] 全屏AOE模式（巨偶一瞥：对所有敌人造成3点伤害）
            if (effect.params.value && effect.params.targetAllEnemies) {
                let dmg = effect.params.value;
                const spellBonus = getSpellDamageBonus(context.owner);
                if (spellBonus > 0) dmg += spellBonus;
                dmg *= getSpellDamageMultiplier(context.owner); // [2026-08-27] 法术狂潮：持有方法术伤害翻倍

                // 击中敌方备战席
                const dealDamage = (c: CardData): CardData => {
                    let result: CardData = c;
                    if (result.keywords.includes('Barrier') && dmg > 0) {
                        events.push({ type: 'sfx_shield_break', payload: null });
                        result.depletedKeywords = [...(result.depletedKeywords || []), 'Barrier'];
                        result.animState = 'hit';
                    } else {
                        let actualDmg = dmg;
                        if (result.keywords.includes('Tough') && actualDmg > 0) actualDmg = Math.max(0, actualDmg - 1);
                        if (actualDmg > 0) {
                            events.push({ type: 'unit_damage', payload: { id: result.id, amount: actualDmg } });
                            result.damageTaken = (result.damageTaken || 0) + actualDmg + deadlyLethalInject(result, actualDmg); // [2026-09-12 莉莉子 剧毒] 擦伤即解构
                            result.animState = 'hit';
                        }
                    }
                    // [2026-08-05 莉莉子 法术17] 全体冻结：对每个敌人额外施加冻结
                    if (effect.params.freezeAllEnemies === true) {
                        result = applyFrostbite(result);
                    }
                    return result;
                };

                // [2026-07-15] 根据施法者选择敌我双方的bench
                const enemyBench = context.owner === 'player' ? nextEnemyBench : nextPlayerBench;
                const allyBench = context.owner === 'player' ? nextPlayerBench : nextEnemyBench;

                if (context.owner === 'player') {
                    nextEnemyBench = enemyBench.map(dealDamage);
                } else {
                    nextPlayerBench = enemyBench.map(dealDamage);
                }
                if (nextCombatField) {
                    nextCombatField = nextCombatField.map(fight => {
                        let newFight = { ...fight };
                        // 对敌方战斗单位造成伤害（谁施法谁对面就是敌人）
                        const enemyUnit = fight.owner === context.owner
                            ? newFight.blocker  // 我方进攻，格挡者是敌方
                            : newFight.attacker; // 敌方进攻，攻击者是敌方
                        if (enemyUnit) {
                            const damaged = dealDamage({ ...enemyUnit });
                            if (fight.owner === context.owner) {
                                newFight.blocker = damaged;
                            } else {
                                newFight.attacker = damaged;
                            }
                        }
                        return newFight;
                    });
                }
                // 觉醒效果：施法者方全场碾压
                // [2026-09-23 莉莉子 · 重器制空] 加显式开关 ——
                //   本段写在**通用**的 `value + targetAllEnemies` 路径里，此前只靠 maxMana 判定，
                //   任何将来走这条 AOE 的卡都会白捡一次「全场碾压」（本条日志还写着「巨偶一瞥」）。
                //   缺省（undefined）保持原行为 ⇒ 巨偶一瞥零回归；显式传 false 才关闭。
                const casterMaxMana = context.owner === 'player'
                    ? context.game?.playerMaxMana
                    : context.game?.enemyMaxMana;
                if (casterMaxMana !== undefined && casterMaxMana >= 10
                    && effect.params.enlightenOverwhelm !== false) {
                    const giveOverwhelm = (c: CardData) => {
                        if (!c.keywords.includes('Overwhelm')) {
                            c.keywords = [...c.keywords, 'Overwhelm'];
                        }
                        return c;
                    };
                    if (context.owner === 'player') {
                        nextPlayerBench = allyBench.map(giveOverwhelm);
                    } else {
                        nextEnemyBench = allyBench.map(giveOverwhelm);
                    }
                    if (nextCombatField) {
                        nextCombatField = nextCombatField.map(fight => {
                            let newFight = { ...fight };
                            // 施法者方的交战区单位获得碾压
                            const allyAttacker = fight.owner === context.owner ? newFight.attacker : null;
                            const allyBlocker = fight.owner !== context.owner ? newFight.blocker : null;
                            if (allyAttacker) newFight.attacker = giveOverwhelm({ ...allyAttacker });
                            if (allyBlocker) newFight.blocker = giveOverwhelm({ ...allyBlocker });
                            return newFight;
                        });
                    }
                    console.log(`[Enlightenment] ${context.owner}觉悟触发！巨偶一瞥费用降为0，全场碾压！`);
                }
                break;
            }

            // A0.2 [2026-07-16 达努·温蒂] 对己方所有单位造成伤害（入场自伤）
            if (effect.params.value && effect.params.targetAllAllies) {
                let dmg = effect.params.value;
                const dealDamage = (c: CardData): CardData => {
                    if (c.keywords.includes('Barrier') && dmg > 0) {
                        events.push({ type: 'sfx_shield_break', payload: null });
                        c.depletedKeywords = [...(c.depletedKeywords || []), 'Barrier'];
                        c.animState = 'hit';
                        return c;
                    }
                    let actualDmg = dmg;
                    if (c.keywords.includes('Tough') && actualDmg > 0) actualDmg = Math.max(0, actualDmg - 1);
                    if (actualDmg > 0) {
                        events.push({ type: 'unit_damage', payload: { id: c.id, amount: actualDmg } });
                        c.damageTaken = (c.damageTaken || 0) + actualDmg + deadlyLethalInject(c, actualDmg); // [2026-09-12 莉莉子 剧毒] 擦伤即解构
                        c.animState = 'hit';
                    }
                    return c;
                };

                // [2026-07-16 温蒂] 支持 excludeSelf — 排除施法者自身
                const excludeSelf = effect.params.excludeSelf && context.sourceCard;
                const applyDamageFilter = (c: CardData) =>
                    excludeSelf && context.sourceCard && c.id === context.sourceCard.id ? c : dealDamage(c);

                const allyBench = context.owner === 'player' ? nextPlayerBench : nextEnemyBench;

                if (context.owner === 'player') {
                    nextPlayerBench = allyBench.map(applyDamageFilter);
                } else {
                    nextEnemyBench = allyBench.map(applyDamageFilter);
                }
                if (nextCombatField) {
                    nextCombatField = nextCombatField.map(fight => {
                        let newFight = { ...fight };
                        const allyUnit = fight.owner === context.owner
                            ? newFight.attacker  // 己方进攻，攻击者是盟友
                            : newFight.blocker;  // 敌方进攻，格挡者是盟友
                        if (allyUnit) {
                            const damaged = excludeSelf && context.sourceCard && allyUnit.id === context.sourceCard.id
                                ? { ...allyUnit }
                                : dealDamage({ ...allyUnit });
                            if (fight.owner === context.owner) {
                                newFight.attacker = damaged;
                            } else {
                                newFight.blocker = damaged;
                            }
                        }
                        return newFight;
                    });
                }
                break;
            }

            // A0.3 [2026-07-16 银臂乱打] — 仅交战区AOE（不打备战席）
            if (effect.params.value && effect.params.targetCombatOnly) {
                let dmg = effect.params.value;
                const spellBonus = getSpellDamageBonus(context.owner);
                if (spellBonus > 0) dmg += spellBonus;
                dmg *= getSpellDamageMultiplier(context.owner); // [2026-08-27] 法术狂潮：持有方法术伤害翻倍

                const dealDamage = (c: CardData): CardData => {
                    if (c.keywords.includes('Barrier') && dmg > 0) {
                        events.push({ type: 'sfx_shield_break', payload: null });
                        c.depletedKeywords = [...(c.depletedKeywords || []), 'Barrier'];
                        c.animState = 'hit';
                        return c;
                    }
                    let actualDmg = dmg;
                    if (c.keywords.includes('Tough') && actualDmg > 0) actualDmg = Math.max(0, actualDmg - 1);
                    if (actualDmg > 0) {
                        events.push({ type: 'unit_damage', payload: { id: c.id, amount: actualDmg } });
                        c.damageTaken = (c.damageTaken || 0) + actualDmg + deadlyLethalInject(c, actualDmg); // [2026-09-12 莉莉子 剧毒] 擦伤即解构
                        c.animState = 'hit';
                    }
                    return c;
                };

                // 只打交战区！备战席不动
                if (nextCombatField) {
                    nextCombatField = nextCombatField.map(fight => ({
                        ...fight,
                        attacker: fight.attacker ? dealDamage({ ...fight.attacker }) : fight.attacker,
                        blocker: fight.blocker ? dealDamage({ ...fight.blocker }) : fight.blocker,
                    }));
                }
                break;
            }

            // [2026-07-17 阿尔戈重做] 自动打敌方水晶（用于回合开始等无需手动选目标的场景）
            if (effect.params.targetEnemyNexus && finalTargets.length === 0) {
                const t = context.owner === 'player' ? 'enemy_nexus' : 'player_nexus';
                finalTargets.push({ type: t, id: t });
            }

            // [安卡希雅·月震星陨] 支援技：对所有本回合进攻或格挡过的敌人造成1点伤害
            if (effect.id === 'effect_acacia_chrono_echo_support') {
                const dmg = effect.params.value || 1;
                const enemyBench = context.owner === 'player' ? nextEnemyBench : nextPlayerBench;
                const processedIds = new Set<string>();

                const dealDamage = (c: CardData): CardData => {
                    if (!c || processedIds.has(c.id)) return c;
                    processedIds.add(c.id);
                    let actualDmg = dmg;
                    if (c.keywords.includes('Barrier') && actualDmg > 0) {
                        events.push({ type: 'sfx_shield_break', payload: null });
                        c.depletedKeywords = [...(c.depletedKeywords || []), 'Barrier'];
                        c.animState = 'hit';
                        return c;
                    }
                    if (c.keywords.includes('Tough') && actualDmg > 0) actualDmg = Math.max(0, actualDmg - 1);
                    if (actualDmg > 0) {
                        events.push({ type: 'unit_damage', payload: { id: c.id, amount: actualDmg } });
                        c.damageTaken = (c.damageTaken || 0) + actualDmg + deadlyLethalInject(c, actualDmg); // [2026-09-12 莉莉子 剧毒] 擦伤即解构
                        c.animState = 'hit';
                    }
                    return c;
                };

                // ① 交战区：敌方进攻者或格挡者
                if (nextCombatField) {
                    nextCombatField = nextCombatField.map(fight => {
                        const newFight = { ...fight };
                        if (fight.owner !== context.owner && newFight.attacker) {
                            newFight.attacker = dealDamage({ ...newFight.attacker });
                        }
                        if (fight.owner === context.owner && newFight.blocker) {
                            newFight.blocker = dealDamage({ ...newFight.blocker });
                        }
                        return newFight;
                    });
                }
                // ② 备战席：本回合曾进攻或格挡过的单位
                if (context.owner === 'player') {
                    nextEnemyBench = enemyBench.map(c =>
                        (c.roundStrikes || 0) > 0 ? dealDamage({ ...c }) : c
                    );
                } else {
                    nextPlayerBench = enemyBench.map(c =>
                        (c.roundStrikes || 0) > 0 ? dealDamage({ ...c }) : c
                    );
                }
                console.log(`[月震星陨] 支援技→进攻/格挡过的敌人`);
                break;
            }

            // [安卡希雅·越时斩] 若本回合已飞剑则敌方全场打2
            if (effect.id === 'effect_acacia_cross_temporal') {
                const hasSwordThisRound = context.owner === 'player'
                    ? nextGame.playerRoundSwordUsed
                    : nextGame.enemyRoundSwordUsed;
                if (hasSwordThisRound) {
                    // [2026-07-31 安卡希雅] 越时斩专属音效（仅效果生效时播放）
                    eventBus.emit(GameEvents.SFX_ACACIA_CROSS_TEMPORAL);
                    let dmg = effect.params.value || 2;
                    const dealDamage = (c: CardData): CardData => {
                        if (c.keywords.includes('Barrier') && dmg > 0) {
                            events.push({ type: 'sfx_shield_break', payload: null });
                            c.depletedKeywords = [...(c.depletedKeywords || []), 'Barrier'];
                            c.animState = 'hit';
                            return c;
                        }
                        let actualDmg = dmg;
                        if (c.keywords.includes('Tough') && actualDmg > 0) actualDmg = Math.max(0, actualDmg - 1);
                        if (actualDmg > 0) {
                            events.push({ type: 'unit_damage', payload: { id: c.id, amount: actualDmg } });
                            c.damageTaken = (c.damageTaken || 0) + actualDmg + deadlyLethalInject(c, actualDmg); // [2026-09-12 莉莉子 剧毒] 擦伤即解构
                            c.animState = 'hit';
                        }
                        return c;
                    };
                    // 敌方备战席
                    const enemyBench = context.owner === 'player' ? nextEnemyBench : nextPlayerBench;
                    if (context.owner === 'player') {
                        nextEnemyBench = enemyBench.map(dealDamage);
                    } else {
                        nextPlayerBench = enemyBench.map(dealDamage);
                    }
                    // 敌方交战区
                    if (nextCombatField) {
                        nextCombatField = nextCombatField.map(fight => {
                            const newFight = { ...fight };
                            if (fight.owner === context.owner && newFight.blocker) {
                                newFight.blocker = dealDamage({ ...newFight.blocker });
                            } else if (fight.owner !== context.owner && newFight.attacker) {
                                newFight.attacker = dealDamage({ ...newFight.attacker });
                            }
                            return newFight;
                        });
                    }
                    console.log(`[越时斩] 本回合已飞剑→敌方全场打${dmg}`);
                } else {
                    console.log(`[越时斩] 本回合未飞剑，无效`);
                }
                break;
            }

            // [安卡希雅·剑痕时空] 退级 + 大飞剑水晶伤害 + 回复费用
            if (effect.id === 'effect_acacia_sword_timeline') {
                // [2026-07-31 安卡希雅] 剑痕时空专属音效
                eventBus.emit(GameEvents.SFX_ACACIA_TIMELINE);
                // ① 退级：整个牌库的安卡 Lv2→Lv1，走与升级相同的逻辑层、反向路径
                //   a. 移除全局升级标记 → 之后抽到/打出安卡以 Lv1 入场（与朔望之期无条件记录的标记对称）
                //   b. 场上 Lv2 安卡实例（备战席 + 交战区）→ Lv1
                //   c. 手牌 + 牌库法术反向交换（重锋→剑舞、月镰剑势→扩散），Lv2 安卡副本 → Lv1
                // [2026-09-13 莉莉子] 改用统一入口按方撤销（全局 + 分阵营两套同步清除）
                unmarkLeveledUp(nextGame, context.owner, 'acacia_chrono_echo');

                const allyBench = context.owner === 'player' ? nextPlayerBench : nextEnemyBench;
                const demoteAcacia = (current: CardData): CardData => ({
                    ...current,
                    level: 1,
                    power: 2, health: 4, maxHealth: 4,
                    keywords: ['Channel', 'Aura', 'Ability'],
                    effects: ['effect_acacia_chrono_echo_lv1', 'effect_acacia_chrono_echo_token'],
                    description: '【库效】，若我方手牌中没有，则在我方手牌中生成一张"安卡希雅的剑舞"。\n入场及获得进攻标识时：生成一张易逝的"灵轨月轮·扩散"。\n参战：变化为"安卡希雅的剑舞"。',
                });
                const acaciaIdx = allyBench.findIndex(c =>
                    c.key === 'acacia_chrono_echo' && c.isChampion && c.level === 2
                );
                if (acaciaIdx >= 0) {
                    allyBench[acaciaIdx] = demoteAcacia(allyBench[acaciaIdx]);
                    console.log(`[剑痕时空] 备战席安卡希雅退级 → Lv1`);
                } else if (nextCombatField) {
                    // 备战席没有 Lv2 安卡 → 去交战区找（可能正在作战）
                    for (const fight of nextCombatField) {
                        if (fight.owner === context.owner) {
                            if (fight.attacker && fight.attacker.key === 'acacia_chrono_echo' && fight.attacker.isChampion && fight.attacker.level === 2) {
                                fight.attacker = demoteAcacia(fight.attacker);
                                console.log(`[剑痕时空] 交战区安卡希雅退级 → Lv1`);
                                break;
                            }
                        } else {
                            if (fight.blocker && fight.blocker.key === 'acacia_chrono_echo' && fight.blocker.isChampion && fight.blocker.level === 2) {
                                fight.blocker = demoteAcacia(fight.blocker);
                                console.log(`[剑痕时空] 交战区安卡希雅退级 → Lv1`);
                                break;
                            }
                        }
                    }
                }

                // ② 手牌 + 牌库退级交换：重锋→剑舞、月镰剑势→扩散，Lv2 安卡副本 → Lv1
                // （与升级 upgradeAcaciaHand 遍历相同的逻辑层，反向执行）
                const ownerHand = context.owner === 'player' ? nextPlayerHand : nextEnemyHand;
                const demotedHand = demoteAcaciaHand(ownerHand);
                if (context.owner === 'player') {
                    nextPlayerHand = demotedHand;
                    if (nextPlayerDeck) nextPlayerDeck = demoteAcaciaHand(nextPlayerDeck);
                } else {
                    nextEnemyHand = demotedHand;
                    if (nextEnemyDeck) nextEnemyDeck = demoteAcaciaHand(nextEnemyDeck);
                }
                console.log(`[剑痕时空] 手牌+牌库退级交换完成（重锋→剑舞, 月镰剑势→扩散）`);

                // ③ 大飞剑水晶伤害
                const greatSwordCount = context.owner === 'player'
                    ? (nextGame.playerGreatSwordsTotal || 0)
                    : (nextGame.enemyGreatSwordsTotal || 0);
                if (greatSwordCount > 0) {
                    const nexusTarget = context.owner === 'player' ? 'enemy_nexus' : 'player_nexus';
                    const rawTotalDmg = greatSwordCount * (effect.params.value || 1);
                    // [2026-09-02 莉莉子 修复] 固若金汤水晶坚韧：大飞剑水晶伤害同样减免 1（事件 amount 同步为实际伤害，飘字一致）
                    const totalDmg = (context.owner === 'player' ? nextGame.enemyNexusTough : nextGame.playerNexusTough)
                        ? Math.max(0, rawTotalDmg - 1) : rawTotalDmg;
                    events.push({ type: 'nexus_damage', payload: { target: nexusTarget, amount: totalDmg } });
                    if (context.owner === 'player') {
                        nextGame.enemyNexus = Math.max(0, (nextGame.enemyNexus || 20) - totalDmg);
                    } else {
                        nextGame.playerNexus = Math.max(0, (nextGame.playerNexus || 20) - totalDmg);
                    }
                    console.log(`[剑痕时空] 大飞剑(${greatSwordCount})→敌方水晶 ${totalDmg}点伤害`);
                }

                // ④ 回复全部费用
                if (context.owner === 'player') {
                    nextGame.playerMana = nextGame.playerMaxMana;
                    nextGame.playerSpellMana = 3;
                } else {
                    nextGame.enemyMana = nextGame.enemyMaxMana;
                    nextGame.enemySpellMana = 3;
                }
                break;
            }

            // A. 直接数值打击 (如: 暗箭, 破坏, 秘术射击, 镜涌万象)
            if (effect.params.value) {
                const target = finalTargets[0];
                if (!target) break;

                // =====================================
                // [新增] 第一层：动态载荷判定 (Dynamic Payload)
                // =====================================
                let dmg = effect.params.value;
                // [2026-07-14 锻造者] 缇坦妮娅法术增伤光环
                const spellBonus = getSpellDamageBonus(context.owner);
                if (spellBonus > 0 && (dmg || 0) > 0) {
                    dmg += spellBonus;
                    console.log(`[SpellDamageAura] 缇坦妮娅法术增伤 +${spellBonus}，最终伤害=${dmg}`);
                }
                dmg = (dmg || 0) * getSpellDamageMultiplier(context.owner); // [2026-08-27] 法术狂潮：持有方法术伤害翻倍
                let shouldSplash = effect.params.splashAdjacent; // [新增] 动态溅射开关

                // 拦截器：如果存在增伤条件
                if (effect.params.condition === 'pupu_strike_check' && effect.params.bonusValue !== undefined) {
                    // 全场雷达扫描：我方备战席和交战区，是否有参与过打击的卜卜
                    const myBench = context.owner === 'player' ? nextPlayerBench : nextEnemyBench;
                    const hasUpgradedPupu =
                        myBench.some(c => c.key.includes('pupu_specular_soul') && (c.roundStrikes || 0) > 0) ||
                        (nextCombatField && nextCombatField.some(f =>
                            (f.owner === context.owner && f.attacker.key.includes('pupu_specular_soul') && (f.attacker.roundStrikes || 0) > 0) ||
                            (f.owner !== context.owner && f.blocker && f.blocker.key.includes('pupu_specular_soul') && (f.blocker.roundStrikes || 0) > 0)
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
                    // [2026-09-02 莉莉子 修复] 固若金汤水晶坚韧：法术/效果直伤打水晶同样减免 1（事件 amount 同步为实际伤害，飘字一致）
                    const finalNexusDmg = nextGame.enemyNexusTough ? Math.max(0, dmg - 1) : dmg;
                    nextGame.enemyNexus -= finalNexusDmg;
                    events.push({ type: 'nexus_damage', payload: { target: 'enemy', amount: finalNexusDmg } });
                } else if (target.type === 'player_nexus') {
                    const finalNexusDmg = nextGame.playerNexusTough ? Math.max(0, dmg - 1) : dmg;
                    nextGame.playerNexus -= finalNexusDmg;
                    events.push({ type: 'nexus_damage', payload: { target: 'player', amount: finalNexusDmg } });
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
                            // [2026-07-11 修复] 坚韧：法术伤害减1
                            if (nextCard.keywords.includes('Tough') && actualDmg > 0) {
                                actualDmg = Math.max(0, actualDmg - 1);
                            }

                            if (actualDmg > 0) {
                                events.push({ type: 'unit_damage', payload: { id: nextCard.id, amount: actualDmg } });
                                nextCard.damageTaken = (nextCard.damageTaken || 0) + actualDmg + deadlyLethalInject(nextCard, actualDmg); // [2026-09-12 莉莉子 剧毒] 擦伤即解构
                                nextCard.animState = 'hit' as const;

                                // ==========================================
                                // [新增] 埋点 B-1：猫汐尔经验收集 - 拦截数值炮击
                                // ==========================================
                                if (context.owner === 'player' && context.sourceCard && isSummonerOrSummon(context.sourceCard)) {
                                    accumulateMauxirDamage(nextPlayerBench, nextCombatField || [], actualDmg, (newBench) => { nextPlayerBench = newBench; }, nextPlayerHand, (newHand) => { nextPlayerHand = newHand; }, nextPlayerDeck, (newDeck) => { if (newDeck) nextPlayerDeck = newDeck; });
                                }
                            }

                            // 2. [新增] 伴泽而生：条件冻结判定 (原子化拦截)
                            if (effect.params.condition === 'freeze_if_health_equals_1') {
                                const remainingHealth = getHealth(nextCard); // [2026-09-22 修复] 统一口径（原公式漏 roundBuffs.health）
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
                        // [核心修复] 提取当前真实面板攻击力（基础 + 永久 Buff + 临时 Buff + 回合Buff）
                        const damageToDef = getPower(attacker);
                        const damageToAtk = getPower(defender);
                        // [2026-08-29 调试] 单挑结算快照：真实攻/血（含 roundBuffs）→ 排查"迂回防守加血后仍被单挑打死"
                        const hpSnap = (c: CardData) => (c.health || 0) + (c.buffs?.health || 0) + (c.roundBuffs?.health || 0) - (c.damageTaken || 0);
                        console.log(`[单挑] 进攻方=${attacker.name}(攻${damageToDef}) | 防守方=${defender.name}(HP${hpSnap(defender)} 基础${defender.health} roundBuffs=${JSON.stringify(defender.roundBuffs)} 受伤${defender.damageTaken ?? 0})`);

                        const applyDamage = (c: CardData, dmg: number, didStrike: boolean) => {
                            let finalDmg = dmg;

                            // 法术单挑：屏障抵挡伤害后从关键词移除
                            const hasActiveBarrier = c.keywords.includes('Barrier');
                            if (hasActiveBarrier && finalDmg > 0) {
                                events.push({ type: 'sfx_shield_break', payload: null });
                                finalDmg = 0; // 伤害被抵挡
                            }
                            // [2026-07-11 修复] 坚韧：法术单挑伤害减1
                            if (c.keywords.includes('Tough') && finalDmg > 0) {
                                finalDmg = Math.max(0, finalDmg - 1);
                            }

                            // [致命 Bug 修复] 绝不减 c.health，只累加 damageTaken
                            // [2026-09-12 莉莉子 剧毒] 擦伤即解构：法术单挑打到剧毒单位同样致死
                            let newDamageTaken = (c.damageTaken || 0) + finalDmg + deadlyLethalInject(c, finalDmg);
                            if (finalDmg > 0) {
                                events.push({ type: 'unit_damage', payload: { id: c.id, amount: finalDmg } });

                                // ==========================================
                                // [新增] 埋点 B-2：猫汐尔经验收集 - 拦截法术单挑
                                // ==========================================
                                // 在单挑中，如果该法术的施法者(打出这张法术牌的人，通常是英雄本身或随从) 是召唤系，计入经验。
                                // (注意：这里追踪的是法术的来源，而不是参与单挑的两个受害者的种族。这符合LOR等游戏的通用规则：谁打出的法术，谁就是伤害来源。)
                                if (context.owner === 'player' && context.sourceCard && isSummonerOrSummon(context.sourceCard)) {
                                    accumulateMauxirDamage(nextPlayerBench, nextCombatField || [], finalDmg, (newBench) => { nextPlayerBench = newBench; }, nextPlayerHand, (newHand) => { nextPlayerHand = newHand; }, nextPlayerDeck, (newDeck) => { if (newDeck) nextPlayerDeck = newDeck; });
                                }
                            }

                            // [新增核心] 法术附带碾压 (Overwhelm) 激光穿透判定
                            if (attacker.keywords.includes('Overwhelm')) {
                                const currentHealth = c.health + (c.buffs?.health || 0) + (c.roundBuffs?.health || 0) - (c.damageTaken || 0); // [2026-07-31] 碾压溢出计入本回合临时血
                                if (finalDmg > currentHealth) {
                                    const rawExcess = finalDmg - currentHealth;
                                    // [2026-09-02 莉莉子 修复] 固若金汤水晶坚韧：碾压溢出打水晶同样减免 1（事件 amount 同步为实际伤害，飘字一致）
                                    const excess = (context.owner === 'player' ? nextGame.enemyNexusTough : nextGame.playerNexusTough)
                                        ? Math.max(0, rawExcess - 1) : rawExcess;
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

                        // [2026-08-30 莉莉子] after_attack/after_attacked 强化全覆盖：单挑互打双方都挥击且受击
                        const atkOwnerSide = context.owner; // 单挑 ally = 施法者侧
                        const defOwnerSide = context.owner === 'player' ? 'enemy' : 'player';
                        const atkEnh = atkOwnerSide === 'player' ? nextGame.rogueEnhancements : nextGame.enemyEnhancements;
                        const defEnh = defOwnerSide === 'player' ? nextGame.rogueEnhancements : nextGame.enemyEnhancements;
                        // 结算后重新定位实时单位（含伤害），存活才成长
                        const locateDuelUnit = (id: string): CardData | undefined => {
                            let u = nextPlayerBench.find(c => c.id === id) || nextEnemyBench.find(c => c.id === id);
                            if (!u && nextCombatField) {
                                const f = nextCombatField.find(fx => (fx.attacker && fx.attacker.id === id) || (fx.blocker && fx.blocker.id === id));
                                if (f) u = f.attacker?.id === id ? f.attacker : f.blocker;
                            }
                            return u;
                        };
                        const curAtk = locateDuelUnit(attackerId);
                        const curDef = locateDuelUnit(defenderId);
                        // [2026-09-15 莉莉子 BUG修复] 存活判据改用统一版本（叠加真实血量）：
                        // 单挑只累加 damageTaken、不设 animState='dying'，原判据形同虚设 → 被这一击
                        // 打死的单位仍会吃到成长的 +1/+1，血量由 0 拉回 1 = 变相复活（铁壁反击 BUG）。
                        if (isStrikeTargetAlive(curAtk)) {
                            const buffedAtk = applyStrikeEnhancement(atkEnh, 'after_attack', curAtk);
                            const buffedAtk2 = applyStrikeEnhancement(atkEnh, 'after_attacked', buffedAtk);
                            nextPlayerBench = updateCardInList(nextPlayerBench, attackerId, c => c === curAtk ? buffedAtk2 : c);
                            nextEnemyBench = updateCardInList(nextEnemyBench, attackerId, c => c === curAtk ? buffedAtk2 : c);
                            if (nextCombatField) {
                                nextCombatField = nextCombatField.map(fx => {
                                    const nf = { ...fx };
                                    if (nf.attacker?.id === attackerId) nf.attacker = buffedAtk2;
                                    if (nf.blocker?.id === attackerId) nf.blocker = buffedAtk2;
                                    return nf;
                                });
                            }
                        }
                        if (isStrikeTargetAlive(curDef)) {
                            const buffedDef = applyStrikeEnhancement(defEnh, 'after_attack', curDef);
                            const buffedDef2 = applyStrikeEnhancement(defEnh, 'after_attacked', buffedDef);
                            nextPlayerBench = updateCardInList(nextPlayerBench, defenderId, c => c === curDef ? buffedDef2 : c);
                            nextEnemyBench = updateCardInList(nextEnemyBench, defenderId, c => c === curDef ? buffedDef2 : c);
                            if (nextCombatField) {
                                nextCombatField = nextCombatField.map(fx => {
                                    const nf = { ...fx };
                                    if (nf.attacker?.id === defenderId) nf.attacker = buffedDef2;
                                    if (nf.blocker?.id === defenderId) nf.blocker = buffedDef2;
                                    return nf;
                                });
                            }
                        }
                    }
                }
            }
            break;
        }
        // [新增] BUFF 处理器 (处理 GRANT 类型效果)
        case 'BUFF': {
            // [修复] 显式断言 effect.params 为 EffectParams，让 TS 知道 keywords 的合法身份
            const params = effect.params as EffectParams;

            // [安卡希雅·朔望之期] 打出→升级安卡 + 手牌升级交换 + 回复全部费用
            if (effect.id === 'effect_acacia_chrono_echo_ultimate') {
                // [2026-07-31 安卡希雅] 朔望之期专属音效
                eventBus.emit(GameEvents.SFX_ACACIA_ULTIMATE);
                const targetBench = context.owner === 'player' ? nextPlayerBench : nextEnemyBench;
                const acaciaIdx = targetBench.findIndex(c =>
                    c.key === 'acacia_chrono_echo' && c.isChampion && c.level === 1
                );
                // [2026-07-31 架构修复] 无条件记录升级状态（对齐猫汐尔"场下达成条件、打出后升级"）
                // 即使安卡不在场，之后打出安卡也会直接以 Lv2 入场
                // [2026-09-13 莉莉子] 改用统一入口按方写入（全局 + 分阵营两套同步维护）；
                // 阵营取自 context.owner —— 谁打出朔望之期，就只标记谁家的安卡。
                markLeveledUp(nextGame, context.owner, 'acacia_chrono_echo');

                if (acaciaIdx >= 0) {
                    // ① 升级安卡
                    const leveled = getLeveledUpCard(targetBench[acaciaIdx] as any);
                    targetBench[acaciaIdx] = { ...leveled, id: targetBench[acaciaIdx].id } as any;
                    events.push({ type: 'sfx_levelup', payload: targetBench[acaciaIdx] });
                    // [2026-07-30] 加入升级队列，触发升级动画
                    nextGame.pendingLevelUps = [...(nextGame.pendingLevelUps || []), targetBench[acaciaIdx]];
                    console.log(`[朔望之期] 安卡希雅升级 → Lv2`);

                    // ② 手牌升级交换：剑舞→重锋, 扩散/集束→月镰剑势（统一走 upgradeAcaciaHand）
                    const upgradeHand = context.owner === 'player' ? nextPlayerHand : nextEnemyHand;
                    const upgradedHand = upgradeAcaciaHand(upgradeHand);
                    if (context.owner === 'player') nextPlayerHand = upgradedHand;
                    else nextEnemyHand = upgradedHand;
                    console.log(`[朔望之期] 手牌法术升级交换完成`);

                    // ④ 回复全部费用
                    if (context.owner === 'player') {
                        nextGame.playerMana = nextGame.playerMaxMana;
                        nextGame.playerSpellMana = 3;
                        console.log(`[朔望之期] 回复全部费用(${nextGame.playerMaxMana})`);
                    } else {
                        nextGame.enemyMana = nextGame.enemyMaxMana;
                        nextGame.enemySpellMana = 3;
                    }
                } else {
                    // 场上无安卡：仅记录升级状态，等安卡入场时以 Lv2 出现
                    console.log(`[朔望之期] 安卡不在场，已记录升级状态（打出安卡时以 Lv2 入场）`);
                }
                break; // 朔望之期处理完毕
            }

            // [安卡希雅·圆缺有律] 切换灵轨月轮·扩散/集束
            if (effect.id === 'effect_acacia_chrono_echo_rush') {
                // 切换模式标记（整场对局生效）+ 切换手牌中现有卡牌
                const isPlayer = context.owner === 'player';
                const modeKey = isPlayer ? 'playerAcaciaSwordFocus' : 'enemyAcaciaSwordFocus';
                const currentMode = nextGame[modeKey];
                const newMode = !currentMode; // 切换：false→true(扩散→集束) 或 true→false(集束→扩散)

                // [2026-07-31 安卡希雅] 圆缺有律专属音效：按切换目标播放
                eventBus.emit(newMode ? GameEvents.SFX_ACACIA_RUSH_FOCUS : GameEvents.SFX_ACACIA_RUSH_SPREAD);

                const targetHand = isPlayer ? nextPlayerHand : nextEnemyHand;
                for (let i = 0; i < targetHand.length; i++) {
                    if (newMode && targetHand[i].key === 'acacia_sword_rain') {
                        // 扩散→集束
                        const replacement = createCard('acacia_moon_focus');
                        targetHand[i] = { ...replacement, id: targetHand[i].id };
                        console.log(`[圆缺有律] 灵轨月轮·扩散 → 灵轨月轮·集束`);
                    } else if (!newMode && targetHand[i].key === 'acacia_moon_focus') {
                        // 集束→扩散
                        const replacement = createCard('acacia_sword_rain');
                        targetHand[i] = { ...replacement, id: targetHand[i].id };
                        console.log(`[圆缺有律] 灵轨月轮·集束 → 灵轨月轮·扩散`);
                    }
                }

                // 持久化模式标记
                (nextGame as any)[modeKey] = newMode;
                console.log(`[圆缺有律] 模式切换为 ${newMode ? '集束' : '扩散'}`);
                break; // 圆缺有律效果处理完毕
            }

            // [圣树·阿尔维娜] 入场时：若本回合已飞剑，每飞剑1 → 我方全员本回合随机 +1/+0 或 +0/+1，并备战
            if (effect.id === 'effect_sacred_tree_alvina') {
                const hasSwordThisRound = context.owner === 'player'
                    ? nextGame.playerRoundSwordUsed
                    : nextGame.enemyRoundSwordUsed;

                if (hasSwordThisRound) {
                    // 本回合已召唤的飞剑总数（每飞剑1 一次加成，而非本局总数）
                    const swordCount = context.owner === 'player'
                        ? (nextGame.playerRoundFlyingSwords || 0)
                        : (nextGame.enemyRoundFlyingSwords || 0);

                    // 对单个单位：进行 swordCount 次随机加成，每次 +1/+0 或 +0/+1（本回合 roundBuffs，回合末清除）
                    const applyRandomBuff = (c: CardData): CardData => {
                        let p = c.roundBuffs?.power || 0;
                        let h = c.roundBuffs?.health || 0;
                        for (let i = 0; i < swordCount; i++) {
                            if (Math.random() < 0.5) p += 1;
                            else h += 1;
                        }
                        return { ...c, roundBuffs: { power: p, health: h }, animState: 'buff' as const };
                    };

                    // ① 我方全员随机加成（备战席）
                    const allyBench = context.owner === 'player' ? nextPlayerBench : nextEnemyBench;
                    const buffedBench = allyBench.map(applyRandomBuff);
                    if (context.owner === 'player') nextPlayerBench = buffedBench;
                    else nextEnemyBench = buffedBench;

                    // ② 我方全员随机加成（交战区）
                    if (nextCombatField) {
                        nextCombatField = nextCombatField.map(fight => {
                            const newFight = { ...fight };
                            const isAllyFight = fight.owner === context.owner;
                            const allyUnit = isAllyFight ? newFight.attacker : newFight.blocker;
                            if (allyUnit) {
                                const buffed = applyRandomBuff(allyUnit);
                                if (isAllyFight) newFight.attacker = buffed;
                                else newFight.blocker = buffed;
                            }
                            return newFight;
                        });
                    }

                    // ③ 备战
                    nextGame.attackToken = {
                        ...nextGame.attackToken,
                        [context.owner]: 'rally',
                    };
                    events.push({ type: 'gain_token_rally', payload: { owner: context.owner } });

                    console.log(`[圣树·阿尔维娜] 本回合已飞剑(${swordCount}把)→全员随机攻防加成并备战`);
                } else {
                    console.log(`[圣树·阿尔维娜] 本回合未飞剑，效果不触发`);
                }
                break; // 阿尔维娜效果处理完毕
            }

            // =====================================
            // [2026-09-17 1.0.16 茉莉安 · T19 静默行动]
            // 消除场上所有【暴露】（含我方），每消除一个 → 我方全体永久 +1/+1
            //
            // ⚠️ 为什么不复用通用 BUFF 的 removeKeywords：
            //    ① 它只作用于「被选中的目标」，而本卡口径是「全场全计」
            //    ② 它的现实现限定 target.type === 'ally'（effectProcessor.ts:1454），
            //       覆盖不了「我方的暴露也要清」这条
            //    ③ 它是 37 张 BUFF 卡共用的路径，为一个专属法术改它风险不划算
            // =====================================
            if (effect.id === 'effect_marian_silent_action') {
                const REMOVE_KW: Keyword = 'Exposed';
                let removedCount = 0;

                // 摘除单个单位的【暴露】；命中则计数 +1
                const stripExposed = (c: CardData): CardData => {
                    if (!c.keywords || !c.keywords.includes(REMOVE_KW)) return c;
                    removedCount++;
                    return {
                        ...c,
                        keywords: c.keywords.filter(k => k !== REMOVE_KW),
                        // 若该【暴露】是本回合施加的，临时账本里也要清掉，否则回合末清算时会残留
                        roundKeywords: (c.roundKeywords || []).filter(k => k !== REMOVE_KW),
                    };
                };

                // ① 扫双方备战席
                nextPlayerBench = nextPlayerBench.map(stripExposed);
                nextEnemyBench = nextEnemyBench.map(stripExposed);

                // ② 扫交战区（攻守两侧都要算）
                if (nextCombatField) {
                    nextCombatField = nextCombatField.map(fight => {
                        const newFight = { ...fight };
                        if (newFight.attacker) newFight.attacker = stripExposed(newFight.attacker);
                        if (newFight.blocker) newFight.blocker = stripExposed(newFight.blocker);
                        return newFight;
                    });
                }

                console.log(`[静默行动] 消除【暴露】×${removedCount}`);

                // ③ 每消除一个 → 我方全体永久 +1/+1
                if (removedCount > 0) {
                    const applyReward = (c: CardData): CardData => ({
                        ...c,
                        buffs: {
                            power: (c.buffs?.power || 0) + removedCount,
                            health: (c.buffs?.health || 0) + removedCount,
                        },
                        animState: 'buff' as const,
                    });

                    const myBench = context.owner === 'player' ? nextPlayerBench : nextEnemyBench;
                    const buffedBench = myBench.map(applyReward);
                    if (context.owner === 'player') nextPlayerBench = buffedBench;
                    else nextEnemyBench = buffedBench;

                    // 交战区里的己方单位同样吃这份加成
                    // （fight.owner === 我方 → 我方是 attacker，否则是 blocker，与上方通用扫描仪口径一致）
                    if (nextCombatField) {
                        nextCombatField = nextCombatField.map(fight => {
                            const newFight = { ...fight };
                            if (fight.owner === context.owner && newFight.attacker) {
                                newFight.attacker = applyReward(newFight.attacker);
                            } else if (fight.owner !== context.owner && newFight.blocker) {
                                newFight.blocker = applyReward(newFight.blocker);
                            }
                            return newFight;
                        });
                    }

                    events.push({ type: 'sfx_buff', payload: null });
                    console.log(`[静默行动] 我方全体永久 +${removedCount}/+${removedCount}`);
                }

                break; // 静默行动处理完毕
            }

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
            // [2026-08-29 调试] 迂回防守 BUFF 是否真正施加
            if (effect.id === 'effect_temp_spell_15') {
                console.log(`[迂回防守] BUFF执行: 目标=${finalTargets.map(t => `${t.name}(${t.health}血, roundBuffs=${JSON.stringify(t.roundBuffs)})`).join(',')} 加血=${health} duration=${duration}`);
            }

            // [新增] 机器 A：专属“数值改造机”
            // [2026-09-26 莉莉子 BUG修复] 新增 durationOverride 参数
            //   —— 当一个 effect 的两个部分生命周期**相反**时，effect 级的单一 duration 无法同时表达：
            //      以饵引狼 = ① 贴【暴露】永久 ＋ ② −4/−0 本回合
            //   故允许调用点显式覆盖时长。**不传第 4 参时行为与原先完全一致**（其余 8 个调用点均不传）。
            const applyStats = (c: CardData, p: number, h: number, durationOverride?: 'ROUND' | 'PERMANENT'): CardData => {
                const effDuration = durationOverride ?? duration;
                let actualP = p;
                // [2026-06-27 buffTag] 如果目标有 buffRules，过滤不匹配的攻 Buff
                if ((c as any).buffRules?.power?.allowedTags) {
                    if (!params.buffTag || !(c as any).buffRules.power.allowedTags.includes(params.buffTag)) {
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

                // =====================================
                // [2026-09-26 莉莉子 BUG修复] 负向攻击力对齐【冻结】语义
                // ── 冻结（keywords.ts applyFrostbite）是拿 getPower 做**等额对冲**：
                //      offset = currentPower > 0 ? -currentPower : 0  ⇒ 刚好归零，**永不推成负数**。
                // ── 而这里是**无条件累加**：1 攻单位吃 -4 会往 roundBuffs 存进 -4，坏在两处：
                //      ① 数据里真出现负值 → 被 cloneUnitState 固化成【永久基础攻击力】（回合末清不掉）
                //      ② 同回合后续的 +2 被负值吞掉（真实值 1-4+2 = -1 → 显示 0；
                //         按冻结语义应为 1→0 再 +2 = 2）
                // ── 故负向增量同样只对冲「当前真实攻击力里还剩的正值部分」，超出的部分直接丢弃。
                // ⚠️ getPower 已含 maxPower 上限（底座），与冻结口径完全一致。
                // =====================================
                if (actualP < 0) {
                    actualP = -Math.min(-actualP, getPower(c));
                }

                return {
                    ...c,
                    customProgress: nextProgress, // 记录触发状态
                    // [核心重构] 彻底实现表里分离！永久归永久，临时归临时！
                    buffs: {
                        power: (c.buffs?.power || 0) + (effDuration === 'PERMANENT' ? actualP : 0),
                        health: (c.buffs?.health || 0) + (effDuration === 'PERMANENT' ? h : 0)
                    },
                    roundBuffs: {
                        power: (c.roundBuffs?.power || 0) + (effDuration === 'ROUND' ? actualP : 0),
                        health: (c.roundBuffs?.health || 0) + (effDuration === 'ROUND' ? h : 0)
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

            // [SpiritDebug] 斯涅妮卡入场BUFF执行
            if (effect.id === 'effect_spirit_snenika_aura') {
                console.log(`[SpiritDebug] BUFF执行: finalTargets=${finalTargets.length}个, power=${power}, health=${health}, duration=${duration}`);
            }

            // =====================================
            // [2026-09-26 1.0.16 茉莉安] 阵营法术共用工具
            // 按 id 在「双方备战席 + 交战区攻守两侧」就地改写单张卡
            // （与通用 BUFF 同口径：备战席 + 交战区都要覆盖）
            // ⚠️ 原先内嵌在「以饵引狼」分支里；T17 猎影标记也要用 ⇒ 上提为两者共用，行为不变
            // =====================================
            const patchById = (id: string, fn: (c: CardData) => CardData) => {
                nextPlayerBench = updateCardInList(nextPlayerBench, id, fn);
                nextEnemyBench = updateCardInList(nextEnemyBench, id, fn);
                if (nextCombatField) {
                    nextCombatField = nextCombatField.map(fight => {
                        const newFight = { ...fight };
                        if (newFight.attacker?.id === id) newFight.attacker = fn(newFight.attacker);
                        if (newFight.blocker?.id === id) newFight.blocker = fn(newFight.blocker);
                        return newFight;
                    });
                }
            };

            // =====================================
            // [2026-09-17 1.0.16 茉莉安 · T18 以饵引狼]
            // 两个目标都手动选：① 我方单位 → 【暴露】（代价）
            //                   ② 敌方单位 → 本回合 −4/−0（收益）
            //
            // ⚠️ 为什么不走通用 BUFF：通用路径对 finalTargets 全体施加【同一套 params】，
            //    而本卡两个目标要吃完全不同的效果（一个加关键词、一个减身材）。
            //    放在 applyStats 定义之后，直接复用它以保证 buffRules 等口径一致。
            // =====================================
            if (effect.id === 'effect_marian_faction_bait') {
                // targetRequirements 的声明顺序即 finalTargets 的顺序：[我方, 敌方]
                const allyTarget = finalTargets[0];
                const enemyTarget = finalTargets[1];

                if (!allyTarget?.id || !enemyTarget?.id) {
                    console.log('[以饵引狼] 目标不足（需各选一个我方与敌方单位），本次不结算');
                    break;
                }

                // ① 我方单位 → 贴【暴露】（永久，与钢羽傍身同口径）
                patchById(allyTarget.id, c => ({
                    ...c,
                    keywords: Array.from(new Set([...c.keywords, 'Exposed' as Keyword])),
                    animState: 'buff' as const,
                }));

                // ② 敌方单位 → 本回合 −4/−0（写临时账本 roundBuffs，回合末自动清算）
                // [2026-09-26 莉莉子 BUG修复] 必须显式传 'ROUND'：
                //   本 effect 的 params 是 {}（未配 duration）⇒ 原先落到默认 'PERMANENT'，
                //   −4 被写进永久账本 buffs.power；而回合末 clearRoundBuffsAndBarrier 只清 roundBuffs
                //   ⇒ 减益永久留存（程实测：下回合没加回来）。注释与实现原先不符，此处对齐。
                patchById(enemyTarget.id, c => applyStats(c, -4, 0, 'ROUND'));

                events.push({ type: 'sfx_buff', payload: null });
                console.log(`[以饵引狼] 暴露我方「${allyTarget.name}」→ 敌方「${enemyTarget.name}」本回合 -4/-0`);
                break;
            }

            // =====================================
            // [2026-09-26 1.0.16 茉莉安 · T17 猎影标记]
            // 柔性二选一（设计文档 7.1）：
            //   ① 目标未带【暴露】→ 贴上（永久，与以饵引狼 / 钢羽傍身同口径）
            //   ② 目标已带【暴露】→ 我方最强单位发起一次「额外攻击」挑战它
            //
            // 「额外攻击」的落地方式 —— 对齐**飞剑先例**，不新建通道：
            //   · 直接装配到交战区：{ attacker, blocker: 目标, owner, isChallenged, isExtraAttack }
            //     写法对齐 useGameState.ts「直送交战区（带预选挑战目标）」那条 AI 路径
            //   · isChallenged: true ⇒ useAI 的格挡逻辑会**跳过**该战位（useAI.ts:101），
            //     预指定的 blocker 不会被 AI 重新分配顶掉
            //   · isExtraAttack: true ⇒ useSpellSystem.settleStack / useGameState.passTurn 强制进入
            //     格挡阶段；战斗归位时**不消耗进攻标识**（与飞剑同一处例外）
            //
            // ⚠️ 为什么只从**备战席**挑发起者：本卡是慢速，只能在主阶段打出，
            //    而主阶段交战区必为空（每场战斗末尾 setCombatField([]) 与 phase:'main' 同批提交）
            //    ⇒「已在交战区的单位无法再发起攻击」这条天然成立，不必额外判断。
            //
            // ⚠️ 为什么排除 CantAttack：它本就无法进攻、攻击力只是面板数字，
            //    不排除的话「攻击力最高」会选中一个打不出伤害的单位，白白浪费这张牌。
            // =====================================
            if (effect.id === 'effect_marian_faction_mark') {
                const target = finalTargets[0];
                if (!target?.id) {
                    console.log('[猎影标记] 未选到目标，本次不结算');
                    break;
                }

                const isPlayerCaster = context.owner === 'player';
                const casterLabel = isPlayerCaster ? '我方' : '敌方';
                const foeLabel = isPlayerCaster ? '敌方' : '我方';
                const casterBench = isPlayerCaster ? nextPlayerBench : nextEnemyBench;

                // finalTargets 是入栈快照，须从最新战场按 id 找实时实例（防对手在栈上响应改过局面）
                const liveTarget = [
                    ...nextPlayerBench,
                    ...nextEnemyBench,
                    ...(nextCombatField ? nextCombatField.flatMap(f => [f.attacker, f.blocker]) : []),
                ].find(c => c && c.id === target.id);

                if (!liveTarget || liveTarget.isDead
                    || liveTarget.animState === 'dying' || liveTarget.animState === 'ephemeral_dying') {
                    console.log(`[猎影标记] 目标「${target.name}」已不在场，本次不结算`);
                    break;
                }

                const alreadyExposed = (liveTarget.keywords || []).includes('Exposed');

                // --- ① 未暴露 → 只贴【暴露】 ---
                if (!alreadyExposed) {
                    patchById(liveTarget.id, c => ({
                        ...c,
                        keywords: Array.from(new Set([...c.keywords, 'Exposed' as Keyword])),
                        animState: 'buff' as const,
                    }));
                    events.push({ type: 'sfx_buff', payload: null });
                    console.log(`[猎影标记] ${foeLabel}「${liveTarget.name}」未暴露 → 贴上【暴露】`);
                    break;
                }

                // --- ② 已暴露 → 我方最强（可进攻）单位发起一次额外攻击 ---
                const attacker = findStrongestUnit(
                    casterBench,
                    [], // 只从备战席挑：慢速⇒主阶段⇒交战区必为空
                    context.owner,
                    c => !(c.keywords || []).includes('CantAttack'),
                );
                const fieldCount = nextCombatField ? nextCombatField.length : 0;

                // [防御性守卫] 实测正常不可达（已暴露的目标必有来源单位在场）——
                //   真触发就退化为「只贴暴露」，绝不静默吞掉整张牌
                if (!attacker || fieldCount >= 6) {
                    console.warn(`[猎影标记] 无法发起额外攻击（${!attacker ? `${casterLabel}无可用单位` : '交战区已满 6'}）`
                        + ` → 退化为仅贴【暴露】`);
                    patchById(liveTarget.id, c => ({
                        ...c,
                        keywords: Array.from(new Set([...c.keywords, 'Exposed' as Keyword])),
                        animState: 'buff' as const,
                    }));
                    events.push({ type: 'sfx_buff', payload: null });
                    break;
                }

                // 发起者出备战席（对齐 toggleAttacker 的上场语义）
                if (isPlayerCaster) nextPlayerBench = nextPlayerBench.filter(c => c.id !== attacker.id);
                else nextEnemyBench = nextEnemyBench.filter(c => c.id !== attacker.id);

                // 目标从其备战席移除（对齐 challengeEnemy 的「拉取」语义）
                if (isPlayerCaster) nextEnemyBench = nextEnemyBench.filter(c => c.id !== liveTarget.id);
                else nextPlayerBench = nextPlayerBench.filter(c => c.id !== liveTarget.id);

                // 装配交战线：预指定 blocker + 被挑战标记 + 额外攻击标记
                nextCombatField = [
                    ...(nextCombatField || []),
                    {
                        attacker,
                        blocker: liveTarget,
                        owner: context.owner,
                        isChallenged: true,   // ⇒ useAI 格挡逻辑跳过该战位，预指定 blocker 不被顶掉
                        isExtraAttack: true,  // ⇒ 强制进入格挡阶段；归位时不消耗进攻标识
                    },
                ];

                events.push({ type: 'sfx_block', payload: null });
                console.log(`[猎影标记] ${casterLabel}「${attacker.name}」额外攻击 ${foeLabel}「${liveTarget.name}」`
                    + `（已暴露 → 强制挑战，不消耗进攻标识）`);
                break;
            }

            // =====================================
            // [2026-09-17 1.0.16 茉莉安 · T21 蕈影]
            // 入场：自动暴露【敌方攻击力最高】的单位 —— 无需玩家选目标
            // 设计文档 8.1：暴露目标自动执行，优先挑敌方攻击力最高者
            // =====================================
            if (effect.id === 'effect_truffle_mushroom_expose') {
                const oppOwner: 'player' | 'enemy' = context.owner === 'player' ? 'enemy' : 'player';
                const oppBench = oppOwner === 'player' ? nextPlayerBench : nextEnemyBench;

                // findStrongestUnit 会同时扫备战席与交战区（含格挡侧）
                // [2026-09-18 BUG修复] 跳过【已被暴露】的单位 ——
                //   否则多张蕈影每次都挑同一个「攻击力最高」的（如臆莲基座），信标这类低攻目标永远轮不到。
                const strongest = findStrongestUnit(
                    oppBench,
                    nextCombatField || [],
                    oppOwner,
                    (c) => !(c.keywords || []).includes('Exposed'),
                );

                if (!strongest) {
                    console.log('[蕈影] 敌方场上无存活单位，暴露落空');
                    break;
                }

                const applyExposed = (c: CardData): CardData => ({
                    ...c,
                    keywords: Array.from(new Set([...c.keywords, 'Exposed' as Keyword])),
                    animState: 'buff' as const,
                });

                // 与通用 BUFF 同口径：备战席 + 交战区都要覆盖（最强单位可能在交战区）
                nextPlayerBench = updateCardInList(nextPlayerBench, strongest.id, applyExposed);
                nextEnemyBench = updateCardInList(nextEnemyBench, strongest.id, applyExposed);
                if (nextCombatField) {
                    nextCombatField = nextCombatField.map(fight => {
                        const newFight = { ...fight };
                        if (newFight.attacker?.id === strongest.id) newFight.attacker = applyExposed(newFight.attacker);
                        if (newFight.blocker?.id === strongest.id) newFight.blocker = applyExposed(newFight.blocker);
                        return newFight;
                    });
                }

                events.push({ type: 'sfx_buff', payload: null });
                console.log(`[蕈影] 自动暴露敌方攻击力最高的单位：「${strongest.name}」`);
                break;
            }

            // =====================================
            // [2026-09-17 1.0.16 茉莉安 · T23 虹彩]
            // 入场：使所有獠牙信标的生命值上限【永久 -10】（含尚未登场的）
            // ① 场上现存的当场砍
            // ② 把修正记进 game state → 之后任何来源召唤的信标落场时套用（见 SUMMON 分支）
            // ⚠️ 是【上限】不是当前值减半（方案 8.1 关键细节）
            // =====================================
            if (effect.id === 'effect_truffle_iris_beacon_shrink') {
                const SHRINK = 3;

                // [2026-09-19 BUG修复] 保底口径改为【按有效血量】计算，且**绝不反向加血**
                // ── 病根：旧写法 `safeHp = damageTaken + 1` 只算了基础血量，**漏掉 buffs**。
                //    而卡面/结算读的是有效血量 = health + buffs.health + roundBuffs.health - damageTaken
                //    ⇒ 信标身上只要挂着生命 BUFF，保底就会算出「有效血量 = 1 + buffs」，
                //    凭空多出一截血 —— 程实测「敌方残血信标在我方虹彩入场后回了血」就是这个。
                // ── 旧写法另一个副作用：0 血待判死的信标会被这一刀"救活"到 1 血。
                // ── 新口径：这一刀后的有效血量 = clamp(≥1) 且【不得超过进入前的有效血量】⇒ 只减不增。
                const shrinkBeacon = (c: CardData): CardData => {
                    if (c.key !== 'Marian_Wolf_Tooth_Beacon') return c;
                    const newMax = Math.max(1, (c.maxHealth || 0) - SHRINK);
                    const buffH = (c.buffs?.health || 0) + (c.roundBuffs?.health || 0);
                    const taken = c.damageTaken || 0;
                    const effBefore = (c.health || 0) + buffH - taken;          // 进入前的有效血量
                    const rawHp = Math.max(1, (c.health || 0) - SHRINK);         // 这一刀后的基础血量
                    const rawEff = rawHp + buffH - taken;                        // 这一刀后的有效血量
                    // 保底 1 点（这一刀不该杀死信标），但绝不高于进入前 —— 原本已 ≤0 的保持原样，交给死亡清算
                    const targetEff = Math.min(Math.max(1, rawEff), effBefore);
                    return {
                        ...c,
                        maxHealth: newMax,
                        health: taken + targetEff - buffH, // 反解出基础血量，使有效血量恰好 = targetEff
                        animState: 'buff' as const,
                    };
                };

                nextPlayerBench = nextPlayerBench.map(shrinkBeacon);
                nextEnemyBench = nextEnemyBench.map(shrinkBeacon);
                if (nextCombatField) {
                    nextCombatField = nextCombatField.map(fight => {
                        const newFight = { ...fight };
                        if (newFight.attacker) newFight.attacker = shrinkBeacon(newFight.attacker);
                        if (newFight.blocker) newFight.blocker = shrinkBeacon(newFight.blocker);
                        return newFight;
                    });
                }

                nextGame.beaconMaxHealthMod = (nextGame.beaconMaxHealthMod || 0) - SHRINK;

                events.push({ type: 'sfx_buff', payload: null });
                console.log(`[虹彩] 所有獠牙信标生命上限永久 -${SHRINK}（本局累计修正 ${nextGame.beaconMaxHealthMod}）`);
                break;
            }

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

                    // [2026-07-07 修复] 关键词移除后置处理（如蟾鉴易纹：从友方移除幻象）
                    // ⚠️ 必须放在 applyKeywords 之后！否则 remove 了又被 add 回来。
                    // ⚠️ target.type 是 'ally'（小写），不是 'ALLY_UNIT'（大写）！
                    if (params.removeKeywords && params.removeKeywords.length > 0) {
                        const removeKws = params.removeKeywords;
                        // 仅对施法者自己的单位执行移除
                        if (target.type === 'ally') {
                            processed = {
                                ...processed,
                                keywords: processed.keywords.filter(k => !removeKws.includes(k)),
                            };
                            console.log('[BUFF] 从 ' + processed.name + ' 移除了关键词: ' + removeKws.join(', '));
                        }
                    }

                    // [2026-08-18 莉莉子] 藕断丝长：额外附加亡语（阵亡抽3）
                    // 亡语清算中心按 EFFECT_DB 动态查 timing=LAST_BREATH 的效果，无需改动核心引擎
                    if (effect.id === 'effect_mauxir_ouduan_si_chang') {
                        processed = {
                            ...processed,
                            effects: [...(processed.effects || []), 'effect_mauxir_ouduan_si_chang_death'],
                        };
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

            // [2026-07-16 达努·班西] BUFF 时同时生成衍生物到手牌
            if (params.generateKey && successfullyBuffedCount > 0) {
                const generatedBase = createCard(params.generateKey);
                const generatedCard: CardData = {
                    ...generatedBase,
                    id: Math.random().toString(36).substr(2, 9),
                    animState: 'idle',
                    damageTaken: 0,
                    buffs: { power: 0, health: 0 },
                    roundBuffs: { power: 0, health: 0 },
                    keywords: [...(generatedBase.keywords || [])]
                };
                if (context.owner === 'player' && nextPlayerHand.length < 10) {
                    nextPlayerHand.push(generatedCard);
                    console.log(`[Generate] ${context.sourceCard?.name} 生成 ${generatedCard.name} 到手牌`);
                } else if (context.owner === 'enemy' && nextEnemyHand.length < 10) {
                    nextEnemyHand.push(generatedCard);
                }
            }

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
            // =====================================
            // [2026-09-16 1.0.16 茉莉安 · T14] 钢羽傍身：对獠牙信标造成 N 点伤害
            // ── 伤害【来源于这张法术卡本身】，不归属茉莉安（设计文档 5.2）
            // ── 刻意不规避宿主的受伤类效果 —— 宿主给信标叠 buff 本来就是它的防守手段
            // ── 无信标则伤害落空（可打出性由 UI 层另行拦截）
            // =====================================
            // [2026-09-17 松露小队 · 流萤] damageBeaconBySelfPower：伤害改写为「施法者自身当前攻击力」
            //   流萤无人机是 2/1【幻象】，亡语结算时 sourceCard 即那具尸体，读它当时的攻击力
            const beaconDmg = params.damageBeaconBySelfPower && context.sourceCard
                ? getPower(context.sourceCard)
                : (params.damageBeaconBy || 0);
            if (beaconDmg > 0) {
                const hitBeacon = (c: CardData): CardData => {
                    if (c.key !== 'Marian_Wolf_Tooth_Beacon' || c.isDead || c.animState === 'dying') return c;
                    events.push({ type: 'unit_damage', payload: { id: c.id, amount: beaconDmg, key: c.key } }); // key 供音效层路由
                    return { ...c, damageTaken: (c.damageTaken || 0) + beaconDmg, animState: 'hit' as const };
                };
                // 信标默认只会站在【施法者的对面】备战席。
                // [2026-09-17 松露小队] 'opponent' 限定只打对面 ——
                // 夜视监察无人机是「我打水晶时顺带炸对面信标」，
                // 若敌方茉莉安的信标正落在我方半场，双边都扫会打爆自己的信标（亡语炸自己）。
                // 钢羽傍身（法术）仍走缺省的 'both'，保持历史行为不变。
                // [2026-09-18 BUG修复] 信标被【暴露】拉到战场上格挡时，只扫备战席会让它「隐身」——
                //   夜视监察无人机「打水晶时顺带炸信标」对场上信标完全不结算。
                //   交战区同样要扫：attacker 属 fight.owner，blocker 属对面。
                const hitBeaconInField = (side: 'player' | 'enemy') => {
                    if (!nextCombatField) return;
                    nextCombatField = nextCombatField.map(fight => {
                        let nf = fight;
                        if (fight.attacker && fight.owner === side) {
                            nf = { ...nf, attacker: hitBeacon(fight.attacker) };
                        }
                        const blockerSide: 'player' | 'enemy' = fight.owner === 'player' ? 'enemy' : 'player';
                        if (fight.blocker && blockerSide === side) {
                            nf = { ...nf, blocker: hitBeacon(fight.blocker) };
                        }
                        return nf;
                    });
                };

                if (params.damageBeaconSide === 'opponent') {
                    if (context.owner === 'player') {
                        nextEnemyBench = nextEnemyBench.map(hitBeacon);
                        hitBeaconInField('enemy');
                    } else {
                        nextPlayerBench = nextPlayerBench.map(hitBeacon);
                        hitBeaconInField('player');
                    }
                } else {
                    nextPlayerBench = nextPlayerBench.map(hitBeacon);
                    nextEnemyBench = nextEnemyBench.map(hitBeacon);
                    hitBeaconInField('player');
                    hitBeaconInField('enemy');
                }
                console.log(`[BeaconDebug] 对獠牙信标造成 ${beaconDmg} 点伤害（${params.damageBeaconSide === 'opponent' ? '仅对面' : '双边'}）`);
            }

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

            // ==========================================
            // [鬼怪小队] 瓦莲：全场 Buff / Debuff（瞬间生效，非光环）
            // ⚠️ 用 context.owner 判断"我方"/"敌方"，不能写死 player/enemy！
            // ==========================================
            if (params.allAlliesBuff) {
                const ab = params.allAlliesBuff as { power: number; health: number };
                const buffP = ab.power || 0;
                const buffH = ab.health || 0;
                const isPlayer = context.owner === 'player';
                // 我方备战席
                if (isPlayer) {
                    nextPlayerBench = nextPlayerBench.map(u => applyStats(u, buffP, buffH));
                } else {
                    nextEnemyBench = nextEnemyBench.map(u => applyStats(u, buffP, buffH));
                }
                // 我方交战区
                if (nextCombatField) {
                    nextCombatField = nextCombatField.map(fight => {
                        if (fight.owner === context.owner && fight.attacker) {
                            return { ...fight, attacker: applyStats(fight.attacker, buffP, buffH) };
                        }
                        return fight;
                    });
                }
                events.push({ type: 'nexus_effect', payload: { desc: `我方全员+${buffP}/+${buffH}` } });
            }
            if (params.allEnemiesDebuff) {
                const db = params.allEnemiesDebuff as { power: number; health: number };
                const debuffP = db.power || 0;
                const debuffH = db.health || 0;
                const isPlayer = context.owner === 'player';
                // 敌方备战席
                if (isPlayer) {
                    nextEnemyBench = nextEnemyBench.map(u => applyStats(u, debuffP, debuffH));
                } else {
                    nextPlayerBench = nextPlayerBench.map(u => applyStats(u, debuffP, debuffH));
                }
                // 敌方交战区
                if (nextCombatField) {
                    nextCombatField = nextCombatField.map(fight => {
                        if (fight.owner !== context.owner) {
                            const newFight = { ...fight };
                            if (newFight.attacker) newFight.attacker = applyStats(newFight.attacker, debuffP, debuffH);
                            if (newFight.blocker) newFight.blocker = applyStats(newFight.blocker, debuffP, debuffH);
                            return newFight;
                        }
                        return fight;
                    });
                }
                events.push({ type: 'nexus_effect', payload: { desc: `敌方全员${debuffP}/${debuffH}` } });
            }

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
            // [2026-08-05 莉莉子] 撤回 vs 召回：
            // returnToHand = true → 撤回（单位回【手牌】，洗掉所有 BUFF）
            // 否则 → 召回（单位回【备战席】，原行为）
            const returnToHand = params.returnToHand === true;

            const applyRecallBuff = (c: CardData) => ({
                ...c,
                keywords: Array.from(new Set([...c.keywords, ...keywordsToGrant]))
            });

            // [2026-08-05 莉莉子] 撤回回手牌：洗掉所有 BUFF，生成干净模板（保留当前费用）
            const toHandCard = (c: CardData): CardData => {
                const clean = createCard(c.key);
                return { ...clean, cost: c.cost };
            };

            // [2026-08-05 莉莉子] 撤回去向：按目标归属方回对应手牌；手牌满(≥10)视作抽卡爆牌销毁
            const sendToHand = (unit: CardData, unitOwner: 'player' | 'enemy') => {
                const handCard = toHandCard(unit);
                const handLimit = 10;
                if (unitOwner === 'player') {
                    if (nextPlayerHand.length < handLimit) {
                        nextPlayerHand = [...nextPlayerHand, handCard];
                        events.push({ type: 'sfx_generate', payload: handCard });
                    } else {
                        events.push({ type: 'shatter', payload: unit });
                        console.log(`[撤回] 手牌已满，${unit.name} 视作抽卡爆牌销毁`);
                    }
                } else {
                    if (nextEnemyHand.length < handLimit) {
                        nextEnemyHand = [...nextEnemyHand, handCard];
                        events.push({ type: 'sfx_generate', payload: handCard });
                    } else {
                        events.push({ type: 'shatter', payload: unit });
                        console.log(`[撤回] 敌方手牌已满，${unit.name} 视作抽卡爆牌销毁`);
                    }
                }
            };

            // 检查目标是否在交战区
            if (nextCombatField) {
                const combatIdx = nextCombatField.findIndex(f => f.attacker?.id === target.id || f.blocker?.id === target.id);
                if (combatIdx !== -1) {
                    const fight = nextCombatField[combatIdx];
                    const isAttacker = fight.attacker?.id === target.id;
                    let recalledUnit = isAttacker ? fight.attacker! : fight.blocker!;

                    // 赋予屏障等 buff
                    recalledUnit = applyRecallBuff(recalledUnit);

                    // 归属方：攻击者归 fight.owner，阻挡者归对侧
                    const unitOwner = isAttacker
                        ? fight.owner
                        : (fight.owner === 'player' ? 'enemy' : 'player');

                    // 从交战区拔除
                    if (isAttacker) {
                        nextCombatField.splice(combatIdx, 1); // 攻击者撤退，这一路交锋直接取消
                    } else {
                        // [核心铺垫：空气墙机制] 不仅仅是 blocker: null，必须打上 isGhostBlocked 标记！
                        nextCombatField[combatIdx] = { ...fight, blocker: null, isGhostBlocked: true } as any;
                    }

                    if (returnToHand) {
                        // 撤回 → 回对应手牌（洗 buff；手牌满爆牌）
                        sendToHand(recalledUnit, unitOwner);
                        events.push({ type: 'sfx_recall_block', payload: null });
                    } else {
                        // 召回 → 回对应方备战席（原行为）
                        const bench = unitOwner === 'player' ? nextPlayerBench : nextEnemyBench;
                        bench.push(recalledUnit);
                        events.push({ type: 'sfx_recall_block', payload: null });
                        events.push({ type: 'sfx_buff', payload: null });
                    }
                    break;
                }
            }

            // 目标不在交战区 → 查找备战席
            const playerIdx = nextPlayerBench.findIndex(c => c.id === target.id);
            const enemyIdx = nextEnemyBench.findIndex(c => c.id === target.id);
            const benchOwner = playerIdx >= 0 ? 'player' : (enemyIdx >= 0 ? 'enemy' : null);

            if (benchOwner) {
                const idx = benchOwner === 'player' ? playerIdx : enemyIdx;
                const benchUnit = applyRecallBuff(benchOwner === 'player' ? nextPlayerBench[idx] : nextEnemyBench[idx]);

                if (returnToHand) {
                    // 撤回备战席单位 → 从备战席移除 → 回对应手牌
                    if (benchOwner === 'player') nextPlayerBench = nextPlayerBench.filter(c => c.id !== target.id);
                    else nextEnemyBench = nextEnemyBench.filter(c => c.id !== target.id);
                    sendToHand(benchUnit, benchOwner);
                } else {
                    // 召回：目标在备战席时原行为 = 原地赋予屏障
                    // [2026-08-08 莉莉子修复] 把带屏障的副本写回备战席（此前创建 benchUnit 后即丢弃，屏障从未真正生效）
                    if (benchOwner === 'player') nextPlayerBench = nextPlayerBench.map(c => c.id === target.id ? benchUnit : c);
                    else nextEnemyBench = nextEnemyBench.map(c => c.id === target.id ? benchUnit : c);
                    events.push({ type: 'sfx_buff', payload: null });
                }
            }

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
        // [安卡希雅] 飞剑系统 (FLYING_SWORD)
        // 召唤飞剑衍生物到战场作为攻击者，立即打击敌方水晶
        // 参数: summonCount(数量), condition('great_sword'=强制大飞剑), power/health(附加Buff)
        // 安卡希雅 Lv2 在场时：所有飞剑自动替换为大飞剑
        // =====================================
        case 'FLYING_SWORD': {
            const fsParams = effect.params as EffectParams;
            let fsCount = fsParams.summonCount || 1;

            // [2026-07-30 安卡希雅] 集束效果虽只召1剑，但朔望之期减费按4计算（等效扩散的飞剑4）
            const discountCount = effect.id === 'effect_acacia_moon_focus' ? 4 : fsCount;

            // 检测该玩家场上是否有安卡希雅 Lv2
            const ownerBench = context.owner === 'player' ? nextPlayerBench : nextEnemyBench;
            const hasAcaciaLv2OnBench = ownerBench.some(c => c.key === 'acacia_chrono_echo' && (c as any).level === 2);
            const hasAcaciaLv2OnField = nextCombatField?.some(f => {
                const unit = f.owner === context.owner ? f.attacker : f.blocker;
                return unit && unit.key === 'acacia_chrono_echo' && (unit as any).level === 2;
            });
            const isGreatSword = fsParams.condition === 'great_sword' || hasAcaciaLv2OnBench || hasAcaciaLv2OnField;

            // 集束效果自带参数（power/health/keywords），其他效果用默认值
            const tokenKey = isGreatSword ? 'Acacia_Great_Sword' : 'Acacia_Flying_Sword';
            const basePower = isGreatSword ? 2 : 1;
            const baseHealth = isGreatSword ? 1 : 1;
            const extraPower = fsParams.power || 0;
            const extraHealth = fsParams.health || 0;
            const extraKeywords = (fsParams.keywords || []) as any[];

            // [2026-08-28 莉莉子 修复] 镜爻同款保护：交战区满 6 格不再硬塞飞剑（防止超过 6 个一起进攻）。
            // 满场一把都没召出 → 整个飞剑效果跳过（计数/减费/阿尔维娜/玛格丽特充能都不触发），与镜爻满场不召唤语义一致。
            let anySwordSummoned = false;
            for (let i = 0; i < fsCount; i++) {
                if (nextCombatField && nextCombatField.length >= 6) {
                    console.log(`[飞剑] 交战区已满（${nextCombatField.length}/6），停止召唤飞剑。`);
                    break;
                }
                // 1. 创建飞剑衍生物
                const token = createCard(tokenKey);
                const sword = {
                    ...token,
                    id: Math.random().toString(36).substr(2, 9),
                    power: basePower + extraPower,
                    health: baseHealth + extraHealth,
                    maxHealth: baseHealth + extraHealth,
                    strikeCount: 0,
                    animState: 'idle' as const,
                    damageTaken: 0,
                    buffs: { power: 0, health: 0 },
                    roundBuffs: { power: 0, health: 0 },
                    // [2026-07-31 修复] 合并模板自带关键词（大飞剑的 Overwhelm 等），而非覆盖——
                    // 否则安卡 Lv2 在场/月镰剑势召唤的大飞剑会丢失碾压
                    keywords: Array.from(new Set([...(token.keywords || []), 'Ephemeral', ...extraKeywords])),
                };

                // 2. 添加到交战区作为攻击者（等待格挡阶段）
                if (nextCombatField) {
                    nextCombatField = [...nextCombatField, {
                        attacker: { ...sword, animState: 'summoning' },
                        blocker: null,
                        owner: context.owner === 'player' ? 'player' : 'enemy',
                    }];
                    anySwordSummoned = true;
                }
                // 不再直接造成水晶伤害——飞剑需要通过格挡→战斗结算来打伤害
            }
            // 满场一把都没召出 → 整个飞剑效果跳过（计数/减费/阿尔维娜/玛格丽特充能不触发）
            if (!anySwordSummoned) break;

            // [2026-07-29 安卡希雅] 飞剑计数系统（按 discountCount 累计，确保集中模式等效 4 剑）
            if (context.owner === 'player') {
                nextGame.playerFlyingSwordsTotal = (nextGame.playerFlyingSwordsTotal || 0) + discountCount;
                nextGame.playerRoundFlyingSwords = (nextGame.playerRoundFlyingSwords || 0) + discountCount; // [2026-07-31] 本回合累计
                nextGame.playerRoundSwordUsed = true;
                if (isGreatSword) {
                    nextGame.playerGreatSwordsTotal = (nextGame.playerGreatSwordsTotal || 0) + discountCount;
                }
            } else {
                nextGame.enemyFlyingSwordsTotal = (nextGame.enemyFlyingSwordsTotal || 0) + discountCount;
                nextGame.enemyRoundFlyingSwords = (nextGame.enemyRoundFlyingSwords || 0) + discountCount; // [2026-07-31] 本回合累计
                nextGame.enemyRoundSwordUsed = true;
                if (isGreatSword) {
                    nextGame.enemyGreatSwordsTotal = (nextGame.enemyGreatSwordsTotal || 0) + discountCount;
                }
            }

            // [安卡希雅] 飞剑减费：朔望之期 + 剑痕时空 按本次飞剑数减费
            const discountTargets = ['acacia_chrono_echo_ultimate', 'acacia_sword_timeline'];
            const fsTargetHand = context.owner === 'player' ? nextPlayerHand : nextEnemyHand;
            for (let hi = 0; hi < fsTargetHand.length; hi++) {
                if (discountTargets.includes(fsTargetHand[hi].key)) {
                    const target = { ...fsTargetHand[hi] };
                    const oldCost = target.cost || 0;
                    if (oldCost > 0) {
                        target.cost = Math.max(0, oldCost - discountCount);
                        target.customProgress = (target.customProgress || 0) | 2; // 绿色费用标记
                        fsTargetHand[hi] = target;
                        console.log(`[飞剑] 召唤→${target.name}费用 ${oldCost}→${target.cost} (折扣:${discountCount})`);
                    }
                }
            }

            // [2026-08-06 莉莉子 法术19] 本回合飞剑 ≥4 → 手牌中"法术19"费用-2（本回合生效，绿色标记）
            const fsCountThisRound = context.owner === 'player'
                ? nextGame.playerRoundFlyingSwords
                : nextGame.enemyRoundFlyingSwords;
            if ((fsCountThisRound || 0) >= 4) {
                const spell19Hand = context.owner === 'player' ? nextPlayerHand : nextEnemyHand;
                for (let hi2 = 0; hi2 < spell19Hand.length; hi2++) {
                    if (spell19Hand[hi2].key === 'temp_spell_19') {
                        const target19 = { ...spell19Hand[hi2] };
                        // 未减过费（bit2 未置位）才减，避免多次召唤飞剑重复减费
                        if (!((target19.customProgress || 0) & 2)) {
                            const oldCost19 = target19.cost || 0;
                            target19.cost = Math.max(0, oldCost19 - 2);
                            target19.customProgress = (target19.customProgress || 0) | 2; // 绿色费用标记
                            spell19Hand[hi2] = target19;
                            console.log(`[法术19] 本回合飞剑${fsCountThisRound}≥4 → ${target19.name}费用 ${oldCost19}→${target19.cost}`);
                        }
                    }
                }
            }

            // [玛格丽特] 进攻时额外点亮 Channel 充能：重置黯淡 + 获得 1 法术法力
            if (effect.id === 'effect_sacred_tree_margaret') {
                const margBench = context.owner === 'player' ? nextPlayerBench : nextEnemyBench;
                const margIdx = margBench.findIndex((c: any) => c.key === 'Sacred_Tree_Squad_Margaret');
                if (margIdx >= 0) {
                    const marg = margBench[margIdx];
                    const oldDepleted = marg.depletedKeywords || [];
                    // 从 depletedKeywords 移除 Channel（重新点亮）
                    const newDepleted = oldDepleted.filter((k: string) => k !== 'Channel');
                    // 获得 1 法术法力
                    if (context.owner === 'player') {
                        nextGame.playerSpellMana = Math.min(3, (nextGame.playerSpellMana || 0) + 1);
                    } else {
                        nextGame.enemySpellMana = Math.min(3, (nextGame.enemySpellMana || 0) + 1);
                    }
                    // 触发后立即黯淡
                    newDepleted.push('Channel');
                    margBench[margIdx] = {
                        ...marg,
                        depletedKeywords: newDepleted,
                        animState: 'channel_pulse',
                    };
                    console.log(`[玛格丽特] 进攻充能：法术法力 +1，Channel 已重置并黯淡`);
                }
            }

            // [2026-07-31 安卡希雅] 专属音效：按召唤数量依次错开播放（飞剑/大飞剑）
            // 飞剑4 → 4 声依次略微延迟错开，营造接连出鞘的节奏
            const acaciaSfxEvent = isGreatSword ? GameEvents.SFX_ACACIA_GREAT_SWORD : GameEvents.SFX_ACACIA_SWORD;
            for (let i = 0; i < fsCount; i++) {
                setTimeout(() => {
                    eventBus.emit(acaciaSfxEvent);
                }, i * 180);
            }
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

                // [LILITH-DEBUG] 镜爻卜卜复制排查：记录每次克隆召唤的落点
                if (cardKey === 'Mirror_pupu') {
                    console.log(`[LILITH-DEBUG][CLONE] 触发! source=${context.sourceCard.key}(${context.sourceCard.name}) owner=${context.owner} zone=${zone} combatLen=${nextCombatField ? nextCombatField.length : 'undefined'} benchLen=${targetBench.length} phase=${context.game?.phase}`);
                }

                // 3. 空降逻辑 (完美复用 SUMMON 的安全气囊机制)
                // [2026-08-16 莉莉子] 镜爻卜卜特殊处理：去除安全气囊——交战区无空位直接不召唤（不回退备战席）
                if (zone === 'combat' && nextCombatField) {
                    if (nextCombatField.length < 6) {
                        nextCombatField.push({
                            attacker: { ...clonedCard, animState: 'idle' },
                            blocker: null,
                            owner: context.owner
                        });
                        events.push({ type: 'summon_combat', payload: clonedCard });
                        if (cardKey === 'Mirror_pupu') console.log(`[LILITH-DEBUG][CLONE] → 落点: 交战区 (len=${nextCombatField.length})`);
                    }
                    else if (cardKey === 'Mirror_pupu') {
                        // 镜爻卜卜：战场（交战区）已满 → 直接不召唤
                        console.log(`[EffectProcessor] CLONE_AND_SUMMON 镜爻卜卜：交战区已满（${nextCombatField.length}/6），直接不召唤。`);
                    }
                    // 其他克隆（如肉鸽暗影双生）保持原有安全气囊：交战区满 → 回退备战席
                    else if (targetBench.length < 6) {
                        targetBench.push({ ...clonedCard, animState: 'summoning' });
                        events.push({ type: 'summon', payload: clonedCard });
                    }
                } else {
                    if (targetBench.length < 6) {
                        targetBench.push({ ...clonedCard, animState: 'summoning' });
                        events.push({ type: 'summon', payload: clonedCard });
                        if (cardKey === 'Mirror_pupu') console.log(`[LILITH-DEBUG][CLONE] → 落点: 备战席 (zone=${zone} 非 combat)`);
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

                        // 3. 决定去向：placeOnTop → 牌库顶，否则加入手牌
                        if (params.placeOnTop) {
                            // 放到牌库顶（梅贝尔等导游类效果）
                            targetDeck.unshift(tutoredCard);
                            console.log(`[Tutor] 成功将 ${tutoredCard.name} 从位置 ${foundIndex} 提取并置于牌库顶！`);
                        } else {
                            // 默认：加入手牌（其他检索类效果）
                            const targetHand = context.owner === 'player' ? nextPlayerHand : nextEnemyHand;
                            if (targetHand.length < 10) {
                                targetHand.push(tutoredCard);
                                console.log(`[Tutor] 成功将 ${tutoredCard.name} 从位置 ${foundIndex} 提取并加入手牌！`);
                                // 发射抽卡动画事件，演出从牌库飞入中央再到手牌的完整流程
                                const animId = nextAnimId('tutor', context.owner, tutoredCard.id);
                                eventBus.emit(GameEvents.DRAW_START, {
                                    animId,
                                    card: tutoredCard,
                                    owner: context.owner,
                                    skipHandAdd: true, // 卡已在手牌中，仅播动画
                                });
                            } else {
                                targetDeck.unshift(tutoredCard);
                                console.log(`[Tutor] 手牌已满(10/10)，将 ${tutoredCard.name} 置于牌库顶！`);
                            }
                        }
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
            // [新增] 提取召唤数量，默认为 1
            // [2026-09-17 松露小队 · 榆] summonCountPerExposedEnemy：动态召唤数
            //   「每有一个【暴露】的敌人，召唤一个」——值为上限（榆 = 5，取自敌方 6 格备战席减去榆自己占的 1 格）
            let count = params.summonCount || 1;
            if (params.summonCountPerExposedEnemy) {
                const oppOwner: 'player' | 'enemy' = context.owner === 'player' ? 'enemy' : 'player';
                const oppBench = oppOwner === 'player' ? nextPlayerBench : nextEnemyBench;
                const isExposedAlive = (c: CardData) =>
                    !c.isDead
                    && c.animState !== 'dying'
                    && c.animState !== 'ephemeral_dying'
                    && (c.keywords || []).includes('Exposed');

                // 备战席 + 交战区（对面那一侧的攻守两侧都要算，与 findStrongestUnit 口径一致）
                let exposed = oppBench.filter(isExposedAlive).length;
                if (nextCombatField) {
                    exposed += nextCombatField
                        .flatMap(f => {
                            const list: CardData[] = [];
                            if (f.owner === oppOwner && f.attacker) list.push(f.attacker);
                            if (f.owner !== oppOwner && f.blocker) list.push(f.blocker);
                            return list;
                        })
                        .filter(isExposedAlive).length;
                }

                count = Math.min(exposed, params.summonCountPerExposedEnemy);
                console.log(`[榆] 敌方【暴露】单位 ${exposed} 个 → 召唤 ${count} 个（上限 ${params.summonCountPerExposedEnemy}）`);
            }

            if (cardKey) {
                // [新增] 开启循环，支持生成多张卡牌
                for (let i = 0; i < count; i++) {
                    let newCard = createCard(cardKey);
                    setEliceInitialCharge(newCard);

                    // =====================================
                    // [2026-09-17 1.0.16 松露小队 · T23 虹彩] 獠牙信标落场时套用「生命上限永久修正」
                    // 这一步是 E8 的关键：修正记在 game state 上，
                    // 任何来源召唤的信标（④库效 / 茉莉安本体入场 / 支援技 / 虹彩自身）都吃得到，
                    // 不需要（也绝不能）去改 CARD_DB —— 那是模块级常量，改它会跨局污染。
                    // =====================================
                    // [2026-09-19 莉莉子 收口] 改为调用公共装配器 —— 本处是原先**唯一**套用修正的分支，
                    //   另两条召唤路径（回合开始④库效 / 对局开始④库效）走 createFullCard 直建、绕过了它。
                    //   收口后三条路径共用同一道工序，详见 gameRules.assembleBeaconCard 的注释。
                    newCard = assembleBeaconCard(newCard, nextGame.beaconMaxHealthMod);

                    // =====================================
                    // [2026-09-16 茉莉安 · 跨阵营召唤] 解析召唤落点的阵营
                    // ── 落点完全由「写进哪个备战席数组」决定：单位的归属 / 渲染 / AI 三态
                    //    全部派生自数组本身，故此处只需重绑数组引用，下游判定一行都不必改。
                    // ── params.summonSide 缺省为 'self' → landingOwner === context.owner，
                    //    与改动前逐字节等价（零回归）。'opponent' 时落到对方半场（獠牙信标）。
                    // =====================================
                    const landingOwner: 'player' | 'enemy' = params.summonSide === 'opponent'
                        ? (context.owner === 'player' ? 'enemy' : 'player')
                        : context.owner;

                    // =====================================
                    // [全域光环安检] 确保新召唤的单位不会错失之前贴过的 Everywhere Buff
                    // [2026-06-27 巴德尔试剂] 增加 owner 匹配，只继承己方光环
                    // [2026-09-16 茉莉安] 匹配基准由「施法者」改为「落点阵营」——
                    //   跨阵营召唤时落点方是对方，不该继承施法者的光环（缺省时二者相同，零回归）
                    // =====================================
                    const globalAuras = (nextGame as any).everywhereBuffs || [];
                    globalAuras.forEach((aura: any) => {
                        if (aura.owner && aura.owner !== landingOwner) return; // 不是落点方的光环跳过
                        if (aura.targetKeyRequirement && aura.targetKeyRequirement.some((req: string) => newCard.key.includes(req))) {
                            newCard.buffs = {
                                power: (newCard.buffs?.power || 0) + (aura.power || 0),
                                health: (newCard.buffs?.health || 0) + (aura.health || 0)
                            };
                            newCard.keywords = Array.from(new Set([...newCard.keywords, ...(aura.keywords || [])]));
                        }
                    });

                    // 动态获取落点阵营对应的备战席和手牌
                    // ⚠️ summonSide 只作用于【备战席】落点（含交战区满员后的退格兜底）；
                    //    「手牌」与「交战区」两个落点仍恒为施法者自己一侧 —— 本版无此需求，不做推测性实现
                    const targetBench = landingOwner === 'player' ? nextPlayerBench : nextEnemyBench;
                    const targetHand = context.owner === 'player' ? nextPlayerHand : nextEnemyHand;

                    // =====================================
                    // [2026-09-23 莉莉子 · 重器制空重做] 柔性二选一：「有雷就炸雷，没雷就埋雷」
                    //
                    // ── 病根（旧版）：本效果只有「召唤」这一条腿，而卡面的打出条件又是
                    //    「落点没有信标」；可 ④库效 在【对局开始】就放了一个 ⇒
                    //    整局都打不出去，是一张**结构性死牌**。
                    // ── 新语义：落点半场已有【存活】的信标 → 改为对其造成 `damageBeaconBy` 点伤害，
                    //    本次不召唤。存在性判定走 hasLiveUnitOfSide ⇒ **备战席 + 交战区**都算
                    //    （信标可被【挑战者】拖上场格挡，只查备战席会误判为「没有」而多召唤一个）。
                    // ── ⚠️ 刻意「短路」：本效果内部二选一，**不会**出现「打掉 5 点、又立刻补一个新的」。
                    //    这与卡面「有则打、无则召唤」一致。若将来拆成两段独立效果，
                    //    打死信标后会当场再召唤一个（等同免费重新部署）—— 那是另一种设计，勿混。
                    // =====================================
                    const beaconStrike = params.damageBeaconBy || 0;
                    if (beaconStrike > 0 && cardKey
                        && hasLiveUnitOfSide(landingOwner, nextPlayerBench, nextEnemyBench, nextCombatField, cardKey)) {
                        const strikeBeacon = (c: CardData): CardData => {
                            if (c.key !== cardKey || c.isDead
                                || c.animState === 'dying' || c.animState === 'ephemeral_dying') return c;
                            events.push({ type: 'unit_damage', payload: { id: c.id, amount: beaconStrike, key: c.key } });
                            return { ...c, damageTaken: (c.damageTaken || 0) + beaconStrike, animState: 'hit' as const };
                        };

                        // 备战席
                        if (landingOwner === 'player') nextPlayerBench = nextPlayerBench.map(strikeBeacon);
                        else nextEnemyBench = nextEnemyBench.map(strikeBeacon);

                        // 交战区（与 hitBeaconInField 同源：attacker 属 fight.owner，blocker 属其对面）
                        if (nextCombatField) {
                            nextCombatField = nextCombatField.map(fight => {
                                let nf = fight;
                                if (fight.attacker && fight.owner === landingOwner) {
                                    nf = { ...nf, attacker: strikeBeacon(fight.attacker) };
                                }
                                const blockerSide: 'player' | 'enemy' = fight.owner === 'player' ? 'enemy' : 'player';
                                if (fight.blocker && blockerSide === landingOwner) {
                                    nf = { ...nf, blocker: strikeBeacon(fight.blocker) };
                                }
                                return nf;
                            });
                        }

                        console.log(`[重器制空] ${landingOwner} 半场已有存活「${cardKey}」→ 造成 ${beaconStrike} 点伤害（本次不召唤）`);
                        continue;
                    }

                    // [2026-09-16 茉莉安 T13] 落点已有同名单位 → 不召唤
                    //   用于信标的「场上最多 1 个」（设计文档 3.6）
                    // =====================================
                    // [2026-09-19 T44 茉莉安] 入场即发「补兵券」（修正 T39 的语义）
                    // ── 新语义：她这次入场**占用了**一个信标名额（要么当场召唤、要么因已有而跳过），
                    //    该名额对应的信标若被击败，就用这张券补回来 ⇒ 入场投入不会白费。
                    // ── 为什么不再「只在落点已有时才发」：那会让两种情形永久断档 ——
                    //    ① 落点只有【尸体】时（尸体挡住了召唤，见下方的存活判定）
                    //    ② 她当场召唤的信标被自己那一记狙击打死时
                    //    两种情形都是「场上没有活信标 + 手上没有券」⇒ 券永远兑现不了。
                    // ── 按施法者阵营记账（镜像对局双方各算各的）
                    // ⚠️ 必须放在【召唤循环之外】：否则 summonCount>1 时会重复发券
                    // ⚠️ 本效果 timing 为 ON_PLAY，回合开始不会走到这里，故不会每回合白送券
                    // =====================================
                    if (params.entryVoucher) {
                        const voucherSide = context.owner;
                        const voucherMap = { ...(nextGame.marianBeaconVoucher || {}) };
                        voucherMap[voucherSide] = (voucherMap[voucherSide] || 0) + 1;
                        nextGame.marianBeaconVoucher = voucherMap;
                        console.log(`[Summon] ${voucherSide} 侧茉莉安入场 → 发放「补兵券」（现有 ${voucherMap[voucherSide]} 张）`);
                    }

                    // [2026-09-19 T44 BUG修复] 「已有」判定必须只认【存活】的 ——
                    //   信标死后尸体会在数组里留 ~2.5s（等死亡动画），此前只比 key ⇒ 尸体把召唤挡住，
                    //   又因为改发券而券无处兑现 ⇒ 永久断档。
                    //   （同一类修复见 useRoundLifecycle 的 scanLibrarySummon，2026-09-18）
                    // [2026-09-23 莉莉子 · 重器制空重做] 顺带收口到 hasLiveUnitOfSide：
                    //   原实现只扫 `targetBench`（备战席）⇒ 信标被【挑战者】拖到战场上格挡时，
                    //   这里会判成「场上没有」而**再召唤一个**，破坏设计文档 3.6 的「同时最多 1 个」。
                    //   本参数目前唯二的使用者（茉莉安本体入场 / 支援技）都是信标召唤，改动对二者一致。
                    if (params.summonOnlyIfAbsent && cardKey
                        && hasLiveUnitOfSide(landingOwner, nextPlayerBench, nextEnemyBench, nextCombatField, cardKey)) {
                        console.log(`[Summon] ${landingOwner} 半场已有【存活】的「${cardKey}」，summonOnlyIfAbsent 跳过`);
                        continue;
                    }

                    // [2026-09-19 莉莉子 方向一 · 归属盖章] 落场即定归属，此后查表不推导
                    // ── 备战席落点 = landingOwner（跨阵营召唤时是对方，如獠牙信标）
                    // ── 交战区 / 手牌落点不参与 summonSide 重绑（见上注），恒为施法者自己一侧
                    //    （newCard 是上面刚 new 出来的可变对象，此处盖章不会污染卡牌原型数据）
                    newCard.unitOwner = zone === 'bench' ? landingOwner : context.owner;

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
                                attacker: { ...newCard, animState: 'summoning' }, // 给予攻击状态动画
                                blocker: null,
                                owner: context.owner
                            });
                            events.push({ type: 'summon_combat', payload: newCard });
                        }
                        // [2026-08-16 莉莉子] 镜爻特殊处理：去除安全气囊——交战区无空位直接不召唤（不回退备战席/退手牌）
                        else if (newCard.key === 'Mirror') {
                            console.log(`[Summon] 镜爻：交战区已满（${nextCombatField.length}/6），直接不召唤。`);
                        }
                        // 优先级 2 (安全气囊): 交战区已满，退格空降到备战席
                        else if (targetBench.length < 6) {
                            console.log(`[Summon] 交战区已满，${newCard.name} 退格召唤至备战席。`);
                            targetBench.push(newCard);
                            events.push({ type: 'summon', payload: newCard });
                        }
                        // 优先级 3 (安全气囊): 全场爆满 → 退手牌 / 碎掉
                        else {
                            const handLimit = 10;
                            if (targetHand.length < handLimit) {
                                const handCard = { ...newCard, cost: 0 };
                                targetHand.push(handCard);
                                events.push({ type: 'sfx_generate', payload: handCard });
                                console.log(`[Summon] 全场已满，${newCard.name} 退回手牌（费用降为0）。`);
                            } else {
                                console.log(`[Summon] 全场和手牌均已满，${newCard.name} 被摧毁。`);
                                events.push({ type: 'shatter', payload: newCard });
                            }
                        }
                    } else {
                        // =====================================
                        // [常规] 传统备战席召唤逻辑 + 满员安全气囊
                        // =====================================
                        if (targetBench.length < 6) {
                            targetBench.push({ ...newCard, animState: 'summoning' });
                            events.push({ type: 'summon', payload: newCard });

                            // [2026-07-10 绿灵·行李箱机器人] 被召唤时全牌库BUFF
                            if (newCard.key === 'Green_Spirit_Squad_LuggageBot') {
                                const deck = context.owner === 'player' ? nextPlayerDeck : nextEnemyDeck;
                                if (deck) {
                                    if (context.owner === 'player') {
                                        nextPlayerDeck = buffAllUnitsInDeck(deck, 1, 1);
                                    } else {
                                        nextEnemyDeck = buffAllUnitsInDeck(deck, 1, 1);
                                    }
                                    const buffCount = deck.filter(c => c.type?.includes('unit')).length;
                                    console.log(`[Green_Debug] 🤖 行李箱机器人被召唤：牌库${buffCount}个单位全+1+1`);
                                    events.push({ type: 'sfx_buff', payload: { source: 'deck_all', power: 1, health: 1 } });
                                }
                            }
                        } else {
                            // [2026-07-18] 备战席已满 → 退回手牌（费用降为0）
                            const handLimit = 10;
                            if (targetHand.length < handLimit) {
                                const handCard = { ...newCard, cost: 0 };
                                targetHand.push(handCard);
                                events.push({ type: 'sfx_generate', payload: handCard });
                                console.log(`[Summon] 备战席已满，${newCard.name} 退回手牌（费用降为0）。`);
                            } else {
                                console.log(`[Summon] 备战席和手牌均已满，${newCard.name} 被摧毁。`);
                                events.push({ type: 'shatter', payload: newCard });
                            }
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

            // [2026-07-10 精灵小队] 自动目标解析：无目标参数时自动检索
            if (finalTargets.length === 0 && effect.targetRequirements.length === 0) {
                if (effect.params?.targetCondition === 'all_injured') {
                    // 斯涅妮卡：治疗所有受伤友方（备战席+交战区）
                    const bench = context.owner === 'player' ? nextPlayerBench : nextEnemyBench;
                    // [SpiritDebug] 斯涅妮卡回合末治疗目标扫描
                    if (effect.id === 'effect_spirit_snenika_roundend_heal') {
                        const injuredOnBench = bench.filter(c => c && (c.damageTaken || 0) > 0);
                        console.log(`[SpiritDebug] HEAL all_injured扫描: owner=${context.owner}, 备战席共${bench.length}个单位, 受伤${injuredOnBench.length}个:`, injuredOnBench.map(c => `${c.name}(damage=${c.damageTaken || 0})`));
                    }
                    bench.forEach(c => {
                        if (c && (c.damageTaken || 0) > 0) finalTargets.push({ id: c.id });
                    });
                    if (nextCombatField) {
                        // [SpiritDebug] 交战区受伤扫描
                        if (effect.id === 'effect_spirit_snenika_roundend_heal') {
                            const injuredInField = nextCombatField.filter(fight => {
                                const u = fight.owner === context.owner ? fight.attacker : fight.blocker;
                                return u && u.id && (u.damageTaken || 0) > 0;
                            });
                            console.log(`[SpiritDebug] HEAL 交战区扫描: 共${nextCombatField.length}个战斗槽, 受伤${injuredInField.length}个`);
                        }
                        nextCombatField.forEach(fight => {
                            const unit = fight.owner === context.owner ? fight.attacker : fight.blocker;
                            if (unit && unit.id && (unit.damageTaken || 0) > 0) finalTargets.push({ id: unit.id });
                        });
                    }
                } else if (context.sourceCard) {
                    // 邦尼/无目标自愈：治疗自身
                    finalTargets.push({ id: context.sourceCard.id });
                }
            }

            finalTargets.forEach(target => {
                // [2026-06-27 生机补充] 支持治疗水晶
                if (target.type === 'player_nexus' || target.type === 'enemy_nexus') {
                    const isPlayer = target.type === 'player_nexus';
                    const currentHP = isPlayer ? nextGame.playerNexus : nextGame.enemyNexus;
                    // [2026-08-11] 玩家水晶回血上限跟随 playerNexusMax（肉鸽=run.maxHp，真衔接必需），敌方仍固定 20
                    const nexusMax = isPlayer ? (nextGame.playerNexusMax ?? NEXUS_MAX_HP) : (nextGame.enemyNexusMax ?? NEXUS_MAX_HP);
                    const actualHeal = Math.min(nexusMax - currentHP, amount);

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
                    // [2026-09-25 莉莉子 三线任务化框架 · Pact 常驻代价] 终焉契约：此卡无法被治疗 —— 直接原样返回
                    if (c.cantBeHealed) return c;
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

                // [2026-07-10 精灵祈愿] 治疗后附加 buff（+攻/+血）
                if ((effect.params?.power || 0) > 0 || (effect.params?.health || 0) > 0) {
                    const applyBuff = (c: CardData): CardData => {
                        const newBuffs = {
                            power: (c.buffs?.power || 0) + (effect.params.power || 0),
                            health: (c.buffs?.health || 0) + (effect.params.health || 0),
                        };
                        events.push({ type: 'unit_buff', payload: { id: c.id, power: effect.params.power || 0, health: effect.params.health || 0 } });
                        return { ...c, buffs: newBuffs, animState: 'buff' as const };
                    };
                    nextPlayerBench = updateCardInList(nextPlayerBench, target.id, applyBuff);
                    nextEnemyBench = updateCardInList(nextEnemyBench, target.id, applyBuff);
                    if (nextCombatField) {
                        nextCombatField = nextCombatField.map(fight => {
                            let newF = { ...fight };
                            if (newF.attacker && newF.attacker.id === target.id) newF.attacker = applyBuff(newF.attacker);
                            if (newF.blocker && newF.blocker.id === target.id) newF.blocker = applyBuff(newF.blocker);
                            return newF;
                        });
                    }
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
            // =====================================
            // [2026-07-11 绿灵小队] 牌库BUFF：格伦茨(2个)/艾娃(标记)/行李箱机器人
            // =====================================
            if (effect.id === 'effect_green_glanz_buff') {
                const deck = context.owner === 'player' ? nextPlayerDeck : nextEnemyDeck;
                if (deck) {
                    const result = buffTopUnitInDeck(deck, 0, 1, 2);
                    if (result.buffed) {
                        if (context.owner === 'player') nextPlayerDeck = result.deck;
                        else nextEnemyDeck = result.deck;
                        console.log(`[Green_Debug] 🛡️ 格伦茨触发：牌库顶两个单位+0+1，末位=${result.buffedUnit?.name}`);
                    } else {
                        console.warn(`[Green_Debug] 🛡️ 格伦茨：牌库中无单位可BUFF`);
                    }
                }
                break;
            }
            // 艾娃的光环由 useGameState.ts 的 playCard 检测触发，BUFF_EVERYWHERE 中不做实际操作
            if (effect.id === 'effect_green_eva_aura') {
                break;
            }
            if (effect.id === 'effect_green_luggage_buff') {
                const deck = context.owner === 'player' ? nextPlayerDeck : nextEnemyDeck;
                if (deck) {
                    const buffedDeck = buffAllUnitsInDeck(deck, 1, 1);
                    if (context.owner === 'player') nextPlayerDeck = buffedDeck;
                    else nextEnemyDeck = buffedDeck;
                    const buffCount = buffedDeck.filter(c => c.type?.includes('unit')).length;
                    console.log(`[Green_Debug] 🤖 行李箱机器人（${context.owner}）：牌库中${buffCount}个单位全部+1+1`);
                    events.push({ type: 'sfx_buff', payload: { source: 'deck_all', power: 1, health: 1 } });
                }
                break; // 牌库BUFF完成后跳出
            }

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
                if ((c as any).buffRules?.power?.allowedTags) {
                    if (!params.buffTag || !(c as any).buffRules.power.allowedTags.includes(params.buffTag)) {
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
                // [BUGFIX 2026-07-03] finalTargets[0] 是 { type, id } 而非 CardData！
                // 必须先从手牌找到完整卡牌对象，再发事件给动画
                const hand = context.owner === 'player' ? nextPlayerHand : nextEnemyHand;
                const discardedCard = hand.find(c => c.id === discardId);
                // [2026-07-22 莉莉子] 延迟移除：保留卡片在手牌中，由动画回调 onHandAnimComplete 处理移除
                // 不再立即过滤掉，让手牌中的卡片原位播放碎裂动画
                events.push({ type: 'sfx_discard', payload: { id: discardId } });
                if (discardedCard) {
                    eventBus.emit('hand_spell_discard', { card: discardedCard, owner: context.owner });
                } else {
                    console.warn("[Discard] 在手牌中找不到对应的卡牌数据");
                }
                console.log(`[Discard] 已丢弃手牌 ${discardId}`);
            } else {
                console.warn("[Discard] 没有指定要丢弃的手牌目标");
            }
            break;
        }

        // =====================================
        // [布里吉] 机制 12：弃牌+召唤 (DISCARD_AND_SUMMON)
        // 瓦莱莉：弃任意手牌 → 召唤夜巡猫头鹰
        // 玩家侧由 UI 层(confirmValerieDiscard)处理弃牌交互
        // 此分支为敌方/AI 侧提供自动弃牌 + 召唤的完整链路
        // =====================================
        case 'DISCARD_AND_SUMMON': {
            const summonKey = effect.params.summonKey;
            const zone = effect.params.summonZone || 'bench';
            let discardCount = 0;

            // —— 敌方/AI 侧：自动决定弃牌数量并执行 ——
            if (context.owner === 'enemy') {
                const aiCount = (effect.params as any).aiDiscardCount ?? 2;
                discardCount = Math.min(aiCount, nextEnemyHand.length);

                if (discardCount > 0) {
                    const discarded: CardData[] = [];
                    for (let i = 0; i < discardCount; i++) {
                        const idx = Math.floor(Math.random() * nextEnemyHand.length);
                        discarded.push(nextEnemyHand.splice(idx, 1)[0]);
                    }
                    discarded.forEach(c => {
                        events.push({ type: 'sfx_discard', payload: { id: c.id } });
                    });
                    console.log(`[DiscardAndSummon] AI 弃置了 ${discardCount} 张手牌`);
                }
            }
            // 玩家侧：discardCount 保持 0，由 hook 层的 confirmValerieDiscard 全权处理

            // —— 召唤衍生物（夜巡猫头鹰）——
            if (summonKey) {
                let newCard = createCard(summonKey);

                // 弃牌 buff：每弃一张 +1/+1
                if (discardCount > 0) {
                    newCard.buffs = {
                        ...(newCard.buffs || {}),
                        power: (newCard.buffs?.power || 0) + discardCount,
                        health: (newCard.buffs?.health || 0) + discardCount,
                    };
                }
                newCard.customProgress = discardCount;

                // [全域光环安检] 确保新召唤的单位不会错失之前贴过的 Everywhere Buff
                const globalAuras = (nextGame as any).everywhereBuffs || [];
                globalAuras.forEach((aura: any) => {
                    if (aura.owner && aura.owner !== context.owner) return;
                    if (aura.targetKeyRequirement?.some((req: string) => newCard.key.includes(req))) {
                        newCard.buffs = {
                            power: (newCard.buffs?.power || 0) + (aura.power || 0),
                            health: (newCard.buffs?.health || 0) + (aura.health || 0)
                        };
                        newCard.keywords = [...new Set([...newCard.keywords, ...(aura.keywords || [])])];
                    }
                });

                const targetBench = context.owner === 'player' ? nextPlayerBench : nextEnemyBench;
                if (zone === 'combat' && nextCombatField && nextCombatField.length < 6) {
                    nextCombatField.push({
                        attacker: { ...newCard, animState: 'idle' },
                        blocker: null,
                        owner: context.owner
                    });
                    events.push({ type: 'summon_combat', payload: newCard });
                } else if (targetBench.length < 6) {
                    targetBench.push({ ...newCard, animState: 'summoning' });
                    events.push({ type: 'summon', payload: newCard });
                } else {
                    console.warn(`[DiscardAndSummon] 备战席已满，${newCard.name} 无法入场`);
                }
            }

            break;
        }

        // =====================================
        // [新增] 机制 10：抽牌 (DRAW)
        // [2026-06-27 暗箱操作] 从牌库抽 N 张到手上
        // =====================================
        case 'DRAW': {
            let drawCount = effect.params.value || 1;

            // [2026-07-09 燃尽] 使用燃尽机制：抽牌数 = (mana + spellMana) / 2，且清零法力
            if (effect.params.useBurnout) {
                const owner = context.owner;
                const burnout = owner === 'player'
                    ? (context.game.playerMana || 0) + (context.game.playerSpellMana || 0)
                    : (context.game.enemyMana || 0) + (context.game.enemySpellMana || 0);
                drawCount = Math.floor(burnout / 2);
                console.log(`[Burnout] 燃尽值=${burnout} 抽牌数=${drawCount}`);
                // 清零法力（返回给 caller 的 game 状态）
                if (owner === 'player') {
                    nextGame.playerMana = 0;
                    nextGame.playerSpellMana = 0;
                } else {
                    nextGame.enemyMana = 0;
                    nextGame.enemySpellMana = 0;
                }
            }

            // [2026-07-09 猫头鹰] 使用亡语弃牌计数：抽牌数 = (discardCount - 1)
            if (effect.params.useDiscardCount) {
                const discardCount = context.sourceCard?.customProgress || 0;
                drawCount = Math.max(0, discardCount - 1);
                console.log(`[OwlDeath] 弃牌数=${discardCount} 亡语抽牌数=${drawCount}`);
            }

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
                    eventBus.emit(GameEvents.DRAW_BURN, { card: burnedCard, owner: context.owner });
                    continue;
                }
                const drawnCard = deck.shift()!;
                ownerHand.push(drawnCard);
                events.push({ type: 'sfx_draw', payload: drawnCard });
                console.log(`[Draw] 抽到 ${drawnCard.name}`);
            }
            break;
        }

        // =====================================
        // [布里吉] 机制 11：生成卡牌到手牌 (GENERATE)
        // 菲儿的能力：生成"强行通讯"到手牌
        // =====================================
        case 'GENERATE': {
            const genKey = effect.params.generateKey as string;
            if (!genKey) {
                console.warn("[Generate] 缺少 generateKey，无法生成卡牌。");
                break;
            }
            const targetHand = context.owner === 'player' ? nextPlayerHand : nextEnemyHand;

            // [2026-07-17 鸦眼小队] 重复减费模式：若手牌中已有该卡牌，则减费而非生成
            if (effect.params.reduceCostIfDuplicate) {
                const existingIdx = targetHand.findIndex(c => c.key === genKey);
                if (existingIdx !== -1) {
                    const updated = { ...targetHand[existingIdx] };
                    const oldCost = updated.cost || 0;
                    updated.cost = Math.max(0, oldCost - 1);
                    updated.customProgress = (updated.customProgress || 0) | 2; // 标记绿色费用
                    targetHand[existingIdx] = updated;
                    events.push({ type: 'sfx_generate', payload: updated });
                    console.log(`[Generate] 手牌中已有 ${updated.name}，费用 ${oldCost}→${updated.cost}`);
                    break;
                }
            }

            let newCard = createCard(genKey);
            // [2026-07-30 安卡希雅] 灵轨月轮模式 & Lv2升阶：生成扩散→根据状态决定替换
            if (genKey === 'acacia_sword_rain') {
                // 先检测安卡是否已升级到 Lv2 → 生成月镰剑势，忽略集束/扩散模式
                const ownerBench = context.owner === 'player' ? nextPlayerBench : nextEnemyBench;
                const isAcaciaLv2 = ownerBench.some(c => c.key === 'acacia_chrono_echo' && c.level === 2);
                if (isAcaciaLv2) {
                    newCard = createCard('acacia_sword_rain_alt');
                    console.log(`[安卡Lv2] 灵轨月轮·扩散 → 月镰剑势 (升级生效)`);
                } else {
                    // Lv1：检测集束模式
                    const focusMode = context.owner === 'player'
                        ? nextGame.playerAcaciaSwordFocus
                        : nextGame.enemyAcaciaSwordFocus;
                    if (focusMode) {
                        newCard = createCard('acacia_moon_focus');
                        console.log(`[圆缺有律·生效] 灵轨月轮·扩散 → 灵轨月轮·集束 (模式生效)`);
                    }
                }
            }
            // [安卡希雅] 生成的卡牌若需易逝(Volatile)，追加关键词
            if (effect.params.isVolatile) {
                newCard = { ...newCard, keywords: [...(newCard.keywords || []), 'Volatile' as any] };
            }
            if (targetHand.length < 10) {
                // [2026-09-04 莉莉子 修复] 同 id 去重：同一实例若已在该手牌（事件重复双触），不再追加，防 React key 撞车
                if (!targetHand.some(c => c.id === newCard.id)) {
                    targetHand.push(newCard);
                    // [2026-07-09] 改为 sfx_generate 事件，由动画层处理"中央展示→飞入手中"
                    events.push({ type: 'sfx_generate', payload: newCard });
                    console.log(`[GenerateDebug] 生成了 ${newCard.name} 到 ${context.owner} 手牌 (effect=${effect.id})`);
                } else {
                    console.warn(`[Generate] ⚠️ ${newCard.name} 已在手牌（id=${newCard.id}），跳过重复生成`);
                }
            } else {
                console.log(`[Generate] 手牌已满(10/10)，${newCard.name} 被销毁`);
            }
            break;
        }

        // =====================================
        // [诗人] 机制 13：克隆到手牌并洗入牌库 (CLONE_TO_DECK)
        // 真实快照：选择手牌的一张卡牌，创建 N 张副本洗入牌库
        // =====================================
        case 'CLONE_TO_DECK': {
            const cloneCount = effect.params.value || 3;
            if (finalTargets.length > 0 && finalTargets[0].id) {
                const hand = context.owner === 'player' ? nextPlayerHand : nextEnemyHand;
                const deck = context.owner === 'player' ? nextPlayerDeck : nextEnemyDeck;
                if (!deck) { console.warn("[CloneToDeck] 牌库不存在"); break; }

                const sourceCard = hand.find(c => c.id === finalTargets[0].id);
                if (!sourceCard) { console.warn("[CloneToDeck] 在手牌中找不到目标卡牌"); break; }

                const sourceKey = sourceCard.key;
                const clones: CardData[] = [];
                for (let i = 0; i < cloneCount; i++) {
                    clones.push(createCard(sourceKey));
                }

                // 将克隆体加入牌库
                if (context.owner === 'player') {
                    nextPlayerDeck = [...(nextPlayerDeck ?? []), ...clones]; // [2026-08-27] 判空
                } else {
                    nextEnemyDeck = [...(nextEnemyDeck ?? []), ...clones];
                }

                events.push({ type: 'sfx_shuffle', payload: { count: cloneCount, sourceKey } });
                console.log(`[CloneToDeck] 复制了 ${cloneCount} 张 ${sourceCard.name} 并洗入牌库`);

                // [2026-09-13 莉莉子] 逐张播放"中央亮相 → 翻背飞回牌库"动画。
                // 按 180ms 递进错开：每张各自亮相满 500ms 再起飞，形成连珠效果而不糊成一坨。
                clones.forEach((clone, i) => {
                    eventBus.emit(GameEvents.CARD_TO_DECK, {
                        animId: nextAnimId('todeck', context.owner, clone.id),
                        card: clone,
                        owner: context.owner,
                        delay: i * 180,
                    });
                });
            } else {
                console.warn("[CloneToDeck] 没有指定要复制的目标手牌");
            }
            break;
        }

        // =============================================
        // [2026-08-18 莉莉子] 机制：面板强制设定 (SET_STATS)
        // 止水凝形：本回合将任意单位的面板强制设置为 1/6
        // 原理：复用临时账本 roundBuffs，注入等额偏移把真实面板"强行"拉到目标值，
        //       回合末被全局清理机制自动还原（与冻结引擎同一套路）
        // =============================================
        case 'SET_STATS': {
            const targetPower = effect.params.targetPower ?? 1;
            const targetHealth = effect.params.targetHealth ?? 6;
            const setTarget = finalTargets[0];
            if (!setTarget || !setTarget.id) { console.warn("[SetStats] 缺少目标单位"); break; }

            const applyOverride = (c: CardData): CardData => {
                const curPower = getPower(c);
                const curHealth = getHealth(c);
                const offsetP = targetPower - curPower;
                const offsetH = targetHealth - curHealth;
                return {
                    ...c,
                    roundBuffs: {
                        power: (c.roundBuffs?.power || 0) + offsetP,
                        health: (c.roundBuffs?.health || 0) + offsetH,
                    },
                    animState: 'buff' as const,
                };
            };

            nextPlayerBench = updateCardInList(nextPlayerBench, setTarget.id, applyOverride);
            nextEnemyBench = updateCardInList(nextEnemyBench, setTarget.id, applyOverride);

            // 同步交战区中的目标（战斗中被定格的单位）
            if (nextCombatField) {
                nextCombatField = nextCombatField.map(fight => {
                    const newFight = { ...fight };
                    if (newFight.attacker && newFight.attacker.id === setTarget.id) newFight.attacker = applyOverride(newFight.attacker);
                    if (newFight.blocker && newFight.blocker.id === setTarget.id) newFight.blocker = applyOverride(newFight.blocker);
                    return newFight;
                });
            }

            const targetName = [...nextPlayerBench, ...nextEnemyBench].find(c => c.id === setTarget.id)?.name ?? '单位';
            events.push({ type: 'sfx_buff', payload: { id: setTarget.id } });
            console.log(`[SetStats] ${targetName} 面板强制设定为 ${targetPower}/${targetHealth}（本回合）`);
            break;
        }

        // =============================================
        // [2026-08-18 莉莉子] 机制：复制到手 (CLONE_TO_HAND)
        // 忆影拓印：选择任意单位，生成一张瞬逝的白板复制牌到手牌
        // 白板 = 基础面板（createCard 天然不带增益/装备），保留原卡关键词
        // =============================================
        case 'CLONE_TO_HAND': {
            const cloneTarget = finalTargets[0];
            if (!cloneTarget || !cloneTarget.id) { console.warn("[CloneToHand] 缺少目标单位"); break; }

            let sourceUnit = nextPlayerBench.find(c => c.id === cloneTarget.id)
                || nextEnemyBench.find(c => c.id === cloneTarget.id);
            if (!sourceUnit && nextCombatField) {
                const fight = nextCombatField.find(f => f.attacker?.id === cloneTarget.id || f.blocker?.id === cloneTarget.id);
                if (fight) sourceUnit = fight.attacker?.id === cloneTarget.id ? fight.attacker : fight.blocker;
            }
            if (!sourceUnit) { console.warn("[CloneToHand] 找不到目标单位实体"); break; }

            const HAND_MAX = 10;
            const ownerHand = context.owner === 'player' ? nextPlayerHand : nextEnemyHand;
            if (ownerHand.length >= HAND_MAX) {
                console.warn(`[CloneToHand] 手牌已满(${HAND_MAX}/10)，复制牌被销毁`);
                events.push({ type: 'sfx_draw_burn', payload: { name: sourceUnit.name } });
                break;
            }

            // createCard 返回基础白板（无增益/装备），保留原卡关键词 → 附加瞬逝
            const clone = createCard(sourceUnit.key);
            const volatileClone: CardData = {
                ...clone,
                keywords: [...(clone.keywords || []), 'Volatile' as Keyword],
                isCollectible: false,
            };
            ownerHand.push(volatileClone);
            events.push({ type: 'sfx_generate', payload: volatileClone });
            console.log(`[CloneToHand] 复制 ${sourceUnit.name} → 手牌（瞬逝白板）`);
            break;
        }

        // =============================================
        // [2026-07-14 锻造者] 机制 14：打击减费 (COST_REDUCE)
        // 蕾西亚：打击敌方水晶后，减少我方费用最高的手牌1点费用
        // =============================================
        case 'COST_REDUCE': {
            const hand = context.owner === 'player' ? nextPlayerHand : nextEnemyHand;
            const reduceAmount = effect.params.value || 1;

            if (hand.length === 0) {
                console.warn("[CostReduce] 手牌为空，无法减费");
                break;
            }

            // 找费用最高的手牌
            let highestCost = -1;
            let highestIdx = -1;
            hand.forEach((c, i) => {
                const cost = c.cost ?? 0;
                if (cost > highestCost) {
                    highestCost = cost;
                    highestIdx = i;
                }
            });

            if (highestIdx >= 0 && highestCost > 0) {
                const targetCard = { ...hand[highestIdx] };
                // 实际减费 + 标记 bit1（用于视觉绿色显示）
                targetCard.cost = Math.max(0, (targetCard.cost || 0) - reduceAmount);
                targetCard.customProgress = (targetCard.customProgress || 0) | 2;
                hand[highestIdx] = targetCard;

                if (context.owner === 'player') {
                    nextPlayerHand = [...hand];
                } else {
                    nextEnemyHand = [...hand];
                }

                events.push({ type: 'sfx_cost_reduce', payload: { cardId: targetCard.id, amount: reduceAmount } });
                console.log(`[CostReduce] ${targetCard.name} 费用 ${highestCost}→${targetCard.cost}（标记 bit1 绿色显示）`);
            } else {
                console.log("[CostReduce] 所有手牌费用已为0，无法减费");
            }
            break;
        }

        // =============================================
        // [2026-07-14 锻造者] 机制 15：法术增伤光环 (SPELL_DAMAGE_AURA)
        // 实际增伤在 STRIKE 中由 getSpellDamageBonus 处理
        // =============================================
        case 'SPELL_DAMAGE_AURA': {
            console.log(`[SpellDamageAura] 缇坦妮娅法术增伤光环已激活 (owner=${context.owner})`);
            events.push({ type: 'sfx_aura', payload: { name: effect.name, owner: context.owner } });
            break;
        }

        // =============================================
        // [2026-07-14 锻造者] 机制 16：从手牌召唤 (SUMMON_FROM_HAND)
        // 白猎：选择一个手牌中的单位，赋予+3/+0和碾压并从手牌中召唤
        // =============================================
        case 'SUMMON_FROM_HAND': {
            const params = effect.params;
            const hand = context.owner === 'player' ? nextPlayerHand : nextEnemyHand;
            const bench = context.owner === 'player' ? nextPlayerBench : nextEnemyBench;

            // [2026-07-15] AI侧自动选择手牌单位
            if (finalTargets.length === 0 && context.owner === 'enemy') {
                const maxCost = params.maxCost as number | undefined;
                const validUnits = hand.filter(c =>
                    c.type?.includes('unit') && (maxCost === undefined || (c.cost || 0) < maxCost)
                );
                if (validUnits.length === 0) {
                    console.warn("[SummonFromHand] AI 手牌中没有可召唤的单位");
                    break;
                }
                if (bench.length >= 6) {
                    console.warn("[SummonFromHand] AI 备战席已满，无法召唤");
                    break;
                }
                const picked = validUnits[Math.floor(Math.random() * validUnits.length)];
                finalTargets = [{ id: picked.id }];
                console.log(`[SummonFromHand] AI 自动选择了 ${picked.name} 进行召唤`);
            }

            if (finalTargets.length > 0 && finalTargets[0].id) {

                const sourceCard = hand.find(c => c.id === finalTargets[0].id);
                if (!sourceCard) {
                    console.warn("[SummonFromHand] 在手牌中找不到目标卡牌");
                    break;
                }

                // [2026-07-14] 检查是否为单位卡牌
                if (sourceCard.type !== 'unit' && !sourceCard.type?.includes('unit')) {
                    console.warn(`[SummonFromHand] 目标卡牌 ${sourceCard.name} 不是单位卡牌（type=${sourceCard.type}），无法召唤`);
                    break;
                }

                // [2026-07-14 白猎调整] 检查费用上限
                const maxCost = effect.params.maxCost;
                if (maxCost !== undefined && (sourceCard.cost || 0) >= maxCost) {
                    console.warn(`[SummonFromHand] 目标卡牌 ${sourceCard.name} 的费用为 ${sourceCard.cost}，不满足 < ${maxCost} 的条件`);
                    break;
                }

                if (bench.length >= 6) {
                    console.warn("[SummonFromHand] 备战席已满(6/6)，无法召唤");
                    break;
                }

                // 创建强化副本
                const newUnit = createCard(sourceCard.key);
                newUnit.power = (newUnit.power || 0) + (params.power || 0);
                newUnit.health = (newUnit.health || 0) + (params.health || 0);
                if (params.keywords && Array.isArray(params.keywords)) {
                    // [2026-08-16 莉莉子] string[] → Keyword[] 断言（效果参数关键词统一 string 处理）
                    newUnit.keywords = [...(newUnit.keywords || []), ...(params.keywords as Keyword[])];
                }
                newUnit.animState = 'summoning';

                bench.push(newUnit);

                // 从手牌移除
                if (context.owner === 'player') {
                    nextPlayerHand = nextPlayerHand.filter(c => c.id !== finalTargets[0].id);
                } else {
                    nextEnemyHand = nextEnemyHand.filter(c => c.id !== finalTargets[0].id);
                }

                events.push({ type: 'summon', payload: newUnit });
                console.log(`[SummonFromHand] 召唤了 ${newUnit.name}（从 ${sourceCard.name} 强化而来）`);
            } else {
                console.warn("[SummonFromHand] 没有指定要召唤的手牌目标");
            }
            break;
        }

        // =============================================
        // [2026-07-14 梵音] 机制 17：额外法力 (GRANT_MANA)
        // grantMaxMana=true → 永久增加法力上限并补满当前法力
        // grantMaxMana=false/无 → 本回合额外法力（默认）
        // =============================================
        case 'GRANT_MANA': {
            const bonusMana = effect.params.value || 1;
            const owner = context.owner;
            const grantMax = effect.params.grantMaxMana as boolean | undefined;
            if (owner === 'player') {
                if (grantMax) {
                    // [2026-07-22 莉莉子] 法力上限不超过 10，当前法力不超过上限
                    nextGame.playerMaxMana = Math.min(10, nextGame.playerMaxMana + bonusMana);
                    nextGame.playerMana = Math.min(nextGame.playerMaxMana, nextGame.playerMana + bonusMana);
                    console.log(`[GrantMana] 玩家法力上限+${bonusMana}（当前=${nextGame.playerMana}/${nextGame.playerMaxMana}）`);
                } else {
                    nextGame.playerMana = Math.min(nextGame.playerMaxMana, nextGame.playerMana + bonusMana);
                    console.log(`[GrantMana] 玩家获得 ${bonusMana} 点临时法力（当前=${nextGame.playerMana}/${nextGame.playerMaxMana}）`);
                }
            } else {
                if (grantMax) {
                    nextGame.enemyMaxMana = Math.min(10, nextGame.enemyMaxMana + bonusMana);
                    nextGame.enemyMana = Math.min(nextGame.enemyMaxMana, nextGame.enemyMana + bonusMana);
                } else {
                    nextGame.enemyMana = Math.min(nextGame.enemyMaxMana, nextGame.enemyMana + bonusMana);
                }
            }
            events.push({ type: 'sfx_generate', payload: null }); // 复用生成音效
            break;
        }

        // =====================================
        // [2026-07-17 鸦眼小队] 牌库BUFF (DECK_BUFF)
        // =====================================
        case 'DECK_BUFF': {
            const deckBuffCount = effect.params.count || 1;
            const deckBuffPower = effect.params.power || 0;
            const deckBuffHealth = effect.params.health || 0;
            const deckBuffTarget = effect.params.targetType || 'unit';

            const targetDeck = context.owner === 'player' ? nextPlayerDeck : nextEnemyDeck;
            if (!targetDeck || targetDeck.length === 0) {
                console.warn(`[DeckBuff] 牌库为空，无法施加牌库BUFF`);
                break;
            }

            // 筛选符合条件的卡牌索引
            const validIndices: number[] = [];
            targetDeck.forEach((card, idx) => {
                if (deckBuffTarget === 'unit' && card.type?.includes('unit')) {
                    validIndices.push(idx);
                }
            });

            if (validIndices.length === 0) {
                console.warn(`[DeckBuff] 牌库中没有符合条件的卡牌`);
                break;
            }

            // 随机选取（最多 deckBuffCount 个，不足则取全部）
            const shuffled = [...validIndices].sort(() => Math.random() - 0.5);
            const selectedIndices = shuffled.slice(0, Math.min(deckBuffCount, shuffled.length));

            // 施加 buff
            selectedIndices.forEach(idx => {
                targetDeck[idx] = {
                    ...targetDeck[idx],
                    buffs: {
                        power: (targetDeck[idx].buffs?.power || 0) + deckBuffPower,
                        health: (targetDeck[idx].buffs?.health || 0) + deckBuffHealth,
                    },
                };
            });

            events.push({ type: 'sfx_buff', payload: null });
            console.log(`[DeckBuff] 牌库中 ${selectedIndices.length} 个单位获得 +${deckBuffPower}/+${deckBuffHealth}`);
            break;
        }

        // =====================================
        // [2026-07-17 鸦眼小队] 校准 (CALIBRATE)
        // =====================================
        case 'CALIBRATE': {
            const calibrateCount = effect.params.calibrateCount || 4;
            const deck = context.owner === 'player' ? nextPlayerDeck : nextEnemyDeck;
            if (!deck || deck.length === 0) {
                console.warn(`[Calibrate] 牌库为空，无法校准`);
                break;
            }

            // 从牌库中随机抽取 calibrateCount 张
            const drawnCards: { card: CardData; originalIndex: number }[] = [];
            const available = Array.from({ length: deck.length }, (_, i) => i);

            for (let i = 0; i < Math.min(calibrateCount, deck.length); i++) {
                const pick = Math.floor(Math.random() * available.length);
                const origIdx = available.splice(pick, 1)[0];
                drawnCards.push({ card: { ...deck[origIdx] }, originalIndex: origIdx });
            }

            // 从牌库中移除被抽出的卡
            const drawnSet = new Set(drawnCards.map(d => d.originalIndex));
            const deckMinus = deck.filter((_, i) => !drawnSet.has(i));

            // 挂起校准状态
            nextGame = {
                ...nextGame,
                calibratePending: {
                    drawnCards,
                    deckMinus,
                    owner: context.owner,
                }
            } as any;

            events.push({ type: 'calibrate_start', payload: { count: drawnCards.length } });
            console.log(`[Calibrate] 从 ${deck.length} 张牌库中抽出 ${drawnCards.length} 张，等待玩家选择`);
            break;
        }

        // =====================================
        // [2026-08-05 莉莉子] 泰坦脉冲 (TITAN_PULSE)
        // 法术4：立刻触发我方所有单位的泰坦脉冲（复用 executeTitanPulse）
        // =====================================
        case 'TITAN_PULSE': {
            const isPlayer = context.owner === 'player';
            // executeTitanPulse 第一参=己方板，第二参=敌方板（用于统计全场泰坦数）
            const pulseResult = executeTitanPulse(
                isPlayer ? nextPlayerBench : nextEnemyBench,
                isPlayer ? nextEnemyBench : nextPlayerBench
            );
            nextPlayerBench = isPlayer ? pulseResult.playerBoard : pulseResult.enemyBoard;
            nextEnemyBench = isPlayer ? pulseResult.enemyBoard : pulseResult.playerBoard;

            if (pulseResult.pulsedUnits > 0) {
                events.push({ type: 'titan_pulse', payload: { pulsedUnits: pulseResult.pulsedUnits, pulseAmount: pulseResult.pulseAmount } });
            }

            // 消费脉冲副效果事件（乙型扫射 random_barrage / 盖弥尔全场AOE aoe_damage）
            // 简化实现：直接对敌方单位造成伤害（屏障拦截 + 坚韧减伤 + 标准受击事件）
            for (const evt of pulseResult.events) {
                const victimBoard = evt.owner === 'player' ? nextEnemyBench : nextPlayerBench;
                const applyDmg = (c: CardData): CardData => {
                    let dmg = evt.params.damage || 0;
                    let nc = { ...c };
                    if (nc.keywords.includes('Barrier') && dmg > 0) {
                        events.push({ type: 'sfx_shield_break', payload: null });
                        nc.depletedKeywords = [...(nc.depletedKeywords || []), 'Barrier'];
                        nc.animState = 'hit' as const;
                        dmg = 0;
                    }
                    if (nc.keywords.includes('Tough') && dmg > 0) {
                        dmg = Math.max(0, dmg - 1);
                    }
                    if (dmg > 0) {
                        events.push({ type: 'unit_damage', payload: { id: nc.id, amount: dmg } });
                        nc.damageTaken = (nc.damageTaken || 0) + dmg + deadlyLethalInject(nc, dmg); // [2026-09-12 莉莉子 剧毒] 擦伤即解构
                        nc.animState = 'hit' as const;
                    }
                    return nc;
                };

                if (evt.type === 'random_barrage') {
                    // 随机扫射：N 发，每发命中一个随机存活敌方单位
                    const validIds = victimBoard
                        .filter(c => !c.isDead && (c.damageTaken || 0) < c.maxHealth)
                        .map(c => c.id);
                    for (let i = 0; i < (evt.params.shots || 0) && validIds.length > 0; i++) {
                        const pick = validIds[Math.floor(Math.random() * validIds.length)];
                        if (evt.owner === 'player') {
                            nextEnemyBench = updateCardInList(nextEnemyBench, pick, applyDmg);
                        } else {
                            nextPlayerBench = updateCardInList(nextPlayerBench, pick, applyDmg);
                        }
                    }
                } else if (evt.type === 'aoe_damage') {
                    // 全场AOE：对敌方所有单位造成伤害
                    const allIds = victimBoard.map(c => c.id);
                    for (const id of allIds) {
                        if (evt.owner === 'player') {
                            nextEnemyBench = updateCardInList(nextEnemyBench, id, applyDmg);
                        } else {
                            nextPlayerBench = updateCardInList(nextPlayerBench, id, applyDmg);
                        }
                    }
                }
            }
            break;
        }

        // =====================================
        // [2026-08-05 莉莉子] 泰坦点亮 (TITAN_RELIGHT)
        // 法术3：再次点亮我方所有泰坦单位的关键词（移除黯淡）
        // =====================================
        case 'TITAN_RELIGHT': {
            const isPlayer = context.owner === 'player';
            const relight = (c: CardData): CardData => {
                if (!c.keywords.includes('Titan')) return c;
                if (!(c.depletedKeywords || []).includes('Titan')) return c;
                return {
                    ...c,
                    depletedKeywords: (c.depletedKeywords || []).filter(k => k !== 'Titan'),
                    animState: 'buff' as const,
                };
            };

            // 我方备战席
            if (isPlayer) {
                nextPlayerBench = nextPlayerBench.map(relight);
            } else {
                nextEnemyBench = nextEnemyBench.map(relight);
            }
            // 我方交战区单位
            if (nextCombatField) {
                nextCombatField = nextCombatField.map(fight => {
                    let newFight = { ...fight };
                    const allyAttacker = fight.owner === context.owner ? newFight.attacker : null;
                    const allyBlocker = fight.owner !== context.owner ? newFight.blocker : null;
                    if (allyAttacker) newFight.attacker = relight({ ...allyAttacker });
                    if (allyBlocker) newFight.blocker = relight({ ...allyBlocker });
                    return newFight;
                });
            }

            events.push({ type: 'titan_relight', payload: {} });
            break;
        }

        // =====================================
        // [2026-08-05 莉莉子] 燃尽召唤 (BURNOUT_SUMMON)
        // 法术12「泰坦降临」：消耗全部法力，把燃尽值作为「费用预算」随机拆分召唤泰坦
        // [2026-08-15 程重定义设计]：
        //   - 燃尽值 = 当前法力 + 法术法力（统一定义，不除2）= 总费用预算
        //   - 随机拆分预算为若干费用块（总费用 恒 = 预算），每块从对应费用的泰坦卡里随机选一张
        //     例：预算1 → 1×异化人；预算2 → 2×1费 或 1×2费；预算4 → 4×1 / 2×2 / 1+3 / 1×4
        //   - 0费衍生物（贡露·辅助无人机）天然不参与（不在预算拆分内）
        //   - 兜底：召唤数量 ≤ 场上空位（预算4但空位3 → 绝不出4只1费，只会选≤3只的组合）
        //   - 偏向均衡：平均单块费用接近2.5的组合更常出（程拍板）
        // =====================================
        case 'BURNOUT_SUMMON': {
            const isPlayer = context.owner === 'player';

            // 1. 燃尽值 = 当前法力 + 法术法力（费用预算），并清零法力
            const budget = isPlayer
                ? (context.game.playerMana || 0) + (context.game.playerSpellMana || 0)
                : (context.game.enemyMana || 0) + (context.game.enemySpellMana || 0);
            if (isPlayer) {
                nextGame.playerMana = 0;
                nextGame.playerSpellMana = 0;
            } else {
                nextGame.enemyMana = 0;
                nextGame.enemySpellMana = 0;
            }
            console.log(`[BurnoutSummon] 燃尽预算=${budget}`);

            if (budget <= 0) {
                console.warn('[BurnoutSummon] 燃尽值为 0，无法召唤泰坦');
                break;
            }

            // 2. 泰坦卡池：带 'Titan' 关键词、费用≥1 的正式单位（排除测试卡与0费衍生物）
            const titanPool = Object.values(CARD_DB).filter(c =>
                (c.keywords as any[])?.includes('Titan')
                && (c.type === 'unit' || c.type?.includes('unit'))
                && (c.cost || 0) >= 1
                && c.key !== 'test_titan'
            );
            if (titanPool.length === 0) {
                console.warn('[BurnoutSummon] 泰坦卡池为空，无法召唤');
                break;
            }

            // 3. 按费用分组 → 可用费用集合（升序）
            const byCost = new Map<number, CardData[]>();
            for (const t of titanPool) {
                const c = t.cost || 1;
                if (!byCost.has(c)) byCost.set(c, []);
                byCost.get(c)!.push(t as CardData); // [2026-08-15] CARD_DB 值类型缺运行时字段，断言为 CardData（后续用 createCard(key) 重建完整卡）
            }
            const availCosts = [...byCost.keys()].sort((a, b) => a - b);

            // 4. 兜底：召唤数量 ≤ 场上空位（备战席上限 6）
            const ownerBench = isPlayer ? nextPlayerBench : nextEnemyBench;
            const emptySlots = Math.max(1, 6 - ownerBench.length);

            // 5. 预算均衡拆分：总费用=预算、块数≤空位、偏向均衡
            const split = buildBalancedBurnoutSplit(budget, emptySlots, availCosts);
            if (split.length === 0) {
                console.warn('[BurnoutSummon] 无可行的预算拆分组合，未召唤泰坦');
                break;
            }

            // 6. 逐块召唤：每块费用 → 从对应费用的泰坦卡中随机选一张
            let summoned = 0;
            for (const cost of split) {
                const options = byCost.get(cost)!;
                const template = options[Math.floor(Math.random() * options.length)];
                const titan = createCard(template.key);
                ownerBench.push({ ...titan, animState: 'summoning' });
                events.push({ type: 'summon', payload: titan });
                summoned++;
                console.log(`[BurnoutSummon] 召唤 ${titan.name}（费${titan.cost}）`);
            }
            events.push({ type: 'burnout_summon', payload: { burnout: budget, summoned, split } });
            break;
        }

        // =====================================
        // [2026-08-05 莉莉子] 无效化 (NEGATE)
        // 法术8：无效化堆叠中所有敌方法术（纯逻辑，无需目标选择）
        // 法术6/7 复用：targetRequirements 带 SPELL_ON_STACK 目标，走 finalTargets 选单个法术
        // =====================================
        case 'NEGATE': {
            const myOwner = context.owner;
            const stack = nextGame.spellStack || [];

            // 1. 定位要无效化的法术：
            //    - 法术8（negateAllEnemies）：堆叠中所有敌方法术
            //    - 法术6/7（SPELL_ON_STACK 目标）：finalTargets[0].spellId 指向的单个堆叠法术
            let toNegate: { card: CardData; owner: 'player' | 'enemy' }[] = [];
            if (effect.params.negateAllEnemies) {
                toNegate = stack.filter(s => s.owner !== myOwner);
            } else if (finalTargets.length > 0 && finalTargets[0].spellId) {
                const targetSpell = stack.find(s => s.card.id === finalTargets[0].spellId);
                if (targetSpell) toNegate = [targetSpell];
            }

            if (toNegate.length > 0) {
                const negatedIds = new Set(toNegate.map(s => s.card.id));
                nextGame.spellStack = stack.filter(s => !negatedIds.has(s.card.id));
                events.push({ type: 'spell_negated', payload: toNegate.map(s => s.card.name) });
                console.log(`[NEGATE] ${effect.id} 无效化 ${toNegate.length} 个法术：${toNegate.map(s => s.card.name).join('、')}`);
            } else {
                console.log(`[NEGATE] 堆叠中没有可无效化的法术`);
            }
            break;
        }

        // =====================================
        // [2026-08-06 莉莉子] 复活 (RESURRECT)
        // 法术2「瓦尔哈拉的呼唤」：复活我方本牌局死亡的最强的6个单位，全员带幻象(Ephemeral)
        // 数据源：墓地（useGameState 的 UNIT_DIED 清算时写入 playerGraveyard/enemyGraveyard）
        // =====================================
        case 'RESURRECT': {
            const myOwner = context.owner;
            const graveyard = myOwner === 'player'
                ? (nextGame.playerGraveyard || [])
                : (nextGame.enemyGraveyard || []);

            if (graveyard.length === 0) {
                console.log('[Resurrect] 墓地为空，没有可复活单位');
                break;
            }

            const count = effect.params.value || 6;
            // 按真实攻击力(power+buffs)降序取前 N
            const sorted = [...graveyard]
                .sort((a, b) => getPower(b) - getPower(a))
                .slice(0, count);

            const bench = myOwner === 'player' ? nextPlayerBench : nextEnemyBench;
            let resurrected = 0;
            for (const dead of sorted) {
                if (bench.length >= 6) {
                    console.warn('[Resurrect] 备战席已满(6/6)，剩余复活单位未能入场');
                    break;
                }
                // 复活：保留死亡时数值，清死亡状态，重置临时增益，附幻象(Ephemeral)
                const revived = {
                    ...dead,
                    damageTaken: 0,
                    isDead: false,
                    animState: 'summoning' as const,
                    buffs: { power: dead.buffs?.power || 0, health: dead.buffs?.health || 0 },
                    roundBuffs: { power: 0, health: 0 },
                    keywords: Array.from(new Set([...(dead.keywords || []), 'Ephemeral' as any])),
                    depletedKeywords: [],
                } as CardData;
                bench.push(revived);
                events.push({ type: 'summon', payload: revived });
                resurrected++;
                console.log(`[Resurrect] 复活 ${revived.name}（真实攻${getPower(revived)}）`);
            }
            events.push({ type: 'resurrect', payload: { count: resurrected } });
            break;
        }

        // =====================================
        // [2026-08-05 莉莉子] 占位效果 (PLACEHOLDER)
        // 逻辑未实现的法术占位，安全空转。逻辑实现时替换为真实 class 并实现处理器。
        // =====================================
        case 'PLACEHOLDER': {
            // 占位效果不产生任何动作，仅记录日志
            console.log(`[Placeholder] ${effect.id} 逻辑未实现，空转跳过`);
            break;
        }

        // =====================================
        // [2026-09-16 1.0.16 茉莉安 · T15] 大招·最终指令（续击循环）
        // ── ① 玩家瞄准一个敌方单位 → 单向打击（不吃反击），伤害 = 茉莉安攻击力
        // ── ② 若将其【击杀】，自动锁定【当前生命值最低】的敌方单位再打一次，如此反复
        // ── ③ 直到某次未击杀 → 断链；场上无单位 → 转打敌方水晶后结束
        // ── 设计文档 5.1 要求的两道护栏，本实现均已落实：
        //      护栏① 每次续击【重新取实时快照】，不复用上一击的陈旧数据
        //      护栏② 循环次数【兜底上限】MAX_CHAIN，防意外死循环
        // =====================================
        // =====================================
        // [2026-09-19 1.0.16 茉莉安 · 大招逐击改造] 连斩（最终指令）
        // ── 从「同步 for 循环一次打完」改为「**一击一步**」（程拍板：演出要"挨个打击，打死再下一个"）
        //    本 case 每次调用只打**一击**，链的进展写进 nextGame.pendingChain；
        //    驱动器（useGameState 的驱动 effect → chainStrikeStep）看到没完就延时再调一次。
        // ── 为什么必须这样改：原先一个 tick 全打完 ⇒ 多个目标同帧掉血，
        //    演出层**根本没有"逐击"可播**（而"数值先落地、动画后补"会更假）
        //    现在每一击的伤害与它的演出事件在**同一刻**发出 ⇒ 因果天然对齐。
        // ── 三条原有护栏逐条保留：
        //    ① 每一击都重取实时快照　② MAX_CHAIN=20 兜底　③ 场上清空 → 转打水晶
        // =====================================
        case 'CHAIN_STRIKE': {
            const csParams = effect.params as EffectParams;
            const mySide = context.owner;
            const foeSide: 'player' | 'enemy' = mySide === 'player' ? 'enemy' : 'player';

            const powerOf = (c: CardData) =>
                (c.power || 0) + (c.buffs?.power || 0) + (c.roundBuffs?.power || 0);
            const hpOf = (c: CardData) =>
                (c.health || 0) + (c.buffs?.health || 0) + (c.roundBuffs?.health || 0) - (c.damageTaken || 0);
            const isLive = (c: any) =>
                !!c && !c.isDead && c.animState !== 'dying' && c.animState !== 'ephemeral_dying' && hpOf(c) > 0;

            const prev = nextGame.pendingChain;
            const isResume = !!prev && !prev.done; // true = 续击；false = 首次（本次调用负责初始化）

            // 伤害源只在首击解析一次（我方场上茉莉安当前攻击力；Lv2 = 6 → 斩杀线 6）
            let strikeDmg = prev?.strikeDmg ?? 0;
            let step = prev?.step ?? 0;
            const prevPhase = prev?.prevPhase ?? context.game.phase;
            if (!isResume) {
                const myAll: CardData[] = [
                    ...(mySide === 'player' ? nextPlayerBench : nextEnemyBench),
                    ...((nextCombatField || [])
                        .filter(f => f.owner === mySide)
                        .flatMap(f => [f.attacker, f.blocker].filter(Boolean) as CardData[])),
                ];
                const marianUnit = myAll.find(c => c.key === 'marian');
                strikeDmg = marianUnit ? powerOf(marianUnit) : (csParams.value || 0);
                if (strikeDmg <= 0) {
                    console.log('[ChainStrike] 找不到茉莉安或攻击力为 0，链中止');
                    break;
                }
            }

            const MAX_CHAIN = 20; // 护栏②：兜底上限
            // 护栏①：每一击都重新取实时快照
            const foeBenchNow: CardData[] = foeSide === 'player' ? nextPlayerBench : nextEnemyBench;
            const foeFieldNow: CardData[] = (nextCombatField || [])
                .filter(f => f.owner === foeSide)
                .flatMap(f => [f.attacker, f.blocker].filter(Boolean) as CardData[]);
            const live = [...foeBenchNow, ...foeFieldNow].filter(isLive);

            // 护栏③：场上清空 → 转打敌方水晶，这一击即链的收尾
            if (live.length === 0) {
                if (foeSide === 'player') {
                    nextGame.playerNexus = Math.max(0, (nextGame.playerNexus || 0) - strikeDmg);
                } else {
                    nextGame.enemyNexus = Math.max(0, (nextGame.enemyNexus || 0) - strikeDmg);
                }
                nextGame.pendingChain = {
                    casterSide: mySide, strikeDmg, victimId: null,
                    step: step + 1, done: true, prevPhase,
                };
                eventBus.emit(GameEvents.CHAIN_STRIKE_STEP, {
                    casterSide: mySide, step: step + 1, amount: strikeDmg, nexus: true, done: true,
                });
                console.log(`[ChainStrike] 场上清空 → 打击 ${foeSide} 水晶 ${strikeDmg} 点，链结束`);
                break;
            }

            // 选目标：首击用玩家指定（若已死则改锁最低血）；续击一律锁最低血
            const wantedId = isResume ? (prev?.victimId ?? null) : (finalTargets[0]?.id ?? null);
            const victim: CardData =
                (wantedId ? live.find(c => c.id === wantedId) : undefined)
                ?? live.reduce((a, b) => (hpOf(b) < hpOf(a) ? b : a));
            const victimId = victim.id;

            const applyHit = (c: CardData): CardData =>
                c.id === victimId
                    ? { ...c, damageTaken: (c.damageTaken || 0) + strikeDmg, animState: 'hit' as const }
                    : c;

            events.push({ type: 'unit_damage', payload: { id: victimId, amount: strikeDmg } });

            if (foeSide === 'player') nextPlayerBench = nextPlayerBench.map(applyHit);
            else nextEnemyBench = nextEnemyBench.map(applyHit);
            if (nextCombatField) {
                nextCombatField = nextCombatField.map(f => ({
                    ...f,
                    attacker: f.attacker ? applyHit(f.attacker) : f.attacker,
                    blocker: f.blocker ? applyHit(f.blocker) : f.blocker,
                })) as any;
            }

            step += 1;
            const remain = hpOf(victim) - strikeDmg;
            const killed = remain <= 0;
            const chainDone = !killed || step >= MAX_CHAIN; // 未击杀 / 到上限 → 链结束
            nextGame.pendingChain = {
                casterSide: mySide,
                strikeDmg,
                victimId: killed ? null : victim.id, // 击杀 → 续击自动锁最低血
                step,
                done: chainDone,
                prevPhase,
            };

            // 逐击广播：演出层照着这一击播（目标 / 是否击杀 / 是否收尾），与伤害**同刻**发出
            eventBus.emit(GameEvents.CHAIN_STRIKE_STEP, {
                casterSide: mySide, step, amount: strikeDmg,
                victimId, victimKey: victim.key, killed, done: chainDone,
            });
            console.log(`[ChainStrike] 第 ${step} 击 → ${victim.name}（${hpOf(victim)} → ${Math.max(0, remain)}）${killed ? ' → 击杀，继续' : ' → 未击杀，断链'}`);
            break;
        }

        // =====================================
        // [2026-09-16 1.0.16 茉莉安 · T09] 分摊伤害（獠牙信标亡语）
        // ── 对【本方】备战席 + 交战区【全体】分摊总量伤害
        // ── 分配口径（设计文档 3.4）：**让宿主吃满，不浪费** ——
        //    先 floor(总量 / N) 打底，**余数随机**分给其中 N 个单位。
        //    不是算平均值；铺场能稀释「单人承受量」，但改变不了「总伤害」。
        // ── 本方 = 谁：本效果由亡语触发，派发方已把 context.owner 设为【亡者阵营】
        //    （useGameState 亡语清算中心：owner = 亡者阵营），故「本方」即宿主方 ✅
        // ── 现有实现里没有任何「亡语造成伤害」的先例，本类为新建（见问题记录 I11）
        // =====================================
        case 'SPREAD_DAMAGE': {
            const sdParams = effect.params as EffectParams;
            const total = sdParams.spreadDamageTotal || 0;
            if (total <= 0) break;

            const isLive = (c: CardData | null | undefined) =>
                !!c && !c.isDead && c.animState !== 'dying' && c.animState !== 'ephemeral_dying';

            // ① 收集本方全体（备战席 + 交战区）的 id
            const ownBench = context.owner === 'player' ? nextPlayerBench : nextEnemyBench;
            const targetIds: string[] = ownBench.filter(isLive).map(c => c.id);
            if (nextCombatField) {
                // [2026-09-18 BUG修复] 交战区归属推导 —— 此前用 `f.owner !== context.owner` 一刀切，
                //   把「本方发起的 fight」里的 attacker **和** blocker 都当成本方。但 blocker 属【对面】。
                //   两个方向都错：
                //     ① 漏：信标被拉上场格挡时，它所在的 fight 是「对面发起的」（f.owner ≠ context.owner），
                //        整场被 return 跳过 → 战场上的友军（含这一侧的 blocker）全都收不到分摊伤害
                //     ② 误伤：本方发起的 fight 里，敌方 blocker 反被算进「本方全体」挨炸
                //   正解：attacker 属 f.owner，blocker 属 f.owner 的对面。
                nextCombatField.forEach(f => {
                    const attackerSide: 'player' | 'enemy' = f.owner;
                    const blockerSide: 'player' | 'enemy' = f.owner === 'player' ? 'enemy' : 'player';
                    if (attackerSide === context.owner && isLive(f.attacker)) targetIds.push(f.attacker.id);
                    if (blockerSide === context.owner && isLive(f.blocker)) targetIds.push(f.blocker.id);
                });
            }
            const N = targetIds.length;
            if (N === 0) {
                // =====================================
                // [2026-09-19 T42 茉莉安 Lv2] 宿主场上无人可分摊 ⇒ 整份伤害转打宿主自家水晶
                // ── 设计意图（程拍板）：升级不能只加厚清场，必须**推进胜利**。
                //    这条把现在「伤害落空」的白白浪费变成推进，且**场面越干净 → 水晶越疼**，
                //    与设计文档 3.4「让宿主吃满，不浪费」同源。
                // ── 判定口径（程拍板：**实时**要求她活着在场，不采用"信标盖章"）：
                //    召唤者侧 = 宿主（context.owner）的对面；必须有一个**活着在场**的 Lv2 茉莉安
                //    （备战席或交战区皆可，判据与补兵规则同款：在场实例 level === 2）。
                // ── 打的是【宿主自家】水晶：引爆本来就是宿主的代价，场上没人接就砸他自己的水晶。
                // =====================================
                const ownSide = context.owner;
                const summonerSide: 'player' | 'enemy' = ownSide === 'player' ? 'enemy' : 'player';
                const summonerBench = summonerSide === 'player' ? nextPlayerBench : nextEnemyBench;
                const isLiveLv2Marian = (c: CardData | null | undefined) =>
                    !!c && c.key === 'marian' && c.level === 2 && isLive(c);
                const lv2MarianOnBoard =
                    summonerBench.some(isLiveLv2Marian)
                    || (nextCombatField || []).some(f =>
                        [f.attacker, f.blocker].some(isLiveLv2Marian)
                    );

                if (lv2MarianOnBoard) {
                    if (ownSide === 'player') nextGame.playerNexus = Math.max(0, (nextGame.playerNexus || 20) - total);
                    else nextGame.enemyNexus = Math.max(0, (nextGame.enemyNexus || 20) - total);
                    eventBus.emit('unit_damage', { id: `nexus_${ownSide}`, amount: total });
                    eventBus.emit(GameEvents.NEXUS_STRIKED, { target: ownSide, amount: total });
                    // [2026-09-19 视觉层] 空场转打水晶同样要出激光（打水晶的那一束）
                    eventBus.emit(GameEvents.BEACON_EXPLODE, {
                        beaconId: context.sourceCard?.id,
                        targets: [{ id: `nexus_${ownSide}`, amount: total }],
                    });
                    console.log(`[BeaconDebug] 亡语分摊：宿主无存活单位 → Lv2 茉莉安在场，整份 ${total} 点转打 ${ownSide} 水晶`);
                } else {
                    console.log('[BeaconDebug] 亡语分摊：本方无存活单位，伤害落空');
                }
                break;
            }

            // ② 分配：先打底 floor，余数随机
            const base = Math.floor(total / N);
            const remainder = total - base * N;
            const order = targetIds.map((_, i) => i);
            for (let i = order.length - 1; i > 0; i--) {   // Fisher-Yates
                const j = Math.floor(Math.random() * (i + 1));
                [order[i], order[j]] = [order[j], order[i]];
            }
            const bonusSet = new Set(order.slice(0, remainder));

            const amountById = new Map<string, number>();
            targetIds.forEach((id, i) => amountById.set(id, base + (bonusSet.has(i) ? 1 : 0)));

            // ③ 施加（复用 selfDamage 那套：先播受击事件，再写 damageTaken + hit 动画）
            const applySpread = (c: CardData): CardData => {
                const amt = amountById.get(c.id);
                if (!amt) return c;
                events.push({ type: 'unit_damage', payload: { id: c.id, amount: amt } });
                return { ...c, damageTaken: (c.damageTaken || 0) + amt, animState: 'hit' as const };
            };

            if (context.owner === 'player') {
                nextPlayerBench = nextPlayerBench.map(applySpread);
            } else {
                nextEnemyBench = nextEnemyBench.map(applySpread);
            }
            if (nextCombatField) {
                nextCombatField = nextCombatField.map(f => {
                    const nf = { ...f };
                    if (isLive(nf.attacker) && amountById.has(nf.attacker.id)) nf.attacker = applySpread(nf.attacker);
                    if (nf.blocker && amountById.has(nf.blocker.id)) nf.blocker = applySpread(nf.blocker);
                    return nf;
                }) as any;
            }

            console.log(`[BeaconDebug] 亡语分摊：总量 ${total} → ${N} 个单位（每人 ${base}${remainder > 0 ? ` + 余数 ${remainder} 随机` : ''}）`);

            // =====================================
            // [2026-09-19 视觉层] 引爆 VFX 广播（纯附加，不影响任何逻辑）
            // ── 视觉层需要知道：① 信标是谁（定位浮现图）② 每束激光打谁、打多少（决定数量与颜色）
            // ── 这里的数据是唯一的真相源：分摊的分配结果（amountById）就在手上，无需视觉层再算一遍
            // =====================================
            {
                const vfxTargets = targetIds
                    .map(id => ({ id, amount: amountById.get(id) || 0 }))
                    .filter(t => t.amount > 0);
                eventBus.emit(GameEvents.BEACON_EXPLODE, {
                    beaconId: context.sourceCard?.id, // 信标本体（亡语源头）
                    targets: vfxTargets,              // 每束激光的落点 + 该束伤害
                });
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

    // ==========================================
    // ✨ [2026-07-16 达努·班西] ON_DAMAGE_SURVIVE 即时检测
    // 在效果处理内部直接检测，不依赖事件总线 + flushMicroQueue
    // 确保法术/效果伤害也能即时触发（不局限于战斗流程）
    // ==========================================
    const onDamageSurviveCheck = () => {
        const dmgEvents = events.filter(e => e.type === 'unit_damage');
        console.log(`[OnDamageSurviveCheck] 检测到 ${dmgEvents.length} 个 unit_damage 事件，events总数=${events.length}`);

        for (const event of dmgEvents) {
            const unitId = event.payload?.id;
            console.log(`[OnDamageSurviveCheck] 处理 unit_damage: id=${unitId}, amount=${event.payload?.amount}`);
            if (!unitId) continue;

            // 在最新状态中定位受伤单位
            let unit = nextPlayerBench.find(c => c.id === unitId) || nextEnemyBench.find(c => c.id === unitId);
            let foundIn = 'bench';
            if (!unit && nextCombatField) {
                const fight = nextCombatField.find(f => f.attacker?.id === unitId || f.blocker?.id === unitId);
                if (fight) {
                    unit = fight.attacker?.id === unitId ? fight.attacker : fight.blocker;
                    foundIn = 'combatField';
                }
            }
            if (!unit) {
                console.log(`[OnDamageSurviveCheck] ⚠️ 未找到 id=${unitId} 的单位！bench=${nextPlayerBench.length} combatField=${nextCombatField?.length}`);
                continue;
            }
            if (!unit.effects) {
                console.log(`[OnDamageSurviveCheck] ⚠️ ${unit.name}(${unit.key}) 没有 effects 字段`);
                continue;
            }

            const currentHp = getHealth(unit); // [2026-09-22 修复] 统一口径（原公式漏 roundBuffs.health）
            console.log(`[OnDamageSurviveCheck] ${unit.name}(${unit.key}) 找到于${foundIn}，HP=${currentHp}，damageTaken=${unit.damageTaken}，effects=${unit.effects.join(',')}`);

            if (currentHp <= 0) {
                console.log(`[OnDamageSurviveCheck] ❌ ${unit.name} 已死亡(HP=${currentHp})，跳过`);
                continue;
            }

            // 判断单位阵营
            const isPlayerUnit = nextPlayerBench.some(c => c.id === unitId) ||
                (nextCombatField?.some(f => (f.owner === 'player' && f.attacker?.id === unitId) || (f.owner === 'enemy' && f.blocker?.id === unitId)) ?? false);
            console.log(`[OnDamageSurviveCheck] ${unit.name} 阵营: ${isPlayerUnit ? 'player' : 'enemy'}`);

            for (const effId of unit.effects) {
                const def = EFFECT_DB[effId];
                console.log(`[OnDamageSurviveCheck] 检查效果 ${effId}: def=${!!def}, timing=${def?.timing}`);

                if (def && def.timing === 'ON_DAMAGE_SURVIVE') {
                    console.log(`[OnDamageSurviveCheck] ✅ 命中 ON_DAMAGE_SURVIVE！触发效果: ${def.name}`);

                    const subCtx: EffectContext = {
                        game: nextGame, playerBench: nextPlayerBench, enemyBench: nextEnemyBench,
                        playerHand: nextPlayerHand, enemyHand: nextEnemyHand,
                        playerDeck: nextPlayerDeck, enemyDeck: nextEnemyDeck,
                        combatField: nextCombatField,
                        owner: isPlayerUnit ? 'player' : 'enemy',
                        sourceCard: unit
                    };
                    const subResult = processEffect(effId, [unit], subCtx);
                    if (subResult.game) nextGame = subResult.game;
                    if (subResult.playerBench) nextPlayerBench = subResult.playerBench;
                    if (subResult.enemyBench) nextEnemyBench = subResult.enemyBench;
                    if (subResult.playerHand) nextPlayerHand = subResult.playerHand;
                    if (subResult.enemyHand) nextEnemyHand = subResult.enemyHand;
                    if (subResult.playerDeck) nextPlayerDeck = subResult.playerDeck;
                    if (subResult.enemyDeck) nextEnemyDeck = subResult.enemyDeck;
                    if (subResult.combatField) nextCombatField = subResult.combatField;

                    console.log(`[OnDamageSurvive] ✅ ${unit.name} 受伤存活(HP=${currentHp})，触发效果: ${def.name}，生成衍生物=${def.params?.generateKey}`);
                }
            }

            // ⭐ [2026-07-16 达努·温蒂] ON_FRIENDLY_DAMAGED — 友方受伤光环即时检测
            // 扫描所有己方单位，看谁有 ON_FRIENDLY_DAMAGED 光环
            const friendlyBench = isPlayerUnit ? nextPlayerBench : nextEnemyBench;
            const allFriendlies = [...friendlyBench];
            if (nextCombatField) {
                nextCombatField.forEach(fight => {
                    if (fight.attacker && fight.owner === (isPlayerUnit ? 'player' : 'enemy')) allFriendlies.push(fight.attacker);
                    if (fight.blocker && fight.owner !== (isPlayerUnit ? 'player' : 'enemy')) allFriendlies.push(fight.blocker);
                });
            }

            allFriendlies.forEach(friendly => {
                if (!friendly.effects) return;
                friendly.effects.forEach(effId => {
                    const def = EFFECT_DB[effId];
                    if (def && def.timing === 'ON_FRIENDLY_DAMAGED') {
                        console.log(`[OnFriendlyDamaged] ${friendly.name} 检测到友方 ${unit.name} 受伤，触发光环: ${def.name}`);
                        const auraCtx: EffectContext = {
                            game: nextGame, playerBench: nextPlayerBench, enemyBench: nextEnemyBench,
                            playerHand: nextPlayerHand, enemyHand: nextEnemyHand,
                            playerDeck: nextPlayerDeck, enemyDeck: nextEnemyDeck,
                            combatField: nextCombatField,
                            owner: isPlayerUnit ? 'player' : 'enemy',
                            sourceCard: friendly
                        };
                        const res = processEffect(effId, [unit], auraCtx);
                        if (res.playerBench) nextPlayerBench = res.playerBench;
                        if (res.enemyBench) nextEnemyBench = res.enemyBench;
                        if (res.combatField) nextCombatField = res.combatField;
                        console.log(`[OnFriendlyDamaged] ✅ ${friendly.name} 的光环生效，${unit.name} 获得 BUFF`);
                    }
                });
            });
        }
    };
    onDamageSurviveCheck();

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

/**
 * [2026-07-30 通用] 扫描持有者的备战席/战场，触发所有 ON_GET_ATTACK_TOKEN 效果。
 * 在 RALLY 效果处理后、侦察备战、击杀备战等任何获得进攻标识的场景调用。
 */
export function processOnGetAttackToken(
    owner: 'player' | 'enemy',
    state: {
        game: GameState;
        playerBench: CardData[];
        enemyBench: CardData[];
        playerHand: CardData[];
        enemyHand: CardData[];
        playerDeck?: CardData[];
        enemyDeck?: CardData[];
        combatField?: any[];
    }
): {
    game: GameState;
    playerBench: CardData[];
    enemyBench: CardData[];
    playerHand: CardData[];
    enemyHand: CardData[];
    playerDeck?: CardData[];
    enemyDeck?: CardData[];
    combatField?: any[];
} {
    let { game, playerBench, enemyBench, playerHand, enemyHand, playerDeck, enemyDeck, combatField } = state;
    const ownerBench = owner === 'player' ? playerBench : enemyBench;
    const scanUnits = [...ownerBench];
    if (combatField) {
        combatField.forEach(fight => {
            if (fight.owner === owner && fight.attacker) scanUnits.push(fight.attacker);
            if (fight.owner !== owner && fight.blocker) scanUnits.push(fight.blocker);
        });
    }
    scanUnits.forEach(unit => {
        if (unit.effects) {
            unit.effects.forEach((effId: string) => {
                const def = EFFECT_DB[effId];
                if (def && def.timing === 'ON_GET_ATTACK_TOKEN') {
                    const subCtx: EffectContext = {
                        game, playerBench, enemyBench, playerHand, enemyHand,
                        playerDeck, enemyDeck, combatField,
                        owner,
                        sourceCard: unit
                    };
                    const subResult = processEffect(effId, [], subCtx);
                    if (subResult.game) game = subResult.game;
                    if (subResult.playerBench) playerBench = subResult.playerBench;
                    if (subResult.enemyBench) enemyBench = subResult.enemyBench;
                    if (subResult.playerHand) playerHand = subResult.playerHand;
                    if (subResult.enemyHand) enemyHand = subResult.enemyHand;
                    if (subResult.playerDeck) playerDeck = subResult.playerDeck;
                    if (subResult.enemyDeck) enemyDeck = subResult.enemyDeck;
                }
            });
        }
    });
    return { game, playerBench, enemyBench, playerHand, enemyHand, playerDeck, enemyDeck, combatField };
};