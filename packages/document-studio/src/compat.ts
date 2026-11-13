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
} as const satisfies {
  nodes: Record<string, Record<string, unknown>>;
  marks: Record<string, Record<string, unknown>>;
  contentFields: readonly string[];
  modes: readonly string[];
  page: { fields: readonly string[]; sizes: readonly string[]; orientations: readonly string[]; margins: readonly string[] };
};

type AttrTable = Record<string, Record<string, unknown>>;
const NODES = V010_VOCABULARY.nodes as AttrTable;
const MARKS = V010_VOCABULARY.marks as AttrTable;

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
 * Whether an attribute value is new to v0.1.0. Attributes v0.1.0 had are never new (whatever their value). An
 * attribute added later is new only when it holds something other than its default, since the editor writes every
 * attribute, defaults included, into the stored JSON.
 */
function novelAttr(kind: 'nodes' | 'marks', type: string, name: string, value: unknown, schema?: Schema): boolean {
  const known = (kind === 'nodes' ? NODES : MARKS)[type];
  if (known && Object.hasOwn(known, name)) return false;
  if (value === null || value === undefined) return false;
  const spec = kind === 'nodes' ? schema?.nodes[type]?.spec.attrs?.[name] : schema?.marks[type]?.spec.attrs?.[name];
  return !(spec && sameValue(value, spec.default));
}

/** The first thing in a document body that v0.1.0 could not store, or null. */
export function docNovelty(doc: JSONContent, schema?: Schema): string | null {
  const visit = (n: JSONContent): string | null => {
    const type = n.type ?? '';
    if (!Object.hasOwn(NODES, type)) return `node ${type}`;
    for (const [name, value] of Object.entries(n.attrs ?? {})) if (novelAttr('nodes', type, name, value, schema)) return `attribute ${type}.${name}`;
    for (const mark of n.marks ?? []) {
      if (!Object.hasOwn(MARKS, mark.type)) return `mark ${mark.type}`;
      for (const [name, value] of Object.entries(mark.attrs ?? {})) if (novelAttr('marks', mark.type, name, value, schema)) return `attribute ${mark.type}.${name}`;
    }
    for (const child of n.content ?? []) {
      const found = visit(child);
      if (found) return found;
    }
    return null;
  };
  return visit(doc);
}

/** The first thing outside the body (page settings, top-level fields) that v0.1.0 could not store, or null. */
export function contentNovelty(content: Record<string, unknown>): string | null {
  const { page: P, contentFields } = V010_VOCABULARY;
  for (const [key, value] of Object.entries(content)) {
    if ((contentFields as readonly string[]).includes(key) || value === undefined) continue;
    const field = CONTENT_FIELDS[key];
    if (!field || !sameValue(value, field.default)) return `field ${key}`;
  }
  if (content.mode !== undefined && content.mode !== null && !(V010_VOCABULARY.modes as readonly unknown[]).includes(content.mode)) return `mode ${String(content.mode)}`;
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
  return null;
}
