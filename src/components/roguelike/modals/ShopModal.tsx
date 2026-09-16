// ==========================================
// 悖论迷宫 · 商店弹窗（ShopModal）v2
// [2026-08-12 莉莉子] 参考 LOR 英雄之路商店（见 技术手册/参考-LOR商店经济.md）：
//   买带装备的卡 / 买迷宫强化 / 买装备挂英雄卡 / 删卡 + 刷新。
// [2026-08-28 莉莉子] 布局重做（程拍板：左侧 tab 侧边栏，对齐逻辑研习图鉴）：
//   原 2×2 四区平铺太挤 → 改为 左侧竖排 tab（买卡/迷宫强化/装备/删卡）+ 右侧内容区，
//   一次聚焦一类，卡片大展示不再挤在一起。顶部保留 金币/刷新/关闭，底部离开商店。
// ==========================================
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { ShoppingBag, Sparkles, Swords, Trash2, Coins, RefreshCw, X, Inbox, ArrowDown, Check } from 'lucide-react';
import type { CardData } from '../../../types';
import { Card } from '../../Card';
// [2026-09-10] 英雄卡改用 Card 自带的手牌样式武装 pips（data.equipment 驱动），不再自绘六边形

import { EnhancementCard as EnhanceCardBig } from './EnhancementCard'; // 强化法术卡样式（250×395，同强化 3 选 1）
import { CARD_DB } from '../../../data/cards';
import { getEquipmentById } from '../../../data/equipment';
import { generateShopStock, REMOVE_CARD_PRICE, type ShopStock } from '../../../data/roguelike/shop';
import { MAZE_ENHANCEMENTS } from '../../../data/roguelike/enhancements';
import type { RoguelikeRunState } from '../../../hooks/useRoguelikeRun';
import { eventBus, GameEvents } from '../../../utils/eventBus';
import { useArmamentConfig } from '../../../hooks/useArmamentConfig'; // [2026-09-10] 局外武装（英雄卡按手牌样式展示武装图标）

const HEX = 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)';
// [2026-08-27] 六档品质色：白/绿/蓝/紫/金/红
const RARITY_COLOR: Record<string, string> = { common: '#e5e7eb', uncommon: '#22c55e', rare: '#3b82f6', epic: '#a855f7', legendary: '#facc15', mythic: '#ef4444' };
const RARITY_LABEL: Record<string, string> = { common: '白', uncommon: '绿', rare: '蓝', epic: '紫', legendary: '金', mythic: '红' };

export type ShopTab = 'card' | 'enhancement' | 'equipment' | 'remove';

const TABS: { key: ShopTab; icon: React.ReactNode; label: string }[] = [
    { key: 'card', icon: <ShoppingBag size={16} />, label: '买卡' },
    { key: 'enhancement', icon: <Sparkles size={16} />, label: '迷宫强化' },
    { key: 'equipment', icon: <Swords size={16} />, label: '装备' },
    { key: 'remove', icon: <Trash2 size={16} />, label: '删卡' },
];

interface ShopModalProps {
    run: RoguelikeRunState;
    stock: ShopStock;
    availableTabs: ShopTab[]; // [2026-08-28] 本商店开启的页签（进入节点时随机确定，节点内重复开窗不变）
    onBuyCard: (cardKey: string, equipId: string | undefined, price: number) => boolean;
    onBuyEnhancement: (enhancementId: string, price: number) => boolean;
    /** [2026-09-10] 批量买装备：把 equipmentIds 一次全挂到 heroKey 身上（总价 totalPrice，装备无槽位上限） */
    onBuyEquipment: (heroKey: string, equipmentIds: string[], totalPrice: number) => boolean;
    onRemoveCard: (cardKey: string, price: number) => boolean;
    onRefresh: () => boolean;
    onClose: () => void;
}

/** 商店展示卡（补全 runtime 字段满足 CardData）
 *  [2026-09-10] 新增 equipment 参数：写入后 Card 会按手牌样式在卡面右下角渲染武装/装备图标（含悬停大卡） */
const displayCard = (key: string, equipment?: string[]): CardData => {
    const base = CARD_DB[key];
    return {
        ...base,
        id: `shop_${key}`,
        strikeCount: 0,
        animState: 'idle',
        damageTaken: 0,
        buffs: { power: 0, health: 0 },
        ...(equipment && equipment.length > 0 ? { equipment } : {}),
    } as CardData;
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

// ── 商店卡牌统一展示（程可微调）─────────────────────────────
// [2026-09-10 莉莉子] 卡牌一律走 location="hand"（手牌样式：右下角挂武装/装备图标 + 悬停大卡），
//   再用 CSS transform 整体放大 —— 原先 deck-builder(180×268) 虽然大一圈，但走不到 pips 通路，装备显示不出来。
//   改尺寸只动这一个常量即可（基准 hand 卡体 130×202）。
const CARD_BASE_W = 130;
const CARD_BASE_H = 202;
const SHOP_CARD_SCALE = 1.5;

// [2026-09-10 莉莉子] 卡牌之间的间隔（px，横纵通用）。
//   ⚠️ 不能按"看着够"来定：卡面右侧外挂的武装/装备图标是**绝对定位**（right:15×scale，每个宽 84×scale），
//   不参与布局，会往卡右侧再多探出 (84-15)×0.45×1.5 ≈ 47px。间隔必须大于这个外挂量，
//   否则相邻卡牌的图标会压在隔壁卡面上。（程可微调：外挂变多/变大时同步调大）
const CARD_GAP = 72;

/** 商店通用卡牌：手牌样式 + 统一放大，外层占位盒按放大后尺寸撑开避免布局塌陷 */
const ShopCard: React.FC<{ data: CardData; skinId?: number }> = ({ data, skinId = 0 }) => (
    <div
        className="flex items-center justify-center shrink-0"
        style={{ width: CARD_BASE_W * SHOP_CARD_SCALE, height: CARD_BASE_H * SHOP_CARD_SCALE }}
    >
        <div style={{ transform: `scale(${SHOP_CARD_SCALE})` }}>
            <Card data={data} location="hand" isFaceUp skinId={skinId} />
        </div>
    </div>
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

/** 左侧 tab 按钮（对齐逻辑研习图鉴侧边栏） */
const SideTabBtn: React.FC<{ active: boolean; onClick: () => void; icon: React.ReactNode; label: string; badge?: string | number }> = ({ active, onClick, icon, label, badge }) => (
    <button
        onClick={(e) => { e.stopPropagation(); eventBus.emit(GameEvents.UI_CLICK); onClick(); }}
        className={`flex items-center gap-2.5 px-3 py-3 rounded-xl border transition-all text-sm
            ${active
                ? 'bg-emerald-500/20 border-emerald-400/50 text-white shadow-[0_0_16px_rgba(16,185,129,0.3)]'
                : 'border-transparent text-gray-400 hover:bg-white/5 hover:text-gray-200'}`}
    >
        <span className="shrink-0">{icon}</span>
        <span className="font-medium">{label}</span>
        {badge !== undefined && <span className="ml-auto text-[10px] font-mono opacity-60">{badge}</span>}
    </button>
);

export const ShopModal: React.FC<ShopModalProps> = ({
    run, stock: initialStock, availableTabs,
    onBuyCard, onBuyEnhancement, onBuyEquipment, onRemoveCard, onRefresh, onClose,
}) => {
    const [stock, setStock] = useState<ShopStock>(initialStock);
    const [purchased, setPurchased] = useState<Set<string>>(new Set());
    const [removePick, setRemovePick] = useState<string | null>(null);
    // [2026-09-10] 装备页签：先选天启者（单选）→ 再选装备（多选）→ 一并付款挂载
    const [equipHeroPick, setEquipHeroPick] = useState<string | null>(null);
    const [equipPicks, setEquipPicks] = useState<Set<string>>(new Set());
    // [2026-08-28] 左侧 tab 分类：初始定位到本商店开启的第一个页签
    const [tab, setTab] = useState<ShopTab>(() => availableTabs[0] ?? 'card');

    const affordable = (price: number) => run.gold >= price;
    const mark = (id: string) => setPurchased(prev => new Set(prev).add(id));

    // [2026-09-10] 局外武装（对齐 RogueGameWrapper 战斗构建口径：只取已解锁槽位的武装）
    const { getArmament } = useArmamentConfig();
    /** 英雄卡按"手牌样式"渲染所需的装备列表 = 局内已购装备 + 局外武装（Card 据此渲染右下角图标 + 悬停大卡） */
    const heroCardData = (heroKey: string): CardData => {
        const inRun = run.equippedCards?.[heroKey] ?? [];
        const armaments = getArmament(heroKey, run.heroLevel ?? 1).filter((v): v is string => !!v);
        return displayCard(heroKey, [...inRun, ...armaments]);
    };

    const handleRefresh = () => {
        if (onRefresh()) {
            setStock(generateShopStock(run.rarityBonus, run.passUnlockedEnhancements)); // [2026-08-29 通行证]
            setPurchased(new Set());
            setRemovePick(null);
            setEquipPicks(new Set()); // [2026-09-10] 换货后清空已选装备
        }
    };

    // 删卡候选：牌组里非英雄卡（去重）
    const removableDeck = Array.from(new Set(run.deck.filter(k => !CARD_DB[k]?.isChampion)));
    const countInDeck = (key: string) => run.deck.filter(k => k === key).length;
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
                // [2026-09-10] 固定尺寸：四个页签共用同一窗口大小，切页签不再跳动。
                //   用容器相对单位（%），不用 vh/vw —— 弹窗在 ScaleWrapper 的 1680×1050 坐标内，vh 不随缩放走（见 design-guide 分辨率铁律）
                className="w-[1160px] max-w-[96%] h-[880px] max-h-[92%] flex flex-col rounded-2xl bg-slate-900/95 border border-emerald-500/20 text-white"
                style={{ boxShadow: '0 0 60px rgba(16,185,129,0.18)' }}
            >
                {/* 顶部工具栏 */}
                <div className="shrink-0 flex items-center justify-between px-6 pt-5 pb-4 border-b border-white/10">
                    <div className="flex items-center gap-2">
                        <ShoppingBag size={24} className="text-emerald-400" />
                        <h2 className="text-2xl font-black tracking-widest">商店</h2>
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

                {/* 主体：左侧 tab 侧边栏 + 右侧内容区 */}
                <div className="flex-1 min-h-0 flex">
                    {/* 左侧侧边栏：只渲染本商店开启的页签（[2026-08-28] 随机开启，等级补页签位） */}
                    <div className="w-44 shrink-0 border-r border-white/10 bg-black/20 flex flex-col gap-1.5 p-3">
                        {TABS.filter(t => availableTabs.includes(t.key)).map(t => (
                            <SideTabBtn
                                key={t.key}
                                active={tab === t.key}
                                onClick={() => setTab(t.key)}
                                icon={t.icon}
                                label={t.label}
                                badge={t.key === 'card' ? stock.cards.length
                                    : t.key === 'enhancement' ? (stock.enhancement ? 1 : 0)
                                    : t.key === 'equipment' ? stock.equipments.length
                                    : removableDeck.length}
                            />
                        ))}
                    </div>

                    {/* 右侧内容区（隐藏滚动条保留滚轮） */}
                    <div className="flex-1 min-w-0 overflow-y-auto p-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">

                        {/* ── 买卡（带装备）── */}
                        {tab === 'card' && (
                            <div className="min-h-full flex flex-col gap-4 items-center justify-center">
                                <SectionTitle>🃏 买卡（带装备）</SectionTitle>
                                <div className="flex justify-center flex-wrap items-start" style={{ gap: CARD_GAP }}>
                                    {stock.cards.map(item => {
                                        const sold = purchased.has(item.cardKey);
                                        return (
                                            <div key={item.cardKey} className="flex flex-col items-center gap-2.5">
                                                {/* [2026-09-10] 手牌样式：附带的装备写进 data.equipment → 卡面右下角自动出图标（悬停出大卡） */}
                                                <ShopCard data={displayCard(item.cardKey, item.equipId ? [item.equipId] : undefined)} />
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
                        )}

                        {/* ── 买迷宫强化 ── */}
                        {tab === 'enhancement' && (
                            <div className="min-h-full flex flex-col gap-4 items-center justify-center">
                                <SectionTitle>✨ 买迷宫强化</SectionTitle>
                                {stock.enhancement ? (() => {
                                    const enh = MAZE_ENHANCEMENTS.find(e => e.id === stock.enhancement!.enhancementId);
                                    if (!enh) return <p className="text-gray-500 text-sm">暂无强化出售</p>;
                                    const sold = purchased.has(`enh_${enh.id}`);
                                    return (
                                        <>
                                            <EnhanceCardBig enhancement={enh} isSelected={false} onClick={() => {}} />
                                            <PriceButton
                                                price={stock.enhancement.price}
                                                affordable={affordable(stock.enhancement.price)}
                                                sold={sold}
                                                onClick={() => { if (onBuyEnhancement(enh.id, stock.enhancement!.price)) mark(`enh_${enh.id}`); }}
                                            />
                                        </>
                                    );
                                })() : <p className="text-gray-500 text-sm">暂无强化出售</p>}
                            </div>
                        )}

                        {/* ── 买装备（① 选天启者 → ② 选装备 → ③ 购买）── */}
                        {tab === 'equipment' && (() => {
                            // [2026-09-10] 英雄候选 = 牌组里所有天启者卡（本局主英雄 + 首战招募来的英雄，去重）
                            const champions = Array.from(new Set(run.deck.filter(k => CARD_DB[k]?.isChampion)));
                            // 已选且未售出的装备（售出的可能被留在 state 里，实时过滤掉）
                            const picks = stock.equipments.filter(it => equipPicks.has(it.equipmentId) && !purchased.has(`eq_${it.equipmentId}`));
                            const total = picks.reduce((s, it) => s + it.price, 0);
                            // 三选一条件全满足才可买：选了英雄 + 选了装备 + 金币够
                            const canBuy = !!equipHeroPick && picks.length > 0 && run.gold >= total;
                            const heroName = equipHeroPick ? (CARD_DB[equipHeroPick]?.name ?? equipHeroPick) : '';
                            const hint = !equipHeroPick ? '请先在上方点选一位天启者'
                                : picks.length === 0 ? '请至少勾选一件装备'
                                : run.gold < total ? `金币不足，还差 🪙${total - run.gold}`
                                : `将「${heroName}」装备 ${picks.length} 件，共 🪙${total}`;
                            return (
                                <div className="min-h-full flex flex-col items-center justify-center">
                                    <SectionTitle>⚔️ 买装备（先选天启者，再选装备）</SectionTitle>

                                    {/* ① 天启者英雄卡（手牌样式：卡面自带武装/装备图标 + 悬停大卡） */}
                                    <div className="text-[11px] font-black tracking-widest text-emerald-300/70 mb-2.5">① 选择天启者</div>
                                    {champions.length === 0 ? (
                                        <p className="text-gray-500 text-sm py-3">牌组里没有可装备的天启者</p>
                                    ) : (
                                        <div className="flex flex-wrap justify-center" style={{ gap: CARD_GAP }}>
                                            {champions.map(hk => {
                                                const isPick = equipHeroPick === hk;
                                                const ownedCount = run.equippedCards?.[hk]?.length ?? 0;
                                                return (
                                                    <button
                                                        key={hk}
                                                        type="button"
                                                        onClick={(e) => { e.stopPropagation(); eventBus.emit(GameEvents.UI_CLICK); setEquipHeroPick(isPick ? null : hk); }}
                                                        className={`relative flex flex-col items-center gap-1.5 outline-none transition-all ${
                                                            isPick ? 'scale-[1.04]' : 'hover:scale-[1.04] hover:-translate-y-1.5'
                                                        }`}
                                                    >
                                                        <div className="relative">
                                                            <ShopCard data={heroCardData(hk)} />
                                                            {isPick && (
                                                                <div className="absolute -inset-1.5 rounded-2xl border-2 border-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.6)] pointer-events-none z-[96]" />
                                                            )}
                                                        </div>
                                                        <span className={`text-[11px] font-bold text-center max-w-[190px] truncate ${isPick ? 'text-emerald-300' : 'text-gray-300'}`}>
                                                            {CARD_DB[hk]?.name ?? hk}
                                                        </span>
                                                        {ownedCount > 0 && <span className="text-[10px] text-emerald-400/70 -mt-1">局内已装 {ownedCount} 件</span>}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    )}

                                    {/* 流程分隔：箭头指向下方装备区 */}
                                    <div className="flex items-center gap-3 my-3.5 w-full max-w-[860px]">
                                        <div className="flex-1 h-px bg-white/10" />
                                        <ArrowDown size={14} className={equipHeroPick ? 'text-emerald-400' : 'text-gray-600'} />
                                        <div className="flex-1 h-px bg-white/10" />
                                    </div>

                                    {/* ② 装备选项（可多选） */}
                                    <div className="text-[11px] font-black tracking-widest text-emerald-300/70 mb-2.5">
                                        ② 选择装备（可多选 · 不受武装槽位限制）
                                    </div>
                                    {stock.equipments.length === 0 ? (
                                        <p className="text-gray-500 text-sm py-3">暂无装备出售</p>
                                    ) : (
                                        <div className="grid grid-cols-2 gap-3 w-full max-w-[860px]">
                                            {stock.equipments.map(item => {
                                                const def = getEquipmentById(item.equipmentId);
                                                if (!def) return null;
                                                const sold = purchased.has(`eq_${item.equipmentId}`);
                                                const sel = !sold && equipPicks.has(item.equipmentId);
                                                const color = RARITY_COLOR[def.rarity] || '#9ca3af';
                                                return (
                                                    <button
                                                        key={item.equipmentId}
                                                        type="button"
                                                        disabled={sold}
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            eventBus.emit(GameEvents.UI_CLICK);
                                                            setEquipPicks(prev => {
                                                                const next = new Set(prev);
                                                                if (next.has(item.equipmentId)) next.delete(item.equipmentId); else next.add(item.equipmentId);
                                                                return next;
                                                            });
                                                        }}
                                                        className={`relative text-left rounded-xl p-3 flex items-center gap-3 border transition-all ${
                                                            sold ? 'bg-white/[0.02] border-white/5 opacity-45 cursor-default'
                                                                : sel ? 'bg-emerald-500/15 border-emerald-400/70 shadow-[0_0_18px_rgba(16,185,129,0.35)]'
                                                                : 'bg-white/5 border-white/10 cursor-pointer hover:bg-white/10 hover:border-white/25 hover:-translate-y-0.5'
                                                        }`}
                                                    >
                                                        <EquipHex equipId={item.equipmentId} size={48} />
                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex items-center gap-2 mb-1">
                                                                <span className="text-sm font-bold text-white truncate">{def.name}</span>
                                                                <span className="shrink-0 text-[10px] font-mono px-1.5 py-0.5 rounded"
                                                                    style={{ color, border: `1px solid ${color}44`, background: `${color}11` }}>
                                                                    {RARITY_LABEL[def.rarity] ?? def.rarity}
                                                                </span>
                                                            </div>
                                                            <p className="text-xs text-gray-400 mb-1.5 line-clamp-2">{def.description}</p>
                                                            <span className={`text-xs font-black ${sold ? 'text-gray-500' : affordable(item.price) ? 'text-amber-300' : 'text-red-400'}`}>
                                                                {sold ? '已购' : `🪙${item.price}`}
                                                            </span>
                                                        </div>
                                                        {sel && (
                                                            <span className="absolute -top-2 -right-2 z-10 w-6 h-6 rounded-full bg-emerald-500 border-2 border-slate-900 flex items-center justify-center pointer-events-none shadow-lg">
                                                                <Check size={13} strokeWidth={4} />
                                                            </span>
                                                        )}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    )}

                                    {/* ③ 购买条：总价 + 置灰条件（缺英雄 / 缺装备 / 金币不足） */}
                                    <div className="mt-5 w-full max-w-[860px]">
                                        <div className="flex items-center justify-between gap-4 rounded-xl border border-white/10 bg-black/30 px-4 py-3">
                                            <span className={`text-xs truncate ${canBuy ? 'text-emerald-300/90' : 'text-gray-500'}`}>{hint}</span>
                                            <div className="flex items-center gap-2 shrink-0">
                                                {equipPicks.size > 0 && (
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); eventBus.emit(GameEvents.UI_CLICK); setEquipPicks(new Set()); }}
                                                        className="px-3 py-1.5 rounded-lg text-xs font-bold bg-white/5 hover:bg-white/15 text-gray-300 transition-all"
                                                    >
                                                        清空
                                                    </button>
                                                )}
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        eventBus.emit(GameEvents.UI_CLICK);
                                                        if (!canBuy || !equipHeroPick) return;
                                                        const ids = picks.map(it => it.equipmentId);
                                                        if (onBuyEquipment(equipHeroPick, ids, total)) {
                                                            ids.forEach(id => mark(`eq_${id}`));
                                                            setEquipPicks(new Set()); // 买完收起选择，可接着给另一位英雄买
                                                        }
                                                    }}
                                                    disabled={!canBuy}
                                                    className={`px-6 py-2 rounded-lg font-black text-sm tracking-wider transition-all ${
                                                        canBuy
                                                            ? 'bg-gradient-to-r from-emerald-600 to-emerald-400 hover:scale-105 shadow-[0_0_18px_rgba(16,185,129,0.45)]'
                                                            : 'bg-white/5 text-gray-500 cursor-not-allowed'
                                                    }`}
                                                >
                                                    购买 {picks.length > 0 ? `🪙${total}` : ''}
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })()}

                        {/* ── 删卡 ── */}
                        {tab === 'remove' && (
                            <div className="min-h-full flex flex-col gap-4 items-center justify-center">
                                <SectionTitle><Trash2 size={14} className="text-red-400" /> 删卡（移除牌组中一张牌 · 🪙{REMOVE_CARD_PRICE}）</SectionTitle>
                                {removableDeck.length === 0 ? (
                                    <div className="flex flex-col items-center gap-3 py-10 text-gray-500">
                                        <Inbox size={40} />
                                        <p className="text-sm">牌组没有可删的牌</p>
                                    </div>
                                ) : (
                                    <>
                                        <div className="flex flex-wrap justify-center" style={{ gap: CARD_GAP }}>
                                            {removableDeck.map(key => {
                                                const isPick = removePick === key;
                                                return (
                                                    <div key={key} className="flex flex-col items-center gap-2">
                                                        <button
                                                            type="button"
                                                            onClick={(e) => { e.stopPropagation(); setRemovePick(isPick ? null : key); }}
                                                            className={`relative flex flex-col items-center gap-1.5 outline-none transition-all ${
                                                                isPick ? 'scale-105' : 'hover:scale-[1.04] hover:-translate-y-1 cursor-pointer'
                                                            }`}
                                                        >
                                                            {/* 选中红晕 */}
                                                            {isPick && (
                                                                <div className="absolute -inset-1 rounded-xl border-2 border-red-500 shadow-[0_0_18px_rgba(239,68,68,0.55)] z-10 pointer-events-none" />
                                                            )}
                                                            {/* 完整卡面（手牌样式 + 统一放大） */}
                                                            <div className="relative">
                                                                <ShopCard data={displayCard(key)} />
                                                                {/* 牌组中数量 */}
                                                                <span className="absolute -top-1.5 -right-1.5 z-20 px-1.5 py-0.5 rounded-full bg-slate-900 border border-yellow-400/70 text-yellow-300 font-black text-xs shadow">
                                                                    ×{countInDeck(key)}
                                                                </span>
                                                                {isPick && (
                                                                    <div className="absolute inset-0 z-30 rounded-lg bg-red-500/15 pointer-events-none" />
                                                                )}
                                                            </div>
                                                            {/* 卡名 */}
                                                            <span className={`text-[11px] font-bold text-center max-w-[190px] truncate ${isPick ? 'text-red-300' : 'text-gray-300'}`}>
                                                                {CARD_DB[key]?.name ?? key}
                                                            </span>
                                                        </button>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                        {removePick && (
                                            <div className="flex items-center justify-center gap-4 mt-2">
                                                <span className="text-xs text-gray-400">将删除「{removePickName}」</span>
                                                <PriceButton
                                                    price={REMOVE_CARD_PRICE}
                                                    affordable={affordable(REMOVE_CARD_PRICE)}
                                                    sold={false}
                                                    label={`确认删除 🪙${REMOVE_CARD_PRICE}`}
                                                    onClick={() => {
                                                        if (removePick && onRemoveCard(removePick, REMOVE_CARD_PRICE)) {
                                                            setRemovePick(null);
                                                        }
                                                    }}
                                                />
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* 底部离开商店 */}
                <div className="shrink-0 flex justify-center py-4 border-t border-white/10">
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
