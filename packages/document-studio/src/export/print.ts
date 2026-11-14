import { documentContentCss } from '../contentCss';
import { paperSize, type PageSettings } from '../types';
import { layoutPrintCss, printSections } from './printLayout'; // G-LAYOUT
import { diagramKey, hasSource, isNewerDiagram, type RenderPreview } from './diagramAssets';

/**
 * A CSS string literal that is safe inside a <style> element: quotes and backslashes are escaped, and so are
 * < and > (as CSS hex escapes), so text such as "</style><script>" can never end the style element (audit DS-1).
 */
export const cssString = (value: unknown) =>
  `"${String(value ?? '').replace(/[\\"<>\r\n\f]/g, (c) => (c === '\n' || c === '\r' || c === '\f' ? ' ' : `\\${c.charCodeAt(0).toString(16).toUpperCase()} `))}"`;
const escapeHtml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/**
 * A diagram as printed (Phase 6, ADR 0013): its node view in the editor (`dom`, from view.nodeDOM), its title, and the
 * picture to print instead of the on-screen PNG, as an image URL (an SVG drawing, see collectPrintDiagrams), or null
 * to keep what is on screen.
 */
export interface PrintDiagramImage {
  dom: Element;
  title: string;
  src?: string | null;
}

/** Told after printing when diagrams had no picture to print (Phase 6). */
export const PRINT_ONE_PLACEHOLDER = '1 diagram has no preview and was printed as a placeholder.';
export const PRINT_PLACEHOLDERS = '{n} diagrams have no preview and were printed as placeholders.';

/** The neutral text printed for a diagram without a picture (the same words as the DOCX and ODT placeholders). */
export const printPlaceholderText = (title: string) => `[Diagram: ${title || 'Diagram'} — preview not available]`;

/**
 * Copies the rendered editor DOM, minus editing-only artefacts (search highlights, resize handles), and counts the
 * diagrams printed as placeholders. Diagrams print their SVG drawing when `diagrams` gives one; one without any
 * picture prints a neutral "[Diagram: title — preview not available]", never the editor's hints ("Loading diagram…",
 * "Double-click to …").
 */
export function printClone(editorDom: HTMLElement, page?: PageSettings, diagrams: readonly PrintDiagramImage[] = []): { html: string; placeholders: number } {
  // The clone has the editor's structure, so an element's position among all elements finds its copy.
  const order = diagrams.length ? new Map(Array.from(editorDom.querySelectorAll('*')).map((e, i) => [e, i])) : null;
  const clone = editorDom.cloneNode(true) as HTMLElement;
  const copies = order ? Array.from(clone.querySelectorAll('*')) : [];
  const given = new Map<Element, PrintDiagramImage>();
  for (const d of diagrams) {
    // view.nodeDOM gives the node view's outer element; the diagram's own element may be inside it.
    const own = d.dom.matches('[data-type="diagram"]') ? d.dom : d.dom.querySelector('[data-type="diagram"]') ?? d.dom;
    const i = order?.get(own);
    if (i !== undefined && copies[i]) given.set(copies[i], d);
  }
  let placeholders = 0;
  for (const el of Array.from(clone.querySelectorAll('[data-type="diagram"]'))) {
    // Tooltips such as "Double-click to edit this diagram" are editing hints, and so is the screen-reader hint
    // ("Press Enter or double-click …") the picture points to.
    for (const t of [el, ...Array.from(el.querySelectorAll('[title]'))]) t.removeAttribute('title');
    el.querySelectorAll('.dcos-diagram-hint').forEach((h) => h.remove());
    el.querySelectorAll('[aria-describedby]').forEach((d) => d.removeAttribute('aria-describedby'));
    const info = given.get(el);
    const missing = el.querySelector('.dcos-diagram-missing');
    // The plain name (data-title), not the accessible label, which also says "loading" or "preview unavailable".
    const title = info?.title || missing?.getAttribute('data-title') || missing?.getAttribute('aria-label') || 'Diagram';
    const img = el.querySelector('img');
    if (info?.src) {
      if (img) {
        img.setAttribute('src', info.src);
        img.removeAttribute('srcset');
      } else if (missing) {
        const drawn = el.ownerDocument.createElement('img');
        drawn.setAttribute('src', info.src);
        drawn.setAttribute('alt', title);
        missing.replaceWith(drawn);
      }
      continue;
    }
    if (!img && missing) {
      missing.textContent = printPlaceholderText(title);
      placeholders++;
    }
  }
  clone.removeAttribute('contenteditable');
  clone.querySelectorAll('[contenteditable]').forEach((el) => el.removeAttribute('contenteditable'));
  clone.querySelectorAll('.dcos-search-match').forEach((el) => el.replaceWith(...Array.from(el.childNodes)));
  clone.querySelectorAll('[data-resize-handle], .column-resize-handle, .ProseMirror-gapcursor, .ProseMirror-separator, .ProseMirror-trailingBreak, .dcos-diagram-handle, .dcos-diagram-busy, .dcos-diagram-alert, .dcos-diagram-hint').forEach((el) => el.remove());
  clone.querySelectorAll('.dcos-image-remote').forEach((el) => el.classList.remove('dcos-image-remote'));
  clone.querySelectorAll('.ProseMirror-selectednode, .selectedCell, .is-selected').forEach((el) => el.classList.remove('ProseMirror-selectednode', 'selectedCell', 'is-selected'));
  clone.querySelectorAll('.is-editor-empty').forEach((el) => el.removeAttribute('data-placeholder'));
  if (page) for (const change of PRINT_DOM) change(clone, page);
  return { html: clone.innerHTML, placeholders };
}

/** Copies the rendered editor DOM, minus editing-only artefacts (see printClone). */
export function cleanClone(editorDom: HTMLElement, page?: PageSettings, diagrams: readonly PrintDiagramImage[] = []) {
  return printClone(editorDom, page, diagrams).html;
}

/** A diagram to print, with the SVG drawing to print for it (null: print what is on screen). */
export interface PrintDiagram {
  dom: Element;
  title: string;
  svg: string | null;
}

/** What collectPrintDiagrams needs from the app: DiagramHost's preview loading and off-screen drawing. */
export interface PrintDiagramHost {
  loadPreview(previewId: string): Promise<Blob | undefined>;
  renderPreview?: RenderPreview;
}

/**
 * The SVG drawing of every diagram in the editor, for printing: the stored SVG preview, else one drawn from the
 * diagram's data. A diagram from a newer version keeps its on-screen PNG unless it has none. Never rejects; anything
 * that fails or takes longer than `timeoutMs` in all keeps what is on screen.
 */
export async function collectPrintDiagrams(
  view: { state: { doc: { descendants(f: (node: { type: { name: string }; attrs: Record<string, unknown> }, pos: number) => boolean | void): void } }; nodeDOM(pos: number): Node | null },
  host: PrintDiagramHost | null | undefined,
  timeoutMs = 5000,
): Promise<PrintDiagram[]> {
  const found: Array<{ dom: Element; attrs: Record<string, unknown> }> = [];
  view.state.doc.descendants((node, pos) => {
    if (node.type.name !== 'diagram') return;
    const dom = view.nodeDOM(pos);
    if (dom && dom.nodeType === 1) found.push({ dom: dom as Element, attrs: node.attrs });
    return false;
  });
  const deadline = Date.now() + timeoutMs;
  const withinTime = <T,>(p: Promise<T>): Promise<T | null> =>
    Promise.race([p.catch(() => null), new Promise<null>((resolve) => setTimeout(() => resolve(null), Math.max(0, deadline - Date.now())))]);
  const drawn = new Map<string, string | null>();
  const out: PrintDiagram[] = [];
  for (const { dom, attrs } of found) {
    const title = typeof attrs.title === 'string' && attrs.title ? attrs.title : 'Diagram';
    const key = diagramKey(attrs);
    if (!drawn.has(key)) {
      let svg: string | null = null;
      if (host && Date.now() < deadline) {
        if (typeof attrs.svgPreviewId === 'string' && attrs.svgPreviewId) {
          const blob = await withinTime(host.loadPreview(attrs.svgPreviewId));
          const text = blob ? await withinTime(blob.text()) : null;
          if (text && /<svg[\s>]/i.test(text)) svg = text;
        }
        const onScreen = !!dom.querySelector('img');
        if (!svg && host.renderPreview && hasSource(attrs) && (!onScreen || !isNewerDiagram(attrs.source))) {
          const r = await withinTime(host.renderPreview(attrs.source, title));
          if (r?.svg && /<svg[\s>]/i.test(r.svg)) svg = r.svg;
        }
      }
      drawn.set(key, svg);
    }
    out.push({ dom, title, svg: drawn.get(key) ?? null });
  }
  return out;
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
export function printDocument(editorDom: HTMLElement, page: PageSettings, title: string, diagrams: readonly PrintDiagram[] = []): Promise<{ placeholders: number }> {
  return new Promise((resolve) => {
    // Phase 6: each diagram's SVG drawing, as an object URL the print frame (same origin) can show; revoked afterwards.
    const urls: string[] = [];
    const images: PrintDiagramImage[] = diagrams.map((d) => {
      if (!d.svg) return { dom: d.dom, title: d.title, src: null };
      const url = URL.createObjectURL(new Blob([d.svg], { type: 'image/svg+xml' }));
      urls.push(url);
      return { dom: d.dom, title: d.title, src: url };
    });
    const { html, placeholders } = printClone(editorDom, page, images);
    const iframe = document.createElement('iframe');
    iframe.setAttribute('aria-hidden', 'true');
    iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
    document.body.appendChild(iframe);
    const win = iframe.contentWindow!;
    const doc = win.document;
    doc.open();
    doc.write(buildPrintHtml(html, page, title));
    doc.close();

    let done = false;
    const cleanup = () => {
      if (done) return;
      done = true;
      setTimeout(() => {
        iframe.remove();
        for (const url of urls) URL.revokeObjectURL(url);
      }, 500);
      resolve({ placeholders });
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
