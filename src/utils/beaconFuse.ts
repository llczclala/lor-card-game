import type { CardData } from '../types';
import { eventBus } from './eventBus';

/**
 * [2026-10-09 莉莉子 BUG修复 · `BUG-20261009-01`] 獠牙信标「引爆倒计时」的**唯一实现**
 *
 * ── 规则口径（`data/cards.ts:558` / `data/announcements.ts:462`）──
 *   「敌方每有 1 个单位进攻，本单位 -1 血；若这次进攻拉取了我方暴露单位格挡，则再 -1 血。」
 *   ⇒ 某方派出 N 个单位进攻 → **对面**备战席上的信标 −N；被拉取格挡每 1 个再 −1。
 *
 * ── 为什么要收成这个文件（病根）──
 *   该规则原先**只**埋在 `useGameState.commitAttack` 内部（进攻宣告那一刻）。
 *   而飞剑是「由 `effectProcessor` 直接塞进交战区 + 只把 phase 切成 block_declare」进场的，
 *   三条进场路径（守卫 / 法术结算收尾 / ON_PLAY 战吼）**都不经过 commitAttack**
 *   ⇒ 飞剑发起的进攻从不结算倒计时（程 2026-10-09 实测：信标一声不响）。
 *   现在规则只此一份，**两个调用点**共用：
 *     ① `useGameState.commitAttack`（常规进攻宣告 · 口径仍是 `initialFighters`）
 *     ② `effectProcessor` 的 `FLYING_SWORD` 分支（造剑处 · 按**实际召出把数**）
 *
 * ── 纯函数约束 ──
 *   ① 不碰任何 setter / React state：只收数组、只返回数组
 *   ② **无变化一律返回原引用**（调用方靠身份比较决定要不要提交，与改动前口径一致）
 *   ③ `unit_damage` 广播必须保留 —— 它专为修 2026-09-19「信标掉血无声、无飘字」而加
 */

/** 獠牙信标的卡 key（唯一真源，勿在别处再抄一份） */
export const BEACON_KEY = 'Marian_Wolf_Tooth_Beacon';

export type BeaconSide = 'player' | 'enemy';

export interface BeaconFuseInput {
    playerBench: CardData[];
    enemyBench: CardData[];
    combatField: any[];
    /** 本次「发起进攻」的单位数（**每个单位各算 1**，不是按进攻动作算） */
    attackersBySide: Record<BeaconSide, number>;
    /** 本次「被拉取上场格挡」的次数（挑战者 / 暴露引擎），每被拉 1 个算 1 */
    challengedBySide: Record<BeaconSide, number>;
    /** 日志标签：区分调用来源（如「进攻宣告」/「飞剑×4」），排障用 */
    source?: string;
}

export interface BeaconFuseOutput {
    playerBench: CardData[];
    enemyBench: CardData[];
    combatField: any[];
    /** 本次实际扣向各侧信标的伤害（0 = 该侧没扣） */
    damageToPlayerBeacon: number;
    damageToEnemyBeacon: number;
}

export const applyBeaconFuse = (input: BeaconFuseInput): BeaconFuseOutput => {
    const {
        playerBench, enemyBench, combatField,
        attackersBySide, challengedBySide,
        source = '未知来源',
    } = input;

    /** 给单个信标挂伤害；非信标 / 已死 / 正在播死亡演出 → 原样返回（引用不变，便于判空） */
    const hitBeaconOne = (c: CardData, amount: number): CardData => {
        if (!(amount > 0 && c.key === BEACON_KEY && !c.isDead && c.animState !== 'dying')) return c;
        // [2026-09-19] 补推 unit_damage：此前倒计时掉血**连事件都不发**
        //   ⇒ 没有飘字、也没有受击音（程报"信标掉血完全无声"就是这个）。
        //   ⚠️ 搬进本工具时**必须一起带走**，否则该问题复发。
        eventBus.emit('unit_damage', { id: c.id, amount, key: c.key }); // key 供音效层路由「信标专属受击音」
        return { ...c, damageTaken: (c.damageTaken || 0) + amount, animState: 'hit' as const };
    };

    /** 备战席版：整排扫；无变化则返回原引用 */
    const damageBeacon = (bench: CardData[], amount: number): CardData[] => {
        if (amount <= 0) return bench;
        let hit = false;
        const next = bench.map(c => {
            const n = hitBeaconOne(c, amount);
            if (n !== c) hit = true;
            return n;
        });
        return hit ? next : bench;
    };

    /**
     * 交战区版 —— 信标被【暴露】拉上场格挡时，只扫备战席会让它「隐身」，
     *   导致「进攻 N 个单位 → 信标 −N」对场上信标完全不结算（2026-09-18 修过）。
     * 归属判定：attacker 属 `fight.owner`，blocker 属**对面**。
     */
    const damageBeaconInField = (field: any[], dmgForPlayer: number, dmgForEnemy: number): any[] => {
        if (dmgForPlayer <= 0 && dmgForEnemy <= 0) return field;
        let changed = false;
        const next = field.map(fight => {
            let nf = fight;
            if (fight.attacker) {
                const n = hitBeaconOne(fight.attacker, fight.owner === 'player' ? dmgForPlayer : dmgForEnemy);
                if (n !== fight.attacker) { nf = { ...nf, attacker: n }; changed = true; }
            }
            if (fight.blocker) {
                const blockerSide: BeaconSide = fight.owner === 'player' ? 'enemy' : 'player';
                const n = hitBeaconOne(fight.blocker, blockerSide === 'player' ? dmgForPlayer : dmgForEnemy);
                if (n !== fight.blocker) { nf = { ...nf, blocker: n }; changed = true; }
            }
            return nf;
        });
        return changed ? next : field;
    };

    // 玩家进攻 → 敌方备战席的信标掉血；敌方进攻 → 我方备战席的信标掉血
    // 被拉取格挡的额外 −1 一并计入
    const damageToEnemyBeacon = attackersBySide.player + challengedBySide.player;
    const damageToPlayerBeacon = attackersBySide.enemy + challengedBySide.enemy;

    const nextEnemyBench = damageBeacon(enemyBench, damageToEnemyBeacon);
    const nextPlayerBench = damageBeacon(playerBench, damageToPlayerBeacon);
    const nextCombatField = damageBeaconInField(combatField, damageToPlayerBeacon, damageToEnemyBeacon);

    if (nextEnemyBench !== enemyBench) {
        console.log(`[BeaconDebug] 引爆倒计时（${source}）：玩家进攻 ${attackersBySide.player} 个单位 + 被拉取格挡 ${challengedBySide.player} 次 → 敌方信标 −${damageToEnemyBeacon}`);
    }
    if (nextPlayerBench !== playerBench) {
        console.log(`[BeaconDebug] 引爆倒计时（${source}）：敌方进攻 ${attackersBySide.enemy} 个单位 + 被拉取格挡 ${challengedBySide.enemy} 次 → 我方信标 −${damageToPlayerBeacon}`);
    }
    if (nextCombatField !== combatField) {
        console.log(`[BeaconDebug] 引爆倒计时（${source}）：交战区内的信标一并结算（玩家侧 −${damageToPlayerBeacon} / 敌方侧 −${damageToEnemyBeacon}）`);
    }

    return {
        playerBench: nextPlayerBench,
        enemyBench: nextEnemyBench,
        combatField: nextCombatField,
        damageToPlayerBeacon,
        damageToEnemyBeacon,
    };
};
