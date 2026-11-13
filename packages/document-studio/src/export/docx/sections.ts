/**
 * Page layout in Word (G-LAYOUT): real sections (w:sectPr) with their own break type, orientation, columns and page
 * numbering; headers and footers with left, centre and right parts (tab stops); a different first page.
 *
 * Section breaks are converted in body order by `sectionBreakHandler`, which leaves a marker paragraph where each one
 * was; `layoutContributor` then splits the body at the markers into Word sections. A document that uses none of
 * this keeps the single section buildDocx writes, byte for byte.
 */
import { AlignmentType, Footer, Header, PageNumber, PageOrientation, Paragraph, SectionType, Tab, TabStopType, TextRun, type ISectionOptions, type ParagraphChild } from 'docx';
import { layoutOf, LAYOUT_DEFAULTS, type HeaderFooterParts, type PageLayout } from '../../pageLayout';
import { resolveSections, type ResolvedSection } from '../../sections';
import { paperSize, type PageSettings } from '../../types';
import { NOTES } from '../report';
import type { Block, Ctx, NodeHandler } from './context';
import type { DocumentContributor } from './document';
import { twip } from './units';

/** The marker paragraphs left by section breaks in each export, with the break's attributes, in body order. */
const markers = new WeakMap<Ctx, Array<{ marker: Paragraph; attrs: Record<string, unknown> | undefined }>>();

/** Width of one text column in CSS pixels, for scaling images and tables to the column they are in. */
export function columnWidthPx(page: PageSettings, section: Pick<ResolvedSection, 'orientation' | 'columns' | 'columnSpacing'>): number {
  const paper = paperSize({ size: page.size, orientation: section.orientation });
  const text = paper.width - page.margins.left - page.margins.right;
  const column = (text - section.columnSpacing * (section.columns - 1)) / section.columns;
  return Math.round((Math.max(column, 10) / 25.4) * 96);
}

/** Section break: a marker where the next Word section starts (top level only; elsewhere it has no effect). */
export const sectionBreakHandler: NodeHandler = (node, ctx) => {
  const topLevel = (ctx.content.doc.content ?? []).includes(node);
  if (!topLevel || ctx.inCell) {
    NOTES.nestedSectionBreak(ctx.report);
    return [];
  }
  const list = markers.get(ctx) ?? [];
  markers.set(ctx, list);
  list.push({ marker: new Paragraph({}), attrs: node.attrs });
  // Everything after the break is scaled to the new section's column width.
  const sections = resolveSections(ctx.content.page, list.map((m) => m.attrs));
  ctx.contentWidthPx = columnWidthPx(ctx.content.page, sections[sections.length - 1]);
  return [list[list.length - 1].marker];
};

/** Whether the page settings use any layout field away from its default (else buildDocx's output stands). */
function usesLayout(page: PageSettings) {
  const layout = layoutOf(page) as unknown as Record<string, unknown>;
  return Object.entries(LAYOUT_DEFAULTS).some(([k, v]) => JSON.stringify(layout[k]) !== JSON.stringify(v));
}

const HEADER_RUN = { color: '666666', size: 18 } as const;

/** The page number as Word fields, worded as chosen. */
function pageNumberRun(layout: PageLayout): TextRun {
  if (layout.pageNumberText === 'number') return new TextRun({ children: [PageNumber.CURRENT] });
  if (layout.pageNumberText === 'page') return new TextRun({ children: ['Page ', PageNumber.CURRENT] });
  return new TextRun({ children: ['Page ', PageNumber.CURRENT, ' of ', PageNumber.TOTAL_PAGES] });
}

/**
 * One header or footer line. Text only in the centre is a centred paragraph (as v0.1.0 wrote it); otherwise a
 * centre and a right tab stop place the three parts, as Word's own header layout does.
 */
function partsParagraph(parts: HeaderFooterParts, widthTwip: number, run: { color?: string; size?: number }, pageNumber: { at: keyof HeaderFooterParts; run: () => TextRun } | null): Paragraph | null {
  const children = (k: keyof HeaderFooterParts): ParagraphChild[] => {
    const out: ParagraphChild[] = [];
    if (parts[k]) out.push(new TextRun({ text: parts[k], ...run }));
    if (pageNumber?.at === k) {
      if (parts[k]) out.push(new TextRun({ text: '    ', ...run }));
      out.push(pageNumber.run());
    }
    return out;
  };
  const left = children('left');
  const center = children('center');
  const right = children('right');
  if (!left.length && !center.length && !right.length) return null;
  if (!left.length && !right.length) return new Paragraph({ alignment: AlignmentType.CENTER, children: center });
  const tab = () => new TextRun({ children: [new Tab()] });
  return new Paragraph({
    tabStops: [
      { type: TabStopType.CENTER, position: Math.round(widthTwip / 2) },
      { type: TabStopType.RIGHT, position: widthTwip },
    ],
    children: [...left, tab(), ...center, ...(right.length ? [tab(), ...right] : [])],
  });
}

/** The headers and footers of a section whose text area is `widthTwip` wide. */
function headersAndFooters(page: PageSettings, layout: PageLayout, widthTwip: number, first: boolean): Pick<ISectionOptions, 'headers' | 'footers'> {
  const header: HeaderFooterParts = { left: layout.headerLeft, center: page.header, right: layout.headerRight };
  const footer: HeaderFooterParts = { left: layout.footerLeft, center: page.footer, right: layout.footerRight };
  // The page number in the footer, as v0.1.0 wrote it: plain runs (header runs are small and grey).
  const number = page.pageNumbers ? { at: layout.pageNumberAlign, run: () => pageNumberRun(layout) } : null;
  const h = partsParagraph(header, widthTwip, HEADER_RUN, null);
  const f = partsParagraph(footer, widthTwip, {}, number);
  const out: { headers?: ISectionOptions['headers']; footers?: ISectionOptions['footers'] } = {
    headers: h ? { default: new Header({ children: [h] }) } : undefined,
    footers: f ? { default: new Footer({ children: [f] }) } : undefined,
  };
  if (first && layout.firstPage) {
    const fp = layout.firstPage;
    const fh = partsParagraph(fp.header, widthTwip, HEADER_RUN, null);
    const ff = partsParagraph(fp.footer, widthTwip, {}, page.pageNumbers && fp.pageNumbers ? { at: layout.pageNumberAlign, run: () => pageNumberRun(layout) } : null);
    // Empty first-page parts are written as empty paragraphs, so the first page shows nothing there.
    out.headers = { ...out.headers, first: new Header({ children: [fh ?? new Paragraph({})] }) };
    out.footers = { ...out.footers, first: new Footer({ children: [ff ?? new Paragraph({})] }) };
  }
  return out;
}

/** The Word section for one resolved section and its blocks. */
function sectionOptions(page: PageSettings, layout: PageLayout, section: ResolvedSection, children: Block[], first: boolean): ISectionOptions {
  const paper = paperSize({ size: page.size, orientation: section.orientation });
  const m = page.margins;
  const widthTwip = twip(paper.width - m.left - m.right);
  return {
    properties: {
      ...(first ? {} : { type: section.breakType === 'continuous' ? SectionType.CONTINUOUS : SectionType.NEXT_PAGE }),
      ...(first && layout.firstPage ? { titlePage: true } : {}),
      page: {
        // Word expects portrait dimensions plus an orientation flag; it swaps them itself.
        size: {
          width: twip(Math.min(paper.width, paper.height)),
          height: twip(Math.max(paper.width, paper.height)),
          orientation: section.orientation === 'landscape' ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT,
        },
        margin: { top: twip(m.top), right: twip(m.right), bottom: twip(m.bottom), left: twip(m.left) },
        pageNumbers: {
          ...(section.numberStart !== null && (!first || section.numberStart !== 1) ? { start: section.numberStart } : {}),
          ...(section.numberFormat !== 'decimal' ? { formatType: section.numberFormat } : {}),
        },
      },
      ...(section.columns > 1 ? { column: { count: section.columns, space: twip(section.columnSpacing), equalWidth: true } } : {}),
    },
    ...headersAndFooters(page, layout, widthTwip, first),
    children,
  };
}

/** Rewrites the document's sections when it uses section breaks or any layout setting. */
export const layoutContributor: DocumentContributor = (options, ctx) => {
  const page = ctx.content.page;
  const found = markers.get(ctx) ?? [];
  if (!found.length && !usesLayout(page)) return;
  const [body, ...rest] = options.sections;
  if (!body) return;
  const layout = layoutOf(page);
  const sections = resolveSections(page, found.map((m) => m.attrs));
  const at = new Set<unknown>(found.map((m) => m.marker));
  const chunks: Block[][] = [[]];
  for (const child of body.children as Block[]) {
    if (at.has(child)) chunks.push([]);
    else chunks[chunks.length - 1].push(child);
  }
  // An empty section is left out, as print/PDF leaves it out, or Word would show a blank page for it. That happens
  // when the document starts with a break (the first section is empty), and when a section is empty and the next one
  // starts on a new page (two next-page breaks in a row). The next section then takes its place with its own
  // orientation and columns. A page-number restart of the dropped section is kept: in print the restarted count
  // carries on until the next restart, so it carries over to the next section unless that one restarts itself.
  const parts: Array<{ children: Block[]; section: ResolvedSection }> = [];
  let carriedStart: number | null = null;
  chunks.forEach((children, i) => {
    let section = sections[i];
    // A continuous section never restarts numbering on its own, but one that becomes the first page does start it.
    if (carriedStart !== null && section.numberStart === null && (parts.length === 0 || section.breakType === 'nextPage')) section = { ...section, numberStart: carriedStart };
    const next = sections[i + 1];
    const droppable = !children.length && next !== undefined && (parts.length === 0 || next.breakType === 'nextPage');
    if (droppable) {
      carriedStart = section.numberStart ?? carriedStart;
      return;
    }
    carriedStart = null;
    parts.push({ children, section });
  });
  options.sections = [...parts.map((part, i) => sectionOptions(page, layout, part.section, part.children, i === 0)), ...rest];
};

/** Width of the first section's text column (used before the body is converted). */
export function firstColumnWidthPx(page: PageSettings): number {
  return columnWidthPx(page, resolveSections(page, [])[0]);
}

