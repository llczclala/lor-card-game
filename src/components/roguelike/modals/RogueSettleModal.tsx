// ==========================================
// 悖论迷宫 · 中途结算窗（主动结算 / 大厅结算）
// [2026-08-28 莉莉子] 展示本场进度统计 + 获得经验（失败档）+ 悖论点 + 升级提示
// [2026-09-15 程拍板] 中途放弃完全不算一局 → detail.abandoned 时隐藏经验/倍率明细，只留进度统计
// ==========================================
import React from 'react';
import { motion } from 'framer-motion';
import { Coins } from 'lucide-react';
import type { RoguelikeRunState } from '../../../hooks/useRoguelikeRun';
import { ROGUE_DIFFICULTIES } from '../../../data/roguelike/difficulties';
import type { RogueSettleDetail } from '../../../data/roguelike/rogueExp'; // [2026-08-29] 结算倍率明细

interface RogueSettleModalProps {
    run: RoguelikeRunState;
    expGained: number;
    leveled: { fromLevel: number; toLevel: number } | null;
    detail: RogueSettleDetail; // [2026-08-29] 时长/难度/速通/效率/共鸣/通关倍率明细
    onConfirm: () => void;
}

export const RogueSettleModal: React.FC<RogueSettleModalProps> = ({ run, expGained, leveled, detail, onConfirm }) => {
    const diffLabel = ROGUE_DIFFICULTIES.find(d => d.key === run.difficulty)?.label ?? run.difficulty;
    return (
        <div className="fixed inset-0 z-[900] flex items-center justify-center bg-black/85 backdrop-blur-md">
            <motion.div
                initial={{ scale: 0.9, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.9, opacity: 0, y: 20 }}
                className="w-[480px] rounded-2xl bg-slate-900/95 border border-white/10 p-8 flex flex-col items-center gap-4 text-white"
            >
                <Coins size={44} className="text-amber-400" />
                <h3 className="text-3xl font-black text-amber-300 tracking-widest">本场结算</h3>

                <div className="w-full bg-white/5 rounded-xl p-4 flex flex-col gap-1 text-sm">
                    <div className="flex justify-between"><span className="text-gray-400">难度</span><span>{diffLabel}</span></div>
                    <div className="flex justify-between"><span className="text-gray-400">到达层数</span><span>Act {run.act}</span></div>
                    <div className="flex justify-between"><span className="text-gray-400">剩余 HP</span><span className={run.hp > 0 ? 'text-green-400' : 'text-red-400'}>{run.hp}/{run.maxHp}</span></div>
                    <div className="flex justify-between"><span className="text-gray-400">金币</span><span className="text-amber-300">{run.gold}</span></div>
                    <div className="flex justify-between"><span className="text-gray-400">迷宫强化</span><span>{run.enhancements.length}</span></div>
                    <div className="flex justify-between border-t border-white/10 mt-2 pt-2"><span className="text-gray-400">悖论点</span><span className="text-purple-300 font-black">+{run.paradoxPoints}</span></div>
                    {/* [2026-09-15 程拍板] 中途放弃 = 完全不算一局：隐藏经验与倍率明细 */}
                    {detail.abandoned ? (
                        <div className="flex justify-between border-t border-white/10 mt-2 pt-2">
                            <span className="text-gray-400">结算</span>
                            <span className="text-gray-500 text-xs">中途放弃 · 不计入经验与战绩</span>
                        </div>
                    ) : (<>
                    <div className="flex justify-between"><span className="text-gray-400">获得经验</span><span className="text-cyan-300 font-black">+{expGained}</span></div>
                    {/* [2026-08-29] 倍率明细：时长/难度/速通/效率/共鸣/通关 */}
                    <div className="border-t border-white/10 mt-2 pt-2 flex flex-col gap-1 text-xs text-gray-400">
                        <div className="flex justify-between"><span>对局时长</span><span className="text-white font-mono">{detail.durationMin} 分钟</span></div>
                        <div className="flex justify-between"><span>难度倍率</span><span className="text-white font-mono">×{detail.diffMult}</span></div>
                        <div className="flex justify-between"><span>速通倍率</span><span className="text-white font-mono">×{detail.timeMult}</span></div>
                        {detail.ratePct > 0 && <div className="flex justify-between"><span>效率加成</span><span className="text-cyan-300 font-mono">+{detail.ratePct}%</span></div>}
                        {detail.resonance && <div className="flex justify-between"><span>碳原子板</span><span className="text-purple-300 font-mono">×2</span></div>}
                        {detail.clearExp > 0 && <div className="flex justify-between"><span>通关奖励</span><span className="text-amber-300 font-mono">+{detail.clearExp}</span></div>}
                        {/* [2026-09-07 程拍板] 剩余资源折算经验（生命/金币/复活/刷新 慷慨档） */}
                        {detail.resource && detail.resource.exp > 0 && (
                            <div className="flex justify-between items-center">
                                <span className="text-gray-400">
                                    剩余资源折算
                                    <span className="ml-1 text-gray-500">血{detail.resource.hp}·金{detail.resource.gold}·复活{detail.resource.revive}·刷新{detail.resource.refresh}</span>
                                </span>
                                <span className="text-green-300 font-mono">+{detail.resource.exp}</span>
                            </div>
                        )}
                    </div>
                    </>)}
                </div>

                {leveled && (
                    <div className="px-4 py-2 rounded-lg bg-yellow-500/15 border border-yellow-400/40 text-yellow-300 font-bold text-sm animate-fade-in">
                        ✨ 升级！Lv{leveled.fromLevel} → Lv{leveled.toLevel}
                    </div>
                )}

                <button
                    onClick={onConfirm}
                    className="px-10 py-3 rounded-xl bg-gradient-to-r from-purple-600 to-purple-400 text-lg font-black tracking-widest hover:scale-105 transition-all hover:shadow-[0_0_30px_rgba(168,85,247,0.6)]"
                >
                    返回大厅
                </button>
            </motion.div>
        </div>
    );
};
