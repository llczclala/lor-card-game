/**
 * qrFrames.ts —— 存档「二维码直传」· 分帧协议 + 压缩层
 * ============================================================================
 * 为什么需要它（2026-11-18 程的需求）：
 *   `lan.ts` 的架构决定是「PC 固定当服务端，手机永远当客户端」——安卓 WebView 里 JS
 *   起不了监听 socket。于是**手机 ⇄ 手机**根本没有一方能当服务端，跨不过去。
 *   玩家（两个手机）的诉求是「一台出二维码、一台扫」⇒ 只能把**数据本身**塞进二维码。
 *
 * 容量实测（dev 全卡号，12 个键）：
 *   原始 JSON 27.2 KB → deflate-raw 4.6 KB（5.9 倍）→ Base32 7.4 KB
 *   ⇒ 每帧 1100 字符时 **7 帧**（v22~v23 二维码，实测 117×117 的 v25 手机也能秒扫）
 *
 * 帧格式（刻意复用 `snowbreak:` 前缀，扫码端的前缀校验不用动）：
 *   `snowbreak://save?v=1&i=<帧号>&n=<总帧数>&c=<整包CRC16>&id=<会话>&d=<Base32分片>`
 *   · `i/n` 让接收端**乱序也能收**，不必按顺序扫
 *   · `c` 是**整包** CRC16（不是每帧）——收齐后校验，缺帧/串包都能发现
 *   · `id` 防止「两套传输的帧混在一起」（玩家先扫 A 的再扫 B 的）
 *
 * ⚠️ 三条不能动的约束：
 *   1. **`CompressionStream` 必须有**。Android WebView 实测支持（Chrome 146）；
 *      不支持时上层要提示玩家，别静默降级成不压缩（27 KB 要 27 帧，体验崩掉）。
 *   2. **分片必须按 Base32 字符切**，不是按字节切 —— 按字节切会切断 5-bit 分组，
 *      拼接后 `base32Decode` 会整体错位。
 *   3. **CRC 覆盖解压前的字节**（= 压缩后的数据），不是解压后的 JSON：
 *      解压可能失败，先校验再解压能给出更准确的错误。
 */

import { base32Decode, base32Encode, crc16 } from '../deckCodec';

/** 帧文本前缀 —— 必须与扫码端的 `PAIR_PREFIX` 同源（`snowbreak:`） */
export const FRAME_PREFIX = 'snowbreak://save?';

/** 分帧格式版本。改格式时必须 +1，两端不一致就直接拒绝。 */
export const FRAME_VERSION = 1;

/** 每帧承载的 Base32 字符数。
 *  v25 的数据容量是 1276 字节，这里取 1100 留出头部与编码余量；
 *  实测这个密度在手机屏幕上可以秒扫。 */
export const CHUNK_SIZE = 1100;

export interface FrameMeta {
    /** 本次传输的会话标识（4 位大写），防止两套传输的帧混收 */
    id: string;
    /** 总帧数 */
    total: number;
    /** **整包** CRC16（覆盖压缩后的字节） */
    crc: number;
}

export interface ParsedFrame extends FrameMeta {
    /** 帧号，1-based */
    idx: number;
    /** 该帧承载的 Base32 分片 */
    data: string;
}

// ══════════════════════════════════════════════════════════════════════════
// 压缩 / 解压
// ══════════════════════════════════════════════════════════════════════════

/** 当前运行环境是否具备压缩能力（缺失时上层必须提示，不能静默降级） */
export function isCompressionSupported(): boolean {
    return typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined';
}

/** 文本 → deflate-raw 字节 */
export async function compressText(text: string): Promise<Uint8Array> {
    const input = new TextEncoder().encode(text);
    const cs = new CompressionStream('deflate-raw');
    // 🔴 [2026-11-18 莉莉子 · 安卓实测踩坑] **必须先启动读取，再写入**。
    //    `CompressionStream` 的 readable 没人消费时，内部缓冲写满后 `writer.write()`
    //    会**永远挂起**（不是报错、不是拒绝，就是卡住）。桌面 Chrome / Node 的缓冲更大，
    //    小数据量下不会触发，所以本地测试全绿、一上安卓 WebView 就卡在「正在打包…」。
    const drained = new Response(cs.readable).arrayBuffer();
    const writer = cs.writable.getWriter();
    await writer.write(input);
    await writer.close();
    return new Uint8Array(await drained);
}

/** deflate-raw 字节 → 文本（失败会抛，由上层转成玩家可读的提示） */
export async function decompressText(bytes: Uint8Array): Promise<string> {
    const ds = new DecompressionStream('deflate-raw');
    // 同上：先挂上读取，再写。
    const drained = new Response(ds.readable).arrayBuffer();
    const writer = ds.writable.getWriter();
    await writer.write(bytes as unknown as BufferSource);
    await writer.close();
    return new TextDecoder().decode(await drained);
}

// ══════════════════════════════════════════════════════════════════════════
// 分帧 / 解析 / 拼装
// ══════════════════════════════════════════════════════════════════════════

/** 生成 4 位会话 id（只需在「玩家手上的几套传输」之间不撞，不需要密码学强度） */
function makeSessionId(): string {
    return Math.random().toString(36).slice(2, 6).toUpperCase().padEnd(4, 'X');
}

/**
 * 把压缩后的字节切成若干帧文本。
 * @param bytes 压缩后的数据
 * @returns 帧文本数组（按顺序）+ 元信息
 */
export function splitIntoFrames(bytes: Uint8Array): { meta: FrameMeta; frames: string[] } {
    const body = base32Encode(bytes);
    const total = Math.max(1, Math.ceil(body.length / CHUNK_SIZE));
    const id = makeSessionId();
    const crc = crc16(bytes);

    const frames: string[] = [];
    for (let i = 0; i < total; i++) {
        const chunk = body.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
        frames.push(
            `${FRAME_PREFIX}v=${FRAME_VERSION}&i=${i + 1}&n=${total}&c=${crc}&id=${id}&d=${chunk}`,
        );
    }
    return { meta: { id, total, crc }, frames };
}

/** 解析一段扫码文本；不是本协议的帧就返回 null（不抛，扫码器会一直喂进来） */
export function parseFrame(text: string): ParsedFrame | null {
    if (typeof text !== 'string' || !text.startsWith(FRAME_PREFIX)) return null;
    let qs: URLSearchParams;
    try {
        qs = new URLSearchParams(text.slice(FRAME_PREFIX.length));
    } catch {
        return null;
    }

    const version = Number(qs.get('v'));
    if (version !== FRAME_VERSION) return null;

    const idx = Number(qs.get('i'));
    const total = Number(qs.get('n'));
    const crc = Number(qs.get('c'));
    const id = qs.get('id') ?? '';
    const data = qs.get('d') ?? '';

    if (!Number.isInteger(idx) || !Number.isInteger(total)) return null;
    if (idx < 1 || total < 1 || idx > total || total > 99) return null;
    if (!Number.isInteger(crc) || crc < 0 || crc > 0xffff) return null;
    if (!data) return null;

    return { idx, total, crc, id, data };
}

/**
 * 尝试拼装。**只有收齐且 CRC 对得上**才返回字节，否则返回 null。
 * @param received 已收到的帧：帧号 → Base32 分片
 * @param total 总帧数
 * @param crc 整包 CRC16
 */
export function assembleFrames(
    received: Map<number, string>,
    total: number,
    crc: number,
): Uint8Array | null {
    if (received.size < total) return null;

    const parts: string[] = [];
    for (let i = 1; i <= total; i++) {
        const chunk = received.get(i);
        if (chunk === undefined) return null;
        parts.push(chunk);
    }

    const bytes = base32Decode(parts.join(''));
    if (!bytes) return null;
    if (crc16(bytes) !== crc) return null;
    return bytes;
}
