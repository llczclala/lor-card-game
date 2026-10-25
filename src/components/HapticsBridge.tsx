// ==========================================
// 水晶受击震动桥（`HapticsBridge`）
// [2026-10-20 莉莉子 · 触屏反馈]
//
// 👤 程的需求：「新增两处震动的位置，一处是**敌方打击我方水晶**，
//    一处是**我方打击敌方水晶**」
//
// ── 为什么这活儿只需要一个订阅，而不是去改十几个伤害点 ──────────────────
//   全项目的**水晶掉血**早已收口到一个统一广播 `GameEvents.NEXUS_STRIKED`，
//   payload = `{ target: 'player' | 'enemy', amount: number, fromCombat?: boolean }`：
//     · `target === 'player'` ⇒ **我方水晶**被打（= 敌方打击我方水晶）
//     · `target === 'enemy'`  ⇒ **敌方水晶**被打（= 我方打击敌方水晶）
//   ✅ 已证实的发射点（11 处，覆盖全部伤害来源）：
//     `useRoundLifecycle.ts:235,244`（直扣水晶·手动目标）
//     `useRoundLifecycle.ts:1655`（法术散射）
//     `useRoundLifecycle.ts:2037`（隔山打牛）
//     `useGameState.ts:3363`（丁型泰坦物质爆炸）
//     `useGameState.ts:4121`（战斗结算，带 fromCombat）
//     `effectProcessor.ts:288`（效果内 nexus_damage 事件转发）
//     `effectProcessor.ts:4866`（扩散伤害）
//     `rogueTrigger.ts:1107,1508,1515`（肉鸽强化/装备）
//     `spells.ts:110`（法术事件转发）
//   ⇒ 只要订阅这一个事件，新加的任何水晶伤害来源**自动就带上震动**，
//     不需要在 11 个地方各补一行（那才是最容易漏的写法）。
//
// ⚠️ 两个细节：
//   1. **`amount <= 0` 不震** —— 水晶免疫（不死之身）/ 坚韧减到 0 时，
//      有的路径仍会广播一次（`amount: 0`），那属于「没掉血」，凭什么叫一声。
//   2. **只在触屏挂载** —— PC 上 `navigator.vibrate` 本来就没有，
//      但订阅本身也是开销（每次水晶受击都会跑），索性不挂。
// ==========================================
import React, { useEffect, useState } from 'react';
import { eventBus, GameEvents } from '../utils/eventBus';
import { isTouchInput } from '../utils/touchGaze';
import { haptic } from '../utils/haptics';

/** `NEXUS_STRIKED` 的 payload 形状（与各发射点一致） */
type NexusStrikedPayload = {
    target?: 'player' | 'enemy' | string;
    amount?: number;
    fromCombat?: boolean;
    floatOnly?: boolean;
};

/**
 * 归一化 `target` ⇒ 到底**哪一方水晶被打**。
 *
 * ⚠️ 为什么要这一步（真实现状，别删）：同一个事件的 `target` 存在**两种写法**：
 *   · 多数发射点写 `'player'` / `'enemy'`（如 `useRoundLifecycle.ts:235,244`、`useGameState.ts:4121`）
 *   · 但效果事件转发链里会出现带后缀的 `'player_nexus'` / `'enemy_nexus'`
 *     （`effectProcessor.ts:1002` 剑痕时空·大飞剑 → `effectProcessor.ts:288` / `spells.ts:110` 原样转发）
 *   ⇒ 只精确比较 `=== 'player'` 会**静默漏掉**那条路径（水晶被打却不震）。
 *   这里统一把 `_nexus` 后缀剥掉再判，两种写法都覆盖。
 *
 * ⚠️ 顺带记一笔（**旁支，未查未改**）：上面那条带后缀的 payload 在
 *   `useRoundLifecycle.ts:600` 的飘字分支里被当成 `!== 'enemy'` ⇒ 会走"我方水晶飘字"，
 *   疑似**大飞剑打敌方水晶却在我方水晶飘字**的历史问题。不在本次范围内，留档待查。
 */
const nexusSideOf = (rawTarget?: string): 'player' | 'enemy' | null => {
    if (!rawTarget) return null;
    const side = rawTarget.replace(/_nexus$/, '');
    return side === 'player' || side === 'enemy' ? side : null;
};

/**
 * 同通道 + 同伤害值的去重窗口（ms）。
 *
 * ⚠️ 为什么需要（[2026-10-20 独立审查发现] 这不是我加出来的，是既有链路）：
 *   同一条 `nexus_damage` 会被**转发两次**——
 *     ① `effectProcessor.ts:288` 的 `relayEffectEvents()` —— **立即**发一次 NEXUS_STRIKED
 *     ② `useRoundLifecycle.ts:598-608` —— 又用 `setTimeout(delay = nexusDamageIndex * 250)`
 *        **再发一次**（那一路是为了让飘字错峰，飘字/震屏都吃这两路）
 *   ⇒ 只靠 `haptics.ts` 的 250ms 节流去挡，而②的错峰**恰好也是 250ms**，
 *      边界上会抖成「同一次掉血连震两下」或「两发独立伤害被吞一发」。
 *
 * ⇒ 修法（**只在震动层做，不碰演出源码**）：按「同通道 + 同伤害值 + 400ms 内」去重。
 *   一次掉血的两次转发 amount 完全相同 ⇒ 只震一下；
 *   真·两段伤害（例如 3 点 + 5 点）金额不同 ⇒ 不会被误吞，两下都震。
 */
const SAME_HIT_DEDUPE_MS = 400;
const lastHitAt: Partial<Record<'nexusIn' | 'nexusOut', { amount: number; at: number }>> = {};

export const HapticsBridge: React.FC = () => {
    const [enabled, setEnabled] = useState(false);

    // 只在触屏设备挂载（PC 直接不订阅，零开销）
    useEffect(() => {
        setEnabled(isTouchInput());
    }, []);

    useEffect(() => {
        if (!enabled) return;

        const onNexusStriked = (p?: NexusStrikedPayload) => {
            // 没掉血（免疫 / 坚韧减到 0）⇒ 不震
            if (!p || typeof p.amount !== 'number' || p.amount <= 0) return;
            const side = nexusSideOf(p.target);
            const channel: 'nexusIn' | 'nexusOut' | null =
                side === 'player' ? 'nexusIn'   // 我方水晶被打 = 敌方打击我方水晶
                    : side === 'enemy' ? 'nexusOut' // 敌方水晶被打 = 我方打击敌方水晶
                        : null;
            if (!channel) return;

            // 双转发去重（详见上方 SAME_HIT_DEDUPE_MS 注释）
            const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
            const prev = lastHitAt[channel];
            if (prev && prev.amount === p.amount && now - prev.at < SAME_HIT_DEDUPE_MS) return;
            lastHitAt[channel] = { amount: p.amount, at: now };

            haptic(channel);
        };

        eventBus.on(GameEvents.NEXUS_STRIKED, onNexusStriked);
        return () => {
            eventBus.off(GameEvents.NEXUS_STRIKED, onNexusStriked);
        };
    }, [enabled]);

    // 无渲染（纯副作用组件）
    return null;
};
