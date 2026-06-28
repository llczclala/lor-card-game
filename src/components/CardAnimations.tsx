import React, { useState, useEffect} from 'react';
import { motion, AnimatePresence, type Variants, useMotionValue, useVelocity, useTransform, useSpring } from 'framer-motion';
import { Check, RefreshCw } from 'lucide-react'; // [加回] 图标
import type { CardData } from '../types';
import { Card } from './Card';
import { canAffordCard, checkCardConditionActive, checkCardReadyToLevelUp } from '../utils/gameRules'; // [修改] 引入前置侦察兵与升级待命判断
import { useDrawingQueue } from '../hooks/useDrawingQueue';
// --- 组件 1: 正常游戏时的手牌区域 (从 GameSession 迁移并封装) ---
interface PlayerHandProps {
    hand: CardData[];
    onCardClick: (card: CardData) => boolean | void; // 兼容 GameSession 的安检返回值
    onHover: (card: CardData | null) => void;
    onViewArt: (card: CardData) => void;
    game: any; // 传入 game state 以判断出牌条件
    playerBench: CardData[]; // [新增] 需要传入备战席供条件扫描
    combatField: any[];      // [新增] 需要传入交战区供条件扫描
    cardBackUrl: string;
    skinOverrides?: Record<string, number>; // [核心新增] 接收皮肤配置字典
    isCastingForHand?: boolean; // [新增] 施法选择手牌模式雷达
}
// [新增] 景深缩放配置常量，方便随时微调手感
const HOVER_SCALE = 2.5;
const DRAG_SCALE = 2.7;

// ==========================================
// [新增] 动态物理核组件 (AnimatedHandCard)
// 只有将卡牌单独提取为组件，才能合法使用 useVelocity 等高级物理 Hook，进行 GPU 旁路渲染。
// ==========================================
const AnimatedHandCard = ({
    c, isNew, myDelay, isHovered, isDragging,
    translateY, translateX, baseScale, baseRotate, cardZIndex,
    vw, vh,
    onPointerDown, onPointerUp, onMouseEnter, onMouseLeave, onDragStart, onDragEnd,
    game, playerBench, combatField, cardBackUrl, onViewArt, skinOverrides // [修改] 增加解构
}: any) => {
    // 1. 挂载 X 和 Y 轴坐标监听器 (脱离 React 渲染流)
    const x = useMotionValue(0);
    const y = useMotionValue(0);

    // 2. 实时侦测拖拽速度 (Pixels per second)
    const xVelocity = useVelocity(x);
    const yVelocity = useVelocity(y);

    // 3. 将速度映射为目标翻转角度 (原始生硬数据)
    // 向右拉(+x)产生右侧下沉(+RotateY)；向下拉(+y)产生下侧下沉(-RotateX)
    const rawRotateY = useTransform(xVelocity, [-1500, 0, 1500], [-15, 0, 15]);
    const rawRotateX = useTransform(yVelocity, [-1500, 0, 1500], [15, 0, -15]);

    // 4. [终极核心] 加装物理弹簧减震器！
    // 吸收手部的微小抖动，提供完美的“滞后空气阻力感”
    const springConfig = { damping: 25, stiffness: 200, mass: 0.5 };
    const smoothRotateY = useSpring(rawRotateY, springConfig);
    const smoothRotateX = useSpring(rawRotateX, springConfig);

    // 5. 动态计算伪 3D 阴影
    let targetShadow = '0px 5px 10px rgba(0,0,0,0.3)';
    if (isHovered) targetShadow = '0px 15px 20px rgba(0,0,0,0.4)';
    if (isDragging) targetShadow = '0px 50px 30px rgba(0,0,0,0.5)';

    return (
        <motion.div
            key={c.id}
            style={{
                margin: '0 -12px',
                zIndex: cardZIndex,
                x: x,
                y: y, // 必须绑定 Y 轴以监听速度

                // [新增] 开启 3D 摄像机视角，赋予卡牌迎风透视变形能力
                transformPerspective: 1000,
                rotateX: isDragging ? smoothRotateX : 0,
                rotateY: isDragging ? smoothRotateY : 0,
            }}
            onPointerDown={onPointerDown}
            onPointerUp={onPointerUp}
            onMouseEnter={onMouseEnter}
            onMouseLeave={onMouseLeave}
            drag
            dragSnapToOrigin={true}
            dragElastic={0.2}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            // [修复 1] 抽卡动画期间(isNew)，强行关闭指针事件，防止鼠标提前触发 Hover 导致卡牌半空乱飞
            className={`relative origin-bottom ${isNew ? 'pointer-events-none' : 'pointer-events-auto cursor-pointer'}`}

            initial={isNew ? { x: -40 * vw, y: -10 * vh, scale: 1, rotate: 11, opacity: 1, boxShadow: '0px 0px 0px rgba(0,0,0,0)' } : false}
            animate={isNew ? {
                x: [-40 * vw, -10.5 * vw, -10.5 * vw, 0],
                y: [-20 * vh, -27.5 * vh, -27.5 * vh, translateY],
                scale: [1.25, 2.5, 2.5, baseScale],
                rotate: [11, 0, 0, baseRotate],
                opacity: 1,
                boxShadow: ['0px 0px 0px rgba(0,0,0,0)', '0px 50px 30px rgba(0,0,0,0.4)', '0px 50px 30px rgba(0,0,0,0.4)', targetShadow]
            } : {
                x: isDragging ? undefined : translateX,
                y: isDragging ? undefined : translateY,
                // [核心修正] 拖拽时，2D 旋转强制归零，将姿态控制权完全交给 style 里的 3D rotateX/Y
                rotate: isDragging ? 0 : baseRotate,
                scale: baseScale,
                boxShadow: targetShadow
            }}
            transition={isNew ? {
                duration: 2.0,
                delay: myDelay,
                times: [0, 0.4, 0.65, 1],
                ease: "easeInOut"
            } : (isDragging
                ? { duration: 0 }
                : { type: 'spring', stiffness: 300, damping: 25 }
            )}
        >
            <Card
                data={c} location="hand" onViewArt={onViewArt}
                skinId={skinOverrides?.[c.key] || 0} // [核心修复] 手牌彻底穿上皮肤！
                playerNexusHealth={game.playerNexus} // [新增] 透传给英雄查血用
                enemyNexusHealth={game.enemyNexus}   // [新增] 透传给英雄查血用
                isPlayable={(() => {
                    // [核心修复] 如果卡牌正在播放抽卡/入场动画，强制返回 false，熄灭高光
                    if (isNew) return false;

                    // 1. 判断是否是玩家的回合
                    if (game.turnOwner !== 'player') return false;
                    // 2. 判断费用是否足够
                    if (!canAffordCard(c, game.playerMana, game.playerSpellMana)) return false;

                    const isMainPhase = game.phase === 'main';
                    const isCombatPhase = game.phase === 'attack_declare' || game.phase === 'block_declare' || game.phase === 'react_to_block';

                    if (isMainPhase) return true; // 主阶段有钱就能打
                    if (isCombatPhase) {
                        // 战斗和响应阶段，只能打极速 (burst) 或 快速 (fast) 法术
                        return c.type === 'spell-burst' || c.type === 'spell-fast';
                    }
                    return false;
                })()}
                isConditionActive={checkCardConditionActive(c, playerBench, combatField) || checkCardReadyToLevelUp(c)} // [新增] 调用侦察兵，点亮橙色描边！
                cardBackUrl={cardBackUrl} isNew={isNew} delay={myDelay} isDragging={isDragging}
            />
        </motion.div>
    );
};

// 修改后的新的代码片段
export const PlayerHand: React.FC<PlayerHandProps> = ({
    hand, onCardClick, onHover, onViewArt, game, playerBench = [], combatField = [], cardBackUrl, skinOverrides, isCastingForHand // [核心解构]
}) => {
    const validHand = hand.filter(c => c && c.key && c.type);

    const [hoverIndex, setHoverIndex] = useState<number | null>(null);
    const [isAreaHover, setIsAreaHover] = useState(false);
    const [draggingId, setDraggingId] = useState<string | null>(null);

    // 手写指针探测器 (拦截幽灵点击)
    const pointerPos = React.useRef({ x: 0, y: 0 });

    const { isNewCard } = useDrawingQueue(validHand);

    // [修复 2] 监听手牌数组长度变化。只要打出卡牌(长度变短)或刚抽完卡，立刻强制重置所有的鼠标悬停/拖拽状态，防止状态残留导致手牌“赖在半空中”
    useEffect(() => {
        setIsAreaHover(false);
        setHoverIndex(null);
        setDraggingId(null);
    }, [hand.length]);

    let newCardCounter = 0;
    const newCardDelays = hand.map(c => {
        if (isNewCard(c.id)) {
            return newCardCounter++;
        }
        return 0;
    });

    // [核心创举：视口单位的绝对像素化]
    // 动态获取屏幕宽高，将原本的 vw/vh 转换为底层物理引擎最喜欢的纯数字 (Pixels)
    const vw = typeof window !== 'undefined' ? window.innerWidth / 100 : 19.2;
    const vh = typeof window !== 'undefined' ? window.innerHeight / 100 : 10.8;

    return (
        <div
            // [新增] 动态容器层叠跃迁：平时乖乖呆在底层，拖拽时立刻升维至 999 统治全屏！
            className={`absolute left-0 bottom-0 w-full h-[160px] pointer-events-none flex justify-center items-end pb-2 overflow-visible transition-colors duration-300 ${draggingId ? 'z-[999]' : 'z-40'}`}
            onMouseEnter={() => setIsAreaHover(true)}
            onMouseLeave={() => { setIsAreaHover(false); setHoverIndex(null); }}
        >
           <div className="flex -space-x-2 px-4">
                {hand.map((c, index) => {
                    const isNew = isNewCard(c.id);
                    const rotation = (index - (hand.length - 1) / 2) * 4;
                    const myDelay = isNew ? newCardDelays[index] * 1.5 : 0;

                    const isHovered = hoverIndex === index;
                    const isDragging = draggingId === c.id;

                    // [彻底纯数字化的 Y 轴逻辑] (假设卡牌高度约200px)
                    // 170px 约等于 85% 下沉；20px 约等于 10% 上浮
                    // [核心修复] 如果法术正在向手牌索敌，默认基准高度直接设为 20（全体手牌浮出待命），不再死板下沉 170！
                    let translateY = isCastingForHand ? 20 : 170;
                    // [新增] 阵列待命：只要有牌被拖拽，手牌区强制保持上浮弹出状态
                    if (isAreaHover || draggingId !== null) translateY = 20;
                    if (isHovered || isDragging) translateY = 0;

                    let translateX = 0;
                    if (hoverIndex !== null && !draggingId) {
                        const pushDist = 125;
                        if (index < hoverIndex) translateX = -pushDist;
                        if (index > hoverIndex) translateX = pushDist;
                    }

                    const rotate = isHovered || isDragging ? 0 : rotation;
                    const scale = isDragging ? DRAG_SCALE : (isHovered ? HOVER_SCALE : 1.0);
                    const cardZIndex = isDragging ? 999 : (isHovered ? 100 : index);

                    // 剥离原有的内联 motion.div，通过 props 将计算好的参数传递给独立的物理渲染核
                    return (
                        <AnimatedHandCard
                            key={c.id}
                            c={c}
                            isNew={isNew}
                            myDelay={myDelay}
                            isHovered={isHovered}
                            isDragging={isDragging}
                            translateY={translateY}
                            translateX={translateX}
                            baseScale={scale}
                            baseRotate={rotate}
                            cardZIndex={cardZIndex}
                            vw={vw}
                            vh={vh}
                            game={game}
                            playerBench={playerBench} // [核心修复] 把备战席传给物理核组件
                            combatField={combatField} // [核心修复] 把交战区传给物理核组件
                            cardBackUrl={cardBackUrl}
                            onViewArt={onViewArt}
                            skinOverrides={skinOverrides}
                            onPointerDown={(e: any) => {
                                if (e.button !== 0) return; // [核心修复] 仅响应鼠标左键，放过右键
                                pointerPos.current = { x: e.clientX, y: e.clientY };
                            }}
                            onPointerUp={(e: any) => {
                                if (e.button !== 0) return; // [核心修复] 仅响应鼠标左键，放过右键
                                const dist = Math.hypot(e.clientX - pointerPos.current.x, e.clientY - pointerPos.current.y);
                                if (dist < 5) onCardClick(c);
                            }}
                            onMouseEnter={() => { if (!draggingId) { setHoverIndex(index); onHover(c); } }}
                            onMouseLeave={() => { if (!draggingId) onHover(null); }}
                            onDragStart={() => { setDraggingId(c.id); setHoverIndex(index); }}
                            onDragEnd={(_e: any, info: any) => {
                                setDraggingId(null);
                                setHoverIndex(null);
                                onHover(null);
                                if (info.point.y < window.innerHeight * 0.7) {
                                    onCardClick(c);
                                }
                            }}
                        />
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
    skinOverrides?: Record<string, number>;
    // [修改] 状态由父组件(Hook)控制
    selectedIndices: Set<number>;
    isConfirmed: boolean;
    onToggleIndex: (index: number) => void;
    // [新增] 当动画播放到"该真正换数据了"的时候通知父组件
    onAnimationStep: (step: 'ready_to_replace' | 'finished') => void;
    onViewArt?: (card: CardData) => void; // [核心修复] 接收查看大图的回调
}

export const OpeningMulligan: React.FC<OpeningMulliganProps> = ({
    hand,
    cardBackUrl,
    skinOverrides,
    selectedIndices,
    isConfirmed,
    onToggleIndex,
    onAnimationStep,
    onViewArt        // [核心修复] 解构出 onViewArt
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
                                        {/* [核心修复] 将 onViewArt 传给底层的 Card，让它知道该如何拦截右键！ */}
                                        <Card data={c} location="preview" cardBackUrl={cardBackUrl} isFaceUp={isFaceUp} onViewArt={onViewArt} skinId={skinOverrides?.[c.key] || 0} /> {/* [核心修复] 换牌界面的卡牌穿上皮肤！ */}
                                    </div>
                                    <AnimatePresence>
                                        {animPhase === 'select' && (
                                            <motion.button
                                                // [视觉正骨] 将 x: "-50%" 显式注入 Framer Motion，统一接管双轴坐标
                                                initial={{ opacity: 0, x: "-50%", y: -10 }}
                                                animate={{ opacity: 1, x: "-50%", y: 20 }}
                                                exit={{ opacity: 0, x: "-50%" }}
                                                // 阻止冒泡，避免触发卡牌点击，直接调用 props 传来的 onToggleIndex
                                                onClick={(e) => { e.stopPropagation(); onToggleIndex(index); }}
                                                // [视觉正骨] 移除 Tailwind 的 -translate-x-1/2，避免控制权冲突
                                                // [逻辑换脑] 反转 isSelected 判定：未选中时显示红色“更换”，选中时显示灰白“保留”
                                                className={`absolute bottom-[-60px] left-1/2 z-20 flex items-center gap-2 px-4 py-2 rounded-full font-bold text-sm shadow-xl transition-colors duration-200 whitespace-nowrap ${!isSelected ? 'bg-red-600 text-white ring-2 ring-red-400 hover:bg-red-500' : 'bg-green-700 text-gray-300 border border-green-500 hover:bg-green-600 hover:text-white'}`}
                                            >
                                                {/* [逻辑换脑] 文本与图标同样反转映射 */}
                                                {!isSelected ? <><RefreshCw size={14} /> 更换</> : <><Check size={14} /> 保留</>}
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

// ═══════════════════════════════════════════════════════════════
//  🎴 新动画接口 — 由动画合作伙伴（小伙伴）负责实现
//  主项目占位组件 — 实现在 sandbox 中开发，完成后替换这里
// ═══════════════════════════════════════════════════════════════

interface CardAnimProps {
    card: CardData;
    isPlaying: boolean;
    onComplete?: () => void;
    children?: React.ReactNode;
}

// ==========================================
// 🏜️ 动画 1：风沙消散（瞬逝）
// 触发时机：回合结束 Ephemeral 卡牌从手牌弃置
// 进度：TODO — 待小伙伴在 sandbox 中实现
// ==========================================
export const EphemeralDissolve: React.FC<CardAnimProps> = ({
    card, isPlaying, onComplete, children
}) => {
    if (!isPlaying) return null;
    return <>{children}</>;
};

// ==========================================
// 💥 动画 2：卡牌碎掉（法术碎裂）
// 触发时机：法术效果导致卡牌被摧毁/弃置
// 进度：TODO — 待小伙伴在 sandbox 中实现
// ==========================================
export const CardShatter: React.FC<CardAnimProps> = ({
    card, isPlaying, onComplete, children
}) => {
    if (!isPlaying) return null;
    return <>{children}</>;
};

// ==========================================
// 💫 动画 3：半空碎裂（满手牌爆牌）
// 触发时机：手牌已满时抽卡，卡牌在半空中碎裂
// 进度：TODO — 待小伙伴在 sandbox 中实现
// ==========================================
export const MidAirShatter: React.FC<CardAnimProps> = ({
    card, isPlaying, onComplete, children
}) => {
    if (!isPlaying) return null;
    return <>{children}</>;
};