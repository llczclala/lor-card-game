import React, { useState, useEffect, useMemo, useRef, useCallback} from 'react';
import { motion, AnimatePresence, type Variants, useMotionValue, useVelocity, useTransform, useSpring } from 'framer-motion';
import { Check, RefreshCw, Crosshair } from 'lucide-react'; // [加回] 图标
import type { CardData } from '../types';
import { Card } from './Card';
import { canAffordCard, checkCardConditionActive, checkCardReadyToLevelUp, checkShaloGlimpseEnlightened, hasPoetCaitlinAura, hasForgerTatianaAura } from '../utils/gameRules';
import { EFFECT_DB } from '../data/effectRegistry'; // [2026-07-14 锻造者] 读取效果参数用于显示
import { eventBus, GameEvents } from '../utils/eventBus'; // [新增] 用于手牌动画事件驱动
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
    onAnimComplete?: (cardId: string) => void; // [2026-07-22 莉莉子] 手牌离场动画完成回调
}
// [新增] 景深缩放配置常量，方便随时微调手感
const HOVER_SCALE = 2.5;
const DRAG_SCALE = 2.7;

// ==========================================
// [新增] 动态物理核组件 (AnimatedHandCard)
// 只有将卡牌单独提取为组件，才能合法使用 useVelocity 等高级物理 Hook，进行 GPU 旁路渲染。
// ==========================================
const AnimatedHandCard = ({
    c, isNew, initialX, isHovered, isDragging,
    translateY, translateX, baseScale, baseRotate, cardZIndex,
    vw, vh,
    onPointerDown, onPointerUp, onMouseEnter, onMouseLeave, onDragStart, onDragEnd,
    game, playerBench, combatField, cardBackUrl, onViewArt, skinOverrides,
    animType, onAnimComplete, // [2026-07-22 莉莉子] 手牌动画支持
}: any) => {
    // [2026-07-07 交互修复] 局部动画状态：与 isNew 解耦
    // isNew 由父组件通过 isNewMapRef 持久化（保护 initial），
    // 但 pointer-events 不能跟着永久锁定——动画播完后自动解除。
    const [isAnimating, setIsAnimating] = useState(isNew || !!animType);
    const [discardAnimDone, setDiscardAnimDone] = useState(false);
    const initialAnimDoneRef = useRef(false);
    const onFlyInComplete = useCallback(() => {
        if (!initialAnimDoneRef.current) {
            initialAnimDoneRef.current = true;
            setIsAnimating(false);
        }
    }, []);

    // [2026-07-22 莉莉子] 手牌离场动画完成后的清理
    const onDiscardAnimComplete = useCallback(() => {
        if (!discardAnimDone) {
            setDiscardAnimDone(true);
            onAnimComplete?.(c.id);
        }
    }, [c.id, onAnimComplete, discardAnimDone]);

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
            // [isNew] 初始 scale:2.5 补偿 preview→hand 的基准尺寸差异
            // [2026-07-07] 用 isAnimating（局部状态）而非 isNew 控制交互：
            // isNew 持久化后始终为 true，但交互锁定只需持续到动画播完。
            className={`relative origin-bottom ${isAnimating ? 'pointer-events-none' : 'pointer-events-auto cursor-pointer'}`}
            initial={isNew ? { scale: 2.8, y: -35 * vh, x: initialX, opacity: 1 } : false}
            animate={{
                x: isDragging ? undefined : translateX,
                y: isDragging ? undefined : translateY,
                rotate: isDragging ? 0 : baseRotate,
                scale: baseScale,
                opacity: 1,
                boxShadow: targetShadow,
            }}
            onAnimationComplete={onFlyInComplete}
            transition={isNew
                ? { type: 'spring', stiffness: 150, damping: 15, mass: 1.0 }
                : isDragging
                ? { duration: 0 }
                : { type: 'spring', stiffness: 300, damping: 25 }
            }
        >
            {animType === 'dissolve' ? (
                <EphemeralDissolve card={c} isPlaying onComplete={onDiscardAnimComplete}>
                    <Card data={c} location="hand" onViewArt={onViewArt}
                        skinId={skinOverrides?.[c.key] || 0}
                        playerNexusHealth={game.playerNexus} enemyNexusHealth={game.enemyNexus}
                        burnoutValue={(() => {
                            if (c.key === 'forced_communication') return (game.playerMana || 0) + (game.playerSpellMana || 0);
                            if (hasPoetCaitlinAura(playerBench) && (c.type === 'spell-burst' || c.type === 'spell-fast')) return Math.max(0, c.cost - 1);
                            if (c.key === 'Shalo_Golem_Glimpse' && game.playerMaxMana >= 10) return 0;
                            return undefined;
                        })()}
                        isCostReduced={(c.customProgress || 0) & 2 ? true : false}
                        cardBackUrl={cardBackUrl} isDragging={isDragging}
                    />
                </EphemeralDissolve>
            ) : animType === 'shatter' ? (
                <CardShatter card={c} isPlaying onComplete={onDiscardAnimComplete}>
                    <Card data={c} location="hand" onViewArt={onViewArt}
                        skinId={skinOverrides?.[c.key] || 0}
                        playerNexusHealth={game.playerNexus} enemyNexusHealth={game.enemyNexus}
                        burnoutValue={(() => {
                            if (c.key === 'forced_communication') return (game.playerMana || 0) + (game.playerSpellMana || 0);
                            if (hasPoetCaitlinAura(playerBench) && (c.type === 'spell-burst' || c.type === 'spell-fast')) return Math.max(0, c.cost - 1);
                            if (c.key === 'Shalo_Golem_Glimpse' && game.playerMaxMana >= 10) return 0;
                            return undefined;
                        })()}
                        isCostReduced={(c.customProgress || 0) & 2 ? true : false}
                        cardBackUrl={cardBackUrl} isDragging={isDragging}
                    />
                </CardShatter>
            ) : (
                <Card data={c} location="hand" onViewArt={onViewArt}
                    skinId={skinOverrides?.[c.key] || 0}
                    playerNexusHealth={game.playerNexus} enemyNexusHealth={game.enemyNexus}
                    burnoutValue={(() => {
                        if (c.key === 'forced_communication') return (game.playerMana || 0) + (game.playerSpellMana || 0);
                        if (hasPoetCaitlinAura(playerBench) && (c.type === 'spell-burst' || c.type === 'spell-fast')) return Math.max(0, c.cost - 1);
                        if (c.key === 'Shalo_Golem_Glimpse' && game.playerMaxMana >= 10) return 0;
                        return undefined;
                    })()}
                    displayParams={(() => {
                        if (!c.type.includes('spell') || !c.effects || c.effects.length === 0) return undefined;
                        const effectDef = EFFECT_DB[c.effects[0]];
                        if (!effectDef || effectDef.class !== 'STRIKE' || !effectDef.params?.value) return undefined;
                        const raw = { ...effectDef.params };
                        const isBoosted = hasForgerTatianaAura(playerBench, combatField);
                        const display: Record<string, number> = {};
                        for (const [key, val] of Object.entries(raw)) {
                            if (typeof val === 'number') display[key] = val + (isBoosted ? 1 : 0);
                        }
                        return Object.keys(display).length > 0 ? display : undefined;
                    })()}
                    damageColor={(() => {
                        if (!c.type.includes('spell') || !c.effects || c.effects.length === 0) return null;
                        const effectDef = EFFECT_DB[c.effects[0]];
                        if (!effectDef || effectDef.class !== 'STRIKE' || !effectDef.params?.value) return null;
                        return hasForgerTatianaAura(playerBench, combatField) ? 'boosted' : null;
                    })()}
                    isCostReduced={(c.customProgress || 0) & 2 ? true : false}
                    isPlayable={(() => {
                        if (game.turnOwner !== 'player') return false;
                        if (c.key === 'forced_communication') {
                            const burnoutCost = (game.playerMana || 0) + (game.playerSpellMana || 0);
                            if (burnoutCost <= 0) return false;
                        } else if (!canAffordCard(c, game.playerMana, game.playerSpellMana, playerBench)) return false;
                        if (game.spellStack.length > 0) return c.type === 'spell-burst' || c.type === 'spell-fast';
                        const isMainPhase = game.phase === 'main';
                        const isCombatPhase = game.phase === 'attack_declare' || game.phase === 'block_declare' || game.phase === 'react_to_block';
                        if (isMainPhase) return true;
                        if (isCombatPhase) return c.type === 'spell-burst' || c.type === 'spell-fast';
                        return false;
                    })()}
                    isConditionActive={checkCardConditionActive(c, playerBench, combatField, game) || checkCardReadyToLevelUp(c, game) || checkShaloGlimpseEnlightened(c, game.playerMaxMana)}
                    cardBackUrl={cardBackUrl} isDragging={isDragging}
                />
            )}
        </motion.div>
    );
};

// 修改后的新的代码片段
export const PlayerHand: React.FC<PlayerHandProps> = ({
    hand, onCardClick, onHover, onViewArt, game, playerBench = [], combatField = [], cardBackUrl, skinOverrides, isCastingForHand, onAnimComplete // [核心解构]
}) => {
    const validHand = hand.filter(c => c && c.key && c.type);

    const [hoverIndex, setHoverIndex] = useState<number | null>(null);
    const [isAreaHover, setIsAreaHover] = useState(false);
    const [draggingId, setDraggingId] = useState<string | null>(null);
    // [2026-07-22 莉莉子] 手牌离场动画状态: cardId → animType
    const [animMap, setAnimMap] = useState<Record<string, 'dissolve' | 'shatter'>>({});

    // [2026-07-22 莉莉子] 订阅手牌离场动画事件
    useEffect(() => {
        const onVolatile = (p: { card: CardData }) => {
            setAnimMap(prev => ({ ...prev, [p.card.id]: 'dissolve' }));
        };
        const onDiscard = (p: { card: CardData }) => {
            setAnimMap(prev => ({ ...prev, [p.card.id]: 'shatter' }));
        };
        eventBus.on(GameEvents.HAND_VOLATILE_DISCARD, onVolatile);
        eventBus.on('hand_spell_discard', onDiscard);
        return () => {
            eventBus.off(GameEvents.HAND_VOLATILE_DISCARD, onVolatile);
            eventBus.off('hand_spell_discard', onDiscard);
        };
    }, []);

    // 手写指针探测器 (拦截幽灵点击)
    const pointerPos = React.useRef({ x: 0, y: 0 });

    // ═══════════════════════════════════════════════════════════════
    //  🆕 isNew 新卡牌检测引擎（抽卡飞入动画的核心）
    //
    //  功能：检测手牌中新增的卡牌，为其分配 isNew=true 标记，
    //        让 AnimatedHandCard 挂载时激活从中央飞入手牌的动画。
    //
    //  ⚠️ 红线警告：以下两项缺一不可，删任意一个都会导致抽卡飞入动画永久丢失！
    //    ① isNewMapRef（持久化标记）— 确保跨渲染/StrictMode 仍保留 isNew 状态
    //    ② 下方保留旧标记的 for 循环 — 将历史标记合并到当前渲染
    //
    //  2026-07-07 修复：曾因删掉 isNewMapRef 导致抽卡飞入动画丢失数日。
    //  原理：Framer Motion 的 initial 只在组件首次挂载时读取，若那次 isNew=false，
    //       后续无论 isNew 怎么变 true，飞入动画都不会再触发。
    // ═══════════════════════════════════════════════════════════════
    const prevCardIdsRef = useRef<string[]>([]);
    const isTrackingRef = useRef(false);
    const isNewMapRef = useRef(new Map<string, boolean>()); // ← [红线①] 删掉则飞入动画丢失！
    const handWasEmptyRef = useRef(false); // [2026-07-07] 追踪手牌是否曾为空（换牌后首抽需要）
    let isNewMap = new Map<string, boolean>();
    let hasNewCard = false;
    if (validHand.length > 0) {
        const currentIds = validHand.map(c => c.id);
        if (!isTrackingRef.current) {
            isTrackingRef.current = true;
            // [2026-07-07 首抽修复] 手牌从空→有卡：这些卡是新抽入的，不是初始手牌
            // 场景：换牌后 setPlayerHand([]) → drawCards 逐一加入，首张卡需标记为 new
            if (handWasEmptyRef.current) {
                currentIds.forEach(id => isNewMap.set(id, true));
            }
            handWasEmptyRef.current = false;
            prevCardIdsRef.current = currentIds;
        } else {
            const added = currentIds.filter(id => !prevCardIdsRef.current.includes(id));
            added.forEach(id => isNewMap.set(id, true));
            // ⚠️ [红线②] 保留旧标记：合并 isNewMapRef 中已有的新卡标记到当前帧
            // 删除此循环 → 新卡标记只存活一帧 → React 任何额外渲染都会丢失 isNew
            for (const [id, marked] of isNewMapRef.current.entries()) {
                if (currentIds.includes(id) && marked) isNewMap.set(id, true);
            }
            isNewMapRef.current = isNewMap;
            prevCardIdsRef.current = currentIds;
        }
        hasNewCard = isNewMap.size > 0;
    } else if (hand.length === 0) {
        // [2026-07-07 首抽修复] 手牌为空 → 标记，下次有卡时全部视为新卡
        handWasEmptyRef.current = true;
    }

    // [修复 2] 监听手牌数组长度变化。只要打出卡牌(长度变短)，立刻强制重置所有的鼠标悬停/拖拽状态
    useEffect(() => {
        setIsAreaHover(false);
        setHoverIndex(null);
        setDraggingId(null);
    }, [hand.length]);

    // [2026-07-22 莉莉子] 清理已不存在的卡牌 animMap 条目（防内存泄漏）
    useEffect(() => {
        const currentIds = new Set(hand.map(c => c.id));
        setAnimMap(prev => {
            const stale = Object.keys(prev).some(id => !currentIds.has(id));
            if (!stale) return prev;
            const next: Record<string, 'dissolve' | 'shatter'> = {};
            for (const [id, type] of Object.entries(prev)) {
                if (currentIds.has(id)) next[id] = type;
            }
            return next;
        });
    }, [hand]);

    // [核心创举：视口单位的绝对像素化]
    // 动态获取屏幕宽高，将原本的 vw/vh 转换为底层物理引擎最喜欢的纯数字 (Pixels)
    const vw = typeof window !== 'undefined' ? window.innerWidth / 100 : 19.2;
    const vh = typeof window !== 'undefined' ? window.innerHeight / 100 : 10.8;

    return (
        <div
            // [动态容器层叠] 以下场景手牌容器提升至 z-[999] 层：
            // ① draggingId !== null — 拖拽卡牌时覆盖全屏
            // ② hasNewCard === true — 新抽卡牌飞入动画期间，防止被中间通报字幕盖住
            className={`absolute left-0 bottom-0 w-full h-[160px] pointer-events-none flex justify-center items-end pb-2 overflow-visible transition-colors duration-300 ${(draggingId || hasNewCard) ? 'z-[999]' : 'z-40'}`}
            onMouseEnter={() => setIsAreaHover(true)}
            onMouseLeave={() => { setIsAreaHover(false); setHoverIndex(null); }}
        >
           <div className="flex -space-x-2 px-4">
                {hand.map((c, index) => {
                    const rotation = (index - (hand.length - 1) / 2) * 4;

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

                    // [isNew] flex 偏移补偿：手牌越多新卡槽位越靠右，反向补偿锚定到屏幕中央
                    const centerIndex = Math.max((hand.length - 1) / 2, 0);
                    const CARD_PITCH = 56;
                    const flexOffset = (index - centerIndex) * CARD_PITCH;
                    const initialX = translateX - flexOffset;

                    // 剥离原有的内联 motion.div，通过 props 将计算好的参数传递给独立的物理渲染核
                    return (
                        <AnimatedHandCard
                            key={c.id}
                            c={c}
                            isNew={isNewMap.get(c.id) || false}
                            initialX={initialX}
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
                            animType={animMap[c.id] || null}
                            onAnimComplete={onAnimComplete}
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

// --- 组件 2: 敌方手牌 (纯展示 + 入场动画) ---
interface EnemyHandProps {
    hand: CardData[];
    cardBackUrl: string;
    onAnimComplete?: (cardId: string) => void; // [2026-07-22 莉莉子] 手牌离场动画完成回调
}

export const EnemyHand: React.FC<EnemyHandProps> = ({ hand, cardBackUrl, onAnimComplete }) => {
    // ── 渲染时同步检测 isNew（和 PlayerHand 一致）──
    // ⚠️ 保持 isNewFlagsRef 持久化！参考 PlayerHand 的 isNewMapRef 红线注释。
    const prevHandRef = useRef<string[]>([]);
    const isNewFlagsRef = useRef<Set<string>>(new Set());

    const isNewMap = new Set<string>();
    const currentIds = hand.map(c => c.id);
    if (currentIds.length > 0) {
        const added = currentIds.filter(id => !prevHandRef.current.includes(id));
        added.forEach(id => isNewMap.add(id));
        // 保留仍在手牌中的已有标记（已动画过的卡牌保持 true，但 Framer Motion 不会重复触发）
        for (const id of isNewFlagsRef.current) {
            if (currentIds.includes(id)) isNewMap.add(id);
        }
        isNewFlagsRef.current = isNewMap;
        prevHandRef.current = currentIds;
    }

    // [2026-07-07] 敌人抽卡飞入动画的心跳检测
    const hasNewEnemyCard = isNewMap.size > 0;
    const vh = typeof window !== 'undefined' ? window.innerHeight / 100 : 10.8;

    // [2026-07-22 莉莉子] 敌方手牌离场动画状态
    const [animMap, setAnimMap] = useState<Record<string, 'dissolve' | 'shatter'>>({});
    const [discardAnimDone, setDiscardAnimDone] = useState<Record<string, boolean>>({});

    useEffect(() => {
        const onVolatile = (p: { card: CardData; owner: string }) => {
            if (p.owner !== 'enemy') return;
            setAnimMap(prev => ({ ...prev, [p.card.id]: 'dissolve' }));
        };
        const onDiscard = (p: { card: CardData; owner: string }) => {
            if (p.owner !== 'enemy') return;
            setAnimMap(prev => ({ ...prev, [p.card.id]: 'shatter' }));
        };
        eventBus.on(GameEvents.HAND_VOLATILE_DISCARD, onVolatile);
        eventBus.on('hand_spell_discard', onDiscard);
        return () => {
            eventBus.off(GameEvents.HAND_VOLATILE_DISCARD, onVolatile);
            eventBus.off('hand_spell_discard', onDiscard);
        };
    }, []);

    const handleAnimComplete = useCallback((cardId: string) => {
        if (discardAnimDone[cardId]) return;
        setDiscardAnimDone(prev => ({ ...prev, [cardId]: true }));
        setAnimMap(prev => {
            const next = { ...prev };
            delete next[cardId];
            return next;
        });
        onAnimComplete?.(cardId);
    }, [onAnimComplete, discardAnimDone]);

    return (
        <div className={`h-32 flex justify-center items-start pt-4 perspective-1000 relative -mt-12 transition-all duration-300 ${hasNewEnemyCard ? 'z-[999]' : ''}`}>
            <div className="relative w-full h-full flex justify-center">
                {hand.map((c, index) => {
                    const total = hand.length;
                    const angle = (index - (total - 1) / 2) * 5;
                    const archY = Math.abs(index - (total - 1) / 2) * 5;
                    const cardAnimType = animMap[c.id] || null;
                    return (
                        <div
                            key={c.id}
                            className="absolute top-0 left-1/2 -ml-[65px] w-[130px] h-[202px] origin-center transition-transform duration-500"
                            style={{
                                transform: `translateX(${(index - (total - 1) / 2) * 40}px) rotate(${180 - 0.5 * angle}deg) translateY(calc(50% + ${archY}px))`,
                                zIndex: index,
                            }}
                        >
                            <motion.div
                                className="w-full h-full bg-gradient-to-br from-slate-700 to-slate-800 rounded border border-slate-600 shadow-xl overflow-hidden"
                                // [2026-07-08 修复] 深色容器和卡背一起飞入
                                // 外层 div 只做扇形定位，内层 motion.div 携带背景+卡背从中央飞入
                                initial={isNewMap.has(c.id) ? { scale: 2.2, y: -42 * vh, opacity: 1 } : false}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                transition={isNewMap.has(c.id)
                                    ? { type: 'spring', stiffness: 150, damping: 15, mass: 1.0 }
                                    : { type: 'spring', stiffness: 350, damping: 24, mass: 0.8 }
                                }
                            >
                                {cardAnimType === 'dissolve' ? (
                                    <EphemeralDissolve card={c} isPlaying onComplete={() => handleAnimComplete(c.id)}>
                                        <Card data={c} location="hand" isFaceUp={false} cardBackUrl={cardBackUrl} />
                                    </EphemeralDissolve>
                                ) : cardAnimType === 'shatter' ? (
                                    <CardShatter card={c} isPlaying onComplete={() => handleAnimComplete(c.id)}>
                                        <Card data={c} location="hand" isFaceUp={false} cardBackUrl={cardBackUrl} />
                                    </CardShatter>
                                ) : (
                                    <Card data={c} location="hand" isFaceUp={false} cardBackUrl={cardBackUrl} />
                                )}
                            </motion.div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

// --- 组件 3: 开局换牌阶段 (Opening Mulligan) ---
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
    // [2026-07-07 换牌锁定] 卡片完全展示后回调，用于解锁"确定"按钮
    onCardsDisplayed?: () => void;
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
    onCardsDisplayed, // [2026-07-07 换牌锁定]
    onViewArt        // [核心修复] 解构出 onViewArt
}) => {
    // --- 1. 内部状态管理 (从 GameSession 移入) ---
    const [animPhase, setAnimPhase] = useState<'enter' | 'select' | 'discard' | 'draw' | 'exit'>('enter');
    const [displayHand, setDisplayHand] = useState<CardData[]>([]);
    const [cardFaces, setCardFaces] = useState<boolean[]>([false, false, false, false, false]);

    const prevHandRef = React.useRef(hand);
    const DURATION = 0.8;
    const FLIP_DELAY = 400;

    // [2026-07-08 修复] RAF 延时：切屏时暂停，回来时继续，与 Framer Motion 同频
    const rafDelay = useCallback((ms: number) => new Promise<void>(resolve => {
        const start = performance.now();
        const frame = () => {
            if (performance.now() - start >= ms) resolve();
            else requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
    }), []);

    // RAF 版 useEffect 清理器：返回一个 stop 函数 + 启动 RAF
    const rafEffect = useCallback((ms: number, callback: () => void) => {
        const start = performance.now();
        let rafId: number;
        let active = true;
        const frame = () => {
            if (!active) return;
            if (performance.now() - start >= ms) callback();
            else rafId = requestAnimationFrame(frame);
        };
        rafId = requestAnimationFrame(frame);
        return () => { active = false; cancelAnimationFrame(rafId); };
    }, []);

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
            // [2026-07-08 修复] RAF 替代 setTimeout，切屏时暂停
            return rafEffect(1200, () => {
                setAnimPhase('select');
                // [2026-07-07 换牌锁定] 卡片展示完毕，通知父组件解锁"确定"按钮
                onCardsDisplayed?.();
            });
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

                // [2026-07-08 修复] RAF 替代 setTimeout，切屏时暂停
                await rafDelay(DURATION * 1000);
                // [关键] 动画播完了，通知父组件去换数据
                onAnimationStep('ready_to_replace');
            } else {
                setAnimPhase('exit');
            }
        };
        runDiscard();
    }
}, [isConfirmed, animPhase, selectedIndices]);

    // Data Update -> Draw：仅切状态，不挂定时器
    useEffect(() => {
        if (animPhase === 'discard' && hand.length > 0 && hand !== prevHandRef.current) {
            setDisplayHand(hand);
            setAnimPhase('draw');
            flipCards(Array.from(selectedIndices), true, FLIP_DELAY);
            prevHandRef.current = hand;
        }
    }, [hand, animPhase]);

    // Draw -> Exit：独立定时器，不受前一个 effect 的 cleanup 误杀
    useEffect(() => {
        if (animPhase === 'draw') {
            return rafEffect(1000, () => setAnimPhase('exit'));
        }
    }, [animPhase]);

    // Exit -> finished
    useEffect(() => {
        if (animPhase === 'exit') {
            flipCards([0, 1, 2, 3, 4], false, FLIP_DELAY);
            return rafEffect(1200, () => {
                onAnimationStep('finished');
            });
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
//  🎴 手牌动画三件套 — 独立纯视觉组件
//  每个组件遵循 CardAnimProps 接口，包裹 children 播完回调
//  由 eventBus 事件驱动，与主游戏逻辑完全解耦
//  注意：这三个组件互相独立，不共享可变状态，方便独立调试
// ═══════════════════════════════════════════════════════════════

interface CardAnimProps {
    card: CardData;
    isPlaying: boolean;
    onComplete?: () => void;
    children?: React.ReactNode;
}

// --- 动画通用配置 ---
const ANIM_EASING = [0.25, 0.46, 0.45, 0.94] as const;

// --- 工具：生成不规则碎片裁剪路径 ---
const generateClipPath = () => {
    return `polygon(${5 + Math.random() * 25}% 0, ${75 + Math.random() * 25}% ${5 + Math.random() * 20}%, ${55 + Math.random() * 45}% ${55 + Math.random() * 40}%, ${2 + Math.random() * 20}% ${70 + Math.random() * 30}%)`;
};

// --- 工具：生成碎片数据（CardShatter / MidAirShatter 共用）---
interface Shard {
    id: number; x: number; y: number; width: number; height: number;
    angle: number; distance: number; rotation: number; delay: number;
    gravity: number; isLarge?: boolean; color: string; clipPath: string;
}

const SHARD_COLORS = ['rgba(26, 58, 74, 0.95)', 'rgba(13, 27, 42, 0.95)'];
const SHARD_COLORS_LIGHT = ['rgba(26, 58, 74, 0.8)', 'rgba(13, 27, 42, 0.8)'];

const generateShards = (count: number, baseDelay: number = 0): Shard[] => {
    return Array.from({ length: count }, (_, i) => {
        const angle = (360 / count) * i + (Math.random() - 0.5) * 60;
        const isLarge = i % 3 === 0;
        return {
            id: i,
            x: 45 + Math.random() * 10,
            y: 45 + Math.random() * 10,
            width: isLarge ? 18 + Math.random() * 12 : 8 + Math.random() * 10,
            height: isLarge ? 24 + Math.random() * 16 : 12 + Math.random() * 12,
            angle,
            distance: isLarge ? 80 + Math.random() * 120 : 120 + Math.random() * 160,
            rotation: Math.random() * 1440 - 720,
            delay: baseDelay + Math.random() * 0.1,
            gravity: isLarge ? 0.8 + Math.random() * 1.2 : 0.4 + Math.random() * 1,
            isLarge,
            color: isLarge ? SHARD_COLORS[i % 2] : SHARD_COLORS_LIGHT[i % 2],
            clipPath: generateClipPath(),
        };
    });
};

// --- 内部子组件：裂纹 SVG（CardShatter / MidAirShatter 共用）---
const CrackSVG = React.memo(() => (
    <svg
        viewBox="0 0 200 280"
        style={{
            width: '100%',
            height: '100%',
            // [核心修复] 为深色裂纹添加双层高强度纯白发光投影，确保在极高亮度的彩色插画上依然能形成强烈的视觉撕裂感！
            filter: 'drop-shadow(0px 0px 2px rgba(255, 255, 255, 1)) drop-shadow(0px 0px 6px rgba(255, 255, 255, 0.8))'
        }}
    >
        <path d="M5 15 L100 45 L85 115 L115 175 L45 265" stroke="#050a10" strokeWidth="3" fill="none" opacity="1" />
        <path d="M195 5 L125 65 L165 145 L105 225" stroke="#0a1520" strokeWidth="2.5" fill="none" opacity="0.9" />
        <path d="M25 85 L100 105 L155 80" stroke="#050a10" strokeWidth="2" fill="none" opacity="0.75" />
        <path d="M55 175 L125 155 L145 195" stroke="#0a1520" strokeWidth="1.8" fill="none" opacity="0.65" />
        <path d="M35 140 L95 160 L75 230" stroke="#050a10" strokeWidth="1.5" fill="none" opacity="0.55" />
    </svg>
));
CrackSVG.displayName = 'CrackSVG';

// --- 内部子组件：闪光效果（CardShatter / MidAirShatter 共用）---
const FlashEffect = React.memo<{ delay?: number }>(({ delay = 0 }) => (
    <>
        <motion.div
            style={{
                position: 'absolute', inset: -5,
                background: 'radial-gradient(circle at 50% 45%, rgba(255,220,150,0.45), rgba(255,180,80,0.25), transparent 55%)',
                pointerEvents: 'none',
            }}
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: [0, 0.55, 0.35, 0], scale: [0.5, 1.4, 1.7, 2.1] }}
            transition={{ duration: 0.28, delay, ease: 'easeOut' }}
        />
        <motion.div
            style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
            initial={{ opacity: 0, scale: 1 }}
            animate={{ opacity: [0, 0.35, 0], scale: [1, 1.12, 1.3] }}
            transition={{ duration: 0.22, delay, ease: 'easeOut' }}
        >
            <div style={{
                position: 'absolute', inset: 0,
                border: '1.5px solid rgba(255, 200, 120, 0.4)', borderRadius: 10,
            }} />
        </motion.div>
    </>
));
FlashEffect.displayName = 'FlashEffect';

// ==========================================
// 🏜️ 动画 1：风沙消散（瞬逝 / Volatile）
// 触发时机：回合结束 Volatile 卡牌从手牌弃置
// 效果：卡牌模糊上升消散 + 粒子飘散 + 沙粒碎片
// ==========================================
export const EphemeralDissolve: React.FC<CardAnimProps> = ({
    card, isPlaying, onComplete, children
}) => {
    const { particles, sandParticles } = useMemo(() => {
        const COLORS = ['rgba(26, 58, 74, 0.95)', 'rgba(13, 27, 42, 0.95)'];
        const COLORS_LIGHT = ['rgba(26, 58, 74, 0.8)', 'rgba(13, 27, 42, 0.8)'];

        const particles = Array.from({ length: 48 }, (_, i) => ({
            id: i,
            x: 5 + Math.random() * 90,
            y: 5 + Math.random() * 90,
            size: 3 + Math.random() * 6,
            angle: Math.random() * 360,
            distance: 60 + Math.random() * 150,
            delay: Math.random() * 0.6,
            duration: 1 + Math.random() * 1.5,
            color: COLORS[i % 2],
            yOffset: -Math.random() * 80,
        }));

        const sandParticles = Array.from({ length: 16 }, (_, i) => ({
            id: i,
            x: 10 + (i % 8) * 12,
            y: 15 + Math.floor(i / 8) * 30,
            width: 4 + Math.random() * 4,
            height: 10 + Math.random() * 12,
            delay: 0.25 + i * 0.05,
            duration: 1.8 + Math.random(),
            xOffset: (Math.random() - 0.5) * 80,
            yOffset: -60 - Math.random() * 80,
            rotation: Math.random() * 180 - 90,
            color: COLORS_LIGHT[i % 2],
        }));

        return { particles, sandParticles };
    }, []);

    return (
        <AnimatePresence>
            {isPlaying && (
                <motion.div
                    initial={{ opacity: 1, scale: 1, y: 0, filter: 'blur(0px)' }}
                    animate={{
                        opacity: [1, 0.9, 0.6, 0],
                        scale: [1, 1.02, 0.95, 0.4],
                        y: [0, -5, -30, -100],
                        filter: ['blur(0px)', 'blur(1px)', 'blur(4px)', 'blur(12px)'],
                        rotate: [0, 1, -1, 0],
                    }}
                    transition={{
                        duration: 2.3,
                        ease: [0.22, 1, 0.36, 1],
                        times: [0, 0.2, 0.6, 1],
                    }}
                    onAnimationComplete={onComplete}
                    style={{ position: 'relative' }}
                >
                    {children}

                    {particles.map(p => (
                        <motion.div
                            key={p.id}
                            style={{
                                position: 'absolute',
                                left: `${p.x}%`, top: `${p.y}%`,
                                width: p.size, height: p.size,
                                borderRadius: '50%', background: p.color,
                                boxShadow: '0 0 10px rgba(26, 58, 74, 0.8), 0 0 20px rgba(13, 27, 42, 0.5)',
                            }}
                            initial={{ opacity: 0, scale: 0, x: 0, y: 0 }}
                            animate={{
                                opacity: [0, 1, 0.9, 0],
                                scale: [0, 1.5, 1, 0],
                                x: Math.cos(p.angle * Math.PI / 180) * p.distance,
                                y: -p.distance * 0.7 + p.yOffset,
                            }}
                            transition={{ duration: p.duration, delay: p.delay, ease: ANIM_EASING }}
                        />
                    ))}

                    {sandParticles.map(s => (
                        <motion.div
                            key={`sand-${s.id}`}
                            style={{
                                position: 'absolute',
                                left: `${s.x}%`, top: `${s.y}%`,
                                width: s.width, height: s.height,
                                background: s.color, borderRadius: 2,
                                boxShadow: '0 0 8px rgba(26, 58, 74, 0.6)',
                            }}
                            initial={{ opacity: 0, y: 0, scale: 1, rotate: 0 }}
                            animate={{
                                opacity: [0, 0.95, 0.8, 0],
                                y: [0, s.yOffset],
                                scale: [1, 0.5, 0.2, 0],
                                x: s.xOffset, rotate: s.rotation,
                            }}
                            transition={{ duration: s.duration, delay: s.delay, ease: 'easeOut' }}
                        />
                    ))}
                </motion.div>
            )}
        </AnimatePresence>
    );
};

// ==========================================
// 💥 动画 2：卡牌碎裂（法术弃牌）
// 触发时机：暗箱交易等法术效果导致手牌被弃置
// 效果：裂纹显现 + 闪光 + 20 不规则碎片飞散
// ==========================================
const CardShatterContent: React.FC<{
    children: React.ReactNode;
    shards: Shard[];
    onComplete?: () => void;
    delay?: number;
    startVisible?: boolean;
}> = React.memo(({ children, shards, onComplete, delay = 0, startVisible = true }) => (
    <>
        <motion.div
            initial={{ opacity: startVisible ? 1 : 0, scale: startVisible ? 1 : 0 }}
            animate={{
                opacity: startVisible ? [1, 0.4, 0] : [0, 1, 0.4, 0],
                scale: startVisible ? [1, 1.08, 0.85] : [0, 1, 1.08, 0.85],
            }}
            transition={{ duration: 0.45, delay, ease: 'easeOut' }}
            onAnimationComplete={onComplete}
            style={{ position: 'relative' }}
        >
            {children}

            <motion.div
                style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
                initial={{ opacity: 0 }}
                animate={{ opacity: [0, 1, 0.9, 0] }}
                transition={{ duration: 0.4, delay }}
            >
                <CrackSVG />
            </motion.div>
        </motion.div>

        <FlashEffect delay={delay} />

        {shards.map(shard => (
            <motion.div
                key={shard.id}
                style={{
                    position: 'absolute',
                    left: `${shard.x}%`, top: `${shard.y}%`,
                    width: shard.width, height: shard.height,
                    background: shard.color, borderRadius: shard.isLarge ? 3 : 2,
                    clipPath: shard.clipPath,
                    boxShadow: shard.isLarge
                        ? '0 4px 12px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.2)'
                        : '0 2px 6px rgba(0,0,0,0.4)',
                }}
                initial={{ opacity: 0 }}
                animate={{
                    opacity: [0, 1, 0.95, 0.8, 0],
                    x: [0, Math.cos(shard.angle * Math.PI / 180) * shard.distance],
                    y: [0, Math.sin(shard.angle * Math.PI / 180) * shard.distance + shard.gravity * 100],
                    rotate: [0, shard.rotation],
                    scale: [1, shard.isLarge ? 0.9 : 0.8, 0.1],
                }}
                transition={{
                    duration: shard.isLarge ? 1.1 : 0.85,
                    delay: shard.delay,
                    ease: ANIM_EASING,
                }}
            />
        ))}
    </>
));
CardShatterContent.displayName = 'CardShatterContent';

export const CardShatter: React.FC<CardAnimProps> = ({
    card, isPlaying, onComplete, children
}) => {
    const shards = useMemo(() => generateShards(20), []);

    return (
        <div style={{ position: 'relative' }}>
            <AnimatePresence>
                {isPlaying && (
                    <CardShatterContent
                        children={children}
                        shards={shards}
                        onComplete={onComplete}
                    />
                )}
            </AnimatePresence>
        </div>
    );
};

// ──────────────────────────────────────────────
// 🎬 全局抽卡动画剧场 (The Central Draw Theater)
// 事件驱动三态机：fly_to_center → idle → (fade_out | shatter)
// ──────────────────────────────────────────────

/** 抽卡动画条目内部状态 */
type DrawItemPhase = 'fly' | 'idle' | 'fly_to_hand' | 'shatter' | 'done';

interface DrawAnimState {
    animId: string;
    card: CardData;
    owner: 'player' | 'enemy';
    skipHandAdd?: boolean; // [2026-07-06] 法术抽卡：卡已在手牌中，动画层不再重复加入
    skipDeckAnim?: boolean; // [2026-07-09] 生成动画：跳过牌库飞中央，直接从中央展示开始
}

/** 单个抽卡动画条目 — 三态机 */
const DrawAnimItem = ({ anim, cardBackUrl, skinOverrides }: { anim: DrawAnimState; cardBackUrl?: string; skinOverrides?: Record<string, number> }) => {
    const isPlayer = anim.owner === 'player';
    const deckX = '-35vw';
    const deckY = isPlayer ? '35vh' : '-35vh';

    // === 三态机 ===
    const startPhase = anim.skipDeckAnim ? 'idle' : 'fly';
    const [phase, setPhase] = useState<DrawItemPhase>(startPhase);

    // [翻面] 我方抽卡：400ms 时从卡背→卡面（只在 fly 阶段启动，避免 shatter 时被中断）
    const [showFace, setShowFace] = useState(!!anim.skipDeckAnim);
    useEffect(() => {
        if (!isPlayer || phase !== 'fly') return;
        const t = setTimeout(() => setShowFace(true), 400);
        return () => clearTimeout(t);
    }, [isPlayer, phase]);

    // [2026-07-09 生成] 跳过牌库动画时：先通知逻辑层到中央（加牌），再展示后飞入手中
    useEffect(() => {
        if (!anim.skipDeckAnim || phase !== 'idle') return;
        // 通知逻辑层：卡牌已到中央（将卡加入手牌）
        eventBus.emit(GameEvents.DRAW_AT_CENTER, {
            animId: anim.animId,
            card: anim.card,
            owner: anim.owner,
            skipHandAdd: anim.skipHandAdd,
        });
        // 展示 900ms 后自动飞入手牌
        const t = setTimeout(() => {
            eventBus.emit(GameEvents.DRAW_FLY_TO_HAND, { animId: anim.animId });
        }, 900);
        return () => clearTimeout(t);
    }, [anim.skipDeckAnim, anim.animId, anim.card, anim.owner, anim.skipHandAdd, phase]);

    // ★ 用 ref 跟踪最新 phase + 回调，解决闭包过期问题
    const phaseRef = useRef(phase);
    phaseRef.current = phase;
    const completedRef = useRef(false);

    // Phase 1 到达中央 → 通知逻辑层
    const onArriveCenter = useCallback(() => {
        setPhase('idle');
        eventBus.emit(GameEvents.DRAW_AT_CENTER, {
            animId: anim.animId,
            card: anim.card,
            owner: anim.owner,
            skipHandAdd: anim.skipHandAdd, // [2026-07-06] 透传标记，防止 onAtCenter 重复加牌
        });
    }, [anim]);

    // ★ [修复] 监听器从组件挂载时就注册，不依赖 phase
    // 避免 setPhase 异步 + emit 同步之间的事件丢失
    useEffect(() => {
        const onFlyToHand = (p: any) => {
            if (p.animId !== anim.animId) return;
            // overlay 直接完成，触发 DRAW_COMPLETE → onDrawComplete 加入手牌 → isNew 弹入
            eventBus.emit(GameEvents.DRAW_COMPLETE, {
                animId: anim.animId,
                card: anim.card,
                owner: anim.owner,
                isBurn: false,
            });
            setPhase('done');
        };
        const onShatter = (p: any) => {
            if (p.animId === anim.animId) setPhase('shatter');
        };

        eventBus.on(GameEvents.DRAW_FLY_TO_HAND, onFlyToHand);
        eventBus.on(GameEvents.DRAW_CENTER_SHATTER, onShatter);

        return () => {
            eventBus.off(GameEvents.DRAW_FLY_TO_HAND, onFlyToHand);
            eventBus.off(GameEvents.DRAW_CENTER_SHATTER, onShatter);
        };
    }, [anim.animId]); // ← 只依赖 animId，不依赖 phase

    // Phase 3 播完 → 通知逻辑层
    const onFinalComplete = useCallback(() => {
        const isBurn = phaseRef.current === 'shatter';
        eventBus.emit(GameEvents.DRAW_COMPLETE, {
            animId: anim.animId,
            card: anim.card,
            owner: anim.owner,
            isBurn,
        });
        requestAnimationFrame(() => setPhase('done'));
    }, [anim]);

    // === 爆牌碎片（仅在 shatter 时使用）===
    const shards = useMemo(() => generateShards(22, 0), []);

    // === [修复] 根据 phase 构建 animate 目标 ===
    // fly 阶段的 scaleX 用数组关键帧 [1,0,1]，恢复伪3D翻面效果
    const animTarget = useMemo(() => {
        switch (phase) {
            case 'fly':
                return {
                    x: [deckX, 0],
                    y: [deckY, 0],
                    scale: [0.3, 1.5],
                    rotate: [isPlayer ? -15 : 15, 0],
                    opacity: [0, 1],
                    scaleX: isPlayer ? [1, 0, 1, 1] : undefined,
                };
            case 'idle':
                return { x: 0, y: 0, scale: 1.5, opacity: 1 };
            case 'fly_to_hand':
                return {
                    x: [0, 0],
                    y: [0, isPlayer ? '65vh' : '-65vh'],
                    scale: [1.5, 0.35],
                    opacity: [1, 0],
                };
            case 'shatter':
                return {
                    x: 0, y: 0,
                    scale: [1.5, 0.5, 0.1],
                    opacity: [1, 0.8, 0],
                    rotate: [0, 15, -30],
                    scaleX: 1,  // 显式声明，防止 Framer Motion 因 scaleX 失踪而崩溃
                };
            default:
                return { opacity: 0 };
        }
    }, [phase, isPlayer, deckX, deckY]);

    const animTransition = useMemo(() => {
        switch (phase) {
            case 'fly':
                return {
                    duration: 0.8,
                    ease: [0.25, 0.46, 0.45, 0.94],
                    // scaleX 4个关键帧 [1,0,1,1]，用时序 [0,0.5,0.75,1] 做翻面
                    scaleX: isPlayer ? { duration: 0.8, times: [0, 0.5, 0.75, 1] } : undefined,
                };
            case 'idle':
                return { duration: 0 };
            case 'fly_to_hand':
                return { duration: 0.4, ease: [0.4, 0, 0.2, 1] };
            case 'shatter':
                return { duration: 0.5, ease: 'easeOut', times: [0, 0.4, 1] };
            default:
                return { duration: 0 };
        }
    }, [phase, isPlayer]);

    // ★ [修复] 用 ref 读取最新 phase，防止闭包过期 + 防止重复调用
    const handleAnimComplete = useCallback(() => {
        if (completedRef.current) return;
        completedRef.current = true;

        const p = phaseRef.current;
        if (p === 'fly') {
            onArriveCenter();
        } else if (p !== 'idle' && p !== 'done') {
            onFinalComplete();
        }
    }, [onArriveCenter, onFinalComplete]);

    // ★ 重置 completedRef（phase 变化时允许新的回调）
    useEffect(() => {
        completedRef.current = false;
    }, [phase]);

    if (phase === 'done') return null;

    return (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-[999]">
            {/* 飞行载体 — 利用 framer-motion 同元素位置插值实现无缝过渡 */}
            <motion.div
                initial={{
                    x: deckX, y: deckY,
                    scale: 0.3, opacity: 0,
                    rotate: isPlayer ? -15 : 15,
                    scaleX: isPlayer ? 1 : undefined,
                }}
                animate={animTarget}
                transition={animTransition}
                onAnimationComplete={handleAnimComplete}
                className="absolute"
                style={{
                    // [核心修复] 移除丑陋的 brightness(0.35) 压暗黑魔法。
                    // 统一使用黑白褪色表达生命流逝，绝对的对比度交由 CrackSVG 自身的白炽发光去扛！
                    filter: phase === 'shatter' ? 'grayscale(1)' : 'grayscale(0)',
                    transition: 'filter 0.2s ease-out',
                }}
            >
                {/* 敌方卡牌旋转180° */}
                <div style={{ transform: !isPlayer ? 'rotate(180deg)' : 'none' }}>
                    <Card
                        data={anim.card}
                        location="preview"
                        isFaceUp={showFace}
                        cardBackUrl={showFace ? undefined : cardBackUrl}
                        skinId={skinOverrides?.[anim.card.key] || 0}
                    />
                </div>

                {/* 爆牌碎裂效果 */}
                {phase === 'shatter' && (
                    <>
                        <motion.div
                            style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: [0, 1, 0.9, 0] }}
                            transition={{ duration: 0.3 }}
                        >
                            <CrackSVG />
                        </motion.div>
                        <FlashEffect delay={0} />
                    </>
                )}
            </motion.div>

            {/* 爆牌碎片 — shatter 时显示 */}
            {phase === 'shatter' && shards.map(shard => (
                <motion.div
                    key={shard.id}
                    style={{
                        position: 'absolute',
                        left: `calc(50% - 10px)`, top: `calc(50% - 15px)`,
                        width: shard.width, height: shard.height,
                        background: shard.color, borderRadius: shard.isLarge ? 3 : 2,
                        clipPath: shard.clipPath,
                        boxShadow: shard.isLarge ? '0 4px 12px rgba(0,0,0,0.5)' : '0 2px 6px rgba(0,0,0,0.4)',
                    }}
                    initial={{ opacity: 0, x: 0, y: 0, scale: 0 }}
                    animate={{
                        opacity: [0, 1, 0.95, 0],
                        x: [0, Math.cos(shard.angle * Math.PI / 180) * shard.distance],
                        y: [0, Math.sin(shard.angle * Math.PI / 180) * shard.distance + shard.gravity * 100],
                        rotate: [0, shard.rotation],
                        scale: [0, 1, shard.isLarge ? 0.9 : 0.8, 0.1],
                    }}
                    transition={{ duration: shard.isLarge ? 1.1 : 0.85, delay: shard.delay, ease: ANIM_EASING }}
                />
            ))}
        </div>
    );
};

/** 抽卡动画覆盖层 — 监听 DRAW_START 事件创建条目 */
export const DrawAnimOverlay: React.FC<{ cardBackUrl?: string; skinOverrides?: Record<string, number> }> = ({ cardBackUrl, skinOverrides }) => {
    const [anims, setAnims] = useState<DrawAnimState[]>([]);

    useEffect(() => {
        const onStart = (payload: { animId: string; card: CardData; owner: 'player' | 'enemy'; skipHandAdd?: boolean }) => {
            setAnims(prev => [...prev, { animId: payload.animId, card: payload.card, owner: payload.owner, skipHandAdd: payload.skipHandAdd }]);
        };

        const onComplete = (payload: { animId: string }) => {
            // 动画播完 200ms 后清理 DOM，留 buffer 让 React 处理完手牌更新
            setTimeout(() => {
                setAnims(prev => prev.filter(a => a.animId !== payload.animId));
            }, 200);
        };

        eventBus.on(GameEvents.DRAW_START, onStart);
        eventBus.on(GameEvents.DRAW_COMPLETE, onComplete);

        return () => {
            eventBus.off(GameEvents.DRAW_START, onStart);
            eventBus.off(GameEvents.DRAW_COMPLETE, onComplete);
        };
    }, []);

    return (
        <AnimatePresence>
            {anims.map(anim => (
                <DrawAnimItem key={anim.animId} anim={anim} cardBackUrl={cardBackUrl} skinOverrides={skinOverrides} />
            ))}
        </AnimatePresence>
    );
};

// ──────────────────────────────────────────────
// 🎬 手牌遗弃动画控制器 (The Hand Discard Theater)
// ──────────────────────────────────────────────
type AnimType = 'dissolve' | 'shatter';

interface AnimState {
    type: AnimType;
    card: CardData;
}

export const HandAnimOverlay: React.FC = () => {
    const [anim, setAnim] = useState<AnimState | null>(null);

    useEffect(() => {
        // [2026-07-22 莉莉子] 仅处理替换打出的 unit_eliminated（备战席单位替换碎裂）
        // dissolve 和 hand_spell_discard 已移到手牌卡片原位播放
        const onEliminated = (p: { card: CardData }) => setAnim({ type: 'shatter', card: p.card });

        eventBus.on('unit_eliminated', onEliminated);

        return () => {
            eventBus.off('unit_eliminated', onEliminated);
        };
    }, []);

    const handleComplete = () => setAnim(null);

    if (!anim) return null;

    return (
        <div className="fixed inset-0 z-[999] pointer-events-none flex items-end justify-center pb-[18vh]">
            {anim.type === 'dissolve' && (
                <EphemeralDissolve key="dissolve" card={anim.card} isPlaying onComplete={handleComplete}>
                    <Card data={anim.card} location="preview" />
                </EphemeralDissolve>
            )}
            {anim.type === 'shatter' && (
                <CardShatter key="shatter" card={anim.card} isPlaying onComplete={handleComplete}>
                    <Card data={anim.card} location="preview" />
                </CardShatter>
            )}
        </div>
    );
};

// --- 组件: 校准面板 (Calibrate Panel) ---
interface CalibratePanelProps {
    cards: { card: CardData; originalIndex: number }[];
    onConfirm: (selectedCardId?: string) => void;
    onViewArt?: (card: CardData) => void;
    isHidden?: boolean;       // [2026-07-18] AI校准：玩家看不到卡面，仅显示卡背
    cardBackUrl?: string;     // [2026-07-18] 卡背图片URL（isHidden 时使用）
}

export const CalibratePanel: React.FC<CalibratePanelProps> = ({
    cards,
    onConfirm,
    onViewArt,
    isHidden = false,
    cardBackUrl
}) => {
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [animPhase, setAnimPhase] = useState<'enter' | 'select' | 'exit'>('enter');

    // 入场动画
    useEffect(() => {
        const timer = setTimeout(() => setAnimPhase('select'), 600);
        return () => clearTimeout(timer);
    }, []);

    // [2026-07-18] AI校准：自动选择 + 自动确认（带延迟，让玩家看到流程）
    useEffect(() => {
        if (!isHidden || animPhase !== 'select') return;

        const selectTimer = setTimeout(() => {
            // 随机选一张
            const randomIdx = Math.floor(Math.random() * cards.length);
            const pickedId = cards[randomIdx].card.id;
            setSelectedId(pickedId);

            // 再等一会自动确认
            const confirmTimer = setTimeout(() => {
                setAnimPhase('exit');
                setTimeout(() => onConfirm(pickedId), 500);
            }, 800);

            return () => clearTimeout(confirmTimer);
        }, 1500);

        return () => clearTimeout(selectTimer);
    }, [isHidden, animPhase, cards, onConfirm]);

    // 退出动画
    const handleConfirm = () => {
        setAnimPhase('exit');
        setTimeout(() => onConfirm(selectedId || undefined), 500);
    };

    const toggleSelect = (cardId: string) => {
        if (animPhase !== 'select') return;
        if (isHidden) return; // AI校准中，玩家不可交互
        setSelectedId(prev => prev === cardId ? null : cardId);
    };

    return (
        <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center">
            {/* 全屏点击拦截层 - 阻止点击穿透到游戏内按钮 */}
            <div className="absolute inset-0 bg-black/60 pointer-events-auto" onClick={(e) => e.stopPropagation()} />
            {/* 标题 */}
            {animPhase === 'select' && (
                <motion.div
                    initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}
                    className="absolute top-[18%] left-0 right-0 w-full text-center pointer-events-auto"
                >
                    <h2 className="text-5xl font-black text-white drop-shadow-[0_5px_15px_rgba(0,0,0,0.8)] tracking-widest">选择卡牌</h2>
                    <p className="text-yellow-300 mt-2 font-mono text-lg tracking-[0.2em] opacity-80">CALIBRATE — SELECT A CARD TO PUT ON TOP</p>
                </motion.div>
            )}

            {/* 卡牌区域 */}
            <div className="relative flex items-center justify-center pointer-events-auto" style={{ marginTop: '8vh' }}>
                <div className="flex gap-6">
                    <AnimatePresence>
                        {cards.map(({ card }, index) => {
                            const isSelected = selectedId === card.id;
                            const angle = (index - 1.5) * 4;

                            const variants: Variants = {
                                enter: {
                                    x: 0, y: 60, scale: 0.4, rotate: angle, opacity: 0,
                                    transition: { delay: index * 0.1, duration: 0.6, type: 'spring', damping: 18 }
                                },
                                select: {
                                    x: 0, y: isSelected ? -50 : 0,
                                    scale: isSelected ? 1.0 : 0.85,
                                    rotate: isSelected ? 0 : angle,
                                    opacity: 1,
                                    transition: { type: 'spring', stiffness: 300 }
                                },
                                exit: {
                                    x: 0, y: 80, scale: 0.3, opacity: 0, rotate: angle * 2,
                                    transition: { duration: 0.5, ease: "easeInOut", delay: index * 0.06 }
                                }
                            };

                            return (
                                <motion.div
                                    key={card.id}
                                    className="relative flex flex-col items-center cursor-pointer"
                                    variants={variants}
                                    initial="enter"
                                    animate={animPhase}
                                    exit="exit"
                                    onClick={() => toggleSelect(card.id)}
                                >
                                    {/* 选中光晕 */}
                                    {isSelected && animPhase === 'select' && (
                                        <motion.div
                                            layoutId="calibrate-glow"
                                            className="absolute -inset-2 rounded-xl border-4 border-yellow-400 shadow-[0_0_25px_#eab308] z-0"
                                        />
                                    )}
                                    <div className="relative z-10 scale-110 origin-bottom">
                                        <Card data={card} location="preview" isFaceUp={!isHidden} cardBackUrl={isHidden ? cardBackUrl : undefined} onViewArt={onViewArt} />
                                    </div>

                                    {/* 选择/取消按钮 */}
                                    {animPhase === 'select' && (
                                        <motion.button
                                            initial={{ opacity: 0, y: -5 }}
                                            animate={{ opacity: 1, y: 10 }}
                                            onClick={(e) => { e.stopPropagation(); toggleSelect(card.id); }}
                                            className={`absolute bottom-[-55px]  z-20 flex items-center gap-2 px-5 py-2 rounded-full font-bold text-sm shadow-xl whitespace-nowrap transition-colors
                                                ${isSelected
                                                    ? 'bg-gray-700 text-gray-300 border border-yellow-500 hover:bg-gray-600'
                                                    : 'bg-blue-600 text-white ring-2 ring-blue-400 hover:bg-blue-500'
                                                }`}
                                        >
                                            {isSelected ? <><Check size={14} /> 取消</> : <><Crosshair size={14} /> 选择</>}
                                        </motion.button>
                                    )}
                                </motion.div>
                            );
                        })}
                    </AnimatePresence>
                </div>
            </div>

            {/* 确定按钮 */}
            {animPhase === 'select' && (
                <motion.button
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    onClick={(e) => { e.stopPropagation(); handleConfirm(); }}
                    className="absolute bottom-[10%]  -translate-x-1/2 z-30 px-10 py-3 rounded-full font-bold text-lg shadow-xl
                        bg-blue-600 hover:bg-blue-500 border border-blue-400 text-white
                        shadow-[0_0_30px_rgba(37,99,235,0.5)] transition-colors pointer-events-auto"
                >
                    确定
                </motion.button>
            )}
        </div>
    );
};
