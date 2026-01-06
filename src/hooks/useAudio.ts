import { useRef, useEffect } from 'react';
import { AUDIO_ASSETS } from '../data/audio';

export const useAudio = () => {
    const bgmRef = useRef<HTMLAudioElement | null>(null);
    const currentTrackRef = useRef<string | null>(null);

    // 初始化
    useEffect(() => {
        const audio = new Audio();
        audio.loop = true;
        audio.volume = 0.4;
        bgmRef.current = audio;

        // 全局点击监听：解决浏览器自动播放限制
        // 只要用户点了一下页面，就尝试恢复播放
        const unlockAudio = () => {
            if (audio.paused && currentTrackRef.current) {
                audio.play().catch(e => console.log("等待交互以播放音频...", e));
            }
            // 注意：这里不移除监听，以防后续因长时间后台挂起导致再次被暂停
        };
        document.addEventListener('click', unlockAudio);

        return () => {
            audio.pause();
            document.removeEventListener('click', unlockAudio);
            bgmRef.current = null;
        };
    }, []);

    const playBgm = (type: 'title' | 'default' | 'battle' | 'victory' | 'defeat') => {
        if (!bgmRef.current) return;

        let src = '';
        if (type === 'battle') {
            const tracks = AUDIO_ASSETS.bgm.battle;
            src = tracks[Math.floor(Math.random() * tracks.length)];
        } else {
            src = AUDIO_ASSETS.bgm[type] as string;
        }

        // 如果是同一首歌，且正在播放，则不做任何事
        if (currentTrackRef.current === src && !bgmRef.current.paused) {
            return;
        }

        console.log(`[Audio] Switching BGM to: ${type}`);

        // 核心修复：切歌逻辑
        try {
            bgmRef.current.pause();          // 1. 先暂停
            bgmRef.current.currentTime = 0;  // 2. 进度归零
            bgmRef.current.src = src;        // 3. 换碟

            // 4. 尝试播放
            const playPromise = bgmRef.current.play();
            if (playPromise !== undefined) {
                playPromise.catch(error => {
                    console.warn("自动播放被阻止，等待用户交互:", error);
                    // 这里的错误是可以接受的，全局 click 监听器会补救
                });
            }
            currentTrackRef.current = src;
        } catch (e) {
            console.error("BGM 播放出错:", e);
        }
    };
// [新增] 停止播放 BGM
    const stopBgm = () => {
        if (bgmRef.current) {
            bgmRef.current.pause();
            currentTrackRef.current = null; // 清除当前轨道记录，以便下次能重新播放同名音乐
        }
    };

    return { playBgm, stopBgm };
};