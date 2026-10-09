// ==========================================
// 悖论迷宫 · 天启者养成——等级功能（持久化 + 经验结算）
// [2026-08-12 莉莉子] 每英雄独立等级/经验，按用户存 localStorage。
// [2026-08-14 莉莉子] 改为**模块级共享 store**：所有 useHeroProgression 实例共享同一份进度，
//   任一实例改动（addHeroExp / setHeroLevel）→ 全局广播 → 所有界面（头像区/等级界面/武装界面）实时刷新。
// ==========================================
import { useCallback, useEffect, useState } from 'react';
import { StorageUtils, STORAGE_KEYS } from '../utils/storageUtils';
import { MAX_HERO_LEVEL, getExpToNextLevel, getHeroLevelBonus, type HeroLevelBonus } from '../data/roguelike/heroProgression';

export interface HeroProgressData {
    level: number;
    exp: number; // 当前级内已积累经验
}

export interface HeroProgress extends HeroProgressData {
    expToNext: number;     // 升到下一级所需经验（满级 0）
    bonus: HeroLevelBonus; // 当前等级累计加成
}

const getStorageKey = (): string =>
    `${STORAGE_KEYS.ROGUE_HERO_PROGRESS}_${StorageUtils.getOrCreateUserId()}`;

// ── [2026-08-14] 模块级共享 store ──
let sharedMap: Record<string, HeroProgressData> = StorageUtils.load<Record<string, HeroProgressData>>(getStorageKey(), {});
const listeners = new Set<() => void>();

const persist = (next: Record<string, HeroProgressData>) => {
    sharedMap = next;
    StorageUtils.save(getStorageKey(), next);
    listeners.forEach(fn => fn()); // 广播：所有实例刷新
};

/**
 * [2026-09-04 莉莉子 修复] 账号切换后重载养成缓存
 * sharedMap 是模块级缓存，只在模块加载时按当时的 USER_ID 读一次；
 * 而切号（switchUser/createNewUser）不刷新页面 → 新账号会看到旧账号的等级/经验。
 * 本函数按"当前 USER_ID"重读存档并广播给所有在用的界面。
 * 调用时机：useUserSystem.loadUserData 写入新 USER_ID 之后。
 * 只读不写，不影响任何已有账号数据。
 */
export const reloadHeroProgressionCache = (): void => {
    sharedMap = StorageUtils.load<Record<string, HeroProgressData>>(getStorageKey(), {});
    listeners.forEach(fn => fn());
};

/**
 * [2026-10-05 莉莉子] **模块级**读某英雄当前等级（无记录 → 1）。
 *
 * 为什么需要它：`useArmamentConfig` 要在**模块加载期**做一次"未解锁槽残留清理"
 *   （见 `clearLockedSlotResidue`），那时拿不到 hook 的返回值，但能读模块级的 `sharedMap`。
 * ⚠️ 与 hook 内暴露的 `getHeroLevel` **同源**（都是这一个函数）⇒ 两处口径不会分叉。
 */
export const getHeroLevelOf = (heroKey: string): number => sharedMap[heroKey]?.level ?? 1;

/**
 * [2026-10-05 莉莉子] 该英雄**是否存在等级记录**。
 *
 * ⚠️ 为什么必须区分「无记录」与「真的是 Lv1」：
 *   `getHeroLevelOf` 的 `?? 1` 只是**兜底显示值**。若存储读取异常（`StorageUtils.load` 捕获异常返回 `{}`）
 *   或存档被删，**所有英雄都会兜底成 1** ⇒ 任何"按等级推断槽位"的**写操作**都会把
 *   **已解锁槽也当成锁着的清掉并落盘**（持久化的配置损失）。
 *   ⇒ 凡是要**据等级改存档**的地方（如 `clearLockedSlotResidue`），先问一句"他真的存在等级记录吗"。
 */
export const hasHeroProgressOf = (heroKey: string): boolean => !!sharedMap[heroKey];

export const useHeroProgression = () => {
    const [progressMap, setProgressMap] = useState<Record<string, HeroProgressData>>(sharedMap);

    // 订阅全局变更（任意实例改动 → 本实例同步最新）
    useEffect(() => {
        const fn = () => setProgressMap(sharedMap);
        listeners.add(fn);
        return () => { listeners.delete(fn); };
    }, []);

    /** 为某个天启者添加经验，处理连续升级；返回升级信息（null = 未升级）供 UI 提示 */
    const addHeroExp = useCallback((heroKey: string, amount: number): { fromLevel: number; toLevel: number } | null => {
        let leveledUp: { fromLevel: number; toLevel: number } | null = null;
        const cur = sharedMap[heroKey] ?? { level: 1, exp: 0 };
        let { level, exp } = cur;
        exp += amount;
        let toNext = getExpToNextLevel(level);
        while (toNext > 0 && exp >= toNext) {
            exp -= toNext;
            level += 1;
            toNext = getExpToNextLevel(level);
        }
        if (level > cur.level) leveledUp = { fromLevel: cur.level, toLevel: level };
        persist({ ...sharedMap, [heroKey]: { level, exp } });
        return leveledUp;
    }, []);

    /** 获取某英雄的等级/经验/升级所需/加成（无记录 → Lv1 无加成） */
    const getHeroProgress = useCallback((heroKey: string): HeroProgress => {
        const cur = sharedMap[heroKey] ?? { level: 1, exp: 0 };
        return {
            ...cur,
            expToNext: getExpToNextLevel(cur.level),
            bonus: getHeroLevelBonus(cur.level),
        };
    }, []);

    /** 获取某英雄当前等级（无记录 → 1）—— 直接复用模块级唯一出口，避免两处口径 */
    const getHeroLevel = useCallback((heroKey: string): number => getHeroLevelOf(heroKey), []);

    /** [2026-08-14 开发者] 直接设置某英雄等级（1-30，钳制范围），用于开发者测试等级数字颜色等 */
    const setHeroLevel = useCallback((heroKey: string, level: number) => {
        const cur = sharedMap[heroKey] ?? { level: 1, exp: 0 };
        persist({ ...sharedMap, [heroKey]: { ...cur, level: Math.max(1, Math.min(MAX_HERO_LEVEL, level)) } });
    }, []);

    return { progressMap, addHeroExp, getHeroProgress, getHeroLevel, setHeroLevel };
};
