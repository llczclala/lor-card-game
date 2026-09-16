// ==========================================
// 悖论迷宫 · 宝箱弹窗（TreasureModal）
// [2026-08-12 莉莉子] 进入宝箱节点随机开出一种宝箱：
//   金币 / 卡牌（6 张带装备六选一）/ 惊喜强化（2普通+1稀有三选一，或牺牲-10生命上限换史诗）/ 随机池
// 复用商店/装备/强化基础。参考 ShopModal 风格。
// ==========================================
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Gem, Coins, Sparkles, Gift, RotateCcw, Heart, RefreshCw, X } from 'lucide-react';
import type { CardData } from '../../../types';
import { Card } from '../../Card';
import { EnhancementCard } from './EnhancementCard';
import { CARD_DB } from '../../../data/cards';
import { getEquipmentById } from '../../../data/equipment';
import { generateCardOffers, type ShopCardItem } from '../../../data/roguelike/shop';
import { RARITY_META } from '../RarityIcon'; // [2026-09-06 莉莉子] 随机宝箱揭示强化品质色
import { MAZE_ENHANCEMENTS, pickRandomEnhancementByRarity } from '../../../data/roguelike/enhancements';
import {
    pickTreasureType, pickRandomTreasure, GOLD_TREASURE_AMOUNT,
    CARD_TREASURE_COUNT, SACRIFICE_MAX_HP,
    type TreasureType, type RandomTreasureResult,
} from '../../../data/roguelike/treasure';
import type { RoguelikeRunState } from '../../../hooks/useRoguelikeRun';
import { eventBus, GameEvents } from '../../../utils/eventBus';

const HEX = 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)';
// [2026-08-27] 六档品质色：白/绿/蓝/紫/金/红
const RARITY_COLOR: Record<string, string> = { common: '#e5e7eb', uncommon: '#22c55e', rare: '#3b82f6', epic: '#a855f7', legendary: '#facc15', mythic: '#ef4444' };

interface TreasureModalProps {
    run: RoguelikeRunState;
    onCollectGold: (amount: number) => void;
    onPickCard: (cardKey: string, equipId: string | undefined) => void;
    onPickEnhancement: (enhancementId: string) => void;
    onSacrificeForEpic: (enhancementId: string) => void;
    onCollectRandom: (result: RandomTreasureResult) => void;
    onClose: () => void;
}

const displayCard = (key: string): CardData => {
    const base = CARD_DB[key];
    return { ...base, id: `treasure_${key}`, strikeCount: 0, animState: 'idle', damageTaken: 0, buffs: { power: 0, health: 0 } } as CardData;
};

const EquipHex: React.FC<{ equipId: string; size?: number }> = ({ equipId, size = 30 }) => {
    const def = getEquipmentById(equipId);
    if (!def) return null;
    const color = RARITY_COLOR[def.rarity] || '#9ca3af';
    return (
        <div className="flex items-center justify-center" style={{ width: size, height: size * 1.14, clipPath: HEX, background: color, filter: `drop-shadow(0 0 5px ${color}66)` }}>
            <img src={def.icon} alt={def.name} draggable={false} className="w-[86%] h-[86%] object-cover" style={{ clipPath: HEX }} />
        </div>
    );
};

const ACTION_BTN = 'px-8 py-2.5 rounded-xl bg-gradient-to-r from-amber-600 to-amber-400 text-white font-black tracking-widest hover:scale-105 transition-all shadow-[0_0_20px_rgba(245,158,11,0.4)]';

export const TreasureModal: React.FC<TreasureModalProps> = ({
    run, onCollectGold, onPickCard, onPickEnhancement, onSacrificeForEpic, onCollectRandom, onClose,
}) => {
    const [treasureType] = useState<TreasureType>(() => pickTreasureType());
    const [cardOffers] = useState<ShopCardItem[]>(() => generateCardOffers(CARD_TREASURE_COUNT));
    // 惊喜强化：2 优秀(绿) + 1 稀有 + 1 史诗（牺牲用）[2026-08-27] 原 common→uncommon（白品池空）
    const [surpriseEnh] = useState(() => ({
        normals: [pickRandomEnhancementByRarity('uncommon', run.passUnlockedEnhancements), pickRandomEnhancementByRarity('uncommon', run.passUnlockedEnhancements)].filter(Boolean), // [2026-08-29 通行证]
        rare: pickRandomEnhancementByRarity('rare', run.passUnlockedEnhancements),
        epic: pickRandomEnhancementByRarity('epic', run.passUnlockedEnhancements),
    }));
    const [sacrificeMode, setSacrificeMode] = useState(false); // 惊喜宝箱：是否已点"牺牲换史诗"
    const [revealed, setRevealed] = useState<RandomTreasureResult | null>(null); // 随机宝箱：揭示结果

    const title = treasureType === 'gold' ? '金币宝箱'
        : treasureType === 'card' ? '卡牌宝箱'
        : treasureType === 'surprise' ? '惊喜强化宝箱' : '随机宝箱';
    const icon = treasureType === 'gold' ? <Coins className="text-amber-400" />
        : treasureType === 'card' ? <Gift className="text-cyan-400" />
        : treasureType === 'surprise' ? <Sparkles className="text-violet-400" /> : <Gem className="text-yellow-400" />;

    // [2026-09-06 莉莉子] 揭示结果：卡/强化用完整卡面或图标，不再只显文字
    const renderRandomReward = (r: RandomTreasureResult) => {
        switch (r.kind) {
            case 'gold': return <div className="flex flex-col items-center gap-2"><div className="text-6xl">💰</div><div className="flex items-center gap-2 text-lg font-black text-amber-300"><Coins size={18} />金币 +{r.amount}</div></div>;
            case 'card': {
                const cardDef = CARD_DB[r.cardKey];
                const eqDef = r.equipId ? getEquipmentById(r.equipId) : undefined;
                return (
                    <div className="flex flex-col items-center gap-2">
                        {/* 完整卡面（带装备则叠 EquipHex） */}
                        <div className="relative">
                            <Card data={displayCard(r.cardKey)} location="deck-builder" isFaceUp />
                            {eqDef && <div className="absolute -top-2 -right-2 z-10"><EquipHex equipId={r.equipId!} size={34} /></div>}
                        </div>
                        <div className="text-lg font-black text-cyan-300">
                            获得卡牌「{cardDef?.name ?? r.cardKey}」{eqDef ? `（带装备·${eqDef.name}）` : ''}
                        </div>
                    </div>
                );
            }
            case 'enhancement': {
                const enh = MAZE_ENHANCEMENTS.find(e => e.id === r.enhancementId);
                const meta = enh ? RARITY_META[enh.rarity] : undefined;
                return (
                    <div className="flex flex-col items-center gap-2">
                        {/* 强化圆形图标（对齐战斗内强化栏观感） */}
                        {enh && meta && (
                            <div className="w-20 h-20 rounded-full overflow-hidden border-4 bg-black shadow-lg"
                                style={{ borderColor: meta.color, boxShadow: `0 0 18px ${meta.color}66` }}>
                                <img src={enh.icon} alt={enh.name} className="w-full h-full object-cover" />
                            </div>
                        )}
                        <div className="text-lg font-black text-violet-300">
                            迷宫强化「{enh?.name ?? r.enhancementId}」
                        </div>
                    </div>
                );
            }
            case 'maxHp': return <div className="flex flex-col items-center gap-2"><div className="text-6xl">❤️</div><div className="flex items-center gap-2 text-lg font-black text-red-300"><Heart size={18} />生命上限 +{r.amount}</div></div>;
            case 'revive': return <div className="flex flex-col items-center gap-2"><div className="text-6xl">♻️</div><div className="flex items-center gap-2 text-lg font-black text-green-300"><RotateCcw size={18} />复活次数 +{r.amount}</div></div>;
            case 'refresh': return <div className="flex flex-col items-center gap-2"><div className="text-6xl">🔄</div><div className="flex items-center gap-2 text-lg font-black text-cyan-300"><RefreshCw size={18} />刷新次数 +{r.amount}</div></div>;
        }
    };

    return (
        <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[700] flex items-center justify-center bg-black/80 backdrop-blur-sm"
            onClick={(e) => e.stopPropagation()}
        >
            <motion.div
                initial={{ scale: 0.9, opacity: 0, y: 24 }} animate={{ scale: 1, opacity: 1, y: 0 }}
                transition={{ type: 'spring', stiffness: 300, damping: 24 }}
                className="relative w-[900px] max-w-[94vw] max-h-[92vh] overflow-y-auto rounded-2xl bg-slate-900/95 border border-yellow-500/25 p-6 text-white"
                style={{ boxShadow: '0 0 60px rgba(234,179,8,0.2)' }}
            >
                {/* 顶部 */}
                <div className="flex items-center justify-between mb-5">
                    <div className="flex items-center gap-2">
                        <span className="text-3xl">{icon}</span>
                        <h2 className="text-3xl font-black tracking-widest">{title}</h2>
                    </div>
                    <div className="flex items-center gap-3">
                        <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-400/30 text-amber-300 font-black">
                            <Coins size={16} /> {run.gold}
                        </span>
                        <button onClick={(e) => { e.stopPropagation(); eventBus.emit(GameEvents.UI_BACK); onClose(); }}
                            className="p-2 rounded-full bg-white/5 hover:bg-white/20 border border-white/10 hover:border-white/40 transition-all">
                            <X size={20} className="text-gray-300" />
                        </button>
                    </div>
                </div>

                {/* ── 金币宝箱 ── */}
                {treasureType === 'gold' && (
                    <div className="flex flex-col items-center py-8 gap-4">
                        <div className="text-7xl">💰</div>
                        <p className="text-gray-300 text-lg">打开宝箱，获得
                            <span className="text-amber-300 font-black text-2xl mx-1">+{GOLD_TREASURE_AMOUNT}</span>金币
                        </p>
                        <button className={ACTION_BTN} onClick={() => { eventBus.emit(GameEvents.UI_CLICK); onCollectGold(GOLD_TREASURE_AMOUNT); onClose(); }}>
                            领取
                        </button>
                    </div>
                )}

                {/* ── 卡牌宝箱：6 张带装备卡六选一 ── */}
                {treasureType === 'card' && (
                    <div className="flex flex-col items-center gap-4">
                        <p className="text-gray-300">从 6 张带装备的卡中选一张（装备附加到该卡所有副本）</p>
                        <div className="flex flex-wrap gap-4 justify-center">
                            {cardOffers.map(item => (
                                <div key={item.cardKey} className="flex flex-col items-center gap-1.5">
                                    <div className="relative">
                                        <Card data={displayCard(item.cardKey)} location="deck-builder" isFaceUp />
                                        {item.equipId && <div className="absolute -top-2 -right-2 z-10"><EquipHex equipId={item.equipId} size={30} /></div>}
                                    </div>
                                    <button
                                        onClick={() => { eventBus.emit(GameEvents.UI_CLICK); onPickCard(item.cardKey, item.equipId); onClose(); }}
                                        className="px-5 py-1.5 rounded-lg bg-gradient-to-r from-cyan-600 to-cyan-400 hover:scale-105 font-black transition-all"
                                    >
                                        选这张
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* ── 惊喜强化宝箱 ── */}
                {treasureType === 'surprise' && (
                    <div className="flex flex-col items-center gap-4">
                        {!sacrificeMode ? (
                            <>
                                <p className="text-gray-300">三选一：拿一张普通强化 / 拿一张稀有强化 / 或牺牲生命上限换史诗</p>
                                <div className="flex gap-6 items-end">
                                    {surpriseEnh.normals.map((enh, i) => enh && (
                                        <div key={`n${i}`} className="flex flex-col items-center gap-2 w-44">
                                            <EnhancementCard enhancement={enh} isSelected={false} onClick={() => {}} />
                                            <span className="text-[10px] font-mono text-green-400">普通</span>
                                            <button
                                                onClick={() => { eventBus.emit(GameEvents.UI_CLICK); onPickEnhancement(enh.id); onClose(); }}
                                                className="px-4 py-1.5 rounded-lg bg-emerald-600/80 hover:bg-emerald-500 hover:scale-105 font-black transition-all"
                                            >拿这张</button>
                                        </div>
                                    ))}
                                    {surpriseEnh.rare && (
                                        <div className="flex flex-col items-center gap-2 w-44">
                                            <EnhancementCard enhancement={surpriseEnh.rare} isSelected={false} onClick={() => {}} />
                                            <span className="text-[10px] font-mono text-blue-400">稀有</span>
                                            <button
                                                onClick={() => { eventBus.emit(GameEvents.UI_CLICK); onPickEnhancement(surpriseEnh.rare!.id); onClose(); }}
                                                className="px-4 py-1.5 rounded-lg bg-blue-600/80 hover:bg-blue-500 hover:scale-105 font-black transition-all"
                                            >拿这张</button>
                                        </div>
                                    )}
                                </div>
                                <button
                                    onClick={() => { eventBus.emit(GameEvents.UI_CLICK); setSacrificeMode(true); }}
                                    className="mt-2 px-5 py-2 rounded-lg bg-red-600/30 border border-red-400/50 text-red-200 font-black hover:bg-red-600/50 transition-all"
                                >
                                    牺牲 <span className="text-red-300">-{SACRIFICE_MAX_HP} 生命上限</span>，换取史诗强化
                                </button>
                            </>
                        ) : (
                            surpriseEnh.epic ? (
                                <>
                                    <p className="text-gray-300">牺牲 {SACRIFICE_MAX_HP} 生命上限（当前 {run.maxHp} → {Math.max(10, run.maxHp - SACRIFICE_MAX_HP)}），换取史诗强化：</p>
                                    <div className="w-52">
                                        <EnhancementCard enhancement={surpriseEnh.epic} isSelected={false} onClick={() => {}} />
                                    </div>
                                    <span className="text-[10px] font-mono text-purple-400">史诗</span>
                                    <div className="flex gap-3">
                                        <button
                                            onClick={() => { eventBus.emit(GameEvents.UI_BACK); setSacrificeMode(false); }}
                                            className="px-6 py-2 rounded-lg bg-white/10 hover:bg-white/20 font-bold transition-all"
                                        >放弃</button>
                                        <button
                                            onClick={() => { eventBus.emit(GameEvents.UI_CLICK); onSacrificeForEpic(surpriseEnh.epic!.id); onClose(); }}
                                            className={ACTION_BTN}
                                        >确认牺牲（-{SACRIFICE_MAX_HP} 生命）</button>
                                    </div>
                                </>
                            ) : <p className="text-gray-500">暂无史诗强化可换</p>
                        )}
                    </div>
                )}

                {/* ── 随机宝箱 ── */}
                {treasureType === 'random' && (
                    <div className="flex flex-col items-center py-8 gap-4">
                        {revealed ? (
                            <>
                                <div className="text-6xl">🎁</div>
                                <div className="rounded-xl bg-white/5 border border-white/15 px-6 py-4">
                                    {renderRandomReward(revealed)}
                                </div>
                                <button
                                    className={ACTION_BTN}
                                    onClick={() => { eventBus.emit(GameEvents.UI_CLICK); onCollectRandom(revealed); onClose(); }}
                                >领取</button>
                            </>
                        ) : (
                            <>
                                <div className="text-8xl animate-bounce">🎁</div>
                                <p className="text-gray-300">神秘的宝箱……里面会有什么呢？</p>
                                <button
                                    className={ACTION_BTN}
                                    onClick={() => { eventBus.emit(GameEvents.UI_CLICK); setRevealed(pickRandomTreasure(run.passUnlockedEnhancements)); }} // [2026-08-29 通行证]
                                >开启宝箱</button>
                            </>
                        )}
                    </div>
                )}

                <div className="mt-6 flex justify-center">
                    <button onClick={(e) => { e.stopPropagation(); eventBus.emit(GameEvents.UI_BACK); onClose(); }}
                        className="px-10 py-2 rounded-xl bg-white/10 hover:bg-white/20 font-black tracking-widest transition-all">
                        离开
                    </button>
                </div>
            </motion.div>
        </motion.div>
    );
};
