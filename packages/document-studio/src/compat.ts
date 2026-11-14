import type { JSONContent } from '@tiptap/core';
import type { Schema } from '@tiptap/pm/model';
import { DEFAULT_PAGE, CONTENT_FIELDS } from './types';

/**
 * What v0.1.0 (tag v0.1.0-baseline) could store, frozen. A document that uses only this stays content schema 1, so
 * v0.1.0 can open it; anything outside it makes the document schema 2.
 *
 * Generated from the v0.1.0 editor schema (the same Tiptap 3.33.1 extensions, configured as at the tag): every node
 * and mark type with each attribute's default. Never edit: later features are measured against it.
 */
export const V010_VOCABULARY = {
  nodes: {
    doc: {},
    text: {},
    paragraph: { textAlign: null },
    heading: { textAlign: null, level: 1 },
    blockquote: {},
    bulletList: {},
    orderedList: { start: 1, type: null },
    listItem: {},
    codeBlock: { language: null },
    hardBreak: {},
    horizontalRule: {},
    table: {},
    tableRow: {},
    tableCell: { colspan: 1, rowspan: 1, colwidth: null, align: null },
    tableHeader: { colspan: 1, rowspan: 1, colwidth: null, align: null },
    image: { src: null, alt: null, title: null, width: null, height: null },
    pageBreak: {},
    tableOfContents: {},
  },
  marks: {
    bold: {},
    italic: {},
    underline: {},
    strike: {},
    code: {},
    subscript: {},
    superscript: {},
    link: { href: null, target: '_blank', rel: 'noopener noreferrer nofollow', class: null, title: null },
    highlight: { color: null },
    textStyle: { backgroundColor: null, color: null, fontFamily: null, fontSize: null, lineHeight: null },
  },
  /** Top-level fields of the stored content. */
  contentFields: ['schemaVersion', 'doc', 'page', 'mode'],
  /** Editing modes v0.1.0 stored. */
  modes: ['simple', 'advanced'],
  /** Page settings fields and the values v0.1.0 accepted where they are a closed set. */
  page: {
    fields: ['size', 'orientation', 'margins', 'header', 'footer', 'pageNumbers'],
    sizes: ['A4', 'Letter'],
    orientations: ['portrait', 'landscape'],
    margins: ['top', 'right', 'bottom', 'left'],
  },
} as const satisfies Vocabulary;

/**
 * What Release 0.2 up to Phase 5 (git 8f772ba) could store, frozen. A document that uses only this stays content
 * schema 2 (or 1, see V010_VOCABULARY), so the Phase 4 and Phase 5 builds still open it for editing; anything outside
 * it makes the document schema 3, which those builds open read-only (their DOCUMENT_SCHEMA is 2).
 *
 * Generated from the 8f772ba editor schema (documentExtensions(), Tiptap 3.33.1): every node and mark type with each
 * attribute's default, plus the content fields, editing modes and page settings that build knew. NEVER EDIT: a
 * Phase 6 or later attribute is measured against it, so a new attribute left at its default (null) keeps a document
 * at schema 2, and any other value makes it schema 3. See docs/adr/0013-document-diagram-integration.md.
 */
export const V020_VOCABULARY = {
  nodes: {
    doc: {},
    text: {},
    paragraph: { textAlign: null, lineSpacing: null, spaceBefore: null, spaceAfter: null, indentLeft: null, indentRight: null, indentFirstLine: null, paragraphStyle: null },
    heading: { textAlign: null, lineSpacing: null, spaceBefore: null, spaceAfter: null, indentLeft: null, indentRight: null, indentFirstLine: null, level: 1 },
    blockquote: {},
    bulletList: { bulletStyle: null },
    orderedList: { numberFormat: null, start: 1, type: null },
    listItem: {},
    codeBlock: { language: null },
    hardBreak: {},
    horizontalRule: {},
    table: {},
    tableRow: {},
    tableCell: { colspan: 1, rowspan: 1, colwidth: null, align: null },
    tableHeader: { colspan: 1, rowspan: 1, colwidth: null, align: null },
    image: { src: null, alt: null, title: null, width: null, height: null, align: null, caption: null },
    pageBreak: {},
    tableOfContents: {},
    diagram: { source: null, previewId: null, naturalWidth: 400, naturalHeight: 300, width: 400, height: 300, title: '' },
    inlineMath: { latex: '' },
    blockMath: { latex: '' },
    shape: { kind: 'rect', width: 160, height: 100, fill: '#dbeafe', stroke: '#1d4ed8', strokeWidth: 2, text: '', align: 'center' },
    textBox: { float: 'inline', width: null, fill: 'none', borderColor: '#64748b', borderWidth: 1 },
    sectionBreak: { breakType: 'nextPage', orientation: null, columns: null, columnSpacing: null, numberFormat: null, numberStart: null },
  },
  marks: {
    bold: {},
    italic: {},
    underline: {},
    strike: {},
    code: {},
    subscript: {},
    superscript: {},
    link: { href: null, target: '_blank', rel: 'noopener noreferrer nofollow', class: null, title: null },
    highlight: { color: null },
    textStyle: { backgroundColor: null, color: null, fontFamily: null, fontSize: null, lineHeight: null },
    comment: { commentId: null },
  },
  contentFields: ['schemaVersion', 'doc', 'page', 'mode', 'comments', 'language'],
  modes: ['simple', 'advanced'],
  page: {
    fields: ['size', 'orientation', 'margins', 'header', 'footer', 'pageNumbers', 'columns', 'columnSpacing', 'pageNumberFormat', 'pageNumberStart', 'pageNumberAlign', 'pageNumberText', 'headerLeft', 'headerRight', 'footerLeft', 'footerRight', 'firstPage'],
    sizes: ['A3', 'A4', 'A5', 'Letter', 'Legal'],
    orientations: ['portrait', 'landscape'],
    margins: ['top', 'right', 'bottom', 'left'],
    /** Page fields whose values were a closed set in that build. */
    choices: {
      columns: [1, 2, 3],
      pageNumberFormat: ['decimal', 'lowerRoman', 'upperRoman', 'lowerLetter', 'upperLetter'],
      pageNumberAlign: ['left', 'center', 'right'],
      pageNumberText: ['pageOfTotal', 'page', 'number'],
    },
  },
} as const satisfies Vocabulary;

/** The shape of a frozen vocabulary (V010_VOCABULARY, V020_VOCABULARY). */
export interface Vocabulary {
  nodes: Record<string, Record<string, unknown>>;
  marks: Record<string, Record<string, unknown>>;
  contentFields: readonly string[];
  modes: readonly string[];
  page: {
    fields: readonly string[];
    sizes: readonly string[];
    orientations: readonly string[];
    margins: readonly string[];
    choices?: Readonly<Record<string, readonly unknown[]>>;
  };
}

type AttrTable = Record<string, Record<string, unknown>>;

function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === undefined || b === undefined) return a == null && b == null;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

/**
 * Whether an attribute value is new to a vocabulary. Attributes the vocabulary had are never new (whatever their
 * value). An attribute added later is new only when it holds something other than its default, since the editor
 * writes every attribute, defaults included, into the stored JSON.
 */
function novelAttr(vocab: Vocabulary, kind: 'nodes' | 'marks', type: string, name: string, value: unknown, schema?: Schema): boolean {
  const known = (vocab[kind] as AttrTable)[type];
  if (known && Object.hasOwn(known, name)) return false;
  if (value === null || value === undefined) return false;
  const spec = kind === 'nodes' ? schema?.nodes[type]?.spec.attrs?.[name] : schema?.marks[type]?.spec.attrs?.[name];
  return !(spec && sameValue(value, spec.default));
}

/**
 * The first thing in a document body that the vocabulary's build could not store, or null. By default the vocabulary
 * is v0.1.0's (schema 1); pass V020_VOCABULARY to ask what makes a document schema 3.
 */
export function docNovelty(doc: JSONContent, schema?: Schema, vocab: Vocabulary = V010_VOCABULARY): string | null {
  const NODES = vocab.nodes as AttrTable;
  const MARKS = vocab.marks as AttrTable;
  const visit = (n: JSONContent): string | null => {
    const type = n.type ?? '';
    if (!Object.hasOwn(NODES, type)) return `node ${type}`;
    for (const [name, value] of Object.entries(n.attrs ?? {})) if (novelAttr(vocab, 'nodes', type, name, value, schema)) return `attribute ${type}.${name}`;
    for (const mark of n.marks ?? []) {
      if (!Object.hasOwn(MARKS, mark.type)) return `mark ${mark.type}`;
      for (const [name, value] of Object.entries(mark.attrs ?? {})) if (novelAttr(vocab, 'marks', mark.type, name, value, schema)) return `attribute ${mark.type}.${name}`;
    }
    for (const child of n.content ?? []) {
      const found = visit(child);
      if (found) return found;
    }
    return null;
  };
  return visit(doc);
}

/**
 * The first thing outside the body (page settings, top-level fields) that the vocabulary's build could not store, or
 * null (v0.1.0's vocabulary by default; see docNovelty).
 */
export function contentNovelty(content: Record<string, unknown>, vocab: Vocabulary = V010_VOCABULARY): string | null {
  const { page: P, contentFields } = vocab;
  for (const [key, value] of Object.entries(content)) {
    if ((contentFields as readonly string[]).includes(key) || value === undefined) continue;
    const field = CONTENT_FIELDS[key];
    if (!field || !sameValue(value, field.default)) return `field ${key}`;
  }
  if (content.mode !== undefined && content.mode !== null && !(vocab.modes as readonly unknown[]).includes(content.mode)) return `mode ${String(content.mode)}`;
  const page = content.page && typeof content.page === 'object' ? (content.page as Record<string, unknown>) : {};
  for (const [key, value] of Object.entries(page)) {
    if ((P.fields as readonly string[]).includes(key) || value === undefined) continue;
    if (!Object.hasOwn(DEFAULT_PAGE, key) || !sameValue(value, (DEFAULT_PAGE as unknown as Record<string, unknown>)[key])) return `page.${key}`;
  }
  if (page.size !== undefined && !(P.sizes as readonly unknown[]).includes(page.size)) return `page.size ${String(page.size)}`;
  if (page.orientation !== undefined && !(P.orientations as readonly unknown[]).includes(page.orientation)) return `page.orientation ${String(page.orientation)}`;
  const margins = page.margins && typeof page.margins === 'object' ? Object.keys(page.margins) : [];
  const extra = margins.find((k) => !(P.margins as readonly string[]).includes(k));
  if (extra) return `page.margins.${extra}`;
  for (const [key, allowed] of Object.entries(P.choices ?? {})) {
    if (page[key] !== undefined && !allowed.some((a) => sameValue(a, page[key]))) return `page.${key} ${JSON.stringify(page[key])}`;
  }
  return null;
}
