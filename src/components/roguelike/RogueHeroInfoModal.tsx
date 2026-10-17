// ==========================================
// 悖论迷宫 · 天启者信息内容组件集合
// ①英雄手牌样式 ②牌库列表（手牌样式卡牌） ③等级效果条目（1-30 横条） ④神格神经图（占位）
// [2026-08-13 莉莉子] 由 RogueHeroSelect 内容区内联渲染（不弹窗）
// ==========================================
import React, { useMemo, useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom'; // [2026-08-26 莉莉子] 拖拽跟手图标 Portal 到 body，逃出 ScaleWrapper 缩放容器保证 1:1 跟手
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Sword, Shield, Zap, Ghost, Bird, X, RefreshCw, ChevronsRight, ChevronsLeft, Minus, Lock, Search, Filter, ChevronDown, ArrowUpNarrowWide, ArrowDownWideNarrow, RotateCcw, type LucideIcon } from 'lucide-react';
import { CARD_DB } from '../../data/cards';
import { LORE_DB } from '../../data/loreData'; // [2026-08-13] 总览背景故事
import type { CardData } from '../../types';
import { Card } from '../Card'; // [2026-08-13] 复用完整手牌样式卡牌渲染
import { CroppedAvatar } from '../CroppedAvatar'; // [2026-08-13] 圆环头像
import { getConfiguredStarterDeck } from '../../data/roguelike/rogueStarterDecks';
import { MAX_HERO_LEVEL, HERO_LEVEL_BONUS, getLevelColor, getLevelNumberColor, getHeroLevelBonus, combineArmamentRarity } from '../../data/roguelike/heroProgression'; // [2026-09-07] combineArmamentRarity：重修每槽品质档
import { readArmStock } from '../../data/roguelike/armamentStock'; // [2026-09-07] 武装数量库存
import type { HeroLevelBonus, ArmamentRarity } from '../../data/roguelike/heroProgression'; // [2026-09-07] ArmamentRarity：每槽可装备品质上限
import { getBuffById } from '../../data/roguelike/buffs';
import { getEquipmentById, getArmamentDefs, EQUIPMENT_DEFS, attachEquipment, type EquipmentDef } from '../../data/equipment';
import { getHeroArchetype, DIFFICULTY_LABELS, DIFFICULTY_COLORS } from '../../data/roguelike/heroArchetype'; // [2026-08-13] 流派档案
import { HERO_THEMES } from '../../data/roguelike/heroTheme'; // [2026-08-13] 主题色（阵营背景色，单一来源）
import { useHeroProgression } from '../../hooks/useHeroProgression'; // [2026-08-13] 等级界面经验数据
import { useArmamentConfig } from '../../hooks/useArmamentConfig'; // [2026-08-14 武装] 武装槽配置持久化
import { useCardGaze } from '../../hooks/useCardGaze'; // [2026-08-13] 悬停卡牌大图检视
import { FloatingCardPreview } from '../FloatingCardPreview'; // [2026-08-13] 悬停大图预览
import { eventBus, GameEvents } from '../../utils/eventBus'; // [2026-08-13] 弹窗音效
import { bindArmamentGaze } from './ArmamentPreview'; // [2026-08-26 莉莉子] 武装悬停大卡预览
import { MAX_DIVINITY_LEVEL, getDivinityNodes, getDivinityIconKey } from '../../data/roguelike/heroDivinity'; // [2026-09-28 神格神经]
import { useHeroDivinity } from '../../hooks/useHeroDivinity'; // [2026-09-28 神格神经] 解锁/碎片钱包
import { HERO_IMAGES, SPELL_IMAGES } from '../../data/imageData'; // [2026-09-29] 神格神经：中央卡面原画 + 节点技能图标
import { ShardIcon } from './ShardIcon'; // [2026-09-29 程拍板] 神格碎片图标（专属=头像菱形 / 万能=橙菱形）
import { FullArtOverlay } from '../Overlays'; // [2026-10-15 莉莉子 · 触屏] 触屏详情入口（本项目既有惯例：本地 viewCard + FullArtOverlay）

// [2026-08-13] 流派图标映射（lucide + 阵营主题色，对齐 heroTheme 单一来源）
const FACTION_ICONS: Record<string, { icon: LucideIcon; color: string }> = {
    lyfe: { icon: Shield, color: HERO_THEMES.lyfe.color },                   // Lyfe 蓝
    fenny: { icon: Zap, color: HERO_THEMES.fenny.color },                    // Fenny 橙
    pupu_specular_soul: { icon: Sparkles, color: HERO_THEMES.pupu_specular_soul.color }, // Pupu 红
    mauxir_lotus_drive: { icon: Ghost, color: HERO_THEMES.mauxir_lotus_drive.color },    // Mauxir 紫
    acacia_chrono_echo: { icon: Sword, color: HERO_THEMES.acacia_chrono_echo.color },    // Acacia 天蓝
    // [2026-09-16 茉莉安] 霄鹰 → Bird；品红阵营色。不放这里的话会落到 Shield 兜底（与里芙撞）
    marian: { icon: Bird, color: HERO_THEMES.marian.color },                  // Marian 品红
};

// ══════════════════════════════════════════════════════════════════════
// 🎛️ 天启者配置 · **总览页**（`OverviewContent`）· 视觉调参区（**程微调就改这里**）
// ──────────────────────────────────────────────────────────────────────
// 这一页 = 天启者配置界面**默认打开**的那一页（左：流派 + 难度 + 背景故事 ／ 右：手牌样式 + 确定选择）。
// 📌 原名 `OVERVIEW_GEOMETRY`，2026-10-16 按《规范-界面调参区》§4 统一改名成 `OVERVIEW_UI` —— **值全部未变**。
// 📌 本页只是「天启者配置」**六个页签之一**：外壳（返回／左列头像＋页签／内容窗／更换天启者）
//    在 `RogueHeroSelect.tsx` 的 `ROGUE_HERO_UI`；**本块只管页签里面**。
//    其余页签另有各自的小块：`LEVELS_UI` / `DECK_UI` / `LEVEL_REWARDS_UI`（弹窗）/ `ARMAMENT_UI` / `DIV_*` 常量族。
// ⚠️ 右半两张图（手牌样式 / 武装槽）的**内部尺寸不在这一段** —— 它们整体由 `handScale` 缩放；
//    其中武装槽的槽高 = `HAND_CARD_HEIGHT × handScale`（见本文件 `HAND_CARD_HEIGHT`）。
// ══════════════════════════════════════════════════════════════════════
export const OVERVIEW_UI = {
    // ── 布局（原 `OVERVIEW_GEOMETRY`，值未变）────────────────────────────
    topGap: 200,           // 三个窗口离内容区顶部的距离（程可微调，px）
    topRowHeight: 300,    // 上排（流派/难度）窗口高度（≈ 初始牌组按钮顶部对齐；背景故事从此向下延伸到底部）
    rightWidth: 400,      // 卡牌样式区域宽度（≈ 画面右侧 1/3，设计宽 1680）
    handScale: 2.5,       // 卡牌样式放大倍数（180px × 2.4 ≈ 432px，抵画面右侧 1/3）
    handOffsetTop: 60,     // [2026-08-14] 右侧卡牌样式垂直位置偏移 px（正向下/负向上，程可微调）
    armamentGap: 36,      // [2026-08-14] 卡面与右侧武装槽组的间隔 px（程可微调）
    gap: 136,              // [2026-08-14] 卡面与左侧栏位（流派/难度/背景故事）的间距 px（程可微调，对齐 DECK_GEOMETRY.gap）

    // ── 上排：流派 / 难度 两个窗口 ─────────────────────────────────────
    /** 两个窗口之间间距 px（原 gap-3 = 12） */
    rowGap: 12,
    /** 窗口内「图标 → 标题 → 说明」纵向间距 px（原 gap-2 = 8） */
    panelGap: 8,
    /** 窗口内边距 px（原 p-3.5 = 14） */
    panelPad: 14,
    /** 窗口圆角 px（原 rounded-xl = 12） */
    panelRadius: 12,
    /** 流派图标 px（原 `<FIcon size={44} />`） */
    factionIconSize: 66,
    /** 流派名 / 难度名 字号 px（原 text-2xl = 24） */
    panelTitleFontSize: 36,
    /** 窗口说明文字字号 px（原 text-xs = 12） */
    panelDescFontSize: 18,
    /** 难度那 5 个三角的尺寸 px（原 `w-9 h-9` = 36） */
    diffTriangleSize: 48,
    /** 难度三角之间间距 px（原 gap-1 = 4） */
    diffTriangleGap: 4,

    // ── 背景故事块 ─────────────────────────────────────────────────────
    /** 距上排窗口 px（原 mt-3 = 12） */
    loreMarginTop: 12,
    /** 内边距 px（原 p-4 = 16） */
    lorePad: 16,
    /** 圆角 px（原 rounded-xl = 12） */
    loreRadius: 12,
    /** 「背景故事」标签字号 px（原 text-xs = 12） */
    loreLabelFontSize: 24,
    /** 标签与正文的间距 px（原 mb-2 = 8） */
    loreLabelMarginBottom: 8,
    /** 背景故事正文字号 px（原 text-sm = 14） */
    loreTextFontSize: 24,

    // ── 右半：手牌样式 + 确定选择 ───────────────────────────────────────
    /** 卡面 ↔ 确定按钮 纵向间距 px（原 gap-4 = 16） */
    handColumnGap: 16,
    /** 确定按钮左右内边距 px（原 px-10 = 40） */
    confirmPadX: 40,
    /** 确定按钮上下内边距 px（原 py-3 = 12） */
    confirmPadY: 12,
    /** 确定按钮圆角 px（原 rounded-xl = 16） */
    confirmRadius: 16,
    /** 确定按钮字号 px（原 text-lg = 18）—— 外壳里那个同款按钮在 `ROGUE_HERO_UI.confirmFontSize` */
    confirmFontSize: 18,
};

// ══════════════════════════════════════════════════════════════════════
// 🎛️ 天启者配置 · **天启者等级页**（`LevelsContent`）· 视觉调参区（**程微调就改这里**）
// ──────────────────────────────────────────────────────────────────────
// 这一页 = 竖排三块：①圆环头像 + 经验数字 ②「下一个等级奖励」横条（+ 开发者加减级按钮）③查看全部按钮。
// 📌 原名 `LEVELS_GEOMETRY`，2026-10-16 按手册 §4 改名 `LEVELS_UI` 并补齐页内尺寸（**原值全部未变**）。
// ⚠️ 「所有等级奖励」那个弹窗（`LevelRewardsModal`）的尺寸在文件顶部的 `LEVEL_REWARDS_UI`，**不在本块**。
// ══════════════════════════════════════════════════════════════════════
export const LEVELS_UI = {
    // ── 布局（原 `LEVELS_GEOMETRY`，值未变）──
    topGap: 100,           // 三个区域离内容区顶部的距离（程可微调，px）
    avatarSize: 400,       // 区域1 圆环头像直径 px（缩放大小）
    rewardWidth: 1000,      // 区域2 下一个等级奖励长方形宽度 px

    // ── 整页 ──
    /** 三个区域之间纵向间距 px（原 gap-5 = 20） */
    sectionGap: 20,
    /** 整页上下内边距 px（原 py-2 = 8） */
    pagePadY: 8,

    // ── 区域 1：头像 + 经验 ──
    /** 头像 ↔ 经验数字 间距 px（原 gap-2.5 = 10） */
    avatarBlockGap: 10,
    /** 经验数字字号 px（原 text-xl = 20） */
    expFontSize: 40,

    // ── 区域 2：下一个等级奖励 ──
    /** 「下一个等级奖励：」标题 ↔ 奖励条 间距 px（原 gap-2 = 8） */
    rewardBlockGap: 8,
    /** 标题字号 px（原 text-sm = 14） */
    rewardTitleFontSize: 28,
    /** 奖励条内「等级圆 ↔ 文字」间距 px（原 gap-5 = 20） */
    rewardRowGap: 20,
    /** 奖励条左右内边距 px（原 px-6 = 24） */
    rewardPadX: 24,
    /** 奖励条上下内边距 px（原 py-4 = 16） */
    rewardPadY: 16,
    /** 奖励条圆角 px（原 rounded-2xl = 16） */
    rewardRadius: 16,
    /** 等级数字圆直径 px（原 w-16 h-16 = 64） */
    levelCircleSize: 96,
    /** 等级数字字号 px（原 text-4xl = 36） */
    levelNumberFontSize: 72,
    /** 「短名 ↔ 完整效果」间距 px（原 gap-1 = 4） */
    rewardTextGap: 4,
    /** 奖励短名字号 px（原 text-xl = 20） */
    rewardLabelFontSize: 40,
    /** 奖励完整效果字号 px（原 text-base = 16） */
    rewardValueFontSize: 32,

    // ── 区域 3：按钮行 ──
    /** 按钮之间间距 px（原 gap-2 = 8） */
    btnRowGap: 8,
    /** 开发者加减级按钮尺寸 px（原 w-11 h-11 = 44） */
    devBtnSize: 44,
    /** 开发者按钮圆角 px（原 rounded-xl = 12） */
    devBtnRadius: 12,
    /** 开发者按钮字号 px（原 text-2xl = 24） */
    devBtnFontSize: 24,
    /** 「查看所有天启者等级奖励」左右内边距 px（原 px-8 = 32） */
    viewAllPadX: 32,
    /** 上下内边距 px（原 py-3 = 12） */
    viewAllPadY: 12,
    /** 圆角 px（原 rounded-xl = 12） */
    viewAllRadius: 12,
    /** 字号 px（原 text-base = 16） */
    viewAllFontSize: 32,
};

// ══════════════════════════════════════════════════════════════════════
// 🎛️ 天启者配置 · **初始牌组页**（`DeckContent`）· 视觉调参区（**程微调就改这里**）
// ──────────────────────────────────────────────────────────────────────
// 这一页 = 左「卡牌列表（横条 + 悬停大图检视 + 后方武装图标）」／右「手牌样式大图（无按钮）」。
// 📌 原名 `DECK_GEOMETRY`，2026-10-16 按手册 §4 改名 `DECK_UI` 并补齐页内尺寸（**原值全部未变**）。
// 🔴 `listRowGap` 是把原来的 `space-y-2` 换成 **flex 列 + gap** 实现的 ——
//    因此每一行必须带 `shrink-0`：**列方向 flex 会压扁子项**，不补就会出现"行被压扁、滚动区反而滚不动"
//    （2026-10-16 在备战枢纽上踩过同一条，别再犯）。
// ══════════════════════════════════════════════════════════════════════
export const DECK_UI = {
    // ── 布局（原 `DECK_GEOMETRY`，值未变）──
    topGap: 75,            // 整体距离内容区顶部 px
    listWidth: 700,        // 左侧卡牌列表宽度 px（[2026-08-26] 收窄，武装图标放每行卡牌后方独立区）
    gap: 150,               // 手牌样式与左侧列表间距 px
    handScale: 2.5,        // 右侧手牌样式缩放大小
    handOffsetTop: 100,      // 右侧手牌样式垂直位置偏移 px
    armamentGap: 24,       // [2026-08-14] 卡面与右侧武装槽组的间隔 px（程可微调）

    // ── 左侧卡牌列表 ──
    /** 列表右侧留白 px（原 pr-2 = 8） */
    listPadRight: 8,
    /** 卡行之间纵向间距 px（原 space-y-2 = 8，现由 flex 列 + gap 实现） */
    listRowGap: 8,
    /** 单个卡行内「横条 ↔ 武装图标区」间距 px（原 gap-2.5 = 10） */
    rowGap: 10,
    /** 卡条高度 px（原 h-14 = 56） */
    rowHeight: 84,
    /** 卡条圆角 px（原 rounded-lg = 8） */
    rowRadius: 8,
    /** 卡条内左右内边距 px（原 px-4 = 16） */
    rowPadX: 16,
    /** 「费用圆 ↔ 卡名」间距 px（原 gap-3 = 12） */
    costGap: 12,
    /** 费用圆直径 px（原 w-7 h-7 = 28） */
    costSize: 56,
    /** 费用数字字号 px（原 text-sm = 14） */
    costFontSize: 28,
    /** 费用圆描边粗细 px（原 border = 1） */
    costBorderWidth: 1,
    /** 卡名字号 px（原 text-base = 16） */
    nameFontSize: 32,
    /** 后方武装图标（六边形）尺寸 px（原 w-10 h-10 = 40） */
    equipIconSize: 80,
    /** 多个武装时的「Xn」字号 px（原 text-sm = 14） */
    equipFontSize: 28,
};

// ══════════════════════════════════════════════════════════════════════
// 🎛️ 天启者配置 · **所有等级奖励弹窗**（`LevelRewardsModal`）· 视觉调参区（**程微调就改这里**）
// ──────────────────────────────────────────────────────────────────────
// 这一块 = 等级页点「查看所有天启者等级奖励」后弹出来的那个窗（标题栏 + 1~30 级奖励列表，可滚动）。
// 📌 2026-10-16 新建：尺寸原先散在 `LevelRewardsModal` 的 JSX 里（`LEVELS_UI` 只管等级页本体）。
// 🔴 列表原为 `space-y-2` —— 已按本文件惯例改成 **flex 列 + gap**（`rowGap`），
//    因此每一行都补了 `shrink-0`：**列方向 flex 会压扁子项**，不补会出现「行被压扁、滚动区反而滚不动」
//    （同 `DECK_UI.listRowGap` 那条踩坑记录）。
// ══════════════════════════════════════════════════════════════════════
export const LEVEL_REWARDS_UI = {
    // ── ① 弹窗主体 ──
    /** 弹窗宽度 px（原 w-[720px]） */
    panelWidth: 720,
    /** 弹窗最大高度（原 max-h-[80%]，**保持百分比**，不换算 px） */
    panelMaxHeightPct: '80%',
    /** 弹窗圆角 px（原 rounded-2xl = 16） */
    panelRadius: 16,
    /** 弹窗描边粗细 px（原 border = 1） */
    panelBorderWidth: 1,

    // ── ② 标题栏 ──
    /** 标题栏左右内边距 px（原 px-6 = 24） */
    headerPadX: 24,
    /** 标题栏上下内边距 px（原 py-4 = 16） */
    headerPadY: 16,
    /** 标题栏下边框粗细 px（原 border-b = 1） */
    headerBorderWidth: 1,
    /** 「天启者等级奖励」字号 px（原 text-xl = 20） */
    titleFontSize: 40,
    /** 关闭按钮内边距 px（原 p-2 = 8） */
    closePad: 8,
    /** 关闭叉号图标 px（原 `<X size={20} />`） */
    closeIconSize: 40,

    // ── ③ 奖励列表 ──
    /** 列表内边距 px（原 p-4 = 16） */
    listPad: 16,
    /** 行与行之间纵向间距 px（原 space-y-2 = 8，现由 flex 列 + gap 实现） */
    rowGap: 8,
    /** 单行内「等级圆 ↔ 文字」间距 px（原 gap-4 = 16） */
    rowInnerGap: 16,
    /** 单行左右内边距 px（原 px-4 = 16） */
    rowPadX: 16,
    /** 单行上下内边距 px（原 py-2.5 = 10） */
    rowPadY: 10,
    /** 单行圆角 px（原 rounded-xl = 12） */
    rowRadius: 12,
    /** 单行描边粗细 px（原 border = 1） */
    rowBorderWidth: 1,
    /** 等级数字圆直径 px（原 w-12 h-12 = 48） */
    levelCircleSize: 72,
    /** 等级数字字号 px（原 text-2xl = 24） */
    levelNumberFontSize: 36,
    /** 「短名 ↔ 完整效果」间距 px（原 gap-0.5 = 2） */
    textGap: 2,
    /** 奖励短名字号 px（原 text-base = 16） */
    labelFontSize: 32,
    /** 奖励完整效果字号 px（原 text-sm = 14） */
    valueFontSize: 28,
} as const;

// ══════════════════════════════════════════════════════════════════════
// 🎛️ 天启者配置 · **武装页**（`ArmamentContent`）+ 武装共享件 · 视觉调参区（**程微调就改这里**）
// ──────────────────────────────────────────────────────────────────────
// 这一块 = 武装页：左手牌样式 ／ 中 3 个武装槽（+ 更换·卸载按钮）／ 右侧武装库抽屉 ／ 右缘开合按钮 ／ 拖拽跟手图标。
// 🔴 共享件 `ArmamentSlot` / `ArmamentSlots` / `HandWithArmament`（总览页 `OVERVIEW_UI`、初始牌组页 `DECK_UI` 都在用）：
//    · 本块**只收「原先写死在 JSX 里的 Tailwind 尺寸类」**；既有默认参数（`height = 48` / `gap = 10`）
//      与既有常量（`HAND_CARD_HEIGHT` / `ARMAMENT_HEXAGON_CLIP` / `ARM_RARITY_ORDER` /
//      `ARMAMENT_MAX_STOCK` / `DRAG_ICON_OFFSET`）**原名原值一律不动** ⇒ 其它页面视觉零变化。
//    · `ArmamentSlot` 的内部尺寸全部由 `height` 参数派生（宽 = height×0.88、锁图标 = height×0.3），
//      **没有**可搬的写死尺寸类（剩下的只有 `inset-*` / `inset-[3px]` 定位类，按规范不搬）。
//    · `ArmamentSlots` 的间距来自 `gap` 参数、槽高由 `totalHeight` 均分 ⇒ 同样无可搬项。
// ══════════════════════════════════════════════════════════════════════
export const ARMAMENT_UI = {
    // ── ① 共享件：手牌样式 + 右侧武装槽组合 ──
    /** `HandWithArmament` 内「手牌 ↔ 武装槽组」间距 px（原 gap-6 = 24，**不被 gap 参数覆盖**） */
    handGroupGap: 24,

    // ── ② 左侧：手牌样式 + 3 个武装槽 ──
    /** 手牌与武装槽组的间距 px（原 gap-10 = 40） */
    leftGap: 50,
    /** 手牌放大倍数（原写死字面量 1.9；`slotH` 用同一值，改这里两处一起变） */
    handScale: 2.5,
    /** 3 个槽竖排间距 px（原内联 8） */
    slotColGap: 8,
    /**
     * 【槽大小旋钮】单个武装槽的**高度缩放**（1 = 原样）。
     * ⚠️ 槽高本来是**派生**的：`slotH = (HAND_CARD_HEIGHT × handScale − ARMAMENT_MAX_STOCK) / 3`
     *    ⇒ 想单独放大 / 缩小槽、又不想动右边手牌，就拨**这一个**数。
     *    **别**去动 `handScale` —— 那个会连手牌一起放大（2026-10-16 程就是在这里找不到入口）。
     * ⚠️ 它同时影响：左侧 3 个槽 + **拖拽跟手图标**（那个复用同一个 `slotH`）。
     */
    slotScale: 1,
    /** 槽宽 / 槽高 比（六边形宽高比，原写死 0.88） */
    slotWidthRatio: 0.88,
    /** 单个槽「六边形 ↔ 更换/卸载按钮列」间距 px（原 gap-3 = 12） */
    slotRowGap: 12,
    /** 更换/卸载按钮纵向间距 px（原 gap-1.5 = 6） */
    btnColGap: 6,
    /** 更换/卸载按钮内边距 px（原 p-2.5 = 10） */
    btnPad: 10,
    /** 更换/卸载按钮圆角 px（原 rounded-md = 6） */
    btnRadius: 6,
    /** 更换/卸载按钮描边粗细 px（原 border = 1） */
    btnBorderWidth: 1,
    /** 更换/卸载按钮图标 px（原 `<RefreshCw size={16} />` / `<Minus size={16} />`） */
    btnIconSize: 32,

    // ── ③ 右侧武装库抽屉 ──
    /** 抽屉展开宽度 px（原 w-[420px]；让位 marginRight / 开合按钮 right / 动效 width 同一值） */
    drawerWidth: 500,
    /** 抽屉左边缘描边粗细 px（原 border-l = 1） */
    drawerLeftBorderWidth: 1,
    /** 抽屉头部内边距 px（原 p-4 = 16） */
    drawerHeadPad: 16,
    /** 抽屉头部下内边距 px（原 pb-3 = 12） */
    drawerHeadPadBottom: 12,
    /** 抽屉头部下边框粗细 px（原 border-b = 1） */
    drawerHeadBorderWidth: 1,
    /** 抽屉头部「标题行 ↔ 工具条 ↔ 筛选面板 ↔ 常驻提示」间距 px（原 space-y-3 = 12，现由 flex 列 + gap 实现） */
    drawerHeadGap: 12,
    /** 「可装 N/M」计数标签字号 px（原 text-xs = 12） */
    countFontSize: 24,
    /** 抽屉标题行「武装库 ↔ 可装计数」间距 px（原 gap-2 = 8） */
    titleRowGap: 8,
    /** 工具条按钮之间间距 px（原 gap-1.5 = 6） */
    toolbarGap: 6,
    /** 搜索框上下内边距 px（原 py-2 = 8） */
    searchPadY: 8,
    /** 搜索框左内边距 px（原 pl-8 = 32，给放大镜留位） */
    searchPadLeft: 32,
    /** 搜索框右内边距 px（原 pr-2 = 8） */
    searchPadRight: 8,
    /** 搜索框圆角 px（原 rounded-md = 6） */
    searchRadius: 6,
    /** 搜索框字号 px（原 text-sm = 14） */
    searchFontSize: 28,
    /** 搜索框内放大镜图标 px（原 `<Search size={14} />`） */
    searchIconSize: 28,
    /** 工具条方形按钮内边距 px（原 p-2 = 8） */
    toolBtnPad: 8,
    /** 工具条方形按钮圆角 px（原 rounded-md = 6） */
    toolBtnRadius: 6,
    /** 工具条图标 px（原 `<Filter/ChevronDown/ArrowUpNarrowWide/ArrowDownWideNarrow/RotateCcw size={15} />`） */
    toolIconSize: 30,
    /** 排序下拉面板距按钮 px（原 mt-1 = 4） */
    sortMenuMarginTop: 8,
    /** 排序下拉面板宽度 px（原 w-32 = 128） */
    sortMenuWidth: 128,
    /** 排序下拉面板圆角 px（原 rounded-md = 6） */
    sortMenuRadius: 6,
    /** 排序下拉面板描边粗细 px（原 border = 1） */
    sortMenuBorderWidth: 1,
    /** 排序下拉项左右内边距 px（原 px-3 = 12） */
    sortItemPadX: 12,
    /** 排序下拉项上下内边距 px（原 py-2 = 8） */
    sortItemPadY: 8,
    /** 排序下拉项字号 px（原 text-xs = 12） */
    sortItemFontSize: 24,

    // ── ④ 抽屉内筛选面板 ──
    /** 筛选面板「可用性 ↔ 品质」两组间距 px（原 space-y-3 = 12，现由 flex 列 + gap 实现） */
    filterBlockGap: 12,
    /** 筛选面板上内边距 px（原 pt-1 = 4） */
    filterPadTop: 4,
    /** 「可用性 / 品质」标签字号 px（原 text-[10px]） */
    filterLabelFontSize: 10,
    /** 标签与下方控件的间距 px（原 mb-1.5 = 6） */
    filterLabelMarginBottom: 6,
    /** 可用性/品质小按钮左右内边距 px（原 px-2.5 = 10） */
    chipPadX: 10,
    /** 可用性/品质小按钮上下内边距 px（原 py-1 = 4） */
    chipPadY: 4,
    /** 可用性/品质小按钮圆角 px（原 rounded = 4） */
    chipRadius: 4,
    /** 可用性/品质小按钮字号 px（原 text-xs = 12） */
    chipFontSize: 24,
    /** 可用性/品质小按钮描边粗细 px（原 border = 1） */
    chipBorderWidth: 1,
    /** 品质多选按钮之间间距 px（原 gap-1.5 = 6） */
    rarityGap: 6,
    /** 常驻提示行（仅显示可装入此槽）字号 px（原 text-[11px]） */
    hintFontSize: 22,
    /** 常驻提示行「文字 ↔ 显示全部」间距 px（原 gap-2 = 8） */
    hintGap: 16,

    // ── ⑤ 抽屉内武装列表 ──
    /** 列表内边距 px（原 p-4 = 16） */
    listPad: 16,
    /** 列表项之间纵向间距 px（原 space-y-3 = 12，现由 flex 列 + gap 实现） */
    listGap: 12,
    /** 空状态上下内边距 px（原 py-14 = 56） */
    emptyPadY: 56,
    /** 空状态放大镜图标 px（原 `<Search size={28} />`） */
    emptyIconSize: 28,
    /** 空状态图标与下方文字间距 px（原 mb-3 = 12） */
    emptyIconMarginBottom: 12,
    /** 空状态主文案字号 px（原 text-sm = 14） */
    emptyTitleFontSize: 28,
    /** 空状态主文案下方间距 px（原 mb-1 = 4） */
    emptyTitleMarginBottom: 4,
    /** 空状态副文案字号 px（原 text-xs = 12） */
    emptyDescFontSize: 24,
    /** 空状态副文案下方间距 px（原 mb-4 = 16） */
    emptyDescMarginBottom: 16,
    /** 「显示全部武装」左右内边距 px（原 px-3 = 12） */
    emptyBtnPadX: 12,
    /** 「显示全部武装」上下内边距 px（原 py-1.5 = 6） */
    emptyBtnPadY: 6,
    /** 「显示全部武装」圆角 px（原 rounded = 4） */
    emptyBtnRadius: 4,
    /** 「显示全部武装」字号 px（原 text-xs = 12） */
    emptyBtnFontSize: 24,
    /** 可用/不可用分隔带上/下内边距 px（原 pt-1 = 4 / pb-0.5 = 2） */
    dividerPadTop: 4,
    /** 分隔带下内边距 px（原 pb-0.5 = 2） */
    dividerPadBottom: 2,
    /** 分隔带「线 ↔ 文字」间距 px（原 gap-2 = 8） */
    dividerGap: 8,
    /** 分隔带细线高度 px（原 h-px = 1） */
    dividerLineHeight: 1,
    /** 分隔带文字字号 px（原 text-[10px]） */
    dividerFontSize: 10,
    /** 列表项「六边形 ↔ 名称描述 ↔ 品质描述」间距 px（原 gap-4 = 16） */
    itemGap: 16,
    /** 列表项左右内边距 px（原 px-4 = 16） */
    itemPadX: 16,
    /** 列表项上下内边距 px（原 py-5 = 20） */
    itemPadY: 20,
    /**
     * 【卡片大小旋钮】列表项里那个**六边形图标的宽度** px。
     * ⚠️ 原代码这里是**写死的裸数字 60**（`style={{ width: 60, height: 60 * 1.14 }}`）⇒ 以前没有入口。
     * 它 + `itemPadY` 一起决定「一张武装卡有多高」（行高本来就是**内容撑开**、没有写死值）。
     */
    itemIconWidth: 100,
    /** 上述六边形图标的高 / 宽比（原写死 1.14 —— 拉长是为了六边形不变形） */
    itemIconAspect: 1.14,
    /**
     * 列表项**最小高度** px（**0 = 不介入**，保持"内容撑开"的原样）。
     * 想直接给卡片定高就填正数（内容超了仍会被撑开，不会裁切）。
     */
    itemMinHeight: 0,
    /** 列表项圆角 px（原 rounded-xl = 12） */
    itemRadius: 12,
    /** 列表项描边粗细 px（原 border = 1） */
    itemBorderWidth: 1,
    /** 列表项右下角「X 数量」角标字号 px（原 text-xs = 12） */
    stockFontSize: 24,
    /** 列表项武装名字号 px（原 text-lg = 18） */
    itemNameFontSize: 36,
    /** 列表项描述字号 px（原 text-sm = 14） */
    itemDescFontSize: 28,
    /** 列表项品质描述字号 px（原 text-xs = 12） */
    itemRarityFontSize: 24,

    // ── ⑥ 右缘开合按钮 ──
    /** 开合按钮宽 px（原 w-8 = 32） */
    handleWidth: 64,
    /** 开合按钮高 px（原 h-14 = 56） */
    handleHeight: 112,
    /** 开合按钮左侧圆角 px（原 rounded-l-lg = 8） */
    handleRadius: 16,
    /** 开合按钮箭头图标 px（原 `<ChevronsLeft size={18} />` / `<ChevronsRight size={18} />`） */
    handleIconSize: 36,
} as const;

// ══════════════════════════════════════════════════════════════════════
// 🎛️ 天启者配置 · **共享小件**（`HeroHandContent` / `HeroAvatarRing`）· 视觉调参区（**程微调就改这里**）
// ──────────────────────────────────────────────────────────────────────
// 这两个是**被多处复用的共享件**（总览 `OVERVIEW_UI` / 初始牌组 `DECK_UI` / 等级 `LEVELS_UI` /
// 武装 `ARMAMENT_UI` / 以及外壳 `RogueHeroSelect` 都在用），所以**只收原先写死的尺寸**，不动参数与结构：
//   · `HeroHandContent`：**卡面本身由 `scale` 参数缩放**（各页各自传 2.5 / 1.9 …）→ 不在这里；
//     这里收的是**不受 scale 影响的**外层：标签间距 + 上下两行标签字号 + scale 溢出补偿系数。
//   · `HeroAvatarRing`：**圆环直径由 `size` 参数给定**（等级页传 `LEVELS_UI.avatarSize`）→ 不在这里；
//     这里收的是**不随 size 变化**的底部等级黑圆（直径/字号/描边）。
// ⚠️ 未收：头像那个 `<CroppedAvatar>` 实例上的 2px 描边（原 Tailwind 的 border-2）—— `CroppedAvatar` 组件**只接 className、
//    没有 style 口子**（见 `components/CroppedAvatar.tsx` 的 props：cardKey / skinId / className），
//    要搬就得改别的文件 ⇒ 按本轮"只改本文件"的红线**原地保留**。
// ══════════════════════════════════════════════════════════════════════
export const HERO_SHARED_UI = {
    // ── HeroHandContent（单张英雄卡主视觉）──
    /** 「上标签 ↔ 卡面 ↔ 卡名」纵向间距 px（原 gap-3 = 12） */
    handLabelGap: 12,
    /** 上标签「天启者 · 手牌样式」字号 px（原 text-xs = 12） */
    handLabelSmallFontSize: 12,
    /** 下标签「卡名」字号 px（原 text-base = 16） */
    handLabelNameFontSize: 16,
    /** 卡面缩放后的溢出补偿系数 px（原字面量 134；`margin: (scale−1)×134`） */
    handScaleMarginComp: 134,

    // ── HeroAvatarRing（圆环头像）──
    /** 底部等级黑圆直径 px（原 w-10 h-10 = 40，**不随 size 缩放**） */
    avatarLevelBadgeSize: 40,
    /** 等级数字字号 px（原 text-xl = 20） */
    avatarLevelFontSize: 20,
    /** 等级黑圆描边粗细 px（原 border-2 = 2） */
    avatarLevelBorderWidth: 2,
} as const;

// 内容类型：总览 / 初始牌组 / 天启者等级 / 武装 / 神格神经图 / 个性化（null = 未选）
export type HeroInfoWindow = 'overview' | 'deck' | 'levels' | 'divinity' | 'armament' | 'personalize' | null;

// [2026-08-13] 静态卡 → 完整手牌样式数据（虚拟运行时字段，对齐 DeckBuilder/ShopModal 做法）
// id 参数：[2026-08-13 BUG 修复] 每张预览卡用 card.key 唯一 id，避免 Card 身份闸门把不同英雄误判同卡导致 BUFF/受击特效重复播放
const toFullCardData = (staticData: any, id?: string): CardData => ({
    ...staticData,
    id: id ?? 'preview_id',
    strikeCount: 0,
    animState: 'idle',
    damageTaken: 0,
    buffs: { power: 0, health: 0 },
});

// ── 等级奖励 → 「简介短名 + 完整效果」拆解（[2026-08-13] 程要求「2 复活 复活次数+1」= 等级/短名/完整效果）──
function rewardParts(b: Partial<HeroLevelBonus>): { label: string; value: string } {
    if (b.maxHpBonus) return { label: '生命', value: `生命上限 +${b.maxHpBonus}` };
    if (b.goldBonus) return { label: '金币', value: `开局金币 +${b.goldBonus}` };
    if (b.reviveBonus) return { label: '复活', value: `复活次数 +${b.reviveBonus}` };
    if (b.refreshBonus) return { label: '刷新', value: `刷新次数 +${b.refreshBonus}` };
    if (b.grantedEnhancements?.length) {
        const names = b.grantedEnhancements.map(id => getBuffById(id)?.name ?? id);
        return { label: '迷宫强化', value: names.join('、') };
    }
    if (b.grantedEquipments?.length) {
        const names = b.grantedEquipments.map(id => getEquipmentById(id)?.name ?? id);
        return { label: '装备', value: names.join('、') };
    }
    if (b.armamentSlots) return { label: '武装槽位', value: `获得${b.armamentSlots === 2 ? '二号' : '三号'}武装槽位` }; // [2026-08-14 武装]
    if (b.armamentRarity === 'rare') return { label: '武装品质', value: '可以装备稀有武装' }; // [2026-08-14 武装]
    if (b.armamentRarity === 'epic') return { label: '武装品质', value: '可以装备史诗武装' }; // [2026-08-14 武装]
    if (b.armamentRarity === 'legendary') return { label: '武装品质', value: '可以装备传奇武装' }; // [2026-08-29 补] 30级金武装此前显示「——」（漏 legendary 分支）
    if (b.armamentRarity === 'mythic') return { label: '武装品质', value: '可以装备神话武装' }; // [2026-08-29] 30级解锁红 mythic（武装批量扩充后）
    if (b.rarityBonus) {
        if (b.rarityBonus.rare) return { label: '稀有度', value: `蓝品概率 +${b.rarityBonus.rare}%` };
        if (b.rarityBonus.epic) return { label: '稀有度', value: `紫品概率 +${b.rarityBonus.epic}%` };
        if (b.rarityBonus.legendary) return { label: '稀有度', value: `金品概率 +${b.rarityBonus.legendary}%` };
    }
    // [2026-08-29] 第六类「商店页签」落实：此前 rewardParts 未处理 shopTabBonus → 7/16 级显示「——」
    if (b.shopTabBonus) return { label: '商店页签', value: `随机页签 +${b.shopTabBonus}` };
    // [2026-08-29] 经验获取效率加成（6/17/23/29 级）
    if (b.expRateBonus) return { label: '经验效率', value: `经验获取效率 +${b.expRateBonus}%` };
    // [2026-08-29] 装备稀有度加成（10/19/26/29 级，战斗奖励紫金加权）
    if (b.equipRarityBonus) return { label: '装备稀有度', value: `装备稀有度 +${b.equipRarityBonus}%` };
    // [2026-08-29] 开局随机挑初始牌组卡挂装备（海基的推演手记〔原微缩回路〕 / 均衡增补 / 强攻模板）
    if (b.grantedSpellEquips?.length) {
        const names = b.grantedSpellEquips.map(id => getEquipmentById(id)?.name ?? id);
        return { label: '装备', value: `随机法术卡持有「${names.join('、')}」` };
    }
    if (b.grantedUnitEquips?.length) {
        const names = b.grantedUnitEquips.map(id => getEquipmentById(id)?.name ?? id);
        return { label: '装备', value: `随机单位获得「${names.join('、')}」` };
    }
    return { label: '——', value: '' };
}

// 全量等级奖励行（1-30；当前阶梯表每级都有奖励，仍做容错）
function buildLevelRows(): { level: number; color: string; label: string; value: string }[] {
    const rows: { level: number; color: string; label: string; value: string }[] = [];
    for (let lv = 1; lv <= MAX_HERO_LEVEL; lv++) {
        const b = HERO_LEVEL_BONUS[lv] as Partial<HeroLevelBonus> | undefined;
        const parts = b ? rewardParts(b) : { label: '——', value: '' };
        rows.push({ level: lv, color: getLevelColor(lv), label: parts.label, value: parts.value });
    }
    return rows;
}

// ════════════ 内容 ①：天启者手牌样式（主视觉，单张英雄卡）════════
// scale：放大倍数（1 原始；主体主视觉见 `ROGUE_HERO_UI.handScale`；总览右半见 `OVERVIEW_UI.handScale` 抵 1/3 画面）
export const HeroHandContent: React.FC<{ heroKey: string; scale?: number; noLabels?: boolean; equipIds?: string[] }> = ({ heroKey, scale = 1, noLabels, equipIds }) => {
    const card = CARD_DB[heroKey];
    if (!card) return null;
    // [2026-08-14 武装] 应用装备/武装静态修饰（+1/+1、-2 费、+4/+4 等）→ 手牌数值实时变化
    let cardData = toFullCardData(card, card.key);
    if (equipIds?.length) for (const id of equipIds) cardData = attachEquipment(cardData, id);
    return (
        <div className="flex flex-col items-center" style={{ gap: HERO_SHARED_UI.handLabelGap }}>
            {!noLabels && <p className="font-mono text-purple-300/80" style={{ fontSize: HERO_SHARED_UI.handLabelSmallFontSize }}>天启者 · 手牌样式</p>}
            {/* [2026-08-13] transform scale 放大 + margin 按比例补偿溢出；key 强制重挂载避免切换英雄残留特效 */}
            <div style={{ transform: `scale(${scale})`, margin: `${(scale - 1) * HERO_SHARED_UI.handScaleMarginComp}px 0` }}>
                <Card key={card.key} data={cardData} location="deck-builder" isFaceUp showShopIcon={false} isCostReduced={(cardData.customProgress || 0) & 2 ? true : false} />
            </div>
            {!noLabels && <p className="font-black text-white tracking-wide" style={{ fontSize: HERO_SHARED_UI.handLabelNameFontSize }}>{card.name}</p>}
        </div>
    );
};

// ════════════ 圆环头像（复用：选择界面头像区 / 等级界面顶部）════════
export const HeroAvatarRing: React.FC<{
    heroKey: string;
    level: number;
    exp: number;
    expToNext: number;
    size?: number; // 直径 px（默认 144）
}> = ({ heroKey, level, exp, expToNext, size = 144 }) => {
    const expPct = expToNext > 0 ? Math.min(100, Math.round((exp / expToNext) * 100)) : 100;
    return (
        <div className="relative shrink-0" style={{ width: size, height: size }}>
            {/* 圆环：黑色经验槽 + 蓝色经验条 */}
            <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="46" fill="none" stroke="rgba(0,0,0,0.8)" strokeWidth="7" />
                <circle cx="50" cy="50" r="46" fill="none" stroke="#3b82f6" strokeWidth="7" strokeLinecap="round" pathLength={100}
                    strokeDasharray={`${expPct} ${100 - expPct}`} />
            </svg>
            {/* 头像 */}
            <CroppedAvatar cardKey={heroKey} className="absolute inset-1.5 w-[calc(100%-12px)] h-[calc(100%-12px)] rounded-full border-2 border-white/20" />
            {/* 黑圆等级数字（底部） */}
            <div className="absolute inset-x-0 bottom-1 flex justify-center pointer-events-none">
                <div className="rounded-full bg-black/85 border-white/30 flex items-center justify-center shadow-[0_0_10px_rgba(0,0,0,0.8)]"
                    style={{ width: HERO_SHARED_UI.avatarLevelBadgeSize, height: HERO_SHARED_UI.avatarLevelBadgeSize, borderWidth: HERO_SHARED_UI.avatarLevelBorderWidth, borderStyle: 'solid' }}>
                    <span className="font-black italic leading-none" style={{ color: getLevelNumberColor(level), fontSize: HERO_SHARED_UI.avatarLevelFontSize }}>{level}</span>
                </div>
            </div>
        </div>
    );
};

// ════════════ 内容 ①.5：总览（左：流派+难度+背景故事 / 右：手牌样式+确定按钮）════════
export const OverviewContent: React.FC<{
    heroKey: string;
    onConfirm?: () => void;
    confirmDisabled?: boolean;
    themeColor?: string; // [2026-08-13] 主题色（确定按钮随所选天启者）
}> = ({ heroKey, onConfirm, confirmDisabled, themeColor }) => {
    const { getArmament, getQualityTier } = useArmamentConfig(); // [2026-08-14] 总览武装槽显示实际配置 · [2026-09-07] 每槽品质档
    // [2026-08-15] 槽位解锁随天启者等级（对齐武装界面，未解锁槽显示锁图标）
    const heroProgression = useHeroProgression();
    const level = heroProgression.getHeroLevel(heroKey);
    const heroBonus = getHeroLevelBonus(level);
    const overviewUnlockSlots = heroBonus.armamentSlots;
    // [2026-08-28 莉莉子 修复] 只取已解锁槽位武装（等级降低时未解锁槽残留武装不显示/不生效）
    const armValues = getArmament(heroKey, level);
    // [2026-09-07 重修申请] 每槽可装备品质上限（等级基础 ≤稀有 + 各槽重修额外档）
    const overviewTiers = getQualityTier(heroKey);
    const overviewCaps = useMemo<ArmamentRarity[]>(
        () => [0, 1, 2].map(i => combineArmamentRarity(heroBonus.armamentRarity, overviewTiers[i] ?? 0)),
        [heroBonus.armamentRarity, overviewTiers],
    );
    const archetype = getHeroArchetype(heroKey);
    const lore = LORE_DB[heroKey];
    const faction = FACTION_ICONS[heroKey] ?? { icon: Shield, color: '#22c55e' };
    const difficulty = archetype?.difficulty ?? 0;
    const diffColor = DIFFICULTY_COLORS[difficulty] ?? '#ffffff';
    const diffLabel = DIFFICULTY_LABELS[difficulty] ?? '轻松';
    const FIcon = faction.icon;

    return (
        <div className="flex h-full min-h-0" style={{ gap: OVERVIEW_UI.gap }}>
            {/* 左半：上排（流派+难度等宽等高）+ 背景故事延伸到底部（paddingTop 控制离顶部距离） */}
            <div className="flex-1 flex flex-col min-w-0 shrink-0" style={{ paddingTop: OVERVIEW_UI.topGap }}>
                {/* 上排：玩法流派 + 难度说明（等宽等高窗口，内部垂直水平居中：图标→对应颜色文字→说明） */}
                <div className="flex shrink-0" style={{ gap: OVERVIEW_UI.rowGap, height: OVERVIEW_UI.topRowHeight }}>
                    {/* 流派窗口 */}
                    <div
                        className="flex-1 min-w-0 bg-white/5 border border-white/10 flex flex-col items-center justify-center text-center"
                        style={{ gap: OVERVIEW_UI.panelGap, padding: OVERVIEW_UI.panelPad, borderRadius: OVERVIEW_UI.panelRadius }}
                    >
                        <FIcon size={OVERVIEW_UI.factionIconSize} style={{ color: faction.color }} />
                        <div className="font-black italic" style={{ color: faction.color, fontSize: OVERVIEW_UI.panelTitleFontSize }}>
                            {archetype?.factionName ?? '未知流派'}
                        </div>
                        <p className="text-white leading-relaxed" style={{ fontSize: OVERVIEW_UI.panelDescFontSize }}>{archetype?.factionDesc ?? '暂无流派说明'}</p>
                    </div>

                    {/* 难度窗口 */}
                    <div
                        className="flex-1 min-w-0 bg-white/5 border border-white/10 flex flex-col items-center justify-center text-center"
                        style={{ gap: OVERVIEW_UI.panelGap, padding: OVERVIEW_UI.panelPad, borderRadius: OVERVIEW_UI.panelRadius }}
                    >
                        {/* 图标：5 三角槽（奇数正放/偶数镜像） */}
                        <div className="flex items-center" style={{ gap: OVERVIEW_UI.diffTriangleGap }}>
                            {[0, 1, 2, 3, 4].map(i => {
                                const filled = i < difficulty;
                                return (
                                    <svg
                                        key={i}
                                        viewBox="0 0 24 24"
                                        style={{
                                            width: OVERVIEW_UI.diffTriangleSize,
                                            height: OVERVIEW_UI.diffTriangleSize,
                                            transform: i % 2 === 1 ? 'scaleX(-1)' : undefined,
                                        }}
                                    >
                                        <path d="M2 20 L20 12 L2 4 Z" fill={filled ? diffColor : '#374151'} />
                                    </svg>
                                );
                            })}
                        </div>
                        <div className="font-black italic" style={{ color: diffColor, textShadow: '0 0 12px rgba(0,0,0,0.6)', fontSize: OVERVIEW_UI.panelTitleFontSize }}>
                            {diffLabel}
                        </div>
                        <p className="text-white leading-relaxed" style={{ fontSize: OVERVIEW_UI.panelDescFontSize }}>{archetype?.difficultyDesc ?? '暂无难度说明'}</p>
                    </div>
                </div>

                {/* 背景故事：上边栏对齐初始牌组按钮（topRowHeight 起），下边栏延伸到画面最下方（flex-1） */}
                <div
                    className="flex-1 min-h-0 bg-white/5 border border-white/10 overflow-y-auto custom-scrollbar"
                    style={{ marginTop: OVERVIEW_UI.loreMarginTop, borderRadius: OVERVIEW_UI.loreRadius, padding: OVERVIEW_UI.lorePad }}
                >
                    <p className="font-mono text-purple-300/80" style={{ fontSize: OVERVIEW_UI.loreLabelFontSize, marginBottom: OVERVIEW_UI.loreLabelMarginBottom }}>背景故事</p>
                    <p className="text-gray-200 leading-relaxed whitespace-pre-line" style={{ fontSize: OVERVIEW_UI.loreTextFontSize }}>{lore ?? '暂无背景故事'}</p>
                </div>
            </div>

            {/* 右半：卡牌样式（抵画面右侧 1/3）+ 右侧武装槽；确定按钮以卡面中心对齐（考虑武装槽占位偏移） */}
            <div
                className="shrink-0 flex items-center justify-center"
                style={{ width: OVERVIEW_UI.rightWidth }}
            >
                <div className="flex items-center" style={{ gap: OVERVIEW_UI.armamentGap }}>
                    {/* 卡面 + 确定按钮：以卡面中心为基准纵向居中（按钮不受武装槽占位影响） */}
                    <div className="flex flex-col items-center" style={{ gap: OVERVIEW_UI.handColumnGap, marginTop: OVERVIEW_UI.handOffsetTop }}>
                        <HeroHandContent heroKey={heroKey} noLabels scale={OVERVIEW_UI.handScale} equipIds={armValues.filter((v): v is string => !!v)} />
                        {onConfirm && (
                            <button
                                onClick={() => { eventBus.emit(GameEvents.UI_CLICK); onConfirm(); }}
                                disabled={confirmDisabled}
                                className="font-black tracking-widest hover:scale-105 transition-all disabled:opacity-40 disabled:grayscale disabled:cursor-not-allowed"
                                style={{
                                    paddingLeft: OVERVIEW_UI.confirmPadX,
                                    paddingRight: OVERVIEW_UI.confirmPadX,
                                    paddingTop: OVERVIEW_UI.confirmPadY,
                                    paddingBottom: OVERVIEW_UI.confirmPadY,
                                    borderRadius: OVERVIEW_UI.confirmRadius,
                                    fontSize: OVERVIEW_UI.confirmFontSize,
                                    ...(themeColor ? { background: `linear-gradient(to right, ${themeColor}, ${themeColor}99)`, boxShadow: `0 0 30px ${themeColor}55` } : {}),
                                }}
                            >
                                确定选择
                            </button>
                        )}
                    </div>
                    {/* 武装槽（卡面右侧一列，总高 = 卡面高度）；[2026-08-15] 传已解锁槽位显示锁图标 */}
                    <ArmamentSlots totalHeight={HAND_CARD_HEIGHT * OVERVIEW_UI.handScale} values={armValues} unlockSlots={overviewUnlockSlots} caps={overviewCaps} />
                </div>
            </div>
        </div>
    );
};

// ════════════ 内容 ②：初始牌组（左：卡牌列表悬停检视 / 右：手牌样式大图无按钮）════════
// 卡牌列表样式对齐 RogueDrawer 现成实现：横排行 = 卡面背景暗化 + 费用圆 + 卡名 + 数量 X1/X2
export const DeckContent: React.FC<{ heroKey: string; userSystem?: any }> = ({ heroKey, userSystem }) => {
    // [2026-08-13] 接个性化配置：rogue_starter_{heroKey} 牌组（开发者编辑）优先，否则 buildStarterDeck 默认
    const deck = useMemo(() => getConfiguredStarterDeck(userSystem?.decks, heroKey), [heroKey, userSystem?.decks]);
    const { gazeTarget, bindGazeEvents, dismissGaze } = useCardGaze({ delay: 250 }); // [2026-08-13] 悬停大图检视
    // [2026-10-15 莉莉子 · 触屏] 触屏长按 → 浮层「📖 详情」的落点（触屏没有右键）
    const [viewCard, setViewCard] = useState<CardData | null>(null);
    const { getArmament } = useArmamentConfig(); // [2026-08-15] 英雄卡武装减费显示
    const heroProgression = useHeroProgression(); // [2026-08-28 莉莉子] 武装按解锁槽位生效

    // 卡牌去重计数（保持出现顺序）
    const cardCounts = new Map<string, number>();
    deck.forEach(k => cardCounts.set(k, (cardCounts.get(k) || 0) + 1));

    // [2026-08-26 莉莉子] 英雄卡的武装列表（列表项后方显示：1 个显示图标，多个显示黑色六边形 Xn）
    // [2026-08-28 莉莉子 修复] 只取已解锁槽位武装（等级降低残留不显示）
    const heroEquipIds = getArmament(heroKey, heroProgression.getHeroLevel(heroKey)).filter((v): v is string => !!v);

    return (
        <div className="flex h-full min-h-0" style={{ paddingTop: DECK_UI.topGap, gap: DECK_UI.gap }}>
            {/* 左：卡牌列表（宽度可调，横排行，悬停大图检视） */}
            <div className="min-w-0 overflow-y-auto custom-scrollbar shrink-0" style={{ width: DECK_UI.listWidth, paddingRight: DECK_UI.listPadRight }}>
                <div className="flex flex-col" style={{ gap: DECK_UI.listRowGap }}>
                    {[...cardCounts.entries()].map(([key, count]) => {
                        const card = CARD_DB[key];
                        if (!card) return null;
                        // CARD_DB 静态缺运行时字段，补全为完整 CardData 供悬停检视（对齐 RogueDrawer）
                        let fullCard: CardData = { ...card, id: key, strikeCount: 0, animState: 'idle' as const, damageTaken: 0, buffs: { power: 0, health: 0 } };
                        // [2026-08-15] 英雄卡应用武装：①悬停检视大图挂武装图标（减费/BUFF 生效）②列表费用显示减费后绿色
                        let displayCost = card.cost;
                        let isReduced = false;
                        if (key === heroKey) {
                            // [2026-08-28 莉莉子 修复] 只取已解锁槽位武装
                            for (const id of (getArmament(heroKey, heroProgression.getHeroLevel(heroKey)).filter((v): v is string => !!v))) fullCard = attachEquipment(fullCard, id);
                            displayCost = fullCard.cost;
                            isReduced = !!((fullCard.customProgress || 0) & 2);
                        }
                        const equips = key === heroKey ? heroEquipIds : []; // [2026-08-26] 该卡武装（当前仅英雄卡配置武装）
                        return (
                            <div key={key} className="flex items-center shrink-0" style={{ gap: DECK_UI.rowGap }}>
                                {/* 卡牌横条（flex-1 占列表内剩余，武装图标在后方独立区，不叠放） */}
                                <div
                                    className="relative flex items-center flex-1 min-w-0 bg-gray-800/90 border border-gray-700/60 hover:border-blue-500 overflow-hidden cursor-help"
                                    style={{ height: DECK_UI.rowHeight, borderRadius: DECK_UI.rowRadius }}
                                    {...bindGazeEvents(fullCard)}
                                >
                                    {/* 卡面背景（暗化） */}
                                    <div className="absolute inset-0 opacity-40 bg-cover bg-center" style={{ backgroundImage: `url(${card.imageUrl})` }}></div>
                                    <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/40 to-transparent"></div>
                                    {/* 内容：费用圆 + 卡名 + 数量 */}
                                    <div className="absolute inset-0 flex items-center justify-between" style={{ paddingLeft: DECK_UI.rowPadX, paddingRight: DECK_UI.rowPadX }}>
                                        <div className="flex items-center min-w-0" style={{ gap: DECK_UI.costGap }}>
                                            <span
                                                className={`rounded-full flex justify-center items-center font-bold shrink-0 ${isReduced ? 'bg-green-900 border-green-500 text-green-300' : 'bg-blue-900 border-blue-500 text-blue-200'}`}
                                                style={{
                                                    width: DECK_UI.costSize,
                                                    height: DECK_UI.costSize,
                                                    fontSize: DECK_UI.costFontSize,
                                                    borderWidth: DECK_UI.costBorderWidth,
                                                    borderStyle: 'solid',
                                                }}
                                            >{displayCost}</span>
                                            <span className="font-bold truncate drop-shadow-md" style={{ fontSize: DECK_UI.nameFontSize }}>{card.name}</span>
                                        </div>
                                        <span className="text-yellow-400 font-black shrink-0">X{count}</span>
                                    </div>
                                </div>
                                {/* [2026-08-26] 武装图标区（卡牌后方独立区 40px）：1 个显示对应武装图标；多个显示黑色六边形 Xn；悬停浮现武装大卡 */}
                                {/* [2026-09-10 莉莉子 修复] 摘掉原生 title：它与 bindArmamentGaze 大卡重叠 → hover 双弹（浏览器小白框 + 我们的武装大卡） */}
                                {equips.length === 1 && (
                                    <div className="shrink-0" style={{ width: DECK_UI.equipIconSize, height: DECK_UI.equipIconSize, clipPath: ARMAMENT_HEXAGON_CLIP, border: '1px solid rgba(255,255,255,0.35)', background: 'rgba(255,255,255,0.06)' }} {...bindArmamentGaze(equips[0])}>
                                        <img src={getEquipmentById(equips[0])?.icon} alt="" className="w-full h-full object-cover" draggable={false} />
                                    </div>
                                )}
                                {equips.length > 1 && (
                                    <div className="shrink-0 flex items-center justify-center bg-black/85 text-white font-black" style={{ width: DECK_UI.equipIconSize, height: DECK_UI.equipIconSize, fontSize: DECK_UI.equipFontSize, clipPath: ARMAMENT_HEXAGON_CLIP, border: '1px solid rgba(255,255,255,0.25)' }} {...bindArmamentGaze(equips)}>
                                        X{equips.length}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* 右：手牌样式大图 + 武装槽（位置/缩放/间隔可调，无按钮） */}
            <div className="shrink-0" style={{ marginTop: DECK_UI.handOffsetTop }}>
                <HandWithArmament heroKey={heroKey} noLabels scale={DECK_UI.handScale} gap={DECK_UI.armamentGap} />
            </div>

            {/* 悬停大图检视 */}
            <FloatingCardPreview mode="follow" gazeTarget={gazeTarget} onViewArt={(c) => { dismissGaze(); setViewCard(c); }} />

            {/* [2026-10-15 莉莉子 · 触屏] 触屏详情入口（触屏没有右键） */}
            {viewCard && <FullArtOverlay card={viewCard} onClose={() => setViewCard(null)} />}
        </div>
    );
};

// ════════════ 内容 ③：天启者等级界面（三区域：头像+X/N / 下一个等级奖励 / 查看所有弹窗）════════
export const LevelsContent: React.FC<{ heroKey: string; userSystem?: any }> = ({ heroKey, userSystem }) => {
    const heroProgression = useHeroProgression();
    const isDev = userSystem?.userId === 'dev_full_admin'; // [2026-08-14 开发者] 等级加减
    const progress = heroProgression.getHeroProgress(heroKey);
    const level = progress.level;
    const exp = progress.exp;
    const expToNext = progress.expToNext;
    const [showModal, setShowModal] = useState(false);

    // 下一个等级奖励（1-30；满级显示占位）
    const nextLevel = level + 1;
    const nextReward = nextLevel <= MAX_HERO_LEVEL ? HERO_LEVEL_BONUS[nextLevel] : null;
    const nextParts = nextReward ? rewardParts(nextReward) : null;

    return (
        <div
            className="flex flex-col items-center h-full overflow-y-auto custom-scrollbar"
            style={{ gap: LEVELS_UI.sectionGap, paddingTop: LEVELS_UI.topGap, paddingBottom: LEVELS_UI.pagePadY }}
        >
            {/* 区域 1：圆环头像（头像+等级黑圆+圆环经验槽+蓝条）+ X/N */}
            <div className="flex flex-col items-center" style={{ gap: LEVELS_UI.avatarBlockGap }}>
                <HeroAvatarRing heroKey={heroKey} level={level} exp={exp} expToNext={expToNext} size={LEVELS_UI.avatarSize} />
                <div className="font-mono font-bold text-white tracking-wider" style={{ fontSize: LEVELS_UI.expFontSize }}>
                    {expToNext > 0 ? `${exp}/${expToNext}` : 'MAX'}
                </div>
            </div>

            {/* 区域 2：下一个等级奖励 */}
            <div className="flex flex-col items-center w-full" style={{ gap: LEVELS_UI.rewardBlockGap }}>
                <div className="font-mono text-purple-300/80" style={{ fontSize: LEVELS_UI.rewardTitleFontSize }}>下一个等级奖励：</div>
                {nextReward && nextParts ? (
                    <div
                        className="flex items-center bg-white/5 border border-white/15"
                        style={{
                            gap: LEVELS_UI.rewardRowGap,
                            paddingLeft: LEVELS_UI.rewardPadX,
                            paddingRight: LEVELS_UI.rewardPadX,
                            paddingTop: LEVELS_UI.rewardPadY,
                            paddingBottom: LEVELS_UI.rewardPadY,
                            borderRadius: LEVELS_UI.rewardRadius,
                            width: LEVELS_UI.rewardWidth,
                        }}
                    >
                        {/* 左：等级数字圆 */}
                        <div
                            className="rounded-full flex items-center justify-center shrink-0"
                            style={{ width: LEVELS_UI.levelCircleSize, height: LEVELS_UI.levelCircleSize, background: 'rgba(0,0,0,0.7)', border: `2px solid ${getLevelNumberColor(nextLevel)}`, boxShadow: `0 0 15px ${getLevelNumberColor(nextLevel)}44` }}
                        >
                            <span className="font-black italic" style={{ color: getLevelNumberColor(nextLevel), fontSize: LEVELS_UI.levelNumberFontSize }}>{nextLevel}</span>
                        </div>
                        {/* 右上简介 / 下具体效果 */}
                        <div className="flex flex-col" style={{ gap: LEVELS_UI.rewardTextGap }}>
                            <div className="font-black text-white" style={{ fontSize: LEVELS_UI.rewardLabelFontSize }}>{nextParts.label}</div>
                            <div className="text-gray-300" style={{ fontSize: LEVELS_UI.rewardValueFontSize }}>{nextParts.value}</div>
                        </div>
                    </div>
                ) : (
                    <div
                        className="bg-white/5 border border-white/10 text-white font-black tracking-widest"
                        style={{
                            paddingLeft: LEVELS_UI.rewardPadX,
                            paddingRight: LEVELS_UI.rewardPadX,
                            paddingTop: LEVELS_UI.rewardPadY,
                            paddingBottom: LEVELS_UI.rewardPadY,
                            borderRadius: LEVELS_UI.rewardRadius,
                        }}
                    >已达最高等级（Lv.30）</div>
                )}
            </div>

            {/* 区域 3：查看所有等级奖励按钮（开发者：左右加减号按钮，升降级测试等级数字颜色） */}
            <div className="flex items-center" style={{ gap: LEVELS_UI.btnRowGap }}>
                {isDev && (
                    <button
                        onClick={() => { eventBus.emit(GameEvents.UI_CLICK); heroProgression.setHeroLevel(heroKey, level - 1); }}
                        disabled={level <= 1}
                        className="bg-slate-800 font-black text-gray-200 border border-white/10 hover:bg-slate-700 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                        style={{ width: LEVELS_UI.devBtnSize, height: LEVELS_UI.devBtnSize, borderRadius: LEVELS_UI.devBtnRadius, fontSize: LEVELS_UI.devBtnFontSize }}
                        title="降级（开发者专属）"
                    >
                        −
                    </button>
                )}
                <button
                    onClick={() => { eventBus.emit(GameEvents.UI_CLICK); setShowModal(true); }}
                    className="bg-gradient-to-r from-purple-600 to-purple-400 font-black tracking-widest hover:scale-105 transition-all hover:shadow-[0_0_30px_rgba(168,85,247,0.6)]"
                    style={{
                        paddingLeft: LEVELS_UI.viewAllPadX,
                        paddingRight: LEVELS_UI.viewAllPadX,
                        paddingTop: LEVELS_UI.viewAllPadY,
                        paddingBottom: LEVELS_UI.viewAllPadY,
                        borderRadius: LEVELS_UI.viewAllRadius,
                        fontSize: LEVELS_UI.viewAllFontSize,
                    }}
                >
                    查看所有天启者等级奖励
                </button>
                {isDev && (
                    <button
                        onClick={() => { eventBus.emit(GameEvents.UI_CLICK); heroProgression.setHeroLevel(heroKey, level + 1); }}
                        disabled={level >= MAX_HERO_LEVEL}
                        className="bg-slate-800 font-black text-gray-200 border border-white/10 hover:bg-slate-700 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                        style={{ width: LEVELS_UI.devBtnSize, height: LEVELS_UI.devBtnSize, borderRadius: LEVELS_UI.devBtnRadius, fontSize: LEVELS_UI.devBtnFontSize }}
                        title="升级（开发者专属）"
                    >
                        +
                    </button>
                )}
            </div>

            <LevelRewardsModal isOpen={showModal} currentLevel={level} onClose={() => setShowModal(false)} />
        </div>
    );
};

// ════════════ 弹窗：所有等级奖励列表（达到亮起 / 未激活灰，可滚动，ESC/叉号关闭）════════
const LevelRewardsModal: React.FC<{ isOpen: boolean; currentLevel: number; onClose: () => void }> = ({ isOpen, currentLevel, onClose }) => {
    const rows = useMemo(buildLevelRows, []);

    // ESC 关闭：capture + stopImmediatePropagation 拦截全局 ESC
    useEffect(() => {
        if (!isOpen) return;
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') { e.stopImmediatePropagation(); onClose(); }
        };
        window.addEventListener('keydown', handler, { capture: true });
        return () => window.removeEventListener('keydown', handler, { capture: true });
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <motion.div
                className="fixed inset-0 z-[950] flex items-center justify-center bg-black/80 backdrop-blur-sm font-sans select-none"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                onClick={() => {eventBus.emit(GameEvents.UI_BACK); onClose(); }}
            >
                <motion.div
                    initial={{ scale: 0.92, opacity: 0, y: 20 }}
                    animate={{ scale: 1, opacity: 1, y: 0 }}
                    exit={{ scale: 0.92, opacity: 0, y: 20 }}
                    transition={{ type: "spring", stiffness: 260, damping: 24 }}
                    onClick={e => e.stopPropagation()}
                    className="relative bg-slate-900/95 border-purple-500/30 shadow-[0_0_60px_rgba(88,28,135,0.4)] flex flex-col overflow-hidden"
                    style={{
                        width: LEVEL_REWARDS_UI.panelWidth,
                        maxHeight: LEVEL_REWARDS_UI.panelMaxHeightPct,
                        borderRadius: LEVEL_REWARDS_UI.panelRadius,
                        borderWidth: LEVEL_REWARDS_UI.panelBorderWidth,
                        borderStyle: 'solid',
                    }}
                >
                    {/* 头部 */}
                    <div
                        className="flex items-center justify-between border-white/10 shrink-0"
                        style={{
                            paddingLeft: LEVEL_REWARDS_UI.headerPadX,
                            paddingRight: LEVEL_REWARDS_UI.headerPadX,
                            paddingTop: LEVEL_REWARDS_UI.headerPadY,
                            paddingBottom: LEVEL_REWARDS_UI.headerPadY,
                            borderBottomWidth: LEVEL_REWARDS_UI.headerBorderWidth,
                            borderStyle: 'solid',
                        }}
                    >
                        <h3 className="font-black tracking-widest text-white" style={{ fontSize: LEVEL_REWARDS_UI.titleFontSize }}>天启者等级奖励</h3>
                        <button
                            onClick={() => { eventBus.emit(GameEvents.UI_BACK); onClose(); }}
                            className="rounded-full text-gray-400 hover:bg-white/10 hover:text-white transition-all"
                            style={{ padding: LEVEL_REWARDS_UI.closePad }}
                        >
                            <X size={LEVEL_REWARDS_UI.closeIconSize} />
                        </button>
                    </div>
                    {/* 列表：达到亮起 / 未激活灰 */}
                    <div
                        className="flex-1 overflow-y-auto custom-scrollbar flex flex-col"
                        style={{ padding: LEVEL_REWARDS_UI.listPad, gap: LEVEL_REWARDS_UI.rowGap }}
                    >
                        {rows.map(r => {
                            const reached = r.level <= currentLevel;
                            return (
                                <div key={r.level}
                                    className={`flex items-center shrink-0 transition-all ${reached ? 'bg-white/5 border-white/15' : 'bg-transparent border-white/5 opacity-40 grayscale'}`}
                                    style={{
                                        gap: LEVEL_REWARDS_UI.rowInnerGap,
                                        paddingLeft: LEVEL_REWARDS_UI.rowPadX,
                                        paddingRight: LEVEL_REWARDS_UI.rowPadX,
                                        paddingTop: LEVEL_REWARDS_UI.rowPadY,
                                        paddingBottom: LEVEL_REWARDS_UI.rowPadY,
                                        borderRadius: LEVEL_REWARDS_UI.rowRadius,
                                        borderWidth: LEVEL_REWARDS_UI.rowBorderWidth,
                                        borderStyle: 'solid',
                                    }}>
                                    {/* 等级数字圆（激活色按 getLevelNumberColor 6 段设计） */}
                                    <div className="rounded-full flex items-center justify-center shrink-0"
                                        style={{ width: LEVEL_REWARDS_UI.levelCircleSize, height: LEVEL_REWARDS_UI.levelCircleSize, background: 'rgba(0,0,0,0.7)', border: `2px solid ${reached ? getLevelNumberColor(r.level) : '#4b5563'}` }}>
                                        <span className="font-black italic" style={{ color: reached ? getLevelNumberColor(r.level) : '#9ca3af', fontSize: LEVEL_REWARDS_UI.levelNumberFontSize }}>{r.level}</span>
                                    </div>
                                    {/* 简介 + 具体效果 */}
                                    <div className="flex flex-col" style={{ gap: LEVEL_REWARDS_UI.textGap }}>
                                        <div className={`font-black ${reached ? 'text-white' : 'text-gray-500'}`} style={{ fontSize: LEVEL_REWARDS_UI.labelFontSize }}>{r.label}</div>
                                        {r.value && <div className={reached ? 'text-gray-300' : 'text-gray-600'} style={{ fontSize: LEVEL_REWARDS_UI.valueFontSize }}>{r.value}</div>}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
};

// ════════════ 内容 ④：神格神经图（[2026-09-28 莉莉子] 占位 → 实装）════════
// 结构（程 09-28 设计）：**6 个节点 · 左 3 右 3**，每节点 1 星（0-6 星）
//   ① 基调 A  ② 基调 B  ③ A 的升级  ④ B 的升级  ⑤ 固定槽（开局法力+1，全英雄同）  ⑥ 决胜能力
// 解锁（程定）：**严格顺序**（③需①／④需②／⑤需①②③④／⑥需⑤）
//   · [2026-09-29 程拍板] 货币改为**神格碎片**：专属碎片（每英雄各一种）+ **万能碎片（可全额替代）**
//     花费优先级：先花专属、再用万能补足；价格 10/20/30/40/40/60（满级 200 片）
// 载体：激活后由 RogueGameWrapper 注入本场（借道迷宫强化管线）；③④ 以"覆盖"方式取代 ①②（resolveDivinityEffects）
// [2026-09-29 程拍板] 图标：①③ 小技能 · ②④ 大招 · ⑤ 支援技 · ⑥ 天启者法术（取 SPELL_IMAGES[node.icon]）
//   界面：中央天启者**大卡面原画** + 左右各 3 节点**弧线环绕**（程按参考图定稿的放大版）
//
// ⚙️ 要调大小 / 错落幅度，改下面这组常量即可：
//   📐 可用空间参考：游戏舞台固定 **1680×1050** 逻辑像素
//      本内容区 ≈ **1288 宽 × 686 高**（1680 − 280 左列 − 48 px-6 − 24 gap-6 − 40 p-5；
//      高度已扣掉顶栏 / 详情栏。divinity 下手牌主视觉是隐藏的，不占宽）
//   ⚠️ 铁律：**总宽必须 < 1288**，否则会出横向滚动条、溢出还会压到左侧星槽
//
// ── 📋 本页可调项一览（2026-10-16 补齐页内写死的尺寸类）────────────────────
//   · 舞台骨架（**勿改名**，`DIV_STAGE_W` 派生式依赖）：DIV_CARD_W / DIV_CARD_H / DIV_ICON_PX /
//     DIV_ICON_INNER_PX / DIV_BLOCK_W / DIV_CARD_GAP / DIV_ARC_OFFSET / ARC_OFFSETS
//   · ① 空占位（未实装天启者）：DIV_EMPTY_*
//   · ② 顶部条（标题 + 星数 + 碎片钱包 + 开发者重置）：DIV_TOP_* / DIV_CHIP_* / DIV_WALLET_*
//   · ③ 节点按钮（左右各 3 个）：DIV_NODE_*
//   · ④ 中央天启者卡面：DIV_CARD_NAME_* / DIV_CARD_STAR_* / DIV_FADE_* / DIV_CORE_LABEL_*
//   · ⑤ 底部详情 + 激活按钮：DIV_DETAIL_* / DIV_BADGE_* / DIV_COST_* / DIV_ACT_*
const DIV_CARD_W = 310;                    // 中央卡面宽（**显式写死**）
//   ↑ 不能改用 aspect-ratio + flex-1 —— 在 auto 宽容器里宽度会算飞，直接撑爆面板（踩过）
const DIV_CARD_H = 540;                    // 中央卡面高
const DIV_ICON_PX = 120;                    // 节点技能图标徽章直径
const DIV_ICON_INNER_PX = 100;              // 徽章内圈（技能图）直径
const DIV_BLOCK_W = 380;                   // 节点面板块宽
const DIV_CARD_GAP = 26;                   // 卡面 ↔ 节点 的横向间距（收紧，别拉远）
/** 弧线：**只有中间那个节点**（③④）往外推多少 px —— 上下两个留在原位，形成外弧 */
const DIV_ARC_OFFSET = 44;
/**
 * 各列节点横向偏移（索引 0/1/2 = 上/中/下）。
 * ⚠️ 方向踩过坑：只能把**中间**往外推（左列负 / 右列正）；
 *    若改成"把上下两个向内推"，它们会撞进卡面，反而显得中间那个离卡面很远。
 */
const ARC_OFFSETS: Record<'left' | 'right', number[]> = {
    left: [0, -DIV_ARC_OFFSET, 0],
    right: [0, DIV_ARC_OFFSET, 0],
};
/** 舞台总宽（供参考/自检：应远小于 1288） */
const DIV_STAGE_W = DIV_BLOCK_W * 2 + DIV_CARD_GAP * 2 + DIV_CARD_W + DIV_ARC_OFFSET * 2;

// ── ① 空占位（该天启者神格神经未实装时）──
const DIV_EMPTY_PAD_Y = 64;                // 上下内边距（原 py-16 = 64）
const DIV_EMPTY_GAP = 16;                  // 图标 / 标题 / 说明 之间间距（原 gap-4 = 16）
const DIV_EMPTY_ICON_PX = 48;              // 顶部 Sparkles 图标（原 `<Sparkles size={48} />`）
const DIV_EMPTY_TITLE_FONT = 18;           // 「神格神经图」字号（原 text-lg = 18）
const DIV_EMPTY_NOTE_PAD_X = 16;           // 说明块左右内边距（原 px-4 = 16）
const DIV_EMPTY_NOTE_PAD_Y = 8;            // 说明块上下内边距（原 py-2 = 8）
const DIV_EMPTY_NOTE_RADIUS = 8;           // 说明块圆角（原 rounded-lg = 8）
const DIV_EMPTY_NOTE_BORDER = 1;           // 说明块描边粗细（原 border = 1）
const DIV_EMPTY_NOTE_FONT = 12;            // 说明块字号（原 text-xs = 12）

// ── ② 顶部条：标题 + 星数 + 开发者重置 + 碎片钱包 ──
const DIV_TOP_GAP = 12;                    // 顶部条 ↔ 神经图 ↔ 详情 的纵向间距（原 gap-3 = 12）
const DIV_TOP_PAD_X = 8;                   // 顶部条左右内边距（原 px-2 = 8）
const DIV_TOP_ROW_GAP = 8;                 // 左组（标题/星数）与右组（按钮/钱包）内部间距（原 gap-2 = 8）
const DIV_HEAD_FONT = 28;                  // 「神格神经图」小标题字号（原 text-sm = 14）
const DIV_STAR_ROW_GAP = 2;                // 星数那一排 ★ 的间距（原 gap-0.5 = 2）
const DIV_HEAD_STAR_FONT = 26;             // 顶部星数字号（原 text-[13px]）
const DIV_COUNT_FONT = 24;                 // 「N/6」计数号字号（原 text-xs = 12）
const DIV_CHIP_PAD_X = 12;                 // 胶囊（重置按钮 / 碎片钱包）左右内边距（原 px-3 = 12）
const DIV_CHIP_PAD_Y = 4;                  // 胶囊上下内边距（原 py-1 = 4）
const DIV_CHIP_RADIUS = 8;                 // 胶囊圆角（原 rounded-lg = 8）
const DIV_CHIP_FONT = 24;                  // 胶囊字号（原 text-xs = 12）
const DIV_CHIP_BORDER = 1;                 // 胶囊描边粗细（原 border = 1）
const DIV_CHIP_GAP = 6;                    // 胶囊内「图标 ↔ 文字」间距（原 gap-1.5 = 6）
const DIV_WALLET_ICON_PX = 30;             // 碎片钱包里的碎片图标（原 `<ShardIcon size={20} />`）

// ── ③ 节点按钮 ──
const DIV_NODE_GAP = 16;                   // 徽章 ↔ 文案 横向间距（原 gap-4 = 16）
const DIV_NODE_PAD_X = 16;                 // 按钮左右内边距（原内联 `padding: '14px 16px'` 的 16）
const DIV_NODE_PAD_Y = 14;                 // 按钮上下内边距（原内联 `padding: '14px 16px'` 的 14）
const DIV_NODE_RADIUS = 16;                // 按钮圆角（原 rounded-2xl = 16）
const DIV_NODE_BORDER = 1;                 // 按钮描边粗细（原 border = 1）
const DIV_NODE_SLOT_FONT = 30;             // 无图标时兜底显示的节点号字号（原 text-xl = 20）
const DIV_NODE_TEXT_GAP = 6;               // 文案三行之间间距（原 gap-1.5 = 6）
const DIV_NODE_NUM_FONT = 26;              // 「节点 N」字号（原 text-[13px]）
const DIV_NODE_TITLE_FONT = 36;            // 节点名字号（原 text-[21px]）
const DIV_NODE_STATUS_FONT = 15;           // 状态行（已激活 / 消耗 N 片）字号（原 text-[15px]）
const DIV_NODE_STATUS_GAP = 6;             // 状态行内「图标 ↔ 文字」间距（原 gap-1.5 = 6）
const DIV_NODE_SHARD_PX = 32;              // 状态行里的碎片图标（原 `<ShardIcon size={16} />`）
const DIV_STAR_BADGE_PX = 48;              // 已激活右下角金星直径（原 w-6 h-6 = 24）
const DIV_STAR_BADGE_FONT = 13;            // 金星字号（原 text-[13px]）
const DIV_STAR_BADGE_BORDER = 2;           // 金星描边粗细（原 border-2 = 2）
const DIV_DOT_PX = 32;                     // 可激活提示点直径（原 w-4 h-4 = 16）
const DIV_DOT_BORDER = 2;                  // 提示点描边粗细（原 border-2 = 2）

// ── ④ 中央天启者卡面 ──
const DIV_COLUMN_PAD_Y = 4;                // 左右两列上下内边距（原内联 paddingTop / paddingBottom = 4）
const DIV_CARD_RADIUS = 16;                // 卡面圆角（原 rounded-2xl = 16）
const DIV_FADE_TOP_H = 96;                 // 顶部主题色淡染高度（原 h-24 = 96）
const DIV_FADE_BOTTOM_H = 144;             // 底部沉底渐隐高度（原 h-36 = 144）
const DIV_CARD_NAME_PAD_X = 12;            // 名字区左右内边距（原 px-3 = 12）
const DIV_CARD_NAME_PAD_BOTTOM = 16;       // 名字区下内边距（原 pb-4 = 16）
const DIV_CARD_NAME_GAP = 8;               // 「名字 ↔ 卡面星数」间距（原 gap-2 = 8）
const DIV_CARD_NAME_FONT = 30;             // 卡面名字字号（原 text-[30px]）
const DIV_CARD_STAR_GAP = 6;               // 卡面星数那一排 ★ 的间距（原 gap-1.5 = 6）
const DIV_CARD_STAR_FONT = 19;             // 卡面星数字号（原 text-[19px]）
const DIV_CORE_LABEL_MARGIN_TOP = 12;      // 「NEURAL CORE」距卡面（原 mt-3 = 12）
const DIV_CORE_LABEL_FONT = 11;            // 「NEURAL CORE」字号（原 text-[11px]）

// ── ⑤ 底部详情 + 激活按钮 ──
const DIV_DETAIL_RADIUS = 12;              // 详情块圆角（原 rounded-xl = 12）
const DIV_DETAIL_BORDER = 1;               // 详情块描边粗细（原 border = 1）
const DIV_DETAIL_PAD_X = 16;               // 详情块左右内边距（原 px-4 = 16）
const DIV_DETAIL_PAD_Y = 12;               // 详情块上下内边距（原 py-3 = 12）
const DIV_DETAIL_HEAD_GAP = 8;             // 标题行内「名字 ↔ 节点徽标 ↔ 固定槽」间距（原 gap-2 = 8）
const DIV_DETAIL_HEAD_MARGIN_BOTTOM = 4;   // 标题行与描述间距（原 mb-1 = 4）
const DIV_BADGE_FONT = 15;                 // 「节点 N」小徽标 / 「全英雄固定槽」字号（原 text-[10px]）
const DIV_BADGE_PAD_X = 6;                 // 小徽标左右内边距（原 px-1.5 = 6）
const DIV_BADGE_PAD_Y = 2;                 // 小徽标上下内边距（原 py-0.5 = 2）
const DIV_BADGE_RADIUS = 4;                // 小徽标圆角（原 rounded = 4）
const DIV_DESC_FONT = 24;                  // 节点描述字号（原 text-xs = 12）
const DIV_DESC_MARGIN_BOTTOM = 8;          // 描述与消耗行间距（原 mb-2 = 8）
const DIV_COST_FONT = 24;                  // 消耗明细行字号（原 text-[12px]）
const DIV_COST_GAP_X = 8;                  // 消耗明细横向间距（原 gap-x-2 = 8）
const DIV_COST_GAP_Y = 4;                  // 消耗明细纵向间距（原 gap-y-1 = 4）
const DIV_COST_ITEM_GAP = 4;               // 消耗明细内「碎片图标 ↔ 数字」间距（原 gap-1 = 4）
const DIV_COST_MARGIN_BOTTOM = 8;          // 消耗明细与前置行间距（原 mb-2 = 8）
const DIV_DETAIL_FOOT_GAP = 12;            // 底行「前置 ↔ 激活按钮」间距（原 gap-3 = 12）
const DIV_REQ_FONT = 22;                   // 「前置：…」字号（原 text-[11px]）
const DIV_ACT_BTN_PAD_X = 20;              // 激活按钮左右内边距（原 px-5 = 20）
const DIV_ACT_BTN_PAD_Y = 6;               // 激活按钮上下内边距（原 py-1.5 = 6）
const DIV_ACT_BTN_RADIUS = 8;              // 激活按钮圆角（原 rounded-lg = 8）
const DIV_ACT_BTN_FONT = 24;               // 激活按钮字号（原 text-xs = 12）

export const DivinityContent: React.FC<{ heroKey: string; heroName: string; userSystem?: any }> = ({ heroKey, heroName, userSystem }) => {
    const { getUnlocked, getHeroShardCount, getUniversalShardCount, getSpendPlan, canUnlock, unlockNode, resetHero } = useHeroDivinity();
    const nodes = getDivinityNodes(heroKey);
    const unlocked = getUnlocked(heroKey);
    // [2026-09-29 程拍板] 碎片钱包（开发者账号恒 9999）
    const heroShards = getHeroShardCount(heroKey);   // 本英雄专属碎片
    const uniShards = getUniversalShardCount();      // 万能碎片
    const theme = HERO_THEMES[heroKey] ?? HERO_THEMES.lyfe;
    const isDev = userSystem?.userId === 'dev_full_admin'; // [2026-09-28 开发者] 重置按钮
    const [pickId, setPickId] = useState<string | null>(null);
    const [resetArmed, setResetArmed] = useState(false); // 两段确认，防手滑清空

    // 未设计的天启者 → 占位（里芙纵切先行）
    if (nodes.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center text-center h-full"
                style={{ paddingTop: DIV_EMPTY_PAD_Y, paddingBottom: DIV_EMPTY_PAD_Y, gap: DIV_EMPTY_GAP }}>
                <Sparkles className="text-purple-500/60" size={DIV_EMPTY_ICON_PX} />
                <p className="font-black text-white" style={{ fontSize: DIV_EMPTY_TITLE_FONT }}>神格神经图</p>
                <div className="bg-white/5 border-white/10 text-gray-400"
                    style={{
                        paddingLeft: DIV_EMPTY_NOTE_PAD_X,
                        paddingRight: DIV_EMPTY_NOTE_PAD_X,
                        paddingTop: DIV_EMPTY_NOTE_PAD_Y,
                        paddingBottom: DIV_EMPTY_NOTE_PAD_Y,
                        borderRadius: DIV_EMPTY_NOTE_RADIUS,
                        borderWidth: DIV_EMPTY_NOTE_BORDER,
                        borderStyle: 'solid',
                        fontSize: DIV_EMPTY_NOTE_FONT,
                    }}>
                    {heroName} 的神格神经尚在设计中（里芙已实装）
                </div>
            </div>
        );
    }

    const starCount = nodes.filter(n => unlocked.includes(n.id)).length;
    const picked = nodes.find(n => n.id === pickId) ?? null;
    const leftCol = nodes.filter(n => n.slot % 2 === 1);  // ① ③ ⑤
    const rightCol = nodes.filter(n => n.slot % 2 === 0); // ② ④ ⑥

    /**
     * [2026-09-29 程拍板] 单个节点：**技能图标**（对齐 `SPELL_IMAGES[n.icon]`）
     *   · 圆形徽章：外环=状态色（已激活金 / 可激活主题色 / 锁定灰），底衬技能图
     *   · 分配：①③ 小技能 · ②④ 大招 · ⑤ 支援技 · ⑥ 天启者法术
     */
    const NodeBtn: React.FC<{ n: typeof nodes[number]; side: 'left' | 'right'; offsetX: number }> = ({ n, side, offsetX }) => {
        const on = unlocked.includes(n.id);
        const st = canUnlock(n);
        const plan = getSpendPlan(heroKey, n);
        const color = on ? '#facc15' : st.ok ? theme.color : '#4b5563';
        const iconSrc = SPELL_IMAGES[getDivinityIconKey(n) as keyof typeof SPELL_IMAGES] as string | undefined;
        const active = picked?.id === n.id;
        return (
            // 弧线错落：外层承担横移（避免与按钮自身的 hover scale 抢 transform）
            <div style={{ transform: `translateX(${offsetX}px)` }}>
                <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); eventBus.emit(GameEvents.UI_CLICK); setPickId(n.id); }}
                    className={`group flex items-center outline-none transition-all ${side === 'left' ? 'flex-row-reverse text-right' : 'text-left'} ${active ? 'scale-[1.04]' : 'hover:scale-[1.03]'}`}
                    style={{
                        width: DIV_BLOCK_W,
                        gap: DIV_NODE_GAP,
                        paddingLeft: DIV_NODE_PAD_X,
                        paddingRight: DIV_NODE_PAD_X,
                        paddingTop: DIV_NODE_PAD_Y,
                        paddingBottom: DIV_NODE_PAD_Y,
                        borderRadius: DIV_NODE_RADIUS,
                        borderWidth: DIV_NODE_BORDER,
                        borderStyle: 'solid',
                        background: active ? `${color}1f` : (on ? 'rgba(30,41,59,0.5)' : 'rgba(30,41,59,0.42)'),
                        borderColor: active ? `${color}99` : (on ? `${color}44` : 'rgba(255,255,255,0.07)'),
                        boxShadow: active ? `0 0 28px ${color}66` : (on ? `0 0 18px ${color}22` : 'none'),
                    }}
                >
                    {/* 技能图标徽章（圆形 + 状态外环） */}
                    <div className="relative shrink-0">
                        <div
                            className={`rounded-full flex items-center justify-center transition-all ${st.ok && !on ? 'animate-pulse' : ''}`}
                            style={{
                                width: DIV_ICON_PX, height: DIV_ICON_PX,
                                background: `${color}22`,
                                border: `3px solid ${color}`,
                                boxShadow: active || on ? `0 0 26px ${color}aa, inset 0 0 16px ${color}44` : `0 0 10px ${color}44`,
                            }}
                        >
                            <div className="overflow-hidden rounded-full" style={{ width: DIV_ICON_INNER_PX, height: DIV_ICON_INNER_PX, background: '#0b1020' }}>
                                {iconSrc ? (
                                    <img src={iconSrc} alt={n.name} className="w-full h-full object-cover" draggable={false}
                                        style={{ filter: on || st.ok ? 'none' : 'grayscale(0.9) brightness(0.6)' }} />
                                ) : (
                                    <span className="w-full h-full flex items-center justify-center font-black text-white/70" style={{ fontSize: DIV_NODE_SLOT_FONT }}>{n.slot}</span>
                                )}
                            </div>
                        </div>
                        {/* 已激活：右下角金星 */}
                        {on && (
                            <span className="absolute -bottom-1 -right-1 rounded-full bg-amber-400 text-black font-black flex items-center justify-center border-slate-950"
                                style={{ width: DIV_STAR_BADGE_PX, height: DIV_STAR_BADGE_PX, fontSize: DIV_STAR_BADGE_FONT, borderWidth: DIV_STAR_BADGE_BORDER, borderStyle: 'solid' }}>★</span>
                        )}
                        {/* 可激活未激活：右上角提示点 */}
                        {!on && st.ok && (
                            <span className="absolute -top-0.5 -right-0.5 rounded-full bg-emerald-400 border-slate-950 animate-pulse"
                                style={{ width: DIV_DOT_PX, height: DIV_DOT_PX, borderWidth: DIV_DOT_BORDER, borderStyle: 'solid' }} />
                        )}
                    </div>
                    {/* 文案：节点号 + 名字 + 状态 */}
                    <div className={`flex flex-col min-w-0 ${side === 'left' ? 'items-end' : 'items-start'}`} style={{ gap: DIV_NODE_TEXT_GAP }}>
                        <span className="font-mono text-gray-500 tracking-wider" style={{ fontSize: DIV_NODE_NUM_FONT }}>节点 {n.slot}</span>
                        <span className={`font-black leading-tight whitespace-nowrap ${on ? 'text-amber-200' : st.ok ? 'text-white' : 'text-gray-400'}`} style={{ fontSize: DIV_NODE_TITLE_FONT }}>
                            {n.name}
                        </span>
                        <span className={`font-mono flex items-center ${on ? 'text-amber-400/90' : st.ok ? 'text-emerald-300' : 'text-gray-500'}`} style={{ fontSize: DIV_NODE_STATUS_FONT, gap: DIV_NODE_STATUS_GAP }}>
                            {on ? '已激活' : st.reason === 'locked' ? '🔒 前置未开' : (<><ShardIcon heroKey={heroKey} size={DIV_NODE_SHARD_PX} />{plan.total}</>)}
                        </span>
                    </div>
                </button>
            </div>
        );
    };

    return (
        <div className="h-full flex flex-col" style={{ gap: DIV_TOP_GAP }}>
            {/* 顶部：星数 + 碎片钱包 */}
            <div className="shrink-0 flex items-center justify-between" style={{ paddingLeft: DIV_TOP_PAD_X, paddingRight: DIV_TOP_PAD_X }}>
                <div className="flex items-center" style={{ gap: DIV_TOP_ROW_GAP }}>
                    <span className="font-black text-white tracking-widest" style={{ fontSize: DIV_HEAD_FONT }}>神格神经图</span>
                    <span className="flex items-center" style={{ gap: DIV_STAR_ROW_GAP }}>
                        {Array.from({ length: MAX_DIVINITY_LEVEL }).map((_, i) => (
                            <span key={i} className={`leading-none ${i < starCount ? 'text-amber-400' : 'text-gray-600'}`} style={{ fontSize: DIV_HEAD_STAR_FONT }}>★</span>
                        ))}
                    </span>
                    <span className="font-mono text-gray-400" style={{ fontSize: DIV_COUNT_FONT }}>{starCount}/{MAX_DIVINITY_LEVEL}</span>
                </div>
                <div className="flex items-center" style={{ gap: DIV_TOP_ROW_GAP }}>
                    {isDev && (
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                eventBus.emit(GameEvents.UI_CLICK);
                                if (!resetArmed) { setResetArmed(true); return; }
                                resetHero(heroKey);   // 二次点击才真清空
                                setResetArmed(false);
                                setPickId(null);
                            }}
                            onBlur={() => setResetArmed(false)}
                            className={`font-black transition-all ${
                                resetArmed
                                    ? 'bg-red-600/80 border-red-400 text-white animate-pulse'
                                    : 'bg-slate-800 border-white/10 text-gray-300 hover:bg-slate-700'
                            }`}
                            style={{
                                paddingLeft: DIV_CHIP_PAD_X,
                                paddingRight: DIV_CHIP_PAD_X,
                                paddingTop: DIV_CHIP_PAD_Y,
                                paddingBottom: DIV_CHIP_PAD_Y,
                                borderRadius: DIV_CHIP_RADIUS,
                                fontSize: DIV_CHIP_FONT,
                                borderWidth: DIV_CHIP_BORDER,
                                borderStyle: 'solid',
                            }}
                            title="重置该天启者的神格神经（开发者专属，两段确认）"
                        >
                            {resetArmed ? '确认重置？' : '重置'}
                        </button>
                    )}
                    {/* [2026-09-29 程拍板] 碎片钱包：本英雄专属（头像菱形）+ 万能（橙菱形） */}
                    <span className="flex items-center bg-purple-500/15 border-purple-400/40 text-purple-200 font-black"
                        style={{ gap: DIV_CHIP_GAP, paddingLeft: DIV_CHIP_PAD_X, paddingRight: DIV_CHIP_PAD_X, paddingTop: DIV_CHIP_PAD_Y, paddingBottom: DIV_CHIP_PAD_Y, borderRadius: DIV_CHIP_RADIUS, fontSize: DIV_CHIP_FONT, borderWidth: DIV_CHIP_BORDER, borderStyle: 'solid' }}
                        title={`${heroName}的神格碎片（专属，只能点本英雄）`}>
                        <ShardIcon heroKey={heroKey} size={DIV_WALLET_ICON_PX} /> {heroName}碎片 {heroShards}
                    </span>
                    <span className="flex items-center bg-amber-500/15 border-amber-400/40 text-amber-200 font-black"
                        style={{ gap: DIV_CHIP_GAP, paddingLeft: DIV_CHIP_PAD_X, paddingRight: DIV_CHIP_PAD_X, paddingTop: DIV_CHIP_PAD_Y, paddingBottom: DIV_CHIP_PAD_Y, borderRadius: DIV_CHIP_RADIUS, fontSize: DIV_CHIP_FONT, borderWidth: DIV_CHIP_BORDER, borderStyle: 'solid' }}
                        title="万能碎片（可替代任何天启者的专属碎片）">
                        <ShardIcon size={DIV_WALLET_ICON_PX} /> 万能 {uniShards}
                    </span>
                </div>
            </div>

            {/* ═══ 神经图 · [2026-09-29 程拍板 v3] 大卡面原画 + 节点外弧环绕 ═══
                   布局（弧线：**只有中间那个**往外推，上下留在原位）：
                        ①              ②
                   ③ ←外弧   里芙卡面   外弧→ ④
                        ⑤              ⑥
                   ⚠️ 外层 overflow-hidden 是护栏：内容万一超宽也不会压到左侧星槽      */}
            <div className="flex-1 min-h-0 flex items-center justify-center overflow-hidden">
                {/* 舞台：显式尺寸（内容区 ≈1288×686，此处只占 ~950×566，余量充足） */}
                <div className="flex items-center justify-center" style={{ maxWidth: DIV_STAGE_W }}>
                    {/* 左列：① ③ ⑤（右对齐朝卡面；仅中间 ③ 外推） */}
                    <div className="flex flex-col justify-between items-end h-full"
                        style={{ height: DIV_CARD_H + 26, paddingTop: DIV_COLUMN_PAD_Y, paddingBottom: DIV_COLUMN_PAD_Y }}>
                        {leftCol.map((n, i) => <NodeBtn key={n.id} n={n} side="left" offsetX={ARC_OFFSETS.left[i] ?? 0} />)}
                    </div>

                    {/* 中央：天启者**大卡面原画**（显式宽高，杜绝 aspect-ratio 失控） */}
                    <div className="shrink-0 flex flex-col items-center"
                        style={{ marginLeft: DIV_CARD_GAP, marginRight: DIV_CARD_GAP }}>
                        <div
                            className="relative overflow-hidden shrink-0"
                            style={{
                                width: DIV_CARD_W, height: DIV_CARD_H,
                                borderRadius: DIV_CARD_RADIUS,
                                border: `3px solid ${theme.color}`,
                                boxShadow: `0 0 44px ${theme.glow}, 0 0 110px ${theme.color}44, inset 0 0 40px rgba(0,0,0,0.65)`,
                            }}
                        >
                            <img
                                src={HERO_IMAGES[heroKey]?.base}
                                alt={heroName}
                                className="w-full h-full object-cover"
                                draggable={false}
                            />
                            {/* [2026-09-29 程拍板] 渐隐改用**天启者主题色**（原来用黑 → 把立绘的脸压黑了）
                                · 顶部：主题亮色淡染（让卡面融进背景，但不遮脸）
                                · 底部：阵营深色(soft) 沉底 → 主题色过渡，保证名字/星数可读 */}
                            <div className="absolute inset-x-0 top-0 pointer-events-none"
                                style={{ height: DIV_FADE_TOP_H, background: `linear-gradient(to bottom, ${theme.color}59, transparent)` }} />
                            <div className="absolute inset-x-0 bottom-0 pointer-events-none"
                                style={{ height: DIV_FADE_BOTTOM_H, background: `linear-gradient(to top, ${theme.soft}F2, ${theme.color}55 55%, transparent)` }} />
                            {/* 卡面底部：名字 + 星数 */}
                            <div className="absolute inset-x-0 bottom-0 flex flex-col items-center"
                                style={{ paddingLeft: DIV_CARD_NAME_PAD_X, paddingRight: DIV_CARD_NAME_PAD_X, paddingBottom: DIV_CARD_NAME_PAD_BOTTOM, gap: DIV_CARD_NAME_GAP }}>
                                <span className="font-black text-white tracking-wide drop-shadow-[0_0_10px_rgba(0,0,0,0.95)]" style={{ fontSize: DIV_CARD_NAME_FONT }}>{heroName}</span>
                                <span className="flex items-center" style={{ gap: DIV_CARD_STAR_GAP }}>
                                    {Array.from({ length: MAX_DIVINITY_LEVEL }).map((_, i) => (
                                        <span key={i} className={`leading-none ${i < starCount ? 'text-amber-400' : 'text-white/25'}`} style={{ fontSize: DIV_CARD_STAR_FONT }}>★</span>
                                    ))}
                                </span>
                            </div>
                        </div>
                        <span className="shrink-0 text-gray-500 font-mono tracking-[0.42em]" style={{ marginTop: DIV_CORE_LABEL_MARGIN_TOP, fontSize: DIV_CORE_LABEL_FONT }}>NEURAL CORE</span>
                    </div>

                    {/* 右列：② ④ ⑥（左对齐朝卡面；仅中间 ④ 外推） */}
                    <div className="flex flex-col justify-between items-start h-full"
                        style={{ height: DIV_CARD_H + 26, paddingTop: DIV_COLUMN_PAD_Y, paddingBottom: DIV_COLUMN_PAD_Y }}>
                        {rightCol.map((n, i) => <NodeBtn key={n.id} n={n} side="right" offsetX={ARC_OFFSETS.right[i] ?? 0} />)}
                    </div>
                </div>
            </div>

            {/* 详情 + 激活 */}
            {picked && (() => {
                const on = unlocked.includes(picked.id);
                const st = canUnlock(picked);
                const plan = getSpendPlan(heroKey, picked);
                const reqNames = picked.requires.map(r => nodes.find(x => x.id === r)?.name ?? r).join('、');
                return (
                    <div className="shrink-0 border-white/10 bg-black/40"
                        style={{
                            borderRadius: DIV_DETAIL_RADIUS,
                            borderWidth: DIV_DETAIL_BORDER,
                            borderStyle: 'solid',
                            paddingLeft: DIV_DETAIL_PAD_X,
                            paddingRight: DIV_DETAIL_PAD_X,
                            paddingTop: DIV_DETAIL_PAD_Y,
                            paddingBottom: DIV_DETAIL_PAD_Y,
                        }}>
                        <div className="flex items-center" style={{ gap: DIV_DETAIL_HEAD_GAP, marginBottom: DIV_DETAIL_HEAD_MARGIN_BOTTOM }}>
                            <span className="font-black text-white">{picked.name}</span>
                            <span className="font-mono" style={{ fontSize: DIV_BADGE_FONT, paddingLeft: DIV_BADGE_PAD_X, paddingRight: DIV_BADGE_PAD_X, paddingTop: DIV_BADGE_PAD_Y, paddingBottom: DIV_BADGE_PAD_Y, borderRadius: DIV_BADGE_RADIUS, color: theme.color, border: `1px solid ${theme.color}55` }}>
                                节点 {picked.slot}
                            </span>
                            {picked.slot === 5 && <span className="text-gray-400" style={{ fontSize: DIV_BADGE_FONT }}>（全英雄固定槽）</span>}
                        </div>
                        <p className="text-gray-300 leading-relaxed" style={{ fontSize: DIV_DESC_FONT, marginBottom: DIV_DESC_MARGIN_BOTTOM }}>{picked.description}</p>
                        {/* [2026-09-29 程拍板] 花费明细：先花专属、万能补足（万能可全额替代）—— 带碎片图标 */}
                        {!on && (
                            <div className="flex flex-wrap items-center font-mono text-gray-400"
                                style={{ columnGap: DIV_COST_GAP_X, rowGap: DIV_COST_GAP_Y, fontSize: DIV_COST_FONT, marginBottom: DIV_COST_MARGIN_BOTTOM }}>
                                <span>消耗：</span>
                                <span className="flex items-center text-purple-300" style={{ gap: DIV_COST_ITEM_GAP }}>
                                    <ShardIcon heroKey={heroKey} size={DIV_NODE_SHARD_PX} />{plan.heroSpend} 专属
                                </span>
                                {plan.universalSpend > 0 && (
                                    <span className="flex items-center text-amber-300" style={{ gap: DIV_COST_ITEM_GAP }}>
                                        <ShardIcon size={DIV_NODE_SHARD_PX} />{plan.universalSpend} 万能
                                    </span>
                                )}
                                <span className="text-gray-500">（共 {plan.total} 片）</span>
                            </div>
                        )}
                        <div className="flex items-center justify-between" style={{ gap: DIV_DETAIL_FOOT_GAP }}>
                            <span className="text-gray-500" style={{ fontSize: DIV_REQ_FONT }}>
                                {reqNames ? `前置：${reqNames}` : '无前置'}
                            </span>
                            <button
                                type="button"
                                disabled={!st.ok}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    eventBus.emit(GameEvents.UI_CLICK);
                                    unlockNode(picked);
                                }}
                                className={`font-black tracking-wider transition-all ${
                                    on ? 'bg-amber-500/20 text-amber-200 cursor-default'
                                        : st.ok ? 'bg-gradient-to-r from-purple-600 to-fuchsia-500 hover:scale-105 shadow-[0_0_16px_rgba(168,85,247,0.45)] text-white'
                                        : 'bg-white/5 text-gray-500 cursor-not-allowed'
                                }`}
                                style={{
                                    paddingLeft: DIV_ACT_BTN_PAD_X,
                                    paddingRight: DIV_ACT_BTN_PAD_X,
                                    paddingTop: DIV_ACT_BTN_PAD_Y,
                                    paddingBottom: DIV_ACT_BTN_PAD_Y,
                                    borderRadius: DIV_ACT_BTN_RADIUS,
                                    fontSize: DIV_ACT_BTN_FONT,
                                }}
                            >
                                {on ? '已激活'
                                    : st.reason === 'locked' ? '前置未开'
                                    : st.reason === 'poor' ? `碎片不足（需 ${plan.total} 片）`
                                    : `激活（${plan.total} 片）`}
                            </button>
                        </div>
                    </div>
                );
            })()}
        </div>
    );
};

// ════════════ 内容 ⑤：武装（装备系统 · 武装槽）════════
// 🎛️ 本节的**视觉调参区在文件顶部 `ARMAMENT_UI`**（武装页 + 共享件 ArmamentSlot / ArmamentSlots / HandWithArmament）。
// [2026-08-14 莉莉子] 武装=特殊装备，与其他装备同在 data/equipment.ts 管理，
//   但**不能在局内获取，只能局外带入**（进入游戏前配置）。本界面先做武装槽视觉：
//   左侧当前天启者手牌样式 + 右侧从上到下 3 个武装空槽（六边形白色描边黑色空底）。
// 六边形 clip-path 对齐装备方块（Card.tsx EQUIPMENT_HEXAGON_CLIP 同款，此处独立定义避免动核心文件）
const ARMAMENT_HEXAGON_CLIP = 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)';
// 手牌样式卡牌高度（对齐 Card.tsx deck-builder 容器 w-[130px] h-[202px]；武装槽 3 槽+间隔总高 = 手牌高度 202×scale）
const HAND_CARD_HEIGHT = 202;
// 装备/武装稀有度颜色（对齐 Card.tsx EQUIPMENT_RARITY_COLOR）
// [2026-08-27] 六档品质色：白/绿/蓝/紫/金/红（对齐 Card.tsx EQUIPMENT_RARITY_COLOR）
const EQUIP_RARITY_COLOR: Record<string, string> = {
    common: '#e5e7eb',
    uncommon: '#22c55e',
    rare: '#3b82f6',
    epic: '#a855f7',
    legendary: '#facc15',
    mythic: '#ef4444',
};
// 稀有度中文（品质描述用：「史诗武装」「优秀装备」）
const RARITY_LABEL: Record<string, string> = {
    common: '普通', uncommon: '优秀', rare: '稀有', epic: '史诗', legendary: '传说', mythic: '神话',
};
// 稀有度等级（武装品质解锁判断：未解锁品质不可装备）
const RARITY_RANK: Record<string, number> = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4, mythic: 5 };
// [2026-09-26 莉莉子] 武装库筛选 + 排序
//   形态参考 HeroSelectModal（工具条：搜索 + 排序下拉 + 方向 + 筛选开合 + 清空），筛选面板参考 DeckBuilder 的多选 tag。
//   ⚠️ 武装 ≠ 卡牌：它带「此刻能不能装进这个槽」的强状态（品质上限按槽独立 + 库存份数 + 同英雄不叠加），
//   所以把「可用优先」设为默认排序，并配「只看能装入此槽」开关（槽位智能默认 = 开）。
type ArmSortMode = 'usable' | 'rarity' | 'stock' | 'name' | 'order';
const ARM_SORT_LABELS: Record<ArmSortMode, string> = {
    usable: '可用优先',
    rarity: '品质高低',
    stock: '剩余数量',
    name: '名称',
    order: '原始顺序',
};
const ARM_RARITY_ORDER = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'] as const;
// 武装/装备持有数量上限（每个最多 3 个；开发者持有所有武装和装备各 3）
const ARMAMENT_MAX_STOCK = 3;
// [2026-09-07 程拍板] 品质上限空槽 = 斜向渐变（左上品质色 → 右下渐透），通透不艳、无文字
/** 描边层渐变：左上 cap 色 b3(70%) → 中段 40 → 右下透明 */
const capSlotGradient = (hex: string): string => `linear-gradient(135deg, ${hex}b3 0%, ${hex}40 55%, ${hex}00 85%)`;
/** 玻璃上斜向品晕（左上淡染，已装武装/空槽通用背景层） */
const capSlotGlow = (hex: string): string => `linear-gradient(135deg, ${hex}4d 0%, ${hex}00 100%)`;

// [2026-08-26 莉莉子] 拖拽跟手图标偏移微调接口（dx 正=右，dy 正=下）：
// 命中检测以鼠标位置为准（鼠标移到槽位即高亮可替换），此偏移仅影响图标显示观感，可在此微调
const DRAG_ICON_OFFSET = { dx: 0, dy: 0 };

/** 武装槽：六边形。equipId 有值时显示已配置武装图标（稀有度色）。
 *  [2026-09-07 重修申请] capRarity 传该槽可装备品质上限 → 空槽呈品质色斜向渐变（左上→右下渐透），
 *  直观看到这个槽现在能装到什么品质（重修通关升档后颜色随之变化）。 */
export const ArmamentSlot: React.FC<{ height?: number; equipId?: string | null; locked?: boolean; capRarity?: ArmamentRarity }> = ({ height = 48, equipId, locked, capRarity }) => {
    const width = height * 0.88;
    const def = equipId ? getEquipmentById(equipId) : undefined;
    const capColor = capRarity ? EQUIP_RARITY_COLOR[capRarity] : undefined;
    return (
        // [2026-08-26 莉莉子] 已配置武装的槽可悬停浮现武装大卡（总览/手牌样式等共用本组件，一处绑定全生效）
        <div className="relative shrink-0" style={{ width, height }} {...(equipId ? bindArmamentGaze(equipId) : {})}>
            {locked ? (
                // [2026-08-15] 未解锁槽：灰色锁图标（对齐武装界面样式）
                <>
                    <div className="absolute inset-0" style={{ clipPath: ARMAMENT_HEXAGON_CLIP, background: 'rgba(255,255,255,0.18)', filter: 'drop-shadow(0 0 6px rgba(255,255,255,0.15))' }} />
                    <div className="absolute inset-[3px] flex items-center justify-center" style={{ clipPath: ARMAMENT_HEXAGON_CLIP, background: '#0f172a' }}>
                        <Lock size={height * 0.3} className="text-gray-500" />
                    </div>
                </>
            ) : def ? (
                <>
                    {/* 已装武装：外层底色 = 武装品质色（对齐装备方块稀有度描边） */}
                    <div
                        className="absolute inset-0"
                        style={{ clipPath: ARMAMENT_HEXAGON_CLIP, background: EQUIP_RARITY_COLOR[def.rarity], filter: `drop-shadow(0 0 6px ${EQUIP_RARITY_COLOR[def.rarity]}55)` }}
                    />
                    {/* 内层：黑色底 + 武装图标 */}
                    <div className="absolute inset-[3px] overflow-hidden" style={{ clipPath: ARMAMENT_HEXAGON_CLIP, background: 'rgba(2,6,23,0.95)' }}>
                        <img src={def.icon} alt={def.name} className="w-full h-full object-cover" draggable={false} />
                    </div>
                </>
            ) : capRarity && capColor ? (
                // [2026-09-07 程拍板] 空槽：品质色斜向渐变描边环（左上浓→右下透）+ 深玻璃内底 + 左上品晕，无文字
                <>
                    <div className="absolute inset-0" style={{ clipPath: ARMAMENT_HEXAGON_CLIP, background: capSlotGradient(capColor), filter: `drop-shadow(0 0 8px ${capColor}4d)` }} />
                    <div className="absolute inset-[3px]" style={{ clipPath: ARMAMENT_HEXAGON_CLIP, background: 'rgba(2,6,23,0.9)' }} />
                    <div className="absolute inset-[3px]" style={{ clipPath: ARMAMENT_HEXAGON_CLIP, background: capSlotGlow(capColor) }} />
                </>
            ) : (
                // 旧空槽兜底（未传 capRarity 时保留白色描边 + 深色空底）
                <>
                    <div className="absolute inset-0" style={{ clipPath: ARMAMENT_HEXAGON_CLIP, background: 'rgba(255,255,255,0.35)', filter: 'drop-shadow(0 0 6px rgba(255,255,255,0.25))' }} />
                    <div className="absolute inset-[3px]" style={{ clipPath: ARMAMENT_HEXAGON_CLIP, background: 'rgba(2,6,23,0.9)' }} />
                </>
            )}
        </div>
    );
};

/** 3 个武装槽竖排：总高（含间隔）= totalHeight，槽高自动均分；values 传入实际配置（显示武装图标）；
 *  [2026-08-15] unlockSlots 传已解锁槽位数，未解锁槽显示锁图标（对齐武装界面）
 *  [2026-09-07] caps 传每槽可装备品质上限 → 空槽填对应品质色（重修升档后实时变化） */
export const ArmamentSlots: React.FC<{ totalHeight: number; gap?: number; values?: (string | null)[]; unlockSlots?: number; caps?: ArmamentRarity[] }> = ({ totalHeight, gap = 10, values, unlockSlots = 3, caps }) => {
    const slotHeight = (totalHeight - gap * 2) / 3;
    return (
        <div className="flex flex-col" style={{ gap }}>
            {[0, 1, 2].map(i => <ArmamentSlot key={i} height={slotHeight} equipId={values?.[i] ?? null} locked={i >= unlockSlots} capRarity={i >= unlockSlots ? undefined : caps?.[i]} />)}
        </div>
    );
};

/** 手牌样式 + 右侧武装槽组合（3 槽总高 = 手牌高度，各界面共用：总览/初始牌组/武装）
 *  [2026-08-14] 自动读取该天启者武装配置：槽位显示实际配置武装图标 + 手牌数值反映武装效果 */
export const HandWithArmament: React.FC<{ heroKey: string; scale?: number; noLabels?: boolean; gap?: number }> = ({ heroKey, scale = 1, noLabels, gap = 10 }) => {
    const { getArmament, getQualityTier } = useArmamentConfig(); // [2026-09-07] 每槽品质档
    // [2026-08-15] 槽位解锁随天启者等级（对齐武装界面，未解锁槽显示锁图标）
    const heroProgression = useHeroProgression();
    const heroBonus = getHeroLevelBonus(heroProgression.getHeroLevel(heroKey));
    const unlockSlots = heroBonus.armamentSlots;
    // [2026-08-28 莉莉子 修复] 只取已解锁槽位武装（手牌数值不反映等级降低后的残留武装）
    const values = getArmament(heroKey, heroProgression.getHeroLevel(heroKey));
    // [2026-09-07 重修申请] 每槽品质上限 → 空槽显示对应品质色
    const handTiers = getQualityTier(heroKey);
    const handCaps = useMemo<ArmamentRarity[]>(
        () => [0, 1, 2].map(i => combineArmamentRarity(heroBonus.armamentRarity, handTiers[i] ?? 0)),
        [heroBonus.armamentRarity, handTiers],
    );
    return (
        <div className="flex items-center" style={{ gap: ARMAMENT_UI.handGroupGap }}>
            <HeroHandContent heroKey={heroKey} scale={scale} noLabels={noLabels} equipIds={values.filter((v): v is string => !!v)} />
            <ArmamentSlots totalHeight={HAND_CARD_HEIGHT * scale} gap={gap} values={values} unlockSlots={unlockSlots} caps={handCaps} />
        </div>
    );
};

// [2026-08-14] 自定义拖拽状态：拿起图标跟手 + 距离阈值（近=弹回 / 远=卸载或配置）
interface ArmDragState { type: 'slot' | 'lib'; id: string; fromSlot: number; startX: number; startY: number; x: number; y: number; }
const isPointInRect = (x: number, y: number, r: DOMRect) => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;

/** 武装界面：手牌样式 + 3 个武装槽（放大，对齐其他界面尺寸）+ 右侧抽屉武装库
 *  槽位右侧更换按钮 → 屏幕右侧滑出抽屉收纳武装；点击或拖拽配置；每个最多持有 3 个，用完变灰 X0
 *  普通玩家：仅武装可选；开发者：全部装备+武装可选（持有所有装备和武装各 3）
 */
export const ArmamentContent: React.FC<{ heroKey: string; userSystem?: any }> = ({ heroKey, userSystem }) => {
    const { config, getArmament, setArmamentSlot, getQualityTier } = useArmamentConfig(); // [2026-09-07] config：数量库存全局占用计算
    const isDev = userSystem?.userId === 'dev_full_admin'; // [2026-08-14] 开发者账号独有：全装备可装
    const [activeSlot, setActiveSlot] = useState<number | null>(null); // 正在更换的槽（null=收起抽屉）
    const [dragOverSlot, setDragOverSlot] = useState<number | null>(null); // [2026-08-14] 正在拖入的槽（白框反馈）
    // [2026-09-26 莉莉子] 武装库筛选 + 排序状态
    const [armSearch, setArmSearch] = useState('');
    const [armSortMode, setArmSortMode] = useState<ArmSortMode>('usable');
    const [armSortDir, setArmSortDir] = useState<'asc' | 'desc'>('asc');
    const [isArmSortOpen, setIsArmSortOpen] = useState(false);
    const [isArmFilterOpen, setIsArmFilterOpen] = useState(false);
    const [onlyEquippable, setOnlyEquippable] = useState(true); // 槽位智能默认：只看能装进当前槽的
    const [armRarities, setArmRarities] = useState<string[]>([]);
    // [2026-08-14 武装] 槽位数量随等级解锁；[2026-09-07] 可装备品质改为每槽独立上限（等级基础 ≤稀有 + 重修额外档）
    const heroProgression = useHeroProgression();
    const heroBonus = getHeroLevelBonus(heroProgression.getHeroLevel(heroKey));
    const unlockSlots = heroBonus.armamentSlots; // 已解锁槽位数（默认 1）
    const tiers = getQualityTier(heroKey);
    const capRarities = useMemo<ArmamentRarity[]>(
        () => [0, 1, 2].map(i => combineArmamentRarity(heroBonus.armamentRarity, tiers[i] ?? 0)),
        [heroBonus.armamentRarity, tiers],
    );
    const slotCap = (i: number): ArmamentRarity => capRarities[Math.max(0, Math.min(2, i))];
    const slots = getArmament(heroKey); // 全量 3 槽（槽位渲染用：未解锁槽画锁）
    // [2026-08-28 莉莉子 修复] 生效武装只算已解锁槽（未解锁槽残留不占库存/不进手牌）
    const activeSlots = slots.slice(0, unlockSlots);
    // refs：供 useEffect(空依赖) 的 onMove 读取最新解锁状态（等级变化实时生效）
    const unlockSlotsRef = useRef(unlockSlots); unlockSlotsRef.current = unlockSlots;
    // [2026-08-28 莉莉子 修复] 等级降低 → 武装格重新封上：自动卸载封上槽里的武装（配置干净，重新升级后是空槽）
    const slotsRef = useRef(slots); slotsRef.current = slots;
    useEffect(() => {
        slotsRef.current.forEach((id, i) => {
            if (id && i >= unlockSlots) setArmamentSlot(heroKey, i, null);
        });
    }, [unlockSlots, heroKey]); // 只在解锁槽位数/英雄变化时清理一次

    // [2026-08-14] 自定义拖拽：拿起图标跟手 + 距离阈值（近=弹回 / 远=卸载或配置）
    const DRAG_THRESHOLD = 40; // px
    const slotRefs = useRef<(HTMLDivElement | null)[]>([]);
    const dragRef = useRef<ArmDragState | null>(null);
    const [drag, setDrag] = useState<ArmDragState | null>(null);
    const beginDrag = (type: 'slot' | 'lib', id: string, fromSlot: number, x: number, y: number) => {
        dragRef.current = { type, id, fromSlot, startX: x, startY: y, x, y };
        setDrag(dragRef.current);
    };
    // 拖拽结束处理（经 ref 取最新，window 监听只挂一次）
    const handleDragUpRef = useRef<(e: PointerEvent) => void>(() => {});
    handleDragUpRef.current = (e: PointerEvent) => {
        const cur = dragRef.current;
        if (!cur) return;
        const dist = Math.hypot(e.clientX - cur.startX, e.clientY - cur.startY);
        setDragOverSlot(null);
        if (dist >= DRAG_THRESHOLD) {
            const hitIdx = slotRefs.current.findIndex((el, i) => el && i !== cur.fromSlot && isPointInRect(e.clientX, e.clientY, el.getBoundingClientRect()));
            if (hitIdx >= 0) {
                if (hitIdx >= unlockSlots) { /* [2026-08-14] 未解锁槽：弹回不装备 */ }
                else {
                    const hitDef = getEquipmentById(cur.id);
                    const isMove = cur.type === 'slot';
                    // [2026-08-26 莉莉子] 槽→槽=移动（不占新数量）；库→槽=新装（需品质解锁且有库存）
                    // [2026-09-07 重修申请] 品质上限按槽独立：移动也校验目标槽上限（高品质武装移到低上限槽弹回）
                    const ok = isMove
                        ? RARITY_RANK[hitDef!.rarity] <= RARITY_RANK[slotCap(hitIdx)]
                        : (hitDef && isEquippable(hitDef, hitIdx));
                    if (ok && hitDef) {
                        setArmamentSlot(heroKey, hitIdx, cur.id);
                        if (isMove) setArmamentSlot(heroKey, cur.fromSlot, null); // 槽位拖到另一槽 = 移动
                    }
                }
            } else if (cur.type === 'slot') {
                // 槽位拖出且未落到其他槽 → 卸载（装备自动回武器库）
                setArmamentSlot(heroKey, cur.fromSlot, null);
            }
            // lib 拖出未命中 → 取消（不配置不扣数量）
        }
        dragRef.current = null;
        setDrag(null);
    };
    useEffect(() => {
        const onMove = (e: PointerEvent) => {
            const cur = dragRef.current;
            if (!cur) return;
            dragRef.current = { ...cur, x: e.clientX, y: e.clientY };
            setDrag(dragRef.current);
            const hit = slotRefs.current.findIndex((el, i) => el && i !== (dragRef.current?.fromSlot ?? -1) && isPointInRect(e.clientX, e.clientY, el.getBoundingClientRect()));
            setDragOverSlot(hit >= 0 && hit < unlockSlotsRef.current ? hit : null);
        };
        const onUp = (e: PointerEvent) => handleDragUpRef.current(e);
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        return () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); };
    }, []);

    // 武装界面手牌 scale 1.9 → 槽总高 = 手牌高度 202×1.9（对齐其他界面）；倍数与手牌共用 ARMAMENT_UI.handScale
    // 🎛️ 想**单独**调槽大小 ⇒ 拨 `ARMAMENT_UI.slotScale`（1 = 原样）；动 `handScale` 会把右边手牌一起放大。
    //     `itemMinHeight` 是**哨兵**（0 = 不介入）⇒ 先过 Number() 拓宽，否则程一填数字就报 TS2367。
    const slotScale = Number(ARMAMENT_UI.slotScale);
    const itemMinHeight = Number(ARMAMENT_UI.itemMinHeight);
    const slotH = ((HAND_CARD_HEIGHT * ARMAMENT_UI.handScale - ARMAMENT_MAX_STOCK) / 3) * slotScale;

    // 可选列表：开发者=全部装备+武装；普通玩家=库存>0 的武装（[2026-09-07] 数量库存）
    const armStockMap = readArmStock(userSystem?.settings as any);
    const options = useMemo(() => {
        if (isDev) return EQUIPMENT_DEFS;
        return getArmamentDefs().filter(def => (armStockMap[def.id] ?? 0) > 0);
    }, [isDev, armStockMap]);

    // [2026-09-07 数量库存] 可用数量 = 库存份数 − 全局已占用槽位份数（库存共享：可跨英雄分装）
    const stockOf = (def: EquipmentDef) => {
        if (!def.isArmament && !isDev) return 0;
        // [2026-09-25 莉莉子 武装不叠加] 同一天启者内不允许重复武装：已在本英雄任一槽 → 不可再装。
        //   原「同一天启者可三槽各放 1 个相同武装」作废（战斗构建对同名武装硬去重，多装纯浪费库存）；
        //   不同天启者之间仍可各带一份（一局只上一个英雄，不存在叠加问题）。原碳原子板特判并入本规则。
        if ((activeSlots ?? []).includes(def.id)) return 0;
        // [2026-09-08 修复] 占用跨全英雄统计；消耗品/普通都尊重真实库存——
        //  开发者普通武装库存为 0 时给 3 份便于白嫖测试；但消耗品一律看真实库存（福利领 6 就该显示 ×6，不被开发者上限盖掉）
        //
        // 🔴 [2026-10-05 莉莉子 BUG修复] **占用只统计「已解锁槽」** ——
        //   病根：原先遍历每个英雄的**全部 3 个槽**（含未解锁），而"生效"判定用的是
        //   `activeSlots = slots.slice(0, unlockSlots)`（只含已解锁槽）⇒ **两套口径不一致**：
        //   未解锁槽里的**历史残留**会**虚占库存** ⇒ 玩家"明明还有份数，却显示装不了"
        //   （典型场景：某英雄还低等级时留下的残留，此后一直占着别人的份数）。
        //   ⚠️ 每个英雄的解锁槽数**各不相同**（Lv1 / Lv9 / Lv18 → 1 / 2 / 3 槽，
        //      见 heroProgression 的等级里程碑），必须按**各自的等级**算，不能用同一个 n。
        //   📌 与「未解锁槽的残留不生效」同一条口径（见 useArmamentConfig.getArmament 的注释）。
        let occupied = 0;
        for (const [hk, arr] of Object.entries(config ?? {})) {
            const n = Math.max(1, getHeroLevelBonus(heroProgression.getHeroLevel(hk)).armamentSlots);
            for (let i = 0; i < n; i++) if (arr?.[i] === def.id) occupied++;
        }
        const have = armStockMap[def.id] ?? 0;
        const base = isDev && !def.consumable && have === 0 ? 3 : have;
        return Math.max(0, base - occupied);
    };
    // [2026-08-26 莉莉子] 可装备判断：某武装能否装进第 slotIdx 个槽（[2026-09-07] 品质上限按槽独立 + 数量）
    const isEquippable = (def: EquipmentDef, slotIdx: number) => {
        if (slotIdx < 0 || slotIdx >= unlockSlots) return false;
        if (RARITY_RANK[def.rarity] > RARITY_RANK[slotCap(slotIdx)]) return false; // 目标槽品质上限不足
        return stockOf(def) > 0;
    };

    // =====================================
    // [2026-09-26 莉莉子] 武装库可见列表：筛选（搜索 / 可用性 / 品质）+ 排序
    //   规模只有 20~30 项，重算成本可忽略；故不为此维护 isEquippable / stockOf 的 useCallback 依赖链
    // =====================================
    const armTargetSlot = activeSlot ?? 0;
    const armVisible = useMemo(() => {
        const kw = armSearch.trim().toLowerCase();
        const list = options.filter(def => {
            if (kw && !`${def.name} ${def.description}`.toLowerCase().includes(kw)) return false;
            if (onlyEquippable && !isEquippable(def, armTargetSlot)) return false; // 槽位智能默认
            if (armRarities.length > 0 && !armRarities.includes(def.rarity)) return false;
            return true;
        });
        const usableRank = (def: EquipmentDef) => (isEquippable(def, armTargetSlot) ? 0 : 1);
        return [...list].sort((a, b) => {
            let cmp = 0;
            switch (armSortMode) {
                // 可用优先：先按「能不能装」，同档内再按品质从高到低 —— 省掉玩家自己挑的功夫
                case 'usable': cmp = usableRank(a) - usableRank(b) || RARITY_RANK[b.rarity] - RARITY_RANK[a.rarity]; break;
                case 'rarity': cmp = RARITY_RANK[a.rarity] - RARITY_RANK[b.rarity]; break;
                case 'stock': cmp = stockOf(a) - stockOf(b); break;
                case 'name': cmp = a.name.localeCompare(b.name, 'zh'); break;
                default: cmp = options.indexOf(a) - options.indexOf(b); break;
            }
            return armSortDir === 'desc' ? -cmp : cmp;
        });
    }, [options, armSearch, onlyEquippable, armRarities, armSortMode, armSortDir, armTargetSlot, isEquippable, stockOf]);

    // 当前槽「能装」的数量（头部计数标签用）
    const armUsableCount = useMemo(
        () => options.filter(def => isEquippable(def, armTargetSlot)).length,
        [options, armTargetSlot, isEquippable],
    );
    // 只有用户主动加的条件才算「筛选激活」（onlyEquippable 是默认态，不计入）
    const isArmFilterActive = armSearch !== '' || armRarities.length > 0;
    const resetArmFilters = () => {
        setArmSearch('');
        setArmRarities([]);
        setOnlyEquippable(true); // 回到槽位智能默认
    };

    const handleChoose = (id: string) => {
        if (activeSlot === null) return;
        const def = getEquipmentById(id);
        if (def && !isEquippable(def, activeSlot)) return; // 目标槽品质上限不足或无库存不可配
        setArmamentSlot(heroKey, activeSlot, id);
        // [2026-08-26 莉莉子] 装备后不关闭武装库抽屉，方便继续选择其他武装
    };

    return (
        <div className="relative flex h-full w-full">
            {/* 左侧：手牌 + 槽（抽屉展开时 margin-right 让位，手牌被往左挤） */}
            <div
                className="flex-1 min-w-0 flex items-center justify-center transition-[margin] duration-300"
                style={{ gap: ARMAMENT_UI.leftGap, marginRight: activeSlot !== null ? ARMAMENT_UI.drawerWidth : 0 }}
            >
                {/* [2026-08-28 莉莉子 修复] 手牌只反映已解锁槽位武装 */}
                <HeroHandContent heroKey={heroKey} scale={ARMAMENT_UI.handScale} noLabels equipIds={activeSlots.filter((v): v is string => !!v)} />
                {/* 3 个武装槽（放大到与手牌同高对齐） */}
                <div className="flex flex-col" style={{ gap: ARMAMENT_UI.slotColGap }}>
                {[0, 1, 2].map(i => {
                    const locked = i >= unlockSlots; // [2026-08-14] 未达等级未解锁（所有账号按等级）
                    const slotId = slots[i] ?? null;
                    const def = slotId ? getEquipmentById(slotId) : undefined;
                    // [2026-09-07 重修申请] 空槽底色 = 该槽可装备品质上限色（等级基础 + 重修档）；已装 = 武装自身品质色
                    const capColor = EQUIP_RARITY_COLOR[slotCap(i)] ?? '#22c55e';
                    const rColor = def ? EQUIP_RARITY_COLOR[def.rarity] : capColor;
                    return (
                        <div key={i} className="flex items-center" style={{ gap: ARMAMENT_UI.slotRowGap }}>
                            {/* 六边形槽：已解锁=显示配置/空槽可拖放；未解锁=灰色锁（拖上去弹回） */}
                            <div
                                ref={el => { slotRefs.current[i] = el; }}
                                className="relative shrink-0 transition-[filter]"
                                style={{ width: slotH * ARMAMENT_UI.slotWidthRatio, height: slotH }}
                                /* [2026-09-10 莉莉子 修复] 只在「无自定义大卡」时留原生提示：锁定槽/空槽保留操作提示，
                                   已装槽（def 有值）里层 img 挂了 bindArmamentGaze → 摘掉 title 防双弹 */
                                title={locked ? '需要更高天启者等级解锁（在等级界面升级）' : def ? undefined : '拖拽武装到此处配置'}
                            >
                                {locked ? (
                                    <>
                                        <div className="absolute inset-0" style={{ clipPath: ARMAMENT_HEXAGON_CLIP, background: 'rgba(255,255,255,0.18)', filter: 'drop-shadow(0 0 6px rgba(255,255,255,0.15))' }} />
                                        <div className="absolute inset-[3px] flex items-center justify-center" style={{ clipPath: ARMAMENT_HEXAGON_CLIP, background: '#0f172a' }}>
                                            <Lock size={slotH * 0.3} className="text-gray-500" />
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        {/* 拖入时槽位边框变白；空槽=品质上限色斜向渐变（重修升档实时变色）；已装=武装品质色 */}
                                        <div className="absolute inset-0" style={{ clipPath: ARMAMENT_HEXAGON_CLIP, background: dragOverSlot === i ? '#ffffff' : (def ? rColor : capSlotGradient(capColor)), filter: `drop-shadow(0 0 10px ${dragOverSlot === i ? 'rgba(255,255,255,0.85)' : ((def ? rColor : capColor) + '4d')})` }} />
                                        <div className="absolute inset-[3px] overflow-hidden" style={{ clipPath: ARMAMENT_HEXAGON_CLIP, background: def ? '#020617' : 'rgba(2,6,23,0.9)' }}>
                                            {def ? (
                                                <img
                                                    src={def.icon}
                                                    alt={def.name}
                                                    className="w-full h-full object-cover cursor-grab active:cursor-grabbing"
                                                    onPointerDown={e => { e.stopPropagation(); e.preventDefault(); eventBus.emit(GameEvents.UI_CLICK); beginDrag('slot', slotId!, i, e.clientX, e.clientY); }}
                                                    /* [2026-09-10 莉莉子 修复] 摘掉「拿起拖出可卸载」原生提示（与武装大卡双弹）；
                                                       旁边的红色减号卸载按钮本就带同样文案的 title，信息不丢 */
                                                    {...bindArmamentGaze(slotId!)}
                                                />
                                            ) : (
                                                <div className="absolute inset-0" style={{ background: capSlotGlow(capColor) }} />
                                            )}
                                        </div>
                                    </>
                                )}
                            </div>
                            {/* 更换 + 卸载按钮（锁定槽不显示） */}
                            {!locked && (
                            <div className="flex flex-col" style={{ gap: ARMAMENT_UI.btnColGap }}>
                                <button
                                    onClick={() => { eventBus.emit(GameEvents.UI_CLICK); setActiveSlot(activeSlot === i ? null : i); }}
                                    className={`transition-all ${activeSlot === i ? 'bg-purple-600 text-white border-purple-400' : 'bg-slate-800/80 text-gray-300 border-white/10 hover:bg-slate-700'}`}
                                    style={{ padding: ARMAMENT_UI.btnPad, borderRadius: ARMAMENT_UI.btnRadius, borderWidth: ARMAMENT_UI.btnBorderWidth, borderStyle: 'solid' }}
                                    title={slotId ? '更换武装' : '配置武装'}
                                >
                                    <RefreshCw size={ARMAMENT_UI.btnIconSize} />
                                </button>
                                {/* 红色减号：快速卸载（装备自动回武器库） */}
                                <button
                                    onClick={() => { eventBus.emit(GameEvents.UI_CLICK); setArmamentSlot(heroKey, i, null); }}
                                    disabled={!slotId}
                                    className="border-red-500/30 bg-red-600/20 text-red-400 hover:bg-red-600 hover:text-white transition-all disabled:opacity-25 disabled:cursor-not-allowed"
                                    style={{ padding: ARMAMENT_UI.btnPad, borderRadius: ARMAMENT_UI.btnRadius, borderWidth: ARMAMENT_UI.btnBorderWidth, borderStyle: 'solid' }}
                                    title={slotId ? '卸载武装（自动回武器库）' : '空槽'}
                                >
                                    <Minus size={ARMAMENT_UI.btnIconSize} />
                                </button>
                            </div>
                            )}
                        </div>
                    );
                })}
            </div>
            </div>

            {/* 右侧武装抽屉：fixed 画面右缘全高（无上方留空），从右向左撑开；左边缘收起按钮 */}
            <AnimatePresence>
                {activeSlot !== null && (
                    <motion.div
                        initial={{ width: 0, opacity: 0 }}
                        animate={{ width: ARMAMENT_UI.drawerWidth, opacity: 1 }}
                        exit={{ width: 0, opacity: 0 }}
                        transition={{ type: 'spring', stiffness: 320, damping: 32 }}
                        className="fixed right-0 top-0 bottom-0 z-[610] overflow-hidden flex flex-col"
                    >
                        <div className="h-full flex flex-col bg-slate-900/95 border-white/10"
                            style={{ width: ARMAMENT_UI.drawerWidth, borderLeftWidth: ARMAMENT_UI.drawerLeftBorderWidth, borderStyle: 'solid' }}>
                            {/* 头部（开合由抽屉外侧常驻按钮控制）+ [2026-09-26 莉莉子] 筛选排序工具条 */}
                            <div className="border-white/10 shrink-0 flex flex-col"
                                style={{
                                    paddingLeft: ARMAMENT_UI.drawerHeadPad,
                                    paddingRight: ARMAMENT_UI.drawerHeadPad,
                                    paddingTop: ARMAMENT_UI.drawerHeadPad,
                                    paddingBottom: ARMAMENT_UI.drawerHeadPadBottom,
                                    borderBottomWidth: ARMAMENT_UI.drawerHeadBorderWidth,
                                    borderStyle: 'solid',
                                    gap: ARMAMENT_UI.drawerHeadGap,
                                }}>
                                <div className="flex items-baseline justify-between shrink-0" style={{ gap: ARMAMENT_UI.titleRowGap }}>
                                    <h3 className="font-black text-white tracking-widest">{isDev ? '武装库 · 全部装备/武装' : '武装库'}</h3>
                                    {/* 计数标签：一眼看清「这个槽现在能装几个」 */}
                                    <span className="font-mono text-gray-400 shrink-0" style={{ fontSize: ARMAMENT_UI.countFontSize }}>
                                        可装 <span className="text-emerald-400 font-black">{armUsableCount}</span>/{options.length}
                                    </span>
                                </div>

                                {/* 工具条：搜索 + 筛选 + 排序 + 方向 + 清空（抽屉仅 420px 宽 → 图标化压缩） */}
                                <div className="flex items-center shrink-0" style={{ gap: ARMAMENT_UI.toolbarGap }}>
                                    <div className="relative flex-1 min-w-0">
                                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500" size={ARMAMENT_UI.searchIconSize} />
                                        <input
                                            type="text"
                                            placeholder="搜索武装..."
                                            value={armSearch}
                                            onChange={e => setArmSearch(e.target.value)}
                                            className="w-full bg-slate-800/80 text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-purple-500 transition-all"
                                            style={{
                                                paddingTop: ARMAMENT_UI.searchPadY,
                                                paddingBottom: ARMAMENT_UI.searchPadY,
                                                paddingLeft: ARMAMENT_UI.searchPadLeft,
                                                paddingRight: ARMAMENT_UI.searchPadRight,
                                                borderRadius: ARMAMENT_UI.searchRadius,
                                                fontSize: ARMAMENT_UI.searchFontSize,
                                            }}
                                        />
                                    </div>
                                    <button
                                        onClick={() => { eventBus.emit(GameEvents.UI_CLICK); setIsArmFilterOpen(o => !o); }}
                                        title="筛选"
                                        className={`transition-colors shrink-0 ${isArmFilterOpen ? 'bg-purple-600 text-white' : isArmFilterActive ? 'bg-purple-600/40 text-purple-200 hover:bg-purple-600/60' : 'bg-slate-800/80 text-gray-300 hover:bg-slate-700'}`}
                                        style={{ padding: ARMAMENT_UI.toolBtnPad, borderRadius: ARMAMENT_UI.toolBtnRadius }}
                                    >
                                        <Filter size={ARMAMENT_UI.toolIconSize} />
                                    </button>
                                    <div className="relative shrink-0">
                                        <button
                                            onClick={() => { eventBus.emit(GameEvents.UI_CLICK); setIsArmSortOpen(o => !o); }}
                                            title={`排序：${ARM_SORT_LABELS[armSortMode]}`}
                                            className={`transition-colors ${isArmSortOpen ? 'bg-purple-600 text-white' : 'bg-slate-800/80 text-gray-300 hover:bg-slate-700'}`}
                                            style={{ padding: ARMAMENT_UI.toolBtnPad, borderRadius: ARMAMENT_UI.toolBtnRadius }}
                                        >
                                            <ChevronDown size={ARMAMENT_UI.toolIconSize} className={isArmSortOpen ? 'rotate-180 transition-transform' : 'transition-transform'} />
                                        </button>
                                        <AnimatePresence>
                                            {isArmSortOpen && (
                                                <motion.div
                                                    initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
                                                    className="absolute right-0 top-full bg-slate-800 border-white/10 shadow-xl z-30 overflow-hidden"
                                                    style={{ marginTop: ARMAMENT_UI.sortMenuMarginTop, width: ARMAMENT_UI.sortMenuWidth, borderRadius: ARMAMENT_UI.sortMenuRadius, borderWidth: ARMAMENT_UI.sortMenuBorderWidth, borderStyle: 'solid' }}
                                                >
                                                    {(Object.keys(ARM_SORT_LABELS) as ArmSortMode[]).map(m => (
                                                        <button
                                                            key={m}
                                                            onClick={() => { eventBus.emit(GameEvents.UI_CLICK); setArmSortMode(m); setIsArmSortOpen(false); }}
                                                            className={`w-full text-left font-bold transition-colors ${armSortMode === m ? 'bg-purple-600/40 text-white' : 'text-gray-300 hover:bg-white/5'}`}
                                                            style={{ paddingLeft: ARMAMENT_UI.sortItemPadX, paddingRight: ARMAMENT_UI.sortItemPadX, paddingTop: ARMAMENT_UI.sortItemPadY, paddingBottom: ARMAMENT_UI.sortItemPadY, fontSize: ARMAMENT_UI.sortItemFontSize }}
                                                        >
                                                            {ARM_SORT_LABELS[m]}
                                                        </button>
                                                    ))}
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </div>
                                    <button
                                        onClick={() => { eventBus.emit(GameEvents.UI_CLICK); setArmSortDir(d => (d === 'asc' ? 'desc' : 'asc')); }}
                                        title={armSortDir === 'asc' ? '当前顺序排列，点击切换倒序' : '当前倒序排列，点击切换顺序'}
                                        className={`transition-colors shrink-0 ${armSortDir === 'desc' ? 'bg-purple-600/40 text-white' : 'bg-slate-800/80 text-gray-300 hover:bg-slate-700'}`}
                                        style={{ padding: ARMAMENT_UI.toolBtnPad, borderRadius: ARMAMENT_UI.toolBtnRadius }}
                                    >
                                        {armSortDir === 'asc' ? <ArrowUpNarrowWide size={ARMAMENT_UI.toolIconSize} /> : <ArrowDownWideNarrow size={ARMAMENT_UI.toolIconSize} />}
                                    </button>
                                    <button
                                        onClick={() => { eventBus.emit(GameEvents.UI_CLICK); resetArmFilters(); }}
                                        disabled={!isArmFilterActive}
                                        title="清空筛选"
                                        className={`transition-colors shrink-0 ${isArmFilterActive ? 'bg-red-600/20 text-red-400 hover:bg-red-600 hover:text-white' : 'bg-slate-800 text-gray-600'}`}
                                        style={{ padding: ARMAMENT_UI.toolBtnPad, borderRadius: ARMAMENT_UI.toolBtnRadius }}
                                    >
                                        <RotateCcw size={ARMAMENT_UI.toolIconSize} />
                                    </button>
                                </div>

                                {/* 筛选面板（折叠）：可用性 + 品质多选 */}
                                <AnimatePresence>
                                    {isArmFilterOpen && (
                                        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden shrink-0">
                                            <div className="flex flex-col" style={{ gap: ARMAMENT_UI.filterBlockGap, paddingTop: ARMAMENT_UI.filterPadTop }}>
                                                <div className="shrink-0">
                                                    <span className="text-gray-500 font-bold tracking-widest block" style={{ fontSize: ARMAMENT_UI.filterLabelFontSize, marginBottom: ARMAMENT_UI.filterLabelMarginBottom }}>可用性</span>
                                                    <button
                                                        onClick={() => { eventBus.emit(GameEvents.UI_CLICK); setOnlyEquippable(v => !v); }}
                                                        className={`font-bold transition-all ${onlyEquippable ? 'bg-emerald-600 text-white shadow-[0_0_10px_rgba(16,185,129,0.4)]' : 'bg-slate-800 text-gray-400 hover:bg-slate-700'}`}
                                                        style={{ paddingLeft: ARMAMENT_UI.chipPadX, paddingRight: ARMAMENT_UI.chipPadX, paddingTop: ARMAMENT_UI.chipPadY, paddingBottom: ARMAMENT_UI.chipPadY, borderRadius: ARMAMENT_UI.chipRadius, fontSize: ARMAMENT_UI.chipFontSize }}
                                                    >
                                                        只看能装入此槽
                                                    </button>
                                                </div>
                                                <div className="shrink-0">
                                                    <span className="text-gray-500 font-bold tracking-widest block" style={{ fontSize: ARMAMENT_UI.filterLabelFontSize, marginBottom: ARMAMENT_UI.filterLabelMarginBottom }}>品质</span>
                                                    <div className="flex flex-wrap" style={{ gap: ARMAMENT_UI.rarityGap }}>
                                                        {ARM_RARITY_ORDER.map(r => {
                                                            const on = armRarities.includes(r);
                                                            const c = EQUIP_RARITY_COLOR[r];
                                                            return (
                                                                <button
                                                                    key={r}
                                                                    onClick={() => { eventBus.emit(GameEvents.UI_CLICK); setArmRarities(p => on ? p.filter(x => x !== r) : [...p, r]); }}
                                                                    style={{
                                                                        ...(on ? { background: c, borderColor: c, color: '#0f172a' } : { color: c, borderColor: 'transparent' }),
                                                                        paddingLeft: ARMAMENT_UI.chipPadX,
                                                                        paddingRight: ARMAMENT_UI.chipPadX,
                                                                        paddingTop: ARMAMENT_UI.chipPadY,
                                                                        paddingBottom: ARMAMENT_UI.chipPadY,
                                                                        borderRadius: ARMAMENT_UI.chipRadius,
                                                                        fontSize: ARMAMENT_UI.chipFontSize,
                                                                        borderWidth: ARMAMENT_UI.chipBorderWidth,
                                                                        borderStyle: 'solid',
                                                                    }}
                                                                    className={`font-bold transition-all ${on ? '' : 'bg-slate-800 hover:bg-slate-700'}`}
                                                                >
                                                                    {RARITY_LABEL[r]}
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>

                                {/* [2026-09-26 莉莉子] 槽位智能默认的常驻提示
                                    筛选面板默认折叠，若不提示，玩家会以为「武装不见了」而不知道是哪个开关在过滤 */}
                                {onlyEquippable && (
                                    <div className="flex items-center justify-between shrink-0" style={{ gap: ARMAMENT_UI.hintGap, fontSize: ARMAMENT_UI.hintFontSize }}>
                                        <span className="text-emerald-400/80 font-bold">仅显示可装入此槽</span>
                                        <button
                                            onClick={() => { eventBus.emit(GameEvents.UI_CLICK); setOnlyEquippable(false); }}
                                            className="text-gray-400 hover:text-white underline underline-offset-2 transition-colors"
                                        >
                                            显示全部
                                        </button>
                                    </div>
                                )}
                            </div>
                            {/* 列表（六边形图标 + X数量 + 名称描述 + 品质描述） */}
                            <div className="flex-1 overflow-y-auto flex flex-col [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
                                style={{ padding: ARMAMENT_UI.listPad, gap: ARMAMENT_UI.listGap }}>
                                {armVisible.length === 0 ? (
                                    // [2026-09-26 莉莉子] 空状态：筛选后无结果时给出路（design-guide checklist 要求）
                                    <div className="flex flex-col items-center justify-center text-center shrink-0"
                                        style={{ paddingTop: ARMAMENT_UI.emptyPadY, paddingBottom: ARMAMENT_UI.emptyPadY }}>
                                        <Search size={ARMAMENT_UI.emptyIconSize} className="text-gray-600" style={{ marginBottom: ARMAMENT_UI.emptyIconMarginBottom }} />
                                        <p className="text-gray-300 font-bold" style={{ fontSize: ARMAMENT_UI.emptyTitleFontSize, marginBottom: ARMAMENT_UI.emptyTitleMarginBottom }}>没有符合条件的武装</p>
                                        <p className="text-gray-500" style={{ fontSize: ARMAMENT_UI.emptyDescFontSize, marginBottom: ARMAMENT_UI.emptyDescMarginBottom }}>试试放宽筛选条件</p>
                                        {/* 一键放开所有条件（含「只看能装入此槽」）—— 槽位上限/库存导致的空列表也能立刻看到东西 */}
                                        <button
                                            onClick={() => { eventBus.emit(GameEvents.UI_CLICK); resetArmFilters(); setOnlyEquippable(false); }}
                                            className="bg-slate-700 hover:bg-slate-600 font-bold text-gray-200 transition-colors"
                                            style={{ paddingLeft: ARMAMENT_UI.emptyBtnPadX, paddingRight: ARMAMENT_UI.emptyBtnPadX, paddingTop: ARMAMENT_UI.emptyBtnPadY, paddingBottom: ARMAMENT_UI.emptyBtnPadY, borderRadius: ARMAMENT_UI.emptyBtnRadius, fontSize: ARMAMENT_UI.emptyBtnFontSize }}
                                        >
                                            显示全部武装
                                        </button>
                                    </div>
                                ) : armVisible.map((def, idx) => {
                                    const stock = stockOf(def);
                                    // [2026-08-26 莉莉子] disabled=目标槽上限不足或无库存；数量仍按 stockOf 正常显示
                                    // [2026-09-07 重修申请] 品质上限按槽独立：以「当前选中槽」判断（抽屉由选槽打开时 activeSlot 恒有值）
                                    const disabled = !isEquippable(def, activeSlot ?? 0);
                                    // [2026-09-26 莉莉子] 「可用优先」排序下，在能装/装不下交界插一条分隔带
                                    const prevDef = idx > 0 ? armVisible[idx - 1] : null;
                                    const showUsableDivider = armSortMode === 'usable' && prevDef
                                        && isEquippable(prevDef, activeSlot ?? 0) !== isEquippable(def, activeSlot ?? 0);
                                    return (
                                        <React.Fragment key={def.id}>
                                        {showUsableDivider && (
                                            <div className="flex items-center shrink-0"
                                                style={{ gap: ARMAMENT_UI.dividerGap, paddingTop: ARMAMENT_UI.dividerPadTop, paddingBottom: ARMAMENT_UI.dividerPadBottom }}>
                                                <div className="flex-1 bg-white/10" style={{ height: ARMAMENT_UI.dividerLineHeight }} />
                                                <span className="font-bold tracking-widest text-gray-500" style={{ fontSize: ARMAMENT_UI.dividerFontSize }}>
                                                    {disabled ? '以下：装不下 / 无库存' : '以下：可装入此槽'}
                                                </span>
                                                <div className="flex-1 bg-white/10" style={{ height: ARMAMENT_UI.dividerLineHeight }} />
                                            </div>
                                        )}
                                        <button
                                            key={def.id}
                                            onClick={() => { eventBus.emit(GameEvents.UI_CLICK); handleChoose(def.id); }}
                                            disabled={disabled}
                                            className={`flex items-center w-full transition-colors text-left shrink-0 ${
                                                disabled
                                                    ? 'bg-gray-800/50 border-white/5 opacity-50 cursor-not-allowed'
                                                    : 'bg-white/5 border-white/10 hover:bg-purple-600/30'
                                            }`}
                                            style={{
                                                gap: ARMAMENT_UI.itemGap,
                                                paddingLeft: ARMAMENT_UI.itemPadX,
                                                paddingRight: ARMAMENT_UI.itemPadX,
                                                paddingTop: ARMAMENT_UI.itemPadY,
                                                paddingBottom: ARMAMENT_UI.itemPadY,
                                                borderRadius: ARMAMENT_UI.itemRadius,
                                                borderWidth: ARMAMENT_UI.itemBorderWidth,
                                                borderStyle: 'solid',
                                                // 哨兵：0 = 不介入（保持"内容撑开"的原样）⇒ 值为 0 时**一项都不加**
                                                ...(itemMinHeight > 0 ? { minHeight: itemMinHeight } : {}),
                                            }}
                                            /* [2026-09-10 莉莉子 修复] 摘掉原生 title：列表项名称/描述画面已直出、内层六边形又挂了武装大卡，
                                               原 title 的「描述 + 点击或拖拽配置」纯属重复 → hover 只剩一层检视 */
                                        >
                                            {/* 六边形图标 + 右下角数量（拖拽从六边形图标开始）；[2026-08-26] 悬停浮现武装大卡 */}
                                            <div
                                                className="relative shrink-0 cursor-grab active:cursor-grabbing"
                                                style={{ width: ARMAMENT_UI.itemIconWidth, height: ARMAMENT_UI.itemIconWidth * ARMAMENT_UI.itemIconAspect }}
                                                onPointerDown={disabled ? undefined : (e) => { e.stopPropagation(); e.preventDefault(); eventBus.emit(GameEvents.UI_CLICK); beginDrag('lib', def.id, -1, e.clientX, e.clientY); }}
                                                {...bindArmamentGaze(def.id)}
                                            >
                                                <div className="absolute inset-0" style={{ clipPath: ARMAMENT_HEXAGON_CLIP, background: disabled ? '#374151' : EQUIP_RARITY_COLOR[def.rarity] }} />
                                                <div className="absolute inset-[3px] overflow-hidden" style={{ clipPath: ARMAMENT_HEXAGON_CLIP, background: '#020617' }}>
                                                    <img src={def.icon} alt="" className="w-full h-full object-cover opacity-80" draggable={false} />
                                                </div>
                                                <span className="absolute -bottom-1 -right-0.5 font-mono font-black" style={{ fontSize: ARMAMENT_UI.stockFontSize, color: disabled ? '#6b7280' : '#facc15' }}>
                                                    X{stock}
                                                </span>
                                            </div>
                                            {/* 名称 + 描述
                                                [2026-10-16 程实测] 原来是 `truncate`（强制单行 + 省略号）
                                                ⇒ 字号一调大就被截成「…」，且**永远不换行 ⇒ 卡片永远撑不高**。
                                                改成 `break-words` 让它**正常换行**：文本多长、卡片就多高
                                                （父级 `flex-1 min-w-0` 已具备换行条件；右侧品质文字 `shrink-0` 不受影响）。 */}
                                            <span className="flex-1 min-w-0">
                                                <span className={`block font-bold break-words ${disabled ? 'text-gray-500' : 'text-white'}`} style={{ fontSize: ARMAMENT_UI.itemNameFontSize }}>{def.name}</span>
                                                <span className="block text-gray-400 break-words" style={{ fontSize: ARMAMENT_UI.itemDescFontSize }}>{def.description}</span>
                                            </span>
                                            {/* 品质描述：史诗武装 / 普通装备 */}
                                            <span className="font-mono shrink-0" style={{ fontSize: ARMAMENT_UI.itemRarityFontSize, color: disabled ? '#6b7280' : EQUIP_RARITY_COLOR[def.rarity] }}>
                                                {RARITY_LABEL[def.rarity]}{def.isArmament ? '武装' : '装备'}
                                            </span>
                                        </button>
                                        </React.Fragment>
                                    );
                                })}
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* 抽屉外侧常驻开合按钮：收起=画面右缘（点击打开）；打开=抽屉左外侧（点击收起） */}
            <button
                onClick={() => { eventBus.emit(GameEvents.UI_CLICK); setActiveSlot(activeSlot === null ? 0 : null); }}
                className="fixed top-1/2 -translate-y-1/2 z-[620] flex items-center justify-center transition-all duration-300"
                style={{
                    width: ARMAMENT_UI.handleWidth,
                    height: ARMAMENT_UI.handleHeight,
                    borderTopLeftRadius: ARMAMENT_UI.handleRadius,
                    borderBottomLeftRadius: ARMAMENT_UI.handleRadius,
                    borderWidth: ARMAMENT_UI.btnBorderWidth,
                    borderStyle: 'solid',
                    right: activeSlot === null ? 0 : ARMAMENT_UI.drawerWidth,
                    background: activeSlot === null ? 'rgba(30,27,75,0.9)' : 'rgba(30,27,75,0.95)',
                    borderColor: activeSlot === null ? 'rgba(255,255,255,0.15)' : 'rgba(168,85,247,0.4)',
                    color: activeSlot === null ? '#d1d5db' : '#e9d5ff',
                }}
                title={activeSlot === null ? '打开武装库' : '收起武装库'}
            >
                {activeSlot === null ? <ChevronsLeft size={ARMAMENT_UI.handleIconSize} /> : <ChevronsRight size={ARMAMENT_UI.handleIconSize} />}
            </button>

            {/* 拖拽跟手图标：Portal 渲染到 document.body，逃出 ScaleWrapper 缩放容器保证 1:1 跟手（同卡牌 DragGhostCard）；DRAG_ICON_OFFSET 仅调观感 */}
            {drag && createPortal(
                <div className="fixed z-[700] pointer-events-none select-none" style={{ left: drag.x + DRAG_ICON_OFFSET.dx, top: drag.y + DRAG_ICON_OFFSET.dy, transform: 'translate(-50%, -50%)' }}>
                    <div className="relative" style={{ width: slotH * ARMAMENT_UI.slotWidthRatio, height: slotH }}>
                        <div className="absolute inset-0" style={{ clipPath: ARMAMENT_HEXAGON_CLIP, background: EQUIP_RARITY_COLOR[getEquipmentById(drag.id)?.rarity ?? 'common'] ?? '#22c55e', filter: 'drop-shadow(0 0 14px rgba(255,255,255,0.6))' }} />
                        <div className="absolute inset-[3px] overflow-hidden" style={{ clipPath: ARMAMENT_HEXAGON_CLIP, background: '#020617' }}>
                            <img src={getEquipmentById(drag.id)?.icon} alt="" className="w-full h-full object-cover" />
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
};
