export type Region = 'Lyfe' | 'Fenny' | 'Pupu' | 'Logistics' | 'Mauxir' | 'Acacia' | 'Marian' | 'Titan' | 'Analyst' | 'TEST';
export type CardType = 'unit' | 'spell-burst' | 'spell-fast' | 'spell-slow';
export type Race = 'summoner' | 'summon' | 'titan'; // [新增] 种族：召唤师/召唤物/泰坦

// [2026-08-02 新增] 卡池枚举 —— 卡牌归属哪个卡池（数据驱动，备战详情跳转抽卡界面用）
// 值刻意与 gachaLogic.PoolId 的字符串对齐，保证 `POOLS[card.gachaPool]` 直接可用
export const GachaPoolEnum = {
    Permanent: 'permanent', // 常守之誓
    Lotus: 'lotus',         // 烬中镜火
    Zenith: 'zenith',       // [2026-09-16 1.0.16] 自往昔归还 —— 收纳「安卡希雅 + 茉莉安」（2026-09-17 由暂定名「苍穹回响」定名）
} as const;
export type GachaPoolId = (typeof GachaPoolEnum)[keyof typeof GachaPoolEnum];
// 完整的 36 个关键词定义
export type Keyword =
    | 'Overwhelm' | 'QuickAttack' | 'Regeneration' | 'Elusive' | 'Challenger' | 'CantBlock'
    | 'Barrier' | 'Lifesteal' | 'Last Breath' | 'Fearsome' | 'Frostbite' | 'Tough'
    | 'Scout' | 'Ephemeral' | 'Stun' | 'Double Attack' | 'Support' | 'Deadly'
    | 'SpellShield' | 'Silence' | 'Berserk' | 'Cleave' | 'Thorns' | 'Vanguard'
    | 'Ambush' | 'Plunder' | 'Exposed' | 'Shroud' | 'Immobile' | 'Reborn'
    | 'Execute' | 'Sniper' | 'Volatile' | 'Echo' | 'Impact' | 'Channel' | 'Titan' | 'Ability' | 'CantAttack' | 'Aura';

export interface CardData {
  id: string;
  key: string;
  name: string;
  cost: number;
  power: number;
  maxPower?: number; // [新增] 攻击力上限（如有则 clamp 到该值，底座专用）
  health: number;
  maxHealth: number;
  isChampion: boolean;
  level: number;
  region: Region;
  race?: Race[]; // [新增] 种族标签（数组支持双种族，如贡露=['titan','summoner']）
  description: string;
  keywords: Keyword[];
  effects?: string[];
  equipment?: string[]; // [2026-08-12 装备系统] 挂载的装备 id 列表（attachEquipment 写入；视觉方块 + 打出效果用）
  // [2026-09-25 莉莉子 三线任务化框架 · Pact 常驻代价] 无法被治疗（终焉契约）：治疗结算处直接跳过该单位
  cantBeHealed?: boolean;
  imageUrl: string;
  level2ImageUrl?: string;
  type: CardType;
  isCollectible?: boolean; // [新增] 构筑白名单标识。若为 false 则普通玩家无法将其加入卡组（不填默认为 true）
  gachaPool?: GachaPoolId; // [2026-08-02 新增] 可抽取卡牌所属卡池枚举。备战详情页跳转抽卡界面时定位到对应卡池

  // 英雄机制字段
  associatedSpellKey?: string; // 英雄对应的技能卡Key
  associatedChampionKey?: string; // 技能卡对应的英雄Key
  isLevel2Choice?: boolean; // 是否需要升级后二选一
  choices?: string[]; // [新增] 命运抉择衍生卡的 Key 列表（数据驱动机制的核心引信）
  levelUpCondition?: string; // [新增] 英雄升级条件纯文本描述
  levelUpTarget?: number;    // [新增] 英雄升级进度的目标上限值

  // 运行时状态
  isDead?: boolean;         // [SBA] 逻辑死亡标记。true=已死，索敌/碰撞无视
  // [2026-10-05 莉莉子 BUG修复 · 20261005-12] **「这次死亡的 unit_die 强化已派发」账本字段**。
  //   为什么写在卡上而不是外部 WeakSet：程序里 `{ ...card }` 复制点有 8 处，按对象身份记会随复制丢失
  //   ⇒ 同一次死亡被重复派发；字段则**随 spread 自动复制**（详见 `utils/deathLedger.ts` 头注释）。
  //   ⚠️ 复活（写 `isDead: false` 的 3 处）必须调 `clearUnitDieDispatched` 擦掉它，否则复活体的第二次死亡不发。
  unitDieDispatched?: boolean;
  deathType?: DeathType;    // [2026-07-20] 死亡类型：KILLED(阵亡) / ELIMINATED(消亡替换)
  strikeCount: number;
  strikeStamp?: number; // [2026-08-19 莉莉子] 撞击计数戳：连击第二撞时递增，触发动画容器重挂载重播撞击动画
  roundStrikes?: number; // [新增] 本回合打击次数记账本，用于法术动态增伤判定
  customProgress?: number; // [新增] 私人记账本：专门用于记录卡牌在场上“目睹”等局部任务的进度
  // [2026-09-16 1.0.16 茉莉安] 专属记账本：我方召唤的「獠牙信标」被破坏的次数（= 升级进度）
  // ⚠️ 刻意【不复用 customProgress】—— 那是被多个系统共用的位域（bit2 = 绿色降费标记），
  //    而茉莉安的升级目标恰好是 2，与 bit2 同值 → 复用会把「降费」误判成「升级达成」。
  //    （猫汐尔目标 30、卜卜目标 3，都天然躲开了这个坑；茉莉安躲不开，所以另开字段）
  beaconDeaths?: number;
  // [2026-10-06 莉莉子 BUG修复 · BUG-20261006-01] 猫汐尔专属：召唤体系伤害升级进度的**显示镜像**。
  //   真源 = 模块级账本 `utils/mauxirProgress.ts`（为什么真源不住在卡上/`game` 里，见该文件头注释）；
  //   本字段由 `applyMauxirProgress` **幂等贴值**（同值重复贴不会产生新对象）。
  //   ⚠️ 刻意**不复用 `customProgress`** —— 那是被多个系统共用的**位域**
  //      （bit0 鬼怪/银臂、**bit1 = 绿色减费标记**），而猫汐尔的进度是 0~30 的**计数器**：
  //      bit1 根本不是空闲位 —— `equipment.ts:900` 的 `| 2` 会把进度虚增 2（0→2、4→6…），
  //      任何 `& ~2` 又会把它无意扣掉 2。（茉莉安当初另开 `beaconDeaths` 是同一个理由。）
  mauxirDamage?: number;
  // [2026-10-06 莉莉子 BUG修复 · 莲台无垠] **本场已应用过的「全法术减费」量**。
  //   为什么要这个标记：减费现在有**两条路** ——
  //     ① 开局对已在手/库的法术**改数据**（卡面能显示绿色减费，玩家看得见）
  //     ② `getEffectiveSpellCost` 的**查询时判定**（覆盖战斗中**新生成**的法术）
  //   两条路共用本标记 ⇒ 查询时只补"还没减过的差额"（`N - spellCostDown`），**天然幂等、不会双减**。
  spellCostDown?: number;
  // [2026-10-06 程拍板 ②] **本实例费用被强制覆盖为 N**（迷宫强化生成时的 `costOverride`，
  //   如「剑舞长空」的 0 费「灵轨月轮·扩散」）。
  //   ── 为什么要这个标记：覆盖只写在 `card.cost` 上，而下面这些链条会**整卡重建**同一张牌 ——
  //      安卡「圆缺有律」切换（`effectProcessor`）· 升级 `upgradeAcaciaHand` · 退级 `demoteAcaciaHand` ——
  //      它们用裸 `createCard(key)` 造新对象 ⇒ 费用被打回**卡面原价**（切一次模式就"0 费变 2 费"）。
  //   ── 口径（程 2026-10-06）：转换链**保留**这份覆盖 ⇒ 一律经 `carryCostOverride` 携带。
  //   ── 普通卡不带此标记 ⇒ 既有行为逐字不变。
  costOverride?: number;
  // [2026-09-19 莉莉子 方向一 · 归属盖章] 单位归属方：召唤落场时一次性写死，此后【查表】而非【推导】。
  // ── 病根：此前 CardData 无归属字段，谁的人全靠「在哪个数组里 + 交战区进攻方/格挡方推导」现算，
  //    同一套规则被手抄了 8 处（判死 / 开票 / 打场上信标 / 分摊选人 / 光环 / 记账…），抄错一处就出事
  //    —— 獠牙信标亡语炸错边就是这么来的。
  // ── 盖章点：effectProcessor 的 SUMMON 落点（落点阵营 = landingOwner）。
  // ── ⚠️ 消费方须知：只有【经 SUMMON 落场】的单位带此戳（信标四个生成口全走 SUMMON）。
  //    手牌打出 / 复活 / 克隆等其他入场路径不带 → 读之前必须 `?? ` 兜底回推导，勿裸读。
  unitOwner?: 'player' | 'enemy';
  // [新增] 'ephemeral_dying' 用于区分瞬息自然消散与常规受击阵亡
  // [修改] 增加 'delayed_attacking' 以支持防守方的滞后反击动画
  // [新增] 'summoning' 用于召唤入场演出（碎片重组）
  // [2026-08-16 莉莉子] 增加 'channel_pulse'（引导脉冲动画）、'thawing'（解冻动画）——此前类型未收录，触发 10 条 TS 错误
  animState?: 'idle' | 'attacking' | 'delayed_attacking' | 'hit' | 'dying' | 'ephemeral_dying' | 'transform' | 'regenerating' | 'buff' | 'summoning' | 'channel_pulse' | 'thawing' | 'swing_miss';
  damageTaken?: number;
  buffs?: { power: number, health: number };
  roundBuffs?: { power: number, health: number }; // [新增] 临时账本：专门记录单回合(ROUND)增益，用于回合末秋后算账
  roundKeywords?: Keyword[]; // [核心新增] 词条临时账本：专门记录单回合获得的词条，回合末予以回收
  depletedKeywords?: Keyword[]; // [泰坦] 黯淡关键词列表：关键词不再触发，但不失去，仍计入计数
  parentCard?: CardData; // [新增] 法术血统(DNA)：记录衍生该卡牌的”母体”实体（用于撤回法术时完美还原手牌与费用）

  // [能力] 配置——描述卡牌持有的独立能力（区别于关键词）
  ability?: AbilityConfig;
  // [能力] 运行时状态——由通用状态机驱动
  abilityState?: AbilityRuntimeState;
  abilityCharges?: number;

  // [2026-06-27] 场上每方最大数量限制（超过时入场被拦截）
  maxPerSide?: number;
  // [2026-06-27] 收到的 Buff 过滤规则
  buffRules?: {
    power?: {
      allowedTags?: string[];
    };
  };

  // [2026-07-05] AI 策略配置
  ai?: AIConfig;

  // [2026-07-16] 进攻宣告时自动推入法术堆栈的卡牌Key（如银臂的首次进攻AOE）
  onAttackSpell?: string;

}

// ==========================================
// [新增] AI 策略配置类型
// ==========================================
export type AIPattern = 'DAMAGE' | 'BUFF' | 'RALLY' | 'DUEL' | 'HEAL' | 'DRAW' | 'KEYWORD_TRANSFER' | 'SUMMON' | 'SACRIFICE' | 'FROST' | 'CHOICE' | 'STRIKE' | 'CALIBRATE' | 'RECALL_AND_REPLACE' | 'SET_STATS' | 'CLONE_TO_HAND'
  // [2026-09-26 莉莉子] 扩充敌方卡组前置：新增 4 种决策模式
  //   此前这些机制无法被 AI 表达 ⇒ 对应法术没配 ai ⇒ AI 视为死牌（evaluate 直接 shouldPlay:false）
  | 'NEGATE'        // 反制：无效化法术堆叠中的敌方法术（抵抗/抗拒/拒绝）
  | 'AOE_DAMAGE'    // 全场伤害：无需选目标（月震星陨/芬格尼尔之冬）
  | 'BOARD_CLEAR'   // 清场：双方全灭，需判断「谁更亏」（降临事件）
  | 'RESURRECT'     // 复活：墓地回场（瓦尔哈拉的呼唤）
  // [2026-09-27 莉莉子 第二批 ai] 茉莉安【暴露】体系 + 飞剑补给 + 天启者群体增益
  //   这批卡机制各自独有，无法用既有 pattern 表达 —— 不补就只能当死牌（红名单剩 6 张）
  | 'EXPOSE_MARK'      // 猎影标记：给敌人贴【暴露】／对已暴露目标发起额外攻击
  | 'EXPOSE_DEBUFF'    // 以饵引狼：暴露我方单位换敌方本回合 -4/-0
  | 'EXPOSE_CASHOUT'   // 静默行动：消除全场【暴露】，每个换我方全体永久 +1/+1
  | 'FLYING_SWORD'     // 飞剑补给：召唤 N 柄飞剑（剑鸣回响）
  | 'CHAMPION_BUFF';   // 天启者群体增益：指定 N 个天启者加身材（神格共鸣）

export interface AIConfig {
  pattern: AIPattern
  priority: number       // 同 pattern 内的优先级排序（数字越大越优先）
  config: Record<string, any> // 模式专属配置参数
}

// ==========================================
// [新增] 能力系统类型
// ==========================================
// [2026-10-06 程拍板 · 时机口径统一]
//   · `on_play`    = **入场**：从手牌打出 **或** 被效果召唤到战场都触发（口径见 `data/keywords.ts` 术语表「入场」）
//   · `on_play_from_hand` = **打出时**：**只有从手牌打出**才触发；被法术/能力召唤到场上**不触发**
//   ⚠️ 两者是**不同**的时机，判据别混用（`data/effectRegistry.ts` 的 `isEntryTiming` / `isPlayFromHandTiming`）。
export type AbilityTrigger = 'on_play' | 'on_play_from_hand' | 'on_attack_declare' | 'round_start';

export type AbilityPostState = 'dim' | 'recharge';

export type AbilityRuntimeState = 'hidden' | 'breathing' | 'flashing' | 'dimmed';

export interface AbilityConfig {
  id: string;                 // 能力标识
  label: string;              // 能力名（tooltip 用）
  description: string;        // 能力描述
  trigger: AbilityTrigger;    // 触发时机
  maxCharges: number | -1;    // -1 = 无限次 / 1 = 单次
  postTriggerState: AbilityPostState; // 触发后变暗还是恢复呼吸
  isLevelAbility?: boolean;   // 是否会随升级更换
}

export type CombatFieldItem = {
    attacker: CardData;
    blocker: CardData | null;
    owner: 'player' | 'enemy';
    isChallenged?: boolean; // 可选属性：标记是否是挑战导致的格挡
    isExtraAttack?: boolean; // [2026-09-26 T17 猎影标记] 可选属性：法术装配的「额外攻击」战线（不消耗进攻标识）
};

export interface SpellStackItem {
  card: CardData;
  owner: 'player' | 'enemy';
  targets: any[];
}

// ==========================================
// [新增] 微队列调度系统相关类型
// ==========================================
export type PendingActionType =
  | 'NEXUS_STRIKED'
  | 'SPELL_PLAYED'   // 为未来的“法术大师”预留
  | 'UNIT_HEALED';   // 为未来的治疗系英雄预留

export interface PendingAction {
    type: PendingActionType;
    // 携带更丰富的包裹，方便引擎判断是否需要推进任务
    payload?: any;
}

export type AttackTokenType = 'normal' | 'rally' | null;

// [2026-07-20] 死亡类型：阵亡 vs 消亡（替换打出）
export type DeathType = 'KILLED' | 'ELIMINATED';

// [2026-07-20] 对局记录 — 操作分类
export type GameRecordCategory =
  | 'play_card'       // 打出卡牌
  | 'attack'          // 攻击
  | 'spell_cast'      // 施放法术
  | 'unit_died'       // 单位阵亡
  | 'unit_eliminated' // 单位消亡（替换）
  | 'hero_levelup'    // 英雄升级
  | 'nexus_damage'    // 水晶受伤
  | 'heal'            // 治疗
  | 'draw_card'       // 抽卡
  | 'summon'          // 召唤
  | 'pass_turn'       // 让过/回合结束
  | 'turn_start'      // 回合开始
  | 'combat_declare'  // [2026-07-21] 进攻/格挡宣告
  | 'combat_fight'    // [2026-07-21] 单路战斗结算
  | 'spell_effect'    // [2026-07-21] 法术效果（伤害/治疗等）
  | 'volatile_discard' // [2026-07-23] 瞬逝手牌弃置
  // [2026-10-08 莉莉子 · 对局记录补齐] 能力效果 —— **非操作型**的伤害/影响（基座扫射 / 信标引爆 /
  //   亡语 / 光环 / 回合末效果）。记录系统原本是"操作驱动"的（埋点全在"有人点了什么"处），
  //   而这类伤害是**效果结算的副产物**，没有对应的操作 ⇒ 此前一律不进记录。
  | 'ability_effect';

// [2026-07-21] 卡牌变化类型 — 用于法术效果的多维展示
export type RecordChangeType =
  | 'damage'         // ❤️ 受到伤害（红色）
  | 'heal'           // 💚 治疗（绿色）
  | 'buff_health'    // 🌿 生命值BUFF（绿色十字）
  | 'buff_power'     // ⚔️ 攻击力BUFF（橙红宝剑）
  | 'debuff_power'   // ⚔️ 攻击力DEBUFF（灰色宝剑）
  | 'gain_keyword';  // +关键词图标

export interface RecordChange {
  type: RecordChangeType;
  value?: number;
  keyword?: string;
}

// [2026-07-21] 战斗记录实体 — 单个参与单位的快照
export interface RecordEntity {
  cardKey: string;
  owner: 'player' | 'enemy';
  damageTaken?: number;    // 本次受到的伤害（❤️-N）
  died?: boolean;          // 是否阵亡（☠️）
  /** [2026-07-21] 卡牌这一刻的完整状态快照 — 用于渲染实时数值 */
  snapshot?: {
    power: number;
    health: number;
    maxHealth: number;
    damageTaken: number;
    buffs?: { health?: number; power?: number };
    roundBuffs?: { health?: number; power?: number };
  };
  /** [2026-07-21] 卡牌发生的具体变化列表 — 用于展示治疗/BUFF/DEBUFF等 */
  changes?: RecordChange[];
}

// [2026-07-20] 对局记录 — 单条条目
export interface GameRecord {
  id: string;
  turn: number;
  owner: 'player' | 'enemy';
  category: GameRecordCategory;
  summary: string;          // 概要文本，如「打出 芬妮」
  cardKey?: string;         // 关联卡牌 key（点击查看详情用）
  detail?: string;          // 补充细节（灰色小字）
  entities?: RecordEntity[]; // [2026-07-21] 多实体参与记录（进攻/格挡/战斗）
}

// [新增] 战斗统计数据接口
export interface GameStats {
  nexusDamage: number;   // 对敌方水晶造成的伤害
  unitsPlayed: number;   // 我方打出的单位
  heroesPlayed: number;  // 我方打出的英雄
  spellsPlayed: number;  // 我方打出的法术
  unitsKilled: number;   // 我方击杀的单位
  heroesKilled: number;  // 我方击杀的英雄
  heroLevelUps: number;  // 我方英雄升级次数
}

export interface GameState {
  // [2026-08-06 莉莉子] 补齐核心场地字段（接口此前漏声明，运行时一直存在）
  playerBench: CardData[];
  enemyBench: CardData[];
  playerHand: CardData[];
  enemyHand: CardData[];
  playerDeck: CardData[];
  enemyDeck: CardData[];
  combatField: any[]; // 交战区：{ attacker, blocker, owner, isChallenged?, isGhostBlocked? }[]
  playerMana: number;
  playerMaxMana: number;
  playerSpellMana: number;
  enemyMana: number;
  enemyMaxMana: number;
  enemySpellMana: number;
  playerNexus: number;
  playerNexusMax?: number; // [2026-08-11] 玩家水晶回血上限（肉鸽=全局 run.maxHp，缺省 20；effectProcessor HEAL 封顶用）
  playerNexusBarrier?: number; // [2026-08-27] 玩家水晶屏障（固若金汤：可挡伤害点数，回合末清零）
  playerNexusTough?: boolean; // [2026-08-30 莉莉子] 玩家水晶坚韧（固若金汤：受击伤害永久 -1）
  playerNexusImmune?: boolean; // [2026-09-29 程拍板] 玩家水晶**免疫任何伤害**（不死之身；回合结束自扣不在此列）
  rogueEnhancements?: string[]; // [2026-08-11] 玩家迷宫强化 id 列表（战斗内被动强化，battleEffect 分发）
  enemyEnhancements?: string[]; // [2026-08-27] 敌方迷宫强化 id 列表（战斗内被动强化，battleEffect 分发）
  // [2026-09-25 莉莉子 三线任务化框架] 单场任务进度表：key → 已累计次数。
  //   命名空间见 logic/questTracker 的 questKey：强化线 enh:<id> / 装备线 gear:<卡实例 id>:<装备 id>。
  //   单场作用域（每场重置）；整局作用域存 run.questProgress —— 两者互不干扰。
  questProgress?: Record<string, number>;
  /** [2026-09-25 莉莉子 强化线] 悬赏标记的单位 id（BOUNTY_CYCLE 用；目标离场即视为已击杀） */
  bountyId?: string;
  // [2026-08-11] 暗影双生：本回合是否已触发过首次召唤复制（每回合开始重置）
  // [2026-10-05 莉莉子 BUG修复 · 20261005-09] 语义已明确为**「本回合的『首个打出单位』时机是否已消费」**：
  //   写入者两处 —— ① `useGameState` 的打出单位路径（分发完 on_first_summon / on_first_play_unit 后无条件置位）
  //   ② 暗影双生（CLONE_AND_SUMMON）自己的处理器。读取者 = `isFirstUnitPlayedThisRound` 闸门
  //   （芬妮①③「聚光灯下/全场焦点」、先锋之锐、斩杀协议）。
  //   ⚠️ 此前只有 ② 会写、而 ② 的 trigger 从不分发 ⇒ 该标记恒为 false ⇒ "每回合首个"退化成"每个"。
  // 🔴 [2026-10-06 程拍板 · 审计收口 · **模式 B：一个标记别兼任两件事**] **改为按方记录**：
  //   原先是一个**敌我共用**的布尔 ⇒ "**谁先打出单位，谁就把它消费掉**"
  //   ⇒ 另一侧那一回合永远吃不到「首个打出单位」类加成。
  //   受害者：玩家的「先锋之锐」、芬妮①③「聚光灯下 / 全场焦点」、`divfx_fenny_1/3`；
  //   敌方的「斩杀协议」；以及双方各自的「暗影双生」。卡面语义本就是"**每方各自**每回合首个"
  //   ⇒ 真源必须分两份账本（与 Mauxir / 茉莉安进度改「按方」是同一条判据）。
  rogueFirstSummonDone?: { player?: boolean; enemy?: boolean };
  // [2026-09-17 1.0.16 松露小队 · 虹彩] 獠牙信标生命上限的永久修正（负值），局内累计。
  // 召唤落场时套用 —— 这样【尚未登场】的信标也吃得到（方案 8.1 关键细节）。
  // ⚠️ 绝不直接改 CARD_DB：那是模块级常量，改它会跨局污染。
  beaconMaxHealthMod?: number;
  // [2026-10-02 莉莉子 C1 · 全局进度] 「我方召唤的獠牙信标被破坏」的**权威计数**（按阵营）。
  // ── 为什么挪到全局：旧实现把计数写在**茉莉安的卡副本**上，而她同一时刻只会在一个区域
  //    （备战席/手牌/牌库/交战区四选一，进攻时被移出备战席）⇒ 漏扫她当时所在区域就**静默丢进度**，
  //    战斗归位又把旧实例写回 —— 这是 09-23 / 09-27 两次「茉莉安不升级」事故的本质。
  // ── 手册问题记录 I04 当初写的就是这个方向：「进度挂**全局对局状态**」。
  // ── 卡上的 `beaconDeaths` 字段保留为**显示镜像**（UI 进度环 / checkCardLevelUp 读它），
  //    由死亡漏斗按本字段的**绝对值赋值**（幂等，不再各自累加）。
  // ── 「按阵营分开记账」：镜像对局双方各算各的（与旧口径一致）。
  beaconDeaths?: { player?: number; enemy?: number };
  // [2026-09-17 1.0.16 松露小队 · 园丁] 园丁灌溉无人机上次触发所在的回合号。
  // 与 game.round 相等即表示「本回合已触发过」——实现「每回合首次」的节流。
  truffleGardenerRound?: number;
  // ⛔ [2026-10-02 莉莉子 信标亡语化 · 已废弃] 原 `marianBeaconRespawnRound`（Lv2 每回合首次补兵的节流）
  //    与 `marianBeaconVoucher`（Lv1 补兵券欠条）—— 随「补兵机制整体改为亡语」一并移除。
  //    新机制：重生由**信标自己的亡语**负责（effect_marian_beacon_respawn），
  //    Lv1 入场授予一次 / Lv2 光环动态授予 ⇒ 既不需要券，也不需要每回合节流。
  //    （字段已删；若老存档里残留这两个键，读不到也不影响 —— 代码不再引用。）
  // ==========================================
  // [2026-09-19 1.0.16 茉莉安 · 大招逐击改造] 连斩（CHAIN_STRIKE）的续击状态机
  // ── 为什么需要它：连斩此前是 effectProcessor 里一个**同步 for 循环**，一次 tick 全打完
  //    ⇒ 多个目标同帧掉血、没有"挨个打击"的演出空间。
  //    改为「一击一步」后，链的进展必须有地方记 —— 就是这里。
  // ── 驱动器：useGameState 的驱动 effect 看到 done=false 就延时再打一击（见 chainStrikeStep）。
  // ── 清理口径：done=true 的链会被下一次施法当作"无链"重新初始化，无需显式清除。
  // ==========================================
  pendingChain?: {
    casterSide: 'player' | 'enemy';
    strikeDmg: number;      // 每击伤害（首击时由茉莉安攻击力解析一次，后续沿用）
    victimId: string | null; // 下一击的目标；null = 自动锁最低血（击杀后即为此态）
    step: number;           // 已打完的击数
    done: boolean;
    prevPhase: string;      // 链开始前的 phase，收尾时还原
    /**
     * [2026-10-04 程拍板] 本链**击杀过獠牙信标** ⇒ 后续续击**跳过信标**（是"跳过"，不是"断链"）。
     *
     * 口径（程原话）：大招打死信标 → 它满血复活 ⇒ **跳过它**、转去打别的敌人；
     *   除信标外的敌人也清完了 ⇒ 才转打水晶。
     * 为什么必须有这条：信标的重生亡语让它**满血回归**，而大招的续击条件是"击杀就继续"
     *   ⇒ 两者叠加会形成**自我维持的循环**（打死 → 重生 → 再打死 …直到 MAX_CHAIN 上限），
     *   表现即粉丝报的「用大招无限击杀复活的信标」。
     */
    skipBeacon?: boolean;
  };
  // ⛔ [2026-10-02 已废弃并删除] `marianBeaconVoucher` —— 见上方说明（补兵券随亡语化移除）。
  enemyNexus: number;
  enemyNexusMax?: number; // [2026-08-30 莉莉子] 敌方水晶回血上限（=敌方水晶初值；肉鸽=难度基础+生命强化，缺省 20）
  enemyNexusBarrier?: number; // [2026-08-27] 敌方水晶屏障（固若金汤：可挡伤害点数，回合末清零）
  enemyNexusTough?: boolean; // [2026-08-30 莉莉子] 敌方水晶坚韧（固若金汤：受击伤害永久 -1）
  enemyNexusImmune?: boolean; // [2026-09-29 程拍板] 敌方水晶**免疫任何伤害**（不死之身；回合结束自扣不在此列）
  round: number;
  attackToken: {
    player: AttackTokenType;
    enemy: AttackTokenType;
  };
  // [核心修复] 新增 'react_to_block' 阶段，作为格挡后、伤害结算前的法术博弈缓冲区
  phase: 'main' | 'attack_declare' | 'block_declare' | 'react_to_block' | 'resolution' | 'animating' | 'mulligan';
  turnOwner: 'player' | 'enemy';
  consecutivePasses: number;

  spellCasting: null | {
    cardId: string;
    step: 'select_ally' | 'select_enemy' | 'select_any' | 'choose_mode' | 'select_discard' | 'select_hand_target' | 'select_bench';
    allyId?: string;
    targets: any[];
    isHeroLeveled?: boolean; // [新增] 告知界面：当前施放英雄法术的英雄是否已升级
    // [2026-10-02 莉莉子 BUG修复] 抉择归属方 —— 只认「这张抉择法术是谁打出的」，不认 turnOwner。
    //   病根：UI 三处（AI自动抉择 / 选项点击 / 背景取消）此前都用 `turnOwner === 'enemy'`
    //   推断"这是 AI 的抉择"。但玩家完全可以在**对方优先权**阶段打出极速抉择法术
    //   （典型：玩家进攻 → 格挡阶段 turnOwner 归防守方 = 'enemy' → 玩家打出极速抉择）
    //   ⇒ 玩家自己的弹窗被当成 AI 的：点不动、取消不掉，AI 还会拿敌方法力替他选 ⇒ 卡死。
    choiceOwner?: 'player' | 'enemy';
  };
  pendingSpell: SpellStackItem | null; // [新增] 预提交缓冲站：存放已打出但未最终确认的法术
  spellStack: SpellStackItem[];
  gameResult: 'victory' | 'defeat' | null;

  // [2026-10-07 莉莉子 · 打击感] 震屏分档：boolean 是**旧档**（法术路径沿用，走 .animate-shake），
  //   字符串档位是撞水晶路径新增的（走 .animate-shake-{sm,md,lg}）。
  //   故意保留 boolean 兼容：法术路径不在本次范围内，不能被动改到。
  screenShake?: boolean | 'sm' | 'md' | 'lg';
  nexusDamage?: { target: 'player' | 'enemy', amount: number };

  leveledChampions: string[];
  // [2026-09-13 莉莉子] 分阵营升级标记 —— 只服务「升级流程」的敌我判定。
  // 背景：leveledChampions 是全局 key 列表（不记这名字属于哪一方）。
  //   敌我双方场上有同名天启者时，我方升级写下的标记会让敌方 Lv1 同名英雄
  //   在扫描时被误判为"该升级"，反复入队播影片、却因不达标而永远升不了级
  //   → 升级影片无限循环（粉丝反馈）。
  // 本字段按方记录，从根上分开敌我；leveledChampions 仍照常维护（写入端必须同步两套）。
  // [2026-10-04 莉莉子 · I5 收口] 原先 09-13 那次只改了「升级流程」一处，而**变形 / 抉择解锁 /
  //   法术回库 / 安卡手牌升级**仍读全局 ⇒ 镜像对局里仍会跨侧串味。本次已把这几处读取端
  //   全部改为 `isLeveledUpForSide(game, side, key)`；全局表现只剩写入端与少数幂等守卫。
  leveledChampionsBySide: { player: string[]; enemy: string[] };
  pendingLevelUps: CardData[]; // [新增] 待升级英雄候场区队列
  levelUpCard: CardData | null;
  lastActionTimestamp: number;
  activeCard: CardData | null;
  selectedBlockerId: string | null;
  selectedChallengerId: string | null;
  fullArtCard: CardData | null;
  stats: GameStats;
  friendlyUnitDeaths: number; // [2026-07-14 梵音] 本牌局我方单位阵亡计数（用于莎罗）
  enemyUnitDeaths: number; // [2026-07-15] 敌方单位阵亡计数（AI莎罗用）

  // [2026-07-29 安卡希雅] 飞剑计数系统
  playerFlyingSwordsTotal: number;   // 本牌局总飞剑召唤数
  playerGreatSwordsTotal: number;    // 本牌局总大飞剑召唤数
  playerRoundSwordUsed: boolean;     // 本回合是否召唤过飞剑
  playerRoundFlyingSwords: number;   // [2026-07-31] 本回合已召唤的飞剑数（阿尔维娜能力按此计算）
  enemyFlyingSwordsTotal: number;
  enemyGreatSwordsTotal: number;
  enemyRoundSwordUsed: boolean;
  enemyRoundFlyingSwords: number;    // [2026-07-31] 本回合敌方已召唤的飞剑数

  // [2026-07-30 安卡希雅] 灵轨月轮模式切换
  playerAcaciaSwordFocus?: boolean;  // true=集束模式, false=扩散模式(默认)
  enemyAcaciaSwordFocus?: boolean;

  // [2026-07-17 鸦眼小队] 校准挂起状态
  calibratePending?: CalibrateData;
  /**
   * [2026-10-03 莉莉子 · 进攻标识三层分离]
   * **侦察关键词的「每回合首次」标记**（`Scout`：每回合首次仅用侦察单位进攻 ⇒ 进攻后再获得一次进攻机会）。
   *
   * 为什么必须显式存：此前实现是拿「**token 值是不是 `normal`**」当"本回合是否已触发过"的代理指标
   * （`useGameState` 回合末结算），于是**备战一旦把 token 改写成 `rally`，侦察的额外机会就会被误判成"用过了"而吞掉**。
   * ⇒ 回合边界由 `calculateRoundStart` 统一清零（与进攻标识同批重置）。
   */
  scoutUsedThisRound?: { player: boolean; enemy: boolean };
  // [2026-10-06 程拍板 · 序号去重] 「获得进攻标识时」(`ON_GET_ATTACK_TOKEN`) 的**授予账本**。
  //   ── 病根（程实测）：**格挡回合**打出灵轨月轮 → 侦察给出标识（`null → 'rally'`）⇒ 场上的安卡**不给月轮**。
  //      原实现有两个派发点各管一半（回合初「块 B」/ 回合内检测器），中间漏了这一整类；
  //      而补上它又会与块 B **重复派发**（块 B 是在 +100ms 定时器里读**实时**状态的，边界不是提交批次）。
  //   ── 现口径：`grantExtraAttackTurn` 是「追加进攻权」的**唯一出口** ⇒ 每次**真正授予**就 `tokenGrantSeq[side]++`；
  //      两个派发点都按「`seq > handled` 才发、发完把 handled 追平」去重
  //      ⇒ **一次授予 = 一次派发**，与**时序 / 提交批次 / prev 值**全都无关。
  //   ⚠️ 只统计 **rally 授予**；回合轮换发的 `normal` 不计数（那份由块 B 的"持标识即扫"覆盖）。
  tokenGrantSeq?: { player: number; enemy: number };
  tokenGrantHandled?: { player: number; enemy: number };
  /**
   * [2026-10-03 莉莉子 BUG修复 · 校准面板互相挤掉]
   * 待触发的校准**排队请求**（单槽 `calibratePending` 被后触发的校准**覆盖**过）。
   * ⚠️ 这里**只存请求**（谁、抽几张），不存牌库快照 ——
   *    候选牌在**出队时**从当时的真实牌库现抽（避免排队期间牌库变了导致用到陈旧快照）。
   */
  calibrateQueue?: { owner: 'player' | 'enemy'; count: number }[];

  // [2026-08-06 莉莉子] 墓地：本牌局死亡单位快照（正常死亡才记录，消亡替换/爆牌不计）
  // 拆成双方独立数组，法术2「瓦尔哈拉的呼唤」按方复活
  playerGraveyard?: CardData[];
  enemyGraveyard?: CardData[];

  // [2026-07-20] 对局操作记录（供玩家对局中查阅）
  gameRecords: GameRecord[];
}

// [2026-07-17 鸦眼小队] 校准数据结构
export interface CalibrateData {
  drawnCards: { card: CardData; originalIndex: number }[];
  deckMinus: CardData[];
  owner: 'player' | 'enemy';
  pendingCount?: number; // [2026-07-17 穆林] 排队校准：本轮还有多少次校准待触发
}
// --- [新增] 用户系统相关接口 ---

export interface UserSummary {
  uid: string; // 用户唯一ID
  displayName: string; // 用户显示名称
  avatarId: string; // 头像ID（与 UserProfile 中的 avatarId 类型一致）
  lastLoginAt: number; // 最后登录时间戳
  type: 'full' | 'starter'; // 用户模式（全卡/初始卡）
}

// --- [新增] 头像裁剪配置结构 ---
export interface AvatarConfig {
    imageKey: string;
    type: 'hero' | 'unit' | 'spell';
    scale: number;
    offsetX: number;
    offsetY: number;
}

export interface UserProfile {
  uid: string;           // 用户唯一ID
  displayName: string;   // 显示昵称 (如 "分析员#1234")
  level: number;         // [2026-09-04] 账号等级（任何模式对局给经验；评估嘉勉已迁独立存档键）
  exp: number;           // 当前账号等级内经验
  avatarId: string;      // 头像ID (作为后备选项)
  avatarConfig?: AvatarConfig; // [新增] 自定义裁剪头像配置
  createdAt: number;     // 注册时间戳
  lastLoginAt: number;   // 最后登录时间
  pityCounter?: number;  // [新增] 兼容性：常规抽卡保底计数
  skinPityCounter?: number; // [核心新增] 皮肤抽卡保底计数 (30抽保底)
  gachaTarget?: string | null; // [新增] 兼容性：抽卡定轨目标
}

export interface UserSettings {
  volume: {
    bgm: number;
    sfx: number;
    voice: number;
    // [2026-10-05 莉莉子 BUG修复 · 20261005-06] 「过场」通道补进类型 ——
    //   此前 UI（SettingsModal 的 volumes 声明）有 movie、而这里与默认值都没有 ⇒
    //   `settings.volume.movie` 恒为 undefined（滑块初值 undefined、越界夹紧也算不出）
    movie: number;
  };
  customization: {
    currentCardBackIndex: number; // 当前佩戴的卡背
    currentDeskIndex: number;     // 当前使用的牌桌
  };
  unlockedCardBacks: number[];    // 已解锁的卡背列表
  unlockedDesks: number[];        // 已解锁的牌桌列表
  unlockedRogueDifficulties?: string[]; // [2026-08-07] 肉鸽已解锁难度（normal/secret/topsecret，全卡档视为全解锁）
  unlockedRogueEnhancements?: string[]; // [2026-08-26 逻辑研习] 肉鸽图鉴已解锁强化 id（获得过才解锁；开发者账号全解锁）
  unlockedRogueEquipments?: string[];   // [2026-08-26 逻辑研习] 肉鸽图鉴已解锁装备 id（获得过才解锁；开发者账号全解锁）
  ownedArmaments?: string[]; // [2026-08-29 评估嘉勉] 已拥有武装 id 的种类名（stock>0 的 id 集合；旧读取兼容，权威请用 armamentStock）
  armamentStock?: Record<string, number>; // [2026-09-07 真数量库存] 每件武装库存数量（普通上限3/消耗品不限；装备占用、消耗品发挥后-1）
  passUnlockedEnhancements?: string[]; // [2026-08-29 评估嘉勉·通行证] 已解锁的通行证专属迷宫强化 id（达到等级解锁后才在强化池可遇到）
  pendingPacks?: number; // [2026-08-29 评估嘉勉·通行证] 待打开的卡包数（打开 → 抽到一个奖励匣）
  // [2026-09-29 程拍板] 奖励匣体系：开包改为「先抽到匣子 → 再打开匣子得到道具」
  //   两类匣：武装匣（开对应品质武装）/ 神格碎片匣（开对应数量神格碎片，每5片一组随机归属某天启者）
  pendingChests?: import('./data/roguelike/divinityShards').ChestInstance[];
  passClaimedRewards?: number[]; // [2026-08-29 通行证·手动领取] 已领取的通行证奖励等级（**≤30 固定表**用；达到等级后需在通行证面板手动领取）
  // [2026-10-04 程拍板 ③] **31+ 里程碑奖励的领取水位**（不允许跳级）。
  //   为什么另开一个字段而不是继续用数组：31+ 是**无限等级**，数组会无上限增长；
  //   而"不允许跳级"意味着只需记住"领到第几级"即可 ⇒ 用水位。
  //   缺省（未设置）视为 ANALYST_FIXED_REWARD_MAX（30），即 ≤30 仍走上面的数组。
  passClaimedUpTo?: number;
  videoResolution?: '1k' | '2k' | '4k';
  lastSeenAnnouncementVersion?: string; // [2026-08-09] 已读过的公告版本号（新版本首次进大厅弹窗标记）
  skipGameStartDrawAnimation?: boolean; // 跳过开局抽卡动画
  skipLevelupMovie?: boolean;          // 默认跳过升级影片
  skipVictoryMovie?: boolean;          // 默认跳过胜利影片
  deskDynamic?: boolean;               // [2026-08-13] 牌桌动态/静态切换（开启=用动态视频牌桌）
  heroDynamic?: boolean;               // [2026-08-16] 天启者动态卡面（开启=对局内手牌/场上英雄卡用动态视频）
  cardBackDynamic?: boolean;           // [2026-08-23] 动态卡背（开启=对局内/选择预览/牌组预览用动态视频卡背）
  spellDynamic?: boolean;              // [2026-09-26] 动态法术/单位卡面（开启=对局内手牌/场上法术卡、单位卡用动态视频）
}

export interface UserResources {
    silverCoin: number; // [新增] 通用银 (基础货币)
    dataGold: number;   // 数据金 (免费/活跃货币)
    bitGold: number;    // 比特金 (付费/稀有货币)
}


export interface UserCollection {
  // Key = 卡牌ID, Value = 拥有数量
  ownedCards: Record<string, number>;
  // [皮肤] Key = 卡牌Key, Value = 已拥有的皮肤ID列表 (skinId 0即默认皮肤，默认拥有)
  ownedSkins: Record<string, number[]>;
  resources: UserResources;
}

// [2026-09-04 账号等级系统] 评估嘉勉通行证独立存档形状（与老 profile 一致，便于迁移）
export interface AnalystPassData {
  level: number;
  exp: number;
}

// [2026-09-04 战绩记录器] 真实对局模式（沙盒练习不计入）
export type BattleMode = 'pve' | 'tutorial' | 'rogue';

// [2026-09-04 战绩记录器] 按用户持久化的对战记录（档案面板真战绩）
export interface UserBattleRecord {
  totalMatches: number;
  wins: number;
  losses: number;
  updatedAt: number; // 最近一场真实对局时间
  byMode: Partial<Record<BattleMode, { totalMatches: number; wins: number }>>;
  heroes: Record<string, number>; // heroKey → 出场局数（代表英雄=最高者）
}



export interface SavedDeck {
  id: string;            // 卡组唯一ID (UUID)
  name: string;          // 卡组名称
  hero: string;          // 封面英雄
  cards: Record<string, number>; // 卡牌构成 { 'lyfe': 3 ... }
  skinOverrides?: Record<string, number>; // [皮肤] Key=卡牌Key, Value=当前选用的skinId
  createdAt: number;
  updatedAt: number;
  cardBackIndex?: number;
  boardIndex?: number;
}

// 单个形态的坐标参数
export interface CropConfig {
    scale: number;       // 缩放比例 (默认 1)
    offsetX: number;     // X轴百分比偏移 (默认 0)
    offsetY: number;     // Y轴百分比偏移 (默认 0)
}

// 一张卡牌包含的三种模态坐标
export interface CardCropData {
    hand?: CropConfig;       // 手牌/竖向模式 (Lv1)
    bench?: CropConfig;      // 备战席/战术棋子模式 (Lv1)
    combat?: CropConfig;     // 战场/横向拉伸模式 (Lv1)
    avatar?: CropConfig;     // [新增] 头像裁剪模式 (Lv1)
    hand_lv2?: CropConfig;   // [新增] 2级手牌
    bench_lv2?: CropConfig;  // [新增] 2级备战席
    combat_lv2?: CropConfig; // [新增] 2级战场
    avatar_lv2?: CropConfig; // [新增] 2级头像
}

// ==========================================
// [核心新增] 战区军功与审计系统底层类型 (Mission & Logger)
// ==========================================

// --- 1. 日志事件类型 (Log Events) ---
export type LogActionType =
    | 'play_card'      // 打出卡牌
    | 'attack'         // 发起攻击
    | 'nexus_damage'   // 对水晶造成伤害
    | 'level_up'       // 英雄升级
    | 'game_end';      // 对局结束

export interface BaseLogEvent {
    type: LogActionType;
    turn: number;            // 发生回合
    timestamp: number;       // 物理时间戳
    isPlayerSide: boolean;   // 是否是我方(玩家)行为
}

export interface PlayCardLogEvent extends BaseLogEvent {
    type: 'play_card';
    cardKey: string;
}

export interface AttackLogEvent extends BaseLogEvent {
    type: 'attack';
    cardKey: string;
}

export interface NexusDamageLogEvent extends BaseLogEvent {
    type: 'nexus_damage';
    sourceCardKey: string;   // 造成伤害的来源实体
    amount: number;          // 伤害数值
}

export interface LevelUpLogEvent extends BaseLogEvent {
    type: 'level_up';
    cardKey: string;
}

export interface GameEndLogEvent extends BaseLogEvent {
    type: 'game_end';
    result: 'win' | 'loss' | 'draw';
}

// 日志联合类型
export type LogEvent =
    | PlayCardLogEvent
    | AttackLogEvent
    | NexusDamageLogEvent
    | LevelUpLogEvent
    | GameEndLogEvent;

// [2026-08-06 莉莉子] 修复：Omit 对 union 不分布会丢失判别字段，改用分布式条件类型
type DistributiveOmit<T, K extends keyof any> = T extends any ? Omit<T, K> : never;
export type LogEventPayload = DistributiveOmit<LogEvent, 'timestamp'>;


// --- 2. 军功任务类型 (Mission System) ---
export type MissionCategory = 'daily' | 'weekly' | 'achievement';
export type MissionRewardType = 'dataGold' | 'skin' | 'cardBack';
export type MissionConditionType = 'game_end' | 'play_card' | 'attack' | 'nexus_damage' | 'level_up_and_win';
export type MissionStatus = 'ongoing' | 'completed' | 'claimed';

export interface MissionDef {
    id: string;
    category: MissionCategory;
    title: string;
    description: string;
    targetCount: number;
    reward: {
        type: MissionRewardType;
        amount?: number;
        cosmeticId?: string;
    };
    condition: {
        type: MissionConditionType;
        targetKey?: string;
    };
}

export interface MissionProgress {
    id: string;
    current: number;
    target: number;
    status: MissionStatus;
}

export interface MissionUpdateResult {
    missionId: string;
    addedAmount: number;
    current: number;
    target: number;
    justCompleted: boolean;
    title: string;
}

export const GAME_VERSION = '1.4.0';