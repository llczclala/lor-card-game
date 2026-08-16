// ==========================================
// 悖论迷宫 · 统一迷宫强化库（玩家 + 敌人共用）
// [2026-08-11 莉莉子] 玩家与敌人共用一套迷宫强化，用两个开关字段做细致化区分：
//   - playerEligible：玩家能否刷取到（迷宫强化节点 3 选 1）
//   - enemyEligible ：敌方卡组编辑器能否给敌人配置（敌人从配置库随机携带）
// 消费者经门面文件（enhancements.ts 玩家侧 / enemyBuffs.ts 敌人侧）按开关过滤，
// 不直接依赖本文件（除 EnemyDeckEditor / NodePreviewPanel 等专用场景）。
// 敌人动态携带规则：深度（节点列位置）越深 → 携带越多越稀有（ENEMY_BUFF_ROLL 可精调）。
// ==========================================

import abc_spell from '../../image/spells/abc.png';
import { SPELL_IMAGES, UNIT_IMAGES } from '../imageData';

export type EnhancementEffectType = 'max_hp' | 'heal' | 'gold' | 'add_card' | 'passive';
export type EnhancementRarity = 'common' | 'rare' | 'epic' | 'legendary';

// [2026-08-11 莉莉子] 战斗内被动强化声明（第一批 LOR 移植强化）
// 逻辑层（useGameState / useRoundLifecycle）按 trigger 分发、按 effectClass 执行。
export type BattleTrigger = 'game_start' | 'round_start' | 'on_summon' | 'on_first_summon';
export type BattleEffectClass = 'GENERATE' | 'SUMMON' | 'BUFF' | 'RALLY' | 'CLONE_AND_SUMMON';
export interface BattleEffectDef {
    trigger: BattleTrigger;
    effectClass: BattleEffectClass;
    params?: Record<string, unknown>; // 执行参数，逻辑层按类读取
}

export interface EnhancementEffect {
    type: EnhancementEffectType;
    value?: number;   // max_hp: 数值；heal: 百分比；gold: 数值
    cardKey?: string; // add_card: 固定卡 key
}

export interface MazeBuff {
    id: string;
    name: string;
    description: string;
    rarity: EnhancementRarity;
    icon: string;
    effect?: EnhancementEffect; // 玩家强化必填（即时生效）；敌方 BUFF 情报占位可为空（战斗暂不生效）
    battleEffect?: BattleEffectDef; // [2026-08-11] 战斗内被动强化声明（触发时机 + 效果类）；玩家战斗型强化专用
    playerEligible: boolean;    // [接口开关] 玩家能否刷取到
    enemyEligible: boolean;     // [接口开关] 敌方卡组编辑器能否配置
}

export const MAZE_BUFFS: MazeBuff[] = [
    // ── 玩家迷宫强化（playerEligible，敌人侧不开放）──
    {
        id: 'enhance_heart', name: '巨像心核', description: '最大生命 +10，并回复 10 点生命。',
        rarity: 'epic', icon: abc_spell, effect: { type: 'max_hp', value: 10 },
        playerEligible: true, enemyEligible: false,
    },
    {
        id: 'enhance_gold', name: '数据洪流', description: '获得 80 枚数据金。',
        rarity: 'common', icon: abc_spell, effect: { type: 'gold', value: 80 },
        playerEligible: true, enemyEligible: false,
    },
    {
        id: 'enhance_card', name: '残响翻新', description: '获得一张随机可收集卡牌。',
        rarity: 'rare', icon: abc_spell, effect: { type: 'add_card' },
        playerEligible: true, enemyEligible: false,
    },
    {
        id: 'enhance_heal', name: '源质灌注', description: '回复 50% 最大生命。',
        rarity: 'legendary', icon: abc_spell, effect: { type: 'heal', value: 50 },
        playerEligible: true, enemyEligible: false,
    },

    // ── 玩家战斗型强化（第一批 LOR 移植，battleEffect 战斗内真实生效；effect=passive 仅占即时位）──
    {
        id: 'enhance_dark_arrow', name: '暗箭难防', description: '回合开始时，在手牌中生成一张瞬逝的暗箭。',
        rarity: 'common', icon: SPELL_IMAGES.hidden_arrow, effect: { type: 'passive' },
        battleEffect: { trigger: 'round_start', effectClass: 'GENERATE', params: { generateKey: 'hidden_arrow', isVolatile: true } },
        playerEligible: true, enemyEligible: false,
    },
    {
        id: 'enhance_ghost_action', name: '幽灵行动', description: '开局召唤 1 费的鬼怪“安提娜”。',
        rarity: 'common', icon: UNIT_IMAGES.antina, effect: { type: 'passive' },
        battleEffect: { trigger: 'game_start', effectClass: 'SUMMON', params: { summonKey: 'Ghost_Squad_Antina' } },
        playerEligible: true, enemyEligible: false,
    },
    {
        id: 'enhance_seize_moment', name: '机不可失', description: '召唤单位时，本回合给予它 +1/+1。',
        rarity: 'rare', icon: SPELL_IMAGES.full_purification, effect: { type: 'passive' },
        battleEffect: { trigger: 'on_summon', effectClass: 'BUFF', params: { power: 1, health: 1, duration: 'ROUND' } },
        playerEligible: true, enemyEligible: false,
    },
    {
        id: 'enhance_fighting_spirit', name: '战意盎然', description: '回合开始时，进行备战。',
        rarity: 'epic', icon: SPELL_IMAGES.focus, effect: { type: 'passive' },
        battleEffect: { trigger: 'round_start', effectClass: 'RALLY' },
        playerEligible: true, enemyEligible: false,
    },
    {
        id: 'enhance_shadow_twin', name: '暗影双生', description: '每回合首次打出的单位，召唤一个临时的复制单位。',
        rarity: 'legendary', icon: SPELL_IMAGES.toad_pattern, effect: { type: 'passive' },
        battleEffect: { trigger: 'on_first_summon', effectClass: 'CLONE_AND_SUMMON' },
        playerEligible: true, enemyEligible: false,
    },

    // ── 敌方迷宫BUFF（enemyEligible，占位文案·纯情报，战斗生效后续接）──
    {
        id: 'ebuff_vanguard', name: '攻坚军备', description: '敌人攻势更为凶猛。',
        rarity: 'common', icon: abc_spell, playerEligible: false, enemyEligible: true,
    },
    {
        id: 'ebuff_armor', name: '装甲涂层', description: '敌人获得额外护甲。',
        rarity: 'common', icon: abc_spell, playerEligible: false, enemyEligible: true,
    },
    {
        id: 'ebuff_berserk', name: '狂暴印记', description: '敌人攻击欲望提升。',
        rarity: 'rare', icon: abc_spell, playerEligible: false, enemyEligible: true,
    },
    {
        id: 'ebuff_regen', name: '愈合协议', description: '敌人每回合恢复生命。',
        rarity: 'rare', icon: abc_spell, playerEligible: false, enemyEligible: true,
    },
    {
        id: 'ebuff_phaseshield', name: '相位护盾', description: '敌人获得护盾减伤。',
        rarity: 'epic', icon: abc_spell, playerEligible: false, enemyEligible: true,
    },
    {
        id: 'ebuff_wrath', name: '血怒', description: '敌人随战斗推进愈发强大。',
        rarity: 'epic', icon: abc_spell, playerEligible: false, enemyEligible: true,
    },
    {
        id: 'ebuff_immortal', name: '不朽契约', description: '敌人更难被击败。',
        rarity: 'legendary', icon: abc_spell, playerEligible: false, enemyEligible: true,
    },
    {
        id: 'ebuff_doom', name: '末日预兆', description: '敌人掌握致命力量。',
        rarity: 'legendary', icon: abc_spell, playerEligible: false, enemyEligible: true,
    },
];

// ── 派生视图 ──
export const PLAYER_ENHANCEMENTS = MAZE_BUFFS.filter(b => b.playerEligible);
export const ENEMY_ELIGIBLE_BUFFS = MAZE_BUFFS.filter(b => b.enemyEligible);
export const MAZE_BUFF_BY_ID: Record<string, MazeBuff> = Object.fromEntries(MAZE_BUFFS.map(b => [b.id, b]));
export const getBuffById = (id: string): MazeBuff | undefined => MAZE_BUFF_BY_ID[id];

// ==========================================
// 敌人动态携带抽选规则（简单版·程暂定，后续随迷宫开发精调）
// 深度 depthFrac ∈ [0,1]（节点列位置归一化）→ 数量 1→3 递增 + 稀有度上限 common→legendary
// ==========================================
const RARITY_RANK: Record<EnhancementRarity, number> = { common: 0, rare: 1, epic: 2, legendary: 3 };

export const ENEMY_BUFF_ROLL = {
    countByDepth: [
        { maxFrac: 0.34, count: 1 },
        { maxFrac: 0.67, count: 2 },
        { maxFrac: 1.01, count: 3 },
    ],
    maxRarityByDepth: [
        { maxFrac: 0.2, rarity: 'common' as const },
        { maxFrac: 0.45, rarity: 'rare' as const },
        { maxFrac: 0.7, rarity: 'epic' as const },
        { maxFrac: 1.01, rarity: 'legendary' as const },
    ],
};

/**
 * 从流派配置的可携带库中，按深度随机抽出实际携带的迷宫强化 id 列表。
 * @param rogueBuffs 流派预配置的强化 id 库（archetype.rogueBuffs，编辑器配置）
 * @param depthFrac  迷宫深度 0~1（节点列位置归一化）
 */
export const rollEnemyBuffs = (rogueBuffs: string[] | undefined, depthFrac: number): string[] => {
    const ids = rogueBuffs ?? [];
    if (ids.length === 0) return [];
    const frac = Math.max(0, Math.min(1, depthFrac));

    const pool = ids
        .map(id => MAZE_BUFF_BY_ID[id])
        .filter((b): b is MazeBuff => !!b && b.enemyEligible);
    if (pool.length === 0) return [];

    const count = ENEMY_BUFF_ROLL.countByDepth.find(t => frac < t.maxFrac)?.count
        ?? ENEMY_BUFF_ROLL.countByDepth[ENEMY_BUFF_ROLL.countByDepth.length - 1].count;
    const maxRarity = ENEMY_BUFF_ROLL.maxRarityByDepth.find(t => frac < t.maxFrac)?.rarity ?? 'legendary';
    const maxRank = RARITY_RANK[maxRarity];

    // 只允许稀有度 ≤ 深度上限的强化（浅层只出 common，深层可出 epic/legendary）
    const allowed = pool.filter(b => RARITY_RANK[b.rarity] <= maxRank);
    if (allowed.length === 0) return []; // 浅层但流派只配高阶 → 宁可空不越阶

    const n = Math.min(count, allowed.length);
    const result: MazeBuff[] = [];
    const rest = [...allowed];
    while (result.length < n && rest.length > 0) {
        const idx = Math.floor(Math.random() * rest.length);
        result.push(rest[idx]);
        rest.splice(idx, 1); // 不重复选同一个
    }
    return result.map(b => b.id);
};
