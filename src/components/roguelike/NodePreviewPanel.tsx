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
import { type RogueNode, type RogueNodeType } from '../../data/roguelike/mapLayout';
import { pickEnemyAvatarKey } from '../../data/roguelike/mapLayout';
import { getBuffById, type MazeBuff } from '../../data/roguelike/buffs'; // [2026-08-11] 改读统一库 + 节点预分配实际携带
import type { RoguelikeRunState } from '../../hooks/useRoguelikeRun';
import { NODE_META, type MapNodeState } from './MapNode';
import { ENEMY_ARCHETYPES } from '../../data/enemies/archetypes';
import { CARD_DB } from '../../data/cards';
import { EnhancementPreview, type EnhancementPreviewHover } from './EnhancementPreview';
import { EnhancementCard } from './EnhancementCard'; // [2026-08-27] 迷宫强化图鉴卡（逻辑研习同款样式）

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
            enterTimerRef.current = setTimeout(() => setHoverBuff({ buff, rect: e.currentTarget.getBoundingClientRect() }), 500);
        },
        onMouseLeave: () => {
            clearEnter();
            leaveTimerRef.current = setTimeout(() => setHoverBuff(null), 150);
        },
    });

    if (!node) return null;

    const isCombat = node.type === 'battle' || node.type === 'elite' || node.type === 'boss';
    const meta = NODE_META[node.type];
    const isDefeated = run.defeated?.includes(node.id) ?? false;

    // ── 敌人信息解析 ──
    const arch = node.enemyArchetypeId ? ENEMY_ARCHETYPES[node.enemyArchetypeId] : undefined;
    // 敌人卡面：优先复用节点预分配的 enemyKey（非英雄卡），缺失才兜底从流派池随机选
    const faceKey = node.enemyKey ?? (arch ? pickEnemyAvatarKey(arch.id) : undefined);
    const faceCard = faceKey ? CARD_DB[faceKey] : undefined;
    const faceIsSpell = !!faceCard && !!faceCard.type && faceCard.type.includes('spell');
    const desc = arch?.description?.trim();
    const hasDesc = !!desc && desc !== PLACEHOLDER_DESC;
    // [2026-08-11] 显示预分配的实际携带（node.enemyBuffs），而非流派配置库全集
    const buffDefs: MazeBuff[] = (node.enemyBuffs ?? [])
        .map(id => getBuffById(id))
        .filter((b): b is MazeBuff => !!b);

    // ── 底部动作按钮 ──
    let action: { label: string; onClick: () => void } | null = null;
    if (state === 'available') {
        action = { label: '前往', onClick: () => onMoveTo(node.id) };
    } else if (state === 'current') {
        // [2026-08-25] 统一「进入」按钮：确认进入当前节点（战斗/互动），由玩家主动点才触发
        if (isCombat) {
            if (!isDefeated) action = { label: '战斗', onClick: () => onBattle(node.type, node.enemyArchetypeId, node.id, node.enemyBuffs) }; // [2026-08-27] 敌人详情「战斗」按钮（程要求）
        } else if (node.type !== 'start') {
            action = { label: '进入', onClick: () => onInteractCurrent(node) };
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
                            <h3 className="font-black tracking-widest text-gray-100 text-lg">{state === 'locked' ? '未抵达的节点' : (isCombat ? '敌人情报' : '节点情报')}</h3>
                            <button onClick={onClose} className="p-1.5 rounded-lg bg-white/5 hover:bg-white/15 text-gray-400 hover:text-white transition-colors">
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
                                    enemyName={arch?.name ?? '未知敌人'} nodeTitle={NODE_TITLE[node.type]}
                                    hasDesc={hasDesc} desc={desc} buffDefs={buffDefs} bindBuffHover={bindBuffHover}
                                />
                            ) : (
                                <PlainSection type={node.type} metaColor={meta.color} metaIcon={meta.icon} />
                            )}
                        </div>

                        {/* 底部动作条 */}
                        <div className="border-t border-white/10 p-4 shrink-0">
                            {action ? (
                                <div className="flex gap-3">
                                    {/* [2026-08-29] 开发者一键胜利（战斗节点，战斗按钮左侧） */}
                                    {action.label === '战斗' && onDevWin && (
                                        <button
                                            onClick={() => onDevWin(node.type, node.id)}
                                            className="shrink-0 px-4 py-3 rounded-xl font-black tracking-widest text-white transition-all hover:scale-[1.02] bg-red-600/80 border-2 border-red-400 hover:bg-red-500 shadow-lg"
                                        >
                                            ⚡ 一键胜利
                                        </button>
                                    )}
                                    <button
                                        onClick={action.onClick}
                                        className="flex-1 py-3 rounded-xl font-black tracking-widest text-white transition-all hover:scale-[1.02] active:scale-[0.98] shadow-lg"
                                        style={{ background: 'linear-gradient(to right, #6366f1, #8b5cf6)' }}
                                    >
                                        {action.label}
                                    </button>
                                </div>
                            ) : (
                                <p className="text-center text-xs font-mono text-gray-500 py-2">
                                    {state === 'done' ? '已击败' : state === 'missed' ? '已错过' : state === 'locked' ? '未抵达的节点' : '无法互动'}
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
        </div>
    </>
);
