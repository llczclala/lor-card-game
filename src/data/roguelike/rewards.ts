// ==========================================
// 悖论迷宫 · 战斗胜利奖励生成（[2026-08-25 莉莉子] 程拍板 → [2026-08-29 修订 v3]）
//   - 三选一候选卡：三张一致带/不带装备（all-or-none；精英/Boss forceEquip 必带）
//   - 装备品质 = **act 递进 × 难度上限 × 天启者等级加成**：
//       难度上限：普通最高紫 / 机密最高金 / 绝密可红
//       白装（代价装备）Act1 登场，中后期退出
//       equipRarityBonus（等级奖励）→ 紫金加权
//   - 法术卡也按品质档（不再绕过 → 前期不再凭空出紫装）
//   - 与 shop.generateCardOffers 的区别：shop 均匀抽（非武装装备池，09-28 起排除武装）、无品质渐进；本文件按进度/难度/加成分档
// ==========================================
import { CARD_DB } from '../cards';
import { getEquipPoolForCard, type EquipmentRarity } from '../equipment';
import type { RogueDifficulty } from './difficulties';
import { ROGUE_HEROES } from './rogueStarterDecks'; // [2026-09-04] 首战英雄招募候选

export interface RewardCardOption {
    cardKey: string;
    equipId?: string; // 本次随机佩戴的**新**装备（undefined = 本候选不带新装备）
    /**
     * [2026-10-10 程拍板] 该卡在**当前牌组里已有的装备**（按卡 key 挂载，见 `run.equippedCards`）。
     *
     * 展示端必须把它与 `equipId` **一起**渲染 —— 程的原话：
     *   「如果他出现在三选一里时，有新增的装备 B，我们在那里看到的应该是这张卡牌
     *      **既有装备 A 又有装备 B**，而不是我们现在的只有装备 B」。
     *
     * ⚠️ 领取端本来就正确（装备按卡 key 存、`addEquippedCard` 是**追加**）⇒ 这里补的是**展示口径**。
     */
    existingEquipIds?: string[];
}

// ═══════════════════════════════════════════════
// 可调参数（程调整处）
// ═══════════════════════════════════════════════
/** 普通战斗三张一起佩戴装备的概率（0~1）；精英/Boss 传 forceEquip=true 必带 */
const EQUIP_CHANCE = 0.6;

// ───────────────────────────────────────────────
// [2026-10-10 程拍板 · 战斗奖励三选一三条调整] 可调旋钮
//   ① 允许**天启者**进候选（原先被 `!c.isChampion` 排除）
//   ② 候选优先取**牌组里已有的卡**（不然"很多次战斗胜利都是无效提升"）
//   ③ 但**至少有一张不是**牌组里的卡
// ───────────────────────────────────────────────
/** 逐张判定：该候选抽成**天启者**的概率（程：「允许出现，但概率低一点」） */
const CHAMPION_CHANCE = 0.08;
/** 逐张判定：该候选**优先从牌组已有卡里取**的概率（最后一格强制新卡、不吃这个概率） */
const DECK_PREFER_CHANCE = 0.75;

/** 装备品质 rank（难度上限截断用） */
const RARITY_RANK: Record<EquipmentRarity, number> = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4, mythic: 5 };

/** 难度装备品质上限：普通最高紫 / 机密最高金 / 绝密全开（程拍板） */
const DIFFICULTY_MAX_RARITY: Record<RogueDifficulty, EquipmentRarity> = {
    normal: 'epic',
    secret: 'legendary',
    topsecret: 'mythic',
};

/**
 * 基础品质权重（按 act 递进 + 难度上限截断 + 等级 equipRarityBonus 加权）。
 *  Act1：白20/绿55/蓝25；Act2：绿30/蓝45/紫20/金5；Act3：蓝25/紫50/金20/红5
 *  难度上限：超限稀有度权重并入最高允许档（普通 Act2 金→并紫、Act3 金红→并紫；机密 Act3 红→并金）
 */
const rarityWeights = (act: number, difficulty: RogueDifficulty, equipRarityBonus = 0): Record<EquipmentRarity, number> => {
    const base: Record<EquipmentRarity, number> = {
        common: act === 1 ? 20 : 0,           // 白装 Act1 登场
        uncommon: act === 1 ? 55 : act === 2 ? 30 : 0,
        rare: act === 1 ? 25 : act === 2 ? 45 : 25,
        epic: act === 1 ? 0 : act === 2 ? 20 : 50,
        legendary: act === 1 ? 0 : act === 2 ? 5 : 20,
        mythic: act === 3 ? 5 : 0,
    };
    // 难度上限截断：超限稀有度权重并入最高允许档
    const maxRank = RARITY_RANK[DIFFICULTY_MAX_RARITY[difficulty]];
    let overflow = 0;
    for (const r of Object.keys(base) as EquipmentRarity[]) {
        if (RARITY_RANK[r] > maxRank) { overflow += base[r]; base[r] = 0; }
    }
    if (overflow > 0) base[DIFFICULTY_MAX_RARITY[difficulty]] += overflow;
    // 天启者等级加成：紫金加权（equipRarityBonus %）
    if (equipRarityBonus > 0) {
        base.epic += equipRarityBonus;
        base.legendary += equipRarityBonus / 2;
    }
    return base;
};

/** 按品质权重为指定卡抽一件装备（法术卡同走品质档；池子按卡筛选）
 *  [2026-09-25 莉莉子 装备不叠加] excludeIds 传该卡已挂装备 → 抽不到新装备时返回 undefined（该候选自然变裸卡） */
const pickEquipByAct = (act: number, card: { type: string }, difficulty: RogueDifficulty, equipRarityBonus: number, excludeIds?: string[]): string | undefined => {
    const pool = getEquipPoolForCard(card, excludeIds);
    if (pool.length === 0) return undefined;
    const weights = rarityWeights(act, difficulty, equipRarityBonus);
    const candidates = pool.filter(e => (weights[e.rarity] ?? 0) > 0);
    if (candidates.length === 0) return undefined;
    const total = candidates.reduce((sum, e) => sum + (weights[e.rarity] ?? 0), 0);
    let roll = Math.random() * total;
    for (const e of candidates) {
        roll -= weights[e.rarity] ?? 0;
        if (roll <= 0) return e.id;
    }
    return candidates[candidates.length - 1].id;
};

/**
 * 生成 count 张不同的奖励候选卡（不重复）。
 * 三张一致带/不带装备（all-or-none）；精英/Boss 传 forceEquip=true 必带。
 * @param act 当前重数（1~3）决定品质档
 * @param opts.difficulty 难度（决定品质上限）
 * @param opts.equipRarityBonus 天启者等级装备稀有度加成（%）
 * @param opts.forceEquip 精英/Boss 必带装备
 * @param opts.equippedCards [2026-09-25 莉莉子 装备不叠加] 本局卡→装备映射（排除该卡已有装备，不发重复件）
 */
export const generateRewardOptions = (
    act: number,
    count: number,
    opts?: {
        difficulty?: RogueDifficulty;
        equipRarityBonus?: number;
        forceEquip?: boolean;
        equippedCards?: Record<string, string[]>;
        /** [2026-10-10 程拍板 ②③] 本局牌组的卡 key 列表（可含重复）—— 用于"优先出牌组已有卡" */
        deckKeys?: string[];
    },
): RewardCardOption[] => {
    const difficulty = opts?.difficulty ?? 'normal';
    const equipRarityBonus = opts?.equipRarityBonus ?? 0;
    const equippedCards = opts?.equippedCards;
    const deckSet = new Set(opts?.deckKeys ?? []);
    const withEquip = opts?.forceEquip ? true : Math.random() < EQUIP_CHANCE; // 精英/Boss 必带

    // [2026-10-10 程拍板 ①] 候选池**不再排除天启者** —— 天启者单列一池，按 CHAMPION_CHANCE 低概率取用
    const eligible = Object.values(CARD_DB).filter(c => c.isCollectible !== false);
    const plain = eligible.filter(c => !c.isChampion);
    const champs = eligible.filter(c => c.isChampion);

    const options: RewardCardOption[] = [];
    const used = new Set<string>();
    /** 从给定池里随机取一张**没用过**的 */
    const pickFrom = (list: typeof eligible): (typeof eligible)[number] | undefined => {
        const avail = list.filter(c => !used.has(c.key));
        if (avail.length === 0) return undefined;
        return avail[Math.floor(Math.random() * avail.length)];
    };

    for (let slot = 0; slot < count; slot++) {
        // ③ **最后一格强制"牌组里没有"** ⇒ 无论前面怎么抽，都保证"至少有一张不是牌组里的卡"
        const mustBeNew = slot === count - 1;
        // ① 低概率走天启者池
        const wantChampion = champs.length > 0 && Math.random() < CHAMPION_CHANCE;
        const base = wantChampion ? champs : plain;

        const card =
            mustBeNew
                ? (pickFrom(base.filter(c => !deckSet.has(c.key)))
                    ?? pickFrom(eligible.filter(c => !deckSet.has(c.key)))  // 天启者池取不到 ⇒ 放宽到全池
                    ?? pickFrom(base)
                    ?? pickFrom(eligible))
                // ② 优先牌组已有卡（牌组为空时自然跳过这一步）
                : ((deckSet.size > 0 && Math.random() < DECK_PREFER_CHANCE
                        ? pickFrom(base.filter(c => deckSet.has(c.key)))
                        : undefined)
                    ?? pickFrom(base)
                    ?? pickFrom(eligible));

        if (!card) break; // 池子被抽干（正常不会发生）
        used.add(card.key);
        const equipId = withEquip
            ? pickEquipByAct(act, card, difficulty, equipRarityBonus, equippedCards?.[card.key])
            : undefined;
        options.push({
            cardKey: card.key,
            equipId,
            // [2026-10-10 程拍板 ②] 把"牌组里已有的装备"一并交给展示端 ⇒ 渲染成 A + B
            existingEquipIds: equippedCards?.[card.key] ?? [],
        });
    }
    return options;
};

// ═══════════════════════════════════════════════
// [2026-09-04 莉莉子 + 程拍板] 首战胜利 · 天启者招募三选一
//   英雄本体卡 **×2**（[2026-10-03 程拍板] 原 ×1 ⇒ 死一次就没天启者法术可用）
//   + 随机 2 张该阵营可收集卡（随从/法术，非衍生）入队；
//   机密以上难度，候选英雄再随机带一件装备（穿在英雄本体卡上）。
//   ⚠️ 供「没有选择的天启者」首战招募——一次性的（run.heroRecruitDone 复位才再触发）
// ═══════════════════════════════════════════════

/** [2026-09-04] 首战英雄招募候选（三选一） */
export interface HeroRecruitOption {
    heroKey: string;
    companionKeys: string[]; // 随行 2 张阵营卡（随机、可收集、同 region、非英雄）
    equipId?: string;        // 机密以上：穿在英雄本体卡上的装备
}

/**
 * [2026-10-03 程拍板 · BUG-20261002-21] 首战招募**天启者本体张数**（唯一口径）。
 *
 * 为什么是 2：一张只是"能上场"，**死一次就再没有天启者法术可用**；
 * 两张才能在局内持续用上这位天启者的法术（与其余五套起手卡组 `本体 ×2` 的口径一致）。
 *
 * ⚠️ 发放（App.handleHeroRecruitPick）与展示（HeroRecruitModal 的卡牌列表）
 * **必须都读这个常量**，不要再各写一个 2（同一语义多处实现 = 必漏一处的老病）。
 */
export const HERO_RECRUIT_HERO_COUNT = 2;

/** 难度 → 随行装备品质档：普通无 / 机密绿蓝 / 绝密蓝紫（程拍板） */
const RECRUIT_EQUIP_RARITY: Partial<Record<RogueDifficulty, EquipmentRarity[]>> = {
    secret: ['uncommon', 'rare'],
    topsecret: ['rare', 'epic'],
};

const shuffle = <T,>(arr: T[]): T[] => {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
};

/**
 * [2026-09-04] 生成首战天启者招募候选：排除本局已选英雄 → 随机 3 名；
 * 每名抽该阵营可收集卡 2 张（region 匹配 + isCollectible + 非英雄 → 天然排除不可选到的衍生法术）；
 * 机密以上再抽一件该品质档、英雄本体可佩戴的装备。
 */
export const buildHeroRecruitOptions = (currentHeroKey: string, difficulty: RogueDifficulty, equippedCards?: Record<string, string[]>): HeroRecruitOption[] => {
    const candidates = shuffle(ROGUE_HEROES.filter(h => h.key !== currentHeroKey)).slice(0, 3);
    const allowedRarities = RECRUIT_EQUIP_RARITY[difficulty]; // undefined = 普通难度无装备
    return candidates.map(h => {
        const heroDef = CARD_DB[h.key];
        // 阵营卡池：与 generateRewardOptions 同语义（可收集非英雄），外加同 region
        const pool = Object.values(CARD_DB).filter(c =>
            c.region === h.region && c.isCollectible !== false && !c.isChampion,
        );
        const companionKeys = shuffle(pool).slice(0, 2).map(c => c.key);
        let equipId: string | undefined;
        if (allowedRarities && heroDef) {
            // [2026-09-25 莉莉子 装备不叠加] 排除该英雄卡已有装备 → 抽不到就裸身上阵
            const eqPool = (getEquipPoolForCard(heroDef, equippedCards?.[h.key]) ?? []).filter(e => allowedRarities.includes(e.rarity));
            if (eqPool.length) equipId = eqPool[Math.floor(Math.random() * eqPool.length)].id;
        }
        return { heroKey: h.key, companionKeys, equipId };
    });
};
