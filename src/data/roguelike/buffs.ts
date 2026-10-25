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
    // [2026-10-06 程拍板 · 新增强化「霜锋乘势」] 新时机：**每次获得进攻标识时**
    //   唯一入口 = `processOnGetAttackToken`（回合初的"块 B" 与 回合内的授予账本检测器都调它）
    //   ⇒ 天然"一次授予派发一次"（去重靠 `tokenGrantSeq / tokenGrantHandled`）
    | 'on_get_attack_token'
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
    | 'SET_RANDOM_STATS'     // [2026-10-06 程拍板] 回合开始：将对方**随机一个**单位强制设为 1/1（「衰弱蔓延」）
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
    // [2026-10-08 莉莉子 · 瓦尔基里大赛] **从牌库/手牌召唤**（区别于 SUMMON 的"造卡"）：
    //   取牌库或手牌里的**实例** ⇒ 天然带装备/武装（开局构建时已挂好）；语义是**移出**原处
    //   ⚠️ [2026-10-10] 加查手牌；⚠️ [2026-10-21] 两处都没有时**兜底造卡**（并随机挂 3 件装备）
    //   ⇒ 与 SUMMON 的差别现在只剩"**优先**取实例"这一层，不再是"绝不造卡"。
    | 'SUMMON_FROM_DECK'
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
    | 'LONE_GUARD_BUFF'             // 孤军：我方场上恰好 1 个单位时，该单位 +5/+5 并获得【坚韧】【再生】
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
    | 'NEXUS_REPEAT_STRIKE'    // 卜卜⑥：**每回合首次**打击敌方水晶时记账 → 回合结束由我方最强单位再打一次
    // [2026-09-28 神格神经 · 猫汐尔]
    | 'MANA_PER_SUMMON_ROUND'     // ①回合开始：每有 1 个召唤衍生物 → **本回合**最大法力 +1
    | 'MANA_PER_SUMMON_PERMANENT' // ③每召唤 1 个衍生物 → **本场永久**最大法力 +1（计数存 questProgress）
    | 'SPELL_COST_DOWN_ALL'       // ⑥开局：我方手牌+牌库所有法术魔耗 -N
    | 'REMOVE_MAX_POWER'         // ⑥清除指定卡（臆莲基座）的攻击力上限
    // [2026-09-28 神格神经 · 茉莉安]
    | 'EXPOSE_AND_DAMAGE'        // ②④回合开始：暴露一个敌人，并对随机/血量最多的敌人造成 N 点伤害
    | 'BEACON_DAMAGE_MULT'       // ⑥常驻查询型：獠牙信标亡语伤害翻倍（在 SPREAD_DAMAGE 处乘算，无 handler）
    // [2026-10-24 程拍板] 开局：给我方**手牌 + 牌库**的每张卡各随机挂一件**指定品质**的装备（params.rarity）
    //   池子走项目铁律 `getEquipPoolForCard` —— 自动排除武装 / 非战斗装 / 不适用本卡的件，
    //   法术卡只会拿到 `spellOnly` 件（不会出现"挂了却毫无作用"的空装备）。
    //   ⚠️ 每张卡**只挂一件**；无同品质候选的卡原样不动（不留空槽、不报错）。
    | 'EQUIP_ALL_CARDS'
    // [2026-10-24 程拍板] 指定费用的**我方单位**获得 +N/+M（第 15 条「1 费单位 +3/+3」）
    //   双时机搭档：`game_start`（开局已在场的）+ `on_summon`（此后召唤的）—— 与「决意·不退之阵」同范式
    | 'BUFF_COST_UNITS'
    // [2026-10-24 程拍板 · 第 1 条] 回合开始：**随机**从牌组（没有则手牌）召唤一个指定费用的非天启者单位
    | 'SUMMON_BY_COST_FROM_DECK'
    // [2026-10-24 程拍板 · 第 2 条] 我方单位首次阵亡：从**完整卡池**随机召唤一个费用低 1 费的非天启者单位
    | 'SUMMON_LOWER_COST_ON_DEATH'
    // [2026-10-24 程拍板 · 费用修饰器三套] 三者都是**查询/标记型**（无 handler）：
    //   生效点在 `utils/gameRules.ts` 的费用修饰器快照 + 各站点埋点（建局重设 / 出牌累加 / 回合清零）。
    | 'SPELL_COST_UP_ALL'   // 4/5：**敌我双方**的法术费用 +N（params.amount；按持有条数叠加）
    | 'COST_TAX'            // 6/7：持有方每打出一张卡 ⇒ 对手所有手牌 +1（params.mode: 'round' 回合末清 / 'run' 跨回合）
    | 'CHAIN_PLAY_TAX'      // 20：持有方每回合从第 (after+1) 张起，每张给对手 +amount（可叠加，回合末清）
    // [2026-10-24 程拍板 · 第 14 条] 开局把六位天启者的 **Lv2 形态**各一张洗入牌库（params.championKeys）
    | 'UPGRADED_CHAMPIONS_TO_DECK'
    // [2026-10-24 程拍板 · 第 19 条] 回合开始：随机选定一支后勤小队，把它的**全部成员**召唤到备战席
    | 'SUMMON_RANDOM_SQUAD'
    // [2026-10-24 程拍板 · 第 16 条] 回合结束：消灭敌我双方除**各自最强**以外的所有单位。
    //   **查询/标记型**（无 handler）：真正执行在 `useRoundLifecycle` 的回合末序列里 ——
    //   "逐个杀 → 走完死亡链 → 再杀下一个"必须待在 hook 侧（`judgeLifeAndDeath` 是 hook 内部闭包，
    //   迷宫 handler 的 ctx 拿不到），详见那边的实现注释。
    | 'MASSACRE_EXCEPT_STRONGEST'
    // [2026-10-24 程拍板 · 第 21 条] 我方水晶**每回合**受到 3 次伤害后，此后每次受到的伤害降至 1。
    //   **查询/标记型**（无 handler）：执行点在 `useGameState` 的两处水晶扣血（战斗主路径），
    //   计数快照在 `utils/gameRules`（每回合重置）。
    | 'NEXUS_DAMAGE_CAP';
export interface BattleEffectDef {
    trigger: BattleTrigger;
    effectClass: BattleEffectClass;
    priority?: number; // [2026-09-09 莉莉子] 同 trigger 串行触发顺序（小先大后，回落=获取序）。同一 trigger 内多个 targeting 效果靠它定先后。
    params?: Record<string, unknown>; // 执行参数，逻辑层按类读取
    oncePerBattle?: boolean; // [2026-09-25 莉莉子 三线任务化框架] 本场战斗只生效一次（破晓号令等）；账本借用 questProgress 的 used:<id> 键
    requireOnlyOneUnit?: boolean; // [2026-09-25 莉莉子 强化线] 苛刻条件：我方场上恰好 1 个单位才分发（孤军）；判定在"每场一次"记账之前，不会白白消耗掉那一次
    /**
     * [2026-10-24 莉莉子 · 「第 N 回合」类强化] **回合门槛**：声明后，该效果只在 `game.round` 等于此值时分发。
     * 判据在分发器统一收口（`logic/rogueTrigger.ts` 的 `runRogueTrigger`），**任何 effectClass 都能用**，handler 无需关心。
     * round 语义：首回合 = 1（`logic/core.ts` 的 `calculateRoundStart` 把 0 → 1），与 UI 上看到的"第几回合"一致。
     * 典型用法：第五回合才发生一次的召唤 / 生成 ⇒ 天然只触发一次，不需要再配 `oncePerBattle`。
     */
    round?: number;
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
        playerEligible: true, enemyEligible: true,
    },
    // [2026-10-08 莉莉子 · 瓦尔基里大赛] **世纪和解**（仅「瓦尔基里大赛」绝密档可得）
    //   效果：开局时**从牌库与手牌**召唤里芙与芬妮到备战席（从原处移出，带装备随卡而来）
    //   ⚠️ [2026-10-10 莉莉子 BUG修复 · 程实测] 原先**只查牌库** ⇒ 有一张被起手抽进手牌时就不会被召唤
    //      （程：「有时候只召唤出里芙和芬妮其中的一个」）⇒ 现改为牌库 + 手牌都查
    //      （实现见 `logic/rogueTrigger.ts` 的 `SUMMON_FROM_DECK`）
    //   ⚠️ `playerEligible: false` ⇒ **不进任何随机池**（同神格神经 `divfx_*` 的做法），
    //      玩家唯一的获取途径是该事件的 `addEnhancementFrom`。
    //   ⚠️ `enemyEligible: true` ⇒ 绝密档「在哪里参赛？」的敌方**也持有一条**（程的表里明确写了）。
    //   ⚠️ [2026-10-21 莉莉子 BUG修复 · 程点名] 牌库与手牌**都**没有某一位时，原实现直接跳过
    //      ⇒ 对"既没带里芙也没带芬妮"的卡组，本强化等于空气。现改为**逐 key 兜底**：
    //      造一个该天启者到备战席，并随机佩戴 **3 件**装备（`getEquipPoolForCard` 全池、不设品质上限、
    //      每件不重复）。程原话：「这个兜底就是专门做给敌人的」—— 玩家侧在此前调整下已不会缺这两位；
    //      实现上仍**敌我同款**（按 `ctx.owner` 分侧，不额外分化）。
    //      （实现见 `logic/rogueTrigger.ts` 的 `SUMMON_FROM_DECK` ③ 分支）
    {
        id: 'enhance_century_reconciliation', name: '世纪和解',
        description: '开局时，从牌库与手牌召唤里芙与芬妮到备战席；若找不到某一位，则直接召唤她并随机佩戴三件装备。',
        rarity: 'mythic', icon: SPELL_IMAGES.lyfe_fenny, effect: { type: 'passive' },
        battleEffect: { trigger: 'game_start', effectClass: 'SUMMON_FROM_DECK', params: { summonKeys: ['lyfe', 'fenny'] } },
        playerEligible: false, enemyEligible: true,
    },

    // ── [2026-10-24 程拍板 · 开局召唤六位天启者] 单英雄版「世纪和解」 ──
    //   与「世纪和解」走**同一条管线**（`game_start` + `SUMMON_FROM_DECK`：牌库 → 手牌 → 兜底造卡 三级回退）。
    //   🔴 [2026-10-24 程拍板 · 定稿] **品质 = 传说（金）**，兜底装备 = **1 件**（`fallbackEquips: 1`）。
    //      程的原话：「不能不做兜底，否则玩家拿到这个强化一点用都没有会骂娘；但件数要可控，一件就行」。
    //      ⇒ 卡组没带该英雄时**仍然**会造一个她上场（强化不会变成空气），但只带一件装备，不是三件。
    //      「世纪和解」**不传**这个参数 ⇒ 仍走默认 3 件，本改动不影响它。
    //   📌 key 与 `ROGUE_HEROES`（`rogueStarterDecks.ts:15-22`）同源，即肉鸽天启者选择界面的六位。
    //   📌 图标用各英雄的大招图（与 `divfx_*_6` 神格节点同款），无需新增图片资源。
    {
        id: 'enhance_open_lyfe', name: '凛冬先声',
        description: '开局时，从牌库与手牌召唤里芙到备战席；若都没有，则直接召唤她并随机佩戴一件装备。',
        rarity: 'legendary', icon: SPELL_IMAGES.lyfe_spell, effect: { type: 'passive' },
        battleEffect: { trigger: 'game_start', effectClass: 'SUMMON_FROM_DECK', params: { summonKeys: ['lyfe'], fallbackEquips: 1 } },
        playerEligible: true, enemyEligible: true,
    },
    {
        id: 'enhance_open_fenny', name: '耀目开场',
        description: '开局时，从牌库与手牌召唤芬妮到备战席；若都没有，则直接召唤她并随机佩戴一件装备。',
        rarity: 'legendary', icon: SPELL_IMAGES.fenny_spell, effect: { type: 'passive' },
        battleEffect: { trigger: 'game_start', effectClass: 'SUMMON_FROM_DECK', params: { summonKeys: ['fenny'], fallbackEquips: 1 } },
        playerEligible: true, enemyEligible: true,
    },
    {
        id: 'enhance_open_mauxir', name: '莲开于席',
        description: '开局时，从牌库与手牌召唤猫汐尔到备战席；若都没有，则直接召唤她并随机佩戴一件装备。',
        rarity: 'legendary', icon: SPELL_IMAGES.mauxir_lotus_spell, effect: { type: 'passive' },
        battleEffect: { trigger: 'game_start', effectClass: 'SUMMON_FROM_DECK', params: { summonKeys: ['mauxir_lotus_drive'], fallbackEquips: 1 } },
        playerEligible: true, enemyEligible: true,
    },
    {
        id: 'enhance_open_marian', name: '鹰隼先临',
        description: '开局时，从牌库与手牌召唤茉莉安到备战席；若都没有，则直接召唤她并随机佩戴一件装备。',
        rarity: 'legendary', icon: SPELL_IMAGES.marian_spell, effect: { type: 'passive' },
        battleEffect: { trigger: 'game_start', effectClass: 'SUMMON_FROM_DECK', params: { summonKeys: ['marian'], fallbackEquips: 1 } },
        playerEligible: true, enemyEligible: true,
    },
    {
        id: 'enhance_open_pupu', name: '镜影先至',
        description: '开局时，从牌库与手牌召唤卜卜到备战席；若都没有，则直接召唤她并随机佩戴一件装备。',
        rarity: 'legendary', icon: SPELL_IMAGES.pupu_specular_soul_spell, effect: { type: 'passive' },
        battleEffect: { trigger: 'game_start', effectClass: 'SUMMON_FROM_DECK', params: { summonKeys: ['pupu_specular_soul'], fallbackEquips: 1 } },
        playerEligible: true, enemyEligible: true,
    },
    {
        id: 'enhance_open_acacia', name: '时序先行',
        description: '开局时，从牌库与手牌召唤安卡希娅到备战席；若都没有，则直接召唤她并随机佩戴一件装备。',
        rarity: 'legendary', icon: SPELL_IMAGES.acacia_chrono_echo_spell, effect: { type: 'passive' },
        battleEffect: { trigger: 'game_start', effectClass: 'SUMMON_FROM_DECK', params: { summonKeys: ['acacia_chrono_echo'], fallbackEquips: 1 } },
        playerEligible: true, enemyEligible: true,
    },

    // ── [2026-10-24 程拍板 · 「第 N 回合」类] 靠 `BattleEffectDef.round` 这一个新字段实现 ──
    //   判据在分发器统一收口（`logic/rogueTrigger.ts` 的 `runRogueTrigger`），**handler 零改动**。
    //   与 `oncePerBattle` 的分工：这里靠"只剩那一个回合"天然只发生一次，不需要额外记账。
    {
        id: 'enhance_round5_shalo', name: '梵音后至',
        description: '第五回合开始时，召唤莎罗。',
        rarity: 'rare', icon: UNIT_IMAGES.shalo, effect: { type: 'passive' },
        // SUMMON 的既有口径：造白板 Lv1 + 走「入场」门铃；同 key 已在备战席 / 备战席满则跳过。
        battleEffect: {
            trigger: 'round_start', effectClass: 'SUMMON',
            params: { summonKey: 'SacredChants_Squad_Shalo' }, round: 5,
        },
        playerEligible: true, enemyEligible: true,
    },
    {
        id: 'enhance_round5_white_hunt', name: '准星应召',
        description: '第五回合开始时，在手牌中生成一张 0 费的「白猎」。',
        rarity: 'epic', icon: UNIT_IMAGES.white_hunt, effect: { type: 'passive' },
        // GENERATE + costOverride：进**手牌**、费用改写为 0（与里芙④ 0 费单挑同一条腿）。
        // 注意白猎自带「打出时从手牌召唤一个费用低于 7 的单位」⇒ 0 费白猎相当于一次免费的大哥空投。
        battleEffect: {
            trigger: 'round_start', effectClass: 'GENERATE',
            params: { generateKey: 'The_Forger_Squad_White_Hunt', costOverride: 0 }, round: 5,
        },
        playerEligible: true, enemyEligible: true,
    },

    // ── [2026-10-24 程拍板 · 装备三档] 开局给**手牌 + 牌库**每张卡随机挂一件指定品质的装备 ──
    //   三条共用同一个 handler（`EQUIP_ALL_CARDS`），差别只有 `params.rarity`。
    //   📌 品质映射按项目六档：`common` 白 / `rare` 蓝 / `epic` 紫。
    //   📌 图标暂用 `abc_spell` 占位（与库内其余 20+ 条同款），待美术出装备主题图。
    {
        id: 'enhance_equip_all_epic', name: '秘藏武装',
        description: '开局时，我方手牌与牌库中的所有卡牌各随机获得一件紫色装备。',
        rarity: 'epic', icon: abc_spell, effect: { type: 'passive' },
        battleEffect: { trigger: 'game_start', effectClass: 'EQUIP_ALL_CARDS', params: { rarity: 'epic' } },
        playerEligible: true, enemyEligible: true,
    },
    {
        id: 'enhance_equip_all_rare', name: '精良行装',
        description: '开局时，我方手牌与牌库中的所有卡牌各随机获得一件蓝色装备。',
        rarity: 'rare', icon: abc_spell, effect: { type: 'passive' },
        battleEffect: { trigger: 'game_start', effectClass: 'EQUIP_ALL_CARDS', params: { rarity: 'rare' } },
        playerEligible: true, enemyEligible: true,
    },
    {
        id: 'enhance_equip_all_common', name: '粗制配给',
        description: '开局时，我方手牌与牌库中的所有卡牌各随机获得一件白色装备。',
        rarity: 'uncommon', icon: abc_spell, effect: { type: 'passive' },
        battleEffect: { trigger: 'game_start', effectClass: 'EQUIP_ALL_CARDS', params: { rarity: 'common' } },
        playerEligible: true, enemyEligible: true,
    },

    // ── [2026-10-24 程拍板 · 第 15 条] 1 费单位 +3/+3 ──
    //   双时机：`game_start` 管开局在场的，`on_summon` 管此后召唤的（与「决意·不退之阵」同范式）。
    //   ⚠️ 若只写 `game_start`，则开局之后打出的 1 费单位全部吃不到 —— 那正是 10-06 安卡⑥踩过的坑。
    {
        id: 'enhance_1cost_buff', name: '微躯巨力',
        description: '我方所有 1 费单位获得 +3/+3（含此后召唤的单位）。',
        rarity: 'rare', icon: abc_spell, effect: { type: 'passive' },
        battleEffects: [
            { trigger: 'game_start', effectClass: 'BUFF_COST_UNITS', params: { cost: 1, power: 3, health: 3 } },
            { trigger: 'on_summon', effectClass: 'BUFF_COST_UNITS', params: { cost: 1, power: 3, health: 3 } },
        ],
        playerEligible: true, enemyEligible: true,
    },

    // ── [2026-10-24 程拍板 · 第 1 / 2 条] 按费用选卡两条 ──
    //   两条共用同一个筛选判据（单位 + 后勤阵营 + 排除召唤物），差别只在来源：
    //   第 1 条从**牌组**取实例（带装备随卡而来），第 2 条从**完整卡池**造卡。
    {
        id: 'enhance_summon_2cost_round', name: '轮换补员',
        description: '回合开始时，随机从牌组召唤一个 2 费的非天启者单位。',
        rarity: 'rare', icon: abc_spell, effect: { type: 'passive' },
        battleEffect: { trigger: 'round_start', effectClass: 'SUMMON_BY_COST_FROM_DECK', params: { cost: 2 } },
        playerEligible: true, enemyEligible: true,
    },
    {
        id: 'enhance_death_summon_lower', name: '前赴后继',
        description: '我方单位首次阵亡时，随机召唤一个费用比它低 1 费的非天启者单位。',
        rarity: 'epic', icon: abc_spell, effect: { type: 'passive' },
        battleEffect: { trigger: 'unit_die', effectClass: 'SUMMON_LOWER_COST_ON_DEATH' },
        playerEligible: true, enemyEligible: true,
    },

    // ══════════════════════════════════════════════════════════════════
    // [2026-10-24 程拍板 · 费用修饰器三套] 这批**没有 handler**（查询/标记型）：
    //   ① 4/5「全场法术加费」：敌我双方都加，双开关都开 —— 玩家刷到等于"自己也变贵"的赌注
    //   ② 6/7「费用税」：AI 出牌 ⇒ 玩家加价；玩家出一张就清零（`round` 版另在玩家回合末清）
    //   ③ 20「连出税」：AI 每回合第 3 张起每张给玩家 +3，可叠加，回合末清
    //   生效点在 `utils/gameRules.ts` 的费用修饰器快照 + 三处站点埋点，见那边逐条注释。
    // ══════════════════════════════════════════════════════════════════
    {
        id: 'enhance_spell_cost_up_1', name: '法力淤塞',
        description: '敌我双方的法术费用 +1。',
        rarity: 'uncommon', icon: abc_spell, effect: { type: 'passive' },
        battleEffect: { trigger: 'game_start', effectClass: 'SPELL_COST_UP_ALL', params: { amount: 1 } },
        playerEligible: true, enemyEligible: true,
    },
    {
        id: 'enhance_spell_cost_up_2', name: '万法难行',
        description: '敌我双方的法术费用 +2。',
        rarity: 'rare', icon: abc_spell, effect: { type: 'passive' },
        battleEffect: { trigger: 'game_start', effectClass: 'SPELL_COST_UP_ALL', params: { amount: 2 } },
        playerEligible: true, enemyEligible: true,
    },
    {
        id: 'enhance_cost_tax_round', name: '步步加价',
        description: '敌方每打出一张卡牌，我方所有手牌费用 +1；我方打出一张卡牌后清零，回合结束时清零。',
        rarity: 'rare', icon: abc_spell, effect: { type: 'passive' },
        battleEffect: { trigger: 'game_start', effectClass: 'COST_TAX', params: { mode: 'round' } },
        playerEligible: false, enemyEligible: true,
    },
    {
        id: 'enhance_cost_tax_run', name: '积重难返',
        description: '敌方每打出一张卡牌，我方所有手牌费用 +1；我方打出一张卡牌后清零（跨回合累积）。',
        rarity: 'epic', icon: abc_spell, effect: { type: 'passive' },
        battleEffect: { trigger: 'game_start', effectClass: 'COST_TAX', params: { mode: 'run' } },
        playerEligible: false, enemyEligible: true,
    },
    {
        id: 'enhance_chain_play_tax', name: '连番施压',
        description: '敌方每回合从第三张卡牌起，每打出一张，我方所有手牌费用 +3（可叠加，回合结束时清零）。',
        rarity: 'epic', icon: abc_spell, effect: { type: 'passive' },
        battleEffect: { trigger: 'game_start', effectClass: 'CHAIN_PLAY_TAX', params: { after: 2, amount: 3 } },
        playerEligible: false, enemyEligible: true,
    },
    {
        id: 'enhance_upgraded_champions_deck', name: '王牌齐备',
        description: '开局时，将六位天启者的升级形态各一张洗入牌库。',
        rarity: 'mythic', icon: abc_spell, effect: { type: 'passive' },
        // 六位 = `ROGUE_HEROES` 的同一批；「升级形态」走 `getLeveledUpCard`（每位天启者的 Lv2 数据各不相同，
        // 不要自己写死数值 —— 那是会随版本漂移的复制品）。
        battleEffect: {
            trigger: 'game_start', effectClass: 'UPGRADED_CHAMPIONS_TO_DECK',
            params: { championKeys: ['lyfe', 'fenny', 'pupu_specular_soul', 'mauxir_lotus_drive', 'acacia_chrono_echo', 'marian'] },
        },
        playerEligible: true, enemyEligible: true,
    },
    {
        id: 'enhance_random_squad', name: '整队集结',
        description: '回合开始时，随机召唤一整支后勤小队的全部成员。',
        rarity: 'legendary', icon: abc_spell, effect: { type: 'passive' },
        // 小队名单由 `rogueTrigger` 的 `SQUAD_MEMBERS` 按 key 命名约定自动聚类（不是手抄表）
        battleEffect: { trigger: 'round_start', effectClass: 'SUMMON_RANDOM_SQUAD' },
        playerEligible: true, enemyEligible: true,
    },
    {
        id: 'enhance_massacre', name: '唯强独存',
        description: '回合结束时，消灭敌我双方除各自最强单位以外的所有单位。',
        rarity: 'mythic', icon: abc_spell, effect: { type: 'passive' },
        // 查询/标记型：执行在 `useRoundLifecycle` 的回合末序列（逐个杀 + 走死亡链 + 20 步递归护栏）。
        // ⚠️ 双开关都开 ⇒ 玩家持有时**自己也会被清到只剩最强那个**，是双刃剑不是纯收益。
        battleEffect: { trigger: 'game_start', effectClass: 'MASSACRE_EXCEPT_STRONGEST' },
        playerEligible: true, enemyEligible: true,
    },
    {
        id: 'enhance_nexus_damage_cap', name: '顽石之躯',
        description: '我方水晶每回合受到 3 次伤害后，本回合此后受到的伤害降至 1 点。',
        rarity: 'mythic', icon: abc_spell, effect: { type: 'passive' },
        // 查询/标记型：执行在 `useGameState` 的两处水晶扣血（战斗主路径）；次数快照每回合重置。
        battleEffect: { trigger: 'game_start', effectClass: 'NEXUS_DAMAGE_CAP' },
        playerEligible: true, enemyEligible: true,
    },

    {
        id: 'enhance_seize_moment', name: '机不可失', description: '我方召唤单位时，本回合给予其 +1/+1。',
        rarity: 'rare', icon: SPELL_IMAGES.full_purification, effect: { type: 'passive' },
        battleEffect: { trigger: 'on_summon', effectClass: 'BUFF', params: { power: 1, health: 1, duration: 'ROUND' } },
        playerEligible: true, enemyEligible: true,
    },
    {
        id: 'enhance_fighting_spirit', name: '战意盎然', description: '回合开始时，进行备战。',
        rarity: 'epic', icon: SPELL_IMAGES.focus, effect: { type: 'passive' },
        battleEffect: { trigger: 'round_start', effectClass: 'RALLY' },
        playerEligible: true, enemyEligible: true,
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
        playerEligible: true, enemyEligible: true,
    },
    {
        id: 'enhance_after_attack_buff', name: '以战养战', description: '我方单位打击后，获得 +1/+1。',
        rarity: 'rare', icon: SPELL_IMAGES.temp_spell_05, effect: { type: 'passive' },
        battleEffect: { trigger: 'after_attack', effectClass: 'BUFF_SELF', params: { power: 1, health: 1 } },
        // [2026-09-28 程拍板 · 神格神经] 「打击后 +1/+1」这个效果**只属于神格神经**（里芙节点①）：
        //   本条从玩家强化池**摘出**（playerEligible: false），不再有任何局内获取途径。
        //   ⇒ 通行证 29 级奖励已改发「凯旋之匣」（见 analystProgression）。
        // 🔴 [2026-10-06 莉莉子 · 审计纠错] 原注释写"节点①的载体**可直接复用本效果**" —— **与代码不符**：
        //   里芙① 实际发的是**它自己的** `divfx_lyfe_1`（见 heroDivinity.ts），**从不引用本 id**
        //   ⇒ 本条是**孤儿数据**（全项目仅此处定义、无任何发放来源）。
        //   保留只为"历史 id 不动"；若确认永不复用，可删除（删前 grep 确认无引用）。
        playerEligible: false, enemyEligible: false,
    },
    {
        id: 'enhance_after_attacked_buff', name: '以守为攻', description: '我方单位被打击后，获得 +1/+1。',
        rarity: 'uncommon', icon: SPELL_IMAGES.temp_spell_15, effect: { type: 'passive' }, // [2026-08-27] 原 common→uncommon
        battleEffect: { trigger: 'after_attacked', effectClass: 'BUFF_SELF', params: { power: 1, health: 1 } },
        playerEligible: true, enemyEligible: true,
    },
    {
        id: 'enhance_cast_spell_buff', name: '法术共鸣', description: '每打出一个法术，随机赋予一个我方单位 +1/+1。',
        rarity: 'rare', icon: abc_spell, effect: { type: 'passive' },
        battleEffect: { trigger: 'on_cast_spell', effectClass: 'RANDOM_ALLY_BUFF', params: { power: 1, health: 1 } },
        playerEligible: true, enemyEligible: true,
    },
    {
        id: 'enhance_play_unit_buff', name: '军势鼓舞', description: '每打出一个单位，随机赋予一个我方单位 +1/+1。',
        rarity: 'uncommon', icon: SPELL_IMAGES.fenny_support, effect: { type: 'passive' }, // [2026-08-27] 原 common→uncommon
        battleEffect: { trigger: 'on_play_unit', effectClass: 'RANDOM_ALLY_BUFF', params: { power: 1, health: 1 } },
        playerEligible: true, enemyEligible: true,
    },
    {
        id: 'enhance_first_play_boost', name: '先锋之锐', description: '每回合首个打出的单位获得 +2/+0。',
        rarity: 'rare', icon: SPELL_IMAGES.temp_spell_14, effect: { type: 'passive' },
        battleEffect: { trigger: 'on_first_play_unit', effectClass: 'BUFF_SELF', params: { power: 2, health: 0 } },
        playerEligible: true, enemyEligible: true,
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
        id: 'enhance_nexus_ally_buff', name: '水晶共鸣', description: '敌方水晶每受到 1 次伤害，随机赋予一个我方单位 +2/+2。',
        rarity: 'epic', icon: abc_spell, effect: { type: 'passive' }, // [2026-09-05] 原 rare（与牌库灌注品质互换）
        // [2026-10-23 程拍板 · 4.2 加强] +1/+1 → +2/+2：一局水晶约只挨 4~6 次打，+1/+1 整局只给 4~6 点，
        //   撑不起紫档；单次翻倍后整局 8~12 点，才对得起 7 点锚点。
        battleEffect: { trigger: 'on_nexus_strike', effectClass: 'RANDOM_ALLY_BUFF', params: { power: 2, health: 2 } },
        playerEligible: true, enemyEligible: true,
    },

    // ── [2026-09-25 莉莉子 任务化强化批 v3 · 试点] 《设计-肉鸽三线任务化框架》7.3 ──
    //   任务版：quest 是【解锁门】—— 达成阈值后 battleEffect 才开始逐回合生效。
    //   与现有强化【并列存在】（不替换、不改造）；⚠️ v1 只对玩家侧开放（敌方尚无任务进度推进管线）
    {
        id: 'enhance_iron_oath', name: '铁誓', description: '我方水晶累计受到 5 次伤害后：此后每回合开始，我方所有单位获得 +1/+1。',
        rarity: 'uncommon', icon: abc_spell, effect: { type: 'passive' },
        // [2026-10-23 程拍板 · 平衡] 门槛 3 次 → 5 次：绿档价格拿到金档「钢铁洪流」同款效果，靠推迟解锁来压强度
        quest: { event: 'nexus_damaged', threshold: 5, scope: 'battle' },
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
        id: 'enhance_scavenge', name: '拾荒', description: '战斗胜利后，若我方水晶不低于 10 点，获得 20 金币。',
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
        id: 'enhance_last_stand', name: '孤军', description: '我方单位阵亡后，若我方场上只剩一个单位，该单位获得 +5/+5 与【坚韧】【再生】（每场一次）。',
        rarity: 'legendary', icon: abc_spell, effect: { type: 'passive' },
        // [2026-10-23 程拍板 · 平衡] +4/+4+屏障 → +5/+5+坚韧+再生：原先理论上限只有 10 分、低于金档锚点 11 分（数学上不可能合档）；改后 10+3+3=16 分
        // [2026-10-23 程拍板 · 时机改造] round_start → unit_die：
        //   原时机下"场上恰好只有 1 个单位"实际退化成"本局打出的第一个单位"（回合 1 空场判不了，
        //   回合 2 开始时场上正好是它）⇒ 名字叫孤军、干的却是起步件的活。
        //   改到阵亡触发后，语义变成"战友倒下、最后一个站着的变强"，与「孤军」对上。
        //   ⚠️ 条件仍是"恰好 1 个"，但**判定只数存活单位**（尸体 animState:'dying' 不算，见 rogueTrigger 判定层）。
        battleEffect: {
            trigger: 'unit_die', effectClass: 'LONE_GUARD_BUFF', params: { power: 5, health: 5, keywords: ['Tough', 'Regeneration'] },
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
        id: 'enhance_hoard', name: '囤积', description: '回合开始时，若手牌中没有「囤积」，生成一张「囤积」—— 它在手牌里时，你每打出一张卡牌就为它攒下 1 点法力；打出它即可取回攒下的全部法力（不超过法力上限）。',
        rarity: 'epic', icon: abc_spell, effect: { type: 'passive' },
        // [2026-10-23 程拍板 · 4.2 重做] 从「+3 法术法力池上限」改成「生成一张存钱罐法术」。
        //   ── 旧版是纯资源规则（`hoardSpellMana: 3`），玩家几乎无感；新版有"攒 → 兑现"的完整玩法。
        //   ── 攒点数记在**卡自己**身上（`CardData.hoardStored`），用掉即归零；
        //      下回合强化重新发一张**空的**（`skipIfInHand`：手牌里已有就不再发，避免同时躺着两张半满的）。
        //   ⚠️ 储量**不设上限**：它天然被"这张卡什么时候被打出"限制住（程的口径）。
        battleEffect: { trigger: 'round_start', effectClass: 'GENERATE', params: { generateKey: 'spell_hoard', skipIfInHand: true } },
        playerEligible: true, enemyEligible: false,
    },

    // ── [2026-10-23 程拍板 · 地基统一] 敌方专属强化：**只保留"玩家侧没有同效果"的那几条** ──
    //   背景：此前有一批敌方专属件与玩家件 **trigger/effectClass/params 逐字相同**，
    //   但档位不同（例：敌方白「战意高涨」vs 玩家蓝「回合加护」；敌方紫「精锐动员」vs 玩家绿「幽灵行动」）。
    //   ⇒ 同一效果两套价格 = 两把尺子，平衡永远对不齐。
    //   [2026-10-23] 已删除 9 条克隆件（enemy_mobilize / round_rally / round_buff / on_summon /
    //   play_buff / first_boost / cast_buff / after_attacked / nexus_buff），
    //   并把对应玩家件改成 `enemyEligible: true`（敌我共用同一份、同一档）。
    //   ⚠️ 今后新增强化：**同效果只许有一个条目**，用两个开关控制谁能拿到；
    //      严禁再给同一效果另起一个"敌方版"改档位。
    //   下面这条「狂怒印记」暂时保留：它的玩家对应件 `enhance_after_attack_buff`（以战养战）
    //   已被摘出所有随机池（双开关 false，10-06 审计认定的孤儿数据），故此刻**没有可共用的玩家件**。
    {
        id: 'enemy_after_attack', name: '狂怒印记', description: '敌方单位打击后，获得 +1/+1。',
        rarity: 'rare', icon: abc_spell, effect: { type: 'passive' },
        battleEffect: { trigger: 'after_attack', effectClass: 'BUFF_SELF', params: { power: 1, health: 1 } },
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
        // [2026-10-06 程拍板] 玩家反馈"太强、不好打" ⇒ 稀有 → **史诗**（原稀有档由新条目「霜锋乘势」顶替）
        rarity: 'epic', icon: SPELL_IMAGES.temp_spell_18, effect: { type: 'passive' },
        battleEffect: { trigger: 'round_start', effectClass: 'FREEZE_STRONGEST', priority: 10 }, // [2026-09-09] 冻结先于衰弱：冻结后最强归0 → 衰弱实时重判到次强
        playerEligible: true, enemyEligible: true,
    },
    {
        id: 'duel_strongest', name: '王见王', description: '回合结束时，敌我双方攻击力最高的单位相互打击。',
        // [2026-10-23 程拍板 · 4.2 调整] epic → rare（紫 → 蓝）：
        //   这条是严格对称的互殴（双方最强各挨一发），本质是"花点数买一场赌局"，
        //   顺风才有收益、逆风反成敌人的帮凶 ⇒ 撑不起紫档，降到蓝档与它的实际强度对齐。
        rarity: 'rare', icon: SPELL_IMAGES.single_combat, effect: { type: 'passive' },
        battleEffect: { trigger: 'round_end', effectClass: 'DUEL_STRONGEST' },
        playerEligible: true, enemyEligible: true,
    },
    {
        id: 'shrink_strongest', name: '衰弱诅咒', description: '回合开始时，将对方最强的单位设置为 1/1。',
        // [2026-10-06 程拍板] 玩家反馈"太强、不好打" ⇒ 史诗 → **传说**（原史诗档由新条目「衰弱蔓延」顶替）
        rarity: 'legendary', icon: SPELL_IMAGES.mauxir_zhishui_ningxing, effect: { type: 'passive' },
        battleEffect: { trigger: 'round_start', effectClass: 'SET_STRONGEST_STATS', priority: 20 }, // [2026-09-09] 排在冻结后：对实时战场重判"当前最强"
        playerEligible: true, enemyEligible: true,
    },
    // ── [2026-10-06 程拍板] 两条"降档替身"新强化（原条目提升品质后，用它们顶住**原品质档位**）──
    {
        id: 'frost_momentum', name: '霜锋乘势', description: '每次获得进攻标识时，冻结对方攻击力最高的单位。',
        rarity: 'rare', icon: SPELL_IMAGES.temp_spell_18, effect: { type: 'passive' },
        // 与「霜寒压制」同效果类，差别只在**时机**：回合开始 → **每次获得进攻标识时**
        //   （分发唯一入口 = `processOnGetAttackToken`；去重靠 `tokenGrantSeq/tokenGrantHandled`）
        battleEffect: { trigger: 'on_get_attack_token', effectClass: 'FREEZE_STRONGEST' },
        playerEligible: true, enemyEligible: true,
    },
    {
        id: 'shrink_spread', name: '衰弱蔓延', description: '回合开始时，将对方随机一个单位设置为 1/1。',
        rarity: 'epic', icon: SPELL_IMAGES.mauxir_zhishui_ningxing, effect: { type: 'passive' },
        // 与「衰弱诅咒」同"设为 1/1"语义，差别只在**目标**：最强 → **随机一个**
        //   priority 30：排在冻结(10)/衰弱(20)**之后** —— 沿用既有顺序（先处理"最强"那一脉，随机这脉收尾）
        battleEffect: { trigger: 'round_start', effectClass: 'SET_RANDOM_STATS', priority: 30 },
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
        id: 'regen_nexus', name: '愈战愈勇', description: '回合开始时，我方水晶回复 2 点生命值。',
        rarity: 'rare', icon: SPELL_IMAGES.vitality_supplement, effect: { type: 'passive' },
        // [2026-10-23 程拍板 · 平衡] 回复量 5 → 2：蓝档每回合回 5 让水晶等同于"打不穿"，回血太厚
        //   ⚠️ 本条 playerEligible / enemyEligible 均为 true（敌我共用）⇒ 只改这一处数据，两侧同时生效
        battleEffect: { trigger: 'round_start', effectClass: 'NEXUS_HEAL', params: { value: 2 } },
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
        id: 'undying_legion', name: '亡灵军团', description: '我方单位阵亡时，将其中首个复活（同一批阵亡只救得起一个）。',
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
        id: 'undying_host', name: '不死军团', description: '我方单位阵亡时立即复活，并获得【幻象】（回合结束时会消散）。',
        rarity: 'mythic', icon: SPELL_IMAGES.ghostly_shadows, effect: { type: 'passive' },
        battleEffect: { trigger: 'unit_die', effectClass: 'RESURRECT', params: { all: true } },
        playerEligible: true, enemyEligible: true,
    },
    {
        id: 'arcane_overload', name: '法术狂潮', description: '我方法术与技能造成的伤害翻倍（对单位卡的战斗伤害无效——它吃的是法术体系，不吃单位流）。',
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
        id: 'armfx_devour_box', name: '噬牌之匣', description: '每回合开始：弃掉手牌中费用最低的一张（天启者除外），天启者 +1/+1。',
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
        description: '回合开始时，在手牌中生成一张 0 费、瞬逝的「灵轨月轮·扩散」。我方所有单位获得【侦察】（含此后召唤的单位）。',
        rarity: 'legendary', icon: SPELL_IMAGES.acacia_chrono_echo_spell, effect: { type: 'passive' },
        // [2026-10-06 程口径 · 文案断句] 关键词那一句**不带时机** —— 语义是「我方全员**持续**生效（含此后召唤的）」，
        //   **不是**"回合开始那一刻扫一次"；与「钢铁洪流 / 战争领主 / 铁誓」那种
        //   「回合开始时，我方所有单位获得 +N/+M」（**一次性时点**数值）**不是同一类**，勿混。
        //   ⇒ 断成两句：第一句管生成（保留「回合开始时，在手牌中生成…」模板），第二句管关键词（独立陈述）。
        // 一条强化三个效果：生成 0 费灵轨月轮·扩散 + 全员侦察（在场 + 此后召唤）
        // [2026-10-06 程拍板] 生成物「安卡希雅的剑舞」→「灵轨月轮·扩散」（仍 0 费）；关键词【先攻】→【侦察】
        // [2026-10-06 程实测 BUG修复] 原先只有 `round_start` 一条 ⇒ **只有那一刻在备战席的单位**拿得到，
        //   此后打出的单位 / 飞剑召唤**全部漏掉**。补 `on_summon`（与「决意·不退之阵」「不死之身」同范式）：
        //   · 打出单位 → `useGameState` 打出路径分发 `on_summon`（`info.playedCard` = 该单位）
        //   · 飞剑等衍生召唤 → `effectProcessor` 飞剑落位处**补跑** `on_summon`（每把剑各触发一次）
        battleEffects: [
            { trigger: 'round_start', effectClass: 'GENERATE', params: { generateKey: 'acacia_sword_rain', costOverride: 0 } },
            { trigger: 'round_start', effectClass: 'ALL_UNITS_GRANT_KEYWORD', params: { keyword: 'Scout' } },
            { trigger: 'on_summon', effectClass: 'ALL_UNITS_GRANT_KEYWORD', params: { keyword: 'Scout' } },
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
        description: '我方每回合首次打击敌方水晶后：回合结束时，我方备战席上攻击力最高的单位再次打击敌方水晶。',
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
        description: '我方所有法术费用 -1；「臆莲基座」的攻击力不再有上限限制；回合开始时获得一张「顷刻莲潮」（若手牌中已有，则改为使那张的费用 -1）。',
        rarity: 'legendary', icon: SPELL_IMAGES.mauxir_lotus_spell, effect: { type: 'passive' },
        // 一条强化四个效果：开局法术减费 + 开局/此后召唤都解除基座攻击上限 + 每回合投递大招
        battleEffects: [
            { trigger: 'game_start', effectClass: 'SPELL_COST_DOWN_ALL', params: { amount: 1 } },
            { trigger: 'game_start', effectClass: 'REMOVE_MAX_POWER', params: { cardKey: 'mauxir_lotus_pedestal' } },
            { trigger: 'on_summon', effectClass: 'REMOVE_MAX_POWER', params: { cardKey: 'mauxir_lotus_pedestal' } },
            // [2026-10-10 程的口径] 加强：**每回合**给一张「顷刻莲潮」；手牌里已有 ⇒ 不重复生成，
            //   改为把那张费用 -1。
            //   ── 语义对齐 `effectProcessor.ts:3815-3827`（2026-07-17 为鸦眼小队写的**同款语义**）：
            //      取手牌中**第一张**同名卡，`cost = max(0, cost - 1)` 且 `customProgress |= 2`（绿色费用标记）。
            //   ⚠️ [2026-10-12 莉莉子 BUG修复] 本行注释原先写的是"复用 `effectProcessor` 里 GENERATE 的既有分支"
            //      —— **复用错了对象**：迷宫强化**不走** `effectProcessor`，走 `rogueTrigger.ts` 的
            //      `ROGUE_EFFECT_HANDLERS.GENERATE`；而那一份当时**根本没读** `reduceCostIfDuplicate`
            //      ⇒ 本参数被静默忽略 ⇒ 回合开始**无条件多发一张**（程实测："似乎会无限给顷刻莲潮"）。
            //      现已在 `rogueTrigger.ts` 侧补齐同语义分支。
            //      **今后动这个参数，两处实现都要看**（同语义两套实现的坑，参见 `审计-强化生效-总报告` 病理表）。
            { trigger: 'round_start', effectClass: 'GENERATE', params: { generateKey: 'mauxir_lotus_ultimate', count: 1, reduceCostIfDuplicate: true } },
        ],
        playerEligible: false, enemyEligible: false,
    },
    // ── [2026-09-28 莉莉子 神格神经 · 茉莉安（信标猎场）] 节点载体（程的设计）──
    {
        id: 'divfx_marian_1', name: '猎影援护', description: '我方拉取暴露单位时，永久给予发起拉取的我方单位 +2/+0。',
        rarity: 'common', icon: SPELL_IMAGES.marian_rush, effect: { type: 'passive' },
        battleEffect: { trigger: 'on_pull_exposed', effectClass: 'BUFF', params: { power: 2, health: 0, permanent: true } },
        playerEligible: false, enemyEligible: false,
    },
    {
        id: 'divfx_marian_3', name: '猎影疾袭', description: '我方拉取暴露单位时，永久给予发起拉取的我方单位 +3/+0 与【快速攻击】。（升级「猎影援护」）',
        rarity: 'uncommon', icon: SPELL_IMAGES.marian_rush, effect: { type: 'passive' },
        battleEffect: { trigger: 'on_pull_exposed', effectClass: 'BUFF', params: { power: 3, health: 0, keywords: ['QuickAttack'], permanent: true } },
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

// ==========================================
// [2026-10-23 莉莉子 · 地基统一收尾] **敌方白档池已归零**（9 条克隆件删除后，敌方可用池里一条 common 都没有）
//   ⇒ 三张表里浅层的 `common` 权重全部清零，原权重**原样挪给 `uncommon`**
//     （各档**总权重不变** ⇒ 概率形状仍然是"浅层偏弱档、深层偏强档"）。
//   为什么挪而不是删：删掉会让该档总权重变小、其余品质被无形抬高；
//   挪给绿档则保住"这一档就是给弱档"的设计意图 —— 白档那几个效果现在以**绿档身份**存在
//   （同一条目敌我共用：战意高涨→回合加护、蜂拥而至→机不可失…）。
//   ⚠️ 今后若重新往敌方池里加白档强化，记得把浅层的 `common` 权重补回去，否则永远抽不到。
// ==========================================
export const ENEMY_WEIGHT_BY_DIFFICULTY: Record<RogueDifficulty, EnemyBuffWeightTier[]> = {
    normal: [
        { maxFrac: 0.2, weights: { common: 0, uncommon: 10, rare: 1, epic: 0, legendary: 0, mythic: 0 } },
        { maxFrac: 0.45, weights: { common: 0, uncommon: 8, rare: 3, epic: 1, legendary: 0, mythic: 0 } },
        { maxFrac: 0.7, weights: { common: 0, uncommon: 3, rare: 5, epic: 3, legendary: 0, mythic: 0 } },
        { maxFrac: 1.01, weights: { common: 0, uncommon: 1, rare: 5, epic: 5, legendary: 1, mythic: 0 } },
    ],
    secret: [
        { maxFrac: 0.2, weights: { common: 0, uncommon: 8, rare: 3, epic: 1, legendary: 0, mythic: 0 } },
        { maxFrac: 0.45, weights: { common: 0, uncommon: 5, rare: 6, epic: 3, legendary: 0, mythic: 0 } },
        { maxFrac: 0.7, weights: { common: 0, uncommon: 1, rare: 4, epic: 6, legendary: 1, mythic: 0 } },
        { maxFrac: 1.01, weights: { common: 0, uncommon: 0, rare: 2, epic: 5, legendary: 3, mythic: 1 } },
    ],
    topsecret: [
        { maxFrac: 0.2, weights: { common: 0, uncommon: 7, rare: 4, epic: 2, legendary: 0, mythic: 0 } },
        { maxFrac: 0.45, weights: { common: 0, uncommon: 3, rare: 6, epic: 5, legendary: 0, mythic: 0 } },
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

// ==========================================
// [2026-10-24 · 程拍板「迷宫强化黑名单」] 敌人强化组合的互斥表
//   程的原话：「我们现在有很多敌人的强化组合都不合理，专门出一个黑名单机制：
//              给敌人安排强化时，**随机抽取入栈后按品质和黑名单筛选**」。
//   口径（程已确认）：**成对互斥**（不做"三选一"那种组级约束）· 代码常量表 · 数量不足时**宁少不强凑**。
//
//   ⚠️ 这里只作用于 `rollEnemyBuffs`（敌人携带）。
//      · 玩家侧是 3 选 1，玩家看得见后果，不拦；
//      · `devEnemyEnhancements`（开发者注入）**刻意绕过**本表 —— 要测的就是组合，不能被黑名单挡住。
//   ⚠️ 加条目时**必须写 reason**：它是审计依据（为什么这条不能共存），也是后来人判断
//      "这条还成不成立"的唯一线索。没有理由的黑名单，迟早会被当成迷信删掉。
// ==========================================
export interface EnemyBuffConflict {
    /** 为什么不能共存（会同时上，玩家会遭遇什么） */
    reason: string;
    /** 互斥的两条（**对称**：写一次即可，a 遇 b / b 遇 a 都算冲突） */
    a: string;
    b: string;
}

export const ENEMY_BUFF_CONFLICTS: EnemyBuffConflict[] = [
    {
        reason: '水晶限伤 + 水晶免疫 ⇒ 玩家的两种破防手段同时被堵死，只剩"等它每回合自扣"一条路，而限伤还可能连自扣一起削',
        a: 'enhance_nexus_damage_cap', b: 'immortal_body',
    },
    {
        reason: '回合末处决 + 全员复活 ⇒ 杀了复活、复活了再杀，回合末反复空转（有 20 步护栏，但会明显拖长）',
        a: 'enhance_massacre', b: 'undying_host',
    },
    {
        reason: '同上（亡灵军团每批救一个，仍会与处决来回拉扯）',
        a: 'enhance_massacre', b: 'undying_legion',
    },
    {
        reason: '回合末处决 + 回合开始整队召唤 ⇒ 每回合白送一整队单位再全部处决，等于免费刷一串亡语',
        a: 'enhance_massacre', b: 'enhance_random_squad',
    },
    {
        reason: '两条是同一种 COST_TAX 的两种 mode，`getCostTaxMode` 只认第一个 ⇒ 后一条**完全白带**（不是太强，是浪费一个携带位）',
        a: 'enhance_cost_tax_round', b: 'enhance_cost_tax_run',
    },

    // ── [2026-10-24 第二批 · 程拍板「只 BAN 真·没法玩的组合」] ──
    //   判定标准（程的口径）：**某一条通关路径被完全封死**，而不只是"很强/很恶心"。
    //   第二梯队（战争领主+钢铁洪流 / 冰封+衰弱 / 双复活）刻意**不入表**——那些是"很难"不是"没法玩"。
    {
        reason: '水晶免疫（玩家打脸这条路彻底关闭）+ 我方全场每回合 +2/+2 且备战 ⇒ 玩家只能等它自扣 5，但场面撑不到那时候',
        a: 'immortal_body', b: 'war_lord',
    },
    {
        reason: '全员【幻象】+【吸血】之上再叠"阵亡立即复活并获幻象" ⇒ **清场这件事不存在**：杀一个立刻回来一个，回合末才消散，等于每回合多挨一轮',
        a: 'immortal_body', b: 'undying_host',
    },
    {
        reason: '两个**独立**税池真叠加：AI 出 3 张 ⇒ 玩家手牌 +3（跨回合累积、打牌不清零）+3（连出）= +6，且越滚越高 ⇒ 多数手牌直接变死牌',
        a: 'enhance_cost_tax_run', b: 'enhance_chain_play_tax',
    },
    {
        reason: '手牌全体加费之上，法术再单独 +2 ⇒ 出牌与施法**两条路同时被堵**',
        a: 'enhance_cost_tax_run', b: 'enhance_spell_cost_up_2',
    },
];

/** 候选强化与"已选列表"是否冲突；冲突则返回理由（供日志/调试），否则 undefined。 */
export const findEnemyBuffConflict = (candidateId: string, chosenIds: string[]): string | undefined => {
    for (const c of ENEMY_BUFF_CONFLICTS) {
        if (c.a === candidateId && chosenIds.includes(c.b)) return c.reason;
        if (c.b === candidateId && chosenIds.includes(c.a)) return c.reason;
    }
    return undefined;
};

/**
 * 按深度从可携带强化库中随机抽出实际携带的迷宫强化 id 列表。
 * @param rogueBuffs 流派手配强化 id 库（archetype.rogueBuffs，编辑器配置）；空/undefined = 默认全 enemyEligible 库
 * @param depthFrac  战斗进度深度 0~1（由 mapLayout.computeCombatDepth 提供：第一战 0、最深战斗节点/Boss 1）
 * @param difficulty 本局难度（普通/机密/绝密）→ 决定品质权重表；默认 normal（最温和）
 *
 * [2026-10-24 · 程拍板] 改为**三段式**：随机抽取**入栈** → 按黑名单**筛选** → 出栈。
 *   此前是"边抽边定"，抽到什么就是什么，没有中间栈 ⇒ 没有地方做组合约束。
 *   ⚠️ 候选栈一次性抽 `count × 3` 个，给黑名单留出被剔除的余量；
 *   ⚠️ 扫完整栈仍不足 `count` 时**允许少于 count**（宁少不强凑）：
 *      敌人少带一条只是变简单，而带出冲突组合是让玩家绝望。
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
    if (n <= 0) return [];

    // 品质加权抽一个（从给定数组里取，不改动它）
    const weightOf = (b: MazeBuff) => weights[b.rarity] ?? 0;
    const drawOne = (from: MazeBuff[]): MazeBuff | undefined => {
        if (!from.length) return undefined;
        const wsum = from.reduce((s, b) => s + weightOf(b), 0);
        let idx = 0;
        if (wsum <= 0) {
            // 兜底：该深度档所有候选权重为 0（如全是权重 0 的品质）→ 均等抽，防卡死
            idx = Math.floor(Math.random() * from.length);
        } else {
            let roll = Math.random() * wsum;
            for (let i = 0; i < from.length; i++) {
                roll -= weightOf(from[i]);
                if (roll < 0) { idx = i; break; }
            }
        }
        return from[idx];
    };

    // ① 入栈：抽 count × 3 个候选（去重），留出黑名单剔除的余量
    const stack: MazeBuff[] = [];
    const rest = [...pool];
    const stackSize = Math.min(rest.length, n * 3);
    while (stack.length < stackSize) {
        const picked = drawOne(rest);
        if (!picked) break;
        rest.splice(rest.indexOf(picked), 1);
        stack.push(picked);
    }

    // ② 出栈：按栈序逐个取，跳过与已选冲突的
    const result: MazeBuff[] = [];
    for (const cand of stack) {
        if (result.length >= n) break;
        if (findEnemyBuffConflict(cand.id, result.map(b => b.id))) continue;
        result.push(cand);
    }

    // ③ 数量不足就到此为止（宁少不强凑）
    return result.map(b => b.id);
};
