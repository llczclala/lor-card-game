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
 *
 * ============================================================
 * [2026-10-02 莉莉子 性能优化] 加 LRU 上限 + 显式释放
 * ------------------------------------------------------------
 * 病根：原实现的 `blobCache` 是**只进不出的 Map** ——
 *   · 每预加载一部影片就永久驻留一个 Blob（1k 约 2MB / 4k 可达 15MB）
 *   · **从不调用 `URL.revokeObjectURL`**
 * ⇒ 一局玩下来（多次升级 + 胜利转场）内存只涨不落，越玩越卡。
 *
 * 本版做法：
 *   ① 缓存上限 MAX_CACHE，超出按 FIFO 淘汰**最老的**并 revoke
 *      （正在播放的必然是最新 fetch 的那条 ⇒ 不会被淘汰）
 *   ② 对外提供 `clearVideoCache()`，场景切换时主动清空
 *   ③ 淘汰与清空都会 revoke，避免 Blob 悬空
 * ============================================================
 */
import type { VideoResolution } from '../data/movieData';

/** 最多缓存的影片数。影片体积大（2~15MB），缓存 3 部足够覆盖"升级→胜利"的连续转场 */
const MAX_CACHE = 3;

// 全局 Blob 缓存：原始 URL → ObjectURL（Map 保持插入序 ⇒ 天然 FIFO）
const blobCache = new Map<string, string>();

/** 淘汰最老的若干条直到回到上限内；被淘汰的 URL 必须 revoke */
const evictIfNeeded = (): void => {
    while (blobCache.size > MAX_CACHE) {
        const oldestKey = blobCache.keys().next().value as string | undefined;
        if (oldestKey === undefined) break;
        const url = blobCache.get(oldestKey);
        blobCache.delete(oldestKey);
        if (url && url.startsWith('blob:')) {
            // ============================================================
            // [2026-10-09 莉莉子 · 影片取证] **淘汰即留痕** —— 这是"影片播到一半定格"的头号嫌疑：
            //   若这条 revoke 抹掉的正是**当前正在播**的那条 blob，元素会立刻失去数据源，
            //   表现就是实测日志里的三连：`readyState=HAVE_CURRENT_DATA` + `networkState=NETWORK_IDLE`
            //   + `currentTime` 不再前进（丢帧数还在涨）。
            // ⚠️ 上方第 26 行那句"正在播放的必然是最新 fetch 的那条 ⇒ 不会被淘汰"是**错误假设**：
            //   实际序列常见「预加载 A → 播 A → 预加载 B → 预加载胜利 C」⇒ A 在**播放中**被淘汰。
            // ============================================================
            console.warn(`[Vdiag] 💀 blob 淘汰并 revoke：${url.slice(0, 42)}…（key=${decodeURIComponent(oldestKey).split('/').slice(-2).join('/')}，剩余 ${blobCache.size} 条）`);
            try { URL.revokeObjectURL(url); } catch { /* noop */ }
        }
    }
};

/** 清空整个缓存并释放所有 ObjectURL（场景切换 / 离开对局时调用） */
export const clearVideoCache = (): void => {
    blobCache.forEach(url => {
        if (url.startsWith('blob:')) {
            try { URL.revokeObjectURL(url); } catch { /* noop */ }
        }
    });
    blobCache.clear();
};

/**
 * 预加载一部影片：fetch → blob → ObjectURL → 缓存
 * @param src 影片原始 URL
 * @returns 可用于 <video> 的 ObjectURL（失败时返回原 URL）
 */
export const preloadVideo = async (src: string): Promise<string> => {
    const cached = blobCache.get(src);
    if (cached) {
        // 命中即刷新 LRU 位置（删了再插 → 移到队尾），避免热数据被淘汰
        blobCache.delete(src);
        blobCache.set(src, cached);
        return cached;
    }

    try {
        const response = await fetch(src);
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        blobCache.set(src, url);
        // [2026-10-09 莉莉子 · 影片取证] 新缓存也留痕：把"预加载序列"和"淘汰"对上时间轴
        console.log(`[Vdiag] 📦 新缓存 blob（${blobCache.size}/${MAX_CACHE}）：${decodeURIComponent(src).split('/').slice(-2).join('/')}`);
        evictIfNeeded();
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
export const preloadLevelUpMovieByKey = async (heroKey: string, res: VideoResolution = '1k'): Promise<void> => {
    // 动态导入避免循环依赖
    const { getLevelUpMovie } = await import('../data/movieData');
    const src = getLevelUpMovie(heroKey, res); // [核心修改] 传入画质参数
    if (src) await preloadVideo(src);
};

/**
 * 根据英雄 keys 预加载胜利影片
 */
export const preloadVictoryMovieByKeys = async (heroKeys: string[], res: VideoResolution = '1k'): Promise<void> => {
    // 动态导入避免循环依赖
    const { getVictoryMovie } = await import('../data/movieData');
    const src = getVictoryMovie(heroKeys, res); // [核心修改] 传入画质参数
    if (src) await preloadVideo(src);
};
