/**
 * addresses.ts —— 超元链接 · 本机可达地址枚举与推荐
 * ============================================================================
 * 这是整个联机体验里最容易被忽略、却最影响成败的一环。
 *
 * 粉丝用第三方 MOD 时的真实痛苦：房主界面列出了七八个网卡地址，
 * 他得自己认出「哪个是 ZeroTier 的、哪个是家里 WiFi 的」，认错了对方就连不上。
 * MOD 的地址排序只看网段（192.168 排第一），虚拟网卡还被标注为「干扰项排后面」——
 * 于是跨网场景下，它给出的第一个地址**恰好是最不可能通的那个**。
 *
 * 这里换一个思路：**按「网卡身份」而不是「网段」排序**。
 *   · 认出 ZeroTier / 蒲公英 / Tailscale 等组网网卡 ⇒ 跨网首选，顶到第一位
 *   · 认出 Hyper-V / VMware / WSL 等本地虚拟化网卡 ⇒ 明确排除（它们永远不通）
 *   · 公共 IPv6（2000::/3）⇒ 无 NAT 直连，跨网第二顺位
 *   · 内网 IPv4 ⇒ 同网段场景可用
 *
 * ⚠️ 本文件只读系统信息，不发起任何连接。
 * ============================================================================
 */

import type { CodeMode } from './code';
import { nodeRequire } from './nodeEnv';

/** 重新导出，让调用方从本模块就能判断环境（实现见 nodeEnv.ts）。 */
export { isNetAvailable } from './nodeEnv';

/** 网卡身份分类。顺序即推荐优先级（越小越优先）。 */
export type AddressKind =
    | 'vpn'        // 第三方组网虚拟网卡（ZeroTier / 蒲公英 / Tailscale …）
    | 'public-v6'  // 可路由的全局 IPv6，无 NAT
    | 'lan'        // 常规内网 IPv4
    | 'ula-v6'     // IPv6 唯一本地地址（fd00::/8），通常只在虚拟局域网内可达
    | 'public-v4'  // 公网 IPv4（家宽罕见）
    | 'link-v6'    // IPv6 链路本地（fe80::），跨机无意义
    | 'virtual';   // 本地虚拟化网卡（Hyper-V / VMware / WSL），永远不可用于联机

/** 一条候选地址。 */
export interface NetAddress {
    /** 系统网卡名，如「以太网」「ZeroTier One [xxxx]」 */
    iface: string;
    address: string;
    family: 4 | 6;
    kind: AddressKind;
    /** 识别出的厂商标识，用于 UI 说人话，如 `zerotier` */
    vendor?: string;
    /** 中文说明，可直接显示给玩家 */
    label: string;
    /** 排序权重，越小越靠前 */
    score: number;
    /** 是否值得拿来联机 */
    usable: boolean;
    /** 不可用的原因（usable=false 时一定有） */
    reason?: string;
    /** 该地址适合的连接模式 */
    mode: CodeMode;
}

/**
 * 第三方组网工具的网卡名特征。
 * 顺序有意义：先匹配到的胜出（蒲公英的网卡名有时也含 "virtual"，
 * 所以组网厂商必须排在通用虚拟化规则之前）。
 */
const VPN_VENDORS: Array<{ vendor: string; label: string; re: RegExp }> = [
    { vendor: 'zerotier', label: 'ZeroTier 虚拟局域网', re: /zero\s*tier|\bzt[a-z0-9]{6,}/i },
    { vendor: 'oray', label: '蒲公英虚拟局域网', re: /oray|pgyvpn|\bpgy\b|oraybox|pgybox/i },
    { vendor: 'tailscale', label: 'Tailscale 虚拟局域网', re: /tail\s*scale|tailscale/i },
    { vendor: 'hamachi', label: 'Hamachi 虚拟局域网', re: /hamachi|logmein/i },
    { vendor: 'radmin', label: 'Radmin VPN', re: /radmin/i },
    { vendor: 'easytier', label: 'EasyTier 虚拟局域网', re: /easy\s*tier/i },
    { vendor: 'wireguard', label: 'WireGuard 隧道', re: /wireguard|^wg\d+$/i },
    { vendor: 'n2n', label: 'n2n 虚拟局域网', re: /\bn2n\b|edge\s*node/i },
    { vendor: 'netmaker', label: 'Netmaker 虚拟局域网', re: /netmaker/i },
    { vendor: 'frp', label: 'frp 隧道', re: /\bfrp\b/i },
];

/**
 * 本地虚拟化网卡 —— 这些**永远不能用于联机**，必须明确排除。
 * 它们最容易在枚举结果里混进来，是误判的主要来源。
 */
const VIRTUAL_ONLY: Array<{ vendor: string; re: RegExp }> = [
    { vendor: 'hyperv', re: /vethernet|hyper-?v|default switch/i },
    { vendor: 'vmware', re: /vmware|vmnet/i },
    { vendor: 'virtualbox', re: /virtualbox|vboxnet/i },
    { vendor: 'wsl', re: /\bwsl\b/i },
    { vendor: 'docker', re: /docker|br-[0-9a-f]{6,}|veth/i },
    { vendor: 'tap', re: /tap-?windows|tun\s*tap/i },
    { vendor: 'bluetooth', re: /bluetooth|蓝牙/i },
    { vendor: 'teredo', re: /teredo|isatap/i },
];

// ══════════════════════════════════════════════════════════════════════════
// Node 模块获取（渲染进程开了 nodeIntegration，但走 ESM 时不能裸写 require）
// ══════════════════════════════════════════════════════════════════════════

interface NodeOs {
    networkInterfaces(): Record<string, Array<{
        address: string;
        family: string | number;
        internal: boolean;
        netmask?: string;
        scopeid?: number;
    }> | undefined>;
}

// nodeRequire / isNetAvailable 已上收到 nodeEnv.ts（唯一取用入口）

// ══════════════════════════════════════════════════════════════════════════
// IPv6 分类
// ══════════════════════════════════════════════════════════════════════════

/** 把 IPv6 文本归一成小写、无 zone 的形式。 */
function normalizeV6(addr: string): string {
    const pct = addr.indexOf('%');
    return (pct >= 0 ? addr.slice(0, pct) : addr).toLowerCase();
}

/** 判断 IPv6 属于哪一类。传入的地址必须已归一化。 */
function classifyV6(addr: string): AddressKind {
    if (addr === '::1') return 'link-v6';
    // fe80::/10 链路本地
    if (/^fe[89ab][0-9a-f]?:/.test(addr)) return 'link-v6';
    // fc00::/7 唯一本地地址
    if (/^f[cd][0-9a-f]{2}:/.test(addr)) return 'ula-v6';
    // 2000::/3 全局单播：首字符 2 或 3
    if (/^[23][0-9a-f]{3}:/.test(addr)) return 'public-v6';
    return 'link-v6';
}

/** 判断 IPv4 是否内网（RFC1918）或运营商级 NAT（100.64/10）。 */
function classifyV4(addr: string): AddressKind {
    if (/^10\./.test(addr)) return 'lan';
    if (/^192\.168\./.test(addr)) return 'lan';
    if (/^172\.(1[6-9]|2[0-9]|3[01])\./.test(addr)) return 'lan';
    if (/^169\.254\./.test(addr)) return 'link-v6'; // APIPA，本质不可用
    if (/^100\.(6[4-9]|[7-9][0-9]|1[0-1][0-9]|12[0-7])\./.test(addr)) return 'lan'; // CGNAT
    return 'public-v4';
}

// ══════════════════════════════════════════════════════════════════════════
// 主枚举
// ══════════════════════════════════════════════════════════════════════════

/**
 * 枚举本机全部候选地址，已按推荐度排好序。
 * 不可用的（虚拟化 / 链路本地 / APIPA）会带 `usable: false` 一起返回，
 * 以便 UI 在「高级」里展示，但默认收起来。
 */
export function listAddresses(): NetAddress[] {
    const os = nodeRequire('os') as NodeOs | null;
    if (!os) return [];

    const result: NetAddress[] = [];
    const ifaces = os.networkInterfaces();

    for (const ifaceName of Object.keys(ifaces)) {
        const list = ifaces[ifaceName];
        if (!list) continue;

        for (const info of list) {
            // Node 18+ 的 family 是字符串，老版本是数字，两种都认
            const fam: 4 | 6 = info.family === 'IPv6' || info.family === 6 ? 6 : 4;
            if (info.internal && fam === 4 && info.address === '127.0.0.1') continue;

            const addr = fam === 6 ? normalizeV6(info.address) : info.address;
            if (fam === 6 && (addr === '::1' || addr === '::')) continue;

            const entry = buildEntry(ifaceName, addr, fam);
            if (entry) result.push(entry);
        }
    }

    // 同一个 IP 可能出现在多个网卡上（虚拟网卡桥接），去重并保留评分最高的一条
    const dedup = new Map<string, NetAddress>();
    for (const e of result) {
        const prev = dedup.get(e.address);
        if (!prev || e.score < prev.score) dedup.set(e.address, e);
    }

    return [...dedup.values()].sort((a, b) => {
        if (a.usable !== b.usable) return a.usable ? -1 : 1;
        if (a.score !== b.score) return a.score - b.score;
        return a.address.localeCompare(b.address);
    });
}

/** 组装单条地址记录，判定身份与评分。 */
function buildEntry(iface: string, address: string, family: 4 | 6): NetAddress | null {
    // 1) 先看是不是第三方组网网卡 —— 它优先级最高，且要压过通用「虚拟化」规则
    let vpn: { vendor: string; label: string } | null = null;
    for (const v of VPN_VENDORS) {
        if (v.re.test(iface)) { vpn = { vendor: v.vendor, label: v.label }; break; }
    }

    const rawKind = family === 6 ? classifyV6(address) : classifyV4(address);
    const mode: CodeMode = family === 6 ? 'ipv6' : 'ipv4';

    // 2) 链路本地 / APIPA：任何情况都不用于联机
    if (rawKind === 'link-v6') {
        return {
            iface, address, family, kind: 'link-v6', mode,
            label: family === 6 ? 'IPv6 链路本地（不可跨机）' : '自动私有地址 APIPA（不可用）',
            score: 900, usable: false,
            reason: '这类地址只在单个网段内有效，跨机器无法使用',
        };
    }

    // 3) 第三方组网网卡
    if (vpn) {
        // 组网网卡上的 ULA IPv6 在虚拟局域网内是可达的，仍算可用
        return {
            iface, address, family, kind: 'vpn', vendor: vpn.vendor, mode,
            label: `${vpn.label} · ${address}`,
            score: family === 6 ? 11 : 10,
            usable: true,
        };
    }

    // 4) 本地虚拟化网卡（Hyper-V / VMware / WSL / 容器）
    for (const v of VIRTUAL_ONLY) {
        if (v.re.test(iface)) {
            return {
                iface, address, family, kind: 'virtual', vendor: v.vendor, mode,
                label: `${iface}（本机虚拟网卡）`,
                score: 800, usable: false,
                reason: '这是本机内部的虚拟网络，对端无法访问',
            };
        }
    }

    // 5) 公共 IPv6 —— 无 NAT，是跨网直连的优质选项
    if (rawKind === 'public-v6') {
        return {
            iface, address, family, kind: 'public-v6', mode,
            label: `公网 IPv6 · ${address}`,
            score: 20, usable: true,
        };
    }

    // 6) IPv6 ULA（无组网网卡时的私有 v6，基本只在局域网内可用）
    if (rawKind === 'ula-v6') {
        return {
            iface, address, family, kind: 'ula-v6', mode,
            label: `内网 IPv6 · ${address}`,
            score: 40, usable: true,
        };
    }

    // 7) 常规内网 IPv4
    if (rawKind === 'lan') {
        return {
            iface, address, family, kind: 'lan', mode,
            label: `局域网 · ${address}（${iface}）`,
            score: 30, usable: true,
        };
    }

    // 8) 公网 IPv4
    if (rawKind === 'public-v4') {
        return {
            iface, address, family, kind: 'public-v4', mode,
            label: `公网 IPv4 · ${address}`,
            score: 25, usable: true,
        };
    }

    return null;
}

/**
 * 列出所有「值得发给对方试」的地址，按推荐度排序。
 *
 * 为什么需要这个、而不是只用 `pickRecommended`：
 *   玩家机器上可能同时装着两个组网工具（实测开发机就有 Tailscale + Radmin，
 *   两者评分相同）。此时「推荐哪一个」没有客观答案 —— 谁排前面取决于系统
 *   枚举网卡的顺序，**不稳定**。正确做法是把候选全列出来让玩家确认，
 *   而不是武断挑一个、再让他对着连不上的地址反复试。
 */
export function listConnectCandidates(all?: NetAddress[]): NetAddress[] {
    const list = (all ?? listAddresses()).filter(a => a.usable);
    const rank = (a: NetAddress): number => {
        if (a.kind === 'vpn') return a.family === 4 ? 0 : 1;
        if (a.kind === 'public-v6') return 2;
        if (a.kind === 'public-v4') return 3;
        if (a.kind === 'lan') return 4;
        return 5;
    };
    return [...list].sort((a, b) => {
        const d = rank(a) - rank(b);
        return d !== 0 ? d : a.address.localeCompare(b.address);
    });
}

/**
 * 选一个「最推荐发给对方」的地址。
 *
 * 判断逻辑（与 MOD 只看网段的做法不同）：
 *   · 只要检测到第三方组网网卡 —— 说明用户大概率已经为联机装好了工具，
 *     那它一定是最可靠的一条，直接推荐，不要再让人在列表里猜。
 *   · 否则优先公网 IPv6（零配置、无 NAT）。
 *   · 再否则退回局域网 IPv4。
 *
 * ⚠️ 存在多个组网网卡时本函数只能给出**其中一个**，且不保证稳定。
 *    UI 层应当改用 `listConnectCandidates()` 全部列出，让玩家确认。
 */
export function pickRecommended(all?: NetAddress[]): NetAddress | null {
    const list = (all ?? listAddresses()).filter(a => a.usable);
    if (list.length === 0) return null;

    const vpn = list.filter(a => a.kind === 'vpn');
    if (vpn.length > 0) {
        // 组网网卡里优先 IPv4：虚拟局域网工具对 v4 的支持最稳定
        return vpn.find(a => a.family === 4) ?? vpn[0];
    }

    const pub6 = list.filter(a => a.kind === 'public-v6');
    if (pub6.length > 0) return pub6[0];

    const lan = list.filter(a => a.kind === 'lan');
    if (lan.length > 0) return lan[0];

    return list[0];
}

/**
 * 生成一句给玩家看的环境结论。
 * 用于在「创建房间」界面直接告诉他：现在这个网络环境，对方该怎么进来。
 */
export function describeEnvironment(all?: NetAddress[]): {
    /** 推荐地址，null 表示没有可用的 */
    recommended: NetAddress | null;
    /** 是否检测到第三方组网工具 */
    hasVpn: boolean;
    /** 组网工具的厂商标识（去重） */
    vpnVendors: string[];
    /** 是否具备公网 IPv6 */
    hasPublicV6: boolean;
    /** 一句话结论，可直接显示 */
    hint: string;
} {
    const list = all ?? listAddresses();
    const usable = list.filter(a => a.usable);
    const recommended = pickRecommended(list);

    const vpnList = usable.filter(a => a.kind === 'vpn');
    const vpnVendors = [...new Set(vpnList.map(a => a.vendor).filter((v): v is string => !!v))];
    const hasPublicV6 = usable.some(a => a.kind === 'public-v6');
    const hasVpn = vpnList.length > 0;

    let hint: string;
    if (hasVpn) {
        hint = `检测到${vpnVendors.length > 0 ? `（${vpnVendors.join(' / ')}）` : ''}虚拟局域网，跨网络对战请让对方使用下面的地址`;
    } else if (hasPublicV6) {
        hint = '本机具备公网 IPv6，双方都有 IPv6 时可以直接联机，不需要任何工具';
    } else if (usable.length > 0) {
        hint = '只发现局域网地址：同一个 WiFi 下可以直接联机；身处两地需要先装一个虚拟局域网工具';
    } else {
        hint = '没有找到可用于联机的网络地址，请检查网络连接';
    }

    return { recommended, hasVpn, vpnVendors, hasPublicV6, hint };
}
