import { CARD_DB } from '../data/cards';
import { PERSONALIZATION_ASSETS, getSkinImage } from '../data/imageData';
import { getGachaItems } from '../data/skinData';
import type { UserCollection } from '../types';

// --- 常量定义 ---
export const GACHA_COST_SINGLE = 160;
export const GACHA_COST_TEN = 1600;
export const MAX_PITY = 100;
export const RARE_RATE = 0.02;
export const SKIN_RATE = 0.04;

export type GachaItemType = 'card' | 'cardBack' | 'desk' | 'skin';

// 抽卡结果接口
export interface GachaResult {
    type: GachaItemType;
    key: string | number;
    skinId?: number;
    isRare: boolean;
    isNew: boolean;
    convertedCurrency?: {
        type: 'silverCoin' | 'bitGold';
        amount: number;
    };
    displayImage: string;
    name: string;
    cost?: number;
}

// [新增] 卡池配置系统 ==========================================
export type PoolId = 'permanent' | 'lotus';

export interface GachaPoolConfig {
    id: PoolId;
    name: string;
    // 稀有池 —— 要包含的英雄 key 列表
    heroKeys: string[];
    // 稀有池 —— 要包含的卡背 registry 索引
    cardBackIndices: number[];
    // 稀有池 —— 要包含的牌桌 registry 索引
    deskIndices: number[];
    // 普通池过滤 —— 返回 false 表示排除该卡
    includeInCommonPool: (card: typeof CARD_DB[keyof typeof CARD_DB]) => boolean;
}

export const POOLS: Record<PoolId, GachaPoolConfig> = {
    permanent: {
        id: 'permanent',
        name: '常守之誓',
        heroKeys: ['lyfe', 'fenny', 'acacia_chrono_echo'],
        cardBackIndices: [1, 2, 3],
        deskIndices: [1, 2, 3, 4],
        // [2026-08-15 莉莉子] 常驻池排除：
        //   ① 卜卜(Pupu)与猫汐尔(Mauxir)体系（重叶/图征后勤、相关法术/衍生物）——专属「烬中镜火」池
        //   ② 明夷/星朗小队（半成品未做完，暂不投放）
        includeInCommonPool: (card) => {
            if (card.key === 'Argo_Deliberate_Infiltration') return false; // [2026-08-15] 蓄意渗透不进共鸣卡池
            if (card.region === 'Pupu' || card.region === 'Mauxir') return false;
            if (card.key.startsWith('Mingyi_Squad') || card.key.startsWith('Star_Bright_Squad')) return false;
            return true;
        },
    },
    lotus: {
        id: 'lotus',
        name: '烬中镜火',
        heroKeys: ['mauxir_lotus_drive', 'pupu_specular_soul'],
        cardBackIndices: [13, 14, 15],
        deskIndices: [5, 6, 7, 8, 9],
        // 排除 里芙(Lyfe) 和 芬妮(Fenny) 区域的后勤卡，以及蓄意渗透
        includeInCommonPool: (card) => card.region !== 'Lyfe' && card.region !== 'Fenny' && card.key !== 'Argo_Deliberate_Infiltration',
    },
};
// ================================================================

export const getCardPrice = (cost: number): number => {
    if (cost >= 0 && cost <= 2) return 400;
    if (cost >= 3 && cost <= 5) return 800;
    if (cost >= 6 && cost <= 8) return 1200;
    return 2400;
};

// --- 1. 构建卡池 ---

// 获取所有普通卡牌 (非英雄，非TEST，非锁定)，按池子过滤
const getCommonPool = (poolId: PoolId = 'permanent') => {
    const config = POOLS[poolId];
    return Object.values(CARD_DB).filter(c =>
        !c.isChampion &&
        c.region !== 'TEST' &&
        !c.key.startsWith('test_') &&
        c.isCollectible !== false &&
        config.includeInCommonPool(c)
    );
};

// 获取所有稀有资源，按池子过滤
const getRarePool = (poolId: PoolId = 'permanent') => {
    const config = POOLS[poolId];
    const allHeroes = Object.values(CARD_DB).filter(c => c.isChampion);
    // 只保留该池子配置的英雄
    const heroes = allHeroes.filter(h => config.heroKeys.includes(h.key));

    const allCardBacks = getGachaItems('cardBack');
    const cardBacks = allCardBacks.filter(cb => config.cardBackIndices.includes(cb.index!));

    const allDesks = getGachaItems('desk');
    const desks = allDesks.filter(d => config.deskIndices.includes(d.index!));

    return { heroes, cardBacks, desks };
};

// 皮肤池（[2026-08-15] 改为按池过滤，与普通池共用 includeInCommonPool 逻辑 → 抽卡与查看窗口数据互通）：
//   常驻池排除卜卜/猫汐尔体系皮肤；莲花池排除里芙/芬妮体系皮肤
const getSkinRarePool = (poolId: PoolId = 'permanent') => {
    const config = POOLS[poolId];
    return (getGachaItems('skin') as { cardKey: string, skinId: number }[]).filter(s => {
        const card = CARD_DB[s.cardKey];
        if (!card) return true; // 找不到对应卡的皮肤保留
        return config.includeInCommonPool(card as any);
    });
};

// --- 3. 卡池内容查看（放大镜弹窗数据源）---
export const getPoolViewerData = (poolId: PoolId = 'permanent') => {
    const { heroes, cardBacks, desks } = getRarePool(poolId);
    const commons = getCommonPool(poolId);
    const skins = getSkinRarePool(poolId); // [2026-08-15] 查看窗口皮肤与抽卡共用按池过滤，保证两边一致
    return { heroes, cardBacks, desks, commons, skins };
};

// --- 2. 核心抽取函数 ---

export const rollOne = (
    collection: UserCollection,
    currentPity: number,
    currentSkinPity: number,
    targetItem: string | null,
    userSettings?: any,
    poolId: PoolId = 'permanent'
): GachaResult => {
    // 1. 皮肤 30 抽强保底熔断
    if (currentSkinPity >= 29) {
        return rollSkin(collection, poolId);
    }

    // 2. 百抽熔断机制
    if (currentPity >= MAX_PITY - 1) {
        return rollRare(collection, targetItem, userSettings, poolId);
    }

    // 3. 常规三级盲盒解算
    const rollVal = Math.random();

    if (rollVal < RARE_RATE) {
        return rollRare(collection, targetItem, userSettings, poolId);
    }
    else if (rollVal < RARE_RATE + SKIN_RATE) {
        return rollSkin(collection, poolId);
    }
    else {
        return rollCommon(collection, poolId);
    }
};

// 抽取稀有物品逻辑
const rollRare = (collection: UserCollection, targetItem: string | null, userSettings?: any, poolId: PoolId = 'permanent'): GachaResult => {
    const { heroes, cardBacks, desks } = getRarePool(poolId);

    // 解析定轨
    let targetObj = null;
    if (targetItem) {
        const [type, val] = targetItem.split(':');
        targetObj = { type, val };
    }

    let selectedType: 'hero' | 'cardBack' | 'desk' = 'hero';
    let selectedKey: string | number = '';
    let displayImage = '';
    let name = '';
    let itemCost = 0;

    // A. 尝试命中定轨
    let hitTarget = false;
    if (targetObj) {
        if (targetObj.type === 'hero') {
            const h = heroes.find(c => c.key === targetObj!.val);
            if (h) {
                selectedType = 'hero';
                selectedKey = h.key;
                displayImage = h.imageUrl;
                name = h.name;
                itemCost = h.cost;
                hitTarget = true;
            }
        } else if (targetObj.type === 'cardBack') {
            const idx = parseInt(targetObj.val);
            const cbConfig = cardBacks.find(cb => cb.index === idx);
            if (cbConfig) {
                selectedType = 'cardBack';
                selectedKey = idx;
                displayImage = PERSONALIZATION_ASSETS.cardBacks[idx];
                name = cbConfig.name;
                hitTarget = true;
            }
        } else if (targetObj.type === 'desk') {
            const idx = parseInt(targetObj.val);
            const deskConfig = desks.find(d => d.index === idx);
            if (deskConfig) {
                selectedType = 'desk';
                selectedKey = idx;
                displayImage = PERSONALIZATION_ASSETS.desks[idx];
                name = deskConfig.name;
                hitTarget = true;
            }
        }
    }

    // B. 随机稀有
    if (!hitTarget) {
        const totalPoolSize = heroes.length + cardBacks.length + desks.length;
        const rand = Math.floor(Math.random() * totalPoolSize);

        if (rand < heroes.length) {
            const h = heroes[rand];
            selectedType = 'hero';
            selectedKey = h.key;
            displayImage = h.imageUrl;
            name = h.name;
            itemCost = h.cost;
        } else if (rand < heroes.length + cardBacks.length) {
            const cb = cardBacks[rand - heroes.length];
            selectedType = 'cardBack';
            selectedKey = cb.index!;
            displayImage = PERSONALIZATION_ASSETS.cardBacks[cb.index!];
            name = cb.name;
        } else {
            const d = desks[rand - heroes.length - cardBacks.length];
            selectedType = 'desk';
            selectedKey = d.index!;
            displayImage = PERSONALIZATION_ASSETS.desks[d.index!];
            name = d.name;
        }
    }

    // C. 重复检测
    let isNew = true;
    let convertedCurrency = undefined;

    if (selectedType === 'hero') {
        const owned = collection.ownedCards[selectedKey as string] || 0;
        if (owned >= 3) {
            isNew = false;
            convertedCurrency = { type: 'bitGold' as const, amount: 5 };
        } else if (owned > 0) {
            isNew = false;
        }
    } else if (selectedType === 'cardBack') {
        if (userSettings && userSettings.unlockedCardBacks.includes(selectedKey as number)) {
            isNew = false;
            convertedCurrency = { type: 'bitGold' as const, amount: 5 };
        }
    } else if (selectedType === 'desk') {
        if (userSettings && userSettings.unlockedDesks.includes(selectedKey as number)) {
            isNew = false;
            convertedCurrency = { type: 'bitGold' as const, amount: 5 };
        }
    }

    return {
        type: selectedType === 'hero' ? 'card' : selectedType,
        key: selectedKey,
        isRare: true,
        isNew,
        convertedCurrency,
        displayImage,
        name,
        cost: itemCost
    };
};

// 抽取皮肤逻辑（[2026-08-15] 按池过滤皮肤池）
const rollSkin = (collection: UserCollection, poolId: PoolId = 'permanent'): GachaResult => {
    const skinPool = getSkinRarePool(poolId);
    const target = skinPool[Math.floor(Math.random() * skinPool.length)];

    const safeOwnedSkins = collection.ownedSkins || {};
    const ownedSkinIds = safeOwnedSkins[target.cardKey] || [];
    const hasSkin = ownedSkinIds.includes(target.skinId);

    let isNew = !hasSkin;
    let convertedCurrency = undefined;

    if (hasSkin) {
        convertedCurrency = { type: 'bitGold' as const, amount: 1 };
    }

    const cardBase = CARD_DB[target.cardKey];
    const cardName = cardBase ? cardBase.name : "未知单位";

    return {
        type: 'skin',
        key: target.cardKey,
        skinId: target.skinId,
        isRare: true,
        isNew,
        convertedCurrency,
        displayImage: getSkinImage(target.cardKey, target.skinId, cardBase?.imageUrl), // [2026-08-15] 修复原 fallback 误传 boolean
        name: `${cardName} · 皮肤`
    };
};

// 抽取普通物品逻辑
const rollCommon = (collection: UserCollection, poolId: PoolId = 'permanent'): GachaResult => {
    const commonPool = getCommonPool(poolId);
    const card = commonPool[Math.floor(Math.random() * commonPool.length)];

    const owned = collection.ownedCards[card.key] || 0;
    let isNew = true;
    let convertedCurrency = undefined;

    if (owned >= 3) {
        isNew = false;
        const price = getCardPrice(card.cost);
        const refund = Math.floor(price * 0.25);
        convertedCurrency = { type: 'silverCoin' as const, amount: refund };
    } else if (owned > 0) {
        isNew = false;
    }

    return {
        type: 'card',
        key: card.key,
        isRare: false,
        isNew,
        convertedCurrency,
        displayImage: card.imageUrl,
        name: card.name,
        cost: card.cost
    };
};
