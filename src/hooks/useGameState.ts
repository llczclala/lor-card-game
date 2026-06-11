import { useState, useRef, useEffect } from 'react';
import type { CardData, GameState, SpellStackItem } from '../types';
import { createCard, CARD_DB } from '../data/cards';
import {  calculateNewMana, getLeveledUpCard} from '../utils/gameRules';
import { executeSpellEffect } from '../logic/spells';
import { resolveSingleCombat} from '../logic/combat';
import { calculateRoundStart, canAfford } from '../logic/core';
import { eventBus, GameEvents } from '../utils/eventBus';
import { applyRoundStartKeywords, applyRoundEndKeywords, resolveTitanPulse } from '../logic/keywords'; // [新增] 引入回合结束扫荡 + 泰坦脉冲
import { processEffect } from '../logic/effectProcessor';
import type { EffectContext } from '../logic/effectProcessor';
import { EFFECT_DB } from '../data/effectRegistry';
import { checkCardLevelUp } from '../utils/gameRules';

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
        buffs: { power: 0, health: 0 },
        roundBuffs: { power: 0, health: 0 }, // [新增] 初始化临时账本
        roundStrikes: 0, // [新增] 初始化本回合打击数
        // [核心修复] 初始充能写死在建卡瞬间！从牌库抽出来时就已经装好电池了
        customProgress: key === 'Chongye_Squad_Elice' ? 1 : 0,
        // [能力] 初始化运行时状态：在牌库/手牌中时隐藏，上场后由 playCard 设为 breathing
        abilityState: (base as any).ability ? 'hidden' as const : undefined,
        abilityCharges: (base as any).ability?.maxCharges,
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
        pendingSpell: null,
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
        pendingLevelUps: [], // [新增] 初始化待升级队列
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
    const [playerInitialDeckInfo, setPlayerInitialDeckInfo] = useState<{ heroes: CardData[], regions: string[] }>({ heroes: [], regions: [] });
    const [enemyInitialDeckInfo, setEnemyInitialDeckInfo] = useState<{ heroes: CardData[], regions: string[] }>({ heroes: [], regions: [] });
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
    // 👇 [新增] 微队列缓冲区 (Micro-Queue Buffer)
    const pendingActionsRef = useRef<{ type: string; payload?: any }[]>([]);
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

        const extractDeckInfo = (deckCards: CardData[]) => {
            const heroes = deckCards.filter(c => c.isChampion);
            // 根据 key 去重（同名英雄只展示一张）
            const uniqueHeroes = heroes.filter((h, i, arr) => arr.findIndex(x => x.key === h.key) === i);
            const regions = Array.from(new Set(deckCards.map(c => c.region)));
            return { heroes: uniqueHeroes, regions };
        };
        setPlayerInitialDeckInfo(extractDeckInfo(pDeck));
        setEnemyInitialDeckInfo(extractDeckInfo(eDeck));

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
                                // [核心修复] 放宽匹配！允许识别 'ON_PLAY_AND_ROUND_START'
                                if (def && def.timing.includes('ROUND_START')) {
                                    const ctx: EffectContext = {
                                        game: tempGame,
                                        playerBench: tempPBench,
                                        enemyBench: tempEBench,
                                        playerHand: [],
                                        enemyHand: [],
                                        owner,
                                        sourceCard: unit
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

                // [核心修正] 防重复触发必须同时放过 dying 和 ephemeral_dying，绝不能用普通死亡覆盖瞬息死亡！
                if (currentHealth <= 0 && unit.animState !== 'dying' && unit.animState !== 'ephemeral_dying') {
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

                // 3. [关键时间轴] 收尸法则延时至 1.8 秒，以便瞬息动画(ephemeral_dying)及常规死亡播完
                // 彻底异步非阻塞，完美避开陈旧闭包 Bug
                setTimeout(() => {
                    setBench(prev => prev.filter(u => u.animState !== 'dying' && u.animState !== 'ephemeral_dying'));
                }, 2500);
            }
        };

        if (playerBench.length > 0) processDeaths(playerBench, setPlayerBench);
        if (enemyBench.length > 0) processDeaths(enemyBench, setEnemyBench);

    }, [playerBench, enemyBench]);

    // ==========================================
    // [重构] 场上目睹机制 (Local Witness System) - 微队列版
    // 监听到广播后，不再直接修改状态，而是向微队列中推入一个待办动作
    // ==========================================
    useEffect(() => {
        const handleNexusStrike = (payload: { target: 'player' | 'enemy', amount: number }) => {
            // 卜卜只在乎敌方水晶是否挨打
            if (payload.target === 'enemy') {
                // 写一张条子，塞进微队列缓冲区
                pendingActionsRef.current.push({ type: 'NEXUS_STRIKED', payload });
            }
        };

        eventBus.on(GameEvents.NEXUS_STRIKED, handleNexusStrike);
        return () => eventBus.off(GameEvents.NEXUS_STRIKED, handleNexusStrike);
    }, []);

    // ==========================================
    // [新增] 高情商智能裁判 (State-Based Actions Check)
    // 负责全局胜负判定，完美支持法术斩杀与战斗溢出伤害 (Overkill) 爽点
    // ==========================================
    useEffect(() => {
        // 核心过滤：让子弹飞一会儿！
        // 只要系统还在播动画 (animating)、换牌 (mulligan) 或已经结算，裁判就保持沉默
        if (game.phase === 'animating' || game.phase === 'mulligan' || game.gameResult !== null) {
            return;
        }

        // 只要回到静态等待阶段 (如 main)，立刻核查水晶血量
        if (game.playerNexus <= 0 || game.enemyNexus <= 0) {
            const finalResult = game.playerNexus <= 0 ? 'defeat' : 'victory';

            // 收集胜利时的场上英雄，用于播放 MVP 动画
            if (finalResult === 'victory') {
                const heroes = playerBench.filter(c => c.isChampion).map(c => c.key);
                setWinningHeroKeys(heroes);
            }

            setGame(prev => ({ ...prev, gameResult: finalResult }));
        }
    }, [game.playerNexus, game.enemyNexus, game.phase, game.gameResult, playerBench]);

    // ==========================================
    // [新增] 全局觉醒光环 (State-Based Level Up Aura)
    // 监听水晶血量及场上人员变化。一旦满足条件（如芬妮的半血觉醒），立刻强制触发升级队列！
    // ==========================================
    useEffect(() => {
        // 防止在结算动画或换牌期间乱入触发，造成 UI 撕裂
        if (game.phase === 'animating' || game.phase === 'mulligan' || game.gameResult !== null) return;

        let hasLeveledUp = false;
        const leveledHeroes: CardData[] = [];

        // 全场雷达扫描：检查场上是否有达到升级条件的 1 级英雄
        const scanAndLevelUp = (bench: CardData[]) => {
            bench.forEach(card => {
                if (card.isChampion && card.level === 1 && !game.leveledChampions.includes(card.key)) {
                    if (checkCardLevelUp(card, game.playerNexus, game.enemyNexus)) {
                        hasLeveledUp = true;
                        const leveled = { ...getLeveledUpCard(card), id: card.id };
                        // 严防死守：死人禁止诈尸升级
                        if (leveled.animState !== 'dying' && leveled.animState !== 'ephemeral_dying') {
                            leveledHeroes.push(leveled);
                        }
                    }
                }
            });
        };

        scanAndLevelUp(playerBench);
        scanAndLevelUp(enemyBench);

        if (hasLeveledUp && leveledHeroes.length > 0) {
            const newKeys = leveledHeroes.map(h => h.key);

            // 1. 把英雄送进顶层升级调度队列，UI层将无条件接管屏幕播放动画
            setGame(prev => ({
                ...prev,
                leveledChampions: [...new Set([...prev.leveledChampions, ...newKeys])],
                pendingLevelUps: [...(prev.pendingLevelUps || []), ...leveledHeroes]
            }));

            // 2. 物理洗牌：把牌库、手牌、备战席里所有的同名 1 级英雄直接替换为 2 级
            const upgradeList = (list: CardData[]) => {
                return list.map(c => {
                    if (newKeys.includes(c.key) && c.level === 1) {
                        return { ...getLeveledUpCard(c), id: c.id };
                    }
                    return c;
                });
            };

            setPlayerBench(prev => upgradeList(prev));
            setEnemyBench(prev => upgradeList(prev));
            setPlayerHand(prev => upgradeList(prev));
            setEnemyHand(prev => upgradeList(prev));
            setPlayerDeck(prev => upgradeList(prev));
            setEnemyDeckState(prev => upgradeList(prev)); // 彻底贯彻全局觉醒
        }
    // [关键依赖] 水晶血量变化、备战席人员变化，都会唤醒这套扫描引擎！
    }, [game.playerNexus, game.enemyNexus, playerBench, enemyBench, game.phase, game.gameResult]);


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
                // [核心修复] 手牌上限 10 张严格拦截
                if (stateRef.current.playerHand.length >= 10) {
                    // TODO: 触发抽卡超限消失(Burn)动画接口，日后接入特效
                    console.log(`【爆牌警报】我方手牌已满 10 张，${cardToDraw.name} 被送入虚空！`);
                } else {
                    setPlayerHand(prev => [...prev, cardToDraw]);
                }
            } else {
                setEnemyDeckState(newDeck);
                // [核心修复] 敌方同理
                if (stateRef.current.enemyHand.length >= 10) {
                    // TODO: 触发抽卡超限消失(Burn)动画接口，日后接入特效
                    console.log(`【爆牌警报】敌方手牌已满 10 张，${cardToDraw.name} 被送入虚空！`);
                } else {
                    setEnemyHand(prev => [...prev, cardToDraw]);
                }
            }
            if (i < count - 1) await wait(2250);
        }
    };
    // [新增] 独立的回合结束清算序列 (处理幻象等回合末机制)
    const executeRoundEndSequence = async () => {
        // 1. 锁定游戏状态，防止玩家操作
        setGame(prev => ({ ...prev, phase: 'animating' }));
        setMessage("回合结束结算...");

        // 2. 对备战席进行回合结束扫荡 (如幻象判定)
        const nextPlayerBench = applyRoundEndKeywords(stateRef.current.playerBench);
        const nextEnemyBench = applyRoundEndKeywords(stateRef.current.enemyBench);

        // 安全兜底：如果交战区残留了幻象单位，也一并标记死亡
        let hasCombatDeath = false;
        const nextCombatField = stateRef.current.combatField.map(fight => {
            const newFight = { ...fight };
            if (newFight.attacker.keywords.includes('Ephemeral')) {
                newFight.attacker = { ...newFight.attacker, animState: 'ephemeral_dying' };
                hasCombatDeath = true;
            }
            if (newFight.blocker?.keywords.includes('Ephemeral')) {
                newFight.blocker = { ...newFight.blocker, animState: 'ephemeral_dying' };
                hasCombatDeath = true;
            }
            return newFight;
        });

        // 检查是否真的有阵亡单位
        const hasEphemeralDeath =
            nextPlayerBench.some(c => c.animState === 'dying' || c.animState === 'ephemeral_dying') ||
            nextEnemyBench.some(c => c.animState === 'dying' || c.animState === 'ephemeral_dying') ||
            hasCombatDeath;

        // 触发状态更新。如果有 dying 状态，上面写过的全局死亡监测 useEffect 会自动接管特效并触发卡牌碎裂
        setPlayerBench(nextPlayerBench);
        setEnemyBench(nextEnemyBench);
        if (hasCombatDeath) setCombatField(nextCombatField);

        // 3. 如果有死亡发生，阻塞线程等待特效播完 (匹配 1.8秒的新版收尸法则)
        if (hasEphemeralDeath) {
            await wait(2500);

            // 确保交战区的尸体也被清理干净
            if (hasCombatDeath) {
                setCombatField(prev => prev.filter(f =>
                    f.attacker.animState !== 'dying' && f.attacker.animState !== 'ephemeral_dying' &&
                    f.blocker?.animState !== 'dying' && f.blocker?.animState !== 'ephemeral_dying'
                ));
            }
            // [核心修复] 不要过度依赖 useEffect 的异步收尸，在这里手动将备战席的尸体彻底扬了
            setPlayerBench(prev => prev.filter(c => c.animState !== 'dying' && c.animState !== 'ephemeral_dying'));
            setEnemyBench(prev => prev.filter(c => c.animState !== 'dying' && c.animState !== 'ephemeral_dying'));
        }

        // [泰坦] 脉冲解析：双方备战席上的泰坦单位执行脉冲
        const pulseResult = resolveTitanPulse(stateRef.current.playerBench, stateRef.current.enemyBench);
        if (pulseResult.pulsedUnits > 0) {
            setPlayerBench(pulseResult.playerBoard);
            setEnemyBench(pulseResult.enemyBoard);
            // [修复] 同步更新 ref，让 startRound 读到最新数据而非被异步 setState 吞掉
            stateRef.current = {
                ...stateRef.current,
                playerBench: pulseResult.playerBoard,
                enemyBench: pulseResult.enemyBoard,
            };
            // [修复] 等待脉冲特效组件发射完成信号，确保播完再跳转新回合
            // 使用事件驱动而非硬编码延时，未来其他回合结束特效也可复用此信号
            setMessage("泰坦脉冲...");
            await new Promise<void>(resolve => {
                const handler = () => { eventBus.off(GameEvents.ROUND_END_EFFECT_COMPLETE, handler); resolve(); };
                eventBus.on(GameEvents.ROUND_END_EFFECT_COMPLETE, handler);
                // 安全兜底：万一组件没挂载导致信号永远不会来，5s 后强行继续
                setTimeout(() => { eventBus.off(GameEvents.ROUND_END_EFFECT_COMPLETE, handler); resolve(); }, 5000);
            });
        }

        // 4. 尸体清理完毕，真正进入下一回合
        startRound();
    };


    const startRound = () => {
        heroActionHistory.current.clear();
        enemyUnitsPlayedRef.current = 0;
        eventBus.emit(GameEvents.ROUND_START);
        const currentGameState = stateRef.current.game;
        const nextRoundBase = calculateRoundStart(currentGameState);
        // [核心修复] 回合结束，不仅移除屏障，还要扣除所有“单回合临时增益 (roundBuffs)”和“临时词条 (roundKeywords)”
        const clearRoundBuffsAndBarrier = (cards: CardData[]) => cards.map(c => {
            const nextCard = { ...c, keywords: c.keywords.filter(k => k !== 'Barrier') };

            // 1. 扣除临时数值账本
            if (nextCard.roundBuffs && (nextCard.roundBuffs.power > 0 || nextCard.roundBuffs.health > 0)) {
                nextCard.buffs = {
                    power: (nextCard.buffs?.power || 0) - nextCard.roundBuffs.power,
                    health: (nextCard.buffs?.health || 0) - nextCard.roundBuffs.health
                };
                nextCard.roundBuffs = { power: 0, health: 0 };
            }

            // 2. [新增] 扣除临时词条账本
            if (nextCard.roundKeywords && nextCard.roundKeywords.length > 0) {
                // 将临时账本里记录的词条，从卡牌的主词条库中无情剔除
                nextCard.keywords = nextCard.keywords.filter(k => !nextCard.roundKeywords!.includes(k));
                // 彻底销毁词条账本
                nextCard.roundKeywords = [];
            }

            // 3. [新增] 清空本回合打击数账本
            nextCard.roundStrikes = 0;

            return nextCard;
        });

        // [核心修复] 在应用新回合状态前，强制进行一次“尸体清扫”，彻底拦截因异步 Ref 导致的僵尸复活
        const alivePlayerBench = stateRef.current.playerBench.filter(c => c.animState !== 'dying' && c.animState !== 'ephemeral_dying');
        const aliveEnemyBench = stateRef.current.enemyBench.filter(c => c.animState !== 'dying' && c.animState !== 'ephemeral_dying');

        const nextPlayerBench = applyRoundStartKeywords(clearRoundBuffsAndBarrier(alivePlayerBench));
        const nextEnemyBench = applyRoundStartKeywords(clearRoundBuffsAndBarrier(aliveEnemyBench));

        // [能力] 回合开始类能力闪光
        const flashRoundAbility = (cards: any[]) => cards.map((c: any) => {
            if (c.ability && c.ability.trigger === 'round_start' && c.abilityState !== 'dimmed') {
                const updated = { ...c, abilityState: 'flashing' as const };
                setTimeout(() => {
                    const chargeLeft = c.ability.maxCharges === -1 ? -1 : (c.abilityCharges || 0) - 1;
                    const finalState = c.ability.postTriggerState === 'dim' && chargeLeft === 0 ? 'dimmed' : 'breathing';
                    const updater = (prev: any[]) => prev.map((pc: any) =>
                        pc.id === c.id ? { ...pc, abilityState: finalState, abilityCharges: chargeLeft } : pc
                    );
                    setPlayerBench((prev: any) => prev.some((p: any) => p.id === c.id) ? updater(prev) : prev);
                    setEnemyBench((prev: any) => prev.some((p: any) => p.id === c.id) ? updater(prev) : prev);
                }, 500);
                return updated;
            }
            return c;
        });
        const finalPlayerBench = flashRoundAbility(nextPlayerBench);
        const finalEnemyBench = flashRoundAbility(nextEnemyBench);

        let tempGame = {
            ...currentGameState,
            ...nextRoundBase,
            spellCasting: null,
            pendingSpell: null,
            spellStack: [],
            selectedBlockerId: null,
            nexusDamage: undefined,
            lastActionTimestamp: Date.now()
        };
        setGame(tempGame as GameState);
        setPlayerBench(finalPlayerBench);
        setEnemyBench(finalEnemyBench);
    };
    const resetGame = () => {
        // [修复] 替换未定义的 initDeck 函数，使用正规的解析与洗牌流程
        const pDeck = shuffleDeck(deck.filter(key => CARD_DB[key]).map(createFullCard));
        const eDeck = shuffleDeck(enemyDeck.filter(key => CARD_DB[key]).map(createFullCard));

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
            // [修复] 删除非法的 playerMaxManaCap 和 enemyMaxManaCap
            spellStack: [],
            activeCard: null,
            attackToken: { player: 'normal', enemy: null },
            consecutivePasses: 0,
            // [修复] 删除废案属性 winner
            gameResult: null,
            levelUpCard: null,
            fullArtCard: null,

            // ==========================================
            // [新增] 补全 TypeScript 在第二道安检时查出的缺失必填项！
            leveledChampions: [],              // 重置英雄升级记录
            pendingLevelUps: [],               // [新增] 重置待升级队列
            lastActionTimestamp: Date.now(),   // 重置最后操作时间
            selectedBlockerId: null,           // 清空选中的格挡者
            selectedChallengerId: null,        // 清空选中的挑战者
            // ==========================================
            // [修复] 对齐真实的 GameStats 接口定义，铲除不匹配的幻觉属性
            stats: {
                nexusDamage: 0,
                unitsPlayed: 0,
                heroesPlayed: 0,
                spellsPlayed: 0,
                unitsKilled: 0,
                heroesKilled: 0,
                heroLevelUps: 0
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
        const currentCombatField = stateRef.current.combatField; // 提取绝对新鲜的战场快照
        if (currentCombatField.length === 0) {
            setGame(prev => ({ ...prev, phase: 'main', lastActionTimestamp: Date.now() }));
            return;
        }

        // =====================================
        // [核心重构] 空降交战区与攻击宣告拦截
        // =====================================
        let tempGame = { ...stateRef.current.game };
        let tempPlayerBench = [...stateRef.current.playerBench];
        let tempEnemyBench = [...stateRef.current.enemyBench];
        let tempCombatField = [...currentCombatField];
        let hasEffectTriggered = false;

        // [能力] 触发攻击宣告类能力的闪光
        const flashAttackAbility = (fighterList: any[]) => fighterList.map((fight: any) => {
            if (fight.attacker && fight.attacker.ability && fight.attacker.ability.trigger === 'on_attack_declare' && fight.attacker.abilityState === 'breathing') {
                const attacker = { ...fight.attacker, abilityState: 'flashing' as const };
                setTimeout(() => {
                    const chargeLeft = attacker.ability.maxCharges === -1 ? -1 : (attacker.abilityCharges || 0) - 1;
                    const finalState = (chargeLeft === 0 && attacker.ability.postTriggerState === 'dim') ? 'dimmed' : 'breathing';
                    setCombatField((prev: any) => prev.map((f: any) =>
                        f.attacker.id === attacker.id ? { ...f, attacker: { ...f.attacker, abilityState: finalState, abilityCharges: chargeLeft } } : f
                    ));
                }, 500);
                return { ...fight, attacker };
            }
            return fight;
        });
        tempCombatField = flashAttackAbility(tempCombatField);

        // [关键] 仅遍历初始时的参战者，防止新空降的单位也带有攻击宣告从而导致死循环！
        const initialFighters = [...tempCombatField];

        initialFighters.forEach((fight) => {
            if (fight.owner === 'player' && fight.attacker && fight.attacker.effects) {
                fight.attacker.effects.forEach(effId => {
                    const def = EFFECT_DB[effId];
                    // [核心修复] 放宽匹配规则
                    if (def && def.timing.includes('ON_ATTACK_DECLARE')) {
                        const ctx: EffectContext = {
                            game: tempGame,
                            playerBench: tempPlayerBench,
                            enemyBench: tempEnemyBench,
                            playerHand: [...stateRef.current.playerHand],
                            enemyHand: [...stateRef.current.enemyHand],
                            combatField: tempCombatField, // 传递当前战况供处理器修改（包含空降与防爆机制）
                            owner: 'player',
                            sourceCard: fight.attacker // [新增] 把本体传给结算引擎，充当复印机的扫描源头！
                        };

                        // [核心] 调用正规效果处理器
                        const res = processEffect(effId, [], ctx);

                        // 接收返回的新鲜快照
                        tempGame = res.game;
                        tempPlayerBench = res.playerBench;
                        tempEnemyBench = res.enemyBench;
                        // 注意：processEffect 内部的 SUMMON 指令可能会直接向 combatField 推入空降兵
                        if (res.combatField) tempCombatField = res.combatField;

                        hasEffectTriggered = true;
                    }
                });
            }
        });

        // [修复] 根据进攻方决定格挡方：player 进攻 → enemy 格挡，enemy 进攻 → player 格挡
        const firstOwner = currentCombatField[0]?.owner || 'player';
        const blockTurnOwner = firstOwner === 'player' ? 'enemy' : 'player';

        // 统一结算并下发给 React 渲染层
        if (hasEffectTriggered) {
            setPlayerBench(tempPlayerBench);
            setEnemyBench(tempEnemyBench);
            setCombatField(tempCombatField as any);
            setGame({
                ...tempGame,
                phase: 'block_declare',
                turnOwner: blockTurnOwner,
                consecutivePasses: 0,
                lastActionTimestamp: Date.now()
            });
        } else {
            // 如果没有触发任何宣告特效，走基础流程
            setGame(prev => ({ ...prev, phase: 'block_declare', turnOwner: blockTurnOwner, consecutivePasses: 0, lastActionTimestamp: Date.now() }));
        }

        setMessage("等待格挡...");
    };

    // [核心修复 1] 斩断直连结算！防守方确认格挡后，切入响应阶段，并把优先权踢回给进攻方
    const confirmBlock = () => {
        setGame(prev => ({
            ...prev,
            phase: 'react_to_block',
            // 谁刚确认完格挡（通常是防守方），就把优先权交给对面（进攻方）开始打法术
            turnOwner: prev.turnOwner === 'player' ? 'enemy' : 'player',
            consecutivePasses: 0,
            lastActionTimestamp: Date.now()
        }));
        setMessage("防线部署完毕，请进攻方进行战术响应");
    };

    // ==========================================
    // [新增] 微队列清算中心 (Micro-Queue Flusher)
    // 由主循环主动调用，读取 pendingActionsRef，并基于当前快照进行绝对同步的状态结算
    // ==========================================
    const flushMicroQueue = () => {
        if (pendingActionsRef.current.length === 0) return false;

        const actions = [...pendingActionsRef.current];
        pendingActionsRef.current = []; // 取出后立刻清空缓冲区

        let hasLeveledUp = false;
        let leveledHeroes: CardData[] = [];

        // 提取绝对新鲜的当前游戏快照
        let nextPlayerBench = [...stateRef.current.playerBench];
        let nextCombatField = [...stateRef.current.combatField];
        let nextGame = { ...stateRef.current.game };

        const updateCardProgress = (c: CardData) => {
            if (c.key === 'pupu_specular_soul' && c.level === 1) {
                const newProgress = (c.customProgress || 0) + 1;
                const updatedCard = { ...c, customProgress: newProgress };

                if (checkCardLevelUp(updatedCard, nextGame.playerNexus, nextGame.enemyNexus)) {
                    hasLeveledUp = true;
                    const leveled = { ...getLeveledUpCard(updatedCard), id: updatedCard.id };
                    // [核心] 阵亡隔离锁：死者严禁入队升级！
                    if (leveled.animState !== 'dying' && leveled.animState !== 'ephemeral_dying') {
                        leveledHeroes.push(leveled);
                    }
                    return leveled;
                }
                return updatedCard;
            }
            // 2. [新增] 伊莉斯的记账逻辑：只要目睹打击，充能直接设为 1 (最大 1 层)
            if (c.key === 'Chongye_Squad_Elice') { // 请确保 key 与 cards.ts 中伊莉斯的 key 一致
                return { ...c, customProgress: 1 };
            }
            return c;
        };

        // 按顺序结算所有条子
        actions.forEach(action => {
            if (action.type === 'NEXUS_STRIKED') {
                nextPlayerBench = nextPlayerBench.map(updateCardProgress);
                nextCombatField = nextCombatField.map(fight => {
                    const newFight = { ...fight };
                    if (newFight.owner === 'player' && newFight.attacker) {
                        newFight.attacker = updateCardProgress(newFight.attacker) as CardData;
                    }
                    if (newFight.owner === 'enemy' && newFight.blocker) {
                        newFight.blocker = updateCardProgress(newFight.blocker) as CardData;
                    }
                    return newFight;
                });
            }
        });

        // 统一处理结算后的升级派单
        if (hasLeveledUp && leveledHeroes.length > 0) {
            nextGame.pendingLevelUps = [...(nextGame.pendingLevelUps || []), ...leveledHeroes];
            leveledHeroes.forEach(hero => {
                if (!nextGame.leveledChampions.includes(hero.key)) {
                    nextGame.leveledChampions.push(hero.key);
                }
            });
        }

        // 将结算结果一次性拍板并写入 React 队列
        setPlayerBench(nextPlayerBench);
        setCombatField(nextCombatField as any);
        setGame(nextGame as GameState);

        return true; // 返回 true 告知调用者“我处理过数据了”
    };

    const resolveCombatAnimation = async () => {
        setGame(prev => ({ ...prev, phase: 'animating' }));
        const totalFights = stateRef.current.combatField.length;
        for (let i = 0; i < totalFights; i++) {
            let currentFight = stateRef.current.combatField[i];
            const { attacker, blocker } = currentFight;

            // [核心修复 1] 将快攻情报判定提前，用于指导动画状态机分流
            const hasQuickAttack = attacker.keywords.includes('QuickAttack');

            setCombatField(prev => {
                const n = [...prev];
                n[i] = {
                    ...n[i],
                    attacker: { ...n[i].attacker, animState: 'attacking' } as CardData,
                    // [核心修复 2] 告诉格挡方：对面有快攻，你必须进入滞后反击状态！
                    blocker: n[i].blocker ? { ...n[i].blocker, animState: (hasQuickAttack ? 'delayed_attacking' : 'attacking') as any } as CardData : null
                };
                return n;
            });

            // 音效与节奏控制
            let impactDelay = 250;

            if (!blocker) {
                setTimeout(() => eventBus.emit(GameEvents.SFX_STRIKE_NEXUS), 250);
            } else {
                if (hasQuickAttack) {
                    setTimeout(() => eventBus.emit(GameEvents.SFX_QUICK_ATTACK), 320);
                    // [新增] 格挡者反击快攻音效，略延后以体现反击时序
                    setTimeout(() => eventBus.emit(GameEvents.SFX_QUICK_BLOCK), 450);
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

            // [新增] 记账：为参与本次交锋的存活/阵亡单位，无情记上一笔“本回合已打击”
            if (result.updatedFight.attacker) {
                result.updatedFight.attacker.roundStrikes = (result.updatedFight.attacker.roundStrikes || 0) + 1;
            }
            if (result.updatedFight.blocker) {
                result.updatedFight.blocker.roundStrikes = (result.updatedFight.blocker.roundStrikes || 0) + 1;
            }

            // 更新战场卡牌状态
            setCombatField(prev => {
                const n = [...prev];
                n[i] = result.updatedFight;
                return n;
            });

            // [核心修正] 战果已经排入 React 队列，现在安全发起广播！监听器将完美衔接在它之后！
            if (result.nexusDamage) {
                eventBus.emit(GameEvents.NEXUS_STRIKED, result.nexusDamage);
            }

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

                // 1. 记录全场已升级英雄名单
                setGame(prev => ({
                    ...prev,
                    leveledChampions: prev.leveledChampions.includes(heroKey)
                        ? prev.leveledChampions
                        : [...prev.leveledChampions, heroKey]
                }));

                // 2. [核心拔除] 彻底删除所有的硬编码 await 延时循环，改为派发“排队券”！
                queueLevelUp(leveledCard);

                // 3. 升级卡组和手牌中的同名卡
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
            }
            await wait(600);
            setGame(prev => ({ ...prev, nexusDamage: undefined }));
        }

        // 3. 战斗结束清理
        // [核心修正] 获取当前战场快照，动态计算清场等待时间，确保死亡动画能完整播完！
        const fieldForDeathCheck = stateRef.current.combatField;

        const hasEphemeralDeathInCombat = fieldForDeathCheck.some(f =>
            f.attacker.animState === 'ephemeral_dying' || f.blocker?.animState === 'ephemeral_dying'
        );
        const hasNormalDeathInCombat = fieldForDeathCheck.some(f =>
            f.attacker.animState === 'dying' || f.blocker?.animState === 'dying'
        );

        let cleanupWaitTime = 500;
        if (hasEphemeralDeathInCombat) {
            cleanupWaitTime = 2500;
        } else if (hasNormalDeathInCombat) {
            cleanupWaitTime = 1200;
        }

        await wait(cleanupWaitTime);

        // 👇 [新增] 在踩下刹车之前，主循环亲自收网！清空微队列
        const isQueueProcessed = flushMicroQueue();
        if (isQueueProcessed) {
            // 给 React 留下 50ms 的微小渲染窗口，确保 setGame 的结果能够同步到后面的 stateRef 中
            await wait(50);
        }

        // ==========================================
        // [核心修正：终极刹车片]
        // 任何机制导致的升级，都会体现为 pendingLevelUps 队列中有号或 levelUpCard 正在播放。
        // 主程序在此必须死锁挂起，绝对不准摧毁交战区 DOM，给足 UI 部门抓取物理卡牌演出的时间！
        // ==========================================
        while (
            stateRef.current.game.levelUpCard !== null ||
            (stateRef.current.game.pendingLevelUps && stateRef.current.game.pendingLevelUps.length > 0)
        ) {
            await wait(200);
        }

        // [极其关键] 动画可能播了很久，在此期间监听器（如卜卜）可能已经把 2 级卡牌替换到了 stateRef 中。
        // 必须重新抓取最新鲜的战场快照，防止把旧的 1 级卡牌错误地移回备战席！
        const finalField = stateRef.current.combatField;

        // 收集幸存者 (逻辑同前，从最新的 finalField 中筛选)
        const survivorsP: CardData[] = [];
        const survivorsE: CardData[] = [];

        finalField.forEach(f => {
            // [关键修复] 严防死守：普通死亡和瞬息死亡都绝对不能进入幸存者名单！
            if (f.attacker.animState !== 'dying' && f.attacker.animState !== 'ephemeral_dying') {
                const unit = { ...f.attacker, animState: 'idle' }; // 保留原有的 damageTaken
                if (f.owner === 'player') survivorsP.push(unit as any);
                else survivorsE.push(unit as any);
            }
            if (f.blocker && f.blocker.animState !== 'dying' && f.blocker.animState !== 'ephemeral_dying') {
                const unit = { ...f.blocker, animState: 'idle' }; // 保留原有的 damageTaken
                if (f.owner === 'player') survivorsE.push(unit as any);
                else survivorsP.push(unit as any);
            }
        });

        // [剥离裁判权] 胜负判定已交由全局的“智能裁判(useEffect)”处理，确保多单位进攻时能爽快地鞭尸！

        // 归位
        setGame(prev => {
            // [修正] 战斗后只消耗发起进攻一方的 Token
            const currentFights = stateRef.current.combatField;
            const attackerOwner = currentFights.length > 0 ? currentFights[0].owner : null;

            const nextAttackToken = { ...prev.attackToken };
            if (attackerOwner) {
                nextAttackToken[attackerOwner] = null;
            }

            return {
                ...prev,
                // [关键] 只要这里将 phase 切回 'main'
                // 外面挂载的智能裁判就会瞬间苏醒并介入吹哨！
                phase: 'main',
                turnOwner: prev.attackToken.player ? 'enemy' : 'player',
                attackToken: nextAttackToken,
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

    // [修改 3：施法生命周期重塑] commitSpell 替代 finalizeSpell
    const commitSpell = (card: CardData, owner: 'player' | 'enemy', targets: any[], originalPhase?: any) => {
        // [新增] 在生成快照前，先拯救处于悬浮缓冲站的上一张法术！
        const existingPending = stateRef.current.game.pendingSpell;

        // A. [核心修复：打破时间循环] 同步构建一份绝对干净的 Game 状态快照！
        let cleanSnapshot = {
            ...stateRef.current.game,
            spellCasting: null,
            pendingSpell: null,
            activeCard: null
        };

        // [核心解药] 如果提供了原始阶段，就用原始阶段；如果没提供但当前是 'animating'，强制回滚到 'main'
        const safePhase = originalPhase || (cleanSnapshot.phase === 'animating' ? 'main' : cleanSnapshot.phase);

        // B. [防连环扣款] 直接在这份干净快照上扣除费用
        if (!card.parentCard) {
            const { newMana, newSpellMana } = calculateNewMana(
                card.cost,
                owner === 'player' ? cleanSnapshot.playerMana : cleanSnapshot.enemyMana,
                owner === 'player' ? cleanSnapshot.playerSpellMana : cleanSnapshot.enemySpellMana,
                false
            );

            if (owner === 'player') {
                cleanSnapshot.playerMana = newMana;
                cleanSnapshot.playerSpellMana = newSpellMana;
            } else {
                cleanSnapshot.enemyMana = newMana;
                cleanSnapshot.enemySpellMana = newSpellMana;
            }
        }

        // C. [响应机制分流] 根据法术速度决定是瞬间生效还是打包入栈
        if (card.type === 'spell-burst') {
            // 极速法术：绕过堆叠，瞬间结算！
            // [极其关键] 传入准备好的 cleanSnapshot，彻底杜绝 UI 旧状态(如正在瞄准)复活！
            executeSpellEffect(card.key, owner, targets, {
                game: cleanSnapshot,
                setGame,
                playerBench: stateRef.current.playerBench, setPlayerBench,
                enemyBench: stateRef.current.enemyBench, setEnemyBench,
                combatField: stateRef.current.combatField, setCombatField, // [新增] 授予交战区权限
                playerHand: stateRef.current.playerHand, setPlayerHand,
                triggerShake
            });

            // [修正] 结算后必须留在当前阶段（主阶段或格挡响应阶段），绝不能无脑回 main
            setGame(prev => ({ ...prev, phase: safePhase, lastActionTimestamp: Date.now() }));
            setMessage("极速法术生效");
        } else {
            const stackItem: SpellStackItem = { card, owner, targets };
            if (owner === 'player') {
                // [核心修复：进入缓冲站] 玩家打出的法术，放入预提交区
                setGame({
                    ...cleanSnapshot,
                    // [多重施法引擎] 如果缓冲站原本就有法术，把它强行挤进正规堆叠区！
                    spellStack: existingPending ? [existingPending, ...cleanSnapshot.spellStack] : cleanSnapshot.spellStack,
                    pendingSpell: stackItem,
                    phase: safePhase // [关键修复] 植入安全的时空锚点！
                });
                setMessage("请确认是否打出该法术");
            } else {
                // 敌方的法术直接入栈并把响应权交给我们
                setGame({
                    ...cleanSnapshot,
                    spellStack: [stackItem, ...cleanSnapshot.spellStack],
                    turnOwner: 'player',
                    consecutivePasses: 0,
                    lastActionTimestamp: Date.now(),
                    phase: safePhase // [关键修复] 植入安全的时空锚点！
                });
                setMessage("敌方打出法术，请响应");
            }
        }
    };

    const playCard = (card: CardData, owner: 'player' | 'enemy', targets: any[] = []) => {
        // [新增 极强防御] 记录进入动画前的真实阶段
        const originalPhase = stateRef.current.game.phase;

        if (owner === 'player') {
            const { playerMana, playerSpellMana } = stateRef.current.game;
            if (!canAfford(card, playerMana, playerSpellMana)) {
                setMessage("法力不足！");
                return;
            }
        }

        // [底层重构] 英雄法术不再进行静默转换，而是统一进入抉择流程
        if (owner === 'player' && card.associatedChampionKey) {
            const champKey = card.associatedChampionKey;
            const hasLv2 = playerBench.some(c => c.key === champKey && c.level === 2);

            // [修改 1：拔剑留鞘修复] 在弹窗瞬间，立刻把这张 0 费英雄法术从手牌里没收暂存！
            setPlayerHand(prev => prev.filter(c => c.id !== card.id));

            setGame(prev => ({
                ...prev,
                activeCard: card,
                spellCasting: {
                    cardId: card.id,
                    step: 'choose_mode',
                    targets: [],
                    isHeroLeveled: hasLv2 // [关键] 告知 UI 英雄是否已升级，用于锁定大招显示
                }
            }));
            setMessage(hasLv2 ? "请选择要施放的法术模式" : "选择法术施放（升级后可解锁大招）");
            return;
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

        // [新增] 判断如果打出的是单位，触发对应的放大展示音效
        if (isUnit) {
            if (owner === 'player') {
                eventBus.emit(GameEvents.SFX_PLAYER_PLAY_UNIT);
            } else {
                eventBus.emit(GameEvents.SFX_ENEMY_PLAY_UNIT);
            }
        }

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
                // =====================================
                // [核心修复] 单位入场发动机：不仅要上场，还要触发 ON_PLAY 战吼！
                // =====================================
                let tempPlayerBench = [...stateRef.current.playerBench];
                let tempEnemyBench = [...stateRef.current.enemyBench];
                let tempCombatField = [...stateRef.current.combatField]; // [关键修复] 初始化缺失的交战区快照！
                let tempGame = { ...stateRef.current.game };

                // [新增] 卡牌物理砸入备战席音效 (底层判定，100%触发)
                eventBus.emit(GameEvents.SFX_DROP_BENCH);

                // 1. 单位先物理上场 (确保战吼如 ALL_ALLIES 能 Buff 到自己，或者系统能扫描到自己)
                // [能力] 初始化能力状态：上场时设为 breathing
                const cardWithAbility = card.ability
                    ? { ...card, abilityState: 'breathing' as const, abilityCharges: card.ability.maxCharges }
                    : card;
                if (owner === 'player') tempPlayerBench.push(cardWithAbility);
                else tempEnemyBench.push(cardWithAbility);

                // 2. 扫描并触发入场特效 (ON_PLAY)
                if (card.effects && card.effects.length > 0) {
                    card.effects.forEach(effId => {
                        const def = EFFECT_DB[effId];
                        if (def && def.timing.includes('ON_PLAY')) {
                            const ctx: EffectContext = {
                                game: tempGame,
                                playerBench: tempPlayerBench,
                                enemyBench: tempEnemyBench,
                                playerHand: stateRef.current.playerHand,
                                enemyHand: stateRef.current.enemyHand,
                                playerDeck: stateRef.current.playerDeck, // [新增] 把我方牌库喂进去！
                                enemyDeck: stateRef.current.enemyDeck,   // [新增] 把敌方牌库喂进去！
                                combatField: tempCombatField, // [核心修正] 这里也要改为用 tempCombatField，确保连环战吼数据一致
                                owner: owner,
                                sourceCard: card // [关键] 把登场单位作为源卡牌传进去，供复印机或条件扫描器识别
                            };


                           const res = processEffect(effId, targets, ctx);

                            // 接收执行战吼后的新鲜快照
                            tempGame = res.game;
                            tempPlayerBench = res.playerBench;
                            tempEnemyBench = res.enemyBench;

                            // [重要修复] 如果战吼将衍生物空降到了交战区，必须将其同步到快照中，否则空降会彻底失效！
                            if (res.combatField) tempCombatField = res.combatField;

                            // [新增] 接收被处理器修改过的牌库，并通过外部的 setState 直接写回 React
                            if (res.playerDeck && owner === 'player') setPlayerDeck(res.playerDeck);
                            if (res.enemyDeck && owner === 'enemy') setEnemyDeckState(res.enemyDeck);
                        }
                    });
                }

                // [能力] 触发 ON_PLAY 类能力的闪光
                const flashOnPlay = (bench: any[]) => bench.map((c: any) => {
                    if (c.ability && c.ability.trigger === 'on_play' && c.abilityState === 'breathing') {
                        const updated = { ...c, abilityState: 'flashing' as const };
                        // 动画后转入终态
                        setTimeout(() => {
                            const chargeLeft = c.ability.maxCharges === -1 ? -1 : (c.abilityCharges || 0) - 1;
                            const finalState = (chargeLeft === 0 && c.ability.postTriggerState === 'dim') ? 'dimmed' : 'breathing';
                            const cardRef = owner === 'player'
                                ? stateRef.current.playerBench.find((bc: any) => bc.id === c.id)
                                : stateRef.current.enemyBench.find((bc: any) => bc.id === c.id);
                            // 用 setState 更新（仅在卡牌还在场上时）
                            if (cardRef) {
                                const updater = (prev: any[]) => prev.map((pc: any) =>
                                    pc.id === c.id ? { ...pc, abilityState: finalState, abilityCharges: chargeLeft } : pc
                                );
                                if (owner === 'player') setPlayerBench(updater);
                                else setEnemyBench(updater);
                            }
                        }, 500);
                        return updated;
                    }
                    return c;
                });
                tempPlayerBench = flashOnPlay(tempPlayerBench);
                tempEnemyBench = flashOnPlay(tempEnemyBench);

                // 3. 统一将上场与战吼的结果拍板，下发给 React 渲染层
                setPlayerBench(tempPlayerBench);
                setEnemyBench(tempEnemyBench);
                setCombatField(tempCombatField); // [重要修复] 将交战区快照一并提交给底层！
                setGame({
                    ...tempGame,
                    phase: 'main',
                    turnOwner: owner === 'player' ? 'enemy' : 'player',
                    consecutivePasses: 0,
                    lastActionTimestamp: Date.now()
                });
            } else {
                // 法术：进入提交流程 (commitSpell 会处理 UI清理、扣费与入栈分流)
                commitSpell(card, owner, targets, originalPhase); // [关键修复] 把时空锚点传给引擎！
            }
        }, 600);
    };

    // [新增] 垃圾回收站下放：取消抉择
    const cancelChoice = () => {
        const currentActive = stateRef.current.game.activeCard;
        if (currentActive) {
            // [基因溯源] 检查是否有 parentCard。如果有，退回母体(0费英雄法术)；否则退回自己。
            const cardToReturn = currentActive.parentCard || currentActive;
            setPlayerHand(prev => [...prev, cardToReturn]);
        }
        setGame(prev => ({ ...prev, activeCard: null, spellCasting: null }));
    };

    // [重构] 处理玩家的抉择 (彻底基于 Key 的数据驱动)
    const resolveChoice = async (chosenCardKey: string) => {
        const originalPhase = stateRef.current.game.phase; // [新增] 记录命运抉择前的真实阶段
        const originalCard = game.activeCard;
        if (!originalCard || !game.spellCasting || game.spellCasting.step !== 'choose_mode') return;

        // 1. 根据传入的 Key 直接创建真正的子法术实体，彻底剥离原有的 if-else 硬编码
        const transformed = createFullCard(chosenCardKey);

        // [修改 2：DNA 注入] 将暂存的英雄法术作为母体基因，封入子法术体内
        transformed.parentCard = originalCard;

        // [修改 2：验资扣款] 手动扣除所选子法术的费用
        const { newMana, newSpellMana } = calculateNewMana(transformed.cost, game.playerMana, game.playerSpellMana, false);
        setGame(prev => ({ ...prev, playerMana: newMana, playerSpellMana: newSpellMana }));

        // 2. [视觉连招核心] 取消抉择界面，将新法术挂载至中心，开启子弹时间！
        setGame(prev => ({
            ...prev,
            spellCasting: null,       // 销毁原有的英雄法术抉择容器
            pendingSpell: null,
            activeCard: transformed,  // 将新生成的子法术推向屏幕正中，触发 Big Card 动画
            phase: 'animating'        // 挂起游戏主阶段，防止玩家点击其他东西打断施法
        }));

        // 3. [子弹时间] 强制等待 800ms，让 UI 部门把“法术华丽变身”演完！
        await wait(800);

        // 4. [动态目标嗅探] 彻底告别查不到和硬编码！
        // [修复] 必须从 transformed.effects[0] 中提取真实的 effectId 来查表，绝不能用卡牌名查！
        const effectId = transformed.effects && transformed.effects.length > 0 ? transformed.effects[0] : null;
        const effectDef = effectId ? EFFECT_DB[effectId] : null;
        // [核心修复] 同样改为通过 count > 0 来准确过滤掉 ALL_ALLIES 等不需要瞄准的自动目标
        const needsTargets = effectDef && effectDef.targetRequirements && effectDef.targetRequirements.some(req => req.count > 0);

        if (needsTargets) {
            // [智能解析] 根据注册表定义，自动推导该法术到底需要点自己人、点敌人还是点全体
            const reqType = effectDef.targetRequirements[0].type;
            let step: 'select_ally' | 'select_enemy' | 'select_any' = 'select_any';
            if (reqType.includes('ALLY')) step = 'select_ally';
            else if (reqType.includes('ENEMY')) step = 'select_enemy';

            setGame(prev => ({
                ...prev,
                phase: originalPhase === 'animating' ? 'main' : originalPhase, // [关键修复] 恢复原本的阶段
                spellCasting: {
                    cardId: transformed.id,
                    step: step, // 将推导出的精准步骤告诉前台
                    targets: [],
                    allyId: undefined
                }
            }));
            setMessage(`请选择 ${transformed.name} 的施放目标`);
        } else {
            // 如果是大招（或者不需要指定目标的AOE），动画播完直接拍到场上！
            commitSpell(transformed, 'player', [], originalPhase); // [关键修复] 把时空锚点传给引擎
        }
    };

    // [新增修改 4：撤回逻辑] 允许从法术堆叠中撤销未结算的法术，并基于 DNA 退还费用与还原母体
    const withdrawSpellFromStack = (cardId: string) => {
        const stackItem = stateRef.current.game.spellStack.find(s => s.card.id === cardId);
        if (!stackItem || stackItem.owner !== 'player') return;

        // 1. 从堆叠中拔除
        setGame(prev => ({
            ...prev,
            spellStack: prev.spellStack.filter(s => s.card.id !== cardId)
        }));

        // 2. 基因溯源与手牌返还
        const cardToReturn = stackItem.card.parentCard || stackItem.card;
        setPlayerHand(prev => [...prev, cardToReturn]);

        // 3. 费用全额退款
        const costToRefund = stackItem.card.cost;
        setGame(prev => {
            let newMana = prev.playerMana + costToRefund;
            let newSpellMana = prev.playerSpellMana;
            if (newMana > prev.playerMaxMana) {
                newSpellMana = Math.min(3, newSpellMana + (newMana - prev.playerMaxMana));
                newMana = prev.playerMaxMana;
            }
            return { ...prev, playerMana: newMana, playerSpellMana: newSpellMana };
        });
        setMessage("法术已撤回");
    };

    // [新增] 预提交确认：将悬浮在缓冲站的法术真正推入堆叠区，并交出回合控制权
    const confirmPendingSpell = () => {
        setGame(prev => {
            if (!prev.pendingSpell) return prev;
            return {
                ...prev,
                spellStack: [prev.pendingSpell, ...prev.spellStack],
                pendingSpell: null,
                turnOwner: 'enemy',
                consecutivePasses: 0,
                lastActionTimestamp: Date.now()
            };
        });
        setMessage("法术入栈，等待对方响应");
    };

    // [新增] 预提交撤销：点击悬浮法术退回手牌并全额退费
    const cancelPendingSpell = () => {
        const pending = stateRef.current.game.pendingSpell;
        if (!pending || pending.owner !== 'player') return;

        // 1. 清除挂起状态
        setGame(prev => ({ ...prev, pendingSpell: null }));

        // 2. 基因溯源与手牌返还
        const cardToReturn = pending.card.parentCard || pending.card;
        setPlayerHand(prev => [...prev, cardToReturn]);

        // 3. 费用全额退款
        const costToRefund = pending.card.cost;
        setGame(prev => {
            let newMana = prev.playerMana + costToRefund;
            let newSpellMana = prev.playerSpellMana;
            if (newMana > prev.playerMaxMana) {
                newSpellMana = Math.min(3, newSpellMana + (newMana - prev.playerMaxMana));
                newMana = prev.playerMaxMana;
            }
            return {
                ...prev,
                playerMana: newMana,
                playerSpellMana: newSpellMana,
                phase: prev.phase === 'animating' ? 'main' : prev.phase // [绝佳兜底] 彻底粉碎时空死锁
            };
        });
        setMessage("法术已取消打出");
    };

    const resolveStack = async () => {
      const originalPhase = stateRefs.current.game.phase;
      setGame(prev => ({ ...prev, phase: 'animating' }));
      const stack = [...stateRefs.current.game.spellStack];
      for (const spell of stack) {
          setMessage(`结算: ${spell.card.name}`);
          await new Promise(r => setTimeout(r, 1000));
          executeSpellEffect(spell.card.key, spell.owner, spell.targets, {
             game: stateRefs.current.game, setGame,
             playerBench: stateRefs.current.playerBench, setPlayerBench,
             enemyBench: stateRefs.current.enemyBench, setEnemyBench,
             combatField: stateRefs.current.combatField, setCombatField,
             playerHand: stateRefs.current.playerHand, setPlayerHand,
             triggerShake, setMessage
          });
          setGame(prev => ({ ...prev, spellStack: prev.spellStack.filter(s => s.card.id !== spell.card.id) }));

          // [核心修复：打破时空悖论]
          // 必须等待 React 异步渲染周期结束，确保 stateRef 刷新！
          // 否则 flushMicroQueue 会读取并覆写旧快照，导致刚刚撤回的卡牌蒸发！
          await wait(50);

          // 👇 [新增] 每结算完一个法术，都主动检查一次有没有触发旁观者的被动！
          const isQueueProcessed = flushMicroQueue();
          if (isQueueProcessed) await wait(50);

          // 👇 [新增] 遇到升级就刹车挂起，播完演出再结算法术堆叠中的下一张牌！
          while (
              stateRef.current.game.levelUpCard !== null ||
              (stateRef.current.game.pendingLevelUps && stateRef.current.game.pendingLevelUps.length > 0)
          ) {
              await wait(200);
          }
      }
      setGame(prev => ({ ...prev, phase: originalPhase === 'react_to_block' ? 'react_to_block' : 'main', spellStack: [], consecutivePasses: 0 }));
      setMessage("法术结算完毕");
    };

    const passTurn = () => {
        if (game.spellStack.length > 0 && game.consecutivePasses === 0) {
             setGame(prev => ({ ...prev, consecutivePasses: 1 }));
             resolveStack();
             return;
        }
        // [核心修复 3] 判断连续让过时所处的阶段
        if (game.consecutivePasses >= 1) {
            if (game.phase === 'react_to_block') {
                // 如果在格挡响应阶段双方连续让过，说明法术交锋彻底结束，进入真正的物理战斗碰撞！
                resolveCombatAnimation();
            } else {
                // [核心修复] 如果在常规主阶段双方连续让过，不直接进入下回合，而是先执行回合结束清算序列（幻象清理等）
                executeRoundEndSequence();
            }
        }
        else setGame(prev => ({ ...prev, turnOwner: prev.turnOwner === 'player' ? 'enemy' : 'player', consecutivePasses: prev.consecutivePasses + 1, lastActionTimestamp: Date.now() }));
    };

    const toggleAttacker = (card: CardData, toCombat: boolean) => {
        if (toCombat) {
            // [新增] 进攻上场语音：检查是否是本回合首次行动
            if (card.isChampion && !heroActionHistory.current.has(card.id)) {
                eventBus.emit(GameEvents.HERO_FIRST_ACTION, card);
                heroActionHistory.current.add(card.id);
            }
            eventBus.emit(GameEvents.SFX_BLOCK);

            setPlayerBench(prev => prev.filter(c => c.id !== card.id));
            setCombatField(prev => [...prev, { attacker: card, blocker: null, owner: 'player' }]);
        } else {
            eventBus.emit(GameEvents.SFX_RECALL_BLOCK);
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
            eventBus.emit(GameEvents.SFX_BLOCK);

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

            eventBus.emit(GameEvents.SFX_RECALL_BLOCK);
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

        eventBus.emit(GameEvents.SFX_BLOCK);

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

        // [新增] 触发洗牌音效
        eventBus.emit(GameEvents.SFX_SHUFFLE);

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

            // [新增] 触发洗牌音效
            eventBus.emit(GameEvents.SFX_SHUFFLE);

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
        // [修复] 修正命名冲突导致的错误拼写，使用真实的状态更新器
        setEnemyDeckState(currentEnemyDeck);
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

    // ==========================================
    // [新增] 统一升级系统 - 队列操作方法
    // ==========================================
    const queueLevelUp = (card: CardData) => {
        // [新增] 阵亡隔离锁：死者严禁入队升级！
        // 即使英雄达成了条件，只要此时它的状态是死亡或消散，直接没收排队券
        if (card.animState === 'dying' || card.animState === 'ephemeral_dying') {
            console.log(`[LevelUp System] 拒绝入队：英雄 ${card.name} 已阵亡。`);
            return;
        }

        setGame(prev => ({
            ...prev,
            pendingLevelUps: [...prev.pendingLevelUps, card]
        }));
    };

    const popLevelUp = () => {
        setGame(prev => ({
            ...prev,
            pendingLevelUps: prev.pendingLevelUps.slice(1) // 移除队列第 0 位
        }));
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
        playerDeck,
        enemyDeckState, // ✅ 敌方牌库的正确变量名
        playerInitialDeckInfo,
        enemyInitialDeckInfo,
        actions: {
            startRound,
            resetGame,
            initiateAttack,
            commitAttack,
            confirmBlock, // [核心修复 4] 暴露给 UI 层的按钮绑定！
            passTurn,
            playCard,
            resolveCombatAnimation,
            drawCards,
            startSpellCasting,
            updateSpellCasting,
            finalizeSpell: commitSpell, // 兼容 UI 层的旧版接口调用
            commitSpell,
            withdrawSpellFromStack,     // [新增] 暴露给前台用于点击撤回栈内法术
            toggleAttacker,
            selectBlocker,
            assignBlocker,
            recallBlocker,
            resolveStack,
            closeLevelUp: () => setGame(prev => ({...prev, levelUpCard: null})),
            resolveChoice,
            cancelChoice,      // [新增] 将取消抉择的权利正式赋予引擎内部动作
            selectChallenger, // [关键] 导出新增的函数
            challengeEnemy,    // [关键] 导出新增的函数
            replaceOpeningHand,
            performMulligan, // [新增]
            confirmPendingSpell,
            cancelPendingSpell,
            requeueHandToDeck,
            queueLevelUp,    // [新增] 暴露给战斗推演或事件监听，用于让英雄拿号排队
            popLevelUp,       // [新增] 暴露给 UI 层，用于在视频播放完毕后请英雄离场
        }
    };
};