/**
 * ==============================================================================
 * 《Snowbreak Rivals》 军功任务注册局 (Mission Registry)
 * ==============================================================================
 * 职责：
 * 1. 静态数据中心，全量手动定义所有每日、每周及成就任务。
 * 2. 与 gameLogger 生成的原子事件进行逻辑映射。
 * 3. 关联 skinData.ts 中的 missionId 以进行奖励发放。
 * ==============================================================================
 */

// 任务类型：每日(次日6点重置) | 每周(周一6点重置) | 永久成就(不重置) | 版本活动(不重置)
export type MissionCategory = 'daily' | 'weekly' | 'achievement' | 'version';

// 奖励类型：数据金 | 皮肤 | 卡背 | 卡牌
export type MissionRewardType = 'dataGold' | 'skin' | 'cardBack' | 'card';

// 监听条件类型
export type MissionConditionType =
    | 'game_end'           // 基础对局结算
    | 'play_card'          // 打出指定卡牌
    | 'attack'             // 指定单位发起攻击
    | 'nexus_damage'       // 指定单位对水晶造成伤害
    | 'level_up_and_win'   // 指定英雄升级且该局获胜 (复合条件)
    | 'win_with_champion'  // [2026-06-27] 携带指定英雄获胜
    | 'direct_claim';      // [2026-06-27] 无需条件，直接领取

export interface MissionDef {
    id: string;
    category: MissionCategory;
    title: string;
    description: string;
    targetCount: number;         // 目标数量
    reward: {
        type: MissionRewardType;
        amount?: number;         // 货币数量 (如 1600, 4800)
        cosmeticId?: string;     // 对应 skinData.ts 中的 missionId
        cardKeys?: string[];     // [新增] 卡牌奖励：要发放的卡牌 key 列表
    };
    condition: {
        type: MissionConditionType;
        targetKey?: string;      // 监听的具体卡牌标识
    };
    // [2026-06-27] 版本任务专用字段
    rewardDirect?: boolean;      // 是否直接领取（无需进度）
    showCondition?: {
        accountCreatedBefore?: string; // 注册时间早于此日期才显示
    };
}

export const MISSIONS: MissionDef[] = [
    // ==========================================
    // ⚔️ 常规活跃任务 (Daily & Weekly)
    // ==========================================
    {
        id: 'daily_play_1',
        category: 'daily',
        title: '战术演练',
        description: '完成 1 场对局',
        targetCount: 1,
        reward: { type: 'dataGold', amount: 1600 },
        condition: { type: 'game_end' } // 任意结局都会+1
    },
    {
        id: 'weekly_play_3',
        category: 'weekly',
        title: '持续作战',
        description: '累计完成 3 场对局',
        targetCount: 3,
        reward: { type: 'dataGold', amount: 4800 },
        condition: { type: 'game_end' }
    },

    // ==========================================
    // 🎴 特种卡背成就任务 (CardBack Achievements)
    // ==========================================
    {
        id: 'mission_cb_fenny', // 必须与 skinData.ts 中卡背的 missionId 一致
        category: 'achievement',
        title: '黄金之姿',
        description: '使用「芬妮」对敌方水晶累计造成 100 点伤害',
        targetCount: 100, // 注意：结算时会累加 damage amount，而不是单纯的次数
        reward: { type: 'cardBack', cosmeticId: 'mission_cb_fenny' },
        condition: { type: 'nexus_damage', targetKey: 'fenny' }
    },
    {
        id: 'mission_cb_lyfe',
        category: 'achievement',
        title: '霜刃之徽',
        description: '使用「里芙」累计发起进攻 15 次',
        targetCount: 15,
        reward: { type: 'cardBack', cosmeticId: 'mission_cb_lyfe' },
        condition: { type: 'attack', targetKey: 'lyfe' }
    },
    {
        id: 'mission_cb_pupu',
        category: 'achievement',
        title: '镜花水月',
        description: '「卜卜」灵鉴累计升级并取得对局胜利 4 次',
        targetCount: 4,
        reward: { type: 'cardBack', cosmeticId: 'mission_cb_pupu' },
        condition: { type: 'level_up_and_win', targetKey: 'pupu_specular_soul' }
    },

    // ==========================================
    // 👗 15个常规皮肤成就任务 (Skin Achievements)
    // 统一规则：在对局中累计打出指定卡牌 5 次
    // ==========================================

    // --- 鬼怪小队 (Ghost Squad) ---
    {
        id: 'mission_ghost_antina_01',
        category: 'achievement', title: '暗影新兵', description: '在对局中累计打出「鬼怪-安提娜」5 次',
        targetCount: 5, reward: { type: 'skin', cosmeticId: 'mission_ghost_antina_01' },
        condition: { type: 'play_card', targetKey: 'Ghost_Squad_Antina' }
    },
    {
        id: 'mission_ghost_vez_01',
        category: 'achievement', title: '致命狙击', description: '在对局中累计打出「鬼怪-薇兹」5 次',
        targetCount: 5, reward: { type: 'skin', cosmeticId: 'mission_ghost_vez_01' },
        condition: { type: 'play_card', targetKey: 'Ghost_Squad_Vez' }
    },
    {
        id: 'mission_ghost_valen_01',
        category: 'achievement', title: '狂暴突破', description: '在对局中累计打出「鬼怪-瓦莲」5 次',
        targetCount: 5, reward: { type: 'skin', cosmeticId: 'mission_ghost_valen_01' },
        condition: { type: 'play_card', targetKey: 'Ghost_Squad_Valen' }
    },

    // --- 阿尔戈小队 (Argo Squad) ---
    {
        id: 'mission_argo_pigeon_01',
        category: 'achievement', title: '高空侦察', description: '在对局中累计打出「阿尔戈-鸽子」5 次',
        targetCount: 5, reward: { type: 'skin', cosmeticId: 'mission_argo_pigeon_01' },
        condition: { type: 'play_card', targetKey: 'Argo_Squad_Pigeon' }
    },
    {
        id: 'mission_argo_musician_01',
        category: 'achievement', title: '战场协奏', description: '在对局中累计打出「阿尔戈-乐手」5 次',
        targetCount: 5, reward: { type: 'skin', cosmeticId: 'mission_argo_musician_01' },
        condition: { type: 'play_card', targetKey: 'Argo_Squad_Musician' }
    },
    {
        id: 'mission_argo_arrowhead_01',
        category: 'achievement', title: '锐利箭头', description: '在对局中累计打出「阿尔戈-箭头」5 次',
        targetCount: 5, reward: { type: 'skin', cosmeticId: 'mission_argo_arrowhead_01' },
        condition: { type: 'play_card', targetKey: 'Argo_Squad_Arrowhead' }
    },

    // --- 明夷小队 (Mingyi Squad) ---
    {
        id: 'mission_mingyi_zhe_hao_01',
        category: 'achievement', title: '赭色魔御', description: '在对局中累计打出「明夷-赭毫」5 次',
        targetCount: 5, reward: { type: 'skin', cosmeticId: 'mission_mingyi_zhe_hao_01' },
        condition: { type: 'play_card', targetKey: 'Mingyi_Squad_Zhe_hao' }
    },
    {
        id: 'mission_mingyi_zhu_he_01',
        category: 'achievement', title: '朱鹮之炎', description: '在对局中累计打出「明夷-朱鹮」5 次',
        targetCount: 5, reward: { type: 'skin', cosmeticId: 'mission_mingyi_zhu_he_01' },
        condition: { type: 'play_card', targetKey: 'Mingyi_Squad_Zhu_He' }
    },
    {
        id: 'mission_mingyi_jin_lang_01',
        category: 'achievement', title: '金琅重甲', description: '在对局中累计打出「明夷-金琅」5 次',
        targetCount: 5, reward: { type: 'skin', cosmeticId: 'mission_mingyi_jin_lang_01' },
        condition: { type: 'play_card', targetKey: 'Mingyi_Squad_Jin_Lang' }
    },

    // --- 星朗小队 (Star Bright Squad) ---
    {
        id: 'mission_star_doveil_01',
        category: 'achievement', title: '星光导航', description: '在对局中累计打出「星朗-多维尔」5 次',
        targetCount: 5, reward: { type: 'skin', cosmeticId: 'mission_star_doveil_01' },
        condition: { type: 'play_card', targetKey: 'Star_Bright_Squad_Doveil' }
    },
    {
        id: 'mission_star_alivy_01',
        category: 'achievement', title: '星耀打击', description: '在对局中累计打出「星朗-艾利维」5 次',
        targetCount: 5, reward: { type: 'skin', cosmeticId: 'mission_star_alivy_01' },
        condition: { type: 'play_card', targetKey: 'Star_Bright_Squad_Alivy' }
    },
    {
        id: 'mission_star_dakors_01',
        category: 'achievement', title: '陨星重击', description: '在对局中累计打出「星朗-达科斯」5 次',
        targetCount: 5, reward: { type: 'skin', cosmeticId: 'mission_star_dakors_01' },
        condition: { type: 'play_card', targetKey: 'Star_Bright_Squad_Dakors' }
    },

    // --- 重夜小队 (Chongye Squad) ---
    {
        id: 'mission_chongye_mabel_01',
        category: 'achievement', title: '暗夜先锋', description: '在对局中累计打出「重夜-梅贝尔」5 次',
        targetCount: 5, reward: { type: 'skin', cosmeticId: 'mission_chongye_mabel_01' },
        condition: { type: 'play_card', targetKey: 'Chongye_Squad_Mabel' }
    },
    {
        id: 'mission_chongye_elice_01',
        category: 'achievement', title: '黑夜幻影', description: '在对局中累计打出「重夜-爱丽丝」5 次',
        targetCount: 5, reward: { type: 'skin', cosmeticId: 'mission_chongye_elice_01' },
        condition: { type: 'play_card', targetKey: 'Chongye_Squad_Elice' }
    },
    {
        id: 'mission_chongye_golia_01',
        category: 'achievement', title: '夜幕巨兽', description: '在对局中累计打出「重夜-歌利亚」5 次',
        targetCount: 5, reward: { type: 'skin', cosmeticId: 'mission_chongye_golia_01' },
        condition: { type: 'play_card', targetKey: 'Chongye_Squad_Golia' }
    },

    // --- 图征小队 (Illustration Squad) ---
    {
        id: 'mission_illustration_kuranas_01',
        category: 'achievement', title: '医疗支援', description: '在对局中累计打出「图征-库兰娅丝」5 次',
        targetCount: 5, reward: { type: 'skin', cosmeticId: 'mission_illustration_kuranas_01' },
        condition: { type: 'play_card', targetKey: 'Illustration_Squad_Kuranas' }
    },
    {
        id: 'mission_illustration_swali_01',
        category: 'achievement', title: '丰盛宴席', description: '在对局中累计打出「图征-斯瓦莉」5 次',
        targetCount: 5, reward: { type: 'skin', cosmeticId: 'mission_illustration_swali_01' },
        condition: { type: 'play_card', targetKey: 'Illustration_Squad_Swali' }
    },
    {
        id: 'mission_illustration_soline_01',
        category: 'achievement', title: '荒漠裁决', description: '在对局中累计打出「图征-索琳」5 次',
        targetCount: 5, reward: { type: 'skin', cosmeticId: 'mission_illustration_soline_01' },
        condition: { type: 'play_card', targetKey: 'Illustration_Squad_Soline' }
    },

    // ==========================================
    // 🏆 2.0 版本活动 (Version 2.0)
    // ==========================================
    {
        id: 'version_old_friend',
        category: 'version', title: '老友福利', description: '感谢你一直以来的支持，这是给老玩家的回馈礼包！',
        targetCount: 1, rewardDirect: true,
        reward: { type: 'dataGold', amount: 8000 },
        condition: { type: 'direct_claim' },
        showCondition: { accountCreatedBefore: '2026-06-27' }
    },
    {
        id: 'version_new_start',
        category: 'version', title: '新版本启航', description: '迎接新版本，获得猫汐尔莲驱与图征小队全员！',
        targetCount: 1, rewardDirect: true,
        reward: { type: 'card', cardKeys: ['mauxir_lotus_drive', 'Illustration_Squad_Kuranas', 'Illustration_Squad_Swali', 'Illustration_Squad_Soline'] },
        condition: { type: 'direct_claim' }
    },
    {
        id: 'version_cat_win',
        category: 'version', title: '是猫猫的胜利', description: '携带猫汐尔 莲驱赢得一场对局胜利',
        targetCount: 1,
        reward: { type: 'dataGold', amount: 4800 },
        condition: { type: 'win_with_champion', targetKey: 'mauxir_lotus_drive' }
    }
];