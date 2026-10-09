// ==========================================
// 悖论迷宫 · 武装库存（数量模型）
// [2026-09-07 程拍板] 武装从「拥有集合(0/1)」升级为「真数量库存」：
//   普通武装同种最多囤 MAX_ARMAMENT_STOCK(3) 份；消耗品武装（碳原子板/重修申请）不设上限（送6就能用6次）。
//   装备占用库存，消耗品发挥后库存 -1。
//   存档字段：settings.armamentStock（权威）；旧 settings.ownedArmaments 保留为种类名 legacy，readArmStock 兼容合并。
// [2026-09-25 莉莉子 武装不叠加] 上限 3 份的语义收窄为「可跨天启者各带 1 份」：
//   同一天启者内已不允许重复武装（3 槽同名只有 1 份生效），多装纯属浪费库存 → UI 层 stockOf 直接置 0 拦截。
// ==========================================
import { getEquipmentById, type EquipmentRarity } from '../equipment';

export const MAX_ARMAMENT_STOCK = 3; // 普通武装同种库存上限（可同时装进 3 个槽）；消耗品不限

// ==========================================
// [2026-10-04 程拍板 ②] **武装溢出 → 数据金**
//
// 病根：本文件原先只做 `Math.min(cap, ...)` 封顶，**既不报错也不转化**
//   ⇒ 库存已满时开武装匣 = **包白开**（玩家什么也拿不到）。
//   一旦通行证 31+ 每 5 级一个卡包长期产包，这个"空包"迟早出现。
//
// 额度锚定：**直接取装备市场价六档**（`shop.ts` `getEquipmentPrice`：50/80/120/180/250/330）。
//   [2026-10-04 程拍板] 初版曾按"市场价 × 2"（100~660），程认为"多了一点，砍半" ⇒ 现值 = **市场价本身**。
//   ⇒ 口径因此更好解释：**「这件在迷宫里值多少，折算就给你多少数据金」**。
// ⚠️ **可调常量**（手册速查表有登记）；调了只需改这一处。
// ⚠️ 只在**抽到已满**时使用；消耗品武装不封顶 ⇒ 永不溢出。
// ==========================================
export const ARMAMENT_OVERFLOW_DATA_GOLD: Record<EquipmentRarity, number> = {
    common: 50,
    uncommon: 80,
    rare: 120,
    epic: 180,
    legendary: 250,
    mythic: 330,
};

/** 该品质武装溢出时折算的数据金（未知品质按白档兜底） */
export const getArmamentOverflowDataGold = (rarity?: EquipmentRarity): number =>
    ARMAMENT_OVERFLOW_DATA_GOLD[rarity ?? 'common'] ?? ARMAMENT_OVERFLOW_DATA_GOLD.common;

export type ArmStockMap = Record<string, number>;

/** 该武装**还有库存余量**吗（消耗品上限 = 无限 ⇒ 恒 true） */
export const hasArmamentRoom = (stock: ArmStockMap, id: string): boolean =>
    (stock[id] ?? 0) < stockLimitOf(id);

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
