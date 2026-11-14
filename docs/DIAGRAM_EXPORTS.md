# Diagram image exports (PNG, SVG, PDF)

Phase 5, group G-EXPORT. Audit items DS-R3 and TD-22 (the SVG export embedded HTML in `<foreignObject>`) and DS-R4
(the canvas size limit) are covered here.

## How it works

Every image export is drawn from the diagram's **content** (what is saved), not captured from the canvas.

- `packages/diagram-studio/src/vector/renderSvg.tsx` turns content into a standalone SVG. Shapes are drawn by the same
  `SHAPE_RENDERERS` the canvas uses, and labels are `<text>` elements with line breaking. Connectors use the canvas's own
  geometry: `connectorGeometry` (connect/geometry.ts) and `EDGE_PATHS` handle ends, ports, bend points and label
  positions. Connector ends are the shared `<marker>` definitions from `MarkerDefs`. Shapes inside groups are drawn at
  their canvas position. Rotation, opacity, text alignment and font families (in the SVG; see Known approximations)
  are applied, and so are links (`<a>`) and tooltips (`<title>`). The file contains no `<foreignObject>`, HTML or CSS
  classes.
- PNG (`vector/raster.ts`): the SVG is loaded as an image from a Blob URL and drawn on a canvas at 1×, 2× or 3×. The
  background is white or transparent. The R1 pixel cap still applies: at most 16,777,216 pixels and 16,384 px per side.
  When the cap applies, the toast states the ratio that was actually used.
- PDF (`vector/pdf.ts`): svg2pdf.js (MIT) converts the SVG into PDF paths and real text in the built-in Helvetica and
  Courier fonts. The text can be selected and searched, and the PDF contains no picture of the diagram. Page size
  options:
  - **Diagram size** (the default): one page the size of the diagram, at 0.75 pt per pixel.
  - **A4 or Letter**, portrait, landscape or automatic, with a 10 mm margin. Two ways to fit the diagram:
    - **Fit to one page**: the diagram is shrunk if needed and never enlarged.
    - **Actual size**: the diagram is split across pages. Each page draws only what reaches it. The limit is 100 pages;
      above that the export refuses and says to choose another setting.
- Export menu: the one-click **PNG**, **SVG** and **PDF** entries use the default settings. **Export options…** opens a
  dialog with these settings:
  - format;
  - whole diagram or selection only;
  - PNG scale; PNG and SVG background (white or transparent);
  - PDF page size, orientation and fit.

  The dialog shows the resulting pixel size or page count before you export.
- The document embed (`DiagramEditorApi.renderPng/renderSvg/renderPdf`) uses the same renderer.

## Left out, and said so in the toast

- Hidden shapes, shapes on hidden layers, and connectors attached to either of them: "1 hidden shape was left out."
- A shape kind from a newer version is drawn as a placeholder. A line type from a newer version is drawn curved.
- A connector naming a connection handle that this version does not have is left out, as on the canvas.
- PNG: links and tooltips cannot be kept in an image.
- PDF:
  - tooltips are not kept (links are);
  - labels with characters outside the built-in fonts' WinAnsi set (for example Greek, CJK or emoji) may not appear
    correctly.
- PDF page notes:
  - the scale used when the diagram is shrunk to fit one page;
  - the page count and layout when the diagram is split across pages;
  - the scale used when the diagram is larger than the 200-inch PDF page limit.

## Known approximations (not in the toast)

- **Fonts.** The canvas draws labels in Inter. The exports name Helvetica/Arial, and break lines using Helvetica's
  widths, so the PDF's built-in fonts fit exactly. Inter is slightly wider, so a label that wraps onto two lines on the
  canvas can fit on one line in an export (worked out from the font widths, not tested). Monospace rows (UML/ER) are
  measured at 0.6 em per character. A shape's own font (read from a diagrams.net or native file) is named first in the
  SVG, but its lines are still broken using Helvetica's widths, so in a wider font a line can run past the text area.
  The PDF has only its built-in fonts: such a label is drawn in Helvetica, or in Times or Courier when the shape's font
  list names serif or monospace.
- **Edge labels.** Line breaks in a connector label are drawn as spaces, as on the canvas.
- **Text clipping.** Text that overflows a shape's text area is clipped on the canvas. An export leaves out whole lines
  whose middle falls outside the area, so the clipping is by line rather than by pixel.
- **Large diagrams in Safari.** The PNG of a 500-shape diagram now exports in WebKit. The earlier html-to-image path
  failed there.

- **Visibility and stacking (Round 3).** The renderer takes them from the canvas's own rules (`renderNodes`): shapes on
  a higher layer are painted over lower ones whatever their stored order, a shape in a group on a hidden layer is
  hidden with it, and a layer id the diagram does not have counts as the bottom layer.
- **Characters XML does not allow** (control characters pasted with a label, such as PowerPoint's vertical-tab line
  break) are removed from the SVG; a vertical tab or form feed becomes a space. Without this the file could not be
  opened at all.
- **Rotated shapes.** Connector ends meet the unrotated outline of a rotated shape, on the canvas and in every export.
- **Selection only.** Connectors are decided by their ends, not by whether they are selected: a connector is included
  only when both of its ends are included. A connector to a shape outside the selection is not drawn, and the toast
  does not say so.
- **diagrams.net BPMN shapes.** Events and gateways are written as diagrams.net's `mxgraph.bpmn.event` (with
  `outline`) and `mxgraph.bpmn.gateway2` (with `gwType`) so their meaning survives there; this was not checked in
  diagrams.net itself. Network icons use `mxgraph.networks.*` names, also unchecked.
- **Other viewers.** The SVG and PDF are checked only by our tests in Chromium and WebKit: the SVG is parsed and decoded
  as an image, and the PDF's streams are searched for `Tj` text operators and the Helvetica font. No PDF reader, vector
  editor or office tool has opened them, so "the text can be selected and searched" is not yet confirmed in a reader
  (RELEASE_GAPS RR-9; docs/TESTING.md, manual step 5).

## Extension points

- `SVG_LABEL_RENDERERS` (renderSvg.tsx): a shape kind whose text is not a plain label can draw its own.
- Label placement follows the shape definition's CSS `labelInset`: inset, width, height, padding, alignment, and
  `writingMode` vertical with `rotate(180deg)`, as used by pool and lane bands.

## Tests

- `vector/layout.test.ts`: text widths and line breaking, label boxes, path geometry, PDF page planning.
- `vector/renderSvg.test.tsx`:
  - every template renders as plain SVG;
  - groups, rotation, hidden shapes and layers, links, selection, markers (shared, and drawn in place for the PDF),
    ports and bend points, PDF tiles;
  - a 2000-shape diagram.
- `editor/ExportDialog.test.tsx`: the dialog's choices and summaries, and SVG export from the menu and from the host API.
- `e2e/diagram-export.spec.ts` (Chromium, WebKit):
  - SVG connector paths and shape positions equal the canvas's, and the file opens as an image;
  - the PDF has text operators and no images;
  - A4 tiling, a transparent 1× PNG, selection only, and a grouped, hidden and linked shape with its notes;
- `e2e/diagram-large.spec.ts`: the 500-shape PNG now succeeds in WebKit as well.
- `tests/integration/diagram-kitchen-sink-v3-golden.test.ts`: the schema-3 kitchen sink against the golden SVG and
  `.drawio` (`tests/golden/diagram-v3/`), with feature-by-feature assertions.
- `e2e/diagram-integration.spec.ts`: SVG and PDF of the Round 3 cross-feature cases; `e2e/diagram-export-touch.spec.ts`:
  the Export options dialog by touch at phone width.
