import React, { useEffect, useRef } from 'react';

// ==========================================
// 卡面动态视频播放器（英雄 / 法术 / 单位 / 卡背等卡面共用）
// [2026-08-16 莉莉子] 初版为 Card.tsx 内部的 HeroCardVideo
// [2026-09-26 莉莉子] 抽为独立组件 —— 法术卡的渲染路径有三条
//   （手牌走 SpellCard / 打出后走 GameSession 法术圆盘 / 战场位走 Card），
//   播放逻辑必须只有一份，否则三处必然各写各的、行为漂移
//
// 播放方案对齐 DeskMedia：浏览器 autoplay 策略下 HTML autoPlay 属性不可靠，
// 必须 ref + video.play() 显式触发，loop/muted 用属性同步保证无限循环
// ==========================================
export const CardFaceVideo: React.FC<{ src: string; className?: string; style?: React.CSSProperties }> = ({ src, className, style }) => {
    const videoRef = useRef<HTMLVideoElement>(null);

    useEffect(() => {
        const el = videoRef.current;
        if (!el) return;
        el.loop = true;
        el.muted = true;
        if (el.src !== src && el.src !== window.location.origin + src) {
            el.src = src;
            el.load();
        }
        const p = el.play();
        if (p !== undefined) p.catch(() => {});
    }, [src]);

    return <video ref={videoRef} src={src} className={className} style={style} playsInline preload="auto" muted loop />;
};
