// ==========================================
// 悖论迷宫 · 商店弹窗（ShopModal）v2
// [2026-08-12 莉莉子] 参考 LOR 英雄之路商店（见 技术手册/参考-LOR商店经济.md）：
//   买带装备的卡 / 买迷宫强化 / 买装备挂英雄卡 / 删卡 + 刷新。
// [2026-08-28 莉莉子] 布局重做（程拍板：左侧 tab 侧边栏，对齐逻辑研习图鉴）：
//   原 2×2 四区平铺太挤 → 改为 左侧竖排 tab（买卡/迷宫强化/装备/删卡）+ 右侧内容区，
//   一次聚焦一类，卡片大展示不再挤在一起。顶部保留 金币/刷新/关闭，底部离开商店。
// ==========================================
import React, { useState, useEffect } from 'react'; // [2026-10-08 批次3] +useEffect（状态上报给地图层缓存）
import { motion } from 'framer-motion';
import { ShoppingBag, Sparkles, Swords, Trash2, Coins, RefreshCw, X, Inbox, ArrowDown, Check } from 'lucide-react';
import type { CardData } from '../../../types';
import { Card } from '../../Card';
// [2026-09-10] 英雄卡改用 Card 自带的手牌样式武装 pips（data.equipment 驱动），不再自绘六边形

import { EnhancementCard as EnhanceCardBig } from './EnhancementCard'; // 强化法术卡样式（250×395，同强化 3 选 1）
import { CARD_DB } from '../../../data/cards';
import { getEquipmentById } from '../../../data/equipment';
import { generateShopStock, REMOVE_CARD_PRICE, type ShopStock } from '../../../data/roguelike/shop';
import { MAZE_ENHANCEMENTS } from '../../../data/roguelike/enhancements';
import type { RoguelikeRunState } from '../../../hooks/useRoguelikeRun';
import { eventBus, GameEvents } from '../../../utils/eventBus';
import { useArmamentConfig } from '../../../hooks/useArmamentConfig'; // [2026-09-10] 局外武装（英雄卡按手牌样式展示武装图标）
import { ConfirmDialog } from '../ConfirmDialog'; // [2026-10-08 交互回响层 批次2] 通用二次确认（刷新商品）

// ══════════════════════════════════════════════════════════════════════
// 🎛️ 肉鸽局内商店（`ShopModal`）· 视觉调参区（**程微调就改这里**）
// ──────────────────────────────────────────────────────────────────────
// 这一屏 = 悖论迷宫地图上踩到**商店**节点弹出的窗口：
//   顶部（商店标题 + 金币 + 刷新×N + 关闭）→ 左侧四个页签（买卡 / 迷宫强化 / 装备 / 删卡）
//   → 右侧内容区（商品卡 + 价格按钮）→ 底部「离开商店」。
// 管：①弹窗主体 ②顶部工具栏 ③左侧页签栏 ④右侧内容区公用 ⑤商店卡（手牌卡 + 整体放大）
//     ⑥价格按钮 ⑦空态文案 ⑧装备页 ⑨购买条 ⑩删卡页 ⑪底部「离开商店」。
// 改完存盘即生效（HMR —— 雷电/电脑上 1~3 秒看到，不用出包）。
// 命名与用法**对齐 `TITLE_UI` / `ROGUE_STAGE_UI`**：值是**绝对画布 px**、直接进 style；注释标注**原 Tailwind 类**。
// ⚠️ 别认错屏：`components/ShopScreen.tsx`（大厅商店）是**另一个**商店页，自带 `SHOP_UI`；本块只管肉鸽局内这个。
// ⚠️ 本屏跑在 `ScaleWrapper` 的 1680×1050 画布内（**天然禁 vh/vw**）。
//   四个页签**共用同一窗口大小**（切页签不跳动）⇒ 窗口尺寸只由 ① 决定。
// ⚠️ 三处 `max-w-*`（`panelMaxWidth` / `heroNameMaxWidth` / `arrowRow|equipGrid|buyBarMaxWidth`）
//   原类被 `index.css:56` 的 `[class*="max-w-"]{max-width:none!important}` **打死过** ⇒ 默认必须写 `'none'`
//   把"改动前实际的样子"锁住；一旦填数字就会**突然真的生效、变窄**（`StyleSelector` 踩过同款）。
//   `max-h-[92%]`（→ `panelMaxHeight`）**不受**那条 `!important` 影响，本来就是活的，故按实际值搬。
// ⚠️ 刻意**没搬**的类（不是可调尺寸）：`fixed inset-0` · `w-full` / `h-full` / `min-h-full`
//   · `flex-1` · `min-w-0` · `shrink-0` · `grid-cols-2`（列数，不是 px）· `rounded-full`（滚圆惯例，同 `SETTINGS_UI`）
//   · `opacity-*` · `tracking-*` · `hover:*` / `group-hover:*` · `transition-*` · `scale-*` / `-translate-y-*`（选中/悬停反馈）
//   · `shadow-*` · `bg-*` / `text-<色>` · `line-clamp-2` · `[scrollbar-width:none]`。
// ⚠️ ⑤ 的 `cardGap` 与 `cardScale` 是**联动**的：卡面右侧外挂的武装/装备图标是**绝对定位**、
//   不参与布局，会往卡右侧多探出 ≈ 47px（= (84−15)×0.45×1.5）⇒ 放大倍数变大时要同步加大 `cardGap`，
//   否则相邻卡牌的图标会压在隔壁卡面上。
// ══════════════════════════════════════════════════════════════════════
export const ROGUE_SHOP_UI = {
    // ══ ① 弹窗主体（**主旋钮**：先定窗口大小，四个页签共用）═════════════
    /** 【主旋钮】弹窗宽 px（原 w-[1160px] = 1160） */
    panelWidth: 1160,
    /** 【主旋钮】弹窗高 px（原 h-[880px] = 880） */
    panelHeight: 880,
    /** 弹窗最大宽（原 max-w-[96%] —— **被 index.css:56 打死过**，故默认 'none' 锁住现状；填 `'96%'` 会真的生效、窗口变窄） */
    panelMaxWidth: 'none',
    /** 弹窗最大高（原 max-h-[92%] = 92% —— `max-h` 不受那条 `!important` 影响，本来就是活的） */
    panelMaxHeight: '92%',
    /** 弹窗圆角 px（原 rounded-2xl = 16） */
    panelRadius: 16,
    /** 弹窗描边粗 px（原 border = 1） */
    panelBorderWidth: 1,

    // ══ ② 顶部工具栏（商店 + 金币 + 刷新 + 关闭）═══════════════════════
    /** 顶栏左右内边距 px（原 px-6 = 24） */
    topBarPadX: 24,
    /** 顶栏上内边距 px（原 pt-5 = 20） */
    topBarPadTop: 20,
    /** 顶栏下内边距 px（原 pb-4 = 16） */
    topBarPadBottom: 16,
    /** 顶栏下分割线粗 px（原 border-b = 1） */
    topBarBorderWidth: 1,
    /** 「图标 + 商店 + SHOP」之间 px（原 gap-2 = 8） */
    titleRowGap: 8,
    /** 标题左侧提袋图标 px（原 `<ShoppingBag size={24} />`） */
    titleIconSize: 24,
    /** 「商店」字号 px（原 text-2xl = 24） */
    titleFontSize: 24,
    /** 「SHOP」副标字号 px（原 text-xs = 12） */
    titleSubFontSize: 12,
    /** 「SHOP」与标题的间距 px（原 ml-2 = 8） */
    titleSubMarginLeft: 8,
    /** 右侧三个控件之间 px（原 gap-3 = 12） */
    topRightGap: 12,
    /** 金币条内「币 + 数字」之间 px（原 gap-1.5 = 6） */
    goldGap: 6,
    /** 金币条左右内边距 px（原 px-3 = 12） */
    goldPadX: 12,
    /** 金币条上下内边距 px（原 py-1.5 = 6） */
    goldPadY: 6,
    /** 金币条圆角 px（原 rounded-lg = 8） */
    goldRadius: 8,
    /** 金币条描边粗 px（原 border = 1） */
    goldBorderWidth: 1,
    /** 金币图标 px（原 `<Coins size={16} />`） */
    goldIconSize: 16,
    /** 刷新按钮左右内边距 px（原 px-3 = 12） */
    refreshPadX: 12,
    /** 刷新按钮上下内边距 px（原 py-1.5 = 6） */
    refreshPadY: 6,
    /** 刷新按钮圆角 px（原 rounded-lg = 8） */
    refreshRadius: 8,
    /** 刷新按钮内「图标 + 文字」之间 px（原 gap-1.5 = 6） */
    refreshGap: 6,
    /** 刷新图标 px（原 `<RefreshCw size={15} />`） */
    refreshIconSize: 15,
    /** 关闭按钮内边距 px（原 p-2 = 8） */
    closePad: 8,
    /** 关闭按钮描边粗 px（原 border = 1） */
    closeBorderWidth: 1,
    /** 关闭 ✕ 图标 px（原 `<X size={20} />`） */
    closeIconSize: 20,

    // ══ ③ 左侧页签栏（买卡 / 迷宫强化 / 装备 / 删卡）═══════════════════
    /** 页签栏宽 px（原 w-44 = 176） */
    sideBarWidth: 176,
    /** 页签栏右分割线粗 px（原 border-r = 1） */
    sideBarBorderWidth: 1,
    /** 页签栏内边距 px（原 p-3 = 12） */
    sideBarPad: 12,
    /** 四个页签之间的行距 px（原 gap-1.5 = 6） */
    sideBarGap: 6,
    /** 页签左右内边距 px（原 px-3 = 12） */
    sideTabPadX: 12,
    /** 页签上下内边距 px（原 py-3 = 12） */
    sideTabPadY: 12,
    /** 页签圆角 px（原 rounded-xl = 12） */
    sideTabRadius: 12,
    /** 页签描边粗 px（原 border = 1 —— 选中/未选中两支共用这一条） */
    sideTabBorderWidth: 1,
    /** 页签字号 px（原 text-sm = 14） */
    sideTabFontSize: 14,
    /** 页签内图标与文字之间 px（原 gap-2.5 = 10） */
    sideTabGap: 10,
    /** 页签图标 px（原 `<ShoppingBag size={16} />` 等四个 = 16） */
    sideTabIconSize: 16,
    /** 页签右侧数量角标字号 px（原 text-[10px] = 10） */
    sideTabBadgeFontSize: 10,

    // ══ ④ 右侧内容区（四个页签公用）═══════════════════════════════════
    /** 内容区四周内边距 px（原 p-5 = 20） */
    contentPad: 20,
    /** 一页内「小标题 → 商品行」的纵向间距 px（原 gap-4 = 16） */
    tabContentGap: 16,
    /** 页内小节标题字号 px（原 text-sm = 14） */
    sectionTitleFontSize: 14,
    /** 小标题与下方内容的间距 px（原 mb-2 = 8） */
    sectionTitleMarginBottom: 8,
    /** 小标题内图标与文字之间 px（原 gap-2 = 8） */
    sectionTitleGap: 8,
    /** 买卡/装备页：一行内「卡面 + 价格按钮」之间 px（原 gap-2.5 = 10） */
    cardColumnGapY: 10,
    /** 删卡页：一行内「卡面 + 卡名」之间 px（原 gap-2 = 8） */
    removeColumnGapY: 8,
    /** 两张「可选卡」按钮（装备页的天启者 / 删卡页的候选）内元素之间 px（原 gap-1.5 = 6 · **两处共用**） */
    pickBtnGap: 6,

    // ══ ⑤ 商店卡（`ShopCard`：手牌样式 + 整体放大）═════════════════════
    /** hand 卡基准宽 px（原裸常量 `CARD_BASE_W` = 130 —— `Card` 组件原始尺寸，一般别动） */
    cardBaseWidth: 130,
    /** hand 卡基准高 px（原裸常量 `CARD_BASE_H` = 202 —— 同上） */
    cardBaseHeight: 202,
    /** 商店卡整体放大倍数（原裸常量 `SHOP_CARD_SCALE` = 1.5） */
    cardScale: 1.5,
    /** 卡牌之间的间隔 px（原裸常量 `CARD_GAP` = 72 · 横纵通用）
     *  ⚠️ 不能按"看着够"来定：卡面右侧外挂的武装/装备图标是**绝对定位**（right:15×scale，每个宽 84×scale），
     *  不参与布局，会往卡右侧再多探出 (84−15)×0.45×1.5 ≈ 47px。间隔必须大于这个外挂量，
     *  否则相邻卡牌的图标会压在隔壁卡面上。（`cardScale` 调大时同步调大这里） */
    cardGap: 72,

    // ══ ⑥ 价格按钮（`PriceButton`：买卡 / 强化 / 删卡共用）═════════════
    /** 左右内边距 px（原 px-4 = 16） */
    priceBtnPadX: 16,
    /** 上下内边距 px（原 py-1.5 = 6） */
    priceBtnPadY: 6,
    /** 圆角 px（原 rounded-lg = 8） */
    priceBtnRadius: 8,
    /** 字号 px（原 text-sm = 14） */
    priceBtnFontSize: 14,

    // ══ ⑦ 空态文案（「暂无强化出售 / 暂无装备出售 / 牌组里没有…」）═════
    /** 字号 px（原 text-sm = 14） */
    emptyTextFontSize: 14,
    /** 上下内边距 px（原 py-3 = 12 · 买卡/装备/强化页的空态共用） */
    emptyTextPadY: 12,

    // ══ ⑧ 装备页（① 选天启者 → ② 选装备 → ③ 购买）═════════════════════
    /** 「① / ②」步骤小标题字号 px（原 text-[11px] = 11） */
    stepLabelFontSize: 11,
    /** 步骤小标题与下方内容之间 px（原 mb-2.5 = 10） */
    stepLabelMarginBottom: 10,
    /** 选中天启者的外发光框外扩 px（原 -inset-1.5 = -6） */
    heroFocusInset: -6,
    /** 外发光框圆角 px（原 rounded-2xl = 16） */
    heroFocusRadius: 16,
    /** 外发光框描边粗 px（原 border-2 = 2） */
    heroFocusBorderWidth: 2,
    /** 天启者卡名字号 px（原 text-[11px] = 11） */
    heroNameFontSize: 11,
    /** 天启者卡名最大宽（原 max-w-[190px] —— **被 index.css:56 打死过**，默认 'none' 锁住现状） */
    heroNameMaxWidth: 'none',
    /** 「局内已装 N 件」字号 px（原 text-[10px] = 10） */
    heroOwnedFontSize: 10,
    /** 「局内已装 N 件」与卡名之间 px（原 -mt-1 = -4） */
    heroOwnedMarginTop: -4,
    /** 流程分隔线（↓）上下的间距 px（原 my-3.5 = 14） */
    arrowRowMarginY: 14,
    /** 分隔线内「线 / 箭头 / 线」之间 px（原 gap-3 = 12） */
    arrowRowGap: 12,
    /** 分隔线宽（原 max-w-[860px] —— **被 index.css:56 打死过**，默认 'none' 锁住现状） */
    arrowRowMaxWidth: 'none',
    /** 分隔细线高 px（原 h-px = 1 · 左右两条共用） */
    hairlineHeight: 1,
    /** 分隔线箭头图标 px（原 `<ArrowDown size={14} />`） */
    arrowIconSize: 14,
    /** 装备网格列间距 px（原 gap-3 = 12） */
    equipGridGap: 12,
    /** 装备网格宽（原 max-w-[860px] —— **被 index.css:56 打死过**，默认 'none' 锁住现状） */
    equipGridMaxWidth: 'none',
    /** 装备选项按钮内边距 px（原 p-3 = 12） */
    equipOptPad: 12,
    /** 装备选项按钮圆角 px（原 rounded-xl = 12） */
    equipOptRadius: 12,
    /** 装备选项按钮描边粗 px（原 border = 1） */
    equipOptBorderWidth: 1,
    /** 装备选项按钮内「六边形 + 文字块」之间 px（原 gap-3 = 12） */
    equipOptGap: 12,
    /** 六边形装备图标边长 px（原 `<EquipHex size={48} />`） */
    equipHexSize: 48,
    /** 六边形内卡面占父级比例（原 w-[86%] h-[86%]） */
    equipHexIconRatio: '86%',
    /** 装备名一行内间距 px（原 gap-2 = 8） */
    equipNameRowGap: 8,
    /** 装备名一行与描述之间 px（原 mb-1 = 4） */
    equipNameRowMarginBottom: 4,
    /** 装备名字号 px（原 text-sm = 14） */
    equipNameFontSize: 14,
    /** 品质角标字号 px（原 text-[10px] = 10） */
    rarityBadgeFontSize: 10,
    /** 品质角标左右内边距 px（原 px-1.5 = 6） */
    rarityBadgePadX: 6,
    /** 品质角标上下内边距 px（原 py-0.5 = 2） */
    rarityBadgePadY: 2,
    /** 品质角标圆角 px（原 rounded = 4） */
    rarityBadgeRadius: 4,
    /** 装备描述字号 px（原 text-xs = 12） */
    equipDescFontSize: 12,
    /** 装备描述与价格之间 px（原 mb-1.5 = 6） */
    equipDescMarginBottom: 6,
    /** 装备价格字号 px（原 text-xs = 12） */
    equipPriceFontSize: 12,
    /** 选中对勾角标边长 px（原 w-6 h-6 = 24） */
    checkBadgeSize: 24,
    /** 选中对勾角标外扩 px（原 -top-2 -right-2 = -8 · 上下左右通用） */
    checkBadgeOffset: -8,
    /** 选中对勾角标描边粗 px（原 border-2 = 2） */
    checkBadgeBorderWidth: 2,
    /** 对勾图标 px（原 `<Check>` 的 size=13） */
    checkIconSize: 13,

    // ══ ⑨ 购买条（总价提示 + 清空 / 购买）══════════════════════════════
    /** 购买条与上方装备网格之间 px（原 mt-5 = 20） */
    buyBarMarginTop: 20,
    /** 购买条宽（原 max-w-[860px] —— **被 index.css:56 打死过**，默认 'none' 锁住现状） */
    buyBarMaxWidth: 'none',
    /** 购买条左右内边距 px（原 px-4 = 16） */
    buyBarPadX: 16,
    /** 购买条上下内边距 px（原 py-3 = 12） */
    buyBarPadY: 12,
    /** 购买条圆角 px（原 rounded-xl = 12） */
    buyBarRadius: 12,
    /** 购买条描边粗 px（原 border = 1） */
    buyBarBorderWidth: 1,
    /** 提示文字与按钮组之间 px（原 gap-4 = 16） */
    buyBarGap: 16,
    /** 提示文字字号 px（原 text-xs = 12） */
    buyHintFontSize: 12,
    /** 右侧「清空 / 购买」之间 px（原 gap-2 = 8） */
    buyBarBtnGap: 8,
    /** 「清空」左右内边距 px（原 px-3 = 12） */
    clearBtnPadX: 12,
    /** 「清空」上下内边距 px（原 py-1.5 = 6） */
    clearBtnPadY: 6,
    /** 「清空」圆角 px（原 rounded-lg = 8） */
    clearBtnRadius: 8,
    /** 「清空」字号 px（原 text-xs = 12） */
    clearBtnFontSize: 12,
    /** 「购买」左右内边距 px（原 px-6 = 24） */
    buyBtnPadX: 24,
    /** 「购买」上下内边距 px（原 py-2 = 8） */
    buyBtnPadY: 8,
    /** 「购买」圆角 px（原 rounded-lg = 8） */
    buyBtnRadius: 8,
    /** 「购买」字号 px（原 text-sm = 14） */
    buyBtnFontSize: 14,

    // ══ ⑩ 删卡页 ══════════════════════════════════════════════════════
    /** 小标题里的垃圾桶图标 px（原 `<Trash2 size={14} />`） */
    removeTabIconSize: 14,
    /** 空态「牌组没有可删的牌」内元素之间 px（原 gap-3 = 12） */
    removeEmptyGap: 12,
    /** 空态上下内边距 px（原 py-10 = 40） */
    removeEmptyPadY: 40,
    /** 空态收件箱图标 px（原 `<Inbox>` 的 size=40） */
    removeEmptyIconSize: 40,
    /** 空态文字字号 px（原 text-sm = 14） */
    removeEmptyFontSize: 14,
    /** 选中红晕外扩 px（原 -inset-1 = -4） */
    removePickInset: -4,
    /** 选中红晕圆角 px（原 rounded-xl = 12） */
    removePickRadius: 12,
    /** 选中红晕描边粗 px（原 border-2 = 2） */
    removePickBorderWidth: 2,
    /** 牌组数量角标字号 px（原 text-xs = 12） */
    countBadgeFontSize: 12,
    /** 数量角标左右内边距 px（原 px-1.5 = 6） */
    countBadgePadX: 6,
    /** 数量角标上下内边距 px（原 py-0.5 = 2） */
    countBadgePadY: 2,
    /** 数量角标外扩 px（原 -top-1.5 -right-1.5 = -6 · 上下左右通用） */
    countBadgeOffset: -6,
    /** 数量角标描边粗 px（原 border = 1） */
    countBadgeBorderWidth: 1,
    /** 选中红罩圆角 px（原 rounded-lg = 8） */
    pickVeilRadius: 8,
    /** 删卡卡名字号 px（原 text-[11px] = 11） */
    removeNameFontSize: 11,
    /** 删卡卡名最大宽（原 max-w-[190px] —— **被 index.css:56 打死过**，默认 'none' 锁住现状） */
    removeNameMaxWidth: 'none',
    /** 「将删除「X」」与上方卡列之间 px（原 mt-2 = 8） */
    removeConfirmMarginTop: 8,
    /** 该行内文字与按钮之间 px（原 gap-4 = 16） */
    removeConfirmGap: 16,
    /** 该行文字字号 px（原 text-xs = 12） */
    removeConfirmFontSize: 12,

    // ══ ⑪ 底部「离开商店」═════════════════════════════════════════════
    /** 底栏上下内边距 px（原 py-4 = 16） */
    footerPadY: 16,
    /** 底栏上分割线粗 px（原 border-t = 1） */
    footerBorderWidth: 1,
    /** 「离开商店」左右内边距 px（原 px-12 = 48） */
    leaveBtnPadX: 48,
    /** 「离开商店」上下内边距 px（原 py-2.5 = 10） */
    leaveBtnPadY: 10,
    /** 「离开商店」圆角 px（原 rounded-xl = 12） */
    leaveBtnRadius: 12,
} as const;

const HEX = 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)';
// [2026-08-27] 六档品质色：白/绿/蓝/紫/金/红
const RARITY_COLOR: Record<string, string> = { common: '#e5e7eb', uncommon: '#22c55e', rare: '#3b82f6', epic: '#a855f7', legendary: '#facc15', mythic: '#ef4444' };
const RARITY_LABEL: Record<string, string> = { common: '白', uncommon: '绿', rare: '蓝', epic: '紫', legendary: '金', mythic: '红' };

export type ShopTab = 'card' | 'enhancement' | 'equipment' | 'remove';

const TABS: { key: ShopTab; icon: React.ReactNode; label: string }[] = [
    { key: 'card', icon: <ShoppingBag size={ROGUE_SHOP_UI.sideTabIconSize} />, label: '买卡' },
    { key: 'enhancement', icon: <Sparkles size={ROGUE_SHOP_UI.sideTabIconSize} />, label: '迷宫强化' },
    { key: 'equipment', icon: <Swords size={ROGUE_SHOP_UI.sideTabIconSize} />, label: '装备' },
    { key: 'remove', icon: <Trash2 size={ROGUE_SHOP_UI.sideTabIconSize} />, label: '删卡' },
];

interface ShopModalProps {
    run: RoguelikeRunState;
    stock: ShopStock;
    availableTabs: ShopTab[]; // [2026-08-28] 本商店开启的页签（进入节点时随机确定，节点内重复开窗不变）
    onBuyCard: (cardKey: string, equipId: string | undefined, price: number) => boolean;
    onBuyEnhancement: (enhancementId: string, price: number) => boolean;
    /** [2026-09-10] 批量买装备：把 equipmentIds 一次全挂到 heroKey 身上（总价 totalPrice，装备无槽位上限） */
    onBuyEquipment: (heroKey: string, equipmentIds: string[], totalPrice: number) => boolean;
    onRemoveCard: (cardKey: string, price: number) => boolean;
    onRefresh: () => boolean;
    onClose: () => void;
    /** [2026-10-08 莉莉子 · 交互回响层 批次3] 回头再进时带回来的「已购」列表（防重复购买） */
    initialPurchased?: string[];
    /** [2026-10-08 · 批次3] 库存/已购变化上报 → 地图层按节点缓存（关窗不丢、重开不重随） */
    onStateChange?: (s: { stock: ShopStock; purchased: string[] }) => void;
}

/** 商店展示卡（补全 runtime 字段满足 CardData）
 *  [2026-09-10] 新增 equipment 参数：写入后 Card 会按手牌样式在卡面右下角渲染武装/装备图标（含悬停大卡） */
const displayCard = (key: string, equipment?: string[]): CardData => {
    const base = CARD_DB[key];
    return {
        ...base,
        id: `shop_${key}`,
        strikeCount: 0,
        animState: 'idle',
        damageTaken: 0,
        buffs: { power: 0, health: 0 },
        ...(equipment && equipment.length > 0 ? { equipment } : {}),
    } as CardData;
};

/** 装备六边形方块（中间卡面 + 稀有度边框） */
const EquipHex: React.FC<{ equipId: string; size?: number }> = ({ equipId, size = 34 }) => {
    const def = getEquipmentById(equipId);
    if (!def) return null;
    const color = RARITY_COLOR[def.rarity] || '#9ca3af';
    return (
        <div
            className="flex items-center justify-center"
            style={{ width: size, height: size * 1.14, clipPath: HEX, background: color, filter: `drop-shadow(0 0 5px ${color}66)` }}
        >
            <img src={def.icon} alt={def.name} draggable={false} className="object-cover" style={{ width: ROGUE_SHOP_UI.equipHexIconRatio, height: ROGUE_SHOP_UI.equipHexIconRatio, clipPath: HEX }} />
        </div>
    );
};

const SectionTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <h3 className="font-black tracking-widest text-white/80 flex items-center" style={{ fontSize: ROGUE_SHOP_UI.sectionTitleFontSize, marginBottom: ROGUE_SHOP_UI.sectionTitleMarginBottom, gap: ROGUE_SHOP_UI.sectionTitleGap }}>{children}</h3>
);

// ── 商店卡牌统一展示（程可微调）─────────────────────────────
// [2026-09-10 莉莉子] 卡牌一律走 location="hand"（手牌样式：右下角挂武装/装备图标 + 悬停大卡），
//   再用 CSS transform 整体放大 —— 原先 deck-builder(180×268) 虽然大一圈，但走不到 pips 通路，装备显示不出来。
//   改尺寸只动这一个常量即可（基准 hand 卡体 130×202）。
// [莉莉子] 原来的 4 个裸常量（`CARD_BASE_W` / `CARD_BASE_H` / `SHOP_CARD_SCALE` / `CARD_GAP`，
//   值 130 / 202 / 1.5 / 72）已**收编**进顶部 🎛️ `ROGUE_SHOP_UI` ⑤ ——
//   以后改商店卡尺寸只动那一处，本文件不再留裸尺寸常量。

// [2026-09-10 莉莉子] 卡牌之间的间隔（px，横纵通用）。
//   ⚠️ 不能按"看着够"来定：卡面右侧外挂的武装/装备图标是**绝对定位**（right:15×scale，每个宽 84×scale），
//   不参与布局，会往卡右侧再多探出 (84-15)×0.45×1.5 ≈ 47px。间隔必须大于这个外挂量，
//   否则相邻卡牌的图标会压在隔壁卡面上。（程可微调：外挂变多/变大时同步调大）
// （卡距 72 的取值理由见顶部 🎛️ `ROGUE_SHOP_UI.cardGap` 的注释）

/** 商店通用卡牌：手牌样式 + 统一放大，外层占位盒按放大后尺寸撑开避免布局塌陷 */
const ShopCard: React.FC<{ data: CardData; skinId?: number }> = ({ data, skinId = 0 }) => (
    <div
        className="flex items-center justify-center shrink-0"
        style={{ width: ROGUE_SHOP_UI.cardBaseWidth * ROGUE_SHOP_UI.cardScale, height: ROGUE_SHOP_UI.cardBaseHeight * ROGUE_SHOP_UI.cardScale }}
    >
        <div style={{ transform: `scale(${ROGUE_SHOP_UI.cardScale})` }}>
            <Card data={data} location="hand" isFaceUp skinId={skinId} />
        </div>
    </div>
);

const PriceButton: React.FC<{
    price: number;
    affordable: boolean;
    sold: boolean;
    onClick: () => void;
    label?: string;
}> = ({ price, affordable, sold, onClick, label }) => (
    <button
        onClick={(e) => { e.stopPropagation(); eventBus.emit(GameEvents.UI_CLICK); onClick(); }}
        disabled={sold || !affordable}
        style={{ paddingLeft: ROGUE_SHOP_UI.priceBtnPadX, paddingRight: ROGUE_SHOP_UI.priceBtnPadX, paddingTop: ROGUE_SHOP_UI.priceBtnPadY, paddingBottom: ROGUE_SHOP_UI.priceBtnPadY, borderRadius: ROGUE_SHOP_UI.priceBtnRadius, fontSize: ROGUE_SHOP_UI.priceBtnFontSize }} className={`font-black tracking-wider transition-all ${
            sold
                ? 'bg-gray-700/50 text-gray-400 cursor-default'
                : affordable
                    ? 'bg-gradient-to-r from-emerald-600 to-emerald-400 hover:scale-105 shadow-[0_0_15px_rgba(16,185,129,0.4)]'
                    : 'bg-white/5 text-gray-500 cursor-not-allowed'
        }`}
    >
        {sold ? '已购' : (label ?? `🪙${price}`)}
    </button>
);

/** 左侧 tab 按钮（对齐逻辑研习图鉴侧边栏） */
const SideTabBtn: React.FC<{ active: boolean; onClick: () => void; icon: React.ReactNode; label: string; badge?: string | number }> = ({ active, onClick, icon, label, badge }) => (
    <button
        onClick={(e) => { e.stopPropagation(); eventBus.emit(GameEvents.UI_CLICK); onClick(); }}
        style={{ gap: ROGUE_SHOP_UI.sideTabGap, paddingLeft: ROGUE_SHOP_UI.sideTabPadX, paddingRight: ROGUE_SHOP_UI.sideTabPadX, paddingTop: ROGUE_SHOP_UI.sideTabPadY, paddingBottom: ROGUE_SHOP_UI.sideTabPadY, borderRadius: ROGUE_SHOP_UI.sideTabRadius, borderWidth: ROGUE_SHOP_UI.sideTabBorderWidth, borderStyle: 'solid', fontSize: ROGUE_SHOP_UI.sideTabFontSize }} className={`flex items-center transition-all
            ${active
                ? 'bg-emerald-500/20 border-emerald-400/50 text-white shadow-[0_0_16px_rgba(16,185,129,0.3)]'
                : 'border-transparent text-gray-400 hover:bg-white/5 hover:text-gray-200'}`}
    >
        <span className="shrink-0">{icon}</span>
        <span className="font-medium">{label}</span>
        {badge !== undefined && <span className="ml-auto font-mono opacity-60" style={{ fontSize: ROGUE_SHOP_UI.sideTabBadgeFontSize }}>{badge}</span>}
    </button>
);

export const ShopModal: React.FC<ShopModalProps> = ({
    run, stock: initialStock, initialPurchased, onStateChange, availableTabs,
    onBuyCard, onBuyEnhancement, onBuyEquipment, onRemoveCard, onRefresh, onClose,
}) => {
    const [stock, setStock] = useState<ShopStock>(initialStock);
    // [2026-10-08 · 批次3] 「已购」由地图层按节点带回来（关窗再进不清零）
    const [purchased, setPurchased] = useState<Set<string>>(() => new Set(initialPurchased ?? []));
    const [removePick, setRemovePick] = useState<string | null>(null);
    // [2026-09-10] 装备页签：先选天启者（单选）→ 再选装备（多选）→ 一并付款挂载
    const [equipHeroPick, setEquipHeroPick] = useState<string | null>(null);
    const [equipPicks, setEquipPicks] = useState<Set<string>>(new Set());
    // [2026-08-28] 左侧 tab 分类：初始定位到本商店开启的第一个页签
    const [tab, setTab] = useState<ShopTab>(() => availableTabs[0] ?? 'card');
    // [2026-10-08 莉莉子 · 交互回响层 批次2] 刷新会消耗**不可再生的刷新次数** ⇒ 必须二次确认
    const [confirmRefresh, setConfirmRefresh] = useState(false);
    // [2026-10-08 · 批次3] 库存/已购变化即上报（父级写 ref，不会触发重渲染循环）
    useEffect(() => { onStateChange?.({ stock, purchased: [...purchased] }); }, [stock, purchased, onStateChange]);

    const affordable = (price: number) => run.gold >= price;
    const mark = (id: string) => setPurchased(prev => new Set(prev).add(id));

    // [2026-09-28 莉莉子 纵深防御] 本页签**可售装备清单**：武装（isArmament）与法术专属（spellOnly）一律剔除。
    //   本页签的目标卡是**天启者（单位）**；池子已在 generateShopStock 收口，这里是最后一道闸 ——
    //   将来若池子又被改坏，玩家最多看到"少了两格"，而不会白花金币买到一件无效武装。
    const equipOffers = stock.equipments.filter(it => {
        const d = getEquipmentById(it.equipmentId);
        return !!d && !d.isArmament && !d.spellOnly;
    });

    // [2026-09-10] 局外武装（对齐 RogueGameWrapper 战斗构建口径：只取已解锁槽位的武装）
    const { getArmament } = useArmamentConfig();
    /** 英雄卡按"手牌样式"渲染所需的装备列表 = 局内已购装备 + 局外武装（Card 据此渲染右下角图标 + 悬停大卡） */
    const heroCardData = (heroKey: string): CardData => {
        const inRun = run.equippedCards?.[heroKey] ?? [];
        const armaments = getArmament(heroKey, run.heroLevel ?? 1).filter((v): v is string => !!v);
        return displayCard(heroKey, [...inRun, ...armaments]);
    };

    const handleRefresh = () => {
        if (onRefresh()) {
            setStock(generateShopStock(run.rarityBonus, run.passUnlockedEnhancements, { equippedCards: run.equippedCards, ownedEnhancements: run.enhancements, difficulty: run.difficulty })); // [2026-10-08 难度分层] // [2026-08-29 通行证] [2026-09-25] 不叠加：不发已拥有强化/该卡已有装备
            setPurchased(new Set());
            setRemovePick(null);
            setEquipPicks(new Set()); // [2026-09-10] 换货后清空已选装备
        }
    };

    // 删卡候选：牌组里非英雄卡（去重）
    const removableDeck = Array.from(new Set(run.deck.filter(k => !CARD_DB[k]?.isChampion)));
    const countInDeck = (key: string) => run.deck.filter(k => k === key).length;
    const removePickName = removePick ? CARD_DB[removePick]?.name : null;

    return (
        <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[700] flex items-center justify-center bg-black/80 backdrop-blur-sm"
            onClick={(e) => e.stopPropagation()}
        >
            <motion.div
                initial={{ scale: 0.9, opacity: 0, y: 24 }} animate={{ scale: 1, opacity: 1, y: 0 }}
                transition={{ type: 'spring', stiffness: 300, damping: 24 }}
                // [2026-09-10] 固定尺寸：四个页签共用同一窗口大小，切页签不再跳动。
                //   用容器相对单位（%），不用 vh/vw —— 弹窗在 ScaleWrapper 的 1680×1050 坐标内，vh 不随缩放走（见 design-guide 分辨率铁律）
                className="flex flex-col bg-slate-900/95 border-emerald-500/20 text-white"
                style={{ boxShadow: '0 0 60px rgba(16,185,129,0.18)', width: ROGUE_SHOP_UI.panelWidth, height: ROGUE_SHOP_UI.panelHeight, maxWidth: ROGUE_SHOP_UI.panelMaxWidth, maxHeight: ROGUE_SHOP_UI.panelMaxHeight, borderRadius: ROGUE_SHOP_UI.panelRadius, borderWidth: ROGUE_SHOP_UI.panelBorderWidth, borderStyle: 'solid' }}
            >
                {/* 顶部工具栏 */}
                <div className="shrink-0 flex items-center justify-between border-white/10" style={{ paddingLeft: ROGUE_SHOP_UI.topBarPadX, paddingRight: ROGUE_SHOP_UI.topBarPadX, paddingTop: ROGUE_SHOP_UI.topBarPadTop, paddingBottom: ROGUE_SHOP_UI.topBarPadBottom, borderBottomWidth: ROGUE_SHOP_UI.topBarBorderWidth, borderBottomStyle: 'solid' }}>
                    <div className="flex items-center" style={{ gap: ROGUE_SHOP_UI.titleRowGap }}>
                        <ShoppingBag size={ROGUE_SHOP_UI.titleIconSize} className="text-emerald-400" />
                        <h2 className="font-black tracking-widest" style={{ fontSize: ROGUE_SHOP_UI.titleFontSize }}>商店</h2>
                        <span className="font-mono text-emerald-300/60" style={{ fontSize: ROGUE_SHOP_UI.titleSubFontSize, marginLeft: ROGUE_SHOP_UI.titleSubMarginLeft }}>SHOP</span>
                    </div>
                    <div className="flex items-center" style={{ gap: ROGUE_SHOP_UI.topRightGap }}>
                        <span className="flex items-center bg-amber-500/10 border-amber-400/30 text-amber-300 font-black" style={{ gap: ROGUE_SHOP_UI.goldGap, paddingLeft: ROGUE_SHOP_UI.goldPadX, paddingRight: ROGUE_SHOP_UI.goldPadX, paddingTop: ROGUE_SHOP_UI.goldPadY, paddingBottom: ROGUE_SHOP_UI.goldPadY, borderRadius: ROGUE_SHOP_UI.goldRadius, borderWidth: ROGUE_SHOP_UI.goldBorderWidth, borderStyle: 'solid' }}>
                            <Coins size={ROGUE_SHOP_UI.goldIconSize} /> {run.gold}
                        </span>
                        <button
                            onClick={(e) => { e.stopPropagation(); eventBus.emit(GameEvents.UI_CLICK); setConfirmRefresh(true); }}
                            disabled={run.refreshCount <= 0}
                            style={{ gap: ROGUE_SHOP_UI.refreshGap, paddingLeft: ROGUE_SHOP_UI.refreshPadX, paddingRight: ROGUE_SHOP_UI.refreshPadX, paddingTop: ROGUE_SHOP_UI.refreshPadY, paddingBottom: ROGUE_SHOP_UI.refreshPadY, borderRadius: ROGUE_SHOP_UI.refreshRadius }} className={`flex items-center font-black transition-all ${run.refreshCount > 0
                                ? 'bg-cyan-600/80 hover:bg-cyan-500 hover:scale-105'
                                : 'bg-white/5 text-gray-500 cursor-not-allowed'}`}
                            title="刷新商品（消耗一次刷新次数）"
                        >
                            <RefreshCw size={ROGUE_SHOP_UI.refreshIconSize} /> 刷新 ×{run.refreshCount}
                        </button>
                        <button
                            onClick={(e) => { e.stopPropagation(); eventBus.emit(GameEvents.UI_BACK); onClose(); }}
                            className="rounded-full bg-white/5 hover:bg-white/20 border-white/10 hover:border-white/40 transition-all" style={{ padding: ROGUE_SHOP_UI.closePad, borderWidth: ROGUE_SHOP_UI.closeBorderWidth, borderStyle: 'solid' }}
                        >
                            <X size={ROGUE_SHOP_UI.closeIconSize} className="text-gray-300" />
                        </button>
                    </div>
                </div>

                {/* 主体：左侧 tab 侧边栏 + 右侧内容区 */}
                <div className="flex-1 min-h-0 flex">
                    {/* 左侧侧边栏：只渲染本商店开启的页签（[2026-08-28] 随机开启，等级补页签位） */}
                    <div className="shrink-0 border-white/10 bg-black/20 flex flex-col" style={{ width: ROGUE_SHOP_UI.sideBarWidth, borderRightWidth: ROGUE_SHOP_UI.sideBarBorderWidth, borderRightStyle: 'solid', gap: ROGUE_SHOP_UI.sideBarGap, padding: ROGUE_SHOP_UI.sideBarPad }}>
                        {TABS.filter(t => availableTabs.includes(t.key)).map(t => (
                            <SideTabBtn
                                key={t.key}
                                active={tab === t.key}
                                onClick={() => setTab(t.key)}
                                icon={t.icon}
                                label={t.label}
                                badge={t.key === 'card' ? stock.cards.length
                                    : t.key === 'enhancement' ? (stock.enhancement ? 1 : 0)
                                    : t.key === 'equipment' ? equipOffers.length
                                    : removableDeck.length}
                            />
                        ))}
                    </div>

                    {/* 右侧内容区（隐藏滚动条保留滚轮） */}
                    <div className="flex-1 min-w-0 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" style={{ padding: ROGUE_SHOP_UI.contentPad }}>

                        {/* ── 买卡（带装备）── */}
                        {tab === 'card' && (
                            <div className="min-h-full flex flex-col items-center justify-center" style={{ gap: ROGUE_SHOP_UI.tabContentGap }}>
                                <SectionTitle>🃏 买卡（带装备）</SectionTitle>
                                <div className="flex justify-center flex-wrap items-start" style={{ gap: ROGUE_SHOP_UI.cardGap }}>
                                    {stock.cards.map(item => {
                                        const sold = purchased.has(item.cardKey);
                                        return (
                                            <div key={item.cardKey} className="flex flex-col items-center" style={{ gap: ROGUE_SHOP_UI.cardColumnGapY }}>
                                                {/* [2026-09-10] 手牌样式：附带的装备写进 data.equipment → 卡面右下角自动出图标（悬停出大卡） */}
                                                <ShopCard data={displayCard(item.cardKey, item.equipId ? [item.equipId] : undefined)} />
                                                <PriceButton
                                                    price={item.price}
                                                    affordable={affordable(item.price)}
                                                    sold={sold}
                                                    onClick={() => { if (onBuyCard(item.cardKey, item.equipId, item.price)) { eventBus.emit(GameEvents.UI_CLICK); mark(item.cardKey); } }}
                                                />
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* ── 买迷宫强化 ── */}
                        {tab === 'enhancement' && (
                            <div className="min-h-full flex flex-col items-center justify-center" style={{ gap: ROGUE_SHOP_UI.tabContentGap }}>
                                <SectionTitle>✨ 买迷宫强化</SectionTitle>
                                {stock.enhancement ? (() => {
                                    const enh = MAZE_ENHANCEMENTS.find(e => e.id === stock.enhancement!.enhancementId);
                                    if (!enh) return <p className="text-gray-500" style={{ fontSize: ROGUE_SHOP_UI.emptyTextFontSize }}>暂无强化出售</p>;
                                    const sold = purchased.has(`enh_${enh.id}`);
                                    return (
                                        <>
                                            <EnhanceCardBig enhancement={enh} isSelected={false} onClick={() => {}} />
                                            <PriceButton
                                                price={stock.enhancement.price}
                                                affordable={affordable(stock.enhancement.price)}
                                                sold={sold}
                                                onClick={() => { if (onBuyEnhancement(enh.id, stock.enhancement!.price)) { eventBus.emit(GameEvents.UI_CLICK); mark(`enh_${enh.id}`); } }}
                                            />
                                        </>
                                    );
                                })() : <p className="text-gray-500" style={{ fontSize: ROGUE_SHOP_UI.emptyTextFontSize }}>暂无强化出售</p>}
                            </div>
                        )}

                        {/* ── 买装备（① 选天启者 → ② 选装备 → ③ 购买）── */}
                        {tab === 'equipment' && (() => {
                            // [2026-09-10] 英雄候选 = 牌组里所有天启者卡（本局主英雄 + 首战招募来的英雄，去重）
                            const champions = Array.from(new Set(run.deck.filter(k => CARD_DB[k]?.isChampion)));
                            // [2026-09-28 莉莉子 纵深防御] 装备页签**再拦一道**：武装（isArmament）永不可作为局内装备购买。
                            //   池子已在 generateShopStock 收口；这里是"万一将来池子又被改坏"的最后一道闸 ——
                            //   玩家侧看得见但买不到，好过白花金币。法术专属（spellOnly）同理不进本页签（本页签目标是天启者）。
                            // 已选且未售出的装备（售出的可能被留在 state 里，实时过滤掉）
                            // [2026-09-25 莉莉子 装备不叠加] 已挂在所选天启者身上的装备不再计入（不重复挂 / 不重复收费）
                            const onHero = (equipmentId: string) => !!equipHeroPick && (run.equippedCards?.[equipHeroPick] ?? []).includes(equipmentId);
                            const picks = equipOffers.filter(it => equipPicks.has(it.equipmentId) && !purchased.has(`eq_${it.equipmentId}`) && !onHero(it.equipmentId));
                            const total = picks.reduce((s, it) => s + it.price, 0);
                            // 三选一条件全满足才可买：选了英雄 + 选了装备 + 金币够
                            const canBuy = !!equipHeroPick && picks.length > 0 && run.gold >= total;
                            const heroName = equipHeroPick ? (CARD_DB[equipHeroPick]?.name ?? equipHeroPick) : '';
                            const hint = !equipHeroPick ? '请先在上方点选一位天启者'
                                : picks.length === 0 ? '请至少勾选一件装备'
                                : run.gold < total ? `金币不足，还差 🪙${total - run.gold}`
                                : `将「${heroName}」装备 ${picks.length} 件，共 🪙${total}`;
                            return (
                                <div className="min-h-full flex flex-col items-center justify-center">
                                    <SectionTitle>⚔️ 买装备（先选天启者，再选装备）</SectionTitle>

                                    {/* ① 天启者英雄卡（手牌样式：卡面自带武装/装备图标 + 悬停大卡） */}
                                    <div className="font-black tracking-widest text-emerald-300/70" style={{ fontSize: ROGUE_SHOP_UI.stepLabelFontSize, marginBottom: ROGUE_SHOP_UI.stepLabelMarginBottom }}>① 选择天启者</div>
                                    {champions.length === 0 ? (
                                        <p className="text-gray-500" style={{ fontSize: ROGUE_SHOP_UI.emptyTextFontSize, paddingTop: ROGUE_SHOP_UI.emptyTextPadY, paddingBottom: ROGUE_SHOP_UI.emptyTextPadY }}>牌组里没有可装备的天启者</p>
                                    ) : (
                                        <div className="flex flex-wrap justify-center" style={{ gap: ROGUE_SHOP_UI.cardGap }}>
                                            {champions.map(hk => {
                                                const isPick = equipHeroPick === hk;
                                                const ownedCount = run.equippedCards?.[hk]?.length ?? 0;
                                                return (
                                                    <button
                                                        key={hk}
                                                        type="button"
                                                        onClick={(e) => { e.stopPropagation(); eventBus.emit(GameEvents.UI_CLICK); setEquipHeroPick(isPick ? null : hk); }}
                                                        style={{ gap: ROGUE_SHOP_UI.pickBtnGap }} className={`relative flex flex-col items-center outline-none transition-all ${
                                                            isPick ? 'scale-[1.04]' : 'hover:scale-[1.04] hover:-translate-y-1.5'
                                                        }`}
                                                    >
                                                        <div className="relative">
                                                            <ShopCard data={heroCardData(hk)} />
                                                            {isPick && (
                                                                <div className="absolute border-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.6)] pointer-events-none z-[96]" style={{ inset: ROGUE_SHOP_UI.heroFocusInset, borderRadius: ROGUE_SHOP_UI.heroFocusRadius, borderWidth: ROGUE_SHOP_UI.heroFocusBorderWidth, borderStyle: 'solid' }} />
                                                            )}
                                                        </div>
                                                        <span style={{ fontSize: ROGUE_SHOP_UI.heroNameFontSize, maxWidth: ROGUE_SHOP_UI.heroNameMaxWidth }} className={`font-bold text-center truncate ${isPick ? 'text-emerald-300' : 'text-gray-300'}`}>
                                                            {CARD_DB[hk]?.name ?? hk}
                                                        </span>
                                                        {ownedCount > 0 && <span className="text-emerald-400/70" style={{ fontSize: ROGUE_SHOP_UI.heroOwnedFontSize, marginTop: ROGUE_SHOP_UI.heroOwnedMarginTop }}>局内已装 {ownedCount} 件</span>}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    )}

                                    {/* 流程分隔：箭头指向下方装备区 */}
                                    <div className="flex items-center w-full" style={{ gap: ROGUE_SHOP_UI.arrowRowGap, marginTop: ROGUE_SHOP_UI.arrowRowMarginY, marginBottom: ROGUE_SHOP_UI.arrowRowMarginY, maxWidth: ROGUE_SHOP_UI.arrowRowMaxWidth }}>
                                        <div className="flex-1 bg-white/10" style={{ height: ROGUE_SHOP_UI.hairlineHeight }} />
                                        <ArrowDown size={ROGUE_SHOP_UI.arrowIconSize} className={equipHeroPick ? 'text-emerald-400' : 'text-gray-600'} />
                                        <div className="flex-1 bg-white/10" style={{ height: ROGUE_SHOP_UI.hairlineHeight }} />
                                    </div>

                                    {/* ② 装备选项（可多选） */}
                                    <div className="font-black tracking-widest text-emerald-300/70" style={{ fontSize: ROGUE_SHOP_UI.stepLabelFontSize, marginBottom: ROGUE_SHOP_UI.stepLabelMarginBottom }}>
                                        ② 选择装备（可多选 · 不受武装槽位限制）
                                    </div>
                                    {equipOffers.length === 0 ? (
                                        <p className="text-gray-500" style={{ fontSize: ROGUE_SHOP_UI.emptyTextFontSize, paddingTop: ROGUE_SHOP_UI.emptyTextPadY, paddingBottom: ROGUE_SHOP_UI.emptyTextPadY }}>暂无装备出售</p>
                                    ) : (
                                        <div className="grid grid-cols-2 w-full" style={{ gap: ROGUE_SHOP_UI.equipGridGap, maxWidth: ROGUE_SHOP_UI.equipGridMaxWidth }}>
                                            {equipOffers.map(item => {
                                                const def = getEquipmentById(item.equipmentId);
                                                if (!def) return null;
                                                const sold = purchased.has(`eq_${item.equipmentId}`);
                                                const dup = onHero(item.equipmentId); // [2026-09-25 莉莉子 装备不叠加] 已装在该天启者身上 → 不可再选
                                                const sel = !sold && !dup && equipPicks.has(item.equipmentId);
                                                const color = RARITY_COLOR[def.rarity] || '#9ca3af';
                                                return (
                                                    <button
                                                        key={item.equipmentId}
                                                        type="button"
                                                        disabled={sold || dup}
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            eventBus.emit(GameEvents.UI_CLICK);
                                                            setEquipPicks(prev => {
                                                                const next = new Set(prev);
                                                                if (next.has(item.equipmentId)) next.delete(item.equipmentId); else next.add(item.equipmentId);
                                                                return next;
                                                            });
                                                        }}
                                                        style={{ padding: ROGUE_SHOP_UI.equipOptPad, borderRadius: ROGUE_SHOP_UI.equipOptRadius, gap: ROGUE_SHOP_UI.equipOptGap, borderWidth: ROGUE_SHOP_UI.equipOptBorderWidth, borderStyle: 'solid' }} className={`relative text-left flex items-center border transition-all ${
                                                            (sold || dup) ? 'bg-white/[0.02] border-white/5 opacity-45 cursor-default'
                                                                : sel ? 'bg-emerald-500/15 border-emerald-400/70 shadow-[0_0_18px_rgba(16,185,129,0.35)]'
                                                                : 'bg-white/5 border-white/10 cursor-pointer hover:bg-white/10 hover:border-white/25 hover:-translate-y-0.5'
                                                        }`}
                                                    >
                                                        <EquipHex equipId={item.equipmentId} size={ROGUE_SHOP_UI.equipHexSize} />
                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex items-center" style={{ gap: ROGUE_SHOP_UI.equipNameRowGap, marginBottom: ROGUE_SHOP_UI.equipNameRowMarginBottom }}>
                                                                <span className="font-bold text-white truncate" style={{ fontSize: ROGUE_SHOP_UI.equipNameFontSize }}>{def.name}</span>
                                                                <span className="shrink-0 font-mono"
                                                                    style={{ color, border: `1px solid ${color}44`, background: `${color}11`, fontSize: ROGUE_SHOP_UI.rarityBadgeFontSize, paddingLeft: ROGUE_SHOP_UI.rarityBadgePadX, paddingRight: ROGUE_SHOP_UI.rarityBadgePadX, paddingTop: ROGUE_SHOP_UI.rarityBadgePadY, paddingBottom: ROGUE_SHOP_UI.rarityBadgePadY, borderRadius: ROGUE_SHOP_UI.rarityBadgeRadius }}>
                                                                    {RARITY_LABEL[def.rarity] ?? def.rarity}
                                                                </span>
                                                            </div>
                                                            <p className="text-gray-400 line-clamp-2" style={{ fontSize: ROGUE_SHOP_UI.equipDescFontSize, marginBottom: ROGUE_SHOP_UI.equipDescMarginBottom }}>{def.description}</p>
                                                            <span style={{ fontSize: ROGUE_SHOP_UI.equipPriceFontSize }} className={`font-black ${(sold || dup) ? 'text-gray-500' : affordable(item.price) ? 'text-amber-300' : 'text-red-400'}`}>
                                                                {sold ? '已购' : dup ? '已装' : `🪙${item.price}`}
                                                            </span>
                                                        </div>
                                                        {sel && (
                                                            <span className="absolute z-10 rounded-full bg-emerald-500 border-slate-900 flex items-center justify-center pointer-events-none shadow-lg" style={{ top: ROGUE_SHOP_UI.checkBadgeOffset, right: ROGUE_SHOP_UI.checkBadgeOffset, width: ROGUE_SHOP_UI.checkBadgeSize, height: ROGUE_SHOP_UI.checkBadgeSize, borderWidth: ROGUE_SHOP_UI.checkBadgeBorderWidth, borderStyle: 'solid' }}>
                                                                <Check size={ROGUE_SHOP_UI.checkIconSize} strokeWidth={4} />
                                                            </span>
                                                        )}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    )}

                                    {/* ③ 购买条：总价 + 置灰条件（缺英雄 / 缺装备 / 金币不足） */}
                                    <div className="w-full" style={{ marginTop: ROGUE_SHOP_UI.buyBarMarginTop, maxWidth: ROGUE_SHOP_UI.buyBarMaxWidth }}>
                                        <div className="flex items-center justify-between border-white/10 bg-black/30" style={{ gap: ROGUE_SHOP_UI.buyBarGap, borderRadius: ROGUE_SHOP_UI.buyBarRadius, borderWidth: ROGUE_SHOP_UI.buyBarBorderWidth, borderStyle: 'solid', paddingLeft: ROGUE_SHOP_UI.buyBarPadX, paddingRight: ROGUE_SHOP_UI.buyBarPadX, paddingTop: ROGUE_SHOP_UI.buyBarPadY, paddingBottom: ROGUE_SHOP_UI.buyBarPadY }}>
                                            <span style={{ fontSize: ROGUE_SHOP_UI.buyHintFontSize }} className={`truncate ${canBuy ? 'text-emerald-300/90' : 'text-gray-500'}`}>{hint}</span>
                                            <div className="flex items-center shrink-0" style={{ gap: ROGUE_SHOP_UI.buyBarBtnGap }}>
                                                {equipPicks.size > 0 && (
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); eventBus.emit(GameEvents.UI_CLICK); setEquipPicks(new Set()); }}
                                                        className="font-bold bg-white/5 hover:bg-white/15 text-gray-300 transition-all" style={{ paddingLeft: ROGUE_SHOP_UI.clearBtnPadX, paddingRight: ROGUE_SHOP_UI.clearBtnPadX, paddingTop: ROGUE_SHOP_UI.clearBtnPadY, paddingBottom: ROGUE_SHOP_UI.clearBtnPadY, borderRadius: ROGUE_SHOP_UI.clearBtnRadius, fontSize: ROGUE_SHOP_UI.clearBtnFontSize }}
                                                    >
                                                        清空
                                                    </button>
                                                )}
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        eventBus.emit(GameEvents.UI_CLICK);
                                                        if (!canBuy || !equipHeroPick) return;
                                                        const ids = picks.map(it => it.equipmentId);
                                                        if (onBuyEquipment(equipHeroPick, ids, total)) {
                                                            ids.forEach(id => mark(`eq_${id}`));
                                                            setEquipPicks(new Set()); // 买完收起选择，可接着给另一位英雄买
                                                        }
                                                    }}
                                                    disabled={!canBuy}
                                                    style={{ paddingLeft: ROGUE_SHOP_UI.buyBtnPadX, paddingRight: ROGUE_SHOP_UI.buyBtnPadX, paddingTop: ROGUE_SHOP_UI.buyBtnPadY, paddingBottom: ROGUE_SHOP_UI.buyBtnPadY, borderRadius: ROGUE_SHOP_UI.buyBtnRadius, fontSize: ROGUE_SHOP_UI.buyBtnFontSize }} className={`font-black tracking-wider transition-all ${
                                                        canBuy
                                                            ? 'bg-gradient-to-r from-emerald-600 to-emerald-400 hover:scale-105 shadow-[0_0_18px_rgba(16,185,129,0.45)]'
                                                            : 'bg-white/5 text-gray-500 cursor-not-allowed'
                                                    }`}
                                                >
                                                    购买 {picks.length > 0 ? `🪙${total}` : ''}
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })()}

                        {/* ── 删卡 ── */}
                        {tab === 'remove' && (
                            <div className="min-h-full flex flex-col items-center justify-center" style={{ gap: ROGUE_SHOP_UI.tabContentGap }}>
                                <SectionTitle><Trash2 size={ROGUE_SHOP_UI.removeTabIconSize} className="text-red-400" /> 删卡（移除牌组中一张牌 · 🪙{REMOVE_CARD_PRICE}）</SectionTitle>
                                {removableDeck.length === 0 ? (
                                    <div className="flex flex-col items-center text-gray-500" style={{ gap: ROGUE_SHOP_UI.removeEmptyGap, paddingTop: ROGUE_SHOP_UI.removeEmptyPadY, paddingBottom: ROGUE_SHOP_UI.removeEmptyPadY }}>
                                        <Inbox size={ROGUE_SHOP_UI.removeEmptyIconSize} />
                                        <p style={{ fontSize: ROGUE_SHOP_UI.removeEmptyFontSize }}>牌组没有可删的牌</p>
                                    </div>
                                ) : (
                                    <>
                                        <div className="flex flex-wrap justify-center" style={{ gap: ROGUE_SHOP_UI.cardGap }}>
                                            {removableDeck.map(key => {
                                                const isPick = removePick === key;
                                                return (
                                                    <div key={key} className="flex flex-col items-center" style={{ gap: ROGUE_SHOP_UI.removeColumnGapY }}>
                                                        <button
                                                            type="button"
                                                            onClick={(e) => { e.stopPropagation(); eventBus.emit(GameEvents.SFX_SELECT_UNIT); setRemovePick(isPick ? null : key); }}
                                                            style={{ gap: ROGUE_SHOP_UI.pickBtnGap }} className={`relative flex flex-col items-center outline-none transition-all ${
                                                                isPick ? 'scale-105' : 'hover:scale-[1.04] hover:-translate-y-1 cursor-pointer'
                                                            }`}
                                                        >
                                                            {/* 选中红晕 */}
                                                            {isPick && (
                                                                <div className="absolute border-red-500 shadow-[0_0_18px_rgba(239,68,68,0.55)] z-10 pointer-events-none" style={{ inset: ROGUE_SHOP_UI.removePickInset, borderRadius: ROGUE_SHOP_UI.removePickRadius, borderWidth: ROGUE_SHOP_UI.removePickBorderWidth, borderStyle: 'solid' }} />
                                                            )}
                                                            {/* 完整卡面（手牌样式 + 统一放大） */}
                                                            <div className="relative">
                                                                <ShopCard data={displayCard(key)} />
                                                                {/* 牌组中数量 */}
                                                                <span className="absolute z-20 rounded-full bg-slate-900 border-yellow-400/70 text-yellow-300 font-black shadow" style={{ top: ROGUE_SHOP_UI.countBadgeOffset, right: ROGUE_SHOP_UI.countBadgeOffset, paddingLeft: ROGUE_SHOP_UI.countBadgePadX, paddingRight: ROGUE_SHOP_UI.countBadgePadX, paddingTop: ROGUE_SHOP_UI.countBadgePadY, paddingBottom: ROGUE_SHOP_UI.countBadgePadY, fontSize: ROGUE_SHOP_UI.countBadgeFontSize, borderWidth: ROGUE_SHOP_UI.countBadgeBorderWidth, borderStyle: 'solid' }}>
                                                                    ×{countInDeck(key)}
                                                                </span>
                                                                {isPick && (
                                                                    <div className="absolute inset-0 z-30 bg-red-500/15 pointer-events-none" style={{ borderRadius: ROGUE_SHOP_UI.pickVeilRadius }} />
                                                                )}
                                                            </div>
                                                            {/* 卡名 */}
                                                            <span style={{ fontSize: ROGUE_SHOP_UI.removeNameFontSize, maxWidth: ROGUE_SHOP_UI.removeNameMaxWidth }} className={`font-bold text-center truncate ${isPick ? 'text-red-300' : 'text-gray-300'}`}>
                                                                {CARD_DB[key]?.name ?? key}
                                                            </span>
                                                        </button>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                        {removePick && (
                                            <div className="flex items-center justify-center" style={{ gap: ROGUE_SHOP_UI.removeConfirmGap, marginTop: ROGUE_SHOP_UI.removeConfirmMarginTop }}>
                                                <span className="text-gray-400" style={{ fontSize: ROGUE_SHOP_UI.removeConfirmFontSize }}>将删除「{removePickName}」</span>
                                                <PriceButton
                                                    price={REMOVE_CARD_PRICE}
                                                    affordable={affordable(REMOVE_CARD_PRICE)}
                                                    sold={false}
                                                    label={`确认删除 🪙${REMOVE_CARD_PRICE}`}
                                                    onClick={() => {
                                                        eventBus.emit(GameEvents.UI_CLICK); if (removePick && onRemoveCard(removePick, REMOVE_CARD_PRICE)) {
                                                            setRemovePick(null);
                                                        }
                                                    }}
                                                />
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* 底部离开商店 */}
                <div className="shrink-0 flex justify-center border-white/10" style={{ paddingTop: ROGUE_SHOP_UI.footerPadY, paddingBottom: ROGUE_SHOP_UI.footerPadY, borderTopWidth: ROGUE_SHOP_UI.footerBorderWidth, borderTopStyle: 'solid' }}>
                    <button
                        onClick={(e) => { e.stopPropagation(); eventBus.emit(GameEvents.UI_BACK); onClose(); }}
                        className="bg-white/10 hover:bg-white/20 font-black tracking-widest transition-all" style={{ paddingLeft: ROGUE_SHOP_UI.leaveBtnPadX, paddingRight: ROGUE_SHOP_UI.leaveBtnPadX, paddingTop: ROGUE_SHOP_UI.leaveBtnPadY, paddingBottom: ROGUE_SHOP_UI.leaveBtnPadY, borderRadius: ROGUE_SHOP_UI.leaveBtnRadius }}
                    >
                        离开商店
                    </button>
                </div>
            </motion.div>
            {/* [2026-10-08 莉莉子 · 交互回响层 批次2] 刷新二次确认 */}
            {confirmRefresh && (
                <ConfirmDialog
                    title="确定刷新商品？"
                    desc="将重新进货本商店的卡牌 / 强化 / 装备（页签构成不变）。"
                    notes={[`消耗 1 次刷新（当前剩余 ${run.refreshCount} 次）`, '刷新后已售出的商品不会回来']}
                    confirmLabel={`确认刷新（剩 ${run.refreshCount} 次）`}
                    tone="normal"
                    onConfirm={() => { setConfirmRefresh(false); handleRefresh(); }}
                    onCancel={() => setConfirmRefresh(false)}
                />
            )}
        </motion.div>
    );
};
