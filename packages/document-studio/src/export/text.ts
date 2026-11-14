import type { JSONContent } from '@tiptap/core';
import { listMarkerText } from '../extensions/listStyles'; // G-FORMAT
import { diagramLabels } from './diagramAssets';
import { blockMathText, captionLines, inlineMathText, shapeText, textBoxText } from './insertText'; // G-INSERT

/** Helpers handed to text handlers. */
export interface TextApi {
  /** The text of a node's inline content. */
  inline(n: JSONContent): string;
  /** Converts child blocks at an indent. */
  walk(nodes: JSONContent[] | undefined, indent: string): void;
  /** Converts child blocks to one line of text (for a table cell): every handler runs, so nothing is dropped. */
  line(nodes: JSONContent[] | undefined): string;
  /** Adds output lines. */
  push(...lines: string[]): void;
  /** The document's headings (level 1–4, with text), for the table of contents. */
  headings: Array<{ level: number; text: string }>;
}

/** Converts one block node to text lines. A node without a handler is unwrapped (its children are converted). */
export type TextHandler = (node: JSONContent, indent: string, api: TextApi) => void;

const paragraph: TextHandler = (n, indent, t) => t.push(indent + t.inline(n), '');

export const TEXT_HANDLERS: Record<string, TextHandler> = {
  paragraph,
  heading: paragraph,
  bulletList: (n, indent, t) => list(n, indent, t),
  orderedList: (n, indent, t) => list(n, indent, t),
  table: (n, indent, t) => {
    for (const row of n.content ?? []) t.push(indent + (row.content ?? []).map((cell) => t.line(cell.content)).join('\t'));
    t.push('');
  },
  horizontalRule: (_n, _indent, t) => t.push('—'.repeat(20), ''),
  pageBreak: (_n, _indent, t) => t.push('\f'),
  codeBlock: (n, _indent, t) => t.push(t.inline(n), ''),
  // Phase 6: the diagram's visible labels, indented under its line (diagramAssets.ts diagramLabels), then its caption.
  diagram: (n, indent, t) =>
    t.push(`${indent}[Diagram: ${n.attrs?.title || 'Untitled'}]`, ...diagramLabels(n.attrs?.source).map((l) => `${indent}   ${l}`), ...captionLines(n, indent), ''),
  // TD-13: never dropped silently. The table of contents lists the headings, as it does on screen.
  tableOfContents: (_n, indent, t) => t.push(indent + 'Table of Contents', ...t.headings.map((h) => `${indent}${'   '.repeat(h.level - 1)}${h.text}`), ''),
  image: (n, indent, t) => {
    const alt = String(n.attrs?.alt ?? '').trim();
    t.push(`${indent}[Image${alt ? `: ${alt}` : ''}]`, ...captionLines(n, indent), ''); // G-INSERT: and its caption
  },
  // @phase4:text-nodes — register new block nodes here.
  blockMath: blockMathText, // G-INSERT
  shape: shapeText, // G-INSERT
  textBox: textBoxText, // G-INSERT
  // G-LAYOUT: a marker line; a next-page section break also starts a new page, as a page break does.
  sectionBreak: (n, indent, t) =>
    n.attrs?.breakType === 'continuous' ? t.push(`${indent}[Section break: continuous]`, '') : t.push(`${indent}[Section break: next page]`, '\f'),
};

/** Inline nodes other than text and hard breaks. Unknown inline nodes contribute their text content. */
export const TEXT_INLINE_HANDLERS: Record<string, (n: JSONContent, inline: (n: JSONContent) => string) => string> = {
  // @phase4:text-inlines — register new inline nodes here.
  inlineMath: inlineMathText, // G-INSERT
};

function list(n: JSONContent, indent: string, t: TextApi) {
  (n.content ?? []).forEach((item, i) => {
    const marker = listMarkerText(n, i); // G-FORMAT: number formats and bullet glyphs
    const [first, ...rest] = item.content ?? [];
    t.push(indent + marker + (first ? t.inline(first) : ''));
    t.walk(rest, indent + '   ');
  });
  t.push('');
}

/** Plain-text export. Lists keep their markers and tables become tab-separated rows. */
export function documentToText(doc: JSONContent): string {
  let lines: string[] = [];
  const inline = (n: JSONContent): string =>
    (n.content ?? [])
      .map((c) => (c.type === 'text' ? c.text ?? '' : c.type === 'hardBreak' ? '\n' : c.type && TEXT_INLINE_HANDLERS[c.type] ? TEXT_INLINE_HANDLERS[c.type](c, inline) : inline(c)))
      .join('');
  const headings: TextApi['headings'] = [];
  const collect = (n: JSONContent) => {
    if (n.type === 'heading') {
      const text = inline(n).trim();
      if (text) headings.push({ level: Math.min(Math.max(Number(n.attrs?.level) || 1, 1), 4), text });
      return;
    }
    n.content?.forEach(collect);
  };
  collect(doc);
  const api: TextApi = {
    inline,
    headings,
    walk: (nodes = [], indent = '') => {
      for (const n of nodes) {
        const handler = n.type ? TEXT_HANDLERS[n.type] : undefined;
        if (handler) handler(n, indent, api);
        else api.walk(n.content, indent);
      }
    },
    push: (...l) => void lines.push(...l),
    line: (nodes = []) => {
      const outer = lines;
      lines = [];
      try {
        api.walk(nodes, '');
        // A cell is one column of a tab-separated row: its lines are joined, and tabs or page breaks would break the row.
        return lines
          .flatMap((l) => l.split(/[\n\f]/))
          .map((l) => l.replace(/\t/g, ' ').trim())
          .filter(Boolean)
          .join(' ');
      } finally {
        lines = outer;
      }
    },
  };
  api.walk(doc.content, '');
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}
