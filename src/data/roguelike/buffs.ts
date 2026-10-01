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
import type { QuestSpec } from '../questTypes'; // [2026-09-25 莉莉子] 三线任务化框架：任务声明

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
    | 'unit_die'             // 单位阵亡时
    // [2026-09-28 莉莉子 神格神经] 新时机：进攻宣告（commitAttack 那一刻，程授权改 useGameState 埋点）
    //   服务：芬妮②④（进攻单位攻击力总和达标 → 备战）· 卜卜①③（进攻时复制召唤）
    | 'on_attack_declare'      // 进攻宣告（commitAttack，程授权改 useGameState 埋点）
    // [2026-09-28 莉莉子 神格神经] 拉取暴露单位（challengeEnemy 放行后，程授权改 useGameState 埋点）
    | 'on_pull_exposed';
export type BattleEffectClass = 'GENERATE' | 'SUMMON' | 'BUFF' | 'RALLY' | 'CLONE_AND_SUMMON'
    // [2026-08-19 莉莉子] 新一批强化效果类
    | 'BUFF_SELF'            // 触发单位自身永久 +N/+M
    | 'RANDOM_ALLY_BUFF'     // 随机我方单位永久 +N/+M
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
    | 'NEXUS_IMMUNE'          // [2026-09-29 程拍板] 我方水晶**免疫任何伤害**（不死之身）；标记型，各水晶伤害点查 game.playerNexusImmune/enemyNexusImmune
    | 'NEXUS_SELF_DAMAGE'     // [2026-09-29 程拍板] 回合结束**自扣我方水晶**（不死之身的代价）；刻意不走伤害管线 ⇒ 免疫不挡它
    | 'NEXUS_HEAL'            // 回合开始：我方水晶回复（params.value）
    | 'HAND_COST_DOWN'        // 回合开始：手牌随机单位卡费用 -1（params.amount）
    | 'DEATH_DISCOUNT'        // 单位阵亡：手牌费用最高的单位卡费用 -1（params.amount）
    | 'ALL_BUFF'              // 回合开始：我方所有单位 +N/+M（params.rally=true 同时备战）
    | 'RESURRECT'             // 单位阵亡：复活阵亡单位（params.all=true 则全部复活）
    | 'SPELL_DOUBLE'          // 全局：我方法术与技能伤害翻倍（常驻，伤害结算处查询）
    | 'KEYWORD_POWER'         // 全局：我方单位每有 1 个关键词 +1/+1（常驻，属性计算处查询）
    | 'NEXUS_HP_BOOST'        // [2026-08-28] 敌方水晶生命强化：构建期折算进敌方水晶初值（中后段敌人+B10 / Boss+20）
    | 'CHAMPION_TO_HAND'      // [2026-09-01 莉莉子] 天启共鸣：开局从牌库随机抽一张天启者到手牌（提高上手率，天启者等级奖励专属）
    | 'DRAW_CARDS'            // [2026-09-25 莉莉子 三线任务化框架] 开局抽 N 张（params.value）：牌库顶 N 张进手牌；武装任务兑现与后续条目共用
    | 'DISCARD_LOWEST_BUFF_CHAMPION' // [2026-09-25 莉莉子 武装线] 噬牌之匣：回合开始弃掉手牌中费用最低的一张 → 天启者永久 +1/+1
    // [2026-09-25 莉莉子 武装线] 武装专用效果类（载体为 armfx_* 条目）
    | 'SUMMON_INHERIT_LAST_DEAD'    // 亡者低语：此后每次召唤，新单位获得"最后阵亡单位"的攻血
    | 'SPREAD_CHAMPION_KEYWORDS'    // 共鸣水晶：随机赋予天启者一个关键词 → 其关键词同时赋予在场我方单位
    | 'TAX_ENEMY_HAND'             // 破晓号令：敌方手牌中随机 count 张单位卡费用 +value
    // [2026-09-25 莉莉子 强化线 · 新效果批] 亡语系 + 经济联动
    | 'DEATH_NEXUS_DAMAGE'          // 余烬：我方单位阵亡时，敌方水晶受到 N 点伤害（死亡即伤害）
    | 'DEATH_STRIKE_RANDOM_ENEMY'   // 献祭回响：我方单位阵亡时，对敌方随机单位造成等于其攻击力的伤害
    | 'DEATH_GIFT_KEYWORD'          // 返祖：我方单位阵亡时，随机一个我方单位获得它的一个关键词
    // [2026-09-25 莉莉子 强化线 · 新效果批（第二组）]
    //   ⚠️ 这两个类需要 game 级提交（悬赏写标记、终焉回响扣水晶）—— game_start 站点本轮已补上差异合并提交
    | 'OPENING_ZERO_COST'           // 终焉回响：开局随机 2 张手牌费用变 0；代价：每场开局我方水晶 −2
    | 'BOUNTY_CYCLE'                // 悬赏：标记敌方最强的单位 → 它被击杀后抽 2 张牌 + 50 金币（自循环：结算后下回合重标记）
    | 'LONE_GUARD_BUFF'             // 孤军：我方场上恰好 1 个单位时，该单位 +4/+4 并获得【屏障】
    // [2026-09-28 莉莉子 神格神经线] 两个新类（载体为 divfx_* 条目，playerEligible:false）
    //   · START_MANA_BONUS：**常驻查询型**，无 handler —— 生效点在 logic/core.ts 的 calculateRoundStart
    //     （每回合最大法力由 round 从零重算，故必须走"规则查询"而不是在 game_start 写值，否则会被冲掉）
    //   · ALL_UNITS_GRANT_KEYWORD：给我方全体（game_start）或刚召唤的单位（on_summon）永久 +N/+M 与关键词
    //     [2026-09-29] params 支持 `keywords: string[]`（多关键词一条搞定；旧 `keyword` 单数仍兼容）
    | 'START_MANA_BONUS'
    | 'ALL_UNITS_GRANT_KEYWORD'
    // [2026-09-28 莉莉子 神格神经] 进攻宣告类
    | 'RALLY_IF_ATTACK_POWER'   // 芬妮②④：我方进攻单位攻击力总和 > 阈值 → 备战（params.threshold）
    | 'CLONE_ON_DECLARE'        // 卜卜①③：进攻宣告时复制我方单位，以"进攻中"入场（params.strongest / power / health）
    | 'NEXUS_REPEAT_STRIKE'    // 卜卜⑥：打击敌方水晶时记账 → 回合结束由我方最强单位再打一次
    // [2026-09-28 神格神经 · 猫汐尔]
    | 'MANA_PER_SUMMON_ROUND'     // ①回合开始：每有 1 个召唤衍生物 → **本回合**最大法力 +1
    | 'MANA_PER_SUMMON_PERMANENT' // ③每召唤 1 个衍生物 → **本场永久**最大法力 +1（计数存 questProgress）
    | 'SPELL_COST_DOWN_ALL'       // ⑥开局：我方手牌+牌库所有法术魔耗 -N
    | 'REMOVE_MAX_POWER'         // ⑥清除指定卡（臆莲基座）的攻击力上限
    // [2026-09-28 神格神经 · 茉莉安]
    | 'EXPOSE_AND_DAMAGE'        // ②④回合开始：暴露一个敌人，并对随机/血量最多的敌人造成 N 点伤害
    | 'BEACON_DAMAGE_MULT';      // ⑥常驻查询型：獠牙信标亡语伤害翻倍（在 SPREAD_DAMAGE 处乘算，无 handler）
export interface BattleEffectDef {
    trigger: BattleTrigger;
    effectClass: BattleEffectClass;
    priority?: number; // [2026-09-09 莉莉子] 同 trigger 串行触发顺序（小先大后，回落=获取序）。同一 trigger 内多个 targeting 效果靠它定先后。
    params?: Record<string, unknown>; // 执行参数，逻辑层按类读取
    oncePerBattle?: boolean; // [2026-09-25 莉莉子 三线任务化框架] 本场战斗只生效一次（破晓号令等）；账本借用 questProgress 的 used:<id> 键
    requireOnlyOneUnit?: boolean; // [2026-09-25 莉莉子 强化线] 苛刻条件：我方场上恰好 1 个单位才分发（孤军）；判定在"每场一次"记账之前，不会白白消耗掉那一次
}

/** [2026-09-25 莉莉子 武装线] 共鸣水晶的「随机关键词」候选池（只从中挑一个赠予天启者，再扩散给我方单位） */
export const CHAMPION_GIFT_KEYWORDS = [
    'QuickAttack', 'Tough', 'Thorns', 'Overwhelm', 'Regeneration',
    'Lifesteal', 'Elusive', 'Barrier', 'Challenger', 'Fearsome',
] as const;

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
    // [2026-09-28 莉莉子 神格神经] **一条强化、多个效果**（如「决意·不退之阵」＝ 开局全体赋关键词 + 此后召唤也带 + 每回合生成 0 费牌）。
    //   与 battleEffect 二选一：battleEffects 非空时以它为准；消费方统一走 `getBattleEffects(def)`，不要直接读 battleEffect。
    battleEffects?: BattleEffectDef[];
    quest?: QuestSpec; // [2026-09-25 莉莉子 三线任务化框架] 任务版强化：达成阈值后 battleEffect 才开始分发（quest 是解锁门，兑现复用 battleEffect）
    /** [2026-09-25 莉莉子 强化线] 战斗结束时的 run 层经济联动：我方水晶 ≥ runBattleEndMinNexus 时 +N 金币（拾荒） */
    runBattleEndGold?: number;
    runBattleEndMinNexus?: number;
    /**
     * [2026-09-25 莉莉子 强化线] 资源规则类 · 共鸣涌流：每施放 every 个法术，本场法术法力上限 +1（封顶 max）
     *   不走触发引擎 —— 计数在 playCard 站点累加，实际生效在回合边界的法力计算（logic/core.ts）
     */
    spellManaGrowth?: { every: number; max?: number };
    /** [2026-09-25 莉莉子 强化线] 资源规则类 · 囤积：把未使用法力溢出到法术池的上限抬高 N 点 */
    hoardSpellMana?: number;
    playerEligible: boolean;    // [接口开关] 玩家能否刷取到
    enemyEligible: boolean;     // [接口开关] 敌方卡组编辑器能否配置
}

export const MAZE_BUFFS: MazeBuff[] = [
    // ── 玩家战斗型强化（[2026-08-19 莉莉子] 即时型强化已删，仅保留战斗内真实生效的 LOR 移植强化）──
    {
        id: 'enhance_dark_arrow', name: '暗箭难防', description: '回合开始时，在手牌中生成一张瞬逝的「暗箭」。',
        rarity: 'uncommon', icon: SPELL_IMAGES.hidden_arrow, effect: { type: 'passive' }, // [2026-08-27] 原 common→uncommon
        battleEffect: { trigger: 'round_start', effectClass: 'GENERATE', params: { generateKey: 'hidden_arrow', isVolatile: true } },
        playerEligible: true, enemyEligible: false,
    },
    {
        id: 'enhance_ghost_action', name: '幽灵行动', description: '开局召唤 1 费的鬼怪「安提娜」。',
        rarity: 'uncommon', icon: UNIT_IMAGES.antina, effect: { type: 'passive' }, // [2026-08-27] 原 common→uncommon
        battleEffect: { trigger: 'game_start', effectClass: 'SUMMON', params: { summonKey: 'Ghost_Squad_Antina' } },
        playerEligible: true, enemyEligible: false,
    },
    {
        id: 'enhance_seize_moment', name: '机不可失', description: '我方召唤单位时，本回合给予其 +1/+1。',
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
        id: 'enhance_round_buff', name: '回合加护', description: '回合开始时，随机赋予一个我方单位 +1/+1。',
        rarity: 'rare', icon: SPELL_IMAGES.prayer, effect: { type: 'passive' }, // [2026-09-01 程拍板] 普通→稀有
        battleEffect: { trigger: 'round_start', effectClass: 'RANDOM_ALLY_BUFF', params: { power: 1, health: 1 } },
        playerEligible: true, enemyEligible: false,
    },
    {
        id: 'enhance_after_attack_buff', name: '以战养战', description: '我方单位打击后，获得 +1/+1。',
        rarity: 'rare', icon: SPELL_IMAGES.temp_spell_05, effect: { type: 'passive' },
        battleEffect: { trigger: 'after_attack', effectClass: 'BUFF_SELF', params: { power: 1, health: 1 } },
        // [2026-09-28 程拍板 · 神格神经] 「打击后 +1/+1」这个效果**只属于神格神经**（里芙节点①）：
        //   本条从玩家强化池**摘出**（playerEligible: false），不再有任何局内获取途径。
        //   ⇒ 通行证 29 级奖励已改发「凯旋之匣」（见 analystProgression）。
        //   ⚠️ 条目本体保留（历史 id 不动）：节点①的载体可直接复用本效果，敌方侧另有「狂怒印记」不受影响。
        playerEligible: false, enemyEligible: false,
    },
    {
        id: 'enhance_after_attacked_buff', name: '以守为攻', description: '我方单位被打击后，获得 +1/+1。',
        rarity: 'uncommon', icon: SPELL_IMAGES.temp_spell_15, effect: { type: 'passive' }, // [2026-08-27] 原 common→uncommon
        battleEffect: { trigger: 'after_attacked', effectClass: 'BUFF_SELF', params: { power: 1, health: 1 } },
        playerEligible: true, enemyEligible: false,
    },
    {
        id: 'enhance_cast_spell_buff', name: '法术共鸣', description: '每打出一个法术，随机赋予一个我方单位 +1/+1。',
        rarity: 'rare', icon: abc_spell, effect: { type: 'passive' },
        battleEffect: { trigger: 'on_cast_spell', effectClass: 'RANDOM_ALLY_BUFF', params: { power: 1, health: 1 } },
        playerEligible: true, enemyEligible: false,
    },
    {
        id: 'enhance_play_unit_buff', name: '军势鼓舞', description: '每打出一个单位，随机赋予一个我方单位 +1/+1。',
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
        id: 'enhance_health_to_power', name: '生命壁垒', description: '我方单位打击后，其生命值提升至等于攻击力。',
        rarity: 'epic', icon: abc_spell, effect: { type: 'passive' },
        battleEffect: { trigger: 'after_attack', effectClass: 'STAT_BALANCE', params: { mode: 'health_to_power' } },
        playerEligible: true, enemyEligible: false,
    },
    {
        id: 'enhance_power_to_health', name: '攻守易形', description: '我方单位打击后，其攻击力提升至等于生命值。',
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
        id: 'enhance_nexus_ally_buff', name: '水晶共鸣', description: '敌方水晶每受到 1 次伤害，随机赋予一个我方单位 +1/+1。',
        rarity: 'epic', icon: abc_spell, effect: { type: 'passive' }, // [2026-09-05] 原 rare（与牌库灌注品质互换）
        battleEffect: { trigger: 'on_nexus_strike', effectClass: 'RANDOM_ALLY_BUFF', params: { power: 1, health: 1 } },
        playerEligible: true, enemyEligible: false,
    },

    // ── [2026-09-25 莉莉子 任务化强化批 v3 · 试点] 《设计-肉鸽三线任务化框架》7.3 ──
    //   任务版：quest 是【解锁门】—— 达成阈值后 battleEffect 才开始逐回合生效。
    //   与现有强化【并列存在】（不替换、不改造）；⚠️ v1 只对玩家侧开放（敌方尚无任务进度推进管线）
    {
        id: 'enhance_iron_oath', name: '铁誓', description: '我方水晶累计受到 3 次伤害后：此后每回合开始，我方所有单位获得 +1/+1。',
        rarity: 'uncommon', icon: abc_spell, effect: { type: 'passive' },
        quest: { event: 'nexus_damaged', threshold: 3, scope: 'battle' },
        battleEffect: { trigger: 'round_start', effectClass: 'ALL_BUFF', params: { power: 1, health: 1 } },
        playerEligible: true, enemyEligible: false,
    },

    // ── [2026-09-25 莉莉子 强化线 · 新效果批 v3 §7.3] 全部为**新效果**，与现有强化并列存在 ──
    //   注意：白档（common）此前在玩家池里**一个都没有**（权重 70 却空着），本批补上 2 个
    {
        id: 'enhance_ember', name: '余烬', description: '我方单位阵亡时，敌方水晶受到 1 点伤害。',
        rarity: 'common', icon: abc_spell, effect: { type: 'passive' },
        battleEffect: { trigger: 'unit_die', effectClass: 'DEATH_NEXUS_DAMAGE', params: { value: 1 } },
        playerEligible: true, enemyEligible: false,
    },
    {
        id: 'enhance_scavenge', name: '拾荒', description: '每场战斗结束时，若我方水晶不低于 10 点，获得 20 金币。',
        rarity: 'common', icon: abc_spell, effect: { type: 'passive' },
        runBattleEndGold: 20, runBattleEndMinNexus: 10, // run 层结算（与凯旋之匣同一处），不走战斗内管线
        playerEligible: true, enemyEligible: false,
    },
    {
        id: 'enhance_atavism', name: '返祖', description: '我方单位阵亡时，其一个关键词随机赋予另一个我方单位。',
        rarity: 'uncommon', icon: abc_spell, effect: { type: 'passive' },
        battleEffect: { trigger: 'unit_die', effectClass: 'DEATH_GIFT_KEYWORD' },
        playerEligible: true, enemyEligible: false,
    },
    {
        id: 'enhance_sacrifice_echo', name: '献祭回响', description: '我方单位阵亡时，对敌方随机单位造成等于其攻击力的伤害。',
        rarity: 'epic', icon: abc_spell, effect: { type: 'passive' },
        battleEffect: { trigger: 'unit_die', effectClass: 'DEATH_STRIKE_RANDOM_ENEMY' },
        playerEligible: true, enemyEligible: false,
    },
    {
        id: 'enhance_bounty', name: '悬赏', description: '每回合开始时标记敌方攻击力最高的单位为悬赏；其被击杀后你抽 2 张牌并获得 50 金币，然后重新标记。',
        rarity: 'rare', icon: abc_spell, effect: { type: 'passive' },
        battleEffect: { trigger: 'round_start', effectClass: 'BOUNTY_CYCLE' }, // 自循环：标记 → 目标消失 → 结算 → 下回合重标记
        playerEligible: true, enemyEligible: false,
    },
    {
        id: 'enhance_last_stand', name: '孤军', description: '我方场上恰好只有 1 个单位时，该单位获得 +4/+4 与【屏障】（每场一次）。',
        rarity: 'legendary', icon: abc_spell, effect: { type: 'passive' },
        battleEffect: {
            trigger: 'round_start', effectClass: 'LONE_GUARD_BUFF', params: { power: 4, health: 4 },
            oncePerBattle: true, requireOnlyOneUnit: true, // 苛刻条件 + 极限单卡流（苛刻判定在分发前，不浪费"每场一次"）
        },
        playerEligible: true, enemyEligible: false,
    },
    {
        id: 'enhance_final_echo', name: '终焉回响', description: '每场战斗开局，随机 2 张手牌费用变为 0；代价：每场战斗开始时我方水晶 -2。',
        rarity: 'mythic', icon: abc_spell, effect: { type: 'passive' },
        battleEffect: { trigger: 'game_start', effectClass: 'OPENING_ZERO_COST', params: { count: 2, nexusCost: 2 } },
        playerEligible: true, enemyEligible: false,
    },
    {
        id: 'enhance_mana_surge', name: '共鸣涌流', description: '本场战斗中，我方每施放 3 个法术，法术法力上限 +1（最多 +3）。',
        rarity: 'rare', icon: abc_spell, effect: { type: 'passive' },
        spellManaGrowth: { every: 3, max: 3 }, // 资源规则类：计数在 playCard，生效在回合边界的法力计算
        playerEligible: true, enemyEligible: false,
    },
    {
        id: 'enhance_hoard', name: '囤积', description: '回合结束时，未使用的法力最多可有 3 点溢出进法术法力池（突破常规 3 点上限）—— 攒一波大招。',
        rarity: 'epic', icon: abc_spell, effect: { type: 'passive' },
        hoardSpellMana: 3,
        playerEligible: true, enemyEligible: false,
    },

    // ── [2026-08-27 莉莉子] 敌人专属迷宫强化（enemyEligible：编辑器给流派配置 → 战斗内 battleEffect 生效）──
    // 覆盖 9 个触发时机，镜像玩家侧管线（敌方 bench/hand/cast 由引擎 enemy 分支分发）
    {
        id: 'enemy_mobilize', name: '精锐动员', description: '开局召唤 1 费的鬼怪「安提娜」。',
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
        id: 'enemy_on_summon', name: '蜂拥而至', description: '敌方召唤单位时，本回合给予其 +1/+1。',
        rarity: 'common', icon: abc_spell, effect: { type: 'passive' },
        battleEffect: { trigger: 'on_summon', effectClass: 'BUFF', params: { power: 1, health: 1, duration: 'ROUND' } },
        playerEligible: false, enemyEligible: true,
    },
    {
        id: 'enemy_play_buff', name: '召唤浪潮', description: '敌方每打出一个单位，随机赋予一个敌方单位 +1/+1。',
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
        id: 'enemy_cast_buff', name: '法术渗透', description: '敌方每打出一个法术，随机赋予一个敌方单位 +1/+1。',
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
        id: 'enemy_nexus_buff', name: '连击之势', description: '我方水晶每受到 1 次伤害，随机赋予一个敌方单位 +1/+1。',
        rarity: 'epic', icon: abc_spell, effect: { type: 'passive' },
        battleEffect: { trigger: 'on_nexus_strike', effectClass: 'RANDOM_ALLY_BUFF', params: { power: 1, health: 1 } },
        playerEligible: false, enemyEligible: true,
    },

    // ── [2026-09-29 程拍板] 敌方开局法力强化三档（难度强度补偿：浅层 +1 / 中后段 +2 / 最深 +3）──
    //   机制：START_MANA_BONUS 是 **常驻查询型**（无 handler）—— 生效点在 logic/core.ts 的 startManaBonusOf，
    //   由 calculateRoundStart 每回合从零重算最大法力时读取，故**不能**写成 game_start 写值（会被下个回合边界冲掉）。
    //   仅敌方携带（playerEligible:false）：玩家侧不发放，故不会稀释玩家 3 选 1 池子。
    {
        id: 'enemy_start_mana_1', name: '先机·蓄势', description: '本场战斗，敌方最大法力 +1。',
        rarity: 'uncommon', icon: abc_spell, effect: { type: 'passive' },
        battleEffect: { trigger: 'game_start', effectClass: 'START_MANA_BONUS', params: { value: 1 } },
        playerEligible: false, enemyEligible: true,
    },
    {
        id: 'enemy_start_mana_2', name: '先机·涌流', description: '本场战斗，敌方最大法力 +2。',
        rarity: 'rare', icon: abc_spell, effect: { type: 'passive' },
        battleEffect: { trigger: 'game_start', effectClass: 'START_MANA_BONUS', params: { value: 2 } },
        playerEligible: false, enemyEligible: true,
    },
    {
        id: 'enemy_start_mana_3', name: '先机·洪峰', description: '本场战斗，敌方最大法力 +3。',
        rarity: 'epic', icon: abc_spell, effect: { type: 'passive' },
        battleEffect: { trigger: 'game_start', effectClass: 'START_MANA_BONUS', params: { value: 3 } },
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
        id: 'hand_discount', name: '传承武备', description: '打出一个单位时，手牌中随机一张单位卡费用减少，减少量等于打出单位的费用。',
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
        id: 'regen_nexus', name: '愈战愈勇', description: '回合开始时，我方水晶回复 5 点生命值。',
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
        id: 'steel_tide', name: '钢铁洪流', description: '回合开始时，我方所有单位获得 +1/+1。',
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
        // [2026-09-29 程拍板] 由「水晶回血」重做为**敌方专属**的"时间压力"型强化：
        //   · 免疫任何伤害 → 玩家打不动它的水晶，只能靠它每回合自扣熬死它
        //   · 全体 幻象+吸血 → 它的场面极难清理
        //   · 回合结束自扣 5 → 唯一的败因，给玩家一个可数的倒计时
        //   描述按**玩家视角**写（敌方…），与其余 enemy_* 条目一致
        id: 'immortal_body', name: '不死之身',
        description: '敌方水晶免疫任何伤害；敌方所有单位获得【幻象】与【吸血】；每回合结束时，敌方水晶生命值 -5。',
        rarity: 'mythic', icon: SPELL_IMAGES.vitality_regen, effect: { type: 'passive' },
        // 一个强化多个效果（一条数据，不是多条）——面板/抽屉里只出现「不死之身」一项
        battleEffects: [
            { trigger: 'game_start', effectClass: 'NEXUS_IMMUNE' },
            { trigger: 'game_start', effectClass: 'ALL_UNITS_GRANT_KEYWORD', params: { keywords: ['Ephemeral', 'Lifesteal'] } },
            { trigger: 'on_summon', effectClass: 'ALL_UNITS_GRANT_KEYWORD', params: { keywords: ['Ephemeral', 'Lifesteal'] } },
            { trigger: 'round_end', effectClass: 'NEXUS_SELF_DAMAGE', params: { value: 5 } },
        ],
        playerEligible: false, enemyEligible: true,
    },
    {
        id: 'war_lord', name: '战争领主', description: '回合开始时，我方所有单位获得 +2/+2，并进行备战。',
        rarity: 'mythic', icon: abc_spell, effect: { type: 'passive' },
        battleEffect: { trigger: 'round_start', effectClass: 'ALL_BUFF', params: { power: 2, health: 2, rally: true } },
        playerEligible: true, enemyEligible: true,
    },
    {
        id: 'undying_host', name: '不死军团', description: '我方每个单位阵亡时，都会在回合开始时被复活。',
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
        id: 'enhance_champion_resonance', name: '天启共鸣', description: '开局从牌库中随机抽一张天启者卡牌到手牌。',
        rarity: 'legendary', icon: SPELL_IMAGES.energy_supplement, effect: { type: 'passive' }, // [2026-09-06 莉莉子] 图标接入：能量补充（开局抽天启者主题）
        battleEffect: { trigger: 'game_start', effectClass: 'CHAMPION_TO_HAND' },
        playerEligible: false, enemyEligible: false,
    },

    // ── [2026-09-25 莉莉子 三线任务化框架 · 武装线] 武装的【战斗内效果载体】（不进任何抽选池）──
    //   武装完成整局任务后，RogueGameWrapper 把这里的 id 注入本场 rogueEnhancements，
    //   从而复用迷宫强化既有的分发管线（trigger → handler，以及强化面板的展示）。
    {
        id: 'armfx_echo_box', name: '余响之匣', description: '开局额外抽 2 张牌。',
        rarity: 'common', icon: abc_spell, effect: { type: 'passive' },
        battleEffect: { trigger: 'game_start', effectClass: 'DRAW_CARDS', params: { value: 2 } },
        playerEligible: false, enemyEligible: false,
    },
    {
        id: 'armfx_devour_box', name: '噬牌之匣', description: '每回合开始：弃掉手牌中费用最低的一张，天启者 +1/+1。',
        rarity: 'rare', icon: abc_spell, effect: { type: 'passive' },
        battleEffect: { trigger: 'round_start', effectClass: 'DISCARD_LOWEST_BUFF_CHAMPION' },
        playerEligible: false, enemyEligible: false,
    },
    {
        id: 'armfx_royal_warrant', name: '王权之证', description: '开局：天启者必定入手（水晶代价在战斗初值处已扣）。',
        rarity: 'mythic', icon: abc_spell, effect: { type: 'passive' },
        battleEffect: { trigger: 'game_start', effectClass: 'CHAMPION_TO_HAND' },
        playerEligible: false, enemyEligible: false,
    },
    {
        id: 'armfx_break_dawn', name: '破晓号令', description: '每场战斗一次：敌方手牌中随机 3 张单位卡费用 +2。',
        rarity: 'uncommon', icon: abc_spell, effect: { type: 'passive' },
        battleEffect: { trigger: 'round_start', effectClass: 'TAX_ENEMY_HAND', params: { value: 2, count: 3 }, oncePerBattle: true },
        playerEligible: false, enemyEligible: false,
    },
    {
        id: 'armfx_attune_crystal', name: '共鸣水晶', description: '随机赋予天启者一个关键词，其关键词同时赋予在场我方单位。',
        rarity: 'rare', icon: abc_spell, effect: { type: 'passive' },
        battleEffect: { trigger: 'round_start', effectClass: 'SPREAD_CHAMPION_KEYWORDS' },
        playerEligible: false, enemyEligible: false,
    },
    {
        id: 'armfx_whisper_dead', name: '亡者低语', description: '此后每次召唤，新单位获得最后阵亡单位的攻血。',
        rarity: 'epic', icon: abc_spell, effect: { type: 'passive' },
        battleEffect: { trigger: 'on_summon', effectClass: 'SUMMON_INHERIT_LAST_DEAD' },
        playerEligible: false, enemyEligible: false,
    },

    // ── [2026-09-28 莉莉子 神格神经线] 神格神经节点的【战斗内效果载体】（不进任何抽选池）──
    //   与武装线同一套做法：节点激活 → RogueGameWrapper 把这里的 id 注入本场 rogueEnhancements，
    //   从而复用迷宫强化既有的分发管线（trigger → handler + 强化面板展示），不另开执行器。
    //   ⚠️ ③④ 是 ①② 的【升级】——注入时**只带高档**（覆盖逻辑在 heroDivinity.resolveDivinityEffects 收口）
    {
        id: 'divfx_lyfe_1', name: '决意·凝锋', description: '我方单位打击后，获得 +1/+1。',
        rarity: 'common', icon: SPELL_IMAGES.lyfe_rush, effect: { type: 'passive' },
        battleEffect: { trigger: 'after_attack', effectClass: 'BUFF_SELF', params: { power: 1, health: 1 } },
        playerEligible: false, enemyEligible: false,
    },
    {
        id: 'divfx_lyfe_2', name: '决意·邀战', description: '回合开始时，在手牌中生成一张瞬逝的「单挑」。',
        rarity: 'common', icon: SPELL_IMAGES.lyfe_ultimate, effect: { type: 'passive' },
        battleEffect: { trigger: 'round_start', effectClass: 'GENERATE', params: { generateKey: 'single_combat', isVolatile: true } },
        playerEligible: false, enemyEligible: false,
    },
    {
        id: 'divfx_lyfe_3', name: '决意·锋锐', description: '我方单位打击后，获得 +2/+2。（升级「决意·凝锋」）',
        rarity: 'uncommon', icon: SPELL_IMAGES.lyfe_rush, effect: { type: 'passive' },
        battleEffect: { trigger: 'after_attack', effectClass: 'BUFF_SELF', params: { power: 2, health: 2 } },
        playerEligible: false, enemyEligible: false,
    },
    {
        id: 'divfx_lyfe_4', name: '决意·驰援', description: '回合开始时，在手牌中生成一张 0 费、瞬逝的「单挑」。（升级「决意·邀战」）',
        rarity: 'uncommon', icon: SPELL_IMAGES.lyfe_ultimate, effect: { type: 'passive' },
        battleEffect: { trigger: 'round_start', effectClass: 'GENERATE', params: { generateKey: 'single_combat', isVolatile: true, costOverride: 0 } },
        playerEligible: false, enemyEligible: false,
    },
    {
        id: 'divfx_common_5', name: '神格·潮汐', description: '本场战斗，我方最大法力 +1。',
        rarity: 'rare', icon: abc_spell, effect: { type: 'passive' },
        battleEffect: { trigger: 'game_start', effectClass: 'START_MANA_BONUS', params: { value: 1 } },
        playerEligible: false, enemyEligible: false,
    },
    {
        id: 'divfx_lyfe_6', name: '决意·不退之阵',
        description: '我方所有单位获得 +0/+1 与【再生】（含此后召唤的单位）；且每回合在手牌中生成一张 0 费、瞬逝的「专注」。',
        rarity: 'legendary', icon: SPELL_IMAGES.lyfe_spell, effect: { type: 'passive' },
        // [2026-09-28 程拍板] **一个强化三个效果**：不是三条强化 —— 界面/结算/抽屉里只出现这一条
        battleEffects: [
            { trigger: 'game_start', effectClass: 'ALL_UNITS_GRANT_KEYWORD', params: { power: 0, health: 1, keyword: 'Regeneration' } },
            { trigger: 'on_summon', effectClass: 'ALL_UNITS_GRANT_KEYWORD', params: { power: 0, health: 1, keyword: 'Regeneration' } },
            { trigger: 'round_start', effectClass: 'GENERATE', params: { generateKey: 'focus', isVolatile: true, costOverride: 0 } },
        ],
        playerEligible: false, enemyEligible: false,
    },
    // ── [2026-09-28 莉莉子 神格神经 · 安卡希雅（飞剑纵横）] 节点载体（程的设计，全格零引擎）──
    {
        id: 'divfx_acacia_1', name: '月轮·引剑', description: '我方召唤单位时，本回合给予其 +1/+0。',
        rarity: 'common', icon: SPELL_IMAGES.acacia_chrono_echo_rush, effect: { type: 'passive' },
        battleEffect: { trigger: 'on_summon', effectClass: 'BUFF', params: { power: 1, health: 0 } },
        playerEligible: false, enemyEligible: false,
    },
    {
        id: 'divfx_acacia_2', name: '残月·拾遗', description: '我方单位阵亡时，随机一张手牌费用 -1。',
        rarity: 'common', icon: SPELL_IMAGES.acacia_chrono_echo_ultimate, effect: { type: 'passive' },
        battleEffect: { trigger: 'unit_die', effectClass: 'HAND_COST_DOWN', params: { amount: 1, anyCard: true } },
        playerEligible: false, enemyEligible: false,
    },
    {
        id: 'divfx_acacia_3', name: '满月·锋芒', description: '我方召唤单位时，本回合给予其 +2/+0。（升级「月轮·引剑」）',
        rarity: 'uncommon', icon: SPELL_IMAGES.acacia_chrono_echo_rush, effect: { type: 'passive' },
        battleEffect: { trigger: 'on_summon', effectClass: 'BUFF', params: { power: 2, health: 0 } },
        playerEligible: false, enemyEligible: false,
    },
    {
        id: 'divfx_acacia_4', name: '朔望·减耗', description: '我方单位阵亡时，随机一张手牌费用 -2。（升级「残月·拾遗」）',
        rarity: 'uncommon', icon: SPELL_IMAGES.acacia_chrono_echo_ultimate, effect: { type: 'passive' },
        battleEffect: { trigger: 'unit_die', effectClass: 'HAND_COST_DOWN', params: { amount: 2, anyCard: true } },
        playerEligible: false, enemyEligible: false,
    },
    {
        id: 'divfx_acacia_6', name: '剑舞长空',
        description: '回合开始时，在手牌中生成一张 0 费的「安卡希雅的剑舞」；且我方所有单位获得【先攻】。',
        rarity: 'legendary', icon: SPELL_IMAGES.acacia_chrono_echo_spell, effect: { type: 'passive' },
        // 一条强化两个效果（都在 round_start）：生成 0 费剑舞 + 全员先攻
        battleEffects: [
            { trigger: 'round_start', effectClass: 'GENERATE', params: { generateKey: 'acacia_chrono_echo_spell', costOverride: 0 } },
            { trigger: 'round_start', effectClass: 'ALL_UNITS_GRANT_KEYWORD', params: { keyword: 'QuickAttack' } },
        ],
        playerEligible: false, enemyEligible: false,
    },
    // ── [2026-09-28 莉莉子 神格神经 · 芬妮（偶像爆发）] 节点载体（程的设计）──
    {
        id: 'divfx_fenny_1', name: '聚光灯下', description: '每回合首个打出的单位获得 +2/+0。',
        rarity: 'common', icon: SPELL_IMAGES.fenny_strike, effect: { type: 'passive' },
        battleEffect: { trigger: 'on_first_play_unit', effectClass: 'BUFF_SELF', params: { power: 2, health: 0 } },
        playerEligible: false, enemyEligible: false,
    },
    {
        id: 'divfx_fenny_3', name: '全场焦点', description: '每回合首个打出的单位获得 +4/+0 与【碾压】。（升级「聚光灯下」）',
        rarity: 'uncommon', icon: SPELL_IMAGES.fenny_strike, effect: { type: 'passive' },
        battleEffect: { trigger: 'on_first_play_unit', effectClass: 'BUFF_SELF', params: { power: 4, health: 0, keywords: ['Overwhelm'] } },
        playerEligible: false, enemyEligible: false,
    },
    {
        id: 'divfx_fenny_2', name: '万人合唱', description: '发起进攻时，若我方进攻单位攻击力总和超过 15，则进行备战。',
        rarity: 'common', icon: SPELL_IMAGES.fenny_ultimate, effect: { type: 'passive' },
        battleEffect: { trigger: 'on_attack_declare', effectClass: 'RALLY_IF_ATTACK_POWER', params: { threshold: 15 } },
        playerEligible: false, enemyEligible: false,
    },
    {
        id: 'divfx_fenny_4', name: '安可返场', description: '发起进攻时，若我方进攻单位攻击力总和超过 10，则进行备战。（升级「万人合唱」）',
        rarity: 'uncommon', icon: SPELL_IMAGES.fenny_ultimate, effect: { type: 'passive' },
        battleEffect: { trigger: 'on_attack_declare', effectClass: 'RALLY_IF_ATTACK_POWER', params: { threshold: 10 } },
        playerEligible: false, enemyEligible: false,
    },
    {
        id: 'divfx_fenny_6', name: '聚光灯不落',
        description: '每回合一次：任意我方单位阵亡时，以满血复活，并获得【凶恶】与【坚韧】。',
        rarity: 'legendary', icon: SPELL_IMAGES.fenny_spell, effect: { type: 'passive' },
        battleEffect: {
            trigger: 'unit_die', effectClass: 'RESURRECT',
            params: { oncePerRound: true, noEphemeral: true, keywords: ['Fearsome', 'Tough'] },
        },
        playerEligible: false, enemyEligible: false,
    },
    // ── [2026-09-28 莉莉子 神格神经 · 卜卜（镜阵控场）] 节点载体（程的设计）──
    {
        id: 'divfx_bubu_1', name: '镜爻随征', description: '每次我方进攻时，随机召唤一个进攻中的复制单位，并赋予【瞬逝】。',
        rarity: 'common', icon: SPELL_IMAGES.pupu_specular_soul_rush, effect: { type: 'passive' },
        battleEffect: { trigger: 'on_attack_declare', effectClass: 'CLONE_ON_DECLARE', params: {} },
        playerEligible: false, enemyEligible: false,
    },
    {
        id: 'divfx_bubu_3', name: '万象镜身',
        description: '每次我方进攻时，召唤一个进攻中的攻击力最高的复制单位，并赋予 +2/+0 和【瞬逝】。（升级「镜爻随征」）',
        rarity: 'uncommon', icon: SPELL_IMAGES.pupu_specular_soul_rush, effect: { type: 'passive' },
        battleEffect: { trigger: 'on_attack_declare', effectClass: 'CLONE_ON_DECLARE', params: { strongest: true, power: 2 } },
        playerEligible: false, enemyEligible: false,
    },
    {
        id: 'divfx_bubu_2', name: '卜骨遗响', description: '我方单位阵亡时，其攻击力随机加成到手牌中的一个单位。',
        rarity: 'common', icon: SPELL_IMAGES.pupu_specular_soul_ultimate, effect: { type: 'passive' },
        battleEffect: { trigger: 'unit_die', effectClass: 'DEATH_GIFT', params: { powerOnly: true } },
        playerEligible: false, enemyEligible: false,
    },
    {
        id: 'divfx_bubu_4', name: '龟甲承魂',
        description: '我方单位阵亡时，其攻击力和生命值随机加成到战场 / 备战席 / 手牌中的一个单位。（升级「卜骨遗响」）',
        rarity: 'uncommon', icon: SPELL_IMAGES.pupu_specular_soul_ultimate, effect: { type: 'passive' },
        battleEffect: { trigger: 'unit_die', effectClass: 'DEATH_GIFT', params: { targets: 'all' } },
        playerEligible: false, enemyEligible: false,
    },
    {
        id: 'divfx_bubu_6', name: '镜阵回响',
        description: '我方每次打击敌方水晶时：回合结束时，我方备战席上攻击力最高的单位再次打击敌方水晶。',
        rarity: 'legendary', icon: SPELL_IMAGES.pupu_specular_soul_spell, effect: { type: 'passive' },
        // 一条强化两段式：记账（on_nexus_strike）+ 兑现（round_end）
        battleEffects: [
            { trigger: 'on_nexus_strike', effectClass: 'NEXUS_REPEAT_STRIKE' },
            { trigger: 'round_end', effectClass: 'NEXUS_REPEAT_STRIKE' },
        ],
        playerEligible: false, enemyEligible: false,
    },
    // ── [2026-09-28 莉莉子 神格神经 · 猫汐尔（莲驱曲线）] 节点载体（程的设计）──
    {
        id: 'divfx_mauxir_1', name: '莲池计数', description: '回合开始时，我方备战席上每有 1 个召唤衍生物，本回合最大法力 +1。',
        rarity: 'common', icon: SPELL_IMAGES.mauxir_lotus_rush, effect: { type: 'passive' },
        battleEffect: { trigger: 'round_start', effectClass: 'MANA_PER_SUMMON_ROUND' },
        playerEligible: false, enemyEligible: false,
    },
    {
        id: 'divfx_mauxir_3', name: '莲脉增殖', description: '我方每召唤 1 个召唤衍生物，本场战斗最大法力永久 +1。（升级「莲池计数」）',
        rarity: 'uncommon', icon: SPELL_IMAGES.mauxir_lotus_rush, effect: { type: 'passive' },
        battleEffect: { trigger: 'on_summon', effectClass: 'MANA_PER_SUMMON_PERMANENT' },
        playerEligible: false, enemyEligible: false,
    },
    {
        id: 'divfx_mauxir_2', name: '梦莲投递', description: '回合开始时，在手牌中生成一张「梦莲无人机」。',
        rarity: 'common', icon: SPELL_IMAGES.mauxir_lotus_ultimate, effect: { type: 'passive' },
        battleEffect: { trigger: 'round_start', effectClass: 'GENERATE', params: { generateKey: 'dream_lotus_drone', count: 1 } },
        playerEligible: false, enemyEligible: false,
    },
    {
        id: 'divfx_mauxir_4', name: '双莲速递', description: '回合开始时，在手牌中生成两张「梦莲无人机」。（升级「梦莲投递」）',
        rarity: 'uncommon', icon: SPELL_IMAGES.mauxir_lotus_ultimate, effect: { type: 'passive' },
        battleEffect: { trigger: 'round_start', effectClass: 'GENERATE', params: { generateKey: 'dream_lotus_drone', count: 2 } },
        playerEligible: false, enemyEligible: false,
    },
    {
        id: 'divfx_mauxir_6', name: '莲台无垠',
        description: '我方所有法术费用 -1；「臆莲基座」的攻击力不再有上限限制。',
        rarity: 'legendary', icon: SPELL_IMAGES.mauxir_lotus_spell, effect: { type: 'passive' },
        // 一条强化三个效果：开局法术减费 + 开局/此后召唤都解除基座攻击上限
        battleEffects: [
            { trigger: 'game_start', effectClass: 'SPELL_COST_DOWN_ALL', params: { amount: 1 } },
            { trigger: 'game_start', effectClass: 'REMOVE_MAX_POWER', params: { cardKey: 'mauxir_lotus_pedestal' } },
            { trigger: 'on_summon', effectClass: 'REMOVE_MAX_POWER', params: { cardKey: 'mauxir_lotus_pedestal' } },
        ],
        playerEligible: false, enemyEligible: false,
    },
    // ── [2026-09-28 莉莉子 神格神经 · 茉莉安（信标猎场）] 节点载体（程的设计）──
    {
        id: 'divfx_marian_1', name: '猎影援护', description: '我方拉取暴露单位时，本回合给予发起拉取的我方单位 +2/+0。',
        rarity: 'common', icon: SPELL_IMAGES.marian_rush, effect: { type: 'passive' },
        battleEffect: { trigger: 'on_pull_exposed', effectClass: 'BUFF', params: { power: 2, health: 0 } },
        playerEligible: false, enemyEligible: false,
    },
    {
        id: 'divfx_marian_3', name: '猎影疾袭', description: '我方拉取暴露单位时，本回合给予发起拉取的我方单位 +3/+0 与【快速攻击】。（升级「猎影援护」）',
        rarity: 'uncommon', icon: SPELL_IMAGES.marian_rush, effect: { type: 'passive' },
        battleEffect: { trigger: 'on_pull_exposed', effectClass: 'BUFF', params: { power: 3, health: 0, keywords: ['QuickAttack'] } },
        playerEligible: false, enemyEligible: false,
    },
    {
        id: 'divfx_marian_2', name: '猎场哨戒', description: '回合开始时，暴露一个敌人，并对随机敌人造成 2 点伤害。',
        rarity: 'common', icon: SPELL_IMAGES.marian_ultimate, effect: { type: 'passive' },
        battleEffect: { trigger: 'round_start', effectClass: 'EXPOSE_AND_DAMAGE', params: { damage: 2, damageTarget: 'random' } },
        playerEligible: false, enemyEligible: false,
    },
    {
        id: 'divfx_marian_4', name: '猎场锁定', description: '回合开始时，暴露一个敌人，并对血量最多的敌人造成 4 点伤害。（升级「猎场哨戒」）',
        rarity: 'uncommon', icon: SPELL_IMAGES.marian_ultimate, effect: { type: 'passive' },
        battleEffect: { trigger: 'round_start', effectClass: 'EXPOSE_AND_DAMAGE', params: { damage: 4, damageTarget: 'mostHp' } },
        playerEligible: false, enemyEligible: false,
    },
    {
        id: 'divfx_marian_6', name: '猎场收网',
        description: '敌方（我方埋在对方席位的）獠牙信标造成的伤害翻倍。',
        rarity: 'legendary', icon: SPELL_IMAGES.marian_spell, effect: { type: 'passive' },
        // 常驻查询型（无 handler）：倍率在 effectProcessor 的 SPREAD_DAMAGE 处按本 id 乘算（6 → 12）
        battleEffect: { trigger: 'game_start', effectClass: 'BEACON_DAMAGE_MULT' },
        playerEligible: false, enemyEligible: false,
    },
];

/**
 * [2026-09-28 莉莉子 神格神经] 一条强化的**全部战斗内效果**：
 *   单效果（`battleEffect`）与多效果（`battleEffects`）的统一视图。
 *   ⚠️ 凡是要遍历"这条强化有哪些效果"的地方（分发器 / 打击强化 / UI 标签）都必须走这里，
 *      直接读 `def.battleEffect` 会漏掉多效果条目。
 */
export const getBattleEffects = (def: MazeBuff): BattleEffectDef[] =>
    def.battleEffects?.length ? def.battleEffects : (def.battleEffect ? [def.battleEffect] : []);

// [2026-09-25 莉莉子 防回归守卫] id 唯一性自检 —— 撞号会让 getBuffById / 解锁门 / 进度键全部串号
//   （2026-09-25 装备侧真实发生过一次撞号事故，强化侧同款风险，故一并加上）
if (import.meta.env?.DEV) {
    const seen = new Set<string>();
    for (const b of MAZE_BUFFS) {
        if (seen.has(b.id)) console.error(`[buffs] 迷宫强化 id 撞号：${b.id} —— 会被抢先匹配、进度键也会串号`);
        seen.add(b.id);
    }
}

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
// [2026-09-29 程拍板] 携带数量表修正（浅层长平台 + 末期跳档）：
//   - 普通 normal    ：0 → 0 → 0 → 1   （前 2/3 全程干净，只有冲刺期才给 1 个）
//   - 机密 secret    ：1 → 1 → 1 → 2   （浅层恒 1，末期 2）
//   - 绝密 topsecret ：2 → 2 → 2 → 3   （浅层恒 2，末期 3）
// frac 为「战斗进度深度」（mapLayout.computeCombatDepth）：第一战 0、最深战斗节点/Boss 1。
// ⚠️ 最深档 count 不得超过敌方池子条目数（池空即提前收手），新增敌方强化时需复核 counts。
export const ENEMY_COUNT_BY_DIFFICULTY: Record<RogueDifficulty, { maxFrac: number; count: number }[]> = {
    normal: [
        { maxFrac: 0.01, count: 0 },
        { maxFrac: 0.34, count: 0 },
        { maxFrac: 0.67, count: 0 },
        { maxFrac: 1.01, count: 1 },
    ],
    secret: [
        { maxFrac: 0.34, count: 1 },
        { maxFrac: 0.67, count: 1 },
        { maxFrac: 1.01, count: 2 },
    ],
    topsecret: [
        { maxFrac: 0.34, count: 2 },
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
