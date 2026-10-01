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

// [2026-09-29 程拍板 · 已移除] 原先这里还有两组"粗暴数值倍率"常量：
//   · DIFFICULTY_HP_MULTIPLIER（1 / 1.25 / 1.5）
//   · DIFFICULTY_LEVEL_BONUS（+0 / +1 / +2）
//   它们是"难度直接乘血量倍率 / 抬高敌方天启者等级"的思路，**违背本作卡牌游戏底层逻辑** ——
//   敌人强度只应由**装备**与**迷宫强化**控制（见 §3.2 / §3.3 两条轴），不该直接改数值。
//   （两者实际也从未接线：hpMultiplier 无消费者、heroConfig.level 被 GameSession 丢弃。）
//
// [2026-08-28 程拍板] 敌方水晶基础生命值：普通 10 / 机密 20 / 绝密 30 → 这是**唯一保留**的数值轴，
//   因为水晶血量是"关卡血量"而非"单位身材"，不受上述原则约束。
// [2026-09-29 程拍板] 绝密 25 → 30：让绝密对普通达成 **3 倍血量**（10 / 20 / 30），
//   原 25 只有 2.5 倍，机密→绝密的血量增量（+17%）明显小于普通→机密（+50%）。
// 中后段（深度≥1/3）敌人额外持有 +10 生命强化、Boss 额外持有 +20 生命强化（mapLayout 预分配 → encounterBuilder 折算进敌方水晶初值）
export const ENEMY_NEXUS_BASE: Record<RogueDifficulty, number> = {
    normal: 10,
    secret: 20,
    topsecret: 30,
};
