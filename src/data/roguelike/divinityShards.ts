// ==========================================
// 悖论迷宫 · 神格碎片 + 奖励匣（数据层 · 唯一真源）
// [2026-09-29 程拍板] 取代原「悖论点」设计。
//
// ── 神格碎片（两条轨）──
//   · 专属碎片：每名天启者各一种（里芙的神格碎片 / 芬妮的神格碎片…），**只能点自己**的神格神经
//   · 万能碎片：通用，**可全额替代**专属碎片（程拍板：专属只需 ≥0）
//   · 点亮消耗：10 / 20 / 30 / 40 / 40 / 60 = 满级 200 片
//   · 花费优先级：**先花专属、再用万能补足**
//   · 溢出：每英雄专属碎片**200 片封顶**（= 点满总量），超出的 1:1 自动转万能
//
// ── 奖励匣（两大类 × 六档品质）──
//   · 武装匣（armament）：开出**对应品质**的武装
//   · 神格碎片匣（shard） ：开出**对应数量**的神格碎片；碎片**每 5 片为一组**，
//                            每组随机归属某位天启者（例：开 20 片 → 4 组 → 里芙5/芬妮5/卜卜10）
//   · ⚠️ 万能碎片**不能**从碎片匣开出（唯一来源：每日任务固定产出 + 溢出转化）
//
// ── 匣子取代原各位置奖励（含开包）──
//   开包流程改为：**先抽到匣子 → 再打开匣子**得到对应道具
// ==========================================
import type { RogueDifficulty } from './difficulties'; // [2026-10-03] 整局结算按难度分档

// ═══════════════════════════════════════════════
// 一、神格碎片
// ═══════════════════════════════════════════════

/** 神格神经节点数（＝卡面星槽数） */
export const MAX_DIVINITY_LEVEL = 6;

/** [2026-09-29 程拍板] 各槽位点亮所需神格碎片（专属/万能皆可，可组合） */
export const DIVINITY_SHARD_COST: Record<number, number> = {
    1: 10, 2: 20, 3: 30, 4: 40, 5: 40, 6: 60,
};

/** 单英雄点满所需总碎片（溢出封顶线） */
export const DIVINITY_TOTAL_COST: number = Object.values(DIVINITY_SHARD_COST)
    .reduce((s, n) => s + n, 0); // = 200

/** 每英雄专属碎片的持有上限（超出部分 1:1 转万能） */
export const HERO_SHARD_CAP = DIVINITY_TOTAL_COST; // 200

/** 碎片匣内「每多少片为一组」随机归属一位天启者 */
export const SHARD_GROUP_SIZE = 5;

/** 碎片钱包（落 localStorage，跨局累积） */
export interface ShardWallet {
    /** 万能碎片 */
    universal: number;
    /** 每英雄的专属碎片（heroKey → 片数，0~200） */
    hero: Record<string, number>;
}

export const EMPTY_WALLET: ShardWallet = { universal: 0, hero: {} };

/** 读某英雄专属碎片数 */
export const getHeroShards = (w: ShardWallet | undefined, heroKey: string): number =>
    w?.hero?.[heroKey] ?? 0;

/** 读万能碎片数 */
export const getUniversalShards = (w: ShardWallet | undefined): number =>
    w?.universal ?? 0;

/**
 * 某节点可用「专属 + 万能」组合点亮时的花费明细。
 * 规则（程拍板）：先花专属（最多花到 cost），不足部分用万能补足；万能可全额替代。
 *   → 专属花费 = min(持有专属, cost)；万能花费 = cost − 专属花费
 */
export interface ShardSpendPlan {
    heroSpend: number;   // 将消耗的专属碎片
    universalSpend: number; // 将消耗的万能碎片
    total: number;       // = 节点单价
    affordable: boolean; // 专属 + 万能 >= total
}

export const planShardSpend = (
    w: ShardWallet | undefined,
    heroKey: string,
    cost: number,
): ShardSpendPlan => {
    const h = getHeroShards(w, heroKey);
    const u = getUniversalShards(w);
    const heroSpend = Math.min(h, cost);
    const universalSpend = Math.max(0, cost - heroSpend);
    return { heroSpend, universalSpend, total: cost, affordable: h + u >= cost };
};

/**
 * 扣除一次点亮的花费（返回新钱包；余额不足则原样返回）。
 * ⚠️ 调用方需先用 planShardSpend 判定 affordable。
 */
export const spendShards = (
    w: ShardWallet | undefined,
    heroKey: string,
    plan: ShardSpendPlan,
): ShardWallet => {
    const base = w ?? EMPTY_WALLET;
    const h = getHeroShards(base, heroKey);
    const u = getUniversalShards(base);
    if (h + u < plan.total) return base; // 防越界
    return {
        universal: u - plan.universalSpend,
        hero: { ...base.hero, [heroKey]: h - plan.heroSpend },
    };
};

/**
 * 发放某英雄专属碎片（含**封顶溢出转万能**）。
 * @returns 实际入账的明细（供 UI 提示"溢出转化"）
 */
export interface ShardGrantResult {
    wallet: ShardWallet;
    /** 实际计入该英雄的片数 */
    credited: number;
    /** 因封顶而转化为万能的片数（1:1） */
    overflowToUniversal: number;
}

/**
 * 发放某英雄专属碎片。
 *
 * 🔴 [2026-10-04 莉莉子 BUG修复 · 溢出判据]
 *   封顶判据 = **该英雄是否已练满（六格神格神经全解锁）**，由 `isMaxed` 传入；
 *   已满 ⇒ `room = 0` ⇒ 本次碎片**全额 1:1 转万能**。
 *
 * ── 为什么不能只看"持有数 ≥ 200"（旧实现 · 粉丝报的 BUG）：
 *   点亮神经会**花掉**专属碎片（`spendShards` 把 hero[heroKey] 减掉，见 `:100-103`）
 *   ⇒ **练满那一刻持有数通常已经归 0** ⇒ 旧判据算出 `room = 200 − 0 = 200`
 *   ⇒ 之后再获得她的碎片会**一路重新堆进专属**，堆满 200 才肯转万能
 *   ⇒ **越练满越不转化**，与设计意图「某英雄练满后，再抽到他的碎片不浪费」**正好相反**；
 *      而练满后堆起来的那 200 片**没有任何消费出口**（六格已全亮）= 永久死币。
 *
 * ⚠️ 为什么必须从外面传：本文件是**纯数据层**，手里只有钱包、
 *    看不到解锁表 `unlocked`（那在 `useHeroDivinity` 里）⇒ 判据只能由调用方给定。
 * ⚠️ 兼容：默认 `false` ⇒ 未传的调用方行为与改动前逐字一致。
 */
export const grantHeroShards = (
    w: ShardWallet | undefined,
    heroKey: string,
    amount: number,
    /** 该英雄六格是否已全部解锁（练满）。已满 ⇒ 本次碎片全额转万能 */
    isMaxed: boolean = false,
): ShardGrantResult => {
    const base = w ?? EMPTY_WALLET;
    const have = getHeroShards(base, heroKey);
    // [2026-10-04] 已练满 ⇒ 专属不再吸收任何碎片（room = 0），全部溢出为万能
    const room = isMaxed ? 0 : Math.max(0, HERO_SHARD_CAP - have);
    const credited = Math.min(amount, room);
    const overflow = Math.max(0, amount - credited);
    return {
        wallet: {
            universal: getUniversalShards(base) + overflow,
            hero: { ...base.hero, [heroKey]: have + credited },
        },
        credited,
        overflowToUniversal: overflow,
    };
};

/** 发放万能碎片 */
export const grantUniversalShards = (w: ShardWallet | undefined, amount: number): ShardWallet => {
    const base = w ?? EMPTY_WALLET;
    return { ...base, universal: getUniversalShards(base) + amount };
};

/**
 * 批量发放「一组一组随机归属」的神格碎片（碎片匣开箱用）。
 * 每 SHARD_GROUP_SIZE 片为一组，每组独立随机选一位天启者；
 * 若总数不是 5 的倍数，余数并入最后一组（仍归属同一英雄），保证总片数精确。
 *
 * @param heroKeys 可归属的天启者 key 列表（= 已实装神格神经的英雄）
 * @param total    本次开出的碎片总片数
 * @param isMaxed  [2026-10-04 莉莉子] 该英雄是否已练满 —— **必须由调用方传入真源判据**。
 *   ⚠️ 若沿用默认（恒 false），本函数算出的 `details[].overflow` 会与真实入账不符：
 *      历史上调用方传的是 `undefined` 钱包 + 无判据 ⇒ 一律按"空钱包 + 没练满"算
 *      ⇒ **overflow 恒为 0** ⇒ 界面永远不显示「溢出 +N 万能」，而钱包其实转了。
 * @returns 新钱包 + 按英雄汇总的明细 + 溢出转万能总量
 */
export interface ShardDropDetail {
    heroKey: string;
    amount: number;
    /** 其中因封顶转万能的片数 */
    overflow: number;
}
export interface ShardDropResult {
    /**
     * ⚠️ [2026-10-04 莉莉子] **仅供展示的快照**，语义 = 「传入的 `w` + 本次分配」。
     *
     * ❌ **绝不要拿它整体覆盖真源钱包** —— 那正是 2026-10-02「开碎片匣吞掉未消耗碎片」的坏味道：
     *    调用方一旦传 `undefined`，它只是"**从空钱包起算**"的结果，覆盖上去就把玩家已有碎片清零。
     * ✅ 真实入账一律走 `useHeroDivinity.applyShardDrop` —— 它以**真源钱包**为基准、按 `details` 逐笔重算，
     *    与调用方传什么无关（本条注释是第三次审查点名提醒后补上的）。
     */
    wallet: ShardWallet;
    details: ShardDropDetail[];
    /** 溢出（转万能）总量。⚠️ 当前**无人消费**（入账侧只读 `details`）—— 留作展示口径，勿据此落盘 */
    totalOverflow: number;
}

export const dropShards = (
    w: ShardWallet | undefined,
    heroKeys: string[],
    total: number,
    rand: () => number = Math.random,
    /** [2026-10-04 莉莉子] 该英雄是否已练满（与入账侧同源判据）；默认 false = 旧行为 */
    isMaxed: (heroKey: string) => boolean = () => false,
): ShardDropResult => {
    if (heroKeys.length === 0 || total <= 0) {
        return { wallet: w ?? EMPTY_WALLET, details: [], totalOverflow: 0 };
    }
    // 1. 切组：每 5 片一组，余数并入最后一组
    const groups: number[] = [];
    let left = total;
    while (left > 0) {
        const g = Math.min(SHARD_GROUP_SIZE, left);
        groups.push(g);
        left -= g;
    }
    // 2. 每组随机归属
    const perHero = new Map<string, number>();
    for (const g of groups) {
        const key = heroKeys[Math.floor(rand() * heroKeys.length)];
        perHero.set(key, (perHero.get(key) ?? 0) + g);
    }
    // 3. 逐英雄入账（各自算封顶溢出；判据与真实入账侧同源 ⇒ 显示值 = 实际值）
    let wallet = w ?? EMPTY_WALLET;
    const details: ShardDropDetail[] = [];
    let totalOverflow = 0;
    for (const [heroKey, amount] of perHero) {
        const res = grantHeroShards(wallet, heroKey, amount, isMaxed(heroKey));
        wallet = res.wallet;
        details.push({ heroKey, amount, overflow: res.overflowToUniversal });
        totalOverflow += res.overflowToUniversal;
    }
    details.sort((a, b) => b.amount - a.amount); // 多的排前，UI 好读
    return { wallet, details, totalOverflow };
};

// ═══════════════════════════════════════════════
// 二、奖励匣（武装匣 / 神格碎片匣）
// ═══════════════════════════════════════════════

import type { EnhancementRarity } from './buffs'; // 六档品质：common/uncommon/rare/epic/legendary/mythic

/** 匣子大类 */
export type ChestKind = 'armament' | 'shard';

/** 一个待打开的匣子实例（落存档；开箱后移除） */
export interface ChestInstance {
    kind: ChestKind;
    rarity: EnhancementRarity;
}

/**
 * 各品质匣子开出的**神格碎片数**（程拍板档位：白5 / 绿10 / 紫20，其余补齐六档递增）。
 * [参数可调]
 */
export const SHARD_CHEST_AMOUNT: Record<EnhancementRarity, number> = {
    common: 5,
    uncommon: 10,
    rare: 15,
    epic: 20,
    legendary: 35,
    mythic: 50,
};

/** 匣子内部抽品质用的权重（开出的匣子品质分布；白绿为主、高档渐稀） */
export const CHEST_RARITY_WEIGHT: Record<EnhancementRarity, number> = {
    common: 34,
    uncommon: 30,
    rare: 18,
    epic: 10,
    legendary: 6,
    mythic: 2,
};

/** 六档顺序（UI 展示 / 排序用） */
export const CHEST_RARITY_ORDER: EnhancementRarity[] =
    ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'];

/** 按权重随机一个匣子品质 */
export const rollChestRarity = (rand: () => number = Math.random): EnhancementRarity => {
    const total = CHEST_RARITY_ORDER.reduce((s, r) => s + CHEST_RARITY_WEIGHT[r], 0);
    let roll = rand() * total;
    for (const r of CHEST_RARITY_ORDER) {
        roll -= CHEST_RARITY_WEIGHT[r];
        if (roll <= 0) return r;
    }
    return 'common';
};

/** 造一个随机匣子（开包时用） */
export const rollChest = (kind: ChestKind, rand: () => number = Math.random): ChestInstance =>
    ({ kind, rarity: rollChestRarity(rand) });

/** 匣子显示名 */
export const CHEST_KIND_LABEL: Record<ChestKind, string> = {
    armament: '武装匣',
    shard: '神格碎片匣',
};

/** 匣子开出的内容摘要（UI 提示文案用） */
export const describeChestContent = (kind: ChestKind, rarity: EnhancementRarity): string =>
    kind === 'armament'
        ? '开出对应品质的武装'
        : `开出 ${SHARD_CHEST_AMOUNT[rarity]} 片神格碎片`;

// ═══════════════════════════════════════════════
// 三、每日任务固定产出
// ═══════════════════════════════════════════════

/** [2026-09-29 程拍板] 肉鸽每日任务固定产出的万能碎片数 */
export const DAILY_UNIVERSAL_SHARDS = 20;

// ═══════════════════════════════════════════════
// 四、整局结算直发（取代原悖论点）
//   [2026-09-29] 悖论点废弃 → 改发神格碎片（当时是「随机归属的专属碎片」）
//   [2026-10-03 程拍板] 再改为**万能碎片**，并按难度分档
// ═══════════════════════════════════════════════

/**
 * 一局推演结束**直接发放的万能碎片**（片），按难度分档。
 *
 * [2026-10-03 程拍板] 为什么改：
 *   · 原实现 = `RUN_SHARD_WIN 60 / RUN_SHARD_LOSE 15` 的**专属碎片**，
 *     走 `dropShards(undefined, 全体天启者, 60)` ⇒ 每 5 片一组**随机归属**某位天启者
 *     ⇒ 想练的那位**期望只拿到 60/6 = 10 片/局**，而且"随机"不可控、不可定向。
 *   · 改为**万能碎片**（可全额替代专属 ⇒ 能全投给想练的那位），并按难度分档；
 *     **只有通关给，败亡不给**（旧设计的"败亡 15"保底一并取消）。
 *
 * 量级参考：单英雄点满 = 200 片（10/20/30/40/40/60）。
 *   ⇒ 只靠结算点满一位：普通 **40 局** / 机密 **20 局** / 绝密 **≈13.3 局**。
 *   主要来源仍是「碎片匣」（白5…红50，随机专属）+「每日任务：神格汲取 20 万能/天」。
 *
 * [参数可调] 改这三个数即可（⚠️ 改动后需同步 `更新公告` 与
 * `技术手册/设计-神格碎片与奖励匣.md`）。
 */
export const RUN_SETTLE_UNIVERSAL: Record<RogueDifficulty, number> = {
    normal: 5,
    secret: 10,
    topsecret: 15,
};

/**
 * 整局结算的万能碎片数。
 * [2026-10-03 程拍板] **只有通关给，败亡不给**。
 */
export const computeRunShards = (won: boolean, difficulty: RogueDifficulty): number =>
    won ? (RUN_SETTLE_UNIVERSAL[difficulty] ?? 0) : 0;
