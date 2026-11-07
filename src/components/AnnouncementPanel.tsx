import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Megaphone, ChevronDown, ChevronUp, Newspaper } from 'lucide-react';
import { ANNOUNCEMENTS } from '../data/announcements';
import { renderMarkdown, type MarkdownTone } from '../utils/markdownRender';
import { eventBus, GameEvents } from '../utils/eventBus';
import { pickTuning } from '../platform/tuning';

// ============================================================================
// 📢 公告中心面板 (AnnouncementPanel)
// 大厅「公告」按钮唤起：左侧「更新公告」下拉版本列表 + 右侧正文（默认最新一期）
// ============================================================================

// ══════════════════════════════════════════════════════════════════════
// 🎛️ 公告中心 · 视觉调参区（**程微调就改这里**）
// ──────────────────────────────────────────────────────────────────────
// 这一屏 = 大厅右上角「公告」按钮点开的公告中心。
// 管：面板尺寸 / 左侧版本列表（标题 · 主按钮 · 版本项）/ 右侧顶栏 / **正文全部字号**
//    （正文由 `utils/markdownRender.tsx` 渲染，字号经 `MarkdownTone` 从这里注入）。
// 改完存盘即生效（HMR —— 雷电/电脑上 1~3 秒看到，不用出包）。
// 命名与用法**对齐 `TITLE_UI`**：值是**绝对 px**、直接进 style；注释标注**原 Tailwind 类**。
//
// 🖥️📱 【双平台】本屏有两套值，同一份代码按运行平台自动二选一：
//   · `ANNOUNCEMENT_UI_MOBILE` = 手机端（安卓壳）—— **程在雷电里调的就是这份**
//   · `ANNOUNCEMENT_UI_PC_DIFF` = PC 端差异项 —— 只列**与手机不同**的项，其余继承手机值
//   判定收在 `src/platform/tuning.ts`（合 `platform/index.ts` 铁律：组件里不出现 isNative）。
//
// 🔴 为什么要有这套旋钮（2026-10-28 程报「公告界面文字太小」）：
//   本屏此前**字号全部写死在 Tailwind 里**（正文 `text-sm` = 14 设计 px）。
//   画布是 1680×1050 整体缩放 ⇒ 手机上 s≈0.374，正文只剩 **约 5.2 CSS px**
//   （PC s≈1.03 → 14.4 CSS px 正常）⇒ 同一份设计 px，手机端读不了。
//   ⚠️ 本屏此前**没有任何调参区**，是「手机端单套值」的典型遗漏。
//
// 📐 手机端初值口径 = **原值 ×1.5**（与 `TITLE_UI` 的 20→30 / 14→21 / 12→18 完全同比例），
//    面板同步放大约 1.18 倍给字号腾地方。**这是起点值，程在雷电里往上/往下拨即可。**
// ══════════════════════════════════════════════════════════════════════

// 📱 手机端值（程继续在这里调）
const ANNOUNCEMENT_UI_MOBILE = {
    // ══ ① 面板主体 ═══════════════════════════════════════════════════
    panelWidth: 1180,       // 原 w-[1000px]
    panelHeight: 820,       // 原 h-[700px]

    // ══ ② 左侧侧边栏 ═════════════════════════════════════════════════
    sidebarWidth: 340,      // 原 w-64 = 256（字号变大 ⇒ 版本号要更宽）
    sidebarPad: 32,         // 原 p-6 = 24
    logoBox: 56,            // 原 w-10 / h-10 = 40
    logoIcon: 28,           // 原 <Megaphone size={20} />
    headerIconGap: 18,      // 原 gap-3 = 12
    headerGapBottom: 40,    // 原 mb-8 = 32
    sideTitleFont: 30,      // 原 text-xl = 20（「公告中心」）
    sideLabelFont: 15,      // 原 text-[10px] = 10（「ANNOUNCEMENT」）

    // ══ ③ 「更新公告」主按钮 ═════════════════════════════════════════
    sectionPadX: 20,        // 原 px-4 = 16
    sectionPadY: 15,        // 原 py-3 = 12
    sectionFont: 21,        // 原 text-sm = 14
    sectionIcon: 24,        // 原 <Newspaper size={16} /> / <ChevronUp size={16} />
    sectionGap: 10,         // 原 gap-2 = 8

    // ══ ④ 版本列表（下拉展开）════════════════════════════════════════
    versionListMaxH: 520,   // 原 max-h-[440px]
    versionListGapTop: 10,  // 原 mt-2 = 8
    versionItemPadX: 15,    // 原 px-3 = 12
    versionItemPadY: 10,    // 原 py-2 = 8
    versionFont: 21,        // 原 text-sm = 14
    versionGap: 6,          // 原 space-y-1 = 4
    versionDot: 9,          // 原 w-1.5 / h-1.5 = 6（当前版本的那个蓝点）

    // ══ ⑤ 右侧顶栏 ═══════════════════════════════════════════════════
    headPadX: 40,           // 原 px-8 = 32
    headPadTop: 40,         // 原 pt-8 = 32
    headPadBottom: 20,      // 原 pb-4 = 16
    headPrRight: 88,        // 原 pr-16 = 64（给右上关闭按钮让位）
    headVersionFont: 36,    // 原 text-2xl = 24（「vX.Y.Z 更新公告」）
    versionNumGap: 10,      // 原 mr-2 = 8
    headDateFont: 18,       // 原 text-xs = 12（「发布于 …」）
    headDateGapTop: 6,      // 原 mt-1 = 4

    // ══ ⑥ 右上关闭按钮 ═══════════════════════════════════════════════
    closeTop: 32,           // 原 top-6 = 24
    closeRight: 32,         // 原 right-6 = 24
    closePad: 10,           // 原 p-2 = 8
    closeIcon: 32,          // 原 <X size={24} />

    // ══ ⑦ 正文滚动区（外框）══════════════════════════════════════════
    bodyPadX: 40,           // 原 px-8 = 32
    bodyPadY: 30,           // 原 py-6 = 24

    // ══ ⑧ 正文排版（交给 `utils/markdownRender.tsx` 的 MarkdownTone）══
    //  ⚠️ 这七项是公告**正文**的字号/行高，改它们才是「公告读不清」的正解
    bodyFont: 21,           // 原 text-sm = 14（段落 + 列表）
    bodyLineHeight: 1.625,  // 原 leading-relaxed
    h1Font: 30,             // 原 text-xl = 20
    h2Font: 27,             // 原 text-lg = 18
    h3Font: 24,             // 原 text-base = 16
    listGap: 9,             // 原 space-y-1.5 = 6（列表项之间）
    depthIndent: 30,        // 原 depth × 20（嵌套列表每层缩进）
    bulletWidth: 18,        // 原 w-3 = 12（列表圆点占位宽）
    bulletGap: 12,          // 原 gap-2 = 8（圆点与文字的间距）
};

// ══════════════════════════════════════════════════════════════════════
// 🖥️ PC 端差异项 —— 只列「与手机端不同」的项；未列出的项两端相同
// ──────────────────────────────────────────────────────────────────────
// 依据：本屏在 2026-10-28 之前**从未抽调参区**，所以 PC 值 = 当时 Tailwind 类的
//       直接换算值（×4px），无历史手调、无 git 歧义 —— 与 `TITLE_UI` 那种
//       "手调与抽调参区压在同一次提交"的情况不同，这里可以放心以类名为准。
// 改这里 = 改 PC 端观感；改上面 = 改手机端观感。
// ══════════════════════════════════════════════════════════════════════
const ANNOUNCEMENT_UI_PC_DIFF = {
    // ① 面板主体
    panelWidth: 1000,       // 原 w-[1000px]
    panelHeight: 700,       // 原 h-[700px]

    // ② 左侧侧边栏
    sidebarWidth: 256,      // 原 w-64
    sidebarPad: 24,         // 原 p-6
    logoBox: 40,            // 原 w-10 / h-10
    logoIcon: 20,           // 原 <Megaphone size={20} />
    headerIconGap: 12,      // 原 gap-3
    headerGapBottom: 32,    // 原 mb-8
    sideTitleFont: 20,      // 原 text-xl
    sideLabelFont: 10,      // 原 text-[10px]

    // ③ 「更新公告」主按钮
    sectionPadX: 16,        // 原 px-4
    sectionPadY: 12,        // 原 py-3
    sectionFont: 14,        // 原 text-sm
    sectionIcon: 16,        // 原 size={16}
    sectionGap: 8,          // 原 gap-2

    // ④ 版本列表
    versionListMaxH: 440,   // 原 max-h-[440px]
    versionListGapTop: 8,   // 原 mt-2
    versionItemPadX: 12,    // 原 px-3
    versionItemPadY: 8,     // 原 py-2
    versionFont: 14,        // 原 text-sm
    versionGap: 4,          // 原 space-y-1
    versionDot: 6,          // 原 w-1.5 / h-1.5

    // ⑤ 右侧顶栏
    headPadX: 32,           // 原 px-8
    headPadTop: 32,         // 原 pt-8
    headPadBottom: 16,      // 原 pb-4
    headPrRight: 64,        // 原 pr-16
    headVersionFont: 24,    // 原 text-2xl
    versionNumGap: 8,       // 原 mr-2
    headDateFont: 12,       // 原 text-xs
    headDateGapTop: 4,      // 原 mt-1

    // ⑥ 关闭按钮
    closeTop: 24,           // 原 top-6
    closeRight: 24,         // 原 right-6
    closePad: 8,            // 原 p-2
    closeIcon: 24,          // 原 <X size={24} />

    // ⑦ 正文滚动区
    bodyPadX: 32,           // 原 px-8
    bodyPadY: 24,           // 原 py-6

    // ⑧ 正文排版
    bodyFont: 14,           // 原 text-sm
    bodyLineHeight: 1.625,  // 原 leading-relaxed
    h1Font: 20,             // 原 text-xl
    h2Font: 18,             // 原 text-lg
    h3Font: 16,             // 原 text-base
    listGap: 6,             // 原 space-y-1.5
    depthIndent: 20,        // 原 depth × 20
    bulletWidth: 12,        // 原 w-3
    bulletGap: 8,           // 原 gap-2
};

/** PC 端完整值 = 手机值为底 + PC 差异覆盖 */
const ANNOUNCEMENT_UI_PC = { ...ANNOUNCEMENT_UI_MOBILE, ...ANNOUNCEMENT_UI_PC_DIFF };

/** 🖥️ PC / 📱 手机 —— 按运行平台自动二选一（平台判定在 `src/platform/tuning.ts`） */
export const ANNOUNCEMENT_UI = pickTuning(ANNOUNCEMENT_UI_PC, ANNOUNCEMENT_UI_MOBILE);

interface AnnouncementPanelProps {
    isOpen: boolean;
    onClose: () => void;
}

export const AnnouncementPanel: React.FC<AnnouncementPanelProps> = ({ isOpen, onClose }) => {
    // 默认选中最新一期（ANNOUNCEMENTS 按版本降序，[0] 即最新）
    const [selectedVersion, setSelectedVersion] = useState(ANNOUNCEMENTS[0]?.version ?? '');
    // 左侧「更新公告」版本列表是否展开（默认展开，方便玩家看到全部版本）
    const [listOpen, setListOpen] = useState(true);

    const selected = ANNOUNCEMENTS.find(a => a.version === selectedVersion) ?? ANNOUNCEMENTS[0];

    // 正文字号交给调参区（⑧ 那七项）——本屏是 `renderMarkdown` 的唯一使用者
    const bodyTone: MarkdownTone = {
        bodyFont: ANNOUNCEMENT_UI.bodyFont,
        bodyLineHeight: ANNOUNCEMENT_UI.bodyLineHeight,
        h1Font: ANNOUNCEMENT_UI.h1Font,
        h2Font: ANNOUNCEMENT_UI.h2Font,
        h3Font: ANNOUNCEMENT_UI.h3Font,
        listGap: ANNOUNCEMENT_UI.listGap,
        depthIndent: ANNOUNCEMENT_UI.depthIndent,
        bulletWidth: ANNOUNCEMENT_UI.bulletWidth,
        bulletGap: ANNOUNCEMENT_UI.bulletGap,
    };

    // ESC 关闭：capture + stopImmediatePropagation 拦截 App.tsx 全局 ESC（避免误呼出设置面板）
    useEffect(() => {
        if (!isOpen) return;
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') { eventBus.emit(GameEvents.UI_BACK);
                e.stopImmediatePropagation();
                onClose();
            }
        };
        window.addEventListener('keydown', handler, { capture: true });
        return () => window.removeEventListener('keydown', handler, { capture: true });
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[600] flex items-center justify-center font-sans select-none">
            {/* 暗影底衬 */}
            <motion.div
                className="absolute inset-0 bg-slate-950/80 backdrop-blur-md"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                onClick={() => { eventBus.emit(GameEvents.UI_BACK); onClose(); }}
            />

            {/* 面板主体 */}
            <motion.div
                className="relative bg-slate-900/90 border border-blue-500/30 rounded-2xl shadow-[0_0_80px_rgba(30,58,138,0.4)] flex overflow-hidden backdrop-blur-xl"
                style={{ width: ANNOUNCEMENT_UI.panelWidth, height: ANNOUNCEMENT_UI.panelHeight }}
                initial={{ scale: 0.95, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.95, opacity: 0, y: 20 }}
                transition={{ type: "spring", stiffness: 200, damping: 20 }}
            >
                {/* 内部高光 */}
                <div className="absolute top-0 w-full h-[30%] bg-gradient-to-b from-blue-600/10 to-transparent pointer-events-none" />

                {/* 左侧侧边栏 */}
                <div
                    className="bg-slate-950/50 border-r border-blue-500/20 flex flex-col shrink-0 relative z-10"
                    style={{ width: ANNOUNCEMENT_UI.sidebarWidth, padding: ANNOUNCEMENT_UI.sidebarPad }}
                >
                    <div className="flex items-center" style={{ gap: ANNOUNCEMENT_UI.headerIconGap, marginBottom: ANNOUNCEMENT_UI.headerGapBottom }}>
                        <div
                            className="bg-blue-900/50 rounded-lg flex items-center justify-center border border-blue-500/50 shadow-[0_0_15px_blue] shrink-0"
                            style={{ width: ANNOUNCEMENT_UI.logoBox, height: ANNOUNCEMENT_UI.logoBox }}
                        >
                            <Megaphone size={ANNOUNCEMENT_UI.logoIcon} className="text-blue-400" />
                        </div>
                        <div>
                            <h2 className="font-black text-white tracking-widest" style={{ fontSize: ANNOUNCEMENT_UI.sideTitleFont }}>公告中心</h2>
                            <p className="text-blue-500/80 font-mono tracking-wider" style={{ fontSize: ANNOUNCEMENT_UI.sideLabelFont }}>ANNOUNCEMENT</p>
                        </div>
                    </div>

                    {/* 「更新公告」主按钮：点击下拉/收起版本列表 */}
                    <button
                        onClick={() => { setListOpen(!listOpen); eventBus.emit(GameEvents.UI_CLICK); }}
                        className={`flex items-center justify-between rounded-lg border transition-all duration-300 ${
                            listOpen
                                ? 'bg-blue-900/40 border-blue-500/50 text-white'
                                : 'bg-slate-800/40 border-white/10 text-gray-300 hover:border-blue-500/40 hover:text-white'
                        }`}
                        style={{ paddingLeft: ANNOUNCEMENT_UI.sectionPadX, paddingRight: ANNOUNCEMENT_UI.sectionPadX, paddingTop: ANNOUNCEMENT_UI.sectionPadY, paddingBottom: ANNOUNCEMENT_UI.sectionPadY }}
                    >
                        <span className="flex items-center font-black tracking-widest" style={{ gap: ANNOUNCEMENT_UI.sectionGap, fontSize: ANNOUNCEMENT_UI.sectionFont }}>
                            <Newspaper size={ANNOUNCEMENT_UI.sectionIcon} className="text-blue-400" /> 更新公告
                        </span>
                        {listOpen
                            ? <ChevronUp size={ANNOUNCEMENT_UI.sectionIcon} className="text-blue-300" />
                            : <ChevronDown size={ANNOUNCEMENT_UI.sectionIcon} className="text-gray-400" />}
                    </button>

                    {/* 版本列表（下拉展开，可滚动） */}
                    <AnimatePresence initial={false}>
                        {listOpen && (
                            <motion.div
                                key="ann-version-list"
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.25, ease: 'easeOut' }}
                                className="overflow-hidden"
                            >
                                <div
                                    className="overflow-y-auto custom-scrollbar pr-1 flex flex-col"
                                    style={{
                                        marginTop: ANNOUNCEMENT_UI.versionListGapTop,
                                        maxHeight: ANNOUNCEMENT_UI.versionListMaxH,
                                        gap: ANNOUNCEMENT_UI.versionGap,
                                    }}
                                >
                                    {ANNOUNCEMENTS.map(a => {
                                        const active = a.version === selectedVersion;
                                        return (
                                            <button
                                                key={a.version}
                                                onClick={() => { setSelectedVersion(a.version); eventBus.emit(GameEvents.UI_CLICK); }}
                                                className={`w-full text-left rounded-md font-mono tracking-wide transition-all duration-200 border-l-2 shrink-0 ${
                                                    active
                                                        ? 'bg-blue-900/50 border-blue-400 text-white'
                                                        : 'border-transparent text-gray-400 hover:bg-white/5 hover:text-white'
                                                }`}
                                                style={{
                                                    paddingLeft: ANNOUNCEMENT_UI.versionItemPadX,
                                                    paddingRight: ANNOUNCEMENT_UI.versionItemPadX,
                                                    paddingTop: ANNOUNCEMENT_UI.versionItemPadY,
                                                    paddingBottom: ANNOUNCEMENT_UI.versionItemPadY,
                                                    fontSize: ANNOUNCEMENT_UI.versionFont,
                                                }}
                                            >
                                                <span className="flex items-center justify-between">
                                                    {a.version}
                                                    {active && (
                                                        <span
                                                            className="bg-blue-400 rounded-full"
                                                            style={{ width: ANNOUNCEMENT_UI.versionDot, height: ANNOUNCEMENT_UI.versionDot }}
                                                        />
                                                    )}
                                                </span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                {/* 右侧正文区 */}
                <div className="flex-1 flex flex-col relative z-10 min-w-0">
                    {/* 关闭按钮 */}
                    <button
                        onClick={() => { onClose(); eventBus.emit(GameEvents.UI_BACK); }}
                        className="absolute rounded-full text-blue-500/50 hover:bg-blue-900/30 hover:text-white transition-all z-20"
                        style={{ top: ANNOUNCEMENT_UI.closeTop, right: ANNOUNCEMENT_UI.closeRight, padding: ANNOUNCEMENT_UI.closePad }}
                    >
                        <X size={ANNOUNCEMENT_UI.closeIcon} />
                    </button>

                    {/* 顶栏：当前版本标题 */}
                    <div
                        className="border-b border-white/10"
                        style={{
                            paddingLeft: ANNOUNCEMENT_UI.headPadX,
                            paddingRight: ANNOUNCEMENT_UI.headPrRight,
                            paddingTop: ANNOUNCEMENT_UI.headPadTop,
                            paddingBottom: ANNOUNCEMENT_UI.headPadBottom,
                        }}
                    >
                        <h3 className="font-black text-white tracking-widest" style={{ fontSize: ANNOUNCEMENT_UI.headVersionFont }}>
                            <span className="text-blue-400 font-mono" style={{ marginRight: ANNOUNCEMENT_UI.versionNumGap }}>{selected?.version ?? ''}</span>更新公告
                        </h3>
                        {selected?.date && (
                            <p className="text-gray-500 font-mono" style={{ fontSize: ANNOUNCEMENT_UI.headDateFont, marginTop: ANNOUNCEMENT_UI.headDateGapTop }}>发布于 {selected.date}</p>
                        )}
                    </div>

                    {/* 正文滚动区 */}
                    <div
                        className="flex-1 overflow-y-auto custom-scrollbar"
                        style={{ paddingLeft: ANNOUNCEMENT_UI.bodyPadX, paddingRight: ANNOUNCEMENT_UI.bodyPadX, paddingTop: ANNOUNCEMENT_UI.bodyPadY, paddingBottom: ANNOUNCEMENT_UI.bodyPadY }}
                    >
                        {selected ? renderMarkdown(selected.content, bodyTone) : null}
                    </div>
                </div>
            </motion.div>
        </div>
    );
};
