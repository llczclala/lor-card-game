// ==========================================
// 悖论迷宫 · 肉鸽主界面（大厅）
// 背景 + 左下角 4 功能入口 + 右下角前往推演 + 右上/左上返回
// ==========================================
import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, Home, User, RotateCcw } from 'lucide-react';
import { CARD_DB } from '../../data/cards';
import { CroppedAvatar } from '../CroppedAvatar'; // [2026-08-10] 大厅头像读取 avatar 裁剪配置
import { eventBus, GameEvents } from '../../utils/eventBus';
import { useHeroProgression } from '../../hooks/useHeroProgression'; // [2026-08-12 天启者养成] 等级/加成
import { HeroLevelBadge } from './HeroLevelBadge'; // [2026-08-12 天启者养成] 等级徽章 + 经验条
import rogueBg from '../../image/icon/rogue_background.webp';
import rogueIcon1 from '../../image/icon/rogue_icon_1.webp';
import rogueIcon2 from '../../image/icon/rogue_icon_2.webp';
import rogueIcon3 from '../../image/icon/rogue_icon_3.webp';
import rogueStar from '../../image/icon/rogue_star.webp';

// ══════════════════════════════════════════════════════════════════════
// 🎛️ 肉鸽大厅（`RogueLobby`）· 视觉调参区（**程微调就改这里**）
// ──────────────────────────────────────────────────────────────────────
// 这一屏 = 模式选择点「悖论迷宫」进来、再去推演 / 任务 / 评估 / 图鉴的那一屏。
// 管：① 右上角（返回大厅 + 返回模式选择）② 左下角（天启者信息框 + 三个功能入口）
//     ③ 中下方占位提示条 ④ 右下角（结算/继续 + 前往推演）
// 改完存盘即生效（HMR —— 雷电/电脑上 1~3 秒看到，不用出包）。
// 命名与用法**对齐 `TITLE_UI`**：值是**绝对画布 px**、直接进 style；注释标注**原 Tailwind 类**。
//
// 📌 2026-10-16 本次改动顺带**收编了三个旧常量** —— 它们存的是 Tailwind **类名**（`'w-16 h-16'`），
//    违反本手册硬规矩 1「值是绝对 px、不要把类名塞进常量」：
//      · `ICON_BUTTON.circle` / `.icon` → `funcCircleSize` / `funcIconSize`（都是原 `w-16 h-16` = 64）
//      · `START_BUTTON = 'w-60 h-32'`   → `startBtnWidth` / `startBtnHeight`（240 × 128）
//      · `HERO_BOX.avatar` / `.recycle` → `heroAvatarSize`（64）/ `heroRecycleSize`（24）
//    ⇒ **值一个都没变**，只是从"类名"换成了"数字"；旧的三个常量名已在本文件内消失（它们是局部常量、未导出）。
//
// ⚠️ 中间那个「悖论迷宫」大 logo（圆环 + 三角 + 橙色括角）**不在本组件里** —— 它是**烤在
//    `image/icon/rogue_background.webp` 这张图里**的（已看图确认）⇒ **没有旋钮能调它**，只能换图。
// ⚠️ 天启者信息框里那个等级徽章（`HeroLevelBadge size="md"`）的**内部尺寸不在本文件** ⇒ 本调参区管不到。
// ══════════════════════════════════════════════════════════════════════
export const ROGUE_LOBBY_UI = {
    /**
     * 【主旋钮】四角控件（右上按钮组 / 左下信息框+功能入口 / 右下前往推演）的**整体缩放**（1 = 原样）。
     *
     * 用途：觉得"按钮都偏小 / 偏大"时拨这一个数 —— **别**逐项去凑。
     * ⚠️ 它**只缩三组角落控件**：背景图、中间那个 logo、占位提示条**都不跟着变**
     *    （提示条是屏幕居中的，且它自带 `-translate-x-1/2`，内联 transform 会把那个位移顶掉 ⇒ 故不并入）。
     * ⚠️ 每组的 `transform-origin` 都钉在**自己那一角**（右上→`top right` 等）
     *    ⇒ 放大时**朝屏幕内侧长**，不会跑到屏幕外，也**不需要**补 margin。
     *    这三组本来就有 `z-index`（已是层叠上下文）⇒ 加 transform **不会**改变层级。
     * 📐 上限（**算出来的**）：右下「前往推演」到屏幕底/右各 32，图高 128；左下那排控件高约 96。
     *    取最紧的一处 —— 顶到屏幕边之前 `s` 可以到约 **2.0 以上**，
     *    但更要防的是**三组控件互相撞上**（左下那排横着长约 420、右下约 240，画布宽 1680）
     *    ⇒ **实用区间大致 1.0 ~ 1.6**，再大多半会挤到一起。
     */
    uiScale: 1,

    // ══ ① 右上角：返回大厅 + 返回模式选择 ═══════════════════════════════
    /** 按钮组距顶 px（原 top-8 = 32） */
    backGroupTop: 32,
    /** 按钮组距右 px（原 right-8 = 32） */
    backGroupRight: 32,
    /** 两个按钮之间间距 px（原 gap-3 = 12） */
    backGroupGap: 12,
    /** 按钮内边距 px（原 p-3 = 12） */
    backBtnPad: 12,
    /** 按钮图标 px（原 `<Home size={24} />` / `<ArrowLeft size={24} />`） */
    backIconSize: 24,

    // ══ ② 左下角：天启者信息框 + 三个功能入口 ═══════════════════════════
    /** 整组距左 px（原 left-8 = 32） */
    bottomGroupLeft: 32,
    /** 整组距底 px（原 bottom-8 = 32） */
    bottomGroupBottom: 32,
    /** 信息框 ↔ 功能入口行 之间间距 px（原 gap-5 = 20） */
    bottomGroupGap: 20,

    // ②-1 天启者信息框（原 `HERO_BOX`）
    /** 方框内边距 px（原 p-3 = 12） */
    heroBoxPad: 12,
    /** 方框圆角 px（原 rounded-xl = 12） */
    heroBoxRadius: 12,
    /** 头像 ↔ 等级徽章 之间间距 px（原 gap-2 = 8） */
    heroBoxGap: 8,
    /** 头像尺寸 px（原 `HERO_BOX.avatar` = w-16 h-16 = 64） */
    heroAvatarSize: 64,
    /** 头像右下「换人」小圆钮尺寸 px（原 `HERO_BOX.recycle` = w-6 h-6 = 24） */
    heroRecycleSize: 24,
    /** 小圆钮**向外**探出的距离 px（原 `-bottom-1 -right-1` = 4） */
    heroRecycleOffset: 4,
    /** 小圆钮里的箭头图标 px（原 `<RotateCcw size={12} />`） */
    heroRecycleIconSize: 12,
    /** 未选天启者时的占位人形图标 px（原 `<User size={26} />`） */
    heroEmptyIconSize: 26,

    // ②-2 功能入口（推演任务 / 评估嘉勉 / 逻辑研习，横排一行）
    /** 三个功能按钮之间间距 px（原 gap-5 = 20） */
    funcRowGap: 20,
    /** 单个功能按钮内「圆底 ↔ 文字」纵向间距 px（原 gap-1.5 = 6） */
    funcBtnGap: 6,
    /** 圆形底尺寸 px（原 `ICON_BUTTON.circle` = w-16 h-16 = 64） */
    funcCircleSize: 64,
    /** 圆内图标尺寸 px（原 `ICON_BUTTON.icon` = w-16 h-16 = 64） */
    funcIconSize: 64,
    /** 「推演任务」待领黄点尺寸 px（原 w-4 h-4 = 16） */
    funcDotSize: 16,
    /** 黄点向上探出 px（原 `-top-1` = 4） */
    funcDotTop: 4,
    /** 黄点距右 px（原 right-0 = 0） */
    funcDotRight: 0,
    /** 黄点描边粗细 px（原 border-2） */
    funcDotBorder: 2,
    /** 功能名文字块左右内边距 px（原 px-3 = 12） */
    funcLabelPadX: 12,
    /** 功能名文字块上下内边距 px（原 py-0.5 = 2） */
    funcLabelPadY: 2,
    /** 功能名字号 px（原 text-sm = 14） */
    funcLabelFontSize: 14,

    // ══ ③ 中下方：占位提示条（点评估嘉勉等未开放入口时冒的那条）═══════════
    /** 距底 px（原 bottom-24 = 96） */
    toastBottom: 96,
    /** 左右内边距 px（原 px-5 = 20） */
    toastPadX: 20,
    /** 上下内边距 px（原 py-2 = 8） */
    toastPadY: 8,
    /** 字号 px（原 text-sm = 14） */
    toastFontSize: 14,

    // ══ ④ 右下角：结算 / 继续 + 前往推演 ═══════════════════════════════
    /** 整组距右 px（原 right-8 = 32） */
    startGroupRight: 32,
    /** 整组距底 px（原 bottom-8 = 32） */
    startGroupBottom: 32,
    /** 「结算/继续」行 ↔ 前往推演 之间间距 px（原 gap-3 = 12） */
    startGroupGap: 12,
    /** 「结算」与「继续」两个按钮之间间距 px（原 gap-3 = 12） */
    settleRowGap: 12,
    /** 结算/继续按钮左右内边距 px（原 px-7 = 28） */
    settleBtnPadX: 28,
    /** 结算/继续按钮上下内边距 px（原 py-2.5 = 10） */
    settleBtnPadY: 10,
    /** 结算/继续按钮圆角 px（原 rounded-xl = 12） */
    settleBtnRadius: 12,
    /** 结算/继续按钮字号 px —— ⚠️ 原来**没有** `text-*` 类（继承基准 16）；已核全项目无 font-size 声明 ⇒ 填 16 零变化 */
    settleBtnFontSize: 16,
    /** 前往推演按钮宽 px（原 `START_BUTTON` = w-60 = 240） */
    startBtnWidth: 240,
    /** 前往推演按钮高 px（原 `START_BUTTON` = h-32 = 128） */
    startBtnHeight: 128,
} as const;

interface RogueLobbyProps {
    onBackToModeSelect: () => void;   // 右上角：返回模式选择
    onBackToLobby: () => void;        // 返回大厅（右上角返回按钮左侧）
    onSelectHero: () => void;         // 头像大按钮 / 回收小按钮：打开天启者选择界面
    onOpenMission: () => void;        // 推演任务：打开任务系统
    onOpenEvaluation: () => void;     // [2026-08-29 评估嘉勉] 打开分析员等级面板
    onOpenCodex: () => void;          // [2026-08-20] 逻辑研习：打开肉鸽图鉴
    onStartRun: () => void;           // 前往推演：开始对局
    selectedHeroKey: string | null;   // 已选天启者
    hasPendingRun?: boolean;          // [2026-08-28] 是否有未结算的肉鸽对局（前往推演置灰 + 上方显示结算/继续）
    onSettleRun?: () => void;         // [2026-08-28] 结算当前未完成对局（App 弹二次确认）
    onResumeRun?: () => void;         // [2026-08-28] 继续上一局（恢复对局进地图）
    hasRogueClaimableReward?: boolean; // [2026-09-03 BUG修复] 是否有可领取的肉鸽任务奖励（点亮推演任务按钮黄点）
}

export const RogueLobby: React.FC<RogueLobbyProps> = ({
    onBackToModeSelect,
    onBackToLobby,
    onSelectHero,
    onOpenMission,
    onOpenEvaluation,
    onOpenCodex,
    onStartRun,
    selectedHeroKey,
    hasPendingRun = false,
    onSettleRun,
    onResumeRun,
    hasRogueClaimableReward = false,
}) => {
    const selectedHero = selectedHeroKey ? CARD_DB[selectedHeroKey] : null;
    // [2026-08-28] 有未结算对局时不能开新局（前往推演置灰）
    const canStart = !!selectedHeroKey && !hasPendingRun;
    // [2026-08-12 天启者养成] 当前英雄等级 + 加成摘要
    const heroProgression = useHeroProgression();
    const heroProgress = selectedHeroKey ? heroProgression.getHeroProgress(selectedHeroKey) : null;

    // 主旋钮先拓宽成 number 再比较（`as const` 会让它变成字面量类型 ⇒ 程一调就报 TS2367）
    const uiScale = Number(ROGUE_LOBBY_UI.uiScale);
    /** = 1 时**一项内联 transform 都不加** ⇒ 与改动前逐字节等价 */
    const uiScaleStyle = uiScale !== 1 ? { transform: `scale(${uiScale})` } : {};

    // 占位功能提示条（评估嘉勉 / 逻辑研习，暂未开放，自动消失）
    const [placeholder, setPlaceholder] = useState<string | null>(null);
    useEffect(() => {
        if (!placeholder) return;
        const t = setTimeout(() => setPlaceholder(null), 2000);
        return () => clearTimeout(t);
    }, [placeholder]);

    // 功能按钮：图片 + 黑底白字文本块
    // opts.placeholderMsg 传入则点击仅弹占位提示；opts.showDot 则右上角亮脉冲黄点（待领取提示）
    const funcBtn = (icon: string, label: string, onClick: () => void, opts?: { placeholderMsg?: string; showDot?: boolean }) => {
        const { placeholderMsg, showDot } = opts ?? {};
        return (
            <button
                onClick={() => {
                    eventBus.emit(GameEvents.UI_CLICK);
                    placeholderMsg ? setPlaceholder(placeholderMsg) : onClick();
                }}
                className="group relative flex flex-col items-center"
                style={{ gap: ROGUE_LOBBY_UI.funcBtnGap }}
            >
                {/* [2026-09-03 BUG修复] 肉鸽任务可领提示黄点（与大厅任务按钮同款脉冲） */}
                {showDot && (
                    <span
                        className="absolute z-10 bg-yellow-400 rounded-full border-yellow-200 shadow-[0_0_15px_yellow] animate-pulse"
                        style={{
                            top: -ROGUE_LOBBY_UI.funcDotTop,
                            right: ROGUE_LOBBY_UI.funcDotRight,
                            width: ROGUE_LOBBY_UI.funcDotSize,
                            height: ROGUE_LOBBY_UI.funcDotSize,
                            borderWidth: ROGUE_LOBBY_UI.funcDotBorder,
                        }}
                    />
                )}
                <div
                    className="rounded-full bg-black/50 border border-white/20 flex items-center justify-center overflow-hidden group-hover:border-purple-400/70 group-hover:scale-105 transition-all"
                    style={{ width: ROGUE_LOBBY_UI.funcCircleSize, height: ROGUE_LOBBY_UI.funcCircleSize }}
                >
                    <img
                        src={icon}
                        alt={label}
                        className="object-contain"
                        style={{ width: ROGUE_LOBBY_UI.funcIconSize, height: ROGUE_LOBBY_UI.funcIconSize }}
                        draggable={false}
                    />
                </div>
                <span
                    className="bg-black/80 rounded text-white font-medium shadow-[0_0_10px_rgba(0,0,0,0.6)]"
                    style={{
                        paddingLeft: ROGUE_LOBBY_UI.funcLabelPadX,
                        paddingRight: ROGUE_LOBBY_UI.funcLabelPadX,
                        paddingTop: ROGUE_LOBBY_UI.funcLabelPadY,
                        paddingBottom: ROGUE_LOBBY_UI.funcLabelPadY,
                        fontSize: ROGUE_LOBBY_UI.funcLabelFontSize,
                    }}
                >
                    {label}
                </span>
            </button>
        );
    };

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="w-full h-full relative overflow-hidden text-white font-sans select-none"
        >
            {/* 背景 */}
            <img src={rogueBg} className="absolute inset-0 w-full h-full object-cover" alt="悖论迷宫" draggable={false} />
            <div className="absolute inset-0 bg-black/20 pointer-events-none" />

            {/* 右上角：返回大厅 + 返回模式选择（Home 在返回按钮左侧） */}
            <div
                className="absolute z-[999] flex items-center"
                style={{
                    top: ROGUE_LOBBY_UI.backGroupTop,
                    right: ROGUE_LOBBY_UI.backGroupRight,
                    gap: ROGUE_LOBBY_UI.backGroupGap,
                    transformOrigin: 'top right',
                    ...uiScaleStyle,
                }}
            >
                <button
                    onClick={() => { eventBus.emit(GameEvents.UI_BACK); onBackToLobby(); }}
                    className="rounded-full bg-white/5 hover:bg-white/20 border border-white/10 hover:border-white/50 transition-all group"
                    style={{ padding: ROGUE_LOBBY_UI.backBtnPad }}
                    title="返回大厅"
                >
                    <Home size={ROGUE_LOBBY_UI.backIconSize} className="text-gray-300 group-hover:text-white transition-colors" />
                </button>
                <button
                    onClick={() => { eventBus.emit(GameEvents.UI_BACK); onBackToModeSelect(); }}
                    className="rounded-full bg-white/5 hover:bg-white/20 border border-white/10 hover:border-white/50 transition-all group"
                    style={{ padding: ROGUE_LOBBY_UI.backBtnPad }}
                    title="返回模式选择"
                >
                    <ArrowLeft size={ROGUE_LOBBY_UI.backIconSize} className="text-gray-300 group-hover:text-white transition-colors" />
                </button>
            </div>

            {/* 左下角：天启者信息方框 + 功能入口（横排，方框在第一个位置） */}
            <div
                className="absolute z-10 flex items-end"
                style={{
                    left: ROGUE_LOBBY_UI.bottomGroupLeft,
                    bottom: ROGUE_LOBBY_UI.bottomGroupBottom,
                    gap: ROGUE_LOBBY_UI.bottomGroupGap,
                    transformOrigin: 'bottom left',
                    ...uiScaleStyle,
                }}
            >
                {/* [2026-08-13 布局调整] 天启者信息方框：头像 + 等级 + 经验（无名字/加成效果） */}
                <div
                    className="bg-black/60 border border-white/15 backdrop-blur-sm shadow-[0_0_20px_rgba(0,0,0,0.5)] flex flex-col items-center"
                    style={{
                        padding: ROGUE_LOBBY_UI.heroBoxPad,
                        borderRadius: ROGUE_LOBBY_UI.heroBoxRadius,
                        gap: ROGUE_LOBBY_UI.heroBoxGap,
                    }}
                >
                    {/* 头像（点击换人，右下角回收小按钮） */}
                    <button
                        onClick={() => { eventBus.emit(GameEvents.UI_CLICK); onSelectHero(); }}
                        className="group relative"
                        style={{ width: ROGUE_LOBBY_UI.heroAvatarSize, height: ROGUE_LOBBY_UI.heroAvatarSize }}
                        title={selectedHero ? `已选：${selectedHero.name}` : '选择天启者'}
                    >
                        <div className="w-full h-full rounded-full overflow-hidden border-2 border-white/30 hover:border-purple-400 transition-all hover:scale-105 shadow-[0_0_20px_rgba(0,0,0,0.5)]">
                            {selectedHero ? (
                                <CroppedAvatar cardKey={selectedHeroKey!} className="w-full h-full rounded-full" />
                            ) : (
                                <div className="w-full h-full bg-black/60 flex items-center justify-center">
                                    <User size={ROGUE_LOBBY_UI.heroEmptyIconSize} className="text-gray-500" />
                                </div>
                            )}
                        </div>
                        <span
                            className="absolute rounded-full bg-slate-800 border border-white/20 flex items-center justify-center group-hover:bg-purple-700 transition-colors"
                            style={{
                                bottom: -ROGUE_LOBBY_UI.heroRecycleOffset,
                                right: -ROGUE_LOBBY_UI.heroRecycleOffset,
                                width: ROGUE_LOBBY_UI.heroRecycleSize,
                                height: ROGUE_LOBBY_UI.heroRecycleSize,
                            }}
                        >
                            <RotateCcw size={ROGUE_LOBBY_UI.heroRecycleIconSize} className="text-gray-300 group-hover:text-white" />
                        </span>
                    </button>

                    {/* 等级 + 经验（HeroLevelBadge：Lv 徽章 + 经验条 + 数字）—— ⚠️ 内部尺寸在 HeroLevelBadge.tsx，不在本调参区 */}
                    {heroProgress && (
                        <HeroLevelBadge level={heroProgress.level} exp={heroProgress.exp} expToNext={heroProgress.expToNext} size="md" />
                    )}
                </div>

                {/* 功能入口：从左到右横排一行 */}
                <div className="flex items-end" style={{ gap: ROGUE_LOBBY_UI.funcRowGap }}>
                    {funcBtn(rogueIcon1, '推演任务', onOpenMission, { showDot: hasRogueClaimableReward })}
                    {funcBtn(rogueIcon2, '评估嘉勉', onOpenEvaluation)} {/* [2026-08-29] 移除占位，接评估嘉勉面板 */}
                    {funcBtn(rogueIcon3, '逻辑研习', onOpenCodex)}
                </div>
            </div>

            {/* 占位功能提示条 */}
            {placeholder && (
                <div
                    className="absolute left-1/2 -translate-x-1/2 z-50 bg-black/80 border border-white/20 rounded-lg text-white font-mono shadow-[0_0_20px_rgba(0,0,0,0.6)] animate-fade-in"
                    style={{
                        bottom: ROGUE_LOBBY_UI.toastBottom,
                        paddingLeft: ROGUE_LOBBY_UI.toastPadX,
                        paddingRight: ROGUE_LOBBY_UI.toastPadX,
                        paddingTop: ROGUE_LOBBY_UI.toastPadY,
                        paddingBottom: ROGUE_LOBBY_UI.toastPadY,
                        fontSize: ROGUE_LOBBY_UI.toastFontSize,
                    }}
                >
                    {placeholder}
                </div>
            )}

            {/* 右下角：未结算对局的结算/继续 + 前往推演 */}
            <div
                className="absolute z-10 flex flex-col items-end"
                style={{
                    right: ROGUE_LOBBY_UI.startGroupRight,
                    bottom: ROGUE_LOBBY_UI.startGroupBottom,
                    gap: ROGUE_LOBBY_UI.startGroupGap,
                    transformOrigin: 'bottom right',
                    ...uiScaleStyle,
                }}
            >
                {hasPendingRun && (
                    <div className="flex items-center" style={{ gap: ROGUE_LOBBY_UI.settleRowGap }}>
                        <button
                            onClick={() => { eventBus.emit(GameEvents.UI_CLICK); onSettleRun?.(); }}
                            className="bg-gradient-to-r from-red-600 to-red-500 font-black tracking-widest text-white hover:scale-105 transition-all hover:shadow-[0_0_20px_rgba(239,68,68,0.5)]"
                            style={{
                                paddingLeft: ROGUE_LOBBY_UI.settleBtnPadX,
                                paddingRight: ROGUE_LOBBY_UI.settleBtnPadX,
                                paddingTop: ROGUE_LOBBY_UI.settleBtnPadY,
                                paddingBottom: ROGUE_LOBBY_UI.settleBtnPadY,
                                borderRadius: ROGUE_LOBBY_UI.settleBtnRadius,
                                fontSize: ROGUE_LOBBY_UI.settleBtnFontSize,
                            }}
                            title="结算当前未完成的肉鸽对局（获得本场经验）"
                        >
                            结算
                        </button>
                        <button
                            onClick={() => { eventBus.emit(GameEvents.UI_CLICK); onResumeRun?.(); }}
                            className="bg-gradient-to-r from-emerald-600 to-emerald-500 font-black tracking-widest text-white hover:scale-105 transition-all hover:shadow-[0_0_20px_rgba(16,185,129,0.5)]"
                            style={{
                                paddingLeft: ROGUE_LOBBY_UI.settleBtnPadX,
                                paddingRight: ROGUE_LOBBY_UI.settleBtnPadX,
                                paddingTop: ROGUE_LOBBY_UI.settleBtnPadY,
                                paddingBottom: ROGUE_LOBBY_UI.settleBtnPadY,
                                borderRadius: ROGUE_LOBBY_UI.settleBtnRadius,
                                fontSize: ROGUE_LOBBY_UI.settleBtnFontSize,
                            }}
                            title="继续上一局未结算的肉鸽对局"
                        >
                            继续
                        </button>
                    </div>
                )}
                <button
                    onClick={() => { eventBus.emit(GameEvents.UI_CLICK); onStartRun(); }}
                    disabled={!canStart}
                    className={`group transition-all ${canStart
                        ? 'hover:scale-110 hover:drop-shadow-[0_0_25px_rgba(168,85,247,0.7)] cursor-pointer'
                        : 'opacity-40 grayscale cursor-not-allowed'}`}
                    title={canStart ? '前往推演' : hasPendingRun ? '有未结算的对局，请先结算或继续' : '请先选择天启者'}
                >
                    <img
                        src={rogueStar}
                        alt="前往推演"
                        className="object-contain"
                        style={{ width: ROGUE_LOBBY_UI.startBtnWidth, height: ROGUE_LOBBY_UI.startBtnHeight }}
                        draggable={false}
                    />
                </button>
            </div>
        </motion.div>
    );
};
