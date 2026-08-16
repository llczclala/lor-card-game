import React from 'react';

// ============================================================
// 🧩 轻量 markdown 渲染器（公告正文专用）
//
// 支持公告用到的有限语法：
//   - # / ## / ###   → 各层级标题
//   - - / 1.         → 无序/有序列表（前导两空格缩进一层）
//   - **加粗**       → 行内加粗
//   - ---            → 分隔线
//   - 空行           → 分段
//
// 安全：文本全部作为 JSX 文本节点输出，不使用 dangerouslySetInnerHTML。
// ============================================================

interface ListItem {
  text: string;
  depth: number;
}

type Block =
  | { type: 'heading'; level: number; text: string }
  | { type: 'list'; items: ListItem[] }
  | { type: 'paragraph'; text: string }
  | { type: 'hr' };

/** 行内解析：**加粗** → <strong> */
function renderInline(text: string, keyBase: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={`${keyBase}-b${i}`}>{part.slice(2, -2)}</strong>;
    }
    return <React.Fragment key={`${keyBase}-t${i}`}>{part}</React.Fragment>;
  });
}

/** 逐行解析为块结构 */
function parseBlocks(md: string): Block[] {
  const lines = md.split('\n');
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed === '') {
      i++;
      continue;
    }
    // 分隔线 ---
    if (/^(-{3,}|\*{3,})$/.test(trimmed)) {
      blocks.push({ type: 'hr' });
      i++;
      continue;
    }
    // 标题 # / ## / ###
    const headingMatch = trimmed.match(/^(#{1,3})\s+(.*)$/);
    if (headingMatch) {
      blocks.push({ type: 'heading', level: headingMatch[1].length, text: headingMatch[2] });
      i++;
      continue;
    }
    // 列表 - / 1.
    if (/^([-*+]|\d+\.)\s+/.test(trimmed)) {
      const items: ListItem[] = [];
      while (i < lines.length) {
        const l = lines[i];
        const t = l.trim();
        const m = t.match(/^([-*+]|\d+\.)\s+(.*)$/);
        if (!m) break;
        const indent = l.length - l.trimStart().length;
        items.push({ text: m[2], depth: Math.max(0, Math.floor(indent / 2)) });
        i++;
      }
      blocks.push({ type: 'list', items });
      continue;
    }
    // 段落（连续非空行合并，标题/列表会打断）
    const para: string[] = [];
    while (i < lines.length) {
      const l = lines[i];
      const t = l.trim();
      if (t === '') break;
      if (/^(#{1,3})\s+/.test(t) || /^([-*+]|\d+\.)\s+/.test(t) || /^(-{3,}|\*{3,})$/.test(t)) break;
      para.push(t);
      i++;
    }
    blocks.push({ type: 'paragraph', text: para.join(' ') });
  }

  return blocks;
}

function renderBlock(block: Block, idx: number): React.ReactNode {
  switch (block.type) {
    case 'heading':
      if (block.level === 1) {
        return <h1 key={idx} className="text-xl font-black text-white mb-3">{renderInline(block.text, `h1-${idx}`)}</h1>;
      }
      if (block.level === 3) {
        return <h3 key={idx} className="text-base font-bold text-amber-200 mt-5 mb-2">{renderInline(block.text, `h3-${idx}`)}</h3>;
      }
      return (
        <h2 key={idx} className="text-lg font-bold text-sky-300 mt-6 mb-3 border-b border-white/10 pb-2">
          {renderInline(block.text, `h2-${idx}`)}
        </h2>
      );
    case 'hr':
      return <hr key={idx} className="my-4 border-white/10" />;
    case 'list':
      return (
        <ul key={idx} className="space-y-1.5 my-2">
          {(block.items ?? []).map((item, li) => (
            <li
              key={li}
              className="text-sm leading-relaxed text-gray-200 flex items-start gap-2"
              style={{ paddingLeft: item.depth * 20 }}
            >
              <span className="w-3 shrink-0 text-sky-400/70 select-none">•</span>
              <span>{renderInline(item.text, `li-${idx}-${li}`)}</span>
            </li>
          ))}
        </ul>
      );
    case 'paragraph':
    default:
      return <p key={idx} className="text-sm leading-relaxed text-gray-200 my-2">{renderInline(block.text ?? '', `p-${idx}`)}</p>;
  }
}

/** 渲染公告 markdown 正文 */
export function renderMarkdown(md: string): React.ReactNode {
  const blocks = parseBlocks(md);
  return <div className="space-y-1">{blocks.map(renderBlock)}</div>;
}
