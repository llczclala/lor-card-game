const loadingImagesModules = import.meta.glob('../image/loading/*.png', { eager: true });

// 转换为图片路径数组
export const LOADING_SCREEN_IMAGES = Object.values(loadingImagesModules).map((mod: any) => mod.default);

// [新增] 货币图标导入
import icon_silver from '../image/icon/silverCoin.png';
import icon_data from '../image/icon/dataGold.png';
import icon_bit from '../image/icon/bitGold.png';

import icon_levelup from '../image/icon/levelup.png';
import icon_leveldown from '../image/icon/leveldown.png';

import border_hero from '../image/cardborder/cardborder_hero.png';
import border_spell from '../image/cardborder/cardborder_spell.png';
import border_unit from '../image/cardborder/cardborder_unit.png';

// 引入里芙的原画
import lyfe_1 from '../image/hero/里芙1.png';
import lyfe_2 from '../image/hero/里芙2.png';

// 引入芬妮的原画
import fenny_1 from '../image/hero/芬妮1.png';
import fenny_2 from '../image/hero/芬妮2.png';
// --- 法术卡面 (Spells) ---
// 通用法术
import spell_01 from '../image/spells/01.png'; // 单挑
import spell_02 from '../image/spells/02.png'; // 祈祷
import spell_03 from '../image/spells/03.png'; // 专注
import spell_04 from '../image/spells/04.png'; // 暗箭
import spell_05 from '../image/spells/05.png'; // 振奋
import spell_06 from '../image/spells/06.png'; // 破坏

// 芬妮专属法术
import fenny_spell_base from '../image/spells/fenny_spell.png';   // 芬妮的狂热
import fenny_spell_01 from '../image/spells/fenny_spell01.png';  // 星光之途
import fenny_spell_02 from '../image/spells/fenny_spell02.png';  // 绝对主角

// 里芙专属法术
import lyfe_spell_base from '../image/spells/lyfe_spell.png';    // 里芙的决意
import lyfe_spell_01 from '../image/spells/lyfe_spell01.png';   // 无尽霜刃
import lyfe_spell_02 from '../image/spells/lyfe_spell02.png';   // 吞噬神座
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

// [新增] 引入按钮容器背景 (注意文件名拼写 buttton1)
import button_container from '../image/icon/buttton1.png';
import title_logo from '../image/icon/titile.png';
import sword_icon from '../image/icon/sword.png';
import sword_gain_icon from '../image/icon/sword_gain.png';


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

// [新增] 批量引入卡背 (01-05)
import cb_01 from '../image/card_back/01.png';
import cb_02 from '../image/card_back/02.png';
import cb_03 from '../image/card_back/03.png';
import cb_04 from '../image/card_back/04.png';
import cb_05 from '../image/card_back/05.png';
import cb_06 from '../image/card_back/06.png';

// [新增] 批量引入牌桌 (01-05)
import desk_01 from '../image/desk/01.png';
import desk_02 from '../image/desk/02.png';
import desk_03 from '../image/desk/03.png';
import desk_04 from '../image/desk/04.png';
import desk_05 from '../image/desk/05.png';


// [新增] 引入 Logistics (后勤) 单位图片

import unit_martina from '../image/units/Dream_Guardians_Squad-Martina.png';
import unit_saikui from '../image/units/Dream_Guardians_Squad-Saikui.png';
import unit_haifa from '../image/units/Dream_Guardians_Squad-Haifa.png';

import unit_ah_hua from '../image/units/Messenger_Squad_Ah_Hua.png';
import unit_gena from '../image/units/Messenger_Squad_Gena.png';
import unit_wall_e from '../image/units/Messenger_Squad_WALL_E.png';

// [新增] 引入“阿尔斯特”小队图片
import unit_koni from '../image/units/Ulster_Squad_Koni.png';
import unit_maeve from '../image/units/Ulster_Squad_Maeve.png';
import unit_flamme from '../image/units/Ulster_Squad_Flamme.png';

// [新增] 引入“堤丰”小队图片
import unit_flameheart from '../image/units/Typhoon_Squad_Flameheart.png';
import unit_dornier from '../image/units/Typhoon_Squad_Dornier.png';
import unit_613 from '../image/units/Typhoon_Squad_613.png';

// [新增] 引入“鬼怪”小队图片
import unit_antina from '../image/units/Ghost_Squad_Antina.png';
import unit_vez from '../image/units/Ghost_Squad_Vez.png';
import unit_valen from '../image/units/Ghost_Squad_Valen.png';

// [新增] 引入“阿尔戈”小队图片
import unit_pigeon from '../image/units/Argo_Squad_Pigeon.png';
import unit_musician from '../image/units/Argo_Squad_Musician.png';
import unit_arrowhead from '../image/units/Argo_Squad_Arrowhead.png';

// [新增] 明夷小队 (Mingyi Squad)
import unit_zhe_hao from '../image/units/Mingyi_Squad_Zhe_hao.png';
import unit_zhu_he from '../image/units/Mingyi_Squad_Zhu_He.png';
import unit_jin_lang from '../image/units/Mingyi_Squad_Jin_Lang.png';

// [新增] 星朗小队 (Star Bright Squad)
import unit_doveil from '../image/units/Star_Bright_Squad_Doveil.png';
import unit_alivy from '../image/units/Star_Bright_Squad_Alivy.png';
import unit_dakors from '../image/units/Star_Bright_Squad_Dakors.png';

import PGgachaDeskImg from '../image/gacha/PermanentGachaPool/desk.png';
import PGgachaBtnImg from '../image/gacha/PermanentGachaPool/button.png';



// 定义英雄图片资源结构
export interface HeroImages {
    base: string;   // 1级卡面
    level2: string; // 2级卡面
}

export const PERSONALIZATION_ASSETS = {
    cardBacks: [cb_01, cb_02, cb_03, cb_04, cb_05,cb_06],
    desks: [desk_01, desk_02, desk_03, desk_04, desk_05]
};

export const gacha_icon = {
    PGgachaDeskImg,   // 1级卡面
    PGgachaBtnImg // 2级卡面
};

// 导出英雄图库常量
export const HERO_IMAGES: Record<string, { base: string; level2: string }> = {
    lyfe: { base: lyfe_1, level2: lyfe_2 },
    fenny: { base: fenny_1, level2: fenny_2 }
};
// [新增] 导出正式单位图片集合
export const UNIT_IMAGES = {
    // 守梦人小队
    martina: unit_martina,
    saikui: unit_saikui,
    haifa: unit_haifa,
    // [新增] 信使小队
    ah_hua: unit_ah_hua,
    gena: unit_gena,
    wall_e: unit_wall_e,

    // [新增] 阿尔斯特小队
    koni: unit_koni,
    maeve: unit_maeve,
    flamme: unit_flamme,

    // [新增] 堤丰小队
    flameheart: unit_flameheart,
    dornier: unit_dornier,
    unit_613: unit_613,

    // [新增] 鬼怪小队
    antina: unit_antina,
    vez: unit_vez,
    valen: unit_valen,

    // [新增] 阿尔戈小队
    pigeon: unit_pigeon,
    musician: unit_musician,
    arrowhead: unit_arrowhead,

    // [新增] 明夷小队
    zhe_hao: unit_zhe_hao,
    zhu_he: unit_zhu_he,
    jin_lang: unit_jin_lang,

    // [新增] 星朗小队
    doveil: unit_doveil,
    alivy: unit_alivy,
    dakors: unit_dakors,

};

// [新增] 导出法术图库
export const SPELL_IMAGES = {
    // 通用
    single_combat: spell_01,
    prayer: spell_02,
    focus: spell_03,
    hidden_arrow: spell_04,
    inspire: spell_05,
    destruction: spell_06,

    // 芬妮
    fenny_spell: fenny_spell_base,
    fenny_strike: fenny_spell_01,
    fenny_ultimate: fenny_spell_02,

    // 里芙
    lyfe_spell: lyfe_spell_base,
    lyfe_rush: lyfe_spell_01,
    lyfe_ultimate: lyfe_spell_02
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
    channel: t_36
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
    titleLogo: title_logo // [新增] 注册 Logo
};

export const UI_ICONS = {
    levelup: icon_levelup,
    leveldown: icon_leveldown
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