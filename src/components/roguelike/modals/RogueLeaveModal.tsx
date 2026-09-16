// ==========================================
// 悖论迷宫 · 局内返回二次确认弹窗
// [2026-08-28 莉莉子] 地图左上角返回 / ESC → 弹此窗：
//   「结算对局」= 中途结算本场（发经验/悖论点，结束对局）
//   「暂离对局」= 存盘回大厅，稍后可「继续」从上次进度接着游玩
// ==========================================
import React from 'react';
import { motion } from 'framer-motion';

interface RogueLeaveModalProps {
    onSettle: () => void; // 结算对局
    onLeave: () => void;  // 暂离对局
    onClose: () => void;  // 取消
}

export const RogueLeaveModal: React.FC<RogueLeaveModalProps> = ({ onSettle, onLeave, onClose }) => {
    return (
        <div
            className="fixed inset-0 z-[900] flex items-center justify-center bg-black/80 backdrop-blur-md"
            onClick={onClose}
        >
            <motion.div
                initial={{ scale: 0.92, opacity: 0, y: 16 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.92, opacity: 0, y: 16 }}
                className="w-[460px] rounded-2xl bg-slate-900/95 border border-white/15 p-8 flex flex-col items-center gap-4 text-white"
                onClick={e => e.stopPropagation()}
            >
                <h3 className="text-2xl font-black tracking-widest text-center">是否就此结算本场对局？</h3>
                <p className="text-sm text-gray-400 leading-relaxed text-center">
                    结算将获得本场经验并结束对局；<br />
                    暂离可返回大厅，稍后「继续」从上次进度接着游玩。
                </p>
                <div className="flex gap-4 w-full mt-1">
                    <button
                        onClick={onSettle}
                        className="flex-1 py-3 rounded-xl bg-gradient-to-r from-red-600 to-red-400 text-lg font-black tracking-widest hover:scale-105 transition-all hover:shadow-[0_0_25px_rgba(239,68,68,0.5)]"
                    >
                        结算对局
                    </button>
                    <button
                        onClick={onLeave}
                        className="flex-1 py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-400 text-lg font-black tracking-widest hover:scale-105 transition-all hover:shadow-[0_0_25px_rgba(16,185,129,0.5)]"
                    >
                        暂离对局
                    </button>
                </div>
                <button onClick={onClose} className="text-gray-500 hover:text-white text-sm transition-colors">
                    取消
                </button>
            </motion.div>
        </div>
    );
};
