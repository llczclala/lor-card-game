// ==========================================
// 卡组码 · 卡牌 → 永久数字 ID 登记表
// [2026-10-24 莉莉子 · 卡组码]
//
// ── 为什么需要这张表，而不是直接用 `Object.keys(CARD_DB)` 的下标 ──────────
//   卡组码为了短，把每张卡压成 12 bit 的数字 ID。如果这个数字来自
//   `Object.keys(CARD_DB)` 的**数组下标**，那么：
//     · 删掉一张卡（项目里真有 `test_*` / `temp_spell_*` 这种）→ 后面全部**前移一位**
//       ⇒ 所有旧卡组码**静默解错**（解出来是另一套牌，不报错）
//     · 在两处之间插入一张新卡 → 同理
//   「静默解错」比「报错」严重得多：玩家会以为自己发错码了。
//   ⇒ 所以 ID 必须是**显式写死、与源码顺序解耦**的。
//
// ── 三条铁律（改这张表之前必读）────────────────────────────────────
//   1. **已分配的 ID 永不改变**。不要为了"看起来整齐"而按字母序重排。
//   2. **删除的 ID 永不复用**。卡牌从 `CARD_DB` 里移除了，这里也**保留**那一行
//      （留着才能让旧码解出一个"未知 ID"然后再被下游判为无效，而不是错位成别的卡）。
//   3. **新卡只在表尾追加**。不管它在 `cards.ts` 里被放在哪个英雄旁边，
//      它的 ID 一律 = 当前最大 ID + 1。
//
// ── 当前分配 ─────────────────────────────────────────────────────
//   0 ~ 218 共 219 张（= `CARD_DB` 全部卡牌，含 38 张带引号 key 的补登记）。
//   12 bit 的 ID 空间（0~4095）还剩 3800 多个，够这个项目涨很多年。
//
// ⚠️ 新增卡牌后，跑一次 `npx tsc -b --force` 即可 —— `deckCode.ts` 里有启动期自检，
//    会比对 `CARD_DB`：发现「卡牌没登记」或「ID 重复」会在控制台报错，不会带病上线。
//    更彻底的审计（给漏登记卡牌直接生成可粘贴的行）：`_scratch/cardids-audit.ts`。
// ==========================================

export const DECK_CODE_CARD_IDS: Record<string, number> = {
    lyfe: 0,
    lyfe_spell: 1,
    lyfe_rush: 2,
    lyfe_ultimate: 3,
    lyfe_support: 4,
    single_combat: 5,
    prayer: 6,
    focus: 7,
    fenny: 8,
    fenny_spell: 9,
    fenny_strike: 10,
    fenny_ultimate: 11,
    fenny_support: 12,
    hidden_arrow: 13,
    inspire: 14,
    destruction: 15,
    pupu_specular_soul: 16,
    pupu_specular_soul_spell: 17,
    pupu_specular_soul_rush: 18,
    pupu_specular_soul_ultimate: 19,
    pupu_specular_soul_support: 20,
    Mirror: 21,
    Mirror_pupu: 22,
    mauxir_lotus_drive: 23,
    mauxir_lotus_spell: 24,
    mauxir_lotus_rush: 25,
    mauxir_lotus_ultimate: 26,
    mauxir_lotus_support: 27,
    mauxir_lotus_pedestal: 28,
    acacia_chrono_echo: 29,
    acacia_chrono_echo_spell: 30,
    acacia_chrono_echo_rush: 31,
    acacia_chrono_echo_ultimate: 32,
    acacia_chrono_echo_support: 33,
    acacia_chrono_echo_heavy: 34,
    acacia_cross_temporal: 35,
    acacia_sword_timeline: 36,
    acacia_sword_rain: 37,
    acacia_moon_focus: 38,
    acacia_sword_rain_alt: 39,
    marian: 40,
    marian_spell: 41,
    marian_rush: 42,
    marian_ultimate: 43,
    marian_support: 44,
    Chongye_Squad_Mabel: 45,
    Chongye_Squad_Elice: 46,
    Chongye_Squad_Golia: 47,
    vitality_regen: 48,
    full_purification: 49,
    toad_pattern: 50,
    mauxir_zhishui_ningxing: 51,
    mauxir_yiying_tuoyin: 52,
    mauxir_ouduan_si_chang: 53,
    temp_spell_09: 54,
    temp_spell_19: 55,
    temp_spell_20: 56,
    Truffle_Squad_Mushroom_Shadows: 57,
    Truffle_Squad_Elm: 58,
    Truffle_Squad_Iris: 59,
    marian_faction_mark: 60,
    marian_faction_bait: 61,
    marian_faction_silence: 62,
    temp_spell_01: 63,
    temp_spell_02: 64,
    temp_spell_05: 65,
    temp_spell_06: 66,
    temp_spell_07: 67,
    temp_spell_08: 68,
    temp_spell_10: 69,
    temp_spell_11: 70,
    temp_spell_13: 71,
    temp_spell_14: 72,
    temp_spell_15: 73,
    temp_spell_16: 74,
    analyst_fellowship: 75,
    Argo_Deliberate_Infiltration: 76,
    Poet_Squad_Oisin: 77,
    Poet_Squad_Caitlin: 78,
    Poet_Squad_Kelo: 79,
    true_snapshot: 80,
    The_Forger_Squad_Leisia: 81,
    The_Forger_Squad_Tatiana: 82,
    The_Forger_Squad_White_Hunt: 83,
    SacredChants_Squad_Loka: 84,
    Loka_Phantom_Serpent: 85,
    SacredChants_Squad_European_Angelica: 86,
    Angelica_Hazy_Note: 87,
    SacredChants_Squad_Shalo: 88,
    Shalo_Golem_Glimpse: 89,
    Bridget_Squad_Feier: 90,
    forced_communication: 91,
    Bridget_Squad_Chinchilla: 92,
    Bridget_Squad_Valerie: 93,
    Night_Owl: 94,
    Spirit_Squad_Lusaka: 95,
    Spirit_Squad_Snenika: 96,
    Spirit_Squad_Bonnie: 97,
    spirit_prayer: 98,
    Green_Spirit_Squad_Glanz: 99,
    Green_Spirit_Squad_Eva: 100,
    Green_Spirit_Squad_Grace: 101,
    Green_Spirit_Squad_LuggageBot: 102,
    Danu_Squad_Banshee: 103,
    Tomb_Spider: 104,
    Danu_Squad_Wendy: 105,
    Danu_Squad_SilverArm: 106,
    Silver_Arm_Smash: 107,
    Crows_Eyest_Squad_An: 108,
    Crows_Eyest_Squad_Mulin: 109,
    Crows_Eyest_Squad_Hiki: 110,
    Crows_Precise_Operation: 111,
    Dream_Guardians_Squad_Martina: 112,
    Dream_Guardians_Squad_Saikui: 113,
    Dream_Guardians_Squad_Haifa: 114,
    Amulet_Squad_Scorching: 115,
    Amulet_Squad_Cattail: 116,
    Amulet_Squad_Peaches: 117,
    FanLing_Squad_Lucia: 118,
    FanLing_Squad_Nafu: 119,
    FanLing_Squad_Wasi: 120,
    backroom_deal: 121,
    vitality_supplement: 122,
    energy_supplement: 123,
    bader_reagent: 124,
    logistics_reclaim: 125,
    spell_hoard: 126,
    temp_spell_18: 127,
    titan_mutant: 128,
    titan_hybrid: 129,
    titan_type_b_mutant: 130,
    titan_hodu: 131,
    titan_type_c_mutant: 132,
    titan_gonglu: 133,
    titan_gonglu_drone: 134,
    titan_type_d_mutant: 135,
    titan_gaimer: 136,
    temp_spell_03: 137,
    temp_spell_04: 138,
    ghostly_shadows: 139,
    destruction_ritual: 140,
    titan_collapse: 141,
    temp_spell_12: 142,
    temp_spell_17: 143,
    test_overwhelm: 144,
    test_quickattack: 145,
    test_regeneration: 146,
    test_elusive: 147,
    test_challenger: 148,
    test_barrier: 149,
    test_cantblock: 150,
    test_lifesteal: 151,
    test_last_breath: 152,
    test_fearsome: 153,
    test_frostbite: 154,
    test_scout: 155,
    test_ephemeral: 156,
    test_stun: 157,
    test_tough: 158,
    test_double_attack: 159,
    test_support: 160,
    test_deadly: 161,
    test_spellshield: 162,
    test_silence: 163,
    test_berserk: 164,
    test_cleave: 165,
    test_thorns: 166,
    test_vanguard: 167,
    test_ambush: 168,
    test_plunder: 169,
    test_exposed: 170,
    test_shroud: 171,
    test_immobile: 172,
    test_reborn: 173,
    test_execute: 174,
    test_sniper: 175,
    test_volatile: 176,
    test_echo: 177,
    test_impact: 178,
    test_channel: 179,
    test_titan: 180,

    // ── [2026-10-24 补登记] 下面 38 张是**首次生成时漏掉的** ────────────────
    //    病根：初次生成用的是正则 `^  ([a-zA-Z0-9_]+): {`，只认**裸标识符**的 key，
    //    而 `cards.ts` 里有一部分 key 是**带引号**写的（`'Messenger_Squad_Gena': {`）
    //    ⇒ 这些卡全部没登记 ⇒ 含它们的卡组一导出就抛「未登记的卡牌 key」。
    //    现在改用「顶层 key 与内部 `key:` 字段双向交叉核对」的方式审计，
    //    两个来源必须数量一致且互相覆盖，才认为扫描可信（见 `_scratch/cardids-audit.ts`）。
    //    ⚠️ 这 38 个 ID 是**新分配**的，追加在末尾，前面 0~180 一个都没动 ⇒ 已发出的码不受影响。
    'dream_lotus_drone': 181,
    'Acacia_Flying_Sword': 182,
    'Acacia_Great_Sword': 183,
    'Marian_Wolf_Tooth_Beacon': 184,
    'Elice_scope_robot': 185,
    'Illustration_Squad_Kuranas': 186,
    'Kuranas_Crocodile': 187,
    'Illustration_Squad_Swali': 188,
    'Swali_Sheep': 189,
    'Illustration_Squad_Soline': 190,
    'Soline_Anubis': 191,
    'Sacred_Tree_Squad_Lumi': 192,
    'Sacred_Tree_Squad_Margaret': 193,
    'Sacred_Tree_Squad_Alvina': 194,
    'Truffle_Drone_NightVision': 195,
    'Truffle_Drone_Firefly': 196,
    'Truffle_Drone_Gardener': 197,
    'Mingyi_Squad_Zhe_hao': 198,
    'Mingyi_Squad_Zhu_He': 199,
    'Mingyi_Squad_Jin_Lang': 200,
    'Star_Bright_Squad_Doveil': 201,
    'Star_Bright_Squad_Alivy': 202,
    'Star_Bright_Squad_Dakors': 203,
    'Argo_Squad_Pigeon': 204,
    'Argo_Squad_Musician': 205,
    'Argo_Squad_Arrowhead': 206,
    'Ghost_Squad_Antina': 207,
    'Ghost_Squad_Vez': 208,
    'Ghost_Squad_Valen': 209,
    'Ulster_Squad_Koni': 210,
    'Ulster_Squad_Maeve': 211,
    'Ulster_Squad_Flamme': 212,
    'Typhoon_Squad_Flameheart': 213,
    'Typhoon_Squad_Dornier': 214,
    'Typhoon_Squad_613': 215,
    'Messenger_Squad_Ah_Hua': 216,
    'Messenger_Squad_Gena': 217,
    'Messenger_Squad_WALL_E': 218,
};

/**
 * 下一个可分配的新 ID —— **新增卡牌时请引用这个常量**，别自己数字。
 * 用 `Math.max` 动态算，避免"手工加了一行却忘了改这个数"。
 */
export const DECK_CODE_NEXT_CARD_ID =
    Object.values(DECK_CODE_CARD_IDS).reduce((max, id) => (id > max ? id : max), -1) + 1;

/**
 * ID → 卡牌 key（**数组下标即 ID**）。
 * 空洞为 `undefined`：表示那个 ID 曾分配给已下架的卡，故意留空不复用。
 */
export const DECK_CODE_CARD_KEYS: ReadonlyArray<string | undefined> = (() => {
    const arr: Array<string | undefined> = [];
    for (const [key, id] of Object.entries(DECK_CODE_CARD_IDS)) arr[id] = key;
    return arr;
})();

/** 卡牌 key → ID（未登记则 `undefined`） */
export const getDeckCodeCardId = (key: string): number | undefined => DECK_CODE_CARD_IDS[key];

/** ID → 卡牌 key（未登记或已下架则 `undefined`） */
export const getDeckCodeCardKey = (id: number): string | undefined => DECK_CODE_CARD_KEYS[id];
