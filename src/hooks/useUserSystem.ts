import { useState, useEffect, useCallback, useRef } from 'react';
import { StorageUtils, STORAGE_KEYS } from '../utils/storageUtils';
import {
    DEFAULT_SETTINGS,
    FULL_SETTINGS,  // [皮肤] 全卡档设置
    FULL_COLLECTION,
    STARTER_COLLECTION,
    INITIAL_USER_DECKS,
    createInitialProfile,
    STARTER_DECK_LYFE,
    migrateStarterDecks,     // [2026-10-03] 存量号迁移：两套初始卡组 15 张 → 40 张
    DEV_ADMIN_UID,       // [新增] 导入唯一标识
    DEV_ADMIN_PROFILE    // [新增] 导入名片模板
} from '../data/initialUserData';
import type { UserProfile, UserSettings, UserCollection, SavedDeck, UserSummary, AnalystPassData, BattleMode, UserBattleRecord } from '../types';
import type { GachaResult } from '../logic/gachaLogic';
import type { MissionDef } from '../data/missionData';
import { getMissionItems } from '../data/skinData'; // [新增] 引入外观调度局，用于任务奖励发货
import { reloadHeroProgressionCache } from './useHeroProgression'; // [2026-09-04 莉莉子 修复] 切号后重载英雄养成缓存（模块级缓存不会自动跟随 USER_ID）
import { reloadArmamentCache } from './useArmamentConfig'; // [2026-09-07] 切号后重载武装槽/品质档缓存
import { reloadDivinityCache, peekShardWallet, peekHeroMaxed } from './useHeroDivinity'; // [2026-09-28 神格神经] 切号后重载节点解锁 · [2026-10-04] + 只读快照（开匣按**真源**算溢出，令界面与入账同源）
import { computeAnalystLevels, ANALYST_FIXED_REWARD_MAX, getAnalystReward, type AnalystLevelupReward } from '../data/roguelike/analystProgression'; // [2026-08-29 通行证] 分析员升级 · [2026-10-04] 奖励取值收口到唯一出口 getAnalystReward
import { computeAccountLevels, ACCOUNT_LEVEL_REWARD_DATA_GOLD, createAnalystPass, createEmptyBattleRecord } from '../data/accountProgression'; // [2026-09-04 账号等级]
import { getArmamentDefs, getEquipmentById, type EquipmentRarity } from '../data/equipment'; // [2026-08-29 通行证] 卡包随机武装 · [2026-10-20] + getEquipmentById（重复判定要按品质发券）· EquipmentRarity
import { pickArmamentFromChest } from '../logic/armamentChestPool'; // [2026-10-04] 带库存判定的武装抽取（溢出 → 数据金）；预览侧仍走 getArmamentChestPool
import { readArmStock, addArmStock, consumeArmStock, hasArmamentRoom, type ArmStockMap } from '../data/roguelike/armamentStock'; // [2026-09-07] 武装数量库存 · [2026-10-20] 溢出不再折数据金（改发匣券）⇒ 移除了 getArmamentOverflowDataGold
import { voucherYieldOf, voucherExchangeCostOf, readVoucher, readVoucherFirstUsed, type VoucherExchangeResult } from '../data/roguelike/armamentVoucher'; // [2026-10-20 程拍板] 匣券：重复武装 → 券 → 兑换更高档武装匣
import { eventBus, GameEvents } from '../utils/eventBus'; // [2026-09-29] 万能碎片广播（解耦 useHeroDivinity）
// [2026-09-29 程拍板] 奖励匣体系（开包 → 抽匣子 → 开匣子得道具）
import {
    rollChest, dropShards, SHARD_CHEST_AMOUNT, type ChestInstance, type ChestKind,
} from '../data/roguelike/divinityShards';
import { ROGUE_HEROES } from '../data/roguelike/rogueStarterDecks'; // [2026-09-29] 碎片可归属的天启者
import type { ShardWallet, ShardDropDetail } from '../data/roguelike/divinityShards';

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

    // [2026-10-02 莉莉子 #19] 待打开卡包的**同步镜像**：state 是异步的，光靠 state 判据拦不住同帧双发
    //   （同 BUG-20261002-02 的教训：锁必须是同步的）。持久化值一变就同步过来。
    const pendingPacksRef = useRef(0);
    useEffect(() => { pendingPacksRef.current = settings?.pendingPacks ?? 0; }, [settings?.pendingPacks]);

    // [2026-10-04 ③] 31+ 里程碑领取的**同步互斥**（与上一行同一条教训：**锁必须是同步的**）。
    //   为什么要它：发放动作在 `setSettings(prev => …)` 的幂等检查**之前**执行 ⇒
    //   若同一渲染内被调两次（快速双击 / 调用方重入），会**各发一遍卡包**。
    //   React 18 对 click 这类离散事件是同步 flush（第二次点击前已重渲染、水位已推进 ⇒ 会早退），
    //   但"不依赖时序"才稳 —— 故加同步 ref；`finally` 释放，保证后续正常领取。
    const postCapClaimingRef = useRef(false);

    // [2026-10-20 莉莉子 · 匣券] 券余额的**同步镜像** —— 同 `pendingPacksRef` 那条教训：「**锁必须是同步的**」。
    //   病根：`exchangeVoucherChest` 若只读**渲染快照** `settings`，同一渲染内连点两次会
    //   各按**旧余额**各扣一次、各发一个匣子 ⇒ 券只够买一个，匣子却到手两个（**玩家白赚**）。
    //   ⇒ 扣减前先读写本 ref（同步），state 只负责持久化 + UI 刷新。
    const voucherRef = useRef<number>(readVoucher(settings));
    useEffect(() => { voucherRef.current = readVoucher(settings); }, [settings?.armamentVoucher]);

    // [2026-10-20 匣券] "已用首兑档位"的**同步镜像**（同上一条教训）。
    //   只镜像余额还不够：余额充足时连点两次，第二次仍按**旧 settings** 判定 `isFirst=true`
    //   ⇒ 两次都吃首兑优惠（本应第二次恢复原价）。实测的复现路径就是"快速双击同一个兑换按钮"。
    const voucherFirstUsedRef = useRef<EquipmentRarity[]>(readVoucherFirstUsed(settings));
    useEffect(() => { voucherFirstUsedRef.current = readVoucherFirstUsed(settings); }, [settings?.voucherFirstUsed]);

    // [2026-10-20 莉莉子 · 匣券] 待打开匣子队列的**同步镜像**（「锁必须是同步的」第三条）。
    //   病根：`openAllChests` 原读 `settings.pendingChests`，若同一渲染内被调两次（连点"全部开启"），
    //   两次都会各自把**同一批匣子**再结算一遍 ⇒ 重复发放。
    //   现在由它判定"队列是否为空"，并在入队/取件/清空三处同步 —— 不再依赖 UI 层的守卫。
    const pendingChestsRef = useRef<ChestInstance[]>(settings?.pendingChests ?? []);
    useEffect(() => { pendingChestsRef.current = settings?.pendingChests ?? []; }, [settings?.pendingChests]);

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
        } else {
            // ==========================================
            // [2026-10-03 程拍板] **存量号迁移：两套初始卡组 15 张 → 40 张**
            // ── 为什么必须在这里做：`INITIAL_USER_DECKS` 只在**首次初始化**写入
            //    （上面的 `if (!userDecks)` 分支）⇒ 卡组改成 40 张后，**已注册账号拿不到新版**，
            //    卡组界面仍是 `15 / 40` +「等待构建卡组」（粉丝反馈的"没有完整新手卡组"）。
            // ── 口径：**不补发新卡组，只就地升级已有的那两套**（按 id 认）；
            //    玩家改过的只"补满"不替换、删除过的不复活 ⇒ 细则见 `initialUserData.migrateStarterDecks`。
            // ── 幂等：迁移后卡组已是 40 张、不再匹配旧 15 张口径 ⇒ 下次加载原样返回（`!==` 判断不触发）。
            // ==========================================
            const migrated = migrateStarterDecks(userDecks);
            if (migrated !== userDecks) {
                userDecks = migrated;
                StorageUtils.save(decksKey, userDecks);
                console.log('[StarterDeck] 🔧 存量号迁移：初始卡组已升级到 40 张');
            }
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
        reloadDivinityCache(); // [2026-09-28 神格神经] 切号后同步神格神经解锁 + 悖论点银行（同理由）

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

    // [2026-10-18 跨设备同步] 导入存档后刷新账户列表。
    //   为什么必须有它：`userList` 是 React state，而导入是直接写 localStorage 的
    //   ⇒ 不刷这一下，玩家导进来新账号却在列表里看不见（以为没成功）。
    const refreshUserList = () => setUserList(StorageUtils.getUserIndex());

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
        // ==========================================
        // [2026-10-04 独立审查 #3 修复] **恢复默认设置不得擦掉通行证的"领取记录"**
        //   病根：`passClaimedRewards`(≤30 逐级) 与 `passClaimedUpTo`(31+ 水位) 都住在 settings 里，
        //     而 DEFAULT_SETTINGS 不含它们 ⇒ 点一次「恢复默认」就全部归零
        //     ⇒ **所有已达等级的奖励重新变成可领**；而发出去的东西（数据金→USER_ASSETS、
        //       神格碎片→divinity 存档、卡包/武装→自身存档）**不会被回收**
        //     ⇒ 反复点「恢复默认」= 无限刷通行证奖励（31+ 无限等级下尤其严重）。
        //   口径：这两个字段是**进度**，不是"偏好设置" ⇒ 重置时原样保留。
        // ==========================================
        const keepClaimRecords: Partial<UserSettings> = {};
        if (settings?.passClaimedRewards?.length) keepClaimRecords.passClaimedRewards = settings.passClaimedRewards;
        if (settings?.passClaimedUpTo !== undefined) keepClaimRecords.passClaimedUpTo = settings.passClaimedUpTo;
        // 🔴 [2026-10-20 匣券] 券与"已用首兑档位"同属**玩家资产/进度** —— 被"恢复默认"清零等于吞掉资产。
        //   照 `passClaimedRewards` 的先例原样保留（实现审查把这条列为必做项）。
        if (settings?.armamentVoucher !== undefined) keepClaimRecords.armamentVoucher = settings.armamentVoucher;
        if (settings?.voucherFirstUsed?.length) keepClaimRecords.voucherFirstUsed = settings.voucherFirstUsed;
        const next: UserSettings = { ...DEFAULT_SETTINGS, ...keepClaimRecords };
        setSettings(next);
        StorageUtils.save(`${STORAGE_KEYS.USER_SETTINGS}_${userId}`, next);
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

    /**
     * [2026-10-24 莉莉子 · 卡组码] 批量购买多张卡 —— **一次 `setCollection` 提交**。
     *
     * 🔴 为什么不能循环调 `purchaseCard`（这是必须记住的）：
     *   它每次调用都会 `setCollection` **并落盘一次**（见上面那个实现）。
     *   卡组码"一键补齐"一次要补十几种卡 ⇒ 十几次独立写盘，
     *   中途一次失败就会留下"扣了钱但只拿到一半卡"的半套状态，而且无法回滚。
     *   本函数把整笔扣款 + 所有发卡压进**同一个 updater**，要么全成、要么全不成。
     *
     * ⚠️ 与 `purchaseCard` 的另一个差别：**余额不足时静默返回 false，不弹 alert**。
     *    调用方（缺卡弹窗）已经按实时余额把按钮置灰了，
     *    这里再弹原生 alert 只会在极端并发下打断玩家。
     *
     * @param items 要买的卡（key + 张数），张数 ≤ 0 的条目会被忽略
     * @param totalCost 数据银总价（**由调用方用 `analyzeDeckGap` 算好**，这里只做二次校验）
     */
    const purchaseCardsBatch = (
        items: Array<{ key: string; count: number }>,
        totalCost: number,
    ): boolean => {
        if (!collection) return false;
        if (!items.some(i => i.count > 0)) return false;
        // 预检：让 UI 能立刻拿到"买不起"的结果，不必等 setState 落地
        if (collection.resources.silverCoin < totalCost) return false;

        setCollection(prev => {
            if (!prev) return null;
            // 二次校验：预检和真正落地之间可能插入别的扣款（比如抽卡）
            if (prev.resources.silverCoin < totalCost) return prev;

            const newOwned = { ...prev.ownedCards };
            for (const { key, count } of items) {
                if (count > 0) newOwned[key] = (newOwned[key] || 0) + count;
            }

            const newCollection = {
                ...prev,
                resources: { ...prev.resources, silverCoin: prev.resources.silverCoin - totalCost },
                ownedCards: newOwned,
            };
            StorageUtils.save(`${STORAGE_KEYS.USER_ASSETS}_${userId}`, newCollection);
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
                        } else {
                            // [2026-10-02 莉莉子 BUG-20261002-14 兜底] 已拥有却没带 convertedCurrency
                            //   ⇒ 兜底转 1 比特金（与 rollSkin 的重复口径一致），**绝不静默丢弃**
                            newCollection.resources.bitGold += 1;
                        }
                    }
                } else if (res.type === 'cardBack') {
                    // 解锁卡背
                    const idx = res.key as number;
                    if (!newSettings.unlockedCardBacks.includes(idx)) {
                        newSettings.unlockedCardBacks = [...newSettings.unlockedCardBacks, idx];
                    } else {
                        // [2026-10-02 莉莉子 BUG-20261002-14 兜底] 见上方说明：重复卡背补转 5 比特金
                        newCollection.resources.bitGold += 5;
                    }
                } else if (res.type === 'desk') {
                    // 解锁牌桌
                    const idx = res.key as number;
                    if (!newSettings.unlockedDesks.includes(idx)) {
                        newSettings.unlockedDesks = [...newSettings.unlockedDesks, idx];
                    } else {
                        // [2026-10-02 莉莉子 BUG-20261002-14 兜底] 重复牌桌补转 5 比特金
                        newCollection.resources.bitGold += 5;
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
    // [2026-09-07 真数量库存] 发放/消耗统一维护 armamentStock（普通封顶 MAX_ARMAMENT_STOCK=1/消耗品不限）；ownedArmaments 同步为种类名（stock>0）
    const applyArmStock = useCallback((prev: UserSettings, id: string, fn: (s: ArmStockMap) => ArmStockMap | null): UserSettings | null => {
        if (!id) return null;
        const stock = readArmStock(prev);
        const nextStock = fn(stock);
        if (!nextStock) return null;
        const kinds = Object.keys(nextStock).filter(k => (nextStock[k] ?? 0) > 0);
        return { ...prev, armamentStock: nextStock, ownedArmaments: kinds };
    }, []);

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

    /**
     * [2026-10-20 程拍板 · 匣券] 增加匣券余额（函数式累加 + 立即落盘）。
     *
     * ⚠️ **必须用函数式 updater**：本仓库多次踩过"值形式 `setSettings({...settings})`"的坑 ——
     *   同一个 tick 里若有别的更新（例如 `openAllChests` 正在 `pendingChests: []` 清空队列），
     *   值形式会把那次清空**覆盖回去** ⇒ **匣子复活、可无限刷**（实现审查点名的高危点）。
     */
    const grantArmamentVoucher = useCallback((amount: number) => {
        const gain = Math.floor(amount);
        if (!Number.isFinite(gain) || gain <= 0) return;
        setSettings(prev => {
            if (!prev) return prev;
            const nextValue = readVoucher(prev) + gain;
            voucherRef.current = nextValue; // 同步镜像（updater 幂等 ⇒ StrictMode 双调用结果一致）
            const next = { ...prev, armamentVoucher: nextValue };
            StorageUtils.save(`${STORAGE_KEYS.USER_SETTINGS}_${userId}`, next);
            return next;
        });
    }, [userId]);

    /**
     * [2026-08-29 评估嘉勉] 发放武装库存（amount 份；普通武装单种上限 1，消耗品不限）
     *
     * 🔴 [2026-10-20 匣券] 满库存时**改发匣券**（原为折算数据金）。
     *   两条理由：① 数据金买不到武装（商店只卖局内装备）⇒ 对收集党是死钱；
     *             ② 券能攒出高级匣，把"白开"变成"进度"。
     *   ⚠️ 消耗品上限无限 ⇒ `hasArmamentRoom` 恒 true ⇒ **永不发券**（"领 6 用 6"口径不变）。
     *   📌 位置在 `grantArmamentVoucher` **之后**是刻意的（避免 `const` 定义顺序/TDZ 问题）。
     */
    const grantArmament = useCallback((armamentId: string, amount = 1) => {
        if (!armamentId) return;
        const def = getEquipmentById(armamentId);
        if (!hasArmamentRoom(readArmStock(settings), armamentId)) {
            const gain = voucherYieldOf(def?.rarity) * Math.max(1, Math.floor(amount));
            grantArmamentVoucher(gain);
            console.log(`[武装发放] 「${def?.name ?? armamentId}」已拥有 ⇒ 匣券 +${gain}`);
            return;
        }
        setSettings(prev => {
            if (!prev) return prev;
            const updated = applyArmStock(prev, armamentId, s => addArmStock(s, armamentId, amount));
            if (!updated) return prev;
            StorageUtils.save(`${STORAGE_KEYS.USER_SETTINGS}_${userId}`, updated);
            return updated;
        });
    }, [applyArmStock, userId, settings, grantArmamentVoucher]);

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

    // ══════════════════════════════════════════════════════════
    // [2026-09-29 程拍板] 奖励匣体系
    //   开包流程改为：**开包 → 抽到一个匣子 → 打开匣子得到对应道具**
    //   两类匣：武装匣（开对应品质武装）/ 神格碎片匣（开对应数量碎片，每5片一组随机归属某天启者）
    //   ⚠️ 依赖方向：本 hook **不**直接写碎片钱包（那是 useHeroDivinity 的职责），
    //      openChest 只**返回结果**，由同时持有两者的 App 层调用 divinity.applyShardDrop 入账。
    // ══════════════════════════════════════════════════════════

    /** 抽一个匣子（开包流程用）：随机大类 + 按权重随机品质 */
    const rollRewardChest = useCallback((): ChestInstance => {
        const kind: ChestKind = Math.random() < 0.5 ? 'armament' : 'shard';
        return rollChest(kind);
    }, []);

    /** 发放一个待打开匣子（可指定大类，品质随机；不指定则随机大类） */
    const grantPendingChest = useCallback((kind?: ChestKind) => {
        const chest = kind ? rollChest(kind) : rollRewardChest();
        setSettings(prev => {
            if (!prev) return prev;
            const next = [...(prev.pendingChests ?? []), chest];
            pendingChestsRef.current = next; // 同步镜像
            const newSettings = { ...prev, pendingChests: next };
            StorageUtils.save(`${STORAGE_KEYS.USER_SETTINGS}_${userId}`, newSettings);
            return newSettings;
        });
    }, [rollRewardChest, userId]);

    /** 批量发放待打开匣子（通关/宝箱节点等） */
    const grantPendingChests = useCallback((chests: ChestInstance[]) => {
        if (!chests.length) return;
        setSettings(prev => {
            if (!prev) return prev;
            const next = [...(prev.pendingChests ?? []), ...chests];
            pendingChestsRef.current = next; // 同步镜像（兑换匣子也走这里）
            const newSettings = { ...prev, pendingChests: next };
            StorageUtils.save(`${STORAGE_KEYS.USER_SETTINGS}_${userId}`, newSettings);
            return newSettings;
        });
    }, [userId]);

    /**
     * [2026-10-20 程拍板 · 匣券] **用匣券兑换一个武装匣**（进 `pendingChests`，玩家随后自己开）。
     *
     * 口径：
     * · 券是**通用**的 —— 任意档的重复都能攒出任意档的匣（"按品质隔离"已被数据否决：会让碎片永远落后一档）
     * · **每档首次兑换有优惠**（`min(半价, 80)`），用过的档记进 `voucherFirstUsed`，之后恢复原价
     * · 兑换发的是**匣子**而不是武装 —— 走 `grantPendingChests`，与通行证卡包同一条链路
     * · 失败不扣券（`insufficient` / `no-chest` 直接返回）
     * 📌 位置必须在 `grantPendingChests` **之后**（否则 TDZ：Block-scoped variable used before declaration）
     */
    const exchangeVoucherChest = useCallback((rarity: EquipmentRarity): VoucherExchangeResult => {
        if (!settings) return { ok: false, reason: 'invalid' };
        // ⚠️ 余额读**同步镜像**而非 `settings`：settings 是渲染快照，同一渲染内连点两次会各按旧余额扣款
        //    ⇒ 券扣一次、匣子发两个（白赚）。ref 在扣减瞬间即更新，第二次点击必然看到新余额。
        const balance = voucherRef.current;
        const used = voucherFirstUsedRef.current;   // ← 同样读同步镜像：否则连点两次会各吃一次首兑优惠
        const isFirst = !used.includes(rarity);
        const cost = voucherExchangeCostOf(rarity, isFirst);
        if (cost === null) return { ok: false, reason: 'no-chest', rarity, balance };
        if (balance < cost) return { ok: false, reason: 'insufficient', rarity, spent: cost, balance };

        const nextBalance = balance - cost;
        voucherRef.current = nextBalance; // ← 先同步写，抢在 setSettings 生效之前
        const nextUsed = isFirst ? [...used, rarity] : used;
        voucherFirstUsedRef.current = nextUsed; // ← 同上，先同步
        setSettings(prev => {
            if (!prev) return prev;
            // 🔴 [2026-10-20 审查 A] 上一行算出的 `nextBalance` 来自 **ref**，是"绝对量"。
            //   若将来某条路径把 ref 顶高（例如某处用值形式 `setSettings({...settings})` 覆盖），
            //   绝对量写法会**凭空多给券**。用真实 state 兜一道：余额只允许**变小**，绝不允许被写大。
            const real = readVoucher(prev);
            const safeBalance = Math.min(nextBalance, real);
            const next = { ...prev, armamentVoucher: safeBalance, voucherFirstUsed: nextUsed };
            StorageUtils.save(`${STORAGE_KEYS.USER_SETTINGS}_${userId}`, next);
            return next;
        });
        // 匣子入队走**现成的批量发放**（它自己落盘 + 追加，不会覆盖上面这次扣款）
        //   注：不加 `as ChestInstance` —— 让类型系统真正校验（`EnhancementRarity` 与 `EquipmentRarity`
        //   目前是逐字相同的联合；将来若分叉，断言会把这个错误吞掉）
        grantPendingChests([{ kind: 'armament', rarity }]);
        console.log(`[匣券] 兑换 ${rarity} 武装匣：花 ${cost} 券（${isFirst ? '首次优惠' : '原价'}），余 ${nextBalance}`);
        return { ok: true, rarity, spent: cost, usedFirstDiscount: isFirst, balance: nextBalance };
    }, [settings, userId, grantPendingChests]);

    /**
     * 打开第 index 个待打开匣子（默认第一个）：
     *   · 武装匣 → 按**对应品质**随机一件武装入库，返回 { kind:'armament', armamentId }
     *   · 碎片匣 → 按对应数量产出碎片（每5片一组随机归属），返回 { kind:'shard', detail, wallet }
     *   ⚠️ 碎片入账由调用方（App 层）用返回的 wallet 调 divinity.applyShardDrop 完成。
     */
    const openChest = useCallback((index = 0): {
        kind: ChestKind;
        rarity: ChestInstance['rarity'];
        armamentId?: string;
        /** [2026-10-20 匣券] 该档已全部拥有时发的**匣券数量**（有值 = 本次没发武装，发的是券） */
        voucherGained?: number;
        /** @deprecated [2026-10-20] 重复已改发匣券，本字段不再产生；保留以兼容旧读取方 */
        overflowDataGold?: number;
        shardAmount?: number;
        shardDetail?: ShardDropDetail[];
        wallet?: ShardWallet;
    } | null => {
        // [2026-10-20 匣券] 读**同步镜像**取件：多弹窗同开时按"最新队列"取，而不是渲染快照里的陈旧列表
        const list = pendingChestsRef.current;
        const chest = list[index];
        if (!chest) return null;

        // [2026-10-14 莉莉子 🖱️交互层革新] 开匣音效 —— 时机踩点：
        //   ChestOpenModal 是**开匣动画结束才调 onOpenChest**（见其文件头 #11 注释），
        //   所以这里发声 = 正好落在「光爆演出收束、内容揭示」那一刻。
        //   按品质路由：紫/金/彩 → 出金音；白/绿/蓝 → 普通出货音（开匣权重 82% : 18%）。
        eventBus.emit(
            chest.rarity === 'epic' || chest.rarity === 'legendary' || chest.rarity === 'mythic'
                ? GameEvents.GACHA_REVEAL_RARE
                : GameEvents.GACHA_REVEAL_COMMON
        );

        // 1. 先从队列移除（函数式更新，避免与 grantArmament 的更新互相覆盖——见 openPack 的踩坑注释）
        setSettings(prev => {
            if (!prev) return prev;
            const cur = prev.pendingChests ?? [];
            if (cur.length <= index) return prev;
            const next = [...cur.slice(0, index), ...cur.slice(index + 1)];
            pendingChestsRef.current = next; // 同步镜像
            const newSettings = { ...prev, pendingChests: next };
            StorageUtils.save(`${STORAGE_KEYS.USER_SETTINGS}_${userId}`, newSettings);
            return newSettings;
        });

        // 2. 按大类结算内容
        if (chest.kind === 'armament') {
            // [2026-10-02 莉莉子] 品质对应池走**共用函数**（同品质为空则回退全池）——
            //   与「开匣详情预览」同一份逻辑，杜绝 UI 承诺 ≠ 实际产出。
            // [2026-10-04 程拍板 ②] 改走 `pickArmamentFromChest`（多一维：**库存**）：
            //   · 优先抽"还有余量"的 ⇒ 不会抽到已满的（否则开匣 = **空包**）
            //   · [2026-10-20 匣券] 该品质**已全部拥有** ⇒ 改为发**匣券**（原为折算数据金），并回报 `voucherGained` 供 UI 说明
            const stock = readArmStock(settings);
            const { def, overflow } = pickArmamentFromChest(chest.rarity, stock);
            if (!def) return { kind: chest.kind, rarity: chest.rarity };
            if (overflow) {
                // [2026-10-20 程拍板 · 匣券] 该档武装**已全部拥有** ⇒ 不再折数据金（买不到武装=死钱），改发匣券
                const gain = voucherYieldOf(def.rarity);
                grantArmamentVoucher(gain);
                console.log(`[开匣] 武装「${def.name}」已全部拥有 ⇒ 匣券 +${gain}`);
                return { kind: chest.kind, rarity: chest.rarity, voucherGained: gain };
            }
            grantArmament(def.id);
            return { kind: chest.kind, rarity: chest.rarity, armamentId: def.id };
        }

        // 碎片匣：总数来自品质档，每 5 片一组随机归属
        const amount = SHARD_CHEST_AMOUNT[chest.rarity];
        // [2026-10-04 莉莉子 BUG修复] 传**真源钱包 + 练满判据** —— 让本函数算出的
        //   `shardDetail[].overflow` 与真实入账（`applyShardDrop` 用真源逐笔重算）**同源**
        //   ⇒ 界面的「溢出 +N 万能」不再恒为 0（此前传 undefined = 按空钱包算）。
        const drop = dropShards(peekShardWallet(), ROGUE_HEROES.map(h => h.key), amount, Math.random, peekHeroMaxed);
        return {
            kind: chest.kind,
            rarity: chest.rarity,
            shardAmount: amount,
            shardDetail: drop.details,
            wallet: drop.wallet,
        };
    }, [settings, grantArmament, grantArmamentVoucher, userId]);

    /**
     * ⚡ **一键全开所有匣子**：一次性结算完 `pendingChests` 并清空队列。
     *   现在只有「⏭ 跳过」这一条路还在用它（把剩余的匣子一次性结算，最快，不用逐发演出）。
     *
     * 🔄 [2026-10-21 订正一条**会误导人**的旧注释]
     *   原文写着：「⚠️ 为什么不能像卡包那样"循环调 `openChest(0)`"：`openChest` 用闭包里的
     *   `settings` 取 `list[index]` ⇒ 连调会反复开同一个匣子」。
     *
     *   **这条理由已经不成立**：2026-10-20 加同步镜像后，`openChest` 取件已改为读
     *   `pendingChestsRef.current`，并在移除时同步回写该 ref（见 `openChest` 函数头）。
     *   ⇒ **逐个异步调 `openChest(0)` 是安全的**；`ChestOpenModal` 的「边播边开」正是这么实现的
     *     （若谁按旧注释把它改回"一次性预开"，「⏹ 停止」会立刻退化回假中止 —— 包早被消耗光）。
     *
     *   ⚠️ 仍然成立的那一半限制：**取件**安全，但**结算**仍读闭包 `settings`
     *   （`readArmStock(settings)`）⇒ **同一 tick 内同步连调**会让第二个武装匣的"该档是否已集满"算错。
     *   所以批量要么"逐发异步"，要么像本函数这样自己维护 `rollingStock` / `rollingShardWallet` 滚动真源。
     */
    const openAllChests = useCallback((): NonNullable<ReturnType<typeof openChest>>[] => {
        // [2026-10-20 匣券] 读**同步镜像**，并在结算前**立刻清空它**：
        //   同一渲染内连点两次"全部开启"时，第二次会看到空队列而早退 ⇒ 不会把同一批匣子再结算一遍。
        //   （原先靠 UI 的 phaseRef 守卫；store 层自己也要有一道，免得别的调用方绕过 UI。）
        const list = pendingChestsRef.current;
        if (list.length === 0) return [];
        pendingChestsRef.current = [];

        // ① 一次性清空队列（含落盘）
        setSettings(prev => {
            if (!prev) return prev;
            const newSettings = { ...prev, pendingChests: [] };
            StorageUtils.save(`${STORAGE_KEYS.USER_SETTINGS}_${userId}`, newSettings);
            return newSettings;
        });

        // ② 逐个结算（与 openChest 同口径）
        // [2026-10-04 ②] 批量时**必须维护一份滚动库存**：同批次连开 3 个同品质武装匣时，
        //   state 在本次渲染内不会更新 ⇒ 不滚动就会把同一件抽 3 次、把库存算错（多发/误判溢出）。
        let rollingStock = readArmStock(settings);
        // [2026-10-04 莉莉子] 碎片同理要**滚动钱包**（见下方 dropShards 调用）
        let rollingShardWallet = peekShardWallet();
        const results = list.map(chest => {
            if (chest.kind === 'armament') {
                const { def, overflow } = pickArmamentFromChest(chest.rarity, rollingStock);
                if (!def) return { kind: chest.kind, rarity: chest.rarity };
                if (overflow) {
                    // [2026-10-20 匣券] 批量开匣同口径：已全部拥有 ⇒ 发券（券只累加，不参与抽取判定，无需滚动）
                    const gain = voucherYieldOf(def.rarity);
                    grantArmamentVoucher(gain);
                    return { kind: chest.kind, rarity: chest.rarity, voucherGained: gain };
                }
                grantArmament(def.id);
                rollingStock = addArmStock(rollingStock, def.id, 1);
                return { kind: chest.kind, rarity: chest.rarity, armamentId: def.id };
            }
            const amount = SHARD_CHEST_AMOUNT[chest.rarity];
            // [2026-10-04 莉莉子] 批量开匣也必须**滚动钱包**（与上面的 rollingStock 同理）——
            //   若每个匣子都按"开匣前"的钱包算，同批里第 2 个起的溢出会算错。
            const drop = dropShards(rollingShardWallet, ROGUE_HEROES.map(h => h.key), amount, Math.random, peekHeroMaxed);
            rollingShardWallet = drop.wallet;
            return {
                kind: chest.kind,
                rarity: chest.rarity,
                shardAmount: amount,
                shardDetail: drop.details,
                wallet: drop.wallet,
            };
        });

        // [2026-10-14 莉莉子 🖱️交互层革新] 批量开匣音效：整批**只播一次**
        //   （N 个匣子逐个发声会糊成一片，而演出本就是一次性汇总窗）。
        //   按本批**最高品质**路由 —— 只要有一个紫/金/彩就给「出金」音。
        const batchHasRare = results.some(r =>
            r.rarity === 'epic' || r.rarity === 'legendary' || r.rarity === 'mythic'
        );
        eventBus.emit(batchHasRare ? GameEvents.GACHA_REVEAL_RARE : GameEvents.GACHA_REVEAL_COMMON);
        return results;
    }, [settings, grantArmament, grantArmamentVoucher, userId]);

    /** [2026-08-29 通行证] 获得一个待打开卡包（打开时才随机武装） */
    const grantPendingPack = useCallback(() => {
        setSettings(prev => {
            if (!prev) return prev;
            const newSettings = { ...prev, pendingPacks: (prev.pendingPacks ?? 0) + 1 };
            StorageUtils.save(`${STORAGE_KEYS.USER_SETTINGS}_${userId}`, newSettings);
            return newSettings;
        });
    }, [userId]);

    /**
     * [2026-09-29 程拍板] 打开一个卡包 → **抽到一个奖励匣**（不再直接给武装）。
     * 流程：开包 → 匣子入库（pendingChests）→ 玩家随后打开匣子得到道具。
     *
     * [2026-10-02 莉莉子 BUG修复 #19] 原实现是「**先发后扣**」：
     *   第一次 setSettings **无条件把匣子入队**，第二次才扣 `pendingPacks` 且带 `>0` 守卫，
     *   而函数**无论如何都 `return chest`** ⇒ 若在 `pendingPacks === 0` 时被调用，
     *   会**凭空多发一个匣子且不扣数（白嫖）**。
     *   三个入口当前都有 `pendingPacks > 0` 前置门，所以此前不可达 —— 属**缺守卫的潜在洞**。
     *   现改为：**先同步判 + 同步预扣**，扣不到就直接 `return null`（调用方 `handleOpen` 已能处理 null）。
     *   用同步 ref 而不是 state 做判据，是因为「state 是异步的、读到的可能是旧值」——
     *   这与 BUG-20261002-02（回合末重入）踩的是同一个坑，修法也一致。
     *
     * @returns 抽到的匣子（供开箱演出展示"先看到匣子"）；**没有可开的卡包时返回 null**
     */
    const openPack = useCallback((): ChestInstance | null => {
        // ① 同步判：无可开卡包 → 什么都不发
        if (pendingPacksRef.current <= 0) return null;
        // ② 同步预扣：同一帧内即使被连调两次，第二次也读不到额度
        pendingPacksRef.current -= 1;

        const chest = rollRewardChest();
        setSettings(prev => {
            if (!prev) return prev;
            // 兜底：真被抢光了就不发（入队与扣数在**同一个更新里**完成，不再"先发后扣"）
            if ((prev.pendingPacks ?? 0) <= 0) return prev;
            const newSettings = {
                ...prev,
                pendingChests: [...(prev.pendingChests ?? []), chest],
                pendingPacks: (prev.pendingPacks ?? 0) - 1,
            };
            StorageUtils.save(`${STORAGE_KEYS.USER_SETTINGS}_${userId}`, newSettings);
            return newSettings;
        });
        return chest;
    }, [rollRewardChest, userId]);

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
    const claimPassReward = useCallback((level: number, opts?: { silent?: boolean }): boolean => {
        // [2026-10-04 程拍板 ④] **31+ 不走本函数**：那条线是"里程碑 + 水位、不许跳级"，
        //   见 `claimPostCapPassRewards`。这里只负责 ≤30 的固定奖励表。
        if (level > ANALYST_FIXED_REWARD_MAX) return false;
        // [2026-10-04] 奖励改走**唯一出口** `getAnalystReward`（原先直接查表 —— 31+ 会漏）
        const reward = getAnalystReward(level);
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
        // [2026-10-14 莉莉子 🖱️交互层革新] 领取成功音（复用商店成交音）
        //   一键领取时由 claimAllPassRewards 统一播一次，故循环内传 silent 抑制。
        if (!opts?.silent) eventBus.emit(GameEvents.GACHA_CONVERT);
        return true;
    }, [analystPass, grantArmament, grantPendingPack, grantPassEnhancement, grantDataGold, userId]);

    /** [2026-09-04 账号等级] 一键领取当前通行证等级所有未领取奖励（**≤30 固定表**；上限读 analystPass） */
    const claimAllPassRewards = useCallback((): number => {
        if (!analystPass || !settings) return 0;
        let count = 0;
        // [2026-10-04] 顺手把循环上界钳到固定表上限：31+ 由水位那条线单独处理
        const upto = Math.min(analystPass.level, ANALYST_FIXED_REWARD_MAX);
        for (let lv = 1; lv <= upto; lv++) {
            if (getAnalystReward(lv) && !(settings.passClaimedRewards ?? []).includes(lv)) {
                if (claimPassReward(lv, { silent: true })) count++;
            }
        }
        // [2026-10-14 莉莉子 🖱️交互层革新] 一键领取：整批只播一次（循环内已静默）
        if (count > 0) eventBus.emit(GameEvents.GACHA_CONVERT);
        return count;
    }, [analystPass, settings, claimPassReward]);

    // ==========================================
    // [2026-10-04 程拍板 ③④] 31+ 里程碑奖励（**水位 = 不许跳级**）
    //   · 水位字段 `settings.passClaimedUpTo`，缺省 = 30（≤30 仍走上面的逐级数组）
    //   · 领取 = 把水位推进到"当前等级"：途中的**里程碑各发 1 个卡包**，
    //     非里程碑等级没有奖励（只推进水位）—— 结构上天然"不跳级"（只能往前走）
    //   · 为什么不用数组：31+ 是无限等级，数组会无上限增长；水位是 O(1)
    // ==========================================
    /** 已领到第几级（含 31+ 水位；缺省 = 30） */
    const passClaimedUpTo = Math.max(ANALYST_FIXED_REWARD_MAX, settings?.passClaimedUpTo ?? ANALYST_FIXED_REWARD_MAX);

    /**
     * 领取 31+ 的里程碑奖励（顺序、不跳级）。
     * @returns `{ packs }` 本次发放的卡包数；`{ reachedLevel }` 推进到哪一级
     */
    const claimPostCapPassRewards = useCallback((): { packs: number; reachedLevel: number } => {
        const rawLevel = analystPass?.level ?? 1;
        // [2026-10-04 独立审查 #1 修复] 消毒：脏存档可能把等级写成 Infinity（`JSON.parse('1e999')`）
        //   ⇒ 下面 `for (let lv = from + 1; lv <= level; lv++)` 会**永不终止**（客户端卡死）。
        const level = Number.isFinite(rawLevel) ? Math.max(1, Math.floor(rawLevel)) : ANALYST_FIXED_REWARD_MAX;
        const from = Math.max(ANALYST_FIXED_REWARD_MAX, settings?.passClaimedUpTo ?? ANALYST_FIXED_REWARD_MAX);
        if (!settings || level <= from) return { packs: 0, reachedLevel: from };
        // [2026-10-04 ③] 同步互斥：同一次渲染内重入直接早退
        //   （发放段在 `setSettings` 幂等检查**之前**，不在它的保护范围内）
        if (postCapClaimingRef.current) return { packs: 0, reachedLevel: from };
        postCapClaimingRef.current = true;
        try {
            // 先**只数**要发多少个包（不逐个发），再与"水位"一起一次写入 —— 理由见下
            let packs = 0;
            for (let lv = from + 1; lv <= level; lv++) {
                if (getAnalystReward(lv)?.pack) packs++;
            }
            // ==========================================
            // [2026-10-04 独立审查 #7 修复] 卡包数与水位**必须落在同一次 settings 写入里**
            //   原来：循环里逐个 `grantPendingPack()`（各一次 setSettings + 落盘），事后再单独写一次水位
            //     ⇒ 两次写入之间若失败（quota / 异常被 `StorageUtils.save` 吞掉）就会出现
            //       **"包到手了、水位没动"** ⇒ 重载后同一批里程碑**重发**。
            //   现在：一次写入同时提交 `pendingPacks` 与 `passClaimedUpTo` ⇒ 要么都成、要么都不成。
            //   （顺带把 N 次 localStorage 写压成 1 次。）
            // ==========================================
            setSettings(prev => {
                if (!prev) return prev;
                const next = { ...prev, pendingPacks: (prev.pendingPacks ?? 0) + packs, passClaimedUpTo: level };
                StorageUtils.save(`${STORAGE_KEYS.USER_SETTINGS}_${userId}`, next);
                return next;
            });
            console.log(`[通行证 31+] 里程碑领取：水位 ${from} → ${level}，发放卡包 ${packs} 个`);
            return { packs, reachedLevel: level };
        } finally {
            postCapClaimingRef.current = false;
        }
    }, [analystPass, settings, grantPendingPack, userId]);

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
        // [2026-09-20 1.0.16 版本福利] 迷宫卡包奖励：进「待打开卡包」队列，打开时才随机武装
        //   ⚠️ 刻意不置 needsSettingsSave —— grantPendingPack 内部是**函数式**累积，
        //      此处若再塞一个基于闭包 settings 的值更新，React 批处理时会把它整个覆盖掉
        //      （与 openPack 在 2026-09-15 修的是同一个坑）
        else if (reward.type === 'pack' && reward.amount) {
            for (let i = 0; i < reward.amount; i++) grantPendingPack();
        }
        // [2026-09-29 程拍板] 万能神格碎片奖励（每日固定产出）
        //   ⚠️ 碎片钱包真源在 useHeroDivinity，本 hook 不能反向 import（会成环）→ 用事件广播解耦
        else if (reward.type === 'universalShard' && reward.amount) {
            eventBus.emit(GameEvents.DIVINITY_UNIVERSAL_SHARD_GRANT, { amount: reward.amount, reason: 'mission' });
        }

        if (needsCollectionSave) {
            setCollection(newCollection);
            StorageUtils.save(`${STORAGE_KEYS.USER_ASSETS}_${userId}`, newCollection);
        }
        if (needsSettingsSave) {
            setSettings(newSettings);
            StorageUtils.save(`${STORAGE_KEYS.USER_SETTINGS}_${userId}`, newSettings);
        }
    }, [collection, settings, userId, grantAnalystExp, grantArmament, grantPendingPack]);


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
        purchaseCardsBatch, // [2026-10-24 莉莉子 · 卡组码] 批量补齐（一次提交，见实现处注释）
        purchaseBitGoldItem, // [核心新增] 导出高级货币购买接口
        switchUserMode, // [新增] 导出切换函数
        createNewUser,
        deleteUser,
        switchUser,
        debugSwitchUser,
        refreshUserList, // [2026-10-18 跨设备同步] 导入存档后刷新账户列表

        // Gacha Actions
        performGacha,   // [新增]
        setGachaTarget, // [新增]

        // Mission Actions
        grantMissionReward, // [军需提货专属口]

        // [2026-08-29 通行证]
        grantArmament,           // 解锁武装（加入已拥有集合）
        removeOwnedArmament,     // [2026-09-07 消耗品] 移除已拥有武装（用后消失）
        grantAnalystExp,         // 加分析员经验（升级，奖励由通行证手动领取）
        claimPassReward,         // 领取某等级通行证奖励（≤30 固定表）
        claimAllPassRewards,     // 一键领取所有可领奖励（≤30）
        passClaimedUpTo,         // [2026-10-04 ③] 已领到第几级（31+ 水位；缺省 30）
        claimPostCapPassRewards, // [2026-10-04 ③④] 领取 31+ 里程碑奖励（顺序、不跳级；里程碑给卡包）
        grantPack,               // 直接给一个随机武装（内部用；面向玩家的入口请走 openPack）
        grantPendingPack,        // 获得待打开卡包
        openAllChests,           // [2026-10-04 程拍板] 一键全开所有匣子（批量；openChest 不能循环调）
        openPack,                // 打开一个卡包（扣待打开数 + **抽到一个奖励匣**）[2026-09-29 改造]
        // [2026-09-29 程拍板] 奖励匣体系
        rollRewardChest,         // 随机抽一个匣子（不入库，仅预览/演出用）
        grantPendingChest,       // 发放一个待打开匣子（可指定大类）
        grantPendingChests,      // 批量发放待打开匣子
        openChest,               // 打开一个匣子（返回武装 id 或碎片分配结果）
        grantPassEnhancement,    // 解锁迷宫强化（强化池可遇）
        grantDataGold,           // 发放局外数据金

        // [2026-10-20 程拍板] 匣券（重复武装的补偿 → 兑换更高档武装匣）
        grantArmamentVoucher,    // 增加匣券（内部：开匣/发放武装重复时调用）
        exchangeVoucherChest,    // 用券兑换一个武装匣（含每档首次优惠；返回 VoucherExchangeResult）

        // [2026-09-04 账号等级系统]
        grantAccountExp,         // 账号等级经验（逐级发 320 数据金）
        recordBattle,            // 持久战绩累计

        // Helpers
        setCardBack: (index: number) => updateSettings({ customization: { ...settings.customization, currentCardBackIndex: index } }),
        setDesk: (index: number) => updateSettings({ customization: { ...settings.customization, currentDeskIndex: index } }),
    }as any;
};