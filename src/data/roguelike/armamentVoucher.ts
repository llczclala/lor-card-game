// ==========================================
// 悖论迷宫 · 匣券（2026-10-20 程拍板）
//
// ── 为什么要它 ──
// 武装库存改成「每件 1 份」后（armamentStock.MAX_ARMAMENT_STOCK = 1），"抽到重复"成了常态。
// 原先重复折算成**数据金**，但数据金买不到武装（商店只卖局内装备）
// ⇒ 对"想收集武装"的玩家等于**死钱**，玩家反馈"太简单粗暴"。
// 匣券把"用不掉的货币"换成"真正推进收集的进度"：重复 → 券 → 攒出高级武装匣。
//
// ── 口径（程拍板 2026-10-20 晚）──
// · **任何品质的重复都给券（含红档）**；券是**通用**的，可换任意档武装匣。
//   （曾考虑"按品质隔离"，被否：金片只能来自紫重复 ⇒ 金匣要 170 匣，比硬抽还慢，等于惩罚玩家）
// · **首次兑换优惠** = min(匣价一半, 80 券)。低档就是"减半"，**红档只减 80**（33%）。
//   为什么红档不一刀切减半：红匣 240 → 半价 120 会让首个红匣跌到 49 匣（低于现状 50），
//   减 80 → 首兑 160 ⇒ 首个红匣 53 匣，守住"红武不贬值"。
// · **反套利**：券有地板价 1 券 = 10 数据金。原先"重复折算数据金"的六档表（50/80/…/330）
//   已随匣券上线**删除**，但它作为**定价锚**继续有效：任一新档定价必须满足
//   「匣价 × 10 > 该档原溢出金」，否则"换匣 → 开出重复 → 退金"就成了套利路径。
// · 红档重复产券时，自循环（券→红匣→红重复→券）必须**净亏**：
//   安全线 = v_R < 该档首兑价。红 33 ≪ 160，余量巨大。
//
// ── 数值出处 ──
// `技术手册/_草案-武装匣碎片/02-数值.md` §9/§9.9 + `05-方案汇总.md` §12
// 20,000 次 MC 验证：首个金匣 ≈ 20 匣、首个红匣 ≈ 53 匣（现状 50）、
// P(200 匣无红) = 0%（现状 1.76%）、稳态 78 金/匣 < 现状 89.4 ⇒ **不灌钱**
//
// 🔧 调参只改本文件（产出 / 售价 / 首兑减免 / 地板价都在这里）
// ==========================================
import type { EquipmentRarity } from '../equipment';

/** 重复 1 件该档武装 → 获得多少匣券（六档全覆盖，含红档） */
export const VOUCHER_YIELD: Record<EquipmentRarity, number> = {
    common: 3,
    uncommon: 5,
    rare: 9,
    epic: 16,
    legendary: 26,
    mythic: 33, // ≈ 现状"红重复给 330 数据金"（1 券 = 10 金），保持值阶梯单调
};

/** 兑换一个该档武装匣所需的券（白档没有可换的下一档 ⇒ 不开放兑换） */
export const VOUCHER_CHEST_COST: Record<EquipmentRarity, number | null> = {
    common: null,
    uncommon: 15,
    rare: 25,
    epic: 40,
    legendary: 60,
    mythic: 240,
};

/** 首次兑换的**减免上限**（券）：低档照常减半，红档被这条卡在 80（见文件头） */
export const VOUCHER_FIRST_DISCOUNT_CAP = 80;

/** 券的地板价：1 券 ≈ 10 数据金。
 *  ⚠️ 当前**无运行时消费**（兑换入口只换匣，不换钱）—— 保留它是因为它编码了上面那条**反套利不变量**，
 *     改定价时要拿它复算；删掉会让"为什么不能套利"这一依据只存在于文档里。 */
export const VOUCHER_TO_GOLD = 10;

/** 可兑换的档位（白档无匣可换） */
export const EXCHANGEABLE_RARITIES: EquipmentRarity[] = ['uncommon', 'rare', 'epic', 'legendary', 'mythic'];

/** 该档重复一件给多少券 */
export const voucherYieldOf = (rarity: EquipmentRarity | undefined): number =>
    VOUCHER_YIELD[rarity ?? 'common'] ?? VOUCHER_YIELD.common;

/** 该档匣的原价（未开业兑换时返回 null） */
export const voucherChestCostOf = (rarity: EquipmentRarity): number | null =>
    VOUCHER_CHEST_COST[rarity] ?? null;

/** 该档首次兑换的减免额 = min(ceil(价/2), 80) */
export const voucherFirstDiscountOf = (rarity: EquipmentRarity): number => {
    const cost = voucherChestCostOf(rarity);
    if (!cost) return 0;
    return Math.min(Math.ceil(cost / 2), VOUCHER_FIRST_DISCOUNT_CAP);
};

/**
 * 该档匣的**实际价格**。
 * @param isFirst 是否**还能享受首次优惠**（= 该档还没兑换过）
 *
 * 🔴 [2026-10-20 莉莉子 BUG修复 · 程实测抓到] 本参数原名 `firstUsed`（是否**已用过**），
 *   语义与调用方的 `isFirst`（是否**首次**）**正好相反** ⇒ 首次兑换反而按原价收、
 *   兑换过一次之后才变便宜（程看到的就是"首次 15、买完降到 7"）。
 *   现改名为 `isFirst` 并倒转判断，让参数名与调用方同语义，杜绝同类错误再来一次。
 */
export const voucherExchangeCostOf = (rarity: EquipmentRarity, isFirst: boolean): number | null => {
    const cost = voucherChestCostOf(rarity);
    if (!cost) return null;
    return isFirst ? Math.max(1, cost - voucherFirstDiscountOf(rarity)) : cost;
};

/** 中文档位名（用于兑换卡片与开匣结果文案） */
export const VOUCHER_RARITY_LABEL: Record<EquipmentRarity, string> = {
    common: '白色',
    uncommon: '绿色',
    rare: '蓝色',
    epic: '紫色',
    legendary: '金色',
    mythic: '神话',
};

/** 从旧存档读券（缺失/非法 → 0） */
export const readVoucher = (s?: { armamentVoucher?: number } | null): number => {
    const n = s?.armamentVoucher;
    return typeof n === 'number' && Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
};

/** 旧存档读"已用首兑的档位"（缺失 → 空） */
export const readVoucherFirstUsed = (s?: { voucherFirstUsed?: string[] } | null): EquipmentRarity[] =>
    Array.isArray(s?.voucherFirstUsed) ? (s!.voucherFirstUsed as EquipmentRarity[]) : [];

/** 兑换结果（`useUserSystem.exchangeVoucherChest` 的返回，UI 直接按 `ok`/`reason` 分支） */
export interface VoucherExchangeResult {
    ok: boolean;
    /** 失败原因：no-chest=该档不开兑换 / insufficient=券不够 / invalid=参数非法 */
    reason?: 'no-chest' | 'insufficient' | 'invalid';
    rarity?: EquipmentRarity;
    /** 本次实际花掉的券 */
    spent?: number;
    /** 是否用掉了首次优惠 */
    usedFirstDiscount?: boolean;
    /** 兑换后余额（失败时为当前余额） */
    balance?: number;
}
