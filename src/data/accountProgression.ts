import type { AnalystPassData, UserBattleRecord } from '../types';

// ==========================================
// 账号等级 · 数据层
// [2026-09-04 莉莉子] 独立账号等级系统：UserProfile.level/exp 正名为账号等级，
//   与评估嘉勉通行证（analystProgression）/ 天启者养成（heroProgression）解耦。
//   任何真实模式（PvE/教程/迷宫整局）对局结束都发经验；每升 1 级发 320 数据金。
//   无上限（程拍板）：前 50 级用曲线数组，之后用线性增长公式保证任意等级可算。
//   首胜(pve +120) ≈ 升 1 级，之后每级所需经验递增、升级越来越慢。
//   数值均为初始值，可调。
// ==========================================

/** 每升 1 级奖励的数据金（账号等级专属；通行证奖励另算） */
export const ACCOUNT_LEVEL_REWARD_DATA_GOLD = 320;

// 每级升到下一级所需经验（索引 i = 从 Lv(i+1) 升到 Lv(i+2)）。前快后慢。
export const ACCOUNT_EXP_CURVE: number[] = [
    120, 180, 250, 330, 420, 520, 630, 750, 880, 1020,               // Lv1→11
    1170, 1330, 1500, 1680, 1870, 2070, 2280, 2500, 2730, 2970,      // Lv11→21
    3220, 3480, 3750, 4030, 4320, 4620, 4930, 5250, 5580, 5920,      // Lv21→31
    6270, 6630, 7000, 7380, 7770, 8170, 8580, 9000, 9430, 9870,      // Lv31→41
    10320, 10780, 11250, 11730, 12220, 12720, 13230, 13750, 14280, 14820, // Lv41→51
];

/** 超曲线覆盖后的账号经验（无上限，线性增长，每级递增 450） */
const ACCOUNT_EXP_POST_BASE = 14820;
const ACCOUNT_EXP_POST_STEP = 450;

/** 升到下一级所需经验（无上限：数组覆盖前 50 档，之后用增长公式） */
export const getAccountExpToNext = (level: number): number => {
    const idx = Math.max(0, level - 1);
    if (idx < ACCOUNT_EXP_CURVE.length) return ACCOUNT_EXP_CURVE[idx];
    return ACCOUNT_EXP_POST_BASE + (idx - ACCOUNT_EXP_CURVE.length) * ACCOUNT_EXP_POST_STEP;
};

/** 单场真实对局结算发放的账号经验（win/lose；初始值可调） */
export const ACCOUNT_EXP_BY_MODE: Record<'pve' | 'tutorial' | 'rogue', { win: number; lose: number }> = {
    pve: { win: 120, lose: 60 },
    tutorial: { win: 80, lose: 40 },
    rogue: { win: 200, lose: 80 }, // 迷宫按"整局"结算一次（逐节点战斗不计）
};

/**
 * 加账号等级经验，处理连续升级（纯函数）。
 * @returns 新等级/经验 + 跨级清单 leveled（调用方逐级发 320 数据金）
 */
export const computeAccountLevels = (
    level: number,
    exp: number,
    amount: number,
): { level: number; exp: number; leveled: { from: number; to: number }[] } => {
    let lv = Math.max(1, Math.floor(level || 1));
    let e = (exp || 0) + amount;
    const leveled: { from: number; to: number }[] = [];
    // 安全闸：等级曲线单调递增，正常不会超；防极端大额经验注入死循环
    let guard = 0;
    while (guard++ < 5000) {
        const need = getAccountExpToNext(lv);
        if (need <= 0 || e < need) break;
        e -= need;
        const from = lv;
        lv += 1;
        leveled.push({ from, to: lv });
    }
    return { level: lv, exp: e, leveled };
};

/** 评估嘉勉通行证初始数据（空） */
export const createAnalystPass = (): AnalystPassData => ({ level: 1, exp: 0 });

/** 空战绩（新账号首次对局前） */
export const createEmptyBattleRecord = (): UserBattleRecord =>
    ({ totalMatches: 0, wins: 0, losses: 0, updatedAt: 0, byMode: {}, heroes: {} });
