/**
 * asar-patcher.js — 极简 ASAR 提取/打包器
 *
 * 专门为 Snowbreak Rivals 补丁设计。
 * 使用方式（通过 Electron 内嵌 Node.js 运行）：
 *   SET ELECTRON_RUN_AS_NODE=1
 *   "游戏目录\Snowbreak Rivals.exe" asar-patcher.js
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// ── 配置 ──
const GAME_DIR = __dirname; // 脚本在游戏根目录运行
const ASAR_PATH = path.join(GAME_DIR, 'resources', 'app.asar');
const TEMP_DIR = path.join(os.tmpdir(), 'snowbreak-patch-' + Date.now());
const PATCH_FILES_DIR = path.join(GAME_DIR, '_patch', 'files');

// ── ASAR 格式常量 ──
const HEADER_SIZE = 4; // 4 bytes: uint32le header size

// ═══════════════════════════════════════════════
//  提取 ASAR → 目录
// ═══════════════════════════════════════════════
function extractAsar(asarPath, outputDir) {
  console.log('[patcher] 提取 app.asar...');
  const buf = fs.readFileSync(asarPath);
  const headerSize = buf.readUInt32LE(0);
  const headerJson = buf.toString('utf8', 4, 4 + headerSize);
  const header = JSON.parse(headerJson);
  const dataOffset = 4 + headerSize;

  function extractNode(node, basePath) {
    if (!node.files) return;
    for (const [name, entry] of Object.entries(node.files)) {
      const fullPath = path.join(basePath, name);
      if (entry.files) {
        // 目录
        fs.mkdirSync(fullPath, { recursive: true });
        extractNode(entry, fullPath);
      } else {
        // 文件
        const offset = dataOffset + Number(entry.offset);
        const size = Number(entry.size);
        const fileBuf = buf.subarray(offset, offset + size);
        fs.mkdirSync(path.dirname(fullPath), { recursive: true });
        fs.writeFileSync(fullPath, fileBuf);
      }
    }
  }

  fs.mkdirSync(outputDir, { recursive: true });
  extractNode(header, outputDir);
  console.log('[patcher] ✅ 提取完成');
  return header;
}

// ═══════════════════════════════════════════════
//  扫描目录 → ASAR 文件树
// ═══════════════════════════════════════════════
function scanDirectory(dirPath) {
  const files = {};

  function walk(currentPath, basePath) {
    const entries = fs.readdirSync(currentPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentPath, entry.name);
      const relPath = basePath ? `${basePath}/${entry.name}` : entry.name;

      if (entry.isDirectory()) {
        walk(fullPath, relPath);
      } else if (entry.isFile()) {
        files[relPath] = fs.readFileSync(fullPath);
      }
    }
  }

  walk(dirPath, '');
  return files;
}

// ═══════════════════════════════════════════════
//  目录 → ASAR 并写入
// ═══════════════════════════════════════════════
function buildAsarTree(files) {
  // 从扁平的文件列表构建嵌套树
  const root = { files: {} };

  for (const [relPath, content] of Object.entries(files)) {
    const parts = relPath.split('/');
    let current = root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (i === parts.length - 1) {
        // 文件节点
        current.files[part] = {
          offset: 0, // 占位，后面计算
          size: content.length,
        };
      } else {
        // 目录节点
        if (!current.files[part]) {
          current.files[part] = { files: {} };
        }
        current = current.files[part];
      }
    }
  }

  return root;
}

function calculateOffsets(node, startOffset) {
  let offset = startOffset;
  if (!node.files) return offset;

  // 先排序保证一致性
  const entries = Object.entries(node.files).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);

  for (const [name, entry] of entries) {
    if (entry.files) {
      offset = calculateOffsets(entry, offset);
    } else {
      entry.offset = String(offset);
      offset += Number(entry.size);
    }
  }

  return offset;
}

function packAsar(inputDir, outputPath) {
  console.log('[patcher] 打包新 app.asar...');

  // 扫描文件
  const flatFiles = scanDirectory(inputDir);

  // 构建目录树
  const tree = buildAsarTree(flatFiles);

  // 计算偏移
  calculateOffsets(tree, 0);

  // JSON 序列化
  const headerJson = JSON.stringify(tree);
  const headerBuf = Buffer.from(headerJson, 'utf8');
  const headerSize = headerBuf.length;

  // 写文件: [4 bytes headerSize][header JSON][file data...]
  const outFd = fs.openSync(outputPath, 'w');
  const sizeBuf = Buffer.alloc(4);
  sizeBuf.writeUInt32LE(headerSize, 0);
  fs.writeSync(outFd, sizeBuf, 0, 4, null);
  fs.writeSync(outFd, headerBuf, 0, headerSize, null);

  // 按 offset 顺序写文件数据
  function writeFiles(node) {
    if (!node.files) return;
    const entries = Object.entries(node.files).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
    for (const [name, entry] of entries) {
      if (entry.files) {
        writeFiles(entry);
      } else {
        const content = flatFiles[getFilePath(node, name)];
        if (content) {
          fs.writeSync(outFd, content, 0, content.length, null);
        }
      }
    }
  }

  // 辅助：从扁平文件列表取路径
  function getFilePath(node, fileName) {
    // 遍历树找到相对路径，这里简化处理
    return fileName;
  }

  // 因为上面的 getFilePath 太简陋了，换个方法
  // 直接将写入顺序与 offset 对齐
  const orderedEntries = [];
  function collectFiles(node, prefix) {
    if (!node.files) return;
    const entries = Object.entries(node.files).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
    for (const [name, entry] of entries) {
      const fullPath = prefix ? `${prefix}/${name}` : name;
      if (entry.files) {
        collectFiles(entry, fullPath);
      } else {
        orderedEntries.push({ path: fullPath, entry });
      }
    }
  }
  collectFiles(tree, '');

  // 按 offset 排序并写入
  orderedEntries.sort((a, b) => Number(a.entry.offset) - Number(b.entry.offset));
  for (const { path: filePath } of orderedEntries) {
    const content = flatFiles[filePath];
    if (content) {
      fs.writeSync(outFd, content, 0, content.length, null);
    }
  }

  fs.closeSync(outFd);

  const stats = fs.statSync(outputPath);
  console.log(`[patcher] ✅ 打包完成：${(stats.size / 1024 / 1024).toFixed(0)} MB`);
}

// ═══════════════════════════════════════════════
//  主流程
// ═══════════════════════════════════════════════
function main() {
  console.log('=== Snowbreak Rivals ASAR Patcher ===');
  console.log(`游戏目录: ${GAME_DIR}`);
  console.log(`临时目录: ${TEMP_DIR}`);

  // 1) 检查游戏目录
  if (!fs.existsSync(ASAR_PATH)) {
    console.error(`❌ 未找到 app.asar：${ASAR_PATH}`);
    console.error('   请确认补丁安装器放在了游戏根目录（有 Snowbreak Rivals.exe 的文件夹）');
    process.exit(1);
  }

  // 2) 提取旧 asar
  extractAsar(ASAR_PATH, TEMP_DIR);

  // 3) 检查补丁文件
  if (!fs.existsSync(PATCH_FILES_DIR)) {
    console.log('[patcher] ℹ️  没有补丁文件，仅重新打包');
  } else {
    console.log('[patcher] 应用补丁文件...');
    const patchFiles = scanDirectory(PATCH_FILES_DIR);
    let count = 0;
    for (const [relPath, content] of Object.entries(patchFiles)) {
      const targetPath = path.join(TEMP_DIR, ...relPath.split('/'));
      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      fs.writeFileSync(targetPath, content);
      count++;
    }
    console.log(`[patcher] ✅ 已替换 ${count} 个文件`);
  }

  // 4) 备份旧 asar
  const backupPath = ASAR_PATH + '.bak';
  console.log('[patcher] 备份旧 asar → app.asar.bak');
  fs.copyFileSync(ASAR_PATH, backupPath);

  // 5) 打包新 asar
  packAsar(TEMP_DIR, ASAR_PATH);

  // 6) 清理临时文件
  console.log('[patcher] 清理临时文件...');
  rmDir(TEMP_DIR);

  // 7) 清理补丁残留
  const patchDir = path.join(GAME_DIR, '_patch');
  if (fs.existsSync(patchDir)) {
    rmDir(patchDir);
  }

  // 8) 删除备份（确认新 asar 可用后）
  try { fs.unlinkSync(backupPath); } catch {}

  console.log('\n✅ 补丁安装完成！');
  console.log('   启动游戏验证效果吧 ✨');
}

function rmDir(dirPath) {
  if (!fs.existsSync(dirPath)) return;
  for (const entry of fs.readdirSync(dirPath)) {
    const fullPath = path.join(dirPath, entry);
    if (fs.statSync(fullPath).isDirectory()) {
      rmDir(fullPath);
    } else {
      fs.unlinkSync(fullPath);
    }
  }
  fs.rmdirSync(dirPath);
}

main();
