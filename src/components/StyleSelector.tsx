import React, {useState, useMemo} from 'react';
import { motion, AnimatePresence } from 'framer-motion'; // [2026-09-26 莉莉子] 全览网格进出场动画
import { X, Check, Lock, Search, Filter, ChevronDown, ChevronRight, RotateCcw, LayoutGrid } from 'lucide-react';
import { PERSONALIZATION_ASSETS } from '../data/imageData';
import { DeskMedia } from './DeskMedia'; // [2026-08-13] 动态牌桌媒体组件
import { getCardBackVideo } from '../data/cardBackVideos'; // [2026-08-23] 动态卡背视频
import { CardBackVideo } from './Card'; // [2026-08-23] 卡背动态视频组件
import { COSMETIC_REGISTRY, type CosmeticSource } from '../data/skinData'; // [2026-09-26 莉莉子] 名称/来源/价格元数据（此前界面完全没用上 registry）
import { getCosmeticTone } from '../data/cosmeticTones'; // [2026-09-26 莉莉子] 色调分类（脚本按主色+亮度自动生成）
import { eventBus, GameEvents } from '../utils/eventBus';

// ==========================================
// [2026-09-26 莉莉子] 筛选 + 排序
//   形态：工具条抄武装库；全览网格 + 侧边抽屉按钮抄大厅「背景选择」（GameLobby 的 isGridOpen 面板）
//   维度差异：卡背有 registry 的「来源」可用；牌桌来源几乎全是 BOTH ⇒ 改用「色调」维度（自动分类，零人工）
// ==========================================
type StyleSortMode = 'order' | 'name' | 'price' | 'newest';
const STYLE_SORT_LABELS: Record<StyleSortMode, string> = {
    order: '默认顺序',
    name: '名称',
    price: '价格',
    newest: '新 → 旧',
};
const TEMP_LABELS: Record<string, string> = { cool: '冷色调', warm: '暖色调', neutral: '中性' };
const LIGHT_LABELS: Record<string, string> = { bright: '明亮', dark: '深色' };
const TEMP_COLORS: Record<string, string> = { cool: '#38bdf8', warm: '#fb923c', neutral: '#94a3b8' };
const LIGHT_COLORS: Record<string, string> = { bright: '#fde047', dark: '#64748b' };
const SOURCE_LABELS: Record<string, string> = { SHOP: '商店', GACHA: '卡包', BOTH: '通用', MISSION: '任务', HIDDEN: '隐藏' };
const SOURCE_COLORS: Record<string, string> = { SHOP: '#fbbf24', GACHA: '#a855f7', BOTH: '#38bdf8', MISSION: '#34d399', HIDDEN: '#6b7280' };

// ══════════════════════════════════════════════════════════════════════
// 🎛️ 卡背 / 牌桌选择 · 视觉调参区（**程微调就改这里**）
// ──────────────────────────────────────────────────────────────────────
// 这一屏 = 人物个性化里的「**卡背选择**」/「**牌桌选择**」（顶部那行超大字就是标题）。
// ⚠️ **一个组件同时管这两屏** —— 只有 `type` 不同（`'cardBack'` / `'desk'`），
//    布局完全共用 ⇒ **改这里，两屏一起变**（有意如此：它们本来就该长一样）。
// 管：①右上关闭按钮 ②整体外框 ③左侧列表栏 ④工具条（搜索/筛选/排序/清空）
//     ⑤计数 + 筛选面板 ⑥左侧列表卡片 ⑦侧边抽屉把手 ⑧右侧大图预览
//     ⑨底部操作栏 ⑩全览网格（点把手展开的抽屉）⑪左侧列表空态
// 改完存盘即生效（HMR —— 雷电/电脑上 1~3 秒看到，不用出包）。
// 命名与用法**对齐 `TITLE_UI` / `DECK_UI`**：值是**绝对 px**、直接进 style；
//   注释标注**原 Tailwind 类**（那是"改动前长什么样"的唯一凭据）。
// ⚠️ 除 `previewWidth`（`'80%'`，相对**父容器**、在画布内 ⇒ 两端一致）外，**全是画布 px**。
//    🔴 本屏**绝对不要用 `vh` / `vw` / `vmin`** —— 那是**视口单位**，会绕过画布缩放，
//    让同一个元素在电脑和手机上**比例不同**（本屏就踩过：卡背预览原来的 `70vh`，详见
//    `previewHeight` 的注释；`GalleryCodex.tsx:259` 也记着同一个坑的修法）。
//    想要"跟着屏幕变"请用**画布 px** 或**父容器的 `%`**，别用视口单位。
// ⚠️ **搬 `max-w-*` 类时要特别小心**：`index.css:56` 有一条
//    `#game-scale-container [class*="max-w-"] { max-width: none !important }`，
//    它会把**所有类名里含 `max-w-` 的**元素上限打死（本意只是干掉 `max-w-screen`/`max-w-[100vw]`）。
//    ⇒ 原代码里那些 `max-w-[1600px]` / `max-w-7xl` **本来就没生效**；
//      一旦搬成**内联** `maxWidth`，`!important` 就管不到了 ⇒ **上限突然真生效 = 画面变窄**。
//    ⇒ 搬这类值时，**默认要填 `'none'` 把原样锁住**，想真启用再改成数字。
//      （这是"逐项对账"查不出的盲区：值都对，但 CSS 覆盖关系变了。）
// ⚠️ 这一屏尺寸项特别多。想"**整体**放大/缩小"别逐个改 —— 跟莉莉子说一声，
//    照 `DECK_UI.deckScale` 的做法加一个整体旋钮（一次 `transform: scale`）更省事。
// ══════════════════════════════════════════════════════════════════════
export const STYLE_UI = {
    // ══ ① 右上角关闭按钮（fixed 定位，独立于布局）═════════════════════
    closeTop: 32,           // 距顶 px（原 top-8 = 32）
    closeRight: 32,         // 距右 px（原 right-8 = 32）
    closePad: 12,           // 内边距 px（原 p-3 = 12）
    closeIconSize: 48,      // ✕ 图标 px（原 size={32}）

    // ══ ② 整体外框（左右两栏的总容器）════════════════════════════════
    /**
     * 整体外框最大宽度：**`'none'` = 不限宽**（= 改动前**实际**渲染出来的样子）。
     * 🔴 坑（2026-10-15 第 7 轮独立审查发现，我复核确认）：原类 `max-w-[1600px]` 一直
     *    **没生效过** —— 它被 `index.css:56` 的一条**暴力规则**打死了：
     *      `#game-scale-container [class*="max-w-"] { max-width: none !important }`
     *    （那条规则本意是干掉 `max-w-screen` / `max-w-[100vw]`，却按"类名里含 `max-w-`"一刀切。）
     *    ⇒ 原作者写的 1600 上限**从来没被应用**，外框一直是满宽 1680。
     * ⚠️ 而把它搬成**内联** `maxWidth` 之后，那条 `!important` **管不到内联**（内联 ≠ 类）
     *    ⇒ 上限会**真的生效** ⇒ **画面会变窄**。这正是"逐项对账查不出"的盲区：
     *    **值对得上，但 CSS 的覆盖关系变了**。
     * ⇒ 所以默认填 `'none'`，把"改动前的样子"锁住。**想要上限就改成数字**（如 1600）。
     */
    frameMaxWidth: 'none',
    framePad: 48,           // 四周内边距 px（原 p-12 = 48）
    frameGap: 48,           // 左右两栏间距 px（原 gap-12 = 48）

    // ══ ③ 左侧列表栏 ═════════════════════════════════════════════════
    leftWidth: 384,         // 栏宽 px（原 w-64 = 256）
    leftPadY: 16,           // 上下内边距 px（原 py-4 = 16）
    leftPadRight: 16,       // 右内边距 px（原 pr-4 = 16）

    // ══ ④ 工具条（搜索 / 筛选 / 排序 / 倒序 / 清空）══════════════════
    barGap: 9,              // 按钮之间 px（原 gap-1.5 = 6）
    barMarginBottom: 12,     // 与下方间距 px（原 mb-2 = 8）
    searchIconLeft: 15,     // 放大镜距左 px（原 left-2.5 = 10）
    searchIconSize: 21,     // 放大镜图标 px（原 size={14}）
    searchPadY: 9,          // 输入框上下内边距 px（原 py-1.5 = 6）
    searchPadLeft: 48,      // 输入框左内边距 px（原 pl-8 = 32，给放大镜让位）
    searchPadRight: 12,      // 输入框右内边距 px（原 pr-2 = 8）
    searchFontSize: 18,     // 输入框字号 px（原 text-xs = 12）
    toolBtnPad: 9,          // 工具条小方按钮内边距 px（原 p-1.5 = 6）
    toolIconSize: 21,       // 工具条图标 px（原 size={14}）
    sortMenuWidth: 112,     // 排序下拉宽度 px（原 w-28 = 112）
    sortMenuMarginTop: 6,   // 下拉与按钮的间距 px（原 mt-1 = 4）
    sortItemPadX: 15,       // 下拉项左右内边距 px（原 px-2.5 = 10）
    sortItemPadY: 9,        // 下拉项上下内边距 px（原 py-1.5 = 6）
    sortItemFontSize: 16,   // 下拉项字号 px（原 text-[11px]）
    sortDirFontSize: 18,    // ↑ / ↓ 字号 px（原 text-[12px]）

    // ══ ⑤ 计数 + 筛选面板 ════════════════════════════════════════════
    countFontSize: 20,      // 「共 N / M 款」字号 px（原 text-[10px]）
    countMarginBottom: 6,   // 与下方间距 px（原 mb-1.5 = 6）
    panelGap: 10,           // 面板内各组之间 px（原 space-y-2.5 = 10）
    panelPad: 10,           // 面板内边距 px（原 p-2.5 = 10）
    panelMarginBottom: 8,   // 面板与列表之间 px（原 mb-2 = 8）
    groupLabelFontSize: 10, // 「色调 / 明暗 / 来源」小标题字号 px（原 text-[10px]）
    groupLabelMarginBottom: 4, // 小标题与色块之间 px（原 mb-1 = 4）
    chipGap: 4,             // 色块之间 px（原 gap-1 = 4）
    chipPadX: 8,            // 色块左右内边距 px（原 px-2 = 8）
    chipPadY: 2,            // 色块上下内边距 px（原 py-0.5 = 2）
    chipFontSize: 11,       // 色块字号 px（原 text-[11px]）
    chipMarginTop: 6,       // 「只看已解锁 / 只看动态款」上边距 px（原 mt-1.5 = 6）
    panelPadTop: 2,         // 面板底部那排的上内边距 px（原 pt-0.5 = 2）

    // ══ ⑥ 左侧列表卡片 ═══════════════════════════════════════════════
    listGap: 16,            // 卡片之间 px（原 gap-4 = 16）
    listNamePadX: 8,        // 名称条左右内边距 px（原 px-2 = 8）
    listNamePadTop: 16,     // 名称条上内边距 px（原 pt-4 = 16，给渐变留过渡）
    listNamePadBottom: 4,   // 名称条下内边距 px（原 pb-1 = 4）
    listNameFontSize: 36,   // 名称字号 px（原 text-[11px]）
    badgeOffset: 8,         // 角标距顶/右 px（原 top-2 right-2 = 8）
    badgePad: 4,            // 角标内边距 px（原 p-1 = 4）
    badgeIconSize: 24,      // 角标 ✓ 图标 px（原 size={12}）
    listLockIconSize: 36,   // 列表里未解锁的锁图标 px（原 size={24}）

    // ══ ⑦ 侧边抽屉把手（左栏右缘那根竖条）════════════════════════════
    handleOffsetRight: -12, // 往右移出栏外的量 px（原 -right-3 = -12）
    handleWidth: 28,        // 把手宽 px（原 w-7 = 28）
    handleHeight: 80,       // 把手高 px（原 h-20 = 80）
    handleIconSize: 20,     // 箭头图标 px（原 size={20}）

    // ══ ⑧ 右侧大图预览 ═══════════════════════════════════════════════
    titleFontSize: 64,      // 标题「卡背选择」字号 px（原 text-4xl = 36）
    titleMarginBottom: 32,  // 标题与预览之间 px（原 mb-8 = 32）
    /**
     * 卡背预览高度（**画布 px**）。
     * 🔴 原值是 `'70vh'`（原类 `h-[70vh]`）—— **这是个 BUG，2026-10-15 程发现、当天修掉**。
     *    病根（**精确说法，别记成"缩放了两次"**）：
     *    本条屏跑在 `ScaleWrapper` 的**固定 1680×1050 画布**里，再整体 `transform: scale(s)`
     *    塞进窗口（`ScaleWrapper.tsx:21-26`）。而 `vh` 不是"缩放"、是**长度解析**：
     *    它在 layout 期按**真实视口高**算出 `0.70 × VH` 这个长度，而这个长度**被记在画布的账本上**
     *    （transform 不参与 layout），随后绘制期整棵子树才被乘一次 `s`。
     *    ⇒ **`vh` 用视口量长度，却记进画布的账本** ⇒ 与别的画布 px 相比，
     *      **误差因子 = `VH / 1050`**（不是固定 2 倍：窗口恰为 1680×1050 时 `s=1`、误差正好 0）。
     *      · PC（窗口高约 1080）⇒ 因子 1.03：约 **72%** 屏高 —— 所以程看电脑觉得"已经很大了"
     *      · 手机（CSS 视口高约 360，被高 DPR 压小）⇒ 因子 0.34：只剩 **24%** 屏高 ——"很小"
     *    ⇒ 本屏**唯一**一个"电脑和手机不一样大"的元素就是它（别处都是画布 px，或相对父容器的 `%`）。
     *    📌 项目里**早有权威记载**：`design-guide.md` §3「⚠️ 分辨率适配铁律」明写
     *       「`vh/vw` 视口单位不随 scale 缩放 → 容器内混用 vh 会和 1680 坐标系冲突」，
     *       踩坑史里还有 09-01「等级奖励弹窗 `max-h-80vh`（改 80%）」。
     *    ⇒ 现改为**画布 px**（620 ≈ 画布高的 59%）：两端一定一样大，**一个数同时管两端**。
     * ⚠️ 联动（上限是算出来的，第 7 轮审查修正过）：
     *    右栏高 = 1050 − 2×`framePad`(48) = **954**；
     *    底部操作栏 = `footerMarginTop`(48) + 按钮盒（padding 32 + 27×**行高 1.5**=40.5）≈ **120.5**；
     *    居中 ⇒ 预览上沿 = `(954 − H − 120.5) / 2`；
     *    标题 `absolute top-0`，`titleFontSize` 64 × 行高 1.5 = **行盒 96**（Tailwind preflight 的 1.5，继承）
     *    ⇒ 不压住标题要求 **`H ≤ 641.5`**（我原先按行高 1.2 估成 688，偏乐观，已修正）。
     *    620 时上沿留白 ≈ 10.75，安全。**再往上就开始压标题**；把 `titleFontSize` 调小 ⇒ 上限跟着升高。
     */
    previewHeight: 620,
    previewWidth: '80%',    // 牌桌预览宽度（原 w-[80%]）**故意用 %**
    lockedIconSize: 128,     // 未解锁的大锁图标 px（原 size={64}）
    lockedIconMarginBottom: 24, // 大锁与 LOCKED 之间 px（原 mb-4 = 16）
    lockedFontSize: 48,     // 「LOCKED」字号 px（原 text-2xl = 24）
    lockedPadX: 24,         // LOCKED 框左右内边距 px（原 px-6 = 24）
    lockedPadY: 8,          // LOCKED 框上下内边距 px（原 py-2 = 8）
    hintFontSize: 12,       // 「SCROLL TO SWITCH」字号 px（原 text-xs = 12）
    hintOffset: 16,         // 提示距底/右 px（原 bottom-4 right-4 = 16）
    hintPadX: 8,            // 提示左右内边距 px（原 px-2 = 8）
    hintPadY: 4,            // 提示上下内边距 px（原 py-1 = 4）

    // ══ ⑨ 底部操作栏（风格计数 + 确认按钮）═══════════════════════════
    footerMarginTop: 48,    // 与预览之间 px（原 mt-12 = 48）
    footerGap: 32,          // 计数与按钮之间 px（原 gap-8 = 32）
    counterFontSize: 30,    // 「风格 01 / 09」字号 px（原 text-xl = 20）
    mainBtnPadX: 48,        // 主按钮左右内边距 px（原 px-12 = 48）
    mainBtnPadY: 16,        // 主按钮上下内边距 px（原 py-4 = 16）
    mainBtnFontSize: 27,    // 主按钮字号 px（原 text-lg = 18）
    mainBtnGap: 12,         // 主按钮图标与文字之间 px（原 gap-3 = 12）
    mainBtnIconSize: 30,    // 主按钮里的锁图标 px（原 size={20}）

    // ══ ⑩ 全览网格（点把手展开的抽屉）═══════════════════════════════
    gridPanelPad: 48,       // 面板四周内边距 px（原 p-12 = 48）
    gridPanelPadTop: 56,    // 面板上内边距 px（原 pt-14 = 56）
    gridHeadMarginBottom: 28, // 标题栏与网格之间 px（原 mb-7 = 28）
    gridTitleFontSize: 24,  // 「… · 全览」字号 px（原 text-2xl = 24）
    gridSubFontSize: 12,    // 副标题字号 px（原 text-xs = 12）
    gridSubMarginTop: 4,    // 副标题上边距 px（原 mt-1 = 4）
    gridHeadGap: 12,        // 右上两按钮之间 px（原 gap-3 = 12）
    gridClearPadX: 16,      // 「清空筛选」左右内边距 px（原 px-4 = 16）
    gridClearPadY: 8,       // 「清空筛选」上下内边距 px（原 py-2 = 8）
    gridClearFontSize: 12,  // 「清空筛选」字号 px（原 text-xs = 12）
    gridClosePad: 10,       // 收起按钮内边距 px（原 p-2.5 = 10）
    gridCloseIconSize: 22,  // 收起 ✕ 图标 px（原 size={22}）
    gridCols: 4,            // 列数（原 grid-cols-4）
    gridGap: 24,            // 格子之间 px（原 gap-6 = 24）
    /**
     * 网格最大宽度：**`'none'` = 不限宽**（= 改动前**实际**渲染的样子）。
     * 🔴 与 `frameMaxWidth` 同一个坑：原类 `max-w-7xl`(1280) 也被 `index.css:56` 的
     *    `[class*="max-w-"] { max-width: none !important }` 打死了 ⇒ 全览网格一直是**满宽**的。
     *    搬成内联后上限会真生效（网格变窄、卡片变小）⇒ 默认填 `'none'` 锁住原样。
     *    想要 1280 的上限就改成 `1280`。
     */
    gridMaxWidth: 'none',
    gridNamePadX: 12,       // 名称条左右内边距 px（原 px-3 = 12）
    gridNamePadTop: 24,     // 名称条上内边距 px（原 pt-6 = 24）
    gridNamePadBottom: 8,   // 名称条下内边距 px（原 pb-2 = 8）
    gridNameFontSize: 12,   // 名称字号 px（原 text-xs = 12）
    gridMetaFontSize: 10,   // 色调 / 来源字号 px（原 text-[10px]）
    gridMetaGap: 8,         // 色调与来源之间 px（原 gap-2 = 8）
    gridMetaMarginTop: 2,   // 元信息与名称之间 px（原 mt-0.5 = 2）
    gridLockIconSize: 26,   // 网格里未解锁的锁图标 px（原 size={26}）
    gridEmptyPadY: 128,     // 空态上下留白 px（原 py-32 = 128）
    gridEmptyIconSize: 40,  // 空态大图标 px（原 size={40}）
    gridEmptyIconMarginBottom: 16, // 空态图标与文字之间 px（原 mb-4 = 16）
    gridEmptyFontSize: 14,  // 空态文字字号 px（原 text-sm = 14）
    gridFooterFontSize: 11, // 底部提示字号 px（原 text-[11px]）
    gridFooterMarginTop: 32, // 底部提示上边距 px（原 mt-8 = 32）

    // ══ ⑪ 左侧列表的「空态」（筛到没结果时）══════════════════════════
    listEmptyPadY: 64,      // 上下留白 px（原 py-16 = 64）
    listEmptyIconSize: 24,  // 空态图标 px（原 size={24}）
    listEmptyIconMarginBottom: 8, // 图标与文字之间 px（原 mb-2 = 8）
    listEmptyFontSize: 12,  // 空态文字字号 px（原 text-xs = 12）
    listEmptyTextMarginBottom: 4, // 文字与按钮之间 px（原 mb-1 = 4）
    listEmptyBtnMarginTop: 8, // 「清空筛选」上边距 px（原 mt-2 = 8）
    listEmptyBtnPadX: 12,   // 「清空筛选」左右内边距 px（原 px-3 = 12）
    listEmptyBtnPadY: 4,    // 「清空筛选」上下内边距 px（原 py-1 = 4）
    listEmptyBtnFontSize: 11, // 「清空筛选」字号 px（原 text-[11px]）
} as const;

interface StyleSelectorProps {
    type: 'cardBack' | 'desk'; // 当前选择的是卡背还是牌桌
    currentSelected: number;   // 当前生效的索引 (0-4)
    unlockedIndices: number[];
    onSelect: (index: number) => void; // 确认选择回调
    onClose: () => void;       // 关闭回调
    deskDynamic?: boolean;     // [2026-08-13] 动态牌桌开关（牌桌类型时生效）
    cardBackDynamic?: boolean; // [2026-08-23] 动态卡背开关（卡背类型时生效）
}

export const StyleSelector: React.FC<StyleSelectorProps> = ({
    type,
    currentSelected,
    unlockedIndices,
    onSelect,
    onClose,
    deskDynamic = false,
    cardBackDynamic = false
}) => {
    // 临时预览索引 (用户在模态框里随便点，点"确认"前不生效)
    const [previewIndex, setPreviewIndex] = useState(currentSelected);

    const assets = type === 'cardBack' ? PERSONALIZATION_ASSETS.cardBacks : PERSONALIZATION_ASSETS.desks;
    const title = type === 'cardBack' ? '卡背选择' : '牌桌选择';

    // ── [2026-09-26 莉莉子] 筛选 + 排序状态 ──
    const [search, setSearch] = useState('');
    const [sortMode, setSortMode] = useState<StyleSortMode>('order');
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
    const [isSortOpen, setIsSortOpen] = useState(false);
    const [isFilterOpen, setIsFilterOpen] = useState(false);
    const [isGridOpen, setIsGridOpen] = useState(false);
    const [tempFilter, setTempFilter] = useState<('cool' | 'warm' | 'neutral')[]>([]);
    const [lightFilter, setLightFilter] = useState<('bright' | 'dark')[]>([]);
    const [sourceFilter, setSourceFilter] = useState<CosmeticSource[]>([]);
    const [onlyUnlocked, setOnlyUnlocked] = useState(false);
    const [onlyDynamic, setOnlyDynamic] = useState(false);

    // 每条款式汇总：registry 元数据（名称/来源/价格）+ 色调 + 解锁 + 动态
    const items = useMemo(() => assets.map((img, index) => {
        const reg = COSMETIC_REGISTRY.find(r => r.type === type && r.index === index);
        const tone = getCosmeticTone(type, index);
        return {
            index,
            img,
            name: reg?.name ?? (index === 0 ? '默认' : `#${String(index).padStart(2, '0')}`),
            source: reg?.source as CosmeticSource | undefined,
            price: reg?.price,
            tone,
            unlocked: unlockedIndices.includes(index),
            // 牌桌 15 张全部有动态视频；卡背只有默认款（index 0）没有
            hasVideo: type === 'cardBack' ? !!getCardBackVideo(index) : true,
        };
    }), [assets, type, unlockedIndices]);

    // 可见列表 = 筛选 + 排序结果（左侧列表与全览网格共用同一份）
    const visible = useMemo(() => {
        const kw = search.trim().toLowerCase();
        const list = items.filter(it => {
            if (kw && !it.name.toLowerCase().includes(kw)) return false;
            if (onlyUnlocked && !it.unlocked) return false;
            if (onlyDynamic && !it.hasVideo) return false;
            if (tempFilter.length > 0 && !(it.tone && tempFilter.includes(it.tone.temp))) return false;
            if (lightFilter.length > 0 && !(it.tone && lightFilter.includes(it.tone.light))) return false;
            if (sourceFilter.length > 0 && !(it.source && sourceFilter.includes(it.source))) return false;
            return true;
        });
        return [...list].sort((a, b) => {
            let cmp = 0;
            switch (sortMode) {
                case 'name': cmp = a.name.localeCompare(b.name, 'zh'); break;
                case 'price': cmp = (a.price ?? 0) - (b.price ?? 0); break;
                case 'newest': cmp = b.index - a.index; break;
                default: cmp = a.index - b.index; break;
            }
            return sortDir === 'desc' ? -cmp : cmp;
        });
    }, [items, search, onlyUnlocked, onlyDynamic, tempFilter, lightFilter, sourceFilter, sortMode, sortDir]);

    // 「来源」维度只对卡背有意义（牌桌 registry 里几乎全是 BOTH）；「色调」两者都有
    const hasSourceDim = type === 'cardBack';

    const isFilterActive = search !== '' || tempFilter.length > 0 || lightFilter.length > 0
        || sourceFilter.length > 0 || onlyUnlocked || onlyDynamic;
    const resetFilters = () => {
        setSearch(''); setTempFilter([]); setLightFilter([]); setSourceFilter([]);
        setOnlyUnlocked(false); setOnlyDynamic(false);
    };
    const toggle = <T,>(setter: React.Dispatch<React.SetStateAction<T[]>>, val: T) =>
        setter(prev => (prev.includes(val) ? prev.filter(v => v !== val) : [...prev, val]));

    // 鼠标滚轮切换 —— [2026-09-26] 改为在「筛选后的可见列表」内循环，避免滚到被筛掉的款式
    const handleWheel = (e: React.WheelEvent) => {
        if (visible.length === 0) return;
        const pos = visible.findIndex(it => it.index === previewIndex);
        const base = pos < 0 ? 0 : pos;
        if (e.deltaY > 0) {
            setPreviewIndex(visible[(base + 1) % visible.length].index);
        } else {
            setPreviewIndex(visible[(base - 1 + visible.length) % visible.length].index);
        }
    };
    const isPreviewUnlocked = unlockedIndices.includes(previewIndex);

    return (
        <>
            {/* 关闭按钮 - 独立 fixed 定位，完全脱离 flex 布局，永不被遮挡（尺寸见 🎛️ STYLE_UI.close*） */}
            <button
                onClick={() => { eventBus.emit(GameEvents.UI_BACK); onClose(); }}
                className="fixed z-[999] rounded-full
                           bg-black/70 border border-white/20 text-white
                           hover:bg-white/20 hover:border-white/60
                           shadow-2xl transition-all"
                style={{ top: STYLE_UI.closeTop, right: STYLE_UI.closeRight, padding: STYLE_UI.closePad }}
            >
                <X size={STYLE_UI.closeIconSize} />
            </button>

            <div className="fixed inset-0 z-[600] flex items-center justify-center bg-black/95 backdrop-blur-xl animate-fade-in text-white">
            {/* 尺寸见 🎛️ STYLE_UI.frame* */}
            <div className="flex w-full h-full" style={{ maxWidth: STYLE_UI.frameMaxWidth, padding: STYLE_UI.framePad, gap: STYLE_UI.frameGap }}>

                {/* --- 左侧：缩略图列表 + [2026-09-26 莉莉子] 筛选排序工具条（尺寸见 🎛️ STYLE_UI.left*）--- */}
                <div className="relative flex flex-col min-h-0" style={{ width: STYLE_UI.leftWidth, paddingTop: STYLE_UI.leftPadY, paddingBottom: STYLE_UI.leftPadY, paddingRight: STYLE_UI.leftPadRight }}>
                    {/* 工具条：搜索 + 筛选 + 排序 + 方向 + 清空（尺寸见 🎛️ STYLE_UI.bar* / search* / tool* / sort*） */}
                    <div className="flex items-center shrink-0" style={{ gap: STYLE_UI.barGap, marginBottom: STYLE_UI.barMarginBottom }}>
                        <div className="relative flex-1 min-w-0">
                            <Search className="absolute top-1/2 -translate-y-1/2 text-white/40" size={STYLE_UI.searchIconSize} style={{ left: STYLE_UI.searchIconLeft }} />
                            <input
                                type="text"
                                placeholder="搜索名称..."
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                className="w-full bg-black/50 border border-white/15 rounded-md text-white placeholder-white/30 focus:outline-none focus:border-orange-400/60 transition-all"
                                style={{ paddingTop: STYLE_UI.searchPadY, paddingBottom: STYLE_UI.searchPadY, paddingLeft: STYLE_UI.searchPadLeft, paddingRight: STYLE_UI.searchPadRight, fontSize: STYLE_UI.searchFontSize }}
                            />
                        </div>
                        <button
                            onClick={() => { eventBus.emit(GameEvents.UI_CLICK); setIsFilterOpen(o => !o); }}
                            title="筛选"
                            className={`rounded-md transition-colors shrink-0 border border-white/10 ${isFilterOpen ? 'bg-orange-600 text-white' : isFilterActive ? 'bg-orange-600/40 text-orange-200' : 'bg-black/50 text-white/60 hover:bg-black/70'}`}
                            style={{ padding: STYLE_UI.toolBtnPad }}
                        >
                            <Filter size={STYLE_UI.toolIconSize} />
                        </button>
                        <div className="relative shrink-0">
                            <button
                                onClick={() => { eventBus.emit(GameEvents.UI_CLICK); setIsSortOpen(o => !o); }}
                                title={`排序：${STYLE_SORT_LABELS[sortMode]}`}
                                className={`rounded-md transition-colors border border-white/10 ${isSortOpen ? 'bg-orange-600 text-white' : 'bg-black/50 text-white/60 hover:bg-black/70'}`}
                                style={{ padding: STYLE_UI.toolBtnPad }}
                            >
                                <ChevronDown size={STYLE_UI.toolIconSize} className={isSortOpen ? 'rotate-180 transition-transform' : 'transition-transform'} />
                            </button>
                            {isSortOpen && (
                                <div className="absolute left-0 top-full rounded-md bg-slate-900 border border-white/15 shadow-xl z-40 overflow-hidden" style={{ marginTop: STYLE_UI.sortMenuMarginTop, width: STYLE_UI.sortMenuWidth }}>
                                    {(Object.keys(STYLE_SORT_LABELS) as StyleSortMode[]).map(m => (
                                        <button
                                            key={m}
                                            onClick={() => { eventBus.emit(GameEvents.UI_CLICK); setSortMode(m); setIsSortOpen(false); }}
                                            className={`w-full text-left font-bold transition-colors ${sortMode === m ? 'bg-orange-600/50 text-white' : 'text-gray-300 hover:bg-white/5'}`}
                                            style={{ paddingLeft: STYLE_UI.sortItemPadX, paddingRight: STYLE_UI.sortItemPadX, paddingTop: STYLE_UI.sortItemPadY, paddingBottom: STYLE_UI.sortItemPadY, fontSize: STYLE_UI.sortItemFontSize }}
                                        >
                                            {STYLE_SORT_LABELS[m]}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                        <button
                            onClick={() => { eventBus.emit(GameEvents.UI_CLICK); setSortDir(d => (d === 'asc' ? 'desc' : 'asc')); }}
                            title={sortDir === 'asc' ? '顺序排列（点击倒序）' : '倒序排列（点击顺序）'}
                            className={`rounded-md transition-colors shrink-0 border border-white/10 ${sortDir === 'desc' ? 'bg-orange-600/40 text-white' : 'bg-black/50 text-white/60 hover:bg-black/70'}`}
                            style={{ padding: STYLE_UI.toolBtnPad }}
                        >
                            <span className="block font-black leading-none" style={{ fontSize: STYLE_UI.sortDirFontSize }}>{sortDir === 'asc' ? '↑' : '↓'}</span>
                        </button>
                        <button
                            onClick={() => { eventBus.emit(GameEvents.UI_CLICK); resetFilters(); }}
                            disabled={!isFilterActive}
                            title="清空筛选"
                            className={`rounded-md transition-colors shrink-0 border border-white/10 ${isFilterActive ? 'bg-red-600/30 text-red-300 hover:bg-red-600 hover:text-white' : 'bg-black/40 text-white/20'}`}
                            style={{ padding: STYLE_UI.toolBtnPad }}
                        >
                            <RotateCcw size={STYLE_UI.toolIconSize} />
                        </button>
                    </div>

                    {/* 计数 + 筛选面板（尺寸见 🎛️ STYLE_UI.count* / panel* / groupLabel* / chip*） */}
                    <div className="shrink-0" style={{ marginBottom: STYLE_UI.panelMarginBottom }}>
                        <div className="flex items-center justify-between text-white/40 font-bold" style={{ fontSize: STYLE_UI.countFontSize, marginBottom: STYLE_UI.countMarginBottom }}>
                            <span>共 {visible.length} / {assets.length} 款</span>
                            {isFilterActive && <span className="text-orange-400">已筛选</span>}
                        </div>
                        {isFilterOpen && (
                            <div className="bg-black/50 border border-white/10 rounded-md" style={{ padding: STYLE_UI.panelPad, marginBottom: STYLE_UI.panelMarginBottom, display: 'flex', flexDirection: 'column', gap: STYLE_UI.panelGap }}>
                                <div>
                                    <span className="text-white/40 font-bold tracking-widest block" style={{ fontSize: STYLE_UI.groupLabelFontSize, marginBottom: STYLE_UI.groupLabelMarginBottom }}>色调</span>
                                    <div className="flex flex-wrap" style={{ gap: STYLE_UI.chipGap }}>
                                        {(['cool', 'warm', 'neutral'] as const).map(t => {
                                            const on = tempFilter.includes(t);
                                            return (
                                                <button key={t} onClick={() => { eventBus.emit(GameEvents.UI_CLICK); toggle(setTempFilter, t); }}
                                                    className="rounded font-bold border transition-all"
                                                    style={{
                                                        ...(on ? { background: TEMP_COLORS[t], borderColor: TEMP_COLORS[t], color: '#0f172a' } : { color: TEMP_COLORS[t], borderColor: 'transparent' }),
                                                        paddingLeft: STYLE_UI.chipPadX, paddingRight: STYLE_UI.chipPadX,
                                                        paddingTop: STYLE_UI.chipPadY, paddingBottom: STYLE_UI.chipPadY,
                                                        fontSize: STYLE_UI.chipFontSize,
                                                    }}>
                                                    {TEMP_LABELS[t]}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                                <div>
                                    <span className="text-white/40 font-bold tracking-widest block" style={{ fontSize: STYLE_UI.groupLabelFontSize, marginBottom: STYLE_UI.groupLabelMarginBottom }}>明暗</span>
                                    <div className="flex flex-wrap" style={{ gap: STYLE_UI.chipGap }}>
                                        {(['bright', 'dark'] as const).map(t => {
                                            const on = lightFilter.includes(t);
                                            return (
                                                <button key={t} onClick={() => { eventBus.emit(GameEvents.UI_CLICK); toggle(setLightFilter, t); }}
                                                    className="rounded font-bold border transition-all"
                                                    style={{
                                                        ...(on ? { background: LIGHT_COLORS[t], borderColor: LIGHT_COLORS[t], color: '#0f172a' } : { color: LIGHT_COLORS[t], borderColor: 'transparent' }),
                                                        paddingLeft: STYLE_UI.chipPadX, paddingRight: STYLE_UI.chipPadX,
                                                        paddingTop: STYLE_UI.chipPadY, paddingBottom: STYLE_UI.chipPadY,
                                                        fontSize: STYLE_UI.chipFontSize,
                                                    }}>
                                                    {LIGHT_LABELS[t]}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                                {hasSourceDim && (
                                    <div>
                                        <span className="text-white/40 font-bold tracking-widest block" style={{ fontSize: STYLE_UI.groupLabelFontSize, marginBottom: STYLE_UI.groupLabelMarginBottom }}>来源</span>
                                        <div className="flex flex-wrap" style={{ gap: STYLE_UI.chipGap }}>
                                            {(['SHOP', 'GACHA', 'BOTH', 'MISSION'] as CosmeticSource[]).map(s => {
                                                const on = sourceFilter.includes(s);
                                                return (
                                                    <button key={s} onClick={() => { eventBus.emit(GameEvents.UI_CLICK); toggle(setSourceFilter, s); }}
                                                        className="rounded font-bold border transition-all"
                                                        style={{
                                                            ...(on ? { background: SOURCE_COLORS[s], borderColor: SOURCE_COLORS[s], color: '#0f172a' } : { color: SOURCE_COLORS[s], borderColor: 'transparent' }),
                                                            paddingLeft: STYLE_UI.chipPadX, paddingRight: STYLE_UI.chipPadX,
                                                            paddingTop: STYLE_UI.chipPadY, paddingBottom: STYLE_UI.chipPadY,
                                                            fontSize: STYLE_UI.chipFontSize,
                                                        }}>
                                                        {SOURCE_LABELS[s]}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                                <div className="flex flex-wrap border-t border-white/10" style={{ gap: STYLE_UI.chipGap, paddingTop: STYLE_UI.panelPadTop }}>
                                    <button onClick={() => { eventBus.emit(GameEvents.UI_CLICK); setOnlyUnlocked(v => !v); }}
                                        className={`rounded font-bold transition-all ${onlyUnlocked ? 'bg-emerald-600 text-white' : 'bg-white/10 text-white/50 hover:bg-white/20'}`}
                                        style={{ marginTop: STYLE_UI.chipMarginTop, paddingLeft: STYLE_UI.chipPadX, paddingRight: STYLE_UI.chipPadX, paddingTop: STYLE_UI.chipPadY, paddingBottom: STYLE_UI.chipPadY, fontSize: STYLE_UI.chipFontSize }}>
                                        只看已解锁
                                    </button>
                                    <button onClick={() => { eventBus.emit(GameEvents.UI_CLICK); setOnlyDynamic(v => !v); }}
                                        className={`rounded font-bold transition-all ${onlyDynamic ? 'bg-sky-600 text-white' : 'bg-white/10 text-white/50 hover:bg-white/20'}`}
                                        style={{ marginTop: STYLE_UI.chipMarginTop, paddingLeft: STYLE_UI.chipPadX, paddingRight: STYLE_UI.chipPadX, paddingTop: STYLE_UI.chipPadY, paddingBottom: STYLE_UI.chipPadY, fontSize: STYLE_UI.chipFontSize }}>
                                        只看动态款
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="flex-1 overflow-y-auto custom-scrollbar min-h-0 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                        {visible.length === 0 ? (
                            /* 空态（尺寸见 🎛️ STYLE_UI.listEmpty*） */
                            <div className="flex flex-col items-center justify-center text-center" style={{ paddingTop: STYLE_UI.listEmptyPadY, paddingBottom: STYLE_UI.listEmptyPadY }}>
                                <Search size={STYLE_UI.listEmptyIconSize} className="text-white/20" style={{ marginBottom: STYLE_UI.listEmptyIconMarginBottom }} />
                                <p className="text-white/50 font-bold" style={{ fontSize: STYLE_UI.listEmptyFontSize, marginBottom: STYLE_UI.listEmptyTextMarginBottom }}>没有符合条件的款式</p>
                                <button
                                    onClick={() => { eventBus.emit(GameEvents.UI_CLICK); resetFilters(); }}
                                    className="rounded bg-white/10 hover:bg-white/20 font-bold text-white/70 transition-colors"
                                    style={{ marginTop: STYLE_UI.listEmptyBtnMarginTop, paddingLeft: STYLE_UI.listEmptyBtnPadX, paddingRight: STYLE_UI.listEmptyBtnPadX, paddingTop: STYLE_UI.listEmptyBtnPadY, paddingBottom: STYLE_UI.listEmptyBtnPadY, fontSize: STYLE_UI.listEmptyBtnFontSize }}
                                >
                                    清空筛选
                                </button>
                            </div>
                        ) : (
                        /* 列表卡片（尺寸见 🎛️ STYLE_UI.list* / listName* / badge* / listLockIconSize） */
                        <div className="flex flex-col" style={{ gap: STYLE_UI.listGap }}>
                            {visible.map(it => {
                                const isUnlocked = it.unlocked;
                                const active = previewIndex === it.index;
                                return (
                                    <div
                                        key={it.index}
                                        onClick={() => { eventBus.emit(GameEvents.UI_CLICK); setPreviewIndex(it.index); }}
                                        className={`
                                            relative cursor-pointer rounded-xl overflow-hidden border-2 transition-all duration-300 group
                                            ${active ? 'border-orange-500 scale-105 shadow-[0_0_20px_orange]' : 'border-white/10 hover:border-white/50 opacity-60 hover:opacity-100'}
                                            ${type === 'cardBack' ? 'aspect-[2/3]' : 'aspect-video'}
                                        `}
                                    >
                                        {type === 'cardBack' ? (
                                            <img
                                                src={it.img}
                                                className={`w-full h-full object-contain ${!isUnlocked ? 'grayscale' : ''}`}
                                                alt={it.name}
                                            />
                                        ) : (
                                            <DeskMedia deskIndex={it.index} className={`w-full h-full object-contain ${!isUnlocked ? 'grayscale' : ''}`} />
                                        )}

                                        {/* 名称条：[2026-09-26] registry 已有命名，此前列表完全无名、只能靠编号认（尺寸见 🎛️ STYLE_UI.listName*） */}
                                        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/85 to-transparent pointer-events-none"
                                            style={{ paddingLeft: STYLE_UI.listNamePadX, paddingRight: STYLE_UI.listNamePadX, paddingTop: STYLE_UI.listNamePadTop, paddingBottom: STYLE_UI.listNamePadBottom }}>
                                            <span className="block font-bold text-white/90 truncate" style={{ fontSize: STYLE_UI.listNameFontSize }}>{it.name}</span>
                                        </div>

                                        {/* 当前生效标记（尺寸见 🎛️ STYLE_UI.badge*） */}
                                        {currentSelected === it.index && (
                                            <div className="absolute bg-green-500 text-black rounded-full shadow-lg z-10"
                                                style={{ top: STYLE_UI.badgeOffset, right: STYLE_UI.badgeOffset, padding: STYLE_UI.badgePad }}>
                                                <Check size={STYLE_UI.badgeIconSize} strokeWidth={4} />
                                            </div>
                                        )}

                                        {/* 未解锁标记 (锁图标)（尺寸见 🎛️ STYLE_UI.listLockIconSize） */}
                                        {!isUnlocked && (
                                            <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                                                <Lock size={STYLE_UI.listLockIconSize} className="text-white/80" />
                                            </div>
                                        )}

                                        <div className="absolute inset-0 bg-black/20 group-hover:bg-transparent transition-colors pointer-events-none"></div>
                                    </div>
                                );
                            })}
                        </div>
                        )}
                    </div>

                    {/* 侧边抽屉按钮：展开 4 列全览网格（尺寸见 🎛️ STYLE_UI.handle*） */}
                    <button
                        onClick={() => { eventBus.emit(GameEvents.UI_CLICK); setIsGridOpen(true); }}
                        title="展开全览网格"
                        className="absolute top-1/2 -translate-y-1/2 bg-black/50 backdrop-blur-md border border-white/15 border-l-0 rounded-r-md flex items-center justify-center hover:bg-black/75 transition-colors group z-10"
                        style={{ right: STYLE_UI.handleOffsetRight, width: STYLE_UI.handleWidth, height: STYLE_UI.handleHeight }}
                    >
                        <ChevronRight size={STYLE_UI.handleIconSize} className="text-gray-400 group-hover:text-white transition-colors" />
                    </button>
                </div>


                {/* --- 右侧：大图预览与确认（尺寸见 🎛️ STYLE_UI.title* / preview*）--- */}
                <div className="flex-1 flex flex-col items-center justify-center relative">
                    <h2 className="font-black tracking-[0.5em] text-white/20 absolute top-0" style={{ fontSize: STYLE_UI.titleFontSize, marginBottom: STYLE_UI.titleMarginBottom }}>{title}</h2>

                    {/* 预览窗口 —— 卡背按**视口高**、牌桌按**父容器宽**（这两个值故意不用 px，见 STYLE_UI 顶部说明） */}
                    <div
                        className={`
                            relative shadow-2xl transition-all duration-500 ease-out
                            ${type === 'cardBack' ? 'aspect-[2/3] rounded-2xl' : 'aspect-video rounded-xl'}
                            border border-white/10 bg-black overflow-hidden
                        `}
                        style={type === 'cardBack' ? { height: STYLE_UI.previewHeight } : { width: STYLE_UI.previewWidth }}
                        onWheel={handleWheel}
                    >
                        {/* 切换动画需要 Key 变化（[2026-08-13] 牌桌类型用动态视频 DeskMedia；[2026-08-23] 卡背类型用动态视频 CardBackVideo） */}
                        {type === 'cardBack' ? (
                            cardBackDynamic && getCardBackVideo(previewIndex) ? (
                                <CardBackVideo key={previewIndex} src={getCardBackVideo(previewIndex)!} poster={assets[previewIndex]} className="w-full h-full object-cover animate-fade-in" />
                            ) : (
                                <img
                                    key={previewIndex}
                                    src={assets[previewIndex]}
                                    className="w-full h-full object-cover animate-fade-in"
                                    alt="预览"
                                />
                            )
                        ) : (
                            <DeskMedia key={previewIndex} deskIndex={previewIndex} dynamic={deskDynamic} className="w-full h-full object-cover animate-fade-in" />
                        )}

                        {/* [新增] 未解锁时的全屏遮罩/提示（尺寸见 🎛️ STYLE_UI.locked*） */}
                        {!isPreviewUnlocked && (
                            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/20 backdrop-blur-[2px]">
                                <Lock size={STYLE_UI.lockedIconSize} className="text-white/50" style={{ marginBottom: STYLE_UI.lockedIconMarginBottom }} />
                                <span className="font-black tracking-widest text-white/50 border-2 border-white/50 rounded"
                                    style={{ fontSize: STYLE_UI.lockedFontSize, paddingLeft: STYLE_UI.lockedPadX, paddingRight: STYLE_UI.lockedPadX, paddingTop: STYLE_UI.lockedPadY, paddingBottom: STYLE_UI.lockedPadY }}>
                                    LOCKED
                                </span>
                            </div>
                        )}

                        {/* 滚轮提示（尺寸见 🎛️ STYLE_UI.hint*） */}
                        <div className="absolute font-mono text-white/40 bg-black/50 rounded border border-white/10"
                            style={{ bottom: STYLE_UI.hintOffset, right: STYLE_UI.hintOffset, fontSize: STYLE_UI.hintFontSize, paddingLeft: STYLE_UI.hintPadX, paddingRight: STYLE_UI.hintPadX, paddingTop: STYLE_UI.hintPadY, paddingBottom: STYLE_UI.hintPadY }}>
                            SCROLL TO SWITCH
                        </div>
                    </div>


                    {/* 底部操作栏（尺寸见 🎛️ STYLE_UI.footer* / counter* / mainBtn*） */}
                    <div className="flex items-center" style={{ marginTop: STYLE_UI.footerMarginTop, gap: STYLE_UI.footerGap }}>
                        <div className="font-mono text-gray-400" style={{ fontSize: STYLE_UI.counterFontSize }}>
                            风格 {String(previewIndex + 1).padStart(2, '0')} / {String(assets.length).padStart(2, '0')}
                        </div>


                        <button
                            onClick={() => {
                                if (isPreviewUnlocked) {
                                    eventBus.emit(GameEvents.UI_CLICK); onSelect(previewIndex);
                                }
                            }}
                            // 禁用条件：已经是当前选择 OR 未解锁
                            disabled={currentSelected === previewIndex || !isPreviewUnlocked}
                            className={`
                                rounded-full font-black tracking-widest transition-all
                                flex items-center
                                ${!isPreviewUnlocked
                                    ? 'bg-gray-800 text-gray-500 border border-gray-700 cursor-not-allowed' // 锁定样式
                                    : (currentSelected === previewIndex
                                        ? 'bg-green-600/20 text-green-500 border border-green-500/50 cursor-default' // 已选中样式
                                        : 'bg-orange-600 hover:bg-orange-500 text-white shadow-[0_0_30px_rgba(234,88,12,0.4)] hover:scale-105') // 可选样式
                                }
                            `}
                            style={{ paddingLeft: STYLE_UI.mainBtnPadX, paddingRight: STYLE_UI.mainBtnPadX, paddingTop: STYLE_UI.mainBtnPadY, paddingBottom: STYLE_UI.mainBtnPadY, fontSize: STYLE_UI.mainBtnFontSize, gap: STYLE_UI.mainBtnGap }}
                        >
                            {!isPreviewUnlocked ? (
                                <><Lock size={STYLE_UI.mainBtnIconSize} /> 锁定</>
                            ) : (
                                currentSelected === previewIndex ? (
                                    <><Check /> 装备中</>
                                ) : (
                                    '风格选择'
                                )
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </div>

        {/* ================= [2026-09-26 莉莉子] 全览网格 =================
            形态对齐大厅「背景选择」的 isGridOpen 面板：4 列铺满 + 毛玻璃底 + 点选即生效
            左侧 w-64 列表一屏只能看到约 3 个（卡背 2:3 太高），全览网格才是找款式的主力 */}
        <AnimatePresence>
            {isGridOpen && (
                <motion.div
                    initial={{ opacity: 0, scale: 0.96 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.96 }}
                    className="fixed inset-0 z-[700] bg-black/85 backdrop-blur-xl overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
                    style={{ padding: STYLE_UI.gridPanelPad, paddingTop: STYLE_UI.gridPanelPadTop }}
                >
                    {/* 尺寸见 🎛️ STYLE_UI.gridHead* / gridTitle* / gridSub* / gridClear* / gridClose* */}
                    <div className="mx-auto flex items-end justify-between" style={{ maxWidth: STYLE_UI.gridMaxWidth, marginBottom: STYLE_UI.gridHeadMarginBottom }}>
                        <div>
                            <h3 className="font-black tracking-[0.3em] text-white" style={{ fontSize: STYLE_UI.gridTitleFontSize }}>{title} · 全览</h3>
                            <p className="text-white/40 font-mono" style={{ fontSize: STYLE_UI.gridSubFontSize, marginTop: STYLE_UI.gridSubMarginTop }}>共 {visible.length} / {assets.length} 款{isFilterActive ? ' · 已筛选' : ''}</p>
                        </div>
                        <div className="flex items-center" style={{ gap: STYLE_UI.gridHeadGap }}>
                            <button
                                onClick={() => { eventBus.emit(GameEvents.UI_CLICK); resetFilters(); }}
                                disabled={!isFilterActive}
                                className={`rounded-md font-bold border transition-all ${isFilterActive ? 'bg-red-600/30 text-red-300 border-red-500/40 hover:bg-red-600 hover:text-white' : 'bg-white/5 text-white/20 border-white/10'}`}
                                style={{ paddingLeft: STYLE_UI.gridClearPadX, paddingRight: STYLE_UI.gridClearPadX, paddingTop: STYLE_UI.gridClearPadY, paddingBottom: STYLE_UI.gridClearPadY, fontSize: STYLE_UI.gridClearFontSize }}
                            >
                                清空筛选
                            </button>
                            <button
                                onClick={() => { eventBus.emit(GameEvents.UI_CLICK); setIsGridOpen(false); }}
                                className="rounded-md bg-white/10 hover:bg-white/20 border border-white/15 text-white transition-colors"
                                style={{ padding: STYLE_UI.gridClosePad }}
                                title="收起全览"
                            >
                                <X size={STYLE_UI.gridCloseIconSize} />
                            </button>
                        </div>
                    </div>

                    {visible.length === 0 ? (
                        <div className="flex flex-col items-center justify-center text-center" style={{ paddingTop: STYLE_UI.gridEmptyPadY, paddingBottom: STYLE_UI.gridEmptyPadY }}>
                            <LayoutGrid size={STYLE_UI.gridEmptyIconSize} className="text-white/15" style={{ marginBottom: STYLE_UI.gridEmptyIconMarginBottom }} />
                            <p className="text-white/50 font-bold" style={{ fontSize: STYLE_UI.gridEmptyFontSize }}>没有符合条件的款式</p>
                        </div>
                    ) : (
                        <div className="grid mx-auto" style={{ gridTemplateColumns: `repeat(${STYLE_UI.gridCols}, minmax(0, 1fr))`, gap: STYLE_UI.gridGap, maxWidth: STYLE_UI.gridMaxWidth }}>
                            {visible.map(it => {
                                const active = previewIndex === it.index;
                                return (
                                    <div
                                        key={it.index}
                                        onClick={() => { eventBus.emit(GameEvents.UI_CLICK); setPreviewIndex(it.index); setIsGridOpen(false); }}
                                        className={`relative rounded-lg overflow-hidden cursor-pointer transition-all duration-300 border-2 ${active ? 'border-orange-500 scale-[1.03] shadow-[0_0_20px_rgba(249,115,22,0.5)]' : 'border-white/15 hover:border-white/60 hover:scale-[1.03]'} ${type === 'cardBack' ? 'aspect-[2/3]' : 'aspect-video'}`}
                                    >
                                        {type === 'cardBack' ? (
                                            <img src={it.img} className={`w-full h-full object-cover ${!it.unlocked ? 'grayscale' : ''}`} alt={it.name} />
                                        ) : (
                                            <DeskMedia deskIndex={it.index} className={`w-full h-full object-cover ${!it.unlocked ? 'grayscale' : ''}`} />
                                        )}

                                        {/* 名称 + 色调/来源速览（尺寸见 🎛️ STYLE_UI.gridName* / gridMeta* / badge* / gridLockIconSize） */}
                                        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/55 to-transparent pointer-events-none"
                                            style={{ paddingLeft: STYLE_UI.gridNamePadX, paddingRight: STYLE_UI.gridNamePadX, paddingTop: STYLE_UI.gridNamePadTop, paddingBottom: STYLE_UI.gridNamePadBottom }}>
                                            <span className="block font-bold text-white truncate" style={{ fontSize: STYLE_UI.gridNameFontSize }}>{it.name}</span>
                                            <div className="flex items-center" style={{ gap: STYLE_UI.gridMetaGap, marginTop: STYLE_UI.gridMetaMarginTop }}>
                                                {it.tone && (
                                                    <span className="font-mono" style={{ fontSize: STYLE_UI.gridMetaFontSize, color: TEMP_COLORS[it.tone.temp] }}>
                                                        {TEMP_LABELS[it.tone.temp]}·{LIGHT_LABELS[it.tone.light]}
                                                    </span>
                                                )}
                                                {hasSourceDim && it.source && (
                                                    <span className="font-mono" style={{ fontSize: STYLE_UI.gridMetaFontSize, color: SOURCE_COLORS[it.source] }}>
                                                        {SOURCE_LABELS[it.source]}
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        {currentSelected === it.index && (
                                            <div className="absolute bg-green-500 text-black rounded-full shadow-lg z-10"
                                                style={{ top: STYLE_UI.badgeOffset, right: STYLE_UI.badgeOffset, padding: STYLE_UI.badgePad }}>
                                                <Check size={STYLE_UI.badgeIconSize} strokeWidth={4} />
                                            </div>
                                        )}
                                        {!it.unlocked && (
                                            <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                                                <Lock size={STYLE_UI.gridLockIconSize} className="text-white/80" />
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    <p className="mx-auto text-center text-white/30 font-mono" style={{ maxWidth: STYLE_UI.gridMaxWidth, marginTop: STYLE_UI.gridFooterMarginTop, fontSize: STYLE_UI.gridFooterFontSize }}>
                        点击任意款式 → 选中并返回主视图预览
                    </p>
                </motion.div>
            )}
        </AnimatePresence>
        </>
    );
};