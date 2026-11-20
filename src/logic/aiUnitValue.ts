/**
 * [2026-11-19 莉莉子 · L6 后半] AI 单位卡出牌价值评估
 *
 * 病根（2026-11-18 日记记下、当时未动）：
 *   `useAI.ts` 的单位段是 `hand.find()` —— 取手牌里**第一张付得起**的单位，
 *   于是**手牌顺序就是决策依据**。三个后果：
 *     ① 6 费英雄与 2 费白板在决策上等价（谁排在前面打谁）
 *     ② 带战吼/召唤/关键词的单位排在后面就永远轮不到
 *     ③ `conservation`（资源保存）在单位段**零消费者** ⇒ 三档难度在这一步逐字相同
 *
 * 口径（本文件）：
 *   · 主轴是**每费战力** = (攻+血) / 实算费。因为法力**每回合重置、不累加**
 *     （`useGameState.ts:5351` `enemyMana: Math.min(maxMana, ...)`）⇒
 *     "省着不用"是纯亏，所以**不做留费**，只回答"本回合这些费怎么花更值"。
 *   · 难度分档走 `capabilities.valueUnitPlay`（同 aiDifficulty 的既有哲学：
 *     能力轴决定"会不会做这道工序"，权重轴决定"做的时候怎么选"）：
 *       easy   不评分，仍取第一张（保留可被玩家利用的蠢，属设计不是欠债）
 *       normal 只看身材密度 + 零头利用
 *       hard   再加英雄加权 / 入场效果 / 正负关键词
 *
 * ⚠️ 已知局限（**刻意不做**，留给下一轮）：
 *   单张贪心，不做组合枚举。例：剩 6 费、手里一张 6 费白板（密度 2.5）+
 *   两张 3 费白板（各 2.0）⇒ 贪心选前者（总值 2.5），组合最优是后者（总值 4.0）。
 *   要修得启用 `planningDepth` 那根轴（目前全项目零消费），不在本轮范围。
 */
import type { CardData, Keyword } from '../types';
import { getPower, getHealth } from './keywords';
import { getEffectiveSpellCost } from '../utils/gameRules';

/** 评分档位：none = 不评分（easy），simple = 只看身材（normal），full = 全维度（hard） */
export type UnitScoreMode = 'none' | 'simple' | 'full';

/**
 * 正面硬关键词：自带一个就多值一点钱。
 * 口径：只收「直接换战斗收益」的，不收条件型/构筑型（Aura / Support / Channel / Echo / Ability）。
 */
const POSITIVE_KEYWORDS: readonly Keyword[] = [
    'Overwhelm', 'QuickAttack', 'Elusive', 'Challenger', 'Barrier', 'Lifesteal',
    'Fearsome', 'Tough', 'Double Attack', 'SpellShield', 'Cleave', 'Reborn',
    'Execute', 'Titan',
];

/**
 * 负面关键词：自带就贬值。
 * ⚠️ `Deadly` 在 2026-09-12 语义反转成**受体侧 debuff**（受任何伤害即被消灭），
 *    所以单位自带它是吃亏，不是赚 —— 别按旧语义当正面词条。
 * ⚠️ [2026-11-19 独立审查] 刻意**不收**这四类：
 *    · `Vanguard` / `Scout` —— 条件型（仅本回合第一张 / 侦察），AI 单位段执行时条件常已不成立
 *    · `Ephemeral` —— AI 会主动把它派去进攻（`useAI` 进攻段），是一次性攻击点，不是废卡
 *    · `Immobile` —— 哨兵的价值在光环，按身材扣分会让 AI 干脆不铺
 *    · `Volatile` —— 语义是「回合末未打出即弃置」，惩罚它 = AI 主动放弃 `CLONE_TO_HAND` 给的复制体
 */
const NEGATIVE_KEYWORDS: readonly Keyword[] = [
    'CantBlock', 'CantAttack', 'Deadly',
];

export interface UnitPickContext {
    /** 当前**战斗法力**（单位卡只吃这条，`canAffordCard` 对 unit 走 `mana >= cost`） */
    mana: number;
    /** 敌方备战席（算实算费要用；减费/加费都看它） */
    bench: CardData[];
    mode: UnitScoreMode;
}

/**
 * 给一张单位卡打分。分数是**相对值**，只在同一手牌内比较有意义。
 */
export const scoreUnitPlay = (card: CardData, ctx: UnitPickContext): number => {
    // 实算费：与 canAffordCard / 卡面显示同源（漏这一处 = 评分按原价、扣费按实价）
    // `rawCost` 供零头判定，`cost` 只供密度（钳 ≥1 防除 0）
    const rawCost = getEffectiveSpellCost(card, ctx.bench, undefined, 'enemy');
    const cost = Math.max(1, rawCost);
    const body = getPower(card) + getHealth(card);

    // 主轴：每费战力
    let score = body / cost;

    if (ctx.mode === 'full') {
        // 英雄是核心资产：落地越早越强（升级/成长都挂在"在场"上）
        if (card.isChampion) score *= 1.25;

        // 入场效果：`effects` 非空说明有落地即兑现的东西（战吼/召唤/增益）
        // ⚠️ 粗信号：走 abilities 的效果不在这条里，此处不追（要准得读 effectRegistry）
        const entryCount = card.effects?.length ?? 0;
        if (entryCount > 0) score += Math.min(3, entryCount * 0.75);

        for (const kw of card.keywords ?? []) {
            if (POSITIVE_KEYWORDS.includes(kw)) score += 0.6;
            else if (NEGATIVE_KEYWORDS.includes(kw)) score -= 0.8;
        }
    }

    // 零头利用：正好花光剩余法力 ⇒ 顺手加分（不打完就白扔，因为法力不跨回合）
    // ⚠️ 用 rawCost 判：0 费卡在 `mana=1` 时不算「正好花光」（独立审查 #3）
    if (rawCost > 0 && rawCost === ctx.mana) score += 0.4;

    return score;
};

/**
 * 从「本回合付得起的单位」里挑一张。
 * @returns 选中的卡；入参为空时返回 null
 */
export const pickBestUnit = (cards: CardData[], ctx: UnitPickContext): CardData | null => {
    if (cards.length === 0) return null;
    // easy：不评分，行为与旧 `hand.find()` 完全一致
    if (ctx.mode === 'none') return cards[0];

    let best = cards[0];
    let bestScore = scoreUnitPlay(best, ctx);
    for (let i = 1; i < cards.length; i++) {
        const s = scoreUnitPlay(cards[i], ctx);
        if (s > bestScore) {
            best = cards[i];
            bestScore = s;
        }
    }
    return best;
};
