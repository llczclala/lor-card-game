/**
 * 敌方流派原型定义
 * 这里只定义"特征"，不包含随机生成的具体卡组列表
 */

export interface EnemyArchetype {
    id: string;
    name: string;          // 显示给玩家的流派名
    champion: string;      // 核心英雄 Key
    description: string;   // 描述文本

    // 核心卡牌: 无论随机过程如何，这些牌一定会出现在卡组里
    coreCards: string[];

    // 倾向性填充池: 生成器会优先从这里抽取卡牌来填充卡组
    // 如果这里不够，再去公共池(Logistics)捞
    preferredPool: string[];

    // [预留接口] 绑定的天启/海克斯效果 ID
    // 肉鸽模式下，遇到这个流派时，敌人会获得这些被动
    apocalypseTags: string[];

    // AI 性格倾向 (未来可用于微调 AI 权重)
    aiPersonality: 'aggressive' | 'control' | 'balanced';

    // [新增] 关联的考核关卡 ID（在教程模式中使用此流派作为敌方牌组）
    tutorialStageId?: string;
}

export const ENEMY_ARCHETYPES: Record<string, EnemyArchetype> = {
    'fenny_pressure': {
        id: 'fenny_pressure',
        name: '绝对压力',
        champion: 'fenny',
        description: '以芬妮为核心，携带大量高攻击与打击法术，试图快速通过碾压伤害击溃防线。',
        coreCards: ['fenny', 'fenny', 'fenny', 'destruction', 'destruction', 'destruction', 'inspire', 'inspire', 'inspire', 'hidden_arrow', 'hidden_arrow', 'hidden_arrow'],
        preferredPool: ['Typhoon_Squad_Dornier', 'Ghost_Squad_Valen', 'Ghost_Squad_Vez', 'Ghost_Squad_Antina', 'Messenger_Squad_WALL_E', 'Messenger_Squad_Gena', 'Messenger_Squad_Ah_Hua', 'Typhoon_Squad_613', 'Typhoon_Squad_Flameheart', 'Argo_Squad_Arrowhead', 'Argo_Squad_Musician', 'Argo_Squad_Pigeon', 'Star_Bright_Squad_Dakors', 'Mingyi_Squad_Zhe_hao', 'Mingyi_Squad_Zhu_He', 'Mingyi_Squad_Jin_Lang', 'Star_Bright_Squad_Doveil', 'Star_Bright_Squad_Alivy', 'Ulster_Squad_Flamme', 'Ulster_Squad_Maeve', 'Ulster_Squad_Koni', 'Dream_Guardians_Squad_Haifa', 'Dream_Guardians_Squad_Saikui', 'Dream_Guardians_Squad_Martina'],
        apocalypseTags: ['effect_overwhelm_aura'],
        aiPersonality: 'aggressive',
    },
    'lyfe_blitz': {
        id: 'lyfe_blitz',
        name: '速战速决',
        champion: 'lyfe',
        description: '以里芙为核心，利用低费单位铺场和快速攻击特性，在前期建立优势。',
        coreCards: ['lyfe', 'lyfe', 'lyfe', 'prayer', 'prayer', 'prayer', 'focus', 'focus', 'focus', 'single_combat', 'single_combat', 'single_combat'],
        preferredPool: ['Dream_Guardians_Squad_Saikui', 'Dream_Guardians_Squad_Haifa', 'Ulster_Squad_Koni', 'Ulster_Squad_Maeve', 'Ulster_Squad_Flamme', 'Star_Bright_Squad_Alivy', 'Star_Bright_Squad_Doveil', 'Mingyi_Squad_Jin_Lang', 'Mingyi_Squad_Zhu_He', 'Mingyi_Squad_Zhe_hao', 'Star_Bright_Squad_Dakors', 'Argo_Squad_Pigeon', 'Argo_Squad_Musician', 'Argo_Squad_Arrowhead', 'Typhoon_Squad_Flameheart', 'Typhoon_Squad_Dornier', 'Typhoon_Squad_613', 'Messenger_Squad_Ah_Hua', 'Messenger_Squad_Gena', 'Messenger_Squad_WALL_E', 'Ghost_Squad_Valen', 'Ghost_Squad_Vez', 'Ghost_Squad_Antina'],
        apocalypseTags: ['effect_quick_attack_aura'],
        aiPersonality: 'control',
    },
    'new_archetype_1780988111375': {
        id: 'new_archetype_1780988111375',
        name: '抓不到我',
        champion: 'pupu_specular_soul',
        description: '分身？召唤物？得到新装甲的卜卜如有神助，你能顶住她狂风骤雨般的进攻吗？',
        coreCards: ['pupu_specular_soul', 'pupu_specular_soul', 'pupu_specular_soul', 'Chongye_Squad_Mabel', 'Chongye_Squad_Mabel', 'Chongye_Squad_Mabel', 'Chongye_Squad_Elice', 'Chongye_Squad_Elice', 'Chongye_Squad_Elice', 'Chongye_Squad_Golia', 'Chongye_Squad_Golia', 'Chongye_Squad_Golia'],
        preferredPool: ['Ghost_Squad_Valen', 'Ghost_Squad_Vez', 'Ghost_Squad_Antina', 'Messenger_Squad_WALL_E', 'Messenger_Squad_Gena', 'Messenger_Squad_Ah_Hua', 'Typhoon_Squad_613', 'Typhoon_Squad_Dornier', 'Typhoon_Squad_Flameheart', 'Argo_Squad_Arrowhead', 'Argo_Squad_Musician', 'Argo_Squad_Pigeon', 'Star_Bright_Squad_Dakors', 'Star_Bright_Squad_Alivy', 'Star_Bright_Squad_Doveil', 'Mingyi_Squad_Jin_Lang', 'Mingyi_Squad_Zhu_He', 'Mingyi_Squad_Zhe_hao', 'Ulster_Squad_Flamme', 'Ulster_Squad_Maeve', 'Ulster_Squad_Koni', 'Dream_Guardians_Squad_Haifa', 'Dream_Guardians_Squad_Saikui'],
        apocalypseTags: [],
        aiPersonality: 'balanced',
    },
};