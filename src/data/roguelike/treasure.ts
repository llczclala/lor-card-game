// ==========================================
// 悖论迷宫 · 宝箱节点（数据层）
// [2026-08-12 莉莉子] 宝箱节点进入时随机开出一种宝箱：
//   金币 / 卡牌（6 张带装备六选一）/ 惊喜强化（2普通+1稀有三选一，或牺牲-10生命上限换史诗）/ 随机池
// 复用商店经济基础（卡生成 shop.ts、强化抽选 enhancements.ts）。
// ==========================================
import { generateCardOffers } from './shop';
import { pickRandomEnhancements } from './enhancements';

export type TreasureType = 'gold' | 'card' | 'surprise' | 'random';

export const GOLD_TREASURE_AMOUNT = 60;      // 金币宝箱固定 +60（可调）
export const CARD_TREASURE_COUNT = 6;        // 卡牌宝箱：6 张带装备的卡六选一
export const MAX_HP_TREASURE_AMOUNT = 5;     // 随机宝箱：生命上限 +5
export const SACRIFICE_MAX_HP = 10;          // 惊喜宝箱：牺牲 -10 生命上限换史诗强化

const TREASURE_TYPES: TreasureType[] = ['gold', 'card', 'surprise', 'random'];

/** 随机一种宝箱类型（4 种等概率） */
export const pickTreasureType = (): TreasureType =>
    TREASURE_TYPES[Math.floor(Math.random() * TREASURE_TYPES.length)];

export type RandomTreasureResult =
    | { kind: 'gold'; amount: number }
    | { kind: 'card'; cardKey: string; equipId?: string }
    | { kind: 'enhancement'; enhancementId: string }
    | { kind: 'maxHp'; amount: number }
    | { kind: 'revive'; amount: number }
    | { kind: 'refresh'; amount: number };

// 随机宝箱池：金30% / 卡25% / 强化20% / 生命+5 10% / 复活+1 7.5% / 刷新+1 7.5%
const RANDOM_TREASURE_POOL: { kind: RandomTreasureResult['kind']; weight: number }[] = [
    { kind: 'gold', weight: 30 },
    { kind: 'card', weight: 25 },
    { kind: 'enhancement', weight: 20 },
    { kind: 'maxHp', weight: 10 },
    { kind: 'revive', weight: 7.5 },
    { kind: 'refresh', weight: 7.5 },
];

/** 按权重抽一种随机宝箱奖励并生成内容 */
export const pickRandomTreasure = (): RandomTreasureResult => {
    const total = RANDOM_TREASURE_POOL.reduce((s, x) => s + x.weight, 0);
    let r = Math.random() * total;
    let kind: RandomTreasureResult['kind'] = 'gold';
    for (const item of RANDOM_TREASURE_POOL) {
        r -= item.weight;
        if (r <= 0) { kind = item.kind; break; }
    }

    switch (kind) {
        case 'gold':
            return { kind: 'gold', amount: GOLD_TREASURE_AMOUNT };
        case 'card': {
            const offer = generateCardOffers(1)[0];
            return { kind: 'card', cardKey: offer.cardKey, equipId: offer.equipId };
        }
        case 'enhancement': {
            const enh = pickRandomEnhancements(1)[0];
            return enh ? { kind: 'enhancement', enhancementId: enh.id } : { kind: 'gold', amount: GOLD_TREASURE_AMOUNT };
        }
        case 'maxHp':
            return { kind: 'maxHp', amount: MAX_HP_TREASURE_AMOUNT };
        case 'revive':
            return { kind: 'revive', amount: 1 };
        case 'refresh':
            return { kind: 'refresh', amount: 1 };
    }
};
