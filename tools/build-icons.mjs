// ══════════════════════════════════════════════════════════════════════
// 全平台图标生成器
//
// 真源：src/image/icon/titile.webp（2528x1696，横向标题图，带 alpha）
// 配方：与候选 C 一致 —— 按 alpha 裁掉透明边 → 等比缩到宽度 92%
//       → 居中补成正方形（**透明背景**）
//
// 产出：
//   android/app/src/main/res/mipmap-*/ic_launcher.png            旧版方形图标
//   android/app/src/main/res/mipmap-*/ic_launcher_round.png      旧版圆形图标
//   android/app/src/main/res/mipmap-*/ic_launcher_foreground.png 自适应图标前景层
//   public/favicon.ico                                           PC 端 exe 图标（多尺寸）
//
// 用法：node tools/build-icons.mjs
// ══════════════════════════════════════════════════════════════════════
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src/image/icon/titile.webp');
const RES = path.join(ROOT, 'android/app/src/main/res');

// 旧版图标：5 档密度（1x=48dp）
const LEGACY = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
// 自适应图标画布：108dp
const ADAPTIVE = { mdpi: 108, hdpi: 162, xhdpi: 216, xxhdpi: 324, xxxhdpi: 432 };

const log = (...a) => console.log(...a);

// ── 把「标题长条」补成透明底正方形 ──────────────────────────────────
async function makeSquare(buf, size, fillWidthRatio) {
  const targetW = Math.max(1, Math.round(size * fillWidthRatio));
  const scaled = await sharp(buf).resize({ width: targetW, fit: 'inside' }).png().toBuffer();
  return sharp({
    create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([{ input: scaled, gravity: 'center' }])
    .png()
    .toBuffer();
}

// ── 圆形遮罩（给圆形图标用） ────────────────────────────────────────
function circleMaskSvg(size) {
  return Buffer.from(
    `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">` +
    `<circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="#fff"/></svg>`
  );
}

async function withCircleMask(buf, size) {
  return sharp(buf)
    .composite([{ input: circleMaskSvg(size), blend: 'dest-in' }])
    .png()
    .toBuffer();
}

// ── 手写 ICO 容器（Vista+ 允许直接内嵌 PNG） ────────────────────────
function buildIco(entries) {
  const n = entries.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type = icon
  header.writeUInt16LE(n, 4);
  const dir = Buffer.alloc(16 * n);
  let offset = 6 + 16 * n;
  const blobs = [];
  entries.forEach((e, i) => {
    const o = i * 16;
    dir.writeUInt8(e.size >= 256 ? 0 : e.size, o + 0); // width（0 表示 256）
    dir.writeUInt8(e.size >= 256 ? 0 : e.size, o + 1); // height
    dir.writeUInt8(0, o + 2);                          // 调色板数
    dir.writeUInt8(0, o + 3);                          // reserved
    dir.writeUInt16LE(1, o + 4);                       // planes
    dir.writeUInt16LE(32, o + 6);                      // bpp
    dir.writeUInt32LE(e.buf.length, o + 8);            // 数据长度
    dir.writeUInt32LE(offset, o + 12);                 // 数据偏移
    offset += e.buf.length;
    blobs.push(e.buf);
  });
  return Buffer.concat([header, dir, ...blobs]);
}

// ══ 主流程 ══════════════════════════════════════════════════════════
if (!fs.existsSync(SRC)) { console.error('❌ 找不到源图标:', SRC); process.exit(1); }
log('源图标:', SRC.replace(ROOT + path.sep, ''));

// 1) 统一基准：裁透明边（与候选 C 同一配方）
const TRIM_THRESHOLD = 12;
const baseBuf = await sharp(SRC).ensureAlpha().trim({ threshold: TRIM_THRESHOLD }).png().toBuffer();
const bm = await sharp(baseBuf).metadata();
log(`基准图: ${bm.width}x${bm.height}  (宽高比 ${(bm.width / bm.height).toFixed(3)})`);

// 2) 旧版图标 + 圆形图标
log('\n── 旧版方形/圆形图标 ──');
for (const [dens, px] of Object.entries(LEGACY)) {
  const dir = path.join(RES, `mipmap-${dens}`);
  fs.mkdirSync(dir, { recursive: true });

  const square = await makeSquare(baseBuf, px, 0.92);
  fs.writeFileSync(path.join(dir, 'ic_launcher.png'), square);
  log(`  mipmap-${dens}/ic_launcher.png          ${px}x${px}`);

  // 圆形图标：先补方再裁圆，内容略缩以贴合内切圆
  const forRound = await makeSquare(baseBuf, px, 0.70);
  const round = await withCircleMask(forRound, px);
  fs.writeFileSync(path.join(dir, 'ic_launcher_round.png'), round);
  log(`  mipmap-${dens}/ic_launcher_round.png    ${px}x${px}`);
}

// 3) 自适应图标前景层（内容必须落在 72dp 安全区内）
log('\n── 自适应图标前景层（安全区 72/108dp）──');
for (const [dens, px] of Object.entries(ADAPTIVE)) {
  const dir = path.join(RES, `mipmap-${dens}`);
  fs.mkdirSync(dir, { recursive: true });
  // 0.55 ≈ 60dp / 108dp，保证长条两端不越出安全圆
  const fg = await makeSquare(baseBuf, px, 0.55);
  fs.writeFileSync(path.join(dir, 'ic_launcher_foreground.png'), fg);
  log(`  mipmap-${dens}/ic_launcher_foreground.png  ${px}x${px}  (内容宽 ${Math.round(px * 0.55)})`);
}

// 4) PC 端 exe 的 .ico
log('\n── PC 端 .ico ──');
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];
const icoEntries = [];
for (const s of ICO_SIZES) {
  icoEntries.push({ size: s, buf: await makeSquare(baseBuf, s, 0.96) });
}
const icoPath = path.join(ROOT, 'public/favicon.ico');
fs.mkdirSync(path.dirname(icoPath), { recursive: true });
fs.writeFileSync(icoPath, buildIco(icoEntries));
log(`  public/favicon.ico  ${ICO_SIZES.join('/')}  ${(fs.statSync(icoPath).size / 1024).toFixed(1)} KB`);

// 5) 预览图：三种背景下的自适应图标效果（供人眼判断对比度）
log('\n── 生成对比预览 ──');
const PV = 384;
const fgBig = await makeSquare(baseBuf, PV, 0.55);
const previews = [
  { name: '白底', color: { r: 255, g: 255, b: 255, alpha: 1 } },
  { name: '黑底', color: { r: 0, g: 0, b: 0, alpha: 1 } },
  { name: '深蓝底', color: { r: 11, g: 27, b: 36, alpha: 1 } },
];
const tabs = [];
for (const p of previews) {
  const masked = await withCircleMask(fgBig, PV);
  const composed = await sharp({ create: { width: PV, height: PV, channels: 4, background: p.color } })
    .composite([{ input: masked }]).png().toBuffer();
  tabs.push(composed);
}
const previewOut = 'D:/智脑系统-dsh/agents/game/_icons/adaptive-preview.png';
const gutter = 24;
const totalW = PV * 3 + gutter * 4;
await sharp({ create: { width: totalW, height: PV + gutter * 2, channels: 4, background: { r: 32, g: 32, b: 40, alpha: 1 } } })
  .composite(tabs.map((t, i) => ({ input: t, left: gutter + i * (PV + gutter), top: gutter })))
  .png().toFile(previewOut);
log(`  三背景对比图: ${previewOut}`);
log('\n左→右：白底 / 黑底 / 深蓝底');
log('\n✅ 完成');
