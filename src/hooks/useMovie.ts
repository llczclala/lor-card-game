import { getVideoUrl } from '../utils/videoPreloader';
import { useState, useCallback, useRef } from 'react';
import { getRandomTitleMovie, getLevelUpMovie, getVictoryMovie, getHallMovies } from '../data/movieData';
import type { VideoResolution } from '../data/movieData'; // [新增] 引入画质类型
// [2026-10-05 莉莉子 BUG修复 · 20261005-06] 音量改为"可读取的当前值"（模块级快照）
import { getVolume, setVolumeSnapshot } from '../utils/audioVolume';

// [核心重构] 接收画质参数，默认为 1k
export const useMovie = (resolution: VideoResolution = '1k') => {
    const [currentMovie, setCurrentMovie] = useState<string | null>(null);
    const [isLooping, setIsLooping] = useState(false);
    const [isVisible, setIsVisible] = useState(false);
    const [isImmediate, setIsImmediate] = useState(false);
    // ⚠️ [2026-10-05 莉莉子 BUG修复 · 20261005-11] 完成回调的**唯一真源**已改为下面的 `onCompleteRef`
    //   （原 state 会被后开播的影片覆盖 ⇒ 前一条流程干等；且"跳过"与"播完"会双发）。
    //   这里保留 state 只为兼容历史写入点（settle/clear 时会一起清），**不再有人读它**。
    const [, setOnComplete] = useState<(() => void) | undefined>(undefined);
    // [2026-10-03 莉莉子] **影片用途标记** —— 供上层决定"是否显示跳过按钮"（目前只有**胜利影片**需要）。
    //   只在**一次性**影片的播放函数里置位（升级 / 胜利），并在停片与播完时清空
    //   ⇒ 标题 / 大厅那类**循环**影片永远不会显示按钮。
    const [movieKind, setMovieKind] = useState<'levelup' | 'victory' | null>(null);

    // [2026-10-05 莉莉子] 初值改为**读取全局快照**（原来是写死的 1.0），与其余三条通道同口径
    const [movieVolume, setMovieVolumeState] = useState(getVolume('movie'));

    const setMovieVolume = useCallback((vol: number) => {
        const v = Math.max(0, Math.min(1, vol));
        setMovieVolumeState(v);
        setVolumeSnapshot('movie', v); // [2026-10-05] 同步全局快照
    }, []);

    // =====================================
    // [2026-10-05 莉莉子 BUG修复 · 20261005-11] **单例放映机的"必须给上一位一个交代"**
    // ── 病根（2026-08-30 定位的历史根因）：全 App 只有这一台放映机，`currentMovie` / `onComplete`
    //    都是**单槽 state**。升级影片与胜利影片（或连续两次升级）撞车时，**后开播的会覆盖先开播的
    //    回调** ⇒ 前一条流程的 `onComplete` 永远不来 ⇒ 升级队列 / 战斗结算 **干等死锁**。
    //    （`delayVictoryMovie` 只把两段错开，并没有解决"回调被吞"。）
    // ── 修法：把回调**同时**存一份 ref；任何新片开播（或回到循环影片）之前，先替上一部
    //    **结清回调**（并留下 warn）⇒ 任何流程都不会再"等一个永远不会来的回信"。
    // =====================================
    const onCompleteRef = useRef<(() => void) | undefined>(undefined);

    const settlePendingComplete = useCallback((reason: string) => {
        const cb = onCompleteRef.current;
        if (!cb) return;
        onCompleteRef.current = undefined;
        setOnComplete(undefined);
        console.warn(`[useMovie] ⚠️ 上一部影片的完成回调被「${reason}」抢占 → 先替它结清，避免流程干等`);
        try { cb(); } catch (e) { console.error('[useMovie] 结清回调时异常', e); }
    }, []);

    // [新增] 获取最终播放 URL：优先用预加载的 blob URL（通过共享预加载器）
    const resolveMovieUrl = useCallback((src: string): string => {
        return getVideoUrl(src);
    }, []);
    // 播放标题循环视频
    const playTitleMovie = useCallback(() => {
        const movie = getRandomTitleMovie(resolution); // [注入画质]
        if (movie) {
            // [2026-10-05 莉莉子] 循环影片开播前也先结清上一位（若它还在等回信）
            settlePendingComplete('标题影片开播');
            setCurrentMovie(movie);
            setIsLooping(true);
            setIsVisible(true);
            setOnComplete(undefined);
        }
    }, [resolution, settlePendingComplete]); // [追加依赖]

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
        settlePendingComplete('大厅影片开播'); // [2026-10-05 莉莉子] 同上：别让上一部的一次性影片干等
        setIsLooping(true); // 大厅视频需要循环
        setIsVisible(true);
        setIsImmediate(false); // 正常淡入
        setOnComplete(undefined);

        return nextIndex;
    }, [settlePendingComplete]);

    // [核心新增：静默热车] 预备升级视频：提前喂给放映机触发解码缓存，但不显示
    const prepareLevelUpMovie = useCallback((heroKey: string) => {
        const movie = getLevelUpMovie(heroKey, resolution); // [注入画质]
        if (movie) {
            setCurrentMovie(resolveMovieUrl(movie));
            setIsLooping(false);
            setIsVisible(false);
        }
    }, [resolveMovieUrl, resolution]); // [追加依赖]

    // [核心新增：静默热车] 预备胜利视频：供结算黑屏期间后台解码
    const prepareVictoryMovie = useCallback((heroKeys: string[]) => {
        const movie = getVictoryMovie(heroKeys, resolution); // [注入画质]
        if (movie) {
            setCurrentMovie(resolveMovieUrl(movie));
            setIsLooping(false);
            setIsVisible(false);
        }
    }, [resolveMovieUrl, resolution]); // [追加依赖]
    // 播放升级视频 (一次性) — 优先使用预加载的 blob URL
    const playLevelUpMovie = useCallback((heroKey: string, onEnd?: () => void) => {
        const movie = getLevelUpMovie(heroKey, resolution); // [注入画质]
        if (movie) {
            // [2026-10-05 莉莉子 BUG修复 · 20261005-11] 新片开播前先替上一部结清回调（防流程干等）
            settlePendingComplete('升级影片开播');
            setCurrentMovie(resolveMovieUrl(movie));
            setIsLooping(false);
            setIsVisible(true);
            setMovieKind('levelup'); // [2026-10-03] 一次性影片 → 打标记
            setOnComplete(() => onEnd);
            onCompleteRef.current = onEnd;
        } else {
            if (onEnd) onEnd();
        }
    }, [resolveMovieUrl, resolution, settlePendingComplete]); // [追加依赖]

    // 播放胜利视频 (一次性) — 优先使用预加载的 blob URL
    const playVictoryMovie = useCallback((heroKeys: string[], onEnd?: () => void) => {
        const movie = getVictoryMovie(heroKeys, resolution); // [注入画质]
        if (movie) {
            // [2026-10-05 莉莉子 BUG修复 · 20261005-11] 同上
            settlePendingComplete('胜利影片开播');
            setCurrentMovie(resolveMovieUrl(movie));
            setIsLooping(false);
            setIsVisible(true);
            setMovieKind('victory'); // [2026-10-03] 一次性影片 → 打标记（**跳过按钮就挂在这个标记上**）
            setOnComplete(() => onEnd);
            onCompleteRef.current = onEnd;
        } else {
            if (onEnd) onEnd();
        }
    }, [resolveMovieUrl, resolution, settlePendingComplete]); // [追加依赖]

    // [修改] 支持传入 immediate 参数
    const stopMovie = useCallback((immediate: boolean = false) => {
        setIsImmediate(immediate); // 记录意图
        setIsVisible(false);
        setMovieKind(null); // [2026-10-03 莉莉子] 停片即清"用途标记"，防循环影片继承上一次的标记
    }, []);

    // ============================================================
    // [2026-10-03 莉莉子] **跳过当前影片**（**一次性影片专用**）
    //   语义 = 立即切断 + **触发完成回调**（与升级按钮的 handleSkip 同为"立即切断"）
    //   ⚠️ 为什么必须带回调：胜利流程的后续（结算 / 回大厅）挂在 `playVictoryMovie(…, onEnd)`
    //     的 `onComplete` 上 —— 只 `stopMovie()` 不调回调会让流程**挂住**。
    //     （升级影片不走这里：ChampionLevelUp.handleSkip 是"停片 + 自己 setPhase 推进"。）
    // ============================================================
    const skipMovie = useCallback(() => {
        setIsImmediate(true); // 与升级按钮同款：立即切断，不淡出
        setIsVisible(false);
        setMovieKind(null);
        // [2026-10-05 莉莉子 BUG修复 · 20261005-11] 改从 ref 取并**当场清空** ——
        //   原来读 state 且不清 ⇒ 若影片随后又触发一次 onEnd，回调会**被调用两次**（流程双推进）。
        //   现在 ref 一次性消费 ⇒ 「跳过」与「播完」二者只有先到的那一次生效。
        const cb = onCompleteRef.current;
        onCompleteRef.current = undefined;
        setOnComplete(undefined);
        if (cb) cb();
    }, []);

    // 视频结束时的内部处理
    const handleVideoEnded = useCallback(() => {
        if (!isLooping) {
            // 先淡出
            setIsVisible(false);
            setMovieKind(null); // [2026-10-03 莉莉子] 播完清"用途标记"
            // [2026-10-05 莉莉子 BUG修复 · 20261005-11] 同样改成 ref 一次性消费（防与「跳过」双发）
            const cb = onCompleteRef.current;
            onCompleteRef.current = undefined;
            setOnComplete(undefined);
            if (cb) cb();
        }
    }, [isLooping]);

    // [新增] 预加载升级影片：供 ChampionLevelUp 在 spin 阶段调用
    /* 已迁移至 videoPreloader.ts */

    return {
        currentMovie,
        isLooping,
        isVisible,
        prepareLevelUpMovie, // [核心导出] 提前供弹 (升级)
        prepareVictoryMovie, // [核心导出] 提前供弹 (胜利)
        playTitleMovie,
        playLevelUpMovie,
        playVictoryMovie,
        playHallMovie, // [新增] 导出
        stopMovie,
        skipMovie, // [2026-10-03 莉莉子] 跳过当前影片（一次性影片专用：停片 + 触发完成回调）
        movieKind, // [2026-10-03 莉莉子] 影片用途标记（'levelup' | 'victory' | null）—— 胜负/升级跳过按钮的判据
        isImmediate,
        handleVideoEnded,
        movieVolume,
        setMovieVolume,
    };
};