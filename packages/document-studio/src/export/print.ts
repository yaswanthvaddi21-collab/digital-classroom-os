import { documentContentCss } from '../contentCss';
import { paperSize, type PageSettings } from '../types';

const cssString = (s: string) => `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, ' ')}"`;
const escapeHtml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** Copies the rendered editor DOM, minus editing-only artefacts (search highlights, resize handles). */
function cleanClone(editorDom: HTMLElement) {
  const clone = editorDom.cloneNode(true) as HTMLElement;
  clone.removeAttribute('contenteditable');
  clone.querySelectorAll('[contenteditable]').forEach((el) => el.removeAttribute('contenteditable'));
  clone.querySelectorAll('.dcos-search-match').forEach((el) => el.replaceWith(...Array.from(el.childNodes)));
  clone.querySelectorAll('[data-resize-handle], .column-resize-handle, .ProseMirror-gapcursor, .ProseMirror-separator, .ProseMirror-trailingBreak').forEach((el) => el.remove());
  clone.querySelectorAll('.ProseMirror-selectednode, .selectedCell, .is-selected').forEach((el) => el.classList.remove('ProseMirror-selectednode', 'selectedCell', 'is-selected'));
  clone.querySelectorAll('.is-editor-empty').forEach((el) => el.removeAttribute('data-placeholder'));
  return clone.innerHTML;
}

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
    doc.write(buildPrintHtml(cleanClone(editorDom), page, title));
    doc.close();

    const cleanup = () => {
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
      setTimeout(() => {
        document.title = previousTitle;
      }, 1000);
    };
    if (doc.readyState === 'complete') void go();
    else iframe.addEventListener('load', () => void go(), { once: true });
  });
}
