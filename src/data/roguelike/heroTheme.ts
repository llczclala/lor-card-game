// ==========================================
// 悖论迷宫 · 天启者主题色（选择界面背景/按钮随所选天启者切换）
// [2026-08-13 莉莉子] 色值对齐 Card.tsx 阵营卡牌背景色（via-*-950），勿自创
//   阵营背景（Card.tsx:1283-1289）：Lyfe=blue-950 / Fenny=orange-950 / Pupu=red-950
//                                   Mauxir=purple-950 / Acacia=sky-950
// ==========================================

export interface HeroTheme {
    color: string;   // 主色（按钮/描边/发光，对齐阵营亮色）
    soft: string;    // 淡深色（背景渐变中心，对齐阵营 via-*-950）
    glow: string;    // 发光 rgba
}

export const HERO_THEMES: Record<string, HeroTheme> = {
    lyfe: { color: '#3b82f6', soft: '#172554', glow: 'rgba(59,130,246,0.7)' },                  // Lyfe 蓝（blue）
    fenny: { color: '#f97316', soft: '#431407', glow: 'rgba(249,115,22,0.7)' },                // Fenny 橙（orange）
    pupu_specular_soul: { color: '#ef4444', soft: '#450a0a', glow: 'rgba(239,68,68,0.7)' },    // Pupu 红（red）
    mauxir_lotus_drive: { color: '#a855f7', soft: '#3b0764', glow: 'rgba(168,85,247,0.7)' },   // Mauxir 紫（purple）
    acacia_chrono_echo: { color: '#0ea5e9', soft: '#082f49', glow: 'rgba(14,165,233,0.7)' },   // Acacia 天蓝（sky）
};

export const getHeroTheme = (heroKey: string): HeroTheme => HERO_THEMES[heroKey] ?? HERO_THEMES.lyfe;
