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

    // 牌桌 (Desks)
    { type: 'desk', index: 1, name: '富丽堂皇', source: 'BOTH', price: 5 },
    { type: 'desk', index: 2, name: '零区深地', source: 'BOTH', price: 5 },
    { type: 'desk', index: 3, name: '冰与火之歌', source: 'BOTH', price: 5 },
    { type: 'desk', index: 4, name: '二律背反', source: 'BOTH', price: 5 },
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