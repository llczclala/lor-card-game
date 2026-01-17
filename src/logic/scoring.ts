import type { GameStats } from '../types';

// --- 1. 评分常量定义 (Configuration) ---

// 基础分值表 (Base Score Values)
export const SCORE_VALUES = {
    nexusDamage: 5000,   // 每点伤害 5000 (Max 100,000)
    unitsPlayed: 2000,   // 每打出一个单位
    heroesPlayed: 5000,  // 每打出一个英雄
    spellsPlayed: 2000,  // 每打出一张法术
    unitsKilled: 3000,   // 每击杀一个单位
    heroesKilled: 10000, // 每击杀一个英雄
    heroLevelUps: 20000  // 每发生一次英雄升级
};

// 汇率定义
export const EXCHANGE_RATE = 200; // 200 分 = 1 通用银

// 加成倍率定义
const MULTIPLIERS = {
    VICTORY: 0.5,        // 胜利加成 +50%
    HERO_EVOLVED: 0.5    // 英雄升级加成 +50%
};

// --- 2. 接口定义 ---

// 单项得分详情 (用于结算界面展示)
export interface ScoreBreakdownItem {
    label: string; // 显示名称 (如 "击杀敌方英雄")
    count: number; // 数量
    value: number; // 单价
    total: number; // 小计 (count * value)
}

// 计算结果接口
export interface GameScoreResult {
    breakdown: ScoreBreakdownItem[]; // 基础分详情列表
    baseScore: number;               // 基础总分
    multiplier: number;              // 最终倍率 (e.g. 1.5, 2.0)
    finalScore: number;              // 最终得分 (base * multiplier)
    silverEarned: number;            // 获得的通用银
    achievements: string[];          // 达成的成就列表 (用于 UI 展示加成项)
}

// --- 3. 核心计算函数 ---

/**
 * 计算战斗评分与奖励
 * @param stats 战斗统计数据
 * @param gameResult 游戏结果 ('victory' | 'defeat')
 * @param hasLeveledUp 本局是否有英雄升级 (boolean)
 */
export const calculateGameScore = (
    stats: GameStats,
    gameResult: 'victory' | 'defeat' | null,
    hasLeveledUp: boolean
): GameScoreResult => {

    // A. 计算基础分 (Base Score)
    const breakdown: ScoreBreakdownItem[] = [];
    let baseScore = 0;

    // 辅助函数：添加条目
    const addItem = (key: keyof typeof SCORE_VALUES, count: number, label: string) => {
        if (count > 0) {
            const value = SCORE_VALUES[key];
            const total = count * value;
            breakdown.push({ label, count, value, total });
            baseScore += total;
        }
    };

    // 1. 水晶伤害 (上限 20)
    // 即使 stats 记录超过 20，评分也只算 20
    const validNexusDamage = Math.min(stats.nexusDamage, 20);
    addItem('nexusDamage', validNexusDamage, '水晶伤害');

    // 2. 击杀
    addItem('heroesKilled', stats.heroesKilled, '击败英雄');
    addItem('unitsKilled', stats.unitsKilled, '击败单位');

    // 3. 英雄高光
    addItem('heroLevelUps', stats.heroLevelUps, '英雄升级');

    // 4. 出牌统计
    addItem('heroesPlayed', stats.heroesPlayed, '登场英雄');
    addItem('unitsPlayed', stats.unitsPlayed, '部署单位');
    addItem('spellsPlayed', stats.spellsPlayed, '施放法术');

    // B. 计算倍率 (Multiplier)
    let multiplier = 1.0;
    const achievements: string[] = [];

    // 胜利加成
    if (gameResult === 'victory') {
        multiplier += MULTIPLIERS.VICTORY;
        achievements.push('战斗胜利 (+50%)');
    }

    // 升级加成 (只要发生过升级就算，stats.heroLevelUps > 0 也可佐证，但传入 boolean 更灵活)
    if (hasLeveledUp || stats.heroLevelUps > 0) {
        multiplier += MULTIPLIERS.HERO_EVOLVED;
        achievements.push('英雄晋升 (+50%)');
    }

    // C. 汇总计算
    const finalScore = Math.floor(baseScore * multiplier);

    // D. 货币转化 (四舍五入)
    const silverEarned = Math.round(finalScore / EXCHANGE_RATE);

    return {
        breakdown,
        baseScore,
        multiplier,
        finalScore,
        silverEarned,
        achievements
    };
};