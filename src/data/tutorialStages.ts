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

    /**
     * 关联的敌方流派 ID（对应 ENEMY_ARCHETYPES 的 key）
     * 仅用于 UI 视觉展示（名字、英雄头像），不再用于牌组生成
     */
    enemyArchetypeId?: string;

    /**
     * ★ 教程关卡敌方固定牌组
     * 教程模式不再通过 archetypes 生成敌方牌组，
     * 每个关卡直接在数据中指定敌我双方要用的牌。
     */
    enemyDeck?: string[];

    /**
     * ★ 教程关卡我方固定牌组
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

    // [2026-09-29 程拍板] 原 `enemyHeroLevel?: number`（敌方英雄等级覆盖）已移除 ——
    //   敌人强度只由装备与迷宫强化控制，不设天启者等级；该字段此前也从未生效（被 GameSession 丢弃）。

    /** 考核目标描述（显示在界面上提示玩家） */
    objectives: string[];

    /**
     * ★ 敌方视觉展示配置（封面背景图用，不参与牌组生成）
     * 如果不设置，则回退到 enemyArchetypeId 的流派视觉
     */
    enemyVisual?: {
        /** 显示名称（如"泰坦·盖弥尔"） */
        displayName: string;
        /** CARD_DB 中的卡牌 key，其卡图将用作封面背景 */
        cardKey: string;
    };

    // ↓ 以下字段已废弃，保留兼容但不使用 ———
    /** @deprecated 教程不再通过 archetype 生成敌方牌组，改用 enemyDeck */
    enemyOverrideDeck?: string[];
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
            'basic_02_spell_speed',
        ],
    },
    {
        id: 'keyword',
        name: '关键词考核',
        description: '熟悉各种关键词能力在对局中的实际效果',
        icon: '📖',
        stageIds: [
            'keyword_01_overwhelm',
            'keyword_02_regeneration',
            'keyword_03_quickattack',
        ],
    },
    {
        id: 'xx',
        name: '天启者考核',
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

        // ★ 教程牌组直接在数据中指定，不经过 archetypes
        playerDeck: ['lyfe', 'fenny'],
        enemyDeck: ['titan_gaimer', 'titan_gaimer'],
        // ★ 封面视觉：显示盖弥尔，不显示流派默认的芬妮
        enemyVisual: {
            displayName: '泰坦·盖弥尔',
            cardKey: 'titan_gaimer',
        },
        playerHeroConfig: {
            heroKey: 'lyfe',
            level: 1,
        },
        disableMulligan: true,
        objectives: [
            '灵活运用进攻与格挡',
            '将敌方水晶生命值削减至 0',
        ],
    },

    // ============================================
    // 基础考核 02：施法的速度
    // ============================================

    basic_02_spell_speed: {
        id: 'basic_02_spell_speed',
        name: '施法的速度',
        description: '学习查看卡牌详情，理解不同法术速度的区别。',
        category: 'basic',
        enemyArchetypeId: 'fenny_pressure',

        // [2026-10-16 莉莉子] 牌库加固：教学全程只用到手牌那张单挑/暗箭，
        //   但牌库**绝不能为空**——回合推进会 `drawCards(1)`，牌库一见底就"疲劳判负"
        //   （见 避坑-教程模式开发 坑 3）。这里补一批与场上英雄不重名的法术，
        //   避免抽到 lyfe/fenny 触发手牌变形系统、干扰教学。
        playerDeck: ['single_combat', 'single_combat', 'hidden_arrow', 'hidden_arrow'],
        // 敌方同理：教学里敌方不抽单位上场（只用剧本指定的单挑），
        //   故垫法术卡而非单位卡——多塞几张纯粹是防"牌库见底触发疲劳判负"。
        enemyDeck: ['single_combat', 'single_combat', 'single_combat'],
        enemyVisual: {
            displayName: '鬼怪·安蒂娜',
            cardKey: 'Ghost_Squad_Antina',
        },
        playerHeroConfig: {
            heroKey: 'lyfe',
            level: 1,
        },
        disableMulligan: true,
        objectives: [
            '查看卡牌详情界面',
            '理解不同速度的法术',
        ],
    },

    // ============================================
    // 关键词考核 01：碾压
    // ============================================

    keyword_01_overwhelm: {
        id: 'keyword_01_overwhelm',
        name: '穿透防线——碾压',
        description: '学习【碾压】关键词：过量伤害穿透格挡者，直击敌方水晶。',
        category: 'keyword',
        enemyArchetypeId: 'fenny_pressure',

        // [2026-08-20 莉莉子 BUG修复] 牌库不能为空：回合推进抽卡时牌库空会触发"疲劳判负"→ 结算面板过早弹出
        playerDeck: ['fenny', 'test_overwhelm', 'fenny', 'test_overwhelm', 'fenny'],
        // [2026-10-17 莉莉子 · 程拍板] 碾压关改造：敌方训练目标全部换成【幻莲音蛇】
        //   —— 0 攻（格挡不反击，我方 1 血碾压单位不会被反杀）+ 3 血（正好被 4 攻打穿，溢出恰好 1 点）。
        //   牌库给足 20 张：既满足"牌库里有很多张"，也彻底排除牌库空触发的疲劳判负
        //   （教程初始化会从牌库扣掉开局布置到备战席的那 6 张，剩 14 张仍绰绰有余）。
        enemyDeck: Array.from({ length: 20 }, () => 'Loka_Phantom_Serpent'),
        enemyVisual: {
            displayName: '幻莲音蛇',
            cardKey: 'Loka_Phantom_Serpent',
        },
        disableMulligan: true,
        objectives: [
            '利用碾压的溢出伤害攻击水晶',
            '击败所有敌人',
        ],
    },

    // ============================================
    // 关键词考核 02：再生
    // ============================================

    keyword_02_regeneration: {
        id: 'keyword_02_regeneration',
        name: '不灭之身——再生',
        description: '学习【再生】关键词：回合开始自动回满血，必须在一回合内击杀。',
        category: 'keyword',
        enemyArchetypeId: 'fenny_pressure',

        // [2026-08-20 莉莉子 BUG修复] 牌库不能为空：回合推进抽卡时牌库空会触发"疲劳判负"→ 结算面板过早弹出
        playerDeck: ['fenny', 'test_overwhelm', 'fenny', 'test_overwhelm', 'fenny'],
        enemyDeck: ['test_regeneration', 'test_frostbite', 'test_regeneration'],
        enemyVisual: {
            displayName: '再生守卫',
            cardKey: 'test_regeneration',
        },
        disableMulligan: true,
        objectives: [
            '体验再生每回合回满血的效果',
            '利用法术和单位集火，在一回合内击杀再生单位',
        ],
    },

    // ============================================
    // 关键词考核 03：快攻
    // ============================================

    keyword_03_quickattack: {
        id: 'keyword_03_quickattack',
        name: '先发制人——快攻',
        description: '学习【先攻】关键词：进攻时先出手，击杀格挡者则不会受到反击。',
        category: 'keyword',
        enemyArchetypeId: 'fenny_pressure',

        // [2026-08-20 莉莉子 BUG修复] 牌库不能为空：回合推进抽卡时牌库空会触发"疲劳判负"→ 结算面板过早弹出
        playerDeck: ['fenny', 'test_quickattack', 'fenny', 'test_overwhelm', 'fenny'],
        enemyDeck: ['test_frostbite', 'titan_gaimer', 'test_frostbite'],
        enemyVisual: {
            displayName: '训练假人',
            cardKey: 'test_frostbite',
        },
        disableMulligan: true,
        objectives: [
            '对比先攻单位与普通单位的进攻差异',
            '利用先攻优势击破敌方水晶',
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
