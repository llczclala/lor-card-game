// ==========================================
// 悖论迷宫 · 头像抽屉（左侧滑出面板）
// [2026-08-10 莉莉子] 点左下角头像打开：
//   左侧 tab 栏（上：卡牌列表 / 下：迷宫强化）+ 右侧内容区
//   卡牌列表：复用全局悬停检视（useCardGaze + FloatingCardPreview，悬停右侧出大图）+ 数量 X1/X2
//   强化列表：左侧圆形强化图容器 + 右侧上名称下效果
// ==========================================
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Swords, Sparkles } from 'lucide-react';
import { CARD_DB } from '../../data/cards';
import { MAZE_ENHANCEMENTS } from '../../data/roguelike/enhancements';
import { RARITY_META } from './RarityIcon';
import { useCardGaze } from '../../hooks/useCardGaze';
import { FloatingCardPreview } from '../FloatingCardPreview';
import { useArmamentConfig } from '../../hooks/useArmamentConfig'; // [2026-08-15] 悬停检视挂武装
import { attachEquipment } from '../../data/equipment';
import type { CardData } from '../../types';

type DrawerTab = 'cards' | 'enhancements';

interface RogueDrawerProps {
    open: boolean;
    onClose: () => void;
    deck: string[];         // 卡牌 keys
    enhancements: string[]; // 迷宫强化 ids
    heroKey?: string;       // [2026-08-15] 当前天启者 key（悬停检视英雄卡挂武装）
}

export const RogueDrawer: React.FC<RogueDrawerProps> = ({ open, onClose, deck, enhancements, heroKey }) => {
    const [tab, setTab] = useState<DrawerTab>('cards');
    // [2026-08-10] 悬停大图检视（复用全局方案：useCardGaze + FloatingCardPreview）
    const { gazeTarget, bindGazeEvents, dismissGaze } = useCardGaze({ delay: 300 });
    const { getArmament } = useArmamentConfig(); // [2026-08-15] 武装配置（检视英雄卡挂武装）

    // 抽屉关闭时清理可能残留的悬停大图
    useEffect(() => {
        if (!open) dismissGaze();
    }, [open, dismissGaze]);

    // 卡牌去重计数（保持牌组出现顺序）
    const cardCounts = new Map<string, number>();
    deck.forEach(k => cardCounts.set(k, (cardCounts.get(k) || 0) + 1));

    // 强化 id → 定义映射（过滤未知 id）
    const enhanceList = enhancements
        .map(id => MAZE_ENHANCEMENTS.find(e => e.id === id))
        .filter((e): e is NonNullable<typeof e> => !!e);

    const TAB_META: Record<DrawerTab, { label: string; Icon: typeof Swords }> = {
        cards: { label: '卡牌', Icon: Swords },
        enhancements: { label: '强化', Icon: Sparkles },
    };

    return (
        <>
            <AnimatePresence>
                {open && (
                    <>
                        {/* 遮罩 */}
                        <motion.div
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            className="fixed inset-0 z-[600] bg-black/40"
                            onClick={onClose}
                        />
                        {/* 抽屉主体 */}
                        <motion.div
                            initial={{ x: -420 }} animate={{ x: 0 }} exit={{ x: -420 }}
                            transition={{ type: 'spring', stiffness: 320, damping: 32 }}
                            className="fixed left-0 top-0 bottom-0 z-[610] flex"
                        >
                            {/* 左侧 tab 栏：上下两个选项卡 */}
                            <div className="w-14 bg-slate-950/95 border-r border-white/10 flex flex-col items-center pt-28 gap-3">
                                {(Object.keys(TAB_META) as DrawerTab[]).map(k => {
                                    const meta = TAB_META[k];
                                    const active = tab === k;
                                    return (
                                        <button
                                            key={k}
                                            onClick={() => setTab(k)}
                                            title={meta.label}
                                            className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all border-2
                                                ${active
                                                    ? 'bg-purple-600/30 border-purple-400 text-purple-200 shadow-[0_0_16px_rgba(168,85,247,0.4)]'
                                                    : 'bg-white/5 border-white/10 text-gray-500 hover:text-white hover:border-white/30'}`}
                                        >
                                            <meta.Icon size={18} />
                                        </button>
                                    );
                                })}
                            </div>

                            {/* 内容区 */}
                            <div className="w-80 bg-slate-900/95 border-r border-white/10 flex flex-col">
                                {/* 头部 */}
                                <div className="p-4 flex items-center justify-between border-b border-white/10 shrink-0">
                                    <h3 className="font-black text-gray-100 tracking-widest">
                                        {tab === 'cards' ? '当前牌组' : '迷宫强化'}
                                    </h3>
                                    <button onClick={onClose} className="p-1.5 rounded-lg bg-white/5 hover:bg-white/15 text-gray-400 hover:text-white transition-colors">
                                        <X size={18} />
                                    </button>
                                </div>

                                {/* 内容滚动区 */}
                                <div className="flex-1 overflow-y-auto p-3 space-y-2 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                                    {tab === 'cards' ? (
                                        cardCounts.size === 0 ? (
                                            <p className="text-gray-500 text-sm text-center pt-8">牌组为空</p>
                                        ) : (
                                            [...cardCounts.entries()].map(([key, count]) => {
                                                const card = CARD_DB[key];
                                                if (!card) return null;
                                                // [2026-08-10] CARD_DB 为静态定义（缺运行时字段），补全为完整 CardData 供悬停检视使用
                                                let fullCard: CardData = { ...card, id: key, strikeCount: 0, animState: 'idle' as const, damageTaken: 0, buffs: { power: 0, health: 0 } };
                                                // [2026-08-15] 英雄卡检视大图挂武装（减费/BUFF 生效，右侧显示武装图标）
                                                if (heroKey && key === heroKey) {
                                                    for (const id of (getArmament(heroKey).filter((v): v is string => !!v))) fullCard = attachEquipment(fullCard, id);
                                                }
                                                return (
                                                    <div
                                                        key={key}
                                                        className="relative flex items-center h-12 bg-gray-800/90 rounded-lg border border-gray-700/60 hover:border-blue-500 overflow-hidden cursor-help"
                                                        {...bindGazeEvents(fullCard)} // [悬停检视] 悬停右侧出卡牌大图
                                                    >
                                                        <div className="absolute inset-0 opacity-40 bg-cover bg-center" style={{ backgroundImage: `url(${card.imageUrl})` }}></div>
                                                        <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/40 to-transparent"></div>
                                                        <div className="absolute inset-0 flex items-center justify-between px-3">
                                                            <div className="flex gap-3 items-center">
                                                                <span className="w-6 h-6 rounded-full bg-blue-900 flex justify-center items-center text-xs font-bold border border-blue-500 text-blue-200 shrink-0">{card.cost}</span>
                                                                <span className="text-sm font-bold truncate w-36 drop-shadow-md">{card.name}</span>
                                                            </div>
                                                            {/* [2026-08-10] 数量恒显 X1/X2... */}
                                                            <span className="text-yellow-400 font-black text-sm">X{count}</span>
                                                        </div>
                                                    </div>
                                                );
                                            })
                                        )
                                    ) : (
                                        enhanceList.length === 0 ? (
                                            <p className="text-gray-500 text-sm text-center pt-8">尚未获得迷宫强化</p>
                                        ) : (
                                            enhanceList.map(e => {
                                                const meta = RARITY_META[e.rarity];
                                                return (
                                                    <div
                                                        key={e.id}
                                                        className="flex items-center gap-4 bg-gray-800/90 rounded-xl border border-gray-700/60 p-4"
                                                        style={{ boxShadow: `inset 3px 0 0 ${meta.color}` }}
                                                    >
                                                        {/* 左侧圆形强化图容器（放大） */}
                                                        <div
                                                            className="w-[72px] h-[72px] rounded-full overflow-hidden border-[3px] shrink-0 bg-black"
                                                            style={{ borderColor: meta.color, boxShadow: `0 0 18px ${meta.color}55` }}
                                                        >
                                                            <img src={e.icon} className="w-full h-full object-cover" alt={e.name} />
                                                        </div>
                                                        {/* 右侧：上名称 / 下效果（加高加粗） */}
                                                        <div className="flex-1 min-w-0">
                                                            <div className="text-lg font-black text-white drop-shadow" style={{ textShadow: `0 0 14px ${meta.color}66` }}>{e.name}</div>
                                                            <div className="text-sm text-gray-300 leading-snug mt-1.5">{e.description}</div>
                                                        </div>
                                                    </div>
                                                );
                                            })
                                        )
                                    )}
                                </div>
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>

            {/* [悬停检视] 跟随鼠标的卡牌大图预览（复用全局组件） */}
            <FloatingCardPreview mode="follow" gazeTarget={gazeTarget} />
        </>
    );
};
