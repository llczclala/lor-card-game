import React from 'react';
import { Sword, Dices, Swords, Skull, BookOpen, ArrowLeft } from 'lucide-react';
import { eventBus, GameEvents } from '../utils/eventBus';

// ══════════════════════════════════════════════════════════════════════
// 🎛️ 模式选择（`ModeSelectScreen`）· 视觉调参区（**程微调就改这里**）
// ──────────────────────────────────────────────────────────────────────
// 这一屏 = 大厅点「战斗」进来、选完模式再去「备战 / 悖论迷宫 / 战术考核」的那一屏。
// 管：① 顶部（标题 + 右上返回按钮）② 3×3 舞台框（高 / 间距 / 内边距）
//     ③ 四张角卡（地下清理 · 悖论迷宫 · 精神拟境 · 战术考核）
//     ④ 正中「超元链接」大圆 ⑤ 底部「返回大厅」
// 改完存盘即生效（HMR —— 雷电/电脑上 1~3 秒看到，不用出包）。
// 命名与用法**对齐 `TITLE_UI`**：值是**绝对画布 px**、直接进 style；注释标注**原 Tailwind 类**。
// ⚠️ 本屏跑在 `ScaleWrapper` 的 1680×1050 画布内 ⇒ **禁 vh/vw**（原 `h-[65vh]` 已于 2026-10-15 换算成 683px）。
// ⚠️ `stageMaxWidth` 那条注释务必看一眼 —— 它有一个**不能随手改成数字**的理由。
// ══════════════════════════════════════════════════════════════════════
export const MODE_UI = {
    /**
     * 【主旋钮】整块 3×3 舞台（正中大圆 + 四张角卡 + 它们之间的间距）的**整体缩放**（1 = 原样）。
     *
     * 用途：觉得「整屏元素都偏小 / 偏大」时拨这一个数就够 —— **别**逐张卡片去凑。
     * ⚠️ 它只缩**舞台**：标题、右上返回、底部「返回大厅」**不跟着变**（那三处各有自己的旋钮）。
     * ✅ `transform` 不改布局尺寸，而本屏的舞台是**居中的唯一 in-flow 子元素**、
     *    上下邻居（标题 / 返回大厅）都是 `absolute` ⇒ 放大**不会挤走谁**，**不需要**补 `margin`。
     *    （这一点与备战枢纽那个牌组盒子不同 —— 那个上下都有普通流邻居，必须上下各补一半。）
     * 📐 上限（**算出来的**，不是估的）：舞台 683 高、居中于 1050 ⇒ 上下各留 183.5；
     *    角卡实际上下边缘约在中心 `±310` 处 ⇒ `310 × s ≤ 524` ⇒ `s ≲ 1.6`；
     *    但要**不贴到标题**（`top-12` = 48）⇒ **实用上限约 1.35 ~ 1.4**。
     *    横向富余得多（四张卡最外缘约 `±541`，画布半宽 840）⇒ `s = 1.5` 仍在画布内。
     */
    stageScale: 1,

    // ══ ① 顶部（标题 + 右上返回按钮）═══════════════════════════════════
    /** 标题距顶 px（原 top-12 = 48） */
    titleTop: 48,
    /** 标题字号 px（原 text-4xl = 36） */
    titleFontSize: 36,

    /** 返回按钮距顶 px（原 top-8 = 32） */
    backTop: 32,
    /** 返回按钮距右 px（原 right-8 = 32） */
    backRight: 32,
    /** 返回按钮内边距 px（原 p-3 = 12） */
    backPad: 12,
    /** 返回箭头图标 px（原 `<ArrowLeft size={24} />`） */
    backIconSize: 24,

    // ══ ② 3×3 舞台框 ═══════════════════════════════════════════════════
    /** 舞台高度 px（原 h-[683px]；更早是 65vh —— 1050 × 65% = 683） */
    stageHeight: 683,
    /** 舞台内三行三列间距 px（原 gap-6 = 24） */
    stageGap: 24,
    /** 舞台内边距 px（原 p-8 = 32） */
    stagePad: 32,
    /**
     * 舞台最大宽度（原 `max-w-6xl`）。
     * 🔴 **默认必须留 `'none'`**：`index.css:56` 那条
     *    `#game-scale-container [class*="max-w-"] { max-width: none !important }`
     *    把原来的 `max-w-6xl` **打死过** ⇒ 它**从来没生效**（舞台一直是满宽 1680）。
     *    而搬成**内联**之后，`!important` 压不住内联 ⇒ **一旦填数字，上限就"突然真的生效"、整屏变窄**
     *    （这个坑在 `StyleSelector` 上踩过一次）。想启用上限再改成数字，并在这里补一句「我确实要它生效」。
     */
    stageMaxWidth: 'none',

    // ══ ③ 四张角卡（地下清理 / 悖论迷宫 / 精神拟境 / 战术考核）═══════════
    /** 角卡宽 px（原 w-64 = 256） */
    cardWidth: 256,
    /** 角卡高 px（原 h-40 = 160） */
    cardHeight: 160,
    /** 角卡圆角 px（原 rounded-2xl = 16） */
    cardRadius: 16,
    /** 卡内「图标 ↔ 文字」纵向间距 px（原 gap-2 = 8） */
    cardGap: 8,
    /** 卡内图标 px（原 `size={40}`） */
    cardIconSize: 40,
    /** 卡名 字号 px（原 text-xl = 20） */
    cardTitleFontSize: 20,
    /** 卡副标 字号 px（原 text-[10px]） */
    cardDescFontSize: 10,
    /** 「精神拟境」锁遮罩里 LOCKED 的字号 px（原 text-xs = 12） */
    lockFontSize: 12,
    /** 卡顶那根 hover 装饰横条的高度 px（原 h-1 = 4） */
    cardAccentBarHeight: 4,

    // ══ ④ 正中「超元链接」大圆 ═════════════════════════════════════════
    /** 圆直径 px（原 w-80 h-80 = 320） */
    centerSize: 320,
    /** 圆环描边粗细 px（原 border-2） */
    centerBorderWidth: 2,
    /** 圆内图标 px（原 `size={80}`） */
    centerIconSize: 80,
    /** 圆内主标题字号 px（原 text-4xl = 36） */
    centerTitleFontSize: 36,
    /** 圆内副标字号 px（原 text-xs = 12） */
    centerDescFontSize: 12,
    /** 副标的上外边距 px（原 mt-2 = 8） */
    centerDescMarginTop: 8,
    /** 圆内「图标 ↔ 文字」纵向间距 px（原 gap-4 = 16） */
    centerGap: 16,
    /** 「绝赞开发中」徽章距圆底 px（原 bottom-12 = 48） */
    badgeBottom: 48,
    /** 徽章左右内边距 px（原 px-4 = 16） */
    badgePadX: 16,
    /** 徽章上下内边距 px（原 py-1 = 4） */
    badgePadY: 4,
    /** 徽章字号 px（原 text-[10px]） */
    badgeFontSize: 10,

    // ══ ⑤ 底部「返回大厅」═══════════════════════════════════════════════
    /** 距底 px（原 bottom-12 = 48） */
    lobbyBtnBottom: 48,
    /** 字号 px（原 text-sm = 14） */
    lobbyBtnFontSize: 14,
} as const;

/** 四张角卡**共用**的盒子尺寸（都读 `MODE_UI` ⇒ 改一处、四张一起变） */
const cornerCardStyle: React.CSSProperties = {
    width: MODE_UI.cardWidth,
    height: MODE_UI.cardHeight,
    borderRadius: MODE_UI.cardRadius,
    gap: MODE_UI.cardGap,
};

/** 卡顶那根 hover 装饰横条（原 `w-full h-1`，宽度仍是 `w-full`） */
const cornerAccentBarStyle: React.CSSProperties = {
    height: MODE_UI.cardAccentBarHeight,
};

interface ModeSelectScreenProps {
    onPvESelect: () => void;
    onBack: () => void;
    onTutorialSelect?: () => void; // [新增] 教程模式入口
    onRogueSelect?: () => void; // [新增] 肉鸽模式入口
}

export const ModeSelectScreen: React.FC<ModeSelectScreenProps> = ({
    onPvESelect,
    onBack,
    onTutorialSelect,
    onRogueSelect
}) => {
    // 主旋钮先拓宽成 number 再比较（`as const` 会让它变成字面量类型 ⇒ 程一调就报 TS2367）
    const stageScale = Number(MODE_UI.stageScale);

    return (
        <div className="w-full h-full flex flex-col items-center justify-center animate-fade-in z-20 relative font-sans select-none text-white">

            {/* 纯黑背景 (复刻原 TitleScreen 的 mode check else 分支) */}
            <div className="absolute inset-0 bg-black z-0"></div>

            {/* 右上角返回按钮 */}
            <button
                onClick={() => {
                    eventBus.emit(GameEvents.UI_BACK); // 触发撤回音效
                    onBack();
                }}
                className="absolute z-[999] rounded-full bg-white/5 hover:bg-white/20 border border-white/10 hover:border-white/50 transition-all group"
                style={{
                    top: MODE_UI.backTop,
                    right: MODE_UI.backRight,
                    padding: MODE_UI.backPad,
                }}
            >
                <ArrowLeft size={MODE_UI.backIconSize} className="text-gray-400 group-hover:text-white transition-colors" />
            </button>

            {/* 标题 */}
            <h2
                className="absolute font-black tracking-tighter italic text-transparent bg-clip-text bg-gradient-to-r from-white to-gray-400 drop-shadow-lg z-30"
                style={{ top: MODE_UI.titleTop, fontSize: MODE_UI.titleFontSize }}
            >
                模式选择
            </h2>

            {/* [核心布局] 3x3 网格布局实现环绕效果 */}
            <div
                className="grid grid-cols-3 grid-rows-3 w-full items-center justify-items-center z-20"
                style={{
                    height: MODE_UI.stageHeight,
                    gap: MODE_UI.stageGap,
                    padding: MODE_UI.stagePad,
                    maxWidth: MODE_UI.stageMaxWidth,
                    // 主旋钮 = 1 时**一项内联 transform 都不加** ⇒ 与改动前逐字节等价
                    ...(stageScale !== 1 ? { transform: `scale(${stageScale})` } : {}),
                }}
            >

                {/* 1. 左上角: PvE (可用) */}
                <div className="col-start-1 row-start-1 w-full h-full flex justify-end items-end">
                    <div
                        onClick={() => {
                            eventBus.emit(GameEvents.UI_CLICK);
                            onPvESelect();
                        }}
                        className="group relative bg-gradient-to-br from-blue-900/60 to-slate-900/60 border border-blue-400/30 overflow-hidden hover:border-blue-400 hover:bg-blue-900/80 transition-all hover:scale-105 hover:shadow-[0_0_30px_rgba(59,130,246,0.4)] cursor-pointer flex flex-col items-center justify-center"
                        style={cornerCardStyle}
                    >
                        <Sword size={MODE_UI.cardIconSize} className="text-blue-400 group-hover:text-white transition-colors" />
                        <div className="text-center">
                            <h3 className="font-black tracking-widest text-blue-100 group-hover:text-white" style={{ fontSize: MODE_UI.cardTitleFontSize }}>地下清理</h3>
                            <p className="font-mono text-blue-300/60" style={{ fontSize: MODE_UI.cardDescFontSize }}>开始一场人机对局</p>
                        </div>
                        {/* 装饰角标 */}
                        <div className="absolute top-0 left-0 w-full bg-blue-500/50 transform origin-left scale-x-0 group-hover:scale-x-100 transition-transform duration-300" style={cornerAccentBarStyle}></div>
                    </div>
                </div>

                {/* 2. 右上角: Roguelike (肉鸽) - 悖论迷宫 */}
                <div className="col-start-3 row-start-1 w-full h-full flex justify-start items-end">
                    <div
                        onClick={() => {
                            eventBus.emit(GameEvents.UI_CLICK);
                            onRogueSelect?.();
                        }}
                        className="group relative bg-gradient-to-br from-purple-900/60 to-slate-900/60 border border-purple-400/30 overflow-hidden hover:border-purple-400 hover:bg-purple-900/80 transition-all hover:scale-105 hover:shadow-[0_0_30px_rgba(168,85,247,0.4)] cursor-pointer flex flex-col items-center justify-center"
                        style={cornerCardStyle}
                    >
                        <Dices size={MODE_UI.cardIconSize} className="text-purple-400 group-hover:text-white transition-colors" />
                        <div className="text-center">
                            <h3 className="font-black tracking-widest text-purple-100 group-hover:text-white" style={{ fontSize: MODE_UI.cardTitleFontSize }}>悖论迷宫</h3>
                            <p className="font-mono text-purple-300/60" style={{ fontSize: MODE_UI.cardDescFontSize }}>肉鸽 · 点击开启推演</p>
                        </div>
                        <div className="absolute top-0 left-0 w-full bg-purple-500/50 transform origin-left scale-x-0 group-hover:scale-x-100 transition-transform duration-300" style={cornerAccentBarStyle}></div>
                    </div>
                </div>

                {/* 3. 中心: PvP (核心模式) - 占位 */}
                <div className="col-start-2 row-start-2 w-full h-full flex justify-center items-center z-30">
                    <div
                        className="group relative bg-gradient-to-b from-red-900/40 to-black/60 border-red-500/30 rounded-full overflow-hidden grayscale opacity-80 hover:opacity-100 hover:border-red-500 transition-all hover:scale-105 cursor-not-allowed shadow-2xl flex flex-col items-center justify-center"
                        style={{
                            width: MODE_UI.centerSize,
                            height: MODE_UI.centerSize,
                            borderWidth: MODE_UI.centerBorderWidth,
                            gap: MODE_UI.centerGap,
                        }}
                    >
                        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(220,38,38,0.2),transparent)] opacity-50 group-hover:opacity-100 animate-pulse-slow"></div>
                        <Swords size={MODE_UI.centerIconSize} className="text-red-500 drop-shadow-[0_0_10px_rgba(220,38,38,0.8)]" />
                        <div className="text-center z-10">
                            <h3 className="font-black tracking-tighter text-red-100 drop-shadow-md" style={{ fontSize: MODE_UI.centerTitleFontSize }}>超元链接</h3>
                            <p className="font-mono text-red-400/80 tracking-[0.5em]" style={{ fontSize: MODE_UI.centerDescFontSize, marginTop: MODE_UI.centerDescMarginTop }}>开始一场真人对局</p>
                        </div>
                        <div
                            className="absolute bg-black/60 rounded-full border border-white/10 text-gray-400 font-mono"
                            style={{
                                bottom: MODE_UI.badgeBottom,
                                paddingLeft: MODE_UI.badgePadX,
                                paddingRight: MODE_UI.badgePadX,
                                paddingTop: MODE_UI.badgePadY,
                                paddingBottom: MODE_UI.badgePadY,
                                fontSize: MODE_UI.badgeFontSize,
                            }}
                        >
                            绝赞开发中。。。
                        </div>
                    </div>
                </div>

                {/* 4. 左下角: BOSS (挑战) - 占位 */}
                <div className="col-start-1 row-start-3 w-full h-full flex justify-end items-start">
                    <div
                        className="group relative bg-slate-800/40 border border-white/5 overflow-hidden grayscale opacity-60 cursor-not-allowed flex flex-col items-center justify-center hover:opacity-80 transition-opacity"
                        style={cornerCardStyle}
                    >
                        <Skull size={MODE_UI.cardIconSize} className="text-red-400" />
                        <div className="text-center">
                            <h3 className="font-black tracking-widest text-gray-400" style={{ fontSize: MODE_UI.cardTitleFontSize }}>精神拟境</h3>
                            <p className="font-mono text-gray-600" style={{ fontSize: MODE_UI.cardDescFontSize }}>紧张刺激的BOSS战</p>
                        </div>
                        <div className="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-sm">
                            <span className="font-mono font-bold text-white/80" style={{ fontSize: MODE_UI.lockFontSize }}>LOCKED</span>
                        </div>
                    </div>
                </div>

                {/* 5. 右下角: Tutorial (教程) — 战术考核 */}
                <div className="col-start-3 row-start-3 w-full h-full flex justify-start items-start">
                    <div
                        onClick={() => {
                            eventBus.emit(GameEvents.UI_CLICK);
                            onTutorialSelect?.();
                        }}
                        className="group relative bg-gradient-to-br from-amber-900/60 to-slate-900/60 border border-amber-400/30 overflow-hidden hover:border-amber-400 hover:bg-amber-900/80 transition-all hover:scale-105 hover:shadow-[0_0_30px_rgba(250,204,21,0.4)] cursor-pointer flex flex-col items-center justify-center"
                        style={cornerCardStyle}
                    >
                        <BookOpen size={MODE_UI.cardIconSize} className="text-amber-400 group-hover:text-white transition-colors" />
                        <div className="text-center">
                            <h3 className="font-black tracking-widest text-amber-100 group-hover:text-white" style={{ fontSize: MODE_UI.cardTitleFontSize }}>战术考核</h3>
                            <p className="font-mono text-amber-300/60" style={{ fontSize: MODE_UI.cardDescFontSize }}>学习各种操作战术技巧</p>
                        </div>
                        {/* 装饰角标 */}
                        <div className="absolute top-0 left-0 w-full bg-amber-500/50 transform origin-left scale-x-0 group-hover:scale-x-100 transition-transform duration-300" style={cornerAccentBarStyle}></div>
                    </div>
                </div>

            </div>

            {/* 底部返回按钮 */}
            <button
                onClick={() => {
                    eventBus.emit(GameEvents.UI_BACK);
                    onBack();
                }}
                className="absolute text-gray-500 hover:text-white transition-colors font-mono border-b border-transparent hover:border-white/50 z-30"
                style={{ bottom: MODE_UI.lobbyBtnBottom, fontSize: MODE_UI.lobbyBtnFontSize }}
            >
                返回大厅
            </button>
        </div>
    );
};
