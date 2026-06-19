/**
 * 教程模式 · 考核关卡数据
 *
 * 定义三大考核分类及其下属的所有关卡。
 * 每个关卡关联一个敌方流派（Archetype），
 * 也可选择性地固定玩家/敌方卡组。
 *
 * 在敌方牌组编辑器中可以为 Archetype 分配绑定的考核关卡。
 */

// ============================================================
// 类型定义
// ============================================================

/** 考核分类 ID */
export type ExamCategoryId = 'basic' | 'keyword' | 'xx';

/** 考核分类定义 */
export interface ExamCategory {
    id: ExamCategoryId;
    name: string;           // 显示名称，如"基础考核"
    description: string;    // 分类简介
    icon: string;           // 图标 emoji 或字符
    stageIds: string[];     // 下属关卡 ID 列表（有序）
}

/** 单个考核关卡 */
export interface TutorialStage {
    id: string;
    name: string;               // 关卡名，如"进攻！出击！"
    description: string;        // 关卡描述
    category: ExamCategoryId;   // 所属分类

    /** 关联的敌方流派 ID（对应 ENEMY_ARCHETYPES 的 key） */
    enemyArchetypeId: string;

    /**
     * 可选：固定敌方卡组
     * 若设置此项，将忽略 archetype 的随机生成逻辑，直接使用此数组作为敌方牌库
     */
    enemyOverrideDeck?: string[];

    /**
     * 可选：固定玩家卡组
     * 若设置此项，将使用此固定牌组而非玩家自组卡组
     * 适合新手关卡——给一套预组牌让玩家上手
     */
    playerDeck?: string[];

    /** 可选：玩家方英雄配置 */
    playerHeroConfig?: {
        heroKey: string;
        level: number;
    };

    /** 是否禁用开局换牌（新手关卡建议 true） */
    disableMulligan?: boolean;

    /** 可选：敌方英雄等级覆盖（默认 1） */
    enemyHeroLevel?: number;

    /** 考核目标描述（显示在界面上提示玩家） */
    objectives: string[];
}

// ============================================================
// 考核分类定义
// ============================================================

export const EXAM_CATEGORIES: ExamCategory[] = [
    {
        id: 'basic',
        name: '基础考核',
        description: '掌握对局的基本规则：出牌、进攻、格挡、取胜',
        icon: '⚔️',
        stageIds: [
            'basic_01_victory',
        ],
    },
    {
        id: 'keyword',
        name: '关键词考核',
        description: '熟悉各种关键词能力在对局中的实际效果',
        icon: '📖',
        stageIds: [
            // TODO: 关键词考核关卡待补充
        ],
    },
    {
        id: 'xx',
        name: 'XX考核',
        description: '敬请期待',
        icon: '🔒',
        stageIds: [
            // TODO: 预留考核关卡待补充
        ],
    },
];

// ============================================================
// 关卡定义
// ============================================================

export const TUTORIAL_STAGES: Record<string, TutorialStage> = {
    // ============================================
    // 基础考核
    // ============================================

    basic_01_victory: {
        id: 'basic_01_victory',
        name: '战斗与胜利',
        description: '综合运用出击与格挡，击败敌方取得对局胜利。',
        category: 'basic',
        enemyArchetypeId: 'fenny_pressure',

        // 给一套平衡的混合牌组，让玩家自由发挥
        playerDeck: [
            'fenny', 'fenny',
            'lyfe', 'lyfe',
            'fenny_strike', 'fenny_strike',
            'prayer', 'prayer',
            'test_impact', 'test_impact',
            'test_volatile', 'test_volatile',
        ],
        playerHeroConfig: {
            heroKey: 'fenny',
            level: 1,
        },
        disableMulligan: true,
        enemyHeroLevel: 1,
        objectives: [
            '灵活运用进攻与格挡',
            '将敌方水晶生命值削减至 0',
        ],
    },
};

// ============================================================
// 辅助函数
// ============================================================

/** 获取指定分类下的所有关卡 */
export const getStagesByCategory = (categoryId: ExamCategoryId): TutorialStage[] => {
    const category = EXAM_CATEGORIES.find(c => c.id === categoryId);
    if (!category) return [];
    return category.stageIds
        .map(id => TUTORIAL_STAGES[id])
        .filter((s): s is TutorialStage => !!s);
};

/** 获取分类信息 */
export const getCategoryById = (categoryId: ExamCategoryId): ExamCategory | undefined => {
    return EXAM_CATEGORIES.find(c => c.id === categoryId);
};
