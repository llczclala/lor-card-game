// ==========================================
// 悖论迷宫 · 事件战斗胜利 → **强化奖励**弹窗
// [2026-10-08 莉莉子 · 瓦尔基里大赛]
//
//   程的流程：「战斗后，我们**先**弹出此次战斗获得的强化奖励，**再**弹出战斗的卡牌奖励」
//   ⇒ 本组件是第一段（强化 + 固定赠送的天启者卡等），
//     点「确定」后由 `App` 接着弹第二段 = 卡牌三选一（复用 `BattleRewardModal`）。
//
//   ⚠️ 为什么两段要分开弹：奖励里既有"即时结算类"（强化、天启者卡直接进牌组），
//      又有"需要玩家挑选"的卡牌三选一；混在一个弹窗里玩家看不清自己拿到了什么。
// ==========================================
import React from 'react';
import { motion } from 'framer-motion';
import type { EventApplyResult } from '../../../data/roguelike/eventAppliers';

interface EventBattleRewardModalProps {
    /** 已**实际执行**完的奖励清单（`applyEventEffects` 的返回值，只取 gain 项展示） */
    results: EventApplyResult[];
    onClose: () => void;
}

export const EventBattleRewardModal: React.FC<EventBattleRewardModalProps> = ({ results, onClose }) => {
    const gains = results.filter(r => r.kind === 'gain');

    return (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center pointer-events-auto">
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

            <motion.div
                initial={{ opacity: 0, scale: 0.92, y: 18 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                className="relative w-[520px] max-w-[92vw] rounded-2xl border border-white/10 bg-slate-900/95 shadow-2xl px-7 py-6"
            >
                <h2 className="text-xl font-bold text-white tracking-wider mb-1">⚔️ 迎战胜利</h2>
                <p className="text-white/40 text-sm mb-5">本次战斗获得的强化奖励</p>

                <div className="space-y-2 mb-6 max-h-[46vh] overflow-y-auto scrollbar-thin scrollbar-thumb-white/10">
                    {gains.length === 0 ? (
                        <div className="text-white/30 text-sm py-4 text-center">（本次没有强化奖励）</div>
                    ) : gains.map((r, i) => (
                        <div key={i} className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-white/5 border border-white/10">
                            <span className="text-xl shrink-0">{r.icon}</span>
                            <span className="text-white/90 text-base">{r.text}</span>
                        </div>
                    ))}
                </div>

                <button
                    onClick={onClose}
                    className="w-full py-2.5 rounded-xl bg-yellow-500/90 hover:bg-yellow-400 text-black font-bold tracking-wider transition-all"
                >
                    确定
                </button>
            </motion.div>
        </div>
    );
};
