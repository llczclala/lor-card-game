import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import obfuscator from 'rollup-plugin-obfuscator';
// [新增] 引入基于 Sharp 的图片压缩插件，完美支持 Windows
import { ViteImageOptimizer } from 'vite-plugin-image-optimizer';

// https://vitejs.dev/config/
export default defineConfig(({ command }) => {
  // 判断是否为构建生产环境
  const isBuild = command === 'build';

  return {
    base: './lor-card-game/', // 保持相对路径
    plugins: [
      react(),

      // [新增] 自动化图片压缩配置
      // 仅在 build 时生效，开发时不压缩以保证速度
      // 基于 Sharp 引擎，安装快，不报错
      isBuild && ViteImageOptimizer({
        test: /\.(jpe?g|png|gif|tiff|webp|svg|avif)$/i,
        exclude: undefined,
        include: undefined,
        includePublic: true,
        logStats: true, // 构建完成后在终端显示压缩了多少体积
        ansiColors: true,
        png: {
          // PNG 压缩质量 (0-100)
          quality: 80,
          compressionLevel: 9, // 压缩等级 (0-9)，9最慢但体积最小
        },
        jpeg: {
          // JPG 压缩质量
          quality: 75,
        },
        jpg: {
          quality: 75,
        },
        webp: {
          lossless: true,
        },
        gif: {
          // GIF 优化配置
        },
        svg: {
          // SVG 优化配置
          multipass: true,
          plugins: [
            {
              name: 'preset-default',
              params: {
                overrides: {
                  cleanupNumericValues: false,
                  removeViewBox: false, // 保持 ViewBox 防止 SVG 变形
                },
              },
            },
          ],
        },
      }),

      // [保留] 代码混淆插件
      isBuild && obfuscator({
        global: true,
        options: {
          compact: true,
          controlFlowFlattening: true,
          controlFlowFlatteningThreshold: 0.75,
          identifierNamesGenerator: 'hexadecimal',
          renameGlobals: false,
          stringArray: true,
          stringArrayEncoding: ['rc4'],
          stringArrayThreshold: 0.75,
          rotateStringArray: true,
          debugProtection: true,
          debugProtectionInterval: 2000,
          disableConsoleOutput: true,
          selfDefending: true,
          deadCodeInjection: true,
          deadCodeInjectionThreshold: 0.4,
        },
      }),
    ].filter(Boolean),
    build: {
      chunkSizeWarningLimit: 1500,
    }
  };
});