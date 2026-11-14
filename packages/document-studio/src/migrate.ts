import type { JSONContent } from '@tiptap/core';
import { contentNovelty, docNovelty, V020_VOCABULARY } from './compat';
import { documentSchema } from './schema';
import { normalizeDocument, type DocumentContent } from './types';

/**
 * Newest document content schema this build reads and writes.
 * 1 = v0.1.0. 2 = uses something v0.1.0 cannot store (embedded diagrams and every Release 0.2 addition up to Phase 5:
 * V020_VOCABULARY in compat.ts). 3 = uses something the Phase 5 build cannot store (Phase 6 and later: a new node,
 * mark, attribute value or setting outside V020_VOCABULARY). Each document is stored under the lowest number its
 * content needs (contentSchemaFor), so older builds keep editing what they can represent and open the rest read-only.
 */
export const DOCUMENT_SCHEMA = 3;

/**
 * Ordered upgraders: UPGRADERS[i] turns schema i + 1 into schema i + 2. Pure functions, never edited once shipped.
 */
const UPGRADERS: Array<(content: Record<string, unknown>) => Record<string, unknown>> = [
  // 1 → 2: no structural change; schema 2 only adds vocabulary (see compat.ts).
  (c) => ({ ...c, schemaVersion: 2 }),
  // 2 → 3: no structural change; schema 3 only adds vocabulary (Phase 6, ADR 0013).
  (c) => ({ ...c, schemaVersion: 3 }),
];

/**
 * The schema a document body needs: 1 when it uses only what v0.1.0 could store (V010_VOCABULARY in compat.ts), 2
 * when it uses only what the Phase 5 build could store (V020_VOCABULARY), otherwise 3. Ordinary documents (and
 * backups of them) so remain readable by v0.1.0, and everything Phase 5 could edit stays editable there.
 */
export function schemaFor(doc: JSONContent): number {
  const schema = documentSchema();
  if (!docNovelty(doc, schema)) return 1;
  return docNovelty(doc, schema, V020_VOCABULARY) ? 3 : 2;
}

/** The schema a whole stored document needs: its body, page settings and any top-level fields (see schemaFor). */
export function contentSchemaFor(content: Pick<DocumentContent, 'doc'> & Record<string, unknown>): number {
  const schema = documentSchema();
  if (!contentNovelty(content) && !docNovelty(content.doc, schema)) return 1;
  return contentNovelty(content, V020_VOCABULARY) || docNovelty(content.doc, schema, V020_VOCABULARY) ? 3 : 2;
}

export type MigrateDocumentResult =
  | { ok: true; content: DocumentContent; repairs: string[] }
  | { ok: false; reason: 'newer'; version: number };

/**
 * Brings stored content up to the current schema and repairs known defects in older content, without ever
 * dropping user content. Content from a newer app version is refused so it can be opened read-only.
 */
export function migrateDocument(raw: unknown): MigrateDocumentResult {
  const input = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  let version = typeof input.schemaVersion === 'number' && input.schemaVersion >= 1 ? input.schemaVersion : 1;
  if (version > DOCUMENT_SCHEMA) return { ok: false, reason: 'newer', version };
  let current: Record<string, unknown> = input;
  while (version < DOCUMENT_SCHEMA) current = UPGRADERS[version++ - 1](current);
  const content = { ...normalizeDocument(current), schemaVersion: DOCUMENT_SCHEMA };
  const repairs: string[] = [];
  content.doc = repairDoc(content.doc, repairs);
  return { ok: true, content, repairs: [...new Set(repairs)] };
}

/**
 * Fixes JSON that the editor schema rejects but whose meaning is clear:
 * - empty text nodes (written by the v0.1.0 Lab report template for blank table cells), which made the whole
 *   document load blank.
 */
export function repairDoc(node: JSONContent, repairs: string[]): JSONContent {
  if (!node.content) return node;
  const content: JSONContent[] = [];
  for (const child of node.content) {
    if (child.type === 'text' && !child.text) {
      repairs.push('empty-text-node');
      continue;
    }
    content.push(repairDoc(child, repairs));
  }
  return { ...node, content };
}
