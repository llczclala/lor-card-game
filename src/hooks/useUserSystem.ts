import { useState, useEffect, useCallback } from 'react';
import { StorageUtils, STORAGE_KEYS } from '../utils/storageUtils';
import {
    DEFAULT_SETTINGS,
    FULL_COLLECTION,
    STARTER_COLLECTION,
    INITIAL_USER_DECKS,
    createInitialProfile,
    STARTER_DECK_LYFE,
    DEV_ADMIN_UID,       // [新增] 导入唯一标识
    DEV_ADMIN_PROFILE    // [新增] 导入名片模板
} from '../data/initialUserData';
import type { UserProfile, UserSettings, UserCollection, SavedDeck, UserSummary } from '../types';
import type { GachaResult } from '../logic/gachaLogic';

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
    const loadUserData = useCallback((targetUid: string, mode: 'full' | 'starter' = 'starter', forceRefresh = false) => {
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

        if (mode === 'full' || forceRefresh) {
            // 获取最新的全卡数据
            const fullData = FULL_COLLECTION;

            // 如果已有数据，我们做合并（保留原有货币，但覆盖卡牌列表）
            if (userCollection) {
                userCollection = {
                    ...userCollection,
                    // 强制覆盖卡牌列表，确保新卡加入
                    ownedCards: { ...fullData.ownedCards },
                    // 资源取最大值（防止测试用的钱被花光后回不去）
                    resources: {
                        silverCoin: Math.max(userCollection.resources.silverCoin, fullData.resources.silverCoin),
                        dataGold: Math.max(userCollection.resources.dataGold, fullData.resources.dataGold),
                        bitGold: Math.max(userCollection.resources.bitGold, fullData.resources.bitGold),
                    }
                };
            } else {
                userCollection = fullData;
            }
            // 立即保存更新后的全卡数据
            StorageUtils.save(collectionKey, userCollection);
        }
        // 普通新手模式初始化
        else if (!userCollection) {
            userCollection = STARTER_COLLECTION;
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
        // ==========================================
        // [新增] 阶段二：开发专属 VIP 自动复苏 (Auto-Injection)
        // 注意：被 import.meta.env.DEV 包裹的代码，在 npm run dist 打包时会被 Tree-Shaking 物理抹除！
        // ==========================================
        if (import.meta.env.DEV) {
            const list = StorageUtils.getUserIndex();
            const adminExists = list.some(u => u.uid === DEV_ADMIN_UID);

            // 如果缓存被清空，导致找不到管理员账号，立刻触发静默建号
            if (!adminExists) {
                console.warn("[Dev System] 管理员账号丢失，正在执行自动复苏协议...");

                // 1. 强制写入管理员名片
                StorageUtils.save(`${STORAGE_KEYS.USER_PROFILE}_${DEV_ADMIN_UID}`, DEV_ADMIN_PROFILE);
                // 2. 强制写入全卡全满的资产包 (设置和卡组会通过 loadUserData 的兜底逻辑自动生成)
                StorageUtils.save(`${STORAGE_KEYS.USER_ASSETS}_${DEV_ADMIN_UID}`, FULL_COLLECTION);

                // 3. 强行将管理员注册回全局用户列表
                StorageUtils.updateUserIndex({
                    uid: DEV_ADMIN_UID,
                    displayName: DEV_ADMIN_PROFILE.displayName,
                    avatarId: DEV_ADMIN_PROFILE.avatarId,
                    lastLoginAt: Date.now(),
                    type: 'full'
                });
            }
        }

        const currentId = StorageUtils.getOrCreateUserId();
        // 如果 ID 包含 dev_full 或者是全卡档，标记 mode
        const list = StorageUtils.getUserIndex();
        const exist = list.find(u => u.uid === currentId);
        // [微调] 兼容我们新定义的 DEV_ADMIN_UID
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

    // --- [新增] 更新玩家基础档案 (昵称/头像) ---
    const updateProfile = useCallback((newProfileData: Partial<UserProfile>) => {
        if (!userId) return;
        setProfile(prev => {
            if (!prev) return null;
            const merged = { ...prev, ...newProfileData };
            StorageUtils.save(`${STORAGE_KEYS.USER_PROFILE}_${userId}`, merged);

            // [同步] 如果修改了名字，需要同步更新全局列表索引
            if (newProfileData.displayName) {
                const list = StorageUtils.getUserIndex();
                const userIndex = list.find(u => u.uid === userId);
                StorageUtils.updateUserIndex({
                    uid: userId,
                    displayName: merged.displayName,
                    avatarId: merged.avatarId,
                    lastLoginAt: merged.lastLoginAt,
                    type: userIndex?.type || 'starter'
                });
                setUserList(StorageUtils.getUserIndex());
            }
            return merged;
        });
    }, [userId]);

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
            // 处理解锁数组的合并
            if (newSettings.unlockedCardBacks) {
                merged.unlockedCardBacks = newSettings.unlockedCardBacks;
            }
            if (newSettings.unlockedDesks) {
                merged.unlockedDesks = newSettings.unlockedDesks;
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

    // [新增] 购买卡牌逻辑
    const purchaseCard = (cardKey: string, count: number, totalCost: number): boolean => {
        if (!collection) return false;

        // 1. 检查余额
        if (collection.resources.silverCoin < totalCost) {
            alert("通用银不足！(Insufficient Silver Coins)");
            return false;
        }

        // 2. 更新状态
        setCollection(prev => {
            if (!prev) return null;
            const newResources = {
                ...prev.resources,
                silverCoin: prev.resources.silverCoin - totalCost
            };
            const newOwned = {
                ...prev.ownedCards,
                [cardKey]: (prev.ownedCards[cardKey] || 0) + count
            };

            const newCollection = { ...prev, resources: newResources, ownedCards: newOwned };

            // 3. 持久化保存
            // 确保 userId 是当前的有效 ID (这里使用闭包中的 userId)
            const assetsKey = `${STORAGE_KEYS.USER_ASSETS}_${userId}`;
            StorageUtils.save(assetsKey, newCollection);

            return newCollection;
        });

        return true;
    };

    // --- [核心新增] 执行抽卡交易 (发货逻辑) ---
    const performGacha = useCallback((totalCost: number, results: GachaResult[], newPity: number) => {
        if (!collection || !profile || !settings) return;

        // 深拷贝现有状态，准备修改
        const newCollection = { ...collection };
        const newProfile = { ...profile, pityCounter: newPity };
        const newSettings = { ...settings };

        // 1. 扣除数据金
        newCollection.resources.dataGold -= totalCost;

        // 2. 发放奖励
        results.forEach(res => {
            if (res.convertedCurrency) {
                // 如果是重复转化
                if (res.convertedCurrency.type === 'silverCoin') {
                    newCollection.resources.silverCoin += res.convertedCurrency.amount;
                } else {
                    newCollection.resources.bitGold += res.convertedCurrency.amount;
                }
            } else {
                // 如果是新物品
                if (res.type === 'card') {
                    const key = res.key as string;
                    newCollection.ownedCards[key] = (newCollection.ownedCards[key] || 0) + 1;
                } else if (res.type === 'cardBack') {
                    // 解锁卡背
                    const idx = res.key as number;
                    if (!newSettings.unlockedCardBacks.includes(idx)) {
                        newSettings.unlockedCardBacks = [...newSettings.unlockedCardBacks, idx];
                    }
                } else if (res.type === 'desk') {
                    // 解锁牌桌
                    const idx = res.key as number;
                    if (!newSettings.unlockedDesks.includes(idx)) {
                        newSettings.unlockedDesks = [...newSettings.unlockedDesks, idx];
                    }
                }
            }
        });

        // 3. 统一更新状态并持久化
        setCollection(newCollection);
        setProfile(newProfile);
        setSettings(newSettings);

        StorageUtils.save(`${STORAGE_KEYS.USER_ASSETS}_${userId}`, newCollection);
        StorageUtils.save(`${STORAGE_KEYS.USER_PROFILE}_${userId}`, newProfile);
        StorageUtils.save(`${STORAGE_KEYS.USER_SETTINGS}_${userId}`, newSettings);

    }, [collection, profile, settings, userId]);

    // --- [核心新增] 设置抽卡定轨 ---
    const setGachaTarget = useCallback((target: string) => {
        if (!profile) return;
        const newProfile = { ...profile, gachaTarget: target };
        setProfile(newProfile);
        StorageUtils.save(`${STORAGE_KEYS.USER_PROFILE}_${userId}`, newProfile);
    }, [profile, userId]);



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
        updateProfile, // [新增] 暴露更新名片的方法

        purchaseCard,
        switchUserMode, // [新增] 导出切换函数
        createNewUser,
        deleteUser,
        switchUser,
        debugSwitchUser,

        // Gacha Actions
        performGacha,   // [新增]
        setGachaTarget, // [新增]

        // Helpers
        setCardBack: (index: number) => updateSettings({ customization: { ...settings.customization, currentCardBackIndex: index } }),
        setDesk: (index: number) => updateSettings({ customization: { ...settings.customization, currentDeskIndex: index } }),
    }as any;
};