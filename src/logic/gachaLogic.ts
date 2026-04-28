import { CARD_DB } from '../data/cards';
import { PERSONALIZATION_ASSETS } from '../data/imageData';
import type { UserCollection } from '../types';

// --- 常量定义 ---
export const GACHA_COST_SINGLE = 160;
export const GACHA_COST_TEN = 1600;
export const MAX_PITY = 100; // 100抽保底
export const RARE_RATE = 0.02; // 2% 稀有率

// 稀有物品类型
export type GachaItemType = 'card' | 'cardBack' | 'desk';

// 抽卡结果接口
export interface GachaResult {
    type: GachaItemType;
    key: string | number; // 卡牌是 string (key), 饰品是 number (index)
    isRare: boolean;      // 是否是稀有资源 (英雄/饰品)
    isNew: boolean;       // 是否是新获得的
    convertedCurrency?: { // 如果重复，转换为什么货币及数量
        type: 'silverCoin' | 'bitGold';
        amount: number;
    };
    displayImage: string; // 用于动画展示的图片
    name: string;         // 用于展示的名称
    cost?: number;        // [新增] 卡牌费用，用于展示
}

// [新增] 价格计算公式
export const getCardPrice = (cost: number): number => {
    if (cost >= 0 && cost <= 2) return 400;
    if (cost >= 3 && cost <= 5) return 800;
    if (cost >= 6 && cost <= 8) return 1200;
    return 2400; // 9+ 费
};

// --- 1. 构建卡池 ---

// 获取所有普通卡牌 (非英雄，非TEST，非锁定)
const getCommonPool = () => {
    return Object.values(CARD_DB).filter(c =>
        !c.isChampion &&
        c.region !== 'TEST' &&
        !c.key.startsWith('test_')
    );
};

// 获取所有稀有资源 (英雄 + 卡背 + 牌桌)
const getRarePool = () => {
    const heroes = Object.values(CARD_DB).filter(c => c.isChampion);

    // 卡背 (索引数组) - 跳过索引0 (默认)
    const cardBacks = PERSONALIZATION_ASSETS.cardBacks.map((_, idx) => ({ type: 'cardBack' as const, index: idx })).filter(i => i.index !== 0);

    // 牌桌 (索引数组) - 跳过索引0 (默认)
    const desks = PERSONALIZATION_ASSETS.desks.map((_, idx) => ({ type: 'desk' as const, index: idx })).filter(i => i.index !== 0);

    return { heroes, cardBacks, desks };
};

// --- 2. 核心抽取函数 ---

export const rollOne = (
    collection: UserCollection,
    currentPity: number,
    targetItem: string | null
): GachaResult => {
    const isRarePull = (currentPity >= MAX_PITY - 1) || (Math.random() < RARE_RATE);

    if (isRarePull) {
        return rollRare(collection, targetItem);
    } else {
        return rollCommon(collection);
    }
};

// 抽取稀有物品逻辑
const rollRare = (collection: UserCollection, targetItem: string | null): GachaResult => {
    const { heroes, cardBacks, desks } = getRarePool();

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
            if (cardBacks.find(cb => cb.index === idx)) {
                selectedType = 'cardBack';
                selectedKey = idx;
                displayImage = PERSONALIZATION_ASSETS.cardBacks[idx];
                name = `Card Style #${idx + 1}`;
                hitTarget = true;
            }
        } else if (targetObj.type === 'desk') {
            const idx = parseInt(targetObj.val);
            if (desks.find(d => d.index === idx)) {
                selectedType = 'desk';
                selectedKey = idx;
                displayImage = PERSONALIZATION_ASSETS.desks[idx];
                name = `Battlefield #${idx + 1}`;
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
            selectedKey = cb.index;
            displayImage = PERSONALIZATION_ASSETS.cardBacks[cb.index];
            name = `Card Style #${cb.index + 1}`;
        } else {
            const d = desks[rand - heroes.length - cardBacks.length];
            selectedType = 'desk';
            selectedKey = d.index;
            displayImage = PERSONALIZATION_ASSETS.desks[d.index];
            name = `Battlefield #${d.index + 1}`;
        }
    }

    // C. 重复检测 (稀有资源 -> 5 比特金)
    let isNew = true;
    let convertedCurrency = undefined;

    if (selectedType === 'hero') {
        const owned = collection.ownedCards[selectedKey as string] || 0;
        if (owned >= 3) {
            isNew = false;
            // [修正] 稀有资源重复 -> 固定 5 比特金
            convertedCurrency = { type: 'bitGold' as const, amount: 5 };
        } else if (owned > 0) {
            isNew = false; // 不算新卡，但不满3张也不转化
        }
    } else {
        // 饰品类：通常通过 UserSystem 外部判断解锁状态
        // 但这里我们假设只要是重复抽到（无论是否解锁逻辑如何），都给转化
        // 为了保险，我们在 rollOne 里默认它是新的，具体“是否已拥有”的转化逻辑
        // 最好在 useUserSystem 的 performGacha 中通过 unlockedLists 再次校验覆盖。
        // 但根据需求，如果逻辑层能判断最好。由于 collection 里没存 unlocked 列表，
        // 这里暂时保持 isNew = true，让 UI 显示获得。
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

// 抽取普通物品逻辑
const rollCommon = (collection: UserCollection): GachaResult => {
    const commonPool = getCommonPool();
    const card = commonPool[Math.floor(Math.random() * commonPool.length)];

    // 重复检测 (普通卡 -> 1/4 价格的通用银)
    const owned = collection.ownedCards[card.key] || 0;
    let isNew = true;
    let convertedCurrency = undefined;

    if (owned >= 3) {
        isNew = false;
        // [修正] 使用 getCardPrice 计算原价，然后 * 0.25
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