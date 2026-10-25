// ==========================================
// 悖论迷宫 · 卡包开启演出（转盘老虎机 · 重构版）
// [2026-09-04 莉莉子 + 程拍板] 三优化：
//   ① 转盘待命型：弹窗打开滚轮匀速往复慢转（预热待命）→ 点开启 → 加速冲刺 → 减速定格在中间标记线
//   ② 滚动格改六边形图标（clip-path 扁六边形，替代原长方形卡）
//   ③ 定格瞬间自动弹出效果详情弹窗（品质 + 大类），按钮收进弹窗
//   ⚠️ [2026-10-02 莉莉子] 原注释里的「鼠标悬停格子 → 大图检视」**功能已在 09-29 匣子化改造中移除**
//      （滚轮里滚的就是匣子，没有"具体是什么"可检视）—— 本次把遗留的过时注释清掉，免得再被误导。
// [2026-09-29 程拍板 · 匣子化改造] **卡包改为开出「奖励匣」，不再直接开武装**：
//   开包 → 滚轮定格在一个**匣子**（武装匣 / 神格碎片匣 × 六档品质）→ 匣子入待打开队列
//   → 玩家随后在「待打开匣子」里开匣子，才得到对应品质武装 / 对应数量神格碎片。
// [2026-10-02 莉莉子 · 程反馈修复] 详见 docs/检查-开卡包与开匣.md
//   · #2-new 程反馈「点再开一包轮盘不转」—— 病根：`s0 = sRef.current`，而结果态 s 已停在终点 TARGET_X
//     ⇒ 冲刺位移差恒为 0。改为**动态目标位**：每次开启把目标放在"当前位置前方固定格数"，
//     且新格子**追加**到序列尾部（不重建整表 ⇒ 顺带修掉 #7「点开启瞬间可见格内容突变」）。
//   · #8 「收起」瞬移 —— 待命往复由"绝对位移"改为**以收起点为锚**的往复 ⇒ 位移连续、不再跳 2302→360。
//   · #4 缩放统一到 gameScale（原来主面板不缩放、只有详情弹窗缩放 ⇒ 非 1.0 分辨率下大小不匹配）。
//   · #2 退出动画 —— 原来 `if (!isOpen) return null` 写在 AnimatePresence **之前**，exit 永不播放。
//   · #5 结果态底部给**兜底按钮**（详情弹窗一旦关掉不再"底部空白、无处可点"）。
//   · #6 术语统一：本弹窗做的是**开卡包**，不再自称「开匣」。
//   · #9 点详情背景 = 收起详情（原来 stopPropagation 后什么都不做，像卡住）。
//   · N1 程反馈「窗口太小、中间六边形太小」→ 整体放大（窗口 640→1000、图标 68→108）。
// ==========================================
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Package, X } from 'lucide-react';
import { RARITY_META } from './RarityIcon';
import {
    CHEST_KIND_LABEL, describeChestContent, CHEST_RARITY_ORDER, SHARD_GROUP_SIZE,
    type ChestInstance, type ChestKind,
} from '../../data/roguelike/divinityShards';
import { getGameScale } from '../../utils/gameScale'; // [2026-09-04] 详情 portal 逃出 scale 容器后按 gameScale 补偿
// [2026-10-20 莉莉子 🎨 视觉层优化] 匣子插画唯一真源（UI 侧不出现裸图片路径）
import { getChestArt, getChestArtName } from '../../data/roguelike/chestArt';
import { BulkOpenSummaryModal, type BulkSummaryItem } from './BulkOpenSummaryModal'; // [2026-10-04 程拍板] 一键全开的完整结果汇总窗
import { eventBus, GameEvents } from '../../utils/eventBus'; // [2026-10-14 莉莉子 🖱️] 开卡包 / 关闭 / 详情 音效
import { pickTuning, pickPortalContainScale, pickPortalScale } from '../../platform/tuning';
// [2026-10-21 莉莉子 🎨 视觉层优化] 匣子档案卡浮窗（取代原生 `title`）+ 武装库存 + 触屏长按浮现延迟归零
import { PackChestDossier, type PackChestDossierData } from './PackChestDossier';
import type { ArmStockMap } from '../../data/roguelike/armamentStock';
import { gazeEnterDelay, isTouchInput } from '../../utils/touchGaze';
// ══════════════════════════════════════════════════════════════════════
// 🎛️ 肉鸽「卡包开启」演出（`PackOpenModal`）· 视觉调参区（**程微调就改这里**）
// ──────────────────────────────────────────────────────────────────────
// 这一屏 = 悖论迷宫「待打开卡包」点开启后弹出的老虎机转盘：转盘待命慢转 → 冲刺定格
//   → 定格瞬间弹「奖励匣」详情弹窗 → 底部可「再开一包 / 一键全开」。
// 管：①面板本体 ②标题与副标题 ③滚动展示窗（转盘）④六边形格 ⑤中奖揭示与光环
//     ⑥转盘下的提示语 ⑦底部按钮行 ⑧右上关闭 ⑨定格详情弹窗（portal）。
// 改完存盘即生效（HMR —— 雷电/电脑上 1~3 秒看到，不用出包）。
// 命名与用法**对齐 `TITLE_UI`**：值是**绝对画布 px**、直接进 style；注释标注**原 Tailwind 类**。
// ⚠️ **滚轮几何不在本块里**：本文件顶部那组裸常量 `CARD_W` / `CARD_H` / `WINDOW_W` /
//     `HEX_SIZE` / `BIG_HEX`（连同 `INITIAL_SEQ_LEN` / `ROLL_CELLS` / `IDLE_MAX` / `ROLL_DUR` …
//     的演出参数）**本来就是可调的**，本块**不重复收录**（同一部件两处各一份 = 改一处不生效）。
//     要改「窗口多大 / 格子多宽 / 六边形多大」请直接改文件顶部那组常量。
// ⚠️ 面板整体已按 `gameScale` 缩放（`getGameScale()`），本块的 px 都在**缩放之前**的坐标系里。
// ⚠️ 刻意**没搬**的类（都是"单个数值就够用"的观感量，不是尺寸）：
//     `z-[15]/z-20/z-30`（标记线、渐隐、▲ 的层序）· `p-2` 之外的小图标尺寸已单独提值 ·
//     `leading-none` / `leading-relaxed`（**行高刻意留给继承**：字号成倍放大时不压字）·
//     `tracking-*` · `font-*` · `hover:scale-105` · `drop-shadow-*` · `shadow-*` · `bg-*` / `text-<色>`
//     · `inset-0` / `inset-y-0` / `left-1/2 top-0` 等铺满与居中定位 · `will-change-transform`
// ⚠️ 本屏无 `max-w-*`，也没有 `vh` / `vw`（合 `design-guide.md` §3 铁律）。
// ══════════════════════════════════════════════════════════════════════
// 🖥️📱 【双平台】`PACK_OPEN_UI_MOBILE`（手机端）+ `PACK_OPEN_UI_PC_DIFF`（PC 端差异项，见本块下方）
const PACK_OPEN_UI_MOBILE = {
    // ══ ① 面板本体 ════════════════════════════════════════════════════
    /** 面板宽 px（原 w-[1180px]） */
    /** 【主旋钮】面板整体缩放（1 = 原样）—— 它乘在**已有的 `gameScale` 补偿**上（不新增 DOM）·
     *  ⚠️ 面板在 `flex items-center justify-center` 里是**居中的唯一 in-flow 子元素** ⇒ 缩放朝两侧对称长大，
     *     **不需要补 margin**（同 `MODE_UI.stageScale` 的判据；对照 `HUB_UI.dioramaScale` 那个要补上下各一半）。
     *  ⚠️ 与**定格详情弹窗**共用这一个旋钮（同一个界面的两态一起放大）；不想联动就说一声，删掉 689 行那处即可。
     *  📐 面板逻辑宽 1180；`1180 × panelScale ≤ 1680`（画布宽）⇒ **实用上限约 1.4**（再大左右会被切）。 */
    panelScale: 1.75,
    panelWidth: 1180,
    /** 面板圆角 px（原 rounded-3xl = 24） */
    panelRadius: 24,
    /** 面板描边 px（原 border = 1） */
    panelBorderWidth: 1,
    /** 面板四周内边距 px（原 p-8 = 32） */
    panelPad: 32,

    // ══ ② 标题与副标题 ════════════════════════════════════════════════
    /** 「卡包开启」行内图标与文字间距 px（原 gap-2 = 8） */
    titleRowGap: 8,
    /** 标题行与下方副标题的间距 px（原 mb-1 = 4） */
    titleRowMarginBottom: 4,
    /** 标题左侧礼盒图标 px（原 size={34}） */
    titleIconSize: 34,
    /** 「卡包开启」字号 px（原 text-4xl = 36） */
    titleFontSize: 36,
    /** 副标题（待打开卡包 ×N）字号 px（原 text-sm = 14） */
    subtitleFontSize: 14,
    /** 副标题与转盘之间的间距 px（原 mb-5 = 20） */
    subtitleMarginBottom: 20,

    // ══ ③ 滚动展示窗（老虎机转盘）═════════════════════════════════════
    /** 窗口圆角 px（原 rounded-xl = 12）· ⚠️ 窗口**宽高**在顶部 `WINDOW_W` / `CARD_H` */
    windowRadius: 12,
    /** 窗口描边 px（原 border = 1） */
    windowBorderWidth: 1,
    /** 中央黄色标记线宽 px（原 w-[3px] = 3） */
    markerWidth: 3,
    /** 左右两侧渐隐带宽度 px（原 w-28 = 112，左右共用） */
    fadeWidth: 112,
    /** 底部轨道条高 px（原 h-6 = 24） */
    trackHeight: 24,
    /** 轨道条顶边线 px（原 border-t = 1） */
    trackBorderWidth: 1,

    // ══ ④ 六边形格（滚动序列里每一格）═════════════════════════════════
    /** 六边形内侧深底内缩 px（原 inset-[3px] = 3）· ⚠️ 六边形**边长**在顶部 `HEX_SIZE` */
    hexInnerInset: 3,
    /** 六边形内图标与文字的间距 px（原 gap-1 = 4） */
    hexInnerGap: 4,
    /** 六边形内礼盒图标 px（原 size={32}） */
    hexIconSize: 32,
    /** 六边形内「武装 / 碎片」字号 px（原 text-[12px] = 12） */
    hexLabelFontSize: 12,

    // ══ ⑤ 中奖揭示与光环 ══════════════════════════════════════════════
    /** 定格后目标格上方「▲」字号 px（原 text-lg = 18） */
    revealMarkerFontSize: 18,
    /** 光环描边宽 px（原 style 里的 3px solid） */
    haloBorderWidth: 3,

    // ══ ⑥ 转盘下的提示语 ══════════════════════════════════════════════
    /** 「🎁 卡包开出的是奖励匣…」字号 px（原 text-xs = 12） */
    hintFontSize: 12,
    /** 该提示与转盘的间距 px（原 mt-3 = 12） */
    hintMarginTop: 12,
    /** 一键全开进度行字号 px（原 text-xs = 12） */
    bulkHintFontSize: 12,
    /** 该进度行与上一行的间距 px（原 mt-2 = 8） */
    bulkHintMarginTop: 8,

    // ══ ⑦ 底部按钮行 ══════════════════════════════════════════════════
    /** 按钮行最小高 px（原 min-h-[64px] = 64）—— 防止三种状态切换时面板跳动 */
    buttonRowMinHeight: 64,
    /** 行内按钮间距 px（原 gap-2.5 = 10） */
    buttonRowGap: 10,
    /** 按钮行与提示语的上间距 px（原 mt-1 = 4） */
    buttonRowMarginTop: 4,
    /** 「开启卡包！」左右内边距 px（原 px-12 = 48）· 与「开启中…」占位共用 */
    mainBtnPadX: 48,
    /** 该按钮上下内边距 px（原 py-3.5 = 14） */
    mainBtnPadY: 14,
    /** 该按钮圆角 px（原 rounded-xl = 12） */
    mainBtnRadius: 12,
    /** 该按钮字号 px（原 text-xl = 20） */
    mainBtnFontSize: 20,
    /** 「一键全开」左右内边距 px（原 px-7 = 28） */
    openAllBtnPadX: 28,
    /** 该按钮上下内边距 px（原 py-3.5 = 14） */
    openAllBtnPadY: 14,
    /** 该按钮圆角 px（原 rounded-xl = 12） */
    openAllBtnRadius: 12,
    /** 该按钮字号 px（原 text-lg = 18） */
    openAllBtnFontSize: 18,
    /** 结果态两个按钮左右内边距 px（原 px-6 = 24） */
    resultBtnPadX: 24,
    /** 结果态两个按钮上下内边距 px（原 py-3 = 12） */
    resultBtnPadY: 12,
    /** 结果态两个按钮圆角 px（原 rounded-xl = 12） */
    resultBtnRadius: 12,

    // ══ ⑧ 右上关闭 ════════════════════════════════════════════════════
    /** 距面板顶 px（原 top-4 = 16） */
    closeTop: 16,
    /** 距面板右 px（原 right-4 = 16） */
    closeRight: 16,
    /** 按钮内边距 px（原 p-2 = 8） */
    closePad: 8,
    /** ✕ 图标 px（原 size={20}） */
    closeIconSize: 20,
    /** [2026-10-21 程拍板] 「⏭ 跳过」按钮相对右上关闭按钮的**横向偏移** px（正的 = 往左挪，避免重叠） */
    skipBtnOffsetX: 50,
    /** 「⏭ 跳过」按钮字号 px（比正文小一档 —— 它是次要动作，不能抢「停止开包」的注意力） */
    skipBtnFontSize: 12,

    // ══ ⑨ 定格详情弹窗（portal 到 body 的全屏浮层）═════════════════════
    /** 弹窗宽 px（原 w-[520px]） */
    detailWidth: 520,
    /** 弹窗圆角 px（原 rounded-2xl = 16） */
    detailRadius: 16,
    /** 弹窗描边 px（原 border = 1） */
    detailBorderWidth: 1,
    /** 弹窗四周内边距 px（原 p-7 = 28） */
    detailPad: 28,
    /** 弹窗内各行间距 px（原 gap-3 = 12） */
    detailGap: 12,
    /** 「✨ 获得奖励匣 ✨」字号 px（原 text-lg = 18） */
    detailTitleFontSize: 18,
    /** 大六边形内侧深底内缩 px（原 inset-[3px] = 3）· ⚠️ 其**边长**在顶部 `BIG_HEX` */
    bigHexInnerInset: 3,
    /** 大六边形内图标与文字间距 px（原 gap-1.5 = 6） */
    bigHexInnerGap: 6,
    /** 大六边形内礼盒图标 px（原 size={46}） */
    bigHexIconSize: 46,
    /** 大六边形内「武装 / 碎片」字号 px（原 text-[13px] = 13） */
    bigHexLabelFontSize: 13,
    /** 匣子名（例：紫色·神格碎片匣）字号 px（原 text-xl = 20） */
    chestNameFontSize: 20,
    /** 品质 / 大类两个 chip 的间距 px（原 gap-1.5 = 6） */
    chipsGap: 6,
    /** chip 字号 px（原 text-xs = 12） */
    chipFontSize: 12,
    /** chip 左右内边距 px（原 px-2 = 8） */
    chipPadX: 8,
    /** chip 上下内边距 px（原 py-0.5 = 2） */
    chipPadY: 2,
    /** chip 圆角 px（原 rounded = 4） */
    chipRadius: 4,
    /** chip 描边 px（原 border = 1） */
    chipBorderWidth: 1,
    /** 开出内容预告（正文）字号 px（原 text-sm = 14） */
    descFontSize: 14,
    /** 「碎片每 N 片为一组…」字号 px（原 text-[11px] = 11） */
    shardNoteFontSize: 11,
    /** 该行与正文的间距 px（原 mt-1 = 4） */
    shardNoteMarginTop: 4,
    /** 「匣子已存入『待打开匣子』…」字号 px（原 text-[11px] = 11） */
    detailFootFontSize: 11,
    /** 该行上边距 px（原 -mt-1 = -4，负值把两行拉近） */
    detailFootMarginTop: -4,
    /** 弹窗内按钮行间距 px（原 gap-2.5 = 10） */
    detailBtnRowGap: 10,
    /** 按钮行与正文的间距 px（原 mt-2 = 8） */
    detailBtnRowMarginTop: 8,
    /** 弹窗内三个按钮左右内边距 px（原 px-5 = 20） */
    detailBtnPadX: 20,
    /** 弹窗内三个按钮上下内边距 px（原 py-2.5 = 10） */
    detailBtnPadY: 10,
    /** 弹窗内三个按钮圆角 px（原 rounded-xl = 12） */
    detailBtnRadius: 12,

    // ══ ⑩ 匣子档案卡浮窗（portal 到 body · 渲染在 `PackChestDossier.tsx`）═════════
    // ⚠️ 本段**除 `dossierMargin` 外**全是**逻辑尺寸**：浮窗 escape 到 body、外部按 `getGameScale()` 缩放，
    //    所以这些 px 与面板的 `panelScale` **无关**（面板在手机端放大 1.75，浮窗不跟着放大）。
    //    📌 **唯一例外 `dossierMargin`**：它直接和 `window.innerWidth/innerHeight` 比，是**屏幕 px**、
    //       代码里**不乘 `gs`**。（[2026-10-21 复核] 别"顺手统一"给它乘 gs —— 那会让手机端安全边距
    //       从 8 掉到约 5.8，浮窗反而更贴边。）
    // ⚠️ 浮窗内的尺寸**一个都不许散回 JSX**：`PackChestDossier` 通过 `ui` prop 读这块，
    //    那边没有一处硬编码 px（程调这张卡只改这里）。
    /** 浮窗逻辑宽 px（**本次新增元素**，取 420 —— 够放下 4 件武装名 + 插画） */
    dossierWidth: 420,
    /** 浮窗逻辑高**估算** px —— 仅作首帧钳制/箭头补偿的初值；挂载后按实际 `offsetHeight` 自动校正 */
    dossierHeight: 210,
    /** 浮窗圆角 px（观感对齐 `ArmamentPreview` 的 rounded-2xl，14 略收） */
    dossierRadius: 14,
    /** 浮窗描边 px（新增元素，原无） */
    dossierBorderWidth: 1,
    /** 品质色外发光半径 px（boxShadow `0 0 N color44`） */
    dossierGlowRadius: 26,
    /** 浮窗与触发格的水平间距 px（同 `KeywordPreview` 的 14） */
    dossierGap: 14,
    /** 视口安全边距 px（四周钳制共用；`KeywordPreview` 原为 12~14，这里收成一个数）
     *  ⚠️ 本项是**屏幕 px**（唯一例外），和 `window.innerWidth/innerHeight` 直接比较 ⇒ 不乘 `gs`。 */
    dossierMargin: 8,
    /** 箭头方块边长 px（rotate-45 后视觉对角线 ≈ 11） */
    dossierArrowSize: 8,
    /** 箭头描边 px */
    dossierArrowBorderWidth: 1,
    /** 退场淡出时长 ms（退场要快 ⇒ tween，不用 spring） */
    dossierExitMs: 140,
    /** 浮窗四周内边距 px（新增元素，原无） */
    dossierPad: 14,
    /** 匣子插画边长 px（对齐滚轮格的 HEX_SIZE 108 略收，让右栏有 284 宽写名字） */
    dossierArtSize: 96,
    /** 插画与右栏的间距 px（原 gap-3 = 12） */
    dossierArtGap: 12,
    /** 插画品质色外发光半径 px（原滚轮格的 drop-shadow 10） */
    dossierArtGlowRadius: 10,
    /** 插画加载失败时兜底礼盒图标 px（原 `hexIconSize` 是 32，这里略大 40） */
    dossierArtIconSize: 40,
    /** 专名（匣子插画名）字号 px（原 text-[15px] —— 新增元素） */
    dossierTitleFontSize: 15,
    /** 专名与右上品质图标的间距 px（原 gap-1.5 = 6） */
    dossierTitleGap: 6,
    /** 专名右上品质图标 px（`RarityIcon` 内部还会 +12 圆底 ⇒ 视觉 24）· 原 size={12} */
    dossierRarityIconSize: 12,
    /** chip 行与专名行的间距 px（原 mt-1.5 = 6） */
    dossierChipsMarginTop: 6,
    /** chip 字号 px（原 text-[11px] = 11） */
    dossierChipFontSize: 11,
    /** 品质色左竖条宽 px（新增元素，3 = 原 border-l-4 的收窄版） */
    dossierChipBarWidth: 3,
    /** chip 其余三边描边 px（原 border = 1） */
    dossierChipBorderWidth: 1,
    /** chip 左右内边距 px（原 px-1.5 = 6，取 7 让中文不贴边） */
    dossierChipPadX: 7,
    /** chip 上下内边距 px（原 py-0.5 = 2，取 1 压高度） */
    dossierChipPadY: 1,
    /** chip 圆角 px（原 rounded = 4） */
    dossierChipRadius: 4,
    /** 两个 chip 的间距 px（原 gap-1.5 = 6） */
    dossierChipGap: 6,
    /** 分隔线粗细 px（原 border-t = 1） */
    dossierDividerHeight: 1,
    /** 分隔线上下留白 px（原 my-2 = 8） */
    dossierDividerMargin: 8,
    /** 正文（产出预告）字号 px（原 text-xs = 12） */
    dossierDescFontSize: 12,
    /** 碎片匣副文案字号 px（原 text-[11px] = 11） */
    dossierSubNoteFontSize: 11,
    /** 副文案与正文的间距 px（原 mt-1 = 4） */
    dossierSubNoteMarginTop: 4,
    /** 名字列表与正文的间距 px（原 mt-1.5 = 6） */
    dossierNameMarginTop: 6,
    /** 名字之间的横/纵间距 px（原 gap-1.5 = 6 收成 4，一行尽量塞下 4 个名字） */
    dossierNameGap: 4,
    /** 「▪」与名字文字的间距 px（原 gap-1 = 4） */
    dossierNameBulletGap: 4,
    /** 名字字号 px（原 text-[11px] = 11） */
    dossierNameFontSize: 11,
    /** 「等 N 件」字号 px（原 text-[11px] = 11） */
    dossierMoreFontSize: 11,
    /** 「等 N 件」上间距 px（原 mt-1 = 4） */
    dossierMoreMarginTop: 4,
    /** 底部条与正文块的间距 px（原 mt-2.5 = 10） */
    dossierFootMarginTop: 10,
    /** 底部条上边线粗细 px（原 border-t = 1） */
    dossierFootBorderWidth: 1,
    /** 底部条上内边距 px（原 pt-2.5 = 10） */
    dossierFootPadTop: 10,
    /** 底部条字号 px（原 text-[11px] = 11） */
    dossierFootFontSize: 11,
    /** 底部条内三段文字的分组间距 px（原 gap-1.5 = 6） */
    dossierFootGap: 6,

    // ── ⑩-b 浮现时序（程 2026-10-21 拍板的四个数，注意单位是 ms）────────────
    /** 指针进入格子后多久浮现 ms（停留这么久才算"想看"） */
    dossierEnterDelayMs: 180,
    /** 已有浮窗时**换格**的浮现延迟 ms（比首次进入更短，换内容要跟手） */
    dossierSwitchDelayMs: 100,
    /** 离开格子后的收起延迟 ms（缓冲，防止抖动误关） */
    dossierLeaveDelayMs: 150,
    /** 鼠标彻底离开滚动窗口的**兜底**收起延迟 ms（`mouseout` 丢失时唯一收口） */
    dossierContainerLeaveDelayMs: 1000,
};

// ══════════════════════════════════════════════════════════════════════
// 🖥️ `PACK_OPEN_UI` PC 端差异项 —— 只列「与手机端不同」的项；未列出的项两端相同
// ──────────────────────────────────────────────────────────────────────
// 依据：`_scratch/reports/g5-rogue-modals.md` §2.2（双源交叉：git `4649ecbe` = 1 / `6115ca0e` = 1.75
//       + 注释「1 = 原样」）
// 改这里 = 改 PC 端观感；改上面 = 改手机端观感。
// ⚠️ 该旋钮只管**面板本体 + 定格详情弹窗**（同一个界面的两态）；`CARD_W` / `WINDOW_W` /
//    `HEX_SIZE` / `BIG_HEX` 等滚轮几何是**文件顶部独立裸常量**，不在本块、也不随之缩放。
// ══════════════════════════════════════════════════════════════════════
const PACK_OPEN_UI_PC_DIFF = {
    /** 【主旋钮】面板整体缩放（原值 1 = 原样 · 手机端 1.75） */
    panelScale: 1,
};

/** PC 端完整值 = 手机值为底 + PC 差异覆盖 */
const PACK_OPEN_UI_PC = { ...PACK_OPEN_UI_MOBILE, ...PACK_OPEN_UI_PC_DIFF };

/** 🖥️ PC / 📱 手机 —— 按运行平台自动二选一（平台判定在 `src/platform/tuning.ts`） */
export const PACK_OPEN_UI = pickTuning(PACK_OPEN_UI_PC, PACK_OPEN_UI_MOBILE);

/**
 * [2026-10-21 莉莉子] 调参区形状 —— 给 `PackChestDossier` 当 `ui` prop 的类型。
 * 为什么这么绕：浮窗是独立文件，若它 `import { PACK_OPEN_UI } from './PackOpenModal'`
 * 就成了**运行时循环依赖**（本文件也 import 它）⇒ 改成 type-only 传递，字段仍然只有这一处真源。
 */
export type PackOpenUi = typeof PACK_OPEN_UI;


interface PackOpenModalProps {
    isOpen: boolean;
    pendingPacks: number;
    /** 打开一个卡包 → 返回抽到的**匣子**（[2026-09-29] 原为返回武装 id） */
    onOpenPack: () => ChestInstance | null;
    onClose: () => void;
    /** 打开背包里的匣子（跳去待打开匣子列表 / 直接开） */
    onOpenChest?: () => void;
    /** [2026-10-21 莉莉子] 武装库存（用于判断"可能抽到的"池子与"已集齐转券"）；不传则视为全池可用。
     *  ⚠️ `BattleRewardModal` / `RunEndModal` 两个挂载点**不传** ⇒ 必须正常降级：
     *     视为全池、且**不显示**「已集齐 / 转券」那一行（不能凭空对玩家承诺）。 */
    armamentStock?: ArmStockMap;
}

// ── 滚轮几何（可调）──
// [2026-10-02 N1] 整体放大：窗口 640→1000 / 格宽 76→112 / 格高 138→176 / 六边形 68→108
const CARD_W = 112;       // 每格宽（六边形格子贴格排列）
const CARD_H = 176;       // 每格高（滚动窗口高）
const WINDOW_W = 1000;    // 可见窗口宽（约 8.9 格）
const HEX_SIZE = 108;     // 滚动格内六边形图标边长
const BIG_HEX = 150;      // 详情弹窗大图标边长
const INITIAL_SEQ_LEN = 41;       // 初始序列长度
const INITIAL_TARGET_INDEX = 34;  // 初始目标卡位置（仅用于待命展示，不被揭示）
const SEQ_TAIL = 6;               // 目标之后至少保留的尾巴格数（保证待命往复不露出空白）
const ROLL_CELLS = 20;            // 每次开启的冲刺跨格数（目标 = 当前位置前方 N 格）
const COMPACT_LIMIT = 260;        // 序列长度上限（超过则整表重建，防无限增长）

// ── 待命慢转参数 ──
const IDLE_MAX = 720;     // 待命往复带宽度（相对收起点/起点）
const IDLE_PERIOD = 10;   // 往复一个完整周期（秒）

// ── 冲刺参数 ──
const ROLL_DUR = 2.6;     // 冲刺减速时长
const REVEAL_DELAY = 1500; // 定格后停留展示（放大发光揭示）多久，再自动弹详情弹窗 (ms)

const HEXAGON = 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)'; // 对齐 Card.tsx EQUIPMENT_HEXAGON_CLIP 同款
const easeOutQuart = (t: number) => 1 - Math.pow(1 - t, 4);

/**
 * [2026-10-20 莉莉子 🎨] 插画兜底：图加载失败 ⇒ 隐藏 img，并把同一格里带 `data-art-fallback` 的 lucide 图标显形。
 * 兜底图标平时 `opacity-0` 垫在插画底下（插画是不透明方形整图，正常永远盖住它）。
 */
const hideBrokenChestArt = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    img.style.visibility = 'hidden';
    const fb = img.parentElement?.querySelector<HTMLElement>('[data-art-fallback]');
    if (fb) fb.style.opacity = '1';
};

type Phase = 'idle' | 'rolling' | 'result';

/** [2026-09-29] 匣子序列项 = 大类 + 品质（滚轮里滚的就是匣子） */
type ChestEntry = ChestInstance;

export const PackOpenModal: React.FC<PackOpenModalProps> = ({ isOpen, pendingPacks, onOpenPack, onClose, onOpenChest, armamentStock }) => {
    const [phase, setPhase] = useState<Phase>('idle');
    const [sequence, setSequence] = useState<ChestEntry[]>([]);
    const [targetIndex, setTargetIndex] = useState(INITIAL_TARGET_INDEX);
    const [result, setResult] = useState<ChestEntry | null>(null);
    const [detailOpen, setDetailOpen] = useState(false);

    /**
     * [2026-10-24 莉莉子 · 手机端「界面很大」修复] 面板**实测高度**，喂给 portal 版 contain 缩放。
     * ── 病根有两层：① 本组件 `createPortal(…, document.body)` ⇒ **在画布之外**，
     *    祖先 `scale(s)` 不生效，而此前用的 `pickCanvasInnerScale` 会**除 s** ⇒ 白放大 1/s（手机 ≈2.67 倍）；
     *    ② 即便公式对了，**只按宽度反解**也会把高度一起抬上去 ⇒ 竖着溢出。
     * ── 修法：`pickPortalContainScale`（不除 s，且宽高取小者）+ 实测本面板高度。
     * ── `useLayoutEffect` ⇒ 测量与修正都在**绘制前**完成，不会闪一下大窗；
     *    `ResizeObserver` 兜住阶段切换／资源加载带来的高度变化。
     */
    const panelRef = useRef<HTMLDivElement>(null);
    const [panelH, setPanelH] = useState(600); // 初值只是首帧占位，绘制前就会被实测值覆盖
    useLayoutEffect(() => {
        const el = panelRef.current;
        if (!el) return;
        const update = () => setPanelH(el.offsetHeight || 600);
        update();
        if (typeof ResizeObserver === 'undefined') return;
        const ro = new ResizeObserver(update);
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    // [2026-10-21 莉莉子 🎨] 匣子档案卡浮窗：位置**不进 state**
    //   （260 个 `motion.div`，每帧 setState 会 reconcile 整棵树 ⇒ 掉帧）
    //   ⇒ 只在「目标变化」时 `setDossier` 一次；跟随指针的移动一律走 ref + rAF 里的冻结。
    const [dossier, setDossier] = useState<PackChestDossierData | null>(null);

    const stripRef = useRef<HTMLDivElement | null>(null);
    // [2026-09-29] 滚轮素材 = 12 种匣子（2 大类 × 6 品质）
    const chestPoolRef = useRef<ChestEntry[]>(
        (['armament', 'shard'] as ChestKind[]).flatMap(kind =>
            CHEST_RARITY_ORDER.map(rarity => ({ kind, rarity }))),
    );
    const phaseRef = useRef<Phase>('idle');
    const sRef = useRef(0);        // 当前 strip 位移（px）
    const s0Ref = useRef(0);       // rolling 触发瞬间的起始位移
    const targetXRef = useRef(0);  // 本次 rolling 的终点位移（动态目标位）
    const phRef = useRef(0);       // idle 正弦相位
    const idleAnchorRef = useRef(0); // [2026-10-02 #8] 待命往复的锚点（收起点）—— 位移连续，不再瞬移
    const tRef = useRef(0);        // rolling 已播放时长
    const isOpenRef = useRef(false);
    const seqRef = useRef<ChestEntry[]>([]); // 序列镜像（供 handleOpen 同步读取，避免闭包读到旧值）

    // ── [2026-10-21 莉莉子 🎨] 匣子档案卡浮窗 · 交互状态 ──────────────────
    const dossierEnterTimer = useRef<number | null>(null);   // 进入 / 换格 的浮现延迟
    const dossierLeaveTimer = useRef<number | null>(null);   // 离开格子 / 离开窗口 的收起延迟
    const dossierShownIdxRef = useRef<number | null>(null);  // 已浮现的格子索引（同步读，去重用）
    const pendingIdxRef = useRef<number | null>(null);       // 等着浮现的格子索引（同步读，去重用）
    const dossierPinnedRef = useRef<boolean>(false);         // PC 点击钉住
    /** 悬停即冻结待命慢转（程 2026-10-21 拍板）——rAF 的 `idle` 分支只读这一个标记 */
    const dossierFrozenRef = useRef<boolean>(false);
    /** `detailOpen` 的同步镜像：容器的 hover 回调不是 effect，读 state 会读到旧值 */
    const detailOpenRef = useRef(false);
    detailOpenRef.current = detailOpen;

    const setPh = (p: Phase) => { phaseRef.current = p; setPhase(p); };

    const paint = (s: number) => {
        if (stripRef.current) stripRef.current.style.transform = `translate3d(${-Math.round(s)}px,0,0)`;
    };

    const randChest = (): ChestEntry => {
        const a = chestPoolRef.current;
        return a[Math.floor(Math.random() * a.length)];
    };

    /** 序列写入（state + 镜像一起更新，保证同步可读） */
    const applySequence = (next: ChestEntry[]) => { seqRef.current = next; setSequence(next); };

    /**
     * 保证序列至少 n 格（不足则**追加**随机格 —— 追加不会改变已有格子的内容与位移，
     * 这正是 #7「内容突变」的修法：不再整表重建）。
     */
    const ensureLength = (n: number) => {
        const cur = seqRef.current;
        if (cur.length >= n) return;
        const next = cur.slice();
        while (next.length < n) next.push(randChest());
        applySequence(next);
    };

    // ═══ [2026-10-21 莉莉子 🎨] 匣子档案卡浮窗 · 浮现 / 收起状态机 ═══════════
    // 为什么全部写成普通函数 + ref（不进 state、不进依赖数组）：
    //   这些回调挂在**滚动窗口容器**上，每帧都在跑；任何 setState 都会让 260 个 `motion.div` 重渲染。

    /** 清掉浮现 / 收起的所有定时器（phase 变化 / 关闭 / 卸载 都必须走这里） */
    const clearDossierTimers = () => {
        if (dossierEnterTimer.current !== null) { clearTimeout(dossierEnterTimer.current); dossierEnterTimer.current = null; }
        if (dossierLeaveTimer.current !== null) { clearTimeout(dossierLeaveTimer.current); dossierLeaveTimer.current = null; }
        pendingIdxRef.current = null;
    };

    /** 冻结标记同步：等着浮现 / 已浮现 / 已钉住 ⇒ 待命慢转暂停（格子不再从指针下滑走） */
    const syncDossierFrozen = () => {
        dossierFrozenRef.current = dossierShownIdxRef.current !== null
            || pendingIdxRef.current !== null
            || dossierPinnedRef.current;
    };

    /** 立即收起（**不动 rAF**：冻结标记归零后待命慢转自然恢复） */
    const hideDossier = () => {
        clearDossierTimers();
        dossierShownIdxRef.current = null;
        dossierPinnedRef.current = false;
        syncDossierFrozen();
        setDossier(null);
    };

    /** 事件目标 → 格子元素（容器级统一处理，**不给 260 个格子各挂一份监听**） */
    const chestCellOf = (target: EventTarget | null): HTMLElement | null => {
        const el = target as HTMLElement | null;
        if (!el || typeof el.closest !== 'function') return null;
        return el.closest('[data-chest-idx]') as HTMLElement | null;
    };

    /** 在指定格子上浮现档案卡（矩形在**冻结之后**取 ⇒ 与画面上的位置严格一致） */
    const showDossierAt = (idx: number, cell: HTMLElement, pin: boolean) => {
        if (phaseRef.current !== 'idle') return;        // 与 phase 竞争的最后一道闸
        const entry = seqRef.current[idx];
        if (!entry) return;
        dossierFrozenRef.current = true;                // 先冻结，再量坐标
        dossierShownIdxRef.current = idx;
        // [2026-10-21 独立审查 P2 修正] 浮现成功后必须清掉 pending：
        //   否则它一直等于当前 idx ⇒ `onChestGaze` 的首行去重与 `onChestGazeOut` 的"还没浮现就走了"
        //   两条判据都被永久骗住 ⇒ 移出再移回同格时不会重新浮现，而 150ms 收起定时器照旧到点执行
        //   ⇒ 浮窗自毁 + 解冻（鼠标明明还停在格子上，卡却没了）。
        pendingIdxRef.current = null;
        dossierPinnedRef.current = pin;
        syncDossierFrozen();
        setDossier({
            rect: cell.getBoundingClientRect(),
            // 自己监听 resize 时用它重新量：`getGameScale()` 只在渲染那刻取值、本身不监听 resize
            measure: () => (cell.isConnected ? cell.getBoundingClientRect() : null),
            kind: entry.kind,
            rarity: entry.rarity,
            pinned: pin,
        });
    };

    /**
     * 指针进入格子（PC = pointerover；触屏 = `touchGaze` 长按后**合成的 mouseover**，bubbles:true）。
     * ⚠️ 两个事件在 PC 上会**双双**触发 ⇒ 一律按 `data-chest-idx` 去重。
     *
     * ⚠️ 用 over / out（容器一层）而不是 `onPointerEnter` / `onMouseEnter`。
     *    📌 理由**只是**：over/out 在容器一层挂着就够用了，enter/leave 在这里不带来额外收益。
     *    🚫 **不要**把它写成性能优势 —— `react-dom` 对 `mouseover` / `pointerover` 的入口是
     *    **无条件**做祖先链深度对齐 + LCA 计算的（见 `react-dom-client.development.js` 里
     *    `"mouseover" === domEventName || "pointerover" === domEventName` 那个分支），
     *    这笔账由**事件本身**触发，跟绑不绑 enter/leave 无关；本文件十几行之下还绑着
     *    `onMouseLeave`（离开窗口兜底），照样在付。
     *
     *    （[2026-10-21 独立审查 · 连修两轮] 初版理由"直接事件 ⇒ 每格注册原生监听"与 react-dom 不符；
     *      二版理由"换 over 可省祖先链计算"同样被否证。**结论没变，但这两个理由都不能再写。**）
     */
    const onChestGaze = (e: React.PointerEvent<HTMLDivElement> | React.MouseEvent<HTMLDivElement>) => {
        // ① 硬禁：rolling / result / 详情打开 ⇒ 不响应任何 hover（幽灵浮窗都是漏了这条）
        if (phaseRef.current !== 'idle' || detailOpenRef.current) return;
        // ② 钉住期间浮窗常驻，悬停不改内容（取消钉住走点同格 / 点空白 / ESC / phase 变化）
        if (dossierPinnedRef.current) return;
        const cell = chestCellOf(e.target);
        if (!cell) return;
        const idx = Number(cell.dataset.chestIdx);
        if (!Number.isFinite(idx)) return;
        // ③ 去重：同一格重复命中直接返回（PC 上 pointerover + mouseover 成对出现）
        if (pendingIdxRef.current === idx) return;
        if (dossierShownIdxRef.current === idx) { clearDossierTimers(); syncDossierFrozen(); return; }
        // ④ 进/换格：先清上一轮的定时器，再**立刻冻结**（否则延迟内格子已经滑走半格）
        clearDossierTimers();
        pendingIdxRef.current = idx;
        syncDossierFrozen();
        const isSwap = dossierShownIdxRef.current !== null;
        // 触屏上由长按触发 ⇒ `gazeEnterDelay` 自动归零；PC 上首次 180ms、换格 100ms
        const delay = gazeEnterDelay(Number(isSwap ? PACK_OPEN_UI.dossierSwitchDelayMs : PACK_OPEN_UI.dossierEnterDelayMs));
        dossierEnterTimer.current = window.setTimeout(() => {
            dossierEnterTimer.current = null;
            showDossierAt(idx, cell, false);
        }, delay);
    };

    /** 指针离开格子（未离开容器时由 over 通路接管换格，这里只处理"真的空了"） */
    const onChestGazeOut = (e: React.PointerEvent<HTMLDivElement> | React.MouseEvent<HTMLDivElement>) => {
        if (dossierPinnedRef.current) return;
        const to = e.relatedTarget as HTMLElement | null;
        const toCell = to && typeof to.closest === 'function' ? to.closest('[data-chest-idx]') : null;
        if (toCell) return;                             // 移到另一格：交给 over 通路原地换文本
        if (dossierEnterTimer.current !== null) {       // 还没浮现就走了 ⇒ 连冻结一起撤
            clearTimeout(dossierEnterTimer.current); dossierEnterTimer.current = null; pendingIdxRef.current = null;
        }
        syncDossierFrozen();
        if (dossierShownIdxRef.current === null) return;      // 本来就没显示
        if (dossierLeaveTimer.current !== null) return;       // 已有收起延迟在跑
        dossierLeaveTimer.current = window.setTimeout(() => {
            dossierLeaveTimer.current = null;
            hideDossier();
        }, Number(PACK_OPEN_UI.dossierLeaveDelayMs));
    };

    /**
     * 兜底：鼠标彻底离开滚动窗口。
     * ⚠️ 只有「离开格子的 150ms 没在跑」时才启动 1000ms —— 否则正常退出要等 1 秒才收，手感像卡住。
     */
    const onChestWindowLeave = () => {
        if (dossierPinnedRef.current) return;
        if (dossierLeaveTimer.current !== null) return;   // 150ms 已在跑 ⇒ 交给它
        if (dossierShownIdxRef.current === null) { clearDossierTimers(); syncDossierFrozen(); return; }
        dossierLeaveTimer.current = window.setTimeout(() => {
            dossierLeaveTimer.current = null;
            hideDossier();
        }, Number(PACK_OPEN_UI.dossierContainerLeaveDelayMs));
    };

    /**
     * PC：点格子 = 钉住常驻（点同一格 = 取消钉住）。
     *
     * [2026-10-21 独立审查 P1 修正] 🔴 **触屏只认长按**（程拍板口径：「点按不算」）：
     *   长按经 `touchGaze.ts` 合成 `mouseover{relatedTarget}` 走 `onChestGazeOver` 那条通路；
     *   而普通轻点会直接落成这里的 `click`。若不在这里拦，手机轻点一下就会 `pin=true`
     *   ⇒ 浮窗常驻 + 冻结转盘；更糟的是 pinned 之后 `onChestGazeOut` 首行就早退 ⇒ **抬手也不收**，
     *   玩家看到的是"点一下就卡住的转盘"。
     *   ⚠️ 别指望 `TouchFeedbackLayer` 拦：它只在**长按**（或显式申请）时才吞掉那发 click。
     */
    const onChestWindowClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if (isTouchInput()) return;                    // 触屏：点按不钉住（长按走 over 通路）
        if (phaseRef.current !== 'idle' || detailOpenRef.current) return;
        const cell = chestCellOf(e.target);
        if (!cell) { if (dossierPinnedRef.current) hideDossier(); return; }
        const idx = Number(cell.dataset.chestIdx);
        if (!Number.isFinite(idx)) return;
        if (dossierPinnedRef.current && dossierShownIdxRef.current === idx) { hideDossier(); return; }
        clearDossierTimers();
        showDossierAt(idx, cell, true);
        // 别让这一发 click 冒到 window 的「点空白取消钉住」监听上（否则钉住那一瞬间就被取消）
        e.stopPropagation();
    };

    // isOpen：重建序列 + 启动 rAF 主循环
    useEffect(() => {
        if (!isOpen) {
            // [2026-10-21 审查 P1 修复] **关窗也要收干净浮层状态**。
            //   汇总窗渲染在 `{isOpen && ...}` **之外**（那个 `key="bulk-summary"` 的节点与主弹窗并列），
            //   所以 `summaryOpen` 若只"开窗时清"、关窗不清 ⇒ 主弹窗关掉后
            //   **汇总窗会变成孤儿浮层一直盖在游戏画面上**；而且此时再按 ESC，
            //   关掉的会是背后那个已经关闭的面板（错层交互）。
            setSummaryOpen(false);
            setBulkList([]);
            return;
        }
        isOpenRef.current = true;
        sRef.current = 0; phRef.current = 0; tRef.current = 0; idleAnchorRef.current = 0;
        const fresh: ChestEntry[] = [];
        for (let i = 0; i < INITIAL_SEQ_LEN; i++) fresh.push(randChest());
        applySequence(fresh);
        setTargetIndex(INITIAL_TARGET_INDEX);
        setPh('idle');
        setResult(null);
        setDetailOpen(false);
        // [2026-10-21 P0-② 修复] 批量状态**必须一起复位**。
        //   原来只清 phase / result / detailOpen，漏了 bulk* 一族 ⇒ 中途关闭再打开时：
        //     ① 进度行照旧渲染「⚡ 一键开启中… k/N」，而「⚡ 一键全开」按钮也在 ⇒ **自相矛盾的 UI**
        //     ② 若关闭恰好发生在队列刚空（summaryOpen 已置 true）那一刻，
        //        **下次打开时才弹出上一批的汇总窗**（迟到一整轮的窗）
        //   （setBulkTotal 等 setter 声明在本行之下，但这里只是在 effect 回调内引用、渲染后才执行，无 TDZ）
        setBulkTotal(0);
        setBulkDone(0);
        setBulkList([]);
        setSummaryOpen(false);
        bulkModeRef.current = false;
        bulkQueueTimerRef.current = null;   // 定时器本体由下面 cleanup 清，这里只清引用
        rollSpeedRef.current = 1;           // [2026-10-21 审查 P3] 批量加速倍率也复位（幽灵值隐患，虽靠 handleOpen 自愈）
        let raf = 0;
        let last = performance.now();
        const tick = (ts: number) => {
            if (!isOpenRef.current) return;
            const dt = Math.min(0.05, (ts - last) / 1000);
            last = ts;
            const st = phaseRef.current;
            if (st === 'idle') {
                // [2026-10-21 莉莉子 🎨] 悬停即冻结待命慢转（程拍板）：浮窗显示中 / 等着浮现时不推进相位。
                //   🔴 **只 return，绝不 cancelAnimationFrame** —— 见下面 :381 的注释：定格后必须续帧保活，
                //   否则「收起回 idle / 再开一个」时 rAF 已死、第二次永远停在 ROLLING。
                if (dossierFrozenRef.current) { raf = requestAnimationFrame(tick); return; }
                // [2026-10-02 #8] 以 idleAnchor 为锚往复：收起瞬间 ph=0 ⇒ s 与收起点完全相等，无跳变
                phRef.current += dt * (Math.PI * 2 / IDLE_PERIOD);
                const s = idleAnchorRef.current + (IDLE_MAX / 2) * (1 - Math.cos(phRef.current));
                sRef.current = s; paint(s);
                raf = requestAnimationFrame(tick);
            } else if (st === 'rolling') {
                tRef.current += dt * rollSpeedRef.current; // [2026-10-04] 一键全开时倍率 >1 ⇒ 滚得更快
                const p = tRef.current / ROLL_DUR;
                const TX = targetXRef.current;
                if (p >= 1) {
                    sRef.current = TX; paint(TX);
                    setPh('result');
                    raf = requestAnimationFrame(tick); // [2026-09-07 修复] 定格后必须续帧保活循环——否则「收起回 idle / 再开一个」时 rAF 已死,第二次永远停在 ROLLING/不弹
                    return;
                }
                const e = easeOutQuart(Math.min(1, p));
                const s = s0Ref.current + (TX - s0Ref.current) * e;
                sRef.current = s; paint(s);
                raf = requestAnimationFrame(tick);
            } else if (st === 'result') {
                // 定格展示：不移动，但保持循环存活 → 「收起」回 idle 时无缝续转
                raf = requestAnimationFrame(tick);
            }
        };
        raf = requestAnimationFrame(tick);
        return () => {
            isOpenRef.current = false;
            cancelAnimationFrame(raf);
            // [2026-10-21 P0-③ 修复] 关窗必须把批量排队定时器一起收掉：
            //   否则它到点仍会 `startRoll` + `setPh('rolling')`，而 rAF 已经停了
            //   ⇒ 组件卡在幽灵 rolling（`tRef` 再无人推进），直到下次打开才被复位。
            if (bulkQueueTimerRef.current !== null) {
                clearTimeout(bulkQueueTimerRef.current);
                bulkQueueTimerRef.current = null;
            }
        };
        // 🔎 [2026-10-21 审查 P3] 这里原本有一条 `eslint-disable-next-line`，已被 ESLint 判为 unused
        //   （本 effect 消费的都是 ref 与稳定的 setter ⇒ 依赖数组本就完整）⇒ 删掉，让 `npm run lint` 能过。
    }, [isOpen]);

    // result → 延迟自动弹详情弹窗
    useEffect(() => {
        if (phase !== 'result') { setDetailOpen(false); return; }
        // ==========================================
        // [2026-10-21 BUG 修复] 「汇总窗弹出后，最后一发的详情弹窗还会冒出来盖在它上面」
        //
        // 🐛 病根：上一版判据是 `bulkBusyRef.current`（= `bulkDone < bulkTotal`）——
        //   它**绑的是"当前这一发播没播完"，不是"这一轮是不是批量"**。
        //   而 `finishBulk()` 会把 `bulkDone` 拉满让 `bulkBusy` 转 false，**但 `phase` 仍是 'result'**。
        //   ⇒ 这个 effect 只在 `phase` 变化时评估，于是"到底弹不弹"取决于那一刻的时序：
        //     正常连播时 busy 一直是 true（不弹），可一旦收尾把 busy 拉成 false 的那一帧
        //     又赶上任何一次 result 态重入，1.5s 后详情窗（z-1500）就会压在汇总窗（z-1400）上面。
        //
        // ✅ 修法（三重）：
        //   ① 判据换成 **`bulkTotalRef > 0`** —— 语义是"这一轮是批量开的"，一旦成立就**整轮不自动弹**
        //      （批量结果由汇总窗统一呈现；详情仍可手动点「🔍 查看详情」看）
        //   ② `summaryOpen` 纳入依赖：汇总窗一开就强制收详情，并清掉在跑的 1500ms 定时器
        //      （依赖变化会先跑上一次的 cleanup ⇒ 定时器不会漏）
        //   ③ 渲染处再加 `!summaryOpen` 守卫（见详情弹窗的 JSX），双保险
        // ==========================================
        if (bulkTotalRef.current > 0) { setDetailOpen(false); return; }
        if (summaryOpenRef.current) { setDetailOpen(false); return; }
        const t = window.setTimeout(() => { detailTimerRef.current = null; setDetailOpen(true); }, REVEAL_DELAY);
        detailTimerRef.current = t;
        return () => {
            if (detailTimerRef.current !== null) { clearTimeout(detailTimerRef.current); detailTimerRef.current = null; }
        };
    }, [phase]);

    // [2026-10-02 #15] ESC：详情开着先收详情，否则关弹窗（rolling 中不响应，与其余入口一致）
    // [2026-10-21 P0-①] 批量连播中：ESC 也要**先给结果**（否则整批汇总就永久丢了）
    useEffect(() => {
        if (!isOpen) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== 'Escape') return; eventBus.emit(GameEvents.UI_BACK);
            if (detailOpen) { e.stopImmediatePropagation(); setDetailOpen(false); return; }
            if (phaseRef.current === 'rolling') {
                // 🔴 [2026-10-21 审查 P0 修复] 这里必须**吞掉**这一发，不能只 return。
                //   原来只 return（不阻止传播）⇒ 同一个 keydown 继续交给父层 `EvaluationPanel` 的
                //   window capture 监听（那边 `if (packOpen) setPackOpen(false)`）
                //   ⇒ 批量 **rolling 期间**按 ESC / 安卓返回键（合成 Escape）会**直接把整个弹窗关掉，
                //   整批汇总永久丢** —— 与 P0-① 的验收目标正面冲突。
                //   ⚠️ rolling 占每一发一半以上的时长，非常容易踩到。
                e.stopImmediatePropagation();
                return;
            }
            e.stopImmediatePropagation();
            if (bulkBusyRef.current) {
                // 与「⏹ 停止开包」同一收口：不再抽 → 退出批量 → 弹汇总（只含已播的）
                if (bulkQueueTimerRef.current !== null) { clearTimeout(bulkQueueTimerRef.current); bulkQueueTimerRef.current = null; }
                bulkModeRef.current = false;
                setDetailOpen(false);
                setBulkDone(bulkTotalRef.current);
                setSummaryOpen(true);
                return;
            }
            onClose();
        };
        window.addEventListener('keydown', onKey, { capture: true });
        return () => window.removeEventListener('keydown', onKey, { capture: true });
        // ⚠️ 这里读 ref 而不是 `bulkBusy`/`bulkTotal`：一是它们声明在本 effect 之下（进依赖数组会踩 TDZ），
        //    二是 ref 每次触发时都是最新值，比重建监听更省。
    }, [isOpen, detailOpen, onClose]);

    // ── [2026-10-21 莉莉子 🎨] 浮窗的**强制隐藏**：漏一条就是幽灵浮窗 ──
    // 覆盖：① phase 离开 idle（含 rolling 与 result —— result 后 1.5s 会自动弹详情，浮窗必须让位）
    //       ② 定格详情弹窗打开  ③ 弹窗关闭(isOpen=false)
    useEffect(() => {
        if (!isOpen || phase !== 'idle' || detailOpen) hideDossier();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, phase, detailOpen]);

    // 卸载：清掉所有定时器（此路径**禁止 setState**，只清计时器与冻结标记）
    useEffect(() => () => {
        if (dossierEnterTimer.current !== null) clearTimeout(dossierEnterTimer.current);
        if (dossierLeaveTimer.current !== null) clearTimeout(dossierLeaveTimer.current);
        dossierEnterTimer.current = null;
        dossierLeaveTimer.current = null;
        dossierFrozenRef.current = false;
    }, []);

    // 钉住状态：点空白处 ⇒ 取消钉住（点格子那一发已在 onChestWindowClick 里 stopPropagation）
    useEffect(() => {
        if (!dossier?.pinned) return;
        const onDocClick = () => hideDossier();
        window.addEventListener('click', onDocClick);
        return () => window.removeEventListener('click', onDocClick);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [dossier?.pinned]);

    // ═══ [2026-10-04 程拍板 · 重做] 一键全开 ═══════════════════════════
    //   ❌ 上一版的两个错（程实测反馈）：
    //     ① **演出中断**：直接 `setPh('result')` ⇒ 跳过 `rolling`，而滚动是 rAF 主循环在
    //        `st === 'rolling'` 分支里驱动的（滚到 `p>=1` 才转 result）⇒ 滚轮根本不动
    //     ② **只见一次结果**：把"批量抽干"与"逐个展示"做成了两件脱钩的事
    //   ✅ 现在的做法：**先一次性抽干入队**（`openPack` 用同步 ref 先判后扣，连调安全），
    //      然后让**每一发都走完整的「startRoll → rAF 滚动 → result」**；
    //      定格停 SETTLE_MS 让玩家看清结果，再自动接下一个；队列空 ⇒ 出汇总。
    /**
     * [2026-10-21 程拍板 · **架构改造**] 是否处于「批量连播中」。
     *
     * 🔄 这一行原来是「预抽队列」`queueRef` —— 一次性把 N 个包全抽干、再逐个回放。
     *   程指出那样**「停止」根本不可能真正中止**：包在点"一键全开"那一刻就已经被消耗掉了，
     *   剩下的只存在于内存队列里，玩家停下也拿不回来。
     * ⇒ 改成**边播边抽**：每发播完才抽下一个。于是
     *   ·「停止开包」= 不再抽 ⇒ 剩下的包**原封不动**留在 `pendingPacks`
     *   ·「跳过」   = 把剩余的快速抽完 ⇒ 一起汇总
     */
    const bulkModeRef = useRef(false);
    // [2026-10-04 程拍板 · 方案B] 一键全开时**加速滚动**（单开恒为 1）：
    //   滚动进度由 rAF 里的 `tRef` 累积驱动，乘一个倍率即可提速 ——
    //   不必动 `ROLL_DUR` 那个常量（它是单开的基准，改了会连单开一起变）。
    const rollSpeedRef = useRef(1);
    const ROLL_SPEED_BULK = 2.5;   // 一键时的滚动倍率（≈ 单发 0.6s 滚完）
    const [bulkTotal, setBulkTotal] = useState(0); // 本次一键总数（0 = 非批量）
    const [bulkDone, setBulkDone] = useState(0);   // 已播完几发（进度/汇总用）
    // [2026-10-04 程拍板] 本次一键的**完整结果** —— 全部播完后单开一个窗展示（不再"只有最后一次有弹窗"）
    const [bulkList, setBulkList] = useState<ChestEntry[]>([]);
    const [summaryOpen, setSummaryOpen] = useState(false);
    /**
     * [2026-10-21 P0-③ 修复] 批量排队的 `setTimeout` id。
     * 病根：那个定时器原本只由「phase / bulkTotal 变化」那条 effect 的 cleanup 收走，
     *   而**关窗并不改这两个值** ⇒ 关窗后它照样到点执行 `startRoll` + `setPh('rolling')`，
     *   但 rAF 主循环已随 `isOpen=false` 被 `cancelAnimationFrame` ⇒ 没有任何东西再推进 `tRef`
     *   ⇒ 组件卡在**幽灵 rolling**，直到下次打开才被复位。
     * ⇒ 收进 ref，在关窗 cleanup 里一并清。
     */
    const bulkQueueTimerRef = useRef<number | null>(null);
    /** [2026-10-21 P0-①] `bulkBusy` / `bulkTotal` 的 ref 镜像：
     *  上面的 ESC effect 需要读它们，但二者声明在下面（进依赖数组会踩 TDZ）⇒ 用 ref 兜住。 */
    const bulkBusyRef = useRef(false);
    const bulkTotalRef = useRef(0);
    /** [2026-10-21 BUG 修复] 汇总窗是否开着 + 详情自动弹的定时器句柄。
     *  二者都必须用 ref：详情 effect 声明在 `summaryOpen` state **之前**，把它写进依赖数组会踩 TDZ
     *  （同一类坑本轮已经踩过一次：`bulkBusy` 进依赖 ⇒ TS2448）。 */
    const summaryOpenRef = useRef(false);
    const detailTimerRef = useRef<number | null>(null);

    /** 只负责「让滚轮滚到这一枚」（不含抽包）—— 从原 handleOpen 拆出，供「一键全开」逐步复用 */
    const startRoll = (pick: ChestEntry) => {
        const prev = seqRef.current;
        const startIdx = Math.ceil(sRef.current / CARD_W);
        let target = Math.max(prev.length, startIdx + ROLL_CELLS);

        if (target + 1 + SEQ_TAIL > COMPACT_LIMIT) {
            // 兜底：滚了太多次 → 整表重建 + 位移归零（允许一次跳变，正常情况下十几次才会走到）
            target = INITIAL_TARGET_INDEX;
            const fresh: ChestEntry[] = [];
            for (let i = 0; i < INITIAL_SEQ_LEN; i++) fresh.push(randChest());
            fresh[target] = pick;
            applySequence(fresh);
            sRef.current = 0;
            idleAnchorRef.current = 0;
        } else {
            // 正路：**追加**到尾部（可见格内容不变 ⇒ 无突变），目标落在新格上
            const next = prev.slice();
            while (next.length < target + 1 + SEQ_TAIL) next.push(randChest());
            next[target] = pick;
            applySequence(next);
        }

        // [2026-10-02 #2-new] 终点按**动态目标位**算 —— 起点永远在终点之前，位移差 > 0 ⇒ 一定会转
        targetXRef.current = target * CARD_W + CARD_W / 2 - WINDOW_W / 2;
        s0Ref.current = sRef.current;
        tRef.current = 0;
        setTargetIndex(target);
        setResult(pick);
        setDetailOpen(false);
        setPh('rolling');
    };

    /** 点开启 / 再开一个：抽一个匣子（入库）→ 交给 startRoll 滚过去 */
    const handleOpen = () => {
        if (phaseRef.current === 'rolling') return;
        rollSpeedRef.current = 1;     // [2026-10-04] 单开：标准速度
        bulkModeRef.current = false;   // 单开：退出批量模式
        setBulkTotal(0);
        setBulkDone(0);
        const pick = onOpenPack?.();
        if (!pick) return;
        // [2026-10-14 莉莉子 🖱️交互层革新] 开卡包音效（单抽）—— 放在**拿到结果之后**：
        //   若放在 onOpenPack 之前，"没包可开"（返回 null）时也会空响一声。
        eventBus.emit(GameEvents.GACHA_START_SINGLE);
        startRoll(pick);
    };

    /** 抽**下一发**并开始滚（批量专用）。返回 null 说明真的没包了 ⇒ 收尾出汇总。 */
    const openNextInBulk = () => {
        const pick = onOpenPack?.();
        if (!pick) { finishBulk(); return; }
        startRoll(pick);
    };

    /** 收尾：退出批量模式 + 弹出汇总（**只含已经播过演出的那些**） */
    const finishBulk = () => {
        bulkModeRef.current = false;
        rollSpeedRef.current = 1;
        // [2026-10-21 BUG 修复] 三件事一起做，防止"迟到的详情窗压在汇总窗上"：
        //   ① 把在跑的 1500ms 详情定时器清掉（否则它到点还会 setDetailOpen(true)）
        //   ② 同步置位 summaryOpenRef（不等下一帧渲染），让详情 effect 立刻看到"汇总已开"
        //   ③ 直接收掉可能已经弹出的详情窗
        if (detailTimerRef.current !== null) { clearTimeout(detailTimerRef.current); detailTimerRef.current = null; }
        summaryOpenRef.current = true;
        setDetailOpen(false);
        setBulkDone(bulkTotalRef.current);   // 拉满 ⇒ `bulkBusy` 转 false、按钮回落成「收起/完成」
        setSummaryOpen(true);
    };

    /**
     * ⚡ 一键全开 —— [2026-10-21 程拍板 · **架构改造：边播边抽**]
     *
     * 🔄 原来：`for (i<200) openPack()` 一次把包**全部抽干**再逐个回放。
     *   程指出那样「停止」根本不可能真中止 —— 包在点下去那一刻就被消耗光了，剩下只存在于内存队列。
     * ✅ 现在：只抽**第一个**，之后每播完一发才抽下一个（见下面的批量 effect）。于是
     *   ·「停止开包」= 不再抽 ⇒ 剩下的包**原封不动**留在 `pendingPacks` 里
     *   ·「跳过」   = 把剩余的快速抽完 ⇒ 一起汇总
     */
    const handleOpenAll = () => {
        if (phaseRef.current === 'rolling') return;
        const first = onOpenPack?.();
        if (!first) return;                          // 一个包都没有
        eventBus.emit(GameEvents.GACHA_START_TEN);   // 一键全开音效（整批只响这一声）
        rollSpeedRef.current = ROLL_SPEED_BULK;      // 一键：加速滚动
        bulkModeRef.current = true;
        setBulkList([]);                             // 结果从零累积：播完一发记一发
        setSummaryOpen(false);
        setBulkTotal(pendingPacks);                  // 计划开几个（进度行用）
        setBulkDone(0);
        startRoll(first);
    };

    // 每一发定格（phase→result）后：记进汇总 → 停一拍 → 抽下一发；没包了自动收尾
    useEffect(() => {
        if (phase !== 'result') return;
        if (bulkTotalRef.current <= 0) return;               // 非批量（单开）
        // ① [2026-10-21 审查 P1 修复] **先记账，再判断要不要继续**。
        //   「停止开包」在 rolling 期会把在途那一发就地送到 result，而它的包**已经抽掉了**
        //   （边播边抽 = 先抽后演）；若把记账放在 `bulkModeRef` 判断之后，它就会被永久丢掉
        //   ⇒ 汇总少一条 + 进度行说"其余 1 个未开启"的假话。
        if (result) setBulkList(prev => [...prev, result]);
        // ② 已停止 / 已跳过 ⇒ 只记账，不再抽下一发
        if (!bulkModeRef.current) return;
        // ③ 继续抽下一发
        const t = window.setTimeout(() => {
            bulkQueueTimerRef.current = null;
            setBulkDone(d => d + 1);
            openNextInBulk();                                // 抽下一发；没包了会自动 finishBulk()
        }, 900);                                            // 定格停留：让玩家看清这一发的结果
        bulkQueueTimerRef.current = t;
        return () => { clearTimeout(t); bulkQueueTimerRef.current = null; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [phase]);

    /** [2026-10-02 #8] 回到待命：以**当前位移**为锚继续慢转（不再重置到绝对位移 360） */
    const backToIdle = () => {
        bulkModeRef.current = false;   // 回待命：退出批量模式
        setBulkTotal(0);
        setBulkDone(0);
        const anchor = sRef.current;
        idleAnchorRef.current = anchor;
        phRef.current = 0;
        // 待命往复要往前多走 IDLE_MAX，保证尾巴够长不露白
        ensureLength(Math.ceil((anchor + IDLE_MAX + WINDOW_W) / CARD_W) + 1);
        setDetailOpen(false);
        setPh('idle');
    };

    /**
     * [2026-10-21 P0-① 修复] 是否正处于「批量连播中」（已开抽、还没播完）。
     *
     * 为什么需要这个判据：批量播放途中，玩家点「收起」/ X / 点背景 / ESC，
     * 会走 `backToIdle()` 或 `onClose()` —— 而 `backToIdle()` 会把 `bulkTotal` 清成 0，
     * 汇总窗的触发条件（`bulkDone >= bulkTotal`）**从此永不成立** ⇒ 本批结果**永远看不到**
     * （物品其实已入账，丢的只是展示）。而程 2026-10-04 的拍板是"全部开完必须汇总"，
     * 这条拍板正因为这个入口而形同虚设。
     */
    const bulkBusy = bulkTotal > 0 && bulkDone < bulkTotal;
    // 渲染期同步进 ref，供上面的 ESC / 详情 effect 读（effect 回调在渲染后执行 ⇒ 读到的一定是本次渲染的新值）
    bulkBusyRef.current = bulkBusy;
    bulkTotalRef.current = bulkTotal;
    summaryOpenRef.current = summaryOpen;

    /**
     * 【⏹ 停止开包】—— 程拍板：这是**中止**，不是"跳过演出"。
     *
     * 语义：不再抽下一个包 ⇒ 剩下的包**原封不动**留在 `pendingPacks`（未开启、未消耗）。
     * 汇总窗只会有**已经播过演出**的那些结果。
     *
     * ⚠️ [2026-10-21 审查 P1 修复] 若此刻正有一发在**滚动中**，必须把它就地送到 `result` 态：
     *   ① 否则画面停在半路滚轮上，而 `rolling` 期底部只有"开启中…"占位（没有停止/收起可点）
     *   ② 更要命的是那一发的包**已经抽掉了**（"边播边抽"是先抽后演）—— 不送进 result，
     *      下面的记账 effect 就不会执行 ⇒ 汇总**少一条**，而进度行还会说"其余 1 个未开启"（假话）
     */
    const stopBulk = () => {
        if (bulkQueueTimerRef.current !== null) {
            clearTimeout(bulkQueueTimerRef.current);
            bulkQueueTimerRef.current = null;
        }
        setDetailOpen(false);                         // 详情窗若正开着先收起，否则会和汇总窗叠两层
        if (phaseRef.current === 'rolling') setPh('result');   // 在途那发就地定格（result 已由 startRoll 设好）
        finishBulk();
    };

    /**
     * 【⏭ 跳过】—— 不想看演出了：把**剩下的包也全部抽掉**，一起进汇总。
     *
     * 与「停止开包」的唯一区别：**跳过会把剩余的包开掉**（消耗掉），停止不会。
     * 抽干用同步循环是安全的：`openPack` 有 `pendingPacksRef` 同步锁（先判后扣），连调不会重复扣。
     */
    const skipRest = () => {
        if (bulkQueueTimerRef.current !== null) {
            clearTimeout(bulkQueueTimerRef.current);
            bulkQueueTimerRef.current = null;
        }
        setDetailOpen(false);
        const drained: ChestEntry[] = [];
        for (let i = 0; i < 200; i++) {
            const pick = onOpenPack?.();
            if (!pick) break;
            drained.push(pick);
        }
        if (drained.length) setBulkList(prev => [...prev, ...drained]);
        finishBulk();
    };

    const resultMeta = result ? RARITY_META[result.rarity] : undefined;
    const canOpen = pendingPacks > 0;
    const gameScale = getGameScale(); // [2026-10-02 #4] 主面板与详情弹窗统一按此补偿

    /** 匣子显示名 = **专名**（例：高风险尘白样本封存舱）· 品质/类别由各自 chip 与汇总窗单独呈现
     *  [2026-10-20 莉莉子 🎨] 两处调用（结果页名称 :766 / 批量汇总 name :824）随本函数同生效 */
    const chestName = (c: ChestEntry): string => getChestArtName(c.kind, c.rarity);

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    key="pack-open-root"
                    className="fixed inset-0 z-[1200] flex items-center justify-center font-sans select-none"
                >
                    {/* 全屏遮罩：滚动中不响应点击关闭 */}
                    <motion.div
                        className="absolute inset-0 bg-black/85 backdrop-blur-md"
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        onClick={() => {
                            if (phase === 'rolling') return;
                            eventBus.emit(GameEvents.UI_BACK);
                            // [2026-10-21 P0-①] 批量中先给结果 —— 一次手滑点背景不该让整批汇总永久消失
                            if (bulkBusy) stopBulk(); else onClose();
                        }}
                    />
                    {/* [2026-10-02 #4] 面板整体缩放 —— 与详情弹窗、开匣弹窗统一
                        🔴 [2026-10-21 手机实测修复] 原写法 `scale(gameScale * panelScale)` 是**双重缩放**：
                           本面板在 `ScaleWrapper` 内，祖先已经 `scale(s)`，而 `gameScale` 就是同一个 s
                           ⇒ 实际是 s²。PC 上 s≈1 看不出来，手机上 s≈0.23 ⇒ 面板被压到 1/18（只剩 111px 宽、字 3px）。
                           ⇒ 手机端改用 `pickCanvasInnerScale`（按"占屏 94%"反算、不再乘 gameScale）；
                             **PC 端原表达式一个字没改**。 */}
                    <div style={{
                        // [2026-10-24 莉莉子 · 程实测「界面很大」修复]
                        //   ⚠️ 上一版注释写的「本面板在 ScaleWrapper 内」**前提已失效**：
                        //      本组件已改为 `createPortal(…, document.body)` ⇒ 面板在**画布之外**，
                        //      祖先 `scale(s)` 不生效 ⇒ `pickCanvasInnerScale` 的 **÷ s** 变成白除，
                        //      反被放大 1/s（手机 ≈2.67 倍），900/1180 宽的面板直接超出屏幕。
                        //   ⇒ 换 `pickPortalContainScale`：**不除 s**，且宽高取小者（配合实测高 panelH）。
                        //   PC 端 legacy 仍是 `gameScale * panelScale`（原表达式，一个字没改）。
                        transform: `scale(${pickPortalContainScale(
                            PACK_OPEN_UI.panelWidth,
                            panelH,
                            0.92,
                            0.86,
                            gameScale * PACK_OPEN_UI.panelScale,
                        )})`,
                    }}>
                        <motion.div
                            ref={panelRef}
                            initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.92, opacity: 0 }}
                            transition={{ type: 'spring', stiffness: 260, damping: 22 }}
                            className="relative bg-gradient-to-b from-slate-900 via-purple-950/50 to-slate-900 border-purple-500/30 flex flex-col items-center shadow-[0_0_80px_rgba(88,28,135,0.5)] overflow-hidden" style={{ width: PACK_OPEN_UI.panelWidth, borderRadius: PACK_OPEN_UI.panelRadius, borderWidth: PACK_OPEN_UI.panelBorderWidth, borderStyle: 'solid', padding: PACK_OPEN_UI.panelPad }}
                        >
                            {/* 标题 */}
                            <div className="flex items-center" style={{ gap: PACK_OPEN_UI.titleRowGap, marginBottom: PACK_OPEN_UI.titleRowMarginBottom }}>
                                <Package size={PACK_OPEN_UI.titleIconSize} className="text-purple-300" />
                                {/* [2026-10-02 #6] 术语统一：这里做的是**开卡包**，不叫「开匣」 */}
                                <h3 className="font-black tracking-widest text-white" style={{ fontSize: PACK_OPEN_UI.titleFontSize }}>卡包开启</h3>
                            </div>
                            <p className="text-purple-300/70 font-mono tracking-wider" style={{ fontSize: PACK_OPEN_UI.subtitleFontSize, marginBottom: PACK_OPEN_UI.subtitleMarginBottom }}>
                                {phase === 'idle'
                                    ? `待打开卡包 ×${pendingPacks} · 点击开启`
                                    : phase === 'rolling' ? '开启中…' : '已获得奖励匣'}
                            </p>

                            {/* ── 滚动展示窗（老虎机转盘）──
                                [2026-10-21 莉莉子 🎨] 匣子档案卡浮窗的监听**全部挂在这一个容器上**，不给 260 个格子各挂一份：
                                · `onPointerOver` = PC 真实鼠标；`onMouseOver` = 触屏长按经 `touchGaze` 合成的 mouseover（bubbles:true）
                                  ⚠️ 两个都会在 PC 上触发 ⇒ 处理函数内部按 `data-chest-idx` 去重
                                · 用 over/out 不用 enter/leave —— 理由只是"容器一层够用、enter/leave 无额外收益"，
                                  🚫 **不是**性能优势（mouseover 的祖先链计算由事件本身触发，跟绑什么无关）
                                · `onMouseOut` = 离开格子；`onMouseLeave` = 彻底离开窗口（1000ms 兜底）
                                · `onClick` = **PC 专属**的钉住（触屏轻点**不钉**，见 `onChestWindowClick` 首行守卫；
                                  触屏只认长按，走上面那条合成的 mouseover 通路）*/}
                            <div
                                className="relative overflow-hidden bg-black/60 border-white/10"
                                style={{borderRadius: PACK_OPEN_UI.windowRadius, borderWidth: PACK_OPEN_UI.windowBorderWidth, borderStyle: 'solid', width: WINDOW_W, height: CARD_H }}
                                onPointerOver={onChestGaze}
                                onMouseOver={onChestGaze}
                                onMouseOut={onChestGazeOut}
                                onMouseLeave={onChestWindowLeave}
                                onClick={onChestWindowClick}
                            >
                                {/* 中间标记线（+ 停住脉冲光）
                                    🔴 [2026-10-21 莉莉子 BUG修复] 必须 `pointer-events-none`：它 `z-20` 高于 strip，
                                    而"中奖"的判定就是"停在中间标记线上" ⇒ 玩家把鼠标移到**最想看的那一格正中央**时，
                                    命中的是这 3px 竖条而不是匣子 ⇒ 档案卡浮窗在最关键的位置失灵。
                                    （旁边两条渐隐带本来就有 `pointer-events-none`，就它漏了。） */}
                                <div className="absolute left-1/2 top-0 bottom-0 -translate-x-1/2 bg-yellow-400 shadow-[0_0_14px_rgba(250,204,21,0.9)] z-20 pointer-events-none" style={{ width: PACK_OPEN_UI.markerWidth }} />
                                {/* 两侧渐隐 */}
                                <div className="absolute inset-y-0 left-0 bg-gradient-to-r from-black/80 to-transparent z-10 pointer-events-none" style={{ width: PACK_OPEN_UI.fadeWidth }} />
                                <div className="absolute inset-y-0 right-0 bg-gradient-to-l from-black/80 to-transparent z-10 pointer-events-none" style={{ width: PACK_OPEN_UI.fadeWidth }} />
                                {/* 底部轨道条 */}
                                <div className="absolute bottom-0 left-0 right-0 bg-black/50 border-white/5 z-10 pointer-events-none" style={{ height: PACK_OPEN_UI.trackHeight, borderTopWidth: PACK_OPEN_UI.trackBorderWidth, borderTopStyle: 'solid' }} />

                                {/* 滚动序列（rAF 手动 transform） */}
                                <div ref={stripRef} className="absolute top-0 left-0 flex will-change-transform">
                                    {sequence.map((chest, i) => {
                                        const meta = RARITY_META[chest.rarity];
                                        const isTarget = i === targetIndex;
                                        const isReveal = isTarget && phase === 'result';
                                        return (
                                            // [2026-10-21 莉莉子 🎨] 档案卡浮窗的命中标记（容器级监听靠 closest 定位 + 去重）；
                                            // `data-gaze` = 触屏长按命中标记 —— TouchFeedbackLayer 只认 `[data-gaze]`，长按后会合成 mouseover
                                            <div
                                                key={i}
                                                data-chest-idx={i}
                                                data-chest-kind={chest.kind}
                                                data-chest-rarity={chest.rarity}
                                                data-gaze="chest"
                                                className="relative shrink-0 flex items-center justify-center"
                                                style={{ width: CARD_W, height: CARD_H }}
                                            >
                                                {/* [2026-10-20 莉莉子 🎨 视觉层优化] 滚轮每格 = 匣子插画（整图显示）
                                                    ⚠️ 插画自带六边形外框 ⇒ 去掉外层的 clipPath 与品质纯色底，否则会切掉框角。
                                                    尺寸沿用 HEX_SIZE(108)，品质色只保留在 drop-shadow 光晕上。 */}
                                                <motion.div
                                                    className="relative"
                                                    style={{
                                                        width: HEX_SIZE,
                                                        height: HEX_SIZE,
                                                        // [2026-10-20 莉莉子 🎨] 品质色外发光：未中奖 = 常态品质光（10px/99），
                                                        // 中奖仍用更亮的 24px/ee 强化揭示 —— 只调静止态强度，不动任何动画参数。
                                                        filter: `drop-shadow(0 0 ${isReveal ? 24 : 10}px ${meta.color}${isReveal ? 'ee' : '99'})`,
                                                    }}
                                                    animate={isReveal ? { scale: 1.6 } : { scale: 1 }}
                                                    transition={{ type: 'spring', stiffness: 300, damping: 15 }}
                                                >
                                                    {/* 兜底：图挂了隐藏 img，露出这枚 lucide 图标（不白板） */}
                                                    <div data-art-fallback className="absolute inset-0 flex items-center justify-center opacity-0">
                                                        <Package size={PACK_OPEN_UI.hexIconSize} className="text-white/40" />
                                                    </div>
                                                    <img
                                                        src={getChestArt(chest.kind, chest.rarity)}
                                                        alt={getChestArtName(chest.kind, chest.rarity)}
                                                        className="relative w-full h-full object-contain"
                                                        draggable={false}
                                                        onError={hideBrokenChestArt}
                                                    />
                                                </motion.div>
                                                {/* 停住后目标加选中标记 */}
                                                {isReveal && (
                                                    <motion.div
                                                        initial={{ opacity: 0, scale: 0 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.18 }}
                                                        className="absolute top-0 left-1/2 -translate-x-1/2 z-30 text-yellow-300 drop-shadow-[0_0_8px_rgba(250,204,21,0.9)]" style={{ fontSize: PACK_OPEN_UI.revealMarkerFontSize }}
                                                    >
                                                        ▲
                                                    </motion.div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>

                                {/* [2026-09-04] 中奖揭示：定格后目标格扩散品质色六边形光环（在放大发光之上再强调一次被抽中） */}
                                {phase === 'result' && resultMeta && (
                                    <motion.div
                                        className="pointer-events-none absolute z-[15]"
                                        style={{
                                            left: '50%', top: '50%',
                                            width: HEX_SIZE, height: HEX_SIZE,
                                            marginLeft: -HEX_SIZE / 2, marginTop: -HEX_SIZE / 2,
                                            clipPath: HEXAGON,
                                            border: `${PACK_OPEN_UI.haloBorderWidth}px solid ${resultMeta.color}`,
                                            filter: `drop-shadow(0 0 14px ${resultMeta.color})`,
                                        }}
                                        initial={{ opacity: 0, scale: 0.7 }}
                                        animate={{ opacity: [0.95, 0], scale: 1.9 }}
                                        transition={{ duration: 1.1, ease: 'easeOut', repeat: 1, repeatDelay: 0.45 }}
                                    />
                                )}
                            </div>

                            <p className="text-gray-500 font-mono tracking-wider pointer-events-none" style={{ fontSize: PACK_OPEN_UI.hintFontSize, marginTop: PACK_OPEN_UI.hintMarginTop }}>
                                🎁 卡包开出的是**奖励匣** · 停下中间的即为抽中，随后可在「待打开匣子」里开启
                            </p>

                            {/* [2026-10-04 程拍板] 一键全开：连播中显示进度（已播 n/总数），全部播完显示汇总
                                [2026-10-21 架构改造] 「停止开包」后 `bulkDone` 会被拉满（让 bulkBusy 转 false），
                                但**实际只开了 bulkList.length 个** ⇒ 收尾文案必须按实际数判断，
                                否则会出现"停止在 5 个却说开了 30 个"的假话。 */}
                            {bulkTotal > 1 && (
                                <p className="font-mono tracking-wider pointer-events-none" style={{fontSize: PACK_OPEN_UI.bulkHintFontSize, marginTop: PACK_OPEN_UI.bulkHintMarginTop, color: '#a5f3fc' }}>
                                    {bulkDone < bulkTotal
                                        ? `⚡ 一键开启中… ${Math.min(bulkDone + 1, bulkTotal)}/${bulkTotal}`
                                        : bulkList.length >= bulkTotal
                                            ? `⚡ 本次共开启 ${bulkList.length} 个卡包 —— 已全部存入「待打开匣子」`
                                            : `⚡ 已开启 ${bulkList.length} 个卡包 · 其余 ${bulkTotal - bulkList.length} 个未开启，仍在待开启区`}
                                </p>
                            )}

                            {/* ── 底部按钮：待命 / 滚动中 / 结果兜底 ── */}
                            <div className="flex items-center" style={{ minHeight: PACK_OPEN_UI.buttonRowMinHeight, gap: PACK_OPEN_UI.buttonRowGap, marginTop: PACK_OPEN_UI.buttonRowMarginTop }}>
                                {phase === 'idle' && (
                                    <>
                                        <button onClick={handleOpen} disabled={!canOpen}
                                            className={`font-black tracking-widest transition-all ${
                                                canOpen
                                                    ? 'bg-gradient-to-r from-purple-600 to-purple-400 text-white hover:scale-105 shadow-[0_0_30px_rgba(168,85,247,0.5)]'
                                                    : 'bg-white/5 text-gray-500 cursor-not-allowed'
                                            }`} style={{ paddingLeft: PACK_OPEN_UI.mainBtnPadX, paddingRight: PACK_OPEN_UI.mainBtnPadX, paddingTop: PACK_OPEN_UI.mainBtnPadY, paddingBottom: PACK_OPEN_UI.mainBtnPadY, borderRadius: PACK_OPEN_UI.mainBtnRadius, fontSize: PACK_OPEN_UI.mainBtnFontSize }}>
                                            🎁 开启卡包！
                                        </button>
                                        {/* [2026-10-04 程拍板] 一键全开（≥2 个时才出现 —— 1 个时与单开无差别） */}
                                        {pendingPacks > 1 && (
                                            <button onClick={handleOpenAll}
                                                className="font-black tracking-widest bg-gradient-to-r from-cyan-600 to-teal-400 text-white hover:scale-105 transition-all shadow-[0_0_30px_rgba(34,211,238,0.5)]" style={{ paddingLeft: PACK_OPEN_UI.openAllBtnPadX, paddingRight: PACK_OPEN_UI.openAllBtnPadX, paddingTop: PACK_OPEN_UI.openAllBtnPadY, paddingBottom: PACK_OPEN_UI.openAllBtnPadY, borderRadius: PACK_OPEN_UI.openAllBtnRadius, fontSize: PACK_OPEN_UI.openAllBtnFontSize }}>
                                                ⚡ 一键全开（×{pendingPacks}）
                                            </button>
                                        )}
                                    </>
                                )}
                                {phase === 'rolling' && (
                                    /* [2026-10-21 审查 P1 修复] rolling 期**必须给「停止」**。
                                       原来这里只有不可点的"开启中…"占位，而 X 在 rolling 期不渲染、
                                       背景点击 return、ESC 被吞 ⇒ 玩家在这一整段（约 1.04s/发）
                                       唯一能点的反而是右上角「⏭ 跳过」（= 把剩余全开掉）——
                                       正是程指出的"想中止却只能跳过"那个反直觉。 */
                                    bulkBusy ? (
                                        <button onClick={() => { eventBus.emit(GameEvents.UI_CLICK); stopBulk(); }}
                                            className="font-black tracking-widest bg-white/10 hover:bg-white/20 text-white transition-all"
                                            style={{ paddingLeft: PACK_OPEN_UI.mainBtnPadX, paddingRight: PACK_OPEN_UI.mainBtnPadX, paddingTop: PACK_OPEN_UI.mainBtnPadY, paddingBottom: PACK_OPEN_UI.mainBtnPadY, borderRadius: PACK_OPEN_UI.mainBtnRadius, fontSize: PACK_OPEN_UI.mainBtnFontSize }}>
                                            ⏹ 停止开包
                                        </button>
                                    ) : (
                                        <div className="bg-white/5 text-gray-500 font-black tracking-widest cursor-wait" style={{ paddingLeft: PACK_OPEN_UI.mainBtnPadX, paddingRight: PACK_OPEN_UI.mainBtnPadX, paddingTop: PACK_OPEN_UI.mainBtnPadY, paddingBottom: PACK_OPEN_UI.mainBtnPadY, borderRadius: PACK_OPEN_UI.mainBtnRadius, fontSize: PACK_OPEN_UI.mainBtnFontSize }}>开启中…</div>
                                    )
                                )}
                                {/* [2026-10-02 #5] 结果态兜底：详情弹窗关掉后这里仍有可点，不再"底部空白" */}
                                {phase === 'result' && (
                                    <>
                                        <button onClick={() => { eventBus.emit(GameEvents.UI_CLICK); setDetailOpen(true); }}
                                            className="bg-white/10 hover:bg-white/20 text-white font-black tracking-widest transition-all" style={{ paddingLeft: PACK_OPEN_UI.resultBtnPadX, paddingRight: PACK_OPEN_UI.resultBtnPadX, paddingTop: PACK_OPEN_UI.resultBtnPadY, paddingBottom: PACK_OPEN_UI.resultBtnPadY, borderRadius: PACK_OPEN_UI.resultBtnRadius }}>
                                            🔍 查看详情
                                        </button>
                                        <button onClick={() => {
                                                eventBus.emit(GameEvents.UI_BACK);
                                                // [2026-10-21 P0-①] 批量连播中 ⇒ **跳过剩余动画但一定出汇总**
                                                //   （原来直接 onClose() ⇒ backToIdle 清掉 bulkTotal ⇒ 汇总窗永不出现）
                                                if (bulkBusy) stopBulk(); else onClose();
                                            }}
                                            className="bg-gradient-to-r from-purple-600 to-purple-400 text-white font-black tracking-widest hover:scale-105 transition-all shadow-[0_0_25px_rgba(168,85,247,0.45)]" style={{ paddingLeft: PACK_OPEN_UI.resultBtnPadX, paddingRight: PACK_OPEN_UI.resultBtnPadX, paddingTop: PACK_OPEN_UI.resultBtnPadY, paddingBottom: PACK_OPEN_UI.resultBtnPadY, borderRadius: PACK_OPEN_UI.resultBtnRadius }}>
                                            {/* [2026-10-21 程定] 批量播放中这个位置是「**停止播放**」，不是「收起」：
                                                「收起」的语义是"开完之后关窗"，播放途中它不该叫这个名字；
                                                停止 = 不再看剩余演出，直接给我结果（结果数据早已在手）。 */}
                                            {bulkBusy ? '⏹ 停止开包' : (canOpen ? '收起' : '完成')}
                                        </button>
                                    </>
                                )}
                            </div>

                            {/* 右上关闭（滚动中禁用） */}
                            {phase !== 'rolling' && (
                                <button onClick={() => {
                                        eventBus.emit(GameEvents.UI_BACK);
                                        // [2026-10-21] 批量中先给结果（等同「⏹ 停止开包」：不再抽、剩下的保留）
                                        if (bulkBusy) stopBulk(); else onClose();
                                    }} className="absolute rounded-full text-gray-500 hover:bg-white/10 hover:text-white transition-all" style={{ top: PACK_OPEN_UI.closeTop, right: PACK_OPEN_UI.closeRight, padding: PACK_OPEN_UI.closePad }}>
                                    <X size={PACK_OPEN_UI.closeIconSize} />
                                </button>
                            )}

                            {/* [2026-10-21 程拍板] 右上角「⏭ 跳过」—— 与底部「⏹ 停止开包」是**两件事**：
                                · 停止 = 不再抽，剩下的包**保留未开启**，汇总只含已播过的
                                · 跳过 = 不想看演出了，把**剩余的包也全抽掉**，一起汇总
                                放在关闭按钮左边（绝对定位，right 偏移出去），只在批量连播中显示。 */}
                            {bulkBusy && (
                                <button onClick={() => { eventBus.emit(GameEvents.UI_CLICK); skipRest(); }}
                                    className="absolute rounded-full bg-white/10 hover:bg-white/20 text-gray-300 hover:text-white font-black tracking-widest transition-all"
                                    style={{ top: PACK_OPEN_UI.closeTop, right: PACK_OPEN_UI.closeRight + PACK_OPEN_UI.skipBtnOffsetX, padding: PACK_OPEN_UI.closePad, fontSize: PACK_OPEN_UI.skipBtnFontSize }}>
                                    ⏭ 跳过
                                </button>
                            )}

                        </motion.div>
                    </div>

                    {/* ── [2026-10-21 莉莉子 🎨] 匣子档案卡浮窗（取代原生 `title`）
                        · 它自己 portal 到 body：面板 `overflow-hidden` + 整块 `scale(gameScale×panelScale)` 都逃出去
                        · 退场动画由它**内部**的 AnimatePresence 负责（portal 不是外层 AnimatePresence 可识别的 motion child）
                        · `phase !== 'idle'` 时 `dossier` 已被强制置 null ⇒ 这里不会灵异残留 */}
                    <PackChestDossier data={dossier} armamentStock={armamentStock} ui={PACK_OPEN_UI} />

                    {/* ── 详情效果弹窗（portal 到 body 全屏浮层，脱离 modal 高度与 overflow 裁剪）
                     [2026-09-07 修复] 去掉包裹 portal 的 AnimatePresence：portal 不是 AnimatePresence 可识别的 motion child，
                     进入动画不触发 → 弹窗停在 opacity:0 全透明却仍拦截点击（"定格后没弹窗、点不动"）；改普通条件渲染，portal 内 motion 自播进入动画。
                     分辨率补偿 scale 移入独立纯 div，避免被 framer 的 transform 动画覆盖。 */}
                    {/* 🔴 [2026-10-21 BUG 修复] `!summaryOpen` 是**硬守卫**：
                        汇总窗（z-1400）开着时，详情弹窗（z-1500）**绝不允许渲染** ——
                        否则就会复现"最后一发的详情窗盖在汇总结果上面"。
                        这里不依赖任何时序推断，是渲染层的最后一道闸。 */}
                    {detailOpen && !summaryOpen && phase === 'result' && result && resultMeta && createPortal(
                        <motion.div
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                            className="fixed inset-0 z-[1500] flex items-center justify-center bg-black/70"
                            // [2026-10-02 #9] 点背景 = 收起详情（原来 stopPropagation 后什么都不做，像卡住了）
                            onClick={(e) => { e.stopPropagation(); setDetailOpen(false); }}
                        >
                            {/* [2026-10-21 手机实测修复] 本层是 portal 到 body ⇒ **逃出了 ScaleWrapper**，
                                祖先那层 s 不再生效，所以不能再除 gameScale（那会二次缩小）。
                                手机端改用 `pickPortalScale`（按"占屏 92%"反算）；PC 端原表达式不变。 */}
                            <div style={{
                                transform: `scale(${pickPortalScale(
                                    PACK_OPEN_UI.detailWidth,
                                    0.92,
                                    gameScale * PACK_OPEN_UI.panelScale,
                                )})`,
                            }}>
                                <motion.div
                                    initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }}
                                    transition={{ type: 'spring', stiffness: 260, damping: 22 }}
                                    className="flex flex-col items-center shadow-[0_0_60px_rgba(0,0,0,0.9)]"
                                    style={{width: PACK_OPEN_UI.detailWidth, borderRadius: PACK_OPEN_UI.detailRadius, borderWidth: PACK_OPEN_UI.detailBorderWidth, borderStyle: 'solid', padding: PACK_OPEN_UI.detailPad, gap: PACK_OPEN_UI.detailGap, background: resultMeta.cardBg, borderColor: `${resultMeta.color}66`, boxShadow: `0 0 40px ${resultMeta.color}44` }}
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    <div className="font-black tracking-widest" style={{fontSize: PACK_OPEN_UI.detailTitleFontSize, color: resultMeta.color, textShadow: `0 0 18px ${resultMeta.color}88` }}>
                                        ✨ 获得奖励匣 ✨
                                    </div>
                                    {/* [2026-10-20 莉莉子 🎨] 结果大图 = 匣子插画（整图显示，BIG_HEX 150 不变；去 clipPath/纯色底） */}
                                    <div className="relative"
                                        style={{ width: BIG_HEX, height: BIG_HEX, filter: `drop-shadow(0 0 18px ${resultMeta.color}aa)` }}>
                                        <div data-art-fallback className="absolute inset-0 flex items-center justify-center opacity-0">
                                            <Package size={PACK_OPEN_UI.bigHexIconSize} className="text-white/40" />
                                        </div>
                                        <img
                                            src={getChestArt(result.kind, result.rarity)}
                                            alt={getChestArtName(result.kind, result.rarity)}
                                            className="relative w-full h-full object-contain"
                                            draggable={false}
                                            onError={hideBrokenChestArt}
                                        />
                                    </div>
                                    {/* 名称 */}
                                    <div className="font-black tracking-wide text-center" style={{fontSize: PACK_OPEN_UI.chestNameFontSize, color: '#fff', textShadow: `0 0 10px ${resultMeta.color}88` }}>
                                        {chestName(result)}
                                    </div>
                                    {/* 品质 + 大类 chips */}
                                    <div className="flex flex-wrap justify-center" style={{ gap: PACK_OPEN_UI.chipsGap }}>
                                        <span className="font-mono" style={{fontSize: PACK_OPEN_UI.chipFontSize, paddingLeft: PACK_OPEN_UI.chipPadX, paddingRight: PACK_OPEN_UI.chipPadX, paddingTop: PACK_OPEN_UI.chipPadY, paddingBottom: PACK_OPEN_UI.chipPadY, borderRadius: PACK_OPEN_UI.chipRadius, color: resultMeta.color, border: `1px solid ${resultMeta.color}55`, background: `${resultMeta.color}11` }}>
                                            {resultMeta.label}
                                        </span>
                                        <span className="font-mono text-amber-200 border-amber-300/30 bg-amber-400/10" style={{ fontSize: PACK_OPEN_UI.chipFontSize, paddingLeft: PACK_OPEN_UI.chipPadX, paddingRight: PACK_OPEN_UI.chipPadX, paddingTop: PACK_OPEN_UI.chipPadY, paddingBottom: PACK_OPEN_UI.chipPadY, borderRadius: PACK_OPEN_UI.chipRadius, borderWidth: PACK_OPEN_UI.chipBorderWidth, borderStyle: 'solid' }}>
                                            {CHEST_KIND_LABEL[result.kind]}
                                        </span>
                                    </div>
                                    {/* 开出内容预告 */}
                                    <p className="text-gray-200 leading-relaxed text-center" style={{ fontSize: PACK_OPEN_UI.descFontSize }}>
                                        {describeChestContent(result.kind, result.rarity)}
                                        {result.kind === 'shard' && (
                                            <span className="block text-cyan-300/80" style={{ fontSize: PACK_OPEN_UI.shardNoteFontSize, marginTop: PACK_OPEN_UI.shardNoteMarginTop }}>
                                                {/* [2026-10-02 #10] 用常量，别硬编码 5 */}
                                                碎片每 {SHARD_GROUP_SIZE} 片为一组，随机归属一位天启者 · 万能碎片不会从这里开出
                                            </span>
                                        )}
                                    </p>
                                    <p className="text-purple-200/70 text-center" style={{ fontSize: PACK_OPEN_UI.detailFootFontSize, marginTop: PACK_OPEN_UI.detailFootMarginTop }}>
                                        匣子已存入「待打开匣子」，开启后才会得到道具
                                    </p>
                                    {/* 按钮：去开匣子 / 再开一包 / 收起 */}
                                    <div className="flex flex-wrap justify-center" style={{ gap: PACK_OPEN_UI.detailBtnRowGap, marginTop: PACK_OPEN_UI.detailBtnRowMarginTop }}>
                                        {/* [2026-10-21 审查 P1 修复] 批量连播中**不渲染**「去开匣子」：
                                            它的语义是 `onClose(); onOpenChest();`（两处调用方都传了 onOpenChest
                                            ⇒ 按钮真实存在）⇒ 在每发 900ms 的停留窗内手动打开详情再点它，
                                            会把**整批汇总和剩余队列一起丢掉**。
                                            批量中玩家还没看完结果，本就不该"去开匣子"。 */}
                                        {onOpenChest && !bulkBusy && (
                                            <button onClick={() => { eventBus.emit(GameEvents.UI_CLICK); onClose(); onOpenChest(); }}
                                                className="bg-gradient-to-r from-amber-500 to-yellow-400 text-black font-black tracking-widest hover:scale-105 transition-all shadow-[0_0_25px_rgba(250,204,21,0.5)]" style={{ paddingLeft: PACK_OPEN_UI.detailBtnPadX, paddingRight: PACK_OPEN_UI.detailBtnPadX, paddingTop: PACK_OPEN_UI.detailBtnPadY, paddingBottom: PACK_OPEN_UI.detailBtnPadY, borderRadius: PACK_OPEN_UI.detailBtnRadius }}>
                                                🔓 去开匣子
                                            </button>
                                        )}
                                        {/* [2026-10-21 审查 P2 修复] `!bulkBusy` 守卫：
                                            `handleOpen()` 会把 `bulkTotal=0` + `bulkModeRef=false`
                                            ⇒ 批量中从这里点进去会**把整批汇总永久丢掉**
                                            （与同排「去开匣子」是同一类漏口，那个已有守卫）。 */}
                                        {canOpen && !bulkBusy && (
                                            <button onClick={handleOpen}
                                                className="bg-gradient-to-r from-purple-600 to-purple-400 text-white font-black tracking-widest hover:scale-105 transition-all shadow-[0_0_25px_rgba(168,85,247,0.5)]" style={{ paddingLeft: PACK_OPEN_UI.detailBtnPadX, paddingRight: PACK_OPEN_UI.detailBtnPadX, paddingTop: PACK_OPEN_UI.detailBtnPadY, paddingBottom: PACK_OPEN_UI.detailBtnPadY, borderRadius: PACK_OPEN_UI.detailBtnRadius }}>
                                                🎁 再开一包（×{pendingPacks}）
                                            </button>
                                        )}
                                        <button onClick={() => {
                                                // [2026-10-21 P0-①] 批量连播中（详情窗被手动打开的情况）：
                                                //   先收起详情、再跳到汇总 —— 否则两个浮层会叠在一起
                                                if (bulkBusy) { eventBus.emit(GameEvents.UI_CLICK); setDetailOpen(false); stopBulk(); return; }
                                                if (canOpen) { eventBus.emit(GameEvents.UI_CLICK); backToIdle(); } else { eventBus.emit(GameEvents.UI_BACK); onClose(); }
                                            }}
                                            className="bg-white/10 hover:bg-white/20 text-white font-black tracking-widest transition-all" style={{ paddingLeft: PACK_OPEN_UI.detailBtnPadX, paddingRight: PACK_OPEN_UI.detailBtnPadX, paddingTop: PACK_OPEN_UI.detailBtnPadY, paddingBottom: PACK_OPEN_UI.detailBtnPadY, borderRadius: PACK_OPEN_UI.detailBtnRadius }}>
                                            {/* [2026-10-21 程定] 批量播放中这个位置是「**停止播放**」，不是「收起」：
                                                「收起」的语义是"开完之后关窗"，播放途中它不该叫这个名字；
                                                停止 = 不再看剩余演出，直接给我结果（结果数据早已在手）。 */}
                                            {bulkBusy ? '⏹ 停止开包' : (canOpen ? '收起' : '完成')}
                                        </button>
                                    </div>
                                </motion.div>
                            </div>
                        </motion.div>,
                        document.body,
                    )}
                </motion.div>
            )}
            {/* [2026-10-04 程拍板] 一键开包 · **完整结果汇总窗**（连播全部播完后弹出）
                ⚠️ 必须放在 `</AnimatePresence>` **之内** —— 它是 return 的根元素，
                   同级并列会破坏 JSX 单根（本次踩过）*/}
            <BulkOpenSummaryModal
                key="bulk-summary"
                open={summaryOpen}
                title="本次一键开包结果"
                items={bulkList.map<BulkSummaryItem>(c => ({
                    name: chestName(c),
                    rarity: c.rarity,
                    // [2026-10-21 视觉重做] 补齐三个字段：
                    //   · `icon` —— 旧版**没传**，所以每条都退化成"品质色方块 + 10px 文字"，
                    //     这是"汇总窗看起来纯文字很丑"的直接原因（12 张匣子插画一直没用上）
                    //   · `kind` —— 让组件知道这是容器（chip 文案/图标形状都靠它）
                    //   · `amount` —— 合并计数的前提
                    icon: getChestArt(c.kind, c.rarity),
                    kind: 'chest',
                    amount: 1,
                    kindLabel: CHEST_KIND_LABEL[c.kind],
                    note: describeChestContent(c.kind, c.rarity).split('\n')[0],
                }))}
                onClose={() => setSummaryOpen(false)}
            />
        </AnimatePresence>
    );
};
