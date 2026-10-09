// ==========================================
// 悖论迷宫 · 通用二次确认弹窗（ConfirmDialog）
// [2026-10-08 莉莉子 · 交互回响层 批次2]
//   背景：迷宫里若干**不可逆 / 会消耗掉节点唯一机会**的动作，此前都是"点一下就执行"
//   （休整·净化永久删卡 / 派卡探路 / 商品刷新 / 放弃卡牌奖励 / 放弃天启者招募）。
//   口径（程 2026-10-08 批准）：
//     · **只给"不可逆 + 消耗唯一机会"的动作加确认** —— 高频购买类（买卡/买强化/宝箱领取）
//       一律**不加**，只给结果回执（否则就是 design-guide §1 明令反对的"弹窗地狱"）
//     · 六处共用这一个弹窗，不是六个弹窗；改文案/改样式只动这一个文件
//   层级 z-[880]：盖过节点弹窗（z-700）· 复活窗（720），低于暂离二次确认（900）· 换人全屏（1000）。
//   ⚠️ **刻意不用 createPortal**（对齐 design-guide 分辨率铁律）：本弹窗在 ScaleWrapper 的
//      1680×1050 坐标系内渲染，跟着全局 scale 一起缩放；portal 到 body 会脱离缩放、
//      还要手动补 getGameScale()。所以它必须留在父弹窗的 React 树里。
// ==========================================
import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle } from 'lucide-react';
import { eventBus, GameEvents } from '../../utils/eventBus';

export interface ConfirmDialogProps {
    /** 主标题（一句话说清"要确认什么"） */
    title: string;
    /** 补充说明（可选） */
    desc?: string;
    /** 后果清单（逐条列出，玩家一眼知道会发生什么；可选） */
    notes?: string[];
    confirmLabel?: string;
    cancelLabel?: string;
    /** danger = 不可逆损失（红）· normal = 一般消耗（靛蓝） */
    tone?: 'danger' | 'normal';
    onConfirm: () => void;
    onCancel: () => void;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
    title, desc, notes, confirmLabel = '确定', cancelLabel = '取消', tone = 'danger', onConfirm, onCancel,
}) => {
    const danger = tone === 'danger';
    return (
        <AnimatePresence>
            <div
                key="confirm"
                className="fixed inset-0 z-[880] flex items-center justify-center bg-black/70 backdrop-blur-sm"
                onClick={(e) => { e.stopPropagation(); eventBus.emit(GameEvents.UI_BACK); onCancel(); }}
            >
                <motion.div
                    initial={{ scale: 0.92, opacity: 0, y: 16 }}
                    animate={{ scale: 1, opacity: 1, y: 0 }}
                    exit={{ scale: 0.92, opacity: 0, y: 16 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 26 }}
                    onClick={(e) => e.stopPropagation()}
                    className={`w-[480px] max-w-[92%] rounded-2xl border bg-slate-900/95 p-7 text-white ${
                        danger ? 'border-red-500/35' : 'border-indigo-400/35'
                    }`}
                    style={{ boxShadow: danger ? '0 0 50px rgba(239,68,68,0.18)' : '0 0 50px rgba(99,102,241,0.18)' }}
                >
                    {/* 图标 + 标题 */}
                    <div className="flex items-start gap-3">
                        <span
                            className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border ${
                                danger ? 'border-red-400/50 bg-red-500/10 text-red-300' : 'border-indigo-400/50 bg-indigo-500/10 text-indigo-300'
                            }`}
                        >
                            <AlertTriangle size={20} />
                        </span>
                        <div className="min-w-0">
                            <h3 className="text-xl font-black leading-snug tracking-wide">{title}</h3>
                            {desc && <p className="mt-2 text-sm leading-relaxed text-gray-300">{desc}</p>}
                        </div>
                    </div>

                    {/* 后果清单 */}
                    {notes && notes.length > 0 && (
                        <ul className={`mt-4 space-y-1.5 rounded-xl border px-4 py-3 text-[13px] leading-relaxed ${
                            danger ? 'border-red-400/20 bg-red-500/5 text-red-200/90' : 'border-indigo-400/20 bg-indigo-500/5 text-indigo-200/90'
                        }`}>
                            {notes.map((n, i) => (
                                <li key={i} className="flex gap-2">
                                    <span className="shrink-0 opacity-60">·</span>
                                    <span>{n}</span>
                                </li>
                            ))}
                        </ul>
                    )}

                    {/* 二选一 */}
                    <div className="mt-6 flex gap-3">
                        <button
                            onClick={(e) => { e.stopPropagation(); eventBus.emit(GameEvents.UI_CLICK); onConfirm(); }}
                            className={`flex-1 rounded-xl border py-3 text-base font-black tracking-wider transition ${
                                danger
                                    ? 'border-red-400/50 bg-red-500/20 text-red-100 hover:border-red-300 hover:bg-red-500/35'
                                    : 'border-indigo-400/50 bg-indigo-500/20 text-indigo-100 hover:border-indigo-300 hover:bg-indigo-500/35'
                            }`}
                        >
                            {confirmLabel}
                        </button>
                        <button
                            onClick={(e) => { e.stopPropagation(); eventBus.emit(GameEvents.UI_BACK); onCancel(); }}
                            className="flex-1 rounded-xl border border-white/15 bg-white/5 py-3 text-base font-bold tracking-wider text-gray-300 transition hover:bg-white/10 hover:text-white"
                        >
                            {cancelLabel}
                        </button>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
};
