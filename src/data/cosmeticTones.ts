// ==========================================
// 装饰资产色调分类（卡背 / 牌桌）
// [2026-09-26 莉莉子] 由脚本 analyze_cosmetic_tones 自动生成，勿手改
//   来源：sharp 读取主色（dominant）算色相温度 + 整体亮度（luma）分明暗
//   温度：saturation < 0.18 → neutral；色相 70~160 或 300~360 之外按冷暖划分
//   明暗：luma < .45 → dark，否则 bright（二分，避免"中间档"吃掉一半样本）
// ==========================================

export type CosmeticTemp = 'cool' | 'warm' | 'neutral';
export type CosmeticLight = 'bright' | 'dark';
export interface CosmeticTone { temp: CosmeticTemp; light: CosmeticLight }

// key = `${type}:${index}`，index 对齐 PERSONALIZATION_ASSETS 数组下标
export const COSMETIC_TONES: Record<string, CosmeticTone> = {
    // ── 牌桌 desks（0~14 ↔ 01~15.webp）──
    'desk:0': { temp: 'cool', light: 'bright' }, // 01 #68a8d8 H206 luma0.67
    'desk:1': { temp: 'warm', light: 'bright' }, // 02 #280808 H0 luma0.47
    'desk:2': { temp: 'neutral', light: 'bright' }, // 03 #9898a8 H240 luma0.57
    'desk:3': { temp: 'cool', light: 'bright' }, // 04 #d8f8f8 H180 luma0.59
    'desk:4': { temp: 'neutral', light: 'dark' }, // 05 #f8f8f8 H0 luma0.35
    'desk:5': { temp: 'cool', light: 'bright' }, // 06 #38a8b8 H188 luma0.58
    'desk:6': { temp: 'neutral', light: 'dark' }, // 07 #282838 H240 luma0.32
    'desk:7': { temp: 'cool', light: 'bright' }, // 08 #4888a8 H200 luma0.49
    'desk:8': { temp: 'cool', light: 'bright' }, // 09 #584868 H270 luma0.46
    'desk:9': { temp: 'warm', light: 'dark' }, // 10 #881848 H334 luma0.4
    'desk:10': { temp: 'warm', light: 'bright' }, // 11 #f8e8d8 H30 luma0.7
    'desk:11': { temp: 'cool', light: 'dark' }, // 12 #283858 H220 luma0.28
    'desk:12': { temp: 'warm', light: 'bright' }, // 13 #c8b8a8 H30 luma0.5
    'desk:13': { temp: 'warm', light: 'dark' }, // 14 #483828 H30 luma0.28
    'desk:14': { temp: 'neutral', light: 'dark' }, // 15 #585858 H0 luma0.35
    // ── 卡背 cardBacks（对齐 cardBacks 数组顺序）──
    'cardBack:0': { temp: 'neutral', light: 'dark' }, // 01 #080808 H0 luma0.2
    'cardBack:1': { temp: 'neutral', light: 'dark' }, // 02 #181818 H0 luma0.42
    'cardBack:2': { temp: 'neutral', light: 'bright' }, // 03 #f8f8f8 H0 luma0.52
    'cardBack:3': { temp: 'warm', light: 'dark' }, // 04 #481818 H0 luma0.43
    'cardBack:4': { temp: 'warm', light: 'dark' }, // fenny #481818 H0 luma0.41
    'cardBack:5': { temp: 'neutral', light: 'bright' }, // lyfe #e8e8e8 H0 luma0.64
    'cardBack:6': { temp: 'neutral', light: 'dark' }, // pupu_specular #181818 H0 luma0.3
    'cardBack:7': { temp: 'cool', light: 'bright' }, // 05 #082848 H210 luma0.47
    'cardBack:8': { temp: 'warm', light: 'bright' }, // 06 #481808 H15 luma0.48
    'cardBack:9': { temp: 'warm', light: 'dark' }, // 07 #280808 H0 luma0.26
    'cardBack:10': { temp: 'warm', light: 'dark' }, // 08 #280808 H0 luma0.37
    'cardBack:11': { temp: 'cool', light: 'dark' }, // 09 #182858 H225 luma0.4
    'cardBack:12': { temp: 'neutral', light: 'bright' }, // 10 #f8f8f8 H0 luma0.48
    'cardBack:13': { temp: 'warm', light: 'dark' }, // 11 #c88898 H345 luma0.28
    'cardBack:14': { temp: 'cool', light: 'dark' }, // 12 #381858 H270 luma0.36
    'cardBack:15': { temp: 'warm', light: 'dark' }, // 13 #380818 H340 luma0.28
    'cardBack:16': { temp: 'cool', light: 'dark' }, // mauxir_lotus_drive #381858 H270 luma0.34
    'cardBack:17': { temp: 'cool', light: 'bright' }, // 17 #080818 H240 luma0.51
    'cardBack:18': { temp: 'neutral', light: 'dark' }, // 18 #080808 H0 luma0.44
    'cardBack:19': { temp: 'cool', light: 'dark' }, // 19 #381858 H270 luma0.23
};

/** 取装饰资产色调（未登记则 undefined → UI 不显示该维度） */
export const getCosmeticTone = (type: 'desk' | 'cardBack', index: number): CosmeticTone | undefined =>
    COSMETIC_TONES[`${type}:${index}`];
