// ==========================================
// 悖论迷宫 · 商店与经济（数据层）
// [2026-08-12 莉莉子] 参考 LOR 英雄之路商店（见 技术手册/参考-LOR商店经济.md）：
//   - 买带装备的卡 / 买迷宫强化 / 买装备挂英雄卡 / 删卡 + 刷新
//   - 定价：卡按「是否英雄」分档 + 装备按稀有度加价（我们卡无稀有度字段，简化 LOR 双维度）
// 商品生成含稀有度权重（run.rarityBonus 联动英雄等级加成）。
// ==========================================
import { CARD_DB } from '../cards';
import { getEquipmentOnlyDefs, getEquipmentById, getEquipPoolForCard, type EquipmentRarity } from '../equipment';
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
    // [2026-08-27] 六档卡价加成：白25 / 绿40 / 蓝80 / 紫120 / 金180 / 红250
    const add = equip.rarity === 'common' ? 25
        : equip.rarity === 'uncommon' ? 40
        : equip.rarity === 'rare' ? 80
        : equip.rarity === 'epic' ? 120
        : equip.rarity === 'legendary' ? 180 : 250;
    return base + add;
};

// [2026-08-27] 六档强化价格：白70 / 绿100 / 蓝150 / 紫200 / 金250 / 红320
export const getEnhancementPrice = (rarity: EnhancementRarity): number =>
    rarity === 'common' ? 70 : rarity === 'uncommon' ? 100 : rarity === 'rare' ? 150 : rarity === 'epic' ? 200 : rarity === 'legendary' ? 250 : 320;

// [2026-08-27] 六档装备价格：白50 / 绿80 / 蓝120 / 紫180 / 金250 / 红330
export const getEquipmentPrice = (rarity: EquipmentRarity): number =>
    rarity === 'common' ? 50 : rarity === 'uncommon' ? 80 : rarity === 'rare' ? 120 : rarity === 'epic' ? 180 : rarity === 'legendary' ? 250 : 330;

// ── 商品生成 ──
const collectibleCards = () =>
    Object.values(CARD_DB).filter(c => c.isCollectible !== false && !c.isChampion);

const randomCardKey = (exclude: Set<string>): string => {
    const pool = collectibleCards().filter(c => !exclude.has(c.key));
    return pool.length ? pool[Math.floor(Math.random() * pool.length)].key : 'lyfe';
};

const randomEquipId = (card: { type: string }, excludeIds?: string[]): string | undefined => {
    const pool = getEquipPoolForCard(card, excludeIds); // [2026-08-29] 按卡筛：单位→全装备，法术→纯减费
    return pool.length ? pool[Math.floor(Math.random() * pool.length)].id : undefined;
};

/**
 * 生成 count 张不同卡（60% 带随机装备）——商店买卡区 / 卡牌宝箱共用。
 * [2026-08-29] 法术卡只配纯减费装备（getEquipPoolForCard 过滤），杜绝数值/关键词等无效装备。
 * [2026-09-25 莉莉子 装备不叠加] 传 equippedCards 后，候选卡不再佩戴"这张卡已经挂着"的装备：
 *   装备按卡 key 生效（新副本本来就继承那件），再发一件同样的只是白加价。
 */
export const generateCardOffers = (count: number, equippedCards?: Record<string, string[]>): ShopCardItem[] => {
    const cards: ShopCardItem[] = [];
    const used = new Set<string>();
    for (let i = 0; i < count; i++) {
        const key = randomCardKey(used);
        used.add(key);
        const withEquip = Math.random() < 0.6;
        const equipId = withEquip ? randomEquipId(CARD_DB[key], equippedCards?.[key]) : undefined;
        cards.push({ cardKey: key, equipId, price: getCardPrice(key, equipId) });
    }
    return cards;
};

/** [2026-09-25 莉莉子 不叠加] 商店生成上下文：本局卡→装备映射 + 已拥有强化（两者都用于"不发无效商品"） */
export interface ShopStockContext {
    equippedCards?: Record<string, string[]>;
    ownedEnhancements?: string[];
}

/**
 * 生成一商店的商品：3 张卡（60% 带随机装备）+ 1 个迷宫强化 + 2 个装备。
 * @param rarityBonus 英雄等级的稀有度加成（影响强化/装备抽选权重）
 */
export const generateShopStock = (rarityBonus?: RarityBonusInput, unlockedPass?: string[], ctx?: ShopStockContext): ShopStock => {
    const cards = generateCardOffers(3, ctx?.equippedCards);

    // 买迷宫强化：从玩家强化池抽 1 个（含稀有度权重；[2026-08-29 通行证] 已解锁通行证强化也入池）
    // [2026-09-25 莉莉子 强化不叠加] 排除本局已拥有 → 池空则不卖强化（enhancement = null）
    const enh = pickRandomEnhancements(1, undefined, rarityBonus, unlockedPass, ctx?.ownedEnhancements)[0];
    const enhancement: ShopEnhancementItem | null = enh
        ? { enhancementId: enh.id, price: getEnhancementPrice(enh.rarity) }
        : null;

    // 买装备：抽 2 个不同装备（按稀有度权重，简化：均匀抽 + 去重）
    // [2026-09-28 莉莉子 商店漏武装修复] 池改为 getEquipmentOnlyDefs()（非武装装备）：
    //   原实现直接遍历 EQUIPMENT_DEFS 全库 → 武装（全库 78 件里 27 件，含碳原子板 / 重修申请两个消耗品）被当普通装备上架（单格约 35% 概率）。
    //   而且买到的武装只挂在英雄卡上当图标（runBonus 只认开局快照 run.armaments）＝ 纯白扣金币，属付费陷阱。
    // [2026-09-28 莉莉子 法术专属装备 · 类型闸] scope 传 'unit'：本页签的目标是**天启者**，
    //   而 handleRogueBuyEquipment 不做类型校验 —— 若把 spellOnly（仅法术可挂）混进来，就会被挂到单位身上，
    //   正是"武装混进商店"那类漏洞的翻版。（法术卡带装备走**买卡区**：generateCardOffers 已按卡筛池。）
    const equipPool = getEquipmentOnlyDefs('unit');
    const equipments: ShopEquipmentItem[] = [];
    const usedEquip = new Set<string>();
    for (let i = 0; i < 2 && i < equipPool.length; i++) {
        let e = equipPool[Math.floor(Math.random() * equipPool.length)];
        let guard = 0;
        while (usedEquip.has(e.id) && guard++ < 20) {
            e = equipPool[Math.floor(Math.random() * equipPool.length)];
        }
        usedEquip.add(e.id);
        equipments.push({ equipmentId: e.id, price: getEquipmentPrice(e.rarity) });
    }

    return { cards, enhancement, equipments };
};

// ── [2026-09-28 莉莉子 防回归守卫] 商店商品自检（仅 DEV）──
//   背景：09-28 修掉"商店装备区直接遍历 EQUIPMENT_DEFS 全库 ⇒ 武装（含碳原子板这类消耗品）上架"，
//   但随后仍收到"玩家又遇到碳原子板"的反馈（经查是**旧包**：09-27 打的 dist/release，早于修复一天）。
//   这里补一道**运行时自检**：将来任何改动若又让武装混进商店，开发期立刻报错，不必等玩家反馈。
if (import.meta.env?.DEV) {
    try {
        const probe = generateShopStock();
        const bad = probe.equipments.filter(it => getEquipmentById(it.equipmentId)?.isArmament);
        if (bad.length > 0) {
            console.error(`[shop] 商店装备区出现武装（禁止）：${bad.map(b => `${b.equipmentId}/${getEquipmentById(b.equipmentId)?.name}`).join('、')}`);
        }
    } catch (e) {
        console.warn('[shop] 商品自检跳过（generateShopStock 探测失败）', e);
    }
}
