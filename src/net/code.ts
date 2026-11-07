/**
 * code.ts —— 超元链接 · 连接码编解码（纯逻辑，无任何 IO）
 * ============================================================================
 * 为什么需要「连接码」：
 *   甲案（零服务器）下，双方必须**手工交换一次可达地址**，没有任何第三方
 *   中转。为了让人能通过聊天软件安全搬运，这里把二进制打包成
 *   Crockford Base32（剔除 I / L / O / U，无视觉歧义）并附加 CRC-16。
 *
 * 设计取舍：
 *   · **不用人类可读的文本格式**（如 `SBR-2001:db8::1:27015`）：IPv6 过长，
 *     且 `0/O`、`1/l` 在聊天软件里常被自动折行或替换成全角。
 *   · **自带 CRC**：粘贴被截断、被插空格、被改成全角，都在解码阶段明确报错，
 *     而不是连到一半莫名失败 —— 联机排障最贵的就是「不知道错在哪」。
 *   · **版本前缀写进码内**：将来协议升级可并行支持旧码，不必强制全员更新。
 *
 * 字节布局（小端序，v1）：
 *   [0]      version   = 1
 *   [1]      mode      1 = IPv6 直连 / 2 = IPv4 直连 / 3 = ICE（保留）
 *   [2]      addrLen   地址字节数（16 或 4；ICE 模式为载荷长度）
 *   [3..3+n) addr       地址原始字节
 *   [..+2)   port      监听端口（大端）
 *   [..+2)   crc16     前面所有字节的 CRC-16/CCITT-FALSE（大端）
 * ============================================================================
 */

/** 码内自带的协议版本。与 package.json 的版本号无关。 */
export const CODE_VERSION = 1;

/** 连接码人眼可见的前缀。改这里等于换协议，必须同步升 CODE_VERSION。 */
export const CODE_PREFIX = 'SBR2';

/** 连接方式。ICE 预留给第二期的 WebRTC 打洞。 */
export type CodeMode = 'ipv6' | 'ipv4' | 'ice';

const MODE_TO_BYTE: Record<CodeMode, number> = { ipv6: 1, ipv4: 2, ice: 3 };
const BYTE_TO_MODE: Record<number, CodeMode> = { 1: 'ipv6', 2: 'ipv4', 3: 'ice' };

/** 解出来的一份连接信息。 */
export interface ConnectionCode {
    mode: CodeMode;
    /** 对端地址（IPv6 为完整文本，IPv4 为点分十进制）。ICE 模式下为空串。 */
    address: string;
    /** 对端监听端口。 */
    port: number;
    /** ICE 模式的原始载荷（SDP 等）。其他模式为空。 */
    payload?: Uint8Array;
}

// ══════════════════════════════════════════════════════════════════════════
// Crockford Base32 —— 32 个字符，去掉 I L O U
// ══════════════════════════════════════════════════════════════════════════

const B32_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/**
 * 解码用的查找表。这里刻意做**宽松映射**：
 *   I / L → 1，O → 0，U → V
 * 因为用户从聊天软件里复制时，经常会遇到字体把 `1` 渲染成 `l`、
 * 或者平台自动把 `O` 换成 `0`。松一点比报错更有用。
 */
const B32_LOOKUP: Record<string, number> = (() => {
    const map: Record<string, number> = {};
    for (let i = 0; i < B32_ALPHABET.length; i++) map[B32_ALPHABET[i]] = i;
    map['I'] = 1;
    map['L'] = 1;
    map['O'] = 0;
    map['U'] = 31;
    // 小写也要认
    for (const k of Object.keys(map).slice()) {
        const lower = k.toLowerCase();
        if (lower !== k) map[lower] = map[k];
    }
    return map;
})();

// ══════════════════════════════════════════════════════════════════════════
// CRC-16/CCITT-FALSE —— 用于发现「码被截断 / 被改坏」
// ══════════════════════════════════════════════════════════════════════════

function crc16(bytes: Uint8Array): number {
    let crc = 0xffff;
    for (let i = 0; i < bytes.length; i++) {
        crc ^= bytes[i] << 8;
        for (let bit = 0; bit < 8; bit++) {
            crc = (crc & 0x8000) !== 0 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
        }
    }
    return crc & 0xffff;
}

// ══════════════════════════════════════════════════════════════════════════
// 位流：字节 ↔ Base32
// ══════════════════════════════════════════════════════════════════════════

function bytesToBase32(bytes: Uint8Array): string {
    let out = '';
    let buffer = 0;
    let bits = 0;
    for (let i = 0; i < bytes.length; i++) {
        buffer = (buffer << 8) | bytes[i];
        bits += 8;
        while (bits >= 5) {
            bits -= 5;
            out += B32_ALPHABET[(buffer >>> bits) & 0x1f];
        }
    }
    // 末尾不足 5 位的，低位补 0 凑成一组
    if (bits > 0) out += B32_ALPHABET[(buffer << (5 - bits)) & 0x1f];
    return out;
}

/**
 * Base32 → 字节。
 * @param str      纯字母数字部分
 * @param byteLen  期望还原出的字节数（由码头 addrLen 推得，用于裁掉补齐位）
 */
function base32ToBytes(str: string, byteLen: number): Uint8Array {
    const out = new Uint8Array(byteLen);
    let buffer = 0;
    let bits = 0;
    let idx = 0;
    for (let i = 0; i < str.length; i++) {
        const ch = str[i];
        const val = B32_LOOKUP[ch];
        if (val === undefined) {
            throw new CodeError(`连接码含有无法识别的字符：「${ch}」`);
        }
        buffer = (buffer << 5) | val;
        bits += 5;
        if (bits >= 8) {
            bits -= 8;
            if (idx < byteLen) out[idx] = (buffer >>> bits) & 0xff;
            idx++;
        }
    }
    if (idx < byteLen) {
        throw new CodeError('连接码不完整（长度不足），可能复制时被截断了');
    }
    return out;
}

// ══════════════════════════════════════════════════════════════════════════
// 错误类型 —— 让 UI 能区分「码坏了」和「网络不通」
// ══════════════════════════════════════════════════════════════════════════

/** 连接码格式 / 校验错误。消息直接面向玩家，可原样显示。 */
export class CodeError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'CodeError';
    }
}

// ══════════════════════════════════════════════════════════════════════════
// IPv6 文本 ↔ 16 字节
// ══════════════════════════════════════════════════════════════════════════

/**
 * 把 IPv6 文本展开成 16 字节。
 * 支持 `::` 压缩、末尾 IPv4 混写（如 `::ffff:192.168.1.1`）。
 *
 * zone id（如 `fe80::1%eth0`）会被**剥掉**而不是报错：
 * zone 是「本机哪块网卡」的局部标记，对方机器上没有意义，带上反而会连错。
 * 而我们本来就不支持链路本地地址联机（见 addresses.ts 的分类），所以剥掉无损。
 */
export function ipv6ToBytes(text: string): Uint8Array {
    let src = text.trim();
    if (!src) throw new CodeError('IPv6 地址为空');

    // zone id 在跨机传输里没有意义
    const pct = src.indexOf('%');
    if (pct >= 0) src = src.slice(0, pct);

    // 末尾 IPv4 混写先转成两组十六进制
    const lastColon = src.lastIndexOf(':');
    if (lastColon >= 0 && src.slice(lastColon + 1).includes('.')) {
        const v4 = src.slice(lastColon + 1);
        const parts = v4.split('.');
        if (parts.length !== 4) throw new CodeError(`IPv6 里的 IPv4 段不合法：${v4}`);
        const nums = parts.map(p => {
            const n = Number(p);
            if (!Number.isInteger(n) || n < 0 || n > 255) throw new CodeError(`IPv4 段越界：${v4}`);
            return n;
        });
        const hi = ((nums[0] << 8) | nums[1]).toString(16);
        const lo = ((nums[2] << 8) | nums[3]).toString(16);
        src = src.slice(0, lastColon + 1) + hi + ':' + lo;
    }

    const halves = src.split('::');
    if (halves.length > 2) throw new CodeError(`IPv6 地址不合法（出现多个 ::）：${text}`);

    const head = halves[0] ? halves[0].split(':') : [];
    const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
    const explicit = head.length + tail.length;

    let groups: string[];
    if (halves.length === 2) {
        if (explicit > 7) throw new CodeError(`IPv6 地址不合法（分组过多）：${text}`);
        const fill = new Array(8 - explicit).fill('0');
        groups = [...head, ...fill, ...tail];
    } else {
        if (explicit !== 8) throw new CodeError(`IPv6 地址不合法（需要 8 组）：${text}`);
        groups = head;
    }

    const out = new Uint8Array(16);
    for (let i = 0; i < 8; i++) {
        const g = groups[i];
        if (!/^[0-9a-fA-F]{1,4}$/.test(g)) throw new CodeError(`IPv6 分组不合法：「${g}」`);
        const v = parseInt(g, 16);
        out[i * 2] = (v >>> 8) & 0xff;
        out[i * 2 + 1] = v & 0xff;
    }
    return out;
}

/** 16 字节 → 压缩形式的 IPv6 文本（找最长连续 0 段用 `::` 代替）。 */
export function bytesToIpv6(bytes: Uint8Array): string {
    if (bytes.length !== 16) throw new CodeError('IPv6 字节长度必须是 16');
    const groups: number[] = [];
    for (let i = 0; i < 8; i++) groups.push((bytes[i * 2] << 8) | bytes[i * 2 + 1]);

    // 找最长的一段连续 0（长度 ≥ 2 才值得压缩）
    let bestStart = -1;
    let bestLen = 0;
    for (let i = 0; i < 8;) {
        if (groups[i] !== 0) { i++; continue; }
        let j = i;
        while (j < 8 && groups[j] === 0) j++;
        if (j - i > bestLen) { bestLen = j - i; bestStart = i; }
        i = j;
    }

    const hex = groups.map(g => g.toString(16));
    if (bestLen < 2) return hex.join(':');

    const left = hex.slice(0, bestStart).join(':');
    const right = hex.slice(bestStart + bestLen).join(':');
    return `${left}::${right}`;
}

/** 点分十进制 IPv4 → 4 字节。 */
export function ipv4ToBytes(text: string): Uint8Array {
    const parts = text.trim().split('.');
    if (parts.length !== 4) throw new CodeError(`IPv4 地址不合法：${text}`);
    const out = new Uint8Array(4);
    for (let i = 0; i < 4; i++) {
        const n = Number(parts[i]);
        if (!Number.isInteger(n) || n < 0 || n > 255) throw new CodeError(`IPv4 段越界：${text}`);
        out[i] = n;
    }
    return out;
}

/** 4 字节 → 点分十进制 IPv4。 */
export function bytesToIpv4(bytes: Uint8Array): string {
    if (bytes.length !== 4) throw new CodeError('IPv4 字节长度必须是 4');
    return `${bytes[0]}.${bytes[1]}.${bytes[2]}.${bytes[3]}`;
}

// ══════════════════════════════════════════════════════════════════════════
// 对外接口
// ══════════════════════════════════════════════════════════════════════════

/** 把一份连接信息编码成可粘贴的连接码。 */
export function encodeCode(info: ConnectionCode): string {
    const { mode, port } = info;
    if (!Number.isInteger(port) || port <= 0 || port > 65535) {
        throw new CodeError(`端口不合法：${port}`);
    }

    let addrBytes: Uint8Array;
    if (mode === 'ipv6') {
        addrBytes = ipv6ToBytes(info.address);
    } else if (mode === 'ipv4') {
        addrBytes = ipv4ToBytes(info.address);
    } else {
        addrBytes = info.payload ?? new Uint8Array(0);
    }

    if (addrBytes.length > 255) throw new CodeError('地址载荷过长（上限 255 字节）');

    const body = new Uint8Array(3 + addrBytes.length + 2);
    body[0] = CODE_VERSION;
    body[1] = MODE_TO_BYTE[mode];
    body[2] = addrBytes.length;
    body.set(addrBytes, 3);
    body[3 + addrBytes.length] = (port >>> 8) & 0xff;
    body[4 + addrBytes.length] = port & 0xff;

    const sum = crc16(body);
    const full = new Uint8Array(body.length + 2);
    full.set(body, 0);
    full[body.length] = (sum >>> 8) & 0xff;
    full[body.length + 1] = sum & 0xff;

    // 每 5 个字符插一个分隔符，长码（ICE 模式）肉眼检查时不容易看错
    const raw = bytesToBase32(full);
    const grouped = raw.match(/.{1,5}/g)?.join('-') ?? raw;
    return `${CODE_PREFIX}-${grouped}`;
}

/** 把连接码解析回连接信息。任何不合法都会抛 CodeError（消息可直接显示给玩家）。 */
export function decodeCode(code: string): ConnectionCode {
    if (typeof code !== 'string' || !code.trim()) {
        throw new CodeError('连接码为空');
    }

    // 归一化：去掉空白与分隔符，统一大写
    let raw = code.replace(/[\s\-_]/g, '').toUpperCase();

    if (!raw.startsWith(CODE_PREFIX)) {
        throw new CodeError(`这不是超元链接的连接码（应以 ${CODE_PREFIX} 开头）`);
    }
    raw = raw.slice(CODE_PREFIX.length);

    if (raw.length < 8) throw new CodeError('连接码太短，可能只复制到一部分');

    // 先按最大可能长度解出前 3 字节，读出版本/模式/地址长度，再决定总长
    const head = base32ToBytesAllowShort(raw, 3);
    const version = head[0];
    if (version !== CODE_VERSION) {
        throw new CodeError(`连接码版本不匹配（对方 v${version}，本机 v${CODE_VERSION}），双方需要同一版本`);
    }
    const mode = BYTE_TO_MODE[head[1]];
    if (!mode) throw new CodeError(`连接码里的连接方式无法识别（${head[1]}）`);
    const addrLen = head[2];

    const totalLen = 3 + addrLen + 2 + 2;
    const bytes = base32ToBytes(raw, totalLen);

    const sumPos = totalLen - 2;
    const expect = ((bytes[sumPos] << 8) | bytes[sumPos + 1]) & 0xffff;
    const actual = crc16(bytes.subarray(0, sumPos));
    if (expect !== actual) {
        throw new CodeError('连接码校验失败（可能在复制时被改动或截断），请让对方重新发一次');
    }

    const port = ((bytes[3 + addrLen] << 8) | bytes[4 + addrLen]) & 0xffff;
    if (port === 0) throw new CodeError('连接码里的端口无效');

    const addrPayload = bytes.subarray(3, 3 + addrLen);

    if (mode === 'ipv6') {
        if (addrLen !== 16) throw new CodeError('连接码内容不完整（IPv6 地址长度不对）');
        return { mode, address: bytesToIpv6(addrPayload), port };
    }
    if (mode === 'ipv4') {
        if (addrLen !== 4) throw new CodeError('连接码内容不完整（IPv4 地址长度不对）');
        return { mode, address: bytesToIpv4(addrPayload), port };
    }
    return { mode, address: '', port, payload: new Uint8Array(addrPayload) };
}

/**
 * 只解前若数字节（用于读码头）。
 * 与 base32ToBytes 的区别：不要求凑满整字节，够用就返回。
 */
function base32ToBytesAllowShort(str: string, byteLen: number): Uint8Array {
    const out = new Uint8Array(byteLen);
    let buffer = 0;
    let bits = 0;
    let idx = 0;
    for (let i = 0; i < str.length && idx < byteLen; i++) {
        const val = B32_LOOKUP[str[i]];
        if (val === undefined) throw new CodeError(`连接码含有无法识别的字符：「${str[i]}」`);
        buffer = (buffer << 5) | val;
        bits += 5;
        if (bits >= 8) {
            bits -= 8;
            out[idx++] = (buffer >>> bits) & 0xff;
        }
    }
    if (idx < byteLen) throw new CodeError('连接码不完整（长度不足）');
    return out;
}

/** 判断一段文本看起来像不像连接码 —— 用于「粘贴即识别」的输入框。 */
export function looksLikeCode(text: string): boolean {
    if (typeof text !== 'string') return false;
    return text.replace(/[\s\-_]/g, '').toUpperCase().startsWith(CODE_PREFIX);
}
