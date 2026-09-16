// ==========================================
// 悖论迷宫 · 战斗胜利奖励生成（[2026-08-25 莉莉子] 程拍板 → [2026-08-29 修订 v3]）
//   - 三选一候选卡：三张一致带/不带装备（all-or-none；精英/Boss forceEquip 必带）
//   - 装备品质 = **act 递进 × 难度上限 × 天启者等级加成**：
//       难度上限：普通最高紫 / 机密最高金 / 绝密可红
//       白装（代价装备）Act1 登场，中后期退出
//       equipRarityBonus（等级奖励）→ 紫金加权
//   - 法术卡也按品质档（不再绕过 → 前期不再凭空出紫装）
//   - 与 shop.generateCardOffers 的区别：shop 均匀抽（含武装）、无品质渐进；本文件按进度/难度/加成分档
// ==========================================
import { CARD_DB } from '../cards';
import { getEquipPoolForCard, type EquipmentRarity } from '../equipment';
import type { RogueDifficulty } from './difficulties';
import { ROGUE_HEROES } from './rogueStarterDecks'; // [2026-09-04] 首战英雄招募候选

export interface RewardCardOption {
    cardKey: string;
    equipId?: string; // 随机佩戴的装备（undefined = 裸卡）
}

// ═══════════════════════════════════════════════
// 可调参数（程调整处）
// ═══════════════════════════════════════════════
/** 普通战斗三张一起佩戴装备的概率（0~1）；精英/Boss 传 forceEquip=true 必带 */
const EQUIP_CHANCE = 0.6;

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

/** 按品质权重为指定卡抽一件装备（法术卡同走品质档；池子按卡筛选） */
const pickEquipByAct = (act: number, card: { type: string }, difficulty: RogueDifficulty, equipRarityBonus: number): string | undefined => {
    const pool = getEquipPoolForCard(card);
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
 */
export const generateRewardOptions = (
    act: number,
    count: number,
    opts?: { difficulty?: RogueDifficulty; equipRarityBonus?: number; forceEquip?: boolean },
): RewardCardOption[] => {
    const difficulty = opts?.difficulty ?? 'normal';
    const equipRarityBonus = opts?.equipRarityBonus ?? 0;
    const withEquip = opts?.forceEquip ? true : Math.random() < EQUIP_CHANCE; // 精英/Boss 必带
    const options: RewardCardOption[] = [];
    const used = new Set<string>();
    const pool = Object.values(CARD_DB).filter(c => c.isCollectible !== false && !c.isChampion);
    let guard = 0;
    while (options.length < count && used.size < pool.length && guard < 300) {
        guard++;
        const card = pool[Math.floor(Math.random() * pool.length)];
        if (used.has(card.key)) continue;
        used.add(card.key);
        options.push({ cardKey: card.key, equipId: withEquip ? pickEquipByAct(act, card, difficulty, equipRarityBonus) : undefined });
    }
    return options;
};

// ═══════════════════════════════════════════════
// [2026-09-04 莉莉子 + 程拍板] 首战胜利 · 天启者招募三选一
//   英雄本体卡 + 随机 2 张该阵营可收集卡（随从/法术，非衍生）入队；
//   机密以上难度，候选英雄再随机带一件装备（穿在英雄本体卡上）。
//   ⚠️ 供「没有选择的天启者」首战招募——一次性的（run.heroRecruitDone 复位才再触发）
// ═══════════════════════════════════════════════

/** [2026-09-04] 首战英雄招募候选（三选一） */
export interface HeroRecruitOption {
    heroKey: string;
    companionKeys: string[]; // 随行 2 张阵营卡（随机、可收集、同 region、非英雄）
    equipId?: string;        // 机密以上：穿在英雄本体卡上的装备
}

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
export const buildHeroRecruitOptions = (currentHeroKey: string, difficulty: RogueDifficulty): HeroRecruitOption[] => {
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
            const eqPool = (getEquipPoolForCard(heroDef) ?? []).filter(e => allowedRarities.includes(e.rarity));
            if (eqPool.length) equipId = eqPool[Math.floor(Math.random() * eqPool.length)].id;
        }
        return { heroKey: h.key, companionKeys, equipId };
    });
};
