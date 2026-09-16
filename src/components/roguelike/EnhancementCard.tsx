// ==========================================
// 悖论迷宫 · 迷宫强化图鉴卡（逻辑研习同款样式）
// [2026-08-27 莉莉子] 从 RogueCodex 的 renderEnhBlock 提取为共享组件，
//   供逻辑研习图鉴与敌人详情「持有迷宫BUFF」复用。
// ==========================================
import React from 'react';
import type { MazeBuff } from '../../data/roguelike/buffs';
import { RARITY_META } from './RarityIcon';
import { TRIGGER_LABELS, EFFECT_LABELS } from './RogueCodex';

/** BUFF 悬停回调（敌人详情传入，浮层预览用） */
type BuffHover = (buff: MazeBuff) => { onMouseEnter: (e: React.MouseEvent) => void; onMouseLeave: () => void };

interface EnhancementCardProps {
    e: MazeBuff;
    bindHover?: BuffHover; // 可选：敌人详情悬停浮层
}

/** [2026-08-27] 迷宫强化图鉴卡：品质色边框 + 六边形图标 + 名称 + 品质/触发标签 + 描述 + 效果类标签 */
export const EnhancementCard: React.FC<EnhancementCardProps> = ({ e, bindHover }) => {
    const meta = RARITY_META[e.rarity];
    const trigger = e.battleEffect?.trigger;
    const effectClass = e.battleEffect?.effectClass;
    const hoverProps = bindHover ? bindHover(e) : {};
    return (
        <div
            {...hoverProps}
            className="rounded-2xl border p-4 flex flex-col gap-3 transition-all hover:scale-[1.03] hover:-translate-y-0.5 cursor-pointer"
            style={{ background: meta.cardBg, borderColor: `${meta.color}55`, boxShadow: `0 0 20px ${meta.color}1f` }}
        >
            {/* 六边形图标（品质色描边发光） */}
            <div
                className="w-16 h-16 mx-auto flex items-center justify-center"
                style={{
                    clipPath: 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)',
                    background: `${meta.color}18`,
                    border: `1px solid ${meta.color}66`,
                    boxShadow: `0 0 18px ${meta.color}22`,
                }}
            >
                <img src={e.icon} alt={e.name} className="w-full h-full object-cover" draggable={false} />
            </div>
            {/* 名称 */}
            <div className="text-center text-sm font-bold tracking-wide truncate"
                style={{ color: '#fff', textShadow: `0 0 10px ${meta.color}66` }}>
                {e.name}
            </div>
            {/* 品质 + 触发时机 */}
            <div className="flex flex-wrap justify-center gap-1.5">
                <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded font-mono"
                    style={{ color: meta.color, border: `1px solid ${meta.color}44`, background: `${meta.color}11` }}>
                    {meta.label}
                </span>
                {trigger && (
                    <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded font-mono text-cyan-300 border border-cyan-400/30 bg-cyan-400/10">
                        {TRIGGER_LABELS[trigger]}
                    </span>
                )}
            </div>
            {/* 描述 */}
            <p className="text-gray-400 text-xs leading-snug line-clamp-3 min-h-[3rem]">{e.description}</p>
            {/* 效果类 */}
            {effectClass && (
                <div className="mt-auto text-center">
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-mono text-purple-200 border border-purple-400/30 bg-purple-500/10">
                        {EFFECT_LABELS[effectClass]}
                    </span>
                </div>
            )}
        </div>
    );
};
