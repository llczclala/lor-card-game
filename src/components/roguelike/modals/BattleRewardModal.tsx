// ==========================================
// 悖论迷宫 · 战斗胜利奖励弹窗（[2026-08-15] 三选一：金币 + 从 3 张候选卡中选 1 张加入牌组）
// 参考 TreasureModal 三选一风格
// ==========================================
import React from 'react';
import { motion } from 'framer-motion';
import { Coins, Sparkles } from 'lucide-react';

interface BattleRewardModalProps {
    gold: number;
    options: { cardKey: string; cardName: string; cardImage: string }[];
    onPick: (cardKey: string) => void;
}

const cardBorder = (i: number) =>
    i === 0
        ? 'border-purple-400/60 group-hover:border-purple-400 group-hover:shadow-[0_0_20px_rgba(168,85,247,0.5)]'
        : i === 1
        ? 'border-blue-400/60 group-hover:border-blue-400 group-hover:shadow-[0_0_20px_rgba(59,130,246,0.5)]'
        : 'border-emerald-400/60 group-hover:border-emerald-400 group-hover:shadow-[0_0_20px_rgba(16,185,129,0.5)]';

export const BattleRewardModal: React.FC<BattleRewardModalProps> = ({ gold, options, onPick }) => {
    return (
        <div className="fixed inset-0 z-[700] flex items-center justify-center bg-black/80 backdrop-blur-sm">
            <motion.div
                initial={{ scale: 0.9, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.9, opacity: 0, y: 20 }}
                className="w-[760px] rounded-2xl bg-slate-900/95 border border-white/10 p-8 flex flex-col items-center gap-5 text-white"
            >
                <Sparkles size={32} className="text-yellow-400" />
                <h3 className="text-2xl font-black text-yellow-300">战斗胜利！</h3>

                <div className="flex items-center gap-2 text-amber-300 font-bold">
                    <Coins size={18} /> +{gold} 金币
                </div>

                <p className="text-xs font-mono text-gray-400">从以下三张卡牌中选择一张加入牌组</p>

                {options.length > 0 ? (
                    <div className="flex gap-6 items-end justify-center">
                        {options.map((o, i) => (
                            <div
                                key={o.cardKey}
                                className="flex flex-col items-center gap-2 cursor-pointer group"
                                onClick={() => onPick(o.cardKey)}
                            >
                                <div className={`w-36 rounded-lg border-2 overflow-hidden transition-all duration-300 group-hover:scale-105 ${cardBorder(i)}`}>
                                    <img src={o.cardImage} className="w-full h-full object-cover" alt={o.cardName} />
                                </div>
                                <p className="text-sm font-bold text-white group-hover:text-yellow-300 transition-colors">{o.cardName}</p>
                                <span className="px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[10px] font-bold text-gray-300 group-hover:bg-white/10 group-hover:text-white">
                                    选择这张
                                </span>
                            </div>
                        ))}
                    </div>
                ) : (
                    <p className="text-gray-400 text-sm">无可选卡牌奖励</p>
                )}

                <p className="text-[10px] text-gray-500">点击任意一张卡牌选定奖励</p>
            </motion.div>
        </div>
    );
};
