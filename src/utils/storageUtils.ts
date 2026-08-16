
import { DEV_ADMIN_UID } from '../data/initialUserData'; // [新增] 导入管理员绝对标识

const STORAGE_PREFIX = 'snowbreak_rivals_';

// 存档键名枚举
export const STORAGE_KEYS = {
    USER_ID: `${STORAGE_PREFIX}user_id`,
    USER_PROFILE: `${STORAGE_PREFIX}profile`,
    USER_ASSETS: `${STORAGE_PREFIX}assets`,
    USER_DECKS: `${STORAGE_PREFIX}decks`,
    USER_SETTINGS: `${STORAGE_PREFIX}settings`,
    USER_INDEX: `${STORAGE_PREFIX}user_index`,
    ROGUE_HERO_PROGRESS: `${STORAGE_PREFIX}rogue_hero_progress`, // [2026-08-12 天启者养成] 每英雄独立等级/经验
    ROGUE_ARMAMENT: `${STORAGE_PREFIX}rogue_armament`, // [2026-08-14 武装] 每英雄武装槽配置（局外带入）
};

// [新增] 简要用户信息接口 (用于列表展示)
export interface UserSummary {
    uid: string;
    displayName: string;
    avatarId: string;
    lastLoginAt: number;
    type: 'starter' | 'full'; // 标记账户类型
}

const generateUUID = (): string => {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
};

/**
 * 泛型存储工具类
 */
export const StorageUtils = {

    generateUUID,

    save: <T>(key: string, data: T): boolean => {
        try {
            const serialized = JSON.stringify(data);
            localStorage.setItem(key, serialized);
            return true;
        } catch (error) {
            console.error(`[Storage] Save failed for key "${key}":`, error);
            return false;
        }
    },


    load: <T>(key: string, defaultValue: T): T => {
        try {
            const serialized = localStorage.getItem(key);
            if (serialized === null) {
                return defaultValue;
            }
            return JSON.parse(serialized) as T;
        } catch (error) {
            console.warn(`[Storage] Load failed for key "${key}", using default.`, error);
            return defaultValue;
        }
    },
    has: (key: string): boolean => {
        return localStorage.getItem(key) !== null;
    },

    remove: (key: string) => {
        localStorage.removeItem(key);
    },

    getOrCreateUserId: (): string => {
        let uid = localStorage.getItem(STORAGE_KEYS.USER_ID);
        if (!uid) {
            // [核心修复] 大门安检：根据编译环境智能下发身份
            if (import.meta.env.DEV) {
                // 如果是开发环境 (npm run dev)，直接为您下发管理员特权 ID
                uid = DEV_ADMIN_UID;
            } else {
                // 如果是生产环境 (npm run dist)，摇树优化会干掉上面的 if，只留下游客生成逻辑
                uid = `guest_${StorageUtils.generateUUID()}`;
            }
            localStorage.setItem(STORAGE_KEYS.USER_ID, uid);
        }
        return uid;
    },
    // [新增] 获取所有用户列表
    getUserIndex: (): UserSummary[] => {
        try {
            const serialized = localStorage.getItem(STORAGE_KEYS.USER_INDEX);
            if (!serialized) return [];
            return JSON.parse(serialized) as UserSummary[];
        } catch (e) { return []; }
    },

    // [新增] 更新用户列表 (添加或更新)
    updateUserIndex: (user: UserSummary) => {
        const list = StorageUtils.getUserIndex();
        const index = list.findIndex(u => u.uid === user.uid);
        if (index >= 0) {
            list[index] = user; // 更新
        } else {
            list.push(user); // 新增
        }
        localStorage.setItem(STORAGE_KEYS.USER_INDEX, JSON.stringify(list));
    },

    // [新增] 从列表中移除用户
    removeUserFromIndex: (uid: string) => {
        const list = StorageUtils.getUserIndex();
        const newList = list.filter(u => u.uid !== uid);
        localStorage.setItem(STORAGE_KEYS.USER_INDEX, JSON.stringify(newList));
    }
};

export { generateUUID };