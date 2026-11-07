/**
 * 超元链接 · 信令服务（Node.js 版 / 自建节点用）
 * ============================================================================
 * 与 `workers/signaling.js`（Cloudflare 版）逻辑一致，只是把 Durable Object
 * 换成了进程内的 Map —— 自己搭的机器上不需要持久化，房间最多几分钟就结束。
 *
 * 它只做一件事：两个玩家用同一个 6 位房间号连进来时，把双方「怎么找到对方」
 * 的几段文本互相递一次，然后就不管了。
 * **不转发游戏数据、不保存对局、不记录身份。**
 *
 * 运行：
 *   npm install ws
 *   node signaling-node.cjs
 *   （可选）set PORT=8787 改端口
 *
 * 玩家那边的地址形如：
 *   ws://[2409:8760:1e81:10::1812]:8787/ws
 * ============================================================================
 */

const { createServer } = require('node:http');
const { networkInterfaces } = require('node:os');

let WebSocketServer;
try {
    ({ WebSocketServer } = require('ws'));
} catch {
    console.error('\n缺少依赖 ws，请先在当前目录执行：npm install ws\n');
    process.exit(1);
}

const PORT = Number(process.env.PORT || 8787);
const ROOM_ID_RE = /^\d{6}$/;
const CLOSE_ROOM_TAKEN = 4009;

/** room → { host, guest, lastSeen } */
const rooms = new Map();

// ── HTTP 层：只提供健康检查，其余 404 ──
const server = createServer((req, res) => {
    let pathname = '/';
    try {
        pathname = new URL(req.url, 'http://localhost').pathname;
    } catch { /* 忽略畸形请求 */ }

    if (pathname === '/health') {
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('ok');
        return;
    }
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('not found');
});

const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws, req) => {
    let room = '';
    let role = '';
    try {
        const url = new URL(req.url, 'http://localhost');
        room = url.searchParams.get('room') || '';
        role = url.searchParams.get('role') || '';
    } catch {
        ws.close(4000, 'bad request');
        return;
    }

    if (!ROOM_ID_RE.test(room) || (role !== 'host' && role !== 'guest')) {
        ws.close(4000, 'bad room or role');
        return;
    }

    let r = rooms.get(room);
    if (!r) {
        r = { host: null, guest: null, lastSeen: Date.now() };
        rooms.set(room, r);
    }

    // 房主席位已被占着 ⇒ 让客户端换号，而不是把前一个人踢下线
    if (role === 'host' && r.host && r.host.readyState === 1) {
        send(ws, { t: 'error', reason: 'room-taken' });
        try { ws.close(CLOSE_ROOM_TAKEN, 'room taken'); } catch { /* ignore */ }
        return;
    }

    // 同席位重连（刷新页面 / 换网络）⇒ 替换旧的
    const stale = r[role];
    if (stale && stale !== ws && stale.readyState === 1) {
        try { stale.close(4001, 'replaced'); } catch { /* ignore */ }
    }
    r[role] = ws;
    r.lastSeen = Date.now();

    const peerRole = role === 'host' ? 'guest' : 'host';
    const peer = r[peerRole];
    if (peer && peer.readyState === 1) {
        send(peer, { t: 'ready' });
        send(ws, { t: 'ready' });
    }

    ws.on('message', (raw) => {
        let msg;
        try {
            msg = JSON.parse(raw.toString());
        } catch {
            return;
        }
        // 只认 signal，其它类型一律不透传
        if (!msg || msg.t !== 'signal') return;

        const target = r[role === 'host' ? 'guest' : 'host'];
        if (target && target.readyState === 1) {
            send(target, { t: 'signal', data: msg.data });
        }
    });

    const cleanup = () => {
        if (r[role] === ws) r[role] = null;
        const other = r[role === 'host' ? 'guest' : 'host'];
        if (other && other.readyState === 1) send(other, { t: 'peer-left' });
        if (!r.host && !r.guest) rooms.delete(room);
    };
    ws.on('close', cleanup);
    ws.on('error', cleanup);
});

function send(ws, obj) {
    try {
        ws.send(JSON.stringify(obj));
    } catch { /* 连接已断，静默 */ }
}

// 每 10 分钟清一次彻底没人、且很久没动静的房间（防止内存慢慢涨）
setInterval(() => {
    const now = Date.now();
    for (const [k, r] of rooms) {
        const hAlive = r.host && r.host.readyState === 1;
        const gAlive = r.guest && r.guest.readyState === 1;
        if (!hAlive && !gAlive && now - r.lastSeen > 10 * 60_000) rooms.delete(k);
    }
}, 60_000).unref?.();

// 监听所有网卡（Node 默认用 :: ，Windows 上是双栈，IPv4 也能连）
server.listen(PORT, () => {
    console.log('=========================================');
    console.log(` 超元链接 信令服务已启动  端口 ${PORT}`);
    console.log('=========================================');
    console.log(' 本机可达地址：');

    const names = networkInterfaces();
    const v6 = [];
    const v4 = [];
    for (const [name, list] of Object.entries(names)) {
        for (const a of list || []) {
            if (a.internal) continue;
            if (a.family === 'IPv6') {
                // 排除链路本地，只列可跨网访问的
                if (/^fe[89ab]/i.test(a.address)) continue;
                v6.push({ name, addr: a.address });
            } else {
                if (/^169\.254\./.test(a.address)) continue;
                v4.push({ name, addr: a.address });
            }
        }
    }

    for (const { name, addr } of v6) {
        console.log(`   [IPv6] ${name}`);
        console.log(`          ws://[${addr}]:${PORT}/ws`);
    }
    for (const { name, addr } of v4) {
        console.log(`   [IPv4] ${name}  ws://${addr}:${PORT}/ws`);
    }
    if (v6.length === 0 && v4.length === 0) {
        console.log('   （没有找到可用地址，检查网络）');
    }

    console.log('');
    console.log(' 健康检查：');
    console.log(`   curl http://127.0.0.1:${PORT}/health   应返回 ok`);
    console.log('');
    console.log(' 让外部连进来的那条地址，就是游戏里要填的信令地址。');
    console.log(' 按 Ctrl+C 停止。');
});
