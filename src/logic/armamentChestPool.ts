// ==========================================
// 悖论迷宫 · 武装匣产出池（[2026-10-02 莉莉子]）
//
// 为什么单独一个文件：
//   「开匣详情弹窗」要告诉玩家**可能开出什么**，而「实际开匣」要真的抽。
//   这两处若各写一份过滤逻辑，迟早会漂移 ⇒ **UI 承诺 ≠ 实际产出**（玩家眼中的"假详情"）。
//   ⇒ 抽与预览**共用本函数**，只此一处定义。
//
// 口径（对齐 useUserSystem.openChest 的既有行为，未改变数值）：
//   · 只取 `isArmament` 且**非消耗品**（碳原子板 / 重修申请不参与随机池）
//   · 优先**同品质**；该品质池为空时回退全池（防某个品质没货）
// ==========================================
import { getArmamentDefs, type EquipmentDef, type EquipmentRarity } from '../data/equipment';
import { hasArmamentRoom, type ArmStockMap } from '../data/roguelike/armamentStock';

/** 某品质武装匣的**产出池**（同品质为空 → 回退全部非消耗武装） */
export const getArmamentChestPool = (rarity: EquipmentRarity): EquipmentDef[] => {
    const all = getArmamentDefs().filter(a => !a.consumable);
    const sameRarity = all.filter(a => a.rarity === rarity);
    return sameRarity.length ? sameRarity : all;
};

/**
 * [2026-10-04 程拍板 ②] **抽一件武装 —— 抽与预览共用本函数**（延续本文件"只此一处"的口径）。
 *
 * 语义（相对 `getArmamentChestPool` 增加"库存"这一维）：
 *   · **优先在"还有库存余量"的候选里抽** ⇒ 不会抽到已满的（否则开匣 = 空包）
 *   · 该品质**全部满库存** ⇒ 返回 `overflow: true` + 一件用于定价的样本，
 *     由调用方（useUserSystem）**折算成数据金**发给玩家（`getArmamentOverflowDataGold`）
 *   · 消耗品不封顶 ⇒ `hasArmamentRoom` 恒 true ⇒ 永远走正常路径
 *
 * ⚠️ 预览与实际必须都调它，否则又是"UI 承诺 ≠ 实际产出"。
 */
export const pickArmamentFromChest = (
    rarity: EquipmentRarity,
    stock: ArmStockMap,
): { def: EquipmentDef; overflow: boolean } => {
    const pool = getArmamentChestPool(rarity);
    const withRoom = pool.filter(a => hasArmamentRoom(stock, a.id));
    if (withRoom.length) {
        return { def: withRoom[Math.floor(Math.random() * withRoom.length)], overflow: false };
    }
    // 全满：给一件**同品质样本**用于定价（池必非空；极端情况下再回退全池）
    const fallback = pool.length ? pool : getArmamentDefs().filter(a => !a.consumable);
    return { def: fallback[Math.floor(Math.random() * fallback.length)], overflow: true };
};
