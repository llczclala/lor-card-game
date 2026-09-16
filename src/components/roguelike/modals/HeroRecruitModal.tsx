// ==========================================
// 悖论迷宫 · 首战大捷 · 天启者招募（三选一）
// [2026-09-04 莉莉子 + 程拍板] 第一场战斗胜利奖励替换：
//   从卡牌三选一换成「没被选择的天启者」三选一（一次性，run.heroRecruitDone 防重复）。
//   选中 = 英雄本体卡 + 随机 2 张该阵营可收集卡（随从/法术，非衍生）永久入队；
//   机密以上难度候选英雄再随机带一件装备（穿在英雄本体卡上，attachEquipment 渲染卡面带装）。
//   观感对齐 BattleRewardModal 全屏开放式：enter(升入)→select(可交互)→exit。
// ==========================================
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence, type Variants } from 'framer-motion';
import { Sparkles, Shield } from 'lucide-react';
import { CARD_DB } from '../../../data/cards';
import type { CardData } from '../../../types';
import { attachEquipment, getEquipmentById } from '../../../data/equipment';
import { RARITY_META } from '../RarityIcon';
import type { HeroRecruitOption } from '../../../data/roguelike/rewards';
import { Card } from '../../Card';

const HAND_CARD_SCALE = 1.55;
// [2026-09-06 莉莉子] 随行卡完整卡面缩放：deck-builder 卡(180×268) 缩到能看清名/数值又不喧宾夺主
const COMPANION_CARD_SCALE = 0.55;

interface HeroRecruitModalProps {
    options: HeroRecruitOption[];
    subNote?: string; // 副题说明（难度装备提示等，App 传入）
    onPick: (heroKey: string) => void;
    onSkip: () => void;
}

export const HeroRecruitModal: React.FC<HeroRecruitModalProps> = ({ options, subNote, onPick, onSkip }) => {
    const [selectedKey, setSelectedKey] = useState<string | null>(null);
    const [animPhase, setAnimPhase] = useState<'enter' | 'select' | 'exit'>('enter');

    useEffect(() => {
        const t = setTimeout(() => setAnimPhase('select'), 600);
        return () => clearTimeout(t);
    }, []);

    const handleConfirm = () => {
        if (!selectedKey) return;
        setAnimPhase('exit');
        setTimeout(() => onPick(selectedKey), 500);
    };

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-[700] flex flex-col items-center justify-center">
                {/* 全屏点击拦截层 */}
                <div className="absolute inset-0 bg-black/75 pointer-events-auto" onClick={(e) => e.stopPropagation()} />

                {/* 顶部标题 */}
                {animPhase === 'select' && (
                    <motion.div
                        initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}
                        className="absolute top-[9%] left-0 right-0 w-full text-center pointer-events-auto"
                    >
                        <div className="flex items-center justify-center gap-3 mb-1">
                            <Sparkles size={34} className="text-yellow-400" />
                            <h2 className="text-5xl font-black text-white drop-shadow-[0_5px_15px_rgba(0,0,0,0.8)] tracking-widest">天启者招募</h2>
                            <Sparkles size={34} className="text-yellow-400" />
                        </div>
                        <p className="text-yellow-200 mt-2 font-mono text-sm tracking-[0.2em] opacity-85">FIRST VICTORY · 首战大捷，招募一位天启者加入队伍</p>
                        {subNote && <p className="text-purple-200/90 mt-1 text-xs font-mono tracking-wider opacity-80">{subNote}</p>}
                    </motion.div>
                )}

                {/* 三候选英雄：大卡 + 随行卡 + 装备徽章 */}
                <div className="relative flex items-end justify-center gap-10 pointer-events-auto" style={{ marginTop: '9vh' }}>
                    {options.map((o, index) => {
                        const heroDef = CARD_DB[o.heroKey] as CardData | undefined;
                        if (!heroDef) return null;
                        const equipDef = o.equipId ? getEquipmentById(o.equipId) : undefined;
                        const equipMeta = equipDef ? RARITY_META[equipDef.rarity] : undefined;
                        const isSelected = selectedKey === o.heroKey;
                        const variants: Variants = {
                            enter: {
                                x: 0, y: 90, scale: 0.3, opacity: 0,
                                transition: { delay: index * 0.1, duration: 0.65, type: 'spring', damping: 18 },
                            },
                            select: {
                                x: 0, y: isSelected ? -52 : 0,
                                scale: isSelected ? 1.02 : 0.9,
                                opacity: 1,
                                transition: { type: 'spring', stiffness: 300 },
                            },
                            exit: {
                                x: 0, y: 120, scale: 0.25, opacity: 0,
                                transition: { duration: 0.5, ease: 'easeInOut', delay: index * 0.05 },
                            },
                        };
                        return (
                            <motion.div
                                key={o.heroKey}
                                className="relative flex flex-col items-center cursor-pointer"
                                variants={variants}
                                initial="enter"
                                animate={animPhase}
                                exit="exit"
                                onClick={() => { if (animPhase === 'select') setSelectedKey(o.heroKey); }}
                            >
                                {/* 选中金色光晕 */}
                                {isSelected && animPhase === 'select' && (
                                    <div className="absolute -inset-2 rounded-2xl border-4 border-yellow-400 shadow-[0_0_30px_#eab308] z-0" />
                                )}
                                {/* 装备徽章（机密以上难度） */}
                                {o.equipId && equipDef && equipMeta && (
                                    <div className="absolute -top-3 right-2 z-30 flex items-center gap-1 px-2 py-0.5 rounded-full font-black text-[11px] tracking-wider"
                                        style={{ color: equipMeta.color, border: `1px solid ${equipMeta.color}66`, background: 'rgba(2,6,23,0.9)', boxShadow: `0 0 12px ${equipMeta.color}55` }}>
                                        <Shield size={11} /> 装备·{equipDef.name}
                                    </div>
                                )}
                                <div className="relative z-10 origin-bottom">
                                    <div style={{ width: 130 * HAND_CARD_SCALE, height: 202 * HAND_CARD_SCALE }}>
                                        <div style={{ transform: `scale(${HAND_CARD_SCALE})`, transformOrigin: 'top left' }}>
                                            {/* [2026-09-04] 机密以上：英雄本体卡直接穿戴态渲染（装备品质 pips 自带）；普通裸卡 */}
                                            <Card data={o.equipId ? attachEquipment(heroDef, o.equipId) : heroDef} location="hand" isFaceUp={true} skinId={0} />
                                        </div>
                                    </div>
                                </div>
                                {/* 随身 2 张阵营卡：完整卡面（[2026-09-06 莉莉子] 原 w-5 微缩图看不清 → 完整手牌样式缩放） */}
                                {(o.companionKeys ?? []).length > 0 && (
                                    <div className="relative z-10 mt-2 flex items-end justify-center gap-3">
                                        {(o.companionKeys ?? []).map(ck => {
                                            const base = CARD_DB[ck];
                                            if (!base) return null;
                                            const cd: CardData = { ...base, id: ck, strikeCount: 0, animState: 'idle' as const, damageTaken: 0, buffs: { power: 0, health: 0 } };
                                            return (
                                                <div key={ck} className="flex flex-col items-center gap-0.5">
                                                    <div className="origin-bottom" style={{ width: 130 * COMPANION_CARD_SCALE, height: 202 * COMPANION_CARD_SCALE }}>
                                                        <div style={{ transform: `scale(${COMPANION_CARD_SCALE})`, transformOrigin: 'top left' }}>
                                                            <Card data={cd} location="hand" isFaceUp skinId={0} />
                                                        </div>
                                                    </div>
                                                    <span className="text-[11px] font-bold text-gray-200 truncate max-w-[86px] text-center drop-shadow" title={cd.name}>{cd.name}</span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </motion.div>
                        );
                    })}
                </div>

                {/* 底部：招募（选定后生效） + 跳过 */}
                {animPhase === 'select' && options.length > 0 && (
                    <div className="absolute bottom-[8%] left-0 right-0 z-30 flex justify-center gap-4">
                        <motion.button
                            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                            onClick={(e) => { e.stopPropagation(); handleConfirm(); }}
                            disabled={!selectedKey}
                            className={`px-12 py-3 rounded-xl font-black text-lg tracking-widest transition-all
                                ${selectedKey
                                    ? 'bg-gradient-to-r from-yellow-600 to-amber-400 hover:scale-105 hover:shadow-[0_0_30px_rgba(245,158,11,0.6)]'
                                    : 'bg-white/10 text-gray-500 cursor-not-allowed'}`}
                        >
                            招募
                        </motion.button>
                        <motion.button
                            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                            onClick={(e) => { e.stopPropagation(); onSkip(); }}
                            className="px-8 py-3 rounded-xl bg-white/10 hover:bg-white/20 font-black text-lg tracking-widest text-gray-300 transition-all hover:scale-105"
                        >
                            跳过
                        </motion.button>
                    </div>
                )}
            </div>
        </AnimatePresence>
    );
};
