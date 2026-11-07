import type { CapacitorConfig } from '@capacitor/cli';

// ══════════════════════════════════════════════════════════════════════
// [2026-10-16 莉莉子] **开发用「热更新壳」开关（绝不进发布包）**
// ── 背景：每改一处都要「打包 20~80 秒 → 传手机 → 装上」才能看效果，太慢。
// ── 做法：设了 `CAP_DEV_SERVER` 时，壳不加载打包进去的 `dist-android`，
//    而是去这个地址**现取**页面 ⇒ 之后改代码由 Vite 热更新秒级生效
//    （且**页面不刷新**，调颜色/调参时游戏状态都还在）。
// ── ⚠️ 不设该环境变量时，下面的 `server` 字段**完全不存在**
//    ⇒ 产出与改动前**逐字节相同**，正式发版路径零影响。
// ── 用法：`tools\dev-android.ps1` 会自动设置它；
//    想回到正常离线包，直接跑 `tools\build-android.ps1 -Debug`（不带变量 → 会重新 sync 覆盖回去）。
// ══════════════════════════════════════════════════════════════════════
const devServerUrl = process.env.CAP_DEV_SERVER;

const config: CapacitorConfig = {
  appId: 'com.snowbreak.rivals.official',
  appName: '尘白同人·雪境争锋',
  webDir: 'dist-android',
  android: {
    backgroundColor: '#000000',
    // [2026-11-07 超元链接] 允许 HTTPS 页面发起非加密的 WebSocket。
    //
    // 安卓壳用 `https://localhost` 加载页面，而 Chrome 内核的混合内容策略禁止
    // HTTPS 页面连 `ws://`（非加密）⇒ 手机端会直接报：
    //   "An insecure WebSocket connection may not be initiated from a page loaded over HTTPS"
    // 自建的信令节点没有 TLS 证书，联机走的就是 ws://，所以必须放开这一条。
    //
    // ⚠️ 将来若给信令服务器配上真证书改走 wss://，这一条可以关掉（更安全）。
    // PC 端不受影响：那边是 file:// 加载 + webSecurity:false。
    allowMixedContent: true,
  },
  server: {
    // WebSocket 与 http 同属「明文流量」，Android 9+ 默认拦截 ⇒ 需要显式放开。
    cleartext: true,
    // 开发用热更新壳：只在设了 CAP_DEV_SERVER 时才有 url
    ...(devServerUrl ? { url: devServerUrl } : {}),
  },
};

export default config;
