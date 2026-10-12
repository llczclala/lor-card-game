import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import pkg from './package.json';

// ══════════════════════════════════════════════════════════════════════
// [安卓构建配置] —— 与 PC 版共用同一份 src/，只是换一个打包出口。
//
// 与 vite.config.ts 的三处**刻意差异**：
//
//   ① **不启用混淆**
//      安卓要真机调试，而 debugProtection 会检测调试器、disableConsoleOutput
//      会吞掉 console —— 在 WebView 里既妨碍排查，又有误触发风险。
//      （PC 版的混淆逻辑与「打包产物随机翻车」的修复记录见 vite.config.ts。）
//
//   ② **输出到 dist-android，不覆盖 PC 的 dist**
//      两种打包输出彼此独立：npm run build → dist（PC）
//                              npm run build:android → dist-android（安卓）
//
//   ③ **跳过 ViteImageOptimizer**
//      src/image 下的素材**已经是转码后的 WebP q80**（见 调研-PC端资源优化.md），
//      再跑一遍纯属浪费构建时间，且 lossless 配置对已有损图是方向性浪费。
//
// 注：本项目自签名分发（B站 + 网盘 + 粉丝群），不走应用商店，
//     因此无需按 AAB base 200MB 上限做资源档位裁剪。
// ══════════════════════════════════════════════════════════════════════
export default defineConfig(() => ({
  base: './',
  define: {
    // 与 PC 版一致：注入版本号（公告系统依赖）
    'import.meta.env.PACKAGE_VERSION': JSON.stringify(pkg.version),
  },
  plugins: [react()],
  build: {
    outDir: 'dist-android',
    emptyOutDir: true,
    chunkSizeWarningLimit: 1500,
  },
}));
