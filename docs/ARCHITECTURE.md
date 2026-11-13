# Architecture

Companion to [PRD.md](PRD.md). Describes what exists today (Phase 0 + Phase 1 foundations) and where later phases plug in.

## Shape of the system

```
apps/web  ─────────────┐   React + Vite + Tailwind, PWA (offline shell via Workbox)
apps/desktop (Tauri) ──┼─► loads apps/web/dist in a native webview      (Phase 5)
apps/android (Capacitor)┘                                                (Phase 5)
        │
        ├── @dcos/ui               design tokens, components, theme, toasts
        ├── @dcos/document-studio  Tiptap editor, templates, DOCX / PDF / TXT export
        ├── @dcos/diagram-studio   React Flow editor, shapes, layout, PNG / SVG / PDF export
        └── @dcos/local-storage    StorageAdapter interface + IndexedDB implementation

backend/ (FastAPI)  classroom host for LAN sharing — Phase 3. Never needed for editing.
```

Packages are consumed as TypeScript source through npm workspaces (no per-package build step). Vite bundles them; Tailwind scans them via `@source`.

## Principles in code

| PRD rule | How it is enforced |
|---|---|
| Create and save locally, offline | All editing goes through `StorageAdapter` → IndexedDB. No editor code path makes network requests. Fonts are bundled (`@fontsource`), not loaded from Google. |
| Preserve versions | Every save increments `version`. Snapshots go to `*_versions` on create, on Ctrl/⌘+S, and at most every 10 minutes of editing; 50 kept per item. Restoring a version first snapshots the current state. |
| Never silently overwrite | `save(kind, id, patch, expectedVersion)` reads, checks and writes in one IndexedDB transaction. A stale `expectedVersion` throws `ConflictError`; the editor stops autosaving and asks the user to keep their edits as a copy or load the latest. Backup import adds divergent items as copies. |
| Interrupted saves don't corrupt | IndexedDB transactions are atomic; the record and its version snapshot are written together or not at all (tested). Autosave flushes on `visibilitychange`/`pagehide`. |
| Platform independence | `StorageAdapter` is the only persistence API the app uses. Tauri/Capacitor will provide SQLite adapters (Phase 5); see [DATABASE.md](DATABASE.md). Routing uses hash URLs so `file://`, `tauri://` and `capacitor://` all work. Vite `base: './'`. |

## Document Studio

- **Engine:** Tiptap 3 (ProseMirror). Schema lives in `documentExtensions()`. Extensions may be added but never removed, or saved documents stop loading.
- **Stored form:** `{ schemaVersion, doc: ProseMirror JSON, page: PageSettings, mode }`. `normalizeDocument()` fills defaults for older content.
- **Modes:** Simple shows core formatting. Advanced adds fonts and sizes, sub/superscript, page breaks, live table of contents, find & replace, a spell-check toggle, page setup (size, orientation, margins, header, footer, page numbers) and table merge/split. Both modes edit the same document; switching never drops formatting.
- **Custom extensions:** `PageBreak`, `TableOfContents` (React node view, live from headings), `SearchReplace` (ProseMirror plugin with decorations; finds matches across mark boundaries).
- **Export:**
  - DOCX: `buildDocx()` maps ProseMirror JSON → `docx` objects. Covers headings, alignment, marks, colours, sizes, fonts, links, lists (restart per list), tables (header shading, spans), images (scaled to text width), page breaks, a static TOC, header/footer and page numbers, page size/orientation/margins.
  - PDF: the rendered editor DOM is cloned into a print iframe with `@page` size, margins and margin boxes (header, "Page X of Y"). Saving as PDF from the print dialog keeps real, selectable text. Margin boxes need Chromium 131+; other engines print without them.
  - TXT: structure-aware plain text.
- **Images** are embedded as data URLs, downscaled to 1600 px, and WebP is converted (Word can't show WebP). Moving them to the `attachments` store is planned when sharing arrives (Phase 3).

## Diagram Studio

- **Engine:** React Flow 12 (`@xyflow/react`), with a single custom `shape` node type that draws 12 shapes as SVG in pixel coordinates, so corners never stretch on resize.
- **Connectors:** four handles per shape in loose mode (any side can start or end a connector), with reconnectable endpoints, four line styles, arrow modes, dashes, colours and labels. Style lives in `edge.data`; `styledEdge()` derives React Flow props from it.
- **History:** `UndoStack` of immutable `{nodes, edges}` snapshots, pushed before each change (drag start, connect, delete, resize start, style or label edit, layout).
- **Tree tools:** `layoutTree()` is a tidy-tree layout (TB or LR) that leaves unconnected shapes alone and survives cycles. Tree templates turn on auto-arrange, so Tab (child) and Enter (sibling) re-layout as students build.
- **Stored form:** `{ schemaVersion, nodes, edges, viewport, settings }`, with runtime fields (selection, measurements) stripped. `deserializeDiagram()` drops dangling edges and fills defaults.
- **Canvas:** always light paper, in both themes, so exports match the screen.
- **Export:** `html-to-image` captures the viewport cropped to the node bounds, excluding handles and controls: PNG at 2×, SVG, and PDF (3× raster in a page sized to the diagram, via jsPDF, loaded lazily).

## Web shell

- `useEditableItem` (in `apps/web/src/lib/storage.ts`) owns load, debounced autosave, flush-on-hide, explicit version save and conflict state. Editors only report content through `onChange`.
- Theme: `ThemeProvider` (light, dark or system). Tokens are CSS variables in `index.css`, exposed to Tailwind via `@theme inline`. An inline script applies the theme before first paint.
- PWA: `vite-plugin-pwa` precaches the whole app shell, so the app loads offline after the first visit.

## Later phases

- **Phase 2:** notebook, subjects, accounts. New stores via a new IndexedDB migration (append to `MIGRATIONS`).
- **Phase 3:** classroom host = FastAPI on the teacher's device. Students pair by code and LAN address. Sharing is explicit: selected items are sent as `sync_operations`, and receivers keep independent copies.
- **Phase 4:** Yjs for live collaboration as a separate service, never required for ordinary editing. Tiptap has first-party Yjs bindings.
