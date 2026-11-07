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
//
// [2026-10-28 莉莉子 · 公告字号可调] 字号/行高改为**由调用方注入**（`MarkdownTone`）：
//   本文件此前把字号写死在 Tailwind 类里（正文 `text-sm` = 14 设计 px）。
//   而画布是 1680×1050 整体缩放 ⇒ 手机上 s≈0.374，正文只有 **约 5.2 CSS px**
//   （PC s≈1.03 → 14.4 CSS px，正常）⇒ 「同一份设计 px，手机读不了」。
//   ⚠️ 本渲染器**全仓只有公告面板一个使用者**，所以参数化不会波及其他屏。
//   ⚠️ 颜色 / 字重 / 间距仍走 Tailwind；**只有字号与行高**走内联 style（才可调）。
// ============================================================

/** 正文字号/行高（由调用方的调参区传入；缺省时等于本文件改造前的视觉效果） */
export interface MarkdownTone {
  /** 段落 / 列表正文字号 px（原 `text-sm` = 14） */
  bodyFont: number;
  /** 正文行高倍数（原 `leading-relaxed` = 1.625） */
  bodyLineHeight: number;
  /** 一级标题字号 px（原 `text-xl` = 20） */
  h1Font: number;
  /** 二级标题字号 px（原 `text-lg` = 18） */
  h2Font: number;
  /** 三级标题字号 px（原 `text-base` = 16） */
  h3Font: number;
  /** 列表项之间间距 px（原 `space-y-1.5` = 6） */
  listGap: number;
  /** 嵌套列表每层缩进 px（原 `depth * 20`） */
  depthIndent: number;
  /** 列表圆点占位宽 px（原 `w-3` = 12） */
  bulletWidth: number;
  /** 圆点与文字的间距 px（原 `gap-2` = 8） */
  bulletGap: number;
}

/** 缺省值 = 改造前 Tailwind 的等价值（不传 tone 时行为逐像素不变） */
export const DEFAULT_MARKDOWN_TONE: MarkdownTone = {
  bodyFont: 14,
  bodyLineHeight: 1.625,
  h1Font: 20,
  h2Font: 18,
  h3Font: 16,
  listGap: 6,
  depthIndent: 20,
  bulletWidth: 12,
  bulletGap: 8,
};

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

function renderBlock(block: Block, idx: number, tone: MarkdownTone): React.ReactNode {
  switch (block.type) {
    case 'heading':
      if (block.level === 1) {
        return (
          <h1 key={idx} className="font-black text-white mb-3" style={{ fontSize: tone.h1Font, lineHeight: 1.4 }}>
            {renderInline(block.text, `h1-${idx}`)}
          </h1>
        );
      }
      if (block.level === 3) {
        return (
          <h3 key={idx} className="font-bold text-amber-200 mt-5 mb-2" style={{ fontSize: tone.h3Font, lineHeight: 1.4 }}>
            {renderInline(block.text, `h3-${idx}`)}
          </h3>
        );
      }
      return (
        <h2 key={idx} className="font-bold text-sky-300 mt-6 mb-3 border-b border-white/10 pb-2" style={{ fontSize: tone.h2Font, lineHeight: 1.4 }}>
          {renderInline(block.text, `h2-${idx}`)}
        </h2>
      );
    case 'hr':
      return <hr key={idx} className="my-4 border-white/10" />;
    case 'list':
      return (
        <ul
          key={idx}
          className="my-2 flex flex-col"
          style={{ gap: tone.listGap }}
        >
          {(block.items ?? []).map((item, li) => (
            <li
              key={li}
              className="text-gray-200 flex items-start"
              style={{
                fontSize: tone.bodyFont,
                lineHeight: tone.bodyLineHeight,
                gap: tone.bulletGap,
                paddingLeft: item.depth * tone.depthIndent,
              }}
            >
              <span className="shrink-0 text-sky-400/70 select-none" style={{ width: tone.bulletWidth }}>•</span>
              <span>{renderInline(item.text, `li-${idx}-${li}`)}</span>
            </li>
          ))}
        </ul>
      );
    case 'paragraph':
    default:
      return (
        <p
          key={idx}
          className="text-gray-200 my-2"
          style={{ fontSize: tone.bodyFont, lineHeight: tone.bodyLineHeight }}
        >
          {renderInline(block.text ?? '', `p-${idx}`)}
        </p>
      );
  }
}

/**
 * 渲染公告 markdown 正文
 * @param md   公告正文 markdown
 * @param tone 字号/行高（来自 `ANNOUNCEMENT_UI`）；不传则用改造前的默认值
 */
export function renderMarkdown(md: string, tone: MarkdownTone = DEFAULT_MARKDOWN_TONE): React.ReactNode {
  const blocks = parseBlocks(md);
  return <div className="space-y-1">{blocks.map((b, i) => renderBlock(b, i, tone))}</div>;
}
