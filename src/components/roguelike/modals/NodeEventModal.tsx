// ==========================================
// 悖论迷宫 · 节点事件弹窗
// enhance 迷宫强化：**校准式全屏开放式**（参考 CalibratePanel：无方形窗口，
//   卡片并排带角度升入 + 选中上浮/金色光晕 + 底部确定，三态动画 enter→select→exit）
// rest 可回血 30%；shop/event/treasure 暂为占位提示
// [2026-08-05 莉莉子] enhance 节点接入迷宫强化 3 选 1
// [2026-08-10 莉莉子] enhance 界面改版 v2：对齐校准呈现方式（程拍板：走通的路不重走）
// ==========================================
import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence, type Variants } from 'framer-motion';
import { Flame, ShoppingBag, HelpCircle, Gem, Flag, Sparkles, Trash2, Copy, MapPin, Search, Check, Layers, X } from 'lucide-react';
import type { RogueNodeType } from '../../../data/roguelike/mapLayout';
import type { MazeEnhancement } from '../../../data/roguelike/enhancements';
import { EnhancementCard } from './EnhancementCard';
import { ROGUE_EVENT_TYPE_LABELS, type RogueEvent, type RogueEventEffect } from '../../../data/roguelike/events'; // [2026-08-28 事件]
import type { RoguelikeRunState } from '../../../hooks/useRoguelikeRun'; // [2026-08-28 事件] 删卡用
import { CARD_DB } from '../../../data/cards'; // [2026-08-28 事件] 删卡名
import { getDialogueBg } from '../../../data/roguelike/dialogueBg'; // [2026-08-29 事件] 随机背景图
// [2026-08-31 莉莉子 开发者] 全量强化选择器依赖
import type { MazeBuff, EnhancementRarity } from '../../../data/roguelike/buffs';
import { RARITY_META } from '../RarityIcon';
import { TRIGGER_LABELS, EFFECT_LABELS } from '../RogueCodex';
import { Card } from '../../Card'; // [2026-09-06 莉莉子] 篝火/事件删卡：纯文字 chip → 完整卡面
import type { CardData } from '../../../types';
import { attachEquipment } from '../../../data/equipment';

interface NodeEventModalProps {
    type: Exclude<RogueNodeType, 'battle' | 'elite' | 'boss'>;
    hp: number;
    maxHp: number;
    onRest: () => void; // 休息回血回调
    onClose: () => void;
    enhanceOptions?: MazeEnhancement[]; // [2026-08-05] 强化节点：可选的迷宫强化
    onEnhance?: (key: string) => void;  // [2026-08-05] 选择强化回调
    // [2026-08-28 事件]
    run?: RoguelikeRunState; // 事件删卡子步骤读取牌组
    event?: RogueEvent;     // 当前事件（type='event' 时传入）
    onEvent?: (eventId: string, choiceIndex: number, removePicks?: string[]) => void;
    // [2026-08-29] 强化三选一刷新
    onRefresh?: () => void; // 刷新迷宫强化（消耗刷新次数）
    refreshCount?: number;  // 剩余刷新次数
    // [2026-08-29 休整节点] 净化删卡 / 复制卡 / 探路
    onRemoveCard?: (cardKey: string) => void;
    onAddCard?: (cardKey: string) => void;
    onStartScout?: (cardKey: string) => void;
    // [2026-08-31 莉莉子 开发者] 开发者任意选强化（全量选择器）
    isDev?: boolean;                     // 开发者账号（dev_full_admin）→ enhance 节点走全量选择器
    devPlayerPool?: MazeBuff[];          // 全量玩家强化（PLAYER_ENHANCEMENTS，含通行证锁定）
    devEnemyPool?: MazeBuff[];           // 全量敌方强化（ENEMY_ELIGIBLE_BUFFS）
    ownedEnhancements?: string[];        // 已拥有强化 id（我方 Tab 已拥有角标，run.enhancements）
    onDevPick?: (playerIds: string[], enemyIds: string[]) => void; // 多选确认：玩家强化叠加 + 敌方强化注入下一场战斗
}

// ═══════════════════════════════════════════════════════════════
// [2026-09-06 莉莉子] 完整卡面选卡（篝火净化/复制/探路 + 事件删卡共用）
// 背景：原纯文字 chip（CARD_DB[key].name）玩家认不出是哪张卡；
//   统一升级为完整卡面手牌样式（复用 Card location="hand"，130×202）。
// ═══════════════════════════════════════════════════════════════

/** key → 完整 CardData（补全 runtime 字段 + 挂本局装备，装备 pips 随卡面展示） */
const deckCardToFull = (key: string, run?: RoguelikeRunState): CardData => {
    const base = CARD_DB[key];
    const full: CardData = { ...base, id: key, strikeCount: 0, animState: 'idle' as const, damageTaken: 0, buffs: { power: 0, health: 0 } };
    const eqs = run?.equippedCards?.[key];
    if (eqs?.length) for (const eid of eqs) return attachEquipment(full, eid);
    return full;
};

/** 完整卡面选项（可选中态 + 悬停放大 + 底部名字） */
const DeckPickCard: React.FC<{
    cardKey: string;
    run?: RoguelikeRunState;
    isSelected?: boolean;
    accent?: 'yellow' | 'red'; // 选中光晕色（默认黄；删卡场景用红）
    badge?: React.ReactNode;   // 右上角徽章（如 ×N）
    onClick?: () => void;
}> = ({ cardKey, run, isSelected, accent = 'yellow', badge, onClick }) => {
    const full = deckCardToFull(cardKey, run);
    const selBorder = accent === 'red'
        ? 'border-red-500 shadow-[0_0_18px_rgba(239,68,68,0.55)]'
        : 'border-yellow-400 shadow-[0_0_18px_rgba(234,179,8,0.55)]';
    const selText = accent === 'red' ? 'text-red-300' : 'text-yellow-300';
    return (
        <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onClick?.(); }}
            className={`group relative flex flex-col items-center gap-1.5 transition-all outline-none
                ${isSelected ? 'scale-105' : 'hover:scale-[1.04] hover:-translate-y-1 cursor-pointer'}`}
        >
            {/* 选中光晕 */}
            {isSelected && (
                <div className={`absolute -inset-1 rounded-xl border-2 ${selBorder} z-10 pointer-events-none`} />
            )}
            {/* 完整卡面 */}
            <div className="relative z-0">
                <Card data={full} location="hand" isFaceUp skinId={0} />
                {/* 数量/右上徽章 */}
                {badge && (
                    <span className={`absolute -top-1.5 -right-1.5 z-20 px-1.5 py-0.5 rounded-full bg-slate-900 border font-black text-xs shadow ${accent === 'red' ? 'border-red-500/70 text-red-300' : 'border-yellow-400/70 text-yellow-300'}`}>
                        {badge}
                    </span>
                )}
            </div>
            {/* 卡名（选中高亮/默认白，鼠标悬停高亮） */}
            <span className={`text-[11px] font-bold text-center max-w-[130px] truncate transition-colors ${isSelected ? selText : 'text-gray-300 group-hover:text-white'}`}>
                {full.name}
            </span>
        </button>
    );
};

// [2026-08-31 莉莉子 开发者] 全量强化选择器：品质排序/筛选
const QUALITY_ORDER: EnhancementRarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'];
const QUALITY_RANK: Record<EnhancementRarity, number> = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4, mythic: 5 };

/** [2026-08-31 莉莉子 开发者] 全量强化信息块（对齐 RogueCodex 图鉴样式 + 选中/已拥有标记，可多选） */
const DevEnhBlock: React.FC<{ buff: MazeBuff; selected: boolean; owned?: boolean; onClick: () => void }> = ({ buff, selected, owned, onClick }) => {
    const meta = RARITY_META[buff.rarity];
    const trigger = buff.battleEffect?.trigger;
    const effectClass = buff.battleEffect?.effectClass;
    return (
        <button
            onClick={onClick}
            className={`relative rounded-2xl border p-4 flex flex-col gap-3 transition-all hover:scale-[1.03] hover:-translate-y-0.5 text-left w-full ${
                selected ? 'ring-2 ring-yellow-400' : ''
            }`}
            style={{
                background: meta.cardBg,
                borderColor: `${meta.color}55`,
                boxShadow: selected ? `0 0 22px ${meta.color}66` : `0 0 20px ${meta.color}1f`,
            }}
        >
            {selected && (
                <span className="absolute top-2 right-2 z-10 flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-black bg-yellow-400 text-black">
                    <Check size={11} strokeWidth={3} />已选
                </span>
            )}
            {owned && !selected && (
                <span className="absolute top-2 right-2 z-10 text-[10px] px-2 py-0.5 rounded-full font-mono bg-slate-800/80 text-gray-300 border border-white/15">已拥有</span>
            )}
            {/* 六边形图标（对齐 RogueCodex hexIcon） */}
            <div
                className="w-14 h-14 mx-auto flex items-center justify-center"
                style={{ clipPath: 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)', background: `${meta.color}18`, border: `1px solid ${meta.color}66` }}
            >
                <img src={buff.icon} alt={buff.name} className="w-full h-full object-cover" draggable={false} />
            </div>
            <div className="text-center text-sm font-bold tracking-wide truncate" style={{ color: '#fff', textShadow: `0 0 10px ${meta.color}66` }}>{buff.name}</div>
            <div className="flex flex-wrap justify-center gap-1.5">
                <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded font-mono" style={{ color: meta.color, border: `1px solid ${meta.color}44`, background: `${meta.color}11` }}>{meta.label}</span>
                {trigger && (
                    <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded font-mono text-cyan-300 border border-cyan-400/30 bg-cyan-400/10">{TRIGGER_LABELS[trigger]}</span>
                )}
            </div>
            <p className="text-gray-400 text-xs leading-snug line-clamp-3 min-h-[3rem]">{buff.description}</p>
            {effectClass && (
                <div className="mt-auto text-center">
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-mono text-purple-200 border border-purple-400/30 bg-purple-500/10">{EFFECT_LABELS[effectClass]}</span>
                </div>
            )}
        </button>
    );
};

const TITLES: Record<NodeEventModalProps['type'], { title: string; icon: React.ReactNode; desc: string }> = {
    start: { title: '起点 · 战旗', icon: <Flag size={32} className="text-green-400" />, desc: '旅程的起点，从这里踏入迷宫。' },
    enhance: { title: '迷宫强化', icon: <Sparkles size={32} className="text-violet-400" />, desc: '选择一项迷宫强化，获得永久的增益。' },
    rest: { title: '篝火 · 休整', icon: <Flame size={32} className="text-amber-400" />, desc: '在此停留，恢复 30% 生命值。' },
    shop: { title: '商店', icon: <ShoppingBag size={32} className="text-emerald-400" />, desc: '此地暂未开放，后续可购买卡牌 / 强化 / 删卡。' },
    event: { title: '未知事件', icon: <HelpCircle size={32} className="text-cyan-400" />, desc: '此地暂未开放，后续将提供随机事件选择。' },
    treasure: { title: '宝箱', icon: <Gem size={32} className="text-yellow-400" />, desc: '此地暂未开放，后续可获得免费强化 / 金币。' },
};

export const NodeEventModal: React.FC<NodeEventModalProps> = ({ type, hp, maxHp, onRest, onClose, enhanceOptions, onEnhance, run, event, onEvent, onRefresh, refreshCount = 0, onRemoveCard, onAddCard, onStartScout, isDev, devPlayerPool, devEnemyPool, ownedEnhancements, onDevPick }) => {
    const meta = TITLES[type];
    // [2026-08-10] 单选选中态：点击卡牌选中，底部确定生效
    const [selectedEnhanceId, setSelectedEnhanceId] = useState<string | null>(null);
    // [2026-08-10] 对齐校准三态动画：enter（升入）→ select（可交互）→ exit（确认后退出）
    const [animPhase, setAnimPhase] = useState<'enter' | 'select' | 'exit'>('enter');
    // [2026-08-31 莉莉子 开发者] 全量强化选择器状态（我方/敌方双 Tab + 多选）
    const [devTab, setDevTab] = useState<'player' | 'enemy'>('player');
    const [devSearch, setDevSearch] = useState('');
    const [devQualities, setDevQualities] = useState<Set<EnhancementRarity>>(new Set());
    const [devSelPlayer, setDevSelPlayer] = useState<Set<string>>(new Set());
    // [2026-08-31] 敌方 Tab 预选当前已注入的敌方强化（run.devEnemyEnhancements），便于查看/增删注入组合
    const [devSelEnemy, setDevSelEnemy] = useState<Set<string>>(new Set(run?.devEnemyEnhancements ?? []));
    // [2026-08-28 事件] 事件交互：选项 → 删卡子步骤
    const [eventStep, setEventStep] = useState<'choices' | 'remove'>('choices');
    const [pendingChoice, setPendingChoice] = useState(0);
    const [removePicks, setRemovePicks] = useState<string[]>([]);
    // [2026-08-29 休整 v2] 篝火：菜单 / 选卡子步骤
    const [restStep, setRestStep] = useState<'menu' | 'select'>('menu');
    const [restMode, setRestMode] = useState<'remove' | 'copy' | 'scout'>('remove');
    /** 休整选卡确认：按模式执行净化/复制/探路 */
    const handleRestPick = (cardKey: string) => {
        if (restMode === 'remove') onRemoveCard?.(cardKey);
        else if (restMode === 'copy') onAddCard?.(cardKey);
        else onStartScout?.(cardKey);
        onClose();
    };
    // [2026-08-29 事件] 事件节点随机背景图（进弹窗固定一次，dialogue 图池）
    const eventBg = useMemo(() => getDialogueBg(), []);

    useEffect(() => {
        const t = setTimeout(() => setAnimPhase('select'), 600);
        return () => clearTimeout(t);
    }, []);

    // [2026-08-28 事件] 效果 → 简短提示（选项卡片右侧展示代价/收益）
    const effectHints = (effects: RogueEventEffect[]): string => {
        const parts: string[] = [];
        for (const ef of effects) {
            if (ef.gold) parts.push(`${ef.gold > 0 ? '+' : ''}${ef.gold} 金`);
            if (ef.hp) parts.push(`${ef.hp > 0 ? '+' : ''}${ef.hp} 生命`);
            if (ef.hpPct) parts.push(`${ef.hpPct > 0 ? '+' : ''}${ef.hpPct}% 生命`);
            if (ef.maxHp) parts.push(`${ef.maxHp > 0 ? '+' : ''}${ef.maxHp} 上限`);
            if (ef.revive) parts.push(`复活×${ef.revive}`);
            if (ef.refresh) parts.push(`刷新×${ef.refresh}`);
            if (ef.addRandomCard) parts.push('随机卡');
            if (ef.addEquippedCard) parts.push('带装备卡');
            if (ef.polluteDeck) parts.push('牌组污染');
            if (ef.removeCards) parts.push(`删卡×${ef.removeCards}`);
            if (ef.upgradeCard) parts.push('强化一张卡');
            if (ef.addEnhancement) parts.push('迷宫强化');
            if (ef.addEquipment) parts.push('装备');
            if (ef.removeEquipment) parts.push('交出装备');
            if (ef.gamble) parts.push(`赌注${Math.round(ef.gamble.prob * 100)}%`);
            if (ef.forced) parts.push('随机结果');
            if (ef.invest) {
                if (ef.invest.kind === 'battleWinGold') parts.push(`投资→战斗胜+${ef.invest.value ?? 0}金`);
                else if (ef.invest.kind === 'restHeal') parts.push('投资→休息翻倍');
                else parts.push('投资→强化升级');
            }
            if (ef.fight) parts.push('触发战斗');
            if (ef.fightDebuff) parts.push(`未来敌+${ef.fightDebuff.enemyHpBonus}命`);
        }
        return parts.join(' · ') || '……';
    };

    // [2026-08-28 事件] 点事件选项：含顶层 removeCards → 进删卡子步骤；否则直接回调
    const handleEventChoice = (i: number) => {
        if (!event || !onEvent) return;
        const removeCount = event.choices[i]?.effects.find(ef => ef.removeCards && !ef.forced)?.removeCards ?? 0;
        if (removeCount > 0) {
            setPendingChoice(i);
            setRemovePicks([]);
            setEventStep('remove');
            return;
        }
        onEvent(event.id, i);
        onClose(); // [2026-08-29 修复] 选择后关闭事件弹窗（否则可无限触发效果）
    };
    const removableDeck = run ? Array.from(new Set(run.deck.filter(k => !CARD_DB[k]?.isChampion))) : [];
    const removeNeeded = event?.choices[pendingChoice]?.effects.find(ef => ef.removeCards && !ef.forced)?.removeCards ?? 0;

    const handleConfirmEnhance = () => {
        if (!selectedEnhanceId) return;
        setAnimPhase('exit');
        setTimeout(() => {
            onEnhance?.(selectedEnhanceId);
            onClose();
        }, 500);
    };
    // [2026-08-29] 强化三选一刷新：清空选中 → 消耗刷新次数（外层处理）→ 重新生成候选
    const handleRefreshEnhance = () => {
        if (animPhase !== 'select') return;
        setSelectedEnhanceId(null);
        onRefresh?.();
    };
    // [2026-08-31 莉莉子 开发者] 全量选择器：品质筛选 chips 切换
    const toggleDevQuality = (q: EnhancementRarity) => {
        setDevQualities(prev => {
            const next = new Set(prev);
            if (next.has(q)) next.delete(q); else next.add(q);
            return next;
        });
    };
    const resetDevFilter = () => { setDevSearch(''); setDevQualities(new Set()); };
    // 过滤当前池（品质多选 OR + 文字搜索名称/描述，按品质排序）
    const devFiltered = useMemo(() => (pool: MazeBuff[] = []): MazeBuff[] => {
        const kw = devSearch.trim().toLowerCase();
        return pool
            .filter(b => {
                if (devQualities.size > 0 && !devQualities.has(b.rarity)) return false;
                if (kw) {
                    const hay = `${b.name} ${b.description}`.toLowerCase();
                    if (!hay.includes(kw)) return false;
                }
                return true;
            })
            .sort((a, b) => QUALITY_RANK[a.rarity] - QUALITY_RANK[b.rarity]);
    }, [devSearch, devQualities]);
    // 切换选中（多选）
    const toggleDevPick = (id: string, side: 'player' | 'enemy') => {
        const setter = side === 'player' ? setDevSelPlayer : setDevSelEnemy;
        setter(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };
    // 全量选择器确定：玩家强化多选叠加 + 敌方强化注入下一场战斗
    const handleDevConfirm = () => {
        if (devSelPlayer.size === 0 && devSelEnemy.size === 0) return;
        setAnimPhase('exit');
        setTimeout(() => {
            onDevPick?.(Array.from(devSelPlayer), Array.from(devSelEnemy));
            onClose();
        }, 450);
    };

    // ═══════════════════════════════════════════════
    //  迷宫强化 · 校准式全屏开放式（参考 CalibratePanel）
    // ═══════════════════════════════════════════════
    if (type === 'enhance') {
        // [2026-08-31 莉莉子 开发者] 开发者全量强化选择器：双 Tab + 多选叠加 + 筛选/搜索 + 已拥有角标
        if (isDev) {
            const playerPool = devPlayerPool ?? [];
            const enemyPool = devEnemyPool ?? [];
            const ownedSet = new Set(ownedEnhancements ?? []);
            const curPool = devTab === 'player' ? playerPool : enemyPool;
            const filtered = devFiltered(curPool);
            const devCount = devSelPlayer.size + devSelEnemy.size;
            const isCurSel = (id: string) => devTab === 'player' ? devSelPlayer.has(id) : devSelEnemy.has(id);
            return (
                <AnimatePresence>
                    <div className="fixed inset-0 z-[700] flex flex-col items-center justify-center">
                        <div className="absolute inset-0 bg-black/70 pointer-events-auto" onClick={(e) => e.stopPropagation()} />

                        <motion.div
                            initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}
                            className="relative z-10 w-[min(1100px,94vw)] max-h-[88vh] bg-slate-900/95 border border-violet-500/30 rounded-2xl shadow-2xl flex flex-col overflow-hidden"
                        >
                            {/* 头部：标题 + Tab 切换 + 关闭 */}
                            <div className="shrink-0 px-6 py-4 border-b border-white/10 flex items-center gap-4 flex-wrap">
                                <div className="flex items-center gap-3">
                                    <Layers size={22} className="text-violet-400" />
                                    <div>
                                        <h3 className="text-xl font-black tracking-widest text-white">迷宫强化 · 开发者全量</h3>
                                        <p className="text-[11px] text-violet-200/70 font-mono mt-0.5">DEV BUILD — 可多选叠加 · 我方立即生效 / 敌方注入下一场战斗</p>
                                    </div>
                                </div>
                                <div className="flex-1" />
                                <div className="flex items-center gap-1 p-1 rounded-xl bg-white/5 border border-white/10">
                                    <button onClick={() => setDevTab('player')}
                                        className={`px-4 py-1.5 rounded-lg text-sm font-black tracking-wider transition-all ${devTab === 'player' ? 'bg-emerald-500/25 text-emerald-300 border border-emerald-400/40' : 'text-gray-400 hover:text-white'}`}>
                                        我方强化 <span className="text-xs font-mono">{devSelPlayer.size ? `✓${devSelPlayer.size}` : playerPool.length}</span>
                                    </button>
                                    <button onClick={() => setDevTab('enemy')}
                                        className={`px-4 py-1.5 rounded-lg text-sm font-black tracking-wider transition-all ${devTab === 'enemy' ? 'bg-red-500/25 text-red-300 border border-red-400/40' : 'text-gray-400 hover:text-white'}`}>
                                        敌方强化 <span className="text-xs font-mono">{devSelEnemy.size ? `✓${devSelEnemy.size}` : enemyPool.length}</span>
                                    </button>
                                </div>
                                <button onClick={onClose} className="p-1.5 rounded-md hover:bg-white/10 text-gray-400 hover:text-white transition-colors" title="返回地图 (ESC)">
                                    <X size={18} />
                                </button>
                            </div>

                            {/* 筛选栏：稀有度 chips + 搜索 + 计数 */}
                            <div className="shrink-0 px-6 py-3 border-b border-white/10 flex items-center gap-3 flex-wrap">
                                <div className="flex items-center gap-1.5">
                                    {QUALITY_ORDER.map(q => {
                                        const meta = RARITY_META[q];
                                        const on = devQualities.has(q);
                                        return (
                                            <button key={q} onClick={() => toggleDevQuality(q)}
                                                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all ${on ? '' : 'opacity-40 hover:opacity-80'}`}
                                                style={{ color: meta.color, borderColor: `${meta.color}55`, background: on ? `${meta.color}22` : 'transparent' }}>
                                                {meta.label}
                                            </button>
                                        );
                                    })}
                                </div>
                                <div className="relative flex-1 min-w-[160px] max-w-[280px]">
                                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                                    <input
                                        value={devSearch}
                                        onChange={e => setDevSearch(e.target.value)}
                                        placeholder="搜索强化…"
                                        className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-violet-400/60"
                                    />
                                </div>
                                {(devSearch || devQualities.size > 0) && (
                                    <button onClick={resetDevFilter} className="text-[11px] px-2 py-1 rounded-md text-gray-400 hover:text-white bg-white/5 border border-white/10">清除筛选</button>
                                )}
                                <span className="text-xs text-gray-500 font-mono ml-auto">{filtered.length} / {curPool.length}</span>
                            </div>

                            {/* 主体网格 */}
                            <div className="flex-1 overflow-y-auto p-5">
                                {filtered.length === 0 ? (
                                    <p className="text-gray-500 text-center py-10">没有匹配的强化</p>
                                ) : (
                                    <div className="grid grid-cols-[repeat(auto-fill,minmax(215px,1fr))] gap-3">
                                        {filtered.map(buff => (
                                            <DevEnhBlock key={buff.id} buff={buff}
                                                selected={isCurSel(buff.id)}
                                                owned={devTab === 'player' ? ownedSet.has(buff.id) : false}
                                                onClick={() => toggleDevPick(buff.id, devTab)} />
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* 底部：返回地图 + 确定 */}
                            <div className="shrink-0 px-6 py-4 border-t border-white/10 flex items-center justify-center gap-4">
                                <button onClick={onClose} className="px-8 py-2.5 rounded-xl bg-white/10 font-bold text-gray-300 hover:bg-white/15 transition-colors">返回地图</button>
                                <button onClick={handleDevConfirm}
                                    disabled={devCount === 0}
                                    className={`px-12 py-2.5 rounded-xl font-black text-lg tracking-widest transition-all ${devCount > 0 ? 'bg-gradient-to-r from-violet-600 to-purple-400 hover:scale-105 hover:shadow-[0_0_30px_rgba(168,85,247,0.6)]' : 'bg-white/10 text-gray-500 cursor-not-allowed'}`}>
                                    确定{devCount > 0 && `（${devCount}）`}
                                </button>
                            </div>
                        </motion.div>
                    </div>
                </AnimatePresence>
            );
        }
        const opts = enhanceOptions ?? [];
        return (
            <AnimatePresence>
                <div className="fixed inset-0 z-[700] flex flex-col items-center justify-center">
                    {/* 全屏点击拦截层 */}
                    <div className="absolute inset-0 bg-black/70 pointer-events-auto" onClick={(e) => e.stopPropagation()} />

                    {/* 顶部标题 */}
                    {animPhase === 'select' && (
                        <motion.div
                            initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}
                            className="absolute top-[16%] left-0 right-0 w-full text-center pointer-events-auto"
                        >
                            <div className="flex items-center justify-center gap-3 mb-1">
                                <Sparkles size={34} className="text-violet-400" />
                                <h2 className="text-5xl font-black text-white drop-shadow-[0_5px_15px_rgba(0,0,0,0.8)] tracking-widest">迷宫强化</h2>
                            </div>
                            <p className="text-violet-200 mt-2 font-mono text-lg tracking-[0.2em] opacity-80">CHOOSE A MAZE ENHANCEMENT</p>
                        </motion.div>
                    )}

                    {/* 卡牌区域：并排 + 每张带角度 + 从下方升入 */}
                    <div className="relative flex items-center justify-center pointer-events-auto" style={{ marginTop: '6vh' }}>
                        <div className="flex gap-6">
                            {opts.length > 0 ? (
                                <AnimatePresence>
                                    {opts.map((opt, index) => {
                                        const isSelected = selectedEnhanceId === opt.id;
                                        const angle = (index - (opts.length - 1) / 2) * 9; // 中心向两侧倾斜（程要求调大）
                                        const variants: Variants = {
                                            enter: {
                                                x: 0, y: 60, scale: 0.4, rotate: angle, opacity: 0,
                                                transition: { delay: index * 0.1, duration: 0.6, type: 'spring', damping: 18 },
                                            },
                                            select: {
                                                x: 0, y: isSelected ? -50 : 0,
                                                scale: isSelected ? 1.0 : 0.88,
                                                rotate: isSelected ? 0 : angle,
                                                opacity: 1,
                                                transition: { type: 'spring', stiffness: 300 },
                                            },
                                            exit: {
                                                x: 0, y: 80, scale: 0.3, opacity: 0, rotate: angle * 2,
                                                transition: { duration: 0.5, ease: 'easeInOut', delay: index * 0.06 },
                                            },
                                        };
                                        return (
                                            <motion.div
                                                key={opt.id}
                                                className="relative flex flex-col items-center cursor-pointer"
                                                variants={variants}
                                                initial="enter"
                                                animate={animPhase}
                                                exit="exit"
                                                onClick={() => { if (animPhase === 'select') setSelectedEnhanceId(opt.id); }}
                                            >
                                                {/* 选中光晕（不用 layoutId：切换时旧的直接卸载、新的原地出现，不再"飞过去"） */}
                                                {isSelected && animPhase === 'select' && (
                                                    <div className="absolute -inset-2 rounded-xl border-4 border-yellow-400 shadow-[0_0_25px_#eab308] z-0" />
                                                )}
                                                <div className="relative z-10 origin-bottom">
                                                    <EnhancementCard enhancement={opt} isSelected={isSelected} onClick={() => {}} />
                                                </div>
                                            </motion.div>
                                        );
                                    })}
                                </AnimatePresence>
                            ) : (
                                <button onClick={onClose}
                                    className="px-8 py-2 rounded-lg bg-white/10 hover:bg-white/20 font-bold transition-colors">
                                    返回地图
                                </button>
                            )}
                        </div>
                    </div>

                    {/* 底部：刷新（确定左）+ 确定：flex 容器居中（不用 translate，避免被 framer-motion 的 transform 覆盖导致右偏） */}
                    {animPhase === 'select' && opts.length > 0 && (
                        <div className="absolute bottom-[10%] left-0 right-0 z-30 flex justify-center gap-4">
                            {onRefresh && (
                                <motion.button
                                    initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                                    onClick={(e) => { e.stopPropagation(); if (refreshCount > 0) handleRefreshEnhance(); }}
                                    disabled={refreshCount <= 0}
                                    className={`px-8 py-3 rounded-xl bg-white/10 font-black text-lg tracking-widest transition-all hover:scale-105 ${refreshCount > 0 ? 'text-cyan-300 hover:bg-cyan-500/20' : 'text-gray-600 cursor-not-allowed'}`}
                                >
                                    刷新({refreshCount})
                                </motion.button>
                            )}
                            <motion.button
                                initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                                onClick={(e) => { e.stopPropagation(); handleConfirmEnhance(); }}
                                disabled={!selectedEnhanceId}
                                className={`px-12 py-3 rounded-xl font-black text-lg tracking-widest transition-all
                                    ${selectedEnhanceId
                                        ? 'bg-gradient-to-r from-violet-600 to-purple-400 hover:scale-105 hover:shadow-[0_0_30px_rgba(168,85,247,0.6)]'
                                        : 'bg-white/10 text-gray-500 cursor-not-allowed'}`}
                            >
                                确定
                            </motion.button>
                        </div>
                    )}
                </div>
            </AnimatePresence>
        );
    }

    // ═══════════════════════════════════════════════
    //  [2026-08-28 事件] 事件节点：描述 + 选项卡片（含 Leave / 删卡子步骤）
    // ═══════════════════════════════════════════════
    if (type === 'event' && event) {
        return (
            <AnimatePresence>
                <div className="fixed inset-0 z-[700] flex items-center justify-center bg-black/80 backdrop-blur-sm">
                    <motion.div
                        initial={{ scale: 0.9, opacity: 0, y: 20 }}
                        animate={{ scale: 1, opacity: 1, y: 0 }}
                        exit={{ scale: 0.9, opacity: 0, y: 20 }}
                        className="w-[min(900px,94vw)] max-w-[92vw] rounded-2xl bg-slate-900/95 border border-white/10 text-white overflow-hidden"
                    >
                        {/* [2026-08-29 程拍板] 上方背景图：随机 dialogue 图（进弹窗固定一次），下方选项 */}
                        <div className="relative h-44 shrink-0 overflow-hidden">
                            <img src={eventBg} alt="" className="w-full h-full object-cover" />
                            <div className="absolute inset-0 bg-gradient-to-t from-slate-900/95 via-slate-900/40 to-transparent" />
                        </div>

                        {/* 下方内容区：类型标签 + 名称 + 描述 + 选项（可滚动） */}
                        <div className="overflow-y-auto max-h-[calc(86vh-12rem)] p-6">
                        {/* 头部：类型标签 + 名称 */}
                        <div className="flex items-center gap-2 mb-3">
                            <span className="text-[10px] px-2 py-0.5 rounded-full font-mono border border-violet-400/40 bg-violet-500/10 text-violet-300">
                                {ROGUE_EVENT_TYPE_LABELS[event.type]}事件
                            </span>
                            <h3 className="text-2xl font-black tracking-widest">{event.name}</h3>
                        </div>
                        <p className="text-sm text-gray-300 leading-relaxed mb-6 min-h-[3rem]">{event.desc}</p>

                        {eventStep === 'choices' ? (
                            <div className="flex flex-col gap-3">
                                {event.choices.map((ch, i) => (
                                    <button
                                        key={i}
                                        onClick={(e) => { e.stopPropagation(); handleEventChoice(i); }}
                                        className="group text-left px-4 py-3 rounded-xl border bg-white/5 hover:bg-white/10 hover:border-violet-400/50 transition-all"
                                    >
                                        <div className="flex items-center justify-between gap-3">
                                            <span className="font-bold text-white">{ch.label}</span>
                                            <span className="text-[11px] text-right shrink-0 text-gray-400 group-hover:text-violet-300">
                                                {effectHints(ch.effects)}
                                            </span>
                                        </div>
                                    </button>
                                ))}
                                {event.allowLeave !== false && (
                                    <button
                                        onClick={(e) => { e.stopPropagation(); onClose(); }}
                                        className="px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/15 border border-white/10 text-gray-300 font-bold transition-all"
                                    >
                                        离开
                                    </button>
                                )}
                            </div>
                        ) : (
                            <div className="flex flex-col gap-3">
                                <h4 className="text-sm font-bold text-red-300 mb-3">选择要删除的卡牌（{removePicks.length}/{removeNeeded}）</h4>
                                {removableDeck.length === 0 ? (
                                    <p className="text-gray-500 text-sm py-4 text-center">牌组没有可删的牌</p>
                                ) : (
                                    <div className="flex flex-wrap gap-3 justify-center">
                                        {removableDeck.map(key => {
                                            const isPick = removePicks.includes(key);
                                            return (
                                                <DeckPickCard
                                                    key={key}
                                                    cardKey={key}
                                                    run={run}
                                                    isSelected={isPick}
                                                    accent="red"
                                                    badge={`×${run?.deck.filter(k => k === key).length ?? 1}`}
                                                    onClick={() => setRemovePicks(prev =>
                                                        isPick ? prev.filter(k => k !== key)
                                                            : prev.length < removeNeeded ? [...prev, key] : prev)}
                                                />
                                            );
                                        })}
                                    </div>
                                )}
                                <div className="flex gap-3 justify-end mt-2">
                                    <button onClick={() => setEventStep('choices')} className="px-4 py-2 rounded-lg bg-white/5 hover:bg-white/15 font-bold text-gray-300 transition-all">返回</button>
                                    <button
                                        disabled={removePicks.length < removeNeeded}
                                        onClick={() => { onEvent?.(event.id, pendingChoice, removePicks); onClose?.(); }} // [2026-08-29 修复] 删卡确认后也关闭弹窗
                                        className={`px-5 py-2 rounded-lg font-black transition-all ${removePicks.length >= removeNeeded ? 'bg-red-600 hover:bg-red-500' : 'bg-white/5 text-gray-500 cursor-not-allowed'}`}
                                    >
                                        确认删除
                                    </button>
                                </div>
                            </div>
                        )}
                        </div>{/* [2026-08-29] 内容区闭合（上方背景图 + 下方内容区布局） */}
                    </motion.div>
                </div>
            </AnimatePresence>
        );
    }

    // ═══════════════════════════════════════════════
    //  [2026-08-29 休整 v2] 篝火营地：休整 / 净化 / 复制 / 探路
    // ═══════════════════════════════════════════════
    if (type === 'rest') {
        const restDeck = run ? Array.from(new Set(run.deck.filter(k => !!CARD_DB[k]))) : [];
        const restFiltered = restMode === 'scout'
            ? restDeck.filter(k => CARD_DB[k]?.type === 'unit' && !CARD_DB[k]?.isChampion)
            : restMode === 'remove'
                ? restDeck.filter(k => !CARD_DB[k]?.isChampion)
                : restDeck;
        const restChoices = [
            { key: 'rest', icon: <Flame size={20} className="text-amber-400" />, title: '休整', desc: '恢复 30% 生命值', color: 'border-amber-500/40 hover:border-amber-400' },
            { key: 'remove', icon: <Trash2 size={20} className="text-red-400" />, title: '净化卡牌', desc: '免费移除一张卡', color: 'border-red-500/40 hover:border-red-400' },
            { key: 'copy', icon: <Copy size={20} className="text-blue-400" />, title: '复制卡牌', desc: '复制一张已有卡牌', color: 'border-blue-500/40 hover:border-blue-400' },
            { key: 'scout', icon: <MapPin size={20} className="text-emerald-400" />, title: '探路', desc: '派单位卡探路，2 节点后带装备回归', color: 'border-emerald-500/40 hover:border-emerald-400' },
        ] as const;
        const restLabels: Record<string, string> = { remove: '净化 · 选择要移除的卡', copy: '复制 · 选择要复制的卡', scout: '探路 · 选择要派出的单位卡' };
        return (
            <AnimatePresence>
                <div className="fixed inset-0 z-[700] flex items-center justify-center bg-black/80 backdrop-blur-sm">
                    <motion.div
                        initial={{ scale: 0.92, opacity: 0, y: 16 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.92, opacity: 0, y: 16 }}
                        className="w-[min(920px,94vw)] max-h-[88vh] rounded-2xl border border-amber-500/30 bg-gradient-to-b from-slate-900 via-amber-950/40 to-slate-900 p-6 text-white shadow-[0_0_50px_rgba(245,158,11,0.15)] overflow-y-auto"
                    >
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-3">
                                <Flame size={28} className="text-amber-400" />
                                <h3 className="text-2xl font-black tracking-widest">篝火 · 休整</h3>
                            </div>
                            {restStep === 'select' && (
                                <button onClick={() => setRestStep('menu')} className="text-xs text-gray-400 hover:text-white px-3 py-1 rounded-lg bg-white/5 transition-colors">返回菜单</button>
                            )}
                        </div>

                        {restStep === 'menu' ? (
                            <>
                                <p className="text-sm text-amber-200/70 mb-4">旅途中的休整地，选择一个行动（当前 HP {hp}/{maxHp}）</p>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                    {restChoices.map(c => (
                                        <button key={c.key}
                                            onClick={() => {
                                                if (c.key === 'rest') { onRest(); onClose(); }
                                                else { setRestMode(c.key); setRestStep('select'); }
                                            }}
                                            className={`flex flex-col items-center gap-2 px-4 py-4 rounded-xl bg-white/5 border transition-all hover:scale-[1.02] ${c.color}`}
                                        >
                                            <div className="shrink-0">{c.icon}</div>
                                            <div className="text-center">
                                                <div className="font-black">{c.title}</div>
                                                <div className="text-[11px] text-gray-400 mt-0.5 leading-snug">{c.desc}</div>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            </>
                        ) : (
                            <>
                                <h4 className="text-sm font-bold text-gray-300 mb-3">{restLabels[restMode]}</h4>
                                {restFiltered.length === 0 ? (
                                    <p className="text-gray-500 text-sm py-4 text-center">牌组没有可选的卡</p>
                                ) : (
                                    <div className="flex flex-wrap gap-3 justify-center">
                                        {restFiltered.map(key => (
                                            <DeckPickCard
                                                key={key}
                                                cardKey={key}
                                                run={run}
                                                onClick={() => handleRestPick(key)}
                                            />
                                        ))}
                                    </div>
                                )}
                            </>
                        )}
                    </motion.div>
                </div>
            </AnimatePresence>
        );
    }

    // ═══════════════════════════════════════════════
    //  其余节点 · 保留原小窗布局
    // ═══════════════════════════════════════════════
    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-[700] flex items-center justify-center bg-black/80 backdrop-blur-sm">
                <motion.div
                    initial={{ scale: 0.9, opacity: 0, y: 20 }}
                    animate={{ scale: 1, opacity: 1, y: 0 }}
                    exit={{ scale: 0.9, opacity: 0, y: 20 }}
                    className="rounded-2xl bg-slate-900/95 border border-white/10 p-8 flex flex-col items-center gap-4 text-white min-w-[420px]"
                >
                    {meta.icon}
                    <h3 className="text-2xl font-black">{meta.title}</h3>
                    <p className="text-sm text-gray-300 text-center">{meta.desc}</p>

                    <button onClick={onClose}
                        className="px-8 py-2 rounded-lg bg-white/10 hover:bg-white/20 font-bold transition-colors">
                        返回地图
                    </button>
                </motion.div>
            </div>
        </AnimatePresence>
    );
};
