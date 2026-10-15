// ==========================================
// 悖论迷宫 · 结算窗「本局构筑」回顾（迷宫强化清单）
//
// [2026-10-04 程拍板 · 方案 A] 背景：结算窗此前只有统计卡上的「迷宫强化 12」**一个数字** ——
//   玩家知道自己拿了 12 个，却一个都不认识；而这恰好是肉鸽最有纪念意义的部分。
//
// 口径（程 2026-10-04）：
//   · **通关 / 败亡都展示**（复盘价值一致）；本幕是"查询向"，**不播登场动画**
//   · **神格神经（`divfx_*`）单独分组** —— 那是**局外**解锁、开局即生效的积累，
//     混进"本局选的强化"里会让玩家误以为这局拿了这么多
//   · 组内按**品质降序**（神话 → 传说 → 史诗 → 稀有 → 优秀 → 普通）
//   · 图标 + 品质色描边复用 `RARITY_META`（与三选一/图鉴同一套视觉语言）
//
// ⚠️ 详情为什么放在**顶部固定条**而不是跟随图标的 hover 卡：
//   网格是 `overflow-y-auto` 的滚动容器 ⇒ 跟随式 hover 卡在最后一行会被裁掉。
//   顶部详情条还顺带解决了"长描述读不清"的问题。
// ==========================================
import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { X, Sparkles } from 'lucide-react';
import { MAZE_BUFFS, type MazeBuff } from '../../../data/roguelike/buffs';
import { RARITY_META } from '../RarityIcon';
import { eventBus, GameEvents } from '../../../utils/eventBus'; // [2026-10-14 莉莉子 🖱️] ESC 关闭音效

interface RunEnhancementsModalProps {
    /** 本局的强化 id 列表（= `run.enhancements`，含神格神经） */
    enhancements: string[];
    onClose: () => void;
}

/** 品质降序权重（数字越小越靠前） */
const RARITY_ORDER: Record<string, number> = {
    mythic: 0, legendary: 1, epic: 2, rare: 3, uncommon: 4, common: 5,
};

const byRarityDesc = (a: MazeBuff, b: MazeBuff): number =>
    (RARITY_ORDER[a.rarity] ?? 9) - (RARITY_ORDER[b.rarity] ?? 9);

export const RunEnhancementsModal: React.FC<RunEnhancementsModalProps> = ({ enhancements, onClose }) => {
    const [hoverId, setHoverId] = useState<string | null>(null);

    // ESC 关闭：capture + 阻止冒泡，避免被 App 的全局 ESC 监听抢走（那个监听管的是 appState 层）
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== 'Escape') return; eventBus.emit(GameEvents.UI_BACK);
            e.preventDefault();
            e.stopImmediatePropagation();
            onClose();
        };
        window.addEventListener('keydown', onKey, true);
        return () => window.removeEventListener('keydown', onKey, true);
    }, [onClose]);

    // 分组 + 组内按品质降序
    const { divinity, inRun } = useMemo(() => {
        const defs = enhancements
            .map(id => MAZE_BUFFS.find(b => b.id === id))
            .filter((b): b is MazeBuff => !!b);
        const div = defs.filter(d => d.id.startsWith('divfx_')).sort(byRarityDesc);
        const run = defs.filter(d => !d.id.startsWith('divfx_')).sort(byRarityDesc);
        return { divinity: div, inRun: run };
    }, [enhancements]);

    const total = divinity.length + inRun.length;
    const hoverDef = hoverId ? MAZE_BUFFS.find(b => b.id === hoverId) ?? null : null;

    return (
        <div
            className="fixed inset-0 z-[740] flex items-center justify-center bg-black/80"
            onClick={onClose}
        >
            <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 14 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ type: 'spring', stiffness: 240, damping: 24 }}
                onClick={e => e.stopPropagation()}
                className="relative flex max-h-[903px] w-[880px] max-w-[1579px] flex-col rounded-2xl border border-violet-400/30 bg-gradient-to-b from-slate-900/97 to-slate-950/97 p-7"
                style={{ boxShadow: '0 0 60px rgba(168,85,247,0.22)' }}
            >
                {/* ══ 标题 ══ */}
                <div className="flex shrink-0 items-center justify-between">
                    <div className="flex items-center gap-3">
                        <Sparkles size={22} className="text-violet-300" />
                        <h3 className="text-xl font-black tracking-[0.18em] text-violet-200">本 局 构 筑</h3>
                        <span className="font-mono text-sm text-gray-400">迷宫强化 ×{total}</span>
                    </div>
                    <button
                        onClick={onClose}
                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-gray-400 transition hover:bg-white/10 hover:text-white"
                    >
                        <X size={16} />
                    </button>
                </div>

                {/* ══ 详情条（固定高度 · 悬停图标时更新；不随图标浮动，故不会被滚动容器裁掉） ══ */}
                <div className="mt-4 flex min-h-[74px] shrink-0 items-center gap-3 rounded-xl border border-white/10 bg-black/40 px-4 py-3">
                    {hoverDef ? (
                        <>
                            <div
                                className="h-12 w-12 shrink-0 overflow-hidden rounded-lg border-2 bg-black"
                                style={{ borderColor: RARITY_META[hoverDef.rarity].color, boxShadow: `0 0 12px ${RARITY_META[hoverDef.rarity].color}55` }}
                            >
                                <img src={hoverDef.icon} alt={hoverDef.name} className="h-full w-full object-cover" />
                            </div>
                            <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                    <span className="text-sm font-black tracking-wider" style={{ color: RARITY_META[hoverDef.rarity].color }}>
                                        {hoverDef.name}
                                    </span>
                                    <span className="text-[10px] font-bold text-gray-500">{RARITY_META[hoverDef.rarity].label}</span>
                                </div>
                                <div className="mt-0.5 text-[12px] leading-snug text-gray-300">{hoverDef.description}</div>
                            </div>
                        </>
                    ) : (
                        <div className="w-full text-center text-[12px] text-gray-500">
                            将鼠标移到下方图标上，这里会显示它的名称与效果
                        </div>
                    )}
                </div>

                {/* ══ 网格（唯一可滚动区） ══ */}
                <div className="mt-5 overflow-y-auto pr-1">
                    {total === 0 && (
                        <div className="py-14 text-center text-sm text-gray-500">本局没有获得迷宫强化</div>
                    )}

                    <EnhancementGroup
                        title="神格神经"
                        note="局外解锁 · 开局即生效"
                        defs={divinity}
                        onHover={setHoverId}
                    />
                    <EnhancementGroup
                        title="局内强化"
                        note={divinity.length > 0 ? '本局在迷宫里获得的' : undefined}
                        defs={inRun}
                        onHover={setHoverId}
                    />
                </div>

                <div className="mt-4 shrink-0 text-center text-[11px] text-gray-500">
                    悬停图标查看名称与效果 · 按 Esc 关闭
                </div>
            </motion.div>
        </div>
    );
};

// ── 一组强化（标题 + 网格） ──
const EnhancementGroup: React.FC<{
    title: string;
    note?: string;
    defs: MazeBuff[];
    onHover: (id: string | null) => void;
}> = ({ title, note, defs, onHover }) => {
    if (defs.length === 0) return null;
    return (
        <div className="mb-6 last:mb-0">
            <div className="mb-2.5 flex items-center gap-2">
                <span className="text-[13px] font-black tracking-widest text-violet-200/90">{title}</span>
                <span className="font-mono text-[11px] text-gray-500">×{defs.length}</span>
                {note && <span className="text-[10px] text-gray-600">{note}</span>}
            </div>
            <div className="flex flex-wrap gap-2.5">
                {defs.map(def => {
                    const meta = RARITY_META[def.rarity];
                    return (
                        <motion.div
                            key={def.id}
                            whileHover={{ scale: 1.09, y: -2 }}
                            onMouseEnter={() => onHover(def.id)}
                            onMouseLeave={() => onHover(null)}
                            className="relative cursor-help"
                        >
                            {/* 图标 + 品质色描边 */}
                            <div
                                className="h-16 w-16 overflow-hidden rounded-xl border-2 bg-black"
                                style={{ borderColor: meta.color, boxShadow: `0 0 12px ${meta.color}55` }}
                            >
                                <img src={def.icon} alt={def.name} className="h-full w-full object-cover" />
                            </div>
                            {/* 品质小条（底部） */}
                            <div
                                className="absolute -bottom-1 left-1/2 h-1 w-8 -translate-x-1/2 rounded-full"
                                style={{ background: meta.color, boxShadow: `0 0 8px ${meta.color}` }}
                            />
                        </motion.div>
                    );
                })}
            </div>
        </div>
    );
};
