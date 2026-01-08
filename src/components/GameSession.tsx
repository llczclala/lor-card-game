import React, { useState, useEffect} from 'react';
import { Clock, Home } from 'lucide-react';
import type { CardData } from '../types';
import { Card } from './Card';
import { NexusDisplay, Deck } from './GameUI';
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
    // [新增] 接收样式索引
    deskIndex: number;
    cardBackIndex?: number;
}

export const GameSession: React.FC<GameSessionProps> = ({
    deck, onExit, playBgm,
    playLevelUpMovie, playVictoryMovie,
    deskIndex, cardBackIndex = 0 // [新增]
}) => {
    const {
        game, setGame,
        playerHand,setPlayerHand,enemyHand, setEnemyHand,
        playerBench, setPlayerBench,
        enemyBench, setEnemyBench,
        combatField, setCombatField,
        actions,
        message, setMessage,
        winningHeroKeys
    } = useGameState(deck);

    // [新增] 悬停卡牌状态与法力预览计算
    const [hoveredCard, setHoveredCard] = useState<CardData | null>(null);
    const currentCardBackUrl = getCardBackUrl(cardBackIndex);
    // [新增] 换牌阶段状态控制
    const [isMulliganPhase, setIsMulliganPhase] = useState(true);
    // [新增] 换牌选择状态 (Set<手牌索引>)
    const [mulliganSelected, setMulliganSelected] = useState<Set<number>>(new Set());
    // [新增] 确认换牌信号 (用于触发 OpeningMulligan 的退出动画)
    const [mulliganConfirmed, setMulliganConfirmed] = useState(false);

    // [新增] 换牌独立倒计时 (20秒)
    const [mulliganTimeLeft, setMulliganTimeLeft] = useState(99);

    // [新增] 换牌倒计时逻辑
    useEffect(() => {
        if (isMulliganPhase && !mulliganConfirmed) {
            if (mulliganTimeLeft <= 0) {
                // 超时处理：视为不更换 (清空选择并确认)
                setMulliganSelected(new Set());
                setMulliganConfirmed(true);
                return;
            }
            const timer = setTimeout(() => setMulliganTimeLeft(p => p - 1), 1000);
            return () => clearTimeout(timer);
        }
    }, [isMulliganPhase, mulliganTimeLeft, mulliganConfirmed]);



    useEffect(() => {
        // 1.5秒后显示换牌界面 (对应 GameStart 播报时长)
        const timer = setTimeout(() => setShowMulliganUI(true), 1500);
        return () => clearTimeout(timer);
    }, []);

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

    // [新增] 挂载施法系统 Hook
    // 负责管理法术的目标选择状态机
    const spellSystem = useSpellSystem({
        onComplete: (card, targets) => {
            // 当目标选择完成后，调用游戏状态的 finalizeSpell
            actions.finalizeSpell(card, 'player', targets);
        }
    });
    // [新增] 换牌阶段控制
    // 默认为 true (开局即进入换牌流程)，或者由 useGameAnnouncer 控制
    // 根据您的描述，"游戏开始" -> "抽卡动画(Mulligan UI)" -> "换牌" -> "第一回合"
    // 所以初始状态应该是 true
    // 如果施法系统有指令 (instruction)，则显示在播报层
    // 这里我们做一个简单的合并：如果有施法指令，就覆盖当前的 announcement
    const finalAnnouncement = spellSystem.isCasting && spellSystem.instruction
        ? { id: 'spell-hint', mainText: spellSystem.instruction, type: 'phase_hint' as const }
        : announcement;

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
    const { speakingCardId } = useVoice();

    useEffect(() => {
        playBgm('battle');
    }, []);

    useEffect(() => {
        if (game.gameResult === 'victory') playBgm('victory');
        else if (game.gameResult === 'defeat') playBgm('defeat');
    }, [game.gameResult]);

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

    const handleCardClick = (card: CardData, location: string, owner: string) => {
        if (game.phase === 'animating' || game.gameResult) return;
        // [新增] 1. 优先检查施法系统状态
        // 如果正在施法 (选择目标中)，则将点击事件委托给 spellSystem
        if (spellSystem.isCasting) {
            spellSystem.handleTargetClick(card, owner as 'player' | 'enemy');
            return;
        }


        if (game.spellCasting) {
            const step = game.spellCasting.step;
            if (step === 'select_ally' && owner === 'player' && location === 'bench') {
                if (game.spellCasting.cardId.includes('single_combat') || card.name.includes('单挑')) {
                    actions.updateSpellCasting({ ...game.spellCasting, step: 'select_enemy', allyId: card.id, targets: [{type:'ally', id: card.id}] });
                    setMessage("请选择敌方单位");
                } else {
                    const spellCard = game.activeCard!;
                    if (spellCard) actions.finalizeSpell(spellCard, 'player', [{type:'ally', id: card.id}]);
                }
            }
            else if (step === 'select_enemy' && owner === 'enemy') {
                const spellCard = game.activeCard!;
                if (spellCard) {
                    const targets = [...game.spellCasting.targets, {type: 'enemy', id: card.id}];
                    actions.finalizeSpell(spellCard, 'player', targets);
                }
            }
            return;
        }


        // [保留] 3. 手牌出牌逻辑
        if (location === 'hand') {
            // 只能操作自己的手牌
            if (owner !== 'player') return;

            // 1. 基础检查：必须轮到我方行动
            if (game.turnOwner !== 'player') return;

            // 2. 阶段检查：允许 主阶段 或 战斗阶段
            const isMainPhase = game.phase === 'main';
            const isCombatPhase = game.phase === 'attack_declare' || game.phase === 'block_declare';

            if (!isMainPhase && !isCombatPhase) return;

            // 3. 战斗阶段限制：只能打出 快速(Fast) 或 极速(Burst) 法术
            if (isCombatPhase) {
                if (card.type === 'unit' || card.type === 'spell-slow') {
                    setMessage("战斗中只能使用快速或极速法术！");
                    return;
                }
            }
            if (!canAffordCard(card, game.playerMana, game.playerSpellMana)) { setMessage("法力值不足！"); return; }

            eventBus.emit(GameEvents.PLAY_CARD);

            if (card.type.includes('unit')) {
                if (playerBench.length >= 6) { setMessage("备战区已满"); return; }
                actions.playCard(card, 'player');
            } else {
                // 法术卡：调用 useSpellSystem 启动施法流程
                if (['single_combat', 'prayer', 'hidden_arrow', 'fenny_ultimate'].includes(card.key)) {
                    // 需要目标的法术 -> 启动施法状态机
                    spellSystem.startCasting(card);
                    // 同时设置 game.activeCard 以便显示在屏幕中间 (兼容旧 UI)
                    actions.startSpellCasting(card);
                } else {
                    // 不需要目标的法术 / 抉择卡 -> 走旧逻辑
                    // 抉择卡会在 playCard 内部被拦截进入 choose_mode
                    actions.playCard(card, 'player');
                }
            }
            return;
        }

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

    const getBtnConfig = () => {
        const baseStyle = "w-36 h-36 rounded-full border-4 shadow-lg flex flex-col items-center justify-center transition-all active:scale-95 z-20 cursor-pointer relative";

        // [新增] 换牌阶段专用按钮逻辑
        if (isMulliganPhase) {
            // 如果已经在执行换牌动画中，禁用按钮
            if (mulliganConfirmed) return { style: `${baseStyle} bg-gray-700 border-gray-600 cursor-not-allowed`, text: "..." };

            const count = mulliganSelected.size;

            if (count > 0) {
                // 红色：确认更换
                return {
                    style: `${baseStyle} bg-red-600 hover:bg-red-500 border-red-400 shadow-[0_0_30px_rgba(239,68,68,0.5)]`,
                    text: "更换",
                    action: () => setMulliganConfirmed(true) // 触发动画
                };
            } else {
                // 蓝色：确定 (不换)
                return {
                    style: `${baseStyle} bg-blue-600 hover:bg-blue-500 border-blue-400`,
                    text: "确定",
                    action: () => setMulliganConfirmed(true) // 触发退出
                };
            }
        }

        if (game.turnOwner !== 'player') return { style: `${baseStyle} bg-gray-700 border-gray-600 cursor-not-allowed`, text: "等待" };

        if (game.phase === 'main') {
            if (game.spellStack.length > 0) return { style: `${baseStyle} bg-blue-600 border-blue-400`, text: "确定", action: actions.resolveStack }; // 假设 resolveStack 存在，或者之前的逻辑

            // [修改] 如果可以发起进攻，返回 null，指示 JSX 渲染分裂按钮
            if (canInitiateAttack) return null;

            if (game.consecutivePasses > 0) return { style: `${baseStyle} bg-blue-600 border-blue-400`, text: "结束回合", action: actions.passTurn };
            return { style: `${baseStyle} bg-blue-600 border-blue-400`, text: "过", action: actions.passTurn };
        }

        // [修改] 进攻宣言阶段：动态判断是"进攻"还是"撤回"
        if (game.phase === 'attack_declare') {
            const hasAttackers = combatField.some(f => f.owner === 'player');

            if (hasAttackers) {
                // 有单位 -> 红色进攻
                return {
                    style: `${baseStyle} bg-gradient-to-b from-orange-500 to-red-600 border-orange-300 shadow-[0_0_30px_rgba(234,88,12,0.6)]`,
                    text: "进攻",
                    showFlow: true,
                    action: actions.commitAttack
                };
            } else {
                // 无单位 -> 蓝色撤回
                return {
                    style: `${baseStyle} bg-blue-600 border-blue-400`,
                    text: "撤回",
                    action: handleCancelAttack // 调用刚刚写的撤回函数
                };
            }
        }

        if (game.phase === 'block_declare') return { style: `${baseStyle} bg-blue-500 border-blue-300`, text: "格挡", action: actions.resolveCombatAnimation };

        return { style: `${baseStyle} bg-gray-800 border-gray-600 text-gray-400`, text: "..." };
    };

    const btnConfig = getBtnConfig();
    const [viewCard, setViewCard] = useState<CardData | null>(null);


    return (
        <div className="w-full h-screen bg-black text-white overflow-hidden relative font-sans select-none">

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

            {/* 2. 退出按钮 */}
            <div className="absolute top-4 left-4 z-[100]">
                 <button onClick={() => {
                     playBgm('title');
                     onExit();
                 }} className="p-2 bg-slate-800/80 rounded-full hover:bg-slate-700 text-gray-400 hover:text-white transition-colors">
                    <Home size={20} />
                </button>
            </div>

            {/* [新增] 信息播报层 */}
            <GameAnnouncement data={announcement} />

            {/* 换牌 UI */}
            {isMulliganPhase && showMulliganUI && (
                <>
                    <OpeningMulligan
                        initialHand={playerHand}
                        cardBackUrl={currentCardBackUrl}
                        selectedIndices={mulliganSelected}
                        onToggleIndex={(index) => {
                            setMulliganSelected(prev => {
                                const next = new Set(prev);
                                if (next.has(index)) next.delete(index);
                                else next.add(index);
                                return next;
                            });
                        }}
                        isConfirmed={mulliganConfirmed}
                        onReplaceLogic={async () => {
                            await actions.replaceOpeningHand(Array.from(mulliganSelected));
                        }}
                        onComplete={() => {
                            // 1. 动画结束，视觉上手牌已飞回牌库
                            // 2. 逻辑上，将手牌放回牌库顶，并清空当前手牌
                            actions.requeueHandToDeck();

                            // 3. 结束换牌阶段，GameAnnouncement 将接管并触发 drawCards(4)
                            setIsMulliganPhase(false);
                        }}
                    />

                    {/* 换牌倒计时 UI */}
                    <div className="absolute top-24 left-1/2 -translate-x-1/2 z-[70] flex flex-col items-center">
                        <div className="text-xl font-bold text-yellow-400 tracking-widest mb-1">
                            确认倒计时
                        </div>
                        <div className={`text-4xl font-mono font-black ${mulliganTimeLeft <= 5 ? 'text-red-500 animate-pulse' : 'text-white'}`}>
                            {mulliganTimeLeft}
                        </div>
                    </div>
                </>
            )}

            {/* 3. 弹窗层 */}
            {game.gameResult && (
                <GameOverScreen
                    result={game.gameResult}
                    onRestart={actions.resetGame}
                    onPlayMovie={(cb) => playVictoryMovie(winningHeroKeys, cb)}
                />
            )}
            {game.levelUpCard && (
                <LevelUpOverlay
                    card={game.levelUpCard}
                    onClose={actions.closeLevelUp}
                    onPlayMovie={playLevelUpMovie}
                    onStopMovie={() => {}}
                />
            )}
            {(viewCard || game.fullArtCard) && <FullArtOverlay card={viewCard || game.fullArtCard!} onClose={() => setViewCard(null)} />}

            <GameAnnouncement data={finalAnnouncement} />


            {/* 4. 命运抉择层 */}
            {game.activeCard && (
                game.spellCasting?.step === 'choose_mode' ? (
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
                                    {game.activeCard.associatedChampionKey === 'lyfe' ? '奔袭 (Rush)' : '强袭 (Strike)'}
                                </div>
                                <div className="ring-4 ring-transparent group-hover:ring-cyan-400 rounded-xl transition-all shadow-[0_0_50px_rgba(34,211,238,0.4)]">
                                    <Card data={{...CARD_DB[game.activeCard.associatedChampionKey === 'lyfe' ? 'lyfe_rush' : 'fenny_strike'], id: 'choice-left', strikeCount: 0, keywords: []} as any} location="preview" />
                                </div>
                            </div>
                            <div className="w-px h-32 bg-white/20"></div>
                            <div className="group relative cursor-pointer transition-all duration-300 hover:scale-110 hover:-translate-y-4" onClick={(e) => { e.stopPropagation(); actions.resolveChoice('right'); }}>
                                <div className="absolute -top-16 left-1/2 -translate-x-1/2 text-2xl font-bold text-red-500 opacity-0 group-hover:opacity-100 transition-all duration-300 translate-y-4 group-hover:translate-y-0 whitespace-nowrap">
                                    {game.activeCard.associatedChampionKey === 'lyfe' ? '先登 (Ultimate)' : '斩将 (Decimate)'}
                                </div>
                                <div className="ring-4 ring-transparent group-hover:ring-red-500 rounded-xl transition-all shadow-[0_0_50px_rgba(239,68,68,0.4)]">
                                    <Card data={{...CARD_DB[game.activeCard.associatedChampionKey === 'lyfe' ? 'lyfe_ultimate' : 'fenny_ultimate'], id: 'choice-right', strikeCount: 0, keywords: []} as any} location="preview" />
                                </div>
                            </div>
                        </div>
                        <div className="mt-16 text-white/40 text-sm font-mono tracking-widest animate-pulse">点击空白处取消 (CLICK BACKGROUND TO CANCEL)</div>
                    </div>
                ) : (
                    <div className="fixed inset-0 z-[500] flex items-center justify-center pointer-events-none">
                        <div className={`pointer-events-auto ${game.spellCasting ? 'scale-[2.0]' : 'animate-play-card'}`}>
                            <Card data={game.activeCard} location={game.spellCasting ? 'spell_stack' : 'preview'} onViewArt={()=>{}} />
                            <div
                                className="mt-8 text-center pointer-events-auto cursor-pointer text-gray-400 hover:text-white bg-black/50 px-4 py-1 rounded-full transition-colors"
                                onClick={() => {
                                    spellSystem.cancelCasting();
                                    // 同时清理 useGameState 的状态
                                    eventBus.emit(GameEvents.CANCEL_SPELL);
                                    actions.updateSpellCasting(null);
                                    // 这里的逻辑可能需要 useGameState 暴露 cancelSpell 方法，或者手动重置
                                    setGame(prev => ({ ...prev, activeCard: null, spellCasting: null }));
                                    setPlayerHand((prev: CardData[]) => [...prev, game.activeCard!]); // 卡牌回手
                                }}
                            >
                        </div>
                        </div>
                    </div>
                )
            )}
            {/* 5. 游戏主界面 */}
            <div className={`w-full h-full relative ${game.screenShake ? 'animate-shake' : ''}`}>

                {/* --- A. 左侧 UI 层 (绝对定位) --- */}
                <div
                    className={`absolute top-[33.5%] left-[5%] w-20 h-20 flex items-center justify-center z-20 rounded-full transition-all
                        ${spellSystem.checkIsTargetable('nexus', 'enemy') ? 'ring-4 ring-red-500 cursor-pointer animate-pulse' : ''}
                    `}
                    onClick={() => spellSystem.isCasting && spellSystem.handleTargetClick('nexus', 'enemy')}
                >
                    <NexusDisplay
                        health={game.enemyNexus}
                        isEnemy={true}
                        damageTaken={game.nexusDamage?.target === 'enemy' ? game.nexusDamage.amount : undefined}
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
                <div
                    className={`absolute bottom-[33.5%] left-[5%] w-20 h-20 flex items-center justify-center z-20 rounded-full transition-all
                         ${spellSystem.checkIsTargetable('nexus', 'player') ? 'ring-4 ring-blue-500 cursor-pointer animate-pulse' : ''}
                    `}
                    onClick={() => spellSystem.isCasting && spellSystem.handleTargetClick('nexus', 'player')}
                >
                    <NexusDisplay
                        health={game.playerNexus}
                        isEnemy={false}
                        damageTaken={game.nexusDamage?.target === 'player' ? game.nexusDamage.amount : undefined}
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
                            selectedChallengerId={selectedChallengerId}
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


                    {/* 5. 我方手牌 (修正：只负责渲染正式游戏手牌) */}
                    <div className="h-32 w-full flex-shrink-0"></div>
                    <div className="absolute left-0 bottom-0 w-full h-48 z-40 pointer-events-none flex justify-center items-end pb-4 overflow-visible">
                        <div className="flex -space-x-4 px-4 items-end">
                            {/* 只有在非换牌阶段，才渲染正式手牌 */}
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

                {/* --- C. 右侧 UI 层 (水晶控制台版) --- */}
                <div className="absolute inset-0 pointer-events-none z-30 overflow-hidden">

                    {/* 1. 核心按钮层 (Layer 1: Bottom) - z-10 */}
                    <div className="absolute top-[47.5%] right-[7.5%] -translate-y-1/2 pointer-events-auto z-10 flex flex-col items-center gap-2">
                        {/* 倒计时 */}
                        <div className={`font-mono text-xl font-bold flex items-center gap-2 bg-black/60 px-3 py-1 rounded-full border border-white/10 ${timeLeft <= 5 ? 'text-red-500 animate-pulse' : 'text-blue-300'}`}>
                            <Clock size={16} /> {String(timeLeft).padStart(2, '0')}
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
                                    // 优先执行配置中的 action，如果没有则走老逻辑(主要是 spellStack 处理)
                                    if ((btnConfig as any).action) {
                                        if (btnConfig.text !== '等待') eventBus.emit(GameEvents.UI_CLICK);
                                        (btnConfig as any).action();
                                    } else {
                                        // 兜底：处理 spellStack (之前 Main Phase 的逻辑)
                                        if (game.spellStack.length > 0) {
                                            eventBus.emit(GameEvents.UI_CLICK);
                                            actions.resolveStack(); // 假设有这个 action
                                        }
                                    }
                                }}
                                disabled={game.turnOwner !== 'player' || game.phase === 'animating'}
                                className={btnConfig.style}
                            >
                                {(btnConfig as any).showFlow && (
                                    <div className="absolute inset-[-10px] rounded-full pointer-events-none overflow-visible z-0">
                                        <svg className="w-full h-full overflow-visible">
                                            <circle cx="50%" cy="50%" r="46%" fill="none" stroke="white" strokeWidth="4" strokeLinecap="round" strokeDasharray="80 250" className="animate-beam-move drop-shadow-[0_0_10px_white] opacity-80" />
                                        </svg>
                                    </div>
                                )}
                                <span className="text-xl font-black text-white drop-shadow-md z-10 relative">{btnConfig.text}</span>
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

            </div>
        </div>
    );
}