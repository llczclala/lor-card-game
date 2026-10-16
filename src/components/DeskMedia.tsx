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
import { LoopVideo } from './LoopVideo'; // [2026-10-09 P1] 循环视频统一实现（全局并发预算 + 可见性门控 + 卸载释放）

interface DeskMediaProps {
    deskIndex: number;
    dynamic?: boolean;          // 动态牌桌开关
    className?: string;
    style?: React.CSSProperties;
}

// [2026-10-02 莉莉子 性能优化] 本体改名，末尾统一用 React.memo 导出。
//   props 全是基本类型（number / boolean / string）⇒ memo 浅比较必然生效，零成本。
const DeskMediaInner: React.FC<DeskMediaProps> = ({ deskIndex, dynamic = false, className, style }) => {
    const video = dynamic ? getDeskVideo(deskIndex) : undefined;
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

    // [2026-10-09 莉莉子 · P1] 原"显式 play() + loop/muted 属性同步"整段删除 ——
    //   那几件事（显式 play / loop / muted / 卸载释放）已由 `LoopVideo` 统一承担，
    //   并额外获得「全局并发名额 + 可见性门控」：**此前牌桌是永不让位的一路**。

    if (video) {
        // 优先级 **0**：牌桌是全屏常驻背景（1920×1088@30，单路解码量最大）⇒ 排最后，需要时由它让位
        // [2026-10-15 莉莉子 · 安卓] 补 poster 兜底：
        //   安卓 WebView 在 <video> 没有可绘制帧时会画媒体层自己的占位（纯灰底 + 黑色播放图标）；
        //   动态牌桌是**全屏背景**，未就绪/让位时整屏发灰。这里用本文件兜底分支同一张静态牌桌图。
        //   PC 侧行为不变：poster 是标准属性，有帧后浏览器自动让位给视频画面。
        return (
            <LoopVideo
                src={video}
                poster={PERSONALIZATION_ASSETS.desks[deskIndex] ?? PERSONALIZATION_ASSETS.desks[0]}
                className={className}
                style={style}
                priority={0}
            />
        );
    }
    // [2026-09-18] 兜底 desks[0]：存档里可能残留已失效的牌桌编号（如 09-18 重编号前的旧值）
    // [2026-10-16 莉莉子 · 触屏] `draggable={false}`：Chromium 里 `<img>` **默认可拖拽**，
    //   长按会启动"图片拖拽"手势 ⇒ 浏览器把手势接走（pointercancel / 打乱 hover）
    //   ⇒ 备战枢纽里长按牌桌缩略图浮出的大图**存活不到 100ms**（程实测"按着就消失、松手才留住"）。
    //   牌桌图在任何场景都只是背景/装饰，本就不该可拖拽 ⇒ 直接锁死，无副作用。
    return <img src={PERSONALIZATION_ASSETS.desks[deskIndex] ?? PERSONALIZATION_ASSETS.desks[0]} draggable={false} className={className} style={style} alt="牌桌" />;
};

// ══════════════════════════════════════════════════════════════
// [2026-10-02 莉莉子 性能优化] memo 导出
//   牌桌是常驻全屏背景（对局 + 各菜单共 8 个调用点），而它本身只在
//   deskIndex / dynamic / className / style 变化时才需要重渲染 —— 全是基本类型。
// ══════════════════════════════════════════════════════════════
export const DeskMedia = React.memo(DeskMediaInner);
