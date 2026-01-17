import React, { useState } from 'react';
import { Palette } from 'lucide-react';
import { PERSONALIZATION_ASSETS } from '../data/imageData';
import { StyleSelector } from './StyleSelector';

interface PersonalizationDrawerProps {
    currentCardBackIndex: number;
    currentDeskIndex: number;
    unlockedCardBacks: number[];
    unlockedDesks: number[];
    onSetCardBack: (index: number) => void;
    onSetDesk: (index: number) => void;
}

export const PersonalizationDrawer: React.FC<PersonalizationDrawerProps> = ({
    currentCardBackIndex,
    currentDeskIndex,
    unlockedCardBacks, // [新增]
    unlockedDesks,
    onSetCardBack,
    onSetDesk
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [hoverItem, setHoverItem] = useState<'cardBack' | 'desk' | null>(null);
    const [selectorType, setSelectorType] = useState<'cardBack' | 'desk' | null>(null);

    // 获取当前图片资源
    const cardBackImg = PERSONALIZATION_ASSETS.cardBacks[currentCardBackIndex];
    const deskImg = PERSONALIZATION_ASSETS.desks[currentDeskIndex];

    return (
        <>
            {/* 抽屉整体容器 */}
            <div
                className={`
                    absolute top-1/2 right-0 transform -translate-y-1/2 z-50
                    flex items-center transition-all duration-500 ease-out
                    ${isOpen ? 'translate-x-0' : 'translate-x-[160px]'}
                `}
            >
                {/* 1. 抽屉把手 (小三角形) */}
                <div
                    onClick={() => setIsOpen(!isOpen)}
                    className="w-8 h-16 bg-slate-800 rounded-l-lg border-l border-y border-white/20 flex items-center justify-center cursor-pointer hover:bg-slate-700 transition-colors shadow-xl"
                >
                    <div className={`w-0 h-0 border-t-[6px] border-t-transparent border-b-[6px] border-b-transparent border-r-[8px] border-r-gray-400 transition-transform duration-300 ${isOpen ? 'rotate-0' : 'rotate-180'}`}></div>
                </div>

                {/* 2. 抽屉内容区 */}
                <div className="w-[180px] h-[300px] bg-slate-900/95 backdrop-blur-md border border-white/10 rounded-l-2xl shadow-2xl flex flex-col items-center justify-center gap-8 relative p-4">
                    <div className="text-xs font-bold text-gray-500 tracking-widest mb-2 flex items-center gap-2">
                        <Palette size={12} /> CUSTOMIZE
                    </div>

                    {/* 卡背图标 */}
                    <div
                        className="relative group cursor-pointer"
                        onMouseEnter={() => setHoverItem('cardBack')}
                        onMouseLeave={() => setHoverItem(null)}
                        onClick={() => setSelectorType('cardBack')}
                    >
                        <div className="w-16 h-24 rounded-lg overflow-hidden border-2 border-white/20 shadow-lg transition-all duration-300 group-hover:scale-110 group-hover:rotate-[15deg] group-hover:border-orange-500 group-hover:shadow-[0_0_20px_orange] z-10 relative bg-black">
                            <img src={cardBackImg} className="w-full h-full object-cover" alt="Card Back" />
                        </div>
                        <div className="text-[10px] text-center mt-2 text-gray-400 font-mono group-hover:text-orange-400">CARD BACK</div>
                    </div>

                    {/* 牌桌图标 */}
                    <div
                        className="relative group cursor-pointer"
                        onMouseEnter={() => setHoverItem('desk')}
                        onMouseLeave={() => setHoverItem(null)}
                        onClick={() => setSelectorType('desk')}
                    >
                        <div className="w-24 h-14 rounded-lg overflow-hidden border-2 border-white/20 shadow-lg transition-all duration-300 group-hover:scale-110 group-hover:-rotate-[15deg] group-hover:border-orange-500 group-hover:shadow-[0_0_20px_orange] z-10 relative bg-black">
                            <img src={deskImg} className="w-full h-full object-cover" alt="Desk" />
                        </div>
                        <div className="text-[10px] text-center mt-2 text-gray-400 font-mono group-hover:text-orange-400">BOARD</div>
                    </div>
                </div>

                {/* 3. 悬停大图预览 (Floating Preview) */}
                {/* 显示在抽屉左侧的剩余空间 */}
                {isOpen && hoverItem && (
                    <div className="absolute right-[220px] top-1/2 -translate-y-1/2 pointer-events-none animate-fade-in z-40">
                        {/* 黑色模糊背景垫底 */}
                        <div className="absolute inset-0 bg-black/80 backdrop-blur-xl rounded-xl -m-4"></div>

                        <div className={`
                            relative border-2 border-orange-500/50 rounded-lg overflow-hidden shadow-2xl
                            ${hoverItem === 'cardBack' ? 'w-[240px] h-[360px]' : 'w-[400px] h-[225px]'}
                        `}>
                            <img
                                src={hoverItem === 'cardBack' ? cardBackImg : deskImg}
                                className="w-full h-full object-cover"
                                alt="Preview"
                            />
                            <div className="absolute bottom-0 w-full bg-black/60 text-white text-center text-xs py-1 font-mono tracking-widest backdrop-blur-sm">
                                PREVIEW
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* 4. 全屏选择器模态框 */}
            {selectorType && (
                <StyleSelector
                    type={selectorType}
                    currentSelected={selectorType === 'cardBack' ? currentCardBackIndex : currentDeskIndex}

                    // [核心修复] 根据类型传递对应的解锁列表
                    unlockedIndices={selectorType === 'cardBack' ? unlockedCardBacks : unlockedDesks}

                    onSelect={(idx) => {
                        if (selectorType === 'cardBack') onSetCardBack(idx);
                        else onSetDesk(idx);
                    }}
                    onClose={() => setSelectorType(null)}
                />
            )}
        </>
    );
};