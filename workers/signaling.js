/**
 * 超元链接 · 信令端（Cloudflare Worker + Durable Object）
 * ============================================================================
 * 职责只有一个：**帮两个玩家交换一次「怎么连到对方」的信息**，之后就退出。
 *
 * 它不转发游戏数据、不保存对局、不知道你是谁。
 * 一局大牌下来，这里总共也就几十条消息，流量以 KB 计。
 *
 * 为什么用 Durable Object 而不是普通 Worker：
 *   普通 Worker 是无状态的，每次请求可能落在不同的 isolate 上，
 *   两个玩家的 WebSocket 根本碰不到一起。Durable Object 按「房间号」分实例，
 *   同一个房间号一定落到同一个实例 ⇒ 两个连接天然共享状态。
 *
 * 路由：
 *   GET /ws?room=482913&role=host|guest   ← WebSocket 升级
 *   GET /health                            ← 健康检查
 * ============================================================================
 */

const ROOM_ID_RE = /^\d{6}$/;

/** 关闭码：房间号已被占用，客户端应换一个重试。 */
const CLOSE_ROOM_TAKEN = 4009;

export default {
    async fetch(request, env) {
        const url = new URL(request.url);

        if (url.pathname === '/health') {
            return new Response('ok', { status: 200 });
        }

        if (url.pathname !== '/ws') {
            return new Response('not found', { status: 404 });
        }

        const room = url.searchParams.get('room') || '';
        const role = url.searchParams.get('role') || '';

        if (!ROOM_ID_RE.test(room)) {
            return new Response('房间号必须是 6 位数字', { status: 400 });
        }
        if (role !== 'host' && role !== 'guest') {
            return new Response('role 必须是 host 或 guest', { status: 400 });
        }

        const id = env.ROOMS.idFromName(room);
        return env.ROOMS.get(id).fetch(request);
    },
};

/**
 * 一个 Durable Object 实例 = 一个房间号。
 * 最多两个连接：host 与 guest，互相只做「转发」。
 */
export class Room {
    constructor(ctx, env) {
        this.ctx = ctx;
        this.env = env;
        /** @type {{ host: WebSocket | null, guest: WebSocket | null }} */
        this.slots = { host: null, guest: null };
    }

    async fetch(request) {
        if (request.headers.get('Upgrade') !== 'websocket') {
            return new Response('需要 WebSocket 升级', { status: 426 });
        }

        const url = new URL(request.url);
        const role = url.searchParams.get('role');

        const pair = new WebSocketPair();
        const client = pair[0];
        const server = pair[1];
        server.accept();

        // 房主席位已经被占着 ⇒ 让客户端换一个房间号，而不是把前一个踢下线。
        // 两个人互相踢会把房间变成谁都用不了。
        if (role === 'host' && this.slots.host && this.slots.host.readyState === 1) {
            send(server, { t: 'error', reason: 'room-taken' });
            safeClose(server, CLOSE_ROOM_TAKEN, '房间号已被占用');
            return new Response(null, { status: 101, webSocket: client });
        }

        // 同席位重连（刷新页面 / 网络切换）⇒ 替换旧的，避免幽灵连接占位
        const stale = this.slots[role];
        if (stale && stale !== server && stale.readyState === 1) {
            safeClose(stale, 4001, '同一席位重新连接');
        }
        this.slots[role] = server;

        // 对方已经在等 ⇒ 双方都收到 ready，开始交换连接信息
        const peerRole = role === 'host' ? 'guest' : 'host';
        const peer = this.slots[peerRole];
        if (peer && peer.readyState === 1) {
            send(peer, { t: 'ready' });
            send(server, { t: 'ready' });
        }

        server.addEventListener('message', (ev) => {
            let msg;
            try {
                msg = JSON.parse(ev.data);
            } catch {
                return;
            }
            // 只认 signal —— 其它类型一律不透传，避免被当成万能聊天通道
            if (!msg || msg.t !== 'signal') return;

            const target = this.slots[role === 'host' ? 'guest' : 'host'];
            if (target && target.readyState === 1) {
                send(target, { t: 'signal', data: msg.data });
            }
        });

        const cleanup = () => {
            if (this.slots[role] === server) this.slots[role] = null;
            const other = this.slots[role === 'host' ? 'guest' : 'host'];
            if (other && other.readyState === 1) {
                send(other, { t: 'peer-left' });
            }
        };
        server.addEventListener('close', cleanup);
        server.addEventListener('error', cleanup);

        return new Response(null, { status: 101, webSocket: client });
    }
}

/** 发一条 JSON；连接已断时静默失败（信令丢了对方的 WebRTC 自己会超时）。 */
function send(ws, obj) {
    try {
        ws.send(JSON.stringify(obj));
    } catch {
        /* ignore */
    }
}

function safeClose(ws, code, reason) {
    try {
        ws.close(code, reason);
    } catch {
        /* ignore */
    }
}
