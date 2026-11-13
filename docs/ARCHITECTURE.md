# Architecture

Companion to [PRD.md](PRD.md). Describes what exists today (Phase 0, Phase 1 foundations, Release 0.2 stabilisation and the diagram integration) and where later phases plug in.

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

Design decisions are recorded in [docs/adr](adr/README.md): local-first storage, identity and privacy, concurrency, autosave and drafts, version history, migrations, backups, attachments, cross-tab coordination and deletion.

## Principles in code

| PRD rule | How it is enforced |
|---|---|
| Create and save locally, offline | All editing goes through `StorageAdapter` → IndexedDB. No editor code path makes network requests. Fonts are bundled (`@fontsource`), not loaded from Google. |
| Preserve versions | Every save increments `version`. Snapshots go to `*_versions` on create, on Ctrl/⌘+S, and at most every 10 minutes of editing. Restoring a version first snapshots the current state. Pruning keeps exactly 50 and protects the create, newest manual and newest pre-restore versions (fixed in 0.2). |
| Never silently overwrite | `save(kind, id, patch, expectedVersion)` reads, checks and writes in one IndexedDB transaction. A stale `expectedVersion` throws `ConflictError`; the editor stops autosaving and asks the user to keep their edits as a copy or load the latest. Other tabs are told about saves over `BroadcastChannel` and adopt them when they have no unsaved edits. Backup import adds divergent items as copies. |
| Interrupted saves don't corrupt | IndexedDB transactions are atomic; the record, its index row and its version snapshot are written together or not at all (tested). Saves run through one serialised queue with retry and backoff. If a save keeps failing, the unsaved content goes to the `drafts` store and is offered back on reopen. The app warns before closing with unsaved edits. |
| Data survives upgrades | Before a database upgrade the old database is copied to a safety copy. Newer content opens read-only. Tiptap's content check stops the editor from silently dropping unknown nodes. |
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
- **Embedded diagrams:** a `diagram` atom node stores the editable Diagram Studio content in `source` and points to a PNG preview (rendered at 2×) in the `attachments` store through `previewId`, with natural and display sizes. Double-click opens the full diagram editor in a dialog; saving re-renders the preview. Resizing keeps the aspect ratio. The Diagram tab inserts new diagrams from templates, from My Diagrams or from a diagrams.net file, and offers edit, size, download (PNG or .drawio) and remove. DOCX export embeds the preview image; TXT writes `[Diagram: title]`. Document Studio never imports Diagram Studio: the app passes a `DiagramHost` that opens the editor and loads previews.
- **Safety on open:** `prepareDocument()` migrates and validates content. Content from a newer app, or content that fails validation, opens read-only with an explanation instead of being rewritten.
- **Images** are embedded as data URLs, downscaled to 1600 px, and WebP is converted (Word can't show WebP). Moving them to the `attachments` store is planned when sharing arrives (Phase 3).

## Diagram Studio

- **Engine:** React Flow 12 (`@xyflow/react`), with a single custom `shape` node type that draws its shapes as SVG in pixel coordinates, so corners never stretch on resize. UML class and ER entity shapes have compartments (lines separated by `--`); actor and package shapes support UML use-case and package diagrams.
- **Connectors:** four handles per shape in loose mode (any side can start or end a connector), with reconnectable endpoints, four line styles (elbow, orthogonal, straight, curved), dashes, colours and labels. Each end has its own marker: arrow, open arrow, UML triangle, diamond, filled diamond, circle, and the ER crow's-foot set (one, many, zero-or-one, zero-or-many). Style lives in `edge.data`; custom edge components in `edges.tsx` draw the markers inline.
- **Quick connect (diagrams.net style):** with one shape selected, four blue arrows sit beside it (`NodeToolbar`, so they keep their size through zoom and pan). Click an arrow to add a connected copy of the shape in that direction, placed without overlapping (`placeNew`), selected and scrolled into view. Hover or focus an arrow for a palette of shapes, with a dashed preview of where the new one will go. Drag an arrow onto another shape to connect it, or onto empty canvas to add a connected shape there; duplicate and self connections are refused with a message. Alt+Shift+Arrow does the same from the keyboard. Geometry lives in `quickConnectGeometry.ts` and is unit-tested; each action is one undo step.
- **diagrams.net:** `fromDrawio()` reads `.drawio` and `.xml` files (plain or compressed pages) into Diagram Studio content and reports anything it had to approximate; `toDrawio()` writes them back. Supported: common shapes, UML/ER containers, connectors, styles and labels.
- **Read-only protection:** diagrams saved by a newer app open read-only.
- **History:** `UndoStack` of immutable `{nodes, edges, settings}` snapshots, pushed before each change (drag start, connect, quick connect, delete, resize start, style or label edit, layout, nudges).
- **Tree tools:** `layoutTree()` is a tidy-tree layout (TB or LR) that leaves unconnected shapes alone and survives cycles. Tree templates turn on auto-arrange, so Tab (child) and Enter (sibling) re-layout as students build.
- **Stored form:** `{ schemaVersion, nodes, edges, viewport, settings }`, with runtime fields (selection, measurements) stripped. `deserializeDiagram()` drops dangling edges and fills defaults.
- **Canvas:** always light paper, in both themes, so exports match the screen.
- **Export:** `html-to-image` captures the viewport cropped to the node bounds, excluding handles and controls: PNG at 2×, SVG, and PDF (3× raster in a page sized to the diagram, via jsPDF, loaded lazily).

## Web shell

- `useEditableItem` (in `apps/web/src/lib/storage.ts`) owns load, debounced autosave through a serialised save queue with retries, flush-on-hide, drafts after failed saves, cross-tab updates, explicit version save and conflict state. Editors only report content through `onChange`.
- Editors are loaded with a plain dynamic import (`useModuleEditor`), not `React.lazy`, because Suspense re-mounts broke Tiptap's view. Each editor sits inside an error boundary that keeps the rest of the app usable.
- Routes cover Dashboard, Documents, Diagrams, Files, Recent, Favourites, Trash and Settings (General, Appearance, Storage, Backup, Shortcuts, About), plus a not-found page. The PWA asks before applying an update.
- Theme: `ThemeProvider` (light, dark or system). Tokens are CSS variables in `index.css`, exposed to Tailwind via `@theme inline`. An inline script applies the theme before first paint.
- PWA: `vite-plugin-pwa` precaches the whole app shell, so the app loads offline after the first visit.

## Later phases

- **Phase 2:** notebook, subjects, accounts. New stores via a new IndexedDB migration (append to `MIGRATIONS`).
- **Phase 3:** classroom host = FastAPI on the teacher's device. Students pair by code and LAN address. Sharing is explicit: selected items are sent as `sync_operations`, and receivers keep independent copies.
- **Phase 4:** Yjs for live collaboration as a separate service, never required for ordinary editing. Tiptap has first-party Yjs bindings.
