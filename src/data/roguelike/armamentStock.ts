// ==========================================
// 悖论迷宫 · 武装库存（数量模型）
// [2026-09-07 程拍板] 武装从「拥有集合(0/1)」升级为「真数量库存」：
//   普通武装同种最多囤 MAX_ARMAMENT_STOCK 份（初版为 3，**2026-10-19 已收窄为 1**，见下）；消耗品武装（碳原子板/重修申请）不设上限（送6就能用6次）。
//   装备占用库存，消耗品发挥后库存 -1。
//   存档字段：settings.armamentStock（权威）；旧 settings.ownedArmaments 保留为种类名 legacy，readArmStock 兼容合并。
// [2026-09-25 莉莉子 武装不叠加] 上限 3 份的语义收窄为「可跨天启者各带 1 份」：
//   同一天启者内已不允许重复武装（3 槽同名只有 1 份生效），多装纯属浪费库存 → UI 层 stockOf 直接置 0 拦截。
// 🔴 [2026-10-19 程拍板 · 独立武装库] 上限 3 → **1**：
//   ① 每件普通武装只需持有 **1 份**，不再囤份；抽到重复件改发**匣券**（2026-10-20 起，见 `armamentVoucher.ts`），不会白开；
//   ② 占用口径改为**按天启者独立** —— 每位天启者各能装 1 件同一武装，互不挤占
//      （落点：`RogueHeroInfoModal.tsx` 的 `stockOf`，原先统计「全英雄已占槽数」的写法已移除）；
//   ③ ⚠️ 消耗品武装（碳原子板 / 重修申请）**不设上限、按次消耗** 的口径**不变**。
// ==========================================
import { getEquipmentById } from '../equipment'; // [2026-10-20] 移除 EquipmentRarity：溢出折算表已删除（改由 armamentVoucher 发匣券）

export const MAX_ARMAMENT_STOCK = 1; // 普通武装同种库存上限（1 份即可被每位天启者各装 1 次）；消耗品不限

export type ArmStockMap = Record<string, number>;

/** 该武装**还有库存余量**吗（消耗品上限 = 无限 ⇒ 恒 true） */
export const hasArmamentRoom = (stock: ArmStockMap, id: string): boolean =>
    (stock[id] ?? 0) < stockLimitOf(id);

/** [2026-09-07] 是否消耗品武装 */
export const isConsumableArmament = (id: string): boolean => !!getEquipmentById(id)?.consumable;

/** [2026-09-07] 该武装单种库存上限（普通 1 / 消耗品不限） */
export const stockLimitOf = (id: string): number => (isConsumableArmament(id) ? Number.POSITIVE_INFINITY : MAX_ARMAMENT_STOCK);

/** 合并读取库存：优先 armamentStock；兼容旧 ownedArmaments（去重集合，每 id=1） */
export const readArmStock = (s?: { ownedArmaments?: string[]; armamentStock?: ArmStockMap } | null): ArmStockMap => {
    const out: ArmStockMap = {};
    for (const id of s?.ownedArmaments ?? []) out[id] = 1;
    for (const [id, n] of Object.entries(s?.armamentStock ?? {})) {
        if ((n ?? 0) > 0) out[id] = Math.max(out[id] ?? 0, n);
    }
    // [2026-10-19 独立武装库] 读取即按**当前上限**收口（普通 1 份）：
    //   旧存档里囤的 2~3 份在新口径下已无意义（每件只需 1 份、各英雄独立），
    //   继续显示 ×3 只会让玩家以为还能多装 ⇒ 读取时统一裁剪（消耗品上限无限，不受影响）。
    for (const id of Object.keys(out)) out[id] = Math.min(out[id], stockLimitOf(id));
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
