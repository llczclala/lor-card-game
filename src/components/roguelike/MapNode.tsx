// ==========================================
// 悖论迷宫 · 圆形地图节点
// 绝对定位在画布内（坐标基于地图原始尺寸），随画布 transform 统一缩放
// ==========================================
import React from 'react';
import { Sword, Skull, Crown, Flame, ShoppingBag, HelpCircle, Gem, Flag, Sparkles, X } from 'lucide-react'; // [2026-08-10] X：击败红叉
import type { RogueNodeType } from '../../data/roguelike/mapLayout';
import { CroppedAvatar } from '../CroppedAvatar'; // [2026-08-10] 当前节点头像读取 avatar 裁剪配置

export const NODE_META: Record<RogueNodeType, { icon: React.ReactNode; color: string; label: string }> = { // [2026-08-11] 导出供 NodePreviewPanel 占位卡面复用
    start: { icon: <Flag size={18} />, color: 'bg-green-600', label: '起点' },
    enhance: { icon: <Sparkles size={18} />, color: 'bg-violet-600', label: '强化' },
    battle: { icon: <Sword size={18} />, color: 'bg-blue-600', label: '战斗' },
    elite: { icon: <Skull size={18} />, color: 'bg-red-600', label: '精英' },
    boss: { icon: <Crown size={20} />, color: 'bg-purple-700', label: 'Boss' },
    rest: { icon: <Flame size={18} />, color: 'bg-amber-600', label: '休息' },
    shop: { icon: <ShoppingBag size={18} />, color: 'bg-emerald-600', label: '商店' },
    event: { icon: <HelpCircle size={18} />, color: 'bg-cyan-600', label: '事件' },
    treasure: { icon: <Gem size={18} />, color: 'bg-yellow-500', label: '宝箱' },
};

export type MapNodeState = 'available' | 'current' | 'done' | 'locked' | 'missed'; // [2026-08-10] missed：错过（灰）

interface MapNodeProps {
    type: RogueNodeType;
    x: number;
    y: number;
    state: MapNodeState;
    onActivate: () => void;
    heroCardKey?: string; // [2026-08-10] 当前节点：显示天启者头像（读取 avatar 裁剪配置）
    enemyKey?: string; // [2026-08-10] 战斗节点：预分配敌人头像（英雄卡 key）
    size?: number; // [2026-08-04] 自定义节点尺寸（px），供地图编辑器调节
    onPreview?: () => void; // [2026-08-11] 右键预览回调（任何状态可触发，不受 isClickable 限制）
}

export const MapNode: React.FC<MapNodeProps> = ({ type, x, y, state, onActivate, heroCardKey, enemyKey, size, onPreview }) => {
    const meta = NODE_META[type];
    const isClickable = state === 'available' || state === 'current';
    const isCurrent = state === 'current';
    const isDiamond = type === 'enhance'; // [2026-08-04] 迷宫强化节点：菱形而非圆形
    const nodeSize = size ?? (isCurrent ? 64 : 44);
    // [2026-08-10] 战斗节点（战斗/精英/Boss）优先显示预分配敌人头像，替代通用图标
    const isCombatNode = type === 'battle' || type === 'elite' || type === 'boss';
    const showEnemyAvatar = isCombatNode && !!enemyKey; // [2026-08-04] 编辑器可自定义尺寸

    return (
        <button
            onClick={() => { if (isClickable) onActivate(); }}
            onContextMenu={(e) => {
                // [2026-08-11 节点预览] 右键任意状态节点 → 弹预览；抑制浏览器菜单 + 阻止冒泡到视口（视口据此区分节点/空白右键）
                e.preventDefault();
                e.stopPropagation();
                onPreview?.();
            }}
            style={{ left: x, top: y, width: nodeSize, height: nodeSize }}
            className={`absolute -translate-x-1/2 -translate-y-1/2 z-10 flex items-center justify-center border-2 text-white shadow-[0_4px_12px_rgba(0,0,0,0.5)] transition-all
                ${meta.color}
                ${isCurrent ? 'border-white z-30' : 'border-white/70'}
                ${isDiamond ? 'rounded-sm rotate-45' : 'rounded-full'}
                ${isClickable
                    ? isDiamond
                        ? 'cursor-pointer hover:brightness-125 hover:shadow-[0_0_24px_rgba(255,255,255,0.7)]'
                        : 'cursor-pointer hover:scale-125 hover:shadow-[0_0_24px_rgba(255,255,255,0.7)]'
                    : state === 'missed'
                        ? 'cursor-default grayscale brightness-[0.55]' // 错过：灰色实心
                        : 'cursor-default'}`} // locked/done：彩色锁定态
        >
            {/* [当前节点] 白色脉冲；节点本体保留类型图标，天启者头像圆悬于节点上方 */}
            {isCurrent && (
                <>
                    <span className="absolute inset-0 rounded-full border-2 border-white animate-ping" />
                    <span className="absolute -inset-2 rounded-full border border-white/60 animate-ping" style={{ animationDelay: '0.4s' }} />
                    <span className="absolute -inset-4 rounded-full border border-white/40 animate-ping" style={{ animationDelay: '0.8s' }} />
                    {/* 天启者头像圆：位于节点上方 */}
                    {heroCardKey && (
                        <span className="absolute left-1/2 -top-14 -translate-x-1/2 w-12 h-12 rounded-full border-2 border-white/90 overflow-hidden shadow-[0_0_18px_rgba(255,255,255,0.55),0_4px_12px_rgba(0,0,0,0.5)] z-20">
                            <CroppedAvatar cardKey={heroCardKey} className="w-full h-full rounded-full" />
                        </span>
                    )}
                </>
            )}
            {/* 节点本体：战斗节点显示预分配敌人头像，其余显示类型图标（菱形节点反旋转保持正立） */}
            {showEnemyAvatar ? (
                <CroppedAvatar cardKey={enemyKey!} className="w-full h-full rounded-full" />
            ) : (
                <span className={isDiamond ? '-rotate-45' : ''}>{meta.icon}</span>
            )}
            {state === 'done' && (
                // [2026-08-10] 击败红叉：保留敌人头像（彩色）+ 红色叉叉标记
                <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-600 border-2 border-white flex items-center justify-center z-30 shadow-[0_0_10px_rgba(239,68,68,0.9)]">
                    <X size={12} className="text-white" strokeWidth={4} />
                </span>
            )}
        </button>
    );
};
