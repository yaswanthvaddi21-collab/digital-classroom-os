import { PRESENTATION_SCHEMA, type PresentationContent } from './types';

/**
 * Ordered upgraders: UPGRADERS[i] turns schema i + 1 into schema i + 2. Pure functions, never edited once shipped.
 * Presentations start at schema 1 (Phase 7), so there are none yet.
 */
const UPGRADERS: Array<(content: Record<string, unknown>) => Record<string, unknown>> = [];

export type MigratePresentationResult =
  | { ok: true; content: PresentationContent; repairs: string[] }
  | { ok: false; reason: 'newer'; version: number }
  | { ok: false; reason: 'unreadable'; stored: unknown };

/**
 * The content schema stored in `raw`: 1 when none is stored, `null` when one is stored but is not a whole number
 * of at least 1 (for example "2" or 2.5). An unreadable stored version is never read as 1, so such content is not
 * opened as editable schema 1 and its stored value is never overwritten.
 */
export function presentationSchemaOf(raw: unknown): number | null {
  const v = raw && typeof raw === 'object' ? (raw as Record<string, unknown>).schemaVersion : undefined;
  if (v === undefined) return 1;
  return typeof v === 'number' && Number.isInteger(v) && v >= 1 ? v : null;
}

/**
 * Brings stored content up to the current schema, on a copy: `raw` is never changed. Content from a newer app
 * version, or with a stored version that is not readable, is refused so it can be opened read-only. Whether the result is well formed is checked by safety.ts.
 */
export function migratePresentation(raw: unknown): MigratePresentationResult {
  const stored = presentationSchemaOf(raw);
  if (stored === null) return { ok: false, reason: 'unreadable', stored: (raw as Record<string, unknown>).schemaVersion };
  let version = stored;
  if (version > PRESENTATION_SCHEMA) return { ok: false, reason: 'newer', version };
  let current: Record<string, unknown> = raw && typeof raw === 'object' && !Array.isArray(raw) ? structuredClone(raw as Record<string, unknown>) : {};
  while (version < PRESENTATION_SCHEMA) current = UPGRADERS[version++ - 1](current);
  return { ok: true, content: { ...current, schemaVersion: PRESENTATION_SCHEMA } as PresentationContent, repairs: [] };
}
