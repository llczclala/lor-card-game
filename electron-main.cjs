const { app, BrowserWindow, Menu } = require('electron');
const path = require('path');

// 保持对 window 对象的全局引用，避免被 JS 垃圾回收
let mainWindow;

function createWindow() {
  // 1. 创建浏览器窗口
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    minWidth: 1024,
    minHeight: 576,
    icon: path.join(__dirname, 'public/favicon.ico'), // 假设你有图标，没有也没关系
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false, // 允许在渲染进程中使用 Node API (如果需要)
      webSecurity: false,      // 允许加载本地资源
      // [2026-10-05 莉莉子 BUG修复 · 20261005-11] **关闭后台节流**
      //   默认情况下窗口失焦/被遮挡/最小化时，Chromium 会节流定时器与 rAF（媒体也可能被挂起）
      //   ⇒ 表现就是"切出去再回来，影片停在那一帧、看门狗也没在跑"。
      //   本游戏是单窗口桌面应用，不需要"后台省电"，关掉它换"任何时候都不许停"。
      backgroundThrottling: false
    },
    // 默认全屏体验更好
    fullscreen: false,
    resizable: true,
  });

  // 2. 隐藏默认菜单栏 (为了沉浸式体验)
  // [调试修改] 暂时注释掉这行，或者保留它但强制打开 DevTools
  // Menu.setApplicationMenu(null);

  // 3. 加载构建好的 index.html
  // 注意：我们加载的是打包后的 dist 目录下的文件
  mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'));

  // [调试修改] 强制自动打开控制台，一定要加这一行！
//   mainWindow.webContents.openDevTools();

  // 当窗口关闭时
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// 当 Electron 完成初始化时
app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// 当所有窗口关闭时退出
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ============================================================
// [2026-10-10 莉莉子 · 影片卡顿诊断] 打印 **GPU 解码能力实况**（只加日志，不改任何行为）
// ── 为什么需要它：渲染进程里的 `navigator.mediaCapabilities.decodingInfo()` 只是 GPU **声称**支持
//    （我们实测 VP9/AV1/H.264 全返回 powerEfficient=true，可画面照样卡）；
//    而这个 API 读的是 **Chromium 实际启用的特性**（video_decode / vpx_decode / gpu_compositing …）。
// ── 关注字段：
//      `video_decode` = `hardware_accelerated` → 真的在硬解
//      `video_decode` = `unavailable_software` / `disabled_*` → **根本没硬解**（那才是根因）
//      `vpx_decode`   同上，但专指 VP9/VP8（我们全部素材都是 VP9）
// ── 日志出现在**启动 Electron 的那个终端**（主进程 stdout），不是浏览器控制台。
// ============================================================
app.whenReady().then(async () => {
  try {
    await new Promise(r => setTimeout(r, 3000)); // 等 GPU 进程就绪，太早读会拿到空值
    const status = app.getGPUFeatureStatus();
    console.log('[Vdia] GPU 特性状态：', JSON.stringify(status, null, 1));
    console.log(`[Vdia] 结论提示 → video_decode=${status.video_decode} · vpx_decode=${status.vpx_decode}` +
      `（若含 software/disabled ⇒ 根本没硬解，优先改编码参数；若是 hardware_accelerated ⇒ 才轮到并发/架构问题）`);
  } catch (e) {
    console.warn('[Vdia] getGPUFeatureStatus 失败：', e);
  }
});