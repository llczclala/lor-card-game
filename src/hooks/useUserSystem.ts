import { useState, useEffect, useCallback } from 'react';
import { StorageUtils, STORAGE_KEYS } from '../utils/storageUtils';
import {
    DEFAULT_SETTINGS,
    FULL_COLLECTION,
    STARTER_COLLECTION,
    INITIAL_USER_DECKS,
    createInitialProfile,
    STARTER_DECK_LYFE
} from '../data/initialUserData';
import type { UserProfile, UserSettings, UserCollection, SavedDeck, UserSummary } from '../types';

export interface UserSystemState {
    userId: string;
    profile: UserProfile | null;
    settings: UserSettings;
    collection: UserCollection | null;
    decks: SavedDeck[];
    activeDeckId: string | null;
    isReady: boolean;
}

export const useUserSystem = () => {
    // --- 1. 核心状态 ---
    const [userId, setUserId] = useState<string>('');
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
    const [collection, setCollection] = useState<UserCollection | null>(null);
    const [decks, setDecks] = useState<SavedDeck[]>([]);
    const [activeDeckId, setActiveDeckId] = useState<string | null>(null);
    const [isReady, setIsReady] = useState(false);

    // [新增] 用户列表状态
    const [userList, setUserList] = useState<UserSummary[]>([]);

    // --- 2. 初始化 / 切换用户逻辑 ---
    const loadUserData = useCallback((targetUid: string, mode: 'full' | 'starter' = 'starter') => {
        setIsReady(false);

        // 1. 档案 (Profile)
        const profileKey = `${STORAGE_KEYS.USER_PROFILE}_${targetUid}`;
        let userProfile = StorageUtils.load<UserProfile | null>(profileKey, null);

        if (!userProfile) {
            userProfile = createInitialProfile(targetUid);
            StorageUtils.save(profileKey, userProfile);
        }
        setProfile(userProfile);

        // [新增] 更新全局用户索引
        StorageUtils.updateUserIndex({
            uid: targetUid,
            displayName: userProfile.displayName,
            avatarId: userProfile.avatarId,
            lastLoginAt: Date.now(),
            type: mode
        });
        setUserList(StorageUtils.getUserIndex()); // 刷新列表状态

        // 2. 设置 (Settings)
        const settingsKey = `${STORAGE_KEYS.USER_SETTINGS}_${targetUid}`;
        const userSettings = StorageUtils.load(settingsKey, DEFAULT_SETTINGS);
        setSettings(userSettings);

        // 3. 收藏 (Collection)
        const collectionKey = `${STORAGE_KEYS.USER_ASSETS}_${targetUid}`;
        let userCollection = StorageUtils.load<UserCollection | null>(collectionKey, null);

        if (!userCollection) {
            userCollection = mode === 'full' ? FULL_COLLECTION : STARTER_COLLECTION;
            StorageUtils.save(collectionKey, userCollection);
        }
        setCollection(userCollection);

        // 4. 卡组 (Decks)
        const decksKey = `${STORAGE_KEYS.USER_DECKS}_${targetUid}`;
        let userDecks = StorageUtils.load<SavedDeck[] | null>(decksKey, null);

        if (!userDecks || userDecks.length === 0) {
            userDecks = INITIAL_USER_DECKS;
            StorageUtils.save(decksKey, userDecks);
        }
        setDecks(userDecks);

        // 5. 选中卡组
        if (userDecks.length > 0) {
            setActiveDeckId(userDecks[0].id);
        }

        setUserId(targetUid);
        localStorage.setItem(STORAGE_KEYS.USER_ID, targetUid);

        // 模拟一点点延迟，让 Loading 动画能展示出来
        setTimeout(() => setIsReady(true), 500);

        console.log(`[UserSystem] Loaded user: ${targetUid} (${mode})`);
    }, []);

    // --- 3. 启动时自动登录 ---
    useEffect(() => {
        const currentId = StorageUtils.getOrCreateUserId();
        // 如果 ID 包含 dev_full 或者是全卡档，标记 mode
        const list = StorageUtils.getUserIndex();
        const exist = list.find(u => u.uid === currentId);
        const mode = (exist?.type === 'full' || currentId.includes('dev_full')) ? 'full' : 'starter';

        loadUserData(currentId, mode);
        setUserList(StorageUtils.getUserIndex());
    }, [loadUserData]);

    // [新增] 创建新用户
    const createNewUser = (name: string) => {
        const newId = `guest_${StorageUtils.generateUUID()}`;
        // 先创建 Profile 以便写入自定义名字
        const newProfile = createInitialProfile(newId);
        newProfile.displayName = name; // 使用自定义名字
        StorageUtils.save(`${STORAGE_KEYS.USER_PROFILE}_${newId}`, newProfile);

        // 加载它 (默认 starter 模式)
        loadUserData(newId, 'starter');
    };

    // [新增] 删除用户
    const deleteUser = (targetUid: string) => {
        // 从索引移除
        StorageUtils.removeUserFromIndex(targetUid);
        // 清理数据 (可选，为了节省空间最好清理)
        StorageUtils.remove(`${STORAGE_KEYS.USER_PROFILE}_${targetUid}`);
        StorageUtils.remove(`${STORAGE_KEYS.USER_ASSETS}_${targetUid}`);
        StorageUtils.remove(`${STORAGE_KEYS.USER_DECKS}_${targetUid}`);
        StorageUtils.remove(`${STORAGE_KEYS.USER_SETTINGS}_${targetUid}`);

        // 刷新列表
        setUserList(StorageUtils.getUserIndex());

        // 如果删的是当前用户，且列表不为空，切到第一个；否则新建一个
        if (targetUid === userId) {
            const list = StorageUtils.getUserIndex();
            if (list.length > 0) {
                loadUserData(list[0].uid, list[0].type);
            } else {
                window.location.reload(); // 没用户了，刷新重开
            }
        }
    };

    // [新增] 切换用户 (仅逻辑，不刷新页面)
    const switchUser = (targetUid: string) => {
        const list = StorageUtils.getUserIndex();
        const user = list.find(u => u.uid === targetUid);
        if (user) {
            loadUserData(targetUid, user.type);
        }
    };

    // 原来的 debugSwitchUser 保留用于快速创建测试号
    const debugSwitchUser = (mode: 'full' | 'starter') => {
        const newId = mode === 'full' ? 'dev_full_admin' : `guest_${Date.now()}`;
        // 给测试号起个特殊名字
        const profile = createInitialProfile(newId);
        profile.displayName = mode === 'full' ? 'DEVELOPER' : `GUEST-${Date.now().toString().slice(-4)}`;
        StorageUtils.save(`${STORAGE_KEYS.USER_PROFILE}_${newId}`, profile);

        loadUserData(newId, mode); // 全卡档强制刷新资产
    };


    // --- 4. 业务操作方法 ---
    const saveDeck = (deckToSave: SavedDeck) => {
        if (!userId) return;
        setDecks(prev => {
            const index = prev.findIndex(d => d.id === deckToSave.id);
            let newDecks;
            if (index >= 0) {
                newDecks = [...prev];
                newDecks[index] = { ...deckToSave, updatedAt: Date.now() };
            } else {
                newDecks = [...prev, { ...deckToSave, createdAt: Date.now(), updatedAt: Date.now() }];
            }
            StorageUtils.save(`${STORAGE_KEYS.USER_DECKS}_${userId}`, newDecks);
            return newDecks;
        });
    };

    const deleteDeck = (deckId: string) => {
        if (!userId) return;
        setDecks(prev => {
            const newDecks = prev.filter(d => d.id !== deckId);
            StorageUtils.save(`${STORAGE_KEYS.USER_DECKS}_${userId}`, newDecks);
            return newDecks;
        });
        if (activeDeckId === deckId) {
            setActiveDeckId(null);
        }
    };

    const selectDeck = (deckId: string) => {
        setActiveDeckId(deckId);
    };

    const updateSettings = (newSettings: Partial<UserSettings>) => {
        if (!userId) return;
        setSettings(prev => {
            const merged = { ...prev, ...newSettings };
            if (newSettings.customization) {
                merged.customization = { ...prev.customization, ...newSettings.customization };
            }
            if (newSettings.volume) {
                merged.volume = { ...prev.volume, ...newSettings.volume };
            }
            StorageUtils.save(`${STORAGE_KEYS.USER_SETTINGS}_${userId}`, merged);
            return merged;
        });
    };

    // [核心修改] 切换档案模式
    const switchUserMode = (mode: 'full' | 'starter') => {
        const newId = mode === 'full' ? 'dev_full_admin' : `guest_${StorageUtils.generateUUID()}`; // 如果切回 guest，生成一个新的 ID

        // 如果想保留原来的 guest，可以从 storageUtils 读 logic，这里简单处理
        // 为了方便测试，我们固定 guest 模式切回 dev，dev 切回 guest 时重置

        localStorage.setItem(STORAGE_KEYS.USER_ID, newId);
        // 强制刷新页面以应用
        window.location.reload();
    };


    // 暴露给全局以便调试
    useEffect(() => {
        (window as any).debugSwitchUser = switchUserMode;
    }, []);

    // --- 5. 导出 ---
    return {
        // State
        userId,
        profile,
        settings,
        collection,
        decks,
        activeDeckId,
        activeDeck: decks.find(d => d.id === activeDeckId) || (decks.length > 0 ? decks[0] : STARTER_DECK_LYFE), // 兜底
        isReady,
        userList, // [新增]

        // Actions
        saveDeck,
        deleteDeck,
        selectDeck,
        updateSettings,

        switchUserMode, // [新增] 导出切换函数
        createNewUser,
        deleteUser,
        switchUser,
        debugSwitchUser,

        // Helpers
        setCardBack: (index: number) => updateSettings({ customization: { ...settings.customization, currentCardBackIndex: index } }),
        setDesk: (index: number) => updateSettings({ customization: { ...settings.customization, currentDeskIndex: index } }),
    }as any;
};