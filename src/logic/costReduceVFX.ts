/**
 * costReduceVFX — 减费特效的【唯一出口】（P0）
 *
 * ═══════════════════════════════════════════════════════════════════
 *  [2026-10-08 莉莉子 · 减费特效「绿潮降临」]
 *
 *  ⚠️ 为什么要有这个文件（不要在各减费点直接 eventBus.emit）：
 *     `effectProcessor.ts:268-277` 已经血书警告过同类问题 ——
 *     `unit_damage` / `nexus_damage` 是内部事件，必须由调用方转发上总线，
 *     而**全项目只有 spells.ts 一个调用方做了转发** ✗
 *     ⇒ 非法术来源的伤害（入场效果 / 回合开始 / 打击水晶触发 / 亡语…）既没飘字也没受击音。
 *
 *     减费会踩一模一样的坑：全项目有**十余处**改 cost 的地方（蕾西亚打击 / 飞剑折扣 / 法术19 /
 *     装备挂载 / 莲台开局 / 光环查询 / 肉鸽多条…），如果各自 emit 一遍，迟早漏掉一个。
 *     ⇒ **凡是要出演出，只调 `emitCostReduceVFX`，谁都不许自己 emit。**
 *
 *  ⚠️ **接线现状（2026-10-08）**：**只有蕾西亚 COST_REDUCE 一路接了**
 *     （`effectProcessor.ts` 的 COST_REDUCE 分支）。飞剑 / 法术19 / 装备 / 莲台 / 光环 / 肉鸽
 *     那几条**目前不会有任何演出**（费用照样变绿，只是没有特效）。
 *     其余按 `技术手册/设计-减费特效.md` §6 的接线表分批补 —— **别以为已经全覆盖了。**
 *
 *  ── 事件名为什么不在 `utils/eventBus.ts` 的 GameEvents 里：
 *     新增常量需要改动 eventBus.ts（现有文件）。本文件自带同名常量导出，
 *     收发双方引用同一常量即可防拼写错误，且 P0 做到**零现有文件改动**。
 *     后续若程同意归口，把它搬进 GameEvents 即可（本文件改一处引用）。
 * ═══════════════════════════════════════════════════════════════════
 */
import { eventBus } from '../utils/eventBus';

/** 减费特效事件名（收发双方共用，防拼写错误） */
export const COST_REDUCE_VFX_EVENT = 'cost_reduce_vfx';

/**
 * 减费来源类型 —— 决定演出细节（源锚点、束的颜色微调、是否允许震屏）
 *   · strike       蕾西亚打击水晶触发
 *   · flying_sword 飞剑折扣（朔望之期 / 剑痕时空 / 法术19）
 *   · equip        装备挂载减费
 *   · global_spell 莲台无垠「全法术减费」（开局齐射）
 *   · aura_burst   常驻光环的「点燃」演出（凯特琳 / 条件减费，**没有真实触发瞬间**）
 */
export type CostReduceKind =
    | 'strike'
    | 'flying_sword'
    | 'equip'
    | 'global_spell'
    | 'aura_burst';

/**
 * 演出档位 —— 防视觉疲劳（详见 技术手册/设计-减费特效.md §4）
 *   · full     FULL：四幕全开（~1.2s）
 *   · lite     LITE：只播命中层（~0.45s）—— **飞剑体系必须走这档**，否则一回合召几把就刷屏
 *   · ambience AMBIENCE：光环点燃（~0.6s）
 */
export type CostReduceTier = 'full' | 'lite' | 'ambience';

export interface CostReduceVFXPayload {
    /** 哪一方的手牌被减费（**手牌归属方**，不是触发方） */
    side: 'player' | 'enemy';
    /**
     * 源头 DOM 锚点 id（`data-entity-id` 的值）——
     * 蕾西亚单位 id / 水晶 `nexus_player` / 飞剑等。
     * 不传则按 side 回落到该侧水晶（敌方手牌不可见时只播源头发动层）。
     */
    sourceId?: string | null;
    /** 被减费的手牌卡 id 列表（**批量传**，不要一张发一次 → 否则 N 个动画堆叠） */
    cardIds: string[];
    /** 本次减费量（每张一致；不一致时请分次调用） */
    amount: number;
    /**
     * 减费**前**的费用（cardId → 原价）。用于数字老虎机翻滚（5→4→3）。
     * 拿不到就不传 —— 演出会退化成只显示「−N」，不翻滚。
     */
    beforeCosts?: Record<string, number>;
    kind: CostReduceKind;
    tier: CostReduceTier;
}

/**
 * LITE 档节流窗口（ms）。
 * 飞剑体系一回合可能连续减费好几次；LITE 只是"卡面闪一下"，
 * 丢掉冗余的不会让玩家漏掉信息（费用数字本身已变绿），但能防刷屏。
 * FULL 档**不节流** —— 它罕见且需要完整演出，丢不起。
 */
const LITE_THROTTLE_MS = 250;
/** 按 `阵营|来源|卡集合` 分键 —— 否则 250ms 窗口内**不同卡、甚至不同方**的减费会被一起吞掉（审查 D-5） */
const lastLiteEmitAt = new Map<string, number>();

export interface EmitCostReduceVFXInput {
    side: 'player' | 'enemy';
    cardIds: string[];
    amount: number;
    sourceId?: string | null;
    beforeCosts?: Record<string, number>;
    /** 默认 'strike' */
    kind?: CostReduceKind;
    /** 默认 'full' */
    tier?: CostReduceTier;
}

/**
 * 广播一次减费演出。
 *
 * ⚠️ 调用方注意：
 *   ① `side` 是**手牌归属方**。AI 给 AI 自己减费时 side='enemy'（其手牌对玩家不可见，
 *      特效层会自动只播源头发动层）—— 不要传成"触发方"。
 *   ② 一次结算减了多张卡 → **一次调用带 cardIds 数组**，不要循环调用。
 *   ③ `beforeCosts` 请在**改数据之前**采集（`card.cost` 的旧值），改完就取不到了。
 */
export const emitCostReduceVFX = (input: EmitCostReduceVFXInput): void => {
    const cardIds = (input.cardIds || []).filter(Boolean);
    if (cardIds.length === 0) return;
    if (!input.amount || input.amount <= 0) return;

    const tier: CostReduceTier = input.tier ?? 'full';

    if (tier === 'lite') {
        const key = `${input.side}|${input.kind ?? 'strike'}|${cardIds.join(',')}`;
        const now = Date.now();
        const last = lastLiteEmitAt.get(key) ?? 0;
        if (now - last < LITE_THROTTLE_MS) {
            console.log(`[CostReduceVFX] LITE 节流跳过（${cardIds.length} 张 / -${input.amount}）`);
            return;
        }
        lastLiteEmitAt.set(key, now);
    }

    const payload: CostReduceVFXPayload = {
        side: input.side,
        sourceId: input.sourceId ?? null,
        cardIds,
        amount: input.amount,
        beforeCosts: input.beforeCosts,
        kind: input.kind ?? 'strike',
        tier,
    };

    console.log(
        `[CostReduceVFX] ${tier.toUpperCase()} · kind=${payload.kind} · side=${payload.side}` +
        ` · ${cardIds.length} 张 · -${input.amount}` +
        (payload.sourceId ? ` · 源=${payload.sourceId.slice(0, 8)}` : ' · 源=默认锚点')
    );
    eventBus.emit(COST_REDUCE_VFX_EVENT, payload);
};
