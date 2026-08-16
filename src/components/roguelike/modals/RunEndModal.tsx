// ==========================================
// 悖论迷宫 · 通关/死亡结算弹窗
// 显示本局统计 + 悖论点（后续接局外成长 Meta）
// ==========================================
import React from 'react';
import { motion } from 'framer-motion';
import { Trophy, Skull } from 'lucide-react';
import type { RoguelikeRunState } from '../../../hooks/useRoguelikeRun';

interface RunEndModalProps {
    run: RoguelikeRunState;
    onConfirm: () => void;
}

export const RunEndModal: React.FC<RunEndModalProps> = ({ run, onConfirm }) => {
    const isWin = run.status === 'won';
    return (
        <div className="fixed inset-0 z-[700] flex items-center justify-center bg-black/85 backdrop-blur-md">
            <motion.div
                initial={{ scale: 0.9, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.9, opacity: 0, y: 20 }}
                className="w-[480px] rounded-2xl bg-slate-900/95 border border-white/10 p-8 flex flex-col items-center gap-4 text-white"
            >
                {isWin
                    ? <Trophy size={48} className="text-yellow-400" />
                    : <Skull size={48} className="text-red-500" />}
                <h3 className={`text-3xl font-black ${isWin ? 'text-yellow-300' : 'text-red-400'}`}>
                    {isWin ? '悖论瓦解 · 通关！' : '迷宫崩塌 · 败亡'}
                </h3>

                <div className="w-full bg-white/5 rounded-xl p-4 flex flex-col gap-1 text-sm">
                    <div className="flex justify-between"><span className="text-gray-400">到达层数</span><span>Act {run.act}</span></div>
                    <div className="flex justify-between"><span className="text-gray-400">剩余 HP</span><span className={run.hp > 0 ? 'text-green-400' : 'text-red-400'}>{run.hp}/{run.maxHp}</span></div>
                    <div className="flex justify-between"><span className="text-gray-400">金币</span><span className="text-amber-300">{run.gold}</span></div>
                    <div className="flex justify-between"><span className="text-gray-400">迷宫强化</span><span>{run.enhancements.length}</span></div>
                    <div className="flex justify-between border-t border-white/10 mt-2 pt-2"><span className="text-gray-400">悖论点</span><span className="text-purple-300 font-black">+{run.paradoxPoints}</span></div>
                </div>

                <button onClick={onConfirm}
                    className="px-10 py-3 rounded-xl bg-gradient-to-r from-purple-600 to-purple-400 text-lg font-black tracking-widest hover:scale-105 transition-all hover:shadow-[0_0_30px_rgba(168,85,247,0.6)]">
                    返回大厅
                </button>
            </motion.div>
        </div>
    );
};
