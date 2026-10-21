/**
 * qrDecode.ts —— 极简 QR 解码器（只为解**我们自己发的**配对码）
 * ============================================================================
 * 为什么自己写：项目没有解码库，`npm install` 与外网拉取都不可行；
 *   而"游戏内自带扫码"必须有它（系统相机对自定义 scheme 的支持在国产 ROM 上不一致）。
 *
 * 能力边界（刻意最小化）：
 *   · 只解 **byte 模式 + 纠错等级 L + 版本 1~10** —— 也就是 `qr.ts` 能编出来的那些
 *   · ✅ **做 Reed-Solomon 纠错译码**（BM + Chien + Forney，见本节 `rsCorrect`）：
 *     每块能纠 t = floor(ec/2) 个错码字。纠完必然重新验伴随式，纠不动就显式报错。
 *   · 支持旋转/轻微倾斜（用三个定位图形解仿射变换），不支持强透视畸变
 *     （手机正对着屏幕拍就行；斜拍会解不出，届时提示重拍）
 *   · 定位图形候选**不只赌一组**：按几何打分取前几名，各自试 6 种角序
 *
 * 📌 2026-10-21 实测反馈后重做容错层（"举了 26 秒 / 790 次尝试才成功 1 次"）：
 *   原版对格式信息和码字都是**零容错**（错 1 位/1 个码字就整张作废），
 *   导致"每一帧都差一点点"。本文件现在有三层容错：
 *     ① 格式信息：两份副本都读 + 与 8 个合法码字做最近邻（容 3 位错）
 *     ② 码字：RS 纠错译码
 *     ③ 定位：多组三点候选回退
 *
 * 正确性自证：`_scratch/qr-roundtrip.mjs` —— 用 `qr.ts` 编码 → 光栅化成位图（多种缩放/偏移/旋转，
 *   以及**故意注入 N 个错模块**）→ 本解码器还原 → 必须与原文逐字相同。
 */

import { GF_EXP, GF_LOG, formatBits, gfMul, rsSyndromes } from './qr';

/** 灰度位图（0=黑，255=白） */
export interface GrayImage {
    width: number;
    height: number;
    /** 长度 = width * height */
    gray: Uint8Array;
}

/** 二值图：`true` = 深色模块 */
interface Bitmap {
    width: number;
    height: number;
    dark: Uint8Array;
}

export class QrDecodeError extends Error { }

/**
 * 诊断用：把"找到的定位图形候选"原样吐出来（`_scratch/qr-roundtrip.mjs` 用）。
 * 生产代码不依赖它，但排查解码失败时它是最快的入口。
 */
export function debugFinders(img: GrayImage): Array<{ x: number; y: number; module: number }> {
    return findFinders(binarize(img));
}

// ══════════════════════════════════════════════════════════════════════════
// 输入转换
// ══════════════════════════════════════════════════════════════════════════

/** 从 canvas 的 RGBA 数据转灰度 */
export function rgbaToGray(data: Uint8ClampedArray, width: number, height: number): GrayImage {
    const gray = new Uint8Array(width * height);
    for (let i = 0, p = 0; i < gray.length; i++, p += 4) {
        // 亮度权重（BT.601），四舍五入
        gray[i] = (data[p] * 0.299 + data[p + 1] * 0.587 + data[p + 2] * 0.114) | 0;
    }
    return { width, height, gray };
}

/** Otsu 全局阈值二值化（屏幕拍照足够用） */
function binarizeOtsu(img: GrayImage): Bitmap {
    const hist = new Uint32Array(256);
    for (const v of img.gray) hist[v]++;
    const total = img.gray.length;

    let sum = 0;
    for (let i = 0; i < 256; i++) sum += i * hist[i];

    let sumB = 0, wB = 0, best = -1, threshold = 127;
    for (let t = 0; t < 256; t++) {
        wB += hist[t];
        if (wB === 0) continue;
        const wF = total - wB;
        if (wF === 0) break;
        sumB += t * hist[t];
        const mB = sumB / wB;
        const mF = (sum - sumB) / wF;
        const between = wB * wF * (mB - mF) * (mB - mF);
        if (between > best) { best = between; threshold = t; }
    }

    const dark = new Uint8Array(total);
    for (let i = 0; i < total; i++) dark[i] = img.gray[i] <= threshold ? 1 : 0;
    return { width: img.width, height: img.height, dark };
}

/**
 * 自适应阈值（局部均值）二值化 —— 给**真实相机画面**用。
 *
 * 为什么需要它：Otsu 是**全局**阈值，真实拍摄里屏幕反光 / 阴影 / 侧光会让同一张图
 * 一部分过曝、一部分过暗 ⇒ 全局单一阈值必然把某一边切坏。
 * 局部均值（用积分图做到 O(N)）对光照不均要稳得多。
 *
 * @param k 阈值系数（<1 表示"比局部均值暗这么多才算黑"，0.86 是常用经验值）
 */
function binarizeAdaptive(img: GrayImage, block = 32, k = 0.86): Bitmap {
    const { width: w, height: h, gray } = img;
    // 积分图（多一行一列，方便算块和）
    const integral = new Uint32Array((w + 1) * (h + 1));
    for (let y = 0; y < h; y++) {
        let rowSum = 0;
        for (let x = 0; x < w; x++) {
            rowSum += gray[y * w + x];
            integral[(y + 1) * (w + 1) + (x + 1)] = integral[y * (w + 1) + (x + 1)] + rowSum;
        }
    }
    const half = Math.max(4, block >> 1);
    const dark = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
        const y0 = Math.max(0, y - half), y1 = Math.min(h - 1, y + half);
        for (let x = 0; x < w; x++) {
            const x0 = Math.max(0, x - half), x1 = Math.min(w - 1, x + half);
            const area = (x1 - x0 + 1) * (y1 - y0 + 1);
            const sum =
                integral[(y1 + 1) * (w + 1) + (x1 + 1)]
                - integral[y0 * (w + 1) + (x1 + 1)]
                - integral[(y1 + 1) * (w + 1) + x0]
                + integral[y0 * (w + 1) + x0];
            const mean = sum / area;
            dark[y * w + x] = gray[y * w + x] < mean * k ? 1 : 0;
        }
    }
    return { width: w, height: h, dark };
}

/** 兼容旧名字：默认用 Otsu */
function binarize(img: GrayImage): Bitmap {
    return binarizeOtsu(img);
}

// ══════════════════════════════════════════════════════════════════════════
// 找定位图形（1:1:3:1:1 的黑白黑黑白比例）
// ══════════════════════════════════════════════════════════════════════════

interface Finder { x: number; y: number; module: number }

function ratioOK(runs: number[]): boolean {
    // runs = [黑, 白, 黑, 白, 黑]
    const total = runs.reduce((a, b) => a + b, 0);
    if (total < 7) return false;
    const m = total / 7;
    const tol = m * 0.8;
    return Math.abs(runs[0] - m) < tol
        && Math.abs(runs[1] - m) < tol
        && Math.abs(runs[2] - 3 * m) < 3 * tol
        && Math.abs(runs[3] - m) < tol
        && Math.abs(runs[4] - m) < tol;
}

/** 沿一行扫描候选中心 */
function scanRow(bm: Bitmap, y: number): Array<{ x: number; module: number }> {
    const out: Array<{ x: number; module: number }> = [];
    const row = y * bm.width;
    let runs: number[] = [];
    let last = bm.dark[row];
    let len = 0;
    const flush = (endX: number) => {
        // 只保留最后 5 段；且必须"黑-白-黑-白-黑"
        if (runs.length >= 5) {
            const five = runs.slice(-5);
            if (ratioOK(five)) {
                const m = five.reduce((a, b) => a + b, 0) / 7;
                const center = endX - five[4] - five[3] - five[2] / 2;
                out.push({ x: center, module: m });
            }
        }
    };
    for (let x = 0; x < bm.width; x++) {
        const v = bm.dark[row + x];
        if (v === last) { len++; continue; }
        runs.push(len);
        flush(x);
        last = v;
        len = 1;
    }
    runs.push(len);
    flush(bm.width);
    return out;
}

/** 沿一列验证（拿到更准的 y 与 module） */
function verifyColumn(bm: Bitmap, cx: number, approxY: number): Finder | null {
    const x = Math.round(cx);
    if (x < 0 || x >= bm.width) return null;

    /** 每次匹配到的候选（各自带自己的 module 估计，别拿整列的） */
    const hits: Array<{ y: number; module: number }> = [];
    let runs: number[] = [];
    let last = bm.dark[Math.round(approxY) * bm.width + x];
    let len = 0;

    const consider = (endY: number) => {
        if (runs.length < 5) return;
        const five = runs.slice(-5);
        if (!ratioOK(five)) return;
        const m = five.reduce((a, b) => a + b, 0) / 7;
        hits.push({ y: endY - five[4] - five[3] - five[2] / 2, module: m });
    };

    for (let y = 0; y < bm.height; y++) {
        const v = bm.dark[y * bm.width + x];
        if (v === last) { len++; continue; }
        runs.push(len);
        consider(y);
        last = v;
        len = 1;
    }
    runs.push(len);
    consider(bm.height);

    if (hits.length === 0) return null;
    let best = hits[0];
    for (const h of hits) if (Math.abs(h.y - approxY) < Math.abs(best.y - approxY)) best = h;
    return { x, y: best.y, module: best.module };
}

function dedupe(list: Finder[]): Finder[] {
    const out: Finder[] = [];
    for (const f of list) {
        const hit = out.find((o) => Math.abs(o.x - f.x) < f.module * 3 && Math.abs(o.y - f.y) < f.module * 3);
        if (!hit) out.push(f);
    }
    return out;
}

function findFinders(bm: Bitmap): Finder[] {
    const raw: Finder[] = [];
    // 隔行扫，足够找到且更快
    for (let y = 0; y < bm.height; y++) {
        for (const c of scanRow(bm, y)) {
            const v = verifyColumn(bm, c.x, y);
            if (v) raw.push(v);
        }
    }
    return dedupe(raw);
}

/**
 * 从候选里挑出"最像真的"若干组三个定位图形，**按分数从好到差返回**。
 *
 * 🔴 为什么不能"按 module 取前三个"：数据区里偶然出现的 1:1:3:1:1 也会被误认，
 *    而且它们的 module 估计**往往比真定位图形更大**（实测：真的是 6.00，
 *    误命中是 8.6~10.3）⇒ 按大小排序只会精准地选中垃圾。
 *
 * 正解：按**几何形状**挑 —— 真定位图形构成一个**等腰直角三角形**
 *   （两条直角边 = (size-7)×module 且相等，斜边 ≈ √2 倍，且三者 module 接近）。
 *
 * 📌 2026-10-21 起不再"只赌一组"：取景里常有几十个误命中（实测一次看到 32 个），
 *    只取最像的一组、选错就整帧报废。现在返回前 `limit` 组，由调用方逐组尝试。
 */
function rankFinderTriples(
    list: Finder[],
    limit = 4,
): Array<{ tl: Finder; a: Finder; b: Finder; score: number }> {
    const cands = list.slice(0, 40); // 候选上限，C(40,3)=9880，可接受
    // 候选里最远的一对距离 —— 用来给"更大的三角形"加分（真定位图形一定跨得最开）
    let maxDist = 1;
    for (let i = 0; i < cands.length; i++) {
        for (let j = i + 1; j < cands.length; j++) {
            maxDist = Math.max(maxDist, dist(cands[i], cands[j]));
        }
    }

    const found: Array<{ tl: Finder; a: Finder; b: Finder; score: number }> = [];

    for (let i = 0; i < cands.length; i++) {
        for (let j = i + 1; j < cands.length; j++) {
            for (let k = j + 1; k < cands.length; k++) {
                const p = [cands[i], cands[j], cands[k]];
                const edges = [
                    { a: 0, b: 1, d: dist(p[0], p[1]) },
                    { a: 1, b: 2, d: dist(p[1], p[2]) },
                    { a: 0, b: 2, d: dist(p[0], p[2]) },
                ].sort((x, y) => y.d - x.d);
                const [hyp, s1, s2] = edges;
                if (s1.d < 2 || s2.d < 2) continue;

                const legRatio = Math.abs(s1.d - s2.d) / Math.max(s1.d, s2.d);
                if (legRatio > 0.3) continue;                      // 两条直角边要差不多长

                const expectHyp = Math.hypot(s1.d, s2.d);
                const hypErr = Math.abs(hyp.d - expectHyp) / expectHyp;
                if (hypErr > 0.15) continue;                       // 必须接近直角

                const mods = p.map((f) => f.module);
                const mMax = Math.max(...mods), mMin = Math.min(...mods);
                if (mMin <= 0 || mMax / mMin > 1.35) continue;      // 三者 module 要**很**接近

                const tlIdx = [0, 1, 2].find((idx) => idx !== hyp.a && idx !== hyp.b)!;
                // 形状越正、module 越一致、三角形越大 ⇒ 越像真的
                const score = legRatio + hypErr * 2 + (mMax / mMin - 1) - 0.6 * (hyp.d / maxDist);
                found.push({ score, tl: p[tlIdx], a: p[hyp.a], b: p[hyp.b] });
            }
        }
    }

    found.sort((x, y) => x.score - y.score);
    return found.slice(0, limit);
}

// ══════════════════════════════════════════════════════════════════════════
// 从三个定位图形解出采样网格
// ══════════════════════════════════════════════════════════════════════════

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) =>
    Math.hypot(a.x - b.x, a.y - b.y);

/** 版本 → 边长 */
const sizeOfVersion = (v: number) => 17 + 4 * v;

function sampleGrid(
    bm: Bitmap,
    tl: Finder, tr: Finder, bl: Finder,
    size: number,
): boolean[][] {
    // 仿射：P(c, r) = TL + (c-3)·vx + (r-3)·vy  （定位图形中心在模块 (3,3)）
    const span = size - 7;
    const vx = { x: (tr.x - tl.x) / span, y: (tr.y - tl.y) / span };
    const vy = { x: (bl.x - tl.x) / span, y: (bl.y - tl.y) / span };

    const readAt = (px: number, py: number): number => {
        const x = Math.round(px), y = Math.round(py);
        if (x < 0 || y < 0 || x >= bm.width || y >= bm.height) return 0;
        return bm.dark[y * bm.width + x];
    };

    const out: boolean[][] = [];
    for (let r = 0; r < size; r++) {
        const row: boolean[] = [];
        for (let c = 0; c < size; c++) {
            const cx = tl.x + (c - 3) * vx.x + (r - 3) * vy.x;
            const cy = tl.y + (c - 3) * vx.y + (r - 3) * vy.y;

            // 🔴 5 点多数表决（中心 + 沿两个模块轴向各 ±1/4 模块）。
            //    只取中心一个点在大版本/轻微模糊时容易采到边界像素 —— 实测 v8 就会零星读错。
            let votes = readAt(cx, cy);
            votes += readAt(cx + 0.25 * vx.x, cy + 0.25 * vx.y);
            votes += readAt(cx - 0.25 * vx.x, cy - 0.25 * vx.y);
            votes += readAt(cx + 0.25 * vy.x, cy + 0.25 * vy.y);
            votes += readAt(cx - 0.25 * vy.x, cy - 0.25 * vy.y);

            row.push(votes >= 3);
        }
        out.push(row);
    }
    return out;
}

// ══════════════════════════════════════════════════════════════════════════
// 从矩阵读回码字
// ══════════════════════════════════════════════════════════════════════════

/** 与编码器同构的"功能图形占据"地图（导出只为自证脚本能挑"数据区模块"来注入错误） */
export function buildReserved(size: number, version: number): boolean[][] {
    const used = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
    const mark = (x: number, y: number) => { if (x >= 0 && y >= 0 && x < size && y < size) used[y][x] = true; };

    for (const [ox, oy] of [[0, 0], [size - 7, 0], [0, size - 7]] as const) {
        for (let dy = -1; dy <= 7; dy++) for (let dx = -1; dx <= 7; dx++) mark(ox + dx, oy + dy);
    }
    for (let i = 8; i < size - 8; i++) { used[6][i] = true; used[i][6] = true; }
    for (let i = 0; i < 9; i++) { mark(i, 8); mark(8, i); }
    for (let i = 0; i < 8; i++) { mark(size - 1 - i, 8); mark(8, size - 1 - i); }

    const ALIGN: ReadonlyArray<ReadonlyArray<number>> = [
        [], [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34],
        [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50],
    ];
    const pos = ALIGN[version] ?? [];
    for (const cy of pos) {
        for (const cx of pos) {
            const nearFinder =
                (cx === 6 && cy === 6) ||
                (cx === 6 && cy === size - 7) ||
                (cx === size - 7 && cy === 6);
            if (nearFinder) continue;
            for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) mark(cx + dx, cy + dy);
        }
    }
    if (version >= 7) {
        for (let i = 0; i < 6; i++) for (let j = 0; j < 3; j++) { mark(size - 11 + j, i); mark(i, size - 11 + j); }
    }
    return used;
}

const MASK_FNS: ReadonlyArray<(x: number, y: number) => boolean> = [
    (x, y) => (x + y) % 2 === 0,
    (_x, y) => y % 2 === 0,
    (x, _y) => x % 3 === 0,
    (x, y) => (x + y) % 3 === 0,
    (x, y) => (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0,
    (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
    (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
    (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];

/**
 * 本解码器只产出**纠错等级 L**（0b01），所以格式信息只需在这 8 个合法码字里找最近的。
 * （格式信息的 BCH 码最小汉明距离是 7 ⇒ 最多容 3 位错）
 */
const FORMAT_L_WORDS: ReadonlyArray<{ word: number; mask: number }> =
    Array.from({ length: 8 }, (_, mask) => ({ word: formatBits(mask, 0b01), mask }));

/** 弹出计数（只用于比 15 位格式信息） */
function popcount(v: number): number {
    let c = 0;
    while (v) { c += v & 1; v >>>= 1; }
    return c;
}

/** 格式信息副本 A（左上，绕定位图形）：i → 模块 (x, y) */
const FORMAT_SEQ_A: ReadonlyArray<readonly [number, number]> = [
    [8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], [8, 7], [8, 8],
    [7, 8], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8],
];

/** 格式信息副本 B（右上 + 左下）：i → 模块 (x, y) */
function formatSeqB(size: number): Array<readonly [number, number]> {
    const seq: Array<readonly [number, number]> = [];
    for (let i = 0; i <= 7; i++) seq.push([size - 1 - i, 8]);
    for (let i = 8; i <= 14; i++) seq.push([8, size - 15 + i]);
    return seq;
}

function readFormatBits(
    modules: boolean[][],
    size: number,
    seq: ReadonlyArray<readonly [number, number]>,
): number {
    let bits = 0;
    for (let i = 0; i < 15; i++) {
        const pos = seq[i];
        if (!pos) continue;
        const [x, y] = pos;
        if (x >= 0 && y >= 0 && x < size && y < size && modules[y][x]) bits |= 1 << i;
    }
    return bits;
}

/**
 * 读格式信息 —— **两份副本都读 + 与 8 个合法码字做最近邻**（容 3 位错）。
 *
 * 🔴 这是"举了 26 秒才扫到"的两大元凶之一：
 *    旧实现只读左上那份、且 `ecc !== 1` 就直接放弃 ⇒ 15 位里错 1 位就报
 *    「格式信息读不出」。标准实现本来就允许纠 3 位，不纠等于白扔。
 *
 * @returns `null` = 两份都错得离谱（>3 位）；否则给出掩码与纠正的位数
 */
function readFormat(modules: boolean[][], size: number): { mask: number; errors: number } | null {
    let best: { mask: number; errors: number } | null = null;
    for (const seq of [FORMAT_SEQ_A, formatSeqB(size)]) {
        const raw = readFormatBits(modules, size, seq);
        for (const cand of FORMAT_L_WORDS) {
            const d = popcount(raw ^ cand.word);
            if (!best || d < best.errors) best = { mask: cand.mask, errors: d };
        }
    }
    if (!best || best.errors > 3) return null;
    return best;
}

/** 之字形读回码字（跳过功能图形区 + 解掩码） */
function readCodewords(
    modules: boolean[][],
    size: number,
    mask: number,
    reserved: boolean[][],
): number[] {
    const isMasked = MASK_FNS[mask];
    const bits: number[] = [];
    let upward = true;
    for (let right = size - 1; right >= 1; right -= 2) {
        if (right === 6) right = 5;
        for (let vert = 0; vert < size; vert++) {
            const y = upward ? size - 1 - vert : vert;
            for (let k = 0; k < 2; k++) {
                const x = right - k;
                if (reserved[y][x]) continue;   // 🔴 功能图形不承载数据，必须跳过
                let v = modules[y][x];
                if (isMasked(x, y)) v = !v;     // 解掩码
                bits.push(v ? 1 : 0);
            }
        }
        upward = !upward;
    }
    const cw: number[] = [];
    for (let i = 0; i + 8 <= bits.length; i += 8) {  // 末尾不足 8 位的"剩余位"直接丢弃
        let v = 0;
        for (let j = 0; j < 8; j++) v = (v << 1) | bits[i + j];
        cw.push(v);
    }
    return cw;
}

// ══════════════════════════════════════════════════════════════════════════
// 分块 / 校验 / 解析
// ══════════════════════════════════════════════════════════════════════════

const ECC_L: ReadonlyArray<{ ec: number; blocks: ReadonlyArray<readonly [number, number]> }> = [
    { ec: 7, blocks: [[1, 19]] }, { ec: 10, blocks: [[1, 34]] }, { ec: 15, blocks: [[1, 55]] },
    { ec: 20, blocks: [[1, 80]] }, { ec: 26, blocks: [[1, 108]] }, { ec: 18, blocks: [[2, 68]] },
    { ec: 20, blocks: [[2, 78]] }, { ec: 24, blocks: [[2, 97]] }, { ec: 30, blocks: [[2, 116]] },
    { ec: 18, blocks: [[2, 68], [2, 69]] },
];

function totalCodewords(version: number): number {
    const s = ECC_L[version - 1];
    let data = 0;
    for (const [n, len] of s.blocks) data += n * len;
    const blocks = s.blocks.reduce((a, [n]) => a + n, 0);
    return data + blocks * s.ec;
}

// ══════════════════════════════════════════════════════════════════════════
// Reed-Solomon 纠错译码（Berlekamp-Massey + Chien + Forney）
// ══════════════════════════════════════════════════════════════════════════
//
// 🔴 为什么必须加（2026-10-21 实测）：原版只校验"伴随式全 0"，
//    等于要求**一个码字都不许错**。手机拍屏幕时每帧都会错几个模块，
//    于是手举 26 秒、解约 790 次才碰上唯一一次完美帧。
//    纠错等级 L 本来就是拿来纠错的，不译码等于白扔。
//
// 约定：本节的多项式一律**升幂**（下标 i = x^i 的系数），只在本节内部使用。

const gfInv = (a: number): number => GF_EXP[255 - GF_LOG[a]];

/** 升幂多项式求值 */
function polyEvalAsc(p: number[], x: number): number {
    let y = 0;
    for (let i = p.length - 1; i >= 0; i--) y = gfMul(y, x) ^ p[i];
    return y;
}

/** 升幂多项式相加（GF(2) 上即逐项异或） */
function polyAddAsc(a: number[], b: number[]): number[] {
    const n = Math.max(a.length, b.length);
    const out = new Array<number>(n).fill(0);
    for (let i = 0; i < n; i++) out[i] = (a[i] ?? 0) ^ (b[i] ?? 0);
    while (out.length > 1 && out[out.length - 1] === 0) out.pop();
    return out;
}

/** 升幂多项式相乘 */
function polyMulAsc(a: number[], b: number[]): number[] {
    const out = new Array<number>(a.length + b.length - 1).fill(0);
    for (let i = 0; i < a.length; i++) {
        if (a[i] === 0) continue;
        for (let j = 0; j < b.length; j++) out[i + j] ^= gfMul(a[i], b[j]);
    }
    return out;
}

/** b(x) · f · x^shift（升幂） */
function polyShiftScaleAsc(b: number[], shift: number, f: number): number[] {
    const out = new Array<number>(b.length + shift).fill(0);
    for (let i = 0; i < b.length; i++) out[i + shift] = gfMul(b[i], f);
    return out;
}

/** 形式导数（GF(2) 上偶次项求导归零） */
function polyDerivAsc(p: number[]): number[] {
    const out: number[] = [];
    for (let i = 1; i < p.length; i++) out.push(i % 2 === 1 ? p[i] : 0);
    return out.length ? out : [0];
}

/**
 * Berlekamp-Massey：由伴随式序列求错误定位多项式 Λ(x)（升幂，Λ(0)=1）。
 * 返回值的次数 = 估计的错误码字数。
 */
function berlekampMassey(synd: number[]): number[] {
    let C: number[] = [1];
    let B: number[] = [1];
    let L = 0;
    let m = 1;
    let b = 1;

    for (let n = 0; n < synd.length; n++) {
        let d = synd[n];
        for (let i = 1; i <= L; i++) d ^= gfMul(C[i] ?? 0, synd[n - i] ?? 0);

        if (d === 0) { m++; continue; }

        const coef = gfMul(d, gfInv(b));
        const T = C.slice();
        C = polyAddAsc(C, polyShiftScaleAsc(B, m, coef));

        if (2 * L <= n) {
            L = n + 1 - L;
            B = T;
            b = d;
            m = 1;
        } else {
            m++;
        }
    }
    return C;
}

/**
 * 纠错：返回**改正后**的整块（数据 + 纠错码字，顺序不变）。
 * 纠不动（错太多 / 译码异常）一律抛错 —— 宁可不给结果，也不吐可能错误的数据。
 */
export function rsCorrect(block: number[], ecCount: number): number[] {
    const synd = rsSyndromes(block, ecCount);
    if (synd.every((s) => s === 0)) return block.slice();   // 干净，直接返回

    const lambda = berlekampMassey(synd);
    const deg = lambda.length - 1;
    const n = block.length;
    // 能纠 t = floor(ec/2) 个；deg 超了说明错太多，别硬纠
    if (deg === 0 || deg * 2 > ecCount) throw new QrDecodeError('码字错得太多，纠不回来（请靠近、稳住、避开反光）');

    // Chien 搜索：下标 j 对应 x = α^(n-1-j)，根条件是 Λ(x^-1) = 0
    const errPos: number[] = [];
    for (let j = 0; j < n; j++) {
        const x = GF_EXP[(n - 1 - j) % 255];
        if (polyEvalAsc(lambda, gfInv(x)) === 0) errPos.push(j);
    }
    if (errPos.length !== deg) throw new QrDecodeError('错误位置定位失败，纠不回来（请重拍）');

    // Ω(x) = S(x)·Λ(x) mod x^ec
    const omega = polyMulAsc(synd, lambda).slice(0, ecCount);
    const dLambda = polyDerivAsc(lambda);

    const out = block.slice();
    for (const j of errPos) {
        const x = GF_EXP[(n - 1 - j) % 255];
        const xi = gfInv(x);
        const den = polyEvalAsc(dLambda, xi);
        if (den === 0) throw new QrDecodeError('错误数值求解失败，纠不回来（请重拍）');
        // 生成元从 α^0 起（b=0）⇒ Forney: e = x · Ω(x^-1) / Λ'(x^-1)
        out[j] ^= gfMul(x, gfMul(polyEvalAsc(omega, xi), gfInv(den)));
    }

    // 🔒 兜底自检：纠正后伴随式必须全 0 —— 数学有误会在这里被挡住，不会污染数据
    if (rsSyndromes(out, ecCount).some((s) => s !== 0)) {
        throw new QrDecodeError('纠错后校验仍不通过（画面太差，请重拍）');
    }
    return out;
}

/** 解交织回各块 → 逐块 RS 纠错 → 按顺序拼回数据码字 */
function deinterleaveAndCorrect(cw: number[], version: number): number[] {
    const spec = ECC_L[version - 1];
    const lens: number[] = [];
    for (const [n, len] of spec.blocks) for (let i = 0; i < n; i++) lens.push(len);

    const dataBlocks = lens.map((len) => new Array<number>(len).fill(0));
    let p = 0;
    const maxLen = Math.max(...lens);
    for (let col = 0; col < maxLen; col++) {
        for (let b = 0; b < dataBlocks.length; b++) {
            if (col < lens[b]) {
                if (p >= cw.length) throw new QrDecodeError('数据不够（可能拍坏了）');
                dataBlocks[b][col] = cw[p++];
            }
        }
    }
    const ecBlocks = lens.map(() => new Array<number>(spec.ec).fill(0));
    for (let col = 0; col < spec.ec; col++) {
        for (let b = 0; b < dataBlocks.length; b++) {
            if (p >= cw.length) throw new QrDecodeError('纠错码字不够（可能拍坏了）');
            ecBlocks[b][col] = cw[p++];
        }
    }

    // ✅ 逐块纠错（不是只校验）—— 每块能纠 floor(ec/2) 个错码字
    const out: number[] = [];
    for (let b = 0; b < dataBlocks.length; b++) {
        const fixed = rsCorrect([...dataBlocks[b], ...ecBlocks[b]], spec.ec);
        out.push(...fixed.slice(0, dataBlocks[b].length));
    }
    return out;
}

/** 从数据码字里取出 byte 模式的原文 */
function parseByteMode(data: number[], version: number): string {
    const bits: number[] = [];
    for (const b of data) for (let i = 7; i >= 0; i--) bits.push((b >>> i) & 1);
    let p = 0;
    const take = (n: number) => {
        let v = 0;
        for (let i = 0; i < n; i++) { v = (v << 1) | (bits[p++] ?? 0); }
        return v;
    };
    const mode = take(4);
    if (mode !== 0b0100) throw new QrDecodeError(`不是 byte 模式（mode=${mode}），不是本游戏的配对码`);
    const len = take(version <= 9 ? 8 : 16);
    if (len <= 0 || len > 400) throw new QrDecodeError('长度字段异常');
    const bytes: number[] = [];
    for (let i = 0; i < len; i++) bytes.push(take(8));
    return new TextDecoder().decode(new Uint8Array(bytes));
}

// ══════════════════════════════════════════════════════════════════════════
// 对外入口
// ══════════════════════════════════════════════════════════════════════════

export interface QrDecodeResult {
    text: string;
    version: number;
    mask: number;
}

/**
 * 诊断信息 —— 让界面能回答"到底卡在哪一步"。
 * 程反馈："扫描半天没反应，不知道是没扫到还是没连上" ⇒ 这个对象就是给那个问题用的。
 */
export interface QrDiag {
    /** 走过的阶段（人类可读，直接显示给玩家/开发者） */
    steps: string[];
    /** 上一次二值化后找到的定位图形数量（<3 基本就是"没扫到码"） */
    finders: number;
    /** 最后用的二值化方式（otsu / adaptive32 / adaptive64 / adaptive128） */
    binarizer: string | null;
    /** 识别出的版本（有值说明码已经认出来了） */
    version: number | null;
    /** 最后一次错误 */
    error: string | null;
}

export function createQrDiag(): QrDiag {
    return { steps: [], finders: 0, binarizer: null, version: null, error: null };
}

/**
 * 从灰度图里解一个 QR。失败抛 `QrDecodeError`（**不会静默返回错数据**）。
 *
 * 🔁 会依次试**多档二值化**：
 *   ① Otsu（全局阈值）—— 快，适合"屏幕截图 / 拍屏幕"
 *   ②③④ 自适应（局部均值，窗口 32 / 64 / 128）—— 适合**真实相机画面**的反光 / 侧光 / 明暗不均
 *   为什么要多档：固定窗口 33px 在"码占满画面"时只有 2 个模块宽，局部均值会被图案本身带偏
 *   （2026-10-21 实测：一次性看到 32 个疑似定位角 = 二值化已经烂了）。窗口跟着尝试多档，
 *   总有一档跟当前模块大小匹配。
 *
 * @param diag 传入一个 `createQrDiag()` 的对象即可拿到**逐阶段**的结论（排查用）
 */
export function decodeQrFromGray(img: GrayImage, diag?: QrDiag): QrDecodeResult {
    const D = diag ?? createQrDiag();
    D.steps.length = 0;
    D.finders = 0;
    D.binarizer = null;
    D.version = null;
    D.error = null;
    D.steps.push(`图像 ${img.width}×${img.height}`);

    const variants: ReadonlyArray<{ name: string; run: () => Bitmap }> = [
        { name: 'otsu', run: () => binarizeOtsu(img) },
        { name: 'adaptive32', run: () => binarizeAdaptive(img, 32) },
        { name: 'adaptive64', run: () => binarizeAdaptive(img, 64) },
        { name: 'adaptive128', run: () => binarizeAdaptive(img, 128) },
    ];

    // 失败时**报最靠后的那个错**（旧实现报"最后一次尝试"的错，常被垃圾三角的
    // 「网格尺寸对不上」掩盖掉真正的进展，害得排查白跑）
    let deepest: DeepestError | null = null;

    for (const v of variants) {
        D.binarizer = v.name;
        D.steps.push(`二值化:${v.name}`);
        try {
            return decodeBitmap(v.run(), D);
        } catch (e) {
            deepest = pickDeeper(deepest, e, 0);
            D.error = asMessage(e);
            D.steps.push(`${v.name} ✗ ${D.error}`);
        }
    }
    D.error = deepest?.message ?? D.error;
    throw new QrDecodeError(D.error ?? '解不出来，请重拍');
}

/** 带"深入到第几步"的错误：多档尝试结束后，只报最靠后的那个 */
class StageError extends QrDecodeError {
    constructor(message: string, readonly depth: number) {
        super(message);
    }
}

const asMessage = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/**
 * 所有尝试都失败后要报的那个"最靠后的错"。
 *
 * ⚠️ 注意它必须是**同作用域赋值**：早先这里用闭包 `keep()` 直接改外层 `deepest`，
 * 而 TS 的控制流分析**看不到闭包里的赋值** ⇒ 外层变量被收窄成 `null`
 * ⇒ `deepest?.message` 的非空分支成了 `never` ⇒ `tsc -b` 报 TS2339。
 * 所以改成纯函数 `pickDeeper()` 返回值、由调用方赋值。
 */
interface DeepestError { depth: number; message: string }

function pickDeeper(cur: DeepestError | null, e: unknown, depthFallback: number): DeepestError {
    const depth = e instanceof StageError ? e.depth : depthFallback;
    const message = asMessage(e);
    return !cur || depth > cur.depth ? { depth, message } : cur;
}

/** 只认本游戏的配对码 —— 见 `decodeBitmap` 里的说明 */
export const PAIR_PREFIX = 'snowbreak:';

/** 在已二值化的位图上走完整解码流程 */
function decodeBitmap(bm: Bitmap, diag: QrDiag): QrDecodeResult {
    const finders = findFinders(bm);

    if (finders.length < 3) {
        diag.finders = finders.length;
        throw new StageError(`只找到 ${finders.length} 个定位图形（至少要 3 个）—— 请把二维码完整放进取景范围`, 1);
    }
    diag.finders = finders.length;
    diag.steps.push(`定位图形 ${finders.length} 个`);

    // 按几何形状取前几组候选（**不是**按 module 大小排序，见 rankFinderTriples 注释）
    const triples = rankFinderTriples(finders);
    if (triples.length === 0) {
        diag.steps.push('三点组合 ✗');
        throw new StageError('找到了疑似定位图形，但凑不成一个二维码的三个角 —— 请把二维码拍全、拍正', 1);
    }
    diag.steps.push(`三点组合 ${triples.length} 组`);

    let deepest: DeepestError | null = null;

    for (const triple of triples) {
        // 三个点谁当 TL / TR / BL 有六种排法。只交换 TR↔BL 不够 ——
        // TL 认错时整张网格会歪掉（实测 v5 就栽在这）。全 6 种都试，代价很小。
        const pts = [triple.tl, triple.a, triple.b];
        for (let i = 0; i < 3; i++) {
            for (let j = 0; j < 3; j++) {
                for (let k = 0; k < 3; k++) {
                    if (i === j || j === k || i === k) continue;
                    const [tlP, trP, blP] = [pts[i], pts[j], pts[k]] as [Finder, Finder, Finder];
                    try {
                        const moduleSize = (tlP.module + trP.module + blP.module) / 3;
                        // 三个定位**中心**之间跨了 size-7 个模块
                        const spanModules = dist(tlP, trP) / moduleSize;
                        const sizeGuess = Math.round(spanModules) + 7;
                        const ver = Math.round((sizeGuess - 17) / 4);
                        if (ver < 1 || ver > ECC_L.length) throw new StageError(`版本推算异常（算出 v${ver}）`, 1);

                        const size = sizeOfVersion(ver);
                        if (Math.abs(size - sizeGuess) > 1) throw new StageError('网格尺寸对不上（角度或裁切问题）', 1);

                        const modules = sampleGrid(bm, tlP, trP, blP, size);

                        // ✅ 容错①：两份副本 + 最近邻，容 3 位错
                        const fmt = readFormat(modules, size);
                        if (!fmt) throw new StageError('格式信息读不出（画面太糊，或这不是二维码）', 2);
                        const mask = fmt.mask;

                        const reserved = buildReserved(size, ver);
                        const cw = readCodewords(modules, size, mask, reserved);
                        const need = totalCodewords(ver);
                        if (cw.length < need) throw new StageError('读到的码字不够（二维码可能被裁切）', 3);

                        // ✅ 容错②：Reed-Solomon 纠错（每块能纠 floor(ec/2) 个错码字）
                        let data: number[];
                        try {
                            data = deinterleaveAndCorrect(cw.slice(0, need), ver);
                        } catch (e) {
                            throw new StageError(asMessage(e), 4);
                        }

                        // ✅ 容错③：载荷必须像我们的配对码。
                        //    极少数情况下 RS 会把噪声"纠"成另一个合法码字；那种结果若被当成成功，
                        //    取景会被关掉、玩家白扫一次。宁可继续试下一组，也不放行。
                        const text = parseByteMode(data, ver);
                        if (!text.startsWith(PAIR_PREFIX)) {
                            throw new StageError('解出来的不是本游戏的配对码', 4);
                        }

                        diag.version = ver;
                        diag.steps.push(`解码成功 v${ver} 掩码${mask}（格式修正 ${fmt.errors} 位）`);
                        return { text, version: ver, mask };
                    } catch (e) {
                        deepest = pickDeeper(deepest, e, 1);
                    }
                }
            }
        }
    }

    throw new StageError(deepest?.message ?? '解不出来，请重拍', deepest?.depth ?? 0);
}
