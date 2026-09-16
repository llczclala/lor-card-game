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

/** 速通时长倍率档位（时间越短越高，最高 3 倍）
 *  [2026-09-15 程拍板] 仅整局通关才生效 —— 没通关吃什么速通奖励（败北 / 中途放弃一律 ×1） */
export const TIME_MULT_TIERS: { maxMinutes: number; mult: number }[] = [
    { maxMinutes: 10, mult: 3 },
    { maxMinutes: 15, mult: 2 },
    { maxMinutes: 20, mult: 1.5 },
    { maxMinutes: Number.POSITIVE_INFINITY, mult: 1 },
];

/** 通关额外经验（接替原 RUN_EXP.victory） */
export const CLEAR_EXP: Record<RogueDifficulty, number> = {
    normal: 300, secret: 450, topsecret: 700,
};

/** 对局时长（ms）→ 速通倍率（越短越高） */
export const timeExpMult = (elapsedMs: number): number => {
    const minutes = elapsedMs / 60000;
    for (const t of TIME_MULT_TIERS) {
        if (minutes < t.maxMinutes) return t.mult;
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
    const timeMult = opts.won ? timeExpMult(opts.durationMs) : 1;
    const rate = 1 + (opts.expRateBonusPct ?? 0) / 100;
    const reso = opts.resonance ? 2 : 1;
    return Math.round(base * timeMult * rate * reso);
};

/** [2026-08-29] 结算窗倍率明细（RogueSettleModal 展示） */
export interface RogueSettleDetail {
    durationMin: number;   // 对局时长（分钟，一位小数）
    timeMult: number;      // 速通时长倍率（仅通关生效；败北 / 中途放弃恒为 1）
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
