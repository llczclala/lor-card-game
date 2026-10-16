// ==========================================
// 触屏反馈层（TouchFeedbackLayer）+ 触屏「悬停模式」手势控制
// [2026-10-14 莉莉子 · 触屏适配] 程提出：
//   「手机上的点击行为完全没有反馈……一些手游点击时会有光环一样的涟漪散开，
//     展示刚刚点击了哪里；既然做了长按，长按位置外围也应该出现圆形进度条引导。」
// [2026-10-15 莉莉子] 真机反馈后细化 —— 见下方"批3 变更"
//
// 四件事合一：
//   ① 点击     → 涟漪（按下坐标扩散淡出）+ 短震
//   ② 长按中   → 圆形进度环（从空到满，直观告诉玩家"还要按多久"）
//   ③ 长按达成 → 进入「悬停模式」：浮出卡牌/关键词/武装/强化预览（= 触屏版的 hover）
//   ④ 抬手     → 浮层滞留 ~1.8s，期间可点浮层上的「详情」按钮
//
// ⚠️ 批3 变更（程 2026-10-15 真机反馈）：
//   · 圆环收敛 —— 只在命中了 `[data-gaze]`（= 长按真有作用的元素）时才出环，
//     不再是"任何按下都出环"（滚动列表 / 拖地图 / 翻页全出环 ⇒ 太吵）
//   · 拖拽不出涟漪 —— 手指移动超过阈值 ⇒ 撤掉涟漪并取消长按
//   · 完成长按后进入悬停模式，手指滑动可连续切换预览（滑到空白则关闭，程拍板①）
//   · 抑制安卓长按原生菜单：本层在 capture 阶段吃掉 contextmenu，
//     否则 WebView 长按会触发 Card.tsx:1960 的 onContextMenu ⇒ 弹出详情，和悬停模式打架
//   · 进度环加大并上移，避开手指遮挡（程："手指有点粗，正常看不太能看见"）
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
import {
    TOUCH_TUNE,
    GAZE_SELECTOR,
    isTouchInput,
    hitGazeTarget,
    hitTestGaze,
    dispatchGazeSwitch,
    touchLingerStore,
    registerTouchGazeCloser,
} from '../utils/touchGaze';

type Ripple = { id: number; x: number; y: number };

/** 手势状态机 */
type GazeMode =
    | 'idle'    // 空闲
    | 'press'   // 已按下、尚在长按判定中
    | 'drag'    // 判定为拖拽（本次手势不再管）
    | 'gaze'    // 悬停模式：手指滑动 = 移动"光标"
    | 'linger'; // 已抬手，浮层滞留中

const RING_R = TOUCH_TUNE.ringRadius;
const RING_W = TOUCH_TUNE.ringWidth;
const RING_CIRC = 2 * Math.PI * RING_R;

export const TouchFeedbackLayer: React.FC = () => {
    const [ripples, setRipples] = useState<Ripple[]>([]);
    const [ring, setRing] = useState<{ x: number; y: number } | null>(null);
    const [enabled, setEnabled] = useState(false);

    const idRef = useRef(0);
    const modeRef = useRef<GazeMode>('idle');
    const downPtRef = useRef<{ x: number; y: number } | null>(null);
    /** 本次按下产生的涟漪 id —— 判定为拖拽时要把它撤掉 */
    const rippleIdRef = useRef<number | null>(null);
    const longTimerRef = useRef<number | null>(null);
    const lingerTimerRef = useRef<number | null>(null);
    /** 当前悬停模式命中的元素（滑走时要对它派发 mouseout） */
    const targetRef = useRef<HTMLElement | null>(null);
    const rafRef = useRef<number | null>(null);
    /** 涟漪的移除定时器（卸载时要清，否则会在卸载后 setState） */
    const rippleTimersRef = useRef<Set<number>>(new Set());
    /**
     * 需要吃掉的那次 click 的时间戳（0 = 不需要）。
     * 用时间戳而非布尔，是为了避免"浏览器没补发 click"时把**下一次无关的点击**也吃掉。
     */
    const suppressClickAtRef = useRef(0);

    // 只在触屏设备挂载（PC 直接不渲染，零开销、零视觉变化）
    useEffect(() => {
        setEnabled(isTouchInput());
    }, []);

    useEffect(() => {
        if (!enabled) return;

        /** 震动：能力可用才调（安卓 WebView 需要 VIBRATE 权限，见 AndroidManifest） */
        const vibrate = (ms: number) => {
            try {
                if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
                    navigator.vibrate(ms);
                }
            } catch { /* 不支持就忽略 */ }
        };

        const clearLongTimer = () => {
            if (longTimerRef.current !== null) {
                clearTimeout(longTimerRef.current);
                longTimerRef.current = null;
            }
            setRing(null);
        };

        const clearLingerTimer = () => {
            if (lingerTimerRef.current !== null) {
                clearTimeout(lingerTimerRef.current);
                lingerTimerRef.current = null;
            }
        };

        /** 撤掉本次按下的涟漪（拖拽时用；正常点击则让它自己淡出） */
        const dropRipple = () => {
            const id = rippleIdRef.current;
            if (id === null) return;
            rippleIdRef.current = null;
            setRipples(prev => prev.filter(r => r.id !== id));
        };

        /** 关闭悬停预览（立即，无滞留） */
        const closePreview = () => {
            clearLingerTimer();
            dispatchGazeSwitch(targetRef.current, null);
            targetRef.current = null;
            touchLingerStore.set(false);
        };

        /** 结束"按下"阶段：定时器/环都收掉，涟漪留给它自己淡出 */
        const finishPress = () => {
            clearLongTimer();
            downPtRef.current = null;
            rippleIdRef.current = null;
            modeRef.current = 'idle';
        };

        /** 中止本次手势（抬手取消 / 拖拽 / 切后台）：撤涟漪 + 关预览 */
        const abort = () => {
            clearLongTimer();
            dropRipple();
            closePreview();
            downPtRef.current = null;
            modeRef.current = 'idle';
        };

        // ── 按下 ────────────────────────────────────────────────
        const onDown = (e: PointerEvent) => {
            // [2026-10-15 莉莉子 · 审查发现] 只认真正的触摸。
            //   否则"触屏设备 + 外接鼠标"的场景下（`pointer: coarse` 为真但用的是鼠标），
            //   鼠标按住 400ms 也会进悬停模式并滞留 ⇒ "PC 行为不变"就打折扣了。
            if (e.pointerType === 'mouse') return;

            // ⚠️ 手指落在浮层的操作条上 ⇒ 直接放行，绝不能在这里把浮层收掉！
            //    （审查发现）pointerdown 与 click 是两次独立任务：这里一收，React 立刻
            //    卸载按钮，随后的 click 根本派发不到按钮上 —— 按钮等于点不到。
            if ((e.target as HTMLElement | null)?.closest?.('[data-touch-linger]')) return;

            // 新一次手势开始 ⇒ 上一次的 click 抑制标记作废
            suppressClickAtRef.current = 0;

            // 滞留在屏幕上时又按了一下（且在操作条外）⇒ 先把滞留的浮层收掉，再当作全新一次按下
            if (modeRef.current === 'linger') {
                closePreview();
                modeRef.current = 'idle';
            }
            // 多指时只认第一根（避免两指各开一个进度环）
            if (!e.isPrimary || modeRef.current !== 'idle') return;

            const x = e.clientX;
            const y = e.clientY;
            downPtRef.current = { x, y };
            modeRef.current = 'press';

            // ① 涟漪 + 短震（按下即反馈）
            const id = ++idRef.current;
            rippleIdRef.current = id;
            setRipples(prev => [...prev, { id, x, y }]);
            const rippleTimer = window.setTimeout(() => {
                rippleTimersRef.current.delete(rippleTimer);
                setRipples(prev => prev.filter(r => r.id !== id));
            }, TOUCH_TUNE.rippleMs);
            rippleTimersRef.current.add(rippleTimer);
            vibrate(12);

            // ② 长按计时 + 进度环
            //    ⚠️ 只在「长按真有作用」的元素上出环（程 2026-10-15：圆环要在它能出现的地方出现）
            const hit = hitGazeTarget(x, y);
            if (!hit) return;

            setRing({ x, y });
            longTimerRef.current = window.setTimeout(() => {
                longTimerRef.current = null;
                setRing(null);
                vibrate(30); // ③ 达成：长震一下
                // 长按手势可能让浏览器在抬手时补发一次 click ⇒ 标记待吃掉的那一次
                suppressClickAtRef.current = performance.now();
                targetRef.current = hit;
                modeRef.current = 'gaze';
                // 进入悬停模式：等价于鼠标"移入"这个元素 ⇒ 预览浮出
                dispatchGazeSwitch(null, hit);
            }, TOUCH_TUNE.longPressMs);
        };

        // ── 移动 ────────────────────────────────────────────────
        const onMove = (e: PointerEvent) => {
            if (e.pointerType === 'mouse') return; // 同 onDown：鼠标不参与触屏手势
            const mode = modeRef.current;

            if (mode === 'press') {
                const d = downPtRef.current;
                if (!d) return;
                // 手指移动 = 玩家要做的是拖拽 ⇒ 立刻撤掉涟漪与进度环，让位给出牌/移动。
                // ⚠️ [2026-10-15 莉莉子 · 独立审查发现] **必须与游戏侧用同一个范数**：
                //   游戏判拖拽用的是 `Math.abs(dx) > 8 || Math.abs(dy) > 8`（切比雪夫，GameSession.tsx:1292/1629），
                //   而这里原先用 `Math.hypot`（欧几里得）⇒ 两者在**斜向**不一致：
                //     手指移到 (6,6)：hypot=8.49 > 8 ⇒ 我们 abort 掉长按（环没了、涟漪撤了），
                //                    切比雪夫=6 ≤ 8 ⇒ 游戏**不**激活拖拽、ghost 也不生成
                //     ⇒ 整次按压**零反馈、零动作**（真机上最常见的斜向抖动正好落在这个死区）。
                //   ⇒ 改用切比雪夫，与游戏侧阈值**同刻对齐**：越过 8px 的那一瞬间，我们让位、它接管。
                if (Math.max(Math.abs(e.clientX - d.x), Math.abs(e.clientY - d.y)) > TOUCH_TUNE.moveCancelPx) {
                    abort();
                    modeRef.current = 'drag';
                }
                return;
            }

            if (mode === 'gaze') {
                // 手指滑动 = 移动"光标"：命中检测用 rAF 节流，命中未变化直接 return
                if (rafRef.current !== null) return;
                const x = e.clientX;
                const y = e.clientY;
                rafRef.current = requestAnimationFrame(() => {
                    rafRef.current = null;
                    if (modeRef.current !== 'gaze') return;
                    const hit = hitTestGaze(x, y);
                    // 手指滑到我们自己的大图浮层上 ⇒ 维持当前预览（不能当成"滑到空白"）
                    if (hit.kind === 'hold') return;
                    const next = hit.kind === 'gaze' ? hit.el : null;
                    if (next === targetRef.current) return;
                    // 命中新元素 ⇒ 切换预览；滑到空白 ⇒ next 为 null ⇒ 关闭上一个（程拍板①）
                    dispatchGazeSwitch(targetRef.current, next);
                    targetRef.current = next;
                });
            }
        };

        // ── 抬手 ────────────────────────────────────────────────
        const onUp = () => {
            // ⚠️ 必须先处理 drag：若漏掉这一支，一次拖拽后 mode 会永远停在 'drag'，
            //    此后所有按下都会被 onDown 的 `mode !== 'idle'` 拦掉（涟漪与进度环全死）。
            if (modeRef.current === 'drag') {
                modeRef.current = 'idle';
                return;
            }
            if (modeRef.current === 'gaze') {
                // ④ 抬手 ⇒ 退出悬停模式，但浮层**滞留**一会儿，期间可以点它的按钮
                modeRef.current = 'linger';
                touchLingerStore.set(true);
                clearLingerTimer();
                lingerTimerRef.current = window.setTimeout(() => {
                    lingerTimerRef.current = null;
                    closePreview();
                    modeRef.current = 'idle';
                }, TOUCH_TUNE.lingerMs);
                return;
            }
            if (modeRef.current === 'press') finishPress();
        };

        /** 手势被打断 / 切后台 / 来电 ⇒ 必须立刻清理，否则进度环或浮层会残留在屏幕上 */
        const onInterrupt = () => {
            if (rafRef.current !== null) {
                cancelAnimationFrame(rafRef.current);
                rafRef.current = null;
            }
            abort();
        };

        /**
         * ⚠️【2026-10-16 · 程实测「大图一出现就消失」】`pointercancel` 必须与 `blur` 分开处理。
         *
         * 原来的写法把两者都交给 `onInterrupt()` ⇒ **abort() ⇒ closePreview()**。
         * 但 `pointercancel` 的语义是「浏览器把这个手势接走了」，**不是**「用户不要了」：
         *   安卓在长按 ~500ms 时会因为**原生长按菜单 / 图片拖拽 / 手势导航**接管而派发它 ——
         *   而我们的长按是 **400ms** 就浮出预览 ⇒ **预览只活 100ms 就被这一刀收掉**。
         *
         * ⇒ 在 `gaze`（预览已浮出）时，取消应当**等同于抬手**：走滞留那条路，让预览自己到期再关。
         *   玩家的观感才是「我长按出来的东西留住了」。
         * ⚠️ `blur` / `visibilitychange`（切后台）**仍然走 `onInterrupt()` 立即清** —— 那时该收就得收。
         */
        const onPointerCancel = () => {
            if (rafRef.current !== null) {
                cancelAnimationFrame(rafRef.current);
                rafRef.current = null;
            }
            if (modeRef.current === 'gaze') {
                modeRef.current = 'linger';
                touchLingerStore.set(true);
                clearLingerTimer();
                lingerTimerRef.current = window.setTimeout(() => {
                    lingerTimerRef.current = null;
                    closePreview();
                    modeRef.current = 'idle';
                }, TOUCH_TUNE.lingerMs);
                return;
            }
            abort();
        };

        /**
         * 吃掉安卓 WebView 在**可预览元素**上的长按原生菜单。
         * 不加这一段的话，长按 ~500ms 会派发 contextmenu ⇒ 命中 Card.tsx:1960 的
         * onContextMenu ⇒ 弹出详情界面，和本层的悬停模式**抢同一个手势**。
         * 用 capture 阶段 + stopPropagation，React 根容器的监听器就收不到了。
         *
         * ⚠️ 必须**收窄到 [data-gaze]**（审查发现）：全局一刀切会把安卓上大量
         *    本来就靠"长按 / 右键"的既有功能砍成死功能 —— 肉鸽地图节点（MapNode.tsx:67
         *    长按弹节点预览）、卡组中心背景退出（DeckBuilder.tsx:903）、沙盒选 DNA、
         *    天启者原画（GameUI.tsx:265）、教程引导层 …… 安卓没有鼠标，长按是它们唯一入口。
         */
        const onContextMenu = (e: Event) => {
            const target = e.target as HTMLElement | null;
            if (!target?.closest?.(GAZE_SELECTOR)) return;
            e.preventDefault();
            e.stopPropagation();
        };

        /**
         * 吃掉"长按抬手"之后浏览器补发的那次 click。
         * [2026-10-15 审查发现] 本层为 contextmenu 做了防护，却对"长按 → click"这条
         * 同源路径毫无设防：
         *   · KeywordPreview / ArmamentPreview 在 window 的 click 上直接 forceClose()
         *     ⇒ 关键词 / 武装浮层在抬手瞬间消失，1.8s 滞留完全失效
         *   · Card.tsx:1956 的 onClick 也可能被误触发（出牌 / 选卡）
         * 用时间窗判定，避免浏览器没补发 click 时把下一次无关的点击也吃掉。
         */
        const onClickCapture = (e: MouseEvent) => {
            const at = suppressClickAtRef.current;
            if (!at) return;
            suppressClickAtRef.current = 0;
            if (performance.now() - at > 700) return; // 隔太久 ⇒ 不是这次长按的余波
            e.preventDefault();
            e.stopPropagation();
        };

        window.addEventListener('pointerdown', onDown, { capture: true, passive: true });
        window.addEventListener('pointermove', onMove, { capture: true, passive: true });
        window.addEventListener('pointerup', onUp, { capture: true, passive: true });
        window.addEventListener('pointercancel', onPointerCancel, { capture: true, passive: true });
        window.addEventListener('contextmenu', onContextMenu, { capture: true });
        window.addEventListener('click', onClickCapture, { capture: true });
        // [边界] 切后台 / 来电 / 页面隐藏 ⇒ 必须清掉
        window.addEventListener('blur', onInterrupt);
        document.addEventListener('visibilitychange', onInterrupt);

        // 浮层上的「详情 / 关闭」按钮点完 ⇒ 立刻收掉预览
        registerTouchGazeCloser(() => {
            if (rafRef.current !== null) {
                cancelAnimationFrame(rafRef.current);
                rafRef.current = null;
            }
            abort();
        });

        return () => {
            window.removeEventListener('pointerdown', onDown, { capture: true });
            window.removeEventListener('pointermove', onMove, { capture: true });
            window.removeEventListener('pointerup', onUp, { capture: true });
            window.removeEventListener('pointercancel', onPointerCancel, { capture: true });
            window.removeEventListener('contextmenu', onContextMenu, { capture: true });
            window.removeEventListener('click', onClickCapture, { capture: true });
            window.removeEventListener('blur', onInterrupt);
            document.removeEventListener('visibilitychange', onInterrupt);
            registerTouchGazeCloser(null);
            onInterrupt();
            // 涟漪的移除定时器也要清（否则卸载后仍会 setState）
            rippleTimersRef.current.forEach(t => clearTimeout(t));
            rippleTimersRef.current.clear();
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
                        animation: `tfl-ripple ${TOUCH_TUNE.rippleMs}ms cubic-bezier(0.22,1,0.36,1) forwards`,
                    }}
                />
            ))}

            {/* ② 长按进度环（上移 RING_OFFSET，避开指肚遮挡） */}
            {ring && (
                <svg
                    width={RING_R * 2 + RING_W * 2}
                    height={RING_R * 2 + RING_W * 2}
                    style={{
                        position: 'absolute',
                        left: ring.x - (RING_R + RING_W),
                        top: ring.y - (RING_R + RING_W) + TOUCH_TUNE.ringOffsetY,
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
                        style={{ animation: `tfl-ring ${TOUCH_TUNE.longPressMs}ms linear forwards` }}
                    />
                </svg>
            )}

            {/* 关键帧（内联，避免动 index.css；两个 keyframes 都只在本层生效） */}
            <style>{`
                @keyframes tfl-ripple {
                    from { transform: scale(1);   opacity: 0.95; }
                    to   { transform: scale(${TOUCH_TUNE.rippleScale}); opacity: 0; }
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
