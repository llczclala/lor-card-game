import { CARD_DB } from '../data/cards';
import { PERSONALIZATION_ASSETS, SKIN_IMAGES, getSkinImage } from '../data/imageData';
import { getGachaItems } from '../data/skinData'; // [核心修复] 统一使用通用物资调取 API
import type { UserCollection } from '../types';

// --- 常量定义 ---
export const GACHA_COST_SINGLE = 160;
export const GACHA_COST_TEN = 1600;
export const MAX_PITY = 100; // 100抽保底
export const RARE_RATE = 0.02; // 2% 稀有率
export const SKIN_RATE = 0.04; // [核心新增] 4% 独立皮肤率

// 稀有物品类型
export type GachaItemType = 'card' | 'cardBack' | 'desk' | 'skin'; // [核心新增] 加入 skin 类型

// 抽卡结果接口
export interface GachaResult {
    type: GachaItemType;
    key: string | number; // 卡牌是 string (key), 饰品是 number (index)
    skinId?: number;      // [核心新增] 用于传递抽中皮肤的真实 ID
    isRare: boolean;      // 是否是稀有资源 (英雄/饰品/皮肤)
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
        !c.key.startsWith('test_') &&
        c.isCollectible !== false // [核心提纯] 彻底封杀所有衍生法术、图征小队、泰坦巨兽等非构筑单元！
    );
};

// 获取所有稀有资源 (英雄 + 卡背 + 牌桌)
const getRarePool = () => {
    const heroes = Object.values(CARD_DB).filter(c => c.isChampion);

    // [核心修复] 彻底废除硬编码过滤！向《全息外观资产调度局》按需调取盲盒专供的饰品列表！
    const cardBacks = getGachaItems('cardBack');
    const desks = getGachaItems('desk');

    return { heroes, cardBacks, desks };
};

// [核心修复] 彻底废弃极其脆弱的动态扫描，直接向《皮肤资产注册局》索要合法的盲盒皮肤清单！
const getSkinRarePool = () => {
    // [修正] 调用通用 API 并传入 'skin' 类型，同时利用类型断言保证后续逻辑的字段安全
    return getGachaItems('skin') as { cardKey: string, skinId: number }[];
};

// --- 2. 核心抽取函数 ---

export const rollOne = (
    collection: UserCollection,
    currentPity: number,
    currentSkinPity: number, // [核心新增] 引入皮肤专属 30 抽保底游标
    targetItem: string | null,
    userSettings?: any // [新增] 透传用户设置以便检查饰品是否解锁
): GachaResult => {
    // 1. 皮肤 30 抽强保底熔断 (优先级最高，因为皮肤池不出卡背和英雄，不影响核心战力保底)
    if (currentSkinPity >= 29) {
        return rollSkin(collection);
    }

    // 2. 百抽熔断机制：强制切入 2% 纯稀有池 (无皮肤)
    if (currentPity >= MAX_PITY - 1) {
        return rollRare(collection, targetItem, userSettings);
    }

    // 3. 常规三级盲盒解算
    const rollVal = Math.random();

    // a. 顶层 2% 稀有面
    if (rollVal < RARE_RATE) {
        return rollRare(collection, targetItem, userSettings);
    }
    // b. 独立 4% 皮肤面 [核心新增]
    else if (rollVal < RARE_RATE + SKIN_RATE) {
        return rollSkin(collection);
    }
    // c. 兜底 94% 普通面
    else {
        return rollCommon(collection);
    }
};

// 抽取稀有物品逻辑
const rollRare = (collection: UserCollection, targetItem: string | null, userSettings?: any): GachaResult => {
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
            const cbConfig = cardBacks.find(cb => cb.index === idx);
            if (cbConfig) {
                selectedType = 'cardBack';
                selectedKey = idx;
                displayImage = PERSONALIZATION_ASSETS.cardBacks[idx];
                name = cbConfig.name; // [核心修复] 动态读取调度局分发的名称
                hitTarget = true;
            }
        } else if (targetObj.type === 'desk') {
            const idx = parseInt(targetObj.val);
            const deskConfig = desks.find(d => d.index === idx);
            if (deskConfig) {
                selectedType = 'desk';
                selectedKey = idx;
                displayImage = PERSONALIZATION_ASSETS.desks[idx];
                name = deskConfig.name; // [核心修复] 动态读取调度局分发的名称
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
            selectedKey = cb.index!; // 调度单中一定包含该属性
            displayImage = PERSONALIZATION_ASSETS.cardBacks[cb.index!];
            name = cb.name; // [核心修复] 动态读取调度局分发的名称
        } else {
            const d = desks[rand - heroes.length - cardBacks.length];
            selectedType = 'desk';
            selectedKey = d.index!; // 调度单中一定包含该属性
            displayImage = PERSONALIZATION_ASSETS.desks[d.index!];
            name = d.name; // [核心修复] 动态读取调度局分发的名称
        }
    }

    // C. 重复检测 (稀有资源 -> 5 比特金)
    let isNew = true;
    let convertedCurrency = undefined;

    if (selectedType === 'hero') {
        const owned = collection.ownedCards[selectedKey as string] || 0;
        if (owned >= 3) {
            isNew = false;
            convertedCurrency = { type: 'bitGold' as const, amount: 5 };
        } else if (owned > 0) {
            isNew = false; // 不算新卡，但不满3张也不转化
        }
    } else if (selectedType === 'cardBack') {
        // [核心修复] 利用透传的 userSettings 查阅饰品解锁状态
        if (userSettings && userSettings.unlockedCardBacks.includes(selectedKey as number)) {
            isNew = false;
            convertedCurrency = { type: 'bitGold' as const, amount: 5 };
        }
    } else if (selectedType === 'desk') {
        // [核心修复] 同理，查阅牌桌解锁状态
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
// [新增] 抽取皮肤逻辑 (独立事件面)
const rollSkin = (collection: UserCollection): GachaResult => {
    const skinPool = getSkinRarePool();
    const target = skinPool[Math.floor(Math.random() * skinPool.length)];

    // [核心防线] 终极避震：如果账号太新或数据残缺导致 ownedSkins 对象不存在，强制视为一个空对象，防止读取崩溃！
    const safeOwnedSkins = collection.ownedSkins || {};
    // 从安全的皮肤仓库中查询是否已解锁
    const ownedSkinIds = safeOwnedSkins[target.cardKey] || [];
    const hasSkin = ownedSkinIds.includes(target.skinId);

    // 如果已经拥有该皮肤，直接折算为 1 比特金！
    let isNew = !hasSkin;
    let convertedCurrency = undefined;

    if (hasSkin) {
        convertedCurrency = { type: 'bitGold' as const, amount: 1 };
    }

    // 查卡牌原名用于提示
    const cardBase = CARD_DB[target.cardKey];
    const cardName = cardBase ? cardBase.name : "未知单位";

    return {
        type: 'skin',
        key: target.cardKey,
        skinId: target.skinId, // 绑定专属皮肤ID
        isRare: true, // 标记为稀有以触发高级视觉矩阵
        isNew,
        convertedCurrency,
        displayImage: getSkinImage(target.cardKey, target.skinId, cardBase?.level === 2), // 提取高精度皮肤原画
        name: `${cardName} · 皮肤`
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