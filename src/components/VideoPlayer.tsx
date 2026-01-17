import React, { useRef, useEffect, useState } from 'react';

interface VideoPlayerProps {
    src: string | null;
    isVisible: boolean;
    isLoop?: boolean;
    onEnded?: () => void;
    zIndex?: number;
    noFade?: boolean;
    muted?: boolean;
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({
    src, isVisible, isLoop = false, onEnded, zIndex = 500, muted = false,
    noFade = false
}) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [opacity, setOpacity] = useState(0);

    // 1. 基础播放控制 (响应式)
    useEffect(() => {
        const video = videoRef.current;
        if (!video || !src) return;

        if (isVisible) {
            // A. 开始播放
            // 如果源变了，重置
            if (video.src !== src && video.src !== window.location.origin + src) {
                video.src = src;
                video.load();
            }

            // 尝试播放
            const playPromise = video.play();
            if (playPromise !== undefined) {
                playPromise
                    .then(() => {
                        // 播放成功后再显示，防止黑屏
                        setOpacity(1);
                    })
                    .catch(e => console.warn("Auto-play blocked:", e));
            }
        } else {
            // B. 停止播放
            setOpacity(0);
            const delay = noFade ? 0 : 1000;
            const timer = setTimeout(() => {
                if (video) video.pause();
            }, delay);
            return () => clearTimeout(timer);
        }
    }, [isVisible, src, noFade]);

    // 2. 属性同步 (Loop/Muted)
    useEffect(() => {
        if (videoRef.current) {
            videoRef.current.loop = isLoop;
            videoRef.current.muted = muted || false;
        }
    }, [isLoop, muted]);

    // 3. [核心修复] 智能看门狗 (Smart Watchdog)
    useEffect(() => {
        if (!isVisible || !src) return;

        const interval = setInterval(() => {
            const video = videoRef.current;
            // 逻辑：如果应该显示(isVisible) + 有视频对象 + 处于暂停状态 + 还没播完
            // 则认为是异常暂停，尝试恢复
            if (video && video.paused && !video.ended) {
                console.log("[Watchdog] Video paused unexpectedly, resuming...");
                // [优化] 绝对不要重置 currentTime = 0，直接 play() 继续播放
                // 这样既能救活视频，又不会导致画面鬼畜跳回开头
                video.play().catch(() => {});
            }
        }, 1000); // 1秒检查一次，频率适中

        return () => clearInterval(interval);
    }, [isVisible, src]);

    if (!src) return null;

    return (
        <div
            className={`fixed inset-0 bg-black transition-opacity ease-in-out pointer-events-none ${noFade ? 'duration-0' : 'duration-1000'}`}
            style={{
                opacity: opacity,
                zIndex: zIndex,
                visibility: (isVisible || opacity > 0) ? 'visible' : 'hidden'
            }}
        >
            <video
                ref={videoRef}
                src={src} // 直接绑定 src，配合 useEffect 里的 load 检查
                className="w-full h-full object-cover"
                playsInline
                // [保留] 激进预加载
                preload="auto"
                // [保留] 结束回调
                onEnded={onEnded}
                // [保留] 错误熔断：如果原生报错，直接跳过
                onError={(e) => {
                    console.error("Video Error:", e);
                    if (!isLoop && onEnded) onEnded();
                }}
                style={{ willChange: 'transform, opacity' }}
            />
        </div>
    );
};