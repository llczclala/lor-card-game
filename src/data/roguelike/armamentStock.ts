// ==========================================
// 悖论迷宫 · 武装库存（数量模型）
// [2026-09-07 程拍板] 武装从「拥有集合(0/1)」升级为「真数量库存」：
//   普通武装同种最多囤 MAX_ARMAMENT_STOCK(3) 份；消耗品武装（碳原子板/重修申请）不设上限（送6就能用6次）。
//   同一天启者三个槽可各放 1 个相同武装（库存充足时）；装备占用库存，消耗品发挥后库存 -1。
//   存档字段：settings.armamentStock（权威）；旧 settings.ownedArmaments 保留为种类名 legacy，readArmStock 兼容合并。
// ==========================================
import { getEquipmentById } from '../equipment';

export const MAX_ARMAMENT_STOCK = 3; // 普通武装同种库存上限（可同时装进 3 个槽）；消耗品不限

export type ArmStockMap = Record<string, number>;

/** [2026-09-07] 是否消耗品武装 */
export const isConsumableArmament = (id: string): boolean => !!getEquipmentById(id)?.consumable;

/** [2026-09-07] 该武装单种库存上限（普通 3 / 消耗品不限） */
export const stockLimitOf = (id: string): number => (isConsumableArmament(id) ? Number.POSITIVE_INFINITY : MAX_ARMAMENT_STOCK);

/** 合并读取库存：优先 armamentStock；兼容旧 ownedArmaments（去重集合，每 id=1） */
export const readArmStock = (s?: { ownedArmaments?: string[]; armamentStock?: ArmStockMap } | null): ArmStockMap => {
    const out: ArmStockMap = {};
    for (const id of s?.ownedArmaments ?? []) out[id] = 1;
    for (const [id, n] of Object.entries(s?.armamentStock ?? {})) {
        if ((n ?? 0) > 0) out[id] = Math.max(out[id] ?? 0, n);
    }
    return out;
};

/** 加库存（普通封顶 MAX_ARMAMENT_STOCK；消耗品不限）。返回新 map */
export const addArmStock = (stock: ArmStockMap, id: string, amount = 1): ArmStockMap => {
    const cap = stockLimitOf(id);
    const next = { ...stock, [id]: Math.min(cap, (stock[id] ?? 0) + amount) };
    return next;
};

/** 扣库存（不足返回 null = 无法扣，调用方跳过消耗）。返回新 map */
export const consumeArmStock = (stock: ArmStockMap, id: string, amount = 1): ArmStockMap | null => {
    const cur = stock[id] ?? 0;
    if (cur < amount) return null;
    const next = { ...stock };
    if (cur - amount <= 0) delete next[id]; else next[id] = cur - amount;
    return next;
};
