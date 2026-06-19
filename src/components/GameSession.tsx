import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Clock, Home } from 'lucide-react';
import type { CardData } from '../types';
import { Card } from './Card';
import { SmartNexus, Deck } from './GameUI';
import { FullArtOverlay, LevelUpOverlay, GameOverScreen } from './Overlays';
import { useGameState } from '../hooks/useGameState';
import { useAI } from '../hooks/useAI';
import { evaluateChoiceCondition, canAffordCard } from '../utils/gameRules';
import { Battlefield } from './Battlefield';
import { CARD_DB } from '../data/cards';
import { eventBus, GameEvents } from '../utils/eventBus';
import { useVoice } from '../hooks/useVoice';
import { UI_IMAGES, PERSONALIZATION_ASSETS, getSkinImage } from '../data/imageData';
import { ManaGemSystem } from './ManaGemSystem';
import { calculateNewMana } from '../utils/gameRules';
import { getCardBackUrl} from '../utils/styleUtils';
// [修改] 引用新的 Hook
import { PlayerHand, OpeningMulligan } from './CardAnimations';
import { GameAnnouncement } from './GameAnnouncement';
import { useGameAnnouncer } from '../hooks/useGameAnnouncer';
import { useSpellSystem } from '../hooks/useSpellSystem'; // [新增]
import { useGameButton } from '../hooks/useGameButton'; // [新增]
import { useMulligan } from '../hooks/useMulligan';
import { useCursor } from '../hooks/useCursor'; // [新增] 引入全局指针控制器
import { useUserSystem } from '../hooks/useUserSystem'; // [核心新增] 引入用户系统以读取当前卡组皮肤
import { EFFECT_DB } from '../data/effectRegistry';
import { VFXLayer } from './VFXLayer'; // [新增]
// [新增] 法术弹道特效
import SpellProjectile from './SpellProjectile';
import { SpellImpactLayer } from './SpellImpactLayer'; // [核心新增] 引入独立的受击特效兵工厂
// [新增] 法术弹道事件
// [新增] 悬停预览统一方案
import { useCardGaze } from '../hooks/useCardGaze';
import { FloatingCardPreview } from './FloatingCardPreview';
import { AnimatePresence, motion } from 'framer-motion'; // [新增] 确保引入了 framer-motion 用于施法UI动画
import type { EnemyHeroConfig } from '../types/gameModeTypes'; // [新增] 引入类型
import { AttackToken } from './AttackToken';
import { DragGhostCard } from './DragGhostCard'; // [新增] 备战席替身拖拽


// [修正] 专用的 Mana 计数动画 Hook (Drain -> Fill 模式)
const useManaTicker = (target: number, round: number) => {
    const [display, setDisplay] = useState(target);
    const [prevRound, setPrevRound] = useState(round);
    // 使用 Ref 标记动画状态，防止普通数值更新打断回合动画
    const isAnimating = React.useRef(false);

    useEffect(() => {
        // 场景 1: 回合更替 (触发 消耗->充能 序列动画)
        if (round > prevRound) {
            setPrevRound(round);
            isAnimating.current = true;

            // 定义异步动画序列
            const playSequence = async () => {
                // A. 消耗阶段 (Drain): 从当前值一个个减到 0
                // 利用闭包中的 display 作为起始值 (即上一回合剩余的法力)
                let current = display;
                while (current > 0) {
                    await new Promise(r => setTimeout(r, 150)); // 消耗速度：0.15s/个
                    current--;
                    setDisplay(current);
                }

                // B. 停顿阶段: 展示空槽状态
                await new Promise(r => setTimeout(r, 200));

                // C. 充能阶段 (Fill): 从 0 一个个加到 target (新回合最大值)
                while (current < target) {
                    await new Promise(r => setTimeout(r, 200)); // 充能速度：0.2s/个
                    current++;
                    setDisplay(current);
                }

                isAnimating.current = false;
            };

            playSequence();
        }
        // 场景 2: 同一回合内的数值变化 (如打牌扣费)
        else {
            // 只有当不在播放回合动画时，才允许即时更新
            if (!isAnimating.current) {
                setDisplay(target);
            }
        }

    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [round, target]); // 注意：不依赖 display，防止循环触发

    return display;
};

interface GameSessionProps {
    deck: string[];
    onExit: () => void;
    playBgm: (type: 'title' | 'default' | 'battle' | 'victory' | 'defeat') => void;
    playLevelUpMovie: (heroKey: string, onEnd?: () => void) => void;
    prepareLevelUpMovie?: (heroKey: string) => void; // [新增]
    playVictoryMovie: (heroKeys: string[], onEnd?: () => void) => void;
    prepareVictoryMovie?: (heroKeys: string[]) => void; // [新增]
    stopMovie: (immediate?: boolean) => void;
    deskIndex: number;
    cardBackIndex?: number;
    enemyDeck: string[];
    enemyHeroConfig?: EnemyHeroConfig;
    onVictory?: () => void;
    onDefeat?: () => void;
}

export const GameSession: React.FC<GameSessionProps> = ({
    deck, onExit, playBgm,
    playLevelUpMovie, prepareLevelUpMovie, playVictoryMovie, prepareVictoryMovie, stopMovie, // [修改] 提取预热方法
    deskIndex, cardBackIndex = 0,
    enemyDeck,
    enemyHeroConfig: _enemyHeroConfig,
    onVictory,
    onDefeat
}) => {

    const {
        game, setGame,
        playerHand, setPlayerHand, enemyHand, setEnemyHand,
        playerBench, setPlayerBench,
        enemyBench, setEnemyBench,
        combatField, setCombatField,
        actions,
        message, setMessage, winningHeroKeys,
        // 👇 新增：从useGameState解构初始卡组信息
        playerDeck,
        enemyDeckState, // ✅ 正确获取敌方牌库
        playerInitialDeckInfo,
        enemyInitialDeckInfo
    } = useGameState(deck, enemyDeck);

    // ==========================================
    // [新增] 统一升级系统：仲裁导演 (Animation Director)
    // 死盯 pendingLevelUps 队列。只要有人排队且大屏幕空闲，立刻接管屏幕！
    // ==========================================
    useEffect(() => {
        if (!game.levelUpCard && game.pendingLevelUps && game.pendingLevelUps.length > 0) {
            const nextHero = game.pendingLevelUps[0];
            setGame(prev => ({
                ...prev,
                phase: 'animating', // 霸道锁死底层舞台，禁止任何操作
                levelUpCard: nextHero // 触发全屏视频
            }));
        }
    }, [game.pendingLevelUps, game.levelUpCard, setGame]);

    // [新增] 使用 Mulligan Hook 接管换牌逻辑
    const mulligan = useMulligan({
        initialHand: playerHand,
        onReplace: async (indices) => {
            await actions.replaceOpeningHand(indices);
        },
        onComplete: () => {
            actions.requeueHandToDeck();

            // [核心修复] 动画播放完毕后，强行注入第一回合的进攻标识状态，防止其丢失
            setGame(prev => ({
                ...prev,
                attackToken: { player: 'normal', enemy: null }
            }));
        }
    });

    // [新增] 悬停卡牌状态与法力预览计算
    const [hoveredCard, setHoveredCard] = useState<CardData | null>(null);

    const currentCardBackUrl = getCardBackUrl(cardBackIndex);

    const isMulliganPhase = mulligan.isActive;

    // [新增] 移动到这里：控制开局动画显示时机
    const [showMulliganUI, setShowMulliganUI] = useState(false);

    useEffect(() => {
        const timer = setTimeout(() => setShowMulliganUI(true), 1500);
        return () => clearTimeout(timer);
    }, []);

    // [修改] 挂载信息播报 Hook (传入 isMulliganPhase)
    const announcement = useGameAnnouncer({
        game,
        drawCards: (count) => {
            actions.drawCards(count, 'player');
            actions.drawCards(count, 'enemy');
        },
        isMulliganPhase // 关键参数
    });
    const spellSystem = useSpellSystem({
        onComplete: (card, targets) => {
            // 当目标选择完成后，调用游戏状态的 finalizeSpell
            actions.finalizeSpell(card, 'player', targets);
        }
    });
    const finalAnnouncement = announcement;

    // [核心新增] 提取玩家当前激活卡组的皮肤配置字典！
    const userSystem = useUserSystem();
    const skinOverrides = userSystem.activeDeck?.skinOverrides || {};

    // [新增] 状态同步枢纽：监听底层大脑的施法请求，自动唤醒前台 UI 的瞄准射线！
    useEffect(() => {
        // 1. 如果底层要求选目标，且前台还没开始瞄准
        if (game.spellCasting && game.spellCasting.step !== 'choose_mode' && !spellSystem.isCasting) {
            // 这张法术可能在 activeCard 里 (英雄法术变身而来)，也可能在手牌里
            const targetCard = game.activeCard || playerHand.find(c => c.id === game.spellCasting!.cardId);
            if (targetCard) {
                spellSystem.startCasting(targetCard);
            }
        }
        // 2. 如果底层清除了施法状态，前台也要同步关闭 (如发生异常撤销)
        else if (!game.spellCasting && spellSystem.isCasting) {
            spellSystem.cancelCasting();
        }
    }, [game.spellCasting, spellSystem.isCasting, game.activeCard, playerHand]);

    let previewManaCost = 0;
    let previewSpellManaCost = 0;
    let isHoveringPlayableUnit = false; // [新增] 预判手牌单位是否可部署

    if (hoveredCard && game.phase === 'main' && game.turnOwner === 'player') {
        const cost = hoveredCard.cost;
        const currentMana = game.playerMana;
        const currentSpellMana = game.playerSpellMana;
        const isUnit = hoveredCard.type.includes('unit');

        const { newMana, newSpellMana } = calculateNewMana(cost, currentMana, currentSpellMana, isUnit);

        previewManaCost = currentMana - newMana;
        previewSpellManaCost = currentSpellMana - newSpellMana;

        // [新增] 如果是单位牌、法力值足够、且备战席未满，则触发部署预示
        if (isUnit && canAffordCard(hoveredCard, game.playerMana, game.playerSpellMana) && playerBench.length < 6) {
            isHoveringPlayableUnit = true;
        }
    }

    // [保留] 使用动画 Hook 获取显示的数值 (如果您想保留数字显示作为辅助)
    const displayPlayerMana = useManaTicker(game.playerMana, game.round);
    const displayEnemyMana = useManaTicker(game.enemyMana, game.round);
    const displayPlayerSpellMana = useManaTicker(game.playerSpellMana, game.round);
    const displayEnemySpellMana = useManaTicker(game.enemySpellMana, game.round);

    useAI({
        game,
        enemyHand,
        enemyBench,
        playerBench,
        combatField,
        setMessage,
        actions: { ...actions, setGame, setEnemyHand, setEnemyBench, setCombatField }
    });

    // 获取当前选中的卡背图片
    const currentCardBack = PERSONALIZATION_ASSETS.cardBacks[cardBackIndex];
    const { speakingCardId } = useVoice({ playerBench });
    // [核心新增] 施法中心物理锚点，用于跨组件穿透 ScaleWrapper 的缩放结界
    const spellCenterRef = useRef<HTMLDivElement>(null);

    // ═══════════════════════════════════════════════
    // 备战席替身拖拽系统（单卡版）
    // ═══════════════════════════════════════════════

    /** 🔧 程调这个！拖拽时 GhostCard 的缩放比 */
    const GHOST_CARD_SCALE = 1.5;
    /** 🔧 程调这个！向上拖动多少像素算"拖入战场"（Y 轴阈值） */
    const BENCH_DRAG_THRESHOLD = 120;
    /** 🔧 程调这个！战场拖拽时 GhostCard 的缩放比 */
    const COMBAT_GHOST_SCALE = 1;

    const [ghostState, setGhostState] = useState<{
        cards: CardData[];
        x: number;
        y: number;
        scale?: number;
        w?: number;
        h?: number;
        location?: 'hand' | 'bench' | 'combat';
    } | null>(null);
    const dragCardIdRef = useRef<string | null>(null);          // 主拖拽卡（第一张抓起的那张）
    const dragGroupRef = useRef<string[]>([]);                  // [多卡] 拖拽组内所有卡 ID
    const hiddenCardElsRef = useRef<Map<string, HTMLElement>>(new Map()); // [多卡] 被隐藏的原卡 DOM 映射
    const hiddenCardElRef = useRef<HTMLElement | null>(null);   // [兼容] 主拖拽卡的原卡 DOM
    const dragActivatedRef = useRef(false);
    const dragJustFinishedRef = useRef(false);
    const dragStartRef = useRef({ x: 0, y: 0, ox: 0, oy: 0 });
    const combatDragSlotRef = useRef<number | null>(null);
    const combatDragRoleRef = useRef<'attacker' | 'blocker' | null>(null);

    const { setCursor } = useCursor(); // [新增] 挂载全局指针遥控器

    // [新增] 统一悬停预览（备战席 & 战场 800ms 长凝视）
    const { gazeTarget, gazeCard, bindGazeEvents } = useCardGaze({
        delay: 800,
        isDragging: ghostState !== null,
        isCasting: spellSystem.isCasting,
    });

    // [新增] 拖拽预瞄准系统 (Drag Preview System) 状态
    const [dragPreviewSlots, setDragPreviewSlots] = useState<number[]>([]); // 记录被高亮的格挡槽位
    const [previewAttackerCount, setPreviewAttackerCount] = useState<number>(0); // 记录即将冲锋的进攻者数量
    const [isDraggingToBench, setIsDraggingToBench] = useState<boolean>(false); // 记录是否正在撤回备战席

    // 稳定的 ref 副本，供异步事件处理器读取最新状态
    const gameRef = useRef(game);
    gameRef.current = game;
    const benchRef = useRef(playerBench);
    benchRef.current = playerBench;
    const combatFieldRef = useRef(combatField);
    combatFieldRef.current = combatField;
    const msgRef = useRef(setMessage);
    msgRef.current = setMessage;

    // ==========================================
    // [新增] 全局鼠标状态调度器 (The Cursor Director)
    // ==========================================
    useEffect(() => {
        // 如果正在拖拽，指针状态交由物理拖拽引擎(onMove)直接超频控制，这里不予干涉
        if (ghostState !== null) return;

        // 判定：当前是否是对方的行动回合 (AI思考中)
        const isAITurn = game.turnOwner === 'enemy' && game.phase === 'main';
        // 判定：游戏处于播放全屏动画、结算界面、或AI正在思考时，视为系统繁忙
        const isSystemBusy = game.phase === 'animating' || game.gameResult !== null || isAITurn;

        if (isSystemBusy) {
            setCursor('BUSY');       // 亮起等待轮盘
        } else if (spellSystem.isCasting) {
            setCursor('TARGET');     // 亮起瞄准准星
        } else {
            setCursor(null);         // 恢复空状态，交由 index.css 里的悬停规则(HOVER)接管
        }

        // 组件卸载时安全清理
        return () => setCursor(null);
    }, [game.phase, game.turnOwner, game.gameResult, spellSystem.isCasting, ghostState, setCursor]);

    /** 备战席 pointerDown 入口（事件委托） */
    const onBenchPointerDown = (e: React.PointerEvent) => {
        const target = (e.target as HTMLElement).closest('[data-entity-id]') as HTMLElement | null;
        if (!target) return;
        const cardId = target.getAttribute('data-entity-id');
        const card = playerBench.find(c => c.id === cardId);
        if (!card) return;

        // 阶段检查：只允许在主阶段(有进攻标识)/进攻宣告/格挡宣告时拖拽
        const phase = game.phase;
        const isPlayerTurn = game.turnOwner === 'player';
        const hasAttackToken = game.attackToken.player !== null;
        if (phase === 'block_declare' && isPlayerTurn && card.keywords.includes('CantBlock')) {
            setMessage('该单位无法进行格挡！');
            return;
        }
        const canDrag =
            ((phase === 'main' && hasAttackToken) || phase === 'attack_declare') && isPlayerTurn ||
            (phase === 'block_declare' && isPlayerTurn);
        if (!canDrag) return;

        const rect = target.getBoundingClientRect();
        const offsetX = e.clientX - rect.left;
        const offsetY = e.clientY - rect.top;

        dragCardIdRef.current = cardId;
        dragGroupRef.current = [cardId]; // [多卡] 初始化拖拽组
        hiddenCardElsRef.current.clear(); // [多卡] 清空隐藏映射
        dragStartRef.current = { x: e.clientX, y: e.clientY, ox: offsetX, oy: offsetY };

        // 立即显示 GhostCard（多卡队列）
        setGhostState({ cards: [card], x: rect.left, y: rect.top, w: rect.width, h: rect.height, location: 'bench' });

        // ── 全局 pointer 监听 ──
        const onMove = (ev: PointerEvent) => {
            if (!dragCardIdRef.current) return;
            const dx = ev.clientX - dragStartRef.current.x;
            const dy = ev.clientY - dragStartRef.current.y;

            // 移动超过阈值 → 标记为"正在拖拽"，隐藏原卡
            if (!dragActivatedRef.current && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
                dragActivatedRef.current = true;
                const el = document.querySelector(
                    `[data-entity-id="${dragCardIdRef.current}"]`,
                ) as HTMLElement | null;
                if (el) {
                    hiddenCardElRef.current = el;
                    hiddenCardElsRef.current.set(dragCardIdRef.current, el); // [多卡] 同步记录
                    el.style.pointerEvents = 'none';
                    el.style.opacity = '0';
                }
            }

            // ═══════════════════════════════════════════════
            // [多卡] 扫过检测：指针位置下方是否有其他备战席卡牌？
            // ═══════════════════════════════════════════════
            if (dragActivatedRef.current) {
                // [新增] 拖拽预瞄雷达：实时计算发光槽位
                const dragUpDistance = dragStartRef.current.y - ev.clientY;
                const isDraggedToBattlefield = dragUpDistance > BENCH_DRAG_THRESHOLD;
                const p = gameRef.current.phase;
                const turn = gameRef.current.turnOwner;

                if (isDraggedToBattlefield && turn === 'player') {
                    // [新增] 动态指针：如果向上越过边界，主阶段/进攻阶段化为剑刃(ATTACK)，格挡阶段化为准星(TARGET)
                    setCursor(p === 'main' || p === 'attack_declare' ? 'ATTACK' : 'TARGET');

                    const numCards = dragGroupRef.current.length;
                    if (p === 'main' || p === 'attack_declare') {
                        setPreviewAttackerCount(numCards); // 预示生成几个进攻槽
                        setDragPreviewSlots([]);
                    } else if (p === 'block_declare') {
                        setPreviewAttackerCount(0);
                        let dropStartIndex = 0;
                        const elements = document.elementsFromPoint(ev.clientX, ev.clientY);
                        for (const el of elements) {
                            const dropZone = (el as HTMLElement).closest('[data-combat-index]');
                            if (dropZone) {
                                dropStartIndex = parseInt(dropZone.getAttribute('data-combat-index') || '0', 10);
                                break;
                            }
                        }
                        const previews: number[] = [];
                        const usedSlots = new Set<number>();
                        dragGroupRef.current.forEach(id => {
                            const c = benchRef.current.find(card => card.id === id);
                            if (!c) return;
                            let foundIdx = -1;
                            const totalSlots = combatFieldRef.current.length;
                            for (let offset = 0; offset < totalSlots; offset++) {
                                const checkIdx = (dropStartIndex + offset) % totalSlots;
                                const f = combatFieldRef.current[checkIdx];
                                if (f.blocker !== null || usedSlots.has(checkIdx)) continue;
                                if (f.attacker.keywords.includes('Elusive') && !c.keywords.includes('Elusive')) continue;
                                const cPower = (c.power || 0) + (c.buffs?.power || 0);
                                if (f.attacker.keywords.includes('Fearsome') && cPower < 3) continue;
                                foundIdx = checkIdx;
                                break;
                            }
                            if (foundIdx !== -1) {
                                usedSlots.add(foundIdx);
                                previews.push(foundIdx);
                                dropStartIndex = (foundIdx + 1) % totalSlots;
                            }
                        });
                        setDragPreviewSlots(previews); // 预示格挡目标发蓝光
                    }
                } else {
                    // [新增] 动态指针：如果还在备战席徘徊，显示紧握的手套(HAND_GRAB)
                    setCursor('HAND_GRAB');

                    setDragPreviewSlots([]);
                    setPreviewAttackerCount(0);
                }

                const elements = document.elementsFromPoint(ev.clientX, ev.clientY);
                for (const el of elements) {
                    const cardEl = (el as HTMLElement).closest('[data-entity-id]') as HTMLElement | null;
                    if (!cardEl) continue;
                    const entityId = cardEl.getAttribute('data-entity-id');
                    if (!entityId) continue;

                    // 跳过主拖拽卡和已在组里的卡
                    if (entityId === dragCardIdRef.current) continue;
                    if (dragGroupRef.current.includes(entityId)) continue;

                    // 确认是己方备战席卡牌
                    const card = benchRef.current.find(c => c.id === entityId);
                    if (!card) continue;

                    // 阶段有效性检查（与 onBenchPointerDown 入口一致）
                    const p = gameRef.current.phase;
                    const isPlayerTurn = gameRef.current.turnOwner === 'player';
                    const hasAttackToken = gameRef.current.attackToken.player !== null;
                    const canAdd =
                        ((p === 'main' && hasAttackToken) || p === 'attack_declare') && isPlayerTurn ||
                        (p === 'block_declare' && isPlayerTurn && !card.keywords.includes('CantBlock'));

                    if (!canAdd) continue;

                    // ← 扫到了！加入拖拽组
                    dragGroupRef.current.push(entityId);
                    cardEl.style.pointerEvents = 'none';
                    cardEl.style.opacity = '0';
                    hiddenCardElsRef.current.set(entityId, cardEl);

                    // 更新 Ghost 多卡列表
                    setGhostState(prev => {
                        if (!prev) return null;
                        const newCards = [...prev.cards, card];
                        return { ...prev, cards: newCards };
                    });

                    break; // 单次事件只加一张，pointermove 频率够快
                }
            }

            // 持续更新 Ghost 位置
            setGhostState(prev =>
                prev
                    ? {
                          ...prev,
                          x: ev.clientX - dragStartRef.current.ox,
                          y: ev.clientY - dragStartRef.current.oy,
                      }
                    : null,
            );
        };

        const onUp = (ev: PointerEvent) => {
            document.removeEventListener('pointermove', onMove);
            document.removeEventListener('pointerup', onUp);
            document.removeEventListener('pointercancel', onUp);

            const wasDragging = dragActivatedRef.current;
            dragJustFinishedRef.current = wasDragging;

            if (wasDragging) {
                const p = gameRef.current.phase;
                const turn = gameRef.current.turnOwner;
                const dragUpDistance = dragStartRef.current.y - ev.clientY;
                const isDraggedToBattlefield = dragUpDistance > BENCH_DRAG_THRESHOLD;

                if (isDraggedToBattlefield && turn === 'player') {
                    // [多卡] 收集拖拽组内所有有效卡牌
                    const groupCards = dragGroupRef.current
                        .map(id => benchRef.current.find(c => c.id === id))
                        .filter((c): c is CardData => c !== undefined);

                    if (groupCards.length > 0) {
                        if (p === 'main') {
                            // main 阶段：先发起进攻宣言，再逐个上场
                            eventBus.emit(GameEvents.UI_CLICK);
                            actions.initiateAttack();
                            requestAnimationFrame(() => {
                                // [错频优化] 每张卡间隔 60ms 依次发起冲锋，避免音效炸耳
                                groupCards.forEach((c, index) => {
                                    setTimeout(() => {
                                        actions.toggleAttacker(c, true);
                                    }, index * 60);
                                });
                            });
                        } else if (p === 'attack_declare') {
                            // attack_declare 阶段：直接全部上场
                            eventBus.emit(GameEvents.UI_CLICK);
                            groupCards.forEach((c, index) => {
                                setTimeout(() => {
                                    actions.toggleAttacker(c, true);
                                }, index * 60);
                            });
                        } else if (p === 'block_declare') {
                            eventBus.emit(GameEvents.UI_CLICK);

                            // [修复 Bug E] 智能指针锚定：读取玩家鼠标松开时，指针悬停的敌方槽位作为起始点
                            let dropStartIndex = 0;
                            const elements = document.elementsFromPoint(ev.clientX, ev.clientY);
                            for (const el of elements) {
                                const dropZone = (el as HTMLElement).closest('[data-combat-index]');
                                if (dropZone) {
                                    dropStartIndex = parseInt(dropZone.getAttribute('data-combat-index') || '0', 10);
                                    break;
                                }
                            }

                            // [继承 Bug C 修复] 记录已被占用的槽位
                            const usedSlots = new Set<number>();

                            groupCards.forEach((c, index) => {
                                let foundIdx = -1;
                                const totalSlots = combatFieldRef.current.length;

                                // 环形查找算法：从鼠标指引的槽位开始向右找，到头了就从 0 折返继续找
                                for (let offset = 0; offset < totalSlots; offset++) {
                                    const checkIdx = (dropStartIndex + offset) % totalSlots;
                                    const f = combatFieldRef.current[checkIdx];

                                    if (f.blocker !== null || usedSlots.has(checkIdx)) continue;
                                    if (f.attacker.keywords.includes('Elusive') && !c.keywords.includes('Elusive')) continue;

                                    const cPower = (c.power || 0) + (c.buffs?.power || 0);
                                    if (f.attacker.keywords.includes('Fearsome') && cPower < 3) continue;

                                    foundIdx = checkIdx;
                                    break; // 找到了最近的合法空位
                                }

                                if (foundIdx !== -1) {
                                    usedSlots.add(foundIdx);
                                    // [错频优化] 计算依然是瞬间同步完成的，但是执行上阵动作带上了级联延迟！
                                    setTimeout(() => {
                                        actions.assignBlocker(foundIdx, c.id);
                                    }, index * 60);
                                    // [核心推进] 下一张拖拽队列中的卡，默认顺延到刚刚填入槽位的下一个位置
                                    dropStartIndex = (foundIdx + 1) % totalSlots;
                                }
                            });
                        }
                    }
                }
                // 如果没拖够距离（放回备战席）→ 啥也不做，全部归位
            }

            // [多卡] 恢复所有被隐藏的卡牌
            dragCardIdRef.current = null;
            dragGroupRef.current = [];
            dragActivatedRef.current = false;
            setGhostState(null);

            // [新增] 松手时清空预瞄状态并剥离指针强制覆盖
            setDragPreviewSlots([]);
            setPreviewAttackerCount(0);
            setCursor(null);

            hiddenCardElsRef.current.forEach((el) => {
                setTimeout(() => {
                    el.style.pointerEvents = '';
                    el.style.opacity = '';
                }, 0);
            });
            hiddenCardElsRef.current.clear();

            const el = hiddenCardElRef.current;
            hiddenCardElRef.current = null;
            if (el) {
                setTimeout(() => {
                    el.style.pointerEvents = '';
                    el.style.opacity = '';
                }, 0);
            }

            setTimeout(() => { dragJustFinishedRef.current = false; }, 0);
        };

        document.addEventListener('pointermove', onMove);
        document.addEventListener('pointerup', onUp);
        document.addEventListener('pointercancel', onUp);
    };

    /** 战场卡牌 pointerDown — 战场→备战席反向拖拽 */
    const onCombatPointerDown = (e: React.PointerEvent, card: CardData, index: number, role: 'attacker' | 'blocker') => {
        // 只允许在有效阶段拖拽我方单位
        const phase = game.phase;
        const isPlayerTurn = game.turnOwner === 'player';
        const canDrag =
            (phase === 'attack_declare' && role === 'attacker' && isPlayerTurn) ||
            (phase === 'block_declare' && role === 'blocker' && isPlayerTurn);
        if (!canDrag) return;

        const target = (e.target as HTMLElement).closest('[data-entity-id]') as HTMLElement | null;
        if (!target) return;

        const rect = target.getBoundingClientRect();
        const offsetX = e.clientX - rect.left;
        const offsetY = e.clientY - rect.top;

        combatDragSlotRef.current = index;
        combatDragRoleRef.current = role;
        dragCardIdRef.current = card.id;
        dragGroupRef.current = [card.id]; // [多卡] 初始化拖拽组（战场版）
        hiddenCardElsRef.current.clear();
        dragStartRef.current = { x: e.clientX, y: e.clientY, ox: offsetX, oy: offsetY };

        // 显示 GhostCard（多卡队列）
        setGhostState({ cards: [card], x: rect.left, y: rect.top, w: rect.width, h: rect.height, scale: COMBAT_GHOST_SCALE, location: 'combat' });

        const onMove = (ev: PointerEvent) => {
            if (!dragCardIdRef.current) return;
            const dx = ev.clientX - dragStartRef.current.x;
            const dy = ev.clientY - dragStartRef.current.y;

            if (!dragActivatedRef.current && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
                dragActivatedRef.current = true;
                const el = document.querySelector(
                    `[data-entity-id="${dragCardIdRef.current}"]`,
                ) as HTMLElement | null;
                if (el) {
                    hiddenCardElRef.current = el;
                    hiddenCardElsRef.current.set(dragCardIdRef.current!, el);
                    el.style.pointerEvents = 'none';
                    el.style.opacity = '0';
                }
            }

            // [多卡] 战场拖拽扫过检测
            if (dragActivatedRef.current) {
                // [新增] 动态指针：一旦在战场上开始拖拽，指针立刻变成紧握的手套(HAND_GRAB)
                setCursor('HAND_GRAB');

                // [新增] 撤回预瞄雷达：向下越过阈值时，点亮备战席
                const dragDownDistance = ev.clientY - dragStartRef.current.y;
                setIsDraggingToBench(dragDownDistance > BENCH_DRAG_THRESHOLD);

                const roleType = combatDragRoleRef.current;
                if (roleType) {
                    const elements = document.elementsFromPoint(ev.clientX, ev.clientY);
                    for (const el of elements) {
                        const cardEl = (el as HTMLElement).closest('[data-entity-id]') as HTMLElement | null;
                        if (!cardEl) continue;
                        const entityId = cardEl.getAttribute('data-entity-id');
                        if (!entityId) continue;
                        if (dragGroupRef.current.includes(entityId)) continue;

                        // [修复 Bug F] 同步修正战区多卡扫过检测的"所有权倒置"问题，等比复刻 onUp 的检索逻辑
                        const combatIdx = combatFieldRef.current.findIndex(
                            f => (roleType === 'attacker' && f.attacker.id === entityId && f.owner === 'player') ||
                                 (roleType === 'blocker' && f.blocker?.id === entityId)
                        );
                        if (combatIdx === -1) continue;

                        // 根据拖拽身份提取对应的卡牌
                        const combatCard = roleType === 'attacker'
                            ? combatFieldRef.current[combatIdx].attacker
                            : combatFieldRef.current[combatIdx].blocker!;

                        if (!combatCard) continue;
                        const phase = gameRef.current.phase;
                        if (roleType === 'attacker' && phase !== 'attack_declare') continue;
                        if (roleType === 'blocker' && phase !== 'block_declare') continue;
                        dragGroupRef.current.push(entityId);
                        cardEl.style.pointerEvents = 'none';
                        cardEl.style.opacity = '0';
                        hiddenCardElsRef.current.set(entityId, cardEl);
                        setGhostState(prev => {
                            if (!prev) return null;
                            const newCards = [...prev.cards, combatCard];
                            return { ...prev, cards: newCards };
                        });
                        break;
                    }
                }
            }

            setGhostState(prev =>
                prev
                    ? { ...prev, x: ev.clientX - dragStartRef.current.ox, y: ev.clientY - dragStartRef.current.oy }
                    : null,
            );
        };

        const onUp = (ev: PointerEvent) => {
            document.removeEventListener('pointermove', onMove);
            document.removeEventListener('pointerup', onUp);
            document.removeEventListener('pointercancel', onUp);

            const wasDragging = dragActivatedRef.current;
            dragJustFinishedRef.current = wasDragging;

            if (wasDragging) {
                // 向下拖够距离 → 撤回（多卡版）
                const dragDownDistance = ev.clientY - dragStartRef.current.y;
                if (dragDownDistance > BENCH_DRAG_THRESHOLD) {
                    const roleType = combatDragRoleRef.current;
                    const phase = gameRef.current.phase;
                    // [多卡] 处理拖拽组内所有卡牌
                    const groupCards = dragGroupRef.current
                        .map(id => {
                            // [修复 Bug B] 完美区分攻守双方的身份检索！
                            // 进攻方撤回：必须校验 owner === 'player' 且 id 匹配 attacker
                            // 防守方撤回：战区 owner 是敌方，我们只需校验 blocker 的 id 即可
                            const fi = combatFieldRef.current.findIndex(f =>
                                (roleType === 'attacker' && f.attacker.id === id && f.owner === 'player') ||
                                (roleType === 'blocker' && f.blocker?.id === id)
                            );
                            if (fi === -1) return null;

                            // 精准提取对应的卡牌实体
                            const card = roleType === 'attacker' ? combatFieldRef.current[fi].attacker : combatFieldRef.current[fi].blocker!;
                            return { card, idx: fi };
                        })
                        .filter(Boolean);

                    // [错频优化] 利用 index 将每张卡的撤回时间错开 60 毫秒，瞬间消除刺耳的重叠爆音
                    groupCards.forEach((item, index) => {
                        if (!item) return;
                        setTimeout(() => {
                            if (roleType === 'attacker' && phase === 'attack_declare') {
                                eventBus.emit(GameEvents.RECALL_UNIT);
                                actions.toggleAttacker(item.card, false);
                            } else if (roleType === 'blocker' && phase === 'block_declare') {
                                eventBus.emit(GameEvents.RECALL_UNIT);
                                actions.recallBlocker(item.idx);
                            }
                        }, index * 60);
                    });
                }
            }

            // [多卡] 恢复所有被隐藏的原卡
            dragCardIdRef.current = null;
            dragGroupRef.current = [];
            dragActivatedRef.current = false;
            combatDragSlotRef.current = null;
            combatDragRoleRef.current = null;
            setGhostState(null);

            // [新增] 松手时清空撤回预瞄状态并剥离指针强制覆盖
            setIsDraggingToBench(false);
            setCursor(null);

            hiddenCardElsRef.current.forEach((el) => {
                setTimeout(() => {
                    el.style.pointerEvents = '';
                    el.style.opacity = '';
                }, 0);
            });
            hiddenCardElsRef.current.clear();

            const el = hiddenCardElRef.current;
            hiddenCardElRef.current = null;
            if (el) {
                setTimeout(() => {
                    el.style.pointerEvents = '';
                    el.style.opacity = '';
                }, 0);
            }

            setTimeout(() => { dragJustFinishedRef.current = false; }, 0);
        };

        document.addEventListener('pointermove', onMove);
        document.addEventListener('pointerup', onUp);
        document.addEventListener('pointercancel', onUp);
    };

    useEffect(() => {
        playBgm('battle');
    }, []);


    useEffect(() => {
        if (game.gameResult === 'victory') {
            playBgm('victory');
        } else if (game.gameResult === 'defeat') {
            playBgm('defeat');
        }
    }, [game.gameResult, playBgm]);

    // [核心新增] 胜利演出预热：计算出候选视频池，喂给底层放映机
    const handlePrepareVictorySequence = useCallback(() => {
        if (prepareVictoryMovie) {
            const survivingHeroes = playerBench.filter(c => c.isChampion);
            const mvp = survivingHeroes.length > 0
                ? survivingHeroes[Math.floor(Math.random() * survivingHeroes.length)]
                : playerBench[0];

            const videoCandidates: string[] = [];
            if (mvp && mvp.isChampion) videoCandidates.push(mvp.key);
            if (winningHeroKeys && winningHeroKeys.length > 0) videoCandidates.push(...winningHeroKeys);
            videoCandidates.push(...deck);

            prepareVictoryMovie(videoCandidates);
        }
    }, [playerBench, winningHeroKeys, deck, prepareVictoryMovie]);

    const handleVictorySequence = useCallback((onEnd: () => void) => {
    // [新增] 预加载胜利影片（利用 blackout_in 过渡时间提前 fetch 解码）
        const heroKeys = playerBench.filter(c => c.isChampion).map(c => c.key);
        if (heroKeys.length > 0) {
            // [核心修复] 从 userSystem 提取当前画质设置，喂给预加载器，确保精准命中 4K 缓存！
            const res = (userSystem.settings as any)?.videoResolution || '1k';
            import('../utils/videoPreloader').then(m => m.preloadVictoryMovieByKeys(heroKeys, res));
        }

    // 1. 挑选 MVP (保持原逻辑：用于语音互动)
        const survivingHeroes = playerBench.filter(c => c.isChampion);
        const mvp = survivingHeroes.length > 0
            ? survivingHeroes[Math.floor(Math.random() * survivingHeroes.length)]
            : playerBench[0];

        if (mvp) {
            // 触发 MVP 语音 (小兵也可以说话)
            eventBus.emit(GameEvents.GAME_VICTORY, { hero: mvp });
        }

        // [修复] 2. 视频播放逻辑 (Fix: 解决 MVP 是小兵导致没视频播的问题)
        // 我们构建一个候选列表，只要列表里任何一个 key 有视频，就能播放
        const videoCandidates: string[] = [];

        // 优先级 A: MVP 本人 (如果是英雄)
        if (mvp && mvp.isChampion) {
            videoCandidates.push(mvp.key);
        }

        // 优先级 B: 系统计算的获胜英雄 (原始成功逻辑的核心)
        if (winningHeroKeys && winningHeroKeys.length > 0) {
            videoCandidates.push(...winningHeroKeys);
        }

        // 优先级 C: 整个卡组 (兜底，movieData 会自动筛选有视频的卡)
        // 这样即使场上只有小兵，只要你带了里芙，就能放里芙的视频
        videoCandidates.push(...deck);

        // 3. 播放视频
        playVictoryMovie(videoCandidates, () => {
            // [核心修复：战术四] 影片播完后，不再强制调用 onVictory 或 onExit。
            // 只需要调用 onEnd() 关闭视频播放器，让玩家安安静静地停留在 GameOverScreen 结算界面欣赏战绩。
            // 真正的退出动作，交由玩家主动点击结算界面上的退出按钮来触发。
            if (onEnd) onEnd();
        });

    }, [playerBench, winningHeroKeys, deck, playVictoryMovie, onVictory, onExit]);


    // [修改] 主回合倒计时逻辑
    const [timeLeft, setTimeLeft] = useState(99);
    useEffect(() => {
        // 每次回合/阶段变化重置时间
        setTimeLeft(99);
    }, [game.turnOwner, game.phase, game.lastActionTimestamp]);

    useEffect(() => {
        // [修正] 如果处于换牌阶段，暂停主倒计时
        if (isMulliganPhase || game.phase === 'animating' || game.gameResult || game.spellCasting?.step === 'choose_mode') return;

        if (timeLeft <= 0) {
            // [修复 1] 在法术响应阶段超时，等同于放弃响应 (passTurn)
            if (game.phase === 'main' || game.phase === 'react_to_block') actions.passTurn();
            else if (game.phase === 'attack_declare') actions.commitAttack();
            // [修复 2] 防守方超时，应视为确认当前格挡方案，进入响应博弈，而非强制物理结算
            else if (game.phase === 'block_declare') actions.confirmBlock();
            return;
        }
        const timer = setTimeout(() => setTimeLeft(p => p - 1), 1000);
        return () => clearTimeout(timer);
    }, [timeLeft, game.phase, game.gameResult, game.spellCasting, isMulliganPhase]); // 添加 isMulliganPhase 依赖

    const handleCardClick = (card: CardData, location: string, owner: string): boolean => {
        if (game.phase === 'animating' || game.gameResult) return false;

        if (spellSystem.isCasting) {
            spellSystem.handleTargetClick(card, owner as 'player' | 'enemy');
            return false;
        }

        if (location === 'hand') {
            if (owner !== 'player') return false;
            if (game.turnOwner !== 'player') return false;

            const isMainPhase = game.phase === 'main';
            const isCombatPhase = game.phase === 'attack_declare' || game.phase === 'block_declare' || game.phase === 'react_to_block';

            if (!isMainPhase && !isCombatPhase) return false;

            if (isCombatPhase) {
                if (card.type === 'unit' || card.type === 'spell-slow') {
                    setMessage("战斗中只能使用快速或极速法术！");
                    return false;
                }
            }
            if (!canAffordCard(card, game.playerMana, game.playerSpellMana)) { setMessage("法力值不足！"); return false; }

            eventBus.emit(GameEvents.PLAY_CARD);

            if (card.type.includes('unit')) {
                if (playerBench.length >= 6) { setMessage("备战区已满"); return false; }
                actions.playCard(card, 'player');
                return true; // [关键] 判定：单位出牌成功！
            } else {
                const effectId = card.effects && card.effects.length > 0 ? card.effects[0] : null;
                const effectDef = effectId ? EFFECT_DB[effectId] : null;
                // [核心修复] 不仅要看是否有 targetRequirements，更要看是否真的需要玩家"手动选人" (count > 0)
                const needsTarget = effectDef && effectDef.targetRequirements.some(req => req.count > 0);

                if (needsTarget) {
                    spellSystem.startCasting(card);
                    actions.startSpellCasting(card);
                    return true; // [关键] 判定：法术出牌成功并进入选目标阶段！
                } else {
                    actions.playCard(card, 'player');
                    return true; // [关键] 判定：直接法术出牌成功！
                }
            }
        }

        // --- 以下针对非手牌区的点击操作 ---
        // [新增] 如果刚结束拖拽，忽略这次 click（拖拽路径已经处理过了）
        if (dragJustFinishedRef.current) return false;

        if (game.phase === 'attack_declare') {
            if (location === 'bench') {
                eventBus.emit(GameEvents.UI_CLICK);
                actions.toggleAttacker(card, true);
            }
            else if (location === 'combat') {
                eventBus.emit(GameEvents.RECALL_UNIT);
                actions.toggleAttacker(card, false);
            }
        }
        else if (game.phase === 'block_declare' && game.turnOwner === 'player' && location === 'bench') {
            eventBus.emit(GameEvents.UI_CLICK);
            actions.selectBlocker(card.id);
        }

        return false; // 兜底返回
    };



    // [新增] 判断是否可以发起进攻
    const canInitiateAttack = game.phase === 'main' && game.attackToken.player !== null && playerBench.length > 0 && game.spellStack.length === 0;

    // [新增] 撤回进攻宣言 (Cancel Attack)
    const handleCancelAttack = () => {
        // 1. 找出所有已上场的我方单位
        const myAttackers = combatField.filter(f => f.owner === 'player').map(f => f.attacker);

        // 2. 归还到备战席
        if (myAttackers.length > 0) {
            setPlayerBench(prev => [...prev, ...myAttackers]);
        }

        // 3. 清空战场并回退阶段
        setCombatField([]);
        setGame(prev => ({ ...prev, phase: 'main' }));
        eventBus.emit(GameEvents.RECALL_UNIT);
    };

    const btnConfig = useGameButton({
        phase: game.phase,
        turnOwner: game.turnOwner,

        // [修改] 告诉 Hook 是否处于换牌阶段 (由 Mulligan Hook 决定)
        isMulliganPhase: mulligan.isActive,

        // [修改] 将 Mulligan Hook 的状态透传给按钮配置
        mulliganState: {
            selectedCount: mulligan.selectedCount,
            isConfirmed: mulligan.isConfirmed
        },

        combatState: {
            hasAttackers: combatField.some(f => f.owner === 'player'),
            spellStackLength: game.spellStack.length,
            canInitiateAttack: canInitiateAttack
        },

        // [新增] 透传施法与预提交状态
        spellState: {
            isCasting: spellSystem.isCasting || (game.spellCasting !== null && game.spellCasting.step !== 'choose_mode'),
            hasPendingSpell: game.pendingSpell !== null && game.pendingSpell !== undefined
        },

        actions: {
            onPass: actions.passTurn,
            onAttack: actions.commitAttack,
            onBlock: actions.confirmBlock,
            onResolveStack: actions.resolveStack,
            onCancelAttack: handleCancelAttack,
            onMulliganReplace: mulligan.confirmMulligan,
            onMulliganConfirm: mulligan.confirmMulligan,
            onConfirmPendingSpell: actions.confirmPendingSpell // [新增] 绑定确认动作
        }
    });

    const [viewCard, setViewCard] = useState<CardData | null>(null);

    // [新增] 控制打出卡牌时的通用放大动画
    const [showPlayAnimation, setShowPlayAnimation] = useState(false);

    // [新增] 监听 activeCard 变化，触发短时间的放大展示
    useEffect(() => {
        if (game.activeCard) {
            setShowPlayAnimation(true);
            // 800ms 后结束放大动画，如果是法术则会自动无缝切换到 Ritual UI
            const timer = setTimeout(() => setShowPlayAnimation(false), 800);
            return () => clearTimeout(timer);
        } else {
            setShowPlayAnimation(false);
        }
    }, [game.activeCard]);


    return (
        <div className="w-full h-full bg-black text-white overflow-hidden relative font-sans select-none">

            {/* 1. 背景层 */}
            <div className="absolute inset-0 pointer-events-none z-0">
                <img
                    // [修改] 使用选定的牌桌图片
                    src={PERSONALIZATION_ASSETS.desks[deskIndex]}
                    className="w-full h-full object-cover"
                    alt="Game Board"
                />
                <div className="absolute inset-0 bg-black/20"></div>
            </div>

            {/* ================= [新增] Step 3: 特效指引层 ================= */}
            {/* 放置在背景之上，Z轴层级需低于 UI 但高于棋盘背景 */}
            <VFXLayer
                isCasting={spellSystem.isCasting}
                showMousePreview={spellSystem.isCasting && !spellSystem.isSelectionComplete} // [新增] 精准控制：选完目标后彻底掐断鼠标射线
                selectedTargets={spellSystem.selectedTargets}
                // [核心修复] 直接传递真实的 DOM 节点引用，抛弃不稳定的 ID 盲捞
                castingSpellRef={spellSystem.activeCard ? spellCenterRef : undefined}
                // [核心修复] 将所有堆叠区的法术及其目标传入特效层，用于绘制持久化连线
                persistentLines={[
                    // [修正] 直接提取卡牌底层的原生 id 作为起点定位符，不搞花里胡哨的自定义前缀
                    ...(game.pendingSpell ? [{ sourceId: game.pendingSpell.card.id, targets: game.pendingSpell.targets }] : []),
                    ...game.spellStack.map(s => ({ sourceId: s.card.id, targets: s.targets }))
                ]}
            />
            {/* ========================================================== */}

            {/* [新增] Step 3.5: 法术弹道特效层 */}
            <SpellProjectile />

            {/* [新增] Step 3.8: 独立受击特效层 (事件直驱，无缝隔山打牛) */}
            <SpellImpactLayer />
            {/* ========================================================== */}


            {/* 2. 退出按钮 */}
            <div className="absolute top-4 left-4 z-[100]">
                 <button onClick={() => {
                     eventBus.emit(GameEvents.UI_BACK);
                     onExit();
                 }} className="p-2 bg-slate-800/80 rounded-full hover:bg-slate-700 text-gray-400 hover:text-white transition-colors">
                    <Home size={20} />
                </button>
            </div>

            {/* [新增] 信息播报层 */}
            <GameAnnouncement data={announcement} />

            {/* 换牌 UI */}
            {mulligan.isActive && showMulliganUI && (
                <OpeningMulligan
                    hand={playerHand}
                    cardBackUrl={currentCardBackUrl}
                    skinOverrides={skinOverrides} // [新增] 喂给换牌界面

                    // [修改] 状态透传 (受控组件)
                    selectedIndices={mulligan.selectedIndices}
                    isConfirmed={mulligan.isConfirmed}
                    onToggleIndex={mulligan.toggleIndex}
                    onViewArt={setViewCard} // <--- [绝杀补全] 把查看大图的函数传进去！

                    // [修改] 动画回调
                    onAnimationStep={(step) => {
                        if (step === 'ready_to_replace') {
                            // 1. 动画盖牌了，请求后端换数据
                            mulligan.handleDataReplace();
                        } else if (step === 'finished') {
                            // 2. 动画全播完了(包括新牌翻开、退出)，通知 Hook 关闭状态
                            mulligan.finishMulligan();
                        }
                    }}
                />
            )}

            {/* 3. 弹窗层 */}
            {game.gameResult && (
                <GameOverScreen
                    result={game.gameResult}
                    stats={game.stats}
                    // [修改] 区分胜利和失败的退出逻辑
                    onExit={() => {
                        if (game.gameResult === 'victory') {
                            if (onVictory) onVictory(); else onExit();
                        } else {
                            if (onDefeat) onDefeat(); else onExit();
                        }
                    }}
                    onPlayMovie={handleVictorySequence}
                    onPrepareMovie={handlePrepareVictorySequence} // [核心新增] 下发胜利预热！
                />
            )}
            {game.levelUpCard && (
                <LevelUpOverlay
                    card={game.levelUpCard}
                    onClose={() => {
                        actions.closeLevelUp();
                        // [核心修复] 如果升级队列即将清空，且当前不是处于战斗或法术结算中，释放系统锁定！
                        // 这样就能完美解决非战斗状态下（如从手牌打出）触发的全局觉醒导致的死锁。
                        if (game.pendingLevelUps.length <= 1 && combatField.length === 0 && game.spellStack.length === 0) {
                            setGame(prev => ({ ...prev, phase: 'main' }));
                        }
                    }}
                    onPlayMovie={playLevelUpMovie}
                    onPrepareMovie={prepareLevelUpMovie} // [核心新增] 下发升级预热！
                    onStopMovie={stopMovie}
                    popLevelUp={actions.popLevelUp} // [新增] 传入出队回调函数！
                />
            )}

            {(viewCard || game.fullArtCard) && <FullArtOverlay card={viewCard || game.fullArtCard!} onClose={() => setViewCard(null)} />}

            <GameAnnouncement data={finalAnnouncement} />


            {/* 4. 命运抉择层 */}
            {game.activeCard && game.spellCasting?.step === 'choose_mode' && (
                    <div
                        className="fixed inset-0 z-[500] flex flex-col items-center justify-center bg-black/80 backdrop-blur-sm animate-fade-in cursor-pointer"
                        onClick={() => {
                            eventBus.emit(GameEvents.CANCEL_SPELL);
                            actions.cancelChoice(); // [核心大扫除] 回收站权力交还给底层引擎
                        }}
                    >
                        <div className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 to-yellow-600 mb-12 drop-shadow-[0_0_10px_rgba(234,179,8,0.5)] tracking-widest">FATE'S CHOICE</div>

                        <div className="flex gap-16 md:gap-24 items-center">
                            {/* [核心大扫除] 无脑遍历 choices 数组，彻底斩断硬编码判定 */}
                            {game.activeCard.choices?.map((choiceKey, index) => {
                                const choiceData = CARD_DB[choiceKey] as CardData;
                                if (!choiceData) return null;

                                // 呼叫法务和裁判：这个卡能不能放？
                                const { canPlay, lockedMessage } = evaluateChoiceCondition(
                                    choiceData,
                                    game.playerMana,
                                    game.playerSpellMana,
                                    game.spellCasting?.isHeroLeveled
                                );

                                // 保留原有的视效区分：数组第0个(小技能)偏蓝，第1个(大招)偏红
                                const textColor = index === 0 ? 'text-cyan-300' : 'text-red-500';
                                const ringColor = index === 0 ? 'group-hover:ring-cyan-400' : 'group-hover:ring-red-500';
                                const shadowColor = index === 0 ? 'shadow-[0_0_50px_rgba(34,211,238,0.4)]' : 'shadow-[0_0_50px_rgba(239,68,68,0.4)]';

                                return (
                                    <React.Fragment key={choiceKey}>
                                        {/* 绘制选项间的分割线 */}
                                        {index > 0 && <div className="w-px h-32 bg-white/20"></div>}

                                        <div className={`group relative transition-all duration-300 ${canPlay ? 'cursor-pointer hover:scale-110 hover:-translate-y-4' : ''}`}
                                             onClick={(e) => {
                                                 e.stopPropagation();
                                                 if (canPlay) actions.resolveChoice(choiceKey); // 直接传递 Key
                                             }}>
                                            <div className={`absolute -top-16 left-1/2 -translate-x-1/2 text-2xl font-bold ${textColor} opacity-0 group-hover:opacity-100 transition-all duration-300 translate-y-4 group-hover:translate-y-0 whitespace-nowrap`}>
                                                {choiceData.name}
                                            </div>
                                            <div className={`rounded-xl transition-all ${canPlay ? `ring-4 ring-transparent ${ringColor} ${shadowColor}` : ''}`}>
                                                <Card
                                                    data={{...choiceData, id: `choice-${choiceKey}`, strikeCount: 0, keywords: []} as any}
                                                    location="preview"
                                                    skinId={skinOverrides[choiceKey] || 0} // [新增] 给抉择卡穿皮肤
                                                    isLocked={!canPlay}
                                                    lockedMessage={lockedMessage}
                                                />
                                            </div>
                                        </div>
                                    </React.Fragment>
                                );
                            })}
                        </div>

                        <div className="mt-16 text-white/40 text-sm font-mono tracking-widest animate-pulse">点击空白处取消 (CLICK BACKGROUND TO CANCEL)</div>
                    </div>
            )}

            {/* ================= [还原] 通用打出动画 (Big Card) ================= */}
            {/* 逻辑：只要有 activeCard 且处于动画时间内，就显示这张大卡牌 */}
            {/* 这对 单位卡 和 法术卡 都生效，填补了视觉空缺 */}
            {game.activeCard && showPlayAnimation && game.spellCasting?.step !== 'choose_mode' && (
                <div className="fixed inset-0 z-[500] flex items-center justify-center pointer-events-none">
                    {/* 复用原本的 CSS 类 animate-play-card 实现放大效果 */}
                    <div className="pointer-events-auto animate-play-card">
                        <Card
                            data={game.activeCard}
                            location="preview" // 使用 preview 尺寸
                            skinId={skinOverrides[game.activeCard.key] || 0} // [新增] 给打出大图穿皮肤
                            onViewArt={() => {}}
                        />
                    </div>
                </div>
            )}

            {/* ================= [史诗级重构] 统一法术物理层 (The Unified Spell Layer) ================= */}
            {/* 聚合 施法中、预提交、堆叠区 的所有法术，通过 layoutId 保持 DOM 唯一性，实现无缝平移缩放砸落！ */}
            <div className="fixed inset-0 z-[100] pointer-events-none flex items-center justify-center">
                {/* 1. 全屏半透明压暗 (仅施法时显现) */}
                <AnimatePresence>
                    {spellSystem.isCasting && (
                        <motion.div
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            className="absolute inset-0 bg-radial-gradient(circle, transparent 60%, rgba(0,0,0,0.6) 100%) z-0"
                        />
                    )}
                </AnimatePresence>

                {/* 2. 施法文字提示 */}
                <AnimatePresence>
                    {spellSystem.isCasting && spellSystem.activeCard && (
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute left-[15%] top-1/2 -translate-y-1/2 z-[101]">
                            <h2 className="text-6xl font-black tracking-widest drop-shadow-[0_10px_20px_rgba(0,0,0,0.8)] text-transparent bg-clip-text bg-gradient-to-b from-yellow-100 via-yellow-400 to-yellow-700" style={{ textShadow: '0 2px 0 #000, 0 5px 10px rgba(0,0,0,0.5)', WebkitTextStroke: '1px rgba(255,215,0,0.3)' }}>
                                {spellSystem.instruction || "SELECT TARGET"}
                            </h2>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* 3. 核心魔法：所有活动法术的统一渲染流 */}
                {(() => {
                    // 将三个独立状态的法术统合为一个处理队列
                    const activeSpells = [];
                    game.spellStack.forEach((s, idx) => activeSpells.push({ card: s.card, mode: 'stack', owner: s.owner, index: idx }));
                    if (game.pendingSpell) activeSpells.push({ card: game.pendingSpell.card, mode: 'pending', owner: 'player', index: 0 });
                    if (spellSystem.isCasting && spellSystem.activeCard) activeSpells.push({ card: spellSystem.activeCard, mode: 'casting', owner: 'player', index: 0 });

                    return activeSpells.map(({ card, mode, owner, index }) => {
                        const isCasting = mode === 'casting';
                        const isPending = mode === 'pending';
                        const isEnemy = owner === 'enemy';
                        // 智能皮肤读取
                        const currentImageUrl = skinOverrides[card.key] ? getSkinImage(card.key, skinOverrides[card.key], card.level === 2) || card.imageUrl : card.imageUrl;

                        // 动态计算目标位置与缩放（交给 Framer Motion 自动补间飞行路线）
                        const scale = isCasting ? 1 : 0.8;
                        const yOffset = isCasting ? 0 : 0; // 预提交靠下，入栈居中
                        const xOffset = isCasting || isPending ? 0 : 0;

                        return (
                            <motion.div
                                key={card.id}
                                layout // [真正的视觉魔术] DOM不变，只要检测到坐标/缩放改变，自动起飞！
                                initial={isCasting ? { scale: 0, opacity: 0 } : false}
                                animate={{ scale, x: xOffset, y: yOffset, opacity: 1 }}
                                exit={{ scale: 0, opacity: 0 }}
                                transition={{ type: "spring", stiffness: 350, damping: 25 }}
                                className={`absolute pointer-events-auto cursor-pointer group ${isCasting ? 'z-[105]' : 'z-[30]'}`}
                                onClick={() => {
                                    if (isCasting) {
                                        eventBus.emit(GameEvents.UI_BACK);
                                        const cardToReturn = card.parentCard || card;
                                        setPlayerHand(prev => [...prev, cardToReturn]);
                                        if (card.parentCard) {
                                            const cost = card.cost;
                                            setGame(prev => {
                                                let newMana = prev.playerMana + cost;
                                                let newSpellMana = prev.playerSpellMana;
                                                if (newMana > prev.playerMaxMana) {
                                                    newSpellMana = Math.min(3, newSpellMana + (newMana - prev.playerMaxMana));
                                                    newMana = prev.playerMaxMana;
                                                }
                                                return { ...prev, playerMana: newMana, playerSpellMana: newSpellMana };
                                            });
                                        }
                                        setGame(prev => ({ ...prev, activeCard: null, spellCasting: null }));
                                        spellSystem.cancelCasting();
                                    } else if (isPending) {
                                        eventBus.emit(GameEvents.CANCEL_SPELL);
                                        actions.cancelPendingSpell();
                                    }
                                }}
                            >
                                <div className="relative w-48 h-48 flex items-center justify-center transition-transform duration-300 group-hover:scale-110">
                                    <img src={UI_IMAGES.spellContainer} alt="Container" className={`absolute inset-0 w-full h-full object-contain pointer-events-none transition-all duration-300 ${isEnemy ? 'drop-shadow-[0_0_15px_rgba(239,68,68,0.5)]' : 'drop-shadow-[0_0_15px_rgba(59,130,246,0.5)]'} ${!isEnemy ? 'group-hover:drop-shadow-[0_0_40px_rgba(239,68,68,0.5)]' : ''}`} />

                                    {/* 物理锚点：使用 data-entity-id 供特效层绝对追踪 */}
                                    <div ref={isCasting ? spellCenterRef : undefined} data-entity-id={card.id} className="relative w-[110px] h-[110px] rounded-full overflow-hidden z-10 bg-black">
                                        <img src={currentImageUrl} className="w-full h-full object-cover animate-pulse-slow opacity-90 mix-blend-screen" draggable={false} />
                                        {!isEnemy && (isCasting || isPending) && (
                                            <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                                                <span className="text-red-300 font-black tracking-widest text-xs">点击以</span>
                                                <span className="text-white font-black tracking-widest text-sm">取消</span>
                                            </div>
                                        )}
                                    </div>

                                    {/* 缩小后才展示法术名字，避免抢戏 */}
                                    {!isCasting && (
                                        <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-black/80 border border-white/10 text-white text-[20px] px-4 py-1 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-50 shadow-lg scale-50 origin-top">
                                            {card.name}
                                        </div>
                                    )}
                                </div>
                            </motion.div>
                        );
                    });
                })()}
            </div>
            {/* ========================================================================= */}

            {/* 5. 游戏主界面 */}
            <div className={`w-full h-full relative ${game.screenShake ? 'animate-shake' : ''}`}>

                {/* --- A. 左侧 UI 层 (绝对定位) --- */}
                <div className={`absolute top-[33.5%] left-[5%] w-20 h-20 flex items-center justify-center z-20 rounded-full transition-all`}>
                    <SmartNexus
                        health={game.enemyNexus}
                        maxHealth={game.enemyMaxMana} // 借用一下 MaxMana 或者写死 20，这里主要用于展示
                        isEnemy={true}
                        highlight={spellSystem.checkIsTargetable('nexus', 'enemy')}
                        onClick={() => spellSystem.isCasting && spellSystem.handleTargetClick('nexus', 'enemy')}
                    />
                </div>
                {/* 2. 敌方牌库 (左上偏右) */}
                {/* [核心修复] 提升外层 z-index 到 z-40 (悬停时 z-[60]) 彻底压制倒计时和水晶，并剥离 transform 转交组件内部 */}
                <div
                    className="absolute z-40 hover:z-[60] origin-center drop-shadow-2xl transition-all"
                    style={{ top: '10%', left: '14%' }}
                >
                    <Deck
                        isEnemy={true}
                        cardBackIndex={cardBackIndex}
                        deckCount={enemyDeckState.length}
                        handCount={enemyHand.length}
                        initialHeroes={enemyInitialDeckInfo?.heroes || []}
                        regions={enemyInitialDeckInfo?.regions || []}
                        onViewArt={setViewCard}
                        deckTransform="scale(1.35) rotate(169deg)" // [新增] 将缩放和旋转作为参数传给内部实体
                    />
                </div>

                <div className={`absolute bottom-[33.5%] left-[5%] w-20 h-20 flex items-center justify-center z-20 rounded-full transition-all`}>
                    <SmartNexus
                        health={game.playerNexus}
                        maxHealth={game.playerMaxMana}
                        isEnemy={false}
                        highlight={spellSystem.checkIsTargetable('nexus', 'player')}
                        onClick={() => spellSystem.isCasting && spellSystem.handleTargetClick('nexus', 'player')}
                    />
                </div>
                {/* 4. 我方牌库 (左下偏右) */}
                <div
                    className="absolute z-40 hover:z-[60] origin-center drop-shadow-2xl transition-all"
                    style={{ bottom: '10%', left: '14%' }}
                >
                    <Deck
                        isEnemy={false}
                        cardBackIndex={cardBackIndex}
                        deckCount={playerDeck.length}
                        handCount={playerHand.length}
                        initialHeroes={playerInitialDeckInfo?.heroes || []}
                        regions={playerInitialDeckInfo?.regions || []}
                        onViewArt={setViewCard}
                        playerNexusHealth={game.playerNexus}
                        enemyNexusHealth={game.enemyNexus}
                        deckTransform="scale(1.35) rotate(11deg)" // [新增]
                    />
                </div>

                {/* --- B. 中间战场层 (居中限制宽度) --- */}
                <div className="absolute top-0 left-1/2 -translate-x-1/2 h-full w-[65%] flex flex-col z-10">
                    {/* 1. 敌方手牌 */}
                    <div className="h-32 flex justify-center items-start pt-4 perspective-1000 relative -mt-12">
                         <div className="relative w-full h-full flex justify-center">
                            {enemyHand.map((c, index) => {
                                const total = enemyHand.length;
                                const angle = (index - (total - 1) / 2) * 5;
                                const archY = Math.abs(index - (total - 1) / 2) * 5;
                                return (
                                    <div
                                        key={c.id}
                                        className="absolute top-0 left-1/2 -ml-[65px] w-[130px] h-[202px] bg-gradient-to-br from-slate-700 to-slate-800 rounded border border-slate-600 shadow-xl origin-center transition-transform duration-500"
                                            style={{
                                                transform: `translateX(${(index - (total - 1) / 2) * 40}px) rotate(${180 -0.5*angle}deg) translateY(calc(50% + ${archY}px))`,
                                            zIndex: index
                                        }}
                                    >
                                         {/* [修改] 使用 Card 组件渲染敌方卡背 */}
                                         <Card
                                            data={c}
                                            location="hand" // 使用 hand 尺寸
                                            isFaceUp={false} // 强制背面朝上
                                            cardBackUrl={currentCardBack} // 假设敌我用同一种卡背，或者你可以加 enemyCardBackIndex
                                         />
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* 3. 核心战场 - 整合备战席为绝对定位，彻底解决高度挤压问题 */}
                    <div className="flex-1 relative">

                        {/* 2. 敌方备战席 - 绝对定位在核心战场顶部，不占用文档流空间 */}
                        <div className="absolute top-0 left-0 w-full h-21 flex justify-center items-center gap-6 transition-all z-10">
                            {enemyBench.map(c => (
                                // [修复 Bug 1] 补上 contents 伪装盒与雷达事件绑定
                                <div key={c.id} className="contents" {...bindGazeEvents(c)}>
                                <Card
                                    data={c}
                                    location="enemy_bench"
                                    skinId={skinOverrides[c.key] || 0} // [新增]
                                    canBeChallenged={game.phase === 'attack_declare' && game.selectedChallengerId !== null}
                                    onClick={() => {

                                        if (spellSystem.isCasting) {
                                            spellSystem.handleTargetClick(c, 'enemy'); // 优先处理施法点击
                                        } else if (game.phase === 'attack_declare' && game.selectedChallengerId) {
                                            eventBus.emit(GameEvents.UI_CLICK);
                                            actions.challengeEnemy(game.selectedChallengerId, c.id);
                                        } else if (spellSystem.isCasting) {
                                            // [新增] 施法模式下，点击敌方单位
                                            spellSystem.handleTargetClick(c, 'enemy');
                                        } else {
                                            handleCardClick(c, 'enemy_bench', 'enemy');
                                        }
                                    }}
                                    onViewArt={setViewCard}
                                    isSpeaking={c.id === speakingCardId}
                                    isTargetable={spellSystem.checkIsTargetable(c, 'enemy')}
                                    isTargeted={spellSystem.selectedIds.includes(c.id)}
                                />
                                </div>
                            ))}
                        </div>

                        {/* 战场内容容器 - 永远垂直居中，不受备战席有无卡牌影响 */}
                        <div className="h-full flex flex-col justify-center">

                            <Battlefield
                                combatField={combatField}
                                phase={game.phase}
                                skinOverrides={skinOverrides} // [新增] 喂给战场组件！
                                turnOwner={game.turnOwner}
                                selectedBlockerId={game.selectedBlockerId}
                                onCombatClick={(i) => {
                                    // 1. 优先判定：是否处于"格挡宣言"阶段且"已选中备战席单位"
                                    // 如果选中了人，点击槽位 = 分配阻挡
                                    if (game.phase === 'block_declare' && game.selectedBlockerId) {
                                        eventBus.emit(GameEvents.UI_CLICK);
                                        actions.assignBlocker(i, game.selectedBlockerId);
                                    }
                                    // 2. 其次判定：如果没有选中人，但点击了已有的阻挡者 = 撤回
                                    else if (game.phase === 'block_declare' && game.turnOwner === 'player') {
                                        if (combatField[i].blocker) actions.recallBlocker(i);
                                    }
                                }}
                                onCardClick={(c, l, o) => {

                                     // [新增] 战斗中单位的施法目标选择
                                     if (spellSystem.isCasting) {
                                         spellSystem.handleTargetClick(c, o as 'player'|'enemy');
                                         return;
                                     }
                                     if (l === 'combat' && o === 'player') {
                                         if (game.phase === 'attack_declare' && c.keywords.includes('Challenger')) {
                                             if (game.selectedChallengerId === c.id) {
                                                 actions.selectChallenger(c.id);
                                             } else if (game.selectedChallengerId !== c.id) {
                                                 eventBus.emit(GameEvents.UI_CLICK);
                                                 actions.selectChallenger(c.id);
                                                 return;
                                             }
                                         }
                                         eventBus.emit(GameEvents.RECALL_UNIT);
                                         if (game.phase === 'attack_declare') actions.toggleAttacker(c, false);
                                         if (game.phase === 'block_declare') {
                                             const idx = combatField.findIndex(f => f.blocker?.id === c.id);
                                             if (idx !== -1) actions.recallBlocker(idx);
                                         }
                                     }
                                     else if (l === 'combat' && o === 'enemy') {
                                         const idx = combatField.findIndex(f => f.blocker?.id === c.id);
                                         // [核心修复] 严格守卫：只有在玩家自己宣告进攻的阶段，才能撤销自己用“挑战者”拉上来的敌军！
                                         // 绝对禁止在敌方分配格挡时，或战斗响应期间，跨权限踢回敌军。
                                         if (idx !== -1 && game.phase === 'attack_declare' && combatField[idx].owner === 'player') {
                                             eventBus.emit(GameEvents.RECALL_UNIT);
                                             actions.recallBlocker(idx);
                                         }
                                     }
                                     else {
                                         handleCardClick(c, l, o);
                                     }
                                }}
                                onViewArt={setViewCard}
                                speakingCardId={speakingCardId}
                                selectedChallengerId={game.selectedChallengerId}
                                onChallengerClick={actions.selectChallenger}
                                cardBackUrl={currentCardBackUrl}
                                onCombatPointerDown={onCombatPointerDown} // [新增] 战场→备战席拖拽
                                // [补漏修复] 将 GameSession 计算好的雷达数据传递给 Battlefield 组件
                                dragPreviewSlots={dragPreviewSlots}
                                previewAttackerCount={previewAttackerCount}
                                // [新增] 战场悬停预览
                                cardGazeEvents={bindGazeEvents}
                            />
                        </div>

                        {/* 4. 我方备战席 - 绝对定位在核心战场底部，不占用文档流空间 */}
                        <div
                            className="absolute bottom-0 left-0 w-full h-11 flex justify-center items-center gap-6 z-10 transition-all"
                            style={{ touchAction: 'none' }}
                            onPointerDown={onBenchPointerDown}
                        >
                            {/* [新增] 判定：是否在主阶段且有攻击标识 */}
                            {(() => {
                                const canAttackPhase = game.phase === 'main' && game.attackToken.player !== null && game.turnOwner === 'player';
                                return playerBench.map(c => (
                                    <div key={c.id} className="contents" {...bindGazeEvents(c)}>
                                    <Card
                                        data={c}
                                        location="bench"
                                        skinId={skinOverrides[c.key] || 0} // [新增] 给我方备战席穿皮肤
                                        titanCount={[...playerBench, ...enemyBench].filter(tc => tc.keywords.includes('Titan')).length}
                                        isSelected={game.selectedBlockerId === c.id || game.spellCasting?.allyId === c.id}
                                        // [修改] 主阶段持有攻击标识时，所有单位高亮发蓝光！
                                        highlightTarget={(game.phase === 'attack_declare' && game.turnOwner === 'player') || (game.phase === 'block_declare' && game.turnOwner === 'player') || canAttackPhase}
                                        isBlocking={game.phase === 'block_declare'}
                                    onClick={() => {
                                        if (spellSystem.isCasting) {
                                            spellSystem.handleTargetClick(c, 'player');
                                        } else {
                                            // [新增] 拦截逻辑：无法格挡
                                            // 仅在格挡阶段生效
                                            if (game.phase === 'block_declare' && c.keywords.includes('CantBlock')) {
                                                setMessage("该单位无法进行格挡！");
                                                // 播放错误音效 (可选)
                                                // eventBus.emit(GameEvents.ERROR_SFX);
                                                return;
                                            }

                                            handleCardClick(c, 'bench', 'player');
                                        }
                                    }}
                                    onViewArt={setViewCard}
                                    isSpeaking={c.id === speakingCardId}
                                    isTargetable={spellSystem.checkIsTargetable(c, 'player')}
                                    isTargeted={spellSystem.selectedIds.includes(c.id)}
                                    />
                                    </div>
                                ));
                            })()}

                            {/* [新增] 撤回预示：当我们往下拖拽撤回时，备战席亮起等量的全息蓝光底座！ */}
                            {isDraggingToBench && dragGroupRef.current.map((_, idx) => (
                                <div key={`preview-bench-${idx}`} className="w-[120px] h-[162px] border-2 border-cyan-400 bg-cyan-500/30 rounded-md shadow-[0_0_30px_rgba(34,211,238,0.8)] animate-pulse"></div>
                            ))}

                            {/* [新增] 手牌部署预示：悬停/拖拽可打出的单位牌时，备战席末尾出现高亮空位 */}
                            {isHoveringPlayableUnit && !isDraggingToBench && (
                                <div className="w-[120px] h-[162px] border-2 border-cyan-400 border-dashed bg-cyan-500/20 rounded-md shadow-[0_0_20px_rgba(34,211,238,0.6)] animate-pulse flex items-center justify-center transition-all duration-300">
                                    <span className="text-cyan-300 font-bold tracking-widest text-sm drop-shadow-md">部署位</span>
                                </div>
                            )}
                        </div>
                    </div>

                        {/* 替身 GhostCard（多卡队列，Portal 渲染到 document.body） */}
                        {ghostState && (
                            <DragGhostCard
                                cards={ghostState.cards}
                                x={ghostState.x}
                                y={ghostState.y}
                                scale={ghostState.scale ?? GHOST_CARD_SCALE}
                                location={ghostState.location}
                                w={ghostState.w}
                                h={ghostState.h}
                                skinOverrides={skinOverrides} // [核心修复] 把皮肤数据传给拖拽替身组件！
                            />
                        )}

                    {/* 5. 底部占位 (为抽出的全屏手牌预留空间) */}
                    <div className="h-32 w-full flex-shrink-0"></div>
                </div>

                {/* --- C. 右侧 UI 层 (水晶控制台版) --- */}
                <div className="absolute inset-0 pointer-events-none z-30 overflow-hidden">

                    {/* 1. 核心按钮层 (Layer 1: Bottom) - z-10 */}
                    <div className="absolute top-[46%] right-[7.5%] -translate-y-1/2 pointer-events-auto z-10 flex flex-col items-center gap-2">
                        {/* 倒计时 */}
                        <div className={`font-mono text-xl font-bold flex items-center gap-2 bg-black/60 px-3 py-1 rounded-full border border-white/10 ${timeLeft <= 5 ? 'text-red-500 animate-pulse' : 'text-blue-300'}`}>
                            <Clock size={16} />
                            {String(mulligan.isActive ? mulligan.timeLeft : timeLeft).padStart(2, '0')}
                        </div>

                        {/* [核心修改] 根据配置决定渲染 分裂按钮 还是 标准按钮 */}
                        {btnConfig === null ? (
                            // --- 分裂按钮状态 (Split Button) ---
                            <div className="flex flex-col w-36 h-36 rounded-full shadow-lg overflow-hidden group relative">
                                {/* 上半部分：进攻 (Red) */}
                                <button
                                    onClick={() => {
                                        eventBus.emit(GameEvents.ATTACK_DECLARE);
                                        actions.initiateAttack();
                                    }}
                                    className="flex-1 w-full bg-gradient-to-b from-orange-500 to-red-600 border-x-4 border-t-4 border-orange-300 flex items-center justify-center relative hover:brightness-110 active:scale-95 transition-all z-20"
                                >
                                    <div className="absolute inset-0 bg-[linear-gradient(45deg,transparent_25%,rgba(255,255,255,0.2)_50%,transparent_75%)] bg-[length:250%_250%] hover:animate-shine"></div>
                                    <span className="text-lg font-black text-white drop-shadow-md translate-y-2">进攻</span>
                                </button>

                                {/* 下半部分：跳过 (Blue) */}
                                <button
                                    onClick={() => {
                                        eventBus.emit(GameEvents.UI_CLICK);
                                        actions.passTurn();
                                    }}
                                    className="flex-1 w-full bg-blue-600 border-x-4 border-b-4 border-blue-400 flex items-center justify-center relative hover:brightness-110 active:scale-95 transition-all z-10"
                                >
                                    <span className="text-lg font-black text-blue-100 drop-shadow-md -translate-y-2">跳过</span>
                                </button>

                                {/* 中间分割线装饰 */}
                                <div className="absolute top-1/2 left-0 w-full h-[2px] bg-black/50 z-30 pointer-events-none"></div>
                            </div>
                        ) : (
                            // --- 标准按钮状态 (Standard Button) ---
                            <button
                                onClick={() => {
                                    // [修改] 直接调用 Hook 返回的 action，逻辑已在内部封装
                                    if (btnConfig?.action) btnConfig.action();
                                }}
                                disabled={btnConfig?.disabled || game.phase === 'animating'}
                                className={btnConfig?.style}
                            >
                                {btnConfig?.showFlow && (
                                    <div className="absolute inset-[-10px] rounded-full pointer-events-none overflow-visible z-0">
                                        <svg className="w-full h-full overflow-visible">
                                            <circle cx="50%" cy="50%" r="46%" fill="none" stroke="white" strokeWidth="4" strokeLinecap="round" strokeDasharray="80 250" className="animate-beam-move drop-shadow-[0_0_10px_white] opacity-80" />
                                        </svg>
                                    </div>
                                )}
                                <span className="text-xl font-black text-white drop-shadow-md z-10 relative">{btnConfig?.text}</span>
                            </button>
                        )}
                    </div>

                    {/* 2. 容器与水晶层 (Layer 2: Top) - z-20 */}
                    <div className="absolute top-[48%] right-[5%] -translate-y-1/2 z-20 flex items-center justify-center">
                        <div className="relative">
                            {/* A. 背景容器图 */}
                            <img
                                src={UI_IMAGES.buttonContainer}
                                className="w-[275px] max-w-none h-auto object-contain opacity-100 drop-shadow-2xl"
                                alt="Control Panel"
                                style={{ transform: 'translateX(30px) translateY(0px)' }}
                            />

                            {/* B. 水晶系统挂载点 (绝对定位于背景图之上) */}
                            <div className="absolute inset-0 z-30" style={{ transform: 'translateX(30px) translateY(0px)' }}>
                                {/* 我方水晶 (下半部分) */}
                                <ManaGemSystem
                                    // [关键修正] 使用 displayPlayerMana (动画数值)
                                    // 这样水晶数量就会跟随 useManaTicker 的逻辑 (减少 -> 0 -> 增加) 进行变化
                                    currentMana={displayPlayerMana}
                                    maxMana={game.playerMaxMana}
                                    spellMana={game.playerSpellMana}
                                    previewManaCost={previewManaCost}
                                    previewSpellManaCost={previewSpellManaCost}
                                    isPlayer={true}
                                    round={game.round}
                                />

                                {/* 敌方水晶 (上半部分) */}
                                <ManaGemSystem
                                    // [关键修正] 使用 displayEnemyMana (动画数值)
                                    currentMana={displayEnemyMana}
                                    maxMana={game.enemyMaxMana}
                                    spellMana={game.enemySpellMana}
                                    previewManaCost={0}
                                    previewSpellManaCost={0}
                                    isPlayer={false}
                                    round={game.round}
                                />
                            </div>
                        </div>
                    </div>



                    {/* 3. [新增] 独立倒计时层 (Layer 3: Timer) */}
                    {/* [微调指南] 纯数字，无背景 */}
                    <div className={`
                        absolute z-40 font-mono font-black text-3xl tracking-widest drop-shadow-[0_0_10px_rgba(255,255,255,0.8)]
                        /* 位置微调：根据背景图上的"倒计时窗口"定位 */
                        top-[48.5%] right-[87%] translate-x-[0px] translate-y-[0px]
                        ${timeLeft <= 5 ? 'text-red-500 animate-pulse scale-125' : 'text-white-200'}
                        transition-all duration-300
                    `}>
                        {String(timeLeft).padStart(2, '0')}
                    </div>

                    {/* 4. [新增] 独立进攻令牌层 (Layer 4: Attack Token) */}
                    <AnimatePresence>
                        {game.attackToken.enemy && <AttackToken type={game.attackToken.enemy} isEnemy={true} />}
                        {game.attackToken.player && <AttackToken type={game.attackToken.player} isEnemy={false} />}
                    </AnimatePresence>


                    {/* 3. 数值文字层 (保留) - z-40 */}
                    <div className="absolute top-[36.5%] right-[12.25%] z-40 translate-x-[10px] translate-y-[-15px]">
                        <span className="text-white font-black text-2xl drop-shadow-md font-mono">{displayEnemySpellMana}</span>
                    </div>
                    <div className="absolute top-[37.5%] right-[13.75%] z-40 translate-x-[10px] translate-y-[0px]">
                        <span className="text-white font-black text-4xl drop-shadow-md font-impact tracking-wider">{displayEnemyMana}</span>
                    </div>
                    <div className="absolute bottom-[41.5%] right-[13.75%] z-40 translate-x-[10px] translate-y-[0px]">
                        <span className="text-white font-black text-4xl drop-shadow-md font-impact tracking-wider">{displayPlayerMana}</span>
                    </div>
                    <div className="absolute bottom-[40.5%] right-[12.25%] z-40 translate-x-[10px] translate-y-[15px]">
                        <span className="text-white font-black text-2xl drop-shadow-md font-mono">{displayPlayerSpellMana}</span>
                    </div>

                </div>

                {/* --- D. 全屏手牌层 (彻底突破层叠结界) --- */}
                {/* 提权：脱离了中间战场的 z-10 牢笼，作为独立的根级覆盖层，获得与水晶盘同场竞技的资格 */}
                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[65%] h-48 z-40 pointer-events-none flex justify-center items-end pb-4 overflow-visible">
                    <div className="flex -space-x-4 px-4 items-end w-full">
                        {!isMulliganPhase && (
                            <PlayerHand
                                hand={playerHand}
                                game={game}
                                cardBackUrl={currentCardBackUrl}
                                skinOverrides={skinOverrides} // [新增] 喂给手牌区！
                                onCardClick={(c) => handleCardClick(c, 'hand', 'player')}
                                onHover={setHoveredCard}
                                onViewArt={setViewCard}
                                playerBench={playerBench}
                                combatField={combatField}
                            />
                        )}
                    </div>
                </div>

            </div>

            {/* [新增] 战场/备战席悬停预览 — Portal 越狱跟随鼠标 */}
            <FloatingCardPreview mode="follow"  gazeTarget={gazeTarget} skinId={skinOverrides[gazeTarget?.card.key || ''] || 0} /> {/* [新增] 给悬停大图穿皮肤 */}
        </div>
    );
}