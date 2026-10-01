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
}

/**
 * [2026-09-28 莉莉子 开发者] 开发者账号（dev_full_admin）的碎片视为无限：
 *   · 显示 9999（专属/万能各 9999）
 *   · 激活节点**不扣**（方便反复测试六个节点的效果）
 *   普通账号走真实钱包（跨局累积）。
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
    };
};

// ── 模块级共享 store ──
let sharedSave: DivinitySave = migrate(StorageUtils.load<unknown>(getStorageKey(), EMPTY));
const listeners = new Set<() => void>();
/** [2026-09-29] 万能碎片广播只挂一个订阅（多组件实例共用模块级 store，重复挂会重复入账） */
let _universalShardSubscribed = false;

const syncSnapshot = () => setDivinityUnlockedSnapshot(sharedSave.unlocked);

const persist = (next: DivinitySave) => {
    sharedSave = next;
    StorageUtils.save(getStorageKey(), next);
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
    sharedSave = migrate(StorageUtils.load<unknown>(getStorageKey(), EMPTY));
    syncSnapshot();
    listeners.forEach(fn => fn());
};

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

    // ── 碎片钱包读取（开发者账号恒 9999）──

    /** 某英雄的专属碎片数 */
    const getHeroShardCount = useCallback((heroKey: string): number =>
        isDevAccount() ? DEV_SHARD_BANK : getHeroShards(sharedSave.wallet, heroKey), []);

    /** 万能碎片数 */
    const getUniversalShardCount = useCallback((): number =>
        isDevAccount() ? DEV_SHARD_BANK : getUniversalShards(sharedSave.wallet), []);

    /** 某节点「专属 + 万能」的花费明细（含是否够）—— 神格神经 UI 直接用它渲染 */
    const getSpendPlan = useCallback((heroKey: string, node: DivinityNode): ShardSpendPlan => {
        if (isDevAccount()) {
            const cost = getNodeCost(node);
            return { heroSpend: cost, universalSpend: 0, total: cost, affordable: true };
        }
        return planShardSpend(sharedSave.wallet, heroKey, getNodeCost(node));
    }, []);

    /** 某节点当前可否激活（前置齐了 + 未解锁 + 碎片够） */
    const canUnlock = useCallback((node: DivinityNode): { ok: boolean; reason?: 'unlocked' | 'locked' | 'poor' } => {
        const list = sharedSave.unlocked[node.heroKey] ?? [];
        if (isNodeUnlocked(node.id, list)) return { ok: false, reason: 'unlocked' };
        if (!isNodeAvailable(node, list)) return { ok: false, reason: 'locked' };
        if (isDevAccount()) return { ok: true };
        const plan = planShardSpend(sharedSave.wallet, node.heroKey, getNodeCost(node));
        if (!plan.affordable) return { ok: false, reason: 'poor' };
        return { ok: true };
    }, []);

    /** 激活一个节点：扣碎片 + 记解锁（失败返回 false，不产生任何写入）；开发者账号不扣费 */
    const unlockNode = useCallback((node: DivinityNode): boolean => {
        const list = sharedSave.unlocked[node.heroKey] ?? [];
        if (isNodeUnlocked(node.id, list)) return false;
        if (!isNodeAvailable(node, list)) return false;
        const cost = getNodeCost(node);
        const dev = isDevAccount();
        const plan = dev
            ? { heroSpend: cost, universalSpend: 0, total: cost, affordable: true }
            : planShardSpend(sharedSave.wallet, node.heroKey, cost);
        if (!plan.affordable) return false;
        persist({
            unlocked: { ...sharedSave.unlocked, [node.heroKey]: [...list, node.id] },
            wallet: dev ? sharedSave.wallet : spendShards(sharedSave.wallet, node.heroKey, plan),
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

    /** 发放某英雄专属碎片（含 200 封顶溢出转万能）；返回实际入账与溢出量供 UI 提示 */
    const grantHeroShard = useCallback((heroKey: string, amount: number) => {
        const res = grantHeroShards(sharedSave.wallet, heroKey, amount);
        persist({ ...sharedSave, wallet: res.wallet });
        return res;
    }, []);

    /** 发放万能碎片 */
    const grantUniversalShard = useCallback((amount: number) => {
        persist({ ...sharedSave, wallet: grantUniversalShards(sharedSave.wallet, amount) });
    }, []);

    /** 批量发放碎片匣结果（每 5 片一组随机归属；各英雄独立算溢出）*/
    const applyShardDrop = useCallback((drop: ShardDropResult) => {
        persist({ ...sharedSave, wallet: drop.wallet });
    }, []);

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
