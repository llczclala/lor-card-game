import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Play, Eye, ChevronRight, Sword, Shield, Target, Zap } from 'lucide-react';
import { eventBus, GameEvents } from '../../utils/eventBus';
import { getStagesByCategory, getCategoryById } from '../../data/tutorialStages';
import type { ExamCategoryId, TutorialStage } from '../../data/tutorialStages';
import { HERO_IMAGES } from '../../data/imageData'; // [新增]
import { ENEMY_ARCHETYPES } from '../../data/enemies/archetypes'; // [新增]
import { CARD_DB } from '../../data/cards'; // [新增]

interface StageSelectScreenProps {
    categoryId: ExamCategoryId;
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
            <div className="w-[280px] h-full border-r border-white/10 flex flex-col bg-slate-900/90 backdrop-blur-md shrink-0 relative z-20">
                {/* 头部 */}
                <div className="p-5 border-b border-white/10 bg-black/40">
                    <div className="flex items-center justify-between mb-3">
                        <button
                            onClick={() => {
                                eventBus.emit(GameEvents.UI_BACK);
                                onBack();
                            }}
                            className="p-2 rounded-lg hover:bg-white/10 transition-colors text-gray-400 hover:text-white"
                        >
                            <ArrowLeft size={20} />
                        </button>
                        <span className="text-xs text-gray-500 bg-slate-800 px-2 py-0.5 rounded-full font-mono">
                            {category.icon} {category.name}
                        </span>
                    </div>
                    <h2 className="text-sm font-black text-gray-300 uppercase tracking-[0.2em]">
                        考核列表
                    </h2>
                </div>

                {/* 关卡列表 (升级为原画遮罩卡片) */}
                <div className="flex-1 overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] p-4 space-y-3 relative">
                    {/* 顶部/底部边缘虚化遮罩 */}
                    <div className="absolute top-0 left-0 w-full h-4 bg-gradient-to-b from-slate-900/90 to-transparent z-10 pointer-events-none"></div>

                    {stages.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-gray-600 px-6 text-center">
                            <div className="text-3xl mb-3">📭</div>
                            <span className="text-sm font-mono tracking-wider">暂无关卡</span>
                        </div>
                    ) : (
                        stages.map((stage, index) => {
                            const playerHeroKey = stage.playerHeroConfig?.heroKey || 'lyfe';
                            const heroImg = HERO_IMAGES[playerHeroKey as keyof typeof HERO_IMAGES]?.base || '';

                            return (
                                <div
                                    key={stage.id}
                                    onClick={() => setSelectedStageId(stage.id)}
                                    className={`
                                        group relative cursor-pointer rounded-xl overflow-hidden border-2 transition-all h-24
                                        ${selectedStage?.id === stage.id
                                            ? 'border-cyan-500 shadow-[0_0_15px_rgba(6,182,212,0.5)] scale-105 z-10'
                                            : 'border-white/10 hover:border-gray-400 opacity-70 hover:opacity-100'
                                        }
                                    `}
                                >
                                    {heroImg && <div className="absolute inset-0 bg-cover bg-top opacity-60 mix-blend-luminosity group-hover:mix-blend-normal transition-all duration-500" style={{ backgroundImage: `url(${heroImg})` }}></div>}
                                    <div className={`absolute inset-0 bg-gradient-to-r ${selectedStage?.id === stage.id ? 'from-cyan-950/90 via-slate-900/80' : 'from-slate-950/90 via-slate-900/80'} to-transparent transition-colors`}></div>

                                    <div className="absolute inset-0 px-4 py-3 flex flex-col justify-center">
                                        <div className="flex items-center justify-between mb-1 relative z-10">
                                            <div className="flex items-center gap-2">
                                                <span className={`w-5 h-5 rounded flex items-center justify-center text-[10px] font-black ${selectedStage?.id === stage.id ? 'bg-cyan-500 text-slate-900' : 'bg-slate-800 text-gray-400'}`}>
                                                    {index + 1}
                                                </span>
                                                <span className="text-sm font-black tracking-widest text-white drop-shadow-md">{stage.name}</span>
                                            </div>
                                        </div>
                                        <div className="text-[10px] text-cyan-400/80 font-bold tracking-widest relative z-10 mt-1 pl-7">
                                            {stage.objectives.length} OBJECTIVES
                                        </div>
                                    </div>
                                </div>
                            );
                        })
                    )}
                    <div className="absolute bottom-0 left-0 w-full h-8 bg-gradient-to-t from-slate-900/90 to-transparent z-10 pointer-events-none"></div>
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
                                const enemyArch = ENEMY_ARCHETYPES[selectedStage.enemyArchetypeId];
                                const enemyHeroKey = enemyArch?.champion || 'fenny';
                                const playerHeroKey = selectedStage.playerHeroConfig?.heroKey || 'lyfe';
                                const playerImg = HERO_IMAGES[playerHeroKey as keyof typeof HERO_IMAGES]?.base || '';
                                const enemyImg = HERO_IMAGES[enemyHeroKey as keyof typeof HERO_IMAGES]?.base || '';

                                return (
                                    <div className="absolute inset-0 z-0 overflow-hidden bg-slate-950 flex">
                                        {/* 左侧：我方 (蓝色) */}
                                        <div className="relative w-1/2 h-full bg-blue-950 overflow-hidden">
                                            {playerImg && <img src={playerImg} className="absolute inset-0 w-full h-full object-cover opacity-70" style={{ objectPosition: 'top 20% center' }} alt="玩家" />}
                                            <div className="absolute inset-0 bg-gradient-to-r from-blue-900/60 to-transparent mix-blend-overlay"></div>
                                            {/* 将文字移至顶部，为底部简报内容让出空间 */}
                                            <div className="absolute top-10 left-10 z-10">
                                                <div className="text-xs font-mono text-cyan-400 font-bold tracking-widest flex items-center gap-1"><Shield size={12}/> ADJUTANT</div>
                                                <div className="text-3xl font-black text-white tracking-widest uppercase drop-shadow-[0_0_15px_rgba(0,0,0,0.8)] mt-1">
                                                    {CARD_DB[playerHeroKey]?.name || 'MY SQUAD'}
                                                </div>
                                            </div>
                                        </div>

                                        {/* 右侧：敌方 (红色) */}
                                        <div className="relative w-1/2 h-full bg-red-950 overflow-hidden">
                                            {enemyImg && <img src={enemyImg} className="absolute inset-0 w-full h-full object-cover opacity-70" style={{ objectPosition: 'top 20% center' }} alt="敌人" />}
                                            <div className="absolute inset-0 bg-gradient-to-l from-red-900/60 to-transparent mix-blend-overlay"></div>
                                            <div className="absolute top-10 right-10 z-10 text-right">
                                                <div className="text-xs font-mono text-red-400 font-bold tracking-widest flex items-center justify-end gap-1"><Sword size={12}/> ENEMY</div>
                                                <div className="text-3xl font-black text-white tracking-widest uppercase drop-shadow-[0_0_15px_rgba(0,0,0,0.8)] mt-1">
                                                    {enemyArch?.name || 'UNKNOWN HOSTILE'}
                                                </div>
                                            </div>
                                        </div>

                                        {/* 中心碰撞分隔线与 VS */}
                                        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-full overflow-hidden flex items-center justify-center z-20 pointer-events-none">
                                            <div className="absolute w-[2px] h-[150%] bg-gradient-to-b from-transparent via-white to-transparent rotate-[15deg] shadow-[0_0_20px_rgba(255,255,255,0.8)] opacity-50"></div>
                                            {/* 将 VS 徽章上移 */}
                                            <div className="absolute top-12 w-16 h-16 rounded-full bg-black/60 border-[2px] border-white/20 flex items-center justify-center shadow-[0_0_30px_rgba(0,0,0,0.8)] z-10 backdrop-blur-md">
                                                <span className="text-2xl font-black italic text-transparent bg-clip-text bg-gradient-to-b from-white to-gray-500 tracking-tighter pr-1">VS</span>
                                            </div>
                                        </div>

                                        {/* 托底的全局暗色渐变遮罩，使底部悬浮 UI 的文字保持绝对清晰 */}
                                        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/80 to-transparent pointer-events-none z-30"></div>
                                    </div>
                                );
                            })()}

                            {/* [核心重构] 2. 关卡简报与考核目标 (悬浮玻璃拟态 HUD) */}
                            <div className="flex-1 relative z-10 flex flex-col justify-end pb-4 pt-32">
                                {/* 内部滚动区 */}
                                <div className="overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] px-10">
                                    <div className="flex flex-col gap-2 mb-8">
                                        <div className="flex items-center gap-3">
                                            <span className="px-2 py-0.5 bg-cyan-900/50 text-cyan-400 text-xs font-bold rounded border border-cyan-500/30 uppercase tracking-widest backdrop-blur-sm">
                                                STAGE {stageIndex}
                                            </span>
                                            <h2 className="text-4xl font-black tracking-tight text-white drop-shadow-[0_4px_10px_rgba(0,0,0,0.8)]">{selectedStage.name}</h2>
                                        </div>
                                        <p className="text-gray-300 text-sm leading-relaxed max-w-2xl font-medium drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">{selectedStage.description}</p>
                                    </div>

                                    <h3 className="text-xs font-black text-cyan-400 tracking-[0.2em] uppercase mb-4 flex items-center gap-2 drop-shadow-md">
                                        <Target size={14} /> EXAM OBJECTIVES
                                    </h3>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pb-6">
                                        {selectedStage.objectives.map((obj, idx) => (
                                            <div key={idx} className="flex items-start gap-4 bg-black/40 hover:bg-black/60 backdrop-blur-md transition-colors rounded-xl p-5 border border-white/10 shadow-lg group">
                                                <div className="w-10 h-10 rounded-full bg-cyan-900/50 border border-cyan-500/40 flex items-center justify-center shrink-0 group-hover:bg-cyan-600 group-hover:border-cyan-400 transition-all shadow-[0_0_15px_rgba(6,182,212,0)] group-hover:shadow-[0_0_15px_rgba(6,182,212,0.4)]">
                                                    <span className="text-cyan-400 group-hover:text-white transition-colors">
                                                        {OBJECTIVE_ICONS[idx % OBJECTIVE_ICONS.length]}
                                                    </span>
                                                </div>
                                                <div className="pt-2">
                                                    <span className="text-sm text-gray-200 font-bold tracking-wide leading-snug drop-shadow-md">{obj}</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* 底部操作按钮 (融入玻璃质感) */}
                            <div className="px-10 py-6 shrink-0 z-20 border-t border-white/10 bg-black/40 backdrop-blur-lg">
                                <div className="flex items-center gap-6 max-w-4xl">
                                    {/* 查看牌组按钮 */}
                                    <button
                                        onClick={() => {
                                            eventBus.emit(GameEvents.UI_CLICK);
                                            onViewDecks(selectedStage.id);
                                        }}
                                        className="flex-1 py-4 rounded-xl flex items-center justify-center gap-2 font-bold text-sm
                                            bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white
                                            border border-white/20 hover:border-white/40
                                            transition-all group shadow-lg backdrop-blur-sm"
                                    >
                                        <Eye size={18} className="group-hover:scale-110 transition-transform" />
                                        查看牌组
                                    </button>

                                    {/* 开始考核按钮 */}
                                    <button
                                        onClick={() => {
                                            eventBus.emit(GameEvents.UI_CLICK);
                                            onStartStage(selectedStage.id);
                                        }}
                                        className="flex-[2] py-4 rounded-xl flex items-center justify-center gap-2 font-bold text-lg tracking-widest
                                            bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500
                                            text-white shadow-[0_0_20px_rgba(34,211,238,0.4)] hover:shadow-[0_0_30px_rgba(34,211,238,0.6)]
                                            transition-all hover:scale-[1.02] active:scale-[0.98] border border-cyan-400/30"
                                    >
                                        <Play size={20} fill="currentColor" />
                                        开始考核
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
                            <div className="text-6xl mb-4 opacity-20">{category.icon}</div>
                            <span className="text-xl font-bold tracking-widest uppercase">{category.name}</span>
                            <span className="text-sm text-gray-700 mt-2">请从左侧选择一个考核关卡</span>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
};
