const loadingImagesModules = import.meta.glob('../image/loading/*.png', { eager: true });

// 转换为图片路径数组
export const LOADING_SCREEN_IMAGES = Object.values(loadingImagesModules).map((mod: any) => mod.default);

// [新增] 货币图标导入
import icon_silver from '../image/icon/silverCoin.png';
import icon_data from '../image/icon/dataGold.png';
import icon_bit from '../image/icon/bitGold.png';

// [核心替换] 引入四阶状态升级图标
import icon_levelup_0 from '../image/icon/levelup_0.png';
import icon_levelup_1 from '../image/icon/levelup_1.png';
import icon_levelup_2 from '../image/icon/levelup_2.png';
import icon_levelup_full from '../image/icon/levelup.png';
import icon_leveldown from '../image/icon/leveldown.png';

import border_hero from '../image/cardborder/cardborder_hero.png';
import border_spell from '../image/cardborder/cardborder_spell.png';
import border_unit from '../image/cardborder/cardborder_unit.png';

// [新增] 引入局内视觉特效贴图
import effect_break from '../image/effect/break.png';
import effect_broken1 from '../image/effect/broken1.png';
import effect_broken2 from '../image/effect/broken2.png';
import effect_be_attacked from '../image/effect/be_attacked.png'; // [核心新增] 引入全新的法术命中受击贴图
import mauxir_rush_attack from '../image/effect/mauxir_lotus_rush_attack.png';
import mauxir_rush_be_attacked from '../image/effect/mauxir_lotus_rush_be_attacked.png';

// 引入里芙的原画
import lyfe_1 from '../image/hero/里芙1.png';
import lyfe_2 from '../image/hero/里芙2.png';

// 引入芬妮的原画
import fenny_1 from '../image/hero/芬妮1.png';
import fenny_2 from '../image/hero/芬妮2.png';

// 引入卜卜 灵鉴的原画
import pupu_specular_soul_1 from '../image/hero/卜卜灵鉴1.png';
import pupu_specular_soul_2 from '../image/hero/卜卜灵鉴2.png';

// [新增] 引入猫汐尔 莲驱的原画
import mauxir_lotus_drive_1 from '../image/hero/猫汐尔莲驱1.png';
import mauxir_lotus_drive_2 from '../image/hero/猫汐尔莲驱2.png';

// --- 法术卡面 (Spells) ---
// 通用法术
import spell_01 from '../image/spells/01.png'; // 单挑
import spell_02 from '../image/spells/02.png'; // 祈祷
import spell_03 from '../image/spells/03.png'; // 专注
import spell_04 from '../image/spells/04.png'; // 暗箭
import spell_05 from '../image/spells/05.png'; // 振奋
import spell_06 from '../image/spells/06.png'; // 破坏
// [新增] 5 大新法术的图片载入
import spell_07 from '../image/spells/07.png'; // 活力再生
import spell_08 from '../image/spells/08.png'; // 全力净化
// [新增] 第 4 批通用法术原画
import spell_09 from '../image/spells/09.png'; // 暗箱操作
import spell_10 from '../image/spells/10.png'; // 生机补充
import spell_11 from '../image/spells/11.png'; // 能量补充
import spell_12 from '../image/spells/12.png'; // 巴德尔试剂

// [新增] 梦莲无人机原画
import dream_lotus_drone_img from '../image/spells/mauxir_lotus_robot.png';

// 芬妮专属法术
import fenny_spell_base from '../image/spells/fenny_spell.png';   // 芬妮的狂热
import fenny_spell_01 from '../image/spells/fenny_spell01.png';  // 星光之途
import fenny_spell_02 from '../image/spells/fenny_spell02.png';  // 绝对主角
import fenny_spell_03 from '../image/spells/fenny_spell03.png';  // [新增] 激励之声

// 里芙专属法术
import lyfe_spell_base from '../image/spells/lyfe_spell.png';    // 里芙的决意
import lyfe_spell_01 from '../image/spells/lyfe_spell01.png';   // 无尽霜刃
import lyfe_spell_02 from '../image/spells/lyfe_spell02.png';   // 吞噬神座
import lyfe_spell_03 from '../image/spells/lyfe_spell03.png';   // [新增] 冻沙激流

// 卜卜灵鉴专属法术
import pupu_specular_soul_spell_base from '../image/spells/pupu_specular_soul_spell.png';    // 卜卜的卜卦
import pupu_specular_soul_spell_01 from '../image/spells/pupu_specular_soul_spell01.png';   // 镜涌万象
import pupu_specular_soul_spell_02 from '../image/spells/pupu_specular_soul_spell02.png';   // 吉煞映照
import pupu_specular_soul_spell_03 from '../image/spells/pupu_specular_soul_spell03.png';   // [新增] 异镜来物

// [新增] 猫汐尔莲驱专属法术
import mauxir_lotus_spell_base from '../image/spells/mauxir_lotus_spell.png';    // 猫汐尔的战术演算
import mauxir_lotus_spell_01 from '../image/spells/mauxir_lotus_spell01.png';   // 千莲叠绽
import mauxir_lotus_spell_02 from '../image/spells/mauxir_lotus_spell02.png';   // 顷刻莲潮
import mauxir_lotus_spell_03 from '../image/spells/mauxir_lotus_spell03.png';   // 伴泽而生

// [新增] 臆莲基座原画
import placeholder_pedestal from '../image/units/mauxir_lotus_pedestal.png';

// --- 测试单位原画 (0_01 ~ 0_36) ---
// 1-10
import t_01 from '../image/attendants/0_01.png';
import t_02 from '../image/attendants/0_02.png';
import t_03 from '../image/attendants/0_03.png';
import t_04 from '../image/attendants/0_04.png';
import t_05 from '../image/attendants/0_05.png';
import t_06 from '../image/attendants/0_06.png';
import t_07 from '../image/attendants/0_07.png';
import t_08 from '../image/attendants/0_08.png';
import t_09 from '../image/attendants/0_09.png';
import t_10 from '../image/attendants/0_10.png';
// 11-20
import t_11 from '../image/attendants/0_11.png';
import t_12 from '../image/attendants/0_12.png';
import t_13 from '../image/attendants/0_13.png';
import t_14 from '../image/attendants/0_14.png';
import t_15 from '../image/attendants/0_15.png';
import t_16 from '../image/attendants/0_16.png';
import t_17 from '../image/attendants/0_17.png';
import t_18 from '../image/attendants/0_18.png';
import t_19 from '../image/attendants/0_19.png';
import t_20 from '../image/attendants/0_20.png';
// 21-30
import t_21 from '../image/attendants/0_21.png';
import t_22 from '../image/attendants/0_22.png';
import t_23 from '../image/attendants/0_23.png';
import t_24 from '../image/attendants/0_24.png';
import t_25 from '../image/attendants/0_25.png';
import t_26 from '../image/attendants/0_26.png';
import t_27 from '../image/attendants/0_27.png';
import t_28 from '../image/attendants/0_28.png';
import t_29 from '../image/attendants/0_29.png';
import t_30 from '../image/attendants/0_30.png';
// 31-36
import t_31 from '../image/attendants/0_31.png';
import t_32 from '../image/attendants/0_32.png';
import t_33 from '../image/attendants/0_33.png';
import t_34 from '../image/attendants/0_34.png';
import t_35 from '../image/attendants/0_35.png';
import t_36 from '../image/attendants/0_36.png';
import t_37 from '../image/attendants/0_37.png'; // Titan 测试卡

// [新增] 引入按钮容器背景 (注意文件名拼写 buttton1)
import button_container from '../image/icon/buttton1.png';
import title_logo from '../image/icon/titile.png';
import sword_icon from '../image/icon/sword.png';
import sword_gain_icon from '../image/icon/sword_gain.png';
import spell_container from '../image/icon/spell.png'; // [新增] 法术底托容器


// --- 水晶资源引入 ---
// 敌方 Mana (1-10)
import e_m_1 from '../image/icon/enemy_MANA_1.png';
import e_m_2 from '../image/icon/enemy_MANA_2.png';
import e_m_3 from '../image/icon/enemy_MANA_3.png';
import e_m_4 from '../image/icon/enemy_MANA_4.png';
import e_m_5 from '../image/icon/enemy_MANA_5.png';
import e_m_6 from '../image/icon/enemy_MANA_6.png';
import e_m_7 from '../image/icon/enemy_MANA_7.png';
import e_m_8 from '../image/icon/enemy_MANA_8.png';
import e_m_9 from '../image/icon/enemy_MANA_9.png';
import e_m_10 from '../image/icon/enemy_MANA_10.png';

// 我方 Mana (1-10)
import p_m_1 from '../image/icon/player_MANA_1.png';
import p_m_2 from '../image/icon/player_MANA_2.png';
import p_m_3 from '../image/icon/player_MANA_3.png';
import p_m_4 from '../image/icon/player_MANA_4.png';
import p_m_5 from '../image/icon/player_MANA_5.png';
import p_m_6 from '../image/icon/player_MANA_6.png';
import p_m_7 from '../image/icon/player_MANA_7.png';
import p_m_8 from '../image/icon/player_MANA_8.png';
import p_m_9 from '../image/icon/player_MANA_9.png';
import p_m_10 from '../image/icon/player_MANA_10.png';

// 敌方 Spells (1-3)
import e_s_1 from '../image/icon/enemy_spells_1.png';
import e_s_2 from '../image/icon/enemy_spells_2.png';
import e_s_3 from '../image/icon/enemy_spells_3.png';

// 我方 Spells (1-3)
import p_s_1 from '../image/icon/player_spells_1.png';
import p_s_2 from '../image/icon/player_spells_2.png';
import p_s_3 from '../image/icon/player_spells_3.png';

// [新增] 批量引入卡背 (1张默认 + 3张可抽取 + 3张英雄专属 + 6张永恒之约 = 13张满编)
import cb_01 from '../image/card_back/01.png';
import cb_02 from '../image/card_back/02.png';
import cb_03 from '../image/card_back/03.png';
import cb_04 from '../image/card_back/04.png';
import cb_fenny from '../image/card_back/fenny.png';
import cb_lyfe from '../image/card_back/lyfe.png';
import cb_pupu from '../image/card_back/pupu_specular.png';
import cb_05 from '../image/card_back/05.png';
import cb_06 from '../image/card_back/06.png';
import cb_07 from '../image/card_back/07.png';
import cb_08 from '../image/card_back/08.png';
import cb_09 from '../image/card_back/09.png';
import cb_10 from '../image/card_back/10.png';

// [新增] 批量引入牌桌 (01-05)
import desk_01 from '../image/desk/01.png';
import desk_02 from '../image/desk/02.png';
import desk_03 from '../image/desk/03.png';
import desk_04 from '../image/desk/04.png';
import desk_05 from '../image/desk/05.png';


// ==========================================
// [皮肤] 批量导入 units 目录所有图片（glob模式，自动感知新增）
// ==========================================
const unitImageModules = import.meta.glob('../image/units/*.png', { eager: true }) as Record<string, { default: string }>;

/** [皮肤] cardKey → { skinId → imageUrl } */
export const SKIN_IMAGES: Record<string, Record<number, string>> = {};
// 临时容器：cardKey → skinId=0 的图片（用于重建 UNIT_IMAGES）
const defaultUnitImages: Record<string, string> = {};

for (const [fp, mod] of Object.entries(unitImageModules)) {
  const fn = fp.split('/').pop()?.replace('.png', '');
  if (!fn || fn === 'sw9h44lcpvqcp684nh493gz3qt5pjsi') continue;
  const url = mod.default;

  // Mirror 特殊处理（无皮肤后缀）
  if (fn === 'Mirror' || fn === 'Mirror_pupu') {
    defaultUnitImages[fn] = url;
    SKIN_IMAGES[fn] = { 0: url };
    continue;
  }

  const m = fn.match(/^(.+)_(\d{2})$/);
  if (m) {
    const cardKey = m[1].replace(/-/g, '_');
    const skinId = parseInt(m[2]);
    if (!SKIN_IMAGES[cardKey]) SKIN_IMAGES[cardKey] = {};
    SKIN_IMAGES[cardKey][skinId] = url;
    if (skinId === 0) defaultUnitImages[cardKey] = url;
  }
}

// [皮肤继承] 衍生物与召唤主共用同一套皮肤数据（同一张图，不同裁切坐标）
const TOKEN_SKIN_ALIASES: Record<string, string> = {
  'Swali_Sheep': 'Illustration_Squad_Swali',
  'Kuranas_Crocodile': 'Illustration_Squad_Kuranas',
  'Soline_Anubis': 'Illustration_Squad_Soline',
  'Elice_scope_robot': 'Chongye_Squad_Elice',
};
for (const [tokenKey, parentKey] of Object.entries(TOKEN_SKIN_ALIASES)) {
  if (SKIN_IMAGES[parentKey]) {
    SKIN_IMAGES[tokenKey] = SKIN_IMAGES[parentKey];
  }
}

// 短 key → 完整 cardKey 对照表（向后兼容 cards.ts 中的 UNIT_IMAGES.xxx 引用）
const CARD_KEY_MAP: Record<string, string> = {
  martina: 'Dream_Guardians_Squad_Martina',
  saikui: 'Dream_Guardians_Squad_Saikui',
  haifa: 'Dream_Guardians_Squad_Haifa',
  ah_hua: 'Messenger_Squad_Ah_Hua',
  gena: 'Messenger_Squad_Gena',
  wall_e: 'Messenger_Squad_WALL_E',
  koni: 'Ulster_Squad_Koni',
  maeve: 'Ulster_Squad_Maeve',
  flamme: 'Ulster_Squad_Flamme',
  flameheart: 'Typhoon_Squad_Flameheart',
  dornier: 'Typhoon_Squad_Dornier',
  unit_613: 'Typhoon_Squad_613',
  antina: 'Ghost_Squad_Antina',
  vez: 'Ghost_Squad_Vez',
  valen: 'Ghost_Squad_Valen',
  pigeon: 'Argo_Squad_Pigeon',
  musician: 'Argo_Squad_Musician',
  arrowhead: 'Argo_Squad_Arrowhead',
  zhe_hao: 'Mingyi_Squad_Zhe_hao',
  zhu_he: 'Mingyi_Squad_Zhu_He',
  jin_lang: 'Mingyi_Squad_Jin_Lang',
  doveil: 'Star_Bright_Squad_Doveil',
  alivy: 'Star_Bright_Squad_Alivy',
  dakors: 'Star_Bright_Squad_Dakors',
  mabel: 'Chongye_Squad_Mabel',
  elice: 'Chongye_Squad_Elice',
  golia: 'Chongye_Squad_Golia',

  // --- Illustration Squad: 图征小队 (Mauxir) ---
  kuranas: 'Illustration_Squad_Kuranas',
  swali: 'Illustration_Squad_Swali',
  soline: 'Illustration_Squad_Soline',
};


import PGgachaDeskImg from '../image/gacha/PermanentGachaPool/desk.png';
import PGgachaBtnImg from '../image/gacha/PermanentGachaPool/button.png';

import titan_mutant from '../image/enemy/Titan_Mutant.png';
import titan_hybrid from '../image/enemy/Titan_Titan_Hybrid.png';
import titan_type_b_mutant from '../image/enemy/Titan_Type_B_Mutant.png';
import titan_hodu from '../image/enemy/Titan_Hodu.png';
import titan_type_c_mutant from '../image/enemy/Titan_Type_C_Mutant.png';
import titan_gonglu from '../image/enemy/Titan_Gonglu.png';
import gonglu_support from '../image/enemy/Gonglu_support.png'
import titan_type_d_mutant from '../image/enemy/Titan_Type_D_Mutant.png';
import titan_gaimer from '../image/enemy/Titan_Gaimer.png';




// 定义英雄图片资源结构
export interface HeroImages {
    base: string;   // 1级卡面
    level2: string; // 2级卡面
}

export const PERSONALIZATION_ASSETS = {
    // [核心修复] 按序排布 7 张卡背。索引 1/2/3 入盲盒，索引 4/5/6 锁死给未来任务系统！
    cardBacks: [cb_01, cb_02, cb_03, cb_04, cb_fenny, cb_lyfe, cb_pupu, cb_05, cb_06, cb_07, cb_08, cb_09, cb_10],
    desks: [desk_01, desk_02, desk_03, desk_04, desk_05]
};

export const gacha_icon = {
    PGgachaDeskImg,   // 1级卡面
    PGgachaBtnImg // 2级卡面
};

// 导出英雄图库常量
export const HERO_IMAGES: Record<string, { base: string; level2: string }> = {
    lyfe: { base: lyfe_1, level2: lyfe_2 },
    fenny: { base: fenny_1, level2: fenny_2 },
    pupu_specular_soul: { base: pupu_specular_soul_1, level2: pupu_specular_soul_2 },
    mauxir_lotus_drive: { base: mauxir_lotus_drive_1, level2: mauxir_lotus_drive_2 }
};
// [皮肤] 导出正式单位图片集合（从 glob 自动构建）
export const UNIT_IMAGES: Record<string, string> = {};

// 从短 key 映射构建 UNIT_IMAGES
for (const [shortKey, cardKey] of Object.entries(CARD_KEY_MAP)) {
  if (defaultUnitImages[cardKey]) {
    UNIT_IMAGES[shortKey] = defaultUnitImages[cardKey];
  }
}
// Mirror 特殊处理
UNIT_IMAGES['Mirror'] = defaultUnitImages['Mirror'] || '';
UNIT_IMAGES['Mirror_pupu'] = defaultUnitImages['Mirror_pupu'] || '';

/**
 * [皮肤] 根据 cardKey 和 skinId 获取对应卡面图片
 * @param cardKey 卡牌 Key
 * @param skinId 皮肤 ID（0=默认），省略时返回默认图片
 * @param fallback 兜底图片
 */
export function getSkinImage(cardKey: string, skinId?: number, fallback?: string): string {
  const sk = SKIN_IMAGES[cardKey];
  if (skinId && sk && sk[skinId]) return sk[skinId];
  if (sk && sk[0]) return sk[0];
  return fallback || '';
}

// [新增] 导出法术图库
export const SPELL_IMAGES = {
    // 通用
    single_combat: spell_01,
    prayer: spell_02,
    focus: spell_03,
    hidden_arrow: spell_04,
    inspire: spell_05,
    destruction: spell_06,
    // [新增] 通用新法术导出
    vitality_regen: spell_07,
    full_purification: spell_08,
    // [新增] 第 4 批通用法术
    backroom_deal: spell_09,
    vitality_supplement: spell_10,
    energy_supplement: spell_11,
    bader_reagent: spell_12,

    // 芬妮
    fenny_spell: fenny_spell_base,
    fenny_strike: fenny_spell_01,
    fenny_ultimate: fenny_spell_02,
    fenny_support: fenny_spell_03, // [新增] 激励之声

    // 里芙
    lyfe_spell: lyfe_spell_base,
    lyfe_rush: lyfe_spell_01,
    lyfe_ultimate: lyfe_spell_02,
    lyfe_support: lyfe_spell_03, // [新增] 冻沙激流

    // 卜卜灵鉴
    pupu_specular_soul_spell: pupu_specular_soul_spell_base,
    pupu_specular_soul_rush: pupu_specular_soul_spell_01,
    pupu_specular_soul_ultimate: pupu_specular_soul_spell_02,
    pupu_specular_soul_support: pupu_specular_soul_spell_03, // [新增] 异镜来物

    // 图征小队·通用法术
    dream_lotus_drone: dream_lotus_drone_img,

    // [新增] 猫汐尔莲驱
    mauxir_lotus_spell: mauxir_lotus_spell_base,
    mauxir_lotus_rush: mauxir_lotus_spell_01,
    mauxir_lotus_ultimate: mauxir_lotus_spell_02,
    mauxir_lotus_support: mauxir_lotus_spell_03,
    mauxir_lotus_pedestal: placeholder_pedestal,
};


// 导出测试单位图库 (按关键词顺序索引)
export const TEST_IMAGES = {
    overwhelm: t_01,
    quickattack: t_02,
    regeneration: t_03,
    elusive: t_04,
    challenger: t_05,
    barrier: t_06,
    cantblock: t_07,
    lifesteal: t_08,
    lastbreath: t_09,
    fearsome: t_10,
    frostbite: t_11,
    scout: t_12,
    ephemeral: t_13,
    stun: t_14,
    tough: t_15,
    doubleattack: t_16,
    support: t_17,
    deadly: t_18,
    spellshield: t_19,
    silence: t_20,
    berserk: t_21,
    cleave: t_22,
    thorns: t_23,
    vanguard: t_24,
    ambush: t_25,
    plunder: t_26,
    exposed: t_27,
    shroud: t_28,
    immobile: t_29,
    reborn: t_30,
    execute: t_31,
    sniper: t_32,
    volatile: t_33,
    echo: t_34,
    impact: t_35,
    channel: t_36,
    titan: t_37
};

// [新增] 导出水晶资源集合
export const MANA_IMAGES = {
    enemy: {
        mana: [e_m_1, e_m_2, e_m_3, e_m_4, e_m_5, e_m_6, e_m_7, e_m_8, e_m_9, e_m_10],
        spell: [e_s_1, e_s_2, e_s_3]
    },
    player: {
        mana: [p_m_1, p_m_2, p_m_3, p_m_4, p_m_5, p_m_6, p_m_7, p_m_8, p_m_9, p_m_10],
        spell: [p_s_1, p_s_2, p_s_3]
    }
};

// [新增] 导出 UI 资源常量
export const UI_IMAGES = {
    board: PERSONALIZATION_ASSETS.desks[0],
    buttonContainer: button_container,
    sword: sword_icon,
    swordGain: sword_gain_icon,
    cardBack: PERSONALIZATION_ASSETS.cardBacks[0],
    titleLogo: title_logo, // [新增] 注册 Logo
    spellContainer: spell_container // [新增] 注册法术底托容器
};

export const UI_ICONS = {
    levelup: icon_levelup_full, // 保持兼容性
    leveldown: icon_leveldown
};

// [新增] 导出四阶英雄升级状态图标池
export const LEVELUP_ICONS = {
    empty: icon_levelup_0,
    half: icon_levelup_1,
    almost: icon_levelup_2,
    full: icon_levelup_full
};

// [新增] 导出卡牌边框集合
export const CARD_BORDERS = {
    hero: border_hero,   // 金色 (英雄)
    spell: border_spell, // 蓝色 (法术)
    unit: border_unit    // 银色 (普通单位)
};
// [新增] 导出货币图标集合
export const CURRENCY_ICONS = {
    silverCoin: icon_silver,
    dataGold: icon_data,
    bitGold: icon_bit
};

// ==========================================
// [新增] 导出局内视觉特效资源集合 (VFX Decals)
// ==========================================
export const EFFECT_IMAGES = {
    groundCrack: effect_break,     // 砸击：地面龟裂
    cardBroken1: effect_broken1,   // 死亡预备：卡牌碎裂 1
    cardBroken2: effect_broken2,   // 死亡预备：卡牌碎裂 2
    beAttacked: effect_be_attacked, // [核心新增] 法术命中：受击裂纹特效
    mauxirRushAttack: mauxir_rush_attack,
    mauxirRushBeAttacked: mauxir_rush_be_attacked
};

export const TITAN_IMAGES = {
    mutant: titan_mutant,
    hybrid: titan_hybrid,
    type_b: titan_type_b_mutant,
    hodu: titan_hodu,
    type_c: titan_type_c_mutant,
    gonglu: titan_gonglu,
    gonglu_support:gonglu_support,
    type_d: titan_type_d_mutant,
    gaimer: titan_gaimer,
};