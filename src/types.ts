export type Region = 'Lyfe' | 'Fenny' | 'Pupu' | 'Logistics' | 'TEST';
export type CardType = 'unit' | 'spell-burst' | 'spell-fast' | 'spell-slow';
// 完整的 36 个关键词定义
export type Keyword =
    | 'Overwhelm' | 'QuickAttack' | 'Regeneration' | 'Elusive' | 'Challenger' | 'CantBlock'
    | 'Barrier' | 'Lifesteal' | 'Last Breath' | 'Fearsome' | 'Frostbite' | 'Tough'
    | 'Scout' | 'Ephemeral' | 'Stun' | 'Double Attack' | 'Support' | 'Deadly'
    | 'SpellShield' | 'Silence' | 'Berserk' | 'Cleave' | 'Thorns' | 'Vanguard'
    | 'Ambush' | 'Plunder' | 'Exposed' | 'Shroud' | 'Immobile' | 'Reborn'
    | 'Execute' | 'Sniper' | 'Volatile' | 'Echo' | 'Impact' | 'Channel' | 'Titan' | 'Ability';

export interface CardData {
  id: string;
  key: string;
  name: string;
  cost: number;
  power: number;
  health: number;
  maxHealth: number;
  isChampion: boolean;
  level: number;
  region: Region;
  description: string;
  keywords: Keyword[];
  effects?: string[];
  imageUrl: string;
  level2ImageUrl?: string;
  type: CardType;
  isCollectible?: boolean; // [新增] 构筑白名单标识。若为 false 则普通玩家无法将其加入卡组（不填默认为 true）

  // 英雄机制字段
  associatedSpellKey?: string; // 英雄对应的技能卡Key
  associatedChampionKey?: string; // 技能卡对应的英雄Key
  isLevel2Choice?: boolean; // 是否需要升级后二选一
  choices?: string[]; // [新增] 命运抉择衍生卡的 Key 列表（数据驱动机制的核心引信）
  levelUpCondition?: string; // [新增] 英雄升级条件纯文本描述
  levelUpTarget?: number;    // [新增] 英雄升级进度的目标上限值

  // 运行时状态
  strikeCount: number;
  roundStrikes?: number; // [新增] 本回合打击次数记账本，用于法术动态增伤判定
  customProgress?: number; // [新增] 私人记账本：专门用于记录卡牌在场上“目睹”等局部任务的进度
  // [新增] 'ephemeral_dying' 用于区分瞬息自然消散与常规受击阵亡
  // [修改] 增加 'delayed_attacking' 以支持防守方的滞后反击动画
  animState?: 'idle' | 'attacking' | 'delayed_attacking' | 'hit' | 'dying' | 'ephemeral_dying' | 'transform' | 'regenerating' | 'buff';
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
    step: 'select_ally' | 'select_enemy' | 'select_any' | 'choose_mode';
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
}

export interface UserResources {
    silverCoin: number; // [新增] 通用银 (基础货币)
    dataGold: number;   // 数据金 (免费/活跃货币)
    bitGold: number;    // 比特金 (付费/稀有货币)
}


export interface UserCollection {
  // Key = 卡牌ID, Value = 拥有数量
  ownedCards: Record<string, number>;
  resources: UserResources;
}



export interface SavedDeck {
  id: string;            // 卡组唯一ID (UUID)
  name: string;          // 卡组名称
  hero: string;          // 封面英雄
  cards: Record<string, number>; // 卡牌构成 { 'lyfe': 3 ... }
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
    hand_lv2?: CropConfig;   // [新增] 2级手牌
    bench_lv2?: CropConfig;  // [新增] 2级备战席
    combat_lv2?: CropConfig; // [新增] 2级战场
}

export const GAME_VERSION = '1.4.0';