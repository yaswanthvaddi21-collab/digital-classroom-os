import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DOCUMENT_SCHEMA, migrateDocument } from './migrate';
import { displaySafe, prepareDocument, validateDoc } from './safety';
import { documentTemplates } from './templates';
import { createEmptyDocument } from './types';

const FIXTURES = join(__dirname, '../../../tests/fixtures/v0.1.0/documents');
const fixture = (name: string) => JSON.parse(readFileSync(join(FIXTURES, name), 'utf8')).content;

describe('opening v0.1.0 documents', () => {
  it.each(readdirSync(FIXTURES))('%s opens editable', (file) => {
    const prepared = prepareDocument(fixture(file));
    expect(prepared.state).toBe('editable');
  });

  it('repairs the v0.1.0 Lab report so it no longer opens blank, keeping all its text', () => {
    const raw = fixture('lab-report.json');
    expect(validateDoc(raw.doc)).toMatch(/Empty text nodes/);
    const prepared = prepareDocument(raw);
    expect(prepared.state).toBe('editable');
    if (prepared.state !== 'editable') return;
    expect(prepared.repairs).toEqual(['empty-text-node']);
    const text = (n: { text?: string; content?: unknown[] }): string => (n.text ?? '') + ((n.content ?? []) as typeof n[]).map(text).join('');
    expect(text(prepared.content.doc)).toBe(text(raw.doc));
    expect(JSON.stringify(prepared.content.doc)).toContain('Observations');
  });

  it('leaves valid documents byte-identical (opening must not rewrite them)', () => {
    for (const file of ['assignment.json', 'kitchen-sink.json', 'essay.json']) {
      const raw = fixture(file);
      const result = migrateDocument(raw);
      expect(result.ok && result.repairs).toEqual([]);
      expect(result.ok && result.content).toEqual(raw);
    }
  });
});

describe('protection against content this version cannot handle (audit C-1)', () => {
  it('opens content from a newer app version read-only', () => {
    const prepared = prepareDocument({ ...createEmptyDocument(), schemaVersion: DOCUMENT_SCHEMA + 1 });
    expect(prepared).toMatchObject({ state: 'protected', reason: 'newer' });
  });

  it('opens content with unknown nodes read-only and shows their text', () => {
    const raw = {
      ...createEmptyDocument(),
      doc: {
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'Before' }] },
          { type: 'footnote', attrs: { id: 1 }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'A footnote' }] }] },
          { type: 'paragraph', content: [{ type: 'text', text: 'styled', marks: [{ type: 'comment', attrs: { thread: 't' } }] }] },
        ],
      },
    };
    const prepared = prepareDocument(raw);
    expect(prepared.state).toBe('protected');
    if (prepared.state !== 'protected') return;
    expect(prepared.reason).toBe('invalid');
    expect(validateDoc(prepared.display.doc)).toBeNull();
    const json = JSON.stringify(prepared.display.doc);
    expect(json).toContain('A footnote');
    expect(json).toContain('styled');
    expect(json).not.toContain('"comment"');
  });

  it('falls back to plain text when the structure cannot be salvaged', () => {
    const doc = { type: 'doc', content: [{ type: 'table', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Bad table' }] }] }] };
    const safe = displaySafe(doc);
    expect(validateDoc(safe)).toBeNull();
    expect(JSON.stringify(safe)).toContain('Bad table');
  });
});

describe('templates', () => {
  it.each(documentTemplates.map((t) => [t.id, t] as const))('%s produces valid content', (_, t) => {
    expect(validateDoc(t.build().doc)).toBeNull();
  });
});
