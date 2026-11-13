import { getSchema, type JSONContent } from '@tiptap/core';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { contentNovelty, docNovelty, V010_VOCABULARY } from './compat';
import { documentExtensions } from './extensions';
import { contentSchemaFor, schemaFor } from './migrate';
import { prepareDocument } from './safety';
import { documentSchema } from './schema';
import { documentTemplates } from './templates';
import { createEmptyDocument, DEFAULT_PAGE } from './types';

const FIXTURES = join(__dirname, '../../../tests/fixtures/v0.1.0');
const fixtureDocs = readdirSync(join(FIXTURES, 'documents')).map((f) => [f, JSON.parse(readFileSync(join(FIXTURES, 'documents', f), 'utf8')).content] as const);
const backup = JSON.parse(readFileSync(join(FIXTURES, 'backup-v1.json'), 'utf8')) as { items: Array<{ kind: string; title: string; content: Record<string, unknown> }>; versions: Array<{ kind?: string; content: Record<string, unknown> }> };

const p = (text: string, extra: Partial<JSONContent> = {}): JSONContent => ({ type: 'paragraph', content: [{ type: 'text', text }], ...extra });
const docWith = (...content: JSONContent[]): JSONContent => ({ type: 'doc', content });

describe('frozen v0.1.0 vocabulary', () => {
  it('is still fully supported by this build, with the same attribute defaults', () => {
    const schema = documentSchema();
    for (const [kind, table] of [['nodes', V010_VOCABULARY.nodes], ['marks', V010_VOCABULARY.marks]] as const) {
      for (const [type, attrs] of Object.entries(table)) {
        const spec = kind === 'nodes' ? schema.nodes[type]?.spec : schema.marks[type]?.spec;
        expect(spec, `${kind} ${type}`).toBeDefined();
        for (const [name, def] of Object.entries(attrs)) expect(spec!.attrs?.[name]?.default, `${type}.${name}`).toEqual(def);
      }
    }
  });

  it('matches the v0.1.0 extension list (this build minus the diagram node)', () => {
    // v0.1.0's extensions are this build's minus DiagramEmbed (git diff v0.1.0-baseline -- extensions/index.ts);
    // the Tiptap version is unchanged (3.33.1), so this rebuilds the v0.1.0 schema.
    const v010 = getSchema(documentExtensions().filter((e) => e.name !== 'diagram' && e.name !== 'remoteImages' && e.name !== 'comment' /* G-REVIEW */ && e.name !== 'sectionBreak' /* G-LAYOUT */ && e.name !== 'paragraphFormat' && e.name !== 'listStyles' /* G-FORMAT */ && e.name !== 'equations' && e.name !== 'shape' && e.name !== 'textBox' /* G-INSERT */));
    const table = (types: Record<string, { spec: { attrs?: Record<string, { default?: unknown }> } }>) =>
      Object.fromEntries(Object.entries(types).map(([n, t]) => [n, Object.fromEntries(Object.entries(t.spec.attrs ?? {}).map(([k, v]) => [k, v.default]))]));
    // G-INSERT: pictures gained align and caption (both null by default, so pictures without them stay schema 1).
    const nodes = table(v010.nodes);
    expect(nodes.image).toMatchObject({ align: null, caption: null });
    delete nodes.image.align;
    delete nodes.image.caption;
    expect(nodes).toEqual(V010_VOCABULARY.nodes);
    expect(table(v010.marks)).toEqual(V010_VOCABULARY.marks);
  });
});

describe('schemaFor: v0.1.0 content stays schema 1', () => {
  it.each(fixtureDocs)('fixture %s', (_, content) => {
    expect(schemaFor(content.doc)).toBe(1);
    expect(contentSchemaFor(content)).toBe(1);
  });

  it.each(documentTemplates.map((t) => [t.id, t] as const))('template %s', (_, t) => {
    expect(contentSchemaFor(t.build() as never)).toBe(1);
  });

  it('every document in the v0.1.0 backup, and every saved version of one (and each still opens editable)', () => {
    const docs = [...backup.items, ...backup.versions].filter((i) => (i.content as { doc?: unknown }).doc);
    expect(docs.length).toBeGreaterThan(5);
    for (const d of docs) {
      expect(contentSchemaFor(d.content as never)).toBe(1);
      expect(prepareDocument(d.content).state).toBe('editable');
    }
  });

  it('an empty document, and attributes v0.1.0 had with any value', () => {
    expect(contentSchemaFor(createEmptyDocument() as never)).toBe(1);
    expect(schemaFor(docWith({ type: 'heading', attrs: { level: 4, textAlign: 'justify' }, content: [{ type: 'text', text: 'x' }] }))).toBe(1);
    expect(schemaFor(docWith(p('x', { content: [{ type: 'text', text: 'x', marks: [{ type: 'textStyle', attrs: { lineHeight: '2', color: 'red' } }] }] })))).toBe(1);
  });
});

describe('schemaFor: anything new makes schema 2', () => {
  it('a node type v0.1.0 did not have (the diagram node included)', () => {
    expect(schemaFor(docWith(p('a'), { type: 'diagram', attrs: { previewId: 'x' } }))).toBe(2);
    expect(docNovelty(docWith({ type: 'blockquote', content: [{ type: 'mathBlock' }] }))).toBe('node mathBlock');
  });

  it('a mark type v0.1.0 did not have', () => {
    expect(docNovelty(docWith(p('a', { content: [{ type: 'text', text: 'a', marks: [{ type: 'comment', attrs: { id: 'c1' } }] }] })))).toBe('mark comment');
  });

  it('a new attribute with a value other than its default', () => {
    expect(docNovelty(docWith(p('a', { attrs: { textAlign: null, lineSpacing: 2 } })))).toBe('attribute paragraph.lineSpacing');
    expect(docNovelty(docWith(p('a', { content: [{ type: 'text', text: 'a', marks: [{ type: 'link', attrs: { href: 'https://x.y', lang: 'fr' } }] }] })))).toBe('attribute link.lang');
  });

  it('but not a new attribute left at its default (the editor writes every attribute)', () => {
    expect(docNovelty(docWith(p('a', { attrs: { textAlign: null, lineSpacing: null } })))).toBeNull();
    // Defaults come from this build's schema: an attribute the schema gives a non-null default stays schema 1 at it.
    const fake = { nodes: { paragraph: { spec: { attrs: { indent: { default: 0 } } } } }, marks: {} } as never;
    expect(docNovelty(docWith(p('a', { attrs: { indent: 0 } })), fake)).toBeNull();
    expect(docNovelty(docWith(p('a', { attrs: { indent: 2 } })), fake)).toBe('attribute paragraph.indent');
  });

  it('a page size, orientation or page setting v0.1.0 did not have', () => {
    const base = createEmptyDocument() as unknown as Record<string, unknown> & { page: Record<string, unknown> };
    expect(contentNovelty({ ...base, page: { ...base.page, size: 'A3' } })).toBe('page.size A3');
    expect(contentNovelty({ ...base, page: { ...base.page, columns: 2 } })).toBe('page.columns');
    expect(contentNovelty({ ...base, page: { ...base.page, margins: { ...DEFAULT_PAGE.margins, gutter: 5 } } })).toBe('page.margins.gutter');
    expect(contentSchemaFor({ ...base, page: { ...base.page, orientation: 'sideways' } } as never)).toBe(2);
  });

  it('a top-level content field v0.1.0 did not have', () => {
    const base = createEmptyDocument() as unknown as Record<string, unknown>;
    // (G-REVIEW registered `comments`, so an unregistered name stands for "a field v0.1.0 did not have".)
    expect(contentNovelty({ ...base, footnotes: [{ id: 'f1' }] })).toBe('field footnotes');
    expect(contentSchemaFor({ ...base, footnotes: [] } as never)).toBe(2);
    expect(contentNovelty({ ...base, footnotes: undefined })).toBeNull();
  });

  it('an editing mode v0.1.0 did not have', () => {
    const base = createEmptyDocument() as unknown as Record<string, unknown>;
    expect(contentNovelty({ ...base, mode: 'focus' })).toBe('mode focus');
    expect(contentNovelty({ ...base, mode: 'advanced' })).toBeNull();
    expect(contentNovelty({ ...base, mode: undefined })).toBeNull();
  });
});
