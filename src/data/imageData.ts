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
// [新增] 程准备的差异化法术受击特效（BUFF/治疗分类专用）
import effect_buff_all from '../image/effect/BUFF_ALL.png';
import effect_buff_keyword from '../image/effect/BUFF_Keyword.png';
import effect_buff_life from '../image/effect/BUFF_Life.png';
import effect_buff_power from '../image/effect/BUFF_Power.png';
import effect_healing from '../image/effect/Healing.png';

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

// [新增] 引入安卡希雅 时之重奏的原画
import acacia_chrono_echo_1 from '../image/hero/安卡希雅时之重奏1.png';
import acacia_chrono_echo_2 from '../image/hero/安卡希雅时之重奏2.png';

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
import spell_13 from '../image/spells/13.png'; // 鬼影森森
import spell_14 from '../image/spells/14.png'; // 毁灭仪式
import spell_15 from '../image/spells/15.png'; // 蟾鉴易纹
import spell_16 from '../image/spells/16.png'; // 强行通讯
import spell_17 from '../image/spells/17.png'; // 精灵祈愿
import spell_18 from '../image/spells/18.png'; // 真实快照

// [2026-07-15 梵音小队] 迷离之音 & 巨偶一瞥原画
import spell_19 from '../image/spells/19.png'; // 迷离之音
import spell_20 from '../image/spells/20.png'; // 巨偶一瞥
// [2026-07-16 达努小队] 银臂乱打原画
import spell_21 from '../image/spells/21.png'; // 银臂乱打
// [2026-07-17 阿尔戈小队] 蓄意渗透原画
import spell_22 from '../image/spells/22.png'; // 蓄意渗透
// [2026-07-17 鸦眼小队] 精密操作原画
import spell_23 from '../image/spells/23.png'; // 精密操作

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

// [新增] 安卡希雅 时之重奏专属法术
import acacia_chrono_echo_spell_base from '../image/spells/Acacia_Chrono Echo_spell.png';     // 安卡希雅的编曲
import acacia_chrono_echo_spell_01 from '../image/spells/Acacia_Chrono Echo_spell01.png';    // 剑咏变调
import acacia_chrono_echo_spell_02 from '../image/spells/Acacia_Chrono Echo_spell02.png';    // 相变之力·扭转
import acacia_chrono_echo_spell_03 from '../image/spells/Acacia_Chrono Echo_spell03.png';    // 时之协奏
import acacia_chrono_echo_spell_m1 from '../image/spells/Acacia_Chrono Echo_spell-1.png';    // 安卡希雅的重锋
import acacia_chrono_echo_spell_01_m1 from '../image/spells/Acacia_Chrono Echo_spell01-1.png'; // 越时斩
import acacia_chrono_echo_spell_02_m1 from '../image/spells/Acacia_Chrono Echo_spell02-1.png'; // 剑痕时空
import acacia_chrono_echo_spell_gen1 from '../image/spells/Acacia_Chrono Echo_spell_gen1.png'; // 灵轨月轮·扩散
import acacia_chrono_echo_spell_gen2 from '../image/spells/Acacia_Chrono Echo_spell_gen2.png'; // 灵轨月轮·集束
import acacia_chrono_echo_spell_gen3 from '../image/spells/Acacia_Chrono Echo_spell_gen3.png'; // 月镰剑势

// [新增] 占位法术图片（用于衍生法术暂无专图）
import abc_spell from '../image/spells/abc.png';

// [2026-08-05 莉莉子] 新法术批次卡面（24~34）
import spell_24 from '../image/spells/24.png'; // 抵抗
import spell_25 from '../image/spells/25.png'; // 抗拒
import spell_26 from '../image/spells/26.png'; // 拒绝
import spell_27 from '../image/spells/27.png'; // 战术回撤
import spell_28 from '../image/spells/28.png'; // 战术闪击
import spell_29 from '../image/spells/29.png'; // 单刀直入
import spell_30 from '../image/spells/30.png'; // 降临事件
import spell_31 from '../image/spells/31.png'; // 瓦尔哈拉的呼唤
import spell_32 from '../image/spells/32.png'; // 深思熟虑
import spell_33 from '../image/spells/33.png'; // 正面突破
import spell_34 from '../image/spells/34.png'; // 迂回防守
// [2026-08-08 莉莉子] 泰坦系 + 冻结 法术真卡面
import spell_35 from '../image/spells/35.png'; // 万钧齐鸣（泰坦脉冲）
import spell_36 from '../image/spells/36.png'; // 泰坦重燃（点亮泰坦关键词）
import spell_37 from '../image/spells/37.png'; // 急冻令（冻结单体）
// [2026-08-08 莉莉子] 最后一批法术真卡面（御剑归鞘/泰坦降临/神格共鸣/芬格尼尔之冬/破军/剑鸣回响）
import spell_38 from '../image/spells/38.png'; // 御剑归鞘（撤回+飞剑1）
import spell_39 from '../image/spells/39.png'; // 泰坦降临（燃尽召唤泰坦）
import spell_40 from '../image/spells/40.png'; // 神格共鸣（三选天启者+2/+2）
import spell_41 from '../image/spells/41.png'; // 芬格尼尔之冬（冻结全场+3伤）
import spell_42 from '../image/spells/42.png'; // 破军（单体3伤+飞剑减费）
import spell_43 from '../image/spells/43.png'; // 剑鸣回响（回响+飞剑2）

// [新增] 臆莲基座原画
import placeholder_pedestal from '../image/units/mauxir_lotus_pedestal.png';

// [新增] 飞剑衍生物占位图
import abc_unit from '../image/units/abc.png';

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
import cb_11 from '../image/card_back/11.png';
import cb_12 from '../image/card_back/12.png';
import cb_13 from '../image/card_back/13.png';
import cb_mauxir_lotus_drive from '../image/card_back/mauxir_lotus_drive.png';

// [新增] 批量引入牌桌 (01-05)
import desk_01 from '../image/desk/01.png';
import desk_02 from '../image/desk/02.png';
import desk_03 from '../image/desk/03.png';
import desk_04 from '../image/desk/04.png';
import desk_05 from '../image/desk/05.png';
import desk_06 from '../image/desk/06.png';
import desk_07 from '../image/desk/07.png';
import desk_08 from '../image/desk/08.png';
import desk_09 from '../image/desk/09.png';
import desk_10 from '../image/desk/10.png';


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
  'Night_Owl': 'Bridget_Squad_Valerie',
  'Green_Spirit_Squad_LuggageBot': 'Green_Spirit_Squad_Grace',
  // [2026-07-14 梵音] 衍生卡皮肤共享
  'Loka_Phantom_Serpent': 'SacredChants_Squad_Loka',
  // [2026-07-15 达努] 墓穴蜘蛛与班西共用卡面
  'Tomb_Spider': 'Danu_Squad_Banshee',
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

  // --- 御守小队 (Amulet Squad) ---
  scorching: 'Amulet_Squad_Scorching',
  cattail: 'Amulet_Squad_Cattail',
  peaches: 'Amulet_Squad_Peaches',

  // --- 梵灵小队 (FanLing Squad) ---
  lucia: 'FanLing_Squad_Lucia',
  nafu: 'FanLing_Squad_Nafu',
  wasi: 'FanLing_Squad_Wasi',

  // --- 诗人小队 (Poet Squad) ---
  oisin: 'Poet_Squad_Oisin',
  caitlin: 'Poet_Squad_Caitlin',
  kelo: 'Poet_Squad_Kelo',

  // --- 锻造者小队 (The Forger Squad) ---
  leisia: 'The_Forger_Squad_Leisia',
  tatiana: 'The_Forger_Squad_Tatiana',
  white_hunt: 'The_Forger_Squad_White_Hunt',

  // --- 布里吉小队 (Bridget Squad) ---
  feier: 'Bridget_Squad_Feier',
  chinchilla: 'Bridget_Squad_Chinchilla',
  valerie: 'Bridget_Squad_Valerie',

  // --- 梵音小队 (SacredChants Squad) ---
  loka: 'SacredChants_Squad_Loka',
  european_angelica: 'SacredChants_Squad_European_Angelica',
  shalo: 'SacredChants_Squad_Shalo',
  // 衍生物
  loka_phantom_serpent: 'Loka_Phantom_Serpent',
  angelica_hazy_note: 'Angelica_Hazy_Note',
  shalo_golem_glimpse: 'Shalo_Golem_Glimpse',

  // --- 精灵小队 (Spirit Squad) ---
  lusaka: 'Spirit_Squad_Lusaka',
  snenika: 'Spirit_Squad_Snenika',
  bonnie: 'Spirit_Squad_Bonnie',

  // --- 绿灵小队 (Green Spirit Squad) ---
  glanz: 'Green_Spirit_Squad_Glanz',
  eva: 'Green_Spirit_Squad_Eva',
  grace: 'Green_Spirit_Squad_Grace',
  luggageBot: 'Green_Spirit_Squad_LuggageBot',

  // --- 达努小队 (Danu Squad) ---
  banshee: 'Danu_Squad_Banshee',
  wendy: 'Danu_Squad_Wendy',
  silver_arm: 'Danu_Squad_SilverArm',
  // 衍生物
  tomb_spider: 'Tomb_Spider',

  // --- "鸦眼"小队 (Crows Eyest Squad) ---
  crows_an: 'Crows_Eyest_Squad_An',
  crows_mulin: 'Crows_Eyest_Squad_Mulin',
  crows_hiki: 'Crows_Eyest_Squad_Hiki',

  // --- 圣树小队 (Sacred Tree Squad) ---
  sacred_tree_alvina: 'Sacred_Tree_Squad_Alvina',
  sacred_tree_lumi: 'Sacred_Tree_Squad_Lumi',
  sacred_tree_margaret: 'Sacred_Tree_Squad_Margaret',

  // [安卡希雅] 飞剑衍生物
  acacia_flying_sword: 'Acacia_Flying_Sword',
  acacia_great_sword: 'Acacia_Great_Sword',
};


import PGgachaDeskImg from '../image/gacha/PermanentGachaPool/desk.png';
import PGgachaBtnImg from '../image/gacha/PermanentGachaPool/button.png';
import LgachaDeskImg from '../image/gacha/GachaPool1/desk.png';
import LgachaBtnImg from '../image/gacha/GachaPool1/button.png';

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
    cardBacks: [cb_01, cb_02, cb_03, cb_04, cb_fenny, cb_lyfe, cb_pupu, cb_05, cb_06, cb_07, cb_08, cb_09, cb_10, cb_11, cb_12, cb_13, cb_mauxir_lotus_drive],
    desks: [desk_01, desk_02, desk_03, desk_04, desk_05, desk_06, desk_07, desk_08, desk_09, desk_10]
};

export const gacha_icon = {
    PGgachaDeskImg,   // 永久池 封面
    PGgachaBtnImg,    // 永久池 按钮
    LgachaDeskImg,    // 烬中镜火池 封面
    LgachaBtnImg,     // 烬中镜火池 按钮
};

// 导出英雄图库常量
export const HERO_IMAGES: Record<string, { base: string; level2: string }> = {
    lyfe: { base: lyfe_1, level2: lyfe_2 },
    fenny: { base: fenny_1, level2: fenny_2 },
    pupu_specular_soul: { base: pupu_specular_soul_1, level2: pupu_specular_soul_2 },
    mauxir_lotus_drive: { base: mauxir_lotus_drive_1, level2: mauxir_lotus_drive_2 },
    acacia_chrono_echo: { base: acacia_chrono_echo_1, level2: acacia_chrono_echo_2 }
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

    // [新增] 第 5 批通用法术
    ghostly_shadows: spell_13,      // 鬼影森森
    destruction_ritual: spell_14,   // 毁灭仪式
    toad_pattern: spell_15,         // 蟾鉴易纹

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

    // [安卡希雅 时之重奏]
    acacia_chrono_echo_spell: acacia_chrono_echo_spell_base,
    acacia_chrono_echo_rush: acacia_chrono_echo_spell_01,
    acacia_chrono_echo_ultimate: acacia_chrono_echo_spell_02,
    acacia_chrono_echo_support: acacia_chrono_echo_spell_03,
    acacia_chrono_echo_heavy: acacia_chrono_echo_spell_m1,
    acacia_cross_temporal: acacia_chrono_echo_spell_01_m1,
    acacia_sword_timeline: acacia_chrono_echo_spell_02_m1,

    // [安卡·衍生法术] 灵轨月轮系列
    acacia_sword_rain: acacia_chrono_echo_spell_gen1,
    acacia_moon_focus: acacia_chrono_echo_spell_gen2,
    acacia_sword_rain_alt: acacia_chrono_echo_spell_gen3,

    // [布里吉小队] 菲儿生成的"强行通讯"
    forced_communication: spell_16,

    // [精灵小队] 精灵祈愿
    spirit_prayer: spell_17,

    // [诗人小队] 真实快照
    true_snapshot: spell_18,

    // [梵音小队] 迷离之音 & 巨偶一瞥
    angelica_hazy_note: spell_19,
    shalo_golem_glimpse: spell_20,

    // [达努小队] 银臂乱打
    silver_arm_smash: spell_21,

    // [2026-07-17 阿尔戈小队] 蓄意渗透
    deliberate_infiltration: spell_22,

    // [2026-07-17 鸦眼小队] 精密操作
    crows_precise_operation: spell_23,

    // [2026-08-05 莉莉子] 新法术批次（11 张已命名接入真卡面，7 张未命名暂用占位图）
    temp_spell_01: spell_30, // 降临事件
    temp_spell_02: spell_31, // 瓦尔哈拉的呼唤
    temp_spell_03: spell_36, // 泰坦重燃（点亮泰坦关键词）
    temp_spell_04: spell_35, // 万钧齐鸣（泰坦脉冲）
    temp_spell_05: spell_29, // 单刀直入
    temp_spell_06: spell_24, // 抵抗
    temp_spell_07: spell_25, // 抗拒
    temp_spell_08: spell_26, // 拒绝
    temp_spell_09: spell_38, // 御剑归鞘（撤回+飞剑1）
    temp_spell_10: spell_27, // 战术回撤
    temp_spell_11: spell_28, // 战术闪击
    temp_spell_12: spell_39, // 泰坦降临（燃尽召唤泰坦）
    temp_spell_13: spell_32, // 深思熟虑
    temp_spell_14: spell_33, // 正面突破
    temp_spell_15: spell_34, // 迂回防守
    temp_spell_16: spell_40, // 神格共鸣（三选天启者+2/+2）
    temp_spell_17: spell_41, // 芬格尼尔之冬（冻结全场+3伤）
    temp_spell_18: spell_37, // 急冻令（冻结单体）
    temp_spell_19: spell_42, // 破军（单体3伤+飞剑减费）
    temp_spell_20: spell_43, // 剑鸣回响（回响+飞剑2）
};

// [新增] 导出占位图（飞剑等暂无专图的衍生物用）
export const PLACEHOLDER_IMAGES = {
    unit: abc_unit,
    spell: abc_spell,
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
    mauxirRushBeAttacked: mauxir_rush_be_attacked,
    // [新增] 差异化法术受击特效——程 2026-06-29
    buffAll: effect_buff_all,         // 双维增益（+攻+血）
    buffKeyword: effect_buff_keyword, // 关键词赋予
    buffLife: effect_buff_life,       // 仅生命增益
    buffPower: effect_buff_power,     // 仅攻击增益
    healing: effect_healing,          // 治疗回血
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