// ==========================================
// 悖论迷宫 · 任务进度追踪（逻辑层 · 纯函数 + 薄查询）
// [2026-09-25 莉莉子] 三线任务化框架的进度中枢：
//   · 进度表是一张扁平 map：key → 已累计次数。三线用命名空间前缀区分，天然不撞车。
//   · 单场进度存 game.questProgress（战斗结束随对局销毁）；整局进度存 run.questProgress。
//   · 本模块负责【推进】【判定】【兑现改写卡牌】三件事，全部是纯函数 ——
//     写回 state 由调用方按各自语境执行（战斗内用 setGame，run 层用 setRun）。
//   · ⚠️ 推进函数在「无匹配任务」时**原样返回入参引用**（含 undefined），
//     调用方用 `!==` 判空即可省掉一次 setState —— 这是热路径（每次打击都会走）。
// ==========================================
import { getEquipmentById } from '../data/equipment';
import { MAZE_BUFF_BY_ID } from '../data/roguelike/buffs';
import type { EquipmentQuestReward, QuestCondition, QuestEvent, QuestSpec } from '../data/questTypes';
import { applyPermanentBuff } from './rogueBattle';
import { getPower } from './keywords';
import type { CardData } from '../types';

/** 进度表：key → 已累计次数 */
export type QuestProgress = Record<string, number>;

/** 进度键命名空间（三线各一，避免撞车） */
export const questKey = {
    /** 迷宫强化线：全局唯一 id */
    enh: (id: string) => `enh:${id}`,
    /** 装备线：按【卡实例 + 装备】计 —— 同一件装备挂在不同卡上各自计数 */
    gear: (cardId: string, equipId: string) => `gear:${cardId}:${equipId}`,
    /** 武装线：按武装 id 计（整局作用域） */
    arm: (id: string) => `arm:${id}`,
};

/** 推进一步（返回新表；仅在确实有推进时调用） */
export const advanceQuest = (progress: QuestProgress | undefined, key: string, amount = 1): QuestProgress => ({
    ...(progress ?? {}),
    [key]: ((progress ?? {})[key] ?? 0) + amount,
});

/** 是否已达成阈值 */
export const isQuestDone = (progress: QuestProgress | undefined, key: string, threshold: number): boolean =>
    ((progress ?? {})[key] ?? 0) >= threshold;

/** 当前进度值（UI 用） */
export const questCount = (progress: QuestProgress | undefined, key: string): number => (progress ?? {})[key] ?? 0;

// ==========================================
// 强化线：推进「事件匹配」的强化任务
//   ⚠️ 只推进进度，不判定解锁 —— 解锁判定在 rogueTrigger.runRogueTrigger（分发前过滤）
// ==========================================
export const advanceEnhQuests = (
    progress: QuestProgress | undefined,
    enhIds: string[] | undefined,
    event: QuestEvent,
): QuestProgress | undefined => {
    let next: QuestProgress | undefined = progress;
    let changed = false;
    for (const id of enhIds ?? []) {
        const q = MAZE_BUFF_BY_ID[id]?.quest;
        if (!q || q.event !== event) continue;
        next = advanceQuest(next, questKey.enh(id), 1);
        changed = true;
    }
    return changed ? next : progress;
};

/** 强化线的任务规格（UI / 解锁判定共用） */
export const getEnhQuest = (id: string): QuestSpec | undefined => MAZE_BUFF_BY_ID[id]?.quest;

// ==========================================
// 强化线 · 资源规则类（不走触发引擎，直接参与"回合边界的法力计算"）
// ==========================================
/** 共鸣涌流：每施放 N 个法术 → 本场法术法力上限 +1（封顶 max 层）。计数存在 questProgress 的 spell:growth:<id> 键 */
export const advanceSpellManaGrowth = (
    progress: QuestProgress | undefined,
    enhIds: string[] | undefined,
): QuestProgress | undefined => {
    let next: QuestProgress | undefined = progress;
    let changed = false;
    for (const id of enhIds ?? []) {
        if (!MAZE_BUFF_BY_ID[id]?.spellManaGrowth) continue;
        next = advanceQuest(next, `spell:growth:${id}`, 1);
        changed = true;
    }
    return changed ? next : progress;
};

/** 共鸣涌流带来的法术法力上限加成（派生，不占 GameState 字段） */
export const spellManaCapBonusOf = (progress: QuestProgress | undefined, enhIds: string[] | undefined): number => {
    let bonus = 0;
    for (const id of enhIds ?? []) {
        const g = MAZE_BUFF_BY_ID[id]?.spellManaGrowth;
        if (!g) continue;
        bonus += Math.min(g.max ?? 3, Math.floor(questCount(progress, `spell:growth:${id}`) / g.every));
    }
    return bonus;
};

/** 囤积：把"未使用法力溢出到法术池"的**上限**抬高 N 点（实际溢出的量天然受剩余法力限制） */
export const hoardSpellManaCapOf = (enhIds: string[] | undefined): number => {
    let cap = 0;
    for (const id of enhIds ?? []) {
        const v = MAZE_BUFF_BY_ID[id]?.hoardSpellMana;
        if (v) cap = Math.max(cap, v);
    }
    return cap;
};

// ==========================================
// 装备线
// ==========================================
/** 兑现声明的规范化：允许单条或数组（如「+0/+4 与【坚韧】」是两条叠加） */
export const rewardList = (
    r: EquipmentQuestReward | EquipmentQuestReward[] | undefined,
): EquipmentQuestReward[] => (!r ? [] : (Array.isArray(r) ? r : [r]));

/** [装备线] 推进参数：amount 按量累计（如水晶「伤害点数」，血债账簿用）；when 常驻条件的求值上下文 */
export interface GearQuestOpts {
    amount?: number;
    when?: QuestWhenCtx;
}

/** 常驻条件的求值上下文（由调用方按当时的战场快照填） */
export interface QuestWhenCtx {
    /** 我方水晶剩余百分比（0~100），背水之刃用 */
    nexusPct?: number;
}

/** 常驻条件判定：无 when 恒真；有 when 但上下文缺失 → 判否（宁可这次不算，也不误触发） */
export const matchesWhen = (when: QuestCondition | undefined, c?: QuestWhenCtx): boolean => {
    if (!when) return true;
    if (when.nexusPctLte !== undefined) {
        if (c?.nexusPct === undefined) return false;
        return c.nexusPct <= when.nexusPctLte;
    }
    return true;
};

/**
 * 推进「一组卡」上匹配事件的装备任务。
 *   · 按卡实例的事件（unit_attack / card_block / unit_kill）→ 传当事人那一张卡
 *   · 我方全局事件（cast_spell / play_unit / nexus_damaged / unit_die）→ 传在场卡全体
 *   · opts.amount 按量累计（缺省 1）；opts.when 供 when 条件求值
 */
export const advanceGearQuests = (
    progress: QuestProgress | undefined,
    cards: (CardData | undefined)[],
    event: QuestEvent,
    opts?: GearQuestOpts,
): QuestProgress | undefined => {
    const amount = opts?.amount ?? 1;
    let next: QuestProgress | undefined = progress;
    let changed = false;
    for (const card of cards) {
        if (!card?.equipment?.length) continue;
        for (const equipId of card.equipment) {
            const q = getEquipmentById(equipId)?.quest;
            if (!q || q.event !== event) continue;
            if (!matchesWhen(q.when, opts?.when)) continue;
            next = advanceQuest(next, questKey.gear(card.id, equipId), amount);
            changed = true;
        }
    }
    return changed ? next : progress;
};

/**
 * [装备线统一入口] 推进 + 识别「本次刚跨过阈值」的任务。
 *   changed=false 时进度表是原引用，调用方据此跳过 setState（省一次重渲染）。
 */
export const runGearQuestStep = (
    progress: QuestProgress | undefined,
    cards: (CardData | undefined)[],
    event: QuestEvent,
    opts?: GearQuestOpts,
): { progress: QuestProgress; changed: boolean; hits: { cardId: string; reward: EquipmentQuestReward[] }[] } => {
    const next = advanceGearQuests(progress, cards, event, opts);
    if (!next || next === progress) return { progress: progress ?? {}, changed: false, hits: [] };

    const hits: { cardId: string; reward: EquipmentQuestReward[] }[] = [];
    for (const card of cards) {
        if (!card?.equipment?.length) continue;
        for (const equipId of card.equipment) {
            const def = getEquipmentById(equipId);
            const q = def?.quest;
            const rewards = rewardList(def?.questReward);
            if (!q || rewards.length === 0) continue;
            const key = questKey.gear(card.id, equipId);
            // 仅「本次刚跨过」才兑现：推进前未达成、推进后达成
            if (!isQuestDone(progress, key, q.threshold) && isQuestDone(next, key, q.threshold)) {
                hits.push({ cardId: card.id, reward: rewards });
            }
        }
    }
    return { progress: next, changed: true, hits };
};

/** 把兑现应用到一张卡上（纯函数，返回新卡；支持单条或数组） */
export const applyGearQuestReward = (
    card: CardData,
    reward: EquipmentQuestReward | EquipmentQuestReward[],
): CardData => {
    let next = card;
    for (const r of rewardList(reward)) {
        switch (r.class) {
            case 'STATS':
                next = applyPermanentBuff(next, r.power ?? 0, r.health ?? 0);
                break;
            case 'KEYWORDS':
                next = { ...next, keywords: Array.from(new Set([...(next.keywords || []), ...r.keywords])) };
                break;
            case 'DOUBLE_POWER':
                // 攻击力翻倍：把「当前有效攻击力」再加一遍（走 buffs，不污染卡面基础值）
                next = applyPermanentBuff(next, Math.max(0, getPower(next)), 0);
                break;
            case 'COST_SET':
                next = { ...next, cost: r.value };
                break;
        }
    }
    return next;
};

/** 装备线进度查询（UI 用：返回 { 当前, 阈值, 达成 }） */
export const gearQuestState = (
    progress: QuestProgress | undefined,
    cardId: string,
    equipId: string,
): { current: number; threshold: number; done: boolean } | null => {
    const q = getEquipmentById(equipId)?.quest;
    if (!q) return null;
    const key = questKey.gear(cardId, equipId);
    const current = Math.min(questCount(progress, key), q.threshold);
    return { current, threshold: q.threshold, done: isQuestDone(progress, key, q.threshold) };
};
