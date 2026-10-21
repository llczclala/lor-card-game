/**
 * lan.ts —— 存档互传 · 局域网传输层（PC 当服务端 / 手机当客户端）
 * ============================================================================
 * 架构决定（见 `_scratch/research/决策表-存档互通-v1.md` §1）：
 *   · **PC(Electron) 固定当服务端**：渲染进程有完整 Node（`electron-main.cjs:16-18` 的
 *     `nodeIntegration:true`），`require('http')` 就能起服务 —— 零新增依赖、零原生代码。
 *   · **手机永远当客户端**：安卓 WebView 里 JS 起不了监听 socket，Capacitor 也没有官方
 *     HTTP server 插件 ⇒ 手机当服务端得写原生插件，代价高得多。
 *   · 手机主动发起 ⇒ **PC → 手机 方向靠"手机拿到响应"实现**，一次往返同时完成双向交换。
 *
 * 协议（一往返搞定双向，正好对上程的"两边都持有双边账号、首次不覆盖"）：
 *
 *   手机                                         PC（服务端）
 *    │  POST /sync {token, pack(手机全部账号)} ──▶ │
 *    │                                            │ ① 校验 token
 *    │                                            │ ② 装入"本机没有的"账号（已有的**跳过** = 首次不覆盖）
 *    │                                            │ ③ 回自己的 pack（**已含刚装进来的手机账号**）
 *    │ ◀───────────────── 200 {ok, pack} ──────── │
 *    │ ④ 装入 PC 的账号（同样跳过已有的）           │
 *    ⇒ 结果：两边都持有 PC + 手机双边的账号，谁也没覆盖谁 ✅
 *
 * 安全：
 *   · 只监听局域网；**6 位随机配对码**必须对上
 *   · 配对码**一次性**：成功同步一次 / 或超时（默认 5 分钟）⇒ 自动关服务、令牌作废
 *   · 只接受 `POST /sync` 且 body 必须是合法存档包（复用 `parseSavePack` 的防御式校验）
 *   · ⚠️ **不做**明文以外的加密：局域网内的存档仍是明文 HTTP。
 *     现状是"局域网短时开放 + 一次性码"，够用；要上 HTTPS 得先解决自签证书信任，留待 v2。
 */

import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { isNative } from '../../platform';
import {
    buildSavePack, parseSavePack, readAllAccountSaves, installSavePack,
    SavePackError,
    type SaveOrigin, type InstallResult,
} from '../saveTransfer';

/** 协议版本（两端不一致就没法互通，放在第一个检查） */
export const LAN_PROTO_VERSION = 1;

/** 配对码有效期（毫秒）。过期自动关服务 —— 不留一个长期开着的端口。 */
const TOKEN_TTL_MS = 5 * 60 * 1000;

// ══════════════════════════════════════════════════════════════════════════
// 环境探测
// ══════════════════════════════════════════════════════════════════════════

/**
 * 从 Electron 渲染进程里拿 Node 内置模块。
 * ⚠️ 渲染进程开了 `nodeIntegration`（sandbox 自动关闭）⇒ 全局有 `require`。
 *    用 `window.require` 而不是 `require` —— Vite 打的是 ESM 包，裸 `require` 会被当未定义标识符。
 * @returns 拿不到时返回 `null`（浏览器 / 安卓壳 / 环境不满足）
 */
function nodeRequire(mod: string): any | null {
    try {
        const req = (globalThis as unknown as { require?: (m: string) => unknown }).require;
        if (typeof req !== 'function') return null;
        return req(mod);
    } catch {
        return null;
    }
}

/** 本机能不能当服务端（= 有没有 Node 的 `http`） */
export function isLanServerSupported(): boolean {
    return nodeRequire('http') !== null;
}

/** 私有 IPv4 网段判断（局域网互传只可能发生在这些网段里） */
function isPrivateV4(ip: string): boolean {
    const parts = ip.split('.').map(Number);
    if (parts.length !== 4 || parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)) return false;
    const [a, b] = parts;
    return a === 10 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31);
}

/**
 * 虚拟网卡 / VPN / 隧道 的接口名特征。
 * 这些网卡上的地址手机**永远到不了** —— 排除掉，别写进二维码。
 */
const VIRTUAL_IFACE =
    /(virtual|vmware|vbox|virtualbox|hyper-?v|vethernet|wsl|docker|br-|tap|tun|tailscale|zerotier|radmin|hamachi|vpn|wireguard|loopback|bluetooth|npcap|teredo|6to4|isatap)/i;

export interface LanAddress {
    address: string;
    /** 网卡名（界面上给玩家看，方便分辨"哪个是 WiFi"） */
    iface: string;
    /** 是否私有网段 */
    private: boolean;
}

/**
 * 列出本机所有可用的局域网 IPv4，**按"手机能不能连上"排序**。
 *
 * 🔴 2026-10-21 实测 BUG（"扫到了还是连不上"）：旧实现 `getLanIp()` 直接返回
 *    `os.networkInterfaces()` 里**第一个非回环 IPv4**，不限网段、不排虚拟网卡。
 *    结果 PC 上装了 VPN / Hyper-V / 直连公网口时，二维码里被写成 `26.232.62.96`
 *    （公网地址），手机在 192.168.1.x 里当然连不通 —— 报错正是
 *    `failed to connect to /26.232.62.96 (port 56295) from /192.168.1.2`。
 *
 * 现在的规则：**私有网段 & 非虚拟网卡**排最前；其余按"越像不能连的"往后放。
 * 界面会把整个候选列表列出来，扫码失败时可以直接换一个。
 */
export function getLanIpCandidates(): LanAddress[] {
    const os = nodeRequire('os');
    if (!os) return [];
    const out: LanAddress[] = [];
    try {
        const ifs = os.networkInterfaces() as Record<
            string,
            Array<{ family: string | number; internal: boolean; address: string }>
        >;
        for (const name of Object.keys(ifs)) {
            for (const ni of ifs[name] ?? []) {
                if (ni.internal) continue;
                // Node 18+ 返回 'IPv4'，老版本返回 4，两种都认
                if (ni.family !== 'IPv4' && ni.family !== 4) continue;
                out.push({ address: ni.address, iface: name, private: isPrivateV4(ni.address) });
            }
        }
    } catch { /* 忽略 */ }
    const rank = (c: LanAddress) => (c.private ? 0 : 2) + (VIRTUAL_IFACE.test(c.iface) ? 1 : 0);
    return out.sort((a, b) => rank(a) - rank(b));
}

/** 本机最可能的局域网 IPv4（= 候选列表第一个），拿不到返回 null */
export function getLanIp(): string | null {
    return getLanIpCandidates()[0]?.address ?? null;
}

/** 本机平台标记（导出信封 / 界面显示用） */
export function localOrigin(): SaveOrigin {
    return isNative() ? 'mobile' : 'pc';
}

// ══════════════════════════════════════════════════════════════════════════
// 服务端（PC）
// ══════════════════════════════════════════════════════════════════════════

export interface LanSession {
    /** 局域网 IPv4（= 候选列表第一个） */
    ip: string;
    port: number;
    /** 6 位配对码 */
    token: string;
    /** 手机要填的完整地址（PC 界面上显示给玩家看） */
    url: string;
    /** 所有候选地址（扫不到/连不上时让玩家换一个试） */
    candidates: LanAddress[];
}

/** 服务端收到一次同步后的结果（供界面显示） */
export interface ServerSyncReport {
    receivedAccounts: number;
    added: InstallResult[];
    skipped: number;
}

type ServerLog = (line: string) => void;

let runningServer: { close: () => void; timer: ReturnType<typeof setTimeout> } | null = null;

/** 6 位数字配对码 */
function makeToken(): string {
    return String(Math.floor(100000 + Math.random() * 900000));
}

/**
 * 起一个局域网服务端，等手机来同步。
 *
 * @param onLog     日志回调（界面实时显示进度）
 * @param onSynced  成功同步一次后的回调（**服务会自动关闭**）
 * @throws 环境不支持 / 没有局域网 IP / 端口占用
 */
export async function startLanServer(
    onLog: ServerLog,
    onSynced: (report: ServerSyncReport) => void,
): Promise<LanSession> {
    if (runningServer) stopLanServer();

    const http = nodeRequire('http');
    if (!http) throw new Error('当前环境不支持（需要 Electron 桌面端）');
    const candidates = getLanIpCandidates();
    const ip = candidates[0]?.address;
    if (!ip) throw new Error('没有检测到局域网 IP —— 请确认已连上 WiFi / 网线');
    if (!candidates[0].private) {
        onLog('⚠️ 没找到私有网段地址（192.168 / 10.x / 172.16-31）—— 手机大概率连不上，请确认电脑连的是同一个 WiFi');
    }

    const token = makeToken();
    onLog(`准备就绪，等待手机连接（配对码 ${token}）`);

    const server = http.createServer((req: any, res: any) => {
        const send = (code: number, body: unknown) => {
            const text = JSON.stringify(body);
            // 不给 Content-Length ⇒ Node 自动 chunked。省掉 Buffer.byteLength（本文件刻意不碰 Buffer）
            res.writeHead(code, {
                'Content-Type': 'application/json; charset=utf-8',
                'Access-Control-Allow-Origin': '*',
            });
            res.end(text);
        };

        if (req.method === 'OPTIONS') { send(204, {}); return; }

        if (req.method !== 'POST' || !String(req.url).startsWith('/sync')) {
            send(404, { ok: false, error: 'not found' });
            return;
        }

        // ⚠️ 刻意不用 `Buffer` —— 本项目 tsconfig 没有 Node 全局类型（强加 @types/node 会污染全局）。
        //    这里只处理 JSON **文本** ⇒ 直接按 utf8 字符串累加，反而少一次 Buffer 拼装。
        req.setEncoding('utf8');
        let raw = '';
        let tooBig = false;
        req.on('data', (c: string) => {
            raw += c;
            if (raw.length > 32 * 1024 * 1024) { // 32 MB 天花（正常存档包只有几十 KB）
                tooBig = true;
                req.destroy();
            }
        });
        req.on('end', () => {
            if (tooBig) { send(413, { ok: false, error: '请求体过大' }); return; }
            try {
                const body = JSON.parse(raw) as {
                    proto?: number; token?: string; pack?: unknown;
                };
                if (body.proto !== LAN_PROTO_VERSION) {
                    send(400, { ok: false, error: `协议版本不一致（对方 ${String(body.proto)}，本机 ${LAN_PROTO_VERSION}）` });
                    return;
                }
                if (body.token !== token) {
                    onLog('⚠️ 配对码不对，已拒绝一次连接');
                    send(403, { ok: false, error: '配对码不对' });
                    return;
                }

                const remotePack = parseSavePack(body.pack);
                onLog(`收到「${remotePack.origin === 'pc' ? 'PC' : '手机'}」的 ${remotePack.accounts.length} 个账号，正在装入…`);

                // 🔴 首次不覆盖：本机已有的账号**一律跳过**（不传 force）
                const { installed, skipped } = installSavePack(remotePack, false);
                onLog(`装入 ${installed.length} 个（新增 ${installed.filter(i => i.action === 'added').length}）· 跳过 ${skipped.length} 个`);

                // 回自己的包 —— 此时**已经包含刚装进来的手机账号**，所以手机那边也能拿到两手账号
                const localPack = buildSavePack(readAllAccountSaves(), localOrigin(), {
                    platform: localOrigin(),
                });

                send(200, {
                    ok: true,
                    proto: LAN_PROTO_VERSION,
                    pack: localPack,
                });

                // 一次性：同步成功立刻收摊
                const report: ServerSyncReport = {
                    receivedAccounts: remotePack.accounts.length,
                    added: installed,
                    skipped: skipped.length,
                };
                stopLanServer();
                onSynced(report);
            } catch (e) {
                const msg = e instanceof SavePackError ? e.message : (e instanceof Error ? e.message : String(e));
                onLog(`❌ 处理失败：${msg}`);
                send(400, { ok: false, error: msg });
            }
        });
    }) as { listen: (...a: any[]) => void; close: () => void; on: (ev: string, cb: (e: any) => void) => void; address: () => { port: number } };

    await new Promise<void>((resolve, reject) => {
        server.on('error', (err: { code?: string }) => {
            reject(new Error(err?.code === 'EADDRINUSE' ? '端口被占用，请重试' : String(err)));
        });
        // 端口给 0 = 让系统挑一个空闲端口
        server.listen({ host: '0.0.0.0', port: 0 }, () => resolve());
    });

    const port = server.address().port;
    const timer = setTimeout(() => {
        onLog('⏱ 等待超时（5 分钟），已自动关闭');
        stopLanServer();
    }, TOKEN_TTL_MS);

    runningServer = { close: () => server.close(), timer };
    return { ip, port, token, url: `http://${ip}:${port}`, candidates };
}

/** 关掉服务端（幂等） */
export function stopLanServer(): void {
    if (!runningServer) return;
    clearTimeout(runningServer.timer);
    try { runningServer.close(); } catch { /* 忽略 */ }
    runningServer = null;
}

// ══════════════════════════════════════════════════════════════════════════
// 客户端（手机，PC 也能用来反向连）
// ══════════════════════════════════════════════════════════════════════════

export interface ClientSyncReport {
    /** 对方一共给了几个账号 */
    receivedAccounts: number;
    added: InstallResult[];
    skipped: number;
}

/** POST JSON —— 原生壳走 CapacitorHttp（绕过混合内容限制），其余走 fetch */
async function postJson(url: string, body: unknown): Promise<any> {
    if (Capacitor.isNativePlatform()) {
        const r = await CapacitorHttp.post({
            url,
            headers: { 'Content-Type': 'application/json' },
            data: body,
            connectTimeout: 8000,
            readTimeout: 20000,
        });
        const data = r.data;
        return typeof data === 'string' ? JSON.parse(data) : data;
    }
    const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    return r.json();
}

/**
 * 主动连上对方并完成一次双向同步。
 *
 * @param baseUrl 对方地址，形如 `http://192.168.1.23:8710`
 * @param token   6 位配对码
 */
export async function syncWithPeer(baseUrl: string, token: string): Promise<ClientSyncReport | never> {
    const base = baseUrl.trim().replace(/\/+$/, '');
    if (!/^https?:\/\//i.test(base)) throw new Error('地址要以 http:// 开头（例：http://192.168.1.23:8710）');
    if (!/^\d{6}$/.test(token.trim())) throw new Error('配对码应该是 6 位数字');

    const myPack = buildSavePack(readAllAccountSaves(), localOrigin(), { platform: localOrigin() });
    if (myPack.accounts.length === 0) throw new Error('本机没有可发送的账号');

    let resp: any;
    try {
        resp = await postJson(`${base}/sync`, { proto: LAN_PROTO_VERSION, token: token.trim(), pack: myPack });
    } catch (e) {
        throw new Error(`连不上对方（${e instanceof Error ? e.message : String(e)}）—— 检查是否同一 WiFi、地址/配对码是否正确`);
    }

    if (!resp || resp.ok !== true) throw new Error(resp?.error ? `对方拒绝：${resp.error}` : '对方返回了无法识别的内容');
    if (resp.proto !== LAN_PROTO_VERSION) throw new Error(`协议版本不一致（对方 ${String(resp.proto)}）`);

    const remotePack = parseSavePack(resp.pack);
    // 同样：本机已有的账号一律跳过
    const { installed, skipped } = installSavePack(remotePack, false);
    return { receivedAccounts: remotePack.accounts.length, added: installed, skipped: skipped.length };
}
