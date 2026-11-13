import type { JSONContent } from '@tiptap/core';
import { migrateDocument } from './migrate';
import { documentSchema } from './schema';
import { contentProblems, createEmptyDocument, type DocumentContent } from './types';

export { documentSchema } from './schema';

/** Returns an error message when the editor schema would reject this document, otherwise null. */
export function validateDoc(doc: JSONContent): string | null {
  try {
    documentSchema().nodeFromJSON(doc).check();
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
  return unsupportedAttribute(doc);
}

/**
 * ProseMirror silently drops attributes its schema does not know, so a save would lose them. An attribute this
 * version does not know, holding a value, therefore counts as content it cannot represent.
 */
function unsupportedAttribute(doc: JSONContent): string | null {
  const s = documentSchema();
  const visit = (n: JSONContent): string | null => {
    const known = n.type ? s.nodes[n.type]?.spec.attrs ?? {} : {};
    for (const [name, value] of Object.entries(n.attrs ?? {})) if (value != null && !Object.hasOwn(known, name)) return `Unsupported attribute ${name} for node of type ${n.type}`;
    for (const mark of n.marks ?? []) {
      const markAttrs = s.marks[mark.type]?.spec.attrs ?? {};
      for (const [name, value] of Object.entries(mark.attrs ?? {})) if (value != null && !Object.hasOwn(markAttrs, name)) return `Unsupported attribute ${name} for mark of type ${mark.type}`;
    }
    for (const child of n.content ?? []) {
      const found = visit(child);
      if (found) return found;
    }
    return null;
  };
  return visit(doc);
}

export type PreparedDocument =
  | { state: 'editable'; content: DocumentContent; repairs: string[] }
  | { state: 'protected'; reason: 'newer' | 'invalid'; detail: string; display: DocumentContent };

/**
 * Decides how a stored document may be opened. Anything the editor cannot represent exactly is opened in a
 * protected read-only view built from a display copy; the stored original is never touched.
 */
export function prepareDocument(raw: unknown): PreparedDocument {
  const migrated = migrateDocument(raw);
  if (!migrated.ok) {
    const fallback = migrateDocument({ ...(raw as object), schemaVersion: 1 });
    const base = fallback.ok ? fallback.content : createEmptyDocument();
    return { state: 'protected', reason: 'newer', detail: `This document was saved by a newer version of Classroom OS (content version ${migrated.version}).`, display: { ...base, doc: displaySafe(base.doc) } };
  }
  const problems = contentProblems(raw);
  const error = problems.length ? `This version cannot keep some of this document's settings: ${problems.join('; ')}.` : validateDoc(migrated.content.doc);
  if (!error) return { state: 'editable', content: migrated.content, repairs: migrated.repairs };
  return { state: 'protected', reason: 'invalid', detail: error, display: { ...migrated.content, doc: displaySafe(migrated.content.doc) } };
}

function textOf(node: JSONContent): string {
  if (node.type === 'text') return node.text ?? '';
  return (node.content ?? []).map(textOf).join(node.type === 'doc' ? '\n' : '');
}

/**
 * A best-effort copy for viewing only: unknown nodes become paragraphs of their text, unknown marks and attributes
 * are dropped.
 * If the result is still not valid, falls back to plain-text paragraphs.
 */
export function displaySafe(doc: JSONContent): JSONContent {
  const s = documentSchema();
  const knownAttrs = (attrs: Record<string, unknown> | undefined, spec: Record<string, unknown> | undefined) =>
    attrs && Object.fromEntries(Object.entries(attrs).filter(([k]) => Object.hasOwn(spec ?? {}, k)));
  const clean = (node: JSONContent): JSONContent | null => {
    if (node.type === 'text') {
      if (!node.text) return null;
      const marks = node.marks?.filter((m) => s.marks[m.type]).map((m) => ({ ...m, attrs: knownAttrs(m.attrs, s.marks[m.type].spec.attrs) }));
      return { ...node, ...(marks?.length ? { marks } : { marks: undefined }) };
    }
    if (!node.type || !s.nodes[node.type]) {
      const text = textOf(node);
      return text ? { type: 'paragraph', content: [{ type: 'text', text: `[${node.type ?? 'unknown'}] ${text}` }] } : null;
    }
    const content = node.content?.map(clean).filter((c): c is JSONContent => !!c);
    return { ...node, attrs: knownAttrs(node.attrs, s.nodes[node.type].spec.attrs), ...(node.content ? { content } : {}) };
  };
  const cleaned = clean(doc) ?? { type: 'doc', content: [] };
  if (!validateDoc(cleaned)) return cleaned;
  const lines = textOf(doc).split('\n').filter(Boolean);
  return { type: 'doc', content: lines.length ? lines.map((t) => ({ type: 'paragraph', content: [{ type: 'text', text: t }] })) : [{ type: 'paragraph' }] };
}
