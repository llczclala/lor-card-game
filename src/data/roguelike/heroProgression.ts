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

// [2026-08-27] 武装可装备品质（六档）。[2026-09-07] 等级奖励只解锁到稀有（13 级），紫/金/红神话由「重修申请」逐档提升（每槽独立）。
export type ArmamentRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' | 'mythic';
// [2026-08-27] 六档品质权重：白0 / 绿1 / 蓝2 / 紫3 / 金4 / 红5
const ARMAMENT_RANK: Record<ArmamentRarity, number> = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4, mythic: 5 };
/** [2026-09-07 重修申请] 品质档位列表（rank 下标取色/取档） */
export const ARMAMENT_RARITY_LIST: ArmamentRarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'];

/**
 * [2026-09-07 重修申请] 合并基础品质（等级解锁 ≤ 稀有）+ 槽位额外档（重修胜利提升，0~3）
 *  @param base 等级基础品质（getHeroLevelBonus().armamentRarity）
 *  @param extraTiers 该槽重修额外档数（0-3，红神话封顶）
 */
export const combineArmamentRarity = (base: ArmamentRarity, extraTiers: number): ArmamentRarity => {
    const r = ARMAMENT_RANK[base] + Math.max(0, extraTiers);
    return ARMAMENT_RARITY_LIST[Math.min(ARMAMENT_RARITY_LIST.length - 1, r)];
};

export interface HeroLevelBonus {
    maxHpBonus: number;         // 开局生命上限（累加，基础 20，[2026-08-28] 等级四节点各 +5 → 满级 40）
    goldBonus: number;          // 开局金币（累加，基础 50）
    reviveBonus: number;        // 复活次数（累加，基础 1）
    refreshBonus: number;       // 刷新次数（累加，基础 1）
    grantedEnhancements: string[]; // 开局自动获得的迷宫强化 id（buffs.ts 玩家侧）
    grantedEquipments: string[];   // 开局自动挂载的装备 id（equipment.ts，attachEquipment 挂起始英雄卡）
    grantedSpellEquips: string[];  // [2026-08-29 程拍板] 开局随机一张初始牌组法术卡挂的装备 id（海基的推演手记，费用-1；原「微缩回路」）
    grantedUnitEquips: string[];   // [2026-08-29 程拍板] 开局随机一个初始牌组非英雄单位挂的装备 id（均衡增补/强攻模板）
    rarityBonus: { rare: number; epic: number; legendary: number }; // 高稀有度概率加成（%，累积）
    armamentSlots: number;      // [2026-08-14 武装] 解锁武装槽位数（1-3，默认 1；达到 2/3 解锁对应槽位）
    armamentRarity: ArmamentRarity; // [2026-08-14 武装] 可装备武装最高品质（默认绿，最高金）
    shopTabBonus: number;       // [2026-08-28] 商店页签位加成（基础 2，每 +1 多开一个随机页签，最高 4）
    expRateBonus: number;       // [2026-08-29 程拍板] 经验获取效率加成（%，结算时乘算）
    equipRarityBonus: number;   // [2026-08-29 程拍板] 装备稀有度加成（%，战斗奖励抽选紫金加权）
}

const ZERO_RARITY = { rare: 0, epic: 0, legendary: 0 };

// ── 加成里程碑表（阶梯式）──
// 累计：生命 +20（[2026-08-28] 基础 20 + 四节点各 +5 → 满级 40）/ 金币 +220（[2026-09-07] 30 级补 +100）/ 复活 +1 / 刷新 +5（[2026-09-07] 26 级补 +1）/ 稀有度 Rare15% Epic5% Legendary2% / 商店页签 +2（[2026-08-28] 基础 2 → 满级 4 全开）/ 迷宫强化「天启共鸣」×1
// [2026-08-28] 生命奖励收敛为 4 个节点：5/10/15/20 级各 +5（程拍板，满级生命 40）；商店页签位 16/27 级各 +1（[2026-09-01] 原 7 级上移至 27 级）
// [2026-08-29 程拍板] 迷宫强化/钢铁核心全部移出等级奖励（不再开局自带局内强化）；替换为——11/22 级随机法术卡持「海基的推演手记」（原「微缩回路」）、12 级刷新+1、25/28 级随机非英雄单位获「均衡增补」/「强攻模板」；1/4 级补刷新/金币
// [2026-09-01 程拍板] 7 级改「获得迷宫强化：天启共鸣」（开局从牌库随机抽一张天启者到手牌，提高上手率）；原「开局牌组加天启者」机制废弃删除
export const HERO_LEVEL_BONUS: Record<number, Partial<HeroLevelBonus>> = {
    1: { refreshBonus: 1 },                                        // [2026-08-29 程拍板] 刷新次数 +1（1 级首礼）
    2: { reviveBonus: 1 },
    3: { refreshBonus: 1 },
    4: { goldBonus: 30 },                                          // [2026-08-29 程拍板] 开局金币 +30
    5: { maxHpBonus: 5 },                                        // [2026-08-28] 生命节点① +5（迷宫强化已移走 08-29）
    6: { expRateBonus: 5 },                                      // [2026-08-29 程拍板] 经验获取效率 +5%（替代重复稀有度档）
    7: { grantedEnhancements: ['enhance_champion_resonance'] }, // [2026-09-01 程拍板] 获得迷宫强化：天启共鸣（开局从牌库随机抽一张天启者到手牌）
    8: { goldBonus: 30 },
    9: { armamentSlots: 2 },                                     // [2026-08-14 武装] 获得二号武装槽位
    10: { maxHpBonus: 5, rarityBonus: { rare: 0, epic: 2.5, legendary: 0 }, equipRarityBonus: 10 },  // [2026-08-28] 生命节点② +5 · [2026-08-29] 装备稀有度 +10
    11: { grantedSpellEquips: ['equip_cost_down'] },             // [2026-08-29 程拍板] 随机一张初始牌组法术卡持有「海基的推演手记」（费用-1；原「微缩回路」）①
    12: { refreshBonus: 1 },                                     // [2026-08-29 程拍板] 刷新次数 +1（原以战养战已移走）
    13: { armamentRarity: 'rare' },                              // [2026-08-14 武装] 可以装备稀有武装
    14: { goldBonus: 30 },
    15: { maxHpBonus: 5, refreshBonus: 1 },                      // [2026-08-28] 生命节点③ +5
    16: { shopTabBonus: 1 },                                     // [2026-08-28] 商店页签位②：商店开启 4 个随机页签（全开）
    17: { expRateBonus: 5 },                                     // [2026-08-29 程拍板] 经验获取效率 +5%（替代重复稀有度档）
    18: { armamentSlots: 3 },                                    // [2026-08-14 武装] 获得三号武装槽位
    19: { equipRarityBonus: 10 },                                    // [2026-08-29] 装备稀有度 +10（替代重复稀有度档）
    20: { maxHpBonus: 5 },                                       // [2026-08-28] 生命节点④ +5（迷宫强化已移走 08-29）
    21: { goldBonus: 30 },
    22: { grantedSpellEquips: ['equip_cost_down'] },             // [2026-08-29 程拍板] 随机一张初始牌组法术卡持有「海基的推演手记」（费用-1；原「微缩回路」）②
    23: { expRateBonus: 10 },                                    // [2026-08-29 程拍板] 经验获取效率 +10%（替代重复稀有度档）
    24: { rarityBonus: { rare: 5, epic: 0, legendary: 0 } },
    25: { grantedUnitEquips: ['equip_stat_11'] },                // [2026-08-29 程拍板] 随机一个非英雄单位获得「均衡增补」（+1/+1）
    26: { refreshBonus: 1, equipRarityBonus: 15 },              // [2026-09-07 程拍板] 武装品质奖励移除（只保留 13 级稀有），26 级改刷新 +1；装备稀有度 +15 保留
    27: { shopTabBonus: 1 },                                     // [2026-09-01 程拍板] 商店页签位（原 7 级上移；满级页签 2+16+27=4 全开）
    28: { grantedUnitEquips: ['equip_stat_21'] },                // [2026-08-29 程拍板] 随机一个非英雄单位获得「强攻模板」（+2/+2）
    29: { expRateBonus: 10, equipRarityBonus: 15 },              // [2026-08-29 程拍板] 经验效率 +10% · 装备稀有度 +15
    30: { goldBonus: 100 },                                      // [2026-09-07 程拍板] 武装品质奖励移除（原 30 级 mythic 解锁），满级礼改为开局金币 +100
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
        grantedSpellEquips: [],
        grantedUnitEquips: [],
        rarityBonus: { ...ZERO_RARITY },
        armamentSlots: 1,
        armamentRarity: 'uncommon', // [2026-08-27] 六档：默认可装白+绿
        shopTabBonus: 0, // [2026-08-28] 商店页签位（基础 2，每 +1 多开一个）
        expRateBonus: 0, // [2026-08-29] 经验获取效率（%）
        equipRarityBonus: 0, // [2026-08-29] 装备稀有度加成（%）
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
        if (b.grantedSpellEquips) result.grantedSpellEquips.push(...b.grantedSpellEquips);
        if (b.grantedUnitEquips) result.grantedUnitEquips.push(...b.grantedUnitEquips);
        if (b.rarityBonus) {
            result.rarityBonus.rare += b.rarityBonus.rare ?? 0;
            result.rarityBonus.epic += b.rarityBonus.epic ?? 0;
            result.rarityBonus.legendary += b.rarityBonus.legendary ?? 0;
        }
        // [2026-08-14 武装] 槽位取最大解锁数；品质取最高（六档 rank 比较）
        if (b.armamentSlots) result.armamentSlots = Math.max(result.armamentSlots, b.armamentSlots);
        if (b.armamentRarity && ARMAMENT_RANK[b.armamentRarity] > ARMAMENT_RANK[result.armamentRarity]) {
            result.armamentRarity = b.armamentRarity;
        }
        // [2026-08-28] 商店页签位累加
        result.shopTabBonus += b.shopTabBonus ?? 0;
        // [2026-08-29] 经验获取效率累加
        result.expRateBonus += b.expRateBonus ?? 0;
        // [2026-08-29] 装备稀有度加成累加
        result.equipRarityBonus += b.equipRarityBonus ?? 0;
    }
    return result;
};

/** 升到下一级所需经验（满级返回 0） */
export const getExpToNextLevel = (level: number): number => {
    if (level >= MAX_HERO_LEVEL) return 0;
    return HERO_EXP_CURVE[level - 1] ?? 0;
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
