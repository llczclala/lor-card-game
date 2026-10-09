// ==========================================
// 悖论迷宫 · 神格神经（持久化 store · 神格碎片版）
// [2026-09-28 莉莉子] 沿用 useHeroProgression 的**模块级共享 store** 模式：
//   所有实例共享同一份数据，任一实例改动 → 全局广播 → 星槽 / 神经图 / 卡片网格实时刷新。
//
// [2026-09-29 程拍板] **悖论点货币整体废弃** → 改为**神格碎片**：
//   · 专属碎片：每名天启者各一种，只能点自己的神格神经
//   · 万能碎片：通用，**可全额替代**专属碎片
//   · 花费优先级：先花专属、再用万能补足
//   · 每英雄专属 **200 片封顶**，超出 1:1 自动转万能
//
// 存档内容（每用户一份）：
//   · unlocked: { [heroKey]: string[] }  —— 已解锁的神格神经节点 id
//   · wallet:   ShardWallet              —— 神格碎片钱包（跨局累积）
// ==========================================
import { useCallback, useEffect, useState } from 'react';
import { StorageUtils, STORAGE_KEYS } from '../utils/storageUtils';
import { eventBus, GameEvents } from '../utils/eventBus'; // [2026-09-29] 万能碎片广播（解耦 useUserSystem）
import {
    DIVINITY_NODES,
    getDivinityNodes,
    getNodeCost,
    isNodeAvailable,
    isNodeUnlocked,
    setDivinityUnlockedSnapshot,
    type DivinityNode,
} from '../data/roguelike/heroDivinity';
import {
    EMPTY_WALLET,
    getHeroShards,
    getUniversalShards,
    grantHeroShards,
    grantUniversalShards,
    planShardSpend,
    spendShards,
    type ShardDropResult,
    type ShardSpendPlan,
    type ShardWallet,
} from '../data/roguelike/divinityShards';

export interface DivinitySave {
    unlocked: Record<string, string[]>;
    /** [2026-09-29] 神格碎片钱包（原 paradoxBank: number 已废弃） */
    wallet: ShardWallet;
    /**
     * [2026-10-04 程拍板] 开发者账号的高额初始碎片**是否已发放**（只发一次）。
     * ⚠️ 为什么用显式标记而不是"钱包为空"：开发者存档里很可能**已经有碎片**（开匣/任务发过），
     *    用"空则补种"会直接跳过 ⇒ 改造后他反而只剩那点碎片，比改之前更难测。
     */
    devSeeded?: boolean;
}

/**
 * [2026-10-04 程拍板] 开发者账号（dev_full_admin）的碎片改为 **「高额初始值」**、**不再锁死数量**
 *   —— 对齐「通用银」的做法（`initialUserData` 首轮给 500000，之后**正常扣**）。
 *
 * ── 旧做法（已废弃）与它的代价：
 *   `isDevAccount()` 时**读取恒返 9999 + 激活节点不扣** ⇒ 数量被**写死**：
 *   于是**测不出**"碎片不足"、扣费、200 片封顶、溢出转万能 —— 而这几条恰恰是碎片体系的核心链路。
 *
 * ── 新做法：
 *   首轮（钱包为空时）**一次性**种入 `DEV_SHARD_SEED`（每个神格英雄专属 + 万能各 9999），
 *   之后一切走**真实逻辑**：能扣、能攒、能封顶溢出、能看到余额不足。
 *
 * ⚠️ 「只给一次」的判据 = **钱包完全为空**，而不是"低于阈值就补足"：
 *   后者会让花掉的碎片在每次刷新后被补回来 ⇒ 又退化成锁死。
 *   而花光后各英雄记录仍在（值为 0、key 非空）⇒ 不会二次补种。
 */
const DEV_SHARD_BANK = 9999;
const isDevAccount = (): boolean => StorageUtils.getOrCreateUserId() === 'dev_full_admin';

const getStorageKey = (): string =>
    `${STORAGE_KEYS.ROGUE_DIVINITY}_${StorageUtils.getOrCreateUserId()}`;

const EMPTY: DivinitySave = { unlocked: {}, wallet: EMPTY_WALLET };

/** 旧存档兼容：把 { paradoxBank: number } 迁移成 { wallet: EMPTY_WALLET }（悖论点直接作废） */
const migrate = (raw: unknown): DivinitySave => {
    const r = (raw ?? {}) as Partial<DivinitySave> & { paradoxBank?: number };
    return {
        unlocked: r.unlocked ?? {},
        wallet: r.wallet ?? EMPTY_WALLET, // 旧 paradoxBank 不折算（体系已废，程未要求补偿）
        devSeeded: r.devSeeded,           // [2026-10-04] 开发者种子标记（旧档没有 ⇒ undefined ⇒ 会补发一次）
    };
};

// ── [2026-10-04 程拍板] 开发者账号「高额初始值」（口径见上方 DEV_SHARD_BANK 注释）──
/** 开发者账号首轮种入的碎片数（专属 / 万能各一份） */
const DEV_SHARD_SEED = DEV_SHARD_BANK;

/**
 * 开发者账号 ⇒ **一次性**把钱包补到至少 `DEV_SHARD_SEED`
 * （每个神格英雄专属 + 万能各 9999）。
 *
 *   · 判据是**显式标记 `devSeeded`**，不是"钱包为空" —— 开发者存档里很可能已经有碎片，
 *     用"空则补种"会直接跳过 ⇒ 改造后他只剩下那点碎片（见接口注释）
 *   · 取 `max(现有, 种子)` ⇒ **不降级**，绝不把已有的更多碎片改少
 *   · 补完**立刻落盘**并打标记 ⇒ 之后无论花掉多少都不再补
 *     （若改成"低于阈值就补足"，刷新即回满 ⇒ 又退化成锁死）
 */
const seedDevWalletIfNeeded = (save: DivinitySave): DivinitySave => {
    if (!isDevAccount() || save.devSeeded) return save;
    const hero: Record<string, number> = { ...(save.wallet?.hero ?? {}) };
    for (const n of DIVINITY_NODES) hero[n.heroKey] = Math.max(hero[n.heroKey] ?? 0, DEV_SHARD_SEED);
    const seeded: DivinitySave = {
        ...save,
        devSeeded: true,
        wallet: {
            universal: Math.max(save.wallet?.universal ?? 0, DEV_SHARD_SEED),
            hero,
        },
    };
    StorageUtils.save(getStorageKey(), seeded); // 落盘 + 标记 ⇒ 真正的"只给一次"
    return seeded;
};

/**
 * 某英雄的六格神格神经是否**已全部解锁**（= 练满）。
 *
 * 🔑 **判据唯一出口**：[2026-10-04 莉莉子 BUG修复] 存量迁移与入账封顶**共用它** ——
 *   项目老病是"同一语义多处实现 ⇒ 必漏一处"，这里刻意只留一份。
 * ⚠️ 必须显式判 `nodes.length > 0`：`Array.prototype.every` 对**空数组恒返 true**
 *   ⇒ 将来新增一位"还没配节点"的天启者时会被误判成"已练满"、碎片全被转走。
 */
const isHeroMaxedIn = (unlocked: Record<string, string[]> | undefined, heroKey: string): boolean => {
    const nodes = getDivinityNodes(heroKey);
    return nodes.length > 0 && nodes.every(n => isNodeUnlocked(n.id, unlocked?.[heroKey]));
};

/**
 * [2026-10-04 莉莉子 BUG修复 · 存量追溯] 把**已练满英雄**滞留在专属里的碎片 1:1 补进万能。
 *
 * ── 为什么需要：旧判据只看"持有数 ≥ 200"，而点亮神经会**花掉**专属碎片 ⇒
 *    练满那一刻很可能**仍有残留**（数值例：hero=200 → 点 1~5 格花 140、余 60 →
 *    入账 150（room=140 ⇒ credited=140，另 10 片溢出）⇒ hero 回到 200 →
 *    点第 6 格花 60 ⇒ **练满时 hero=140**），
 *    而练满之后这些碎片**再无任何消费出口**（六格已全亮）= 永久死币。
 * ── 幂等：修好后练满英雄的新碎片直接进万能、专属恒为 0 ⇒ 重跑无变化。
 * ── 刻意**不打"已迁移"标记**：每次加载都跑一次，天然覆盖"将来又有英雄练满"的情形，
 *    也顺带兜住"开发者重置后再练满"这类反复测试路径。
 */
const migrateMaxedShardOverflow = (save: DivinitySave): DivinitySave => {
    const hero: Record<string, number> = { ...(save.wallet?.hero ?? {}) };
    let moved = 0;
    for (const [heroKey, have] of Object.entries(hero)) {
        if (!have || have <= 0) continue;
        if (!isHeroMaxedIn(save.unlocked, heroKey)) continue;
        moved += have;
        hero[heroKey] = 0;
    }
    if (moved <= 0) return save;
    console.log(`[DivinityShards] 存量追溯：已练满英雄滞留的专属碎片 ${moved} 片 → 1:1 补入万能`);
    return {
        ...save,
        wallet: {
            universal: (save.wallet?.universal ?? 0) + moved,
            hero,
        },
    };
};

/** 读存档（含开发者首轮种子）—— 模块加载与切号重载**共用这一条路**，杜绝两处各写一份 */
const loadDivinitySave = (): DivinitySave =>
    // ⚠️ 顺序：先 seed（dev 首轮补种）再迁移 —— 保证"练满 ⇒ 专属归 0"这条不变式
    //    对开发者账号同样成立（他练满的那几位，9999 专属同样该转万能）
    migrateMaxedShardOverflow(
        seedDevWalletIfNeeded(migrate(StorageUtils.load<unknown>(getStorageKey(), EMPTY)))
    );

// ── 模块级共享 store ──
let sharedSave: DivinitySave = loadDivinitySave();
const listeners = new Set<() => void>();
/** [2026-09-29] 万能碎片广播只挂一个订阅（多组件实例共用模块级 store，重复挂会重复入账） */
let _universalShardSubscribed = false;

const syncSnapshot = () => setDivinityUnlockedSnapshot(sharedSave.unlocked);

const persist = (next: DivinitySave) => {
    // ⚠️ [2026-10-04 程拍板] `devSeeded` 标记由 store **自己保留**：
    //   多数调用方只写 `{ unlocked, wallet }`（如 unlockNode），根本展开不到这个字段
    //   ⇒ 标记会被抹掉 ⇒ 下次加载 migrate 读到 undefined ⇒ **又补种一次**
    //   ⇒ 开发者点一次节点碎片就回满，等于退化回"锁死"。故在此统一兜住。
    const merged: DivinitySave = { ...next, devSeeded: sharedSave.devSeeded };
    sharedSave = merged;
    StorageUtils.save(getStorageKey(), merged);
    syncSnapshot();               // data 层的同步视图（排序 / 星槽）跟着更新
    listeners.forEach(fn => fn());
};

// 首屏即把快照同步给 data 层（避免"排序/星槽读到空"）
syncSnapshot();

/**
 * 账号切换后重载神格神经缓存（对齐 reloadHeroProgressionCache 的口径）：
 * sharedSave 是模块级缓存，只在模块加载时按当时的 USER_ID 读一次；切号不刷新页面 →
 * 新账号会看到旧账号的解锁与碎片。本函数按"当前 USER_ID"重读并广播。只读不写。
 */
export const reloadDivinityCache = (): void => {
    sharedSave = loadDivinitySave();
    syncSnapshot();
    listeners.forEach(fn => fn());
};

/**
 * [2026-10-04 莉莉子] **只读**快照：当前碎片钱包。
 *
 * 用途：`useUserSystem.openChest` 开碎片匣时，用**真源钱包**去算「溢出转万能」，
 *   使界面显示的溢出量 = 实际入账量。
 *   （此前调用方传的是 `undefined` ⇒ `dropShards` 按**空钱包**算 ⇒ `overflow` 恒为 0
 *    ⇒ 界面永远不显示「溢出 +N 万能」，而钱包其实转了 ⇒ 玩家以为"没转化"。）
 *
 * ⚠️ **只读、不写、不订阅** —— 钱包的写入口仍然只有本文件的 `persist`（唯一真源不变）。
 * ⚠️ 依赖方向：`useUserSystem` 早已 import 本模块（`reloadDivinityCache`，见其 :21），
 *    而本模块**不** import `useUserSystem` ⇒ 单向、不成环。
 */
export const peekShardWallet = (): ShardWallet => sharedSave.wallet;

/** [2026-10-04 莉莉子] **只读**谓词：某英雄是否已练满（与入账侧共用同一判据 `isHeroMaxedIn`） */
export const peekHeroMaxed = (heroKey: string): boolean => isHeroMaxedIn(sharedSave.unlocked, heroKey);

export const useHeroDivinity = () => {
    const [save, setSave] = useState<DivinitySave>(sharedSave);

    useEffect(() => {
        const fn = () => setSave(sharedSave);
        listeners.add(fn);
        return () => { listeners.delete(fn); };
    }, []);

    /**
     * [2026-09-29 程拍板] 订阅「万能碎片发放」广播（任务奖励等）。
     *   依赖方向：碎片真源在本 hook，而奖励在 useUserSystem 发放 → 后者广播、这里入账。
     *   ⚠️ 每个实例都订阅 → persist 内部只在值真变化时才写盘/广播，不会重复累加
     *     （用 _universalShardSubscribed 模块级闸门保证只挂一个订阅，避免 N 份组件重复入账）。
     */
    useEffect(() => {
        if (_universalShardSubscribed) return;
        _universalShardSubscribed = true;
        const onGrant = (payload?: { amount?: number }) => {
            const amount = Math.max(0, Math.round(payload?.amount ?? 0));
            if (amount > 0) persist({ ...sharedSave, wallet: grantUniversalShards(sharedSave.wallet, amount) });
        };
        eventBus.on(GameEvents.DIVINITY_UNIVERSAL_SHARD_GRANT, onGrant);
        return () => {
            eventBus.off(GameEvents.DIVINITY_UNIVERSAL_SHARD_GRANT, onGrant);
            _universalShardSubscribed = false;
        };
    }, []);

    /** 已解锁节点 id（无记录 → 空数组） */
    const getUnlocked = useCallback((heroKey: string): string[] => sharedSave.unlocked[heroKey] ?? [], []);

    // ── 碎片钱包读取 ──
    // [2026-10-04 程拍板] 不再对开发者账号做"恒返 9999"的特判 ——
    //   他的高额碎片来自**首轮种子**（见上方 seedDevWalletIfNeeded），读取一律走真实钱包。

    /** 某英雄的专属碎片数 */
    const getHeroShardCount = useCallback((heroKey: string): number =>
        getHeroShards(sharedSave.wallet, heroKey), []);

    /** 万能碎片数 */
    const getUniversalShardCount = useCallback((): number =>
        getUniversalShards(sharedSave.wallet), []);

    /** 某节点「专属 + 万能」的花费明细（含是否够）—— 神格神经 UI 直接用它渲染 */
    const getSpendPlan = useCallback((heroKey: string, node: DivinityNode): ShardSpendPlan =>
        planShardSpend(sharedSave.wallet, heroKey, getNodeCost(node)), []);

    /** 某节点当前可否激活（前置齐了 + 未解锁 + 碎片够） */
    const canUnlock = useCallback((node: DivinityNode): { ok: boolean; reason?: 'unlocked' | 'locked' | 'poor' } => {
        const list = sharedSave.unlocked[node.heroKey] ?? [];
        if (isNodeUnlocked(node.id, list)) return { ok: false, reason: 'unlocked' };
        if (!isNodeAvailable(node, list)) return { ok: false, reason: 'locked' };
        // [2026-10-04 程拍板] 开发者账号同样按**真实余额**判定（不再无条件 ok）
        const plan = planShardSpend(sharedSave.wallet, node.heroKey, getNodeCost(node));
        if (!plan.affordable) return { ok: false, reason: 'poor' };
        return { ok: true };
    }, []);

    /** 激活一个节点：扣碎片 + 记解锁（失败返回 false，不产生任何写入） */
    const unlockNode = useCallback((node: DivinityNode): boolean => {
        const list = sharedSave.unlocked[node.heroKey] ?? [];
        if (isNodeUnlocked(node.id, list)) return false;
        if (!isNodeAvailable(node, list)) return false;
        const cost = getNodeCost(node);
        // [2026-10-04 程拍板] 开发者账号**同样真实扣费**（不再免单）——
        //   否则"扣费 / 余额不足 / 200 封顶 / 溢出转万能"这几条链路在开发者账号上永远测不到。
        const plan = planShardSpend(sharedSave.wallet, node.heroKey, cost);
        if (!plan.affordable) return false;
        persist({
            unlocked: { ...sharedSave.unlocked, [node.heroKey]: [...list, node.id] },
            wallet: spendShards(sharedSave.wallet, node.heroKey, plan),
        });
        return true;
    }, []);

    /**
     * [2026-09-28 开发者专属] 重置某天启者的神格神经（清空已解锁节点，便于反复测试）。
     *   只清解锁表，**不动碎片钱包**。
     */
    const resetHero = useCallback((heroKey: string): void => {
        if (!(sharedSave.unlocked[heroKey]?.length)) return;
        persist({ ...sharedSave, unlocked: { ...sharedSave.unlocked, [heroKey]: [] } });
    }, []);

    // ── 碎片入账（奖励匣 / 每日任务 / 溢出）──

    /**
     * [2026-10-04 莉莉子 BUG修复] 该英雄六格是否已练满 —— **入账封顶的判据**。
     *   复用模块级唯一出口 `isHeroMaxedIn`（与存量迁移同源，杜绝两处判据漂移）。
     */
    const isHeroMaxed = useCallback((heroKey: string): boolean =>
        isHeroMaxedIn(sharedSave.unlocked, heroKey), []);

    /**
     * 发放某英雄专属碎片（**练满 ⇒ 全额转万能**）；返回实际入账与溢出量供 UI 提示。
     * ⚠️ 判据是"是否练满"而不是"持有数够不够 200" —— 练满会把专属花掉、持有数归 0，
     *    旧判据因此在练满后失效（详见 `grantHeroShards` 的注释）。
     */
    const grantHeroShard = useCallback((heroKey: string, amount: number) => {
        const res = grantHeroShards(sharedSave.wallet, heroKey, amount, isHeroMaxed(heroKey));
        persist({ ...sharedSave, wallet: res.wallet });
        return res;
    }, [isHeroMaxed]);

    /** 发放万能碎片 */
    const grantUniversalShard = useCallback((amount: number) => {
        persist({ ...sharedSave, wallet: grantUniversalShards(sharedSave.wallet, amount) });
    }, []);

    /**
     * 批量发放碎片匣结果（每 5 片一组随机归属；各英雄独立算溢出）
     *
     * [2026-10-02 莉莉子 BUG修复 · 吞碎片] 改为「按 details 逐笔入账到**当前钱包**」，
     *   不再用 `drop.wallet` **整体覆盖**。
     *
     *   病根：三处调用方全都写的是 `dropShards(undefined, ...)` —— 钱包入参传 undefined：
     *     · App.tsx（整局结算碎片）  ← [2026-10-03 已改] 结算改发**万能碎片**，不再走 dropShards
     *     · App.tsx:1768          通关结算窗开匣
     *     · EvaluationPanel.tsx:344 推演结算开匣
     *   而 `dropShards` 内部是 `let wallet = w ?? EMPTY_WALLET`（divinityShards.ts:188），
     *   于是返回的 `drop.wallet` 是**从空钱包起算**的 —— 用它整体覆盖
     *   ⇒ 玩家已有碎片（含万能）被清零。每局结算还会再清一次。
     *
     *   粉丝原话：「究极恶性bug，开碎片匣子会吞未消耗的碎片」「我碎片全没了」
     *             「我说开了这么多匣子怎么一个节点都开不起」。
     *
     *   现在以模块级 `sharedSave.wallet`（真源）为基准，按 details 逐笔 `grantHeroShards`
     *   （各自 200 片封顶 + 溢出转万能），**与调用方传什么 wallet 无关** ⇒ 三处一并修好。
     */
    const applyShardDrop = useCallback((drop: ShardDropResult) => {
        const details = drop?.details ?? [];
        // 无明细时不动钱包 —— 杜绝"传了个空 drop 反而把钱包清空"这类误伤
        if (details.length === 0) return;
        let wallet = sharedSave.wallet;
        for (const d of details) {
            // [2026-10-04] 传入"是否已练满" ⇒ 练满的英雄全额转万能（判据见 isHeroMaxedIn）
            wallet = grantHeroShards(wallet, d.heroKey, d.amount, isHeroMaxed(d.heroKey)).wallet;
        }
        persist({ ...sharedSave, wallet });
    }, [isHeroMaxed]);

    /** 某英雄的星数（= 已解锁节点数，0-6） */
    const getLevel = useCallback((heroKey: string): number =>
        getDivinityNodes(heroKey).filter(n => isNodeUnlocked(n.id, sharedSave.unlocked[heroKey])).length, []);

    return {
        save,                    // { unlocked, wallet }（响应式）
        getUnlocked,
        // 碎片读取
        getHeroShardCount,
        getUniversalShardCount,
        getSpendPlan,
        // 解锁
        canUnlock,
        unlockNode,
        resetHero,               // [开发者] 重置本英雄神格神经
        // 碎片入账
        grantHeroShard,
        grantUniversalShard,
        applyShardDrop,
        getLevel,
    };
};
