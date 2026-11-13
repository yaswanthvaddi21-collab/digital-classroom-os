# Digital Classroom OS

Offline-first academic workspace: documents and diagrams today, with notebooks, assignments and classroom sharing to follow. Everything is saved on the device and works without internet.

**Status:** Phase 0 (foundation) and the Phase 1 Document Studio and Diagram Studio foundations are built. Release 0.2 added data-safety fixes, automated browser tests, editable diagrams inside documents, diagrams.net import/export and draw.io-style quick connect. See [tests/acceptance/CHECKLIST.md](tests/acceptance/CHECKLIST.md).

## Run it

Requires Node 20+.

```bash
npm install
npm run dev          # http://localhost:5173
```

Other commands: `npm test`, `npm run test:e2e` (Playwright), `npm run typecheck`, `npm run build`, `npm run preview`, `npm run licenses`. Backend: see [backend/README.md](backend/README.md).

## What works

**Document Studio**: Word/Pages-style editor on a real page.
- *Simple mode:* headings, bold/italic/underline/strike, colour, highlight, lists, quotes, alignment, links, images (paste, drop or upload), tables, page numbers, and academic templates (Assignment, Lab report, Essay, Project report).
- *Advanced mode:* fonts and sizes, sub/superscript, page breaks, live table of contents, find & replace, spell-check toggle, page setup (A4/Letter, orientation, margins, header, footer), and table merge/split.
- *Diagram tab:* insert an editable diagram (from a template, from My Diagrams or from a diagrams.net file). Double-click to edit it, resize with the aspect ratio kept, download it as PNG or .drawio.
- Export to **DOCX**, **PDF** (print → Save as PDF, real text) and **TXT**. Diagrams are included as images.

**Diagram Studio**: flowcharts, trees, mind maps, org charts, hierarchy, process, timeline, Venn, network, UML class and ER templates.
- Basic, UML (class, actor, package) and ER (entity) shapes, start/end markers including UML and crow's-foot, drag-and-drop, connectors that stay attached, editable text, colours, borders, grid and snap, alignment, zoom and pan, minimap.
- Quick connect like diagrams.net: blue arrows around the selected shape add a connected shape (click), connect to another shape (drag) or pick a shape from a palette (hover); Alt+Shift+Arrow from the keyboard; works with touch.
- Undo/redo, duplicate, copy/paste, Tab/Enter to grow trees with auto-arrange.
- Export to **PNG** (2×), **SVG**, **PDF** and **diagrams.net (.drawio)**; import .drawio files.

**Workspace**: dashboard, file lists with search and sort, favourites, trash with restore, version history (Ctrl/⌘+S saves a version), conflict-safe autosave with retries and recovered drafts, safety copies before database upgrades, backup export/restore (idempotent, never overwrites newer work), light/dark/system theme, phone layout, and an installable PWA that works offline.

## Layout

```
apps/web            React app (also the UI for desktop and Android)
apps/desktop        Tauri 2 shell (Phase 5)
apps/android        Capacitor shell (Phase 5)
packages/ui                 design system
packages/local-storage      StorageAdapter + IndexedDB
packages/document-studio    Tiptap editor + exporters
packages/diagram-studio     React Flow editor + exporters
packages/<others>           later-phase modules (placeholders)
backend/            FastAPI classroom host (Phase 3)
docs/               PRD, architecture, database, API, security, testing, deployment, dependencies
```

## Docs

[PRD](docs/PRD.md) · [Architecture](docs/ARCHITECTURE.md) · [Database](docs/DATABASE.md) · [API](docs/API.md) · [Security](docs/SECURITY.md) · [Testing](docs/TESTING.md) · [Deployment](docs/DEPLOYMENT.md) · [Dependencies](docs/DEPENDENCIES.md)
