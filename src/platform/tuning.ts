/**
 * 界面调参区 · 双平台取值 —— 平台薄层的一员（与 `./index.ts` 同级）。
 *
 * 为什么要有它：
 *   手机端（Capacitor 安卓壳）为适配小屏，把一批界面尺寸调大了；
 *   而 PC 端玩家更习惯原本的尺寸。⇒ 同一个界面需要**两套值**。
 *
 * 🚨 铁律（承 `./index.ts`）：`src/components/` 里禁止出现 `if (isNative)`。
 *    组件只调用本函数，**平台判定只发生在这一层**。
 *
 * 用法（写在组件文件顶部的调参区里）：
 *
 *     const XXX_UI_MOBILE = { ...手机端全部值... };          // 程在雷电里调的就是这份
 *     const XXX_UI_PC_DIFF = { ...只列与手机不同的项... };    // 其余继承手机值
 *     export const XXX_UI = pickTuning({ ...XXX_UI_MOBILE, ...XXX_UI_PC_DIFF }, XXX_UI_MOBILE);
 *
 * ⚠️ 两个来源对象**都不要加 `as const`** —— 字面量类型会让合并时类型冲突
 *    （详见 `技术手册/规范-界面调参区.md` §1.3 陷阱④）。
 * ⚠️ `_PC_DIFF` 里只写**真正不同**的项；两端相同的项不要抄一份，否则会漂移。
 *
 * 参考实现：`src/components/TitleScreen.tsx` 的 `TITLE_UI`（样板屏）。
 */
import { isNative } from './index';

/**
 * 按运行平台取一套界面参数。
 *
 * @param pc     PC 端（Electron / 电脑浏览器）用的值
 * @param mobile 手机端（Capacitor 安卓壳）用的值
 * @returns 当前平台该用的那一套
 */
export function pickTuning<T extends object>(pc: T, mobile: T): T {
  return isNative() ? mobile : pc;
}

/**
 * 标量版 —— 给「零散小常量」用。
 *
 * 为什么需要它：`pickTuning` 的 `T extends object` **拒绝 `number`**，
 * 而有些调参区不是对象块，是**一堆独立的标量 const**（先例：`RogueHeroInfoModal.tsx`
 * 里神格神经页的 83 个 `DIV_*`，其中 19 个需要分平台）。
 * ⇒ 那些项写成 `const DIV_ICON_PX = pickScalar(96, 120);` 即可，**用法处零改动**。
 *
 * ⚠️ 返回类型刻意是 `number`（不是字面量联合）—— 避免派生出难以阅读的类型。
 *
 * @param pc     PC 端（Electron / 电脑浏览器）用的值
 * @param mobile 手机端（Capacitor 安卓壳）用的值
 */
export function pickScalar(pc: number, mobile: number): number {
  return isNative() ? mobile : pc;
}

/**
 * 引导层各角色的**最小可读缩放**（手机端地板值，PC 端一律不生效）。
 *
 * 🐛 为什么需要它（2026-10-23 教程引导层手机端适配）：
 *   引导层是 portal 到 body 的，为了和游戏画面等比，内容自己乘了一次 `s`
 *   （`s = min(w/1680, h/1050)`，手机横屏 ≈ 0.374）。但这个 s 是**"游戏世界"的比例**，
 *   套到**界面文字**上必然出事：
 *     · 气泡 `text-sm` 14px → **5.2 CSS px**
 *     · 对话框正文 `text-base` 16px → **6.0 CSS px**
 *     · 任务栏 `w-72` 整块 288px → **108 CSS px 宽**，所有文字 4.5~6px
 *   PC（s≈1.03）完全正常 ⇒ 三个组件全是"PC 测不出来"的退化。
 *
 * ✅ 三者**地板值不同是因为角色不同**（不是随手取的）：
 *   · `MIN_LEGIBLE_UI_SCALE = 0.85` 气泡/箭头 —— 贴着卡牌，放太大就盖住要被指的东西
 *   · `MIN_DIALOGUE_UI_SCALE = 1.0` 对话框 —— 底部主阅读面，按视口 1:1 渲染最舒服（正文 16px）
 *   · `MIN_TASKPANEL_UI_SCALE = 0.9` 任务栏 —— 右侧参考区，比气泡大一点、又不至于占掉半个屏
 *
 * ⚠️ 这三个都是**观感旋钮**：嫌大/嫌小就单独调对应那一个，互不影响。
 *    改小之前先算「设计字号 × 新地板 ≥ 12 CSS px」这条可读下限。
 */
export const MIN_LEGIBLE_UI_SCALE = 0.85;
export const MIN_DIALOGUE_UI_SCALE = 1.0;
export const MIN_TASKPANEL_UI_SCALE = 0.9;

/**
 * 引导层内容该用的缩放：手机端抬到"可读下限"，PC 端**原样返回**。
 *
 * 为什么不做成 `Math.max(scale, MIN)` 直接调：那会让 PC 端也跟着变（PC s≈1.03 虽已够，
 * 但口径上必须保证"只修手机"）。`pickUiScale` 把平台判定关在这一层，组件里零 `isNative`。
 *
 * @param currentScale 当前画布的 s（调用方自己算，与 ScaleWrapper 同源）
 * @param minLegible   可读下限，传 `MIN_LEGIBLE_UI_SCALE`
 */
export function pickUiScale(currentScale: number, minLegible: number): number {
  if (!isNative()) return currentScale;          // PC：一个像素都不动
  return Math.max(currentScale, minLegible);      // 手机：不够大就抬起来
}

/**
 * 画布内浮层的**内层缩放**（手机端专用修正）。
 *
 * 🐛 为什么需要它（2026-10-21 手机实测「卡包卡匣界面一塌糊涂」）：
 *   本 app 的画布已经被 `ScaleWrapper` 整体 `transform: scale(s)` 缩放过一次
 *   （`s = min(w/1680, h/1050)`，手机竖屏约 0.232）。
 *   而好几个全屏弹窗内部又写了 `transform: scale(gameScale * panelScale)`，
 *   其中 `getGameScale()` 用的是**同一个公式** ⇒ 等于又乘了一次 `s`。
 *   ⇒ 最终缩放是 **s²**：`s≈1` 的 PC 上完全看不出来，手机上 `s² ≈ 0.054`
 *     ⇒ 面板被压到原来的约 1/18（实测开匣弹窗只剩 48px 宽，字号 1.5px，等于看不见）。
 *
 * ✅ 手机端正确算法：**只乘"为了让面板占满屏宽"所需的那一个倍数**，不再乘 `gameScale`：
 *    `k = (viewportRatio × innerWidth) / (panelWidthPx × s)`
 *    （面板视觉宽 = panelWidth × k × s = viewportRatio × 屏宽 ✔）
 *
 * ⚠️ PC 端**原样返回 `legacyDesktopScale`** —— 本次只修手机，PC 观感一个像素都不动
 *   （PC 上 s≈1，原写法本来就没问题）。
 *
 * @param panelWidthPx        面板的**画布 px 宽**（开卡包 1180 / 开匣 900 / 汇总窗 1120）
 * @param viewportRatio       目标占屏宽比例（0~1；建议 0.92）
 * @param mobileGameScale     手机端当前的 gameScale（= ScaleWrapper 的 s）
 * @param legacyDesktopScale  PC 端要原样使用的内层缩放表达式结果
 */
export function pickCanvasInnerScale(
  panelWidthPx: number,
  viewportRatio: number,
  mobileGameScale: number,
  legacyDesktopScale: number,
): number {
  if (!isNative()) return legacyDesktopScale;
  const w = typeof window !== 'undefined' ? window.innerWidth : 0;
  if (w <= 0 || mobileGameScale <= 0 || panelWidthPx <= 0) return legacyDesktopScale;
  return (w * viewportRatio) / (panelWidthPx * mobileGameScale);
}

/**
 * 画布内弹窗的**「放得下」缩放**（宽、高都要管）—— `pickCanvasInnerScale` 的补丁版。
 *
 * 🐛 为什么要有它（2026-10-24 程实测「开包汇总窗直接占据整个画面」）：
 *   `pickCanvasInnerScale` **只按宽度反解**。汇总窗手机端 `panelWidth=720`、`panelMaxHeight=880`，
 *   于是 `k = (851×0.94)/(720×0.374) = **2.97**`（把面板撑到占屏 94% 宽），
 *   但同一个 k 也把**高度**放大到 `880×2.97×0.374 = **978 CSS px**`，
 *   而手机横屏只有 **393** ⇒ 竖着溢出 2.5 倍，看起来就是"铺满整个画面"。
 *   ⇒ 宽高是**同一个 k 带出来的**，"只约束宽"必然导致另一边失控。
 *
 * ✅ 正确做法 = `min(按宽算的 k, 按高算的 k)`（与 CSS `contain` 同义）：
 *   `kW = (ratioW × innerWidth)  / (panelWidthPx  × s)`
 *   `kH = (ratioH × innerHeight) / (panelHeightPx × s)`
 *   取小者 ⇒ 面板视觉宽 ≤ ratioW×屏宽 **且** 视觉高 ≤ ratioH×屏高。
 *
 * 📌 配套提醒（很反直觉但很重要）：`k` 变小会**同时**把字号压小。
 *   所以"想字大一点"**不能**只调 ratioH，而要**调小面板的设计高度**（`panelHeightPx`）——
 *   设计高越小，`kH` 越大，字号越大、面板越宽，而视觉高度不变。这两者是耦合的。
 *
 * ⚠️ PC 端**原样返回 `legacyDesktopScale`**（只修手机）。
 *
 * @param panelWidthPx       面板的**画布 px 宽**
 * @param panelHeightPx      面板的**画布 px 高**（取 `maxHeight` 那个上界即可，内容更短只会更宽松）
 * @param viewportRatioW     目标占屏宽比例
 * @param viewportRatioH     目标占屏高比例
 * @param mobileGameScale    手机端当前的 gameScale（= ScaleWrapper 的 s）
 * @param legacyDesktopScale PC 端要原样使用的内层缩放
 */
export function pickCanvasContainScale(
  panelWidthPx: number,
  panelHeightPx: number,
  viewportRatioW: number,
  viewportRatioH: number,
  mobileGameScale: number,
  legacyDesktopScale: number,
): number {
  if (!isNative()) return legacyDesktopScale;
  if (typeof window === 'undefined') return legacyDesktopScale;
  const w = window.innerWidth;
  const h = window.innerHeight;
  if (w <= 0 || h <= 0 || mobileGameScale <= 0) return legacyDesktopScale;
  if (panelWidthPx <= 0 || panelHeightPx <= 0) return legacyDesktopScale;
  const kW = (w * viewportRatioW) / (panelWidthPx * mobileGameScale);
  const kH = (h * viewportRatioH) / (panelHeightPx * mobileGameScale);
  return Math.min(kW, kH);
}

/**
 * **portal 到 `document.body`** 的弹窗的**「放得下」缩放**（宽、高都要管）。
 *
 * 🐛 为什么需要它（2026-10-24 程实测「开匣的界面也很大」）：
 *   `ChestOpenModal` / `PackOpenModal` **是 `createPortal(…, document.body)` 的**，
 *   渲染位置在 `ScaleWrapper` **之外** ⇒ 祖先那层 `scale(s)` 根本不生效。
 *   但它们当时用的是**画布内**的 `pickCanvasInnerScale` —— 那个公式会 **÷ s**，
 *   而这里压根没有 s 可除 ⇒ 结果被**额外放大 1/s 倍**（手机 ≈ **2.67 倍**）：
 *   900 宽的面板算出来 `k = 2.38` ⇒ 视觉宽 **2139 CSS px**（屏宽只有 851）。
 *
 * ✅ portal 版公式（**没有 `/ s`**）：
 *   `kW = (ratioW × innerWidth)  / panelWidthPx`
 *   `kH = (ratioH × innerHeight) / panelHeightPx`
 *   取小者 ⇒ 视觉宽 ≤ ratioW×屏宽 **且** 视觉高 ≤ ratioH×屏高。
 *
 * ⚠️ 判据只有一条：**看它的 DOM 祖先链里有没有 `#game-scale-container`**
 *   （不在 ⇒ 用本函数；在 ⇒ 用 `pickCanvasContainScale`）。两者方向相反，用错就是 1/s 或 s 的倍数偏差。
 * ⚠️ PC 端原样返回 `legacyDesktopScale`。
 */
export function pickPortalContainScale(
  panelWidthPx: number,
  panelHeightPx: number,
  viewportRatioW: number,
  viewportRatioH: number,
  legacyDesktopScale: number,
): number {
  if (!isNative()) return legacyDesktopScale;
  if (typeof window === 'undefined') return legacyDesktopScale;
  const w = window.innerWidth;
  const h = window.innerHeight;
  if (w <= 0 || h <= 0) return legacyDesktopScale;
  if (panelWidthPx <= 0 || panelHeightPx <= 0) return legacyDesktopScale;
  const kW = (w * viewportRatioW) / panelWidthPx;
  const kH = (h * viewportRatioH) / panelHeightPx;
  return Math.min(kW, kH);
}

/**
 * **portal 到 `document.body`** 的浮层用的内层缩放（手机端修正）。
 *
 * 与 `pickCanvasInnerScale` 的区别：portal 出去后**逃出了 `ScaleWrapper`**，
 * 祖先那层 `scale(s)` 不再生效 ⇒ 不能除 `s`，否则会又缩一次。
 *   `k = (viewportRatio × innerWidth) / panelWidthPx`
 *
 * ⚠️ PC 端同样原样返回 `legacyDesktopScale`。
 */
export function pickPortalScale(
  panelWidthPx: number,
  viewportRatio: number,
  legacyDesktopScale: number,
): number {
  if (!isNative()) return legacyDesktopScale;
  const w = typeof window !== 'undefined' ? window.innerWidth : 0;
  if (w <= 0 || panelWidthPx <= 0) return legacyDesktopScale;
  return (w * viewportRatio) / panelWidthPx;
}
