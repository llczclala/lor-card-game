import { CARD_DB } from './cards';

/**
 * 初始用户数据模板
 * 定义了新用户默认拥有的资产、设置和卡组。
 */

// --- 1. 默认设置 ---
export const DEFAULT_SETTINGS = {
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
    unlockedDesks: [0]
};

// --- 2. 卡牌收藏定义 ---

// 辅助：获取所有卡牌 ID
const allCardKeys = Object.keys(CARD_DB);

// 方案 A: 全卡全满 (开发/测试模式)
// 给予所有卡牌各 3 张，无限资源
export const FULL_COLLECTION = {
    ownedCards: allCardKeys.reduce((acc, key) => {
        acc[key] = 3;
        return acc;
    }, {} as Record<string, number>),

    resources: {
        silverCoin: 99999, // [新增] 无限银币
        dataGold: 99999,
        bitGold: 99999
    }
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
            acc[key] = 3;
        }
        return acc;
    }, {} as Record<string, number>),

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
        'lyfe': 3,
        'single_combat': 3,
        'prayer': 3,
        'Messenger_Squad_Ah_Hua': 3,
        'Messenger_Squad_Gena': 3,
        'Argo_Squad_Pigeon': 3,
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
        'fenny': 3,
        'hidden_arrow': 3,
        'inspire': 2,
        'Ghost_Squad_Antina': 3,
        'Ghost_Squad_Vez': 3,
        'Typhoon_Squad_Flameheart': 3,
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
    pityCounter: 0,      // 当前垫了多少抽
    gachaTarget: null    // 当前定轨目标 (例如 "hero:lyfe")
});