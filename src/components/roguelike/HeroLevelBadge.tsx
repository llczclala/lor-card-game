// ==========================================
// 悖论迷宫 · 天启者养成——等级徽章 + 经验条（通用组件）
// [2026-08-12 莉莉子] 英雄选择卡 / 肉鸽大厅共用。等级色随等级档（青→紫→金→红）。
// ==========================================
import React from 'react';
import { getLevelColor } from '../../data/roguelike/heroProgression';

interface HeroLevelBadgeProps {
    level: number;
    exp: number;
    expToNext: number; // 升下一级所需（满级 0）
    size?: 'sm' | 'md';
    showLevel?: boolean; // 是否显示等级徽章（默认 true；英雄卡右上角可只留徽章）
    showBar?: boolean;   // 是否显示经验条 + 数字（默认 true；英雄卡底部可只留经验条）
}

export const HeroLevelBadge: React.FC<HeroLevelBadgeProps> = ({
    level, exp, expToNext, size = 'md', showLevel = true, showBar = true,
}) => {
    const color = getLevelColor(level);
    const pct = expToNext > 0 ? Math.min(100, Math.round((exp / expToNext) * 100)) : 100;
    const small = size === 'sm';

    return (
        <div className="flex flex-col items-center gap-0.5 pointer-events-none">
            {showLevel && (
                <div
                    className={`${small ? 'px-1.5 py-[1px] text-[9px]' : 'px-2 py-0.5 text-xs'} font-black rounded-md border-2 leading-tight`}
                    style={{ color, borderColor: color, background: 'rgba(0,0,0,0.65)', boxShadow: `0 0 10px ${color}66` }}
                >
                    Lv.{level}
                </div>
            )}
            {showBar && (
                <>
                    <div className={`${small ? 'w-10' : 'w-14'} h-1.5 rounded-full bg-black/70 overflow-hidden border border-white/20`}>
                        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: color }} />
                    </div>
                    {!small && (
                        <div className="text-[9px] font-mono text-white/60 leading-none">
                            {expToNext > 0 ? `${exp}/${expToNext}` : 'MAX'}
                        </div>
                    )}
                </>
            )}
        </div>
    );
};
