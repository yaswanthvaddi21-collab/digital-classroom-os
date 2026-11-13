// KaTeX's stylesheet as text, bundled with its fonts (Vite emits them as local assets: offline, no CDN). It goes into
// the document content CSS, so the editor and the print page both draw equations the same way.
import katexCss from 'katex/dist/katex.min.css?inline';

/** Styles for equations, shapes, text boxes and picture captions (editor and print). */
export const INSERT_CONTENT_CSS = `
${katexCss}
.dcos-doc .katex { font-size: 1.1em; }
.dcos-doc .tiptap-mathematics-render[data-type="inline-math"] { padding: 0 1px; border-radius: 3px; }
.dcos-doc .tiptap-mathematics-render--editable { cursor: pointer; }
.dcos-doc .tiptap-mathematics-render--editable:hover { background: rgba(99, 102, 241, 0.08); }
.dcos-doc div.tiptap-mathematics-render[data-type="block-math"] { display: block; margin: 0.8em 0; text-align: center; overflow-x: auto; overflow-y: hidden; }
.dcos-doc .inline-math-error, .dcos-doc .block-math-error { color: #b91c1c; font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace; font-size: 0.9em; background: #fef2f2; border-radius: 3px; padding: 0 2px; }
.dcos-doc .dcos-shape { display: flex; margin: 0.8em 0; justify-content: center; }
.dcos-doc .dcos-shape[data-align="left"] { justify-content: flex-start; }
.dcos-doc .dcos-shape[data-align="right"] { justify-content: flex-end; }
.dcos-doc .dcos-shape-box { position: relative; max-width: 100%; flex: none; }
.dcos-doc .dcos-shape-svg, .dcos-doc .dcos-shape-svg svg { display: block; width: 100%; height: 100%; }
.dcos-doc .node-shape.ProseMirror-selectednode { outline: none; }
.dcos-doc .dcos-shape.is-selected .dcos-shape-box { outline: 2px solid #6366f1; outline-offset: 3px; border-radius: 2px; }
.dcos-doc .dcos-shape-handle { position: absolute; right: -6px; bottom: -6px; width: 12px; height: 12px; background: #fff; border: 2px solid #6366f1; border-radius: 3px; cursor: nwse-resize; touch-action: none; }
.dcos-doc .dcos-textbox { box-sizing: border-box; padding: 0.5em 0.75em; border-radius: 2px; }
.dcos-doc .dcos-textbox > :first-child { margin-top: 0; }
.dcos-doc .dcos-textbox > :last-child { margin-bottom: 0; }
.dcos-doc .dcos-textbox-inline { margin: 0.8em 0; }
.dcos-doc .dcos-textbox-left { float: left; margin: 0.2em 1em 0.6em 0; }
.dcos-doc .dcos-textbox-right { float: right; margin: 0.2em 0 0.6em 1em; }
.dcos-doc.ProseMirror .dcos-textbox[data-border-color="none"], .dcos-doc.ProseMirror .dcos-textbox[data-border-width="0"] { outline: 1px dashed #c7c7d1; }
.dcos-doc .dcos-figure { display: flex; flex-direction: column; align-items: center; margin: 0.6em 0; }
.dcos-doc .dcos-figure[data-align="left"] { align-items: flex-start; }
.dcos-doc .dcos-figure[data-align="right"] { align-items: flex-end; }
.dcos-doc .dcos-figure > [data-resize-container] { margin: 0; max-width: 100%; }
.dcos-doc .dcos-figure img { margin: 0; }
.dcos-doc .dcos-figure.ProseMirror-selectednode { outline: none; }
.dcos-doc .dcos-figure.ProseMirror-selectednode img { outline: 2px solid #6366f1; outline-offset: 2px; }
.dcos-doc .dcos-figcaption { align-self: stretch; margin-top: 0.35em; font-size: 10pt; font-style: italic; color: #4b4b55; text-align: center; }
.dcos-doc .dcos-figure[data-align="left"] .dcos-figcaption { text-align: left; }
.dcos-doc .dcos-figure[data-align="right"] .dcos-figcaption { text-align: right; }
`;

/** Print-only rules: keep figures, shapes and text boxes in one piece, drop editing outlines. */
export const INSERT_PRINT_CSS = `
  .dcos-doc .dcos-figure, .dcos-doc .dcos-shape, .dcos-doc .dcos-textbox, .dcos-doc div.tiptap-mathematics-render[data-type="block-math"] { break-inside: avoid; }
  .dcos-doc .dcos-textbox { outline: none !important; }
  .dcos-doc .tiptap-mathematics-render--editable:hover { background: none; }
`;
