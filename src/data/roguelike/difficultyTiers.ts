// ==========================================
// 悖论迷宫 · 难度分层表（唯一真源）
// [2026-10-08 莉莉子 · 程拍板「都要做好分级」]
//   ── 起因：粉丝反馈「强化节点没刷到过金 / 红」⇒ 核查发现玩家侧四个抽选入口
//      （强化节点 / 商店进货 / 宝箱的卡与强化 / 事件奖励）**完全没做难度分层**，
//      而敌人侧（敌人强化 / 敌人装备 / 战斗奖励装备）早就做了。
//   ── 本文件把「难度 → 概率」的唯一定义收在一处：任何抽选入口都从这里取表，
//      杜绝「同一个难度在不同系统里各写一套权重」—— 那正是本次 bug 的形态。
//   ── 口径（对齐 `rewards.ts` 已成品的那套）：难度改两件事
//      ① 品质上限（超限权重并入上限档）② 品质权重分布；数值类另走倍率（仅事件收益）
//   🔒 明确**不做**分级的（程 2026-10-08 指示）：宝箱类型 4 等概率 · 随机宝箱奖励池 · 事件抽取权重
// ==========================================
import type { RogueDifficulty } from './difficulties';
import type { EnhancementRarity } from './buffs';
import type { EquipmentRarity } from '../equipment';

export const RARITY_RANK: Record<string, number> = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4, mythic: 5 };

/** 超限稀有度权重并入上限档（照 `rewards.ts:51-57` 的做法，保证"截断不丢权重"） */
export const capWeights = <T extends string>(w: Record<T, number>, cap: T): Record<T, number> => {
    const out: Record<string, number> = { ...w };
    const maxRank = RARITY_RANK[cap] ?? 99;
    let overflow = 0;
    for (const k of Object.keys(out)) {
        if ((RARITY_RANK[k] ?? 0) > maxRank) { overflow += out[k] ?? 0; out[k] = 0; }
    }
    if (overflow > 0) out[cap] = (out[cap] ?? 0) + overflow;
    return out as Record<T, number>;
};

// ═══════════════════════════════════════════════
//  一、迷宫强化品质（强化节点 / 商店买强化 / 宝箱强化 / 事件给强化）
//  池子现状（39 条）：白2 / 绿8 / 蓝10 / 紫10 / 金4 / 红5
//  ⇒ 折算「一次三选一里至少出现一个」：普通 金3.5% 红0 · 机密 金9.0% 红1.4% · 绝密 金16% 红7.1%
// ═══════════════════════════════════════════════
export const ENH_WEIGHTS: Record<RogueDifficulty, Record<EnhancementRarity, number>> = {
    normal:    { common: 60, uncommon: 55, rare: 35, epic: 12, legendary: 3,  mythic: 0 },
    secret:    { common: 45, uncommon: 45, rare: 38, epic: 20, legendary: 8,  mythic: 1 },
    topsecret: { common: 30, uncommon: 35, rare: 35, epic: 28, legendary: 14, mythic: 5 },
};
export const ENH_CAP: Record<RogueDifficulty, EnhancementRarity> = { normal: 'legendary', secret: 'mythic', topsecret: 'mythic' };

// ═══════════════════════════════════════════════
//  二、装备品质（商店买卡带装备 / 商店装备区 / 宝箱卡与装备 / 事件给装备）
//  装备池现状（非武装 51 件）：白11 / 绿7 / 蓝11 / 紫14 / 金4 / 红4
//  ⚠️ 旧实现是"按件数均匀抽" ⇒ 每格 15.7% 概率出金或红，**任何难度都一样**（反方向的分级漏洞）
// ═══════════════════════════════════════════════
export const EQUIP_WEIGHTS: Record<RogueDifficulty, Record<EquipmentRarity, number>> = {
    normal:    { common: 30, uncommon: 42, rare: 20, epic: 8,  legendary: 0,  mythic: 0 },
    secret:    { common: 10, uncommon: 28, rare: 34, epic: 22, legendary: 6,  mythic: 0 },
    topsecret: { common: 0,  uncommon: 12, rare: 28, epic: 34, legendary: 20, mythic: 6 },
};
export const EQUIP_CAP: Record<RogueDifficulty, EquipmentRarity> = { normal: 'epic', secret: 'legendary', topsecret: 'mythic' };

/** 卡牌候选「是否附带装备」的概率（难度越高，带装备的卡越常见） */
export const EQUIP_CHANCE: Record<RogueDifficulty, number> = { normal: 0.6, secret: 0.7, topsecret: 0.8 };

// ═══════════════════════════════════════════════
//  三、事件收益倍率（只放大"玩家获得"的数值；**代价不放大**）
//     理由：绝密敌人已经更强，收益放大 + 代价不变才是净鼓励（程 2026-10-08 采纳）
// ═══════════════════════════════════════════════
export const EVENT_GAIN_MULT: Record<RogueDifficulty, number> = { normal: 1, secret: 1.3, topsecret: 1.6 };

// ── 便捷取值（含 undefined 兜底：未传难度一律按 normal）──
export const enhWeightsFor = (d?: RogueDifficulty) => capWeights(ENH_WEIGHTS[d ?? 'normal'] ?? ENH_WEIGHTS.normal, ENH_CAP[d ?? 'normal'] ?? 'legendary');
export const equipWeightsFor = (d?: RogueDifficulty) => capWeights(EQUIP_WEIGHTS[d ?? 'normal'] ?? EQUIP_WEIGHTS.normal, EQUIP_CAP[d ?? 'normal'] ?? 'epic');
export const equipChanceFor = (d?: RogueDifficulty) => EQUIP_CHANCE[d ?? 'normal'] ?? 0.6;
export const gainMultFor = (d?: RogueDifficulty) => EVENT_GAIN_MULT[d ?? 'normal'] ?? 1;

/** 通用加权抽选：pool 内按 weightOf 取权重；**全零权重时退回均匀抽**（保证不会抽不出东西） */
export const weightedPick = <T,>(pool: T[], weightOf: (t: T) => number): T | undefined => {
    if (!pool.length) return undefined;
    const ws = pool.map(weightOf);
    const total = ws.reduce((s, w) => s + w, 0);
    if (total <= 0) return pool[Math.floor(Math.random() * pool.length)];
    let r = Math.random() * total;
    for (let i = 0; i < pool.length; i++) { r -= ws[i]; if (r <= 0) return pool[i]; }
    return pool[pool.length - 1];
};
