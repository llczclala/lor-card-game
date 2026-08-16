// ==========================================
// 悖论迷宫 · 玩家迷宫强化（门面）
// [2026-08-11 莉莉子] 门面化：玩家侧从统一库 buffs.ts 过滤 playerEligible 派生。
// 保留全部既有导出名（MAZE_ENHANCEMENTS / pickRandomEnhancements / MazeEnhancement / EnhancementRarity / EnhancementEffectType），
// 既有消费方（RogueMapScreen / NodeEventModal / EnhancementCard / EnhancementPreview / RogueDrawer / useRoguelikeRun / RarityIcon）零改动。
// ==========================================

import { MAZE_BUFFS, type MazeBuff, type EnhancementEffect, type EnhancementRarity } from './buffs';

export type { EnhancementRarity, EnhancementEffectType } from './buffs';

export type MazeEnhancement =
    Omit<MazeBuff, 'playerEligible' | 'enemyEligible' | 'effect'> & { effect: EnhancementEffect };

// 玩家可刷取 = playerEligible 的强化（effect 必填，保持既有 applyEnhancement 兼容）
export const MAZE_ENHANCEMENTS: MazeEnhancement[] = MAZE_BUFFS
    .filter(b => b.playerEligible)
    .map(b => ({ id: b.id, name: b.name, description: b.description, rarity: b.rarity, icon: b.icon, effect: b.effect! }));

// [2026-08-05] 原逻辑保留：绝密难度剔除纯回复项（heal）
// [2026-08-12 天启者养成] 加第 3 参 rarityBonus（高稀有度概率加成 %）：加权抽选（common 减权、rare/epic/legendary 加权）；无 bonus → 等概率，保持旧行为
export interface RarityBonusInput {
    rare: number;
    epic: number;
    legendary: number;
}

// 稀有度基准权重（总和 100）：高稀有度越稀有
const RARITY_BASE_WEIGHT: Record<EnhancementRarity, number> = {
    common: 60,
    rare: 30,
    epic: 9,
    legendary: 1,
};

const pickWeightedEnhancementIndex = (pool: MazeEnhancement[], bonus?: RarityBonusInput): number => {
    const weights = pool.map(e => {
        let w = RARITY_BASE_WEIGHT[e.rarity] ?? 10;
        if (bonus) {
            if (e.rarity === 'common') w = Math.max(1, w - (bonus.rare + bonus.epic + bonus.legendary));
            else if (e.rarity === 'rare') w += bonus.rare;
            else if (e.rarity === 'epic') w += bonus.epic;
            else if (e.rarity === 'legendary') w += bonus.legendary;
        }
        return w;
    });
    const total = weights.reduce((s, x) => s + x, 0);
    let r = Math.random() * total;
    for (let i = 0; i < pool.length; i++) {
        r -= weights[i];
        if (r <= 0) return i;
    }
    return pool.length - 1;
};

export const pickRandomEnhancements = (count: number, difficulty?: string, rarityBonus?: RarityBonusInput): MazeEnhancement[] => {
    let pool = [...MAZE_ENHANCEMENTS];
    if (difficulty === 'topsecret') {
        const filtered = pool.filter(e => e.effect.type !== 'heal');
        if (filtered.length >= count) pool = filtered;
    }
    const result: MazeEnhancement[] = [];
    while (result.length < count && pool.length > 0) {
        const idx = pickWeightedEnhancementIndex(pool, rarityBonus);
        result.push(pool[idx]);
        pool.splice(idx, 1);
    }
    return result;
};

/** 从玩家强化池按指定稀有度抽一个强化（惊喜宝箱用；无则 undefined） */
export const pickRandomEnhancementByRarity = (rarity: EnhancementRarity): MazeEnhancement | undefined => {
    const pool = MAZE_ENHANCEMENTS.filter(e => e.rarity === rarity);
    if (pool.length === 0) return undefined;
    return pool[Math.floor(Math.random() * pool.length)];
};
