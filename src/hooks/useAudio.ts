import { useRef, useEffect, useCallback } from 'react';
import { AUDIO_ASSETS, type BgmKey } from '../data/audio';
// [2026-10-05 莉莉子 BUG修复 · 20261005-06] 音量改为"可读取的当前值"（模块级快照）
import { getVolume, setVolumeSnapshot } from '../utils/audioVolume';
// [2026-10-15 莉莉子 · 粉丝实测] 切后台停音频（平台差异走 platform 层）
import { subscribeAppVisibility } from '../platform/appLifecycle';
import { pauseAudibleDomMedia, resumeAudibleDomMedia } from '../utils/appAudioGate';

export const useAudio = () => {
    const bgmRef = useRef<HTMLAudioElement | null>(null);
    const currentTrackRef = useRef<string | null>(null);
    // [2026-10-05 莉莉子] 初值改为**读取全局快照**（不再是写死的 0.5）—— 与 useVoice/useSfx 同口径
    const volumeRef = useRef(getVolume('bgm'));

    // 初始化
    useEffect(() => {
        const audio = new Audio();
        audio.loop = true;
        // [修改] 使用 Ref 中的音量初始化
        audio.volume = volumeRef.current;
        bgmRef.current = audio;

        // 全局点击监听
        const unlockAudio = () => {
            if (audio.paused && currentTrackRef.current) {
                audio.play().catch(e => console.log("等待交互以播放音频...", e));
            }
        };
        document.addEventListener('click', unlockAudio);

        return () => {
            audio.pause();
            document.removeEventListener('click', unlockAudio);
            bgmRef.current = null;
        };
    }, []);

    // ==========================================================
    // [2026-10-15 莉莉子 · 粉丝实测] 切后台必须停音乐
    // ── 病根：全项目**没有任何**前后台处理（`visibilitychange` 只在 `TouchFeedbackLayer` 里
    //    出现过，用途是清手势残留，与音频无关）⇒ BGM 一路响到后台。
    // ── 恢复语义（**关键**）：只恢复**我们自己暂停的那一次**。
    //    玩家用 ESC 暂停（`GAME_PAUSE` → `pauseBgm`）时，本 effect 看到的是"已经 paused"
    //    ⇒ `pausedBgmByLifecycle = false` ⇒ 回前台**不会**把音乐偷偷拉起来。
    // ── 本 hook 在 App 根常驻（`App.tsx:233`）⇒ 顺带担任 **DOM 媒体闸门**的宿主：
    //    影片等"有声的 `<video>`"归它管（见 `utils/appAudioGate.ts`，这样就不必改 VideoPlayer）。
    // ==========================================================
    useEffect(() => {
        let pausedBgmByLifecycle = false;
        return subscribeAppVisibility((isActive) => {
            const audio = bgmRef.current;

            if (!isActive) {
                if (audio && !audio.paused) {
                    audio.pause();
                    pausedBgmByLifecycle = true;
                } else {
                    pausedBgmByLifecycle = false; // 本来没在播 / 已被 ESC 暂停 ⇒ 回前台别拉起
                }
                pauseAudibleDomMedia();
                return;
            }

            if (pausedBgmByLifecycle && audio && currentTrackRef.current) {
                const p = audio.play();
                if (p !== undefined) p.catch(() => { /* 自动播放策略拦截：等用户交互 */ });
            }
            pausedBgmByLifecycle = false;
            resumeAudibleDomMedia();
        });
    }, []);

    // [新增] 设置 BGM 音量
    const setBgmVolume = useCallback((vol: number) => {
        // 1. 限制范围 0-1
        const newVol = Math.max(0, Math.min(1, vol));
        // 2. 更新 Ref (用于切歌时保持音量)
        volumeRef.current = newVol;
        // 3. 实时更新当前播放器
        if (bgmRef.current) {
            bgmRef.current.volume = newVol;
        }
        // 4. [2026-10-05] 同步全局快照（供之后新挂的实例自取）
        setVolumeSnapshot('bgm', newVol);
    }, []);

    // [修改] 扩展类型定义，加入 'gacha' 和 'deck_builder'
    // [2026-08-16] 改用 BgmKey 联合（补上 hall_1~7 大厅 BGM），对齐 AUDIO_ASSETS.bgm 实际注册的轨道
    const playBgm = (type: BgmKey) => {
        if (!bgmRef.current) return;

        let src = '';
        if (type === 'battle') {
            const tracks = AUDIO_ASSETS.bgm.battle;
            // 随机选择逻辑
            const randomIndex = Math.floor(Math.random() * tracks.length);
            src = tracks[randomIndex];
            console.log(`[Audio] Random Battle BGM selected: Index ${randomIndex}`);
        } else {
            // [修正] 类型断言，确保 TypeScript 知道这些 key 是存在的
            src = AUDIO_ASSETS.bgm[type] as string;
        }

        // 如果是同一首歌，且正在播放，则不做任何事
        if (currentTrackRef.current === src && !bgmRef.current.paused) {
            return;
        }

        console.log(`[Audio] Switching BGM to: ${type}`);

        // 切歌逻辑
        try {
            bgmRef.current.pause();
            bgmRef.current.currentTime = 0;
            bgmRef.current.src = src;
            // [关键] 切歌时重新应用当前音量
            bgmRef.current.volume = volumeRef.current;

            const playPromise = bgmRef.current.play();
            if (playPromise !== undefined) {
                playPromise.catch(error => {
                    console.warn("自动播放被阻止，等待用户交互:", error);
                });
            }
            currentTrackRef.current = src;
        } catch (err) {
            console.error("BGM Playback Error:", err);
        }
    };

    const stopBgm = () => {
        if (bgmRef.current) {
            bgmRef.current.pause();
            currentTrackRef.current = null;
        }
    };

    // [2026-09-19 莉莉子] 局内暂停：BGM 暂停/恢复
    // ── 与 stopBgm 的区别：**不丢弃当前曲目**（currentTrackRef 保留），恢复时从原位置续播。
    // ── 只有正在播且有曲目时才恢复，避免把"本来就没在播"的状态强行拉起来。
    const pauseBgm = useCallback(() => {
        if (bgmRef.current && !bgmRef.current.paused) bgmRef.current.pause();
    }, []);

    const resumeBgm = useCallback(() => {
        const audio = bgmRef.current;
        if (!audio || !currentTrackRef.current) return;
        const p = audio.play();
        if (p !== undefined) p.catch(() => { /* 自动播放策略拦截：等用户交互 */ });
    }, []);

    return {
        playBgm,
        stopBgm,
        pauseBgm,   // [导出] 局内暂停用
        resumeBgm,  // [导出] 局内恢复用
        setBgmVolume // [导出]
    };
};