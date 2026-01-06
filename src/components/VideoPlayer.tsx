import React, { useRef, useEffect, useState } from 'react';

interface VideoPlayerProps {
    src: string | null;
    isVisible: boolean;
    isLoop?: boolean;
    onEnded?: () => void;
    zIndex?: number;
    noFade?: boolean;
    muted?: boolean; // [新增] 静音控制，用于标题页自动播放
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({
    src, isVisible, isLoop = false, onEnded, zIndex = 500, muted = false,
    noFade = false // [新增] 默认 false
}) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [opacity, setOpacity] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);

    // 监听播放源和可见性变化
    useEffect(() => {
        if (isVisible && src) {
            // 开始播放流程
            setIsPlaying(true);
            // 1. 淡入
            setTimeout(() => setOpacity(1), 50);

            if (videoRef.current) {
                videoRef.current.currentTime = 0;
                videoRef.current.play().catch(e => console.warn("Video play failed", e));
            }
        } else {
            // 结束流程
            // 1. 淡出
            setOpacity(0);
            // 2. 延迟卸载/停止
            setTimeout(() => {
                if (videoRef.current) {
                    videoRef.current.pause();
                }
                setIsPlaying(false);
            }, 1000); // 配合 CSS transition 1s
        }
    }, [isVisible, src]);

    // 强制同步 DOM 属性
    useEffect(() => {
        if (videoRef.current) {
            videoRef.current.loop = isLoop;
            videoRef.current.muted = muted || false;
        }
    }, [isLoop, muted]);

    // [新增] 播放监视器 (Watchdog)
    // 如果视频应该循环播放且可见，但却暂停了（比如播放结束了），强制重启
    useEffect(() => {
        if (!isLoop || !isVisible || !src) return;

        const interval = setInterval(() => {
            if (videoRef.current && videoRef.current.paused) {
                console.log("Watchdog: Video paused unexpectedly, restarting...");
                videoRef.current.currentTime = 0;
                videoRef.current.play().catch(() => {});
            }
        }, 1000); // 每秒检查一次

        return () => clearInterval(interval);
    }, [isLoop, isVisible, src]);

    if (!src && !isPlaying) return null;

    return (
        <div
            // [修改] 根据 noFade 动态切换 duration 类名
            // duration-0 = 瞬间消失; duration-1000 = 淡出
            className={`fixed inset-0 bg-black transition-opacity ease-in-out pointer-events-none ${noFade ? 'duration-0' : 'duration-1000'}`}
            style={{
                opacity: opacity,
                zIndex: zIndex,
                // 如果不显示且完全透明，则隐藏以防遮挡点击
                visibility: (isVisible || opacity > 0) ? 'visible' : 'hidden'
            }}
        >
            <video
                ref={videoRef}
                src={src || ''}
                className="w-full h-full object-cover"
                loop={isLoop}
                muted={muted}
                autoPlay={isVisible} // [新增] 尝试原生自动播放
                playsInline
                onEnded={() => {
                    if (isLoop) {
                        videoRef.current?.play().catch(() => {});
                    } else if (onEnded) {
                        onEnded();
                    }
                }}
            />
        </div>
    );
};