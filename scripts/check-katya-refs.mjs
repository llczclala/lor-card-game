#!/usr/bin/env node
/**
 * check-katya-refs.mjs —— 静态引用校验（抓 tsc 通过但运行时断链）
 *
 * 只读源码文本：不 import 任何业务 TS/TSX 模块，不启动 dev server，不 build。
 * 校验 cards.ts / effectRegistry.ts / imageData.ts 三者的交叉引用，
 * 以及 imageData.ts 里 import 的图片文件是否真的躺在磁盘上。
 *
 * 用法：
 *   node scripts/check-katya-refs.mjs             # 全量
 *   node scripts/check-katya-refs.mjs --katya-only # 只看凯茜娅·狂诗专项
 *
 * 退出码：有 ❌ 错误 → 1，否则 → 0
 *
 * 汇总行口径：
 *   checked N cards   = CARD_DB 里解析到的卡牌条目数
 *   M effects         = 卡牌里 effects 数组的引用条数（含重复，按引用计数）
 *   K images          = imageUrl + level2ImageUrl 的引用条数
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Windows 控制台默认代码页是 936，中文输出会变乱码；切到 UTF-8（无副作用，失败忽略）
if (process.platform === 'win32') {
  try {
    spawnSync('chcp', ['65001'], { shell: true, stdio: 'ignore' });
  } catch {
    /* ignore */
  }
}

const HERE = path.dirname(fileURLToPath(import.meta.url));
// 默认以仓库根为目标；--root=<dir> 允许对 fixture / 其他 checkout 做同一套校验（不改业务源码）
const rootArg = process.argv.find((a) => a.startsWith('--root='));
const ROOT = rootArg ? path.resolve(rootArg.slice('--root='.length)) : path.resolve(HERE, '..');
const KATYA_ONLY = process.argv.includes('--katya-only');

const KATYA_REGION = 'katya_klein_rhapsody';
// 需求文档里写的是 15 张；源码实际条目数若不同会在 ⑤ 里提示差异
const EXPECTED_KATYA_CARDS = 15;

const P = {
  cards: path.join(ROOT, 'src/data/cards.ts'),
  effects: path.join(ROOT, 'src/data/effectRegistry.ts'),
  images: path.join(ROOT, 'src/data/imageData.ts'),
  unitsDir: path.join(ROOT, 'src/image/units'),
  srcDir: path.join(ROOT, 'src'),
};

/* ─────────────────────────── 报告收集 ─────────────────────────── */

/** @type {{group:string, level:'error'|'warn'|'info', text:string}[]} */
const report = [];
const add = (group, level, text) => report.push({ group, level, text });

/* ─────────────────────────── 文本工具 ─────────────────────────── */

const readUtf8 = (p) => fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, '');

/** 跳过从 i 开始的字符串字面量，返回结束引号之后的下标 */
function skipString(s, i) {
  const q = s[i];
  i++;
  while (i < s.length) {
    const c = s[i];
    if (c === '\\') {
      i += 2;
      continue;
    }
    if (c === q) return i + 1;
    i++;
  }
  return s.length;
}

/** 跳过注释（// 与 block），返回新下标；非注释返回原下标 */
function skipComment(s, i) {
  if (s[i] === '/' && s[i + 1] === '/') {
    const nl = s.indexOf('\n', i);
    return nl === -1 ? s.length : nl;
  }
  if (s[i] === '/' && s[i + 1] === '*') {
    const e = s.indexOf('*/', i + 2);
    return e === -1 ? s.length : e + 2;
  }
  return i;
}

/** 行号（1-based） */
function lineOf(text, index) {
  let line = 1;
  for (let i = 0; i < index && i < text.length; i++) if (text[i] === '\n') line++;
  return line;
}

/**
 * 解析一个对象字面量的「顶层字段」：返回 Map<字段名, 原始值文本>
 * 只认 depth 0 的 `name:`，嵌套对象/数组里的键不会被误当成字段。
 */
function collectFields(chunk) {
  const fields = new Map();
  let i = 0;
  let depth = 0;
  while (i < chunk.length) {
    const skipped = skipComment(chunk, i);
    if (skipped !== i) {
      i = skipped;
      continue;
    }
    const ch = chunk[i];
    if (ch === "'" || ch === '"' || ch === '`') {
      i = skipString(chunk, i);
      continue;
    }
    if (depth === 0) {
      const m = /^(?:([A-Za-z_$][\w$]*)|'([^']+)'|"([^"]+)")\s*:/.exec(chunk.slice(i));
      if (m) {
        const name = m[1] || m[2] || m[3];
        let j = i + m[0].length;
        const start = j;
        let d = 0;
        while (j < chunk.length) {
          const s2 = skipComment(chunk, j);
          if (s2 !== j) {
            j = s2;
            continue;
          }
          const c = chunk[j];
          if (c === "'" || c === '"' || c === '`') {
            j = skipString(chunk, j);
            continue;
          }
          if (c === '{' || c === '[' || c === '(') d++;
          else if (c === '}' || c === ']' || c === ')') {
            if (d === 0) break;
            d--;
          } else if (c === ',' && d === 0) break;
          j++;
        }
        fields.set(name, chunk.slice(start, j).trim());
        i = j;
        continue;
      }
    }
    if (ch === '{' || ch === '[' || ch === '(') depth++;
    else if (ch === '}' || ch === ']' || ch === ')') depth--;
    i++;
  }
  return fields;
}

/** 若值文本是对象字面量，返回其花括号内部文本；否则 null */
function objectInner(valueText) {
  const open = valueText.indexOf('{');
  if (open === -1) return null;
  let i = open + 1;
  let depth = 1;
  while (i < valueText.length) {
    const sk = skipComment(valueText, i);
    if (sk !== i) {
      i = sk;
      continue;
    }
    const ch = valueText[i];
    if (ch === "'" || ch === '"' || ch === '`') {
      i = skipString(valueText, i);
      continue;
    }
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return valueText.slice(open + 1, i);
    }
    i++;
  }
  return null;
}

/**
 * 按顶层逗号切分对象体，返回 [{name, start, valueText, objectBody}]。
 * 段首的空白与注释会被跳过（卡牌/效果定义前普遍有 `// ---` 分隔注释）。
 */
function splitTopLevelMembers(body) {
  const out = [];
  let i = 0;
  let depth = 0;
  let segStart = 0;

  const push = (end) => {
    const raw = body.slice(segStart, end);
    let k = 0;
    for (;;) {
      while (k < raw.length && /\s/.test(raw[k])) k++;
      if (raw[k] === '/' && (raw[k + 1] === '/' || raw[k + 1] === '*')) {
        k = skipComment(raw, k);
        continue;
      }
      break;
    }
    const m = /^(?:([A-Za-z_$][\w$]*)|'([^']+)'|"([^"]+)")\s*:/.exec(raw.slice(k));
    if (!m) return;
    const valueText = raw.slice(k + m[0].length).trim();
    out.push({
      name: m[1] || m[2] || m[3],
      start: segStart + k,
      valueText,
      objectBody: objectInner(valueText),
    });
  };

  while (i < body.length) {
    const skipped = skipComment(body, i);
    if (skipped !== i) {
      i = skipped;
      continue;
    }
    const ch = body[i];
    if (ch === "'" || ch === '"' || ch === '`') {
      i = skipString(body, i);
      continue;
    }
    if (ch === '{' || ch === '[' || ch === '(') depth++;
    else if (ch === '}' || ch === ']' || ch === ')') depth--;
    else if (ch === ',' && depth === 0) {
      push(i);
      segStart = i + 1;
    }
    i++;
  }
  push(body.length);
  return out;
}

/**
 * 从 `const NAME ... = {` 起，取出花括号内的对象体。
 * @returns {{body:string, index:number}|null}
 */
function extractObjectBody(text, declName, opts = {}) {
  const re = new RegExp(
    `${opts.exportOnly ? 'export\\s+' : '(?:export\\s+)?'}const\\s+${declName}\\b[^=]*=\\s*\\{`,
  );
  const m = re.exec(text);
  if (!m) return null;
  const open = m.index + m[0].length - 1;
  let i = open + 1;
  let depth = 1;
  while (i < text.length) {
    const skipped = skipComment(text, i);
    if (skipped !== i) {
      i = skipped;
      continue;
    }
    const ch = text[i];
    if (ch === "'" || ch === '"' || ch === '`') {
      i = skipString(text, i);
      continue;
    }
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return { body: text.slice(open + 1, i), index: open + 1 };
    }
    i++;
  }
  return null;
}

const unquote = (s) => {
  const t = (s ?? '').trim();
  const m = /^'([^']*)'$/.exec(t) || /^"([^"]*)"$/.exec(t);
  return m ? m[1] : t;
};

const pickArrayStrings = (raw) => {
  const t = (raw ?? '').trim();
  if (!t.startsWith('[')) return null;
  const out = [];
  const re = /'([^']*)'|"([^"]*)"/g;
  let m;
  while ((m = re.exec(t))) out.push(m[1] ?? m[2]);
  return out;
};

/** 递归列出目录下指定后缀的文件（相对 ROOT 的正斜杠路径） */
function walk(dir, exts, acc = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, exts, acc);
    else if (exts.some((x) => e.name.toLowerCase().endsWith(x))) {
      acc.push(path.relative(ROOT, full).split(path.sep).join('/'));
    }
  }
  return acc;
}

/* ─────────────────────────── 1. 解析 cards.ts ─────────────────────────── */

const cardsText = readUtf8(P.cards);

const cardDbBody = extractObjectBody(cardsText, 'CARD_DB', { exportOnly: true });
if (!cardDbBody) {
  console.error(`❌ 无法在 ${P.cards} 定位 CARD_DB 对象体，脚本的文本解析前提已失效。`);
  process.exit(2);
}

/** @type {{key:string, line:number, fields:Map<string,string>}[]} */
const cards = splitTopLevelMembers(cardDbBody.body).map((m) => ({
  key: m.name,
  line: lineOf(cardsText, cardDbBody.index + m.start),
  fields: collectFields(m.objectBody ?? m.valueText),
}));

const cardKeys = new Set(cards.map((c) => c.key));

/* ─────────────────────────── 2. 解析 effectRegistry.ts ─────────────────────────── */

const effectText = readUtf8(P.effects);
const effectDbBody = extractObjectBody(effectText, 'EFFECT_DB', { exportOnly: true });
if (!effectDbBody) {
  console.error(`❌ 无法在 ${P.effects} 定位 EFFECT_DB 对象体。`);
  process.exit(2);
}
const effectKeys = new Set(splitTopLevelMembers(effectDbBody.body).map((m) => m.name));

/* ─────────────────────────── 3. 解析 imageData.ts ─────────────────────────── */

const imageText = readUtf8(P.images);

// 3.1 import 语句：变量名 → 相对路径（顺带抓行尾注释，用于「这张图是谁的」语义核对）
/** @type {{name:string, spec:string, line:number, comment:string}[]} */
const imageImports = [];
{
  const re = /import\s+([A-Za-z_$][\w$]*)\s+from\s+['"]([^'"]+)['"]\s*;?[ \t]*(?:\/\/[ \t]*(.*))?$/gm;
  let m;
  while ((m = re.exec(imageText))) {
    if (!m[2].startsWith('.')) continue;
    imageImports.push({
      name: m[1],
      spec: m[2],
      line: lineOf(imageText, m.index),
      comment: (m[3] ?? '').trim(),
    });
  }
}
const importVarSet = new Set(imageImports.map((x) => x.name));

// 3.2 各图片常量对象的顶层成员
function objectMembers(declName) {
  const got = extractObjectBody(imageText, declName, { exportOnly: true });
  if (!got) return null;
  return splitTopLevelMembers(got.body).map((m) => ({
    name: m.name,
    valueText: m.valueText,
    fields: collectFields(m.objectBody ?? m.valueText),
    line: lineOf(imageText, got.index + m.start),
  }));
}

const SPELL = objectMembers('SPELL_IMAGES');
const TEST = objectMembers('TEST_IMAGES');
const TITAN = objectMembers('TITAN_IMAGES');
const HERO = objectMembers('HERO_IMAGES');
const PLACEHOLDER = objectMembers('PLACEHOLDER_IMAGES');

const SPELL_KEYS = new Set((SPELL ?? []).map((x) => x.name));
const TEST_KEYS = new Set((TEST ?? []).map((x) => x.name));
const TITAN_KEYS = new Set((TITAN ?? []).map((x) => x.name));
const PLACEHOLDER_KEYS = new Set((PLACEHOLDER ?? []).map((x) => x.name));
/** HERO_IMAGES: key → Set<'base'|'level2'> */
const HERO_KEYS = new Map((HERO ?? []).map((x) => [x.name, new Set(x.fields.keys())]));

// 3.3 CARD_KEY_MAP：短 key → 完整 cardKey
const ckm = extractObjectBody(imageText, 'CARD_KEY_MAP');
if (!ckm) {
  console.error(`❌ 无法在 ${P.images} 定位 CARD_KEY_MAP 对象体。`);
  process.exit(2);
}
const CARD_KEY_MAP = new Map(splitTopLevelMembers(ckm.body).map((m) => [m.name, unquote(m.valueText)]));

// 3.4 defaultUnitImages：由 src/image/units/*.webp 的文件名推导（复刻 imageData.ts 的 glob 规则）
const unitFiles = fs
  .readdirSync(P.unitsDir)
  .filter((f) => f.toLowerCase().endsWith('.webp'));
const defaultUnitImages = new Set();
const skippedGlobFiles = new Set(['sw9h44lcpvqcp684nh493gz3qt5pjsi']);
for (const f of unitFiles) {
  const fn = f.replace(/\.webp$/i, '');
  if (skippedGlobFiles.has(fn)) continue;
  if (fn === 'Mirror' || fn === 'Mirror_pupu') {
    defaultUnitImages.add(fn);
    continue;
  }
  const m = /^(.+)_(\d{2})$/.exec(fn);
  if (m && parseInt(m[2], 10) === 0) defaultUnitImages.add(m[1].replace(/-/g, '_'));
}

// 3.5 UNIT_IMAGES 的真实键集合：CARD_KEY_MAP 短 key ∩（其 cardKey 有 _00 默认图）+ Mirror 特例
const UNIT_KEYS = new Set();
const UNIT_BROKEN = new Map(); // shortKey → cardKey（映射了但没图）
for (const [shortKey, cardKey] of CARD_KEY_MAP) {
  if (defaultUnitImages.has(cardKey)) UNIT_KEYS.add(shortKey);
  else UNIT_BROKEN.set(shortKey, cardKey);
}
for (const k of ['Mirror', 'Mirror_pupu']) {
  if (defaultUnitImages.has(k)) UNIT_KEYS.add(k);
}

/* ─────────────────────────── 4. 检查 ① effect 引用 ─────────────────────────── */

let effectRefCount = 0;
/** @type {Set<string>} */
const referencedEffects = new Set();

for (const card of cards) {
  const raw = card.fields.get('effects');
  if (raw === undefined) continue;
  const list = pickArrayStrings(raw);
  if (list === null) {
    add('①', 'warn', `${card.key} 的 effects 不是字面量数组，无法静态校验（cards.ts:${card.line}）→ ${raw.slice(0, 60)}`);
    continue;
  }
  for (const eff of list) {
    effectRefCount++;
    referencedEffects.add(eff);
    if (!effectKeys.has(eff)) {
      add('①', 'error', `卡 ${card.key} → 缺失 effect: ${eff}（cards.ts:${card.line}）`);
    }
  }
}

// 反向：注册表里定义了、但没有任何卡引用（可能是拼错后的孤儿，也可能是给逻辑层动态调用的）
const orphanEffects = [...effectKeys].filter((k) => !referencedEffects.has(k));

/* ─────────────────────────── 5. 检查 ② 图片引用 ─────────────────────────── */

const IMAGE_ROOTS = {
  UNIT_IMAGES: { keys: UNIT_KEYS, label: 'UNIT_IMAGES' },
  SPELL_IMAGES: { keys: SPELL_KEYS, label: 'SPELL_IMAGES' },
  TEST_IMAGES: { keys: TEST_KEYS, label: 'TEST_IMAGES' },
  TITAN_IMAGES: { keys: TITAN_KEYS, label: 'TITAN_IMAGES' },
  PLACEHOLDER_IMAGES: { keys: PLACEHOLDER_KEYS, label: 'PLACEHOLDER_IMAGES' },
};

let imageRefCount = 0;
/** 卡 key → 该卡用到的图片引用（给 ⑤ 用） */
const cardImageRefs = new Map();

function checkImageExpr(card, fieldName, expr) {
  imageRefCount++;
  const text = expr.trim();
  const trail = fieldName === 'level2ImageUrl' ? '（level2ImageUrl）' : '';
  const refs = cardImageRefs.get(card.key) ?? [];
  refs.push(text);
  cardImageRefs.set(card.key, refs);

  const dot = /^([A-Za-z_$][\w$]*)((?:\.[A-Za-z_$][\w$]*)+)$/.exec(text);
  if (!dot) {
    add('②', 'info', `卡 ${card.key} 的 ${fieldName} 不是可静态解析的图片引用：${text}（cards.ts:${card.line}）`);
    return;
  }
  const [root, ...chain] = [dot[1], ...dot[2].split('.').slice(1)];

  if (root === 'HERO_IMAGES') {
    const heroKey = chain[0];
    const sub = chain[1];
    const subs = HERO_KEYS.get(heroKey);
    if (!subs) {
      add('②', 'error', `卡 ${card.key} → HERO_IMAGES.${heroKey} 不存在${trail}（cards.ts:${card.line}）`);
    } else if (!sub || !subs.has(sub)) {
      add('②', 'error', `卡 ${card.key} → HERO_IMAGES.${heroKey}.${sub ?? '(缺子键)'} 不存在，实有子键：${[...subs].join('/')}${trail}（cards.ts:${card.line}）`);
    }
    return;
  }

  const bucket = IMAGE_ROOTS[root];
  if (!bucket) {
    add('②', 'info', `卡 ${card.key} 使用了未纳入校验的图片根：${root}${trail}（cards.ts:${card.line}）`);
    return;
  }
  const key = chain[0];
  if (chain.length > 1) {
    add('②', 'warn', `卡 ${card.key} 的图片引用层级异常：${text}${trail}（cards.ts:${card.line}）`);
    return;
  }
  if (bucket.keys.has(key)) {
    // UNIT_IMAGES 额外要求短 key 已在 CARD_KEY_MAP 登记 —— 上面 UNIT_KEYS 已按此构建，
    // 这里把「登记了但 cardKey 缺 _00 图」单独点出来，这是「卡面碎」的真正成因。
    if (root === 'UNIT_IMAGES' && UNIT_BROKEN.has(key)) {
      const ck = UNIT_BROKEN.get(key);
      add('②', 'error', `卡 ${card.key} → UNIT_IMAGES.${key} 存在但是 undefined：CARD_KEY_MAP 映射到 ${ck}，而 src/image/units/ 下没有 ${ck}_00.webp（cards.ts:${card.line}）`);
    }
    return;
  }
  // 不存在：区分「压根没登记」和「登记了但没图」
  if (root === 'UNIT_IMAGES') {
    if (UNIT_BROKEN.has(key)) {
      const ck = UNIT_BROKEN.get(key);
      add('②', 'error', `卡 ${card.key} → UNIT_IMAGES.${key} 为 undefined：CARD_KEY_MAP.${key} 指向 ${ck}，但 src/image/units/ 下没有 ${ck}_00.webp（cards.ts:${card.line}）`);
    } else {
      add('②', 'error', `卡 ${card.key} → UNIT_IMAGES.${key} 不存在：CARD_KEY_MAP 里没有 ${key} 这条短 key 登记（cards.ts:${card.line}）`);
    }
  } else {
    add('②', 'error', `卡 ${card.key} → ${root}.${key} 不存在${trail}（cards.ts:${card.line}）`);
  }
}

for (const card of cards) {
  const img = card.fields.get('imageUrl');
  if (img !== undefined) checkImageExpr(card, 'imageUrl', img);
  const lv2 = card.fields.get('level2ImageUrl');
  if (lv2 !== undefined) checkImageExpr(card, 'level2ImageUrl', lv2);
}

// 「图借了别的卡的图」检测：SPELL_IMAGES.<另一张存在的卡的 key> —— 倾泻用滞空碎星的图就是这一类
const spellVarOf = new Map(); // SPELL_IMAGES 成员 → import 变量名
for (const s of SPELL ?? []) {
  const v = (s.valueText ?? '').trim();
  if (/^[A-Za-z_$][\w$]*$/.test(v)) spellVarOf.set(s.name, v);
}
const varUsers = new Map(); // import 变量名 → 使用它的 SPELL_IMAGES 成员
for (const [member, v] of spellVarOf) {
  if (!varUsers.has(v)) varUsers.set(v, []);
  varUsers.get(v).push(member);
}
// 通用占位图：名为 abc_* 或被 >=3 个法术共用的那张
const isSharedPlaceholder = (v) => !!v && (/^abc/i.test(v) || (varUsers.get(v)?.length ?? 0) >= 3);

const cardNameOf = new Map(cards.map((c) => [c.key, unquote(c.fields.get('name'))]));
const cardKeyByLower = new Map(cards.map((c) => [c.key.toLowerCase(), c.key]));
// 成员名与卡 key 常见两种对应：完全同小写（katya_barrage）或卡 key 带队伍前缀（Argo_Deliberate_Infiltration ↔ deliberate_infiltration）
function cardKeyForMember(member) {
  const lo = member.toLowerCase();
  if (cardKeyByLower.has(lo)) return cardKeyByLower.get(lo);
  const hit = cards.find((c) => c.key.toLowerCase().endsWith('_' + lo));
  return hit ? hit.key : null;
}

for (const card of cards) {
  const img = card.fields.get('imageUrl');
  if (!img) continue;
  const m = /^SPELL_IMAGES\.([A-Za-z_$][\w$]*)$/.exec(img.trim());
  if (!m) continue;
  const ref = m[1];
  if (ref === card.key || !cardKeys.has(ref)) continue;
  const selfVar = spellVarOf.get(card.key);
  const refVar = spellVarOf.get(ref);
  const suffix = refVar ? `（${refVar}）` : '';
  if ((selfVar && refVar && selfVar === refVar) || isSharedPlaceholder(refVar)) {
    add('②', 'info', `卡 ${card.key} 的 imageUrl 指向 ${ref} 的法术图${suffix}，但那是共用的占位图，无视觉差异（cards.ts:${card.line}）`);
  } else {
    add('②', 'warn', `卡 ${card.key} 的 imageUrl 指向了另一张卡 ${ref} 的法术图${suffix}（疑似映射复制粘贴错误，cards.ts:${card.line}）`);
  }
}

// 「import 注释说的图，被分给了别人」检测 —— 倾泻/滞空碎星错位的通用形式
{
  const nameIndex = [];
  for (const c of cards) {
    const n = cardNameOf.get(c.key);
    if (n && n.length >= 2) nameIndex.push({ key: c.key, name: n });
  }
  nameIndex.sort((a, b) => b.name.length - a.name.length);

  for (const imp of imageImports) {
    if (!imp.comment) continue;
    const users = varUsers.get(imp.name);
    if (!users || users.length === 0) continue;
    const hits = nameIndex.filter((c) => imp.comment.includes(c.name));
    if (hits.length === 0) continue;
    for (const member of users) {
      // 成员名与卡 key 可能只差大小写或队伍前缀（angelica_hazy_note ↔ Angelica_Hazy_Note）
      const memberCardKey = cardKeyForMember(member);
      const memberCardName = memberCardKey ? cardNameOf.get(memberCardKey) : null;
      if (hits.some((h) => h.name === memberCardName)) continue;
      const owner = hits[0];
      const ownerVar = spellVarOf.get(owner.key);
      const where = ownerVar
        ? `而 ${owner.key}（${owner.name}）当前用的是 ${ownerVar}`
        : `而 ${owner.key}（${owner.name}）在 SPELL_IMAGES 里没有对应成员`;
      add(
        '②',
        'warn',
        `imageData.ts:${imp.line} 的 import ${imp.name} 注释写的是「${owner.name}」，却被分配给 SPELL_IMAGES.${member}（${memberCardName ?? '非卡 key'}）—— ${where}，图与卡语义疑似错位`,
      );
    }
  }
}

// 卡内 key 字段与对象键不一致
for (const card of cards) {
  const declared = unquote(card.fields.get('key'));
  if (declared && declared !== card.key) {
    add('③', 'warn', `CARD_DB 对象键 ${card.key} 与内部 key: '${declared}' 不一致（cards.ts:${card.line}）`);
  }
}

/* ─────────────────────────── 6. 检查 ③ 卡牌互指 ─────────────────────────── */

for (const card of cards) {
  for (const field of ['associatedSpellKey', 'associatedChampionKey']) {
    const raw = card.fields.get(field);
    if (raw === undefined) continue;
    const target = unquote(raw);
    if (!target) continue;
    if (!cardKeys.has(target)) {
      add('③', 'error', `卡 ${card.key} 的 ${field} 指向不存在的卡：${target}（cards.ts:${card.line}）`);
    }
  }
  const choices = card.fields.get('choices');
  if (choices !== undefined) {
    const list = pickArrayStrings(choices);
    if (list === null) {
      add('③', 'warn', `卡 ${card.key} 的 choices 不是字面量数组，无法静态校验（cards.ts:${card.line}）`);
    } else {
      for (const ch of list) {
        if (!cardKeys.has(ch)) {
          add('③', 'error', `卡 ${card.key} 的 choices 指向不存在的卡：${ch}（cards.ts:${card.line}）`);
        }
      }
    }
  }
  const lv2 = card.fields.get('level2ImageUrl');
  if (lv2 !== undefined && !/^[A-Za-z_$][\w$]*\./.test(lv2.trim())) {
    add('③', 'warn', `卡 ${card.key} 的 level2ImageUrl 不是图片引用，可能是误填卡 key：${lv2.trim().slice(0, 60)}（cards.ts:${card.line}）`);
  }
}

/* ─────────────────────────── 7. 检查 ④ import 文件存在性 ─────────────────────────── */

const missingImports = [];
for (const imp of imageImports) {
  const abs = path.resolve(path.dirname(P.images), imp.spec);
  if (!fs.existsSync(abs)) {
    missingImports.push({ ...imp, abs });
    add('④', 'error', `imageData.ts 的 import ${imp.name} → 文件不存在：${imp.spec}（imageData.ts:${imp.line}）`);
  }
}

// 图片对象成员的值是否真是「已声明」的变量（import 丢了会运行时 undefined，tsc 也会报，
// 但这里一并兜住：手写字符串 / 改名后漏改都能抓到）
{
  const declared = new Set(importVarSet);
  const declRe = /(?:^|\n)[ \t]*(?:export\s+)?(?:const|let|var|function)\s+([A-Za-z_$][\w$]*)/g;
  let m;
  while ((m = declRe.exec(imageText))) declared.add(m[1]);

  const checks = [];
  for (const s of SPELL ?? []) checks.push(['SPELL_IMAGES', s.name, s.valueText, s.line]);
  for (const s of TEST ?? []) checks.push(['TEST_IMAGES', s.name, s.valueText, s.line]);
  for (const s of TITAN ?? []) checks.push(['TITAN_IMAGES', s.name, s.valueText, s.line]);
  for (const s of PLACEHOLDER ?? []) checks.push(['PLACEHOLDER_IMAGES', s.name, s.valueText, s.line]);
  for (const s of HERO ?? []) {
    for (const [sub, raw] of s.fields) checks.push(['HERO_IMAGES.' + s.name, sub, raw, s.line]);
  }

  for (const [label, member, raw, line] of checks) {
    const v = (raw ?? '').trim();
    if (!/^[A-Za-z_$][\w$]*$/.test(v)) continue;
    if (!declared.has(v)) {
      add('④', 'error', `${label}.${member} 的值 ${v} 在 imageData.ts 里没有声明/import（运行时为 undefined，imageData.ts:${line}）`);
    }
  }
}

/* ─────────────────────────── 8. 检查 ⑤ 凯茜娅专项 ─────────────────────────── */

const katyaCards = cards.filter((c) => c.key.startsWith('katya_'));
const katyaImageProblems = [];

if (katyaCards.length !== EXPECTED_KATYA_CARDS) {
  add('⑤', 'info', `katya_* 实际条目 ${katyaCards.length} 张，与需求文本的 ${EXPECTED_KATYA_CARDS} 张不一致（差值需人工确认是否漏卡）`);
}

for (const card of katyaCards) {
  const effects = pickArrayStrings(card.fields.get('effects') ?? '[]') ?? [];
  const region = unquote(card.fields.get('region'));
  const img = (card.fields.get('imageUrl') ?? '').trim();

  if (effects.length === 0) {
    add('⑤', 'info', `katya 待实现效果：${card.key}（effects: []，cards.ts:${card.line}）`);
  }
  for (const eff of effects) {
    if (!effectKeys.has(eff)) add('⑤', 'error', `katya 卡 ${card.key} → 缺失 effect: ${eff}`);
  }
  if (region !== KATYA_REGION) {
    add('⑤', 'warn', `katya 卡 ${card.key} 的 region 是 '${region || '(未设置)'}'，不是 '${KATYA_REGION}'（cards.ts:${card.line}）`);
  }
  const imgOk =
    /^SPELL_IMAGES\.katya_[\w$]*$/.test(img) || /^HERO_IMAGES\.katya_klein_rhapsody\.(base|level2)$/.test(img);
  if (!imgOk) {
    katyaImageProblems.push({ key: card.key, img, line: card.line });
    add('⑤', 'warn', `katya 卡 ${card.key} 的 imageUrl 未指向专属图：${img || '(空)'}（cards.ts:${card.line}）`);
  }
  // 本卡的图是否被别人借走 —— 「倾泻用滞空碎星」的镜像检查
  for (const other of cards) {
    if (other.key === card.key) continue;
    const oi = (other.fields.get('imageUrl') ?? '').trim();
    if (oi === `SPELL_IMAGES.${card.key}`) {
      add('⑤', 'warn', `katya 卡 ${card.key} 的专属法术图被 ${other.key} 引用（cards.ts:${other.line}）`);
    }
  }
}

// region 消费点是否接上
const REGION_CONSUMERS = [
  'src/components/Card.tsx',
  'src/components/SpellCard.tsx',
  'src/data/roguelike/heroTheme.ts',
  'src/components/roguelike/HeroSelectModal.tsx',
  'src/components/DeckBuilder.tsx',
  'src/components/Overlays.tsx',
];

const allSrcFiles = walk(P.srcDir, ['.ts', '.tsx']);
const byBasename = new Map();
for (const rel of allSrcFiles) {
  const b = path.basename(rel);
  if (!byBasename.has(b)) byBasename.set(b, []);
  byBasename.get(b).push(rel);
}

const resolvedConsumers = [];
for (const rel of REGION_CONSUMERS) {
  const abs = path.join(ROOT, rel);
  if (fs.existsSync(abs)) {
    resolvedConsumers.push(rel);
    continue;
  }
  const hits = byBasename.get(path.basename(rel)) ?? [];
  if (hits.length > 0) {
    for (const h of hits) resolvedConsumers.push(h);
    add('⑤', 'info', `需求写的 ${rel} 不存在，按文件名在 src/ 下找到：${hits.join(', ')}`);
  } else {
    add('⑤', 'info', `需求写的 ${rel} 不存在，且 src/ 下没有同名文件 —— 该项跳过`);
  }
}

for (const rel of resolvedConsumers) {
  const text = readUtf8(path.join(ROOT, rel));
  const has = text.includes(KATYA_REGION);
  if (!has) {
    add('⑤', 'warn', `${rel} 没有接入 '${KATYA_REGION}'（可能新阵营的配色/筛选分支漏了这一处）`);
    continue;
  }
  add('⑤', 'info', `${rel} 已接入 '${KATYA_REGION}'`);
  // 同一行里排了多个 region 的三元链，却没有 katya → 新阵营漏接在链尾
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (!/region\s*===?\s*'/.test(l)) continue;
    const regs = new Set([...l.matchAll(/region\s*===?\s*'([^']+)'/g)].map((m) => m[1]));
    if (regs.size >= 2 && !regs.has(KATYA_REGION)) {
      add('⑤', 'warn', `${rel}:${i + 1} 的 region 分支链里没有 katya（疑似漏接）→ ${l.trim().slice(0, 100)}`);
    }
  }
}

/* ─────────────────────────── 9. 输出 ─────────────────────────── */

const GROUPS = [
  { id: '①', title: 'effect 引用完整性（cards.ts → effectRegistry.ts）' },
  { id: '②', title: '图片引用完整性（cards.ts → imageData.ts）' },
  { id: '③', title: '卡牌互指（associated*Key / choices / level2ImageUrl）' },
  { id: '④', title: '图片文件实际存在性（imageData.ts import → 磁盘）' },
  { id: '⑤', title: '凯茜娅·狂诗 专项' },
];

const countErrors = report.filter((r) => r.level === 'error').length;
const countWarns = report.filter((r) => r.level === 'warn').length;
const katyaErrors = report.filter((r) => r.group === '⑤' && r.level === 'error').length;
const katyaWarns = report.filter((r) => r.group === '⑤' && r.level === 'warn').length;

const MARK = { error: '❌ 错误', warn: '⚠️ 警告', info: 'ℹ️ 信息' };

const out = [];
out.push('');
out.push('════════ 尘白禁区 · 静态引用校验（只读文本，不 import 业务模块）════════');
out.push(`root   : ${ROOT}`);
out.push(`mode   : ${KATYA_ONLY ? '--katya-only（只看 ⑤）' : 'full'}`);
out.push(`inputs : src/data/cards.ts · effectRegistry.ts · imageData.ts · src/image/units/*.webp`);
out.push('');

for (const g of GROUPS) {
  if (KATYA_ONLY && g.id !== '⑤') continue;
  const items = report.filter((r) => r.group === g.id);
  out.push(`【${g.id} ${g.title}】`);
  if (items.length === 0) {
    out.push('  ✅ 无问题');
  } else {
    for (const lv of ['error', 'warn', 'info']) {
      const bucket = items.filter((r) => r.level === lv);
      if (bucket.length === 0) continue;
      out.push(`  ${MARK[lv]}（${bucket.length}）`);
      for (const it of bucket) out.push(`    · ${it.text}`);
    }
  }
  out.push('');

  // 该组的附加统计
  if (g.id === '①') {
    out.push(`  ℹ️ 注册表共 ${effectKeys.size} 条定义，卡牌引用 ${referencedEffects.size} 条去重 / ${effectRefCount} 条次；未被任何卡引用的定义 ${orphanEffects.length} 条`);
    if (!KATYA_ONLY && orphanEffects.length > 0) {
      out.push(`  ℹ️ 未被任何卡引用的 effect（前 12 条，可能由逻辑层动态调用，仅作提示）：`);
      out.push(`    ${orphanEffects.slice(0, 12).join(', ')}${orphanEffects.length > 12 ? ' …' : ''}`);
    }
  }
  if (g.id === '②' && !KATYA_ONLY) {
    out.push(`  ℹ️ UNIT_IMAGES 可用短 key ${UNIT_KEYS.size} 条；CARD_KEY_MAP 登记 ${CARD_KEY_MAP.size} 条；units 目录 ${unitFiles.length} 个 webp`);
    out.push(`  ℹ️ SPELL_IMAGES ${SPELL?.length ?? 0} 条 / HERO_IMAGES ${HERO?.length ?? 0} 条 / TEST_IMAGES ${TEST?.length ?? 0} 条 / TITAN_IMAGES ${TITAN?.length ?? 0} 条`);
  }
  if (g.id === '④' && !KATYA_ONLY) {
    out.push(`  ℹ️ 已校验 ${imageImports.length} 条相对 import，缺失 ${missingImports.length} 条`);
  }
  if (g.id === '⑤') {
    out.push(`  ℹ️ katya 卡 ${katyaCards.length} 张；imageUrl 未指向专属图 ${katyaImageProblems.length} 张；region 消费点已解析 ${resolvedConsumers.length} 个文件`);
  }
}

if (KATYA_ONLY && countErrors + countWarns > katyaErrors + katyaWarns) {
  out.push(`  ℹ️ --katya-only 已折叠其余组的问题：${countErrors - katyaErrors} errors / ${countWarns - katyaWarns} warnings（去掉 --katya-only 查看）`);
  out.push('');
}

out.push('──────────────────────────────────────────────');
out.push(
  `checked ${cards.length} cards / ${effectRefCount} effects / ${imageRefCount} images, ${countErrors} errors, ${countWarns} warnings`,
);
out.push(countErrors > 0 ? '结果：存在断链，退出码 1' : '结果：未发现断链，退出码 0');

process.stdout.write(out.join('\n') + '\n');
process.exit(countErrors > 0 ? 1 : 0);
