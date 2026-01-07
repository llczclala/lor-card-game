import { useState, useRef, useEffect } from 'react';
import type { CardData, GameState, SpellStackItem, CombatFieldItem } from '../types';
import { createCard, CARD_DB } from '../data/cards';
import { calculateNewMana,getLeveledUpCard } from '../utils/gameRules';
import { executeSpellEffect } from '../logic/spells';
import { resolveSingleCombat } from '../logic/combat';
import { calculateRoundStart } from '../logic/core';
import { eventBus, GameEvents } from '../utils/eventBus';
import { applyRoundStartKeywords } from '../logic/keywords'; // [新增]
import { processEffect } from '../logic/effectProcessor';
import type { EffectContext } from '../logic/effectProcessor';
import { EFFECT_DB } from '../data/effectRegistry';



// 1. 接收 initialDeck 参数，默认为空数组
export const useGameState = (initialDeck: string[] = []) => {
    // --- 1. 状态定义 ---
    const [game, setGame] = useState<GameState>({
        playerMana: 0, playerMaxMana: 0, playerSpellMana: 0,
        enemyMana: 0, enemyMaxMana: 0, enemySpellMana: 0,
        playerNexus: 20, enemyNexus: 20,
        round: 0,
        attackToken: { player: null, enemy: null },
        phase: 'main',
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
        leveledChampions: []
    });
// 新增：牌库状态 (Deck)
    const [playerDeck, setPlayerDeck] = useState<CardData[]>([]);
    const [enemyDeck, setEnemyDeck] = useState<CardData[]>([]);
    // [新增] 将当前手牌全部放回牌库顶端 (用于换牌结束后的衔接)

    const [playerHand, setPlayerHand] = useState<CardData[]>([]);
    const [enemyHand, setEnemyHand] = useState<CardData[]>([]);
    const [playerBench, setPlayerBench] = useState<CardData[]>([]);
    const [enemyBench, setEnemyBench] = useState<CardData[]>([]);
    const [combatField, setCombatField] = useState<CombatFieldItem[]>([]);

    // 新增：记录胜利时存活的英雄 Key，用于播放对应的胜利 CG
    const [winningHeroKeys, setWinningHeroKeys] = useState<string[]>([]);

    const [message, setMessage] = useState("游戏开始！");

    // 状态 Refs (用于解决异步闭包陈旧数据问题)
    const stateRefs = useRef({ game, playerBench, enemyBench, combatField, playerHand, enemyHand });
    const heroActionHistory = useRef<Set<string>>(new Set());
    const initializedRef = useRef(false);

    // [新增] State Ref: 用于在异步循环中获取最新状态 (加入 Deck 状态)
    const stateRef = useRef({ game, combatField, playerBench, enemyBench, playerHand, enemyHand, playerDeck, enemyDeck });

    useEffect(() => {
        stateRef.current = { game, combatField, playerBench, enemyBench, playerHand, enemyHand, playerDeck, enemyDeck };
    }, [game, combatField, playerBench, enemyBench, playerHand, enemyHand, playerDeck, enemyDeck]);

    // 辅助函数：异步等待
    const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

    useEffect(() => {
        stateRefs.current = { game, playerBench, enemyBench, combatField, playerHand, enemyHand };
    }, [game, playerBench, enemyBench, combatField, playerHand, enemyHand]);

    // --- 2. 英雄卡变形逻辑 (Champion Spell Transformation) ---
    // [修正] 实时变形逻辑
    // 1. 增加了 playerHand 依赖，确保抽到牌瞬间就能响应
    // 2. 增加了 isTransformed 标记，区分"原生法术"和"变形法术"
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
                    } as any;
                }

                // --- 情况 B: 法术 -> 英雄 ---
                // 条件：卡牌是关联法术 + 场上无该英雄 + 该卡是变形来的
                if (card.associatedChampionKey && !championKeysOnBoard.has(card.associatedChampionKey) && (card as any).isTransformed) {
                    const originalKey = (card as any).originalBaseKey || card.associatedChampionKey;

                    // 检查该英雄是否已升级
                    let championData = CARD_DB[originalKey];
                    if (leveledChampions.includes(originalKey)) {
                        championData = getLeveledUpCard(championData);
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

        // [新增] 全局死亡监测 (Death Check System)
    // 监听 playerBench 和 enemyBench，一旦发现有单位生命值归零，立即处理死亡逻辑
    // 这解决了"法术伤害无法杀死备战席单位"的问题
    useEffect(() => {
        const processDeaths = (
            bench: CardData[],
            setBench: React.Dispatch<React.SetStateAction<CardData[]>>,
            owner: 'player' | 'enemy'
        ) => {
            const deadUnits: CardData[] = [];
            const livingUnits: CardData[] = [];
            let hasDeath = false;

            bench.forEach(unit => {
                // 计算当前实际生命值
                const currentHealth = (unit.health) + (unit.buffs?.health || 0) - (unit.damageTaken || 0);

                if (currentHealth <= 0) {
                    deadUnits.push(unit);
                    hasDeath = true;
                } else {
                    livingUnits.push(unit);
                }
            });

            if (hasDeath) {
                // 1. 更新备战席，移除死者
                setBench(livingUnits);

                // 2. 广播死亡事件 (触发语音、亡语等)
                deadUnits.forEach(u => {
                    console.log(`[DeathCheck] ${owner === 'player' ? '玩家' : '敌方'} ${u.name} died in bench.`);
                    eventBus.emit(GameEvents.UNIT_DIE, { unit: u, owner });
                });
            }
        };

        // 分别检查双方备战席
        // 注意：战斗区(CombatField)的死亡由 resolveCombatAnimation 独立处理，这里只管备战席
        // 如果需要法术能击杀战斗区单位并在结算前移除，需要更复杂的逻辑，但通常备战席击杀是主要痛点
        if (playerBench.length > 0) processDeaths(playerBench, setPlayerBench, 'player');
        if (enemyBench.length > 0) processDeaths(enemyBench, setEnemyBench, 'enemy');

    }, [playerBench, enemyBench]); // 依赖于备战席变化

    // --- 3. 基础操作 ---

    const triggerShake = () => {
        setGame(prev => ({ ...prev, screenShake: true }));
        setTimeout(() => setGame(prev => ({ ...prev, screenShake: false })), 500);
    };

    // [重构] 序列化抽卡：利用 Ref 分离读写，彻底修复 StrictMode 下的双重调用 Bug
    const drawCards = async (count: number, owner: 'player' | 'enemy', delay: number = 0) => {
        if (delay > 0) await wait(delay);

        for (let i = 0; i < count; i++) {
            // 1. 从 Ref 中获取最新的牌库快照
            // 由于每次循环都有 wait(800)，React 渲染有足够时间更新 Ref，因此这里取到的是安全的最新值
            const currentDeck = owner === 'player' ? stateRef.current.playerDeck : stateRef.current.enemyDeck;

            // 牌库空处理
            if (currentDeck.length === 0) {
                if (owner === 'player') {
                    setMessage("牌库已空！");
                } else {
                    // 敌方无牌可抽时生成一张新兵 (无限资源兜底)
                    const token = createCard('soldier');
                    setEnemyHand(prev => [...prev, token]);
                }
                // 即使没抽到牌，也等待一下保持节奏，或者 continue
                if (i < count - 1) await wait(800);
                continue;
            }

            // 2. 取出顶端卡牌 (逻辑计算)
            const cardToDraw = currentDeck[0];
            const newDeck = currentDeck.slice(1);

            // 3. 分别更新牌库和手牌 (解耦更新)
            // 这样 setDeck 和 setHand 互不干扰，不会因为 StrictMode 执行两次而导致副作用叠加
            if (owner === 'player') {
                setPlayerDeck(newDeck);
                setPlayerHand(prev => [...prev, cardToDraw]);
            } else {
                setEnemyDeck(newDeck);
                setEnemyHand(prev => [...prev, cardToDraw]);
            }

            // [关键] 每张卡之间间隔 800ms，确保上一张飞出来后，下一张才动
            if (i < count - 1) await wait(2250);
        }
    };

const startRound = () => {
        heroActionHistory.current.clear();
        eventBus.emit(GameEvents.ROUND_START);

        // 1. 获取当前状态快照
        const currentGameState = stateRef.current.game;

        // 2. [同步计算] 核心数值 (Round, Mana, Token)
        // 直接计算出下一回合的基准状态，不依赖 setGame 的异步更新
        const nextRoundBase = calculateRoundStart(currentGameState);

        // 3. [同步计算] 备战席关键词 (再生、移除屏障)
        const removeBarrier = (cards: CardData[]) => cards.map(c => ({
            ...c,
            keywords: c.keywords.filter(k => k !== 'Barrier')
        }));

        const nextPlayerBench = applyRoundStartKeywords(removeBarrier(stateRef.current.playerBench));
        const nextEnemyBench = applyRoundStartKeywords(removeBarrier(stateRef.current.enemyBench));

        // 4. 构建这一刻的"临时游戏世界" (Context)
        // 这代表了"回合刚刚开始，所有数值已重置，但法术还没触发"的瞬间
        let tempGame = {
            ...currentGameState,
            ...nextRoundBase,
            spellCasting: null,
            spellStack: [],
            selectedBlockerId: null,
            nexusDamage: undefined,
            lastActionTimestamp: Date.now()
        };
        let tempPBench = [...nextPlayerBench];
        let tempEBench = [...nextEnemyBench];
        let hasEffectTriggered = false;

        // 5. 扫描并执行 ROUND_START 效果 (如里芙 L2)
        // 现在 context 里的 tempGame 已经是新回合的状态了(例如 token='enemy')
        // 所以里芙的效果逻辑 (if_enemy_has_token) 能正确判断出敌人有 token
        const scanAndApply = (units: CardData[], owner: 'player' | 'enemy') => {
            units.forEach(unit => {
                if (unit.effects) {
                    unit.effects.forEach(effId => {
                        const def = EFFECT_DB[effId];
                        if (def && def.timing === 'ROUND_START') {
                            const ctx: EffectContext = {
                                game: tempGame, // 传入最新的临时状态
                                playerBench: tempPBench,
                                enemyBench: tempEBench,
                                playerHand: stateRef.current.playerHand,
                                enemyHand: stateRef.current.enemyHand,
                                owner
                            };

                            const targets: any[] = [];
                            if (def.targetRequirements.some(r => r.type.includes('NEXUS'))) {
                                targets.push({ type: owner === 'player' ? 'player_nexus' : 'enemy_nexus' });
                            }

                            const res = processEffect(effId, targets, ctx);

                            // 累加状态变更
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

        // 执行扫描
        scanAndApply(tempPBench, 'player');
        scanAndApply(tempEBench, 'enemy');

        // 6. [统一提交] 将最终计算好的状态一次性写入 React State
        // 移除了所有的 setTimeout，消除了竞态条件
        setGame(tempGame);
        setPlayerBench(tempPBench);
        setEnemyBench(tempEBench);

        if (!hasEffectTriggered) {
            setMessage(`第 ${tempGame.round} 回合开始`);
        }
        // 发牌逻辑：从构筑的卡组中洗牌并抽取
        if (!initializedRef.current) {
            // [修正] 初始化时不抽卡，只准备牌库
            // 抽卡动作将由 useGameAnnouncer 在播报"第一回合"时触发
            setPlayerHand([]);
            setEnemyHand([]);

            // 1. 构建并洗混玩家卡组
            let pDeck: CardData[] = [];
            if (initialDeck.length > 0) {
                pDeck = initialDeck.map(key => createCard(key));
            } else {
                pDeck = [createCard('lyfe'), createCard('lyfe'), createCard('lyfe'), createCard('soldier'), createCard('soldier')];
            }
            pDeck = pDeck.sort(() => Math.random() - 0.5);

            // 2. 构建敌方卡组
            let eDeck = Array(40).fill(null).map(() => createCard(Math.random() > 0.5 ? 'fenny' : 'Dream_Guardians_Squad_Martina'));

            // [修改] 玩家开局发4张用于进入换牌阶段(Mulligan)
            const pHand = pDeck.splice(0, 4);

            // [修正] 敌方开局不发牌，等待玩家换牌结束进入 Round 1 后，再通过 drawCards 统一抽取
            // const eHand = eDeck.splice(0, 4); <--- 删除

            setTimeout(() => {
                setPlayerHand(pHand);
                setPlayerDeck(pDeck);
                setEnemyHand([]);     // [修正] 敌方手牌初始化为空
                setEnemyDeck(eDeck);
            }, 500);

            initializedRef.current = true;
        } else {
            // [修正] 回合开始时不再自动抽卡
            // 这一步也移交给 useGameAnnouncer 在播报"第X回合"时触发
            // drawCards(1, 'player', 500); <--- 删除
            // drawCards(1, 'enemy', 500);  <--- 删除
        }

        // 英雄被动检查 (如里芙)
        setTimeout(() => {
        // 获取最新的游戏状态快照 (此时 calculateRoundStart 和 applyRoundStartKeywords 已执行完毕)
        const currentGame = stateRefs.current.game;
        const currentPBench = stateRefs.current.playerBench;
        const currentEBench = stateRefs.current.enemyBench;

        // 构建临时状态链，用于在循环中累加多个效果产生的变更
        let tempGame = { ...currentGame };
        let tempPBench = [...currentPBench];
        let tempEBench = [...currentEBench];
        let hasEffectTriggered = false;

        // 定义扫描函数：遍历单位，查找并执行时机为 ROUND_START 的法术
        const scanAndApply = (units: CardData[], owner: 'player' | 'enemy') => {
            units.forEach(unit => {
                if (unit.effects) {
                    unit.effects.forEach(effId => {
                        const def = EFFECT_DB[effId];

                        // 1. 检查时机：必须是回合开始 (ROUND_START)
                        if (def && def.timing === 'ROUND_START') {

                            // 2. 构建执行上下文
                            const ctx: EffectContext = {
                                game: tempGame,
                                playerBench: tempPBench,
                                enemyBench: tempEBench,
                                playerHand: [], // 回合开始通常不涉及手牌操作
                                enemyHand: [],
                                owner
                            };

                            // 3. 自动构建隐式目标 (针对那些不需要手动选择的目标，如"我方水晶")
                            const targets: any[] = [];
                            if (def.targetRequirements.some(r => r.type.includes('NEXUS'))) {
                                targets.push({ type: owner === 'player' ? 'player_nexus' : 'enemy_nexus' });
                            }
                            // 如果有其他自动目标逻辑(如 SELF)，可在此扩展

                            // 4. 调用核心处理器
                            const res = processEffect(effId, targets, ctx);

                            // 5. 更新临时状态
                            tempGame = res.game;
                            tempPBench = res.playerBench;
                            tempEBench = res.enemyBench;
                            hasEffectTriggered = true;

                            // 6. 触发反馈 (如里芙发动的提示)
                            if (res.events.some(e => e.type === 'gain_token')) {
                                setMessage(`${unit.name} 发动：获得进攻机会！`);
                            }
                        }
                    });
                }
            });
        };

        // 分别扫描我方和敌方备战席
        scanAndApply(currentPBench, 'player');
        scanAndApply(currentEBench, 'enemy');

        // 如果有效果触发，统一更新 React 状态
        if (hasEffectTriggered) {
            setGame(tempGame);
            setPlayerBench(tempPBench);
            setEnemyBench(tempEBench);
        } else {
            setMessage(`第 ${currentGame.round} 回合开始`);
        }

    }, 100);
    };

    const resetGame = () => window.location.reload();

    // --- 4. 战斗系统 ---

    const initiateAttack = () => {
        if (game.phase !== 'main') return;
        if (game.spellStack.length > 0) return;
        setGame(prev => ({ ...prev, phase: 'attack_declare', turnOwner: 'player', consecutivePasses: 0, lastActionTimestamp: Date.now() }));
        setMessage("选择进攻单位");
    };

    const commitAttack = () => {
        if (combatField.length === 0) {
            setGame(prev => ({ ...prev, phase: 'main', lastActionTimestamp: Date.now() }));
            return;
        }

        // [修改] 移除了此处的 HERO_FIRST_ACTION 触发
        setGame(prev => ({ ...prev, phase: 'block_declare', turnOwner: 'enemy', consecutivePasses: 0, lastActionTimestamp: Date.now() }));
        setMessage("等待格挡...");
    };

    // [重构] 序列化战斗结算
    const resolveCombatAnimation = async () => {
        // 1. 锁定状态
        setGame(prev => ({ ...prev, phase: 'animating' }));

        // 获取战斗队列长度 (注意：循环中要始终读取 ref 中的最新 combatField)
        const totalFights = stateRef.current.combatField.length;

        // 2. 开始循环结算 (从左到右)
        for (let i = 0; i < totalFights; i++) {

            // --- A. 动画阶段 (冲锋) ---
            // 每次循环重新获取最新的 combatField
            let currentFight = stateRef.current.combatField[i];
            const { attacker, blocker } = currentFight;

            // 设置当前这一对为 'attacking'
            setCombatField(prev => {
                const n = [...prev];
                n[i] = {
                    ...n[i],
                    attacker: { ...n[i].attacker, animState: 'attacking' },
                    blocker: n[i].blocker ? { ...n[i].blocker, animState: 'attacking' } : null
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

            // --- B. 数值结算阶段 (Impact) ---
            // 使用最新的 game 状态计算（例如 Nexus 血量可能在前一次攻击中变了）
            const gameSnapshot = stateRef.current.game;
            const result = resolveSingleCombat(currentFight, gameSnapshot);

            // 1. 广播死亡事件
            result.killedUnits.forEach(unit => eventBus.emit(GameEvents.UNIT_DIE, unit));

            // 2. 更新全局 State
            // 更新战场卡牌状态
            setCombatField(prev => {
                const n = [...prev];
                n[i] = result.updatedFight;
                return n;
            });

            // 更新水晶血量
            if (result.nexusDamage) {
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

                // 1. 更新全局状态
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

                // 2. [关键] 广播升级：遍历牌库和手牌，将同名英雄全部升级
                // 辅助函数：升级列表中的特定英雄
                const upgradeList = (list: CardData[]) => {
                    return list.map(c => {
                        // 如果是该英雄且还没升级 (Level 1)
                        if (c.key === heroKey && c.level === 1) {
                            return { ...getLeveledUpCard(c), id: c.id }; // 保持 ID，升级数据
                        }
                        return c;
                    });
                };

                // 立即更新牌库和手牌
                setPlayerDeck(prev => upgradeList(prev));
                setPlayerHand(prev => upgradeList(prev));
                setPlayerBench(prev => upgradeList(prev)); // 备战席的其他同名卡也一起升级

                // [新增] 阻塞等待... (保持不变)
                await wait(200);
                while (stateRef.current.game.levelUpCard !== null) {
                    await wait(200);
                }
            }

            // --- C. 节奏停顿 ---
            await wait(600);

            // 清除伤害飘字，准备下一轮
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
            eventBus.emit(GameEvents.GAME_VICTORY, survivorsP);
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
                game, setGame, playerBench, setPlayerBench, enemyBench, setEnemyBench, playerHand, setPlayerHand, triggerShake, setMessage
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
        // --- 技能卡变身/抉择逻辑 ---
        // 修复：如果是玩家打出且需要抉择（Level 2），则暂停出牌，进入抉择模式
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
                const transformed = createCard(targetKey);
                card = { ...transformed, id: card.id };
            }
        }

        // [新增] 触发语音事件
        // 1. 播放登场语音 (PLAY_CARD_VOICE)
        if (card.type.includes('unit')) {
            eventBus.emit(GameEvents.PLAY_CARD_VOICE, card);
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
        setGame(prev => ({ ...prev, phase: 'animating', activeCard: card }));

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

        // [新增] 触发抉择语音
        // 需要传入英雄本体信息，这里假设 originalCard 关联了英雄
        // 我们通过 originalCard.associatedChampionKey 找到手牌或场上的英雄有点麻烦
        // 简化处理：传递一个包含 heroKey 的对象，让 useVoice 自己去匹配场上英雄
        // 或者更简单：我们假设英雄在场，直接发事件
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
        const transformed = createCard(targetKey);
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
        if (!initializedRef.current) startRound();
    }, []);

    // [新增] 开局换牌逻辑
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

        // 5. 更新状态
        // 为了保持手牌顺序（原位替换），我们需要把新卡插回原来的索引位置
        // 但简单起见，通常 TCG 换牌后顺序不重要，直接追加即可。
        // 如果要实现“飞回原位”的视觉效果，CardAnimations 组件会处理位置，
        // 数据层只需要保证 finalHand 的内容正确即可。
        // 这里我们采用“保留卡在前，新卡在后”的逻辑，或者按索引重组。

        // 采用按索引重组（保持手牌位置不变，符合视觉直觉）
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
            replaceOpeningHand, // [新增] 导出换牌函数
            requeueHandToDeck // [新增]
        }
    };
};