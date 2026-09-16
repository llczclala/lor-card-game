import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import obfuscator from 'rollup-plugin-obfuscator';
// [新增] 引入基于 Sharp 的图片压缩插件，完美支持 Windows
import { ViteImageOptimizer } from 'vite-plugin-image-optimizer';
// [2026-08-09] 读取 package.json 版本号，注入为编译期常量（公告系统用）
import pkg from './package.json';

// https://vitejs.dev/config/
export default defineConfig(({ command }) => {
  // 判断是否为构建生产环境
  const isBuild = command === 'build';

  return {
    base: './', // 保持相对路径
    define: {
      // [2026-08-09] 注入当前版本号（与 package.json 始终一致，公告系统使用）
      'import.meta.env.PACKAGE_VERSION': JSON.stringify(pkg.version),
    },
    plugins: [
      react(),

      // [新增] 自动化图片压缩配置
      // 仅在 build 时生效，开发时不压缩以保证速度
      // 基于 Sharp 引擎，安装快，不报错
      isBuild && ViteImageOptimizer({
        test: /\.(jpe?g|png|gif|tiff|webp|svg|avif)$/i,
        exclude: /CQWRSZDSA432/, // [fix] 排除校验图片（插件只判断文件名不含目录路径！）
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
      // ══════════════════════════════════════════════════════════════════
      // [2026-09-13 莉莉子] 构建稳定性修复 — 治"打包产物随机翻车导致黑屏"
      //
      // 现象：v1.0.15 早上的补丁包装上后黑屏（SplashScreen 校验失败 → 纯黑无提示），
      //       而完整安装包正常、网页端正常；同源码两次 build，一份能跑一份不能。
      //
      // 根因：obfuscator 5.1.0 的 controlFlowFlattening / deadCodeInjection 有已知 bug，
      //       会偶发把正常代码改坏。改坏后**语法仍然合法** → 打包不报错、tsc 不报错、
      //       文件能加载，只在运行时崩 —— 所以极难定位。同源码两次 build 结果不同，
      //       正是它的随机触发特征（官方语义 bug 修复版本：
      //       v5.2.0 issue #1372 短路求值 / v5.4.3 #1298 可选链 / v5.4.5 #1423 展开参数）。
      //
      // 处理：① 停用上述两个选项 —— issue #1298 中社区确认的绕过办法
      //       ② 加 seed —— 构建可复现（同源码 + 同配置 + 同 seed = 产物字节一致）。
      //          今后再遇到玄学问题，可直接对比两次产物定位，不必再靠推测。
      //
      // 保留：标识符混淆 / 字符串数组 / RC4 编码 / 字符串轮转 —— 防破解核心能力不变。
      // ══════════════════════════════════════════════════════════════════
      isBuild && obfuscator({
        global: true,
        options: {
          seed: 'snowbreak-rivals', // [2026-09-13] 固定随机种子：让每次构建产物完全一致
          compact: true,
          // controlFlowFlattening / deadCodeInjection ——【已停用】见上方说明，勿再开启
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
        },
      }),
    ].filter(Boolean),
    build: {
      chunkSizeWarningLimit: 1500,
    }
  };
});