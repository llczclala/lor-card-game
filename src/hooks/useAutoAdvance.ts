/**
 * [2026-11-19 莉莉子 · 编排层分区 L1] 「自动推进（托管）」检测。
 *
 * 从 `useGameState.ts` 整块搬出（原 `:1696-1777`）。搬的理由：
 *   · 它是一个**独立的回路**——「轮到玩家防守/响应 → 判断他其实有没有得打 → 没有就替他推进 800ms」，
 *     与战斗事务链零交集，只是需要读同一份 state；
 *   · 它是「AI 永久停机」这一类问题的高发区（`passTurn` 依赖死循环、飞剑竞态误推回合都出在这里），
 *     单独成文件后能完整读懂。
 *
 * 口径与搬家前**逐字一致**，只把「从 hook 闭包读」改成「参数注入」。新模块不 import `useGameState`（零环）。
 */
import { useEffect, useState } from 'react';
import type { CardData, GameState, CombatFieldItem } from '../types';
import { canBlockAttacker } from '../logic/blockRules';
import { canAfford } from '../logic/core';
import { getEffectiveSpellCost } from '../utils/gameRules';

export interface AutoAdvanceArgs {
    /** 当前游戏快照（effect 依赖用；实时值一律走 `stateRef`） */
    game: GameState;
    /** 引擎实时快照（只声明本模块用到的字段） */
    stateRef: React.MutableRefObject<{
        game: GameState;
        playerHand: CardData[];
        playerBench: CardData[];
        combatField: CombatFieldItem[];
    }>;
    /** 微队列（只读 `length`：队列非空时不算"无事可做"） */
    pendingActionsRef: React.MutableRefObject<unknown[]>;
    /** 手牌 / 备战席快照（**只在 effect 依赖里用它们的 length**；实时值一律走 `stateRef`） */
    playerHand: CardData[];
    playerBench: CardData[];
    /** 联机权威方（客方 false ⇒ 绝不本地推进） */
    authoritative: boolean;
    confirmBlock: () => void;
    passTurn: () => void;
}

export interface AutoAdvanceResult {
    isAutoAdvancing: boolean;
}

export const useAutoAdvance = ({
    game, stateRef, pendingActionsRef, playerHand, playerBench, authoritative, confirmBlock, passTurn,
}: AutoAdvanceArgs): AutoAdvanceResult => {
    const [isAutoAdvancing, setIsAutoAdvancing] = useState(false);

    /** 玩家在当前阶段「其实有没有得操作」（全部都读 `stateRef` 实时值） */
    const canPlayerAct = (checkPhase: string): boolean => {
        const { playerMana, playerSpellMana, playerMaxMana } = stateRef.current.game;
        const hand = stateRef.current.playerHand;
        const bench = stateRef.current.playerBench;
        const field = stateRef.current.combatField;

        // 1. 格挡阶段：检查是否有能用的阻挡者
        if (checkPhase === 'block_declare') {
            // [2026-10-26 莉莉子] 合法性统一走门卫（无法格挡 / 隐秘 / 凶恶）——
            //   此前这里是第 4 份手抄副本，判据一旦与 assignBlocker 分叉，
            //   就会出现「提示还能操作、实际每次都被拒」或反过来的死锁。
            const canBlock = bench.some(blocker => {
                return field.some(fight => {
                    // 只能挡对面的空位
                    if (fight.blocker !== null || fight.owner !== 'enemy') return false;
                    return canBlockAttacker(blocker, fight.attacker);
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
                const effectiveCost = getEffectiveSpellCost(card, stateRef.current.playerBench, playerMaxMana, 'player');
                return canAfford(card, playerMana, playerSpellMana, effectiveCost);
            });
            if (canCast) return true;
        }

        return false;
    };

    useEffect(() => {
        // [2026-11-07 超元链接] 非权威方（= 联机客方）绝对不做本地自动推进。
        //   病根：本 effect 直接调 `confirmBlock()` / `passTurn()`，**没有走 fireNetIntent**，
        //   所以客方也会在 800ms 后自己把回合推过去 —— 与房主的权威状态打架，两边各跑一套引擎。
        //   默认 true ⇒ 单机六模式行为不变。
        if (!authoritative) return;

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
                    // [2026-08-24 莉莉子 飞剑竞态根治] 只对真实阶段做合法动作，
                    // 意外回到 main（如飞剑归位后）一律不动，防止补一脚 passTurn 导致回合误结束
                    const phaseNow = stateRef.current.game.phase;
                    if (phaseNow === 'block_declare') {
                        confirmBlock(); // 格挡阶段无事可做应视为“防线确认完毕”
                    } else if (phaseNow === 'react_to_block') {
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
    }, [game.phase, game.turnOwner, playerHand.length, playerBench.length, game.playerMana, game.playerSpellMana, authoritative]);

    return { isAutoAdvancing };
};
