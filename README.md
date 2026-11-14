# Digital Classroom OS

Offline-first academic workspace: documents and diagrams today, with notebooks, assignments and classroom sharing to follow. Everything is saved on the device and works without internet.

**Status:** Phase 0 (foundation) and the Phase 1 Document Studio and Diagram Studio foundations are built. Release 0.2 added data-safety fixes, automated browser tests, editable diagrams inside documents, diagrams.net import/export and draw.io-style quick connect. Phases 2–4 of v0.2.0 added Git and backup safety, storage hardening, and the Document Studio features below; Phase 5 (in progress, not yet committed) adds the Diagram Studio features below. See [tests/acceptance/CHECKLIST.md](tests/acceptance/CHECKLIST.md).

## Run it

Requires Node 20+.

```bash
npm install
npm run dev          # http://localhost:5173
```

Other commands: `npm test`, `npm run test:e2e` (Playwright), `npm run typecheck`, `npm run build`, `npm run preview`, `npm run licenses`. Backend: see [backend/README.md](backend/README.md).

## What works

**Document Studio**: a word processor with a Word-style ribbon (Home, Insert, Layout, Review, Diagram) on a page-sized sheet.
- *Simple mode:* named styles (Title, Subtitle, Heading 1–4, Quote, Caption, Code), bold/italic/underline/strike, text and highlight colours (custom colours too), lists, quotes, alignment, line spacing, links, pictures (paste, drop or upload, with alignment and captions), tables, embedded diagrams, and templates (Assignment, Lab report, Essay, Project report, Research paper in APA style, MLA essay, Cover page, Formal letter).
- *Advanced mode adds:* fonts and custom font sizes, sub/superscript, paragraph spacing and indents with a Paragraph dialog and a ruler, bullet glyphs and number formats, equations (LaTeX with a live preview), shapes, text boxes, page breaks, a live table of contents; the Layout tab (A3, A4, A5, Letter, Legal; orientation; margins; section breaks with their own orientation, columns and page numbering; header and footer in left/centre/right parts with a different first page; page number format, start and position); and the Review tab (comments with replies and resolve, under the name set in Settings; find & replace with match case and whole words; word count; spell check that is remembered; document language).
- *Diagram tab:* insert an editable diagram (from a template, from My Diagrams or from a diagrams.net file). Double-click to edit it, resize with the aspect ratio kept, download it as PNG or .drawio.
- Export to **DOCX**, **ODT**, **PDF** (print → Save as PDF, real text) and **TXT**; import **DOCX** and **ODT** files as new documents. Anything an export writes approximately (for example shapes as pictures in DOCX) or an import leaves out is reported. Exported DOCX files were opened in Apple Pages (16 samples) and Word for Mac (2 of 16); LibreOffice is untested. Results and known differences: [docs/DOCUMENT_COMPATIBILITY.md](docs/DOCUMENT_COMPATIBILITY.md) §8.
- Open documents and diagrams appear as tabs above the editor.

**Diagram Studio**: flowcharts, trees, mind maps (tree or radial; Arrange also lays a mind map out radially or on two sides), org charts, hierarchy, process, timeline, Venn, network, BPMN, UML class, sequence, activity, state and use case, and ER templates.
- Shape library with categories and search: basic, UML, ER, BPMN (pools and lanes that hold their shapes, events, tasks, gateways, data) and original network icons; connector notations for BPMN and UML.
- Drag-and-drop, editable text, colours, borders, grid and snap, minimap; groups, locks, layers (show/hide, lock), bring to front/send to back, align and distribute, zoom shortcuts, full screen, links, tooltips and custom properties, cut/copy/paste between diagrams and tabs.
- Connectors with eight connection points or floating ends, bend points, labels you can drag along the line, UML and crow's-foot ends.
- Quick connect like diagrams.net: blue arrows around the selected shape add a connected shape (click), connect to another shape (drag) or pick a shape from a palette (hover, long press, or arrow keys); Alt+Shift+Arrow from the keyboard. Touch is tested in mobile Chromium only.
- Undo/redo, duplicate, Tab/Enter to grow trees with auto-arrange, timeline "Add event".
- Export to **PNG** (1×–3×, transparent or white), vector **SVG**, vector **PDF** with real text (page size, fit or tile), **diagrams.net (.drawio)** and the app's own **.dcosdiagram** file; import .drawio and .dcosdiagram files as new diagrams. What an export or import leaves out or changes is named in a message; known approximations (for example label fonts in SVG and PDF) are listed in [docs/DIAGRAM_EXPORTS.md](docs/DIAGRAM_EXPORTS.md). Rotation, opacity, fonts, alignment and pictures are kept from imported files but cannot be set in the editor. Exported .drawio files have not yet been opened in diagrams.net itself, and import was tested only with hand-written sample files, not files saved by diagrams.net.

**Workspace**: dashboard, file lists with search and sort, favourites, trash with restore, version history (Ctrl/⌘+S saves a version), conflict-safe autosave with retries and recovered drafts, safety copies before database upgrades, backup export/restore (idempotent, never overwrites newer work), light/dark/system theme, phone layout, and an installable PWA that works offline.

## Layout

```
apps/web            React app (also the UI for desktop and Android)
apps/desktop        Tauri 2 shell (Phase 5)
apps/android        Capacitor shell (Phase 5)
packages/ui                 design system
packages/local-storage      StorageAdapter + IndexedDB
packages/document-studio    Tiptap editor + exporters
packages/diagram-studio     React Flow editor, shape library, vector exporters, .drawio/.dcosdiagram
packages/<others>           later-phase modules (placeholders)
backend/            FastAPI classroom host (Phase 3)
docs/               PRD, architecture, database, API, security, testing, deployment, dependencies
```

## Docs

[PRD](docs/PRD.md) · [Architecture](docs/ARCHITECTURE.md) · [Document compatibility](docs/DOCUMENT_COMPATIBILITY.md) · [Diagram exports](docs/DIAGRAM_EXPORTS.md) · [Database](docs/DATABASE.md) · [API](docs/API.md) · [Security](docs/SECURITY.md) · [Testing](docs/TESTING.md) · [Deployment](docs/DEPLOYMENT.md) · [Dependencies](docs/DEPENDENCIES.md)
