// ==========================================
// 悖论迷宫 · 肉鸽专属任务面板（悖论推演委派）
// [2026-08-29 莉莉子] 参考普通军功任务界面（MissionUI）但独立成肉鸽专属：
//   - 只显示 rogue 标记的任务（普通军功面板已过滤）
//   - Tab：每日 / 里程碑（daily+rogue / achievement+rogue）
//   - 奖励：数据金 / 分析员经验 / 稀有武装（复用 grantMissionReward）
// ==========================================
import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Calendar, Award, Coins, Sparkles, Target } from 'lucide-react';
import { MISSIONS, type MissionDef } from '../../data/missionData';
import type { MissionProgress } from '../../hooks/useMissionSystem';
import { getEquipmentById } from '../../data/equipment';
import { eventBus, GameEvents } from '../../utils/eventBus';
import { RewardClaimPopup, buildRewardPopupData, type RewardPopupData } from '../../components/RewardClaimPopup'; // [2026-09-09 莉莉子] 肉鸽委派领取金光弹窗对齐主大厅
import { pickTuning } from '../../platform/tuning'; // 🎛️ MISSION_UI 双平台取值（判定收在 platform 层，组件里不出现 isNative）

// ══════════════════════════════════════════════════════════════════════
// 🎛️ 悖论推演委派（肉鸽任务面板）· 视觉调参区（**程微调就改这里**）
// ──────────────────────────────────────────────────────────────────────
// 这一屏 = 肉鸽大厅点「推演任务」弹出的面板（左 Tab：每日 / 里程碑，右：任务列表）。
// 管：面板尺寸 / 左栏 / 图标盒 / Tab / 关闭按钮 / 右区标题 / 任务行（含手机两行布局）/
//     进度条 / 奖励胶囊 / 领取按钮 / 状态文字 / 空态。
//
// 🔴 坐标系：界面跑在固定 1680×1050 画布内，整画布 transform: scale(s) 塞进窗口
//   （PC s≈1.03 · 雷电 1280×720 s≈0.686 · 手机横屏 s≈0.374）
//   ⇒ 本块的值一律是**画布 px**（1 Tailwind 单位 = 4px），直接进 style={{}}。
//
// ⚠️ **行高必须成对写**：Tailwind 内置行高是**固定 rem**（text-xs=16 / text-sm=20 /
//   text-lg=28 / text-xl=28 / text-2xl=32），一旦把 `text-*` 换成内联 fontSize，
//   行高就掉回继承（1.5）⇒ 每个 fontSize 都配一个 `*Line`。
//   原本**没有行高类**的（`text-[10px]` 那几处）PC 填 **0** ⇒ 代码里 `lh(0)` 返回 undefined，
//   回落浏览器 normal，与改动前一致。
//
// ⚠️ `max-w-*` 在本画布里被 `src/index.css:56` 的 `!important` 打死过（PC 上从未生效）
//   ⇒ `barMaxWidth` / `pillMaxWidth` **PC 值填 0**（= 不设上限），别按 384 / 100 回填，
//     否则 PC 的满宽进度条 / 奖励文案会被突然压窄。
//
// 🖥️📱 双平台：`MISSION_UI_MOBILE` = 手机端（程在雷电里调的就是这份）；
//   `MISSION_UI_PC_DIFF` 只列**与手机不同**的项，其余继承手机值。
// ══════════════════════════════════════════════════════════════════════
const MISSION_UI_MOBILE = {
    // ══ ① 面板（手机 1600×1000，正好塞进 1680×1050 画布，四边各留 40）══════
    panelWidth: 1600,               // 原 w-[900px]
    panelHeight: 1000,              // 原 h-[640px]

    // ══ ② 左栏（Tab 侧边栏）════════════════════════════════════════════
    sideWidth: 420,                 // 原 w-60（240）
    sidePad: 40,                    // 原 p-6（24）
    headerGap: 16,                  // 原 gap-3（图标盒 ↔ 标题块）
    headerMb: 48,                   // 原 mb-10（标题块 ↓ Tab 列）
    iconBoxSize: 72,                // 原 w-10 h-10（40）
    headerIconSize: 32,             // 原 <Target size={18} />
    sideTitleFontSize: 36,          // 原 text-xl（20）—— 侧栏主标题，次级档
    sideTitleLine: 46,              // 原 text-xl 固定行高 28
    sideSubFontSize: 20,            // 原 text-[10px] —— 装饰档
    sideSubLine: 26,                // 原无行高类（继承）
    tabGap: 16,                     // 原 gap-3（两个 Tab 之间）
    tabPadX: 24,                    // 原 px-4（16）
    tabPadY: 14,                    // 原 py-2.5（10）
    tabFontSize: 36,                // 原 text-sm（14）—— Tab 标签，次级档
    tabLine: 46,                    // 原 text-sm 固定行高 20
    tabIconSize: 32,                // 原 <Calendar / Award size={18} />
    tabIconGap: 16,                 // 原 gap-3（图标 ↔ 文字）
    footFontSize: 20,               // 原 text-[10px]（左栏底部脚注）—— 装饰档
    footLine: 26,                   // 原无行高类（继承）

    // ══ ③ 右区外壳（内边距 / 关闭按钮 / 标题 / 列表留白 / 空态）══════════
    bodyPad: 44,                    // 原 p-8（32）
    closeTop: 28,                   // 原 top-6（24）
    closeRight: 28,                 // 原 right-6（24）
    closePad: 12,                   // 原 p-2（8）
    closeIconSize: 36,              // 原 <X size={24} />
    headerFontSize: 36,             // 原 text-2xl（24）—— 右区大标题，次级档
    headerLine: 46,                 // 原 text-2xl 固定行高 32
    titleMb: 28,                    // 原 mb-6（24，右区标题 ↓ 分割线）
    headerPadBottom: 20,            // 原 pb-4（16）
    listPadRight: 20,               // 原 pr-4（16，滚动条留白）
    emptyFontSize: 32,              // 原 text-sm（空态「暂无委派任务」）—— 核心档
    emptyLine: 42,                  // 原 text-sm 固定行高 20
    emptyPadTop: 60,                // 原 pt-10（40）

    // ══ ④ 任务行（手机：上段 信息 / 下段 奖励+按钮 两行竖排；PC：横排）══════
    rowPad: 28,                     // 原 p-5（20）
    /** 主轴向：手机竖排；PC 保持横排（原 flex 默认 row） */
    rowDir: 'column' as React.CSSProperties['flexDirection'],
    /** 主轴对齐：手机两段紧贴（靠 rowSectionGap 撑开）；PC = 原 justify-between */
    rowJustify: 'flex-start' as React.CSSProperties['justifyContent'],
    /** 上段 ↔ 下段间距 px（原行容器**无 gap** ⇒ **PC 必须 0**，否则 justify-between + gap 会溢出） */
    rowSectionGap: 20,
    /** 右段内部间距 px（奖励胶囊 ↔ 领取按钮）—— 原 gap-4（16），**不是** rowSectionGap */
    rowRightGap: 20,
    rowInfoGap: 10,                 // 原 gap-2（标题 / 描述 / 进度条之间的行距）
    rowInfoPadRight: 0,             // 原 pr-8（PC 靠它把左右两段分开；手机竖排不需要）
    titleFontSize: 36,              // 原 text-lg（18）—— 任务标题，次级档
    titleLine: 46,                  // 原 text-lg 固定行高 28
    descFontSize: 32,               // 原 text-sm（14）—— 任务描述，核心档
    descLine: 42,                   // 原 text-sm 固定行高 20
    barMt: 12,                      // 原 mt-2（8，进度条 ↑ 描述）
    barHeight: 14,                  // 原 h-2（8）
    /** 进度条最大宽 px：**0 = 不设上限**（原 max-w-md 被 index.css:56 打死，PC 一直是满宽） */
    barMaxWidth: 0,
    progLabelFontSize: 20,          // 原 text-[10px]（PROGRESS: x/y）—— 装饰档
    progLabelLine: 26,              // 原无行高类（继承）
    progLabelMt: 6,                 // 原 mt-1（4）
    /** 右段最小宽 px：**0 = 不设**（原 min-w-[170px] 同样被打死；手机还要解除它让右段满宽） */
    rowRightMinWidth: 0,
    /** 右段宽度：手机满宽 ⇒ 奖励胶囊贴左、按钮贴右 */
    rowRightWidth: '100%',          // 原未设宽（auto）
    /** 右段主轴对齐：手机两端撑开；PC = 原 justify-end */
    rowRightJustify: 'space-between' as React.CSSProperties['justifyContent'],
    pillGap: 10,                    // 原 gap-1.5（6，奖励图标 ↔ 文本）
    pillPadX: 16,                   // 原 px-3（12）
    pillPadY: 10,                   // 原 py-1.5（6）
    pillIconSize: 26,               // 原 w-5 h-5（20，武装图标）
    pillLucideSize: 24,             // 原 <Coins / Sparkles size={16} />
    pillFontSize: 32,               // 原 text-xs（12）—— 奖励文案，核心档
    pillLine: 42,                   // 原 text-xs 固定行高 16
    /** 奖励文案最大宽 px：**0 = 不截断**（原 max-w-[100px] 被 index.css:56 打死） */
    pillMaxWidth: 0,
    btnPadX: 24,                    // 原 px-4（16，领取按钮）
    btnPadY: 12,                    // 原 py-2（8）
    btnFontSize: 32,                // 原 text-sm（14）—— 领取按钮，核心档
    btnLine: 42,                    // 原 text-sm 固定行高 20
    statusFontSize: 32,             // 原 text-xs（「已领取」/ 右下进度数字）—— 核心档
    statusLine: 42,                 // 原 text-xs 固定行高 16
};

// ══════════════════════════════════════════════════════════════════════
// 🖥️ PC 端差异项 —— 只列「与手机端不同」的项；未列出的项两端相同
// ──────────────────────────────────────────────────────────────────────
// 依据：本文件改造前那一版的 Tailwind 类**逐项反推**（口径 ×1，rem×16 / 1 单位 = 4px）
//      ⇒ 改完 PC 端必须与改造前**逐像素一致**（这正是"PC 零变化"的自查凭据）。
// 改这里 = 改 PC 观感；改上面 = 改手机观感。
// ══════════════════════════════════════════════════════════════════════
const MISSION_UI_PC_DIFF = {
    // ══ ① 面板 ═════════════════════════════════════════════════════════
    panelWidth: 900,                // 原 w-[900px]
    panelHeight: 640,               // 原 h-[640px]

    // ══ ② 左栏 ═════════════════════════════════════════════════════════
    sideWidth: 240,                 // 原 w-60
    sidePad: 24,                    // 原 p-6
    headerGap: 12,                  // 原 gap-3
    headerMb: 40,                   // 原 mb-10
    iconBoxSize: 40,                // 原 w-10 h-10
    headerIconSize: 18,             // 原 <Target size={18} />
    sideTitleFontSize: 20,          // 原 text-xl
    sideTitleLine: 28,              // 原 text-xl 行高
    sideSubFontSize: 10,            // 原 text-[10px]
    sideSubLine: 0,                 // 原无行高类 ⇒ 0 = 回落继承
    tabGap: 12,                     // 原 gap-3
    tabPadX: 16,                    // 原 px-4
    tabPadY: 10,                    // 原 py-2.5
    tabFontSize: 14,                // 原 text-sm
    tabLine: 20,                    // 原 text-sm 行高
    tabIconSize: 18,                // 原 size={18}
    tabIconGap: 12,                 // 原 gap-3
    footFontSize: 10,               // 原 text-[10px]
    footLine: 0,                    // 原无行高类

    // ══ ③ 右区外壳 ═════════════════════════════════════════════════════
    bodyPad: 32,                    // 原 p-8
    closeTop: 24,                   // 原 top-6
    closeRight: 24,                 // 原 right-6
    closePad: 8,                    // 原 p-2
    closeIconSize: 24,              // 原 <X size={24} />
    headerFontSize: 24,             // 原 text-2xl
    headerLine: 32,                 // 原 text-2xl 行高
    titleMb: 24,                    // 原 mb-6
    headerPadBottom: 16,            // 原 pb-4
    listPadRight: 16,               // 原 pr-4
    emptyFontSize: 14,              // 原 text-sm
    emptyLine: 20,                  // 原 text-sm 行高
    emptyPadTop: 40,                // 原 pt-10

    // ══ ④ 任务行 ═══════════════════════════════════════════════════════
    rowPad: 20,                     // 原 p-5
    rowDir: 'row' as React.CSSProperties['flexDirection'],                     // 原 flex（默认 row）
    rowJustify: 'space-between' as React.CSSProperties['justifyContent'],      // 原 justify-between
    rowSectionGap: 0,               // 原行容器无 gap —— **必须 0**
    rowRightGap: 16,                // 原 gap-4（奖励胶囊 ↔ 领取按钮）
    // [2026-10-28 莉莉子 · 独立验证 P1 修复] 原 `min-w-[170px]` 在 PC 上**一直生效**
    //   （`src/index.css` 只封杀 `max-w-*` 与 `.min-w-screen`，管不到 `min-w-[170px]`）
    //   ⇒ 手机端解除挤压填 0 是对的，但 PC 必须回填 170，否则右段失去最小宽、布局会漂。
    rowRightMinWidth: 170,
    rowInfoGap: 8,                  // 原 gap-2
    rowInfoPadRight: 32,            // 原 pr-8
    titleFontSize: 18,              // 原 text-lg
    titleLine: 28,                  // 原 text-lg 行高
    descFontSize: 14,               // 原 text-sm
    descLine: 20,                   // 原 text-sm 行高
    barMt: 8,                       // 原 mt-2
    barHeight: 8,                   // 原 h-2
    progLabelFontSize: 10,          // 原 text-[10px]
    progLabelLine: 0,               // 原无行高类
    progLabelMt: 4,                 // 原 mt-1
    rowRightWidth: 'auto',          // 原未设宽
    rowRightJustify: 'flex-end' as React.CSSProperties['justifyContent'],      // 原 justify-end
    pillGap: 6,                     // 原 gap-1.5
    pillPadX: 12,                   // 原 px-3
    pillPadY: 6,                    // 原 py-1.5
    pillIconSize: 20,               // 原 w-5 h-5
    pillLucideSize: 16,             // 原 size={16}
    pillFontSize: 12,               // 原 text-xs
    pillLine: 16,                   // 原 text-xs 行高
    btnPadX: 16,                    // 原 px-4
    btnPadY: 8,                     // 原 py-2
    btnFontSize: 14,                // 原 text-sm
    btnLine: 20,                    // 原 text-sm 行高
    statusFontSize: 12,             // 原 text-xs
    statusLine: 16,                 // 原 text-xs 行高
};

/** PC 端完整值 = 手机值为底 + PC 差异覆盖 */
const MISSION_UI_PC = { ...MISSION_UI_MOBILE, ...MISSION_UI_PC_DIFF };

/** 🖥️ PC / 📱 手机 —— 按运行平台自动二选一（平台判定在 `src/platform/tuning.ts`） */
export const MISSION_UI = pickTuning(MISSION_UI_PC, MISSION_UI_MOBILE);

/**
 * 行高小工具 —— 把调参区里的「画布 px 数字」变成合法 CSS 行高。
 *
 * 🔴 为什么必须过这一层：React 把 `lineHeight` 列入 **unitless 属性表**
 *   ⇒ `style={{ lineHeight: 20 }}` 编译出的是 `line-height: 20`（= 20 **倍**字号），
 *     不是 20px。字号 32 时那会是 640px 行高，整屏直接崩。
 *   ⇒ 一律补 `px`。填 0 表示「原本没有行高类」⇒ 返回 undefined，回落浏览器 normal。
 */
const lh = (px: number): string | undefined => (px ? `${px}px` : undefined);

interface RogueMissionPanelProps {
    isOpen: boolean;
    onClose: () => void;
    missionSystem: any; // useMissionSystem
    userSystem: any;    // useUserSystem（grantMissionReward）
}

type RogueTab = 'daily' | 'milestone';

/** [2026-09-08] 脉冲黄点（tab 可领提示，同款大厅/军需 tab） */
const Dot = () => (
    <span className="relative ml-auto flex h-2 w-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
        <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.9)]" />
    </span>
);

export const RogueMissionPanel: React.FC<RogueMissionPanelProps> = ({ isOpen, onClose, missionSystem, userSystem }) => {
    const [tab, setTab] = useState<RogueTab>('daily');
    // [2026-09-09 莉莉子] 领取金光弹窗（对齐主大厅 MissionUI）
    const [rewardPopup, setRewardPopup] = useState<RewardPopupData | null>(null);

    // 关面板时顺带清掉可能残留的弹窗
    const closeAll = () => { setRewardPopup(null); onClose(); };

    // ESC 关闭（capture + stopImmediatePropagation 拦截全局 ESC）；弹窗开着时优先关弹窗
    useEffect(() => {
        if (!isOpen) return;
        const handler = (e: KeyboardEvent) => {
            if (e.key !== 'Escape') return;
            e.stopImmediatePropagation();
            if (rewardPopup) { setRewardPopup(null); return; }
            onClose();
        };
        window.addEventListener('keydown', handler, { capture: true });
        return () => window.removeEventListener('keydown', handler, { capture: true });
    }, [isOpen, onClose, rewardPopup]);

    if (!isOpen) return null;

    // [2026-09-08] 各 tab 是否有可领（点亮标签黄点，与推演任务入口黄点同语义：统计本面板可见 rogue 任务）
    const rogueTabClaimable = (cat: 'daily' | 'achievement'): boolean =>
        MISSIONS.some(m => m.rogue && m.category === cat && missionSystem?.progress?.[m.id]?.status === 'completed');

    // 只显示肉鸽专属任务，按 Tab 分每日/里程碑
    const displayMissions = MISSIONS
        .filter(m => m.rogue && (tab === 'daily' ? m.category === 'daily' : m.category === 'achievement'))
        .filter(m => missionSystem?.progress?.[m.id])
        .sort((a, b) => (missionSystem?.progress?.[a.id]?.sort ?? 101) - (missionSystem?.progress?.[b.id]?.sort ?? 101));

    /** 奖励文案 */
    const rewardLabel = (m: MissionDef): string => {
        if (m.reward.type === 'analystExp') return `+${m.reward.amount} 分析员经验`;
        if (m.reward.type === 'armament' && m.reward.armamentId) return `武装「${getEquipmentById(m.reward.armamentId)?.name ?? m.reward.armamentId}」`;
        if (m.reward.type === 'dataGold') return `+${m.reward.amount} 数据金`;
        if (m.reward.type === 'universalShard') return `万能神格碎片 ×${m.reward.amount}`; // [2026-09-29 程拍板]
        if (m.reward.type === 'pack') return `悖论迷宫卡包 ×${m.reward.amount ?? 1}`;
        return '';
    };

    const handleClaim = (m: MissionDef) => {
        const reward = missionSystem?.claimReward?.(m.id);
        if (!reward) return;
        userSystem?.grantMissionReward?.(reward);
        eventBus.emit(GameEvents.GACHA_CONVERT);
        // [2026-09-09 莉莉子] 领取后弹金光奖励窗（与主大厅任务一致，含数据金/武装/分析员经验等）
        setRewardPopup(buildRewardPopupData(m.title, reward));
    };

    return (
        <>
        <AnimatePresence>
            <motion.div className="fixed inset-0 z-[950] flex items-center justify-center font-sans select-none">
                <motion.div
                    className="absolute inset-0 bg-slate-950/80 backdrop-blur-md"
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    onClick={() => {eventBus.emit(GameEvents.UI_BACK); closeAll(); }}
                />
                <motion.div
                    initial={{ scale: 0.95, opacity: 0, y: 20 }}
                    animate={{ scale: 1, opacity: 1, y: 0 }}
                    exit={{ scale: 0.95, opacity: 0, y: 20 }}
                    transition={{ type: 'spring', stiffness: 200, damping: 20 }}
                    className="relative bg-slate-900/95 border border-purple-500/30 rounded-2xl shadow-[0_0_80px_rgba(88,28,135,0.4)] flex overflow-hidden backdrop-blur-xl"
                    style={{ width: MISSION_UI.panelWidth, height: MISSION_UI.panelHeight }}
                >
                    {/* 内部高光 */}
                    <div className="absolute top-0 w-full h-[30%] bg-gradient-to-b from-purple-600/10 to-transparent pointer-events-none" />

                    {/* 左侧 Tab 侧边栏（肉鸽主题） */}
                    <div className="bg-slate-950/50 border-r border-purple-500/20 flex flex-col shrink-0 relative z-10"
                        style={{ width: MISSION_UI.sideWidth, padding: MISSION_UI.sidePad }}>
                        <div className="flex items-center" style={{ gap: MISSION_UI.headerGap, marginBottom: MISSION_UI.headerMb }}>
                            <div className="bg-purple-900/50 rounded-lg flex items-center justify-center border border-purple-500/50 shadow-[0_0_15px_rgba(168,85,247,0.5)]"
                                style={{ width: MISSION_UI.iconBoxSize, height: MISSION_UI.iconBoxSize }}>
                                <Target size={MISSION_UI.headerIconSize} className="text-purple-400" />
                            </div>
                            <div>
                                <h2 className="font-black text-white tracking-widest" style={{ fontSize: MISSION_UI.sideTitleFontSize, lineHeight: lh(MISSION_UI.sideTitleLine) }}>悖论推演委派</h2>
                                <p className="text-purple-500/80 font-mono tracking-wider" style={{ fontSize: MISSION_UI.sideSubFontSize, lineHeight: lh(MISSION_UI.sideSubLine) }}>PARADOX COMMISSION</p>
                            </div>
                        </div>

                        <div className="flex flex-col" style={{ gap: MISSION_UI.tabGap }}>
                            <button onClick={() => { setTab('daily'); eventBus.emit(GameEvents.UI_CLICK); }}
                                style={{ gap: MISSION_UI.tabIconGap, padding: `${MISSION_UI.tabPadY}px ${MISSION_UI.tabPadX}px`, fontSize: MISSION_UI.tabFontSize, lineHeight: lh(MISSION_UI.tabLine) }}
                                className={`relative flex items-center rounded-lg font-black transition-all ${tab === 'daily' ? 'bg-purple-600/30 border border-purple-400/50 text-purple-200' : 'bg-white/5 text-gray-500 hover:bg-white/10 hover:text-white'}`}>
                                <Calendar size={MISSION_UI.tabIconSize} /> 每日委派
                                {rogueTabClaimable('daily') && <Dot />}
                            </button>
                            <button onClick={() => { setTab('milestone'); eventBus.emit(GameEvents.UI_CLICK); }}
                                style={{ gap: MISSION_UI.tabIconGap, padding: `${MISSION_UI.tabPadY}px ${MISSION_UI.tabPadX}px`, fontSize: MISSION_UI.tabFontSize, lineHeight: lh(MISSION_UI.tabLine) }}
                                className={`relative flex items-center rounded-lg font-black transition-all ${tab === 'milestone' ? 'bg-purple-600/30 border border-purple-400/50 text-purple-200' : 'bg-white/5 text-gray-500 hover:bg-white/10 hover:text-white'}`}>
                                <Award size={MISSION_UI.tabIconSize} /> 里程碑
                                {rogueTabClaimable('achievement') && <Dot />}
                            </button>
                        </div>

                        <div className="mt-auto text-purple-500/60 font-mono tracking-wider"
                            style={{ fontSize: MISSION_UI.footFontSize, lineHeight: lh(MISSION_UI.footLine) }}>
                            推演委派 · 仅限悖论迷宫
                        </div>
                    </div>

                    {/* 右侧任务列表 */}
                    <div className="flex-1 flex flex-col relative z-10" style={{ padding: MISSION_UI.bodyPad }}>
                        <button onClick={() => { closeAll(); eventBus.emit(GameEvents.UI_BACK); }}
                            style={{ top: MISSION_UI.closeTop, right: MISSION_UI.closeRight, padding: MISSION_UI.closePad }}
                            className="absolute rounded-full text-purple-500/50 hover:bg-purple-900/30 hover:text-white transition-all">
                            <X size={MISSION_UI.closeIconSize} />
                        </button>

                        <h3 className="font-black text-white border-b border-white/10"
                            style={{ fontSize: MISSION_UI.headerFontSize, lineHeight: lh(MISSION_UI.headerLine), marginBottom: MISSION_UI.titleMb, paddingBottom: MISSION_UI.headerPadBottom }}>
                            {tab === 'daily' ? '每日委派 (DAILY COMMISSION)' : '里程碑 (MILESTONE)'}
                        </h3>

                        {/* ⚠️ 行距保留 `space-y-4`：它是定高滚动区，改 flex 列 + gap 需给每行补 shrink-0（手册 §6），收益不抵风险 */}
                        <div className="flex-1 overflow-y-auto custom-scrollbar space-y-4" style={{ paddingRight: MISSION_UI.listPadRight }}>
                            {displayMissions.length === 0 && (
                                <p className="text-gray-500 text-center"
                                    style={{ fontSize: MISSION_UI.emptyFontSize, lineHeight: lh(MISSION_UI.emptyLine), paddingTop: MISSION_UI.emptyPadTop }}>暂无委派任务</p>
                            )}
                            {displayMissions.map(mission => {
                                const prog: MissionProgress = missionSystem?.progress[mission.id] || { current: 0, target: mission.targetCount, status: 'ongoing' };
                                const isCompleted = prog.status === 'completed';
                                const isClaimed = prog.status === 'claimed';
                                const percent = Math.min(100, (prog.current / prog.target) * 100);
                                return (
                                    <div key={mission.id}
                                        style={{
                                            padding: MISSION_UI.rowPad,
                                            flexDirection: MISSION_UI.rowDir,
                                            justifyContent: MISSION_UI.rowJustify,
                                            // 竖排时左列必须 stretch：否则它缩成内容宽，进度条 w-full 会失去参照
                                            alignItems: MISSION_UI.rowDir === 'column' ? 'stretch' : 'center',
                                            gap: MISSION_UI.rowSectionGap || undefined,
                                        }}
                                        className={`relative flex rounded-xl border transition-all duration-300 ${
                                        isClaimed ? 'bg-slate-900/50 border-white/5 opacity-50 grayscale' :
                                        isCompleted ? 'bg-purple-900/20 border-yellow-500/50 shadow-[0_0_20px_rgba(234,179,8,0.15)]' :
                                        'bg-slate-800/50 border-purple-500/20 hover:border-purple-500/50'
                                    }`}>
                                        {/* 左侧信息 */}
                                        <div className="flex flex-col flex-1"
                                            style={{ gap: MISSION_UI.rowInfoGap, paddingRight: MISSION_UI.rowInfoPadRight }}>
                                            <h4 className={`font-bold ${isCompleted && !isClaimed ? 'text-yellow-400' : 'text-white'}`}
                                                style={{ fontSize: MISSION_UI.titleFontSize, lineHeight: lh(MISSION_UI.titleLine) }}>{mission.title}</h4>
                                            <p className="text-gray-400 font-medium"
                                                style={{ fontSize: MISSION_UI.descFontSize, lineHeight: lh(MISSION_UI.descLine) }}>{mission.description}</p>
                                            <div className="w-full bg-black/50 rounded-full overflow-hidden border border-white/10 relative"
                                                style={{ marginTop: MISSION_UI.barMt, height: MISSION_UI.barHeight, maxWidth: MISSION_UI.barMaxWidth || undefined }}>
                                                <motion.div
                                                    className={`absolute left-0 top-0 h-full ${isCompleted ? 'bg-yellow-500' : 'bg-purple-500'}`}
                                                    initial={{ width: 0 }}
                                                    animate={{ width: `${percent}%` }}
                                                    transition={{ duration: 0.5, ease: 'easeOut' }}
                                                />
                                            </div>
                                            <span className="font-mono text-gray-500"
                                                style={{ fontSize: MISSION_UI.progLabelFontSize, lineHeight: lh(MISSION_UI.progLabelLine), marginTop: MISSION_UI.progLabelMt }}>
                                                PROGRESS: {prog.current} / {prog.target}
                                            </span>
                                        </div>

                                        {/* 右侧奖励与按钮 */}
                                        <div className="flex items-center shrink-0"
                                            style={{
                                                gap: MISSION_UI.rowRightGap,
                                                minWidth: MISSION_UI.rowRightMinWidth || undefined,
                                                width: MISSION_UI.rowRightWidth,
                                                justifyContent: MISSION_UI.rowRightJustify,
                                            }}>
                                            <div className="flex items-center bg-black/40 rounded-lg border border-purple-500/30"
                                                style={{ gap: MISSION_UI.pillGap, padding: `${MISSION_UI.pillPadY}px ${MISSION_UI.pillPadX}px` }}>
                                                {mission.reward.type === 'armament' && mission.reward.armamentId ? (
                                                    <img src={getEquipmentById(mission.reward.armamentId)?.icon} className="object-cover" style={{ width: MISSION_UI.pillIconSize, height: MISSION_UI.pillIconSize }} alt="" />
                                                ) : mission.reward.type === 'dataGold' ? (
                                                    <Coins size={MISSION_UI.pillLucideSize} className="text-amber-300" />
                                                ) : (
                                                    <Sparkles size={MISSION_UI.pillLucideSize} className="text-purple-300" />
                                                )}
                                                <span className="font-mono font-bold text-purple-200 truncate"
                                                    style={{ fontSize: MISSION_UI.pillFontSize, lineHeight: lh(MISSION_UI.pillLine), maxWidth: MISSION_UI.pillMaxWidth || undefined }}>{rewardLabel(mission)}</span>
                                            </div>
                                            {isCompleted ? (
                                                <button onClick={() => {eventBus.emit(GameEvents.UI_CLICK); handleClaim(mission); }}
                                                    style={{ padding: `${MISSION_UI.btnPadY}px ${MISSION_UI.btnPadX}px`, fontSize: MISSION_UI.btnFontSize, lineHeight: lh(MISSION_UI.btnLine) }}
                                                    className="rounded-lg bg-gradient-to-r from-yellow-600 to-amber-400 text-black font-black shrink-0 hover:scale-105 transition-all">
                                                    领取
                                                </button>
                                            ) : isClaimed ? (
                                                <span className="text-gray-500 shrink-0"
                                                    style={{ fontSize: MISSION_UI.statusFontSize, lineHeight: lh(MISSION_UI.statusLine) }}>已领取</span>
                                            ) : (
                                                <span className="text-gray-500 font-mono shrink-0"
                                                    style={{ fontSize: MISSION_UI.statusFontSize, lineHeight: lh(MISSION_UI.statusLine) }}>{prog.current}/{prog.target}</span>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
        {/* 领取金光弹窗（共享组件，对齐主大厅） */}
        {rewardPopup && <RewardClaimPopup data={rewardPopup} onClose={() => setRewardPopup(null)} />}
        </>
    );
};
