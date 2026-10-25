/**
 * ==============================================================================
 * 《Snowbreak Rivals》 军需处视觉终端 (Mission UI)
 * ==============================================================================
 * 职责：
 * 1. MissionPanel: 大厅唤出的任务与成就管理面板，负责展示与奖励领取。
 * 2. MissionToast: 对局结算画面专用的滑动提示框，支持队列依次展示。
 * ==============================================================================
 */

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Check, Target, Calendar, Zap, Award, Gift, CheckCircle, Sparkles, Clock } from 'lucide-react';
import { MISSIONS, type MissionCategory } from '../data/missionData';
import type { MissionUpdateResult, MissionProgress } from '../hooks/useMissionSystem';
import { CURRENCY_ICONS, getSkinImage, PERSONALIZATION_ASSETS } from '../data/imageData'; // [新增] 引入外观图库（HERO_IMAGES 已随卡图辅助函数移入共享弹窗）
import { getMissionItems } from '../data/skinData'; // [新增] 引入外观调度局 API
import { getEquipmentById } from '../data/equipment'; // [2026-09-08] 武装奖励展示/弹窗
import { eventBus, GameEvents } from '../utils/eventBus';
import { ShardIcon } from './roguelike/ShardIcon'; // [2026-09-29 程拍板] 万能碎片橙菱形图标（现作为插画兜底）
// [2026-10-20 莉莉子 🎨 视觉层优化] 万能神格碎片插画（唯一真源在 chestArt）
import { UNIVERSAL_SHARD_ART } from '../data/roguelike/chestArt';
// [2026-09-09 莉莉子] 金光领取弹窗抽为共享组件（主大厅/肉鸽复用），数据构造器与卡图辅助一并移入
import { RewardClaimPopup, buildRewardPopupData, getCardRewardImage, type RewardPopupData } from './RewardClaimPopup';
import { pickTuning } from '../platform/tuning';
// ══════════════════════════════════════════════════════════════════════
// 🎛️ 战区军功 · 任务面板（`MissionPanel`）· 视觉调参区（**程微调就改这里**）
// ──────────────────────────────────────────────────────────────────────
// 这一屏 = 大厅点「战区军功」唤出的 `1000×700` 面板：
//   左侧边栏（品牌 + 四个分类：每日委派 / 每周清剿 / 生涯成就 / 版本活动）
//   + 右侧任务列表（标题 + 倒计时 + 任务行 + 进度条 + 奖励 chip + 领取按钮）。
// 管：①面板本体 ②左侧边栏（品牌 + 标签列表）③标签按钮 `TabButton`
//     ④右侧内容区（页标题 + 关闭）⑤任务列表（行 / 进度条）⑥奖励展示（chip / 缩略图 / 文字）
//     ⑦状态按钮（领取 / 已领取 / 进行中）⑧重置倒计时行 `CountdownTimer` ⑨悬停预览大图（portal）。
// 改完存盘即生效（HMR —— 雷电/电脑上 1~3 秒看到，不用出包）。
// 命名与用法**对齐 `TITLE_UI`**：值是**绝对画布 px**、直接进 style；注释标注**原 Tailwind 类**。
// ⚠️ **本文件还有一个组件不在本块里**：`MissionToast`（对局结算画面左上角滑出的提示条，
//     走的是另一屏）。它那些尺寸**刻意没搬** —— 按"一屏一个调参区"的口径，它该有自己的块。
// ⚠️ `max-w-*` 三处（进度条 `max-w-md`、奖励名两处 `max-w-[90px]`）**默认锁 `'none'`**：
//     `index.css:56` 的 `[class*="max-w-"]{max-width:none!important}` 把原类打死过，
//     搬成内联后若填数字会"突然真的生效、面板里那几行变窄"（见 `progressMaxWidth` 的注释）。
// ⚠️ 刻意**没搬**的类（铺满 / 装饰 / 状态，不是可调尺寸）：
//     `w-full` · `h-full` · `flex-1` · `shrink-0` · `min-w-0` · `inset-0` · 各 `-0` 定位 · `top-1/2`
//     · `rounded-full` · `truncate` · `object-cover` · `opacity-*` · `grayscale` · `tracking-*`
//     · `font-*` · `uppercase` · `hover:*` / `group-hover:*` · `active:scale-95` · `animate-*`
//     · `transition-*` · `shadow-*` · `bg-*` / `text-<色>` / `border-<色>`
// ⚠️ 本屏无 `vh` / `vw`（合 `design-guide.md` §3 铁律）；`panelHighlightHeight` 是**父容器 `%`**。
// ══════════════════════════════════════════════════════════════════════
// 🖥️📱 【双平台】`MISSION_UI_MOBILE`（手机端）+ `MISSION_UI_PC_DIFF`（PC 端差异项，见本块下方）
const MISSION_UI_MOBILE = {
    // ══ ① 面板本体 ════════════════════════════════════════════════════
    /** 面板宽 px（原 w-[1000px]） */
    panelWidth: 1300,
    /** 面板高 px（原 h-[700px]） */
    panelHeight: 900,
    /** 面板描边 px（原 border = 1） */
    panelBorderWidth: 1,
    /** 面板圆角 px（原 rounded-2xl = 16） */
    panelRadius: 16,
    /** 顶部那道蓝色高光的高度（原 h-[30%]，父容器百分比） */
    panelHighlightHeight: '30%',

    // ══ ② 左侧边栏（品牌 + 标签列表）═════════════════════════════════
    /** 边栏宽 px（原 w-64 = 256） */
    sidebarWidth: 356,
    /** 右边线 px（原 border-r = 1） */
    sidebarBorderWidth: 1,
    /** 边栏四周内边距 px（原 p-6 = 24） */
    sidebarPad: 24,
    /** 「战区军功」行：图标框与文字的间距 px（原 gap-3 = 12） */
    brandRowGap: 12,
    /** 品牌行与标签列表的间距 px（原 mb-10 = 40） */
    brandRowMarginBottom: 40,
    /** 品牌图标方框边长 px（原 w-10 h-10 = 40） */
    brandIconBoxSize: 40,
    /** 品牌图标方框圆角 px（原 rounded-lg = 8） */
    brandIconBoxRadius: 8,
    /** 品牌图标方框描边 px（原 border = 1） */
    brandIconBoxBorderWidth: 1,
    /** 品牌准星图标 px（原未设 size，走 lucide 默认 24） */
    brandIconSize: 24,
    /** 「战区军功」字号 px（原 text-xl = 20） */
    titleFontSize: 30,
    /** 「COMMAND CENTER」字号 px（原 text-[10px] = 10） */
    subtitleFontSize: 15,
    /** 四个标签之间的行距 px（原 gap-3 = 12） */
    tabListGap: 12,

    // ══ ③ 标签按钮（`TabButton`，四个共用）═══════════════════════════
    /** 按钮上下内边距 px（原 py-3 = 12） */
    tabPadY: 12,
    /** 按钮左右内边距 px（原 px-4 = 16） */
    tabPadX: 16,
    /** 图标与文字的间距 px（原 gap-3 = 12） */
    tabGap: 12,
    /** 按钮圆角 px（原 rounded-lg = 8） */
    tabRadius: 8,
    /** 按钮字号 px（原 text-sm = 14） */
    tabFontSize: 28,
    /** 「有可领奖励」黄点直径 px（原 w-2.5 h-2.5 = 10，内外两层共用） */
    dotSize: 15,

    // ══ ④ 右侧内容区（页标题 + 关闭）═════════════════════════════════
    /** 内容区四周内边距 px（原 p-8 = 32） */
    contentPad: 32,
    /** 关闭按钮距顶 px（原 top-6 = 24） */
    closeTop: 24,
    /** 关闭按钮距右 px（原 right-6 = 24） */
    closeRight: 24,
    /** 关闭按钮内边距 px（原 p-2 = 8） */
    closePad: 8,
    /** ✕ 图标 px（原 size={24}） */
    closeIconSize: 48,
    /** 页标题（每日委派 (DAILY)…）字号 px（原 text-2xl = 24） */
    pageTitleFontSize: 36,
    /** 页标题与下方的间距 px（原 mb-6 = 24） */
    pageTitleMarginBottom: 24,
    /** 页标题下划线 px（原 border-b = 1） */
    pageTitleBorderWidth: 1,
    /** 标题文字与下划线的间距 px（原 pb-4 = 16） */
    pageTitlePadBottom: 16,

    // ══ ⑤ 任务列表（行 / 进度条）═════════════════════════════════════
    /** 列表区右内边距 px（原 pr-4 = 16，给滚动条让位） */
    listPadRight: 16,
    /** 任务行之间的行距 px（原 space-y-4 = 16） */
    listGap: 16,
    /** 任务行内边距 px（原 p-5 = 20） */
    rowPad: 20,
    /** 任务行圆角 px（原 rounded-xl = 12） */
    rowRadius: 12,
    /** 任务行描边 px（原 border = 1） */
    rowBorderWidth: 1,
    /** 行内左半区：标题 / 描述 / 进度条的行距 px（原 gap-2 = 8） */
    rowLeftGap: 8,
    /** 左半区与右半区（奖励+按钮）的间隙 px（原 pr-8 = 32） */
    rowLeftPadRight: 32,
    /** 任务标题字号 px（原 text-lg = 18） */
    rowTitleFontSize: 36,
    /** 任务描述字号 px（原 text-sm = 14） */
    rowDescFontSize: 28,
    /** 进度条与描述的上间距 px（原 mt-2 = 8） */
    progressMarginTop: 8,
    /**
     * 进度条最大宽度。**默认 `'none'` = 不限宽 = 改动前实际渲染的样子**。
     * 🔴 原类 `max-w-md`（= 448）**从来没生效过** —— `index.css:56` 的
     *    `[class*="max-w-"]{max-width:none!important}` 把它打死了；搬成**内联**后那条
     *    `!important` 管不到内联 ⇒ 现在填数字会**真的生效**、进度条会变短。想启用就填 448。
     */
    progressMaxWidth: 'none',
    /** 进度条高 px（原 h-2 = 8） */
    progressHeight: 8,
    /** 进度条描边 px（原 border = 1） */
    progressBorderWidth: 1,
    /** 「PROGRESS: n / m」字号 px（原 text-[10px] = 10） */
    progressTextFontSize: 20,
    /** 该行与进度条的间距 px（原 mt-1 = 4） */
    progressTextMarginTop: 4,
    /** 行内右半区（奖励 + 状态按钮）的间距 px（原 gap-6 = 24） */
    rowRightGap: 24,
    /** 右半区最小宽 px（原 min-w-[180px] = 180，保证按钮不左右跳） */
    rowRightMinWidth: 180,

    // ══ ⑥ 奖励展示（chip / 缩略图 / 文字）═════════════════════════════
    /** 奖励 chip 内图标与文字的间距 px（原 gap-2 = 8） */
    chipGap: 8,
    /** chip 左右内边距 px（原 px-3 = 12） */
    chipPadX: 12,
    /** chip 上下内边距 px（原 py-1.5 = 6） */
    chipPadY: 6,
    /** chip 圆角 px（原 rounded-lg = 8） */
    chipRadius: 8,
    /** chip 描边 px（原 border = 1） */
    chipBorderWidth: 1,
    /** 卡牌 / 卡包 / 碎片 / 外观四类 chip 的最小宽 px（原 min-w-[120px] = 120） */
    chipMinWidth: 120,
    /** 数据金 chip 的图标与数字间距 px（原 gap-1.5 = 6，这个 chip 没有 min-w） */
    goldChipGap: 6,
    /** 数据金图标 px（原 w-5 h-5 = 20） */
    goldIconSize: 30,
    /** 缩略图边长 px（原 w-8 h-8 = 32，卡牌 / 武装 / 外观三处共用） */
    rewardThumbSize: 32,
    /** 缩略图圆角 px（原 rounded = 4） */
    rewardThumbRadius: 4,
    /** 缩略图描边 px（原 border = 1） */
    rewardThumbBorderWidth: 1,
    /** 没有缩略图时的礼盒兜底图标 px（原 size={18}） */
    rewardFallbackIconSize: 36,
    /** 「CARD / PACK / SHARD / SKIN」小标签字号 px（原 text-[8px] = 8） */
    rewardTagFontSize: 8,
    /** 奖励名（N 张 / 迷宫卡包 ×1…）字号 px（原 text-xs = 12） */
    rewardNameFontSize: 24,
    /** 奖励名最大宽度。**默认 `'none'`**（原 `max-w-[90px]` 同样被 `index.css:56` 打死）。填 90 才启用截断。 */
    rewardNameMaxWidth: 'none',

    // ══ ⑦ 状态按钮（领取 / 已领取 / 进行中）═══════════════════════════
    /** 按钮左右内边距 px（原 px-6 = 24，四种状态共用） */
    claimBtnPadX: 24,
    /** 按钮上下内边距 px（原 py-2.5 = 10） */
    claimBtnPadY: 10,
    /** 按钮圆角 px（原 rounded-lg = 8） */
    claimBtnRadius: 8,
    /** 按钮描边 px（原 border = 1，已领取 / 进行中两个状态框用） */
    claimBtnBorderWidth: 1,
    /** 按钮字号 px（原 text-sm = 14） */
    claimBtnFontSize: 28,
    /** 「已领取」里勾图标与文字的间距 px（原 gap-2 = 8） */
    claimedGap: 8,
    /** 「已领取」勾图标 px（原 size={16}） */
    statusIconSize: 16,

    // ══ ⑧ 重置倒计时行（`CountdownTimer`，仅每日/每周页出现）═══════════
    /** 时钟图标与文字的间距 px（原 gap-2 = 8） */
    countdownGap: 8,
    /** 该行与任务列表的间距 px（原 mb-4 = 16） */
    countdownMarginBottom: 16,
    /** 文字与下划线的间距 px（原 pb-2 = 8） */
    countdownPadBottom: 8,
    /** 下划线 px（原 border-b = 1） */
    countdownBorderWidth: 1,
    /** 时钟图标 px（原 size={14}） */
    countdownIconSize: 28,
    /** 倒计时字号 px（原 text-xs = 12） */
    countdownFontSize: 24,

    // ══ ⑨ 悬停预览大图（鼠标停在奖励 chip 上时，portal 到 body）═════════
    /** 大图宽 px（原 w-80 = 320） */
    previewWidth: 320,
    /** 大图高 px（原 h-[420px] = 420） */
    previewHeight: 420,
    /** 大图圆角 px（原 rounded-xl = 12） */
    previewRadius: 12,
    /** 大图描边 px（原 border-2 = 2） */
    previewBorderWidth: 2,
};

// ══════════════════════════════════════════════════════════════════════
// 🖥️ `MISSION_UI` PC 端差异项 —— 只列「与手机端不同」的项；未列出的项两端相同
// ──────────────────────────────────────────────────────────────────────
// 依据：`_scratch/reports/g6-system.md` §2 的逐项表（git 基线 × 注释「原 XXX」双源）
// 改这里 = 改 PC 端观感；改上面 = 改手机端观感。
// ⚠️ `progressMaxWidth` / `rewardNameMaxWidth` 两个 `'none'` **不是手调**（是 `index.css:56`
//    的 `max-w-*` 规避），两端本来就该一样 ⇒ **刻意不列在这里**，别顺手补进来。
// ══════════════════════════════════════════════════════════════════════
const MISSION_UI_PC_DIFF = {
    // ══ ① 面板本体 ════════════════════════════════════════════════════
    panelWidth: 1000,             // 原 w-[1000px]
    panelHeight: 700,             // 原 h-[700px]

    // ══ ② 左侧边栏 ════════════════════════════════════════════════════
    sidebarWidth: 256,            // 原 w-64 = 256
    titleFontSize: 20,            // 原 text-xl = 20
    subtitleFontSize: 10,         // 原 text-[10px] = 10

    // ══ ③ 标签按钮 ════════════════════════════════════════════════════
    tabFontSize: 14,              // 原 text-sm = 14
    dotSize: 10,                  // 原 w-2.5 h-2.5 = 10（内外两层共用）

    // ══ ④ 右侧内容区 ══════════════════════════════════════════════════
    closeIconSize: 24,            // 原 size={24}
    pageTitleFontSize: 24,        // 原 text-2xl = 24

    // ══ ⑤ 任务列表 ════════════════════════════════════════════════════
    rowTitleFontSize: 18,         // 原 text-lg = 18
    rowDescFontSize: 14,          // 原 text-sm = 14
    progressTextFontSize: 10,     // 原 text-[10px] = 10

    // ══ ⑥ 奖励展示 ════════════════════════════════════════════════════
    goldIconSize: 20,             // 原 w-5 h-5 = 20
    rewardFallbackIconSize: 18,   // 原 size={18}
    rewardNameFontSize: 12,       // 原 text-xs = 12

    // ══ ⑦ 状态按钮 ════════════════════════════════════════════════════
    claimBtnFontSize: 14,         // 原 text-sm = 14

    // ══ ⑧ 重置倒计时行 ════════════════════════════════════════════════
    countdownIconSize: 14,        // 原 size={14}
    countdownFontSize: 12,        // 原 text-xs = 12
};

/** PC 端完整值 = 手机值为底 + PC 差异覆盖 */
const MISSION_UI_PC = { ...MISSION_UI_MOBILE, ...MISSION_UI_PC_DIFF };

/** 🖥️ PC / 📱 手机 —— 按运行平台自动二选一（平台判定在 `src/platform/tuning.ts`） */
export const MISSION_UI = pickTuning(MISSION_UI_PC, MISSION_UI_MOBILE);


// ============================================================================
// 子组件 1：大厅军需面板 (MissionPanel)
// ============================================================================

interface MissionPanelProps {
    isOpen: boolean;
    onClose: () => void;
    missionSystem: any; // ReturnType<typeof useMissionSystem>
    userSystem: any;    // 玩家系统，用于发货
}

export const MissionPanel: React.FC<MissionPanelProps> = ({ isOpen, onClose, missionSystem, userSystem }) => {
    const [activeTab, setActiveTab] = useState<MissionCategory>('daily');
    // [金光弹窗] 领取奖励后展示
    const [rewardPopup, setRewardPopup] = useState<RewardPopupData | null>(null);
    // [悬停预览] 鼠标悬停缩略图时放大
    const [hoverPreview, setHoverPreview] = useState<{ src: string; x: number; y: number } | null>(null);
    // portal 到 body 的预览需要跟随游戏缩放
    const [gameScale, setGameScale] = useState(1);
    useEffect(() => {
        const handleResize = () => {
            setGameScale(Math.min(window.innerWidth / 1680, window.innerHeight / 1050));
        };
        handleResize();
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // ESC 关闭：capture + stopImmediatePropagation 拦截 App.tsx 全局 ESC（避免误呼出设置面板）
    // [逐层退] 奖励金光弹窗打开时优先关弹窗，否则关整个任务面板
    useEffect(() => {
        if (!isOpen) return;
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.stopImmediatePropagation();
                if (rewardPopup) {
                    setRewardPopup(null);
                } else {
                    onClose();
                }
            }
        };
        window.addEventListener('keydown', handler, { capture: true });
        return () => window.removeEventListener('keydown', handler, { capture: true });
    }, [isOpen, onClose, rewardPopup]);

    if (!isOpen) return null;

    // [2026-09-08 BUG修复] 每个标签页是否有可领奖励 → 点亮对应 tab 黄点（与大厅黄点同语义：只统计面板可见的普通非 rogue 任务）
    const claimableByTab: Partial<Record<MissionCategory, boolean>> = {};
    for (const miss of MISSIONS) {
        if (miss.rogue) continue;
        if (missionSystem.progress?.[miss.id]?.status === 'completed') claimableByTab[miss.category] = true;
    }

    // 筛选当前标签页的任务，按 sort 排序
    // [fix] 由 missionSystem 决定哪些任务存在（showCondition 已在初始化时处理）
    const displayMissions = MISSIONS
        .filter(m => {
            if (m.rogue) return false; // [2026-08-29] 肉鸽专属任务由 RogueMissionPanel 展示，普通军功面板过滤
            if (m.category !== activeTab) return false;
            return !!missionSystem.progress[m.id]; // 不在 progress 中的任务不显示
        })
        .sort((a, b) => {
            const sortA = missionSystem.progress[a.id]?.sort ?? 101;
            const sortB = missionSystem.progress[b.id]?.sort ?? 101;
            return sortA - sortB; // 升序：0(待领取) → 1~100(进行中) → 101(已领取)
        });

    // 领取奖励的业务封装
    const handleClaim = (mission: typeof MISSIONS[0]) => {
        // 1. 调用大脑标记签收，并获取奖励配方
        const reward = missionSystem.claimReward(mission.id);
        if (reward) {
            // 2. 将奖励配方发给 UserSystem 提货
            if (userSystem.grantMissionReward) {
                userSystem.grantMissionReward(reward);
                eventBus.emit(GameEvents.GACHA_CONVERT);
            } else {
                console.warn("[MissionUI] UserSystem 缺失 grantMissionReward 接口！");
            }

            // 3. 组装金光弹窗数据（共享构造器，主大厅/肉鸽一致）
            setRewardPopup(buildRewardPopupData(mission.title, reward));
        }
    };

    return (
     <>
        <div className="fixed inset-0 z-[600] flex items-center justify-center font-sans select-none">
            {/* 暗影底衬 */}
            <motion.div
                className="absolute inset-0 bg-slate-950/80 backdrop-blur-md"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                onClick={() => { eventBus.emit(GameEvents.UI_BACK); onClose(); }}
            />

            {/* 面板主体 */}
            <motion.div
                className="relative bg-slate-900/90 border-blue-500/30 shadow-[0_0_80px_rgba(30,58,138,0.4)] flex overflow-hidden backdrop-blur-xl" style={{ width: MISSION_UI.panelWidth, height: MISSION_UI.panelHeight, borderWidth: MISSION_UI.panelBorderWidth, borderStyle: 'solid', borderRadius: MISSION_UI.panelRadius }}
                initial={{ scale: 0.95, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.95, opacity: 0, y: 20 }}
                transition={{ type: "spring", stiffness: 200, damping: 20 }}
            >
                {/* 内部高光与扫描线 */}
                <div className="absolute top-0 w-full bg-gradient-to-b from-blue-600/10 to-transparent pointer-events-none" style={{ height: MISSION_UI.panelHighlightHeight }} />

                {/* 左侧侧边栏 */}
                <div className="bg-slate-950/50 border-blue-500/20 flex flex-col shrink-0 relative z-10" style={{ width: MISSION_UI.sidebarWidth, borderRightWidth: MISSION_UI.sidebarBorderWidth, borderRightStyle: 'solid', padding: MISSION_UI.sidebarPad }}>
                    <div className="flex items-center" style={{ gap: MISSION_UI.brandRowGap, marginBottom: MISSION_UI.brandRowMarginBottom }}>
                        <div className="bg-blue-900/50 flex items-center justify-center border-blue-500/50 shadow-[0_0_15px_blue]" style={{ width: MISSION_UI.brandIconBoxSize, height: MISSION_UI.brandIconBoxSize, borderRadius: MISSION_UI.brandIconBoxRadius, borderWidth: MISSION_UI.brandIconBoxBorderWidth, borderStyle: 'solid' }}>
                            <Target size={MISSION_UI.brandIconSize} className="text-blue-400" />
                        </div>
                        <div>
                            <h2 className="font-black text-white tracking-widest" style={{ fontSize: MISSION_UI.titleFontSize }}>战区军功</h2>
                            <p className="text-blue-500/80 font-mono tracking-wider" style={{ fontSize: MISSION_UI.subtitleFontSize }}>COMMAND CENTER</p>
                        </div>
                    </div>

                    <div className="flex flex-col" style={{ gap: MISSION_UI.tabListGap }}>
                        <TabButton id="daily" active={activeTab} icon={<Calendar size={18} />} label="每日委派" showDot={claimableByTab.daily === true} onClick={() => { setActiveTab('daily'); eventBus.emit(GameEvents.UI_CLICK); }} />
                        <TabButton id="weekly" active={activeTab} icon={<Zap size={18} />} label="每周清剿" showDot={claimableByTab.weekly === true} onClick={() => { setActiveTab('weekly'); eventBus.emit(GameEvents.UI_CLICK); }} />
                        <TabButton id="achievement" active={activeTab} icon={<Award size={18} />} label="生涯成就" showDot={claimableByTab.achievement === true} onClick={() => { setActiveTab('achievement'); eventBus.emit(GameEvents.UI_CLICK); }} />
								<TabButton id="version" active={activeTab} icon={<Sparkles size={18} />} label="版本活动" showDot={claimableByTab.version === true} onClick={() => { setActiveTab('version'); eventBus.emit(GameEvents.UI_CLICK); }} />
                    </div>
                </div>

                {/* 右侧任务列表区 */}
                <div className="flex-1 flex flex-col relative z-10" style={{ padding: MISSION_UI.contentPad }}>
                    {/* 关闭按钮 */}
                    <button onClick={() => { onClose(); eventBus.emit(GameEvents.UI_BACK); }} className="absolute rounded-full text-blue-500/50 hover:bg-blue-900/30 hover:text-white transition-all" style={{ top: MISSION_UI.closeTop, right: MISSION_UI.closeRight, padding: MISSION_UI.closePad }}>
                        <X size={MISSION_UI.closeIconSize} />
                    </button>

                    <h3 className="font-black text-white border-white/10" style={{ fontSize: MISSION_UI.pageTitleFontSize, marginBottom: MISSION_UI.pageTitleMarginBottom, borderBottomWidth: MISSION_UI.pageTitleBorderWidth, borderBottomStyle: 'solid', paddingBottom: MISSION_UI.pageTitlePadBottom }}>
                        {activeTab === 'daily' ? '每日委派 (DAILY)' : activeTab === 'weekly' ? '每周清剿 (WEEKLY)' : activeTab === 'version' ? '版本活动 (VERSION)' : '生涯成就 (ACHIEVEMENT)'}
                    </h3>

                    {activeTab !== 'achievement' && activeTab !== 'version' && <CountdownTimer category={activeTab as 'daily' | 'weekly'} />}

                    <div className="flex-1 overflow-y-auto custom-scrollbar" style={{ paddingRight: MISSION_UI.listPadRight, display: 'flex', flexDirection: 'column', gap: MISSION_UI.listGap }}>
                        {displayMissions.map(mission => {
                            const prog: MissionProgress = missionSystem.progress[mission.id] || { current: 0, target: mission.targetCount, status: 'ongoing' };
                            const isCompleted = prog.status === 'completed';
                            const isClaimed = prog.status === 'claimed';
                            const percent = Math.min(100, (prog.current / prog.target) * 100);

                            return (
                                <div key={mission.id} className={`relative flex items-center justify-between transition-all duration-300 ${
                                    isClaimed ? 'bg-slate-900/50 border-white/5 opacity-50 grayscale' :
                                    isCompleted ? 'bg-blue-900/20 border-yellow-500/50 shadow-[0_0_20px_rgba(234,179,8,0.1)]' :
                                    'bg-slate-800/50 border-blue-500/20 hover:border-blue-500/50'
                                }`} style={{ padding: MISSION_UI.rowPad, borderRadius: MISSION_UI.rowRadius, borderWidth: MISSION_UI.rowBorderWidth, borderStyle: 'solid' }}>

                                    {/* 左侧信息 */}
                                    <div className="flex flex-col flex-1" style={{ gap: MISSION_UI.rowLeftGap, paddingRight: MISSION_UI.rowLeftPadRight }}>
                                        <h4 className={`font-bold ${isCompleted && !isClaimed ? 'text-yellow-400' : 'text-white'}`} style={{ fontSize: MISSION_UI.rowTitleFontSize }}>{mission.title}</h4>
                                        <p className="text-gray-400 font-medium" style={{ fontSize: MISSION_UI.rowDescFontSize }}>{mission.description}</p>

                                        {!mission.rewardDirect && (<>
                                        {/* 进度条 */}
                                        <div className="w-full bg-black/50 rounded-full overflow-hidden border-white/10 relative" style={{ marginTop: MISSION_UI.progressMarginTop, maxWidth: MISSION_UI.progressMaxWidth, height: MISSION_UI.progressHeight, borderWidth: MISSION_UI.progressBorderWidth, borderStyle: 'solid' }}>
                                            <motion.div
                                                className={`absolute left-0 top-0 h-full ${isCompleted ? 'bg-yellow-500' : 'bg-blue-500'}`}
                                                initial={{ width: 0 }}
                                                animate={{ width: `${percent}%` }}
                                                transition={{ duration: 0.5, ease: "easeOut" }}
                                            />
                                        </div>
                                        <span className="font-mono text-gray-500" style={{ fontSize: MISSION_UI.progressTextFontSize, marginTop: MISSION_UI.progressTextMarginTop }}>
                                            PROGRESS: {prog.current} / {prog.target}
                                        </span>
                                        </>)}
                                    </div>

                                    {/* 右侧奖励与按钮 */}
                                    <div className="flex items-center shrink-0 justify-end" style={{ gap: MISSION_UI.rowRightGap, minWidth: MISSION_UI.rowRightMinWidth }}>
                                        {/* 奖励展示 */}
                                        <div className="flex flex-col items-center justify-center">
                                            {(() => {
                                                if (mission.reward.type === 'card') {
                                                    const cardKeys = mission.reward.cardKeys || [];
                                                    const firstKey = cardKeys[0];
                                                    const previewSrc = getCardRewardImage(firstKey);
                                                    return (
                                                        <div
                                                            className="flex items-center bg-black/40 border-green-500/30 cursor-pointer" style={{ gap: MISSION_UI.chipGap, paddingLeft: MISSION_UI.chipPadX, paddingRight: MISSION_UI.chipPadX, paddingTop: MISSION_UI.chipPadY, paddingBottom: MISSION_UI.chipPadY, borderRadius: MISSION_UI.chipRadius, borderWidth: MISSION_UI.chipBorderWidth, borderStyle: 'solid', minWidth: MISSION_UI.chipMinWidth }}
                                                            onMouseEnter={(e) => {
                                                                if (previewSrc) {
                                                                    const rect = e.currentTarget.getBoundingClientRect();
                                                                    setHoverPreview({ src: previewSrc, x: rect.right + 12, y: rect.top - 30 });
                                                                }
                                                            }}
                                                            onMouseMove={(e) => {
                                                                setHoverPreview(prev => prev ? { ...prev, x: e.clientX + 18, y: e.clientY - 10 } : null);
                                                            }}
                                                            onMouseLeave={() => setHoverPreview(null)}
                                                        >
                                                            <div className="overflow-hidden shrink-0 bg-slate-900 border-green-500/50" style={{ width: MISSION_UI.rewardThumbSize, height: MISSION_UI.rewardThumbSize, borderRadius: MISSION_UI.rewardThumbRadius, borderWidth: MISSION_UI.rewardThumbBorderWidth, borderStyle: 'solid' }}>
                                                                <img src={previewSrc} className="w-full h-full object-cover" alt="卡牌" />
                                                            </div>
                                                            <div className="flex flex-col items-start overflow-hidden">
                                                                <span className="font-bold text-green-500/80 tracking-widest uppercase" style={{ fontSize: MISSION_UI.rewardTagFontSize }}>CARD</span>
                                                                <span className="font-bold text-green-300 truncate" style={{ fontSize: MISSION_UI.rewardNameFontSize, maxWidth: MISSION_UI.rewardNameMaxWidth }}>{cardKeys.length} 张</span>
                                                            </div>
                                                        </div>
                                                    );
                                                }

                                                // [2026-09-20 1.0.16 版本福利] 迷宫卡包奖励展示（此前无此类型 → 会掉进"未定资产"兜底）
                                                if (mission.reward.type === 'pack') {
                                                    return (
                                                        <div className="flex items-center bg-black/40 border-yellow-500/30" style={{ gap: MISSION_UI.chipGap, paddingLeft: MISSION_UI.chipPadX, paddingRight: MISSION_UI.chipPadX, paddingTop: MISSION_UI.chipPadY, paddingBottom: MISSION_UI.chipPadY, borderRadius: MISSION_UI.chipRadius, borderWidth: MISSION_UI.chipBorderWidth, borderStyle: 'solid', minWidth: MISSION_UI.chipMinWidth }}>
                                                            <Gift size={MISSION_UI.rewardFallbackIconSize} className="text-yellow-400 shrink-0" />
                                                            <div className="flex flex-col items-start overflow-hidden">
                                                                <span className="font-bold text-yellow-500/80 tracking-widest uppercase" style={{ fontSize: MISSION_UI.rewardTagFontSize }}>PACK</span>
                                                                <span className="font-bold text-yellow-300" style={{ fontSize: MISSION_UI.rewardNameFontSize }}>迷宫卡包 ×{mission.reward.amount ?? 1}</span>
                                                            </div>
                                                        </div>
                                                    );
                                                }

                                                // [2026-09-29 程拍板] 万能神格碎片奖励展示（橙菱形图标）
                                                if (mission.reward.type === 'universalShard') {
                                                    return (
                                                        <div className="flex items-center bg-black/40 border-amber-500/30" style={{ gap: MISSION_UI.chipGap, paddingLeft: MISSION_UI.chipPadX, paddingRight: MISSION_UI.chipPadX, paddingTop: MISSION_UI.chipPadY, paddingBottom: MISSION_UI.chipPadY, borderRadius: MISSION_UI.chipRadius, borderWidth: MISSION_UI.chipBorderWidth, borderStyle: 'solid', minWidth: MISSION_UI.chipMinWidth }}>
                                                            {/* [2026-10-20 莉莉子 🎨] 万能神格碎片插画（26px；20px 时缩略图看不清橙色菱形轮廓。兜底 ShardIcon 同步 26 保持失败态大小一致）
                                                                ⚠️ 该图**带透明通道** ⇒ 兜底图标平时 opacity-0，只有加载失败才显形，避免透过插画露出来 */}
                                                            <span className="relative shrink-0" style={{ width: 26, height: 26 }}>
                                                                <span data-art-fallback className="absolute inset-0 opacity-0">
                                                                    <ShardIcon size={26} />
                                                                </span>
                                                                <img
                                                                    src={UNIVERSAL_SHARD_ART}
                                                                    alt="万能神格碎片"
                                                                    title="万能神格碎片（可替代任何天启者的专属碎片）"
                                                                    className="relative w-full h-full object-contain"
                                                                    draggable={false}
                                                                    onError={e => {
                                                                        const img = e.currentTarget;
                                                                        img.style.visibility = 'hidden';
                                                                        const fb = img.parentElement?.querySelector<HTMLElement>('[data-art-fallback]');
                                                                        if (fb) fb.style.opacity = '1';
                                                                    }}
                                                                />
                                                            </span>
                                                            <div className="flex flex-col items-start overflow-hidden">
                                                                <span className="font-bold text-amber-500/80 tracking-widest uppercase" style={{ fontSize: MISSION_UI.rewardTagFontSize }}>SHARD</span>
                                                                <span className="font-bold text-amber-200" style={{ fontSize: MISSION_UI.rewardNameFontSize }}>万能碎片 ×{mission.reward.amount ?? 0}</span>
                                                            </div>
                                                        </div>
                                                    );
                                                }

                                                if (mission.reward.type === 'dataGold') {
                                                    return (
                                                        <div className="flex items-center bg-black/40 border-purple-500/30" style={{ gap: MISSION_UI.goldChipGap, paddingLeft: MISSION_UI.chipPadX, paddingRight: MISSION_UI.chipPadX, paddingTop: MISSION_UI.chipPadY, paddingBottom: MISSION_UI.chipPadY, borderRadius: MISSION_UI.chipRadius, borderWidth: MISSION_UI.chipBorderWidth, borderStyle: 'solid' }}>
                                                            <img src={CURRENCY_ICONS.dataGold} style={{ width: MISSION_UI.goldIconSize, height: MISSION_UI.goldIconSize }} alt="数据金" />
                                                            <span className="font-mono font-bold text-purple-300">{mission.reward.amount}</span>
                                                        </div>
                                                    );
                                                }

                                                // [2026-09-08] 武装奖励：图标 + 名称 + ×数量 + 悬停大图
                                                if (mission.reward.type === 'armament' && mission.reward.armamentId) {
                                                    const armDef = getEquipmentById(mission.reward.armamentId);
                                                    const armIcon = armDef?.icon ?? '';
                                                    const armName = armDef?.name ?? mission.reward.armamentId;
                                                    const armAmount = mission.reward.amount ?? 1;
                                                    return (
                                                        <div
                                                            className="flex items-center bg-black/40 border-purple-500/30 cursor-pointer" style={{ gap: MISSION_UI.chipGap, paddingLeft: MISSION_UI.chipPadX, paddingRight: MISSION_UI.chipPadX, paddingTop: MISSION_UI.chipPadY, paddingBottom: MISSION_UI.chipPadY, borderRadius: MISSION_UI.chipRadius, borderWidth: MISSION_UI.chipBorderWidth, borderStyle: 'solid', minWidth: MISSION_UI.chipMinWidth }}
                                                            onMouseEnter={(e) => {
                                                                if (armIcon) {
                                                                    const rect = e.currentTarget.getBoundingClientRect();
                                                                    setHoverPreview({ src: armIcon, x: rect.right + 12, y: rect.top - 30 });
                                                                }
                                                            }}
                                                            onMouseMove={(e) => {
                                                                setHoverPreview(prev => prev ? { ...prev, x: e.clientX + 18, y: e.clientY - 10 } : null);
                                                            }}
                                                            onMouseLeave={() => setHoverPreview(null)}
                                                        >
                                                            {armIcon ? (
                                                                <div className="overflow-hidden shadow-sm shrink-0 bg-slate-900 border-purple-500/50" style={{ width: MISSION_UI.rewardThumbSize, height: MISSION_UI.rewardThumbSize, borderRadius: MISSION_UI.rewardThumbRadius, borderWidth: MISSION_UI.rewardThumbBorderWidth, borderStyle: 'solid' }}>
                                                                    <img src={armIcon} className="w-full h-full object-cover" alt={armName} />
                                                                </div>
                                                            ) : (
                                                                <Gift size={MISSION_UI.rewardFallbackIconSize} className="text-purple-400 shrink-0" />
                                                            )}
                                                            <div className="flex flex-col items-start overflow-hidden">
                                                                <span className="font-bold text-purple-400/80 tracking-widest uppercase" style={{ fontSize: MISSION_UI.rewardTagFontSize }}>ARMAMENT {armAmount > 1 && `×${armAmount}`}</span>
                                                                <span className="font-bold text-purple-300 truncate" style={{ fontSize: MISSION_UI.rewardNameFontSize, maxWidth: MISSION_UI.rewardNameMaxWidth }} title={armName}>{armName}</span>
                                                            </div>
                                                        </div>
                                                    );
                                                }

                                                // [核心重构] 动态向调度局拉取绝密外观的名称与高清缩略图！
                                                let cosmeticPreview = null;
                                                let cosmeticName = '未定资产';

                                                if (mission.reward.cosmeticId) {
                                                    const config = getMissionItems().find(item => item.missionId === mission.reward.cosmeticId);
                                                    if (config) {
                                                        cosmeticName = config.name;
                                                        if (config.type === 'skin' && config.cardKey && config.skinId !== undefined) {
                                                            cosmeticPreview = getSkinImage(config.cardKey, config.skinId);
                                                        } else if (config.type === 'cardBack' && config.index !== undefined) {
                                                            cosmeticPreview = PERSONALIZATION_ASSETS.cardBacks[config.index];
                                                        }
                                                    }
                                                }

                                                return (
                                                    <div
                                                        className="flex items-center bg-black/40 border-yellow-500/30 cursor-pointer" style={{ gap: MISSION_UI.chipGap, paddingLeft: MISSION_UI.chipPadX, paddingRight: MISSION_UI.chipPadX, paddingTop: MISSION_UI.chipPadY, paddingBottom: MISSION_UI.chipPadY, borderRadius: MISSION_UI.chipRadius, borderWidth: MISSION_UI.chipBorderWidth, borderStyle: 'solid', minWidth: MISSION_UI.chipMinWidth }}
                                                        onMouseEnter={(e) => {
                                                            const rect = e.currentTarget.getBoundingClientRect();
                                                            setHoverPreview({ src: cosmeticPreview ?? '', x: rect.right + 12, y: rect.top - 30 });
                                                        }}
                                                        onMouseMove={(e) => {
                                                            setHoverPreview(prev => prev ? { ...prev, x: e.clientX + 18, y: e.clientY - 10 } : null);
                                                        }}
                                                        onMouseLeave={() => setHoverPreview(null)}
                                                    >
                                                        {cosmeticPreview ? (
                                                            <div className="overflow-hidden shadow-sm shrink-0 bg-slate-900 border-yellow-500/50" style={{ width: MISSION_UI.rewardThumbSize, height: MISSION_UI.rewardThumbSize, borderRadius: MISSION_UI.rewardThumbRadius, borderWidth: MISSION_UI.rewardThumbBorderWidth, borderStyle: 'solid' }}>
                                                                <img src={cosmeticPreview} className="w-full h-full object-cover" alt={cosmeticName} />
                                                            </div>
                                                        ) : (
                                                            <Gift size={MISSION_UI.rewardFallbackIconSize} className="text-yellow-400 shrink-0" />
                                                        )}
                                                        <div className="flex flex-col items-start overflow-hidden">
                                                            <span className="font-bold text-yellow-500/80 tracking-widest uppercase" style={{ fontSize: MISSION_UI.rewardTagFontSize }}>
                                                                {mission.reward.type === 'skin' ? 'SKIN' : 'CARDBACK'}
                                                            </span>
                                                            <span className="font-bold text-yellow-400 truncate" style={{ fontSize: MISSION_UI.rewardNameFontSize, maxWidth: MISSION_UI.rewardNameMaxWidth }} title={cosmeticName}>
                                                                {cosmeticName}
                                                            </span>
                                                        </div>
                                                    </div>
                                                );
                                            })()}
                                        </div>

                                        {/* 状态按钮 */}
                                        {mission.rewardDirect && !isClaimed ? (
                                            <button
                                                onClick={() => { eventBus.emit(GameEvents.UI_CLICK); handleClaim(mission); }}
                                                className="bg-green-500 hover:bg-green-400 text-black font-black shadow-[0_0_15px_rgba(34,197,94,0.5)] transition-all animate-pulse-slow active:scale-95" style={{ paddingLeft: MISSION_UI.claimBtnPadX, paddingRight: MISSION_UI.claimBtnPadX, paddingTop: MISSION_UI.claimBtnPadY, paddingBottom: MISSION_UI.claimBtnPadY, borderRadius: MISSION_UI.claimBtnRadius, fontSize: MISSION_UI.claimBtnFontSize }}
                                            >
                                                领取奖励
                                            </button>
                                        ) : isClaimed ? (
                                            <div className="bg-black/50 text-gray-500 font-bold border-gray-700 flex items-center" style={{ paddingLeft: MISSION_UI.claimBtnPadX, paddingRight: MISSION_UI.claimBtnPadX, paddingTop: MISSION_UI.claimBtnPadY, paddingBottom: MISSION_UI.claimBtnPadY, borderRadius: MISSION_UI.claimBtnRadius, fontSize: MISSION_UI.claimBtnFontSize, borderWidth: MISSION_UI.claimBtnBorderWidth, borderStyle: 'solid', gap: MISSION_UI.claimedGap }}>
                                                <CheckCircle size={MISSION_UI.statusIconSize} /> 已领取
                                            </div>
                                        ) : isCompleted ? (
                                            <button
                                                onClick={() => { eventBus.emit(GameEvents.UI_CLICK); handleClaim(mission); }}
                                                className="bg-yellow-500 hover:bg-yellow-400 text-black font-black shadow-[0_0_15px_rgba(234,179,8,0.5)] transition-all animate-pulse-slow active:scale-95" style={{ paddingLeft: MISSION_UI.claimBtnPadX, paddingRight: MISSION_UI.claimBtnPadX, paddingTop: MISSION_UI.claimBtnPadY, paddingBottom: MISSION_UI.claimBtnPadY, borderRadius: MISSION_UI.claimBtnRadius, fontSize: MISSION_UI.claimBtnFontSize }}
                                            >
                                                领取奖励
                                            </button>
                                        ) : (
                                            <div className="bg-slate-800 text-gray-500 font-bold border-transparent" style={{ paddingLeft: MISSION_UI.claimBtnPadX, paddingRight: MISSION_UI.claimBtnPadX, paddingTop: MISSION_UI.claimBtnPadY, paddingBottom: MISSION_UI.claimBtnPadY, borderRadius: MISSION_UI.claimBtnRadius, fontSize: MISSION_UI.claimBtnFontSize, borderWidth: MISSION_UI.claimBtnBorderWidth, borderStyle: 'solid' }}>
                                                进行中
                                            </div>
                                        )}
                                    </div>

                                </div>
                            );
                        })}
                    </div>
                </div>
            </motion.div>
        </div>

        {/* 金光领取弹窗（共享组件：主大厅/肉鸽委派复用，视觉与原内联一致） */}
        {rewardPopup && <RewardClaimPopup data={rewardPopup} onClose={() => setRewardPopup(null)} />}

        {/* 悬停预览大图 */}
        {hoverPreview && createPortal(
            <motion.div
                className="fixed pointer-events-none z-[800]"
                style={{ left: hoverPreview.x, top: hoverPreview.y }}
                // follow 模式 portal 出去后需要跟随游戏缩放，inner div 负责缩放内容
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ type: "spring", stiffness: 300, damping: 20 }}
            >
                <div className="overflow-hidden border-yellow-500/50 shadow-[0_0_30px_rgba(0,0,0,0.9)] bg-slate-900"
                     style={{width: MISSION_UI.previewWidth, height: MISSION_UI.previewHeight, borderRadius: MISSION_UI.previewRadius, borderWidth: MISSION_UI.previewBorderWidth, borderStyle: 'solid', transform: `scale(${gameScale})`, transformOrigin: 'top left' }}>
                    <img src={hoverPreview.src} className="w-full h-full object-cover" />
                </div>
            </motion.div>,
            document.body
        )}
     </>
    );
};

// 侧边栏按钮微件（[2026-09-08] showDot：该分类有可领奖励 → 右侧脉冲黄点）
const TabButton = ({ id, active, icon, label, onClick, showDot = false }: any) => {
    const isActive = active === id;
    return (
        <button
            onClick={onClick}
            className={`relative w-full flex items-center transition-all duration-300 ${isActive ? 'bg-blue-600 text-white shadow-lg' : 'text-blue-500/60 hover:bg-blue-900/30 hover:text-blue-300'}`} style={{ paddingTop: MISSION_UI.tabPadY, paddingBottom: MISSION_UI.tabPadY, paddingLeft: MISSION_UI.tabPadX, paddingRight: MISSION_UI.tabPadX, gap: MISSION_UI.tabGap, borderRadius: MISSION_UI.tabRadius }}
        >
            {icon}
            <span className="font-bold tracking-widest" style={{ fontSize: MISSION_UI.tabFontSize }}>{label}</span>
            {showDot && (
                <span className="relative ml-auto flex" style={{ height: MISSION_UI.dotSize, width: MISSION_UI.dotSize }}>
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                    <span className="relative inline-flex rounded-full bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.9)]" style={{ height: MISSION_UI.dotSize, width: MISSION_UI.dotSize }} />
                </span>
            )}
        </button>
    );
};


// ============================================================================
// 子组件 2：结算滑出提示队列 (MissionToast)
// ============================================================================

interface MissionToastProps {
    updates: MissionUpdateResult[];
    onFinish: () => void;
}

export const MissionToast: React.FC<MissionToastProps> = ({ updates, onFinish }) => {
    const [currentIndex, setCurrentIndex] = useState(0);

    // 内部状态机：控制每一个 Toast 显示 2.5 秒后切换下一个
    useEffect(() => {
        if (updates.length === 0) return;

        if (currentIndex >= updates.length) {
            onFinish(); // 队列播放完毕，通知父组件销毁
            return;
        }

        const timer = setTimeout(() => {
            setCurrentIndex(prev => prev + 1);
        }, 2500);

        return () => clearTimeout(timer);
    }, [currentIndex, updates, onFinish]);

    if (updates.length === 0 || currentIndex >= updates.length) return null;

    const currentUpdate = updates[currentIndex];
    const isCompleted = currentUpdate.justCompleted;

    return (
        <div className="absolute top-20 left-8 z-[1000] pointer-events-none">
            <AnimatePresence mode="wait">
                <motion.div
                    key={currentUpdate.missionId}
                    initial={{ x: -300, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    exit={{ x: -300, opacity: 0 }}
                    transition={{ type: "spring", stiffness: 300, damping: 25 }}
                    className={`relative w-[340px] p-4 rounded-xl border-l-4 shadow-[0_10px_30px_rgba(0,0,0,0.8)] backdrop-blur-md flex items-center gap-4 ${
                        isCompleted
                            ? 'bg-yellow-900/80 border-yellow-400'
                            : 'bg-blue-950/80 border-blue-500'
                    }`}
                >
                    {/* 左侧图标 */}
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center border ${
                        isCompleted ? 'bg-yellow-500/20 border-yellow-400 text-yellow-400' : 'bg-blue-500/20 border-blue-400 text-blue-400'
                    }`}>
                        {isCompleted ? <Award size={20} /> : <Target size={20} />}
                    </div>

                    {/* 中间信息 */}
                    <div className="flex-1 flex flex-col min-w-0">
                        <span className="text-[10px] font-bold tracking-widest uppercase text-gray-400">
                            {isCompleted ? 'ACHIEVEMENT UNLOCKED' : 'MISSION UPDATE'}
                        </span>
                        <span className={`text-sm font-bold truncate ${isCompleted ? 'text-yellow-400' : 'text-white'}`}>
                            {currentUpdate.title}
                        </span>

                        {/* 进度数值与划线特效 */}
                        <div className="flex items-center mt-1 relative">
                            {/* [核心特效] 如果刚刚完成，播放一道划过数字的特效 */}
                            <span className={`text-xs font-mono font-bold transition-all relative ${isCompleted ? 'text-gray-500' : 'text-blue-300'}`}>
                                {currentUpdate.current} / {currentUpdate.target}
                                {isCompleted && (
                                    <motion.div
                                        className="absolute left-0 top-1/2 w-full h-[2px] bg-yellow-500"
                                        initial={{ width: 0 }}
                                        animate={{ width: '100%' }}
                                        transition={{ duration: 0.3, delay: 0.2 }}
                                    />
                                )}
                            </span>

                            {/* [核心特效] 金色大勾砸下 */}
                            {isCompleted && (
                                <motion.div
                                    className="ml-2"
                                    initial={{ scale: 0, opacity: 0, rotate: -45 }}
                                    animate={{ scale: 1, opacity: 1, rotate: 0 }}
                                    transition={{ type: "spring", stiffness: 400, damping: 10, delay: 0.4 }}
                                >
                                    <Check className="text-yellow-400 drop-shadow-[0_0_5px_yellow]" size={18} strokeWidth={4} />
                                </motion.div>
                            )}
                        </div>
                    </div>
                </motion.div>
            </AnimatePresence>
        </div>
    );
};

const CountdownTimer = ({ category }: { category: 'daily' | 'weekly' }) => {
    const [timeLeft, setTimeLeft] = useState('');
    useEffect(() => {
        const calc = () => {
            const now = new Date();
            let target;
            if (category === 'daily') {
                target = new Date(now);
                target.setHours(now.getHours() >= 6 ? 24 + 6 : 6, 0, 0, 0);
            } else {
                target = new Date(now);
                const d = now.getDay();
                const add = d === 0 ? 1 : d === 1 && now.getHours() < 6 ? 0 : 8 - d;
                target.setDate(now.getDate() + add);
                target.setHours(6, 0, 0, 0);
            }
            const diff = target.getTime() - now.getTime();
            if (diff <= 0) return '即将重置...';
            const h = Math.floor(diff / 3600000);
            const m = Math.floor((diff % 3600000) / 60000);
            const s = Math.floor((diff % 60000) / 1000);
            return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
        };
        setTimeLeft(calc());
        const t = setInterval(() => setTimeLeft(calc()), 1000);
        return () => clearInterval(t);
    }, [category]);
    return (
        <div className="flex items-center text-blue-400/80 border-white/5" style={{ gap: MISSION_UI.countdownGap, marginBottom: MISSION_UI.countdownMarginBottom, paddingBottom: MISSION_UI.countdownPadBottom, borderBottomWidth: MISSION_UI.countdownBorderWidth, borderBottomStyle: 'solid' }}>
            <Clock size={MISSION_UI.countdownIconSize} />
            <span className="font-mono tracking-wider" style={{ fontSize: MISSION_UI.countdownFontSize }}>
                {category === 'daily' ? '每日重置倒计时' : '每周重置倒计时'}：<span className="text-white font-bold">{timeLeft}</span>
            </span>
        </div>
    );
};
