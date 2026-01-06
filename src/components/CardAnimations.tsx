import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion';
// 引入必要的图标
import { Check, RefreshCw, X, ChevronUp } from 'lucide-react';
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
    const { isNewCard } = useDrawingQueue(hand);

    // [新增] 预先计算每张新卡的"出场顺位"
    // 这样我们可以给它们设置递增的延迟
    let newCardCounter = 0;
    const newCardDelays = hand.map(c => {
        if (isNewCard(c.id)) {
            return newCardCounter++;
        }
        return 0;
    });

    return (
        <div className="absolute left-0 bottom-0 w-full h-48 z-40 pointer-events-none flex justify-center items-end pb-2 overflow-visible">
            <div className="flex -space-x-2 px-4">
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
    initialHand: CardData[];
    onReplaceConfirm: (indicesToReplace: number[]) => Promise<void>;
    onComplete: () => void;
    cardBackUrl: string;
    // 状态受控
    selectedIndices: Set<number>;
    onToggleIndex: (index: number) => void;
    isConfirmed: boolean;
    onReplaceLogic: () => Promise<void>;
}

// --- 组件 2: OpeningMulligan ---
export const OpeningMulligan: React.FC<OpeningMulliganProps> = ({
    initialHand, onReplaceConfirm, onComplete, cardBackUrl,
    selectedIndices, onToggleIndex, isConfirmed, onReplaceLogic
}) => {
    const [phase, setPhase] = useState<'enter' | 'select' | 'discard' | 'draw' | 'exit'>('enter');
    const [displayHand, setDisplayHand] = useState<CardData[]>([]);
    const [cardFaces, setCardFaces] = useState<boolean[]>([false, false, false, false, false]);

    // [新增] 引用 Ref：用于记录“旧手牌”，以便检测数据层何时完成更新
    const prevHandRef = React.useRef(initialHand);

    // [配置] 统一动画时长常量，避免硬编码不一致
    const DURATION = 0.8;
    const FLIP_DELAY = 400; // DURATION * 0.5 * 1000

    // [辅助函数] 翻转指定索引的卡牌
    const flipCards = (indices: number[], toFaceUp: boolean, delay: number) => {
        setTimeout(() => {
            setCardFaces(prev => {
                const next = [...prev];
                indices.forEach(i => next[i] = toFaceUp);
                return next;
            });
        }, delay);
    };

    // [动态计算] 归位轨迹
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

    // 1. Init: 入场动画 (背面 -> 翻面 -> 正面)
    useEffect(() => {
        // 只要数据来了，就开始显示
        if (initialHand.length > 0 && displayHand.length === 0) {
            setDisplayHand(initialHand);
            // [新增] 同步基准数据，告诉组件“这是我们的初始旧手牌”
            prevHandRef.current = initialHand;

            // 动画时长 0.8s，在 400ms 处翻面为正面
            flipCards([0, 1, 2, 3, 4], true, FLIP_DELAY);

            // 留出足够的时间展示入场 (1.2s)
            const timer = setTimeout(() => setPhase('select'), 1200);
            return () => clearTimeout(timer);
        }
    }, [initialHand]);

    // 2. Confirm -> Discard: 弃牌动画 (正面 -> 翻面 -> 背面 -> 飞回牌库)
    useEffect(() => {
        // [关键修复] 添加 phase 依赖！
        // 确保即使在 enter 阶段就点了确定，等到进入 select 阶段时也能立即触发逻辑
        if (isConfirmed && phase === 'select') {
            const runSequence = async () => {
                if (selectedIndices.size > 0) {
                    setPhase('discard');

                    // 翻回背面
                    flipCards(Array.from(selectedIndices), false, FLIP_DELAY);

                    // 等待动画完成 (0.8s)
                    await new Promise(r => setTimeout(r, DURATION * 1000));

                    // 执行后端换牌
                    await onReplaceLogic();
                } else {
                    // 没选牌，直接进入退出流程
                    setPhase('exit');
                }
            };
            runSequence();
        }
    }, [isConfirmed, phase]); // <--- 修复点在这里

    // 3. Data Update -> Draw: 新卡入场 (背面 -> 翻面 -> 正面)
    useEffect(() => {
        // [核心修复] 增加条件：initialHand !== prevHandRef.current
        // 只有当手牌数据真正发生变化（即逻辑层洗牌完成）时，才进入 Draw 阶段
        if (phase === 'discard' && initialHand.length > 0 && initialHand !== prevHandRef.current) {
            setDisplayHand(initialHand); // 更新显示数据为新卡
            setPhase('draw');

            // 翻为正面
            flipCards(Array.from(selectedIndices), true, FLIP_DELAY);

            // 更新 Ref 为新手牌，防止重复触发
            prevHandRef.current = initialHand;

            // 动画结束后 (0.8s + 缓冲) 进入退出流程
            setTimeout(() => setPhase('exit'), 1000);
        }
    }, [initialHand, phase]);

    // 4. Exit: 收牌回库 (正面 -> 翻面 -> 背面 -> 飞回牌库)
    useEffect(() => {
        if (phase === 'exit') {
            // 全员翻回背面
            flipCards([0, 1, 2, 3, 4], false, FLIP_DELAY);

            // 等待动画结束后通知父组件
            const timer = setTimeout(onComplete, 1200);
            return () => clearTimeout(timer);
        }
    }, [phase]);

    // 处理卡牌点击
    const handleCardClick = (index: number) => {
        if (phase !== 'select') return;
        onToggleIndex(index);
    };

    return (
        <div className="fixed inset-0 z-[60] pointer-events-none flex flex-col items-center justify-center">
            {/* 提示文字 */}
            {phase === 'select' && (
                <motion.div
                    initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}
                    className="absolute top-[15%] left-0 right-[20vw] w-full text-center pointer-events-auto"
                >
                    <h2 className="text-5xl font-black text-white drop-shadow-[0_5px_15px_rgba(0,0,0,0.8)] tracking-widest">选择手牌</h2>
                    <p className="text-blue-200 mt-2 font-mono text-lg tracking-[0.2em] opacity-80">SELECT CARDS TO REPLACE</p>
                </motion.div>
            )}

            <div className="relative flex items-center justify-center pointer-events-auto" style={{ marginTop: '5vh' }}>
                <div className="flex gap-5">
                    {displayHand.map((c, index) => {
                        const isSelected = selectedIndices.has(index);
                        const trajectory = getDeckTrajectory(index);
                        const isFaceUp = cardFaces[index];

                        const variants = {
                            // [Enter]: 从牌库飞出 (背面 -> 正面)
                            enter: (i: number) => ({
                                x: 0, y: 0, scale: 0.8, rotate: 0, opacity: 1,
                                scaleX: [1, 0, 1],
                                transition: {
                                    delay: i * 0.08,
                                    duration: DURATION, // 0.8s
                                    type: 'spring', damping: 20,
                                    scaleX: { duration: DURATION, times: [0, 0.5, 1] }
                                }
                            }),

                            // [Select]: 悬停交互
                            select: {
                                x: 0,
                                y: isSelected ? -40 : 0,
                                scale: isSelected ? 0.9 : 0.8,
                                scaleX: 1,
                                transition: { type: 'spring', stiffness: 300 }
                            },

                            // [Discard]: 选中的飞回牌库 (正面 -> 背面)
                            discard: {
                                x: isSelected ? trajectory.x : 0,
                                y: isSelected ? trajectory.y : 0,
                                scale: isSelected ? 0.2 : 0.8,
                                opacity: isSelected ? 0 : 1,
                                scaleX: isSelected ? [1, 0, 1] : 1,
                                transition: {
                                    duration: DURATION, // 0.8s
                                    ease: "easeInOut",
                                    scaleX: { duration: DURATION, times: [0, 0.5, 1] }
                                }
                            },

                            // [Draw]: 新卡从牌库飞出 (背面 -> 正面)
                            draw: {
                                x: 0, y: 0, scale: 0.8, opacity: 1,
                                scaleX: isSelected ? [1, 0, 1] : 1,
                                transition: {
                                    duration: DURATION, // 0.8s
                                    ease: "backOut",
                                    scaleX: { duration: DURATION, times: [0, 0.5, 1] }
                                }
                            },

                            // [Exit]: 全体飞回牌库 (正面 -> 背面)
                            exit: {
                                x: trajectory.x, y: trajectory.y, scale: 0.2, opacity: 0,
                                scaleX: [1, 0, 1],
                                transition: {
                                    duration: DURATION, // 0.8s
                                    ease: "easeInOut",
                                    delay: index * 0.05,
                                    scaleX: { duration: DURATION, times: [0, 0.5, 1], delay: index * 0.05 }
                                }
                            }
                        };

                        // [初始状态] 动态计算
                        const getInitial = () => {
                            if (phase === 'draw' && isSelected) {
                                return { x: trajectory.x, y: trajectory.y, scale: 0.2, opacity: 0, scaleX: 1 };
                            }
                            if (phase === 'enter') {
                                return { x: trajectory.x, y: trajectory.y, scale: 0.2, rotate: 90, opacity: 0, scaleX: 1 };
                            }
                            return false;
                        };

                        return (
                            <div key={`${c.id}-${index}`} className="relative flex flex-col items-center">
                                <motion.div
                                    className="relative cursor-pointer"
                                    onClick={() => handleCardClick(index)}
                                    custom={index}
                                    variants={variants}
                                    initial={getInitial()}
                                    animate={phase}
                                >
                                    {/* 选中高亮框 */}
                                    {isSelected && phase === 'select' && (
                                        <motion.div layoutId="selection-glow" className="absolute -inset-2 rounded-xl border-4 border-blue-400 shadow-[0_0_20px_#3b82f6] z-0" />
                                    )}
                                    <div className="relative z-10">
                                        <Card data={c} location="preview" cardBackUrl={cardBackUrl} isFaceUp={isFaceUp} />
                                    </div>
                                </motion.div>

                                {/* 按钮 UI */}
                                <AnimatePresence>
                                    {phase === 'select' && (
                                        <motion.button
                                            initial={{ opacity: 0, y: -10 }}
                                            animate={{ opacity: 1, y: 20 }}
                                            exit={{ opacity: 0 }}
                                            onClick={(e) => { e.stopPropagation(); onToggleIndex(index); }}
                                            className={`absolute bottom-[-60px] z-20 flex items-center gap-2 px-4 py-2 rounded-full font-bold text-sm shadow-xl transition-colors duration-200 ${isSelected ? 'bg-red-600 text-white ring-2 ring-red-400 hover:bg-red-500' : 'bg-slate-700 text-gray-300 border border-slate-500 hover:bg-slate-600 hover:text-white'}`}
                                        >
                                            {isSelected ? <><RefreshCw size={14} /> 更换</> : <><Check size={14} /> 保留</>}
                                        </motion.button>
                                    )}
                                </AnimatePresence>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};