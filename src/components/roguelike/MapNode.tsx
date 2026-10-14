// ==========================================
// 悖论迷宫 · 圆形地图节点
// 绝对定位在画布内（坐标基于地图原始尺寸），随画布 transform 统一缩放
// ==========================================
import React from 'react';
import { Sword, Skull, Crown, Flame, ShoppingBag, HelpCircle, Gem, Flag, Sparkles, X, Lock } from 'lucide-react'; // [2026-08-10] X：击败红叉；[2026-08-27] Lock：未抵达节点锁
import type { RogueNodeType } from '../../data/roguelike/mapLayout';
import { CroppedAvatar } from '../CroppedAvatar'; // [2026-08-10] 当前节点头像读取 avatar 裁剪配置
import { eventBus, GameEvents } from '../../utils/eventBus'; // [2026-10-14 莉莉子 🖱️] 节点点击音效

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
    // [2026-10-09 莉莉子 · 随机节点] 未揭示的"未知节点"：图标仍是问号，但配**石板灰**以区别于青色事件节点
    random: { icon: <HelpCircle size={18} />, color: 'bg-slate-600', label: '未知' },
};

export type MapNodeState = 'available' | 'current' | 'done' | 'locked' | 'missed'; // [2026-08-10] missed：错过（灰）

interface MapNodeProps {
    type: RogueNodeType;
    x: number;
    y: number;
    state: MapNodeState;
    onActivate: () => void;
    enemyKey?: string; // [2026-08-10] 战斗节点：预分配敌人头像（英雄卡 key）
    size?: number; // [2026-08-04] 自定义节点尺寸（px），供地图编辑器调节
    onPreview?: () => void; // [2026-08-11] 右键预览回调（任何状态可触发，不受 isClickable 限制）
    revealDelay?: number; // [2026-08-28 莉莉子] 推演开场：该节点从暗弹出的延迟秒数（不传则无动画，地图编辑器不受影响）
    /** [2026-10-08 莉莉子 · 瓦尔基里大赛] 该节点已登记「**待战**」⇒ 渲染成**战斗节点**（事件结算后它会变成战斗） */
    pendingBattle?: boolean;
    /**
     * [2026-10-09 莉莉子 · 随机节点] **未揭示**：该节点是"随机节点"且真身尚未对玩家公开（`node.wasRandom`）。
     * 为真时一律渲染成"未知"（图标/配色/不显示敌人头像）—— 否则玩家在地图上直接看出真身＝泄露。
     * 由 `RogueMapScreen` 传 `node.wasRandom`。
     */
    unrevealed?: boolean;
}

export const MapNode: React.FC<MapNodeProps> = ({ type, x, y, state, onActivate, enemyKey, size, onPreview, revealDelay, pendingBattle, unrevealed }) => {
    // [2026-10-08 莉莉子 · 瓦尔基里大赛] **待战节点用"精英战斗"的元信息渲染**（图标/配色/敌人头像位）
    //   —— 它原本是事件节点，事件结算 + 选择后"变成战斗节点"（程的设计）
    // [2026-10-09 莉莉子 · 随机节点] **未揭示 ⇒ 一律渲染成「未知」**（真身已在开局预掷进 `type`）
    const renderedType: RogueNodeType = unrevealed ? 'random' : (pendingBattle ? 'elite' : type);
    const meta = NODE_META[renderedType];
    const isClickable = state === 'available' || state === 'current';
    const isCurrent = state === 'current';
    const isDiamond = !unrevealed && type === 'enhance'; // [2026-08-04] 迷宫强化节点：菱形而非圆形
    const nodeSize = size ?? (isCurrent ? 64 : 44);
    // [2026-08-10] 战斗节点（战斗/精英/Boss）优先显示预分配敌人头像，替代通用图标
    //   ⚠️ [2026-10-09] 未揭示节点**即使真身是战斗也不显示敌人头像**（否则等于公开真身）
    const isCombatNode = !unrevealed && (renderedType === 'battle' || renderedType === 'elite' || renderedType === 'boss');
    const showEnemyAvatar = isCombatNode && !!enemyKey; // [2026-08-04] 编辑器可自定义尺寸
    // [2026-08-26 莉莉子] 当前节点：蓝色高光包裹白色核心——白色描边 + 外层蓝色光晕（霓虹管效果）
    const nodeStyle = isCurrent ? { boxShadow: '0 0 22px rgba(59,130,246,0.85)' } : undefined;

    return (
        <button
            onClick={() => { if (isClickable) { eventBus.emit(GameEvents.UI_CLICK); onActivate(); } }}
            onContextMenu={(e) => {
                // [2026-08-11 节点预览] 右键任意状态节点 → 弹预览；抑制浏览器菜单 + 阻止冒泡到视口（视口据此区分节点/空白右键）
                e.preventDefault();
                e.stopPropagation();
                onPreview?.();
            }}
            style={{
                left: x, top: y, width: nodeSize, height: nodeSize, ...nodeStyle,
                // [2026-08-28 莉莉子] 推演开场：节点从暗弹出（backwards → delay 期间隐藏、结束后恢复自身样式）
                ...(revealDelay !== undefined
                    ? { animation: `rogue-map-node-in 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) ${revealDelay}s backwards` }
                    : {}),
            }}
            className={`absolute -translate-x-1/2 -translate-y-1/2 z-10 flex items-center justify-center border-2 text-white shadow-[0_4px_12px_rgba(0,0,0,0.5)] transition-all
                ${meta.color}
                ${isCurrent ? 'border-white z-30' : 'border-white/70'}
                ${isDiamond ? 'rounded-sm rotate-45' : 'rounded-full'}
                ${state === 'available'
                    ? isDiamond
                        ? 'cursor-pointer hover:brightness-125 shadow-[0_0_16px_rgba(255,255,255,0.5)]' // [2026-08-25] 相邻节点静态亮起
                        : 'cursor-pointer hover:scale-125 shadow-[0_0_16px_rgba(255,255,255,0.5)]' // [2026-08-25] 相邻节点静态亮起
                    : state === 'current'
                        ? 'cursor-pointer'
                        : state === 'missed'
                            ? 'cursor-default grayscale brightness-[0.55]' // 错过：灰色实心
                            : state === 'done'
                                ? 'cursor-default brightness-[0.7]' // [2026-08-25] 已击败：适度暗（红叉保留）
                                : 'cursor-default grayscale brightness-[0.5]'}`} // [2026-08-27] locked：完全灰色（未抵达）
        >
            {/* [当前节点] 蓝色脉冲；节点本体保留类型图标，天启者头像圆悬于节点上方 */}
            {isCurrent && (
                <>
                    <span className="absolute inset-0 rounded-full border-2 border-blue-400 animate-ping" />
                    <span className="absolute -inset-2 rounded-full border border-blue-300/60 animate-ping" style={{ animationDelay: '0.4s' }} />
                    <span className="absolute -inset-4 rounded-full border border-blue-200/40 animate-ping" style={{ animationDelay: '0.8s' }} />
                </>
            )}
            {/* 节点本体：[2026-08-27] 未抵达=整个节点被灰色锁替代；战斗节点显示敌人头像，其余显示类型图标（菱形节点反旋转保持正立） */}
            {state === 'locked' ? (
                <Lock size={nodeSize * 0.42} className="text-gray-400" strokeWidth={2.5} />
            ) : showEnemyAvatar ? (
                <CroppedAvatar cardKey={enemyKey!} className="w-full h-full rounded-full" />
            ) : (
                <span className={isDiamond ? '-rotate-45' : ''}>{meta.icon}</span>
            )}
            {state === 'done' && (
                // [2026-08-10] 击败红叉：保留敌人头像（彩色）+ 红色叉叉标记
                <span className={`absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-600 border-2 border-white flex items-center justify-center z-30 shadow-[0_0_10px_rgba(239,68,68,0.9)] ${isDiamond ? '-rotate-45' : ''}`}>
                    <X size={12} className="text-white" strokeWidth={4} />
                </span>
            )}
        </button>
    );
};
