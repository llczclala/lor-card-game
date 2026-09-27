// ==========================================
// 动态牌桌视频映射
// [2026-08-13 莉莉子] 用 MiniMax H3 生成的动态牌桌视频，替代静态牌桌图
// [2026-08-15 莉莉子] 全部 10 张牌桌动态版已接入（01 ~ 10）
// [2026-09-26 莉莉子] ① 09/10 由 MP4 统一转码为 VP9 WebM（全量格式统一）
//                     ② 新增 11 ~ 15 五张动态牌桌（含 4K 源转 1080p）
//   默认仍为静态牌桌（deskDynamic=false），玩家在设置里手动开启动态版
// ==========================================
import desk_01 from '../movie/desk/01.webm';
import desk_02 from '../movie/desk/02.webm';
import desk_03 from '../movie/desk/03.webm';
import desk_04 from '../movie/desk/04.webm';
import desk_05 from '../movie/desk/05.webm';
import desk_06 from '../movie/desk/06.webm';
import desk_07 from '../movie/desk/07.webm';
import desk_08 from '../movie/desk/08.webm';
import desk_09 from '../movie/desk/09.webm';
import desk_10 from '../movie/desk/10.webm';
import desk_11 from '../movie/desk/11.webm';
import desk_12 from '../movie/desk/12.webm';
import desk_13 from '../movie/desk/13.webm';
import desk_14 from '../movie/desk/14.webm';
import desk_15 from '../movie/desk/15.webm';

// deskIndex → 动态视频 URL（deskIndex 是 desks 数组索引，与 PNG 编号差 1：
//   desks = [01.png, 02.png, ..., 15.png] → 01.png 对应索引 0，15.png 对应索引 14）
export const DESK_VIDEOS: Record<number, string> = {
    0: desk_01,  // 01 号牌桌（01.png = desks[0]）· 动态视频
    1: desk_02,  // 02 号牌桌（02.png = desks[1]）· 动态视频
    2: desk_03,  // 03 号牌桌（03.png = desks[2]）· 动态视频
    3: desk_04,  // 04 号牌桌（04.png = desks[3]）· 动态视频
    4: desk_05,  // 05 号牌桌（05.png = desks[4]）· 动态视频
    5: desk_06,  // 06 号牌桌（06.png = desks[5]）· 动态视频
    6: desk_07,  // 07 号牌桌（07.png = desks[6]）· 动态视频
    7: desk_08,  // 08 号牌桌（08.png = desks[7]）· 动态视频
    8: desk_09,  // 09 号牌桌（09.png = desks[8]）· 动态视频
    9: desk_10,  // 10 号牌桌（10.png = desks[9]）· 动态视频
    10: desk_11, // 11 号牌桌（11.png = desks[10]）· 动态视频
    11: desk_12, // 12 号牌桌（12.png = desks[11]）· 动态视频
    12: desk_13, // 13 号牌桌（13.png = desks[12]）· 动态视频
    13: desk_14, // 14 号牌桌（14.png = desks[13]）· 动态视频
    14: desk_15, // 15 号牌桌（15.png = desks[14]）· 动态视频
};

/** 获取指定牌桌的动态视频 URL（无则 undefined → 使用静态图） */
export const getDeskVideo = (deskIndex: number): string | undefined => DESK_VIDEOS[deskIndex];
