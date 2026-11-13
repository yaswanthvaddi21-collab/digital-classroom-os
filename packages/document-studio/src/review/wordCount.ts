import type { Node as PMNode } from '@tiptap/pm/model';

export interface TextStats {
  words: number;
  characters: number;
  charactersNoSpaces: number;
  paragraphs: number;
}

/**
 * Counts like Word: words are runs of non-space characters, characters include spaces (blocks are separated by
 * nothing, as Word does not count paragraph marks), and paragraphs are text blocks (paragraphs, headings, list
 * items, table cells' paragraphs) that contain text. Characters are UTF-16 units, as the status bar counts them
 * (the status bar also counts an image or diagram as one character; this does not).
 */
export function textStats(doc: PMNode, from = 0, to = doc.content.size): TextStats {
  let words = 0;
  let characters = 0;
  let charactersNoSpaces = 0;
  let paragraphs = 0;
  const lo = Math.max(0, from);
  const hi = Math.min(doc.content.size, to);
  if (hi <= lo) return { words: 0, characters: 0, charactersNoSpaces: 0, paragraphs: 0 };
  doc.nodesBetween(lo, hi, (node, pos) => {
    if (!node.isTextblock) return true;
    const start = Math.max(lo, pos + 1);
    const end = Math.min(hi, pos + 1 + node.content.size);
    // Inline nodes (hard breaks, images) separate words like a space does.
    const text = node.textBetween(start - pos - 1, end - pos - 1, undefined, ' ');
    if (text.trim()) paragraphs += 1;
    words += text.split(/\s+/).filter(Boolean).length;
    characters += text.length;
    charactersNoSpaces += text.replace(/\s/g, '').length;
    return false;
  });
  return { words, characters, charactersNoSpaces, paragraphs };
}
