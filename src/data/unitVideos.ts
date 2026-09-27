// ==========================================
// 单位动态卡面视频映射
// [2026-09-26 莉莉子] 用 MiniMax H3 生成的单位卡动态视频，替代静态单位立绘
//   对应 UNIT_IMAGES 的卡牌 key：
//     Marian_Wolf_Tooth_Beacon ↔ units/Marian_Wolf_Tooth_Beacon_00（_00 为 skinId 后缀）
//     mauxir_lotus_pedestal    ↔ units/mauxir_lotus_pedestal
//   默认仍为静态（spellDynamic=false），与法术卡面共用「动态卡牌」开关
//   生效范围：对局核心（手牌/场上/悬停预览），图鉴/卡池保持静态
// ==========================================
import unit_wolf_tooth_beacon from '../movie/units/Marian_Wolf_Tooth_Beacon_00.webm';
import unit_mauxir_lotus_pedestal from '../movie/units/mauxir_lotus_pedestal.webm';

// 卡牌 key → 动态单位卡面视频 URL
export const UNIT_VIDEOS: Record<string, string> = {
    Marian_Wolf_Tooth_Beacon: unit_wolf_tooth_beacon,  // 獠牙信标（茉莉安霄鹰）
    mauxir_lotus_pedestal: unit_mauxir_lotus_pedestal, // 臆莲基座（猫汐尔莲驱）
};

/** 获取指定单位卡牌 key 的动态卡面视频 URL（无则 undefined → 使用静态图兜底） */
export const getUnitVideo = (key: string): string | undefined => UNIT_VIDEOS[key];
