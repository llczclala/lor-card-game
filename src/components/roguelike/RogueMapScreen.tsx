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

// ═══════════════════════════════════════════════════════════════════════════
// [2026-10-17 莉莉子 · 安卓触屏] 地图触屏手势调参区 —— 程要调手感就改这里
//   ⚠️ 速度/阈值类参数分两种量纲，**别混**：
//      · **布局 px** = 游戏画布坐标。地图原始尺寸 `MAP_WIDTH = 3168`（`mapLayout.ts:681`），
//        经 ScaleWrapper 以 `scale = min(屏宽/1680, 屏高/1050)` 缩放（`ScaleWrapper.tsx:21-26`）
//        铺到设备 ⇒ **布局 px = 屏幕 px ÷ scale**。
//      · 本 App 锁横屏（AndroidManifest `sensorLandscape`）：手机 scale ≈ 1.0~1.1 ⇒ 两者近乎 1:1；
//        平板 scale 可到 ~1.5 ⇒ 布局 px 比屏幕 px 小。
//   ⇒ 惯性速度对 scale 是**不变量**（同一次滑动量到的布局速度 × scale = 屏幕速度），按"几屏/秒"调即可；
//     只有"跟浏览器的 tap slop 比大小"时必须换算，所以拖拽阈值**分鼠标/触摸两套**（见下）。
// ═══════════════════════════════════════════════════════════════════════════
const MAP_TOUCH = {
    /** **鼠标**拖拽阈值（布局 px，欧几里得）：与改动前的硬编码 6 逐字节一致 ⇒ PC 手感零变化 */
    dragThresholdPx: 6,
    /**
     * **触摸**拖拽阈值（**屏幕 px**，切比雪夫）。为什么必须单独一套：
     *   `touch-action` 只是让浏览器不再接管手势，**它仍会把小位移当 tap 补发 click**（安卓 slop ≈ 8px）。
     *   若应用判"拖拽"比浏览器判"tap"更早，中间就有死带 —— 应用把 click 抑制掉、浏览器却已补发它
     *   ⇒ 实测表现是「**手指略抖地点节点，毫无反应**」。
     *   ⇒ 与全项目同口径：**8 屏幕 px、切比雪夫**（`touchGaze.ts:33` / `GameSession.tsx:1311`）。
     */
    dragThresholdScreenPx: 8,
    /** 惯性：抬手起飞的最低速度。1.0 ≈ 一秒划过半个屏幕宽。调大 = 要甩很快才滑；调小 = 轻推就滑 */
    flingMinSpeed: 1.0,
    /** 惯性：每 16.67ms 的速度保留系数（越小停得越快）。
     *  停下来的时长按 τ·ln(v0/flingStopSpeed) 算（τ = 16.67/|ln 0.92| ≈ 200ms）：
     *  v0=1.0（刚过阈值）≈ **0.6s** · v0=3 ≈ **0.8s** · 用力甩 ≈ **1.0s**（原注释写"0.4~0.6 秒"偏乐观） */
    flingFriction: 0.92,
    /** 惯性：速度低于它就停 */
    flingStopSpeed: 0.05,
    /** 惯性：单帧最大位移 —— 掉帧时防止"跳一大段" */
    flingMaxStepPx: 80,
    /** 惯性：速度平滑系数（0~1，越大越"只看最近这一帧"）。0.4 ⇒ 手指停住后速度迅速掉下来，不会"手停了还在飞" */
    flingVelocityAlpha: 0.4,
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
    const dragRef = useRef({ startX: 0, startY: 0, startCx: 0, startCy: 0, panX: 0, panY: 0, active: false, moved: false });
    const suppressClickRef = useRef(false); // [2026-08-10] 拖拽松手后抑制误触 click
    /**
     * [2026-10-17 第 2 轮独立审查 F2] **"上一次手势不是一次纯粹的轻点"** —— 专门给画布那条
     * "空白点击"闸门用（见画布 `onClick`）。为什么要单独立一个字段、而不复用 `dragRef.moved`：
     *   `moved` 的职责是"本次拖拽是否已起手"（触屏上接管平移时要**重新累计阈值** ⇒ 必须能归零），
     *   而闸门要的是"这次手势**整体**算不算点击"（跨 `pointerup`→`click` 两个事件、**必须留到下一次按下**）。
     *   一个字段扛两个相反的要求，就必然出现"接管分支把它归零 ⇒ 闸门失效"或反过来"闸门对了 ⇒ 拖拽起不来"。
     *   ⇒ 拆开：`moved` 归零自由，`nonTap` 的唯一复位点是**下一次 `onPointerDown`**。
     */
    const nonTapRef = useRef(false);

    // ── [2026-10-17 莉莉子 · 安卓触屏] 多指 / 惯性状态 ─────────────────────
    /** 当前按在地图上的指针（pointerId → **布局坐标 x/y + 屏幕坐标 cx/cy**）。
     *  两种坐标都要：位移与 pan 用布局坐标，而"跟浏览器 tap slop 比大小"必须用屏幕坐标。 */
    const pointersRef = useRef<Map<number, { x: number; y: number; cx: number; cy: number }>>(new Map());
    /** 捏合会话：起手双指距离 / 缩放平移快照 + 被钉住的地图锚点 */
    const pinchRef = useRef<{ startDist: number; startZoom: number; anchorX: number; anchorY: number } | null>(null);
    /** 惯性：最近一次采样点与滑动平均速度（布局 px/ms） */
    const flingSampleRef = useRef<{ x: number; y: number; t: number; vx: number; vy: number } | null>(null);
    /** 惯性：正在跑的 rAF 帧（卸载 / 新按下 / 捏合都要能把它掐掉） */
    const flingRafRef = useRef<number | null>(null);

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

    // ═══════════════════════════════════════════════════════════════════════
    // [2026-10-17 莉莉子 · 安卓触屏 B+C] 手势核心：拖拽不断线 + 抬手惯性 + 双指捏合
    //
    //  ① 拖拽断线的根因（✅ 代码证据）：地图视口**没有** `touch-action`，而同一个病根本仓库
    //     已修过两次（`Battlefield.tsx:56-65` 从战场起手的拖拽 / `CardAnimations.tsx:434-439` 手牌区）。
    //     缺它 ⇒ 安卓把这次触摸判成浏览器滚动/手势并派发 `pointercancel`
    //     ⇒ 视口的 `onPointerCancel` 直接收摊 ⇒ **地图只动一下就死**。
    //  ② ⚠️ 与 `规范-界面调参区.md`「touch-action 别全局加，靠横向拖动看内容的容器不能加」不冲突。
    //     ⚠️【第 2 轮独立审查 F10 更正前提】原先我写的是"地图根本不靠浏览器滚动"——**这句是错的**：
    //      视口是 `absolute inset-0 overflow-hidden`，装在 1680×1050 的盒子里，而画布是 **3168×1344**
    //      ⇒ **视口自己就是一个带 1488×294 布局溢出的滚动容器**，浏览器的 scroll chain 正好终结在它身上。
    //      这是"为什么祖先全 overflow:hidden 仍会被接管"的真正答案。（`overscroll-behavior` 在这里不够。）
    //     那条手册规矩防的是"掐死浏览器自己的横滚"，而地图的平移/缩放**由下面这套 pointer 逻辑自实现**
    //     ⇒ 这里 `none` 正是掐掉这次接管的正确手段。**别改回 pan-y**：初始缩放下纵向确有 ~294px 真实溢出，
    //     给了 pan-y 就等于把竖直拖动交还浏览器 ⇒ 地图上下拖不动。
    //  ③ 惯性只对**非鼠标指针**开：按事件自身的 `e.pointerType` 判，**不用设备类别**
    //     （同 `TouchFeedbackLayer.tsx:148-151` 的既有口径 —— 那边专门否掉过 `pointer: coarse`，
    //      因为"触屏设备 + 外接鼠标"会让鼠标也吃到触屏逻辑，反过来触屏笔记本又吃不到）。
    //     ⇒ PC 鼠标抬手即停是既有手感，按"PC 零回归"不参加；安卓外接鼠标不甩、`coarse=false` 的触屏本也能甩。
    //  ④ 捏合只在真的有两根指针时生效 ⇒ 鼠标（单指针）天然进不去这条分支。
    // ═══════════════════════════════════════════════════════════════════════

    /** 停掉惯性滑行。任何"用户要重新掌控"的时刻（新按下 / 捏合 / 点缩放·定位按钮 / 卸载）都必须先调它 */
    const stopFling = useCallback(() => {
        if (flingRafRef.current !== null) {
            cancelAnimationFrame(flingRafRef.current);
            flingRafRef.current = null;
        }
        flingSampleRef.current = null;
    }, []);

    // 卸载时把惯性动画掐掉（否则 rAF 会在组件消失后继续改已卸载节点的 transform）
    useEffect(() => () => {
        if (flingRafRef.current !== null) {
            cancelAnimationFrame(flingRafRef.current);
            flingRafRef.current = null;
        }
    }, []);

    /**
     * [2026-10-17 莉莉子 · 独立审查 A3/A10] 切后台 / 失焦 ⇒ **收摊**。
     * ⚠️ 这不是锦上添花：`pointerup` 在来电 / 下拉通知 / 分屏 / 切后台时**可能永远不到**，
     *   残留的 `pointersRef` 项会让下一次**单指按下也满足 `size>=2` 直接走捏合**（地图从此拖不动）。
     *   同 `TouchFeedbackLayer.tsx:352-354` 的既有约定（那边也挂了 `blur` + `visibilitychange`）。
     */
    useEffect(() => {
        const reset = () => {
            pointersRef.current.clear();
            pinchRef.current = null;
            dragRef.current.active = false;
            stopFling();
        };
        window.addEventListener('blur', reset);
        document.addEventListener('visibilitychange', reset);
        return () => {
            window.removeEventListener('blur', reset);
            document.removeEventListener('visibilitychange', reset);
        };
    }, [stopFling]);

    /** 双指中点 + 距离（布局坐标）；不足两指返回 null */
    const twoPointerMetrics = () => {
        const pts = Array.from(pointersRef.current.values());
        if (pts.length < 2) return null;
        const [a, b] = pts;
        return {
            dist: Math.hypot(a.x - b.x, a.y - b.y),
            midX: (a.x + b.x) / 2,
            midY: (a.y + b.y) / 2,
        };
    };

    /** 第二根手指落下 ⇒ 进入捏合会话：把"起手中点下方的地图坐标"钉住，全程锚定它。
     *  ⚠️ 第三根手指**不再重建会话**（由 `onPointerDown` 判 `pinchRef` 拦掉），否则锚点会跳。 */
    const beginPinch = () => {
        const m = twoPointerMetrics();
        if (!m || m.dist <= 0) return;
        stopFling();                      // 捏合与惯性互斥
        dragRef.current.active = false;   // 拖拽让位给捏合（否则两套逻辑同时改 pan）
        // [F2] 捏合整体算"非点击"：尾随 click 不该被画布闸门当成空白点击。
        //   ⚠️ 用 `nonTapRef` 而**不是** `dragRef.moved` —— 后者在接管分支必须能归零（要重新累计阈值）。
        nonTapRef.current = true;
        pinchRef.current = {
            startDist: m.dist,
            startZoom: zoomRef.current,
            anchorX: (m.midX - panRef.current.x) / zoomRef.current,
            anchorY: (m.midY - panRef.current.y) / zoomRef.current,
        };
    };

    /** 捏合每帧：缩放 + 跟随双指中点（等于"边捏边平移"）。
     *  用「起手快照 + 当前比值」一次算到位，不做增量累乘 ⇒ 不会有累积误差与漂移。 */
    const applyPinch = () => {
        const p = pinchRef.current;
        const vp = viewportRef.current;
        const m = twoPointerMetrics();
        if (!p || !vp || !m || p.startDist <= 0) return;
        const minZoom = Math.max(vp.clientWidth / MAP_WIDTH, vp.clientHeight / MAP_HEIGHT);
        const next = Math.max(minZoom, Math.min(MAX_ZOOM, p.startZoom * (m.dist / p.startDist)));
        zoomRef.current = next;
        panRef.current.x = m.midX - p.anchorX * next;
        panRef.current.y = m.midY - p.anchorY * next;
        clampPan();
        applyTransform();
    };

    /** 抬手接力惯性：按摩擦衰减继续推 pan，撞边或速度耗尽即停 */
    const startFling = () => {
        stopFling(); // [F7] 防御性：保证任何时刻只有一条 rAF 链（否则旧链会失去句柄 ⇒ 按不住、卸载也取消不掉）
        const s = flingSampleRef.current;
        if (!s) return;
        let vx = s.vx;
        let vy = s.vy;
        if (Math.hypot(vx, vy) < MAP_TOUCH.flingMinSpeed) { flingSampleRef.current = null; return; }
        let last = performance.now();
        const step = (now: number) => {
            const dt = Math.min(48, now - last); // 掉帧保护：卡一帧也不会瞬移一大段
            last = now;
            const k = Math.pow(MAP_TOUCH.flingFriction, dt / 16.67);
            vx *= k;
            vy *= k;
            const cap = MAP_TOUCH.flingMaxStepPx;
            const beforeX = panRef.current.x;
            const beforeY = panRef.current.y;
            panRef.current.x += Math.max(-cap, Math.min(cap, vx * dt));
            panRef.current.y += Math.max(-cap, Math.min(cap, vy * dt));
            clampPan();
            applyTransform();
            // 撞边 ⇒ 该轴速度归零，另一轴继续滑（斜着甩到角上不会整只僵住）
            if (panRef.current.x === beforeX) vx = 0;
            if (panRef.current.y === beforeY) vy = 0;
            if ((vx === 0 && vy === 0) || Math.hypot(vx, vy) < MAP_TOUCH.flingStopSpeed) {
                flingRafRef.current = null;
                flingSampleRef.current = null;
                return;
            }
            flingRafRef.current = requestAnimationFrame(step);
        };
        flingRafRef.current = requestAnimationFrame(step);
    };

    /** 手势收尾：把这一根指针出表、按当前剩余指针数复位会话。
     *  ⚠️【第 2 轮独立审查】它**不只**"记账" —— 还会复活 `active`（接管分支）与改写基线。
     *   原先的注释写"只记账…不产生惯性"，与行为不符（`abortGesture` 经它也会复活 `active`）⇒ 已改正。 */
    const endGesture = (pointerId: number) => {
        pointersRef.current.delete(pointerId);
        const wasPinch = pinchRef.current !== null;
        if (pointersRef.current.size < 2) pinchRef.current = null;
        // [2026-10-17] 捏合中抬起一根 ⇒ 让余下那根**就地接管平移**，否则第二根手指一直按着却"拖不动"。
        //   起点取它**当前**坐标、pan 取**当前**值 ⇒ 接管瞬间位移为 0，不会跳。
        if (wasPinch && pointersRef.current.size === 1) {
            const [left] = Array.from(pointersRef.current.values());
            dragRef.current = {
                startX: left.x, startY: left.y,
                startCx: left.cx, startCy: left.cy,
                panX: panRef.current.x, panY: panRef.current.y,
                active: true,
                moved: false, // 重新累计阈值（这只影响"平移何时起手"）——见下方 nonTap 说明
            };
            nonTapRef.current = true; // [F2] 但**这次手势整体仍算"非点击"**：捏过就不是轻点，闸门与节点点击都不该响应
            flingSampleRef.current = { x: left.x, y: left.y, t: performance.now(), vx: 0, vy: 0 };
            return;
        }
        // 🔴 [F1] 三指场景：抬掉"捏合对中的一根"后 `size` 仍 ≥2，此时**必须按当前这一对重新快照**。
        //   否则 `twoPointerMetrics()` 取的是插入序前两个（已经换了一对），却拿旧的 `startDist`/anchor 去除
        //   ⇒ `next = startZoom × |新对| / |旧对|`，一帧内缩放跳到 MAX_ZOOM、位置同时跳，且**无法自愈**。
        //   重新快照用的是**当前** pan/zoom，当帧连续 ⇒ 不跳。
        if (pinchRef.current && pointersRef.current.size >= 2) { beginPinch(); return; }
        dragRef.current.active = false;
        // 捏合整体收尾 ⇒ 这次手势不是点击：闸门（nonTap）+ 节点点击（suppressClick）两道都挡住。
        if (wasPinch) {
            nonTapRef.current = true;
            suppressClickRef.current = true;
            setTimeout(() => { suppressClickRef.current = false; }, 120);
        }
        // ⚠️【F2】`moved` 在这里**已经不需要**保持残留了 —— 跨事件的闸门改由 `nonTapRef` 承担
        //   （旧写法的注释说"moved 的唯一复位点是下一次按下"是**权宜之计**，它让接管分支无法归零 `moved`）。
        if (pointersRef.current.size === 0) flingSampleRef.current = null;
    };

    // 初始视角：默认放大视口（无黑边下限 × 放大倍数），画面中心对准当前所处节点（战斗返回地图不再回默认位置）
    useEffect(() => {
        const viewport = viewportRef.current;
        if (!viewport) return;
        stopFling(); // [2026-10-17] 换 Act / 重挂载是"重新摆视角"⇒ 先掐掉上一段滑行，别和它抢 pan
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
    }, [applyTransform, clampPan, stopFling, run.act, layout]);

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
        stopFling(); // [2026-10-17] 用户开始缩放 ⇒ 先掐掉滑行，否则"一边缩一边还在滑"
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
    }, [clampPan, applyTransform, stopFling]);

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
        // [2026-10-17] 触屏的 `button` 恒为 0 ⇒ 这条判据天然放过手指，无需改
        if (e.button !== 0) return;
        // [2026-08-10 修复] 根因：原先无条件 setPointerCapture，指针捕获会把节点 click 事件重定向到视口层，
        // 导致点击节点（移动不触发）。现在只记录起点，等确认是"拖拽"（位移超阈值）才捕获。
        stopFling(); // [2026-10-17] 手指落下 ⇒ 立刻停住滑行，否则"想按住"按不住（C 的跟手前提）
        // 🔴 [2026-10-17 独立审查 F2] **活性对账：一次 primary 按下 = 上一轮手势已经结束。**
        //   安卓 WebView 会丢 `pointerup` / `pointercancel`（本仓库已记过同族事故：
        //   `GameSession.tsx:1265-1274`「有一个没到 ⇒ 永久停在 true」，修法就是"新手势先归零"）。
        //   不清残留项的话：`pointersRef` 会**永远 ≥2** ⇒ 之后**单指按下也满足 `size>=2` 直接走捏合**
        //   ⇒ 押下不动、地图完全不动，且抬手只删新 id ⇒ **永久卡死、无法自愈**（只能退出地图重进）。
        //   `isPrimary` 为真 ⇒ 这是新一轮手势的第一根指针（第二根手指恒为 false，不会误清正在捏合的会话）。
        // [F5] 活性对账**只对非鼠标指针**做。原写法对所有 pointerType 清表 ⇒ 鼠标/笔几乎恒为
        //   `isPrimary`，"安卓平板外接鼠标、一指正在拖或双指正在捏"时按一下鼠标就会**把触摸会话整份清掉**
        //   （那根手指还在屏上却不再被跟踪，要抬手重按才恢复）。
        //   鼠标自己不需要靠清表自愈：它的残留项最多一条，且已被下面的 `buttons` 守卫挡住拖拽。
        if (e.isPrimary && e.pointerType !== 'mouse') {
            pointersRef.current.clear();
            pinchRef.current = null;
        }
        nonTapRef.current = false; // [F2] 新手势开始 —— 这是画布"空白点击"闸门的**唯一复位点**
        const { x, y } = toLayoutPoint(e);
        pointersRef.current.set(e.pointerId, { x, y, cx: e.clientX, cy: e.clientY });
        // 两根及以上 ⇒ 捏合。⚠️ 第三根手指**不重建会话**（重建会把锚点与缩放比整份换掉 ⇒ 画面跳一下）
        if (pointersRef.current.size >= 2) {
            if (!pinchRef.current) beginPinch();
            return;
        }
        dragRef.current = {
            startX: x, startY: y,
            startCx: e.clientX, startCy: e.clientY, // 屏幕坐标：触摸阈值要跟浏览器 tap slop 同口径（见 MAP_TOUCH）
            panX: panRef.current.x, panY: panRef.current.y,
            active: true,
            moved: false,
        };
        flingSampleRef.current = { x, y, t: performance.now(), vx: 0, vy: 0 };
    };
    const onPointerMove = (e: React.PointerEvent) => {
        // 早退：鼠标悬停（未按下）时不量布局 —— 旧版也是先判 active 才继续，
        // 别在这里新增强制同步布局（`toLayoutPoint` 内含 `getBoundingClientRect`）。
        if (!pinchRef.current && !dragRef.current.active && !pointersRef.current.has(e.pointerId)) return;
        const { x, y } = toLayoutPoint(e);
        const pt = { x, y, cx: e.clientX, cy: e.clientY };
        // 捏合优先：实时更新双指坐标后重算（双指同时动，每个 pointermove 都要刷新）
        if (pinchRef.current) {
            if (pointersRef.current.has(e.pointerId)) pointersRef.current.set(e.pointerId, pt);
            applyPinch();
            return;
        }
        if (!dragRef.current.active) return;
        // 🛡️ 悬停保护：**没有按下的 move**（鼠标悬停）绝不参与拖拽判定。
        //   为什么需要它：上面 `onPointerLeave` 为了"拖到黑边也不断手"而忽略了已被跟踪指针的 leave，
        //   于是"鼠标在窗口外松手"会留下一个残留的 `active=true`（鼠标 pointerId 恒定，
        //   单靠跟踪表分辨不出它是旧手势还是当前悬停）⇒ 悬停就会被当成拖拽。
        //   [F4] **判据必须限定 mouse**：原写法对所有 pointerType 生效 ⇒ 触摸平移从此依赖
        //   "WebView 把按住期间的 buttons 报成非 0"这一条浏览器行为，一旦为 0 就**彻底拖不动、且没有退路**；
        //   触摸有隐式 pointer capture，本来不需要这道守卫。
        if (e.buttons === 0 && e.pointerType === 'mouse') return;
        if (pointersRef.current.has(e.pointerId)) pointersRef.current.set(e.pointerId, pt);
        // 位移超过阈值才判定为拖拽：点击（无位移）不 capture、不动画布，click 事件能正常到达节点。
        // ⚠️ 阈值**分两套**（理由见 `MAP_TOUCH`）：鼠标沿用旧的「布局 px 欧几里得 6」⇒ PC 逐字节不变；
        //    触摸改用「屏幕 px 切比雪夫 8」⇒ 与浏览器 tap slop 同口径，消掉 6~8px 那条吞点击的死带。
        const d = dragRef.current;
        const passedThreshold = e.pointerType === 'mouse'
            ? Math.hypot(x - d.startX, y - d.startY) > MAP_TOUCH.dragThresholdPx
            : Math.max(Math.abs(e.clientX - d.startCx), Math.abs(e.clientY - d.startCy)) > MAP_TOUCH.dragThresholdScreenPx;
        if (!d.moved && passedThreshold) {
            d.moved = true;
            nonTapRef.current = true; // [F2] 拖过了 ⇒ 这次手势整体不是轻点（尾随 click 不得被当空白点击）
            e.currentTarget.setPointerCapture(e.pointerId);
        }
        if (!d.moved) return;
        panRef.current.x = d.panX + (x - d.startX);
        panRef.current.y = d.panY + (y - d.startY);
        clampPan();
        applyTransform();
        // [2026-10-17 触屏 C] 速度采样（指数滑动平均）。α=0.4 ⇒ 手指突然停住时速度迅速掉下来，
        //   避免"手已经停了，松手地图还在飞"。只在**非鼠标**指针上采（鼠标不用惯性，白算）。
        if (e.pointerType !== 'mouse') {
            const now = performance.now();
            const s = flingSampleRef.current;
            if (s) {
                const dt = now - s.t;
                if (dt > 0) {
                    const a = MAP_TOUCH.flingVelocityAlpha;
                    s.vx = s.vx * (1 - a) + ((x - s.x) / dt) * a;
                    s.vy = s.vy * (1 - a) + ((y - s.y) / dt) * a;
                    s.x = x; s.y = y; s.t = now;
                }
            }
        }
    };
    const onPointerUp = (e: React.PointerEvent) => {
        // 若本次是拖拽：抑制随后的 click（拖拽松手在节点上会触发 click，需忽略），短暂生效后自动恢复
        if (dragRef.current.active && dragRef.current.moved) {
            suppressClickRef.current = true;
            setTimeout(() => { suppressClickRef.current = false; }, 120);
            // [2026-10-17 触屏 C] 抬手接力惯性。⚠️ 必须排在 endGesture **之前** ——
            //   endGesture 会清掉速度采样，清完再起飞就只能滑 0 像素。
            //   判据用 **事件自己的 `pointerType`**（不用设备类别）：安卓外接鼠标不该甩、
            //   `pointer:coarse=false` 的触屏本也该甩（同 `TouchFeedbackLayer.tsx:148-151` 的口径）。
            //   捏合结束时 dragRef.active 已被 beginPinch 置 false ⇒ 天然进不来这一支。
            if (e.pointerType !== 'mouse') startFling();
        }
        endGesture(e.pointerId);
    };
    /** 指针离开视口：**只对"没在跟踪中的指针"收摊**（2026-10-17 独立审查 A4）
     *  ⚠️ 视口 ≠ 整窗：`ScaleWrapper` 把 1680×1050 的盒子居中缩放 ⇒ 横屏手机上左右各有黑边，
     *     横向拖到黑边上就会触发 `pointerleave`。若在这里**无条件**结束手势，
     *     "拖多远都跟手"就被结构性破坏（正是 CONTRACT 1 要保证的）。
     *     规范上指针被 capture 后边界事件会被抑制，但**越过阈值、`setPointerCapture` 之前没有这层保护**。
     *     ⇒ 在跟踪表里 ⇒ 无视，等 `pointerup`/`pointercancel`；不在（如鼠标只是悬停移出）⇒ 照旧收尾。 */
    const onPointerLeave = (e: React.PointerEvent) => {
        if (pointersRef.current.has(e.pointerId)) return;
        endGesture(e.pointerId);
    };
    /** 指针离开视口 / 被浏览器接走：**只收摊，绝不接力惯性**
     *  ⚠️ `pointercancel` 的语义是「浏览器把这个手势接走了」，**不是**「用户抬手」
     *  （同 `TouchFeedbackLayer.tsx:280-290` 的教训）⇒ 此时若还让地图滑行，
     *  观感会变成"手指明明还在屏幕上，地图自己跑了"。 */
    const abortGesture = (e: React.PointerEvent) => {
        endGesture(e.pointerId);
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
        stopFling(); // [2026-10-17] 定位是"直接跳过去"，跳的过程里不该还有上一段滑行在叠加
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
                // [2026-10-17 莉莉子 · 安卓触屏] 🔴 **别删这一行** —— 它就是"安卓上地图拖不动"的解药。
                //   缺它 ⇒ 浏览器把触摸判成滚动/手势并派发 `pointercancel` ⇒ 下面的 onPointerCancel 收摊 ⇒ 地图只动一下。
                //   ⚠️ 也**别改成 `pan-y`**：地图横竖都要自己拖（不是"竖着交给浏览器"的列表），
                //     给了 pan-y 反而让竖直拖动被浏览器接走、地图上下拖不动。理由详见上方手势核心注释②。
                //   ⚠️【真机必验 ①】安卓上"长按地图节点 → 弹节点预览"（`MapNode.tsx:67` 的 onContextMenu）
                //     是否仍然有效。`touch-action` 按规范只管滚动/缩放、不该影响长按菜单，
                //     但这一条我**无法在无真机的情况下证实** ⇒ 若失效，就是在节点上另加长按判定，别回退本行。
                style={{ touchAction: 'none' }}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerLeave={onPointerLeave}
                onPointerCancel={abortGesture}
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
                        // ⚠️ [F2] 闸门读的是 `nonTapRef`（跨 `pointerup`→补发 `click` 两个事件、留到下一次按下），
                        //    **不是** `dragRef.moved` —— 后者在"捏合后余指接管"分支必须归零（要重新累计阈值），
                        //    拿它当闸门会让那条路径的尾随 click 直接关掉面板。
                        if (!nonTapRef.current && e.target === canvasRef.current) { eventBus.emit(GameEvents.UI_BACK);
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
