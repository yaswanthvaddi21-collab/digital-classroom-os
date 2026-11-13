/**
 * DOCX export. The conversion is split by concern, each with a registry that later features extend:
 * - nodes.ts    NODE_HANDLERS      block nodes   (// @phase4:docx-nodes)
 * - inlines.ts  INLINE_HANDLERS    inline nodes  (// @phase4:docx-inlines)
 * - marks.ts    MARK_HANDLERS      marks         (// @phase4:docx-marks)
 * - document.ts DOCUMENT_CONTRIBUTORS  document-level options such as comments, sections and styles
 *                                      (// @phase4:docx-document)
 * Anything written approximately is recorded in the ExportReport, which the export toast shows.
 */
import type { JSONContent } from '@tiptap/core';
import { AlignmentType, Document, Footer, Header, PageNumber, PageOrientation, Packer, Paragraph, TextRun, type ParagraphChild } from 'docx';
import { paperSize, type DocumentContent } from '../../types';
import { ExportReport } from '../report';
import type { Ctx } from './context';
import { DOCUMENT_CONTRIBUTORS, type DocumentOptions } from './document';
import { diagramPreviewIds } from './images';
import { numberingConfig } from './lists';
import { api } from './nodes';
import { firstColumnWidthPx } from './sections'; // G-LAYOUT
import { prepareInsertPictures } from '../insertPictures'; // G-INSERT
import { CALIBRI_SINGLE, twip } from './units';

/** Body text in the editor: 12pt with CSS line-height 1.5, i.e. Word "multiple" 1.5 / 1.2207 (see CALIBRI_SINGLE). */
const BODY_LINE = Math.round((1.5 / CALIBRI_SINGLE) * 240);

export { diagramPreviewIds } from './images';
export { toHalfPoints, toHex } from './units';
export type { Block, Ctx, DocxApi, InlineHandler, MarkHandler, NodeHandler, RunStyle } from './context';

function collectHeadingText(doc: JSONContent) {
  const out: Array<{ level: number; text: string }> = [];
  const walk = (n: JSONContent) => {
    if (n.type === 'heading') {
      const text = (n.content ?? []).map((c) => c.text ?? '').join('').trim();
      if (text) out.push({ level: Number(n.attrs?.level) || 1, text });
      return;
    }
    n.content?.forEach(walk);
  };
  walk(doc);
  return out;
}

export function buildDocx(content: DocumentContent, title = 'Document', assets: Map<string, Uint8Array> = new Map(), report = new ExportReport()): Document {
  const page = content.page;
  const paper = paperSize(page);
  const contentWidthMm = paper.width - page.margins.left - page.margins.right;
  const ctx: Ctx = {
    content,
    // G-LAYOUT: in a first section with columns, images and tables fit one column (else the whole text width).
    contentWidthPx: (page.columns ?? 1) > 1 ? firstColumnWidthPx(page) : Math.round((contentWidthMm / 25.4) * 96),
    listInstance: 0,
    headings: collectHeadingText(content.doc),
    assets,
    orderedStarts: new Set(),
    report,
    bookmarkId: (() => {
      let last = 0;
      return () => ++last;
    })(),
  };
  // Convert the body first: it decides which list numbering definitions are needed.
  const body = api.blocks(content.doc.content ?? [], ctx);

  const footerChildren: ParagraphChild[] = [];
  if (page.footer) footerChildren.push(new TextRun(page.footer));
  if (page.footer && page.pageNumbers) footerChildren.push(new TextRun('    '));
  if (page.pageNumbers) footerChildren.push(new TextRun({ children: ['Page ', PageNumber.CURRENT, ' of ', PageNumber.TOTAL_PAGES] }));

  const options: DocumentOptions = {
    title,
    creator: 'Digital Classroom OS',
    styles: {
      default: {
        document: { run: { font: 'Calibri', size: 24 }, paragraph: { spacing: { after: 160, line: BODY_LINE } } },
      },
    },
    numbering: { config: numberingConfig(ctx) },
    sections: [
      {
        properties: {
          page: {
            // Word expects portrait dimensions plus an orientation flag; it swaps them itself.
            size: {
              width: twip(Math.min(paper.width, paper.height)),
              height: twip(Math.max(paper.width, paper.height)),
              orientation: page.orientation === 'landscape' ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT,
            },
            margin: { top: twip(page.margins.top), right: twip(page.margins.right), bottom: twip(page.margins.bottom), left: twip(page.margins.left) },
          },
        },
        headers: page.header
          ? { default: new Header({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: page.header, color: '666666', size: 18 })] })] }) }
          : undefined,
        footers: footerChildren.length
          ? { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: footerChildren })] }) }
          : undefined,
        children: body,
      },
    ],
  };
  for (const contribute of DOCUMENT_CONTRIBUTORS) contribute(options, ctx);
  const document = new Document(options);
  numberHeadingBookmarks(document, ctx);
  return document;
}

/**
 * docx bookmarks the headings a table of contents lists (_Toc<id>) when the document is packed, taking the ids from a
 * counter shared by every export in the session, so the same document came out different on each export. The
 * body's id source is replaced by this document's own (docx 9.15: Body.headingBookmarkIds, whose get(i) gives the
 * id of the i-th listed heading). A repeated pack asks for the same indexes and gets the same ids.
 */
function numberHeadingBookmarks(document: Document, ctx: Ctx) {
  const body = document.Document.View.Body as unknown as { headingBookmarkIds?: { get(index: number): number } };
  if (!body.headingBookmarkIds || typeof body.headingBookmarkIds.get !== 'function') return;
  const ids: number[] = [];
  body.headingBookmarkIds = { get: (index) => (ids[index] ??= ctx.bookmarkId()) };
}

/** Loads embedded diagram previews (via the app's storage) and writes the .docx. */
export async function exportDocx(
  content: DocumentContent,
  title: string,
  loadAsset?: (id: string) => Promise<Blob | undefined>,
  report = new ExportReport(),
): Promise<Blob> {
  const assets = new Map<string, Uint8Array>();
  if (loadAsset) {
    for (const id of diagramPreviewIds(content.doc)) {
      const blob = await loadAsset(id);
      if (blob) assets.set(id, new Uint8Array(await blob.arrayBuffer()));
    }
  }
  for (const prepare of DOCX_PREPARERS) await prepare(content, assets);
  return Packer.toBlob(buildDocx(content, title, assets, report));
}

/**
 * Asynchronous work before the (synchronous) conversion, such as pictures drawn by the browser, added to the
 * export's assets for the handlers to use. What a preparer cannot produce is left out; the handler then writes a
 * reported fallback.
 */
export type DocxPreparer = (content: DocumentContent, assets: Map<string, Uint8Array>) => Promise<void>;

export const DOCX_PREPARERS: DocxPreparer[] = [
  (content, assets) => prepareInsertPictures(content, assets), // G-INSERT: shapes, and equations Word cannot take natively
  // @phase4:docx-prepare — register further asynchronous preparation here.
];
