// 关键修复：添加 type 关键字
import type { CardData, GameState } from '../types';
import { spellManaCapBonusOf, hoardSpellManaCapOf } from './questTracker';
import { getBuffById, getBattleEffects } from '../data/roguelike/buffs';

/**
 * [2026-09-25 莉莉子 强化线] 本场「法术法力池上限」：基础 3 + 共鸣涌流成长 + 囤积的溢出额度。
 *   这两件强化不改战斗内的即时效果，改的是**回合边界的资源规则** —— 所以统一在这里算，
 *   而"溢出多少"天然受剩余法力限制（上限抬高 ≠ 白送法力）。
 */
export const spellManaCapOf = (g: GameState): number =>
    3 + spellManaCapBonusOf(g.questProgress, g.rogueEnhancements) + hoardSpellManaCapOf(g.rogueEnhancements);

/**
 * [2026-09-29 莉莉子 收口] 从强化 id 列表里累加全部 `START_MANA_BONUS` 效果的 value。
 *   取代原先"写死只认 divfx_common_5 一个 id"的做法 —— 现在任何带该效果类的强化都自动生效
 *   （神格·潮汐 divfx_common_5 / 敌方先机三档 enemy_start_mana_1~3 共用此查询）。
 */
const sumStartManaBonus = (enhIds: string[] | undefined): number =>
    (enhIds ?? []).reduce((sum, id) => {
        const b = getBuffById(id);
        if (!b) return sum;
        // 走统一定义表：一条强化可能有多个效果（与 encounterBuilder.sumNexusBoost 同口径）
        for (const be of getBattleEffects(b)) {
            if (be.effectClass === 'START_MANA_BONUS') sum += (be.params?.value as number) ?? 0;
        }
        return sum;
    }, 0);

/**
 * [2026-09-28 莉莉子 神格神经 · ⑤ 固定槽] 我方「最大法力 +1」。
 * [2026-09-29 莉莉子] 改为通用扫描（不再只认 divfx_common_5 一个 id）。
 *   为什么必须走规则查询、而不是在 game_start 写值：
 *   `calculateRoundStart` 每回合把最大法力**由回合数从零重算**（min(10, round)），
 *   所以任何在 game_start 直接写 playerMaxMana 的做法都会在下一个回合边界被冲掉。
 *   与 `spellManaCapOf`（共鸣涌流 / 囤积）同一口径：规则类效果统一在这里算。
 */
export const startManaBonusOf = (g: GameState): number => {
    let bonus = sumStartManaBonus(g.rogueEnhancements);
    // [2026-09-28 莉莉子 神格神经 · 猫汐尔③ 莲脉增殖] 每召唤 1 个召唤衍生物 → 本场永久 +1
    //   计数由 rogueTrigger 的 MANA_PER_SUMMON_PERMANENT 写进 questProgress；这里只做"规则查询"
    //   （上限仍受 calculateRoundStart 里的 min(10, …) 约束，不会无限涨）
    if ((g.rogueEnhancements ?? []).includes('divfx_mauxir_3')) {
        bonus += g.questProgress?.['div:mauxir:mana'] ?? 0;
    }
    return bonus;
};

/**
 * [2026-09-29 莉莉子] 敌方「最大法力 +N」——镜像 startManaBonusOf（我方口径）。
 *   载体为 `enemy_start_mana_1~3`（enemyEligible 专用，buffs.ts）。
 *   ⚠️ 与 `startManaBonusOf` 同属规则类效果：**必须走查询**，不能在 game_start 写值。
 */
export const enemyStartManaBonusOf = (g: GameState): number => sumStartManaBonus(g.enemyEnhancements);

/**
 * 计算回合开始时的状态变更
 */
export const calculateRoundStart = (currentGame: GameState): Partial<GameState> => {
    const prev = currentGame;
    const manaBonus = startManaBonusOf(prev);
    // [2026-09-29 莉莉子] 敌方开局法力强化（enemy_start_mana_*）→ 与玩家侧同口径，仅作用于敌方
    const enemyManaBonus = enemyStartManaBonusOf(prev);

    // 如果是第0回合(初始化)，直接跳到第1回合
    if (prev.round === 0) {
        return {
            round: 1,
            playerMaxMana: 1 + manaBonus, playerMana: 1 + manaBonus, playerSpellMana: 0,
            enemyMaxMana: 1 + enemyManaBonus, enemyMana: 1 + enemyManaBonus, enemySpellMana: 0,
            attackToken: { player: 'normal', enemy: null },
            turnOwner: 'player',
            phase: 'main',
            consecutivePasses: 0,
        };
    }

    const newRound = prev.round + 1;
    const newPlayerMaxMana = Math.min(10, newRound + manaBonus); // [2026-09-28 神格神经 ⑤] 我方 +1（仅我方）
    // [2026-09-29 莉莉子] 敌方最大法力同样受己方加成，上限仍钳在 10
    const newEnemyMaxMana = Math.min(10, newRound + enemyManaBonus);
    const tokenOwner = newRound % 2 !== 0 ? 'player' : 'enemy'; // 奇数玩家攻，偶数敌方攻
    // [修改] 根据回合归属，分配 'normal' 标识，另一方清空
    const nextAttackToken = {
        player: tokenOwner === 'player' ? 'normal' : null,
        enemy: tokenOwner === 'enemy' ? 'normal' : null
    };


    // 法力值存贮逻辑：多余 Mana 转入 Spell Mana（[2026-09-25 莉莉子 强化线] 上限由 spellManaCapOf 动态给出：共鸣涌流成长 / 囤积提额）
    const nextPlayerSpellMana = Math.min(spellManaCapOf(prev), prev.playerSpellMana + prev.playerMana);
    const nextEnemySpellMana = Math.min(3, prev.enemySpellMana + prev.enemyMana);

    return {
        round: newRound,
        playerMaxMana: newPlayerMaxMana,
        playerMana: newPlayerMaxMana, // 补满普通 Mana
        playerSpellMana: nextPlayerSpellMana,
        enemyMaxMana: newEnemyMaxMana,
        enemyMana: newEnemyMaxMana, // 补满普通 Mana
        enemySpellMana: nextEnemySpellMana,
        attackToken: nextAttackToken as any, // 这里的 as any 是为了防止TS类型推断还没更新时的临时报错，实际类型已匹配
        turnOwner: tokenOwner,
        phase: 'main',
        consecutivePasses: 0,
    };
};

/**
 * 检查是否买得起卡牌
 */
export const canAfford = (card: CardData, mana: number, spellMana: number, effectiveCost?: number) => {
    const cost = effectiveCost ?? card.cost;
    if (card.type.includes('unit')) return mana >= cost;
    return (mana + spellMana) >= cost;
};

/**
 * 计算扣费后的法力值
 */
export const calculateManaCost = (card: CardData, currentMana: number, currentSpellMana: number) => {
    let m = currentMana;
    let sm = currentSpellMana;
    const cost = card.cost;

    if (card.type.includes('spell')) {
        const usedSm = Math.min(cost, sm);
        sm -= usedSm;
        m -= (cost - usedSm);
    } else {
        m -= cost;
    }
    // [2026-07-22 莉莉子] 保险钳制：法力值不允许低于 0
    return { newMana: Math.max(0, m), newSpellMana: Math.max(0, sm) };
};