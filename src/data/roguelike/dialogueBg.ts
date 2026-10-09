// ==========================================
// 悖论迷宫 · 节点进入面板背景图（dialogue 目录）
// [2026-08-27 莉莉子] 节点进入方形面板共用 dialogue 横版背景；
//   编辑器可给节点指定 key（dialogueBg），未指定时打开面板随机赋予。
// ==========================================
import d1 from '../../image/dialogue/1.webp';
import d2 from '../../image/dialogue/2.webp';
import d3 from '../../image/dialogue/3.webp';
import d4 from '../../image/dialogue/4.webp';
import d5 from '../../image/dialogue/5.webp';
import d6 from '../../image/dialogue/6.webp';
import d7 from '../../image/dialogue/7.webp';
import d8 from '../../image/dialogue/8.webp';
// [2026-10-08 莉莉子 · 瓦尔基里大赛] 事件**专属 CG**（程指定：该事件用这张）
import plotCg003 from '../../image/map/dialogue/PlotCG_003.png';

export const DIALOGUE_BG_IMAGES: string[] = [d1, d2, d3, d4, d5, d6, d7, d8];

/**
 * [2026-10-08 莉莉子 · 瓦尔基里大赛] **事件专属 CG 表**（key → url）。
 * 由事件数据的 `RogueEvent.cg` 字段引用；比"一局内固定随机背景"更强的叙事指向。
 */
export const EVENT_CG_IMAGES: Record<string, string> = {
    valkyrie_arena: plotCg003,
};

/** 取事件专属 CG：key 未命中 ⇒ `undefined`（调用方回落到 `getDialogueBg()`） */
export const getEventCg = (key?: string): string | undefined =>
    key ? EVENT_CG_IMAGES[key] : undefined;

/** 编辑器可选背景 key（'1'~'8'，对应 dialogue/1.png ~ 8.png） */
export const DIALOGUE_BG_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8'];

/**
 * 取节点进入面板背景图：指定 key → 对应图；未指定/非法 → 随机一张（程拍板：随机赋予，任何节点都可能用任一图）
 */
export const getDialogueBg = (key?: string): string => {
    if (key) {
        const i = parseInt(key, 10);
        if (i >= 1 && i <= DIALOGUE_BG_IMAGES.length) return DIALOGUE_BG_IMAGES[i - 1];
    }
    return DIALOGUE_BG_IMAGES[Math.floor(Math.random() * DIALOGUE_BG_IMAGES.length)];
};
