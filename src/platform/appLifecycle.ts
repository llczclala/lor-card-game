/**
 * 应用前后台（可见性）订阅 —— **平台差异的唯一落点**。
 *
 * 🚨 铁律（同 `src/platform/index.ts`）：`src/components/` 里禁止出现平台判断。
 *    "原生用 Capacitor、Web 用 Page Visibility" 这个差异**只能待在这里**。
 *
 * 背景：粉丝实测「游戏切到别的应用后，后台还在放音乐」。
 *   ── 根因：全项目**没有任何**前后台处理（`useAudio` 的 BGM 只在 ESC 暂停时被叫停）。
 *   ── 为什么必须从 Web 侧停：Android 的 `WebView.onPause()` **不会**停 HTML5 媒体
 *      （媒体走独立媒体栈）⇒ 光改安卓壳没用。
 *
 * 两条事件源都订阅、并在内部去重（消费者只会收到**真实变化**）：
 *   ① 原生壳（安卓）→ Capacitor `appStateChange`（最权威）
 *   ② Web / Electron → Page Visibility API
 *      ⚠️ Electron 里"窗口被别的窗口盖住"**不会**置 `hidden` ⇒ **不会因为失焦就停音乐**，
 *         只有最小化/被完全隐藏才会。这正是我们要的粒度。
 */
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';

/** `isActive === true` = 回到前台；`false` = 切到后台 */
export type AppVisibilityHandler = (isActive: boolean) => void;

/**
 * 订阅应用前后台变化。返回取消订阅函数。
 *
 * 保证：只在**状态真的翻转**时回调（两条源重复触发会被吞掉），
 * 因此消费者可以放心写"暂停 / 恢复"而不用自己做幂等。
 */
export function subscribeAppVisibility(handler: AppVisibilityHandler): () => void {
    // 初值取"当前是否可见" —— 否则订阅瞬间会推一次假的"回到前台"
    let last = typeof document !== 'undefined' ? !document.hidden : true;
    const emit = (isActive: boolean) => {
        if (isActive === last) return; // 两条源可能先后触发同一变化 ⇒ 去重
        last = isActive;
        handler(isActive);
    };

    const disposers: Array<() => void> = [];

    // ① 原生壳（安卓）：Capacitor 官方事件
    if (Capacitor.isNativePlatform()) {
        const handle = App.addListener('appStateChange', ({ isActive }) => emit(isActive));
        disposers.push(() => {
            void Promise.resolve(handle)
                .then(h => h.remove())
                .catch(() => { /* 壳不支持时静默降级：Page Visibility 那条仍在 */ });
        });
    }

    // ② Web / Electron：Page Visibility
    if (typeof document !== 'undefined') {
        const onVisibility = () => emit(!document.hidden);
        document.addEventListener('visibilitychange', onVisibility);
        disposers.push(() => document.removeEventListener('visibilitychange', onVisibility));
    }

    return () => disposers.forEach(d => d());
}
