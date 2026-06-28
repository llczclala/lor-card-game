import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { ViteImageOptimizer } from 'vite-plugin-image-optimizer';

// [小伙伴调试版] — 关闭混淆、反调试、控制台封锁
// 用于给合作伙伴提供可调试的测试版本
export default defineConfig(({ command }) => {
  const isBuild = command === 'build';

  return {
    base: './',
    plugins: [
      react(),
      isBuild && ViteImageOptimizer({
        test: /\.(jpe?g|png|gif|tiff|webp|svg|avif)$/i,
        includePublic: true,
        logStats: true,
        png: { quality: 80, compressionLevel: 9 },
        jpeg: { quality: 75 },
        jpg: { quality: 75 },
        webp: { lossless: true },
      }),
    ].filter(Boolean),
    build: {
      chunkSizeWarningLimit: 1500,
    }
  };
});
