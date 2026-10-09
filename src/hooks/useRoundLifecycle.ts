import { useEffect, useRef, useCallback } from 'react';
import type { MutableRefObject } from 'react';
import type { CardData, GameState, GameRecordCategory, RecordEntity } from '../types';
import { calculateRoundStart, spellManaCapOf } from '../logic/core';
import { resetSpellCastRoundCounters } from '../utils/gameRules'; // [2026-10-08 第二波] 回合开始清零本回合施法计数
import { getCurrentHP } from '../logic/combat';
import { processEffect, relayEffectEvents, hasLiveUnitOfSide, processOnGetAttackToken } from '../logic/effectProcessor'; // [2026-10-04] +hasLiveUnitOfSide（回合兜底复用"存在性"唯一出口）｜ [2026-10-06] +processOnGetAttackToken（块 B 改走唯一入口）
import type { EffectContext } from '../logic/effectProcessor';
import { EFFECT_DB } from '../data/effectRegistry';
import { eventBus, GameEvents, StrikeEvents } from '../utils/eventBus'; // [新增] 引入通用打击总线
import { applyRoundStartKeywords, applyRoundEndKeywords, applyVolatileDiscard, executeTitanPulse, applyChannelOnRoundStart, getPower } from '../logic/keywords'; // [2026-08-27] 高级强化：冻结/设面板（冻结逻辑已收编 rogueTrigger）
import { accumulateMauxirDamage, isSummonerOrSummon, upgradeAcaciaHand, assembleBeaconCard, isLeveledUpForSide } from '../utils/gameRules'; // [新增] 引入猫汐尔经验收集器 ｜ [2026-10-02] 移除 isLeveledUpForSide（补信标扫描已删）｜ [2026-10-04] 加回 assembleBeaconCard（回合兜底的落场加工）· [2026-10-04 I5] 再加回 isLeveledUpForSide（安卡升级判据改「按方」）
// [2026-10-06 莉莉子 BUG修复 · BUG-20261006-01] 猫汐尔升级进度：交战区贴值 + 回合开始全域兜底贴值
import { applyMauxirProgress, applyMauxirProgressToField } from '../utils/mauxirProgress';
import { gameLogger } from '../utils/gameLogger'; // [新增] 战术审计黑匣子
import { bumpAnimProgress } from '../utils/animGuard'; // [2026-09-03] animating 停滞看门狗心跳
import { recoverCombatSurvivors } from '../utils/combatRecovery'; // [2026-09-03] 交战区幸存者应急归位
// [2026-10-05 莉莉子 BUG修复 · 20261005-12] 「unit_die 强化已派发」账本（与 `isDead` 解耦；见 utils/deathLedger.ts 头注释）
import { markUnitDieDispatched, hasUnitDieDispatched } from '../utils/deathLedger';
import { runRogueTrigger, commitSlicePatch, type RogueTriggerCtx, type Side } from '../logic/rogueTrigger'; // [2026-09-09 重构] 迷宫强化统一串行触发引擎（原 rogueBattle 分发已收编）
import { runSummonEntry } from '../logic/summonEntry'; // [2026-10-06 程拍板 · A 方案] 「入场」门铃唯一实现

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
// [2026-10-06 程拍板 · BUG修复] **等"这一段弹幕真正落地"**
//   ── 目的：HIT 的处理器（本文件 `handleStrikeHit`）才是**权威的伤害落点**（含破盾 / 坚韧结算，
//      且同时覆盖备战席与交战区）；等它跑完再往下走，回合末的"重读快照 + 整体覆盖式提交"
//      才不会把还没落地的伤害**抹掉**（实测症状：掉 1 滴血又加 1 滴血 / 16 发只落约 5 点）。
//
//   🔴 [2026-10-08 莉莉子 BUG修复 · AI 迟滞 N×8s] 原注释把时序写反了，此处更正 + 给出用法硬约束：
//      · `HIT`      在**每颗弹丸飞抵那一刻**发出（`SpellProjectile.tsx:510`，时间轴飞行段之后）
//      · `resolve()` 在时间轴 onComplete（`:479-484`）—— **比 HIT 还晚 1.0~1.2s**
//        （其后还有爆炸 0.35s + 空步 0.65s）
//      · `COMPLETE` 在 `await Promise.all(所有 flight)` 之后（`:586`）
//      ⇒ **全部 HIT 严格早于 COMPLETE**（原注释"COMPLETE 会早于伤害落地"与代码相反）。
//
//      ⚠️ 因此本函数**必须在 `emit(COMMAND)` 之前就挂好监听**。
//         若像原先那样"等完 COMPLETE 才调本函数"，本批 HIT 一颗都不剩 ⇒ `seen` 恒为 0
//         ⇒ **每次都白等满兜底**；而回合末有 N 个来源（基座 roundEndAttack / 乙型 random_barrage）
//         时**串行叠加** ⇒ 整段回合切换静止 N×8s（`phase` 全程 animating：
//         AI 冻结 + 玩家让过被跳过 + 倒计时暂停），N≥3 时还会越过 25s 的 animating 看门狗，
//         把仍在 await 的序列强行打断。
//   ── 兜底：正常路径下调用方 `await hitsPromise` 时它**早已 resolve**（HIT 早于 COMPLETE）⇒ 零额外延时；
//      兜底只在"HIT 永久缺失"（如 `fireAtTarget` 因目标 DOM 丢失而静默 resolve、不发 HIT）时生效，
//      故从 8000ms 收紧到 1200ms —— 那种情况等多久都不会来。兜底触发会打日志（自带取证）。
// ==========================================
const waitForHits = (count: number, timeoutMs: number = 1200): Promise<void> => {
    if (count <= 0) return Promise.resolve();
    return new Promise((resolve) => {
        let seen = 0;
        let done = false;
        const onHit = () => { seen++; if (seen >= count) finish(); };
        const finish = () => {
            if (done) return;
            done = true;
            eventBus.off(StrikeEvents.HIT, onHit);
            resolve();
        };
        // ⚠️ 注册顺序：`handleStrikeHit` 在挂载时（更早）注册 ⇒ 同一次 HIT 上它**先**跑
        //    ⇒ 计数达标时"伤害确实已经写进去了"。
        eventBus.on(StrikeEvents.HIT, onHit);
        setTimeout(() => {
            if (!done) {
                console.warn(
                    `[waitForHits] ⏱️ HIT 计数未到齐（${seen}/${count}），走 ${timeoutMs}ms 兜底放行` +
                    ` —— 频繁出现说明本批有弹丸被熔断（目标 DOM 丢失，见 SpellProjectile.tsx:427-431）`
                );
            }
            finish();
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
                    // [2026-09-29 程拍板] 不死之身：敌方水晶**免疫任何伤害** → 整段跳过（不扣血/不飘字/不发受击）
                    if (stateRef.current.game?.enemyNexusImmune) {
                        found = true;
                    } else {
                        // [2026-09-02 莉莉子 修复] 固若金汤水晶坚韧：直扣水晶伤害减 1，飘字 amount 同步实际伤害
                        const finalDmg = stateRef.current.game?.enemyNexusTough ? Math.max(0, damage - 1) : damage;
                        setGame(prev => ({ ...prev, enemyNexus: Math.max(0, prev.enemyNexus - finalDmg) }));
                        eventBus.emit(GameEvents.NEXUS_STRIKED, { target: 'enemy', amount: finalDmg });
                        found = true;
                    }
                } else if (targetId === 'nexus_player') {
                    if (stateRef.current.game?.playerNexusImmune) {
                        found = true;
                    } else {
                        const finalDmg = stateRef.current.game?.playerNexusTough ? Math.max(0, damage - 1) : damage;
                        setGame(prev => ({ ...prev, playerNexus: Math.max(0, prev.playerNexus - finalDmg) }));
                        eventBus.emit(GameEvents.NEXUS_STRIKED, { target: 'player', amount: finalDmg });
                        found = true;
                    }
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
                    // [2026-10-06 BUG-20261006-01] 交战区那份也要贴值 ——
                    //   猫汐尔**本人正在进攻/格挡**时她就在交战区，旧实现从不扫这里 ⇒ 这笔进度永久丢失
                    setCombatField(prev => applyMauxirProgressToField(prev) ?? prev);
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
				const power = getPower(p);
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
                    // [2026-10-06 自审/审查修复] `currentHand` **与 `currentBench` 都改 `let`**：
                    //   下面"库效门铃"会回写这两个数组，必须**同步把本别名指向新数组** ——
                    //   否则后续迭代会把"备战席满→退手牌"的兜底写进**孤儿数组**（身份一变别名就失效）。
                    let currentHand = owner === 'player' ? tempPHand : tempEHand;
                    let currentBench = owner === 'player' ? tempPBench : tempEBench;
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
                                // =====================================
                                // [2026-10-06 程拍板 · A 方案] 库效召唤补「入场」门铃
                                // ── 症状（程实测）：猫汐尔迷宫**开局只显示 2 点法力**（应为 3：基础1+潮汐1+莲脉1），
                                //    实测日志里**连一行 `[莲脉增殖]` 都没有**。
                                // ── 根因：库效召唤是**直建直塞**（`createFullCard` + `push`）⇒ **从不派发 `on_summon`**
                                //    ⇒ 神格③「莲脉增殖」（每召唤 1 个召唤衍生物 → 本场永久最大法力 +1）从不计数。
                                // ── 修法：调**唯一实现** `runSummonEntry`（`logic/summonEntry.ts`）——
                                //    只放行「入场」/`on_summon`，**不发**「打出时」与 `on_play_unit`（库效召唤**不是**打出）。
                                // ⚠️ 回写后**同步别名**（`currentBench` / `currentHand`）—— 见上方声明处说明。
                                // =====================================
                                const entry = runSummonEntry(cardWithAbility.id, owner, {
                                    game: tempGame,
                                    playerBench: tempPBench,
                                    enemyBench: tempEBench,
                                    playerHand: tempPHand,
                                    enemyHand: tempEHand,
                                    playerDeck: stateRef.current.playerDeck,
                                    enemyDeck: stateRef.current.enemyDeck,
                                    combatField: stateRef.current.combatField,
                                }, createFullCard);
                                if (entry.applied) {
                                    tempGame = entry.game;
                                    tempPBench = entry.playerBench;
                                    tempEBench = entry.enemyBench;
                                    tempPHand = entry.playerHand;
                                    tempEHand = entry.enemyHand;
                                    currentBench = owner === 'player' ? tempPBench : tempEBench;
                                    currentHand = owner === 'player' ? tempPHand : tempEHand;
                                    // [2026-10-06 独立审查修复 · P1] **只在真的变了时才值式提交** ——
                                    //   门铃返回的切片取自 `stateRef` 快照，无条件提交会回滚同 tick 排队中的更新
                                    if (entry.playerDeck && entry.playerDeck !== stateRef.current.playerDeck) setPlayerDeck(entry.playerDeck);
                                    if (entry.enemyDeck && entry.enemyDeck !== stateRef.current.enemyDeck) setEnemyDeckState(entry.enemyDeck);
                                    if (entry.combatField && entry.combatField !== stateRef.current.combatField) setCombatField(entry.combatField);
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
                                    relayEffectEvents(res.events); // [2026-09-19] 同上（此前这里只转发了 nexus_damage）
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

                // =====================================
                // [2026-09-18 1.0.16 茉莉安] 【库效】每回合开始：敌方备战席缺「獠牙信标」则补一个
                // ── 与 scanAndApply 的分工：库效扫的是【手牌 + 牌库】（茉莉安不在场也生效），
                //    scanAndApply 只扫【备战席】上真正在场的单位
                // ── 判重天然成立：落点已有同名单位 → 跳过，正好就是「若没有则召唤一个」
                // ── ⚠️ 必须排在 scanAndApply 之前：先补 → 再让在场的茉莉安打伤害（先补后打）
                // =====================================
                // [2026-10-04 程拍板] 「回合开始兜底」：茉莉安的对面场上没有信标 → 补一个
                //
                // ── 为什么加回来（**本次明确推翻两条旧口径**，程 2026-10-04）：
                //    · 10-02「信标亡语化后不做回合开始兜底」← 程：「我们上述的多个做法还是会在
                //      某些情况下造成信标的断链，故我们还是调整一下」
                //    · 09-19 T38「仅 Lv2 才每回合补」← 本次改为**等级无关**
                //    ⇒ 兜底优先于"信标是限量资源"的设计洁癖：**宁可白给，不可断链**。
                //
                // ── 口径（程 2026-10-04 拍板）：
                //    · **等级无关**：Lv1 也补（与 10-02「重生光环下放 Lv1」同口径）
                //    · **只要她还在牌局**（手牌 / 牌库 / 备战席 / 交战区任一 = 尚未阵亡）即可，不要求在场
                //    · 落点 = 茉莉安的**对面**备战席（沿用 gameStartSummonSide: 'opponent'）
                //    · **对面场上（备战席 + 交战区）已有存活信标 → 不补**
                //    · **对面备战席已满 → 不补**（程：「统一做一件事」—— 与 effectProcessor 的
                //      `summonOnlyIfAbsent` 满员口径**完全一致**）
                //
                // ── ⚠️ 两个必须守住的实现细节：
                //    1. 存在性判定走 `hasLiveUnitOfSide`（**唯一出口**，含交战区）—— 自己再写一份
                //       就会重演"同一语义多处实现 ⇒ 必漏一处"（09-23 / 09-27 两次事故都是这么来的）
                //    2. **必须置 `hasEffectTriggered = true`**：本段直接改 `temp*Bench` 局部数组，
                //       不置旗 ⇒ 末尾写回分支走 else，**补了等于白补**
                //       （旧 `scanLibrarySummon` 就没置旗，是个埋了很久的隐患）
                // =====================================
                const BEACON_KEY = 'Marian_Wolf_Tooth_Beacon';
                const isLiveMarianCard = (c?: CardData | null): boolean =>
                    !!c && c.key === 'marian' && !c.isDead
                    && c.animState !== 'dying' && c.animState !== 'ephemeral_dying';

                const scanBeaconFallback = (side: 'player' | 'enemy') => {
                    // ① 她还在牌局吗？（手牌 / 牌库 / 备战席 / 交战区）
                    const hand = side === 'player' ? tempPHand : tempEHand;
                    const deck = side === 'player' ? stateRef.current.playerDeck : stateRef.current.enemyDeck;
                    const ownBench = side === 'player' ? tempPBench : tempEBench;
                    const onField = (stateRef.current.combatField || []).some((f: any) => {
                        if (!f) return false;
                        const atkSide: 'player' | 'enemy' = f.owner;
                        const blkSide: 'player' | 'enemy' = f.owner === 'player' ? 'enemy' : 'player';
                        return (atkSide === side && isLiveMarianCard(f.attacker))
                            || (blkSide === side && isLiveMarianCard(f.blocker));
                    });
                    if (!onField && ![...(hand || []), ...(deck || []), ...ownBench].some(isLiveMarianCard)) return;

                    // ② 落点 = 她的对面；已有存活信标 → 不补（含交战区）
                    const landSide: 'player' | 'enemy' = side === 'player' ? 'enemy' : 'player';
                    if (hasLiveUnitOfSide(landSide, tempPBench, tempEBench, stateRef.current.combatField, BEACON_KEY)) return;

                    // ③ 备战席已满 → 不补（与 SUMMON 分支的 summonOnlyIfAbsent 同口径）
                    const landBench = landSide === 'player' ? tempPBench : tempEBench;
                    if (landBench.length >= 6) {
                        console.log(`[BeaconFallback] ${landSide} 备战席已满（${landBench.length}/6），回合兜底跳过`);
                        return;
                    }

                    // ④ 落场：走公共装配器（虹彩上限修正）+ **盖归属戳**
                    //    （09-19 起 SUMMON 分支的标准做法；旧补兵扫描没盖章，靠"倒在敌方 ⇒ 玩家召唤"反推 ——
                    //      `-13` 里"找错边就不贴亡语"的风险正出在这个推论上）
                    const unit = assembleBeaconCard(createFullCard(BEACON_KEY), tempGame.beaconMaxHealthMod);
                    unit.unitOwner = landSide;
                    const wrapped = { ...unit, animState: 'summoning' as const };
                    if (landSide === 'player') tempPBench = [...tempPBench, wrapped];
                    else tempEBench = [...tempEBench, wrapped];
                    eventBus.emit(GameEvents.SFX_SUMMON);
                    hasEffectTriggered = true; // ⚠️ 不置旗 = 白补（见上方说明）
                    // [2026-10-06 程拍板 · A 方案] 兜底补出来的信标同样是"召唤到战场" ⇒ 补响「入场」门铃
                    //   （信标自身无入场效果，但 `on_summon` 类强化应当看见它）
                    const entry = runSummonEntry(wrapped.id, landSide, {
                        game: tempGame,
                        playerBench: tempPBench,
                        enemyBench: tempEBench,
                        playerHand: tempPHand,
                        enemyHand: tempEHand,
                        playerDeck: stateRef.current.playerDeck,
                        enemyDeck: stateRef.current.enemyDeck,
                        combatField: stateRef.current.combatField,
                    }, createFullCard);
                    if (entry.applied) {
                        tempGame = entry.game;
                        tempPBench = entry.playerBench;
                        tempEBench = entry.enemyBench;
                        tempPHand = entry.playerHand;
                        tempEHand = entry.enemyHand;
                        // [2026-10-06 独立审查修复 · P1] 同上：只在真的变了时才值式提交
                        if (entry.playerDeck && entry.playerDeck !== stateRef.current.playerDeck) setPlayerDeck(entry.playerDeck);
                        if (entry.enemyDeck && entry.enemyDeck !== stateRef.current.enemyDeck) setEnemyDeckState(entry.enemyDeck);
                        if (entry.combatField && entry.combatField !== stateRef.current.combatField) setCombatField(entry.combatField);
                    }
                    console.log(`[BeaconFallback] 回合开始兜底：为 ${landSide} 补一个「${BEACON_KEY}」`);
                };
                scanBeaconFallback('player');
                scanBeaconFallback('enemy');

                scanAndApply(tempPBench, 'player');
                scanAndApply(tempEBench, 'enemy');

                // [安卡希雅] 块 B: 获得进攻标识时触发 (ON_GET_ATTACK_TOKEN)
                // 扫描当前回合持有进攻标识的阵营的单位
                // [2026-09-03 莉莉子 双剑兼容] 由"只取一侧"改为"对当前所有持剑方分别扫描"：
                // 敌我双持 rally 剑（双方 attackToken 同时非 null）时，不再跳过另一侧的
                // ON_GET_ATTACK_TOKEN 词条单位。去重核验：回合初的 rally 在 useGameState 的
                // normal→rally 升级检测器（prev===null 不触发）不会重复触发本扫描。
                const tokenOwners: ('player' | 'enemy')[] = [];
                if (tempGame.attackToken.player) tokenOwners.push('player');
                if (tempGame.attackToken.enemy) tokenOwners.push('enemy');
                tokenOwners.forEach(attackTokenOwner => {
                    // [2026-10-06 程拍板 · 序号去重 · 分工] **rally 那一类整块让给回合内检测器**（它按授予账本派发）：
                    //   块 B 只负责回合轮换发的 `normal` —— 那一份不产生授予序号。
                    //   ∵ 块 B 是在 **+100ms 定时器里读「实时」状态**（边界不是提交批次）⇒
                    //     若它也管 rally，落在窗口里的授予会与检测器**各发一次**（双发 = 安卡白拿两张月轮）。
                    //   两边**覆盖集合互斥** ⇒ 天然"一次授予 = 一次派发"，块 B 无需写任何标记。
                    if (tempGame.attackToken[attackTokenOwner] === 'rally') return;
                    // [2026-10-06 程拍板 · 新增强化「霜锋乘势」] 本块改用**唯一入口** `processOnGetAttackToken`：
                    //   它同时负责 ①卡牌自身的 `ON_GET_ATTACK_TOKEN` ②迷宫强化的 `on_get_attack_token`。
                    //   （回合内的授予账本检测器走的是**同一个函数** ⇒ 两个派发点不再各写一份判据。）
                    const res = processOnGetAttackToken(attackTokenOwner, {
                        game: tempGame,
                        playerBench: tempPBench,
                        enemyBench: tempEBench,
                        playerHand: tempPHand,
                        enemyHand: tempEHand,
                        playerDeck: stateRef.current.playerDeck,
                        enemyDeck: stateRef.current.enemyDeck,
                        combatField: stateRef.current.combatField,
                        createFullCard,
                    });
                    const fieldChanged = (res.combatField ?? null) !== (stateRef.current.combatField ?? null);
                    const deckChanged = res.playerDeck !== stateRef.current.playerDeck || res.enemyDeck !== stateRef.current.enemyDeck;
                    const changed = res.game !== tempGame
                        || res.playerBench !== tempPBench || res.enemyBench !== tempEBench
                        || res.playerHand !== tempPHand || res.enemyHand !== tempEHand
                        || fieldChanged || deckChanged
                        // [2026-10-06 独立审查修复 · 硬 BUG] **必须并入 `res.applied`** ——
                        //   rogue handler 走 `updateUnitById` 是**就地改元素**（数组身份不变）⇒
                        //   只靠身份比较会判成"没变化" ⇒ `hasEffectTriggered` 不置旗 ⇒ 提交分支被跳过
                        //   ⇒ 冻结/etc 只改在**局部副本**上被静默丢弃（图标还闪，玩家看得见却不生效）。
                        || res.applied;
                    tempGame = res.game;
                    tempPBench = res.playerBench;
                    tempEBench = res.enemyBench;
                    tempPHand = res.playerHand;
                    tempEHand = res.enemyHand;
                    if (fieldChanged && res.combatField) setCombatField(res.combatField);
                    if (res.playerDeck && res.playerDeck !== stateRef.current.playerDeck) setPlayerDeck(res.playerDeck);
                    if (res.enemyDeck && res.enemyDeck !== stateRef.current.enemyDeck) setEnemyDeckState(res.enemyDeck);
                    // ⚠️ 只在**真的有变化**时置旗：否则会吃掉下方的"第 N 回合开始"提示
                    if (changed) hasEffectTriggered = true;
                });

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
    // [2026-08-31 莉莉子 修复] round_start 强化同回合去重：换牌后 triggerFirstRoundRogueEnhance 与每回合 startRound 可能叠加触发（useGameAnnouncer 的 drawCards 复用于换牌/每回合抽卡），记录最后触发过的 round，同 round 跳过，防重复生成暗箭
    const lastRoundStartEnhRef = useRef(-1);
    // [2026-08-15 莉莉子] 迷宫强化 round_start：回合开始被动（暗箭难防生成 / 战意盎然备战）
    // 抽成独立函数，供 startRound（每回合）与换牌后第一回合触发（triggerFirstRoundRogueEnhance）共用
    const runRoundStartRogueEnhancements = useCallback((
        queryGame: GameState,
        targetGame: GameState,
        // [2026-09-09 重构] startRound 已算出的新回合切片（final benches / restoreSpell19Cost 后的手牌），
        // 作为 handler 的工作快照，避免 handler 读到 stateRef 旧值、commit 时洗掉 startRound 刚写的状态
        seeds?: { playerBench?: CardData[]; enemyBench?: CardData[]; playerHand?: CardData[]; enemyHand?: CardData[] },
    ): GameState => {
        // [2026-08-31 莉莉子 修复] 同回合去重须按 targetGame.round（目标回合）判断：startRound 的 queryGame 仍是旧回合（round=N），targetGame 才是新回合（round=N+1）；
        // 用 queryGame.round 会把第二回合 startRound 误判成第一回合重复（queryGame.round=1 === ref=1）→ 吞掉第二回合暗箭
        if (targetGame.round === lastRoundStartEnhRef.current) return targetGame;
        lastRoundStartEnhRef.current = targetGame.round;

        // [2026-09-09 莉莉子 重构] 统一串行触发引擎：玩家+敌方 round_start 强化在同一份可变工作快照上按 priority 串行触发。
        // 后一个 effect 实时读到前一个的效果（寒霜先冻结 → 衰弱重判到"当前最强"）；闪烁按执行序逐个 flash。
        // [2026-09-09 莉莉子 修复·快速开局抽卡回归] seed 可能滞后于并发抽卡（快速模式 instantDrawCards 排队后同 tick 触发），
        // 手牌/牌库一律走补丁式提交（commitSlicePatch），只改引擎动过的卡、保留 prev 里刚排队的抽卡；bench/field 无并发排队故仍全量。
        const playerHandSeed = (seeds?.playerHand ?? stateRef.current.playerHand);
        const enemyHandSeed = (seeds?.enemyHand ?? stateRef.current.enemyHand);
        const playerDeckSeed = [...stateRef.current.playerDeck];
        const enemyDeckSeed = [...stateRef.current.enemyDeck];
        const ctx: RogueTriggerCtx = {
            game: targetGame,
            playerBench: (seeds?.playerBench ?? stateRef.current.playerBench).slice(),
            enemyBench: (seeds?.enemyBench ?? stateRef.current.enemyBench).slice(),
            combatField: [...stateRef.current.combatField],
            playerHand: playerHandSeed.slice(),
            enemyHand: enemyHandSeed.slice(),
            playerDeck: playerDeckSeed.slice(),
            enemyDeck: enemyDeckSeed.slice(),
            owner: 'player',
            trigger: 'round_start',
            createFullCard,
            info: {},
            dirty: { bench: new Set<Side>(), hand: new Set<Side>(), deck: new Set<Side>(), field: false, game: false },
        };
        ctx.owner = 'player';
        runRogueTrigger(ctx, queryGame.rogueEnhancements, 'round_start'); // 玩家强化
        ctx.owner = 'enemy';
        runRogueTrigger(ctx, queryGame.enemyEnhancements, 'round_start'); // 敌方强化

        // 一次性提交脏切片（无变化切片不 commit，防洗掉 startRound 刚写入的状态；hand/deck 用补丁式保并发抽卡）
        if (ctx.dirty.bench.has('player')) setPlayerBench(ctx.playerBench);
        if (ctx.dirty.bench.has('enemy')) setEnemyBench(ctx.enemyBench);
        if (ctx.dirty.field) setCombatField(ctx.combatField as any);
        if (ctx.dirty.hand.has('player')) commitSlicePatch(playerHandSeed, ctx.playerHand, fn => setPlayerHand(fn));
        if (ctx.dirty.hand.has('enemy')) commitSlicePatch(enemyHandSeed, ctx.enemyHand, fn => setEnemyHand(fn));
        if (ctx.dirty.deck.has('player')) commitSlicePatch(playerDeckSeed, ctx.playerDeck, fn => setPlayerDeck(fn));
        if (ctx.dirty.deck.has('enemy')) commitSlicePatch(enemyDeckSeed, ctx.enemyDeck, fn => setEnemyDeckState(fn));

        // game 级变化（备战/坚韧/回血/暗影标志…）随返回值交给 startRound 的 setGame；无变化保持 identity，兼容首回合 merge 判定
        return ctx.dirty.game ? ctx.game : targetGame;
    }, [createFullCard, setPlayerBench, setEnemyBench, setCombatField, setPlayerHand, setEnemyHand, setPlayerDeck, setEnemyDeckState, stateRef]);

    // [2026-08-15 莉莉子] 换牌结束后第一回合开始：触发 round_start 强化（暗箭等）
    // 参考安卡库效 triggerGameStartGenerate 在换牌后执行的修复——开局 startRound 会跳过强化，由本函数在换牌后补触发
    const triggerFirstRoundRogueEnhance = useCallback(() => {
        const current = stateRef.current.game;
        const next = runRoundStartRogueEnhancements(current, current);
        if (next !== current) {
            // [2026-09-01 莉莉子 修复·烧绳根因防御] next 可能基于旧快照（drawCards 里 428 setGame(main) 刚入队、stateRef 仍 animating），
            // 整体 setGame(next) 会把 phase 从 main 打回 animating → 主按钮卡"..."。改为函数式合并：
            // 仅应用 next 相对 current 的变化字段，phase 永远以最新 prev 为准（任何时机调用都不覆盖 phase）。
            setGame(prev => {
                const changes: Record<string, unknown> = {};
                Object.keys(next).forEach(k => {
                    if (k !== 'phase' && (next as any)[k] !== (current as any)[k]) changes[k] = (next as any)[k];
                });
                return { ...prev, ...changes } as GameState;
            });
        }
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
        // [2026-10-03 莉莉子 · 进攻标识三层分离 ①] 先手方直接传给规则层算 parity
        const nextRoundBase = calculateRoundStart(currentGameState, firstAttacker);

        // [2026-07-31 安卡希雅] 若安卡已升级，每回合开始同步手牌+牌库法术（残留剑舞→重锋、安卡副本→Lv2）
        // [2026-10-04 莉莉子 BUG修复 · I5] 判据改**按方**：这段只改**玩家**的手牌/牌库，
        //   原先读全局 `leveledChampions` ⇒ 镜像对局里"敌方安卡升级"也会把我方手牌换成重锋（跨侧泄漏）
        if (isLeveledUpForSide(currentGameState, 'player', 'acacia_chrono_echo')) {
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

        // ==========================================
        // [2026-10-06 莉莉子 BUG修复 · BUG-20261006-01] 回合开始：猫汐尔进度**全域兜底贴值**
        // ── 真源 = 模块级账本（见 utils/mauxirProgress.ts 头注释），卡上的 `mauxirDamage` 只是**显示镜像**。
        //    每回合开始把四个区域（备战席 / 手牌 / 牌库 / 交战区）各贴一遍 ⇒
        //    即便某处镜像曾被"整数组写回"盖掉，也在此**自愈** —— 绝不永久丢进度。
        // ── ⚠️ 牌库那一份**必须提交**：牌库面板与左侧进度弹窗读的就是它
        //    （与茉莉安 2026-09-19 那次"牌库副本写完就丢"的教训同源）。
        // ==========================================
        setPlayerBench(prev => applyMauxirProgress(prev, 'player') as CardData[]);
        setEnemyBench(prev => applyMauxirProgress(prev, 'enemy') as CardData[]);
        setPlayerHand(prev => applyMauxirProgress(prev, 'player') as CardData[]);
        setEnemyHand(prev => applyMauxirProgress(prev, 'enemy') as CardData[]);
        setPlayerDeck(prev => applyMauxirProgress(prev, 'player') as CardData[]);
        setEnemyDeckState(prev => applyMauxirProgress(prev, 'enemy') as CardData[]);
        setCombatField(prev => applyMauxirProgressToField(prev) ?? prev);

        // 清理屏障及其黯淡标记、数值账本、词条账本、打击次数账本
        const clearRoundBuffsAndBarrier = (cards: CardData[]) => cards.map(c => {
            const nextCard = { ...c };

            if (nextCard.keywords.includes('Barrier')) {
                nextCard.keywords = nextCard.keywords.filter(k => k !== 'Barrier');
                if (nextCard.depletedKeywords?.includes('Barrier')) {
                    nextCard.depletedKeywords = nextCard.depletedKeywords.filter(k => k !== 'Barrier');
                }
            }

            // ==========================================
            // [2026-09-22 莉莉子 BUG修复] 临时生命到期前，先冲销「已经被伤害吃掉」的那部分欠条
            // 病根：伤害统一记在 damageTaken 欠条上，有效血量 = health + buffs.health + roundBuffs.health − damageTaken。
            //   这里原本直接清零 roundBuffs.health、却不减 damageTaken ⇒ 本回合加的血一旦到期，
            //   同一笔伤害会「二次」落到基础血上：
            //     3/2 单位吃「迂回防守」+0/+3 → 3/5，单挑挨 3 伤 → 有效 2（= 3/2，本就正确）；
            //     回合开始清掉 +3 临时血 → 有效 = 2 + 0 − 3 = −1 ⇒ 单位凭空死亡。
            // 冲销量取 min(临时血, 已受伤)：临时血被吃光 → 伤害全额冲销；没吃光 → 剩余临时血正常到期消失。
            // ⚠️ 任何伤害来源（普通战斗 / 法术 / 单挑）都走同一套 damageTaken 记账，故此缺陷与伤害类型无关，
            //    并非「单挑」独有 —— 只是程这次恰好用单挑触发。
            // ==========================================
            if (nextCard.roundBuffs) {
                const roundHealth = nextCard.roundBuffs.health || 0;
                const taken = nextCard.damageTaken || 0;
                if (roundHealth > 0 && taken > 0) {
                    nextCard.damageTaken = Math.max(0, taken - Math.min(roundHealth, taken));
                }
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

        let tempGame: GameState = {
            ...currentGameState,
            ...nextRoundBase,
            phase: nextRoundBase.phase as GameState['phase'], // [2026-08-27] 标注 GameState 后 nextRoundBase.phase 推断为 string，显式收窄
            // [2026-08-14 武装] 秘法回响：回合开始恢复法术法力
            // [2026-09-25 莉莉子 强化线] 上限不再写死 3 —— 交给 spellManaCapOf（共鸣涌流成长 / 囤积提额）
            // ✅ [2026-10-06 程拍板] **回满上限**（"恢复全部"就该是全部）：上限 3 时行为与旧版一致；
            //   上限被共鸣涌流/囤积抬到 6~9 时，也真的回满（此前无条件写死 3 ⇒ 既补不满、还会把现值压低）。
            playerSpellMana: armamentManaRestore
                ? spellManaCapOf(currentGameState)
                : Math.min(spellManaCapOf(currentGameState), (nextRoundBase.playerSpellMana || 0) + channelManaPlayer),
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
        // [2026-10-08 莉莉子 · 法术专属装备 第二波] **本回合施法计数清零**
        //   （活页夹页"本回合尚未打出过法术"的判据；「本场」累计保留）
        resetSpellCastRoundCounters();

        // [2026-10-03 莉莉子 · 进攻标识三层分离 ①] 原来这里有一段「敌方先攻 ⇒ 交换 attackToken + turnOwner」的补偿，
        //   现已在 `calculateRoundStart(game, firstAttacker)` 里按「先手方占奇数回合」**直接算清** ⇒ 补偿删除，
        //   **进攻标识从此只有一个坐标系**（任何绕过 startRound 的写入都不会再"错位"）。
        // [2026-07-29 安卡希雅] 回合开始重置飞剑回合标记
        tempGame.playerRoundSwordUsed = false;
        tempGame.enemyRoundSwordUsed = false;

        // [2026-08-31 莉莉子 修复] 先写入新回合备战席再触发 round_start 强化：避免 runRoundStartRogueEnhancements 的 buff 被随后的 setPlayerBench(finalPlayerBench) 覆盖
        // （回合加护"没触发"根因——finalPlayerBench 在 buff 之前基于旧备战席计算，末尾写入会把 buff 洗掉）
        setPlayerBench(finalPlayerBench);
        setEnemyBench(finalEnemyBench);

        // [2026-08-11 莉莉子] 迷宫强化 round_start：回合开始被动（暗箭难防生成 / 战意盎然备战）
        // [2026-08-15 莉莉子] 开局（换牌前）跳过：第一回合强化由 triggerFirstRoundRogueEnhance 在换牌后触发（参考安卡库效修复）
        // [2026-09-09 重构] 传入新回合工作切片：handler 读 final benches（已清屏障/清 roundBuffs）而非旧 stateRef
        if (!skipRoundStartEnhance) {
            tempGame = runRoundStartRogueEnhancements(currentGameState, tempGame, {
                playerBench: finalPlayerBench,
                enemyBench: finalEnemyBench,
                playerHand: restoreSpell19Cost(stateRef.current.playerHand),
                enemyHand: restoreSpell19Cost(stateRef.current.enemyHand),
            });
        }
        // [2026-08-11 莉莉子] 重置暗影双生「每回合首次」标志
        // [2026-10-06 程拍板 · 模式 B] 按方重置（两个账本各自清）：回合开始，双方各自的"首个打出单位"时机都回来了
        tempGame = { ...tempGame, rogueFirstSummonDone: { player: false, enemy: false } };

        setGame(tempGame as GameState);
    };

    // ---------------------------------------------------------
    // 块 B: 回合末综合清算序列 (幻象/鞭策/基座扫射/脉冲)
    // ---------------------------------------------------------

    // [2026-09-03 莉莉子 死锁逃生] 交战区幸存者归位安全网（回合末清理用）
    // 正常路径交战区已被 resolveCombatAnimation 清空 → no-op；异常/残留时把存活交战单位放回备战席，
    // 防止带残留单位开新回合导致跨回合卡场。
    const reconcileLeftoverCombatSurvivors = () => {
        const ref = stateRef.current;
        if (!ref.combatField || ref.combatField.length === 0) return;
        recoverCombatSurvivors(ref.combatField, ref.playerBench, ref.enemyBench, {
            setPlayerBench, setEnemyBench, setCombatField, setGame,
        });
    };

    const executeRoundEndSequenceInner = async () => {
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

        // [2026-08-27] 迷宫强化 round_end（王见王 / 回旋余力）
        // [2026-09-09 莉莉子 重构] 收编进统一串行触发引擎：玩家+敌方 round_end 强化在同一份工作快照（nextXxx）上串行触发。
        // 王见王由 DUEL_STRONGEST handler 经 ctx.info.duelDone 跨双方去重（先到先执行）；回旋余力 RANDOM_ALLY_BUFF 各自侧触发。
        // handler 全部在 ctx 数组（即 nextXxx）原地改写 + 提交，杜绝"旧 stateRef 覆盖局部 buff"的 2026-09-01 修复场景。
        {
            const ctx: RogueTriggerCtx = {
                game: { ...stateRef.current.game },
                playerBench: nextPlayerBench,
                enemyBench: nextEnemyBench,
                combatField: nextCombatField,
                playerHand: [],
                enemyHand: [],
                playerDeck: [],
                enemyDeck: [],
                owner: 'player',
                trigger: 'round_end',
                createFullCard,
                info: {},
                dirty: { bench: new Set<Side>(), hand: new Set<Side>(), deck: new Set<Side>(), field: false, game: false },
            };
            ctx.owner = 'player';
            runRogueTrigger(ctx, stateRef.current.game.rogueEnhancements, 'round_end'); // 玩家强化（王见王/回旋余力）
            ctx.owner = 'enemy';
            runRogueTrigger(ctx, stateRef.current.game.enemyEnhancements, 'round_end'); // 敌方强化
            // 同步局部变量引用（ctx 数组即 nextXxx 本体，handler 已原地改写元素对象）
            nextPlayerBench = ctx.playerBench;
            nextEnemyBench = ctx.enemyBench;
            nextCombatField = ctx.combatField;
            // 一次性提交（对齐旧"函数式写 state + 更新局部变量"双保险）
            if (ctx.dirty.bench.has('player')) setPlayerBench(nextPlayerBench);
            if (ctx.dirty.bench.has('enemy')) setEnemyBench(nextEnemyBench);
            if (ctx.dirty.field) setCombatField(nextCombatField);
            // 王见王碾压溢出水晶伤害（engine 已在 ctx.game 副本上扣减）写回，仅动 nexus 两字段
            if (ctx.dirty.game) {
                const gNexus = ctx.game;
                setGame(prev => ({ ...prev, enemyNexus: gNexus.enemyNexus, playerNexus: gNexus.playerNexus }));
            }
        }

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
                    // [2026-09-15 莉莉子 BUG修复] 与上方「回合末光环」分支互斥，防同回合重复结算。
                    // 清泉医疗鳄的 def 同时带 timing:'ROUND_END' 与 params.roundEndBuff:true → 两个并列 if 都命中，
                    // processEffect 被调用两次 → selfDamage:1 结算两遍 → 「每回合直接 -2 血自杀」。
                    // 两条分支语义不同，不可叠加：roundEndBuff = 每回合重复触发且不摘除效果；
                    // 本分支 = 一次性触发后摘除（见下方 removeEffect）。
                    if (def && def.timing.includes('ROUND_END') && !def.params?.roundEndBuff) {
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
                    const power = getPower(unit);

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

                    // 🔴 [2026-10-08 莉莉子 BUG修复 · AI 迟滞 N×8s] **必须先挂监听、再发射**：
                    //    HIT 在每颗弹丸飞抵时发，COMPLETE 在**所有弹丸播完之后**才发
                    //    ⇒ 若等完 COMPLETE 才挂 HIT 监听，本批 HIT 早已发完、计数永远到不了，
                    //      每个来源白等满兜底（原 8s），N 个来源串行叠加。
                    const hitsPromise = waitForHits(bullets.length);

                    // [核心重构] 发射后不管！把包裹集装箱甩给前台武器库！
                    eventBus.emit(StrikeEvents.COMMAND, {
                        sourceId: unit.id,
                        bullets,
                        interval: 100,
                        spellKey: unit.key
                    });

                    // 释放总控线程！静静欣赏武器库清空弹夹的华丽演出。
                    await waitForStrikeComplete();
                    // [2026-10-06 程拍板 · BUG修复] **再等这一段真正落地**（HIT 计数到齐）——
                    //   原先只等 COMPLETE 就往下走，调用方 `wait(50)` 后重读快照做死亡判定与整体提交
                    //   ⇒ 还没落地的弹丸伤害被那次重写抹掉（实测：16 发只落约 5 点、2 血芬妮掉 1 又回 1）。
                    //   [2026-10-08] 监听已提前到上面挂好，此处只是 await 它（正常路径届时已 resolve ⇒ 零延时）。
                    await hitsPromise;

                    // [2026-10-08 莉莉子 · 对局记录补齐] **能力效果入库**
                    //   ── 病根：记录系统是"操作驱动"的（埋点全挂在"有人点了什么"处），而基座/带 roundEndAttack
                    //      单位的回合末扫射走弹道、伤害由 `handleStrikeHit` 写 —— 全程没有"操作"
                    //      ⇒ 此前**完全不进对局记录**（基座伤害出问题时无从回查）。
                    //   ── 口径：按**一次结算**记 1 条（不是每发一条！16 发会刷满整个面板）；
                    //      entities 只放**来源卡自己** ⇒ 命中 RecordPanel 的"单卡记录"分支，能显示基座卡面。
                    //   ⚠️ 伤害数字取自**预演值** `bullets[].damage`（生成弹丸时就算好，已含破盾 / 坚韧减伤）；
                    //      HIT 处理器**不会回写它** ⇒ 与最终落地的真实伤害在**边界情况**（如水晶免疫）可能略有出入。
                    //      本记录只作**回查用途**、不参与任何结算。放在 `await hitsPromise` 之后，
                    //      是为了让"记录"排在"结算"之后 —— 顺序与玩家看到的先后一致。
                    {
                        const totalDmg = bullets.reduce((s, b) => s + b.damage, 0);
                        const targetIds = Array.from(new Set(bullets.map(b => b.targetId)));
                        recordAction('ability_effect', owner, `${unit.name} · 回合末扫射`, {
                            cardKey: unit.key,
                            detail: `${bullets.length} 发 · 共 ${totalDmg} 点 → ${targetIds.length} 个目标`
                                + (nexusDamageAccumulator > 0 ? `（含水晶 ${nexusDamageAccumulator} 点）` : ''),
                            entities: [{ cardKey: unit.key, owner, snapshot: captureSnapshot(unit) }],
                        });
                    }

                    // [新增] 统一清算水晶受损！
                    // 等待子弹全部落地后，将刚才预演中累积的水晶伤害直接写入引擎，并呼叫震屏与飘字反馈。
                    // [2026-09-29 程拍板] 不死之身：目标水晶免疫伤害 → 整段跳过
                    const scImmune = owner === 'player' ? !!stateRef.current.game?.enemyNexusImmune : !!stateRef.current.game?.playerNexusImmune;
                    if (nexusDamageAccumulator > 0 && !scImmune) {
                        const targetNexusId = owner === 'player' ? 'nexus_enemy' : 'nexus_player';
                        // [2026-09-02 莉莉子 修复] 固若金汤水晶坚韧：弹夹扫射累积打水晶减 1，飘字 amount 同步实际伤害
                        const isScTough = owner === 'player' ? !!stateRef.current.game?.enemyNexusTough : !!stateRef.current.game?.playerNexusTough;
                        const finalScDmg = isScTough ? Math.max(0, nexusDamageAccumulator - 1) : nexusDamageAccumulator;
                        setGame(prev => ({
                            ...prev,
                            ...(owner === 'player'
                                ? { enemyNexus: Math.max(0, prev.enemyNexus - finalScDmg) }
                                : { playerNexus: Math.max(0, prev.playerNexus - finalScDmg) })
                        }));
                        // 发射震动与飘字事件，触发 UI 层的受击反馈
                        eventBus.emit('unit_damage', { id: targetNexusId, amount: finalScDmg });
                        eventBus.emit(GameEvents.NEXUS_STRIKED, { target: owner === 'player' ? 'enemy' : 'player', amount: finalScDmg });
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
            // [2026-10-05 莉莉子 BUG修复 · 20261005-12 · **第二轮审查抓到的"复印件丢账本"反例**]
            //   `{ ...c }` 会造新对象，而「unit_die 已派发」账本是按**对象身份**记的 ⇒ 标记跟着丢
            //   ⇒ 同一次死亡会被再派发一次（这一处**在关键路径上**：回合末给交战区幻象盖死亡态）。
            //   尸体本来就已经是 dying/ephemeral_dying ⇒ 对它是纯 no-op ⇒ **跳过克隆**即可（活体行为零变化）。
            const isCorpse = (c: CardData | null | undefined): boolean =>
                !!c && (!!c.isDead || c.animState === 'dying' || c.animState === 'ephemeral_dying');
            if (newFight.attacker && !isCorpse(newFight.attacker)) {
                if (newFight.attacker.keywords.includes('Ephemeral')) newFight.attacker = { ...newFight.attacker, animState: 'ephemeral_dying' };
                else if (getCurrentHP(newFight.attacker) <= 0) newFight.attacker = { ...newFight.attacker, animState: 'dying' };
            }
            if (newFight.attacker && (newFight.attacker.animState === 'dying' || newFight.attacker.animState === 'ephemeral_dying')) hasCombatDeath = true;
            if (newFight.blocker && !isCorpse(newFight.blocker)) {
                if (newFight.blocker.keywords.includes('Ephemeral')) newFight.blocker = { ...newFight.blocker, animState: 'ephemeral_dying' };
                else if (getCurrentHP(newFight.blocker) <= 0) newFight.blocker = { ...newFight.blocker, animState: 'dying' };
            }
            if (newFight.blocker && (newFight.blocker.animState === 'dying' || newFight.blocker.animState === 'ephemeral_dying')) hasCombatDeath = true;
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

        // [2026-09-15 程拍板] 幻象死亡同样算「单位阵亡」→ 接入 unit_die 迷宫强化（英魂传承 / 献祭仪式）。
        //   病根：combat.ts 把幻象强制标记为 ephemeral_dying（优先级高于 dying），而 useGameState 的死亡清算
        //   显式排除该状态（为防重复触发/防覆盖消散演出）→ 飞剑（安卡量产）与全部 unit_die 强化零联动。
        //   此处是幻象死亡的唯一收口（bench + field 同时覆盖）且一次性收集、天然去重，就地补触发。
        //   触发顺序与 useGameState.processDeaths 一致：强化触发先于亡语入队（judgeLifeAndDeath 在其后）。
        //   ⚠️ 排除复活类（亡灵军团 / 不死军团）：飞剑是量产幻象，复活会形成"死了又活"的循环。
        //   ⚠️ 不封顶：飞剑4 一轮多次触发本就是安卡的强势点（程拍板保留）。
        //   ⚠️ 现排除了唯一会改 bench 的 RESURRECT，故可安全早于下方 setPlayerBench(nextPlayerBench)；
        //      若将来新增改 bench 的 unit_die 效果类，需把本段后移到 stateRef 同步之后。
        (['player', 'enemy'] as const).forEach(dieSide => {
            const myDead = allEphemeralDead.filter(d => d.owner === dieSide);
            if (myDead.length === 0) return;
            const dieEnh = dieSide === 'player' ? stateRef.current.game.rogueEnhancements : stateRef.current.game.enemyEnhancements;
            const ctx: RogueTriggerCtx = {
                game: { ...stateRef.current.game },
                playerBench: dieSide === 'player' ? [...nextPlayerBench] : [...stateRef.current.playerBench],
                enemyBench: dieSide === 'enemy' ? [...nextEnemyBench] : [...stateRef.current.enemyBench],
                combatField: [...nextCombatField],
                playerHand: [...stateRef.current.playerHand],
                enemyHand: [...stateRef.current.enemyHand],
                playerDeck: [...stateRef.current.playerDeck],
                enemyDeck: [...stateRef.current.enemyDeck],
                owner: dieSide,
                trigger: 'unit_die',
                createFullCard,
                info: { resurrectedSide: undefined },
                dirty: { bench: new Set<Side>(), hand: new Set<Side>(), deck: new Set<Side>(), field: false, game: false },
            };
            myDead.forEach(d => {
                // [2026-10-05 莉莉子 BUG修复 · 20261005-12] 账本判重：这次死亡若已在别处派发过
                //   （备战席 processDeaths / 交战区 judgeLifeAndDeath 的补派发），这里就不再发 ✗ 防重复；
                //   发完立刻记账，供那两处反向判重。
                if (hasUnitDieDispatched(d.card)) return;
                ctx.info.deadUnit = d.card;
                runRogueTrigger(ctx, dieEnh, 'unit_die', (ec) => ec !== 'RESURRECT');
                markUnitDieDispatched(d.card);
            });
            // 回写被强化改动的切片（与 useGameState.processDeaths 同构）
            if (ctx.dirty.bench.has('player')) setPlayerBench(ctx.playerBench);
            if (ctx.dirty.bench.has('enemy')) setEnemyBench(ctx.enemyBench);
            if (ctx.dirty.field) setCombatField(ctx.combatField);
            if (ctx.dirty.hand.has('player')) setPlayerHand(ctx.playerHand);
            if (ctx.dirty.hand.has('enemy')) setEnemyHand(ctx.enemyHand);
            if (ctx.dirty.deck.has('player')) setPlayerDeck(ctx.playerDeck);
            if (ctx.dirty.deck.has('enemy')) setEnemyDeckState(ctx.enemyDeck);
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

                    const shots = event.params.shots ?? 0; // [2026-08-27] 判空
                    for (let i = 0; i < shots; i++) {
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

                    // 🔴 [2026-10-08 莉莉子 BUG修复 · AI 迟滞 N×8s] 同上：**先挂监听、再发射**
                    const hitsPromise = waitForHits(bullets.length);

                    // 视觉：默认红色法球弹道
                    eventBus.emit(StrikeEvents.COMMAND, {
                        sourceId: event.sourceId,
                        bullets,
                        interval: 120,
                        spellKey: 'titan_type_b_mutant',  // missle map 没有此 key → 走 default 红色法球
                    });
                    await waitForStrikeComplete();
                    // [2026-10-06 程拍板 · BUG修复 · 与臆莲基座同一机制] **删掉"用预演结果整体覆盖写回"**：
                    //   原先 `setEnemyBench(simBoard)` + 手动同步 stateRef 有两个病 ——
                    //     ① **值式整体替换** ⇒ 把这期间其它来源的改动（含 HIT 处理器刚落的伤害）一并抹掉；
                    //     ② 只覆盖**备战席** ⇒ 交战区那份伤害压根没写（与基座那条的行为不一致）。
                    //   现在改为：**只等这一段该来的 HIT 全部落地** —— HIT 处理器本就是**权威的伤害落点**
                    //   （自己会处理"屏障破盾 / 坚韧减伤"后的真实伤害，并同时覆盖备战席与交战区）。
                    //   [2026-10-08] 监听已提前到上面挂好。
                    await hitsPromise;

                    // [2026-10-08 莉莉子 · 对局记录补齐] 能力效果入库（乙型脉冲扫射）—— 口径同基座扫射：一次结算 1 条
                    {
                        const totalDmg = bullets.reduce((s, b) => s + b.damage, 0);
                        const targetIds = Array.from(new Set(bullets.map(b => b.targetId)));
                        recordAction('ability_effect', owner, `乙型异化人 · 脉冲扫射`, {
                            cardKey: 'titan_type_b_mutant',
                            detail: `${bullets.length} 发 · 共 ${totalDmg} 点 → ${targetIds.length} 个目标`,
                        });
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

                    // [2026-09-29 程拍板] 不死之身：目标水晶免疫伤害 → 整段跳过
                    const gmImmune = enemyPlayer === 'player' ? !!stateRef.current.game?.playerNexusImmune : !!stateRef.current.game?.enemyNexusImmune;
                    if (nexusDmg > 0 && !gmImmune) {
                        // [2026-09-02 莉莉子 修复] 固若金汤水晶坚韧：盖弥尔 AOE 打水晶减 1，飘字 amount 同步实际伤害
                        const isGmTough = enemyPlayer === 'player' ? !!stateRef.current.game?.playerNexusTough : !!stateRef.current.game?.enemyNexusTough;
                        const finalGmDmg = isGmTough ? Math.max(0, nexusDmg - 1) : nexusDmg;
                        setGame(prev => ({
                            ...prev,
                            ...(enemyPlayer === 'player'
                                ? { playerNexus: Math.max(0, (prev.playerNexus || 20) - finalGmDmg) }
                                : { enemyNexus: Math.max(0, (prev.enemyNexus || 20) - finalGmDmg) }),
                        }));
                        eventBus.emit('unit_damage', { id: `nexus_${enemyPlayer}`, amount: finalGmDmg });
                        eventBus.emit(GameEvents.NEXUS_STRIKED, { target: enemyPlayer, amount: finalGmDmg });
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

        // 7. 开启新回合（先做交战区幸存者归位安全网；正常路径交战区已空 → no-op）
        reconcileLeftoverCombatSurvivors();
        startRound();
    };

    // ==========================================
    // [2026-10-02 莉莉子 BUG修复] 回合末序列「重入守卫」
    //   病根：本函数入口的 `setGame(phase:'animating')` 是**异步** state 更新。
    //   两次调用若在 React flush 之前先后到达，双方都会读到旧值 `phase === 'main'`
    //   （passTurn 的阶段白名单因此双双放行）⇒ 回合末序列执行两次 ⇒ 回合号 +2
    //   ⇒ 进攻标识是按回合奇偶分配的（logic/core.ts:82）⇒ 奇偶回到原样
    //   ⇒ **同一方连续拿到两个进攻回合**（粉丝：「对面连续两个进攻回合，有时候自己也会」）。
    //   用**同步 ref**（不走 state，读到的就是当下真值）做互斥，与 passTurn 的阶段白名单形成双保险。
    // ==========================================
    const roundEndRunningRef = useRef(false);

    // ==========================================
    // [2026-09-03 莉莉子 死锁逃生] executeRoundEndSequence 外层守卫
    // 内层从 phase:'animating' 一路跑到 startRound()，全程无异常保护；任一回合末效果抛错
    // 就会停在 animating、且交战区幸存单位永不归位（跨回合卡场）。
    // 外层 try/catch/finally：异常时先归位交战区幸存者，再兜底推进新回合 / 强置 main。
    // ==========================================
    const executeRoundEndSequence = async () => {
        if (roundEndRunningRef.current) {
            console.warn('[executeRoundEndSequence] ⚠️ 已在执行中，忽略本次重入调用（防回合号跳两格 → 同一方连攻）');
            return;
        }
        roundEndRunningRef.current = true;
        const roundAtEntry = stateRef.current.game.round;
        bumpAnimProgress();
        setGame(prev => ({ ...prev, phase: 'animating' as const }));
        let advanced = false;
        try {
            await executeRoundEndSequenceInner();
            advanced = true;
        } catch (err) {
            console.error('[executeRoundEndSequence] 💥 异常，应急归位交战区并推进回合', err);
            reconcileLeftoverCombatSurvivors();
            if (!advanced && stateRef.current.game.round === roundAtEntry) {
                try {
                    startRound();
                    advanced = true;
                } catch (e2) {
                    console.error('[executeRoundEndSequence] startRound 二次失败，强置 main', e2);
                    setGame(prev => prev.phase === 'animating'
                        ? { ...prev, phase: 'main' as const, consecutivePasses: 0, lastActionTimestamp: Date.now() }
                        : prev);
                }
            } else if (stateRef.current.game.phase === 'animating') {
                setGame(prev => ({ ...prev, phase: 'main' as const, consecutivePasses: 0, lastActionTimestamp: Date.now() }));
            }
        } finally {
            roundEndRunningRef.current = false; // [2026-10-02] 释放互斥锁（异常路径也必须释放）
            bumpAnimProgress();
        }
    };

    return {
        startRound,
        executeRoundEndSequence,
        triggerFirstRoundRogueEnhance, // [2026-08-15] 换牌后第一回合触发 round_start 强化（暗箭等）
    };
}