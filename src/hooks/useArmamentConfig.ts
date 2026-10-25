// ==========================================
// 悖论迷宫 · 武装配置持久化
// [2026-08-14 莉莉子] 武装=局外带入的特殊装备（局内不可获取，进入游戏前配置）。
//   按天启者存 3 槽配置（每槽放装备/武装 id 或 null），按用户存 localStorage。
// [2026-09-07 重修申请] 新增「每槽可装备品质额外档」持久化：
//   品质上限 = 英雄等级基础（≤稀有）+ 该槽重修额外档（0-3，紫/金/神话逐档开）。
//   旧存档迁移：历史 26/30 级等级奖励的品质解锁，一次性固化为槽位档（26→+1，30→+3）。
// [2026-09-07 莉莉子 修复] 改为**模块级共享 store**（对齐 useHeroProgression）：
//   此前每个 useArmamentConfig 实例各自持一份 useState 快照，App 顶层实例在页面加载时读一次旧值，
//   玩家在武装界面配置后写入 storage，App 的 config 却是旧的 → startRun/settleRun 读不到实际配置，
//   run.armaments 快照为空 → 碳原子板翻倍/重修升档/消耗品全部不生效（跨实例不同步是根因）。
//   现所有实例共享同一份内存态，任一实例改动 → 广播 → 全部界面实时刷新；切号走 reloadArmamentCache。
// ==========================================
import { useCallback, useEffect, useReducer } from 'react';
import { StorageUtils, STORAGE_KEYS } from '../utils/storageUtils';
import { getHeroLevelBonus } from '../data/roguelike/heroProgression'; // [2026-08-28 莉莉子] 武装槽解锁随等级
import { getHeroLevelOf, hasHeroProgressOf } from './useHeroProgression'; // [2026-10-05 莉莉子] 模块级读等级/记录（加载期清理残留用；不成环：后者不反向 import 本模块）

export const ARMAMENT_SLOT_COUNT = 3; // 武装槽数

type ArmamentSlotValue = string | null;
export type ArmamentConfig = Record<string, ArmamentSlotValue[]>; // heroKey → [槽0, 槽1, 槽2]

// [2026-09-07 重修申请] 每槽品质额外档：heroKey → [档0, 档1, 档2]（0-3；上限与英雄等级基础合并后不超红神话）
export type ArmamentQualityConfig = Record<string, number[]>;

const getStorageKey = (): string =>
    `${STORAGE_KEYS.ROGUE_ARMAMENT}_${StorageUtils.getOrCreateUserId()}`;

const getQualityStorageKey = (): string =>
    `${STORAGE_KEYS.ROGUE_ARMAMENT_QUALITY}_${StorageUtils.getOrCreateUserId()}`;

const emptySlots = (): ArmamentSlotValue[] => Array(ARMAMENT_SLOT_COUNT).fill(null);

/**
 * [2026-09-07] 载入品质档；首次且无档记录时，把历史等级奖励品质（26 级史诗 / 30 级神话）一次性迁移成槽位档，
 * 避免"等级奖励移除后老玩家品质上限回落、卸下武装装不回"的追溯惩罚。迁移后以档记录为准（纯只写一次）。
 */
const loadQualityTiers = (): ArmamentQualityConfig => {
    const key = getQualityStorageKey();
    const raw = StorageUtils.load<ArmamentQualityConfig>(key, {});
    if (raw && Object.keys(raw).length) return raw;
    // 无档记录 → 尝试按历史英雄等级迁移
    const hp = StorageUtils.load<Record<string, { level: number; exp: number }>>(
        `${STORAGE_KEYS.ROGUE_HERO_PROGRESS}_${StorageUtils.getOrCreateUserId()}`,
        {},
    );
    const migrated: ArmamentQualityConfig = {};
    for (const [heroKey, p] of Object.entries(hp)) {
        const lv = p?.level ?? 1;
        const tier = lv >= 30 ? 3 : lv >= 26 ? 1 : 0; // 历史：26=史诗(+1)、30=神话(+3)
        if (tier > 0) migrated[heroKey] = [tier, tier, tier];
    }
    if (Object.keys(migrated).length) StorageUtils.save(key, migrated);
    return migrated;
};

/**
 * [2026-09-25 莉莉子 武装不叠加] 清理同一天启者槽位内的重复武装：每个 id 只保留最先出现的那一槽，其余置空。
 *   重复槽本来就是不生效的（战斗构建对同名武装硬去重），清掉后库存占用同步释放，物品本身不丢失。
 */
const dedupeArmamentSlots = (cfg: ArmamentConfig): { next: ArmamentConfig; changed: boolean } => {
    let changed = false;
    const next: ArmamentConfig = {};
    for (const [hk, slots] of Object.entries(cfg ?? {})) {
        const seen = new Set<string>();
        next[hk] = (slots ?? []).map(s => {
            if (!s) return null;
            if (seen.has(s)) { changed = true; return null; }
            seen.add(s);
            return s;
        });
    }
    return { next, changed };
};

/**
 * [2026-10-05 莉莉子 BUG修复 · 残留清理] 清掉**每个英雄**「未解锁槽」里的残留武装。
 *
 * ── 病根：`ArmamentConfig` 恒为 3 槽，而"能用几槽"随等级解锁（Lv1 / Lv9 / Lv18 → 1 / 2 / 3）。
 *    等级一旦**由高变低**（开发者调级、旧存档），高等级时配好的武装会**留在锁着的槽里**：
 *      · 不生效 —— `getArmament` 只返回已解锁槽 ✅
 *      · 但会**占库存** —— 旧口径算 occupied 时把它算进去了 ⇒ 玩家"有份数却装不了"
 *      · 且**日后升回解锁等级时会突然"复活"** ⇒ 凭空多出一件（占用还可能超过库存）
 *    ⇒ 必须在**加载时统一清掉**，而不是只在"打开某个英雄的武装页"时清那一个
 *      （原 `RogueHeroInfoModal` 的自动清理只覆盖当前打开的英雄）。
 *
 * ⚠️ 与 `dedupeArmamentSlots` 同一时机、同一性质：**纯数据清理，物品不丢失**
 *    （武装槽只是"配置引用"，清槽 = 卸下，库存份数不受影响，随时可再装回去）。
 * ⚠️ 每个英雄按**自己的等级**算解锁槽数，不能用同一个 n。
 */
const clearLockedSlotResidue = (cfg: ArmamentConfig): { next: ArmamentConfig; changed: boolean } => {
    let changed = false;
    const next: ArmamentConfig = {};
    for (const [hk, slots] of Object.entries(cfg ?? {})) {
        // ⚠️ [2026-10-05 莉莉子 · 独立审查 R1 修复] **没有等级记录就不清**。
        //   病根：`getHeroLevelOf` 的 `?? 1` 只是兜底值 —— 存储读取异常（`StorageUtils.load` 返回 `{}`）
        //   或存档被删时，**所有英雄都会兜底成 Lv1** ⇒ 这里会把**已解锁槽也清掉并落盘**，
        //   把一个"显示层故障"放大成**持久化的配置损失**（旧实现只影响显示/生效过滤，从不写档）。
        //   ⇒ 取舍：**宁可漏清，不可误清** —— 真·新账号本来就不可能有未解锁槽残留。
        if (!hasHeroProgressOf(hk)) { next[hk] = [...(slots ?? [])]; continue; }
        const n = Math.max(1, getHeroLevelBonus(getHeroLevelOf(hk)).armamentSlots);
        const arr = [...(slots ?? [])];
        for (let i = n; i < arr.length; i++) {
            if (arr[i]) { arr[i] = null; changed = true; }
        }
        next[hk] = arr;
    }
    return { next, changed };
};

/** [2026-09-25] 读取武装配置并做一次重复清理（有改动才写回，纯迁移不覆盖玩家数据）
 *  [2026-10-05 莉莉子] **再叠一道**「未解锁槽残留」清理 —— 与去重互相独立
 *    （一个管"同一英雄内的同名重复"，一个管"锁着的槽里还留着东西"） */
const loadArmamentConfig = (): ArmamentConfig => {
    const raw = StorageUtils.load<ArmamentConfig>(getStorageKey(), {});
    const deduped = dedupeArmamentSlots(raw);
    const cleaned = clearLockedSlotResidue(deduped.next);
    if (deduped.changed || cleaned.changed) StorageUtils.save(getStorageKey(), cleaned.next);
    return cleaned.next;
};

// ── [2026-09-07] 模块级共享 store（对齐 useHeroProgression）──
let sharedConfig: ArmamentConfig = loadArmamentConfig();
let sharedQuality: ArmamentQualityConfig = loadQualityTiers();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(fn => fn());

const persistConfig = () => {
    StorageUtils.save(getStorageKey(), sharedConfig);
    emit();
};
const persistQuality = () => {
    StorageUtils.save(getQualityStorageKey(), sharedQuality);
    emit();
};

/**
 * [2026-09-07] 切号后重载武装缓存（同 reloadHeroProgressionCache 语义：shared 是模块级缓存，
 * 只按模块加载时 USER_ID 读一次；切号不刷新页面 → 需按新 USER_ID 重读并广播）。
 */
export const reloadArmamentCache = (): void => {
    sharedConfig = loadArmamentConfig(); // [2026-09-25] 顺带做同日启者重复武装清理
    sharedQuality = loadQualityTiers(); // 空档新账号会按等级做一次迁移（无档则跳过）
    emit();
};

export const useArmamentConfig = () => {
    // [2026-09-07] 订阅共享 store：任一实例改动 → 本实例重渲染（方法直接读 shared，天然最新）
    const [, force] = useReducer((x: number) => x + 1, 0);
    useEffect(() => {
        listeners.add(force);
        return () => { listeners.delete(force); };
    }, []);

    /** 获取某英雄武装配置（3 槽；无则全空）。
     *  [2026-08-28 莉莉子 修复] 传 level 时只取已解锁槽位（armamentSlots）内的武装，未解锁槽一律置 null——
     *  等级降低后未解锁槽残留的武装不再生效（不带入战斗 / 不占库存 / 不显示），重新升级后再配置 */
    const getArmament = useCallback((heroKey: string, level?: number): ArmamentSlotValue[] => {
        const values = sharedConfig[heroKey] ?? emptySlots();
        if (level !== undefined) {
            const n = Math.max(1, getHeroLevelBonus(level).armamentSlots); // 至少 1 槽（默认）
            return Array.from({ length: ARMAMENT_SLOT_COUNT }, (_, i) => (i < n ? (values[i] ?? null) : null));
        }
        return values;
    }, []);

    /** 设置某英雄某槽位的武装（equipId 可为 null=卸下） */
    const setArmamentSlot = useCallback((heroKey: string, slot: number, equipId: ArmamentSlotValue) => {
        if (slot < 0 || slot >= ARMAMENT_SLOT_COUNT) return;
        const cur = sharedConfig[heroKey] ?? emptySlots();
        const next = [...cur];
        next[slot] = equipId;
        sharedConfig = { ...sharedConfig, [heroKey]: next };
        persistConfig();
    }, []);

    /** [2026-09-07 重修申请] 某英雄 3 槽的品质额外档（无记录全 0） */
    const getQualityTier = useCallback((heroKey: string): number[] => {
        return sharedQuality[heroKey] ?? [0, 0, 0];
    }, []);

    /** [2026-09-07 重修申请] 某槽品质额外档 +1（红神话封顶 3）；成功 true（供结算判断是否发挥→消耗） */
    const bumpQualityTier = useCallback((heroKey: string, slot: number): boolean => {
        if (slot < 0 || slot >= ARMAMENT_SLOT_COUNT) return false;
        const cur = sharedQuality[heroKey] ?? [0, 0, 0];
        if (cur[slot] >= 3) return false; // 已神话封顶，不再升（此时重修不消耗：无提升可发挥）
        const next = [...cur];
        next[slot] = next[slot] + 1;
        sharedQuality = { ...sharedQuality, [heroKey]: next };
        persistQuality();
        return true;
    }, []);

    /** 清空某英雄所有武装 */
    const clearArmament = useCallback((heroKey: string) => {
        sharedConfig = { ...sharedConfig, [heroKey]: emptySlots() };
        persistConfig();
    }, []);

    /**
     * [2026-09-07 重修申请·难度档] 将某槽品质额外档提升到 ≥ targetTier（相对等级基础；由通关难度定：
     * 普通→1(史诗)、机密→2(传说)、绝密→3(神话)）。槽已达目标/更高 → false（本局未发挥，不消耗）。
     */
    const upgradeQualityTo = useCallback((heroKey: string, slot: number, targetTier: number): boolean => {
        if (slot < 0 || slot >= ARMAMENT_SLOT_COUNT) return false;
        const cur = sharedQuality[heroKey] ?? [0, 0, 0];
        const curTier = cur[slot] ?? 0;
        const desired = Math.max(1, Math.min(3, targetTier));
        if (curTier >= desired) return false; // 已达目标档或更高 → 无发挥
        const next = [...cur];
        next[slot] = desired;
        sharedQuality = { ...sharedQuality, [heroKey]: next };
        persistQuality();
        return true;
    }, []);

    /** [2026-09-07 消耗品武装] 从所有英雄的所有槽位移除指定武装（用后消失——清库存同时清槽，防止残留仍带入战斗）
     *  ⚠️ [2026-10-20 独立武装库] **本函数是"跨英雄"语义，当前零调用点**。
     *     武装库已改为按天启者独立 ⇒ 若日后把它接到消耗品结算（"用掉一件就卸槽"）上，
     *     会把**其他天启者**装着的同款一并卸下，与"每英雄各一份"直接冲突。
     *     真要这么做，请改为按当前英雄 key 卸槽（`setArmamentSlot(heroKey, i, null)`）。 */
    const clearArmamentById = useCallback((equipId: string) => {
        if (!equipId) return;
        let changed = false;
        const updated: ArmamentConfig = {};
        for (const [hk, slots] of Object.entries(sharedConfig)) {
            if (!slots.some(s => s === equipId)) { updated[hk] = slots; continue; }
            changed = true;
            updated[hk] = slots.map(s => (s === equipId ? null : s));
        }
        if (!changed) return;
        sharedConfig = updated;
        persistConfig();
    }, []);

    return { config: sharedConfig, qualityTiers: sharedQuality, getArmament, setArmamentSlot, getQualityTier, bumpQualityTier, upgradeQualityTo, clearArmament, clearArmamentById };
};
