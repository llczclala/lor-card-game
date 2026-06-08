// 导入标题页视频
import title_bg_1 from '../movie/title/标题页1.mp4';
// [新增] 导入大厅背景视频
import hall_bg_1 from '../movie/hall/hall1.mp4';
import hall_bg_2 from '../movie/hall/hall2.mp4';
// 导入里芙的视频
import lyfe_levelup from '../movie/level up/里芙_level up.mp4';
import lyfe_win from '../movie/win/里芙_win.mp4';

import fenny_levelup from '../movie/level up/芬妮_level up.mp4';
import fenny_win from '../movie/win/芬妮_win.mp4';

import pupu_specular_soul_levelup from '../movie/level up/卜卜灵鉴_level up.mp4';
import pupu_specular_soul_win from '../movie/win/卜卜灵鉴_win.mp4';

// 定义视频类型
export type MovieType = 'title' | 'levelup' | 'win';


export const MOVIE_DB = {
    title: [title_bg_1],

    // 大厅视频列表
    hall: [hall_bg_1, hall_bg_2],

    // 升级动画映射 (Key: 英雄ID -> 对应 cards.ts 中的 key)
    levelup: {
        lyfe: lyfe_levelup,
        fenny: fenny_levelup, // [修正] 注册芬妮升级视频
        pupu_specular_soul: pupu_specular_soul_levelup
    } as Record<string, string>,

    // 胜利动画映射 (Key: 英雄ID -> 视频数组)
    win: {
        lyfe: [lyfe_win],
        fenny: [fenny_win],   // [修正] 注册芬妮胜利视频
        pupu_specular_soul: [pupu_specular_soul_win]
    } as Record<string, string[]>
};

/**
 * 辅助函数：获取随机标题视频
 */
export const getRandomTitleMovie = () => {
    const list = MOVIE_DB.title;
    return list[Math.floor(Math.random() * list.length)];
};

/**
 * 辅助函数：根据英雄获取升级视频
 */
export const getLevelUpMovie = (heroKey: string): string | null => {
    return MOVIE_DB.levelup[heroKey] || null;
};

/**
 * 辅助函数：根据在场英雄列表获取随机胜利视频
 */
export const getVictoryMovie = (heroKeys: string[]): string | null => {
    // 1. 筛选出有胜利动画的英雄
    const availableHeroes = heroKeys.filter(key => MOVIE_DB.win[key] && MOVIE_DB.win[key].length > 0);

    if (availableHeroes.length === 0) return null;

    // 2. 随机选一个英雄
    const randomHero = availableHeroes[Math.floor(Math.random() * availableHeroes.length)];
    const movies = MOVIE_DB.win[randomHero];

    // 3. 随机选该英雄的一个视频
    return movies[Math.floor(Math.random() * movies.length)];
};


// [新增] 辅助函数：获取大厅视频列表
export const getHallMovies = () => {
    return MOVIE_DB.hall;
};