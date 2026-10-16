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

    // ══════════════════════════════════════════════════════════════════
    // [2026-10-16 莉莉子] 忽略「原子写工具的临时文件」—— 修「改了代码、雷电里没反应」
    //
    // 现象（程实测，日志为证）：改 `HUB_UI` 存盘后，dev server 窗口先打了
    //   `[vite] hmr update /src/components/DeckBuilder.tsx`（说明**通路本来是好的**），
    //   紧接着抛 `EBUSY: resource busy or locked, watch '...\.DeckBuilder.tsx.<pid>.<guid>.tmpdir\DeckBuilder.tsx.tmp'`，
    //   **然后整个 vite 进程就退出了**（日志末尾回到了 shell 提示符 `F:\datamodel\lor-card-game>`）。
    //   ⇒ 服务器没了，之后改任何文件都不会再有人理 —— 看起来像"热更新坏了"，
    //     其实是 **dev server 崩了**（今早那次「打开游戏黑屏卡死」多半也是它，⚠️ 推测）。
    //
    // 真因：某些编辑器 / 写入工具**原子写盘**时，会在**同目录**先落一个
    //   `.DeckBuilder.tsx.<pid>.<guid>.tmpdir\DeckBuilder.tsx.tmp`，写完再改名。
    //   那个临时目录就落在**被监视的 `src/` 里** ⇒ chokidar 去 watch 它 ⇒
    //   文件已被改名/占用 ⇒ `fs.watch` 抛 **EBUSY** ⇒ 而这个错误**没有被捕获** ⇒ vite 进程崩溃。
    //
    // ✅ 这里是**追加**忽略项，不会覆盖 Vite 自己的默认（已核源码 `resolveChokidarOptions`：
    //    `ignored = ["**/.git/**", "**/node_modules/**", "**/test-results/**", cacheDir, ...arraify(用户配置)]`
    //    —— 用户配的是**展开追加**，不是覆盖）。
    // ⚠️ 改 `vite.config.ts` 本身**需要重启 dev server** 才生效
    //    （关掉那个 `npm run dev` 窗口，重跑 `启动安卓调试.exe`）。
    // ══════════════════════════════════════════════════════════════════
    server: {
      watch: {
        ignored: [
          '**/*.tmpdir/**', // 原子写的临时目录（把 vite 搞崩的就是它）
          '**/*.tmpdir',
          '**/*.tmp',       // 临时文件本体
        ],
      },
    },

    build: {
      chunkSizeWarningLimit: 1500,
    }
  };
});