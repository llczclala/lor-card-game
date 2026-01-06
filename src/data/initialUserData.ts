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
        dataGold: 99999, // 数据金 (Data Gold) - 用于抽卡
        bitGold: 99999   // 比特金 (Bit Gold) - 用于直购
    }
};

// 方案 B: 新手初始收藏 (正式上线模式)
// 仅给予英雄和部分基础单位
const STARTER_KEYS = [
    // 英雄
    'lyfe', 'fenny',
    // 基础法术
    'single_combat', 'prayer', 'hidden_arrow', 'inspire',
    // 基础后勤单位 (每个小队给一点)
    'Messenger_Squad_Ah_Hua', 'Messenger_Squad_Gena',
    'Ghost_Squad_Antina', 'Ghost_Squad_Vez',
    'Argo_Squad_Pigeon', 'Argo_Squad_Musician',
    'Typhoon_Squad_Flameheart',
    'test_unit_01'
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
        dataGold: 1000, // 初始送 1000 (够抽 10 连)
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
        // 填充一些测试卡保证数量
        'test_unit_01': 3,
        'test_challenger': 3
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
        'test_overwhelm': 3,
        'test_quickattack': 3
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
    displayName: `分析员#${userId.slice(-4).toUpperCase()}`, // 默认昵称
    level: 1,
    exp: 0,
    avatarId: 'lyfe', // 默认头像
    createdAt: Date.now(),
    lastLoginAt: Date.now()
});