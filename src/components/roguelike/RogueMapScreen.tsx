// ==========================================
// 悖论迷宫 · 地图界面（核心枢纽）
// 可平移缩放的长幅画卷 + 圆形节点 + 顶部 HUD + 弹窗调度
// 性能：平移/缩放直接操作 ref + DOM transform（不走 React 高频重渲染）
// ==========================================
import React, { useRef, useCallback, useEffect, useState, useMemo } from 'react';
import { Heart, RefreshCw, RotateCcw, ArrowLeft, Plus, Minus, Send, Package, ListChecks } from 'lucide-react'; // [2026-08-26] Plus/Minus 缩放按钮、Send 纸飞机定位 ｜ [2026-10-02] Package 待开匣子入口 ｜ [2026-10-10] ListChecks 事件审阅台入口
import {
    MAP_WIDTH, MAP_HEIGHT, generateMapLayout, nodeColumnIndex,
    RANDOM_NODE_NAME, RANDOM_NODE_DESC, // [2026-10-10 程实测] 进入面板的随机节点掩码
    type RogueNode, type RogueNodeType,
} from '../../data/roguelike/mapLayout';
import type { RoguelikeRunState } from '../../hooks/useRoguelikeRun';
import { MapNode, type MapNodeState } from './MapNode';
import { CroppedAvatar } from '../CroppedAvatar'; // [2026-08-10] 圆形头像读取 avatar 裁剪配置
import { CURRENCY_ICONS } from '../../data/imageData';
import { NodeEventModal } from './modals/NodeEventModal';
import { DevEventPickerModal, type DevEventAnchor } from './modals/DevEventPickerModal'; // [2026-10-10 莉莉子 开发者] 事件审阅台（任意切换事件重选）
import { pickRandomEnhancements, type MazeEnhancement } from '../../data/roguelike/enhancements';
import { PLAYER_ENHANCEMENTS, ENEMY_ELIGIBLE_BUFFS } from '../../data/roguelike/buffs'; // [2026-08-31 莉莉子 开发者] 全量强化池
import { BattleRewardModal } from './modals/BattleRewardModal';
import { HeroRecruitModal } from './modals/HeroRecruitModal'; // [2026-09-04] 首战天启者招募三选一
import { RunEndModal, type RunEndInfo } from './modals/RunEndModal'; // [2026-08-29] 通关/败亡结算（经验动画）
import { RogueDrawer } from './RogueDrawer'; // [2026-08-10] 头像抽屉：牌组/强化列表
import { NodePreviewPanel } from './NodePreviewPanel'; // [2026-08-11] 节点右键预览面板
import { NodeEntryModal } from './NodeEntryModal'; // [2026-08-27] 节点进入方形面板（点击节点在正上方弹出）
// [2026-10-05 莉莉子 · 方案 P3] 事件结果清单类型（透传给弹窗）
import type { EventApplyResult } from '../../data/roguelike/eventAppliers';
import { getDialogueBg } from '../../data/roguelike/dialogueBg'; // [2026-08-27] 进入面板背景图（指定 or 随机）
import { ENEMY_ARCHETYPES } from '../../data/enemies/archetypes'; // [2026-08-27] 战斗节点流派名/简介
import { eventBus, GameEvents } from '../../utils/eventBus'; // [2026-10-14 莉莉子 🖱️] 地图 HUD / 空白关闭 音效
import { ShopModal, type ShopTab } from './modals/ShopModal'; // [2026-08-12 商店经济] 商店弹窗 [2026-08-28] 页签类型
import { generateShopStock, type ShopStock } from '../../data/roguelike/shop'; // [2026-08-12 商店经济]
import { TreasureModal } from './modals/TreasureModal'; // [2026-08-12 宝箱节点] 宝箱弹窗
import type { RewardCardOption, HeroRecruitOption } from '../../data/roguelike/rewards'; // [2026-08-25] 胜利奖励候选卡；[2026-09-04] 首战天启者招募
import type { RandomTreasureResult } from '../../data/roguelike/treasure'; // [2026-08-12 宝箱节点]
import { getHeroLevelBonus } from '../../data/roguelike/heroProgression'; // [2026-08-28] 商店页签位（等级奖励）
import { rollRogueEvent, ROGUE_EVENTS, ROGUE_EVENT_BY_ID, type RogueEvent } from '../../data/roguelike/events'; // [2026-08-28 事件] · [2026-10-09] +按 id 直取（指定固定事件）· [2026-10-10] +ROGUE_EVENTS（开发者事件审阅台全量列表）
import type { EnhancementRarity } from '../../data/roguelike/buffs'; // [2026-08-28 事件] 强化品质提升
import type { ChestInstance } from '../../data/roguelike/divinityShards'; // [2026-09-29 程拍板] 奖励匣
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
    // [2026-10-09 莉莉子 · 随机节点] 仅为补键；实际不可达（真身在开局已改写进 `type`）。
    //   占位文案与 `mapLayout.RANDOM_NODE_NAME / DESC` 同源，改文案时两处都要动（此处仅兜底）。
    random: { title: '？？？', desc: '？？？？' },
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
    /** [2026-10-05 莉莉子 · 方案 P1] 标记"该节点的服务/奖励已用掉"（防右键反复进入刷取；见 BUG-20261005-13） */
    onMarkNodeResolved?: (nodeId: string) => void;
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
    onOpenPack: () => ChestInstance | null; // [2026-09-29 程拍板] 打开卡包（抽到奖励匣）
    onDevWin?: (nodeType: RogueNodeType, nodeId: string) => void; // [2026-08-29] 开发者一键胜利
    pendingPacks?: number; // [2026-08-29] 通关结算待打开卡包
    pendingChests?: ChestInstance[]; // [2026-09-29] 通关结算待打开奖励匣
    onOpenChest?: (index: number) => any; // [2026-09-29] 打开匣子
    onShardDrop?: (res: any) => void; // [2026-09-29] 碎片入账
    // [2026-10-04 独立审查 #10] ⚡ 一键开匣 + 武装库存：**透传自 App 的唯一实例**
    //   （此前 RunEndModal 自己 new 了第二个 useUserSystem 实例 ⇒ settings 快照不同步 ⇒ 匣子可被重复开）
    onOpenAllChests?: () => any[];
    armamentStock?: Record<string, number>;
    /**
     * [2026-10-02 莉莉子 BUG修复 #17] 局中「待开匣子 / 评估嘉勉」入口。
     *   此前 `onOpenEvaluation` **全项目只有肉鸽大厅一处入口**（RogueLobby），
     *   局中地图与战斗胜利弹窗都无处可去 ⇒ 玩家抽到匣子后**只能干看着**，
     *   这正是程说的「导航按钮没做好」。传入即在右上角渲染带角标的入口。
     */
    onOpenEvaluation?: () => void;
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
    /** [2026-10-05 · 方案 P3] 返回值 = "实际结果清单"（透传给事件弹窗的结果步骤） */
    onEvent?: (eventId: string, choiceIndex: number, removePicks?: string[]) => EventApplyResult[] | void;
    /** [2026-10-08 莉莉子 · 交互回响层 批次3] 迎战类事件：结果步骤的「迎战」按钮才真正切进战斗 */
    onEventFight?: () => void;
    /** [2026-10-05 · 方案 P4 §3] 「深层回响」结算（透传） */
    onEventDeep?: (eventId: string, layers: number) => EventApplyResult[] | void;
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
    /**
     * [2026-10-10 莉莉子 · 开发者「事件审阅台」]
     *   把整局状态**原样回滚**到传入的快照（`useRoguelikeRun.restoreRun`，由 App 透传）。
     *   用途：开发者在事件节点用右上角「事件列表」切换事件重选时，先把上一次选择已结算的效果
     *   （掉的血 / 加的金 / 删掉的卡 / 待战登记 / resolvedNodes）退回"刚进这个节点那一刻"。
     *   传入才启用事件审阅台 ⇒ 普通对局（不传）功能整体不存在。
     */
    onDevRestoreRun?: (snapshot: RoguelikeRunState) => void;
}

const MAX_ZOOM = 2.0;

export const RogueMapScreen: React.FC<RogueMapScreenProps> = ({
    run, reward,
    onBackRequest, onBattle, onMoveTo, onRest, onRestRemove, onRestCopy, onRestScout, onEnhance, onRewardPick, onRewardSkip, onRewardRefresh, onRefreshEnhance, onOpenPack, onDevWin, pendingPacks, pendingChests, onOpenChest, onShardDrop, onOpenAllChests, armamentStock, onRunEndConfirm, onOpenEvaluation,
    heroRecruit, onHeroRecruitPick, onHeroRecruitSkip, // [2026-09-04 首战招募]
    onBuyCard, onBuyEnhancement, onBuyEquipment, onRemoveCard, onShopRefresh,
    onTreasureGold, onTreasureCard, onTreasureEnhancement, onTreasureSacrifice, onTreasureRandom,
    onEvent, onEventFight, onConsumeEnhancementRank, // [2026-08-28 事件] · [2026-10-08] +onEventFight（迎战按钮）
    onEventDeep, // [2026-10-05 · 方案 P4 §3] 深层回响结算
    onEnterNode, // [2026-08-29 经验重构]
    onMarkNodeResolved, // [2026-10-05 莉莉子 · 方案 P1] 标记节点服务已用掉（防刷取）
    reveal, onRevealEnd, // [2026-08-28 莉莉子 推演开场]
    runEnd, // [2026-08-29] 通关/败亡结算
    isDev, onDevPick, // [2026-08-31 莉莉子 开发者] 任意选强化
    onDevRestoreRun, // [2026-10-10 莉莉子 开发者] 事件审阅台：切换事件时把整局状态回滚到快照
}) => {
    // =====================================
    // [2026-10-05 莉莉子 BUG修复 · 20261005-13 / 方案 P1]
    //   地图是**单向不可回退**的 ⇒ 节点重入的唯一路径就是"站在节点上右键 → 进入"。
    //   用 `run.resolvedNodes`（该节点的服务/奖励**已经用掉**）把这条路径堵死：
    //     · 事件：做出选择时记 · 强化：选定强化时记 · 休整：四个行动任一记
    //     · 宝箱：五种领奖任一记 · 商店：首次购买/刷新时记（只看不买仍可重开）
    // =====================================
    const resolvedNodeSet = new Set(run.resolvedNodes ?? []);
    const resolveCurrentNode = () => {
        if (run.currentNodeId) onMarkNodeResolved?.(run.currentNodeId);
    };
    /** 包装"会给玩家好处"的回调：调用后顺手把当前节点标记为已用掉
     *  ⚠️ **保留返回值**（商店的购买回调返回 boolean，`false` = 没买成，如金币不足/已售出）
     *     ⇒ 只有真正成功（返回值不是 false）才把节点算作"用掉"。 */
    const withResolve = <A extends unknown[], R>(fn?: (...args: A) => R) => (...args: A): R => {
        const ret = fn?.(...args) as R;
        if ((ret as unknown) !== false) resolveCurrentNode();
        return ret;
    };
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
    // [2026-10-08 莉莉子 · 交互回响层 批次3] 商店状态**按节点缓存**：
    //   原来"首次购买/刷新 ⇒ 标记节点用尽"的防刷法，代价是**关掉商店后再右键只剩灰字**（玩家不知道店没了）。
    //   现在改为：允许回头再进，但库存与「已购」都不重随 ⇒ 防刷不变，锁店消失。
    const [shopPurchased, setShopPurchased] = useState<string[]>([]);
    const shopNodeCacheRef = useRef<Record<string, { stock: ShopStock; purchased: string[] }>>({});
    const [treasureOpen, setTreasureOpen] = useState(false); // [2026-08-12 宝箱节点] 宝箱弹窗开关
    const shopTabsRef = useRef<Record<string, ShopTab[]>>({}); // [2026-08-28] 商店节点 → 开启页签（进节点随机确定，重复开窗不重随）
    const [currentEvent, setCurrentEvent] = useState<RogueEvent | null>(null); // [2026-08-28 事件] 当前事件
    const seenEventsRef = useRef<string[]>([]); // [2026-08-28 事件] 一局内已出现事件（最近 8 个去重）
    // ═══ [2026-10-10 莉莉子 · 开发者「事件审阅台」] ═══
    const [devPickerOpen, setDevPickerOpen] = useState(false); // 事件列表窗口开关
    //   每次切换事件 +1 ⇒ 拼进 NodeEventModal 的 key，**强制重挂载**把内部步骤（选择/删卡/剧情/结果/深层回响）复位
    const [devEventSeq, setDevEventSeq] = useState(0);
    //   快照**绑定节点**、不绑定弹窗：只在"首次进入某个事件节点"时捕获一次，之后反复切换都回到这同一份。
    //   ⚠️ 若改成每次开窗都重取快照，第一次选择造成的血金变化就永久留下了 —— 那等于没回滚。
    const devEventSnapRef = useRef<{ nodeId: string; run: RoguelikeRunState } | null>(null);
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
            // [2026-10-10 莉莉子 BUG修复 · 程实测] **待战节点也要走这条路** ——
            //   它在地图上显示成「精英」（`MapNode.tsx:50` 用 `pendingBattle` 改写显示类型），
            //   但 `node.type` 仍是 `'event'` ⇒ 判据不能只看 type；否则左键点它**毫无反应**，那场仗永远打不了。
            const isPendingBattleNode = !!run.pendingBattles?.[node.id];
            if ((isPendingBattleNode || node.type === 'battle' || node.type === 'elite' || node.type === 'boss') && !defeatedSet.has(node.id)) {
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
        // [2026-10-08 · 批次3] 命中缓存 ⇒ 原样重开（库存 + 已购都保留）；未命中才进货
        const cached = shopNodeCacheRef.current[node.id];
        setShopStock(cached ? cached.stock : generateShopStock(run.rarityBonus, run.passUnlockedEnhancements, { equippedCards: run.equippedCards, ownedEnhancements: run.enhancements, difficulty: run.difficulty })); // [2026-08-29 通行证] [2026-09-25] 不叠加 [2026-10-08 难度分层]
        setShopPurchased(cached ? cached.purchased : []);
        setShopOpen(true);
    }, [run.heroLevel, run.rarityBonus, run.passUnlockedEnhancements, run.equippedCards, run.enhancements, run.difficulty]);

    // [2026-08-28 事件] 事件抽取：一局内最近 8 个不重复（权重由 rollRogueEvent 处理）
    // [2026-10-09 莉莉子 · 事件指定] 地图上**指定了固定事件**的事件节点 ⇒ **必出**该事件（绕开去重）；
    //   两条路径都记入"看过"账本（固定事件重复出现是设计允许的，程 2026-10-09 拍板）
    const rollEvent = (node?: RogueNode): RogueEvent => {
        const fixed = node?.eventId ? ROGUE_EVENT_BY_ID[node.eventId] : undefined;
        const ev = fixed ?? rollRogueEvent(seenEventsRef.current);
        // [2026-10-05 莉莉子 · 方案 P1] **整局唯一**：原来只对"最近 8 个"去重（滑动窗口）⇒ 一局内会重复遇到同一事件。
        //   依据：《参考-肉鸽事件设计》§F 明写"事件去重：一局内避免重复同事件"；一局事件节点仅 1~2 个/Act、池子 23 条足够。
        //   （池子抽空时 `rollRogueEvent` 会自动退回全集，不会抽不出事件。）
        seenEventsRef.current = [...seenEventsRef.current, ev.id];
        return ev;
    };

    // ═══ [2026-10-10 莉莉子 · 开发者「事件审阅台」] ═══
    /**
     * 建立/复用回滚锚点：**同一节点只取第一次**（切事件、关窗重开都不覆盖）。
     *   ⚠️ 存的是 run 的**引用**而非深拷贝 —— 安全，因为 `useRoguelikeRun` 的 setter 全部是不可变更新
     *     （新对象 / 新数组），旧快照不会被后续操作原地改写（独立审查已逐条核过，未发现 mutation）。
     */
    const ensureDevEventSnapshot = () => {
        const nid = run.currentNodeId;
        if (!nid) return;
        if (devEventSnapRef.current?.nodeId === nid) return;
        devEventSnapRef.current = { nodeId: nid, run };
    };

    /**
     * 快照捕获时机：**事件弹窗打开时**（另外从地图端按钮开审阅台时也会补一份，见下方按钮 onClick）。
     *   · 放在 effect 里而不是 `doEnterNode` 内联 —— 进事件节点时 `onEnterNode` 会**发节点经验**，
     *     内联捕获拿到的是"发经验之前"的闭包 run，回滚后这个节点的经验会白丢一次；
     *     等 effect 跑时经验已提交，快照更贴近"刚进节点"的真实状态。
     */
    useEffect(() => {
        if (!isDev || !onDevRestoreRun) return;
        if (eventModal !== 'event') return;
        ensureDevEventSnapshot();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [eventModal, run.currentNodeId, isDev, onDevRestoreRun]);

    /**
     * 开发者切换事件：**先回滚 → 再换事件 → 打开弹窗并复位步骤**。
     *   ① 回滚整局状态 ⇒ 上一次选择的效果全部退回
     *      （含 `resolvedNodes` / `pendingBattles`，"待战登记"也一起消失，不会残留）
     *   ② 换 `currentEvent` ⇒ 弹窗按新事件渲染
     *   ③ `setEventModal('event')` ⇒ 从**地图端按钮**进来时（弹窗本来是关着的）也能立刻开始体验；
     *      从弹窗内按钮进来时这一步是幂等的
     *   ④ `devEventSeq + 1` ⇒ key 变化 ⇒ 弹窗重挂载，内部步骤回到 `'choices'`
     *   ⚠️ 刻意**不走 `rollEvent`**：切换是"定向指定"，不该污染"一局内已出现过"的去重账本。
     */
    const devSwitchEvent = (ev: RogueEvent) => {
        const snap = devEventSnapRef.current;
        // [2026-10-10 · 第3轮独立审查修复] 回滚条件与**界面显示判据保持一致**（都要求锚点属于当前节点）：
        //   否则一旦出现"窗口开着时当前节点被改动"的情形，界面会说"不适用"，而动作却把整局拽回**上一个节点**的快照。
        if (snap && snap.nodeId === run.currentNodeId && onDevRestoreRun) onDevRestoreRun(snap.run);
        setCurrentEvent(ev);
        setEventModal('event');
        setDevEventSeq(s => s + 1);
        setDevPickerOpen(false);
    };
    // [2026-08-28 事件] 强化节点抽选：托付遗物投资 → 第一个强化品质+1（一次性消费标记）
    const rankUpRarity = (r: EnhancementRarity): EnhancementRarity => {
        const map: Record<EnhancementRarity, EnhancementRarity> = { common: 'uncommon', uncommon: 'rare', rare: 'epic', epic: 'legendary', legendary: 'mythic', mythic: 'mythic' };
        return map[r] ?? r;
    };
    const rollEnhanceOptions = (): MazeEnhancement[] => {
        // [2026-09-25 莉莉子 强化不叠加] 排除本局已拥有 → 不够 3 个就给几个（一个都没有时弹窗自带"返回地图"空态）
        let opts = pickRandomEnhancements(3, run.difficulty, run.rarityBonus, run.passUnlockedEnhancements, run.enhancements); // [2026-08-29 通行证]
        // [2026-09-25 莉莉子 不叠加] 候选为空（强化全拿到手）时不再消费「托付遗物」升档标记，否则标记白丢
        if (opts.length > 0 && run.pendingInvestments?.some(i => i.kind === 'enhancementRank')) {
            opts = opts.map((e, i) => i === 0 ? { ...e, rarity: rankUpRarity(e.rarity) } : e);
            onConsumeEnhancementRank?.();
        }
        return opts;
    };
    // [2026-10-05 莉莉子 · 方案 P1 残项] **强化候选按节点缓存**：
    //   原来"关掉弹窗再右键进入"会重新 `rollEnhanceOptions()` ⇒ 等于**免费刷三选一**（存档式刷选项）。
    //   现在同一节点永远给同一组候选；只有花刷新次数（`handleEnhanceRefresh`）才重抽。
    const enhanceOptionsCacheRef = useRef<Record<string, MazeEnhancement[]>>({});
    const getEnhanceOptionsFor = (nodeId: string): MazeEnhancement[] => {
        const cached = enhanceOptionsCacheRef.current[nodeId];
        if (cached) return cached;
        const rolled = rollEnhanceOptions();
        enhanceOptionsCacheRef.current[nodeId] = rolled;
        return rolled;
    };
    // [2026-08-29] 迷宫强化三选一刷新：消耗刷新次数（App 处理）成功后重新生成候选（并覆盖缓存）
    const handleEnhanceRefresh = () => {
        if (eventModal !== 'enhance') return;
        if (onRefreshEnhance && !onRefreshEnhance()) return; // 刷新次数不足
        const rolled = rollEnhanceOptions();
        enhanceOptionsCacheRef.current[run.currentNodeId ?? ''] = rolled; // 付了刷新次数 ⇒ 更新缓存
        setEnhanceOptions(rolled);
    };

    // [2026-08-27 莉莉子] 头像移动完成后的「进入」：战斗→弹右侧敌人详情（详情里有「战斗」按钮再进）；非战斗→直接打开对应弹窗
    const doEnterNode = (node: RogueNode) => {
        if (node.type === 'battle' || node.type === 'elite' || node.type === 'boss') {
            setPreviewNode(node); // 移动完成 → 右侧敌人详情
        } else {
            // =====================================
            // [2026-10-08 莉莉子 · 瓦尔基里大赛] **待战节点优先**
            //   事件已做出选择、该节点现在"变成战斗节点"了 ⇒ 点它 = 开打。
            //   ⚠️ 必须放在下方 `resolvedNodeSet` 检查**之前** ——
            //      事件做出选择时节点**已被 `markNodeResolved` 记为"用掉"**（防刷取机制），
            //      若先查 resolved 会被直接挡掉 ⇒ 玩家永远打不了这一场。
            // =====================================
            if (run.pendingBattles?.[node.id]) {
                onEventFight?.();
                return;
            }
            // [2026-10-05 · 方案 P1] 该节点的服务/奖励已用掉 ⇒ 不再进入（防右键反复进入刷取）
            // ⚠️ [2026-10-10 莉莉子 · 事件审阅台] **不要**在这里为开发者开旁路 —— 实测（独立审查 C1 复核）：
            //   本函数只由"点**非当前节点**"那条链触发（`handleNodeClick` 对当前节点 :379 直接 return），
            //   而事件节点一旦结算就被 `markNodeResolved`，玩家**根本走不到这里**（`NodePreviewPanel` 连「进入」按钮都不给）
            //   ⇒ 旁路是死代码。开发者重新打开事件节点的路径改由**地图右上角「事件审阅」按钮**承担。
            if (resolvedNodeSet.has(node.id)) {
                console.warn(`[RogueMap] 节点 ${node.id}(${node.type}) 已完成，忽略重复进入`);
                return;
            }
            // [2026-08-29 经验重构] 非战斗节点进入即发经验（App 层 grantNodeExp 按节点去重）
            onEnterNode?.(node);
            if (node.type === 'enhance') {
                if (!isDev) setEnhanceOptions(getEnhanceOptionsFor(node.id)); // [2026-08-28] 托付遗物投资：品质+1；[2026-10-05] 按节点缓存
                setEventModal('enhance');
            } else if (node.type === 'shop') {
                openShop(node);
            } else if (node.type === 'treasure') {
                setTreasureOpen(true);
            } else if (node.type === 'event') {
                setCurrentEvent(rollEvent(node)); // [2026-08-28 事件] 进事件节点抽事件（一局内去重）· [2026-10-09] 若地图指定了固定事件则必出
                setEventModal('event');
            } else if (node.type === 'rest') {
                setEventModal('rest');
            }
        }
    };

    // [完整三重迷宫] 渲染全部 Act 节点 + 白色虚线连线（基于节点 next 真实路径）
    const allNodes = layout.flatMap(act => act.nodes);
    const nodeById = new Map(allNodes.map(n => [n.id, n]));
    // [2026-10-10 莉莉子 开发者 · 事件审阅台] 当前是否站在**事件节点**上
    //   —— 地图端「事件审阅」按钮的显示条件（回滚锚点就是"刚进这个节点那一刻"，不在此处点它没有意义）
    const currentIsEventNode = !!run.currentNodeId && nodeById.get(run.currentNodeId)?.type === 'event';
    // [2026-10-10 莉莉子 开发者 · 事件审阅台] 当前节点的**回滚锚点摘要**（供列表窗口显示"会回滚到哪"）。
    //   没有锚点时返回 null ⇒ 列表窗口会明确提示"切换不会回滚"，而不是让人误以为已经回滚了。
    const devAnchor: DevEventAnchor | null = (() => {
        const snap = devEventSnapRef.current;
        if (!snap || snap.nodeId !== run.currentNodeId) return null;
        return {
            nodeId: snap.nodeId,
            hp: snap.run.hp,
            maxHp: snap.run.maxHp,
            gold: snap.run.gold,
            deckCount: snap.run.deck.length,
            enhancementCount: snap.run.enhancements.length,
            // [2026-10-10 · 第3轮独立审查修复] 锚点是否取自"本节点**已结算之后**"（= 快照里 resolvedNodes 已含它）。
            //   首次进入节点时节点尚未 resolved ⇒ false（干净）；地图进战斗 / 暂离后重挂载补的锚点通常是 true（脏）。
            //   界面据此把"回滚目标其实是当前值"这件事**显式标出来**，避免开发者把当前值当回滚目标。
            settled: (snap.run.resolvedNodes ?? []).includes(snap.nodeId),
        };
    })();

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
    // （`resolvedNodeSet` 已提前到组件顶部定义 —— `doEnterNode` 更早用到它）
    // [2026-08-27 莉莉子] 当前战斗节点未击败 → 后续不解锁（必须打败该节点敌人才解锁下一段）
    // [2026-10-10 莉莉子 · 第 4 轮独立审查修复 · BUG5 残项] **待战节点也算"没打完的战斗"**：
    //   事件把它登记成待战后，它的 `type` 仍是 `'event'`，此前这里三个类型判据都不认它
    //   ⇒ 玩家可以**直接往前走**；一走，该节点就进 `visited`（`getNodeState` 返回 `'missed'`）
    //   ⇒ 节点再也点不动，而 `pendingBattles` 永久残留、地图上却还渲染成「精英」。
    //   现在待战未清 ⇒ 后续不解锁，逼玩家先打掉这一场（与"必须打败才解锁"同一口径；
    //   打赢后 App 会 `clearPendingBattle`，封锁自动解除）。
    const curEntryNode = nodeById.get(run.currentNodeId ?? '');
    const isPendingBattleHere = !!run.currentNodeId && !!run.pendingBattles?.[run.currentNodeId];
    const isCombatBlocked = !!curEntryNode
        && (isPendingBattleHere
            || curEntryNode.type === 'battle' || curEntryNode.type === 'elite' || curEntryNode.type === 'boss')
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
                        if (!dragRef.current.moved && e.target === canvasRef.current) { eventBus.emit(GameEvents.UI_BACK);
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
                                // [2026-10-08 莉莉子 · 瓦尔基里大赛] 该节点已登记「待战」⇒ 渲染成战斗节点
                                pendingBattle={!!run.pendingBattles?.[node.id]}
                                // [2026-10-09 莉莉子 · 随机节点] 开局预掷的真身**不在地图上公开** ⇒ 渲染成「未知」
                                // [2026-10-10 程实测] 与预览面板**同口径**：站上去（＝当前节点）就算已揭示 ——
                                //   否则地图图标写着「？？？」，右键面板却已经报出真身，两处互相打架
                                unrevealed={!!node.wasRandom && node.id !== run.currentNodeId}
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
                        onClick={() => { eventBus.emit(GameEvents.UI_CLICK); setDrawerOpen(true); }}
                        title="查看牌组与迷宫强化"
                        style={{ width: MAP_BTN.avatarSize, height: MAP_BTN.avatarSize }}
                        className="rounded-full overflow-hidden border-2 border-white/70 ring-2 ring-purple-500/60 shadow-[0_0_24px_rgba(168,85,247,0.5)] shrink-0 cursor-pointer hover:scale-105 hover:ring-purple-400 transition-all"
                    >
                        <CroppedAvatar cardKey={run.heroKey} className="w-full h-full rounded-full" />
                    </button>
                    {/* [2026-08-10] information 提示徽标：头像右下角，提示可点击查看，点击同样打开抽屉 */}
                    <span
                        onClick={() => { eventBus.emit(GameEvents.UI_CLICK); setDrawerOpen(true); }}
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
                        <span className="flex items-center gap-1.5 text-sm font-bold text-white">
                            <RotateCcw size={14} className="text-green-300" />
                            {/* [2026-10-04 程拍板] key = 数值 ⇒ 复活次数一变就重放一次「放大 + 绿闪」，
                                让「消耗 1 次」/「宝箱补回」在地图上**看得见**（此前数字是静默跳变的） */}
                            <motion.span
                                key={run.reviveCount}
                                initial={{ scale: 1.5, color: '#4ade80' }}
                                animate={{ scale: 1, color: '#ffffff' }}
                                transition={{ type: 'spring', stiffness: 320, damping: 18 }}
                                className="inline-block tabular-nums"
                            >{run.reviveCount}</motion.span>
                        </span>
                    </div>
                    {/* [2026-10-05 莉莉子 · 方案 P3] **跨节点效果的常驻提示**（投资 / 未来敌人强化）
                        —— 这两类效果原本只能靠玩家自己记得；兑现后徽章自动消失 */}
                    {(run.pendingInvestments?.length ?? 0) > 0 && (
                        <div className="flex flex-wrap gap-1.5 pt-1.5 mt-0.5 border-t border-white/10">
                            {run.pendingInvestments!.map((inv, i) => (
                                <span key={i} className="flex items-center gap-1 text-[11px] font-bold text-emerald-300 bg-emerald-500/10 border border-emerald-400/30 rounded-md px-1.5 py-0.5">
                                    🌱 {inv.kind === 'battleWinGold'
                                        ? `战斗胜利 +${inv.value ?? 0} 金`
                                        : inv.kind === 'restHeal'
                                            ? `休息回血 ×${inv.value ?? 2}`
                                            : '强化品质 +1'}
                                </span>
                            ))}
                        </div>
                    )}
                    {!!run.pendingFightDebuff && run.pendingFightDebuff.fights > 0 && (
                        <div className="flex items-center gap-1 text-[11px] font-bold text-amber-300 bg-amber-500/10 border border-amber-400/30 rounded-md px-1.5 py-0.5 mt-0.5">
                            ⚠️ 敌人强化 {run.pendingFightDebuff.fights} 场 · 水晶 +{run.pendingFightDebuff.enemyHpBonus}
                        </div>
                    )}
                </div>
            </div>

            {/* 返回（[2026-08-26] 实心按钮；[2026-08-28] 触发 App 的「结算/暂离」二次确认） */}
            <button
                onClick={() => { eventBus.emit(GameEvents.UI_BACK); onBackRequest(); }}
                style={{ padding: MAP_BTN.btnPadding }}
                className="absolute top-3 left-3 z-40 rounded-full bg-slate-800 hover:bg-slate-700 border border-white/15 hover:border-white/40 transition-all"
            >
                <ArrowLeft size={MAP_BTN.btnIcon} className="text-white" />
            </button>

            {/* [2026-08-26 莉莉子] 右侧：缩放（加/减，功能同鼠标滚轮）+ 定位当前节点（纸飞机）；实心按钮 */}
            <div className="absolute right-6 top-1/2 -translate-y-1/2 z-40 flex flex-col items-center gap-2">
                <button onClick={() => { eventBus.emit(GameEvents.UI_CLICK); handleZoomIn(); }} title="放大" style={{ padding: MAP_BTN.btnPadding }} className="rounded-full bg-slate-800 hover:bg-slate-700 border border-white/15 hover:border-white/40 transition-all">
                    <Plus size={MAP_BTN.btnIcon} className="text-white" />
                </button>
                <button onClick={() => { eventBus.emit(GameEvents.UI_CLICK); handleZoomOut(); }} title="缩小" style={{ padding: MAP_BTN.btnPadding }} className="rounded-full bg-slate-800 hover:bg-slate-700 border border-white/15 hover:border-white/40 transition-all">
                    <Minus size={MAP_BTN.btnIcon} className="text-white" />
                </button>
                <button onClick={() => { eventBus.emit(GameEvents.UI_CLICK); handleLocateCurrent(); }} title="定位到当前位置" style={{ padding: MAP_BTN.btnPadding }} className="mt-2 rounded-full bg-purple-600 hover:bg-purple-500 border border-purple-400 transition-all">
                    <Send size={MAP_BTN.btnIcon} className="text-white" />
                </button>
            </div>

            {/* [2026-10-02 莉莉子 BUG修复 #17] 右上角：待开匣子 / 评估嘉勉入口
                —— 卡包抽到匣子后，局中必须**有个地方能去开**（此前只有肉鸽大厅有入口）。
                角标 = 待打开卡包 + 待打开匣子 的总数，有货才亮起，一眼看得见。 */}
            {onOpenEvaluation && (
                <div className="absolute top-3 right-3 z-40">
                    <button
                        onClick={() => { eventBus.emit(GameEvents.UI_CLICK); onOpenEvaluation(); }}
                        title="评估嘉勉 · 开启待打开卡包 / 奖励匣"
                        className={`relative flex items-center gap-2 rounded-full border pl-3.5 pr-4 py-2 backdrop-blur-sm transition-all ${
                            ((pendingPacks ?? 0) + (pendingChests?.length ?? 0)) > 0
                                ? 'bg-amber-500/25 border-amber-300/70 hover:bg-amber-500/40 shadow-[0_0_22px_rgba(250,204,21,0.45)]'
                                : 'bg-slate-800/90 border-white/15 hover:border-white/40'
                        }`}
                    >
                        <Package size={18} className={((pendingPacks ?? 0) + (pendingChests?.length ?? 0)) > 0 ? 'text-amber-200' : 'text-white'} />
                        <span className={`text-sm font-black tracking-wider ${((pendingPacks ?? 0) + (pendingChests?.length ?? 0)) > 0 ? 'text-amber-100' : 'text-white'}`}>
                            评估嘉勉
                        </span>
                        {((pendingPacks ?? 0) + (pendingChests?.length ?? 0)) > 0 && (
                            <span className="min-w-5 h-5 px-1 rounded-full bg-orange-500 border-2 border-slate-900 text-[10px] font-black text-white flex items-center justify-center">
                                {(pendingPacks ?? 0) + (pendingChests?.length ?? 0)}
                            </span>
                        )}
                    </button>
                </div>
            )}

            {/* [2026-10-10 莉莉子 开发者 · 事件审阅台] 地图端入口（放在「评估嘉勉」下方 top-16，避免两个按钮挤在一起）。
                为什么必须单独有它：事件弹窗一旦关闭（点「继续」/「确定」），该节点已被 `markNodeResolved` 记成"用掉"，
                而 `handleNodeClick` 对当前节点直接 return、`NodePreviewPanel` 在 resolved 后也不给「进入」按钮
                ⇒ **弹窗外没有任何原生路径能重新打开它**（这就是原先在 `doEnterNode` 开旁路属于死代码的原因）。
                只在站在事件节点上时出现：回滚锚点即"刚进这个节点那一刻"，站别处点它没有意义。 */}
            {isDev && onDevRestoreRun && currentIsEventNode && (
                <div className="absolute top-16 right-3 z-40">
                    <button
                        onClick={() => {
                            // 补锚点：覆盖"从未打开过事件弹窗"与"地图重挂载后 ref 丢失"两种情形。
                            // ⚠️ 这里补出来的锚点是**当前状态**；若此前已在本节点结算过，它就带着那次结算的结果
                            //   ⇒ 列表窗口会把这个锚点的数值显示出来，让"会回滚到哪"成为可见事实，而不是一句假设。
                            ensureDevEventSnapshot();
                            setDevPickerOpen(true);
                        }}
                        title="开发者：事件审阅台 —— 任意切换事件重新体验（切换时整局状态回滚到进入本节点那一刻）"
                        className="flex items-center gap-2 rounded-full border border-violet-300/50 bg-violet-600/30 hover:bg-violet-600/60 backdrop-blur-sm pl-3.5 pr-4 py-2 text-violet-100 transition-all"
                    >
                        <ListChecks size={18} />
                        <span className="text-sm font-black tracking-wider">事件审阅</span>
                    </button>
                </div>
            )}

            {/* 节点事件弹窗 */}
            {eventModal && (
                <NodeEventModal
                    // [2026-10-10 莉莉子 开发者] 切换事件后 devEventSeq/currentEvent 变化 ⇒ 重挂载 ⇒ 内部步骤复位回「选择」
                    //   （普通流程下这两个值稳定 ⇒ key 稳定 ⇒ 行为零变化）
                    key={`${eventModal}_${currentEvent?.id ?? ''}_${devEventSeq}`}
                    type={eventModal}
                    hp={run.hp}
                    maxHp={run.maxHp}
                    onRest={withResolve(onRest)} // [2026-10-05 · 方案 P1] 休整回血 ⇒ 记"用完"
                    onEnhance={withResolve(onEnhance)} // [2026-10-05 · 方案 P1] 选定强化 ⇒ 记"用完"
                    enhanceOptions={enhanceOptions}
                    onClose={() => setEventModal(null)}
                    run={run}
                    event={currentEvent ?? undefined}
                    onEvent={onEvent} // [2026-08-28 事件]（App.handleRogueEvent 内部已记账）
                    onEventFight={onEventFight} // [2026-10-08 · 批次3] 迎战按钮（结果步骤里）
                    onEventDeep={onEventDeep} // [2026-10-05 · 方案 P4 §3] 深层回响结算
                    onRefresh={handleEnhanceRefresh} // [2026-08-29] 强化三选一刷新
                    refreshCount={run.refreshCount}  // [2026-08-29] 剩余刷新次数
                    onRemoveCard={withResolve(onRestRemove)} // [2026-08-29] 休整·净化删卡 ⇒ 记"用完"
                    onAddCard={withResolve(onRestCopy)}      // [2026-08-29] 休整·复制卡 ⇒ 记"用完"
                    onStartScout={withResolve(onRestScout)}  // [2026-08-29] 休整·探路 ⇒ 记"用完"
                    // [2026-08-31 莉莉子 开发者] 任意选强化
                    isDev={isDev}
                    devPlayerPool={PLAYER_ENHANCEMENTS}
                    devEnemyPool={ENEMY_ELIGIBLE_BUFFS}
                    ownedEnhancements={run.enhancements}
                    onDevPick={onDevPick}
                    // [2026-10-10 莉莉子 开发者 · 事件审阅台] 传了才在事件分支右上角渲染「事件列表」按钮
                    //   （非开发者 / 没透传 restoreRun ⇒ undefined ⇒ 按钮整体不存在）
                    onOpenDevEventPicker={isDev && onDevRestoreRun ? () => setDevPickerOpen(true) : undefined}
                />
            )}

            {/* [2026-10-10 莉莉子 开发者 · 事件审阅台] 事件列表窗口。
                z-[900] > 事件弹窗 z-[700]，所以能从弹窗里直接点开并盖住它。
                选中事件 → devSwitchEvent（回滚整局状态 + 换事件 + 复位弹窗步骤）。 */}
            {devPickerOpen && isDev && (
                <DevEventPickerModal
                    events={ROGUE_EVENTS}
                    currentId={currentEvent?.id}
                    anchor={devAnchor} // [2026-10-10] 回滚目标数值（无锚点则 null ⇒ 窗口如实提示"不会回滚"）
                    onPick={devSwitchEvent}
                    onClose={() => setDevPickerOpen(false)}
                />
            )}

            {/* [2026-08-12 商店经济] 商店弹窗 */}
            {shopOpen && shopStock && (
                <ShopModal
                    run={run}
                    stock={shopStock}
                    initialPurchased={shopPurchased} // [2026-10-08 · 批次3] 回头再进时「已购」不丢
                    availableTabs={shopTabsRef.current[run.currentNodeId ?? ''] ?? ['card', 'enhancement', 'equipment', 'remove']}
                    // [2026-10-08 莉莉子 · 交互回响层 批次3] **撤掉 withResolve**（不再把商店节点标记"用尽"）：
                    //   防刷改由"按节点缓存库存 + 已购"承担 —— 回头能买，但内容不重随、已购不能重买
                    onBuyCard={onBuyCard}
                    onBuyEnhancement={onBuyEnhancement}
                    onBuyEquipment={onBuyEquipment}
                    onRemoveCard={onRemoveCard}
                    onRefresh={onShopRefresh}
                    onStateChange={(s) => { if (run.currentNodeId) shopNodeCacheRef.current[run.currentNodeId] = s; }}
                    onClose={() => setShopOpen(false)}
                />
            )}

            {/* [2026-08-12 宝箱节点] 宝箱弹窗 */}
            {treasureOpen && (
                <TreasureModal
                    run={run}
                    onCollectGold={withResolve(onTreasureGold)}          // [2026-10-05 · 方案 P1] 五种领奖任一 ⇒ 记"用完"
                    onPickCard={withResolve(onTreasureCard)}
                    onPickEnhancement={withResolve(onTreasureEnhancement)}
                    onSacrificeForEpic={withResolve(onTreasureSacrifice)}
                    onCollectRandom={withResolve(onTreasureRandom)}
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
                <RunEndModal run={run} runEnd={runEnd} pendingPacks={pendingPacks} onOpenPack={onOpenPack}
                    pendingChests={pendingChests} onOpenChest={onOpenChest} onShardDrop={onShardDrop}
                    onOpenAllChests={onOpenAllChests} armamentStock={armamentStock}
                    onConfirm={onRunEndConfirm} />
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
                    // [2026-10-10 莉莉子 BUG修复 · 程实测] **待战节点：直接开打**（事件结算时登记的那场仗）。
                    //   ⚠️ 必须放在下方 `resolvedNodes` 检查**之前** —— 事件做出选择时该节点已被记为"用掉"，
                    //     先查 resolved 会把这条路挡死（与 `doEnterNode` 里同款顺序，见其 `pendingBattles` 分支）。
                    if (run.pendingBattles?.[n.id]) { onEventFight?.(); return; }
                    // [2026-10-05 莉莉子 · 方案 P1] **该节点的服务/奖励已用掉 ⇒ 右键不再能进入**（防刷取）
                    //   覆盖事件/强化/休整/宝箱/商店 —— 地图单向不可回退，这里就是唯一的重入路径。
                    // ⚠️ [2026-10-10 莉莉子 · 事件审阅台] 同上：不为开发者开旁路（本回调的「进入」按钮在 resolved 后
                    //   由 `NodePreviewPanel` 直接不渲染 ⇒ 开了也够不到）。开发者重开路径 = 地图右上角「事件审阅」。
                    if (resolvedNodeSet.has(n.id)) {
                        console.warn(`[RogueMap] 节点 ${n.id}(${n.type}) 已完成，右键「进入」已禁用`);
                        return;
                    }
                    // 当前非敌人节点互动：复用地图左键的互动路径（rest→休整弹窗 / enhance→生成3选1 / shop→商店弹窗 / event/treasure→占位弹窗）
                    if (n.type === 'enhance') setEnhanceOptions(getEnhanceOptionsFor(n.id)); // [2026-10-05] 按节点缓存（防"关掉再开"免费重抽）
                    if (n.type === 'shop') {
                        openShop(n); // [2026-08-28] 重复开窗页签不变（进入节点时已固定）
                        return;
                    }
                    if (n.type === 'treasure') {
                        setTreasureOpen(true);
                        return;
                    }
                    if (n.type === 'event') { // [2026-08-28 事件] 重复进事件节点：抽事件（一局内去重）· [2026-10-09] 指定固定事件则必出
                        setCurrentEvent(rollEvent(n));
                        setEventModal('event');
                        return;
                    }
                    // [安全窄化] NodePreviewPanel 保证此回调只在非战斗节点触发（battle/elite/boss 走 onBattle）
                    // [2026-10-10 程实测 BUG修复] **不再依赖那句"保证"，把它落成显式分支**：
                    //   随机节点曾绕过该保证（掩码令 `isCombat` 判 false ⇒ 面板给的是「进入」而不是「战斗」）
                    //   ⇒ `battle` 被强转塞进事件弹窗 ⇒ 它的 `TITLES` 表里没有这个键 ⇒ `meta.icon` 白屏崩溃。
                    //   即使将来还有别的路径漏进来，这里也不会再把战斗类型交给事件弹窗。
                    if (n.type === 'battle' || n.type === 'elite' || n.type === 'boss') {
                        onBattle(n.type, n.enemyArchetypeId, n.id, n.enemyBuffs);
                        return;
                    }
                    setEventModal(n.type as Exclude<RogueNodeType, 'battle' | 'elite' | 'boss'>);
                }}
            />

            {/* [2026-08-27 莉莉子] 节点进入方形面板：点击节点正上方弹出，点「前往」才移动+走进 */}
            {/* [2026-10-10 程实测 BUG修复] **随机节点在这里也必须掩码**：
                此前只有"地图图标"与"右键预览面板"做了掩码，这块**点节点弹出的进入面板**漏了 ⇒
                随机掷出的真身（是战斗？是事件？对手是谁？）会被提前报出来 —— 正是程说的"提前暴露节点信息"。
                本面板出现在**「前往」之前** ⇒ 一律用占位文案（与 `mapLayout.RANDOM_NODE_*` 同源）。 */}
            {entryNode && (
                <NodeEntryModal
                    key={entryNode.id}
                    pos={entryPos}
                    bg={entryBg}
                    title={entryNode.wasRandom
                        ? RANDOM_NODE_NAME
                        : ((entryNode.type === 'battle' || entryNode.type === 'elite' || entryNode.type === 'boss')
                            ? (entryNode.enemyArchetypeId ? ENEMY_ARCHETYPES[entryNode.enemyArchetypeId]?.name ?? NODE_INFO[entryNode.type].title : NODE_INFO[entryNode.type].title)
                            : NODE_INFO[entryNode.type].title)}
                    desc={entryNode.wasRandom
                        ? RANDOM_NODE_DESC
                        : ((entryNode.type === 'battle' || entryNode.type === 'elite' || entryNode.type === 'boss')
                            ? (entryNode.enemyArchetypeId ? ENEMY_ARCHETYPES[entryNode.enemyArchetypeId]?.description ?? NODE_INFO[entryNode.type].desc : NODE_INFO[entryNode.type].desc)
                            : NODE_INFO[entryNode.type].desc)}
                    onEnter={() => handleEntryEnter(entryNode)}
                />
            )}
        </div>
    );
};
