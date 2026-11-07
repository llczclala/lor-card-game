/**
 * signaling.ts —— 超元链接 · 信令客户端
 * ============================================================================
 * 只做一件事：跟信令 Worker 保持一条 WebSocket，帮两边把「怎么连到对方」
 * 的几段文本互相递一下。连上之后双方直接对传，这条 WebSocket 就没用了。
 *
 * 它**不碰游戏数据**：`room.ts` 的房间状态、快照、意图全都走后续打洞出来的
 * 数据通道，跟这里无关。
 *
 * ⚠️ 房间号是玩家看见的唯一东西，所以生成与校验都在这一层：
 *    · 6 位纯数字，方便口头念、方便手输
 *    · 服务端也做同样的正则校验，不信任客户端
 * ============================================================================
 */

/** 本机存的信令地址键名。玩家只需在任意一台机器上填一次。 */
export const SIGNALING_URL_KEY = 'sbr.signalingUrl';

/**
 * 默认信令地址。部署完 Worker 后把这里换成自己的，或者留空让玩家在界面里填。
 * 形如 `wss://sbr-signaling.xxxx.workers.dev/ws`
 */
export const DEFAULT_SIGNALING_URL = '';

export type SignalRole = 'host' | 'guest';

export interface SignalingHandlers {
    /** 对方也连上了同一个房间号 —— 可以开始交换连接信息了。 */
    onReady?: () => void;
    /** 收到对方发来的连接信息（SDP 之类的黑盒数据）。 */
    onSignal?: (data: unknown) => void;
    /** 对方离开了房间（关页面 / 断网）。 */
    onPeerLeft?: () => void;
    /** 连接被服务端拒绝或中途断开。 */
    onError?: (reason: string) => void;
}

export interface SignalingChannel {
    /** 把一段黑盒数据递给对方。 */
    send(data: unknown): void;
    close(): void;
    readonly open: boolean;
}

/** 房间号已被别人占着 —— UI 应当换一个号重试。 */
export class RoomTakenError extends Error {
    constructor() {
        super('这个房间号已经被占用了，换一个再试');
        this.name = 'RoomTakenError';
    }
}

// ══════════════════════════════════════════════════════════════════════════
// 地址与房间号
// ══════════════════════════════════════════════════════════════════════════

/**
 * 把玩家随手填的地址收拾成可用的 WebSocket 地址。
 *
 * 容忍这些写法：
 *   `sbr-signaling.xxx.workers.dev`        → 补成 wss://…/ws
 *   `https://xxx.workers.dev`              → wss://xxx.workers.dev/ws
 *   `wss://xxx.workers.dev/ws`             → 原样
 *   `ws://[2409:xxxx::1]:8787`             → 保持 ws://（IPv6 直连没有证书，不能用 wss）
 */
export function normalizeSignalingUrl(input: string): string {
    let s = (input || '').trim();
    if (!s) return '';

    const m = s.match(/^(wss?|https?):\/\//i);
    if (m) {
        // 已经写了协议：只把 http(s) 换成 ws(s)，其余原样保留
        // ⚠️ 不能一律强改成 wss —— 自己搭的 IPv6 服务通常没有证书
        const scheme = m[1].toLowerCase();
        const wsScheme = scheme === 'https' ? 'wss' : scheme === 'http' ? 'ws' : scheme;
        let rest = s.slice(m[0].length).replace(/\/+$/, '');
        if (!/\/ws$/i.test(rest) && !rest.includes('?')) rest = `${rest}/ws`;
        return `${wsScheme}://${rest}`;
    }

    // 没写协议：默认公网域名场景，走 wss
    s = s.replace(/\/+$/, '');
    if (!/\/ws$/i.test(s) && !s.includes('?')) s = `${s}/ws`;

    return `wss://${s}`;
}

/** 读本机保存的信令地址（没有就用内置默认值）。 */
export function loadSignalingUrl(): string {
    const saved = readLocal(SIGNALING_URL_KEY);
    return saved || DEFAULT_SIGNALING_URL;
}

export function saveSignalingUrl(url: string): void {
    try {
        localStorage.setItem(SIGNALING_URL_KEY, url.trim());
    } catch {
        /* 隐私模式或存储受限时静默失败，下次再填一遍即可 */
    }
}

function readLocal(key: string): string {
    try {
        return localStorage.getItem(key) || '';
    } catch {
        return '';
    }
}

/** 生成一个 6 位房间号（首位非 0，避免被当成短号或被自动去掉前导零）。 */
export function makeRoomCode(): string {
    const n = Math.floor(Math.random() * 900000) + 100000;
    return String(n);
}

/** 玩家输入的房间号是否合法。 */
export function isRoomCode(text: string): boolean {
    return /^\d{6}$/.test((text || '').trim());
}

// ══════════════════════════════════════════════════════════════════════════
// 连接
// ══════════════════════════════════════════════════════════════════════════

export interface ConnectSignalingOptions {
    /** 已规范化的 wss 地址 */
    url: string;
    room: string;
    role: SignalRole;
    handlers: SignalingHandlers;
    /** 建连超时（毫秒），默认 15 秒 */
    timeoutMs?: number;
}

/**
 * 连上信令。成功只代表「和信令服务器通了」，不代表对方在。
 * 对方到达时会通过 `handlers.onReady` 通知。
 */
export function connectSignaling(opts: ConnectSignalingOptions): Promise<SignalingChannel> {
    const { url, room, role, handlers } = opts;
    const timeoutMs = opts.timeoutMs ?? 15000;

    if (!url) {
        return Promise.reject(new Error('还没有填写信令地址，请先在房间界面里填一下'));
    }
    if (!isRoomCode(room)) {
        return Promise.reject(new Error('房间号必须是 6 位数字'));
    }

    return new Promise<SignalingChannel>((resolve, reject) => {
        let settled = false;
        let ws: WebSocket | null = null;

        const timer = setTimeout(() => {
            if (settled) return;
            settled = true;
            try { ws?.close(); } catch { /* ignore */ }
            reject(new Error(`连不上信令服务器（${Math.round(timeoutMs / 1000)} 秒超时）。请检查信令地址和网络。`));
        }, timeoutMs);

        const joinUrl = `${url}?room=${encodeURIComponent(room)}&role=${encodeURIComponent(role)}`;

        try {
            ws = new WebSocket(joinUrl);
        } catch (e) {
            settled = true;
            clearTimeout(timer);
            reject(new Error(`信令地址格式不对：${(e as Error).message}`));
            return;
        }

        const channel: SignalingChannel = {
            send(data: unknown) {
                try {
                    // readyState 1 = OPEN
                    if (ws && ws.readyState === 1) {
                        ws.send(JSON.stringify({ t: 'signal', data }));
                    }
                } catch {
                    /* 信令丢了对方会自己超时，这里不必惊动 UI */
                }
            },
            close() {
                try { ws?.close(); } catch { /* ignore */ }
            },
            get open() {
                return !!ws && ws.readyState === 1;
            },
        };

        ws.onopen = () => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            resolve(channel);
        };

        ws.onmessage = (ev) => {
            let msg: { t?: string; data?: unknown; reason?: string } | null = null;
            try {
                msg = JSON.parse(String(ev.data));
            } catch {
                return;
            }
            if (!msg || typeof msg.t !== 'string') return;

            switch (msg.t) {
                case 'ready':
                    handlers.onReady?.();
                    return;
                case 'signal':
                    handlers.onSignal?.(msg.data);
                    return;
                case 'peer-left':
                    handlers.onPeerLeft?.();
                    return;
                case 'error':
                    if (msg.reason === 'room-taken') {
                        handlers.onError?.('这个房间号已经被占用了，换一个再试');
                    } else if (msg.reason) {
                        handlers.onError?.(String(msg.reason));
                    }
                    return;
                default:
                    return;
            }
        };

        ws.onerror = () => {
            // 具体原因浏览器不给，只能给一句能落地的话
            if (!settled) {
                settled = true;
                clearTimeout(timer);
                reject(new Error('信令连接失败。请确认信令地址正确、Worker 已部署。'));
            } else {
                handlers.onError?.('信令连接中断');
            }
        };

        ws.onclose = (ev) => {
            if (!settled) {
                settled = true;
                clearTimeout(timer);
                // 4009 = 房间号被占用，单独区分，UI 才能提示换号
                if (ev.code === 4009) reject(new RoomTakenError());
                else reject(new Error(`信令连接被关闭（${ev.code}${ev.reason ? '：' + ev.reason : ''}）`));
                return;
            }
            // 已经建立过的连接被关掉
            if (ev.code === 4009) {
                handlers.onError?.('这个房间号已经被占用了，换一个再试');
            } else if (ev.code !== 1000) {
                handlers.onError?.('信令连接中断');
            }
        };
    });
}
