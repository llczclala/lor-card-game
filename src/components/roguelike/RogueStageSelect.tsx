// ==========================================
// 悖论迷宫 · 关卡选择界面
// 左侧关卡列表（左上角，缩略图老电视轮播）+ 右侧地图背景（难度视觉压迫层）+ 右下难度三选一
// [2026-08-07] 难度只影响地图/敌人/迷宫BUFF，不影响AI
// ==========================================
import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, Lock } from 'lucide-react';
import { eventBus, GameEvents } from '../../utils/eventBus';
import { ROGUE_DIFFICULTIES } from '../../data/roguelike/difficulties';
import type { RogueDifficulty } from '../../data/roguelike/difficulties';
import mapZero from '../../image/map/map_zero.png';
import type { useUserSystem } from '../../hooks/useUserSystem';

// 缩略图切片：map_zero/1.png ~ 8.png（1 秒轮播）
const sliceModules = import.meta.glob('../../image/map/map_zero/*.png', { eager: true });
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
            {/* 右侧地图背景（随难度滤镜） */}
            <img
                src={mapZero}
                style={{ filter: rightFilter }}
                className={`absolute inset-0 w-full h-full object-cover ${isSecret ? 'animate-[rogue-shake_5s_ease-in-out_infinite]' : ''} ${isTopSecret ? 'animate-[rogue-shake-mid_3s_ease-in-out_infinite]' : ''}`}
                alt="关卡地图"
                draggable={false}
            />

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
                    {/* 四角取景框（瞄准镜感） */}
                    <div className="absolute inset-6 z-[6] pointer-events-none">
                        <div className="absolute top-0 left-0 w-10 h-10 border-t-4 border-l-4 border-red-500/70" />
                        <div className="absolute top-0 right-0 w-10 h-10 border-t-4 border-r-4 border-red-500/70" />
                        <div className="absolute bottom-0 left-0 w-10 h-10 border-b-4 border-l-4 border-red-500/70" />
                        <div className="absolute bottom-0 right-0 w-10 h-10 border-b-4 border-r-4 border-red-500/70" />
                    </div>
                </>
            )}

            {/* 未解锁难度：背景锁图标 */}
            {!currentUnlocked && (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center pointer-events-none">
                    <Lock size={72} className="text-gray-300/70 mb-3 drop-shadow-[0_0_20px_rgba(0,0,0,0.8)]" />
                    <span className="text-xl font-black tracking-[0.3em] text-gray-300/80">未解锁</span>
                </div>
            )}

            {/* 左侧关卡列表（左上角，缩略图轮播） */}
            <div className="absolute left-8 top-8 z-10 w-72 flex flex-col gap-4">
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
                            className={`relative rounded-xl overflow-hidden border-2 transition-all text-left ${stage.available
                                ? active ? 'border-purple-400 shadow-[0_0_20px_rgba(168,85,247,0.5)]' : 'border-white/20 hover:border-white/50'
                                : 'border-white/10 cursor-not-allowed'}`}
                        >
                            {stage.available ? (
                                <>
                                    {/* 缩略图轮播（老电视切换） */}
                                    <div className="relative w-full h-32">
                                        <img
                                            src={MAP_SLICE_IMAGES[sliceIndex % MAP_SLICE_IMAGES.length]}
                                            style={{ filter: rightFilter }}
                                            className="w-full h-32 object-cover"
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
                                    {/* 右下角倾斜「零区」（不随轮播） */}
                                    <span className="absolute bottom-1.5 right-2 z-10 rotate-[-8deg] bg-black/85 px-2 py-0.5 rounded-sm text-xs font-black text-white tracking-wider shadow-[0_0_6px_rgba(0,0,0,0.8)]">
                                        零区
                                    </span>
                                </>
                            ) : (
                                <div className="w-full h-32 bg-black/70 flex items-center justify-center text-gray-500 text-sm font-mono">
                                    {stage.name}
                                </div>
                            )}
                        </button>
                    );
                })}
            </div>

            {/* 右下角：难度三选一 + 进行推演 */}
            <div className="absolute right-8 bottom-8 z-10 flex flex-col items-end gap-4">
                <div className="flex items-center gap-3">
                    {ROGUE_DIFFICULTIES.map(d => {
                        const unlocked = isUnlocked(d.key);
                        const active = difficulty === d.key;
                        return (
                            <button
                                key={d.key}
                                onClick={() => { eventBus.emit(GameEvents.UI_CLICK); setDifficulty(d.key); }}
                                className={`px-4 py-2 rounded-xl font-black text-sm tracking-widest border-2 transition-all flex items-center gap-1.5 ${active
                                    ? 'bg-gradient-to-r from-purple-600/40 to-red-500/40 border-purple-400 text-white shadow-[0_0_20px_rgba(168,85,247,0.4)] scale-105'
                                    : 'bg-black/50 border-white/15 text-gray-400 hover:border-white/40 hover:text-white'}`}
                            >
                                {!unlocked && <Lock size={13} className="text-gray-500" />}
                                <span>{d.label}</span>
                            </button>
                        );
                    })}
                </div>
                <button
                    onClick={() => { eventBus.emit(GameEvents.UI_CLICK); if (currentUnlocked) onStart(difficulty); }}
                    className={`px-10 py-3 rounded-xl text-lg font-black tracking-widest transition-all ${currentUnlocked
                        ? 'bg-gradient-to-r from-blue-600 to-blue-400 hover:scale-105 hover:shadow-[0_0_25px_rgba(59,130,246,0.6)] cursor-pointer'
                        : 'bg-blue-900/40 opacity-40 grayscale cursor-not-allowed'}`}
                >
                    进行推演
                </button>
            </div>

            {/* 右上角：返回主界面 */}
            <button
                onClick={() => { eventBus.emit(GameEvents.UI_BACK); onBack(); }}
                className="absolute top-8 right-8 z-[999] p-3 rounded-full bg-white/5 hover:bg-white/20 border border-white/10 hover:border-white/50 transition-all group"
                title="返回主界面"
            >
                <ArrowLeft size={24} className="text-gray-300 group-hover:text-white transition-colors" />
            </button>
        </motion.div>
    );
};
