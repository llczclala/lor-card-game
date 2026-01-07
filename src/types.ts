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
  phase: 'main' | 'attack_declare' | 'block_declare' | 'resolution' | 'animating';
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
}
// --- [新增] 用户系统相关接口 ---

export interface UserSummary {
  uid: string; // 用户唯一ID
  displayName: string; // 用户显示名称
  avatarId: string; // 头像ID（与 UserProfile 中的 avatarId 类型一致）
  lastLoginAt: number; // 最后登录时间戳
  type: 'full' | 'starter'; // 用户模式（全卡/初始卡）
}

export interface UserProfile {
  uid: string;           // 用户唯一ID
  displayName: string;   // 显示昵称 (如 "分析员#1234")
  level: number;         // 玩家等级
  exp: number;           // 当前经验值
  avatarId: string;      // 头像ID
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

export interface UserCollection {
  // Key = 卡牌ID, Value = 拥有数量
  ownedCards: Record<string, number>;

  resources: {
    dataGold: number;    // 数据金 (抽卡)
    bitGold: number;     // 比特金 (购买)
  };
}

export interface SavedDeck {
  id: string;            // 卡组唯一ID (UUID)
  name: string;          // 卡组名称
  hero: string;          // 封面英雄
  cards: Record<string, number>; // 卡牌构成 { 'lyfe': 3 ... }
  createdAt: number;
  updatedAt: number;
}

export const GAME_VERSION = '1.4.0';