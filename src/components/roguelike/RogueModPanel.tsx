// ==========================================
// 悖论迷宫 · 战斗内强化状态栏
// [2026-08-11 莉莉子] 战斗画面右上角常驻：显示玩家已拥有的【战斗型】迷宫强化
//   （带 battleEffect 的被动强化；即时资源型如加血/加金不在此显示）。
//   圆形图标 + 稀有度边框色，悬浮显示名称与说明（参考 LOR 战斗内查看 powers）。
// ==========================================
import React from 'react';
import { MAZE_BUFFS } from '../../data/roguelike/buffs';
import { RARITY_META } from './RarityIcon';

interface RogueModPanelProps {
    enhancements?: string[]; // 可选：标准/教程模式无迷宫强化
}

export const RogueModPanel: React.FC<RogueModPanelProps> = ({ enhancements }) => {
    const defs = (enhancements ?? [])
        .map(id => MAZE_BUFFS.find(b => b.id === id))
        .filter((b): b is NonNullable<typeof b> => !!b && !!b.battleEffect);
    if (defs.length === 0) return null;

    return (
        <div className="absolute top-2 right-2 z-[155] flex flex-col items-end gap-1.5">
            {defs.map(def => {
                const meta = RARITY_META[def.rarity];
                return (
                    <div key={def.id} className="group relative">
                        {/* 圆形强化图标 */}
                        <div
                            className="w-9 h-9 rounded-full overflow-hidden border-2 bg-black shadow-lg transition-transform group-hover:scale-110"
                            style={{ borderColor: meta.color, boxShadow: `0 0 10px ${meta.color}66` }}
                        >
                            <img src={def.icon} alt={def.name} className="w-full h-full object-cover" />
                        </div>
                        {/* 悬浮说明 */}
                        <div className="absolute right-full top-1/2 -translate-y-1/2 mr-2 w-48 opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-150 z-30">
                            <div className="bg-black/90 border rounded-lg px-2.5 py-2 backdrop-blur-sm shadow-xl" style={{ borderColor: meta.color }}>
                                <div className="text-xs font-black tracking-widest mb-1" style={{ color: meta.color }}>
                                    {def.name}
                                </div>
                                <div className="text-gray-300 text-[11px] leading-snug">{def.description}</div>
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
};
