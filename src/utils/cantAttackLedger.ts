// ==========================================
// [2026-10-05 莉莉子 BUG修复] 【无法攻击】「进场清零 / 回席还原」的**唯一出口**
// ── 为什么必须收成一个模块：这条语义此前是**散在 6 处各写一遍**的内联代码
//    （进场：玩家进攻 / 玩家格挡 / 挑战拉人×2 / 丁型预选格挡者；回席：撤回进攻 / 撤回格挡 / 战斗收尾），
//    于是**每新增一条「把人拉上场」或「把人送回备战席」的路径，就漏抄一次**：
//      · 2026-09-26 猎影标记额外攻击（新路径未清零，BUG-20261003-02）
//      · 2026-10-02 撤回进攻丢 blocker（回席出口漏还原）
//      · 2026-10-05 基座主动进攻 → 结算回席后攻击力仍是 0（程实测，本条）
//    全是同一个坑的第 N 次。
//
// ── 账本为什么放**模块级**、而不是原来 hook 里的 `useRef`：
//    回席的出口有两个在**纯逻辑层**（`utils/combatRecovery.ts` 的应急归位、
//    `logic/effectProcessor.ts` 的「召回」/千莲叠绽换位），它们拿不到 hook 的 ref。
//    放在模块级 ⇒ 三条出口共用同一份账本，不必反向依赖 React。
//    （键是卡 id：`createCard` 每次生成随机 id ⇒ 不存在跨局/跨实例撞键）
//
// ── 幂等铁律：**已有账本 ⇒ 绝不覆盖**。
//    否则「一个已归零的单位再次进场」会把 0 记成"真值"，原始攻击力**永久丢失**，
//    此后无论怎么撤回都还原不回来（这正是程看到的"攻击力居然没有回复"里最恶的一档）。
// ==========================================
import type { CardData } from '../types';

export interface CantAttackOrigPower {
    power: number;
    buffsPower: number;
    roundBuffsPower: number;
}

/** 卡 id → 进场前的真实攻击力三件套（面板 / 永久 buff / 本回合临时 buff） */
const cantAttackLedger = new Map<string, CantAttackOrigPower>();

/**
 * 进场：把【无法攻击】单位的面板攻击力清零，并记账以便回席还原。
 * 非【无法攻击】单位原样返回（零副作用）。
 */
export const applyCantAttackZeroPower = (unit: CardData): CardData => {
    if (!(unit.keywords || []).includes('CantAttack')) return unit;

    // ⚠️ 幂等：已有账本时**保留最初真值**，绝不拿"归零后的值"覆盖
    if (!cantAttackLedger.has(unit.id)) {
        cantAttackLedger.set(unit.id, {
            power: unit.power || 0,
            buffsPower: unit.buffs?.power || 0,
            roundBuffsPower: unit.roundBuffs?.power || 0,
        });
        // [2026-10-23 莉莉子 · 临时诊断] 「回席后攻击力仍是 0」排查
        console.log(`[CantAttack-DEBUG] ✏️ 记账 ${unit.name}(${unit.id}) → `
            + `power=${unit.power || 0} buffs=${unit.buffs?.power || 0} roundBuffs=${unit.roundBuffs?.power || 0}`);
    } else {
        console.log(`[CantAttack-DEBUG] ✏️ 记账已存在(幂等保留，不覆盖) ${unit.name}(${unit.id}) `
            + `账本=${JSON.stringify(cantAttackLedger.get(unit.id))} ｜ 本次看到 power=${unit.power || 0} `
            + `buffs=${unit.buffs?.power || 0} roundBuffs=${unit.roundBuffs?.power || 0}`);
    }

    return {
        ...unit,
        power: 0,
        buffs: unit.buffs ? { ...unit.buffs, power: 0 } : undefined,
        roundBuffs: unit.roundBuffs ? { ...unit.roundBuffs, power: 0 } : undefined,
    };
};

/**
 * 回席：还原【无法攻击】单位进场前的真实攻击力（并销账）。
 * 没记过账 ⇒ 原样返回（幂等，绝不凭空造值）。
 */
/** 取调用栈的前几帧（仅诊断用，定位"谁调了还原"） */
const briefStack = (): string => {
    const stack = (new Error().stack || '').split('\n').slice(2, 6).map(s => s.trim());
    return stack.join(' ← ');
};

export const restoreCantAttackPower = (unit: CardData): CardData => {
    const orig = cantAttackLedger.get(unit.id);
    if (!orig) {
        // [2026-10-23 莉莉子 · 临时诊断] 没账本 ⇒ 原样返回（power 保持归零后的值）——
        //   若程复现时打出这一行，说明**账本丢了**（记账没发生，或已被别处提前销账）
        console.log(`[CantAttack-DEBUG] 🔄 还原失败·无账本 ${unit.name}(${unit.id}) `
            + `→ 原样返回 power=${unit.power || 0} buffs=${unit.buffs?.power || 0} `
            + `｜ 当前账本条目数=${cantAttackLedger.size}\n    调用栈: ${briefStack()}`);
        return unit;
    }
    cantAttackLedger.delete(unit.id);
    // [2026-10-23 莉莉子 · 临时诊断]
    //   · 若打出 `power=0 buffs=0` 却记账时不为 0 ⇒ 记账时机错了（记的是已归零的值）
    //   · 若打出正常值 ⇒ 账本没问题，是**还原之后又被谁覆盖了**（去看 game.state 写入顺序）
    console.log(`[CantAttack-DEBUG] 🔄 还原 ${unit.name}(${unit.id}) ← 账本 `
        + `power=${orig.power} buffs=${orig.buffsPower} roundBuffs=${orig.roundBuffsPower} `
        + `｜ 还原前 power=${unit.power || 0} buffs=${unit.buffs?.power || 0} `
        + `｜ 剩余账本=${cantAttackLedger.size}\n    调用栈: ${briefStack()}`);

    // ⚠️ 原实现写的是 `unit.buffs ? {…} : undefined` —— 一旦 `buffs` 对象本身丢了
    //    （沉默/净化类效果），那份真值就被静默丢弃。这里按账本兜底重建，只补不减。
    const buffs = (unit.buffs || orig.buffsPower !== 0)
        ? { power: orig.buffsPower, health: unit.buffs?.health || 0 }
        : undefined;
    const roundBuffs = (unit.roundBuffs || orig.roundBuffsPower !== 0)
        ? { power: orig.roundBuffsPower, health: unit.roundBuffs?.health || 0 }
        : undefined;

    return { ...unit, power: orig.power, buffs, roundBuffs };
};

/** 仅调试/排查用：当前未销账的条目数（正常应趋近 0，长期 >0 即为漏还原的路径） */
export const cantAttackLedgerSize = () => cantAttackLedger.size;
