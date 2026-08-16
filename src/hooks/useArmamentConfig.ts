// ==========================================
// 悖论迷宫 · 武装配置持久化
// [2026-08-14 莉莉子] 武装=局外带入的特殊装备（局内不可获取，进入游戏前配置）。
//   按天启者存 3 槽配置（每槽放装备/武装 id 或 null），按用户存 localStorage。
// ==========================================
import { useCallback, useState } from 'react';
import { StorageUtils, STORAGE_KEYS } from '../utils/storageUtils';

export const ARMAMENT_SLOT_COUNT = 3; // 武装槽数

type ArmamentSlotValue = string | null;
export type ArmamentConfig = Record<string, ArmamentSlotValue[]>; // heroKey → [槽0, 槽1, 槽2]

const getStorageKey = (): string =>
    `${STORAGE_KEYS.ROGUE_ARMAMENT}_${StorageUtils.getOrCreateUserId()}`;

const emptySlots = (): ArmamentSlotValue[] => Array(ARMAMENT_SLOT_COUNT).fill(null);

export const useArmamentConfig = () => {
    const [config, setConfig] = useState<ArmamentConfig>(() =>
        StorageUtils.load<ArmamentConfig>(getStorageKey(), {}),
    );

    /** 获取某英雄武装配置（3 槽；无则全空） */
    const getArmament = useCallback((heroKey: string): ArmamentSlotValue[] =>
        config[heroKey] ?? emptySlots(), [config]);

    /** 设置某英雄某槽位的武装（equipId 可为 null=卸下） */
    const setArmamentSlot = useCallback((heroKey: string, slot: number, equipId: ArmamentSlotValue) => {
        setConfig(prev => {
            const cur = prev[heroKey] ?? emptySlots();
            const next = [...cur];
            next[slot] = equipId;
            const updated = { ...prev, [heroKey]: next };
            StorageUtils.save(getStorageKey(), updated);
            return updated;
        });
    }, []);

    /** 清空某英雄所有武装 */
    const clearArmament = useCallback((heroKey: string) => {
        setConfig(prev => {
            const updated = { ...prev, [heroKey]: emptySlots() };
            StorageUtils.save(getStorageKey(), updated);
            return updated;
        });
    }, []);

    return { config, getArmament, setArmamentSlot, clearArmament };
};
