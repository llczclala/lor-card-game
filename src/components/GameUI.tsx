import { useState, useEffect, useRef } from 'react';
import { PERSONALIZATION_ASSETS } from '../data/imageData';
import { Card } from './Card';
import { eventBus, GameEvents } from '../utils/eventBus';

const useNumberTicker = (targetValue: number, duration: number = 1000) => {
    const [displayValue, setDisplayValue] = useState(targetValue);
    useEffect(() => {
        if (displayValue === targetValue) return;
        const diff = Math.abs(targetValue - displayValue);
        // 动态步长：差值越大跑得越快，最小 10ms 一跳
        const stepTime = Math.max(10, duration / (diff * 2));
        const step = displayValue < targetValue ? 1 : -1;
        const timer = setTimeout(() => setDisplayValue(prev => prev + step), stepTime);
        return () => clearTimeout(timer);
    }, [targetValue, displayValue, duration]);
    return displayValue;
};

export const ManaDisplay = ({ current, max, spellMana, label, align }: { current: number, max: number, spellMana: number, label: string, align: 'top' | 'bottom' }) => (
    // ... (保持不变)
    <div className={`flex flex-col gap-1 p-3 rounded-xl border border-white/10 bg-black/60 backdrop-blur-md w-40 transition-all ${align === 'top' ? 'mb-4' : 'mt-4'}`}>
        <div className="flex justify-between items-center mb-1">
            <span className="text-[10px] text-gray-400 font-bold tracking-widest">{label}</span>
            <span className="text-blue-300 font-mono text-xs">{current}/{max}</span>
        </div>
        <div className="flex gap-1 h-2">
            {Array.from({ length: max }).map((_, i) => (
                <div key={i} className={`flex-1 rounded-sm ${i < current ? 'bg-blue-500 shadow-[0_0_5px_#3b82f6]' : 'bg-gray-700'}`}></div>
            ))}
        </div>
        <div className="flex justify-end items-center gap-1 mt-1">
            <span className="text-[8px] text-pink-400 font-bold">SPELL</span>
            <div className="flex gap-1">
                {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className={`w-2 h-2 rounded-full ${i < spellMana ? 'bg-pink-500 shadow-[0_0_5px_#ec4899]' : 'bg-gray-700'}`}></div>
                ))}
            </div>
        </div>
    </div>
);

// --- [重构] 智能水晶组件 (SmartNexus) 事件驱动飘字 ---
export const SmartNexus = ({
    health,
    isEnemy,
    onClick,
    highlight
}: {
    health: number,
    maxHealth?: number,
    isEnemy: boolean,
    onClick?: () => void,
    highlight?: boolean
}) => {
    // 1. 数值滚动
    const displayHealth = useNumberTicker(health, 800);

    // 2. 飘字队列：每次独立打击对应一个飘字
    const [hitQueue, setHitQueue] = useState<{ id: number; amount: number }[]>([]);
    // [2026-06-27 巴德尔试剂] 回血飘字队列
    const [healQueue, setHealQueue] = useState<{ id: number; amount: number }[]>([]);
    const hitIdRef = useRef(0);

    // 3. 震动状态
    const [shake, setShake] = useState(false);

    // 4. 监听 NEXUS_STRIKED 事件驱动独立飘字
    useEffect(() => {
        const handleNexusHit = (payload: { target: string; amount: number }) => {
            if ((isEnemy && payload.target === 'enemy') || (!isEnemy && payload.target === 'player')) {
                const newId = hitIdRef.current++;
                setHitQueue(prev => [...prev, { id: newId, amount: payload.amount }]);

                setShake(true);
                setTimeout(() => {
                    setShake(false);
                    setHitQueue(prev => prev.filter(h => h.id !== newId));
                }, 1200);
            }
        };

        eventBus.on(GameEvents.NEXUS_STRIKED, handleNexusHit);
        return () => eventBus.off(GameEvents.NEXUS_STRIKED, handleNexusHit);
    }, [isEnemy]);

    // [2026-06-27 巴德尔试剂] 监听 NEXUS_HEALED 事件驱动回血飘字
    useEffect(() => {
        const handleNexusHeal = (payload: { target: string; amount: number }) => {
            if ((isEnemy && payload.target === 'enemy') || (!isEnemy && payload.target === 'player')) {
                const newId = hitIdRef.current++;
                setHealQueue(prev => [...prev, { id: newId, amount: payload.amount }]);
                setTimeout(() => {
                    setHealQueue(prev => prev.filter(h => h.id !== newId));
                }, 1200);
            }
        };

        eventBus.on(GameEvents.NEXUS_HEALED, handleNexusHeal);
        return () => eventBus.off(GameEvents.NEXUS_HEALED, handleNexusHeal);
    }, [isEnemy]);

    return (
        <div
            // [新增] 添加水晶实体 ID 标记
            data-entity-id={isEnemy ? 'enemy_nexus' : 'player_nexus'}

            className={`
                relative w-32 h-32 flex items-center justify-center transition-all duration-300
                ${shake ? 'animate-shake' : ''}
                ${highlight ? 'ring-4 ring-yellow-400 rounded-full shadow-[0_0_40px_rgba(250,204,21,0.6)] animate-pulse cursor-pointer scale-105' : ''}
            `}
            onClick={onClick}
        >
            {/* 飘字层：多个独立打击各自飘字 */}
            {hitQueue.map((hit, index) => (
                <div key={hit.id}
                    className={`absolute left-1/2 -translate-x-1/2 text-6xl font-black z-[100] whitespace-nowrap drop-shadow-[0_4px_4px_rgba(0,0,0,1)] stroke-white text-red-500 animate-float-damage`}
                    style={isEnemy
                        ? { top: `${4 + index * 3.5}rem` }   // 敌方水晶在顶部，飘字往下
                        : { top: `${-4 - index * 3.5}rem` }  // 玩家水晶在底部，飘字往上
                    }
                >
                    -{hit.amount}
                </div>
            ))}

            {/* [2026-06-27 巴德尔试剂] 回血飘字层 */}
            {healQueue.map((heal, index) => (
                <div key={heal.id}
                    className="absolute left-1/2 -translate-x-1/2 text-5xl font-black z-[100] whitespace-nowrap drop-shadow-[0_4px_4px_rgba(0,0,0,1)] text-green-400 animate-float-damage"
                    style={isEnemy
                        ? { top: `${4 + index * 3.5}rem` }
                        : { top: `${-4 - index * 3.5}rem` }
                    }
                >
                    +{heal.amount}
                </div>
            ))}

            {/* 复用现有的 NexusDisplay 进行基础渲染 */}
            <NexusDisplay
                health={displayHealth}
                isEnemy={isEnemy}
                damageTaken={undefined} // 飘字已由 SmartNexus 接管
            />
        </div>
    );
};

export const NexusDisplay = ({
                              health,
                              isEnemy,
                              damageTaken
                             }: { health: number, isEnemy: boolean, damageTaken?: number }) => {
    const displayHealth = useNumberTicker(health, 1000);

    // [修改] 极简设计，只保留数字和进攻令牌
    return (
        <div className="relative flex flex-col items-center justify-center w-full h-full">
            {/* 伤害飘字 (保留) */}
            {damageTaken !== undefined && damageTaken > 0 && (
                <div className="absolute left-full top-1/2 -translate-y-1/2 text-5xl font-black text-red-500 animate-float-damage z-50 drop-shadow-[0_2px_2px_rgba(0,0,0,0.8)] whitespace-nowrap">
                    -{damageTaken}
                </div>
            )}

            {/* 进攻令牌：现在改为悬浮在数字旁边的小图标 */}

            {/* 核心数值：纯数字，无背景，适配背景图方框 */}
            <div className={`
                text-5xl font-black font-mono tracking-tighter drop-shadow-md

                /* [修改1] 颜色：强制改为白色 */
                text-white

                /* [修改2] 水平位置：两个数字都向右移，进入方框 */
                /* 调整这个 85px 来控制左右位置 */
                translate-x-[85px]

                /* [修改3] 垂直位置：敌方下移，我方上移 */
                /* isEnemy ? 下移(正数) : 上移(负数) */
                /* 调整这个 15px 来控制上下偏移量 */
                ${isEnemy ? 'translate-y-[15px]' : '-translate-y-[15px]'}
            `}>
                {displayHealth}
            </div>
        </div>
    );
};

// [修改] 牌库组件：接收 cardBackIndex
export const Deck = ({
    isEnemy,
    cardBackIndex = 0,
    deckCount = 0,
    handCount = 0,
    initialHeroes = [],
    regions = [],
    onViewArt,
    playerNexusHealth,
    enemyNexusHealth,
    deckTransform = '' // [新增] 接收外界传来的物理形变参数
}: any) => {
    const cardBackImg = PERSONALIZATION_ASSETS.cardBacks[cardBackIndex] || PERSONALIZATION_ASSETS.cardBacks[0];
    const [isHovered, setIsHovered] = useState(false);
    const [isPanelOpen, setIsPanelOpen] = useState(false);

    return (
        <div
            className="relative z-10"
            data-entity-id={isEnemy ? 'enemy-deck' : 'player-deck'}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => { setIsHovered(false); setIsPanelOpen(false); }}
        >
            {/* [核心修复 1] 旋转与缩放隔离区：只将形变施加在牌库模型上，外部容器保持端正 */}
            <div style={{ transform: deckTransform }} className="origin-center">
                <div
                    className={`relative w-[120px] h-[180px] rounded-xl shadow-2xl transition-transform cursor-pointer ${isHovered ? 'scale-105' : ''}`}
                    onClick={() => setIsPanelOpen(true)}
                >
                    {/* 1. 模拟厚度 (堆叠层) */}
                    {[1, 2, 3, 4].map(i => (
                        <div key={i} className="absolute inset-0 rounded-xl bg-gray-800 border border-gray-600" style={{ transform: `translateX(-${i}px) translateY(${i}px)`, zIndex: -i }}></div>
                    ))}

                    {/* 2. 顶部卡背 (封面) */}
                    <div className="absolute inset-0 rounded-xl overflow-hidden border-2 border-[#1a1a1a]">
                        <img src={cardBackImg} alt="牌库" className="w-full h-full object-cover" />
                        <div className={`absolute inset-0 bg-white transition-opacity duration-300 pointer-events-none ${isHovered ? 'opacity-20' : 'opacity-0'}`}></div>
                    </div>
                </div>
            </div>

            {/* [核心修复 2] 面板隐形桥梁：利用 pt-4 和 pb-4 (Padding) 替代 mt/mb (Margin) */}
            {isPanelOpen && (
                <div
                    className={`absolute left-1/2 -translate-x-1/2 w-72 z-50 ${isEnemy ? 'top-full pt-4' : 'bottom-full pb-4'}`}
                    style={{ cursor: 'default' }}
                >
                    <div className="bg-slate-900/95 border-2 border-[#b89b5e] rounded-lg shadow-[0_10px_40px_rgba(0,0,0,0.8)] p-5 flex flex-col gap-5 backdrop-blur-md animate-fade-in">
                        {/* 地区区域 */}
                        <div className="flex flex-col items-center gap-2">
                            <div className="flex gap-3">
                                {regions.length > 0 ? regions.map((r: string) => (
                                    <div key={r} className="w-10 h-10 rounded-full border-2 border-yellow-500 bg-slate-800 flex items-center justify-center text-xs font-bold text-yellow-500 shadow-inner" title={r}>
                                        {r.substring(0,2).toUpperCase()}
                                    </div>
                                )) : (
                                    <div className="w-10 h-10 rounded-full border-2 border-gray-500 bg-slate-800 flex items-center justify-center text-xs text-gray-500">无</div>
                                )}
                            </div>
                            <span className="text-yellow-600/80 text-xs tracking-widest font-bold border-b border-yellow-600/30 w-full text-center pb-1">阵营</span>
                        </div>

                        {/* 英雄展示区域 */}
                        <div className="flex flex-col items-center gap-2">
                            <div className="flex gap-3 justify-center min-h-[112px]">
                                {initialHeroes.length > 0 ? initialHeroes.map((hero: any) => (
                                    <div key={hero.key} onContextMenu={(e) => { e.preventDefault(); onViewArt && onViewArt(hero); }}>
                                        <Card
                                            data={hero}
                                            location="deck-panel"
                                            playerNexusHealth={playerNexusHealth}
                                            enemyNexusHealth={enemyNexusHealth}
                                        />
                                    </div>
                                )) : (
                                    <div className="flex items-center justify-center w-[72px] h-[112px] border-2 border-dashed border-gray-700 rounded text-gray-600 text-xs">无英雄</div>
                                )}
                            </div>
                            <span className="text-yellow-600/80 text-xs tracking-widest font-bold border-b border-yellow-600/30 w-full text-center pb-1">英雄</span>
                        </div>

                        {/* 数量统计面板 */}
                        <div className="flex justify-between items-center px-4 py-2 bg-black/60 rounded-md border border-white/5">
                            <div className="flex flex-col items-center">
                                <span className="text-gray-400 text-[10px] tracking-widest mb-1">剩余卡牌</span>
                                <span className="text-white text-xl font-bold font-mono">{deckCount}</span>
                            </div>
                            <div className="w-px h-8 bg-gray-700"></div>
                            <div className="flex flex-col items-center">
                                <span className="text-gray-400 text-[10px] tracking-widest mb-1">在手牌中</span>
                                <span className={`${handCount >= 10 ? 'text-red-500 drop-shadow-[0_0_8px_rgba(239,68,68,0.8)]' : 'text-white'} text-xl font-bold font-mono transition-colors`}>{handCount}/10</span>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};