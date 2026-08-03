/**
 * ==============================================================================
 * 《Snowbreak Rivals》 全局皮肤资产注册局 (Skin Registry)
 * ==============================================================================
 * 规则声明：
 * 1. '_00' 视为卡牌原画 (Base Art)，不属于皮肤，严禁入库。
 * 2. source:
 * - 'SHOP': 仅限黑市商店直售
 * - 'GACHA': 仅限抽卡盲盒产出
 * - 'BOTH': 商店与盲盒均可获取
 * - 'MISSION': 专属任务/活动获取 (需配置 missionId)
 * - 'HIDDEN': 隐藏/不可获取状态
 * ==============================================================================
 */

export type CosmeticSource = 'SHOP' | 'GACHA' | 'BOTH' | 'MISSION' | 'HIDDEN';
export type CosmeticType = 'skin' | 'cardBack' | 'desk'; // [核心新增] 资产类型分类

export interface CosmeticConfig {
    type: CosmeticType;    // 资产大类
    name: string;          // [核心新增] 资产专属定制名称 (待填)
    source: CosmeticSource;// 获取渠道
    price?: number;        // 商店售价 (比特金)
    missionId?: string;    // 绑定任务ID (若 source 为 MISSION)

    // --- 皮肤专属字段 ---
    cardKey?: string;
    skinId?: number;

    // --- 饰品专属字段 (卡背/棋盘) ---
    index?: number;
}

export const COSMETIC_REGISTRY: CosmeticConfig[] = [
    // ==========================================
    // 👗 皮肤资产区 (Skins)
    // ==========================================
    // Logistics (后勤) · 守梦人小队
    { type: 'skin', name: '休息一刻', cardKey: 'Dream_Guardians_Squad_Martina', skinId: 1, source: 'BOTH', price: 1 },
    { type: 'skin', name: '休息一刻', cardKey: 'Dream_Guardians_Squad_Saikui',  skinId: 1, source: 'BOTH', price: 1 },
    { type: 'skin', name: '休息一刻', cardKey: 'Dream_Guardians_Squad_Haifa',   skinId: 1, source: 'BOTH', price: 1 },

    // Logistics (后勤) · 信使小队
    { type: 'skin', name: '休息一刻', cardKey: 'Messenger_Squad_Ah_Hua', skinId: 1, source: 'BOTH', price: 1 },
    { type: 'skin', name: '休息一刻', cardKey: 'Messenger_Squad_Gena',   skinId: 1, source: 'BOTH', price: 1 },
    { type: 'skin', name: '休息一刻', cardKey: 'Messenger_Squad_WALL_E', skinId: 1, source: 'BOTH', price: 1 },

    // Lyfe (里芙) · 鬼怪小队
    { type: 'skin', name: '阶段二', cardKey: 'Ghost_Squad_Antina', skinId: 1, source: 'MISSION', missionId: 'mission_ghost_antina_01' },
    { type: 'skin', name: '休息一刻', cardKey: 'Ghost_Squad_Antina', skinId: 2, source: 'BOTH', price: 1 },
    { type: 'skin', name: '阶段二', cardKey: 'Ghost_Squad_Vez',    skinId: 1, source: 'MISSION', missionId: 'mission_ghost_vez_01' },
    { type: 'skin', name: '休息一刻', cardKey: 'Ghost_Squad_Vez',    skinId: 2, source: 'BOTH', price: 1 },
    { type: 'skin', name: '阶段二', cardKey: 'Ghost_Squad_Valen',  skinId: 1, source: 'MISSION', missionId: 'mission_ghost_valen_01' },
    { type: 'skin', name: '休息一刻', cardKey: 'Ghost_Squad_Valen',  skinId: 2, source: 'BOTH', price: 1 },

    // Fenny (芬妮) · 阿尔戈小队
    { type: 'skin', name: '阶段二', cardKey: 'Argo_Squad_Pigeon',    skinId: 1, source: 'MISSION', missionId: 'mission_argo_pigeon_01' },
    { type: 'skin', name: '休息一刻', cardKey: 'Argo_Squad_Pigeon',    skinId: 2, source: 'BOTH', price: 1 },
    { type: 'skin', name: '阶段二', cardKey: 'Argo_Squad_Musician',  skinId: 1, source: 'MISSION', missionId: 'mission_argo_musician_01' },
    { type: 'skin', name: '休息一刻', cardKey: 'Argo_Squad_Musician',  skinId: 2, source: 'BOTH', price: 1 },
    { type: 'skin', name: '阶段二', cardKey: 'Argo_Squad_Arrowhead', skinId: 1, source: 'MISSION', missionId: 'mission_argo_arrowhead_01' },
    { type: 'skin', name: '休息一刻', cardKey: 'Argo_Squad_Arrowhead', skinId: 2, source: 'BOTH', price: 1 },

    // Fenny (芬妮) · 堤丰小队
    { type: 'skin', name: '休息一刻', cardKey: 'Typhoon_Squad_Flameheart', skinId: 1, source: 'BOTH', price: 1 },
    { type: 'skin', name: '休息一刻', cardKey: 'Typhoon_Squad_Dornier',    skinId: 1, source: 'BOTH', price: 1 },
    { type: 'skin', name: '休息一刻', cardKey: 'Typhoon_Squad_613',        skinId: 1, source: 'BOTH', price: 1 },

    // PuPu (卜卜) · 阿尔斯特小队
    { type: 'skin', name: '休息一刻', cardKey: 'Ulster_Squad_Koni',   skinId: 1, source: 'BOTH', price: 1 },
    { type: 'skin', name: '休息一刻', cardKey: 'Ulster_Squad_Maeve',  skinId: 1, source: 'BOTH', price: 1 },
    { type: 'skin', name: '休息一刻', cardKey: 'Ulster_Squad_Flamme', skinId: 1, source: 'BOTH', price: 1 },

    // Mauxir (猫汐尔) · 明夷小队
    { type: 'skin', name: '阶段二', cardKey: 'Mingyi_Squad_Zhe_hao',  skinId: 1, source: 'MISSION', missionId: 'mission_mingyi_zhe_hao_01' },
    { type: 'skin', name: '休息一刻', cardKey: 'Mingyi_Squad_Zhe_hao',  skinId: 2, source: 'BOTH', price: 1 },
    { type: 'skin', name: '阶段二', cardKey: 'Mingyi_Squad_Zhu_He',   skinId: 1, source: 'MISSION', missionId: 'mission_mingyi_zhu_he_01' },
    { type: 'skin', name: '休息一刻', cardKey: 'Mingyi_Squad_Zhu_He',   skinId: 2, source: 'BOTH', price: 1 },
    { type: 'skin', name: '阶段二', cardKey: 'Mingyi_Squad_Jin_Lang', skinId: 1, source: 'MISSION', missionId: 'mission_mingyi_jin_lang_01' },
    { type: 'skin', name: '休息一刻', cardKey: 'Mingyi_Squad_Jin_Lang', skinId: 2, source: 'BOTH', price: 1 },

    // Mauxir (猫汐尔) · 星朗小队
    { type: 'skin', name: '阶段二', cardKey: 'Star_Bright_Squad_Doveil', skinId: 1, source: 'MISSION', missionId: 'mission_star_doveil_01' },
    { type: 'skin', name: '休息一刻', cardKey: 'Star_Bright_Squad_Doveil', skinId: 2, source: 'BOTH', price: 1 },
    { type: 'skin', name: '阶段二', cardKey: 'Star_Bright_Squad_Alivy',  skinId: 1, source: 'MISSION', missionId: 'mission_star_alivy_01' },
    { type: 'skin', name: '休息一刻', cardKey: 'Star_Bright_Squad_Alivy',  skinId: 2, source: 'BOTH', price: 1 },
    { type: 'skin', name: '阶段二', cardKey: 'Star_Bright_Squad_Dakors', skinId: 1, source: 'MISSION', missionId: 'mission_star_dakors_01' },
    { type: 'skin', name: '休息一刻', cardKey: 'Star_Bright_Squad_Dakors', skinId: 2, source: 'BOTH', price: 1 },

    // PuPu (卜卜) · 重夜小队
    { type: 'skin', name: '阶段二', cardKey: 'Chongye_Squad_Mabel', skinId: 1, source: 'MISSION', missionId: 'mission_chongye_mabel_01' },
    { type: 'skin', name: '休息一刻', cardKey: 'Chongye_Squad_Mabel', skinId: 2, source: 'BOTH', price: 1 },
    { type: 'skin', name: '阶段二', cardKey: 'Chongye_Squad_Elice', skinId: 1, source: 'MISSION', missionId: 'mission_chongye_elice_01' },
    { type: 'skin', name: '休息一刻', cardKey: 'Chongye_Squad_Elice', skinId: 2, source: 'BOTH', price: 1 },
    { type: 'skin', name: '阶段二', cardKey: 'Chongye_Squad_Golia', skinId: 1, source: 'MISSION', missionId: 'mission_chongye_golia_01' },
    { type: 'skin', name: '休息一刻', cardKey: 'Chongye_Squad_Golia', skinId: 2, source: 'BOTH', price: 1 },

    // Mauxir (猫汐尔) · 图征小队
    { type: 'skin', name: '阶段二', cardKey: 'Illustration_Squad_Kuranas', skinId: 1, source: 'MISSION', missionId: 'mission_illustration_kuranas_01' },
    { type: 'skin', name: '休息一刻', cardKey: 'Illustration_Squad_Kuranas', skinId: 2, source: 'BOTH', price: 1 },
    { type: 'skin', name: '阶段二', cardKey: 'Illustration_Squad_Swali', skinId: 1, source: 'MISSION', missionId: 'mission_illustration_swali_01' },
    { type: 'skin', name: '休息一刻', cardKey: 'Illustration_Squad_Swali', skinId: 2, source: 'BOTH', price: 1 },
    { type: 'skin', name: '阶段二', cardKey: 'Illustration_Squad_Soline', skinId: 1, source: 'MISSION', missionId: 'mission_illustration_soline_01' },
    { type: 'skin', name: '休息一刻', cardKey: 'Illustration_Squad_Soline', skinId: 2, source: 'BOTH', price: 1 },

    // Logistics (后勤) · 布里吉小队
    { type: 'skin', name: '阶段二', cardKey: 'Bridget_Squad_Feier', skinId: 1, source: 'MISSION', missionId: 'mission_bridget_feier_01' },
    { type: 'skin', name: '休息一刻', cardKey: 'Bridget_Squad_Feier', skinId: 2, source: 'BOTH', price: 1 },
    { type: 'skin', name: '阶段二', cardKey: 'Bridget_Squad_Chinchilla', skinId: 1, source: 'MISSION', missionId: 'mission_bridget_chinchilla_01' },
    { type: 'skin', name: '休息一刻', cardKey: 'Bridget_Squad_Chinchilla', skinId: 2, source: 'BOTH', price: 1 },
    { type: 'skin', name: '阶段二', cardKey: 'Bridget_Squad_Valerie', skinId: 1, source: 'MISSION', missionId: 'mission_bridget_valerie_01' },
    { type: 'skin', name: '休息一刻', cardKey: 'Bridget_Squad_Valerie', skinId: 2, source: 'BOTH', price: 1 },

    // Logistics (后勤) · 精灵小队
    { type: 'skin', name: '阶段二', cardKey: 'Spirit_Squad_Lusaka', skinId: 1, source: 'MISSION', missionId: 'mission_spirit_lusaka_01' },
    { type: 'skin', name: '休息一刻', cardKey: 'Spirit_Squad_Lusaka', skinId: 2, source: 'BOTH', price: 1 },
    { type: 'skin', name: '阶段二', cardKey: 'Spirit_Squad_Snenika', skinId: 1, source: 'MISSION', missionId: 'mission_spirit_snenika_01' },
    { type: 'skin', name: '休息一刻', cardKey: 'Spirit_Squad_Snenika', skinId: 2, source: 'BOTH', price: 1 },
    { type: 'skin', name: '阶段二', cardKey: 'Spirit_Squad_Bonnie', skinId: 1, source: 'MISSION', missionId: 'mission_spirit_bonnie_01' },
    { type: 'skin', name: '休息一刻', cardKey: 'Spirit_Squad_Bonnie', skinId: 2, source: 'BOTH', price: 1 },

    // Logistics (后勤) · 诗人小队
    { type: 'skin', name: '阶段二', cardKey: 'Poet_Squad_Oisin', skinId: 1, source: 'MISSION', missionId: 'mission_poet_oisin_01' },
    { type: 'skin', name: '休息一刻', cardKey: 'Poet_Squad_Oisin', skinId: 2, source: 'BOTH', price: 1 },
    { type: 'skin', name: '阶段二', cardKey: 'Poet_Squad_Caitlin', skinId: 1, source: 'MISSION', missionId: 'mission_poet_caitlin_01' },
    { type: 'skin', name: '休息一刻', cardKey: 'Poet_Squad_Caitlin', skinId: 2, source: 'BOTH', price: 1 },
    { type: 'skin', name: '阶段二', cardKey: 'Poet_Squad_Kelo', skinId: 1, source: 'MISSION', missionId: 'mission_poet_kelo_01' },
    { type: 'skin', name: '休息一刻', cardKey: 'Poet_Squad_Kelo', skinId: 2, source: 'BOTH', price: 1 },

    // Logistics (后勤) · 绿灵小队
    { type: 'skin', name: '阶段二', cardKey: 'Green_Spirit_Squad_Glanz', skinId: 1, source: 'MISSION', missionId: 'mission_green_glanz_01' },
    { type: 'skin', name: '休息一刻', cardKey: 'Green_Spirit_Squad_Glanz', skinId: 2, source: 'BOTH', price: 1 },
    { type: 'skin', name: '阶段二', cardKey: 'Green_Spirit_Squad_Eva', skinId: 1, source: 'MISSION', missionId: 'mission_green_eva_01' },
    { type: 'skin', name: '休息一刻', cardKey: 'Green_Spirit_Squad_Eva', skinId: 2, source: 'BOTH', price: 1 },
    { type: 'skin', name: '阶段二', cardKey: 'Green_Spirit_Squad_Grace', skinId: 1, source: 'MISSION', missionId: 'mission_green_grace_01' },
    { type: 'skin', name: '休息一刻', cardKey: 'Green_Spirit_Squad_Grace', skinId: 2, source: 'BOTH', price: 1 },

    // ==========================================
    
    // Logistics (后勤) · 锻造者 (The Forger)
    { type: 'skin', name: '阶段二', cardKey: 'The_Forger_Squad_Leisia', skinId: 1, source: 'MISSION', missionId: 'mission_forger_leisia_01' },
    { type: 'skin', name: '休息一刻', cardKey: 'The_Forger_Squad_Leisia', skinId: 2, source: 'BOTH', price: 1 },
    { type: 'skin', name: '阶段二', cardKey: 'The_Forger_Squad_Tatiana', skinId: 1, source: 'MISSION', missionId: 'mission_forger_tatiana_01' },
    { type: 'skin', name: '休息一刻', cardKey: 'The_Forger_Squad_Tatiana', skinId: 2, source: 'BOTH', price: 1 },
    { type: 'skin', name: '阶段二', cardKey: 'The_Forger_Squad_White_Hunt', skinId: 1, source: 'MISSION', missionId: 'mission_forger_white_hunt_01' },
    { type: 'skin', name: '休息一刻', cardKey: 'The_Forger_Squad_White_Hunt', skinId: 2, source: 'BOTH', price: 1 },

    // Logistics (后勤) · 梵音 (SacredChants)
    { type: 'skin', name: '阶段二', cardKey: 'SacredChants_Squad_Loka', skinId: 1, source: 'MISSION', missionId: 'mission_sacred_loka_01' },
    { type: 'skin', name: '休息一刻', cardKey: 'SacredChants_Squad_Loka', skinId: 2, source: 'BOTH', price: 1 },
    { type: 'skin', name: '阶段二', cardKey: 'SacredChants_Squad_European_Angelica', skinId: 1, source: 'MISSION', missionId: 'mission_sacred_angelica_01' },
    { type: 'skin', name: '休息一刻', cardKey: 'SacredChants_Squad_European_Angelica', skinId: 2, source: 'BOTH', price: 1 },
    { type: 'skin', name: '阶段二', cardKey: 'SacredChants_Squad_Shalo', skinId: 1, source: 'MISSION', missionId: 'mission_sacred_shalo_01' },
    { type: 'skin', name: '休息一刻', cardKey: 'SacredChants_Squad_Shalo', skinId: 2, source: 'BOTH', price: 1 },

    // Logistics (后勤) · 达努 (Danu)
    { type: 'skin', name: '阶段二', cardKey: 'Danu_Squad_Banshee', skinId: 1, source: 'MISSION', missionId: 'mission_danu_banshee_01' },
    { type: 'skin', name: '休息一刻', cardKey: 'Danu_Squad_Banshee', skinId: 2, source: 'BOTH', price: 1 },
    { type: 'skin', name: '阶段二', cardKey: 'Danu_Squad_Wendy', skinId: 1, source: 'MISSION', missionId: 'mission_danu_wendy_01' },
    { type: 'skin', name: '休息一刻', cardKey: 'Danu_Squad_Wendy', skinId: 2, source: 'BOTH', price: 1 },
    { type: 'skin', name: '阶段二', cardKey: 'Danu_Squad_SilverArm', skinId: 1, source: 'MISSION', missionId: 'mission_danu_silverarm_01' },
    { type: 'skin', name: '休息一刻', cardKey: 'Danu_Squad_SilverArm', skinId: 2, source: 'BOTH', price: 1 },

    // Logistics (后勤) · 鸦眼 (Crows Eyest)
    { type: 'skin', name: '阶段二', cardKey: 'Crows_Eyest_Squad_An', skinId: 1, source: 'MISSION', missionId: 'mission_crows_an_01' },
    { type: 'skin', name: '休息一刻', cardKey: 'Crows_Eyest_Squad_An', skinId: 2, source: 'BOTH', price: 1 },
    { type: 'skin', name: '阶段二', cardKey: 'Crows_Eyest_Squad_Mulin', skinId: 1, source: 'MISSION', missionId: 'mission_crows_mulin_01' },
    { type: 'skin', name: '休息一刻', cardKey: 'Crows_Eyest_Squad_Mulin', skinId: 2, source: 'BOTH', price: 1 },
    { type: 'skin', name: '阶段二', cardKey: 'Crows_Eyest_Squad_Hiki', skinId: 1, source: 'MISSION', missionId: 'mission_crows_hiki_01' },
    { type: 'skin', name: '休息一刻', cardKey: 'Crows_Eyest_Squad_Hiki', skinId: 2, source: 'BOTH', price: 1 },
    // 🍃 三星后勤 · 新小队
    // ==========================================

    // Logistics (后勤) · 御守小队
    { type: 'skin', name: '休息一刻', cardKey: 'Amulet_Squad_Scorching', skinId: 1, source: 'BOTH', price: 1 },
    { type: 'skin', name: '休息一刻', cardKey: 'Amulet_Squad_Cattail', skinId: 1, source: 'BOTH', price: 1 },
    { type: 'skin', name: '休息一刻', cardKey: 'Amulet_Squad_Peaches', skinId: 1, source: 'BOTH', price: 1 },

    // Logistics (后勤) · 梵灵小队
    { type: 'skin', name: '休息一刻', cardKey: 'FanLing_Squad_Lucia', skinId: 1, source: 'BOTH', price: 1 },
    { type: 'skin', name: '休息一刻', cardKey: 'FanLing_Squad_Nafu', skinId: 1, source: 'BOTH', price: 1 },
    { type: 'skin', name: '休息一刻', cardKey: 'FanLing_Squad_Wasi', skinId: 1, source: 'BOTH', price: 1 },

    // ==========================================
    // 🎴 饰品资产区 (Cosmetics)
    // ==========================================
    // 卡背 (Card Backs)
    { type: 'cardBack', index: 1, name: '去往瓦尔哈拉吧', source: 'BOTH', price: 5 },
    { type: 'cardBack', index: 2, name: '一二 一二', source: 'BOTH', price: 5 },
    { type: 'cardBack', index: 3, name: '绝不姑息', source: 'BOTH', price: 5 },
    { type: 'cardBack', index: 4, name: '芬妮', source: 'MISSION', missionId: 'mission_cb_fenny' },
    { type: 'cardBack', index: 5, name: '里芙', source: 'MISSION', missionId: 'mission_cb_lyfe' },
    { type: 'cardBack', index: 6, name: '卜卜灵鉴', source: 'MISSION', missionId: 'mission_cb_pupu' },
    // 永恒之约系列 (商店 10 比特金)
    { type: 'cardBack', index: 7, name: '永恒之约·里芙', source: 'SHOP', price: 10 },
    { type: 'cardBack', index: 8, name: '永恒之约·芬妮', source: 'SHOP', price: 10 },
    { type: 'cardBack', index: 9, name: '永恒之约·肴', source: 'SHOP', price: 10 },
    { type: 'cardBack', index: 10, name: '永恒之约·晨星', source: 'SHOP', price: 10 },
    { type: 'cardBack', index: 11, name: '永恒之约·凯西娅', source: 'SHOP', price: 10 },
    { type: 'cardBack', index: 12, name: '永恒之约·苔丝', source: 'SHOP', price: 10 },

    // 2026-07-22 新增卡背
    { type: 'cardBack', index: 13, name: '烬中镜火', source: 'BOTH', price: 5 },
    { type: 'cardBack', index: 14, name: '咫尺之间', source: 'BOTH', price: 5 },
    { type: 'cardBack', index: 15, name: '交给我吧', source: 'BOTH', price: 5 },
    { type: 'cardBack', index: 16, name: '莲心千瓣', source: 'MISSION', missionId: 'mission_cb_mauxir_lotus_drive' },

    // 牌桌 (Desks)
    { type: 'desk', index: 1, name: '富丽堂皇', source: 'BOTH', price: 5 },
    { type: 'desk', index: 2, name: '零区深地', source: 'BOTH', price: 5 },
    { type: 'desk', index: 3, name: '冰与火之歌', source: 'BOTH', price: 5 },
    { type: 'desk', index: 4, name: '二律背反', source: 'BOTH', price: 5 },
    // 2026-07-22 新增牌桌 (06-10)
    { type: 'desk', index: 5, name: '晴日穹顶', source: 'BOTH', price: 5 },
    { type: 'desk', index: 6, name: '层岩幽谷', source: 'BOTH', price: 5 },
    { type: 'desk', index: 7, name: '极光前哨', source: 'BOTH', price: 5 },
    { type: 'desk', index: 8, name: '甜心赛博', source: 'BOTH', price: 5 },
    { type: 'desk', index: 9, name: '月殿宫廷', source: 'BOTH', price: 5 },
];

// ==============================================================================
// 对外暴露的数据嗅探雷达 API
// ==============================================================================

/**
 * 获取所有可在商店中售卖的外观资产 (支持按类型筛选)
 */
export const getShopItems = (type?: CosmeticType): CosmeticConfig[] => {
    let items = COSMETIC_REGISTRY.filter(item => item.source === 'SHOP' || item.source === 'BOTH');
    if (type) items = items.filter(item => item.type === type);
    return items;
};

/**
 * 获取所有可放入抽卡盲盒的外观资产 (支持按类型筛选)
 */
export const getGachaItems = (type?: CosmeticType): CosmeticConfig[] => {
    let items = COSMETIC_REGISTRY.filter(item => item.source === 'GACHA' || item.source === 'BOTH');
    if (type) items = items.filter(item => item.type === type);
    return items;
};

/**
 * 获取所有被指定为任务/活动产出的外观资产 (支持按类型筛选)
 */
export const getMissionItems = (type?: CosmeticType): CosmeticConfig[] => {
    let items = COSMETIC_REGISTRY.filter(item => item.source === 'MISSION');
    if (type) items = items.filter(item => item.type === type);
    return items;
};