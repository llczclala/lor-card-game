/**
 * 平台薄层 —— 单源架构里「唯一允许出现平台差异」的地方。
 *
 * 🚨 铁律：src/components/ 里禁止出现 if (isAndroid) / if (isNative)。
 *    平台差异只能待在 src/platform/，或构建配置（vite.config.ts / vite.android.config.ts）里。
 *    这条可以 lint 拦截 —— 靠自觉必分叉，靠 lint 才不分叉。
 *
 * 背景与完整方案见：agents/game/评估-安卓移植报告.md §4
 */
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';

/** 是否运行在原生壳（安卓）里。PC 版（Electron）与浏览器一律返回 false。 */
export const isNative = (): boolean => Capacitor.isNativePlatform();

/**
 * 初始化平台差异。PC 版是空操作，安卓壳才生效。
 * 在 React 挂载之前调用一次即可。
 */
export function initPlatform(): void {
  if (!isNative()) return;

  // ── ① 返回键 → Escape ──────────────────────────────────────────────
  // 游戏里有 22 个弹窗组件在 window 上监听 Escape（capture 阶段）。
  // 而 Capacitor 内核不接管返回键（BridgeActivity 没有 onBackPressed 覆写），
  // 不注册这个监听的话，玩家按返回键会**直接把游戏退掉**。
  App.addListener('backButton', () => {
    window.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }),
    );
  });

  // ── ② window.close() 在 WebView 里是空操作 ─────────────────────────
  // 游戏内「退出游戏」按钮调用的就是 window.close()（App.tsx / SettingsModal.tsx）。
  // 直接在这里把它换掉，避免去改那两个重度耦合文件（code.md 红线 ③）。
  window.close = () => {
    App.exitApp();
  };
}
