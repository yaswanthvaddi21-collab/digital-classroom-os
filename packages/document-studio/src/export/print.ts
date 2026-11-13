import { documentContentCss } from '../contentCss';
import { paperSize, type PageSettings } from '../types';
import { layoutPrintCss, printSections } from './printLayout'; // G-LAYOUT

/**
 * A CSS string literal that is safe inside a <style> element: quotes and backslashes are escaped, and so are
 * < and > (as CSS hex escapes), so text such as "</style><script>" can never end the style element (audit DS-1).
 */
export const cssString = (value: unknown) =>
  `"${String(value ?? '').replace(/[\\"<>\r\n\f]/g, (c) => (c === '\n' || c === '\r' || c === '\f' ? ' ' : `\\${c.charCodeAt(0).toString(16).toUpperCase()} `))}"`;
const escapeHtml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** Copies the rendered editor DOM, minus editing-only artefacts (search highlights, resize handles). */
export function cleanClone(editorDom: HTMLElement, page?: PageSettings) {
  const clone = editorDom.cloneNode(true) as HTMLElement;
  clone.removeAttribute('contenteditable');
  clone.querySelectorAll('[contenteditable]').forEach((el) => el.removeAttribute('contenteditable'));
  clone.querySelectorAll('.dcos-search-match').forEach((el) => el.replaceWith(...Array.from(el.childNodes)));
  clone.querySelectorAll('[data-resize-handle], .column-resize-handle, .ProseMirror-gapcursor, .ProseMirror-separator, .ProseMirror-trailingBreak, .dcos-diagram-handle, .dcos-diagram-busy, .dcos-diagram-alert').forEach((el) => el.remove());
  clone.querySelectorAll('.dcos-image-remote').forEach((el) => el.classList.remove('dcos-image-remote'));
  clone.querySelectorAll('.ProseMirror-selectednode, .selectedCell, .is-selected').forEach((el) => el.classList.remove('ProseMirror-selectednode', 'selectedCell', 'is-selected'));
  clone.querySelectorAll('.is-editor-empty').forEach((el) => el.removeAttribute('data-placeholder'));
  if (page) for (const change of PRINT_DOM) change(clone, page);
  return clone.innerHTML;
}

/**
 * Extra print rules from later features, given the page settings (e.g. named pages or columns). Each returns CSS,
 * which must quote any user text with cssString().
 */
export const PRINT_CSS: Array<(page: PageSettings) => string> = [
  // G-REVIEW: comments are never printed (the text prints without its highlight; threads are not part of the page).
  () => '.dcos-doc .dcos-comment, .dcos-doc .dcos-comment-pending { background: none !important; border: none !important; }',
  // @phase4:print-css — add print rules for new features here.
  // G-LAYOUT: header/footer parts, page number format and start, different first page (page-margin boxes).
  layoutPrintCss,
];

/**
 * Changes to the print copy of the document body, given the page settings (G-LAYOUT: section wrappers for columns
 * and named pages). Each runs on the cleaned clone before it is serialised.
 */
export const PRINT_DOM: Array<(root: HTMLElement, page: PageSettings) => void> = [printSections];

/** Builds a standalone, print-ready HTML page. Exported for tests and for future native PDF rendering. */
export function buildPrintHtml(bodyHtml: string, page: PageSettings, title: string) {
  const paper = paperSize(page);
  const m = page.margins;
  const footerParts: string[] = [];
  if (page.footer) footerParts.push(cssString(page.footer));
  if (page.footer && page.pageNumbers) footerParts.push('"   ·   "');
  if (page.pageNumbers) footerParts.push('"Page " counter(page) " of " counter(pages)');
  const marginBox = 'font-family: Carlito, Calibri, Arial, sans-serif; font-size: 9pt; color: #666;';
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>
@page {
  size: ${paper.width}mm ${paper.height}mm;
  margin: ${m.top}mm ${m.right}mm ${m.bottom}mm ${m.left}mm;
  ${page.header ? `@top-center { content: ${cssString(page.header)}; ${marginBox} }` : ''}
  ${footerParts.length ? `@bottom-center { content: ${footerParts.join(' ')}; ${marginBox} }` : ''}
}
html, body { margin: 0; padding: 0; background: #fff; }
${documentContentCss}
${PRINT_CSS.map((css) => css(page)).join('\n')}
</style></head>
<body><div class="dcos-doc">${bodyHtml}</div></body></html>`;
}

/**
 * Opens the system print dialog for the document; "Save as PDF" produces the PDF export.
 * Using the browser's print engine keeps real text (selectable, searchable) and exact page layout,
 * which client-side PDF libraries cannot match. Header/footer margin boxes need Chromium 131+.
 */
export function printDocument(editorDom: HTMLElement, page: PageSettings, title: string): Promise<void> {
  return new Promise((resolve) => {
    const iframe = document.createElement('iframe');
    iframe.setAttribute('aria-hidden', 'true');
    iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
    document.body.appendChild(iframe);
    const win = iframe.contentWindow!;
    const doc = win.document;
    doc.open();
    doc.write(buildPrintHtml(cleanClone(editorDom, page), page, title));
    doc.close();

    let done = false;
    const cleanup = () => {
      if (done) return;
      done = true;
      setTimeout(() => iframe.remove(), 500);
      resolve();
    };
    const go = async () => {
      const images = Array.from(doc.images);
      await Promise.all(images.map((img) => (img.complete ? null : new Promise((r) => ((img.onload = r), (img.onerror = r))))));
      await doc.fonts?.ready;
      // The parent title is what Chrome/Safari use as the default PDF filename.
      const previousTitle = document.title;
      document.title = title;
      win.addEventListener('afterprint', () => {
        document.title = previousTitle;
        cleanup();
      }, { once: true });
      win.focus();
      win.print();
      // Some engines don't fire afterprint for iframes; restore anyway.
      // Some engines never fire afterprint for iframes; restore and clean up regardless (audit CODE-12).
      setTimeout(() => {
        document.title = previousTitle;
        cleanup();
      }, 1000);
    };
    if (doc.readyState === 'complete') void go();
    else iframe.addEventListener('load', () => void go(), { once: true });
  });
}
