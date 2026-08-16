// ==========================================
// 装备系统 · 打出效果执行（逻辑层）
// [2026-08-12 莉莉子] 装备的静态修饰（费用/关键词/攻血）由 attachEquipment 挂载时写入卡牌数据，
//   本文件只管【打出时】声明的效果（onPlay）。useGameState 在单位出场的 ON_PLAY 时机调用本函数。
// ==========================================
import { getEquipmentDefs } from '../data/equipment';
import type { CardData } from '../types';

/**
 * 执行卡牌装备的打出时效果。
 * 当前仅一类：STRIKE_ENEMY_BENCH —— 对敌方备战席所有单位造成 value 点伤害。
 * 伤害处理参照 effectProcessor STRIKE：Barrier 破盾不受伤 / Tough 减 1。
 * @param enemyBench 调用方传入的敌方备战席最新快照（我方打出 → enemyBench；敌方打出 → playerBench）
 * @returns 更新后的敌方备战席数组；无打出效果时返回 null（调用方无需写回）
 */
export const executeEquipmentOnPlay = (
    enemyBench: CardData[],
    card: CardData,
): CardData[] | null => {
    const defs = getEquipmentDefs(card.equipment);
    const onPlay = defs.find(d => d.onPlay?.class === 'STRIKE_ENEMY_BENCH');
    if (!onPlay?.onPlay) return null;

    const dmg = onPlay.onPlay.value;

    const dealDamage = (c: CardData): CardData => {
        let next: CardData = { ...c };
        let actualDmg = dmg;
        if (actualDmg > 0 && next.keywords.includes('Barrier')) {
            // 屏障：破盾（黯淡关键词），本段伤害无效
            next.depletedKeywords = [...(next.depletedKeywords || []), 'Barrier'];
            next.animState = 'hit' as const;
            actualDmg = 0;
        } else if (actualDmg > 0 && next.keywords.includes('Tough')) {
            // 坚韧：法术伤害减 1
            actualDmg = Math.max(0, actualDmg - 1);
        }
        if (actualDmg > 0) {
            next.damageTaken = (next.damageTaken || 0) + actualDmg;
            next.animState = 'hit' as const;
        }
        return next;
    };

    return enemyBench.map(dealDamage);
};
