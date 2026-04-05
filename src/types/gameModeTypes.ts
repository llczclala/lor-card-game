import type { CardData } from './types';

/**
 * 游戏模式枚举
 */
export type GameModeType = 'standard' | 'tutorial' | 'roguelike';

/**
 * AI 行为类型
 */
export type AIType =
    | 'standard'   // 标准 AI (正常打牌、进攻、格挡)
    | 'passive'    // 被动 AI (只会挨打，用于测试)
    | 'scripted'   // 脚本 AI (完全按剧本行动，用于教程)
    | 'boss';      // Boss AI (可能会有特殊机制，如每回合固定触发技能)

/**
 * 敌方英雄配置 (用于覆盖默认行为)
 */
export interface EnemyHeroConfig {
    heroKey: string;      // 英雄ID (如 'fenny', 'lyfe')
    level: number;        // 初始等级 (1 或 2)
    customName?: string;  // 自定义名字 (如 "教官 芬妮", "噩梦 芬妮")
    hpMultiplier?: number;// 血量倍率 (用于 Boss 战，例如 1.5 倍血量)
}

/**
 * [肉鸽特供] 配置接口
 * 只有 mode === 'roguelike' 时才需要检查此字段
 */
export interface RoguelikeConfig {
    stage: number;             // 当前层数
    difficulty: number;        // 难度系数
    playerHpInherited: number; // 玩家继承血量
    // 天启/海克斯列表 (预留接口，暂存 ID 字符串)
    playerRelics: string[];
    enemyRelics: string[];
}

/**
 * [教程特供] 配置接口
 */
export interface TutorialConfig {
    tutorialId: string;
    stepIndex: number;
    // 脚本动作队列 (预留)
    scriptedActions?: any[];
}

/**
 * 核心对局配置接口 (Game Session Configuration)
 * GameSession 将依赖此接口来初始化战场，而不关心具体的模式来源
 */
export interface GameSessionConfig {
    // --- 核心标识 ---
    mode: GameModeType;

    // --- 敌方配置 (这是"大厨"做好的菜) ---
    enemyDeck: string[];           // 最终生成的敌方卡组 ID 列表
    enemyHeroConfig?: EnemyHeroConfig;

    // --- 规则参数 ---
    aiType: AIType;
    initialMana?: number;          // 初始法力 (默认为 1)
    disableMulligan?: boolean;     // 是否禁用开局换牌 (教程通常禁用，PVE/肉鸽开启)

    // --- 模式特有数据 ---
    roguelikeConfig?: RoguelikeConfig;
    tutorialConfig?: TutorialConfig;

    // --- 流程回调 (由 Wrapper 注入) ---
    // GameSession 在游戏结束时调用这些回调，具体的跳转逻辑(回大厅/下一关)由 Wrapper 决定
    onVictory: () => void;
    onDefeat: () => void;
}