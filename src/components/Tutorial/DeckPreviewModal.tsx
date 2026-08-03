import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, User, Swords, Shield, Sword, Play } from 'lucide-react';
import { CARD_DB } from '../../data/cards';
import { ENEMY_ARCHETYPES } from '../../data/enemies/archetypes';
import { TUTORIAL_STAGES } from '../../data/tutorialStages';
import { eventBus, GameEvents } from '../../utils/eventBus';
import { getCardBackUrl } from '../../utils/styleUtils';
import { UI_IMAGES, HERO_IMAGES, PERSONALIZATION_ASSETS } from '../../data/imageData';
import { Card } from '../Card';
import type { CardData } from '../../types';
// [新增] 悬停预览统一方案
import { useCardGaze } from '../../hooks/useCardGaze';
import { FloatingCardPreview } from '../FloatingCardPreview';

interface DeckPreviewModalProps {
    stageId: string;
    deskIndex: number;
    cardBackIndex: number;
    playerCustomDeck?: string[];
    onClose: () => void;
    onStart?: () => void; // [新增] 开始游戏回调
}

// [新增] 模拟生成完整的 CardData 以供悬浮预览
const toFullCardData = (staticData: any): CardData => ({
    ...staticData, id: 'preview_id', strikeCount: 0, animState: 'idle',
    damageTaken: 0, buffs: { power: 0, health: 0 }
});

// [新增] 提取封面工具 (升维改造：包装为带皮肤与卡背属性的对象)
const getDeckCovers = (deckList: any[], defaultHeroKey: string): { url: string; skinId: number; isBack: boolean }[] => {
    const covers: { url: string; skinId: number; isBack: boolean }[] = [];
    const champ = deckList.find((c: any) => c.isChampion) || deckList.find((c: any) => c.key === defaultHeroKey);
    if (champ) covers.push({ url: CARD_DB[champ.key]?.imageUrl || '', skinId: 0, isBack: false });

    const sorted = deckList.filter((c: any) => !c.isChampion && c.key !== champ?.key).sort((a: any, b: any) => b.cost - a.cost);
    let i = 0;
    while(covers.length < 3 && i < sorted.length) {
        const url = CARD_DB[sorted[i].key]?.imageUrl;
        if (url) covers.push({ url, skinId: 0, isBack: false });
        i++;
    }
    while(covers.length < 3) covers.push({ url: 'CARD_BACK', skinId: 0, isBack: true });
    return covers;
};

// [新增] 极简对抗型 2.5D 卡组模型 (为预览室特供)
const PreviewDiorama = ({ covers, cardBackImg, boardImg, isEnemy }: any) => {
    return (
        <div className="relative w-64 h-64 transition-all duration-500 scale-100 opacity-100 z-40 filter drop-shadow-[0_15px_35px_rgba(0,0,0,0.7)]">
            {/* 棋盘底垫 */}
            <div className="w-[220px] h-[120px] absolute top-8 left-1/2 -translate-x-1/2 rounded-xl overflow-hidden border border-slate-700/80 shadow-2xl z-0">
                <img src={boardImg} className={`w-full h-full object-cover opacity-60 ${isEnemy ? 'grayscale-[60%] hue-rotate-180' : ''}`} alt="棋盘" />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/20 to-transparent"></div>
            </div>

            {/* 核心三卡扇形展开 */}
            <div className="absolute top-10 left-6 z-20 pointer-events-none">
                {covers.map((cover: { url: string; skinId: number; isBack: boolean }, i: number) => {
                    const rotations = [-16, 0, 16], translatesX = [0, 24, 48], translatesY = [12, 0, 12], zIndexes = [25, 23, 21];
                    const isBack = cover.isBack;
                    const renderUrl = isBack ? cardBackImg : cover.url;
                    const skinId = cover.skinId;

                    return (
                        <div key={i} className={`w-24 h-36 absolute rounded-xl border-2 shadow-[5px_5px_15px_rgba(0,0,0,0.6)] overflow-hidden transition-all duration-500 ${isBack ? 'border-slate-800/80 bg-slate-900' : `bg-slate-950 ${isEnemy ? 'border-red-900' : 'border-blue-900'}`}`}
                            style={{ transform: `translateX(${translatesX[i]}px) translateY(${translatesY[i]}px) rotate(${rotations[i]}deg)`, zIndex: zIndexes[i] }}>

                            {!isBack && (
                                <div className={`absolute inset-0 bg-gradient-to-b pointer-events-none z-0 ${
                                    skinId > 0
                                        ? 'from-yellow-600/40 via-yellow-500/20 to-yellow-300/5'
                                        : 'from-gray-300/40 via-gray-200/20 to-white/5'
                                }`}></div>
                            )}

                            <img src={renderUrl} className={`w-full h-full object-cover relative z-10 ${isBack ? 'opacity-90 mix-blend-luminosity' : ''}`} alt="" />
                            {isBack && <div className="absolute inset-0 bg-black/40 mix-blend-multiply z-20"></div>}
                        </div>
                    )
                })}
            </div>

            {/* 右下角写实卡背堆叠 */}
            <div className="absolute bottom-6 right-2 w-24 h-36 z-30 pointer-events-none" style={{ transform: 'rotate(10deg) translate(20px, 12px)' }}>
                {[2, 1, 0].map(i => (
                    <div key={i} className="absolute inset-0 bg-slate-950 rounded-xl border border-slate-900 shadow-md" style={{ transform: `translate(-${i * 3}px, -${i * 3}px)`, zIndex: i === 0 ? 10 : 5 - i }}></div>
                ))}
                <div className={`absolute inset-0 rounded-xl border-2 ${isEnemy ? 'border-red-900/50' : 'border-slate-600'} shadow-2xl overflow-hidden z-10`}>
                    <img src={cardBackImg} className="w-full h-full object-cover" alt="卡背" />
                    {isEnemy && <div className="absolute inset-0 bg-red-900/20 mix-blend-overlay"></div>}
                </div>
            </div>
        </div>
    );
};

/** 统计卡组中每种卡牌的数量 */
const countCards = (deck: string[]): { key: string; name: string; cost: number; count: number; imageUrl: string; isChampion: boolean }[] => {
    const map = new Map<string, { key: string; name: string; cost: number; count: number; imageUrl: string; isChampion: boolean }>();

    deck.forEach(key => {
        const card = CARD_DB[key];
        if (!card) return;
        const existing = map.get(key);
        if (existing) {
            existing.count++;
        } else {
            map.set(key, {
                key,
                name: card.name,
                cost: card.cost,
                count: 1,
                imageUrl: card.imageUrl,
                isChampion: card.isChampion,
            });
        }
    });

    // 按费用排序
    return Array.from(map.values()).sort((a, b) => a.cost - b.cost);
};

export const DeckPreviewModal: React.FC<DeckPreviewModalProps> = ({
    stageId,
    deskIndex,
    cardBackIndex,
    playerCustomDeck,
    onClose,
    onStart // [新增]
}) => {
    const stage = TUTORIAL_STAGES[stageId];
    const currentCardBackUrl = getCardBackUrl(cardBackIndex);
    // [核心修复] 将错误的 UI_IMAGES 替换为正确的 PERSONALIZATION_ASSETS，解决 undefined[0] 的白屏崩溃！
    const deskImage = PERSONALIZATION_ASSETS.desks[deskIndex] || PERSONALIZATION_ASSETS.desks[0];

    // [新增] 统一悬停预览
    const { gazeTarget, bindGazeEvents, keepAlive, scheduleDismiss } = useCardGaze({ delay: 300 });

    // 玩家卡组
    const playerDeckList = useMemo(() => {
        const deck = stage?.playerDeck ?? playerCustomDeck ?? [];
        return countCards(deck);
    }, [stage, playerCustomDeck]);

    // 敌方卡组 — 优先使用关卡直接指定的 enemyDeck
    const enemyDeckList = useMemo(() => {
        if (!stage) return [];

        // ★ 教程模式：直接使用 enemyDeck
        if (stage.enemyDeck && stage.enemyDeck.length > 0) {
            return countCards(stage.enemyDeck);
        }

        // 兼容旧版：从 archetype 读取
        const archetype = stage.enemyArchetypeId ? ENEMY_ARCHETYPES[stage.enemyArchetypeId] : null;
        if (!archetype) return [];
        const fullDeck = [...archetype.coreCards, ...archetype.preferredPool];
        return countCards(fullDeck);
    }, [stage]);

    // [核心修复] 彻底解决 undefined[0] 白屏崩溃的 Bug
    // 加入了 ?.[0] 阻断了对空引用的属性访问，并在前面用 () 包含逻辑防止穿透！
    const playerHeroKey = stage?.playerHeroConfig?.heroKey || stage?.playerDeck?.[0] || playerCustomDeck?.[0] || 'lyfe';
    const enemyArchetype = stage?.enemyArchetypeId ? ENEMY_ARCHETYPES[stage.enemyArchetypeId] : null;
    // ★ 优先使用关卡指定的敌方视觉配置（取不到时回退到流派默认）
    const enemyDisplayName = stage?.enemyVisual?.displayName || enemyArchetype?.name || 'HOSTILE';
    const enemyHeroKey = stage?.enemyVisual?.cardKey || enemyArchetype?.champion || 'fenny';

    if (!stage) return null;
    return (
        <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[500] bg-black/85 backdrop-blur-xl flex items-center justify-between px-16 select-none font-sans"
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
            {/* 顶部退出大叉号 */}
            <button
                onClick={() => { eventBus.emit(GameEvents.UI_CLICK); onClose(); }}
                className="absolute top-8 right-8 text-gray-400 hover:text-white bg-white/5 border border-white/10 p-3 rounded-full transition-all hover:bg-red-500/80 z-[600]"
            >
                <X size={24} />
            </button>

            {/* ===== 左侧翼：我方牌组 (蓝色系) ===== */}
            <motion.div initial={{ x: -60, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 0.1 }}
                className="w-80 h-[85vh] bg-slate-900/90 border border-blue-500/30 rounded-3xl flex flex-col shadow-[0_30px_60px_rgba(0,0,0,0.8)] relative overflow-hidden"
            >
                <div className="p-5 bg-blue-950/40 font-black text-blue-400 tracking-[0.3em] text-center border-b border-blue-500/20 shrink-0 flex items-center justify-center gap-2">
                    <Shield size={18} /> MY SQUAD
                </div>
                <div className="flex-1 relative overflow-hidden bg-slate-950">
                    <div className="absolute top-0 left-0 w-full h-8 bg-gradient-to-b from-slate-950 via-slate-950/80 to-transparent z-10 pointer-events-none"></div>
                    <div className="h-full overflow-y-auto px-4 py-8 space-y-2 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                        {playerDeckList.length === 0 ? (
                            <div className="text-gray-600 text-sm text-center py-8 font-mono tracking-widest">NO CARDS</div>
                        ) : (
                            playerDeckList.map(({ key, name, cost, count, imageUrl, isChampion }) => (
                                <div key={key}
                                    className="relative flex items-center h-12 bg-gray-800/90 rounded-lg border border-gray-700/60 hover:border-blue-500 overflow-hidden cursor-help group transition-colors"
                                    {...(CARD_DB[key] ? bindGazeEvents(CARD_DB[key]) : {})}
                                >
                                    <div className="absolute inset-0 opacity-40 bg-cover bg-center" style={{ backgroundImage: `url(${imageUrl})` }}></div>
                                    <div className="absolute inset-0 bg-gradient-to-r from-blue-950/90 via-black/60 to-transparent"></div>
                                    <div className="absolute inset-0 flex items-center justify-between px-3 z-10">
                                        <div className="flex gap-3 items-center">
                                            <span className="w-6 h-6 rounded-full flex justify-center items-center text-xs font-bold border bg-blue-900 border-blue-500 text-blue-200">{cost}</span>
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm font-bold truncate w-32 drop-shadow-md text-white">{name}</span>
                                                {isChampion && <span className="text-[10px] text-yellow-500 font-black">HERO</span>}
                                            </div>
                                        </div>
                                        <span className="text-yellow-400 font-black text-sm drop-shadow-md">x{count}</span>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                    <div className="absolute bottom-0 left-0 w-full h-10 bg-gradient-to-t from-slate-950 via-slate-950/80 to-transparent z-10 pointer-events-none"></div>
                </div>
            </motion.div>

            {/* ===== 中心对抗舞台 ===== */}
            <div className="flex-1 flex flex-col items-center justify-center gap-16 relative z-10">
                <div className="flex items-center justify-center w-full max-w-4xl relative">
                    {/* 左侧我方微缩景观 */}
                    <motion.div initial={{ x: -40, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 0.2 }}>
                        <PreviewDiorama
                            covers={getDeckCovers(playerDeckList, playerHeroKey)}
                            cardBackImg={currentCardBackUrl}
                            boardImg={deskImage}
                        />
                    </motion.div>

                    {/* 中心 VS 标志 */}
                    <motion.div initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.4, type: 'spring' }} className="mx-8 relative z-50">
                        <div className="text-6xl font-black italic text-transparent bg-clip-text bg-gradient-to-b from-white to-gray-600 tracking-tighter drop-shadow-[0_0_20px_rgba(255,255,255,0.4)] pr-2">VS</div>
                        <Sword className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-32 text-white/10 rotate-45 -z-10" />
                    </motion.div>

                    {/* 右侧敌方微缩景观 */}
                    <motion.div initial={{ x: 40, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 0.3 }}>
                        <PreviewDiorama
                            covers={getDeckCovers(enemyDeckList, enemyHeroKey)}
                            cardBackImg={PERSONALIZATION_ASSETS.cardBacks[1]} // 敌方固定使用反派卡背
                            boardImg={deskImage}
                            isEnemy={true}
                        />
                    </motion.div>
                </div>

                {/* 下方发车按钮 */}
                {onStart && (
                    <motion.button
                        initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.5 }}
                        onClick={() => { eventBus.emit(GameEvents.UI_CLICK); onStart(); }}
                        className="w-80 py-5 rounded-2xl font-black text-2xl tracking-[0.2em] flex items-center justify-center gap-3 transition-all bg-gradient-to-r from-cyan-600 to-blue-600 text-white hover:scale-110 shadow-[0_10px_40px_rgba(59,130,246,0.6)] border border-cyan-300/20"
                    >
                        <Play fill="currentColor" size={24} /> START EXAM
                    </motion.button>
                )}
            </div>

            {/* ===== 右侧翼：敌方牌组 (红色系) ===== */}
            <motion.div initial={{ x: 60, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 0.1 }}
                className="w-80 h-[85vh] bg-slate-900/90 border border-red-500/30 rounded-3xl flex flex-col shadow-[0_30px_60px_rgba(0,0,0,0.8)] relative overflow-hidden"
            >
                <div className="p-5 bg-red-950/40 font-black text-red-400 tracking-[0.3em] text-center border-b border-red-500/20 shrink-0 flex items-center justify-center gap-2">
                    <Sword size={18} /> HOSTILE
                </div>
                <div className="flex-1 relative overflow-hidden bg-slate-950">
                    <div className="absolute top-0 left-0 w-full h-8 bg-gradient-to-b from-slate-950 via-slate-950/80 to-transparent z-10 pointer-events-none"></div>
                    <div className="h-full overflow-y-auto px-4 py-8 space-y-2 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                        {enemyDeckList.length === 0 ? (
                            <div className="text-gray-600 text-sm text-center py-8 font-mono tracking-widest">NO CARDS</div>
                        ) : (
                            enemyDeckList.map(({ key, name, cost, count, imageUrl, isChampion }) => (
                                <div key={key}
                                    className="relative flex items-center h-12 bg-gray-800/90 rounded-lg border border-gray-700/60 hover:border-red-500 overflow-hidden cursor-help group transition-colors"
                                    {...(CARD_DB[key] ? bindGazeEvents(CARD_DB[key]) : {})}
                                >
                                    <div className="absolute inset-0 opacity-40 bg-cover bg-center" style={{ backgroundImage: `url(${imageUrl})` }}></div>
                                    <div className="absolute inset-0 bg-gradient-to-r from-red-950/90 via-black/60 to-transparent"></div>
                                    <div className="absolute inset-0 flex items-center justify-between px-3 z-10">
                                        <div className="flex gap-3 items-center">
                                            <span className="w-6 h-6 rounded-full flex justify-center items-center text-xs font-bold border bg-red-900 border-red-500 text-red-200">{cost}</span>
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm font-bold truncate w-32 drop-shadow-md text-white">{name}</span>
                                                {isChampion && <span className="text-[10px] text-yellow-500 font-black">HERO</span>}
                                            </div>
                                        </div>
                                        <span className="text-yellow-400 font-black text-sm drop-shadow-md">x{count}</span>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                    <div className="absolute bottom-0 left-0 w-full h-10 bg-gradient-to-t from-slate-950 via-slate-950/80 to-transparent z-10 pointer-events-none"></div>
                </div>
            </motion.div>

            {/* ===== 统一智能悬停预览 ===== */}
            <FloatingCardPreview
                gazeTarget={gazeTarget}
                mode="follow"
                scale={1.5}
                onViewArt={() => {}}
            />
        </motion.div>
    );
};
