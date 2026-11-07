/**
 * 格挡合法性 —— **唯一门卫**（Single Source of Truth）
 *
 * [2026-10-26 莉莉子 BUG修复] 抽此文件的由来：
 *   ── 病根：此前「隐秘 / 凶恶」的判据**散落在玩家的两条上阵路径**里
 *      （`useGameState.assignBlocker` 点击路径 + `GameSession` 拖拽路径的手抄条件），
 *      而**战场内部挪位**（`GameSession` 的「格挡者交换」分支）一条判据都没有 ⇒
 *      玩家可以先把单位拖到普通战线（合法），再从战场上把它挪到【隐秘】/【凶恶】战线上。
 *   ── 铁律：**凡是"某个单位要站到某个攻击者对面"的入口，都必须调本函数。**
 *      新增入口时若绕过它，就等于凭空开了一个后门。
 *   ── 为什么不再各处手抄：见 `useAI.ts` 原有的 `canBlockAttacker` 注释——
 *      "抽成唯一入口，避免排序与分配两套判据分叉"，同一个教训在那里已经吃过一次。
 *
 * ⚠️ 结算层（`logic/combat.ts` / `logic/keywords.ts`）**刻意不做二次校验**：
 *    暴露、挑战者等机制本来就允许在特定条件下绕过这些门槛，那是有意设计。
 *    本门卫只负责"玩家/AI 主动选人上阵"这一步的合法性。
 */
import type { CardData } from '../types';
import { getPower } from './keywords';

/**
 * 格挡被拒的原因。取值与 `GameEvents.BLOCK_REJECTED` 的 `reason` 字段一一对应，
 * 表现层按它分发（`GameSession` 中央播报 + 备战席/战场实卡吓退动画，
 * `KeywordEffects` 攻击者自己的关键词闪光）。
 */
export type BlockRejectReason = 'cantblock' | 'elusive' | 'fearsome';

/**
 * 判定「blocker 能否站到 attacker 对面」。
 * @returns `null` = 合法放行；否则返回拒绝原因。
 *
 * 三条规则（顺序即优先级，与旧实现保持一致）：
 *  1. 【无法格挡】`CantBlock` —— 该单位根本不该被派去防守（`cards.ts` 有实战卡）。
 *  2. 【隐秘】`Elusive` —— 攻击者有隐秘时，阻挡者必须也有隐秘。
 *  3. 【凶恶】`Fearsome` —— 攻击者有凶恶时，阻挡者攻击力须 ≥ 3。
 *
 * ⚠️ 攻击力必须走 `getPower`（含 `buffs + roundBuffs`、`maxPower` 钳制、0 下限），
 *    与卡面显示同口径 —— 这是 2026-10-19 程定的口径：
 *    手算 `power + buffs + roundBuffs` 会漏掉 maxPower 钳制与 0 下限。
 */
export const getBlockRejectReason = (blocker: CardData, attacker: CardData): BlockRejectReason | null => {
    if (blocker.keywords.includes('CantBlock')) return 'cantblock';
    if (attacker.keywords.includes('Elusive') && !blocker.keywords.includes('Elusive')) return 'elusive';
    if (attacker.keywords.includes('Fearsome') && getPower(blocker) < 3) return 'fearsome';
    return null;
};

/** 布尔封装：只想知道能不能挡时用它（语义比 `=== null` 好读）。 */
export const canBlockAttacker = (blocker: CardData, attacker: CardData): boolean =>
    getBlockRejectReason(blocker, attacker) === null;

/**
 * 拒绝文案 —— **消息栏（setMessage）与中央播报共用同一份**。
 * 此前两处各写各的，标点都不一致（一处带「！」，一处不带），统一收口于此。
 */
export const BLOCK_REJECT_TEXT: Record<BlockRejectReason, { text: string; title: string }> = {
    cantblock: { text: '该单位无法进行格挡！', title: 'CANNOT BLOCK' },
    elusive: { text: '必须用【隐秘】单位阻挡【隐秘】单位！', title: 'BLOCK REJECTED' },
    fearsome: { text: '必须用攻击力大于3的单位阻挡【凶恶】单位！', title: 'BLOCK REJECTED' },
};
