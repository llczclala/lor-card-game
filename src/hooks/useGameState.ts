import { processEffect, processOnGetAttackToken } from '../logic/effectProcessor';
import type { EffectContext } from '../logic/effectProcessor';
import { EFFECT_DB } from '../data/effectRegistry';
import { useSpellSystem, waitForStrikeComplete } from './useSpellSystem'; // [核心新增] 引入法术系统引擎与时间管理器
import { useState, useRef, useEffect, useCallback } from 'react';
import type { CardData, GameState, GameRecordCategory, SpellStackItem, RecordEntity } from '../types';
import { createCard, CARD_DB } from '../data/cards';
import {  calculateNewMana, getLeveledUpCard, getEffectiveSpellCost, upgradeAcaciaHand } from '../utils/gameRules';
import { executeSpellEffect } from '../logic/spells';
import { resolveSingleCombat, getCurrentHP } from '../logic/combat'; // [新增] 引入真实血量探针
import { calculateRoundStart, canAfford } from '../logic/core';
import { eventBus, GameEvents,StrikeEvents } from '../utils/eventBus';
import { applyRoundStartKeywords, applyRoundEndKeywords, resolveTitanPulse, getPower, applyChannelOnSummon } from '../logic/keywords'; // [新增] 引入真实攻击力探针
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

// ★ 教程初始战场配置
export interface TutorialInitState {
    playerField?: { cardKey: string; hp: number; power: number }[];
    enemyField?: { cardKey: string; hp: number; power: number }[];
    playerBench?: string[];
    playerHand?: string[];
    playerCrystalHp?: number;
    enemyCrystalHp?: number;
    playerMana?: number;
    playerMaxMana?: number;
    enemyMana?: number;
    enemyMaxMana?: number;
}

// 1. 接收 initialDeck 参数，默认为空数组
export const useGameState = (deck: string[], enemyDeck: string[], isSandbox: boolean = false, disableMulligan: boolean = false, tutorialInit?: TutorialInitState, firstAttacker: 'player' | 'enemy' = 'player') => {
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
        everywhereBuffs: [], // [核心新增] 全域光环账本：用于记录各处 Buff
        friendlyUnitDeaths: 0, // [2026-07-14 梵音] 我方单位阵亡计数器
        enemyUnitDeaths: 0, // [2026-07-15] 敌方单位阵亡计数器
        // [2026-07-29 安卡希雅] 飞剑计数系统
        playerFlyingSwordsTotal: 0,
        playerGreatSwordsTotal: 0,
        playerRoundSwordUsed: false,
        playerRoundFlyingSwords: 0,
        enemyFlyingSwordsTotal: 0,
        enemyGreatSwordsTotal: 0,
        enemyRoundSwordUsed: false,
        enemyRoundFlyingSwords: 0,
        gameRecords: [], // [2026-07-20] 对局操作记录
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
    // [2026-07-30] 追踪进攻标识变化，检测 mid-round rally → 触发 ON_GET_ATTACK_TOKEN
    const prevAttackTokenRef = useRef<{ player: 'normal' | 'rally' | null; enemy: 'normal' | 'rally' | null }>({ player: null, enemy: null });
    useEffect(() => {
        const prev = prevAttackTokenRef.current;
        const curr = game.attackToken;
        ['player', 'enemy'].forEach(side => {
            const sideKey = side as 'player' | 'enemy';
            // 检测到新 rally 且非 RALLY 效果路径（避免与 effectProcessor 的 RALLY case 重复）
            if (curr[sideKey] === 'rally' && prev[sideKey] !== 'rally' && prev[sideKey] !== null) {
                const tokenResult = processOnGetAttackToken(sideKey, {
                    game, playerBench, enemyBench, playerHand, enemyHand,
                    playerDeck, enemyDeck: enemyDeckState,
                    combatField,
                });
                if (tokenResult.playerHand) setPlayerHand(tokenResult.playerHand);
                if (tokenResult.enemyHand) setEnemyHand(tokenResult.enemyHand);
                if (tokenResult.game !== game) setGame(tokenResult.game);
                if (tokenResult.playerBench !== playerBench) setPlayerBench(tokenResult.playerBench);
                if (tokenResult.enemyBench !== enemyBench) setEnemyBench(tokenResult.enemyBench);
            }
        });
        prevAttackTokenRef.current = { player: curr.player, enemy: curr.enemy };
    }, [game.attackToken.player, game.attackToken.enemy]);
    useEffect(() => {
        stateRef.current = { game, combatField, playerBench, enemyBench, playerHand, enemyHand, playerDeck, enemyDeck: enemyDeckState };
    }, [game, combatField, playerBench, enemyBench, playerHand, enemyHand, playerDeck, enemyDeckState]);

    // 辅助函数：异步等待
    const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

    // ==========================================
    // [2026-07-20] 对局操作记录 — 写入函数
    // ==========================================
    const recordIdRef = useRef(0);
    const recordAction = (
        category: GameRecordCategory,
        owner: 'player' | 'enemy',
        summary: string,
        options?: { cardKey?: string; detail?: string; entities?: RecordEntity[] }
    ) => {
        recordIdRef.current++;
        setGame(prev => ({
            ...prev,
            gameRecords: [...prev.gameRecords, {
                id: `rec-${recordIdRef.current}`,
                turn: prev.round,
                owner,
                category,
                summary,
                cardKey: options?.cardKey,
                detail: options?.detail,
                entities: options?.entities,
            }]
        }));
    };
    // ==========================================

    // [2026-07-21] 卡牌状态快照 — 冻结这一刻的数值
    const captureSnapshot = (card: CardData) => ({
        power: card.power || 0,
        health: card.health || 0,
        maxHealth: card.maxHealth || card.health || 0,
        damageTaken: card.damageTaken || 0,
        buffs: card.buffs ? { health: card.buffs.health, power: card.buffs.power } : undefined,
        roundBuffs: card.roundBuffs ? { health: card.roundBuffs.health, power: card.roundBuffs.power } : undefined,
    });

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
        firstAttacker, // [新增] 传递给回合引擎校正进攻标识偏移
        // [战术规避] 使用箭头函数包裹，规避 const 声明不会提升导致的”在初始化前访问”的报错死锁！
        flushMicroQueue: () => flushMicroQueue(),
        judgeLifeAndDeath: () => judgeLifeAndDeath(),   // [SBA] 生死簿同步判决
        wait,
        // [2026-07-23] 对局记录注入
        recordAction,
        captureSnapshot,
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

    // [2026-07-20 对局记录] 监听法术施放事件（从 commitSpell 发射）
    useEffect(() => {
        const onSpellRecord = (payload: { card: CardData; owner: 'player' | 'enemy'; targets: any[] }) => {
            recordAction('spell_cast', payload.owner, `施放 ${payload.card.name}`, {
                cardKey: payload.card.key,
                entities: [{ cardKey: payload.card.key, owner: payload.owner, snapshot: captureSnapshot(payload.card) }]
            });
        };
        eventBus.on('spell_record', onSpellRecord);
        return () => eventBus.off('spell_record', onSpellRecord);
    }, []);

    // [2026-07-21 对局记录] 监听法术效果事件（从 resolveStack 发射）
    useEffect(() => {
        const onSpellEffect = (payload: { owner: 'player' | 'enemy'; spellCardKey: string; summary: string; entities: RecordEntity[] }) => {
            const card = CARD_DB[payload.spellCardKey] as CardData | undefined;
            recordAction('spell_effect', payload.owner, payload.summary || (card ? `法术效果` : '法术效果'), {
                cardKey: payload.spellCardKey,
                entities: payload.entities,
            });
        };
        eventBus.on('spell_effect_record', onSpellEffect);
        return () => eventBus.off('spell_effect_record', onSpellEffect);
    }, []);

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
        const shuffledP = pDeck.sort(() => Math.random() - 0.5);
        const shuffledE = eDeck.sort(() => Math.random() - 0.5);

        // ★ 教程模式：由 tutorialInit 布置初始战场，不抽起手牌
        if (disableMulligan && tutorialInit) {
            // [修复] 改用计数 Map 替代 Set，同种卡牌多张时只移除实际被布置的数量
            const reserveCounts: Record<string, number> = {};
            const countReserve = (key: string) => {
                reserveCounts[key] = (reserveCounts[key] || 0) + 1;
            };
            tutorialInit.playerField?.forEach(u => countReserve(u.cardKey));
            tutorialInit.enemyField?.forEach(u => countReserve(u.cardKey));
            tutorialInit.playerBench?.forEach(k => countReserve(k));
            tutorialInit.playerHand?.forEach(k => countReserve(k));

            // 我方备战席：playerField + playerBench 都放备战席
            const pBenchKeys = [
                ...(tutorialInit.playerField || []).map(u => u.cardKey),
                ...(tutorialInit.playerBench || []),
            ];
            const eBenchKeys = [
                ...(tutorialInit.enemyField || []).map(u => u.cardKey),
            ];

            // 创建卡牌时应用 playerField/enemyField 中自定义的 hp/power
            const applyFieldOverrides = (cards: CardData[], fieldConfigs: { cardKey: string; hp: number; power: number }[]) =>
                cards.map(card => {
                    const config = fieldConfigs.find(c => c.cardKey === card.key);
                    if (!config) return card;
                    return { ...card, health: config.hp, maxHealth: config.hp, power: config.power, damageTaken: 0 };
                });

            const benchPCards = applyFieldOverrides(
                pBenchKeys.map(k => createFullCard(k)),
                tutorialInit.playerField || []
            );
            const benchECards = applyFieldOverrides(
                eBenchKeys.map(k => createFullCard(k)),
                tutorialInit.enemyField || []
            );
            const handPCards = (tutorialInit.playerHand || []).map(k => createFullCard(k));
            setPlayerBench(benchPCards);
            setEnemyBench(benchECards);
            setPlayerHand(handPCards);
            setEnemyHand([]);

            // 从牌库中移除已布置的卡牌（只移除指定数量），剩余作为可抽牌库
            const filterDeck = (deckArr: CardData[], counts: Record<string, number>) => {
                const remaining = { ...counts };
                return deckArr.filter(c => {
                    const needed = remaining[c.key];
                    if (needed && needed > 0) {
                        remaining[c.key] = needed - 1;
                        return false; // 移除此张
                    }
                    return true; // 保留
                });
            };
            const filteredP = filterDeck(shuffledP, reserveCounts);
            const filteredE = filterDeck(shuffledE, reserveCounts);
            setPlayerDeck(filteredP);
            setEnemyDeckState(filteredE);

            // ★ 关键：同步更新 ref，否则 startRound() 会读到旧值并覆盖掉
            stateRef.current.playerBench = benchPCards;
            stateRef.current.enemyBench = benchECards;
            stateRef.current.playerHand = handPCards;
            stateRef.current.enemyHand = [];
            stateRef.current.playerDeck = filteredP;
            stateRef.current.enemyDeck = filteredE;

            // 覆盖水晶 HP
            if (tutorialInit.playerCrystalHp !== undefined || tutorialInit.enemyCrystalHp !== undefined) {
                setGame(prev => ({
                    ...prev,
                    playerNexus: tutorialInit.playerCrystalHp ?? prev.playerNexus,
                    enemyNexus: tutorialInit.enemyCrystalHp ?? prev.enemyNexus,
                }));
            }

            // 覆盖初始法力
            if (tutorialInit.playerMana !== undefined || tutorialInit.playerMaxMana !== undefined
                || tutorialInit.enemyMana !== undefined || tutorialInit.enemyMaxMana !== undefined) {
                setGame(prev => ({
                    ...prev,
                    playerMana: tutorialInit.playerMana ?? prev.playerMana,
                    playerMaxMana: tutorialInit.playerMaxMana ?? prev.playerMaxMana,
                    enemyMana: tutorialInit.enemyMana ?? prev.enemyMana,
                    enemyMaxMana: tutorialInit.enemyMaxMana ?? prev.enemyMaxMana,
                }));
            }

            // [安卡希雅] 牌局开始时：扫描所有初始卡牌中的 gameStartGenerate
            (() => {
                const extra: CardData[] = [];
                const tutorHand = [...handPCards];
                const tutorDeck = [...filteredP];
                [...tutorHand, ...tutorDeck].forEach(card => {
                    if (card.effects) {
                        card.effects.forEach(effId => {
                            const def = EFFECT_DB[effId];
                            if (def && def.params?.gameStartGenerate) {
                                const genKey = def.params.gameStartGenerate;
                                const already = [...tutorHand, ...extra].some(c => c.key === genKey);
                                if (!already && tutorHand.length + extra.length < 10) {
                                    extra.push(createFullCard(genKey));
                                    console.log(`[GameStart] 牌局开始：生成 ${genKey} 到手牌`);
                                }
                            }
                        });
                    }
                });
                if (extra.length > 0) {
                    setPlayerHand(prev => [...prev, ...extra]);
                }
            })();
        } else {
            // 标准模式：正常发牌（各抽4张）
            const stdHand = shuffledP.slice(0, 4);
            const stdDeck = shuffledP.slice(4);

            setPlayerDeck(stdDeck);
            setPlayerHand(stdHand);
            setEnemyDeckState(shuffledE);
            setEnemyHand([]);
            setPlayerBench([]);
            setEnemyBench([]);
        }

    }, [deck, enemyDeck, disableMulligan, tutorialInit]);

    // [安卡希雅] 换牌结束/第一回合开始后，扫描手牌+牌库生成 gameStartGenerate 卡牌
    const triggerGameStartGenerate = useCallback(() => {
        const extra: CardData[] = [];
        [...stateRef.current.playerHand, ...stateRef.current.playerDeck].forEach(card => {
            if (card.effects) {
                card.effects.forEach(effId => {
                    const def = EFFECT_DB[effId];
                    if (def && def.params?.gameStartGenerate) {
                        const genKey = def.params.gameStartGenerate;
                        const already = [...stateRef.current.playerHand, ...extra].some(c => c.key === genKey);
                        if (!already && stateRef.current.playerHand.length + extra.length < 10) {
                            extra.push(createFullCard(genKey));
                            console.log(`[GameStart] 第1回合开始：生成 ${genKey} 到手牌`);
                        }
                    }
                });
            }
        });
        if (extra.length > 0) {
            setPlayerHand(prev => [...prev, ...extra]);
        }
    }, []);

    // [飞剑] 检测交战区出现飞剑衍生物→自动进入格挡阶段
    const flyingSwordPhaseGuardRef = useRef(false);
    useEffect(() => {
        const hasSwords = combatField.some(f =>
            f.attacker?.key === 'Acacia_Flying_Sword' || f.attacker?.key === 'Acacia_Great_Sword'
        );
        if (hasSwords && game.phase === 'main' && !flyingSwordPhaseGuardRef.current) {
            flyingSwordPhaseGuardRef.current = true;
            setGame(prev => ({
                ...prev,
                phase: 'block_declare',
                turnOwner: prev.turnOwner === 'player' ? 'enemy' : 'player',
                consecutivePasses: 0,
                lastActionTimestamp: Date.now(),
            }));
            setMessage('飞剑来袭，请分配格挡！');
        }
        if (!hasSwords) {
            flyingSwordPhaseGuardRef.current = false;
        }
    }, [game.phase, combatField.length]);

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
                    // [2026-07-31 架构修复] 若该英雄已全局升级（leveledChampions），关联法术取 Lv2 版本
                    //（如安卡 剑舞→重锋）——升级走全局标记自动适配，与其他天启者一致，不再依赖手动替换副本
                    const spellKey = leveledChampions.includes(card.key)
                        ? (getLeveledUpCard(card).associatedSpellKey || card.associatedSpellKey)
                        : card.associatedSpellKey;
                    const spellData = CARD_DB[spellKey];
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

    }, [playerBench, enemyBench, combatField, playerHand, enemyHand, game.leveledChampions]); // [关键] 依赖列表包含双方状态 + 全局升级标记（升级时自动重跑变形）

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

                // [NecroDebug] processDeaths 推送 UNIT_DIED
                if (deadUnitsToBroadcast.length > 0) {
                    console.log(`[NecroDebug] processDeaths 推送 ${deadUnitsToBroadcast.length} 个 UNIT_DIED:`, deadUnitsToBroadcast.map(u => `${u.name}(${u.key}) id=${u.id} anim=${u.animState}`));
                }

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
            console.log(`[🩸UnitDamage] 收到受伤事件: id=${payload.id}, amount=${payload.amount}`);
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
                if (card.isChampion && card.level === 1) {
                    // [2026-07-31 安卡希雅] 场下升级：朔望之期已标记全局升级（leveledChampions）→ 打出安卡直接 Lv2
                    // 对齐猫汐尔"场下达成条件、打出后升级"；已升级实例(level 2)会被 level===1 挡在外，不会重复升级
                    const alreadyMarked = game.leveledChampions.includes(card.key);
                    const statusMet = checkCardLevelUp(card, game.playerNexus, game.enemyNexus);
                    if (alreadyMarked || statusMet) {
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

            // [2026-07-31 安卡希雅] 升级后手牌法术替换：剑舞→重锋、扩散/集束→月镰剑势（战斗升级等通用路径）
            if (leveledHeroes.some(h => h.key === 'acacia_chrono_echo')) {
                setPlayerHand(prev => upgradeAcaciaHand(prev));
                setPlayerDeck(prev => upgradeAcaciaHand(prev)); // [2026-07-31] 牌库副本同步升级，抽到即 Lv2（否则变形系统会变出剑舞）
                console.log(`[安卡希雅] 升级扫描：手牌+牌库法术替换完成`);
            }

            // 1. 把英雄送进顶层升级调度队列，UI层将无条件接管屏幕播放动画
            setGame(prev => {
                // [2026-08-02 莉莉子] 队列去重：同一英雄 key 已在队中时不再重复入队，
                // 杜绝"持续满足条件"型英雄（如芬妮）在漏网场景下影片无限循环
                const queuedKeys = new Set((prev.pendingLevelUps || []).map(p => p.key));
                const freshHeroes = leveledHeroes.filter(h => !queuedKeys.has(h.key));
                return {
                    ...prev,
                    leveledChampions: [...new Set([...prev.leveledChampions, ...newKeys])],
                    pendingLevelUps: [...(prev.pendingLevelUps || []), ...freshHeroes]
                };
            });

            // [修复] 2. 物理洗牌移至 levelUpCard-triggered useEffect，
	            // 确保卡牌数据升级与影片播放时机一致，避免教程暂停升级时卡面已提前升级
        }
    // [关键依赖] 水晶血量变化、备战席人员变化，都会唤醒这套扫描引擎！
    }, [game.playerNexus, game.enemyNexus, playerBench, enemyBench, game.phase, game.gameResult]);


        // [修复] 升级影片开始时再替换卡牌数据（解决教程暂停升级导致卡面提前升级的问题）
    useEffect(() => {
        const card = game.levelUpCard;
        if (!card || !card.isChampion) return;
        const heroKey = card.key;

        // [修复] 排重检查：同时检查双方备战席 + 交战区（含挡格位）
        // [2026-08-02 莉莉子] 修复漏网：敌方备战席/挡格位的 Lv1 英雄此前不升级，
        // 配合芬妮"持续满足条件"的升级判定导致影片无限循环
        const needsUpgrade =
            playerBench.some(c => c.key === heroKey && c.level === 1) ||
            enemyBench.some(c => c.key === heroKey && c.level === 1) ||
            combatField.some(f =>
                (f.attacker.key === heroKey && f.attacker.level === 1) ||
                (f.blocker && f.blocker.key === heroKey && f.blocker.level === 1)
            );
        if (!needsUpgrade) return;

        const upgradeFn = (list: CardData[]) => list.map(c =>
            c.key === heroKey && c.level === 1 ? { ...getLeveledUpCard(c), id: c.id } : c
        );

        setPlayerBench(prev => upgradeFn(prev));
        setEnemyBench(prev => upgradeFn(prev));
        setPlayerHand(prev => upgradeFn(prev));
        setEnemyHand(prev => upgradeFn(prev));
        setPlayerDeck(prev => upgradeFn(prev));
        setEnemyDeckState(prev => upgradeFn(prev));
        // [修复] 同步更新交战区中的英雄数据（攻击方 + 挡格方都要升级）
        setCombatField(prev => prev.map(f => {
            let next = f;
            if (f.attacker.key === heroKey && f.attacker.level === 1) {
                next = { ...next, attacker: { ...getLeveledUpCard(f.attacker), id: f.attacker.id } };
            }
            if (f.blocker && f.blocker.key === heroKey && f.blocker.level === 1) {
                next = { ...next, blocker: { ...getLeveledUpCard(f.blocker), id: f.blocker.id } };
            }
            return next;
        }));
    }, [game.levelUpCard]);


// ==========================================
    // [新增] 自动推进引擎 (Auto-Advance Engine)
    // ==========================================
    const [isAutoAdvancing, setIsAutoAdvancing] = useState(false);

    const canPlayerAct = (checkPhase: string) => {
        const { playerMana, playerSpellMana, playerMaxMana } = stateRef.current.game;
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
                const effectiveCost = getEffectiveSpellCost(card, playerBench, playerMaxMana);
                return canAfford(card, playerMana, playerSpellMana, effectiveCost);
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



    // ══════════════════════════════════════════════════════════
    //  🎴 事件驱动抽卡系统 (取代旧的时间锁 wait)
    // ══════════════════════════════════════════════════════════

    const pendingDrawsRef = useRef<Map<string, { resolve: () => void }>>(new Map());

    // 注册全局事件监听器：DRAW_AT_CENTER → 分支判断，DRAW_COMPLETE → resolve
    useEffect(() => {
        const onAtCenter = (payload: { animId: string; card: CardData; owner: 'player' | 'enemy'; skipHandAdd?: boolean }) => {
            const { card, owner, skipHandAdd } = payload;
            const hand = owner === 'player' ? stateRef.current.playerHand : stateRef.current.enemyHand;
            const isBurn = hand.length >= 10;
            console.log(`[draw] onAtCenter ${owner} hand=${hand.length} isBurn=${isBurn} skipHandAdd=${skipHandAdd} card=${card.name}`);

            // [2026-07-06] 法术抽卡：卡已在手牌中（effectProcessor 已 push），仅播动画不再重复加入
            if (skipHandAdd) {
                eventBus.emit(GameEvents.DRAW_FLY_TO_HAND, { animId: payload.animId });
                return;
            }

            if (isBurn) {
                eventBus.emit(GameEvents.DRAW_CENTER_SHATTER, { animId: payload.animId });
            } else {
                // [交叉过渡] 立即写入手牌 + overlay 移除，AnimatedHandCard isNew 接替
                if (owner === 'player') {
                    setPlayerHand(prev => [...prev, card]);
                } else {
                    setEnemyHand(prev => [...prev, card]);
                }
                eventBus.emit(GameEvents.DRAW_FLY_TO_HAND, { animId: payload.animId });
            }
        };

        const onDrawComplete = (payload: { animId: string; card: CardData; owner: 'player' | 'enemy'; isBurn: boolean }) => {
            if (payload.isBurn) {
                console.log(`【爆牌】${payload.owner} 手牌满，${payload.card.name} 爆牌销毁`);
            } else {
                // [2026-07-07] 法术抽卡：卡不在手牌中（spells.ts 过滤了），动画完成才加入
                if (payload.owner === 'player') {
                    setPlayerHand(prev => prev.some(c => c.id === payload.card.id) ? prev : [...prev, payload.card]);
                } else {
                    setEnemyHand(prev => prev.some(c => c.id === payload.card.id) ? prev : [...prev, payload.card]);
                }
            }
            const pending = pendingDrawsRef.current.get(payload.animId);
            if (pending) {
                pending.resolve();
                pendingDrawsRef.current.delete(payload.animId);
            }
        };

        eventBus.on(GameEvents.DRAW_AT_CENTER, onAtCenter);
        eventBus.on(GameEvents.DRAW_COMPLETE, onDrawComplete);

        return () => {
            eventBus.off(GameEvents.DRAW_AT_CENTER, onAtCenter);
            eventBus.off(GameEvents.DRAW_COMPLETE, onDrawComplete);
            pendingDrawsRef.current.clear();
        };
    }, []);

    // [重构] 事件驱动抽卡：DRAW_START → 动画层飞牌库→中央
    // 动画层到达中央后发 DRAW_AT_CENTER → 事件监听器分支判断
    // 动画层播完后发 DRAW_COMPLETE → Promise resolve
    const drawCards = async (count: number, owner: 'player' | 'enemy', delay: number = 0) => {
        if (delay > 0) await wait(delay);
        // [2026-07-20 对局记录] 抽卡
        if (count > 0) recordAction('draw_card', owner, `抽了 ${count} 张牌`);
        for (let i = 0; i < count; i++) {
            // 提前终止：如果游戏已经出结果，停止一切抽卡动画
            const curResult = stateRef.current.game.gameResult;
            if (curResult !== null) break;

            const currentDeck = owner === 'player' ? stateRef.current.playerDeck : stateRef.current.enemyDeck;

            // 疲劳判负逻辑：抽不出牌直接暴毙
            if (currentDeck.length === 0) {
                const loser = owner;
                const result = loser === 'player' ? 'defeat' : 'victory';

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

            // 1. 物理层：立即扣除牌库里的卡牌
            if (owner === 'player') {
                setPlayerDeck(newDeck);
            } else {
                setEnemyDeckState(newDeck);
            }

            // 2. 生成唯一动画 ID，创建 Promise
            const animId = `draw_${owner}_${cardToDraw.id}_${Date.now()}`;
            const drawPromise = new Promise<void>(resolve => {
                pendingDrawsRef.current.set(animId, { resolve });
            });

            // 3. 通信层：发射 DRAW_START → 动画层开始飞牌库→中央
            eventBus.emit(GameEvents.DRAW_START, { animId, card: cardToDraw, owner });

            // 4. 等待动画层完整生命周期（中央到达 → 分支判断 → 飞入手牌/爆牌碎裂）
            await drawPromise;

            // 5. 节奏控制：单次抽牌结束后的微小停顿，准备抽下一张
            if (i < count - 1) await wait(300);
        }
    };

    // [安卡希雅] 快速抽卡：直接塞牌到手牌，跳过飞入动画
    const instantDrawCards = (count: number, owner: 'player' | 'enemy') => {
        // [BUG修复] 每次循环都从 stateRef 读牌库会导致闭包陷阱
        // （React 批量更新，stateRef.current 在同步循环中不会变）
        // 改为本地变量持有牌库，每次迭代 slice 更新
        let deck = owner === 'player'
            ? [...stateRef.current.playerDeck]
            : [...stateRef.current.enemyDeck];
        for (let i = 0; i < count; i++) {
            if (deck.length === 0) break;
            const card = deck[0];
            deck = deck.slice(1);
            if (owner === 'player') {
                setPlayerDeck(deck);
                setPlayerHand(prev => [...prev, card]);
            } else {
                setEnemyDeckState(deck);
                setEnemyHand(prev => [...prev, card]);
            }
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
            everywhereBuffs: [], // [核心新增] 重置游戏时，清空全域光环账本！
            gameRecords: [], // [2026-07-20] 重置对局记录
        } as any);

        recordAction('turn_start', 'player', `— 第 1 回合 —`);
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
        const pendingSpells: SpellStackItem[] = [];

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
                        // [BUG修复] 同步写回手牌（FLYING_SWORD 等效果会修改手牌中的卡牌数据）
                        if (res.playerHand && fight.owner === 'player') setPlayerHand(res.playerHand);
                        if (res.enemyHand && fight.owner === 'enemy') setEnemyHand(res.enemyHand);
                        // 注意：processEffect 内部的 SUMMON 指令可能会直接向 combatField 推入空降兵
                        if (res.combatField) tempCombatField = res.combatField;

                        hasEffectTriggered = true;
                    }
                });
            }

        });

        // [2026-07-17 阿尔戈重做] onAttackSpell 检测 — 支持无限制触发（鸽子）和有限次触发（银臂）
        initialFighters.forEach((fight) => {
            if (fight.attacker && fight.attacker.onAttackSpell) {
                // 判断是否为无限制触发 (ability.maxCharges === -1)
                const isUnlimited = fight.attacker.ability && fight.attacker.ability.maxCharges === -1;
                // 有限次触发且已触发过 → 跳过
                if (!isUnlimited && fight.attacker.customProgress) return;

                const spellCard = createFullCard(fight.attacker.onAttackSpell);
                spellCard.parentCard = { ...fight.attacker };
                pendingSpells.push({
                    card: spellCard,
                    owner: fight.owner,
                    targets: []
                });

                // 仅有限次触发需要标记 customProgress（如银臂首次进攻）
                if (!isUnlimited) {
                    const markUsed = (c: CardData) =>
                        c.id === fight.attacker.id ? { ...c, customProgress: 1 } : c;
                    tempPlayerBench = tempPlayerBench.map(markUsed);
                    tempEnemyBench = tempEnemyBench.map(markUsed);
                    if (tempCombatField) {
                        tempCombatField = tempCombatField.map(f => ({
                            ...f,
                            attacker: f.attacker && f.attacker.id === fight.attacker.id
                                ? { ...f.attacker, customProgress: 1 }
                                : f.attacker,
                            blocker: f.blocker,
                        }));
                    }
                }

                hasEffectTriggered = true;
                console.log(`[onAttackSpell] ${fight.attacker.name} 触发 onAttackSpell=${fight.attacker.onAttackSpell}，已推入堆栈${isUnlimited ? '（无限制）' : ''}`);
            }
        });

        // [贡露] 进攻宣告时：消耗无人机充能召唤辅助无人机
        initialFighters.forEach((fight) => {
            if (fight.attacker?.key !== 'titan_gonglu') return;
            const titanCharge = (fight.attacker as any).titanCharge || 0;
            if (titanCharge <= 0) return;

            const toSummon = Math.min(titanCharge, 4);
            const currentCombatLen = tempCombatField ? tempCombatField.length : 0;
            const availableSlots = 6 - currentCombatLen;
            const actuallySummon = Math.min(toSummon, availableSlots);

            for (let i = 0; i < actuallySummon; i++) {
                const drone = createCard('titan_gonglu_drone');
                drone.animState = 'idle';
                if (tempCombatField) {
                    tempCombatField.push({
                        attacker: drone,
                        blocker: null,
                        owner: fight.owner,
                    });
                }
            }

            // 消耗充能
            (fight.attacker as any).titanCharge = 0;
            if (actuallySummon > 0) {
                hasEffectTriggered = true;
                console.log(`[贡露] 召唤 ${actuallySummon} 个辅助无人机（充能 ${titanCharge}，空位 ${availableSlots}）`);
            }
        });

        // [修复] 根据进攻方决定格挡方：player 进攻 → enemy 格挡，enemy 进攻 → player 格挡
        const firstOwner = currentCombatField[0]?.owner || 'player';
        const blockTurnOwner = firstOwner === 'player' ? 'enemy' : 'player';

        // [2026-07-21 对局记录] 进攻宣告
        recordAction('combat_declare', firstOwner, '派出进攻', {
            entities: currentCombatField.map(f => ({
                cardKey: f.attacker.key,
                owner: f.owner,
                snapshot: captureSnapshot(f.attacker),
            }))
        });

        // 统一结算并下发给 React 渲染层
        // 如果有法术待结算（如银臂乱打），推入堆栈后直接进入格挡阶段
        // 堆栈中的法术会在格挡确认后、战斗结算前通过 passTurn → resolveStack 自然结算
        if (hasEffectTriggered || pendingSpells.length > 0) {
            setPlayerBench(hasEffectTriggered ? tempPlayerBench : stateRef.current.playerBench);
            setEnemyBench(hasEffectTriggered ? tempEnemyBench : stateRef.current.enemyBench);
            setCombatField(hasEffectTriggered ? (tempCombatField as any) : stateRef.current.combatField);
        }
        setGame(prev => ({
            ...(hasEffectTriggered ? tempGame : prev),
            spellStack: [...pendingSpells, ...(prev.spellStack || [])],
            phase: 'block_declare' as const,
            turnOwner: blockTurnOwner,
            consecutivePasses: 0,
            lastActionTimestamp: Date.now(),
            gameRecords: prev.gameRecords, // [2026-07-21] 确保 recordAction 的记录不被覆盖
        }));
        setMessage(pendingSpells.length > 0 ? "银臂乱打已入堆栈，请对手格挡" : "等待格挡...");
    };

    // [核心修复 1] 斩断直连结算！防守方确认格挡后，切入响应阶段，并把优先权踢回给进攻方
    const confirmBlock = () => {
        // [2026-07-21 对局记录] 格挡宣告 — 收集所有阻挡者
        const blockField = stateRef.current.combatField;
        const playerBlockers = blockField.filter(f => f.blocker && f.owner === 'enemy');
        const enemyBlockers = blockField.filter(f => f.blocker && f.owner === 'player');
        if (playerBlockers.length > 0) {
            recordAction('combat_declare', 'player', '派出格挡', {
                entities: playerBlockers.map(f => ({ cardKey: f.blocker!.key, owner: 'player', snapshot: captureSnapshot(f.blocker!) }))
            });
        }
        if (enemyBlockers.length > 0) {
            recordAction('combat_declare', 'enemy', '派出格挡', {
                entities: enemyBlockers.map(f => ({ cardKey: f.blocker!.key, owner: 'enemy', snapshot: captureSnapshot(f.blocker!) }))
            });
        }

        setGame(prev => ({
            ...prev,
            phase: 'react_to_block',
            // 谁刚确认完格挡（通常是防守方），就把优先权交给对面（进攻方）开始打法术
            turnOwner: prev.turnOwner === 'player' ? 'enemy' : 'player',
            consecutivePasses: 0,
            lastActionTimestamp: Date.now()
        }));
        setMessage("防线部署完毕，请进攻方进行战术响应");
        eventBus.emit(GameEvents.SFX_CONFIRM_BLOCK); // [教程] 子任务完成信号
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
            const hp = (c.health || 0) + (c.buffs?.health || 0) + (c.roundBuffs?.health || 0) - (c.damageTaken || 0); // [2026-07-31] 补上本回合临时血，优先被扣
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
            console.log(`[NecroDebug] judgeLifeAndDeath 推送 UNIT_DIED: ${unit.name}(${unit.key}) id=${unit.id} owner=${owner} 来源=${unit.animState === 'ephemeral_dying' ? '幻象死亡' : '血量归零'}`);
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
        let nextPlayerDeck = stateRef.current.playerDeck ? [...stateRef.current.playerDeck] : undefined;
        let nextEnemyDeck = stateRef.current.enemyDeck ? [...stateRef.current.enemyDeck] : undefined;

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
                    unitKey: damagedUnit?.key,
                    effects: damagedUnit?.effects,
                    damageTaken: damagedUnit?.damageTaken,
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

                        // ⭐ [2026-07-16 达努·班西] ON_DAMAGE_SURVIVE — 受伤存活触发
                        if (def && def.timing === 'ON_DAMAGE_SURVIVE') {
                            const currentHp = (damagedUnit.health + (damagedUnit.buffs?.health || 0) + (damagedUnit.roundBuffs?.health || 0) - (damagedUnit.damageTaken || 0)); // [2026-07-31] 补上本回合临时血
                            console.log(`[MicroQueue:OnDamageSurvive] ${damagedUnit.name} 检出 ON_DAMAGE_SURVIVE，HP=${currentHp}，damageTaken=${damagedUnit.damageTaken}，effects=${damagedUnit.effects?.join(',')}`);
                            if (currentHp > 0) {
                                const isPUnit = nextPlayerBench.some(c => c.id === targetId) ||
                                    nextCombatField.some(f => (f.owner === 'player' && f.attacker?.id === targetId) || (f.owner === 'enemy' && f.blocker?.id === targetId));

                                const survivorCtx: EffectContext = {
                                    game: nextGame, playerBench: nextPlayerBench, enemyBench: nextEnemyBench,
                                    playerHand: nextPlayerHand, enemyHand: nextEnemyHand,
                                    playerDeck: nextPlayerDeck, enemyDeck: nextEnemyDeck,
                                    combatField: nextCombatField,
                                    owner: isPUnit ? 'player' : 'enemy',
                                    sourceCard: damagedUnit
                                };

                                const res = processEffect(effId, [damagedUnit], survivorCtx);
                                if (res.game) nextGame = res.game;
                                if (res.playerBench) nextPlayerBench = res.playerBench;
                                if (res.enemyBench) nextEnemyBench = res.enemyBench;
                                if (res.playerHand) nextPlayerHand = res.playerHand;
                                if (res.enemyHand) nextEnemyHand = res.enemyHand;
                                if (res.playerDeck) nextPlayerDeck = res.playerDeck;
                                if (res.enemyDeck) nextEnemyDeck = res.enemyDeck;
                                if (res.combatField) nextCombatField = res.combatField;

                                console.log(`[MicroQueue] ${damagedUnit.name} 受伤存活，触发 ON_DAMAGE_SURVIVE 效果: ${def.name}`);
                            }
                        }

                        // 查表：如果这家伙带有”受伤发牌”的基因
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

                // ⭐ [2026-07-16 达努·温蒂] ON_FRIENDLY_DAMAGED — 友方受伤光环触发
                if (damagedUnit) {
                    const isPlayerUnit = nextPlayerBench.some(c => c.id === targetId) ||
                        nextCombatField.some(f => (f.owner === 'player' && f.attacker?.id === targetId) || (f.owner === 'enemy' && f.blocker?.id === targetId));
                    const friendlyBench = isPlayerUnit ? nextPlayerBench : nextEnemyBench;
                    const friendlySide = isPlayerUnit ? 'player' : 'enemy';

                    // 扫描该方所有在场单位的效果
                    const allFriendlyUnits = [...friendlyBench];
                    nextCombatField.forEach(fight => {
                        if (fight.attacker && fight.owner === friendlySide) allFriendlyUnits.push(fight.attacker);
                        if (fight.blocker && fight.owner !== friendlySide) allFriendlyUnits.push(fight.blocker);
                    });

                    allFriendlyUnits.forEach(unit => {
                        if (!unit.effects) return;
                        unit.effects.forEach(effId => {
                            const def = EFFECT_DB[effId];
                            if (def && def.timing === 'ON_FRIENDLY_DAMAGED') {
                                const auraCtx: EffectContext = {
                                    game: nextGame, playerBench: nextPlayerBench, enemyBench: nextEnemyBench,
                                    playerHand: nextPlayerHand, enemyHand: nextEnemyHand,
                                    playerDeck: nextPlayerDeck, enemyDeck: nextEnemyDeck,
                                    combatField: nextCombatField,
                                    owner: friendlySide,
                                    sourceCard: unit
                                };
                                const res = processEffect(effId, [damagedUnit], auraCtx);
                                if (res.playerBench) nextPlayerBench = res.playerBench;
                                if (res.enemyBench) nextEnemyBench = res.enemyBench;
                                if (res.combatField) nextCombatField = res.combatField;

                                console.log(`[MicroQueue] ${unit.name} 的 ON_FRIENDLY_DAMAGED 光环触发，为 ${damagedUnit.name} 添加 buff`);
                            }
                        });
                    });
                }
            }
            // =====================================
            // [新增] 亡语清算中心 (The Necromancer Engine)
            // =====================================
            else if (action.type === 'UNIT_DIED') {
                const { unit, bench: owner } = action.payload as { unit: CardData, bench: 'player' | 'enemy' };

                // [NecroDebug] 追踪亡语触发次数
                console.log(`[NecroDebug] UNIT_DIED 处理: ${unit.name}(${unit.key}), owner=${owner}, unit.id=${unit.id}, effects=`, unit.effects);

                // [2026-07-20 替换打出] 消亡不触发亡语、不计阵亡计数、不入墓地
                if (unit.deathType === 'ELIMINATED') {
                    console.log(`[ReplacePlay] ${unit.name} 为「消亡」，跳过亡语与计数`);
                    return; // 在 forEach 中等价于 continue
                }

                // [2026-07-14 梵音] 单位阵亡计数器（用于莎罗的入场BUFF，双方各计各的）
                if (owner === 'player') {
                    nextGame.friendlyUnitDeaths = (nextGame.friendlyUnitDeaths || 0) + 1;
                } else {
                    nextGame.enemyUnitDeaths = (nextGame.enemyUnitDeaths || 0) + 1;
                }

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

                            // [2026-07-09 新增] 亡语抽卡/生成动画事件（每张间隔 1.2s）
                            let necroAnimIdx = 0;
                            res.events.forEach(evt => {
                                if (evt.type === 'sfx_draw') {
                                    const drawnCard = evt.payload as CardData;
                                    const animId = `necromancer-draw-${drawnCard.id}-${Date.now()}`;
                                    setTimeout(() => {
                                        eventBus.emit(GameEvents.DRAW_START, {
                                            animId, card: drawnCard, owner,
                                            skipHandAdd: true,
                                        });
                                    }, necroAnimIdx * 1200);
                                    necroAnimIdx++;
                                }
                                if (evt.type === 'sfx_generate') {
                                    const genCard = evt.payload as CardData;
                                    // 从 React state 移除（批处理中后执行的是循环外的 setPlayerHand(nextPlayerHand)）
                                    if (owner === 'player') setPlayerHand(prev => prev.filter(c => c.id !== genCard.id));
                                    else setEnemyHand(prev => prev.filter(c => c.id !== genCard.id));
                                    // 【关键】同时也从 nextPlayerHand 移除，否则循环外 setPlayerHand(nextPlayerHand) 会把它加回来
                                    if (owner === 'player') nextPlayerHand = nextPlayerHand.filter(c => c.id !== genCard.id);
                                    else nextEnemyHand = nextEnemyHand.filter(c => c.id !== genCard.id);
                                    const animId = `necro-gen-${genCard.id}-${Date.now()}`;
                                    const delay = necroAnimIdx * 1200;
                                    necroAnimIdx++;
                                    setTimeout(() => {
                                        eventBus.emit(GameEvents.DRAW_START, {
                                            animId, card: genCard, owner,
                                            skipHandAdd: false, // 由动画把卡加回来，实现完整飞入效果
                                            skipDeckAnim: true,
                                        });
                                    }, delay);
                                }
                            });
                        }

                        // [丁型] 亡语：对敌方所有单位与水晶造成 2 点伤害
                        if (unit.key === 'titan_type_d_mutant') {
                            const enemyPlayer = owner === 'player' ? 'enemy' : 'player';
                            const enemyBench = enemyPlayer === 'player' ? nextPlayerBench : nextEnemyBench;

                            // 伤害敌方备战席
                            for (let i = 0; i < enemyBench.length; i++) {
                                enemyBench[i] = { ...enemyBench[i], damageTaken: (enemyBench[i].damageTaken || 0) + 2 };
                            }

                            // 伤害敌方交战区单位
                            if (nextCombatField) {
                                nextCombatField = nextCombatField.map(f => {
                                    const enemyUnit = f.owner !== owner ? f.attacker : f.blocker;
                                    if (!enemyUnit) return f;
                                    return {
                                        ...f,
                                        [f.owner !== owner ? 'attacker' : 'blocker']: {
                                            ...enemyUnit,
                                            damageTaken: (enemyUnit.damageTaken || 0) + 2,
                                        },
                                    };
                                });
                            }

                            // 伤害敌方水晶
                            if (enemyPlayer === 'player') {
                                nextGame.playerNexus = Math.max(0, (nextGame.playerNexus || 20) - 2);
                            } else {
                                nextGame.enemyNexus = Math.max(0, (nextGame.enemyNexus || 20) - 2);
                            }

                            eventBus.emit('unit_damage', { id: `nexus_${enemyPlayer}`, amount: 2 });
                            eventBus.emit(GameEvents.NEXUS_STRIKED, { target: enemyPlayer, amount: 2 });
                            console.log(`[丁型] 泰坦物质爆炸！对敌方全体造成 2 点伤害`);
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
        console.log(`[CombatDebug] resolveCombatAnimation 开始 — totalFights=${totalFights}`, stateRef.current.combatField.map((f: any) =>
            `A:${f.attacker?.key}(HP=${(f.attacker?.health||0)+(f.attacker?.buffs?.health||0)-(f.attacker?.damageTaken||0)} alive=!${f.attacker?.isDead&&'D'||f.attacker?.animState})` +
            ` vs B:${f.blocker?.key||'无'}(HP=${f.blocker?((f.blocker?.health||0)+(f.blocker?.buffs?.health||0)-(f.blocker?.damageTaken||0)):'—'} alive=!${f.blocker?.isDead&&'D'||f.blocker?.animState||'—'})`
        ));
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

            // [2026-07-21 对局记录] 单路战斗结算
            {
                const fightEnt: RecordEntity[] = [];
                const atkDied = result.killedUnits.some(u => u.id === currentFight.attacker.id);
                fightEnt.push({
                    cardKey: currentFight.attacker.key,
                    owner: currentFight.owner,
                    damageTaken: result.attackerDamage > 0 ? result.attackerDamage : undefined,
                    died: atkDied || undefined,
                    snapshot: captureSnapshot(result.updatedFight.attacker),
                });
                if (currentFight.blocker) {
                    const blkDied = result.killedUnits.some(u => u.id === currentFight.blocker!.id);
                    const blkOwner = currentFight.owner === 'player' ? 'enemy' : 'player';
                    fightEnt.push({
                        cardKey: currentFight.blocker!.key,
                        owner: blkOwner,
                        damageTaken: result.blockerDamage > 0 ? result.blockerDamage : undefined,
                        died: blkDied || undefined,
                        snapshot: captureSnapshot(result.updatedFight.blocker!),
                    });
                }
                let fightDetail: string | undefined;
                if (result.nexusDamage && result.nexusDamage.amount > 0) {
                    const targetLabel = result.nexusDamage.target === 'player' ? '你' : '敌方';
                    fightDetail = `🏰${targetLabel}受到${result.nexusDamage.amount}点伤害`;
                }
                recordAction('combat_fight', currentFight.owner, '交锋', {
                    entities: fightEnt,
                    detail: fightDetail,
                });
            }

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
            console.log(`[CombatDebug] 第${i+1}/${totalFights}路战斗结束: A=${result.updatedFight.attacker?.key}(HP=${(result.updatedFight.attacker?.health||0)+(result.updatedFight.attacker?.buffs?.health||0)-(result.updatedFight.attacker?.damageTaken||0)} state=${result.updatedFight.attacker?.animState})` +
                ` B=${result.updatedFight.blocker?.key||'无'}(HP=${result.updatedFight.blocker?((result.updatedFight.blocker?.health||0)+(result.updatedFight.blocker?.buffs?.health||0)-(result.updatedFight.blocker?.damageTaken||0)):'—'} state=${result.updatedFight.blocker?.animState||'—'})` +
                ` nexusDmg=${result.nexusDamage?.amount||0} killed=${result.killedUnits.map(u=>u.key).join(',')}`);

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

            // ==========================================
            // [鬼怪小队] 埋点 E：首次打击水晶雷达
            // 检测当前进攻方是否首次打击敌方水晶，触发鬼怪效果
            // 每张卡用 customProgress bit 0 独立记账
            // 注意：同时处理玩家方和敌方的鬼怪小队，敌我判断用 side 变量统一管理
            // ==========================================
            const isPlayerStriking = result.nexusDamage && result.nexusDamage.target === 'enemy' && currentFight.owner === 'player';
            const isEnemyStriking = result.nexusDamage && result.nexusDamage.target === 'player' && currentFight.owner === 'enemy';

            if (isPlayerStriking || isEnemyStriking) {
                const side = isPlayerStriking ? 'player' : 'enemy';
                const nexusFallbackTarget = side === 'player' ? 'player_nexus' : 'enemy_nexus';

                // [2026-07-09 修复] 只检查打击水晶的那个攻击者自身，而非扫描全场
                const striker = currentFight.attacker;
                if (striker && striker.effects && striker.effects.length > 0 && !((striker.customProgress || 0) & 1)) {
                    striker.effects.forEach(effId => {
                        const def = EFFECT_DB[effId];
                        if (def && def.timing.includes('ON_FIRST_NEXUS_STRIKE')) {
                            console.log(`[GhostRadar][${side}] ${striker.name}(${striker.id.slice(0,6)}) 发动鬼怪效果: ${def.name}`);

                            const markTriggered = (c: CardData) => ({ ...c, customProgress: (c.customProgress || 0) | 1 });

                            // 标注攻击者已触发（它在 combatField 中）
                            setCombatField(prev => prev.map(fight => {
                                if (fight.attacker?.id === striker.id)
                                    return { ...fight, attacker: markTriggered(fight.attacker) };
                                return fight;
                            }));

                            // 收集友方单位作为效果目标池（排除已死亡单位）
                            const bench = side === 'player' ? stateRef.current.playerBench : stateRef.current.enemyBench;
                            const allies: CardData[] = [...bench];
                            if (stateRef.current.combatField) {
                                stateRef.current.combatField.forEach(fight => {
                                    if (fight.owner === side && fight.attacker) allies.push(fight.attacker);
                                    if (fight.owner !== side && fight.blocker) allies.push(fight.blocker);
                                });
                            }
                            // [2026-07-09 修复] 过滤掉已死亡的单位，防止"尸体回春"复活
                            const liveAllies = allies.filter(u =>
                                !u.isDead && u.animState !== 'dying' && u.animState !== 'ephemeral_dying'
                            );

                            let autoTargets: { type: string; id: string }[] = [];
                            const params = def.params;

                            if (params.targetFilter === 'RANDOM_ALLY') {
                                if (liveAllies.length > 0) {
                                    const pick = liveAllies[Math.floor(Math.random() * liveAllies.length)];
                                    autoTargets = [{ type: 'ally', id: pick.id }];
                                }
                            } else if (params.targetFilter === 'RANDOM_WOUNDED_ALLY') {
                                const wounded = liveAllies.filter(u => (u.damageTaken || 0) > 0);
                                if (wounded.length > 0) {
                                    const pick = wounded[Math.floor(Math.random() * wounded.length)];
                                    autoTargets = [{ type: 'ally', id: pick.id }];
                                } else if (params.nexusFallback) {
                                    autoTargets = [{ type: nexusFallbackTarget, id: nexusFallbackTarget }];
                                }
                            }

                            const ctx: EffectContext = {
                                game: stateRef.current.game,
                                playerBench: stateRef.current.playerBench,
                                enemyBench: stateRef.current.enemyBench,
                                playerHand: stateRef.current.playerHand,
                                enemyHand: stateRef.current.enemyHand,
                                playerDeck: stateRef.current.playerDeck,
                                enemyDeck: stateRef.current.enemyDeck,
                                combatField: stateRef.current.combatField,
                                owner: side,
                                sourceCard: striker
                            };

                            const res = processEffect(effId, autoTargets, ctx);
                            if (res.game) setGame(res.game);
                            if (res.playerBench) setPlayerBench(res.playerBench);
                            if (res.enemyBench) setEnemyBench(res.enemyBench);
                            if (res.combatField) setCombatField(res.combatField);
                            if (res.playerHand) setPlayerHand(res.playerHand);
                            if (res.playerDeck) setPlayerDeck(res.playerDeck);
                            res.events.forEach(evt => {
                                if (evt.type === 'nexus_heal') {
                                    eventBus.emit(GameEvents.NEXUS_HEALED, evt.payload);
                                }
                            });
                        }
                    });
                }
            }

            // ==========================================
            // [2026-07-14 锻造者] 蕾西亚：每次打击水晶雷达 (ON_NEXUS_STRIKE)
            // 与鬼怪不同，不设首次保护，每次打击水晶都触发
            // ==========================================
            if (isPlayerStriking || isEnemyStriking) {
                const side = isPlayerStriking ? 'player' : 'enemy';
                const striker = currentFight.attacker;
                if (striker && striker.effects && striker.effects.length > 0) {
                    striker.effects.forEach(effId => {
                        const def = EFFECT_DB[effId];
                        if (def && def.timing.includes('ON_NEXUS_STRIKE')) {
                            console.log(`[ForgerRadar][${side}] ${striker.name}(${striker.id.slice(0,6)}) 发动锻造者效果: ${def.name}`);
                            const ctx: EffectContext = {
                                game: stateRef.current.game,
                                playerBench: stateRef.current.playerBench,
                                enemyBench: stateRef.current.enemyBench,
                                playerHand: stateRef.current.playerHand,
                                enemyHand: stateRef.current.enemyHand,
                                playerDeck: stateRef.current.playerDeck,
                                enemyDeck: stateRef.current.enemyDeck,
                                combatField: stateRef.current.combatField,
                                owner: side,
                                sourceCard: striker
                            };
                            const res = processEffect(effId, [], ctx);
                            if (res.game) setGame(res.game);
                            if (res.playerHand) setPlayerHand(res.playerHand);
                            if (res.enemyHand) setEnemyHand(res.enemyHand);
                            res.events.forEach(evt => {
                                if (evt.type === 'sfx_cost_reduce') {
                                    console.log(`[CostReduce] 减费事件: ${evt.payload.cardId} -${evt.payload.amount}`);
                                }
                            });
                        }
                    });
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

            // ✨ [2026-07-16 达努·班西] 每路战斗后立即处理微队列中的受伤事件
            // 让班西等单位的 ON_DAMAGE_SURVIVE 在当前碰撞后即时触发，不等整个战斗轮次结束
            flushMicroQueue();
            await wait(30); // 给 React 同步 stateRef，确保下一路战斗读到最新状态
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

        // ✨ [2026-07-16] 等待 BUFF 特效动画播放完毕再归位
        if (stateRef.current.combatField.some(f =>
            f.attacker.animState === 'buff' || f.blocker?.animState === 'buff'
        )) {
            await wait(600);
        }

        // [极其关键] 动画可能播了很久，在此期间监听器（如卜卜）可能已经把 2 级卡牌替换到了 stateRef 中。
        // 必须重新抓取最新鲜的战场快照，防止把旧的 1 级卡牌错误地移回备战席！
        const finalField = stateRef.current.combatField;

        // 收集幸存者 (逻辑同前，从最新的 finalField 中筛选)
        const survivorsP: CardData[] = [];
        const survivorsE: CardData[] = [];
        console.log(`[CombatDebug] 幸存者收集: finalField.length=${finalField.length}`, finalField.map((f:any) =>
            `A:${f.attacker?.key}(state=${f.attacker?.animState}) B:${f.blocker?.key||'无'}(state=${f.blocker?.animState||'—'})`
        ));

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

        // ==========================================
        // ✨ [2026-07-16 达努·银臂] POST_COMBAT 时序 — 战斗结算后触发
        // 扫描全场有 POST_COMBAT 效果的单位，对幸存者应用 buff
        // ==========================================
        const processPostCombatEffects = (side: 'player' | 'enemy', survivors: CardData[]): CardData[] => {
            if (survivors.length === 0) return survivors;

            // 收集该方所有单位（备战席 + 交战区中己方单位）
            const bench = side === 'player' ? stateRef.current.playerBench : stateRef.current.enemyBench;
            const combatUnits: CardData[] = [];
            stateRef.current.combatField.forEach(fight => {
                if (fight.attacker && fight.owner === side) combatUnits.push(fight.attacker);
                if (fight.blocker && fight.owner !== side) combatUnits.push(fight.blocker);
            });

            const allUnits = [...bench, ...combatUnits];
            let buffed = [...survivors];

            allUnits.forEach(unit => {
                if (!unit.effects) return;
                unit.effects.forEach(effId => {
                    const def = EFFECT_DB[effId];
                    if (def && def.timing === 'POST_COMBAT') {
                        const params = def.params as any;
                        const power = params.power || 0;
                        const health = params.health || 0;
                        const keywords: string[] = params.keywords || [];

                        // [2026-07-16] 首次进攻限制：银臂的战后buff仅首次进攻触发
                        if (params.firstAttackOnly && unit.customProgress !== 1) {
                            console.log(`[PostCombat] ${unit.name} 的 POST_COMBAT 效果跳过（非首次进攻，customProgress=${unit.customProgress}）`);
                            return;
                        }

                        buffed = buffed.map(c => ({
                            ...c,
                            buffs: {
                                power: (c.buffs?.power || 0) + power,
                                health: (c.buffs?.health || 0) + health
                            },
                            keywords: Array.from(new Set([...c.keywords, ...keywords])),
                            animState: 'buff' as const
                        }));

                        // [2026-07-16] 若效果源是首次进攻单位（银臂），标记 customProgress→2
                        if (params.firstAttackOnly && unit.onAttackSpell && unit.customProgress === 1) {
                            buffed = buffed.map(c =>
                                c.id === unit.id ? { ...c, customProgress: 2 } : c
                            );
                            console.log(`[PostCombat] ${unit.name} 首次进攻buff已结算完毕，customProgress→2`);
                        }

                        console.log(`[PostCombat] ${unit.name} 的 POST_COMBAT 效果已触发，已为 ${survivors.length} 个幸存者添加 buff`);
                    }
                });
            });

            return buffed;
        };

        const buffedSurvivorsP = processPostCombatEffects('player', survivorsP);
        const buffedSurvivorsE = processPostCombatEffects('enemy', survivorsE);

        // [剥离裁判权] 胜负判定已交由全局的”智能裁判(useEffect)”处理，确保多单位进攻时能爽快地鞭尸！

        // 归位
        setGame(prev => {
            // [修正] 战斗后只消耗发起进攻一方的 Token
            const currentFights = stateRef.current.combatField;
            const attackerOwner = currentFights.length > 0 ? currentFights[0].owner : null;

            const nextAttackToken = { ...prev.attackToken };
            if (attackerOwner) {
                // [2026-07-27 飞剑] 飞剑是额外攻击，不消耗进攻标识
                const allFlyingSwords = currentFights.every(f =>
                    f.attacker?.key === 'Acacia_Flying_Sword' || f.attacker?.key === 'Acacia_Great_Sword'
                );
                if (allFlyingSwords) {
                    // 飞剑攻击：保留进攻标识不变
                    console.log(`[飞剑] 飞剑攻击结束，保留进攻标识 ${nextAttackToken[attackerOwner]}`);
                } else {
                    // 正常战斗：消耗进攻标识
                    const allScout = currentFights.every(f => f.attacker?.keywords?.includes('Scout'));
                    if (allScout && nextAttackToken[attackerOwner] === 'normal') {
                        nextAttackToken[attackerOwner] = 'rally';
                    } else {
                        nextAttackToken[attackerOwner] = null;
                    }
                }
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

        setPlayerBench(prev => [...prev, ...buffedSurvivorsP]);
        setEnemyBench(prev => [...prev, ...buffedSurvivorsE]);
        setCombatField([]);
    };


    const playCard = (card: CardData, owner: 'player' | 'enemy', targets: any[] = []) => {
        // [新增 极强防御] 记录进入动画前的真实阶段
        const originalPhase = stateRef.current.game.phase;

        if (owner === 'player') {
            const { playerMana, playerSpellMana, playerMaxMana } = stateRef.current.game;
            // [2026-07-10 诗人] 凯特琳减费影响实际扣费
            const actualCost = getEffectiveSpellCost(card, playerBench, playerMaxMana);
            if (!canAfford(card, playerMana, playerSpellMana, actualCost)) {
                setMessage("法力不足！");
                return;
            }
            // [新增] 法术堆栈非空时，只能打出法术响应，不能出单位
            if (stateRef.current.game.spellStack.length > 0 && card.type.includes('unit')) {
                setMessage("法术响应中，无法派出单位！");
                return;
            }
            // [2026-07-16 修复] 战斗阶段不能打出单位卡牌（安全兜底）
            // [2026-07-27 莉莉子] 战斗阶段也不能打出慢速法术
            const isCombatPhase = stateRef.current.game.phase === 'attack_declare' || stateRef.current.game.phase === 'block_declare' || stateRef.current.game.phase === 'react_to_block';
            if (isCombatPhase) {
                if (card.type.includes('unit')) {
                    setMessage("战斗阶段无法派出单位！");
                    return;
                }
                if (card.type === 'spell-slow') {
                    setMessage("战斗阶段无法施放慢速法术！");
                    return;
                }
            }
        }

        // [底层重构] 英雄法术不再进行静默转换，而是统一进入抉择流程
        // [修正] 只有带 choices 的抉择法术才走抉择流程，支援技（无 choices）不触发
        if (card.associatedChampionKey && card.choices) {
            const champKey = card.associatedChampionKey;
            const champBench = owner === 'player' ? playerBench : enemyBench;
            // [修复] 三重判定：备战席 + 交战区 + 全局升级记录
            const champCombat = combatField.some(f =>
                f.owner === owner && f.attacker.key === champKey && f.attacker.level === 2
            );
            const hasLv2 = champBench.some(c => c.key === champKey && c.level === 2)
                || champCombat
                || stateRef.current.game.leveledChampions.includes(champKey);

            // [修改 1：拔剑留鞘修复] 在弹窗瞬间，立刻把这张 0 费英雄法术从手牌里没收暂存！
            if (owner === 'player') {
                setPlayerHand(prev => prev.filter(c => c.id !== card.id));
            } else {
                setEnemyHand(prev => prev.filter(c => c.id !== card.id));
            }

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
            setGame(prev => {
                const maxMana = owner === 'player' ? prev.playerMaxMana : prev.enemyMaxMana;
                return owner === 'player'
                    ? { ...prev, playerMana: Math.min(maxMana, newMana), playerSpellMana: Math.min(3, newSpellMana) }
                    : { ...prev, enemyMana: Math.min(maxMana, newMana), enemySpellMana: Math.min(3, newSpellMana) };
            });
        }

        // 无论单位还是法术，都要从手牌移除
        if (owner === 'player') setPlayerHand(prev => prev.filter(c => c.id !== card.id));
        else setEnemyHand(prev => prev.filter(c => c.id !== card.id));

        // ================================================
        // [核心模式] 打出拦截分支 — step 选择模式
        // ================================================
        // 规律：每个选择模式都在这里拦截 return，不走后面的上场/动画流程
        // 前置条件：扣费(2250) + 移除手牌(2272) 已完成
        //
        // 新增一个选择模式需要在以下 11 处同步接入：
        //   GameSession.tsx:
        //     ① 状态同步枢纽    (~392)  startCasting(card, true)
        //     ② spellState.isCasting (~1627) 排除（不触发法术覆盖层）
        //     ③ spellState.hasPendingSpell (~1628) 加入（触发确认按钮）
        //     ④ showMousePreview (~1743) 瞄准线鼠标跟随
        //     ⑤ onConfirmPendingSpell (~1644) 确认按钮路由
        //     ⑥ 中间卡牌点击取消 (~2004) 路由到 cancelPendingSpell
        //     ⑦ 渲染分支 (~2035) 卡牌渲染 vs 法术圆盘
        //     ⑧ 通用打出动画排除 (~1917)
        //   useGameState.ts:
        //     ⑨ confirmXxx 函数（如 confirmReplacePlay）
        //   useSpellSystem.ts:
        //     ⑩ cancelChoice 增加 step 处理（退卡退费）
        //     ⑪ cancelPendingSpell 增加 step 路由
        // ================================================
        // 已实现: select_discard(瓦莱莉) | select_hand_target(白猎) | select_bench(替换)
        // 未来占位: select_enemy_bench | select_enemy_hand
        // ================================================

        // [2026-07-09 瓦莱莉] 打出后进入弃牌选择模式（玩家侧），不直接上场
        if (owner === 'player' && card.key === 'Bridget_Squad_Valerie') {
            setGame(prev => ({
                ...prev,
                activeCard: card,
                spellCasting: { cardId: card.id, step: 'select_discard', targets: [] }
            }));
            setMessage("选择要弃置的手牌（可多选），然后点击确定");
            return; // 拦截：不进入后面的上场流程
        }

        // [2026-07-14 通用] 自动检测 HAND_CARD 目标需求 → 进入手牌选择模式
        // 取代了之前按卡 key 逐张拦截的硬编码方式（白猎等）
        if (owner === 'player' && card.effects && card.effects.length > 0) {
            const effectDef = EFFECT_DB[card.effects[0]];
            const handReq = effectDef?.targetRequirements?.find(r => r.type === 'HAND_CARD');
            if (handReq) {
                const maxCost = effectDef?.params?.maxCost as number | undefined; // [2026-07-14 白猎] 读取费用上限
                setGame(prev => ({
                    ...prev,
                    activeCard: card,
                    spellCasting: {
                        cardId: card.id,
                        step: 'select_hand_target',
                        mode: handReq.count === 0 ? 'multi' : 'single',
                        maxCount: handReq.count || undefined,
                        cardTypeFilter: handReq.cardTypeFilter,
                        label: handReq.label,
                        targets: [],
                        maxCost: maxCost, // 传给UI层用于过滤
                    }
                }));
                setMessage(maxCost ? `${handReq.label}（费用需低于${maxCost}）` : (handReq.label || '选择手牌'));
                return; // 拦截：不进入后面的上场流程
            }
        }

        // [2026-07-20 替换打出] 备战席满员时，打出的单位进入替换选择模式
        if (isUnit && owner === 'player' && playerBench.length >= 6) {
            setGame(prev => ({
                ...prev,
                activeCard: card,
                spellCasting: {
                    cardId: card.id,
                    step: 'select_bench',
                    targets: [],
                }
            }));
            setMessage("选择一个单位替换");
            return; // 拦截：不进入后面的上场流程
        }

        // ========== 丁型异化人：自脉冲 + 直送战场（玩家侧） ==========
        if (card.key === 'titan_type_d_mutant' && owner === 'player') {
            // 统计全场泰坦数（含交战区）
            const allOnField = [
                ...stateRef.current.playerBench,
                ...stateRef.current.enemyBench,
                ...stateRef.current.combatField.flatMap(f => [f.attacker, f.blocker].filter(Boolean)),
            ];
            const titanCount = allOnField.filter(c => c.keywords?.includes('Titan')).length;
            // 丁型自己也算在内（它入场后带着 Titan 关键词）
            const totalPulse = titanCount + 1;

            // 自脉冲：加攻击 + 立即黯淡
            const pulsedCard = {
                ...card,
                buffs: {
                    power: (card.buffs?.power || 0) + totalPulse,
                    health: card.buffs?.health || 0,
                },
                depletedKeywords: ['Titan'],  // 脉冲后立即黯淡，回合末不再触发
                abilityState: card.ability ? 'breathing' as const : undefined,
                animState: 'buff' as const,
            };
            (pulsedCard as any).pulseValue = totalPulse; // 用于 +N 飘字显示

            // 门：直送交战区
            setCombatField(prev => [...prev, {
                attacker: pulsedCard,
                blocker: null,
                owner: 'player',
            }]);

            // 切换到攻击宣告阶段，让玩家选择挑战目标
            setGame(prev => ({
                ...prev,
                phase: 'attack_declare' as const,
                turnOwner: 'player' as const,
                activeCard: undefined,
                attackToken: { ...prev.attackToken, player: 'normal' as const },
                consecutivePasses: 0,
                lastActionTimestamp: Date.now(),
            }));

            setMessage(`${card.name} 冲入战场！选择挑战的目标`);
            eventBus.emit(GameEvents.SFX_PLAYER_PLAY_UNIT);
            return;
        }

        // ========== AI 侧：丁型异化人入场 ==========
        if (card.key === 'titan_type_d_mutant' && owner === 'enemy') {
            // 统计全场泰坦数（含交战区）
            const allOnField = [
                ...stateRef.current.playerBench,
                ...stateRef.current.enemyBench,
                ...stateRef.current.combatField.flatMap(f => [f.attacker, f.blocker].filter(Boolean)),
            ];
            const titanCount = allOnField.filter(c => c.keywords?.includes('Titan')).length;
            const totalPulse = titanCount + 1;

            // 自脉冲：加攻击 + 立即黯淡
            const pulsedCard = {
                ...card,
                buffs: {
                    power: (card.buffs?.power || 0) + totalPulse,
                    health: card.buffs?.health || 0,
                },
                depletedKeywords: ['Titan'],
                abilityState: card.ability ? 'breathing' as const : undefined,
                animState: 'buff' as const,
            };
            (pulsedCard as any).pulseValue = totalPulse;

            // AI 自动选择挑战者目标
            const playerBench = stateRef.current.playerBench;
            const validTargets = playerBench.filter(c =>
                !c.isDead && c.animState !== 'dying' && c.animState !== 'ephemeral_dying'
            );
            let chosenBlocker: CardData | null = null;
            if (validTargets.length > 0) {
                // AI 策略：优先选最贵的（价值高），其次选血量最低的（容易击杀）
                chosenBlocker = validTargets.sort((a, b) => {
                    const costDiff = (b.cost || 0) - (a.cost || 0);
                    if (costDiff !== 0) return costDiff;
                    return (a.health || 0) - (b.health || 0);
                })[0];
            }

            // 直送交战区（带预选挑战目标）
            setCombatField(prev => [...prev, {
                attacker: pulsedCard,
                blocker: chosenBlocker,
                owner: 'enemy',
            }]);

            setGame(prev => ({
                ...prev,
                phase: 'block_declare' as const,
                turnOwner: 'player' as const,
                activeCard: undefined,
                attackToken: { ...prev.attackToken, enemy: 'normal' as const },
                consecutivePasses: 0,
                lastActionTimestamp: Date.now(),
            }));

            setMessage(`敌方 ${card.name} 冲入战场！${chosenBlocker ? `锁定 ${chosenBlocker.name} 为挑战目标！` : '无人可挑战！'}`);
            eventBus.emit(GameEvents.SFX_ENEMY_PLAY_UNIT);
            return;
        }

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
            // [2026-07-20 对局记录] 打出单位
            recordAction('play_card', owner, `打出 ${card.name}`, {
                cardKey: card.key,
                entities: [{ cardKey: card.key, owner, snapshot: captureSnapshot(card) }]
            });
        }

        // [2026-07-10 诗人·科洛] 追踪非易逝卡牌打出记录（供回合开始回收用）
        if (!card.keywords.includes('Ephemeral')) {
            console.log(`[Kelo_Debug] 📤 发射 KELO_TRACK_PLAY: card.key=${card.key}, card.name=${card.name}, owner=${owner}, 回合=${stateRef.current.game.round}`);
            eventBus.emit('KELO_TRACK_PLAY', { cardKey: card.key, owner });
        } else {
            console.log(`[Kelo_Debug] ⏭ 跳过追踪(易逝牌): card.key=${card.key}, card.name=${card.name}, owner=${owner}`);
        }

        // [2026-07-11 绿灵·艾娃] 光环检测已迁移至 useSpellSystem.ts 的 commitSpell/resolveStack

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
                    // [精灵小队 日志] 打印斯涅妮卡入场时的效果扫描
                    if (card.key === 'Spirit_Squad_Snenika') {
                        console.log(`[SpiritDebug] 斯涅妮卡入场，effects=`, card.effects);
                    }
                    card.effects.forEach(effId => {
                        const def = EFFECT_DB[effId];
                        if (card.key === 'Spirit_Squad_Snenika') {
                            console.log(`[SpiritDebug]  检查效果 ${effId}: timing=${def?.timing}, 匹配ON_PLAY=${def?.timing?.includes('ON_PLAY')}`);
                        }
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

                            // [2026-07-09 新增] 写入被处理器修改过的手牌（用于 GENERATE 等效果）
                            if (res.playerHand && owner === 'player') setPlayerHand(res.playerHand);
                            if (res.enemyHand && owner === 'enemy') setEnemyHand(res.enemyHand);

                            // [2026-07-09 新增] 处理战吼中的抽卡/生成动画事件（每张间隔 1.2s 确保完整播完）
                            let onplayAnimIdx = 0;
                            res.events.forEach(evt => {
                                if (evt.type === 'sfx_draw') {
                                    const drawnCard = evt.payload as CardData;
                                    const animId = `onplay-draw-${drawnCard.id}-${Date.now()}`;
                                    setTimeout(() => {
                                        eventBus.emit(GameEvents.DRAW_START, {
                                            animId, card: drawnCard, owner,
                                            skipHandAdd: true,
                                        });
                                    }, onplayAnimIdx * 1200);
                                    onplayAnimIdx++;
                                }
                                if (evt.type === 'sfx_generate') {
                                    const genCard = evt.payload as CardData;
                                    setPlayerHand(prev => prev.filter(c => c.id !== genCard.id));
                                    const animId = `onplay-gen-${genCard.id}-${Date.now()}`;
                                    const delay = onplayAnimIdx * 1200;
                                    onplayAnimIdx++;
                                    setTimeout(() => {
                                        eventBus.emit(GameEvents.DRAW_START, {
                                            animId, card: genCard, owner,
                                            skipHandAdd: false,
                                            skipDeckAnim: true,
                                        });
                                    }, delay);
                                }
                            });
                        }
                    });
                }

                // [2026-07-14 梵音] 莎罗入场：本牌局每有一个我方单位阵亡，自己和随机友方单位各+1/+1
                if (card.key === 'SacredChants_Squad_Shalo') {
                    const deathCount = owner === 'player'
                        ? (tempGame.friendlyUnitDeaths || 0)
                        : (tempGame.enemyUnitDeaths || 0);
                    const targetBench = owner === 'player' ? tempPlayerBench : tempEnemyBench;
                    if (deathCount > 0 && targetBench) {
                        const selfIndex = targetBench.findIndex(c => c.id === cardWithAbility.id);
                        for (let i = 0; i < deathCount; i++) {
                            // 给自己+1/+1
                            if (selfIndex >= 0) {
                                const self = targetBench[selfIndex];
                                targetBench[selfIndex] = {
                                    ...self,
                                    buffs: {
                                        power: (self.buffs?.power || 0) + 1,
                                        health: (self.buffs?.health || 0) + 1,
                                    },
                                };
                            }
                            // 随机一个其他友方单位+1/+1（不包含莎罗自己，"自己"那部分已在上面的self逻辑处理）
                            const available = targetBench.filter(c => !c.isDead && c.id !== cardWithAbility.id);
                            if (available.length > 0) {
                                const randomAlly = available[Math.floor(Math.random() * available.length)];
                                const allyIndex = targetBench.findIndex(c => c.id === randomAlly.id);
                                if (allyIndex >= 0) {
                                    const ally = targetBench[allyIndex];
                                    targetBench[allyIndex] = {
                                        ...ally,
                                        buffs: {
                                            power: (ally.buffs?.power || 0) + 1,
                                            health: (ally.buffs?.health || 0) + 1,
                                        },
                                    };
                                }
                            }
                        }
                        console.log(`[ShaloBuff] ${owner} 已阵亡 ${deathCount} 个单位，莎罗与友方各获得 ${deathCount} 次+1/+1`);
                    }
                }

                // [Channel 充能] 召唤时恢复 1 点法术法力，触发后黯淡
                if (card.keywords.includes('Channel') && !(card.depletedKeywords || []).includes('Channel')) {
                    tempGame = applyChannelOnSummon(card, owner, tempGame as any);
                    // 更新场上卡牌状态：追加 depletedKeywords + 触发特效
                    const bench = owner === 'player' ? tempPlayerBench : tempEnemyBench;
                    const cardIdx = bench.findIndex((c: any) => c.id === card.id);
                    if (cardIdx >= 0) {
                        bench[cardIdx] = {
                            ...bench[cardIdx],
                            depletedKeywords: [...(bench[cardIdx].depletedKeywords || []), 'Channel'],
                            animState: 'channel_pulse',
                        };
                    }
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
                // 法术：进入提交流程 (commitSpell 会处理 UI清理、扣费与入栈分流，且已内置录制)
                commitSpell(card, owner, targets, originalPhase); // [关键修复] 把时空锚点传给引擎！
            }
        }, 600);
    };


    const passTurn = () => {
        const g = stateRef.current.game; // [2026-07-16 修复] 用 stateRef 避免闭包陷阱
        console.log(`[passTurn] 被调用 — spellStack=${g.spellStack.length} consecutivePasses=${g.consecutivePasses} phase=${g.phase} turnOwner=${g.turnOwner}`);
        if (g.spellStack.length > 0 && g.consecutivePasses === 0) {
             console.log(`[passTurn] 📚 分支A：堆叠非空，resolveStack`);
             setGame(prev => ({ ...prev, consecutivePasses: 1 }));
             // [2026-07-16 修复] resolveStack 完成后自动 re-entry 继续流程
             // 避免因 async resolveStack 未完成就进入分支B导致战斗跳过堆栈
             resolveStack().then(() => passTurn());
             return;
        }
        // [核心修复 3] 判断连续让过时所处的阶段
        if (g.consecutivePasses >= 1) {
            console.log(`[passTurn] 🔄 分支B：二次让过，phase=${g.phase}`);
            // [2026-07-16 修复] 即使二次让过，堆栈未空也要先结算
            if (g.spellStack.length > 0) {
                console.log(`[passTurn] ⚠️ 二次让过但堆栈仍有 ${g.spellStack.length} 个法术，优先结算`);
                setGame(prev => ({ ...prev, consecutivePasses: 0 }));
                resolveStack().then(() => passTurn());
                return;
            }
            if (g.phase === 'react_to_block') {
                // 如果在格挡响应阶段双方连续让过，说明法术交锋彻底结束，进入真正的物理战斗碰撞！
                resolveCombatAnimation();
            } else if (g.phase === 'block_declare') {
                // [安全兜底] 即使发生了异常导致格挡阶段连续让过，强行确认防线以推动流程，绝不吞噬战斗
                confirmBlock();
            } else {
                // [核心修复] 如果在常规主阶段双方连续让过，不直接进入下回合，而是先执行回合结束清算序列（幻象清理等）
                executeRoundEndSequence();
            }
        }
        else {
            console.log(`[passTurn] ✅ 分支C：正常让过 → turnOwner ${g.turnOwner} → ${g.turnOwner === 'player' ? 'enemy' : 'player'}`);
            recordAction('pass_turn', g.turnOwner === 'player' ? 'player' : 'enemy', '让过');
            setGame(prev => ({ ...prev, turnOwner: prev.turnOwner === 'player' ? 'enemy' : 'player', consecutivePasses: prev.consecutivePasses + 1, lastActionTimestamp: Date.now() }));
        }
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
        eventBus.emit(GameEvents.SFX_SELECT_BLOCKER_UNIT); // [教程] 通知引导步推进
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

            // [凶恶] 判定：攻击力 < 3 的单位无法阻挡凶恶单位
            if (attacker.keywords.includes('Fearsome')) {
                const blockerPower = (blocker.power || 0) + (blocker.buffs?.power || 0) + (blocker.roundBuffs?.power || 0);
                if (blockerPower < 3) {
                    setMessage("攻击力不足 3 的单位无法阻挡【凶恶】单位！");
                    eventBus.emit('FEARSOME_REJECT', { unitId: attacker.id });
                    return;
                }
            }

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

            eventBus.emit(GameEvents.SFX_BLOCK);

            setPlayerBench(prev => prev.filter(c => c.id !== finalBlocker.id));
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
            let blockerCard = combat.blocker;

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

    // [AI 挑战] AI 使用挑战者，将玩家备战席的单位拉入战场格挡
    const aiChallengeUnit = (attackerId: string, playerUnitId: string) => {
        const targetUnit = playerBench.find(c => c.id === playerUnitId);
        if (!targetUnit) return;

        const combatIndex = combatField.findIndex(f => f.attacker.id === attackerId);
        if (combatIndex === -1) return;

        const oldBlocker = combatField[combatIndex].blocker;

        setPlayerBench(prev => {
            const newBench = prev.filter(c => c.id !== playerUnitId);
            if (oldBlocker) newBench.push(oldBlocker);
            return newBench;
        });

        setCombatField(prev => {
            const n = [...prev];
            n[combatIndex] = {
                ...n[combatIndex],
                blocker: targetUnit,
                isChallenged: true,
            };
            return n;
        });

        setMessage("敌方发动挑战！");
    };

    useEffect(() => {
        // [修改] 沙盒模式下，阻止自动调用 startRound (因为我们在上面的 hook 里已经手动设好第一回合状态了)
        if (!initializedRef.current && !isSandbox) {
            startRound();

            // ★ 如果指定了第一回合先手方，覆盖默认的 attackToken
            if (firstAttacker === 'enemy') {
                setGame(prev => ({
                    ...prev,
                    attackToken: { player: null, enemy: 'normal' },
                    turnOwner: 'enemy',
                }));
            }

            // ★ 覆盖教程模式的水晶初始 HP（在 startRound 之后执行，确保最终生效）
            if (tutorialInit?.playerCrystalHp !== undefined || tutorialInit?.enemyCrystalHp !== undefined) {
                setGame(prev => ({
                    ...prev,
                    playerNexus: tutorialInit.playerCrystalHp ?? prev.playerNexus,
                    enemyNexus: tutorialInit.enemyCrystalHp ?? prev.enemyNexus,
                }));
            }

            // ★ 覆盖教程模式的初始法力（在 startRound 之后执行，确保最终生效）
            if (tutorialInit?.playerMana !== undefined || tutorialInit?.playerMaxMana !== undefined
                || tutorialInit?.enemyMana !== undefined || tutorialInit?.enemyMaxMana !== undefined) {
                setGame(prev => ({
                    ...prev,
                    playerMana: tutorialInit.playerMana ?? prev.playerMana,
                    playerMaxMana: tutorialInit.playerMaxMana ?? prev.playerMaxMana,
                    enemyMana: tutorialInit.enemyMana ?? prev.enemyMana,
                    enemyMaxMana: tutorialInit.enemyMaxMana ?? prev.enemyMaxMana,
                }));
            }
        }
    }, [isSandbox, firstAttacker, tutorialInit]);


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
        console.log(`[Mulligan] requeueHandToDeck — 手牌数=${playerHand.length} 牌库数=${playerDeck.length} 手牌内容=${playerHand.map(c => c.key)}`);
        // 将手牌(4张)加到牌库最前面
        setPlayerDeck(prev => [...playerHand, ...prev]);
        // 清空手牌，等待 drawCards 重新抽取
        setPlayerHand([]);
    };

    // ==========================================
    // ==========================================
    // ★ 选择模式接入点 ⑨ — 每个 select_* step 的确认执行函数
    //    已实现: select_bench → confirmReplacePlay | select_discard → confirmValerieDiscard | select_hand_target → confirmHandTargetSelect
    //    未来: select_enemy_bench → confirmEnemyBenchSelect | select_enemy_hand → confirmEnemyHandSelect
    // ==========================================

    // [2026-07-20 替换打出] 确认替换 — 玩家选了要替换的备战席单位后调用
    const confirmReplacePlay = () => {
        const sc = stateRef.current.game.spellCasting;
        const activeCard = stateRef.current.game.activeCard;
        if (!sc || sc.step !== 'select_bench' || !activeCard) return;

        const selectedTarget = sc.targets[0];
        if (!selectedTarget) return;

        const oldBench = stateRef.current.playerBench;
        const oldUnitIndex = oldBench.findIndex(c => c.id === selectedTarget.id);
        if (oldUnitIndex === -1) return;

        // 1. 标记旧单位为「消亡」并发送碎裂事件
        const eliminatedUnit = { ...oldBench[oldUnitIndex], deathType: 'ELIMINATED' as const };
        eventBus.emit('unit_eliminated', { card: eliminatedUnit });

        // 2. 构建新单位，继承旧单位的 DOM id
        const newUnit = createFullCard(activeCard.key);
        newUnit.id = eliminatedUnit.id;
        const newCardWithAbility = newUnit.ability
            ? { ...newUnit, abilityState: 'breathing' as const, abilityCharges: newUnit.ability.maxCharges }
            : newUnit;

        // 3. 替换到备战席
        const newBench = oldBench.map((c, i) => i === oldUnitIndex ? newCardWithAbility : c);
        setPlayerBench(newBench);
        setGame(prev => ({ ...prev, activeCard: null, spellCasting: null }));
        setMessage(`替换完成：${eliminatedUnit.name} → ${activeCard.name}`);
        eventBus.emit(GameEvents.SFX_PLAYER_PLAY_UNIT);

        // 4. 触发 ON_PLAY 效果（战吼）
        if (newUnit.effects && newUnit.effects.length > 0) {
            let tempGame = { ...stateRef.current.game, playerBench: newBench };
            let tempPlayerBench = [...newBench];
            let tempEnemyBench = [...stateRef.current.enemyBench];
            let tempCombatField = [...stateRef.current.combatField];

            newUnit.effects.forEach(effId => {
                const def = EFFECT_DB[effId];
                if (def && def.timing.includes('ON_PLAY')) {
                    const ctx: EffectContext = {
                        game: tempGame,
                        playerBench: tempPlayerBench,
                        enemyBench: tempEnemyBench,
                        playerHand: stateRef.current.playerHand,
                        enemyHand: stateRef.current.enemyHand,
                        playerDeck: stateRef.current.playerDeck,
                        enemyDeck: stateRef.current.enemyDeck,
                        combatField: tempCombatField,
                        owner: 'player',
                        sourceCard: newUnit,
                    };
                    const res = processEffect(effId, [], ctx);
                    tempGame = res.game;
                    tempPlayerBench = res.playerBench;
                    tempEnemyBench = res.enemyBench;
                    if (res.combatField) tempCombatField = res.combatField;
                    if (res.playerDeck) setPlayerDeck(res.playerDeck);
                    if (res.enemyDeck) setEnemyDeckState(res.enemyDeck);
                    if (res.playerHand) setPlayerHand(res.playerHand);
                    if (res.enemyHand) setEnemyHand(res.enemyHand);
                    setPlayerBench(tempPlayerBench);
                }
            });
        }

        // 5. 触发入场语音
        eventBus.emit(GameEvents.PLAY_CARD_VOICE, newUnit);
    };

    // ==========================================
    // [2026-07-17 鸦眼小队] 确认校准 — 玩家选完卡后调用
    // ==========================================
    const confirmCalibrate = (selectedCardId?: string) => {
        const pending = game.calibratePending;
        if (!pending) return;

        let newDeck = [...pending.deckMinus];
        const drawn = [...pending.drawnCards];

        if (selectedCardId) {
            // 有选中：选中卡放牌库顶，其余回原位
            const selected = drawn.find(d => d.card.id === selectedCardId);
            if (!selected) return;

            // 选中卡放顶部
            newDeck.unshift(selected.card);

            // 剩余卡按原始索引降序排列回插，避免索引偏移
            const remaining = drawn.filter(d => d.card.id !== selectedCardId);
            remaining.sort((a, b) => b.originalIndex - a.originalIndex);

            remaining.forEach(d => {
                const cardsBefore = drawn.filter(
                    x => x.card.id !== selectedCardId && x.originalIndex < d.originalIndex
                ).length;
                const insertAt = Math.max(0, Math.min(d.originalIndex - cardsBefore, newDeck.length));
                newDeck.splice(insertAt, 0, d.card);
            });

            console.log(`[Calibrate] 玩家选择了 ${selected.card.name}，放回牌库顶`);

            // [2026-07-17 鸦眼小队] 海基校准光环：未选中的卡获得 buff
            const isPlayer = pending.owner === 'player';
            const ownerBench = isPlayer ? playerBench : enemyBench;

            // 统计海基数量（备战席 + 交战区）
            let hikiCount = ownerBench.filter(c => c.key === 'Crows_Eyest_Squad_Hiki' && !c.isDead).length;
            combatField.forEach(fight => {
                const unit = fight.owner === pending.owner ? fight.attacker : fight.blocker;
                if (unit && unit.key === 'Crows_Eyest_Squad_Hiki' && !unit.isDead) {
                    hikiCount++;
                }
            });

            if (hikiCount > 0) {
                const nonSelected = drawn.filter(d => d.card.id !== selectedCardId);
                nonSelected.forEach(d => {
                    const deckIdx = newDeck.findIndex(c => c.id === d.card.id);
                    if (deckIdx !== -1) {
                        const card = newDeck[deckIdx];
                        if (card.type?.includes('unit')) {
                            card.buffs = {
                                power: (card.buffs?.power || 0) + hikiCount,
                                health: (card.buffs?.health || 0) + hikiCount,
                            };
                        } else if (card.type?.includes('spell')) {
                            card.cost = Math.max(0, (card.cost || 0) - hikiCount);
                            card.customProgress = (card.customProgress || 0) | 2; // [2026-07-17] 标记绿色费用
                        }
                    }
                });
                console.log(`[Calibrate] 海基光环触发：${hikiCount}只海基在场，${nonSelected.length}张未选中卡获得buff`);
            }
        } else {
            // 无选中：全部回原位（按原始索引降序）
            drawn.sort((a, b) => b.originalIndex - a.originalIndex);
            drawn.forEach(d => {
                newDeck.splice(d.originalIndex, 0, d.card);
            });
            console.log(`[Calibrate] 玩家放弃选择，全部放回原位`);
        }

        // 更新牌库，清除校准状态
        if (pending.owner === 'player') {
            setPlayerDeck(newDeck);
        } else {
            setEnemyDeckState(newDeck);
        }
        setGame(prev => ({ ...prev, calibratePending: undefined }));
        setMessage(selectedCardId ? '校准完成' : '放弃校准');
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

    // [2026-07-09 瓦莱莉] 确认弃牌选择并执行召唤
    const confirmValerieDiscard = () => {
        const sc = stateRef.current.game.spellCasting;
        if (!sc || sc.step !== 'select_discard') return;
        const selectedIds = sc.targets.map((t: any) => t.id);
        const discardCount = selectedIds.length;

        // 1. 从手牌移除弃置的卡牌
        setPlayerHand(prev => prev.filter(c => !selectedIds.includes(c.id)));

        // 2. 瓦莱莉上场
        const activeCard = stateRef.current.game.activeCard;
        if (activeCard) {
            const valerie = { ...activeCard, animState: 'idle' as const };
            setPlayerBench(prev => [...prev, valerie]);
        }

        // 3. 召唤夜巡猫头鹰（带 +X/+X）
        if (discardCount >= 0) {
            const owl = createCard('Night_Owl');
            owl.buffs = {
                power: discardCount,
                health: discardCount
            };
            owl.customProgress = discardCount;
            setPlayerBench(prev => [...prev, owl]);
            setMessage(`瓦莱莉弃置了 ${discardCount} 张牌，召唤了 ${discardCount + 1}/${discardCount + 1} 的夜巡猫头鹰`);
        }

        // 4. 清除选择状态
        setGame(prev => ({
            ...prev,
            activeCard: null,
            spellCasting: null,
            phase: 'main',
            lastActionTimestamp: Date.now()
        }));
    };

    // [2026-07-14 通用] 统一手牌选择确认 — 上场 activeCard + processEffect 执行效果
    const confirmHandTargetSelect = () => {
        const sc = stateRef.current.game.spellCasting;
        const activeCard = stateRef.current.game.activeCard;
        if (!sc || sc.step !== 'select_hand_target' || !activeCard) return;

        const selectedIds = sc.targets.map((t: any) => t.id);
        if (selectedIds.length === 0) { setMessage("请选择手牌"); return; }

        // 1. activeCard 上场
        const updatedBench = [...stateRef.current.playerBench, { ...activeCard, animState: 'idle' as const }];

        // 2. 构造 context（bench 已包含 activeCard，手牌保留以供 processEffect 处理）
        const effectKey = activeCard.effects?.[0];
        const targets = selectedIds.map(id => ({ type: 'ally' as const, id }));
        const ctx: EffectContext = {
            game: stateRef.current.game,
            playerBench: updatedBench,
            enemyBench: stateRef.current.enemyBench,
            playerHand: stateRef.current.playerHand,
            enemyHand: stateRef.current.enemyHand,
            playerDeck: stateRef.current.playerDeck,
            enemyDeck: stateRef.current.enemyDeck,
            combatField: stateRef.current.combatField,
            owner: 'player',
            sourceCard: activeCard
        };

        // 3. 执行效果（如果有）
        if (effectKey) {
            const res = processEffect(effectKey, targets, ctx);
            if (res.playerBench) setPlayerBench(res.playerBench);
            if (res.playerHand) setPlayerHand(res.playerHand);
            if (res.playerDeck) setPlayerDeck(res.playerDeck);
            if (res.enemyHand) setEnemyHand(res.enemyHand);
            if (res.combatField) setCombatField(res.combatField);
            if (res.game) setGame(res.game);
            res.events?.forEach(evt => {
                if (evt.type === 'summon') {
                    eventBus.emit(GameEvents.SFX_SUMMON);
                }
            });
        } else {
            // 没有 effectKey → 只上场（安全 fallback）
            setPlayerBench(updatedBench);
        }

        // 4. 清除施法状态
        setGame(prev => ({
            ...prev,
            activeCard: null,
            spellCasting: null,
            phase: 'main',
            lastActionTimestamp: Date.now()
        }));
    };

    // [2026-07-22 莉莉子] 手牌卡片动画完成 → 从手牌移除
    const onHandAnimComplete = useCallback((cardId: string, owner: 'player' | 'enemy') => {
        if (owner === 'player') {
            setPlayerHand(prev => prev.filter(c => c.id !== cardId));
            stateRef.current.playerHand = stateRef.current.playerHand.filter(c => c.id !== cardId);
        } else {
            setEnemyHand(prev => prev.filter(c => c.id !== cardId));
            stateRef.current.enemyHand = stateRef.current.enemyHand.filter(c => c.id !== cardId);
        }
    }, []);

    return {
        onHandAnimComplete,
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
            instantDrawCards,
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
            aiChallengeUnit,   // [AI 挑战] AI 侧挑战玩家单位
            replaceOpeningHand,
            performMulligan, // [新增]
            confirmPendingSpell,
            cancelPendingSpell,
            confirmValerieDiscard, // [2026-07-09] 瓦莱莉弃牌确认
            confirmHandTargetSelect, // [2026-07-14] 统一手牌选择确认
            requeueHandToDeck,
            triggerGameStartGenerate, // [2026-07-27 安卡希雅] 第一回合开始时生成库效卡牌
            confirmCalibrate, // [2026-07-17 鸦眼小队] 确认校准
            confirmReplacePlay, // [2026-07-20 替换打出] 确认替换
            queueLevelUp,    // [新增] 暴露给战斗推演或事件监听，用于让英雄拿号排队
            popLevelUp,       // [新增] 暴露给 UI 层，用于在视频播放完毕后请英雄离场
        }
    };
};
