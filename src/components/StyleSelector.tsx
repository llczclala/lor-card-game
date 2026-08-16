import React, {useState} from 'react';
import { X, Check, Lock } from 'lucide-react';
import { PERSONALIZATION_ASSETS } from '../data/imageData';
import { DeskMedia } from './DeskMedia'; // [2026-08-13] 动态牌桌媒体组件

interface StyleSelectorProps {
    type: 'cardBack' | 'desk'; // 当前选择的是卡背还是牌桌
    currentSelected: number;   // 当前生效的索引 (0-4)
    unlockedIndices: number[];
    onSelect: (index: number) => void; // 确认选择回调
    onClose: () => void;       // 关闭回调
    deskDynamic?: boolean;     // [2026-08-13] 动态牌桌开关（牌桌类型时生效）
}

export const StyleSelector: React.FC<StyleSelectorProps> = ({
    type,
    currentSelected,
    unlockedIndices,
    onSelect,
    onClose,
    deskDynamic = false
}) => {
    // 临时预览索引 (用户在模态框里随便点，点"确认"前不生效)
    const [previewIndex, setPreviewIndex] = useState(currentSelected);

    const assets = type === 'cardBack' ? PERSONALIZATION_ASSETS.cardBacks : PERSONALIZATION_ASSETS.desks;
    const title = type === 'cardBack' ? '卡背选择' : '牌桌选择';

    // 鼠标滚轮切换逻辑
    const handleWheel = (e: React.WheelEvent) => {
        if (e.deltaY > 0) {
            // 下一张
            setPreviewIndex(prev => (prev + 1) % assets.length);
        } else {
            // 上一张
            setPreviewIndex(prev => (prev - 1 + assets.length) % assets.length);
        }
    };
    const isPreviewUnlocked = unlockedIndices.includes(previewIndex);

    return (
        <>
            {/* 关闭按钮 - 独立 fixed 定位，完全脱离 flex 布局，永不被遮挡 */}
            <button
                onClick={onClose}
                className="fixed top-8 right-8 z-[999] p-3 rounded-full
                           bg-black/70 border border-white/20 text-white
                           hover:bg-white/20 hover:border-white/60
                           shadow-2xl transition-all"
            >
                <X size={32} />
            </button>

            <div className="fixed inset-0 z-[600] flex items-center justify-center bg-black/95 backdrop-blur-xl animate-fade-in text-white">
            <div className="flex w-full h-full max-w-[1600px] p-12 gap-12">

                {/* --- 左侧：缩略图列表 --- */}
                <div className="w-64 flex flex-col min-h-0 py-4 pr-4">
                    <div className="flex-1 overflow-y-auto custom-scrollbar min-h-0 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                        <div className="flex flex-col gap-4">
                            {assets.map((img, idx) => {
                                // 判断每一项是否解锁
                                const isUnlocked = unlockedIndices.includes(idx);

                                return (
                                    <div
                                        key={idx}
                                        onClick={() => setPreviewIndex(idx)}
                                        className={`
                                            relative cursor-pointer rounded-xl overflow-hidden border-2 transition-all duration-300 group
                                            ${previewIndex === idx ? 'border-orange-500 scale-105 shadow-[0_0_20px_orange]' : 'border-white/10 hover:border-white/50 opacity-60 hover:opacity-100'}
                                            ${type === 'cardBack' ? 'aspect-[2/3]' : 'aspect-video'}
                                        `}
                                    >
                                        {type === 'cardBack' ? (
                                            <img
                                                src={img}
                                                className={`w-full h-full object-contain ${!isUnlocked ? 'grayscale' : ''}`}
                                                alt={`Style ${idx}`}
                                            />
                                        ) : (
                                            <DeskMedia deskIndex={idx} className={`w-full h-full object-contain ${!isUnlocked ? 'grayscale' : ''}`} />
                                        )}

                                        {/* 当前生效标记 */}
                                        {currentSelected === idx && (
                                            <div className="absolute top-2 right-2 bg-green-500 text-black p-1 rounded-full shadow-lg z-10">
                                                <Check size={12} strokeWidth={4} />
                                            </div>
                                        )}

                                        {/* 未解锁标记 (锁图标) */}
                                        {!isUnlocked && (
                                            <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                                                <Lock size={24} className="text-white/80" />
                                            </div>
                                        )}

                                        <div className="absolute inset-0 bg-black/20 group-hover:bg-transparent transition-colors"></div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>


                {/* --- 右侧：大图预览与确认 --- */}
                <div className="flex-1 flex flex-col items-center justify-center relative">
                    <h2 className="text-4xl font-black tracking-[0.5em] text-white/20 mb-8 absolute top-0">{title}</h2>

                    {/* 预览窗口 */}
                    <div
                        className={`
                            relative shadow-2xl transition-all duration-500 ease-out
                            ${type === 'cardBack' ? 'h-[70vh] aspect-[2/3] rounded-2xl' : 'w-[80%] aspect-video rounded-xl'}
                            border border-white/10 bg-black overflow-hidden
                        `}
                        onWheel={handleWheel}
                    >
                        {/* 切换动画需要 Key 变化（[2026-08-13] 牌桌类型用动态视频 DeskMedia） */}
                        {type === 'cardBack' ? (
                            <img
                                key={previewIndex}
                                src={assets[previewIndex]}
                                className="w-full h-full object-cover animate-fade-in"
                                alt="预览"
                            />
                        ) : (
                            <DeskMedia key={previewIndex} deskIndex={previewIndex} dynamic={deskDynamic} className="w-full h-full object-cover animate-fade-in" />
                        )}

                        {/* [新增] 未解锁时的全屏遮罩/提示 */}
                        {!isPreviewUnlocked && (
                            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/20 backdrop-blur-[2px]">
                                <Lock size={64} className="text-white/50 mb-4" />
                                <span className="text-2xl font-black tracking-widest text-white/50 border-2 border-white/50 px-6 py-2 rounded">
                                    LOCKED
                                </span>
                            </div>
                        )}

                        {/* 滚轮提示 */}
                        <div className="absolute bottom-4 right-4 text-xs font-mono text-white/40 bg-black/50 px-2 py-1 rounded border border-white/10">
                            SCROLL TO SWITCH
                        </div>
                    </div>


                    {/* 底部操作栏 */}
                    <div className="mt-12 flex gap-8 items-center">
                        <div className="text-xl font-mono text-gray-400">
                            风格 {String(previewIndex + 1).padStart(2, '0')} / {String(assets.length).padStart(2, '0')}
                        </div>


                        <button
                            onClick={() => {
                                if (isPreviewUnlocked) {
                                    onSelect(previewIndex);
                                }
                            }}
                            // 禁用条件：已经是当前选择 OR 未解锁
                            disabled={currentSelected === previewIndex || !isPreviewUnlocked}
                            className={`
                                px-12 py-4 rounded-full font-black tracking-widest text-lg transition-all
                                flex items-center gap-3
                                ${!isPreviewUnlocked
                                    ? 'bg-gray-800 text-gray-500 border border-gray-700 cursor-not-allowed' // 锁定样式
                                    : (currentSelected === previewIndex
                                        ? 'bg-green-600/20 text-green-500 border border-green-500/50 cursor-default' // 已选中样式
                                        : 'bg-orange-600 hover:bg-orange-500 text-white shadow-[0_0_30px_rgba(234,88,12,0.4)] hover:scale-105') // 可选样式
                                }
                            `}
                        >
                            {!isPreviewUnlocked ? (
                                <><Lock size={20} /> 锁定</>
                            ) : (
                                currentSelected === previewIndex ? (
                                    <><Check /> 装备中</>
                                ) : (
                                    '风格选择'
                                )
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </div>
        </>
    );
};