import { PERSONALIZATION_ASSETS } from '../data/imageData';

// 默认卡背路径 (硬编码兜底，防止 imageData 加载失败)
// 注意：Webpack/Vite 环境下通常需要 require 或 import 才能获取正确路径，
// 但这里我们主要依赖 PERSONALIZATION_ASSETS 的第 0 项。
const DEFAULT_CARD_BACK_INDEX = 0;

/**
 * 根据索引获取卡背图片的完整 URL
 * @param index 用户选择的卡背索引
 * @returns 图片路径 string
 */
export const getCardBackUrl = (index: number): string => {
    const backs = PERSONALIZATION_ASSETS.cardBacks;

    // 1. 尝试获取选中项
    if (backs && backs[index]) {
        return backs[index];
    }

    // 2. 如果索引无效 (越界/未定义)，回退到默认 (索引 0)
    if (backs && backs[DEFAULT_CARD_BACK_INDEX]) {
        return backs[DEFAULT_CARD_BACK_INDEX];
    }

    // 3. 终极兜底 (如果连资源表都空了，防止崩溃)
    // 这里使用一个纯色占位，或者你可以替换为你确定的本地路径字符串
    console.warn('[StyleUtils] Card back assets missing, using placeholder.');
    return 'https://placehold.co/300x450/1e293b/ffffff?text=BACK';
};

/**
 * 根据索引获取牌桌背景图片的完整 URL
 * @param index 用户选择的牌桌索引
 * @returns 图片路径 string
 */
export const getDeskUrl = (index: number): string => {
    const desks = PERSONALIZATION_ASSETS.desks;

    if (desks && desks[index]) {
        return desks[index];
    }

    if (desks && desks[0]) {
        return desks[0];
    }

    return ''; // 牌桌如果没有可以返回空，使用默认 CSS 样式
};