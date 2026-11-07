/**
 * [2026-11-07 联机诊断] 统一诊断日志。
 * 发布前把 NET_AUDIT 改成 false 即可全关，不需要逐个删调用点。
 */
// [2026-11-07 19:30 紧急止血] 置 false。原因：拖拽高举路径里 `fireNetIntent` 每帧都发一条意图，
//   房主侧 `远端·toggleAttacker` 带了全量 benchKeys，日志刷屏 + 状态反复翻转 → 卡死。
//   诊断结束、定位清楚后再逐条打开，不要一把全开。
export const NET_AUDIT = false;

// 导出而不是内部声明：`tsconfig.app.json` 开了 `noUnusedLocals`，未使用的局部类型会直接编译失败。
export type Level = 'log' | 'warn';

export function nlog(tag: string, ...args: unknown[]): void {
    if (!NET_AUDIT) return;
    // eslint-disable-next-line no-console
    console.log(`[NET-AUDIT][${tag}]`, ...args);
}

/** 只在值发生变化时打印，避免刷屏 */
const lastSeen = new Map<string, string>();
export function nlogChanged(tag: string, value: unknown, ...extra: unknown[]): void {
    if (!NET_AUDIT) return;
    let key: string;
    try { key = JSON.stringify(value); } catch { key = String(value); }
    if (lastSeen.get(tag) === key) return;
    lastSeen.set(tag, key);
    // eslint-disable-next-line no-console
    console.log(`[NET-AUDIT][${tag}]`, value, ...extra);
}

/** 计数器（配合 nlog 用，看有没有在动） */
const counters = new Map<string, number>();
export function ncount(tag: string, every = 1): void {
    if (!NET_AUDIT) return;
    const n = (counters.get(tag) ?? 0) + 1;
    counters.set(tag, n);
    if (n % every === 0) {
        // eslint-disable-next-line no-console
        console.log(`[NET-AUDIT][${tag}] 第 ${n} 次`);
    }
}

/**
 * [联机诊断 · 增益] 警告级：只留给「真的断了」的那几处（peer 清空 / 通道发不出去）。
 * 过滤方式是控制台搜 `[NET-AUDIT][!]`，一屏就能看到断点，不用在流程日志里捞。
 */
export function nwarn(tag: string, ...args: unknown[]): void {
    if (!NET_AUDIT) return;
    // eslint-disable-next-line no-console
    console.warn(`[NET-AUDIT][!][${tag}]`, ...args);
}

// ══════════════════════════════════════════════════════════════════════════
// [2026-11-07 联机诊断 · 计时] 跨页耗时分析
// ══════════════════════════════════════════════════════════════════════════
// 为什么用 Date.now() 而不用 performance.now()：
//   房主和客方是**两个独立页面**，各自的高精度计时器从各自导航开始算，
//   基准不同 ⇒ 直接相减毫无意义。Date.now() 是同一台机器的墙钟，可以跨页对齐。
//
// 采样统一落到 `window.__NETTIMES__`（环形缓冲，最多 400 条），
// 不用去控制台捞字符串：一局结束后一次性读出数组算差值。
//
// 用法：
//   ntime('房主·意图', intent.op)     房主：意图产生
//   ntime('房主·发布')                房主：真正 publish 出去
//   ntime('客方·收到')                客方：快照到达
//   ntime('客方·应用')                客方：setGame 完成

export interface NetTimeSample {
    tag: string;
    at: number;
    extra?: unknown;
}

const NET_TIME_CAP = 400;

export function ntime(tag: string, extra?: unknown): void {
    if (!NET_AUDIT) return;
    const w = globalThis as unknown as { __NETTIMES__?: NetTimeSample[] };
    if (!Array.isArray(w.__NETTIMES__)) w.__NETTIMES__ = [];
    w.__NETTIMES__.push({ tag, at: Date.now(), extra });
    if (w.__NETTIMES__.length > NET_TIME_CAP) w.__NETTIMES__.shift();
}

/** 读出全部采样（测试脚本用），并给出相邻两点的间隔，直接看出慢在哪一段。 */
export function readNetTimes(): { samples: NetTimeSample[]; gaps: Array<{ from: string; to: string; ms: number }> } {
    const w = globalThis as unknown as { __NETTIMES__?: NetTimeSample[] };
    const samples = Array.isArray(w.__NETTIMES__) ? w.__NETTIMES__ : [];
    const gaps: Array<{ from: string; to: string; ms: number }> = [];
    for (let i = 1; i < samples.length; i++) {
        gaps.push({ from: samples[i - 1].tag, to: samples[i].tag, ms: samples[i].at - samples[i - 1].at });
    }
    return { samples, gaps };
}
