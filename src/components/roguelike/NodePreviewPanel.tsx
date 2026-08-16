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
import { X } from 'lucide-react';
import { type RogueNode, type RogueNodeType } from '../../data/roguelike/mapLayout';
import { pickEnemyAvatarKey } from '../../data/roguelike/mapLayout';
import { getBuffById, type MazeBuff } from '../../data/roguelike/buffs'; // [2026-08-11] 改读统一库 + 节点预分配实际携带
import type { RoguelikeRunState } from '../../hooks/useRoguelikeRun';
import { NODE_META, type MapNodeState } from './MapNode';
import { ENEMY_ARCHETYPES } from '../../data/enemies/archetypes';
import { CARD_DB } from '../../data/cards';
import { EnhancementPreview, type EnhancementPreviewHover } from './EnhancementPreview';

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

// 当前节点按类型互动的按钮文案
const INTERACT_LABEL: Partial<Record<RogueNodeType, string>> = {
    enhance: '强化',
    rest: '休整',
    shop: '进入商店',
    event: '探索',
    treasure: '开启宝箱',
};

const PLACEHOLDER_DESC = '流派描述...'; // EnemyDeckEditor 新建流派默认占位文案

interface NodePreviewPanelProps {
    node: RogueNode | null;
    run: RoguelikeRunState;
    state: MapNodeState;
    onClose: () => void;
    onMoveTo: (nodeId: string) => void;
    onBattle: (nodeType: RogueNodeType, archetypeId: string | undefined, nodeId: string) => void;
    onInteractCurrent: (node: RogueNode) => void;
}

export const NodePreviewPanel: React.FC<NodePreviewPanelProps> = ({ node, run, state, onClose, onMoveTo, onBattle, onInteractCurrent }) => {
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
        if (isCombat) {
            if (!isDefeated) action = { label: '挑战', onClick: () => onBattle(node.type, node.enemyArchetypeId, node.id) };
        } else if (node.type !== 'start') {
            action = { label: INTERACT_LABEL[node.type] ?? '互动', onClick: () => onInteractCurrent(node) };
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
                            <h3 className="font-black tracking-widest text-gray-100 text-lg">{isCombat ? '敌人情报' : '节点情报'}</h3>
                            <button onClick={onClose} className="p-1.5 rounded-lg bg-white/5 hover:bg-white/15 text-gray-400 hover:text-white transition-colors">
                                <X size={18} />
                            </button>
                        </div>

                        {/* 滚动内容 */}
                        <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin">
                            {isCombat ? (
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
                                <button
                                    onClick={action.onClick}
                                    className="w-full py-3 rounded-xl font-black tracking-widest text-white transition-all hover:scale-[1.02] active:scale-[0.98] shadow-lg"
                                    style={{ background: 'linear-gradient(to right, #6366f1, #8b5cf6)' }}
                                >
                                    {action.label}
                                </button>
                            ) : (
                                <p className="text-center text-xs font-mono text-gray-500 py-2">
                                    {state === 'done' ? '已击败' : state === 'missed' ? '已错过' : state === 'locked' ? '未到达' : '无法互动'}
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

        {/* 敌人持有的迷宫BUFF */}
        <div>
            <h4 className="text-xs font-black tracking-widest text-gray-400 mb-1.5">持有迷宫BUFF</h4>
            {buffDefs.length === 0 ? (
                <p className="text-sm text-gray-500 italic">暂无迷宫BUFF</p>
            ) : (
                <div className="space-y-2">
                    {buffDefs.map(buff => (
                        <div
                            key={buff.id}
                            {...bindBuffHover(buff)}
                            className="flex items-center gap-3 p-2.5 rounded-xl bg-white/5 border border-white/10 hover:border-white/25 hover:bg-white/10 cursor-pointer transition-colors"
                        >
                            <span className="text-base">{buff.name}</span>
                            <span className="flex-1 text-xs text-gray-400 truncate">{buff.description}</span>
                        </div>
                    ))}
                </div>
            )}
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
