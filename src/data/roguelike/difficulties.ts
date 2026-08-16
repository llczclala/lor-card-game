// ==========================================
// 悖论迷宫 · 难度系统（普通 / 机密 / 绝密）
// [2026-08-07] 难度只影响地图构造 / 敌人牌组 / 迷宫 BUFF，不影响 AI 智慧
// ==========================================

export type RogueDifficulty = 'normal' | 'secret' | 'topsecret';

export interface RogueDifficultyConfig {
    key: RogueDifficulty;
    label: string;                 // 普通 / 机密 / 绝密
    desc: string;                  // 简短描述
    filter: string;                // 地图/缩略图滤镜 CSS（普通为空）
    warnIcon?: boolean;            // 绝密附带警示图标 + 文字
    unlockAfter: RogueDifficulty | null; // 解锁前置难度（null = 默认解锁）
}

// [滤镜微调区] 各难度对地图/缩略图的滤镜，可在此调整色相/饱和度
// [2026-08-07 夜] 程要求交换：机密=红色，绝密=橙色
export const DIFFICULTY_FILTER: Record<RogueDifficulty, string> = {
    normal: '',
    secret: 'grayscale(0.15) sepia(1) hue-rotate(-5deg) brightness(0.9) saturate(1.7)',      // 红色
    topsecret: 'grayscale(0.15) sepia(1) hue-rotate(-25deg) brightness(0.9) saturate(1.5)', // 橙色
};

export const ROGUE_DIFFICULTIES: RogueDifficultyConfig[] = [
    { key: 'normal',    label: '普通', desc: '标准推演',        filter: DIFFICULTY_FILTER.normal,    unlockAfter: null },
    { key: 'secret',    label: '机密', desc: '深度推演',        filter: DIFFICULTY_FILTER.secret,    unlockAfter: 'normal' },
    { key: 'topsecret', label: '绝密', desc: '终极推演',        filter: DIFFICULTY_FILTER.topsecret, warnIcon: true, unlockAfter: 'secret' },
];

// 难度 → 敌人血量倍率 / 等级加成（仅影响敌人强度，不动 AI 行为）
export const DIFFICULTY_HP_MULTIPLIER: Record<RogueDifficulty, number> = {
    normal: 1,
    secret: 1.25,
    topsecret: 1.5,
};

export const DIFFICULTY_LEVEL_BONUS: Record<RogueDifficulty, number> = {
    normal: 0,
    secret: 1,
    topsecret: 2,
};
