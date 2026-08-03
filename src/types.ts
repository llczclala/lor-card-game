export type Region = 'Lyfe' | 'Fenny' | 'Pupu' | 'Logistics' | 'Mauxir' | 'Acacia' | 'TEST';
export type CardType = 'unit' | 'spell-burst' | 'spell-fast' | 'spell-slow';
export type Race = 'summoner' | 'summon' | 'titan'; // [新增] 种族：召唤师/召唤物/泰坦

// [2026-08-02 新增] 卡池枚举 —— 卡牌归属哪个卡池（数据驱动，备战详情跳转抽卡界面用）
// 值刻意与 gachaLogic.PoolId 的字符串对齐，保证 `POOLS[card.gachaPool]` 直接可用
export const GachaPoolEnum = {
    Permanent: 'permanent', // 常守之誓
    Lotus: 'lotus',         // 烬中镜火
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
  deathType?: DeathType;    // [2026-07-20] 死亡类型：KILLED(阵亡) / ELIMINATED(消亡替换)
  strikeCount: number;
  roundStrikes?: number; // [新增] 本回合打击次数记账本，用于法术动态增伤判定
  customProgress?: number; // [新增] 私人记账本：专门用于记录卡牌在场上“目睹”等局部任务的进度
  // [新增] 'ephemeral_dying' 用于区分瞬息自然消散与常规受击阵亡
  // [修改] 增加 'delayed_attacking' 以支持防守方的滞后反击动画
  // [新增] 'summoning' 用于召唤入场演出（碎片重组）
  animState?: 'idle' | 'attacking' | 'delayed_attacking' | 'hit' | 'dying' | 'ephemeral_dying' | 'transform' | 'regenerating' | 'buff' | 'summoning';
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
export type AIPattern = 'DAMAGE' | 'BUFF' | 'RALLY' | 'DUEL' | 'HEAL' | 'DRAW' | 'KEYWORD_TRANSFER' | 'SUMMON' | 'SACRIFICE' | 'FROST'

export interface AIConfig {
  pattern: AIPattern
  priority: number       // 同 pattern 内的优先级排序（数字越大越优先）
  config: Record<string, any> // 模式专属配置参数
}

// ==========================================
// [新增] 能力系统类型
// ==========================================
export type AbilityTrigger = 'on_play' | 'on_attack_declare' | 'round_start';

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
  | 'volatile_discard'; // [2026-07-23] 瞬逝手牌弃置

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
  playerMana: number;
  playerMaxMana: number;
  playerSpellMana: number;
  enemyMana: number;
  enemyMaxMana: number;
  enemySpellMana: number;
  playerNexus: number;
  enemyNexus: number;
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
  };
  pendingSpell: SpellStackItem | null; // [新增] 预提交缓冲站：存放已打出但未最终确认的法术
  spellStack: SpellStackItem[];
  gameResult: 'victory' | 'defeat' | null;

  screenShake?: boolean;
  nexusDamage?: { target: 'player' | 'enemy', amount: number };

  leveledChampions: string[];
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

  // [2026-07-20] 墓地存根（未来实现）
  graveyard?: CardData[];

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
  level: number;         // 玩家等级
  exp: number;           // 当前经验值
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
  };
  customization: {
    currentCardBackIndex: number; // 当前佩戴的卡背
    currentDeskIndex: number;     // 当前使用的牌桌
  };
  unlockedCardBacks: number[];    // 已解锁的卡背列表
  unlockedDesks: number[];        // 已解锁的牌桌列表
  videoResolution?: '1k' | '2k' | '4k';
  skipGameStartDrawAnimation?: boolean; // 跳过开局抽卡动画
  skipLevelupMovie?: boolean;          // 默认跳过升级影片
  skipVictoryMovie?: boolean;          // 默认跳过胜利影片
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

export type LogEventPayload = Omit<LogEvent, 'timestamp'>;


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