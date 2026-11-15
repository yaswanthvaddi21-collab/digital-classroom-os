/**
 * Rich text helpers for the editor: turning what Tiptap hands back into the frozen schema-1 vocabulary (compat.ts),
 * and formatting a whole text box at once (when the box is selected but its text is not being edited).
 */
import type { RichBlock, RichInline, RichListItem, RichMark, RichParagraph, RichTextDoc, TextAlign } from '../types';

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);
const ALIGNS: readonly string[] = ['left', 'center', 'right', 'justify'];
const HEX = /^#[0-9a-f]{6}$/i;

function cleanMark(m: unknown): RichMark | null {
  if (!isObj(m)) return null;
  const a = isObj(m.attrs) ? m.attrs : {};
  switch (m.type) {
    case 'bold':
    case 'italic':
    case 'underline':
    case 'strike':
    case 'subscript':
    case 'superscript':
      return { type: m.type };
    case 'link':
      // Tiptap adds target, rel and class; only the address is part of the model (renderers add the rest).
      return typeof a.href === 'string' && a.href ? { type: 'link', attrs: { href: a.href } } : null;
    case 'highlight':
      return { type: 'highlight', attrs: { color: typeof a.color === 'string' && HEX.test(a.color) ? a.color.toLowerCase() : null } };
    case 'textStyle': {
      const attrs: { color?: string; fontFamily?: string; fontSize?: string } = {};
      if (typeof a.color === 'string' && HEX.test(a.color)) attrs.color = a.color.toLowerCase();
      if (typeof a.fontFamily === 'string' && a.fontFamily.trim()) attrs.fontFamily = a.fontFamily.trim();
      if (typeof a.fontSize === 'string' && /^\d+(\.\d+)?pt$/.test(a.fontSize.trim())) attrs.fontSize = a.fontSize.trim();
      return Object.keys(attrs).length ? { type: 'textStyle', attrs } : null;
    }
    default:
      return null;
  }
}

function cleanInline(n: unknown): RichInline | null {
  if (!isObj(n)) return null;
  if (n.type === 'hardBreak') return { type: 'hardBreak' };
  if (n.type !== 'text' || typeof n.text !== 'string' || !n.text) return null;
  const marks = (Array.isArray(n.marks) ? n.marks : []).map(cleanMark).filter((m): m is RichMark => !!m);
  return marks.length ? { type: 'text', text: n.text, marks } : { type: 'text', text: n.text };
}

function cleanParagraph(n: Obj): RichParagraph {
  const align = isObj(n.attrs) && typeof n.attrs.textAlign === 'string' && ALIGNS.includes(n.attrs.textAlign) ? (n.attrs.textAlign as TextAlign) : null;
  const content = (Array.isArray(n.content) ? n.content : []).map(cleanInline).filter((c): c is RichInline => !!c);
  return { type: 'paragraph', ...(align ? { attrs: { textAlign: align } } : {}), ...(content.length ? { content } : {}) };
}

function cleanBlock(n: unknown): RichBlock[] {
  if (!isObj(n)) return [];
  if (n.type === 'paragraph') return [cleanParagraph(n)];
  if (n.type === 'bulletList' || n.type === 'orderedList') {
    const items = (Array.isArray(n.content) ? n.content : []).map(cleanItem).filter((i): i is RichListItem => !!i);
    if (!items.length) return [];
    if (n.type === 'bulletList') return [{ type: 'bulletList', content: items }];
    const start = isObj(n.attrs) && typeof n.attrs.start === 'number' && Number.isInteger(n.attrs.start) && n.attrs.start !== 1 ? n.attrs.start : null;
    return [{ type: 'orderedList', ...(start !== null ? { attrs: { start } } : {}), content: items }];
  }
  // Anything else (a heading pasted in, say) keeps its text as paragraphs.
  if (Array.isArray(n.content)) {
    const inline = n.content.every((c) => isObj(c) && (c.type === 'text' || c.type === 'hardBreak'));
    return inline ? [cleanParagraph({ content: n.content })] : n.content.flatMap(cleanBlock);
  }
  return [];
}

function cleanItem(n: unknown): RichListItem | null {
  if (!isObj(n)) return null;
  const content = (Array.isArray(n.content) ? n.content : []).flatMap(cleanBlock);
  if (!content.length) return { type: 'listItem', content: [{ type: 'paragraph' }] };
  // A list item starts with a paragraph (ProseMirror's listItem schema).
  return { type: 'listItem', content: content[0].type === 'paragraph' ? content : [{ type: 'paragraph' }, ...content] };
}

/**
 * Tiptap JSON as schema-1 rich text: only the frozen node and mark types and their attributes, no empty text, no
 * attributes left at their defaults, and always at least one paragraph.
 */
export function cleanRichText(json: unknown): RichTextDoc {
  const content = isObj(json) && Array.isArray(json.content) ? json.content.flatMap(cleanBlock) : [];
  return { type: 'doc', content: content.length ? content : [{ type: 'paragraph' }] };
}

// ── Formatting a whole text box ─────────────────────────────────────────────────────────────────────

type SimpleMark = 'bold' | 'italic' | 'underline' | 'strike';

function mapInline(doc: RichTextDoc, fn: (n: RichInline) => RichInline): RichTextDoc {
  const block = (b: RichBlock | RichListItem): RichBlock | RichListItem => {
    if (b.type === 'paragraph') return b.content ? { ...b, content: b.content.map(fn) } : b;
    return { ...b, content: (b.content as Array<RichBlock | RichListItem>).map(block) } as RichBlock | RichListItem;
  };
  return { ...doc, content: doc.content.map((b) => block(b) as RichBlock) };
}

function textNodes(doc: RichTextDoc): Array<Extract<RichInline, { type: 'text' }>> {
  const out: Array<Extract<RichInline, { type: 'text' }>> = [];
  mapInline(doc, (n) => {
    if (n.type === 'text') out.push(n);
    return n;
  });
  return out;
}

/** Whether every piece of text carries the mark (false when there is no text). */
export function allHaveMark(doc: RichTextDoc, mark: SimpleMark): boolean {
  const nodes = textNodes(doc);
  return nodes.length > 0 && nodes.every((n) => n.marks?.some((m) => m.type === mark));
}

/** Adds the mark to all text, or removes it from all text. */
export function setMarkEverywhere(doc: RichTextDoc, mark: SimpleMark, on: boolean): RichTextDoc {
  return mapInline(doc, (n) => {
    if (n.type !== 'text') return n;
    const others = (n.marks ?? []).filter((m) => m.type !== mark);
    const marks = on ? [...others, { type: mark } as RichMark] : others;
    if (marks.length) return { ...n, marks };
    const { marks: _drop, ...rest } = n;
    void _drop;
    return rest;
  });
}

/** Removes one textStyle attribute (colour, font or size) from all text, so the box's own style shows. */
export function clearTextStyleAttr(doc: RichTextDoc, attr: 'color' | 'fontFamily' | 'fontSize'): RichTextDoc {
  return mapInline(doc, (n) => {
    if (n.type !== 'text' || !n.marks?.some((m) => m.type === 'textStyle' && m.attrs?.[attr] != null)) return n;
    const marks = n.marks.flatMap((m): RichMark[] => {
      if (m.type !== 'textStyle') return [m];
      const attrs = { ...m.attrs };
      delete attrs[attr];
      return Object.values(attrs).some((v) => v != null) ? [{ type: 'textStyle', attrs }] : [];
    });
    if (marks.length) return { ...n, marks };
    const { marks: _drop, ...rest } = n;
    void _drop;
    return rest;
  });
}

/** Removes paragraph alignment from all paragraphs, so the box's own alignment shows. */
export function clearParagraphAlign(doc: RichTextDoc): RichTextDoc {
  const block = (b: RichBlock | RichListItem): RichBlock | RichListItem => {
    if (b.type === 'paragraph') {
      if (!b.attrs?.textAlign) return b;
      const { attrs: _drop, ...rest } = b;
      void _drop;
      return rest;
    }
    return { ...b, content: (b.content as Array<RichBlock | RichListItem>).map(block) } as RichBlock | RichListItem;
  };
  return { ...doc, content: doc.content.map((b) => block(b) as RichBlock) };
}

export type ListKind = 'bullet' | 'ordered' | 'none';

/** 'bullet' or 'ordered' when every block of the box is a list of that kind, else 'none'. */
export function listKindOf(doc: RichTextDoc): ListKind {
  if (doc.content.length && doc.content.every((b) => b.type === 'bulletList')) return 'bullet';
  if (doc.content.length && doc.content.every((b) => b.type === 'orderedList')) return 'ordered';
  return 'none';
}

/** Every paragraph of the box, in order, out of any list. */
function paragraphs(doc: RichTextDoc): RichParagraph[] {
  const out: RichParagraph[] = [];
  const visit = (b: RichBlock | RichListItem) => {
    if (b.type === 'paragraph') out.push(b);
    else for (const c of b.content as Array<RichBlock | RichListItem>) visit(c);
  };
  doc.content.forEach(visit);
  return out.length ? out : [{ type: 'paragraph' }];
}

/** Turns the whole box into one bulleted or numbered list (one item per paragraph), or into plain paragraphs. */
export function setListEverywhere(doc: RichTextDoc, kind: ListKind): RichTextDoc {
  const paras = paragraphs(doc);
  if (kind === 'none') return { type: 'doc', content: paras };
  const items: RichListItem[] = paras.map((p) => ({ type: 'listItem', content: [p] }));
  return { type: 'doc', content: [kind === 'bullet' ? { type: 'bulletList', content: items } : { type: 'orderedList', content: items }] };
}
