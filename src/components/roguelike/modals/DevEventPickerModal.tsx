// ==========================================
// 悖论迷宫 · 开发者「事件审阅台」
// [2026-10-10 莉莉子 · 开发者功能]
//
// 需求（程）：开发者账号进入事件节点后，点右上角「事件列表」，
//   可以**任意挑选当前已有的事件**来体验；哪怕已经做出了选择，也能切换事件重选。
//
// 机制：点某条事件 ⇒ 整局状态**回滚到刚进这个节点那一刻**
//   （快照由 RogueMapScreen 持有，通过 `onDevRestoreRun` 塞回 useRoguelikeRun）
//   ⇒ 以该事件重新开始 ⇒ 可以无限次反复审阅文案与分支，血金不会漂。
//
// 为什么入口在事件弹窗内、而不是地图右上角：
//   事件弹窗是 `fixed inset-0 z-[700]` 全屏覆盖层，地图上的按钮会被它盖住、点不到。
//
// ⚠️ 本组件只负责「选哪条事件」，**不自己动任何状态** —— 回滚与切换全部由 RogueMapScreen 收口。
// ==========================================
import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { X, Search, RotateCcw, ListChecks, AlertTriangle } from 'lucide-react';
import {
    ROGUE_EVENT_TYPE_LABELS,
    ROGUE_EVENT_RARITY_LABELS,
    rarityOfEvent,
    type RogueEvent,
    type RogueEventType,
    type RogueEventEffect,
} from '../../../data/roguelike/events';

/** 事件类型 → 标签配色（对齐 NodeEventModal 的紫罗兰基调，各类给一个可区分的色相） */
const TYPE_COLORS: Record<RogueEventType, string> = {
    gift: 'border-emerald-400/40 bg-emerald-500/10 text-emerald-300',
    trade: 'border-sky-400/40 bg-sky-500/10 text-sky-300',
    tradeoff: 'border-amber-400/40 bg-amber-500/10 text-amber-300',
    gamble: 'border-fuchsia-400/40 bg-fuchsia-500/10 text-fuchsia-300',
    forced: 'border-red-400/40 bg-red-500/10 text-red-300',
    investment: 'border-teal-400/40 bg-teal-500/10 text-teal-300',
    fight: 'border-orange-400/40 bg-orange-500/10 text-orange-300',
    edit: 'border-violet-400/40 bg-violet-500/10 text-violet-300',
    deep: 'border-indigo-400/40 bg-indigo-500/10 text-indigo-300',
};

const ALL_TYPES = Object.keys(ROGUE_EVENT_TYPE_LABELS) as RogueEventType[];

/** 一条事件里所有选项的效果（含按难度整档替换的那份），用于推导"这条事件有什么特殊玩法" */
const allEffectsOf = (ev: RogueEvent): RogueEventEffect[] =>
    ev.choices.flatMap(c => [
        ...(c.effects ?? []),
        ...Object.values(c.effectsByDifficulty ?? {}).flatMap(list => list ?? []),
    ]);

/** 特殊玩法标记（让开发者一眼看出这条事件的形态） */
const flagsOf = (ev: RogueEvent): string[] => {
    const flags: string[] = [];
    const efs = allEffectsOf(ev);
    if (efs.some(ef => ef.fight)) flags.push('⚔️ 含战斗');
    if (ev.deepEcho) flags.push(`🌀 深层回响 ×${ev.deepEcho.layers}`);
    if (efs.some(ef => ef.gamble)) flags.push('🎲 赌注');
    if (efs.some(ef => ef.removeCards)) flags.push('🗑️ 自选删卡');
    if (ev.allowLeave === false) flags.push('⚡ 不可离开');
    return flags;
};

/**
 * 回滚锚点摘要（由 RogueMapScreen 从快照里摘出来，只传可展示的叶子字段）。
 * ⚠️ 为什么要把它显示出来：锚点存在 `RogueMapScreen` 的 ref 里，而地图在**进战斗 / 暂离**时会卸载
 *   （`App.tsx` 只在 `appState === 'rogue_map'` 时挂载），ref 随之丢失、重挂载后补的锚点已经是"被污染过"的状态。
 *   与其让开发者以为"一定回滚了"，不如把**回滚目标的确切数值**摆在眼前。
 */
export interface DevEventAnchor {
    nodeId: string;
    hp: number;
    maxHp: number;
    gold: number;
    deckCount: number;
    enhancementCount: number;
    /**
     * 锚点是否**建立于本节点结算之后**（= 锚点快照里 `resolvedNodes` 已包含本节点）。
     * 判据为什么这样取：
     *   · 首次进入事件节点时节点还没 `resolvedNodes` ⇒ 锚点干净，回滚 = "回到刚进节点那一刻"；
     *   · 而地图因**进战斗 / 暂离**卸载后重挂载、由按钮补出来的锚点，通常是"已经选过一次"之后取的 ⇒ 脏，
     *     回滚只能回到"那份被污染的状态"，撤不掉那次结算。
     * `true` 时界面必须给出**警告**，否则开发者会把"当前值"误当成"回滚目标"（两者长得一样）。
     */
    settled: boolean;
}

interface DevEventPickerModalProps {
    /** 全量事件池（由调用方传 `ROGUE_EVENTS`；不在此处直接 import，便于调用方按需裁剪） */
    events: RogueEvent[];
    /** 当前正在体验的事件 id（高亮 + 「当前」角标） */
    currentId?: string;
    /**
     * 回滚锚点摘要。
     *   · 有值 ⇒ 切换事件会回滚到这份状态（数值直接展示，不存在"以为回滚了其实没有"）
     *   · `null` / 缺省 ⇒ 本节点**还没建立锚点** ⇒ 切换**不会回滚**，效果会叠加 —— 必须如实告知
     */
    anchor?: DevEventAnchor | null;
    /** 选中某条事件 → 回滚整局状态并以它重新开始 */
    onPick: (ev: RogueEvent) => void;
    onClose: () => void;
}

export const DevEventPickerModal: React.FC<DevEventPickerModalProps> = ({ events, currentId, anchor, onPick, onClose }) => {
    const [search, setSearch] = useState('');
    const [typeFilter, setTypeFilter] = useState<RogueEventType | 'all'>('all');

    const counts = useMemo(() => {
        const m = new Map<RogueEventType, number>();
        for (const ev of events) m.set(ev.type, (m.get(ev.type) ?? 0) + 1);
        return m;
    }, [events]);

    const shown = useMemo(() => {
        const kw = search.trim().toLowerCase();
        return events.filter(ev => {
            if (typeFilter !== 'all' && ev.type !== typeFilter) return false;
            if (!kw) return true;
            return (
                ev.name.toLowerCase().includes(kw) ||
                ev.desc.toLowerCase().includes(kw) ||
                ev.id.toLowerCase().includes(kw) ||
                ROGUE_EVENT_TYPE_LABELS[ev.type].includes(kw)
            );
        });
    }, [events, search, typeFilter]);

    /** 锚点数值串 —— "会回滚到哪"的可视凭证（两处分支共用，避免写法漂移） */
    const anchorStat = anchor ? (
        <span className="font-mono text-[11px] text-gray-200 bg-black/40 border border-white/10 rounded px-1.5 py-0.5">
            HP {anchor.hp}/{anchor.maxHp} · 金币 {anchor.gold} · 牌组 {anchor.deckCount} 张 · 强化 {anchor.enhancementCount}
        </span>
    ) : null;

    return (
        <div className="fixed inset-0 z-[900] flex items-center justify-center bg-black/85 backdrop-blur-sm p-4" onClick={onClose}>
            <motion.div
                initial={{ scale: 0.94, opacity: 0, y: 16 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                transition={{ duration: 0.22, ease: 'easeOut' }}
                onClick={e => e.stopPropagation()}
                className="w-[1180px] max-h-[966px] flex flex-col rounded-2xl bg-slate-900/95 border border-violet-400/25 text-white overflow-hidden shadow-[0_0_60px_rgba(139,92,246,0.25)]"
            >
                {/* ── 头部 ── */}
                <div className="shrink-0 px-6 pt-5 pb-4 border-b border-white/10">
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <div className="flex items-center gap-2.5">
                                <ListChecks size={20} className="text-violet-300" />
                                <h2 className="text-xl font-black tracking-widest">事件审阅台</h2>
                                <span className="text-[10px] px-2 py-0.5 rounded-full font-mono border border-violet-400/50 bg-violet-500/15 text-violet-200">
                                    DEVELOPER
                                </span>
                                <span className="text-[11px] font-mono text-gray-500">共 {events.length} 条</span>
                            </div>
                            {!anchor ? (
                                /* 防御性分支：当前两条入口（地图按钮 / 弹窗内按钮）都会先补锚点，理论上到不了这里；
                                   留着是为了将来若新增入口，能显式暴露"不回滚"而不是静默叠加。 */
                                <p className="mt-1.5 text-xs leading-relaxed flex items-start gap-1.5 text-red-300/90">
                                    <AlertTriangle size={12} className="shrink-0 mt-0.5" />
                                    <span>
                                        本节点<span className="font-bold">没有回滚锚点</span> ⇒ 切换事件<span className="font-bold">不会回滚</span>当前状态，效果会叠加
                                    </span>
                                </p>
                            ) : anchor.settled ? (
                                /* [2026-10-10 · 第3轮独立审查修复] **脏锚点必须显式标记**：
                                   地图因进战斗 / 暂离卸载后重挂载，按钮补出来的锚点是"本节点已经结算过之后"的状态，
                                   它和干净锚点在界面上长得一模一样 ⇒ 不标记的话，开发者会把"当前值"当成"回滚目标"。 */
                                <div className="mt-1.5 text-xs leading-relaxed flex flex-wrap items-center gap-x-1.5 gap-y-1 text-amber-300/90">
                                    <AlertTriangle size={12} className="shrink-0" />
                                    <span>
                                        锚点取自<span className="font-bold">本节点结算之后</span>（地图进过战斗 / 暂离后重挂载补的）
                                        ⇒ 切换会回滚到下面这份数值，但<span className="font-bold">撤不掉那次结算</span>
                                    </span>
                                    {anchorStat}
                                </div>
                            ) : (
                                <p className="mt-1.5 text-xs text-gray-400 leading-relaxed flex flex-wrap items-center gap-x-1.5 gap-y-1">
                                    <RotateCcw size={12} className="text-amber-300 shrink-0" />
                                    <span>点任意事件 ⇒ <span className="text-amber-200 font-bold">回滚到锚点</span></span>
                                    {anchorStat}
                                    <span>并以该事件重新开始（可反复切换）</span>
                                </p>
                            )}
                        </div>
                        <button
                            onClick={onClose}
                            title="关闭"
                            className="shrink-0 p-2 rounded-full bg-slate-800 hover:bg-slate-700 border border-white/15 hover:border-white/40 transition-all"
                        >
                            <X size={18} className="text-white" />
                        </button>
                    </div>

                    {/* ── 搜索 + 类型筛选 ── */}
                    <div className="mt-4 flex items-center gap-2">
                        <div className="relative shrink-0 w-64">
                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                            <input
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                placeholder="搜索事件名 / 描述 / id"
                                className="w-full pl-8 pr-3 py-2 rounded-lg bg-black/40 border border-white/10 focus:border-violet-400/60 outline-none text-sm placeholder:text-gray-600"
                            />
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                            <button
                                onClick={() => setTypeFilter('all')}
                                className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                                    typeFilter === 'all'
                                        ? 'border-violet-400/70 bg-violet-500/20 text-violet-100'
                                        : 'border-white/10 bg-white/5 text-gray-400 hover:bg-white/10'
                                }`}
                            >
                                全部 {events.length}
                            </button>
                            {ALL_TYPES.map(t => (
                                <button
                                    key={t}
                                    onClick={() => setTypeFilter(t)}
                                    className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                                        typeFilter === t
                                            ? 'border-violet-400/70 bg-violet-500/20 text-violet-100'
                                            : 'border-white/10 bg-white/5 text-gray-400 hover:bg-white/10'
                                    }`}
                                >
                                    {ROGUE_EVENT_TYPE_LABELS[t]} {counts.get(t) ?? 0}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* ── 事件列表 ── */}
                <div className="flex-1 overflow-y-auto px-6 py-4">
                    {shown.length === 0 ? (
                        <p className="py-16 text-center text-sm text-gray-500 italic">没有匹配的事件。</p>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                            {shown.map(ev => {
                                const isCurrent = ev.id === currentId;
                                const rarity = rarityOfEvent(ev);
                                const flags = flagsOf(ev);
                                return (
                                    <button
                                        key={ev.id}
                                        onClick={() => onPick(ev)}
                                        className={`relative text-left rounded-xl border p-3.5 flex flex-col gap-2 transition-all hover:scale-[1.02] hover:-translate-y-0.5 ${
                                            isCurrent
                                                ? 'border-violet-400/80 bg-violet-500/15 shadow-[0_0_22px_rgba(139,92,246,0.35)]'
                                                : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.07] hover:border-white/25'
                                        }`}
                                    >
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-mono border ${TYPE_COLORS[ev.type]}`}>
                                                {ROGUE_EVENT_TYPE_LABELS[ev.type]}
                                            </span>
                                            {ROGUE_EVENT_RARITY_LABELS[rarity] && (
                                                <span
                                                    className={`text-[10px] px-2 py-0.5 rounded-full font-mono border ${
                                                        rarity === 'legend'
                                                            ? 'border-amber-400/50 bg-amber-500/10 text-amber-300'
                                                            : 'border-sky-400/40 bg-sky-500/10 text-sky-300'
                                                    }`}
                                                >
                                                    {ROGUE_EVENT_RARITY_LABELS[rarity]}
                                                </span>
                                            )}
                                            {isCurrent && (
                                                <span className="text-[10px] px-2 py-0.5 rounded-full font-mono border border-violet-300/70 bg-violet-500/25 text-violet-100">
                                                  当前
                                                </span>
                                            )}
                                        </div>

                                        <h3 className="text-base font-black tracking-wide leading-tight">{ev.name}</h3>
                                        <p className="text-[11px] text-gray-400 leading-relaxed line-clamp-3">{ev.desc}</p>

                                        {flags.length > 0 && (
                                            <div className="flex flex-wrap gap-1.5">
                                                {flags.map(f => (
                                                    <span key={f} className="text-[10px] px-1.5 py-0.5 rounded-md bg-black/40 border border-white/10 text-gray-300">
                                                        {f}
                                                    </span>
                                                ))}
                                            </div>
                                        )}

                                        <div className="mt-auto pt-1 flex items-center justify-between text-[10px] font-mono text-gray-500">
                                            <span>{ev.choices.length} 个选项{ev.allowLeave === false ? ' · 无离开' : ''}</span>
                                            <span className="truncate max-w-[45%]" title={ev.id}>{ev.id}</span>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>
            </motion.div>
        </div>
    );
};
