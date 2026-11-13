/**
 * Generates the frozen v0.1.0 fixtures. Only meaningful at tag v0.1.0-baseline: it records what that
 * version's code writes. Kept for reference; re-running it on later code would defeat its purpose.
 * Run: npx vitest run --config tests/fixtures/v0.1.0/vitest.gen.config.ts
 */
import 'fake-indexeddb/auto';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { test, vi } from 'vitest';
import { IndexedDbAdapter } from '@dcos/local-storage';
import { documentTemplates, createEmptyDocument, type DocumentContent } from '@dcos/document-studio';
import { diagramTemplates, DEFAULT_CONNECTOR, shapeDefaults, type DiagramContent, type ShapeKind } from '@dcos/diagram-studio';

const OUT = join(__dirname);
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
const t = (text: string, marks?: unknown[]) => ({ type: 'text', text, ...(marks ? { marks } : {}) });
const p = (...c: unknown[]) => ({ type: 'paragraph', attrs: { textAlign: null }, content: c });

const kitchenSink: DocumentContent = {
  ...createEmptyDocument(),
  mode: 'advanced',
  page: { size: 'Letter', orientation: 'landscape', margins: { top: 20, right: 15, bottom: 20, left: 30 }, header: 'Header text', footer: 'Footer text', pageNumbers: true },
  doc: {
    type: 'doc',
    content: [
      { type: 'heading', attrs: { level: 1, textAlign: 'center' }, content: [t('Heading 1')] },
      { type: 'heading', attrs: { level: 2, textAlign: null }, content: [t('Heading 2')] },
      { type: 'heading', attrs: { level: 3, textAlign: 'right' }, content: [t('Heading 3')] },
      { type: 'heading', attrs: { level: 4, textAlign: 'justify' }, content: [t('Heading 4')] },
      { type: 'tableOfContents' },
      p(
        t('bold', [{ type: 'bold' }]), t(' '), t('italic', [{ type: 'italic' }]), t(' '), t('underline', [{ type: 'underline' }]), t(' '),
        t('strike', [{ type: 'strike' }]), t(' '), t('code', [{ type: 'code' }]), t(' H'), t('2', [{ type: 'subscript' }]), t('O x'), t('2', [{ type: 'superscript' }]), t(' '),
        t('yellow', [{ type: 'highlight', attrs: { color: '#fef08a' } }]), t(' '),
        t('styled', [{ type: 'textStyle', attrs: { color: '#b91c1c', fontSize: '14pt', fontFamily: 'Georgia', backgroundColor: null, lineHeight: null } }]), t(' '),
        t('link', [{ type: 'link', attrs: { href: 'https://example.com', target: '_blank', rel: 'noopener noreferrer nofollow', class: null, title: null } }]),
        { type: 'hardBreak' }, t('after break'),
      ),
      { ...p(t('Centred paragraph')), attrs: { textAlign: 'center' } },
      { type: 'bulletList', content: [
        { type: 'listItem', content: [p(t('Bullet 1')), { type: 'bulletList', content: [{ type: 'listItem', content: [p(t('Nested bullet'))] }] }] },
        { type: 'listItem', content: [p(t('Bullet 2'))] },
      ] },
      { type: 'orderedList', attrs: { start: 3, type: null }, content: [
        { type: 'listItem', content: [p(t('Ordered from 3'))] },
        { type: 'listItem', content: [p(t('Second')), { type: 'orderedList', attrs: { start: 1, type: null }, content: [{ type: 'listItem', content: [p(t('Nested ordered'))] }] }] },
      ] },
      { type: 'blockquote', content: [p(t('A quotation.'))] },
      { type: 'codeBlock', attrs: { language: null }, content: [t('const x = 1;\nconsole.log(x);')] },
      { type: 'horizontalRule' },
      { type: 'table', content: [
        { type: 'tableRow', content: [
          { type: 'tableHeader', attrs: { colspan: 1, rowspan: 1, colwidth: [120] }, content: [p(t('Header A'))] },
          { type: 'tableHeader', attrs: { colspan: 1, rowspan: 1, colwidth: null }, content: [p(t('Header B'))] },
        ] },
        { type: 'tableRow', content: [
          { type: 'tableCell', attrs: { colspan: 2, rowspan: 1, colwidth: null }, content: [p(t('Merged cell'))] },
        ] },
      ] },
      { type: 'image', attrs: { src: PNG, alt: 'pixel', title: null, width: 1, height: 1 } },
      { type: 'pageBreak' },
      p(t('After the page break.')),
    ],
  },
};

const ALL_SHAPES: ShapeKind[] = ['rectangle', 'rounded', 'ellipse', 'circle', 'diamond', 'parallelogram', 'hexagon', 'triangle', 'cylinder', 'document', 'note', 'text'];
const allShapes: DiagramContent = {
  schemaVersion: 1,
  nodes: ALL_SHAPES.map((shape, i) => {
    const { width, height, ...style } = shapeDefaults(shape);
    return { id: `s-${shape}`, position: { x: (i % 4) * 220, y: Math.floor(i / 4) * 180 }, width, height, data: { ...style, label: shape }, ...(i === 0 ? { zIndex: 5 } : {}) };
  }),
  edges: [
    { id: 'e1', source: 's-rectangle', target: 's-rounded', sourceHandle: 'r', targetHandle: 'l', type: 'smoothstep', label: 'yes', data: { ...DEFAULT_CONNECTOR } },
    { id: 'e2', source: 's-rounded', target: 's-ellipse', sourceHandle: 'r', targetHandle: 'l', type: 'step', label: '', data: { ...DEFAULT_CONNECTOR, arrow: 'both', dashed: true } },
    { id: 'e3', source: 's-ellipse', target: 's-circle', sourceHandle: 'r', targetHandle: 'l', type: 'straight', label: '', data: { ...DEFAULT_CONNECTOR, arrow: 'none', width: 3, color: '#dc2626' } },
    { id: 'e4', source: 's-diamond', target: 's-hexagon', sourceHandle: 'b', targetHandle: 't', type: 'default', label: 'curved', data: { ...DEFAULT_CONNECTOR, width: 1.5 } },
  ],
  viewport: { x: 12, y: -40, zoom: 0.8 },
  settings: { snapToGrid: false, showGrid: true, autoLayout: 'TB' },
};

test('generate v0.1.0 fixtures', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-12T09:00:00.000Z'));
  const store = new IndexedDbAdapter('fixture-gen');

  const docs = [];
  for (const tpl of documentTemplates) docs.push(await store.create('document', { title: tpl.name, content: tpl.build(), templateId: tpl.id }));
  const sink = await store.create('document', { title: 'Kitchen sink', content: kitchenSink, templateId: null });
  const diagrams = [];
  for (const tpl of diagramTemplates) diagrams.push(await store.create('diagram', { title: tpl.name, content: tpl.build(), templateId: tpl.id }));
  const shapes = await store.create('diagram', { title: 'All shapes', content: allShapes, templateId: null });

  // Version history with every reason: manual, auto (after 11 minutes), restore. Plus a trashed and a favourite item.
  vi.setSystemTime(new Date('2026-11-12T09:05:00.000Z'));
  let essay = await store.save('document', docs[3].id, { title: 'Essay (edited)' }, docs[3].version, { snapshot: true });
  vi.setSystemTime(new Date('2026-11-12T09:16:00.000Z'));
  essay = await store.save('document', essay.id, { content: { ...essay.content as DocumentContent, mode: 'advanced' } }, essay.version);
  const first = (await store.listVersions('document', essay.id)).find((v) => v.reason === 'create')!;
  vi.setSystemTime(new Date('2026-11-12T09:20:00.000Z'));
  await store.restoreVersion('document', essay.id, first.id);
  const lab = await store.get('document', docs[2].id);
  await store.save('document', lab!.id, { favorite: true }, lab!.version);
  await store.trash('diagram', diagrams[0].id);

  const backup = await store.exportBackup();
  mkdirSync(join(OUT, 'documents'), { recursive: true });
  mkdirSync(join(OUT, 'diagrams'), { recursive: true });
  const write = (rel: string, data: unknown) => writeFileSync(join(OUT, rel), JSON.stringify(data, null, 2) + '\n');
  for (const item of backup.items) {
    const slug = (item.templateId ?? item.title).toLowerCase().replace(/[^a-z0-9]+/g, '-');
    write(`${item.kind}s/${slug}.json`, item);
  }
  write('backup-v1.json', backup);
  write('README.json', { generatedFrom: 'v0.1.0-baseline (20d3f4d)', items: backup.items.length, versions: backup.versions.length, sink: sink.id, shapes: shapes.id });
  await store.close();
});
