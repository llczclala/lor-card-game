#!/usr/bin/env node
/**
 * 超元链接 · 跨网通路检测工具
 * ============================================================================
 * 用途：在**两台真实机器**上验证「你们俩的网络到底通不通」。
 *   这是整个联机模式风险最高、也最无法在本机验证的一环 —— 回环测试
 *   永远遇不到 NAT、防火墙和虚拟局域网的转发规则。
 *
 * 用法：
 *   房主：node "超元链接-通路检测.cjs" host
 *   客方：node "超元链接-通路检测.cjs" join <地址>:<端口>
 *
 *   例：node "超元链接-通路检测.cjs" join 100.105.143.66:51234
 *
 * ⚠️ 本文件是**自包含的诊断工具**，刻意不 import src/net 下的正式模块 ——
 *    因为要能在没有构建环境的机器上直接跑（`node xxx.cjs` 即可）。
 *    网卡识别规则与 `src/net/addresses.ts` 保持一致；若那边改了规则，
 *    这里需要同步，否则诊断结论会和游戏里的实际选择不一致。
 * ============================================================================
 */

const net = require('net');
const os = require('os');

/** 握手标记。两端不一致说明工具版本不同。 */
const MAGIC = 'SBR2-CHECK1';

/** 延迟测试轮数 */
const PING_ROUNDS = 5;

// ══════════════════════════════════════════════════════════════════════════
// 网卡识别（与 src/net/addresses.ts 同一套规则）
// ══════════════════════════════════════════════════════════════════════════

const VPN_VENDORS = [
    { vendor: 'zerotier', label: 'ZeroTier', re: /zero\s*tier|\bzt[a-z0-9]{6,}/i },
    { vendor: 'oray', label: '蒲公英', re: /oray|pgyvpn|\bpgy\b|oraybox|pgybox/i },
    { vendor: 'tailscale', label: 'Tailscale', re: /tail\s*scale|tailscale/i },
    { vendor: 'hamachi', label: 'Hamachi', re: /hamachi|logmein/i },
    { vendor: 'radmin', label: 'Radmin VPN', re: /radmin/i },
    { vendor: 'easytier', label: 'EasyTier', re: /easy\s*tier/i },
    { vendor: 'wireguard', label: 'WireGuard', re: /wireguard|^wg\d+$/i },
    { vendor: 'n2n', label: 'n2n', re: /\bn2n\b|edge\s*node/i },
    { vendor: 'netmaker', label: 'Netmaker', re: /netmaker/i },
    { vendor: 'frp', label: 'frp', re: /\bfrp\b/i },
];

const VIRTUAL_ONLY = [
    { vendor: 'hyperv', re: /vethernet|hyper-?v|default switch/i },
    { vendor: 'vmware', re: /vmware|vmnet/i },
    { vendor: 'virtualbox', re: /virtualbox|vboxnet/i },
    { vendor: 'wsl', re: /\bwsl\b/i },
    { vendor: 'docker', re: /docker|br-[0-9a-f]{6,}|veth/i },
    { vendor: 'tap', re: /tap-?windows|tun\s*tap/i },
    { vendor: 'bluetooth', re: /bluetooth|蓝牙/i },
    { vendor: 'teredo', re: /teredo|isatap/i },
];

function classifyV6(addr) {
    if (addr === '::1') return 'link';
    if (/^fe[89ab][0-9a-f]?:/.test(addr)) return 'link';
    if (/^f[cd][0-9a-f]{2}:/.test(addr)) return 'ula';
    if (/^[23][0-9a-f]{3}:/.test(addr)) return 'public6';
    return 'link';
}

function classifyV4(addr) {
    if (/^10\./.test(addr)) return 'lan';
    if (/^192\.168\./.test(addr)) return 'lan';
    if (/^172\.(1[6-9]|2[0-9]|3[01])\./.test(addr)) return 'lan';
    if (/^169\.254\./.test(addr)) return 'link';
    if (/^100\.(6[4-9]|[7-9][0-9]|1[0-1][0-9]|12[0-7])\./.test(addr)) return 'lan';
    return 'public4';
}

/** 枚举本机地址，按推荐度排序。 */
function listAddresses() {
    const ifaces = os.networkInterfaces();
    const out = [];

    for (const name of Object.keys(ifaces)) {
        for (const info of ifaces[name] || []) {
            const family = (info.family === 'IPv6' || info.family === 6) ? 6 : 4;
            let addr = info.address;
            if (family === 6) {
                const pct = addr.indexOf('%');
                addr = (pct >= 0 ? addr.slice(0, pct) : addr).toLowerCase();
                if (addr === '::1' || addr === '::') continue;
            } else if (info.internal && addr === '127.0.0.1') {
                continue;
            }

            const vpn = VPN_VENDORS.find(v => v.re.test(name));
            const rawKind = family === 6 ? classifyV6(addr) : classifyV4(addr);

            if (rawKind === 'link') {
                out.push({ iface: name, address: addr, family, kind: 'link', usable: false, score: 900,
                    label: family === 6 ? 'IPv6 链路本地' : 'APIPA 自动地址', reason: '只在单网段有效，跨机无用' });
                continue;
            }
            if (vpn) {
                out.push({ iface: name, address: addr, family, kind: 'vpn', vendor: vpn.label, usable: true,
                    score: family === 6 ? 11 : 10, label: `${vpn.label} · ${addr}` });
                continue;
            }
            const virt = VIRTUAL_ONLY.find(v => v.re.test(name));
            if (virt) {
                out.push({ iface: name, address: addr, family, kind: 'virtual', vendor: virt.vendor, usable: false,
                    score: 800, label: `${name}（本机虚拟网卡）`, reason: '本机内部网络，对端无法访问' });
                continue;
            }
            if (rawKind === 'public6') {
                out.push({ iface: name, address: addr, family, kind: 'public6', usable: true, score: 20, label: `公网 IPv6 · ${addr}` });
            } else if (rawKind === 'ula') {
                out.push({ iface: name, address: addr, family, kind: 'ula', usable: true, score: 40, label: `内网 IPv6 · ${addr}` });
            } else if (rawKind === 'lan') {
                out.push({ iface: name, address: addr, family, kind: 'lan', usable: true, score: 30, label: `局域网 · ${addr}（${name}）` });
            } else {
                out.push({ iface: name, address: addr, family, kind: 'public4', usable: true, score: 25, label: `公网 IPv4 · ${addr}` });
            }
        }
    }

    const dedup = new Map();
    for (const e of out) {
        const prev = dedup.get(e.address);
        if (!prev || e.score < prev.score) dedup.set(e.address, e);
    }
    return [...dedup.values()].sort((a, b) => {
        if (a.usable !== b.usable) return a.usable ? -1 : 1;
        return a.score - b.score;
    });
}

/** 选推荐地址：有虚拟局域网就用它（用户显然是为联机装的），否则公网 v6，再否则局域网。 */
function pickRecommended(list) {
    const usable = list.filter(a => a.usable);
    if (!usable.length) return null;
    const vpn = usable.filter(a => a.kind === 'vpn');
    if (vpn.length) return vpn.find(a => a.family === 4) || vpn[0];
    const pub6 = usable.filter(a => a.kind === 'public6');
    if (pub6.length) return pub6[0];
    const lan = usable.filter(a => a.kind === 'lan');
    if (lan.length) return lan[0];
    return usable[0];
}

// ══════════════════════════════════════════════════════════════════════════
// 打印
// ══════════════════════════════════════════════════════════════════════════

const C = {
    reset: '\x1b[0m', dim: '\x1b[2m', bold: '\x1b[1m',
    green: '\x1b[32m', yellow: '\x1b[33m', red: '\x1b[31m', cyan: '\x1b[36m',
};
const say = (s = '') => console.log(s);
const okLine = (s) => console.log(`  ${C.green}V${C.reset} ${s}`);
const badLine = (s) => console.log(`  ${C.red}X${C.reset} ${s}`);
const warnLine = (s) => console.log(`  ${C.yellow}!${C.reset} ${s}`);

function printAddresses(list) {
    say(`${C.bold}本机网卡${C.reset}`);
    if (!list.length) {
        warnLine('没有发现任何可用地址');
        return;
    }
    for (const a of list) {
        if (a.usable) {
            const star = a.kind === 'vpn' ? `${C.cyan}[虚拟局域网]${C.reset}` : '';
            say(`  ${C.green}V${C.reset} ${a.label} ${star}`);
        } else {
            say(`  ${C.dim}X ${a.label} —— ${a.reason}${C.reset}`);
        }
    }
}

// ══════════════════════════════════════════════════════════════════════════
// 房主模式
// ══════════════════════════════════════════════════════════════════════════

function runHost() {
    const list = listAddresses();
    const rec = pickRecommended(list);

    say('');
    say(`${C.bold}════ 超元链接 · 通路检测（房主）════${C.reset}`);
    say('');
    printAddresses(list);
    say('');

    if (!rec) {
        badLine('没有找到可用于联机的地址，请先检查网络连接');
        process.exit(1);
    }

    // 多个虚拟局域网同时存在时，无法武断替你选一个 —— 直接列出来让你确认
    const vpnList = list.filter(a => a.usable && a.kind === 'vpn');
    if (vpnList.length > 1) {
        warnLine(`检测到 ${vpnList.length} 个虚拟局域网网卡，请确认你们俩用的是同一个：`);
        for (const a of vpnList) say(`      ${C.cyan}${a.address}${C.reset}   ${C.dim}${a.label}${C.reset}`);
        say(`  ${C.dim}下面推荐的是第一个，如果对方连不上就换另一个试试${C.reset}`);
        say('');
    }

    say(`${C.bold}推荐发给对方的地址${C.reset}`);
    say(`  ${C.cyan}${rec.address}${C.reset}   ${C.dim}(${rec.label})${C.reset}`);
    if (rec.kind !== 'vpn') {
        say('');
        warnLine('没有检测到虚拟局域网网卡。');
        warnLine('如果你们不在同一个 WiFi 下，这个地址对方多半连不上 ——');
        warnLine('请双方先装同一个组网工具（ZeroTier / 蒲公英 / Tailscale 等）。');
    }
    say('');

    const server = net.createServer((socket) => {
        say(`${C.green}▸ 对方已连入：${socket.remoteAddress}:${socket.remotePort}${C.reset}`);

        let buf = '';
        socket.setEncoding('utf8');
        socket.on('data', (chunk) => {
            buf += chunk;
            let idx;
            while ((idx = buf.indexOf('\n')) >= 0) {
                const line = buf.slice(0, idx);
                buf = buf.slice(idx + 1);
                if (!line) continue;
                let msg;
                try { msg = JSON.parse(line); } catch { continue; }

                if (msg.t === 'hello') {
                    if (msg.magic !== MAGIC) {
                        socket.write(JSON.stringify({ t: 'reject', reason: '工具版本不一致' }) + '\n');
                        socket.end();
                        return;
                    }
                    socket.write(JSON.stringify({
                        t: 'welcome', magic: MAGIC, host: os.hostname(), ts: Date.now(),
                    }) + '\n');
                    okLine('握手成功');
                } else if (msg.t === 'ping') {
                    socket.write(JSON.stringify({ t: 'pong', seq: msg.seq, ts: msg.ts }) + '\n');
                } else if (msg.t === 'done') {
                    say(`${C.green}▸ 对方测试完成，通路正常${C.reset}`);
                }
            }
        });

        socket.on('error', (e) => warnLine(`连接出错：${e.message}`));
        socket.on('close', () => say(`${C.dim}▸ 对方断开了${C.reset}`));
    });

    server.on('error', (e) => {
        badLine(`监听失败：${e.message}`);
        process.exit(1);
    });

    server.listen(0, '::', () => {
        const port = server.address().port;
        say(`${C.bold}让对方执行这条命令${C.reset}`);
        say(`  ${C.cyan}node "超元链接-通路检测.cjs" join ${rec.address}:${port}${C.reset}`);
        say('');
        say(`${C.dim}等待对方连接…（Ctrl+C 退出）${C.reset}`);
        say('');
    });

    // 顺便把 IPv4 的监听也开上（有些虚拟局域网只走 v4）
    process.on('SIGINT', () => {
        say('');
        say('已退出');
        process.exit(0);
    });
}

// ══════════════════════════════════════════════════════════════════════════
// 客方模式
// ══════════════════════════════════════════════════════════════════════════

function runJoin(target) {
    if (!target) {
        badLine('用法：node "超元链接-通路检测.cjs" join <地址>:<端口>');
        process.exit(1);
    }

    let host;
    let port;
    const m = target.match(/^\[?([^\]]+?)\]?:(\d+)$/);
    if (m) {
        host = m[1];
        port = Number(m[2]);
    } else {
        badLine(`地址格式不对：「${target}」，应该长这样 100.64.1.2:51234`);
        process.exit(1);
    }

    say('');
    say(`${C.bold}════ 超元链接 · 通路检测（客方）════${C.reset}`);
    say('');
    say(`目标：${host}:${port}`);
    say('');

    const started = Date.now();
    const socket = net.connect({ host, port });
    socket.setEncoding('utf8');
    socket.setNoDelay(true);

    let connected = false;
    let buf = '';
    const rtts = [];
    let seq = 0;

    const timer = setTimeout(() => {
        if (connected) return;
        badLine(`连接超时（8 秒）`);
        say('');
        warnLine('可能的原因：');
        say('  · 对方的地址填错了，或者对方还没启动房主模式');
        say('  · 你们不在同一个虚拟局域网里');
        say('  · 对方 Windows 防火墙拦住了入站连接（首次运行要选「允许」）');
        process.exit(1);
    }, 8000);

    socket.on('connect', () => {
        connected = true;
        clearTimeout(timer);
        const elapsed = Date.now() - started;
        okLine(`TCP 连接已建立（${elapsed} ms）`);
        socket.write(JSON.stringify({ t: 'hello', magic: MAGIC, client: os.hostname() }) + '\n');
    });

    socket.on('data', (chunk) => {
        buf += chunk;
        let idx;
        while ((idx = buf.indexOf('\n')) >= 0) {
            const line = buf.slice(0, idx);
            buf = buf.slice(idx + 1);
            if (!line) continue;
            let msg;
            try { msg = JSON.parse(line); } catch { continue; }

            if (msg.t === 'reject') {
                badLine(`被对方拒绝：${msg.reason}`);
                process.exit(1);
            }
            if (msg.t === 'welcome') {
                okLine(`握手成功，对方主机：${msg.host}`);
                say('');
                say(`${C.bold}延迟测试${C.reset}`);
                sendPing();
                return;
            }
            if (msg.t === 'pong') {
                const rtt = Date.now() - msg.ts;
                rtts.push(rtt);
                say(`  第 ${msg.seq} 次：${rtt} ms`);
                if (rtts.length >= PING_ROUNDS) {
                    finish();
                } else {
                    setTimeout(sendPing, 120);
                }
            }
        }
    });

    function sendPing() {
        seq += 1;
        socket.write(JSON.stringify({ t: 'ping', seq, ts: Date.now() }) + '\n');
    }

    function finish() {
        socket.write(JSON.stringify({ t: 'done' }) + '\n');
        const avg = Math.round(rtts.reduce((a, b) => a + b, 0) / rtts.length);
        const min = Math.min(...rtts);
        const max = Math.max(...rtts);

        say('');
        say(`${C.bold}结果${C.reset}`);
        okLine(`通路正常！平均延迟 ${avg} ms（最低 ${min} / 最高 ${max}）`);
        say('');
        if (avg < 50) say(`  ${C.green}延迟很低，联机体验会很好${C.reset}`);
        else if (avg < 150) say(`  ${C.green}延迟可接受，回合制卡牌完全够用${C.reset}`);
        else if (avg < 300) say(`  ${C.yellow}延迟偏高，但卡牌游戏仍可玩${C.reset}`);
        else say(`  ${C.yellow}延迟很高，操作反馈会明显迟滞${C.reset}`);
        say('');

        setTimeout(() => { socket.end(); process.exit(0); }, 200);
    }

    socket.on('error', (e) => {
        clearTimeout(timer);
        if (connected) {
            badLine(`连接中断：${e.message}`);
        } else {
            badLine(`连接失败：${e.code || e.message}`);
            say('');
            if (e.code === 'ECONNREFUSED') {
                warnLine('对方拒绝了连接 —— 房主可能没启动，或者地址/端口填错了');
            } else if (e.code === 'EHOSTUNREACH' || e.code === 'ENETUNREACH') {
                warnLine('网络不可达 —— 双方大概率不在同一个虚拟局域网里');
            } else if (e.code === 'ETIMEDOUT') {
                warnLine('超时 —— 对方可能被防火墙拦住了');
            }
        }
        process.exit(1);
    });
}

// ══════════════════════════════════════════════════════════════════════════
// CLI
// ══════════════════════════════════════════════════════════════════════════

const [mode, arg] = process.argv.slice(2);

if (mode === 'host') {
    runHost();
} else if (mode === 'join') {
    runJoin(arg);
} else {
    say('');
    say(`${C.bold}超元链接 · 跨网通路检测${C.reset}`);
    say('');
    say('用法：');
    say(`  ${C.cyan}node "超元链接-通路检测.cjs" host${C.reset}               房主：列出本机地址并开始等待`);
    say(`  ${C.cyan}node "超元链接-通路检测.cjs" join <地址>:<端口>${C.reset}   客方：连接房主`);
    say('');
    say('两台机器都要能运行 node。先各自跑一次 host，把「推荐地址」发给对方。');
    say('');
}
