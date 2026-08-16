import { CARD_DB } from '../data/cards';
import { ENEMY_ARCHETYPES } from '../data/enemies/archetypes';
import { TUTORIAL_STAGES } from '../data/tutorialStages';
import type { EnemyHeroConfig } from '../types/gameModeTypes';
import type { RogueDifficulty } from '../data/roguelike/difficulties'; // [2026-08-07 难度系统]
import { DIFFICULTY_HP_MULTIPLIER, DIFFICULTY_LEVEL_BONUS } from '../data/roguelike/difficulties'; // [2026-08-07 难度系统]

/**
 * 遭遇战结果接口
 */
interface EncounterData {
    deck: string[];
    heroConfig: EnemyHeroConfig;
    passiveEffects: string[]; // 本场对局的全局被动 (天启)
    aiPersonality?: 'aggressive' | 'control' | 'balanced'; // [2026-08-06] AI 流派性格
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
 * [核心新增] 辅助：解析核心卡组配置
 * 能够将 { key, count } 展开为平铺数组，同时向下兼容旧版 string[]
 */
const parseCoreCards = (coreCards: any[]): string[] => {
    if (!coreCards || coreCards.length === 0) return [];
    // 兼容旧版写法
    if (typeof coreCards[0] === 'string') {
        return coreCards as string[];
    }
    // 工业级解压
    const expanded: string[] = [];
    (coreCards as { key: string; count: number }[]).forEach(item => {
        for (let i = 0; i < item.count; i++) {
            expanded.push(item.key);
        }
    });
    return expanded;
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
    const parsedCoreCards = parseCoreCards(archetype.coreCards);

    // [核心升级] 尊重 exactDeck 绝对纯净锁！如果加锁，或者初始配置已满 40 张，直接发货并物理洗牌
    const fullDeck = (archetype as any).exactDeck || parsedCoreCards.length >= 40
        ? parsedCoreCards.sort(() => Math.random() - 0.5)
        : fillDeckToSize(parsedCoreCards, archetype.preferredPool, 40);

    // 3. 返回配置
    return {
        deck: fullDeck,
        heroConfig: {
            heroKey: archetype.champion,
            level: 1, // 标准模式默认 1 级
            customName: archetype.name // 使用流派名作为敌方名字，增加代入感
        },
        passiveEffects: [], // 标准模式不启用天启系统
        aiPersonality: archetype.aiPersonality, // [2026-08-06] 把流派性格传给 AI
    };
};

/**
 * 构建 [肉鸽模式] 的遭遇战
 * 难度曲线：Act 越高越强；精英/Boss 更高等级 + 血量倍率
 * 框架阶段：从现有流派随机选，Boss/精英通过 level + hpMultiplier 强化
 */
export const buildRoguelikeEncounter = (nodeType: 'battle' | 'elite' | 'boss', _act: number, difficulty: RogueDifficulty = 'normal', archetypeId?: string): EncounterData => {
    const archetypeKeys = Object.keys(ENEMY_ARCHETYPES);
    // [2026-08-10 预分配敌人] 优先用节点预分配的流派（保证地图头像与实际对手一致），否则随机
    const archetype = archetypeId ? ENEMY_ARCHETYPES[archetypeId] : ENEMY_ARCHETYPES[archetypeKeys[Math.floor(Math.random() * archetypeKeys.length)]];
    const parsedCoreCards = parseCoreCards(archetype.coreCards);
    const fullDeck = (archetype as any).exactDeck || parsedCoreCards.length >= 40
        ? parsedCoreCards.sort(() => Math.random() - 0.5)
        : fillDeckToSize(parsedCoreCards, archetype.preferredPool, 40);
    // [TODO] 后续可用 archetype.apocalypseTags 挂载天启遗物被动
    // [2026-08-07 难度系统] 基础血量倍率 × 难度倍率；等级 + 难度加成（只增强敌人，不动 AI 行为）
    const baseHp = nodeType === 'boss' ? 1.5 : nodeType === 'elite' ? 1.25 : 1;
    const hpMultiplier = baseHp * DIFFICULTY_HP_MULTIPLIER[difficulty];
    const level = ((nodeType === 'boss' || nodeType === 'elite') ? 2 : 1) + DIFFICULTY_LEVEL_BONUS[difficulty];
    return {
        deck: fullDeck,
        heroConfig: {
            heroKey: archetype.champion,
            level,
            customName: archetype.name,
            hpMultiplier,
        },
        passiveEffects: [],
        aiPersonality: archetype.aiPersonality, // [2026-08-06] 透传流派性格
    };
};

/**
 * 构建 [教程模式] 的遭遇战
 * 教程模式不再通过 archetype 生成敌方牌组，
 * 优先使用关卡数据中直接指定的 enemyDeck。
 */
export const buildTutorialEncounter = (tutorialId: string): EncounterData => {
    const stage = TUTORIAL_STAGES[tutorialId];
    if (!stage) {
        console.warn(`[EncounterBuilder] Unknown tutorial stage: ${tutorialId}, using fallback`);
        return buildFallbackTutorial();
    }

    // ★ 优先使用关卡中直接指定的 enemyDeck
    if (stage.enemyDeck && stage.enemyDeck.length > 0) {
        const archetype = stage.enemyArchetypeId ? ENEMY_ARCHETYPES[stage.enemyArchetypeId] : null;
        return {
            deck: stage.enemyDeck,
            heroConfig: {
                heroKey: archetype?.champion || 'fenny',
                level: stage.enemyHeroLevel ?? 1,
                customName: archetype?.name || '敌方',
            },
            passiveEffects: [],
        };
    }

    // 兼容旧版：走 enemyOverrideDeck
    if (stage.enemyOverrideDeck && stage.enemyOverrideDeck.length > 0) {
        const archetype = ENEMY_ARCHETYPES[stage.enemyArchetypeId || ''];
        return {
            deck: stage.enemyOverrideDeck,
            heroConfig: {
                heroKey: archetype?.champion || 'fenny',
                level: stage.enemyHeroLevel ?? 1,
                customName: archetype?.name || '敌方',
            },
            passiveEffects: [],
        };
    }

    // 最后的兜底：尝试从 archetype 生成（旧教程关卡兼容）
    const archetype = stage.enemyArchetypeId ? ENEMY_ARCHETYPES[stage.enemyArchetypeId] : null;
    if (!archetype) {
        console.warn(`[EncounterBuilder] Stage ${tutorialId} has no enemyDeck and no archetype, using fallback`);
        return buildFallbackTutorial();
    }

    const parsedCoreCards = parseCoreCards(archetype.coreCards);
    const fullDeck = (archetype as any).exactDeck || parsedCoreCards.length >= 40
        ? parsedCoreCards.sort(() => Math.random() - 0.5)
        : fillDeckToSize(parsedCoreCards, archetype.preferredPool, 40);

    return {
        deck: fullDeck,
        heroConfig: {
            heroKey: archetype.champion,
            level: stage.enemyHeroLevel ?? 1,
            customName: archetype.name,
        },
        passiveEffects: [],
    };
};

/** 教程模式的安全兜底 */
const buildFallbackTutorial = (): EncounterData => ({
    deck: ['fenny', 'fenny', 'fenny'],
    heroConfig: { heroKey: 'fenny', level: 1, customName: "教官" },
    passiveEffects: [],
});