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

// ==========================================
// [2026-08-07 图标缩放控制] 程可在此微调各图标按钮的显示尺寸
// ==========================================
const ICON_BUTTON = {
    circle: 'w-16 h-16', // 功能按钮圆形底尺寸（推演任务 / 评估嘉勉 / 逻辑研习）
    icon: 'w-16 h-16',     // 功能按钮图标尺寸
};
const START_BUTTON = 'w-60 h-32'; // 前往推演按钮尺寸
// [2026-08-13 布局调整] 天启者信息方框可调参数（程可在此微调）
const HERO_BOX = {
    avatar: 'w-16 h-16',   // 方框内头像尺寸
    recycle: 'w-6 h-6',    // 换人小按钮尺寸
};

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
                className="group relative flex flex-col items-center gap-1.5"
            >
                {/* [2026-09-03 BUG修复] 肉鸽任务可领提示黄点（与大厅任务按钮同款脉冲） */}
                {showDot && (
                    <span className="absolute -top-1 right-0 z-10 w-4 h-4 bg-yellow-400 rounded-full border-2 border-yellow-200 shadow-[0_0_15px_yellow] animate-pulse" />
                )}
                <div className={`${ICON_BUTTON.circle} rounded-full bg-black/50 border border-white/20 flex items-center justify-center overflow-hidden group-hover:border-purple-400/70 group-hover:scale-105 transition-all`}>
                    <img src={icon} alt={label} className={`${ICON_BUTTON.icon} object-contain`} draggable={false} />
                </div>
                <span className="bg-black/80 px-3 py-0.5 rounded text-sm text-white font-medium shadow-[0_0_10px_rgba(0,0,0,0.6)]">
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
            <div className="absolute top-8 right-8 z-[999] flex items-center gap-3">
                <button
                    onClick={() => { eventBus.emit(GameEvents.UI_BACK); onBackToLobby(); }}
                    className="p-3 rounded-full bg-white/5 hover:bg-white/20 border border-white/10 hover:border-white/50 transition-all group"
                    title="返回大厅"
                >
                    <Home size={24} className="text-gray-300 group-hover:text-white transition-colors" />
                </button>
                <button
                    onClick={() => { eventBus.emit(GameEvents.UI_BACK); onBackToModeSelect(); }}
                    className="p-3 rounded-full bg-white/5 hover:bg-white/20 border border-white/10 hover:border-white/50 transition-all group"
                    title="返回模式选择"
                >
                    <ArrowLeft size={24} className="text-gray-300 group-hover:text-white transition-colors" />
                </button>
            </div>

            {/* 左下角：天启者信息方框 + 功能入口（横排，方框在第一个位置） */}
            <div className="absolute left-8 bottom-8 z-10 flex items-end gap-5">
                {/* [2026-08-13 布局调整] 天启者信息方框：头像 + 等级 + 经验（无名字/加成效果） */}
                <div className="bg-black/60 border border-white/15 rounded-xl p-3 backdrop-blur-sm shadow-[0_0_20px_rgba(0,0,0,0.5)] flex flex-col items-center gap-2">
                    {/* 头像（点击换人，右下角回收小按钮） */}
                    <button
                        onClick={() => { eventBus.emit(GameEvents.UI_CLICK); onSelectHero(); }}
                        className={`group relative ${HERO_BOX.avatar}`}
                        title={selectedHero ? `已选：${selectedHero.name}` : '选择天启者'}
                    >
                        <div className="w-full h-full rounded-full overflow-hidden border-2 border-white/30 hover:border-purple-400 transition-all hover:scale-105 shadow-[0_0_20px_rgba(0,0,0,0.5)]">
                            {selectedHero ? (
                                <CroppedAvatar cardKey={selectedHeroKey!} className="w-full h-full rounded-full" />
                            ) : (
                                <div className="w-full h-full bg-black/60 flex items-center justify-center">
                                    <User size={26} className="text-gray-500" />
                                </div>
                            )}
                        </div>
                        <span className={`absolute -bottom-1 -right-1 ${HERO_BOX.recycle} rounded-full bg-slate-800 border border-white/20 flex items-center justify-center group-hover:bg-purple-700 transition-colors`}>
                            <RotateCcw size={12} className="text-gray-300 group-hover:text-white" />
                        </span>
                    </button>

                    {/* 等级 + 经验（HeroLevelBadge：Lv 徽章 + 经验条 + 数字） */}
                    {heroProgress && (
                        <HeroLevelBadge level={heroProgress.level} exp={heroProgress.exp} expToNext={heroProgress.expToNext} size="md" />
                    )}
                </div>

                {/* 功能入口：从左到右横排一行 */}
                <div className="flex items-end gap-5">
                    {funcBtn(rogueIcon1, '推演任务', onOpenMission, { showDot: hasRogueClaimableReward })}
                    {funcBtn(rogueIcon2, '评估嘉勉', onOpenEvaluation)} {/* [2026-08-29] 移除占位，接评估嘉勉面板 */}
                    {funcBtn(rogueIcon3, '逻辑研习', onOpenCodex)}
                </div>
            </div>

            {/* 占位功能提示条 */}
            {placeholder && (
                <div className="absolute left-1/2 bottom-24 -translate-x-1/2 z-50 px-5 py-2 bg-black/80 border border-white/20 rounded-lg text-white text-sm font-mono shadow-[0_0_20px_rgba(0,0,0,0.6)] animate-fade-in">
                    {placeholder}
                </div>
            )}

            {/* 右下角：未结算对局的结算/继续 + 前往推演 */}
            <div className="absolute right-8 bottom-8 z-10 flex flex-col items-end gap-3">
                {hasPendingRun && (
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => { eventBus.emit(GameEvents.UI_CLICK); onSettleRun?.(); }}
                            className="px-7 py-2.5 rounded-xl bg-gradient-to-r from-red-600 to-red-500 font-black tracking-widest text-white hover:scale-105 transition-all hover:shadow-[0_0_20px_rgba(239,68,68,0.5)]"
                            title="结算当前未完成的肉鸽对局（获得本场经验）"
                        >
                            结算
                        </button>
                        <button
                            onClick={() => { eventBus.emit(GameEvents.UI_CLICK); onResumeRun?.(); }}
                            className="px-7 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-500 font-black tracking-widest text-white hover:scale-105 transition-all hover:shadow-[0_0_20px_rgba(16,185,129,0.5)]"
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
                    <img src={rogueStar} alt="前往推演" className={`${START_BUTTON} object-contain`} draggable={false} />
                </button>
            </div>
        </motion.div>
    );
};
