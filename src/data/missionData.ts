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
    | 'win_with_squad'     // [2026-07-12] 携带指定后勤小队全员获胜
    | 'damage_dealt'       // [2026-07-22] 指定单位累计造成伤害 (用于莲驱臆莲基座任务)
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
        targetKeys?: string[];   // [2026-07-12] 监听的多卡牌标识列表（用于 win_with_squad）
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
    // ==========================================
    // 🎓 新手教程成就 (Tutorial Achievements)
    // ==========================================
    {
        id: 'tutorial_basic_complete',
        category: 'achievement', title: '战斗与胜利', description: '完成战术考核基础模式第一关——战斗与胜利',
        targetCount: 1, rewardDirect: true,
        reward: { type: 'card', cardKeys: ['lyfe', 'fenny', 'pupu_specular_soul', 'mauxir_lotus_drive'] },
        condition: { type: 'direct_claim' }
    },

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
    // [2026-07-22] 猫汐尔莲驱专属卡背
    {
        id: 'mission_cb_mauxir_lotus_drive',
        category: 'achievement',
        title: '莲心千瓣',
        description: '「臆莲基座」累计造成 300 点伤害',
        targetCount: 300,
        reward: { type: 'cardBack', cosmeticId: 'mission_cb_mauxir_lotus_drive' },
        condition: { type: 'damage_dealt', targetKey: 'mauxir_lotus_pedestal' }
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

    // --- 布里吉小队 (Bridget Squad) ---
    {
        id: 'mission_bridget_feier_01',
        category: 'achievement', title: '强行通讯', description: '在对局中累计打出「布里吉-菲儿」5 次',
        targetCount: 5, reward: { type: 'skin', cosmeticId: 'mission_bridget_feier_01' },
        condition: { type: 'play_card', targetKey: 'Bridget_Squad_Feier' }
    },
    {
        id: 'mission_bridget_chinchilla_01',
        category: 'achievement', title: '抽牌引擎', description: '在对局中累计打出「布里吉-金吉拉」5 次',
        targetCount: 5, reward: { type: 'skin', cosmeticId: 'mission_bridget_chinchilla_01' },
        condition: { type: 'play_card', targetKey: 'Bridget_Squad_Chinchilla' }
    },
    {
        id: 'mission_bridget_valerie_01',
        category: 'achievement', title: '夜巡使者', description: '在对局中累计打出「布里吉-瓦莱莉」5 次',
        targetCount: 5, reward: { type: 'skin', cosmeticId: 'mission_bridget_valerie_01' },
        condition: { type: 'play_card', targetKey: 'Bridget_Squad_Valerie' }
    },

    // --- 精灵小队 (Spirit Squad) ---
    {
        id: 'mission_spirit_lusaka_01',
        category: 'achievement', title: '祈愿生成', description: '在对局中累计打出「精灵-露莎卡」5 次',
        targetCount: 5, reward: { type: 'skin', cosmeticId: 'mission_spirit_lusaka_01' },
        condition: { type: 'play_card', targetKey: 'Spirit_Squad_Lusaka' }
    },
    {
        id: 'mission_spirit_snenika_01',
        category: 'achievement', title: '治愈光环', description: '在对局中累计打出「精灵-斯涅妮卡」5 次',
        targetCount: 5, reward: { type: 'skin', cosmeticId: 'mission_spirit_snenika_01' },
        condition: { type: 'play_card', targetKey: 'Spirit_Squad_Snenika' }
    },
    {
        id: 'mission_spirit_bonnie_01',
        category: 'achievement', title: '碾压终结', description: '在对局中累计打出「精灵-邦尼」5 次',
        targetCount: 5, reward: { type: 'skin', cosmeticId: 'mission_spirit_bonnie_01' },
        condition: { type: 'play_card', targetKey: 'Spirit_Squad_Bonnie' }
    },

    // --- 诗人小队 (Poet Squad) ---
    {
        id: 'mission_poet_oisin_01',
        category: 'achievement', title: '快照记录', description: '在对局中累计打出「诗人-奥伊辛」5 次',
        targetCount: 5, reward: { type: 'skin', cosmeticId: 'mission_poet_oisin_01' },
        condition: { type: 'play_card', targetKey: 'Poet_Squad_Oisin' }
    },
    {
        id: 'mission_poet_caitlin_01',
        category: 'achievement', title: '法术减费', description: '在对局中累计打出「诗人-凯特琳」5 次',
        targetCount: 5, reward: { type: 'skin', cosmeticId: 'mission_poet_caitlin_01' },
        condition: { type: 'play_card', targetKey: 'Poet_Squad_Caitlin' }
    },
    {
        id: 'mission_poet_kelo_01',
        category: 'achievement', title: '回收复现', description: '在对局中累计打出「诗人-科洛」5 次',
        targetCount: 5, reward: { type: 'skin', cosmeticId: 'mission_poet_kelo_01' },
        condition: { type: 'play_card', targetKey: 'Poet_Squad_Kelo' }
    },

    // --- 绿灵小队 (Green Spirit Squad) ---
    {
        id: 'mission_green_glanz_01',
        category: 'achievement', title: '牌库成长', description: '在对局中累计打出「绿灵-格伦茨」5 次',
        targetCount: 5, reward: { type: 'skin', cosmeticId: 'mission_green_glanz_01' },
        condition: { type: 'play_card', targetKey: 'Green_Spirit_Squad_Glanz' }
    },
    {
        id: 'mission_green_eva_01',
        category: 'achievement', title: '法术协同', description: '在对局中累计打出「绿灵-艾娃」5 次',
        targetCount: 5, reward: { type: 'skin', cosmeticId: 'mission_green_eva_01' },
        condition: { type: 'play_card', targetKey: 'Green_Spirit_Squad_Eva' }
    },
    {
        id: 'mission_green_grace_01',
        category: 'achievement', title: '行李箱攻势', description: '在对局中累计打出「绿灵-格蕾丝」5 次',
        targetCount: 5, reward: { type: 'skin', cosmeticId: 'mission_green_grace_01' },
        condition: { type: 'play_card', targetKey: 'Green_Spirit_Squad_Grace' }
    },

    // ==========================================

    {
        id: 'mission_forger_leisia_01',
        category: 'achievement', title: '战术规划', description: '在对局中累计打出「锻造者-蕾西亚」5 次',
        targetCount: 5, reward: { type: 'skin', cosmeticId: 'mission_forger_leisia_01' },
        condition: { type: 'play_card', targetKey: 'The_Forger_Squad_Leisia' }
    },
    {
        id: 'mission_forger_tatiana_01',
        category: 'achievement', title: '火焰锻造', description: '在对局中累计打出「锻造者-缇坦妮娅」5 次',
        targetCount: 5, reward: { type: 'skin', cosmeticId: 'mission_forger_tatiana_01' },
        condition: { type: 'play_card', targetKey: 'The_Forger_Squad_Tatiana' }
    },
    {
        id: 'mission_forger_white_hunt_01',
        category: 'achievement', title: '精准猎杀', description: '在对局中累计打出「锻造者-白猎」5 次',
        targetCount: 5, reward: { type: 'skin', cosmeticId: 'mission_forger_white_hunt_01' },
        condition: { type: 'play_card', targetKey: 'The_Forger_Squad_White_Hunt' }
    },
    {
        id: 'mission_sacred_loka_01',
        category: 'achievement', title: '梵音低吟', description: '在对局中累计打出「梵音-洛迦」5 次',
        targetCount: 5, reward: { type: 'skin', cosmeticId: 'mission_sacred_loka_01' },
        condition: { type: 'play_card', targetKey: 'SacredChants_Squad_Loka' }
    },
    {
        id: 'mission_sacred_angelica_01',
        category: 'achievement', title: '迷离之音', description: '在对局中累计打出「梵音-欧白芷」5 次',
        targetCount: 5, reward: { type: 'skin', cosmeticId: 'mission_sacred_angelica_01' },
        condition: { type: 'play_card', targetKey: 'SacredChants_Squad_European_Angelica' }
    },
    {
        id: 'mission_sacred_shalo_01',
        category: 'achievement', title: '巨偶降临', description: '在对局中累计打出「梵音-莎罗」5 次',
        targetCount: 5, reward: { type: 'skin', cosmeticId: 'mission_sacred_shalo_01' },
        condition: { type: 'play_card', targetKey: 'SacredChants_Squad_Shalo' }
    },
    {
        id: 'mission_danu_banshee_01',
        category: 'achievement', title: '墓穴蛛后', description: '在对局中累计打出「达努-班西」5 次',
        targetCount: 5, reward: { type: 'skin', cosmeticId: 'mission_danu_banshee_01' },
        condition: { type: 'play_card', targetKey: 'Danu_Squad_Banshee' }
    },
    {
        id: 'mission_danu_wendy_01',
        category: 'achievement', title: '自适应调整', description: '在对局中累计打出「达努-温蒂」5 次',
        targetCount: 5, reward: { type: 'skin', cosmeticId: 'mission_danu_wendy_01' },
        condition: { type: 'play_card', targetKey: 'Danu_Squad_Wendy' }
    },
    {
        id: 'mission_danu_silverarm_01',
        category: 'achievement', title: '战争红利', description: '在对局中累计打出「达努-银臂」5 次',
        targetCount: 5, reward: { type: 'skin', cosmeticId: 'mission_danu_silverarm_01' },
        condition: { type: 'play_card', targetKey: 'Danu_Squad_SilverArm' }
    },
    {
        id: 'mission_crows_an_01',
        category: 'achievement', title: '校准开始', description: '在对局中累计打出「鸦眼-安」5 次',
        targetCount: 5, reward: { type: 'skin', cosmeticId: 'mission_crows_an_01' },
        condition: { type: 'play_card', targetKey: 'Crows_Eyest_Squad_An' }
    },
    {
        id: 'mission_crows_mulin_01',
        category: 'achievement', title: '鸦羽庇护', description: '在对局中累计打出「鸦眼-穆林」5 次',
        targetCount: 5, reward: { type: 'skin', cosmeticId: 'mission_crows_mulin_01' },
        condition: { type: 'play_card', targetKey: 'Crows_Eyest_Squad_Mulin' }
    },
    {
        id: 'mission_crows_hiki_01',
        category: 'achievement', title: '精密调度', description: '在对局中累计打出「鸦眼-海基」5 次',
        targetCount: 5, reward: { type: 'skin', cosmeticId: 'mission_crows_hiki_01' },
        condition: { type: 'play_card', targetKey: 'Crows_Eyest_Squad_Hiki' }
    },

    // 🏆 2.0 版本活动 (Version 2.0)
    // ==========================================
    // 【维护提示】老友福利是每个版本可重复领取的测试服回馈礼包。
    // 更新时请：
    //   1. 将 id 改为 version_old_friend_YYYYMMDD（以更新日期为准）
    //   2. 同步更新 showCondition.accountCreatedBefore 日期
    //   3. 更新 description 中的日期文本
    // 旧 ID 的存档会自动保留，新 ID 会被视为全新任务，已领取玩家也能再次领取。
    // ==========================================
    {
        id: 'version_old_friend_20260802',
        category: 'version', title: '老友福利', description: '感谢你一直以来的支持，这是给新版本测试服玩家的回馈礼包！（2026-08-02）',
        targetCount: 1, rewardDirect: true,
        reward: { type: 'dataGold', amount: 8000 },
        condition: { type: 'direct_claim' },
        showCondition: { accountCreatedBefore: '2026-08-02' }
    },
    {
        id: 'version_new_start',
        category: 'version', title: '新版本启航', description: '迎接新版本，获得猫汐尔莲驱与图征小队全员！',
        targetCount: 1, rewardDirect: true,
        reward: { type: 'card', cardKeys: ['mauxir_lotus_drive', 'Illustration_Squad_Kuranas', 'Illustration_Squad_Swali', 'Illustration_Squad_Soline'] },
        condition: { type: 'direct_claim' }
    },
    {
        id: 'version_acacia_start',
        category: 'version', title: '新版本启航', description: '迎接新版本，获得安卡希雅 时之重奏与圣树小队全员！',
        targetCount: 1, rewardDirect: true,
        reward: { type: 'card', cardKeys: ['acacia_chrono_echo', 'Sacred_Tree_Squad_Lumi', 'Sacred_Tree_Squad_Margaret', 'Sacred_Tree_Squad_Alvina'] },
        condition: { type: 'direct_claim' }
    },
    {
        id: 'version_cat_win',
        category: 'version', title: '是猫猫的胜利', description: '携带猫汐尔 莲驱赢得一场对局胜利',
        targetCount: 1,
        reward: { type: 'dataGold', amount: 4800 },
        condition: { type: 'win_with_champion', targetKey: 'mauxir_lotus_drive' }
    },
    {
        id: 'version_acacia_win',
        category: 'version', title: '是安卡的胜利', description: '携带安卡希雅 时之重奏赢得一场对局胜利',
        targetCount: 1,
        reward: { type: 'dataGold', amount: 4800 },
        condition: { type: 'win_with_champion', targetKey: 'acacia_chrono_echo' }
    },

    // ==========================================
    // 🎖️ 后勤小队作战成功系列 (Version 2.0)
    // 携带指定后勤小队全员各三张，赢得一场对局胜利
    // ==========================================
    {
        id: 'version_squad_argo',
        category: 'version', title: '阿尔戈小队：作战成功', description: '携带阿尔戈小队全员（鸽子·乐手·箭头）各三张，赢得一场对局胜利',
        targetCount: 1,
        reward: { type: 'dataGold', amount: 3600 },
        condition: { type: 'win_with_squad', targetKeys: ['Argo_Squad_Pigeon', 'Argo_Squad_Musician', 'Argo_Squad_Arrowhead'] }
    },
    {
        id: 'version_squad_mingyi',
        category: 'version', title: '明夷小队：作战成功', description: '携带明夷小队全员（赭毫·朱鹤·金琅）各三张，赢得一场对局胜利',
        targetCount: 1,
        reward: { type: 'dataGold', amount: 3600 },
        condition: { type: 'win_with_squad', targetKeys: ['Mingyi_Squad_Zhe_hao', 'Mingyi_Squad_Zhu_He', 'Mingyi_Squad_Jin_Lang'] }
    },
    {
        id: 'version_squad_star',
        category: 'version', title: '星朗小队：作战成功', description: '携带星朗小队全员（朵薇尔·爱莉薇娅·妲柯丝）各三张，赢得一场对局胜利',
        targetCount: 1,
        reward: { type: 'dataGold', amount: 3600 },
        condition: { type: 'win_with_squad', targetKeys: ['Star_Bright_Squad_Doveil', 'Star_Bright_Squad_Alivy', 'Star_Bright_Squad_Dakors'] }
    },
    {
        id: 'version_squad_chongye',
        category: 'version', title: '重叶小队：作战成功', description: '携带重叶小队全员（梅贝尔·伊莉斯·歌莉娅）各三张，赢得一场对局胜利',
        targetCount: 1,
        reward: { type: 'dataGold', amount: 3600 },
        condition: { type: 'win_with_squad', targetKeys: ['Chongye_Squad_Mabel', 'Chongye_Squad_Elice', 'Chongye_Squad_Golia'] }
    },
    {
        id: 'version_squad_illustration',
        category: 'version', title: '图征小队：作战成功', description: '携带图征小队全员（库兰娅丝·斯瓦莉·索莉妮）各三张，赢得一场对局胜利',
        targetCount: 1,
        reward: { type: 'dataGold', amount: 3600 },
        condition: { type: 'win_with_squad', targetKeys: ['Illustration_Squad_Kuranas', 'Illustration_Squad_Swali', 'Illustration_Squad_Soline'] }
    },
    {
        id: 'version_squad_green',
        category: 'version', title: '绿灵小队：作战成功', description: '携带绿灵小队全员（格伦茨·艾娃·格蕾丝）各三张，赢得一场对局胜利',
        targetCount: 1,
        reward: { type: 'dataGold', amount: 3600 },
        condition: { type: 'win_with_squad', targetKeys: ['Green_Spirit_Squad_Glanz', 'Green_Spirit_Squad_Eva', 'Green_Spirit_Squad_Grace'] }
    },
    {
        id: 'version_squad_forger',
        category: 'version', title: '锻造者小队：作战成功', description: '携带锻造者小队全员（蕾西亚·缇坦妮娅·白猎）各三张，赢得一场对局胜利',
        targetCount: 1,
        reward: { type: 'dataGold', amount: 3600 },
        condition: { type: 'win_with_squad', targetKeys: ['The_Forger_Squad_Leisia', 'The_Forger_Squad_Tatiana', 'The_Forger_Squad_White_Hunt'] }
    },
    {
        id: 'version_squad_sacred',
        category: 'version', title: '梵音小队：作战成功', description: '携带梵音小队全员（洛迦·欧白芷·莎罗）各三张，赢得一场对局胜利',
        targetCount: 1,
        reward: { type: 'dataGold', amount: 3600 },
        condition: { type: 'win_with_squad', targetKeys: ['SacredChants_Squad_Loka', 'SacredChants_Squad_European_Angelica', 'SacredChants_Squad_Shalo'] }
    },
    {
        id: 'version_squad_danu',
        category: 'version', title: '达努小队：作战成功', description: '携带达努小队全员（班西·温蒂·银臂）各三张，赢得一场对局胜利',
        targetCount: 1,
        reward: { type: 'dataGold', amount: 3600 },
        condition: { type: 'win_with_squad', targetKeys: ['Danu_Squad_Banshee', 'Danu_Squad_Wendy', 'Danu_Squad_SilverArm'] }
    },
    {
        id: 'version_squad_crows',
        category: 'version', title: '鸦眼小队：作战成功', description: '携带鸦眼小队全员（安·穆林·海基）各三张，赢得一场对局胜利',
        targetCount: 1,
        reward: { type: 'dataGold', amount: 3600 },
        condition: { type: 'win_with_squad', targetKeys: ['Crows_Eyest_Squad_An', 'Crows_Eyest_Squad_Mulin', 'Crows_Eyest_Squad_Hiki'] }
    },

    // --- 四星后勤：鬼怪小队 ---
    {
        id: 'version_squad_ghost',
        category: 'version', title: '鬼怪小队：作战成功', description: '携带鬼怪小队全员（安提娜·薇兹·瓦莲）各三张，赢得一场对局胜利',
        targetCount: 1,
        reward: { type: 'dataGold', amount: 3600 },
        condition: { type: 'win_with_squad', targetKeys: ['Ghost_Squad_Antina', 'Ghost_Squad_Vez', 'Ghost_Squad_Valen'] }
    },

    // --- 四星后勤：布里吉小队 ---
    {
        id: 'version_squad_bridget',
        category: 'version', title: '布里吉小队：作战成功', description: '携带布里吉小队全员（菲儿·金吉拉·瓦莱莉）各三张，赢得一场对局胜利',
        targetCount: 1,
        reward: { type: 'dataGold', amount: 3600 },
        condition: { type: 'win_with_squad', targetKeys: ['Bridget_Squad_Feier', 'Bridget_Squad_Chinchilla', 'Bridget_Squad_Valerie'] }
    },

    // --- 四星后勤：精灵小队 ---
    {
        id: 'version_squad_spirit',
        category: 'version', title: '精灵小队：作战成功', description: '携带精灵小队全员（露莎卡·斯涅妮卡·邦尼）各三张，赢得一场对局胜利',
        targetCount: 1,
        reward: { type: 'dataGold', amount: 3600 },
        condition: { type: 'win_with_squad', targetKeys: ['Spirit_Squad_Lusaka', 'Spirit_Squad_Snenika', 'Spirit_Squad_Bonnie'] }
    },

    // --- 四星后勤：诗人小队 ---
    {
        id: 'version_squad_poet',
        category: 'version', title: '诗人小队：作战成功', description: '携带诗人小队全员（奥伊辛·凯特琳·科洛）各三张，赢得一场对局胜利',
        targetCount: 1,
        reward: { type: 'dataGold', amount: 3600 },
        condition: { type: 'win_with_squad', targetKeys: ['Poet_Squad_Oisin', 'Poet_Squad_Caitlin', 'Poet_Squad_Kelo'] }
    },

    // --- 三星后勤：守梦人小队 ---
    {
        id: 'version_squad_dream',
        category: 'version', title: '守梦人小队：作战成功', description: '携带守梦人小队全员（玛蒂娜·赛奎特·海法）各三张，赢得一场对局胜利',
        targetCount: 1,
        reward: { type: 'dataGold', amount: 3600 },
        condition: { type: 'win_with_squad', targetKeys: ['Dream_Guardians_Squad_Martina', 'Dream_Guardians_Squad_Saikui', 'Dream_Guardians_Squad_Haifa'] }
    },

    // --- 三星后勤：阿尔斯特小队 ---
    {
        id: 'version_squad_ulster',
        category: 'version', title: '阿尔斯特小队：作战成功', description: '携带阿尔斯特小队全员（科尼·梅芙·弗拉梅）各三张，赢得一场对局胜利',
        targetCount: 1,
        reward: { type: 'dataGold', amount: 3600 },
        condition: { type: 'win_with_squad', targetKeys: ['Ulster_Squad_Koni', 'Ulster_Squad_Maeve', 'Ulster_Squad_Flamme'] }
    },

    // --- 三星后勤：堤丰小队 ---
    {
        id: 'version_squad_typhoon',
        category: 'version', title: '堤丰小队：作战成功', description: '携带堤丰小队全员（焰心·多尼尔·613）各三张，赢得一场对局胜利',
        targetCount: 1,
        reward: { type: 'dataGold', amount: 3600 },
        condition: { type: 'win_with_squad', targetKeys: ['Typhoon_Squad_Flameheart', 'Typhoon_Squad_Dornier', 'Typhoon_Squad_613'] }
    },

    // --- 三星后勤：信使小队 ---
    {
        id: 'version_squad_messenger',
        category: 'version', title: '信使小队：作战成功', description: '携带信使小队全员（阿花·格娜·WALL-E）各三张，赢得一场对局胜利',
        targetCount: 1,
        reward: { type: 'dataGold', amount: 3600 },
        condition: { type: 'win_with_squad', targetKeys: ['Messenger_Squad_Ah_Hua', 'Messenger_Squad_Gena', 'Messenger_Squad_WALL_E'] }
    },

    // --- 三星后勤：御守小队 ---
    {
        id: 'version_squad_amulet',
        category: 'version', title: '御守小队：作战成功', description: '携带御守小队全员（灼·香蒲·桃子）各三张，赢得一场对局胜利',
        targetCount: 1,
        reward: { type: 'dataGold', amount: 3600 },
        condition: { type: 'win_with_squad', targetKeys: ['Amulet_Squad_Scorching', 'Amulet_Squad_Cattail', 'Amulet_Squad_Peaches'] }
    },

    // --- 三星后勤：梵灵小队 ---
    {
        id: 'version_squad_fanling',
        category: 'version', title: '梵灵小队：作战成功', description: '携带梵灵小队全员（露茜娅·纳芙·瓦茜）各三张，赢得一场对局胜利',
        targetCount: 1,
        reward: { type: 'dataGold', amount: 3600 },
        condition: { type: 'win_with_squad', targetKeys: ['FanLing_Squad_Lucia', 'FanLing_Squad_Nafu', 'FanLing_Squad_Wasi'] }
    },

    // --- 安卡希雅专属后勤：圣树小队 ---
    {
        id: 'version_squad_sacred_tree',
        category: 'version', title: '圣树小队：作战成功', description: '携带圣树小队全员（露米·玛格丽特·阿尔维娜）各三张，赢得一场对局胜利',
        targetCount: 1,
        reward: { type: 'dataGold', amount: 3600 },
        condition: { type: 'win_with_squad', targetKeys: ['Sacred_Tree_Squad_Lumi', 'Sacred_Tree_Squad_Margaret', 'Sacred_Tree_Squad_Alvina'] }
    },
];