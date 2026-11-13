import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { contentSchemaFor, DOCUMENT_SCHEMA, migrateDocument, schemaFor } from './migrate';
import { displaySafe, prepareDocument, validateDoc } from './safety';
import { documentTemplates } from './templates';
import { createEmptyDocument, DEFAULT_PAGE, normalizePage } from './types';

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

  it('leaves valid documents unchanged, and saving them keeps schema 1 (readable by v0.1.0)', () => {
    for (const file of ['assignment.json', 'kitchen-sink.json', 'essay.json']) {
      const raw = fixture(file);
      const result = migrateDocument(raw);
      if (!result.ok) throw new Error('expected ok');
      expect(result.repairs).toEqual([]);
      // Only missing page fields are filled in, with their defaults (G-LAYOUT's layout fields); a save stays schema 1.
      expect({ ...result.content, schemaVersion: 1 }).toEqual({ ...raw, page: { ...DEFAULT_PAGE, ...raw.page } });
      expect(contentSchemaFor(result.content as unknown as Pick<typeof result.content, 'doc'> & Record<string, unknown>)).toBe(1);
      expect(schemaFor(result.content.doc)).toBe(1);
    }
  });

  it('marks documents that contain a diagram as schema 2', () => {
    expect(schemaFor({ type: 'doc', content: [{ type: 'paragraph' }, { type: 'diagram', attrs: { previewId: 'x' } }] })).toBe(2);
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
          { type: 'paragraph', content: [{ type: 'text', text: 'styled', marks: [{ type: 'trackedInsert', attrs: { author: 't' } }] }] },
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
    expect(json).not.toContain('"trackedInsert"');
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

describe('page settings validation (audit DS-2)', () => {
  const withPage = (page: Record<string, unknown>) => ({ ...createEmptyDocument(), page: { ...createEmptyDocument().page, ...page } });

  it.each([
    // G-LAYOUT made A3, A5, Legal and the layout fields (columns, …) known; A0 and gutter are still unknown.
    ['an unknown paper size', { size: 'A0' }, /paper size "A0"/],
    ['an unknown orientation', { orientation: 'sideways' }, /orientation/],
    ['a margin that is not a number', { margins: { top: 'wide', right: 25, bottom: 25, left: 25 } }, /top margin/],
    ['a margin that is not finite', { margins: { top: 25, right: Number.NaN, bottom: 25, left: 25 } }, /right margin/],
    ['a negative margin', { margins: { top: -1, right: 25, bottom: 25, left: 25 } }, /top margin/],
    ['margins that leave no room for text', { margins: { top: 25, right: 120, bottom: 25, left: 120 } }, /no room/],
    ['a header that is not text', { header: { html: '<b>x</b>' } }, /header/],
    ['a footer that is not text', { footer: 42 }, /footer/],
    ['page numbers that are not on or off', { pageNumbers: 'yes' }, /page numbers/],
    ['a page setting this version does not know', { gutter: 2 }, /"gutter"/],
  ])('%s opens in the protected view, never crashes', (_, page, detail) => {
    const raw = withPage(page);
    const prepared = prepareDocument(raw);
    expect(prepared.state).toBe('protected');
    if (prepared.state !== 'protected') return;
    expect(prepared.reason).toBe('invalid');
    expect(prepared.detail).toMatch(detail);
    // The display copy is usable for every exporter and the editor.
    expect(normalizePage(prepared.display.page).problems).toEqual([]);
    expect(JSON.stringify(raw)).toBe(JSON.stringify(withPage(page)));
  });

  it('an editing mode this version does not know opens protected (a save would turn it into Simple)', () => {
    const raw = { schemaVersion: 1, doc: { type: 'doc', content: [{ type: 'paragraph' }] }, mode: 'weird' };
    const prepared = prepareDocument(raw);
    expect(prepared).toMatchObject({ state: 'protected', reason: 'invalid' });
    if (prepared.state === 'protected') expect(prepared.detail).toMatch(/editing mode "weird"/);
    expect(raw.mode).toBe('weird');
    expect(prepareDocument({ ...raw, mode: 7 }).state).toBe('protected');
    for (const mode of ['simple', 'advanced', undefined, null]) expect(prepareDocument({ ...raw, mode }).state).toBe('editable');
  });

  it('a top-level field this version does not know opens protected (a save would drop it)', () => {
    expect(prepareDocument({ ...createEmptyDocument(), sections: [] })).toMatchObject({ state: 'protected', reason: 'invalid' });
  });

  it('an attribute this version does not know, holding a value, opens protected (a save would drop it)', () => {
    // (G-FORMAT made paragraph.lineSpacing a real attribute, so the unknown one is now "futureSpacing".)
    const raw = { ...createEmptyDocument(), doc: { type: 'doc', content: [{ type: 'paragraph', attrs: { textAlign: null, futureSpacing: 2 }, content: [{ type: 'text', text: 'Kept' }] }] } };
    const prepared = prepareDocument(raw);
    expect(prepared).toMatchObject({ state: 'protected', reason: 'invalid' });
    if (prepared.state !== 'protected') return;
    expect(prepared.detail).toMatch(/futureSpacing/);
    expect(validateDoc(prepared.display.doc)).toBeNull();
    expect(JSON.stringify(prepared.display.doc)).toContain('Kept');
    // …but a null one (an unused attribute) is harmless.
    expect(prepareDocument({ ...raw, doc: { type: 'doc', content: [{ type: 'paragraph', attrs: { textAlign: null, futureSpacing: null } }] } }).state).toBe('editable');
  });

  it('missing page fields take their defaults (older and partial records), without a problem', () => {
    expect(normalizePage(undefined)).toEqual({ page: DEFAULT_PAGE, problems: [] });
    expect(normalizePage({ size: 'Letter', margins: { left: 38.1 } })).toEqual({ page: { ...DEFAULT_PAGE, size: 'Letter', margins: { ...DEFAULT_PAGE.margins, left: 38.1 } }, problems: [] });
    expect(prepareDocument({ doc: { type: 'doc', content: [{ type: 'paragraph' }] } }).state).toBe('editable');
  });

  it('accepts every page the v0.1.0 page setup dialog could produce', () => {
    for (const size of ['A4', 'Letter'])
      for (const orientation of ['portrait', 'landscape'])
        for (const m of [0, 80]) expect(normalizePage({ size, orientation, margins: { top: m, right: m, bottom: m, left: m }, header: '', footer: '', pageNumbers: false }).problems).toEqual([]);
  });
});
