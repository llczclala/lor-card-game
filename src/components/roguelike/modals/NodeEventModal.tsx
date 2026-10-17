// ==========================================
// 悖论迷宫 · 节点事件弹窗
// enhance 迷宫强化：**校准式全屏开放式**（参考 CalibratePanel：无方形窗口，
//   卡片并排带角度升入 + 选中上浮/金色光晕 + 底部确定，三态动画 enter→select→exit）
// rest 可回血 30%；shop/event/treasure 暂为占位提示
// [2026-08-05 莉莉子] enhance 节点接入迷宫强化 3 选 1
// [2026-08-10 莉莉子] enhance 界面改版 v2：对齐校准呈现方式（程拍板：走通的路不重走）
// ==========================================
import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence, type Variants } from 'framer-motion';
import { Flame, ShoppingBag, HelpCircle, Gem, Flag, Sparkles, Trash2, Copy, MapPin, Search, Check, Layers, X, ListChecks, Sword, Shield } from 'lucide-react'; // [2026-10-10 开发者] +ListChecks · [2026-10-10 程实测] +Sword/Shield（战斗·装备类选项图标）
import type { RogueNodeType } from '../../../data/roguelike/mapLayout';
import type { MazeEnhancement } from '../../../data/roguelike/enhancements';
import { EnhancementCard } from './EnhancementCard';
import { ConfirmDialog } from '../ConfirmDialog'; // [2026-10-08 交互回响层 批次2] 通用二次确认（净化删卡 / 派卡探路）
// [2026-10-03 莉莉子] 多卡/多强化并排的**统一间距口径**（唯一出口，见该文件头注释）
import { GAP_HAND, GAP_ENH_TILTED, CARD_ROW_GAP_Y } from '../uiSpacing';
import { ROGUE_EVENT_TYPE_LABELS, ROGUE_EVENT_RARITY_LABELS, rarityOfEvent, resolveChoiceEffects, type RogueEvent, type RogueEventEffect } from '../../../data/roguelike/events'; // [2026-08-28 事件] · [2026-10-05 P2] +稀有度标签 · [2026-10-08 瓦尔基里大赛] +resolveChoiceEffects
// [2026-10-05 莉莉子 · 方案 P3/P4] 提示与执行**同一份真源**；`apply*` 的返回值用于结果步骤
import { previewEffects, type EventApplyResult } from '../../../data/roguelike/eventAppliers';
import type { RoguelikeRunState } from '../../../hooks/useRoguelikeRun'; // [2026-08-28 事件] 删卡用
import { CARD_DB } from '../../../data/cards'; // [2026-08-28 事件] 删卡名
import { getDialogueBg, getEventCg } from '../../../data/roguelike/dialogueBg'; // [2026-08-29 事件] 随机背景图 · [2026-10-08 瓦尔基里大赛] +getEventCg（事件专属 CG）
// [2026-08-31 莉莉子 开发者] 全量强化选择器依赖
import type { MazeBuff, EnhancementRarity } from '../../../data/roguelike/buffs';
import { getBattleEffects } from '../../../data/roguelike/buffs'; // [2026-09-29 莉莉子] 修：DevEnhBlock 用了它但漏了导入
import { RARITY_META } from '../RarityIcon';
import { TRIGGER_LABELS, EFFECT_LABELS } from '../RogueCodex';
import { eventBus, GameEvents } from '../../../utils/eventBus'; // [2026-10-14 莉莉子 🖱️] 事件/强化/休息 交互音效
import { Card } from '../../Card'; // [2026-09-06 莉莉子] 篝火/事件删卡：纯文字 chip → 完整卡面
import type { CardData } from '../../../types';
import { attachEquipment } from '../../../data/equipment';
// [2026-10-10 莉莉子 · 事件演出 v2 · 程需求 3] 中央奖励展示（强化卡 / 完整卡面 / 装备 A+B→C 三栏）
import { EventRewardShowcase } from './EventRewardShowcase';
// [2026-10-10 程实测] 选项按钮用**游戏内图标**（数据金 / 生命特效图），不再是一律紫色
import { CURRENCY_ICONS, EFFECT_IMAGES } from '../../../data/imageData';

// ══════════════════════════════════════════════════════════════════════
// 🎛️ 悖论迷宫 · **事件节点**（`NodeEventModal` 的 `type === 'event'` 分支）· 视觉调参区
// ──────────────────────────────────────────────────────────────────────
// 这一屏 = 地图上踩到事件节点后盖满全屏的那一层：背景 CG → 顶部「类型 / 稀有度 / 事件名」
//   → 中下方逐字打出的叙事 → 右侧平行四边形选项条（点两次确认）→ 结果阶段中央弹奖励。
// 管：①顶部标题 ②叙事文案 ③右侧选项栏 ④选项按钮 ⑤离开按钮 ⑥深层回响
//     ⑦删卡子步骤 ⑧开发者「事件列表」入口 ⑨删卡卡面按钮（`DeckPickCard`）
// 改完存盘即生效（HMR —— 雷电/电脑上 1~3 秒看到，不用出包）。
// 命名与用法**对齐 `TITLE_UI`**：值是**绝对画布 px**、直接进 style；注释标注**原 Tailwind 类**。
// 🔴 本调参区**只管事件分支**，别改错块：
//   · **篝火休整**分支已有自己的调参区 `REST_NODE_UI`（在文件下半部分）
//   · 强化三选一 / 商店·宝箱占位 / 开发者全量选择器 三种分支**仍一个旋钮都没有**
//     （按口径：做到需要调参的地方再说）
// ⚠️ ⑨ 那组是 `DeckPickCard`，与「篝火休整」**共用** ⇒ 改它**两屏一起变**（有意如此）。
// ⚠️ 两个 `max-w-*` 的陷阱（见 `panelMaxWidth` / `pickCardNameMaxWidth`）：原类被
//   `index.css:56` 的 `[class*="max-w-"]{max-width:none!important}` 打死过 ⇒ 默认必须写 `'none'`
//   把"改动前实际的样子"锁住；一旦填数字就会**突然真的生效、画面变窄**（`StyleSelector` 踩过同款）。
// ⚠️ 几处 `%` 值（`storyLeft` / `panelRight` / `panelWidth`）是**相对父容器**的百分比 ⇒ 两端一致，
//   不违反"禁用 vh/vw"那条铁律（铁律禁的是视口单位，不是 `%`）。
// ══════════════════════════════════════════════════════════════════════
export const EVENT_NODE_UI = {
    // ══ ① 顶部：类型 / 稀有度徽章 + 事件名 ═════════════════════════════
    /** 距顶 px（原 top-7 = 28） */
    headerTop: 28,
    /** 距左 px（原 left-10 = 40） */
    headerLeft: 40,
    /** 徽章行间距 px（原 gap-2 = 8） */
    badgeRowGap: 8,
    /** 徽章行与事件名之间 px（原 mb-2 = 8） */
    badgeRowMarginBottom: 8,
    /** 徽章字号 px（原 text-[11px] = 11） */
    badgeFontSize: 22,
    /** 徽章左右内边距 px（原 px-2.5 = 10） */
    badgePadX: 10,
    /** 徽章上下内边距 px（原 py-1 = 4） */
    badgePadY: 4,
    /** 事件名字号 px（原 text-4xl = 36） */
    titleFontSize: 72,

    // ══ ② 中下方：叙事文案 ═════════════════════════════════════════════
    /** 距左（原 left-[6%]，相对父容器） */
    storyLeft: '6%',
    /** 宽（原 w-[54%]） */
    storyWidth: '54%',
    /** 距底（原 bottom-[9%]） */
    storyBottom: '9%',
    /** 正文字号 px（原 text-[19px] = 19）· ⚠️ 行高交给 `leading-[2.05]` 类，**不要写死** */
    storyFontSize: 25,

    // ══ ③ 右侧：选项栏容器 ═════════════════════════════════════════════
    /** 距右（原 right-[4%]） */
    panelRight: '4%',
    /** 宽（原 w-[30%]） */
    panelWidth: '30%',
    /** 最小宽 px（原 min-w-[320px] = 320） */
    panelMinWidth: 320,
    /** 最大宽（原 max-w-[430px] —— **被 index.css:56 打死过**，故默认 'none' 锁住现状） */
    panelMaxWidth: 'none',
    /** 选项之间行距 px（原 gap-4 = 16） */
    panelGap: 32,

    // ══ ④ 选项按钮（长条平行四边形） ═══════════════════════════════════
    /** 左右内边距 px（原 px-6 = 24） */
    choicePadX: 24,
    /** 上下内边距 px（原 py-4 = 16） */
    choicePadY: 16,
    /** 图标与文字块之间 px（原 gap-4 = 16） */
    choiceInnerGap: 16,
    /** 图标尺寸 px（原 `<Sword size={22} />` 等 lucide 图标 = 22） */
    choiceIconSize: 22,
    /** 图片图标尺寸 px（原 w-7 h-7 = 28，用于生命 / 数据金） */
    choiceImgIconSize: 56,
    /** 行为文案字号 px（原 text-lg = 18） */
    choiceTitleFontSize: 27,
    /** 代价/奖励小字字号 px（原 text-[11.5px]） */
    choiceSubFontSize: 16,
    /** 小字与文案之间 px（原 mt-1 = 4） */
    choiceSubMarginTop: 4,

    // ══ ⑤ 离开按钮 ═════════════════════════════════════════════════════
    /** 结果阶段「离开」左右内边距 px（原 px-6 = 24） */
    leaveResultPadX: 24,
    /** 结果阶段「离开」上下内边距 px（原 py-4 = 16） */
    leaveResultPadY: 16,
    /** 结果阶段「离开」描边 px（原 border = 1） */
    leaveResultBorderWidth: 1,
    /** 选项阶段「离开」左右内边距 px（原 px-5 = 20） */
    leaveChoicePadX: 20,
    /** 选项阶段「离开」上下内边距 px（原 py-3 = 12） */
    leaveChoicePadY: 12,
    /** 选项阶段「离开」描边 px（原 border = 1） */
    leaveChoiceBorderWidth: 1,

    // ══ ⑥ 深层回响（只有带 `deepEcho` 的事件才进这一支） ════════════════
    /** 整体行距 px（原 gap-4 = 16） */
    deepGap: 16,
    /** 顶部信息行间距 px（原 gap-3 = 12） */
    deepHeadGap: 12,
    /** 顶部信息行字号 px（原 text-sm = 14） */
    deepHeadFontSize: 14,
    /** 「回声 ×N」徽章左右内边距 px（原 px-2 = 8） */
    deepChipPadX: 8,
    /** 徽章上下内边距 px（原 py-0.5 = 2） */
    deepChipPadY: 2,
    /** 徽章圆角 px（原 rounded-md = 6） */
    deepChipRadius: 6,
    /** 失手提示字号 px（原 text-sm = 14） */
    deepMsgFontSize: 14,
    /** 回响按钮左右内边距 px（原 px-5 = 20） */
    deepBtnPadX: 20,
    /** 回响按钮上下内边距 px（原 py-3.5 = 14） */
    deepBtnPadY: 14,
    /** 回手按钮描边 px（原 border = 1） */
    deepBtnBorderWidth: 1,

    // ══ ⑦ 删卡子步骤（全屏覆盖层） ═════════════════════════════════════
    /** 覆盖层左右内边距 px（原 px-12 = 48） */
    removePadX: 48,
    /** 覆盖层上下内边距 px（原 py-10 = 40） */
    removePadY: 40,
    /** 标题字号 px（原 text-lg = 18） */
    removeTitleFontSize: 18,
    /** 标题下方间距 px（原 mb-6 = 24） */
    removeTitleMarginBottom: 24,
    /** 空态字号 px（原 text-sm = 14） */
    removeEmptyFontSize: 14,
    /** 空态上下内边距 px（原 py-4 = 16） */
    removeEmptyPadY: 16,
    /** 卡面网格最大高 px（原 max-h-[651px] = 651 · `max-h` 不受那条 `!important` 影响，本来就是活的） */
    removeGridMaxHeight: 651,
    /** 底部按钮行间距 px（原 gap-3 = 12） */
    removeFooterGap: 12,
    /** 底部按钮行上方间距 px（原 mt-8 = 32） */
    removeFooterMarginTop: 32,
    /** 「返回」左右内边距 px（原 px-5 = 20） */
    removeBackPadX: 20,
    /** 「返回」上下内边距 px（原 py-2.5 = 10） */
    removeBackPadY: 10,
    /** 「返回」圆角 px（原 rounded-lg = 8） */
    removeBackRadius: 8,
    /** 「确认删除」左右内边距 px（原 px-6 = 24） */
    removeConfirmPadX: 24,
    /** 「确认删除」上下内边距 px（原 py-2.5 = 10） */
    removeConfirmPadY: 10,
    /** 「确认删除」圆角 px（原 rounded-lg = 8） */
    removeConfirmRadius: 8,

    // ══ ⑧ 开发者「事件列表」入口（只有开发者账号才渲染） ═══════════════
    /** 距顶 px（原 top-6 = 24） */
    devBtnTop: 24,
    /** 距右 px（原 right-6 = 24） */
    devBtnRight: 24,
    /** 图标与文字间距 px（原 gap-1.5 = 6） */
    devBtnGap: 6,
    /** 左右内边距 px（原 px-3 = 12） */
    devBtnPadX: 12,
    /** 上下内边距 px（原 py-1.5 = 6） */
    devBtnPadY: 6,
    /** 字号 px（原 text-xs = 12） */
    devBtnFontSize: 12,
    /** 图标尺寸 px（原 `<ListChecks size={14} />` = 14） */
    devBtnIconSize: 14,
    /** 描边 px（原 border = 1） */
    devBtnBorderWidth: 1,

    // ══ ⑨ 删卡卡面按钮（`DeckPickCard` · **与篝火休整共用**，改它两屏一起变） ══
    /** 卡面与卡名之间 px（原 gap-1.5 = 6） */
    pickCardGap: 6,
    /** 选中光晕外扩 px（原 -inset-1 = -4） */
    pickCardHaloInset: -4,
    /** 光晕圆角 px（原 rounded-xl = 12） */
    pickCardHaloRadius: 12,
    /** 光晕描边 px（原 border-2 = 2） */
    pickCardHaloBorderWidth: 2,
    /** 数量徽章上移 px（原 -top-1.5 = -6） */
    pickCardBadgeTop: -6,
    /** 数量徽章右移 px（原 -right-1.5 = -6） */
    pickCardBadgeRight: -6,
    /** 徽章左右内边距 px（原 px-1.5 = 6） */
    pickCardBadgePadX: 6,
    /** 徽章上下内边距 px（原 py-0.5 = 2） */
    pickCardBadgePadY: 2,
    /** 徽章描边 px（原 border = 1） */
    pickCardBadgeBorderWidth: 1,
    /** 徽章字号 px（原 text-xs = 12） */
    pickCardBadgeFontSize: 12,
    /** 卡名字号 px（原 text-[11px] = 11） */
    pickCardNameFontSize: 11,
    /** 卡名最大宽（原 max-w-[130px] —— **同样被 index.css:56 打死过**，默认 'none' 锁住现状） */
    pickCardNameMaxWidth: 'none',
} as const;

// ══════════════════════════════════════════════════════════════════════
// 🎛️ 悖论迷宫 · **篝火休整节点**（`NodeEventModal` 的 `type === 'rest'` 分支）· 视觉调参区
// ──────────────────────────────────────────────────────────────────────
// 这一屏 = 地图上踩到休整节点后弹出的橙色面板：
//   菜单态（休整 / 净化卡牌 / 复制卡牌 / 探路 四选一）→ 选卡态（挑一张牌）→ 二次确认。
// 管：①弹窗外壳 ②头部（火焰 + 标题 + 返回菜单）③菜单态四张行动卡 ④选卡态标题与空态
// 改完存盘即生效（HMR —— 雷电/电脑上 1~3 秒看到，不用出包）。
// 命名与用法**对齐 `TITLE_UI`**：值是**绝对画布 px**、直接进 style；注释标注**原 Tailwind 类**。
// 🔴 **本文件有两块调参区，别改错块**：
//   `EVENT_NODE_UI`（事件分支 · 文件顶部）· **本块 `REST_NODE_UI`（篝火休整分支）**
// ⚠️ 选卡态那些卡面按钮（`DeckPickCard`）的尺寸**不在本块** —— 它与事件删卡子步骤**共用**，
//   旋钮在 `EVENT_NODE_UI.pickCard*`（9 项），改那里**两处一起变**（有意如此）。
// ⚠️ 卡面的排布间距走共享常量 `GAP_HAND` / `CARD_ROW_GAP_Y`（`../uiSpacing`）⇒ 不在本块。
// ⚠️ 行动卡的网格列数是 `grid-cols-2 md:grid-cols-4`（**响应式类**，按**视口宽**判定而非画布）
//   ⇒ 刻意留在类名里没提参；要改列数说一声。
// ⚠️ 二次确认弹窗是共享件 `ConfirmDialog` ⇒ 不在本块（要调得单独排期）。
// ══════════════════════════════════════════════════════════════════════
export const REST_NODE_UI = {
    // ══ ① 弹窗外壳 ═══════════════════════════════════════════════════
    /** 面板宽 px（原 w-[920px] = 920） */
    panelWidth: 920,
    /** 面板最大高 px（原 max-h-[924px] = 924 · `max-h` 不受那条 `!important` 影响，本来就是活的） */
    panelMaxHeight: 924,
    /** 面板圆角 px（原 rounded-2xl = 16） */
    panelRadius: 16,
    /** 面板内边距 px（原 p-6 = 24） */
    panelPad: 24,
    /** 面板描边 px（原 border = 1） */
    panelBorderWidth: 1,

    // ══ ② 头部（火焰图标 + 「篝火 · 休整」+ 返回菜单） ════════════════
    /** 头部下距 px（原 mb-4 = 16） */
    headerMarginBottom: 16,
    /** 图标与标题间距 px（原 gap-3 = 12） */
    headerGap: 12,
    /** 火焰图标 px（原 <Flame size={28} /> = 28） */
    headerIconSize: 42,
    /** 标题字号 px（原 text-2xl = 24） */
    titleFontSize: 36,
    /** 「返回菜单」左右内边距 px（原 px-3 = 12） */
    backBtnPadX: 12,
    /** 「返回菜单」上下内边距 px（原 py-1 = 4） */
    backBtnPadY: 4,
    /** 「返回菜单」圆角 px（原 rounded-lg = 8） */
    backBtnRadius: 8,
    /** 「返回菜单」字号 px（原 text-xs = 12） */
    backBtnFontSize: 12,

    // ══ ③ 菜单态：四张行动卡 ═════════════════════════════════════════
    /** 顶部说明字号 px（原 text-sm = 14） */
    hintFontSize: 14,
    /** 顶部说明下距 px（原 mb-4 = 16） */
    hintMarginBottom: 16,
    /** 行动卡之间间距 px（原 gap-3 = 12） */
    gridGap: 12,
    /** 行动卡左右内边距 px（原 px-4 = 16） */
    actionPadX: 16,
    /** 行动卡上下内边距 px（原 py-4 = 16） */
    actionPadY: 16,
    /** 行动卡圆角 px（原 rounded-xl = 12） */
    actionRadius: 12,
    /** 行动卡描边 px（原 border = 1） */
    actionBorderWidth: 1,
    /** 行动卡内行距 px（原 gap-2 = 8） */
    actionGap: 8,
    /** 行动卡图标 px（原 <Flame size={20} /> 等四个 = 20） */
    actionIconSize: 20,
    /** 行动卡标题字号 px（原**没有** text-* 类 ⇒ 继承基准 16 · 全项目无 font-size 声明） */
    actionTitleFontSize: 16,
    /** 行动卡描述字号 px（原 text-[11px] = 11） */
    actionDescFontSize: 11,
    /** 描述与标题间距 px（原 mt-0.5 = 2） */
    actionDescMarginTop: 2,

    // ══ ④ 选卡态：标题与空态 ═════════════════════════════════════════
    /** 「净化 · 选择要移除的卡」字号 px（原 text-sm = 14） */
    selectLabelFontSize: 14,
    /** 该标题下距 px（原 mb-3 = 12） */
    selectLabelMarginBottom: 12,
    /** 空态字号 px（原 text-sm = 14） */
    emptyFontSize: 14,
    /** 空态上下内边距 px（原 py-4 = 16） */
    emptyPadY: 16,
} as const;

interface NodeEventModalProps {
    type: Exclude<RogueNodeType, 'battle' | 'elite' | 'boss'>;
    hp: number;
    maxHp: number;
    onRest: () => void; // 休息回血回调
    onClose: () => void;
    enhanceOptions?: MazeEnhancement[]; // [2026-08-05] 强化节点：可选的迷宫强化
    onEnhance?: (key: string) => void;  // [2026-08-05] 选择强化回调
    // [2026-08-28 事件]
    run?: RoguelikeRunState; // 事件删卡子步骤读取牌组
    event?: RogueEvent;     // 当前事件（type='event' 时传入）
    // [2026-10-05 · 方案 P3] 返回值 = "实际结果清单"（供结果步骤渲染）；`void` 兼容旧调用
    onEvent?: (eventId: string, choiceIndex: number, removePicks?: string[]) => EventApplyResult[] | void;
    /** [2026-10-08 莉莉子 · 交互回响层 批次3] 迎战类事件：结果步骤渲染「迎战」按钮 → 点击才切进战斗 */
    onEventFight?: () => void;
    /** [2026-10-05 · 方案 P4 §3] 「深层回响」结算：`layers` = 玩家最终带出的回声层数 */
    onEventDeep?: (eventId: string, layers: number) => EventApplyResult[] | void;
    // [2026-08-29] 强化三选一刷新
    onRefresh?: () => void; // 刷新迷宫强化（消耗刷新次数）
    refreshCount?: number;  // 剩余刷新次数
    // [2026-08-29 休整节点] 净化删卡 / 复制卡 / 探路
    onRemoveCard?: (cardKey: string) => void;
    onAddCard?: (cardKey: string) => void;
    onStartScout?: (cardKey: string) => void;
    // [2026-08-31 莉莉子 开发者] 开发者任意选强化（全量选择器）
    isDev?: boolean;                     // 开发者账号（dev_full_admin）→ enhance 节点走全量选择器
    devPlayerPool?: MazeBuff[];          // 全量玩家强化（PLAYER_ENHANCEMENTS，含通行证锁定）
    devEnemyPool?: MazeBuff[];           // 全量敌方强化（ENEMY_ELIGIBLE_BUFFS）
    ownedEnhancements?: string[];        // 已拥有强化 id（我方 Tab 已拥有角标，run.enhancements）
    onDevPick?: (playerIds: string[], enemyIds: string[]) => void; // 多选确认：玩家强化叠加 + 敌方强化注入下一场战斗
    /**
     * [2026-10-10 莉莉子 · 开发者「事件审阅台」]
     *   传入即在**事件分支右上角**渲染「事件列表」按钮（只有开发者账号会传）。
     *   为什么入口在弹窗内：事件弹窗是 `fixed inset-0 z-[700]` 全屏覆盖层，地图右上角的按钮会被盖住、点不到。
     *   点击后由 RogueMapScreen 打开 `DevEventPickerModal`（本组件不持有那个窗口）。
     */
    onOpenDevEventPicker?: () => void;
}

// ═══════════════════════════════════════════════════════════════
// [2026-09-06 莉莉子] 完整卡面选卡（篝火净化/复制/探路 + 事件删卡共用）
// 背景：原纯文字 chip（CARD_DB[key].name）玩家认不出是哪张卡；
//   统一升级为完整卡面手牌样式（复用 Card location="hand"，130×202）。
// ═══════════════════════════════════════════════════════════════

/** key → 完整 CardData（补全 runtime 字段 + 挂本局装备，装备 pips 随卡面展示） */
const deckCardToFull = (key: string, run?: RoguelikeRunState): CardData => {
    const base = CARD_DB[key];
    const full: CardData = { ...base, id: key, strikeCount: 0, animState: 'idle' as const, damageTaken: 0, buffs: { power: 0, health: 0 } };
    const eqs = run?.equippedCards?.[key];
    if (eqs?.length) for (const eid of eqs) return attachEquipment(full, eid);
    return full;
};

/** 完整卡面选项（可选中态 + 悬停放大 + 底部名字） */
const DeckPickCard: React.FC<{
    cardKey: string;
    run?: RoguelikeRunState;
    isSelected?: boolean;
    accent?: 'yellow' | 'red'; // 选中光晕色（默认黄；删卡场景用红）
    badge?: React.ReactNode;   // 右上角徽章（如 ×N）
    onClick?: () => void;
}> = ({ cardKey, run, isSelected, accent = 'yellow', badge, onClick }) => {
    const full = deckCardToFull(cardKey, run);
    const selBorder = accent === 'red'
        ? 'border-red-500 shadow-[0_0_18px_rgba(239,68,68,0.55)]'
        : 'border-yellow-400 shadow-[0_0_18px_rgba(234,179,8,0.55)]';
    const selText = accent === 'red' ? 'text-red-300' : 'text-yellow-300';
    return (
        <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onClick?.(); }}
            className={`group relative flex flex-col items-center transition-all outline-none
                ${isSelected ? 'scale-105' : 'hover:scale-[1.04] hover:-translate-y-1 cursor-pointer'}`}
            style={{ gap: EVENT_NODE_UI.pickCardGap }}
        >
            {/* 选中光晕（尺寸见 🎛️ EVENT_NODE_UI.pickCardHalo*） */}
            {isSelected && (
                <div
                    className={`absolute ${selBorder} z-10 pointer-events-none`}
                    style={{
                        inset: EVENT_NODE_UI.pickCardHaloInset,
                        borderRadius: EVENT_NODE_UI.pickCardHaloRadius,
                        borderWidth: EVENT_NODE_UI.pickCardHaloBorderWidth,
                        borderStyle: 'solid',
                    }}
                />
            )}
            {/* 完整卡面 */}
            <div className="relative z-0">
                <Card data={full} location="hand" isFaceUp skinId={0} />
                {/* 数量/右上徽章（尺寸见 🎛️ EVENT_NODE_UI.pickCardBadge*） */}
                {badge && (
                    <span
                        className={`absolute z-20 rounded-full bg-slate-900 font-black shadow ${accent === 'red' ? 'border-red-500/70 text-red-300' : 'border-yellow-400/70 text-yellow-300'}`}
                        style={{
                            top: EVENT_NODE_UI.pickCardBadgeTop,
                            right: EVENT_NODE_UI.pickCardBadgeRight,
                            paddingLeft: EVENT_NODE_UI.pickCardBadgePadX,
                            paddingRight: EVENT_NODE_UI.pickCardBadgePadX,
                            paddingTop: EVENT_NODE_UI.pickCardBadgePadY,
                            paddingBottom: EVENT_NODE_UI.pickCardBadgePadY,
                            borderWidth: EVENT_NODE_UI.pickCardBadgeBorderWidth,
                            borderStyle: 'solid',
                            fontSize: EVENT_NODE_UI.pickCardBadgeFontSize,
                        }}
                    >
                        {badge}
                    </span>
                )}
            </div>
            {/* 卡名（选中高亮/默认白，鼠标悬停高亮）（尺寸见 🎛️ EVENT_NODE_UI.pickCardName*） */}
            <span
                className={`font-bold text-center truncate transition-colors ${isSelected ? selText : 'text-gray-300 group-hover:text-white'}`}
                style={{
                    fontSize: EVENT_NODE_UI.pickCardNameFontSize,
                    maxWidth: EVENT_NODE_UI.pickCardNameMaxWidth,
                }}
            >
                {full.name}
            </span>
        </button>
    );
};

// [2026-08-31 莉莉子 开发者] 全量强化选择器：品质排序/筛选
const QUALITY_ORDER: EnhancementRarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'];
const QUALITY_RANK: Record<EnhancementRarity, number> = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4, mythic: 5 };

/** [2026-08-31 莉莉子 开发者] 全量强化信息块（对齐 RogueCodex 图鉴样式 + 选中/已拥有标记，可多选） */
const DevEnhBlock: React.FC<{ buff: MazeBuff; selected: boolean; owned?: boolean; onClick: () => void }> = ({ buff, selected, owned, onClick }) => {
    const meta = RARITY_META[buff.rarity];
    const trigger = getBattleEffects(buff)[0]?.trigger;
    const effectClass = getBattleEffects(buff)[0]?.effectClass;
    return (
        <button
            onClick={onClick}
            className={`relative rounded-2xl border p-4 flex flex-col gap-3 transition-all hover:scale-[1.03] hover:-translate-y-0.5 text-left w-full ${
                selected ? 'ring-2 ring-yellow-400' : ''
            }`}
            style={{
                background: meta.cardBg,
                borderColor: `${meta.color}55`,
                boxShadow: selected ? `0 0 22px ${meta.color}66` : `0 0 20px ${meta.color}1f`,
            }}
        >
            {selected && (
                <span className="absolute top-2 right-2 z-10 flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-black bg-yellow-400 text-black">
                    <Check size={11} strokeWidth={3} />已选
                </span>
            )}
            {owned && !selected && (
                <span className="absolute top-2 right-2 z-10 text-[10px] px-2 py-0.5 rounded-full font-mono bg-slate-800/80 text-gray-300 border border-white/15">已拥有</span>
            )}
            {/* 六边形图标（对齐 RogueCodex hexIcon） */}
            <div
                className="w-14 h-14 mx-auto flex items-center justify-center"
                style={{ clipPath: 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)', background: `${meta.color}18`, border: `1px solid ${meta.color}66` }}
            >
                <img src={buff.icon} alt={buff.name} className="w-full h-full object-cover" draggable={false} />
            </div>
            <div className="text-center text-sm font-bold tracking-wide truncate" style={{ color: '#fff', textShadow: `0 0 10px ${meta.color}66` }}>{buff.name}</div>
            <div className="flex flex-wrap justify-center gap-1.5">
                <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded font-mono" style={{ color: meta.color, border: `1px solid ${meta.color}44`, background: `${meta.color}11` }}>{meta.label}</span>
                {trigger && (
                    <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded font-mono text-cyan-300 border border-cyan-400/30 bg-cyan-400/10">{TRIGGER_LABELS[trigger]}</span>
                )}
            </div>
            <p className="text-gray-400 text-xs leading-snug line-clamp-3 min-h-[3rem]">{buff.description}</p>
            {effectClass && (
                <div className="mt-auto text-center">
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-mono text-purple-200 border border-purple-400/30 bg-purple-500/10">{EFFECT_LABELS[effectClass]}</span>
                </div>
            )}
        </button>
    );
};

const TITLES: Record<NodeEventModalProps['type'], { title: string; icon: React.ReactNode; desc: string }> = {
    start: { title: '起点 · 战旗', icon: <Flag size={32} className="text-green-400" />, desc: '旅程的起点，从这里踏入迷宫。' },
    enhance: { title: '迷宫强化', icon: <Sparkles size={32} className="text-violet-400" />, desc: '选择一项迷宫强化，获得永久的增益。' },
    rest: { title: '篝火 · 休整', icon: <Flame size={32} className="text-amber-400" />, desc: '在此停留，恢复 30% 生命值。' },
    shop: { title: '商店', icon: <ShoppingBag size={32} className="text-emerald-400" />, desc: '此地暂未开放，后续可购买卡牌 / 强化 / 删卡。' },
    event: { title: '未知事件', icon: <HelpCircle size={32} className="text-cyan-400" />, desc: '此地暂未开放，后续将提供随机事件选择。' },
    treasure: { title: '宝箱', icon: <Gem size={32} className="text-yellow-400" />, desc: '此地暂未开放，后续可获得免费强化 / 金币。' },
    // [2026-10-09 莉莉子 · 随机节点] 仅为补齐 `Record<RogueNodeType, …>`（新增类型必须补键）。
    //   ⚠️ 实际不可达：随机节点在 `generateMapLayout` 里就把 `type` 改写成真身，
    //   本弹窗属"进入之后"的界面 ⇒ 应当显示真身，不掩码（掩码只在**地图图标**与**预览面板**）。
    random: { title: '？？？', icon: <HelpCircle size={32} className="text-slate-400" />, desc: '？？？？' },
};

// ═══════════════════════════════════════════════════════════
//  [2026-10-10 莉莉子 · 程实测③] 选项按钮的**色调与图标按效果类型**走
//   程的原话：「不要固定是当前的没有新意的紫色」——
//     · 战斗类 → **红 + 宝剑**（沿用游戏的攻击表示）
//     · 生命类 → **绿 + 生命特效图**（`BUFF_Life` / `Healing`）
//     · 金币类 → **金 + 数据金图标**
//     · 其余   → 紫罗兰（保留原样式）
// ═══════════════════════════════════════════════════════════
type ChoiceTone = 'fight' | 'heal' | 'gold' | 'equip' | 'purge' | 'buff';

const choiceToneOf = (effects: RogueEventEffect[]): ChoiceTone => {
    if (effects.some(ef => !!ef.fight)) return 'fight';
    if (effects.some(ef => (ef.hp ?? 0) > 0 || (ef.hpPct ?? 0) > 0 || (ef.maxHp ?? 0) > 0 || (ef.revive ?? 0) > 0)) return 'heal';
    // [第 5 轮审查] 判据由"gold > 0"改成"gold ≠ 0"：**金币支出**（黑市、匠人加固）也该拿数据金图标
    if (effects.some(ef => typeof ef.gold === 'number' && ef.gold !== 0)) return 'gold';
    if (effects.some(ef => ef.removeCards || ef.removeEquipment)) return 'purge';
    if (effects.some(ef => ef.addEquipment || ef.addEquippedCard || ef.upgradeCard)) return 'equip';
    return 'buff';
};

const CHOICE_SKIN: Record<ChoiceTone, { box: string; boxSel: string; sub: string; subSel: string; icon: React.ReactNode }> = {
    fight: {
        box: 'border-red-400/45 bg-red-500/[0.12] hover:border-red-300/75 hover:bg-red-500/[0.22] hover:shadow-[0_0_28px_rgba(248,113,113,0.5)]',
        boxSel: 'border-red-300/90 bg-red-500/30 shadow-[0_0_42px_rgba(248,113,113,0.75)]',
        sub: 'text-red-100/75', subSel: 'text-red-50',
        icon: <Sword size={EVENT_NODE_UI.choiceIconSize} className="text-red-300" />,
    },
    heal: {
        box: 'border-emerald-400/45 bg-emerald-500/[0.12] hover:border-emerald-300/75 hover:bg-emerald-500/[0.22] hover:shadow-[0_0_28px_rgba(52,211,153,0.5)]',
        boxSel: 'border-emerald-300/90 bg-emerald-500/30 shadow-[0_0_42px_rgba(52,211,153,0.75)]',
        sub: 'text-emerald-100/75', subSel: 'text-emerald-50',
        icon: <img src={EFFECT_IMAGES.buffLife} alt="" className="object-contain"
                                            style={{ width: EVENT_NODE_UI.choiceImgIconSize, height: EVENT_NODE_UI.choiceImgIconSize }} />,
    },
    gold: {
        box: 'border-amber-400/45 bg-amber-500/[0.12] hover:border-amber-300/75 hover:bg-amber-500/[0.22] hover:shadow-[0_0_28px_rgba(251,191,36,0.5)]',
        boxSel: 'border-amber-300/90 bg-amber-500/30 shadow-[0_0_42px_rgba(251,191,36,0.75)]',
        sub: 'text-amber-100/75', subSel: 'text-amber-50',
        icon: <img src={CURRENCY_ICONS.dataGold} alt="" className="object-contain"
                                            style={{ width: EVENT_NODE_UI.choiceImgIconSize, height: EVENT_NODE_UI.choiceImgIconSize }} />,
    },
    equip: {
        // [第 5 轮审查] 程说"其它节点图标以此类推"⇒ 装备类单独一档（青 + 盾），不再是清一色紫
        box: 'border-cyan-400/45 bg-cyan-500/[0.12] hover:border-cyan-300/75 hover:bg-cyan-500/[0.22] hover:shadow-[0_0_28px_rgba(34,211,238,0.5)]',
        boxSel: 'border-cyan-300/90 bg-cyan-500/30 shadow-[0_0_42px_rgba(34,211,238,0.75)]',
        sub: 'text-cyan-100/75', subSel: 'text-cyan-50',
        icon: <Shield size={EVENT_NODE_UI.choiceIconSize} className="text-cyan-300" />,
    },
    purge: {
        // 删卡 / 交出装备 = 失去类 ⇒ 石色 + 垃圾桶
        box: 'border-slate-400/45 bg-slate-500/[0.12] hover:border-slate-300/75 hover:bg-slate-500/[0.22] hover:shadow-[0_0_28px_rgba(148,163,184,0.5)]',
        boxSel: 'border-slate-300/90 bg-slate-500/30 shadow-[0_0_42px_rgba(148,163,184,0.75)]',
        sub: 'text-slate-100/75', subSel: 'text-slate-50',
        icon: <Trash2 size={EVENT_NODE_UI.choiceIconSize} className="text-slate-300" />,
    },
    buff: {
        // 强化 / 改造 / 其余（保留原紫罗兰）
        box: 'border-white/20 bg-white/[0.07] hover:border-violet-300/60 hover:bg-white/[0.14] hover:shadow-[0_0_28px_rgba(167,139,250,0.45)]',
        boxSel: 'border-violet-300/80 bg-violet-500/25 shadow-[0_0_42px_rgba(167,139,250,0.7)]',
        sub: 'text-gray-300/90', subSel: 'text-violet-100',
        icon: <Sparkles size={EVENT_NODE_UI.choiceIconSize} className="text-violet-300" />,
    },
};

export const NodeEventModal: React.FC<NodeEventModalProps> = ({ type, hp, maxHp, onRest, onClose, enhanceOptions, onEnhance, run, event, onEvent, onEventFight, onEventDeep, onRefresh, refreshCount = 0, onRemoveCard, onAddCard, onStartScout, isDev, devPlayerPool, devEnemyPool, ownedEnhancements, onDevPick, onOpenDevEventPicker }) => {
    // [2026-10-10 程实测 BUG修复] **兜底**：`type` 在运行时可能不是 `TITLES` 的键
    //   （随机节点曾把 `battle` 传进来，见 RogueMapScreen 里那条强转）⇒ 旧写法直接 `TITLES[type].icon` 会白屏。
    //   现在退化成"未知节点"面板：最坏只是显示得不好看，绝不会把整个地图界面打崩。
    const meta = TITLES[type] ?? {
        title: '未知节点',
        icon: <HelpCircle size={32} className="text-slate-400" />,
        desc: '这里什么都没有。',
    };
    // [2026-08-10] 单选选中态：点击卡牌选中，底部确定生效
    const [selectedEnhanceId, setSelectedEnhanceId] = useState<string | null>(null);
    // [2026-08-10] 对齐校准三态动画：enter（升入）→ select（可交互）→ exit（确认后退出）
    const [animPhase, setAnimPhase] = useState<'enter' | 'select' | 'exit'>('enter');
    // [2026-08-31 莉莉子 开发者] 全量强化选择器状态（我方/敌方双 Tab + 多选）
    const [devTab, setDevTab] = useState<'player' | 'enemy'>('player');
    const [devSearch, setDevSearch] = useState('');
    const [devQualities, setDevQualities] = useState<Set<EnhancementRarity>>(new Set());
    const [devSelPlayer, setDevSelPlayer] = useState<Set<string>>(new Set());
    // [2026-08-31] 敌方 Tab 预选当前已注入的敌方强化（run.devEnemyEnhancements），便于查看/增删注入组合
    const [devSelEnemy, setDevSelEnemy] = useState<Set<string>>(new Set(run?.devEnemyEnhancements ?? []));
    // [2026-08-28 事件] 事件交互：选项 → 删卡子步骤
    // [2026-10-10 莉莉子 · 事件演出 v2] 步骤机重排（程需求 4）：
    //   `intro`（背景淡入 + 介绍逐字打出）→ `choices`（右侧按钮逐个弹入）
    //   →［`remove` 删卡子步骤］→ `aftermath`（文案换成"结果叙事"逐字打出 + 中央弹奖励）→ 离开
    const [eventStep, setEventStep] = useState<'intro' | 'choices' | 'remove' | 'aftermath'>('intro');
    // 选择后播出的**结果叙事**（`choice.story`；选完进 `aftermath` 时打进下方文案区）
    const [narrative, setNarrative] = useState('');
    // 单击＝选中（固定放大 + 微光），**再点一次才是确认**（程需求 4 的二次点击）
    const [selectedChoice, setSelectedChoice] = useState<number | null>(null);
    // 奖励层点过「收下」⇒ 右侧才浮出「离开」按钮（程需求 4 的收尾）
    const [rewardDismissed, setRewardDismissed] = useState(false);
    // 逐字打字机（见下方 effect）：当前已打出的片段 + 是否还在打
    const [typedText, setTypedText] = useState('');
    const [typing, setTyping] = useState(false);
    const [pendingChoice, setPendingChoice] = useState(0);
    // [2026-10-05 莉莉子 · 方案 P3] 「结果」步骤的内容：由 `onEvent` 回报的"实际发生了什么"
    const [eventResult, setEventResult] = useState<EventApplyResult[]>([]);
    // [2026-10-05 莉莉子 · 方案 P4 §3] 「深层回响」：当前层数 + 提示（失手时的说明）
    const [deepLayer, setDeepLayer] = useState(0);
    const [deepMsg, setDeepMsg] = useState('');
    const [removePicks, setRemovePicks] = useState<string[]>([]);
    // [2026-08-29 休整 v2] 篝火：菜单 / 选卡子步骤
    const [restStep, setRestStep] = useState<'menu' | 'select'>('menu');
    const [restMode, setRestMode] = useState<'remove' | 'copy' | 'scout'>('remove');
    // [2026-10-08 莉莉子 · 交互回响层 批次2] 不可逆动作的二次确认：
    //   净化 = **永久删卡** · 探路 = 卡离队 2 个节点；复制卡**不确认**（无害、且是"获得"不是"失去"）
    const [confirmPick, setConfirmPick] = useState<string | null>(null);
    /** 休整选卡：净化/探路 → 先弹二次确认；复制 → 直接执行 */
    const handleRestPick = (cardKey: string) => {
        if (restMode === 'remove' || restMode === 'scout') { setConfirmPick(cardKey); return; }
        if (restMode === 'copy') onAddCard?.(cardKey);
        onClose();
    };
    /** 二次确认通过后真正执行（结果回执由 App 侧 handler 负责，见 批次1） */
    const executeRestPick = (cardKey: string) => {
        if (restMode === 'remove') onRemoveCard?.(cardKey);
        else if (restMode === 'scout') onStartScout?.(cardKey);
        setConfirmPick(null);
        onClose();
    };
    // [2026-08-29 事件] 事件节点随机背景图（进弹窗固定一次，dialogue 图池）
    // [2026-10-08 莉莉子 · 瓦尔基里大赛] **事件专属 CG 优先**（数据里指定），否则沿用一局内固定的随机背景
    const eventBg = useMemo(() => getEventCg(event?.cg) ?? getDialogueBg(), [event?.cg]);

    useEffect(() => {
        const t = setTimeout(() => setAnimPhase('select'), 600);
        return () => clearTimeout(t);
    }, []);

    // ═══ [2026-10-10 莉莉子 · 事件演出 v2 · 程需求 4] 逐字打字机 ═══
    //   程的规格：「固定完整的出现时间区间，文字越多逐个出现得越快，但是有个保底的速度，
    //     不会是文字越少出现得越慢 —— 比如只有一个字，让这一个字占据完整区间就要好几秒」
    //   ⇒ 每字间隔夹进 [MIN_STEP, MAX_STEP]（**保底速度优先**），整段目标时长按 [MIN_TOTAL, MAX_TOTAL] 折算。
    //   ⚠️ 口径说明（第 4 轮审查指出旧注释说得太满）：**保底速度优先于总时长上限** ——
    //      `MIN_STEP = 22ms` 在字数超过约 145 时会接管，此时整段会超出 MAX_TOTAL（200 字 ≈ 4.4s）。
    //      当前全部事件文案最长约 70 字（≈3.2s），实际触不到；真要更长，宁可慢一点也不能挤成一团。
    const TYPE_MIN_STEP = 22;    // 每字最短间隔（太快看不清）
    const TYPE_MAX_STEP = 110;   // 每字最长间隔（太慢让人等）
    const TYPE_MIN_TOTAL = 800;  // 整段最短总时长
    const TYPE_MAX_TOTAL = 3200; // 整段最长总时长
    const TYPE_BASE = 52;        // 每字基准耗时（决定"多长算长"）
    // 当前该打出哪一段：介绍阶段打 `desc`；结果阶段打"结果叙事"（`choice.story`）
    // ⚠️ 兜底：还没补 story 的选项（文案是分批补齐的）在结果阶段**保持原介绍**，绝不让文案区变空白
    const typeTarget = type === 'event' && event
        ? (eventStep === 'aftermath' && narrative ? narrative : event.desc)
        : '';
    useEffect(() => {
        if (!typeTarget) { setTypedText(''); setTyping(false); return; }
        const chars = Math.max(1, typeTarget.length);
        const total = Math.min(TYPE_MAX_TOTAL, Math.max(TYPE_MIN_TOTAL, chars * TYPE_BASE));
        const step = Math.min(TYPE_MAX_STEP, Math.max(TYPE_MIN_STEP, Math.round(total / chars)));
        let i = 0;
        setTypedText('');
        setTyping(true);
        const timer = setInterval(() => {
            i += 1;
            setTypedText(typeTarget.slice(0, i));
            if (i >= chars) {
                clearInterval(timer);
                setTyping(false);
                // 介绍打完 ⇒ **自动**进入选项阶段（右侧按钮随即逐个弹入）
                setEventStep(prev => (prev === 'intro' ? 'choices' : prev));
            }
        }, step);
        return () => { clearInterval(timer); setTyping(false); };
    }, [typeTarget]);

    // [2026-08-28 事件] 效果 → 简短提示（选项卡片右侧展示代价/收益）
    // [2026-10-05 莉莉子 · 方案 P3/P4 结构重构] 选项上的"预演"文案改为**调用注册表**：
    //   提示与执行从此同一份真源（`data/roguelike/eventAppliers.previewEffects`）⇒ 不可能再各写一套、各漏一半。
    // [2026-10-08 难度分层] 选项上的"预演"必须吃本局难度，否则文案与实际结算不一致
    const effectHints = (effects: RogueEventEffect[]): string => previewEffects(effects, run?.difficulty);

    // [2026-08-28 事件] 点事件选项：含顶层 removeCards → 进删卡子步骤；否则直接回调
    const handleEventChoice = (i: number) => {
        if (!event || !onEvent) return;
        const removeCount = event.choices[i]?.effects.find(ef => ef.removeCards && !ef.forced)?.removeCards ?? 0;
        if (removeCount > 0) {
            setPendingChoice(i);
            setRemovePicks([]);
            setEventStep('remove');
            return;
        }
        // [2026-10-05 莉莉子 · 方案 P3] **执行后进「结果」阶段**（不再静默关窗）：
        //   `onEvent` 回报"实际发生了什么"（抽到哪张卡/哪个强化/哪件装备），玩家当场就能看到。
        // [2026-10-08 · 批次3] 所有路径都记下"选的是哪一项"（迎战按钮据此判断要不要显示）
        setPendingChoice(i);
        const res = onEvent(event.id, i) ?? [];
        setEventResult(res);
        // [2026-10-10 莉莉子 · 事件演出 v2] **统一进 `aftermath`**（程需求 4）：
        //   下方文案换成"选择后的结果叙事"并逐字打出（取 `choice.story`），**同时**中央弹出奖励/代价；
        //   点「收下」后右侧才浮出「离开」。
        //   ⚠️ 旧版把"有 story"与"无 story"拆成 `story` / `result` 两个步骤，演出是断的 —— 现合并成一条路。
        setNarrative(event.choices[i]?.story ?? '');
        setRewardDismissed(false);
        setEventStep('aftermath');
    };
    const removableDeck = run ? Array.from(new Set(run.deck.filter(k => !CARD_DB[k]?.isChampion))) : [];
    const removeNeeded = event?.choices[pendingChoice]?.effects.find(ef => ef.removeCards && !ef.forced)?.removeCards ?? 0;

    const handleConfirmEnhance = () => {
        if (!selectedEnhanceId) return;
        setAnimPhase('exit');
        setTimeout(() => {
            onEnhance?.(selectedEnhanceId);
            onClose();
        }, 500);
    };
    // [2026-08-29] 强化三选一刷新：清空选中 → 消耗刷新次数（外层处理）→ 重新生成候选
    const handleRefreshEnhance = () => {
        if (animPhase !== 'select') return;
        setSelectedEnhanceId(null);
        onRefresh?.();
    };
    // [2026-08-31 莉莉子 开发者] 全量选择器：品质筛选 chips 切换
    const toggleDevQuality = (q: EnhancementRarity) => {
        setDevQualities(prev => {
            const next = new Set(prev);
            if (next.has(q)) next.delete(q); else next.add(q);
            return next;
        });
    };
    const resetDevFilter = () => { setDevSearch(''); setDevQualities(new Set()); };
    // 过滤当前池（品质多选 OR + 文字搜索名称/描述，按品质排序）
    const devFiltered = useMemo(() => (pool: MazeBuff[] = []): MazeBuff[] => {
        const kw = devSearch.trim().toLowerCase();
        return pool
            .filter(b => {
                if (devQualities.size > 0 && !devQualities.has(b.rarity)) return false;
                if (kw) {
                    const hay = `${b.name} ${b.description}`.toLowerCase();
                    if (!hay.includes(kw)) return false;
                }
                return true;
            })
            .sort((a, b) => QUALITY_RANK[a.rarity] - QUALITY_RANK[b.rarity]);
    }, [devSearch, devQualities]);
    // 切换选中（多选）
    const toggleDevPick = (id: string, side: 'player' | 'enemy') => {
        const setter = side === 'player' ? setDevSelPlayer : setDevSelEnemy;
        setter(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };
    // 全量选择器确定：玩家强化多选叠加 + 敌方强化注入下一场战斗
    const handleDevConfirm = () => {
        if (devSelPlayer.size === 0 && devSelEnemy.size === 0) return;
        setAnimPhase('exit');
        setTimeout(() => {
            onDevPick?.(Array.from(devSelPlayer), Array.from(devSelEnemy));
            onClose();
        }, 450);
    };

    // ═══════════════════════════════════════════════
    //  迷宫强化 · 校准式全屏开放式（参考 CalibratePanel）
    // ═══════════════════════════════════════════════
    if (type === 'enhance') {
        // [2026-08-31 莉莉子 开发者] 开发者全量强化选择器：双 Tab + 多选叠加 + 筛选/搜索 + 已拥有角标
        if (isDev) {
            const playerPool = devPlayerPool ?? [];
            const enemyPool = devEnemyPool ?? [];
            const ownedSet = new Set(ownedEnhancements ?? []);
            const curPool = devTab === 'player' ? playerPool : enemyPool;
            const filtered = devFiltered(curPool);
            const devCount = devSelPlayer.size + devSelEnemy.size;
            const isCurSel = (id: string) => devTab === 'player' ? devSelPlayer.has(id) : devSelEnemy.has(id);
            return (
                <AnimatePresence>
                    <div className="fixed inset-0 z-[700] flex flex-col items-center justify-center">
                        <div className="absolute inset-0 bg-black/70 pointer-events-auto" onClick={(e) => e.stopPropagation()} />

                        <motion.div
                            initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}
                            className="relative z-10 w-[1100px] max-h-[924px] bg-slate-900/95 border border-violet-500/30 rounded-2xl shadow-2xl flex flex-col overflow-hidden"
                        >
                            {/* 头部：标题 + Tab 切换 + 关闭 */}
                            <div className="shrink-0 px-6 py-4 border-b border-white/10 flex items-center gap-4 flex-wrap">
                                <div className="flex items-center gap-3">
                                    <Layers size={22} className="text-violet-400" />
                                    <div>
                                        <h3 className="text-xl font-black tracking-widest text-white">迷宫强化 · 开发者全量</h3>
                                        <p className="text-[11px] text-violet-200/70 font-mono mt-0.5">DEV BUILD — 可多选叠加 · 我方立即生效 / 敌方注入下一场战斗</p>
                                    </div>
                                </div>
                                <div className="flex-1" />
                                <div className="flex items-center gap-1 p-1 rounded-xl bg-white/5 border border-white/10">
                                    <button onClick={() => setDevTab('player')}
                                        className={`px-4 py-1.5 rounded-lg text-sm font-black tracking-wider transition-all ${devTab === 'player' ? 'bg-emerald-500/25 text-emerald-300 border border-emerald-400/40' : 'text-gray-400 hover:text-white'}`}>
                                        我方强化 <span className="text-xs font-mono">{devSelPlayer.size ? `✓${devSelPlayer.size}` : playerPool.length}</span>
                                    </button>
                                    <button onClick={() => setDevTab('enemy')}
                                        className={`px-4 py-1.5 rounded-lg text-sm font-black tracking-wider transition-all ${devTab === 'enemy' ? 'bg-red-500/25 text-red-300 border border-red-400/40' : 'text-gray-400 hover:text-white'}`}>
                                        敌方强化 <span className="text-xs font-mono">{devSelEnemy.size ? `✓${devSelEnemy.size}` : enemyPool.length}</span>
                                    </button>
                                </div>
                                <button onClick={() => { eventBus.emit(GameEvents.UI_BACK); onClose(); }} className="p-1.5 rounded-md hover:bg-white/10 text-gray-400 hover:text-white transition-colors" title="返回地图 (ESC)">
                                    <X size={18} />
                                </button>
                            </div>

                            {/* 筛选栏：稀有度 chips + 搜索 + 计数 */}
                            <div className="shrink-0 px-6 py-3 border-b border-white/10 flex items-center gap-3 flex-wrap">
                                <div className="flex items-center gap-1.5">
                                    {QUALITY_ORDER.map(q => {
                                        const meta = RARITY_META[q];
                                        const on = devQualities.has(q);
                                        return (
                                            <button key={q} onClick={() => toggleDevQuality(q)}
                                                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all ${on ? '' : 'opacity-40 hover:opacity-80'}`}
                                                style={{ color: meta.color, borderColor: `${meta.color}55`, background: on ? `${meta.color}22` : 'transparent' }}>
                                                {meta.label}
                                            </button>
                                        );
                                    })}
                                </div>
                                <div className="relative flex-1 min-w-[160px] max-w-[280px]">
                                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                                    <input
                                        value={devSearch}
                                        onChange={e => setDevSearch(e.target.value)}
                                        placeholder="搜索强化…"
                                        className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-violet-400/60"
                                    />
                                </div>
                                {(devSearch || devQualities.size > 0) && (
                                    <button onClick={resetDevFilter} className="text-[11px] px-2 py-1 rounded-md text-gray-400 hover:text-white bg-white/5 border border-white/10">清除筛选</button>
                                )}
                                <span className="text-xs text-gray-500 font-mono ml-auto">{filtered.length} / {curPool.length}</span>
                            </div>

                            {/* 主体网格 */}
                            <div className="flex-1 overflow-y-auto p-5">
                                {filtered.length === 0 ? (
                                    <p className="text-gray-500 text-center py-10">没有匹配的强化</p>
                                ) : (
                                    <div className="grid grid-cols-[repeat(auto-fill,minmax(215px,1fr))] gap-3">
                                        {filtered.map(buff => (
                                            <DevEnhBlock key={buff.id} buff={buff}
                                                selected={isCurSel(buff.id)}
                                                owned={devTab === 'player' ? ownedSet.has(buff.id) : false}
                                                onClick={() => toggleDevPick(buff.id, devTab)} />
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* 底部：返回地图 + 确定 */}
                            <div className="shrink-0 px-6 py-4 border-t border-white/10 flex items-center justify-center gap-4">
                                <button onClick={() => { eventBus.emit(GameEvents.UI_BACK); onClose(); }} className="px-8 py-2.5 rounded-xl bg-white/10 font-bold text-gray-300 hover:bg-white/15 transition-colors">返回地图</button>
                                <button onClick={handleDevConfirm}
                                    disabled={devCount === 0}
                                    className={`px-12 py-2.5 rounded-xl font-black text-lg tracking-widest transition-all ${devCount > 0 ? 'bg-gradient-to-r from-violet-600 to-purple-400 hover:scale-105 hover:shadow-[0_0_30px_rgba(168,85,247,0.6)]' : 'bg-white/10 text-gray-500 cursor-not-allowed'}`}>
                                    确定{devCount > 0 && `（${devCount}）`}
                                </button>
                            </div>
                        </motion.div>
                    </div>
                </AnimatePresence>
            );
        }
        const opts = enhanceOptions ?? [];
        return (
            <AnimatePresence>
                <div className="fixed inset-0 z-[700] flex flex-col items-center justify-center">
                    {/* 全屏点击拦截层 */}
                    <div className="absolute inset-0 bg-black/70 pointer-events-auto" onClick={(e) => e.stopPropagation()} />

                    {/* 顶部标题 */}
                    {animPhase === 'select' && (
                        <motion.div
                            initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}
                            className="absolute top-[16%] left-0 right-0 w-full text-center pointer-events-auto"
                        >
                            <div className="flex items-center justify-center gap-3 mb-1">
                                <Sparkles size={34} className="text-violet-400" />
                                <h2 className="text-5xl font-black text-white drop-shadow-[0_5px_15px_rgba(0,0,0,0.8)] tracking-widest">迷宫强化</h2>
                            </div>
                            <p className="text-violet-200 mt-2 font-mono text-lg tracking-[0.2em] opacity-80">CHOOSE A MAZE ENHANCEMENT</p>
                        </motion.div>
                    )}

                    {/* 卡牌区域：并排 + 每张带角度 + 从下方升入 */}
                    <div className="relative flex items-center justify-center pointer-events-auto" style={{ marginTop: '63px' }}>
                        {/* [2026-10-03 莉莉子] 倾斜行的横向间距统一取 uiSpacing 口径：
                            强化卡 250×395 倾斜 ±9° 后包围盒宽 +59px，原来写死的 gap-6(24) ⇒ 相邻卡角重叠 */}
                        <div className="flex" style={{ gap: GAP_ENH_TILTED }}>
                            {opts.length > 0 ? (
                                <AnimatePresence>
                                    {opts.map((opt, index) => {
                                        const isSelected = selectedEnhanceId === opt.id;
                                        const angle = (index - (opts.length - 1) / 2) * 9; // 中心向两侧倾斜（程要求调大）
                                        const variants: Variants = {
                                            enter: {
                                                x: 0, y: 60, scale: 0.4, rotate: angle, opacity: 0,
                                                transition: { delay: index * 0.1, duration: 0.6, type: 'spring', damping: 18 },
                                            },
                                            select: {
                                                x: 0, y: isSelected ? -50 : 0,
                                                scale: isSelected ? 1.0 : 0.88,
                                                rotate: isSelected ? 0 : angle,
                                                opacity: 1,
                                                transition: { type: 'spring', stiffness: 300 },
                                            },
                                            exit: {
                                                x: 0, y: 80, scale: 0.3, opacity: 0, rotate: angle * 2,
                                                transition: { duration: 0.5, ease: 'easeInOut', delay: index * 0.06 },
                                            },
                                        };
                                        return (
                                            <motion.div
                                                key={opt.id}
                                                className="relative flex flex-col items-center cursor-pointer"
                                                variants={variants}
                                                initial="enter"
                                                animate={animPhase}
                                                exit="exit"
                                                onClick={() => { if (animPhase === 'select') { eventBus.emit(GameEvents.SFX_SELECT_UNIT); setSelectedEnhanceId(opt.id); } }}
                                            >
                                                {/* 选中光晕（不用 layoutId：切换时旧的直接卸载、新的原地出现，不再"飞过去"） */}
                                                {isSelected && animPhase === 'select' && (
                                                    <div className="absolute -inset-2 rounded-xl border-4 border-yellow-400 shadow-[0_0_25px_#eab308] z-0" />
                                                )}
                                                <div className="relative z-10 origin-bottom">
                                                    <EnhancementCard enhancement={opt} isSelected={isSelected} onClick={() => {}} />
                                                </div>
                                            </motion.div>
                                        );
                                    })}
                                </AnimatePresence>
                            ) : (
                                <button onClick={() => { eventBus.emit(GameEvents.UI_BACK); onClose(); }}
                                    className="px-8 py-2 rounded-lg bg-white/10 hover:bg-white/20 font-bold transition-colors">
                                    返回地图
                                </button>
                            )}
                        </div>
                    </div>

                    {/* 底部：刷新（确定左）+ 确定：flex 容器居中（不用 translate，避免被 framer-motion 的 transform 覆盖导致右偏） */}
                    {animPhase === 'select' && opts.length > 0 && (
                        <div className="absolute bottom-[10%] left-0 right-0 z-30 flex justify-center gap-4">
                            {onRefresh && (
                                <motion.button
                                    initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                                    onClick={(e) => { e.stopPropagation(); if (refreshCount > 0) { eventBus.emit(GameEvents.UI_CLICK); handleRefreshEnhance(); } }}
                                    disabled={refreshCount <= 0}
                                    className={`px-8 py-3 rounded-xl bg-white/10 font-black text-lg tracking-widest transition-all hover:scale-105 ${refreshCount > 0 ? 'text-cyan-300 hover:bg-cyan-500/20' : 'text-gray-600 cursor-not-allowed'}`}
                                >
                                    刷新({refreshCount})
                                </motion.button>
                            )}
                            <motion.button
                                initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                                onClick={(e) => { e.stopPropagation(); eventBus.emit(GameEvents.UI_CLICK); handleConfirmEnhance(); }}
                                disabled={!selectedEnhanceId}
                                className={`px-12 py-3 rounded-xl font-black text-lg tracking-widest transition-all
                                    ${selectedEnhanceId
                                        ? 'bg-gradient-to-r from-violet-600 to-purple-400 hover:scale-105 hover:shadow-[0_0_30px_rgba(168,85,247,0.6)]'
                                        : 'bg-white/10 text-gray-500 cursor-not-allowed'}`}
                            >
                                确定
                            </motion.button>
                        </div>
                    )}
                </div>
            </AnimatePresence>
        );
    }

    // ═══════════════════════════════════════════════
    //  [2026-08-28 事件] 事件节点：描述 + 选项卡片（含 Leave / 删卡子步骤）
    // ═══════════════════════════════════════════════
    if (type === 'event' && event) {
        // 迎战类事件：结果阶段的「离开」要提醒"回地图迎战"（该节点已登记为「待战」）
        // ⚠️ 必须走 `resolveChoiceEffects`：瓦尔基里大赛的 `fight` 写在 `effectsByDifficulty` 里，
        //   只读 `effects` 会永远判成"不战斗" ⇒ 按钮不提示"回地图迎战"（既有小缺陷，顺手收口）
        const willFight = !!onEventFight
            && !!resolveChoiceEffects(event.choices[pendingChoice], run?.difficulty).some(ef => !!ef.fight);
        // [2026-10-10 莉莉子 · 程实测④] **把"只是约一场架"从奖励语义里摘出去**：
        //   程的原话「我选择第三个选项居然弹出"所得入囊"战斗，这个东西怎么能算作奖励呢？」
        // ⚠️ [2026-10-10 第 5 轮独立审查] 判据**不能**用 `!hasRealOutcome` 一刀切：
        //   赌局胜负（"赌局：胜/负"）、强化池抽空（无产出）、"没有可追加装备的卡"这些结果**只有 info**，
        //   而事件结果没有第二个出口（不进经验流）⇒ 一刀切会让玩家"点完选择什么都不知道"。
        //   程真正不要的是"把战斗包装成奖励" ⇒ 只在【该选项会进战斗】且【没有任何真实得失】时跳过。
        const hasRealOutcome = eventResult.some(r => r.kind === 'gain' || r.kind === 'cost');
        const skipShowcase = !hasRealOutcome && willFight;
        /** 进入「结果」阶段：文案换成结果叙事逐字打出 + 中央弹奖励（三条路径共用：选项 / 删卡确认 / 深层回响结算） */
        const enterAftermath = (res: EventApplyResult[], text?: string) => {
            setEventResult(res);
            setNarrative(text ?? '');
            setRewardDismissed(false);
            setEventStep('aftermath');
        };
        return (
            <AnimatePresence>
                <div className="fixed inset-0 z-[700] overflow-hidden bg-black select-none">
                    {/* ① 背景：事件专属 CG 优先，否则本局固定的随机图 —— **放大淡入**（程需求 4 第一步） */}
                    <motion.img
                        src={eventBg}
                        alt=""
                        initial={{ scale: 1.14, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ duration: 1.1, ease: 'easeOut' }}
                        className="absolute inset-0 w-full h-full object-cover"
                    />
                    {/* ② 暗化：上轻下重 + 左右压边（保住画面，同时让文字可读） */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black via-black/55 to-black/15" />
                    <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-transparent to-black/50" />

                    {/* ③ 顶部：类型 / 稀有度 / 事件名 */}
                    <motion.div
                        initial={{ opacity: 0, y: -14 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.35, duration: 0.6 }}
                        className="absolute z-20"
                        style={{ top: EVENT_NODE_UI.headerTop, left: EVENT_NODE_UI.headerLeft }}
                    >
                        <div className="flex items-center" style={{ gap: EVENT_NODE_UI.badgeRowGap, marginBottom: EVENT_NODE_UI.badgeRowMarginBottom }}>
                            <span
                                className="rounded-full font-mono border border-violet-400/40 bg-violet-500/10 text-violet-300"
                                style={{
                                    fontSize: EVENT_NODE_UI.badgeFontSize,
                                    paddingLeft: EVENT_NODE_UI.badgePadX,
                                    paddingRight: EVENT_NODE_UI.badgePadX,
                                    paddingTop: EVENT_NODE_UI.badgePadY,
                                    paddingBottom: EVENT_NODE_UI.badgePadY,
                                }}
                            >
                                {ROGUE_EVENT_TYPE_LABELS[event.type]}事件
                            </span>
                            {/* [2026-10-05 莉莉子 · 方案 P2] 稀有度标签（由 weight 单一真源推导；普通档不显示以免噪音） */}
                            {ROGUE_EVENT_RARITY_LABELS[rarityOfEvent(event)] && (
                                <span className={`rounded-full font-mono border ${
                                    rarityOfEvent(event) === 'legend'
                                        ? 'border-amber-400/50 bg-amber-500/10 text-amber-300'
                                        : 'border-sky-400/40 bg-sky-500/10 text-sky-300'
                                }`}
                                    style={{
                                        fontSize: EVENT_NODE_UI.badgeFontSize,
                                        paddingLeft: EVENT_NODE_UI.badgePadX,
                                        paddingRight: EVENT_NODE_UI.badgePadX,
                                        paddingTop: EVENT_NODE_UI.badgePadY,
                                        paddingBottom: EVENT_NODE_UI.badgePadY,
                                    }}
                                >
                                    {ROGUE_EVENT_RARITY_LABELS[rarityOfEvent(event)]}
                                </span>
                            )}
                        </div>
                        <h2
                            className="font-black tracking-[0.12em] text-white drop-shadow-[0_3px_16px_rgba(0,0,0,0.95)]"
                            style={{ fontSize: EVENT_NODE_UI.titleFontSize }}
                        >{event.name}</h2>
                    </motion.div>

                    {/* ④ 中下方：叙事文案（**逐字打出**；选完换成"结果叙事"） */}
                    <div
                        className="absolute z-20"
                        style={{
                            left: EVENT_NODE_UI.storyLeft,
                            width: EVENT_NODE_UI.storyWidth,
                            bottom: EVENT_NODE_UI.storyBottom,
                        }}
                    >
                        <p
                            className={`leading-[2.05] whitespace-pre-line drop-shadow-[0_2px_10px_rgba(0,0,0,0.95)] ${
                                eventStep === 'aftermath' ? 'text-amber-50' : 'text-gray-100'
                            }`}
                            style={{ fontSize: EVENT_NODE_UI.storyFontSize }}
                        >
                            {typedText}
                            {typing && <span className="inline-block w-[2px] h-[1.05em] align-[-0.15em] bg-white/75 ml-0.5 animate-pulse" />}
                        </p>
                    </div>

                    {/* ⑤ 右侧：选项（平行四边形长条按钮）/ 深层回响 / 离开 */}
                    <div
                        className="absolute top-1/2 -translate-y-1/2 z-20 flex flex-col"
                        style={{
                            right: EVENT_NODE_UI.panelRight,
                            width: EVENT_NODE_UI.panelWidth,
                            minWidth: EVENT_NODE_UI.panelMinWidth,
                            maxWidth: EVENT_NODE_UI.panelMaxWidth,
                            gap: EVENT_NODE_UI.panelGap,
                        }}
                    >
                        {eventStep === 'remove' ? null : eventStep === 'aftermath' ? (
                            /* ── 结果阶段：叙事已在下方逐字播出、奖励在中央弹出 ⇒ 这里只留「离开」 ──
                               （点过「收下」之后才浮出，对应程需求 4 的最后一步） */
                            rewardDismissed || skipShowcase ? (
                                /* ⚠️ [第 4 轮审查修复] skew 必须放在**普通元素**上：framer-motion 会用 buildTransform
                                   整体覆盖 motion 元素自身的 `style.transform` ⇒ 原来外层 −13° 被吃掉、内层 +13° 反而生效，
                                   按钮斜向与其它选项**相反**。现在 motion 只管入场动画，skew 交给里面的 button。 */
                                <motion.div
                                    initial={{ opacity: 0, x: 30 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    className="w-full"
                                >
                                    <button
                                        onClick={() => { eventBus.emit(GameEvents.UI_BACK); onClose?.(); }}
                                        className={`w-full font-black tracking-[0.2em] transition-all ${
                                            willFight
                                                ? 'border-red-400/60 bg-gradient-to-r from-red-600/80 to-orange-500/80 hover:from-red-500 hover:to-orange-400 text-white'
                                                : 'border-white/25 bg-white/10 hover:bg-white/20 text-gray-100'
                                        }`}
                                        style={{
                                            transform: 'skewX(-13deg)',
                                            paddingLeft: EVENT_NODE_UI.leaveResultPadX,
                                            paddingRight: EVENT_NODE_UI.leaveResultPadX,
                                            paddingTop: EVENT_NODE_UI.leaveResultPadY,
                                            paddingBottom: EVENT_NODE_UI.leaveResultPadY,
                                            borderWidth: EVENT_NODE_UI.leaveResultBorderWidth,
                                            borderStyle: 'solid',
                                        }}
                                    >
                                        <span className="inline-block" style={{ transform: 'skewX(13deg)' }}>
                                            {/* [2026-10-10 程拍板 · 审查 P5] 补失败后果提示：
                                                归一后待战战斗 = 普通战斗（可耗复活、耗尽则本局败北），
                                                而原先这里只说"回地图迎战"、不提示代价。 */}
                                            {willFight ? '离开（回地图迎战 · 失败会消耗复活）⚔️' : '离开'}
                                        </span>
                                    </button>
                                </motion.div>
                            ) : null
                        ) : eventStep !== 'choices' ? null : event.deepEcho ? (
                            /* ═══ [2026-10-05 莉莉子 · 方案 P4 §3] 深层回响：一次进入内的 push-your-luck ═══
                               信息完全公开（每层成功率 + 代价都写在按钮上）；随时可收手；失手保底 1 层。
                               ⚠️ 全程在本弹窗内完成 ⇒ 不开任何"重复进入"的口子（反刷取红线）
                               [2026-10-10] 逻辑一行未改，只搬进新的右侧栏并接上 `aftermath` */
                            (() => {
                                const cfg = event.deepEcho;
                                const nextIdx = deepLayer; // 下一层的下标（deepLayer = 已带出的层数）
                                const hasNext = nextIdx < cfg.layers;
                                const prob = hasNext ? (cfg.probByLayer[nextIdx] ?? 1) : 0;
                                const costPct = hasNext ? (cfg.costPctByLayer[nextIdx] ?? 0) : 0;
                                const paidPct = cfg.costPctByLayer.slice(0, deepLayer).reduce((s, n) => s + n, 0);
                                // [2026-10-10 第 4 轮审查修复] **必须把 story 传进去**：此前不传 ⇒ `narrative=''`
                                //   ⇒ 文案回落成 `event.desc`（与介绍阶段**逐字符相同**）⇒ 打字机 effect 不重跑
                                //   ⇒ 深层回响的结果叙事永远不播（`events.ts` 里那条 story 成了死数据）
                                // [2026-10-10 第 5 轮审查] +`overrideStory`：失手时用专属叙事顶掉通用那条
                                const settle = (layers: number, overrideStory?: string) =>
                                    enterAftermath(onEventDeep?.(event.id, layers) ?? [], overrideStory ?? event.choices[0]?.story);
                                return (
                                    <div className="flex flex-col" style={{ gap: EVENT_NODE_UI.deepGap }}>
                                        <div className="flex items-center" style={{ gap: EVENT_NODE_UI.deepHeadGap, fontSize: EVENT_NODE_UI.deepHeadFontSize }}>
                                            <span
                                                className="rounded-md bg-violet-500/15 border border-violet-400/40 text-violet-200 font-black"
                                                style={{
                                                    paddingLeft: EVENT_NODE_UI.deepChipPadX,
                                                    paddingRight: EVENT_NODE_UI.deepChipPadX,
                                                    paddingTop: EVENT_NODE_UI.deepChipPadY,
                                                    paddingBottom: EVENT_NODE_UI.deepChipPadY,
                                                    borderRadius: EVENT_NODE_UI.deepChipRadius,
                                                }}
                                            >回声 ×{deepLayer}</span>
                                            {deepLayer > 0 && <span className="text-amber-200/80">已付出：生命上限 −{paidPct}%</span>}
                                        </div>
                                        {deepMsg && <p className="text-amber-300 font-bold" style={{ fontSize: EVENT_NODE_UI.deepMsgFontSize }}>{deepMsg}</p>}
                                        {hasNext ? (
                                            <>
                                                <button
                                                    onClick={() => { eventBus.emit(GameEvents.UI_CLICK); settle(Math.max(1, deepLayer)); }}
                                                    className="border-white/25 bg-white/10 hover:bg-white/20 text-gray-100 font-black tracking-widest transition-all"
                                                    style={{
                                                        paddingLeft: EVENT_NODE_UI.deepBtnPadX,
                                                        paddingRight: EVENT_NODE_UI.deepBtnPadX,
                                                        paddingTop: EVENT_NODE_UI.deepBtnPadY,
                                                        paddingBottom: EVENT_NODE_UI.deepBtnPadY,
                                                        borderWidth: EVENT_NODE_UI.deepBtnBorderWidth,
                                                        borderStyle: 'solid',
                                                    }}
                                                >
                                                    在此收手{deepLayer > 0 ? `（带走 ×${deepLayer}）` : ''}
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        eventBus.emit(GameEvents.UI_CLICK); if (Math.random() < prob) {
                                                            setDeepLayer(deepLayer + 1);
                                                            setDeepMsg('');
                                                        } else {
                                                            // [2026-10-10 第 5 轮审查修复] 这句提示此前**永远不可见**：
                                                            //   它只在 `eventStep === 'choices'` 的深层回响面板里渲染，
                                                            //   而这里同一批就 `settle(1)` 把步骤推进到 `aftermath`
                                                            //   ⇒ 玩家只看到"代价红卡 + 保底 1 件装备"，根本不知道自己失手了。
                                                            //   现在把它**作为结果叙事**带进 aftermath（失手率 25%~65%，不是边角情况）。
                                                            setDeepMsg('回声断了——这一层的东西全都散在了下面。');
                                                            settle(1, '回声断了——这一层的东西全都散在了下面。\n你只带回了最上面的那一层。');
                                                        }
                                                    }}
                                                    className="font-black tracking-widest text-white transition-all hover:scale-[1.02]"
                                                    style={{ background: 'linear-gradient(to right, #7c3aed, #a855f7)', paddingLeft: EVENT_NODE_UI.deepBtnPadX, paddingRight: EVENT_NODE_UI.deepBtnPadX, paddingTop: EVENT_NODE_UI.deepBtnPadY, paddingBottom: EVENT_NODE_UI.deepBtnPadY }}
                                                >
                                                    再深入一层（成功 {Math.round(prob * 100)}% · 代价 −{costPct}% 生命）
                                                </button>
                                            </>
                                        ) : (
                                            <button
                                                onClick={() => { eventBus.emit(GameEvents.UI_CLICK); settle(deepLayer); }}
                                                className="font-black tracking-widest text-white transition-all hover:scale-[1.02]"
                                                style={{ background: 'linear-gradient(to right, #7c3aed, #a855f7)', paddingLeft: EVENT_NODE_UI.deepBtnPadX, paddingRight: EVENT_NODE_UI.deepBtnPadX, paddingTop: EVENT_NODE_UI.deepBtnPadY, paddingBottom: EVENT_NODE_UI.deepBtnPadY }}
                                            >
                                                已到底——结算回声 ×{deepLayer}
                                            </button>
                                        )}
                                    </div>
                                );
                            })()
                        ) : eventStep === 'choices' ? (
                            /* ── 选项按钮（程需求 1 + 4）──
                               形态：**长条状平行四边形**，从上到下排满右侧
                               文案：**大字＝面对故事的"行为"**，小字＝代价 + 奖励
                               手感：悬停放大 + 微光 → 单击选中（固定放大 + 更亮微光）→ **再点一次才确认** */
                            <>
                                {event.choices.map((ch, i) => {
                                    const isSel = selectedChoice === i;
                                    const chEffects = resolveChoiceEffects(ch, run?.difficulty);
                                    // [2026-10-10 程实测③] 色调/图标按效果类型走（战斗红剑 / 生命绿心 / 金币金 / 其余紫）
                                    const skin = CHOICE_SKIN[choiceToneOf(chEffects)];
                                    return (
                                        <div
                                            key={i}
                                            style={{ transform: 'skewX(-13deg)' }}
                                            className={`border backdrop-blur-sm transition-all duration-200 ${isSel ? skin.boxSel : skin.box}`}
                                        >
                                            <motion.button
                                                initial={{ opacity: 0, x: 46 }}
                                                animate={{ opacity: 1, x: 0, scale: isSel ? 1.045 : 1 }}
                                                transition={{ delay: i * 0.13, type: 'spring', stiffness: 240, damping: 24 }}
                                                whileHover={{ scale: isSel ? 1.045 : 1.02 }}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    eventBus.emit(GameEvents.UI_CLICK); if (isSel) handleEventChoice(i); // 再点一次 ＝ 确认
                                                    else setSelectedChoice(i);        // 首点 ＝ 选中
                                                }}
                                                className="block w-full text-left"
                                                style={{
                                                    paddingLeft: EVENT_NODE_UI.choicePadX,
                                                    paddingRight: EVENT_NODE_UI.choicePadX,
                                                    paddingTop: EVENT_NODE_UI.choicePadY,
                                                    paddingBottom: EVENT_NODE_UI.choicePadY,
                                                }}
                                            >
                                                {/* ⚠️ [第 4 轮审查修复] 矫直放在**内层普通 div** 上：framer-motion 会用
                                                    buildTransform 覆盖 motion 元素自身的 `style.transform`
                                                    ⇒ 原来文字仍保持 −13° 斜切（等于没矫直）。 */}
                                                <div style={{ transform: 'skewX(13deg)', gap: EVENT_NODE_UI.choiceInnerGap }} className="flex items-center">
                                                    <span className="shrink-0">{skin.icon}</span>
                                                    <div className="min-w-0">
                                                        <div className="font-black text-white tracking-wide leading-tight" style={{ fontSize: EVENT_NODE_UI.choiceTitleFontSize }}>{ch.label}</div>
                                                        <div
                                                            className={`leading-snug ${isSel ? skin.subSel : skin.sub}`}
                                                            style={{ fontSize: EVENT_NODE_UI.choiceSubFontSize, marginTop: EVENT_NODE_UI.choiceSubMarginTop }}
                                                        >
                                                            {/* [2026-10-10 程实测①] `hint` = **手写覆盖**（多奖励只需一句概括 /
                                                                同事件不同选项难度分档）；没写才走注册表自动生成（与执行同源） */}
                                                            {ch.hint ?? effectHints(chEffects)}
                                                        </div>
                                                    </div>
                                                </div>
                                            </motion.button>
                                        </div>
                                    );
                                })}
                                {event.allowLeave !== false && (
                                    <button
                                        onClick={(e) => { e.stopPropagation(); eventBus.emit(GameEvents.UI_BACK); onClose(); }}
                                        className="border-white/15 bg-white/5 hover:bg-white/15 text-gray-300 font-bold tracking-widest transition-all"
                                        style={{
                                            transform: 'skewX(-13deg)',
                                            paddingLeft: EVENT_NODE_UI.leaveChoicePadX,
                                            paddingRight: EVENT_NODE_UI.leaveChoicePadX,
                                            paddingTop: EVENT_NODE_UI.leaveChoicePadY,
                                            paddingBottom: EVENT_NODE_UI.leaveChoicePadY,
                                            borderWidth: EVENT_NODE_UI.leaveChoiceBorderWidth,
                                            borderStyle: 'solid',
                                        }}
                                    >
                                        <span className="inline-block" style={{ transform: 'skewX(13deg)' }}>离开</span>
                                    </button>
                                )}
                            </>
                        ) : null}
                    </div>

                    {/* ⑥ 删卡子步骤：**全屏覆盖层**（卡面网格需要宽度，塞进右侧栏会挤成一团） */}
                    {eventStep === 'remove' && (
                        <div
                            className="absolute inset-0 z-40 bg-black/88 backdrop-blur-md flex flex-col items-center justify-center"
                            style={{
                                paddingLeft: EVENT_NODE_UI.removePadX,
                                paddingRight: EVENT_NODE_UI.removePadX,
                                paddingTop: EVENT_NODE_UI.removePadY,
                                paddingBottom: EVENT_NODE_UI.removePadY,
                            }}
                        >
                            <h4
                                className="font-black text-red-300 tracking-widest"
                                style={{ fontSize: EVENT_NODE_UI.removeTitleFontSize, marginBottom: EVENT_NODE_UI.removeTitleMarginBottom }}
                            >选择要删除的卡牌（{removePicks.length}/{removeNeeded}）</h4>
                            {removableDeck.length === 0 ? (
                                <p
                                    className="text-gray-500 text-center"
                                    style={{ fontSize: EVENT_NODE_UI.removeEmptyFontSize, paddingTop: EVENT_NODE_UI.removeEmptyPadY, paddingBottom: EVENT_NODE_UI.removeEmptyPadY }}
                                >牌组没有可删的牌</p>
                            ) : (
                                /* [2026-10-03 莉莉子 BUG修复] 手牌卡右侧外挂的装备/武装图标是绝对定位（外扩 ~31px），
                                   原来是 gap-3(12px) ⇒ 图标被邻卡压住。间距改取 uiSpacing 口径 */
                                <div
                                    className="flex flex-wrap justify-center overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                                    style={{ columnGap: GAP_HAND, rowGap: CARD_ROW_GAP_Y, maxHeight: EVENT_NODE_UI.removeGridMaxHeight }}
                                >
                                    {removableDeck.map(key => {
                                        const isPick = removePicks.includes(key);
                                        return (
                                            <DeckPickCard
                                                key={key}
                                                cardKey={key}
                                                run={run}
                                                isSelected={isPick}
                                                accent="red"
                                                badge={`×${run?.deck.filter(k => k === key).length ?? 1}`}
                                                onClick={() => { eventBus.emit(GameEvents.SFX_SELECT_UNIT); setRemovePicks(prev =>
                                                    isPick ? prev.filter(k => k !== key)
                                                        : prev.length < removeNeeded ? [...prev, key] : prev); }}
                                            />
                                        );
                                    })}
                                </div>
                            )}
                            <div className="flex justify-end" style={{ gap: EVENT_NODE_UI.removeFooterGap, marginTop: EVENT_NODE_UI.removeFooterMarginTop }}>
                                <button
                                    onClick={() => { eventBus.emit(GameEvents.UI_BACK); setSelectedChoice(null); setEventStep('choices'); }}
                                    className="bg-white/5 hover:bg-white/15 font-bold text-gray-300 transition-all"
                                    style={{
                                        paddingLeft: EVENT_NODE_UI.removeBackPadX,
                                        paddingRight: EVENT_NODE_UI.removeBackPadX,
                                        paddingTop: EVENT_NODE_UI.removeBackPadY,
                                        paddingBottom: EVENT_NODE_UI.removeBackPadY,
                                        borderRadius: EVENT_NODE_UI.removeBackRadius,
                                    }}
                                >返回</button>
                                <button
                                    disabled={removePicks.length < removeNeeded}
                                    onClick={() => { eventBus.emit(GameEvents.UI_CLICK); // [2026-10-05 · 方案 P3] 删卡确认后同样进「结果」阶段
                                        const res = onEvent?.(event.id, pendingChoice, removePicks) ?? [];
                                        enterAftermath(res, event.choices[pendingChoice]?.story);
                                    }}
                                    className={`font-black transition-all ${removePicks.length >= removeNeeded ? 'bg-red-600 hover:bg-red-500' : 'bg-white/5 text-gray-500 cursor-not-allowed'}`}
                                    style={{
                                        paddingLeft: EVENT_NODE_UI.removeConfirmPadX,
                                        paddingRight: EVENT_NODE_UI.removeConfirmPadX,
                                        paddingTop: EVENT_NODE_UI.removeConfirmPadY,
                                        paddingBottom: EVENT_NODE_UI.removeConfirmPadY,
                                        borderRadius: EVENT_NODE_UI.removeConfirmRadius,
                                    }}
                                >
                                    确认删除
                                </button>
                            </div>
                        </div>
                    )}

                    {/* ⑦ 奖励层：**画面中央弹出**（程需求 3）——
                        强化 / 卡牌 / 装备（A+B→C）/ 数值，逐项弹入；「收下」后右侧才出「离开」 */}
                    {eventStep === 'aftermath' && !rewardDismissed && !skipShowcase && (
                        <EventRewardShowcase
                            results={eventResult}
                            run={run}
                            onClose={() => setRewardDismissed(true)}
                        />
                    )}

                    {/* ⑧ 开发者「事件列表」入口（只有开发者账号会传该回调）
                        放在弹窗内而不是地图上：本弹窗是 z-[700] 全屏覆盖层，地图右上角的按钮会被盖住点不到。
                        任何步骤都能点 ⇒ 随时换事件重来。 */}
                    {onOpenDevEventPicker && (
                        <button
                            onClick={onOpenDevEventPicker}
                            title="开发者：打开事件审阅台，任意切换事件重新体验（整局状态回滚到进入本节点时）"
                            className="absolute z-50 flex items-center rounded-full bg-black/55 hover:bg-violet-600/70 backdrop-blur-sm border border-violet-300/40 hover:border-violet-200/70 text-violet-100 font-black tracking-wider transition-all"
                            style={{
                                top: EVENT_NODE_UI.devBtnTop,
                                right: EVENT_NODE_UI.devBtnRight,
                                gap: EVENT_NODE_UI.devBtnGap,
                                paddingLeft: EVENT_NODE_UI.devBtnPadX,
                                paddingRight: EVENT_NODE_UI.devBtnPadX,
                                paddingTop: EVENT_NODE_UI.devBtnPadY,
                                paddingBottom: EVENT_NODE_UI.devBtnPadY,
                                fontSize: EVENT_NODE_UI.devBtnFontSize,
                                borderWidth: EVENT_NODE_UI.devBtnBorderWidth,
                                borderStyle: 'solid',
                            }}
                        >
                            <ListChecks size={EVENT_NODE_UI.devBtnIconSize} />
                            事件列表
                        </button>
                    )}
                </div>
            </AnimatePresence>
        );
    }

    // ═══════════════════════════════════════════════
    //  [2026-08-29 休整 v2] 篝火营地：休整 / 净化 / 复制 / 探路
    // ═══════════════════════════════════════════════
    if (type === 'rest') {
        const restDeck = run ? Array.from(new Set(run.deck.filter(k => !!CARD_DB[k]))) : [];
        const restFiltered = restMode === 'scout'
            ? restDeck.filter(k => CARD_DB[k]?.type === 'unit' && !CARD_DB[k]?.isChampion)
            : restMode === 'remove'
                ? restDeck.filter(k => !CARD_DB[k]?.isChampion)
                : restDeck;
        const restChoices = [
            { key: 'rest', icon: <Flame size={REST_NODE_UI.actionIconSize} className="text-amber-400" />, title: '休整', desc: '恢复 30% 生命值', color: 'border-amber-500/40 hover:border-amber-400' },
            { key: 'remove', icon: <Trash2 size={REST_NODE_UI.actionIconSize} className="text-red-400" />, title: '净化卡牌', desc: '免费移除一张卡', color: 'border-red-500/40 hover:border-red-400' },
            { key: 'copy', icon: <Copy size={REST_NODE_UI.actionIconSize} className="text-blue-400" />, title: '复制卡牌', desc: '复制一张已有卡牌', color: 'border-blue-500/40 hover:border-blue-400' },
            { key: 'scout', icon: <MapPin size={REST_NODE_UI.actionIconSize} className="text-emerald-400" />, title: '探路', desc: '派单位卡探路，2 节点后带装备回归', color: 'border-emerald-500/40 hover:border-emerald-400' },
        ] as const;
        const restLabels: Record<string, string> = { remove: '净化 · 选择要移除的卡', copy: '复制 · 选择要复制的卡', scout: '探路 · 选择要派遣的单位卡' };
        return (
            <AnimatePresence>
                <div className="fixed inset-0 z-[700] flex items-center justify-center bg-black/80 backdrop-blur-sm">
                    <motion.div
                        initial={{ scale: 0.92, opacity: 0, y: 16 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.92, opacity: 0, y: 16 }}
                        className="border border-amber-500/30 bg-gradient-to-b from-slate-900 via-amber-950/40 to-slate-900 text-white shadow-[0_0_50px_rgba(245,158,11,0.15)] overflow-y-auto"
                        style={{ width: REST_NODE_UI.panelWidth, maxHeight: REST_NODE_UI.panelMaxHeight, borderRadius: REST_NODE_UI.panelRadius, padding: REST_NODE_UI.panelPad, borderWidth: REST_NODE_UI.panelBorderWidth, borderStyle: 'solid' }}
                    >
                        <div className="flex items-center justify-between" style={{ marginBottom: REST_NODE_UI.headerMarginBottom }}>
                            <div className="flex items-center" style={{ gap: REST_NODE_UI.headerGap }}>
                                <Flame size={REST_NODE_UI.headerIconSize} className="text-amber-400" />
                                <h3 className="font-black tracking-widest" style={{ fontSize: REST_NODE_UI.titleFontSize }}>篝火 · 休整</h3>
                            </div>
                            {restStep === 'select' && (
                                <button
                                    onClick={() => { eventBus.emit(GameEvents.UI_BACK); setRestStep('menu'); }}
                                    className="text-gray-400 hover:text-white bg-white/5 transition-colors"
                                    style={{ fontSize: REST_NODE_UI.backBtnFontSize, paddingLeft: REST_NODE_UI.backBtnPadX, paddingRight: REST_NODE_UI.backBtnPadX, paddingTop: REST_NODE_UI.backBtnPadY, paddingBottom: REST_NODE_UI.backBtnPadY, borderRadius: REST_NODE_UI.backBtnRadius }}
                                >返回菜单</button>
                            )}
                        </div>

                        {restStep === 'menu' ? (
                            <>
                                <p className="text-amber-200/70" style={{ fontSize: REST_NODE_UI.hintFontSize, marginBottom: REST_NODE_UI.hintMarginBottom }}>旅途中的休整地，选择一个行动（当前 HP {hp}/{maxHp}）</p>
                                <div className="grid grid-cols-2 md:grid-cols-4" style={{ gap: REST_NODE_UI.gridGap }}>
                                    {restChoices.map(c => {
                                        // [2026-10-08 莉莉子 · 交互回响层 批次2] 满血时「休整」= 白白用掉节点唯一机会
                                        //   ⇒ 直接置灰（不弹确认框：这里要的是"劝住"，不是"再问一次"）
                                        const blocked = c.key === 'rest' && hp >= maxHp;
                                        return (
                                            <button key={c.key}
                                                disabled={blocked}
                                                onClick={() => {
                                                    eventBus.emit(GameEvents.UI_CLICK); if (blocked) return;
                                                    if (c.key === 'rest') { onRest(); onClose(); }
                                                    else { setRestMode(c.key); setRestStep('select'); }
                                                }}
                                                style={{ paddingLeft: REST_NODE_UI.actionPadX, paddingRight: REST_NODE_UI.actionPadX, paddingTop: REST_NODE_UI.actionPadY, paddingBottom: REST_NODE_UI.actionPadY, borderRadius: REST_NODE_UI.actionRadius, gap: REST_NODE_UI.actionGap, borderWidth: REST_NODE_UI.actionBorderWidth, borderStyle: 'solid' }}
                                                className={`flex flex-col items-center bg-white/5 border transition-all ${blocked ? 'opacity-40 cursor-not-allowed border-white/10' : `hover:scale-[1.02] ${c.color}`}`}
                                            >
                                                <div className="shrink-0">{c.icon}</div>
                                                <div className="text-center">
                                                    <div className="font-black" style={{ fontSize: REST_NODE_UI.actionTitleFontSize }}>{c.title}</div>
                                                    <div className="text-gray-400 leading-snug" style={{ fontSize: REST_NODE_UI.actionDescFontSize, marginTop: REST_NODE_UI.actionDescMarginTop }}>{blocked ? '生命值已满' : c.desc}</div>
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            </>
                        ) : (
                            <>
                                <h4 className="font-bold text-gray-300" style={{ fontSize: REST_NODE_UI.selectLabelFontSize, marginBottom: REST_NODE_UI.selectLabelMarginBottom }}>{restLabels[restMode]}</h4>
                                {restFiltered.length === 0 ? (
                                    <p className="text-gray-500 text-center" style={{ fontSize: REST_NODE_UI.emptyFontSize, paddingTop: REST_NODE_UI.emptyPadY, paddingBottom: REST_NODE_UI.emptyPadY }}>牌组没有可选的卡</p>
                                ) : (
                                    /* [2026-10-03 莉莉子 BUG修复] 同「事件删卡」：让开卡面右侧外挂的装备/武装图标 */
                                    <div className="flex flex-wrap justify-center" style={{ columnGap: GAP_HAND, rowGap: CARD_ROW_GAP_Y }}>
                                        {restFiltered.map(key => (
                                            <DeckPickCard
                                                key={key}
                                                cardKey={key}
                                                run={run}
                                                onClick={() => { eventBus.emit(GameEvents.SFX_SELECT_UNIT); handleRestPick(key); }}
                                            />
                                        ))}
                                    </div>
                                )}
                            </>
                        )}
                    {/* [2026-10-08 莉莉子 · 交互回响层 批次2] 不可逆动作的二次确认（与节点弹窗同层，随 ScaleWrapper 缩放） */}
                    {confirmPick && (
                        <ConfirmDialog
                            title={restMode === 'remove'
                                ? `确定移除「${CARD_DB[confirmPick]?.name ?? confirmPick}」？`
                                : `确定派「${CARD_DB[confirmPick]?.name ?? confirmPick}」去探路？`}
                            desc={restMode === 'remove'
                                ? '净化会把它从本局牌组中永久移除。'
                                : '该单位会暂时离开牌组，2 个节点后带着一件随机装备回归。'}
                            notes={restMode === 'remove' ? ['此操作不可撤销'] : ['离队期间无法使用这张卡']}
                            confirmLabel={restMode === 'remove' ? '确认移除' : '确认派遣'}
                            tone={restMode === 'remove' ? 'danger' : 'normal'}
                            onConfirm={() => executeRestPick(confirmPick)}
                            onCancel={() => setConfirmPick(null)}
                        />
                    )}
                    </motion.div>
                </div>
            </AnimatePresence>
        );
    }

    // ═══════════════════════════════════════════════
    //  其余节点 · 保留原小窗布局
    // ═══════════════════════════════════════════════
    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-[700] flex items-center justify-center bg-black/80 backdrop-blur-sm">
                <motion.div
                    initial={{ scale: 0.9, opacity: 0, y: 20 }}
                    animate={{ scale: 1, opacity: 1, y: 0 }}
                    exit={{ scale: 0.9, opacity: 0, y: 20 }}
                    className="rounded-2xl bg-slate-900/95 border border-white/10 p-8 flex flex-col items-center gap-4 text-white min-w-[420px]"
                >
                    {meta.icon}
                    <h3 className="text-2xl font-black">{meta.title}</h3>
                    <p className="text-sm text-gray-300 text-center">{meta.desc}</p>

                    <button onClick={() => { eventBus.emit(GameEvents.UI_BACK); onClose(); }}
                        className="px-8 py-2 rounded-lg bg-white/10 hover:bg-white/20 font-bold transition-colors">
                        返回地图
                    </button>
                </motion.div>
            </div>
        </AnimatePresence>
    );
};
