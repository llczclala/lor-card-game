/**
 * 影片预加载器
 *
 * 在需要播放视频前提前 fetch 为 Blob + 创建 ObjectURL，
 * 播放时直接喂给 <video>，消除网络/IO 延迟导致的卡顿。
 *
 * 使用方式：
 *   import { preloadVideo, getVideoUrl } from '../utils/videoPreloader';
 *
 *   // 在转场动画阶段提前预取
 *   preloadVideo('/movie/level%20up/hero.mp4');
 *
 *   // 播放时获取缓存 URL（若未缓存则返回原 URL）
 *   video.src = getVideoUrl(originalUrl);
 */

// 全局 Blob 缓存：原始 URL → ObjectURL
const blobCache = new Map<string, string>();

/**
 * 预加载一部影片：fetch → blob → ObjectURL → 缓存
 * @param src 影片原始 URL
 * @returns 可用于 <video> 的 ObjectURL（失败时返回原 URL）
 */
export const preloadVideo = async (src: string): Promise<string> => {
    if (blobCache.has(src)) return blobCache.get(src)!;

    try {
        const response = await fetch(src);
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        blobCache.set(src, url);
        return url;
    } catch (e) {
        console.warn('[VideoPreloader] Preload failed, fallback to direct src:', src, e);
        return src;
    }
};

/**
 * 获取缓存的 ObjectURL（未缓存时返回原 URL）
 */
export const getVideoUrl = (src: string): string => {
    return blobCache.get(src) || src;
};

/**
 * 根据英雄 key 预加载升级影片
 */
export const preloadLevelUpMovieByKey = async (heroKey: string): Promise<void> => {
    // 动态导入避免循环依赖
    const { getLevelUpMovie } = await import('../data/movieData');
    const src = getLevelUpMovie(heroKey);
    if (src) await preloadVideo(src);
};

/**
 * 根据英雄 keys 预加载胜利影片
 */
export const preloadVictoryMovieByKeys = async (heroKeys: string[]): Promise<void> => {
    const { getVictoryMovie } = await import('../data/movieData');
    const src = getVictoryMovie(heroKeys);
    if (src) await preloadVideo(src);
};
