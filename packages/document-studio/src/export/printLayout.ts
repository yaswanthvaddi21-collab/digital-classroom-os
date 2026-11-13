/**
 * Page layout in print / PDF (G-LAYOUT). The browser's print engine lays out the pages, so this only describes them:
 *
 * - Header and footer parts and the page number use CSS page-margin boxes (@top-left … @bottom-right); the first
 *   page's own parts use @page :first. Margin boxes need Chromium 131+ (Chrome, Edge); other browsers leave them out.
 * - Sections are wrapped in blocks: columns use CSS multi-column layout (every current browser); a section that
 *   starts on a new page with another orientation or page numbering uses a CSS named page (Chromium; other browsers
 *   print it in the first section's orientation).
 * - Page numbering that restarts in a section uses its own CSS counter, incremented on that section's named pages
 *   and preset on the first page (Chromium has no per-section counter reset). Measured in Chromium (see tests).
 *
 * Everything here quotes user text with cssString().
 */
import { layoutOf, LAYOUT_DEFAULTS, NUMBER_FORMAT_CSS, type HeaderFooterParts, type NumberFormat, type PageLayout } from '../pageLayout';
import { readBreakAttrs, resolveSections, SECTION_BREAK_DEFAULTS, type ResolvedSection } from '../sections';
import { paperSize, type PageSettings } from '../types';
import { cssString } from './print';

const MARGIN_BOX = 'font-family: Carlito, Calibri, Arial, sans-serif; font-size: 9pt; color: #666;';
const BOXES = { header: { left: 'top-left', center: 'top-center', right: 'top-right' }, footer: { left: 'bottom-left', center: 'bottom-center', right: 'bottom-right' } } as const;

/** The page number as CSS content, worded and formatted as chosen. */
function numberContent(layout: PageLayout, counter: string, format: NumberFormat) {
  const n = `counter(${counter}, ${NUMBER_FORMAT_CSS[format]})`;
  if (layout.pageNumberText === 'number') return n;
  if (layout.pageNumberText === 'page') return `"Page " ${n}`;
  return `"Page " ${n} " of " counter(pages)`;
}

/** CSS content of one margin box: its text, then the page number when it sits there (as v0.1.0's footer did). */
function boxContent(text: string, number: string | null): string {
  const parts: string[] = [];
  if (text) parts.push(cssString(text));
  if (text && number) parts.push('"   ·   "');
  if (number) parts.push(number);
  return parts.length ? parts.join(' ') : 'none';
}

function boxes(header: HeaderFooterParts, footer: HeaderFooterParts, numberAt: keyof HeaderFooterParts | null, number: string) {
  const out: string[] = [];
  for (const k of ['left', 'center', 'right'] as const) out.push(`@${BOXES.header[k]} { content: ${boxContent(header[k], null)}; ${MARGIN_BOX} }`);
  for (const k of ['left', 'center', 'right'] as const) out.push(`@${BOXES.footer[k]} { content: ${boxContent(footer[k], numberAt === k ? number : null)}; ${MARGIN_BOX} }`);
  return out.join('\n  ');
}

const usesLayout = (page: PageSettings) => {
  const layout = layoutOf(page) as unknown as Record<string, unknown>;
  return Object.entries(LAYOUT_DEFAULTS).some(([k, v]) => JSON.stringify(layout[k]) !== JSON.stringify(v));
};

/**
 * Page-level print rules (registered in PRINT_CSS): all six margin boxes, the first page's own boxes and the first
 * page number. Empty for a document that uses no layout setting, so its print page is unchanged.
 */
export function layoutPrintCss(page: PageSettings): string {
  if (!usesLayout(page)) return '';
  const layout = layoutOf(page);
  const header = { left: layout.headerLeft, center: page.header, right: layout.headerRight };
  const footer = { left: layout.footerLeft, center: page.footer, right: layout.footerRight };
  const number = numberContent(layout, 'page', layout.pageNumberFormat);
  const at = page.pageNumbers ? layout.pageNumberAlign : null;
  const rules = [`@page {\n  ${boxes(header, footer, at, number)}\n}`];
  const first: string[] = [];
  if (layout.pageNumberStart !== 1) first.push(`counter-set: page ${layout.pageNumberStart};`);
  if (layout.firstPage) first.push(boxes(layout.firstPage.header, layout.firstPage.footer, layout.firstPage.pageNumbers ? at : null, number));
  if (first.length) rules.push(`@page :first {\n  ${first.join('\n  ')}\n}`);
  return rules.join('\n');
}

/** Reads a break's stored attributes back from its rendered element (data-* attributes, as the clipboard does). */
function breakAttrs(el: Element): Record<string, unknown> {
  const num = (name: string) => {
    const v = el.getAttribute(name);
    return v === null || v === '' ? null : Number(v);
  };
  return readBreakAttrs({
    ...SECTION_BREAK_DEFAULTS,
    breakType: el.getAttribute('data-break') ?? 'nextPage',
    orientation: el.getAttribute('data-orientation'),
    columns: num('data-columns'),
    columnSpacing: num('data-column-spacing'),
    numberFormat: el.getAttribute('data-number-format'),
    numberStart: num('data-number-start'),
  }) as unknown as Record<string, unknown>;
}

/** Pages that start a group of pages (a "next page" section): its named page, orientation and numbering. */
interface PageGroup {
  name: string;
  section: ResolvedSection;
  /** Counter the group's page numbers use: `page` until the first restart, then one counter per restart. */
  counter: string;
}

/**
 * Prepares the print copy of the document body for its sections (registered in PRINT_DOM). Each section's blocks
 * are wrapped in a `.dcos-print-section` block (columns; a new page and named page where it starts on one), and a
 * <style> with the named pages is added. Section break markers are removed. Does nothing for a one-section,
 * one-column document.
 */
export function printSections(root: HTMLElement, page: PageSettings) {
  const breaks = Array.from(root.children).filter((el) => el.getAttribute('data-type') === 'section-break');
  root.querySelectorAll('[data-type="section-break"]').forEach((el) => {
    if (!breaks.includes(el)) el.remove(); // a break inside a table, list or quote has no effect
  });
  const sections = resolveSections(page, breaks.map(breakAttrs));
  if (sections.length === 1 && sections[0].columns === 1) return;

  const layout = layoutOf(page);
  const doc = root.ownerDocument;
  const groups: PageGroup[] = [];
  const restarts: Array<{ counter: string; start: number }> = [];
  let counter = 'page';
  const wrappers = sections.map((section) => {
    const wrapper = doc.createElement('div');
    wrapper.className = 'dcos-print-section';
    wrapper.setAttribute('data-section', String(section.index + 1));
    const style: string[] = [];
    if (section.columns > 1) style.push(`column-count: ${section.columns}`, `column-gap: ${section.columnSpacing}mm`);
    if (section.index > 0 && section.breakType === 'nextPage') {
      if (section.numberStart !== null) {
        counter = `dcos-n${restarts.length + 1}`;
        restarts.push({ counter, start: section.numberStart });
      }
      groups.push({ name: `dcos-g${groups.length + 1}`, section, counter });
      style.push('break-before: page');
    }
    if (groups.length) style.push(`page: ${groups[groups.length - 1].name}`);
    if (style.length) wrapper.setAttribute('style', style.join('; '));
    return wrapper;
  });

  // Move every top-level block into its section's wrapper.
  let i = 0;
  for (const child of Array.from(root.children)) {
    if (breaks.includes(child)) {
      child.remove();
      i += 1;
    } else wrappers[i].appendChild(child);
  }
  for (const w of wrappers) if (w.childNodes.length) root.appendChild(w);

  const rules: string[] = [
    '.dcos-print-section > * + * { margin-top: 0.6em; }',
    '.dcos-print-section > :first-child { margin-top: 0; }',
    '.dcos-print-section[style*="column-count"] img, .dcos-print-section[style*="column-count"] table { max-width: 100%; }',
  ];
  const at = page.pageNumbers ? layout.pageNumberAlign : null;
  for (const g of groups) {
    const paper = paperSize({ size: page.size, orientation: g.section.orientation });
    const inc = g.counter === 'page' ? '' : `counter-increment: page 1 ${g.counter} 1;`;
    const number = numberContent(layout, g.counter, g.section.numberFormat);
    const footer = { left: layout.footerLeft, center: page.footer, right: layout.footerRight };
    const box = at ? `@${BOXES.footer[at]} { content: ${boxContent(footer[at], number)}; ${MARGIN_BOX} }` : '';
    rules.push(`@page ${g.name} { size: ${paper.width}mm ${paper.height}mm; ${inc} ${box} }`);
  }
  // Restarted numbering: each counter is preset on the first page so its section's first page shows the start number.
  const presets = restarts.map((r) => `${r.counter} ${r.start - 1}`).join(' ');
  if (restarts.length) rules.push(`@page :first { counter-increment: page 1 ${presets}; }`);
  // When the document starts with a section break, its first page is a named page, and a named page's rules outrank
  // `@page :first`, so the presets and the first page's own header and footer would be lost there. Each named page
  // therefore gets a `:first` rule of its own (it only ever matches the document's first page).
  if (restarts.length || layout.firstPage) {
    for (const g of groups) {
      const inc = new Map<string, number>([['page', 1]]);
      for (const r of restarts) inc.set(r.counter, r.start - 1);
      if (g.counter !== 'page') inc.set(g.counter, (inc.get(g.counter) ?? 0) + 1);
      const fp = layout.firstPage;
      const fpBoxes = fp ? boxes(fp.header, fp.footer, fp.pageNumbers ? at : null, numberContent(layout, g.counter, g.section.numberFormat)) : '';
      rules.push(`@page ${g.name}:first { counter-increment: ${[...inc].map(([c, n]) => `${c} ${n}`).join(' ')}; ${fpBoxes} }`);
    }
  }
  const style = doc.createElement('style');
  style.textContent = rules.join('\n');
  root.prepend(style);
}
