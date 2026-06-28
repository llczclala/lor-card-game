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
    // [核心升级] 支持 { key, count } 的工业级压缩写法，兼容旧版 string[] 写法
    coreCards: string[] | { key: string; count: number }[];

    // [核心新增] 绝对纯净锁：若开启，系统将放弃 40 张自动填充底线，严禁任何杂牌混入！
    exactDeck?: boolean;

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
        coreCards: [{ key: 'fenny', count: 6 }, { key: 'destruction', count: 3 }, { key: 'inspire', count: 3 }, { key: 'hidden_arrow', count: 3 }, { key: 'test_overwhelm', count: 3 }, { key: 'Ghost_Squad_Valen', count: 3 }, { key: 'Ghost_Squad_Vez', count: 3 }, { key: 'Ghost_Squad_Antina', count: 3 }, { key: 'Argo_Squad_Arrowhead', count: 3 }, { key: 'Ulster_Squad_Flamme', count: 3 }, { key: 'test_challenger', count: 3 }, { key: 'fenny_support', count: 4 }],
        exactDeck: true,
        preferredPool: [],
        apocalypseTags: ['effect_overwhelm_aura'],
        aiPersonality: 'aggressive',
    },
    'lyfe_blitz': {
        id: 'lyfe_blitz',
        name: '速战速决',
        champion: 'lyfe',
        description: '以里芙为核心，利用低费单位铺场和快速攻击特性，在前期建立优势。',
        coreCards: [{ key: 'lyfe', count: 6 }, { key: 'prayer', count: 3 }, { key: 'focus', count: 3 }, { key: 'single_combat', count: 3 }, { key: 'lyfe_support', count: 3 }, { key: 'Ulster_Squad_Maeve', count: 3 }, { key: 'Ulster_Squad_Koni', count: 3 }, { key: 'Ulster_Squad_Flamme', count: 3 }, { key: 'test_regeneration', count: 3 }, { key: 'test_barrier', count: 3 }, { key: 'Messenger_Squad_WALL_E', count: 3 }, { key: 'Messenger_Squad_Ah_Hua', count: 3 }, { key: 'Messenger_Squad_Gena', count: 1 }],
        exactDeck: true,
        preferredPool: [],
        apocalypseTags: ['effect_quick_attack_aura'],
        aiPersonality: 'control',
    },
    'new_archetype_1780988111375': {
        id: 'new_archetype_1780988111375',
        name: '抓不到我',
        champion: 'pupu_specular_soul',
        description: '分身？召唤物？得到新装甲的卜卜如有神助，你能顶住她狂风骤雨般的进攻吗？',
        coreCards: [{ key: 'pupu_specular_soul', count: 6 }, { key: 'Chongye_Squad_Mabel', count: 3 }, { key: 'Chongye_Squad_Elice', count: 3 }, { key: 'Chongye_Squad_Golia', count: 3 }, { key: 'test_quickattack', count: 3 }, { key: 'test_elusive', count: 3 }, { key: 'Argo_Squad_Musician', count: 3 }, { key: 'Ghost_Squad_Antina', count: 3 }, { key: 'Messenger_Squad_Ah_Hua', count: 3 }, { key: 'Ulster_Squad_Koni', count: 3 }, { key: 'Ulster_Squad_Maeve', count: 3 }, { key: 'Ulster_Squad_Flamme', count: 3 }, { key: 'pupu_specular_soul_support', count: 1 }],
        exactDeck: true,
        preferredPool: [],
        apocalypseTags: [],
        aiPersonality: 'balanced',
    },
    'new_archetype_1781936210296': {
        id: 'new_archetype_1781936210296',
        name: '倒计时7回合',
        champion: '',
        description: '七个回合后，不是你死就是我亡，会赢吗？会赢的',
        coreCards: [{ key: 'destruction', count: 40 }],
        exactDeck: true,
        preferredPool: [],
        apocalypseTags: [],
        aiPersonality: 'aggressive',
    },
    'new_archetype_1781936294028': {
        id: 'new_archetype_1781936294028',
        name: '泰坦降临',
        champion: '',
        description: '流派描述...',
        coreCards: [{ key: 'titan_mutant', count: 20 }, { key: 'titan_hodu', count: 10 }, { key: 'titan_type_c_mutant', count: 10 }],
        exactDeck: true,
        preferredPool: [],
        apocalypseTags: [],
        aiPersonality: 'balanced',
    },
    'new_archetype_1781945593790': {
        id: 'new_archetype_1781945593790',
        name: '肆意开火',
        champion: '',
        description: '流派描述...',
        coreCards: [{ key: 'hidden_arrow', count: 40 }],
        exactDeck: true,
        preferredPool: [],
        apocalypseTags: [],
        aiPersonality: 'balanced',
    },
    'new_archetype_1782607204289': {
        id: 'new_archetype_1782607204289',
        name: '坚强',
        champion: '',
        description: '流派描述...',
        coreCards: [{ key: 'fenny', count: 3 }, { key: 'Ulster_Squad_Koni', count: 3 }, { key: 'Ulster_Squad_Maeve', count: 3 }, { key: 'Ulster_Squad_Flamme', count: 3 }, { key: 'Dream_Guardians_Squad_Martina', count: 3 }, { key: 'Dream_Guardians_Squad_Saikui', count: 3 }, { key: 'Dream_Guardians_Squad_Haifa', count: 3 }, { key: 'Ghost_Squad_Vez', count: 3 }, { key: 'Ghost_Squad_Valen', count: 3 }, { key: 'Ghost_Squad_Antina', count: 3 }, { key: 'test_regeneration', count: 3 }, { key: 'test_tough', count: 3 }, { key: 'test_barrier', count: 3 }, { key: 'destruction', count: 1 }],
        exactDeck: true,
        preferredPool: [],
        apocalypseTags: [],
        aiPersonality: 'balanced',
    },
};
