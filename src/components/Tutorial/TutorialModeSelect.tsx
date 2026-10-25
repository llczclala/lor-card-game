import React from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, Home, Sword, BookOpen, Lock } from 'lucide-react';
import { eventBus, GameEvents } from '../../utils/eventBus';
import { EXAM_CATEGORIES } from '../../data/tutorialStages';
import type { ExamCategoryId } from '../../data/tutorialStages';
import { pickTuning } from '../../platform/tuning';

// ══════════════════════════════════════════════════════════════════════
// 🎛️ 战术考核 · **考核分类选择**（`TutorialModeSelect`）· 视觉调参区（**程微调就改这里**）
// ──────────────────────────────────────────────────────────────────────
// 这一屏 = 模式选择点「战术考核」进来那一屏：正中三张分类卡（基础 / 关键词 / 天启者）
//   + 上方「战术考核」标题 + 右上角「返回大厅 / 返回模式选择」两个圆钮 + 底部一行提示。
// 管：①右上角两个圆钮 ②标题与副标题 ③三张分类卡（宽 / 高 / 圆角 / 描边 / 顶条 / 大图标 /
//   内容区 / 分类名 / 描述 / 关卡数 / 锁定遮罩）+ 卡片行间距 ④底部提示，共 **26 项**。
// 改完存盘即生效（HMR —— 雷电/电脑上 1~3 秒看到，不用出包）。
// 命名与用法**对齐 `TITLE_UI`**：值是**绝对画布 px**、直接进 style；注释标注**原 Tailwind 类**。
// ⚠️ 本屏**没有** `max-w-*` / `vh` / `vw`，天生合铁律（1680×1050 画布）。
// ⚠️ 刻意**没搬**的类（都不是可调尺寸）：`w-full` / `h-full`（铺满）· `inset-0` ·
//   `rounded-full`（圆钮恒 9999px）· `top-0` / `left-0`（= 0 的锚点）· `z-[999]` / `z-10` ·
//   `group` · `transition-*` · `tracking-*` · `drop-shadow-*` · `opacity-*` / `grayscale` /
//   `hover:scale-105`（状态反馈）· 全部 `bg-*` / `border-*` 配色 —— 三张卡的配色仍走
//   `CATEGORY_THEMES`（它存的是**类名**，属配色不属尺寸）⇒ 本块只管尺寸，别把它并进来。
// ⚠️ 口径：字号只搬 `fontSize`、**不配写死 `lineHeight`**（规范 §6）；因此这几处字号的行高由
//   Tailwind `text-*` 的配套行高改为继承 1.5（项目既定口径，有意如此，别回改成成对行高）。
// ══════════════════════════════════════════════════════════════════════
// 🖥️📱 【双平台】`TUTORIAL_MODE_UI_MOBILE`（手机端）+ `TUTORIAL_MODE_UI_PC_DIFF`（PC 端差异项，见本块下方）
const TUTORIAL_MODE_UI_MOBILE = {
    // ══ ① 右上角：返回大厅 / 返回模式选择 ═════════════════════════════
    /** 整组距顶 px（原 top-8 = 32） */
    cornerTop: 32,
    /** 整组距右 px（原 right-8 = 32） */
    cornerRight: 32,
    /** 两个圆钮之间的间距 px（原 gap-3 = 12） */
    cornerGap: 12,
    /** 圆钮内边距 px（原 p-3 = 12） */
    cornerBtnPad: 12,
    /** 圆钮描边 px（原 border = 1） */
    cornerBtnBorderWidth: 1,
    /** 圆钮里的图标 px（原 <Home size={24} /> / <ArrowLeft size={24} /> = 24） */
    cornerIconSize: 48,

    // ══ ② 标题：战术考核 + 副标题 ═════════════════════════════════════
    /** 标题块下距 px（原 mb-12 = 48） */
    titleMarginBottom: 48,
    /** 「战术考核」字号 px（原 text-4xl = 36） */
    titleFontSize: 72,
    /** 副标题字号 px（原 text-sm = 14） */
    subtitleFontSize: 28,
    /** 副标题上距 px（原 mt-2 = 8） */
    subtitleMarginTop: 8,

    // ══ ③ 三张分类卡（基础 / 关键词 / 天启者） ════════════════════════
    /** 卡片行间距 px（原 gap-8 = 32） */
    rowGap: 32,
    /** 单卡宽 px（原 w-72 = 288） */
    cardWidth: 488,
    /** 单卡高 px（原 h-96 = 384） */
    cardHeight: 584,
    /** 单卡圆角 px（原 rounded-3xl = 24） */
    cardRadius: 24,
    /** 单卡描边 px（原 border = 1 · 颜色仍走 `CATEGORY_THEMES.border`） */
    cardBorderWidth: 1,
    /** 卡片顶部装饰条高 px（原 h-1.5 = 6） */
    cardTopBarHeight: 6,
    /** 卡片中央分类大图标 px（原 `CATEGORY_ICONS` 里 <Sword size={36} /> 等三个 = 36） */
    cardIconSize: 72,
    /** 卡片内容区内边距 px（原 p-8 = 32） */
    cardPad: 32,
    /** 卡片内容区行距 px（原 gap-6 = 24） */
    cardGap: 24,
    /** 分类名字号 px（原 text-2xl = 24） */
    cardNameFontSize: 48,
    /** 分类描述字号 px（原 text-sm = 14） */
    cardDescFontSize: 28,
    /** 「N 个考核关卡」距卡底 px（原 bottom-8 = 32） */
    cardCountBottom: 32,
    /** 「N 个考核关卡」字号 px（原 text-xs = 12） */
    cardCountFontSize: 24,
    /** 锁定遮罩「COMING SOON」字号 px（原 text-sm = 14） */
    lockTextFontSize: 28,

    // ══ ④ 底部提示 ═══════════════════════════════════════════════════
    /** 距底 px（原 bottom-8 = 32） */
    footerBottom: 32,
    /** 字号 px（原 text-xs = 12） */
    footerFontSize: 24,
};

// ══════════════════════════════════════════════════════════════════════
// 🖥️ `TUTORIAL_MODE_UI` PC 端差异项 —— 只列「与手机端不同」的项；未列出的项两端相同
// ──────────────────────────────────────────────────────────────────────
// 依据：`_scratch/reports/g6-system.md` §2 的逐项表（git 基线 × 注释「原 XXX」双源）。
// ⚠️ 本块全 11 项差异都在**工作区未提交改动**里（该文件最后一次提交是抽取提交 `12dab176`，
//    之后没有 tuning 提交）—— 数值是**真实的**手调，照做；`git diff` 可复现。
// 改这里 = 改 PC 端观感；改上面 = 改手机端观感。
// ══════════════════════════════════════════════════════════════════════
const TUTORIAL_MODE_UI_PC_DIFF = {
    // ══ ① 右上角两个圆钮 ═══════════════════════════════════════════════
    cornerIconSize: 24,           // 原 <Home size={24} /> / <ArrowLeft size={24} /> = 24

    // ══ ② 标题与副标题 ═════════════════════════════════════════════════
    titleFontSize: 36,            // 原 text-4xl = 36
    subtitleFontSize: 14,         // 原 text-sm = 14

    // ══ ③ 三张分类卡 ═══════════════════════════════════════════════════
    cardWidth: 288,               // 原 w-72 = 288
    cardHeight: 384,              // 原 h-96 = 384
    cardIconSize: 36,             // 原 `CATEGORY_ICONS` 里 <Sword size={36} /> 等三个 = 36
    cardNameFontSize: 24,         // 原 text-2xl = 24
    cardDescFontSize: 14,         // 原 text-sm = 14
    cardCountFontSize: 12,        // 原 text-xs = 12
    lockTextFontSize: 14,         // 原 text-sm = 14

    // ══ ④ 底部提示 ═════════════════════════════════════════════════════
    footerFontSize: 12,           // 原 text-xs = 12
};

/** PC 端完整值 = 手机值为底 + PC 差异覆盖 */
const TUTORIAL_MODE_UI_PC = { ...TUTORIAL_MODE_UI_MOBILE, ...TUTORIAL_MODE_UI_PC_DIFF };

/** 🖥️ PC / 📱 手机 —— 按运行平台自动二选一（平台判定在 `src/platform/tuning.ts`） */
export const TUTORIAL_MODE_UI = pickTuning(TUTORIAL_MODE_UI_PC, TUTORIAL_MODE_UI_MOBILE);

interface TutorialModeSelectProps {
    onSelectCategory: (categoryId: ExamCategoryId) => void;
    onBack: () => void;
    onBackToLobby?: () => void; // [2026-08-07] 直达大厅
}

/** 分类图标映射 */
const CATEGORY_ICONS: Record<string, React.ReactNode> = {
    basic: <Sword size={TUTORIAL_MODE_UI.cardIconSize} />,
    keyword: <BookOpen size={TUTORIAL_MODE_UI.cardIconSize} />,
    xx: <Lock size={TUTORIAL_MODE_UI.cardIconSize} />,
};

/** 分类主题色 */
const CATEGORY_THEMES: Record<string, {
    border: string;
    borderHover: string;
    bg: string;
    bgHover: string;
    glow: string;
    accent: string;
}> = {
    basic: {
        border: 'border-blue-500/30',
        borderHover: 'hover:border-blue-400',
        bg: 'from-blue-900/40 to-slate-900/60',
        bgHover: 'hover:from-blue-900/60 hover:to-slate-900/80',
        glow: 'shadow-[0_0_30px_rgba(59,130,246,0.3)]',
        accent: 'text-blue-400',
    },
    keyword: {
        border: 'border-purple-500/30',
        borderHover: 'hover:border-purple-400',
        bg: 'from-purple-900/40 to-slate-900/60',
        bgHover: 'hover:from-purple-900/60 hover:to-slate-900/80',
        glow: 'shadow-[0_0_30px_rgba(147,51,234,0.3)]',
        accent: 'text-purple-400',
    },
    xx: {
        border: 'border-gray-600/30',
        borderHover: 'hover:border-gray-500/50',
        bg: 'from-gray-800/40 to-slate-900/60',
        bgHover: 'hover:from-gray-800/60 hover:to-slate-900/80',
        glow: 'shadow-[0_0_30px_rgba(100,100,100,0.1)]',
        accent: 'text-gray-500',
    },
};

export const TutorialModeSelect: React.FC<TutorialModeSelectProps> = ({
    onSelectCategory,
    onBack,
    onBackToLobby,
}) => {
    return (
        <div className="w-full h-full flex flex-col items-center justify-center bg-black font-sans select-none text-white overflow-hidden relative">
            {/* 背景氛围 */}
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(30,58,138,0.08)_0%,transparent_70%)] pointer-events-none"></div>

            {/* 返回按钮 + 返回大厅（[2026-08-07] 返回模式选择旁补直达大厅） */}
            <div className="absolute z-[999] flex items-center" style={{ top: TUTORIAL_MODE_UI.cornerTop, right: TUTORIAL_MODE_UI.cornerRight, gap: TUTORIAL_MODE_UI.cornerGap }}>
                {onBackToLobby && (
                    <button
                        onClick={() => { eventBus.emit(GameEvents.UI_BACK); onBackToLobby(); }}
                        className="rounded-full bg-white/5 hover:bg-white/20 border-white/10 hover:border-white/50 transition-all group"
                        style={{ padding: TUTORIAL_MODE_UI.cornerBtnPad, borderWidth: TUTORIAL_MODE_UI.cornerBtnBorderWidth, borderStyle: 'solid' }}
                        title="返回大厅"
                    >
                        <Home size={TUTORIAL_MODE_UI.cornerIconSize} className="text-gray-400 group-hover:text-white transition-colors" />
                    </button>
                )}
                <button
                    onClick={() => {
                        eventBus.emit(GameEvents.UI_BACK);
                        onBack();
                    }}
                    className="rounded-full bg-white/5 hover:bg-white/20 border-white/10 hover:border-white/50 transition-all group"
                    style={{ padding: TUTORIAL_MODE_UI.cornerBtnPad, borderWidth: TUTORIAL_MODE_UI.cornerBtnBorderWidth, borderStyle: 'solid' }}
                    title="返回模式选择"
                >
                    <ArrowLeft size={TUTORIAL_MODE_UI.cornerIconSize} className="text-gray-400 group-hover:text-white transition-colors" />
                </button>
            </div>

            {/* 标题 */}
            <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="text-center"
                style={{ marginBottom: TUTORIAL_MODE_UI.titleMarginBottom }}
            >
                <h2 className="font-black tracking-tighter italic text-transparent bg-clip-text bg-gradient-to-r from-white to-gray-400 drop-shadow-lg" style={{ fontSize: TUTORIAL_MODE_UI.titleFontSize }}>
                    战术考核
                </h2>
                <p className="text-gray-500 font-mono tracking-wider" style={{ fontSize: TUTORIAL_MODE_UI.subtitleFontSize, marginTop: TUTORIAL_MODE_UI.subtitleMarginTop }}>
                    选择考核科目 · 开始实战训练
                </p>
            </motion.div>

            {/* 三个考核大类按钮 */}
            <div className="flex items-center justify-center" style={{ gap: TUTORIAL_MODE_UI.rowGap }}>
                {EXAM_CATEGORIES.map((category, index) => {
                    const theme = CATEGORY_THEMES[category.id] || CATEGORY_THEMES.xx;
                    const isLocked = category.id === 'xx';

                    return (
                        <motion.div
                            key={category.id}
                            initial={{ opacity: 0, y: 40 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.5, delay: index * 0.15 }}
                        >
                            <div
                                onClick={() => {
                                    if (isLocked) return;
                                    eventBus.emit(GameEvents.UI_CLICK);
                                    onSelectCategory(category.id as ExamCategoryId);
                                }}
                                className={`
                                    relative overflow-hidden cursor-pointer
                                    bg-gradient-to-b ${theme.bg} ${theme.bgHover}
                                    ${theme.border} ${theme.borderHover}
                                    transition-all duration-300
                                    ${isLocked
                                        ? 'grayscale opacity-50 cursor-not-allowed'
                                        : `hover:scale-105 ${theme.glow}`
                                    }
                                    group
                                `}
                                style={{
                                    width: TUTORIAL_MODE_UI.cardWidth,
                                    height: TUTORIAL_MODE_UI.cardHeight,
                                    borderRadius: TUTORIAL_MODE_UI.cardRadius,
                                    borderWidth: TUTORIAL_MODE_UI.cardBorderWidth,
                                    borderStyle: 'solid',
                                }}
                            >
                                {/* 装饰顶条 */}
                                <div className={`absolute top-0 left-0 w-full bg-gradient-to-r from-transparent via-current to-transparent opacity-50 ${theme.accent}`} style={{ height: TUTORIAL_MODE_UI.cardTopBarHeight }}></div>

                                {/* 内容区 */}
                                <div className="w-full h-full flex flex-col items-center justify-center relative z-10" style={{ gap: TUTORIAL_MODE_UI.cardGap, padding: TUTORIAL_MODE_UI.cardPad }}>
                                    {/* 图标 */}
                                    <div className={`${theme.accent} transition-all duration-300 group-hover:scale-110`}>
                                        {CATEGORY_ICONS[category.id]}
                                    </div>

                                    {/* 名称 */}
                                    <h3 className={`font-black tracking-wider ${theme.accent}`} style={{ fontSize: TUTORIAL_MODE_UI.cardNameFontSize }}>
                                        {category.name}
                                    </h3>

                                    {/* 描述 */}
                                    <p className="text-gray-400 text-center leading-relaxed" style={{ fontSize: TUTORIAL_MODE_UI.cardDescFontSize }}>
                                        {category.description}
                                    </p>

                                    {/* 关卡数 */}
                                    <div className="absolute font-mono text-gray-600" style={{ bottom: TUTORIAL_MODE_UI.cardCountBottom, fontSize: TUTORIAL_MODE_UI.cardCountFontSize }}>
                                        {category.stageIds.length > 0
                                            ? `${category.stageIds.length} 个考核关卡`
                                            : '待开放'
                                        }
                                    </div>
                                </div>

                                {/* 锁定遮罩 */}
                                {isLocked && (
                                    <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-sm">
                                        <span className="font-mono font-bold text-white/80" style={{ fontSize: TUTORIAL_MODE_UI.lockTextFontSize }}>COMING SOON</span>
                                    </div>
                                )}

                                {/* hover 光效 */}
                                <div className={`absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none bg-[radial-gradient(circle_at_50%_50%,rgba(255,255,255,0.03)_0%,transparent_60%)]`}></div>
                            </div>
                        </motion.div>
                    );
                })}
            </div>

            {/* 底部提示 */}
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.8 }}
                className="absolute text-gray-600 font-mono"
                style={{ bottom: TUTORIAL_MODE_UI.footerBottom, fontSize: TUTORIAL_MODE_UI.footerFontSize }}
            >
                选择考核科目开始你的战术训练
            </motion.div>
        </div>
    );
};
