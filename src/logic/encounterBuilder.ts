import { CARD_DB } from '../data/cards';
import { ENEMY_ARCHETYPES } from '../data/enemies/archetypes';
import { TUTORIAL_STAGES } from '../data/tutorialStages';
import type { EnemyHeroConfig } from '../types/gameModeTypes';
import type { RogueDifficulty } from '../data/roguelike/difficulties'; // [2026-08-07 难度系统]
import { ENEMY_NEXUS_BASE } from '../data/roguelike/difficulties'; // [2026-08-28 敌方水晶基础生命] · [2026-09-29 移除血量倍率/等级加成两组常量]
import { getBuffById, getBattleEffects } from '../data/roguelike/buffs'; // [2026-08-28] 敌方水晶生命强化折算 · [2026-09-28] 多效果条目
import { getEquipPoolForCard, type EquipmentRarity } from '../data/equipment'; // [2026-08-30] 敌人随机装备

/**
 * 遭遇战结果接口
 */
interface EncounterData {
    deck: string[];
    heroConfig: EnemyHeroConfig;
    passiveEffects: string[]; // 本场对局的全局被动 (天启)
    aiPersonality?: 'aggressive' | 'control' | 'balanced'; // [2026-08-06] AI 流派性格

    // [2026-08-17 莉莉子] 敌方卡背索引（来自 EnemyArchetype.cardBackIndex，未配置=默认卡背 0）
    enemyCardBackIndex?: number;
    enemyBuffs?: string[]; // [2026-08-27 莉莉子] 敌方迷宫强化 id（流派配置 archetype.rogueBuffs，战斗内 battleEffect 生效）
    enemyNexusHp?: number; // [2026-08-28 莉莉子] 敌方水晶初始血量（肉鸽：难度基础值 + 生命强化折算；缺省 20）
    enemyEquipments?: Record<string, string[]>; // [2026-08-30 程拍板] 敌方单位卡随机佩戴的装备（难度分级：普通无紫金/机密无红/绝密全红）
}

/**
 * 辅助：获取公共填充池 (Logistics 阵营非英雄卡)
 * 用于当流派专属池不够时兜底
 *
 * [2026-10-23 莉莉子 BUG修复 · 衍生卡混进 AI 牌库]
 * ── 病根（程提出）：本池原先只过滤 `region` 与 `isChampion`，**没有过滤 `isCollectible`**
 *    ⇒ 所有 `isCollectible: false` 的**衍生法术**（如「囤积」「刻骨冰寒」这类
 *      由强化/干员在局内生成的卡）都会被当作填充料塞进 AI 的 40 张牌库。
 *    `isCollectible` 的本意是"普通玩家无法加入卡组"，但**衍生卡同样不该出现在 AI 牌库里**——
 *    它们的存在前提是"某个局内来源生成了它"。
 * ── 修法：补 `c.isCollectible !== false`，与 `gachaLogic` / `rewards` / `shop` /
 *    `rogueStarterDecks` 四处玩家侧口径**完全一致**（那些地方早就在过滤，只有这里漏了）。
 * ── 影响面：仅缩小"填充池"。流派**手配**的 coreCards / preferredPool 不经此池
 *    （它们直接进 deck），所以手工配置的既有卡组逐字不变。
 */
const getLogisticsPool = (): string[] => {
    return Object.values(CARD_DB)
        .filter(c => c.region === 'Logistics' && !c.isChampion && c.isCollectible !== false)
        .map(c => c.key);
};

/**
 * [2026-08-28 莉莉子] 敌方水晶生命强化折算：扫描 enemyBuffs 里 NEXUS_HP_BOOST 效果的 value 和
 * （中后段敌人 +10 / Boss +20，节点预分配进 enemyBuffs，这里折算进敌方水晶初始血量）
 */
const sumNexusBoost = (enemyBuffs: string[]): number =>
    enemyBuffs.reduce((sum, id) => {
        const b = getBuffById(id);
        if (!b) return sum;
        // [2026-09-28] 走统一定义表：一条强化可能有多个效果
        for (const be of getBattleEffects(b)) {
            if (be.effectClass === 'NEXUS_HP_BOOST') sum += (be.params?.value as number) ?? 0;
        }
        return sum;
    }, 0);

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
            customName: archetype.name // 使用流派名作为敌方名字，增加代入感
        },
        passiveEffects: [], // 标准模式不启用天启系统
        aiPersonality: archetype.aiPersonality, // [2026-08-06] 把流派性格传给 AI
        enemyCardBackIndex: archetype.cardBackIndex ?? 0, // [2026-08-17 莉莉子] 敌方卡背
    };
};

// [2026-08-30 程拍板] 敌人随机装备品质上限（难度分级）：普通最高蓝 / 机密最高金 / 绝密全红
const RARITY_RANK: Record<EquipmentRarity, number> = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4, mythic: 5 };
const QUALITY_MAX: Record<RogueDifficulty, EquipmentRarity> = {
    normal: 'rare',
    secret: 'legendary',
    topsecret: 'mythic',
};
const QUALITY_WEIGHTS: Record<EquipmentRarity, number> = { common: 15, uncommon: 45, rare: 25, epic: 10, legendary: 4, mythic: 1 };

/**
 * [2026-10-08 程拍板 · 口径变更] 敌人随机装备：**每一个单位卡 key 都挂装备**，件数按难度递增。
 *
 *  ── 旧口径（**已废**）：整副牌组里只挑 count 张卡各挂 1 件（普通难度仅 1 张）
 *     ⇒ 程判定「对手就太弱了」，改为下述新口径。
 *  ── 新口径：**牌组里所有"有可用装备池"的非天启者卡**都挂，每张挂 `件数` 件：
 *        件数 = 难度基础（普通 0 / 机密 1 / 绝密 2） + 节点追加（精英 +1 / Boss +2）
 *              ⚠️ [2026-10-10 程拍板] 难度基础由 1/2/3 下调为 **0/1/2**（程：「现在又太强了」）
 *  ── 品质仍按难度：上限 普通≤蓝 / 机密≤金 / 绝密全红，且按固定权重加权（白绿为主，高档渐稀）。
 *
 *  ⚠️ 装备按 **卡 key** 挂载（`Record<cardKey, string[]>`），同 key 的副本共享 ⇒
 *     「每张卡都挂」在实现上 = 「每个不同的单位卡 key 都挂」（副本无法分开配装）。
 *  ⚠️ **量级口径（程 2026-10-08 指正）**：衡量标准是「**平均每张卡携带几件**」，**不是**「整副牌组总共几件」。
 *     因为装备按卡 key 挂、同类副本共享 ⇒ 用"去重件数"看会严重失真：
 *     · 单位类别多的流派 ⇒ 去重件数 = 类别数 × p（看着很多）
 *     · **只有 1 个单位类别的流派 ⇒ 去重件数只有 p 件（看着像"个位数"）**，但它的每一张单位卡照样携带 p 件
 *     ⇒ 正确的量 = **每个单位卡 key 恰好 p 件 ⇒ 每张单位卡携带 p 件**（与类别数、副本数无关）。
 *     实测（`.tmp/probe4-percard.mjs`）：每个 key 实挂件数恒为 p，零短缺。
 *  ✅ [2026-10-08 程拍板] **法术卡也已纳入配装**：单位卡 → 通用装备池；**法术卡 → spellOnly 专属池**
 *     （速记草稿 / 誊抄副本 / 加急誊本 / 连锁引信）。四件全是**静态修饰**（`costMod` / `keywords`），
 *     `attachEquipment` 写入即生效；【回响】Echo 由 `useSpellSystem.ts:957-969` 结算后处理，且**按方分 player/enemy 手牌** ⇒ 对敌方能真生效。
 *     修复前：整副牌组零单位卡的纯法术流派（倒计时7回合 / 鬼影森森）一件装备都拿不到。
 *  🎛️ 程调整处：只改下面两个常量即可整体升降档，不必动逻辑。
 */
// [2026-10-10 程拍板 · 平衡调整] 件数整体**下调一档**：1/2/3 → **0/1/2**
//   （程：「现在又太强了」）⇒ 普通难度的**普通战斗节点 = 0 件**（敌人裸装）；
//   节点追加件数（精英 +1 / Boss +2）**不变** ⇒ 普通 Boss 仍有 2 件、绝密 Boss 4 件。
const EQUIP_PIECES: Record<RogueDifficulty, number> = { normal: 0, secret: 1, topsecret: 2 };
const NODE_EXTRA_PIECES: Record<'battle' | 'elite' | 'boss', number> = { battle: 0, elite: 1, boss: 2 };

const rollEnemyEquipments = (deck: string[], nodeType: 'battle' | 'elite' | 'boss', difficulty: RogueDifficulty): Record<string, string[]> => {
    // [2026-10-10 独立审查 P7 · 二轮 F3 更正 · **三轮 F5 再更正**] 兜底由 `?? 1` 改为 `?? 0`。
    //   我先后写错/说过头两句，如实留档（免得下一次审计被这两句误导）：
    //     ① "旧写法会给未知难度配 1 件" —— **错**（二轮证伪）：相邻的
    //        `RARITY_RANK[QUALITY_MAX[difficulty]]` 同样无兜底 ⇒ `maxRank = undefined`
    //        ⇒ 品质过滤恒 false ⇒ 池空 ⇒ 件数**本来就恒为 0**。
    //     ② "这个 `??` 实际不可达" —— **证据不足**（三轮指出）：类型层确实不可达
    //        （`RogueDifficulty` 三键、两张表全覆盖），但 `loadPendingRun` 把存档 run **整对象塞回
    //        且不校验 `difficulty`** ⇒ 脏/旧存档可带非三值键，那时 `?? 0` 会被求值。
    //   ⇒ 净结论：对**合法难度**与**脏存档**都**行为中性**（脏键下 `pieces` 是 1 还是 0 都挂不上装备，
    //      因为池恒空）。改它只为不留下一个"读起来像默认给 1 件"的假兜底。
    const pieces = (EQUIP_PIECES[difficulty] ?? 0) + (NODE_EXTRA_PIECES[nodeType] ?? 0);

    // [2026-10-08 程拍板] 可配装的卡 = 牌组里**所有有可用装备池的非天启者卡**（不再抽样挑卡）：
    //   · 单位卡 → 通用装备池（getEquipPoolForCard 自动只给非 spellOnly）
    //   · **法术卡 → spellOnly 专属池**（速记草稿/誊抄副本/加急誊本/连锁引信）
    //   ⚠️ 旧实现写死 `c.type === 'unit'` ⇒ 纯法术流派裸奔（见上方文档注释）
    const equipableKeys = Array.from(new Set(deck.filter(k => {
        const c = CARD_DB[k];
        if (!c || c.isChampion) return false;
        return getEquipPoolForCard(c).length > 0; // 池空（如无适用装备）则跳过，避免挂空
    })));

    const maxRank = RARITY_RANK[QUALITY_MAX[difficulty]];
    const result: Record<string, string[]> = {};
    for (const key of equipableKeys) {
        const card = CARD_DB[key];
        const chosen: string[] = [];
        for (let i = 0; i < pieces; i++) {
            // excludeIds = 本张卡已选的件（不重复挂同一件）
            const pool = getEquipPoolForCard(card, chosen).filter(e => RARITY_RANK[e.rarity] <= maxRank);
            if (!pool.length) break;
            const weights = pool.map(e => QUALITY_WEIGHTS[e.rarity] ?? 5);
            const total = weights.reduce((s, w) => s + w, 0);
            let roll = Math.random() * total;
            let pick = pool[0];
            for (let j = 0; j < pool.length; j++) {
                roll -= weights[j];
                if (roll <= 0) { pick = pool[j]; break; }
            }
            chosen.push(pick.id);
        }
        if (chosen.length) result[key] = chosen;
    }
    return result;
};

/**
 * 构建 [肉鸽模式] 的遭遇战
 * [2026-09-29 程拍板] 敌人强度**不再**用血量倍率 / 等级加成（已移除），改为两条合规轴：
 *   ① 装备 —— rollEnemyEquipments（难度分级 + 精英/Boss 加件数）
 *   ② 迷宫强化 —— enemyBuffs（节点预分配，中后段 +10 / Boss +20 水晶生命折算进初值）
 *   精英/Boss 的额外压力 = 更多装备 + 必带 +20 水晶生命 + 地图给的强化档次。
 */
export const buildRoguelikeEncounter = (nodeType: 'battle' | 'elite' | 'boss', _act: number, difficulty: RogueDifficulty = 'normal', archetypeId?: string, enemyBuffs?: string[]): EncounterData => {
    const archetypeKeys = Object.keys(ENEMY_ARCHETYPES);
    // [2026-08-10 预分配敌人] 优先用节点预分配的流派（保证地图头像与实际对手一致），否则随机
    const archetype = archetypeId ? ENEMY_ARCHETYPES[archetypeId] : ENEMY_ARCHETYPES[archetypeKeys[Math.floor(Math.random() * archetypeKeys.length)]];
    const parsedCoreCards = parseCoreCards(archetype.coreCards);
    const fullDeck = (archetype as any).exactDeck || parsedCoreCards.length >= 40
        ? parsedCoreCards.sort(() => Math.random() - 0.5)
        : fillDeckToSize(parsedCoreCards, archetype.preferredPool, 40);
    // [TODO] 后续可用 archetype.apocalypseTags 挂载天启遗物被动
    // [2026-09-29 程拍板] 移除 baseHp / hpMultiplier / level 三项"数值倍率"设计 ——
    //   敌人强度只由**装备**（rollEnemyEquipments）+ **迷宫强化**（enemyBuffs）控制，不直接改单位数值或天启者等级。
    //   精英/Boss 的强度差异改由：更多装备（extraCount）、必带 +20 水晶生命强化、以及地图给的强化数体现。
    // [2026-08-28 莉莉子] 敌方水晶初始血量 = 难度基础值 + 生命强化折算（中后段 +10 / Boss +20，来自节点预分配）
    const finalEnemyBuffs = enemyBuffs ?? archetype.rogueBuffs ?? [];
    // [2026-08-30 程拍板] 敌人随机装备（难度分级 + 精英/Boss 修正）
    const enemyEquipments = rollEnemyEquipments(fullDeck, nodeType, difficulty);
    return {
        deck: fullDeck,
        heroConfig: {
            heroKey: archetype.champion,
            customName: archetype.name,
        },
        passiveEffects: [],
        aiPersonality: archetype.aiPersonality, // [2026-08-06] 透传流派性格
        enemyCardBackIndex: archetype.cardBackIndex ?? 0, // [2026-08-17 莉莉子] 敌方卡背
        enemyBuffs: finalEnemyBuffs, // [2026-08-27 莉莉子] 敌方迷宫强化：优先节点预分配（mapLayout roll 子集，与地图预览一致）；兜底流派配置库（旧调用兼容）
        enemyNexusHp: ENEMY_NEXUS_BASE[difficulty] + sumNexusBoost(finalEnemyBuffs), // [2026-08-28 莉莉子] 敌方水晶初始血量
        enemyEquipments,
    };
};

/**
 * [2026-10-08 莉莉子 · 瓦尔基里大赛] **按指定天启者构建遭遇**（事件战斗的"打谁"专用）。
 *
 * 与 `buildRoguelikeEncounter` 的区别：那个按**流派**（archetypeId）指定；本函数按**天启者 key**。
 *   · **单人** ⇒ 反查该英雄的流派（`fenny` → `fenny_pressure` / `lyfe` → `lyfe_blitz`）
 *   · **双人** ⇒ **动态合成一个混合流派** —— 现有流派数据里**没有**"里芙+芬妮"这种跨阵营组合，
 *     故把两个流派的 `coreCards` 与 `preferredPool` 取并集后交给 `fillDeckToSize` 补满 40 张。
 *   · 找不到对应流派的天启者 ⇒ **静默跳过该英雄**（不崩）；一个都没匹配上 ⇒ 退回通用构建
 *   · `extraBuffs` 与流派自带的 `rogueBuffs` **合并**（敌方持有强化：事件按难度逐档写死的那批）
 *   · ⚠️ 双人时 `heroConfig` 只能填**一个**英雄（卡组只有一个"英雄位"），
 *     另一位的卡作为**牌组内容**出现 —— 与"既有芬妮又有里芙的卡组"的语义一致。
 */
export const buildEncounterForHeroes = (
    heroKeys: string[],
    nodeType: 'battle' | 'elite' | 'boss',
    difficulty: RogueDifficulty = 'normal',
    extraBuffs: string[] = [],
): EncounterData => {
    const all = Object.values(ENEMY_ARCHETYPES);
    const found = heroKeys
        .map(k => all.find(a => a.champion === k))
        .filter((a): a is NonNullable<typeof a> => !!a);

    // 一个都没匹配上 ⇒ 退回通用构建（保证不空手）
    if (found.length === 0) return buildRoguelikeEncounter(nodeType, 1, difficulty, undefined, extraBuffs);

    const coreCards = found.flatMap(a => parseCoreCards(a.coreCards));
    const preferredPool = Array.from(new Set(found.flatMap(a => a.preferredPool ?? [])));
    const fullDeck = coreCards.length >= 40
        ? coreCards.sort(() => Math.random() - 0.5)
        : fillDeckToSize(coreCards, preferredPool, 40);

    const primary = found[0];
    const customName = found.length > 1 ? found.map(a => a.name).join(' · ') : primary.name;
    const buffs = Array.from(new Set([...(primary.rogueBuffs ?? []), ...extraBuffs]));

    return {
        deck: fullDeck,
        heroConfig: { heroKey: primary.champion, customName },
        passiveEffects: [],
        aiPersonality: primary.aiPersonality,
        enemyCardBackIndex: primary.cardBackIndex ?? 0,
        enemyBuffs: buffs,
        enemyNexusHp: ENEMY_NEXUS_BASE[difficulty] + sumNexusBoost(buffs),
        enemyEquipments: rollEnemyEquipments(fullDeck, nodeType, difficulty),
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
            customName: archetype.name,
        },
        passiveEffects: [],
    };
};

/** 教程模式的安全兜底 */
const buildFallbackTutorial = (): EncounterData => ({
    deck: ['fenny', 'fenny', 'fenny'],
    heroConfig: { heroKey: 'fenny', customName: "教官" },
    passiveEffects: [],
});