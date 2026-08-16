// ==========================================
// 动态/静态牌桌媒体组件（统一入口）
// [2026-08-13 莉莉子] 开了「动态牌桌」开关且该牌桌有动态视频 → <video>，否则兜底静态图
//   兜底触发时输出一次日志（console.log），方便确认
//   播放方式对齐 VideoPlayer：浏览器 autoplay 策略下 HTML autoPlay 属性不可靠，
//   必须用 ref + video.play() 显式触发，且 loop/muted 用属性同步保证无限循环
// ==========================================
import React, { useEffect, useRef } from 'react';
import { PERSONALIZATION_ASSETS } from '../data/imageData';
import { getDeskVideo } from '../data/deskVideos';

interface DeskMediaProps {
    deskIndex: number;
    dynamic?: boolean;          // 动态牌桌开关
    className?: string;
    style?: React.CSSProperties;
}

export const DeskMedia: React.FC<DeskMediaProps> = ({ deskIndex, dynamic = false, className, style }) => {
    const video = dynamic ? getDeskVideo(deskIndex) : undefined;
    const videoRef = useRef<HTMLVideoElement>(null);
    const loggedRef = useRef<Set<number>>(new Set());

    // [2026-08-13] 日志：动态生效 / 兜底（各输出一次，避免刷屏）
    useEffect(() => {
        if (video) {
            if (!loggedRef.current.has(deskIndex)) {
                loggedRef.current.add(deskIndex);
                console.log(`[DeskMedia] 动态牌桌生效：牌桌 #${deskIndex} 使用动态视频`);
            }
        } else if (dynamic) {
            if (!loggedRef.current.has(-deskIndex - 1)) {
                loggedRef.current.add(-deskIndex - 1);
                console.log(`[DeskMedia] 动态牌桌兜底：牌桌 #${deskIndex} 无动态视频，使用静态图`);
            }
        }
    }, [video, dynamic, deskIndex]);

    // [2026-08-13] 显式播放 + 无限循环（对齐 VideoPlayer 的 play() 触发方案）
    useEffect(() => {
        const el = videoRef.current;
        if (!el || !video) return;
        el.loop = true;
        el.muted = true;
        if (el.src !== video && el.src !== window.location.origin + video) {
            el.src = video;
            el.load();
        }
        const p = el.play();
        if (p !== undefined) p.catch(() => {});
    }, [video]);

    if (video) {
        return <video ref={videoRef} src={video} className={className} style={style} playsInline preload="auto" muted loop />;
    }
    return <img src={PERSONALIZATION_ASSETS.desks[deskIndex]} className={className} style={style} alt="牌桌" />;
};
