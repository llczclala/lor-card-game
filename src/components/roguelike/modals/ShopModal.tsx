// ==========================================
// 悖论迷宫 · 商店弹窗（ShopModal）
// [2026-08-12 莉莉子] 参考 LOR 英雄之路商店（见 技术手册/参考-LOR商店经济.md）：
//   买带装备的卡 / 买迷宫强化 / 买装备挂英雄卡 / 删卡 + 刷新。
//   商品由 data/roguelike/shop.ts 生成；购买回调返回是否成功（金币不足则失败）。
// ==========================================
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { ShoppingBag, Coins, RefreshCw, Trash2, X } from 'lucide-react';
import type { CardData } from '../../../types';
import { Card } from '../../Card';
import { EnhancementCard } from './EnhancementCard';
import { CARD_DB } from '../../../data/cards';
import { getEquipmentById } from '../../../data/equipment';
import { generateShopStock, type ShopStock } from '../../../data/roguelike/shop';
import { MAZE_ENHANCEMENTS } from '../../../data/roguelike/enhancements';
import type { RoguelikeRunState } from '../../../hooks/useRoguelikeRun';
import { eventBus, GameEvents } from '../../../utils/eventBus';

const HEX = 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)';
const RARITY_COLOR: Record<string, string> = { common: '#22c55e', rare: '#3b82f6', epic: '#a855f7', legendary: '#facc15' };

interface ShopModalProps {
    run: RoguelikeRunState;
    stock: ShopStock;
    onBuyCard: (cardKey: string, equipId: string | undefined, price: number) => boolean;
    onBuyEnhancement: (enhancementId: string, price: number) => boolean;
    onBuyEquipment: (equipmentId: string, price: number) => boolean;
    onRemoveCard: (cardKey: string, price: number) => boolean;
    onRefresh: () => boolean;
    onClose: () => void;
}

/** 商店展示卡（补全 runtime 字段满足 CardData） */
const displayCard = (key: string): CardData => {
    const base = CARD_DB[key];
    return { ...base, id: `shop_${key}`, strikeCount: 0, animState: 'idle', damageTaken: 0, buffs: { power: 0, health: 0 } } as CardData;
};

/** 装备六边形方块（中间卡面 + 稀有度边框） */
const EquipHex: React.FC<{ equipId: string; size?: number }> = ({ equipId, size = 34 }) => {
    const def = getEquipmentById(equipId);
    if (!def) return null;
    const color = RARITY_COLOR[def.rarity] || '#9ca3af';
    return (
        <div
            className="flex items-center justify-center"
            style={{ width: size, height: size * 1.14, clipPath: HEX, background: color, filter: `drop-shadow(0 0 5px ${color}66)` }}
        >
            <img src={def.icon} alt={def.name} draggable={false} className="w-[86%] h-[86%] object-cover" style={{ clipPath: HEX }} />
        </div>
    );
};

const SectionTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <h3 className="text-sm font-black tracking-widest text-white/80 mb-2 flex items-center gap-2">{children}</h3>
);

const PriceButton: React.FC<{
    price: number;
    affordable: boolean;
    sold: boolean;
    onClick: () => void;
    label?: string;
}> = ({ price, affordable, sold, onClick, label }) => (
    <button
        onClick={(e) => { e.stopPropagation(); eventBus.emit(GameEvents.UI_CLICK); onClick(); }}
        disabled={sold || !affordable}
        className={`px-4 py-1.5 rounded-lg font-black text-sm tracking-wider transition-all ${
            sold
                ? 'bg-gray-700/50 text-gray-400 cursor-default'
                : affordable
                    ? 'bg-gradient-to-r from-emerald-600 to-emerald-400 hover:scale-105 shadow-[0_0_15px_rgba(16,185,129,0.4)]'
                    : 'bg-white/5 text-gray-500 cursor-not-allowed'
        }`}
    >
        {sold ? '已购' : (label ?? `🪙${price}`)}
    </button>
);

export const ShopModal: React.FC<ShopModalProps> = ({
    run, stock: initialStock,
    onBuyCard, onBuyEnhancement, onBuyEquipment, onRemoveCard, onRefresh, onClose,
}) => {
    const [stock, setStock] = useState<ShopStock>(initialStock);
    const [purchased, setPurchased] = useState<Set<string>>(new Set());
    const [removePick, setRemovePick] = useState<string | null>(null);

    const affordable = (price: number) => run.gold >= price;
    const mark = (id: string) => setPurchased(prev => new Set(prev).add(id));

    const handleRefresh = () => {
        if (onRefresh()) {
            setStock(generateShopStock(run.rarityBonus));
            setPurchased(new Set());
            setRemovePick(null);
        }
    };

    // 删卡候选：牌组里非英雄卡（去重）
    const removableDeck = Array.from(new Set(run.deck.filter(k => !CARD_DB[k]?.isChampion)));
    const removePickName = removePick ? CARD_DB[removePick]?.name : null;

    return (
        <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[700] flex items-center justify-center bg-black/80 backdrop-blur-sm"
            onClick={(e) => e.stopPropagation()}
        >
            <motion.div
                initial={{ scale: 0.9, opacity: 0, y: 24 }} animate={{ scale: 1, opacity: 1, y: 0 }}
                transition={{ type: 'spring', stiffness: 300, damping: 24 }}
                className="w-[1160px] max-w-[96vw] max-h-[92vh] overflow-y-auto rounded-2xl bg-slate-900/95 border border-emerald-500/20 p-6 text-white"
                style={{ boxShadow: '0 0 60px rgba(16,185,129,0.18)' }}
            >
                {/* 顶部工具栏 */}
                <div className="flex items-center justify-between mb-5">
                    <div className="flex items-center gap-2">
                        <ShoppingBag size={24} className="text-emerald-400" />
                        <h2 className="text-3xl font-black tracking-widest">商店</h2>
                        <span className="text-xs font-mono text-emerald-300/60 ml-2">SHOP</span>
                    </div>
                    <div className="flex items-center gap-3">
                        <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-400/30 text-amber-300 font-black">
                            <Coins size={16} /> {run.gold}
                        </span>
                        <button
                            onClick={(e) => { e.stopPropagation(); eventBus.emit(GameEvents.UI_CLICK); handleRefresh(); }}
                            disabled={run.refreshCount <= 0}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-black transition-all ${run.refreshCount > 0
                                ? 'bg-cyan-600/80 hover:bg-cyan-500 hover:scale-105'
                                : 'bg-white/5 text-gray-500 cursor-not-allowed'}`}
                            title="刷新商品（消耗一次刷新次数）"
                        >
                            <RefreshCw size={15} /> 刷新 ×{run.refreshCount}
                        </button>
                        <button
                            onClick={(e) => { e.stopPropagation(); eventBus.emit(GameEvents.UI_BACK); onClose(); }}
                            className="p-2 rounded-full bg-white/5 hover:bg-white/20 border border-white/10 hover:border-white/40 transition-all"
                        >
                            <X size={20} className="text-gray-300" />
                        </button>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-5">
                    {/* ── 买卡（带装备）── */}
                    <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                        <SectionTitle>🃏 买卡（带装备）</SectionTitle>
                        <div className="flex gap-4 justify-center">
                            {stock.cards.map(item => {
                                const sold = purchased.has(item.cardKey);
                                return (
                                    <div key={item.cardKey} className="flex flex-col items-center gap-1.5">
                                        <div className="relative">
                                            <Card data={displayCard(item.cardKey)} location="deck-builder" isFaceUp />
                                            {item.equipId && (
                                                <div className="absolute -top-2 -right-2 z-10"><EquipHex equipId={item.equipId} size={30} /></div>
                                            )}
                                        </div>
                                        <PriceButton
                                            price={item.price}
                                            affordable={affordable(item.price)}
                                            sold={sold}
                                            onClick={() => { if (onBuyCard(item.cardKey, item.equipId, item.price)) mark(item.cardKey); }}
                                        />
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* ── 买迷宫强化 ── */}
                    <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                        <SectionTitle>✨ 买迷宫强化</SectionTitle>
                        {stock.enhancement ? (() => {
                            const enh = MAZE_ENHANCEMENTS.find(e => e.id === stock.enhancement!.enhancementId);
                            if (!enh) return <p className="text-gray-500 text-sm">暂无强化出售</p>;
                            const sold = purchased.has(`enh_${enh.id}`);
                            return (
                                <div className="flex flex-col items-center gap-3">
                                    <div className="w-44">
                                        <EnhancementCard enhancement={enh} isSelected={false} onClick={() => {}} />
                                    </div>
                                    <PriceButton
                                        price={stock.enhancement.price}
                                        affordable={affordable(stock.enhancement.price)}
                                        sold={sold}
                                        onClick={() => { if (onBuyEnhancement(enh.id, stock.enhancement!.price)) mark(`enh_${enh.id}`); }}
                                    />
                                </div>
                            );
                        })() : <p className="text-gray-500 text-sm">暂无强化出售</p>}
                    </div>

                    {/* ── 买装备（挂英雄卡）── */}
                    <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                        <SectionTitle>⚔️ 买装备（挂载到英雄卡）</SectionTitle>
                        <div className="flex gap-6 justify-center items-center">
                            {stock.equipments.map(item => {
                                const def = getEquipmentById(item.equipmentId);
                                if (!def) return null;
                                const sold = purchased.has(`eq_${item.equipmentId}`);
                                return (
                                    <div key={item.equipmentId} className="flex flex-col items-center gap-2">
                                        <EquipHex equipId={item.equipmentId} size={48} />
                                        <span className="text-sm font-bold text-white/90">{def.name}</span>
                                        <span className="text-[10px] font-mono text-white/50">{def.description}</span>
                                        <PriceButton
                                            price={item.price}
                                            affordable={affordable(item.price)}
                                            sold={sold}
                                            onClick={() => { if (onBuyEquipment(item.equipmentId, item.price)) mark(`eq_${item.equipmentId}`); }}
                                        />
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* ── 删卡 ── */}
                    <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                        <SectionTitle><Trash2 size={14} className="text-red-400" /> 删卡（移除牌组中一张牌）</SectionTitle>
                        {removableDeck.length === 0 ? (
                            <p className="text-gray-500 text-sm">牌组没有可删的牌</p>
                        ) : (
                            <>
                                <div className="flex flex-wrap gap-2 mb-3">
                                    {removableDeck.map(key => (
                                        <button
                                            key={key}
                                            onClick={(e) => { e.stopPropagation(); setRemovePick(removePick === key ? null : key); }}
                                            className={`px-2 py-1 rounded-lg text-xs font-bold border transition-all ${
                                                removePick === key
                                                    ? 'bg-red-500/30 border-red-400 text-white'
                                                    : 'bg-white/5 border-white/10 text-gray-300 hover:bg-white/15'
                                            }`}
                                        >
                                            {CARD_DB[key]?.name ?? key}
                                        </button>
                                    ))}
                                </div>
                                <PriceButton
                                    price={50}
                                    affordable={affordable(50)}
                                    sold={false}
                                    onClick={() => {
                                        if (removePick && onRemoveCard(removePick, 50)) {
                                            setRemovePick(null);
                                        }
                                    }}
                                    label={removePick ? `删「${removePickName}」🪙50` : '选择要删的牌'}
                                />
                                {!removePick && <p className="mt-2 text-[11px] text-gray-500">先选一张牌，再点击删除</p>}
                            </>
                        )}
                    </div>
                </div>

                <div className="mt-6 flex justify-center">
                    <button
                        onClick={(e) => { e.stopPropagation(); eventBus.emit(GameEvents.UI_BACK); onClose(); }}
                        className="px-12 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 font-black tracking-widest transition-all"
                    >
                        离开商店
                    </button>
                </div>
            </motion.div>
        </motion.div>
    );
};
