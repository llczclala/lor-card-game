// ==========================================
// 悖论迷宫 · 「复活」询问弹窗
//
// [2026-10-04 程拍板] 背景：迷宫里的「复活次数」此前**只有投降能用**，
//   被打爆水晶时完全用不上（08-16 手册缺口 #5「败北时无复活重打逻辑」至今成立）。
//   本次补齐：本场推演失败 → 若还有复活次数，弹本窗询问是否消耗 1 次重打本节点。
//
// 设计口径（程 2026-10-04）：
//   · **弹窗询问**，不自动消耗 —— 玩家对自己的复活池有完全的处置权
//   · 「使用复活」= 消耗 1 次 → 退回地图、**仍停在当前节点**，可重新挑战本关
//   · 「放弃并结算」= 本局按失败结算（剩余复活次数会按既有规则折算成天启者经验）
//
// ⚠️ 本窗**必须二选一**：不提供关闭按钮，且 App 的全局 ESC 监听会挡掉 ESC
//    —— 否则玩家可以把它关掉，留下"战斗已结束但本局没落子"的悬空状态。
// ==========================================
import React from 'react';
import { motion } from 'framer-motion';
import { RotateCcw } from 'lucide-react';

interface ReviveModalProps {
    /** 当前剩余复活次数（消耗前） */
    remaining: number;
    /** 使用复活：消耗 1 次，回到本节点重新挑战 */
    onAccept: () => void;
    /** 放弃：本局按失败结算 */
    onDecline: () => void;
}

export const ReviveModal: React.FC<ReviveModalProps> = ({ remaining, onAccept, onDecline }) => {
    const after = Math.max(0, remaining - 1);

    return (
        <div className="fixed inset-0 z-[720] flex items-center justify-center overflow-hidden bg-black/75">
            {/* 氛围光：复活绿辉（与 RunEndModal 的通关金辉/败亡暗涌同款做法） */}
            <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.7 }}
                className="absolute inset-0 pointer-events-none"
                style={{ background: 'radial-gradient(circle at 50% 44%, rgba(16,185,129,0.22), rgba(0,0,0,0) 62%)' }}
            />

            <motion.div
                initial={{ opacity: 0, scale: 0.92, y: 18 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ type: 'spring', stiffness: 220, damping: 22 }}
                className="relative w-[560px] max-w-[1546px] rounded-2xl border border-emerald-400/35 bg-gradient-to-b from-slate-900/95 to-slate-950/95 px-9 py-8"
                style={{ boxShadow: '0 0 70px rgba(16,185,129,0.26), inset 0 1px 0 rgba(255,255,255,0.06)' }}
            >
                {/* ═══ 图标 + 呼吸光环 ═══ */}
                <div className="flex flex-col items-center">
                    <motion.div
                        animate={{ scale: [1, 1.07, 1] }}
                        transition={{ duration: 1.9, repeat: Infinity, ease: 'easeInOut' }}
                        className="relative flex h-[92px] w-[92px] items-center justify-center rounded-full border-2 border-emerald-400/60 bg-emerald-500/10"
                    >
                        <RotateCcw size={44} className="text-emerald-300" />
                        <div className="absolute inset-[-11px] rounded-full border border-emerald-400/20" />
                        <div className="absolute inset-[-22px] rounded-full border border-emerald-400/10" />
                    </motion.div>

                    <h2 className="mt-5 text-2xl font-black tracking-[0.22em] text-emerald-200">复 活</h2>

                    <p className="mt-3 text-center text-[15px] leading-relaxed text-gray-300">
                        本场推演失败了。<br />
                        是否消耗 <span className="font-black text-emerald-300">1</span> 次复活，从本节点重新开始？
                    </p>

                    {/* ═══ 剩余次数（含消耗后预览） ═══ */}
                    <div className="mt-5 flex items-center gap-3 rounded-full border border-white/10 bg-white/5 px-5 py-2">
                        <RotateCcw size={15} className="text-emerald-300" />
                        <span className="text-sm font-bold text-white">
                            剩余 <span className="text-lg font-black text-emerald-300">{remaining}</span> 次
                        </span>
                        <span className="text-xs text-gray-500">使用后剩 {after} 次</span>
                    </div>
                </div>

                {/* ═══ 二选一 ═══ */}
                <div className="mt-7 flex gap-3">
                    <button
                        onClick={onAccept}
                        className="flex-1 rounded-xl border border-emerald-400/50 bg-emerald-500/20 py-3.5 text-base font-black tracking-wider text-emerald-100 transition hover:border-emerald-300 hover:bg-emerald-500/35"
                    >
                        使用复活
                    </button>
                    <button
                        onClick={onDecline}
                        className="flex-1 rounded-xl border border-white/15 bg-white/5 py-3.5 text-base font-bold tracking-wider text-gray-300 transition hover:bg-white/10 hover:text-white"
                    >
                        放弃并结算
                    </button>
                </div>

                {/* ═══ 后果说明（照 surrenderNote 的做法：让玩家一眼知道会发生什么） ═══ */}
                <div className="mt-4 space-y-1 text-center text-[11px] leading-relaxed text-gray-500">
                    <p>
                        <span className="font-bold text-emerald-300/80">使用复活</span>
                        ：退回迷宫地图，<span className="font-bold text-gray-300">仍停在当前节点</span>，可重新挑战本关
                    </p>
                    <p>
                        <span className="font-bold text-gray-400">放弃</span>
                        ：本局按失败结算（剩余生命 / 金币 / 复活 / 刷新会折算成天启者经验）
                    </p>
                </div>
            </motion.div>
        </div>
    );
};
