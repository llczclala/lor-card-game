import { useEffect, MutableRefObject } from 'react';
import type { CardData, GameState } from '../types';
import { calculateRoundStart } from '../logic/core';
import { getCurrentHP } from '../logic/combat';
import { processEffect } from '../logic/effectProcessor';
import type { EffectContext } from '../logic/effectProcessor';
import { EFFECT_DB } from '../data/effectRegistry';
import { eventBus, GameEvents, StrikeEvents } from '../utils/eventBus'; // [新增] 引入通用打击总线
import { applyRoundStartKeywords, applyRoundEndKeywords, resolveTitanPulse } from '../logic/keywords';
import { accumulateMauxirDamage, isSummonerOrSummon } from '../utils/gameRules'; // [新增] 引入猫汐尔经验收集器

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
}

// ==========================================
// 主 Hook
// ==========================================
export function useRoundLifecycle(params: UseRoundLifecycleParams) {
    const {
        stateRef, heroActionHistory, enemyUnitsPlayedRef, game,
        setGame, setPlayerBench, setEnemyBench, setCombatField,
        setPlayerHand, setPlayerDeck, setEnemyHand, setEnemyDeckState, // [核心修复] 补全被遗漏的敌方更新器解构
        setMessage, createFullCard, flushMicroQueue, judgeLifeAndDeath, wait
    } = params;

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
                let hasEffectTriggered = false;

                // [库效雷达]
                const scanDeckAuras = (owner: 'player' | 'enemy') => {
                    const currentDeck = owner === 'player' ? stateRef.current.playerDeck : stateRef.current.enemyDeck;
                    const currentHand = owner === 'player' ? stateRef.current.playerHand : stateRef.current.enemyHand;
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

                    // 3. 查漏补缺：如果场上没有指定的召唤物，立刻空降
                    auraSummons.forEach(summonKey => {
                        const hasSummon = currentBench.some(c => c.key === summonKey) ||
                            currentField.some(f => {
                                const u = f.owner === owner ? f.attacker : f.blocker;
                                return u && u.key === summonKey;
                            });

                        if (!hasSummon) {
                            const newCard = createFullCard(summonKey);
                            const cardWithAbility = newCard.ability
                                ? { ...newCard, abilityState: 'breathing' as const, abilityCharges: newCard.ability.maxCharges }
                                : newCard;

                            currentBench.push(cardWithAbility);
                            hasEffectTriggered = true;
                            eventBus.emit(GameEvents.SFX_DROP_BENCH);
                            if (summonKey === 'mauxir_lotus_pedestal') {
                                eventBus.emit(GameEvents.SFX_MAUXIR_SUMMON);
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

                scanDeckAuras('player');
                scanDeckAuras('enemy');

                scanAndApply(tempPBench, 'player');
                scanAndApply(tempEBench, 'enemy');

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
    }, [game.round]); // 严格且安全地只监听 game.round 变化


    // ---------------------------------------------------------
    // 块 C: 新回合状态刷新序列
    // ---------------------------------------------------------
    const startRound = () => {
        heroActionHistory.current.clear();
        enemyUnitsPlayedRef.current = 0;
        eventBus.emit(GameEvents.ROUND_START);

        const currentGameState = stateRef.current.game;
        const nextRoundBase = calculateRoundStart(currentGameState);

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

    // ---------------------------------------------------------
    // 块 B: 回合末综合清算序列 (幻象/鞭策/基座扫射/脉冲)
    // ---------------------------------------------------------
    const executeRoundEndSequence = async () => {
        // [SBA] 回合结束效果前先清尸
        judgeLifeAndDeath();
        setGame(prev => ({ ...prev, phase: 'animating' }));
        setMessage("回合结束结算...");

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

        setPlayerBench(nextPlayerBench);
        setEnemyBench(nextEnemyBench);
        if (hasCombatDeath) setCombatField(nextCombatField);

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

        // --- 4. 泰坦脉冲解析 ---
        const pulseResult = resolveTitanPulse(stateRef.current.playerBench, stateRef.current.enemyBench);
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
        }

        // --- 5. 清理拥堵的微队列 ---
        await wait(50);
        const isQueueProcessed = flushMicroQueue();
        if (isQueueProcessed) await wait(50);

        // 6. 开启新回合
        startRound();
    };

    return {
        startRound,
        executeRoundEndSequence
    };
}