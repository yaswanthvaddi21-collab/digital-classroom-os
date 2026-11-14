// @vitest-environment jsdom
/**
 * Phase 6 (ADR 0013), Round 3: the features of the four groups together, as a user meets them.
 * - A captioned, right-aligned diagram with alt text is copied and pasted into a table cell, then the document goes
 *   through DOCX, ODT and .dcosdoc and back: every copy is still an editable diagram with its alignment, caption, alt
 *   text and data, and it can be edited again in the imported document.
 * - Version restore, trash restore and backup restore keep every preview (PNG and SVG) of such a document.
 * - A document that uses nothing new stays content schema 2 through all of it.
 */
import 'fake-indexeddb/auto';
import { contentSchemaFor, createEmptyDocument, documentExtensions, exportDcosdoc, exportDocx, exportOdt, importDocumentFile, prepareDocument, withStoredAttachments, type DiagramHost, type DocumentContent, type EmbeddedDiagram } from '@dcos/document-studio';
import { IndexedDbAdapter } from '@dcos/local-storage';
import { Editor, type JSONContent } from '@tiptap/core';
import { NodeSelection } from '@tiptap/pm/state';
import { zlibSync } from 'fflate';
import { crc32 } from 'node:zlib';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { openDiagramEditor, setDiagramTextWidth } from '../../packages/document-studio/src/extensions/diagramEmbed';

function png(w: number, h: number, shade = 180): Uint8Array {
  const chunk = (type: string, data: Uint8Array) => {
    const out = new Uint8Array(12 + data.length);
    const v = new DataView(out.buffer);
    v.setUint32(0, data.length);
    out.set(Buffer.from(type, 'latin1'), 4);
    out.set(data, 8);
    v.setUint32(8 + data.length, crc32(Buffer.concat([Buffer.from(type, 'latin1'), data])) >>> 0);
    return out;
  };
  const ihdr = new Uint8Array(13);
  const v = new DataView(ihdr.buffer);
  v.setUint32(0, w);
  v.setUint32(4, h);
  ihdr.set([8, 0, 0, 0, 0], 8);
  const raw = new Uint8Array((w + 1) * h);
  for (let y = 0; y < h; y++) raw.fill(shade, y * (w + 1) + 1, (y + 1) * (w + 1));
  return Uint8Array.from(Buffer.concat([Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a), chunk('IHDR', ihdr), chunk('IDAT', zlibSync(raw)), chunk('IEND', new Uint8Array(0))]));
}
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300"><rect width="400" height="300" fill="#fff"/></svg>';
const FLOW = {
  schemaVersion: 2,
  nodes: [
    { id: 'a', type: 'shape', position: { x: 0, y: 0 }, width: 120, height: 60, data: { shape: 'rectangle', label: 'Start' } },
    { id: 'b', type: 'shape', position: { x: 0, y: 120 }, width: 120, height: 60, data: { shape: 'rectangle', label: 'End' } },
  ],
  edges: [{ id: 'e', source: 'a', target: 'b' }],
  viewport: null,
  settings: { snapToGrid: true, showGrid: true, autoLayout: 'none' },
};
const PREVIEW = png(800, 600);
const para = (text: string): JSONContent => ({ type: 'paragraph', content: [{ type: 'text', text }] });
const figure = { source: FLOW, previewId: 'p-flow', naturalWidth: 400, naturalHeight: 300, width: 400, height: 300, title: 'Flow', align: 'right', caption: 'Figure 1. The flow', alt: 'Start leads to End', svgPreviewId: 's-flow' };
const plain = { source: FLOW, previewId: 'p-flow', naturalWidth: 400, naturalHeight: 300, width: 400, height: 300, title: 'Flow' };

const host = (over: Partial<DiagramHost> = {}): DiagramHost => ({
  templates: [],
  edit: async () => null,
  pickFromLibrary: async () => null,
  importFile: async () => null,
  loadPreview: async () => new Blob([PREVIEW as BlobPart], { type: 'image/png' }),
  toDrawio: async () => '',
  ...over,
});
const loader = (files: Record<string, Uint8Array | string>) => async (id: string) => {
  const f = files[id];
  return f === undefined ? undefined : new Blob([f as BlobPart], { type: typeof f === 'string' ? 'image/svg+xml' : 'image/png' });
};
const bytes = async (b: Blob) => new Uint8Array(await b.arrayBuffer());

let editors: Editor[] = [];
afterEach(() => {
  editors.forEach((e) => e.destroy());
  editors = [];
  vi.restoreAllMocks();
});
const editorWith = (content: JSONContent[], h: DiagramHost | null = null) => {
  const e = new Editor({ extensions: documentExtensions({ diagramHost: h }), content: { type: 'doc', content } });
  editors.push(e);
  return e;
};
const asContent = (e: Editor): DocumentContent => {
  const c = { ...createEmptyDocument(), doc: e.getJSON() } as DocumentContent;
  return { ...c, schemaVersion: contentSchemaFor(c as unknown as Pick<DocumentContent, 'doc'> & Record<string, unknown>) };
};
/** Every diagram with the names of the nodes it sits in (outermost first). */
function diagramsWithPath(n: JSONContent, path: string[] = [], out: Array<{ attrs: Record<string, unknown>; path: string[] }> = []) {
  if (n.type === 'diagram') out.push({ attrs: n.attrs ?? {}, path });
  n.content?.forEach((c) => diagramsWithPath(c, [...path, n.type ?? '?'], out));
  return out;
}

/** Copies the selected diagram (as the editor's copy does) and pastes it into the first table cell. */
function pasteIntoCell(e: Editor) {
  let at = -1;
  e.state.doc.descendants((n, pos) => {
    if (at < 0 && n.type.name === 'diagram') at = pos;
  });
  e.view.dispatch(e.state.tr.setSelection(NodeSelection.create(e.state.doc, at)));
  const copied = (e.view as unknown as { serializeForClipboard: (s: unknown) => { dom: HTMLElement } }).serializeForClipboard(e.state.selection.content()).dom.innerHTML;
  let cell = -1;
  e.state.doc.descendants((n, pos) => {
    if (cell < 0 && n.type.name === 'tableCell') cell = pos;
  });
  e.commands.setTextSelection(cell + 2);
  e.view.pasteHTML(copied, new Event('paste') as ClipboardEvent);
  return copied;
}

describe('Phase 6 across features: paste into a table cell, then DOCX, ODT and .dcosdoc', () => {
  const table: JSONContent = { type: 'table', content: [{ type: 'tableRow', content: [{ type: 'tableCell', content: [para('cell')] }, { type: 'tableCell', content: [para('other')] }] }] };

  it('a captioned, right-aligned diagram pasted into a table cell comes back editable from every format', async () => {
    // A two-column table: the cell is half the editor's width, so the paste fits half the page's text width.
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function (this: HTMLElement) {
      return this.tagName === 'TD' ? 300 : this.classList.contains('ProseMirror') ? 600 : 0;
    });
    const e = editorWith([para('Intro'), { type: 'diagram', attrs: figure }, table, para('End')], host());
    setDiagramTextWidth(e, 600);
    const copied = pasteIntoCell(e);
    // Other apps get the picture's caption and alt text with the copy; this app reads data-diagram.
    expect(copied).toContain('Figure 1. The flow');
    await new Promise((r) => setTimeout(r, 0));
    const content = asContent(e);
    expect(content.schemaVersion).toBe(3);
    const before = diagramsWithPath(content.doc);
    expect(before.map((d) => d.path.at(-1))).toEqual(['doc', 'tableCell']);
    // Fitted to the cell (half of 600), aspect ratio kept; everything else as copied.
    expect(before[1].attrs).toMatchObject({ ...figure, width: 300, height: 225 });

    const load = loader({ 'p-flow': PREVIEW, 's-flow': SVG });
    for (const [name, file] of [
      ['round.docx', await exportDocx(content, 'Round', load)],
      ['round.odt', await exportOdt(content, 'Round', load)],
      ['round.dcosdoc', await exportDcosdoc(content, 'Round', load)],
    ] as const) {
      const result = await importDocumentFile(name, await bytes(file));
      // Store the pictures as the app does (ImportDocument.tsx), then check what the new document holds.
      const stored = new Map((result.attachments ?? []).map((a, i) => [a.id, `stored-${i}`]));
      const imported = result.attachments ? withStoredAttachments(result.content, stored) : result.content;
      const after = diagramsWithPath(imported.doc);
      expect(after.map((d) => d.path.at(-1)), name).toEqual(['doc', 'tableCell']);
      for (const [i, d] of after.entries()) {
        expect(d.attrs, `${name} #${i}`).toMatchObject({ source: FLOW, title: 'Flow', align: 'right', caption: 'Figure 1. The flow', alt: 'Start leads to End', naturalWidth: 400, naturalHeight: 300 });
        // The size: as stored, except that OpenDocument's table column (its cell padding taken off) may be a few
        // pixels narrower than the cell; the aspect ratio is always kept.
        const w = Number(d.attrs.width);
        expect(w, `${name} #${i} width`).toBeLessThanOrEqual(Number(before[i].attrs.width));
        expect(w, `${name} #${i} width`).toBeGreaterThan(Number(before[i].attrs.width) * 0.9);
        expect(Math.abs(Number(d.attrs.height) / w - 0.75), `${name} #${i} ratio`).toBeLessThan(0.01);
        if (!name.endsWith('.odt')) expect([d.attrs.width, d.attrs.height], name).toEqual([before[i].attrs.width, before[i].attrs.height]);
        expect(String(d.attrs.previewId), name).toMatch(/^stored-/);
      }
      // Only the native file carries the SVG drawing as such; Word and OpenDocument hold it inside the picture frame.
      if (name.endsWith('.dcosdoc')) expect(after.every((d) => typeof d.attrs.svgPreviewId === 'string' && String(d.attrs.svgPreviewId).startsWith('stored-'))).toBe(true);
      expect(imported.schemaVersion, name).toBe(3);

      // Still editable: the imported document opens editable and the diagram in the cell opens its editor and saves.
      const prepared = prepareDocument(imported);
      expect(prepared.state, name).toBe('editable');
      const edited: EmbeddedDiagram = { source: { ...FLOW, nodes: [FLOW.nodes[0]] }, previewId: 'p-edited', naturalWidth: 400, naturalHeight: 200, title: 'Flow v2' };
      const settle = vi.fn();
      const h = host({ edit: async () => edited, settle });
      const reopened = editorWith((prepared.state === 'editable' ? prepared.content.doc.content : []) as JSONContent[], h);
      let inCell = -1;
      reopened.state.doc.descendants((n, pos) => {
        if (n.type.name === 'diagram' && reopened.state.doc.resolve(pos).parent.type.name === 'tableCell') inCell = pos;
      });
      await expect(openDiagramEditor(reopened, inCell, h)).resolves.toBe('saved');
      const kept = Number(after[1].attrs.width);
      expect(reopened.state.doc.nodeAt(inCell)?.attrs).toMatchObject({ previewId: 'p-edited', title: 'Flow v2', align: 'right', caption: 'Figure 1. The flow', alt: 'Start leads to End', width: kept, height: Math.round(kept / 2) });
      expect(settle).toHaveBeenCalledWith(edited, true);
    }
  });

  it('a document that uses nothing new stays content schema 2 through paste, export and import', async () => {
    const e = editorWith([para('Intro'), { type: 'diagram', attrs: plain }, table], host());
    pasteIntoCell(e);
    await new Promise((r) => setTimeout(r, 0));
    const content = asContent(e);
    expect(diagramsWithPath(content.doc)).toHaveLength(2);
    expect(content.schemaVersion).toBe(2);
    const load = loader({ 'p-flow': PREVIEW });
    for (const [name, file] of [
      ['plain.docx', await exportDocx(content, 'Plain', load)],
      ['plain.odt', await exportOdt(content, 'Plain', load)],
      ['plain.dcosdoc', await exportDcosdoc(content, 'Plain', load)],
    ] as const) {
      const result = await importDocumentFile(name, await bytes(file));
      const stored = new Map((result.attachments ?? []).map((a, i) => [a.id, `stored-${i}`]));
      const imported = result.attachments ? withStoredAttachments(result.content, stored) : result.content;
      expect(diagramsWithPath(imported.doc).map((d) => d.attrs.source), name).toEqual([FLOW, FLOW]);
      expect(imported.schemaVersion, name).toBe(2);
    }
  });
});

describe('Phase 6 across features: restoring keeps every preview', () => {
  let n = 0;
  const DAY = 24 * 60 * 60 * 1000;
  const adapters: IndexedDbAdapter[] = [];
  afterEach(async () => {
    vi.useRealTimers();
    for (const a of adapters.splice(0)) await a.close();
  });
  const open = () => {
    const a = new IndexedDbAdapter(`phase6-cross-${++n}`);
    adapters.push(a);
    return a;
  };
  const docWith = (...diagrams: Record<string, unknown>[]) => {
    const c = { ...createEmptyDocument(), doc: { type: 'doc', content: [para('Text'), ...diagrams.map((attrs) => ({ type: 'diagram', attrs }))] } } as DocumentContent;
    return { ...c, schemaVersion: contentSchemaFor(c as unknown as Pick<DocumentContent, 'doc'> & Record<string, unknown>) };
  };
  const at = (ms: number) => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.parse('2026-11-01T00:00:00Z') + ms);
  };
  const bytesOf = async (store: IndexedDbAdapter, id: unknown) => {
    const a = await store.getAttachment(String(id));
    return a ? new Uint8Array(a.data) : null;
  };

  it('after an edit, the trash and a clean-up, version restore and trash restore still show every PNG and SVG preview', async () => {
    at(0);
    const store = open();
    const p1 = await store.putAttachment(new Blob([PREVIEW as BlobPart]), 'image/png');
    const s1 = await store.putAttachment(new Blob([SVG]), 'image/svg+xml');
    const p2 = await store.putAttachment(new Blob([png(600, 300, 90) as BlobPart]), 'image/png');
    const original = docWith({ ...figure, previewId: p1.id, svgPreviewId: s1.id }, { ...plain, previewId: p1.id });
    expect(original.schemaVersion).toBe(3);
    const item = await store.create('document', { title: 'Report', content: original });
    // Two days later the diagram is edited (a new preview, the SVG of the old drawing dropped) and saved as a version.
    at(2 * DAY);
    const edited = docWith({ ...figure, previewId: p2.id, svgPreviewId: null }, { ...plain, previewId: p1.id });
    await store.snapshot('document', item.id);
    await store.save('document', item.id, { content: edited }, 1);
    await store.trash('document', item.id);
    // Long after: nothing a version or the trashed document refers to is cleaned up.
    at(9 * DAY);
    await store.cleanUpAttachments({ graceMs: 0 });
    for (const id of [p1.id, s1.id, p2.id]) expect(await bytesOf(store, id), id).not.toBeNull();
    await store.restore('document', item.id);
    expect((await store.get('document', item.id))?.content).toEqual(edited);
    const versions = await store.listVersions('document', item.id);
    // The version holding the document as it was before the edit (item version 1).
    const first = versions.filter((v) => v.version === 1).at(-1);
    expect(first).toBeTruthy();
    await store.restoreVersion('document', item.id, first!.id);
    const back = (await store.get('document', item.id))!.content as DocumentContent;
    expect(back.doc).toEqual(original.doc);
    for (const d of diagramsWithPath(back.doc)) {
      expect(await bytesOf(store, d.attrs.previewId)).toEqual(PREVIEW);
      if (d.attrs.svgPreviewId) expect(new TextDecoder().decode((await bytesOf(store, d.attrs.svgPreviewId))!)).toBe(SVG);
    }
  });

  it('a backup of a schema-3 document restores into an empty profile with every preview, and a schema-2 one stays 2', async () => {
    const store = open();
    const p1 = await store.putAttachment(new Blob([PREVIEW as BlobPart]), 'image/png');
    const s1 = await store.putAttachment(new Blob([SVG]), 'image/svg+xml');
    const rich = await store.create('document', { title: 'Rich', content: docWith({ ...figure, previewId: p1.id, svgPreviewId: s1.id }) });
    const simple = await store.create('document', { title: 'Simple', content: docWith({ ...plain, previewId: p1.id }) });
    const backup = JSON.parse(JSON.stringify(await store.exportBackup()));
    expect(backup.schemaVersion).toBe(3);
    const fresh = open();
    expect(await fresh.importBackup(backup)).toMatchObject({ added: 2 });
    for (const it of [rich, simple]) expect(await fresh.get('document', it.id)).toEqual(await store.get('document', it.id));
    expect(((await fresh.get('document', simple.id))!.content as DocumentContent).schemaVersion).toBe(2);
    expect(await bytesOf(fresh, p1.id)).toEqual(PREVIEW);
    expect(new TextDecoder().decode((await bytesOf(fresh, s1.id))!)).toBe(SVG);
  });
});
