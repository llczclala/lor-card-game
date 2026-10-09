import type { CardData, GameState } from '../types';
import { CARD_DB } from '../data/cards';
import { EFFECT_DB, isEntryTiming } from '../data/effectRegistry';
import type { RogueTriggerCtx, Side } from './rogueTrigger'; // ⚠️ **只 import type** ⇒ 运行时零环

/**
 * [2026-10-06 程拍板 · A 方案 · 「入场」门铃] **「单位被召唤到场上」的唯一实现**
 *
 * ── 为什么要有这个文件
 *   "让单位上场"在代码里有多条路（效果召唤 / 库效召唤 / 复活 / 克隆 / hook 直塞…）。
 *   原先只有一部分会触发「入场」⇒ 猫汐尔③「莲脉增殖」这类能力**从不生效**，且**每加一条路就漏一次**。
 *   本模块把"补铃"这件事收成**一个函数**，所有召唤路径共用（调用点各一行）。
 *
 * ── 只做两件事（口径见 `技术手册/规范-入场与召唤术语.md`）
 *   ① 卡牌**自身**的「入场」效果 —— `effects` 里 timing 过 `isEntryTiming` 的，逐个结算
 *   ② 迷宫强化 / 装备的 `on_summon` 派发
 *   ⚠️ **绝不放行「打出时」**（`ON_PLAY_FROM_HAND`）—— 被召唤 ≠ 从手牌打出（程 2026-10-06 口径）。
 *   ⚠️ 刻意**不发** `on_play_unit` / `on_first_*` —— 那几条是**打出**语义。
 *
 * ── 为什么用"依赖注入"而不是直接 import
 *   `processEffect` 住在 `effectProcessor`，`runRogueTrigger` 住在 `rogueTrigger`；
 *   而这两个文件都会**用到本模块** ⇒ 直接 import 会成**三方环**。
 *   ⇒ 由 `effectProcessor` 在模块初始化时 `configureSummonEntryDeps(...)` 注入一次，
 *     本模块不 import 任何逻辑层实现（只用 `import type`）。
 *   ⚠️ 若注入缺席（例如某条极早期路径），**只告警并跳过**，绝不抛错。
 */
export interface SummonEntryDeps {
    processEffect: (effectId: string, targets: any[], ctx: any) => any;
    runRogueTrigger: (ctx: RogueTriggerCtx, enhancements: any, trigger: string) => void;
}

let deps: SummonEntryDeps | null = null;
export const configureSummonEntryDeps = (d: SummonEntryDeps): void => { deps = d; };

/** 召唤入场触发的**递归护栏**（入场效果自己可能再召唤，如亡语链 / 召唤链） */
const MAX_SUMMON_ENTRY_DEPTH = 4;
let summonEntryDepth = 0;

export interface SummonEntryState {
    game: GameState;
    playerBench: CardData[];
    enemyBench: CardData[];
    playerHand: CardData[];
    enemyHand: CardData[];
    playerDeck?: CardData[];
    enemyDeck?: CardData[];
    combatField?: any[];
}

export interface SummonEntryResult extends SummonEntryState {
    /** 是否**真的派发过**（卡牌入场效果命中 **或** 迷宫副作用落地）。
     *  ⚠️ 调用方**必须**用它判断"要不要提交"，**不能**用数组身份是否变化 ——
     *  rogue handler 走 `updateUnitById` 是**就地改元素**（身份不变），身份判据会漏提交。 */
    applied: boolean;
}

/**
 * 给"刚上场的单位"补响「入场」。
 * @param landedId 刚落场单位的 id（必须**已经在** `state` 的某个数组里，否则直接 no-op）
 * @param side      该单位的**归属方**（跨阵营召唤时是落点方，不是施法者）
 * @param onEvents  可选：把嵌套结算产生的事件透传给调用方（伤害飘字 / 音效 / 生成动画都靠它）
 */
export const runSummonEntry = (
    landedId: string,
    side: Side,
    state: SummonEntryState,
    createFullCard?: (key: string) => CardData,
    onEvents?: (events: any[]) => void,
): SummonEntryResult => {
    let { game, playerBench, enemyBench, playerHand, enemyHand, playerDeck, enemyDeck, combatField } = state;
    let applied = false;

    const findById = (id: string): CardData | undefined => {
        const inBench = [...playerBench, ...enemyBench].find(c => c.id === id);
        if (inBench) return inBench;
        if (combatField) {
            for (const f of combatField as any[]) {
                if (f?.attacker?.id === id) return f.attacker as CardData;
                if (f?.blocker?.id === id) return f.blocker as CardData;
            }
        }
        return undefined;
    };

    const unit = findById(landedId);
    if (!unit) return { ...state, applied: false };

    if (!deps) {
        console.warn('[SummonEntry] ⚠️ 依赖未注入（configureSummonEntryDeps），跳过入场触发');
        return { ...state, applied: false };
    }
    if (summonEntryDepth >= MAX_SUMMON_ENTRY_DEPTH) {
        console.warn(`[SummonEntry] ⚠️ 入场触发深度超限(${MAX_SUMMON_ENTRY_DEPTH})，跳过「${unit.name}」`);
        return { ...state, applied: false };
    }

    summonEntryDepth++;
    try {
        // ① 卡牌自身「入场」效果（读**实例的** effects —— 实例可能被追加过效果）
        const effIds = unit.effects ?? CARD_DB[unit.key]?.effects ?? [];
        for (const effId of effIds) {
            const def = EFFECT_DB[effId];
            if (!isEntryTiming(def?.timing)) continue; // ← 「打出时」在这里被挡住
            applied = true;
            const res = deps.processEffect(effId, [], {
                game,
                playerBench,
                enemyBench,
                playerHand,
                enemyHand,
                playerDeck,
                enemyDeck,
                combatField,
                owner: side,
                sourceCard: findById(landedId) ?? unit,
                createFullCard,
            });
            if (res.game) game = res.game;
            if (res.playerBench) playerBench = res.playerBench;
            if (res.enemyBench) enemyBench = res.enemyBench;
            if (res.playerHand) playerHand = res.playerHand;
            if (res.enemyHand) enemyHand = res.enemyHand;
            if (res.playerDeck) playerDeck = res.playerDeck;
            if (res.enemyDeck) enemyDeck = res.enemyDeck;
            if (res.combatField) combatField = res.combatField;
            // 事件透传给调用方（否则入场造成的伤害飘字 / 抽卡 / 音效全不播）
            if (res.events?.length && onEvents) onEvents(res.events);
        }

        // ② 迷宫强化 / 装备的 `on_summon`
        if (createFullCard) {
            const rCtx: RogueTriggerCtx = {
                // ⚠️ **一律传副本**：rogue handler 走 `updateUnitById` 就地把元素改掉，
                //    而调用方可能传的是**活的 React state 数组**（就地改 state = 危险）
                game: { ...game },
                playerBench: [...playerBench],
                enemyBench: [...enemyBench],
                playerHand: [...playerHand],
                enemyHand: [...enemyHand],
                playerDeck: [...(playerDeck ?? [])],
                enemyDeck: [...(enemyDeck ?? [])],
                combatField: combatField ? [...combatField] : [],
                owner: side,
                trigger: 'on_summon',
                createFullCard,
                info: { playedCard: findById(landedId) ?? unit },
                dirty: { bench: new Set<Side>(), hand: new Set<Side>(), deck: new Set<Side>(), field: false, game: false },
            };
            const enh = side === 'player' ? rCtx.game.rogueEnhancements : rCtx.game.enemyEnhancements;
            deps.runRogueTrigger(rCtx, enh, 'on_summon');
            const rogueDirty = rCtx.dirty.game || rCtx.dirty.field
                || rCtx.dirty.bench.size > 0 || rCtx.dirty.hand.size > 0 || rCtx.dirty.deck.size > 0;
            if (rogueDirty) applied = true;
            // 回写**新数组**（身份变化可观察 ⇒ 调用方的身份判据也可靠）
            if (rCtx.dirty.game) game = { ...rCtx.game };
            if (rCtx.dirty.field) combatField = [...rCtx.combatField];
            if (rCtx.dirty.bench.has('player')) playerBench = [...rCtx.playerBench];
            if (rCtx.dirty.bench.has('enemy')) enemyBench = [...rCtx.enemyBench];
            if (rCtx.dirty.hand.has('player')) playerHand = [...rCtx.playerHand];
            if (rCtx.dirty.hand.has('enemy')) enemyHand = [...rCtx.enemyHand];
            // ⚠️ [2026-10-06 独立审查修复 · P2] **只在调用方本来就有牌库时才回写** ——
            //   否则我们传进去的是伪造的 `[]`，回写等于把"未提供"变成"空牌库"。
            //   当前 on_summon 触发类里没有改牌库的 handler ⇒ 属**潜在**缺口，这里先把闸门关上。
            if (rCtx.dirty.deck.has('player') && playerDeck) playerDeck = [...rCtx.playerDeck];
            if (rCtx.dirty.deck.has('enemy') && enemyDeck) enemyDeck = [...rCtx.enemyDeck];
        }
    } finally {
        summonEntryDepth--;
    }

    return { game, playerBench, enemyBench, playerHand, enemyHand, playerDeck, enemyDeck, combatField, applied };
};
