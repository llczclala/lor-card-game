// ==========================================
// 悖论迷宫 · 天启者与初始牌组
// [2026-08-29 程拍板] 从开发者账号（dev_full_admin）配置的 5 套肉鸽卡组提取，
//   写死为**内置默认卡组**——普通账号没有个性化牌组时也能享受这套精调配置。
//   开发者账号的个性化牌组（rogue_starter_{heroKey}）仍优先于默认。
// ==========================================
import { CARD_DB } from '../cards';

export interface RogueHeroInfo {
    key: string;
    name: string;
    region: string;
}

export const ROGUE_HEROES: RogueHeroInfo[] = [
    { key: 'lyfe', name: '里芙', region: 'Lyfe' },
    { key: 'fenny', name: '芬妮', region: 'Fenny' },
    { key: 'pupu_specular_soul', name: '卜卜·灵鉴', region: 'Pupu' },
    { key: 'mauxir_lotus_drive', name: '猫汐尔·莲驱', region: 'Mauxir' },
    { key: 'acacia_chrono_echo', name: '安卡希雅·时之重奏', region: 'Acacia' },
];

/** [2026-08-29] 内置默认肉鸽卡组（写死自 dev_full_admin 配置；卡 key → 数量） */
export const DEFAULT_ROGUE_STARTER_DECKS: Record<string, { name: string; cards: Record<string, number> }> = {
    lyfe: {
        name: '肉鸽·里芙',
        cards: {
            lyfe: 2, lyfe_support: 1, single_combat: 1, prayer: 1, focus: 1, temp_spell_13: 1,
            Green_Spirit_Squad_Glanz: 1, Green_Spirit_Squad_Grace: 1, Ulster_Squad_Koni: 1,
            Ulster_Squad_Flamme: 1, Danu_Squad_Banshee: 1, Danu_Squad_Wendy: 1,
            The_Forger_Squad_Leisia: 1, Bridget_Squad_Chinchilla: 1,
        },
    },
    fenny: {
        name: '肉鸽·芬妮',
        cards: {
            fenny: 2, fenny_support: 1, hidden_arrow: 1, inspire: 1, destruction: 1,
            Typhoon_Squad_613: 1, Spirit_Squad_Bonnie: 1, Spirit_Squad_Lusaka: 1,
            Bridget_Squad_Feier: 1, Ghost_Squad_Antina: 1, Ghost_Squad_Valen: 1,
            Argo_Squad_Pigeon: 1, Argo_Squad_Arrowhead: 1, Argo_Squad_Musician: 1,
        },
    },
    pupu_specular_soul: {
        name: '肉鸽·卜卜 灵鉴',
        cards: {
            pupu_specular_soul: 2, pupu_specular_soul_support: 1,
            Chongye_Squad_Mabel: 1, Chongye_Squad_Elice: 1, Chongye_Squad_Golia: 1,
            vitality_regen: 1, full_purification: 1, toad_pattern: 1,
            Bridget_Squad_Valerie: 1, Spirit_Squad_Lusaka: 1, Green_Spirit_Squad_Grace: 1,
            The_Forger_Squad_Leisia: 1, Ghost_Squad_Antina: 1, Argo_Squad_Pigeon: 1,
        },
    },
    mauxir_lotus_drive: {
        name: '肉鸽·猫汐尔 莲驱',
        cards: {
            mauxir_lotus_drive: 2, mauxir_lotus_support: 1,
            Illustration_Squad_Kuranas: 1, Illustration_Squad_Swali: 1, Illustration_Squad_Soline: 1,
            mauxir_zhishui_ningxing: 1, mauxir_yiying_tuoyin: 1, mauxir_ouduan_si_chang: 1,
            Ulster_Squad_Maeve: 1, Crows_Eyest_Squad_An: 1, Bridget_Squad_Feier: 1,
            SacredChants_Squad_Loka: 1, Ghost_Squad_Vez: 1, Danu_Squad_Wendy: 1,
        },
    },
    acacia_chrono_echo: {
        name: '肉鸽·安卡希雅 时之重奏',
        cards: {
            acacia_chrono_echo: 1, acacia_chrono_echo_support: 1,
            Sacred_Tree_Squad_Lumi: 1, Sacred_Tree_Squad_Margaret: 1, Sacred_Tree_Squad_Alvina: 1,
            temp_spell_09: 1, temp_spell_19: 1, temp_spell_20: 1, temp_spell_10: 1,
            Poet_Squad_Caitlin: 1, Poet_Squad_Kelo: 1, Bridget_Squad_Chinchilla: 1,
            Crows_Eyest_Squad_An: 1, Green_Spirit_Squad_Eva: 1, Ulster_Squad_Koni: 1,
        },
    },
};

// [2026-08-29] 内置默认卡组优先；无则回退"同阵营前 9 可收集卡 + 天启者本体"自动生成
export const buildStarterDeck = (heroKey: string): string[] => {
    const custom = DEFAULT_ROGUE_STARTER_DECKS[heroKey];
    if (custom && Object.keys(custom.cards).length > 0) {
        return Object.entries(custom.cards).flatMap(([k, c]) => Array(c).fill(k));
    }
    const hero = ROGUE_HEROES.find(h => h.key === heroKey);
    if (!hero) return ['lyfe'];
    const pool = Object.values(CARD_DB).filter(c =>
        c.region === hero.region &&
        c.isCollectible !== false &&
        !c.isChampion
    );
    const picked = pool.slice(0, 9).map(c => c.key);
    return [heroKey, ...picked];
};

// ==========================================
// [2026-09-09 莉莉子] 老存档肉鸽卡组"净化"（读取自愈，绝不改写存档）
// 老版本玩家本地可能存着过时的 rogue_starter_{heroKey} 快照（如旧版只有 5 张），
// 会被 resolver 永远优先于随版本更新的内置默认卡组 → 卡组落后且新包改不动本地数据。
// 净化只在"读取/使用"这一刻把**卡组组成**回退/同步为当前官方默认：
//   绝不写回 localStorage（老玩家存档不失效）、绝不动卡背/牌桌/皮肤等个性化字段。
// 有效个性化卡组（含天启者本体 + 张数达标 + 卡 key 全部有效）完全照用不干预。
// ==========================================

/** 展开 cards{key:count} → 卡 key 列表（含重复，count 做防御取整） */
export const expandDeckCards = (cards: Record<string, number>): string[] =>
    Object.entries(cards || {}).flatMap(([k, c]) => Array(Math.max(0, (c as number) | 0)).fill(k));

/**
 * 判断个性化卡组是否"过时/损坏"（true → 读取时应回退官方默认组成）
 * 结构硬校验，不靠版本号，最大限度保护真实个性化：
 * ① 必须含对应天启者本体  ② 引用的卡 key 必须全部存在（旧版删/改名卡命中）
 * ③ 总张数明显少于当前官方默认（阈值跟随默认自适应，旧版 5 张 vs 新版 ~15 张会被抓）
 */
export const isStaleRogueStarterDeck = (heroKey: string, cards?: Record<string, number>): boolean => {
    if (!cards || Object.keys(cards).length === 0) return true;
    if ((cards[heroKey] || 0) <= 0) return true;
    for (const k of Object.keys(cards)) {
        if (!CARD_DB[k]) return true;
    }
    const expected = buildStarterDeck(heroKey).length;
    const total = expandDeckCards(cards).length;
    if (expected > 0 && total < Math.max(3, Math.floor(expected / 2))) return true;
    return false;
};

// [2026-08-13] 读取个性化配置的肉鸽初始牌组（开发者编辑的 rogue_starter_{heroKey} 牌组优先），否则默认 buildStarterDeck（内置默认/自动生成）
// [2026-09-09 净化] 过时/损坏的个性化组成 → 回退当前官方默认（只影响组成，不写本地、不动个性化配置）
export const getConfiguredStarterDeck = (
    decks: { id: string; cards: Record<string, number> }[],
    heroKey: string,
): string[] => {
    const custom = decks?.find(d => d.id === `rogue_starter_${heroKey}`);
    if (custom && Object.keys(custom.cards || {}).length > 0 && !isStaleRogueStarterDeck(heroKey, custom.cards)) {
        return expandDeckCards(custom.cards);
    }
    return buildStarterDeck(heroKey);
};
