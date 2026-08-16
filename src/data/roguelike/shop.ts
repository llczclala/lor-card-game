// ==========================================
// 悖论迷宫 · 商店与经济（数据层）
// [2026-08-12 莉莉子] 参考 LOR 英雄之路商店（见 技术手册/参考-LOR商店经济.md）：
//   - 买带装备的卡 / 买迷宫强化 / 买装备挂英雄卡 / 删卡 + 刷新
//   - 定价：卡按「是否英雄」分档 + 装备按稀有度加价（我们卡无稀有度字段，简化 LOR 双维度）
// 商品生成含稀有度权重（run.rarityBonus 联动英雄等级加成）。
// ==========================================
import { CARD_DB } from '../cards';
import { EQUIPMENT_DEFS, getEquipmentById, type EquipmentRarity } from '../equipment';
import { pickRandomEnhancements, type RarityBonusInput } from './enhancements';
import type { EnhancementRarity } from './buffs';

export interface ShopCardItem {
    cardKey: string;
    equipId?: string; // 带装备的卡（首次购买把装备附加到该卡所有副本）
    price: number;
}
export interface ShopEnhancementItem {
    enhancementId: string;
    price: number;
}
export interface ShopEquipmentItem {
    equipmentId: string;
    price: number;
}
export interface ShopStock {
    cards: ShopCardItem[];
    enhancement: ShopEnhancementItem | null;
    equipments: ShopEquipmentItem[];
}

export const REMOVE_CARD_PRICE = 50; // 删一张牌的价格（可调）

// ── 定价 ──
/** 卡价：裸卡按是否英雄分档（非英雄 40 / 英雄 120）；带装备 + 装备稀有度加价 */
export const getCardPrice = (cardKey: string, equipId?: string): number => {
    const card = CARD_DB[cardKey];
    const base = card?.isChampion ? 120 : 40;
    if (!equipId) return base;
    const equip = getEquipmentById(equipId);
    if (!equip) return base;
    const add = equip.rarity === 'common' ? 40 : equip.rarity === 'rare' ? 80 : equip.rarity === 'epic' ? 120 : 180;
    return base + add;
};

export const getEnhancementPrice = (rarity: EnhancementRarity): number =>
    rarity === 'common' ? 100 : rarity === 'rare' ? 150 : rarity === 'epic' ? 200 : 250;

export const getEquipmentPrice = (rarity: EquipmentRarity): number =>
    rarity === 'common' ? 80 : rarity === 'rare' ? 120 : rarity === 'epic' ? 180 : 250;

// ── 商品生成 ──
const collectibleCards = () =>
    Object.values(CARD_DB).filter(c => c.isCollectible !== false && !c.isChampion);

const randomCardKey = (exclude: Set<string>): string => {
    const pool = collectibleCards().filter(c => !exclude.has(c.key));
    return pool.length ? pool[Math.floor(Math.random() * pool.length)].key : 'lyfe';
};

const randomEquipId = (): string => EQUIPMENT_DEFS[Math.floor(Math.random() * EQUIPMENT_DEFS.length)].id;

/**
 * 生成 count 张不同卡（60% 带随机装备）——商店买卡区 / 卡牌宝箱共用。
 */
export const generateCardOffers = (count: number): ShopCardItem[] => {
    const cards: ShopCardItem[] = [];
    const used = new Set<string>();
    for (let i = 0; i < count; i++) {
        const key = randomCardKey(used);
        used.add(key);
        const withEquip = Math.random() < 0.6;
        const equipId = withEquip ? randomEquipId() : undefined;
        cards.push({ cardKey: key, equipId, price: getCardPrice(key, equipId) });
    }
    return cards;
};

/**
 * 生成一商店的商品：3 张卡（60% 带随机装备）+ 1 个迷宫强化 + 2 个装备。
 * @param rarityBonus 英雄等级的稀有度加成（影响强化/装备抽选权重）
 */
export const generateShopStock = (rarityBonus?: RarityBonusInput): ShopStock => {
    const cards = generateCardOffers(3);

    // 买迷宫强化：从玩家强化池抽 1 个（含稀有度权重）
    const enh = pickRandomEnhancements(1, undefined, rarityBonus)[0];
    const enhancement: ShopEnhancementItem | null = enh
        ? { enhancementId: enh.id, price: getEnhancementPrice(enh.rarity) }
        : null;

    // 买装备：抽 2 个不同装备（按稀有度权重，简化：均匀抽 + 去重）
    const equipments: ShopEquipmentItem[] = [];
    const usedEquip = new Set<string>();
    for (let i = 0; i < 2 && i < EQUIPMENT_DEFS.length; i++) {
        let e = EQUIPMENT_DEFS[Math.floor(Math.random() * EQUIPMENT_DEFS.length)];
        let guard = 0;
        while (usedEquip.has(e.id) && guard++ < 20) {
            e = EQUIPMENT_DEFS[Math.floor(Math.random() * EQUIPMENT_DEFS.length)];
        }
        usedEquip.add(e.id);
        equipments.push({ equipmentId: e.id, price: getEquipmentPrice(e.rarity) });
    }

    return { cards, enhancement, equipments };
};
