// ==========================================
// 触屏反馈层（TouchFeedbackLayer）
// [2026-10-14 莉莉子 · 触屏适配] 程 2026-10-14 提出：
//   「手机上的点击行为完全没有反馈……一些手游点击时会有光环一样的涟漪散开，
//     展示刚刚点击了哪里；既然做了长按，长按位置外围也应该有圆形进度条引导。」
//
// 三件事合一：
//   ① 点击     → 涟漪（按下坐标扩散淡出）+ 短震
//   ② 长按中   → 圆形进度环（400ms 从空到满，直观告诉玩家"还要按多久"）
//   ③ 长按达成 → 长震一下
//
// ⚠️ 两个必须遵守的约束：
//   1. **只用 createPortal 挂到 document.body** —— 不能挂在 ScaleWrapper 里！
//      那层带 transform，会让 position:fixed 相对它定位 ⇒ 涟漪坐标全错。
//   2. **整层 pointer-events: none** —— 它绝不能挡住任何交互；
//      事件靠 window 上的 capture 监听收，不靠这层 DOM 收。
//
// ⚠️ 仅触屏启用（`pointer: coarse`）：PC 有鼠标指针，不需要涟漪。
// ==========================================
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/** 长按判定时长（ms）—— ⚠️ 与设计文档 §2.1 保持一致，待真机实测调整 */
const LONG_PRESS_MS = 400;
/** 涟漪存活时长（ms） */
const RIPPLE_MS = 380;
/** 手指移动超过这个距离就取消长按（让位给拖拽）—— 与 CardAnimations.tsx:421 的 dist<5 同源思路 */
const MOVE_CANCEL_PX = 8;
/** 进度环半径 / 线宽 */
const RING_R = 24;
const RING_W = 3;
const RING_CIRC = 2 * Math.PI * RING_R;

type Ripple = { id: number; x: number; y: number };

/** 是否触屏（能力检测，不用平台判断 —— 平板接鼠标 / 触屏笔记本都能正确分流） */
const isTouchInput = (): boolean => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia('(pointer: coarse)').matches;
};

export const TouchFeedbackLayer: React.FC = () => {
    const [ripples, setRipples] = useState<Ripple[]>([]);
    const [ring, setRing] = useState<{ x: number; y: number } | null>(null);
    const [enabled, setEnabled] = useState(false);

    const idRef = useRef(0);
    const longTimerRef = useRef<number | null>(null);
    const startRef = useRef<{ x: number; y: number } | null>(null);

    // 只在触屏设备挂载（PC 直接不渲染，零开销、零视觉变化）
    useEffect(() => {
        setEnabled(isTouchInput());
    }, []);

    useEffect(() => {
        if (!enabled) return;

        /** 震动：能力可用才调（安卓 WebView 未必支持；不可用就静默降级） */
        const vibrate = (ms: number) => {
            try {
                if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
                    navigator.vibrate(ms);
                }
            } catch { /* 不支持就忽略 */ }
        };

        const clearLongPress = () => {
            if (longTimerRef.current !== null) {
                clearTimeout(longTimerRef.current);
                longTimerRef.current = null;
            }
            startRef.current = null;
            setRing(null);
        };

        const onDown = (e: PointerEvent) => {
            // 多指时只认第一根（避免两指各开一个进度环）
            if (!e.isPrimary) return;

            // ① 涟漪 + 短震
            const id = ++idRef.current;
            setRipples(prev => [...prev, { id, x: e.clientX, y: e.clientY }]);
            window.setTimeout(() => {
                setRipples(prev => prev.filter(r => r.id !== id));
            }, RIPPLE_MS);
            vibrate(12);

            // ② 长按计时 + 进度环
            startRef.current = { x: e.clientX, y: e.clientY };
            setRing({ x: e.clientX, y: e.clientY });
            longTimerRef.current = window.setTimeout(() => {
                longTimerRef.current = null;
                startRef.current = null;
                setRing(null);
                vibrate(30); // ③ 达成：长震一下
                // ⚠️ 批3（长按→悬停模式）将在这里接入
            }, LONG_PRESS_MS);
        };

        const onMove = (e: PointerEvent) => {
            const s = startRef.current;
            if (!s) return;
            // 手指移动 = 玩家要做的是拖拽，立刻取消长按（进度环消失）
            if (Math.hypot(e.clientX - s.x, e.clientY - s.y) > MOVE_CANCEL_PX) clearLongPress();
        };

        window.addEventListener('pointerdown', onDown, { passive: true });
        window.addEventListener('pointermove', onMove, { passive: true });
        window.addEventListener('pointerup', clearLongPress, { passive: true });
        window.addEventListener('pointercancel', clearLongPress, { passive: true });
        // [边界] 切后台 / 来电 / 页面隐藏 ⇒ 必须清掉，否则进度环会残留在屏幕上
        window.addEventListener('blur', clearLongPress);
        document.addEventListener('visibilitychange', clearLongPress);

        return () => {
            window.removeEventListener('pointerdown', onDown);
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', clearLongPress);
            window.removeEventListener('pointercancel', clearLongPress);
            window.removeEventListener('blur', clearLongPress);
            document.removeEventListener('visibilitychange', clearLongPress);
            clearLongPress();
        };
    }, [enabled]);

    if (!enabled) return null;

    return createPortal(
        <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 100000, overflow: 'hidden' }}>
            {/* ① 点击涟漪 */}
            {ripples.map(r => (
                <span
                    key={r.id}
                    style={{
                        position: 'absolute',
                        left: r.x, top: r.y,
                        width: 10, height: 10,
                        marginLeft: -5, marginTop: -5,
                        borderRadius: '50%',
                        border: '2px solid rgba(255,255,255,0.9)',
                        boxShadow: '0 0 14px rgba(125,211,252,0.85), inset 0 0 8px rgba(125,211,252,0.6)',
                        animation: `tfl-ripple ${RIPPLE_MS}ms cubic-bezier(0.22,1,0.36,1) forwards`,
                    }}
                />
            ))}

            {/* ② 长按进度环 */}
            {ring && (
                <svg
                    width={RING_R * 2 + RING_W * 2}
                    height={RING_R * 2 + RING_W * 2}
                    style={{
                        position: 'absolute',
                        left: ring.x - (RING_R + RING_W),
                        top: ring.y - (RING_R + RING_W),
                        transform: 'rotate(-90deg)', // 从 12 点方向开始填充
                        filter: 'drop-shadow(0 0 6px rgba(125,211,252,0.9))',
                    }}
                >
                    {/* 底圈：让"还有多少没走完"可见 */}
                    <circle
                        cx={RING_R + RING_W} cy={RING_R + RING_W} r={RING_R}
                        fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth={RING_W}
                    />
                    {/* 进度圈：stroke-dashoffset 由满到 0 填充 */}
                    <circle
                        cx={RING_R + RING_W} cy={RING_R + RING_W} r={RING_R}
                        fill="none" stroke="rgba(125,211,252,0.98)" strokeWidth={RING_W} strokeLinecap="round"
                        strokeDasharray={RING_CIRC}
                        style={{ animation: `tfl-ring ${LONG_PRESS_MS}ms linear forwards` }}
                    />
                </svg>
            )}

            {/* 关键帧（内联，避免动 index.css；两个 keyframes 都只在本层生效） */}
            <style>{`
                @keyframes tfl-ripple {
                    from { transform: scale(1);   opacity: 0.95; }
                    to   { transform: scale(7.5); opacity: 0;    }
                }
                @keyframes tfl-ring {
                    from { stroke-dashoffset: ${RING_CIRC}; }
                    to   { stroke-dashoffset: 0; }
                }
            `}</style>
        </div>,
        document.body
    );
};
