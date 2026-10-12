// ==========================================
// [2026-10-09 莉莉子 · 影片卡顿治理 P1] 循环视频「全局并发预算」——**唯一实现**
// ============================================================
// ── 病根（两轮实测日志）──
//   同屏 20+ 路循环视频（法术卡面 / 英雄卡面 / 卡背 / 牌桌 / 背景）一起解码时，
//   **影片元素会在播放中途丢掉数据源**，实测三连特征：
//     `readyState=HAVE_CURRENT_DATA` + `networkState=NETWORK_IDLE` + `currentTime` 不再前进
//   ⇒ 画面定格（升级影片冻在 7.5s、胜利影片冻在 3.45s，丢帧率一度 40%）。
//   ⚠️ 已排除：解码能力（三档画质丢帧 0/0/1）、blob 被 revoke（取证日志显示缓存从未超过 2 条）。
//   ⇒ 剩下的解释只有一条：**解码/缓冲总量被同屏视频瓜分**。
//
// ── 本模块做什么 ──
//   ① **全局名额**：最多同时播 MAX_SLOTS 路；超出的按「优先级低 → 申请早」让位（暂停）
//   ② ⭐ **影片放映期**：`setMovieHold(true)` ⇒ 名额压到 **0**，所有循环视频**立即让路**；
//      放映结束 `setMovieHold(false)` ⇒ 自动按优先级恢复（不需要各组件自己重试）
//   ③ **优先级**：数字越大越优先；同级按注册顺序（FIFO）
//   ④ 可见性门控由调用方负责（`LoopVideo` 用 IntersectionObserver），本模块只管"谁有资格播"
//
// ── 为什么用"注册表 + 重算"而不是"申请/释放" ──
//   影片结束的那一刻，被暂停的视频需要被**自动**恢复。若用一次性的 acquire/release，
//   每个组件都得自己订阅事件重试、极易漏。注册表模型下 `pump()` 统一决定，不会漏。
// ==========================================

/** 同时最多播放的循环视频数（与 `CardFaceVideo` 原值一致：够用且不炸） */
const MAX_SLOTS = 3;

/**
 * ⚠️ [2026-10-10 实测止血] **并发上限先关掉**。
 * ── 实测证据（程 10-10 的 `Vdiag` 日志）：名额 3 路 ⇒ 同屏可见的视频数远超 3 ⇒
 *    **抢占式让位每秒都在换人**，日志里同一路反复 `起播 → 让位 → 起播`（`card_back/02_.webm` 一轮里起播 6 次），
 *    每路都在 t≈0.5s 被按停 ⇒ 玩家看到的是「**画面里好多地方的视频播一下停一下**」。
 * ── 结论：**"暂停式让位"本身就是一个可见的缺陷**（它把"资源竞争"变成了"观感抖动"）。
 *    ⇒ 先关掉上限，只保留真正对症的那一条：**影片放映期整体让位（limit=0）**。
 * ── 真正要减并发，得靠"**不产生这么多 <video>**"（素材侧改 sprite/WebP、或离屏就不挂 src），
 *    而不是在播放期互相抢名额。
 */
const ENABLE_CONCURRENCY_CAP = false;

interface Candidate {
    el: HTMLVideoElement;
    /** 越大越优先 */
    priority: number;
    /** 调用方（可见性门控）希望它播 */
    want: boolean;
}

/** 注册表：保持插入序 ⇒ 同级优先级下天然 FIFO */
const candidates = new Map<HTMLVideoElement, Candidate>();

/** 影片放映期：true ⇒ 名额为 0（循环视频全部让位） */
let movieHold = false;

const shortName = (s: string | null | undefined): string => {
    if (!s) return '(none)';
    const parts = s.split('?')[0].split('/');
    return decodeURIComponent(parts.slice(-2).join('/'));
};

/** 彻底释放一个 <video> 的解码器（浏览器只在 src 摘除后回收） */
export const releaseVideoElement = (el: HTMLVideoElement | null): void => {
    if (!el) return;
    try { el.pause(); } catch { /* noop */ }
    el.removeAttribute('src');
    try { el.load(); } catch { /* noop */ }
};

/**
 * 重新分配名额：想要播的按「优先级降序、同级 FIFO」取前 N 个播放，其余暂停。
 * 幂等 —— 可被任意调用方随意触发。
 */
const pump = (): void => {
    // [2026-10-10] 名额：影片放映期 = 0（整体让位，这是对症的那条）；
    //   非放映期 = **不设上限**（抢占式让位已实测造成"播一下停一下"的观感抖动，先关掉）
    const limit = movieHold ? 0 : (ENABLE_CONCURRENCY_CAP ? MAX_SLOTS : Number.POSITIVE_INFINITY);
    const wantList = [...candidates.values()].filter(c => c.want);
    // ⚠️ Array.prototype.sort 在现代 JS 里是**稳定**的 ⇒ 同级保持插入序（FIFO）
    wantList.sort((a, b) => b.priority - a.priority);
    const allowed = new Set(wantList.slice(0, limit).map(c => c.el));

    for (const c of candidates.values()) {
        const el = c.el;
        if (allowed.has(el)) {
            if (el.paused) {
                const p = el.play();
                if (p !== undefined) p.catch(() => { /* autoplay 被拒：忽略，继续显示 poster */ });
            }
        } else if (!el.paused) {
            try { el.pause(); } catch { /* noop */ }
            // 留痕：一眼看出"谁给谁让了位"（验证 P1 是否真的生效，比看结果猜快得多）
            console.log(`[Vdiag] 🎬 循环视频让位：${shortName(el.currentSrc)}（名额 ${limit}${movieHold ? '，影片放映中' : ''}）`);
        }
    }
};

/**
 * 登记一个循环视频（组件挂载时调用）。返回 disposer（卸载时调用 ⇒ 摘掉名额并释放解码器）。
 * @param priority 数字越大越优先；建议：交战/悬停 30 · 备战席 20 · 手牌 10 · 卡背 5 · 牌桌 0 · 全屏背景 −20
 */
export const registerVideoCandidate = (el: HTMLVideoElement, priority = 0): (() => void) => {
    candidates.set(el, { el, priority, want: false });
    pump();
    return () => {
        candidates.delete(el);
        releaseVideoElement(el);
        pump();
    };
};

/** 可见性门控出口：告诉预算"这一路现在想不想播" */
export const setCandidateWantsToPlay = (el: HTMLVideoElement, want: boolean): void => {
    const c = candidates.get(el);
    if (!c || c.want === want) return;
    c.want = want;
    pump();
};

/**
 * ⭐ 影片放映期开关（**P1 的核心**）
 * 一次性影片（升级 / 胜利）开播 ⇒ 传 true；播完/停片 ⇒ 传 false。
 * 效果：循环视频立即全部让位（并保持暂停），影片结束自动恢复。
 */
export const setMovieHold = (hold: boolean): void => {
    if (movieHold === hold) return;
    movieHold = hold;
    console.log(`[Vdiag] 🎬 影片放映期${hold ? '开始 → 循环视频全部让位' : '结束 → 循环视频按优先级恢复'}（当前循环视频 ${candidates.size} 路）`);
    pump();
};

/** 场景切换：释放**全部**循环视频的解码器（由调用方在离开对局/切页签时调用） */
export const releaseAllVideoCandidates = (): void => {
    for (const c of candidates.values()) releaseVideoElement(c.el);
    candidates.clear();
    pump();
};

/** 排查用：当前有几个候选、几个在播、是否处于影片放映期 */
export const getVideoBudgetReport = (): { candidates: number; playing: number; movieHold: boolean; limit: number } => {
    let playing = 0;
    for (const c of candidates.values()) if (!c.el.paused) playing += 1;
    return { candidates: candidates.size, playing, movieHold, limit: movieHold ? 0 : (ENABLE_CONCURRENCY_CAP ? MAX_SLOTS : -1) };
};

// 挂到 window 供控制台随手查（与 `__VDIAG` 同族）
if (typeof window !== 'undefined') {
    (window as unknown as { __VBUDGET?: () => void }).__VBUDGET = () => {
        const r = getVideoBudgetReport();
        console.log(`[Vdiag] 🎬 循环视频预算：候选 ${r.candidates} · 在播 ${r.playing} · 名额 ${r.limit}${r.movieHold ? '（影片放映中，全部让位）' : ''}`);
    };
}
