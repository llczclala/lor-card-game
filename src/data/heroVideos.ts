// ==========================================
// 天启者动态卡面视频映射
// [2026-08-16 莉莉子] 用 MiniMax H3 生成的动态英雄卡面视频，替代静态立绘
//   对应 HERO_IMAGES 的 { base, level2 } 双形态：里芙1.mp4 ↔ 里芙1.png（base），里芙2.mp4 ↔ 里芙2.png（level2）
//   默认仍为静态卡面（heroDynamic=false），玩家在设置里手动开启
//   生效范围：对局核心（手牌/场上/备战席/悬停预览）+ 备战环节悬停大图（DeckBuilder 显式传 heroDynamic）
//   其他英雄后续放视频 + 补一行即可接入
// ==========================================
import hero_lyfe_1 from '../movie/hero/里芙1.mp4';
import hero_lyfe_2 from '../movie/hero/里芙2.mp4';
import hero_fenny_1 from '../movie/hero/芬妮1.mp4';
import hero_fenny_2 from '../movie/hero/芬妮2.mp4';
import hero_pupu_1 from '../movie/hero/卜卜灵鉴1.mp4';
import hero_pupu_2 from '../movie/hero/卜卜灵鉴2.mp4';
import hero_mauxir_1 from '../movie/hero/猫汐尔莲驱1.mp4';
import hero_mauxir_2 from '../movie/hero/猫汐尔莲驱2.mp4';
import hero_acacia_1 from '../movie/hero/安卡希雅时之重奏1.mp4';
import hero_acacia_2 from '../movie/hero/安卡希雅时之重奏2.mp4';

export interface HeroVideoEntry {
    base?: string;   // 基础形态（升级前卡面）
    level2?: string; // 二阶段形态（升级后卡面）
}

// 英雄 key → 动态卡面视频（与 HERO_IMAGES 结构对齐）
export const HERO_VIDEOS: Record<string, HeroVideoEntry> = {
    lyfe: { base: hero_lyfe_1, level2: hero_lyfe_2 },                 // 里芙：base=里芙1.mp4 / level2=里芙2.mp4
    fenny: { base: hero_fenny_1, level2: hero_fenny_2 },              // 芬妮：base=芬妮1.mp4 / level2=芬妮2.mp4
    pupu_specular_soul: { base: hero_pupu_1, level2: hero_pupu_2 },   // 卜卜灵鉴：base=卜卜灵鉴1.mp4 / level2=卜卜灵鉴2.mp4
    mauxir_lotus_drive: { base: hero_mauxir_1, level2: hero_mauxir_2 }, // 猫汐尔莲驱：base=猫汐尔莲驱1.mp4 / level2=猫汐尔莲驱2.mp4
    acacia_chrono_echo: { base: hero_acacia_1, level2: hero_acacia_2 }, // 安卡希雅时之重奏：base=安卡希雅时之重奏1.mp4 / level2=安卡希雅时之重奏2.mp4
};

/** 获取指定英雄对应形态的动态卡面视频 URL（无则 undefined → 使用静态图） */
export const getHeroVideo = (key: string, level: number): string | undefined => {
    const entry = HERO_VIDEOS[key];
    if (!entry) return undefined;
    return level === 2 ? entry.level2 : entry.base;
};
