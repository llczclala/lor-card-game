/**
 * qr.ts —— 极简 QR 码编码器（**只为局域网配对服务**）
 * ============================================================================
 * 为什么自己写：项目里没有任何二维码库，`npm install` 与拉外网都不可行，
 *   而配对需要一个"扫一下就打通"的入口。
 *
 * 能力边界（刻意最小化，够用就跑）：
 *   · **仅 byte 模式**（ASCII 地址串；不做数字/字母数字/汉字/ECI）
 *   · **仅纠错等级 L**（容量最大，屏幕上显示本来就没有污损）
 *   · **仅版本 1~10**（版本 10-L 能放 274 字节；配对串只有几十字节，绰绰有余）
 *   · 自动选最小可容纳版本 + 自动选最优掩码（8 选 1，按标准罚分）
 *
 * 正确性怎么保证（**写完自证过**，见 `_scratch/qr-selftest.cjs`）：
 *   ① Reed-Solomon 部分：对"数据+纠错"整块算 **伴随式（syndrome）**，全 0 才算编码正确
 *   ② 结构：三个定位图形（finder）、时序图形（timing）、格式信息 BCH 反解回原值
 *   ③ 端到端：把编码结果渲染成 PNG 交给视觉模型读 —— **能读出原文才算真通**
 *
 * ⚠️ 想改成"支持字母数字模式省空间"或"加大版本"时，请一并更新自证脚本，
 *    否则等于在没有任何校验的情况下改一块纯数学代码（很容易错得很隐蔽）。
 */

// ══════════════════════════════════════════════════════════════════════════
// 规格表（版本 1~10 · 纠错等级 L）
// ══════════════════════════════════════════════════════════════════════════

/** 每版本的纠错块结构：`ec` = 每块纠错码字数，`blocks` = [块数, 每块数据码字数][] */
const ECC_L: ReadonlyArray<{ ec: number; blocks: ReadonlyArray<readonly [number, number]> }> = [
    { ec: 7, blocks: [[1, 19]] },            // v1
    { ec: 10, blocks: [[1, 34]] },           // v2
    { ec: 15, blocks: [[1, 55]] },           // v3
    { ec: 20, blocks: [[1, 80]] },           // v4
    { ec: 26, blocks: [[1, 108]] },          // v5
    { ec: 18, blocks: [[2, 68]] },           // v6
    { ec: 20, blocks: [[2, 78]] },           // v7
    { ec: 24, blocks: [[2, 97]] },           // v8
    { ec: 30, blocks: [[2, 116]] },          // v9
    { ec: 18, blocks: [[2, 68], [2, 69]] },  // v10
];

/** 校正图形（alignment pattern）中心坐标；v1 没有 */
const ALIGN_POS: ReadonlyArray<ReadonlyArray<number>> = [
    [], [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34],
    [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50],
];

/** 某版本的数据码字总容量 */
function dataCodewords(version: number): number {
    const spec = ECC_L[version - 1];
    return spec.blocks.reduce((sum, [count, len]) => sum + count * len, 0);
}

// ══════════════════════════════════════════════════════════════════════════
// GF(256) 与 Reed-Solomon
// ══════════════════════════════════════════════════════════════════════════

export const GF_EXP = new Uint8Array(512);
export const GF_LOG = new Uint8Array(256);
(() => {
    let x = 1;
    for (let i = 0; i < 255; i++) {
        GF_EXP[i] = x;
        GF_LOG[x] = i;
        x <<= 1;
        if (x & 0x100) x ^= 0x11d; // 本原多项式 x^8+x^4+x^3+x^2+1
    }
    for (let i = 255; i < 512; i++) GF_EXP[i] = GF_EXP[i - 255];
})();

export function gfMul(a: number, b: number): number {
    if (a === 0 || b === 0) return 0;
    return GF_EXP[GF_LOG[a] + GF_LOG[b]];
}

/** 生成多项式 ∏(x - α^i)，i = 0..degree-1（系数高次在前） */
function rsGenerator(degree: number): number[] {
    let poly = [1];
    for (let i = 0; i < degree; i++) {
        const next = new Array(poly.length + 1).fill(0);
        for (let j = 0; j < poly.length; j++) {
            next[j] ^= poly[j];
            next[j + 1] ^= gfMul(poly[j], GF_EXP[i]);
        }
        poly = next;
    }
    return poly;
}

/** 对一段数据算纠错码字（多项式除法取余） */
export function rsEncode(data: number[], ecCount: number): number[] {
    const gen = rsGenerator(ecCount);
    const rem = new Array(ecCount).fill(0);
    for (const byte of data) {
        const factor = byte ^ rem[0];
        rem.shift();
        rem.push(0);
        for (let i = 0; i < ecCount; i++) rem[i] ^= gfMul(gen[i + 1], factor);
    }
    return rem;
}

/**
 * 伴随式（syndrome）校验 —— **这是本文件最重要的自证手段**。
 * 一个码字块（数据+纠错）如果编码正确，则对 α^0…α^(ec-1) 求值全为 0。
 * @returns 全部为 0 表示该块编码正确
 */
export function rsSyndromes(block: number[], ecCount: number): number[] {
    const out: number[] = [];
    for (let i = 0; i < ecCount; i++) {
        let s = 0;
        for (const b of block) s = gfMul(s, GF_EXP[i]) ^ b;
        out.push(s);
    }
    return out;
}

// ══════════════════════════════════════════════════════════════════════════
// 位流
// ══════════════════════════════════════════════════════════════════════════

class BitBuffer {
    bits: number[] = [];
    put(value: number, len: number) {
        for (let i = len - 1; i >= 0; i--) this.bits.push((value >>> i) & 1);
    }
    get length() { return this.bits.length; }
}

/** 把文本编成"数据码字"（含填充） */
function buildDataCodewords(text: string, version: number): number[] {
    const bytes = Array.from(new TextEncoder().encode(text));
    const bb = new BitBuffer();
    bb.put(0b0100, 4);                       // 模式：byte
    bb.put(bytes.length, version <= 9 ? 8 : 16); // 字符计数
    for (const b of bytes) bb.put(b, 8);

    const capacity = dataCodewords(version) * 8;
    // 终止符最多 4 位
    bb.put(0, Math.min(4, capacity - bb.length));
    // 补到整字节
    while (bb.length % 8 !== 0) bb.bits.push(0);

    const codewords: number[] = [];
    for (let i = 0; i < bb.length; i += 8) {
        let v = 0;
        for (let j = 0; j < 8; j++) v = (v << 1) | (bb.bits[i + j] ?? 0);
        codewords.push(v);
    }
    // 交替填充字节 0xEC / 0x11
    let pad = 0;
    while (codewords.length < dataCodewords(version)) {
        codewords.push(pad % 2 === 0 ? 0xec : 0x11);
        pad++;
    }
    return codewords;
}

/** 分块 → 各自算纠错 → 按标准交织 */
function interleave(codewords: number[], version: number): number[] {
    const spec = ECC_L[version - 1];
    const dataBlocks: number[][] = [];
    let offset = 0;
    for (const [count, len] of spec.blocks) {
        for (let i = 0; i < count; i++) {
            dataBlocks.push(codewords.slice(offset, offset + len));
            offset += len;
        }
    }
    const ecBlocks = dataBlocks.map((b) => rsEncode(b, spec.ec));

    const out: number[] = [];
    const maxDataLen = Math.max(...dataBlocks.map((b) => b.length));
    for (let i = 0; i < maxDataLen; i++) {
        for (const b of dataBlocks) if (i < b.length) out.push(b[i]);
    }
    for (let i = 0; i < spec.ec; i++) {
        for (const b of ecBlocks) out.push(b[i]);
    }
    return out;
}

// ══════════════════════════════════════════════════════════════════════════
// 矩阵
// ══════════════════════════════════════════════════════════════════════════

type Grid = { size: number; modules: boolean[][]; reserved: boolean[][] };

function makeGrid(version: number): Grid {
    const size = 17 + version * 4;
    const modules = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
    const reserved = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
    return { size, modules, reserved };
}

function setModule(g: Grid, x: number, y: number, dark: boolean) {
    g.modules[y][x] = dark;
    g.reserved[y][x] = true;
}

/** 7×7 定位图形 + 分隔带 */
function placeFinder(g: Grid, cx: number, cy: number) {
    for (let dy = -1; dy <= 7; dy++) {
        for (let dx = -1; dx <= 7; dx++) {
            const x = cx + dx, y = cy + dy;
            if (x < 0 || y < 0 || x >= g.size || y >= g.size) continue;
            const inRing = (dx >= 0 && dx <= 6 && dy >= 0 && dy <= 6);
            const dark = inRing && (
                dx === 0 || dx === 6 || dy === 0 || dy === 6 ||   // 外框
                (dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4)        // 实心方块
            );
            setModule(g, x, y, dark);
        }
    }
}

/** 5×5 校正图形 */
function placeAlignment(g: Grid, cx: number, cy: number) {
    for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
            const dark = Math.max(Math.abs(dx), Math.abs(dy)) !== 1;
            setModule(g, cx + dx, cy + dy, dark);
        }
    }
}

function placeFunctionPatterns(g: Grid, version: number) {
    const size = g.size;
    // 三个定位图形（左上 / 右上 / 左下）
    placeFinder(g, 0, 0);
    placeFinder(g, size - 7, 0);
    placeFinder(g, 0, size - 7);

    // 时序图形
    for (let i = 8; i < size - 8; i++) {
        const dark = i % 2 === 0;
        setModule(g, i, 6, dark);
        setModule(g, 6, i, dark);
    }

    // 校正图形（跳过与定位图形重叠的）
    const pos = ALIGN_POS[version];
    for (const cy of pos) {
        for (const cx of pos) {
            const nearFinder =
                (cx === 6 && cy === 6) ||
                (cx === 6 && cy === size - 7) ||
                (cx === size - 7 && cy === 6);
            if (nearFinder) continue;
            placeAlignment(g, cx, cy);
        }
    }

    // 预留格式信息区（先用占位值填，最后统一覆盖）
    reserveFormatAreas(g);
    // 版本 ≥7 还要预留版本信息区
    if (version >= 7) reserveVersionAreas(g);
}

function reserveFormatAreas(g: Grid) {
    const size = g.size;
    for (let i = 0; i < 9; i++) {
        if (!g.reserved[8][i]) setModule(g, i, 8, false);
        if (!g.reserved[i][8]) setModule(g, 8, i, false);
    }
    for (let i = 0; i < 8; i++) {
        setModule(g, size - 1 - i, 8, false);
        setModule(g, 8, size - 1 - i, false);
    }
    // 固定的"暗模块"
    setModule(g, 8, size - 8, true);
}

function reserveVersionAreas(g: Grid) {
    const size = g.size;
    for (let i = 0; i < 6; i++) {
        for (let j = 0; j < 3; j++) {
            setModule(g, size - 11 + j, i, false);
            setModule(g, i, size - 11 + j, false);
        }
    }
}

/** 按标准之字形放置数据位 */
function placeData(g: Grid, codewords: number[]) {
    const size = g.size;
    const bits: number[] = [];
    for (const cw of codewords) for (let i = 7; i >= 0; i--) bits.push((cw >>> i) & 1);

    let bitIndex = 0;
    let upward = true;
    for (let right = size - 1; right >= 1; right -= 2) {
        if (right === 6) right = 5; // 跳过纵向时序列
        for (let vert = 0; vert < size; vert++) {
            const y = upward ? size - 1 - vert : vert;
            for (let k = 0; k < 2; k++) {
                const x = right - k;
                if (g.reserved[y][x]) continue;
                const bit = bitIndex < bits.length ? bits[bitIndex] === 1 : false;
                g.modules[y][x] = bit;
                bitIndex++;
            }
        }
        upward = !upward;
    }
}

const MASKS: ReadonlyArray<(x: number, y: number) => boolean> = [
    (x, y) => (x + y) % 2 === 0,
    (_x, y) => y % 2 === 0,
    (x, _y) => x % 3 === 0,
    (x, y) => (x + y) % 3 === 0,
    (x, y) => (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0,
    (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
    (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
    (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];

function applyMask(g: Grid, mask: number): Grid {
    const out: Grid = {
        size: g.size,
        modules: g.modules.map((row) => [...row]),
        reserved: g.reserved.map((row) => [...row]),
    };
    const fn = MASKS[mask];
    for (let y = 0; y < g.size; y++) {
        for (let x = 0; x < g.size; x++) {
            if (out.reserved[y][x]) continue;
            if (fn(x, y)) out.modules[y][x] = !out.modules[y][x];
        }
    }
    return out;
}

/**
 * BCH 位串 + 掩码（格式信息固定 XOR 0x5412）。
 * 与 `qrDecode.ts` 的格式信息最近邻匹配共用 —— 两端必须用同一个函数，别各写一份。
 * @param mask 掩码号 0~7
 * @param ecc  纠错等级位（L=0b01 / M=0b00 / Q=0b11 / H=0b10），本文件只产出 L
 */
export function formatBits(mask: number, ecc = 0b01): number {
    const eccBits = ecc & 0b11;
    const data = (eccBits << 3) | mask;
    let rem = data;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    return ((data << 10) | rem) ^ 0x5412;
}

function writeFormatInfo(g: Grid, mask: number) {
    const bits = formatBits(mask);
    const size = g.size;
    const bit = (i: number) => ((bits >>> i) & 1) === 1;

    // 左上角一份
    for (let i = 0; i <= 5; i++) setModule(g, 8, i, bit(i));
    setModule(g, 8, 7, bit(6));
    setModule(g, 8, 8, bit(7));
    setModule(g, 7, 8, bit(8));
    for (let i = 9; i <= 14; i++) setModule(g, 14 - i, 8, bit(i));

    // 右上 / 左下另一份
    for (let i = 0; i <= 7; i++) setModule(g, size - 1 - i, 8, bit(i));
    for (let i = 8; i <= 14; i++) setModule(g, 8, size - 15 + i, bit(i));

    setModule(g, 8, size - 8, true); // 暗模块
}

/** 版本信息（仅 v≥7） */
function writeVersionInfo(g: Grid, version: number) {
    if (version < 7) return;
    let rem = version;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    const bits = (version << 12) | rem;
    for (let i = 0; i < 18; i++) {
        const dark = ((bits >>> i) & 1) === 1;
        const a = Math.floor(i / 3);
        const b = i % 3;
        setModule(g, g.size - 11 + b, a, dark);
        setModule(g, a, g.size - 11 + b, dark);
    }
}

/** 标准罚分（用于选最优掩码） */
function penalty(g: Grid): number {
    const n = g.size;
    const m = g.modules;
    let score = 0;

    // 规则1：同色连续 ≥5
    const runScore = (get: (i: number, j: number) => boolean) => {
        for (let i = 0; i < n; i++) {
            let run = 1;
            for (let j = 1; j < n; j++) {
                if (get(i, j) === get(i, j - 1)) {
                    run++;
                } else {
                    if (run >= 5) score += 3 + (run - 5);
                    run = 1;
                }
            }
            if (run >= 5) score += 3 + (run - 5);
        }
    };
    runScore((i, j) => m[i][j]);
    runScore((i, j) => m[j][i]);

    // 规则2：2×2 同色块
    for (let y = 0; y < n - 1; y++) {
        for (let x = 0; x < n - 1; x++) {
            const v = m[y][x];
            if (v === m[y][x + 1] && v === m[y + 1][x] && v === m[y + 1][x + 1]) score += 3;
        }
    }

    // 规则3：1:1:3:1:1 类定位图形
    const patterns = [
        [true, false, true, true, true, false, true, false, false, false, false],
        [false, false, false, false, true, false, true, true, true, false, true],
    ];
    for (let i = 0; i < n; i++) {
        for (let j = 0; j + 11 <= n; j++) {
            for (const p of patterns) {
                let okRow = true, okCol = true;
                for (let k = 0; k < 11; k++) {
                    if (m[i][j + k] !== p[k]) okRow = false;
                    if (m[j + k][i] !== p[k]) okCol = false;
                }
                if (okRow) score += 40;
                if (okCol) score += 40;
            }
        }
    }

    // 规则4：暗色占比偏离 50%
    let dark = 0;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (m[y][x]) dark++;
    const percent = (dark * 100) / (n * n);
    score += Math.floor(Math.abs(percent - 50) / 5) * 10;

    return score;
}

// ══════════════════════════════════════════════════════════════════════════
// 对外接口
// ══════════════════════════════════════════════════════════════════════════

export interface QrCode {
    version: number;
    size: number;
    /** `modules[y][x] === true` 表示深色 */
    modules: boolean[][];
    /** 实际用的掩码（0~7），便于自证 */
    mask: number;
    /** 交织后的完整码字（数据 + 纠错），便于自证 */
    codewords: number[];
    /** 分块信息，便于自证 */
    blockStructure: ReadonlyArray<readonly [number, number]>;
    ecPerBlock: number;
}

/**
 * 把文本编成二维码矩阵。
 * @throws 文本过长（超出版本 10-L 的容量）或文本含非 ASCII 字符
 */
export function encodeQr(text: string): QrCode {
    const bytes = new TextEncoder().encode(text);
    for (const b of bytes) {
        if (b > 0xff) throw new Error('二维码仅支持单字节字符（ASCII/Latin-1）');
    }

    // 选最小可容纳版本
    let version = 1;
    const headerBits = (v: number) => 4 + (v <= 9 ? 8 : 16);
    for (; version <= ECC_L.length; version++) {
        if (headerBits(version) + bytes.length * 8 <= dataCodewords(version) * 8) break;
    }
    if (version > ECC_L.length) throw new Error(`文本太长（${bytes.length} 字节），超出 v${ECC_L.length}-L 容量`);

    const dataCw = buildDataCodewords(text, version);
    const codewords = interleave(dataCw, version);

    let best: { grid: Grid; mask: number; score: number } | null = null;
    for (let mask = 0; mask < 8; mask++) {
        const g = makeGrid(version);
        placeFunctionPatterns(g, version);
        placeData(g, codewords);
        const masked = applyMask(g, mask);
        writeFormatInfo(masked, mask);
        writeVersionInfo(masked, version);
        const score = penalty(masked);
        if (!best || score < best.score) best = { grid: masked, mask, score };
    }

    const spec = ECC_L[version - 1];
    return {
        version,
        size: best!.grid.size,
        modules: best!.grid.modules,
        mask: best!.mask,
        codewords,
        blockStructure: spec.blocks,
        ecPerBlock: spec.ec,
    };
}

/**
 * 把二维码渲染成 SVG 的 `path`（深色模块合并成一个 path，体积小）。
 * 用法：`<svg viewBox={`0 0 ${qr.size} ${qr.size}`}><path d={qrToSvgPath(qr)} fill="#000"/></svg>`
 */
export function qrToSvgPath(qr: QrCode): string {
    const parts: string[] = [];
    for (let y = 0; y < qr.size; y++) {
        let x = 0;
        while (x < qr.size) {
            if (!qr.modules[y][x]) { x++; continue; }
            let run = 1;
            while (x + run < qr.size && qr.modules[y][x + run]) run++;
            parts.push(`M${x} ${y}h${run}v1h-${run}z`);
            x += run;
        }
    }
    return parts.join('');
}
