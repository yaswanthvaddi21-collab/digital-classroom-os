import type { JSONContent } from '@tiptap/core';

/** Plain-text export. Lists keep their markers and tables become tab-separated rows. */
export function documentToText(doc: JSONContent): string {
  const lines: string[] = [];
  const inline = (n: JSONContent): string =>
    (n.content ?? []).map((c) => (c.type === 'text' ? c.text ?? '' : c.type === 'hardBreak' ? '\n' : inline(c))).join('');

  const walk = (nodes: JSONContent[] = [], indent = '') => {
    for (const n of nodes) {
      switch (n.type) {
        case 'paragraph':
        case 'heading':
          lines.push(indent + inline(n), '');
          break;
        case 'bulletList':
        case 'orderedList':
          (n.content ?? []).forEach((item, i) => {
            const marker = n.type === 'orderedList' ? `${(Number(n.attrs?.start) || 1) + i}. ` : '• ';
            const [first, ...rest] = item.content ?? [];
            lines.push(indent + marker + (first ? inline(first) : ''));
            walk(rest, indent + '   ');
          });
          lines.push('');
          break;
        case 'table':
          for (const row of n.content ?? []) lines.push(indent + (row.content ?? []).map((cell) => (cell.content ?? []).map(inline).join(' ')).join('\t'));
          lines.push('');
          break;
        case 'horizontalRule':
          lines.push('—'.repeat(20), '');
          break;
        case 'pageBreak':
          lines.push('\f');
          break;
        case 'codeBlock':
          lines.push(inline(n), '');
          break;
        case 'tableOfContents':
        case 'image':
          break;
        default:
          walk(n.content, indent);
      }
    }
  };
  walk(doc.content);
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}
