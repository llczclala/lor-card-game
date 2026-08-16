// ==========================================
// 悖论迷宫 · 强化卡牌
// [2026-08-10 莉莉子] 参考法术卡牌（SpellCard）样式：无左上角费用，右上角为稀有度图标，
// 卡面颜色随稀有度统一，中间圆形原画显示强化图（当前统一 abc.png 占位）。
// 设计基准尺寸参考法术卡（缩放由外层控制），选中时高亮发光。
// ==========================================
import React from 'react';
import type { MazeEnhancement } from '../../../data/roguelike/enhancements';
import { RARITY_META, RarityIcon } from '../RarityIcon';

interface EnhancementCardProps {
    // [2026-08-11 节点预览] 放宽为 Pick：EnemyBuff 结构天然满足（含 name/description/rarity/icon），NodeEventModal 传完整 MazeEnhancement 仍兼容
    enhancement: Pick<MazeEnhancement, 'name' | 'description' | 'rarity' | 'icon'>;
    isSelected: boolean;
    onClick: () => void;
}

export const EnhancementCard: React.FC<EnhancementCardProps> = ({ enhancement, isSelected, onClick }) => {
    const meta = RARITY_META[enhancement.rarity];

    return (
        <button
            onClick={onClick}
            className={`relative w-[250px] h-[395px] overflow-hidden rounded-2xl border-[4px] flex flex-col items-center pt-8 transition-all duration-200
                ${isSelected ? 'scale-[1.04]' : 'opacity-90 hover:opacity-100 hover:scale-[1.02]'}`}
            style={{
                borderColor: meta.color,
                background: meta.cardBg,
                boxShadow: isSelected ? `0 0 32px ${meta.color}aa, inset 0 0 20px ${meta.color}22` : undefined,
            }}
        >
            {/* 右上角稀有度图标（替代法术速度位） */}
            <div className="absolute top-3 right-3 z-30">
                <RarityIcon rarity={enhancement.rarity} size={24} />
            </div>

            {/* 中间圆形原画（强化图，当前统一 abc.png） */}
            <div className="relative w-40 h-40 mt-1 mb-4 shrink-0 z-10">
                <div
                    className="absolute inset-[-5px] rounded-full border-[3px] opacity-60"
                    style={{ borderColor: meta.color, boxShadow: `0 0 18px ${meta.color}44` }}
                ></div>
                <div className="w-full h-full rounded-full overflow-hidden bg-black relative shadow-inner border-2 border-black">
                    <img
                        src={enhancement.icon}
                        alt={enhancement.name}
                        className="w-full h-full object-cover scale-110"
                    />
                    <div className="absolute inset-0 rounded-full shadow-[inset_0_0_24px_rgba(0,0,0,0.85)] pointer-events-none"></div>
                </div>
            </div>

            {/* 名称 */}
            <div className="relative z-20 w-full text-center mb-2 px-2">
                <h3
                    className="text-white font-black text-xl tracking-widest drop-shadow-lg"
                    style={{ textShadow: `0 0 14px ${meta.color}99` }}
                >
                    {enhancement.name}
                </h3>
                <div
                    className="h-[2px] w-2/3 mx-auto opacity-50 mt-1.5"
                    style={{ background: `linear-gradient(to right, transparent, ${meta.color}, transparent)` }}
                ></div>
            </div>

            {/* 效果描述框 */}
            <div className="flex-1 w-[88%] mb-6 relative z-10">
                <div className="absolute inset-0 bg-black/55 rounded-xl border border-white/10 backdrop-blur-sm shadow-inner"></div>
                <div className="relative h-full flex items-center justify-center p-3.5 text-center overflow-hidden">
                    <p className="text-gray-100 text-sm leading-snug font-medium">{enhancement.description}</p>
                </div>
            </div>

            {/* 选中描边层 */}
            {isSelected && (
                <div
                    className="absolute inset-0 z-40 pointer-events-none rounded-2xl border-2"
                    style={{ borderColor: meta.color }}
                ></div>
            )}
        </button>
    );
};
