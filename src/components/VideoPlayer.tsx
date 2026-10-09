import React, { useRef, useEffect } from 'react';
// [2026-10-05 莉莉子 BUG修复 · 20261005-11] 卡死上报（供自动降档）
import { reportMovieStall } from '../utils/movieHealth';

/** [2026-10-05] 判定"没进度=卡死"的连续秒数（1s 轮询 ⇒ 3 次 ≈ 3s，避免误伤网络抖动） */
const STALL_TICKS = 3;

interface VideoPlayerProps {
    src: string | null;
    isVisible: boolean;
    isLoop?: boolean;
    onEnded?: () => void;
    zIndex?: number;
    noFade?: boolean;
    muted?: boolean;
    // [2026-10-05 莉莉子 BUG修复 · 20261005-06] 「过场」音量通道
    //   此前本组件**根本没有 volume 这个入口**（`useMovie.movieVolume` 返回了却无人消费）
    //   ⇒ 设置里的「过场」滑块是**装饰品**，影片恒以 100% 播。缺省 1 = 元素默认音量（零行为回归）。
    volume?: number;
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({
    src, isVisible, isLoop = false, onEnded, zIndex = 500, muted = false,
    noFade = false, volume = 1
}) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    // 1. 基础播放控制 (纯物理控制，彻底剥离 React 渲染流)
    useEffect(() => {
        const video = videoRef.current;
        if (!video || !src) return;

        if (isVisible) {
            // A. 开始播放
            // =====================================
            // [2026-10-05 莉莉子 BUG修复 · 20261005-11] **只有真的换了片源才 load()**
            // ── 病根：原判据 `video.src !== src && video.src !== window.location.origin + src`
            //    · `video.src`（IDL 属性）**永远返回解析后的绝对 URL**，而这里比的是**入参 src（相对路径）**；
            //    · `window.location.origin + src` 在 file:// 下 origin 是 `"null"`、在 dev 下又少一个斜杠
            //    ⇒ **两个比较恒不成立** ⇒ 只要 `isVisible`/`src` 变一次就 `video.src = src; video.load()`。
            // ── 为什么致命：`load()` 会 **abort 所有进行中的操作、并把播放位置重置到开头**（MDN）
            //    ⇒ ① 影片每次起播被拉回 0 秒（反复从头/定格观感）
            //       ② 与本组件下面的"解码预热"**直接互斥**（预热刚 play→pause 完，这一句 load() 全废）
            // ── 修法：改用 `getAttribute('src')`（返回**我们写进去的原串**）做同源比较。
            // =====================================
            if (video.getAttribute('src') !== src) {
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

    // 2. 属性同步 (Loop/Muted/Volume)
    useEffect(() => {
        if (videoRef.current) {
            videoRef.current.loop = isLoop;
            videoRef.current.muted = muted || false;
            // [2026-10-05 莉莉子 BUG修复 · 20261005-06] 「过场」音量真实写入（此前这条通道完全没接）
            if (typeof volume === 'number' && Number.isFinite(volume)) {
                videoRef.current.volume = Math.max(0, Math.min(1, volume));
            }
        }
    }, [isLoop, muted, volume]);

    // 3. [新增] 解码预热：src 变化时立即开始加载并触发解码，消除播放时首帧卡顿
    useEffect(() => {
        if (!src) return;
        const video = videoRef.current;
        if (!video) return;

        // 设置 src 开始加载（如果还没设置）
        // [2026-10-05 莉莉子 BUG修复 · 20261005-11] 同 A 处：判据改用 getAttribute，避免"恒真 load()"
        if (video.getAttribute('src') !== src) {
            video.src = src;
            video.load();
        }

        // =====================================
        // [2026-10-05 莉莉子 BUG修复 · 20261005-11] **正在播的影片绝不能被预热"踩"一脚**
        // ── 病根：预热动作是 `play() → pause()`，而它 100ms 后**无条件**执行 ⇒
        //    若此刻影片**已经在播**（`isVisible=true`，上面主 effect 刚 play 过），这一下会把它**暂停**
        //    ⇒ 画面定格，直到"1s 轮询看门狗"把它救回来 —— 正是"影片卡住"的观感之一。
        // ── 修法：只在**不可见**（= 真正的后台预热）时才 play→pause；可见时交给主 effect 播。
        // =====================================
        if (isVisible) return;
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
    }, [src, isVisible]);

    // 4. [核心修复] 智能看门狗 (Smart Watchdog)
    // =====================================
    // [2026-10-05 莉莉子 BUG修复 · 20261005-11] **加"卡死检测"**（原来只救"被暂停"，不救"没进度"）
    // ── 原逻辑：`paused && !ended` 就 `play()` 复活。但真正常见的卡法是**没暂停、时间轴却不前进**
    //    （解码器等数据 / 弱机解不动）⇒ 原来这条路上**没有任何检测**，画面定格直到看门狗/用户跳过。
    // ── 判据：可见 + 未暂停 + 未播完，而 `currentTime` 连续 `STALL_TICKS` 秒几乎不前进 ⇒ 判定卡死。
    //    ⚠️ **必须 `document.hidden` 门控**：Chromium 在后台会节流渲染与回调，时间轴却可能照走
    //    ⇒ 不门控就是 100% 误判（调研智能体专门提醒过这一条）。
    // ── 处置：一次性影片 **直接当作"播完"**（`onEnded()`）⇒ 流程立刻继续，不再干等；
    //    同时记一次 stall 供 `movieHealth` 自动降档（弱机下次自动用更低画质）。
    // =====================================
    useEffect(() => {
        if (!isVisible || !src) return;

        let lastTime = -1;
        let stuckTicks = 0;

        const interval = setInterval(() => {
            const video = videoRef.current;
            if (!video) return;

            // 逻辑：如果应该显示(isVisible) + 有视频对象 + 处于暂停状态 + 还没播完
            // 则认为是异常暂停，尝试恢复
            if (video.paused && !video.ended) {
                console.log("[Watchdog] Video paused unexpectedly, resuming...");
                // [优化] 绝对不要重置 currentTime = 0，直接 play() 继续播放
                // 这样既能救活视频，又不会导致画面鬼畜跳回开头
                video.play().catch(() => {});
                return;
            }

            // --- 卡死检测（时间轴不前进）---
            if (document.hidden || video.ended) { stuckTicks = 0; lastTime = video.currentTime; return; }
            if (lastTime >= 0 && Math.abs(video.currentTime - lastTime) < 0.01) stuckTicks += 1;
            else stuckTicks = 0;
            lastTime = video.currentTime;

            if (stuckTicks >= STALL_TICKS) {
                stuckTicks = 0;
                console.warn(`[VideoPlayer] ⏱️ 影片卡死（${STALL_TICKS}s 无播放进度）→ ${isLoop ? '循环视频，仅记录' : '跳过该影片、流程继续'}`);
                reportMovieStall(`${isLoop ? 'loop' : 'movie'}:${src}`);
                if (!isLoop && onEnded) onEnded(); // 一次性影片：当作播完
            }
        }, 1000); // 1秒检查一次，频率适中

        return () => clearInterval(interval);
    }, [isVisible, src, isLoop, onEnded]);


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