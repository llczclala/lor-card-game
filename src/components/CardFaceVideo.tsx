import React, { useEffect, useRef } from 'react';

// ==========================================
// 卡面动态视频播放器（英雄 / 法术 / 单位 / 卡背等卡面共用）
// [2026-08-16 莉莉子] 初版为 Card.tsx 内部的 HeroCardVideo
// [2026-09-26 莉莉子] 抽为独立组件 —— 法术卡的渲染路径有三条
//   （手牌走 SpellCard / 打出后走 GameSession 法术圆盘 / 战场位走 Card），
//   播放逻辑必须只有一份，否则三处必然各写各的、行为漂移
//
// [2026-10-02 莉莉子 性能优化] 「动态开关全开」下的并发闸门 + 可见性门控
// ---------------------------------------------------------------
// 病根（静态体检结论）：本组件原先每张卡面 = 一个独立 <video>，且
//   · preload="auto"（主动加载）
//   · 没有任何并发上限
//   · 没有可见性门控
//   · 卸载时不释放解码器
// 而玩家把 4 个动态开关（牌桌/卡面/卡背/法术）全开时，同屏会有
//   手牌(≤10) + 备战席(6) + 交战区(6) + 悬停预览 + 法术圆盘 ≈ 20+ 路视频
//   ⇒ 20+ 个解码器同时吃 CPU/GPU/内存 ⇒ 明显掉帧、发热。
//
// 本版做法（四项，互相配合）：
//   ① 全局并发闸门：最多同时播 MAX_CONCURRENT 路，超出按 FIFO 挤掉最早的
//   ② 可见性门控：IntersectionObserver 只播「看得见」的，离屏即暂停并让出名额
//   ③ 懒加载：preload="none" + 真正要播时才挂 src；用 poster 兜底静态图
//      （调用方的静态 <img> 一直存在，我们把它当 poster，避免卡片先白一下）
//   ④ 卸载即释放：pause + removeAttribute('src') + load()，让浏览器回收解码器
// ==========================================

/** 最多同时播放的卡面视频数。3 是「够用且不炸」的经验值：同屏肉眼可辨的动态通常≤3张 */
const MAX_CONCURRENT = 3;

/** 当前持有播放名额的元素。Set 保持插入序 ⇒ values().next() 天然取到最早的 */
const activeVideos = new Set<HTMLVideoElement>();

/** 申请一个播放名额；返回释放函数。超额时挤掉最早申请的那个。 */
const acquirePlaySlot = (el: HTMLVideoElement): (() => void) => {
    if (!activeVideos.has(el)) {
        while (activeVideos.size >= MAX_CONCURRENT) {
            const oldest = activeVideos.values().next().value as HTMLVideoElement | undefined;
            if (!oldest) break;
            activeVideos.delete(oldest);
            try { oldest.pause(); } catch { /* 忽略：元素可能已卸载 */ }
        }
        activeVideos.add(el);
    }
    const p = el.play();
    if (p !== undefined) p.catch(() => { /* autoplay 被拒：忽略，继续显示 poster */ });
    return () => { activeVideos.delete(el); };
};

/** 彻底释放一个 <video> 的解码器（浏览器只在 src 摘除后回收） */
const releaseVideoElement = (el: HTMLVideoElement | null): void => {
    if (!el) return;
    try { el.pause(); } catch { /* noop */ }
    activeVideos.delete(el);
    el.removeAttribute('src');
    try { el.load(); } catch { /* noop */ }
};

/**
 * 卸载时释放**所有**卡面视频（场景切换用：进/出对局、切页签）。
 * 避免离场瞬间一次性积压几十个解码器等 GC。
 */
export const releaseAllCardFaceVideos = (): void => {
    activeVideos.forEach(el => releaseVideoElement(el));
    activeVideos.clear();
};

interface CardFaceVideoProps {
    src: string;
    /** 静态兜底图：视频未就绪时显示，替代"先白一下" */
    poster?: string;
    className?: string;
    style?: React.CSSProperties;
}

export const CardFaceVideo: React.FC<CardFaceVideoProps> = ({ src, poster, className, style }) => {
    const videoRef = useRef<HTMLVideoElement>(null);

    useEffect(() => {
        const el = videoRef.current;
        if (!el || !src) return;

        // 播放方案对齐 DeskMedia：autoplay 策略下 HTML 属性不可靠，必须显式设置
        el.loop = true;
        el.muted = true;
        el.playsInline = true;

        let releaseSlot: (() => void) | null = null;
        let srcAttached = false;

        const start = () => {
            // 真正要播了才挂 src（配合 preload="none"：在此之前一个字节都不下载）
            if (!srcAttached) {
                srcAttached = true;
                if (el.getAttribute('src') !== src) el.setAttribute('src', src);
            }
            releaseSlot?.();            // 幂等：重复 start 不重复占名额
            releaseSlot = acquirePlaySlot(el);
        };

        const stop = () => {
            releaseSlot?.();
            releaseSlot = null;
            try { el.pause(); } catch { /* noop */ }
        };

        // 老环境兜底：没有 IntersectionObserver 就直接播（不门控）
        if (typeof IntersectionObserver === 'undefined') {
            start();
            return () => { stop(); releaseVideoElement(el); };
        }

        // 可见性门控：只在视口内（含 160px 余量）播放
        const io = new IntersectionObserver((entries) => {
            for (const e of entries) {
                if (e.isIntersecting) start();
                else stop();
            }
        }, { rootMargin: '160px' });
        io.observe(el);

        return () => {
            io.disconnect();
            stop();
            releaseVideoElement(el);
        };
    }, [src]);

    return (
        <video
            ref={videoRef}
            poster={poster}
            className={className}
            style={style}
            playsInline
            preload="none"
            muted
            loop
        />
    );
};
