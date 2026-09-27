// ==========================================
// 法术动态卡面视频映射
// [2026-09-26 莉莉子] 用 MiniMax H3 生成的动态法术卡面视频，替代静态插画
//   对应 SPELL_IMAGES 的卡牌 key：single_combat ↔ 01.webm 等，
//   视频文件名与静态图文件名一一对应（.webp → .webm）
//   默认仍为静态卡面（spellDynamic=false），玩家在设置里手动开启
//   生效范围：对局核心（手牌/场上/悬停预览），图鉴/卡池保持静态
//   ⚠️ 本文件由脚本 gen_spell_videos.js 自动生成，勿手改
// ==========================================
import sv_01 from '../movie/spells/01.webm';
import sv_02 from '../movie/spells/02.webm';
import sv_03 from '../movie/spells/03.webm';
import sv_04 from '../movie/spells/04.webm';
import sv_05 from '../movie/spells/05.webm';
import sv_06 from '../movie/spells/06.webm';
import sv_07 from '../movie/spells/07.webm';
import sv_08 from '../movie/spells/08.webm';
import sv_09 from '../movie/spells/09.webm';
import sv_10 from '../movie/spells/10.webm';
import sv_11 from '../movie/spells/11.webm';
import sv_12 from '../movie/spells/12.webm';
import sv_13 from '../movie/spells/13.webm';
import sv_14 from '../movie/spells/14.webm';
import sv_15 from '../movie/spells/15.webm';
import sv_fenny_spell from '../movie/spells/fenny_spell.webm';
import sv_fenny_spell01 from '../movie/spells/fenny_spell01.webm';
import sv_fenny_spell02 from '../movie/spells/fenny_spell02.webm';
import sv_fenny_spell03 from '../movie/spells/fenny_spell03.webm';
import sv_lyfe_spell from '../movie/spells/lyfe_spell.webm';
import sv_lyfe_spell01 from '../movie/spells/lyfe_spell01.webm';
import sv_lyfe_spell02 from '../movie/spells/lyfe_spell02.webm';
import sv_lyfe_spell03 from '../movie/spells/lyfe_spell03.webm';
import sv_pupu_specular_soul_spell from '../movie/spells/pupu_specular_soul_spell.webm';
import sv_pupu_specular_soul_spell01 from '../movie/spells/pupu_specular_soul_spell01.webm';
import sv_pupu_specular_soul_spell02 from '../movie/spells/pupu_specular_soul_spell02.webm';
import sv_pupu_specular_soul_spell03 from '../movie/spells/pupu_specular_soul_spell03.webm';
import sv_mauxir_lotus_robot from '../movie/spells/mauxir_lotus_robot.webm';
import sv_mauxir_lotus_spell from '../movie/spells/mauxir_lotus_spell.webm';
import sv_mauxir_lotus_spell01 from '../movie/spells/mauxir_lotus_spell01.webm';
import sv_mauxir_lotus_spell02 from '../movie/spells/mauxir_lotus_spell02.webm';
import sv_mauxir_lotus_spell03 from '../movie/spells/mauxir_lotus_spell03.webm';
import sv_marian_spell from '../movie/spells/marian_spell.webm';
import sv_marian_spell01 from '../movie/spells/marian_spell01.webm';
import sv_marian_spell02 from '../movie/spells/marian_spell02.webm';
import sv_marian_spell03 from '../movie/spells/marian_spell03.webm';
import sv_47 from '../movie/spells/47.webm';
import sv_48 from '../movie/spells/48.webm';
import sv_49 from '../movie/spells/49.webm';
import sv_44 from '../movie/spells/44.webm';
import sv_45 from '../movie/spells/45.webm';
import sv_46 from '../movie/spells/46.webm';
import sv_Acacia_Chrono_Echo_spell from '../movie/spells/Acacia_Chrono Echo_spell.webm';
import sv_Acacia_Chrono_Echo_spell01 from '../movie/spells/Acacia_Chrono Echo_spell01.webm';
import sv_Acacia_Chrono_Echo_spell02 from '../movie/spells/Acacia_Chrono Echo_spell02.webm';
import sv_Acacia_Chrono_Echo_spell03 from '../movie/spells/Acacia_Chrono Echo_spell03.webm';
import sv_Acacia_Chrono_Echo_spell_1 from '../movie/spells/Acacia_Chrono Echo_spell-1.webm';
import sv_Acacia_Chrono_Echo_spell01_1 from '../movie/spells/Acacia_Chrono Echo_spell01-1.webm';
import sv_Acacia_Chrono_Echo_spell02_1 from '../movie/spells/Acacia_Chrono Echo_spell02-1.webm';
import sv_Acacia_Chrono_Echo_spell_gen1 from '../movie/spells/Acacia_Chrono Echo_spell_gen1.webm';
import sv_Acacia_Chrono_Echo_spell_gen2 from '../movie/spells/Acacia_Chrono Echo_spell_gen2.webm';
import sv_Acacia_Chrono_Echo_spell_gen3 from '../movie/spells/Acacia_Chrono Echo_spell_gen3.webm';
import sv_16 from '../movie/spells/16.webm';
import sv_17 from '../movie/spells/17.webm';
import sv_18 from '../movie/spells/18.webm';
import sv_19 from '../movie/spells/19.webm';
import sv_20 from '../movie/spells/20.webm';
import sv_21 from '../movie/spells/21.webm';
import sv_22 from '../movie/spells/22.webm';
import sv_23 from '../movie/spells/23.webm';
import sv_30 from '../movie/spells/30.webm';
import sv_31 from '../movie/spells/31.webm';
import sv_36 from '../movie/spells/36.webm';
import sv_35 from '../movie/spells/35.webm';
import sv_29 from '../movie/spells/29.webm';
import sv_24 from '../movie/spells/24.webm';
import sv_25 from '../movie/spells/25.webm';
import sv_26 from '../movie/spells/26.webm';
import sv_38 from '../movie/spells/38.webm';
import sv_27 from '../movie/spells/27.webm';
import sv_28 from '../movie/spells/28.webm';
import sv_39 from '../movie/spells/39.webm';
import sv_32 from '../movie/spells/32.webm';
import sv_33 from '../movie/spells/33.webm';
import sv_34 from '../movie/spells/34.webm';
import sv_40 from '../movie/spells/40.webm';
import sv_41 from '../movie/spells/41.webm';
import sv_37 from '../movie/spells/37.webm';
import sv_42 from '../movie/spells/42.webm';
import sv_43 from '../movie/spells/43.webm';

// 卡牌 key → 动态法术卡面视频 URL
export const SPELL_VIDEOS: Record<string, string> = {
    single_combat: sv_01,
    prayer: sv_02,
    focus: sv_03,
    hidden_arrow: sv_04,
    inspire: sv_05,
    destruction: sv_06,
    vitality_regen: sv_07,
    full_purification: sv_08,
    backroom_deal: sv_09,
    vitality_supplement: sv_10,
    energy_supplement: sv_11,
    bader_reagent: sv_12,
    // 鬼影森森
    ghostly_shadows: sv_13,
    // 毁灭仪式
    destruction_ritual: sv_14,
    // 蟾鉴易纹
    toad_pattern: sv_15,
    fenny_spell: sv_fenny_spell,
    fenny_strike: sv_fenny_spell01,
    fenny_ultimate: sv_fenny_spell02,
    // [新增] 激励之声
    fenny_support: sv_fenny_spell03,
    lyfe_spell: sv_lyfe_spell,
    lyfe_rush: sv_lyfe_spell01,
    lyfe_ultimate: sv_lyfe_spell02,
    // [新增] 冻沙激流
    lyfe_support: sv_lyfe_spell03,
    pupu_specular_soul_spell: sv_pupu_specular_soul_spell,
    pupu_specular_soul_rush: sv_pupu_specular_soul_spell01,
    pupu_specular_soul_ultimate: sv_pupu_specular_soul_spell02,
    // [新增] 异镜来物
    pupu_specular_soul_support: sv_pupu_specular_soul_spell03,
    dream_lotus_drone: sv_mauxir_lotus_robot,
    mauxir_lotus_spell: sv_mauxir_lotus_spell,
    mauxir_lotus_rush: sv_mauxir_lotus_spell01,
    mauxir_lotus_ultimate: sv_mauxir_lotus_spell02,
    mauxir_lotus_support: sv_mauxir_lotus_spell03,
    marian_spell: sv_marian_spell,
    marian_rush: sv_marian_spell01,
    marian_ultimate: sv_marian_spell02,
    marian_support: sv_marian_spell03,
    // 猎影标记（T17）
    marian_faction_mark: sv_47,
    // 以饵引狼（T18）
    marian_faction_bait: sv_48,
    // 静默行动（T19）
    marian_faction_silence: sv_49,
    mauxir_zhishui_ningxing: sv_44,
    mauxir_yiying_tuoyin: sv_45,
    mauxir_ouduan_si_chang: sv_46,
    acacia_chrono_echo_spell: sv_Acacia_Chrono_Echo_spell,
    acacia_chrono_echo_rush: sv_Acacia_Chrono_Echo_spell01,
    acacia_chrono_echo_ultimate: sv_Acacia_Chrono_Echo_spell02,
    acacia_chrono_echo_support: sv_Acacia_Chrono_Echo_spell03,
    acacia_chrono_echo_heavy: sv_Acacia_Chrono_Echo_spell_1,
    acacia_cross_temporal: sv_Acacia_Chrono_Echo_spell01_1,
    acacia_sword_timeline: sv_Acacia_Chrono_Echo_spell02_1,
    acacia_sword_rain: sv_Acacia_Chrono_Echo_spell_gen1,
    acacia_moon_focus: sv_Acacia_Chrono_Echo_spell_gen2,
    acacia_sword_rain_alt: sv_Acacia_Chrono_Echo_spell_gen3,
    forced_communication: sv_16,
    spirit_prayer: sv_17,
    true_snapshot: sv_18,
    angelica_hazy_note: sv_19,
    shalo_golem_glimpse: sv_20,
    silver_arm_smash: sv_21,
    deliberate_infiltration: sv_22,
    crows_precise_operation: sv_23,
    // 降临事件
    temp_spell_01: sv_30,
    // 瓦尔哈拉的呼唤
    temp_spell_02: sv_31,
    // 泰坦重燃（点亮泰坦关键词）
    temp_spell_03: sv_36,
    // 万钧齐鸣（泰坦脉冲）
    temp_spell_04: sv_35,
    // 单刀直入
    temp_spell_05: sv_29,
    // 抵抗
    temp_spell_06: sv_24,
    // 抗拒
    temp_spell_07: sv_25,
    // 拒绝
    temp_spell_08: sv_26,
    // 御剑归鞘（撤回+飞剑1）
    temp_spell_09: sv_38,
    // 战术回撤
    temp_spell_10: sv_27,
    // 战术闪击
    temp_spell_11: sv_28,
    // 泰坦降临（燃尽召唤泰坦）
    temp_spell_12: sv_39,
    // 深思熟虑
    temp_spell_13: sv_32,
    // 正面突破
    temp_spell_14: sv_33,
    // 迂回防守
    temp_spell_15: sv_34,
    // 神格共鸣（三选天启者+2/+2）
    temp_spell_16: sv_40,
    // 芬格尼尔之冬（冻结全场+3伤）
    temp_spell_17: sv_41,
    // 急冻令（冻结单体）
    temp_spell_18: sv_37,
    // 破军（单体3伤+飞剑减费）
    temp_spell_19: sv_42,
    // 剑鸣回响（回响+飞剑2）
    temp_spell_20: sv_43,
};

/** 获取指定法术卡牌 key 的动态卡面视频 URL（无则 undefined → 使用静态图兜底） */
export const getSpellVideo = (key: string): string | undefined => SPELL_VIDEOS[key];
