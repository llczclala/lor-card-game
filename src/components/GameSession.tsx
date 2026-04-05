import React, { useState, useEffect, useCallback} from 'react';
import { Clock, Home } from 'lucide-react';
import type { CardData } from '../types';
import { Card } from './Card';
import { SmartNexus, Deck } from './GameUI';
import { FullArtOverlay, LevelUpOverlay, GameOverScreen } from './Overlays';
import { useGameState } from '../hooks/useGameState';
import { useAI } from '../hooks/useAI';
import { canAffordCard } from '../utils/gameRules';
import { Battlefield } from './Battlefield';
import { CARD_DB } from '../data/cards';
import { eventBus, GameEvents } from '../utils/eventBus';
import { useVoice } from '../hooks/useVoice';
import { UI_IMAGES, PERSONALIZATION_ASSETS } from '../data/imageData';
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
import { EFFECT_DB } from '../data/effectRegistry';
import { VFXLayer } from './VFXLayer'; // [新增]
import { AnimatePresence, motion } from 'framer-motion'; // [新增] 确保引入了 framer-motion 用于施法UI动画
import type { EnemyHeroConfig } from '../types/gameModeTypes'; // [新增] 引入类型

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
    playVictoryMovie: (heroKeys: string[], onEnd?: () => void) => void;
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
    playLevelUpMovie, playVictoryMovie, stopMovie,
    deskIndex, cardBackIndex = 0,
    enemyDeck,
    enemyHeroConfig,
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
        message, setMessage, winningHeroKeys
    } = useGameState(deck, enemyDeck);

    // [新增] 使用 Mulligan Hook 接管换牌逻辑
    const mulligan = useMulligan({
        initialHand: playerHand,
        onReplace: async (indices) => {
            await actions.replaceOpeningHand(indices);
        },
        onComplete: () => {
            actions.requeueHandToDeck();
            // 注意：这里不需要手动 setIsMulliganPhase(false)，依靠 mulligan.isActive 即可
            // 或者保留 setIsMulliganPhase(false) 作为双重保险，视你的逻辑而定
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

    let previewManaCost = 0;
    let previewSpellManaCost = 0;


    if (hoveredCard && game.phase === 'main' && game.turnOwner === 'player') {
        const cost = hoveredCard.cost;
        const currentMana = game.playerMana;
        const currentSpellMana = game.playerSpellMana;
        const isUnit = hoveredCard.type.includes('unit');

        const { newMana, newSpellMana } = calculateNewMana(cost, currentMana, currentSpellMana, isUnit);

        previewManaCost = currentMana - newMana;
        previewSpellManaCost = currentSpellMana - newSpellMana;
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

    const handleVictorySequence = useCallback((onEnd: () => void) => {
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
            if (onVictory) {
                onVictory();
            } else {
                onExit();
            }
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
            if (game.phase === 'main') actions.passTurn();
            else if (game.phase === 'attack_declare') actions.commitAttack();
            else if (game.phase === 'block_declare') actions.resolveCombatAnimation();
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
            const isCombatPhase = game.phase === 'attack_declare' || game.phase === 'block_declare';

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
                const needsTarget = effectDef && effectDef.targetRequirements.length > 0;

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

        // --- 以下针对非手牌区的点击操作，由于目前暂不涉及拖拽，默认返回 false 即可 ---
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

        actions: {
            onPass: actions.passTurn,
            onAttack: actions.commitAttack,
            onBlock: actions.resolveCombatAnimation,
            onResolveStack: actions.resolveStack,
            onCancelAttack: handleCancelAttack,
            // [修改] 绑定 Mulligan Hook 的动作
            onMulliganReplace: mulligan.confirmMulligan,
            onMulliganConfirm: mulligan.confirmMulligan
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
                selectedTargets={spellSystem.selectedTargets}
            />
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

                    // [修改] 状态透传 (受控组件)
                    selectedIndices={mulligan.selectedIndices}
                    isConfirmed={mulligan.isConfirmed}
                    onToggleIndex={mulligan.toggleIndex}

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
                />
            )}
            {game.levelUpCard && (
                <LevelUpOverlay
                    card={game.levelUpCard}
                    onClose={actions.closeLevelUp}
                    onPlayMovie={playLevelUpMovie}
                    onStopMovie={stopMovie}
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
                            setGame((prev: typeof game) => ({ ...prev, activeCard: null, spellCasting: null }));
                        }}
                    >
                        <div className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 to-yellow-600 mb-12 drop-shadow-[0_0_10px_rgba(234,179,8,0.5)] tracking-widest">FATE'S CHOICE</div>
                        <div className="flex gap-16 md:gap-24 items-center">
                            <div className="group relative cursor-pointer transition-all duration-300 hover:scale-110 hover:-translate-y-4" onClick={(e) => { e.stopPropagation(); actions.resolveChoice('left'); }}>
                                <div className="absolute -top-16 left-1/2 -translate-x-1/2 text-2xl font-bold text-cyan-300 opacity-0 group-hover:opacity-100 transition-all duration-300 translate-y-4 group-hover:translate-y-0 whitespace-nowrap">
                                    {game.activeCard.associatedChampionKey === 'lyfe' ? '无尽霜刃 (Rush)' : '星光之途 (Strike)'}
                                </div>
                                <div className="ring-4 ring-transparent group-hover:ring-cyan-400 rounded-xl transition-all shadow-[0_0_50px_rgba(34,211,238,0.4)]">
                                    <Card data={{...CARD_DB[game.activeCard.associatedChampionKey === 'lyfe' ? 'lyfe_rush' : 'fenny_strike'], id: 'choice-left', strikeCount: 0, keywords: []} as any} location="preview" />
                                </div>
                            </div>
                            <div className="w-px h-32 bg-white/20"></div>
                            <div className="group relative cursor-pointer transition-all duration-300 hover:scale-110 hover:-translate-y-4" onClick={(e) => { e.stopPropagation(); actions.resolveChoice('right'); }}>
                                <div className="absolute -top-16 left-1/2 -translate-x-1/2 text-2xl font-bold text-red-500 opacity-0 group-hover:opacity-100 transition-all duration-300 translate-y-4 group-hover:translate-y-0 whitespace-nowrap">
                                    {game.activeCard.associatedChampionKey === 'lyfe' ? '吞噬神座 (Ultimate)' : '绝对主角 (Decimate)'}
                                </div>
                                <div className="ring-4 ring-transparent group-hover:ring-red-500 rounded-xl transition-all shadow-[0_0_50px_rgba(239,68,68,0.4)]">
                                    <Card data={{...CARD_DB[game.activeCard.associatedChampionKey === 'lyfe' ? 'lyfe_ultimate' : 'fenny_ultimate'], id: 'choice-right', strikeCount: 0, keywords: []} as any} location="preview" />
                                </div>
                            </div>
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
                            onViewArt={() => {}}
                        />
                    </div>
                </div>
            )}

            {/* ================= [新增] Step 4: 沉浸式施法 UI (The Ritual) ================= */}
            <AnimatePresence>
                {spellSystem.isCasting && spellSystem.activeCard && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center pointer-events-none">

                        {/* 1. 全屏半透明压暗 (聚焦视线) */}
                        <motion.div
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            className="absolute inset-0 bg-radial-gradient(circle, transparent 60%, rgba(0,0,0,0.6) 100%)"
                        />

                        {/* 2. 中央施法核心 (可点击撤销) */}
                        <motion.div
                            initial={{ scale: 0, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0, opacity: 0 }}
                            className="relative pointer-events-auto cursor-pointer group"
                            onClick={() => {
                                eventBus.emit(GameEvents.UI_BACK);

                                // 1. 将卡牌加回手牌
                                if (spellSystem.activeCard) {
                                    setPlayerHand(prev => [...prev, spellSystem.activeCard!]);
                                }

                                // 2. 清理全局状态
                                setGame(prev => ({ ...prev, activeCard: null, spellCasting: null }));
                                spellSystem.cancelCasting();
                            }}
                        >

                            <div className="fixed left-[15%] top-1/2 -translate-y-1/2 z-[101] pointer-events-none">
                                <h2
                                    className="text-5xl font-black italic tracking-tighter text-black opacity-100"
                                    style={{
                                        WebkitTextStroke: '2px white', // [关键] 添加白色描边，模仿播报系统的黑色字体风格
                                        textShadow: '0 4px 0 rgba(255, 255, 255, 0.5)' // 增加一点立体感
                                    }}
                                >
                                    {spellSystem.instruction || "SELECT TARGET"}
                                </h2>
                            </div>

                            {/* B. 圆形法术图标 */}
                            <div className="w-32 h-32 rounded-full border-4 border-blue-400/80 shadow-[0_0_50px_rgba(59,130,246,0.6)] overflow-hidden relative z-10 transition-transform duration-300 group-hover:scale-110 group-hover:border-red-400">
                                <img
                                    src={spellSystem.activeCard.imageUrl}
                                    alt="Casting"
                                    className="w-full h-full object-cover animate-pulse-slow"
                                />
                                {/* 撤销提示 (Hover 出现) */}
                                <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                                    <span className="text-red-300 font-black tracking-widest text-xs">CLICK TO</span>
                                    <span className="text-white font-black tracking-widest text-sm">CANCEL</span>
                                </div>
                            </div>

                            {/* C. 能量波纹特效 */}
                            <div className="absolute inset-0 rounded-full border border-blue-400 opacity-0 animate-ping-slow"></div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
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
                {/* [微调指南]
                    top/left: 位置坐标
                    scale: 大小缩放
                    rotate: 旋转角度 (正数顺时针，负数逆时针)
                */}
                <div
                    className="absolute z-10 origin-center drop-shadow-2xl"
                    style={{
                        top: '10%',
                        left: '14%',
                        transform: 'scale(1.35) rotate(169deg)' // 敌方牌库通常旋转180度(如果卡背有方向) 或 0度
                    }}
                >
                    <Deck isEnemy={true} cardBackIndex={cardBackIndex} />
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
                {/* [微调指南]
                    bottom/left: 位置坐标
                    scale: 大小缩放
                    rotate: 旋转角度 (微调透视感，比如 rotate(-5deg) 让它看起来随意一点)
                */}
                <div
                    className="absolute z-10 origin-center drop-shadow-2xl"
                    style={{
                        bottom: '10%',
                        left: '14%',
                        transform: 'scale(1.35) rotate(11deg)'
                    }}
                >
                    <Deck isEnemy={false} cardBackIndex={cardBackIndex} />
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

                    {/* 2. 敌方备战席 */}
                    <div className="h-21 flex justify-center items-center gap-6 transition-all relative z-0">
                        {enemyBench.map(c => (
                            <Card
                                key={c.id}
                                data={c}
                                location="enemy_bench"
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
                        ))}
                    </div>

                    {/* 3. 核心战场 */}
                    <div className="flex-1 relative flex flex-col justify-center">
                        {game.spellStack.length > 0 && (
                            <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none">
                                <div className="flex gap-2 pointer-events-auto">
                                    {game.spellStack.map((item) => <Card key={item.card.id} data={item.card} location="spell_stack" onViewArt={setViewCard} />)}
                                </div>
                            </div>
                        )}
                        <Battlefield
                            combatField={combatField}
                            phase={game.phase}
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
                                     if (idx !== -1) {
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
                        />
                    </div>

                    {/* 4. 我方备战席 */}
                    <div className="h-11 flex justify-center items-center gap-6 z-10 relative transition-all">
                        {playerBench.map(c => (
                            <Card
                                key={c.id}
                                data={c}
                                location="bench"
                                isSelected={game.selectedBlockerId === c.id || game.spellCasting?.allyId === c.id}
                                highlightTarget={(game.phase === 'attack_declare' && game.turnOwner === 'player') || (game.phase === 'block_declare' && game.turnOwner === 'player')}
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
                        ))}
                    </div>


                    {/* 5. 底部占位 (为抽出的全屏手牌预留空间) */}
                    <div className="h-32 w-full flex-shrink-0"></div>
                </div>

                {/* --- C. 右侧 UI 层 (水晶控制台版) --- */}
                <div className="absolute inset-0 pointer-events-none z-30 overflow-hidden">

                    {/* 1. 核心按钮层 (Layer 1: Bottom) - z-10 */}
                    <div className="absolute top-[47.5%] right-[7.5%] -translate-y-1/2 pointer-events-auto z-10 flex flex-col items-center gap-2">
                        {/* 倒计时 */}
                        <div className={`font-mono text-xl font-bold flex items-center gap-2 bg-black/60 px-3 py-1 rounded-full border border-white/10 ${timeLeft <= 5 ? 'text-red-500 animate-pulse' : 'text-blue-300'}`}>
                            <Clock size={16} />
                            {String(mulligan.isActive ? mulligan.timeLeft : timeLeft).padStart(2, '0')}
                        </div>

                        {/* [核心修改] 根据配置决定渲染 分裂按钮 还是 标准按钮 */}
                        {btnConfig === null ? (
                            // --- 分裂按钮状态 (Split Button) ---
                            <div className="flex flex-col w-36 h-36 rounded-full shadow-lg overflow-hidden group">
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

                        <div className="text-center text-xs text-gray-400 bg-black/60 px-2 py-1 rounded max-w-[150px] whitespace-nowrap">
                            {message}
                        </div>
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
                    {/* [微调指南]
                        w-[80px]: 调整图标大小
                        drop-shadow: 控制发光强度
                    */}

                    {/* 场景A: 敌方拥有进攻令牌 (位置：右上方) */}
                    {/* 场景A: 敌方拥有进攻令牌 */}
                    {game.attackToken.enemy && (
                        <div className="absolute z-40 animate-pulse drop-shadow-[0_0_15px_rgba(249,115,22,0.8)] top-[22.5%] right-[13%]">
                            <img
                                src={game.attackToken.enemy === 'rally' ? UI_IMAGES.swordGain : UI_IMAGES.sword}
                                alt="Enemy Attack Token"
                                className="w-[80px] h-auto object-contain transform rotate-180"
                            />
                        </div>
                    )}

                    {/* 场景B: 我方拥有进攻令牌 */}
                    {game.attackToken.player && (
                        <div className="absolute z-40 animate-pulse drop-shadow-[0_0_15px_rgba(249,115,22,0.8)] bottom-[27.5%] right-[13%]">
                            <img
                                src={game.attackToken.player === 'rally' ? UI_IMAGES.swordGain : UI_IMAGES.sword}
                                alt="Player Attack Token"
                                className="w-[80px] h-auto object-contain"
                            />
                        </div>
                    )}


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
                                onCardClick={(c) => handleCardClick(c, 'hand', 'player')}
                                onHover={setHoveredCard}
                                onViewArt={setViewCard}
                            />
                        )}
                    </div>
                </div>

            </div>
        </div>
    );
}