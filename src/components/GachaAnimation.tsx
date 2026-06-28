import React, { useState, useEffect, useRef } from 'react'; // [新增] useRef
import { motion, AnimatePresence } from 'framer-motion';
import { SkipForward, CornerUpLeft, Sparkles } from 'lucide-react';
import type { GachaResult } from '../logic/gachaLogic';
import { CARD_DB } from '../data/cards';
import { Card } from './Card';
import { PERSONALIZATION_ASSETS, CURRENCY_ICONS } from '../data/imageData';
import { eventBus, GameEvents } from '../utils/eventBus'; // [新增]

// --- 子组件：单张抽卡结果卡牌 ---
interface GachaItemProps {
    result: GachaResult;
    index: number;
    isFlipped: boolean;
    onFlip: () => void;
    delay: number;
    skipped: boolean;
}

const GachaItem: React.FC<GachaItemProps> = ({ result, index, isFlipped, onFlip, delay, skipped }) => {
    const defaultBack = PERSONALIZATION_ASSETS.cardBacks[0];

    // 控制内容显示的状态
    const [showFront, setShowFront] = useState(false);
    // 控制转化动画显示的状态
    const [showConversion, setShowConversion] = useState(false);
    const hasPlayedSound = useRef(false);

    // 1. 翻牌逻辑：动画过半时切换内容
    useEffect(() => {
        if (isFlipped && !showFront) {
            // 如果是跳过模式，瞬间切换；否则延时
            const time = skipped ? 0 : 200;
            const timer = setTimeout(() => {
                setShowFront(true);

                // [优化] 音效控制：
                // 如果是跳过模式，不在这里播放翻牌音效（由父组件统一播放）
                // 除非是稀有卡，为了强调，可以保留
                if (!skipped && !hasPlayedSound.current) {
                    if (result.isRare) {
                        eventBus.emit(GameEvents.GACHA_REVEAL_RARE);
                    } else {
                        eventBus.emit(GameEvents.GACHA_REVEAL_COMMON);
                    }
                    hasPlayedSound.current = true;
                }
            }, time);
            return () => clearTimeout(timer);
        }
    }, [isFlipped, showFront, result.isRare, skipped]);



    // 2. 转化逻辑：翻开后延迟 1s 显示转化层
    useEffect(() => {
        if (showFront && result.convertedCurrency) {
            const time = skipped ? 500 : 1000; // 跳过时稍快一点显示转化
            const timer = setTimeout(() => {
                setShowConversion(true);
                if (!skipped) {
                    eventBus.emit(GameEvents.GACHA_CONVERT);
                }
            }, time);
            return () => clearTimeout(timer);
        }
    }, [showFront, result.convertedCurrency, skipped]);
    // 渲染正面内容
    const renderFrontContent = () => {
        if (result.type === 'card') {
            const cardData = CARD_DB[result.key];
            if (!cardData) return null;

            const displayCard = {
                ...cardData,
                id: `gacha-preview-${index}`,
                strikeCount: 0,
                animState: 'idle' as const,
                damageTaken: 0,
                buffs: { power: 0, health: 0 }
            };
            return (
                <div className="w-full h-full"> {/* 容器适配 */}
                    <Card
                        data={displayCard}
                        // [修正] 改为 'gacha' 模式，这样它就会使用 w-full h-full 填满这个 div
                        // 而不是使用 preview 模式的 w-72 (288px) 导致溢出
                        location="gacha"
                        isFaceUp={true}
                    />
                </div>
            );
        } else if (result.type === 'skin') {
            // [核心新增] 皮肤演出：直接展示高清晰度大图，不套卡牌边框，并加上专属徽记
            return (
                <div className="w-full h-full rounded-xl overflow-hidden border-2 border-purple-500/50 bg-slate-900 relative shadow-2xl flex flex-col">
                    <div className="flex-1 relative overflow-hidden">
                        <img
                            src={result.displayImage}
                            className="w-full h-full object-cover scale-110" // 稍微放大，更具冲击力
                            alt={result.name}
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-purple-900/90 via-transparent to-transparent opacity-80"></div>
                    </div>
                    <div className="absolute bottom-0 w-full h-16 bg-gradient-to-r from-purple-900 to-black flex flex-col items-center justify-center border-t border-purple-500/30 p-2">
                        <div className="text-purple-300 text-xs font-bold tracking-widest uppercase mb-1">
                            限定皮肤
                        </div>
                        <div className="text-white text-sm font-black truncate w-full text-center">
                            {result.name}
                        </div>
                    </div>
                    <div className="absolute top-2 right-2 bg-purple-500 text-white p-1.5 rounded-full shadow-[0_0_15px_rgba(168,85,247,0.8)] z-10 animate-pulse">
                        <Sparkles size={16} fill="currentColor" />
                    </div>
                </div>
            );
        } else {
            // 饰品
            const isCardBack = result.type === 'cardBack';
            return (
                <div className="w-full h-full rounded-xl overflow-hidden border-2 border-yellow-500/50 bg-slate-900 relative shadow-2xl flex flex-col">
                    <div className="flex-1 relative overflow-hidden">
                        <img
                            src={result.displayImage}
                            className="w-full h-full object-cover"
                            alt={result.name}
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-yellow-900/80 to-transparent opacity-60"></div>
                    </div>
                    <div className="h-16 bg-gradient-to-r from-yellow-900 to-black flex flex-col items-center justify-center border-t border-yellow-500/30 p-2">
                        <div className="text-yellow-400 text-xs font-bold tracking-widest uppercase mb-1">
                            {isCardBack ? '卡背' : '牌桌'}
                        </div>
                        <div className="text-white text-sm font-black truncate w-full text-center">
                            {result.name}
                        </div>
                    </div>
                    <div className="absolute top-2 right-2 bg-yellow-500 text-black p-1 rounded-full shadow-lg z-10">
                        <Sparkles size={16} fill="currentColor" />
                    </div>
                </div>
            );
        }
    };

    return (
        <div className="relative w-[200px] h-[300px]">
            {/* 稀有光效底座：根据类型决定金光还是紫光 */}
            {result.isRare && showFront && (
                <motion.div
                    initial={{ opacity: 0, scale: 0.5 }}
                    animate={{ opacity: 1, scale: 1.2, rotate: 180 }}
                    transition={{ duration: 0.8, ease: "easeOut" }}
                    className={`absolute inset-0 -z-10 blur-3xl opacity-50 rounded-full ${
                        result.type === 'skin'
                            ? 'bg-gradient-to-r from-purple-400 via-fuchsia-600 to-purple-400'
                            : 'bg-gradient-to-r from-yellow-300 via-orange-500 to-yellow-300'
                    }`}
                />
            )}

            <motion.div
                className="w-full h-full relative cursor-pointer"
                initial={{ y: -1000, opacity: 0 }}
                animate={
                    isFlipped
                    ? {
                        y: 0,
                        opacity: 1,
                        scale: 1,
                        scaleX: [1, 0, 1] // [核心] 纸片翻转
                      }
                    : {
                        y: 0,
                        opacity: 1,
                        scaleX: 1,
                        scale: [1, 1.05, 1] // 呼吸
                      }
                }
                transition={{
                    y: { type: "spring", stiffness: 100, damping: 20, delay: delay * 0.1 },
                    scale: { duration: 1.5, repeat: Infinity, ease: "easeInOut" },
                    scaleX: { duration: 0.4, times: [0, 0.5, 1], ease: "linear" } // 0.4秒翻完，0.2秒时为0
                }}
                onClick={() => !isFlipped && onFlip()}
            >
                {/* 内容切换 */}
                {showFront ? (
                    <div className="w-full h-full rounded-xl overflow-hidden shadow-2xl bg-black relative">
                        {renderFrontContent()}

                        {/* [新增] 转化动画层 */}
                        <AnimatePresence>
                            {showConversion && result.convertedCurrency && (
                                <motion.div
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    className="absolute inset-0 z-30 bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center gap-2"
                                >
                                    {/* 货币图标 */}
                                    <motion.img
                                        initial={{ scale: 0, rotate: -180 }}
                                        animate={{ scale: 1.5, rotate: 0 }}
                                        transition={{ type: "spring", stiffness: 200, damping: 15 }}
                                        src={result.convertedCurrency.type === 'silverCoin' ? CURRENCY_ICONS.silverCoin : CURRENCY_ICONS.bitGold}
                                        className="w-16 h-16 drop-shadow-[0_0_15px_rgba(255,255,255,0.5)]"
                                        alt="货币"
                                    />

                                    {/* 数量文本 */}
                                    <motion.div
                                        initial={{ y: 20, opacity: 0 }}
                                        animate={{ y: 0, opacity: 1 }}
                                        transition={{ delay: 0.2 }}
                                        className="text-white font-black text-2xl font-mono tracking-widest mt-2"
                                    >
                                        +{result.convertedCurrency.amount}
                                    </motion.div>

                                    <motion.div
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        transition={{ delay: 0.4 }}
                                        className="text-white/60 text-[10px] uppercase font-bold tracking-widest border border-white/20 px-2 py-1 rounded text-center whitespace-pre-line"
                                    >
                                        {result.type === 'card'
                                            ? (result.isRare ? '重复英雄转化为比特金' : '重复卡牌转化为通用银')
                                            : (result.type === 'skin' ? '拥有该皮肤补偿比特金' : '重复饰品转化为比特金')}
                                    </motion.div>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        {/* NEW 标记 (如果是新的) */}
                        {result.isNew && !showConversion && (
                            <div className="absolute top-2 left-[-30px] w-[100px] bg-red-600 text-white text-xs font-black text-center py-1 -rotate-45 shadow-lg z-20">
                                NEW
                            </div>
                        )}
                    </div>
                ) : (
                    // 卡背
                    <div className="w-full h-full rounded-xl overflow-hidden border-2 border-blue-400/30 shadow-[0_0_20px_rgba(59,130,246,0.3)] bg-slate-900 relative">
                        <img src={defaultBack} className="w-full h-full object-cover" alt="卡背" />
                        <div className="absolute inset-0 border-4 border-blue-400/0 rounded-xl animate-pulse-border box-border"></div>
                    </div>
                )}
            </motion.div>
        </div>
    );
};

// --- 主组件保持不变，略 ---
interface GachaAnimationProps {
    results: GachaResult[];
    onClose: () => void;
}

export const GachaAnimation: React.FC<GachaAnimationProps> = ({ results, onClose }) => {
    const [flippedIndices, setFlippedIndices] = useState<Set<number>>(new Set());
    const [phase, setPhase] = useState<'intro' | 'wait' | 'reveal' | 'finish'>('intro');
    const [flashKey, setFlashKey] = useState(0);
    const [skipped, setSkipped] = useState(false);

    const isAllFlipped = flippedIndices.size === results.length;
    const isSingle = results.length === 1;

    useEffect(() => {
        const timer = setTimeout(() => {
            setPhase('wait');
        }, 1500);
        return () => clearTimeout(timer);
    }, []);

    useEffect(() => {
        if (isAllFlipped) {
            setPhase('finish');
        }
    }, [isAllFlipped]);

    const handleFlip = (index: number) => {
        setFlippedIndices(prev => {
            const next = new Set(prev);
            next.add(index);
            return next;
        });

        if (results[index].isRare) {
            setFlashKey(p => p + 1);
        }
    };

    const handleSkip = () => {
        setSkipped(true); // 标记为跳过模式

        // 检查是否有还没翻开的稀有卡
        const hasUnrevealedRare = results.some((r, i) => r.isRare && !flippedIndices.has(i));

        // 检查是否有任何转换发生
        const hasConversion = results.some(r => !!r.convertedCurrency);

        if (hasUnrevealedRare) {
            setFlashKey(p => p + 1); // 触发视觉闪光
            eventBus.emit(GameEvents.GACHA_REVEAL_RARE); // 触发听觉出金
        } else {
            // 如果全是普通卡，播放一次普通翻牌音效
            eventBus.emit(GameEvents.GACHA_REVEAL_COMMON);
        }

        // [核心优化] 如果有转换，且被跳过了，这里手动触发一次转换音效
        if (hasConversion) {
            // 稍微延迟一点，等牌翻过来
            setTimeout(() => {
                eventBus.emit(GameEvents.GACHA_CONVERT);
            }, 600);
        }

        const all = new Set<number>();
        results.forEach((_, idx) => all.add(idx));
        setFlippedIndices(all);
        setPhase('finish');
    };

    return (
        <div className="fixed inset-0 z-[800] bg-black flex flex-col items-center justify-center overflow-hidden">

            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_#1e293b_0%,_#000000_100%)] opacity-80"></div>

            <AnimatePresence>
                {phase === 'wait' && !isAllFlipped && (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className="absolute bottom-[10%] z-10 text-center pointer-events-none"
                    >
                        <h3 className="text-2xl font-black text-blue-200 tracking-[0.5em] animate-pulse">
                            点击翻转
                        </h3>
                        <p className="text-blue-500/50 text-xs mt-2 font-mono">
                            DETECTING SIGNAL...
                        </p>
                    </motion.div>
                )}
            </AnimatePresence>

            <div className={`relative z-20 ${isSingle ? 'scale-150' : ''}`}>
                <div className={`
                    grid gap-6
                    ${isSingle ? 'grid-cols-1' : 'grid-cols-5'}
                `}>
                    {results.map((result, idx) => (
                        <GachaItem
                            key={idx}
                            index={idx}
                            result={result}
                            isFlipped={flippedIndices.has(idx)}
                            onFlip={() => handleFlip(idx)}
                            delay={idx}
                            skipped={skipped}
                        />
                    ))}
                </div>
            </div>

            <div className="absolute top-8 right-8 z-50 flex flex-col gap-4">
                {!isAllFlipped && (
                    <motion.button
                        initial={{ opacity: 0, x: 50 }}
                        animate={{ opacity: 1, x: 0 }}
                        onClick={() => {
                            eventBus.emit(GameEvents.UI_CLICK); // [新增]
                            handleSkip();
                        }}
                        className="flex items-center gap-2 px-6 py-3 bg-white/10 hover:bg-white/20 backdrop-blur-md rounded-full text-white font-bold transition-all border border-white/10 group"
                    >
                        <SkipForward size={18} className="group-hover:translate-x-1 transition-transform" />
                        跳过动画
                    </motion.button>
                )}

                {isAllFlipped && (
                    <motion.button
                        initial={{ opacity: 0, scale: 0.5 }}
                        animate={{ opacity: 1, scale: 1 }}
                        whileHover={{ scale: 1.05 }}
                        onClick={() => {
                            eventBus.emit(GameEvents.UI_BACK); // [新增]
                            onClose();
                        }}
                        className="flex items-center gap-2 px-8 py-4 bg-yellow-500 hover:bg-yellow-400 text-black font-black rounded-full shadow-[0_0_30px_rgba(234,179,8,0.5)] transition-all"
                    >
                        <CornerUpLeft size={20} strokeWidth={3} />
                        返回
                    </motion.button>
                )}
            </div>

            {flashKey > 0 && (
                <motion.div
                    key={flashKey}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: [0, 0.8, 0] }}
                    transition={{ duration: 0.5, times: [0, 0.1, 1], ease: "easeOut" }}
                    className="fixed inset-0 bg-white z-[900] pointer-events-none mix-blend-overlay"
                />
            )}
        </div>
    );
};