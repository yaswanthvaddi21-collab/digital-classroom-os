import type { JSONContent } from '@tiptap/core';
import { unzipSync } from 'fflate';
import { ExportReport } from '../export/report';
import { contentSchemaFor } from '../migrate';
import { isLanguageTag } from '../review/language';
import { documentSchema } from '../schema';
import { LAYOUT_FIELD_CHECKS, type PageLayoutFields } from '../pageLayout';
import { DEFAULT_PAGE, PAGE_FIELD_CHECKS, PAPER_LABELS, PAPER_MM, type DocumentContent, type PageSettings, type PageSize } from '../types';

/**
 * What an import could not bring in exactly: counted notes, worded for the user ("2 comments were not imported").
 * The same counting as export reports (ExportReport), so repeated kinds are counted, not repeated.
 */
export class ImportReport extends ExportReport {}

export interface ImportResult {
  /** The new document's content (never merged into an existing document). */
  content: DocumentContent;
  /** A title for the new document: the file's own title, or its name. */
  title: string;
  report: ImportReport;
  format: 'docx' | 'odt' | 'dcosdoc';
  /**
   * Phase 6 (ADR 0013): pictures the new document refers to by attachment id (the previews of embedded diagrams),
   * which the app must store before saving the document: store each one, then give the content to
   * withStoredAttachments with the ids the store gave them. Absent when the document refers to none; present but
   * empty when it refers to pictures none of which could be read (their ids must still be cleared).
   */
  attachments?: ImportedAttachment[];
}

/** A picture an imported document refers to by `id` (a diagram's previewId or svgPreviewId). */
export interface ImportedAttachment {
  /** The id the imported content uses for it (in the file, or made up by the import), replaced when stored. */
  id: string;
  data: Uint8Array;
  mimeType: 'image/png' | 'image/svg+xml';
}

/**
 * The imported content with each diagram's previewId and svgPreviewId replaced by the id its picture was stored
 * under (`stored`: id in the import → id in the store). An id that was not stored becomes null: the diagram keeps its
 * data and shows that its preview is missing (it can be drawn again from the data), never someone else's picture.
 * The content's schema number is worked out again, since clearing an SVG preview can lower it.
 */
export function withStoredAttachments(content: DocumentContent, stored: ReadonlyMap<string, string>): DocumentContent {
  const swap = (v: unknown) => (typeof v === 'string' && v ? stored.get(v) ?? null : null);
  const walk = (n: JSONContent): JSONContent => {
    const next: JSONContent = n.type === 'diagram' && n.attrs ? { ...n, attrs: { ...n.attrs, previewId: swap(n.attrs.previewId), svgPreviewId: swap(n.attrs.svgPreviewId) } } : { ...n };
    if (n.content) next.content = n.content.map(walk);
    return next;
  };
  const { schemaVersion: _old, ...rest } = { ...content, doc: walk(content.doc) };
  return { ...rest, schemaVersion: contentSchemaFor(rest as unknown as Pick<DocumentContent, 'doc'> & Record<string, unknown>) } as DocumentContent;
}

/**
 * Most a file may unpack to (all its parts together). A Word or OpenDocument file is a zip package, and a damaged or
 * hostile one can claim to unpack to gigabytes and stall or crash the tab; real documents are far below this.
 */
export const MAX_UNPACKED_BYTES = 512 * 1024 * 1024;

/**
 * Unpacks a zip package (a .docx or .odt file), refusing one that would unpack to more than `limit` bytes. The sizes
 * come from the package's directory, and each part is unpacked into a buffer of its stated size, so a part cannot
 * grow beyond it. Throws a readable Error (`notZip` when the bytes are not a zip package).
 */
export function unpack(bytes: Uint8Array, notZip: string, limit = MAX_UNPACKED_BYTES): Record<string, Uint8Array> {
  let total = 0;
  let tooLarge = false;
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes, {
      filter: (f) => {
        total += Math.max(0, f.originalSize);
        if (total > limit) {
          tooLarge = true;
          throw new Error('too large');
        }
        return true;
      },
    });
  } catch {
    if (tooLarge) throw new Error(`This file unpacks to more than ${Math.round(limit / 1024 / 1024)} MB, which is too large to import`);
    throw new Error(notZip);
  }
  return files;
}

/** Shared wording for import notes. */
export const IMPORT_NOTES = {
  comments: (r: ImportReport, n: number) => r.add('comments', '1 comment was not imported', '{n} comments were not imported', n),
  footnotes: (r: ImportReport, n: number) =>
    r.add('footnotes', '1 footnote or endnote was imported as a numbered note at the end', '{n} footnotes and endnotes were imported as numbered notes at the end', n),
  equations: (r: ImportReport, n: number) => r.add('equations', '1 equation was not imported', '{n} equations were not imported', n),
  charts: (r: ImportReport, n: number) => r.add('charts', '1 chart was not imported', '{n} charts were not imported', n),
  shapes: (r: ImportReport, n: number) => r.add('shapes', '1 drawing shape was not imported', '{n} drawing shapes were not imported', n),
  textBoxes: (r: ImportReport, n: number) => r.add('text-boxes', 'The text of 1 text box was imported as ordinary paragraphs', 'The text of {n} text boxes was imported as ordinary paragraphs', n),
  imageFormat: (r: ImportReport, n: number) =>
    r.add('image-format', '1 picture in a format browsers cannot show was replaced by a note', '{n} pictures in formats browsers cannot show were replaced by notes', n),
  linkedImage: (r: ImportReport, n: number) => r.add('linked-image', '1 linked (not embedded) picture was not imported', '{n} linked (not embedded) pictures were not imported', n),
  deepHeading: (r: ImportReport, n: number) => r.add('deep-heading', '1 heading below level 4 was imported as a level 4 heading', '{n} headings below level 4 were imported as level 4 headings', n),
  unsafeLink: (r: ImportReport, n: number) => r.add('unsafe-link', '1 link with an unsupported address was imported as plain text', '{n} links with unsupported addresses were imported as plain text', n),
  trackedChanges: (r: ImportReport) => r.add('tracked-changes', 'Tracked changes were accepted (insertions kept, deletions removed)', 'Tracked changes were accepted (insertions kept, deletions removed)'),
  sections: (r: ImportReport, n: number) =>
    r.add('sections', '1 section break was not imported; the whole document uses one page layout', '{n} section breaks were not imported; the whole document uses one page layout', n),
  columns: (r: ImportReport) => r.add('columns', 'Text columns of a part of the document were not imported', 'Text columns of parts of the document were not imported'),
  columnCount: (r: ImportReport, n: number, max: number) =>
    r.add('column-count', `The ${n} text columns were imported as ${max}, the most this app has`, `The ${n} text columns were imported as ${max}, the most this app has`),
  // Round 3: Word layout and list settings the DOCX import does not bring in (said, never silently dropped).
  pageNumbering: (r: ImportReport) => r.add('page-numbering', 'The page number format and starting number were not imported', 'The page number format and starting number were not imported'),
  firstPage: (r: ImportReport) => r.add('first-page', 'The different first-page header and footer were not imported', 'The different first-page header and footer were not imported'),
  headerParts: (r: ImportReport) =>
    r.add('header-parts', 'Header and footer text placed left, centre and right was imported as one centred line', 'Header and footer text placed left, centre and right was imported as one centred line'),
  listNumbering: (r: ImportReport) =>
    r.add('list-numbering', 'List numbering formats and start numbers were not imported (lists are numbered 1, 2, 3)', 'List numbering formats and start numbers were not imported (lists are numbered 1, 2, 3)'),
  formatting: (r: ImportReport, kinds: string[]) => {
    if (!kinds.length) return;
    const list = kinds.length === 1 ? kinds[0] : `${kinds.slice(0, -1).join(', ')} and ${kinds.at(-1)}`;
    r.add('formatting', `${list[0].toUpperCase()}${list.slice(1)} were not imported`, `${list[0].toUpperCase()}${list.slice(1)} were not imported`);
  },
  pageSize: (r: ImportReport, w: number, h: number, used: string) =>
    r.add('page-size', `The page size (${Math.round(w)} × ${Math.round(h)} mm) is not one this app has; ${used} was used`, `The page size (${Math.round(w)} × ${Math.round(h)} mm) is not one this app has; ${used} was used`),
  margins: (r: ImportReport) => r.add('margins', 'The page margins could not be used; standard margins were used', 'The page margins could not be used; standard margins were used'),
  other: (r: ImportReport, what: string, n = 1) => r.add(`other:${what}`, `1 ${what} was not imported`, `{n} ${what}s were not imported`, n),
};

/** Lengths ("2.5cm", "1in", "12pt", "20mm", "96px") in millimetres; null when unreadable. */
export function lengthMm(value: string | null | undefined): number | null {
  if (!value) return null;
  const m = /^\s*(-?[\d.]+)\s*(cm|mm|in|inch|pt|pc|px)?\s*$/i.exec(value);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n)) return null;
  const unit = (m[2] ?? 'cm').toLowerCase();
  const factor: Record<string, number> = { cm: 10, mm: 1, in: 25.4, inch: 25.4, pt: 25.4 / 72, pc: 25.4 / 6, px: 25.4 / 96 };
  return n * factor[unit];
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Page settings from a file's page geometry (millimetres). The paper size is matched to the sizes this app has
 * (within 2 mm); another size uses the closest and says so. Margins this app cannot use are replaced by defaults.
 */
export function pageFromGeometry(
  geometry: { width: number; height: number; landscape?: boolean; margins: { top: number; right: number; bottom: number; left: number } } | null,
  extra: { header?: string; footer?: string; pageNumbers?: boolean } & PageLayoutFields,
  report: ImportReport,
): PageSettings {
  const { header, footer, pageNumbers, ...layout } = extra;
  // Layout fields (G-LAYOUT) are kept only when valid; the others take their defaults.
  const valid = Object.fromEntries(Object.entries(layout).filter(([k, v]) => v !== undefined && LAYOUT_FIELD_CHECKS[k] && !LAYOUT_FIELD_CHECKS[k](v)));
  const page: PageSettings = { ...DEFAULT_PAGE, margins: { ...DEFAULT_PAGE.margins }, ...valid, header: header ?? '', footer: footer ?? '', pageNumbers: pageNumbers ?? false };
  if (!geometry || !(geometry.width > 0) || !(geometry.height > 0)) return page;
  const short = Math.min(geometry.width, geometry.height);
  const long = Math.max(geometry.width, geometry.height);
  let best: PageSize = DEFAULT_PAGE.size;
  let bestDiff = Infinity;
  for (const [size, mm] of Object.entries(PAPER_MM) as Array<[PageSize, { width: number; height: number }]>) {
    const diff = Math.abs(mm.width - short) + Math.abs(mm.height - long);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = size;
    }
  }
  page.size = best;
  if (bestDiff > 4) IMPORT_NOTES.pageSize(report, short, long, PAPER_LABELS[best]?.short ?? best);
  page.orientation = geometry.landscape ?? geometry.width > geometry.height ? 'landscape' : 'portrait';
  const margins = { top: round1(geometry.margins.top), right: round1(geometry.margins.right), bottom: round1(geometry.margins.bottom), left: round1(geometry.margins.left) };
  if (PAGE_FIELD_CHECKS.margins(margins, page as unknown as Record<string, unknown>)) IMPORT_NOTES.margins(report);
  else page.margins = margins;
  return page;
}

/**
 * Checks the imported body against the editor's schema and returns it in the editor's normal form (adjacent text
 * with the same formatting merged, attributes filled in). Throws when the body is not valid, so a damaged import
 * never becomes a document that opens blank.
 */
export function finishDoc(doc: JSONContent): JSONContent {
  const node = documentSchema().nodeFromJSON(doc);
  node.check();
  return node.toJSON() as JSONContent;
}

/** The stored content of an imported document. `language` is the file's language (a BCP 47 tag), when it has one. */
export function importedContent(doc: JSONContent, page: PageSettings, language?: string | null): DocumentContent {
  const body = finishDoc(doc.content?.length ? doc : { type: 'doc', content: [{ type: 'paragraph' }] });
  const content: Omit<DocumentContent, 'schemaVersion'> = { doc: body, page, mode: 'advanced' as const, ...(language && isLanguageTag(language) ? { language } : {}) };
  return { ...content, schemaVersion: contentSchemaFor(content) };
}

/**
 * A paragraph in the Caption style right under a picture becomes that picture's caption (G-INSERT), as the DOCX and
 * ODT exports write captions. Only plain (or italic) text is taken, since a caption is plain text; anything else
 * stays a Caption paragraph. Works through the whole document (table cells, list items …); changes `doc` in place.
 */
export function attachCaptions(doc: JSONContent): JSONContent {
  const walk = (node: JSONContent) => {
    const blocks = node.content;
    if (!blocks) return;
    for (let i = 0; i + 1 < blocks.length; i++) {
      const image = blocks[i];
      const next = blocks[i + 1];
      // Phase 6: an imported diagram takes its caption the same way.
      if ((image.type !== 'image' && image.type !== 'diagram') || image.attrs?.caption || next.type !== 'paragraph' || next.attrs?.paragraphStyle !== 'caption') continue;
      const runs = next.content ?? [];
      if (!runs.every((c) => c.type === 'text' && (c.marks ?? []).every((m) => m.type === 'italic'))) continue;
      const caption = runs.map((c) => c.text ?? '').join('').trim();
      if (!caption) continue;
      image.attrs = { ...image.attrs, caption };
      blocks.splice(i + 1, 1);
    }
    blocks.forEach(walk);
  };
  walk(doc);
  return doc;
}

/** Points from an ODF or CSS length, rounded to 0.01 pt; null when unreadable. */
export function lengthPt(value: string | null | undefined): number | null {
  const mm = lengthMm(value);
  return mm === null ? null : Math.round(((mm * 72) / 25.4) * 100) / 100;
}

/** "Imported “Essay”." plus one sentence per note. */
export function importSummary(title: string, report: ImportReport): { message: string; notes: string[] } {
  const notes = report.sentences().map((s) => `${s[0].toUpperCase()}${s.slice(1)}.`);
  return { message: `Imported “${title}”.`, notes };
}
