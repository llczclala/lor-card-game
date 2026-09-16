/**
 * asar-patcher.cjs — 兼容 @electron/asar v4 的 ASAR 提取/打包器
 *
 * 使用方式（在游戏根目录运行）：
 *   SET ELECTRON_RUN_AS_NODE=1
 *   "Snowbreak Rivals.exe" asar-patcher.cjs
 *
 * 原理：Chromium Pickle 格式，参见 @electron/asar/lib/pickle.js
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// 禁用 Electron 的 ASAR 拦截，让我们能直接读写物理文件
process.noAsar = true;

const GAME_DIR = __dirname;
const ASAR_PATH = path.join(GAME_DIR, 'resources', 'app.asar');
const TEMP_DIR = path.join(os.tmpdir(), 'snowbreak-patch-' + Date.now());
const PATCH_FILES_DIR = path.join(GAME_DIR, '_patch', 'files');

// ── Pickle 读写 ──────────────────────────────────
const SZ = { INT32: 4, UINT32: 4 };

function align(n, a) { return n + ((a - (n % a)) % a); }

// 从 Buffer 读取 Pickle 编码的字符串
function pickleReadString(buf, offset) {
  const strLen = buf.readInt32LE(offset);
  const start = offset + SZ.INT32;
  return buf.toString('utf8', start, start + strLen);
}

// 读取 ASAR 头部（Pickle 格式）
function readAsarHeader(asarPath) {
  const fd = fs.openSync(asarPath, 'r');
  try {
    // 1. 读 8 字节 Pickle：内嵌了一个 uint32 = 完整头部长度
    const sizeBuf = Buffer.alloc(8);
    fs.readSync(fd, sizeBuf, 0, 8, 0);
    const pSize = sizeBuf.readUInt32LE(0);    // payload size（固定 4）
    const hSize = 8 - pSize;                   // header size = 4
    const headerSize = sizeBuf.readUInt32LE(hSize); // 真正的 JSON 头部长度

    // 2. 读 headerSize 字节的 Pickle 数据 → 内含 JSON 字符串
    const headerBuf = Buffer.alloc(headerSize);
    fs.readSync(fd, headerBuf, 0, headerSize, 8);

    // Pickle header: headerBuf[0..3] = payload_size (这部分的自身 payload)
    // Pickle payload 开始位置 = headerBuf.length - payload_size
    const pSize2 = headerBuf.readUInt32LE(0);
    const payloadOffset = headerSize - pSize2;

    // 从 payload 读取字符串
    const jsonStr = pickleReadString(headerBuf, payloadOffset);
    const header = JSON.parse(jsonStr);

    return { header, headerSize };
  } finally {
    fs.closeSync(fd);
  }
}

// 写入 ASAR（Pickle 格式）
function writeAsar(outputPath, fileMap) {
  // fileMap: { 'path/to/file': Buffer, ... }

  // 1. 构建文件树
  const root = { files: {} };
  for (const p of Object.keys(fileMap).sort()) {
    const parts = p.replace(/\\/g, '/').split('/');
    let node = root;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (i === parts.length - 1) {
        node.files[part] = { size: fileMap[p].length };
      } else {
        if (!node.files[part]) node.files[part] = { files: {} };
        node = node.files[part];
      }
    }
  }

  // 2. 计算偏移 + 记录物理写入顺序
  // ⚠️ [2026-09-13 莉莉子] 这两者【必须同源】，否则 asar 内容整体错位！
  //
  // 原实现的 bug：算 offset 用「树形深度优先」，写数据用「全路径字符串排序」。
  // 平时两者结果一致，但在 node_modules 里存在 "mesh/"(目录) 与 "mesh-extras/"(目录)
  // 这类"前缀冲突路径"时，两种排序给出的先后顺序不同：
  //   字符串比较：'-'(0x2D) < '/'(0x2F) → mesh-extras 排在 mesh 前面
  //   树形遍历　：'mesh' 是 'mesh-extras' 的前缀，短的排前面 → mesh 在前
  // 结果 JSON 头声明的 offset 与实际落盘位置错位，读音按 offset 取文件会拿到
  // 隔壁文件的内容（实测 7239 个文件里有 325 个受影响，涉及 @pixi / react /
  // react-dom / framer-motion —— 游戏直接黑屏）。
  //
  // 修复：遍历时顺手把顺序记进 dataOrder，写入阶段直接复用，两套顺序天然合一。
  let offset = 0;
  const dataOrder = [];
  (function calcOff(node, prefix) {
    if (!node.files) return;
    for (const [name, entry] of Object.entries(node.files).sort(([a],[b]) => a<b ? -1 : 1)) {
      const fullPath = prefix ? `${prefix}/${name}` : name;
      if (entry.files) {
        calcOff(entry, fullPath);
      } else {
        entry.offset = String(offset);
        offset += entry.size;
        dataOrder.push(fullPath);
      }
    }
  })(root, '');

  // 3. 序列化为 JSON
  const jsonStr = JSON.stringify(root);
  const jsonBuf = Buffer.from(jsonStr, 'utf8');

  // 4. 用 Pickle 编码 JSON
  const stringLen = jsonBuf.length;
  const payloadSize = align(SZ.INT32 + stringLen, SZ.UINT32);
  const pickleBuf = Buffer.alloc(SZ.UINT32 + payloadSize);
  pickleBuf.writeUInt32LE(payloadSize, 0);             // payload size
  pickleBuf.writeInt32LE(stringLen, SZ.UINT32);          // string length
  pickleBuf.set(jsonBuf, SZ.UINT32 + SZ.INT32);          // string data

  // 5. 外层 Pickle（含内层 Pickle 总长度）
  const fullHeaderSize = pickleBuf.length;
  const outerPayloadSize = align(SZ.UINT32, SZ.UINT32); // 只存一个 uint32
  const outerBuf = Buffer.alloc(SZ.UINT32 + outerPayloadSize);
  outerBuf.writeUInt32LE(outerPayloadSize, 0);           // outer payload size
  outerBuf.writeUInt32LE(fullHeaderSize, outerPayloadSize); // inner pickle size

  // 6. 写文件：[外层 Pickle][内层 Pickle][文件数据...]
  const outFd = fs.openSync(outputPath, 'w');
  try {
    fs.writeSync(outFd, outerBuf, 0, outerBuf.length, null);
    fs.writeSync(outFd, pickleBuf, 0, pickleBuf.length, null);

    // 按 dataOrder 写入 —— 与上方 calcOff 分配 offset 的顺序【完全同源】
    // ⚠️ 切勿改回 Object.keys(fileMap).sort()：两套排序不一致会让文件内容整体错位
    for (const p of dataOrder) {
      const content = fileMap[p];
      fs.writeSync(outFd, content, 0, content.length, null);
    }
  } finally {
    fs.closeSync(outFd);
  }
}

// ── 提取 ASAR 到目录 ─────────────────────────────
function extractAsar(asarPath, outputDir) {
  console.log('[patcher] 提取 app.asar...');
  const { header, headerSize: hdrLen } = readAsarHeader(asarPath);
  const dataOffset = 8 + hdrLen; // 外层 Pickle (8B) + 内层 Pickle (hdrLen)

  const buf = fs.readFileSync(asarPath);

  const fileList = [];
  (function collect(node, prefix) {
    if (!node.files) return;
    for (const [name, entry] of Object.entries(node.files)) {
      const fullPath = prefix ? `${prefix}/${name}` : name;
      if (entry.files) {
        collect(entry, fullPath);
      } else {
        fileList.push({ path: fullPath, offset: Number(entry.offset), size: Number(entry.size) });
      }
    }
  })(header, '');

  for (const f of fileList) {
    const target = path.join(outputDir, ...f.path.split('/'));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, buf.subarray(dataOffset + f.offset, dataOffset + f.offset + f.size));
  }

  console.log(`[patcher] ✅ 提取 ${fileList.length} 个文件`);
  return fileList.length;
}

// ── 扫描目录文件列表 ────────────────────────────
function scanFiles(dirPath) {
  const result = {};
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) {
        const rel = path.relative(dirPath, full).replace(/\\/g, '/');
        result[rel] = fs.readFileSync(full);
      }
    }
  }
  walk(dirPath);
  return result;
}

// ── 递归删除目录 ───────────────────────────────
function rmDir(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (fs.statSync(full).isDirectory()) rmDir(full);
    else fs.unlinkSync(full);
  }
  fs.rmdirSync(dir);
}

// ═══════════════════════════════════════════════════
//  主流程
// ═══════════════════════════════════════════════════
function main() {
  console.log('=== Snowbreak Rivals ASAR Patcher ===');
  console.log(`游戏目录: ${GAME_DIR}`);

  if (!fs.existsSync(ASAR_PATH)) {
    console.error(`❌ 未找到 ${ASAR_PATH}`);
    console.error('   请将补丁放在游戏根目录（有 Snowbreak Rivals.exe 的文件夹）');
    process.exit(1);
  }

  // 1. 提取旧 asar
  const fileCount = extractAsar(ASAR_PATH, TEMP_DIR);

  // 2. 应用补丁文件
  if (fs.existsSync(PATCH_FILES_DIR)) {
    const patchFiles = scanFiles(PATCH_FILES_DIR);
    const keys = Object.keys(patchFiles);
    console.log(`[patcher] 应用 ${keys.length} 个补丁文件...`);
    for (const relPath of keys) {
      const targetPath = path.join(TEMP_DIR, ...relPath.split('/'));
      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      fs.writeFileSync(targetPath, patchFiles[relPath]);
    }
  } else {
    console.log('[patcher] ℹ️  无补丁文件，仅重新打包');
  }

  // 3. 备份旧的 asar
  console.log('[patcher] 备份旧文件 → app.asar.bak');
  fs.copyFileSync(ASAR_PATH, ASAR_PATH + '.bak');

  // 4. 从 TEMP_DIR 读取所有文件并打包新 asar
  console.log('[patcher] 打包新 app.asar...');
  const allFiles = scanFiles(TEMP_DIR);
  writeAsar(ASAR_PATH, allFiles);

  const newSize = fs.statSync(ASAR_PATH).size;
  console.log(`[patcher] ✅ 新 app.asar: ${(newSize / 1024 / 1024).toFixed(0)} MB`);

  // 5. 清理
  rmDir(TEMP_DIR);
  const patchDir = path.join(GAME_DIR, '_patch');
  if (fs.existsSync(patchDir)) rmDir(patchDir);
  try { fs.unlinkSync(ASAR_PATH + '.bak'); } catch {}

  console.log('\n✅ 补丁安装完成！');
  console.log('   启动游戏验证效果吧 ✨');
}

main();
