// ==========================================
// 悖论迷宫 · 神格碎片图标（[2026-09-29 程拍板]）
//
// 两类碎片视觉（程定）：
//   · **专属碎片** → 该天启者**头像裁进菱形**容器（菱形框用该天启者主题色）
//   · **万能碎片** → 等大的**橙色**菱形（暂无专属图，先用纯色菱形占位）
//
// 用法：
//   <ShardIcon heroKey="lyfe" size={22} />   // 里芙的神格碎片
//   <ShardIcon size={22} />                  // 万能神格碎片（不传 heroKey）
// ==========================================
import React from 'react';
import { HERO_IMAGES } from '../../data/imageData';
import { HERO_THEMES } from '../../data/roguelike/heroTheme';

/** 菱形裁切（正菱形：上/右/下/左 四顶点） */
export const SHARD_DIAMOND = 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)';

/** 万能碎片固定橙色 */
export const UNIVERSAL_SHARD_COLOR = '#f59e0b';

interface ShardIconProps {
    /** 天启者 key；**不传 = 万能碎片** */
    heroKey?: string;
    size?: number;
    className?: string;
    title?: string;
}

export const ShardIcon: React.FC<ShardIconProps> = ({ heroKey, size = 20, className = '', title }) => {
    const isUniversal = !heroKey;
    const color = isUniversal ? UNIVERSAL_SHARD_COLOR : (HERO_THEMES[heroKey!]?.color ?? '#a855f7');
    const avatar = heroKey ? HERO_IMAGES[heroKey]?.base : undefined;
    // 菱形外框（主题色）粗细
    const border = Math.max(1.5, size * 0.1);

    return (
        <span
            className={`relative inline-block shrink-0 ${className}`}
            style={{ width: size, height: size, background: color, clipPath: SHARD_DIAMOND }}
            title={title ?? (isUniversal ? '万能神格碎片（可替代任何天启者）' : '神格碎片')}
        >
            {/* 专属：头像（同款菱形裁切，内缩 border 留出主题色菱形外框） */}
            {avatar && (
                <img
                    src={avatar}
                    alt=""
                    draggable={false}
                    className="absolute"
                    style={{
                        inset: border,
                        width: size - border * 2,
                        height: size - border * 2,
                        objectFit: 'cover',
                        clipPath: SHARD_DIAMOND,
                    }}
                />
            )}
            {/* 万能：橘色实心 + 内圈亮边菱线，与"有头像的专属碎片"一眼区分 */}
            {isUniversal && (
                <span
                    className="absolute"
                    style={{
                        inset: Math.max(2, size * 0.22),
                        border: `${Math.max(1, size * 0.07)}px solid rgba(255,255,255,0.6)`,
                        clipPath: SHARD_DIAMOND,
                    }}
                />
            )}
        </span>
    );
};
