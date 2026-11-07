/**
 * transport-ice.ts —— 超元链接 · WebRTC 打洞传输层
 * ============================================================================
 * 目标：让两个在不同网络后面的玩家**直连**，中间不经过任何服务器转发游戏数据。
 *
 * 只用两样东西：
 *   · 信令（`signaling.ts`）—— 把双方那几段「怎么找到我」的文本互相递一次
 *   · 公共 STUN 节点     —— 告诉每台机器「你在公网上长什么样」
 * 连上之后信令就可以断开了，数据走点对点。
 *
 * 设计上刻意与 `transport-tcp.ts` 保持**同一个 `Peer` 形状** ——
 * `room.ts` 只认那个接口，所以房间协议、快照同步、意图通道一行都不用改。
 *
 * ═══ 两个把它写坏就会「看着像通了其实没通」的坑 ═══
 *
 * ① **DataChannel 单条消息有大小上限**（SCTP 层，通常 256KB，跨实现建议按 16KB 算）。
 *    我们的全量 GameState 快照可能上百 KB ⇒ 直接 `send` 会抛错或静默丢。
 *    这里做了透明分片：发送端切成 F RAG_CHARS 一段，接收端按序号拼回来，
 *    对 `Peer.send` 的调用方完全无感。
 *
 * ② **ICE 收集必须等完成再发**（非 trickle）。trickle ICE 要在协商过程中不断
 *    追加 candidate，信令层得为它保持长连接 —— 而我们希望信令连完就断。
 *    代价是建连慢 1~3 秒，换来信令只发两条消息，值得。
 * ============================================================================
 */

import type { Peer, PeerMessage } from './transport-tcp';
import { connectSignaling, makeRoomCode, type SignalingChannel, type SignalingHandlers } from './signaling';
import { nodeRequire } from './nodeEnv';
// [2026-11-07 联机诊断] 传输层计数：send/recv 各自在动 = 通道本身没问题，断点在房间/引擎层。
import { ncount, nlogChanged } from './audit';

/** 公共 STUN：多个做冗余，任何一个可用即可。都不需要账号。 */
const ICE_SERVERS: RTCIceServer[] = [
    { urls: 'stun:stun.cloudflare.com:3478' },
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
];

/**
 * 分片大小（字符数）。
 * 取 12000 而不是贴着 16KB：JSON 字符串里带引号转义，实际字节会膨胀约 10%，
 * 留出余量才能保证每个分片都稳稳落在单条消息上限之内。
 */
const FRAG_CHARS = 12000;

/** 整个打洞过程的上限。超时基本等于「双方 NAT 打不通」。 */
const DEFAULT_PUNCH_TIMEOUT_MS = 30000;

/** 等 ICE 收集完成的上限（部分网络会一直收不到 complete）。 */
const ICE_GATHER_TIMEOUT_MS = 8000;

// ══════════════════════════════════════════════════════════════════════════
// 流量统计（测试期用，测完可以整段删掉）
// ══════════════════════════════════════════════════════════════════════════
// 目的只有一个：**量出一局到底传了多少字节**。
// 这个数字决定架构走向 ——
//   · 一局只有几 MB  ⇒ 纯服务器转发更简单，打洞这一整套可以砍掉
//   · 一局几十上百 MB ⇒ 必须 P2P，现在的复杂度就是必要代价
// 每 5 秒往控制台打一行，一局结束看最后那一行就是答案。

const netStat = {
    sentMsgs: 0,
    sentBytes: 0,
    recvMsgs: 0,
    recvBytes: 0,
    lastLogAt: 0,
};

/** 统计文件路径（桌面）。取不到用户目录就退化成不打日志。 */
function statLogPath(): string {
    const proc = (globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }).process;
    const home = proc?.env?.USERPROFILE || proc?.env?.HOME || '';
    return home ? `${home}\\Desktop\\sbr-net-stat.log` : '';
}

/**
 * 每 5 秒记一行到桌面 `sbr-net-stat.log`。
 *
 * ⚠️ 为什么写文件而不是 console.log：
 *    `vite.config.ts:101` 开了 obfuscator 的 `disableConsoleOutput: true`
 *    ⇒ 生产包里的 console 被整个抹掉，日志根本出不来（这一点我最初漏了）。
 *    而开 DevTools 去看日志又会撞上 `debugProtection`（`:99`）插入的 `debugger` 死循环。
 *    两头都堵死 ⇒ 只能落盘。
 */
function logNetStat(): void {
    const now = Date.now();
    if (now - netStat.lastLogAt < 5000) return;
    netStat.lastLogAt = now;

    const path = statLogPath();
    if (!path) return;
    const fs = nodeRequire('fs') as { appendFileSync: (p: string, d: string) => void } | null;
    if (!fs) return;

    const kb = (n: number) => (n / 1024).toFixed(0);
    const mb = (n: number) => (n / 1024 / 1024).toFixed(2);
    const line =
        `[${new Date().toLocaleTimeString()}] ` +
        `发送 ${netStat.sentMsgs} 条 / ${kb(netStat.sentBytes)} KB (${mb(netStat.sentBytes)} MB)　` +
        `接收 ${netStat.recvMsgs} 条 / ${kb(netStat.recvBytes)} KB (${mb(netStat.recvBytes)} MB)`;

    try {
        fs.appendFileSync(path, line + '\n');
    } catch {
        /* 没写权限（少数环境）⇒ 静默跳过，不影响对局 */
    }
}

/** 每局开始时清零，并在日志里留一条分隔行。 */
export function resetNetStat(): void {
    netStat.sentMsgs = 0;
    netStat.sentBytes = 0;
    netStat.recvMsgs = 0;
    netStat.recvBytes = 0;
    netStat.lastLogAt = 0;

    const path = statLogPath();
    if (!path) return;
    const fs = nodeRequire('fs') as { appendFileSync: (p: string, d: string) => void } | null;
    if (!fs) return;
    try {
        fs.appendFileSync(path, `\n===== 新对局 ${new Date().toLocaleString()} =====\n`);
    } catch {
        /* ignore */
    }
}

/** 读当前累计值（想显示到界面上时可以调）。 */
export function readNetStat(): { sentMsgs: number; sentBytes: number; recvMsgs: number; recvBytes: number } {
    return {
        sentMsgs: netStat.sentMsgs,
        sentBytes: netStat.sentBytes,
        recvMsgs: netStat.recvMsgs,
        recvBytes: netStat.recvBytes,
    };
}

// ══════════════════════════════════════════════════════════════════════════
// 对外类型
// ══════════════════════════════════════════════════════════════════════════

export interface IceHandlers {
    /** 对方已经连上并打通（数据通道可用）。 */
    onConnected?: () => void;
    /** 对方掉线或离开。 */
    onPeerLeft?: () => void;
    /** 打洞失败 / 信令出错。文案已可直接展示给玩家。 */
    onError?: (reason: string) => void;
}

export interface IceHostSession {
    /** 要念给对方的 6 位房间号 */
    readonly room: string;
    /** 客方接通后 resolve；失败 reject */
    readonly peer: Promise<Peer>;
    /** 取消等待 / 关闭房间 */
    close(): void;
}

export interface HostIceOptions {
    /** 信令地址（已规范化） */
    url: string;
    handlers?: IceHandlers;
    timeoutMs?: number;
}

export interface JoinIceOptions {
    /** 信令地址（已规范化） */
    url: string;
    room: string;
    handlers?: IceHandlers;
    timeoutMs?: number;
}

// ══════════════════════════════════════════════════════════════════════════
// 分片（纯函数，可脱离浏览器单独测试）
// ══════════════════════════════════════════════════════════════════════════

/**
 * 把一条已经序列化好的消息切成若干帧，每帧都是一个可 `send` 的字符串。
 *
 * 小于阈值时原样返回（不分片），所以短消息没有额外开销。
 * 分片帧形如 `{"__f":7,"i":0,"n":3,"d":"…"}`。
 */
export function fragmentMessage(json: string, fragId: number): string[] {
    if (json.length <= FRAG_CHARS) return [json];
    const total = Math.ceil(json.length / FRAG_CHARS);
    const out: string[] = [];
    for (let i = 0; i < total; i++) {
        out.push(JSON.stringify({
            __f: fragId,
            i,
            n: total,
            d: json.slice(i * FRAG_CHARS, (i + 1) * FRAG_CHARS),
        }));
    }
    return out;
}

/**
 * 分片重组器。
 *
 * `push` 吃进每一帧的原始字符串：
 *   · 不是分片 ⇒ 原样返回（调用方直接当消息处理）
 *   · 是分片但还没凑齐 ⇒ 返回 null
 *   · 凑齐了 ⇒ 返回拼好的完整 JSON 字符串
 *
 * 支持乱序到达、支持多条消息交错（按 `__f` 分组）。
 */
export class MessageReassembler {
    private incoming = new Map<number, { parts: Array<string | undefined>; got: number; total: number }>();

    push(raw: string): string | null {
        let obj: unknown;
        try {
            obj = JSON.parse(raw);
        } catch {
            return null;
        }
        if (!obj || typeof obj !== 'object') return null;

        const f = obj as { __f?: number; i?: number; n?: number; d?: string };
        if (typeof f.__f !== 'number' || typeof f.i !== 'number' || typeof f.n !== 'number') {
            // 不是分片 —— 原文就是完整消息
            return raw;
        }

        let slot = this.incoming.get(f.__f);
        if (!slot) {
            slot = { parts: new Array<string | undefined>(f.n), got: 0, total: f.n };
            this.incoming.set(f.__f, slot);
        }
        if (slot.parts[f.i] === undefined && typeof f.d === 'string') {
            slot.parts[f.i] = f.d;
            slot.got += 1;
        }
        if (slot.got === slot.total) {
            this.incoming.delete(f.__f);
            return slot.parts.join('');
        }
        return null;
    }

    clear(): void {
        this.incoming.clear();
    }
}

// ══════════════════════════════════════════════════════════════════════════
// DataChannel → Peer
// ══════════════════════════════════════════════════════════════════════════

/**
 * 把一条打开的 DataChannel 包成 `Peer`。
 * 行为逐条对齐 `transport-tcp.ts` 的 `wrapPeer`：
 *   · `onMessage` / `onClose` 可多次注册，全部会被调用
 *   · `onClose` 若在已关闭后注册，立即回调
 *   · `send` 返回 false 表示发不出去
 */
function wrapDataChannel(
    dc: RTCDataChannel,
    pc: RTCPeerConnection,
    role: 'host' | 'guest',
    onClosed: (reason: string) => void,
): Peer {
    let alive = true;
    let closeReason = '';
    const msgHandlers: Array<(msg: PeerMessage) => void> = [];
    const closeHandlers: Array<(reason: string) => void> = [];

    // 每局（= 每次建立数据通道）把统计清零，日志里也留一条分隔行
    resetNetStat();

    // ── 分片接收状态 ──
    let nextFragId = 0;
    const reassembler = new MessageReassembler();

    const dispatch = (msg: PeerMessage) => {
        for (const cb of msgHandlers) {
            try { cb(msg); } catch { /* 单个回调出错不能影响其他 */ }
        }
    };

    const fireClose = (reason: string) => {
        if (!alive) return;
        alive = false;
        closeReason = reason;
        reassembler.clear();
        for (const cb of closeHandlers) {
            try { cb(reason); } catch { /* ignore */ }
        }
        onClosed(reason);
    };

    dc.onmessage = (ev: MessageEvent) => {
        ncount('transport.recv', 20); // [联机诊断] 到这里 = 对端的数据已经落到本机
        if (!alive) return;
        const raw = String(ev.data);
        netStat.recvMsgs += 1;
        netStat.recvBytes += raw.length;
        logNetStat();

        const done = reassembler.push(raw);
        if (done === null) return; // 分片还没凑齐
        let msg: unknown;
        try {
            msg = JSON.parse(done);
        } catch {
            return;
        }
        if (!msg || typeof msg !== 'object') return;
        dispatch(msg as PeerMessage);
    };

    dc.onclose = () => fireClose(closeReason || '数据通道已关闭');
    dc.onerror = () => fireClose('数据通道出错');

    return {
        role,
        // DataChannel 拿不到对端 IP（WebRTC 本身就不暴露），只给一个语义化标记
        remote: 'p2p',
        get alive() { return alive; },
        send(msg: PeerMessage): boolean {
            ncount('transport.send', 20); // [联机诊断] 入口计数含「通道没开就 return false」的尝试，故与下面样本成对照
            if (!alive || dc.readyState !== 'open') return false;
            try {
                // 超过单帧上限时自动分片 —— 调用方（room.ts）完全无感
                const frames = fragmentMessage(JSON.stringify(msg), ++nextFragId);
                let sent = 0;
                for (const frame of frames) {
                    dc.send(frame);
                    sent += frame.length;
                }
                netStat.sentMsgs += 1;
                netStat.sentBytes += sent;
                logNetStat();
                // [联机诊断] 真正写出去了一条：值只在「类型/分片数/尺寸量级」变化时才打，避免每帧刷屏
                nlogChanged(
                    'transport.send样本',
                    {
                        类型: msg.t,
                        分片: frames.length,
                        量级: sent >= 65536 ? '64KB+' : sent >= 16384 ? '16-64KB' : sent >= 1024 ? '1-16KB' : '<1KB',
                    },
                    sent,
                );
                return true;
            } catch {
                fireClose('发送失败，连接可能已经中断');
                return false;
            }
        },
        onMessage(cb) { msgHandlers.push(cb); },
        onClose(cb) {
            if (!alive) { try { cb(closeReason); } catch { /* ignore */ } return; }
            closeHandlers.push(cb);
        },
        close(reason?: string) {
            if (!alive) return;
            closeReason = reason || '本地主动断开';
            try { dc.close(); } catch { /* ignore */ }
            try { pc.close(); } catch { /* ignore */ }
            fireClose(closeReason);
        },
    };
}

// ══════════════════════════════════════════════════════════════════════════
// 内部工具
// ══════════════════════════════════════════════════════════════════════════

function createPeerConnection(): RTCPeerConnection {
    return new RTCPeerConnection({
        iceServers: ICE_SERVERS,
        // 只收数据，不要音视频
        bundlePolicy: 'max-bundle',
    });
}

/** 等 ICE 收集完成（或超时）。非 trickle 的前提。 */
function waitIceGathering(pc: RTCPeerConnection): Promise<void> {
    if (pc.iceGatheringState === 'complete') return Promise.resolve();
    return new Promise<void>((resolve) => {
        let done = false;
        const finish = () => {
            if (done) return;
            done = true;
            clearTimeout(timer);
            pc.removeEventListener('icegatheringstatechange', check);
            resolve();
        };
        const check = () => {
            if (pc.iceGatheringState === 'complete') finish();
        };
        const timer = setTimeout(finish, ICE_GATHER_TIMEOUT_MS);
        pc.addEventListener('icegatheringstatechange', check);
        // 有些实现会先触发 candidate 为 null 再改 state，两条路都收
        pc.addEventListener('icecandidate', (ev) => {
            if (!ev.candidate) finish();
        });
    });
}

/** 统一的失败文案：把「打不通」翻译成玩家能理解的一句话。 */
function punchFailureReason(): string {
    return '双方网络没能直接打通。这种情况多见于校园网、部分手机热点和运营商级 NAT，属于网络环境限制，不是配置错误。';
}

/** 检查浏览器/运行时是否支持 WebRTC。 */
export function isIceAvailable(): boolean {
    return typeof RTCPeerConnection !== 'undefined';
}

// ══════════════════════════════════════════════════════════════════════════
// 房主：开房
// ══════════════════════════════════════════════════════════════════════════

/**
 * 房主开房。返回的 `room` 立刻可用（念给朋友），`peer` 等对方接通后 resolve。
 *
 * @throws 信令连不上 / 房间号被占用时 reject
 */
export function hostViaIce(opts: HostIceOptions): Promise<IceHostSession> {
    const handlers = opts.handlers ?? {};
    const timeoutMs = opts.timeoutMs ?? DEFAULT_PUNCH_TIMEOUT_MS;

    if (!isIceAvailable()) {
        return Promise.reject(new Error('当前环境不支持 WebRTC（需要桌面版）'));
    }

    // 房间号由房主生成，撞号由信令服务端拒绝（4009）后重试
    return openHostWithRetry(opts.url, handlers, timeoutMs, 3);
}

/**
 * 生成房间号 → 连信令；`room-taken` 就换号重试。
 * 6 位数字有一百万种，连撞三次的概率可以忽略，但仍要给它一条出路。
 */
async function openHostWithRetry(
    url: string,
    handlers: IceHandlers,
    timeoutMs: number,
    attemptsLeft: number,
): Promise<IceHostSession> {
    let lastErr: unknown = null;

    for (let i = 0; i < attemptsLeft; i++) {
        const room = makeRoomCode();
        try {
            return await startHostSession(url, room, handlers, timeoutMs);
        } catch (e) {
            lastErr = e;
            // 只有「房间号被占用」才值得换号重试，其它错误直接抛
            if (!(e instanceof Error) || !/占用/.test(e.message)) throw e;
        }
    }

    throw lastErr instanceof Error ? lastErr : new Error('房间号分配失败，请重试');
}

async function startHostSession(
    url: string,
    room: string,
    handlers: IceHandlers,
    timeoutMs: number,
): Promise<IceHostSession> {
    let alive = true;
    let channel: SignalingChannel | null = null;
    let pc: RTCPeerConnection | null = null;
    let peerResolve: ((p: Peer) => void) | null = null;
    let peerReject: ((e: Error) => void) | null = null;

    const peerPromise = new Promise<Peer>((resolve, reject) => {
        peerResolve = resolve;
        peerReject = reject;
    });

    const timer = setTimeout(() => {
        if (!alive) return;
        peerReject?.(new Error('等了很久对方还没连上。请确认房间号没念错，或者让对方先点「加入房间」。'));
    }, timeoutMs);

    const finish = (err?: Error) => {
        if (!alive) return;
        alive = false;
        clearTimeout(timer);
        try { channel?.close(); } catch { /* ignore */ }
        try { pc?.close(); } catch { /* ignore */ }
        if (err) peerReject?.(err);
    };

    const sigHandlers: SignalingHandlers = {
        onError: (reason) => {
            handlers.onError?.(reason);
            finish(new Error(reason));
        },
        onPeerLeft: () => {
            handlers.onPeerLeft?.();
            finish(new Error('对方离开了房间'));
        },
        onReady: () => {
            // 对方已进房间 —— 由房主发起协商
            void makeOffer();
        },
        onSignal: (data) => {
            void takeAnswer(data);
        },
    };

    channel = await connectSignaling({ url, room, role: 'host', handlers: sigHandlers });

    const dcLabel = 'sbr-game';
    pc = createPeerConnection();

    pc.onconnectionstatechange = () => {
        if (!pc) return;
        if (pc.connectionState === 'failed') {
            handlers.onError?.(punchFailureReason());
            finish(new Error(punchFailureReason()));
        }
    };

    const dc = pc.createDataChannel(dcLabel, { ordered: true });

    dc.onopen = () => {
        if (!alive || !pc) return;
        const peer = wrapDataChannel(dc, pc, 'host', (reason) => {
            handlers.onPeerLeft?.();
            finish(new Error(reason));
        });
        handlers.onConnected?.();
        peerResolve?.(peer);
        // 打通之后信令就完成了历史使命
        try { channel?.close(); } catch { /* ignore */ }
        channel = null;
        clearTimeout(timer);
    };

    /** 生成 offer（等 ICE 收完）发给对方。 */
    const makeOffer = async () => {
        if (!alive || !pc) return;
        try {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            await waitIceGathering(pc);
            const local = pc.localDescription;
            if (!local) throw new Error('本地连接信息生成失败');
            channel?.send({ kind: 'offer', sdp: local.sdp, type: local.type });
        } catch (e) {
            handlers.onError?.((e as Error).message || '协商失败');
            finish(e instanceof Error ? e : new Error('协商失败'));
        }
    };

    /** 收对方的 answer。 */
    const takeAnswer = async (data: unknown) => {
        if (!alive || !pc) return;
        const d = data as { kind?: string; sdp?: string; type?: string };
        if (d?.kind !== 'answer' || typeof d.sdp !== 'string') return;
        try {
            await pc.setRemoteDescription({ type: 'answer', sdp: d.sdp });
        } catch (e) {
            handlers.onError?.('对方返回的连接信息无法使用');
            finish(e instanceof Error ? e : new Error('设置远端描述失败'));
        }
    };

    return {
        room,
        peer: peerPromise,
        close() {
            alive = false;
            clearTimeout(timer);
            try { channel?.close(); } catch { /* ignore */ }
            try { pc?.close(); } catch { /* ignore */ }
        },
    };
}

// ══════════════════════════════════════════════════════════════════════════
// 客方：加入
// ══════════════════════════════════════════════════════════════════════════

/**
 * 客方加入房间，接通后 resolve 出 `Peer`。
 *
 * 时序上做了两种到达顺序的兼容：
 *   · 先收到 `ready` 再收到 offer（常见）
 *   · offer 比 ready 先到（房主那侧发起得快）
 */
export async function joinViaIce(opts: JoinIceOptions): Promise<Peer> {
    const handlers = opts.handlers ?? {};
    const timeoutMs = opts.timeoutMs ?? DEFAULT_PUNCH_TIMEOUT_MS;

    if (!isIceAvailable()) {
        throw new Error('当前环境不支持 WebRTC（需要桌面版）');
    }

    let alive = true;
    let channel: SignalingChannel | null = null;
    let pc: RTCPeerConnection | null = null;
    let resolvePeer: ((p: Peer) => void) | null = null;
    let rejectPeer: ((e: Error) => void) | null = null;

    const peerPromise = new Promise<Peer>((resolve, reject) => {
        resolvePeer = resolve;
        rejectPeer = reject;
    });

    const timer = setTimeout(() => {
        if (!alive) return;
        rejectPeer?.(new Error('没有等到房主的回应。请确认房间号正确、房主还在房间里。'));
    }, timeoutMs);

    const finish = (err?: Error) => {
        if (!alive) return;
        alive = false;
        clearTimeout(timer);
        try { channel?.close(); } catch { /* ignore */ }
        try { pc?.close(); } catch { /* ignore */ }
        if (err) rejectPeer?.(err);
    };

    const ensurePc = (): RTCPeerConnection => {
        if (pc) return pc;
        pc = createPeerConnection();
        pc.onconnectionstatechange = () => {
            if (!pc) return;
            if (pc.connectionState === 'failed') {
                handlers.onError?.(punchFailureReason());
                finish(new Error(punchFailureReason()));
            }
        };
        // 客方不主动建通道，等房主的通道从远端过来
        pc.ondatachannel = (ev) => {
            const dc = ev.channel;
            dc.onopen = () => {
                if (!alive || !pc) return;
                const peer = wrapDataChannel(dc, pc, 'guest', (reason) => {
                    handlers.onPeerLeft?.();
                    finish(new Error(reason));
                });
                handlers.onConnected?.();
                resolvePeer?.(peer);
                try { channel?.close(); } catch { /* ignore */ }
                channel = null;
                clearTimeout(timer);
            };
        };
        return pc;
    };

    const takeOffer = async (data: unknown) => {
        if (!alive) return;
        const d = data as { kind?: string; sdp?: string };
        if (d?.kind !== 'offer' || typeof d.sdp !== 'string') return;
        try {
            const conn = ensurePc();
            await conn.setRemoteDescription({ type: 'offer', sdp: d.sdp });
            const answer = await conn.createAnswer();
            await conn.setLocalDescription(answer);
            await waitIceGathering(conn);
            const local = conn.localDescription;
            if (!local) throw new Error('本地连接信息生成失败');
            channel?.send({ kind: 'answer', sdp: local.sdp, type: local.type });
        } catch (e) {
            handlers.onError?.((e as Error).message || '协商失败');
            finish(e instanceof Error ? e : new Error('协商失败'));
        }
    };

    const sigHandlers: SignalingHandlers = {
        onError: (reason) => {
            handlers.onError?.(reason);
            finish(new Error(reason));
        },
        onPeerLeft: () => {
            handlers.onPeerLeft?.();
            finish(new Error('房主关闭了房间'));
        },
        onReady: () => {
            // 只是通知，真正的动作在收到 offer 时触发
        },
        onSignal: (data) => {
            void takeOffer(data);
        },
    };

    channel = await connectSignaling({ url: opts.url, room: opts.room, role: 'guest', handlers: sigHandlers });

    return peerPromise;
}

// ══════════════════════════════════════════════════════════════════════════
// 手动交换模式（零服务器）
// ══════════════════════════════════════════════════════════════════════════
// WebRTC 从来不要求信令必须是「自动」的 —— 信令只是把两段连接信息互相递一下。
// 服务器存在的唯一理由，是省掉玩家复制粘贴这一步。
//
// 那就干脆让他们自己递：房主把一段文本发过去，对面把回执发回来，照样能打通。
// 代价是两次复制粘贴；收益是**不需要任何服务器、不装任何软件、手机也能用**。

/** 把邀请/回执编成单行文本（base64）。单行是为了让微信/QQ 转发不会断行。 */
function encodeSdp(desc: RTCSessionDescriptionInit): string {
    return btoa(JSON.stringify({ type: desc.type, sdp: desc.sdp }));
}

function decodeSdp(text: string): RTCSessionDescriptionInit | null {
    try {
        // 手机上粘贴很容易带空格或换行，先清干净
        const clean = (text || '').replace(/\s+/g, '');
        if (!clean) return null;
        const obj = JSON.parse(atob(clean)) as { type?: string; sdp?: string };
        if (typeof obj.sdp !== 'string') return null;
        if (obj.type !== 'offer' && obj.type !== 'answer') return null;
        return { type: obj.type, sdp: obj.sdp };
    } catch {
        return null;
    }
}

/** 手动模式的房主。 */
export interface ManualHostSession {
    /** 生成要发给对方的那段（等 ICE 收集完才返回，通常 1~3 秒）。 */
    createOffer(): Promise<string>;
    /** 把对方发回来的那段喂进来。 */
    acceptAnswer(text: string): Promise<void>;
    /** 连接建立后 resolve。 */
    readonly peer: Promise<Peer>;
    close(): void;
}

/** 手动模式的客方。 */
export interface ManualGuestSession {
    /** 粘贴房主发来的那段，返回要发回去的回执。 */
    acceptOffer(text: string): Promise<string>;
    readonly peer: Promise<Peer>;
    close(): void;
}

export function createManualHost(): ManualHostSession {
    if (!isIceAvailable()) throw new Error('当前环境不支持 WebRTC');

    let alive = true;
    let settled = false;
    let resolvePeer: ((p: Peer) => void) | null = null;
    let rejectPeer: ((e: Error) => void) | null = null;

    const peerPromise = new Promise<Peer>((res, rej) => {
        resolvePeer = res;
        rejectPeer = rej;
    });

    const pc = createPeerConnection();
    const dc = pc.createDataChannel('sbr-game', { ordered: true });

    pc.onconnectionstatechange = () => {
        if (!alive || settled) return;
        if (pc.connectionState === 'failed') {
            settled = true;
            rejectPeer?.(new Error(punchFailureReason()));
        }
    };

    dc.onopen = () => {
        if (!alive || settled) return;
        settled = true;
        const peer = wrapDataChannel(dc, pc, 'host', () => {
            alive = false;
        });
        resolvePeer?.(peer);
    };

    return {
        peer: peerPromise,
        async createOffer() {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            await waitIceGathering(pc);
            const local = pc.localDescription;
            if (!local) throw new Error('本地连接信息生成失败');
            return encodeSdp({ type: local.type, sdp: local.sdp });
        },
        async acceptAnswer(text: string) {
            const desc = decodeSdp(text);
            if (!desc) throw new Error('这段格式不对 —— 应该粘贴对方回给你的那一整段');
            if (desc.type !== 'answer') throw new Error('这是「邀请」不是「回执」：房主要粘贴的是对方回给你的那段');
            await pc.setRemoteDescription(desc);
        },
        close() {
            alive = false;
            settled = true;
            try { dc.close(); } catch { /* ignore */ }
            try { pc.close(); } catch { /* ignore */ }
        },
    };
}

export function createManualGuest(): ManualGuestSession {
    if (!isIceAvailable()) throw new Error('当前环境不支持 WebRTC');

    let alive = true;
    let settled = false;
    let resolvePeer: ((p: Peer) => void) | null = null;
    let rejectPeer: ((e: Error) => void) | null = null;

    const peerPromise = new Promise<Peer>((res, rej) => {
        resolvePeer = res;
        rejectPeer = rej;
    });

    const pc = createPeerConnection();

    pc.onconnectionstatechange = () => {
        if (!alive || settled) return;
        if (pc.connectionState === 'failed') {
            settled = true;
            rejectPeer?.(new Error(punchFailureReason()));
        }
    };

    // 客方不主动建通道，等房主的通道从远端过来
    pc.ondatachannel = (ev) => {
        const dc = ev.channel;
        dc.onopen = () => {
            if (!alive || settled) return;
            settled = true;
            const peer = wrapDataChannel(dc, pc, 'guest', () => {
                alive = false;
            });
            resolvePeer?.(peer);
        };
    };

    return {
        peer: peerPromise,
        async acceptOffer(text: string) {
            const desc = decodeSdp(text);
            if (!desc) throw new Error('这段格式不对 —— 应该粘贴房主发给你的那一整段');
            if (desc.type !== 'offer') throw new Error('这是「回执」不是「邀请」：加入的一方要粘贴房主发来的那段');
            await pc.setRemoteDescription(desc);
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            await waitIceGathering(pc);
            const local = pc.localDescription;
            if (!local) throw new Error('本地连接信息生成失败');
            return encodeSdp({ type: local.type, sdp: local.sdp });
        },
        close() {
            alive = false;
            settled = true;
            try { pc.close(); } catch { /* ignore */ }
        },
    };
}
