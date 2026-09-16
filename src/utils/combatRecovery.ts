// [2026-09-03 莉莉子] 交战区幸存者应急归位（共享工具）
//
// 供 animating 死锁逃生使用：当某条动画结算链异常中断、交战区单位无法走正常归位路径时，
// 把交战区"仍存活的幸存者"按归属放回备战席（幂等去重），并清空交战区。
// 刻意不重算进攻标识消耗、不补结算战斗——只保证"单位不蒸发 + 流程可继续"，
// 由调用方（各 hook / watchdog）决定是否把 phase 兜底回 main。
import type { Dispatch, SetStateAction } from 'react';
import type { CardData, GameState } from '../types';

export interface RecoverySetters {
    setPlayerBench: Dispatch<SetStateAction<CardData[]>>;
    setEnemyBench: Dispatch<SetStateAction<CardData[]>>;
    setCombatField: Dispatch<SetStateAction<any[]>>;
    setGame: Dispatch<SetStateAction<GameState>>;
}

/**
 * 把交战区存活幸存者归位回备战席 + 清空交战区。
 * @param combatField 当前交战区（外部传入，避免依赖调用方闭包 state）
 * @param playerBench / enemyBench 当前双方备战席（用于幂等去重）
 */
export const recoverCombatSurvivors = (
    combatField: any[],
    playerBench: CardData[],
    enemyBench: CardData[],
    setters: RecoverySetters,
) => {
    const seen = new Set<string>();
    const pull = (unit: any, side: 'player' | 'enemy', out: CardData[]) => {
        if (!unit) return;
        if (unit.isDead || unit.animState === 'dying' || unit.animState === 'ephemeral_dying') return;
        if (seen.has(unit.id)) return;
        seen.add(unit.id);
        const bench = side === 'player' ? playerBench : enemyBench;
        if (bench.some(c => c.id === unit.id)) return; // 已在席则跳过，防重复入席
        out.push({ ...unit, animState: 'idle' as const });
    };
    const sp: CardData[] = [];
    const se: CardData[] = [];
    combatField.forEach((f: any) => {
        if (!f) return;
        if (f.attacker) {
            if (f.owner === 'player') pull(f.attacker, 'player', sp);
            else pull(f.attacker, 'enemy', se);
        }
        if (f.blocker) {
            // blocker 归属与 f.owner 相反（f.owner 是进攻发起方）
            if (f.owner === 'player') pull(f.blocker, 'enemy', se);
            else pull(f.blocker, 'player', sp);
        }
    });
    if (sp.length) setters.setPlayerBench(prev => [...prev.filter(c => !sp.some(s => s.id === c.id)), ...sp]);
    if (se.length) setters.setEnemyBench(prev => [...prev.filter(c => !se.some(s => s.id === c.id)), ...se]);
    setters.setCombatField([]);
};
