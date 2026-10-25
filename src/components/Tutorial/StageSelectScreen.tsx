import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Play, Eye, Sword, Shield, Target, Zap, RotateCcw } from 'lucide-react';
import { eventBus, GameEvents } from '../../utils/eventBus';
import { getStagesByCategory, getCategoryById } from '../../data/tutorialStages';
import type { ExamCategoryId } from '../../data/tutorialStages';
import { HERO_IMAGES } from '../../data/imageData'; // [新增]
import { ENEMY_ARCHETYPES } from '../../data/enemies/archetypes'; // [新增]
import { CARD_DB } from '../../data/cards'; // [新增]
import { isStageCompleted } from '../../utils/tutorialProgress'; // [新增] 完成状态检测
import { pickTuning } from '../../platform/tuning';

// ══════════════════════════════════════════════════════════════════════
// 🎛️ 战术考核 · **考核关卡列表**（`StageSelectScreen`）· 视觉调参区（**程微调就改这里**）
// ──────────────────────────────────────────────────────────────────────
// 这一屏 = 选完考核分类进来那一屏：左栏「考核列表」（关卡缩略卡：原画遮罩 + 编号 + 名称 +
//   已完成✓ + OBJECTIVES 小字）+ 右栏关卡详情（红蓝对抗背景 / 中央斜线与 VS 徽章 /
//   已完成橙罩与红圈 / STAGE n 简报 / 考核目标卡 / 底部「查看牌组」+「开始考核」）。
// 管：①左栏列表外壳与头部 ②关卡缩略卡 ③红蓝对抗背景（两侧 HUD）与中央斜线 VS
//   ④已完成标识 ⑤关卡简报 ⑥考核目标卡 ⑦底部操作栏 ⑧右栏空态，共 **103 项**。
// 改完存盘即生效（HMR —— 雷电/电脑上 1~3 秒看到，不用出包）。
// 命名与用法**对齐 `TITLE_UI`**：值是**绝对画布 px**、直接进 style；注释标注**原 Tailwind 类**。
// ⚠️ 只有 `dividerHeight`（原 `h-[150%]`）与两个 `*MaxWidth` 不是画布 px：
//   前者是**相对父容器的 %**（斜线要超出分隔柱才能斜跨整屏）；后者**默认锁 `'none'`** ——
//   `index.css:56` 的 `[class*="max-w-"]{max-width:none!important}` 本来就把原类打死了，
//   而 `!important` 压不住内联 ⇒ 搬成内联后**填数字会"突然真的生效"、右栏变窄**（要启用上限再改）。
// ⚠️ 刻意**没搬**：`w-1/2` / `h-full` / `w-full` / `flex-1` / `flex-[2]`（铺满与配比）· `inset-0` ·
//   `left-1/2` + `-translate-x-1/2` · `top-0` / `left-0` / `bottom-0`（= 0 的锚点）·
//   `rounded-full`（恒 9999px）· `space-y-3`（左栏是**定高滚动区**：换 flex + gap 要给每个子项补
//   `shrink-0`、空态的 `h-full` 还会溢出 ⇒ 按规范 §6 **保持不动**）· `grid-cols-1 md:grid-cols-2`
//   （**响应式**类，按视口宽判定而非画布）· `border`（**只在「已完成」分支里**出现，属状态样式 ⇒
//   连条件分支一起留在 JSX，不搬）· `z-*` / `opacity-*` / `scale-105` / `tracking-*` /
//   `leading-*` / `drop-shadow-*` / `mix-blend-*` / `backdrop-blur-*` / 全部 `bg-*` / `border-*` 配色 ·
//   `rotate-[15deg]` / `-rotate-12` · `completed-stage`（`index.css` 里查无定义，是空类）。
// ⚠️ 口径：字号只搬 `fontSize`、**不配写死 `lineHeight`**（规范 §6）；因此这些字号的行高由
//   Tailwind `text-*` 的配套行高改为继承 1.5（项目既定口径，有意如此，别回改成成对行高）。
// ⚠️ 两侧 HUD（ADJUTANT / ENEMY）**共用** `sideLabel*` / `sideName*` 六个字段 —— 改一处两侧一起变
//   （有意如此，红蓝对称）；要左右分开调说一声。
// ══════════════════════════════════════════════════════════════════════
// 🖥️📱 【双平台】`STAGE_SELECT_UI_MOBILE`（手机端）+ `STAGE_SELECT_UI_PC_DIFF`（PC 端差异项，见本块下方）
const STAGE_SELECT_UI_MOBILE = {
    // ══ ① 左栏：考核列表面板（含头部与空态） ═══════════════════════════
    /** 左栏宽 px（原 w-[280px] = 280） */
    listPanelWidth: 360,
    /** 左栏右侧分隔线宽 px（原 border-r = 1） */
    listPanelBorderRightWidth: 1,
    /** 头部内边距 px（原 p-5 = 20） */
    listHeaderPad: 20,
    /** 头部下边线宽 px（原 border-b = 1） */
    listHeaderBorderBottomWidth: 1,
    /** 「返回 + 分类名」那一行下距 px（原 mb-3 = 12） */
    listHeaderRowMarginBottom: 12,
    /** 返回钮内边距 px（原 p-2 = 8） */
    backBtnPad: 8,
    /** 返回钮圆角 px（原 rounded-lg = 8） */
    backBtnRadius: 8,
    /** 返回箭头图标 px（原 <ArrowLeft size={20} /> = 20） */
    backIconSize: 30,
    /** 分类名胶囊字号 px（原 text-xs = 12） */
    categoryChipFontSize: 18,
    /** 分类名胶囊左右内边距 px（原 px-2 = 8） */
    categoryChipPadX: 8,
    /** 分类名胶囊上下内边距 px（原 py-0.5 = 2） */
    categoryChipPadY: 2,
    /** 「考核列表」字号 px（原 text-sm = 14） */
    listTitleFontSize: 21,
    /** 列表滚动区上下内边距 px（原 p-4 = 16） */
    listBodyPad: 16,
    /** 列表顶部虚化条高 px（原 h-4 = 16） */
    listTopFadeHeight: 16,
    /** 列表底部虚化条高 px（原 h-8 = 32） */
    listBottomFadeHeight: 32,
    /** 空态（📭）左右内边距 px（原 px-6 = 24） */
    listEmptyPadX: 24,
    /** 空态 📭 字号 px（原 text-3xl = 30） */
    listEmptyIconFontSize: 45,
    /** 空态 📭 下距 px（原 mb-3 = 12） */
    listEmptyIconMarginBottom: 12,
    /** 空态「暂无关卡」字号 px（原 text-sm = 14） */
    listEmptyTextFontSize: 21,

    // ══ ② 左栏：关卡缩略卡 ═════════════════════════════════════════════
    /** 缩略卡高 px（原 h-24 = 96） */
    stageCardHeight: 96,
    /** 缩略卡圆角 px（原 rounded-xl = 12） */
    stageCardRadius: 12,
    /** 缩略卡描边 px（原 border-2 = 2） */
    stageCardBorderWidth: 2,
    /** 缩略卡左右内边距 px（原 px-4 = 16） */
    stageCardPadX: 16,
    /** 缩略卡上下内边距 px（原 py-3 = 12） */
    stageCardPadY: 12,
    /** 编号行下距 px（原 mb-1 = 4） */
    stageCardRowMarginBottom: 4,
    /** 编号与名称间距 px（原 gap-2 = 8） */
    stageCardRowGap: 8,
    /** 编号方块边长 px（原 w-5 h-5 = 20） */
    stageNoSize: 30,
    /** 编号方块圆角 px（原 rounded = 4） */
    stageNoRadius: 4,
    /** 编号字号 px（原 text-[10px] = 10） */
    stageNoFontSize: 15,
    /** 关卡名字号 px（原 text-sm = 14） */
    stageNameFontSize: 21,
    /** 已完成 ✓ 字号 px（原 text-sm = 14） */
    stageCheckFontSize: 21,
    /** 「N OBJECTIVES / COMPLETED」字号 px（原 text-[10px] = 10） */
    stageMetaFontSize: 15,
    /** 该行上距 px（原 mt-1 = 4） */
    stageMetaMarginTop: 4,
    /** 该行左缩进 px（原 pl-7 = 28） */
    stageMetaPadLeft: 28,

    // ══ ③ 右栏：红蓝对抗背景（两侧 HUD）+ 中央斜线与 VS ════════════════
    /** 两侧 HUD 距顶 px（原 top-10 = 40） */
    sideLabelTop: 40,
    /** 我方 HUD 距左 px（原 left-10 = 40） */
    sideLabelLeft: 40,
    /** 敌方 HUD 距右 px（原 right-10 = 40） */
    sideLabelRight: 40,
    /** 「ADJUTANT / ENEMY」字号 px（原 text-xs = 12） */
    sideLabelFontSize: 16,
    /** 该行图标与文字间距 px（原 gap-1 = 4） */
    sideLabelGap: 4,
    /** 该行小图标 px（原 <Shield size={12}/> / <Sword size={12}/> = 12） */
    sideLabelIconSize: 16,
    /** 阵营名字号 px（原 text-3xl = 30） */
    sideNameFontSize: 45,
    /** 阵营名上距 px（原 mt-1 = 4） */
    sideNameMarginTop: 4,
    /** 中央分隔柱宽 px（原 w-32 = 128） */
    dividerColumnWidth: 128,
    /** 中央斜线宽 px（原 w-[2px] = 2） */
    dividerWidth: 2,
    /** 中央斜线高（原 h-[150%] —— **相对父容器的 %**，超出分隔柱才能斜跨整屏，不是画布 px） */
    dividerHeight: '150%',
    /** VS 徽章距顶 px（原 top-12 = 48） */
    vsTop: 48,
    /** VS 徽章直径 px（原 w-16 h-16 = 64） */
    vsSize: 64,
    /** VS 徽章描边 px（原 border-[2px] = 2） */
    vsBorderWidth: 2,
    /** 「VS」字号 px（原 text-2xl = 24） */
    vsFontSize: 24,
    /** 「VS」右内边距 px（原 pr-1 = 4 · 视觉居中修正） */
    vsPadRight: 4,

    // ══ ④ 右栏：已完成标识（橙色遮罩层本身无尺寸 + 红圈与文字） ════════
    /** 红圈直径 px（原 w-44 h-44 = 176） */
    completedRingSize: 176,
    /** 红圈描边 px（原 border-[4px] = 4） */
    completedRingBorderWidth: 4,
    /** 「已完成」字号 px（原 text-[2.25rem] = 36） */
    completedTextFontSize: 36,

    // ══ ⑤ 右栏：关卡简报（STAGE n / 名称 / 描述 / 目标标题） ══════════
    /** 简报区上内边距 px（原 pt-32 = 128 · 给顶部 HUD 让位） */
    detailPadTop: 128,
    /** 简报区下内边距 px（原 pb-4 = 16） */
    detailPadBottom: 16,
    /** 简报滚动区左右内边距 px（原 px-10 = 40） */
    detailScrollPadX: 40,
    /** 简报块行距 px（原 gap-2 = 8） */
    detailHeadGap: 8,
    /** 简报块下距 px（原 mb-8 = 32） */
    detailHeadMarginBottom: 32,
    /** STAGE 徽章行间距 px（原 gap-3 = 12） */
    stageBadgeRowGap: 12,
    /** STAGE 徽章左右内边距 px（原 px-2 = 8） */
    stageBadgePadX: 8,
    /** STAGE 徽章上下内边距 px（原 py-0.5 = 2） */
    stageBadgePadY: 2,
    /** STAGE 徽章字号 px（原 text-xs = 12） */
    stageBadgeFontSize: 18,
    /** STAGE 徽章圆角 px（原 rounded = 4） */
    stageBadgeRadius: 4,
    /** STAGE 徽章描边 px（原 border = 1） */
    stageBadgeBorderWidth: 1,
    /** 关卡名字号 px（原 text-4xl = 36） */
    stageTitleFontSize: 54,
    /** 关卡描述字号 px（原 text-sm = 14） */
    stageDescFontSize: 21,
    /** 描述最大宽（原 max-w-2xl —— 被 `index.css:56` 的 `!important` 打死过 ⇒ 默认锁 `'none'`） */
    stageDescMaxWidth: 'none',
    /** 「EXAM OBJECTIVES」字号 px（原 text-xs = 12） */
    objectivesTitleFontSize: 18,
    /** 该标题下距 px（原 mb-4 = 16） */
    objectivesTitleMarginBottom: 16,
    /** 图标与文字间距 px（原 gap-2 = 8） */
    objectivesTitleGap: 8,
    /** 该标题图标 px（原 <Target size={14} /> = 14） */
    objectivesTitleIconSize: 21,

    // ══ ⑥ 右栏：考核目标卡 ═════════════════════════════════════════════
    /** 目标卡之间间距 px（原 gap-4 = 16） */
    objectivesGridGap: 16,
    /** 目标网格下内边距 px（原 pb-6 = 24） */
    objectivesGridPadBottom: 24,
    /** 单卡内行距 px（原 gap-4 = 16） */
    objectiveItemGap: 16,
    /** 单卡圆角 px（原 rounded-xl = 12） */
    objectiveItemRadius: 12,
    /** 单卡内边距 px（原 p-5 = 20） */
    objectiveItemPad: 20,
    /** 单卡描边 px（原 border = 1） */
    objectiveItemBorderWidth: 1,
    /** 图标圆直径 px（原 w-10 h-10 = 40） */
    objectiveIconSize: 60,
    /** 图标圆描边 px（原 border = 1） */
    objectiveIconBorderWidth: 1,
    /** 目标文字上内边距 px（原 pt-2 = 8） */
    objectiveTextPadTop: 8,
    /** 目标文字字号 px（原 text-sm = 14） */
    objectiveTextFontSize: 21,

    // ══ ⑦ 右栏：底部操作栏（查看牌组 / 开始考核） ══════════════════════
    /** 操作栏左右内边距 px（原 px-10 = 40） */
    footerPadX: 40,
    /** 操作栏上下内边距 px（原 py-6 = 24） */
    footerPadY: 24,
    /** 操作栏上边线宽 px（原 border-t = 1） */
    footerBorderTopWidth: 1,
    /** 两个按钮之间间距 px（原 gap-6 = 24） */
    footerRowGap: 24,
    /** 按钮行最大宽（原 max-w-4xl —— 被打死过 ⇒ 默认锁 `'none'`） */
    footerRowMaxWidth: 'none',
    /** 「查看牌组」上下内边距 px（原 py-4 = 16） */
    viewDeckBtnPadY: 16,
    /** 「查看牌组」圆角 px（原 rounded-xl = 12） */
    viewDeckBtnRadius: 12,
    /** 「查看牌组」内间距 px（原 gap-2 = 8） */
    viewDeckBtnGap: 8,
    /** 「查看牌组」字号 px（原 text-sm = 14） */
    viewDeckBtnFontSize: 14,
    /** 「查看牌组」描边 px（原 border = 1） */
    viewDeckBtnBorderWidth: 1,
    /** 「查看牌组」眼睛图标 px（原 <Eye size={18} /> = 18） */
    viewDeckIconSize: 18,
    /** 「开始考核」上下内边距 px（原 py-4 = 16） */
    startBtnPadY: 16,
    /** 「开始考核」圆角 px（原 rounded-xl = 12） */
    startBtnRadius: 12,
    /** 「开始考核」内间距 px（原 gap-2 = 8） */
    startBtnGap: 8,
    /** 「开始考核」字号 px（原 text-lg = 18） */
    startBtnFontSize: 18,
    /** 「开始考核」描边 px（原 border = 1） */
    startBtnBorderWidth: 1,
    /** 「开始 / 再次考核」图标 px（原 <RotateCcw size={20} /> / <Play size={20} /> = 20） */
    startBtnIconSize: 20,

    // ══ ⑧ 右栏：空态（没选中任何关卡时） ═══════════════════════════════
    /** 分类大图标字号 px（原 text-6xl = 60） */
    emptyIconFontSize: 60,
    /** 大图标下距 px（原 mb-4 = 16） */
    emptyIconMarginBottom: 16,
    /** 分类名字号 px（原 text-xl = 20） */
    emptyNameFontSize: 20,
    /** 提示字号 px（原 text-sm = 14） */
    emptyHintFontSize: 14,
    /** 提示上距 px（原 mt-2 = 8） */
    emptyHintMarginTop: 8,
};

// ══════════════════════════════════════════════════════════════════════
// 🖥️ `STAGE_SELECT_UI` PC 端差异项 —— 只列「与手机端不同」的项；未列出的项两端相同
// ──────────────────────────────────────────────────────────────────────
// 依据：`_scratch/reports/g6-system.md` §2 的逐项表（git 基线 × 注释「原 XXX」双源；
//      提交 `6115ca0e` 的信息写「14 项」，**实际 diff 21 项** ⇒ 以 diff 为准）。
// 改这里 = 改 PC 端观感；改上面 = 改手机端观感。
// ⚠️ `stageDescMaxWidth` / `footerRowMaxWidth` 两个 `'none'` **不是手调**（是 `index.css:56`
//    的 `max-w-*` 规避）⇒ 刻意不列在这里，别顺手补进来。
// ══════════════════════════════════════════════════════════════════════
const STAGE_SELECT_UI_PC_DIFF = {
    // ══ ① 左栏：考核列表面板 ═══════════════════════════════════════════
    listPanelWidth: 280,          // 原 w-[280px] = 280
    backIconSize: 20,             // 原 <ArrowLeft size={20} /> = 20
    categoryChipFontSize: 12,     // 原 text-xs = 12
    listTitleFontSize: 14,        // 原 text-sm = 14
    listEmptyIconFontSize: 30,    // 原 text-3xl = 30
    listEmptyTextFontSize: 14,    // 原 text-sm = 14

    // ══ ② 左栏：关卡缩略卡 ═════════════════════════════════════════════
    stageNoSize: 20,              // 原 w-5 h-5 = 20
    stageNoFontSize: 10,          // 原 text-[10px] = 10
    stageNameFontSize: 14,        // 原 text-sm = 14
    stageCheckFontSize: 14,       // 原 text-sm = 14
    stageMetaFontSize: 10,        // 原 text-[10px] = 10

    // ══ ③ 右栏：红蓝对抗背景（两侧 HUD）═══════════════════════════════
    sideLabelFontSize: 12,        // 原 text-xs = 12
    sideLabelIconSize: 12,        // 原 <Shield size={12}/> / <Sword size={12}/> = 12
    sideNameFontSize: 30,         // 原 text-3xl = 30

    // ══ ⑤ 右栏：关卡简报 ═══════════════════════════════════════════════
    stageBadgeFontSize: 12,       // 原 text-xs = 12
    stageTitleFontSize: 36,       // 原 text-4xl = 36
    stageDescFontSize: 14,        // 原 text-sm = 14
    objectivesTitleFontSize: 12,  // 原 text-xs = 12
    objectivesTitleIconSize: 14,  // 原 <Target size={14} /> = 14

    // ══ ⑥ 右栏：考核目标卡 ═════════════════════════════════════════════
    objectiveIconSize: 40,        // 原 w-10 h-10 = 40
    objectiveTextFontSize: 14,    // 原 text-sm = 14
};

/** PC 端完整值 = 手机值为底 + PC 差异覆盖 */
const STAGE_SELECT_UI_PC = { ...STAGE_SELECT_UI_MOBILE, ...STAGE_SELECT_UI_PC_DIFF };

/** 🖥️ PC / 📱 手机 —— 按运行平台自动二选一（平台判定在 `src/platform/tuning.ts`） */
export const STAGE_SELECT_UI = pickTuning(STAGE_SELECT_UI_PC, STAGE_SELECT_UI_MOBILE);

interface StageSelectScreenProps {
    categoryId: ExamCategoryId;
    userId?: string; // [新增] 用于区分账号的完成状态
    onBack: () => void;
    onStartStage: (stageId: string) => void;
    onViewDecks: (stageId: string) => void;
}

/** 目标图标映射 */
const OBJECTIVE_ICONS: React.ReactNode[] = [
    <Sword key="0" size={14} />,
    <Shield key="1" size={14} />,
    <Target key="2" size={14} />,
    <Zap key="3" size={14} />,
];

export const StageSelectScreen: React.FC<StageSelectScreenProps> = ({
    categoryId,
    userId,
    onBack,
    onStartStage,
    onViewDecks,
}) => {
    const [selectedStageId, setSelectedStageId] = useState<string | null>(null);

    const category = useMemo(() => getCategoryById(categoryId), [categoryId]);
    const stages = useMemo(() => getStagesByCategory(categoryId), [categoryId]);

    // 默认选中第一个
    const selectedStage = useMemo(() => {
        const id = selectedStageId || stages[0]?.id || null;
        return stages.find(s => s.id === id) || null;
    }, [selectedStageId, stages]);

    // 关卡编号
    const stageIndex = selectedStage
        ? stages.findIndex(s => s.id === selectedStage.id) + 1
        : 0;

    if (!category) {
        return (
            <div className="w-full h-full flex items-center justify-center bg-black text-white">
                <span className="text-gray-500 font-mono">未知的考核分类</span>
            </div>
        );
    }

    return (
        <div className="w-full h-full flex bg-[#0f172a] text-white font-sans overflow-hidden">
            {/* ============ 左栏：关卡列表 ============ */}
            <div className="h-full border-white/10 flex flex-col bg-slate-900/90 backdrop-blur-md shrink-0 relative z-20" style={{ width: STAGE_SELECT_UI.listPanelWidth, borderRightWidth: STAGE_SELECT_UI.listPanelBorderRightWidth, borderStyle: 'solid' }}>
                {/* 头部 */}
                <div className="border-white/10 bg-black/40" style={{ padding: STAGE_SELECT_UI.listHeaderPad, borderBottomWidth: STAGE_SELECT_UI.listHeaderBorderBottomWidth, borderStyle: 'solid' }}>
                    <div className="flex items-center justify-between" style={{ marginBottom: STAGE_SELECT_UI.listHeaderRowMarginBottom }}>
                        <button
                            onClick={() => {
                                eventBus.emit(GameEvents.UI_BACK);
                                onBack();
                            }}
                            className="hover:bg-white/10 transition-colors text-gray-400 hover:text-white"
                            style={{ padding: STAGE_SELECT_UI.backBtnPad, borderRadius: STAGE_SELECT_UI.backBtnRadius }}
                        >
                            <ArrowLeft size={STAGE_SELECT_UI.backIconSize} />
                        </button>
                        <span className="text-gray-500 bg-slate-800 rounded-full font-mono" style={{ fontSize: STAGE_SELECT_UI.categoryChipFontSize, paddingLeft: STAGE_SELECT_UI.categoryChipPadX, paddingRight: STAGE_SELECT_UI.categoryChipPadX, paddingTop: STAGE_SELECT_UI.categoryChipPadY, paddingBottom: STAGE_SELECT_UI.categoryChipPadY }}>
                            {category.icon} {category.name}
                        </span>
                    </div>
                    <h2 className="font-black text-gray-300 uppercase tracking-[0.2em]" style={{ fontSize: STAGE_SELECT_UI.listTitleFontSize }}>
                        考核列表
                    </h2>
                </div>

                {/* 关卡列表 (升级为原画遮罩卡片) */}
                <div className="flex-1 overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] space-y-3 relative" style={{ padding: STAGE_SELECT_UI.listBodyPad }}>
                    {/* 顶部/底部边缘虚化遮罩 */}
                    <div className="absolute top-0 left-0 w-full bg-gradient-to-b from-slate-900/90 to-transparent z-10 pointer-events-none" style={{ height: STAGE_SELECT_UI.listTopFadeHeight }}></div>

                    {stages.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-gray-600 text-center" style={{ paddingLeft: STAGE_SELECT_UI.listEmptyPadX, paddingRight: STAGE_SELECT_UI.listEmptyPadX }}>
                            <div style={{ fontSize: STAGE_SELECT_UI.listEmptyIconFontSize, marginBottom: STAGE_SELECT_UI.listEmptyIconMarginBottom }}>📭</div>
                            <span className="font-mono tracking-wider" style={{ fontSize: STAGE_SELECT_UI.listEmptyTextFontSize }}>暂无关卡</span>
                        </div>
                    ) : (
                        stages.map((stage, index) => {
                            const playerHeroKey = stage.playerHeroConfig?.heroKey || 'lyfe';
                            const heroImg = HERO_IMAGES[playerHeroKey as keyof typeof HERO_IMAGES]?.base || '';
                            const completed = isStageCompleted(stage.id, userId);

                            return (
                                <div
                                    key={stage.id}
                                    onClick={() => {eventBus.emit(GameEvents.SFX_SELECT_UNIT); setSelectedStageId(stage.id); }}
                                    className={`
                                        group relative cursor-pointer overflow-hidden transition-all
                                        ${selectedStage?.id === stage.id
                                            ? 'border-cyan-500 shadow-[0_0_15px_rgba(6,182,212,0.5)] scale-105 z-10'
                                            : 'border-white/10 hover:border-gray-400 opacity-70 hover:opacity-100'
                                        }
                                        ${completed ? 'completed-stage' : ''}
                                    `}
                                    style={{
                                        height: STAGE_SELECT_UI.stageCardHeight,
                                        borderRadius: STAGE_SELECT_UI.stageCardRadius,
                                        borderWidth: STAGE_SELECT_UI.stageCardBorderWidth,
                                        borderStyle: 'solid',
                                    }}
                                >
                                    {heroImg && <div className="absolute inset-0 bg-cover bg-top opacity-60 mix-blend-luminosity group-hover:mix-blend-normal transition-all duration-500" style={{ backgroundImage: `url(${heroImg})` }}></div>}
                                    <div className={`absolute inset-0 bg-gradient-to-r ${selectedStage?.id === stage.id ? 'from-cyan-950/90 via-slate-900/80' : 'from-slate-950/90 via-slate-900/80'} to-transparent transition-colors`}></div>

                                    <div className="absolute inset-0 flex flex-col justify-center" style={{ paddingLeft: STAGE_SELECT_UI.stageCardPadX, paddingRight: STAGE_SELECT_UI.stageCardPadX, paddingTop: STAGE_SELECT_UI.stageCardPadY, paddingBottom: STAGE_SELECT_UI.stageCardPadY }}>
                                        <div className="flex items-center justify-between relative z-10" style={{ marginBottom: STAGE_SELECT_UI.stageCardRowMarginBottom }}>
                                            <div className="flex items-center" style={{ gap: STAGE_SELECT_UI.stageCardRowGap }}>
                                                <span className={`flex items-center justify-center font-black
                                                    ${completed
                                                        ? 'bg-orange-500/40 text-orange-300 border border-orange-400/50'
                                                        : selectedStage?.id === stage.id
                                                            ? 'bg-cyan-500 text-slate-900'
                                                            : 'bg-slate-800 text-gray-400'
                                                    }`}
                                                    style={{
                                                        width: STAGE_SELECT_UI.stageNoSize,
                                                        height: STAGE_SELECT_UI.stageNoSize,
                                                        borderRadius: STAGE_SELECT_UI.stageNoRadius,
                                                        fontSize: STAGE_SELECT_UI.stageNoFontSize,
                                                    }}
                                                >
                                                    {index + 1}
                                                </span>
                                                <span className={`font-black tracking-widest drop-shadow-md ${completed ? 'text-gray-400' : 'text-white'}`} style={{ fontSize: STAGE_SELECT_UI.stageNameFontSize }}>
                                                    {stage.name}
                                                </span>
                                                {completed && (
                                                    <span className="text-green-400 font-black drop-shadow-[0_0_6px_rgba(34,197,94,0.6)]" style={{ fontSize: STAGE_SELECT_UI.stageCheckFontSize }}>✓</span>
                                                )}
                                            </div>
                                        </div>
                                        <div className={`font-bold tracking-widest relative z-10 ${completed ? 'text-orange-400/80' : 'text-cyan-400/80'}`} style={{ fontSize: STAGE_SELECT_UI.stageMetaFontSize, marginTop: STAGE_SELECT_UI.stageMetaMarginTop, paddingLeft: STAGE_SELECT_UI.stageMetaPadLeft }}>
                                            {completed ? 'COMPLETED' : `${stage.objectives.length} OBJECTIVES`}
                                        </div>
                                    </div>
                                </div>
                            );
                        })
                    )}
                    <div className="absolute bottom-0 left-0 w-full bg-gradient-to-t from-slate-900/90 to-transparent z-10 pointer-events-none" style={{ height: STAGE_SELECT_UI.listBottomFadeHeight }}></div>
                </div>
            </div>

            {/* ============ 右栏：关卡详情 ============ */}
            <div className="flex-1 flex flex-col min-w-0 bg-[#0f172a] relative">
                <AnimatePresence mode="wait">
                    {selectedStage ? (
                        <motion.div
                            key={selectedStage.id}
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            transition={{ duration: 0.2 }}
                            className="flex-1 flex flex-col relative"
                        >
                            {/* [核心重构] 1. 全局视觉底座：红蓝对抗碰撞背景 (The Clash) */}
                            {(() => {
                                const stage = selectedStage;
                                const enemyArch = stage.enemyArchetypeId ? ENEMY_ARCHETYPES[stage.enemyArchetypeId] : null;
                                const stageCompleted = isStageCompleted(stage.id, userId);

                                // ★ 优先使用关卡中直接指定的敌方视觉配置
                                const enemyVisual = stage.enemyVisual;
                                const enemyDisplayName = enemyVisual?.displayName || enemyArch?.name || 'UNKNOWN HOSTILE';
                                const enemyCardKey = enemyVisual?.cardKey || '';
                                const enemyImg = enemyCardKey
                                    ? CARD_DB[enemyCardKey]?.imageUrl || ''
                                    : (enemyArch ? HERO_IMAGES[enemyArch.champion as keyof typeof HERO_IMAGES]?.base || '' : '');

                                const playerHeroKey = stage.playerHeroConfig?.heroKey || 'lyfe';
                                const playerImg = HERO_IMAGES[playerHeroKey as keyof typeof HERO_IMAGES]?.base || '';

                                return (
                                    <div className="absolute inset-0 z-0 overflow-hidden bg-slate-950 flex">
                                        {/* 左侧：我方 (蓝色) */}
                                        <div className="relative w-1/2 h-full bg-blue-950 overflow-hidden">
                                            {playerImg && <img src={playerImg} className="absolute inset-0 w-full h-full object-cover opacity-70" style={{ objectPosition: 'top 20% center' }} alt="玩家" />}
                                            <div className="absolute inset-0 bg-gradient-to-r from-blue-900/60 to-transparent mix-blend-overlay"></div>
                                            {/* 将文字移至顶部，为底部简报内容让出空间 */}
                                            <div className="absolute z-10" style={{ top: STAGE_SELECT_UI.sideLabelTop, left: STAGE_SELECT_UI.sideLabelLeft }}>
                                                <div className="font-mono text-cyan-400 font-bold tracking-widest flex items-center" style={{ fontSize: STAGE_SELECT_UI.sideLabelFontSize, gap: STAGE_SELECT_UI.sideLabelGap }}><Shield size={STAGE_SELECT_UI.sideLabelIconSize}/> ADJUTANT</div>
                                                <div className="font-black text-white tracking-widest uppercase drop-shadow-[0_0_15px_rgba(0,0,0,0.8)]" style={{ fontSize: STAGE_SELECT_UI.sideNameFontSize, marginTop: STAGE_SELECT_UI.sideNameMarginTop }}>
                                                    {CARD_DB[playerHeroKey]?.name || 'MY SQUAD'}
                                                </div>
                                            </div>
                                        </div>

                                        {/* 右侧：敌方 (红色) */}
                                        <div className="relative w-1/2 h-full bg-red-950 overflow-hidden">
                                            {enemyImg && <img src={enemyImg} className="absolute inset-0 w-full h-full object-cover opacity-70" style={{ objectPosition: 'top 20% center' }} alt="敌人" />}
                                            <div className="absolute inset-0 bg-gradient-to-l from-red-900/60 to-transparent mix-blend-overlay"></div>
                                            <div className="absolute z-10 text-right" style={{ top: STAGE_SELECT_UI.sideLabelTop, right: STAGE_SELECT_UI.sideLabelRight }}>
                                                <div className="font-mono text-red-400 font-bold tracking-widest flex items-center justify-end" style={{ fontSize: STAGE_SELECT_UI.sideLabelFontSize, gap: STAGE_SELECT_UI.sideLabelGap }}><Sword size={STAGE_SELECT_UI.sideLabelIconSize}/> ENEMY</div>
                                                <div className="font-black text-white tracking-widest uppercase drop-shadow-[0_0_15px_rgba(0,0,0,0.8)]" style={{ fontSize: STAGE_SELECT_UI.sideNameFontSize, marginTop: STAGE_SELECT_UI.sideNameMarginTop }}>
                                                    {enemyDisplayName}
                                                </div>
                                            </div>
                                        </div>

                                        {/* 中心碰撞分隔线与 VS */}
                                        <div className="absolute top-0 left-1/2 -translate-x-1/2 h-full overflow-hidden flex items-center justify-center z-20 pointer-events-none" style={{ width: STAGE_SELECT_UI.dividerColumnWidth }}>
                                            <div className="absolute bg-gradient-to-b from-transparent via-white to-transparent rotate-[15deg] shadow-[0_0_20px_rgba(255,255,255,0.8)] opacity-50" style={{ width: STAGE_SELECT_UI.dividerWidth, height: STAGE_SELECT_UI.dividerHeight }}></div>
                                            {/* 将 VS 徽章上移 */}
                                            <div className="absolute rounded-full bg-black/60 border-white/20 flex items-center justify-center shadow-[0_0_30px_rgba(0,0,0,0.8)] z-10 backdrop-blur-md" style={{ top: STAGE_SELECT_UI.vsTop, width: STAGE_SELECT_UI.vsSize, height: STAGE_SELECT_UI.vsSize, borderWidth: STAGE_SELECT_UI.vsBorderWidth, borderStyle: 'solid' }}>
                                                <span className="font-black italic text-transparent bg-clip-text bg-gradient-to-b from-white to-gray-500 tracking-tighter" style={{ fontSize: STAGE_SELECT_UI.vsFontSize, paddingRight: STAGE_SELECT_UI.vsPadRight }}>VS</span>
                                            </div>
                                        </div>

                                        {/* 托底的全局暗色渐变遮罩，使底部悬浮 UI 的文字保持绝对清晰 */}
                                        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/80 to-transparent pointer-events-none z-30"></div>

                                        {/* [新增] 已完成：橙色半透明遮罩 */}
                                        {stageCompleted && (
                                            <div className="absolute inset-0 z-[1] bg-orange-500/25 pointer-events-none"></div>
                                        )}

                                        {/* [新增] 已完成：红色圆环 + 倾斜文字标识 */}
                                        {stageCompleted && (
                                            <div className="absolute inset-0 z-[2] flex items-center justify-center pointer-events-none">
                                                <div className="rounded-full border-red-500/80 flex items-center justify-center shadow-[0_0_40px_rgba(239,68,68,0.3)]" style={{ width: STAGE_SELECT_UI.completedRingSize, height: STAGE_SELECT_UI.completedRingSize, borderWidth: STAGE_SELECT_UI.completedRingBorderWidth, borderStyle: 'solid' }}>
                                                    <span className="text-red-500 font-black italic -rotate-12 tracking-wider drop-shadow-[0_0_15px_rgba(239,68,68,0.5)]" style={{ fontSize: STAGE_SELECT_UI.completedTextFontSize }}>
                                                        已完成
                                                    </span>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })()}

                            {/* [核心重构] 2. 关卡简报与考核目标 (悬浮玻璃拟态 HUD) */}
                            <div className="flex-1 relative z-10 flex flex-col justify-end" style={{ paddingBottom: STAGE_SELECT_UI.detailPadBottom, paddingTop: STAGE_SELECT_UI.detailPadTop }}>
                                {/* 内部滚动区 */}
                                <div className="overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]" style={{ paddingLeft: STAGE_SELECT_UI.detailScrollPadX, paddingRight: STAGE_SELECT_UI.detailScrollPadX }}>
                                    <div className="flex flex-col" style={{ gap: STAGE_SELECT_UI.detailHeadGap, marginBottom: STAGE_SELECT_UI.detailHeadMarginBottom }}>
                                        <div className="flex items-center" style={{ gap: STAGE_SELECT_UI.stageBadgeRowGap }}>
                                            <span className="bg-cyan-900/50 text-cyan-400 font-bold rounded border-cyan-500/30 uppercase tracking-widest backdrop-blur-sm" style={{ fontSize: STAGE_SELECT_UI.stageBadgeFontSize, paddingLeft: STAGE_SELECT_UI.stageBadgePadX, paddingRight: STAGE_SELECT_UI.stageBadgePadX, paddingTop: STAGE_SELECT_UI.stageBadgePadY, paddingBottom: STAGE_SELECT_UI.stageBadgePadY, borderRadius: STAGE_SELECT_UI.stageBadgeRadius, borderWidth: STAGE_SELECT_UI.stageBadgeBorderWidth, borderStyle: 'solid' }}>
                                                STAGE {stageIndex}
                                            </span>
                                            <h2 className="font-black tracking-tight text-white drop-shadow-[0_4px_10px_rgba(0,0,0,0.8)]" style={{ fontSize: STAGE_SELECT_UI.stageTitleFontSize }}>{selectedStage.name}</h2>
                                        </div>
                                        <p className="text-gray-300 leading-relaxed font-medium drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]" style={{ fontSize: STAGE_SELECT_UI.stageDescFontSize, maxWidth: STAGE_SELECT_UI.stageDescMaxWidth }}>{selectedStage.description}</p>
                                    </div>

                                    <h3 className="font-black text-cyan-400 tracking-[0.2em] uppercase flex items-center drop-shadow-md" style={{ fontSize: STAGE_SELECT_UI.objectivesTitleFontSize, marginBottom: STAGE_SELECT_UI.objectivesTitleMarginBottom, gap: STAGE_SELECT_UI.objectivesTitleGap }}>
                                        <Target size={STAGE_SELECT_UI.objectivesTitleIconSize} /> EXAM OBJECTIVES
                                    </h3>

                                    <div className="grid grid-cols-1 md:grid-cols-2" style={{ gap: STAGE_SELECT_UI.objectivesGridGap, paddingBottom: STAGE_SELECT_UI.objectivesGridPadBottom }}>
                                        {selectedStage.objectives.map((obj, idx) => (
                                            <div key={idx} className="flex items-start bg-black/40 hover:bg-black/60 backdrop-blur-md transition-colors border-white/10 shadow-lg group" style={{ gap: STAGE_SELECT_UI.objectiveItemGap, borderRadius: STAGE_SELECT_UI.objectiveItemRadius, padding: STAGE_SELECT_UI.objectiveItemPad, borderWidth: STAGE_SELECT_UI.objectiveItemBorderWidth, borderStyle: 'solid' }}>
                                                <div className="rounded-full bg-cyan-900/50 border-cyan-500/40 flex items-center justify-center shrink-0 group-hover:bg-cyan-600 group-hover:border-cyan-400 transition-all shadow-[0_0_15px_rgba(6,182,212,0)] group-hover:shadow-[0_0_15px_rgba(6,182,212,0.4)]" style={{ width: STAGE_SELECT_UI.objectiveIconSize, height: STAGE_SELECT_UI.objectiveIconSize, borderWidth: STAGE_SELECT_UI.objectiveIconBorderWidth, borderStyle: 'solid' }}>
                                                    <span className="text-cyan-400 group-hover:text-white transition-colors">
                                                        {OBJECTIVE_ICONS[idx % OBJECTIVE_ICONS.length]}
                                                    </span>
                                                </div>
                                                <div style={{ paddingTop: STAGE_SELECT_UI.objectiveTextPadTop }}>
                                                    <span className="text-gray-200 font-bold tracking-wide leading-snug drop-shadow-md" style={{ fontSize: STAGE_SELECT_UI.objectiveTextFontSize }}>{obj}</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* 底部操作按钮 (融入玻璃质感) */}
                            <div className="shrink-0 z-20 border-white/10 bg-black/40 backdrop-blur-lg" style={{ paddingLeft: STAGE_SELECT_UI.footerPadX, paddingRight: STAGE_SELECT_UI.footerPadX, paddingTop: STAGE_SELECT_UI.footerPadY, paddingBottom: STAGE_SELECT_UI.footerPadY, borderTopWidth: STAGE_SELECT_UI.footerBorderTopWidth, borderStyle: 'solid' }}>
                                <div className="flex items-center" style={{ gap: STAGE_SELECT_UI.footerRowGap, maxWidth: STAGE_SELECT_UI.footerRowMaxWidth }}>
                                    {/* 查看牌组按钮 */}
                                    <button
                                        onClick={() => {
                                            eventBus.emit(GameEvents.UI_CLICK);
                                            onViewDecks(selectedStage.id);
                                        }}
                                        className="flex-1 flex items-center justify-center font-bold
                                            bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white
                                            border-white/20 hover:border-white/40
                                            transition-all group shadow-lg backdrop-blur-sm"
                                        style={{
                                            paddingTop: STAGE_SELECT_UI.viewDeckBtnPadY,
                                            paddingBottom: STAGE_SELECT_UI.viewDeckBtnPadY,
                                            borderRadius: STAGE_SELECT_UI.viewDeckBtnRadius,
                                            gap: STAGE_SELECT_UI.viewDeckBtnGap,
                                            fontSize: STAGE_SELECT_UI.viewDeckBtnFontSize,
                                            borderWidth: STAGE_SELECT_UI.viewDeckBtnBorderWidth,
                                            borderStyle: 'solid',
                                        }}
                                    >
                                        <Eye size={STAGE_SELECT_UI.viewDeckIconSize} className="group-hover:scale-110 transition-transform" />
                                        查看牌组
                                    </button>

                                    {/* 开始/再次考核按钮 */}
                                    <button
                                        onClick={() => {
                                            eventBus.emit(GameEvents.UI_CLICK);
                                            onStartStage(selectedStage.id);
                                        }}
                                        className={`flex-[2] flex items-center justify-center font-bold tracking-widest
                                            text-white transition-all hover:scale-[1.02] active:scale-[0.98]
                                            ${isStageCompleted(selectedStage.id, userId)
                                                ? 'bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 shadow-[0_0_20px_rgba(251,146,60,0.4)] hover:shadow-[0_0_30px_rgba(251,146,60,0.6)] border-amber-400/30'
                                                : 'bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 shadow-[0_0_20px_rgba(34,211,238,0.4)] hover:shadow-[0_0_30px_rgba(34,211,238,0.6)] border-cyan-400/30'
                                            }`}
                                        style={{
                                            paddingTop: STAGE_SELECT_UI.startBtnPadY,
                                            paddingBottom: STAGE_SELECT_UI.startBtnPadY,
                                            borderRadius: STAGE_SELECT_UI.startBtnRadius,
                                            gap: STAGE_SELECT_UI.startBtnGap,
                                            fontSize: STAGE_SELECT_UI.startBtnFontSize,
                                            borderWidth: STAGE_SELECT_UI.startBtnBorderWidth,
                                            borderStyle: 'solid',
                                        }}
                                    >
                                        {isStageCompleted(selectedStage.id, userId) ? (
                                            <><RotateCcw size={STAGE_SELECT_UI.startBtnIconSize} /> 再次考核</>
                                        ) : (
                                            <><Play size={STAGE_SELECT_UI.startBtnIconSize} fill="currentColor" /> 开始考核</>
                                        )}
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    ) : (
                        <motion.div
                            key="empty"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="flex-1 flex flex-col items-center justify-center text-gray-600"
                        >
                            <div className="opacity-20" style={{ fontSize: STAGE_SELECT_UI.emptyIconFontSize, marginBottom: STAGE_SELECT_UI.emptyIconMarginBottom }}>{category.icon}</div>
                            <span className="font-bold tracking-widest uppercase" style={{ fontSize: STAGE_SELECT_UI.emptyNameFontSize }}>{category.name}</span>
                            <span className="text-gray-700" style={{ fontSize: STAGE_SELECT_UI.emptyHintFontSize, marginTop: STAGE_SELECT_UI.emptyHintMarginTop }}>请从左侧选择一个考核关卡</span>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
};
