// ==========================================
// [2026-10-09 建立 · 2026-10-10 重做] 影片/动效播放诊断仪表
// ============================================================
// ── 这一版为什么重做（程 10-10 的要求）──
//   ① **要加全**：游戏里有动效的不止"升级/胜利影片"，卡面/法术/卡背/牌桌/大厅/关卡选择全都要看到
//   ② **不许一直探测**：上一版每个元素每 5 秒打一条 ⇒ 测一会儿日志就几百行，**定位反而更难**
//
// ── 本版设计 ──
//   · **单个全局心跳**（1 次/秒）遍历所有登记过的 <video>，**不做 per-element interval**
//   · **默认完全静默**：只更新内存统计；只有"异常"才留痕，且**同一元素同类异常每 5 秒最多一条**
//   · **按需拉取**：控制台 `__VPROBE()` 打汇总表（含**重复实例检测**）· `__VDUMP()` 导出可粘贴的统计
//   · **受控详录**：`__VREC(15)` 只详录 N 秒，到点自动关 ⇒ 日志长度可预期
//   · `probeDecodeSupport()` 每次会话每种分辨率只探一次（最多 3 次）
//
// ── 怎么用（控制台）──
//   __VPROBE()      现场汇总：每个 <video> 一行（src/可见/在播/t/丢帧/定格次数）+ 重复 src 清单
//   __VREC(20)      详录 20 秒（每秒一行/元素），到点自动停
//   __VDUMP()       导出累计统计（JSON 文本，可整段复制给我）
//   __VBUDGET()     循环视频并发预算现状（见 utils/videoBudget）
// ==========================================

const PREFIX = '[Vdia]';

/** 每个元素最多留多少条详录行（环形，防爆内存） */
const MAX_LINES_PER_EL = 40;
/** 同一元素同类异常的最小打印间隔（ms） */
const ANOMALY_THROTTLE_MS = 5000;
/** 每种分辨率最多探测硬解几次（整个会话） */
const MAX_PROBES = 3;

type AnyVideo = HTMLVideoElement & {
    webkitDecodedFrameCount?: number;
    webkitDroppedFrameCount?: number;
};

interface VideoStat {
    tag: string;
    el: HTMLVideoElement;
    src: string;
    loop: boolean;
    priority: number;
    firstSeen: number;
    lastT: number;
    stuckTicks: number;
    /** 累计：定格次数（未暂停、可见、但 currentTime 1 秒内几乎不前进） */
    stalls: number;
    /** 累计：走到 ended 的次数（loop=true 时出现即为异常） */
    endeds: number;
    /** 累计：播放/暂停切换次数（判断"抖动"用） */
    playSwitches: number;
    lastPaused: boolean;
    /** 最近一次异常打印时间（节流用） */
    lastAnomalyAt: number;
    lines: string[];
}

/** 全部登记过的元素（由 attachVideoProbe 维护） */
const stats = new Map<HTMLVideoElement, VideoStat>();
let attachSeq = 0;
let detailUntil = 0; // >now 时详录

const now = (): number => performance.now();

const shortName = (s: string | null | undefined): string => {
    if (!s) return '(none)';
    const parts = s.split('?')[0].split('/');
    return decodeURIComponent(parts.slice(-2).join('/'));
};

const num = (n: number | undefined, d = 0): string => (typeof n === 'number' && Number.isFinite(n) ? n.toFixed(d) : 'N/A');

const READY_TEXT: Record<number, string> = { 0: 'HAVE_NOTHING', 1: 'HAVE_METADATA', 2: 'HAVE_CURRENT_DATA', 3: 'HAVE_FUTURE_DATA', 4: 'HAVE_ENOUGH_DATA' };
const NET_TEXT: Record<number, string> = { 0: 'NETWORK_EMPTY', 1: 'NETWORK_IDLE', 2: 'NETWORK_LOADING', 3: 'NETWORK_NO_SOURCE' };

/** 元素自身是否"看起来可见"（注意：不含祖先 opacity，故只作参考） */
const visibleText = (v: HTMLVideoElement): string => {
    const r = v.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return '否(零尺寸)';
    const st = getComputedStyle(v);
    if (st.display === 'none' || st.visibility === 'hidden' || Number(st.opacity) === 0) return '否(隐藏)';
    return '是';
};

/** 单元素一行现场（探针与汇总表共用） */
export const videoStateLine = (v: HTMLVideoElement): string => {
    const av = v as AnyVideo;
    let seekEnd = NaN;
    try { if (v.seekable && v.seekable.length > 0) seekEnd = v.seekable.end(0); } catch { /* noop */ }
    let q: VideoPlaybackQuality | undefined;
    try { q = typeof v.getVideoPlaybackQuality === 'function' ? v.getVideoPlaybackQuality() : undefined; } catch { /* noop */ }
    const total = q?.totalVideoFrames;
    const dropped = q?.droppedVideoFrames;
    const dropRate = (typeof total === 'number' && typeof dropped === 'number' && total > 0) ? `${((dropped / total) * 100).toFixed(1)}%` : 'N/A';
    return [
        `src=${shortName(v.currentSrc || v.getAttribute('src'))}`,
        `可见=${visibleText(v)}`,
        `${v.videoWidth}x${v.videoHeight}`,
        `时长=${num(v.duration, 2)}s`,
        `seek=${num(seekEnd, 2)}`,
        `t=${num(v.currentTime, 2)}`,
        `ready=${READY_TEXT[v.readyState] ?? v.readyState}`,
        `net=${NET_TEXT[v.networkState] ?? v.networkState}`,
        `paused=${v.paused} ended=${v.ended} loop=${v.loop} rate=${v.playbackRate}`,
        `帧:总=${num(total)} 丢=${num(dropped)}(${dropRate})`,
        `webkit:解=${num(av.webkitDecodedFrameCount)} 丢=${num(av.webkitDroppedFrameCount)}`,
    ].join(' | ');
};

// ==========================================
// 硬解能力探测（每种分辨率一次）
// ==========================================
const CODEC_CANDIDATES: { label: string; contentType: string }[] = [
    { label: 'VP9  vp09.00.10.08', contentType: 'video/webm; codecs="vp09.00.10.08"' },
    { label: 'VP9  vp9 (旧写法)', contentType: 'video/webm; codecs="vp9"' },
    { label: 'AV1  av01.0.08M.08', contentType: 'video/mp4; codecs="av01.0.08M.08"' },
    { label: 'H.264 avc1.640028', contentType: 'video/mp4; codecs="avc1.640028"' },
];

let probeCount = 0;

export const probeDecodeSupport = async (w: number, h: number, fps = 30, bitrate = 4_000_000): Promise<void> => {
    const mc = (navigator as unknown as { mediaCapabilities?: { decodingInfo?: (c: unknown) => Promise<{ supported: boolean; smooth: boolean; powerEfficient: boolean }> } }).mediaCapabilities;
    if (!mc?.decodingInfo) { console.log(`${PREFIX} ⚠️ 无 mediaCapabilities.decodingInfo，跳过硬解探测`); return; }
    console.log(`${PREFIX} ===== 硬解能力探测（${w}x${h}@${fps}）=====`);
    for (const c of CODEC_CANDIDATES) {
        try {
            const r = await mc.decodingInfo({ type: 'file', video: { contentType: c.contentType, width: w, height: h, bitrate, framerate: fps } });
            console.log(`${PREFIX} ${c.label} → supported=${r.supported} smooth=${r.smooth} powerEfficient=${r.powerEfficient}${r.powerEfficient ? ' ← 硬解' : ' ← 非硬解'}`);
        } catch (e) {
            console.log(`${PREFIX} ${c.label} → 探测失败：${(e as Error)?.message}`);
        }
    }
    console.log(`${PREFIX} ⚠️ powerEfficient 可能偏乐观；最终以实播丢帧为准`);
};

// ==========================================
// 登记 / 注销
// ==========================================

/** 每元素"回圈重缓冲"计数（**当前头号嫌疑**的判据）
 *  ── 依据：`loop` 在 Chromium 里 = ended 时 seek 回 0（官方 CL 562493003），
 *     实测素材整片只有 1~2 个关键帧，且每次回圈日志都出现 `waiting + ready 掉回 HAVE_METADATA`。
 *     ⇒ `waiting/stalled/seeking` 次数 ÷ 播放时长 = "每秒被打断几次"。 */
const churnCounts = new Map<HTMLVideoElement, { waiting: number; stalled: number; seeking: number }>();

/**
 * 挂探针（**只读**，不做任何播放控制）。所有动效与影片都应挂上。
 * @param tag 分类标签：movie / loop / desk / cardface / cardback / bg …
 * @param priority 该元素在并发预算里的优先级（仅用于报表展示）
 */
export const attachVideoProbe = (
    video: HTMLVideoElement,
    getSrc: () => string | null | undefined,
    tag: string,
    priority = 0,
): (() => void) => {
    const instTag = `${tag}#${++attachSeq}`;
    const stat: VideoStat = {
        tag: instTag, el: video, src: shortName(getSrc()), loop: video.loop, priority,
        firstSeen: now(), lastT: -1, stuckTicks: 0, stalls: 0, endeds: 0, playSwitches: 0,
        lastPaused: video.paused, lastAnomalyAt: 0, lines: [],
    };
    stats.set(video, stat);
    churnCounts.set(video, { waiting: 0, stalled: 0, seeking: 0 });
    console.log(`${PREFIX} ➕ 登记 ${instTag}（${stat.src}，优先级 ${priority}）—— 默认静默，用 __VPROBE() 拉取现场`);

    // 只在"异常"时留痕的三类事件（节流）
    const onEnded = (): void => {
        stat.endeds += 1;
        if (stat.loop) logAnomaly(stat, `🔴 循环视频走到 ended（不会再自动循环）`, true);
    };
    const onError = (): void => logAnomaly(stat, `⚠️ error code=${video.error?.code} msg=${video.error?.message}`, true);
    // [2026-10-10] 「回圈重缓冲」判据：waiting / stalled / seeking 各计一次
    const onChurn = (e: Event): void => {
        const c = churnCounts.get(video);
        if (!c) return;
        if (e.type === 'waiting') c.waiting += 1;
        else if (e.type === 'stalled') c.stalled += 1;
        else c.seeking += 1;
    };
    video.addEventListener('ended', onEnded);
    video.addEventListener('error', onError);
    video.addEventListener('waiting', onChurn);
    video.addEventListener('stalled', onChurn);
    video.addEventListener('seeking', onChurn);

    // 元数据到手 ⇒ 每种分辨率探一次硬解能力（全会话最多 MAX_PROBES 次）
    const onMeta = (): void => {
        const key = `${video.videoWidth}x${video.videoHeight}`;
        if (key !== stat.src && probeCount < MAX_PROBES) {
            probeCount += 1;
            void probeDecodeSupport(video.videoWidth || 1280, video.videoHeight || 720, 30, 4_000_000);
        }
    };
    video.addEventListener('loadedmetadata', onMeta);

    return () => {
        video.removeEventListener('ended', onEnded);
        video.removeEventListener('error', onError);
        video.removeEventListener('loadedmetadata', onMeta);
        video.removeEventListener('waiting', onChurn);
        video.removeEventListener('stalled', onChurn);
        video.removeEventListener('seeking', onChurn);
        churnCounts.delete(video);
        stats.delete(video);
        console.log(`${PREFIX} ➖ 注销 ${instTag}（${stat.src}｜定格 ${stat.stalls} · ended ${stat.endeds}）`);
    };
};

const logAnomaly = (stat: VideoStat, msg: string, force = false): void => {
    const t = now();
    if (!force && t - stat.lastAnomalyAt < ANOMALY_THROTTLE_MS) return;
    stat.lastAnomalyAt = t;
    const line = `${PREFIX} [${stat.tag}] +${((t - stat.firstSeen) / 1000).toFixed(1)}s ${msg}`;
    console.log(line);
    pushLine(stat, line);
};

const pushLine = (stat: VideoStat, line: string): void => {
    stat.lines.push(line);
    if (stat.lines.length > MAX_LINES_PER_EL) stat.lines.shift();
};

// ==========================================
// 全局心跳：1 次/秒 扫全部元素（默认静默，只统计 + 异常留痕）
// ==========================================
let heartbeat: number | null = null;

const tick = (): void => {
    const detail = now() < detailUntil;
    for (const stat of stats.values()) {
        const el = stat.el;
        const t = el.currentTime;
        // 播放/暂停抖动计数
        if (el.paused !== stat.lastPaused) { stat.playSwitches += 1; stat.lastPaused = el.paused; }
        // 定格判定：可见（有尺寸）+ 未暂停 + 未 ended，而 currentTime 一秒内几乎不前进
        const box = el.getBoundingClientRect();
        const reallyVisible = box.width > 0 && box.height > 0;
        if (!el.paused && !el.ended && reallyVisible) {
            if (stat.lastT >= 0 && Math.abs(t - stat.lastT) < 0.02) {
                stat.stuckTicks += 1;
                if (stat.stuckTicks >= 2) {
                    stat.stalls += 1;
                    stat.stuckTicks = 0;
                    logAnomaly(stat, `🟡 定格：${videoStateLine(el)}`);
                }
            } else stat.stuckTicks = 0;
        } else stat.stuckTicks = 0;
        stat.lastT = t;
        stat.src = shortName(el.currentSrc || el.getAttribute('src'));
        stat.loop = el.loop;

        if (detail) {
            const line = `${PREFIX} [${stat.tag}] ⏱ ${videoStateLine(el)}`;
            console.log(line);
            pushLine(stat, line);
        }
    }
};

const ensureHeartbeat = (): void => {
    if (heartbeat !== null || typeof window === 'undefined') return;
    heartbeat = window.setInterval(tick, 1000);
};

// ==========================================
// 全局手动探针（汇总 / 详录 / 导出）
// ==========================================
let installed = false;

const installGlobalProbe = (): void => {
    if (installed || typeof window === 'undefined') return;
    installed = true;
    ensureHeartbeat();
    const w = window as unknown as Record<string, unknown>;

    /** 现场汇总（含重复实例检测） */
    w.__VPROBE = (): void => {
        const list = [...stats.values()];
        let playing = 0;
        const bySrc = new Map<string, number>();
        console.log(`${PREFIX} ===== 登记元素 ${list.length} 个（全局心跳 1 次/秒，默认静默）=====`);
        for (const s of list) {
            if (!s.el.paused) playing += 1;
            bySrc.set(s.src, (bySrc.get(s.src) || 0) + 1);
            const churn = churnCounts.get(s.el) ?? { waiting: 0, stalled: 0, seeking: 0 };
            const secs = Math.max(1, (now() - s.firstSeen) / 1000);
            const interrupts = churn.waiting + churn.stalled;
            console.log(
                `${PREFIX} [${s.tag}] 优先级=${s.priority} 抖动=${s.playSwitches} 定格=${s.stalls} ended=${s.endeds}` +
                ` **回圈=${interrupts} 次（${(interrupts / secs).toFixed(2)}/秒）** seek=${churn.seeking} | ${videoStateLine(s.el)}`,
            );
        }
        const dups = [...bySrc.entries()].filter(([, n]) => n > 1);
        console.log(`${PREFIX} 在播 ${playing}/${list.length} 路`);
        if (dups.length > 0) {
            console.log(`${PREFIX} ⚠️ **同一素材被挂了多份实例**（合并它们可零观感代价省资源）：`);
            dups.forEach(([src, n]) => console.log(`${PREFIX}    ${src} × ${n}`));
        } else {
            console.log(`${PREFIX} ✅ 未见重复实例`);
        }
        console.log(`${PREFIX} 提示：__VREC(20) 详录 20 秒 · __VDUMP() 导出统计`);
    };

    /** 受控详录：只详录 N 秒，到点自动停 */
    w.__VREC = (seconds = 15): void => {
        const s = Math.max(1, Math.min(120, Number(seconds) || 15));
        detailUntil = now() + s * 1000;
        console.log(`${PREFIX} ▶ 开始详录 ${s} 秒（每秒一行/元素），到点自动停止`);
        window.setTimeout(() => console.log(`${PREFIX} ⏹ 详录结束（已静默，随时 __VPROBE() 拉现场）`), s * 1000);
    };

    /** 导出累计统计（JSON 文本，可整段复制） */
    w.__VDUMP = (): void => {
        const data = [...stats.values()].map(s => {
            const q = ((): VideoPlaybackQuality | undefined => { try { return s.el.getVideoPlaybackQuality(); } catch { return undefined; } })();
            return {
                tag: s.tag, src: s.src, priority: s.priority, loop: s.loop,
                playing: !s.el.paused, visible: visibleText(s.el),
                size: `${s.el.videoWidth}x${s.el.videoHeight}`,
                t: Number(s.el.currentTime.toFixed(2)),
                ready: READY_TEXT[s.el.readyState] ?? s.el.readyState,
                net: NET_TEXT[s.el.networkState] ?? s.el.networkState,
                totalFrames: q?.totalVideoFrames ?? null,
                droppedFrames: q?.droppedVideoFrames ?? null,
                playSwitches: s.playSwitches, stalls: s.stalls, endeds: s.endeds,
                lines: s.lines.slice(-10),
            };
        });
        console.log(`${PREFIX} ===== VDUMP（复制下面整段）=====`);
        console.log(JSON.stringify({ at: new Date().toLocaleString(), count: data.length, videos: data }, null, 1));
    };

    console.log(`${PREFIX} 仪表就绪（**默认静默，不再刷屏**）：__VPROBE() 拉现场 · __VREC(20) 详录 20 秒 · __VDUMP() 导出`);
};

installGlobalProbe();
