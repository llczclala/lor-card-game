import { CARD_DB } from '../data/cards';
import { ENEMY_ARCHETYPES } from '../data/enemies/archetypes';
import type { EnemyHeroConfig } from '../types/gameModeTypes';

/**
 * 遭遇战结果接口
 */
interface EncounterData {
    deck: string[];
    heroConfig: EnemyHeroConfig;
    passiveEffects: string[]; // 本场对局的全局被动 (天启)
}

/**
 * 辅助：获取公共填充池 (Logistics 阵营非英雄卡)
 * 用于当流派专属池不够时兜底
 */
const getLogisticsPool = (): string[] => {
    return Object.values(CARD_DB)
        .filter(c => c.region === 'Logistics' && !c.isChampion)
        .map(c => c.key);
};

/**
 * 核心逻辑：填充卡组直到 40 张
 */
const fillDeckToSize = (initialDeck: string[], preferredPool: string[], targetSize: number = 40): string[] => {
    const deck = [...initialDeck];
    const logisticsPool = getLogisticsPool();

    // 合并池：优先用 preferred，没有了用 logistics
    // 如果 preferred 里的卡不存在于 CARD_DB (比如拼写错误)，过滤掉
    const validPreferred = preferredPool.filter(key => CARD_DB[key]);

    // 如果两个池子都空了 (极端情况)，就只能填核心英雄了
    const fallbackCard = initialDeck[0] || 'fenny';

    while (deck.length < targetSize) {
        // 70% 概率选流派特色卡，30% 概率选后勤通用卡
        const usePreferred = validPreferred.length > 0 && Math.random() < 0.7;

        let pool = usePreferred ? validPreferred : logisticsPool;
        if (pool.length === 0) pool = [fallbackCard]; // 最后的兜底

        const randomKey = pool[Math.floor(Math.random() * pool.length)];
        deck.push(randomKey);
    }

    // 洗牌
    return deck.sort(() => Math.random() - 0.5);
};

/**
 * 构建 [标准 PVE 模式] 的遭遇战
 * 逻辑：随机抽取一个流派，去除天启效果，生成 40 张卡组
 */
export const buildStandardEncounter = (): EncounterData => {
    // 1. 随机选择一个流派 (Archetype)
    const archetypeKeys = Object.keys(ENEMY_ARCHETYPES);
    const randomKey = archetypeKeys[Math.floor(Math.random() * archetypeKeys.length)];
    const archetype = ENEMY_ARCHETYPES[randomKey];

    // 2. 生成卡组
    // 标准模式固定 40 张
    const fullDeck = fillDeckToSize(archetype.coreCards, archetype.preferredPool, 40);

    // 3. 返回配置
    return {
        deck: fullDeck,
        heroConfig: {
            heroKey: archetype.champion,
            level: 1, // 标准模式默认 1 级
            customName: archetype.name // 使用流派名作为敌方名字，增加代入感
        },
        passiveEffects: [] // 标准模式不启用天启系统
    };
};

/**
 * [预留] 构建 [肉鸽模式] 的遭遇战
 */
export const buildRoguelikeEncounter = (_stage: number, _difficulty: number): EncounterData => {
    // TODO: 实现基于难度的动态构建逻辑
    // 比如：stage > 3 时 heroLevel = 2
    // 比如：带入 archetype.apocalypseTags
    console.warn("Roguelike encounter builder not implemented yet.");
    return buildStandardEncounter(); // 暂时回退到标准模式
};

/**
 * [预留] 构建 [教程模式] 的遭遇战
 */
export const buildTutorialEncounter = (_tutorialId: string): EncounterData => {
    // TODO: 返回固定的死数据
    return {
        deck: ['fenny', 'fenny', 'fenny'], // 仅作示例
        heroConfig: { heroKey: 'fenny', level: 1, customName: "教官" },
        passiveEffects: []
    };
};