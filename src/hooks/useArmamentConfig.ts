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

// ── [2026-09-07] 模块级共享 store（对齐 useHeroProgression）──
let sharedConfig: ArmamentConfig = StorageUtils.load<ArmamentConfig>(getStorageKey(), {});
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
    sharedConfig = StorageUtils.load<ArmamentConfig>(getStorageKey(), {});
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

    /** [2026-09-07 消耗品武装] 从所有英雄的所有槽位移除指定武装（用后消失——清库存同时清槽，防止残留仍带入战斗） */
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
