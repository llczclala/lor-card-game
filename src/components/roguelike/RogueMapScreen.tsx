// ==========================================
// 悖论迷宫 · 地图界面（核心枢纽）
// 可平移缩放的长幅画卷 + 圆形节点 + 顶部 HUD + 弹窗调度
// 性能：平移/缩放直接操作 ref + DOM transform（不走 React 高频重渲染）
// ==========================================
import React, { useRef, useCallback, useEffect, useState, useMemo } from 'react';
import { Heart, RefreshCw, RotateCcw, ArrowLeft } from 'lucide-react';
import {
    MAP_WIDTH, MAP_HEIGHT, generateMapLayout,
    type RogueNode, type RogueNodeType,
} from '../../data/roguelike/mapLayout';
import type { RoguelikeRunState } from '../../hooks/useRoguelikeRun';
import { MapNode, type MapNodeState } from './MapNode';
import { CroppedAvatar } from '../CroppedAvatar'; // [2026-08-10] 圆形头像读取 avatar 裁剪配置
import { CURRENCY_ICONS } from '../../data/imageData';
import { NodeEventModal } from './modals/NodeEventModal';
import { pickRandomEnhancements, type MazeEnhancement } from '../../data/roguelike/enhancements';
import { BattleRewardModal } from './modals/BattleRewardModal';
import { RunEndModal } from './modals/RunEndModal';
import { RogueDrawer } from './RogueDrawer'; // [2026-08-10] 头像抽屉：牌组/强化列表
import { NodePreviewPanel } from './NodePreviewPanel'; // [2026-08-11] 节点右键预览面板
import { ShopModal } from './modals/ShopModal'; // [2026-08-12 商店经济] 商店弹窗
import { generateShopStock, type ShopStock } from '../../data/roguelike/shop'; // [2026-08-12 商店经济]
import { TreasureModal } from './modals/TreasureModal'; // [2026-08-12 宝箱节点] 宝箱弹窗
import type { RandomTreasureResult } from '../../data/roguelike/treasure'; // [2026-08-12 宝箱节点]
import mapZero from '../../image/map/map_zero.png';

interface RewardData {
    gold: number;
    options: { cardKey: string; cardName: string; cardImage: string }[]; // [2026-08-15] 胜利奖励三选一候选卡
}

interface RogueMapScreenProps {
    run: RoguelikeRunState;
    reward: RewardData | null;
    onBack: () => void;
    onBattle: (nodeType: RogueNodeType, archetypeId?: string, nodeId?: string) => void; // [2026-08-10] 传预分配敌人流派 + 节点 id
    onMoveTo: (nodeId: string) => void; // [2026-08-04] 位置移动
    onRest: () => void;
    onEnhance: (key: string) => void; // [2026-08-05] 选择迷宫强化
    onRewardPick: (cardKey: string) => void; // [2026-08-15] 胜利奖励三选一：选定卡牌
    onRunEndConfirm: () => void;
    // [2026-08-12 商店经济]
    onBuyCard: (cardKey: string, equipId: string | undefined, price: number) => boolean;
    onBuyEnhancement: (enhancementId: string, price: number) => boolean;
    onBuyEquipment: (equipmentId: string, price: number) => boolean;
    onRemoveCard: (cardKey: string, price: number) => boolean;
    onShopRefresh: () => boolean;
    // [2026-08-12 宝箱节点]
    onTreasureGold: (amount: number) => void;
    onTreasureCard: (cardKey: string, equipId: string | undefined) => void;
    onTreasureEnhancement: (enhancementId: string) => void;
    onTreasureSacrifice: (enhancementId: string) => void;
    onTreasureRandom: (result: RandomTreasureResult) => void;
}

const MAX_ZOOM = 2.0;

export const RogueMapScreen: React.FC<RogueMapScreenProps> = ({
    run, reward,
    onBack, onBattle, onMoveTo, onRest, onEnhance, onRewardPick, onRunEndConfirm,
    onBuyCard, onBuyEnhancement, onBuyEquipment, onRemoveCard, onShopRefresh,
    onTreasureGold, onTreasureCard, onTreasureEnhancement, onTreasureSacrifice, onTreasureRandom,
}) => {
    const viewportRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLDivElement>(null);
    const panRef = useRef({ x: 0, y: 0 });
    const zoomRef = useRef(0.5);
    const dragRef = useRef({ startX: 0, startY: 0, panX: 0, panY: 0, active: false, moved: false });
    const suppressClickRef = useRef(false); // [2026-08-10] 拖拽松手后抑制误触 click

    // [2026-08-07 难度地图构造] 按本局难度生成地图布局（机密/绝密精英更多）
    const layout = useMemo(() => generateMapLayout(run.difficulty), [run.difficulty]);

    const [eventModal, setEventModal] = useState<Exclude<RogueNodeType, 'battle' | 'elite' | 'boss'> | null>(null);
    const [enhanceOptions, setEnhanceOptions] = useState<MazeEnhancement[]>([]); // [2026-08-05] 当前强化节点的可选强化
    const [drawerOpen, setDrawerOpen] = useState(false); // [2026-08-10] 头像抽屉开关（牌组/强化列表）
    const [previewNode, setPreviewNode] = useState<RogueNode | null>(null); // [2026-08-11] 当前右键预览的节点（null=关闭）
    const [shopOpen, setShopOpen] = useState(false); // [2026-08-12 商店经济] 商店弹窗开关
    const [shopStock, setShopStock] = useState<ShopStock | null>(null); // [2026-08-12 商店经济] 当前商店商品
    const [treasureOpen, setTreasureOpen] = useState(false); // [2026-08-12 宝箱节点] 宝箱弹窗开关
    const moveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null); // [2026-08-05] 移动后延迟呼出面板

    const applyTransform = useCallback(() => {
        const el = canvasRef.current;
        if (!el) return;
        const { x, y } = panRef.current;
        const s = zoomRef.current;
        el.style.transform = `translate(${x}px, ${y}px) scale(${s})`;
    }, []);

    // 无黑边平移钳制：地图必须完全覆盖视口，拖到边缘即停
    const clampPan = useCallback(() => {
        const viewport = viewportRef.current;
        if (!viewport) return;
        const vw = viewport.clientWidth;
        const vh = viewport.clientHeight;
        const s = zoomRef.current;
        // 缩放下限已保证地图两维 >= 视口，故平移钳制到 [vw-地图宽, 0] / [vh-地图高, 0]
        const minX = Math.min(0, vw - MAP_WIDTH * s);
        const minY = Math.min(0, vh - MAP_HEIGHT * s);
        panRef.current.x = Math.max(minX, Math.min(0, panRef.current.x));
        panRef.current.y = Math.max(minY, Math.min(0, panRef.current.y));
    }, []);

    // 初始视角：默认放大视口（无黑边下限 × 放大倍数），画面中心对准当前 Act 初始节点
    useEffect(() => {
        const viewport = viewportRef.current;
        if (!viewport) return;
        const vw = viewport.clientWidth;
        const vh = viewport.clientHeight;
        const fit = Math.min(vw / MAP_WIDTH, vh / MAP_HEIGHT);
        const minZoom = Math.max(vw / MAP_WIDTH, vh / MAP_HEIGHT); // 无黑边缩放下限：地图两维 >= 视口
        const initScale = Math.min(MAX_ZOOM, Math.max(minZoom, fit * 2.2)); // 默认放大：fit ×2.2，且不小于下限
        zoomRef.current = initScale;
        const act = layout.find(a => a.index === run.act) ?? layout[0];
        const startNode = act.nodes[0];
        panRef.current = {
            x: vw / 2 - startNode.x * zoomRef.current,
            y: vh / 2 - startNode.y * zoomRef.current,
        };
        clampPan();
        applyTransform();
    }, [applyTransform, clampPan, run.act, layout]);

    // 滚轮缩放（native listener + passive:false 保证 preventDefault 生效），以鼠标为中心
    useEffect(() => {
        const viewport = viewportRef.current;
        if (!viewport) return;
        const onWheel = (e: WheelEvent) => {
            e.preventDefault();
            const vw = viewport.clientWidth;   // 布局尺寸（ScaleWrapper 内部 1680×1050 空间）
            const vh = viewport.clientHeight;
            const rect = viewport.getBoundingClientRect();
            // 鼠标位置换算回布局坐标：显示坐标 ÷ 整体缩放比，与 pan/clampPan 同一坐标系
            const ratio = rect.width > 0 ? vw / rect.width : 1;
            const mx = (e.clientX - rect.left) * ratio;
            const my = (e.clientY - rect.top) * ratio;
            const oldScale = zoomRef.current;
            const factor = e.deltaY < 0 ? 1.15 : 0.85;
            const minZoom = Math.max(vw / MAP_WIDTH, vh / MAP_HEIGHT); // 无黑边下限，统一布局坐标
            const newScale = Math.max(minZoom, Math.min(MAX_ZOOM, oldScale * factor));
            if (newScale === oldScale) return;
            panRef.current.x = mx - (mx - panRef.current.x) * (newScale / oldScale);
            panRef.current.y = my - (my - panRef.current.y) * (newScale / oldScale);
            zoomRef.current = newScale;
            clampPan();
            applyTransform();
        };
        viewport.addEventListener('wheel', onWheel, { passive: false });
        return () => viewport.removeEventListener('wheel', onWheel);
    }, [applyTransform, clampPan]);

    // 拖拽平移（事件坐标统一换算回布局坐标，与 pan/clampPan 同一坐标系）
    const toLayoutPoint = (e: { clientX: number; clientY: number }) => {
        const viewport = viewportRef.current;
        if (!viewport) return { x: 0, y: 0 };
        const rect = viewport.getBoundingClientRect();
        const ratio = rect.width > 0 ? viewport.clientWidth / rect.width : 1;
        return {
            x: (e.clientX - rect.left) * ratio,
            y: (e.clientY - rect.top) * ratio,
        };
    };
    const onPointerDown = (e: React.PointerEvent) => {
        // [2026-08-11] 仅左键参与拖拽平移；右键保留给节点预览
        if (e.button !== 0) return;
        // [2026-08-10 修复] 根因：原先无条件 setPointerCapture，指针捕获会把节点 click 事件重定向到视口层，
        // 导致点击节点（移动不触发）。现在只记录起点，等确认是"拖拽"（位移超阈值）才捕获。
        const { x, y } = toLayoutPoint(e);
        dragRef.current = {
            startX: x, startY: y,
            panX: panRef.current.x, panY: panRef.current.y,
            active: true,
            moved: false,
        };
    };
    const onPointerMove = (e: React.PointerEvent) => {
        if (!dragRef.current.active) return;
        const { x, y } = toLayoutPoint(e);
        // 位移超过阈值才判定为拖拽：点击（无位移）不 capture、不动画布，click 事件能正常到达节点
        if (!dragRef.current.moved && Math.hypot(x - dragRef.current.startX, y - dragRef.current.startY) > 6) {
            dragRef.current.moved = true;
            e.currentTarget.setPointerCapture(e.pointerId);
        }
        if (!dragRef.current.moved) return;
        panRef.current.x = dragRef.current.panX + (x - dragRef.current.startX);
        panRef.current.y = dragRef.current.panY + (y - dragRef.current.startY);
        clampPan();
        applyTransform();
    };
    const onPointerEnd = () => {
        // 若本次是拖拽：抑制随后的 click（拖拽松手在节点上会触发 click，需忽略），短暂生效后自动恢复
        if (dragRef.current.active && dragRef.current.moved) {
            suppressClickRef.current = true;
            setTimeout(() => { suppressClickRef.current = false; }, 120);
        }
        dragRef.current.active = false;
    };

    const handleNodeClick = (node: RogueNode) => {
        // [2026-08-10 修复] 拖拽松手误触的 click：忽略，避免拖拽地图时误移动节点
        if (suppressClickRef.current) return;
        // [2026-08-11] 预览打开时左键点节点：只关预览，不移动不触发 500ms 自动互动（防隔层误触）
        if (previewNode) { setPreviewNode(null); return; }
        onMoveTo(node.id); // [2026-08-04] 点击节点即移动当前位置（头像移动过去、前节点停闪、后节点起闪）
        // [2026-08-05] 延迟 500ms 呼出面板：让移动过程先可见，再呼出对应节点面板
        if (moveTimerRef.current) clearTimeout(moveTimerRef.current);
        moveTimerRef.current = setTimeout(() => {
            if (node.type === 'battle' || node.type === 'elite' || node.type === 'boss') {
                onBattle(node.type, node.enemyArchetypeId, node.id); // [2026-08-10] 传预分配敌人 + 节点 id（胜利后标记击败）
            } else if (node.type === 'shop') {
                // [2026-08-12 商店经济] 商店节点 → 打开商店弹窗
                setShopStock(generateShopStock(run.rarityBonus));
                setShopOpen(true);
            } else if (node.type === 'treasure') {
                // [2026-08-12 宝箱节点] 宝箱节点 → 打开宝箱弹窗
                setTreasureOpen(true);
            } else {
                // [2026-08-05] 强化节点：随机生成 3 选 1 迷宫强化
                if (node.type === 'enhance') setEnhanceOptions(pickRandomEnhancements(3, run.difficulty, run.rarityBonus));
                setEventModal(node.type);
            }
        }, 500);
    };

    // [2026-08-11 节点预览] 右键节点：清掉移动定时器 + 打开/切换预览目标
    const handleNodeContextMenu = (node: RogueNode) => {
        if (moveTimerRef.current) clearTimeout(moveTimerRef.current);
        setPreviewNode(node);
    };

    // [2026-08-05] 卸载时清理延迟呼出定时器
    useEffect(() => () => { if (moveTimerRef.current) clearTimeout(moveTimerRef.current); }, []);

    // [完整三重迷宫] 渲染全部 Act 节点 + 白色虚线连线（基于节点 next 真实路径）
    const allNodes = layout.flatMap(act => act.nodes);
    const nodeById = new Map(allNodes.map(n => [n.id, n]));
    // [2026-08-10] 击败/错过集合（地图状态机：击败红叉 / 错过灰）
    const defeatedSet = new Set(run.defeated ?? []);
    const missedSet = new Set(run.missed ?? []);
    // [2026-08-11 节点预览] 节点状态机抽成辅助函数：地图渲染循环 + 预览面板复用，保证一致
    const getNodeState = (node: RogueNode): MapNodeState => {
        const isCurrent = node.id === run.currentNodeId;
        const inCurrentAct = layout.find(a => a.nodes.some(n => n.id === node.id))?.index === run.act;
        const currentNode = nodeById.get(run.currentNodeId ?? '');
        const isReachable = inCurrentAct && currentNode?.next.includes(node.id);
        if (isCurrent) return 'current';
        if (defeatedSet.has(node.id)) return 'done';
        if (isReachable) return 'available';
        if (missedSet.has(node.id)) return 'missed';
        return 'locked';
    };
    const lines: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];
    for (const node of allNodes) {
        for (const nextId of node.next) {
            const target = nodeById.get(nextId);
            if (target) lines.push({ x1: node.x, y1: node.y, x2: target.x, y2: target.y });
        }
    }
    return (
        <div className="relative w-full h-full overflow-hidden bg-black text-white font-sans select-none">
            {/* 视口 */}
            <div
                ref={viewportRef}
                className="absolute inset-0 overflow-hidden cursor-grab active:cursor-grabbing"
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerEnd}
                onPointerLeave={onPointerEnd}
                onPointerCancel={onPointerEnd}
                onContextMenu={(e) => {
                    // [2026-08-11 节点预览] 空白右键：抑制浏览器菜单 + 若预览开着则关闭（节点右键已被节点 stopPropagation 拦截，不会到这）
                    e.preventDefault();
                    if (previewNode) setPreviewNode(null);
                }}
            >
                {/* 画布（平移缩放层） */}
                <div
                    ref={canvasRef}
                    style={{ width: MAP_WIDTH, height: MAP_HEIGHT, transformOrigin: '0 0' }}
                    className="absolute left-0 top-0 will-change-transform"
                    onClick={(e) => {
                        // [2026-08-11 节点预览] 空白左键关闭（地图底图 img/svg 均 pointer-events-none，空白点击 target === canvasRef.current；拖拽松手不误关）
                        if (previewNode && !dragRef.current.moved && e.target === canvasRef.current) setPreviewNode(null);
                    }}
                >
                    <img
                        src={mapZero}
                        width={MAP_WIDTH}
                        height={MAP_HEIGHT}
                        className="w-full h-full object-cover select-none pointer-events-none"
                        draggable={false}
                        alt="悖论迷宫地图"
                    />
                    {/* 白色虚线连线层 */}
                    <svg
                        className="absolute inset-0 w-full h-full pointer-events-none"
                        width={MAP_WIDTH}
                        height={MAP_HEIGHT}
                    >
                        {lines.map((l, i) => (
                            <line
                                key={i}
                                x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2}
                                stroke="white"
                                strokeWidth="3"
                                strokeDasharray="10 8"
                                strokeOpacity="0.55"
                            />
                        ))}
                    </svg>
                    {/* 全部节点：当前 Act 可点击，其余 Act 锁定显示 */}
                    {allNodes.map(node => {
                        // [2026-08-11] 节点状态机统一走 getNodeState（current > done击败 > available > missed错过 > locked锁定）
                        const state = getNodeState(node);
                        return (
                            <MapNode
                                key={node.id}
                                type={node.type}
                                x={node.x}
                                y={node.y}
                                state={state}
                                heroCardKey={node.id === run.currentNodeId ? run.heroKey : undefined}
                                enemyKey={node.enemyKey} // [2026-08-10] 战斗节点预分配敌人头像
                                onActivate={() => handleNodeClick(node)}
                                onPreview={() => handleNodeContextMenu(node)} // [2026-08-11] 右键预览
                            />
                        );
                    })}
                </div>
            </div>

            {/* 左下角角色面板 */}
            <div className="absolute bottom-6 left-6 z-40 flex items-center gap-4 pointer-events-none">
                <div className="relative pointer-events-auto shrink-0">
                    <button
                        onClick={() => setDrawerOpen(true)}
                        title="查看牌组与迷宫强化"
                        className="w-16 h-16 rounded-full overflow-hidden border-2 border-white/70 ring-2 ring-purple-500/60 shadow-[0_0_24px_rgba(168,85,247,0.5)] shrink-0 cursor-pointer hover:scale-105 hover:ring-purple-400 transition-all"
                    >
                        <CroppedAvatar cardKey={run.heroKey} className="w-full h-full rounded-full" />
                    </button>
                    {/* [2026-08-10] information 提示徽标：头像右下角，提示可点击查看，点击同样打开抽屉 */}
                    <span
                        onClick={() => setDrawerOpen(true)}
                        title="查看牌组与迷宫强化"
                        className="absolute -bottom-1.5 -right-1.5 w-6 h-6 rounded-full bg-gray-600/95 border-2 border-white/80 flex items-center justify-center text-white italic font-black text-sm shadow-lg cursor-pointer hover:bg-gray-500 transition-colors select-none"
                    >
                        i
                    </span>
                </div>
                <div className="flex flex-col gap-1.5 bg-black/55 backdrop-blur-sm rounded-xl px-4 py-2.5 border border-white/10">
                    <div className="flex items-center gap-2">
                        <Heart size={16} className="text-red-400" />
                        <span className="font-black text-white text-sm">{run.hp}<span className="text-gray-400 font-bold">/{run.maxHp}</span></span>
                    </div>
                    <div className="flex items-center gap-2">
                        <img src={CURRENCY_ICONS.dataGold} className="w-4 h-4" alt="数据金" />
                        <span className="font-mono font-bold text-purple-200 text-sm">{run.gold}</span>
                    </div>
                    <div className="flex items-center gap-4">
                        <span className="flex items-center gap-1.5 text-sm font-bold text-white"><RefreshCw size={14} className="text-cyan-300" />{run.refreshCount}</span>
                        <span className="flex items-center gap-1.5 text-sm font-bold text-white"><RotateCcw size={14} className="text-green-300" />{run.reviveCount}</span>
                    </div>
                </div>
            </div>

            {/* 返回 */}
            <button
                onClick={onBack}
                className="absolute top-3 left-3 z-40 p-2 rounded-full bg-white/5 hover:bg-white/20 border border-white/10 hover:border-white/50 transition-all"
            >
                <ArrowLeft size={20} className="text-gray-300" />
            </button>

            {/* 节点事件弹窗 */}
            {eventModal && (
                <NodeEventModal
                    type={eventModal}
                    hp={run.hp}
                    maxHp={run.maxHp}
                    onRest={onRest}
                    onEnhance={onEnhance}
                    enhanceOptions={enhanceOptions}
                    onClose={() => setEventModal(null)}
                />
            )}

            {/* [2026-08-12 商店经济] 商店弹窗 */}
            {shopOpen && shopStock && (
                <ShopModal
                    run={run}
                    stock={shopStock}
                    onBuyCard={onBuyCard}
                    onBuyEnhancement={onBuyEnhancement}
                    onBuyEquipment={onBuyEquipment}
                    onRemoveCard={onRemoveCard}
                    onRefresh={onShopRefresh}
                    onClose={() => setShopOpen(false)}
                />
            )}

            {/* [2026-08-12 宝箱节点] 宝箱弹窗 */}
            {treasureOpen && (
                <TreasureModal
                    run={run}
                    onCollectGold={onTreasureGold}
                    onPickCard={onTreasureCard}
                    onPickEnhancement={onTreasureEnhancement}
                    onSacrificeForEpic={onTreasureSacrifice}
                    onCollectRandom={onTreasureRandom}
                    onClose={() => setTreasureOpen(false)}
                />
            )}

            {/* 战斗胜利奖励 */}
            {reward && (
                <BattleRewardModal
                    gold={reward.gold}
                    options={reward.options}
                    onPick={onRewardPick}
                />
            )}

            {/* 通关/死亡结算 */}
            {run.status !== 'active' && (
                <RunEndModal run={run} onConfirm={onRunEndConfirm} />
            )}

            {/* [2026-08-10] 头像抽屉：牌组 / 迷宫强化列表 */}
            <RogueDrawer
                open={drawerOpen}
                onClose={() => setDrawerOpen(false)}
                deck={run.deck}
                heroKey={run.heroKey} // [2026-08-15] 抽屉悬停检视英雄卡挂武装
                enhancements={run.enhancements}
            />

            {/* [2026-08-11] 节点右键预览面板：右侧滑出，点画面空白关闭 */}
            <NodePreviewPanel
                node={previewNode}
                run={run}
                state={previewNode ? getNodeState(previewNode) : 'locked'}
                onClose={() => setPreviewNode(null)}
                onMoveTo={(id) => { onMoveTo(id); setPreviewNode(null); }} // 前往：纯移动，不自动互动
                onBattle={(t, a, id) => { onBattle(t, a, id); setPreviewNode(null); }} // 挑战：当前未完成战斗
                onInteractCurrent={(n) => {
                    setPreviewNode(null);
                    // 当前非敌人节点互动：复用地图左键的互动路径（rest→休整弹窗 / enhance→生成3选1 / shop→商店弹窗 / event/treasure→占位弹窗）
                    if (n.type === 'enhance') setEnhanceOptions(pickRandomEnhancements(3, run.difficulty, run.rarityBonus));
                    if (n.type === 'shop') {
                        setShopStock(generateShopStock(run.rarityBonus));
                        setShopOpen(true);
                        return;
                    }
                    if (n.type === 'treasure') {
                        setTreasureOpen(true);
                        return;
                    }
                    // [安全窄化] NodePreviewPanel 保证此回调只在非战斗节点触发（battle/elite/boss 走 onBattle）
                    setEventModal(n.type as Exclude<RogueNodeType, 'battle' | 'elite' | 'boss'>);
                }}
            />
        </div>
    );
};
