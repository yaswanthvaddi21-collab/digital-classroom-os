/**
 * ODT (OpenDocument text) export. The conversion mirrors the DOCX export, with registries other features extend:
 * - nodes.ts      ODT_NODE_HANDLERS            block nodes
 * - inlines.ts    ODT_INLINE_HANDLERS          inline nodes
 * - marks.ts      ODT_MARK_HANDLERS            marks (as ODF text properties)
 * - paragraph.ts  ODT_PARAGRAPH_CONTRIBUTORS   paragraph attributes; ODT_HANDLED_ATTRS lists what is written
 * Anything without a handler, and any attribute with a value the export does not write, is reported in the
 * ExportReport (shown in the export toast), never dropped silently.
 */
import { zipSync, strToU8, type Zippable } from 'fflate';
import { LAYOUT_DEFAULTS, layoutOf } from '../../pageLayout';
import { CONTENT_FIELDS, DEFAULT_PAGE, paperSize, type DocumentContent } from '../../types';
import { prepareDiagramExport, type DiagramExportOptions, type DiagramRenders } from '../diagramAssets';
import { ExportReport } from '../report';
import { AutoStyles, type OdtCtx } from './context';
import { ODT_NOTES } from './notes';
import { api } from './nodes';
import { FONT_FACES, stylesXml } from './styles';
import { el, esc, xmlns } from './xml';

export { ODT_NODE_HANDLERS } from './nodes';
export { ODT_INLINE_HANDLERS } from './inlines';
export { ODT_MARK_HANDLERS } from './marks';
export { ODT_HANDLED_ATTRS, ODT_PARAGRAPH_CONTRIBUTORS } from './paragraph';
export type { OdfProps, OdtApi, OdtCtx, OdtInlineHandler, OdtMarkHandler, OdtNodeHandler, OdtParagraphContributor } from './context';

export const ODT_MIME = 'application/vnd.oasis.opendocument.text';

/** Page settings the ODT export writes (styles.ts). Others with a value other than their default are reported. */
export const ODT_PAGE_FIELDS = [
  'size',
  'orientation',
  'margins',
  'header',
  'footer',
  'pageNumbers',
  // G-LAYOUT: written in styles.ts (pageNumberStart on the first paragraph, in nodes.ts).
  'headerLeft',
  'headerRight',
  'footerLeft',
  'footerRight',
  'pageNumberFormat',
  'pageNumberAlign',
  'pageNumberText',
  'firstPage',
  'columns',
  'columnSpacing',
  'pageNumberStart',
];

/** Top-level document fields the ODT export writes beyond the body and page. Others are reported. */
export const ODT_CONTENT_FIELDS: string[] = ['language'];

/** Reports page settings and document fields (comments …) that hold a value the ODT export does not write. */
function reportUnwritten(content: DocumentContent, report: ExportReport) {
  const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  const page = content.page as unknown as Record<string, unknown>;
  const defaults = DEFAULT_PAGE as unknown as Record<string, unknown>;
  for (const key of Object.keys(page)) {
    if (ODT_PAGE_FIELDS.includes(key) || same(page[key], defaults[key])) continue;
    report.add(`odt-page:${key}`, `The page setting “${key}” is not supported in ODT files yet and was left out`, `The page setting “${key}” is not supported in ODT files yet and was left out`);
  }
  const fields = content as unknown as Record<string, unknown>;
  for (const [key, field] of Object.entries(CONTENT_FIELDS)) {
    if (ODT_CONTENT_FIELDS.includes(key) || fields[key] === undefined || same(fields[key], field.default)) continue;
    ODT_NOTES.unsupportedField(report, key);
  }
}

function collectHeadings(doc: DocumentContent['doc']) {
  const out: Array<{ level: number; text: string }> = [];
  const walk = (n: DocumentContent['doc']) => {
    if (n.type === 'heading') {
      const text = (n.content ?? []).map((c) => c.text ?? '').join('').trim();
      if (text) out.push({ level: Math.min(Math.max(Number(n.attrs?.level) || 1, 1), 4), text });
      return;
    }
    n.content?.forEach(walk);
  };
  walk(doc);
  return out;
}

/** The parts of the package as text (content.xml, styles.xml, meta.xml, manifest.xml) plus the pictures. */
export function buildOdtParts(
  content: DocumentContent,
  title = 'Document',
  assets: Map<string, Uint8Array> = new Map(),
  report = new ExportReport(),
  now = new Date(),
  diagramRenders?: DiagramRenders,
): { parts: Record<string, string>; pictures: Map<string, { data: Uint8Array; mime: string }> } {
  const page = content.page;
  const paper = paperSize(page);
  const ctx: OdtCtx = {
    content,
    contentWidthPx: Math.round(((paper.width - page.margins.left - page.margins.right) / 25.4) * 96),
    styles: new AutoStyles(),
    pictures: new Map(),
    assets,
    diagramRenders,
    headings: collectHeadings(content.doc),
    report,
    paragraphStyle: 'Standard',
    ids: { table: 0, frame: 0, picture: 0, toc: 0, list: 0, quote: 0, code: 0 },
  };
  // The number of the first page (G-LAYOUT) goes on the first paragraph, as ODF numbers pages from a paragraph.
  const start = layoutOf(page).pageNumberStart;
  if (start !== LAYOUT_DEFAULTS.pageNumberStart) {
    const firstType = content.doc.content?.[0]?.type;
    if (firstType === 'paragraph' || firstType === 'heading') ctx.pageNumberStart = start;
    else {
      report.add(
        'odt-page-start',
        'The starting page number was left out: in ODT files it is set on the first paragraph, and this document starts with something else',
        'The starting page number was left out: in ODT files it is set on the first paragraph, and this document starts with something else',
      );
    }
  }
  const body = api.blocks(content.doc.content ?? [], ctx) || '<text:p text:style-name="Standard"/>';
  reportUnwritten(content, report);
  const contentXml =
    '<?xml version="1.0" encoding="UTF-8"?>' +
    `<office:document-content${xmlns('office', 'style', 'text', 'table', 'draw', 'fo', 'xlink', 'svg', 'number', 'dc', 'meta')} office:version="1.3">` +
    '<office:scripts/>' +
    FONT_FACES +
    `<office:automatic-styles>${ctx.styles.toXml()}</office:automatic-styles>` +
    `<office:body><office:text>${body}</office:text></office:body>` +
    '</office:document-content>';
  const date = now.toISOString().replace(/\.\d+Z$/, 'Z');
  const metaXml =
    '<?xml version="1.0" encoding="UTF-8"?>' +
    `<office:document-meta${xmlns('office', 'meta', 'dc')} office:version="1.3"><office:meta>` +
    el('meta:generator', {}, 'Digital Classroom OS') +
    el('dc:title', {}, esc(title)) +
    el('meta:creation-date', {}, date) +
    el('dc:date', {}, date) +
    '</office:meta></office:document-meta>';
  const entries = [
    el('manifest:file-entry', { 'manifest:full-path': '/', 'manifest:version': '1.3', 'manifest:media-type': ODT_MIME }),
    ...['content.xml', 'styles.xml', 'meta.xml'].map((p) => el('manifest:file-entry', { 'manifest:full-path': p, 'manifest:media-type': 'text/xml' })),
    ...[...ctx.pictures].map(([path, pic]) => el('manifest:file-entry', { 'manifest:full-path': path, 'manifest:media-type': pic.mime })),
  ];
  const manifestXml = '<?xml version="1.0" encoding="UTF-8"?>' + `<manifest:manifest${xmlns('manifest')} manifest:version="1.3">${entries.join('')}</manifest:manifest>`;
  return {
    parts: { 'content.xml': contentXml, 'styles.xml': stylesXml(page, content.language), 'meta.xml': metaXml, 'META-INF/manifest.xml': manifestXml },
    pictures: ctx.pictures,
  };
}

/** The .odt file: a zip whose first entry is the uncompressed "mimetype", as ODF requires. */
export function buildOdt(
  content: DocumentContent,
  title = 'Document',
  assets: Map<string, Uint8Array> = new Map(),
  report = new ExportReport(),
  now = new Date(),
  diagramRenders?: DiagramRenders,
): Uint8Array {
  const { parts, pictures } = buildOdtParts(content, title, assets, report, now, diagramRenders);
  const mtime = now;
  const files: Zippable = { mimetype: [strToU8(ODT_MIME), { level: 0, mtime }] };
  for (const [path, xml] of Object.entries(parts)) files[path] = [strToU8(xml), { level: 6, mtime }];
  // Pictures are already compressed.
  for (const [path, pic] of pictures) files[path] = [pic.data, { level: 0, mtime }];
  return zipSync(files);
}

/**
 * Loads embedded diagram previews (via the app's storage) and writes the .odt, as exportDocx does: a failing load is
 * treated as missing, `options.renderPreview` redraws missing previews and adds each diagram's SVG, and every PNG
 * carries the diagram's editable data (Phase 6, ADR 0013).
 */
export async function exportOdt(
  content: DocumentContent,
  title: string,
  loadAsset?: (id: string) => Promise<Blob | undefined>,
  report = new ExportReport(),
  options: DiagramExportOptions = {},
): Promise<Blob> {
  const assets = new Map<string, Uint8Array>();
  const renders = await prepareDiagramExport(content.doc, assets, loadAsset, options);
  const bytes = buildOdt(content, title, assets, report, new Date(), renders);
  return new Blob([bytes as BlobPart], { type: ODT_MIME });
}
