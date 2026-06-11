import { getVideoUrl } from '../utils/videoPreloader';
import { useState, useCallback } from 'react';
import { getRandomTitleMovie, getLevelUpMovie, getVictoryMovie, getHallMovies } from '../data/movieData';

export const useMovie = () => {
    const [currentMovie, setCurrentMovie] = useState<string | null>(null);
    const [isLooping, setIsLooping] = useState(false);
    const [isVisible, setIsVisible] = useState(false);
    const [isImmediate, setIsImmediate] = useState(false);
    const [onComplete, setOnComplete] = useState<(() => void) | undefined>(undefined);

    const [movieVolume, setMovieVolumeState] = useState(1.0);

    const setMovieVolume = useCallback((vol: number) => {
        setMovieVolumeState(Math.max(0, Math.min(1, vol)));
    }, []);

    // [新增] 获取最终播放 URL：优先用预加载的 blob URL（通过共享预加载器）
    const resolveMovieUrl = useCallback((src: string): string => {
        return getVideoUrl(src);
    }, []);
    // 播放标题循环视频
    const playTitleMovie = useCallback(() => {
        const movie = getRandomTitleMovie();
        if (movie) {
            setCurrentMovie(movie);
            setIsLooping(true);
            setIsVisible(true);
            setOnComplete(undefined);
        }
    }, []);

    // [新增] 播放大厅视频
    const playHallMovie = useCallback((index?: number) => {
        const movies = getHallMovies();
        if (movies.length === 0) return 0;

        let nextIndex = 0;
        if (index !== undefined) {
            // 如果指定了索引，取模确保不越界 (循环切换)
            nextIndex = index % movies.length;
        } else {
            // 随机播放
            nextIndex = Math.floor(Math.random() * movies.length);
        }

        setCurrentMovie(movies[nextIndex]);
        setIsLooping(true); // 大厅视频需要循环
        setIsVisible(true);
        setIsImmediate(false); // 正常淡入
        setOnComplete(undefined);

        return nextIndex;
    }, []);

    // 播放升级视频 (一次性) — 优先使用预加载的 blob URL
    const playLevelUpMovie = useCallback((heroKey: string, onEnd?: () => void) => {
        const movie = getLevelUpMovie(heroKey);
        if (movie) {
            setCurrentMovie(resolveMovieUrl(movie));
            setIsLooping(false);
            setIsVisible(true);
            setOnComplete(() => onEnd); // 存储回调
        } else {
            // 如果没找到视频，直接执行回调，防止流程卡死
            if (onEnd) onEnd();
        }
    }, [resolveMovieUrl]);

    // 播放胜利视频 (一次性) — 优先使用预加载的 blob URL
    const playVictoryMovie = useCallback((heroKeys: string[], onEnd?: () => void) => {
        const movie = getVictoryMovie(heroKeys);
        if (movie) {
            setCurrentMovie(resolveMovieUrl(movie));
            setIsLooping(false);
            setIsVisible(true);
            setOnComplete(() => onEnd);
        } else {
            if (onEnd) onEnd();
        }
    }, [resolveMovieUrl]);

    // [修改] 支持传入 immediate 参数
    const stopMovie = useCallback((immediate: boolean = false) => {
        setIsImmediate(immediate); // 记录意图
        setIsVisible(false);
    }, []);

    // 视频结束时的内部处理
    const handleVideoEnded = useCallback(() => {
        if (!isLooping) {
            // 先淡出
            setIsVisible(false);
            // 执行外部回调
            if (onComplete) {
                onComplete();
            }
        }
    }, [isLooping, onComplete]);

    // [新增] 预加载升级影片：供 ChampionLevelUp 在 spin 阶段调用
    /* 已迁移至 videoPreloader.ts */

    return {
        currentMovie,
        isLooping,
        isVisible,
        playTitleMovie,
        playLevelUpMovie,
        playVictoryMovie,
        playHallMovie, // [新增] 导出
        stopMovie,
        isImmediate,
        handleVideoEnded,
        movieVolume,
        setMovieVolume,
    };
};