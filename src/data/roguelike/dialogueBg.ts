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

export const DIALOGUE_BG_IMAGES: string[] = [d1, d2, d3, d4, d5, d6, d7, d8];

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
