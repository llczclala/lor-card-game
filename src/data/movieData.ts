// [核心重构] 导入标题页多分辨率 WebM
import title_bg_1k from '../movie/title/烬中焰火/1k.webm';
import title_bg_2k from '../movie/title/烬中焰火/2k.webm';
import title_bg_4k from '../movie/title/烬中焰火/4k.webm';
// [新增] 导入大厅背景视频 (全面扩充至13个)
import hall_bg_1 from '../movie/hall/hall1.mp4';
import hall_bg_2 from '../movie/hall/hall2.mp4';
import hall_bg_3 from '../movie/hall/hall3.mp4';
import hall_bg_4 from '../movie/hall/hall4.mp4';
import hall_bg_5 from '../movie/hall/hall5.mp4';
import hall_bg_6 from '../movie/hall/hall6.mp4';
import hall_bg_7 from '../movie/hall/hall7.mp4';
import hall_bg_8 from '../movie/hall/hall8.mp4';
import hall_bg_9 from '../movie/hall/hall9.mp4';
import hall_bg_10 from '../movie/hall/hall10.mp4';
import hall_bg_11 from '../movie/hall/hall11.mp4';
import hall_bg_12 from '../movie/hall/hall12.mp4';
import hall_bg_13 from '../movie/hall/hall13.mp4';
// [核心重构] 导入英雄多分辨率 WebM
// 里芙
import lyfe_levelup_1k from '../movie/level up/里芙_level up/1k.webm';
import lyfe_levelup_2k from '../movie/level up/里芙_level up/2k.webm';
import lyfe_levelup_4k from '../movie/level up/里芙_level up/4k.webm';
import lyfe_win_1k from '../movie/win/里芙_win/1k.webm';
import lyfe_win_2k from '../movie/win/里芙_win/2k.webm';
import lyfe_win_4k from '../movie/win/里芙_win/4k.webm';
// 芬妮
import fenny_levelup_1k from '../movie/level up/芬妮_level up/1k.webm';
import fenny_levelup_2k from '../movie/level up/芬妮_level up/2k.webm';
import fenny_levelup_4k from '../movie/level up/芬妮_level up/4k.webm';
import fenny_win_1k from '../movie/win/芬妮_win/1k.webm';
import fenny_win_2k from '../movie/win/芬妮_win/2k.webm';
import fenny_win_4k from '../movie/win/芬妮_win/4k.webm';
// 卜卜灵鉴
import pupu_levelup_1k from '../movie/level up/卜卜灵鉴_level up/1k.webm';
import pupu_levelup_2k from '../movie/level up/卜卜灵鉴_level up/2k.webm';
import pupu_levelup_4k from '../movie/level up/卜卜灵鉴_level up/4k.webm';
import pupu_win_1k from '../movie/win/卜卜灵鉴_win/1k.webm';
import pupu_win_2k from '../movie/win/卜卜灵鉴_win/2k.webm';
import pupu_win_4k from '../movie/win/卜卜灵鉴_win/4k.webm';

// 定义视频类型
export type MovieType = 'title' | 'levelup' | 'win';

// [新增] 分辨率与多分辨率源类型
export type VideoResolution = '1k' | '2k' | '4k';
export type MovieSource = Record<VideoResolution, string>;

export const MOVIE_DB = {
    // 标题视频升级为多分辨率聚合对象
    title: [
        { '1k': title_bg_1k, '2k': title_bg_2k, '4k': title_bg_4k }
    ] as MovieSource[],

    // 大厅视频目前保持单源 .mp4
    hall: [
        hall_bg_1, hall_bg_2, hall_bg_3, hall_bg_4, hall_bg_5,
        hall_bg_6, hall_bg_7, hall_bg_8, hall_bg_9, hall_bg_10,
        hall_bg_11, hall_bg_12, hall_bg_13
    ] as string[],

    // 升级动画映射 (升级为多分辨率聚合对象)
    levelup: {
        lyfe: { '1k': lyfe_levelup_1k, '2k': lyfe_levelup_2k, '4k': lyfe_levelup_4k },
        fenny: { '1k': fenny_levelup_1k, '2k': fenny_levelup_2k, '4k': fenny_levelup_4k },
        pupu_specular_soul: { '1k': pupu_levelup_1k, '2k': pupu_levelup_2k, '4k': pupu_levelup_4k }
    } as Record<string, MovieSource>,

    // 胜利动画映射 (升级为多分辨率聚合对象)
    win: {
        lyfe: [{ '1k': lyfe_win_1k, '2k': lyfe_win_2k, '4k': lyfe_win_4k }],
        fenny: [{ '1k': fenny_win_1k, '2k': fenny_win_2k, '4k': fenny_win_4k }],
        pupu_specular_soul: [{ '1k': pupu_win_1k, '2k': pupu_win_2k, '4k': pupu_win_4k }]
    } as Record<string, MovieSource[]>
};

/**
 * 辅助函数：获取随机标题视频 (支持分辨率选择)
 */
export const getRandomTitleMovie = (res: VideoResolution = '1k'): string => {
    const list = MOVIE_DB.title;
    const movie = list[Math.floor(Math.random() * list.length)];
    return movie[res] || movie['1k']; // 兜底返回 1k
};

/**
 * 辅助函数：根据英雄获取升级视频 (支持分辨率选择)
 */
export const getLevelUpMovie = (heroKey: string, res: VideoResolution = '1k'): string | null => {
    const movie = MOVIE_DB.levelup[heroKey];
    return movie ? (movie[res] || movie['1k']) : null;
};

/**
 * 辅助函数：根据在场英雄列表获取随机胜利视频 (支持分辨率选择)
 */
export const getVictoryMovie = (heroKeys: string[], res: VideoResolution = '1k'): string | null => {
    // 1. 筛选出有胜利动画的英雄
    const availableHeroes = heroKeys.filter(key => MOVIE_DB.win[key] && MOVIE_DB.win[key].length > 0);

    if (availableHeroes.length === 0) return null;

    // 2. 随机选一个英雄
    const randomHero = availableHeroes[Math.floor(Math.random() * availableHeroes.length)];
    const movies = MOVIE_DB.win[randomHero];

    // 3. 随机选该英雄的一个视频并根据分辨率提取 URL
    const movie = movies[Math.floor(Math.random() * movies.length)];
    return movie[res] || movie['1k'];
};


// [新增] 辅助函数：获取大厅视频列表
export const getHallMovies = () => {
    return MOVIE_DB.hall;
};

// ==========================================
// [核心新增] 大厅音画联动映射字典
// ==========================================
const HALL_BGM_MAPPING = [
    'hall_1', 'hall_1', // 1, 2: 永恒之约
    'hall_2', 'hall_2', // 3, 4: 轻触慢挑
    'hall_3', 'hall_3', // 5, 6: 并蒂良缘
    'hall_4',           // 7: 秘林徜徉
    'hall_5', 'hall_5', // 8, 9: 爱语恋歌
    'hall_6', 'hall_6', // 10, 11: 水色情愫
    'hall_7', 'hall_7'  // 12, 13: 与你交织的命运线
];

/**
 * 辅助函数：根据当前大厅视频的索引，精准获取对应的 BGM 资源 Key
 */
export const getHallBgmByIndex = (index: number): string => {
    return HALL_BGM_MAPPING[index % HALL_BGM_MAPPING.length] || 'default';
};