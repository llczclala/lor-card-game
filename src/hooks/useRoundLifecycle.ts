import { useEffect, useRef, useCallback } from 'react';
import type { MutableRefObject } from 'react';
import type { CardData, GameState, GameRecordCategory, RecordEntity } from '../types';
import { calculateRoundStart } from '../logic/core';
import { getCurrentHP } from '../logic/combat';
import { processEffect } from '../logic/effectProcessor';
import type { EffectContext } from '../logic/effectProcessor';
import { EFFECT_DB } from '../data/effectRegistry';
import { eventBus, GameEvents, StrikeEvents } from '../utils/eventBus'; // [新增] 引入通用打击总线
import { applyRoundStartKeywords, applyRoundEndKeywords, applyVolatileDiscard, executeTitanPulse, applyChannelOnRoundStart } from '../logic/keywords';
import { accumulateMauxirDamage, isSummonerOrSummon, upgradeAcaciaHand } from '../utils/gameRules'; // [新增] 引入猫汐尔经验收集器
import { gameLogger } from '../utils/gameLogger'; // [新增] 战术审计黑匣子
import { getRogueDefs, flashRogueBuff } from '../logic/rogueBattle'; // [2026-08-11] 迷宫强化战斗内分发

// ==========================================
// [时间管理器] 独立封装的纯函数，等待通用打击特效播完
// ==========================================
const waitForStrikeComplete = (timeoutMs: number = 5000): Promise<void> => {
    return new Promise((resolve) => {
        let resolved = false;
        const onEnd = () => {
            if (resolved) return;
            resolved = true;
            eventBus.off(StrikeEvents.COMPLETE, onEnd);
            resolve();
        };
        eventBus.on(StrikeEvents.COMPLETE, onEnd);
        // 安全超时兜底
        setTimeout(() => {
            if (!resolved) {
                resolved = true;
                eventBus.off(StrikeEvents.COMPLETE, onEnd);
                resolve();
            }
        }, timeoutMs);
    });
};

// ==========================================
// 依赖注入接口协议
// ==========================================
export interface UseRoundLifecycleParams {
    // 0. 教程模式先手偏移（用于校正进攻标识奇偶交替）
    firstAttacker?: 'player' | 'enemy';

    // 1. 核心状态快照引用 (避免闭包陷阱)
    stateRef: MutableRefObject<{
        game: GameState;
        combatField: any[];
        playerBench: CardData[];
        enemyBench: CardData[];
        playerHand: CardData[];
        enemyHand: CardData[];
        playerDeck: CardData[];
        enemyDeck: CardData[];
    }>;
    heroActionHistory: MutableRefObject<Set<string>>;
    enemyUnitsPlayedRef: MutableRefObject<number>;

    // 2. 响应式依赖项
    game: GameState;

    // 3. 状态更新器
    setGame: React.Dispatch<React.SetStateAction<GameState>>;
    setPlayerBench: React.Dispatch<React.SetStateAction<CardData[]>>;
    setEnemyBench: React.Dispatch<React.SetStateAction<CardData[]>>;
    setCombatField: React.Dispatch<React.SetStateAction<any[]>>;
    setPlayerHand: React.Dispatch<React.SetStateAction<CardData[]>>;
    setEnemyHand: React.Dispatch<React.SetStateAction<CardData[]>>;
    setPlayerDeck: React.Dispatch<React.SetStateAction<CardData[]>>;
    setEnemyDeckState: React.Dispatch<React.SetStateAction<CardData[]>>;
    setMessage: React.Dispatch<React.SetStateAction<string>>;

    // 4. 共享工具函数
    createFullCard: (key: string) => CardData;
    flushMicroQueue: () => boolean;
    judgeLifeAndDeath: () => void;  // [SBA] 生死簿同步判决
    wait: (ms: number) => Promise<void>;
    // [2026-07-23] 对局记录
    recordAction: (category: GameRecordCategory, owner: 'player' | 'enemy', summary: string, options?: { cardKey?: string; detail?: string; entities?: RecordEntity[] }) => void;
    captureSnapshot: (card: CardData) => { power: number; health: number; maxHealth: number; damageTaken: number; buffs?: { health?: number; power?: number }; roundBuffs?: { health?: number; power?: number } };
    // [2026-08-14 武装] 玩家是否挂载「秘法回响」武装（回合开始恢复全部法术法力）
    armamentManaRestore?: boolean;
}

// ==========================================
// 主 Hook
// ==========================================
export function useRoundLifecycle(params: UseRoundLifecycleParams) {
    const {
        stateRef, heroActionHistory, enemyUnitsPlayedRef, game,
        setGame, setPlayerBench, setEnemyBench, setCombatField,
        setPlayerHand, setPlayerDeck, setEnemyHand, setEnemyDeckState, // [核心修复] 补全被遗漏的敌方更新器解构
        setMessage, createFullCard, flushMicroQueue, judgeLifeAndDeath, wait,
        recordAction, captureSnapshot, // [2026-07-23 对局记录] 补全遗漏的解构
        firstAttacker = 'player', // [新增] 教程模式先手偏移
        armamentManaRestore, // [2026-08-14 武装] 秘法回响：回合开始恢复全部法术法力
    } = params;

    // ==========================================
    // [2026-07-10 诗人·科洛] 上回合出牌追踪（分双方记录）
    // ==========================================
    const keloPlayerLastTurnRef = useRef<string[]>([]);
    const keloPlayerCurrentTurnRef = useRef<string[]>([]);
    const keloEnemyLastTurnRef = useRef<string[]>([]);
    const keloEnemyCurrentTurnRef = useRef<string[]>([]);
    useEffect(() => {
        const handler = (payload: { cardKey: string; owner: 'player' | 'enemy' }) => {
            const { cardKey, owner } = payload;
            const targetRef = owner === 'player' ? keloPlayerCurrentTurnRef : keloEnemyCurrentTurnRef;
            if (targetRef.current.length < 10) {
                targetRef.current.push(cardKey);
                console.log(`[Kelo_Debug] 📥 KELO_TRACK_PLAY 已记录(${owner}): cardKey=${cardKey}, 累计=${targetRef.current.length}`);
            } else {
                console.warn(`[Kelo_Debug] ⚠ 追踪已达上限(10)，忽略(${owner}): cardKey=${cardKey}`);
            }
        };
        eventBus.on('KELO_TRACK_PLAY', handler);
        return () => { eventBus.off('KELO_TRACK_PLAY', handler); };
    }, []);

    // ==========================================
    // [新增] 全局监听弹道命中 (剥离扣血逻辑)
    // 只要空中的法球砸中目标，立刻从包裹中提取真实伤害并涂抹！
    // ==========================================
    useEffect(() => {
        const handleStrikeHit = (payload: { bullet: { targetId: string, damage: number, barrierPopped: boolean }, sourceId: string }) => {
            const { targetId, damage, barrierPopped } = payload.bullet;
            if (damage === 0 && !barrierPopped) return; // 无事发生，节约性能

            let nextPlayerBench = [...stateRef.current.playerBench];
            let nextEnemyBench = [...stateRef.current.enemyBench];
            let nextCombatField = [...stateRef.current.combatField];

            const applyDamage = (c: CardData) => {
                let nextCard = { ...c };
                if (barrierPopped) {
                    nextCard.depletedKeywords = [...(nextCard.depletedKeywords || []), 'Barrier'];
                }
                if (damage > 0) {
                    nextCard.damageTaken = (nextCard.damageTaken || 0) + damage;
                    nextCard.animState = 'hit' as const;
                }
                return nextCard;
            };

            let found = false;
            nextPlayerBench = nextPlayerBench.map(c => { if(c.id === targetId) { found=true; return applyDamage(c); } return c; });
            if(!found) nextEnemyBench = nextEnemyBench.map(c => { if(c.id === targetId) { found=true; return applyDamage(c); } return c; });
            if(!found) nextCombatField = nextCombatField.map(f => {
                let newF = { ...f };
                if (newF.attacker?.id === targetId) { newF.attacker = applyDamage(newF.attacker); found=true; }
                if (newF.blocker?.id === targetId) { newF.blocker = applyDamage(newF.blocker); found=true; }
                return newF;
            });
            // [新增] 如果都没找到，检查是否是水晶受击——直接扣水晶血量
            if (!found) {
                if (targetId === 'nexus_enemy') {
                    setGame(prev => ({ ...prev, enemyNexus: Math.max(0, prev.enemyNexus - damage) }));
                    eventBus.emit(GameEvents.NEXUS_STRIKED, { target: 'enemy', amount: damage });
                    found = true;
                } else if (targetId === 'nexus_player') {
                    setGame(prev => ({ ...prev, playerNexus: Math.max(0, prev.playerNexus - damage) }));
                    eventBus.emit(GameEvents.NEXUS_STRIKED, { target: 'player', amount: damage });
                    found = true;
                }
            }

            setPlayerBench(nextPlayerBench);
            setEnemyBench(nextEnemyBench);
            setCombatField(nextCombatField as any);

            if (damage > 0) {
                eventBus.emit('unit_damage', { id: targetId, amount: damage });

                // ==========================================
                // [新增] 埋点 A：猫汐尔经验收集 - 拦截并验证子弹的主人
                // ==========================================
                // 1. 在己方阵营中寻找开火者 (备战席或交战区)
                let sourceCard = stateRef.current.playerBench.find(c => c.id === payload.sourceId);
                if (!sourceCard) {
                    stateRef.current.combatField.forEach(f => {
                        if (f.owner === 'player' && f.attacker?.id === payload.sourceId) sourceCard = f.attacker;
                        if (f.owner === 'enemy' && f.blocker?.id === payload.sourceId) sourceCard = f.blocker;
                    });
                }

                // 2. 如果开火者确系我方编制，且拥有纯正的召唤系血统，则将这笔真实伤害打入猫汐尔账户！
                if (sourceCard && isSummonerOrSummon(sourceCard)) {
                    accumulateMauxirDamage(nextPlayerBench, nextCombatField, damage, setPlayerBench, stateRef.current.playerHand, setPlayerHand, stateRef.current.playerDeck, setPlayerDeck);
                }
            }
        };

        eventBus.on(StrikeEvents.HIT, handleStrikeHit);
        return () => { eventBus.off(StrikeEvents.HIT, handleStrikeHit); };
    }, [setPlayerBench, setEnemyBench, setCombatField, stateRef]);

    // ==========================================
    // [新增] 监听猫汐尔大招——顷刻莲潮
    // 在法术打出时触发全基座一轮双倍伤害打击
    // ==========================================
    useEffect(() => {
        const handleMauxirUltimate = (payload: { owner: 'player' | 'enemy' }) => {
            const { owner } = payload;
            const { playerBench, combatField, enemyBench } = stateRef.current;

            // 1. 收集己方所有存活基座
            const pedestals: CardData[] = [];
            const myBench = owner === 'player' ? playerBench : enemyBench;
            myBench.forEach(c => {
                if (c.key === 'mauxir_lotus_pedestal' && !c.isDead && c.animState !== 'dying' && c.animState !== 'ephemeral_dying') {
                    pedestals.push(c);
                }
            });
            combatField.forEach(f => {
                const u = f.owner === owner ? f.attacker : f.blocker;
                if (u?.key === 'mauxir_lotus_pedestal' && !u.isDead && u.animState !== 'dying' && u.animState !== 'ephemeral_dying') {
                    pedestals.push(u);
                }
            });

            if (pedestals.length === 0) return;

            // 2. 战区扫描：检测是否有 Lv2 猫汐尔光环（解锁基座打水晶权限）
            const myUnits: CardData[] = [];
            (owner === 'player' ? playerBench : enemyBench).forEach(c => {
                if (!c.isDead && c.animState !== 'dying' && c.animState !== 'ephemeral_dying') myUnits.push(c);
            });
            combatField.forEach(f => {
                const u = f.owner === owner ? f.attacker : f.blocker;
                if (u && !u.isDead && u.animState !== 'dying' && u.animState !== 'ephemeral_dying') myUnits.push(u);
            });
            const hasLv2Mauxir = myUnits.some(u => u.key === 'mauxir_lotus_drive' && u.level === 2);

            			// 3. [2026-06-27 共享沙盘] 建立敌方沙盘，每发子弹后刷新
			let simEnemyBench = owner === 'player' ? [...enemyBench] : [...playerBench];
			let simPlayerBench = owner === 'player' ? [...playerBench] : [...enemyBench]; // [2026-08-06 莉莉子] 补漏：对称沙盘声明（原漏，owner==='enemy' 时会 ReferenceError）
			let simCombatField = [...combatField];

			// [新增] Lv2 光环：将敌方水晶也纳入随机奖池
			const canTargetNexus = hasLv2Mauxir;

			// 4. 每个基座独立生成子弹并发射（保证飞弹原点 + 飞弹样式正确）
			const linePayload: { sourceId: string; targets: { id: string; type: string }[] }[] = [];

			for (const p of pedestals) {
				const power = (p.power || 0) + (p.buffs?.power || 0) + ((p.roundBuffs?.power || 0) < 0 ? (p.roundBuffs?.power || 0) : 0);
				const bullets: { targetId: string; damage: number; barrierPopped: boolean }[] = [];
				const lineTargets: { id: string; type: string }[] = [];

				for (let i = 0; i < power; i++) {
					// 每次射击前从共享沙盘重建有效目标列表（前面打死的不会出现）
					const validTargets: any[] = [];
					const enemySideSim = owner === 'player' ? simEnemyBench : simPlayerBench;
					enemySideSim.forEach(c => {
						if (!c.isDead && c.animState !== 'dying' && c.animState !== 'ephemeral_dying' && getCurrentHP(c) > 0) validTargets.push(c);
					});
					simCombatField.forEach(f => {
						const enemyU = owner === 'player' ? (f.owner === 'enemy' ? f.attacker : f.blocker) : (f.owner === 'player' ? f.attacker : f.blocker);
						if (enemyU && !enemyU.isDead && enemyU.animState !== 'dying' && enemyU.animState !== 'ephemeral_dying' && getCurrentHP(enemyU) > 0) {
							validTargets.push(enemyU);
						}
					});

					// Lv2 光环：水晶纳入奖池
					if (canTargetNexus) {
						validTargets.push({ isNexus: true, id: owner === 'player' ? 'nexus_enemy' : 'nexus_player' });
					}

					if (validTargets.length === 0) break;

					const t = validTargets[Math.floor(Math.random() * validTargets.length)];

					// 结算分流：水晶
					if (t.isNexus) {
						bullets.push({ targetId: t.id, damage: 2, barrierPopped: false });
						lineTargets.push({ id: t.id, type: 'enemy_nexus' });
						continue;
					}

					// 常规实体单位计算
					let actualDmg = 2;
					let barrierPopped = false;
					if (t.keywords?.includes('Tough')) actualDmg = Math.max(0, actualDmg - 1);
					const hasActiveBarrier = t.keywords?.includes('Barrier') && !(t.depletedKeywords || []).includes('Barrier');
					if (hasActiveBarrier && actualDmg > 0) {
						barrierPopped = true;
						actualDmg = 0;
					}
					bullets.push({ targetId: t.id, damage: actualDmg, barrierPopped });
					lineTargets.push({ id: t.id, type: 'enemy' });

					// 模拟伤害写入共享沙盘，后续射击能看到
					const applySimDmg = (c: any) => {
						let nc = { ...c };
						if (barrierPopped) nc.depletedKeywords = [...(nc.depletedKeywords || []), 'Barrier'];
						if (actualDmg > 0) nc.damageTaken = (nc.damageTaken || 0) + actualDmg;
						return nc;
					};
					simEnemyBench = simEnemyBench.map(c => c.id === t.id ? applySimDmg(c) : c);
					simPlayerBench = simPlayerBench.map(c => c.id === t.id ? applySimDmg(c) : c);
					simCombatField = simCombatField.map(f => {
						let newF = { ...f };
						if (newF.attacker?.id === t.id) newF.attacker = applySimDmg(newF.attacker);
						if (newF.blocker?.id === t.id) newF.blocker = applySimDmg(newF.blocker);
						return newF;
					});
				}

				if (bullets.length === 0) continue;

				// [核心修复] 每个基座独立发射——使用基座自己的 ID 和 spellKey
				eventBus.emit(StrikeEvents.COMMAND, {
					sourceId: p.id,
					bullets,
					interval: 80,
					spellKey: 'mauxir_lotus_pedestal'
				});
				linePayload.push({ sourceId: p.id, targets: lineTargets });
			}// 4. 显示目标线（每个基座到各自目标）
            if (linePayload.length > 0) {
                eventBus.emit('SHOW_TEMP_LINES', linePayload);
                setTimeout(() => eventBus.emit('HIDE_TEMP_LINES'), 500);
            }
        };

        eventBus.on('MAUXIR_ULTIMATE', handleMauxirUltimate);
        return () => { eventBus.off('MAUXIR_ULTIMATE', handleMauxirUltimate); };
    }, [setPlayerBench, setEnemyBench, setCombatField, stateRef]);

    // ---------------------------------------------------------
    // 块 A: 回合开始全局扫描器 (含库效雷达)
    // ---------------------------------------------------------
    useEffect(() => {
        // 只有当回合数变化时才检查
        if (game.round > 0) {
            const timer = setTimeout(() => {
                const currentGame = stateRef.current.game;
                const currentPBench = stateRef.current.playerBench;
                const currentEBench = stateRef.current.enemyBench;

                let tempGame = { ...currentGame };
                let tempPBench = [...currentPBench];
                let tempEBench = [...currentEBench];
                let tempPHand = [...stateRef.current.playerHand];
                let tempEHand = [...stateRef.current.enemyHand];
                let hasEffectTriggered = false;
                let nexusDamageIndex = 0; // [2026-07-17 阿尔戈] 伤害飘字错开计数器，避免多个乐手同时触发时飘字碰撞

                // [库效雷达]
                const scanDeckAuras = (owner: 'player' | 'enemy') => {
                    const currentDeck = owner === 'player' ? stateRef.current.playerDeck : stateRef.current.enemyDeck;
                    const currentHand = owner === 'player' ? tempPHand : tempEHand;
                    const currentBench = owner === 'player' ? tempPBench : tempEBench;
                    const currentField = stateRef.current.combatField;

                    // 1. 汇总该阵营所有存活的卡牌实体
                    const allAliveCards: CardData[] = [
                        ...currentDeck,
                        ...currentHand,
                        ...currentBench.filter(c => !c.isDead && c.animState !== 'dying' && c.animState !== 'ephemeral_dying')
                    ];
                    currentField.forEach(f => {
                        const myCombatant = f.owner === owner ? f.attacker : f.blocker;
                        if (myCombatant && !myCombatant.isDead && myCombatant.animState !== 'dying' && myCombatant.animState !== 'ephemeral_dying') {
                            allAliveCards.push(myCombatant);
                        }
                    });

                    // 2. 嗅探带有 deckAuraSummon 基因的卡牌
                    const auraSummons = new Set<string>();
                    allAliveCards.forEach(card => {
                        if (card.effects) {
                            card.effects.forEach(effId => {
                                const def = EFFECT_DB[effId];
                                if (def && def.params?.deckAuraSummon) {
                                    auraSummons.add(def.params.deckAuraSummon);
                                }
                            });
                        }
                    });

                    // 3. 查漏补缺：如果场上和手牌中没有指定的召唤物，按槽位分配
                    auraSummons.forEach(summonKey => {
                        const hasSummon = currentBench.some(c => c.key === summonKey) ||
                            currentHand.some(c => c.key === summonKey) ||
                            currentField.some(f => {
                                const u = f.owner === owner ? f.attacker : f.blocker;
                                return u && u.key === summonKey;
                            });

                        if (!hasSummon) {
                            const newCard = createFullCard(summonKey);
                            const cardWithAbility = newCard.ability
                                ? { ...newCard, abilityState: 'breathing' as const, abilityCharges: newCard.ability.maxCharges }
                                : newCard;

                            // [2026-07-18] 按槽位分配：备战席 → 手牌(安全气囊) → 碎掉
                            if (currentBench.length < 6) {
                                currentBench.push(cardWithAbility);
                                hasEffectTriggered = true;
                                eventBus.emit(GameEvents.SFX_DROP_BENCH);
                                if (summonKey === 'mauxir_lotus_pedestal') {
                                    eventBus.emit(GameEvents.SFX_MAUXIR_SUMMON);
                                }
                            } else if (currentHand.length < 10) {
                                currentHand.push(cardWithAbility);
                                hasEffectTriggered = true;
                                eventBus.emit(GameEvents.SFX_DROP_BENCH);
                                console.log(`[库效] 备战席已满，${cardWithAbility.name} 退入手牌。`);
                            } else {
                                console.log(`[库效] 备战席和手牌均已满，${cardWithAbility.name} 被摧毁。`);
                            }
                        }
                    });
                };

                const scanAndApply = (units: CardData[], owner: 'player' | 'enemy') => {
                    units.forEach(unit => {
                        if (unit.effects) {
                            unit.effects.forEach(effId => {
                                const def = EFFECT_DB[effId];
                                if (def && def.timing.includes('ROUND_START')) {
                                    // [Kelo_Debug] 扫描到 ROUND_START 效果
                                    if (effId === 'effect_poet_kelo_recycle') {
                                        console.log(`[Kelo_Debug] 🔍 scanAndApply 发现科洛效果: unit=${unit.key}, owner=${owner}, 位置=${unit.isDead ? '已死亡' : '存活'}`);
                                    }
                                    const ctx: EffectContext = {
                                        game: tempGame,
                                        playerBench: tempPBench,
                                        enemyBench: tempEBench,
                                        playerHand: tempPHand,
                                        enemyHand: tempEHand,
                                        owner,
                                        sourceCard: unit
                                    };

                                    const targets: any[] = [];
                                    if (def.targetRequirements.some(r => r.type.includes('NEXUS'))) {
                                        targets.push({ type: owner === 'player' ? 'player_nexus' : 'enemy_nexus' });
                                    }
                                    // [2026-07-17 阿尔戈重做] 自动打敌方水晶（乐手回合开始能力）
                                    if (def.params?.targetEnemyNexus) {
                                        targets.push({ type: owner === 'player' ? 'enemy_nexus' : 'player_nexus' });
                                    }

                                    const res = processEffect(effId, targets, ctx);
                                    tempGame = res.game;
                                    tempPBench = res.playerBench;
                                    tempEBench = res.enemyBench;
                                    if (res.playerHand) tempPHand = res.playerHand;
                                    if (res.enemyHand) tempEHand = res.enemyHand;
                                    hasEffectTriggered = true;

                                    // [2026-07-17 阿尔戈重做] 将 processEffect 返回的事件发射到 eventBus
                                    // 使用延时错开多个伤害飘字，避免碰撞重叠
                                    res.events.forEach(event => {
                                        if (event.type === 'nexus_damage') {
                                            const targetId = event.payload.target === 'enemy' ? 'nexus_enemy' : 'nexus_player';
                                            const delay = nexusDamageIndex * 250;
                                            setTimeout(() => {
                                                eventBus.emit('unit_damage', { id: targetId, amount: event.payload.amount });
                                                eventBus.emit(GameEvents.NEXUS_STRIKED, event.payload);
                                            }, delay);
                                            nexusDamageIndex++;
                                        }
                                    });

                                    if (res.events.some(e => e.type === 'gain_token')) {
                                        setMessage(`${unit.name} 发动：获得进攻机会！`);
                                    }

                                    // [2026-07-10 诗人·科洛] 回合开始回收上回合卡牌（双方均适配）
                                    if (effId === 'effect_poet_kelo_recycle') {
                                        const lastCards = owner === 'player' ? keloPlayerLastTurnRef.current : keloEnemyLastTurnRef.current;
                                        console.log(`[Kelo_Debug] 回收触发，单位=${unit.name}(${unit.key})，owner=${owner}，上回合出牌:`, JSON.stringify(lastCards));
                                        if (lastCards.length > 0) {
                                            const maxCopy = Math.min(3, lastCards.length);
                                            const handRef = owner === 'player' ? stateRef.current.playerHand : stateRef.current.enemyHand;
                                            const setHand = owner === 'player' ? setPlayerHand : setEnemyHand;
                                            let currentHand = [...handRef];
                                            console.log(`[Kelo_Debug] 开始回收(${owner})，maxCopy=${maxCopy}，当前手牌数=${currentHand.length}`);
                                            for (let i = 0; i < maxCopy; i++) {
                                                const cardKey = lastCards[i];
                                                const newCard = createFullCard(cardKey);
                                                if (!newCard) {
                                                    console.warn(`[Kelo_Debug] 无法创建卡牌: cardKey=${cardKey}`);
                                                    continue;
                                                }
                                                // 赋予瞬逝(Volatile)关键词 — 回合结束时未打出则自动弃置
                                                newCard.keywords = Array.from(new Set([...(newCard.keywords || []), 'Volatile']));
                                                if (currentHand.length < 10) {
                                                    currentHand.push(newCard);
                                                    res.events.push({ type: 'sfx_generate', payload: newCard });
                                                    console.log(`[Kelo_Debug] ✓ 回收了 ${cardKey}(${newCard.name}) 到${owner}手中，手牌数=${currentHand.length}`);
                                                } else {
                                                    console.warn(`[Kelo_Debug] 手牌已满，无法回收 ${cardKey}`);
                                                }
                                            }
                                            setHand(currentHand);
                                            if (owner === 'player') stateRef.current.playerHand = currentHand;
                                            else stateRef.current.enemyHand = currentHand;
                                            hasEffectTriggered = true;
                                            setMessage(`${unit.name} 发动：收藏癖——回收上回合卡牌！`);
                                        } else {
                                            console.log(`[Kelo_Debug] ⚠ 上回合无出牌记录(keloLastTurnRef为空)，跳过回收`);
                                        }
                                    }
                                }
                            });
                        }
                    });
                };

                scanDeckAuras('player');
                scanDeckAuras('enemy');

                scanAndApply(tempPBench, 'player');
                scanAndApply(tempEBench, 'enemy');

                // [安卡希雅] 块 B: 获得进攻标识时触发 (ON_GET_ATTACK_TOKEN)
                // 扫描当前回合持有进攻标识的阵营的单位
                const attackTokenOwner = tempGame.attackToken.player ? 'player' : tempGame.attackToken.enemy ? 'enemy' : null;
                if (attackTokenOwner) {
                    const ownerBench = attackTokenOwner === 'player' ? tempPBench : tempEBench;
                    ownerBench.forEach(unit => {
                        if (unit.effects) {
                            unit.effects.forEach(effId => {
                                const def = EFFECT_DB[effId];
                                if (def && def.timing === 'ON_GET_ATTACK_TOKEN') {
                                    const ctx: EffectContext = {
                                        game: tempGame,
                                        playerBench: tempPBench,
                                        enemyBench: tempEBench,
                                        playerHand: tempPHand,
                                        enemyHand: tempEHand,
                                        playerDeck: stateRef.current.playerDeck,
                                        enemyDeck: stateRef.current.enemyDeck,
                                        combatField: stateRef.current.combatField,
                                        owner: attackTokenOwner,
                                        sourceCard: unit
                                    };
                                    const res = processEffect(effId, [], ctx);
                                    tempGame = res.game;
                                    tempPBench = res.playerBench;
                                    tempEBench = res.enemyBench;
                                    if (res.playerHand) tempPHand = res.playerHand;
                                    if (res.enemyHand) tempEHand = res.enemyHand;
                                    hasEffectTriggered = true;
                                }
                            });
                        }
                    });
                }

                if (hasEffectTriggered) {
                    setGame(tempGame);
                    setPlayerBench(tempPBench);
                    setEnemyBench(tempEBench);
                    setPlayerHand(tempPHand);
                    setEnemyHand(tempEHand);
                } else {
                    setMessage(`第 ${currentGame.round} 回合开始`);
                }
            }, 100);

            return () => clearTimeout(timer);
        }
    }, [game.round]); // 严格且安全地只监听 game.round 变化


    // ---------------------------------------------------------
    // 块 C: 新回合状态刷新序列
    // ---------------------------------------------------------
    // [2026-08-15 莉莉子] 迷宫强化 round_start：回合开始被动（暗箭难防生成 / 战意盎然备战）
    // 抽成独立函数，供 startRound（每回合）与换牌后第一回合触发（triggerFirstRoundRogueEnhance）共用
    const runRoundStartRogueEnhancements = useCallback((queryGame: GameState, targetGame: GameState): GameState => {
        let g = targetGame;
        getRogueDefs(queryGame.rogueEnhancements, 'round_start').forEach(def => {
            const be = def.battleEffect!;
            if (be.effectClass === 'GENERATE') {
                const genKey = be.params?.generateKey as string | undefined;
                if (genKey) {
                    const genCard = createFullCard(genKey);
                    if (be.params?.isVolatile) genCard.keywords = [...(genCard.keywords || []), 'Volatile' as any];
                    setPlayerHand(prev => prev.length < 10 ? [...prev, genCard] : prev);
                    eventBus.emit('sfx_generate', genCard);
                }
            } else if (be.effectClass === 'RALLY') {
                g = { ...g, attackToken: { ...g.attackToken, player: 'rally' } };
                eventBus.emit('gain_token_rally', { owner: 'player' });
            }
            flashRogueBuff(def);
        });
        return g;
    }, [setPlayerHand]);

    // [2026-08-15 莉莉子] 换牌结束后第一回合开始：触发 round_start 强化（暗箭等）
    // 参考安卡库效 triggerGameStartGenerate 在换牌后执行的修复——开局 startRound 会跳过强化，由本函数在换牌后补触发
    const triggerFirstRoundRogueEnhance = useCallback(() => {
        const current = stateRef.current.game;
        const next = runRoundStartRogueEnhancements(current, current);
        if (next !== current) setGame(next);
    }, [runRoundStartRogueEnhancements, setGame]);

    const startRound = (skipRoundStartEnhance = false) => {
        heroActionHistory.current.clear();
        enemyUnitsPlayedRef.current = 0;
        // [2026-07-10 诗人·科洛] 保存上回合出牌记录（分双方）
        keloPlayerLastTurnRef.current = [...keloPlayerCurrentTurnRef.current];
        keloPlayerCurrentTurnRef.current = [];
        keloEnemyLastTurnRef.current = [...keloEnemyCurrentTurnRef.current];
        keloEnemyCurrentTurnRef.current = [];
        console.log(`[Kelo_Debug] 🔄 startRound: 玩家上回合出牌=${keloPlayerLastTurnRef.current.length}张, 敌方=${keloEnemyLastTurnRef.current.length}张`);
        eventBus.emit(GameEvents.ROUND_START);

        const currentGameState = stateRef.current.game;
        const nextRoundBase = calculateRoundStart(currentGameState);

        // [2026-07-31 安卡希雅] 若安卡已升级，每回合开始同步手牌+牌库法术（残留剑舞→重锋、安卡副本→Lv2）
        if (currentGameState.leveledChampions?.includes('acacia_chrono_echo')) {
            setPlayerHand(prev => upgradeAcaciaHand(prev));
            setPlayerDeck(prev => upgradeAcaciaHand(prev)); // 牌库副本同步升级，抽到即 Lv2
        }

        // [2026-08-06 莉莉子 法术19] 新回合飞剑计数清零 → 恢复手牌中"法术19"被减过的费用（原价5）
        const restoreSpell19Cost = (hand: CardData[]): CardData[] => hand.map(c => {
            if (c.key === 'temp_spell_19' && ((c.customProgress || 0) & 2)) {
                return {
                    ...c,
                    cost: 5, // 恢复到卡牌原始费用
                    customProgress: (c.customProgress || 0) & ~2, // 清除绿色减费标记
                };
            }
            return c;
        });
        setPlayerHand(prev => restoreSpell19Cost(prev));
        setEnemyHand(prev => restoreSpell19Cost(prev));

        // 清理屏障及其黯淡标记、数值账本、词条账本、打击次数账本
        const clearRoundBuffsAndBarrier = (cards: CardData[]) => cards.map(c => {
            const nextCard = { ...c };

            if (nextCard.keywords.includes('Barrier')) {
                nextCard.keywords = nextCard.keywords.filter(k => k !== 'Barrier');
                if (nextCard.depletedKeywords?.includes('Barrier')) {
                    nextCard.depletedKeywords = nextCard.depletedKeywords.filter(k => k !== 'Barrier');
                }
            }

            if (nextCard.roundBuffs) {
                nextCard.roundBuffs = { power: 0, health: 0 };
            }

            if (nextCard.roundKeywords && nextCard.roundKeywords.length > 0) {
                nextCard.keywords = nextCard.keywords.filter(k => !nextCard.roundKeywords!.includes(k));
                nextCard.roundKeywords = [];
            }

            nextCard.roundStrikes = 0;
            return nextCard;
        });

        const alivePlayerBench = stateRef.current.playerBench.filter(c => !c.isDead && c.animState !== 'dying' && c.animState !== 'ephemeral_dying');
        const aliveEnemyBench = stateRef.current.enemyBench.filter(c => !c.isDead && c.animState !== 'dying' && c.animState !== 'ephemeral_dying');

        const nextPlayerBench = applyRoundStartKeywords(clearRoundBuffsAndBarrier(alivePlayerBench));
        const nextEnemyBench = applyRoundStartKeywords(clearRoundBuffsAndBarrier(aliveEnemyBench));

        // [Channel 充能] 回合开始时，场上未黯淡的充能单位触发
        const channelPlayerResult = applyChannelOnRoundStart(nextPlayerBench);
        const channelEnemyResult = applyChannelOnRoundStart(nextEnemyBench);
        const channelManaPlayer = channelPlayerResult.count;
        const channelManaEnemy = channelEnemyResult.count;

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

        const finalPlayerBench = flashRoundAbility(channelPlayerResult.cards);
        const finalEnemyBench = flashRoundAbility(channelEnemyResult.cards);

        let tempGame = {
            ...currentGameState,
            ...nextRoundBase,
            playerSpellMana: armamentManaRestore ? 3 : Math.min(3, (nextRoundBase.playerSpellMana || 0) + channelManaPlayer), // [2026-08-14 武装] 秘法回响：回合开始恢复全部法术法力
            enemySpellMana: Math.min(3, (nextRoundBase.enemySpellMana || 0) + channelManaEnemy),
            playerRoundFlyingSwords: 0, // [2026-07-31] 新回合清零本回合飞剑计数
            enemyRoundFlyingSwords: 0,
            spellCasting: null,
            pendingSpell: null,
            spellStack: [],
            selectedBlockerId: null,
            nexusDamage: undefined,
            lastActionTimestamp: Date.now()
        };

        // [教程模式] 如果敌方先攻，进攻标识奇偶交替偏移一位
        if (firstAttacker === 'enemy') {
            tempGame = {
                ...tempGame,
                attackToken: { player: tempGame.attackToken.enemy, enemy: tempGame.attackToken.player },
                turnOwner: tempGame.turnOwner === 'player' ? 'enemy' : 'player',
            };
        }
        // [2026-07-29 安卡希雅] 回合开始重置飞剑回合标记
        tempGame.playerRoundSwordUsed = false;
        tempGame.enemyRoundSwordUsed = false;

        // [2026-08-11 莉莉子] 迷宫强化 round_start：回合开始被动（暗箭难防生成 / 战意盎然备战）
        // [2026-08-15 莉莉子] 开局（换牌前）跳过：第一回合强化由 triggerFirstRoundRogueEnhance 在换牌后触发（参考安卡库效修复）
        if (!skipRoundStartEnhance) {
            tempGame = runRoundStartRogueEnhancements(currentGameState, tempGame);
        }
        // [2026-08-11 莉莉子] 重置暗影双生「每回合首次」标志
        tempGame = { ...tempGame, rogueFirstSummonDone: false };

        setGame(tempGame as GameState);
        setPlayerBench(finalPlayerBench);
        setEnemyBench(finalEnemyBench);
    };

    // ---------------------------------------------------------
    // 块 B: 回合末综合清算序列 (幻象/鞭策/基座扫射/脉冲)
    // ---------------------------------------------------------
    const executeRoundEndSequence = async () => {
        console.log('[LILITH-DEBUG] 🎬 executeRoundEndSequence 入口被调用');
        // [2026-08-04 莉莉子] 收集待播瞬逝弃置动画的卡 id，供 startRound 前等待动画播完
        const volatilePending = new Set<string>();
        // [SBA] 回合结束效果前先清尸
        judgeLifeAndDeath();
        setGame(prev => ({ ...prev, phase: 'animating' }));
        setMessage("回合结束结算...");

        // --- 0. Volatile（瞬逝）手牌弃置 — 优先于其他回合末效果执行 ---
        const playerVolatileResult = applyVolatileDiscard(stateRef.current.playerHand);
        const enemyVolatileResult = applyVolatileDiscard(stateRef.current.enemyHand);
        console.log('[LILITH-DEBUG] roundEnd volatile:', playerVolatileResult.discarded.map(c => c.name), 'hand size:', stateRef.current.playerHand.length);
        if (playerVolatileResult.discarded.length > 0) {
            playerVolatileResult.discarded.forEach(card => {
                volatilePending.add(card.id);
                eventBus.emit(GameEvents.HAND_VOLATILE_DISCARD, { card, owner: 'player' });
            });
            // [2026-07-22 莉莉子] 不再立即移除 — 让手牌中的卡片在原位播消散动画
            // 动画完成后由 onHandAnimComplete 回调逐张移除
        }
        if (enemyVolatileResult.discarded.length > 0) {
            enemyVolatileResult.discarded.forEach(card => {
                volatilePending.add(card.id);
                eventBus.emit(GameEvents.HAND_VOLATILE_DISCARD, { card, owner: 'enemy' });
            });
            // [2026-07-22 莉莉子] 同上，敌方手牌卡背原位播动画
        }
        // [2026-07-23 对局记录] 瞬逝弃置
        [...playerVolatileResult.discarded.map(c => ({ card: c, owner: 'player' as const })),
         ...enemyVolatileResult.discarded.map(c => ({ card: c, owner: 'enemy' as const }))].forEach(({ card, owner }) => {
            recordAction('volatile_discard', owner, `瞬逝弃置 ${card.name}`, {
                cardKey: card.key,
                entities: [{ cardKey: card.key, owner, snapshot: captureSnapshot(card) }]
            });
        });

        let nextPlayerBench = applyRoundEndKeywords(stateRef.current.playerBench);
        let nextEnemyBench = applyRoundEndKeywords(stateRef.current.enemyBench);
        let nextCombatField = stateRef.current.combatField.map(f => ({ ...f }));

        // --- 1. 回合末鞭策与强化 ---
        // [核心重构] 升级为异步函数，彻底拆解“伤害”与“强化”的原子操作！
        const processRoundEndWhips = async (owner: 'player' | 'enemy') => {
            const myBench = owner === 'player' ? nextPlayerBench : nextEnemyBench;
            const myField = nextCombatField;

            const myUnits = [
                ...myBench.filter(c => !c.isDead && c.animState !== 'dying' && c.animState !== 'ephemeral_dying'),
                ...myField.map(f => f.owner === owner ? f.attacker : f.blocker).filter(Boolean) as CardData[]
            ].filter(c => !c.isDead && c.animState !== 'dying' && c.animState !== 'ephemeral_dying');

            for (const unit of myUnits) {
                if (!unit.effects) continue;
                for (const effId of unit.effects) {
                    const def = EFFECT_DB[effId];
                    if (def && def.params?.roundEndSelfDamageBuff) {
                        const { targetKey, damage, power, health, hitAll } = def.params.roundEndSelfDamageBuff;

                        // 每次鞭策前，重新从最新快照中搜寻合格靶子
                        const currentBench = owner === 'player' ? nextPlayerBench : nextEnemyBench;
                        const validTargets: CardData[] = [];
                        currentBench.forEach(c => {
                            if (c.key === targetKey && !c.isDead && c.animState !== 'dying' && c.animState !== 'ephemeral_dying' && getCurrentHP(c) > 0) validTargets.push(c);
                        });
                        nextCombatField.forEach(f => {
                            const u = f.owner === owner ? f.attacker : f.blocker;
                            if (u && u.key === targetKey && !u.isDead && u.animState !== 'dying' && u.animState !== 'ephemeral_dying' && getCurrentHP(u as CardData) > 0) validTargets.push(u as CardData);
                        });

                        // [重构] 对单个目标的鞭策处理逻辑——抽出来给 Lv1（随机一个）和 Lv2（所有）共用
                        const whipSingleTarget = async (target: CardData) => {
                            const targetId = target.id;

                            // 阶段一：真实伤害检定
                            let actualDmg = damage;
                            let barrierPopped = false;
                            if (target.keywords.includes('Tough')) actualDmg = Math.max(0, actualDmg - 1);
                            const hasActiveBarrier = target.keywords.includes('Barrier') && !(target.depletedKeywords || []).includes('Barrier');
                            if (hasActiveBarrier && actualDmg > 0) {
                                barrierPopped = true;
                                actualDmg = 0;
                            }

                            // 第一段涂抹：只扣血，不加Buff！
                            const applyDamageOnly = (c: CardData) => {
                                let nc = { ...c };
                                if (barrierPopped) nc.depletedKeywords = [...(nc.depletedKeywords || []), 'Barrier'];
                                if (actualDmg > 0) {
                                    nc.damageTaken = (nc.damageTaken || 0) + actualDmg;
                                    nc.animState = 'hit' as const;
                                }
                                return nc;
                            };

                            if (owner === 'player') nextPlayerBench = nextPlayerBench.map(c => c.id === targetId ? applyDamageOnly(c) : c);
                            else nextEnemyBench = nextEnemyBench.map(c => c.id === targetId ? applyDamageOnly(c) : c);

                            nextCombatField = nextCombatField.map(f => {
                                let newF = { ...f };
                                if (newF.attacker?.id === targetId) newF.attacker = applyDamageOnly(newF.attacker);
                                if (newF.blocker?.id === targetId) newF.blocker = applyDamageOnly(newF.blocker);
                                return newF;
                            });

                            // 下发视图层并触发受击事件
                            setPlayerBench(nextPlayerBench);
                            setEnemyBench(nextEnemyBench);
                            setCombatField(nextCombatField as any);

                            if (actualDmg > 0) {
                                eventBus.emit('unit_damage', { id: targetId, amount: actualDmg });
                            }

                            // 停顿，让玩家清楚地看到受击红光和血条掉落
                            await wait(150);

                            // 立即清算微队列！
                            const isQueueProcessed = flushMicroQueue();
                            if (isQueueProcessed) {
                                await wait(50);
                                nextPlayerBench = [...stateRef.current.playerBench];
                                nextEnemyBench = [...stateRef.current.enemyBench];
                                nextCombatField = [...stateRef.current.combatField];
                            }

                            // 阶段二：生死判定与强化涂抹
                            let latestTarget = nextPlayerBench.find(c => c.id === targetId) || nextEnemyBench.find(c => c.id === targetId);
                            if (!latestTarget) {
                                const fight = nextCombatField.find(f => f.attacker?.id === targetId || f.blocker?.id === targetId);
                                if (fight) latestTarget = fight.attacker?.id === targetId ? fight.attacker : fight.blocker;
                            }

                            if (latestTarget) {
                                const hp = getCurrentHP(latestTarget as CardData);
                                if (latestTarget && !latestTarget.isDead && latestTarget.animState !== 'dying' && latestTarget.animState !== 'ephemeral_dying' && hp > 0) {
                                    const applyBuffOnly = (c: CardData) => {
                                        let nc = { ...c, animState: 'idle' as const };
                                        nc.buffs = {
                                            power: (nc.buffs?.power || 0) + power,
                                            health: (nc.buffs?.health || 0) + health
                                        };
                                        return nc;
                                    };

                                    if (owner === 'player') nextPlayerBench = nextPlayerBench.map(c => c.id === targetId ? applyBuffOnly(c) : c);
                                    else nextEnemyBench = nextEnemyBench.map(c => c.id === targetId ? applyBuffOnly(c) : c);

                                    nextCombatField = nextCombatField.map(f => {
                                        let newF = { ...f };
                                        if (newF.attacker?.id === targetId) newF.attacker = applyBuffOnly(newF.attacker);
                                        if (newF.blocker?.id === targetId) newF.blocker = applyBuffOnly(newF.blocker);
                                        return newF;
                                    });
                                } else {
                                    const markDying = (c: CardData) => ({ ...c, animState: 'dying' as const });
                                    if (owner === 'player') nextPlayerBench = nextPlayerBench.map(c => c.id === targetId ? markDying(c) : c);
                                    else nextEnemyBench = nextEnemyBench.map(c => c.id === targetId ? markDying(c) : c);
                                    nextCombatField = nextCombatField.map(f => {
                                        let newF = { ...f };
                                        if (newF.attacker?.id === targetId) newF.attacker = markDying(newF.attacker);
                                        if (newF.blocker?.id === targetId) newF.blocker = markDying(newF.blocker);
                                        return newF;
                                    });
                                }

                                setPlayerBench(nextPlayerBench);
                                setEnemyBench(nextEnemyBench);
                                setCombatField(nextCombatField as any);
                            }

                            await wait(100);
                        };

                        if (validTargets.length > 0) {
                            if (hitAll) {
                                // [Lv2] 命中所有符合条件的基座，逐个鞭策！
                                for (const target of validTargets) {
                                    await whipSingleTarget(target);
                                }
                            } else {
                                // [Lv1] 随机抽打一个基座
                                const target = validTargets[Math.floor(Math.random() * validTargets.length)];
                                await whipSingleTarget(target);
                            }
                        }
                    }

                    // ==========================================
                    // [重构] 剥离硬编码！将回合末的增益/光环效果统统移交给中央处理器
                    // ==========================================
                    if (def && def.params?.roundEndBuff) {
                        // 1. 组装最新鲜的上下文快照
                        const ctx: EffectContext = {
                            game: stateRef.current.game,
                            playerBench: nextPlayerBench,
                            enemyBench: nextEnemyBench,
                            playerHand: stateRef.current.playerHand,
                            enemyHand: stateRef.current.enemyHand,
                            playerDeck: stateRef.current.playerDeck,
                            enemyDeck: stateRef.current.enemyDeck,
                            combatField: nextCombatField,
                            owner,
                            sourceCard: unit // [关键] 把施法者(鳄鱼)传进去，让处理器能找到记账本！
                        };

                        // 2. 把任务无脑丢给工厂 (由于它在字典里是 class: 'BUFF'，会自动走 BUFF 车间的记账和发奖流水线)
                        const res = processEffect(effId, [], ctx);

                        // 3. 接收工厂加工后的最新快照
                        nextPlayerBench = res.playerBench;
                        nextEnemyBench = res.enemyBench;
                        if (res.combatField) nextCombatField = res.combatField as any[];

                        // 4. 同步手牌与牌库，并同步刷新 stateRef (防止同回合多只鳄鱼连环触发导致旧快照覆盖发奖)
                        // [核心修复] 补上致命遗漏的 setPlayerBench！否则 React 根本不知道你加了 BUFF！
                        if (owner === 'player') {
                            setPlayerBench(nextPlayerBench);
                            stateRef.current.playerBench = nextPlayerBench;
                            if (res.playerHand) { setPlayerHand(res.playerHand); stateRef.current.playerHand = res.playerHand; }
                            if (res.playerDeck) { setPlayerDeck(res.playerDeck); stateRef.current.playerDeck = res.playerDeck; }
                        } else {
                            setEnemyBench(nextEnemyBench);
                            stateRef.current.enemyBench = nextEnemyBench;
                            if (res.enemyHand) { setEnemyHand(res.enemyHand); stateRef.current.enemyHand = res.enemyHand; }
                            if (res.enemyDeck) { setEnemyDeckState(res.enemyDeck); stateRef.current.enemyDeck = res.enemyDeck; }
                        }
                        // 同步刷新交战区视图
                        setCombatField(nextCombatField as any);
                        stateRef.current.combatField = nextCombatField;
                    }

                    // ==========================================
                    // [2026-07-10 精灵小队] ROUND_END 通用效果触发（一次性）
                    // ==========================================
                    if (def && def.timing.includes('ROUND_END')) {
                        // [SpiritDebug] 斯涅妮卡回合末治疗触发
                        if (effId === 'effect_spirit_snenika_roundend_heal') {
                            console.log(`[SpiritDebug] ROUND_END触发: unit=${unit.name}(id=${unit.id}), owner=${owner}`);
                        }
                        const ctx: EffectContext = {
                            game: stateRef.current.game,
                            playerBench: nextPlayerBench,
                            enemyBench: nextEnemyBench,
                            playerHand: stateRef.current.playerHand,
                            enemyHand: stateRef.current.enemyHand,
                            playerDeck: stateRef.current.playerDeck,
                            enemyDeck: stateRef.current.enemyDeck,
                            combatField: nextCombatField,
                            owner,
                            sourceCard: unit
                        };

                        const res = processEffect(effId, [], ctx);
                        nextPlayerBench = res.playerBench;
                        nextEnemyBench = res.enemyBench;
                        if (res.combatField) nextCombatField = res.combatField as any[];

                        if (owner === 'player') {
                            setPlayerBench(nextPlayerBench);
                            stateRef.current.playerBench = nextPlayerBench;
                            if (res.playerHand) { setPlayerHand(res.playerHand); stateRef.current.playerHand = res.playerHand; }
                            if (res.playerDeck) { setPlayerDeck(res.playerDeck); stateRef.current.playerDeck = res.playerDeck; }
                        } else {
                            setEnemyBench(nextEnemyBench);
                            stateRef.current.enemyBench = nextEnemyBench;
                            if (res.enemyHand) { setEnemyHand(res.enemyHand); stateRef.current.enemyHand = res.enemyHand; }
                            if (res.enemyDeck) { setEnemyDeckState(res.enemyDeck); stateRef.current.enemyDeck = res.enemyDeck; }
                        }
                        setCombatField(nextCombatField as any);
                        stateRef.current.combatField = nextCombatField;

                        // [核心] 首次触发后从单位身上移除该效果，后续回合不再触发
                        const removeEffect = (c: CardData): CardData => ({
                            ...c,
                            effects: (c.effects || []).filter(e => e !== effId)
                        });
                        if (owner === 'player') {
                            nextPlayerBench = nextPlayerBench.map(c => c.id === unit.id ? removeEffect(c) : c);
                            setPlayerBench(nextPlayerBench);
                            stateRef.current.playerBench = nextPlayerBench;
                        } else {
                            nextEnemyBench = nextEnemyBench.map(c => c.id === unit.id ? removeEffect(c) : c);
                            setEnemyBench(nextEnemyBench);
                            stateRef.current.enemyBench = nextEnemyBench;
                        }
                        // 同步更新交战区中的该单位
                        if (nextCombatField) {
                            nextCombatField = nextCombatField.map(fight => {
                                let newF = { ...fight };
                                if (newF.attacker && newF.attacker.id === unit.id) newF.attacker = removeEffect(newF.attacker);
                                if (newF.blocker && newF.blocker.id === unit.id) newF.blocker = removeEffect(newF.blocker);
                                return newF;
                            });
                            setCombatField(nextCombatField as any);
                            stateRef.current.combatField = nextCombatField;
                        }

                        console.log(`[ROUND_END] ${unit.name} 触发一次性效果 ${def.name} 后已移除`);
                    }
                }
            }
        };

        // 必须通过 await 保证双方的鞭策动作按时间轴执行完毕
        await processRoundEndWhips('player');
        await processRoundEndWhips('enemy');

        // --- 2. 随机打击与统一预演 ---
        const processRoundEndAttacks = async (owner: 'player' | 'enemy') => {
            const myBench = owner === 'player' ? nextPlayerBench : nextEnemyBench;
            const myFieldUnits = nextCombatField.map(f => f.owner === owner ? f.attacker : f.blocker).filter(Boolean) as CardData[];
            const myUnits = [...myBench, ...myFieldUnits];

            // [新增] 战区扫描：探测己方阵营是否存在 Lv2 猫汐尔光环！
            const hasLv2Mauxir = myUnits.some(u => u.key === 'mauxir_lotus_drive' && u.level === 2);

            // [2026-06-27 共享沙盘] 所有单位共享同一个沙盘，避免后续单位鞭尸
            let simPlayerBench = [...nextPlayerBench];
            let simEnemyBench = [...nextEnemyBench];
            let simCombatField = [...nextCombatField];

            for (const unit of myUnits) {
                if (unit.animState === 'dying' || unit.animState === 'ephemeral_dying' || !unit.effects) continue;

                let shouldAttack = false;
                unit.effects.forEach(effId => {
                    if (EFFECT_DB[effId]?.params?.roundEndAttack) shouldAttack = true;
                });

                if (shouldAttack) {
                    const baseP = unit.power || 0;
                    const permP = unit.buffs?.power || 0;
                    const tempP = unit.roundBuffs?.power || 0;
                    const power = baseP + permP + (tempP < 0 ? tempP : 0);

                    if (power <= 0) continue;

                    // [新增] 权限校验：如果当前是基座且拥有 Lv2 光环，解锁打脸权限！
                    const isPedestal = unit.key === 'mauxir_lotus_pedestal';
                    const canTargetNexus = hasLv2Mauxir && isPedestal;
                    let nexusDamageAccumulator = 0; // 用于记录本次弹夹中水晶被锁定的总发数

                    const bullets: { targetId: string, damage: number, barrierPopped: boolean }[] = [];

                    for (let i = 0; i < power; i++) {
                        const enemyBenchRef = owner === 'player' ? simEnemyBench : simPlayerBench;
                        const validEnemyTargets: any[] = []; // [修改] 放宽类型，允许塞入水晶标记物

                        enemyBenchRef.forEach(c => {
                            if (!c.isDead && c.animState !== 'dying' && c.animState !== 'ephemeral_dying' && getCurrentHP(c) > 0) validEnemyTargets.push(c);
                        });
                        simCombatField.forEach(f => {
                            const enemyU = owner === 'player' ? (f.owner === 'enemy' ? f.attacker : f.blocker) : (f.owner === 'player' ? f.attacker : f.blocker);
                            if (enemyU && !enemyU.isDead && enemyU.animState !== 'dying' && enemyU.animState !== 'ephemeral_dying' && getCurrentHP(enemyU) > 0) {
                                validEnemyTargets.push(enemyU);
                            }
                        });

                        // [新增] 扩容标靶：将敌方水晶作为诱饵塞入随机奖池
                        if (canTargetNexus) {
                            validEnemyTargets.push({ isNexus: true, id: owner === 'player' ? 'nexus_enemy' : 'nexus_player' });
                        }

                        if (validEnemyTargets.length === 0) break;

                        const randomIndex = Math.floor(Math.random() * validEnemyTargets.length);
                        const targetObj = validEnemyTargets[randomIndex];

                        // [新增] 结算分流：如果这发子弹抽中了水晶
                        if (targetObj.isNexus) {
                            nexusDamageAccumulator += 1;
                            // 把包裹封装好，视觉层依然会发射激光，但扣血层 (handleStrikeHit) 会忽略它
                            bullets.push({ targetId: targetObj.id, damage: 1, barrierPopped: false });
                            continue; // [降维打击] 跳过下方实体单位的护甲计算与血量涂抹！
                        }

                        // 恢复常规实体计算
                        const targetCard = targetObj as CardData;

                        // 在预演阶段就算好：真实伤害与碎盾情况
                        let actualDmg = 1;
                        let barrierPopped = false;
                        if (targetCard.keywords.includes('Tough')) actualDmg = Math.max(0, actualDmg - 1);
                        const hasActiveBarrier = targetCard.keywords.includes('Barrier') && !(targetCard.depletedKeywords || []).includes('Barrier');
                        if (hasActiveBarrier && actualDmg > 0) {
                            barrierPopped = true;
                            actualDmg = 0;
                        }

                        // 将所有伤害逻辑装箱，封装为完美的物理学弹丸！
                        bullets.push({ targetId: targetCard.id, damage: actualDmg, barrierPopped });

                        const applySimDmg = (c: CardData) => {
                            let nc = { ...c };
                            if (barrierPopped) nc.depletedKeywords = [...(nc.depletedKeywords || []), 'Barrier'];
                            if (actualDmg > 0) nc.damageTaken = (nc.damageTaken || 0) + actualDmg;
                            return nc;
                        };

                        simPlayerBench = simPlayerBench.map(c => c.id === targetCard.id ? applySimDmg(c) : c);
                        simEnemyBench = simEnemyBench.map(c => c.id === targetCard.id ? applySimDmg(c) : c);
                        simCombatField = simCombatField.map(f => {
                            let newF = { ...f };
                            if (newF.attacker?.id === targetCard.id) newF.attacker = applySimDmg(newF.attacker);
                            if (newF.blocker?.id === targetCard.id) newF.blocker = applySimDmg(newF.blocker);
                            return newF;
                        });
                    }

                    if (bullets.length === 0) continue;

                    const linePayload = [{
                        sourceId: unit.id,
                        targets: bullets.map(b => ({ id: b.targetId, type: owner === 'player' ? 'enemy' : 'ally' }))
                    }];
                    eventBus.emit('SHOW_TEMP_LINES', linePayload);

                    await wait(500);
                    eventBus.emit('HIDE_TEMP_LINES');

                    // [核心重构] 发射后不管！把包裹集装箱甩给前台武器库！
                    eventBus.emit(StrikeEvents.COMMAND, {
                        sourceId: unit.id,
                        bullets,
                        interval: 100,
                        spellKey: unit.key
                    });

                    // 释放总控线程！静静欣赏武器库清空弹夹的华丽演出。
                    await waitForStrikeComplete();

                    // [新增] 统一清算水晶受损！
                    // 等待子弹全部落地后，将刚才预演中累积的水晶伤害直接写入引擎，并呼叫震屏与飘字反馈。
                    if (nexusDamageAccumulator > 0) {
                        const targetNexusId = owner === 'player' ? 'nexus_enemy' : 'nexus_player';
                        setGame(prev => ({
                            ...prev,
                            ...(owner === 'player'
                                ? { enemyNexus: Math.max(0, prev.enemyNexus - nexusDamageAccumulator) }
                                : { playerNexus: Math.max(0, prev.playerNexus - nexusDamageAccumulator) })
                        }));
                        // 发射震动与飘字事件，触发 UI 层的受击反馈
                        eventBus.emit('unit_damage', { id: targetNexusId, amount: nexusDamageAccumulator });
                        eventBus.emit(GameEvents.NEXUS_STRIKED, { target: owner === 'player' ? 'enemy' : 'player', amount: nexusDamageAccumulator });
                    }

                    // [新增] 记录回合结束伤害到战术日志（用于臆莲基座等累计伤害任务）
                    if (owner === 'player' && bullets.length > 0) {
                        const totalDmg = bullets.reduce((sum, b) => sum + b.damage, 0);
                        if (totalDmg > 0) {
                            gameLogger.logEvent({
                                type: 'damage_dealt',
                                turn: stateRef.current.game.round,
                                isPlayerSide: true,
                                sourceCardKey: unit.key,
                                amount: totalDmg
                            });
                        }
                    }
                }
            }
        };

        await processRoundEndAttacks('player');
        await processRoundEndAttacks('enemy');
         // ==== 👇 加这段 ====
        await wait(50); // 确保 React 已刷新 HIT 处理器的状态
        nextPlayerBench = [...stateRef.current.playerBench];
        nextEnemyBench = [...stateRef.current.enemyBench];
        nextCombatField = [...stateRef.current.combatField];

        // --- 3. 统一进行死亡判定 ---
        let hasCombatDeath = false;
        nextCombatField = nextCombatField.map(fight => {
            const newFight = { ...fight };
            if (newFight.attacker) {
                if (newFight.attacker.keywords.includes('Ephemeral')) newFight.attacker = { ...newFight.attacker, animState: 'ephemeral_dying' };
                else if (getCurrentHP(newFight.attacker) <= 0) newFight.attacker = { ...newFight.attacker, animState: 'dying' };
                if (newFight.attacker.animState === 'dying' || newFight.attacker.animState === 'ephemeral_dying') hasCombatDeath = true;
            }
            if (newFight.blocker) {
                if (newFight.blocker.keywords.includes('Ephemeral')) newFight.blocker = { ...newFight.blocker, animState: 'ephemeral_dying' };
                else if (getCurrentHP(newFight.blocker) <= 0) newFight.blocker = { ...newFight.blocker, animState: 'dying' };
                if (newFight.blocker.animState === 'dying' || newFight.blocker.animState === 'ephemeral_dying') hasCombatDeath = true;
            }
            return newFight;
        });

        nextPlayerBench = nextPlayerBench.map(c => {
            // [新增] 优先检查 Ephemeral 关键词——即使 animState 被弹道打击覆盖为 hit 也能正确揪出来！
            if (c.keywords.includes('Ephemeral') && !c.isDead && c.animState !== 'dying' && c.animState !== 'ephemeral_dying') {
                console.log(`[RoundEndDebug] 标记幻象死亡: ${c.name}(${c.key}) id=${c.id}`);
                return { ...c, animState: 'ephemeral_dying' as const };
            }
            // 其次再检查 HP 归零
            if (getCurrentHP(c) <= 0 && !c.isDead && c.animState !== 'dying' && c.animState !== 'ephemeral_dying') {
                return { ...c, animState: 'dying' as const };
            }
            return c;
        });

        nextEnemyBench = nextEnemyBench.map(c => {
            // [新增] 敌方同理，绝不放过任何一个苟活的幻象
            if (c.keywords.includes('Ephemeral') && !c.isDead && c.animState !== 'dying' && c.animState !== 'ephemeral_dying') {
                console.log(`[RoundEndDebug] 标记幻象死亡: ${c.name}(${c.key}) id=${c.id}`);
                return { ...c, animState: 'ephemeral_dying' as const };
            }
            if (getCurrentHP(c) <= 0 && !c.isDead && c.animState !== 'dying' && c.animState !== 'ephemeral_dying') {
                return { ...c, animState: 'dying' as const };
            }
            return c;
        });

        const hasEphemeralDeath =
            nextPlayerBench.some(c => c.animState === 'dying' || c.animState === 'ephemeral_dying') ||
            nextEnemyBench.some(c => c.animState === 'dying' || c.animState === 'ephemeral_dying') ||
            hasCombatDeath;

        if (hasEphemeralDeath) {
            const dyingCount = [...nextPlayerBench, ...nextEnemyBench].filter(c => c.animState === 'dying' || c.animState === 'ephemeral_dying').length;
            console.log(`[RoundEndDebug] hasEphemeralDeath=true, 待处理死亡=${dyingCount}个, 其中幻象=${[...nextPlayerBench, ...nextEnemyBench].filter(c => c.animState === 'ephemeral_dying').length}个`);
        }
        // [2026-07-23 对局记录] 幻象回合末阵亡
        const ephemeralDeadByOwner = (owner: 'player' | 'enemy', bench: CardData[], field: any[]) => {
            const fromBench = bench.filter(c => c.animState === 'ephemeral_dying').map(c => ({ card: c, owner }));
            const fromField = field.filter(f => {
                if (f.owner === owner && f.attacker?.animState === 'ephemeral_dying') return true;
                if (f.owner !== owner && f.blocker?.animState === 'ephemeral_dying') return true;
                return false;
            }).flatMap(f => {
                if (f.owner === owner && f.attacker?.animState === 'ephemeral_dying') return [{ card: f.attacker as CardData, owner }];
                if (f.owner !== owner && f.blocker?.animState === 'ephemeral_dying') return [{ card: f.blocker as CardData, owner }];
                return [];
            });
            return [...fromBench, ...fromField];
        };
        const allEphemeralDead = [
            ...ephemeralDeadByOwner('player', nextPlayerBench, nextCombatField),
            ...ephemeralDeadByOwner('enemy', nextEnemyBench, nextCombatField),
        ];
        allEphemeralDead.forEach(({ card, owner }) => {
            const snapshot = captureSnapshot(card);
            recordAction('unit_died', owner, `${card.name} 幻象消散`, {
                cardKey: card.key,
                entities: [{ cardKey: card.key, owner, snapshot }]
            });
        });

        setPlayerBench(nextPlayerBench);
        setEnemyBench(nextEnemyBench);
        if (hasCombatDeath) setCombatField(nextCombatField);

        // [2026-07-15 修复] 同步 stateRef，否则 judgeLifeAndDeath 读到的还是旧数据，
        // 无法检测到 ephemeral_dying 标记，导致幻象亡语不触发
        stateRef.current.playerBench = nextPlayerBench;
        stateRef.current.enemyBench = nextEnemyBench;
        if (hasCombatDeath) stateRef.current.combatField = nextCombatField;

        // [2026-07-09 修复] 幻象标记后再次清算生死簿，触发亡语（如猫头鹰抽牌）
        if (hasEphemeralDeath) {
            judgeLifeAndDeath();       // UNIT_DIED → pendingActionsRef
            flushMicroQueue();         // 同步处理亡语效果（抽牌等）
            // 重新读取处理后的数据
            nextPlayerBench = stateRef.current.playerBench;
            nextEnemyBench = stateRef.current.enemyBench;
        }

        if (hasEphemeralDeath) {
            await wait(2500);
            if (hasCombatDeath) {
                setCombatField(prev => prev.filter(f =>
                    f.attacker.animState !== 'dying' && f.attacker.animState !== 'ephemeral_dying' && !f.attacker.isDead &&
                    f.blocker?.animState !== 'dying' && f.blocker?.animState !== 'ephemeral_dying' && !f.blocker?.isDead
                ));
            }
            setPlayerBench(prev => prev.filter(c => !c.isDead && c.animState !== 'dying' && c.animState !== 'ephemeral_dying'));
            setEnemyBench(prev => prev.filter(c => !c.isDead && c.animState !== 'dying' && c.animState !== 'ephemeral_dying'));
        }

        // --- 4. 泰坦脉冲解析（事件分发架构） ---
        const pulseResult = executeTitanPulse(stateRef.current.playerBench, stateRef.current.enemyBench);
        if (pulseResult.pulsedUnits > 0) {
            setPlayerBench(pulseResult.playerBoard);
            setEnemyBench(pulseResult.enemyBoard);
            stateRef.current = {
                ...stateRef.current,
                playerBench: pulseResult.playerBoard,
                enemyBench: pulseResult.enemyBoard,
            };
            setMessage("泰坦脉冲...");
            await new Promise<void>(resolve => {
                const handler = () => { eventBus.off(GameEvents.ROUND_END_EFFECT_COMPLETE, handler); resolve(); };
                eventBus.on(GameEvents.ROUND_END_EFFECT_COMPLETE, handler);
                setTimeout(() => { eventBus.off(GameEvents.ROUND_END_EFFECT_COMPLETE, handler); resolve(); }, 5000);
            });

            // --- 4a. 消费脉冲副效果事件（乙型扫射等） ---
            for (const event of pulseResult.events) {
                if (event.type === 'random_barrage') {
                    const owner = event.owner;
                    const myPlayerBench = stateRef.current.playerBench;
                    const myEnemyBench = stateRef.current.enemyBench;
                    const enemyBoard = owner === 'player' ? myEnemyBench : myPlayerBench;

                    // 收集有效敌方目标
                    const validTargets = enemyBoard.filter(c =>
                        !c.isDead && c.animState !== 'dying' && c.animState !== 'ephemeral_dying' && getCurrentHP(c) > 0
                    );
                    if (validTargets.length === 0) continue;

                    // 预演：生成子弹包裹（N 发随机目标，计算伤害）
                    let simBoard = [...enemyBoard];
                    const bullets: { targetId: string; damage: number; barrierPopped: boolean }[] = [];

                    for (let i = 0; i < event.params.shots; i++) {
                        if (validTargets.length === 0) break;
                        const target = validTargets[Math.floor(Math.random() * validTargets.length)];

                        let actualDmg = event.params.damage;
                        if (target.keywords.includes('Tough')) actualDmg = Math.max(0, actualDmg - 1);
                        const hasActiveBarrier = target.keywords.includes('Barrier') && !(target.depletedKeywords || []).includes('Barrier');
                        let barrierPopped = false;
                        if (hasActiveBarrier && actualDmg > 0) {
                            barrierPopped = true;
                            actualDmg = 0;
                        }

                        bullets.push({ targetId: target.id, damage: actualDmg, barrierPopped });

                        // 模拟伤害预演
                        simBoard = simBoard.map(c => {
                            if (c.id !== target.id) return c;
                            let nc = { ...c };
                            if (barrierPopped) nc.depletedKeywords = [...(nc.depletedKeywords || []), 'Barrier'];
                            if (actualDmg > 0) nc.damageTaken = (nc.damageTaken || 0) + actualDmg;
                            return nc;
                        });
                    }

                    // 视觉：瞄准线
                    const linePayload = [{
                        sourceId: event.sourceId,
                        targets: bullets.map(b => ({ id: b.targetId, type: owner === 'player' ? 'enemy' : 'ally' })),
                    }];
                    eventBus.emit('SHOW_TEMP_LINES', linePayload);
                    await wait(400);
                    eventBus.emit('HIDE_TEMP_LINES');

                    // 视觉：默认红色法球弹道
                    eventBus.emit(StrikeEvents.COMMAND, {
                        sourceId: event.sourceId,
                        bullets,
                        interval: 120,
                        spellKey: 'titan_type_b_mutant',  // missle map 没有此 key → 走 default 红色法球
                    });
                    await waitForStrikeComplete();

                    // 伤害写入
                    if (owner === 'player') {
                        setEnemyBench(simBoard);
                        stateRef.current.enemyBench = simBoard;
                    } else {
                        setPlayerBench(simBoard);
                        stateRef.current.playerBench = simBoard;
                    }
                }

                // ========== 盖弥尔 AOE 伤害 ==========
                if (event.type === 'aoe_damage') {
                    const owner = event.owner;
                    const dmg = event.params.damage;

                    const myPlayerBench = stateRef.current.playerBench;
                    const myEnemyBench = stateRef.current.enemyBench;
                    const myCombatField = stateRef.current.combatField;

                    const enemyPlayer = owner === 'player' ? 'enemy' : 'player';
                    const enemyBench = enemyPlayer === 'player' ? myPlayerBench : myEnemyBench;

                    // 伤害敌方备战席
                    const newEnemyBench = enemyBench.map(c => {
                        if (c.isDead || c.animState === 'dying' || c.animState === 'ephemeral_dying') return c;
                        return { ...c, damageTaken: (c.damageTaken || 0) + dmg };
                    });

                    // 伤害敌方交战区单位
                    let newCombatField = myCombatField ? [...myCombatField] : [];
                    if (newCombatField.length > 0) {
                        newCombatField = newCombatField.map(f => {
                            const enemyUnit = f.owner !== owner ? f.attacker : f.blocker;
                            if (!enemyUnit) return f;
                            const updatedEnemy = { ...enemyUnit, damageTaken: (enemyUnit.damageTaken || 0) + dmg };
                            return {
                                ...f,
                                [f.owner !== owner ? 'attacker' : 'blocker']: updatedEnemy,
                            };
                        });
                    }

                    // 伤害敌方水晶
                    let nexusDmg = 0;
                    if (enemyPlayer === 'player') {
                        nexusDmg = Math.min(dmg, (stateRef.current.game?.playerNexus || 20));
                    } else {
                        nexusDmg = Math.min(dmg, (stateRef.current.game?.enemyNexus || 20));
                    }

                    // 批量更新
                    if (owner === 'player') {
                        // 我方盖弥尔 → 伤害敌方
                        setEnemyBench(newEnemyBench);
                        stateRef.current.enemyBench = newEnemyBench;
                        if (newCombatField.length > 0) { setCombatField(newCombatField); stateRef.current.combatField = newCombatField; }
                    } else {
                        setPlayerBench(newEnemyBench);
                        stateRef.current.playerBench = newEnemyBench;
                        if (newCombatField.length > 0) { setCombatField(newCombatField); stateRef.current.combatField = newCombatField; }
                    }

                    if (nexusDmg > 0) {
                        setGame(prev => ({
                            ...prev,
                            ...(enemyPlayer === 'player'
                                ? { playerNexus: Math.max(0, (prev.playerNexus || 20) - nexusDmg) }
                                : { enemyNexus: Math.max(0, (prev.enemyNexus || 20) - nexusDmg) }),
                        }));
                        eventBus.emit('unit_damage', { id: `nexus_${enemyPlayer}`, amount: nexusDmg });
                        eventBus.emit(GameEvents.NEXUS_STRIKED, { target: enemyPlayer, amount: nexusDmg });
                    }

                    console.log(`[盖弥尔] AOE 伤害：对敌方全体 ${dmg} 点（水晶 ${nexusDmg}）`);
                }
            }
        }

        // --- 5. Frostbite 解冻阶段：播放解冻动画后，再清理关键词 ---
        const setThawing = (cards: CardData[]) => cards.map(c =>
            c.keywords?.includes('Frostbite') ? { ...c, animState: 'thawing' as const } : c
        );
        const hasFrostbiteUnits = [...stateRef.current.playerBench, ...stateRef.current.enemyBench]
            .some(c => c.keywords?.includes('Frostbite'));
        if (hasFrostbiteUnits) {
            setPlayerBench(prev => setThawing(prev));
            setEnemyBench(prev => setThawing(prev));
            stateRef.current = {
                ...stateRef.current,
                playerBench: setThawing(stateRef.current.playerBench),
                enemyBench: setThawing(stateRef.current.enemyBench),
            };
            setMessage("冰霜消融...");
            await new Promise<void>(resolve => {
                const handler = () => { eventBus.off(GameEvents.ROUND_END_EFFECT_COMPLETE, handler); resolve(); };
                eventBus.on(GameEvents.ROUND_END_EFFECT_COMPLETE, handler);
                setTimeout(() => { eventBus.off(GameEvents.ROUND_END_EFFECT_COMPLETE, handler); resolve(); }, 5000);
            });
        }

        // --- 6. 清理拥堵的微队列 ---
        await wait(50);
        const isQueueProcessed = flushMicroQueue();
        if (isQueueProcessed) await wait(50);

        // --- 6.5 [2026-08-04 莉莉子] 等待瞬逝弃置动画播完再开新回合 ---
        // 之前 emit 事件后直接 startRound()，新回合抽卡/手牌重排会反复打断 2 秒的燃尽动画，
        // 导致动画停停走走、最后"跳着消失"。这里等全部瞬逝卡动画完成（带超时兜底防卡死）。
        if (volatilePending.size > 0) {
            await new Promise<void>(resolve => {
                let settled = false;
                const finish = () => {
                    if (settled) return;
                    settled = true;
                    clearInterval(check);
                    eventBus.off(GameEvents.HAND_DISCARD_ANIM_DONE, onDone);
                    resolve();
                };
                const onDone = (p: { cardId: string }) => {
                    volatilePending.delete(p.cardId);
                    if (volatilePending.size === 0) finish();
                };
                const check = setInterval(() => {
                    if (volatilePending.size === 0) finish();
                }, 100);
                eventBus.on(GameEvents.HAND_DISCARD_ANIM_DONE, onDone);
                setTimeout(finish, 2600); // 超时兜底：动画总长 2.0s，预留 0.6s
            });
        }

        // 7. 开启新回合
        startRound();
    };

    return {
        startRound,
        executeRoundEndSequence,
        triggerFirstRoundRogueEnhance, // [2026-08-15] 换牌后第一回合触发 round_start 强化（暗箭等）
    };
}