import type { JSONContent } from '@tiptap/core';
import { normalizeDocument, type DocumentContent } from './types';

/** Newest document content schema this build reads and writes. */
export const DOCUMENT_SCHEMA = 1;

/**
 * Ordered upgraders: UPGRADERS[i] turns schema i + 1 into schema i + 2. Pure functions, never edited once shipped.
 * Empty while the schema is still 1; the first entry arrives with Release 0.3 (sections).
 */
const UPGRADERS: Array<(content: Record<string, unknown>) => Record<string, unknown>> = [];

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
  const content = normalizeDocument(current);
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
