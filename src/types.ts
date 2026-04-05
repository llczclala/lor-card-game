export type Region = 'Lyfe' | 'Fenny' | 'Logistics' | 'TEST';
export type CardType = 'unit' | 'spell-burst' | 'spell-fast' | 'spell-slow';
// 完整的 36 个关键词定义
export type Keyword =
    | 'Overwhelm' | 'QuickAttack' | 'Regeneration' | 'Elusive' | 'Challenger' | 'CantBlock'
    | 'Barrier' | 'Lifesteal' | 'Last Breath' | 'Fearsome' | 'Frostbite' | 'Tough'
    | 'Scout' | 'Ephemeral' | 'Stun' | 'Double Attack' | 'Support' | 'Deadly'
    | 'SpellShield' | 'Silence' | 'Berserk' | 'Cleave' | 'Thorns' | 'Vanguard'
    | 'Ambush' | 'Plunder' | 'Exposed' | 'Shroud' | 'Immobile' | 'Reborn'
    | 'Execute' | 'Sniper' | 'Volatile' | 'Echo' | 'Impact' | 'Channel';

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

  // 英雄机制字段
  associatedSpellKey?: string; // 英雄对应的技能卡Key
  associatedChampionKey?: string; // 技能卡对应的英雄Key
  isLevel2Choice?: boolean; // 是否需要升级后二选一

  // 运行时状态
  strikeCount: number;
  animState?: 'idle' | 'attacking' | 'hit' | 'dying' | 'transform' | 'regenerating';
  damageTaken?: number;
  buffs?: { power: number, health: number };
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
  phase: 'main' | 'attack_declare' | 'block_declare' | 'resolution' | 'animating' | 'mulligan';
  turnOwner: 'player' | 'enemy';
  consecutivePasses: number;

  spellCasting: null | {
    cardId: string;
    step: 'select_ally' | 'select_enemy' | 'select_any' | 'choose_mode';
    allyId?: string;
    targets: any[];
  };
  spellStack: SpellStackItem[];
  gameResult: 'victory' | 'defeat' | null;

  screenShake?: boolean;
  nexusDamage?: { target: 'player' | 'enemy', amount: number };

  leveledChampions: string[];
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