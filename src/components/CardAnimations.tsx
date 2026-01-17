import React, { useState, useEffect} from 'react';
import { motion, AnimatePresence, type Variants } from 'framer-motion'; // [加回] AnimatePresence
import { Check, RefreshCw } from 'lucide-react'; // [加回] 图标
import type { CardData } from '../types';
import { Card } from './Card';
import { canAffordCard } from '../utils/gameRules';
import { useDrawingQueue } from '../hooks/useDrawingQueue';

// --- 组件 1: 正常游戏时的手牌区域 (从 GameSession 迁移并封装) ---
interface PlayerHandProps {
    hand: CardData[];
    onCardClick: (card: CardData) => void;
    onHover: (card: CardData | null) => void;
    onViewArt: (card: CardData) => void;
    game: any; // 传入 game state 以判断出牌条件
    cardBackUrl: string;
}

export const PlayerHand: React.FC<PlayerHandProps> = ({
    hand, onCardClick, onHover, onViewArt, game, cardBackUrl
}) => {
    const validHand = hand.filter(c => c && c.key && c.type);
    const { isNewCard } = useDrawingQueue(validHand);
    let newCardCounter = 0;
    const newCardDelays = hand.map(c => {
        if (isNewCard(c.id)) {
            return newCardCounter++;
        }
        return 0;
    });

    return (
        <div
            className="absolute left-0 bottom-0 w-full h-48 z-40 pointer-events-none flex justify-center items-end pb-2 overflow-visible">
               <div className="flex -space-x-2 px-4 pointer-events-auto">
                {hand.map((c, index) => {
                    const isNew = isNewCard(c.id);
                    const rotation = (index - (hand.length - 1) / 2) * 4;

                    // 获取当前卡的动画延迟 (每张卡间隔 1.5秒，实现"连着播放")
                    // 如果间隔设为 2.0s 则完全不重叠；1.5s 则稍微重叠，节奏更紧凑
                    const myDelay = isNew ? newCardDelays[index] * 1.5 : 0;

                    // --- 模式 A: 抽卡入场动画 ---
                    if (isNew) {
                        return (
                            <motion.div
                                key={c.id}
                                className="pointer-events-auto relative cursor-pointer origin-bottom"
                                style={{ margin: '0 -12px', zIndex: 100 + index }} // 确保后出的卡在上面

                                // 初始透明度设为 0，防止在延迟期间看到卡牌堆在牌库
                                initial={{ x: '-40vw', y: '-10vh', scale: 1, rotate: 11, opacity: 1 }}

                                animate={{
                                    x: ['-40vw', '-10.5vw', '-10.5vw', '0vw'],
                                    y: ['-20vh', '-27.5vh', '-27.5vh', '85%'],
                                    scale: [1.25, 2.5, 2.5, 1],
                                    rotate: [11, 0, 0, rotation],
                                    opacity: 1 // 动画开始后变不透明
                                }}
                                transition={{
                                    duration: 2.0,
                                    delay: myDelay, // [关键] 设置动画启动延迟
                                    times: [0, 0.4, 0.65, 1],
                                    ease: "easeInOut"
                                }}
                            >
                                <Card
                                    data={c}
                                    location="hand"
                                    isPlayable={false}
                                    cardBackUrl={cardBackUrl}
                                    isNew={true}
                                    // [关键] 将延迟传递给 Card 组件，同步翻面时间
                                    // 注意：您需要在 Card.tsx 的 interface 中添加 delay?: number
                                    // 并修改 Card 内部 setTimeout 时间为: (delay * 1000) + 900
                                    // 这里我们暂时通过 props 传过去，假设您已经修改了 Card.tsx
                                    // 如果 CardProps 还没改，TypeScript 会报错，请务必先改 Card.tsx
                                    // @ts-ignore (如果还没改类型定义暂时忽略)
                                    delay={myDelay}
                                />
                            </motion.div>
                        );
                    }

                    // --- 模式 B: 常态交互 (原生 CSS 接管) ---
                    // 完全复刻您提供的原版代码，保证完美的检视手感
                    return (
                        <div
                            key={c.id}
                            onMouseEnter={() => onHover(c)}
                            onMouseLeave={() => onHover(null)}
                            className="
                                pointer-events-auto relative cursor-pointer origin-bottom
                                transition-all duration-300 cubic-bezier(0.2, 0.8, 0.2, 1)
                                transform translate-y-[85%]
                                hover:translate-y-0 hover:scale-[2.2] hover:z-[100] hover:rotate-0
                            "
                            style={{ rotate: `${rotation}deg`, margin: '0 -12px' }}
                        >
                            <Card
                                data={c}
                                location="hand"
                                onClick={() => onCardClick(c)}
                                onViewArt={onViewArt}
                                isPlayable={game.phase === 'main' && game.turnOwner === 'player' && canAffordCard(c, game.playerMana, game.playerSpellMana)}
                                cardBackUrl={cardBackUrl}
                                isNew={false}
                            />
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

// --- 组件 2: 开局换牌阶段 (Opening Mulligan) ---
interface OpeningMulliganProps {
    hand: CardData[];
    cardBackUrl: string;
    // [修改] 状态由父组件(Hook)控制
    selectedIndices: Set<number>;
    isConfirmed: boolean;
    onToggleIndex: (index: number) => void;
    // [新增] 当动画播放到"该真正换数据了"的时候通知父组件
    onAnimationStep: (step: 'ready_to_replace' | 'finished') => void;
}

export const OpeningMulligan: React.FC<OpeningMulliganProps> = ({
    hand,
    cardBackUrl,
    selectedIndices,
    isConfirmed,
    onToggleIndex,   // <--- 这里必须接收 onToggleIndex
    onAnimationStep  // <--- 这里必须接收 onAnimationStep
}) => {
    // --- 1. 内部状态管理 (从 GameSession 移入) ---
    const [animPhase, setAnimPhase] = useState<'enter' | 'select' | 'discard' | 'draw' | 'exit'>('enter');
    const [displayHand, setDisplayHand] = useState<CardData[]>([]);
    const [cardFaces, setCardFaces] = useState<boolean[]>([false, false, false, false, false]);

    const prevHandRef = React.useRef(hand);
    const DURATION = 0.8;
    const FLIP_DELAY = 400;


    // --- 4. 辅助函数 ---
    const flipCards = (indices: number[], toFaceUp: boolean, delay: number) => {
        setTimeout(() => {
            setCardFaces(prev => {
                const next = [...prev];
                indices.forEach(i => next[i] = toFaceUp);
                return next;
            });
        }, delay);
    };

    const getDeckTrajectory = (index: number) => {
        const DECK_X = -42;
        const DECK_Y = 45;
        const CARD_SPACING = 9;
        const centerIndex = 2;
        const currentOffsetX = (index - centerIndex) * CARD_SPACING;
        return {
            x: `${DECK_X - currentOffsetX}vw`,
            y: `${DECK_Y}vh`
        };
    };


    // --- 5. 动画序列 (Effect Hooks) ---

    // Init: 入场
    useEffect(() => {
        if (hand.length > 0 && displayHand.length === 0) {
            setDisplayHand(hand);
            prevHandRef.current = hand;
            flipCards([0, 1, 2, 3, 4], true, FLIP_DELAY);
            const timer = setTimeout(() => setAnimPhase('select'), 1200);
            return () => clearTimeout(timer);
        }
    }, [hand]);

    // Confirm -> Discard
    useEffect(() => {
    // 当父组件通知 isConfirmed 为 true 时，且当前处于选择阶段
    if (isConfirmed && animPhase === 'select') {
        const runDiscard = async () => {
            if (selectedIndices.size > 0) {
                setAnimPhase('discard');
                // 翻背面
                const indices = Array.from(selectedIndices);
                setTimeout(() => {
                    setCardFaces(prev => {
                        const next = [...prev];
                        indices.forEach(i => next[i] = false);
                        return next;
                    });
                }, FLIP_DELAY);

                await new Promise(r => setTimeout(r, DURATION * 1000));
                // [关键] 动画播完了，通知父组件去换数据
                onAnimationStep('ready_to_replace');
            } else {
                setAnimPhase('exit');
            }
        };
        runDiscard();
    }
}, [isConfirmed, animPhase, selectedIndices]);

    // Data Update -> Draw
    useEffect(() => {
        if (animPhase === 'discard' && hand.length > 0 && hand !== prevHandRef.current) {
            setDisplayHand(hand);
            setAnimPhase('draw');
            flipCards(Array.from(selectedIndices), true, FLIP_DELAY);
            prevHandRef.current = hand;
            setTimeout(() => setAnimPhase('exit'), 1000);
        }
    }, [hand, animPhase]);

    // Exit
    useEffect(() => {
        if (animPhase === 'exit') {
            flipCards([0, 1, 2, 3, 4], false, FLIP_DELAY);
            const timer = setTimeout(() => {
                // [关键] 通知父组件彻底结束
                onAnimationStep('finished');
            }, 1200);
            return () => clearTimeout(timer);
        }
    }, [animPhase]);


    // --- 6. 渲染 ---
    return (
        <div className="fixed inset-0 z-[60] pointer-events-none flex flex-col items-center justify-center">
            {/* 提示文字 */}
            {animPhase === 'select' && (
                <motion.div
                    initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}
                    className="absolute top-[15%] left-0 right-[20vw] w-full text-center pointer-events-auto"
                >
                    <h2 className="text-5xl font-black text-white drop-shadow-[0_5px_15px_rgba(0,0,0,0.8)] tracking-widest">选择手牌</h2>
                    <p className="text-blue-200 mt-2 font-mono text-lg tracking-[0.2em] opacity-80">SELECT CARDS TO REPLACE</p>
                </motion.div>
            )}

            {/* 卡牌区域 */}
            <div className="relative flex items-center justify-center pointer-events-auto" style={{ marginTop: '5vh' }}>
                <div className="flex gap-5">
                    {displayHand.map((c, index) => {
                        if (!c) return null;
                        const isSelected = selectedIndices.has(index);
                        const trajectory = getDeckTrajectory(index);
                        const isFaceUp = cardFaces[index];

                        const variants: Variants = {
                            enter: (i: number) => ({
                                x: 0, y: 0, scale: 0.8, rotate: 0, opacity: 1, scaleX: [1, 0, 1],
                                transition: { delay: i * 0.08, duration: DURATION, type: 'spring', damping: 20, scaleX: { duration: DURATION, times: [0, 0.5, 1] } }
                            }),
                            select: {
                                x: 0, y: isSelected ? -40 : 0, scale: isSelected ? 0.9 : 0.8, scaleX: 1,
                                transition: { type: 'spring', stiffness: 300 }
                            },
                            discard: {
                                x: isSelected ? trajectory.x : 0, y: isSelected ? trajectory.y : 0, scale: isSelected ? 0.2 : 0.8, opacity: isSelected ? 0 : 1, scaleX: isSelected ? [1, 0, 1] : 1,
                                transition: { duration: DURATION, ease: "easeInOut", scaleX: { duration: DURATION, times: [0, 0.5, 1] } }
                            },
                            draw: {
                                x: 0, y: 0, scale: 0.8, opacity: 1, scaleX: isSelected ? [1, 0, 1] : 1,
                                transition: { duration: DURATION, ease: "backOut", scaleX: { duration: DURATION, times: [0, 0.5, 1] } }
                            },
                            exit: {
                                x: trajectory.x, y: trajectory.y, scale: 0.2, opacity: 0, scaleX: [1, 0, 1],
                                transition: { duration: DURATION, ease: "easeInOut", delay: index * 0.05, scaleX: { duration: DURATION, times: [0, 0.5, 1], delay: index * 0.05 } }
                            }
                        };

                        const getInitial = () => {
                            if (animPhase === 'draw' && isSelected) return { x: trajectory.x, y: trajectory.y, scale: 0.2, opacity: 0, scaleX: 1 };
                            if (animPhase === 'enter') return { x: trajectory.x, y: trajectory.y, scale: 0.2, rotate: 90, opacity: 0, scaleX: 1 };
                            return false;
                        };

                        return (
                            <div key={`${c.id}-${index}`} className="relative flex flex-col items-center">
                                <motion.div
                                    className="relative cursor-pointer"
                                    onClick={() => { if (animPhase === 'select') onToggleIndex(index); }}
                                    custom={index}
                                    variants={variants}
                                    initial={getInitial()}
                                    animate={animPhase}
                                >
                                    {isSelected && animPhase === 'select' && (
                                        <motion.div layoutId="selection-glow" className="absolute -inset-2 rounded-xl border-4 border-blue-400 shadow-[0_0_20px_#3b82f6] z-0" />
                                    )}
                                    <div className="relative z-10">
                                        <Card data={c} location="preview" cardBackUrl={cardBackUrl} isFaceUp={isFaceUp} />
                                    </div>
                                    <AnimatePresence>
                                        {animPhase === 'select' && (
                                            <motion.button
                                                initial={{ opacity: 0, y: -10 }}
                                                animate={{ opacity: 1, y: 20 }}
                                                exit={{ opacity: 0 }}
                                                // 阻止冒泡，避免触发卡牌点击，直接调用 props 传来的 onToggleIndex
                                                onClick={(e) => { e.stopPropagation(); onToggleIndex(index); }}
                                                className={`absolute bottom-[-60px] left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 px-4 py-2 rounded-full font-bold text-sm shadow-xl transition-colors duration-200 whitespace-nowrap ${isSelected ? 'bg-red-600 text-white ring-2 ring-red-400 hover:bg-red-500' : 'bg-slate-700 text-gray-300 border border-slate-500 hover:bg-slate-600 hover:text-white'}`}
                                            >
                                                {isSelected ? <><RefreshCw size={14} /> 更换</> : <><Check size={14} /> 保留</>}
                                            </motion.button>
                                        )}
                                    </AnimatePresence>
                                </motion.div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};