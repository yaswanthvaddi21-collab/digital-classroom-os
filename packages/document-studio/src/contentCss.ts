import { listStyleCss } from './extensions/listStyles'; // G-FORMAT
import { paragraphStyleCss } from './paragraphStyles'; // G-FORMAT
import { INSERT_CONTENT_CSS, INSERT_PRINT_CSS } from './extensions/insertCss'; // G-INSERT

/**
 * Styles for document content. The same string styles the editor page and the print/PDF output,
 * so what students see is what they get. Paper is always white, like Word and Pages, even in dark mode.
 */
export const documentContentCss = `
.dcos-doc {
  font-family: Carlito, Calibri, 'Inter Variable', 'Segoe UI', Arial, sans-serif;
  font-size: 12pt;
  line-height: 1.5;
  color: #1a1a1f;
  word-wrap: break-word;
  outline: none;
}
.dcos-doc > * + * { margin-top: 0.6em; }
.dcos-doc p { margin: 0 0 0.5em; }
.dcos-doc h1, .dcos-doc h2, .dcos-doc h3, .dcos-doc h4 { line-height: 1.25; font-weight: 700; color: #111114; margin: 1.1em 0 0.4em; }
.dcos-doc h1 { font-size: 20pt; }
.dcos-doc h2 { font-size: 15pt; }
.dcos-doc h3 { font-size: 13pt; }
.dcos-doc h4 { font-size: 12pt; }
.dcos-doc > :first-child { margin-top: 0; }
.dcos-doc ul, .dcos-doc ol { padding-left: 1.6em; margin: 0 0 0.6em; }
.dcos-doc ul { list-style: disc; }
.dcos-doc ul ul { list-style: circle; }
.dcos-doc ul ul ul { list-style: square; }
.dcos-doc ol { list-style: decimal; }
.dcos-doc ol ol { list-style: lower-alpha; }
.dcos-doc ol ol ol { list-style: lower-roman; }
.dcos-doc li > p { margin: 0.15em 0; }
.dcos-doc blockquote { border-left: 3px solid #c7c7d1; margin: 0.8em 0; padding: 0.1em 0 0.1em 1em; color: #555; }
.dcos-doc pre { background: #f4f4f6; border-radius: 6px; padding: 0.75em 1em; font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace; font-size: 10pt; white-space: pre-wrap; }
.dcos-doc code { background: #f1f1f4; border-radius: 4px; padding: 0.1em 0.3em; font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace; font-size: 0.9em; }
.dcos-doc pre code { background: none; padding: 0; }
.dcos-doc a { color: #3b49df; text-decoration: underline; }
.dcos-doc hr { border: none; border-top: 1px solid #cfcfd6; margin: 1.2em 0; }
.dcos-doc mark { border-radius: 2px; padding: 0 1px; }
.dcos-doc img { max-width: 100%; height: auto; display: block; margin: 0.6em auto; }
.dcos-doc [data-resize-container] { margin: 0.6em auto; }
.dcos-doc table { border-collapse: collapse; width: 100%; margin: 0.8em 0; table-layout: fixed; overflow: hidden; }
.dcos-doc th, .dcos-doc td { border: 1px solid #c9c9d2; padding: 0.35em 0.55em; vertical-align: top; position: relative; min-width: 2em; }
.dcos-doc th { background: #f1f1f4; font-weight: 600; text-align: left; }
.dcos-doc td > p, .dcos-doc th > p { margin: 0; }
.dcos-doc .tableWrapper { overflow-x: auto; }
.dcos-doc .dcos-page-break { break-after: page; page-break-after: always; height: 0; border-top: 1px dashed #b4b4c0; margin: 1.6em -0.5em; position: relative; }
.dcos-doc .dcos-page-break::after { content: 'Page break'; position: absolute; left: 50%; top: -0.75em; transform: translateX(-50%); background: #fff; color: #8a8a96; font-size: 8pt; letter-spacing: 0.05em; text-transform: uppercase; padding: 0 0.6em; }
.dcos-doc .dcos-toc { border: 1px solid #e1e1e7; border-radius: 8px; padding: 0.8em 1.1em; margin: 0.8em 0; }
.dcos-doc .dcos-toc-title { font-weight: 700; font-size: 13pt; margin-bottom: 0.4em; }
.dcos-doc .dcos-toc ol { list-style: none; padding: 0; margin: 0; }
.dcos-doc .dcos-toc li { margin: 0.15em 0; }
.dcos-doc .dcos-toc button { all: unset; cursor: pointer; }
.dcos-doc .dcos-toc button:hover { color: #3b49df; text-decoration: underline; }
.dcos-doc .dcos-toc-empty { color: #8a8a96; font-style: italic; }
.dcos-doc .dcos-toc.is-selected, .dcos-doc .ProseMirror-selectednode { outline: 2px solid #6366f1; outline-offset: 2px; border-radius: 4px; }
/* Phase 6 (NODE): a diagram is a figure sized by its width and the diagram's aspect ratio (no fixed height), so the
   picture keeps its proportions wherever the width is capped: narrow pages, columns, table cells, phones, print. */
.dcos-doc .dcos-diagram { margin: 0.8em 0; display: flex; flex-direction: column; align-items: center; }
.dcos-doc .dcos-diagram[data-align="left"] { align-items: flex-start; }
.dcos-doc .dcos-diagram[data-align="right"] { align-items: flex-end; }
.dcos-doc .dcos-diagram[data-align="left"] .dcos-figcaption { text-align: left; }
.dcos-doc .dcos-diagram[data-align="right"] .dcos-figcaption { text-align: right; }
.dcos-doc .dcos-diagram-box { position: relative; box-sizing: border-box; max-width: 100%; height: auto; }
.dcos-doc .dcos-diagram-box > img, .dcos-doc .dcos-diagram-box > svg { position: absolute; inset: 0; display: block; width: 100%; height: 100%; max-width: none; margin: 0; object-fit: contain; }
.dcos-doc .dcos-diagram.is-selected .dcos-diagram-box { outline: 2px solid #6366f1; outline-offset: 3px; border-radius: 2px; }
.dcos-doc .dcos-diagram-missing { position: absolute; inset: 0; box-sizing: border-box; overflow: hidden; display: flex; align-items: center; justify-content: center; padding: 0.5em 1em; text-align: center; color: #6b6b76; background: #f6f6f8; border: 1px dashed #c9c9d2; border-radius: 6px; font-size: 10pt; }
/* The resize handle: no browser panning while dragging it by touch, and a larger hit area than it looks (about 30px;
   44px on touch screens), reaching further over the diagram than outside it, where the page may clip it. */
.dcos-doc .dcos-diagram-handle { position: absolute; right: -6px; bottom: -6px; width: 12px; height: 12px; background: #fff; border: 2px solid #6366f1; border-radius: 3px; cursor: nwse-resize; touch-action: none; z-index: 2; }
.dcos-doc .dcos-diagram-handle::before { content: ''; position: absolute; inset: -10px -8px -8px -10px; }
@media (pointer: coarse) { .dcos-doc .dcos-diagram-handle::before { inset: -20px -12px -12px -20px; } }
.dcos-doc .dcos-diagram-busy { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; background: rgba(255,255,255,.7); font-size: 10pt; color: #4f46e5; }
/* Read by screen readers only (the "press Enter to edit" hint); never shown or printed. */
.dcos-doc .dcos-sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
.dcos-doc .dcos-diagram-alert { position: absolute; inset: 0 0 auto 0; min-height: 100%; box-sizing: border-box; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.6em; padding: 1em; text-align: center; background: rgba(255,255,255,.95); border: 1px solid #f0c36d; border-radius: 6px; color: #3b3b44; font-size: 10pt; z-index: 1; }
.dcos-doc .dcos-diagram-alert p { margin: 0; max-width: 28em; }
.dcos-doc .dcos-diagram-alert div { display: flex; gap: 0.5em; }
.dcos-doc .dcos-diagram-alert button { font: inherit; padding: 0.3em 0.9em; border-radius: 6px; border: 1px solid #c9c9d2; background: #fff; color: #1a1a1f; cursor: pointer; }
.dcos-doc .dcos-diagram-alert button.is-danger { border-color: #dc2626; color: #b91c1c; }
.dcos-doc .dcos-image-remote { flex-direction: column; align-items: center; }
.dcos-doc .dcos-image-remote::after { content: attr(data-offline-label); margin-top: 0.3em; padding: 0.1em 0.6em; border-radius: 999px; background: #fff7e6; border: 1px solid #f0c36d; color: #8a5a00; font-size: 8.5pt; }
.dcos-doc img.dcos-image-remote { outline: 2px dashed #f0c36d; outline-offset: 2px; }
.dcos-doc .dcos-search-match { background: #fde68a; border-radius: 2px; }
.dcos-doc .dcos-search-current { background: #f59e0b; color: #000; }
.dcos-doc p.is-editor-empty:first-child::before { content: attr(data-placeholder); color: #a0a0ab; float: left; height: 0; pointer-events: none; }
.dcos-doc .selectedCell::after { content: ''; position: absolute; inset: 0; background: rgba(99, 102, 241, 0.15); pointer-events: none; }
.dcos-doc .column-resize-handle { position: absolute; right: -2px; top: 0; bottom: 0; width: 4px; background: #6366f1; pointer-events: none; }
.dcos-doc.resize-cursor { cursor: col-resize; }
/* G-FORMAT: named paragraph styles (Title, Subtitle, Caption) and list styles. Spacing and indents are inline styles. */
${paragraphStyleCss}
${listStyleCss}
/* G-REVIEW: text selected for a comment being written. Open threads' highlights are added by the editor only
   (review/commentMark.ts commentHighlightCss), so they never reach print. */
.dcos-doc .dcos-comment-pending { background: rgba(99, 102, 241, 0.22); }
/* G-INSERT: equations (KaTeX), shapes, text boxes, picture alignment and captions. */
${INSERT_CONTENT_CSS}
/* @phase4:content-css — add styles for new content here (they apply to the editor and to print). */
/* G-LAYOUT: section breaks — a labelled double rule; the label (a decoration) names the section and its settings. */
.dcos-doc .dcos-section-break { position: relative; height: 0; border-top: 3px double #8b93e6; margin: 2em -0.5em 1.6em; cursor: pointer; }
.dcos-doc .dcos-section-break::after { content: attr(data-label); position: absolute; left: 50%; top: -0.9em; transform: translateX(-50%); max-width: calc(100% - 1em); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; background: #fff; color: #4f46e5; font: 600 8pt Carlito, Calibri, Arial, sans-serif; letter-spacing: 0.02em; padding: 0.1em 0.7em; border: 1px solid #c7cbf3; border-radius: 999px; }
.dcos-doc .dcos-section-break.is-nested { border-top-color: #e0b44c; }
.dcos-doc .dcos-section-break.is-nested::after { color: #8a5a00; border-color: #f0c36d; background: #fff7e6; }

@media print {
  .dcos-doc .dcos-page-break { border: none; margin: 0; }
  .dcos-doc .dcos-page-break::after { display: none; }
  .dcos-doc .dcos-toc { border: none; padding: 0; }
  .dcos-doc .dcos-image-remote::after, .dcos-doc .dcos-diagram-alert { display: none; }
  .dcos-doc table, .dcos-doc img, .dcos-doc pre, .dcos-doc .dcos-diagram { break-inside: avoid; }
  .dcos-doc h1, .dcos-doc h2, .dcos-doc h3, .dcos-doc h4 { break-after: avoid; }
  .dcos-doc .dcos-comment, .dcos-doc .dcos-comment-pending { background: none !important; border: none !important; }
  ${INSERT_PRINT_CSS}
  /* @phase4:content-css-print — print-only rules for new content. */
  .dcos-doc .dcos-section-break { display: none; }
}
`;
