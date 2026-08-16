// ==========================================
// 装备系统 · 统一装备库（挂载在单张卡牌上）
// [2026-08-12 莉莉子] 装备区别于迷宫强化（团队被动）——装备只强化单张卡牌。
//   - 视觉：六边形方块，挂载在手牌卡面样式外的右侧右下角，多个从下往上依次排列
//   - 效果：attachEquipment 挂载时把静态修饰（费用/关键词/攻血）写入卡牌数据，
//     渲染 / 费用判定 / 战斗数值全部走现有数据通路；打出时效果（onPlay）声明式执行
//   - 挂载入口（战斗奖励 / 商店 / 牌组）由后续系统调用 attachEquipment 接入，本文件只管定义 + 挂载工具
// ==========================================

import type { CardData, Keyword } from '../types';
import abc_spell from '../image/spells/abc.png';

export type EquipmentRarity = 'common' | 'rare' | 'epic' | 'legendary';

/** 装备打出时效果声明（当前仅一类：打出时打击敌方备战席） */
export interface EquipmentOnPlay {
    class: 'STRIKE_ENEMY_BENCH';
    value: number; // 对敌方备战席所有单位造成的伤害
}

/** 装备回合开始效果声明（武装用，当前仅一类：回合开始恢复全部法术法力） */
export interface EquipmentRoundStart {
    class: 'RESTORE_SPELL_MANA'; // 回合开始恢复己方全部法术法力
}

export interface EquipmentDef {
    id: string;
    name: string;
    description: string;
    rarity: EquipmentRarity;
    icon: string;             // 六边形中间卡面（当前 abc.png 占位）
    isArmament?: boolean;     // [2026-08-14 武装] 武装=特殊装备：局外带入、局内不可获取，进入游戏前配置
    costMod?: number;         // [静态修饰] 费用修正（装备1：-1）
    keywords?: Keyword[];     // [静态修饰] 附加关键词（装备2：QuickAttack）
    powerMod?: number;        // [静态修饰] 攻击修正（装备4：+4）
    healthMod?: number;       // [静态修饰] 生命修正（装备4：+4）
    onPlay?: EquipmentOnPlay; // [打出时效果] 声明式执行（装备3）
    onRoundStart?: EquipmentRoundStart; // [2026-08-14 武装] 回合开始效果（武装C）
}

export const EQUIPMENT_DEFS: EquipmentDef[] = [
    {
        id: 'equip_cost_down',
        name: '微缩回路',
        description: '使卡牌费用 -1。',
        rarity: 'common', icon: abc_spell,
        costMod: -1,
    },
    {
        id: 'equip_quick_attack',
        name: '迅击模组',
        description: '使卡牌获得【快速攻击】。',
        rarity: 'rare', icon: abc_spell,
        keywords: ['QuickAttack'],
    },
    {
        id: 'equip_bench_bomb',
        name: '备战爆破',
        description: '打出时，对敌方备战席上的所有单位造成 2 点伤害。',
        rarity: 'epic', icon: abc_spell,
        onPlay: { class: 'STRIKE_ENEMY_BENCH', value: 2 },
    },
    {
        id: 'equip_big_stats',
        name: '钢铁核心',
        description: '使卡牌获得 +4/+4。',
        rarity: 'legendary', icon: abc_spell,
        powerMod: 4, healthMod: 4,
    },
    // ── 武装（[2026-08-14] 特殊装备：局外带入、局内不可获取，进入游戏前配置到武装槽）──
    {
        id: 'arm_power_health',
        name: '盈实徽记',
        description: '使卡牌获得 +1/+1。',
        rarity: 'common', icon: abc_spell,
        isArmament: true,
        powerMod: 1, healthMod: 1,
    },
    {
        id: 'arm_cost_down',
        name: '虚空降格',
        description: '使卡牌费用 -2。',
        rarity: 'epic', icon: abc_spell,
        isArmament: true,
        costMod: -2,
    },
    {
        id: 'arm_spell_mana',
        name: '秘法回响',
        description: '回合开始时，恢复己方全部法术法力。',
        rarity: 'rare', icon: abc_spell,
        isArmament: true,
        onRoundStart: { class: 'RESTORE_SPELL_MANA' },
    },
];

// ── 派生视图 ──
export const EQUIPMENT_BY_ID: Record<string, EquipmentDef> = Object.fromEntries(EQUIPMENT_DEFS.map(e => [e.id, e]));
export const getEquipmentById = (id: string): EquipmentDef | undefined => EQUIPMENT_BY_ID[id];

/** id 列表 → 装备定义列表（过滤无效 id） */
export const getEquipmentDefs = (equipment?: string[]): EquipmentDef[] =>
    (equipment ?? [])
        .map(id => EQUIPMENT_BY_ID[id])
        .filter((e): e is EquipmentDef => !!e);

// ── 武装（[2026-08-14] 特殊装备）──
/** 全部武装定义（isArmament 过滤；武装界面列表用） */
export const getArmamentDefs = (): EquipmentDef[] => EQUIPMENT_DEFS.filter(e => e.isArmament);

/**
 * 挂载一件装备到卡牌：把静态修饰效果（费用 / 关键词 / 攻血）写入卡牌数据 + 追加 equipment 标记。
 * 返回新卡牌对象（不改原引用）。渲染 / 费用判定 / 战斗数值随后全部自动生效。
 * 后续系统（奖励 / 商店 / 牌组）调用本工具接入。
 */
export const attachEquipment = (card: CardData, equipId: string): CardData => {
    const def = EQUIPMENT_BY_ID[equipId];
    if (!def) return card;
    if (card.equipment?.includes(equipId)) return card; // 防重复挂载

    const next: CardData = { ...card };
    next.equipment = [...(next.equipment || []), equipId];

    if (def.costMod) {
        next.cost = Math.max(0, (next.cost || 0) + def.costMod);
        // [2026-08-15 莉莉子] 减费标记：费用被降低时设 customProgress bit2 → 手牌费用显示绿色（isCostReduced）
        if (def.costMod < 0) next.customProgress = (next.customProgress || 0) | 2;
    }
    if (def.keywords?.length) {
        next.keywords = Array.from(new Set([...(next.keywords || []), ...def.keywords]));
    }
    if (def.powerMod || def.healthMod) {
        const buffs = { ...(next.buffs || { power: 0, health: 0 }) };
        buffs.power = (buffs.power || 0) + (def.powerMod || 0);
        buffs.health = (buffs.health || 0) + (def.healthMod || 0);
        next.buffs = buffs;
    }
    return next;
};
