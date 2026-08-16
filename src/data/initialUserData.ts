import type { UserSettings } from '../types'; // [2026-08-16] DEFAULT_SETTINGS 显式注解，根治 useUserSystem 类型债
import { CARD_DB } from './cards';
import { SKIN_IMAGES } from './imageData'; // [皮肤] 用于构建全皮肤数据

/**
 * 初始用户数据模板
 * 定义了新用户默认拥有的资产、设置和卡组。
 */

// --- 1. 默认设置 ---
export const DEFAULT_SETTINGS: UserSettings = {
    volume: {
        bgm: 0.5,
        sfx: 0.6,
        voice: 0.8
    },
    customization: {
        currentCardBackIndex: 0,
        currentDeskIndex: 0
    },
    // 默认解锁的装饰品索引列表
    unlockedCardBacks: [0],
    unlockedDesks: [0],
    videoResolution: '1k', // [新增] 默认 1k
    lastSeenAnnouncementVersion: '', // [2026-08-09] 已读公告版本（空=从未看过，进大厅自动弹公告）
    skipGameStartDrawAnimation: false, // 默认播放开局抽卡动画
    skipLevelupMovie: false,           // 默认播放升级影片
    skipVictoryMovie: false,           // 默认播放胜利影片
    deskDynamic: false,                // [2026-08-13] 默认静态牌桌
    heroDynamic: false,                // [2026-08-16] 默认静态卡面（对局内英雄卡动态视频需玩家手动开启）
};

// --- 2. 卡牌收藏定义 ---

// 辅助：获取所有卡牌 ID
const allCardKeys = Object.keys(CARD_DB);

// [皮肤] 从 SKIN_IMAGES 构建全皮肤数据
const buildFullSkins = (): Record<string, number[]> => {
    const result: Record<string, number[]> = {};
    for (const [cardKey, skinMap] of Object.entries(SKIN_IMAGES)) {
        result[cardKey] = Object.keys(skinMap).map(Number).sort((a, b) => a - b);
    }
    return result;
};

// 方案 A: 全卡全满 (开发/测试模式)
// 给予所有卡牌各 3 张，无限资源
export const FULL_COLLECTION = {
    ownedCards: allCardKeys.reduce((acc, key) => {
        acc[key] = 3;
        return acc;
    }, {} as Record<string, number>),

    ownedSkins: buildFullSkins(), // [皮肤] 全皮肤

    resources: {
        silverCoin: 99999, // [新增] 无限银币
        dataGold: 99999,
        bitGold: 99999
    }
};

// [皮肤] 全卡档专用设置：解锁所有卡背和棋盘
export const FULL_SETTINGS = {
    ...DEFAULT_SETTINGS,
    unlockedCardBacks: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16], // 全部 17 款卡背
    unlockedDesks: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],  // 全部 10 款棋盘
};

// 方案 B: 新手初始收藏 (正式上线模式)
// 仅给予英雄和部分基础单位
const STARTER_KEYS = [
    // --- 英雄 ---
    'lyfe', 'fenny',

    // --- 基础法术 (Lyfe) ---
    'single_combat', 'prayer', 'focus',
    // --- 基础法术 (Fenny) ---
    'hidden_arrow', 'inspire', 'destruction',

    // --- 1费 基础单位 ---
    'Messenger_Squad_Ah_Hua',   // 信使-阿花
    'Ghost_Squad_Antina',       // 鬼怪-安提娜
    'Argo_Squad_Pigeon',        // 阿尔戈-鸽子
    'Typhoon_Squad_Flameheart', // 堤丰-焰心
    'Ulster_Squad_Koni',        // [新增] 阿尔斯特-科尼 (再生)
    'Mingyi_Squad_Zhe_hao',     // [新增] 明夷-赭毫 (魔免)

    // --- 2-3费 中坚力量 ---
    'Messenger_Squad_Gena',     // 信使-格娜
    'Ghost_Squad_Vez',          // 鬼怪-薇兹
    'Argo_Squad_Musician',      // 阿尔戈-乐手
    'Dream_Guardians_Squad_Martina', // [新增] 守梦人-玛蒂娜 (坚韧)

    // --- 4+费 大哥单位 ---
    'Typhoon_Squad_Dornier',    // [新增] 堤丰-多尼尔 (反伤+再生)
    'Ghost_Squad_Valen',        // [新增] 鬼怪-瓦莲 (凶恶大哥)
    'Mingyi_Squad_Jin_Lang'     // [新增] 明夷-金琅 (强力盾牌)
];

export const STARTER_COLLECTION = {
    ownedCards: STARTER_KEYS.reduce((acc, key) => {
        // 确保 key 存在于 DB 中才添加，防止脏数据
        if (CARD_DB[key]) {
            // [核心修复] 严格限制新手资产：英雄仅 1 张，其余普通卡 2 张。
            // 2名英雄 + 19名随从/法术 = 刚好总计 40 张初始卡牌！极大激发抽卡欲望！
            const isHero = CARD_DB[key].isChampion;
            acc[key] = isHero ? 1 : 2;
        }
        return acc;
    }, {} as Record<string, number>),

    ownedSkins: {}, // [皮肤] 暂不预设皮肤 (完全纯净的初始号)

    resources: {
        silverCoin: 500000, // [新增] 初始给予 5000 通用银，方便前期合成
        dataGold: 160000,
        bitGold: 0
    }
};

// --- 3. 预设卡组 (Starter Decks) ---

// 卡组 1: 里芙·战术突击 (Lyfe Midrange)
// 混搭了里芙阵营法术 + 信使小队(侦察) + 阿尔戈小队(狙击)
export const STARTER_DECK_LYFE = {
    id: 'starter_deck_lyfe',
    name: '里芙：战术突击',
    hero: 'lyfe',
    cards: {
        'lyfe': 1,
        'single_combat': 2,
        'prayer': 2,
        'focus': 2,
        'Messenger_Squad_Ah_Hua': 2,
        'Messenger_Squad_Gena': 2,
        'Argo_Squad_Pigeon': 2,
        'Argo_Squad_Musician': 2,
    },
    createdAt: Date.now(),
    updatedAt: Date.now()
};

// 卡组 2: 芬妮·黄金狂热 (Fenny Aggro)
// 混搭了芬妮阵营法术 + 鬼怪小队(凶恶) + 堤丰小队(反伤)
export const STARTER_DECK_FENNY = {
    id: 'starter_deck_fenny',
    name: '芬妮：黄金狂热',
    hero: 'fenny',
    cards: {
        'fenny': 1,
        'hidden_arrow': 2,
        'inspire': 2,
        'destruction': 2,
        'Ghost_Squad_Antina': 2,
        'Ghost_Squad_Vez': 2,
        'Typhoon_Squad_Flameheart': 2,
        'Typhoon_Squad_Dornier': 2,
    },
    createdAt: Date.now(),
    updatedAt: Date.now()
};

// 导出卡组列表
export const INITIAL_USER_DECKS = [
    STARTER_DECK_LYFE,
    STARTER_DECK_FENNY
];

// --- 4. 用户档案生成器 ---
export const createInitialProfile = (userId: string) => ({
    uid: userId,
    displayName: `分析员#${userId.slice(-4).toUpperCase()}`,
    level: 1,
    exp: 0,
    avatarId: 'lyfe',
    createdAt: Date.now(),
    lastLoginAt: Date.now(),

    // [新增] 抽卡核心数据字段
    pityCounter: 0,      // 当前垫了多少抽 (100抽保底)
    skinPityCounter: 0,  // [核心新增] 皮肤保底计数器 (30抽保底)
    gachaTarget: null    // 当前定轨目标 (例如 "hero:lyfe")
});

// --- 5. 开发者/管理员专属标识 ---
// 这是整个系统的最高权限通行证，认准这个 UID 即可发卡发资源
export const DEV_ADMIN_UID = 'dev_full_admin';

// 预设好管理员的名片模板，避免每次生成时还要再去覆写
export const DEV_ADMIN_PROFILE = {
    ...createInitialProfile(DEV_ADMIN_UID),
    displayName: 'DEVELOPER (全卡测试)',
    avatarId: 'lyfe',
};