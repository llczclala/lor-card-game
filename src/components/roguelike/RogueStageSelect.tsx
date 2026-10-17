// ==========================================
// 悖论迷宫 · 关卡选择界面
// 左侧关卡列表（左上角，缩略图老电视轮播）+ 右侧地图背景（难度视觉压迫层）+ 右下难度三选一
// [2026-08-07] 难度只影响地图/敌人/迷宫BUFF，不影响AI
// ==========================================
import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, Lock } from 'lucide-react';
import { eventBus, GameEvents } from '../../utils/eventBus';
import { ROGUE_DIFFICULTIES } from '../../data/roguelike/difficulties';
import type { RogueDifficulty } from '../../data/roguelike/difficulties';
import mapZero from '../../image/map/map_zero.webp';
import mapZeroVideo from '../../movie/map/map_zero.webm'; // [2026-09-26 莉莉子] 动态地图背景（MiniMax H3 生成）
// [2026-10-10] 诊断探针加全：本页的视频是独立元素（没走 LoopVideo），单独挂探针（默认静默）
import { attachVideoProbe } from '../../utils/videoDiagnostics';
import type { useUserSystem } from '../../hooks/useUserSystem';

// ══════════════════════════════════════════════════════════════════════
// 🎛️ 悖论迷宫 · **关卡选择**（`RogueStageSelect`）· 视觉调参区（**程微调就改这里**）
// ──────────────────────────────────────────────────────────────────────
// 这一屏 = 肉鸽大厅点「前往推演」进来那一屏：左上老电视轮播的关卡列表 +
//   铺满全屏、随难度换滤镜的地图背景 + 右下「难度三选一 + 进行推演」+ 右上返回。
// 管：①左上关卡列表 ②右下难度与推演 ③右上返回 ④未解锁锁提示 ⑤绝密四角取景框
// 改完存盘即生效（HMR —— 雷电/电脑上 1~3 秒看到，不用出包）。
// 命名与用法**对齐 `TITLE_UI`**：值是**绝对画布 px**、直接进 style；注释标注**原 Tailwind 类**。
// ⚠️ 本屏**没有** `max-w-*` / `vh` / `vw`，天生合铁律（1680×1050 画布）。
// ⚠️ 主旋钮 `uiScale` **只缩三组角落控件**，地图背景不动 —— 它是 `inset-0 + object-cover`
//      的铺满层，缩放它只会露出黑边。三组各自 `transform-origin` 钉在自己那一角，
//      放大时朝屏幕内侧长 ⇒ **不需要补 margin**（同 `ROGUE_LOBBY_UI.uiScale`）。
// ⚠️ 刻意**没搬**的类（都是"铺满/装饰/状态反馈"，不是可调尺寸）：
//      `inset-0` · `w-full/h-full` · `opacity-*` · `scale-105`（难度选中态）·
//      `tracking-*` · `rotate-[-8deg]`（铭牌倾斜）· `drop-shadow-*` · `mix-blend-overlay` ·
//      `animate-[rogue-*]`（抖动/呼吸/扫描线/雪花，全在 `index.css` 关键帧里）
// ══════════════════════════════════════════════════════════════════════
export const ROGUE_STAGE_UI = {
    /** 【主旋钮】三组角落控件（关卡列表 / 难度+推演 / 返回）整体缩放（1 = 原样） */
    uiScale: 1,

    // ══ ① 左上：关卡列表 ═══════════════════════════════════════════════
    /** 距左 px（原 left-8 = 32） */
    listLeft: 32,
    /** 距顶 px（原 top-8 = 32） */
    listTop: 32,
    /** 列表宽 px（原 w-72 = 288） */
    listWidth: 288,
    /** 两张关卡卡之间的行距 px（原 gap-4 = 16） */
    listGap: 16,
    /** 关卡卡圆角 px（原 rounded-xl = 12） */
    cardRadius: 12,
    /** 关卡卡描边 px（原 border-2 = 2） */
    cardBorderWidth: 2,
    /** 缩略图高 px（原 h-32 = 128）· 缩略图容器 / 图本体 / 占位块**三处共用** */
    thumbHeight: 128,
    /** 「零区」铭牌：距下 px（原 bottom-1.5 = 6） */
    labelBottom: 6,
    /** 「零区」铭牌：距右 px（原 right-2 = 8） */
    labelRight: 8,
    /** 「零区」铭牌：左右内边距 px（原 px-2 = 8） */
    labelPadX: 8,
    /** 「零区」铭牌：上下内边距 px（原 py-0.5 = 2） */
    labelPadY: 2,
    /** 「零区」铭牌：圆角 px（原 rounded-sm = 2） */
    labelRadius: 2,
    /** 「零区」铭牌：字号 px（原 text-xs = 12） */
    labelFontSize: 12,
    /** 「迷宫拓展中。。。」占位块字号 px（原 text-sm = 14） */
    placeholderFontSize: 14,

    // ══ ② 右下：难度三选一 + 进行推演 ═════════════════════════════════
    /** 整组距右 px（原 right-8 = 32） */
    panelRight: 32,
    /** 整组距下 px（原 bottom-8 = 32） */
    panelBottom: 32,
    /** 「难度行」与「进行推演」之间 px（原 gap-4 = 16） */
    panelGap: 16,
    /** 三个难度按钮之间 px（原 gap-3 = 12） */
    diffRowGap: 12,
    /** 难度按钮：左右内边距 px（原 px-4 = 16） */
    diffBtnPadX: 16,
    /** 难度按钮：上下内边距 px（原 py-2 = 8） */
    diffBtnPadY: 8,
    /** 难度按钮：圆角 px（原 rounded-xl = 12） */
    diffBtnRadius: 12,
    /** 难度按钮：字号 px（原 text-sm = 14） */
    diffBtnFontSize: 14,
    /** 难度按钮：描边 px（原 border-2 = 2） */
    diffBtnBorderWidth: 2,
    /** 难度按钮：锁图标与文字的间距 px（原 gap-1.5 = 6） */
    diffBtnInnerGap: 6,
    /** 难度按钮里的小锁图标 px（原 <Lock size={13} />） */
    diffLockSize: 13,
    /** 进行推演：左右内边距 px（原 px-10 = 40） */
    startBtnPadX: 40,
    /** 进行推演：上下内边距 px（原 py-3 = 12） */
    startBtnPadY: 12,
    /** 进行推演：圆角 px（原 rounded-xl = 12） */
    startBtnRadius: 12,
    /** 进行推演：字号 px（原 text-lg = 18） */
    startBtnFontSize: 18,

    // ══ ③ 右上：返回 ═════════════════════════════════════════════════
    /** 距顶 px（原 top-8 = 32） */
    backTop: 32,
    /** 距右 px（原 right-8 = 32） */
    backRight: 32,
    /** 内边距 px（原 p-3 = 12） */
    backPad: 12,
    /** 描边 px（原 border = 1） */
    backBorderWidth: 1,
    /** 箭头图标 px（原 <ArrowLeft size={24} />） */
    backIconSize: 24,

    // ══ ④ 未解锁提示（背景中央的锁 + 「未解锁」） ═════════════════════
    /** 大锁图标 px（原 <Lock size={72} />） */
    lockIconSize: 72,
    /** 锁与文字间距 px（原 mb-3 = 12） */
    lockIconGap: 12,
    /** 「未解锁」字号 px（原 text-xl = 20） */
    lockTextFontSize: 20,

    // ══ ⑤ 绝密：四角取景框（瞄准镜感） ═══════════════════════════════
    /** 取景框四边内缩 px（原 inset-6 = 24） */
    cornerInset: 24,
    /** 单个角标边长 px（原 w-10 h-10 = 40） */
    cornerSize: 40,
    /** 角标描边粗细 px（原 border-t-4 等 = 4） */
    cornerBorderWidth: 4,
} as const;

// 缩略图切片：map_zero/1.png ~ 8.png（1 秒轮播）
const sliceModules = import.meta.glob('../../image/map/map_zero/*.webp', { eager: true });
const MAP_SLICE_IMAGES = Object.entries(sliceModules)
    .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
    .map(([, mod]) => (mod as any).default);

// 老电视雪花噪声（SVG feTurbulence 生成，feColorMatrix 输出白噪）
const STATIC_NOISE = `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/><feColorMatrix type='matrix' values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.7 0'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>")`;

interface RogueStageSelectProps {
    onBack: () => void;
    onStart: (difficulty: RogueDifficulty) => void;
    userSystem: ReturnType<typeof useUserSystem>;
}

// 关卡列表：当前 1 个真实关卡「零区」+ 占位（迷宫拓展中）
const STAGES = [
    { id: 'zero', name: '零区', available: true },
    { id: 'placeholder', name: '迷宫拓展中。。。', available: false },
];

// 未解锁难度的灰色滤镜
const LOCKED_FILTER = 'grayscale(1) brightness(0.6)';

export const RogueStageSelect: React.FC<RogueStageSelectProps> = ({ onBack, onStart, userSystem }) => {
    const [selectedStage, setSelectedStage] = useState('zero');
    const [difficulty, setDifficulty] = useState<RogueDifficulty>('normal');
    const [sliceIndex, setSliceIndex] = useState(0);
    const [noise, setNoise] = useState(false); // 老电视切换噪声闪屏

    // 🎛️ 主旋钮：三组角落控件整体缩放（`ROGUE_STAGE_UI.uiScale`，1 = 原样）
    //   ⚠️ `ROGUE_STAGE_UI` 是 `as const` ⇒ 哨兵比较前必须先 `Number()` 拓宽，否则程一拨离 1 就报 TS2367
    const uiScale = Number(ROGUE_STAGE_UI.uiScale);
    const uiScaled = uiScale !== 1;

    // [2026-09-26 莉莉子] 动态地图背景：显式 play()（对齐 DeskMedia / CardFaceVideo 的 autoplay 方案）
    //   加载失败自动回退静态图 map_zero.webp
    const mapVideoRef = useRef<HTMLVideoElement>(null);
    const [mapVideoFailed, setMapVideoFailed] = useState(false);
    useEffect(() => {
        const el = mapVideoRef.current;
        if (!el) return;
        el.loop = true;
        el.muted = true;
        const p = el.play();
        if (p !== undefined) p.catch(() => {});
        // [2026-10-10] 挂探针（只读）：让"关卡背景"也进 `__VPROBE()` 的视野
        return attachVideoProbe(el, () => el.getAttribute('src'), 'stagebg', -20);
    }, []);

    // 轮播缩略图：先亮噪声 0.45s → 切下一张 → 噪声熄灭（老电视开机切换）
    useEffect(() => {
        let noiseTimer: ReturnType<typeof setTimeout>;
        const tick = () => {
            setNoise(true);
            noiseTimer = setTimeout(() => {
                setSliceIndex(i => (i + 1) % MAP_SLICE_IMAGES.length);
                setNoise(false);
            }, 450);
        };
        const interval = setInterval(tick, 1500);
        return () => { clearInterval(interval); clearTimeout(noiseTimer); };
    }, []);

    // 解锁判断：全卡档全解锁；否则读 settings.unlockedRogueDifficulties（普通恒解锁）
    const isFullMode = (userSystem as any)?.userList?.find((u: any) => u.uid === userSystem.userId)?.type === 'full';
    const unlockedList: string[] = (userSystem.settings as any)?.unlockedRogueDifficulties ?? [];
    const isUnlocked = (d: RogueDifficulty) => isFullMode || d === 'normal' || unlockedList.includes(d);

    const currentDiffCfg = ROGUE_DIFFICULTIES.find(d => d.key === difficulty)!;
    const currentUnlocked = isUnlocked(difficulty);
    const rightFilter = currentUnlocked ? currentDiffCfg.filter : LOCKED_FILTER;
    const isSecret = difficulty === 'secret' && currentUnlocked;
    const isTopSecret = difficulty === 'topsecret' && currentUnlocked;

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="w-full h-full relative overflow-hidden text-white font-sans select-none"
        >
            {/* 右侧地图背景（随难度滤镜）· [2026-09-26 莉莉子] 动态视频版，加载失败自动回退静态图（铺满层，不进主旋钮） */}
            {!mapVideoFailed ? (
                <video
                    ref={mapVideoRef}
                    src={mapZeroVideo}
                    poster={mapZero}
                    onError={() => setMapVideoFailed(true)}
                    style={{ filter: rightFilter }}
                    className={`absolute inset-0 w-full h-full object-cover ${isSecret ? 'animate-[rogue-shake_5s_ease-in-out_infinite]' : ''} ${isTopSecret ? 'animate-[rogue-shake-mid_3s_ease-in-out_infinite]' : ''}`}
                    playsInline
                    preload="auto"
                    muted
                    loop
                />
            ) : (
                <img
                    src={mapZero}
                    style={{ filter: rightFilter }}
                    className={`absolute inset-0 w-full h-full object-cover ${isSecret ? 'animate-[rogue-shake_5s_ease-in-out_infinite]' : ''} ${isTopSecret ? 'animate-[rogue-shake-mid_3s_ease-in-out_infinite]' : ''}`}
                    alt="关卡地图"
                    draggable={false}
                />
            )}

            {/* ===== 难度视觉压迫层（仅已解锁的非普通难度） ===== */}
            {currentUnlocked && difficulty !== 'normal' && (
                <>
                    {/* 暗角（呼吸动态）：机密轻、绝密重 */}
                    <div
                        className="absolute inset-0 z-[5] pointer-events-none"
                        style={{ animation: isTopSecret ? 'rogue-vignette-breathe-heavy 4s ease-in-out infinite' : 'rogue-vignette-breathe 4s ease-in-out infinite' }}
                    />
                    {/* 扫描线（上下滚动） */}
                    <div
                        className={`absolute inset-0 z-[5] pointer-events-none ${isTopSecret ? 'opacity-40' : 'opacity-25'}`}
                        style={{ background: 'repeating-linear-gradient(0deg, transparent 0 2px, rgba(0,0,0,0.3) 2px 4px)', animation: 'rogue-scanline-scroll 0.5s linear infinite' }}
                    />
                    {/* 噪点颗粒（绝密更重） */}
                    <div
                        className={`absolute inset-0 z-[5] pointer-events-none mix-blend-overlay ${isTopSecret ? 'opacity-20' : 'opacity-10'}`}
                        style={{ backgroundImage: STATIC_NOISE }}
                    />
                </>
            )}
            {/* 机密：缓慢呼吸（被监视感） */}
            {isSecret && <div className="absolute inset-0 z-[4] pointer-events-none" style={{ animation: 'rogue-breathe 3s ease-in-out infinite' }} />}
            {/* 绝密：红色脉冲 + 四角警示框 + 水印 */}
            {isTopSecret && (
                <>
                    <div
                        className="absolute inset-0 z-[4] pointer-events-none"
                        style={{ animation: 'rogue-red-pulse 1.4s ease-in-out infinite', background: 'radial-gradient(circle at center, transparent 40%, rgba(220,38,38,0.2) 100%)' }}
                    />
                    {/* 四角取景框（瞄准镜感）（尺寸见 🎛️ ROGUE_STAGE_UI.corner*） */}
                    <div className="absolute z-[6] pointer-events-none" style={{ inset: ROGUE_STAGE_UI.cornerInset }}>
                        <div
                            className="absolute top-0 left-0 border-red-500/70"
                            style={{
                                width: ROGUE_STAGE_UI.cornerSize, height: ROGUE_STAGE_UI.cornerSize,
                                borderTopWidth: ROGUE_STAGE_UI.cornerBorderWidth, borderLeftWidth: ROGUE_STAGE_UI.cornerBorderWidth,
                                borderTopStyle: 'solid', borderLeftStyle: 'solid',
                            }}
                        />
                        <div
                            className="absolute top-0 right-0 border-red-500/70"
                            style={{
                                width: ROGUE_STAGE_UI.cornerSize, height: ROGUE_STAGE_UI.cornerSize,
                                borderTopWidth: ROGUE_STAGE_UI.cornerBorderWidth, borderRightWidth: ROGUE_STAGE_UI.cornerBorderWidth,
                                borderTopStyle: 'solid', borderRightStyle: 'solid',
                            }}
                        />
                        <div
                            className="absolute bottom-0 left-0 border-red-500/70"
                            style={{
                                width: ROGUE_STAGE_UI.cornerSize, height: ROGUE_STAGE_UI.cornerSize,
                                borderBottomWidth: ROGUE_STAGE_UI.cornerBorderWidth, borderLeftWidth: ROGUE_STAGE_UI.cornerBorderWidth,
                                borderBottomStyle: 'solid', borderLeftStyle: 'solid',
                            }}
                        />
                        <div
                            className="absolute bottom-0 right-0 border-red-500/70"
                            style={{
                                width: ROGUE_STAGE_UI.cornerSize, height: ROGUE_STAGE_UI.cornerSize,
                                borderBottomWidth: ROGUE_STAGE_UI.cornerBorderWidth, borderRightWidth: ROGUE_STAGE_UI.cornerBorderWidth,
                                borderBottomStyle: 'solid', borderRightStyle: 'solid',
                            }}
                        />
                    </div>
                </>
            )}

            {/* 未解锁难度：背景锁图标（尺寸见 🎛️ ROGUE_STAGE_UI.lock*） */}
            {!currentUnlocked && (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center pointer-events-none">
                    <Lock
                        size={ROGUE_STAGE_UI.lockIconSize}
                        className="text-gray-300/70 drop-shadow-[0_0_20px_rgba(0,0,0,0.8)]"
                        style={{ marginBottom: ROGUE_STAGE_UI.lockIconGap }}
                    />
                    <span
                        className="font-black tracking-[0.3em] text-gray-300/80"
                        style={{ fontSize: ROGUE_STAGE_UI.lockTextFontSize }}
                    >未解锁</span>
                </div>
            )}

            {/* 左侧关卡列表（左上角，缩略图轮播）（尺寸见 🎛️ ROGUE_STAGE_UI.list* / card* / thumb*） */}
            <div
                className="absolute z-10 flex flex-col"
                style={{
                    left: ROGUE_STAGE_UI.listLeft,
                    top: ROGUE_STAGE_UI.listTop,
                    width: ROGUE_STAGE_UI.listWidth,
                    gap: ROGUE_STAGE_UI.listGap,
                    transformOrigin: 'left top',
                    ...(uiScaled ? { transform: `scale(${uiScale})` } : {}),
                }}
            >
                {STAGES.map(stage => {
                    const active = selectedStage === stage.id;
                    return (
                        <button
                            key={stage.id}
                            onClick={() => {
                                if (!stage.available) return;
                                eventBus.emit(GameEvents.UI_CLICK);
                                setSelectedStage(stage.id);
                            }}
                            className={`relative overflow-hidden transition-all text-left ${stage.available
                                ? active ? 'border-purple-400 shadow-[0_0_20px_rgba(168,85,247,0.5)]' : 'border-white/20 hover:border-white/50'
                                : 'border-white/10 cursor-not-allowed'}`}
                            style={{
                                borderRadius: ROGUE_STAGE_UI.cardRadius,
                                borderWidth: ROGUE_STAGE_UI.cardBorderWidth,
                                borderStyle: 'solid',
                            }}
                        >
                            {stage.available ? (
                                <>
                                    {/* 缩略图轮播（老电视切换） */}
                                    <div className="relative w-full" style={{ height: ROGUE_STAGE_UI.thumbHeight }}>
                                        <img
                                            src={MAP_SLICE_IMAGES[sliceIndex % MAP_SLICE_IMAGES.length]}
                                            style={{ filter: rightFilter, height: ROGUE_STAGE_UI.thumbHeight }}
                                            className="w-full object-cover"
                                            alt={stage.name}
                                            draggable={false}
                                        />
                                        {/* 老电视雪花噪声闪屏 */}
                                        {noise && (
                                            <div
                                                className="absolute inset-0 z-20 pointer-events-none"
                                                style={{ backgroundImage: STATIC_NOISE, backgroundColor: 'rgba(255,255,255,0.2)', animation: 'rogue-noise-flash 0.45s steps(2) both' }}
                                            />
                                        )}
                                    </div>
                                    {/* 右下角倾斜「零区」（不随轮播）（尺寸见 🎛️ ROGUE_STAGE_UI.label*） */}
                                    <span
                                        className="absolute z-10 rotate-[-8deg] bg-black/85 font-black text-white tracking-wider shadow-[0_0_6px_rgba(0,0,0,0.8)]"
                                        style={{
                                            bottom: ROGUE_STAGE_UI.labelBottom,
                                            right: ROGUE_STAGE_UI.labelRight,
                                            paddingLeft: ROGUE_STAGE_UI.labelPadX,
                                            paddingRight: ROGUE_STAGE_UI.labelPadX,
                                            paddingTop: ROGUE_STAGE_UI.labelPadY,
                                            paddingBottom: ROGUE_STAGE_UI.labelPadY,
                                            borderRadius: ROGUE_STAGE_UI.labelRadius,
                                            fontSize: ROGUE_STAGE_UI.labelFontSize,
                                        }}
                                    >
                                        零区
                                    </span>
                                </>
                            ) : (
                                <div
                                    className="w-full bg-black/70 flex items-center justify-center text-gray-500 font-mono"
                                    style={{ height: ROGUE_STAGE_UI.thumbHeight, fontSize: ROGUE_STAGE_UI.placeholderFontSize }}
                                >
                                    {stage.name}
                                </div>
                            )}
                        </button>
                    );
                })}
            </div>

            {/* 右下角：难度三选一 + 进行推演（尺寸见 🎛️ ROGUE_STAGE_UI.panel* / diff* / startBtn*） */}
            <div
                className="absolute z-10 flex flex-col items-end"
                style={{
                    right: ROGUE_STAGE_UI.panelRight,
                    bottom: ROGUE_STAGE_UI.panelBottom,
                    gap: ROGUE_STAGE_UI.panelGap,
                    transformOrigin: 'bottom right',
                    ...(uiScaled ? { transform: `scale(${uiScale})` } : {}),
                }}
            >
                <div className="flex items-center" style={{ gap: ROGUE_STAGE_UI.diffRowGap }}>
                    {ROGUE_DIFFICULTIES.map(d => {
                        const unlocked = isUnlocked(d.key);
                        const active = difficulty === d.key;
                        return (
                            <button
                                key={d.key}
                                onClick={() => { eventBus.emit(GameEvents.UI_CLICK); setDifficulty(d.key); }}
                                className={`font-black tracking-widest transition-all flex items-center ${active
                                    ? 'bg-gradient-to-r from-purple-600/40 to-red-500/40 border-purple-400 text-white shadow-[0_0_20px_rgba(168,85,247,0.4)] scale-105'
                                    : 'bg-black/50 border-white/15 text-gray-400 hover:border-white/40 hover:text-white'}`}
                                style={{
                                    paddingLeft: ROGUE_STAGE_UI.diffBtnPadX,
                                    paddingRight: ROGUE_STAGE_UI.diffBtnPadX,
                                    paddingTop: ROGUE_STAGE_UI.diffBtnPadY,
                                    paddingBottom: ROGUE_STAGE_UI.diffBtnPadY,
                                    borderRadius: ROGUE_STAGE_UI.diffBtnRadius,
                                    fontSize: ROGUE_STAGE_UI.diffBtnFontSize,
                                    borderWidth: ROGUE_STAGE_UI.diffBtnBorderWidth,
                                    borderStyle: 'solid',
                                    gap: ROGUE_STAGE_UI.diffBtnInnerGap,
                                }}
                            >
                                {!unlocked && <Lock size={ROGUE_STAGE_UI.diffLockSize} className="text-gray-500" />}
                                <span>{d.label}</span>
                            </button>
                        );
                    })}
                </div>
                <button
                    onClick={() => { eventBus.emit(GameEvents.UI_CLICK); if (currentUnlocked) onStart(difficulty); }}
                    className={`font-black tracking-widest transition-all ${currentUnlocked
                        ? 'bg-gradient-to-r from-blue-600 to-blue-400 hover:scale-105 hover:shadow-[0_0_25px_rgba(59,130,246,0.6)] cursor-pointer'
                        : 'bg-blue-900/40 opacity-40 grayscale cursor-not-allowed'}`}
                    style={{
                        paddingLeft: ROGUE_STAGE_UI.startBtnPadX,
                        paddingRight: ROGUE_STAGE_UI.startBtnPadX,
                        paddingTop: ROGUE_STAGE_UI.startBtnPadY,
                        paddingBottom: ROGUE_STAGE_UI.startBtnPadY,
                        borderRadius: ROGUE_STAGE_UI.startBtnRadius,
                        fontSize: ROGUE_STAGE_UI.startBtnFontSize,
                    }}
                >
                    进行推演
                </button>
            </div>

            {/* 右上角：返回主界面（尺寸见 🎛️ ROGUE_STAGE_UI.back*） */}
            <button
                onClick={() => { eventBus.emit(GameEvents.UI_BACK); onBack(); }}
                className="absolute z-[999] rounded-full bg-white/5 hover:bg-white/20 border-white/10 hover:border-white/50 transition-all group"
                style={{
                    top: ROGUE_STAGE_UI.backTop,
                    right: ROGUE_STAGE_UI.backRight,
                    padding: ROGUE_STAGE_UI.backPad,
                    borderWidth: ROGUE_STAGE_UI.backBorderWidth,
                    borderStyle: 'solid',
                    transformOrigin: 'top right',
                    ...(uiScaled ? { transform: `scale(${uiScale})` } : {}),
                }}
                title="返回主界面"
            >
                <ArrowLeft size={ROGUE_STAGE_UI.backIconSize} className="text-gray-300 group-hover:text-white transition-colors" />
            </button>
        </motion.div>
    );
};
