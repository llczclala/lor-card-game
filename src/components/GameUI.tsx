import { useState, useEffect } from 'react';
import { PERSONALIZATION_ASSETS } from '../data/imageData';

const useNumberTicker = (targetValue: number, duration: number = 1000) => {
    // ... (保持不变)
    const [displayValue, setDisplayValue] = useState(targetValue);
    useEffect(() => {
        if (displayValue === targetValue) return;
        const diff = Math.abs(targetValue - displayValue);
        if (diff === 0) return;
        const stepTime = Math.max(10, duration / diff);
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
export const Deck = ({ isEnemy, cardBackIndex = 0 }: { isEnemy: boolean, cardBackIndex?: number }) => {
    // 获取对应的卡背图片，如果索引无效则回退到默认(0)
    const cardBackImg = PERSONALIZATION_ASSETS.cardBacks[cardBackIndex] || PERSONALIZATION_ASSETS.cardBacks[0];

    return (
        <div className={`
            relative w-[120px] h-[180px] rounded-xl shadow-2xl z-10
            /* 不在这里控制旋转，交由父容器控制 */
        `}>
            {/* 1. 模拟厚度 (堆叠层) */}
            {[1, 2, 3, 4].map(i => (
                <div
                    key={i}
                    className="absolute inset-0 rounded-xl bg-gray-800 border border-gray-600"
                    style={{
                        transform: `translateX(-${i}px) translateY(${i}px)`,
                        zIndex: -i
                    }}
                ></div>
            ))}

            {/* 2. 顶部卡背 (封面) */}
            <div className="absolute inset-0 rounded-xl overflow-hidden border-2 border-[#1a1a1a]">
                <img
                    src={cardBackImg}
                    alt="Deck"
                    className="w-full h-full object-cover"
                />
                {/* 可选：加一层微弱的光泽 */}
                <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent pointer-events-none"></div>
            </div>
        </div>
    );
};