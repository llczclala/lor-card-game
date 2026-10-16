// ==========================================
// 触屏「悬停模式」共享层
// [2026-10-14 莉莉子 · 触屏适配 批3]
// [2026-10-15 莉莉子] 批2 真机反馈后细化
//
// 解决的根本问题：PC 有鼠标「悬停」，触屏没有。
//   本层把「长按 → 悬停模式 → 滑动切换预览 → 抬手滞留」这套手势，
//   翻译成**项目已有的 hover 通路**，从而让 4 个现有 gaze 系统（卡牌 / 关键词 /
//   武装 / 迷宫强化）**一行都不用改**就能在触屏上工作。
//
// 🎯 核心法门：**合成 mouseout / mouseover 事件**。
//   ✅ 已证实（react-dom 19.2.3，见 node_modules/react-dom/cjs/react-dom-client.development.js:27412-27413）：
//        registerDirectEvent("onMouseEnter", ["mouseout", "mouseover"]);
//        registerDirectEvent("onMouseLeave", ["mouseout", "mouseover"]);
//     即 React 把 onMouseEnter/onMouseLeave 注册成由 mouseout/mouseover 驱动的**直接事件**。
//   ✅ 且同文件 19460-19487 用 `nativeEvent.relatedTarget || fromElement/toElement` 算 from/to：
//        在两个元素间派发 mouseout(旧, relatedTarget=新) + mouseover(新, relatedTarget=旧)
//        ⇒ React 自己就会推出「离开旧的、进入新的」。
//
// ⚠️ 注意：本文件只做"翻译"，不做任何渲染；渲染在 TouchFeedbackLayer / FloatingCardPreview。
// ==========================================

/**
 * 🎛️ 触屏手势与反馈调参区（程要微调手感就改这里）
 * 改完存盘，PC 上即时生效（触屏专属逻辑需真机看效果）。
 */
export const TOUCH_TUNE = {
    /** 长按多久进入悬停模式（ms）—— ⚠️ 需真机实测调整 */
    longPressMs: 400,
    /** 抬手后浮层滞留时长（ms）—— 期间可点浮层上的「详情」按钮 */
    lingerMs: 1800,
    /** 手指移动超过这个距离 ⇒ 判定为拖拽，取消长按并撤掉涟漪 */
    moveCancelPx: 8,

    // ── [2026-10-16] 手牌「聚焦」+ 备战席拖拽阈值（程真机调参用）──────────
    /**
     * 叫牌那一下**是否顺带聚焦**被点的那张（程 2026-10-16 拍板的"合算设计"）。
     * true = 第一下既完成"叫牌防误打"、又顺手把那张放大 ⇒ **第一下不再白按**。
     */
    focusOnRaise: true,
    /** 手牌聚焦的放大倍数（默认与 PC 悬停的 `HOVER_SCALE` 一致；**只影响触摸端**，PC 不受影响） */
    focusScale: 2.5,
    /** 聚焦时邻牌让位的距离 px·画布（默认与 PC 悬停的 125 一致；**只影响触摸端**） */
    focusPushPx: 125,
    /**
     * 备战席「拖到战场」阈值：**触摸端**按视口高度取比例
     * （0.15 ⇒ 视口高 400 时 ≈ 60px；原来固定 120px 在手机上相当于要拖过画面 1/3，所以"拖不到位"）。
     * ⚠️ PC（鼠标）**仍用** `GameSession` 里的绝对 `BENCH_DRAG_THRESHOLD = 120`，不受本值影响。
     */
    benchDragViewportRatio: 0.15,

    /** 长按进度环：半径 / 线宽 */
    ringRadius: 34,
    ringWidth: 4,
    /**
     * 进度环相对手指的纵向偏移（负数 = 上移）。
     * [2026-10-15] 程反馈「手指有点粗，正常看不太能看见进度环和涟漪」
     * ⇒ 环半径比手指接触面大一圈，再整体上移一点，从指肚上方露出来。
     */
    ringOffsetY: -8,

    /** 涟漪：存活时长 / 结束时放大倍数 */
    rippleMs: 380,
    rippleScale: 7.5,

    // ── 滞留操作条（📖 详情 / ✕ 关闭）─────────────────────────────
    // [2026-10-15 莉莉子] 程真机实测：「详情按钮和关闭按钮对我方备战席的卡牌不太好用，
    //   按钮挤到画面外了」。⇒ 摆放侧改为**按浮层实际位置自适应**（见 FloatingCardPreview）。
    /** 操作条与浮层之间的间距（px） */
    lingerBarGap: 10,
    /** 操作条高度（px）—— 仅用于判断"浮层下方放不放得下" */
    lingerBarHeight: 56,
    /** 「详情」圆形按钮直径（px）—— 手指要点的东西，保持真实屏幕尺寸 */
    detailBtnSize: 56,
} as const;

/**
 * 「可预览元素」标记。
 * 只有命中它的按下**才会出长按进度环**（程 2026-10-15：圆环要在它能出现的地方出现）。
 * 标记由各 gaze 绑定函数自动带上（见 useCardGaze / KeywordPreview / ArmamentPreview /
 * RunEnhancementStrip 里返回的 `data-gaze`），战场与备战席的 `<div className="contents">`
 * 空气外壳也带得上 ⇒ 用 closest() 能穿过它找到实体。
 */
export const GAZE_SELECTOR = '[data-gaze]';

/**
 * 「保持区」标记：手指落在这些元素上时**维持当前预览、不判为滑到空白**。
 * 场景（审查发现）：手指滑到大图浮层本体上 —— 浮层没有 data-gaze，会被误判成"空白"而把预览关掉。
 * `data-card-gaze-preview` 是 FloatingCardPreview 本来就有的标记（useCardGaze 的 holdSelector 也在用它）。
 */
export const GAZE_HOLD_SELECTOR = '[data-card-gaze-preview],[data-gaze-hold]';

/** 是否触屏（能力检测，不用平台判断 —— 平板接鼠标 / 触屏笔记本都能正确分流） */
export const isTouchInput = (): boolean => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia('(pointer: coarse)').matches;
};

/**
 * 触屏下把各 gaze 系统的"浮现延迟"压到 0。
 *
 * [2026-10-15 莉莉子] 审查发现：`useCardGaze` 里 GameSession 配的是 `delay: 800`、
 * 关键词/武装是 300ms、迷宫强化是 400ms。触屏长按本身已经等过 400ms 了，
 * 若再叠加这些延迟 ⇒ 备战席要按住 **1200ms** 才浮出，而 400ms 时环已消失、屏幕毫无变化，
 * 玩家只会以为"没生效"。触屏上"悬停"只可能由长按产生，不存在 PC 那种"鼠标扫过就闪"的顾虑
 * ⇒ 直接把延迟归零。
 */
export const gazeEnterDelay = (configured: number): number => (isTouchInput() ? 0 : configured);

/**
 * 命中检测：返回该点下方的「可预览元素」，命中不到返回 null。
 *
 * 用 closest() 而不是直接取 elementFromPoint 的返回值 —— 因为战场/备战席的卡牌外层是
 * `display: contents` 的"空气外壳"（零尺寸、命中不到），但它在 DOM 树上仍是祖先，
 * closest() 能穿过它找到带标记的那一层。（同 useCardGaze.ts:183 向下穿透的思路）
 */
export function hitGazeTarget(x: number, y: number): HTMLElement | null {
    const hit = hitTestGaze(x, y);
    return hit.kind === 'gaze' ? hit.el : null;
}

/** 命中检测的三种结果 */
export type GazeHit =
    | { kind: 'gaze'; el: HTMLElement }  // 命中可预览元素 ⇒ 切换预览
    | { kind: 'hold' }                    // 命中保持区（我们自己的大图浮层）⇒ 维持不变
    | { kind: 'blank' };                  // 空白 ⇒ 关闭预览

/**
 * 三态命中检测（审查发现后补的 'hold' 态）：
 * 不区分"浮层自身"和"空白"的话，用户只是把手指移到大图上，预览就被自己关掉了。
 */
export function hitTestGaze(x: number, y: number): GazeHit {
    if (typeof document === 'undefined') return { kind: 'blank' };
    const el = document.elementFromPoint(x, y) as HTMLElement | null;
    if (!el) return { kind: 'blank' };
    try {
        if (el.closest(GAZE_HOLD_SELECTOR)) return { kind: 'hold' };
        const gaze = el.closest(GAZE_SELECTOR) as HTMLElement | null;
        if (gaze) return { kind: 'gaze', el: gaze };
    } catch {
        return { kind: 'blank' };
    }
    return { kind: 'blank' };
}

/**
 * 合成一对 mouseout/mouseover —— 让 React 自己推出 onMouseLeave / onMouseEnter。
 *
 * @param prev 上一帧命中的元素（传 null = 此前没有预览）
 * @param next 本帧命中的元素（传 null = 滑到空白 ⇒ 关闭上一个预览，程 2026-10-14 拍板①）
 *
 * ℹ️ 审查补充的事实：`relatedTarget` 是受管 React 节点时，React 会在
 * `react-dom-client.development.js:19467-19471` 主动 `break a` 跳过 mouseover 的合成
 * ⇒ 常规两元素切换里**真正起作用的只有 mouseout**（它已同时合成 leave + enter），
 * mouseover 那一次是空操作。所以下面这两种写法都成立，不是"两个都必要"。
 */
export function dispatchGazeSwitch(prev: HTMLElement | null, next: HTMLElement | null): void {
    if (prev === next) return;

    // ⚠️ 祖先/后代关系要拆成两段式（审查发现）：
    //   React 的 enter/leave 语义规定"进入祖先不算进入"（公共祖先截断）。
    //   卡内武装 pip 是卡牌外壳的后代 ⇒ 从 pip 滑回卡面会被判成"只 leave 不 enter"，
    //   预览整个消失且不会恢复。拆成"先干净离开、再干净进入"即可。
    if (prev && next && (prev.contains(next) || next.contains(prev))) {
        prev.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: null }));
        next.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, relatedTarget: null }));
        return;
    }

    if (prev) {
        prev.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: next }));
    }
    if (next) {
        next.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, relatedTarget: prev }));
    }
}

// ─────────────────────────────────────────────────────────────
// 滞留状态：抬手后浮层还留一会儿，期间可以点浮层上的按钮。
// 用最小的模块级 store + useSyncExternalStore（生产方是 TouchFeedbackLayer，
// 消费方是 FloatingCardPreview，两者不在同一棵子树里）。
// ─────────────────────────────────────────────────────────────

type LingerListener = () => void;
let lingerActive = false;
const lingerListeners = new Set<LingerListener>();

export const touchLingerStore = {
    subscribe(listener: LingerListener): () => void {
        lingerListeners.add(listener);
        return () => { lingerListeners.delete(listener); };
    },
    getSnapshot(): boolean {
        return lingerActive;
    },
    set(next: boolean): void {
        if (lingerActive === next) return;
        lingerActive = next;
        lingerListeners.forEach(l => l());
    },
};

/** 由 TouchFeedbackLayer 注册的「立刻关闭悬停预览」实现（供浮层按钮调用） */
let closeHandler: (() => void) | null = null;

export function registerTouchGazeCloser(fn: (() => void) | null): void {
    closeHandler = fn;
}

/** 立刻关闭悬停预览（浮层上的「详情 / 关闭」按钮点完就调它） */
export function closeTouchGaze(): void {
    if (closeHandler) closeHandler();
}
