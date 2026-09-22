// ==========================================
// 悖论迷宫 · 经验经济（数据层）
// [2026-08-29 莉莉子] 程拍板经验重构（解决"1→30 级要 253 局"过肝）：
//   - 局内渐进：过任何节点都发经验，深度越深越多（NODE_DEPTH_MULT）
//   - 通关大额：Boss 通关额外 CLEAR_EXP
//   - 速通时长倍率：时间越短倍率越高，最高 3 倍（程拍板：不提倡膀胱局）
//   - 难度倍率：普通 1 / 机密 1.5 / 绝密 2
//   - 效率加成：天启者等级 expRateBonus（阶段2）+ 碳原子板翻倍（阶段1）
// 总公式：整局 = Σ(节点基础×深度) × 难度倍率 × 时长倍率 × (1+expRateBonus/100) × 共鸣×2
//  局内逐节点发"原始经验"（含难度倍率）；结算时补差额（时长/效率/共鸣/通关）。
// [2026-09-22 莉莉子 修复] 时长倍率分母改为「本难度基准时长 PAR」（DIFFICULTY_PAR_MINUTES）：
//   旧档位为绝对值（10/15/20 分钟），而机密/绝密地图是普通的 2 / 2.7 倍长 → 高难度必然掉到 ×1，
//   把难度倍率整个吃掉（机密有效 1.5 ＜ 普通有效 2.0，玩家实测"机密经验比普通少"）。现按难度归一。
// ==========================================
import { ROGUE_MAPS, computeGraphDepth, type RogueNodeType } from './mapLayout';
import type { RogueDifficulty } from './difficulties';

/** 节点基础经验（按类型；可调） */
export const NODE_EXP_BASE: Record<RogueNodeType, number> = {
    start: 0, battle: 40, elite: 60, boss: 120,
    rest: 20, shop: 25, treasure: 30, event: 30, enhance: 35,
};

/** 深度系数：0=起点→0.6，1=Boss→1.0（深度越深经验越多） */
export const NODE_DEPTH_MULT = (depthFrac: number): number => 0.6 + 0.4 * depthFrac;

/** 难度经验倍率 */
export const DIFFICULTY_EXP_MULT: Record<RogueDifficulty, number> = {
    normal: 1, secret: 1.5, topsecret: 2,
};

/** [2026-09-22 莉莉子 修复] 各难度「基准时长 PAR」（分钟）= 该难度正常节奏通关一局的典型耗时。
 *  ⚠️ 根因记录：旧档位（10/15/20 分钟）是**绝对值**，而机密 / 绝密地图分别是普通的 2 倍 / 2.7 倍长，
 *  高难度必然超时 → 时长倍率恒为 ×1，把难度倍率（1.5 / 2）整个吃掉：
 *    有效倍率 = 普通 1×2=2.0 ＞ 机密 1.5×1=1.5  →  机密一局经验(1092) 反而**少于**普通(1098)。
 *  现改为「相对本难度基准」的比值制：三难度正常节奏一律 ×2，打得比基准快才拿 ×3。
 *  基准值依据：单场战斗 3 分 / 精英 4.5 分 / Boss 6 分 / 非战斗节点 0.5 分的节奏推演
 *  （普通 3 战 ≈14 分 · 机密 6 战 ≈26 分 · 绝密 8 战 ≈38 分）。改地图长度时需同步复核此表。 */
export const DIFFICULTY_PAR_MINUTES: Record<RogueDifficulty, number> = {
    normal: 14, secret: 26, topsecret: 38,
};

/** 速通时长档位：ratio = 实际时长 / 本难度基准时长（越小越快），最高 3 倍
 *  [2026-09-15 程拍板] 仅整局通关才生效 —— 没通关吃什么速通奖励（败北 / 中途放弃一律 ×1） */
export const TIME_TIER_FRACS: { frac: number; mult: number }[] = [
    { frac: 0.8, mult: 3 },
    { frac: 1.15, mult: 2 },
    { frac: 1.5, mult: 1.5 },
    { frac: Number.POSITIVE_INFINITY, mult: 1 },
];

/** 通关额外经验（接替原 RUN_EXP.victory） */
export const CLEAR_EXP: Record<RogueDifficulty, number> = {
    normal: 300, secret: 450, topsecret: 700,
};

/** 对局时长（ms）+ 难度 → 速通倍率（分母为本难度基准时长 PAR，各难度口径一致） */
export const timeExpMult = (elapsedMs: number, difficulty: RogueDifficulty = 'normal'): number => {
    const par = DIFFICULTY_PAR_MINUTES[difficulty] ?? DIFFICULTY_PAR_MINUTES.normal;
    if (!(par > 0)) return 1;
    const ratio = elapsedMs / 60000 / par;
    for (const t of TIME_TIER_FRACS) {
        if (ratio < t.frac) return t.mult;
    }
    return 1;
};

/** 单节点即时经验（含深度 + 难度倍率；局内逐节点发放的原始值） */
export const computeNodeExp = (type: RogueNodeType, depthFrac: number, difficulty: RogueDifficulty): number =>
    Math.round(NODE_EXP_BASE[type] * NODE_DEPTH_MULT(depthFrac) * DIFFICULTY_EXP_MULT[difficulty]);

/** 整局结算经验（节点经验基础上叠加：通关/时长/效率/共鸣） */
export const computeRunExpTotal = (
    nodesExp: number,
    opts: {
        won: boolean;
        difficulty: RogueDifficulty;
        durationMs: number;
        expRateBonusPct?: number;
        resonance?: boolean; // 碳原子板：仅通关时经验翻倍（未通关由调用方传 false）
    },
): number => {
    const clear = opts.won ? CLEAR_EXP[opts.difficulty] : 0;
    const base = nodesExp + clear;
    // [2026-09-15 程拍板] 速通倍率只给通关（败北 / 中途放弃一律 ×1）
    // [2026-09-22 莉莉子 修复] 传入 difficulty：倍率分母改为本难度基准时长，消除高难度地图长导致的掉档
    const timeMult = opts.won ? timeExpMult(opts.durationMs, opts.difficulty) : 1;
    const rate = 1 + (opts.expRateBonusPct ?? 0) / 100;
    const reso = opts.resonance ? 2 : 1;
    return Math.round(base * timeMult * rate * reso);
};

/** [2026-08-29] 结算窗倍率明细（RogueSettleModal 展示） */
export interface RogueSettleDetail {
    durationMin: number;   // 对局时长（分钟，一位小数）
    timeMult: number;      // 速通时长倍率（仅通关生效；败北 / 中途放弃恒为 1）
    timeParMin?: number;   // [2026-09-22] 本难度基准时长（分钟）—— 速通倍率的分母，结算窗展示用
    diffMult: number;      // 难度倍率（普通1/机密1.5/绝密2）
    ratePct: number;       // 天启者经验效率加成（%）
    resonance: boolean;    // 碳原子板是否生效（仅通关 true；败北 / 中途放弃 false）
    clearExp: number;      // 通关额外经验（0 = 未通关）
    resource?: ResourceExpInfo; // [2026-09-07] 剩余资源折算经验（结算入账）
    resonanceSlot?: number;    // [2026-09-08 结算演出] 本局携带碳原子板并消耗的槽位号（-1/缺省=无）
    retrain?: { slots: number[]; tier: number }; // [2026-09-08 结算演出] 重修申请升档的槽位号列表 + 目标档（1史诗/2传说/3神话）
    abandoned?: boolean;   // [2026-09-15] 中途放弃：完全不算一局，结算窗隐藏经验/倍率明细
}

// ═══════ [2026-09-07 程拍板 慷慨档] 剩余资源 → 天启者经验 ═══════
// [2026-09-08 莉莉子] 仅"整局通关"结算时，把没花完的生命/金币/复活/刷新按比例折算经验补进结算
// （中途退出 / 败北不折算，防"开局即结算"刷等级）。解决"升太慢 + 资源留着没用"的挫败。
// 吃效率加成与碳原子板翻倍，但不吃速通时长倍率（与打多快无关）。
export const RESOURCE_EXP_RATES = { hpEach: 3, goldPer10: 4, reviveEach: 80, refreshEach: 35 };

export interface ResourceExpInfo {
    hp: number;       // 剩余生命
    gold: number;     // 剩余金币
    revive: number;   // 剩余复活次数
    refresh: number;  // 剩余刷新次数
    exp: number;      // 折算经验（基础值，效率/共鸣加成由调用方乘算）
}

/** 剩余资源基础折算（未含效率/共鸣乘数） */
export const computeResourceExp = (r: { hp: number; gold: number; revive: number; refresh: number }): ResourceExpInfo => ({
    hp: r.hp,
    gold: r.gold,
    revive: r.revive,
    refresh: r.refresh,
    exp: Math.floor(r.hp * RESOURCE_EXP_RATES.hpEach)
        + Math.floor(r.gold / 10) * RESOURCE_EXP_RATES.goldPer10
        + r.revive * RESOURCE_EXP_RATES.reviveEach
        + r.refresh * RESOURCE_EXP_RATES.refreshEach,
});

// ── 深度缓存（静态地图 → 深度恒定，一次性算）──
const depthCache = new Map<RogueDifficulty, Map<string, number>>();

/** 按难度取节点深度映射（0=起点，1=Boss；模块级缓存） */
export const getNodeDepth = (difficulty: RogueDifficulty): Map<string, number> => {
    let m = depthCache.get(difficulty);
    if (!m) {
        m = computeGraphDepth(ROGUE_MAPS[difficulty]);
        depthCache.set(difficulty, m);
    }
    return m;
};
