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

    // [2026-08-11 节点预览·预留] 肉鸽迷宫BUFF id 列表（敌人持有的迷宫BUFF）
    // 后续在开发者工具按「迷宫深度动态难度」配置（越深入 BUFF 越多越稀有；与设置难度/AI难度/普通机密绝密无关）
    // 当前全流派为空，预览显示「暂无迷宫BUFF」空态
    rogueBuffs?: string[];

    // AI 性格倾向 (未来可用于微调 AI 权重)
    aiPersonality: 'aggressive' | 'control' | 'balanced';

    // [已废弃] 教程模式已不再通过 archetype 关联关卡，改用 tutorialStages.ts 直接指定牌组
    // tutorialStageId?: string;  // 2026-06-30: 移除
}

export const ENEMY_ARCHETYPES: Record<string, EnemyArchetype> = {
    'fenny_pressure': {
        id: 'fenny_pressure',
        name: '绝对压力',
        champion: 'fenny',
        description: '以芬妮为核心，携带大量高攻击与打击法术，试图快速通过碾压伤害击溃防线。',
        coreCards: [{ key: 'fenny', count: 6 }, { key: 'destruction', count: 3 }, { key: 'inspire', count: 3 }, { key: 'hidden_arrow', count: 3 }, { key: 'test_overwhelm', count: 3 }, { key: 'Ghost_Squad_Valen', count: 3 }, { key: 'Ghost_Squad_Vez', count: 2 }, { key: 'Ghost_Squad_Antina', count: 2 }, { key: 'Argo_Squad_Arrowhead', count: 2 }, { key: 'Ulster_Squad_Flamme', count: 2 }, { key: 'fenny_support', count: 3 }, { key: 'Bridget_Squad_Chinchilla', count: 2 }, { key: 'Spirit_Squad_Bonnie', count: 1 }, { key: 'Argo_Squad_Pigeon', count: 3 }, { key: 'Argo_Squad_Musician', count: 2 }],
        exactDeck: true,
        preferredPool: [],
        apocalypseTags: ['effect_overwhelm_aura'],
        rogueBuffs: ['ebuff_vanguard', 'ebuff_berserk', 'ebuff_phaseshield'], // [2026-08-11 测试数据] 敌方迷宫强化库（common/rare/epic）
        aiPersonality: 'aggressive',
    },
    'lyfe_blitz': {
        id: 'lyfe_blitz',
        name: '速战速决',
        champion: 'lyfe',
        description: '以里芙为核心，利用低费单位铺场和快速攻击特性，在前期建立优势。',
        coreCards: [{ key: 'lyfe', count: 6 }, { key: 'prayer', count: 3 }, { key: 'focus', count: 3 }, { key: 'single_combat', count: 3 }, { key: 'lyfe_support', count: 3 }, { key: 'Ulster_Squad_Maeve', count: 2 }, { key: 'Ulster_Squad_Koni', count: 3 }, { key: 'Ulster_Squad_Flamme', count: 2 }, { key: 'Messenger_Squad_WALL_E', count: 2 }, { key: 'Messenger_Squad_Ah_Hua', count: 2 }, { key: 'Messenger_Squad_Gena', count: 1 }, { key: 'Bridget_Squad_Chinchilla', count: 2 }, { key: 'Green_Spirit_Squad_Grace', count: 2 }, { key: 'The_Forger_Squad_Leisia', count: 2 }, { key: 'The_Forger_Squad_Tatiana', count: 2 }, { key: 'The_Forger_Squad_White_Hunt', count: 2 }],
        exactDeck: true,
        preferredPool: [],
        apocalypseTags: ['effect_quick_attack_aura'],
        rogueBuffs: ['ebuff_armor', 'ebuff_regen', 'ebuff_wrath'], // [2026-08-11 测试数据] 敌方迷宫强化库（common/rare/epic）
        aiPersonality: 'control',
    },
    'new_archetype_1780988111375': {
        id: 'new_archetype_1780988111375',
        name: '抓不到我',
        champion: 'pupu_specular_soul',
        description: '分身？召唤物？得到新装甲的卜卜如有神助，你能顶住她狂风骤雨般的进攻吗？',
        coreCards: [{ key: 'pupu_specular_soul', count: 6 }, { key: 'Chongye_Squad_Mabel', count: 3 }, { key: 'Chongye_Squad_Elice', count: 3 }, { key: 'Chongye_Squad_Golia', count: 3 }, { key: 'Argo_Squad_Musician', count: 2 }, { key: 'Ghost_Squad_Antina', count: 2 }, { key: 'Messenger_Squad_Ah_Hua', count: 2 }, { key: 'Ulster_Squad_Koni', count: 2 }, { key: 'Ulster_Squad_Maeve', count: 2 }, { key: 'Ulster_Squad_Flamme', count: 2 }, { key: 'pupu_specular_soul_support', count: 1 }, { key: 'Green_Spirit_Squad_Glanz', count: 3 }, { key: 'Green_Spirit_Squad_Grace', count: 3 }, { key: 'SacredChants_Squad_Loka', count: 2 }, { key: 'SacredChants_Squad_European_Angelica', count: 2 }, { key: 'SacredChants_Squad_Shalo', count: 2 }],
        exactDeck: true,
        preferredPool: [],
        apocalypseTags: [],
        rogueBuffs: ['ebuff_vanguard', 'ebuff_berserk', 'ebuff_phaseshield', 'ebuff_wrath', 'ebuff_immortal'], // [2026-08-11 测试数据] 敌方迷宫强化库（全档至 legendary）
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
    'new_archetype_1786176839001': {
        id: 'new_archetype_1786176839001',
        name: '鬼影森森',
        champion: '',
        description: '流派描述...',
        coreCards: [{ key: 'ghostly_shadows', count: 40 }],
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
        coreCards: [{ key: 'titan_mutant', count: 7 }, { key: 'titan_hodu', count: 7 }, { key: 'ghostly_shadows', count: 7 }, { key: 'destruction_ritual', count: 7 }, { key: 'titan_hybrid', count: 7 }, { key: 'bader_reagent', count: 2 }, { key: 'backroom_deal', count: 2 }, { key: 'vitality_supplement', count: 1 }],
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
        coreCards: [{ key: 'fenny', count: 3 }, { key: 'Ulster_Squad_Koni', count: 3 }, { key: 'Ulster_Squad_Maeve', count: 3 }, { key: 'Ulster_Squad_Flamme', count: 3 }, { key: 'Dream_Guardians_Squad_Martina', count: 3 }, { key: 'Dream_Guardians_Squad_Saikui', count: 3 }, { key: 'Dream_Guardians_Squad_Haifa', count: 3 }, { key: 'destruction', count: 1 }, { key: 'Green_Spirit_Squad_Glanz', count: 3 }, { key: 'Green_Spirit_Squad_Eva', count: 3 }, { key: 'Spirit_Squad_Snenika', count: 3 }, { key: 'Danu_Squad_Banshee', count: 3 }, { key: 'Danu_Squad_Wendy', count: 3 }, { key: 'Danu_Squad_SilverArm', count: 3 }],
        exactDeck: true,
        preferredPool: [],
        apocalypseTags: [],
        aiPersonality: 'balanced',
    },
    'new_archetype_1783818399441': {
        id: 'new_archetype_1783818399441',
        name: '鬼来',
        champion: '',
        description: '流派描述...',
        coreCards: [{ key: 'Ghost_Squad_Antina', count: 40 }],
        exactDeck: true,
        preferredPool: [],
        apocalypseTags: [],
        aiPersonality: 'balanced',
    },
    'new_archetype_1783818482191': {
        id: 'new_archetype_1783818482191',
        name: '小队 绿灵',
        champion: '',
        description: '流派描述...',
        coreCards: [{ key: 'Green_Spirit_Squad_Glanz', count: 10 }, { key: 'Green_Spirit_Squad_Eva', count: 10 }, { key: 'Green_Spirit_Squad_Grace', count: 10 }, { key: 'single_combat', count: 2 }, { key: 'hidden_arrow', count: 2 }, { key: 'focus', count: 2 }, { key: 'inspire', count: 2 }, { key: 'destruction', count: 2 }],
        exactDeck: true,
        preferredPool: [],
        apocalypseTags: [],
        aiPersonality: 'balanced',
    },
    'new_archetype_1783818542422': {
        id: 'new_archetype_1783818542422',
        name: '摆完挂机',
        champion: 'mauxir_lotus_drive',
        description: '流派描述...',
        coreCards: [{ key: 'mauxir_lotus_drive', count: 6 }, { key: 'mauxir_lotus_support', count: 3 }, { key: 'Illustration_Squad_Kuranas', count: 3 }, { key: 'Illustration_Squad_Swali', count: 3 }, { key: 'Illustration_Squad_Soline', count: 3 }, { key: 'hidden_arrow', count: 3 }, { key: 'destruction', count: 2 }, { key: 'vitality_regen', count: 2 }, { key: 'backroom_deal', count: 2 }, { key: 'vitality_supplement', count: 2 }, { key: 'bader_reagent', count: 2 }, { key: 'Green_Spirit_Squad_Glanz', count: 3 }, { key: 'Bridget_Squad_Chinchilla', count: 3 }, { key: 'Bridget_Squad_Valerie', count: 3 }],
        exactDeck: true,
        preferredPool: [],
        apocalypseTags: [],
        aiPersonality: 'balanced',
    },
    'new_archetype_1783818651127': {
        id: 'new_archetype_1783818651127',
        name: '小队 提丰',
        champion: '',
        description: '流派描述...',
        coreCards: [{ key: 'Typhoon_Squad_Flameheart', count: 7 }, { key: 'Typhoon_Squad_Dornier', count: 7 }, { key: 'Typhoon_Squad_613', count: 7 }, { key: 'destruction', count: 3 }, { key: 'inspire', count: 3 }, { key: 'focus', count: 3 }, { key: 'single_combat', count: 3 }, { key: 'bader_reagent', count: 3 }, { key: 'backroom_deal', count: 3 }, { key: 'vitality_supplement', count: 1 }],
        exactDeck: true,
        preferredPool: [],
        apocalypseTags: [],
        aiPersonality: 'balanced',
    },
    'new_archetype_1783818709395': {
        id: 'new_archetype_1783818709395',
        name: '小队 精灵',
        champion: '',
        description: '流派描述...',
        coreCards: [{ key: 'Spirit_Squad_Lusaka', count: 7 }, { key: 'Spirit_Squad_Snenika', count: 7 }, { key: 'Spirit_Squad_Bonnie', count: 7 }, { key: 'Ulster_Squad_Koni', count: 3 }, { key: 'Ulster_Squad_Maeve', count: 3 }, { key: 'Ulster_Squad_Flamme', count: 3 }, { key: 'bader_reagent', count: 3 }, { key: 'focus', count: 3 }, { key: 'single_combat', count: 3 }, { key: 'prayer', count: 1 }],
        exactDeck: true,
        preferredPool: [],
        apocalypseTags: [],
        aiPersonality: 'balanced',
    },
    'new_archetype_1783818769594': {
        id: 'new_archetype_1783818769594',
        name: '小队 诗人＆布里吉',
        champion: '',
        description: '流派描述...',
        coreCards: [{ key: 'Poet_Squad_Oisin', count: 3 }, { key: 'Poet_Squad_Caitlin', count: 3 }, { key: 'Poet_Squad_Kelo', count: 3 }, { key: 'Bridget_Squad_Feier', count: 3 }, { key: 'Bridget_Squad_Chinchilla', count: 3 }, { key: 'Bridget_Squad_Valerie', count: 3 }, { key: 'hidden_arrow', count: 1 }, { key: 'inspire', count: 1 }, { key: 'focus', count: 1 }, { key: 'single_combat', count: 1 }, { key: 'prayer', count: 1 }, { key: 'destruction', count: 1 }, { key: 'vitality_regen', count: 1 }, { key: 'backroom_deal', count: 1 }, { key: 'vitality_supplement', count: 1 }, { key: 'energy_supplement', count: 1 }, { key: 'bader_reagent', count: 1 }, { key: 'FanLing_Squad_Wasi', count: 1 }, { key: 'FanLing_Squad_Nafu', count: 1 }, { key: 'FanLing_Squad_Lucia', count: 1 }, { key: 'Amulet_Squad_Peaches', count: 1 }, { key: 'Amulet_Squad_Cattail', count: 1 }, { key: 'Amulet_Squad_Scorching', count: 1 }, { key: 'Messenger_Squad_WALL_E', count: 1 }, { key: 'Messenger_Squad_Gena', count: 1 }, { key: 'Messenger_Squad_Ah_Hua', count: 1 }, { key: 'Dream_Guardians_Squad_Martina', count: 1 }, { key: 'Dream_Guardians_Squad_Saikui', count: 1 }],
        exactDeck: true,
        preferredPool: [],
        apocalypseTags: [],
        aiPersonality: 'balanced',
    },
    'new_archetype_1783818853328': {
        id: 'new_archetype_1783818853328',
        name: '测试开始',
        champion: '',
        description: '流派描述...',
        coreCards: [{ key: 'test_overwhelm', count: 3 }, { key: 'test_quickattack', count: 3 }, { key: 'test_regeneration', count: 3 }, { key: 'test_elusive', count: 3 }, { key: 'test_challenger', count: 3 }, { key: 'test_barrier', count: 3 }, { key: 'test_fearsome', count: 3 }, { key: 'test_scout', count: 3 }, { key: 'test_ephemeral', count: 3 }, { key: 'test_tough', count: 3 }, { key: 'test_thorns', count: 3 }, { key: 'test_volatile', count: 3 }, { key: 'test_titan', count: 3 }, { key: 'destruction', count: 1 }],
        exactDeck: true,
        preferredPool: [],
        apocalypseTags: [],
        aiPersonality: 'balanced',
    },
    'new_archetype_1783818922689': {
        id: 'new_archetype_1783818922689',
        name: '肉搏战',
        champion: '',
        description: '流派描述...',
        coreCards: [{ key: 'Dream_Guardians_Squad_Martina', count: 3 }, { key: 'Dream_Guardians_Squad_Saikui', count: 3 }, { key: 'Dream_Guardians_Squad_Haifa', count: 3 }, { key: 'Ulster_Squad_Koni', count: 3 }, { key: 'Ulster_Squad_Maeve', count: 3 }, { key: 'Ulster_Squad_Flamme', count: 3 }, { key: 'Typhoon_Squad_Flameheart', count: 3 }, { key: 'Typhoon_Squad_Dornier', count: 3 }, { key: 'Typhoon_Squad_613', count: 3 }, { key: 'Messenger_Squad_Ah_Hua', count: 3 }, { key: 'Messenger_Squad_Gena', count: 3 }, { key: 'Messenger_Squad_WALL_E', count: 3 }, { key: 'Amulet_Squad_Scorching', count: 3 }, { key: 'Amulet_Squad_Cattail', count: 3 }, { key: 'Amulet_Squad_Peaches', count: 3 }, { key: 'FanLing_Squad_Lucia', count: 3 }, { key: 'FanLing_Squad_Nafu', count: 3 }, { key: 'FanLing_Squad_Wasi', count: 3 }],
        exactDeck: true,
        preferredPool: [],
        apocalypseTags: [],
        aiPersonality: 'balanced',
    },
    'new_archetype_1783818973258': {
        id: 'new_archetype_1783818973258',
        name: '你说谁是小个子？',
        champion: '',
        description: '流派描述...',
        coreCards: [{ key: 'Elice_scope_robot', count: 3 }, { key: 'Kuranas_Crocodile', count: 3 }, { key: 'Soline_Anubis', count: 3 }, { key: 'Mirror_pupu', count: 3 }, { key: 'Night_Owl', count: 3 }, { key: 'Green_Spirit_Squad_LuggageBot', count: 3 }, { key: 'single_combat', count: 3 }, { key: 'prayer', count: 3 }, { key: 'focus', count: 3 }, { key: 'backroom_deal', count: 3 }, { key: 'vitality_supplement', count: 3 }, { key: 'energy_supplement', count: 3 }, { key: 'bader_reagent', count: 3 }, { key: 'full_purification', count: 1 }],
        exactDeck: true,
        preferredPool: [],
        apocalypseTags: [],
        aiPersonality: 'balanced',
    },
    'new_archetype_1784422245237': {
        id: 'new_archetype_1784422245237',
        name: '小队 达怒',
        champion: '',
        description: '流派描述...',
        coreCards: [{ key: 'Danu_Squad_Banshee', count: 9 }, { key: 'Danu_Squad_Wendy', count: 9 }, { key: 'Danu_Squad_SilverArm', count: 9 }, { key: 'inspire', count: 3 }, { key: 'destruction', count: 3 }, { key: 'bader_reagent', count: 3 }, { key: 'vitality_supplement', count: 3 }, { key: 'backroom_deal', count: 1 }],
        exactDeck: true,
        preferredPool: [],
        apocalypseTags: [],
        aiPersonality: 'balanced',
    },
    'new_archetype_1784422289163': {
        id: 'new_archetype_1784422289163',
        name: '小队 梵音',
        champion: '',
        description: '流派描述...',
        coreCards: [{ key: 'SacredChants_Squad_Loka', count: 9 }, { key: 'SacredChants_Squad_European_Angelica', count: 9 }, { key: 'SacredChants_Squad_Shalo', count: 9 }, { key: 'focus', count: 1 }, { key: 'inspire', count: 1 }, { key: 'single_combat', count: 1 }, { key: 'destruction', count: 1 }, { key: 'backroom_deal', count: 1 }, { key: 'bader_reagent', count: 1 }, { key: 'vitality_supplement', count: 1 }, { key: 'ghostly_shadows', count: 1 }, { key: 'destruction_ritual', count: 1 }, { key: 'toad_pattern', count: 1 }, { key: 'vitality_regen', count: 1 }, { key: 'hidden_arrow', count: 1 }, { key: 'prayer', count: 1 }],
        exactDeck: true,
        preferredPool: [],
        apocalypseTags: [],
        aiPersonality: 'balanced',
    },
    'new_archetype_1784422352488': {
        id: 'new_archetype_1784422352488',
        name: '小队 阿尔戈',
        champion: '',
        description: '流派描述...',
        coreCards: [{ key: 'Argo_Squad_Pigeon', count: 9 }, { key: 'Argo_Squad_Musician', count: 9 }, { key: 'Argo_Squad_Arrowhead', count: 9 }, { key: 'hidden_arrow', count: 1 }, { key: 'inspire', count: 3 }, { key: 'destruction', count: 2 }, { key: 'single_combat', count: 3 }, { key: 'prayer', count: 1 }, { key: 'focus', count: 1 }, { key: 'bader_reagent', count: 1 }, { key: 'backroom_deal', count: 1 }],
        exactDeck: true,
        preferredPool: [],
        apocalypseTags: [],
        aiPersonality: 'balanced',
    },
    'new_archetype_1784422416633': {
        id: 'new_archetype_1784422416633',
        name: '小队 鸦眼',
        champion: '',
        description: '流派描述...',
        coreCards: [{ key: 'Crows_Eyest_Squad_An', count: 8 }, { key: 'Crows_Eyest_Squad_Mulin', count: 8 }, { key: 'Crows_Eyest_Squad_Hiki', count: 8 }, { key: 'hidden_arrow', count: 2 }, { key: 'focus', count: 2 }, { key: 'single_combat', count: 1 }, { key: 'prayer', count: 1 }, { key: 'inspire', count: 2 }, { key: 'destruction', count: 2 }, { key: 'vitality_regen', count: 1 }, { key: 'bader_reagent', count: 2 }, { key: 'ghostly_shadows', count: 1 }, { key: 'destruction_ritual', count: 1 }, { key: 'vitality_supplement', count: 1 }],
        exactDeck: true,
        preferredPool: [],
        apocalypseTags: [],
        aiPersonality: 'balanced',
    },
};
