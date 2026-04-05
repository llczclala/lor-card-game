import { useState, useRef, useEffect } from 'react';
import type { CardData, GameState, SpellStackItem } from '../types';
import { createCard, CARD_DB } from '../data/cards';
import {  calculateNewMana, getLeveledUpCard} from '../utils/gameRules';
import { executeSpellEffect } from '../logic/spells';
import { resolveSingleCombat} from '../logic/combat';
import { calculateRoundStart, canAfford } from '../logic/core';
import { eventBus, GameEvents } from '../utils/eventBus';
import { applyRoundStartKeywords } from '../logic/keywords'; // [新增]
import { processEffect } from '../logic/effectProcessor';
import type { EffectContext } from '../logic/effectProcessor';
import { EFFECT_DB } from '../data/effectRegistry';

// [修复 A] 显式断言类型，并确保 createCard 返回的是 Partial CardData 或正确的基类
const createFullCard = (key: string): CardData => {
    const base = createCard(key);
    // 强制断言 base 为 Partial<CardData> 以便与后续属性合并
    // 或者直接构建完整对象并断言为 CardData
    return {
        ...base,
        id: Math.random().toString(36).substr(2, 9),
        strikeCount: 0,
        animState: 'idle',
        damageTaken: 0,
        buffs: { power: 0, health: 0 }
    } as CardData;
};

// [修正] 定义 shuffleDeck 函数 (解决 TS2552, TS2304)
const shuffleDeck = <T>(array: T[]): T[] => {
    const newArray = [...array];
    for (let i = newArray.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
    }
    return newArray;
};

// 1. 接收 initialDeck 参数，默认为空数组
export const useGameState = (deck: string[], enemyDeck: string[], isSandbox: boolean = false) => {
    const deckSignature = Array.isArray(deck) ? deck.join(',') : '';
    const enemyDeckSignature = Array.isArray(enemyDeck) ? enemyDeck.join(',') : '';
    // --- 1. 状态定义 ---
    const [combatField, setCombatField] = useState<{attacker: CardData, blocker: CardData | null, owner: 'player' | 'enemy', isChallenged?: boolean}[]>([]);

    const [game, setGame] = useState<GameState>({
        playerMana: 0, playerMaxMana: 0, playerSpellMana: 0,
        enemyMana: 0, enemyMaxMana: 0, enemySpellMana: 0,
        playerNexus: 20, enemyNexus: 20,
        round: 0,
        attackToken: { player: null, enemy: null },
        phase: 'mulligan',
        turnOwner: 'player',
        consecutivePasses: 0,
        spellCasting: null,
        spellStack: [],
        activeCard: null,
        selectedBlockerId: null,
        selectedChallengerId: null, // [新增]
        lastActionTimestamp: 0,
        levelUpCard: null,
        fullArtCard: null,
        gameResult: null,
        screenShake: false,
        nexusDamage: undefined,
        leveledChampions: [],
        stats: {
            nexusDamage: 0,
            unitsPlayed: 0,
            heroesPlayed: 0,
            spellsPlayed: 0,
            unitsKilled: 0,
            heroesKilled: 0,
            heroLevelUps: 0
        }
    });
// 新增：牌库状态 (Deck)
    const [playerDeck, setPlayerDeck] = useState<CardData[]>([]);
    const [enemyDeckState, setEnemyDeckState] = useState<CardData[]>([]);
    // [新增] 将当前手牌全部放回牌库顶端 (用于换牌结束后的衔接)

    const [playerHand, setPlayerHand] = useState<CardData[]>([]);
    const [enemyHand, setEnemyHand] = useState<CardData[]>([]);
    const [playerBench, setPlayerBench] = useState<CardData[]>([]);
    const [enemyBench, setEnemyBench] = useState<CardData[]>([]);

    // 新增：记录胜利时存活的英雄 Key，用于播放对应的胜利 CG
    const [winningHeroKeys, setWinningHeroKeys] = useState<string[]>([]);

    const [message, setMessage] = useState("游戏开始！");

    // 状态 Refs (用于解决异步闭包陈旧数据问题)
    const stateRefs = useRef({ game, playerBench, enemyBench, combatField, playerHand, enemyHand });
    const heroActionHistory = useRef<Set<string>>(new Set());
    const initializedRef = useRef(false);
    const enemyUnitsPlayedRef = useRef(0);

    // [新增] State Ref: 用于在异步循环中获取最新状态 (加入 Deck 状态)
    const stateRef = useRef({ game, combatField, playerBench, enemyBench, playerHand, enemyHand, playerDeck, enemyDeck: enemyDeckState });

    useEffect(() => {
        stateRef.current = { game, combatField, playerBench, enemyBench, playerHand, enemyHand, playerDeck, enemyDeck: enemyDeckState };
    }, [game, combatField, playerBench, enemyBench, playerHand, enemyHand, playerDeck, enemyDeckState]);

    // 辅助函数：异步等待
    const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

    useEffect(() => {
        stateRefs.current = { game, playerBench, enemyBench, combatField, playerHand, enemyHand };
    }, [game, playerBench, enemyBench, combatField, playerHand, enemyHand]);

    useEffect(() => {
        // [新增] 沙盒模式拦截：不自动发牌，不洗牌，直接进入主阶段，给足 99 费用
        if (isSandbox) {
            setGame(prev => ({
                ...prev,
                round: 1,
                phase: 'main',
                turnOwner: 'player',
                playerMana: 10, playerMaxMana: 10, playerSpellMana: 3,
                enemyMana: 10, enemyMaxMana: 10, enemySpellMana: 3,
                attackToken: { player: 'normal', enemy: null },
                consecutivePasses: 0
            }));
            return;
        }

        // 1. 创建完整卡牌对象
        const validPlayerDeck = deck.filter(key => CARD_DB[key]);
        const validEnemyDeck = enemyDeck.filter(key => CARD_DB[key]);

        const pDeck = validPlayerDeck.map(createFullCard);
        const eDeck = validEnemyDeck.map(createFullCard);

        // 2. 洗牌
        // 注意：请确保您有 shuffleDeck 函数，或者用 .sort(() => Math.random() - 0.5) 替代
        const shuffledP = pDeck.sort(() => Math.random() - 0.5);
        const shuffledE = eDeck.sort(() => Math.random() - 0.5);

        // 3. 玩家发牌
        const startHandP = shuffledP.slice(0, 4);
        const remainDeckP = shuffledP.slice(4);

        setPlayerDeck(remainDeckP);
        setPlayerHand(startHandP);

        // 4. 敌方设置
        // [注意] 这里要用我们刚才改名后的 enemyDeckState
        setEnemyDeckState(shuffledE);
        setEnemyHand([]);

    }, [deck, enemyDeck]); // ✅ 修正：依赖项改为 deck 和 enemyDeck

    useEffect(() => {
        // 只有当回合数变化时才检查
        if (game.round > 0) {
            const timer = setTimeout(() => {
                const currentGame = stateRefs.current.game;
                const currentPBench = stateRefs.current.playerBench;
                const currentEBench = stateRefs.current.enemyBench;

                let tempGame = { ...currentGame };
                let tempPBench = [...currentPBench];
                let tempEBench = [...currentEBench];
                let hasEffectTriggered = false;

                const scanAndApply = (units: CardData[], owner: 'player' | 'enemy') => {
                    units.forEach(unit => {
                        if (unit.effects) {
                            unit.effects.forEach(effId => {
                                const def = EFFECT_DB[effId];
                                // 检查时机：ROUND_START
                                if (def && def.timing === 'ROUND_START') {
                                    const ctx: EffectContext = {
                                        game: tempGame,
                                        playerBench: tempPBench,
                                        enemyBench: tempEBench,
                                        playerHand: [],
                                        enemyHand: [],
                                        owner
                                    };

                                    const targets: any[] = [];
                                    if (def.targetRequirements.some(r => r.type.includes('NEXUS'))) {
                                        targets.push({ type: owner === 'player' ? 'player_nexus' : 'enemy_nexus' });
                                    }

                                    const res = processEffect(effId, targets, ctx);
                                    tempGame = res.game;
                                    tempPBench = res.playerBench;
                                    tempEBench = res.enemyBench;
                                    hasEffectTriggered = true;

                                    if (res.events.some(e => e.type === 'gain_token')) {
                                        setMessage(`${unit.name} 发动：获得进攻机会！`);
                                    }
                                }
                            });
                        }
                    });
                };

                scanAndApply(currentPBench, 'player');
                scanAndApply(currentEBench, 'enemy');

                if (hasEffectTriggered) {
                    setGame(tempGame);
                    setPlayerBench(tempPBench);
                    setEnemyBench(tempEBench);
                } else {
                    setMessage(`第 ${currentGame.round} 回合开始`);
                }
            }, 100);

            return () => clearTimeout(timer);
        }
    }, [game.round]);


    // --- 2. 英雄卡变形逻辑 (Champion Spell Transformation) ---
    useEffect(() => {
        // 通用变形处理函数
        const processHandTransformation = (
            currentHand: CardData[],
            unitsOnBoard: CardData[],
            leveledChampions: string[]
        ): { changed: boolean, hand: CardData[] } => {
            // 提取场上英雄的 Key 集合
            const championKeysOnBoard = new Set(
                unitsOnBoard.filter(c => c.isChampion).map(c => c.key)
            );

            let hasChanged = false;

            const nextHand = currentHand.map(card => {
                // --- 情况 A: 英雄 -> 法术 ---
                // 条件：卡牌是英雄 + 场上已有该英雄 + 该英雄定义了关联法术
                if (card.isChampion && championKeysOnBoard.has(card.key) && card.associatedSpellKey) {
                    const spellData = CARD_DB[card.associatedSpellKey];
                    hasChanged = true;
                    // 返回变形后的法术卡，保留 ID 和原始 Key
                    return {
                        ...spellData,
                        id: card.id,
                        associatedChampionKey: card.key,
                        animState: 'transform',
                        isTransformed: true, // 标记：我是变形来的
                        originalBaseKey: card.key
                    } as unknown as CardData;
                }

                // --- 情况 B: 法术 -> 英雄 ---
                // 条件：卡牌是关联法术 + 场上无该英雄 + 该卡是变形来的
                if (card.associatedChampionKey && !championKeysOnBoard.has(card.associatedChampionKey) && (card as any).isTransformed) {
                    const originalKey = (card as any).originalBaseKey || card.associatedChampionKey;

                    // 检查该英雄是否已升级
                    let championData = CARD_DB[originalKey];
                    if (leveledChampions.includes(originalKey)) {
                        championData = getLeveledUpCard(championData as CardData);
                    }
                    hasChanged = true;
                    // 变回英雄
                    return {
                        ...championData,
                        id: card.id,
                        animState: 'transform'
                    } as CardData;
                }

                return card;
            });

            return { changed: hasChanged, hand: nextHand };
        };


        // 1. 处理玩家 (Player)
        const playerUnits = [
            ...playerBench,
            ...combatField.filter(f => f.owner === 'player').map(f => f.attacker),
            ...combatField.filter(f => f.blocker && f.owner === 'enemy').map(f => f.blocker!)
        ];
        const pResult = processHandTransformation(playerHand, playerUnits, stateRef.current.game.leveledChampions);
        if (pResult.changed) setPlayerHand(pResult.hand);

        // 2. 处理敌方 (Enemy) [本次修复的核心]
        const enemyUnits = [
            ...enemyBench,
            ...combatField.filter(f => f.owner === 'enemy').map(f => f.attacker),
            ...combatField.filter(f => f.blocker && f.owner === 'player').map(f => f.blocker!)
        ];
        const eResult = processHandTransformation(enemyHand, enemyUnits, stateRef.current.game.leveledChampions);
        if (eResult.changed) setEnemyHand(eResult.hand);

    }, [playerBench, enemyBench, combatField, playerHand, enemyHand]); // [关键] 依赖列表包含双方状态

       // [升级版] 全局死亡监测 (Death Check System) - 黄金 1.1 秒法则
    // 监听备战席单位，赋予法术/技能击杀充足的特效播放时间
    useEffect(() => {
        const processDeaths = (
            bench: CardData[],
            setBench: React.Dispatch<React.SetStateAction<CardData[]>>,
        ) => {
            let needsUpdate = false;
            const deadUnitsToBroadcast: CardData[] = [];

            const newBench = bench.map(unit => {
                const currentHealth = (unit.health) + (unit.buffs?.health || 0) - (unit.damageTaken || 0);

                // 核心改动：如果血量归零，且还未标记为 dying（防重复触发）
                if (currentHealth <= 0 && unit.animState !== 'dying') {
                    needsUpdate = true;
                    deadUnitsToBroadcast.push(unit);
                    // 缓刑：不直接删除，只挂载死亡标记下发给视图层播放特效
                    return { ...unit, animState: 'dying' as const };
                }
                return unit;
            });

            if (needsUpdate) {
                // 1. 下发 dying 状态，通知 Card.tsx 触发金蝉脱壳与粒子爆炸
                setBench(newBench);

                // 2. 广播死亡事件 (触发语音、统计等)
                deadUnitsToBroadcast.forEach(u => {
                    console.log(`[DeathCheck] ${u.name} died in bench. Initiating shatter VFX.`);
                    eventBus.emit(GameEvents.UNIT_DIE, u);
                });

                // 3. [关键时间轴] 黄金 1.1 秒倒计时后收尸
                // 彻底异步非阻塞，完美避开陈旧闭包 Bug
                setTimeout(() => {
                    setBench(prev => prev.filter(u => u.animState !== 'dying'));
                }, 1100);
            }
        };

        if (playerBench.length > 0) processDeaths(playerBench, setPlayerBench);
        if (enemyBench.length > 0) processDeaths(enemyBench, setEnemyBench);

    }, [playerBench, enemyBench]);


    // --- 3. 基础操作 ---

    const triggerShake = () => {
        setGame(prev => ({ ...prev, screenShake: true }));
        setTimeout(() => setGame(prev => ({ ...prev, screenShake: false })), 500);
    };

    // [重构] 序列化抽卡：利用 Ref 分离读写，彻底修复 StrictMode 下的双重调用 Bug
    const drawCards = async (count: number, owner: 'player' | 'enemy', delay: number = 0) => {
        if (delay > 0) await wait(delay);
        for (let i = 0; i < count; i++) {
            const currentDeck = owner === 'player' ? stateRef.current.playerDeck : stateRef.current.enemyDeck;
            if (currentDeck.length === 0) {
                if (owner === 'player') setMessage("牌库已空！");
                 else {
                    const token = createFullCard('Dream_Guardians_Squad-Martina');
                    setEnemyHand(prev => [...prev, token]);
                }
                if (i < count - 1) await wait(800);
                continue;
            }
            const cardToDraw = currentDeck[0];
            const newDeck = currentDeck.slice(1);
            if (owner === 'player') {
                setPlayerDeck(newDeck);
                setPlayerHand(prev => [...prev, cardToDraw]);
            } else {
                setEnemyDeckState(newDeck);
                setEnemyHand(prev => [...prev, cardToDraw]);
            }
            if (i < count - 1) await wait(2250);
        }
    };

    const startRound = () => {
        heroActionHistory.current.clear();
        enemyUnitsPlayedRef.current = 0;
        eventBus.emit(GameEvents.ROUND_START);
        const currentGameState = stateRef.current.game;
        const nextRoundBase = calculateRoundStart(currentGameState);
        const removeBarrier = (cards: CardData[]) => cards.map(c => ({
            ...c,
            keywords: c.keywords.filter(k => k !== 'Barrier')
        }));
        const nextPlayerBench = applyRoundStartKeywords(removeBarrier(stateRef.current.playerBench));
        const nextEnemyBench = applyRoundStartKeywords(removeBarrier(stateRef.current.enemyBench));
        let tempGame = {
            ...currentGameState,
            ...nextRoundBase,
            spellCasting: null,
            spellStack: [],
            selectedBlockerId: null,
            nexusDamage: undefined,
            lastActionTimestamp: Date.now()
        };
        setGame(tempGame as GameState);
        setPlayerBench(nextPlayerBench);
        setEnemyBench(nextEnemyBench);
    };
    const resetGame = () => {
        const pDeck = initDeck(deck);
        const eDeck = initDeck(enemyDeck);

        // 洗牌并抽初始手牌 (各4张)
        const pHand = pDeck.splice(0, 4);
        const eHand = eDeck.splice(0, 4);

        setPlayerDeck(pDeck);
        setEnemyDeckState(eDeck);
        setPlayerHand(pHand);
        setEnemyHand(eHand);
        setPlayerBench([]);
        setEnemyBench([]);
        setCombatField([]);

        setGame({
            playerMana: 1,
            playerMaxMana: 1,
            playerSpellMana: 0,
            enemyMana: 1,
            enemyMaxMana: 1,
            enemySpellMana: 0,
            round: 1,
            phase: 'main',
            turnOwner: 'player',
            playerNexus: 20,
            enemyNexus: 20,
            playerMaxManaCap: 10,
            enemyMaxManaCap: 10,
            spellStack: [],
            activeCard: null,
            attackToken: { player: 'normal', enemy: null },
            consecutivePasses: 0,
            winner: null,
            gameResult: null,
            levelUpCard: null,
            fullArtCard: null,
            stats: {
                roundsPlayed: 0,
                damageDealt: 0,
                unitsKilled: 0,
                spellsCast: 0,
                longestStreak: 0,
                heroesLeveled: 0,
                nexusHealthRestored: 0
            },
            screenShake: false,
            spellCasting: null
        });

        eventBus.emit(GameEvents.ROUND_START, { round: 1 });
        setMessage("GAME START");
    };

    // --- 4. 战斗系统 ---

    const initiateAttack = () => {
        if (game.phase !== 'main') return;
        if (game.spellStack.length > 0) return;
        setGame(prev => ({ ...prev, phase: 'attack_declare' as const, turnOwner: 'player', consecutivePasses: 0, lastActionTimestamp: Date.now() }));
        setMessage("选择进攻单位");
    };

    const commitAttack = () => {
        if (combatField.length === 0) {
            setGame(prev => ({ ...prev, phase: 'main', lastActionTimestamp: Date.now() }));
            return;
        }

        setGame(prev => ({ ...prev, phase: 'block_declare', turnOwner: 'enemy', consecutivePasses: 0, lastActionTimestamp: Date.now() }));
        setMessage("等待格挡...");
    };


    const resolveCombatAnimation = async () => {
        setGame(prev => ({ ...prev, phase: 'animating' }));
        const totalFights = stateRef.current.combatField.length;
        for (let i = 0; i < totalFights; i++) {
            let currentFight = stateRef.current.combatField[i];
            const { attacker, blocker } = currentFight;
            setCombatField(prev => {
                const n = [...prev];
                n[i] = {
                    ...n[i],
                    attacker: { ...n[i].attacker, animState: 'attacking' } as CardData,
                    blocker: n[i].blocker ? { ...n[i].blocker, animState: 'attacking' } as CardData : null
                };
                return n;
            });

            // 音效与节奏控制
            const hasQuickAttack = attacker.keywords.includes('QuickAttack');
            let impactDelay = 250;

            if (!blocker) {
                setTimeout(() => eventBus.emit(GameEvents.SFX_STRIKE_NEXUS), 250);
            } else {
                if (hasQuickAttack) {
                    setTimeout(() => eventBus.emit(GameEvents.SFX_QUICK_ATTACK), 320);
                    impactDelay = 320;
                } else {
                    setTimeout(() => eventBus.emit(GameEvents.SFX_STRIKE_NORMAL), 250);
                }
            }

            // 等待直到撞击发生
            await wait(impactDelay + 150);
            const gameSnapshot = stateRef.current.game;
            const result = resolveSingleCombat(currentFight, gameSnapshot);

            // 1. 广播死亡事件 & [新增] 击杀事件
            result.killedUnits.forEach(deadUnit => {
                // A. 广播死亡 (受害者)
                eventBus.emit(GameEvents.UNIT_DIE, deadUnit);

                // B. 寻找凶手并广播击杀
                // 逻辑：如果死者是进攻者，凶手就是格挡者；如果死者是格挡者，凶手就是进攻者
                let killer: CardData | null = null;
                if (deadUnit.id === currentFight.attacker.id && currentFight.blocker) {
                    killer = currentFight.blocker;
                } else if (currentFight.blocker && deadUnit.id === currentFight.blocker.id) {
                    killer = currentFight.attacker;
                }

                if (killer) {
                    // C. 判定凶手是否为我方单位 (只有我方单位击杀时才播放语音)
                    // 逻辑：
                    // - 如果攻击是 player 发起的：Attacker 是 Player, Blocker 是 Enemy
                    // - 如果攻击是 enemy 发起的：Attacker 是 Enemy, Blocker 是 Player
                    const isAttackerPlayer = currentFight.owner === 'player';
                    const isKillerAttacker = killer.id === currentFight.attacker.id;

                    // 这里的逻辑是：(我是进攻方且凶手是进攻者) 或 (我是防守方且凶手是防守者) => 凶手是我
                    const isPlayerKiller = (isAttackerPlayer && isKillerAttacker) || (!isAttackerPlayer && !isKillerAttacker);

                    if (isPlayerKiller) {
                        // 稍微延迟 0.1秒，避免和死亡语音完全重叠，体验更好
                        setTimeout(() => {
                            eventBus.emit(GameEvents.UNIT_KILL, killer);
                        }, 100);
                    }
                }
            });

            // 2. 更新全局 State
            // 更新战场卡牌状态
            setCombatField(prev => {
                const n = [...prev];
                n[i] = result.updatedFight;
                return n;
            });

            // [新增] 计算本轮战斗的统计增量
            let statsDelta = { nexus: 0, uKilled: 0, hKilled: 0, hLevel: 0 };

            // 1. 水晶伤害
            if (result.nexusDamage && result.nexusDamage.target === 'enemy') {
                statsDelta.nexus = result.nexusDamage.amount;
            }

            // 2. 击杀统计 (需判断死者归属)
            result.killedUnits.forEach(deadUnit => {
                // 在当前战场快照中查找死者的拥有者
                // 逻辑：如果是 'player' 发起的战斗，blocker 是 enemy；如果是 'enemy' 发起的，attacker 是 enemy
                const fight = stateRef.current.combatField.find(f => f.attacker.id === deadUnit.id || f.blocker?.id === deadUnit.id);
                if (fight) {
                    const isDeadUnitEnemy = fight.attacker.id === deadUnit.id
                        ? fight.owner === 'enemy'
                        : fight.owner === 'player'; // 如果死的是 blocker 且战斗是 player 发起的，那 blocker 就是 enemy

                    if (isDeadUnitEnemy) {
                        if (deadUnit.isChampion) statsDelta.hKilled++;
                        else statsDelta.uKilled++;
                    }
                }
            });

            // 3. 升级统计
            if (result.levelUpUpdate) {
                const card = result.levelUpUpdate;
                // 简单判断：如果当前触发升级的卡牌在战场上归属于 player (进攻或防守)
                const fight = stateRef.current.combatField.find(f => f.attacker.id === card.id || f.blocker?.id === card.id);
                const isPlayerCard = fight && (fight.attacker.id === card.id ? fight.owner === 'player' : fight.owner === 'enemy');

                if (isPlayerCard) {
                    statsDelta.hLevel++;
                }
            }

            // 更新水晶血量 & [新增] 更新统计数据
            if (result.nexusDamage || statsDelta.uKilled > 0 || statsDelta.hKilled > 0 || statsDelta.hLevel > 0) {
                const { target, amount } = result.nexusDamage || { target: 'none', amount: 0 };
                setGame(prev => ({
                    ...prev,
                    playerNexus: target === 'player' ? prev.playerNexus - amount : prev.playerNexus,
                    enemyNexus: target === 'enemy' ? prev.enemyNexus - amount : prev.enemyNexus,
                    nexusDamage: result.nexusDamage,
                    // [新增] 合并统计数据
                    stats: {
                        ...prev.stats,
                        nexusDamage: prev.stats.nexusDamage + statsDelta.nexus,
                        unitsKilled: prev.stats.unitsKilled + statsDelta.uKilled,
                        heroesKilled: prev.stats.heroesKilled + statsDelta.hKilled,
                        heroLevelUps: prev.stats.heroLevelUps + statsDelta.hLevel
                    }
                }));
            } else if (result.nexusDamage)
            {
                const { target, amount } = result.nexusDamage;
                setGame(prev => ({
                    ...prev,
                    playerNexus: target === 'player' ? prev.playerNexus - amount : prev.playerNexus,
                    enemyNexus: target === 'enemy' ? prev.enemyNexus - amount : prev.enemyNexus,
                    nexusDamage: result.nexusDamage
                }));
            }

            // 更新升级展示
            if (result.levelUpUpdate) {
                const leveledCard = result.levelUpUpdate;
                const heroKey = leveledCard.key;
                setGame(prev => {
                    // 如果列表里还没有这个英雄，加进去
                    const newLeveledList = prev.leveledChampions.includes(heroKey)
                        ? prev.leveledChampions
                        : [...prev.leveledChampions, heroKey];

                    return {
                        ...prev,
                        levelUpCard: leveledCard,
                        leveledChampions: newLeveledList
                    };
                });
                const upgradeList = (list: CardData[]) => {
                    return list.map(c => {
                        // 如果是该英雄且还没升级 (Level 1)
                        if (c.key === heroKey && c.level === 1) {
                            return { ...getLeveledUpCard(c), id: c.id }; // 保持 ID，升级数据
                        }
                        return c;
                    });
                };
                setPlayerDeck(prev => upgradeList(prev));
                setPlayerHand(prev => upgradeList(prev));
                setPlayerBench(prev => upgradeList(prev)); // 备战席的其他同名卡也一起升级
                await wait(200);
                while (stateRef.current.game.levelUpCard !== null) {
                    await wait(200);
                }
            }
            await wait(600);
            setGame(prev => ({ ...prev, nexusDamage: undefined }));
        }

        // 3. 战斗结束清理
        await wait(500);

        // 收集幸存者 (逻辑同前，从最终的 combatField 中筛选)
        const finalField = stateRef.current.combatField;
        const survivorsP: CardData[] = [];
        const survivorsE: CardData[] = [];

        finalField.forEach(f => {
            if (f.attacker.health > 0) {
                const unit = { ...f.attacker, animState: 'idle', damageTaken: 0 };
                if (f.owner === 'player') survivorsP.push(unit as any);
                else survivorsE.push(unit as any);
            }
            if (f.blocker && f.blocker.health > 0) {
                const unit = { ...f.blocker, animState: 'idle', damageTaken: 0 };
                if (f.owner === 'player') survivorsE.push(unit as any);
                else survivorsP.push(unit as any);
            }
        });

        // 胜负判定
        const pNexus = stateRef.current.game.playerNexus;
        const eNexus = stateRef.current.game.enemyNexus;
        const newGameResult = pNexus <= 0 ? 'defeat' : (eNexus <= 0 ? 'victory' : null);

        if (newGameResult === 'victory') {
            const heroes = survivorsP.filter(c => c.isChampion).map(c => c.key);
            setWinningHeroKeys(heroes);
        }

        // 归位
        setGame(prev => {
            // [修正] 战斗后只消耗发起进攻一方的 Token
            // 假设 finalField[0].owner 是发起方 (如果不为空)
            // 这里做一个安全检查
            const currentFights = stateRef.current.combatField;
            const attackerOwner = currentFights.length > 0 ? currentFights[0].owner : null;

            const nextAttackToken = { ...prev.attackToken };
            if (attackerOwner) {
                nextAttackToken[attackerOwner] = null;
            }

            return {
                ...prev,
                gameResult: newGameResult,
                phase: 'main',
                turnOwner: prev.attackToken.player ? 'enemy' : 'player', // 简单轮换，或者根据 attackerOwner 轮换
                attackToken: nextAttackToken, // 应用更新后的 Token 状态
                consecutivePasses: 0,
                lastActionTimestamp: Date.now()
            };
        });

        setPlayerBench(prev => [...prev, ...survivorsP]);
        setEnemyBench(prev => [...prev, ...survivorsE]);
        setCombatField([]);
    };

    // --- 5. 施法与出牌 ---

    const startSpellCasting = (card: CardData) => {
        setPlayerHand(prev => prev.filter(c => c.id !== card.id));
        setGame(prev => ({
            ...prev, activeCard: card,
            spellCasting: { cardId: card.id, step: 'select_ally', targets: [], allyId: undefined }
        }));
        setMessage("选择目标");
    };

    const updateSpellCasting = (newState: any) => setGame(prev => ({ ...prev, spellCasting: newState }));

    const finalizeSpell = (card: CardData, owner: 'player' | 'enemy', targets: any[]) => {
        const { newMana, newSpellMana } = calculateNewMana(
            card.cost,
            owner === 'player' ? game.playerMana : game.enemyMana,
            owner === 'player' ? game.playerSpellMana : game.enemySpellMana,
            false
        );

        setGame(prev => owner === 'player'
            ? { ...prev, playerMana: newMana, playerSpellMana: newSpellMana }
            : { ...prev, enemyMana: newMana, enemySpellMana: newSpellMana }
        );

        setGame(prev => ({ ...prev, spellCasting: null, activeCard: null }));

        if (card.type === 'spell-burst') {
            executeSpellEffect(card.key, owner, targets, {
                game, setGame, playerBench, setPlayerBench, enemyBench, setEnemyBench, playerHand, setPlayerHand, triggerShake
            });
            // 修复：必须将 phase 重置为 'main'，否则游戏会卡在 animating 状态无法操作
            setGame(prev => ({ ...prev, phase: 'main', lastActionTimestamp: Date.now() }));
            setMessage("极速法术生效");
        } else {
            const stackItem: SpellStackItem = { card, owner, targets };
            setGame(prev => ({
                ...prev,
                spellStack: [stackItem, ...prev.spellStack],
                turnOwner: owner === 'player' ? 'enemy' : 'player',
                consecutivePasses: 0,
                lastActionTimestamp: Date.now(),
                phase: 'main' // <--- 关键修复：解除 'animating' 锁定，激活 AI
            }));
            setMessage("法术入栈");
        }
    };

    const playCard = (card: CardData, owner: 'player' | 'enemy', targets: any[] = []) => {

        if (owner === 'player') {
            const { playerMana, playerSpellMana } = stateRef.current.game;
            if (!canAfford(card, playerMana, playerSpellMana)) {
                setMessage("法力不足！");
                return;
            }
        }

        if (owner === 'player' && card.isLevel2Choice && card.associatedChampionKey) {
            const champKey = card.associatedChampionKey;
            const hasLv2 = playerBench.some(c => c.key === champKey && c.level === 2);

            if (hasLv2) {
                setGame(prev => ({
                    ...prev,
                    activeCard: card,
                    spellCasting: {
                        cardId: card.id,
                        step: 'choose_mode',
                        targets: [],
                        allyId: undefined
                    }
                }));
                setMessage("请抉择：点击左侧或右侧卡牌");
                return;
            } else {
                const targetKey = (champKey === 'lyfe' ? 'lyfe_rush' : 'fenny_strike');
                const transformed = createFullCard(targetKey);
                card = { ...transformed, id: card.id };
            }
        }

        // [新增] 触发语音事件
        // 1. 播放登场语音 (PLAY_CARD_VOICE)
        if (card.type.includes('unit')) {
            // 1. 播放自身登场语音
            eventBus.emit(GameEvents.PLAY_CARD_VOICE, card);

            // 2. 敌人出现判定 (ENEMY_SPAWN)
            // 条件：敌方打出 + 本回合第一张单位 + 我方备战席有英雄
            if (owner === 'enemy') {
                enemyUnitsPlayedRef.current += 1;

                if (enemyUnitsPlayedRef.current === 1) {
                    const hasPlayerHero = stateRef.current.playerBench.some(c => c.isChampion);
                    if (hasPlayerHero) {
                        // 稍微延迟一点触发，让它排在登场语音之后进入队列
                        setTimeout(() => {
                            eventBus.emit(GameEvents.ENEMY_SPAWN, card);
                        }, 200);
                    }
                }
            }
        }

        // 2. 敌人出现判定 (ENEMY_SPAWN)
        // 如果是敌方出牌，且敌方备战席之前是空的，触发互动语音
        if (owner === 'enemy' && enemyBench.length === 0 && card.type.includes('unit')) {
            eventBus.emit(GameEvents.ENEMY_SPAWN, card);
        }

        // --- 扣费与手牌移除逻辑 ---
        const isUnit = card.type.includes('unit');

        // 修复：双重扣费BUG
        // 只有【单位卡】在这里立即扣费并更新状态。
        if (isUnit) {
            const { newMana, newSpellMana } = calculateNewMana(
                card.cost,
                owner === 'player' ? game.playerMana : game.enemyMana,
                owner === 'player' ? game.playerSpellMana : game.enemySpellMana,
                true // isUnit = true
            );

            // 只有单位才在这里扣费
            setGame(prev => owner === 'player'
                ? { ...prev, playerMana: newMana, playerSpellMana: newSpellMana }
                : { ...prev, enemyMana: newMana, enemySpellMana: newSpellMana }
            );
        }

        // 无论单位还是法术，都要从手牌移除
        if (owner === 'player') setPlayerHand(prev => prev.filter(c => c.id !== card.id));
        else setEnemyHand(prev => prev.filter(c => c.id !== card.id));

        // --- 播放出牌动画 ---
        setGame(prev => {
            const newStats = { ...prev.stats };

            // 仅统计我方 (Player) 的出牌行为
            if (owner === 'player') {
                if (card.isChampion) {
                    newStats.heroesPlayed += 1;
                } else if (card.type.includes('unit')) {
                    newStats.unitsPlayed += 1;
                } else {
                    newStats.spellsPlayed += 1;
                }
            }

            return {
                ...prev,
                stats: newStats,
                phase: 'animating',
                activeCard: card
            };
        });

        setTimeout(() => {
            setGame(prev => ({ ...prev, activeCard: null }));
            if (isUnit) {
                // 单位：直接上场
                if (owner === 'player') setPlayerBench(prev => [...prev, card]);
                else setEnemyBench(prev => [...prev, card]);

                // 单位上场后交换攻守权
                setGame(prev => ({
                    ...prev,
                    phase: 'main',
                    turnOwner: owner === 'player' ? 'enemy' : 'player',
                    consecutivePasses: 0,
                    lastActionTimestamp: Date.now()
                }));
            } else {
                // 法术：进入结算流程 (finalizeSpell 会负责扣费)
                finalizeSpell(card, owner, targets);
            }
        }, 600);
    };

    // 新增：处理玩家的抉择 (Left=小技能, Right=大招)
    const resolveChoice = (choice: 'left' | 'right') => {
        const originalCard = game.activeCard;
        // 防御性检查
        if (!originalCard || !game.spellCasting || game.spellCasting.step !== 'choose_mode') return;
        const heroData = playerBench.find(c => c.key === originalCard.associatedChampionKey);
        if (heroData) {
            eventBus.emit(GameEvents.SPELL_CHOICE, {
                hero: heroData,
                choice: choice === 'left' ? 'small' : 'ultimate'
            });
        }

        const champKey = originalCard.associatedChampionKey;
        let targetKey = '';

        // 根据选择决定变成哪张卡
        if (champKey === 'lyfe') {
            targetKey = choice === 'left' ? 'lyfe_rush' : 'lyfe_ultimate';
        } else if (champKey === 'fenny') {
            targetKey = choice === 'left' ? 'fenny_strike' : 'fenny_ultimate';
        }

        // 1. 退出抉择显示状态
        setGame(prev => ({ ...prev, spellCasting: null, activeCard: null }));

        // 2. 创建新卡并打出
        const transformed = createFullCard(targetKey);
        // 重要：使用原始卡牌的 ID，这样 playCard 里的 filter 才能正确移除手牌里的旧卡
        playCard({ ...transformed, id: originalCard.id }, 'player');
    };

    const resolveStack = async () => {
      setGame(prev => ({ ...prev, phase: 'animating' }));
      const stack = [...stateRefs.current.game.spellStack];
      for (const spell of stack) {
          setMessage(`结算: ${spell.card.name}`);
          await new Promise(r => setTimeout(r, 1000));
          executeSpellEffect(spell.card.key, spell.owner, spell.targets, {
             game: stateRefs.current.game, setGame,
             playerBench: stateRefs.current.playerBench, setPlayerBench,
             enemyBench: stateRefs.current.enemyBench, setEnemyBench,
             playerHand: stateRefs.current.playerHand, setPlayerHand,
             triggerShake, setMessage
          });
          setGame(prev => ({ ...prev, spellStack: prev.spellStack.filter(s => s.card.id !== spell.card.id) }));
      }
      setGame(prev => ({ ...prev, phase: 'main', spellStack: [], consecutivePasses: 0 }));
      setMessage("法术结算完毕");
    };

    const passTurn = () => {
        if (game.spellStack.length > 0 && game.consecutivePasses === 0) {
             setGame(prev => ({ ...prev, consecutivePasses: 1 }));
             resolveStack();
             return;
        }
        if (game.consecutivePasses >= 1) startRound();
        else setGame(prev => ({ ...prev, turnOwner: prev.turnOwner === 'player' ? 'enemy' : 'player', consecutivePasses: prev.consecutivePasses + 1, lastActionTimestamp: Date.now() }));
    };

    const toggleAttacker = (card: CardData, toCombat: boolean) => {
        if (toCombat) {
            // [新增] 进攻上场语音：检查是否是本回合首次行动
            if (card.isChampion && !heroActionHistory.current.has(card.id)) {
                eventBus.emit(GameEvents.HERO_FIRST_ACTION, card);
                heroActionHistory.current.add(card.id);
            }

            setPlayerBench(prev => prev.filter(c => c.id !== card.id));
            setCombatField(prev => [...prev, { attacker: card, blocker: null, owner: 'player' }]);
        } else {
            setCombatField(prev => prev.filter(c => c.attacker.id !== card.id));
            setPlayerBench(prev => [...prev, card]);
        }
    };

    const selectBlocker = (id: string) => {
        setGame(prev => ({...prev, selectedBlockerId: prev.selectedBlockerId === id ? null : id}));
        setMessage("选择要格挡的敌方单位");
    };

    const assignBlocker = (fightIndex: number, blockerId: string) => {
        if (combatField[fightIndex].blocker !== null) return;
        const blocker = playerBench.find(c => c.id === blockerId);

        if (blocker) {
            const attacker = combatField[fightIndex].attacker;
            // [新增] Elusive (隐秘) 判定
            // 规则：如果攻击者有隐秘，阻挡者必须也有隐秘
            if (attacker.keywords.includes('Elusive') && !blocker.keywords.includes('Elusive')) {
                setMessage("只有【隐秘】单位能阻挡【隐秘】单位！");
                return;
            }

            setPlayerBench(prev => prev.filter(c => c.id !== blocker.id));
            setCombatField(prev => {
                const n = [...prev];
                n[fightIndex] = { ...n[fightIndex], blocker: blocker,isChallenged: false };
                return n;
            });
            setGame(prev => ({...prev, selectedBlockerId: null}));
        }


    };

    // [修正] 格挡撤回逻辑 (智能归位)
    const recallBlocker = (fightIndex: number) => {
        const combat = combatField[fightIndex];
        if (combat && combat.blocker) {
            const blockerCard = combat.blocker;

            // 1. 移除战场上的阻挡者 (保持不变)
            setCombatField(prev => {
                const n = [...prev];
                n[fightIndex] = { ...n[fightIndex], blocker: null };
                return n;
            });

            // 2. [关键修复] 根据“战斗发起者(combat.owner)”来判断阻挡者归属
            // 逻辑：如果这场战斗是 'player' 发起的，那 blocker 必然是 'enemy' (被挑战的敌人) -> 必须回敌方备战席
            // 逻辑：如果这场战斗是 'enemy' 发起的，那 blocker 必然是 'player' (我去阻挡) -> 回我方备战席
            if (combat.owner === 'player') {
                setEnemyBench(prev => [...prev, blockerCard]);
            } else {
                setPlayerBench(prev => [...prev, blockerCard]);
            }
        }
    };
// [新增] 选中/取消选中 我方挑战者
    const selectChallenger = (id: string) => {
        setGame(prev => ({
            ...prev,
            selectedChallengerId: prev.selectedChallengerId === id ? null : id
        }));
        setMessage(game.selectedChallengerId === id ? "取消选择" : "选择要拉取的敌方单位");
    };

    // [新增] 执行挑战：将敌方备战席单位强行拉入战斗
    const challengeEnemy = (attackerId: string, enemyId: string) => {
        const enemyUnit = enemyBench.find(c => c.id === enemyId);
        if (!enemyUnit) return;

        // 找到攻击者所在的战场位置
        const combatIndex = combatField.findIndex(f => f.attacker.id === attackerId);
        if (combatIndex === -1) return;

        // 如果该位置已经有阻挡者了，先把它踢回备战席
        const oldBlocker = combatField[combatIndex].blocker;

        setEnemyBench(prev => {
            const newBench = prev.filter(c => c.id !== enemyId);
            if (oldBlocker) newBench.push(oldBlocker);
            return newBench;
        });

        setCombatField(prev => {
            const n = [...prev];
            // [修正] 增加 isChallenged: true 标记，表示这是一个被迫的格挡
            n[combatIndex] = {
                ...n[combatIndex],
                blocker: enemyUnit,
                isChallenged: true
            };
            return n;
        });

        setGame(prev => ({ ...prev, selectedChallengerId: null }));
        setMessage("挑战成功！");
    };

    useEffect(() => {
        // [修改] 沙盒模式下，阻止自动调用 startRound (因为我们在上面的 hook 里已经手动设好第一回合状态了)
        if (!initializedRef.current && !isSandbox) startRound();
    }, [isSandbox]);


    const replaceOpeningHand = async (indicesToReplace: number[]) => {
        if (indicesToReplace.length === 0) return;

        // 1. 获取要替换的卡牌
        const cardsToReplace = indicesToReplace.map(index => playerHand[index]);

        // 3. 将被替换的卡洗回牌库 (简单处理：加到末尾并洗牌，或者随机插入)
        // 这里我们模拟洗牌：先合并，再打乱
        let newDeck = [...playerDeck, ...cardsToReplace];
        newDeck = newDeck.sort(() => Math.random() - 0.5);

        // 4. 从新牌库中抽取等量的新卡
        const numToDraw = indicesToReplace.length;
        const newCards = newDeck.slice(0, numToDraw);
        const remainingDeck = newDeck.slice(numToDraw);

        const finalHand = [...playerHand];
        let newCardIdx = 0;
        indicesToReplace.forEach(handIndex => {
            finalHand[handIndex] = newCards[newCardIdx++];
        });

        // 模拟网络延迟或洗牌时间
        await wait(500);

        setPlayerDeck(remainingDeck);
        setPlayerHand(finalHand);
    };

    const performMulligan = async (indicesToReplace: number[]) => {
        const currentHand = [...playerHand];
        const currentDeck = [...playerDeck];

        // 1. 处理玩家换牌逻辑
        if (indicesToReplace.length > 0) {
            const cardsToReplace = indicesToReplace.map(i => currentHand[i]);
            // 从牌库顶抽新牌
            const newCards = currentDeck.splice(0, indicesToReplace.length);
            // 旧牌洗回牌库
            const newDeck = shuffleDeck([...currentDeck, ...cardsToReplace]);

            // 替换手牌中的对应位置
            let newCardIdx = 0;
            indicesToReplace.forEach(i => {
                currentHand[i] = newCards[newCardIdx++];
            });

            setPlayerDeck(newDeck);
            setPlayerHand(currentHand);
        }

        // 2. [关键] 给敌方发牌 (此时才发，确保安全)
        const currentEnemyDeck = [...stateRef.current.enemyDeck];
        const enemyStartingHand = currentEnemyDeck.splice(0, 4);
        setEnemyDeck(currentEnemyDeck);
        setEnemyHand(enemyStartingHand);

        // 3. 模拟动画延迟
        await new Promise(resolve => setTimeout(resolve, 800));

        // 4. [核心修复] 强制设置 Round 1 状态
        // 不依赖 startRound()，而是直接写入第一回合的正确状态
        // 这样可以确保 Mana, AttackToken 等资源一步到位
        setGame(prev => ({
            ...prev,
            round: 1,               // 第1回合
            phase: 'main',          // 进入主阶段
            turnOwner: 'player',    // 奇数回合玩家先手
            playerMana: 1,          // 玩家1费
            playerMaxMana: 1,
            playerSpellMana: 0,
            enemyMana: 1,           // 敌方1费
            enemyMaxMana: 1,
            enemySpellMana: 0,
            attackToken: { player: 'normal', enemy: null }, // 玩家获得进攻币
            consecutivePasses: 0
        }));

        eventBus.emit(GameEvents.ROUND_START, { round: 1 });
        setMessage("ROUND 1 START");
    };

    const requeueHandToDeck = () => {
        // 将手牌(4张)加到牌库最前面
        setPlayerDeck(prev => [...playerHand, ...prev]);
        // 清空手牌，等待 drawCards 重新抽取
        setPlayerHand([]);
    };

    return {
        game, setGame,
        playerHand, setPlayerHand,
        enemyHand, setEnemyHand,
        playerBench, setPlayerBench,
        enemyBench, setEnemyBench,
        combatField, setCombatField,
        winningHeroKeys,
        message, setMessage,
        actions: {
            startRound,
            resetGame,
            initiateAttack,
            commitAttack,
            passTurn,
            playCard,
            resolveCombatAnimation,
            drawCards,
            startSpellCasting,
            updateSpellCasting,
            finalizeSpell,
            toggleAttacker,
            selectBlocker,
            assignBlocker,
            recallBlocker,
            resolveStack,
            closeLevelUp: () => setGame(prev => ({...prev, levelUpCard: null})),
            resolveChoice,
            selectChallenger, // [关键] 导出新增的函数
            challengeEnemy,    // [关键] 导出新增的函数
            replaceOpeningHand,
            performMulligan, // [新增]
            requeueHandToDeck
        }
    };
};