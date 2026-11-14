# Architecture

Companion to [PRD.md](PRD.md). Describes what exists today (Phase 0, Phase 1 foundations, Release 0.2 stabilisation, the diagram integration, and Phases 2–5) and where later phases plug in.

## Shape of the system

```
apps/web  ─────────────┐   React + Vite + Tailwind, PWA (offline shell via Workbox)
apps/desktop (Tauri) ──┼─► loads apps/web/dist in a native webview      (Phase 5)
apps/android (Capacitor)┘                                                (Phase 5)
        │
        ├── @dcos/ui               design tokens, components, theme, toasts
        ├── @dcos/document-studio  Tiptap editor, templates, DOCX / ODT / PDF / TXT export, DOCX / ODT import
        ├── @dcos/diagram-studio   React Flow editor, shape library, layouts, vector SVG / PDF and PNG export, .drawio and .dcosdiagram files
        └── @dcos/local-storage    StorageAdapter interface + IndexedDB implementation

backend/ (FastAPI)  classroom host for LAN sharing — Phase 3. Never needed for editing.
```

Packages are consumed as TypeScript source through npm workspaces (no per-package build step). Vite bundles them; Tailwind scans them via `@source`.

Design decisions are recorded in [docs/adr](adr/README.md): local-first storage, identity and privacy, concurrency, autosave and drafts, version history, migrations, backups, attachments, cross-tab coordination, deletion, and the Phase 4 document format.

## Principles in code

| PRD rule | How it is enforced |
|---|---|
| Create and save locally, offline | All editing goes through `StorageAdapter` → IndexedDB. The only network request an editor makes is a one-time fetch of a picture the user pastes from a website, without cookies or referrer, to store it in the document. Fonts are bundled (`@fontsource`), not loaded from Google. |
| Preserve versions | Every save increments `version`. Snapshots go to `*_versions` on create, on Ctrl/⌘+S, and at most every 10 minutes of editing. Restoring a version first snapshots the current state. Pruning keeps exactly 50 and protects the create, newest manual and newest pre-restore versions (fixed in 0.2). |
| Never silently overwrite | `save(kind, id, patch, expectedVersion)` reads, checks and writes in one IndexedDB transaction. A stale `expectedVersion` throws `ConflictError`; the editor stops autosaving and asks the user to keep their edits as a copy or load the latest. Other tabs are told about saves over `BroadcastChannel` and adopt them when they have no unsaved edits. Backup import adds divergent items as copies. |
| Interrupted saves don't corrupt | IndexedDB transactions are atomic; the record, its index row and its version snapshot are written together or not at all (tested). Saves run through one serialised queue with retry and backoff. If a save keeps failing, the unsaved content goes to the `drafts` store and is offered back on reopen. The app warns before closing with unsaved edits. |
| Data survives upgrades | Before a database upgrade the old database is copied to a safety copy. Newer content opens read-only. Tiptap's content check stops the editor from silently dropping unknown nodes. |
| Platform independence | `StorageAdapter` is the only persistence API the app uses. Tauri/Capacitor will provide SQLite adapters (Phase 5); see [DATABASE.md](DATABASE.md). Routing uses hash URLs so `file://`, `tauri://` and `capacitor://` all work. Vite `base: './'`. |

## Document Studio

`packages/document-studio`. What each export writes and each import reads, feature by feature, is in [DOCUMENT_COMPATIBILITY.md](DOCUMENT_COMPATIBILITY.md); the format decisions are in [ADR 0011](adr/0011-document-format-phase4.md).

### Schema and stored form

- **Engine:** Tiptap 3 (ProseMirror). The schema is `documentExtensions()` (`extensions/index.ts`; `documentSchema()` in `schema.ts` builds it without a view). Extensions may be added but never removed, or saved documents stop loading.
- **Stored form:** `{ schemaVersion, doc: ProseMirror JSON, page: PageSettings, mode, …content fields }`. `normalizeDocument()` fills defaults for older content. `normalizePage()` checks every stored page setting (`PAGE_FIELD_CHECKS` in `types.ts`, plus `LAYOUT_FIELD_CHECKS` in `pageLayout.ts`) and never throws.
- **Content fields:** document-level data beyond the body and page lives in registered top-level fields (`CONTENT_FIELDS` in `types.ts`), each with a check and a default. Phase 4 has two: `comments` (comment threads) and `language` (a BCP 47 tag). A field at its default is not written.
- **Schema 1 and 2:** `contentSchemaFor()` (`migrate.ts`) returns 1 when a document uses only the frozen v0.1.0 vocabulary in `compat.ts` (`V010_VOCABULARY`: node and mark types with attribute defaults, content fields, page fields, sizes, orientations, margin keys, modes), and 2 otherwise. The editor saves with it, so only documents that use something new become schema 2, and they go back to 1 when it is removed. v0.1.0 reads schema 1 only.
- **Safety on open:** `prepareDocument()` (`safety.ts`) migrates and validates content. Content from a newer app, or content with anything this version cannot represent (unknown node, mark, attribute value, page setting, mode or content field), opens in a protected read-only view built from a display copy; the stored original is never rewritten.

### Extensions

| Extension | Kind | Stores | File |
|---|---|---|---|
| StarterKit, TextStyleKit, Highlight, TextAlign, TableKit, Subscript, Superscript | Tiptap's own (v0.1.0 vocabulary) | — | `extensions/index.ts` |
| `PageBreak`, `TableOfContents`, `SearchReplace` | node, node (live React view), plugin (with match case and whole words) | — | `extensions/` |
| `DiagramEmbed` | `diagram` atom node | Diagram Studio content in `source`, a preview attachment id | `extensions/diagramEmbed.tsx`, preview cache `extensions/previewCache.ts` |
| `FigureImage` | replaces Tiptap's `image` (same name) | `align`, `caption` | `extensions/figureImage.ts` |
| `RemoteImages` | plugin, no schema change | fetches a pasted web picture once and stores it as a data URL, or marks it "Not saved for offline use" | `extensions/remoteImages.ts` |
| `ParagraphFormat` | attributes on paragraphs and headings | `lineSpacing`, `spaceBefore`, `spaceAfter`, `indentLeft`, `indentRight`, `indentFirstLine`, `paragraphStyle` (Title, Subtitle, Caption) | `extensions/paragraphFormat.ts`, looks in `paragraphStyles.ts` |
| `ListStyles` | attributes on lists | `bulletStyle`, `numberFormat` (start uses `orderedList.start`) | `extensions/listStyles.ts` |
| `Equations` | `inlineMath`, `blockMath` (from `@tiptap/extension-mathematics`, KaTeX with trust off) | `latex` | `extensions/equation.ts` |
| `Shape` | atom block node with a React view | kind, size, fill, outline, label, alignment | `extensions/shape.tsx`, `shapeModel.ts` |
| `TextBox` | block node with rich content | wrapping, width, fill, border | `extensions/textBox.ts` |
| `SectionBreak` | atom block node at the top level | `breakType`, `orientation`, `columns`, `columnSpacing`, `numberFormat`, `numberStart` (null = same as before) | `extensions/sectionBreak.ts`, resolution in `sections.ts` |
| `CommentMark` | `comment` mark | `commentId` only; threads are in the `comments` content field | `review/commentMark.ts`, `review/comments.ts` |

Every attribute added to a v0.1.0 node or mark defaults to null and is rendered only when set, and every attribute round-trips through HTML (`data-*`) so copy and paste keeps it. Page layout settings (header and footer parts, a different first page, columns, page number format, start, position and wording) are optional page fields in `pageLayout.ts`.

### Editor UI

- **Ribbon:** `ui/ribbon/registry.ts` lists the tabs (`RIBBON_TABS`) and shows a tab only when it has content for the current mode: Home, Insert and (with a diagram host) Diagram in Simple mode; Layout and Review are added in Advanced. Each tab is a component receiving `RibbonContext` (`ui/ribbon/context.ts`): the editor, mode, page settings, callbacks and the review controls. Contextual bars sit under the tabs: `TableBar` for tables and `ObjectBar` for a selected picture, equation, shape or text box (both modes). Below the phone breakpoint the active tab takes the full width and the mode switch and Export move to a row below.
- **Modes:** Simple shows a curated core (styles, B/I/U/S, colours, lists, quote, alignment, line spacing; link, picture, table, horizontal line, diagram). Advanced adds fonts and sizes, sub/superscript, indents, list styles, the Paragraph dialog and ruler, equations, shapes, text boxes, page breaks, the table of contents, and the Layout and Review tabs. Both modes edit the same document; switching never drops formatting.
- **Around the page:** `ui/PaperChrome.tsx` previews header and footer parts; `ui/ribbon/format/Ruler.tsx` (Advanced, hidden on phones and in the protected view) drags margins and indents; `review/CommentsPanel.tsx` (`CommentsLayer`) is the comments side panel; `ui/ExportMenu.tsx` is the export menu. The page is one continuous sheet: there is no on-screen pagination.
- **App props:** the app passes `authorName` (Settings → General → Your name), `spellcheck` and `onSpellcheckChange` (remembered preference) through `DocumentEditorProps`.

### Export

Each exporter is a set of registries that features add to. The DOCX, TXT and `PRINT_CSS` registries carry a `// @phase4:<area>` marker where entries are added; the ODT registries and `PRINT_DOM` have none.

- **DOCX** (`export/docx/`, with `docx` 9.15): `buildDocx()` converts the body through `NODE_HANDLERS` (blocks), `INLINE_HANDLERS` (inline nodes), `MARK_HANDLERS` (marks) and `TEXT_RUN_WRAPPERS` (comment ranges), then applies `DOCUMENT_CONTRIBUTORS` in order: comments (`review/docx.ts`), language, named styles (`export/docx/format.ts`), and sections with header and footer parts (`export/docx/sections.ts`). `DOCX_PREPARERS` run first, asynchronously, to draw pictures in the browser (shapes, equations outside Word's subset; `export/insertPictures.ts`). Bookmarks come from a per-document allocator (`Ctx.bookmarkId`), so the same document always gives the same XML.
- **ODT** (`export/odt/`): the app's own writer, zipped with fflate. `ODT_NODE_HANDLERS`, `ODT_INLINE_HANDLERS`, `ODT_MARK_HANDLERS`, `ODT_PARAGRAPH_CONTRIBUTORS` and `ODT_HANDLED_ATTRS`. Anything without a handler, and any attribute, page setting or content field it does not write, is reported, so a later feature is never dropped silently.
- **Print/PDF** (`export/print.ts`, `export/printLayout.ts`): the rendered editor DOM is cleaned (`cleanClone`), changed by `PRINT_DOM` (section wrappers for columns and CSS named pages) and placed in a print iframe with `@page` rules plus `PRINT_CSS` entries (comments hidden; header and footer parts, page number formats, first page). User text in CSS goes through `cssString()`, which escapes `<` and `>`. Margin boxes need Chromium 131+; `export/printSupport.ts` detects that from the user agent so the menu and a toast can say so.
- **TXT** (`export/text.ts`): `TEXT_HANDLERS` and `TEXT_INLINE_HANDLERS`. Nothing is dropped silently: pictures, diagrams, shapes, equations, section breaks and the table of contents get markers, also inside table cells. Comments are appended after the text.
- **Export report:** each exporter records what it approximated in an `ExportReport` (`export/report.ts`; shared wording in `NOTES`, ODT wording in `export/odt/notes.ts`). `exportToast()` turns it into "Exported Word document. 1 shape was written as a picture." (information) or "Exported Word document" (success).

### Import

`import/index.ts` (`importDocumentFile`) recognises a Word or OpenDocument file by its contents and always creates a new document. `import/docx.ts` uses mammoth (with a style map and private-use markers for alignment and page breaks) plus its own reading of page size, margins, header, footer and language; `import/odt.ts` reads `content.xml` and `styles.xml` directly. Both refuse a package that would unpack to more than 512 MB, check the result against the editor schema, and return an `ImportReport` that the app shows as "Imported with notes" (`apps/web/src/components/ImportDocument.tsx`).

### Other parts

- **Embedded diagrams:** a `diagram` atom node stores the editable Diagram Studio content in `source` and points to a PNG preview (rendered at 2×) in the `attachments` store through `previewId`, with natural and display sizes. Double-click opens the full diagram editor in a dialog; saving re-renders the preview. Resizing keeps the aspect ratio. The Diagram tab (and the Insert tab's Diagram menu) inserts new diagrams from templates, from My Diagrams or from a diagrams.net file, and offers edit, size, download (PNG or .drawio) and remove. A diagram without its data offers Remove instead of opening the editor. Previews are cached with reference counts; failed loads are not cached, and unused object URLs are revoked. Document Studio never imports Diagram Studio: the app passes a `DiagramHost` that opens the editor and loads previews.
- **Images** are embedded as data URLs, downscaled to 1600 px, and WebP is converted (Word can't show WebP). Pasted web pictures are fetched once (no cookies or referrer) and stored the same way, or kept and marked when the site refuses. Moving images out of document content (TD-2) was not done in Phase 4; version history stores large images once ([ADR 0005](adr/0005-version-history.md)).
- **Links:** `links.ts` allows only the schemes Tiptap's link mark accepts; the link box adds `https://` to scheme-less addresses and `mailto:` to e-mail addresses, and refuses the rest with a message.
- **Templates:** `templates.ts`, nine templates, all content schema 1.
- **Open-items tabs (app):** `apps/web/src/lib/openTabs.ts` and `components/OpenTabs.tsx` keep up to 12 open documents and diagrams per device in localStorage and show them as tabs in the editor header (Ctrl+Alt+←/→).

## Diagram Studio

Phase 5 split the editor into registries and pure modules; format decisions are in [ADR 0012](adr/0012-diagram-format-phase5.md), exports in [DIAGRAM_EXPORTS.md](DIAGRAM_EXPORTS.md).

- **Engine:** React Flow 12 (`@xyflow/react`), with a single custom `shape` node type that draws its shapes as SVG in pixel coordinates, so corners never stretch on resize. Groups and containers (BPMN pools and lanes, UML system boundaries) are React Flow parent nodes (`parentId`, positions relative to the parent).
- **Module layout** (`packages/diagram-studio/src`):
  - `DiagramEditor.tsx` (about 290 lines) wires the pieces; `editor/` holds them: `useDiagramState.ts` (state, undo snapshots including layers), `useCanvas.ts` (selection, groups, clipboard, full screen, touch), `canvasModel.ts` (pure group, lock, layer, z-order, distribute and clipboard-payload operations), `mutations.ts`, `Toolbar.tsx`, `ExportMenu.tsx`, `ExportDialog.tsx`, `ShapeLibrary.tsx`. Every toolbar group, selection action, shortcut and export format receives one `EditorController` (`editor/controller.ts`).
  - **Registries** that features add to instead of editing the editor: `SHAPE_DEFS` and `HANDLE_IDS` (`shapeRegistry.ts`), `SHAPE_RENDERERS` (`shapes.tsx`), `EDGE_PATHS` (`edges.tsx`), `NODE_INSPECTOR_SECTIONS` / `EDGE_INSPECTOR_SECTIONS` (`Inspector.tsx`), `TOOLBAR_GROUPS`, `SELECTION_ACTIONS`, `SHORTCUTS` (`editor/shortcuts.ts`, also the source of the `?` help), `EXPORT_FORMATS`, `SHAPE_DATA_READERS` / `CONNECTOR_DATA_READERS` (`model.ts`), the diagrams.net tables (`drawioRegistry.ts`) and `SVG_LABEL_RENDERERS` (`vector/renderSvg.tsx`). `@phase5:` comments mark the insertion points.
  - `library/`: the Phase 5 shape kinds (BPMN, UML sequence/activity/state/use case, 11 original network icons, timeline dates; `kinds.ts`, `defs.ts`, `renderers.tsx`), library categories and search, containers (`containers.ts`), the radial/two-sided mind map and timeline layouts, connector notation presets and the category templates.
  - `connect/`: connector geometry as pure functions shared by the canvas and the exports (`geometry.ts`: eight fixed points, floating perimeter ends, bend points, label position), `ConnectorEdge.tsx` (bend-point, end-grip and label interaction), `edgeChanges.ts`, `useConnect.ts`, the Format panel sections and the Quick Connect palette's keyboard movement (`paletteNav.ts`).
  - `model.ts` validates every schema-3 field on load (invalid values are left out, never a crash); `compat.ts` decides the schema number; `native.ts` reads and writes `.dcosdiagram`; `drawio.ts` and `drawioFeatures.ts` read and write diagrams.net; `vector/` is the export pipeline.
- **Connectors:** four side handles plus corner ports and floating ends, reconnectable endpoints, manual bend points on all four line types (elbow, orthogonal, straight, curved), labels that can be edited on the canvas and dragged along the line, dashes, colours and per-end markers (arrows, UML, crow's-foot). Markers are shared `<marker>` definitions per kind and colour (`MarkerDefs`). No obstacle avoidance.
- **Quick connect (diagrams.net style):** four arrows beside one selected shape (`NodeToolbar`). Click adds a connected copy without overlapping (`placeNew`), drag connects or adds a shape where dropped, hover, focus or long press opens a shape palette (roving focus and arrow keys from the keyboard). Alt+Shift+Arrow from the keyboard. A new shape joins the group, pool or lane of the shape it came from. Geometry in `quickConnectGeometry.ts`; each action is one undo step.
- **Schema 2 vs 3:** `compat.ts` holds `SCHEMA2_VOCABULARY`, frozen from the Phase 4 build (`206e080`) and never edited. `schemaFor()` returns 3 when content uses anything outside it (groups, layers, locks, hidden shapes, rotation, links, tooltips, properties, bend points, label positions, ports, library kinds…) and 2 otherwise, and `serializeDiagram` sets `schemaVersion` from it on every save. So a diagram using only schema-2 features stays editable in the Phase 4 build; removing the last schema-3 feature returns it to 2. `DIAGRAM_SCHEMA` (the newest readable) is 3; anything newer opens read-only and `getContent()` hands back the original object. Templates drawn with library shapes (network, timeline, BPMN, UML sequence/activity/state/use case) are schema 3. Backups accept diagrams up to schema 3 (`MAX_CONTENT_SCHEMA_BY_KIND`, [ADR 0007](adr/0007-backup-format.md)). A backup's `schemaVersion` is the highest schema among its items and saved versions, so a backup holding any schema-3 diagram, or a schema-3 version of one, is itself schema 3, and the Phase 4 build refuses the whole file, even when every diagram is back to schema 2.
- **Native file (`.dcosdiagram`):** `{ format: "dcos-diagram", version: 1, app, title, diagram }`, the stored content unchanged (MIME `application/vnd.dcos.diagram+json`, 64 MB limit). Opening is strict: anything invalid is refused with a reason and nothing is created. A valid file always becomes a new diagram. Export menu in the editor; "Import diagram file" in the Diagrams list and "Open file…" in the editor (`apps/web/src/components/DiagramFiles.tsx`, which also opens `.drawio`).
- **diagrams.net:** `fromDrawio()` reads `.drawio` / `.xml` (plain or compressed, any page via `{ page }`, `drawioPages()` lists them) and maps groups, layers, hidden cells, links, tooltips, properties, rotation, opacity, fonts, alignment, embedded pictures, bend points, label positions, fixed points and swimlanes (as BPMN pools and lanes). What it approximates or leaves out is reported as counted notes (`IMPORT_NOTES`); pictures from the web are never fetched. `toDrawio()` writes the same forms back plus `dcosShape` keys so our own files return exactly; `drawioExportNotes()` names what a `.drawio` file cannot hold (`DRAWIO_EXPORT_LOSSES`). Library shapes are written as the nearest diagrams.net styles (`mxgraph.bpmn.*`, `mxgraph.networks.*`); none of this has been opened in diagrams.net itself.
- **Export pipeline (`vector/`):** every image export is drawn from the saved content, not captured from the canvas. `renderSvg.tsx` builds plain SVG (no `<foreignObject>`) with the canvas's own renderers, connector geometry, markers and visibility and stacking rules; `textLayout.ts` breaks labels with Helvetica/Courier metrics; `raster.ts` draws that SVG on a canvas for PNG (1×–3×, white or transparent, capped at 16,777,216 pixels and 16,384 px per side, with a note); `pdf.ts` converts it with svg2pdf.js into a vector PDF with real text (diagram-sized page, or A4/Letter fitted or tiled up to 100 pages). `exportFile.ts` is the single entry point for the menu and the Export options dialog. The document embed's `renderPng/renderSvg/renderPdf` use the same pipeline. Approximations (fonts, clipping, characters outside WinAnsi in the PDF) are listed in DIAGRAM_EXPORTS.md. The older html-to-image capture in `export.ts` is still exported by the package but no longer used by the editor (TD-42).
- **History:** `UndoStack` of immutable `{nodes, edges, settings, layers}` snapshots, pushed before each change.
- **Layouts:** `layoutTree()` (TB or LR) for trees with Tab/Enter auto-arrange; radial and two-sided mind maps and even timeline spacing from Arrange (`library/`). Layouts never move locked shapes and leave bend points where they are. Arrange timeline and Add event remove plain straight lines (no label, arrows or bends) between dates that are no longer neighbours, as old axis pieces, and say how many in a toast (`layoutTimeline().removed`, `noteRemovedAxis`); undo brings them back.
- **Canvas:** always light paper, in both themes, so exports match the screen. Full screen through the Fullscreen API, with toasts shown inside the editor while full screen (`editor/fullscreenToasts.tsx`).

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
