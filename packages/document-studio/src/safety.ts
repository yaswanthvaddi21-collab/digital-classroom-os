import { getSchema, type JSONContent } from '@tiptap/core';
import type { Schema } from '@tiptap/pm/model';
import { documentExtensions } from './extensions';
import { migrateDocument } from './migrate';
import { createEmptyDocument, type DocumentContent } from './types';

let schema: Schema | null = null;
export function documentSchema(): Schema {
  schema ??= getSchema(documentExtensions());
  return schema;
}

/** Returns an error message when the editor schema would reject this document, otherwise null. */
export function validateDoc(doc: JSONContent): string | null {
  try {
    documentSchema().nodeFromJSON(doc).check();
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
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
  const error = validateDoc(migrated.content.doc);
  if (!error) return { state: 'editable', content: migrated.content, repairs: migrated.repairs };
  return { state: 'protected', reason: 'invalid', detail: error, display: { ...migrated.content, doc: displaySafe(migrated.content.doc) } };
}

function textOf(node: JSONContent): string {
  if (node.type === 'text') return node.text ?? '';
  return (node.content ?? []).map(textOf).join(node.type === 'doc' ? '\n' : '');
}

/**
 * A best-effort copy for viewing only: unknown nodes become paragraphs of their text, unknown marks are dropped.
 * If the result is still not valid, falls back to plain-text paragraphs.
 */
export function displaySafe(doc: JSONContent): JSONContent {
  const s = documentSchema();
  const clean = (node: JSONContent): JSONContent | null => {
    if (node.type === 'text') {
      if (!node.text) return null;
      const marks = node.marks?.filter((m) => s.marks[m.type]);
      return { ...node, ...(marks?.length ? { marks } : { marks: undefined }) };
    }
    if (!node.type || !s.nodes[node.type]) {
      const text = textOf(node);
      return text ? { type: 'paragraph', content: [{ type: 'text', text: `[${node.type ?? 'unknown'}] ${text}` }] } : null;
    }
    const content = node.content?.map(clean).filter((c): c is JSONContent => !!c);
    return { ...node, ...(node.content ? { content } : {}) };
  };
  const cleaned = clean(doc) ?? { type: 'doc', content: [] };
  if (!validateDoc(cleaned)) return cleaned;
  const lines = textOf(doc).split('\n').filter(Boolean);
  return { type: 'doc', content: lines.length ? lines.map((t) => ({ type: 'paragraph', content: [{ type: 'text', text: t }] })) : [{ type: 'paragraph' }] };
}
