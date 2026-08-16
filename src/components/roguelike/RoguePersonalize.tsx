// ==========================================
// 悖论迷宫 · 个性化界面
// [2026-08-13 莉莉子] 照搬 PVE DeckBuilder「枢纽详情」三翼布局：
//   左卡牌列表（只读 + 悬停大图检视）| 中牌组图标（DeckDiorama）| 右卡背/牌桌个性化
//   去除：开始游戏 / AI 难度 / 牌库删除
//   编辑按钮仅开发者账号可见（编辑肉鸽初始牌组）
// ==========================================
import React, { useState, useMemo } from 'react';
import { Plus, X, Pencil } from 'lucide-react';
import { CARD_DB } from '../../data/cards';
import { buildStarterDeck } from '../../data/roguelike/rogueStarterDecks';
import { PERSONALIZATION_ASSETS, getSkinImage } from '../../data/imageData';
import { StyleSelector } from '../StyleSelector';
import { DeskMedia } from '../DeskMedia'; // [2026-08-13] 动态牌桌媒体组件
import { useCardGaze } from '../../hooks/useCardGaze';
import { FloatingCardPreview } from '../FloatingCardPreview';
import { eventBus, GameEvents } from '../../utils/eventBus';

// ── 牌组图标尺寸常量（照搬 DeckBuilder）──
const DIORAMA_SIZE = {
    containerWidth: 'w-72',
    containerHeight: 'h-96',
    cardWidth: 'w-36',
    cardHeight: 'h-52',
    boardWidth: 'w-[270px]',
    boardHeight: 'h-[160px]',
};

// ── 封面提取（照搬 DeckBuilder）──
const getDeckCovers = (cards: Record<string, number>, skinOverrides?: Record<string, number>): { url: string; skinId: number; isBack: boolean }[] => {
    const cardKeys = Object.keys(cards);
    if (cardKeys.length === 0) return [
        { url: 'CARD_BACK', skinId: 0, isBack: true },
        { url: 'CARD_BACK', skinId: 0, isBack: true },
        { url: 'CARD_BACK', skinId: 0, isBack: true },
    ];
    const sorted = cardKeys.sort((a, b) => {
        const cardA = CARD_DB[a];
        const cardB = CARD_DB[b];
        if (!cardA || !cardB) return 0;
        if (cardA.isChampion !== cardB.isChampion) return cardA.isChampion ? -1 : 1;
        if (cards[a] !== cards[b]) return cards[b] - cards[a];
        const isUnitA = cardA.type.includes('unit');
        const isUnitB = cardB.type.includes('unit');
        if (isUnitA !== isUnitB) return isUnitA ? -1 : 1;
        return 0;
    });
    return sorted.slice(0, 3).map(key => {
        const skin = getSkinImage(key, skinOverrides?.[key] || 0);
        return { url: skin || CARD_DB[key].imageUrl, skinId: skinOverrides?.[key] || 0, isBack: false };
    });
};

// ── 牌组图标微缩景观（照搬 DeckBuilder，肉鸽版铭牌显示「X 张」）──
const DeckDiorama = ({ deck, covers, cardBackImg, boardImg }: any) => {
    if (deck.isNew) {
        return (
            <div className={`relative ${DIORAMA_SIZE.containerWidth} ${DIORAMA_SIZE.containerHeight} flex flex-col items-center justify-center transition-all duration-500 scale-100 opacity-100 z-40`}>
                <div className="absolute inset-0 rounded-2xl border-4 border-dashed border-gray-600/50 bg-slate-800/30 flex flex-col items-center justify-center">
                    <Plus size={48} className="text-gray-600 mb-4" />
                    <span className="font-bold tracking-widest text-gray-500">新卡组</span>
                </div>
            </div>
        );
    }

    const cardCount: number = (Object.values(deck.cards ?? {}) as number[]).reduce((a: number, b: number) => a + b, 0);

    return (
        <div className={`relative ${DIORAMA_SIZE.containerWidth} ${DIORAMA_SIZE.containerHeight} transition-all duration-500 scale-100 opacity-100 z-40`}>
            {/* 底层大棋盘背景 */}
            <div className={`${DIORAMA_SIZE.boardWidth} ${DIORAMA_SIZE.boardHeight} absolute top-4 left-1/2 -translate-x-1/2 rounded-xl overflow-hidden border border-slate-700/80 shadow-2xl z-0`}>
                <img src={boardImg} className="w-full h-full object-cover opacity-80" alt="棋盘" />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/20 to-transparent"></div>
            </div>

            {/* 左侧扇形核心三卡 */}
            <div className="absolute top-12 left-6 z-20 pointer-events-none">
                {covers.map((cover: { url: string; skinId: number; isBack: boolean }, i: number) => {
                    const rotations = [-16, 0, 16];
                    const translatesX = [0, 24, 48];
                    const translatesY = [12, 0, 12];
                    const zIndexes = [25, 23, 21];
                    const isBack = cover.isBack;
                    const renderUrl = isBack ? cardBackImg : cover.url;
                    return (
                        <div
                            key={i}
                            className={`${DIORAMA_SIZE.cardWidth} ${DIORAMA_SIZE.cardHeight} absolute rounded-xl border-2 shadow-[5px_5px_15px_rgba(0,0,0,0.6)] overflow-hidden ${isBack ? 'border-slate-800/80 bg-slate-900' : 'border-slate-800 bg-slate-950'}`}
                            style={{ transform: `translateX(${translatesX[i]}px) translateY(${translatesY[i]}px) rotate(${rotations[i]}deg)`, zIndex: zIndexes[i] }}
                        >
                            {!isBack && (
                                <div className={`absolute inset-0 bg-gradient-to-b pointer-events-none z-0 ${cover.skinId > 0 ? 'from-yellow-600/40 via-yellow-500/20 to-yellow-300/5' : 'from-gray-300/40 via-gray-200/20 to-white/5'}`}></div>
                            )}
                            <img src={renderUrl} className={`w-full h-full object-cover relative z-10 ${isBack ? 'opacity-90 mix-blend-luminosity' : ''}`} alt={isBack ? "Card Back Fill" : "Hero Front"} />
                            {isBack && <div className="absolute inset-0 bg-black/40 mix-blend-multiply z-20"></div>}
                        </div>
                    );
                })}
            </div>

            {/* 右下角卡背堆叠 */}
            <div className={`absolute bottom-6 right-6 ${DIORAMA_SIZE.cardWidth} ${DIORAMA_SIZE.cardHeight} z-30 pointer-events-none`} style={{ transform: 'rotate(10deg) translate(20px, 12px)' }}>
                {[2, 1, 0].map(i => (
                    <div key={i} className="absolute inset-0 bg-slate-950 rounded-xl border border-slate-900 shadow-md" style={{ transform: `translate(-${i * 3}px, -${i * 3}px)`, zIndex: i === 0 ? 10 : 5 - i }}></div>
                ))}
                <div className="absolute inset-0 rounded-xl border-2 border-slate-600 shadow-2xl overflow-hidden z-10">
                    <img src={cardBackImg} className="w-full h-full object-cover" alt="卡背" />
                </div>
            </div>

            {/* 信息铭牌（肉鸽版：X 张） */}
            <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-slate-950/95 border border-slate-800/80 px-6 py-2 rounded-full z-40 flex flex-col items-center shadow-2xl backdrop-blur-md whitespace-nowrap min-w-[160px]">
                <span className="text-white font-black truncate w-full text-center text-sm tracking-wide">{deck.name}</span>
                <span className="text-[10px] font-mono font-bold tracking-widest text-purple-300">{cardCount} 张</span>
            </div>
        </div>
    );
};

interface RoguePersonalizeProps {
    heroKey: string;
    userSystem: any;
    onEditDeck: (heroKey: string) => void; // [2026-08-13] 编辑肉鸽初始牌组（仅开发者可见按钮触发）
}

export const RoguePersonalize: React.FC<RoguePersonalizeProps> = ({ heroKey, userSystem, onEditDeck }) => {
    const heroName = CARD_DB[heroKey]?.name ?? heroKey;

    // [2026-08-13] 数据源：userSystem 中注册的肉鸽初始牌组（开发者编辑过）优先，否则 buildStarterDeck 默认
    const deck = useMemo(() => {
        const existing = userSystem.decks?.find((d: any) => d.id === `rogue_starter_${heroKey}`);
        if (existing) return existing;
        const starter = buildStarterDeck(heroKey);
        const cards: Record<string, number> = {};
        starter.forEach(k => { cards[k] = (cards[k] || 0) + 1; });
        return {
            id: `rogue_starter_${heroKey}`,
            name: `肉鸽·${heroName}`,
            hero: heroKey,
            cards,
            skinOverrides: {},
            createdAt: 0,
            updatedAt: 0,
            cardBackIndex: userSystem.settings?.customization?.currentCardBackIndex,
            boardIndex: userSystem.settings?.customization?.currentDeskIndex,
        };
    }, [heroKey, heroName, userSystem.decks, userSystem.settings]);

    const covers = useMemo(() => getDeckCovers(deck.cards, deck.skinOverrides), [deck]);
    const cardBackImg = PERSONALIZATION_ASSETS.cardBacks[deck.cardBackIndex ?? userSystem.settings?.customization?.currentCardBackIndex ?? 0];
    const boardImg = PERSONALIZATION_ASSETS.desks[deck.boardIndex ?? userSystem.settings?.customization?.currentDeskIndex ?? 0];

    // 悬停大图检视
    const { gazeTarget, bindGazeEvents } = useCardGaze({ delay: 250 });

    // 右侧个性化选择器
    const [selectorType, setSelectorType] = useState<'cardBack' | 'desk' | null>(null);
    const [hubHoverItem, setHubHoverItem] = useState<'cardBack' | 'desk' | null>(null);

    // 是否开发者账号（编辑按钮仅 dev 可见）
    const isDev = userSystem.userId === 'dev_full_admin';

    // 更新个性化（卡背/牌桌）→ 注册并保存到 userSystem 肉鸽牌组
    const updateCustomization = (patch: Partial<{ cardBackIndex: number; boardIndex: number }>) => {
        userSystem.saveDeck({ ...deck, ...patch });
    };

    return (
        <div className="relative flex items-center justify-center gap-6 h-full min-h-0">
            {/* 左翼：卡牌列表只读预览（悬停大图检视） */}
            <div className="w-80 h-[560px] bg-slate-900/90 border border-white/10 rounded-3xl flex flex-col mr-6 shadow-[0_30px_60px_rgba(0,0,0,0.8)] relative overflow-hidden">
                <div className="p-5 bg-black/40 font-black text-gray-400 tracking-[0.3em] text-center border-b border-white/10 shrink-0 z-20">卡组预览</div>
                <div className="flex-1 relative overflow-hidden bg-slate-950">
                    <div className="absolute top-0 left-0 w-full h-10 bg-gradient-to-b from-slate-950 via-slate-950/80 to-transparent z-10 pointer-events-none"></div>
                    <div className="h-full overflow-y-auto px-4 py-8 space-y-2 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                        {Object.entries(deck.cards).map(([key, count]: any) => {
                            const card = CARD_DB[key];
                            if (!card) return null;
                            const fullCard = { ...card, id: key, strikeCount: 0, animState: 'idle' as const, damageTaken: 0, buffs: { power: 0, health: 0 } };
                            return (
                                <div key={key} className="relative flex items-center h-12 bg-gray-800/90 rounded-lg border border-gray-700/60 hover:border-blue-500 overflow-hidden cursor-help" {...bindGazeEvents(fullCard)}>
                                    <div className="absolute inset-0 opacity-40 bg-cover bg-center" style={{ backgroundImage: `url(${getSkinImage(key, deck.skinOverrides?.[key] || 0) || card.imageUrl})` }}></div>
                                    <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/40 to-transparent"></div>
                                    <div className="absolute inset-0 flex items-center justify-between px-3">
                                        <div className="flex gap-3 items-center">
                                            <span className="w-6 h-6 rounded-full bg-blue-900 flex justify-center items-center text-xs font-bold border border-blue-500 text-blue-200">{card.cost}</span>
                                            <span className="text-sm font-bold truncate w-32 drop-shadow-md">{card.name}</span>
                                        </div>
                                        <span className="text-yellow-400 font-black text-sm">x{count}</span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                    <div className="absolute bottom-0 left-0 w-full h-10 bg-gradient-to-t from-slate-950 via-slate-950/80 to-transparent z-10 pointer-events-none"></div>
                </div>
                {/* [2026-08-13] 底部：编辑按钮（仅开发者账号可见） */}
                <div className="p-4 shrink-0 border-t border-white/10 bg-black/40 z-20">
                    {isDev ? (
                        <button
                            onClick={() => { eventBus.emit(GameEvents.UI_CLICK); onEditDeck(heroKey); }}
                            className="w-full p-4 bg-blue-900 hover:bg-blue-600 text-white font-black tracking-widest rounded-xl transition-all flex items-center justify-center gap-2"
                        >
                            <Pencil size={16} /> 编辑肉鸽初始牌组
                        </button>
                    ) : (
                        <div className="w-full p-4 bg-slate-800/60 text-gray-500 font-bold tracking-widest rounded-xl text-center">初始牌组（只读）</div>
                    )}
                </div>
            </div>

            {/* 中翼：牌组图标（DeckDiorama） */}
            <div className="flex flex-col items-center z-50 mx-6">
                <DeckDiorama
                    deck={deck}
                    covers={covers}
                    cardBackImg={cardBackImg}
                    boardImg={boardImg}
                />
            </div>

            {/* 右翼：卡背 / 牌桌个性化 */}
            <div className="w-72 h-fit pb-10 bg-[#1e293b]/90 border border-white/10 rounded-3xl flex flex-col ml-6 shadow-2xl relative overflow-visible backdrop-blur-md z-40">
                <div className="p-5 bg-black/40 font-black text-gray-400 tracking-[0.3em] text-center border-b border-white/10 shrink-0 mb-4">定制</div>
                <div className="flex-1 flex flex-col justify-center items-center gap-10 px-6 relative">
                    {/* 悬停预览（卡背/牌桌大图） */}
                    {hubHoverItem && (
                        <div className="absolute left-[105%] top-1/2 -translate-y-1/2 pointer-events-none animate-fade-in z-50">
                            <div className="absolute inset-0 bg-black/80 backdrop-blur-xl rounded-xl -m-4"></div>
                            <div className={`relative border-2 border-orange-500/50 rounded-lg overflow-hidden shadow-2xl ${hubHoverItem === 'cardBack' ? 'w-[240px] h-[360px]' : 'w-[400px] h-[225px]'}`}>
                                {hubHoverItem === 'cardBack' ? (
                                    <img src={cardBackImg} className="w-full h-full object-cover" alt="预览" />
                                ) : (
                                    <DeskMedia deskIndex={deck.boardIndex ?? userSystem.settings?.customization?.currentDeskIndex ?? 0} dynamic={(userSystem.settings as any)?.deskDynamic} className="w-full h-full object-cover" />
                                )}
                                <div className="absolute bottom-0 w-full bg-black/60 text-white text-center text-xs py-1 font-mono tracking-widest backdrop-blur-sm">PREVIEW</div>
                            </div>
                        </div>
                    )}

                    {/* 卡背更换大按钮 */}
                    <div className="flex flex-col items-center gap-4 w-full">
                        <span className="text-xs text-yellow-600 font-bold tracking-widest uppercase">卡背</span>
                        <div
                            className="relative group cursor-pointer"
                            onMouseEnter={() => setHubHoverItem('cardBack')}
                            onMouseLeave={() => setHubHoverItem(null)}
                            onClick={() => { eventBus.emit(GameEvents.UI_CLICK); setSelectorType('cardBack'); }}
                        >
                            <div className="w-32 h-48 rounded-lg overflow-hidden border-2 border-white/20 shadow-lg transition-all duration-300 group-hover:scale-110 group-hover:rotate-[15deg] group-hover:border-orange-500 group-hover:shadow-[0_0_20px_orange] z-10 relative bg-black">
                                <img src={cardBackImg} className="w-full h-full object-cover" alt="卡背" />
                            </div>
                        </div>
                    </div>

                    {/* 棋盘桌垫更换大按钮 */}
                    <div className="flex flex-col items-center gap-4 w-full">
                        <span className="text-xs text-yellow-600 font-bold tracking-widest uppercase">牌桌</span>
                        <div
                            className="relative group cursor-pointer"
                            onMouseEnter={() => setHubHoverItem('desk')}
                            onMouseLeave={() => setHubHoverItem(null)}
                            onClick={() => { eventBus.emit(GameEvents.UI_CLICK); setSelectorType('desk'); }}
                        >
                            <div className="w-48 h-28 rounded-lg overflow-hidden border-2 border-white/20 shadow-lg transition-all duration-300 group-hover:scale-110 group-hover:-rotate-[15deg] group-hover:border-orange-500 group-hover:shadow-[0_0_20px_orange] z-10 relative bg-black">
                                <DeskMedia deskIndex={deck.boardIndex ?? userSystem.settings?.customization?.currentDeskIndex ?? 0} dynamic={(userSystem.settings as any)?.deskDynamic} className="w-full h-full object-cover" />
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* 悬停大图预览 */}
            <FloatingCardPreview gazeTarget={gazeTarget} mode="follow" scale={1.25} interactive
                onMouseEnter={() => {}}
                onMouseLeave={() => {}}
            />

            {/* 卡背/牌桌选择器 */}
            {selectorType && (
                <div className="absolute inset-0 z-[300]">
                    <StyleSelector
                        type={selectorType}
                        currentSelected={selectorType === 'cardBack' ? (deck.cardBackIndex ?? userSystem.settings?.customization?.currentCardBackIndex ?? 0) : (deck.boardIndex ?? userSystem.settings?.customization?.currentDeskIndex ?? 0)}
                        unlockedIndices={selectorType === 'cardBack' ? userSystem.settings?.unlockedCardBacks : userSystem.settings?.unlockedDesks}
                        onSelect={(idx: number) => {
                            if (selectorType === 'cardBack') updateCustomization({ cardBackIndex: idx });
                            else updateCustomization({ boardIndex: idx });
                        }}
                        onClose={() => setSelectorType(null)}
                        deskDynamic={(userSystem.settings as any)?.deskDynamic} // [2026-08-13] 动态牌桌
                    />
                </div>
            )}

            {/* 关闭按钮（右上角） */}
            <button
                onClick={() => { eventBus.emit(GameEvents.UI_BACK); setSelectorType(null); }}
                className="absolute top-8 right-8 text-gray-400 hover:text-white bg-white/5 border border-white/10 p-3 rounded-full transition-all hover:bg-red-500/80 z-50"
                title="关闭"
            >
                <X size={24} />
            </button>
        </div>
    );
};
