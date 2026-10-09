// ==========================================
// 装备系统 · 打出效果执行（逻辑层）
// [2026-08-12 莉莉子] 装备的静态修饰（费用/关键词/攻血）由 attachEquipment 挂载时写入卡牌数据，
//   本文件只管【打出时】声明的效果（onPlay）。useGameState 在单位出场的 ON_PLAY 时机调用本函数。
// ==========================================
import { getEquipmentDefs } from '../data/equipment';
import type { CardData } from '../types';

/**
 * 执行卡牌装备的打出时效果。
 *
 * 现两类：
 *   · STRIKE_ENEMY_BENCH —— 对**敌方**备战席所有单位造成 value 点伤害（装备「备战爆破」）。
 *     伤害处理参照 effectProcessor STRIKE：Barrier 破盾不受伤 / Tough 减 1。
 *   · POISON_ENEMY_ALL —— [2026-09-12 莉莉子 剧毒] 赋予**敌方**全体【剧毒】（负面 debuff）。
 *
 * ═══ [2026-10-04 莉莉子 BUG修复 · 「备战爆破」炸自己] ═══
 *   🔴 病根：**原签名 `(enemyBench, card)` 把"打哪一侧"的判断推给了调用方**，
 *     而 `useGameState` 的**通用 ON_PLAY 路径**（玩家与 AI **都走**）硬编码传了 `tempEnemyBench`
 *     ⇒ AI 打出携带「备战爆破」的单位时，炸的是**它自己那侧**（粉丝：「AI 的单位带这装备时都会打自己」）。
 *     📌 正是 code.md「敌我判断黄金法则」里那条老毛病：`'enemy'` 是**施法者视角**的敌方，
 *        而 `enemyBench` 只是**引擎坐标**里的一侧 —— 两者只有在"玩家打出"时才恰好重合。
 *
 *   ✅ 修法（收口，而不是在两处调用各修一遍）：签名改为 **「双方备战席 + owner」**，
 *     目标侧由**本函数内部**按 owner 推导 ⇒ 调用方只提供事实，**不再有机会传错**。
 *
 * @param benches 双方的备战席快照
 * @param card    刚打出的单位（读它身上装备的 onPlay 定义）
 * @param owner   打出方的阵营（`'player'` | `'enemy'`）
 * @returns 被影响的一侧 + 更新后的该侧数组；无打出效果时返回 `null`（调用方无需写回）
 */
export const executeEquipmentOnPlay = (
    benches: { playerBench: CardData[]; enemyBench: CardData[] },
    card: CardData,
    owner: 'player' | 'enemy',
): { side: 'player' | 'enemy'; bench: CardData[] } | null => {
    const defs = getEquipmentDefs(card.equipment);
    // 🔴 [2026-10-06 莉莉子 · 审计收口] 原先 `defs.find(d => d.onPlay)?.onPlay` **只取第一件** ⇒
    //   一张卡同挂「备战爆破」+「送行礼箱」时**只有先挂的那件生效**（模式 A：顶掉）。
    //   现改为**按挂载顺序全部结算**（毒与伤害各自独立，互不吞）。
    const onPlays = defs.flatMap(d => (d.onPlay ? [d.onPlay] : []));
    if (onPlays.length === 0) return null;

    // 目标 = 打出方的**对面**（装备文案写的是"对敌方备战席"，视角必须锚在打出者身上）
    const side: 'player' | 'enemy' = owner === 'player' ? 'enemy' : 'player';
    const targetBench = side === 'player' ? benches.playerBench : benches.enemyBench;

    let bench = targetBench;
    for (const onPlay of onPlays) {
        // ---- [剧毒] 瓦莱莉的送行礼箱：打出时给敌方全体上毒 ----
        // 注：ON_PLAY 发生在 main 阶段，此时交战区按引擎不变量恒为空（见 09-11 交战区不变量守卫），
        //     故"敌方全体"在实战中即等于"敌方备战席全体"，与 STRIKE_ENEMY_BENCH 口径一致。
        if (onPlay.class === 'POISON_ENEMY_ALL') {
            bench = bench.map(c =>
                c.keywords.includes('Deadly')
                    ? c // 已中毒的不重复叠加
                    : { ...c, keywords: [...c.keywords, 'Deadly' as const] }
            );
            continue;
        }

        const dmg = onPlay.value;

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

        bench = bench.map(dealDamage);
    }

    return { side, bench };
};
