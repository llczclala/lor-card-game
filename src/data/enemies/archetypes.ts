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

    // [2026-08-17 莉莉子] 敌方卡背索引（开发者工具「敌方卡组编辑器」可配置）
    // 未配置(undefined) → 对局中敌方使用默认卡背(0)；配置后敌我卡背分离
    cardBackIndex?: number;

    // [2026-08-29 程拍板] 地图敌人头像（固定卡 key，编辑器「敌方头像」可配）
    // 未配置(undefined) → 从流派池随机抽代表卡当头像；配置后肉鸽地图/节点预览固定显示该卡
    avatarKey?: string;

    // [2026-08-29 程拍板] 战斗加载界面卡面（固定卡 key，编辑器「加载界面卡面」可配）
    // 未配置(undefined) → 用敌人英雄/核心卡；配置后战斗加载界面固定显示该卡面（修碎图）
    loadingCardKey?: string;

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
        rogueBuffs: [],
        aiPersonality: 'aggressive',
        cardBackIndex: 4, // [2026-08-17 莉莉子] 敌方卡背
        avatarKey: 'fenny', // [2026-08-29] 地图头像
        loadingCardKey: 'fenny', // [2026-08-29] 加载卡面
    },
    'lyfe_blitz': {
        id: 'lyfe_blitz',
        name: '速战速决',
        champion: 'lyfe',
        description: '以里芙为核心，利用低费单位铺场和先攻特性，在前期建立优势。',
        coreCards: [{ key: 'lyfe', count: 6 }, { key: 'prayer', count: 3 }, { key: 'focus', count: 3 }, { key: 'single_combat', count: 3 }, { key: 'lyfe_support', count: 3 }, { key: 'Ulster_Squad_Maeve', count: 2 }, { key: 'Ulster_Squad_Koni', count: 3 }, { key: 'Ulster_Squad_Flamme', count: 2 }, { key: 'Messenger_Squad_WALL_E', count: 2 }, { key: 'Messenger_Squad_Ah_Hua', count: 2 }, { key: 'Messenger_Squad_Gena', count: 1 }, { key: 'Bridget_Squad_Chinchilla', count: 2 }, { key: 'Green_Spirit_Squad_Grace', count: 2 }, { key: 'The_Forger_Squad_Leisia', count: 2 }, { key: 'The_Forger_Squad_Tatiana', count: 2 }, { key: 'The_Forger_Squad_White_Hunt', count: 2 }],
        exactDeck: true,
        preferredPool: [],
        apocalypseTags: ['effect_quick_attack_aura'],
        rogueBuffs: [],
        aiPersonality: 'control',
        cardBackIndex: 5, // [2026-08-17 莉莉子] 敌方卡背
        avatarKey: 'lyfe', // [2026-08-29] 地图头像
        loadingCardKey: 'lyfe', // [2026-08-29] 加载卡面
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
        rogueBuffs: [],
        aiPersonality: 'balanced',
        cardBackIndex: 6, // [2026-08-17 莉莉子] 敌方卡背
        avatarKey: 'pupu_specular_soul', // [2026-08-29] 地图头像
        loadingCardKey: 'pupu_specular_soul', // [2026-08-29] 加载卡面
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
        rogueBuffs: [],
        aiPersonality: 'aggressive',
        cardBackIndex: 0, // [2026-08-17 莉莉子] 敌方卡背
        avatarKey: 'destruction', // [2026-08-29] 地图头像
        loadingCardKey: 'destruction', // [2026-08-29] 加载卡面
    },
    'new_archetype_1781936294028': {
        id: 'new_archetype_1781936294028',
        name: '泰坦降临',
        champion: '',
        description: '泰坦生态的倾泻。成群异化体配上「鬼影森森」与「毁灭仪式」，不讲配合、只讲体量，用最原始的数量把你压垮。',
        coreCards: [{ key: 'titan_mutant', count: 7 }, { key: 'titan_hodu', count: 7 }, { key: 'ghostly_shadows', count: 7 }, { key: 'destruction_ritual', count: 7 }, { key: 'titan_hybrid', count: 7 }, { key: 'bader_reagent', count: 2 }, { key: 'backroom_deal', count: 2 }, { key: 'vitality_supplement', count: 1 }],
        exactDeck: true,
        preferredPool: [],
        apocalypseTags: [],
        rogueBuffs: [],
        aiPersonality: 'balanced',
        cardBackIndex: 0, // [2026-08-17 莉莉子] 敌方卡背
        avatarKey: 'ghostly_shadows', // [2026-08-29] 地图头像
        loadingCardKey: 'titan_mutant', // [2026-08-29] 加载卡面
    },
    'new_archetype_1782607204289': {
        id: 'new_archetype_1782607204289',
        name: '坚强',
        champion: '',
        description: '一支打不死的队伍。全员高耐久单位轮番上场，没有花哨的配合，只有一个字——熬。谁先撑不住，谁就输。',
        coreCards: [{ key: 'fenny', count: 3 }, { key: 'Ulster_Squad_Koni', count: 3 }, { key: 'Ulster_Squad_Maeve', count: 3 }, { key: 'Ulster_Squad_Flamme', count: 3 }, { key: 'Dream_Guardians_Squad_Martina', count: 3 }, { key: 'Dream_Guardians_Squad_Saikui', count: 3 }, { key: 'Dream_Guardians_Squad_Haifa', count: 3 }, { key: 'destruction', count: 1 }, { key: 'Green_Spirit_Squad_Glanz', count: 3 }, { key: 'Green_Spirit_Squad_Eva', count: 3 }, { key: 'Spirit_Squad_Snenika', count: 3 }, { key: 'Danu_Squad_Banshee', count: 3 }, { key: 'Danu_Squad_Wendy', count: 3 }, { key: 'Danu_Squad_SilverArm', count: 3 }],
        exactDeck: true,
        preferredPool: [],
        apocalypseTags: [],
        rogueBuffs: [],
        aiPersonality: 'balanced',
        cardBackIndex: 0, // [2026-08-17 莉莉子] 敌方卡背
        avatarKey: 'Ulster_Squad_Koni', // [2026-08-29] 地图头像
        loadingCardKey: 'Ulster_Squad_Koni', // [2026-08-29] 加载卡面
    },
    'new_archetype_1783818399441': {
        id: 'new_archetype_1783818399441',
        name: '鬼来',
        champion: '',
        description: '安蒂娜，安蒂娜，还是安蒂娜。整副牌只有她一个人，但这一张，就够你头疼很久了。',
        coreCards: [{ key: 'Ghost_Squad_Antina', count: 40 }],
        exactDeck: true,
        preferredPool: [],
        apocalypseTags: [],
        rogueBuffs: [],
        aiPersonality: 'balanced',
        cardBackIndex: 0, // [2026-08-17 莉莉子] 敌方卡背
        avatarKey: 'Ghost_Squad_Antina', // [2026-08-29] 地图头像
        loadingCardKey: 'Ghost_Squad_Antina', // [2026-08-29] 加载卡面
    },
    'new_archetype_1783818482191': {
        id: 'new_archetype_1783818482191',
        name: '小队 绿灵',
        champion: '',
        description: '「绿灵」小队全体出动。三名队员各带十张，靠数量一层层把阵线滚起来，压得你喘不过气。',
        coreCards: [{ key: 'Green_Spirit_Squad_Glanz', count: 10 }, { key: 'Green_Spirit_Squad_Eva', count: 10 }, { key: 'Green_Spirit_Squad_Grace', count: 10 }, { key: 'single_combat', count: 2 }, { key: 'hidden_arrow', count: 2 }, { key: 'focus', count: 2 }, { key: 'inspire', count: 2 }, { key: 'destruction', count: 2 }],
        exactDeck: true,
        preferredPool: [],
        apocalypseTags: [],
        rogueBuffs: [],
        aiPersonality: 'balanced',
        cardBackIndex: 0, // [2026-08-17 莉莉子] 敌方卡背
        avatarKey: 'Green_Spirit_Squad_Glanz', // [2026-08-29] 地图头像
        loadingCardKey: 'Green_Spirit_Squad_Glanz', // [2026-08-29] 加载卡面
    },
    'new_archetype_1783818542422': {
        id: 'new_archetype_1783818542422',
        name: '摆完挂机',
        champion: 'mauxir_lotus_drive',
        description: '把场面摆好，然后就可以去泡杯茶了。猫汐尔与图征小队的莲驱体系会自行运转——你不主动破局，就只能等着被慢慢磨死。',
        coreCards: [{ key: 'mauxir_lotus_drive', count: 6 }, { key: 'mauxir_lotus_support', count: 3 }, { key: 'Illustration_Squad_Kuranas', count: 3 }, { key: 'Illustration_Squad_Swali', count: 3 }, { key: 'Illustration_Squad_Soline', count: 3 }, { key: 'hidden_arrow', count: 3 }, { key: 'destruction', count: 2 }, { key: 'vitality_regen', count: 2 }, { key: 'backroom_deal', count: 2 }, { key: 'vitality_supplement', count: 2 }, { key: 'bader_reagent', count: 2 }, { key: 'Green_Spirit_Squad_Glanz', count: 3 }, { key: 'Bridget_Squad_Chinchilla', count: 3 }, { key: 'Bridget_Squad_Valerie', count: 3 }],
        exactDeck: true,
        preferredPool: [],
        apocalypseTags: [],
        rogueBuffs: [],
        aiPersonality: 'balanced',
        cardBackIndex: 16, // [2026-08-17 莉莉子] 敌方卡背
        avatarKey: 'mauxir_lotus_drive', // [2026-08-29] 地图头像
        loadingCardKey: 'mauxir_lotus_drive', // [2026-08-29] 加载卡面
    },
    'new_archetype_1783818651127': {
        id: 'new_archetype_1783818651127',
        name: '小队 提丰',
        champion: '',
        description: '「提丰」小队三人成军。燃烧、装甲、信号——三种截然不同的战斗方式被塞进同一副牌里，你很难同时防住。',
        coreCards: [{ key: 'Typhoon_Squad_Flameheart', count: 7 }, { key: 'Typhoon_Squad_Dornier', count: 7 }, { key: 'Typhoon_Squad_613', count: 7 }, { key: 'destruction', count: 3 }, { key: 'inspire', count: 3 }, { key: 'focus', count: 3 }, { key: 'single_combat', count: 3 }, { key: 'bader_reagent', count: 3 }, { key: 'backroom_deal', count: 3 }, { key: 'vitality_supplement', count: 1 }],
        exactDeck: true,
        preferredPool: [],
        apocalypseTags: [],
        rogueBuffs: [],
        aiPersonality: 'balanced',
        cardBackIndex: 0, // [2026-08-17 莉莉子] 敌方卡背
        avatarKey: 'Typhoon_Squad_613', // [2026-08-29] 地图头像
        loadingCardKey: 'Typhoon_Squad_613', // [2026-08-29] 加载卡面
    },
    'new_archetype_1783818709395': {
        id: 'new_archetype_1783818709395',
        name: '小队 精灵',
        champion: '',
        description: '「精灵」小队与「阿尔斯特」小队联手。前者负责稳住场面，后者负责收尾，两队的节奏咬得极紧。',
        coreCards: [{ key: 'Spirit_Squad_Lusaka', count: 7 }, { key: 'Spirit_Squad_Snenika', count: 7 }, { key: 'Spirit_Squad_Bonnie', count: 7 }, { key: 'Ulster_Squad_Koni', count: 3 }, { key: 'Ulster_Squad_Maeve', count: 3 }, { key: 'Ulster_Squad_Flamme', count: 3 }, { key: 'bader_reagent', count: 3 }, { key: 'focus', count: 3 }, { key: 'single_combat', count: 3 }, { key: 'prayer', count: 1 }],
        exactDeck: true,
        preferredPool: [],
        apocalypseTags: [],
        rogueBuffs: [],
        aiPersonality: 'balanced',
        cardBackIndex: 0, // [2026-08-17 莉莉子] 敌方卡背
        avatarKey: 'Spirit_Squad_Bonnie', // [2026-08-29] 地图头像
        loadingCardKey: 'Spirit_Squad_Bonnie', // [2026-08-29] 加载卡面
    },
    'new_archetype_1783818769594': {
        id: 'new_archetype_1783818769594',
        name: '小队 诗人＆布里吉',
        champion: '',
        description: '「诗人」与「布里吉」两队挂帅，身后还跟着几乎所有小队的代表各一名——一副名副其实的联军牌组。',
        coreCards: [{ key: 'Poet_Squad_Oisin', count: 3 }, { key: 'Poet_Squad_Caitlin', count: 3 }, { key: 'Poet_Squad_Kelo', count: 3 }, { key: 'Bridget_Squad_Feier', count: 3 }, { key: 'Bridget_Squad_Chinchilla', count: 3 }, { key: 'Bridget_Squad_Valerie', count: 3 }, { key: 'hidden_arrow', count: 1 }, { key: 'inspire', count: 1 }, { key: 'focus', count: 1 }, { key: 'single_combat', count: 1 }, { key: 'prayer', count: 1 }, { key: 'destruction', count: 1 }, { key: 'vitality_regen', count: 1 }, { key: 'backroom_deal', count: 1 }, { key: 'vitality_supplement', count: 1 }, { key: 'energy_supplement', count: 1 }, { key: 'bader_reagent', count: 1 }, { key: 'FanLing_Squad_Wasi', count: 1 }, { key: 'FanLing_Squad_Nafu', count: 1 }, { key: 'FanLing_Squad_Lucia', count: 1 }, { key: 'Amulet_Squad_Peaches', count: 1 }, { key: 'Amulet_Squad_Cattail', count: 1 }, { key: 'Amulet_Squad_Scorching', count: 1 }, { key: 'Messenger_Squad_WALL_E', count: 1 }, { key: 'Messenger_Squad_Gena', count: 1 }, { key: 'Messenger_Squad_Ah_Hua', count: 1 }, { key: 'Dream_Guardians_Squad_Martina', count: 1 }, { key: 'Dream_Guardians_Squad_Saikui', count: 1 }],
        exactDeck: true,
        preferredPool: [],
        apocalypseTags: [],
        rogueBuffs: [],
        aiPersonality: 'balanced',
        cardBackIndex: 0, // [2026-08-17 莉莉子] 敌方卡背
        avatarKey: 'Poet_Squad_Kelo', // [2026-08-29] 地图头像
        loadingCardKey: 'Poet_Squad_Kelo', // [2026-08-29] 加载卡面
    },
    'new_archetype_1783818853328': {
        id: 'new_archetype_1783818853328',
        name: '测试开始',
        champion: '',
        description: '关键词的试验场。碾压、先攻、重生、隐秘……每一种机制各来三张，用来一次性检验所有关键词的交互。',
        coreCards: [{ key: 'test_overwhelm', count: 3 }, { key: 'test_quickattack', count: 3 }, { key: 'test_regeneration', count: 3 }, { key: 'test_elusive', count: 3 }, { key: 'test_challenger', count: 3 }, { key: 'test_barrier', count: 3 }, { key: 'test_fearsome', count: 3 }, { key: 'test_scout', count: 3 }, { key: 'test_ephemeral', count: 3 }, { key: 'test_tough', count: 3 }, { key: 'test_thorns', count: 3 }, { key: 'test_volatile', count: 3 }, { key: 'test_titan', count: 3 }, { key: 'destruction', count: 1 }],
        exactDeck: true,
        preferredPool: [],
        apocalypseTags: [],
        rogueBuffs: [],
        aiPersonality: 'balanced',
        cardBackIndex: 0, // [2026-08-17 莉莉子] 敌方卡背
        avatarKey: 'test_overwhelm', // [2026-08-29] 地图头像
        loadingCardKey: 'test_overwhelm', // [2026-08-29] 加载卡面
    },
    'new_archetype_1783818922689': {
        id: 'new_archetype_1783818922689',
        name: '肉搏战',
        champion: '',
        description: '没有一张法术。场上只有单位，只有碰撞，只有你来我往的交换——纯粹的肉搏。',
        coreCards: [{ key: 'Dream_Guardians_Squad_Martina', count: 3 }, { key: 'Dream_Guardians_Squad_Saikui', count: 3 }, { key: 'Dream_Guardians_Squad_Haifa', count: 3 }, { key: 'Ulster_Squad_Koni', count: 3 }, { key: 'Ulster_Squad_Maeve', count: 3 }, { key: 'Ulster_Squad_Flamme', count: 3 }, { key: 'Typhoon_Squad_Flameheart', count: 3 }, { key: 'Typhoon_Squad_Dornier', count: 3 }, { key: 'Typhoon_Squad_613', count: 3 }, { key: 'Messenger_Squad_Ah_Hua', count: 3 }, { key: 'Messenger_Squad_Gena', count: 3 }, { key: 'Messenger_Squad_WALL_E', count: 3 }, { key: 'Amulet_Squad_Scorching', count: 3 }, { key: 'Amulet_Squad_Cattail', count: 3 }, { key: 'Amulet_Squad_Peaches', count: 3 }, { key: 'FanLing_Squad_Lucia', count: 3 }, { key: 'FanLing_Squad_Nafu', count: 3 }, { key: 'FanLing_Squad_Wasi', count: 3 }],
        exactDeck: true,
        preferredPool: [],
        apocalypseTags: [],
        rogueBuffs: [],
        aiPersonality: 'balanced',
        cardBackIndex: 0, // [2026-08-17 莉莉子] 敌方卡背
        avatarKey: undefined, // [2026-08-29] 地图头像
        loadingCardKey: undefined, // [2026-08-29] 加载卡面
    },
    'new_archetype_1783818973258': {
        id: 'new_archetype_1783818973258',
        name: '你说谁是小个子？',
        champion: '',
        description: '你问谁是小个子？望远镜机器人、鳄鱼、胡狼、夜枭、行李箱……一大群“小家伙”涌上来。别被体型骗了，它们加起来可不好惹。',
        coreCards: [{ key: 'Elice_scope_robot', count: 3 }, { key: 'Kuranas_Crocodile', count: 3 }, { key: 'Soline_Anubis', count: 3 }, { key: 'Mirror_pupu', count: 3 }, { key: 'Night_Owl', count: 3 }, { key: 'Green_Spirit_Squad_LuggageBot', count: 3 }, { key: 'single_combat', count: 3 }, { key: 'prayer', count: 3 }, { key: 'focus', count: 3 }, { key: 'backroom_deal', count: 3 }, { key: 'vitality_supplement', count: 3 }, { key: 'energy_supplement', count: 3 }, { key: 'bader_reagent', count: 3 }, { key: 'full_purification', count: 1 }],
        exactDeck: true,
        preferredPool: [],
        apocalypseTags: [],
        rogueBuffs: [],
        aiPersonality: 'balanced',
        cardBackIndex: 0, // [2026-08-17 莉莉子] 敌方卡背
        avatarKey: 'Kuranas_Crocodile', // [2026-08-29] 地图头像
        loadingCardKey: 'Kuranas_Crocodile', // [2026-08-29] 加载卡面
    },
    'new_archetype_1784422245237': {
        id: 'new_archetype_1784422245237',
        name: '小队 达怒',
        champion: '',
        description: '「达努」小队三人各带九张，阵仗铺得比谁都满。班西的哀嚎、温蒂的游走、银臂的强攻，三线同时压上。',
        coreCards: [{ key: 'Danu_Squad_Banshee', count: 9 }, { key: 'Danu_Squad_Wendy', count: 9 }, { key: 'Danu_Squad_SilverArm', count: 9 }, { key: 'inspire', count: 3 }, { key: 'destruction', count: 3 }, { key: 'bader_reagent', count: 3 }, { key: 'vitality_supplement', count: 3 }, { key: 'backroom_deal', count: 1 }],
        exactDeck: true,
        preferredPool: [],
        apocalypseTags: [],
        rogueBuffs: [],
        aiPersonality: 'balanced',
        cardBackIndex: 0, // [2026-08-17 莉莉子] 敌方卡背
        avatarKey: 'Danu_Squad_SilverArm', // [2026-08-29] 地图头像
        loadingCardKey: 'Danu_Squad_SilverArm', // [2026-08-29] 加载卡面
    },
    'new_archetype_1784422289163': {
        id: 'new_archetype_1784422289163',
        name: '小队 梵音',
        champion: '',
        description: '「梵音」小队三人各九张，再配十余种法术各一张——场面交给队员，变数交给法术，你永远不知道下一张会冒出什么。',
        coreCards: [{ key: 'SacredChants_Squad_Loka', count: 9 }, { key: 'SacredChants_Squad_European_Angelica', count: 9 }, { key: 'SacredChants_Squad_Shalo', count: 9 }, { key: 'focus', count: 1 }, { key: 'inspire', count: 1 }, { key: 'single_combat', count: 1 }, { key: 'destruction', count: 1 }, { key: 'backroom_deal', count: 1 }, { key: 'bader_reagent', count: 1 }, { key: 'vitality_supplement', count: 1 }, { key: 'ghostly_shadows', count: 1 }, { key: 'destruction_ritual', count: 1 }, { key: 'toad_pattern', count: 1 }, { key: 'vitality_regen', count: 1 }, { key: 'hidden_arrow', count: 1 }, { key: 'prayer', count: 1 }],
        exactDeck: true,
        preferredPool: [],
        apocalypseTags: [],
        rogueBuffs: [],
        aiPersonality: 'balanced',
        cardBackIndex: 0, // [2026-08-17 莉莉子] 敌方卡背
        avatarKey: 'SacredChants_Squad_Shalo', // [2026-08-29] 地图头像
        loadingCardKey: 'SacredChants_Squad_Shalo', // [2026-08-29] 加载卡面
    },
    'new_archetype_1784422352488': {
        id: 'new_archetype_1784422352488',
        name: '小队 阿尔戈',
        champion: '',
        description: '「阿尔戈」小队全员到齐。鸽子、乐手、箭头——三人的远程火力网一旦架起来，你的每个单位都在射程之内。',
        coreCards: [{ key: 'Argo_Squad_Pigeon', count: 9 }, { key: 'Argo_Squad_Musician', count: 9 }, { key: 'Argo_Squad_Arrowhead', count: 9 }, { key: 'hidden_arrow', count: 1 }, { key: 'inspire', count: 3 }, { key: 'destruction', count: 2 }, { key: 'single_combat', count: 3 }, { key: 'prayer', count: 1 }, { key: 'focus', count: 1 }, { key: 'bader_reagent', count: 1 }, { key: 'backroom_deal', count: 1 }],
        exactDeck: true,
        preferredPool: [],
        apocalypseTags: [],
        rogueBuffs: [],
        aiPersonality: 'balanced',
        cardBackIndex: 0, // [2026-08-17 莉莉子] 敌方卡背
        avatarKey: 'Argo_Squad_Arrowhead', // [2026-08-29] 地图头像
        loadingCardKey: 'Argo_Squad_Arrowhead', // [2026-08-29] 加载卡面
    },
    'new_archetype_1784422416633': {
        id: 'new_archetype_1784422416633',
        name: '小队 鸦眼',
        champion: '',
        description: '「鸦眼」小队三人各八张，情报与狙击的组合。你以为躲在后面就安全了？他们看得见。',
        coreCards: [{ key: 'Crows_Eyest_Squad_An', count: 8 }, { key: 'Crows_Eyest_Squad_Mulin', count: 8 }, { key: 'Crows_Eyest_Squad_Hiki', count: 8 }, { key: 'hidden_arrow', count: 2 }, { key: 'focus', count: 2 }, { key: 'single_combat', count: 1 }, { key: 'prayer', count: 1 }, { key: 'inspire', count: 2 }, { key: 'destruction', count: 2 }, { key: 'vitality_regen', count: 1 }, { key: 'bader_reagent', count: 2 }, { key: 'ghostly_shadows', count: 1 }, { key: 'destruction_ritual', count: 1 }, { key: 'vitality_supplement', count: 1 }],
        exactDeck: true,
        preferredPool: [],
        apocalypseTags: [],
        rogueBuffs: [],
        aiPersonality: 'balanced',
        cardBackIndex: 0, // [2026-08-17 莉莉子] 敌方卡背
        avatarKey: 'Crows_Eyest_Squad_Hiki', // [2026-08-29] 地图头像
        loadingCardKey: 'Crows_Eyest_Squad_Hiki', // [2026-08-29] 加载卡面
    },
    'new_archetype_1786176839001': {
        id: 'new_archetype_1786176839001',
        name: '鬼影森森',
        champion: '',
        description: '四十张「鬼影森森」。整副牌只有这一个咒语，但它每一次落下，都会带走些什么。',
        coreCards: [{ key: 'ghostly_shadows', count: 40 }],
        exactDeck: true,
        preferredPool: [],
        apocalypseTags: [],
        rogueBuffs: [],
        aiPersonality: 'aggressive',
        cardBackIndex: 0, // [2026-08-17 莉莉子] 敌方卡背
        avatarKey: 'ghostly_shadows', // [2026-08-29] 地图头像
        loadingCardKey: 'ghostly_shadows', // [2026-08-29] 加载卡面
    },

    // ==========================================
    // [2026-09-26 莉莉子] 新增 3 套敌方卡组
    //   前置：本日刚打通「AI 用得上」这条命脉（AI 决策模式 16→20 种 + 14 张法术补 ai）
    //   选卡原则：只用「已配 ai 且主阶段能触发」的法术。
    //   ⚠️ 反制三连（抵抗/抗拒/拒绝）**故意不收**——AI 目前不会响应对手施法
    //      （useAI 的 react_to_block 与「栈上有法术」两处都直接让过），收了就是死牌。
    //   卡背索引 17/18/19 = 时之重奏 / 双生回响 / 茉莉安 霄鹰，与流派主角一一对应
    // ==========================================
    'acacia_blade_swarm': {
        id: 'acacia_blade_swarm',
        name: '飞剑纵横',
        champion: 'acacia_chrono_echo',
        description: '以安卡希雅·时之重奏为核心，飞剑攻守一体——剑可斩人、亦可挡刀，攻势与防守在同一把剑上反复切换，你永远猜不到她这一剑是刺过来还是架起来。',
        coreCards: [{ key: 'acacia_chrono_echo', count: 6 }, { key: 'acacia_chrono_echo_support', count: 3 }, { key: 'temp_spell_09', count: 3 }, { key: 'temp_spell_19', count: 3 }, { key: 'temp_spell_13', count: 2 }, { key: 'single_combat', count: 2 }, { key: 'hidden_arrow', count: 3 }, { key: 'focus', count: 2 }, { key: 'Sacred_Tree_Squad_Lumi', count: 3 }, { key: 'Sacred_Tree_Squad_Margaret', count: 3 }, { key: 'Sacred_Tree_Squad_Alvina', count: 3 }, { key: 'Poet_Squad_Caitlin', count: 2 }, { key: 'Poet_Squad_Kelo', count: 2 }, { key: 'Bridget_Squad_Chinchilla', count: 2 }, { key: 'Crows_Eyest_Squad_An', count: 1 }],
        exactDeck: true,
        preferredPool: [],
        apocalypseTags: [],
        rogueBuffs: [],
        aiPersonality: 'control',
        cardBackIndex: 17,
        avatarKey: 'acacia_chrono_echo',
        loadingCardKey: 'acacia_chrono_echo',
    },
    'marian_beacon_pressure': {
        id: 'marian_beacon_pressure',
        name: '信标压制',
        champion: 'marian',
        description: '以茉莉安·霄鹰为核心，在你阵中埋下獠牙信标持续放血；「松露」三后勤把【暴露】铺满全场的那一刻，就是收割开始的信号。',
        coreCards: [{ key: 'marian', count: 6 }, { key: 'Truffle_Squad_Mushroom_Shadows', count: 3 }, { key: 'Truffle_Squad_Elm', count: 3 }, { key: 'Truffle_Squad_Iris', count: 3 }, { key: 'hidden_arrow', count: 3 }, { key: 'destruction', count: 3 }, { key: 'single_combat', count: 3 }, { key: 'temp_spell_05', count: 2 }, { key: 'bader_reagent', count: 2 }, { key: 'backroom_deal', count: 2 }, { key: 'Ulster_Squad_Maeve', count: 3 }, { key: 'Bridget_Squad_Feier', count: 3 }, { key: 'Ghost_Squad_Vez', count: 2 }, { key: 'Danu_Squad_Wendy', count: 2 }],
        exactDeck: true,
        preferredPool: [],
        apocalypseTags: [],
        rogueBuffs: [],
        aiPersonality: 'balanced',
        cardBackIndex: 19,
        avatarKey: 'marian',
        loadingCardKey: 'marian',
    },
    'frost_apocalypse': {
        id: 'frost_apocalypse',
        name: '冰封终末',
        champion: '',
        description: '一套不急着赢的后期卡组。用冻结拖住你的每一次推进，把局面硬生生熬到终末——然后一发清场、或一次复活，把整盘棋推翻重来。',
        coreCards: [{ key: 'temp_spell_18', count: 3 }, { key: 'temp_spell_17', count: 2 }, { key: 'temp_spell_01', count: 2 }, { key: 'temp_spell_02', count: 2 }, { key: 'Danu_Squad_Banshee', count: 4 }, { key: 'Danu_Squad_Wendy', count: 4 }, { key: 'Danu_Squad_SilverArm', count: 4 }, { key: 'Ulster_Squad_Koni', count: 3 }, { key: 'Ulster_Squad_Maeve', count: 3 }, { key: 'Typhoon_Squad_Flameheart', count: 3 }, { key: 'Spirit_Squad_Snenika', count: 3 }, { key: 'Green_Spirit_Squad_Glanz', count: 3 }, { key: 'bader_reagent', count: 2 }, { key: 'backroom_deal', count: 2 }],
        exactDeck: true,
        preferredPool: [],
        apocalypseTags: [],
        rogueBuffs: [],
        aiPersonality: 'control',
        cardBackIndex: 18,
        avatarKey: 'Danu_Squad_Banshee',
        loadingCardKey: 'temp_spell_18',
    },
};
