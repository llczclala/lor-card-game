/**
 * qr-roundtrip.mjs —— `qr.ts` / `qrDecode.ts` 的自证脚本
 * ============================================================================
 * 为什么必须有它：这两个文件是**纯数学**（GF(256) 上的 Reed-Solomon + BCH + 网格采样），
 * 错一位往往错得很隐蔽 —— 编码器算错了、解码器也跟着算错，端到端"能解出来"，
 * 但拿到别人的扫码器上就是废码。所以这里的规则是：
 *
 *   · RS 纠错层：单独做单元测试（注入 t 个错码字，必须逐个还原；超出能力必须**抛错**而不是吐错数据）
 *   · 端到端：编码 → 光栅化 → （缩放 / 偏移 / 模糊 / 注入错模块）→ 解码 → 必须与原文逐字相同
 *
 * 跑法（不打包游戏，只 bundle 这一个测试文件）：
 *   node node_modules/esbuild/bin/esbuild _scratch/qr-roundtrip.mjs \
 *        --bundle --format=esm --platform=node --outfile=_scratch/.qr-roundtrip.mjs
 *   node _scratch/.qr-roundtrip.mjs
 */

import { encodeQr, rsEncode } from '../src/utils/saveSync/qr.ts';
import { buildReserved, decodeQrFromGray, rsCorrect } from '../src/utils/saveSync/qrDecode.ts';

const PAYLOAD = 'snowbreak://pair?h=192.168.1.23&p=56295&t=123456';

let failed = 0;
const ok = (cond, label, extra = '') => {
    if (cond) {
        console.log(`  ✅ ${label}${extra ? ' — ' + extra : ''}`);
    } else {
        failed++;
        console.log(`  ❌ ${label}${extra ? ' — ' + extra : ''}`);
    }
};

/** 可复现的伪随机 */
let seed = 0x2f6e2b1;
const rnd = () => {
    seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; seed >>>= 0;
    return seed / 0xffffffff;
};

// ══════════════════════════════════════════════════════════════════════════
// 光栅化：把 QR 模块矩阵画成灰度图（可选注入错模块）
// ══════════════════════════════════════════════════════════════════════════
function rasterize(qr, { scale = 8, quiet = 4, flipSet = new Set(), padX = 0, padY = 0 } = {}) {
    const grid = qr.size + quiet * 2;
    const w = grid * scale + padX * 2;
    const h = grid * scale + padY * 2;
    const gray = new Uint8Array(w * h).fill(255);

    for (let y = 0; y < qr.size; y++) {
        for (let x = 0; x < qr.size; x++) {
            let dark = qr.modules[y][x];
            if (flipSet.has(y * qr.size + x)) dark = !dark;
            if (!dark) continue;
            const px0 = padX + (x + quiet) * scale;
            const py0 = padY + (y + quiet) * scale;
            for (let dy = 0; dy < scale; dy++) {
                const row = (py0 + dy) * w;
                for (let dx = 0; dx < scale; dx++) gray[row + px0 + dx] = 0;
            }
        }
    }
    return { width: w, height: h, gray };
}

/** 3×3 盒式模糊 —— 模拟手机拍屏幕时的轻微失焦 */
function blur3(img) {
    const { width: w, height: h, gray } = img;
    const out = new Uint8Array(gray.length);
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            let sum = 0, cnt = 0;
            for (let dy = -1; dy <= 1; dy++) {
                const yy = y + dy;
                if (yy < 0 || yy >= h) continue;
                for (let dx = -1; dx <= 1; dx++) {
                    const xx = x + dx;
                    if (xx < 0 || xx >= w) continue;
                    sum += gray[yy * w + xx];
                    cnt++;
                }
            }
            out[y * w + x] = Math.round(sum / cnt);
        }
    }
    return { width: w, height: h, gray: out };
}

const decode = (img) => {
    try {
        return { text: decodeQrFromGray(img).text };
    } catch (e) {
        return { err: e instanceof Error ? e.message : String(e) };
    }
};

// ══════════════════════════════════════════════════════════════════════════
// 1) Reed-Solomon 纠错：单元测试（不经过图像）
// ══════════════════════════════════════════════════════════════════════════
console.log('\n[1] Reed-Solomon 纠错（ec=15 ⇒ 应能纠 7 个错码字）');

for (const t of [0, 1, 2, 3, 5, 7]) {
    let pass = 0;
    for (let round = 0; round < 20; round++) {
        const data = Array.from({ length: 55 }, () => (rnd() * 256) | 0);
        const block = [...data, ...rsEncode(data, 15)];
        const bad = block.slice();
        const pos = new Set();
        while (pos.size < t) pos.add((rnd() * bad.length) | 0);
        for (const p of pos) bad[p] ^= 1 + ((rnd() * 255) | 0);
        try {
            const fixed = rsCorrect(bad, 15);
            if (fixed.every((v, i) => v === block[i])) pass++;
        } catch { /* 算它没还原 */ }
    }
    ok(pass === 20, `注入 ${t} 个错码字 → 20/20 还原`, `实际 ${pass}/20`);
}

// 超过纠错能力（t=9 > 7）必须**抛错**，绝不能吐出"看起来正常"的错数据
{
    let threw = 0, wrongData = 0;
    for (let round = 0; round < 20; round++) {
        const data = Array.from({ length: 55 }, () => (rnd() * 256) | 0);
        const block = [...data, ...rsEncode(data, 15)];
        const bad = block.slice();
        const pos = new Set();
        while (pos.size < 9) pos.add((rnd() * bad.length) | 0);
        for (const p of pos) bad[p] ^= 1 + ((rnd() * 255) | 0);
        try {
            const fixed = rsCorrect(bad, 15);
            if (!fixed.every((v, i) => v === block[i])) wrongData++;
        } catch { threw++; }
    }
    ok(wrongData === 0, '超出纠错能力时绝不吐错数据', `抛错 ${threw}/20 · 静默错数据 ${wrongData}`);
}

// ══════════════════════════════════════════════════════════════════════════
// 2) 端到端：干净图
// ══════════════════════════════════════════════════════════════════════════
console.log('\n[2] 端到端 · 干净图（版本/尺寸由编码器自动选）');

const qr = encodeQr(PAYLOAD);
console.log(`  · 载荷 ${PAYLOAD.length} 字节 → v${qr.version}（${qr.size}×${qr.size}，掩码 ${qr.mask}）`);

{
    const r = decode(rasterize(qr, { scale: 8 }));
    ok(r.text === PAYLOAD, 'scale=8 干净图往返', r.err ?? (r.text === PAYLOAD ? '' : `得到 "${r.text}"`));
}

for (const scale of [4, 5, 6, 11, 16]) {
    const r = decode(rasterize(qr, { scale }));
    ok(r.text === PAYLOAD, `scale=${scale}`, r.err ?? '');
}

// ══════════════════════════════════════════════════════════════════════════
// 3) 端到端：偏移（码不居中 —— 对应"没对正取景框"）
// ══════════════════════════════════════════════════════════════════════════
console.log('\n[3] 端到端 · 码不居中');

for (const [padX, padY] of [[60, 20], [20, 60], [90, 90]]) {
    const r = decode(rasterize(qr, { scale: 8, padX, padY }));
    ok(r.text === PAYLOAD, `偏移 ${padX}/${padY}`, r.err ?? '');
}

// ══════════════════════════════════════════════════════════════════════════
// 4) 端到端：模糊（对应手机拍屏幕失焦）
// ══════════════════════════════════════════════════════════════════════════
console.log('\n[4] 端到端 · 轻微失焦（3×3 模糊）');

for (const scale of [8, 11]) {
    const r = decode(blur3(rasterize(qr, { scale })));
    ok(r.text === PAYLOAD, `scale=${scale} + 模糊`, r.err ?? '');
}

// ══════════════════════════════════════════════════════════════════════════
// 5) 端到端：注入错模块（对应真实拍摄里采错几个点）—— 这是本次改动的核心
// ══════════════════════════════════════════════════════════════════════════
console.log('\n[5] 端到端 · 数据区注入错模块（RS 纠错 + 格式信息容错 的实际收益）');
console.log('    注：只打**数据区**。定位图形是大黑块，模糊下反而最稳；真实拍摄的错主要落在数据区。');

// 用解码器自己的"功能图形地图"来排除定位/时序/格式/校正图形
const reserved = buildReserved(qr.size, qr.version);
const dataModules = [];
for (let y = 0; y < qr.size; y++) {
    for (let x = 0; x < qr.size; x++) {
        if (!reserved[y][x]) dataModules.push(y * qr.size + x);
    }
}
console.log(`    （数据区模块 ${dataModules.length} 个 / 全码 ${qr.size * qr.size} 个）`);

for (const k of [0, 1, 2, 4, 6, 7, 8, 12, 20, 30]) {
    let pass = 0;
    const rounds = 20;
    for (let round = 0; round < rounds; round++) {
        const flip = new Set();
        while (flip.size < k) flip.add(dataModules[(rnd() * dataModules.length) | 0]);
        const r = decode(rasterize(qr, { scale: 8, flipSet: flip }));
        if (r.text === PAYLOAD) pass++;
    }
    const label = `数据区随机错 ${k} 个模块`;
    // v3-L 的 ec=15 ⇒ 理论上限 t=7 个错码字（错模块基本 1 个影响 1 个码字）
    // ⇒ k ≤ 4 必须全中（给"多个错落在同一码字"留余量）；k≥8 掉下来是数学上限，不是 bug
    if (k <= 4) ok(pass === rounds, label, `${pass}/${rounds}`);
    else console.log(`  ·  ${label} → ${pass}/${rounds}（${Math.round((pass / rounds) * 100)}%）`);
}

// 对照组：万一打坏定位图形 —— 这不是纠错该负责的场景，只记录不判定
{
    let pass = 0;
    const rounds = 20;
    for (let round = 0; round < rounds; round++) {
        const flip = new Set();
        while (flip.size < 2) {
            const y = (rnd() * 7) | 0, x = (rnd() * 7) | 0;   // 左上定位图形
            flip.add(y * qr.size + x);
        }
        const r = decode(rasterize(qr, { scale: 8, flipSet: flip }));
        if (r.text === PAYLOAD) pass++;
    }
    console.log(`  ·  对照：定位图形被打坏 2 个模块 → ${pass}/${rounds}（失去定位就无从谈起，不算回归）`);
}

// ══════════════════════════════════════════════════════════════════════════
// 6) 反面用例：不是配对码的内容不该被放行
// ══════════════════════════════════════════════════════════════════════════
console.log('\n[6] 反面用例');

{
    const other = encodeQr('https://example.com/hello');
    const r = decode(rasterize(other, { scale: 8 }));
    ok(!!r.err, '别人的二维码不会被当成配对码', r.err ?? '（竟然解出来了！）');
}

// ══════════════════════════════════════════════════════════════════════════
console.log(`\n${failed === 0 ? '🎉 全部通过' : `💥 ${failed} 项失败`}\n`);
process.exit(failed === 0 ? 0 : 1);
