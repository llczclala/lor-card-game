/**
 * make-patch.mjs  — Snowbreak Rivals 补丁安装包生成器
 *
 * 工作流程：
 *   ① 扫描当前 dist/，比对旧文件快照 → 找出改动了的文件
 *   ② 将改动文件 + asar-patcher.cjs + run-patch.bat 打包
 *   ③ 输出 7z SFX 自解压安装器
 *
 * 使用方法：
 *   修完 BUG → npx vite build → node tools/make-patch.mjs
 *   → release/patch-v1.0.4.exe ✨
 *
 * 前置条件：
 *   - 7-Zip Zstandard: D:\7-zip_zstd\7-Zip-Zstandard\
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync, unlinkSync, mkdirSync, copyFileSync } from 'fs';
import { createHash } from 'crypto';
import { join, resolve, dirname } from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..');
const RELEASE_DIR  = join(PROJECT_ROOT, 'release');
const DIST_DIR     = join(PROJECT_ROOT, 'dist');
const TOOLS_DIR    = __dirname;

// ── 7-Zip 路径 ──
const SEVENZIP_DIR = 'D:\\7-zip_zstd\\7-Zip-Zstandard';
const SEVENZIP_EXE = `${SEVENZIP_DIR}\\7z.exe`;
const SEVENZIP_SFX = `${SEVENZIP_DIR}\\7z.sfx`;

// ── 产品名称 ──
const PRODUCT_NAME = 'Snowbreak Rivals';

// ═══════════════════════════════════════════════════
//  读取版本号
// ═══════════════════════════════════════════════════
const pkg = JSON.parse(readFileSync(join(PROJECT_ROOT, 'package.json'), 'utf-8'));
const NEW_VERSION = pkg.version;

function findOldVersion() {
  // 从 release/ 的快照文件判断
  if (existsSync(RELEASE_DIR)) {
    const snaps = readdirSync(RELEASE_DIR)
      .filter(f => f.startsWith('.dist-snapshot-v') && f.endsWith('.json'))
      .sort().reverse();
    if (snaps.length > 0) {
      const m = snaps[0].match(/\.dist-snapshot-v([\d.]+)\.json$/);
      if (m) return m[1];
    }
  }
  return null;
}

const OLD_VERSION = findOldVersion();

// ═══════════════════════════════════════════════════
//  前置校验
// ═══════════════════════════════════════════════════
console.log(`\n🎯  ${PRODUCT_NAME} 补丁生成器`);
if (OLD_VERSION) console.log(`   旧版: v${OLD_VERSION} → 新版: v${NEW_VERSION}`);
else console.log(`   新版: v${NEW_VERSION}（首次运行，将建立文件快照）`);

if (!existsSync(DIST_DIR)) {
  console.error('❌ dist/ 目录不存在，请先执行 npx vite build');
  process.exit(1);
}
if (!existsSync(SEVENZIP_EXE)) {
  console.error(`❌ 未找到 7z.exe：${SEVENZIP_EXE}`);
  process.exit(1);
}
if (!existsSync(SEVENZIP_SFX)) {
  console.error(`❌ 未找到 7z.sfx：${SEVENZIP_SFX}`);
  process.exit(1);
}

// ═══════════════════════════════════════════════════
//  步骤 1：扫描当前文件（dist/ + 根目录关键文件）
// ═══════════════════════════════════════════════════
console.log('\n🔍 扫描文件...');

function scanFiles(rootDir, baseDir = '') {
  const result = [];
  if (!existsSync(rootDir)) return result;
  for (const name of readdirSync(rootDir)) {
    const full = join(rootDir, name);
    const rel  = baseDir ? `${baseDir}/${name}` : name;
    const st   = statSync(full);
    if (st.isDirectory()) {
      result.push(...scanFiles(full, rel));
    } else {
      const content = readFileSync(full);
      const hash = createHash('sha256').update(content).digest('hex').slice(0, 16);
      result.push({ rel, full, size: st.size, hash });
    }
  }
  return result;
}

// dist/ 下的文件以 "dist/" 为前缀（匹配 asar 内部路径）
const distFiles = scanFiles(DIST_DIR).map(f => ({
  ...f,
  rel: `dist/${f.rel}`,
}));

// 根目录关键文件（asar 内路径不变）
const ROOT_EXTRAS = [
  { name: 'electron-main.cjs', src: join(PROJECT_ROOT, 'electron-main.cjs') },
  { name: 'package.json',      src: join(PROJECT_ROOT, 'package.json') },
];
for (const rf of ROOT_EXTRAS) {
  if (existsSync(rf.src)) {
    const content = readFileSync(rf.src);
    const hash = createHash('sha256').update(content).digest('hex').slice(0, 16);
    distFiles.push({ rel: rf.name, full: rf.src, size: statSync(rf.src).size, hash });
  }
}

console.log(`   共 ${distFiles.length} 个文件`);

// ═══════════════════════════════════════════════════
//  步骤 2：与旧快照比较，找出差异
// ═══════════════════════════════════════════════════
const snapshotPath = OLD_VERSION
  ? join(RELEASE_DIR, `.dist-snapshot-v${OLD_VERSION}.json`)
  : null;

let changedFiles = [];

if (snapshotPath && existsSync(snapshotPath)) {
  const oldSnapshot = JSON.parse(readFileSync(snapshotPath, 'utf-8'));

  // ── 兼容旧快照格式 ──
  // 旧格式：assets/file.png（没有 dist/ 前缀）
  // 新格式：dist/assets/file.png（匹配 asar 内部路径）
  const sampleKey = Object.keys(oldSnapshot).find(k => k !== '__meta__');
  if (sampleKey && !sampleKey.startsWith('dist/')) {
    console.log('   📐 检测到旧格式快照，正在迁移...');
    const migrated = {};
    for (const [k, v] of Object.entries(oldSnapshot)) {
      if (k === '__meta__') {
        migrated[k] = { ...v, ...(oldSnapshot['__meta__'] || {}) };
      } else {
        migrated[`dist/${k}`] = v;
      }
    }
    // 将迁移后的快照写回文件
    writeFileSync(snapshotPath, JSON.stringify(migrated, null, 2), 'utf-8');
    Object.assign(oldSnapshot, migrated);
    console.log('   ✅ 迁移完成');
  }

  for (const f of distFiles) {
    if (f.rel === '__meta__') continue;
    if (oldSnapshot[f.rel] !== f.hash) {
      changedFiles.push(f);
    }
  }

  // 也检查是否有文件被删除了（旧快照有但当前没有）
  const currentSet = new Set(distFiles.map(f => f.rel));
  for (const key of Object.keys(oldSnapshot)) {
    if (key === '__meta__') continue;
    if (!currentSet.has(key)) {
      console.log(`   ⚠️  文件已删除（补丁不会删除它）: ${key}`);
    }
  }

  console.log(`   变动: ${changedFiles.length} 个文件`);
  if (changedFiles.length > 0) {
    const totalSize = changedFiles.reduce((s, f) => s + f.size, 0);
    console.log(`   大小: ${(totalSize / 1024).toFixed(0)} KB`);
    for (const f of changedFiles.slice(0, 15)) {
      console.log(`     ${f.rel} (${(f.size / 1024).toFixed(0)} KB)`);
    }
    if (changedFiles.length > 15) {
      console.log(`     ... 还有 ${changedFiles.length - 15} 个`);
    }
  }
} else {
  console.log(`   ⏭️  无旧快照，将打包完整 dist/`);
  changedFiles = distFiles;
}

if (changedFiles.length === 0 && !process.argv.includes('--force')) {
  console.log(`\n✅ 文件无变化，无需生成补丁\n`);
  saveSnapshot();
  process.exit(0);
}

// ═══════════════════════════════════════════════════
//  步骤 3：组装补丁文件
// ═══════════════════════════════════════════════════
const WORK_DIR = join(TOOLS_DIR, '.patch-work');
if (existsSync(WORK_DIR)) {
  for (const f of readdirSync(WORK_DIR)) {
    try {
      const full = join(WORK_DIR, f);
      if (statSync(full).isDirectory()) execSync(`rmdir /s /q "${full}"`, { stdio: 'ignore' });
      else unlinkSync(full);
    } catch { /* ignore */ }
  }
} else {
  mkdirSync(WORK_DIR, { recursive: true });
}

// 3a. 复制 asar-patcher.cjs 到工作区
console.log('\n📦 组装补丁文件...');
const patcherSrc = join(TOOLS_DIR, 'asar-patcher.cjs');
const patcherDst = join(WORK_DIR, 'asar-patcher.cjs');
copyFileSync(patcherSrc, patcherDst);

// 3b. 创建 run-patch.bat（纯 ASCII，无中文防编码问题）
const batContent = `@echo off
SET ELECTRON_RUN_AS_NODE=1
"%~dp0Snowbreak Rivals.exe" "%~dp0asar-patcher.cjs"
echo.
echo Done! You can close this window.
pause
`;
writeFileSync(join(WORK_DIR, 'run-patch.bat'), batContent, 'latin1');

// 3c. 复制改动文件到 _patch/files/ 目录
let fileCount = 0;
for (const f of changedFiles) {
  const target = join(WORK_DIR, '_patch', 'files', ...f.rel.split('/'));
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(f.full, target);
  fileCount++;
}
console.log(`   ${fileCount} 个补丁文件已就绪`);

// ═══════════════════════════════════════════════════
//  步骤 4：打包为 zip 压缩包
// ═══════════════════════════════════════════════════
console.log('🗜️  压缩补丁...');

const archivePath = join(WORK_DIR, 'patch.zip');

try {
  execSync(
    `"${SEVENZIP_EXE}" a -tzip -mx=5 -mmt=on "${archivePath}" *`,
    { cwd: WORK_DIR, stdio: ['pipe', 'inherit', 'inherit'], timeout: 120000 }
  );
} catch { /* 7z 可能返回非零但文件已生成 */ }

if (!existsSync(archivePath)) {
  console.error('❌ 压缩失败');
  cleanup(WORK_DIR);
  process.exit(1);
}

const archiveSize = statSync(archivePath).size;
console.log(`   压缩后: ${(archiveSize / 1024 / 1024).toFixed(1)} MB`);

// ═══════════════════════════════════════════════════
//  步骤 5：合并 C# 安装器外壳 + zip 补丁 = 最终 exe
// ═══════════════════════════════════════════════════
console.log('🔧 生成自解压安装器...');

const tag = OLD_VERSION ? `patch-v${OLD_VERSION}` : `full-v${NEW_VERSION}`;
const OUTPUT_NAME = `${tag}.exe`;
const outputPath = join(RELEASE_DIR, OUTPUT_NAME);
const launcherExe = join(TOOLS_DIR, 'patch-launcher.exe');

// 编译 C# 外壳
if (!existsSync(launcherExe)) {
  console.log('   ⚙️  编译 C# 安装器外壳...');
  const cscPath = 'C:\\Windows\\Microsoft.NET\\Framework\\v4.0.30319\\csc.exe';
  const csSrc = join(TOOLS_DIR, 'patch-launcher.cs');
  const refs = '/reference:System.Windows.Forms.dll /reference:System.IO.Compression.FileSystem.dll /reference:System.IO.Compression.dll';
  try {
    execSync(`"${cscPath}" /target:winexe /out:"${launcherExe}" ${refs} "${csSrc}"`,
      { stdio: ['pipe', 'inherit', 'inherit'], timeout: 30000 });
  } catch (err) {
    console.error('❌ C# 编译失败:', err.message);
    cleanup(WORK_DIR);
    process.exit(1);
  }
}

// 合并：C# 外壳 + zip 数据 + 8 字节长度标记
console.log('   🔗 合并补丁安装器...');
try {
  // 原生 Node.js 合并，彻底避免 shell 转义问题
  const launcherBuf = readFileSync(launcherExe);
  const zipBuf      = readFileSync(archivePath);
  const lenBuf      = Buffer.alloc(8);

  // zip 长度以小端序写入 8 字节
  lenBuf.writeUInt32LE(zipBuf.length, 0);

  // 合并：外壳 + zip + 长度
  const combined = Buffer.concat([launcherBuf, zipBuf, lenBuf]);
  writeFileSync(outputPath, combined);

  console.log('   ✅ 合并成功');
} catch (err) {
  console.error('❌ 合并失败:', err.message);
  cleanup(WORK_DIR);
  process.exit(1);
}

if (!existsSync(outputPath)) {
  console.error('❌ 合并失败');
  cleanup(WORK_DIR);
  process.exit(1);
}

// ═══════════════════════════════════════════════════
//  步骤 6：保存新快照
// ═══════════════════════════════════════════════════
function saveSnapshot() {
  const snapshot = {};
  for (const f of distFiles) {
    snapshot[f.rel] = f.hash;
  }
  snapshot['__meta__'] = { version: NEW_VERSION, count: distFiles.length };
  writeFileSync(
    join(RELEASE_DIR, `.dist-snapshot-v${NEW_VERSION}.json`),
    JSON.stringify(snapshot, null, 2),
    'utf-8'
  );
}

saveSnapshot();

// ═══════════════════════════════════════════════════
//  完成！
// ═══════════════════════════════════════════════════
const size = statSync(outputPath).size;
const sizeMB = (size / 1024 / 1024).toFixed(1);
console.log(`\n✅ 生成成功！`);
console.log(`   路径: ${outputPath}`);
console.log(`   大小: ${sizeMB} MB`);
console.log(`   版本: v${OLD_VERSION || '首次'} → v${NEW_VERSION}`);

if (OLD_VERSION) {
  console.log(`\n   📢 发版流程：`);
  console.log(`   1. 把 ${OUTPUT_NAME} 发给粉丝`);
  console.log(`   2. 粉丝双击 → 选游戏目录 → 自动安装 ✨\n`);
  console.log(`   🧪 你也可以本地测试：`);
  console.log(`      copy \\"${outputPath}\\" \\"C:\\Users\\Da_hua_Ezreal\\Desktop\\${PRODUCT_NAME}\\"`);
  console.log(`      在桌面上双击测试补丁效果\n`);
} else {
  console.log(`\n   📢 已建立文件快照，下次修 BUG 后再跑就能出差量补丁了！\n`);
}

// 清理
cleanup(WORK_DIR);

function cleanup(dir) {
  if (!existsSync(dir)) return;
  for (const f of readdirSync(dir)) {
    const full = join(dir, f);
    try {
      if (statSync(full).isDirectory()) {
        execSync(`rmdir /s /q "${full}"`, { stdio: 'ignore' });
      } else {
        unlinkSync(full);
      }
    } catch { /* ignore */ }
  }
}
