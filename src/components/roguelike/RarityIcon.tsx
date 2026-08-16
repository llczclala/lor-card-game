// ==========================================
// 悖论迷宫 · 稀有度图标
// [2026-08-10 莉莉子] 四档稀有度 → 形状 + 颜色：
//   common 绿·圆形 / rare 蓝·三角形 / epic 紫·菱形 / legendary 金·星型
// 用于强化选择界面的卡牌右上角（替代法术速度位）
// ==========================================
import React from 'react';
import { Circle, Triangle, Diamond, Star, type LucideIcon } from 'lucide-react';
import type { EnhancementRarity } from '../../data/roguelike/enhancements';

export const RARITY_META: Record<EnhancementRarity, {
    label: string;
    color: string;        // 主题色 hex（边框/发光共用）
    iconClass: string;    // 图标填充色（tailwind）
    bgClass: string;      // 图标圆底背景
    glowClass: string;    // 选中/卡牌发光阴影
    cardBg: string;       // 卡面不透明渐变（深色 + 稀有度色调，避免透明露底）
    Icon: LucideIcon;
}> = {
    common:    { label: '普通', color: '#22c55e', iconClass: 'text-green-400',  bgClass: 'bg-green-500/20 border-green-500/60',   glowClass: 'shadow-[0_0_24px_rgba(34,197,94,0.55)]',   cardBg: 'linear-gradient(165deg, #13161c 0%, #0e2517 48%, #13161c 100%)',   Icon: Circle },
    rare:      { label: '稀有', color: '#3b82f6', iconClass: 'text-blue-400',   bgClass: 'bg-blue-500/20 border-blue-500/60',    glowClass: 'shadow-[0_0_24px_rgba(59,130,246,0.55)]',  cardBg: 'linear-gradient(165deg, #13161c 0%, #0d1d30 48%, #13161c 100%)',  Icon: Triangle },
    epic:      { label: '史诗', color: '#a855f7', iconClass: 'text-purple-400', bgClass: 'bg-purple-500/20 border-purple-500/60', glowClass: 'shadow-[0_0_24px_rgba(168,85,247,0.55)]', cardBg: 'linear-gradient(165deg, #13161c 0%, #1e1234 48%, #13161c 100%)', Icon: Diamond },
    legendary: { label: '传说', color: '#facc15', iconClass: 'text-yellow-400', bgClass: 'bg-yellow-500/20 border-yellow-500/60', glowClass: 'shadow-[0_0_24px_rgba(250,204,21,0.65)]', cardBg: 'linear-gradient(165deg, #13161c 0%, #2d2207 48%, #13161c 100%)', Icon: Star },
};

interface RarityIconProps {
    rarity: EnhancementRarity;
    size?: number;
}

export const RarityIcon: React.FC<RarityIconProps> = ({ rarity, size = 24 }) => {
    const meta = RARITY_META[rarity];
    const Icon = meta.Icon;
    return (
        <span
            className={`flex items-center justify-center rounded-full border ${meta.bgClass} ${meta.iconClass}`}
            style={{ width: size + 12, height: size + 12 }}
            title={meta.label}
        >
            <Icon size={size} fill="currentColor" strokeWidth={1.5} />
        </span>
    );
};
