/**
 * transport-tcp.ts —— 超元链接 · TCP 直连传输层
 * ============================================================================
 * 这是「零服务器」路线的落地部分：房主在本机监听一个 TCP 端口，客方拿着连接码
 * 里解析出来的「地址 + 端口」直接连过来。**中间没有任何中继**。
 *
 * 为什么是 TCP 而不是 UDP：
 *   这一层只承载「房间指令」和「状态快照」，都是必须完整到达的小消息。
 *   掉一个包就可能导致两端状态分叉，而卡牌游戏的频率低到 TCP 的重传代价
 *   完全无所谓 —— 用 UDP 自己实现可靠传输是纯亏。
 *
 * 帧格式（长度前缀，不用 NDJSON）：
 *   ┌────────────┬──────────────────────┐
 *   │ 4 字节大端 │ N 字节 UTF-8 JSON    │
 *   │   = N      │                      │
 *   └────────────┴──────────────────────┘
 *   选长度前缀而不是「换行分隔」，是为了将来能直接塞**压缩后的二进制快照**
 *   （JSON 里出现二进制就得 base64，体积涨 33%，没必要）。
 *
 * 这一层**只管收发**，不认识房间、回合、卡牌。业务协议在它上面一层。
 * ============================================================================
 */

import { nodeRequire } from './nodeEnv';

/** 单帧上限 16MB。全量状态快照远小于此；超过就说明出问题了，直接断开。 */
const MAX_FRAME_BYTES = 16 * 1024 * 1024;

/**
 * 默认监听端口：**0 = 交给系统分配**。
 *
 * 为什么不学粉丝 MOD 用固定 27015 + 冲突重试：
 *   Windows 的 `SO_REUSEADDR` 语义和 Unix 不同 —— 两个 socket 可以绑同一个端口，
 *   `EADDRINUSE` **根本不触发**（实测：两个监听都返回成功，端口都是 27150）。
 *   也就是说「端口占用就换一个」这套逻辑在 Windows 上是静默失效的，
 *   而且两个 server 绑同一端口时谁收到连接是不确定的。
 *
 * 既然端口号会被写进连接码、玩家根本看不见，那就没必要固定它。
 * 让系统分配，**结构上不可能冲突**。
 */
const DEFAULT_PORT = 0;

/** 指定端口被占用时的重试次数（之后仍会退回系统分配，保证一定能起来）。 */
const PORT_RETRY = 5;

/** 一条可序列化的线上消息。传输层不解释内容。 */
export type PeerMessage = Record<string, unknown>;

/** 对端连接。主机侧与客方共用同一套接口。 */
export interface Peer {
    /** 主机侧为 `host`，客方为 `guest`。 */
    readonly role: 'host' | 'guest';
    /** 对端地址（主机侧是来客的 IP，客方是房主 IP）。拿不到时为 `unknown`。 */
    readonly remote: string;
    /** 发送一条消息。返回 false 表示连接已断或写入失败。 */
    send(msg: PeerMessage): boolean;
    /** 注册消息回调（可多次注册，全部会被调用）。 */
    onMessage(cb: (msg: PeerMessage) => void): void;
    /** 注册断开回调（只触发一次）。 */
    onClose(cb: (reason: string) => void): void;
    /** 主动断开。`reason` 会作为断开原因传给双方。 */
    close(reason?: string): void;
    /** 连接是否仍然活着。 */
    readonly alive: boolean;
}

/** 房主侧的监听器。 */
export interface HostServer {
    /** 实际监听端口（写进连接码的就是它）。 */
    readonly port: number;
    /** 监听在哪个地址族上（`::` 表示双栈，`0.0.0.0` 表示仅 IPv4）。 */
    readonly host: string;
    /** 注册「有人连进来」的回调。 */
    onConnection(cb: (peer: Peer) => void): void;
    /** 关闭监听并断开所有已建立的连接。 */
    close(): Promise<void>;
    /** 当前存活连接数。 */
    readonly connectionCount: number;
}

export interface HostOptions {
    /** 期望端口，默认 27150。占用时会自动往上找，最后兜底系统随机。 */
    port?: number;
}

export interface ConnectOptions {
    /** 连接超时毫秒数，默认 8000。跨虚拟局域网时偶尔需要更久。 */
    timeoutMs?: number;
}

// ══════════════════════════════════════════════════════════════════════════
// Node 内置模块的最小类型（项目 tsconfig 不含 node 类型，避免引入全局 Buffer 依赖）
// ══════════════════════════════════════════════════════════════════════════

interface RawSocket {
    on(event: 'data', cb: (chunk: Uint8Array) => void): void;
    on(event: 'close', cb: () => void): void;
    on(event: 'end', cb: () => void): void;
    on(event: 'error', cb: (err: { code?: string; message?: string }) => void): void;
    once(event: 'connect', cb: () => void): void;
    once(event: 'error', cb: (err: { code?: string; message?: string }) => void): void;
    write(data: Uint8Array): boolean;
    end(): void;
    destroy(): void;
    setNoDelay(noDelay: boolean): void;
    setKeepAlive(enable: boolean, initialDelay?: number): void;
    readonly remoteAddress?: string;
    readonly remotePort?: number;
}

interface RawServer {
    on(event: 'error', cb: (err: { code?: string; message?: string }) => void): void;
    listen(opts: { port: number; host?: string }, cb: () => void): void;
    close(cb?: () => void): void;
    address(): { port: number; address: string; family: string } | null;
}

interface NetModule {
    createServer(cb: (socket: RawSocket) => void): RawServer;
    connect(opts: { host: string; port: number }): RawSocket;
}

function getNet(): NetModule {
    const mod = nodeRequire('net') as NetModule | null;
    if (!mod) throw new Error('当前环境不支持联机（需要桌面版）');
    return mod;
}

// ══════════════════════════════════════════════════════════════════════════
// 帧编解码
// ══════════════════════════════════════════════════════════════════════════

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function encodeFrame(msg: PeerMessage): Uint8Array {
    const body = encoder.encode(JSON.stringify(msg));
    const out = new Uint8Array(4 + body.length);
    new DataView(out.buffer).setUint32(0, body.length, false);
    out.set(body, 4);
    return out;
}

/**
 * 增量拆帧器。
 * 每个连接持有一个实例：喂进原始字节，吐出完整消息。
 * @param onFrame 收到一条完整消息
 * @param onFatal 遇到不可恢复的错误（超大帧 / JSON 损坏），调用方应断开连接
 */
function createFrameReader(
    onFrame: (msg: PeerMessage) => void,
    onFatal: (reason: string) => void,
): (chunk: Uint8Array) => void {
    let buf = new Uint8Array(0);

    return (chunk: Uint8Array) => {
        // 追加到缓冲。小消息占绝大多数，直接重建比维护环形缓冲简单可靠。
        const merged = new Uint8Array(buf.length + chunk.length);
        merged.set(buf, 0);
        merged.set(chunk, buf.length);
        buf = merged;

        let offset = 0;
        while (buf.length - offset >= 4) {
            const view = new DataView(buf.buffer, buf.byteOffset + offset, buf.length - offset);
            const len = view.getUint32(0, false);

            if (len > MAX_FRAME_BYTES) {
                onFatal(`单条消息超过 ${MAX_FRAME_BYTES} 字节上限，连接已断开`);
                return;
            }
            if (buf.length - offset - 4 < len) break; // 还没收全

            const body = buf.subarray(offset + 4, offset + 4 + len);
            let parsed: unknown;
            try {
                parsed = JSON.parse(decoder.decode(body));
            } catch {
                onFatal('收到无法解析的消息，连接已断开');
                return;
            }
            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
                onFatal('收到格式不正确的消息，连接已断开');
                return;
            }
            offset += 4 + len;
            onFrame(parsed as PeerMessage);
        }

        // 丢掉已消费的部分。用 slice 而非 subarray —— subarray 会钉住整块底层内存。
        if (offset > 0) buf = offset >= buf.length ? new Uint8Array(0) : buf.slice(offset);
    };
}

// ══════════════════════════════════════════════════════════════════════════
// Peer 实现
// ══════════════════════════════════════════════════════════════════════════

function wrapPeer(socket: RawSocket, role: 'host' | 'guest'): Peer {
    let alive = true;
    let closeReason = '';
    const msgHandlers: Array<(msg: PeerMessage) => void> = [];
    const closeHandlers: Array<(reason: string) => void> = [];

    const remote = socket.remoteAddress
        ? `${socket.remoteAddress}${socket.remotePort ? ':' + socket.remotePort : ''}`
        : 'unknown';

    const fireClose = (reason: string) => {
        if (!alive) return;
        alive = false;
        closeReason = reason;
        for (const cb of closeHandlers) {
            try { cb(reason); } catch { /* 单个回调出错不能影响其他 */ }
        }
    };

    const reader = createFrameReader(
        (msg) => {
            for (const cb of msgHandlers) {
                try { cb(msg); } catch { /* 同上 */ }
            }
        },
        (reason) => {
            fireClose(reason);
            try { socket.destroy(); } catch { /* ignore */ }
        },
    );

    socket.on('data', (chunk) => {
        if (!alive) return;
        reader(chunk);
    });
    socket.on('close', () => fireClose(closeReason || '连接已关闭'));
    socket.on('end', () => fireClose('对方主动断开了连接'));
    socket.on('error', (err) => fireClose(err?.message || '网络错误'));

    // 关闭 Nagle：指令都是小包，等合并反而增加延迟
    try { socket.setNoDelay(true); } catch { /* 某些平台不支持 */ }
    // 半开连接检测：对方拔网线时，keep-alive 能让 'close' 最终触发
    try { socket.setKeepAlive(true, 15000); } catch { /* ignore */ }

    return {
        role,
        remote,
        get alive() { return alive; },
        send(msg: PeerMessage): boolean {
            if (!alive) return false;
            try {
                socket.write(encodeFrame(msg));
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
            try { socket.end(); } catch { /* ignore */ }
            // end() 是优雅关闭，对方不回 FIN 时会一直挂着，补一个兜底销毁
            setTimeout(() => {
                try { socket.destroy(); } catch { /* ignore */ }
                fireClose(closeReason);
            }, 800);
        },
    };
}

// ══════════════════════════════════════════════════════════════════════════
// 房主：监听
// ══════════════════════════════════════════════════════════════════════════

/**
 * 起一个监听，等人连进来。
 *
 * 端口策略：想用 27150，被占了就往上找 5 次，还不行就交给系统随机分配。
 * **无论如何都会成功**，因为实际端口会写进连接码 —— 端口号对玩家不可见。
 */
export function startHost(opts: HostOptions = {}): Promise<HostServer> {
    let net: NetModule;
    try {
        net = getNet();
    } catch (e) {
        return Promise.reject(e);
    }

    const onConnectionHandlers: Array<(peer: Peer) => void> = [];
    const livePeers = new Set<Peer>();
    let server: RawServer | null = null;
    let boundPort = 0;
    let boundHost = '';

    const desired = opts.port ?? DEFAULT_PORT;

    /** 依次尝试：期望端口 → 期望端口+N → 0（系统随机）。期望 0 时只试一次。 */
    const candidatePorts: number[] = [];
    if (desired === 0) {
        candidatePorts.push(0);
    } else {
        for (let i = 0; i <= PORT_RETRY; i++) candidatePorts.push(desired + i);
        candidatePorts.push(0);
    }

    /** 监听地址族：先要双栈（v4 也能进），系统不支持 IPv6 时退回纯 v4。 */
    const hostCandidates = ['::', '0.0.0.0'];

    return new Promise<HostServer>((resolve, reject) => {
        let hostIdx = 0;
        let portIdx = 0;
        let lastError: { code?: string; message?: string } | null = null;

        const attempt = () => {
            if (portIdx >= candidatePorts.length) {
                reject(new Error(`无法监听端口：${lastError?.message || '未知错误'}`));
                return;
            }
            const port = candidatePorts[portIdx];
            const host = hostCandidates[hostIdx];

            const candidate = net.createServer((socket) => {
                const peer = wrapPeer(socket, 'host');
                livePeers.add(peer);
                peer.onClose(() => livePeers.delete(peer));
                for (const cb of onConnectionHandlers) {
                    try { cb(peer); } catch { /* 单个回调出错不影响其他 */ }
                }
            });

            let settled = false;

            candidate.on('error', (err) => {
                if (settled) return;
                settled = true;
                lastError = err;

                // 双栈不被支持 → 换纯 IPv4 再试同一个端口
                if (hostIdx < hostCandidates.length - 1) {
                    hostIdx++;
                    attempt();
                    return;
                }
                // 端口被占用 → 换下一个端口，并重置地址族
                if (err?.code === 'EADDRINUSE') {
                    hostIdx = 0;
                    portIdx++;
                    attempt();
                    return;
                }
                // 其他错误（权限等）→ 换端口再试，最终会失败在 portIdx 用尽
                hostIdx = 0;
                portIdx++;
                attempt();
            });

            candidate.listen({ port, host }, () => {
                if (settled) {
                    // 已经因为别的原因换路了，这个迟到的成功直接关掉
                    try { candidate.close(); } catch { /* ignore */ }
                    return;
                }
                settled = true;
                server = candidate;
                const addr = candidate.address();
                boundPort = addr?.port ?? port;
                boundHost = host;

                resolve({
                    port: boundPort,
                    host: boundHost,
                    get connectionCount() { return livePeers.size; },
                    onConnection(cb) { onConnectionHandlers.push(cb); },
                    close(): Promise<void> {
                        for (const p of [...livePeers]) {
                            try { p.close('房主关闭了房间'); } catch { /* ignore */ }
                        }
                        livePeers.clear();
                        const s = server;
                        server = null;
                        if (!s) return Promise.resolve();
                        return new Promise<void>((done) => {
                            try { s.close(() => done()); } catch { done(); }
                        });
                    },
                });
            });
        };

        attempt();
    });
}

// ══════════════════════════════════════════════════════════════════════════
// 客方：连接
// ══════════════════════════════════════════════════════════════════════════

/**
 * 连到房主。
 * @param address 连接码里解析出的地址（IPv4 点分 / IPv6 文本均可）
 * @param port    连接码里解析出的端口
 */
export function connectTo(address: string, port: number, opts: ConnectOptions = {}): Promise<Peer> {
    let net: NetModule;
    try {
        net = getNet();
    } catch (e) {
        return Promise.reject(e);
    }

    const timeoutMs = opts.timeoutMs ?? 8000;

    return new Promise<Peer>((resolve, reject) => {
        let settled = false;
        let socket: RawSocket;

        try {
            socket = net.connect({ host: address, port });
        } catch (e) {
            reject(new Error(`无法发起连接：${(e as Error).message}`));
            return;
        }

        const timer = setTimeout(() => {
            if (settled) return;
            settled = true;
            try { socket.destroy(); } catch { /* ignore */ }
            reject(new Error(`连接超时（${Math.round(timeoutMs / 1000)} 秒）。请确认对方已经创建房间、并且双方在同一个虚拟局域网里`));
        }, timeoutMs);

        socket.on('error', (err) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            try { socket.destroy(); } catch { /* ignore */ }
            reject(new Error(describeConnectError(err?.code, address, port)));
        });

        // TCP 建连成功即可视为可通信：业务层的握手由上层协议负责
        socket.once('connect', () => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            resolve(wrapPeer(socket, 'guest'));
        });
    });
}

/** 把 Node 的 errno 翻译成玩家能看懂的话。 */
function describeConnectError(code: string | undefined, address: string, port: number): string {
    switch (code) {
        case 'ECONNREFUSED':
            return `对方 ${address}:${port} 拒绝了连接 —— 房主可能已经关掉房间，或者地址/端口不对`;
        case 'EHOSTUNREACH':
        case 'ENETUNREACH':
            return `网络不可达（${address}）—— 双方可能不在同一个虚拟局域网里`;
        case 'ETIMEDOUT':
            return '连接超时 —— 对方可能被防火墙拦住了，或者地址不对';
        case 'ENOTFOUND':
            return `找不到地址 ${address}`;
        case 'EADDRNOTAVAIL':
            return `本机没有 ${address} 这个地址`;
        default:
            return `连接失败${code ? `（${code}）` : ''}`;
    }
}
