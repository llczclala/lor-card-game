// ==========================================
// 悖论迷宫 · 战斗内强化分发（共享查询 + 特效触发）
// [2026-08-11 莉莉子] 迷宫强化战斗内生效的核心支撑：
//   逻辑层（useGameState / useRoundLifecycle）按 trigger 查询玩家已拥有的战斗型强化，
//   再按 battleEffect.effectClass 执行（复用 createCard / RALLY 等现有机制）。
// ==========================================
import { MAZE_BUFFS, type MazeBuff, type BattleTrigger } from '../data/roguelike/buffs';
import { EQUIPMENT_BY_ID, type EquipmentTrigger } from '../data/equipment';
import { eventBus, GameEvents } from '../utils/eventBus';
import type { CardData } from '../types';
import { getPower, getHealth } from './keywords'; // [2026-08-27] 找最强单位用 · [2026-09-15 莉莉子] getHealth 用于打击强化的存活判据

/** 按触发时机筛选玩家已拥有的战斗型迷宫强化（无则返回空数组） */
export const getRogueDefs = (ids: string[] | undefined, trigger: BattleTrigger): MazeBuff[] =>
    (ids ?? [])
        .map(id => MAZE_BUFFS.find(b => b.id === id))
        .filter((b): b is MazeBuff => !!b && !!b.battleEffect && b.battleEffect.trigger === trigger);

/** 触发强化特效：我方水晶处卡面淡入淡出闪烁（复用，各处统一 emit） */
export const flashRogueBuff = (def: MazeBuff) => {
    eventBus.emit(GameEvents.ROGUE_BUFF_FLASH, { icon: def.icon, name: def.name });
};

// ==========================================
// [2026-08-19 莉莉子] 新一批强化执行辅助（永久 Buff 等）
// 赋予 = 永久（buffs），给予 = 本回合（roundBuffs）。新强化统一用永久。
// ==========================================
/** 永久加成：写入 buffs（区别于 roundBuffs 的本回合给予） */
export const applyPermanentBuff = (card: CardData, power = 0, health = 0): CardData => ({
    ...card,
    buffs: {
        power: (card.buffs?.power || 0) + power,
        health: (card.buffs?.health || 0) + health,
    },
});

/** 从某侧（备战席 + 交战区己方单位）找攻击力最高的存活单位；无则 undefined（[2026-08-27] 高级强化用） */
export const findStrongestUnit = (bench: CardData[], combatField: any[], owner: 'player' | 'enemy'): CardData | undefined => {
    const units = [
        ...bench.filter(c => !c.isDead && c.animState !== 'dying' && c.animState !== 'ephemeral_dying'),
        // [2026-08-30 莉莉子 修复] 补扫格挡侧：己方单位可能是 blocker（f.owner!==owner 的 f.blocker），此前只扫 attacker 漏了交战区格挡单位
        ...combatField.flatMap((f: any) => {
            const list: CardData[] = [];
            if (f.owner === owner && f.attacker && !f.attacker.isDead && f.attacker.animState !== 'dying' && f.attacker.animState !== 'ephemeral_dying') list.push(f.attacker);
            if (f.owner !== owner && f.blocker && !f.blocker.isDead && f.blocker.animState !== 'dying' && f.blocker.animState !== 'ephemeral_dying') list.push(f.blocker);
            return list;
        }),
    ];
    if (units.length === 0) return undefined;
    return units.reduce((a, b) => (getPower(b) > getPower(a) ? b : a));
};

/** 从友方池（备战席 + 交战区己方单位）随机挑一个存活单位；无则 undefined */
export const pickRandomAlly = (
    bench: CardData[],
    combatField: any[],
    owner: 'player' | 'enemy',
    excludeId?: string, // [2026-09-01] 排除指定单位（军势鼓舞/召唤浪潮：触发强化的打出卡不成为 BUFF 目标）
): CardData | undefined => {
    const allies: CardData[] = [
        ...bench,
        ...combatField.flatMap((f: any) => {
            const units: CardData[] = [];
            if (f.owner === owner && f.attacker) units.push(f.attacker);
            if (f.owner !== owner && f.blocker) units.push(f.blocker);
            return units;
        }),
    ].filter(c => !c.isDead && c.animState !== 'dying' && c.animState !== 'ephemeral_dying' && c.id !== excludeId);
    if (allies.length === 0) return undefined;
    return allies[Math.floor(Math.random() * allies.length)];
};

// ==========================================
// [2026-08-20 莉莉子] 成长型装备触发查询（挂在单张卡上，须在场存活才成长）
// 复用本文件的 applyPermanentBuff（永久+攻血）；调用点扫描在场单位 → getEquipTriggers 命中 → 应用
// ==========================================
/** 查询卡牌挂载的装备里是否有指定事件的成长项（self 型：目标=该卡自身） */
export const getEquipTriggers = (card: CardData | undefined | null, event: EquipmentTrigger['event']): EquipmentTrigger[] => {
    if (!card?.equipment?.length) return [];
    return card.equipment
        .map(id => EQUIPMENT_BY_ID[id]?.onTrigger)
        .filter((t): t is EquipmentTrigger => !!t && t.event === event);
};

/**
 * 攻血互等（永久）：
 * - mode 'health_to_power'：生命提升至等于攻击力（只增不减）
 * - mode 'power_to_health'：攻击力提升至等于生命值（只增不减）
 */
export const applyStatBalance = (card: CardData, mode: string): CardData => {
    const power = (card.power || 0) + (card.buffs?.power || 0) + (card.roundBuffs?.power || 0);
    const health = (card.health || 0) + (card.buffs?.health || 0) + (card.roundBuffs?.health || 0);
    if (mode === 'health_to_power') {
        const delta = power - health;
        return delta > 0 ? applyPermanentBuff(card, 0, delta) : card;
    }
    const delta = health - power;
    return delta > 0 ? applyPermanentBuff(card, delta, 0) : card;
};

/**
 * [2026-09-15 莉莉子 BUG修复] 打击类强化（after_attack / after_attacked）的统一存活判据。
 *
 * 为什么不能只看 animState：`animState === 'dying'` 只在**战斗结算**（combat.ts）里被写入；
 * 法术路径（effectProcessor 单挑 / rogueTrigger 王见王）只累加 damageTaken、**不设 dying**，
 * 于是"被这一击打死的单位"仍被判为存活 → 吃到 +1/+1 → 当前血量由 0 被拉回 1 → **变相复活**
 * （玩家反馈的「铁壁反击救活被打死的敌方单位」；玩家侧同构的「以守为攻」同样中招）。
 * 故必须叠加真实血量判定：getHealth <= 0 即已死（与 combat.ts 的 getCurrentHP 同构）。
 */
export const isStrikeTargetAlive = (c: CardData | undefined): c is CardData =>
    !!c
    && !c.isDead
    && c.animState !== 'dying' && c.animState !== 'ephemeral_dying'
    && getHealth(c) > 0;

/**
 * [2026-08-30 莉莉子] after_attack / after_attacked 强化触发（全覆盖：战斗/单挑/王见王）
 * 传入单位所属侧的强化 id 列表，命中 BUFF_SELF（以战养战/以守为攻/狂怒印记/铁壁反击）或 STAT_BALANCE（生命壁垒/攻守易形）
 * 返回强化后的单位；无命中返回原单位。调用方负责把返回值写回战场。
 * 注：战斗路径（useGameState）仍用内联实现（已验证），本函数供单挑（effectProcessor）与王见王（useRoundLifecycle）复用。
 */
export const applyStrikeEnhancement = (
    enhIds: string[] | undefined,
    trigger: 'after_attack' | 'after_attacked',
    unit: CardData,
): CardData => {
    // [2026-09-15 莉莉子 BUG修复] 入口统一拦截已阵亡单位：
    // 被这一击打死的单位绝不能再吃成长，否则 +1/+1 会把当前血量从 0 拉回 1（铁壁反击/以守为攻"救活"BUG）。
    // 放这里可一次覆盖单挑（effectProcessor ×2）与王见王（rogueTrigger ×2）四条调用路径。
    if (!isStrikeTargetAlive(unit)) return unit;
    let out = unit;
    getRogueDefs(enhIds, trigger).forEach(def => {
        const be = def.battleEffect!;
        if (be.effectClass === 'BUFF_SELF') {
            out = applyPermanentBuff(out, (be.params?.power as number) ?? 0, (be.params?.health as number) ?? 0);
        } else if (be.effectClass === 'STAT_BALANCE') {
            out = applyStatBalance(out, (be.params?.mode as string) ?? 'health_to_power');
        }
        flashRogueBuff(def);
    });
    return out;
};
