import React, {useState} from 'react';
import { X, Check } from 'lucide-react';
import { PERSONALIZATION_ASSETS } from '../data/imageData';

interface StyleSelectorProps {
    type: 'cardBack' | 'desk'; // 当前选择的是卡背还是牌桌
    currentSelected: number;   // 当前生效的索引 (0-4)
    onSelect: (index: number) => void; // 确认选择回调
    onClose: () => void;       // 关闭回调
}

export const StyleSelector: React.FC<StyleSelectorProps> = ({
    type,
    currentSelected,
    onSelect,
    onClose
}) => {
    // 临时预览索引 (用户在模态框里随便点，点"确认"前不生效)
    const [previewIndex, setPreviewIndex] = useState(currentSelected);

    const assets = type === 'cardBack' ? PERSONALIZATION_ASSETS.cardBacks : PERSONALIZATION_ASSETS.desks;
    const title = type === 'cardBack' ? 'CARD BACK SELECTION' : 'BATTLEFIELD SELECTION';

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

    return (
        <div className="fixed inset-0 z-[600] flex items-center justify-center bg-black/95 backdrop-blur-xl animate-fade-in text-white">
            {/* 关闭按钮 */}
            <button
                onClick={onClose}
                className="absolute top-8 right-8 p-2 rounded-full bg-white/5 hover:bg-white/20 transition-all text-gray-400 hover:text-white"
            >
                <X size={32} />
            </button>

            <div className="flex w-full h-full max-w-[1600px] p-12 gap-12">

                {/* --- 左侧：缩略图列表 --- */}
                <div className="w-64 flex flex-col gap-6 overflow-y-auto custom-scrollbar py-4 pr-4">
                    {assets.map((img, idx) => (
                        <div
                            key={idx}
                            onClick={() => setPreviewIndex(idx)}
                            className={`
                                relative cursor-pointer rounded-xl overflow-hidden border-2 transition-all duration-300 group
                                ${previewIndex === idx ? 'border-orange-500 scale-105 shadow-[0_0_20px_orange]' : 'border-white/10 hover:border-white/50 opacity-60 hover:opacity-100'}
                                ${type === 'cardBack' ? 'aspect-[2/3]' : 'aspect-video'}
                            `}
                        >
                            <img src={img} className="w-full h-full object-cover" alt={`Style ${idx}`} />

                            {/* 当前生效标记 */}
                            {currentSelected === idx && (
                                <div className="absolute top-2 right-2 bg-green-500 text-black p-1 rounded-full shadow-lg">
                                    <Check size={12} strokeWidth={4} />
                                </div>
                            )}

                            <div className="absolute inset-0 bg-black/20 group-hover:bg-transparent transition-colors"></div>
                        </div>
                    ))}
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
                        {/* 切换动画需要 Key 变化 */}
                        <img
                            key={previewIndex}
                            src={assets[previewIndex]}
                            className="w-full h-full object-cover animate-fade-in"
                            alt="Preview"
                        />

                        {/* 滚轮提示 */}
                        <div className="absolute bottom-4 right-4 text-xs font-mono text-white/40 bg-black/50 px-2 py-1 rounded border border-white/10">
                            SCROLL TO SWITCH
                        </div>
                    </div>

                    {/* 底部操作栏 */}
                    <div className="mt-12 flex gap-8 items-center">
                        <div className="text-xl font-mono text-gray-400">
                            STYLE {String(previewIndex + 1).padStart(2, '0')} / {String(assets.length).padStart(2, '0')}
                        </div>

                        <button
                            onClick={() => {
                                onSelect(previewIndex);
                                // 不自动关闭，允许用户继续看其他的，或者用户手动关
                            }}
                            disabled={currentSelected === previewIndex}
                            className={`
                                px-12 py-4 rounded-full font-black tracking-widest text-lg transition-all
                                flex items-center gap-3
                                ${currentSelected === previewIndex
                                    ? 'bg-green-600/20 text-green-500 border border-green-500/50 cursor-default'
                                    : 'bg-orange-600 hover:bg-orange-500 text-white shadow-[0_0_30px_rgba(234,88,12,0.4)] hover:scale-105'}
                            `}
                        >
                            {currentSelected === previewIndex ? (
                                <><Check /> EQUIPPED</>
                            ) : (
                                'SELECT STYLE'
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};