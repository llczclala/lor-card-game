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

    /** 获取某英雄当前等级（无记录 → 1） */
    const getHeroLevel = useCallback((heroKey: string): number => {
        return sharedMap[heroKey]?.level ?? 1;
    }, []);

    /** [2026-08-14 开发者] 直接设置某英雄等级（1-30，钳制范围），用于开发者测试等级数字颜色等 */
    const setHeroLevel = useCallback((heroKey: string, level: number) => {
        const cur = sharedMap[heroKey] ?? { level: 1, exp: 0 };
        persist({ ...sharedMap, [heroKey]: { ...cur, level: Math.max(1, Math.min(MAX_HERO_LEVEL, level)) } });
    }, []);

    return { progressMap, addHeroExp, getHeroProgress, getHeroLevel, setHeroLevel };
};
