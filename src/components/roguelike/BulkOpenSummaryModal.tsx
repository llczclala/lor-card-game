// ==========================================
// 悖论迷宫 · 「一键全开」结果汇总窗（卡包 / 匣子共用）
//
// [2026-10-04 程拍板] 一键开包 / 一键开匣**全部开完后**，单独弹一个窗展示本次的**完整结果**。
//   程原话：「我们都做了一键开启的功能了，等全部开完再单开一个窗口展示所有的结果很难吗？」
//
//   与两个开箱弹窗的分工：连播照旧播（每发都能看到过程），**收尾统一走这里**——
//   一处实现、两个弹窗共用，避免"卡包一份、匣子又一份"（本项目历史上同类病反复出现）。
// ==========================================
import React from 'react';
import { eventBus, GameEvents } from '../../utils/eventBus'; // [2026-10-14 莉莉子] 交互音效
import { motion, AnimatePresence } from 'framer-motion';
import { X, Sparkles } from 'lucide-react';
import { RARITY_META } from './RarityIcon';
import type { EnhancementRarity } from '../../data/roguelike/enhancements';

export interface BulkSummaryItem {
    /** 主标题（匣子名 / 武装名 / 「神格碎片 ×N」） */
    name: string;
    rarity: EnhancementRarity;
    /** 图标 URL（可选；不传就只显示品质色六边形 + 品质名） */
    icon?: string;
    /** 小标签（「武装匣」「碎片匣」「武装」「碎片」之类） */
    kindLabel?: string;
    /** 副文案（如碎片的按英雄分配明细） */
    note?: string;
}

interface BulkOpenSummaryModalProps {
    open: boolean;
    title: string;
    items: BulkSummaryItem[];
    onClose: () => void;
}

const HEXAGON = 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)';

export const BulkOpenSummaryModal: React.FC<BulkOpenSummaryModalProps> = ({ open, title, items, onClose }) => (
    <AnimatePresence>
        {open && (
            <motion.div
                className="fixed inset-0 z-[1400] flex items-center justify-center bg-black/85 backdrop-blur-md"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                onClick={() => {eventBus.emit(GameEvents.UI_BACK); onClose(); }}
            >
                <motion.div
                    initial={{ opacity: 0, scale: 0.94, y: 14 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.96 }}
                    transition={{ type: 'spring', stiffness: 240, damping: 24 }}
                    onClick={e => e.stopPropagation()}
                    className="relative flex max-h-[861px] w-[720px] max-w-[1579px] flex-col rounded-2xl border border-cyan-400/35 bg-gradient-to-b from-slate-900/97 to-slate-950/97 p-7"
                    style={{ boxShadow: '0 0 60px rgba(34,211,238,0.22)' }}
                >
                    {/* 标题 */}
                    <div className="flex shrink-0 items-center gap-3">
                        <Sparkles size={20} className="text-cyan-300" />
                        <h3 className="text-xl font-black tracking-[0.16em] text-cyan-200">{title}</h3>
                        <span className="font-mono text-sm text-gray-400">共 {items.length} 项</span>
                        <button
                            onClick={() => {eventBus.emit(GameEvents.UI_BACK); onClose(); }}
                            className="ml-auto flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-gray-400 transition hover:bg-white/10 hover:text-white"
                        >
                            <X size={16} />
                        </button>
                    </div>

                    {/* 清单（可滚动） */}
                    <div className="mt-5 overflow-y-auto pr-1">
                        {items.map((it, i) => {
                            const meta = RARITY_META[it.rarity] ?? RARITY_META.common;
                            return (
                                <div key={i} className="mb-2 flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5">
                                    {/* 品质色六边形 + 图标 */}
                                    <div className="relative h-10 w-10 shrink-0" style={{ clipPath: HEXAGON, background: meta.color }}>
                                        <div className="absolute inset-[2px] flex items-center justify-center overflow-hidden" style={{ clipPath: HEXAGON, background: '#14171d' }}>
                                            {it.icon
                                                ? <img src={it.icon} alt="" className="h-full w-full object-cover" draggable={false} />
                                                : <span className="text-[10px] font-black" style={{ color: meta.color }}>{meta.label}</span>}
                                        </div>
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className="truncate text-sm font-black text-white">{it.name}</span>
                                            <span className="shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-mono"
                                                style={{ color: meta.color, borderColor: `${meta.color}55`, background: `${meta.color}11` }}>
                                                {meta.label}
                                            </span>
                                            {it.kindLabel && (
                                                <span className="shrink-0 rounded border border-amber-300/30 bg-amber-400/10 px-1.5 py-0.5 text-[10px] font-mono text-amber-200">
                                                    {it.kindLabel}
                                                </span>
                                            )}
                                        </div>
                                        {it.note && <div className="mt-0.5 text-[11px] leading-snug text-gray-400">{it.note}</div>}
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    <button
                        onClick={() => {eventBus.emit(GameEvents.UI_BACK); onClose(); }}
                        className="mt-5 shrink-0 rounded-xl bg-gradient-to-r from-cyan-600 to-teal-400 py-3 font-black tracking-widest text-white transition hover:scale-[1.02]"
                    >
                        知道了
                    </button>
                </motion.div>
            </motion.div>
        )}
    </AnimatePresence>
);
