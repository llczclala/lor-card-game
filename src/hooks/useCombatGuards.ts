/**
 * [2026-11-19 莉莉子 · 编排层分区 L1] 战斗区 / 动画阶段的两道「安全网」守卫。
 *
 * 从 `useGameState.ts`（7422 行）整块搬出。搬它们的理由：
 *   · 它们是**纯安全网**——只在"本该发生的事没发生"时动手，与游戏规则零交集；
 *   · 却是历史上 bug 最多的一条线（「AI 永久停机」「单位卡在交战区」「飞剑竞态」全在这里）；
 *   · 单独成文件后，这条线能被完整读懂、单独修对，不用打开 7000 行。
 *
 * 口径与搬家前**逐字一致**，只把「从 hook 闭包读」改成「从参数读」：
 *   `stateRef` / 四个 setter / `game` / 沙盒开关 全部注入，本模块**不 import** `useGameState`（零环）。
 */
import { useEffect, useRef } from 'react';
import type { CardData, GameState, CombatFieldItem } from '../types';
import { combatHasFlyingSword, combatHasExtraAttack } from '../logic/combat';
import { animGuard, ANIM_STALL_MS, LEVELUP_STALL_GRACE_MS } from '../utils/animGuard';
import { recoverCombatSurvivors } from '../utils/combatRecovery';
import { eventBus, GameEvents } from '../utils/eventBus';

export interface CombatGuardsArgs {
    /** 当前游戏快照（effect 依赖用；实时值一律走 `stateRef`） */
    game: GameState;
    /** 引擎的实时快照 ref（只声明本模块用到的字段） */
    stateRef: React.MutableRefObject<{
        game: GameState;
        playerBench: CardData[];
        enemyBench: CardData[];
        combatField: CombatFieldItem[];
    }>;
    /** 当前交战区快照（`effect` 依赖用；实时值走 `stateRef`） */
    combatField: CombatFieldItem[];
    setGame: React.Dispatch<React.SetStateAction<GameState>>;
    setPlayerBench: React.Dispatch<React.SetStateAction<CardData[]>>;
    setEnemyBench: React.Dispatch<React.SetStateAction<CardData[]>>;
    setCombatField: React.Dispatch<React.SetStateAction<CombatFieldItem[]>>;
    /** 沙盒模式（默认不干预） */
    isSandbox: boolean;
    /** 沙盒里「守卫照跑」开关 */
    sandboxGuardEnabled: boolean;
}

export const useCombatGuards = ({
    game, combatField, stateRef, setGame, setPlayerBench, setEnemyBench, setCombatField,
    isSandbox, sandboxGuardEnabled,
}: CombatGuardsArgs): void => {
    // ==========================================
    // ① 交战区不变量守卫（第四道死锁保险）
    // ==========================================
    const COMBAT_ORPHAN_STABLE_MS = 1200;
    useEffect(() => {
        // [2026-09-13 莉莉子 L2-A] 沙盒默认不干预；打开「守卫照跑」后照常执行，用于贴近真机复现
        if (isSandbox && !sandboxGuardEnabled) return;
        if (game.gameResult) return;                    // 对局已结束
        if (game.phase !== 'main') return;              // 战斗/结算阶段合法持人
        if (combatField.length === 0) return;
        if (combatHasFlyingSword(combatField)) return;  // 飞剑让位给专属守卫
        if (combatHasExtraAttack(combatField)) return;  // [2026-09-26 T17] 额外攻击战线同样让位（待 settleStack 切格挡）
        const timer = setTimeout(() => {
            const ref = stateRef.current;
            // 复核实时状态：期间若已回到战斗阶段 / 交战区已清空 / 飞剑现身 / 对局结束，都视作正常，放行
            if (ref.game.gameResult || ref.game.phase !== 'main') return;
            if (ref.combatField.length === 0) return;
            if (combatHasFlyingSword(ref.combatField)) return;
            if (combatHasExtraAttack(ref.combatField)) return; // [2026-09-26 T17] 同上：额外攻击战线让位
            console.warn('[CombatOrphanGuard] ⚠️ main 阶段交战区仍有单位滞留，执行应急归位', {
                round: ref.game.round, turnOwner: ref.game.turnOwner, consecutivePasses: ref.game.consecutivePasses,
                combatFieldLen: ref.combatField.length,
                units: ref.combatField.map((f: CombatFieldItem) => `${f?.owner === 'player' ? 'P' : 'E'}:${f?.attacker?.key}${f?.blocker ? ' vs ' + f.blocker.key : ''}`),
            });
            recoverCombatSurvivors(ref.combatField, ref.playerBench, ref.enemyBench, {
                setPlayerBench, setEnemyBench, setCombatField, setGame,
            });
        }, COMBAT_ORPHAN_STABLE_MS);
        return () => clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [game.phase, game.gameResult, combatField.length, isSandbox, sandboxGuardEnabled]);

    // ==========================================
    // ② animating 停滞看门狗
    // ==========================================
    const levelUpProgressRef = useRef<{ stamp: number; key: string }>({ stamp: Date.now(), key: '' });
    // [2026-10-04 独立审查 #5 修复] 暂停 / 页面不可见期间**不判定停滞**：
    //   60s 宽限是墙钟时间，而升级影片在暂停时会被按住（GameSession.tsx:275-290 会暂停根容器内所有 <video>），
    //   指纹自然不变 ⇒ 原实现会把"玩家暂停了一分钟"误判成断链，强拆掉一次**合法**升级
    //   （还会吞掉 TUTORIAL_LEVEL_UP_COMPLETE，让教程 resume_upgrade 永远等下去）。
    //   后台标签页节流 / 系统休眠是同一个签名，一并挡掉。
    const watchdogPausedRef = useRef(false);
    useEffect(() => {
        const onPause = () => { watchdogPausedRef.current = true; };
        const onResume = () => {
            watchdogPausedRef.current = false;
            // 恢复时刷新计时起点，避免把暂停时长算进宽限
            levelUpProgressRef.current = { stamp: Date.now(), key: '' };
        };
        eventBus.on(GameEvents.GAME_PAUSE, onPause);
        eventBus.on(GameEvents.GAME_RESUME, onResume);
        return () => {
            eventBus.off(GameEvents.GAME_PAUSE, onPause);
            eventBus.off(GameEvents.GAME_RESUME, onResume);
        };
    }, []);
    useEffect(() => {
        if (game.gameResult) return;
        // [2026-10-04 独立审查 #4 修复] 布防条件放宽：
        //   原来只在 `phase === 'animating'` 时布防，但 `levelUpCard` 会在别处写 phase 时**留在场上**
        //   （passTurn→confirmBlock 写 react_to_block、额外攻击守卫写 block_declare、回合末序列……），
        //   而 AI 的闸门这次新增了 `levelUpCard` ⇒ 那种组合会变成**没有任何兜底**的永久冻死。
        //   现在：只要"有人在升级"或"仍在 animating"，就布防。
        const levelUpPendingNow = !!game.levelUpCard || (game.pendingLevelUps ?? []).length > 0;
        if (game.phase !== 'animating' && !levelUpPendingNow) return;
        const iv = setInterval(() => {
            const g = stateRef.current.game;
            if (g.gameResult) return;
            const busy = !!g.levelUpCard || (g.pendingLevelUps ?? []).length > 0;
            if (g.phase !== 'animating' && !busy) return;

            // 暂停 / 不可见：不计时，并刷新计时起点（恢复后重新获得完整宽限）
            if (watchdogPausedRef.current || (typeof document !== 'undefined' && document.visibilityState === 'hidden')) {
                levelUpProgressRef.current = { stamp: Date.now(), key: levelUpProgressRef.current.key };
                return;
            }

            // 进展指纹：升级链是否还在往前走（换人 / 出队都会改变它）
            const fp = `${g.levelUpCard?.id ?? '-'}|${(g.pendingLevelUps ?? []).length}`;
            if (fp !== levelUpProgressRef.current.key) {
                levelUpProgressRef.current = { stamp: Date.now(), key: fp };
            }
            const levelUpBusy = busy;

            if (levelUpBusy) {
                // 升级链豁免：但指纹迟迟不变 ⇒ 断链，强拆并**恢复 phase**（这一步原实现整个缺失）
                if (Date.now() - levelUpProgressRef.current.stamp < LEVELUP_STALL_GRACE_MS) return;
                console.error('[AnimWatchdog] 🚨 升级链停滞超时（演出已断链），强制清队列 + 恢复 main', {
                    round: g.round, turnOwner: g.turnOwner,
                    levelUpCard: g.levelUpCard?.key ?? null,
                    pendingLevelUps: (g.pendingLevelUps ?? []).map(c => c.key),
                    combatFieldLen: stateRef.current.combatField.length,
                });
                levelUpProgressRef.current = { stamp: Date.now(), key: '-|0' };
                setGame(prev => ({
                    ...prev,
                    levelUpCard: null,
                    pendingLevelUps: [],
                    phase: 'main' as const,
                    spellStack: [],
                    spellCasting: null,
                    activeCard: null,
                    consecutivePasses: 0,
                    lastActionTimestamp: Date.now(),
                }));
                // [2026-10-04 独立审查 #5 附带] 强拆绕过了 `LevelUpOverlay.onClose`
                //   （GameSession.tsx:2547 在那里发教程的"升级演出已完整播完"信号）
                //   ⇒ 教程的 resume_upgrade 会永远等下去。这里补发同一个信号。
                eventBus.emit(GameEvents.TUTORIAL_LEVEL_UP_COMPLETE);
                return;
            }

            // [2026-10-04 独立审查 #4 完成] 非 animating 阶段**不做** animating 停滞判定：
            //   上方 busy 分支已按"有人在升级"独立处理；这里恢复 animating 专属语义，
            //   免得 `animGuard.lastBump` 陈旧时对非 animating 阶段误跑战斗区应急归位。
            if (g.phase !== 'animating') return;

            if (Date.now() - animGuard.lastBump < ANIM_STALL_MS) return; // 仍在推进
            console.warn('[AnimWatchdog] ⚠️ animating 停滞超时，强制恢复 main', {
                phase: g.phase, round: g.round, turnOwner: g.turnOwner,
                spellStack: g.spellStack.map((s) => s.card?.key),
                combatFieldLen: stateRef.current.combatField.length,
                attackToken: g.attackToken,
                // [2026-10-10 莉莉子] 补**连斩链现场**（与 AI 看门狗同字段）——
                //   用来分辨"大招连斩还在逐击推进（只是慢）"还是"链死在半路"。
                //   📏 量级（已按程指正修正）：链最多清 6~7 个单位、每击 1s ⇒ **链本身只有几秒**；
                //      `MAX_CHAIN = 20` 只是护栏、不可达 ⇒ 别再把 20s 当解释。
                // [2026-10-10 莉莉子 · 二轮审查建议③] 补 `prevPhase` / `casterSide` / `skipBeacon` ——
                //   `prevPhase` 是本类问题（"链收尾还原成 animating"）**唯一**的判据，务必带上。
                pendingChain: g.pendingChain
                    ? {
                        step: g.pendingChain.step, done: g.pendingChain.done,
                        victimId: g.pendingChain.victimId,
                        prevPhase: g.pendingChain.prevPhase,
                        casterSide: g.pendingChain.casterSide,
                        skipBeacon: !!g.pendingChain.skipBeacon,
                      }
                    : null,
            });
            recoverCombatSurvivors(stateRef.current.combatField, stateRef.current.playerBench, stateRef.current.enemyBench, {
                setPlayerBench, setEnemyBench, setCombatField, setGame,
            });
            setGame(prev => prev.phase === 'animating'
                ? { ...prev, phase: 'main' as const, spellStack: [], spellCasting: null, activeCard: null,
                    consecutivePasses: 0, lastActionTimestamp: Date.now(),
                    // [2026-10-10 莉莉子 · 二轮独立审查后**撤回**] 这里刻意**不碰 `pendingChain`**：
                    //   曾试过"停滞时把未完成的链标 `done`"，审查证明它既没用又有害 ——
                    //   ① 正常链收尾时 `done` 已是 true ⇒ 三元返回**同一引用** ⇒ 驱动器不重跑 ⇒ 空操作；
                    //   ② 它用**新引用**唤醒驱动器 ⇒ 收尾分支按 `prevPhase` 写回时会把看门狗刚设的
                    //      `main` 顶掉 ⇒ 死链恢复反而慢一拍；
                    //   ③ 切后台 / 休眠唤醒后墙钟一跳，看门狗可能在**活链中途**开火 ⇒ 标 done 会
                    //      **掐掉剩余击数**（改动前不会）。
                    //   ⇒ 根因在别处：连斩把"链之前的 phase"录成了 `animating` 本身
                    //      （`effectProcessor.ts` 的 `prevPhase` 取值已修）；活链防误伤见连斩驱动器的**每击心跳**。
                  }
                : prev);
        }, 5000);
        return () => clearInterval(iv);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [game.phase, game.gameResult, game.levelUpCard, game.pendingLevelUps]);
};
