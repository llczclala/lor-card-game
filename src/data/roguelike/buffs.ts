// ==========================================
// 悖论迷宫 · 统一迷宫强化库（玩家 + 敌人共用）
// [2026-08-11 莉莉子] 玩家与敌人共用一套迷宫强化，用两个开关字段做细致化区分：
//   - playerEligible：玩家能否刷取到（迷宫强化节点 3 选 1）
//   - enemyEligible ：敌方卡组编辑器能否给敌人配置（敌人从配置库随机携带）
// 消费者经门面文件（enhancements.ts 玩家侧 / enemyBuffs.ts 敌人侧）按开关过滤，
// 不直接依赖本文件（除 EnemyDeckEditor / NodePreviewPanel 等专用场景）。
// 敌人动态携带规则：迷宫路径深度（从起点数层，越深入）越深 → 携带越多、品质越高（品质加权抽选，ENEMY_BUFF_ROLL 可精调）。
// [2026-08-27] 池子默认全部 enemyEligible 强化（流派未手配即全库自动），战斗实际携带由 rollEnemyBuffs 抽 1~3 个。
// ==========================================

import abc_spell from '../../image/spells/abc.webp';
import { SPELL_IMAGES, UNIT_IMAGES } from '../imageData';
import { type RogueDifficulty } from './difficulties'; // [2026-08-28] 敌人强化按难度分层

export type EnhancementEffectType = 'max_hp' | 'heal' | 'gold' | 'add_card' | 'passive';
// [2026-08-27 莉莉子] 六档品质：白 common / 绿 uncommon / 蓝 rare / 紫 epic / 金 legendary / 红 mythic
export type EnhancementRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' | 'mythic';

// [2026-08-11 莉莉子] 战斗内被动强化声明（第一批 LOR 移植强化）
// 逻辑层（useGameState / useRoundLifecycle）按 trigger 分发、按 effectClass 执行。
export type BattleTrigger = 'game_start' | 'round_start' | 'on_summon' | 'on_first_summon'
    // [2026-08-19 莉莉子] 新一批强化触发时机
    | 'after_attack'         // 我方单位打击后
    | 'after_attacked'       // 我方单位被打击后
    | 'on_cast_spell'        // 打出法术卡牌时
    | 'on_play_unit'         // 打出单位卡牌时
    | 'on_first_play_unit'   // 每回合首个打出的单位
    | 'on_nexus_strike'      // 敌方水晶受到伤害时
    // [2026-08-27 莉莉子] 高级强化触发时机
    | 'round_end'            // 回合结束时
    | 'unit_die';            // 单位阵亡时
export type BattleEffectClass = 'GENERATE' | 'SUMMON' | 'BUFF' | 'RALLY' | 'CLONE_AND_SUMMON'
    // [2026-08-19 莉莉子] 新一批强化效果类
    | 'BUFF_SELF'            // 触发单位自身永久 +N/+M
    | 'RANDOM_ALLY_BUFF'     // 随机友方单位永久 +N/+M
    | 'DECK_TOP_BUFF'        // 牌库最上方单位永久 +N/+M
    | 'STAT_BALANCE'         // 攻血互等（mode: health_to_power | power_to_health）
    // [2026-08-27 莉莉子] 高级强化效果类
    | 'FREEZE_STRONGEST'     // 回合开始：冻结对方攻击力最高的单位
    | 'DUEL_STRONGEST'       // 回合结束：双方攻击力最高的单位相互打击
    | 'SET_STRONGEST_STATS'  // 回合开始：将对方最强的单位强制设为 1/1
    | 'HAND_DISCOUNT'        // 打出单位时：手牌随机单位卡费用减少（减=打出单位的费用）
    | 'DEATH_GIFT'           // 单位阵亡时：把阵亡单位的攻血赋予手牌随机单位
    // [2026-08-27 莉莉子] 品质扩充批效果类（绿蓝金红 · 全双开关）
    | 'BARRIER_NEXUS'         // 回合开始：我方水晶本回合屏障
    | 'NEXUS_TOUGH'           // [2026-08-30 莉莉子] 我方水晶坚韧：受击伤害永久 -1（固若金汤重设计）
    | 'NEXUS_HEAL'            // 回合开始：我方水晶回复（params.value）
    | 'HAND_COST_DOWN'        // 回合开始：手牌随机单位卡费用 -1（params.amount）
    | 'DEATH_DISCOUNT'        // 单位阵亡：手牌费用最高的单位卡费用 -1（params.amount）
    | 'ALL_BUFF'              // 回合开始：我方全体单位永久 +N/+M（params.rally=true 同时备战）
    | 'RESURRECT'             // 单位阵亡：复活阵亡单位（params.all=true 则全部复活）
    | 'SPELL_DOUBLE'          // 全局：我方法术与技能伤害翻倍（常驻，伤害结算处查询）
    | 'KEYWORD_POWER'         // 全局：我方单位每有 1 个关键词 +1/+1（常驻，属性计算处查询）
    | 'NEXUS_HP_BOOST'        // [2026-08-28] 敌方水晶生命强化：构建期折算进敌方水晶初值（中后段敌人+B10 / Boss+20）
    | 'CHAMPION_TO_HAND';     // [2026-09-01 莉莉子] 天启共鸣：开局从牌库随机抽一张天启者到手牌（提高上手率，天启者等级奖励专属）
export interface BattleEffectDef {
    trigger: BattleTrigger;
    effectClass: BattleEffectClass;
    priority?: number; // [2026-09-09 莉莉子] 同 trigger 串行触发顺序（小先大后，回落=获取序）。同一 trigger 内多个 targeting 效果靠它定先后。
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
    // ── 玩家战斗型强化（[2026-08-19 莉莉子] 即时型强化已删，仅保留战斗内真实生效的 LOR 移植强化）──
    {
        id: 'enhance_dark_arrow', name: '暗箭难防', description: '回合开始时，在手牌中生成一张瞬逝的暗箭。',
        rarity: 'uncommon', icon: SPELL_IMAGES.hidden_arrow, effect: { type: 'passive' }, // [2026-08-27] 原 common→uncommon
        battleEffect: { trigger: 'round_start', effectClass: 'GENERATE', params: { generateKey: 'hidden_arrow', isVolatile: true } },
        playerEligible: true, enemyEligible: false,
    },
    {
        id: 'enhance_ghost_action', name: '幽灵行动', description: '开局召唤 1 费的鬼怪“安提娜”。',
        rarity: 'uncommon', icon: UNIT_IMAGES.antina, effect: { type: 'passive' }, // [2026-08-27] 原 common→uncommon
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

    // ── [2026-08-19 莉莉子] 新一批战斗型强化（等级奖励用；名字/品质待程定稿）──
    {
        id: 'enhance_round_buff', name: '回合加护', description: '回合开始时，随机赋予一个友方单位 +1/+1。',
        rarity: 'rare', icon: SPELL_IMAGES.prayer, effect: { type: 'passive' }, // [2026-09-01 程拍板] 普通→稀有
        battleEffect: { trigger: 'round_start', effectClass: 'RANDOM_ALLY_BUFF', params: { power: 1, health: 1 } },
        playerEligible: true, enemyEligible: false,
    },
    {
        id: 'enhance_after_attack_buff', name: '以战养战', description: '我方单位打击后，赋予其 +1/+1。',
        rarity: 'rare', icon: SPELL_IMAGES.temp_spell_05, effect: { type: 'passive' },
        battleEffect: { trigger: 'after_attack', effectClass: 'BUFF_SELF', params: { power: 1, health: 1 } },
        playerEligible: true, enemyEligible: false,
    },
    {
        id: 'enhance_after_attacked_buff', name: '以守为攻', description: '我方单位被打击后，赋予其 +1/+1。',
        rarity: 'uncommon', icon: SPELL_IMAGES.temp_spell_15, effect: { type: 'passive' }, // [2026-08-27] 原 common→uncommon
        battleEffect: { trigger: 'after_attacked', effectClass: 'BUFF_SELF', params: { power: 1, health: 1 } },
        playerEligible: true, enemyEligible: false,
    },
    {
        id: 'enhance_cast_spell_buff', name: '法术共鸣', description: '每打出一个法术卡牌，随机赋予一个友方单位 +1/+1。',
        rarity: 'rare', icon: abc_spell, effect: { type: 'passive' },
        battleEffect: { trigger: 'on_cast_spell', effectClass: 'RANDOM_ALLY_BUFF', params: { power: 1, health: 1 } },
        playerEligible: true, enemyEligible: false,
    },
    {
        id: 'enhance_play_unit_buff', name: '军势鼓舞', description: '打出一个单位卡牌时，随机赋予场上一个友方单位 +1/+1。',
        rarity: 'uncommon', icon: SPELL_IMAGES.fenny_support, effect: { type: 'passive' }, // [2026-08-27] 原 common→uncommon
        battleEffect: { trigger: 'on_play_unit', effectClass: 'RANDOM_ALLY_BUFF', params: { power: 1, health: 1 } },
        playerEligible: true, enemyEligible: false,
    },
    {
        id: 'enhance_first_play_boost', name: '先锋之锐', description: '每回合首个打出的单位获得 +2/+0。',
        rarity: 'rare', icon: SPELL_IMAGES.temp_spell_14, effect: { type: 'passive' },
        battleEffect: { trigger: 'on_first_play_unit', effectClass: 'BUFF_SELF', params: { power: 2, health: 0 } },
        playerEligible: true, enemyEligible: false,
    },
    {
        id: 'enhance_health_to_power', name: '生命壁垒', description: '我方单位发起进攻后，其生命值提升至等于攻击力。',
        rarity: 'epic', icon: abc_spell, effect: { type: 'passive' },
        battleEffect: { trigger: 'after_attack', effectClass: 'STAT_BALANCE', params: { mode: 'health_to_power' } },
        playerEligible: true, enemyEligible: false,
    },
    {
        id: 'enhance_power_to_health', name: '攻守易形', description: '我方单位发起进攻后，其攻击力提升至等于生命值。',
        rarity: 'epic', icon: abc_spell, effect: { type: 'passive' },
        battleEffect: { trigger: 'after_attack', effectClass: 'STAT_BALANCE', params: { mode: 'power_to_health' } },
        playerEligible: true, enemyEligible: false,
    },
    {
        id: 'enhance_nexus_deck_buff', name: '牌库灌注', description: '敌方水晶每受到 1 次伤害，赋予牌库最上方的单位 +1/+1。',
        rarity: 'rare', icon: abc_spell, effect: { type: 'passive' }, // [2026-09-05] 原 epic（与水晶共鸣品质互换）
        battleEffect: { trigger: 'on_nexus_strike', effectClass: 'DECK_TOP_BUFF', params: { power: 1, health: 1 } },
        playerEligible: true, enemyEligible: false,
    },
    {
        id: 'enhance_nexus_ally_buff', name: '水晶共鸣', description: '敌方水晶每受到 1 次伤害，随机赋予我方单位 +1/+1。',
        rarity: 'epic', icon: abc_spell, effect: { type: 'passive' }, // [2026-09-05] 原 rare（与牌库灌注品质互换）
        battleEffect: { trigger: 'on_nexus_strike', effectClass: 'RANDOM_ALLY_BUFF', params: { power: 1, health: 1 } },
        playerEligible: true, enemyEligible: false,
    },

    // ── [2026-08-27 莉莉子] 敌人专属迷宫强化（enemyEligible：编辑器给流派配置 → 战斗内 battleEffect 生效）──
    // 覆盖 9 个触发时机，镜像玩家侧管线（敌方 bench/hand/cast 由引擎 enemy 分支分发）
    {
        id: 'enemy_mobilize', name: '精锐动员', description: '开局召唤 1 费的鬼怪"安提娜"。',
        rarity: 'epic', icon: UNIT_IMAGES.antina, effect: { type: 'passive' },
        battleEffect: { trigger: 'game_start', effectClass: 'SUMMON', params: { summonKey: 'Ghost_Squad_Antina' } },
        playerEligible: false, enemyEligible: true,
    },
    {
        id: 'enemy_round_rally', name: '狼群战术', description: '回合开始时，进行备战。',
        rarity: 'rare', icon: abc_spell, effect: { type: 'passive' },
        battleEffect: { trigger: 'round_start', effectClass: 'RALLY' },
        playerEligible: false, enemyEligible: true,
    },
    {
        id: 'enemy_round_buff', name: '战意高涨', description: '回合开始时，随机赋予一个敌方单位 +1/+1。',
        rarity: 'common', icon: abc_spell, effect: { type: 'passive' },
        battleEffect: { trigger: 'round_start', effectClass: 'RANDOM_ALLY_BUFF', params: { power: 1, health: 1 } },
        playerEligible: false, enemyEligible: true,
    },
    {
        id: 'enemy_on_summon', name: '蜂拥而至', description: '召唤单位时，本回合给予它 +1/+1。',
        rarity: 'common', icon: abc_spell, effect: { type: 'passive' },
        battleEffect: { trigger: 'on_summon', effectClass: 'BUFF', params: { power: 1, health: 1, duration: 'ROUND' } },
        playerEligible: false, enemyEligible: true,
    },
    {
        id: 'enemy_play_buff', name: '召唤浪潮', description: '敌方每打出一个单位，随机敌方单位 +1/+1。',
        rarity: 'common', icon: abc_spell, effect: { type: 'passive' },
        battleEffect: { trigger: 'on_play_unit', effectClass: 'RANDOM_ALLY_BUFF', params: { power: 1, health: 1 } },
        playerEligible: false, enemyEligible: true,
    },
    {
        id: 'enemy_first_boost', name: '斩杀协议', description: '敌方每回合首个打出的单位获得 +2/+0。',
        rarity: 'rare', icon: abc_spell, effect: { type: 'passive' },
        battleEffect: { trigger: 'on_first_play_unit', effectClass: 'BUFF_SELF', params: { power: 2, health: 0 } },
        playerEligible: false, enemyEligible: true,
    },
    {
        id: 'enemy_cast_buff', name: '法术渗透', description: '敌方每打出一个法术，随机敌方单位 +1/+1。',
        rarity: 'epic', icon: abc_spell, effect: { type: 'passive' },
        battleEffect: { trigger: 'on_cast_spell', effectClass: 'RANDOM_ALLY_BUFF', params: { power: 1, health: 1 } },
        playerEligible: false, enemyEligible: true,
    },
    {
        id: 'enemy_after_attack', name: '狂怒印记', description: '敌方单位打击后，获得 +1/+1。',
        rarity: 'rare', icon: abc_spell, effect: { type: 'passive' },
        battleEffect: { trigger: 'after_attack', effectClass: 'BUFF_SELF', params: { power: 1, health: 1 } },
        playerEligible: false, enemyEligible: true,
    },
    {
        id: 'enemy_after_attacked', name: '铁壁反击', description: '敌方单位被打击后，获得 +1/+1。',
        rarity: 'common', icon: abc_spell, effect: { type: 'passive' },
        battleEffect: { trigger: 'after_attacked', effectClass: 'BUFF_SELF', params: { power: 1, health: 1 } },
        playerEligible: false, enemyEligible: true,
    },
    {
        id: 'enemy_nexus_buff', name: '连击之势', description: '我方水晶每受到 1 次伤害，随机敌方单位 +1/+1。',
        rarity: 'epic', icon: abc_spell, effect: { type: 'passive' },
        battleEffect: { trigger: 'on_nexus_strike', effectClass: 'RANDOM_ALLY_BUFF', params: { power: 1, health: 1 } },
        playerEligible: false, enemyEligible: true,
    },

    // ── [2026-08-27 莉莉子] 高级强化（双方通用：playerEligible + enemyEligible 都 true，按触发方分敌我视角）──
    // 新增触发时机 round_end / unit_die + 5 个新效果类（FREEZE_STRONGEST / DUEL_STRONGEST / SET_STRONGEST_STATS / HAND_DISCOUNT / DEATH_GIFT）
    {
        id: 'freeze_strongest', name: '霜寒压制', description: '回合开始时，冻结对方攻击力最高的单位。',
        rarity: 'rare', icon: SPELL_IMAGES.temp_spell_18, effect: { type: 'passive' },
        battleEffect: { trigger: 'round_start', effectClass: 'FREEZE_STRONGEST', priority: 10 }, // [2026-09-09] 冻结先于衰弱：冻结后最强归0 → 衰弱实时重判到次强
        playerEligible: true, enemyEligible: true,
    },
    {
        id: 'duel_strongest', name: '王见王', description: '回合结束时，敌我双方攻击力最高的单位相互打击。',
        rarity: 'epic', icon: SPELL_IMAGES.single_combat, effect: { type: 'passive' },
        battleEffect: { trigger: 'round_end', effectClass: 'DUEL_STRONGEST' },
        playerEligible: true, enemyEligible: true,
    },
    {
        id: 'shrink_strongest', name: '衰弱诅咒', description: '回合开始时，将对方最强的单位设置为 1/1。',
        rarity: 'epic', icon: SPELL_IMAGES.mauxir_zhishui_ningxing, effect: { type: 'passive' },
        battleEffect: { trigger: 'round_start', effectClass: 'SET_STRONGEST_STATS', priority: 20 }, // [2026-09-09] 排在冻结后：对实时战场重判"当前最强"
        playerEligible: true, enemyEligible: true,
    },
    {
        id: 'hand_discount', name: '传承武备', description: '打出一个单位时，手牌中随机一张单位卡的费用减少（减少量等于该单位的费用）。',
        rarity: 'epic', icon: abc_spell, effect: { type: 'passive' }, // [2026-09-02 程拍板] 稀有→史诗
        battleEffect: { trigger: 'on_play_unit', effectClass: 'HAND_DISCOUNT' },
        playerEligible: true, enemyEligible: true,
    },
    {
        id: 'death_gift', name: '英魂传承', description: '单位阵亡时，手牌中随机一个单位获得该单位的攻击力和生命值。',
        rarity: 'epic', icon: SPELL_IMAGES.mauxir_ouduan_si_chang, effect: { type: 'passive' },
        battleEffect: { trigger: 'unit_die', effectClass: 'DEATH_GIFT' },
        playerEligible: true, enemyEligible: true,
    },

    // ── [2026-08-27 莉莉子] 品质扩充批（绿蓝金红 · 全双开关，持有方视角；程拍板不分敌我）──
    {
        id: 'pursuit_strike', name: '乘胜追击', description: '回合开始时，随机赋予一个我方单位 +1/+0。',
        rarity: 'uncommon', icon: abc_spell, effect: { type: 'passive' },
        battleEffect: { trigger: 'round_start', effectClass: 'RANDOM_ALLY_BUFF', params: { power: 1, health: 0 } },
        playerEligible: true, enemyEligible: true,
    },
    {
        id: 'grind_strike', name: '磨刀霍霍', description: '敌方水晶每受到 1 次伤害，随机赋予一个我方单位 +1/+0。',
        rarity: 'uncommon', icon: abc_spell, effect: { type: 'passive' },
        battleEffect: { trigger: 'on_nexus_strike', effectClass: 'RANDOM_ALLY_BUFF', params: { power: 1, health: 0 } },
        playerEligible: true, enemyEligible: true,
    },
    {
        id: 'recoil_guard', name: '回旋余力', description: '回合结束时，随机赋予一个我方单位 +0/+1。',
        rarity: 'uncommon', icon: SPELL_IMAGES.bader_reagent, effect: { type: 'passive' },
        battleEffect: { trigger: 'round_end', effectClass: 'RANDOM_ALLY_BUFF', params: { power: 0, health: 1 } },
        playerEligible: true, enemyEligible: true,
    },
    {
        id: 'edge_supply', name: '锋锐补给', description: '每打出一个单位卡牌，赋予牌库最上方的单位 +1/+0。',
        rarity: 'uncommon', icon: abc_spell, effect: { type: 'passive' },
        battleEffect: { trigger: 'on_play_unit', effectClass: 'DECK_TOP_BUFF', params: { power: 1, health: 0 } },
        playerEligible: true, enemyEligible: true,
    },
    {
        id: 'bulwark', name: '固若金汤', description: '我方水晶获得坚韧：受到的伤害永久减少 1 点。',
        rarity: 'rare', icon: SPELL_IMAGES.fenny_strike, effect: { type: 'passive' },
        battleEffect: { trigger: 'round_start', effectClass: 'NEXUS_TOUGH' }, // [2026-08-30 程拍板] 由屏障改为水晶坚韧（受击伤害永久 -1）
        playerEligible: true, enemyEligible: true,
    },
    {
        id: 'regen_nexus', name: '愈战愈勇', description: '回合开始时，我方水晶回复 5 点生命。',
        rarity: 'rare', icon: SPELL_IMAGES.vitality_supplement, effect: { type: 'passive' },
        battleEffect: { trigger: 'round_start', effectClass: 'NEXUS_HEAL', params: { value: 5 } }, // [2026-09-02 程拍板] 回复量 +2 → +5
        playerEligible: true, enemyEligible: true,
    },
    {
        id: 'war_stock', name: '战术储备', description: '回合开始时，手牌中随机一张单位卡费用减少 1。',
        rarity: 'rare', icon: abc_spell, effect: { type: 'passive' },
        battleEffect: { trigger: 'round_start', effectClass: 'HAND_COST_DOWN', params: { amount: 1 } },
        playerEligible: true, enemyEligible: true,
    },
    {
        id: 'sacrifice_discount', name: '献祭仪式', description: '我方单位阵亡时，手牌中费用最高的单位卡费用减少 1。',
        rarity: 'rare', icon: SPELL_IMAGES.destruction_ritual, effect: { type: 'passive' },
        battleEffect: { trigger: 'unit_die', effectClass: 'DEATH_DISCOUNT', params: { amount: 1 } },
        playerEligible: true, enemyEligible: true,
    },
    {
        id: 'steel_tide', name: '钢铁洪流', description: '回合开始时，我方所有单位获得永久 +1/+1。',
        rarity: 'legendary', icon: SPELL_IMAGES.inspire, effect: { type: 'passive' },
        battleEffect: { trigger: 'round_start', effectClass: 'ALL_BUFF', params: { power: 1, health: 1 } },
        playerEligible: true, enemyEligible: true,
    },
    {
        id: 'undying_legion', name: '亡灵军团', description: '我方首个单位阵亡时，将其复活。',
        rarity: 'legendary', icon: SPELL_IMAGES.temp_spell_02, effect: { type: 'passive' },
        battleEffect: { trigger: 'unit_die', effectClass: 'RESURRECT', params: { all: false } },
        playerEligible: true, enemyEligible: true,
    },
    {
        id: 'immortal_body', name: '不死之身', description: '回合开始时，我方水晶回复 5 点生命。',
        rarity: 'legendary', icon: SPELL_IMAGES.vitality_regen, effect: { type: 'passive' },
        battleEffect: { trigger: 'round_start', effectClass: 'NEXUS_HEAL', params: { value: 5 } },
        playerEligible: true, enemyEligible: true,
    },
    {
        id: 'war_lord', name: '战争领主', description: '回合开始时，我方所有单位获得永久 +2/+2，并进行备战。',
        rarity: 'mythic', icon: abc_spell, effect: { type: 'passive' },
        battleEffect: { trigger: 'round_start', effectClass: 'ALL_BUFF', params: { power: 2, health: 2, rally: true } },
        playerEligible: true, enemyEligible: true,
    },
    {
        id: 'undying_host', name: '不死军团', description: '我方每个单位阵亡时，都会在回合开始时复活。',
        rarity: 'mythic', icon: SPELL_IMAGES.ghostly_shadows, effect: { type: 'passive' },
        battleEffect: { trigger: 'unit_die', effectClass: 'RESURRECT', params: { all: true } },
        playerEligible: true, enemyEligible: true,
    },
    {
        id: 'arcane_overload', name: '法术狂潮', description: '我方法术与技能造成的伤害翻倍。',
        rarity: 'mythic', icon: SPELL_IMAGES.destruction, effect: { type: 'passive' },
        battleEffect: { trigger: 'game_start', effectClass: 'SPELL_DOUBLE' },
        playerEligible: true, enemyEligible: true,
    },
    {
        id: 'keyword_evolution', name: '万夫莫敌', description: '打出一个单位时，该单位每拥有 1 个关键词，获得 +1/+1。',
        rarity: 'mythic', icon: abc_spell, effect: { type: 'passive' },
        battleEffect: { trigger: 'on_play_unit', effectClass: 'KEYWORD_POWER' }, // [2026-08-30 程拍板] 打出时一次性加成，杜绝回合无限叠加
        playerEligible: true, enemyEligible: true,
    },

    // ── [2026-08-28 莉莉子] 敌方水晶生命强化（节点级必带，不进抽选池）──
    // 中后段敌人 / Boss 由 mapLayout 预分配追加；encounterBuilder 扫描 NEXUS_HP_BOOST 折算进敌方水晶初值；
    // enemyEligible:false → 不参与品质加权抽选，只随节点预分配出现（敌人详情「持有迷宫BUFF」区可见）
    {
        id: 'enemy_nexus_boost_10', name: '生命强化 · +10', description: '敌方水晶生命值 +10。',
        rarity: 'common', icon: abc_spell, effect: { type: 'passive' },
        battleEffect: { trigger: 'game_start', effectClass: 'NEXUS_HP_BOOST', params: { value: 10 } },
        playerEligible: false, enemyEligible: false,
    },
    {
        id: 'enemy_nexus_boost_20', name: '生命强化 · +20', description: '敌方水晶生命值 +20。',
        rarity: 'epic', icon: abc_spell, effect: { type: 'passive' },
        battleEffect: { trigger: 'game_start', effectClass: 'NEXUS_HP_BOOST', params: { value: 20 } },
        playerEligible: false, enemyEligible: false,
    },

    // ── [2026-09-01 莉莉子] 天启者等级奖励专属强化（不进敌我强化池，仅 7 级等级奖励「获得迷宫强化：天启共鸣」）──
    {
        id: 'enhance_champion_resonance', name: '天启共鸣', description: '开局从牌库中随机抽取一张天启者卡牌到手牌中。',
        rarity: 'legendary', icon: SPELL_IMAGES.energy_supplement, effect: { type: 'passive' }, // [2026-09-06 莉莉子] 图标接入：能量补充（开局抽天启者主题）
        battleEffect: { trigger: 'game_start', effectClass: 'CHAMPION_TO_HAND' },
        playerEligible: false, enemyEligible: false,
    },
];

// ── 派生视图 ──
export const PLAYER_ENHANCEMENTS = MAZE_BUFFS.filter(b => b.playerEligible);
export const ENEMY_ELIGIBLE_BUFFS = MAZE_BUFFS.filter(b => b.enemyEligible);
export const MAZE_BUFF_BY_ID: Record<string, MazeBuff> = Object.fromEntries(MAZE_BUFFS.map(b => [b.id, b]));
export const getBuffById = (id: string): MazeBuff | undefined => MAZE_BUFF_BY_ID[id];

// ==========================================
// 敌人动态携带抽选规则（[2026-08-27 程拍板] 品质加权版 · [2026-08-28] 按难度分层）
// 深度 depthFrac ∈ [0,1]（迷宫路径层数归一化：0=起点，1=Boss）→ 数量 1→3 递增
// 池子：流派手配 rogueBuffs 优先；未配（空/undefined）= 默认全部 enemyEligible 强化（全库自动，不用逐个流派手配）
// 品质：按难度选表 ENEMY_WEIGHT_BY_DIFFICULTY[difficulty] 加权随机（普通禁红 / 机密深层红 1 / 绝密深层红 2，权重可调）
// ==========================================

// [2026-08-28 莉莉子] 敌人强化品质加权表：普通/机密/绝密各一张，深度分档 maxFrac 为边界、weights 为六品质权重
//   - 普通 normal  ：白绿为主体，紫中后段才起，金仅最终 boss 给 1，红全禁（不吓人）
//   - 机密 secret  ：蓝紫为主，金深层 3，红仅最深层 1（最终 boss 的惊喜档）
//   - 绝密 topsecret：紫金为主，红最深层 2，浅层即有紫惊喜
export interface EnemyBuffWeightTier {
    maxFrac: number;
    weights: Record<EnhancementRarity, number>;
}

export const ENEMY_WEIGHT_BY_DIFFICULTY: Record<RogueDifficulty, EnemyBuffWeightTier[]> = {
    normal: [
        { maxFrac: 0.2, weights: { common: 8, uncommon: 2, rare: 1, epic: 0, legendary: 0, mythic: 0 } },
        { maxFrac: 0.45, weights: { common: 4, uncommon: 4, rare: 3, epic: 1, legendary: 0, mythic: 0 } },
        { maxFrac: 0.7, weights: { common: 0, uncommon: 3, rare: 5, epic: 3, legendary: 0, mythic: 0 } },
        { maxFrac: 1.01, weights: { common: 0, uncommon: 1, rare: 5, epic: 5, legendary: 1, mythic: 0 } },
    ],
    secret: [
        { maxFrac: 0.2, weights: { common: 6, uncommon: 2, rare: 3, epic: 1, legendary: 0, mythic: 0 } },
        { maxFrac: 0.45, weights: { common: 2, uncommon: 3, rare: 6, epic: 3, legendary: 0, mythic: 0 } },
        { maxFrac: 0.7, weights: { common: 0, uncommon: 1, rare: 4, epic: 6, legendary: 1, mythic: 0 } },
        { maxFrac: 1.01, weights: { common: 0, uncommon: 0, rare: 2, epic: 5, legendary: 3, mythic: 1 } },
    ],
    topsecret: [
        { maxFrac: 0.2, weights: { common: 5, uncommon: 2, rare: 4, epic: 2, legendary: 0, mythic: 0 } },
        { maxFrac: 0.45, weights: { common: 1, uncommon: 2, rare: 6, epic: 5, legendary: 0, mythic: 0 } },
        { maxFrac: 0.7, weights: { common: 0, uncommon: 0, rare: 3, epic: 7, legendary: 2, mythic: 0 } },
        { maxFrac: 1.01, weights: { common: 0, uncommon: 0, rare: 1, epic: 5, legendary: 4, mythic: 2 } },
    ],
};

// [2026-09-15 程拍板] 携带数量表按难度分层（原为全局单表）。
//   - 普通 normal ：第一战（frac = 0）不带任何迷宫强化 —— 干净开局，不让玩家第一场就吃强化
//   - 机密/绝密   ：沿用原全局档位（浅层即 1 个）
// frac 为「战斗进度深度」（mapLayout.computeCombatDepth）：第一战 0、最深战斗节点/Boss 1。
export const ENEMY_COUNT_BY_DIFFICULTY: Record<RogueDifficulty, { maxFrac: number; count: number }[]> = {
    normal: [
        { maxFrac: 0.01, count: 0 },
        { maxFrac: 0.34, count: 1 },
        { maxFrac: 0.67, count: 2 },
        { maxFrac: 1.01, count: 3 },
    ],
    secret: [
        { maxFrac: 0.34, count: 1 },
        { maxFrac: 0.67, count: 2 },
        { maxFrac: 1.01, count: 3 },
    ],
    topsecret: [
        { maxFrac: 0.34, count: 1 },
        { maxFrac: 0.67, count: 2 },
        { maxFrac: 1.01, count: 3 },
    ],
};

export const ENEMY_BUFF_ROLL = {
    // [2026-09-15 莉莉子] 数量表按难度选：countByDifficulty[difficulty]
    countByDifficulty: ENEMY_COUNT_BY_DIFFICULTY,
    // [2026-08-28 莉莉子] 按难度选表：qualityWeightByDepth[difficulty]
    qualityWeightByDepth: ENEMY_WEIGHT_BY_DIFFICULTY,
};

/**
 * 按深度从可携带强化库中随机抽出实际携带的迷宫强化 id 列表。
 * @param rogueBuffs 流派手配强化 id 库（archetype.rogueBuffs，编辑器配置）；空/undefined = 默认全 enemyEligible 库
 * @param depthFrac  战斗进度深度 0~1（由 mapLayout.computeCombatDepth 提供：第一战 0、最深战斗节点/Boss 1）
 * @param difficulty 本局难度（普通/机密/绝密）→ 决定品质权重表；默认 normal（最温和）
 */
export const rollEnemyBuffs = (rogueBuffs: string[] | undefined, depthFrac: number, difficulty: RogueDifficulty = 'normal'): string[] => {
    // [2026-08-27 程拍板] 池子默认全库：手配为空/未配 → 全部 enemyEligible 强化
    const ids = rogueBuffs?.length ? rogueBuffs : ENEMY_ELIGIBLE_BUFFS.map(b => b.id);
    const frac = Math.max(0, Math.min(1, depthFrac));

    const pool = ids
        .map(id => MAZE_BUFF_BY_ID[id])
        .filter((b): b is MazeBuff => !!b && b.enemyEligible);
    if (pool.length === 0) return [];

    // [2026-09-15 莉莉子] 数量表按难度选（普通第一战 count = 0 → 不携带任何迷宫强化）
    const countTiers = ENEMY_BUFF_ROLL.countByDifficulty[difficulty];
    const count = countTiers.find(t => frac < t.maxFrac)?.count
        ?? countTiers[countTiers.length - 1].count;
    // [2026-08-28 莉莉子] 按难度选品质权重表（普通/机密/绝密各一套）
    const weightTiers = ENEMY_BUFF_ROLL.qualityWeightByDepth[difficulty];
    const weights = weightTiers.find(t => frac < t.maxFrac)?.weights
        ?? weightTiers[weightTiers.length - 1].weights;

    const n = Math.min(count, pool.length);
    const result: MazeBuff[] = [];
    const rest = [...pool];
    while (result.length < n && rest.length > 0) {
        // 品质加权抽选：按该深度档权重表，池内强化以自身稀有度累权 → 加权随机取一
        const weightOf = (b: MazeBuff) => weights[b.rarity] ?? 0;
        const wsum = rest.reduce((s, b) => s + weightOf(b), 0);
        let idx = 0;
        if (wsum <= 0) {
            // 兜底：该深度档剩余池所有权重为 0（如池内全是权重 0 的品质）→ 均等抽，防卡死
            idx = Math.floor(Math.random() * rest.length);
        } else {
            let roll = Math.random() * wsum;
            for (let i = 0; i < rest.length; i++) {
                roll -= weightOf(rest[i]);
                if (roll < 0) { idx = i; break; }
            }
        }
        result.push(rest[idx]);
        rest.splice(idx, 1); // 不重复选同一个
    }
    return result.map(b => b.id);
};
