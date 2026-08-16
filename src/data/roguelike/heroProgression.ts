// ==========================================
// 悖论迷宫 · 天启者养成——等级功能（数据层）
// [2026-08-12 莉莉子] 参考 LOR 英雄之路英雄升级（见 技术手册/参考-LOR英雄升级.md）：
//   - 每英雄独立等级（1-30），共用一张经验曲线
//   - 等级加成「阶梯式」：非每级都给，生命/金币/稀有度都是区间档位，避免数值膨胀
//   - 稀有度概率「累积叠加」
// 加成在开局（startRun）由 useHeroProgression 查询并应用；强化/装备「开局自动获得」。
// ==========================================

export const MAX_HERO_LEVEL = 30;

// 每级升到下一级所需经验（索引 i = 从 Lv(i+1) 升到 Lv(i+2)）。前快后慢，30 级累计约 4.8 万（数值可调）
export const HERO_EXP_CURVE: number[] = [
    50, 90, 130, 180, 240, 310, 390, 480, 580, 690,        // Lv1→11
    810, 940, 1080, 1230, 1390, 1560, 1740, 1930, 2130, 2340, // Lv11→21
    2560, 2790, 3030, 3280, 3540, 3810, 4090, 4380, 4680, 4990, // Lv21→30
];

export interface HeroLevelBonus {
    maxHpBonus: number;         // 开局生命上限（累加，基础 30）
    goldBonus: number;          // 开局金币（累加，基础 50）
    reviveBonus: number;        // 复活次数（累加，基础 1）
    refreshBonus: number;       // 刷新次数（累加，基础 1）
    grantedEnhancements: string[]; // 开局自动获得的迷宫强化 id（buffs.ts 玩家侧）
    grantedEquipments: string[];   // 开局自动挂载的装备 id（equipment.ts，attachEquipment 挂起始英雄卡）
    rarityBonus: { rare: number; epic: number; legendary: number }; // 高稀有度概率加成（%，累积）
    armamentSlots: number;      // [2026-08-14 武装] 解锁武装槽位数（1-3，默认 1；达到 2/3 解锁对应槽位）
    armamentRarity: 'common' | 'rare' | 'epic'; // [2026-08-14 武装] 可装备武装最高品质（默认 common）
}

const ZERO_RARITY = { rare: 0, epic: 0, legendary: 0 };

// ── 加成里程碑表（阶梯式）──
// 累计：生命 +40 / 金币 +120 / 复活 +1 / 刷新 +2 / 强化 ×4 / 装备 ×3 / 稀有度 Rare15% Epic10% Legendary3%
export const HERO_LEVEL_BONUS: Record<number, Partial<HeroLevelBonus>> = {
    1: { maxHpBonus: 10 },
    2: { reviveBonus: 1 },
    3: { refreshBonus: 1 },
    4: { maxHpBonus: 5 },
    5: { grantedEnhancements: ['enhance_heart'] },        // 巨像心核：最大生命 +10 并回复
    6: { rarityBonus: { rare: 5, epic: 0, legendary: 0 } },
    7: { maxHpBonus: 5 },
    8: { goldBonus: 30 },
    9: { armamentSlots: 2 },                             // [2026-08-14 武装] 获得二号武装槽位
    10: { rarityBonus: { rare: 0, epic: 2.5, legendary: 0 } },
    11: { maxHpBonus: 5 },
    12: { grantedEnhancements: ['enhance_gold'] },        // 数据洪流：+80 金币
    13: { armamentRarity: 'rare' },                       // [2026-08-14 武装] 可以装备稀有武装
    14: { goldBonus: 30 },
    15: { refreshBonus: 1 },
    16: { maxHpBonus: 5 },
    17: { rarityBonus: { rare: 5, epic: 0, legendary: 0 } },
    18: { armamentSlots: 3 },                             // [2026-08-14 武装] 获得三号武装槽位
    19: { rarityBonus: { rare: 0, epic: 2.5, legendary: 0 } },
    20: { grantedEnhancements: ['enhance_card'] },        // 残响翻新：+1 随机卡
    21: { goldBonus: 30 },
    22: { maxHpBonus: 5 },
    23: { rarityBonus: { rare: 0, epic: 0, legendary: 1 } },
    24: { rarityBonus: { rare: 5, epic: 0, legendary: 0 } },
    25: { grantedEquipments: ['equip_big_stats'] },       // 钢铁核心：+4/+4
    26: { armamentRarity: 'epic' },                       // [2026-08-14 武装] 可以装备史诗武装
    27: { goldBonus: 30 },
    28: { maxHpBonus: 5 },
    29: { rarityBonus: { rare: 0, epic: 0, legendary: 1 } },
    30: { grantedEnhancements: ['enhance_heal'] },        // 源质灌注：回复 50% 生命
};

/**
 * 计算某等级的天启者累计加成（累加所有 ≤ level 的里程碑加成）。
 * @param level 1..MAX_HERO_LEVEL
 */
export const getHeroLevelBonus = (level: number): HeroLevelBonus => {
    const result: HeroLevelBonus = {
        maxHpBonus: 0,
        goldBonus: 0,
        reviveBonus: 0,
        refreshBonus: 0,
        grantedEnhancements: [],
        grantedEquipments: [],
        rarityBonus: { ...ZERO_RARITY },
        armamentSlots: 1,
        armamentRarity: 'common',
    };
    const capped = Math.max(1, Math.min(MAX_HERO_LEVEL, level));
    for (let lv = 1; lv <= capped; lv++) {
        const b = HERO_LEVEL_BONUS[lv];
        if (!b) continue;
        result.maxHpBonus += b.maxHpBonus ?? 0;
        result.goldBonus += b.goldBonus ?? 0;
        result.reviveBonus += b.reviveBonus ?? 0;
        result.refreshBonus += b.refreshBonus ?? 0;
        if (b.grantedEnhancements) result.grantedEnhancements.push(...b.grantedEnhancements);
        if (b.grantedEquipments) result.grantedEquipments.push(...b.grantedEquipments);
        if (b.rarityBonus) {
            result.rarityBonus.rare += b.rarityBonus.rare ?? 0;
            result.rarityBonus.epic += b.rarityBonus.epic ?? 0;
            result.rarityBonus.legendary += b.rarityBonus.legendary ?? 0;
        }
        // [2026-08-14 武装] 槽位取最大解锁数；品质取最高（rare < epic）
        if (b.armamentSlots) result.armamentSlots = Math.max(result.armamentSlots, b.armamentSlots);
        if (b.armamentRarity === 'epic') result.armamentRarity = 'epic';
        else if (b.armamentRarity === 'rare' && result.armamentRarity === 'common') result.armamentRarity = 'rare';
    }
    return result;
};

/** 升到下一级所需经验（满级返回 0） */
export const getExpToNextLevel = (level: number): number => {
    if (level >= MAX_HERO_LEVEL) return 0;
    return HERO_EXP_CURVE[level - 1] ?? 0;
};

// ── 每局经验结算（参考 LOR：按难度 + 胜负；数值可调）──
export const RUN_EXP = {
    victory: { normal: 200, secret: 300, topsecret: 450 },
    defeat: { normal: 80, secret: 120, topsecret: 180 },
} as const;

export const getRunExp = (difficulty: string, won: boolean): number => {
    const table = won ? RUN_EXP.victory : RUN_EXP.defeat;
    return (table as Record<string, number>)[difficulty] ?? table.normal;
};

// ── 等级视觉：徽章色档（HeroLevelBadge 用）──
export const getLevelColor = (level: number): string => {
    if (level >= 30) return '#f87171'; // 满级：红金
    if (level >= 20) return '#facc15'; // 高阶：金
    if (level >= 10) return '#a855f7'; // 中阶：紫
    return '#22d3ee';                  // 低阶：青
};

// ── 等级数字色档（[2026-08-13] 头像下方等级数值用，程定 6 段）──
export const getLevelNumberColor = (level: number): string => {
    if (level >= 26) return '#f87171'; // 25-30 红
    if (level >= 21) return '#facc15'; // 20-25 金
    if (level >= 16) return '#a855f7'; // 15-20 紫
    if (level >= 11) return '#3b82f6'; // 10-15 蓝
    if (level >= 6) return '#22c55e';  // 05-10 绿
    return '#9ca3af';                  // 01-05 灰
};
