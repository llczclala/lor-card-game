import React, { useState, useEffect } from 'react';
import { X, RefreshCw, ChevronUp, ChevronDown } from 'lucide-react';
import type { CardData } from '../types';
import { KEYWORD_DB } from '../data/keywords';
// [新增] 引入故事数据库
import { getCardLore } from '../data/loreData';
import { ChampionLevelUp } from './ChampionLevelUp';


export const FullArtOverlay = ({ card, onClose }: { card: CardData, onClose: () => void }) => {
    const [isLoreOpen, setIsLoreOpen] = useState(false);

    const getRegionLabel = (region: string, key: string) => {
        if (key.startsWith('test_')) return 'TEST';
        // 'Lyfe', 'Fenny', 'Logistics' match their display names mostly, just uppercase
        return region.toUpperCase();
    };

    const getTypeLabel = (isChampion: boolean) => {
        return isChampion ? 'HERO' : 'UNIT';
    };

    // 获取当前卡牌的故事
    const loreText = getCardLore(card.key);

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/95 backdrop-blur-md animate-fade-in p-4 md:p-8" onClick={onClose}>
            {/* 关闭按钮 */}
            <button onClick={onClose} className="absolute top-4 right-4 md:top-8 md:right-8 text-white/80 hover:text-white bg-black/50 hover:bg-red-500/80 rounded-full p-2 transition-all z-[210]">
                <X size={32} />
            </button>

            <div className="relative flex flex-col md:flex-row max-w-7xl w-full h-full md:h-[90vh] items-stretch justify-center gap-0 md:gap-8" onClick={e => e.stopPropagation()}>

                {/* --- 左侧：原画容器 (双层渲染) --- */}
                <div className="relative flex-1 rounded-2xl overflow-hidden shadow-[0_0_50px_rgba(0,0,0,0.8)] border border-white/20 group select-none bg-black">

                    {/* 图层 1 (底层): 高斯模糊填充背景，解决黑边问题 */}
                    <div className="absolute inset-0 z-0">
                        <img
                            src={card.level === 2 && card.level2ImageUrl ? card.level2ImageUrl : card.imageUrl}
                            className="w-full h-full object-cover blur-2xl opacity-60 scale-110" // 放大一点避免模糊边缘露白
                            alt="Background Blur"
                        />
                    </div>

                    {/* 图层 2 (顶层): 完整原画展示 (object-contain) */}
                    <div className="absolute inset-0 z-10 flex items-center justify-center p-4">
                        <img
                            src={card.level === 2 && card.level2ImageUrl ? card.level2ImageUrl : card.imageUrl}
                            className="w-full h-full object-contain drop-shadow-2xl"
                            alt="Full Art"
                        />
                    </div>

                    {/* 故事抽屉 (Lore Drawer) - 位于最顶层 z-20 */}
                    <div
                        className={`
                            absolute bottom-0 left-0 w-full z-20
                            bg-black/80 backdrop-blur-xl border-t border-white/10
                            transition-all duration-500 ease-in-out flex flex-col
                            ${isLoreOpen ? 'h-[85%]' : 'h-16 hover:bg-black/90'}
                        `}
                    >
                        {/* 把手 */}
                        <div
                            className="h-16 w-full flex items-center justify-center cursor-pointer transition-colors shrink-0 group/drawer"
                            onClick={() => setIsLoreOpen(!isLoreOpen)}
                        >
                            <div className="flex flex-col items-center gap-1">
                                {isLoreOpen ? <ChevronDown className="text-yellow-500 animate-bounce" /> : <ChevronUp className="text-yellow-500 animate-bounce" />}
                                <span className="text-[10px] tracking-[0.3em] font-bold text-yellow-500/50 group-hover/drawer:text-yellow-500 transition-colors uppercase">
                                    {isLoreOpen ? 'Close Biography' : 'Read Biography'}
                                </span>
                            </div>
                        </div>

                        {/* 故事文本区 */}
                        <div className={`flex-1 overflow-y-auto px-12 pb-12 custom-scrollbar ${isLoreOpen ? 'opacity-100' : 'opacity-0'} transition-opacity duration-300`}>
                            <h3 className="text-2xl font-black text-white/20 mb-8 tracking-[0.5em] border-b border-white/10 pb-4 text-center">
                                ARCHIVE // {card.name}
                            </h3>
                            <p className="text-xl leading-loose text-gray-300 font-serif whitespace-pre-line text-justify">
                                {loreText}
                            </p>
                        </div>
                    </div>
                </div>

                {/* --- 右侧：详细信息面板 (居中布局 + 自适应高度) --- */}
                {/* [修改] h-fit: 高度自适应内容，不再撑满整个屏幕高度 */}
                {/* [修改] self-center: 垂直居中 */}
                <div className="w-full md:w-[500px] bg-gray-900/95 p-10 rounded-3xl border border-white/10 text-white shadow-2xl flex flex-col gap-8 self-center h-fit max-h-full overflow-y-auto custom-scrollbar mt-4 md:mt-0">

                    {/* 1. 顶部标题 (居中 + 放大) */}
                    <div className="flex flex-col items-center text-center">
                        <div className="text-sm font-black text-gray-500 uppercase tracking-[0.3em] mb-2 flex items-center gap-3 bg-black/40 px-4 py-1 rounded-full border border-white/5">
                            <span className={card.region === 'Lyfe' ? 'text-yellow-500' : (card.region === 'Fenny' ? 'text-red-500' : 'text-purple-500')}>
                                {getRegionLabel(card.region, card.key)}
                            </span>
                            <span className="text-gray-600">|</span>
                            <span className="text-blue-400">{getTypeLabel(card.isChampion)}</span>
                        </div>
                        {/* [修改] 名字字号加大到 text-6xl */}
                        <h2 className="text-6xl font-black text-transparent bg-clip-text bg-gradient-to-b from-white via-gray-200 to-gray-500 drop-shadow-md tracking-tight py-2">
                            {card.name}
                        </h2>
                    </div>

                    {/* 2. 数值栏 (Cost/Power/Health) - 保持原来的精美设计 */}
                    <div className="flex justify-center items-center gap-8 py-6 border-y border-white/10 bg-white/5 rounded-2xl mx-4">
                        <div className="flex flex-col items-center gap-1">
                            <div className="w-14 h-14 rounded-full bg-blue-600 border-4 border-blue-400 flex items-center justify-center text-3xl font-black shadow-[0_0_20px_rgba(37,99,235,0.5)]">
                                {card.cost}
                            </div>
                            <span className="text-[10px] text-gray-500 font-bold tracking-widest">COST</span>
                        </div>

                        {card.type.includes('unit') ? (
                            <>
                                <div className="h-10 w-px bg-white/10"></div>
                                <div className="flex flex-col items-center gap-1">
                                    <div className="text-5xl font-black text-yellow-500 drop-shadow-[0_2px_0_rgba(0,0,0,1)] font-impact">
                                        {card.power}
                                    </div>
                                    <span className="text-[10px] text-gray-500 font-bold tracking-widest">POWER</span>
                                </div>
                                <div className="h-10 w-px bg-white/10"></div>
                                <div className="flex flex-col items-center gap-1">
                                    <div className="text-5xl font-black text-red-500 drop-shadow-[0_2px_0_rgba(0,0,0,1)] font-impact">
                                        {card.health}
                                    </div>
                                    <span className="text-[10px] text-gray-500 font-bold tracking-widest">HEALTH</span>
                                </div>
                            </>
                        ) : (
                            <div className="text-sm font-mono text-gray-500 tracking-widest px-8">SPELL CARD</div>
                        )}
                    </div>

                    {/* 3. 关键词 (居中对齐 + 放大图标) */}
                    {card.keywords.length > 0 && (
                        <div className="flex flex-col items-center space-y-4">
                            <h3 className="text-gray-600 text-[10px] font-black uppercase tracking-[0.4em]">KEYWORDS</h3>
                            <div className="flex flex-wrap justify-center gap-6">
                                {card.keywords.map(k => {
                                    const kwConfig = KEYWORD_DB[k];
                                    if (!kwConfig) return null;
                                    return (
                                        <div key={k} className="group relative flex flex-col items-center gap-2 cursor-help">
                                            {/* 图标容器放大 */}
                                            <div className="w-16 h-16 flex items-center justify-center transition-transform duration-300 group-hover:scale-110 group-hover:rotate-6 bg-black/30 rounded-xl p-2 border border-white/5 group-hover:border-white/20 shadow-lg">
                                                <img src={kwConfig.icon} alt={kwConfig.label} className="w-full h-full object-contain drop-shadow-md" />
                                            </div>
                                            {/* 文字 */}
                                            <span className="text-sm font-bold text-gray-400 group-hover:text-white transition-colors tracking-wide">
                                                {kwConfig.label}
                                            </span>

                                            {/* Tooltip */}
                                            <div className="absolute top-full mt-3 w-56 bg-gray-800 border border-white/20 p-4 rounded-xl shadow-[0_10px_40px_rgba(0,0,0,0.5)] opacity-0 group-hover:opacity-100 transition-all pointer-events-none z-50 text-center translate-y-2 group-hover:translate-y-0">
                                                <div className="font-bold text-yellow-400 mb-1 text-sm">{kwConfig.label}</div>
                                                <div className="text-gray-300 text-xs leading-relaxed">{kwConfig.description}</div>
                                                {/* 小三角 */}
                                                <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-gray-800 border-t border-l border-white/20 rotate-45"></div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* 4. 升级条件 (Champion Only) */}
                    {card.isChampion && (
                        <div className="flex flex-col items-center gap-3 py-4">
                            <div className="text-yellow-600 font-black tracking-[0.2em] text-xs uppercase bg-yellow-900/10 px-4 py-1 rounded-full border border-yellow-700/30">
                                Level Up Condition
                            </div>
                            <p className="text-white text-xl font-medium italic text-center leading-relaxed max-w-[80%]">
                                "{card.name.includes('里芙') ? '我打击 2 次。' : (card.name.includes('芬妮') ? '造成过伤害。' : '满足特定条件。')}"
                            </p>
                        </div>
                    )}

                    {/* 5. 卡牌描述 */}
                    {card.description && !card.description.includes('升级：') && (
                        <div className="space-y-3 pt-6 border-t border-white/5 text-center">
                            <h3 className="text-gray-600 text-[10px] font-black uppercase tracking-[0.4em]">EFFECT</h3>
                            <p className="text-gray-300 text-lg leading-relaxed font-light px-4">
                                {card.description}
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
interface LevelUpOverlayProps {
    card: CardData;
    onClose: () => void;
    onPlayMovie: (heroKey: string, onEnd: () => void) => void;
    onStopMovie: () => void; // [新增] 定义回调
}

export const LevelUpOverlay: React.FC<LevelUpOverlayProps> = ({ card, onClose, onPlayMovie, onStopMovie }) => {
    return (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black">
            {/* 引入 ChampionLevelUp 组件处理所有动画流程 (旋转 -> 视频 -> 爆发) */}
            <ChampionLevelUp
                card={card}
                onPlayMovie={onPlayMovie}
                onStopMovie={onStopMovie} // [新增] 透传给核心组件
                onComplete={onClose}
            />
        </div>
    );
};

interface GameOverProps {
    result: 'victory' | 'defeat';
    onRestart: () => void;
    // 新增 props
    onPlayMovie?: (onEnd: () => void) => void; // 专门播放胜利视频的函数
}

export const GameOverScreen = ({ result, onRestart, onPlayMovie }: GameOverProps) => {
    // 阶段：init(模糊+文字) -> blackout_in -> video -> blackout_out -> menu
    const [phase, setPhase] = useState<'init' | 'blackout_in' | 'video' | 'blackout_out' | 'menu'>('init');

    useEffect(() => {
        if (result === 'defeat') {
            setPhase('menu'); // 失败直接显示菜单 (或者你可以加失败动画)
            return;
        }

        // 胜利流程
        // 0-3s: 文字展示 + 模糊加深 (CSS控制)
        // 3s: 黑屏开始
        const t1 = setTimeout(() => setPhase('blackout_in'), 3000);

        // 4s: 播放视频
        const t2 = setTimeout(() => {
            if (onPlayMovie) {
                setPhase('video');
                onPlayMovie(() => {
                    // 视频结束
                    setPhase('blackout_out');
                    // 黑屏淡出后显示菜单
                    setTimeout(() => setPhase('menu'), 1000);
                });
            } else {
                // 如果没有视频，直接跳到菜单
                setPhase('menu');
            }
        }, 4000);

        return () => { clearTimeout(t1); clearTimeout(t2); };
    }, [result]);

    return (
        <div className="fixed inset-0 z-[300] overflow-hidden">
            {/* 1. 背景模糊层 (从 0 到 20px blur) */}
            <div className={`absolute inset-0 bg-black/60 transition-all duration-[1000ms] ${phase === 'init' ? 'backdrop-blur-[20px]' : 'backdrop-blur-md'}`}></div>

            {/* 2. 胜利文字 (缩放 + 间距) */}
            {phase === 'init' && result === 'victory' && (
                <div className="absolute inset-0 flex items-center justify-center z-10">
                    <h1 className="text-9xl font-black text-transparent bg-clip-text bg-gradient-to-b from-yellow-300 to-yellow-600 drop-shadow-[0_0_50px_gold] animate-victory-text tracking-widest">
                        VICTORY
                    </h1>
                </div>
            )}

            {/* 3. 黑色遮罩层 (用于视频前后的黑屏过渡) */}
            <div
                className="absolute inset-0 bg-black z-[350] transition-opacity duration-1000 pointer-events-none"
                style={{
                    opacity: (phase === 'blackout_in' || phase === 'video') ? 1 : (phase === 'blackout_out' ? 0 : 0)
                }}
            />

            {/* 4. 菜单层 (最后显示) */}
            {(phase === 'menu' || result === 'defeat') && (
                <div className="absolute inset-0 flex items-center justify-center z-[400] animate-fade-in bg-black/80">
                    <div className="text-center">
                        <div className={`text-9xl font-black mb-8 ${result === 'victory' ? 'text-yellow-400' : 'text-red-600'}`}>
                            {result === 'victory' ? 'VICTORY' : 'DEFEAT'}
                        </div>
                        <div className="flex gap-4 justify-center">
                            <button onClick={onRestart} className="px-8 py-4 bg-gray-800 hover:bg-gray-700 text-white font-bold rounded-full border-2 border-white/20 flex items-center gap-4 transition-all hover:scale-105">
                                <RefreshCw /> 再来一局
                            </button>
                            <button onClick={() => window.location.reload()} className="px-8 py-4 bg-blue-900 hover:bg-blue-800 text-white font-bold rounded-full border-2 border-blue-500/50 flex items-center gap-4 transition-all hover:scale-105">
                                返回备战
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};