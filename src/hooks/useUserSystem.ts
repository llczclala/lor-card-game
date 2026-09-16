import { useState, useEffect, useCallback } from 'react';
import { StorageUtils, STORAGE_KEYS } from '../utils/storageUtils';
import {
    DEFAULT_SETTINGS,
    FULL_SETTINGS,  // [皮肤] 全卡档设置
    FULL_COLLECTION,
    STARTER_COLLECTION,
    INITIAL_USER_DECKS,
    createInitialProfile,
    STARTER_DECK_LYFE,
    DEV_ADMIN_UID,       // [新增] 导入唯一标识
    DEV_ADMIN_PROFILE    // [新增] 导入名片模板
} from '../data/initialUserData';
import type { UserProfile, UserSettings, UserCollection, SavedDeck, UserSummary, AnalystPassData, BattleMode, UserBattleRecord } from '../types';
import type { GachaResult } from '../logic/gachaLogic';
import type { MissionDef } from '../data/missionData';
import { getMissionItems } from '../data/skinData'; // [新增] 引入外观调度局，用于任务奖励发货
import { reloadHeroProgressionCache } from './useHeroProgression'; // [2026-09-04 莉莉子 修复] 切号后重载英雄养成缓存（模块级缓存不会自动跟随 USER_ID）
import { reloadArmamentCache } from './useArmamentConfig'; // [2026-09-07] 切号后重载武装槽/品质档缓存
import { computeAnalystLevels, ANALYST_LEVEL_REWARDS, type AnalystLevelupReward } from '../data/roguelike/analystProgression'; // [2026-08-29 通行证] 分析员升级
import { computeAccountLevels, ACCOUNT_LEVEL_REWARD_DATA_GOLD, createAnalystPass, createEmptyBattleRecord } from '../data/accountProgression'; // [2026-09-04 账号等级]
import { getArmamentDefs } from '../data/equipment'; // [2026-08-29 通行证] 卡包随机武装
import { readArmStock, addArmStock, consumeArmStock, type ArmStockMap } from '../data/roguelike/armamentStock'; // [2026-09-07] 武装数量库存

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
    // [2026-09-04 账号等级] 评估嘉勉通行证独立存档（profile.level/exp 已正名账号等级）
    const [analystPass, setAnalystPass] = useState<AnalystPassData>({ level: 1, exp: 0 });
    // [2026-09-04 战绩记录器] 持久对战记录（档案面板真战绩）
    const [battleRecord, setBattleRecord] = useState<UserBattleRecord | null>(null);
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

        // [2026-09-04 账号等级·评估嘉勉迁移] profile.level/exp 正名为"账号等级"；
        // 老账号该字段里存的其实是评估嘉勉通行证等级 → 一次性迁到独立键。
        // 幂等守卫 = pass 键已存在（存在即视为已迁移，绝不再读老 profile / 绝不二次重置）。
        // 红线：不丢老进度、不删任何键、只在首次迁移时把账号等级重置回 1。
        const passKey = `${STORAGE_KEYS.ANALYST_PASS}_${targetUid}`;
        let passData = StorageUtils.load<AnalystPassData | null>(passKey, null);
        let passMigratedNow = false;
        if (!passData) {
            const legacyLevel = userProfile.level ?? 1;
            const legacyExp = userProfile.exp ?? 0;
            const hasLegacy = legacyLevel > 1 || legacyExp > 0;
            passData = hasLegacy ? { level: legacyLevel, exp: legacyExp } : createAnalystPass();
            StorageUtils.save(passKey, passData); // 老通行证进度落独立键（不丢）
            if (hasLegacy) {
                userProfile = { ...userProfile, level: 1, exp: 0 }; // 账号等级从 1 起步
                StorageUtils.save(profileKey, userProfile);
            }
            passMigratedNow = true;
        }
        // DEV 便利：管理员号首迁移后账号等级给高起点（便于测试高等级面板；只在该分支内执行，天然幂等）
        if (passMigratedNow && targetUid === DEV_ADMIN_UID && (userProfile.level || 1) < 30) {
            userProfile = { ...userProfile, level: 30, exp: 0 };
            StorageUtils.save(profileKey, userProfile);
        }
        setAnalystPass(passData);
        setProfile(userProfile);

        // [2026-09-04 战绩记录器] 读本账号持久战绩
        setBattleRecord(StorageUtils.load<UserBattleRecord | null>(`${STORAGE_KEYS.USER_BATTLE_RECORD}_${targetUid}`, null));

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
        // [皮肤] 全卡档使用 FULL_SETTINGS（解锁全部装饰），否则使用 DEFAULT_SETTINGS
        const defaultSettings = mode === 'full' ? FULL_SETTINGS : DEFAULT_SETTINGS;
        let userSettings = StorageUtils.load(settingsKey, defaultSettings);
        // [皮肤] 全卡档强制覆盖解锁列表（兼容已有存档）
        if (mode === 'full') {
            userSettings = {
                ...userSettings,
                unlockedCardBacks: FULL_SETTINGS.unlockedCardBacks,
                unlockedDesks: FULL_SETTINGS.unlockedDesks,
            };
        }
        // [2026-09-07 真数量库存] 武装库存一次性迁移 → settings.armamentStock（权威），ownedArmaments 降级为种类名（兼容旧读取）
        // 计法：起始 1 把英雄应援装（现名「香蒲的白兔应援」，原「盈实徽记」）+ 旧档武装槽里每格各计 1 份（此前可跨英雄重复装）+ 旧 ownedArmaments 至少 1
        if (!userSettings.armamentStock) {
            const armKey = `${STORAGE_KEYS.ROGUE_ARMAMENT}_${targetUid}`;
            const armConfig = StorageUtils.load<Record<string, (string | null)[]>>(armKey, {});
            const stock: Record<string, number> = { arm_power_health: 1 }; // 起始集：香蒲的白兔应援（原「盈实徽记」）
            const bump = (id: string) => { stock[id] = Math.max(stock[id] ?? 0, 0) + 1; };
            Object.values(armConfig).forEach(slots => (slots ?? []).forEach(id => { if (id) bump(id); }));
            (userSettings.ownedArmaments ?? []).forEach(id => { if (id) stock[id] = Math.max(stock[id] ?? 0, 1); });
            const kinds = Object.keys(stock).filter(id => (stock[id] ?? 0) > 0);
            userSettings = { ...userSettings, armamentStock: stock, ownedArmaments: kinds };
            StorageUtils.save(settingsKey, userSettings);
        }
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
                    // [皮肤] 全卡模式：强制覆盖全皮肤（兼容旧存档）
                    ownedSkins: { ...fullData.ownedSkins },
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
        // [2026-09-04 莉莉子 修复] 切号后同步英雄养成缓存（顺序必须在写入新 USER_ID 之后）
        reloadHeroProgressionCache();
        reloadArmamentCache(); // [2026-09-07] 切号后同步武装槽配置/品质档缓存（同理由：模块级 shared 不自动跟随 USER_ID）

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
        // [2026-09-04 账号等级] 删号一并清理通行证独立存档与战绩（防重建同 uid 残留）
        StorageUtils.remove(`${STORAGE_KEYS.ANALYST_PASS}_${targetUid}`);
        StorageUtils.remove(`${STORAGE_KEYS.USER_BATTLE_RECORD}_${targetUid}`);

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

    // [2026-08-16 莉莉子] 恢复默认设置：一键重置所有设置到 DEFAULT_SETTINGS（设置面板「系统」标签页入口）
    // [2026-08-16] DEFAULT_SETTINGS 已加 :UserSettings 注解，去掉此前 as any 类型债兜底
    const resetSettings = () => {
        if (!userId) return;
        setSettings({ ...DEFAULT_SETTINGS });
        StorageUtils.save(`${STORAGE_KEYS.USER_SETTINGS}_${userId}`, { ...DEFAULT_SETTINGS });
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
    // --- [核心新增] 比特金购买逻辑 (涵盖英雄、皮肤、饰品) ---
    const purchaseBitGoldItem = useCallback((
        type: 'hero' | 'skin' | 'cardBack' | 'desk',
        key: string | number,
        skinId: number | undefined,
        cost: number
    ): boolean => {
        if (!collection || !settings) return false;

        // 1. 检查余额
        if (collection.resources.bitGold < cost) {
            alert("比特金不足！(Insufficient Bit Gold)");
            return false;
        }

        // 准备更新的数据副本
        const newCollection = { ...collection };
        const newSettings = { ...settings };
        let success = false;

        // 2 & 4. 检查持有上限与发货
        if (type === 'hero') {
            const cardKey = key as string;
            const currentCount = newCollection.ownedCards[cardKey] || 0;
            if (currentCount >= 3) {
                alert("该英雄已达到满编上限！");
                return false;
            }
            newCollection.ownedCards[cardKey] = currentCount + 1;
            success = true;
        } else if (type === 'skin') {
            const cardKey = key as string;
            const currentSkins = newCollection.ownedSkins[cardKey] || [];
            if (skinId !== undefined && !currentSkins.includes(skinId)) {
                newCollection.ownedSkins[cardKey] = [...currentSkins, skinId];
                success = true;
            } else {
                alert("已经拥有该皮肤！");
                return false;
            }
        } else if (type === 'cardBack') {
            const idx = key as number;
            if (!newSettings.unlockedCardBacks.includes(idx)) {
                newSettings.unlockedCardBacks = [...newSettings.unlockedCardBacks, idx];
                success = true;
            } else {
                alert("已经拥有该卡背！");
                return false;
            }
        } else if (type === 'desk') {
            const idx = key as number;
            if (!newSettings.unlockedDesks.includes(idx)) {
                newSettings.unlockedDesks = [...newSettings.unlockedDesks, idx];
                success = true;
            } else {
                alert("已经拥有该牌桌！");
                return false;
            }
        }

        if (success) {
            // 3. 扣除比特金
            newCollection.resources.bitGold -= cost;

            // 5. 更新状态与持久化保存
            setCollection(newCollection);
            setSettings(newSettings);
            StorageUtils.save(`${STORAGE_KEYS.USER_ASSETS}_${userId}`, newCollection);
            StorageUtils.save(`${STORAGE_KEYS.USER_SETTINGS}_${userId}`, newSettings);
            return true;
        }

        return false;
    }, [collection, settings, userId]);

    // --- [核心新增] 执行抽卡交易 (发货逻辑) ---
    // [核心修复] 补齐 newSkinPity 参数
    // [核心修复] 多池子独立保底：接收 poolId，写入池子专属的保底 key
    const performGacha = useCallback((totalCost: number, results: GachaResult[], newPity: number, newSkinPity: number, poolId?: string) => {
        if (!collection || !profile || !settings) return;

        // 深拷贝现有状态，准备修改
        const newProfile = { ...profile };
        // [核心修复] 按池子写入独立保底计数器
        if (poolId) {
            (newProfile as any)[`pityCounter_${poolId}`] = newPity;
            (newProfile as any)[`skinPityCounter_${poolId}`] = newSkinPity;
        } else {
            // 向后兼容：无 poolId 时写入旧 key（常驻池）
            (newProfile as any).pityCounter = newPity;
            (newProfile as any).skinPityCounter = newSkinPity;
        }
        const newCollection = { ...collection };
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
                } else if (res.type === 'skin') {
                    // [核心新增] 解锁皮肤：将 skinId 推入该卡牌专属的拥有皮肤数组中
                    const key = res.key as string;
                    const sid = res.skinId;
                    if (sid !== undefined) {
                        const currentSkins = newCollection.ownedSkins[key] || [];
                        if (!currentSkins.includes(sid)) {
                            newCollection.ownedSkins[key] = [...currentSkins, sid];
                        }
                    }
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
    // [核心修复] 多池子独立定轨：接收 poolId
    const setGachaTarget = useCallback((target: string, poolId?: string) => {
        if (!profile) return;
        const newProfile = { ...profile };
        if (poolId) {
            (newProfile as any)[`gachaTarget_${poolId}`] = target;
        } else {
            (newProfile as any).gachaTarget = target;
        }
        setProfile(newProfile);
        StorageUtils.save(`${STORAGE_KEYS.USER_PROFILE}_${userId}`, newProfile);
    }, [profile, userId]);

    // ==========================================
    // [军需系统专属接口] 任务奖励提货通道
    // 支持新皮肤解锁、重复皮肤自动转为 1 比特金、卡背解锁
    // ==========================================
    /** [2026-08-29 评估嘉勉] 解锁一个武装（加入已拥有集合，武装库按此过滤） */
    // [2026-09-07 真数量库存] 发放/消耗统一维护 armamentStock（普通封顶3/消耗品不限）；ownedArmaments 同步为种类名（stock>0）
    const applyArmStock = useCallback((prev: UserSettings, id: string, fn: (s: ArmStockMap) => ArmStockMap | null): UserSettings | null => {
        if (!id) return null;
        const stock = readArmStock(prev);
        const nextStock = fn(stock);
        if (!nextStock) return null;
        const kinds = Object.keys(nextStock).filter(k => (nextStock[k] ?? 0) > 0);
        return { ...prev, armamentStock: nextStock, ownedArmaments: kinds };
    }, []);

    /** [2026-08-29 评估嘉勉] 发放武装库存（amount 份；普通武装单种上限 3，消耗品不限） */
    const grantArmament = useCallback((armamentId: string, amount = 1) => {
        if (!armamentId) return;
        setSettings(prev => {
            if (!prev) return prev;
            const updated = applyArmStock(prev, armamentId, s => addArmStock(s, armamentId, amount));
            if (!updated) return prev;
            StorageUtils.save(`${STORAGE_KEYS.USER_SETTINGS}_${userId}`, updated);
            return updated;
        });
    }, [applyArmStock, userId]);

    /** [2026-09-07 消耗品武装] 用掉 amount 份（归零自动移除）；库存不足则不扣（防越界） */
    const removeOwnedArmament = useCallback((armamentId: string, amount = 1) => {
        if (!armamentId) return;
        setSettings(prev => {
            if (!prev) return prev;
            const updated = applyArmStock(prev, armamentId, s => consumeArmStock(s, armamentId, amount));
            if (!updated) return prev;
            StorageUtils.save(`${STORAGE_KEYS.USER_SETTINGS}_${userId}`, updated);
            return updated;
        });
    }, [applyArmStock, userId]);

    /** [2026-08-29 通行证] 解锁迷宫强化（进 passUnlockedEnhancements → 强化池可遇到） */
    const grantPassEnhancement = useCallback((enhancementId: string) => {
        if (!enhancementId) return;
        setSettings(prev => {
            if (!prev) return prev;
            const cur = prev.passUnlockedEnhancements ?? [];
            if (cur.includes(enhancementId)) return prev;
            const newSettings = { ...prev, passUnlockedEnhancements: [...cur, enhancementId] };
            StorageUtils.save(`${STORAGE_KEYS.USER_SETTINGS}_${userId}`, newSettings);
            return newSettings;
        });
    }, [userId]);

    /** [2026-08-29 通行证] 发放局外数据金（大厅货币） */
    const grantDataGold = useCallback((amount: number) => {
        if (!amount) return;
        setCollection(prev => {
            if (!prev) return prev;
            const newCollection = { ...prev, resources: { ...prev.resources, dataGold: (prev.resources.dataGold || 0) + amount } };
            StorageUtils.save(`${STORAGE_KEYS.USER_ASSETS}_${userId}`, newCollection);
            return newCollection;
        });
    }, [userId]);

    // ==========================================
    // [2026-09-04 账号等级系统] 账号经验 / 持久战绩
    // profile.level/exp = 账号等级（任何真实模式对局结束发经验）
    // ==========================================

    /** 加账号等级经验：连续升级则逐级发 320 数据金（跨级连升连发）。返回跨级清单供 UI 播报。 */
    const grantAccountExp = useCallback((amount: number): { leveled: { from: number; to: number }[] } => {
        if (!profile || !amount) return { leveled: [] };
        const res = computeAccountLevels(profile.level, profile.exp, amount);
        updateProfile({ level: res.level, exp: res.exp });
        if (res.leveled.length > 0) {
            res.leveled.forEach(() => grantDataGold(ACCOUNT_LEVEL_REWARD_DATA_GOLD));
        }
        return res;
    }, [profile, updateProfile, grantDataGold]);

    /** 持久战绩：真实对局结算时累计（PvE/教程/迷宫整局）。heroKeys 用于代表英雄统计。 */
    const recordBattle = useCallback((info: { won: boolean; mode: BattleMode; heroKeys?: string[] }) => {
        if (!userId) return;
        setBattleRecord(prev => {
            const cur = prev ?? createEmptyBattleRecord();
            const next: UserBattleRecord = {
                ...cur,
                totalMatches: cur.totalMatches + 1,
                wins: cur.wins + (info.won ? 1 : 0),
                losses: cur.losses + (info.won ? 0 : 1),
                updatedAt: Date.now(),
                byMode: {
                    ...cur.byMode,
                    [info.mode]: {
                        totalMatches: (cur.byMode?.[info.mode]?.totalMatches ?? 0) + 1,
                        wins: (cur.byMode?.[info.mode]?.wins ?? 0) + (info.won ? 1 : 0),
                    },
                },
                heroes: { ...cur.heroes },
            };
            (info.heroKeys ?? []).forEach(k => { if (k) next.heroes[k] = (next.heroes[k] ?? 0) + 1; });
            StorageUtils.save(`${STORAGE_KEYS.USER_BATTLE_RECORD}_${userId}`, next);
            return next;
        });
    }, [userId]);

    /** [2026-08-29 通行证] 打开卡包：随机获得一个武装（丰富武装获取渠道）
     *  [2026-09-07 程拍板] 消耗品武装（碳原子板/重修申请）不再从卡包开出 → 池子排除 consumable（改由每日推演任务供给） */
    const grantPack = useCallback((): string | null => {
        const armaments = getArmamentDefs().filter(a => !a.consumable);
        if (armaments.length === 0) return null;
        const pick = armaments[Math.floor(Math.random() * armaments.length)];
        grantArmament(pick.id);
        return pick.id;
    }, [grantArmament]);

    /** [2026-08-29 通行证] 获得一个待打开卡包（打开时才随机武装） */
    const grantPendingPack = useCallback(() => {
        setSettings(prev => {
            if (!prev) return prev;
            const newSettings = { ...prev, pendingPacks: (prev.pendingPacks ?? 0) + 1 };
            StorageUtils.save(`${STORAGE_KEYS.USER_SETTINGS}_${userId}`, newSettings);
            return newSettings;
        });
    }, [userId]);

    /** [2026-08-29 通行证] 打开一个卡包：随机武装 + 扣减待打开数 */
    const openPack = useCallback((): string | null => {
        const pick = grantPack();
        if (pick) {
            // [2026-09-15 莉莉子 BUG修复] 必须用**函数式**更新，且不能再用闭包 settings 整体覆盖。
            // 成因：grantPack() 内部已通过 grantArmament 排队了一个函数式 setSettings（写入新武装库存），
            // 此处若紧接着塞一个「值更新」，React 批处理时会用它**直接替换**掉前一个函数式更新的计算结果
            // —— armamentStock 回到旧值 → 表现为「卡包开出的武装没入库、武装配置界面完全找不到」
            // （武装库按 armamentStock 过滤，见 RogueHeroInfoModal.readArmStock）。
            // 同一坑在 claimPassReward 里已用函数式累积规避，此处是漏网。
            setSettings(prev => {
                if (!prev || (prev.pendingPacks ?? 0) <= 0) return prev;
                const newSettings = { ...prev, pendingPacks: (prev.pendingPacks ?? 0) - 1 };
                StorageUtils.save(`${STORAGE_KEYS.USER_SETTINGS}_${userId}`, newSettings);
                return newSettings;
            });
        }
        return pick;
    }, [grantPack, userId]);

    /** [2026-09-04 账号等级] 加分析员经验 → 评估嘉勉通行证已迁独立存档键（ANALYST_PASS_uid），不再占 profile.level/exp（那是账号等级） */
    const grantAnalystExp = useCallback((amount: number): { leveled: { from: number; to: number }[]; rewards: AnalystLevelupReward[] } => {
        if (!amount) return { leveled: [], rewards: [] };
        const cur = analystPass ?? createAnalystPass();
        const res = computeAnalystLevels(cur.level, cur.exp, amount);
        const nextPass: AnalystPassData = { level: res.level, exp: res.exp };
        setAnalystPass(nextPass);
        StorageUtils.save(`${STORAGE_KEYS.ANALYST_PASS}_${userId}`, nextPass);
        return res;
    }, [analystPass, userId]);

    /** [2026-09-04 账号等级] 手动领取某等级通行证奖励（等级读 analystPass 独立键） */
    const claimPassReward = useCallback((level: number): boolean => {
        const reward = ANALYST_LEVEL_REWARDS[level];
        if (!reward || !analystPass || level > analystPass.level) return false;
        if (reward.armamentId) grantArmament(reward.armamentId);
        if (reward.pack) grantPendingPack(); // 卡包进待打开队列
        if (reward.unlockEnhancement) grantPassEnhancement(reward.unlockEnhancement);
        if (reward.dataGold) grantDataGold(reward.dataGold);
        // 标记已领取：函数式累积，避免一键领取多个奖励时互相覆盖
        setSettings(prev => {
            if (!prev) return prev;
            const cur = prev.passClaimedRewards ?? [];
            if (cur.includes(level)) return prev;
            const newSettings = { ...prev, passClaimedRewards: [...cur, level] };
            StorageUtils.save(`${STORAGE_KEYS.USER_SETTINGS}_${userId}`, newSettings);
            return newSettings;
        });
        return true;
    }, [analystPass, grantArmament, grantPendingPack, grantPassEnhancement, grantDataGold, userId]);

    /** [2026-09-04 账号等级] 一键领取当前通行证等级所有未领取奖励（上限读 analystPass） */
    const claimAllPassRewards = useCallback((): number => {
        if (!analystPass || !settings) return 0;
        let count = 0;
        for (let lv = 1; lv <= analystPass.level; lv++) {
            if (ANALYST_LEVEL_REWARDS[lv] && !(settings.passClaimedRewards ?? []).includes(lv)) {
                if (claimPassReward(lv)) count++;
            }
        }
        return count;
    }, [analystPass, settings, claimPassReward]);

    const grantMissionReward = useCallback((reward: MissionDef['reward']) => {
        if (!collection || !settings) return;

        const newCollection = { ...collection };
        const newSettings = { ...settings };
        let needsCollectionSave = false;
        let needsSettingsSave = false;

        if (reward.type === 'dataGold' && reward.amount) {
            newCollection.resources.dataGold += reward.amount;
            needsCollectionSave = true;
        }
        else if (reward.type === 'skin' && reward.cosmeticId) {
            const skinConfig = getMissionItems('skin').find(s => s.missionId === reward.cosmeticId);
            if (skinConfig && skinConfig.cardKey && skinConfig.skinId !== undefined) {
                const currentSkins = newCollection.ownedSkins[skinConfig.cardKey] || [];
                if (!currentSkins.includes(skinConfig.skinId)) {
                    // 新皮肤 — 直接解锁
                    newCollection.ownedSkins[skinConfig.cardKey] = [...currentSkins, skinConfig.skinId];
                } else {
                    // 重复皮肤 → 自动转为 1 比特金
                    newCollection.resources.bitGold += 1;
                }
                needsCollectionSave = true;
            }
        }
        else if (reward.type === 'cardBack' && reward.cosmeticId) {
            const cbConfig = getMissionItems('cardBack').find(s => s.missionId === reward.cosmeticId);
            if (cbConfig && cbConfig.index !== undefined) {
                if (!newSettings.unlockedCardBacks.includes(cbConfig.index)) {
                    newSettings.unlockedCardBacks = [...newSettings.unlockedCardBacks, cbConfig.index];
                    needsSettingsSave = true;
                }
                // 重复卡背暂不转换
            }
        }
        // [fix] 卡牌奖励：将 cardKeys 中的每张卡各 +1 加入收藏
        else if (reward.type === 'card' && reward.cardKeys) {
            newCollection.ownedCards = { ...newCollection.ownedCards };
            for (const cardKey of reward.cardKeys) {
                newCollection.ownedCards[cardKey] = (newCollection.ownedCards[cardKey] || 0) + 1;
            }
            needsCollectionSave = true;
        }
        // [2026-08-29 评估嘉勉] 分析员经验 / 稀有武装奖励（各自内部处理升级/解锁与持久化）
        else if (reward.type === 'analystExp' && reward.amount) {
            grantAnalystExp(reward.amount);
        }
        else if (reward.type === 'armament' && reward.armamentId) {
            grantArmament(reward.armamentId, reward.amount ?? 1); // [2026-09-07] 支持一次性发多份（版本福利 6 个消耗品）
        }

        if (needsCollectionSave) {
            setCollection(newCollection);
            StorageUtils.save(`${STORAGE_KEYS.USER_ASSETS}_${userId}`, newCollection);
        }
        if (needsSettingsSave) {
            setSettings(newSettings);
            StorageUtils.save(`${STORAGE_KEYS.USER_SETTINGS}_${userId}`, newSettings);
        }
    }, [collection, settings, userId, grantAnalystExp, grantArmament]);


    // 暴露给全局以便调试
    useEffect(() => {
        (window as any).debugSwitchUser = switchUserMode;
    }, []);

    // --- 5. 导出 ---
    return {
        // State
        userId,
        profile,
        // [2026-09-04 账号等级] 评估嘉勉通行证独立存档 / 持久战绩
        analystPass,
        battleRecord,
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
        resetSettings, // [2026-08-16] 恢复默认设置
        updateProfile, // [新增] 暴露更新名片的方法

        purchaseCard,
        purchaseBitGoldItem, // [核心新增] 导出高级货币购买接口
        switchUserMode, // [新增] 导出切换函数
        createNewUser,
        deleteUser,
        switchUser,
        debugSwitchUser,

        // Gacha Actions
        performGacha,   // [新增]
        setGachaTarget, // [新增]

        // Mission Actions
        grantMissionReward, // [军需提货专属口]

        // [2026-08-29 通行证]
        grantArmament,           // 解锁武装（加入已拥有集合）
        removeOwnedArmament,     // [2026-09-07 消耗品] 移除已拥有武装（用后消失）
        grantAnalystExp,         // 加分析员经验（升级，奖励由通行证手动领取）
        claimPassReward,         // 领取某等级通行证奖励
        claimAllPassRewards,     // 一键领取所有可领奖励
        grantPack,               // 打开卡包（随机武装）
        grantPendingPack,        // 获得待打开卡包
        openPack,                // 打开一个卡包（扣待打开数 + 随机武装）
        grantPassEnhancement,    // 解锁迷宫强化（强化池可遇）
        grantDataGold,           // 发放局外数据金

        // [2026-09-04 账号等级系统]
        grantAccountExp,         // 账号等级经验（逐级发 320 数据金）
        recordBattle,            // 持久战绩累计

        // Helpers
        setCardBack: (index: number) => updateSettings({ customization: { ...settings.customization, currentCardBackIndex: index } }),
        setDesk: (index: number) => updateSettings({ customization: { ...settings.customization, currentDeskIndex: index } }),
    }as any;
};