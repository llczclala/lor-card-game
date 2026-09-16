// ==========================================
// 悖论迷宫 · 玩家迷宫强化（门面）
// [2026-08-11 莉莉子] 门面化：玩家侧从统一库 buffs.ts 过滤 playerEligible 派生。
// 保留全部既有导出名（MAZE_ENHANCEMENTS / pickRandomEnhancements / MazeEnhancement / EnhancementRarity / EnhancementEffectType），
// 既有消费方（RogueMapScreen / NodeEventModal / EnhancementCard / EnhancementPreview / RogueDrawer / useRoguelikeRun / RarityIcon）零改动。
// ==========================================

import { MAZE_BUFFS, type MazeBuff, type EnhancementEffect, type EnhancementRarity } from './buffs';
import { PASS_UNLOCK_ENHANCEMENTS } from './analystProgression'; // [2026-08-29 通行证] 通行证解锁的强化

export type { EnhancementRarity, EnhancementEffectType } from './buffs';

export type MazeEnhancement =
    Omit<MazeBuff, 'playerEligible' | 'enemyEligible' | 'effect'> & { effect: EnhancementEffect };

// [2026-08-29 通行证] 通行证专属强化（达到等级解锁才可遇到）——默认从玩家池剔除
export const PASS_LOCKED_ENHANCEMENT_IDS = new Set<string>(Object.values(PASS_UNLOCK_ENHANCEMENTS));

// 玩家可刷取 = playerEligible 且非通行证专属的强化（effect 必填，保持既有 applyEnhancement 兼容）
export const MAZE_ENHANCEMENTS: MazeEnhancement[] = MAZE_BUFFS
    .filter(b => b.playerEligible && !PASS_LOCKED_ENHANCEMENT_IDS.has(b.id))
    .map(b => ({ id: b.id, name: b.name, description: b.description, rarity: b.rarity, icon: b.icon, effect: b.effect! }));

/** [2026-08-29 通行证] 构建可抽选池：基础池 + 已解锁的通行证强化（unlockedPass 传已解锁 id 列表） */
const buildPool = (unlockedPass?: string[]): MazeEnhancement[] => {
    const passDefs = (unlockedPass ?? [])
        .map(id => MAZE_BUFFS.find(b => b.id === id))
        .filter((b): b is MazeBuff => !!b && b.playerEligible);
    return [
        ...MAZE_ENHANCEMENTS,
        ...passDefs.map(b => ({ id: b.id, name: b.name, description: b.description, rarity: b.rarity, icon: b.icon, effect: b.effect! })),
    ];
};

// [2026-08-05] 原逻辑保留：绝密难度剔除纯回复项（heal）
// [2026-08-12 天启者养成] 加第 3 参 rarityBonus（高稀有度概率加成 %）：加权抽选（common 减权、rare/epic/legendary 加权）；无 bonus → 等概率，保持旧行为
export interface RarityBonusInput {
    rare: number;
    epic: number;
    legendary: number;
}

// 稀有度基准权重（高稀有度越稀有）[2026-08-27] 六档：白/绿低档最常出，红暂空
const RARITY_BASE_WEIGHT: Record<EnhancementRarity, number> = {
    common: 70,     // 白（若有最基础档，最常见）
    uncommon: 60,   // 绿（原 common 平移）
    rare: 30,       // 蓝
    epic: 9,        // 紫
    legendary: 1,   // 金
    mythic: 0,      // 红（暂无强化）
};

const pickWeightedEnhancementIndex = (pool: MazeEnhancement[], bonus?: RarityBonusInput): number => {
    const weights = pool.map(e => {
        let w = RARITY_BASE_WEIGHT[e.rarity] ?? 10;
        if (bonus) {
            // [2026-08-27] 六档：低档（白/绿）减权，高档（蓝/紫/金）加权；红暂无强化不参与
            if (e.rarity === 'common' || e.rarity === 'uncommon') w = Math.max(1, w - (bonus.rare + bonus.epic + bonus.legendary));
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

export const pickRandomEnhancements = (count: number, difficulty?: string, rarityBonus?: RarityBonusInput, unlockedPass?: string[]): MazeEnhancement[] => {
    let pool = buildPool(unlockedPass); // [2026-08-29] 基础池 + 已解锁通行证强化
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

/** 从玩家强化池按指定稀有度抽一个强化（惊喜宝箱用；无则 undefined）。[2026-08-29] 支持已解锁通行证强化 */
export const pickRandomEnhancementByRarity = (rarity: EnhancementRarity, unlockedPass?: string[]): MazeEnhancement | undefined => {
    const pool = buildPool(unlockedPass).filter(e => e.rarity === rarity);
    if (pool.length === 0) return undefined;
    return pool[Math.floor(Math.random() * pool.length)];
};
