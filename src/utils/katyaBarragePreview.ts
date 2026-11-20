// ==========================================
// [2026-11-14 莉莉子 🎨视觉层 · 问题 2-1「倾泻」卡面预计伤害]
// ──────────────────────────────────────────
// 卡面：「对敌方单位连打“凯茜娅·狂诗”攻击力一半的次数（向上取整），每发 2 点伤害。」
//        ⇒ 玩家看不到"这一发能打多少"。本模块把**结算侧的算式**搬到 UI 侧，供卡面显示
//        「共 {shots} 发（预计 {total} 点）」。
//
// ── 单一真源：算式与 `logic/effectProcessor.ts` 的 `case 'BARRAGE'` **逐字对齐**：
//      发数 = min(64, max(1, ceil(攻击力 / 2)) + 观察员加成)   ← `:5827-5829`
//      每发 = max(1, params.damage)                            ← `:5833`
//      攻击力 = 场上本体 `getPower` 优先，本体不在场回落账本   ← `:5810`
//    ⇒ 此处**只读**，绝不写任何账本（不碰 `buffs.power`）。
//
// ── 为什么攻击力要"场上优先"：
//    `getPower = power + buffs.power + roundBuffs.power`（`logic/keywords.ts:89-95`）。
//    `roundBuffs` 是**只活在场上那张卡上**的临时加成（如「穿云激流」的 +4/+0），
//    账本 `getKatyaStats(side).power` 里**没有**它 ⇒ 只看账本会低估。
//    UI 层（手牌 `CardAnimations`）能拿到 `playerBench` / `combatField`，故能算准；
//    拿不到棋盘的位置（悬停大图 `FloatingCardPreview`）退回账本口径，并在 `fromBoard` 里自证。
// ==========================================
import type { CardData, CombatFieldItem } from '../types';
import { EFFECT_DB } from '../data/effectRegistry';
import { getPower } from '../logic/keywords';
import { KATYA_KEY, getKatyaStats, getKatyaBarrageObserverBonus } from './katyaProgress';

/** 与 `effectProcessor` 的 `BR_COUNT_HARD_CAP`（`:5827`）同值 —— 只对齐**显示**，不改设计 */
const BARRAGE_COUNT_HARD_CAP = 64;

export interface BarrageEstimate {
    /** 用于算发数的攻击力（场上本体优先，否则账本口径） */
    power: number;
    /** 理论发数（已含防爆上限与观察员加成） */
    shots: number;
    /** 每一发的伤害 */
    perHit: number;
    /** 预计总伤害 = shots × perHit（假设目标一直活着、不吃坚韧/屏障） */
    total: number;
    /** 攻击力是否取自**场上本体**（false ⇒ 走的是账本兜底口径） */
    fromBoard: boolean;
}

export interface BarrageEstimateContext {
    /** 归属方（缺省 player） */
    side?: 'player' | 'enemy';
    /** 该方备战席（有它 + field 才能算准 `roundBuffs`） */
    bench?: CardData[] | null;
    /** 交战区（[2026-11-19 代码债收口] `any[]` → `CombatFieldItem[]`：形状本就是 `{ owner, attacker, blocker }`） */
    field?: CombatFieldItem[] | null;
}

/**
 * 找出这张卡上的「倾泻」效果 id。
 * ⚠️ 跳过 `pierceLoop`（穿云激流）：它的发数靠"打空一整轮预算 + 击杀续打"逐轮重算，
 *    且还要额外落一笔**永久代价**（`bumpKatyaDrain(side, ceil(N₀ / 2))`，N₀ = 2 + S − D）——
 *    没有可静态预估的单一数字（预估出来就是骗人）。
 */
export const findBarrageEffectId = (card: CardData): string | null => {
    for (const id of card.effects ?? []) {
        const def = EFFECT_DB[id];
        if (def?.class === 'BARRAGE' && !def.params?.pierceLoop) return id;
    }
    return null;
};

/** 场上某方的**存活**单位（备战席 + 该方那一侧战线），归属口径与 effectProcessor 同源 */
const liveUnitsOf = (side: 'player' | 'enemy', ctx: BarrageEstimateContext): CardData[] => {
    const bench = ctx.bench ?? [];
    const field = (ctx.field ?? [])
        .map((f: any) => (f?.owner === side ? f.attacker : f.blocker))
        .filter(Boolean) as CardData[];
    const isLive = (c: CardData) => !c.isDead && c.animState !== 'dying' && c.animState !== 'ephemeral_dying';
    return [...bench, ...field].filter(c => c && isLive(c));
};

/** 估算「倾泻」的发数/每发/总伤；不是倾泻卡 ⇒ null */
export const estimateBarrage = (card: CardData, ctx: BarrageEstimateContext = {}): BarrageEstimate | null => {
    const effectId = findBarrageEffectId(card);
    if (!effectId) return null;
    const side = ctx.side ?? 'player';
    const params = EFFECT_DB[effectId]?.params;

    const katya = liveUnitsOf(side, ctx).find(u => u.key === KATYA_KEY);
    // [对齐 :5810] 场上本体优先；本体不在场 ⇒ 账本口径（2 + S − D）
    const power = katya ? getPower(katya) : Math.max(0, getKatyaStats(side).power);

    const observer = Math.max(0, params?.barrageObserverBonus || 0) + getKatyaBarrageObserverBonus(side);
    const shots = Math.min(BARRAGE_COUNT_HARD_CAP, Math.max(1, Math.ceil(power / 2)) + observer);
    const perHit = Math.max(1, params?.damage || 2);

    return { power, shots, perHit, total: shots * perHit, fromBoard: !!katya };
};

/**
 * 卡面占位符替换表（`Card.tsx` 的 `renderDescription` 按 `{key}` 逐个替换）。
 * 卡面文案里写的是 `共 {shots} 发（预计 {total} 点）`。
 */
export const getBarrageDisplayParams = (
    card: CardData,
    ctx: BarrageEstimateContext = {},
): Record<string, number> | undefined => {
    const est = estimateBarrage(card, ctx);
    if (!est) return undefined;
    return { shots: est.shots, perHit: est.perHit, total: est.total };
};
