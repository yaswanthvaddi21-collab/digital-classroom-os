import { getSchema, type JSONContent } from '@tiptap/core';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { contentNovelty, docNovelty, V010_VOCABULARY, V020_VOCABULARY } from './compat';
import { documentExtensions } from './extensions';
import { DIAGRAM_PHASE6_ATTRS, DiagramEmbed } from './extensions/diagramEmbed';
import { contentSchemaFor, DOCUMENT_SCHEMA, migrateDocument, schemaFor } from './migrate';
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
    // Outside the Phase 5 vocabulary (V020_VOCABULARY) too, so schema 3 since Phase 6.
    expect(contentSchemaFor({ ...base, page: { ...base.page, orientation: 'sideways' } } as never)).toBe(3);
  });

  it('a top-level content field v0.1.0 did not have', () => {
    const base = createEmptyDocument() as unknown as Record<string, unknown>;
    // (G-REVIEW registered `comments`, so an unregistered name stands for "a field v0.1.0 did not have".)
    expect(contentNovelty({ ...base, footnotes: [{ id: 'f1' }] })).toBe('field footnotes');
    // Unknown to the Phase 5 build as well, so schema 3 since Phase 6.
    expect(contentSchemaFor({ ...base, footnotes: [] } as never)).toBe(3);
    expect(contentNovelty({ ...base, footnotes: undefined })).toBeNull();
  });

  it('an editing mode v0.1.0 did not have', () => {
    const base = createEmptyDocument() as unknown as Record<string, unknown>;
    expect(contentNovelty({ ...base, mode: 'focus' })).toBe('mode focus');
    expect(contentNovelty({ ...base, mode: 'advanced' })).toBeNull();
    expect(contentNovelty({ ...base, mode: undefined })).toBeNull();
  });
});

describe('frozen Phase 5 vocabulary (V020_VOCABULARY, ADR 0013)', () => {
  const schema = documentSchema();
  const table = (types: Record<string, { spec: { attrs?: Record<string, { default?: unknown }> } }>) =>
    Object.fromEntries(Object.entries(types).map(([n, t]) => [n, Object.fromEntries(Object.entries(t.spec.attrs ?? {}).map(([k, v]) => [k, v.default]))]));

  it('is still fully supported by this build, with the same attribute defaults', () => {
    for (const [kind, vocab] of [['nodes', V020_VOCABULARY.nodes], ['marks', V020_VOCABULARY.marks]] as const) {
      for (const [type, attrs] of Object.entries(vocab)) {
        const spec = kind === 'nodes' ? schema.nodes[type]?.spec : schema.marks[type]?.spec;
        expect(spec, `${kind} ${type}`).toBeDefined();
        for (const [name, def] of Object.entries(attrs)) expect(spec!.attrs?.[name]?.default, `${type}.${name}`).toEqual(def);
      }
    }
  });

  it('is this build minus exactly the Phase 6 additions (the diagram attributes, all null by default)', () => {
    // The 8f772ba schema is this build's without the Phase 6 diagram attributes. Anything else added later must be
    // listed here, never added to the frozen vocabulary.
    const nodes = table(schema.nodes as never);
    for (const name of DIAGRAM_PHASE6_ATTRS) {
      expect(nodes.diagram[name], name).toBeNull();
      delete nodes.diagram[name];
    }
    expect(nodes).toEqual(V020_VOCABULARY.nodes);
    expect(table(schema.marks as never)).toEqual(V020_VOCABULARY.marks);
    expect(DIAGRAM_PHASE6_ATTRS).toEqual(['align', 'caption', 'alt', 'svgPreviewId']);
  });

  it('contains all of v0.1.0, so schema 3 always implies schema 2 content', () => {
    for (const kind of ['nodes', 'marks'] as const) {
      for (const [type, attrs] of Object.entries(V010_VOCABULARY[kind])) {
        const later = (V020_VOCABULARY[kind] as Record<string, Record<string, unknown>>)[type];
        expect(later, type).toBeDefined();
        for (const [name, def] of Object.entries(attrs)) expect(later[name], `${type}.${name}`).toEqual(def);
      }
    }
    for (const key of ['fields', 'sizes', 'orientations', 'margins'] as const) for (const v of V010_VOCABULARY.page[key]) expect(V020_VOCABULARY.page[key]).toContain(v);
    for (const f of V010_VOCABULARY.contentFields) expect(V020_VOCABULARY.contentFields).toContain(f);
  });

  it('knows the page settings and content fields of the Phase 5 build', () => {
    const page = createEmptyDocument().page as unknown as Record<string, unknown>;
    expect(Object.keys(page).sort()).toEqual([...V020_VOCABULARY.page.fields].sort());
    expect(DOCUMENT_SCHEMA).toBe(3);
  });
});

describe('schemaFor: Phase 5 content stays schema 2, Phase 6 additions make schema 3', () => {
  const diagram = (extra: Record<string, unknown> = {}): JSONContent => ({
    type: 'diagram',
    attrs: { source: { schemaVersion: 2, nodes: [], edges: [] }, previewId: 'p1', naturalWidth: 800, naturalHeight: 600, width: 400, height: 300, title: 'Flow', ...extra },
  });
  const nulls = Object.fromEntries(DIAGRAM_PHASE6_ATTRS.map((k) => [k, null]));

  it('a diagram with only the Phase 5 attributes, or with the Phase 6 ones left at null, stays schema 2', () => {
    expect(schemaFor(docWith(p('a'), diagram()))).toBe(2);
    expect(schemaFor(docWith(p('a'), diagram(nulls)))).toBe(2);
    expect(contentSchemaFor({ ...createEmptyDocument(), doc: docWith(diagram(nulls)) } as never)).toBe(2);
    // Phase 4/5 features (G-FORMAT, G-LAYOUT, G-REVIEW, G-INSERT) are schema 2, not 3.
    const base = createEmptyDocument() as unknown as Record<string, unknown> & { page: Record<string, unknown> };
    expect(contentSchemaFor({ ...base, page: { ...base.page, size: 'A3', columns: 2, pageNumberFormat: 'lowerRoman' }, comments: [], language: 'en-GB' } as never)).toBe(2);
    expect(schemaFor(docWith({ type: 'shape', attrs: { kind: 'star', fill: '#ff0000' } }, { type: 'sectionBreak', attrs: { breakType: 'continuous' } }))).toBe(2);
  });

  it('a diagram as the editor writes it (every attribute, Phase 6 ones null) stays schema 2', () => {
    // ProseMirror's toJSON is what the editor's getJSON() stores: every attribute, defaults included.
    const json = documentSchema().nodeFromJSON(docWith(p('a'), diagram())).toJSON() as JSONContent;
    expect(json.content?.[1]?.attrs).toMatchObject(nulls);
    expect(schemaFor(json)).toBe(2);
  });

  it.each([
    ['align', 'right'],
    ['caption', 'Figure 1'],
    ['alt', 'Login flow'],
    ['svgPreviewId', 'svg-1'],
  ])('a diagram with %s set is schema 3', (name, value) => {
    const doc = docWith(p('a'), diagram({ ...nulls, [name]: value }));
    expect(docNovelty(doc, documentSchema(), V020_VOCABULARY)).toBe(`attribute diagram.${name}`);
    expect(docNovelty(doc, documentSchema())).toBe('node diagram');
    expect(schemaFor(doc)).toBe(3);
    expect(contentSchemaFor({ ...createEmptyDocument(), doc } as never)).toBe(3);
  });

  it('a Phase 6 attribute anywhere in the tree counts (table cell, list item, text box)', () => {
    const inCell = docWith({ type: 'table', content: [{ type: 'tableRow', content: [{ type: 'tableCell', content: [diagram({ caption: 'c' })] }] }] });
    const inBox = docWith({ type: 'textBox', content: [diagram({ align: 'left' })] });
    expect(schemaFor(inCell)).toBe(3);
    expect(schemaFor(inBox)).toBe(3);
  });

  it('a page value outside the Phase 5 choices, a new page field or a new content field is schema 3', () => {
    const base = createEmptyDocument() as unknown as Record<string, unknown> & { page: Record<string, unknown> };
    expect(contentNovelty({ ...base, page: { ...base.page, pageNumberFormat: 'greek' } }, V020_VOCABULARY)).toBe('page.pageNumberFormat "greek"');
    expect(contentNovelty({ ...base, page: { ...base.page, columns: 4 } }, V020_VOCABULARY)).toBe('page.columns 4');
    expect(contentNovelty({ ...base, page: { ...base.page, gutter: 5 } }, V020_VOCABULARY)).toBe('page.gutter');
    expect(contentNovelty({ ...base, footnotes: [{ id: 'f' }] }, V020_VOCABULARY)).toBe('field footnotes');
    expect(contentNovelty({ ...base, comments: [], language: 'fr' }, V020_VOCABULARY)).toBeNull();
    expect(contentSchemaFor({ ...base, page: { ...base.page, pageNumberText: 'roman' } } as never)).toBe(3);
  });

  it('v0.1.0 content (fixtures and backup) stays schema 1, never 3', () => {
    for (const [, content] of fixtureDocs) expect(contentSchemaFor(content)).toBe(1);
    for (const d of [...backup.items, ...backup.versions].filter((i) => (i.content as { doc?: unknown }).doc)) expect(contentSchemaFor(d.content as never)).toBe(1);
  });
});

describe('opening documents across the schema-3 boundary', () => {
  const doc3 = { ...createEmptyDocument(), schemaVersion: 3, doc: docWith(p('a'), { type: 'diagram', attrs: { source: { nodes: [], edges: [] }, previewId: 'p1', caption: 'Figure 1' } }) };

  it('this build opens schema 3 for editing, and the 2 → 3 upgrade changes nothing but the number', () => {
    expect(prepareDocument(doc3).state).toBe('editable');
    const two = { ...createEmptyDocument(), schemaVersion: 2, doc: docWith(p('a'), { type: 'diagram', attrs: { source: { nodes: [], edges: [] }, previewId: 'p1' } }) };
    const migrated = migrateDocument(two);
    expect(migrated.ok && migrated.content.doc).toEqual(two.doc);
    expect(migrateDocument({ ...doc3, schemaVersion: 4 })).toEqual({ ok: false, reason: 'newer', version: 4 });
  });

  it('a document with a caption is stored above the Phase 5 schema number, so that build opens it read-only', () => {
    // The 8f772ba build refuses `schemaVersion > 2` as newer (its migrate.ts, DOCUMENT_SCHEMA = 2) and opens the
    // protected view, so it can never save the document without the caption.
    expect(contentSchemaFor(doc3 as never)).toBeGreaterThan(2);
  });

  it('a Phase 5 schema reads what this build writes for an unchanged diagram without losing anything', () => {
    // The Phase 5 diagram node: this build's without the Phase 6 attributes.
    const old = getSchema(
      documentExtensions().map((ext) =>
        ext.name === 'diagram'
          ? DiagramEmbed.extend({
              addAttributes() {
                const all = (this.parent?.() ?? {}) as Record<string, unknown>;
                return Object.fromEntries(Object.entries(all).filter(([k]) => !(DIAGRAM_PHASE6_ATTRS as readonly string[]).includes(k)));
              },
            })
          : ext,
      ),
    );
    const written = documentSchema()
      .nodeFromJSON(docWith(p('a'), { type: 'diagram', attrs: { source: { nodes: [{ id: 'n' }], edges: [] }, previewId: 'p1', width: 300, height: 225, naturalWidth: 400, naturalHeight: 300, title: 'T' } }))
      .toJSON() as JSONContent;
    const reread = old.nodeFromJSON(written).toJSON() as JSONContent;
    const { align, caption, alt, svgPreviewId, ...phase5Attrs } = written.content![1].attrs!;
    expect([align, caption, alt, svgPreviewId]).toEqual([null, null, null, null]);
    expect(reread.content![1].attrs).toEqual(phase5Attrs);
  });
});
