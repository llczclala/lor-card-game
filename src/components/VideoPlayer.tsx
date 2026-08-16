import React, { useRef, useEffect } from 'react';

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
    // 1. 基础播放控制 (纯物理控制，彻底剥离 React 渲染流)
    useEffect(() => {
        const video = videoRef.current;
        if (!video || !src) return;

        if (isVisible) {
            // A. 开始播放
            if (video.src !== src && video.src !== window.location.origin + src) {
                video.src = src;
                video.load();
            }
            const playPromise = video.play();
            if (playPromise !== undefined) {
                playPromise.catch(e => console.warn("Auto-play blocked:", e));
            }
        } else {
            // B. 停止播放 (延迟暂停，给 CSS 淡出动画留出充足时间，防止画面定格)
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

    // 3. [新增] 解码预热：src 变化时立即开始加载并触发解码，消除播放时首帧卡顿
    useEffect(() => {
        if (!src) return;
        const video = videoRef.current;
        if (!video) return;

        // 设置 src 开始加载（如果还没设置）
        if (video.src !== src && video.src !== window.location.origin + src) {
            video.src = src;
            video.load();
        }

        // 短暂 play/pause 触发浏览器解码器预热
        // 即使 isVisible=false，这次预热的解码帧会被缓存，真正播放时秒开
        const warmup = () => {
            video.play().then(() => {
                video.pause();
            }).catch(() => {
                // 浏览器可能因 autoplay 策略拒绝，静默忽略即可
            });
        };
        // 延迟一小段时间等 load 完成再触发解码
        const timer = setTimeout(warmup, 100);
        return () => clearTimeout(timer);
    }, [src]);

    // 4. [核心修复] 智能看门狗 (Smart Watchdog)
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


    return (
        <div
            // [核心修复 1] 引入 transform-gpu 强制硬件隔离；将透明度交接给 Tailwind 类名处理
            className={`fixed inset-0 bg-black transition-opacity ease-in-out pointer-events-none transform-gpu ${noFade ? 'duration-0' : 'duration-1000'} ${isVisible && src ? 'opacity-100' : 'opacity-0'}`}
            style={{
                zIndex: zIndex,
                willChange: 'opacity' // [核心修复 2] 明确声明即将发生 opacity 复合层改变
            }}
        >
            <video
                ref={videoRef}
                src={src || undefined} // src为空时赋undefined，防止浏览器报错
                className="w-full h-full object-cover transform-gpu"
                playsInline
                preload="auto"
                onEnded={onEnded}
                onError={(e) => {
                    console.error("Video Error:", e);
                    if (!isLoop && onEnded) onEnded();
                }}
                style={{ willChange: 'transform, opacity' }}
            />
        </div>
    );
};