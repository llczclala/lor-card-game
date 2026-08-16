// ==========================================
// 动态牌桌视频映射
// [2026-08-13 莉莉子] 用 MiniMax H3 生成的动态牌桌视频，替代静态牌桌图
// [2026-08-15 莉莉子] 全部 10 张牌桌动态版已接入（01.mp4 ~ 10.mp4）
//   默认仍为静态牌桌（deskDynamic=false），玩家在设置里手动开启动态版
// ==========================================
import desk_01 from '../movie/desk/01.mp4';
import desk_02 from '../movie/desk/02.mp4';
import desk_03 from '../movie/desk/03.mp4';
import desk_04 from '../movie/desk/04.mp4';
import desk_05 from '../movie/desk/05.mp4';
import desk_06 from '../movie/desk/06.mp4';
import desk_07 from '../movie/desk/07.mp4';
import desk_08 from '../movie/desk/08.mp4';
import desk_09 from '../movie/desk/09.mp4';
import desk_10 from '../movie/desk/10.mp4';

// deskIndex → 动态视频 URL（deskIndex 是 desks 数组索引，与 PNG 编号差 1：
//   desks = [01.png, 02.png, ..., 10.png] → 01.png 对应索引 0，10.png 对应索引 9）
export const DESK_VIDEOS: Record<number, string> = {
    0: desk_01, // 01 号牌桌（01.png = desks[0]）· 动态视频
    1: desk_02, // 02 号牌桌（02.png = desks[1]）· 动态视频
    2: desk_03, // 03 号牌桌（03.png = desks[2]）· 动态视频
    3: desk_04, // 04 号牌桌（04.png = desks[3]）· 动态视频
    4: desk_05, // 05 号牌桌（05.png = desks[4]）· 动态视频
    5: desk_06, // 06 号牌桌（06.png = desks[5]）· 动态视频
    6: desk_07, // 07 号牌桌（07.png = desks[6]）· 动态视频
    7: desk_08, // 08 号牌桌（08.png = desks[7]）· 动态视频
    8: desk_09, // 09 号牌桌（09.png = desks[8]）· 动态视频
    9: desk_10, // 10 号牌桌（10.png = desks[9]）· 动态视频
};

/** 获取指定牌桌的动态视频 URL（无则 undefined → 使用静态图） */
export const getDeskVideo = (deskIndex: number): string | undefined => DESK_VIDEOS[deskIndex];
