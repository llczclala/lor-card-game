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
    { key: 'marian', name: '茉莉安·霄鹰', region: 'Marian' }, // [2026-09-26 莉莉子] 肉鸽池补入第 6 位天启者
    // [2026-11-16 莉莉子] 凯茜娅·狂诗 —— 第 7 位。
    //   ⚠️ region 必须写**全名** `katya_klein_rhapsody`（`types.ts:2` 的 Region 值就是全名，
    //   不是 'Katya'）—— 写短名会让 `buildStarterDeck` 兜底与 `buildHeroRecruitOptions`
    //   的 `c.region === h.region` 全部取不到卡。
    { key: 'katya_klein_rhapsody', name: '凯茜娅·狂诗', region: 'katya_klein_rhapsody' },
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
    // [2026-10-03 程拍板 · BUG-20261002-21] 六套卡组里**只有安卡的本体是 1 张** ⇒ 与"两张才能保证
    //   英雄法术用得上"的口径不一致（本体一死就再没有天启者法术）。
    //   调整：**删 1 张「“阿尔斯特”科尼」（1 费 0/4，`Ulster_Squad_Koni`）→ 本体补到 2 张**（总张数仍 15，不动其他）。
    acacia_chrono_echo: {
        name: '肉鸽·安卡希雅 时之重奏',
        cards: {
            acacia_chrono_echo: 2, acacia_chrono_echo_support: 1,
            Sacred_Tree_Squad_Lumi: 1, Sacred_Tree_Squad_Margaret: 1, Sacred_Tree_Squad_Alvina: 1,
            temp_spell_09: 1, temp_spell_19: 1, temp_spell_20: 1, temp_spell_10: 1,
            Poet_Squad_Caitlin: 1, Poet_Squad_Kelo: 1, Bridget_Squad_Chinchilla: 1,
            Crows_Eyest_Squad_An: 1, Green_Spirit_Squad_Eva: 1,
        },
    },
    // [2026-09-26 莉莉子] 茉莉安·霄鹰 —— 埋雷引爆流（难度 3 档，同卜卜）
    //   结构对齐同型「铺场成长」流派的配方：本体 ×2 + 支援技 ×1 + 同阵营小队 ×3 + 阵营法术 ×3 + 跨阵营队友 ×6
    //   链条自洽：埋雷(本体库效在敌方备战席招信标) → 暴露(蕈影/以饵引狼/猎影标记)
    //            → 引爆(重器制空炸5伤+AOE / 流萤亡语炸 / 夜视打水晶炸 / 虹彩削信标上限)
    //            → 提现(静默行动把满场【暴露】换成我方全体永久 +1/+1) → 收割(猎影标记额外攻击)
    marian: {
        name: '肉鸽·茉莉安 霄鹰',
        cards: {
            marian: 2, marian_support: 1,
            Truffle_Squad_Mushroom_Shadows: 1, Truffle_Squad_Elm: 1, Truffle_Squad_Iris: 1,
            marian_faction_mark: 1, marian_faction_bait: 1, marian_faction_silence: 1,
            Ulster_Squad_Maeve: 1, Crows_Eyest_Squad_An: 1, Bridget_Squad_Feier: 1,
            SacredChants_Squad_Loka: 1, Ghost_Squad_Vez: 1, Danu_Squad_Wendy: 1,
        },
    },
    // [2026-11-16 莉莉子] 凯茜娅·狂诗 —— 倾泻养攻流（流派「诗与枪火」，难度 4）
    //   结构：本体 ×2 + 映现小队 3（梅莉桑德 ×2）+ 阵营法术 4（霜矢 ×2）+ 外援 4 = 15
    //   ⚠️ 非本体卡带 2 张（程 2026-11-16 拍板，破「每种 1 张」旧惯例）：
    //     她的阵营只有 7 张可收集非英雄卡，硬守惯例就得塞 6 张外援 ⇒ 牌组变成
    //     "外援撑场、她当挂件"，与流派定位相反。
    //   费用曲线 1/2/3/4/5/6 = 4/3/4/1/1/2：
    //     本体 6 费、倾泻 4 费（`cards.ts:678`），迷宫开局 1 法力 ⇒ 前五回合空窗，
    //     1-3 费件必须够。跨阵营的 Logistics 通用件本身全是 1-3 费，正好补位。
    //   ⚠️ 梅莉桑德 ×2 是节奏引擎：每次打击敌方水晶 → 倾泻费用永久 −1
    //     （`effectRegistry.ts:3087`）。没有她，要到第 7 回合才打得动第一发倾泻。
    katya_klein_rhapsody: {
        name: '肉鸽·凯茜娅 狂诗',
        cards: {
            katya_klein_rhapsody: 2,
            Reflection_Squad_Melisande: 2, katya_barrage_frost: 2,
            katya_transcribe: 1, Reflection_Squad_Yulalia: 1, katya_starfall: 1,
            Reflection_Squad_Odnie: 1, katya_supply: 1,
            Bridget_Squad_Feier: 1, Crows_Eyest_Squad_An: 1,
            Ulster_Squad_Maeve: 1, SacredChants_Squad_Loka: 1,
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
    // ==========================================
    // [2026-10-02 莉莉子 BUG修复 · BUG-20261002-21] 本体张数低于当前官方默认 ⇒ 也算过时
    // ── 病根：原判据**只看总张数**（≥ 官方默认的一半），看不住"本体被改少"。
    //    一份 `marian: 1` + 其余 14 张的旧快照（早期版本存下的），含本体 ✓、key 全有效 ✓、总张数 15 ≥ 7 ✓
    //    ⇒ 被判为"不过时"而**永久沿用** ⇒ 粉丝反馈「开局选的天启者为什么只给一张，英雄法术都没得用」
    //    （官方默认 `marian: 2`，见下方 DEFAULT_ROGUE_STARTER_DECKS）。
    // ── 为什么专门补这一条：**天启者本体的张数是"能不能一直用英雄法术"的硬约束**，
    //    少一张就少一条命，比其他卡少一张严重得多；而总张数阈值天然盖不住它。
    // ==========================================
    const defaultCards = DEFAULT_ROGUE_STARTER_DECKS[heroKey]?.cards;
    if (defaultCards && (cards[heroKey] || 0) < (defaultCards[heroKey] || 0)) return true;
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
