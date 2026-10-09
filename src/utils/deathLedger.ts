// ==========================================
// [2026-10-05 莉莉子 BUG修复 · 20261005-12] 「这次死亡已派发过 unit_die 强化」账本
// ──────────────────────────────────────────
// 为什么需要这份账本：
//   `isDead` 的语义是「死亡已宣判 / 亡语已结算」，**不等于**「unit_die 强化已派发」。
//   2026-10-05 修「亡语结算两遍」时给尸体盖了 `isDead` 章（`useGameState.ts` 的 `stampCorpse`），
//   而 `judgeLifeAndDeath` 的 `judgeUnit` 首句正是 `if (c.isDead) return c;`
//   ⇒ 尸体被整个跳过 ⇒ 挂在 `newlyDead` 上的「**交战区**阵亡补发 unit_die」再也不会派发
//   ⇒ 程实测：安卡②「残月·拾遗」/④「朔望·减耗」在飞剑阵亡时不触发（同批共 **12 条** unit_die 强化受牵连）。
//
// ⚠️ 为什么**不用** WeakSet 按对象身份记（第一版踩过的坑，独立审查连抓两轮）：
//   程序里"从一张卡造出另一张卡"（`{ ...card }`）的地方**遍地都是** —— 本次共扫出 8 处
//   （`stampCorpse` / `judgeUnit` 判死 / `applyPermanentBuff` / `updateCardProgress` /
//     `useRoundLifecycle` 死亡态盖章 / `dealDamage` / `keywords.ts` 回合开始重置 / `applyBeaconDeaths`）。
//   按对象身份记 ⇒ **每复制一次标记就可能丢一次** ⇒ 同一死亡被重复派发。逐个去"搬运标记"是打地鼠 ✗。
//
// ✅ 现在的做法：**把标记写在卡自己身上**（`CardData.unitDieDispatched`）——
//   · 所有 `{ ...card }` 复制点**自动带上**标记（不必再逐个搬运）；
//   · `animState` / `keywords` 被别处改写也不影响它；
//   · 代价：**复活必须擦掉**（复活 = 新的一条命 ⇒ 它的"第二次死亡"要能重新派发）。
//     复活写入点已审计穷尽（全项目写 `isDead: false` 的只有 3 处，均在 `{ ...dead }` 旁边显式调用本模块的 clear）。
//   · 同时保留一个 WeakSet 兜底：万一遇到被 `Object.freeze` 的卡（写字段会抛），仍能靠身份判重。
// ==========================================
import type { CardData } from '../types';

// ⚠️ 取舍声明（诚实标注）：`markUnitDieDispatched` 是**原地写字段**（不是返回新对象），
//   与本仓库"卡对象尽量不可变"的习惯不同。可接受的理由：
//   ① 它只是**关于一次死亡事件的记账**，不参与渲染、不影响数值/索敌/动画 ⇒ 无需触发 re-render；
//   ② 它必须"跟着这张卡实例走"，若改成"返回新对象"，每个调用点都要再把新对象写回数组（又是一轮搬运 ✗）；
//   ③ 被标记的对象都处在本趟提交的工作数组里（`newPlayerBench` / `newCombatField` 等）⇒ 随后整体提交；
//   ④ 万一将来有人 `Object.freeze` 卡对象，写字段会抛 ⇒ 自动退回 WeakSet 兜底（只是失去"抗复制"能力）。

/** 字段名（写在卡上，随 spread 一起复制） */
const FIELD = 'unitDieDispatched' as const;

/** 身份证兜底（仅用于"卡被冻结、写不进字段"的极端情形） */
const fallback = new WeakSet<object>();

type AnyCard = Partial<CardData> & object;

/** 标记「这张卡（以这一次死亡的身份）已经派发过 unit_die 强化」 */
export const markUnitDieDispatched = (card: AnyCard | null | undefined): void => {
    if (!card) return;
    try {
        (card as Record<string, unknown>)[FIELD] = true;
    } catch {
        fallback.add(card); // 冻结对象：退回身份兜底
    }
};

/** 这张卡（以这一次死亡的身份）是否已经派发过 unit_die 强化 */
export const hasUnitDieDispatched = (card: AnyCard | null | undefined): boolean => {
    if (!card) return false;
    if ((card as Record<string, unknown>)[FIELD] === true) return true;
    return fallback.has(card);
};

/**
 * 清除标记 —— **复活/复制出新单位时必须调用**（复活 = 新的一条命；它的第二次死亡要能重新派发）。
 * 全项目 `isDead: false` 的写入点只有 3 处，均已在此配套调用：
 *   `rogueTrigger.ts` CLONE_ON_DECLARE（:746）· `rogueTrigger.ts` RESURRECT（:1056）· `effectProcessor.ts` 幻象复活（:4377）
 */
export const clearUnitDieDispatched = (card: AnyCard | null | undefined): void => {
    if (!card) return;
    try {
        delete (card as Record<string, unknown>)[FIELD];
    } catch {
        /* 冻结对象无需处理（本来也写不进去） */
    }
    fallback.delete(card);
};
