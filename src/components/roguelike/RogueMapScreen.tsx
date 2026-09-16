// ==========================================
// 悖论迷宫 · 地图界面（核心枢纽）
// 可平移缩放的长幅画卷 + 圆形节点 + 顶部 HUD + 弹窗调度
// 性能：平移/缩放直接操作 ref + DOM transform（不走 React 高频重渲染）
// ==========================================
import React, { useRef, useCallback, useEffect, useState, useMemo } from 'react';
import { Heart, RefreshCw, RotateCcw, ArrowLeft, Plus, Minus, Send } from 'lucide-react'; // [2026-08-26] Plus/Minus 缩放按钮、Send 纸飞机定位
import {
    MAP_WIDTH, MAP_HEIGHT, generateMapLayout, nodeColumnIndex,
    type RogueNode, type RogueNodeType,
} from '../../data/roguelike/mapLayout';
import type { RoguelikeRunState } from '../../hooks/useRoguelikeRun';
import { MapNode, type MapNodeState } from './MapNode';
import { CroppedAvatar } from '../CroppedAvatar'; // [2026-08-10] 圆形头像读取 avatar 裁剪配置
import { CURRENCY_ICONS } from '../../data/imageData';
import { NodeEventModal } from './modals/NodeEventModal';
import { pickRandomEnhancements, type MazeEnhancement } from '../../data/roguelike/enhancements';
import { PLAYER_ENHANCEMENTS, ENEMY_ELIGIBLE_BUFFS } from '../../data/roguelike/buffs'; // [2026-08-31 莉莉子 开发者] 全量强化池
import { BattleRewardModal } from './modals/BattleRewardModal';
import { HeroRecruitModal } from './modals/HeroRecruitModal'; // [2026-09-04] 首战天启者招募三选一
import { RunEndModal, type RunEndInfo } from './modals/RunEndModal'; // [2026-08-29] 通关/败亡结算（经验动画）
import { RogueDrawer } from './RogueDrawer'; // [2026-08-10] 头像抽屉：牌组/强化列表
import { NodePreviewPanel } from './NodePreviewPanel'; // [2026-08-11] 节点右键预览面板
import { NodeEntryModal } from './NodeEntryModal'; // [2026-08-27] 节点进入方形面板（点击节点在正上方弹出）
import { getDialogueBg } from '../../data/roguelike/dialogueBg'; // [2026-08-27] 进入面板背景图（指定 or 随机）
import { ENEMY_ARCHETYPES } from '../../data/enemies/archetypes'; // [2026-08-27] 战斗节点流派名/简介
import { ShopModal, type ShopTab } from './modals/ShopModal'; // [2026-08-12 商店经济] 商店弹窗 [2026-08-28] 页签类型
import { generateShopStock, type ShopStock } from '../../data/roguelike/shop'; // [2026-08-12 商店经济]
import { TreasureModal } from './modals/TreasureModal'; // [2026-08-12 宝箱节点] 宝箱弹窗
import type { RewardCardOption, HeroRecruitOption } from '../../data/roguelike/rewards'; // [2026-08-25] 胜利奖励候选卡；[2026-09-04] 首战天启者招募
import type { RandomTreasureResult } from '../../data/roguelike/treasure'; // [2026-08-12 宝箱节点]
import { getHeroLevelBonus } from '../../data/roguelike/heroProgression'; // [2026-08-28] 商店页签位（等级奖励）
import { rollRogueEvent, type RogueEvent } from '../../data/roguelike/events'; // [2026-08-28 事件]
import type { EnhancementRarity } from '../../data/roguelike/buffs'; // [2026-08-28 事件] 强化品质提升
import { motion } from 'framer-motion'; // [2026-08-25] 头像平滑移动动画层
import mapZero from '../../image/map/map_zero.webp';

// [2026-08-28 莉莉子] 老电视雪花噪点（SVG feTurbulence 生成，复用关卡选择界面的开场语言）
const STATIC_NOISE = `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/><feColorMatrix type='matrix' values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.7 0'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>")`;

// [2026-08-27 莉莉子] 地图按钮尺寸微调参数（统一放大，程直接改这里微调）
const MAP_BTN = {
    avatarSize: 120,   // 左下角英雄头像（打开抽屉）直径 px（原 64）
    badgeSize: 40,    // 头像右下角 "i" 徽标直径 px（原 24）
    btnPadding: 24,   // 图标按钮内边距 px（原 返回 8 / 缩放·定位 10）
    btnIcon: 36,      // 图标按钮图标尺寸 px（原 返回 20 / 缩放·定位 18）
};

// [2026-08-27 莉莉子] 节点类型 → 名称 + 简介（进入方形面板用；战斗节点用敌人流派名/简介覆盖）
const NODE_INFO: Record<RogueNodeType, { title: string; desc: string }> = {
    start: { title: '起点', desc: '从这里开始你的悖论迷宫之旅。' },
    enhance: { title: '迷宫强化', desc: '三选一获取一个迷宫强化，力量随冒险成长。' },
    battle: { title: '战斗', desc: '遭遇敌方流派，胜利可获得金币与卡牌奖励。' },
    elite: { title: '精英', desc: '强敌挡路，胜利的回报也更丰厚。' },
    boss: { title: 'Boss', desc: '迷宫的守卫者，击败它才能继续前行。' },
    rest: { title: '篝火·休整', desc: '短暂休息，回复 30% 生命。' },
    shop: { title: '商店', desc: '用数据金购买卡牌、强化与装备。' },
    event: { title: '未知事件', desc: '前方迷雾重重，选择会带来不同的结果。' },
    treasure: { title: '宝箱', desc: '打开宝箱，随机获得一份奖励。' },
};

interface RewardData {
    gold: number;
    options: RewardCardOption[]; // [2026-08-15] 胜利奖励三选一候选卡；[2026-08-25] 候选卡带 equipId
    pendingPacks?: number; // [2026-08-29] 胜利附带待打开卡包
}

interface RogueMapScreenProps {
    run: RoguelikeRunState;
    reward: RewardData | null;
    onBackRequest: () => void; // [2026-08-28 莉莉子] 返回请求：由 App 弹「结算对局 / 暂离对局」二次确认（不再直接切大厅丢局）
    onBattle: (nodeType: RogueNodeType, archetypeId?: string, nodeId?: string, enemyBuffs?: string[]) => void; // [2026-08-10] 传预分配敌人流派 + 节点 id；[2026-08-27 莉莉子] + 节点预分配迷宫强化
    onMoveTo: (nodeId: string) => void; // [2026-08-04] 位置移动
    onRest: () => void;
    onRestRemove?: (cardKey: string) => void; // [2026-08-29] 休整·净化删卡
    onRestCopy?: (cardKey: string) => void;   // [2026-08-29] 休整·复制卡
    onRestScout?: (cardKey: string) => void;  // [2026-08-29] 休整·探路
    onEnhance: (key: string) => void; // [2026-08-05] 选择迷宫强化
    onRewardPick: (cardKey: string, equipId?: string) => void; // [2026-08-15] 胜利奖励三选一：选定卡牌；[2026-08-25] 带 equipId
    onRewardSkip: () => void; // [2026-08-29] 跳过卡牌奖励（只拿金币）
    onRewardRefresh: () => void; // [2026-08-29] 刷新战斗奖励三选一
    onRefreshEnhance: () => boolean; // [2026-08-29] 刷新迷宫强化三选一（返回是否成功）
    // [2026-09-04 首战招募]
    heroRecruit?: { options: HeroRecruitOption[]; subNote?: string } | null;
    onHeroRecruitPick?: (heroKey: string) => void;
    onHeroRecruitSkip?: () => void;
    onOpenPack: () => string | null; // [2026-08-29] 三选一打开卡包（随机武装）
    onDevWin?: (nodeType: RogueNodeType, nodeId: string) => void; // [2026-08-29] 开发者一键胜利
    pendingPacks?: number; // [2026-08-29] 通关结算待打开卡包
    onRunEndConfirm: () => void;
    // [2026-08-12 商店经济]
    onBuyCard: (cardKey: string, equipId: string | undefined, price: number) => boolean;
    onBuyEnhancement: (enhancementId: string, price: number) => boolean;
    onBuyEquipment: (heroKey: string, equipmentIds: string[], totalPrice: number) => boolean; // [2026-09-10] 装备页签改批量：英雄 + 多件装备一次结算
    onRemoveCard: (cardKey: string, price: number) => boolean;
    onShopRefresh: () => boolean;
    // [2026-08-12 宝箱节点]
    onTreasureGold: (amount: number) => void;
    onTreasureCard: (cardKey: string, equipId: string | undefined) => void;
    onTreasureEnhancement: (enhancementId: string) => void;
    onTreasureSacrifice: (enhancementId: string) => void;
    onTreasureRandom: (result: RandomTreasureResult) => void;
    // [2026-08-28 事件]
    onEvent?: (eventId: string, choiceIndex: number, removePicks?: string[]) => void;
    onConsumeEnhancementRank?: () => void; // 托付遗物：强化品质+1 投资消费
    // [2026-08-29 经验重构] 进入非战斗节点时回调（App 层发节点经验，按节点去重）
    onEnterNode?: (node: RogueNode) => void;
    // [2026-08-28 莉莉子 推演开场]
    reveal?: boolean; // 本局首进地图：播推演开场动画（战斗返回不播）
    onRevealEnd?: () => void; // 开场动画播完回调（App 层复位 reveal，防止后续挂载重播）
    runEnd?: RunEndInfo; // [2026-08-29] 通关/败亡结算信息（天启者经验动画）
    // [2026-08-31 莉莉子 开发者] 任意选强化（开发者账号走全量选择器）
    isDev?: boolean;
    onDevPick?: (playerIds: string[], enemyIds: string[]) => void; // 多选确认：玩家强化叠加 + 敌方强化注入下一场战斗
}

const MAX_ZOOM = 2.0;

export const RogueMapScreen: React.FC<RogueMapScreenProps> = ({
    run, reward,
    onBackRequest, onBattle, onMoveTo, onRest, onRestRemove, onRestCopy, onRestScout, onEnhance, onRewardPick, onRewardSkip, onRewardRefresh, onRefreshEnhance, onOpenPack, onDevWin, pendingPacks, onRunEndConfirm,
    heroRecruit, onHeroRecruitPick, onHeroRecruitSkip, // [2026-09-04 首战招募]
    onBuyCard, onBuyEnhancement, onBuyEquipment, onRemoveCard, onShopRefresh,
    onTreasureGold, onTreasureCard, onTreasureEnhancement, onTreasureSacrifice, onTreasureRandom,
    onEvent, onConsumeEnhancementRank, // [2026-08-28 事件]
    onEnterNode, // [2026-08-29 经验重构]
    reveal, onRevealEnd, // [2026-08-28 莉莉子 推演开场]
    runEnd, // [2026-08-29] 通关/败亡结算
    isDev, onDevPick, // [2026-08-31 莉莉子 开发者] 任意选强化
}) => {
    const viewportRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLDivElement>(null);
    const panRef = useRef({ x: 0, y: 0 });
    const zoomRef = useRef(0.5);
    const dragRef = useRef({ startX: 0, startY: 0, panX: 0, panY: 0, active: false, moved: false });
    const suppressClickRef = useRef(false); // [2026-08-10] 拖拽松手后抑制误触 click

    // [2026-08-07 难度地图构造] 按本局难度生成地图布局（机密/绝密精英更多）
    // [2026-09-01 莉莉子 修复] 敌人预分配存 run（startRun 生成一次）：放弃本场战斗返回地图不再重新随机敌人
    // （此前 useMemo(generateMapLayout) 依赖组件挂载，进出战斗重挂载后缓存失效 → 敌人刷新）
    const layout = run.layout ?? useMemo(() => generateMapLayout(run.difficulty), [run.difficulty]);

    const [eventModal, setEventModal] = useState<Exclude<RogueNodeType, 'battle' | 'elite' | 'boss'> | null>(null);
    const [enhanceOptions, setEnhanceOptions] = useState<MazeEnhancement[]>([]); // [2026-08-05] 当前强化节点的可选强化
    const [drawerOpen, setDrawerOpen] = useState(false); // [2026-08-10] 头像抽屉开关（牌组/强化列表）
    const [previewNode, setPreviewNode] = useState<RogueNode | null>(null); // [2026-08-11] 当前右键预览的节点（null=关闭）
    const [shopOpen, setShopOpen] = useState(false); // [2026-08-12 商店经济] 商店弹窗开关
    const [shopStock, setShopStock] = useState<ShopStock | null>(null); // [2026-08-12 商店经济] 当前商店商品
    const [treasureOpen, setTreasureOpen] = useState(false); // [2026-08-12 宝箱节点] 宝箱弹窗开关
    const shopTabsRef = useRef<Record<string, ShopTab[]>>({}); // [2026-08-28] 商店节点 → 开启页签（进节点随机确定，重复开窗不重随）
    const [currentEvent, setCurrentEvent] = useState<RogueEvent | null>(null); // [2026-08-28 事件] 当前事件
    const seenEventsRef = useRef<string[]>([]); // [2026-08-28 事件] 一局内已出现事件（最近 8 个去重）
    const [entryNode, setEntryNode] = useState<RogueNode | null>(null); // [2026-08-27] 节点进入面板当前节点
    const [entryPos, setEntryPos] = useState({ x: 0, y: 0 }); // [2026-08-27] 面板锚点（节点屏幕坐标）
    const entryNodeRef = useRef<RogueNode | null>(null); // [2026-08-27] applyTransform 同步锚点用（避开陈旧闭包）
    const [entryBg, setEntryBg] = useState(''); // [2026-08-27] 当前进入面板背景图（打开时确定）
    const entryBgCacheRef = useRef<Map<string, string>>(new Map()); // [2026-08-27] 一局内 nodeId→随机背景（未指定时固定，拖动/重开不变）
    const entrySizeRef = useRef(44); // [2026-08-27] 当前节点渲染尺寸（打开时算好，applyTransform 顶角定位用）
    const pendingEnterRef = useRef<RogueNode | null>(null); // [2026-08-27] 「前往」后待进入节点（等头像移动完成 onAnimationComplete 再进入）

    const applyTransform = useCallback(() => {
        const el = canvasRef.current;
        if (!el) return;
        const { x, y } = panRef.current;
        const s = zoomRef.current;
        el.style.transform = `translate(${x}px, ${y}px) scale(${s})`;
        // [2026-08-27] 节点进入面板跟随：画布平移/缩放时同步锚点（节点顶角上方屏幕坐标）
        const cur = entryNodeRef.current;
        if (cur) {
            const s = entrySizeRef.current;
            setEntryPos({
                x: panRef.current.x + cur.x * zoomRef.current,
                y: panRef.current.y + cur.y * zoomRef.current - (cur.type === 'enhance' ? s * Math.SQRT2 / 2 : s / 2) - 8,
            });
        }
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

    // 初始视角：默认放大视口（无黑边下限 × 放大倍数），画面中心对准当前所处节点（战斗返回地图不再回默认位置）
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
        // [2026-08-29 修复] 定位到当前所处节点（run.currentNodeId），无则回退 Act 起点
        const curNode = run.currentNodeId ? layout.flatMap(a => a.nodes).find(n => n.id === run.currentNodeId) : undefined;
        const startNode = curNode ?? act.nodes[0];
        panRef.current = {
            x: vw / 2 - startNode.x * zoomRef.current,
            y: vh / 2 - startNode.y * zoomRef.current,
        };
        clampPan();
        applyTransform();
    }, [applyTransform, clampPan, run.act, layout]);

    // [2026-08-28 莉莉子 推演开场] 动画总时长结束后复位 reveal（App 收到后，本局后续挂载不重播）
    const onRevealEndRef = useRef(onRevealEnd);
    onRevealEndRef.current = onRevealEnd;
    useEffect(() => {
        if (!reveal) return;
        const t = setTimeout(() => onRevealEndRef.current?.(), 2450);
        return () => clearTimeout(t);
    }, [reveal]);

    // [2026-08-26 莉莉子] 以某点为中心缩放（滚轮 + 右侧加减号按钮共用）：mx/my 为布局坐标
    const zoomAround = useCallback((mx: number, my: number, factor: number) => {
        const viewport = viewportRef.current;
        if (!viewport) return;
        const vw = viewport.clientWidth;
        const vh = viewport.clientHeight;
        const oldScale = zoomRef.current;
        const minZoom = Math.max(vw / MAP_WIDTH, vh / MAP_HEIGHT); // 无黑边下限，统一布局坐标
        const newScale = Math.max(minZoom, Math.min(MAX_ZOOM, oldScale * factor));
        if (newScale === oldScale) return;
        panRef.current.x = mx - (mx - panRef.current.x) * (newScale / oldScale);
        panRef.current.y = my - (my - panRef.current.y) * (newScale / oldScale);
        zoomRef.current = newScale;
        clampPan();
        applyTransform();
    }, [clampPan, applyTransform]);

    // 滚轮缩放（native listener + passive:false 保证 preventDefault 生效），以鼠标为中心
    useEffect(() => {
        const viewport = viewportRef.current;
        if (!viewport) return;
        const onWheel = (e: WheelEvent) => {
            e.preventDefault();
            const vw = viewport.clientWidth;   // 布局尺寸（ScaleWrapper 内部 1680×1050 空间）
            const rect = viewport.getBoundingClientRect();
            // 鼠标位置换算回布局坐标：显示坐标 ÷ 整体缩放比，与 pan/clampPan 同一坐标系
            const ratio = rect.width > 0 ? vw / rect.width : 1;
            const mx = (e.clientX - rect.left) * ratio;
            const my = (e.clientY - rect.top) * ratio;
            zoomAround(mx, my, e.deltaY < 0 ? 1.15 : 0.85);
        };
        viewport.addEventListener('wheel', onWheel, { passive: false });
        return () => viewport.removeEventListener('wheel', onWheel);
    }, [zoomAround]);

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
        // [2026-08-27] 当前所处节点：点击不弹「进入」面板（已在节点内，无需移动）；若面板开着则关闭
        if (node.id === run.currentNodeId) {
            if (entryNode) { setEntryNode(null); entryNodeRef.current = null; }
            // [2026-08-27] 当前战斗节点未击败 → 弹右侧详情提供「战斗」入口（必须打败才解锁后续）
            if ((node.type === 'battle' || node.type === 'elite' || node.type === 'boss') && !defeatedSet.has(node.id)) {
                setPreviewNode(node);
            }
            return;
        }
        // [2026-08-27] 预览打开时点节点：先关预览，仍继续打开进入面板
        if (previewNode) setPreviewNode(null);
        // [2026-08-27] 点击节点：打开/切换该节点进入面板（点「前往」才移动+进入）；
        // 已打开时点其他节点 → 切换窗口；拖拽地图窗口跟随不消失
        setEntryNode(node);
        entryNodeRef.current = node;
        // [2026-08-27] 顶角定位：菱形(强化)顶角=nodeSize*√2/2，圆形=nodeSize/2（对齐 MapNode 渲染与昨天头像修复），面板底边对齐顶角上方
        const isCur = node.id === run.currentNodeId;
        const nodeSize = node.size ?? (isCur ? 64 : 44);
        entrySizeRef.current = nodeSize;
        setEntryPos({
            x: panRef.current.x + node.x * zoomRef.current,
            y: panRef.current.y + node.y * zoomRef.current - (node.type === 'enhance' ? nodeSize * Math.SQRT2 / 2 : nodeSize / 2) - 8,
        });
        // [2026-08-27] 背景图：编辑器指定 → 对应图；未指定 → 一局内固定随机（拖动/重开不变）
        let bg = '';
        if (node.dialogueBg) {
            bg = getDialogueBg(node.dialogueBg);
        } else {
            const cached = entryBgCacheRef.current.get(node.id);
            if (cached) bg = cached;
            else { bg = getDialogueBg(); entryBgCacheRef.current.set(node.id, bg); }
        }
        setEntryBg(bg);
    };

    // [2026-08-11 节点预览] 右键节点：打开/切换预览目标
    const handleNodeContextMenu = (node: RogueNode) => {
        setPreviewNode(node);
    };

    // [2026-08-27 莉莉子] 节点进入面板「前往」：头像移动 + 进入互动（复用原 onInteractCurrent 分发）
    const handleEntryEnter = (node: RogueNode) => {
        setEntryNode(null);
        entryNodeRef.current = null;
        // [2026-08-27] 先移动，等头像动画完成（onAnimationComplete）再进入后续事件
        pendingEnterRef.current = node;
        onMoveTo(node.id);
        // start：起点节点只移动不互动（doEnterNode 里跳过）
    };

    // [2026-08-28 莉莉子] 打开商店：进节点随机开启 N 个页签（N=2+等级商店页签位，最高 4），
    // 首次进节点确定并缓存 nodeId→页签，节点内重复开窗不重随（防刷页签）；等级越高页签位越多越稳定
    const openShop = useCallback((node: RogueNode) => {
        if (!shopTabsRef.current[node.id]) {
            const count = Math.min(4, 2 + getHeroLevelBonus(run.heroLevel ?? 1).shopTabBonus);
            const all: ShopTab[] = ['card', 'enhancement', 'equipment', 'remove'];
            shopTabsRef.current[node.id] = [...all].sort(() => Math.random() - 0.5).slice(0, count);
        }
        setShopStock(generateShopStock(run.rarityBonus, run.passUnlockedEnhancements)); // [2026-08-29 通行证]
        setShopOpen(true);
    }, [run.heroLevel, run.rarityBonus]);

    // [2026-08-28 事件] 事件抽取：一局内最近 8 个不重复（权重由 rollRogueEvent 处理）
    const rollEvent = (): RogueEvent => {
        const ev = rollRogueEvent(seenEventsRef.current);
        seenEventsRef.current = [...seenEventsRef.current.slice(-8), ev.id];
        return ev;
    };
    // [2026-08-28 事件] 强化节点抽选：托付遗物投资 → 第一个强化品质+1（一次性消费标记）
    const rankUpRarity = (r: EnhancementRarity): EnhancementRarity => {
        const map: Record<EnhancementRarity, EnhancementRarity> = { common: 'uncommon', uncommon: 'rare', rare: 'epic', epic: 'legendary', legendary: 'mythic', mythic: 'mythic' };
        return map[r] ?? r;
    };
    const rollEnhanceOptions = (): MazeEnhancement[] => {
        let opts = pickRandomEnhancements(3, run.difficulty, run.rarityBonus, run.passUnlockedEnhancements); // [2026-08-29 通行证]
        if (run.pendingInvestments?.some(i => i.kind === 'enhancementRank')) {
            opts = opts.map((e, i) => i === 0 ? { ...e, rarity: rankUpRarity(e.rarity) } : e);
            onConsumeEnhancementRank?.();
        }
        return opts;
    };
    // [2026-08-29] 迷宫强化三选一刷新：消耗刷新次数（App 处理）成功后重新生成候选
    const handleEnhanceRefresh = () => {
        if (eventModal !== 'enhance') return;
        if (onRefreshEnhance && !onRefreshEnhance()) return; // 刷新次数不足
        setEnhanceOptions(rollEnhanceOptions());
    };

    // [2026-08-27 莉莉子] 头像移动完成后的「进入」：战斗→弹右侧敌人详情（详情里有「战斗」按钮再进）；非战斗→直接打开对应弹窗
    const doEnterNode = (node: RogueNode) => {
        if (node.type === 'battle' || node.type === 'elite' || node.type === 'boss') {
            setPreviewNode(node); // 移动完成 → 右侧敌人详情
        } else {
            // [2026-08-29 经验重构] 非战斗节点进入即发经验（App 层 grantNodeExp 按节点去重）
            onEnterNode?.(node);
            if (node.type === 'enhance') {
                if (!isDev) setEnhanceOptions(rollEnhanceOptions()); // [2026-08-28] 托付遗物投资：品质+1；[2026-08-31 莉莉子 开发者] 开发者走全量选择器，无需随机候选
                setEventModal('enhance');
            } else if (node.type === 'shop') {
                openShop(node);
            } else if (node.type === 'treasure') {
                setTreasureOpen(true);
            } else if (node.type === 'event') {
                setCurrentEvent(rollEvent()); // [2026-08-28 事件] 进事件节点随机抽事件（一局内去重）
                setEventModal('event');
            } else if (node.type === 'rest') {
                setEventModal('rest');
            }
        }
    };

    // [完整三重迷宫] 渲染全部 Act 节点 + 白色虚线连线（基于节点 next 真实路径）
    const allNodes = layout.flatMap(act => act.nodes);
    const nodeById = new Map(allNodes.map(n => [n.id, n]));

    // [2026-08-28 莉莉子 推演开场] 节点从左到右依次点亮（按 x 列分桶做视觉排序，仅演出用；
    // 非迷宫深度语义——迷宫深度用 mapLayout.computeGraphDepth，见 generateMapLayout）
    // 基础延迟 0.45s（雪花开场 + 背景显影启动后）；末列 boss 约 0.45+13*0.085 ≈ 1.56s
    const nodeRevealDelays = useMemo(() => {
        if (!reveal) return new Map<string, number>();
        const m = new Map<string, number>();
        const byCol = new Map<number, RogueNode[]>();
        for (const n of allNodes) {
            const c = nodeColumnIndex(n);
            const arr = byCol.get(c) ?? [];
            arr.push(n);
            byCol.set(c, arr);
        }
        let base = 0.45;
        [...byCol.keys()].sort((a, b) => a - b).forEach(col => {
            [...byCol.get(col)!].sort((a, b) => a.y - b.y).forEach((n, i) => {
                m.set(n.id, base + i * 0.05);
            });
            base += 0.085;
        });
        return m;
    }, [reveal, allNodes]);
    // 连线随起始节点所在列渐显（略晚于节点，0.15s 后）
    const lineRevealDelay = (x1: number): number => 0.45 + nodeColumnIndex({ x: x1 } as RogueNode) * 0.085 + 0.15;

    // [2026-08-26 莉莉子] 右侧按钮：放大 / 缩小（同滚轮）/ 定位当前节点（纸飞机）
    const handleZoomIn = () => {
        const vp = viewportRef.current;
        if (!vp) return;
        zoomAround(vp.clientWidth / 2, vp.clientHeight / 2, 1.15);
    };
    const handleZoomOut = () => {
        const vp = viewportRef.current;
        if (!vp) return;
        zoomAround(vp.clientWidth / 2, vp.clientHeight / 2, 0.85);
    };
    const handleLocateCurrent = () => {
        const vp = viewportRef.current;
        if (!vp) return;
        const curNode = (run.currentNodeId ? nodeById.get(run.currentNodeId) : undefined) ?? layout[run.act]?.nodes[0];
        if (!curNode) return;
        const vw = vp.clientWidth;
        const vh = vp.clientHeight;
        // [2026-08-26 莉莉子] 缩放也恢复默认视角（同初始 fit×2.2，不小于无黑边下限），再居中当前节点
        const fit = Math.min(vw / MAP_WIDTH, vh / MAP_HEIGHT);
        const minZoom = Math.max(vw / MAP_WIDTH, vh / MAP_HEIGHT);
        zoomRef.current = Math.min(MAX_ZOOM, Math.max(minZoom, fit * 3.2));
        panRef.current = {
            x: vw / 2 - curNode.x * zoomRef.current,
            y: vh / 2 - curNode.y * zoomRef.current,
        };
        clampPan();
        applyTransform();
    };
    // [2026-08-10] 击败/错过集合（地图状态机：击败红叉 / 错过灰）
    const defeatedSet = new Set(run.defeated ?? []);
    const missedSet = new Set(run.missed ?? []);
    const visitedSet = new Set(run.visited ?? []); // [2026-08-27] 走过的节点（灰显不可回退）
    // [2026-08-27 莉莉子] 当前战斗节点未击败 → 后续不解锁（必须打败该节点敌人才解锁下一段）
    const curEntryNode = nodeById.get(run.currentNodeId ?? '');
    const isCombatBlocked = !!curEntryNode
        && (curEntryNode.type === 'battle' || curEntryNode.type === 'elite' || curEntryNode.type === 'boss')
        && !defeatedSet.has(curEntryNode.id);
    // [2026-08-11 节点预览] 节点状态机抽成辅助函数：地图渲染循环 + 预览面板复用，保证一致
    const getNodeState = (node: RogueNode): MapNodeState => {
        const isCurrent = node.id === run.currentNodeId;
        const inCurrentAct = layout.find(a => a.nodes.some(n => n.id === node.id))?.index === run.act;
        const currentNode = nodeById.get(run.currentNodeId ?? '');
        // [2026-08-27] 战斗节点未击败时其 next 不解锁（isCombatBlocked）
        const isReachable = inCurrentAct && currentNode?.next.includes(node.id) && !isCombatBlocked;
        if (isCurrent) return 'current';
        if (defeatedSet.has(node.id)) return 'done';
        // [2026-08-27] 已走过的节点：灰显（missed 样式），不可回退（不再显示 locked 灰锁）
        if (visitedSet.has(node.id)) return 'missed';
        if (isReachable) return 'available';
        if (missedSet.has(node.id)) return 'missed';
        return 'locked';
    };
    // [2026-08-26 莉莉子] 连线：reachable=true 表示"当前节点能走通的路"（当前节点 → 其 next），渲染为蓝色实线 + 闪烁前进箭头；其余黑色虚线
    const lines: Array<{ x1: number; y1: number; x2: number; y2: number; reachable: boolean }> = [];
    for (const node of allNodes) {
        for (const nextId of node.next) {
            const target = nodeById.get(nextId);
            if (target) lines.push({ x1: node.x, y1: node.y, x2: target.x, y2: target.y, reachable: node.id === run.currentNodeId && !isCombatBlocked });
        }
    }
    return (
        <div className="relative w-full h-full overflow-hidden bg-black text-white font-sans select-none">
            {/* 视口 */}
            <div
                ref={viewportRef}
                className={`absolute inset-0 overflow-hidden ${reveal ? 'cursor-default pointer-events-none' : 'cursor-grab active:cursor-grabbing'}`}
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
                        if (!dragRef.current.moved && e.target === canvasRef.current) {
                            if (previewNode) setPreviewNode(null);
                            // [2026-08-27] 点地图空白主动关闭进入面板
                            if (entryNode) { setEntryNode(null); entryNodeRef.current = null; }
                        }
                    }}
                >
                    <img
                        src={mapZero}
                        width={MAP_WIDTH}
                        height={MAP_HEIGHT}
                        className={`w-full h-full object-cover select-none pointer-events-none ${reveal ? 'rogue-map-bg-anim' : ''}`}
                        draggable={false}
                        alt="悖论迷宫地图"
                    />
                    {/* [2026-08-28 莉莉子 推演开场] 逐行显影扫描带：蓝白亮条从顶扫到底（配合背景 clip-path 显影） */}
                    {reveal && (
                        <div
                            className="absolute inset-x-0 h-[9px] rogue-map-scan-anim pointer-events-none z-[5]"
                            style={{ top: '-14%', background: 'linear-gradient(180deg, transparent, rgba(125,211,252,0.85), #fff, rgba(125,211,252,0.85), transparent)', boxShadow: '0 0 20px 3px rgba(125,211,252,0.55)' }}
                        />
                    )}
                    {/* 白色虚线连线层 */}
                    <svg
                        className="absolute inset-0 w-full h-full pointer-events-none"
                        width={MAP_WIDTH}
                        height={MAP_HEIGHT}
                    >
                        {lines.map((l, i) => {
                            // [2026-08-26 莉莉子] 可达路径=蓝色实线+沿线多个闪烁前进箭头；其余=黑色虚线
                            if (!l.reachable) {
                                return (
                                    <line
                                        key={i}
                                        x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2}
                                        stroke="black"
                                        strokeWidth="3"
                                        strokeDasharray="10 8"
                                        strokeOpacity="0.6"
                                        style={reveal ? { animation: `rogue-map-line-in 0.4s ${lineRevealDelay(l.x1)}s backwards` } : undefined}
                                    />
                                );
                            }
                            const angle = Math.atan2(l.y2 - l.y1, l.x2 - l.x1) * 180 / Math.PI;
                            return (
                                <g key={i} style={reveal ? { animation: `rogue-map-line-in 0.4s ${lineRevealDelay(l.x1)}s backwards` } : undefined}>
                                    {/* 蓝色高光包裹白色亮线：白色主线 + 蓝色光晕（霓虹管效果） */}
                                    <line
                                        x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2}
                                        stroke="#ffffff"
                                        strokeWidth="3.5"
                                        strokeOpacity="0.95"
                                        strokeLinecap="round"
                                        style={{ filter: 'drop-shadow(0 0 6px rgba(59,130,246,0.9))' }}
                                    />
                                    {/* 沿线的多个前进箭头（紧凑错落闪烁，stagger） */}
                                    {[0.15, 0.3, 0.45, 0.6, 0.75, 0.9].map((t, j) => {
                                        const x = l.x1 + (l.x2 - l.x1) * t;
                                        const y = l.y1 + (l.y2 - l.y1) * t;
                                        return (
                                            <polygon
                                                key={j}
                                                points="0,-6 11,0 0,6"
                                                fill="#60a5fa"
                                                transform={`translate(${x},${y}) rotate(${angle})`}
                                                style={{ opacity: 0, animation: `mapArrowBlink 1s ${j * 0.13}s infinite both` }}
                                            />
                                        );
                                    })}
                                </g>
                            );
                        })}
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
                                enemyKey={node.enemyKey} // [2026-08-10] 战斗节点预分配敌人头像
                                onActivate={() => handleNodeClick(node)}
                                onPreview={() => handleNodeContextMenu(node)} // [2026-08-11] 右键预览
                                revealDelay={reveal ? (nodeRevealDelays.get(node.id) ?? 0.45) : undefined} // [2026-08-28 莉莉子 推演开场] 按列从暗弹出
                            />
                        );
                    })}

                    {/* [2026-08-25] 天启者头像全局动画层：随当前节点平滑移动（点击节点头像飞过去，不再闪现）
                        initial={false} 首次直接到位；currentNodeId 变化时 animate x/y 由 spring 驱动移动 */}
                    {(() => {
                        const curNode = run.currentNodeId ? nodeById.get(run.currentNodeId) : undefined;
                        if (!curNode || !run.heroKey) return null;
                        const nodeSize = 64; // 当前节点尺寸（MapNode current 默认 64）
                        const offset = (curNode.type === 'enhance' ? nodeSize * Math.SQRT2 / 2 : nodeSize / 2) + 32; // 菱形按顶角、圆形按顶部
                        return (
                            <motion.div
                                className="absolute left-0 top-0 z-20"
                                // [2026-08-28 莉莉子 推演开场] 首进：头像从起点上方 90px 落下淡入（节点全部亮起后）
                                initial={reveal ? { opacity: 0, x: curNode.x, y: curNode.y - offset - 90 } : false}
                                animate={{ opacity: 1, x: curNode.x, y: curNode.y - offset }}
                                transition={{ type: 'spring', stiffness: 300, damping: 26, delay: reveal ? 1.95 : 0 }}
                                onAnimationComplete={() => {
                                    // [2026-08-27] 头像移动完成 → 进入待进入节点（战斗弹右侧详情 / 非战斗弹窗）
                                    if (pendingEnterRef.current) {
                                        const n = pendingEnterRef.current;
                                        pendingEnterRef.current = null;
                                        doEnterNode(n);
                                    }
                                }}
                            >
                                <div className="-translate-x-1/2 -translate-y-1/2 w-12 h-12 rounded-full border-2 border-white/90 overflow-hidden shadow-[0_0_18px_rgba(255,255,255,0.55),0_4px_12px_rgba(0,0,0,0.5)]">
                                    <CroppedAvatar cardKey={run.heroKey} className="w-full h-full rounded-full" />
                                </div>
                            </motion.div>
                        );
                    })()}
                </div>
                {/* [2026-08-28 莉莉子 推演开场] 老电视雪花白闪揭幕：盖住整个视口，短暂一闪后熄灭 */}
                {reveal && (
                    <div
                        className="absolute inset-0 z-[60] pointer-events-none rogue-map-boot-anim"
                        style={{ backgroundImage: STATIC_NOISE, backgroundColor: 'rgba(255,255,255,0.35)' }}
                    />
                )}
            </div>

            {/* 左下角角色面板 */}
            <div className="absolute bottom-6 left-6 z-40 flex items-center gap-4 pointer-events-none">
                <div className="relative pointer-events-auto shrink-0">
                    <button
                        onClick={() => setDrawerOpen(true)}
                        title="查看牌组与迷宫强化"
                        style={{ width: MAP_BTN.avatarSize, height: MAP_BTN.avatarSize }}
                        className="rounded-full overflow-hidden border-2 border-white/70 ring-2 ring-purple-500/60 shadow-[0_0_24px_rgba(168,85,247,0.5)] shrink-0 cursor-pointer hover:scale-105 hover:ring-purple-400 transition-all"
                    >
                        <CroppedAvatar cardKey={run.heroKey} className="w-full h-full rounded-full" />
                    </button>
                    {/* [2026-08-10] information 提示徽标：头像右下角，提示可点击查看，点击同样打开抽屉 */}
                    <span
                        onClick={() => setDrawerOpen(true)}
                        title="查看牌组与迷宫强化"
                        style={{ width: MAP_BTN.badgeSize, height: MAP_BTN.badgeSize }}
                        className="absolute -bottom-1.5 -right-1.5 rounded-full bg-gray-600 border-2 border-white/80 flex items-center justify-center text-white italic font-black text-sm shadow-lg cursor-pointer hover:bg-gray-500 transition-colors select-none"
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

            {/* 返回（[2026-08-26] 实心按钮；[2026-08-28] 触发 App 的「结算/暂离」二次确认） */}
            <button
                onClick={onBackRequest}
                style={{ padding: MAP_BTN.btnPadding }}
                className="absolute top-3 left-3 z-40 rounded-full bg-slate-800 hover:bg-slate-700 border border-white/15 hover:border-white/40 transition-all"
            >
                <ArrowLeft size={MAP_BTN.btnIcon} className="text-white" />
            </button>

            {/* [2026-08-26 莉莉子] 右侧：缩放（加/减，功能同鼠标滚轮）+ 定位当前节点（纸飞机）；实心按钮 */}
            <div className="absolute right-6 top-1/2 -translate-y-1/2 z-40 flex flex-col items-center gap-2">
                <button onClick={handleZoomIn} title="放大" style={{ padding: MAP_BTN.btnPadding }} className="rounded-full bg-slate-800 hover:bg-slate-700 border border-white/15 hover:border-white/40 transition-all">
                    <Plus size={MAP_BTN.btnIcon} className="text-white" />
                </button>
                <button onClick={handleZoomOut} title="缩小" style={{ padding: MAP_BTN.btnPadding }} className="rounded-full bg-slate-800 hover:bg-slate-700 border border-white/15 hover:border-white/40 transition-all">
                    <Minus size={MAP_BTN.btnIcon} className="text-white" />
                </button>
                <button onClick={handleLocateCurrent} title="定位到当前位置" style={{ padding: MAP_BTN.btnPadding }} className="mt-2 rounded-full bg-purple-600 hover:bg-purple-500 border border-purple-400 transition-all">
                    <Send size={MAP_BTN.btnIcon} className="text-white" />
                </button>
            </div>

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
                    run={run}
                    event={currentEvent ?? undefined}
                    onEvent={onEvent} // [2026-08-28 事件]
                    onRefresh={handleEnhanceRefresh} // [2026-08-29] 强化三选一刷新
                    refreshCount={run.refreshCount}  // [2026-08-29] 剩余刷新次数
                    onRemoveCard={onRestRemove} // [2026-08-29] 休整·净化删卡
                    onAddCard={onRestCopy}      // [2026-08-29] 休整·复制卡
                    onStartScout={onRestScout}  // [2026-08-29] 休整·探路
                    // [2026-08-31 莉莉子 开发者] 任意选强化
                    isDev={isDev}
                    devPlayerPool={PLAYER_ENHANCEMENTS}
                    devEnemyPool={ENEMY_ELIGIBLE_BUFFS}
                    ownedEnhancements={run.enhancements}
                    onDevPick={onDevPick}
                />
            )}

            {/* [2026-08-12 商店经济] 商店弹窗 */}
            {shopOpen && shopStock && (
                <ShopModal
                    run={run}
                    stock={shopStock}
                    availableTabs={shopTabsRef.current[run.currentNodeId ?? ''] ?? ['card', 'enhancement', 'equipment', 'remove']}
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
                    onSkip={onRewardSkip} // [2026-08-29] 跳过卡牌奖励
                    onRefresh={onRewardRefresh} // [2026-08-29] 刷新三选一
                    refreshCount={run.refreshCount} // [2026-08-29] 剩余刷新次数
                    pendingPacks={reward.pendingPacks} // [2026-08-29] 胜利附带卡包
                    onOpenPack={onOpenPack} // [2026-08-29] 打开卡包
                />
            )}

            {/* [2026-09-04] 首战大捷 · 天启者招募三选一 */}
            {heroRecruit && (
                <HeroRecruitModal
                    options={heroRecruit.options}
                    subNote={heroRecruit.subNote}
                    onPick={onHeroRecruitPick ?? (() => {})}
                    onSkip={onHeroRecruitSkip ?? (() => {})}
                />
            )}

            {/* 通关/死亡结算（天启者经验动画） */}
            {run.status !== 'active' && runEnd && (
                <RunEndModal run={run} runEnd={runEnd} pendingPacks={pendingPacks} onOpenPack={onOpenPack} onConfirm={onRunEndConfirm} />
            )}

            {/* [2026-08-10] 头像抽屉：牌组 / 迷宫强化列表 */}
            <RogueDrawer
                open={drawerOpen}
                onClose={() => setDrawerOpen(false)}
                deck={run.deck}
                heroKey={run.heroKey} // [2026-08-15] 抽屉悬停检视英雄卡挂武装
                enhancements={run.enhancements}
                equippedCards={run.equippedCards} // [2026-08-29] 检视渲染全卡装备（等级奖励随机挂的）
            />

            {/* [2026-08-11] 节点右键预览面板：右侧滑出，点画面空白关闭 */}
            <NodePreviewPanel
                node={previewNode}
                run={run}
                state={previewNode ? getNodeState(previewNode) : 'locked'}
                onClose={() => setPreviewNode(null)}
                onMoveTo={(id) => { onMoveTo(id); setPreviewNode(nodeById.get(id) ?? null); }} // [2026-08-25] 前往：移动 + 打开新节点详情（由"进入"按钮触发）
                onBattle={(t, a, id, b) => { onBattle(t, a, id, b); setPreviewNode(null); }} // 挑战：当前未完成战斗（[2026-08-27 莉莉子] 透传节点预分配迷宫强化）
                onDevWin={onDevWin} // [2026-08-29] 开发者一键胜利
                onInteractCurrent={(n) => {
                    setPreviewNode(null);
                    // 当前非敌人节点互动：复用地图左键的互动路径（rest→休整弹窗 / enhance→生成3选1 / shop→商店弹窗 / event/treasure→占位弹窗）
                    if (n.type === 'enhance') setEnhanceOptions(rollEnhanceOptions()); // [2026-08-28] 托付遗物投资：品质+1
                    if (n.type === 'shop') {
                        openShop(n); // [2026-08-28] 重复开窗页签不变（进入节点时已固定）
                        return;
                    }
                    if (n.type === 'treasure') {
                        setTreasureOpen(true);
                        return;
                    }
                    if (n.type === 'event') { // [2026-08-28 事件] 重复进事件节点：抽新事件（一局内去重）
                        setCurrentEvent(rollEvent());
                        setEventModal('event');
                        return;
                    }
                    // [安全窄化] NodePreviewPanel 保证此回调只在非战斗节点触发（battle/elite/boss 走 onBattle）
                    setEventModal(n.type as Exclude<RogueNodeType, 'battle' | 'elite' | 'boss'>);
                }}
            />

            {/* [2026-08-27 莉莉子] 节点进入方形面板：点击节点正上方弹出，点「前往」才移动+走进 */}
            {entryNode && (
                <NodeEntryModal
                    key={entryNode.id}
                    pos={entryPos}
                    bg={entryBg}
                    title={
                        (entryNode.type === 'battle' || entryNode.type === 'elite' || entryNode.type === 'boss')
                            ? (entryNode.enemyArchetypeId ? ENEMY_ARCHETYPES[entryNode.enemyArchetypeId]?.name ?? NODE_INFO[entryNode.type].title : NODE_INFO[entryNode.type].title)
                            : NODE_INFO[entryNode.type].title
                    }
                    desc={
                        (entryNode.type === 'battle' || entryNode.type === 'elite' || entryNode.type === 'boss')
                            ? (entryNode.enemyArchetypeId ? ENEMY_ARCHETYPES[entryNode.enemyArchetypeId]?.description ?? NODE_INFO[entryNode.type].desc : NODE_INFO[entryNode.type].desc)
                            : NODE_INFO[entryNode.type].desc
                    }
                    onEnter={() => handleEntryEnter(entryNode)}
                />
            )}
        </div>
    );
};
