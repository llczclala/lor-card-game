// ==========================================
// 悖论迷宫 · 天启者养成——升级弹窗（LevelUpToast）
// [2026-08-12 莉莉子] 结算升级时弹出：Lv.N → N+1 + 本次解锁加成列表。紫色主题贴合现有 UI。
// ==========================================
import React from 'react';
import { motion } from 'framer-motion';
import { getHeroLevelBonus, getLevelColor } from '../../data/roguelike/heroProgression';
import { eventBus, GameEvents } from '../../utils/eventBus';

interface LevelUpToastProps {
    heroName: string;
    fromLevel: number;
    toLevel: number;
    onClose: () => void;
}

/** 计算 fromLevel → toLevel 之间新增的加成文案列表 */
const computeNewBonuses = (fromLevel: number, toLevel: number): string[] => {
    const after = getHeroLevelBonus(toLevel);
    const before = getHeroLevelBonus(fromLevel);
    const items: string[] = [];
    if (after.maxHpBonus > before.maxHpBonus) items.push(`起始生命 +${after.maxHpBonus - before.maxHpBonus}`);
    if (after.goldBonus > before.goldBonus) items.push(`开局金币 +${after.goldBonus - before.goldBonus}`);
    if (after.reviveBonus > before.reviveBonus) items.push(`复活次数 +${after.reviveBonus - before.reviveBonus}`);
    if (after.refreshBonus > before.refreshBonus) items.push(`刷新次数 +${after.refreshBonus - before.refreshBonus}`);
    const enh = after.grantedEnhancements.length - before.grantedEnhancements.length;
    if (enh > 0) items.push(`迷宫强化 ×${enh}`);
    const equip = after.grantedEquipments.length - before.grantedEquipments.length;
    if (equip > 0) items.push(`装备 ×${equip}`);
    if (after.rarityBonus.rare > before.rarityBonus.rare) items.push(`稀有度 Rare +${after.rarityBonus.rare - before.rarityBonus.rare}%`);
    if (after.rarityBonus.epic > before.rarityBonus.epic) items.push(`稀有度 Epic +${after.rarityBonus.epic - before.rarityBonus.epic}%`);
    if (after.rarityBonus.legendary > before.rarityBonus.legendary) items.push(`稀有度 Legendary +${after.rarityBonus.legendary - before.rarityBonus.legendary}%`);
    return items;
};

export const LevelUpToast: React.FC<LevelUpToastProps> = ({ heroName, fromLevel, toLevel, onClose }) => {
    const color = getLevelColor(toLevel);
    const newBonuses = computeNewBonuses(fromLevel, toLevel);

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/70 backdrop-blur-sm"
            onClick={e => e.stopPropagation()}
        >
            <motion.div
                initial={{ scale: 0.85, y: 30, opacity: 0 }}
                animate={{ scale: 1, y: 0, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 320, damping: 22 }}
                className="relative max-w-sm w-full mx-4 rounded-2xl overflow-hidden border-2 bg-gradient-to-b from-slate-900 via-purple-950 to-slate-900 shadow-[0_0_60px_rgba(168,85,247,0.45)]"
                style={{ borderColor: color }}
            >
                <div className="px-6 pt-6 pb-4 text-center">
                    <div className="text-5xl mb-2 drop-shadow-[0_0_12px_rgba(250,204,21,0.8)]">⭐</div>
                    <h3 className="text-2xl font-black tracking-widest text-white" style={{ textShadow: `0 0 16px ${color}88` }}>
                        天启者升级！
                    </h3>
                    <p className="mt-1 font-mono text-lg text-transparent bg-clip-text bg-gradient-to-r from-purple-300 to-white font-black">
                        Lv.{fromLevel} → <span style={{ color }}>Lv.{toLevel}</span>
                    </p>
                    <p className="mt-1 text-sm text-gray-300">{heroName} 解锁新加成：</p>

                    <div className="mt-4 flex flex-col gap-2">
                        {newBonuses.length > 0 ? newBonuses.map((item, i) => (
                            <motion.div
                                key={i}
                                initial={{ opacity: 0, x: -12 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: 0.15 + i * 0.1 }}
                                className="flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10"
                            >
                                <span className="text-emerald-400 font-black">✓</span>
                                <span className="text-gray-100 font-bold text-sm">{item}</span>
                            </motion.div>
                        )) : (
                            <p className="text-gray-400 text-sm italic">（该级无直接加成，继续积累经验吧）</p>
                        )}
                    </div>

                    <button
                        onClick={() => { eventBus.emit(GameEvents.UI_CLICK); onClose(); }}
                        className="mt-6 px-10 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-purple-400 text-white font-black tracking-widest hover:scale-105 transition-all hover:shadow-[0_0_25px_rgba(168,85,247,0.6)]"
                    >
                        继续
                    </button>
                </div>
            </motion.div>
        </motion.div>
    );
};
