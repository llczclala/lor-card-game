import { useRef, useEffect, useCallback } from 'react';
import { AUDIO_ASSETS, type BgmKey } from '../data/audio';

export const useAudio = () => {
    const bgmRef = useRef<HTMLAudioElement | null>(null);
    const currentTrackRef = useRef<string | null>(null);
    const volumeRef = useRef(0.5);

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

    return {
        playBgm,
        stopBgm,
        setBgmVolume // [导出]
    };
};