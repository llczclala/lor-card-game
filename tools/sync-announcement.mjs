// 把《公告（vX.Y.Z）.md》的正文同步进 src/data/announcements.ts 的对应条目。
// 解决的老问题：公告正文与游戏内 content 靠手抄两份，极易漂移；手册要求「逐字一致」。
//
// 用法：
//   node tools/sync-announcement.mjs 1.0.22
//   node tools/sync-announcement.mjs 1.0.22 --check     # 只对比，不写
//
// 约定：
//   - md 第一行是标题行（形如「《Snowbreak Rivals》vX.Y.Z 更新公告」），不入 content
//   - content 取标题行之后的全部正文，去掉首尾空行
//   - 模板字符串里不允许出现反引号，出现即报错退出

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const PROJECT = join(HERE, '..');
const ANNOUNCEMENTS = join(PROJECT, 'src', 'data', 'announcements.ts');
const NOTICE_DIRS = [
  'D:\\智脑系统-dsh\\agents\\game\\更新公告',
  'D:\\智脑系统\\agents\\game\\更新公告',
  join(PROJECT, '更新公告'),
];

const version = process.argv[2];
const checkOnly = process.argv.includes('--check');

if (!version) {
  console.error('用法: node tools/sync-announcement.mjs <version> [--check]');
  process.exit(1);
}

function findNotice(v) {
  for (const dir of NOTICE_DIRS) {
    const p = join(dir, `公告（v${v}）.md`);
    if (existsSync(p)) return p;
  }
  return null;
}

const mdPath = findNotice(version);
if (!mdPath) {
  console.error(`找不到公告文件：公告（v${version}）.md`);
  console.error('已查找：');
  for (const d of NOTICE_DIRS) console.error('  ' + d);
  process.exit(1);
}

const raw = readFileSync(mdPath, 'utf8');
const lines = raw.split(/\r?\n/);

// 第一行是标题行；若第一行不是标题，退化为全文当正文（但会警告）
let body;
if (/^《.*》\s*v?\d+(\.\d+)*\s*更新公告\s*$/.test(lines[0].trim())) {
  body = lines.slice(1).join('\n');
} else {
  console.warn(`⚠️ 第一行不是标准标题行，正文按全文处理：${lines[0].slice(0, 40)}…`);
  body = raw;
}
body = body.replace(/^\s*\n/, '').replace(/\s+$/, '');

if (body.includes('`')) {
  console.error('❌ 正文含反引号，会破坏 announcements.ts 的模板字符串');
  process.exit(1);
}
if (body.includes('${')) {
  console.error('❌ 正文含 ${，会被模板字符串当插值解析');
  process.exit(1);
}

const ts = readFileSync(ANNOUNCEMENTS, 'utf8');
const hadBom = ts.charCodeAt(0) === 0xfeff;
const tsBody = hadBom ? ts.slice(1) : ts;

// 定位该版本条目的 content 块
const escaped = version.replace(/\./g, '\\.');
const re = new RegExp(
  `(version:\\s*'v${escaped}',\\s*\\n\\s*date:\\s*'[^']*',\\s*\\n\\s*content:\\s*\`)([\\s\\S]*?)(\`\\s*\\n\\s*\\},)`,
);

const m = tsBody.match(re);
if (!m) {
  console.error(`❌ 在 announcements.ts 里找不到 v${version} 的条目（或结构不符合 version/date/content 顺序）`);
  process.exit(1);
}

const current = m[2];
if (current === body) {
  console.log(`✅ v${version} 正文已与公告文件一致（${body.length} 字符）`);
  process.exit(0);
}

if (checkOnly) {
  console.error(`❌ 不一致：announcements.ts ${current.length} 字符 vs 公告 md ${body.length} 字符`);
  const a = current.split('\n');
  const b = body.split('\n');
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] !== b[i]) {
      console.error(`   首个差异在第 ${i + 1} 行：`);
      console.error(`   announcements: ${(a[i] ?? '<缺失>').slice(0, 80)}`);
      console.error(`   公告 md     : ${(b[i] ?? '<缺失>').slice(0, 80)}`);
      break;
    }
  }
  process.exit(1);
}

const next = tsBody.replace(re, `$1${body}$3`);
writeFileSync(ANNOUNCEMENTS, (hadBom ? '\ufeff' : '') + next, 'utf8');
console.log(`✅ 已同步 v${version}（${body.length} 字符，BOM=${hadBom ? '保留' : '无'}）`);
