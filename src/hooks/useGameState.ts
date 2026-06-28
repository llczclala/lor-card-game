import { processEffect } from '../logic/effectProcessor';
import type { EffectContext } from '../logic/effectProcessor';
import { EFFECT_DB } from '../data/effectRegistry';
import { useSpellSystem, waitForStrikeComplete } from './useSpellSystem'; // [核心新增] 引入法术系统引擎与时间管理器
import { useState, useRef, useEffect } from 'react';
import type { CardData, GameState, SpellStackItem } from '../types';
import { createCard, CARD_DB } from '../data/cards';
import {  calculateNewMana, getLeveledUpCard} from '../utils/gameRules';
import { executeSpellEffect } from '../logic/spells';
import { resolveSingleCombat, getCurrentHP } from '../logic/combat'; // [新增] 引入真实血量探针
import { calculateRoundStart, canAfford } from '../logic/core';
import { eventBus, GameEvents,StrikeEvents } from '../utils/eventBus';
import { applyRoundStartKeywords, applyRoundEndKeywords, resolveTitanPulse, getPower } from '../logic/keywords'; // [新增] 引入真实攻击力探针
import { checkCardLevelUp, accumulateMauxirDamage, isSummonerOrSummon } from '../utils/gameRules';
import { gameLogger } from '../utils/gameLogger'; // [新增] 引入战术审计黑匣子探针
import { useRoundLifecycle } from './useRoundLifecycle'; // [核心新增] 引入剥离的回合生命周期引擎

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
// ==========================================
// [特效包装器] 拦截法术伤害，强制注入受击状态 (解决 BUG 5)
// ==========================================
const wrapDamageHitState = (originalSetter: React.Dispatch<React.SetStateAction<CardData[]>>) => {
    return (action: React.SetStateAction<CardData[]>) => {
        originalSetter(prev => {
            const next = typeof action === 'function' ? action(prev) : action;
            return next.map(newCard => {
                const oldCard = prev.find(c => c.id === newCard.id);
                // 只要新状态的累计受伤值 > 旧状态，判定为受击，强制改写动画状态！
                if (oldCard && (newCard.damageTaken || 0) > (oldCard.damageTaken || 0)) {
                    return { ...newCard, animState: 'hit' as const };
                }
                return newCard;
            });
        });
    };
};

const wrapCombatHitState = (originalSetter: React.Dispatch<React.SetStateAction<any[]>>) => {
    return (action: React.SetStateAction<any[]>) => {
        originalSetter(prev => {
            const next = typeof action === 'function' ? action(prev) : action;
            return next.map(newFight => {
                const oldFight = prev.find(f => f.attacker.id === newFight.attacker.id);
                if (!oldFight) return newFight;
                let updatedAttacker = newFight.attacker;
                let updatedBlocker = newFight.blocker;

                if ((updatedAttacker.damageTaken || 0) > (oldFight.attacker.damageTaken || 0)) {
                    updatedAttacker = { ...updatedAttacker, animState: 'hit' as const };
                }
                if (updatedBlocker && oldFight.blocker && (updatedBlocker.damageTaken || 0) > (oldFight.blocker.damageTaken || 0)) {
                    updatedBlocker = { ...updatedBlocker, animState: 'hit' as const };
                }
                return { ...newFight, attacker: updatedAttacker, blocker: updatedBlocker };
            });
        });
    };
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
        },
        everywhereBuffs: [] // [核心新增] 全域光环账本：用于记录各处 Buff
    } as any); // [修改] 强转为 any 以免除由于新增字段导致的严格类型报错
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
    // 👇 [CantAttack] 保存各单位进入战场前的原始攻击力，用于撤回时恢复（含 buffs/roundBuffs）
    const cantAttackOrigPowerRef = useRef<Map<string, { power: number; buffsPower: number; roundBuffsPower: number }>>(new Map());
    useEffect(() => {
        stateRef.current = { game, combatField, playerBench, enemyBench, playerHand, enemyHand, playerDeck, enemyDeck: enemyDeckState };
    }, [game, combatField, playerBench, enemyBench, playerHand, enemyHand, playerDeck, enemyDeckState]);

    // 辅助函数：异步等待
    const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

    // ==========================================
    // [核心重构] 挂载独立的生命周期引擎
    // ==========================================
    const { startRound, executeRoundEndSequence } = useRoundLifecycle({
        stateRef,
        heroActionHistory,
        enemyUnitsPlayedRef,
        game,
        setGame,
        setPlayerBench,
        setEnemyBench,
        setCombatField,
        setPlayerHand,
        setEnemyHand,
        setPlayerDeck,
        setEnemyDeckState,
        setMessage,
        createFullCard,
        // [战术规避] 使用箭头函数包裹，规避 const 声明不会提升导致的”在初始化前访问”的报错死锁！
        flushMicroQueue: () => flushMicroQueue(),
        judgeLifeAndDeath: () => judgeLifeAndDeath(),   // [SBA] 生死簿同步判决
        wait
    });

    // --- 3. 基础操作 ---

    const triggerShake = () => {
        setGame(prev => ({ ...prev, screenShake: true }));
        setTimeout(() => setGame(prev => ({ ...prev, screenShake: false })), 500);
    };

    // ==========================================
    // [核心重构] 挂载独立的法术系统引擎
    // ==========================================
    const {
        startSpellCasting, updateSpellCasting, commitSpell,
        cancelChoice, resolveChoice,
        withdrawSpellFromStack, confirmPendingSpell, cancelPendingSpell,
        resolveStack
    } = useSpellSystem({
        stateRef,
        game,
        playerBench,
        setGame, setPlayerBench, setEnemyBench, setCombatField,
        setPlayerHand, setEnemyHand, setPlayerDeck, setEnemyDeckState,
        setMessage,
        createFullCard,
        flushMicroQueue: () => flushMicroQueue(),
        judgeLifeAndDeath: () => judgeLifeAndDeath(),   // [SBA] 生死簿同步判决
        wait,
        waitForStrikeComplete,
        triggerShake,
        onComplete: () => {} // useGameState 内部直接调用引擎，不需要处理 UI 层的完成回调
    });

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

                // --- 情况 C: 支援技 -> 抉择法术 ---
                // 条件：卡牌是支援技 + 场上已有对应英雄 + 未变形
                if (card.associatedChampionKey && championKeysOnBoard.has(card.associatedChampionKey)
                    && card.key.endsWith('_support') && !(card as any).isTransformed) {
                    const champCard = CARD_DB[card.associatedChampionKey];
                    if (champCard?.associatedSpellKey) {
                        const choiceSpell = CARD_DB[champCard.associatedSpellKey];
                        if (choiceSpell) {
                            hasChanged = true;
                            return {
                                ...choiceSpell,
                                id: card.id,
                                associatedChampionKey: card.associatedChampionKey,
                                animState: 'transform',
                                isTransformed: true,
                                originalBaseKey: card.key
                            } as unknown as CardData;
                        }
                    }
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
                    // [视觉解耦] 不再需要暂缓死刑等待 hit 状态，死亡碎裂动画与独立受击特效完美兼容，直接处决！
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

                    // [重构] 剥离硬编码！把亡语触发权移交给微队列的中央处理器！
                    // 把这具尸体当作包裹，扔进微队列缓冲区
                    pendingActionsRef.current.push({ type: 'UNIT_DIED', payload: { unit: u, bench: bench === playerBench ? 'player' : 'enemy' } });
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

        // ========== [新增] 交战区死亡监测 ==========
        // 处理法术击杀正在攻击/阻挡的单位：直接标记 dying 让 Card.tsx 播放碎裂动画
        // 不需要额外 cleanup——战斗结算 (calculateCombatOutcome) 会自然处理战场清理
        let combatDeath = false;
        const nextCombat = combatField.map(fight => ({
            ...fight,
            attacker: (() => {
                if (!fight.attacker) return fight.attacker;
                const hp = (fight.attacker.health || 0) + (fight.attacker.buffs?.health || 0) - (fight.attacker.damageTaken || 0);
                if (hp <= 0 && fight.attacker.animState !== 'dying' && fight.attacker.animState !== 'ephemeral_dying') {
                    combatDeath = true;
                    return { ...fight.attacker, animState: 'dying' as const };
                }
                return fight.attacker;
            })(),
            blocker: (() => {
                if (!fight.blocker) return fight.blocker;
                const hp = (fight.blocker.health || 0) + (fight.blocker.buffs?.health || 0) - (fight.blocker.damageTaken || 0);
                if (hp <= 0 && fight.blocker.animState !== 'dying' && fight.blocker.animState !== 'ephemeral_dying') {
                    combatDeath = true;
                    return { ...fight.blocker, animState: 'dying' as const };
                }
                return fight.blocker;
            })(),
        }));
        if (combatDeath) setCombatField(nextCombat);

    }, [playerBench, enemyBench, combatField]);

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

        // [核心新增] 监听全域受伤事件，将其吸入微队列统一清算！
        const handleUnitDamage = (payload: { id: string, amount: number }) => {
            pendingActionsRef.current.push({ type: 'UNIT_DAMAGED', payload });
        };

        // [新增] 监听全域死亡事件（尤其是交战区的尸体），纳入微队列清算！
        const handleUnitDeath = (unit: CardData) => {
            // 只要收到死讯，不管是备战席还是战场，先排个号
            // 因为前一步(改造点1)已经处理过备战席了，这里加个判断，只处理战场和未知来源的尸体
            const isInPlayerBench = stateRef.current.playerBench.some(c => c.id === unit.id);
            const isInEnemyBench = stateRef.current.enemyBench.some(c => c.id === unit.id);
            if (!isInPlayerBench && !isInEnemyBench) {
                // 如果尸体不在备战席，那就查查它之前是不是我方阵营的
                const owner = (stateRef.current.combatField.some(f => f.owner === 'player' && f.attacker.id === unit.id) ||
                               stateRef.current.combatField.some(f => f.owner === 'enemy' && f.blocker?.id === unit.id))
                              ? 'player' : 'enemy';
                pendingActionsRef.current.push({ type: 'UNIT_DIED', payload: { unit, bench: owner } });
            }
        };

        eventBus.on(GameEvents.NEXUS_STRIKED, handleNexusStrike);
        eventBus.on('unit_damage', handleUnitDamage); // 桥接法术与物理的受击事件
        eventBus.on(GameEvents.UNIT_DIE, handleUnitDeath); // 接收尸体
        return () => {
            eventBus.off(GameEvents.NEXUS_STRIKED, handleNexusStrike);
            eventBus.off('unit_damage', handleUnitDamage);
            eventBus.off(GameEvents.UNIT_DIE, handleUnitDeath);
        };
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

            // [新增] 军功审计探针：记录对局落幕
            gameLogger.logEvent({
                type: 'game_end',
                turn: game.round,
                isPlayerSide: true,
                result: finalResult === 'victory' ? 'win' : 'loss'
            });

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


    // ==========================================
    // [新增] 自动推进引擎 (Auto-Advance Engine)
    // ==========================================
    const [isAutoAdvancing, setIsAutoAdvancing] = useState(false);

    const canPlayerAct = (checkPhase: string) => {
        const { playerMana, playerSpellMana } = stateRef.current.game;
        const hand = stateRef.current.playerHand;
        const bench = stateRef.current.playerBench;
        const field = stateRef.current.combatField;

        // 1. 格挡阶段：检查是否有能用的阻挡者
        if (checkPhase === 'block_declare') {
            const canBlock = bench.some(blocker => {
                if (blocker.keywords.includes('CantBlock')) return false;
                return field.some(fight => {
                    // 只能挡对面的空位
                    if (fight.blocker !== null || fight.owner !== 'enemy') return false;
                    if (fight.attacker.keywords.includes('Elusive') && !blocker.keywords.includes('Elusive')) return false;
                    const blockerPower = (blocker.power || 0) + (blocker.buffs?.power || 0);
                    if (fight.attacker.keywords.includes('Fearsome') && blockerPower < 3) return false;
                    return true;
                });
            });
            if (canBlock) return true;

            // [格挡确认保护] 如果玩家已经分配了格挡单位，视为"可操作"
            // 此时玩家可以选择"格挡"按钮确认，或点击已分配的格挡者撤回
            const hasAssignedBlockers = field.some(fight => fight.blocker !== null);
            if (hasAssignedBlockers) return true;
        }

        // 2. 响应阶段 (包含格挡阶段)：检查是否有合规的法术可以打出
        if (checkPhase === 'block_declare' || checkPhase === 'react_to_block') {
            const canCast = hand.some(card => {
                if (!card.type.includes('spell')) return false;
                if (card.type === 'spell-slow') return false; // 战斗中绝不能打慢速法术
                return canAfford(card, playerMana, playerSpellMana);
            });
            if (canCast) return true;
        }

        return false;
    };

    useEffect(() => {
        // 不在动画期、不在结算期、不是微队列未清空期
        if (game.phase === 'animating' || game.gameResult !== null || pendingActionsRef.current.length > 0) return;

        // 仅在轮到玩家的防守/响应回合进行托管检测
        if (game.turnOwner === 'player' && (game.phase === 'block_declare' || game.phase === 'react_to_block')) {
            if (!canPlayerAct(game.phase)) {
                setIsAutoAdvancing(true);

                // 给予 0.8 秒的视觉缓冲期，让玩家看清敌方刚刚的操作，防晕车
                const timer = setTimeout(() => {
                    setIsAutoAdvancing(false);
                    // [核心修复] 区分格挡阶段和响应阶段的动作！
                    if (stateRef.current.game.phase === 'block_declare') {
                        confirmBlock(); // 格挡阶段无事可做应视为“防线确认完毕”
                    } else {
                        passTurn(); // 只有在战术响应阶段才叫“让过”
                    }
                }, 800);

                return () => clearTimeout(timer);
            }
        } else {
            setIsAutoAdvancing(false);
        }
    // 注意：绝不可将 passTurn 加入依赖以避免死循环
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [game.phase, game.turnOwner, playerHand.length, playerBench.length, game.playerMana, game.playerSpellMana]);



    // [重构] 序列化抽卡：利用 Ref 分离读写，彻底修复 StrictMode 下的双重调用 Bug
    const drawCards = async (count: number, owner: 'player' | 'enemy', delay: number = 0) => {
        if (delay > 0) await wait(delay);
        for (let i = 0; i < count; i++) {
            // [新增] 提前终止：如果游戏已经出结果，停止一切抽卡动画
            const curResult = stateRef.current.game.gameResult;
            if (curResult !== null) break;

            const currentDeck = owner === 'player' ? stateRef.current.playerDeck : stateRef.current.enemyDeck;

            // [核心修复] 疲劳判负逻辑：抽不出牌直接暴毙
            if (currentDeck.length === 0) {
                const loser = owner;
                const result = loser === 'player' ? 'defeat' : 'victory';

                // 军功黑匣子记录对局落幕
                gameLogger.logEvent({
                    type: 'game_end',
                    turn: stateRef.current.game.round,
                    isPlayerSide: true,
                    result: result === 'victory' ? 'win' : 'loss'
                });

                setGame(prev => ({ ...prev, gameResult: result, phase: 'animating' as const }));
                setMessage(loser === 'player' ? "牌库已空！你因疲劳而战败…" : "敌方牌库已空！敌方因疲劳而战败！");
                break;
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
            spellCasting: null,
            everywhereBuffs: [] // [核心新增] 重置游戏时，清空全域光环账本！
        } as any);

        eventBus.emit(GameEvents.ROUND_START, { round: 1 });
        setMessage("GAME START");
    };

    // --- 4. 战斗系统 ---

    const initiateAttack = () => {
        if (game.phase !== 'main') return;
        if (game.spellStack.length > 0) return;
        if (game.attackToken.player === null) return;
        if (game.turnOwner !== 'player') return;
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
            // [核心修复] 拆除 owner === 'player' 阵营隔离墙！允许全域监听进攻宣告！
            if (fight.attacker && fight.attacker.effects) {
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
                            // [核心修复] 动态抓取当前发起攻击的真实阵营！
                            owner: fight.owner,
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
    // [SBA] 生死簿同步判决 (judgeLifeAndDeath)
    // 在任意可能造成死亡的动作之后同步调用，统一宣判生死
    // ==========================================
    const judgeLifeAndDeath = () => {
        const { playerBench, enemyBench, combatField } = stateRef.current;
        let changed = false;
        const newlyDead: CardData[] = [];

        const judgeUnit = (c: CardData): CardData => {
            if (c.isDead) return c; // 已宣判，跳过
            const hp = (c.health || 0) + (c.buffs?.health || 0) - (c.damageTaken || 0);
            const isDead = hp <= 0 || c.animState === 'ephemeral_dying';
            if (isDead) {
                changed = true;
                const deadUnit = { ...c, isDead: true, animState: 'dying' as const };
                newlyDead.push(deadUnit);
                return deadUnit;
            }
            return c;
        };

        // ① 扫描 playerBench
        const newPlayerBench = playerBench.map(judgeUnit);
        // ② 扫描 enemyBench
        const newEnemyBench = enemyBench.map(judgeUnit);
        // ③ 扫描 combatField (attacker + blocker)
        const newCombatField = combatField.map(entry => ({
            ...entry,
            attacker: entry.attacker ? judgeUnit(entry.attacker) : null,
            blocker: entry.blocker ? judgeUnit(entry.blocker) : null,
        }));

        // 推入微队列触发亡语
        newlyDead.forEach(unit => {
            const owner = newPlayerBench.some(c => c.id === unit.id) ? 'player'
                : newEnemyBench.some(c => c.id === unit.id) ? 'enemy'
                : newCombatField.some(f => f.attacker?.id === unit.id)
                    ? (combatField.find(f => f.attacker?.id === unit.id)?.owner || 'player')
                    : 'player';
            eventBus.emit(GameEvents.UNIT_DIE, unit);
            pendingActionsRef.current.push({ type: 'UNIT_DIED', payload: { unit, bench: owner } });
        });

        if (changed) {
            setPlayerBench(newPlayerBench as CardData[]);
            setEnemyBench(newEnemyBench as CardData[]);
            setCombatField(newCombatField as any);
        }
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

        // [核心修复] 补齐全部战区快照，夺取手牌发放权
        let nextPlayerBench = [...stateRef.current.playerBench];
        let nextEnemyBench = [...stateRef.current.enemyBench];
        let nextCombatField = [...stateRef.current.combatField];
        let nextGame = { ...stateRef.current.game };
        let nextPlayerHand = [...stateRef.current.playerHand];
        let nextEnemyHand = [...stateRef.current.enemyHand];

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
            // =====================================
            // [新增] 结算单位受伤被动 (如：臆莲基座产无人机)
            // =====================================
            else if (action.type === 'UNIT_DAMAGED') {
                const targetId = action.payload.id;

                // 全场雷达：找出那个受伤的倒霉蛋
                let damagedUnit = nextPlayerBench.find(c => c.id === targetId) || nextEnemyBench.find(c => c.id === targetId);
                if (!damagedUnit) {
                    const fight = nextCombatField.find(f => f.attacker?.id === targetId || f.blocker?.id === targetId);
                    if (fight) damagedUnit = fight.attacker?.id === targetId ? fight.attacker : fight.blocker;
                }

                // 🕵️ [探针 1] 追踪微队列是否正确接收到事件并找到了单位
                console.log('[MicroQueue] UNIT_DAMAGED received', {
                    targetId,
                    foundUnit: !!damagedUnit,
                    unitName: damagedUnit?.name,
                    benchCount: nextPlayerBench.length,
                    combatFieldCount: nextCombatField.length
                });

                if (damagedUnit && damagedUnit.effects) {
                    damagedUnit.effects.forEach((effId: string) => {
                        const def = EFFECT_DB[effId];

                        // 🕵️ [探针 2] 追踪基因库查表与前置条件检索状态
                        console.log('[MicroQueue] Checking effect', {
                            effId,
                            defFound: !!def,
                            onDamagedGenerate: def?.params?.onDamagedGenerate
                        });

                        // 查表：如果这家伙带有“受伤发牌”的基因
                        if (def && def.params?.onDamagedGenerate) {
                            const reqKeys = def.params.presenceRequirement || [];

                            // 判断受伤单位的阵营，以此决定手牌和扫描归属
                            const isPlayerUnit = nextPlayerBench.some(c => c.id === targetId) ||
                                nextCombatField.some(f => (f.owner === 'player' && f.attacker.id === targetId) || (f.owner === 'enemy' && f.blocker?.id === targetId));

                            const benchToCheck = isPlayerUnit ? nextPlayerBench : nextEnemyBench;

                            // 检查前置条件（例如：我方阵营的猫汐尔是否在场）
                            const hasPresence = reqKeys.length === 0 ||
                                benchToCheck.some(c => reqKeys.some(req => c.key.includes(req))) ||
                                nextCombatField.some(f => {
                                    const u = f.owner === (isPlayerUnit ? 'player' : 'enemy') ? f.attacker : f.blocker;
                                    return u && reqKeys.some(req => u.key.includes(req));
                                });

                            if (hasPresence) {
                                // 满足条件！开动印钞机
                                const generatedCard = createFullCard(def.params.onDamagedGenerate!);
                                if (isPlayerUnit && nextPlayerHand.length < 10) {
                                    nextPlayerHand.push(generatedCard);
                                    console.log(`[MicroQueue] ${damagedUnit!.name} 受伤，生成 ${generatedCard.name} 到手牌！`);
                                } else if (!isPlayerUnit && nextEnemyHand.length < 10) {
                                    nextEnemyHand.push(generatedCard);
                                }
                            }
                        }
                    });
                }
            }
            // =====================================
            // [新增] 亡语清算中心 (The Necromancer Engine)
            // =====================================
            else if (action.type === 'UNIT_DIED') {
                const { unit, bench: owner } = action.payload as { unit: CardData, bench: 'player' | 'enemy' };

                if (unit.effects && unit.effects.length > 0) {
                    unit.effects.forEach(effId => {
                        const def = EFFECT_DB[effId];
                        // 从字典中核实该效果的 timing 是否为亡语
                        if (def && def.timing.includes('LAST_BREATH')) {
                            console.log(`[Necromancer] ${unit.name} 的亡语被触发！效果 ID: ${effId}`);

                            const ctx: EffectContext = {
                                game: nextGame,
                                playerBench: nextPlayerBench,
                                enemyBench: nextEnemyBench,
                                playerHand: nextPlayerHand,
                                enemyHand: nextEnemyHand,
                                playerDeck: stateRef.current.playerDeck, // 传引用
                                enemyDeck: stateRef.current.enemyDeck,   // 传引用
                                combatField: nextCombatField,
                                owner: owner, // 以亡者阵营的身份执行！
                                sourceCard: unit // 【关键】即使是一具尸体，它依然可以作为施法源头！
                            };

                            // 把亡者的遗愿无脑扔给中央处理器去办！
                            const res = processEffect(effId, [], ctx);

                            // 接收工厂的最新加工件
                            nextGame = res.game;
                            nextPlayerBench = res.playerBench;
                            nextEnemyBench = res.enemyBench;
                            nextPlayerHand = res.playerHand;
                            nextEnemyHand = res.enemyHand;
                            if (res.combatField) nextCombatField = res.combatField as any[];
                            if (res.playerDeck && owner === 'player') { setPlayerDeck(res.playerDeck); stateRef.current.playerDeck = res.playerDeck; }
                            if (res.enemyDeck && owner === 'enemy') { setEnemyDeckState(res.enemyDeck); stateRef.current.enemyDeck = res.enemyDeck; }
                        }
                    });
                }
            }
        });

        // 统一处理结算后的升级派单
        if (hasLeveledUp && leveledHeroes.length > 0) {
            nextGame.pendingLevelUps = [...(nextGame.pendingLevelUps || []), ...leveledHeroes];
            leveledHeroes.forEach(hero => {
                if (!nextGame.leveledChampions.includes(hero.key)) {
                    nextGame.leveledChampions.push(hero.key);
                }
                // [新增] 微队列升级也要记录日志，供成就任务系统使用
                gameLogger.logEvent({ type: 'level_up', turn: nextGame.round, isPlayerSide: true, cardKey: hero.key });
            });
        }

        // [核心修复] 将所有结算结果一次性拍板并写入 React 队列
        setPlayerBench(nextPlayerBench);
        setEnemyBench(nextEnemyBench);
        setCombatField(nextCombatField as any);
        setGame(nextGame as GameState);
        setPlayerHand(nextPlayerHand);
        setEnemyHand(nextEnemyHand);

        return true; // 返回 true 告知调用者“我处理过数据了”
    };

    const resolveCombatAnimation = async () => {
        // [SBA] 战斗开始前，先清尸
        judgeLifeAndDeath();
        setGame(prev => ({ ...prev, phase: 'animating' }));
        const totalFights = stateRef.current.combatField.length;
        const ralliedOwners = new Set<'player' | 'enemy'>(); // [核心新增] 收集在战斗中触发备战的阵营
        for (let i = 0; i < totalFights; i++) {
            let currentFight = stateRef.current.combatField[i];
            const { attacker, blocker } = currentFight;

            // [新增] 军功审计探针：记录我方发起进攻 (用于里芙卡背等任务)
            if (currentFight.owner === 'player') {
                gameLogger.logEvent({ type: 'attack', turn: stateRef.current.game.round, isPlayerSide: true, cardKey: attacker.key });
            }

            // [核心修复 1] 将快攻情报判定提前，用于指导动画状态机分流
            const hasQuickAttack = attacker.keywords.includes('QuickAttack');

            // [防诈尸补丁] 判断是否在法术阶段已被击杀
            const isAttackerDead = attacker.animState === 'dying' || attacker.animState === 'ephemeral_dying';

            setCombatField(prev => {
                const n = [...prev];

                // 严禁死者做动作！
                const atkState = isAttackerDead ? attacker.animState : 'attacking';
                let blkState = n[i].blocker?.animState;
                if (n[i].blocker && blkState !== 'dying' && blkState !== 'ephemeral_dying') {
                    blkState = hasQuickAttack ? 'delayed_attacking' : 'attacking';
                }

                n[i] = {
                    ...n[i],
                    attacker: { ...n[i].attacker, animState: atkState } as CardData,
                    blocker: n[i].blocker ? { ...n[i].blocker, animState: blkState as any } as CardData : null
                };
                return n;
            });

            // 音效与节奏控制
            let impactDelay = isAttackerDead ? 0 : 250; // 死人不需要等出刀前摇

            if (!isAttackerDead) {
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
            }

            // 等待直到撞击发生
            await wait(impactDelay + (isAttackerDead ? 0 : 150));
            const gameSnapshot = stateRef.current.game;
            const result = resolveSingleCombat(currentFight, gameSnapshot);

            // [核心新增] 物理战斗受伤事件抛出 (完美桥接微队列，彻底免去污染 combat.ts)
            if (result.attackerDamage > 0 && result.updatedFight.attacker) {
                eventBus.emit('unit_damage', { id: result.updatedFight.attacker.id, amount: result.attackerDamage });

                // ==========================================
                // [修改] 埋点 C-2：防守者造成伤害 (进攻者挨打，说明是防守者造成的物理伤害)
                // ==========================================
                if (currentFight.blocker && isSummonerOrSummon(currentFight.blocker)) {
                    const dmg = currentFight.blocker.key === 'Soline_Anubis' ? result.attackerDamage * 2 : result.attackerDamage;
                    accumulateMauxirDamage(stateRef.current.playerBench, stateRef.current.combatField, dmg, setPlayerBench, stateRef.current.playerHand, setPlayerHand, stateRef.current.playerDeck, setPlayerDeck);
                }
            }
            if (result.blockerDamage > 0 && result.updatedFight.blocker) {
                eventBus.emit('unit_damage', { id: result.updatedFight.blocker.id, amount: result.blockerDamage });

                // ==========================================
                // [修改] 埋点 C-1：进攻者造成伤害 (防守者挨打，说明是进攻者造成的物理伤害)
                // ==========================================
                if (isSummonerOrSummon(currentFight.attacker)) {
                    const dmg = currentFight.attacker.key === 'Soline_Anubis' ? result.blockerDamage * 2 : result.blockerDamage;
                    accumulateMauxirDamage(stateRef.current.playerBench, stateRef.current.combatField, dmg, setPlayerBench, stateRef.current.playerHand, setPlayerHand, stateRef.current.playerDeck, setPlayerDeck);
                }
            }

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
                    // [核心新增] 【激励之声】击杀监听器：如果凶手身上贴有这个暗号词条，立即向军需处申请备战令牌！
                    if (killer.keywords.includes('Listening_KillToRally' as any)) {
                        const killerOwner = killer.id === currentFight.attacker.id ? currentFight.owner : (currentFight.owner === 'player' ? 'enemy' : 'player');
                        ralliedOwners.add(killerOwner);
                        eventBus.emit('gain_token_rally', { owner: killerOwner }); // 发射视觉信号
                    }
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

            // [关键修正] 战果已经排入 React 队列，现在安全发起广播！
            if (result.nexusDamage) {
                eventBus.emit(GameEvents.NEXUS_STRIKED, result.nexusDamage);

                // ==========================================
                // [修改] 埋点 C-3：肉搏战水晶伤害统计 (必定是进攻者打水晶)
                // 无论是空门直击还是碾压溢出，对水晶造成伤害的永远是发起冲锋的 Attacker
                // ==========================================
                const nexusSource = currentFight.attacker;
                if (nexusSource && isSummonerOrSummon(nexusSource)) {
                    const nexusDmg = nexusSource.key === 'Soline_Anubis' ? result.nexusDamage.amount * 2 : result.nexusDamage.amount;
                    accumulateMauxirDamage(stateRef.current.playerBench, stateRef.current.combatField, nexusDmg, setPlayerBench, stateRef.current.playerHand, setPlayerHand, stateRef.current.playerDeck, setPlayerDeck);
                }
            }

            // [修复] 给予微小缓冲期即可，删除违法的常量赋值操作！
            await wait(50);

            // ==========================================
            // [核心新增] 埋点 D：全场打击雷达扫网 (The Strike Effect Radar)
            // 分别让两名参与交锋的战士，去触发他们身上带有的 ON_ATTACK (打击时) 效果！
            // ==========================================
            const triggerStrikeEffects = (unit: CardData, myRole: 'attacker' | 'blocker') => {
                if (!unit || !unit.effects || unit.effects.length === 0) return;

                // 精准判定谁是盟友（从而抓取正确的手牌、牌库写回权）
                const side = (myRole === 'attacker' && currentFight.owner === 'player') ||
                             (myRole === 'blocker' && currentFight.owner === 'enemy')
                             ? 'player' : 'enemy';

                unit.effects.forEach(effId => {
                    const def = EFFECT_DB[effId];
                    // 核对暗号：只有符合‘打击时’契约的被动效果才能通关！
                    if (def && def.timing.includes('ON_ATTACK')) {
                        console.log(`[StrikeRadar] ${unit.name} 发动了打击效果: ${def.name}`);

                        const ctx: EffectContext = {
                            game: stateRef.current.game,
                            playerBench: stateRef.current.playerBench,
                            enemyBench: stateRef.current.enemyBench,
                            playerHand: stateRef.current.playerHand,
                            enemyHand: stateRef.current.enemyHand,
                            playerDeck: stateRef.current.playerDeck,
                            enemyDeck: stateRef.current.enemyDeck,
                            combatField: stateRef.current.combatField,
                            owner: side, // 注入正确的阵营所有权
                            sourceCard: unit // 本体挂载为扫描源，充当印钞机或复制器的坐标起航点
                        };

                        // 把任务无脑托管给中央处理器！
                        const res = processEffect(effId, [], ctx);

                        // 一次性同步更新工厂流转完产生的手牌、牌库与备战席资产
                        if (side === 'player') {
                            if (res.playerHand) setPlayerHand(res.playerHand);
                            if (res.playerDeck) setPlayerDeck(res.playerDeck);
                            if (res.playerBench) setPlayerBench(res.playerBench);
                        } else {
                            if (res.enemyHand) setEnemyHand(res.enemyHand);
                            if (res.enemyDeck) setEnemyDeckState(res.enemyDeck);
                            if (res.enemyBench) setEnemyBench(res.enemyBench);
                        }
                    }
                });
            };

            // 1. 让发起冲锋的攻击者执行打击事件
            triggerStrikeEffects(currentFight.attacker, 'attacker');
            // 2. 让坐镇防线的阻挡者（如果存在）执行打击事件
            if (currentFight.blocker) {
                triggerStrikeEffects(currentFight.blocker, 'blocker');
            }

            // 为了让批量结算后进入微队列的数据足够新鲜，在正式计算军功统计增量前给 React 一线渲染微隙
            await wait(20);

            // [新增] 计算本轮战斗的统计增量
            let statsDelta = { nexus: 0, uKilled: 0, hKilled: 0, hLevel: 0 };

            // 1. 水晶伤害
            if (result.nexusDamage && result.nexusDamage.target === 'enemy') {
                statsDelta.nexus = result.nexusDamage.amount;

                // [新增] 军功审计探针：记录对敌方水晶造成的伤害 (用于芬妮卡背等任务)
                const dmgSource = currentFight.owner === 'player' ? currentFight.attacker : currentFight.blocker;
                if (dmgSource) {
                    gameLogger.logEvent({ type: 'nexus_damage', turn: stateRef.current.game.round, isPlayerSide: true, sourceCardKey: dmgSource.key, amount: result.nexusDamage.amount });
                }
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
            // [新增] 辅助函数：处理 CantAttack 单位的攻击力恢复与内存清理
            const processCantAttack = (unit: CardData, isSurvivor: boolean): CardData => {
                if (unit.keywords.includes('CantAttack')) {
                    const orig = cantAttackOrigPowerRef.current.get(unit.id);
                    if (orig) {
                        if (isSurvivor) {
                            // 若存活，归还真实的攻击力面板
                            unit = {
                                ...unit,
                                power: orig.power,
                                buffs: unit.buffs ? { ...unit.buffs, power: orig.buffsPower } : undefined,
                                roundBuffs: unit.roundBuffs ? { ...unit.roundBuffs, power: orig.roundBuffsPower } : undefined,
                            };
                        }
                        // 无论生死，打完架都要销毁账本，绝不留内存泄漏隐患！
                        cantAttackOrigPowerRef.current.delete(unit.id);
                    }
                }
                return unit;
            };

            // [关键修复] 严防死守：普通死亡和瞬息死亡都绝对不能进入幸存者名单！
            if (f.attacker.animState !== 'dying' && f.attacker.animState !== 'ephemeral_dying') {
                let unit = { ...f.attacker, animState: 'idle' as const };
                unit = processCantAttack(unit as any, true); // [修复] 恢复 CantAttack
                if (f.owner === 'player') survivorsP.push(unit as any);
                else survivorsE.push(unit as any);
            } else {
                processCantAttack(f.attacker, false); // [清理] 战死者销户
            }

            if (f.blocker) {
                if (f.blocker.animState !== 'dying' && f.blocker.animState !== 'ephemeral_dying') {
                    let unit = { ...f.blocker, animState: 'idle' as const };
                    unit = processCantAttack(unit as any, true); // [修复] 恢复 CantAttack
                    if (f.owner === 'player') survivorsE.push(unit as any);
                    else survivorsP.push(unit as any);
                } else {
                    processCantAttack(f.blocker, false); // [清理] 战死者销户
                }
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

            // [核心新增] 结算并下发战斗中因词条触发的【备战】(Rally) 令牌
            ralliedOwners.forEach(owner => {
                nextAttackToken[owner] = 'rally';
            });

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


    const playCard = (card: CardData, owner: 'player' | 'enemy', targets: any[] = []) => {
        // [新增 极强防御] 记录进入动画前的真实阶段
        const originalPhase = stateRef.current.game.phase;

        if (owner === 'player') {
            const { playerMana, playerSpellMana } = stateRef.current.game;
            if (!canAfford(card, playerMana, playerSpellMana)) {
                setMessage("法力不足！");
                return;
            }
            // [新增] 法术堆栈非空时，只能打出法术响应，不能出单位
            if (stateRef.current.game.spellStack.length > 0 && card.type.includes('unit')) {
                setMessage("法术响应中，无法派出单位！");
                return;
            }
        }

        // [底层重构] 英雄法术不再进行静默转换，而是统一进入抉择流程
        // [修正] 只有带 choices 的抉择法术才走抉择流程，支援技（无 choices）不触发
        if (owner === 'player' && card.associatedChampionKey && card.choices) {
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

        // [新增] 支援技语音：打出支援技时播放对应天启者的支援技语音
        if (owner === 'player' && card.associatedChampionKey && card.key.endsWith('_support')) {
            eventBus.emit(GameEvents.SPELL_CHOICE, {
                hero: { key: card.associatedChampionKey, id: `voice-${card.associatedChampionKey}` } as CardData,
                choice: 'support'
            });
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

        // [新增] 军功审计探针：记录成功打出卡牌 (用于 15 种常规皮肤成就)
        gameLogger.logEvent({
            type: 'play_card',
            turn: stateRef.current.game.round,
            isPlayerSide: owner === 'player',
            cardKey: card.key
        });

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
            } else if (game.phase === 'block_declare') {
                // [安全兜底] 即使发生了异常导致格挡阶段连续让过，强行确认防线以推动流程，绝不吞噬战斗
                confirmBlock();
            } else {
                // [核心修复] 如果在常规主阶段双方连续让过，不直接进入下回合，而是先执行回合结束清算序列（幻象清理等）
                executeRoundEndSequence();
            }
        }
        else setGame(prev => ({ ...prev, turnOwner: prev.turnOwner === 'player' ? 'enemy' : 'player', consecutivePasses: prev.consecutivePasses + 1, lastActionTimestamp: Date.now() }));
    };

    const toggleAttacker = (card: CardData, toCombat: boolean) => {
        if (toCombat) {
            // [核心修复] 拦截上限：战场最多容纳 6 人！
            // 必须在外层拦截！如果在 setCombatField 内拦截，会导致卡牌被 setPlayerBench 扣除后直接蒸发！
            if (stateRef.current.combatField.length >= 6) {
                setMessage("战场已满！最多同时 6 个单位进攻。");
                return;
            }
            // 装备防抖守卫
            if (stateRef.current.combatField.some(f => f.attacker.id === card.id)) return;

            // [CantAttack] 进入战场时攻击力归零，保存原值用于撤回恢复
            let finalCard = card;
            if (card.keywords.includes('CantAttack')) {
                cantAttackOrigPowerRef.current.set(card.id, {
                    power: card.power || 0,
                    buffsPower: card.buffs?.power || 0,
                    roundBuffsPower: card.roundBuffs?.power || 0,
                });
                finalCard = {
                    ...card,
                    power: 0,
                    buffs: card.buffs ? { ...card.buffs, power: 0 } : undefined,
                    roundBuffs: card.roundBuffs ? { ...card.roundBuffs, power: 0 } : undefined,
                };
            }

            // [新增] 进攻上场语音：检查是否是本回合首次行动
            if (card.isChampion && !heroActionHistory.current.has(card.id)) {
                eventBus.emit(GameEvents.HERO_FIRST_ACTION, card);
                heroActionHistory.current.add(card.id);
            }
            eventBus.emit(GameEvents.SFX_BLOCK);


            // [2026-06-27 CantAttack] 格挡者进入战场时攻击力归零

            let finalBlocker = blocker;

            if (blocker.keywords.includes('CantAttack')) {

            	cantAttackOrigPowerRef.current.set(blocker.id, {

            		power: blocker.power || 0,

            		buffsPower: blocker.buffs?.power || 0,

            		roundBuffsPower: blocker.roundBuffs?.power || 0,

            	});

            	finalBlocker = {

            		...blocker,

            		power: 0,

            		buffs: blocker.buffs ? { ...blocker.buffs, power: 0 } : undefined,

            		roundBuffs: blocker.roundBuffs ? { ...blocker.roundBuffs, power: 0 } : undefined,

            	};

            }

            setPlayerBench(prev => prev.filter(c => c.id !== card.id));
            setCombatField(prev => [...prev, { attacker: finalCard, blocker: null, owner: 'player' }]);
        } else {
            eventBus.emit(GameEvents.SFX_RECALL_BLOCK);
            setCombatField(prev => {
                const nextField = prev.filter(c => c.attacker.id !== card.id);
                // [Case 1 自动推进] 撤回单位后，检查战场是否已空。若空且处于进攻宣告期，自动退回主阶段
                const hasPlayerAttackers = nextField.some(c => c.owner === 'player');
                if (!hasPlayerAttackers && stateRef.current.game.phase === 'attack_declare') {
                    setGame(g => ({ ...g, phase: 'main', lastActionTimestamp: Date.now() }));
                }
                return nextField;
            });
            // [CantAttack] 撤回备战席时恢复原始攻击力
            if (card.keywords.includes('CantAttack')) {
                const orig = cantAttackOrigPowerRef.current.get(card.id);
                if (orig) {
                    const restoredCard = {
                        ...card,
                        power: orig.power,
                        buffs: card.buffs ? { ...card.buffs, power: orig.buffsPower } : undefined,
                        roundBuffs: card.roundBuffs ? { ...card.roundBuffs, power: orig.roundBuffsPower } : undefined,
                    };
                    cantAttackOrigPowerRef.current.delete(card.id);
                    setPlayerBench(prev => [...prev, restoredCard]);
                } else {
                    setPlayerBench(prev => [...prev, card]);
                }
            } else {
                setPlayerBench(prev => [...prev, card]);
            }
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
                n[fightIndex] = { ...n[fightIndex], blocker: finalBlocker, isChallenged: false };
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
                

                // [2026-06-27 CantAttack] 格挡者撤回时恢复原始攻击力

                if (blockerCard.keywords.includes('CantAttack')) {

                	const orig = cantAttackOrigPowerRef.current.get(blockerCard.id);

                	if (orig) {

                		blockerCard = {

                			...blockerCard,

                			power: orig.power,

                			buffs: blockerCard.buffs ? { ...blockerCard.buffs, power: orig.buffsPower } : undefined,

                			roundBuffs: blockerCard.roundBuffs ? { ...blockerCard.roundBuffs, power: orig.roundBuffsPower } : undefined,

                		};

                		cantAttackOrigPowerRef.current.delete(blockerCard.id);

                	}

                }
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

        // [新增] 军功审计探针：记录英雄成功升级 (用于卜卜卡背等任务)
        // 从战场快照中确认该英雄是否属于我方
        const isPlayerHero = stateRef.current.playerBench.some(c => c.id === card.id) ||
                             stateRef.current.combatField.some(f => (f.owner === 'player' && f.attacker.id === card.id) || (f.owner === 'enemy' && f.blocker?.id === card.id));

        if (isPlayerHero) {
            gameLogger.logEvent({ type: 'level_up', turn: stateRef.current.game.round, isPlayerSide: true, cardKey: card.key });
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
        isAutoAdvancing, // [新增] 暴露出托管状态，供前台按钮实现"微反馈"补偿
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
            judgeLifeAndDeath,  // [SBA] 生死簿同步判决
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
