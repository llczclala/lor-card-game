import React from 'react';
import { LoopVideo } from './LoopVideo';
import { releaseAllVideoCandidates } from '../utils/videoBudget';

// ==========================================
// 卡面动态视频播放器（英雄 / 法术 / 单位 / 卡背等卡面共用）
// [2026-08-16 莉莉子] 初版为 Card.tsx 内部的 HeroCardVideo
// [2026-09-26 莉莉子] 抽为独立组件 —— 法术卡的渲染路径有三条
//   （手牌走 SpellCard / 打出后走 GameSession 法术圆盘 / 战场位走 Card），
//   播放逻辑必须只有一份，否则三处必然各写各的、行为漂移
//
// [2026-10-02 莉莉子 性能优化] 「动态开关全开」下的并发闸门 + 可见性门控
//   （闸门当时是**本组件内的模块级常量**：`MAX_CONCURRENT = 3` + `activeVideos`）
//
// [2026-10-09 莉莉子 · 影片卡顿治理 P1] **闸门上收为全局唯一实现**
// ── 为什么搬走：卡面不是唯一在解码的东西 —— 牌桌(1920×1088@30) / 卡背(732×1080@24)
//    / 英雄卡面(760×1080@24) / 法术(1080×1080@24) 各自都有 `<video>`，而**只有卡面**受闸门管。
//    两轮实测：同屏 20+ 路时，**升级 / 胜利影片会在播放中途丢掉数据源**
//    （`readyState=HAVE_CURRENT_DATA` + `networkState=NETWORK_IDLE` ⇒ 定格，丢帧一度 40%）。
//    ⇒ 闸门必须**全局一份**，而且要能被"影片放映期"整体压到 0。
// ── 现在本组件只是 `LoopVideo` 的薄包装：**调用方零改动**，四件套全部由 `LoopVideo` 提供。
// ==========================================

interface CardFaceVideoProps {
    src: string;
    /** 静态兜底图：视频未就绪时显示，替代"先白一下" */
    poster?: string;
    className?: string;
    style?: React.CSSProperties;
    /**
     * [2026-10-09 P1] 全局名额优先级（越大越优先）。
     * 默认 20（一般卡面）；悬停 / 高亮场景可传 30，让它压过其它卡面。
     */
    priority?: number;
}

export const CardFaceVideo: React.FC<CardFaceVideoProps> = ({ src, poster, className, style, priority = 20 }) => (
    <LoopVideo src={src} poster={poster} className={className} style={style} priority={priority} />
);

/**
 * 卸载时释放**所有**循环视频（场景切换用：进 / 出对局、切页签）。
 * [2026-10-09 P1] 保留原出口名（调用方零改动），内部已收口到全局预算。
 */
export const releaseAllCardFaceVideos = (): void => releaseAllVideoCandidates();
