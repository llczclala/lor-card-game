// ==========================================
// 动态卡背视频映射
// [2026-08-23 莉莉子] 用 MiniMax H3 生成的动态卡背视频，替代静态卡背图
//   对应 PERSONALIZATION_ASSETS.cardBacks 数组索引：
//     视频文件名与静态卡背文件名一一对应（02_.mp4 ↔ 02.webp 等）
//   默认卡背（index 0 / cb_01）无动态视频 → 使用静态图
//   默认仍为静态卡背（cardBackDynamic=false），玩家在设置里手动开启动态版
// ==========================================
import cb_video_02 from '../movie/card_back/02_.mp4';
import cb_video_03 from '../movie/card_back/03_.mp4';
import cb_video_04 from '../movie/card_back/04_.mp4';
import cb_video_fenny from '../movie/card_back/fenny.mp4';
import cb_video_lyfe from '../movie/card_back/lyfe.mp4';
import cb_video_pupu from '../movie/card_back/pupu_specular.mp4';
import cb_video_05 from '../movie/card_back/05_.mp4';
import cb_video_06 from '../movie/card_back/06_.mp4';
import cb_video_07 from '../movie/card_back/07_.mp4';
import cb_video_08 from '../movie/card_back/08_.mp4';
import cb_video_09 from '../movie/card_back/09_.mp4';
import cb_video_10 from '../movie/card_back/10_.mp4';
import cb_video_11 from '../movie/card_back/11_.mp4';
import cb_video_12 from '../movie/card_back/12_.mp4';
import cb_video_13 from '../movie/card_back/13_.mp4';
import cb_video_mauxir from '../movie/card_back/mauxir_lotus_drive.mp4';

// 卡背索引 → 动态视频 URL（对齐 PERSONALIZATION_ASSETS.cardBacks 数组索引）
//   index 0 = 默认卡背（cb_01）→ 无动态视频
//   1=cb_02 / 2=cb_03 / 3=cb_04 / 4=cb_fenny / 5=cb_lyfe / 6=cb_pupu /
//   7=cb_05 / 8=cb_06 / 9=cb_07 / 10=cb_08 / 11=cb_09 / 12=cb_10 /
//   13=cb_11 / 14=cb_12 / 15=cb_13 / 16=cb_mauxir_lotus_drive
export const CARD_BACK_VIDEOS: Record<number, string> = {
    1: cb_video_02,       // 02_ 号卡背
    2: cb_video_03,       // 03_ 号卡背
    3: cb_video_04,       // 04_ 号卡背
    4: cb_video_fenny,    // 芬妮卡背
    5: cb_video_lyfe,     // 里芙卡背
    6: cb_video_pupu,     // 卜卜灵鉴卡背
    7: cb_video_05,       // 05_ 号卡背
    8: cb_video_06,       // 06_ 号卡背
    9: cb_video_07,       // 07_ 号卡背
    10: cb_video_08,      // 08_ 号卡背
    11: cb_video_09,      // 09_ 号卡背
    12: cb_video_10,      // 10_ 号卡背
    13: cb_video_11,      // 11_ 号卡背
    14: cb_video_12,      // 12_ 号卡背
    15: cb_video_13,      // 13_ 号卡背
    16: cb_video_mauxir,  // 猫汐尔莲驱卡背
};

/** 获取指定卡背索引的动态视频 URL（无则 undefined → 使用静态图） */
export const getCardBackVideo = (cardBackIndex: number): string | undefined => CARD_BACK_VIDEOS[cardBackIndex];
