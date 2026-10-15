/**
 * 前后台「听得见的音频」闸门 —— **只管 DOM 里的媒体元素**。
 *
 * [2026-10-15 莉莉子 · 粉丝实测] 切后台必须停掉所有能听见的声音。
 *
 * 分工（为什么只做 DOM 这一半）：
 *   · BGM / 语音 / 音效走的是 `new Audio()`，**从不进入 DOM** ⇒ `querySelectorAll` 找不到，
 *     由各自的 hook 订阅 `subscribeAppVisibility` 自行暂停。
 *   · 影片是 `VideoPlayer` 里的 `<video>`（**有声**）—— 归这里管。
 *     ⇒ 这样**不用去改 `VideoPlayer.tsx`**（那是 `现状-影片卡死排查.md` 里 14 项手段堆出来的
 *       雷区），把风险摁在最小。
 *
 * ⚠️ 过滤用的是 **`el.muted` 属性（property）**，不是 CSS 属性选择器：
 *   循环视频（`LoopVideo`）是用 JS 设 `el.muted = true` 的，**不会**加 `[muted]` 特性；
 *   而它们本来就没声音，**不该**被我们暂停（交给 `videoBudget` 的可见性门控去管）。
 *
 * ⚠️ 恢复侧的边界：只恢复**我们自己暂停过**的那些（`pausedEls`），
 *   并且 `el.isConnected === false`（元素已被卸载）就跳过。
 */
const pausedEls = new Set<HTMLMediaElement>();

/** 切后台：暂停所有"有声且正在播"的 DOM 媒体 */
export function pauseAudibleDomMedia(): void {
    if (typeof document === 'undefined') return;
    document.querySelectorAll<HTMLMediaElement>('video,audio').forEach(el => {
        if (el.muted) return;   // 静音元素（循环视频）不归我们管
        if (el.paused) return;  // 本来就没在播，别记账（否则回前台会被无故拉起）
        try {
            el.pause();
            pausedEls.add(el);
        } catch { /* 个别元素 pause 抛错：忽略，不影响其它 */ }
    });
}

/** 回前台：恢复**我们自己暂停过**的 DOM 媒体 */
export function resumeAudibleDomMedia(): void {
    pausedEls.forEach(el => {
        if (!el.isConnected) return; // 期间已被卸载（切场景/关弹窗）⇒ 不复活
        const p = el.play();
        if (p !== undefined) p.catch(() => { /* 自动播放策略拦截：等用户交互 */ });
    });
    pausedEls.clear();
}
