// 导入标题页视频
import title_bg_1 from '../movie/title/标题页1.mp4';
// [新增] 导入大厅背景视频
import hall_bg_1 from '../movie/hall/hall1.mp4';
import hall_bg_2 from '../movie/hall/hall2.mp4';
// 导入里芙的视频
import lyfe_levelup from '../movie/level up/里芙_level up.mp4';
import lyfe_win from '../movie/win/里芙_win.mp4';

// 导入芬妮的视频 (假设未来会有)
// import fenny_levelup from '../movie/level up/芬妮_level up.mp4';
// import fenny_win from '../movie/win/芬妮_win.mp4';

// 定义视频类型
export type MovieType = 'title' | 'levelup' | 'win';


export const MOVIE_DB = {
    title: [title_bg_1],

    // [新增] 大厅视频列表
    hall: [hall_bg_1, hall_bg_2],

    // 升级动画映射 (Key: 英雄ID)
    levelup: {
        lyfe: lyfe_levelup,
        // fenny: fenny_levelup
    } as Record<string, string>,

    // 胜利动画映射 (Key: 英雄ID)
    win: {
        lyfe: [lyfe_win],
        // fenny: [fenny_win]
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
    // 1. 找出所有有胜利动画的在场英雄
    const candidates: string[] = [];
    heroKeys.forEach(key => {
        const movies = MOVIE_DB.win[key];
        if (movies && movies.length > 0) {
            candidates.push(...movies);
        }
    });

    // 2. 如果没有找到，返回 null
    if (candidates.length === 0) return null;

    // 3. 随机选一个
    return candidates[Math.floor(Math.random() * candidates.length)];
};


// [新增] 辅助函数：获取大厅视频列表
export const getHallMovies = () => {
    return MOVIE_DB.hall;
};