// ==========================================
// 悖论迷宫 · 节点右键预览面板（右侧滑出）
// [2026-08-11 莉莉子] 右键任意节点 → 右侧拉出情报面板，点画面空白关闭。
// 敌人节点（battle/elite/boss）：敌人卡面 / 名字 / 介绍 / 持有迷宫BUFF（悬停弹卡面预览）+ 前往/挑战。
// 非敌人节点：节点卡面占位 / 名字 + 前往/按类型互动。
// 数据留接口：敌人迷宫BUFF 由 archetype.rogueBuffs → ENEMY_BUFFS 解析（当前空，显示空态），
// 后续开发者工具按「迷宫深度动态难度」配置。
// ==========================================
import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Lock } from 'lucide-react'; // [2026-08-27] Lock：未抵达节点占位
import { type RogueNode, type RogueNodeType, RANDOM_NODE_NAME, RANDOM_NODE_DESC } from '../../data/roguelike/mapLayout'; // [2026-10-09 随机节点] +占位文案（掩码用）
import { pickEnemyAvatarKey } from '../../data/roguelike/mapLayout';
import { getBuffById, type MazeBuff } from '../../data/roguelike/buffs'; // [2026-08-11] 改读统一库 + 节点预分配实际携带
import type { RoguelikeRunState } from '../../hooks/useRoguelikeRun';
import { NODE_META, type MapNodeState } from './MapNode';
import { ENEMY_ARCHETYPES } from '../../data/enemies/archetypes';
import { CARD_DB } from '../../data/cards';
import { EnhancementPreview, type EnhancementPreviewHover } from './EnhancementPreview';
import { EnhancementCard } from './EnhancementCard'; // [2026-08-27] 迷宫强化图鉴卡（逻辑研习同款样式）
import { eventBus, GameEvents } from '../../utils/eventBus'; // [2026-10-14 莉莉子 🖱️] 预览面板 交互音效

// 节点类型 → 显示名（对齐 NodeEventModal 文案）
const NODE_TITLE: Record<RogueNodeType, string> = {
    start: '起点',
    enhance: '迷宫强化',
    battle: '战斗',
    elite: '精英',
    boss: 'Boss',
    rest: '篝火·休整',
    shop: '商店',
    event: '未知事件',
    random: RANDOM_NODE_NAME, // [2026-10-09 随机节点] 未揭示节点的显示名（程指定：？？？）
    treasure: '宝箱',
};

const PLACEHOLDER_DESC = '流派描述...'; // EnemyDeckEditor 新建流派默认占位文案

interface NodePreviewPanelProps {
    node: RogueNode | null;
    run: RoguelikeRunState;
    state: MapNodeState;
    onClose: () => void;
    onMoveTo: (nodeId: string) => void;
    onBattle: (nodeType: RogueNodeType, archetypeId: string | undefined, nodeId: string, enemyBuffs?: string[]) => void; // [2026-08-27 莉莉子] enemyBuffs=节点预分配的迷宫强化（roll 子集）
    onDevWin?: (nodeType: RogueNodeType, nodeId: string) => void; // [2026-08-29] 开发者一键胜利（跳过战斗）
    onInteractCurrent: (node: RogueNode) => void;
}

export const NodePreviewPanel: React.FC<NodePreviewPanelProps> = ({ node, run, state, onClose, onMoveTo, onBattle, onInteractCurrent, onDevWin }) => {
    // [2026-08-11] BUFF 悬停预览：ref 定时器复刻 useCardGaze 手感（500ms delay + 150ms leaveBuffer）
    const [hoverBuff, setHoverBuff] = useState<EnhancementPreviewHover | null>(null);
    const enterTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const leaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(() => () => {
        if (enterTimerRef.current) clearTimeout(enterTimerRef.current);
        if (leaveTimerRef.current) clearTimeout(leaveTimerRef.current);
    }, []);
    const clearEnter = () => { if (enterTimerRef.current) { clearTimeout(enterTimerRef.current); enterTimerRef.current = null; } };
    const clearLeave = () => { if (leaveTimerRef.current) { clearTimeout(leaveTimerRef.current); leaveTimerRef.current = null; } };
    const bindBuffHover = (buff: MazeBuff) => ({
        onMouseEnter: (e: React.MouseEvent) => {
            clearLeave();
            // [2026-10-20 莉莉子 · 图鉴 NEW 角标] `noNew: true` —— 本面板上的强化是**敌方**的
            //   （`node.enemyBuffs`，与玩家共用同一套 id 空间），敌方强化不在玩家图鉴里，
            //   自动判定会把每一件敌方强化都标成 NEW。同场景另一个入口
            //   （`RogueEnhancementPanel`）用的是另一张无角标的卡，两处表现必须一致。
            enterTimerRef.current = setTimeout(() => setHoverBuff({ buff, rect: e.currentTarget.getBoundingClientRect(), noNew: true }), 500);
        },
        onMouseLeave: () => {
            clearEnter();
            leaveTimerRef.current = setTimeout(() => setHoverBuff(null), 150);
        },
    });

    if (!node) return null;

    // [2026-10-09 莉莉子 · 随机节点] **掩码**：开局预掷出的真身不得在预览面板泄露
    //   （程拍板：节点名称＝？？？、描述＝？？？？；真身派生信息一律不显示）
    //   ⚠️ 只在"进入之前"掩码；进入后的界面（NodeEventModal 等）显示真身
    // [2026-10-10 程实测 BUG修复] **掩码范围收窄成"还没站上去"**：
    //   原来 `!!node.wasRandom` 是"只要随机过就永远掩码" ⇒ 随机掷出的**战斗节点**站在上面时，
    //   下面 `isCombat` 仍判 false ⇒ 面板不给「战斗」而给「进入」⇒ 回调把 `battle` 塞进事件弹窗
    //   （它的 `TITLES` 表里**没有 battle/elite/boss** 三个键）⇒ `meta.icon` 白屏崩溃。
    //   `state === 'current'` ＝ 玩家已经走进这个节点 ⇒ 这时揭示真身**不算提前暴露**。
    const unrevealed = !!node.wasRandom && state !== 'current';
    // [2026-10-10 莉莉子 BUG修复 · 程实测] **待战节点**：事件结算后该节点在地图上已被渲染成「精英」
    //   （`MapNode.tsx:50` 用 `pendingBattle` 改写显示类型），但它的 `node.type` **仍然是 `'event'`**。
    //   此前 isCombat / 底部按钮分支**全部只读 `node.type`** ⇒ 面板判成"非战斗 + 已用掉"⇒ 一个入口都不给，
    //   玩家站在那个节点上永远打不了这场仗（程实测：「会变成战斗节点的事件无法再次进入战斗」）。
    //   修法：把"待战"并进战斗判据，并在下方动作分支里**优先**处理（它必然 `isResolved === true`）。
    const pendingBattle = run.pendingBattles?.[node.id];
    const isCombat = !unrevealed && (node.type === 'battle' || node.type === 'elite' || node.type === 'boss' || !!pendingBattle);
    const meta = NODE_META[unrevealed ? 'random' : node.type];
    const isDefeated = run.defeated?.includes(node.id) ?? false;

    // ── 敌人信息解析（未揭示节点：全部留空 —— 否则掷成战斗就提前泄露真身） ──
    const arch = !unrevealed && node.enemyArchetypeId ? ENEMY_ARCHETYPES[node.enemyArchetypeId] : undefined;
    // [2026-10-10 莉莉子 · 第 4 轮独立审查修复] **待战节点**（事件结算后变成战斗节点那个）：
    //   它是从事件节点转来的 ⇒ **没有 `enemyArchetypeId`**，此前面板标题写着「敌人情报」，
    //   内容却是「未知敌人 / 暂无资料」，玩家根本不知道要打谁。
    //   对手真身在 `run.pendingBattles[node.id].opponentHeroKeys`（App 据此构建遭遇战）⇒ 从这里取。
    const opponentKeys = pendingBattle?.opponentHeroKeys ?? [];
    const opponentNames = opponentKeys
        .map(k => CARD_DB[k]?.name?.replace(/\n/g, '') ?? k)
        .filter(Boolean);
    // 敌人卡面：优先复用节点预分配的 enemyKey（非英雄卡），缺失才兜底从流派池随机选；待战节点直接用对手天启者
    const faceKey = unrevealed ? undefined
        : (node.enemyKey ?? (arch ? pickEnemyAvatarKey(arch.id) : undefined) ?? opponentKeys[0]);
    const faceCard = faceKey ? CARD_DB[faceKey] : undefined;
    const faceIsSpell = !!faceCard && !!faceCard.type && faceCard.type.includes('spell');
    const desc = unrevealed ? RANDOM_NODE_DESC : arch?.description?.trim();
    const hasDesc = !!desc && desc !== PLACEHOLDER_DESC;
    // 待战节点自己写一句"描述"：告诉玩家选择已生效、现在该打谁
    const enemyName = opponentNames.length ? opponentNames.join(' & ') : (arch?.name ?? '未知敌人');
    // [2026-10-10 程拍板 · 独立审查 P5] **补失败后果提示** ——
    //   归一之后待战战斗 = 普通战斗（可耗复活、复活耗尽则整局败北），
    //   而此前所有可见文案只讲奖励 ⇒ 玩家看不到失败代价（审查：「零提示」已证实）。
    const battleRiskNote = '⚠️ 迎战失败会消耗一次复活；复活耗尽则本局败北。';
    const finalDesc = pendingBattle
        ? (opponentNames.length
            ? `你的选择已经生效——${enemyName}正在等你。${battleRiskNote}`
            : `你的选择已经生效——对手正在等你。${battleRiskNote}`)
        : desc;
    const finalHasDesc = pendingBattle ? true : hasDesc;
    const nodeTitleText = pendingBattle ? '待战' : NODE_TITLE[node.type];
    // [2026-08-11] 显示预分配的实际携带（node.enemyBuffs），而非流派配置库全集
    const buffDefs: MazeBuff[] = unrevealed ? [] : (node.enemyBuffs ?? [])
        .map(id => getBuffById(id))
        .filter((b): b is MazeBuff => !!b);

    // ── 底部动作按钮 ──
    // [2026-10-05 莉莉子 BUG修复 · 20261005-13 / 方案 P1] **已用掉的节点**：底部不再给「进入」
    //   ── 病根：`state === 'current'` 的非战斗分支**无条件**给「进入」⇒ 站在节点上右键再进
    //      就能把该节点的好处再拿一遍（事件抽新事件 / 休整反复回血 / 商店重买…）。
    //   ── 覆盖：事件（选择时记）· 强化（选定记）· 休整（四行动任一记）· 宝箱（领奖记）· 商店（首次购买/刷新记）
    //   ── 记录来源：`run.resolvedNodes`（`useRoguelikeRun.markNodeResolved`）
    const isResolved = (run?.resolvedNodes ?? []).includes(node.id);
    // [2026-10-10 莉莉子 BUG修复] 动作对象加 **`fight` 语义标记** = "这里有一场仗可打"。
    //   原先"开发者一键胜利"按钮靠 `action.label === '战斗'` 判断 ⇒ **待战节点**（label='迎战'）
    //   判不中 ⇒ 按钮根本不渲染（程实测：「一键通过按钮没有了」）。改看语义标记，不再看文案。
    let action: { label: string; onClick: () => void; fight?: boolean } | null = null;
    if (state === 'available') {
        action = { label: '前往', onClick: () => onMoveTo(node.id) };
    } else if (state === 'current') {
        // [2026-08-25] 统一「进入」按钮：确认进入当前节点（战斗/互动），由玩家主动点才触发
        if (pendingBattle) {
            // [2026-10-10 莉莉子 BUG修复] **待战节点优先**：事件已经结算（`isResolved === true`），
            //   但还欠着那场仗 ⇒ 必须给入口，且**不能**被下方"已完成"分支吃掉。
            //   ⚠️ 走 `onInteractCurrent` 而不是 `onBattle` —— 敌人配置存在 `pendingBattles`
            //     （`opponentHeroKeys` / `enemyEnhancements`，由 `buildEncounterForHeroes` 构建），
            //     走 onBattle 会退回"随机流派"，**打错人**。
            action = { label: '迎战', fight: true, onClick: () => onInteractCurrent(node) };
        } else if (isCombat) {
            if (!isDefeated) action = { label: '战斗', fight: true, onClick: () => onBattle(node.type, node.enemyArchetypeId, node.id, node.enemyBuffs) }; // [2026-08-27] 敌人详情「战斗」按钮（程要求）
        } else if (node.type !== 'start') {
            // [2026-10-05 · 方案 P1] 已用掉 ⇒ 不给「进入」，走下方"无动作"分支显示「已完成」
            if (!isResolved) action = { label: '进入', onClick: () => onInteractCurrent(node) };
        }
    }

    return (
        <AnimatePresence>
            {node && (
                <>
                    {/* 非交互视觉压暗层：不拦点击，空白关闭/节点切换全交给地图层 */}
                    <motion.div
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[605] bg-black/25 pointer-events-none"
                    />
                    {/* 右侧预览面板 */}
                    <motion.div
                        data-preview-panel
                        initial={{ x: 420 }} animate={{ x: 0 }} exit={{ x: 420 }}
                        transition={{ type: 'spring', stiffness: 320, damping: 32 }}
                        className="fixed right-0 top-0 bottom-0 z-[610] w-[380px] bg-slate-900/95 border-l border-white/10 flex flex-col shadow-[-20px_0_50px_rgba(0,0,0,0.5)]"
                    >
                        {/* 头部 */}
                        <div className="p-4 flex items-center justify-between border-b border-white/10 shrink-0">
                            <h3 className="font-black tracking-widest text-gray-100 text-lg">{state === 'locked' ? '未抵达的节点' : (isCombat ? (pendingBattle ? '待战 · 强敌' : '敌人情报') : '节点情报')}</h3>
                            <button onClick={() => { eventBus.emit(GameEvents.UI_BACK); onClose(); }} className="p-1.5 rounded-lg bg-white/5 hover:bg-white/15 text-gray-400 hover:text-white transition-colors">
                                <X size={18} />
                            </button>
                        </div>

                        {/* 滚动内容 */}
                        <div className="flex-1 overflow-y-auto p-4 space-y-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                            {state === 'locked' ? (
                                // [2026-08-27] 未抵达节点：不泄露具体内容，只显示锁占位 + 神秘文案
                                <LockedSection />
                            ) : isCombat ? (
                                <EnemySection
                                    faceCard={faceCard} faceIsSpell={faceIsSpell} metaColor={meta.color} metaIcon={meta.icon}
                                    enemyName={enemyName} nodeTitle={nodeTitleText}
                                    hasDesc={finalHasDesc} desc={finalDesc} buffDefs={buffDefs} bindBuffHover={bindBuffHover}
                                />
                            ) : (
                                <PlainSection type={unrevealed ? 'random' : node.type} metaColor={meta.color} metaIcon={meta.icon} />
                            )}
                        </div>

                        {/* 底部动作条 */}
                        <div className="border-t border-white/10 p-4 shrink-0">
                            {action ? (
                                <div className="flex gap-3">
                                    {/* [2026-08-29] 开发者一键胜利（战斗节点，战斗按钮左侧） */}
                                    {/* [2026-10-10 莉莉子 BUG修复] 判据由 `label === '战斗'` 改为 **`action.fight`**：
                                        待战节点（瓦尔基里大赛事件变化出来的那个战斗节点）label 是「迎战」，
                                        旧判据 ⇒ 这个按钮**根本不渲染**（程实测：「一键通过按钮没有了」）。 */}
                                    {action.fight && onDevWin && (
                                        <button
                                            onClick={() => onDevWin(node.type, node.id)}
                                            className="shrink-0 px-4 py-3 rounded-xl font-black tracking-widest text-white transition-all hover:scale-[1.02] bg-red-600/80 border-2 border-red-400 hover:bg-red-500 shadow-lg"
                                        >
                                            ⚡ 一键胜利
                                        </button>
                                    )}
                                    <button
                                        onClick={() => { eventBus.emit(GameEvents.UI_CLICK); action.onClick(); }}
                                        className="flex-1 py-3 rounded-xl font-black tracking-widest text-white transition-all hover:scale-[1.02] active:scale-[0.98] shadow-lg"
                                        style={{ background: 'linear-gradient(to right, #6366f1, #8b5cf6)' }}
                                    >
                                        {action.label}
                                    </button>
                                </div>
                            ) : (
                                <p className="text-center text-xs font-mono text-gray-500 py-2">
                                    {state === 'done' ? '已击败' : isResolved ? '已完成' : state === 'missed' ? '已错过' : state === 'locked' ? '未抵达的节点' : '无法互动'}
                                </p>
                            )}
                        </div>
                    </motion.div>
                </>
            )}

            {/* BUFF 悬停大图浮层（portal 到 body） */}
            <EnhancementPreview hover={hoverBuff} />
        </AnimatePresence>
    );
};

// ── 敌人分支 ──
const EnemySection: React.FC<{
    faceCard?: typeof CARD_DB[string] | undefined;
    faceIsSpell: boolean;
    metaColor: string;
    metaIcon: React.ReactNode;
    enemyName: string;
    nodeTitle: string;
    hasDesc: boolean;
    desc?: string;
    buffDefs: MazeBuff[];
    bindBuffHover: (buff: MazeBuff) => { onMouseEnter: (e: React.MouseEvent) => void; onMouseLeave: () => void };
}> = ({ faceCard, faceIsSpell, metaColor, metaIcon, enemyName, nodeTitle, hasDesc, desc, buffDefs, bindBuffHover }) => (
    <>
        {/* 敌人卡面 */}
        <div className="w-full h-60 rounded-2xl border border-white/10 bg-black overflow-hidden relative flex items-center justify-center">
            {faceCard ? (
                <img
                    src={faceCard.imageUrl}
                    alt={faceCard.name}
                    className={faceIsSpell ? 'h-full w-auto max-w-full object-cover' : 'w-full h-full object-cover'}
                />
            ) : (
                <div className="w-full h-full flex items-center justify-center bg-slate-950">
                    <span className={`w-20 h-20 rounded-full ${metaColor} flex items-center justify-center text-white`}>{metaIcon}</span>
                </div>
            )}
        </div>

        {/* 敌人名字 + 类型副标 */}
        <div>
            <h2 className="text-2xl font-black text-white tracking-wider">{enemyName}</h2>
            <p className="text-xs font-mono tracking-[0.2em] text-gray-400 mt-1">{nodeTitle}</p>
        </div>

        {/* 敌人介绍 */}
        <div>
            <h4 className="text-xs font-black tracking-widest text-gray-400 mb-1.5">介绍</h4>
            {hasDesc ? (
                <p className="text-sm text-gray-300 leading-relaxed">{desc}</p>
            ) : (
                <p className="text-sm text-gray-500 italic">暂无资料</p>
            )}
        </div>

        {/* 敌人持有的迷宫BUFF（[2026-08-27] 图鉴卡样式，对齐逻辑研习） */}
        <div>
            <h4 className="text-xs font-black tracking-widest text-gray-400 mb-1.5">持有迷宫BUFF</h4>
            {buffDefs.length === 0 ? (
                <p className="text-sm text-gray-500 italic">暂无迷宫BUFF</p>
            ) : (
                <div className="grid grid-cols-1 gap-3">
                    {buffDefs.map(buff => (
                        <EnhancementCard key={buff.id} e={buff} bindHover={bindBuffHover} />
                    ))}
                </div>
            )}
        </div>
    </>
);

// ── [2026-08-27 莉莉子] 未抵达节点分支：锁占位 + 神秘文案（不泄露具体内容） ──
const LockedSection: React.FC = () => (
    <>
        {/* 锁占位卡面 */}
        <div className="w-full h-60 rounded-2xl border border-white/10 bg-slate-950 overflow-hidden relative flex items-center justify-center">
            <div className="w-full h-full flex items-center justify-center" style={{ background: 'radial-gradient(circle at center, rgba(255,255,255,0.04), transparent 70%)' }}>
                <span className="w-24 h-24 rounded-full bg-gray-800 flex items-center justify-center text-gray-500 scale-[1.6]">
                    <Lock size={40} />
                </span>
            </div>
        </div>

        {/* 标题 + 文案 */}
        <div className="text-center space-y-2 pt-2">
            <h2 className="text-xl font-black text-gray-400 tracking-wider">未抵达的节点</h2>
            <p className="text-sm text-gray-500 italic">到底会遇到什么呢？</p>
        </div>
    </>
);

// ── 非敌人节点分支 ──
const PlainSection: React.FC<{ type: RogueNodeType; metaColor: string; metaIcon: React.ReactNode }> = ({ type, metaColor, metaIcon }) => (
    <>
        {/* 节点卡面占位（用类型图标做大图卡面，等节点库配专属图） */}
        <div className="w-full h-60 rounded-2xl border border-white/10 bg-slate-950 overflow-hidden relative flex items-center justify-center">
            <div
                className="w-full h-full flex items-center justify-center"
                style={{ background: 'radial-gradient(circle at center, rgba(255,255,255,0.06), transparent 70%)' }}
            >
                <span className={`w-24 h-24 rounded-full ${metaColor} flex items-center justify-center text-white scale-[1.6]`}>{metaIcon}</span>
            </div>
        </div>

        {/* 节点名字 */}
        <div>
            <h2 className="text-2xl font-black text-white tracking-wider">{NODE_TITLE[type]}</h2>
            <p className="text-xs font-mono tracking-[0.2em] text-gray-400 mt-1">节点情报</p>
            {/* [2026-10-05 莉莉子 · 方案 P1 残项] 事件节点：**进入前**先告知风险面
                （命运事件不可离开；其余可随时安全退出）——避免"被骗进去"的挫败感 */}
            {type === 'event' && (
                <p className="text-xs text-gray-500 mt-2 leading-relaxed">多数事件可以安全离开；少数「命运事件」不可回避。</p>
            )}
            {/* [2026-10-09 莉莉子 · 随机节点] 未揭示节点的**描述占位**（程指定：？？？？）
                ── 原 `PlainSection` 没有描述行，故此处显式补一行，否则"描述是？？？？"无处可显 */}
            {type === 'random' && (
                <p className="text-sm text-gray-400 mt-2 leading-relaxed">{RANDOM_NODE_DESC}</p>
            )}
        </div>
    </>
);
