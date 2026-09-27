// 关键修复：添加 type 关键字
import type { CardData, GameState } from '../types';
import { spellManaCapBonusOf, hoardSpellManaCapOf } from './questTracker';

/**
 * [2026-09-25 莉莉子 强化线] 本场「法术法力池上限」：基础 3 + 共鸣涌流成长 + 囤积的溢出额度。
 *   这两件强化不改战斗内的即时效果，改的是**回合边界的资源规则** —— 所以统一在这里算，
 *   而"溢出多少"天然受剩余法力限制（上限抬高 ≠ 白送法力）。
 */
export const spellManaCapOf = (g: GameState): number =>
    3 + spellManaCapBonusOf(g.questProgress, g.rogueEnhancements) + hoardSpellManaCapOf(g.rogueEnhancements);

/**
 * 计算回合开始时的状态变更
 */
export const calculateRoundStart = (currentGame: GameState): Partial<GameState> => {
    const prev = currentGame;

    // 如果是第0回合(初始化)，直接跳到第1回合
    if (prev.round === 0) {
        return {
            round: 1,
            playerMaxMana: 1, playerMana: 1, playerSpellMana: 0,
            enemyMaxMana: 1, enemyMana: 1, enemySpellMana: 0,
            attackToken: { player: 'normal', enemy: null },
            turnOwner: 'player',
            phase: 'main',
            consecutivePasses: 0,
        };
    }

    const newRound = prev.round + 1;
    const newMaxMana = Math.min(10, newRound);
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
        playerMaxMana: newMaxMana,
        playerMana: newMaxMana, // 补满普通 Mana
        playerSpellMana: nextPlayerSpellMana,
        enemyMaxMana: newMaxMana,
        enemyMana: newMaxMana, // 补满普通 Mana
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