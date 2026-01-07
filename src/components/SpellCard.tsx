import React from 'react';
import type { CardData } from '../types';
import { Zap, Clock } from 'lucide-react';
interface SpellCardProps {
    data: CardData;
    className?: string;
}

/**
 * 法术卡面组件
 * 设计基准尺寸: 288px x 448px (与 Unit Card 一致)
 * 所有内部元素尺寸均以此为基准，外部通过 transform: scale() 进行缩放
 */
export const SpellCard: React.FC<SpellCardProps> = ({ data, className = '' }) => {

    const getSpeedIcon = () => {
        switch (data.type) {
            case 'spell-burst': return <Zap size={24} className="text-yellow-400 fill-yellow-400" />;
            case 'spell-fast': return <Zap size={24} className="text-white" />;
            case 'spell-slow': return <Clock size={24} className="text-purple-300" />;
            default: return null;
        }
    };
    const isFenny = data.region === 'Fenny';
    const isLyfe = data.region === 'Lyfe';
    const isLogistics = data.region === 'Logistics';

    const borderColor = isFenny
        ? 'border-red-900'
        : (isLogistics ? 'border-white-900' : (isLyfe ? 'border-blue-900' : 'border-grey-900'));

    const bgGradient = isFenny
        ? 'bg-gradient-to-b from-gray-900 via-red-950 to-gray-900'
        : (isLogistics
            ? 'bg-gradient-to-b from-gray-900 via-white-950 to-gray-900'
            :  (isLyfe
                 ? 'bg-gradient-to-b from-gray-900 via-blue-950 to-gray-900'
                 : 'bg-gradient-to-b from-gray-900 via-grey-950 to-gray-900'));

    const costColor = data.region === 'Fenny' ? 'bg-red-800 border-red-500' : 'bg-blue-600 border-blue-400';

    return (
        <div className={`w-full h-full relative overflow-hidden rounded-2xl border-[4px] ${borderColor} ${bgGradient} flex flex-col items-center pt-6 ${className}`}>

            {/* 1. 顶部费用 (放大) */}
            <div className="absolute top-4 left-4 z-30 flex flex-col items-center gap-1">
                <div className={`w-14 h-14 rounded-full ${costColor} border-2 flex items-center justify-center shadow-xl`}>
                    <span className="text-white font-black text-3xl drop-shadow-md pt-1">{data.cost}</span>
                </div>
            </div>

            {/* 速度图标 (放大) */}
            <div className="absolute top-4 right-4 z-30 opacity-90">
                <div className="w-12 h-12 bg-black/60 rounded-full backdrop-blur-sm border border-white/20 flex items-center justify-center shadow-lg">
                    {getSpeedIcon()}
                </div>
            </div>

            {/* 2. 圆形原画容器 (放大至 200px) */}
            <div className="relative w-52 h-52 mt-4 mb-4 shrink-0 z-10 group">
                <div className="absolute inset-[-6px] rounded-full border-[3px] border-[#c8aa6d]/60 shadow-[0_0_25px_rgba(200,170,109,0.4)] z-20 pointer-events-none"></div>

                <div className="w-full h-full rounded-full overflow-hidden bg-black relative shadow-inner border-2 border-black">
                    <img
                        src={data.imageUrl}
                        alt={data.name}
                        className="w-full h-full object-cover scale-110 group-hover:scale-125 transition-transform duration-700"
                    />
                    <div className="absolute inset-0 rounded-full shadow-[inset_0_0_30px_rgba(0,0,0,0.8)] pointer-events-none"></div>
                </div>
            </div>

            {/* 3. 卡牌名称 (放大字号) */}
            <div className="relative z-20 w-full text-center mb-2 px-2">
                <h3 className="text-white font-black text-2xl tracking-widest drop-shadow-lg font-serif text-transparent bg-clip-text bg-gradient-to-r from-yellow-100 via-white to-yellow-100 uppercase">
                    {data.name}
                </h3>
                <div className="h-[2px] w-2/3 bg-gradient-to-r from-transparent via-[#c8aa6d] to-transparent mx-auto opacity-50 mt-2"></div>
            </div>

            {/* 4. 效果描述框 (放大区域与文字) */}
            <div className="flex-1 w-[90%] mb-6 relative z-10">
                <div className="absolute inset-0 bg-black/50 rounded-xl border border-white/10 backdrop-blur-sm shadow-inner"></div>
                <div className="relative h-full flex items-center justify-center p-4 text-center overflow-hidden">
                    {/* 使用 text-base 或 text-lg 确保缩放后依然清晰 */}
                    <p className="text-gray-100 text-lg leading-snug font-medium text-shadow-sm">
                        {data.description}
                    </p>
                </div>
            </div>

            <div className="absolute inset-0 pointer-events-none opacity-10 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-white via-transparent to-transparent z-0"></div>
        </div>
    );
};