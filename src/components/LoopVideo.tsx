import React, { useEffect, useRef } from 'react';
import {
    registerVideoCandidate,
    setCandidateWantsToPlay,
    releaseVideoElement,
} from '../utils/videoBudget';
import { attachVideoProbe } from '../utils/videoDiagnostics'; // [2026-10-10] 探针加全：所有循环视频统一挂（默认静默）

/**
 * [2026-10-09 莉莉子 · 影片卡顿治理 P1] **循环视频的唯一实现**
 * ============================================================
 * 把原先散落在 5 处的"裸 <video autoPlay loop>"收成一个组件，统一拿到四件事：
 *   ① **全局并发名额**（`utils/videoBudget`）—— 同屏最多 3 路，超出按优先级让位
 *   ② **可见性门控**：IntersectionObserver（含 160px 余量）—— 离屏即停
 *   ③ **懒挂 src**：`preload="none"`，真正要播时才挂（在此之前一个字节都不下载）
 *   ④ **卸载即释放**：`pause + removeAttribute('src') + load()` 让浏览器回收解码器
 *
 * ⚠️ 与"影片"的关系：升级 / 胜利影片播放期间，`videoBudget` 会把名额压到 0
 *   ⇒ 本组件会自动暂停并在影片结束后按优先级恢复（不需要调用方处理）。
 */
export interface LoopVideoProps {
    src: string;
    /** 静态兜底图：视频未就绪时显示，替代"先白一下" */
    poster?: string;
    className?: string;
    style?: React.CSSProperties;
    /**
     * 优先级：数字越大越优先（同屏名额只有 3 个时，低优先级的会让位）。
     * 建议：交战/悬停卡面 30 · 备战席 20 · 手牌 10 · 卡背 5 · 牌桌 0 · 全屏背景 −20
     */
    priority?: number;
    /** 调用方的额外开关（如"动态卡面"总开关）：false 时等同于不可见 */
    enabled?: boolean;
    /** 离屏超过这么久就摘掉 src 释放解码器（默认 20s；设 0 表示只在卸载时释放） */
    releaseAfterHiddenMs?: number;
}

export const LoopVideo: React.FC<LoopVideoProps> = ({
    src,
    poster,
    className,
    style,
    priority = 0,
    enabled = true,
    releaseAfterHiddenMs = 20000,
}) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    // [2026-10-10 莉莉子 BUG修复] **不再用"挂过一次"的布尔量**（`srcAttachedRef`）——
    //   那个判据会让 `src` 变化被整段跳过（升级 / 支援技→天启者法术 ⇒ 卡面不更新）。
    //   现在一律以**元素实际的 `src` 属性**为准（DOM 即真值），见下方 `start()`。
    const releaseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // ① 登记名额（挂载一次）+ 挂探针 + 卸载即释放
    useEffect(() => {
        const el = videoRef.current;
        if (!el) return;
        const dispose = registerVideoCandidate(el, priority);
        // [2026-10-10] 诊断探针：**默认静默**，只在异常时留痕；`__VPROBE()` 手动拉现场
        const detachProbe = attachVideoProbe(el, () => src, 'loop', priority);
        return () => {
            if (releaseTimerRef.current) clearTimeout(releaseTimerRef.current);
            detachProbe();
            dispose(); // 内部已含 releaseVideoElement
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [priority]);

    // ② 可见性门控 + ③ 懒挂 src
    useEffect(() => {
        const el = videoRef.current;
        if (!el || !src) return;

        el.loop = true;
        el.muted = true;
        el.playsInline = true;

        const start = () => {
            // ══════════════════════════════════════════════════════════════════
            // [2026-10-10 莉莉子 BUG修复 · 程实测「卡牌卡面来不及变化」]
            //   ── 病根：旧实现是 `if (!srcAttachedRef.current) { …挂 src… }`，而那个布尔量只在
            //      **首次**挂载时为 false ⇒ 之后 **`src` prop 变化时整段被跳过**：
            //        ① 支援技法术在天启者登场后，仍显示支援技的卡面
            //        ② 天启者升级后，仍显示升级前的卡面（要拖动备战席 / 从战场撤下才更新）
            //      因为那两个动作都会让本组件**卸载重挂**，而只有重挂才会重新挂 src。
            //      这两条卡面路径是今天才统一走本组件的（`CardFaceVideo` 已改为 LoopVideo 的薄包装），
            //      所以症状正好在"修完影片资源"之后出现。
            //   ── 修法：**以元素实际的 `src` 属性为准**（DOM 即真值）—— src 一变就换源；
            //      并且换源后必须**重新请求播放**（见下面那段注释，否则停在第一帧）。
            // ══════════════════════════════════════════════════════════════════
            const needAttach = el.getAttribute('src') !== src;
            if (needAttach) {
                el.setAttribute('src', src);
                // ⚠️ 换源会让浏览器把元素复位成 `paused`；而 `setCandidateWantsToPlay(el, true)`
                //    在 `want` **已经为 true** 时是**幂等 no-op**（`videoBudget.ts:112` 短路 ⇒ 不走 pump
                //    ⇒ 不会 play）⇒ 新卡面会停在第一帧/静止。
                //    ⇒ 先"关一下"再开：让下面的 `true` 必定推着名额分配器重新决策。
                //    （影片放映期仍会被正确压住：pump 的 limit=0 时它不会被放行。）
                setCandidateWantsToPlay(el, false);
                console.log(`[Vdiag] 🎬 循环视频换源：${decodeURIComponent(src).split('/').slice(-2).join('/')}（优先级 ${priority}）`);
            }
            if (releaseTimerRef.current) { clearTimeout(releaseTimerRef.current); releaseTimerRef.current = null; }
            setCandidateWantsToPlay(el, true);
        };

        const stop = () => {
            setCandidateWantsToPlay(el, false);
            // ④ 长时间不可见 ⇒ 连 src 一起摘掉（否则解码器还挂着）
            if (releaseAfterHiddenMs > 0 && !releaseTimerRef.current) {
                releaseTimerRef.current = setTimeout(() => {
                    releaseTimerRef.current = null;
                    if (!el.paused) return; // 期间又播起来 ⇒ 不动
                    releaseVideoElement(el); // 摘掉 src ⇒ 下次 start() 的 needAttach 自然为真
                }, releaseAfterHiddenMs);
            }
        };

        if (!enabled) { stop(); return () => { /* noop */ }; }

        // 老环境兜底：没有 IntersectionObserver 就直接播（不门控）
        if (typeof IntersectionObserver === 'undefined') {
            start();
            return () => stop();
        }

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
        };
    }, [src, enabled, priority, releaseAfterHiddenMs]);

    return (
        <video
            ref={videoRef}
            poster={poster}
            className={className}
            style={style}
            playsInline
            muted
            loop
            preload="none"
        />
    );
};
