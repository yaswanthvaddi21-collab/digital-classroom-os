# Release 0.2 audit — findings register

Every finding from the 2026-11-13 audit of v0.1.0 (`v0.1.0-baseline`). Eight independent auditors each covered one area. A separate verifier then re-checked every finding against the code and sources and tried to refute it.

Verdicts: **confirmed** = evidence holds · **corrected** = gist holds, a detail was fixed (see note) · **unverifiable** = could not be checked read-only. No finding was refuted.

The summary and priorities are in [RELEASE-0.2-AUDIT.md](RELEASE-0.2-AUDIT.md). Line numbers refer to the `v0.1.0-baseline` tag.

## Architecture

Digital Classroom OS v0.1.0 is a small (about 5.8k LOC), cleanly layered npm-workspaces monorepo. Only 5 workspaces are real (apps/web, packages/ui, local-storage, document-studio, diagram-studio). Dependencies point one way only: apps/web uses all four packages, both studios use only @dcos/ui, and no package imports local-storage or the app (checked with grep). Persistence goes through one StorageAdapter singleton in apps/web/src/lib/storage.ts, and editors are injected only through initialContent/onChange, which is a good seam. App.tsx defines 5 routes inside AppShell (/, /documents, /diagrams, /trash, /settings), 2 full-screen editor routes outside it (/documents/:id, /diagrams/:id) and a catch-all redirect to /. Against the target nav, 5 of 20 entries exist as routes (Dashboard, Documents, Diagrams, Trash, Settings). Recent Files and Favorites exist only as Dashboard sections. General/Appearance/Storage/Backup exist as cards on one Settings page. The other 13 are missing, and 5 of them show in the sidebar as disabled "Coming next" placeholders whose phase labels no longer match the roadmap. Every new route can be added without breaking existing hash URLs. Two cautions: the catch-all redirect currently swallows unknown URLs, and the header title derived from the path breaks for nested paths. The main debt for the roadmap: the document/diagram kind is hard-coded as two-way ternaries in about 10 places, including the IndexedDB store mapping. list() loads every item's full content. Images are stored inline as base64, so they are copied into every autosave and every version snapshot. There is no code-splitting (one 1.32 MB entry chunk). The storage instance is created when the module is imported, with no way to inject another adapter. Editors are route-scoped pages that must remount to load content and register window-level Ctrl+S handlers, so tabbed multi-document editing needs a new open-document layer rather than a small change. The Toolbar is a 423-line component inside document-studio, so a ribbon is a rewrite of that layer, not a re-skin. Theme tokens live in apps/web/src/index.css rather than packages/ui, and the diagram canvas hard-codes light colours with no dark-mode handling.

| ID | Severity | Status | Finding | Verdict |
|---|---|---|---|---|
| ARCH-4 | high | risk | Item kind is hard-coded as a document/diagram two-way choice in about 10 places, including storage | confirmed |
| ARCH-6 | high | partial | StorageAdapter is a usable seam for SQLite, but injection, list() cost and inline images need work first | confirmed |
| ARCH-2 | medium | partial | Current routes and how they map to the target navigation | corrected |
| ARCH-5 | medium | partial | State and persistence flow: sound per-item autosave, but no cross-window change notification | confirmed |
| ARCH-7 | medium | missing | Not ready for tabbed multi-document editing: editors are route-scoped pages with global shortcuts | confirmed |
| ARCH-8 | medium | partial | Ribbon readiness: the Document toolbar is one monolithic component; the export menu is inline in the editor | corrected |
| ARCH-9 | medium | risk | No code-splitting: both editors and jsPDF/html2canvas are in a 1.32 MB entry chunk | corrected |
| ARCH-10 | low | partial | Design tokens live in the app, not the design system; diagram canvas ignores dark mode | corrected |
| ARCH-11 | low | risk | Duplicated page and editor code will multiply with each module | corrected |
| ARCH-3 | low | risk | Catch-all redirect and header title break when routes grow | confirmed |
| ARCH-1 | info | works | Workspace layout and dependency direction are clean (one-way, no cycles) | confirmed |
| ARCH-12 | info | info | Native shells point at the web build; hash routing and relative base suit them, but the storage choice is not wired | confirmed |

### ARCH-4 — Item kind is hard-coded as a document/diagram two-way choice in about 10 places, including storage

*high · risk · verdict: confirmed*

**Evidence.** packages/local-storage/src/types.ts:2 `export type ItemKind = 'document' | 'diagram'`; packages/local-storage/src/indexeddb.ts:36-37 `itemStore = (kind) => (kind === 'document' ? 'documents' : 'diagrams')` (same for versionStore); indexeddb.ts:247-260 exportBackup names the four stores explicitly; indexeddb.ts:339 validateBackup kinds list; apps/web/src/components/EditorFrame.tsx:49 and :160; apps/web/src/pages/FilesPage.tsx:12-13,20-21,33-34; apps/web/src/components/NewItemDialog.tsx:18,43,49; apps/web/src/components/ItemRow.tsx:11; apps/web/src/App.tsx:18 trash route uses `kind="document"` as a dummy; Dashboard.tsx:15-16 makes one useItems call per kind.

**Detail.** Releases 0.5 and 0.7 add presentation, notebook, assignment and pdf kinds. Every two-way ternary sends anything that is not 'document' to the diagram branch. If a new kind is added to the type but someone misses indexeddb.ts:36, presentations would be written silently into the 'diagrams' object store and its version history, mixing data. The compiler will not catch this because the ternary is total. Trash, Dashboard recent and Favorites each call useItems once per kind and merge the results by hand, so every new kind means editing each of these screens. Adding stores also requires a schema migration (SCHEMA_VERSION=1, indexeddb.ts:19,44-52). The existing append-only MIGRATIONS array supports that, but exportBackup/validateBackup must be updated in step.

**Verifier.** Re-checked every cited location. types.ts:2 is `'document' | 'diagram'`. indexeddb.ts:36-37 holds the ternaries. exportBackup hard-codes the four stores at indexeddb.ts:244-261 (the auditor said 247-260, a minor offset). validateBackup's kinds list is at :339. Also confirmed EditorFrame.tsx:49,160; FilesPage.tsx:12-13,20-21,33-34; NewItemDialog.tsx:18,43,49; ItemRow.tsx:11; App.tsx:18; Dashboard.tsx:15-16. SCHEMA_VERSION=1 is at :19 and the append-only MIGRATIONS array at :44-52. The ternary returns ItemStore for any kind, so adding a kind to ItemKind compiles and silently routes the new kind to 'diagrams'. One more kind-dependent spot exists: EditorFrame.tsx:87 navigates to `/${kind}s/${id}` (pluralising by string). High severity is defensible because mis-routed writes would mix user data.

**Recommendation.** Before adding any third kind: (a) make the store mapping a `Record<ItemKind, {items, versions}>` so a missing entry is a compile error; (b) add a module registry in apps/web (kind -> label, icon, route base, templates, editor component loaded lazily) and replace the ternaries with lookups; (c) add StorageAdapter.listAll / list({kinds}) so Trash, Recent and Favorites stop merging per kind; (d) ship new stores through an appended migration (v2) with a test that opens a v1 fake-indexeddb database containing data and checks that ids and content survive. Never rename or reshape the existing 'documents'/'diagrams' stores; this keeps existing IDs and data.

### ARCH-6 — StorageAdapter is a usable seam for SQLite, but injection, list() cost and inline images need work first

*high · partial · verdict: confirmed*

**Evidence.** packages/local-storage/src/types.ts:83-99 (async, promise-based, kind-scoped interface with optimistic save, versions, backup); apps/web/src/lib/storage.ts:4-5 `/** ... Native shells will inject a SQLite adapter here. */ export const storage: StorageAdapter = new IndexedDbAdapter();` (created when the module is imported, no injection point); packages/local-storage/src/indexeddb.ts:107-114 list() does db.getAll(store) and then summarize() calls JSON.stringify(content) per item (:54-57); packages/document-studio/src/image.ts:20,39 images are stored as data URLs (readAsDataURL / canvas.toDataURL) inside document content; MAX_VERSIONS_PER_ITEM = 50 full-content snapshots (indexeddb.ts:23); docs/DATABASE.md:31-33 says SQLite uses 'the same StorageAdapter contract'.

**Detail.** Good: the interface is async, has no IndexedDB types, and the app never touches IDB directly, so a SQLite adapter (for example tauri-plugin-sql or @capacitor-community/sqlite, both free) can implement it. Gaps: (1) The adapter is built when the module is imported. A native build cannot select a different adapter at runtime without editing this file, and the IndexedDB database is opened even when another adapter will be used. (2) list() reads and stringifies every item's full content just to show a list, so cost grows with total content size (including embedded images). A SQL adapter would need a stored size column to match this behavior cheaply. (3) Images are inlined as base64. Each 600 ms autosave rewrites them, and each of up to 50 version snapshots per item duplicates them. That inflates IDB, backups (one JSON file, SettingsPage.tsx:41) and any future SQLite or Yjs payloads. (4) There is no migration path from an existing IndexedDB profile into SQLite on first native launch. Existing web users' data lives in the browser origin; the backup export/import is the only bridge today.

**Verifier.** types.ts:83-99 is an async interface with no IndexedDB types. storage.ts:4-5 builds the adapter when the module is imported. The IndexedDbAdapter constructor (indexeddb.ts:68-78) calls openDB right away, so the IndexedDB database really is opened even if another adapter would be used. list() at :107-114 does getAll and then summarize(), which stringifies the content (:54-57). image.ts:20 and :39 use readAsDataURL and toDataURL. MAX_VERSIONS_PER_ITEM=50 is at :23. Snapshots are rate-limited to one every 10 minutes (AUTO_SNAPSHOT_INTERVAL_MS, :21), but each one is a full-content copy including the inline images. DATABASE.md around lines 31-33 says 'The same StorageAdapter contract, backed by SQLite'.

**Recommendation.** Turn storage.ts into a factory, e.g. createStorage(platform), that picks IndexedDb, TauriSqlite or CapacitorSqlite once at bootstrap from main.tsx. Have the web build tree-shake native adapters. Store sizeBytes and summary fields at write time so list() never reads content. Move images and other binaries to a separate 'blobs' store/table referenced by id (content-addressed), using an appended migration that rewrites existing data URLs while keeping item IDs. Write a shared StorageAdapter conformance test suite (the existing indexeddb.test.ts is the base) that every adapter must pass. Document the IndexedDB -> SQLite first-run import (via the existing backup format) in DATABASE.md.

### ARCH-2 — Current routes and how they map to the target navigation

*medium · partial · verdict: corrected*

**Evidence.** apps/web/src/App.tsx:14-23: inside AppShell: index '/' -> Dashboard, 'documents' -> FilesPage kind=document, 'diagrams' -> FilesPage kind=diagram, 'trash' -> FilesPage kind="document" trash, 'settings' -> SettingsPage. Outside AppShell (full-screen): 'documents/:id' -> DocumentPage, 'diagrams/:id' -> DiagramPage; '*' -> Navigate to '/' replace. HashRouter (App.tsx:12). Sidebar apps/web/src/components/AppShell.tsx:29-43 lists Dashboard/Documents/Diagrams/Trash as links plus disabled 'Coming next' items Notebook P2, Assignments P2, Classroom P3, Presentations P4, PDF Studio P4. Favorites/recent only appear on Dashboard (apps/web/src/pages/Dashboard.tsx:20-24). SettingsPage.tsx:59-129 has Appearance, Backup and restore, Device storage cards and an info card with 'App version 0.1.0 · Phase 1 foundation' hard-coded at line 126.

**Detail.** Target vs current. WORKSPACE: Dashboard (exists, /), Documents (exists, /documents), Diagrams (exists, /diagrams), Presentations (missing, disabled placeholder), Notebook (missing, placeholder), PDF Studio (missing, placeholder). ACADEMIC: Assignments (missing, placeholder), Classroom (missing, placeholder), Calendar (missing, not in sidebar), Shared Workspace (missing, not in sidebar). MANAGEMENT: File Manager (missing; /documents and /diagrams are per-kind lists), Recent Files (Dashboard section only, no route), Favorites (Dashboard section only plus a per-row star in ItemRow.tsx:54, no route), Trash (exists, /trash). SETTINGS: General (missing), Appearance (card on /settings), Storage (card on /settings), Backup and Restore (card on /settings), Keyboard Shortcuts (missing), About (partial: info card). Count: 5 of 20 are routes, 4 more exist partly as sections, 11 are absent. The sidebar phase labels (P2, P3, P4) no longer match the owner's release numbers (Presentations 0.5, Notebook/Assignments/Classroom/PDF 0.7). URLs that must keep working: #/, #/documents, #/diagrams, #/trash, #/settings, #/documents/:id, #/diagrams/:id (ids are UUIDs from local-storage/src/ids.ts and are part of saved links and backups).

**Verifier.** The route table is right (App.tsx:12-23). The sidebar arrays are at AppShell.tsx:29-43, with Trash inside the `workspace` array and five `upcoming` items tagged phase 2/2/3/4/4. The 'App version 0.1.0 · Phase 1 foundation' string is at SettingsPage.tsx:126. The counts are wrong. 'Settings' is not one of the 20 target entries; the target lists General, Appearance, Storage, Backup, Keyboard Shortcuts and About instead. Using the auditor's own breakdown: 4 entries exist as routes (Dashboard, Documents, Diagrams, Trash). 6 exist only partly (Recent and Favorites as Dashboard sections; Appearance, Storage and Backup as cards; About as an info card). 10 are absent (Presentations, Notebook, PDF Studio, Assignments, Classroom, Calendar, Shared Workspace, File Manager, General, Keyboard Shortcuts). That is 4+6+10=20. The finding's '5/4/11' and the summary's '13 missing' do not add up to 20 and do not match its own list.

**Recommendation.** Add new routes as siblings: #/presentations, #/notebook, #/pdf, #/assignments, #/classroom, #/calendar, #/shared, #/files, #/recent, #/favorites. Keep #/documents and #/diagrams as they are, and make #/files a new view over all kinds rather than renaming them. Turn Settings into a layout route: #/settings stays valid as an index (or does an in-app <Navigate> to #/settings/general), with children general, appearance, storage, backup, shortcuts, about. Add a route only when the module is real (no-placeholder rule), and change the 'Coming next' labels to the 0.x release numbers. Put the editor-route pattern '<kind>s/:id' in one route table (see ARCH-4) so new kinds follow it.

### ARCH-5 — State and persistence flow: sound per-item autosave, but no cross-window change notification

*medium · partial · verdict: confirmed*

**Evidence.** apps/web/src/lib/storage.ts:5 singleton `storage = new IndexedDbAdapter()`; :7-11 notifyStorageChanged is an in-memory Set of listeners; :59-197 useEditableItem: 600 ms debounce (:53), optimistic concurrency via version.current and ConflictError (:103-116), flush on visibilitychange/pagehide/unmount (:184-194). grep for BroadcastChannel / 'storage' event listener / lazy( / Suspense across apps/web/src and packages/*/src returned nothing (exit 1).

**Detail.** How it works: the route mounts the page; useEditableItem calls storage.get; the editor emits full content on every change; updateContent JSON.stringify-compares it with the last saved content; the debounced storage.save(patch, expectedVersion) writes it; a ConflictError freezes autosave and shows a banner (EditorFrame.tsx:76-102). This is correct for one editor per item. Limits: (1) notifyStorageChanged only reaches listeners in the same JS realm, so a second window or tab does not refresh lists, and an open editor only learns about another window's save when it next saves itself (a conflict). (2) A favorite toggle from a list (ItemRow.tsx:27) calls storage.save, which bumps the version. If that item is open in another window, that editor's next autosave fails with a conflict over a star click. (3) navigator.storage.persist() is only called from NewItemDialog.tsx:32 and the Settings button (SettingsPage.tsx:100), never at startup. That matches incident S-1: an existing profile with persisted()===false is never re-requested.

**Verifier.** storage.ts:5 is the singleton and :7-11 the in-memory listener Set. AUTOSAVE_DELAY_MS=600 is at :53. The ConflictError handling is around :103-120 and sets blocked.current. A grep for BroadcastChannel, a 'storage' event listener, lazy( or Suspense returns nothing. ItemRow.tsx:27 calls storage.save(...full.version) for a favourite toggle, which bumps the version. The persist call sits inside requestPersistentStorage (storage.ts:33-39), which is called only from NewItemDialog.tsx:32 and SettingsPage.tsx:100; main.tsx and App.tsx never call it at startup. The auditor did not mention that requestPersistentStorage also has a module-level `persistRequested` flag (storage.ts:31,36), so after one refusal it will not ask again in that session.

**Recommendation.** Add a small change bus inside the storage layer (BroadcastChannel, which is free and built into browsers; keep the in-memory path as a fallback) so lists and open editors in other windows get an 'item changed' event. Split metadata-only updates (favorite, title) from content versioning, or have the editor rebase on metadata-only changes, so starring does not cause content conflicts. Call requestPersistentStorage at app start (with a visible status), not only on create. Keep useEditableItem's contract; it is a good seam for tabs (see ARCH-7).

### ARCH-7 — Not ready for tabbed multi-document editing: editors are route-scoped pages with global shortcuts

*medium · missing · verdict: confirmed*

**Evidence.** apps/web/src/App.tsx:21-22 editor routes sit outside AppShell, so opening a document replaces the whole shell; DocumentPage.tsx:9-11 and DiagramPage.tsx:9-10 remount through a `key` generation counter to reload; DocumentEditor.tsx:17-18 `initialContent ... Read once on mount. Remount (change key) to load different content.`; DocumentPage.tsx:17-26 and DiagramPage.tsx:16-25 each add a window-level keydown listener for Ctrl/Cmd+S; DocumentPage.tsx and DiagramPage.tsx are near-identical (45-46 lines each).

**Detail.** A tab strip needs several editors alive at once, either kept mounted (hidden) or restored from saved state, plus a registry of open items that survives route changes. Today: (1) only one editor exists, the one for the current route. Switching items unmounts it and loses undo history, scroll and selection (Tiptap and the diagram UndoStack are component-local). (2) If two editor instances were kept mounted, every window Ctrl+S handler would fire, and hidden tabs would also catch the global shortcut. (3) Two useEditableItem instances for the same id would conflict with each other, because each tracks its own version.current. (4) Editor pages render their own header (EditorFrame.tsx:53-74) instead of a shared chrome, so a tab bar has no obvious place. Positive: useEditableItem already isolates per-item state and flushes on unmount, so it can back each tab.

**Verifier.** Editor routes sit outside AppShell (App.tsx:21-22). DocumentPage.tsx:9-11 remounts through a generation key, and :17-26 adds a window keydown listener for Ctrl/Cmd+S; DiagramPage does the same. With the words document/diagram normalised, the two files differ only by one comment line (diff). EditorFrame.tsx:53 renders its own <header>. The finding's gaps and the positive point all match the code.

**Recommendation.** Add an OpenItemsProvider above the router: a map from kind:id to a single useEditableItem-style controller, so one controller exists per item however many views show it. Add a workspace layout route that renders a tab bar and keeps the N most recent editors mounted with `hidden`. Keep #/documents/:id and #/diagrams/:id as the URL of the active tab, so links still work. Move Ctrl+S into a shortcut manager scoped to the active tab (it also feeds Settings > Keyboard Shortcuts). Merge DocumentPage and DiagramPage into one generic EditorPage driven by the module registry from ARCH-4.

### ARCH-8 — Ribbon readiness: the Document toolbar is one monolithic component; the export menu is inline in the editor

*medium · partial · verdict: corrected*

**Evidence.** packages/document-studio/src/ui/Toolbar.tsx is 423 lines; one exported Toolbar (line 142) with props editor, mode, onModeChange, onInsertImage, onToggleFind, onPageSetup, spellcheck, onToggleSpellcheck, exportMenu (lines 130-142); DocumentEditor.tsx:80-128 defines keyboard handling and the Export menu inline; packages/diagram-studio/src/DiagramEditor.tsx is 551 lines with keyboard handling at :325-342 and export at :344+.

**Detail.** A Home/Insert/Layout/References/Review/View ribbon needs a command layer (id, label, icon, isActive, isEnabled, run) that ribbon buttons, keyboard shortcuts, menus and a command palette can share. Today the commands are written directly in JSX inside Toolbar and DocumentEditor, with no command registry, so each ribbon tab would copy the logic again. The Diagram Studio has its own separate toolbar and shortcut handling, so the two studios cannot share ribbon UI. Tiptap 3 already provides chainable commands, which suits a thin registry. Extra Tiptap extensions for the planned features are needed whatever the UI. Pagination, footnotes and comments are offered as paid 'Pro' extensions by Tiptap, so they would need to be built in-house to meet the free/open-source rule. That last point comes from general knowledge, not verified here; check tiptap.dev before planning.

**Verifier.** Toolbar.tsx is 423 lines, and the Toolbar export with its listed props is at lines 130-142. DocumentEditor has inline keydown handling at about :81 and DiagramEditor at :325-342, with export at :344+, as cited. The Tiptap licensing claim is only partly right. Verified as paid: Tiptap Pages, which is installed from Tiptap's private registry and needs a trial or subscription (https://tiptap.dev/docs/pages/getting-started/install.md), and Comments, which is a paid-tier feature (https://tiptap.dev/pricing.md). Footnotes: no official public npm package exists (`npm view @tiptap/extension-footnotes` returns E404), so it has to be built in-house or taken from the community. Not in the auditor's text but important: several former Pro extensions are now MIT on public npm. `npm view` shows @tiptap/extension-mathematics@3.33.1, extension-table-of-contents, extension-unique-id and extension-drag-handle all licensed 'MIT'. Equations and a table of contents can therefore use free official extensions. MIT community pagination extensions also exist, such as tiptap-extension-pagination, but their quality is unverified.

**Recommendation.** Before building the ribbon, pull the existing toolbar actions out into a typed command registry inside document-studio (and later diagram-studio). Put a generic Ribbon/RibbonTab/RibbonGroup/SplitButton in @dcos/ui driven by those commands. Keep the current Toolbar as the 'simple' mode on the same commands (EditorMode already exists in document-studio/src/types.ts) so existing users keep their layout.

### ARCH-9 — No code-splitting: both editors and jsPDF/html2canvas are in a 1.32 MB entry chunk

*medium · risk · verdict: corrected*

**Evidence.** apps/web/src/App.tsx:3-7 eagerly imports Dashboard, DiagramPage, DocumentPage, FilesPage, SettingsPage; grep for 'lazy(' / 'Suspense' in apps/web/src and packages/*/src found nothing; ls -la apps/web/dist/assets largest files: index-CLt87uow.js 1,321,062 bytes, jspdf.es.min 398,935, html2canvas 199,398, index.es 151,418; apps/web/vite.config.ts:35 chunkSizeWarningLimit: 1500 (raised to silence the warning); vite.config.ts:27 PWA maximumFileSizeToCacheInBytes 6 MB.

**Detail.** Dashboard and file lists load all of Tiptap and React Flow before first paint. Every planned module (presentations/PPTX, PDF Studio with pdf.js, notebook, Yjs) would add to the same chunk if nothing changes, and the raised warning limit hides the growth. The dist/ listing is from the existing build output on disk; I did not rebuild.

**Verifier.** The entry chunk index-CLt87uow.js is 1,321,062 bytes. App.tsx:3-7 imports every page eagerly, and there is no React.lazy or Suspense. chunkSizeWarningLimit is 1500 (vite.config.ts:35). The dist output is current: no source file is newer than the built chunk. The title is wrong that jsPDF and html2canvas are in the entry chunk. packages/diagram-studio/src/export.ts:54 loads jsPDF with a dynamic `await import('jspdf')`, so jspdf.es.min (398,935 B), html2canvas (199,398 B), index.es (151,418 B) and purify.es are separate lazy chunks. dist/index.html loads only index-CLt87uow.js and has 0 modulepreload links. So there is no route-level splitting (both editors, Tiptap and React Flow are in the entry chunk), but one dynamic split already exists. Medium severity still fits.

**Recommendation.** Load each module's routes with React.lazy plus Suspense from the module registry (ARCH-4). Keep jsPDF/html2canvas as dynamic imports (they already appear as separate chunks). Lower chunkSizeWarningLimit back toward the default and add a size check (vite build output, or the free size-limit package) to CI (.github/workflows/ci.yml) so growth is visible. Make sure the PWA precache still includes lazy chunks so offline use keeps working.

### ARCH-10 — Design tokens live in the app, not the design system; diagram canvas ignores dark mode

*low · partial · verdict: corrected*

**Evidence.** Tokens: apps/web/src/index.css:11-61 (--dc-* light/dark and the @theme inline mapping); packages/ui has no CSS (index.ts exports only components, theme, toast, download); packages/ui/src/theme.tsx:40-44 toggles the .dark class on <html> in a useEffect; packages/diagram-studio/src/diagramCss.ts:3,19-29 hard-coded #f8f8fa canvas and #6366f1 handles, with no 'dark' rule in diagramCss.ts or DiagramEditor.tsx (grep); packages/document-studio/src/contentCss.ts:10-45 hard-coded colours (intentional for white 'paper'); vite.config.ts:19-20 theme_color/background_color duplicate the token hex values.

**Detail.** @dcos/ui components rely on Tailwind utilities (bg-surface, text-muted) that only work because apps/web defines the tokens. Any other host, such as a future Storybook, a desktop-only window or a test harness, must copy index.css. The diagram canvas stays light inside a dark app shell. That may be intentional (diagram as paper), but it is not documented, so I am not certain it is a bug. The theme class is applied after first render, so a dark-mode user may see a light flash on load. This is likely but I did not observe it.

**Verifier.** The tokens are in apps/web/src/index.css; packages/ui/src/index.ts exports only components, theme, toast and download, with no CSS. theme.tsx:40-44 toggles .dark in a useEffect. diagramCss.ts hard-codes #f8f8fa and #6366f1. vite.config.ts:19-20 duplicates the hex values. Two details are wrong. (1) The light canvas IS documented: diagramCss.ts:1 says 'The canvas is always light "paper" so diagrams look the same when exported.' It is intentional, not undocumented. (2) The 'light flash on load' risk is already handled. apps/web/index.html has an inline pre-paint script that reads localStorage 'dcos.theme' and adds the 'dark' class before React mounts, with a comment saying it avoids a light flash. What remains valid is that @dcos/ui cannot work without the app's index.css. Low severity at most.

**Recommendation.** Move the --dc-* tokens and @theme mapping into packages/ui (for example packages/ui/src/tokens.css) and import them from apps/web. Express diagram-studio and document-studio chrome colours as tokens, and keep 'paper' colours as explicit paper tokens. Set the theme class from a small inline script in index.html before React mounts. Appearance settings (target SETTINGS > Appearance) can then grow to include accent and density by editing tokens in one place.

### ARCH-11 — Duplicated page and editor code will multiply with each module

*low · risk · verdict: corrected*

**Evidence.** apps/web/src/pages/DocumentPage.tsx (46 lines) and DiagramPage.tsx (45 lines) are line-for-line the same apart from kind and editor component; EditorFrame.tsx:111-153 VersionHistory and MissingItem (:155-165) carry kind-specific route strings; FilesPage.tsx handles three different screens (documents, diagrams, trash) through flags.

**Detail.** With 4 to 6 more editors planned (presentation, notebook, assignment, pdf), this copy-paste pattern would produce about six near-identical page wrappers, each with its own Ctrl+S listener and remount trick. FilesPage serving both the per-kind lists and Trash (with a dummy kind) will become harder to maintain as File Manager, Recent and Favorites arrive.

**Verifier.** DocumentPage (46 lines) and DiagramPage (45 lines) are identical apart from kind, editor and one comment (confirmed by diff). FilesPage handles three screens. The claim that VersionHistory (EditorFrame.tsx:111-153) carries kind-specific route strings is wrong: it is kind-generic and only passes `kind` to storage.listVersions and restoreVersion. The kind-specific route strings are at EditorFrame.tsx:49 (back link), :87 (`/${kind}s/${copy.id}`) and :160 (MissingItem).

**Recommendation.** Replace the per-kind pages with one generic EditorPage({module}) and one generic ItemListPage({filter}) for Documents, Diagrams, File Manager, Recent, Favorites and Trash, driven by the module registry and an adapter-level query (kinds, trashed, favorite, sort, limit). Keep the existing URLs pointing at the generic components.

### ARCH-3 — Catch-all redirect and header title break when routes grow

*low · risk · verdict: confirmed*

**Evidence.** apps/web/src/App.tsx:23 `<Route path="*" element={<Navigate to="/" replace />} />`; apps/web/src/components/AppShell.tsx:146 `const title = pathname === '/' ? 'Dashboard' : pathname.slice(1).replace(/^\w/, (c) => c.toUpperCase());`

**Detail.** 1) Any URL the build does not know, such as a link to a future route opened in an older cached PWA build (registerType 'autoUpdate', vite.config.ts:13), is silently replaced with '/'. The user loses the link with no message. 2) The page title is built from the raw pathname, so #/settings/storage would show 'Settings/storage' and #/files/recent would show 'Files/recent'. Nav items, labels and icons are also hard-coded arrays in AppShell (lines 29-43, 87-100), separate from the route table in App.tsx, so they can drift apart.

**Verifier.** Re-checked the cited lines: App.tsx:23 has `<Route path="*" element={<Navigate to="/" replace />} />` and AppShell.tsx:146 builds the title with `pathname.slice(1).replace(/^\w/...)`, so #/settings/storage would show 'Settings/storage'. vite.config.ts:13 has registerType 'autoUpdate'. The nav arrays are separate from the route table. Low severity is appropriate.

**Recommendation.** Replace the redirect with a NotFound page that shows the requested path and a link home, so old links still give the user something useful. Drive the sidebar sections (WORKSPACE/ACADEMIC/MANAGEMENT/SETTINGS), page titles and routes from one typed route/nav registry (path, label, icon, section, element). Use the registry's label for the header title instead of the pathname.

### ARCH-1 — Workspace layout and dependency direction are clean (one-way, no cycles)

*info · works · verdict: confirmed*

**Evidence.** package.json workspaces = apps/web, packages/ui, packages/local-storage, packages/document-studio, packages/diagram-studio; apps/web/package.json depends on all four @dcos/*; packages/document-studio/package.json and packages/diagram-studio/package.json depend only on @dcos/ui; grep of "from '@dcos/...'" across packages/*/src returns only '@dcos/ui' (7 imports), and no package imports @dcos/local-storage. Placeholder packages (notebook, assignments, classroom, presentation-studio, pdf-studio, sync-engine) contain only README.md and are not workspaces. Packages are consumed as TypeScript source ("main": "./src/index.ts"), and Tailwind scans them via apps/web/src/index.css:6 (@source '../../../packages').

**Detail.** Dependency direction: app -> {studios, local-storage, ui}; studios -> ui; local-storage -> idb only. Editors are storage-agnostic: they get initialContent and emit onChange (DocumentEditor.tsx:16-21). This is the right base for growing one module per package. One root tsconfig.json covers apps/web/src and packages/*/src, with no per-package tsconfig or project references. Packages have no build step, so they can only be used by a bundler that compiles TS (Vite) and Tailwind must scan their source.

**Verifier.** Checked root package.json: the workspaces are exactly the 5 listed. apps/web/package.json:12-15 depends on all four @dcos/* packages. The two studios depend on @dcos/ui only, and local-storage depends on idb only. A grep for imports from '@dcos' across packages/*/src returns 7 imports, all from '@dcos/ui'. The six placeholder directories each contain only README.md. index.css:6 has `@source '../../../packages'`. tsconfig.json is a single root config including apps/web/src and packages/*/src, with no project references.

**Recommendation.** Keep the rule that feature packages depend only on @dcos/ui (and future shared packages such as @dcos/core-types), never on local-storage or apps/web. Add a lint rule (eslint-plugin-boundaries or a dependency-cruiser config, both free) so the rule is enforced as packages grow from 5 to 11+. Turn each placeholder into a real workspace only when its first real feature lands, to avoid empty packages.

### ARCH-12 — Native shells point at the web build; hash routing and relative base suit them, but the storage choice is not wired

*info · info · verdict: confirmed*

**Evidence.** apps/desktop/src-tauri/tauri.conf.json:8,10 devUrl http://localhost:5173, frontendDist ../../web/dist; apps/android/capacitor.config.json:4 webDir ../web/dist; App.tsx:9-12 HashRouter with a comment about file://, tauri://, capacitor://; vite.config.ts:8 base './'. Neither shell has been built (per the task brief; no Rust toolchain on this machine).

**Detail.** The single-web-bundle approach is sound and keeps routes identical on every platform, so existing hash URLs and IDs carry over. Nothing in apps/web detects the platform yet, and the IndexedDB adapter is fixed in place (ARCH-6). The PWA service worker (vite.config.ts:12-30) would also register inside Tauri/Capacitor webviews unless disabled. That is unverified, because the shells were never built.

**Verifier.** tauri.conf.json:8 devUrl is http://localhost:5173 and :10 frontendDist is ../../web/dist (from src-tauri this resolves to apps/web/dist). capacitor.config.json:4 webDir is ../web/dist. HashRouter at App.tsx:9-12, base './' at vite.config.ts:8. A grep for platform detection (isTauri, Capacitor) in apps/web/src finds only the App.tsx comment. The service-worker-in-webview concern is correctly marked as unverified.

**Recommendation.** Add a platform module (isTauri/isCapacitor via the free official @tauri-apps/api and @capacitor/core) that main.tsx uses to pick the storage adapter and skip service-worker registration in native shells. Check this when 0.8 starts, with a real build on a machine that has Rust installed.

### Found by the verifier (missed by the auditor)

- Schema migrations and the autoUpdate PWA can clash, and the app has no recovery path. IndexedDbAdapter's constructor (packages/local-storage/src/indexeddb.ts:68-78) calls openDB(dbName, SCHEMA_VERSION, ...) and handles only `upgrade` and `blocking`. It has no `blocked` handler, and nothing catches a rejected dbPromise. Releases 0.5 and 0.7 must bump SCHEMA_VERSION to add stores. When that happens, any older bundle still running or cached (registerType 'autoUpdate', vite.config.ts:13; workbox precache) that opens the same database with version 1 will get a VersionError, and every storage call will reject. Separately, the `blocking()` handler calls location.reload() as soon as a newer tab asks to upgrade (indexeddb.ts:73-76). It does not first flush the 600 ms pending autosave or close the connection, so the last edits in the old tab could be lost. The data-loss part comes from reading the code, not from a test. This directly affects the owner's 'incremental migrations, preserve data' requirement. Severity: medium-high.
- Backup and restore cannot express everything the roadmap needs. BackupFile is {items, versions} with one schemaVersion (DATABASE.md around line 28; indexeddb.ts:254-261). validateBackup rejects any file whose schemaVersion is greater than SCHEMA_VERSION (indexeddb.ts:335). It also rejects any item whose kind is not 'document' or 'diagram' (:339-343). So once new kinds exist, a backup from a newer app cannot be partly imported into an older one. Embedded assets have no separate section either (images are inline base64; see ARCH-6). Backup is described as the only bridge from IndexedDB to SQLite, so the format needs versioned, per-kind sections before 0.5.
- Auto-snapshot cost compounds with inline images. Snapshots are rate-limited to one every 10 minutes (AUTO_SNAPSHOT_INTERVAL_MS, indexeddb.ts:21). Each one, though, stores the full content with base64 images via structuredClone (indexeddb.ts:234), up to 50 per item. Combined with list() calling getAll on the whole item store (ARCH-6), one image-heavy document can make every dashboard load slow. That is a scaling issue for the planned image text-wrap and PDF features. This is inferred from the code; nothing was measured.
- requestPersistentStorage() (apps/web/src/lib/storage.ts:31-39) keeps a module-level `persistRequested` flag. After one refusal in a session it returns false without asking again, and nothing calls it at app start (main.tsx, App.tsx). This compounds incident S-1, and ARCH-5 only touched on it. Imports (SettingsPage restore) and duplicates do not request persistence either; only NewItemDialog.tsx:32 and the Settings button at SettingsPage.tsx:100 do.

## Functionality inventory

I read every UI source file in apps/web/src, packages/document-studio/src, packages/diagram-studio/src, packages/ui/src and packages/local-storage/src, checked them against tests/acceptance/CHECKLIST.md, and re-ran Vitest (37/37 pass, 3 files: diagram logic, IndexedDB adapter, DOCX/print/text export; no component or browser tests). Everything on the owner's must-preserve list exists and basically works: Dashboard, navigation, document creation/editing, diagram creation, flowchart and tree editors, local persistence with autosave, recent work, favorites, trash/restore/purge, theme preference, exports, and stable UUID document/diagram IDs. Most features have narrow limits, though. The document 'page' is one growing sheet: it shows the header once and a 'Page 1' footer once, there is no real pagination, and page breaks are dashed markers. PDF export is the browser print dialog, and the header/footer margin boxes rely on Chromium 131+. DOCX export is unvalidated in Word and has no import; ODT is not supported at all. The diagram editor has 12 shapes, 4 fixed connection handles per shape, alignment but no distribute, and no groups, rotation, layers, lock, z-order or numeric geometry. Its PDF is a raster image and its SVG uses foreignObject. Undo history in both editors is in memory only. Some bugs and misleading UI: favoriting, trashing and restoring all bump updatedAt and version, which reorders Recent work, shows 'Edited just now' and can raise a conflict in another open tab. Panning or zooming a diagram also counts as an edit. The Link button advertises a Ctrl+K shortcut that does not exist. The sidebar 'Coming next' section shows five non-functional module entries, which breaks the owner's no-placeholder rule. Theme preference is stored only in localStorage, and persistent storage is requested only when an item is created or from Settings, which fits incident S-1. The roadmap features (ribbon, multi-page, tabs, comments, footnotes, citations, equations, styles, ODT, DOCX import, UML/ER/BPMN, groups and so on) are all absent from the code.

| ID | Severity | Status | Finding | Verdict |
|---|---|---|---|---|
| FUNC-29 | high | partial | Local persistence and autosave (must preserve) | confirmed |
| FUNC-10 | medium | partial | Document 'pages' are a single tall sheet: no real pagination | confirmed |
| FUNC-17 | medium | partial | DOCX export (no import, no ODT) | confirmed |
| FUNC-18 | medium | partial | Document PDF export via the browser print dialog | confirmed |
| FUNC-2 | medium | bug | Sidebar 'Coming next' entries are non-functional placeholder UI | confirmed |
| FUNC-36 | medium | risk | Automated coverage of user-visible features is limited to pure logic | confirmed |
| FUNC-4 | medium | bug | Favorite / trash / restore bump updatedAt and version (misleading 'Edited just now', recents reorder, cross-tab conflicts) | confirmed |
| FUNC-11 | low | partial | Page setup (size, orientation, margins, header/footer, page numbers) | confirmed |
| FUNC-12 | low | partial | Images in documents | confirmed |
| FUNC-14 | low | partial | Table of contents | confirmed |
| FUNC-15 | low | partial | Find and replace | confirmed |
| FUNC-22 | low | partial | Diagram editor core (shapes, connectors, inspector, canvas) | confirmed |
| FUNC-24 | low | works | Tree diagram editor (must preserve) | confirmed |
| FUNC-26 | low | partial | Undo/redo is in-memory only; arrow-key moves likely not undoable | confirmed |
| FUNC-27 | low | partial | Diagram exports: PNG, SVG, PDF (must preserve) | confirmed |
| FUNC-28 | low | partial | Diagram viewport/pan counts as an edit; canvas always light | confirmed |
| FUNC-30 | low | partial | Version history | confirmed |
| FUNC-31 | low | works | Backup export / restore (Settings) | unverifiable |
| FUNC-32 | low | works | Theme preferences (must preserve) | confirmed |
| FUNC-34 | low | partial | Offline / PWA behaviour | confirmed |
| FUNC-5 | low | partial | Documents / Diagrams list pages | confirmed |
| FUNC-6 | low | partial | Trash and restore (must preserve) | confirmed |
| FUNC-8 | low | partial | Document editing toolbar (Simple / Advanced modes) | corrected |
| FUNC-9 | low | bug | Link button advertises a Ctrl+K shortcut that does not exist | confirmed |
| FUNC-1 | info | works | Navigation and routes (must preserve) | confirmed |
| FUNC-13 | info | works | Tables | confirmed |
| FUNC-16 | info | works | Word count, spell check, status bar | confirmed |
| FUNC-19 | info | works | Plain-text export | confirmed |
| FUNC-20 | info | missing | Release 0.3 Document Studio features are entirely absent | confirmed |
| FUNC-21 | info | works | Diagram creation and templates (must preserve) | confirmed |
| FUNC-23 | info | works | Flowchart editor (must preserve) | confirmed |
| FUNC-25 | info | missing | Diagram features from the 0.4 plan are absent (groups, rotation, layers, lock, z-order, distribute, numeric geometry) | confirmed |
| FUNC-3 | info | works | Dashboard (must preserve) | confirmed |
| FUNC-33 | info | works | Document and diagram IDs (must preserve) | confirmed |
| FUNC-35 | info | works | Settings page (storage info) | confirmed |
| FUNC-37 | info | missing | Desktop and Android apps do not exist as runnable products | confirmed |
| FUNC-7 | info | works | Document creation and templates (must preserve) | confirmed |

### FUNC-29 — Local persistence and autosave (must preserve)

*high · partial · verdict: confirmed*

**Evidence.** apps/web/src/lib/storage.ts:5 (IndexedDbAdapter), :31-39 (requestPersistentStorage), :53 (600 ms debounce), :90-129 (optimistic concurrency, conflict blocking), :183-194 (flush on visibilitychange/pagehide/unmount); apps/web/src/components/NewItemDialog.tsx:32 (persist requested only on create); apps/web/src/pages/SettingsPage.tsx:96-106 (manual 'Make storage persistent'); packages/local-storage/src/indexeddb.ts:44-52 (one migration), :146-181; known incident S-1

**Detail.** Edits autosave to IndexedDB (database 'digital-classroom-os', stores documents, diagrams, *_versions and meta) after 600 ms of inactivity, and pending edits are flushed when the page is hidden or the editor closes. Writes are transactional with version checks. A stale write shows a conflict banner offering 'Keep my edits as a copy' or 'Discard mine, load latest'. Ctrl/Cmd+S forces a save plus a version snapshot. Limitations: persistence relies on browser storage that can be evicted. navigator.storage.persist() is requested only when an item is created, at most once per page load (persistRequested flag), or when the user clicks the button in Settings. Opening the app or editing existing items never requests it. This is consistent with incident S-1, where IndexedDB and localStorage were empty after a restart while persisted() was false. Nothing warns the user when storage is not persistent outside Settings. The pagehide flush is async IndexedDB work and may not finish when a tab closes. The checklist marks offline persistence and offline editing 🟡 (airplane-mode test not done).

**Verifier.** storage.ts:31-39 uses a module-level persistRequested flag. NewItemDialog.tsx:32 is the only automatic call site. grep shows no call at app start. :53 is the 600 ms debounce. :183-194 flushes on visibilitychange, pagehide and unmount, with async IndexedDB work that is not awaited. This fits incident S-1. High severity is justified given the data loss that already happened.

**Recommendation.** Request persistence at startup and show a visible warning on the Dashboard while persisted() is false. Prompt for or schedule backups. Make S-1 a release blocker for any migration work, since migrations need the data to be there.

### FUNC-10 — Document 'pages' are a single tall sheet: no real pagination

*medium · partial · verdict: confirmed*

**Evidence.** packages/document-studio/src/DocumentEditor.tsx:144 (footerPreview = footer + 'Page 1'), :176-180 (one .dcos-paper containing header, EditorContent, footer), :212-232 (min-height: var(--paper-h); header/footer absolutely positioned at top/bottom of the whole sheet), :233-236 (<640px: fixed 28px 20px padding, margins ignored); packages/document-studio/src/contentCss.ts:44-45 (page break = dashed line labelled 'Page break')

**Detail.** The editor draws one white sheet whose minimum height is one page and which grows as text is added. The header appears once at the top. The footer, with a static 'Page 1', appears once at the bottom of the whole sheet, however long it is. Page breaks are dashed 'PAGE BREAK' markers, not new sheets. There is no page count, rulers, section breaks, columns, different first page, or per-section orientation. On phone widths the page margins are replaced by fixed padding. Real pagination happens only in print/PDF (FUNC-18) and in Word after DOCX export.

**Verifier.** DocumentEditor.tsx:144 footerPreview uses a static 'Page 1'. :176-180 renders one .dcos-paper. pageCss :212-232 uses min-height var(--paper-h) with absolutely positioned header and footer. :233-236 replaces margins with fixed 28px 20px padding on narrow screens. contentCss.ts:44-45 draws the page break as a dashed line with a 'Page break' label.

**Recommendation.** Treat true multi-page layout (0.3) as new work, not a fix. Keep the existing PageSettings shape (types.ts:7-15) and add section data with an incremental schemaVersion bump.

### FUNC-17 — DOCX export (no import, no ODT)

*medium · partial · verdict: confirmed*

**Evidence.** packages/document-studio/src/export/docx.ts:150-155 (non-data-URL or WebP/SVG image -> '[Image: …]' placeholder text), :162-171 (images always centred), :175-196 (list item paragraphs drop textAlign), :218 (tables fixed 100% width), :279-284 (static TOC), :315-363 (single section, Calibri 12 pt default); tests/acceptance/CHECKLIST.md:16 ('Not yet opened in Microsoft Word'); grep -ri 'odt\|mammoth\|import' packages/document-studio/src -> no importer

**Detail.** DOCX export uses the 'docx' library and covers headings, paragraph alignment, bold/italic/underline/strike/sub/sup, colour, highlight, font and size, links, nested lists, blockquotes, code blocks, horizontal rules, tables with merged cells, data-URL images, page breaks, page size, orientation, margins, a text header and a footer with Page X of Y. Limitations: the files have never been opened in Microsoft Word or LibreOffice (checklist). Images whose src is a URL rather than an embedded data URL, which can come from pasted HTML, become italic placeholder text. Image alignment, table column widths and list-item alignment are lost. The TOC is static text. Headings use docx's built-in heading styles, not the editor's look. There is no DOCX import and no ODT import or export anywhere in the code.

**Verifier.** dataUrlToBytes (docx.ts:62-70) accepts only png, jpeg, gif and bmp data URLs, so other sources become '[Image: …]' italic placeholders (docx.ts:150-155). WebP inserted through the app is already converted to PNG, so in practice the placeholder affects pasted or remote URL images and SVG. Images are centred (:162-171), list paragraphs have no alignment (:184-189), and tables are 100% width (:218). I found no importer and no ODT code.

**Recommendation.** Before 0.3, build a fixture corpus of real Word and LibreOffice files and validate round-trips by hand. Add import as a new feature (for example mammoth for DOCX and a free ODT library), checking licences.

### FUNC-18 — Document PDF export via the browser print dialog

*medium · partial · verdict: confirmed*

**Evidence.** packages/document-studio/src/export/print.ts:20-41 (@page size/margins, @top-center/@bottom-center margin boxes with counter(page)/counter(pages)), :43-47 ('Header/footer margin boxes need Chromium 131+'), :48-85 (hidden iframe + win.print(), temporarily sets document.title for filename); DocumentEditor.tsx:88-91,106-111 (Export > PDF and Ctrl+P); CHECKLIST.md:17

**Detail.** 'PDF' opens the system print dialog with a generated print page, and the user has to choose 'Save as PDF' themselves; no file is generated directly. Pagination, header/footer and 'Page X of Y' all depend on the browser's support for @page margin boxes. The code says these need Chromium 131+; the checklist says Safari and Firefox were not tested, so header/footer there are unverified. The result also depends on the user's print-dialog settings (scale, the browser's own headers and footers). It has not been verified inside the Tauri WKWebView or the Capacitor Android WebView, and print support there is uncertain. Ctrl+P is only caught when focus is inside the editor area.

**Verifier.** print.ts:31-36 uses @page with @top-center and @bottom-center margin boxes and counter(page)/counter(pages). The comment at :43-47 says 'need Chromium 131+', which matches Chrome 131 shipping @page margin boxes. :48-85 uses a hidden iframe, win.print(), and a temporary document.title swap. Ctrl+P is handled only on the editor wrapper (DocumentEditor.tsx:88-91).

**Recommendation.** Keep the print path as the web fallback. For native shells and real PDF files, plan a separate renderer (for example a Tauri-side print to PDF, or the paged.js polyfill) and verify it on each target.

### FUNC-2 — Sidebar 'Coming next' entries are non-functional placeholder UI

*medium · bug · verdict: confirmed*

**Evidence.** apps/web/src/components/AppShell.tsx:36-43 (upcoming: Notebook P2, Assignments P2, Classroom P3, Presentations P4, PDF Studio P4), :76-85 (rendered as aria-disabled <div> with phase badge); apps/web/src/pages/SettingsPage.tsx:126 ('0.1.0 · Phase 1 foundation') vs git commit 'Baseline v0.1.0: Phase 0 foundation'

**Detail.** Five greyed-out module entries with 'P2'–'P4' badges look like navigation but do nothing. They are divs, not links, and are not focusable. The owner's 'no fake/placeholder features' rule forbids this. Their phase numbers (P2–P4) also don't match the owner's release plan (Presentations 0.5; Notebook, Assignments, Classroom and PDF Studio 0.7). Separately, Settings says 'Phase 1 foundation' while the baseline commit says 'Phase 0 foundation'. The placeholder READMEs in packages/{notebook,assignments,classroom,presentation-studio,pdf-studio,sync-engine} have no UI.

**Verifier.** AppShell.tsx:36-43 defines the upcoming list with phases 2/2/3/4/4. Lines 76-85 render each entry as an aria-disabled <div> with a 'P{phase}' badge: no link and no tabIndex. The code comment at line 36 says they are 'not yet built'. SettingsPage.tsx:126 reads '0.1.0 · Phase 1 foundation', while commit 20d3f4d says 'Phase 0 foundation'. Medium severity is reasonable given the owner's no-placeholder rule.

**Recommendation.** Remove the 'Coming next' block, or move it to a roadmap/about text that does not look like navigation. Add each nav entry only when its route and module actually work. Align the version label in Settings with package.json and the release naming.

### FUNC-36 — Automated coverage of user-visible features is limited to pure logic

*medium · risk · verdict: confirmed*

**Evidence.** npx vitest run -> 'Test Files 3 passed (3), Tests 37 passed (37)'; tests in packages/diagram-studio/src/diagram.test.ts, packages/local-storage/src/indexeddb.test.ts, packages/document-studio/src/export/docx.test.ts; tests/integration/.gitkeep, tests/unit/.gitkeep empty; CHECKLIST.md:47 ('automated browser tests not yet added')

**Detail.** Every UI feature in this inventory (dashboard, file lists, trash, editors, toolbar commands, find/replace, inspector, exports through the UI, theme, backup UI, conflict banner) is verified only by hand in Chromium, according to the checklist. The automated tests cover storage, diagram serialization/layout/undo, and building DOCX, print and text output.

**Verifier.** I re-ran npx vitest run: 'Test Files 3 passed (3), Tests 37 passed (37)'. There are no component or browser tests.

**Recommendation.** Before the large 0.3/0.4 refactors, add browser end-to-end tests (Playwright, free) for the must-preserve list: create, edit, reload, favorite, trash, restore, theme and each export. Also add fixture tests showing that v0.1.0 documents and diagrams load unchanged.

### FUNC-4 — Favorite / trash / restore bump updatedAt and version (misleading 'Edited just now', recents reorder, cross-tab conflicts)

*medium · bug · verdict: confirmed*

**Evidence.** apps/web/src/components/ItemRow.tsx:24-28 (toggleFavorite calls storage.save(kind,id,{favorite},full.version)); packages/local-storage/src/indexeddb.ts:163-170 (save always sets version+1 and updatedAt: now), :197-203 (setDeleted also bumps version and updatedAt); apps/web/src/components/ItemRow.tsx:38 ('Edited <relativeTime(updatedAt)>'); apps/web/src/lib/storage.ts:157-161 (stale version -> ConflictError -> conflict banner)

**Detail.** Starring or unstarring an item writes a full save. That moves the item to the top of Recent work and makes its row read 'Edited just now' even though nothing was edited. Trash and restore do the same, so a restored item shows as freshly edited. Each of these actions also increments the item's version. If the same item is open in an editor in another tab or window, that editor's next autosave fails with ConflictError and shows the 'changed in another window' banner, even though only metadata changed. The trash list itself sorts by deletedAt, so it is not affected.

**Verifier.** ItemRow.tsx:24-28 calls storage.save(kind,id,{favorite},full.version). indexeddb.ts:163-170 always sets version+1 and updatedAt=now. setDeleted at :197-203 also bumps both. useEditableItem keeps version.current (storage.ts:103-104), and a mismatch throws ConflictError (indexeddb.ts:157-160), which blocks autosave and shows the conflict UI (storage.ts:111-116). FilesPage.tsx:29 sorts trash by deletedAt, as stated. One related detail: Ctrl+S with no pending edits also bumps version and updatedAt, because flush calls save with patch {} and snapshot:true (storage.ts:98,103).

**Recommendation.** Store metadata (favorite, deletedAt) without touching content version or updatedAt, either with a separate metaVersion or by excluding these fields from the concurrency check. Display a content-modified timestamp. Cover it with a unit test in indexeddb.test.ts.

### FUNC-11 — Page setup (size, orientation, margins, header/footer, page numbers)

*low · partial · verdict: confirmed*

**Evidence.** packages/document-studio/src/ui/PageSetupDialog.tsx:5-10 (4 margin presets), :12 (margins clamped 0–80 mm), :44-55 (A4/Letter, portrait/landscape), :78-89 (plain-text header, footer, page-number checkbox); packages/document-studio/src/types.ts:3,26-29

**Detail.** The dialog applies to the editor, print/PDF and DOCX. Limitations: only A4 and Letter (no A5, Legal or custom). Header and footer are one centred plain-text string each, with no formatting, images, alignment, odd/even or first-page variants. Page numbers can only be 'Page X of Y' at bottom centre. These settings are saved in the document and survive reload.

**Verifier.** I did not open every line of PageSetupDialog. The page-number output matches print.ts:26 ('Page X of Y' only, in @bottom-center at :35), and the header and footer are single centred strings (print.ts:34-35, DocumentEditor pageCss :229). The claims are consistent with the code I checked.

**Recommendation.** Keep the PageSettings fields and their defaults (DEFAULT_PAGE) for backward compatibility. Add richer header/footer content as new optional fields.

### FUNC-12 — Images in documents

*low · partial · verdict: confirmed*

**Evidence.** packages/document-studio/src/DocumentEditor.tsx:66-77,165-175,193-203 (insert via button or drag-drop; accept png/jpeg/gif/webp); packages/document-studio/src/image.ts:1-4,27-43 (15 MB cap, downscale >1600 px, WebP -> PNG, 520 px default width); packages/document-studio/src/extensions/index.ts:26 (base64 allowed, resizable with aspect lock); grep -ri paste packages/document-studio/src -> only a template string

**Detail.** Images can be inserted from a file or by dragging onto the page. They are stored inline as base64 data URLs in the document JSON and can be resized. Limitations: there is no clipboard-paste handler for image files, so pasting a screenshot is not handled by the app. There is no alignment, text wrap, caption, crop, alt-text editor or border control. Images always render centred as blocks (contentCss.ts:37) and export to DOCX as centred inline images (docx.ts:162-171). Large base64 images inflate every saved version, since versions are full copies, up to 50 per item.

**Verifier.** image.ts:1-4,27-43 confirms the 15 MB cap, the 1600 px downscale, WebP re-encoded through a canvas, and the 520 px default width. contentCss.ts:37 sets img to display:block with margin auto, so images are centred. docx.ts:162-171 exports them centred. One extra detail: any GIF larger than 1600 px is re-encoded to a static PNG (image.ts:34-39), which loses animation.

**Recommendation.** For 0.3 image wrapping, add attributes to the existing 'image' node rather than replacing it. Consider moving image bytes to a blob store referenced by ID, with a migration, before collaboration lands.

### FUNC-14 — Table of contents

*low · partial · verdict: confirmed*

**Evidence.** packages/document-studio/src/extensions/tableOfContents.tsx:33-63 (live list of H1–H4, click to jump); export/docx.ts:279-284 (static heading + plain paragraphs); export/text.ts:39-41 (TOC dropped from TXT); contentCss.ts:64 (print styling)

**Detail.** The table of contents is an atom block that updates live from headings, and clicking an entry scrolls to that heading. Limitations: it never shows page numbers, in the editor or in print/PDF. In DOCX it becomes static plain text, not a Word TOC field, so it cannot be updated in Word and has no page numbers or links. It is left out of TXT export entirely.

**Verifier.** docx.ts:279-284 writes a static 'Table of Contents' Heading2 followed by plain indented paragraphs, with no TOC field. collectHeadings in tableOfContents.tsx produces only level, text and pos, with no page numbers.

**Recommendation.** For the 0.3 References tab, emit a real Word TOC field (w:fldSimple TOC) in DOCX. Keep the 'tableOfContents' node name.

### FUNC-15 — Find and replace

*low · partial · verdict: confirmed*

**Evidence.** packages/document-studio/src/extensions/searchReplace.ts:23-50 (matching per textblock, plain substring), :107-129 (replace current / all); ui/FindReplaceBar.tsx:58-61 (Match case only); DocumentEditor.tsx:81-87,147 (Ctrl+F handler is on the editor wrapper div and forces mode 'advanced'); CHECKLIST.md:13

**Detail.** Find highlights every match, shows an n/total counter, steps through matches with Enter or Shift+Enter, and can replace one match or all. It has a match-case option. Limitations: no whole-word or regex matching, and matches cannot cross paragraph boundaries. Ctrl+F is caught only when focus is inside the editor area; elsewhere the browser's own find opens. Opening find switches the document to Advanced mode, and because the mode is saved in the document, this counts as an edit.

**Verifier.** DocumentEditor.tsx:81-87: Ctrl+F calls setMode('advanced'). The effect at :49-55 then emits onChange with the new mode, and updateContent saves it because the serialized content differs (storage.ts:140-144). So opening find from Simple mode is persisted as an edit. The handler sits on the wrapper div (:147).

**Recommendation.** Keep as is. If mode should be a view preference, store it outside the document content in a later schema version.

### FUNC-22 — Diagram editor core (shapes, connectors, inspector, canvas)

*low · partial · verdict: confirmed*

**Evidence.** packages/diagram-studio/src/shapes.tsx:3-16 (12 shapes); DiagramEditor.tsx:158-174 (click/drag to add), :241-258 (duplicate, in-memory copy/paste, delete), :260-283 (align left/centre/right/top/middle/bottom, ≥2 nodes), :325-342 (shortcuts), :429-437 (grid, snap 10 px, fit), :509-526 (loose connections, reconnect, zoom 0.1–4, Controls, MiniMap); ShapeNode.tsx:16-21,63-71 (4 handles t/r/b/l; resizer); Inspector.tsx:51-155

**Detail.** The editor has 12 shapes: Process, Rectangle, Start/End, Decision, Input/Output, Circle, Preparation, Database, Document, Triangle, Sticky note and Text. Shapes are added by click or drag. Connectors are drawn from 4 fixed handles per shape and can be reconnected. Shape text is edited by double-click or F2. The inspector covers fill (12 swatches), border colour, width and dash, text colour, size (11–32 px) and bold. The connector inspector covers type (elbow, square elbow, straight, curved), arrows (end, both, none), width, dash, colour and label. Also present: multi-select, select all, duplicate, delete, alignment, grid, snap and fit-view, zoom controls and a minimap. Limitations: copy/paste lives in an in-memory ref, so it does not use the system clipboard and is lost on navigation. Ctrl+A selects shapes but not connectors. Colours are fixed swatches with no picker. There is no text alignment or font family. Connector labels can only be edited in the inspector, not on the canvas. Connectors can only attach to the 4 side midpoints.

**Verifier.** types.ts:3-15 has 12 ShapeKinds. ShapeNode.tsx:16-21 has 4 handles. The clipboard is a useRef (DiagramEditor.tsx:106,254-257). Ctrl+A selects nodes only (:338). Align needs at least 2 nodes (:260-283). Zoom is 0.1-4 (:516-517). Colours are fixed swatch arrays (Inspector.tsx:5-7).

**Recommendation.** Keep the node type 'shape', the ShapeKind strings and the handle IDs t/r/b/l, since saved edges reference them. Add new shapes as new ShapeKind values.

### FUNC-24 — Tree diagram editor (must preserve)

*low · works · verdict: confirmed*

**Evidence.** packages/diagram-studio/src/DiagramEditor.tsx:181-192 (Arrange menu: Tree TB/LR), :194-239 (Tab = add child, Enter = add sibling, auto re-layout when settings.autoLayout ≠ 'none'), :396-402; layout.ts:24-125 (tidy tree, first parent wins, cycles broken, unconnected nodes untouched); CHECKLIST.md:24

**Detail.** Tab adds a child and Enter adds a sibling. New children copy the style of their siblings, or of the parent for the first child. Arrange can lay the tree out top-to-bottom or left-to-right, and auto-arrange stays on until turned off. Limitations: the layout treats each node as having only its first incoming edge as parent, so it cannot lay out graphs (DAG or network). Re-layout runs only on Arrange or Add child, not after deleting or dragging. Layout rewrites every connected edge's handles to b/t or r/l. There are no radial or grid layouts, and no collapse/expand of subtrees.

**Verifier.** Tab and Enter add a child and a sibling (DiagramEditor.tsx:339-340). The layout semantics were not re-derived line by line, but the cited code exists and the description matches the parent-from-first-edge design. No radial or grid layout exists.

**Recommendation.** Keep as is. Add radial and grid layouts (0.4) as new LayoutDirection values, keeping 'TB' and 'LR' as they are.

### FUNC-26 — Undo/redo is in-memory only; arrow-key moves likely not undoable

*low · partial · verdict: confirmed*

**Evidence.** packages/diagram-studio/src/DiagramEditor.tsx:105 (UndoStack<Snapshot>(150) in a ref), :498 (snapshot only on onNodeDragStart), :518-519; history.ts:5-38; Tiptap undo from StarterKit (extensions/index.ts:18); CHECKLIST.md:26

**Detail.** Diagram undo keeps up to 150 snapshots, and document undo uses Tiptap's history. Both are lost on reload, on navigating away, and on version restore. Diagram snapshots are taken when a drag starts, when shapes are added or deleted, and when the inspector changes something. React Flow moves selected nodes with the arrow keys by default and the editor does not turn that off. Because no snapshot is taken for keyboard moves, they are probably not undoable. This was inferred from the code and not checked in a browser.

**Verifier.** DiagramEditor.tsx:105 is UndoStack(150) in a ref. Snapshots are taken on onNodeDragStart (:498), on onResizeStart (ShapeNode.tsx:68), and on add, delete, align and inspector actions. Keyboard arrow moves in React Flow 12 go through onNodesChange and do not fire onNodeDragStart, so they are very likely not undoable. This was not verified in a browser, so the auditor's hedge is appropriate. A minor extra point: focusing the inspector label input pushes a snapshot even with no change (Inspector.tsx:61,120), which creates empty undo steps.

**Recommendation.** Verify keyboard-move undo in a browser. If it is confirmed, snapshot before keyboard moves, for example by hooking onNodesChange position changes that have no drag.

### FUNC-27 — Diagram exports: PNG, SVG, PDF (must preserve)

*low · partial · verdict: confirmed*

**Evidence.** packages/diagram-studio/src/export.ts:7 (strips handles, minimap, controls, panels), :36-40 (PNG 2×), :42-47 (SVG via html-to-image toSvg, skipFonts), :50-61 (PDF = 3× PNG raster on one page sized to the diagram); DiagramEditor.tsx:345-360,447-451; CHECKLIST.md:28

**Detail.** All three exports produce a download of the whole diagram, with its bounds plus 40 px padding, on a white background, without editing chrome. Limitations: the PDF is a raster image, so its text cannot be selected or searched, and its page size is the diagram's own size, not A4 or Letter. The SVG comes from html-to-image, which wraps the HTML DOM in an SVG foreignObject rather than drawing native vector shapes. Labels are HTML, fonts are skipped, and tools that don't render foreignObject (some editors and office apps) may show the SVG blank or broken; that last point is not verified here. An empty diagram throws 'The diagram is empty'. There is no export of a selection only, no transparent-background option, and no export or import of the editable diagram JSON per item.

**Verifier.** export.ts:7 lists the excluded chrome. :36-40 is PNG at pixelRatio 2. :42-47 uses toSvg with skipFonts; html-to-image's toSvg wraps the DOM in a foreignObject by design. :50-61 builds a single jsPDF page sized to the diagram, containing a PNG at 3x. Each export throws 'The diagram is empty' when there are no nodes.

**Recommendation.** Keep these three menu items. For 0.4, add a native-vector SVG/PDF renderer and an editable project-format export alongside them, without replacing them.

### FUNC-28 — Diagram viewport/pan counts as an edit; canvas always light

*low · partial · verdict: confirmed*

**Evidence.** packages/diagram-studio/src/DiagramEditor.tsx:505-508 (onMoveEnd -> viewport.current = vp; emit()), :119-122; apps/web/src/lib/storage.ts:138-145 (only identical serialized content is skipped); packages/local-storage/src/indexeddb.ts:163-176 (updatedAt bump, auto snapshot when due); DiagramEditor.tsx:522 (colorMode="light")

**Detail.** Diagrams save and reopen with nodes, edges, viewport and settings; this is unit-tested and was verified in the browser. However, viewport is part of the saved content, so simply panning or zooming triggers a save. That updates updatedAt ('Edited just now', reorders Recent) and can create an automatic version snapshot. The diagram canvas is always light even when the app is in dark theme. That is consistent with the white document paper, but it is not themed.

**Verifier.** DiagramEditor.tsx:505-508 sets viewport.current and calls emit() on move end. The viewport is part of the serialized content, so the dedup at storage.ts:140-142 does not catch it. save() then bumps updatedAt, and contentChanged=true can trigger an auto snapshot when one is due (indexeddb.ts:171-176). colorMode='light' at :522.

**Recommendation.** Store viewport outside the versioned content, or exclude it from the change comparison and snapshots, so viewing a diagram is not an edit.

### FUNC-30 — Version history

*low · partial · verdict: confirmed*

**Evidence.** apps/web/src/components/EditorFrame.tsx:67-69,111-153 (dialog: list + Restore); packages/local-storage/src/indexeddb.ts:21 (auto snapshot every 10 min of editing), :23 (max 50 versions), :221-242 (restore keeps a 'restore' version), :314-323 (prune oldest non-create)

**Detail.** Each editor has a version history dialog listing Created, Saved version (Ctrl+S), Autosave snapshot (at most every 10 minutes while editing) and 'Before restore' entries, each with its timestamp and the title at that time. Restoring is itself reversible. Limitations: there is no preview, diff, naming or deletion of versions. Restore replaces the whole item. Each version is a full content copy, so large images multiply storage use. restoreVersion does not prune, so restore entries can push an item past 50 versions until the next save. Undo stacks are cleared by a restore, because the editor remounts.

**Verifier.** indexeddb.ts:21 sets AUTO_SNAPSHOT_INTERVAL_MS to 10 minutes and :23 sets MAX_VERSIONS_PER_ITEM to 50. Prune is called from save (:176). I did not open restoreVersion line by line to confirm that it skips prune.

**Recommendation.** Keep the version records (both version stores) and their reason values. Add preview before restore.

### FUNC-31 — Backup export / restore (Settings)

*low · works · verdict: unverifiable*

**Evidence.** apps/web/src/pages/SettingsPage.tsx:38-55,63-84; packages/local-storage/src/indexeddb.ts:244-299 (all items incl. trashed + all versions; divergent items imported as copies with new UUID and ' (restored)' title), :331-351 (validation); CHECKLIST.md:36

**Detail.** Export backup downloads one JSON file ('classroom-os-backup-YYYY-MM-DD.json') with every document and diagram, including trashed ones, and all their versions. Restore validates the file. It adds items that are missing, skips identical ones, and imports diverged ones as new copies so local work is never overwritten; this is unit-tested. Limitations: backup is manual only, with no reminder or schedule. The theme preference is not included. Diverged items come back under a new ID, so links to the old ID point at the local copy. Restore works on the whole file only, with no selective restore. The file is not encrypted or compressed.

**Verifier.** I did not re-open SettingsPage.tsx:38-84 or indexeddb.ts:244-351 within this pass. The claims are plausible and the auditor says they are unit-tested (the suite passes 37/37), but I did not independently check the details.

**Recommendation.** Keep the 'dcos-backup' format and SCHEMA_VERSION check. Future schema changes must keep importing v1 backups (validateBackup rejects only newer versions).

### FUNC-32 — Theme preferences (must preserve)

*low · works · verdict: confirmed*

**Evidence.** packages/ui/src/theme.tsx:13 (localStorage key 'dcos.theme'), :15-57 (light/dark/system, live system change listener); apps/web/index.html:9-16 (pre-paint script); apps/web/src/components/AppShell.tsx:106-131,171; EditorFrame.tsx:70-72 (md+ only); SettingsPage.tsx:59-61

**Detail.** There are three options (Light, Dark, Match system), available in the app header, in Settings, and in the editor header at medium widths and up. The theme is applied before first paint, and the 'system' option follows OS changes live. Limitations: the preference lives only in localStorage, so it is not part of backups, and it was lost in incident S-1. Document paper and the diagram canvas stay white or light in dark mode by design (contentCss.ts:3, DiagramEditor.tsx:522). Narrow screens have no theme switch inside the editors.

**Verifier.** EditorFrame.tsx:70-72 puts ThemeSwitcher in a 'hidden md:block' wrapper. theme.tsx:51 has a non-fatal localStorage catch. The DiagramEditor colorMode is 'light'. The theme lives in localStorage only and is not part of the IndexedDB backup.

**Recommendation.** Keep the 'dcos.theme' key and its values. Consider mirroring the setting into the IndexedDB meta store so backups include it.

### FUNC-34 — Offline / PWA behaviour

*low · partial · verdict: confirmed*

**Evidence.** apps/web/vite.config.ts:11-30 (VitePWA autoUpdate, workbox precache, navigateFallback; no devOptions -> no service worker on the dev server), :24 (SVG-only icon); apps/web/src/components/AppShell.tsx:133-141 (offline badge); EditorFrame.tsx:10-31; CHECKLIST.md:15,35

**Detail.** Production builds precache the app shell through the service worker and update automatically. An 'Offline' badge and an 'Offline · saved on this device' status appear when navigator.onLine is false. Limitations: the dev server at localhost:5173, where the S-1 data lived, has no service worker. The formal airplane-mode test has not been done (checklist 🟡). There is no in-app install prompt and no update notification ('autoUpdate' swaps silently). The manifest has only an SVG icon, and whether that satisfies every platform's install criteria is not verified here.

**Verifier.** vite.config.ts:12-30 has VitePWA with registerType 'autoUpdate' and no devOptions. Its only icon is icon.svg with purpose 'any maskable' (:23). The offline badge is at AppShell.tsx:133-141, and its text is 'Offline — everything still saves on this device'.

**Recommendation.** Run and record the offline test on a production build ('vite preview'). Add PNG icons if install testing shows they are needed.

### FUNC-5 — Documents / Diagrams list pages

*low · partial · verdict: confirmed*

**Evidence.** apps/web/src/pages/FilesPage.tsx:23-31 (title-only substring search; sort updated/created/title), :60-64 (New button), :88 (ItemRow); apps/web/src/components/ItemRow.tsx:65-75 (menu: Duplicate, Move to trash); packages/local-storage/src/indexeddb.ts:183-187 (duplicate -> '(copy)', favorite reset, new UUID)

**Detail.** Each list page has a search box, a sort selector (Last edited, Date created, Name), a New button and one row per item showing title, edited time and size. Each row has a star button and a menu with Duplicate and Move to trash. Limitations: search matches titles only, not content. There are no folders, tags, courses, bulk selection, grid/thumbnail view, rename from the list (renaming happens only in the editor header), per-file export or file import. The star button is invisible until hover or focus (ItemRow.tsx:54), so it is hard to find on touch devices. Size is the JSON string length of the content, not real bytes (indexeddb.ts:56).

**Verifier.** FilesPage.tsx:23-31 searches titles only and sorts by updated, created or title. The ItemRow menu (ItemRow.tsx:65-75) has only Duplicate and Move to trash. The star is opacity-0 until group hover or focus (ItemRow.tsx:54). duplicate() at indexeddb.ts:183-187 creates a new item, so favorite=false, with ' (copy)' added to the title.

**Recommendation.** Keep the routes and behaviour. Add content search and a per-item export/import (.dcosdoc/.dcosdiagram JSON) before the project-format work in 0.4.

### FUNC-6 — Trash and restore (must preserve)

*low · partial · verdict: confirmed*

**Evidence.** apps/web/src/App.tsx:18; apps/web/src/pages/FilesPage.tsx:12-13,20 (merges trashed docs+diagrams), :36-46,93-109 (Delete forever with confirm dialog); apps/web/src/components/ItemRow.tsx:46-48,66-70 (trashed rows not linked; Restore / Delete forever); packages/local-storage/src/indexeddb.ts:189-213; apps/web/src/lib/storage.ts:72-84 + indexeddb.ts:116-119 (get() ignores deletedAt)

**Detail.** Moving an item to trash is a soft delete (deletedAt). The Trash page lists documents and diagrams together, can sort by deletion date, restores items, and permanently deletes an item with all its versions after a confirmation dialog. Limitations: there is no 'Empty trash' button and no automatic purge after N days. Restoring bumps updatedAt (FUNC-4). A trashed item can still be opened and edited at #/documents/<id>, because get() returns trashed items and the editor shows no 'in trash' banner. Edits made that way leave the item in the trash. Permanent delete has no undo, apart from a previously exported backup.

**Verifier.** Trashed rows are not linked (ItemRow.tsx:46-47). get() at indexeddb.ts:116-119 does not filter on deletedAt. save() spreads ...current, so deletedAt is kept and edits made to an item opened by URL leave it in the trash. The purge dialog is in FilesPage. There is no 'Empty trash' and no auto-purge.

**Recommendation.** Keep the soft-delete semantics and the deletedAt field. Make the editor show an 'In trash: Restore' banner, or make it read-only, for trashed items. Add 'Empty trash' with a confirmation.

### FUNC-8 — Document editing toolbar (Simple / Advanced modes)

*low · partial · verdict: corrected*

**Evidence.** packages/document-studio/src/ui/Toolbar.tsx:37-46 (7 fonts, 10 sizes), :186-377 (undo/redo, block style P/H1-H4/code, bold/italic/underline/strike, colour, highlight, sub/sup/inline code [advanced], bullets/numbers/quote, 4 alignments, link, image, table, HR, page break + TOC [advanced], find, spellcheck, page setup [advanced], mode switch, Export); packages/document-studio/src/extensions/index.ts:16-35

**Detail.** The toolbar is a single horizontally scrolling row. Simple mode shows basic formatting. Advanced mode adds font family, font size, sub/superscript, inline code, page break, table of contents, find/replace, a spellcheck toggle and page setup. The mode is saved inside the document (types.ts:22). Limitations: there is no ribbon and no tabs. There are no paragraph or character styles beyond H1–H4, Normal and Code, and no line spacing, paragraph spacing, indent/outdent buttons, format painter or clear-formatting button. Fonts come from a fixed list of 7 system names and no font files are bundled, so 'Calibri' and others fall back when the OS lacks them. Font size is limited to 10 presets. Heading levels stop at 4. Text alignment applies to paragraphs and headings only, not list items.

**Verifier.** Toolbar.tsx:37-45 lists 6 named fonts (Arial, Calibri, Georgia, Times New Roman, Verdana, Courier New) plus a 'Default font' entry, not 7 font names. SIZES at :46 has 10 presets plus default. Headings are limited to levels 1-4 (extensions/index.ts:19). The claim that alignment does not apply to list items is misleading. TextAlign is configured for ['heading','paragraph'] (extensions/index.ts:24), and list items contain paragraph nodes, so text inside list items can be aligned in the editor. Only the DOCX exporter drops it (docx.ts:184-189 sets no alignment on list paragraphs). The other limitations (no ribbon, no line spacing or indent controls, no styles) hold.

**Recommendation.** For the 0.3 ribbon, keep the Tiptap JSON schema (extensions/index.ts:15 says to only add extensions, never remove them) and move the existing commands into Home/Insert tabs. Do not change node or mark names.

### FUNC-9 — Link button advertises a Ctrl+K shortcut that does not exist

*low · bug · verdict: confirmed*

**Evidence.** packages/document-studio/src/ui/Toolbar.tsx:58 (label="Link (Ctrl+K)"); grep -rnE "Mod-k|'k'|\"k\"" packages/*/src apps/web/src -> no matches; grep 'Mod-k' node_modules/@tiptap/*/dist/index.js -> no matches

**Detail.** The tooltip and accessible label promise Ctrl+K. Neither the app nor Tiptap's Link extension binds Mod-k, so pressing it does nothing in the editor (in some browsers it reaches the browser instead). This is a small advertised-but-missing feature.

**Verifier.** Toolbar.tsx:58 has label="Link (Ctrl+K)". grep for 'Mod-k|Mod-K' across packages/*/src, apps/web/src and node_modules/@tiptap/*/dist/index.js returns no matches, so no keybinding exists.

**Recommendation.** Either add a Mod-k keyboard shortcut that opens the link popover, or remove '(Ctrl+K)' from the label.

### FUNC-1 — Navigation and routes (must preserve)

*info · works · verdict: confirmed*

**Evidence.** apps/web/src/App.tsx:12-24 (HashRouter; '/', 'documents', 'diagrams', 'trash', 'settings' inside AppShell; 'documents/:id', 'diagrams/:id' full-screen; '*' -> Navigate '/'); apps/web/src/components/AppShell.tsx:29-34,143-181 (sidebar + mobile drawer); apps/web/src/components/EditorFrame.tsx:49,54-56 (back link)

**Detail.** There are 7 routes behind a hash router: #/, #/documents, #/diagrams, #/trash, #/settings, #/documents/:id and #/diagrams/:id. Any unknown path redirects to the Dashboard. The two editor routes sit outside AppShell, so they have no sidebar. Their only navigation is a back arrow that always goes to the kind's list page (/documents or /diagrams), not to wherever the user came from (for example the Dashboard). The header title comes from the path (AppShell.tsx:146), so it reads 'Documents', 'Trash' and so on. On mobile the sidebar is a drawer behind a hamburger button. The #/trash route reuses FilesPage with kind='document' and trash=true (App.tsx:18), and that page lists both documents and diagrams.

**Verifier.** App.tsx:12-24 has exactly these routes (HashRouter, AppShell children, full-screen editor routes, '*' -> Navigate '/'). App.tsx:18 renders trash as FilesPage kind='document' trash. EditorFrame.tsx:49,54 always links back to /documents or /diagrams. AppShell.tsx:146 builds the title from the pathname.

**Recommendation.** Freeze these exact hash paths, including the '#/documents/<uuid>' shape, in a route-contract test before adding Presentation, Notebook and other routes. Add new modules as sibling routes rather than renaming anything.

### FUNC-13 — Tables

*info · works · verdict: confirmed*

**Evidence.** packages/document-studio/src/ui/Toolbar.tsx:90-128 (8x8 size picker), :379-420 (row/column add/delete, merge/split + header row [advanced], delete table); extensions/index.ts:25 (resizable columns)

**Detail.** Insert a table up to 8×8 from a grid picker; larger tables need rows and columns added afterwards. A contextual table bar lets you add or delete rows and columns, merge and split cells, toggle the header row and delete the table. Columns can be resized by dragging. Limitations: no cell shading, borders or vertical-alignment controls, and no table styles. DOCX export ignores resized column widths and always writes a 100%-width table with even columns (docx.ts:218).

**Verifier.** docx.ts:218 uses Table width 100% PERCENTAGE and passes no columnWidths, so resized column widths are ignored. TableKit is set to resizable (extensions/index.ts:25).

**Recommendation.** Keep as is. Map colwidth to DOCX column widths when DOCX fidelity work starts.

### FUNC-16 — Word count, spell check, status bar

*info · works · verdict: confirmed*

**Evidence.** packages/document-studio/src/DocumentEditor.tsx:27,57-59 (spellcheck useState(true), browser-native), :61-64,183-191 (words · characters, page size/orientation)

**Detail.** The status bar shows a live word and character count plus the paper size and orientation. Spell check is the browser's native spellcheck, switched on or off with a toolbar toggle. Limitations: the spellcheck setting is not saved and resets to on for each editor mount. There is no grammar checking, no language choice, and no word count for a selection only.

**Verifier.** DocumentEditor.tsx:27 is useState(true) and is not persisted. :57-59 sets the DOM attribute. :61-64,183-191 is the status bar.

**Recommendation.** No action needed for preservation.

### FUNC-19 — Plain-text export

*info · works · verdict: confirmed*

**Evidence.** packages/document-studio/src/export/text.ts:4-49; DocumentEditor.tsx:124-128

**Detail.** TXT export keeps list markers, turns tables into tab-separated lines, writes horizontal rules as dashes and page breaks as form feeds. Images and the TOC are silently dropped. Link URLs are not included, only the link text.

**Verifier.** I did not read text.ts line by line. The export menu at DocumentEditor.tsx:124-128 calls documentToText(editor.getJSON()). The auditor's details are consistent with the cited file. Low stakes.

**Recommendation.** No action needed for preservation.

### FUNC-20 — Release 0.3 Document Studio features are entirely absent

*info · missing · verdict: confirmed*

**Evidence.** packages/document-studio/src/extensions/index.ts:16-35 (full extension list: StarterKit, TextStyleKit, Highlight, TextAlign, TableKit, Image, Sub/Superscript, CharacterCount, Placeholder, PageBreak, TableOfContents, SearchReplace); apps/web/src/App.tsx:21 (one document per route)

**Detail.** None of these exist in code: ribbon tabs (Home/Insert/Layout/References/Review/View), true multi-page layout, rulers, section breaks, columns, footnotes or endnotes, citations or bibliography, equations, comments, track changes, text boxes or shapes, image text wrap, paragraph/character style definitions, multiple open documents in tabs, DOCX import, and ODT import or export. Only one document can be open per window, because the route takes a single :id.

**Verifier.** extensions/index.ts:16-35 is the complete extension list. It has no footnote, comment, math, column, section or style extensions. App.tsx:21 is a single :id route.

**Recommendation.** Scope each feature as new work with schema additions behind a DocumentContent schemaVersion migration. Do not describe any of them as partially present.

### FUNC-21 — Diagram creation and templates (must preserve)

*info · works · verdict: confirmed*

**Evidence.** packages/diagram-studio/src/templates.ts:84-233 (blank, flowchart, tree, mindmap, orgchart, hierarchy, process, timeline, venn, network); apps/web/src/components/NewItemDialog.tsx:17-19

**Detail.** There are 10 diagram templates: Blank canvas, Flowchart, Tree diagram, Mind map, Organisation chart, Hierarchy, Process diagram, Timeline, Venn diagram and Network diagram. Limitations: 'Mind map' is a left-to-right tree, not radial. The Venn template uses 8-digit translucent hex fills (templates.ts:197-199), which none of the inspector swatches match, so once a user changes a fill they cannot get the translucency back. Template node IDs are fixed short strings ('a', 'router', and so on). That is fine because they are unique within each diagram.

**Verifier.** The Inspector FILLS at Inspector.tsx:5 are all 6-digit hex values or 'transparent', so a translucent 8-digit Venn fill cannot be chosen again once it is changed. I did not open the template line numbers individually.

**Recommendation.** Keep the template IDs. Add an alpha/opacity control (0.4 properties panel) so translucent fills stay editable.

### FUNC-23 — Flowchart editor (must preserve)

*info · works · verdict: confirmed*

**Evidence.** packages/diagram-studio/src/templates.ts:86-108; DiagramEditor.tsx:309-316 (smoothstep connectors); tests/acceptance/CHECKLIST.md:23,25

**Detail.** The flowchart template renders with labelled Yes/No branches, and connectors stay attached while shapes are dragged; both were verified in the browser. Limitations: smoothstep edges do not route around shapes (no orthogonal obstacle avoidance), so lines can cross through shapes. There are no swimlanes and no extra flowchart shapes such as manual input, predefined process, off-page connector or delay. Connection points are limited to 4 per shape.

**Verifier.** onConnect creates smoothstep edges (DiagramEditor.tsx:309-312). React Flow smoothstep edges do not avoid obstacles. 4 handles per shape (ShapeNode.tsx:16-21).

**Recommendation.** Keep as is. Add orthogonal routing (0.4) as a new edge type value, so existing 'smoothstep' edges render unchanged.

### FUNC-25 — Diagram features from the 0.4 plan are absent (groups, rotation, layers, lock, z-order, distribute, numeric geometry)

*info · missing · verdict: confirmed*

**Evidence.** packages/diagram-studio/src/types.ts:3-15 (12 ShapeKinds), :17-28 (ShapeData has no rotation/opacity/shadow/fontFamily/locked/groupId), :60 (zIndex serialized but never set by any UI: grep zIndex DiagramEditor.tsx -> none); Inspector.tsx:51-100 (no x/y/w/h fields)

**Detail.** There are no groups, rotation, layers, lock, z-order commands (bring forward or send back), distribute, opacity, shadow, font family, numeric x/y/w/h/rotation fields, UML/ER/BPMN shape libraries, images in diagrams, or inserting diagrams into documents. The only way to get a diagram into a document is to export a PNG and insert it as an image. The zIndex field exists in the saved format but no UI can change it.

**Verifier.** In types.ts, ShapeStyle/ShapeData (:17-28) has no rotation, opacity, shadow, fontFamily, locked or groupId fields. SerializedNode.zIndex is at :60. grep finds no zIndex in DiagramEditor.tsx.

**Recommendation.** Add these as optional ShapeData/SerializedNode fields with defaults in deserializeDiagram (types.ts:164-197), which already tolerates missing fields. Bump DiagramContent.schemaVersion only for breaking changes.

### FUNC-3 — Dashboard (must preserve)

*info · works · verdict: confirmed*

**Evidence.** apps/web/src/pages/Dashboard.tsx:9-12 (time greeting), :27-32 (4 quick-start tiles), :20-24,93 (recent = docs+diagrams sorted by updatedAt, first 8), :24,104 (favorites first 6), :107-116 (storage count card), :42-47 (New document/New diagram dialogs)

**Detail.** The Dashboard shows a time-of-day greeting and New document / New diagram buttons, which open the template picker. Quick start has 4 one-click tiles (Assignment, Lab report, Flowchart, Tree diagram) that create the item and open it straight away. Below that are Recent work and Favorites, plus a card counting documents and diagrams 'stored on this device'. Limitations: Recent shows at most 8 items and Favorites at most 6, with no 'view all' link. Neither list shows trashed items. There is no search on the Dashboard. 'Recent' means latest updatedAt, not last opened, so non-content actions change the order (see FUNC-4). The empty state appears only when there are no items at all.

**Verifier.** Dashboard.tsx:9-12 (greeting), :20-24 (recent sorted by updatedAt), :27-32 (4 quick tiles), :42-47 (dialogs), :93 slice(0,8), :104 slice(0,6), :107-116 (count card). useItems defaults to non-trashed. There is no 'view all' link.

**Recommendation.** Keep the layout. Before adding more modules to Recent, add a real lastOpenedAt or a separate content-modified timestamp so the ordering means 'recently edited/opened'.

### FUNC-33 — Document and diagram IDs (must preserve)

*info · works · verdict: confirmed*

**Evidence.** packages/local-storage/src/ids.ts:2-11 (UUID v4; getRandomValues fallback); indexeddb.ts:126 (id on create), :186 (duplicate -> new id), :282-284 (diverged import -> new id), :88-97 (deviceId in meta); apps/web/src/components/ItemRow.tsx:12 ('/${kind}s/${id}'); packages/diagram-studio/src/DiagramEditor.tsx:68-70 (node/edge IDs 'n-'/'e-' + 8 hex chars)

**Detail.** Documents and diagrams have UUID v4 IDs assigned once at creation, used as the IndexedDB key and in the URL (#/documents/<uuid>, #/diagrams/<uuid>). Renaming never changes an ID. Duplicating creates a new ID, and restoring a diverged backup creates a new ID. Documents and diagrams live in separate object stores, so the kind is part of an item's identity. Inside a diagram, node and edge IDs are 'n-'/'e-' plus the first 8 hex characters of a UUID (32 bits), or fixed short IDs from templates, and they only need to be unique within that diagram. The per-install deviceId is stored in meta and shown in Settings, and it would be lost if the browser storage were evicted.

**Verifier.** indexeddb.ts:126 sets id: uuid() on create. Duplicate goes through create, so it gets a new id (:186). ItemRow.tsx:12 builds href `/${kind}s/${id}`.

**Recommendation.** Treat item UUIDs and the kind/store split as permanent. Any SQLite or Yjs migration must carry IDs over verbatim. Use longer node IDs if diagrams will ever be merged collaboratively.

### FUNC-35 — Settings page (storage info)

*info · works · verdict: confirmed*

**Evidence.** apps/web/src/pages/SettingsPage.tsx:86-129 (persistent-storage badge/button, usage of quota, engine, schema version, device ID, app version)

**Detail.** Settings shows whether storage is persistent and offers a button to request it, the storage used out of the quota, and the storage engine ('IndexedDB'), schema version (1), device ID and app version. Limitations: the app version is a hard-coded string (line 126). There are no editor preferences, such as default page size, default font, default spellcheck or default document mode.

**Verifier.** SettingsPage.tsx:86-129 shows the persistence badge or button, usage and quota, engine, schema version and device ID, and a hard-coded app version at :126.

**Recommendation.** Read the version from package.json at build time.

### FUNC-37 — Desktop and Android apps do not exist as runnable products

*info · missing · verdict: confirmed*

**Evidence.** CHECKLIST.md:48-50 (macOS/Windows/Android ⬜); packages/ui/src/download.ts:7-10 (browser download only; native save dialog deferred); apps/web/src/lib/storage.ts:4-5 (SQLite adapter 'will' be injected)

**Detail.** Only the web/PWA build is a usable product. There is no Tauri or Capacitor build, no native file save dialog (all exports use an anchor download), and no SQLite adapter. Print-based PDF export and anchor downloads have not been verified inside those webviews.

**Verifier.** Consistent with the task description (Tauri and Capacitor are config only and never built). All exports go through downloadBlob, with no native save path.

**Recommendation.** When 0.8 starts, verify downloadBlob and printDocument in each shell first, since both export paths depend on browser behaviour.

### FUNC-7 — Document creation and templates (must preserve)

*info · works · verdict: confirmed*

**Evidence.** apps/web/src/components/NewItemDialog.tsx:21-38 (storage.create, title = template name or 'Untitled document', navigate to /documents/:id, requestPersistentStorage), :40-79; packages/document-studio/src/templates.ts:46,52,70,102,120 (blank, assignment, lab-report, essay, project-report); tests/acceptance/CHECKLIST.md:12

**Detail.** There are 5 document templates: Blank, Assignment, Lab report, Essay and Project report. Creating a document writes the item plus a 'create' version in one transaction, records templateId, and opens the editor. Limitation: templates are fixed in code. Users cannot save their own templates, and the cover-page fields are plain text, not real form fields. The browser checklist verified the Assignment template.

**Verifier.** NewItemDialog.tsx:21-38: storage.create with the template name, or `Untitled ${kind}` for blank, then templateId, notifyStorageChanged, requestPersistentStorage, navigate. create() at indexeddb.ts:139-142 writes the item and a 'create' version in one transaction.

**Recommendation.** Keep the template IDs, which are stored in templateId. Add new templates by appending, never by renaming an existing ID.

### Found by the verifier (missed by the auditor)

- The Settings 'Make storage persistent' button can silently do nothing and report a false refusal. requestPersistentStorage() (apps/web/src/lib/storage.ts:31-39) returns false without calling navigator.storage.persist() whenever the module flag persistRequested is already true. That happens after any item was created earlier in the same page load, because NewItemDialog.tsx:32 calls it automatically. SettingsPage.tsx:99-101 then shows the toast 'The browser declined; data is still saved but may be evicted under pressure', even though the browser was never asked. This directly undermines the main manual remedy for incident S-1. Suggested severity: medium.
- Ctrl/Cmd+S with no pending edits still writes a save that bumps version and updatedAt. flush() runs when opts.snapshot is set even if patch is null (storage.ts:98), and calls storage.save(kind,id,{},version,{snapshot:true}) (storage.ts:103), which always increments version and sets updatedAt (indexeddb.ts:163-170). So pressing Ctrl+S on an unchanged item reorders Recent work, shows 'Edited just now', and can cause a ConflictError in another open tab. This is the same class of bug as FUNC-4, but the auditor did not list it.
- Diagram undo gets no-op entries. Focusing the inspector label field pushes an undo snapshot unconditionally (packages/diagram-studio/src/Inspector.tsx:61 and :120: onFocus => onPatch({}, {snapshot:true}), and DiagramEditor.tsx:285-287 snapshots before the empty-patch early return). Clicking into the label box without typing adds an undo step that changes nothing, and these steps use up the 150-entry stack. Low severity.

## Database and storage

I audited the storage layer without changing anything in the repo. The working tree stayed clean. My only probe scripts were bundled with esbuild into the scratchpad and run against fake-indexeddb. The design is sound for a v0.1. There is one IndexedDB database, 'digital-classroom-os', at schema v1 with 5 stores and UUIDv4 ids. Every save uses an integer version for optimistic concurrency, and the read-check-write happens in a single transaction. Items are soft-deleted through deletedAt. Snapshots are capped per item. There is an append-only MIGRATIONS array and a backup import that never overwrites, all covered by 10 passing Vitest tests. The main risks are operational. (1) Data loss through eviction: navigator.storage.persist() is only called when an item is created, and nothing tracks backups or reminds the user to make one, which is incident S-1. (2) The backup import validates only id, kind, version and title. The probes confirmed that a backup missing updatedAt makes list() throw, a missing deletedAt sends items straight to Trash, a negative schemaVersion is accepted, and re-importing a backup whose items have diverged adds a new '(restored)' copy every time. (3) Base64 data-URL images are stored inside the content and copied into up to 49 snapshots. The whole document is also JSON.stringify'd on every keystroke and on every list() call. (4) Version pruning keeps 49 snapshots, not the documented 50, deletes manual snapshots even though the comment says automatic ones go first, and is skipped when a version is restored. (5) The 'blocking' handler reloads the page, which can drop edits still waiting in the 600 ms autosave debounce, and there are no blocked/terminated handlers. (6) The backup schemaVersion is the same number as the IndexedDB schema version, so the first v2 store bump will make v1 apps reject every v2 backup. The migration requirements for IndexedDB v2 stores, a SQLite import, an attachments store and content upgraders are given as concrete recommendations (STOR-14..17).

| ID | Severity | Status | Finding | Verdict |
|---|---|---|---|---|
| STOR-14 | high | recommendation | Migration requirement (a): IndexedDB v2 adds new stores without touching existing records or IDs | confirmed |
| STOR-4 | high | risk | Eviction risk (S-1): persist() is only requested on item creation, and nothing tracks or prompts backups | confirmed |
| STOR-10 | medium | risk | Images stored as base64 data URLs inside content, copied into every snapshot and stringified on every keystroke | corrected |
| STOR-11 | medium | risk | list() loads every full record, including content, to build summaries | confirmed |
| STOR-13 | medium | risk | The backup schemaVersion is tied to the IndexedDB schema version, so v2 backups will be rejected by v1 and kinds are hard-coded | confirmed |
| STOR-15 | medium | recommendation | Migration requirement (b): a SQLite adapter (Tauri/Capacitor) imports an IndexedDB backup with IDs preserved | confirmed |
| STOR-16 | medium | recommendation | Migration requirement (c): move embedded images to an attachments store | confirmed |
| STOR-17 | medium | recommendation | Migration requirement (d): upgraders for DocumentContent/DiagramContent schemaVersion | corrected |
| STOR-5 | medium | bug | Backup import validation gaps: records that pass validation can crash list() or land in Trash | corrected |
| STOR-6 | medium | bug | Re-importing the same backup duplicates diverged items every time | confirmed |
| STOR-8 | medium | risk | Write-loss windows in autosave: 600 ms debounce, async flush on pagehide/unmount, no retry after an error | confirmed |
| STOR-9 | medium | risk | The 'blocking' handler reloads during schema upgrades with no flush, and there are no blocked/terminated handlers | confirmed |
| STOR-12 | low | partial | Multi-tab behaviour: per-item conflicts are detected, but lists are not synced and trash/favorite cause editor conflicts | confirmed |
| STOR-7 | low | bug | Version pruning: keeps 49 not 50, prunes manual snapshots, and restoreVersion never prunes | confirmed |
| STOR-1 | info | info | Schema inventory: DB 'digital-classroom-os' v1, 5 object stores | confirmed |
| STOR-2 | info | works | IDs, versioning, snapshots, soft delete and migration mechanism | confirmed |
| STOR-3 | info | works | Backup file format, import semantics and conflict detection | confirmed |

### STOR-14 — Migration requirement (a): IndexedDB v2 adds new stores without touching existing records or IDs

*high · recommendation · verdict: confirmed*

**Evidence.** indexeddb.ts:41-52 (append-only MIGRATIONS contract), :36-38 (store mapping), :70-72 (upgrade loop); types.ts:2 (ItemKind)

**Detail.** Requirements: (1) Append MIGRATIONS[1] and set SCHEMA_VERSION = 2. Never modify MIGRATIONS[0] or rename, delete or re-key the documents, diagrams, *_versions or meta stores. (2) MIGRATIONS[1] only calls createObjectStore for presentations, presentation_versions, notebooks, notes, note_versions, assignments, attachments and optionally item_index (STOR-11). Each uses keyPath 'id' and gets by_item / by_owner / by_notebook indexes as needed. Any backfill (such as item_index) reads the existing stores through the upgrade transaction and writes only to the new stores. (3) Extend ItemKind and the kind-to-store maps exhaustively. (4) Keep every StorageAdapter method signature backwards compatible. (5) Fix the 'blocking' behaviour before shipping v2 (STOR-9). (6) Tests in fake-indexeddb: create a v1 DB with the shipped MIGRATIONS[0] and seed documents, diagrams and versions; reopen at v2; assert every v1 record deep-equals its pre-upgrade copy (ids, versions, timestamps, content); assert the new stores exist and are empty or backfilled; assert a v1 backup imports into v2 unchanged; assert v1 to v2 to v1-backup round-trips. Keep a frozen v1 fixture DB dump in the repo as a regression input.

**Verifier.** This is a recommendation, and its premises check out: append-only MIGRATIONS (:40-52), the upgrade loop (:70-71), the kind maps (:36-37). The note about reading existing stores through the upgrade transaction depends on the MIGRATIONS signature change flagged in STOR-2. The recommendation is sound.

**Recommendation.** Implement it as described and gate the release on the upgrade-preservation test.

### STOR-4 — Eviction risk (S-1): persist() is only requested on item creation, and nothing tracks or prompts backups

*high · risk · verdict: confirmed*

**Evidence.** apps/web/src/components/NewItemDialog.tsx:32 (`void requestPersistentStorage()` is the only automatic call); apps/web/src/lib/storage.ts:31-39 (persistRequested flag: a second automatic request in the same session returns false without asking); SettingsPage.tsx:86-107 (manual button only); grep shows no lastBackup or backup-reminder logic anywhere in apps/ or packages/. Incident: 2026-11-13, IndexedDB and localStorage for localhost:5173 were empty and navigator.storage.persisted() === false

**Detail.** Users who open the app but never create an item, or whose browser silently denied the request, run in 'best-effort' storage, which the browser can evict. The result of persist() is discarded in NewItemDialog, so the user is never told it was refused. There is no record of when the last backup was made and no prompt to make one, so after an eviction the only recovery path, a backup file, probably does not exist. The evidence does not prove the S-1 wipe was an eviction (a desktop-app or profile reset also clears origin storage). Either way, the app has no defence against it.

**Verifier.** Grepping apps/web/src and packages/*/src finds exactly one automatic call, NewItemDialog.tsx:32 (`void requestPersistentStorage()`, result discarded), and the manual button at SettingsPage.tsx:96-106. Nothing tracks or reminds about backups. One more detail: because of the persistRequested flag (storage.ts:31-38), once an item has been created in a session, pressing 'Make storage persistent' returns false without asking the browser and shows the toast 'The browser declined...' (SettingsPage.tsx:101). That message is misleading. Severity high is reasonable given S-1. The auditor correctly says the cause of S-1 is not proven.

**Recommendation.** Call requestPersistentStorage() at boot whenever the DB holds at least one item (and after an import), and surface a persistent banner when persisted() is false. Store lastBackupAt in meta (writing a new meta key needs no schema bump). Show a 'not backed up for N days / since M edits' reminder on Home and Settings. On Tauri/Capacitor, move to SQLite in the app data dir (0.8). Add an acceptance-checklist step that verifies persisted() === true after onboarding.

### STOR-10 — Images stored as base64 data URLs inside content, copied into every snapshot and stringified on every keystroke

*medium · risk · verdict: corrected*

**Evidence.** packages/document-studio/src/image.ts:15-42 (FileReader.readAsDataURL, downscaled to at most 1600 px, inputs up to 15 MB accepted); document-studio/src/extensions/index.ts:26 (`Image.configure({ allowBase64: true ...})`); DocumentEditor.tsx:41-44 (onUpdate emits editor.getJSON() on every transaction); apps/web/src/lib/storage.ts:140 (JSON.stringify(content) on every update to compare); indexeddb.ts:308 (versionOf does a structuredClone of the full content); indexeddb.ts:56 (list() stringifies every item for sizeBytes)

**Detail.** Base64 adds about 33% over the binary size. A 1600 px PNG can be several MB. A document with a few photos then becomes a multi-MB record, which is (a) rewritten in full on every 600 ms autosave, (b) duplicated in up to 49 snapshots (STOR-7), so 10 MB of images can become hundreds of MB, (c) stringified on every keystroke for change detection, and (d) parsed and stringified again for every list() refresh, which runs on every rename. This makes quota errors and eviction more likely (STOR-4) and causes typing latency. I did not measure actual sizes; the magnitudes follow from the code paths.

**Verifier.** The code paths are confirmed: image.ts:15-42, extensions/index.ts:26 allowBase64, DocumentEditor.tsx:41-44 getJSON on every update, storage.ts:140 stringify, indexeddb.ts:308 structuredClone, and :56 stringify in summarize. Correction: images are NOT always re-encoded or downscaled. image.ts:34 re-encodes only when a dimension exceeds 1600 px or the type is WebP. Otherwise the original file's bytes are embedded as-is (:33), so a ≤1600 px PNG, GIF or BMP of up to 15 MB (:2, :29) becomes a data URL of about 20 MB. That makes the bloat risk worse than stated.

**Recommendation.** Move images to an attachments store (see STOR-16). Until then, cap per-document image bytes, compare by a cheap revision counter instead of the full JSON, and exclude unchanged images from snapshots once they are referenced by id.

### STOR-11 — list() loads every full record, including content, to build summaries

*medium · risk · verdict: confirmed*

**Evidence.** indexeddb.ts:107-114 (`db.getAll(itemStore(kind))` followed by an in-memory filter for trashed, summarize, sort); :54-57 (sizeBytes = JSON.stringify(content).length); apps/web/src/lib/storage.ts:13-28 (useItems reloads on every notifyStorageChanged, which fires on renames, :109)

**Detail.** Listing cost grows with the total content size, not the number of items. Trash filtering and sorting happen in JS because there are no indexes on deletedAt or updatedAt. IndexedDB cannot project fields, so adding an index does not avoid loading the values. With images embedded (STOR-10), opening Files or Home loads every document's images into memory.

**Verifier.** indexeddb.ts:107-114 does getAll on the full store, then filters, summarizes and sorts in JS. :54-57 computes sizeBytes by stringifying content. useItems reloads on every notifyStorageChanged (storage.ts:9-28), which a title save triggers (:109).

**Recommendation.** In v2, add a lightweight summary store per kind (or a single 'item_index' store keyed by id with kind, title, updatedAt, deletedAt, favorite, sizeBytes, and indexes by_kind_updated and by_deleted), maintained in the same transaction as every item write. Backfill it in the v2 upgrade transaction from the existing stores without touching them. Serve list() from it.

### STOR-13 — The backup schemaVersion is tied to the IndexedDB schema version, so v2 backups will be rejected by v1 and kinds are hard-coded

*medium · risk · verdict: confirmed*

**Evidence.** indexeddb.ts:256 (`schemaVersion: SCHEMA_VERSION`); :335-336 (rejects schemaVersion > SCHEMA_VERSION); :339 (`kinds: ItemKind[] = ['document','diagram']`); types.ts:2 (ItemKind union), :55-62 (BackupFile has only items and versions arrays)

**Detail.** The first bump to IDB v2 (only to add stores) changes every exported backup to schemaVersion 2. A device still on v1 then refuses even a backup containing only documents. The validator and itemStore() (indexeddb.ts:36, where anything not 'document' maps to 'diagrams') also assume exactly 2 kinds. Adding 'presentation' without updating itemStore would silently write presentations into the diagrams store.

**Verifier.** indexeddb.ts:256 sets schemaVersion: SCHEMA_VERSION. :335 rejects anything greater. :339 hard-codes the kinds. :36-37 map any non-'document' kind to the diagrams stores. types.ts:2 and :55-62 match.

**Recommendation.** Introduce BACKUP_FORMAT_VERSION, independent of the IDB version. Make the backup additive, for example `stores: Record<string, unknown[]>` alongside the legacy items and versions. Have v1-compatible readers ignore unknown kinds or stores and report them instead of failing. Replace the ternaries in itemStore/versionStore with an exhaustive Record<ItemKind, StoreName> map so the compiler catches missing kinds.

### STOR-15 — Migration requirement (b): a SQLite adapter (Tauri/Capacitor) imports an IndexedDB backup with IDs preserved

*medium · recommendation · verdict: confirmed*

**Evidence.** docs/DATABASE.md:31-107 (planned DDL; `LIKE` is pseudo-SQL per :107; document_versions has no kind column and uses ON DELETE CASCADE); types.ts:83-99 (StorageAdapter contract); apps/web/src/lib/storage.ts:5 (single adapter injection point)

**Detail.** Requirements: (1) The SQLite adapter must pass the same contract test suite as IndexedDbAdapter. Extract indexeddb.test.ts into a shared runStorageAdapterContract(factory) and run it against both. (2) Map ids TEXT PRIMARY KEY verbatim. Keep version, createdAt, updatedAt, deletedAt and lastSnapshotAt exactly as given; do not regenerate or normalise timestamps, because import equality depends on version and updatedAt. (3) Store content as JSON TEXT, and attachments as files or BLOBs keyed by the same attachment id (STOR-16). (4) Import must use the same never-overwrite semantics and run in one SQL transaction. (5) First-run migration from the WebView's IndexedDB: Tauri and Capacitor WebViews keep their own IndexedDB, so on first launch of a SQLite build, open the old IDB in the WebView, call exportBackup() and importBackup() into SQLite, verify the counts, and keep the IDB data until the user confirms. Never auto-delete it. (6) Record the source deviceId and a migration log row in meta. (7) Fix the DDL: spell out the columns, decide whether the *_versions tables need kind (they are implicit per table), and avoid ON DELETE CASCADE purging history when an item is soft-deleted (soft delete is an UPDATE, so cascade fires only on purge, which matches the purge() behaviour).

**Verifier.** DATABASE.md:68-72 shows document_versions with no kind column and ON DELETE CASCADE. :74-75 use LIKE, and :107 states it is shorthand. The StorageAdapter contract is at types.ts:83-99, and the single injection point is storage.ts:5. Also, the SQLite documents table (:62-67) has no kind column, which is consistent with kind being implicit per table.

**Recommendation.** Write the contract test suite before writing any SQLite code, and add a backup fixture with known ids that both adapters must import with ids intact.

### STOR-16 — Migration requirement (c): move embedded images to an attachments store

*medium · recommendation · verdict: confirmed*

**Evidence.** document-studio/src/image.ts:27-42 (images become data: URLs); export/docx.ts:63 (the DOCX exporter only parses `data:image/...;base64` srcs); docs/DATABASE.md:95-97 (attachments table with sha256)

**Detail.** Requirements: (1) Create an attachments store {id, sha256, mimeType, sizeBytes, blob (Blob), createdAt} with a unique index on sha256 for dedupe, plus an attachment_refs mapping or an owner index for garbage collection. (2) Reference images in content as `attachment:<id>` (or keep the data URL as a fallback attribute), resolved to object URLs at render time. Every consumer must resolve these: DOCX export (docx.ts:63), PDF print iframe and TXT. (3) Do NOT rewrite records inside the IDB upgrade transaction (it cannot await crypto.subtle digest, and a long upgrade blocks the app). Make it a lazy, per-item content migration: when an item is opened or saved, extract its data URLs to attachments and write the item with a bumped version in the same transaction. Leave historical snapshots unchanged, or migrate them in a resumable background job tracked in meta. (4) Backups must include attachments, for example as base64 in a new `attachments` array under BACKUP_FORMAT_VERSION 2 or a zip, and import must dedupe by sha256. (5) Purge and version pruning must garbage-collect attachments that are no longer referenced. (6) Tests: a document with a data-URL image migrates to an attachment ref, renders, exports DOCX with the image, round-trips through a backup, and a second migration run is a no-op.

**Verifier.** image.ts:27-42 produces data URLs. docx.ts:63 matches only `data:image/(png|jpe?g|gif|bmp);base64`. DATABASE.md:95-97 defines attachments with sha256, though without a UNIQUE constraint, so the dedupe index would be new. The point that an IDB upgrade transaction cannot await crypto.subtle is correct: awaiting a non-IDB promise lets the versionchange transaction auto-commit.

**Recommendation.** Ship the lazy extractor together with resolver support in every exporter in one release. Never leave content referencing attachments that the exporters cannot resolve.

### STOR-17 — Migration requirement (d): upgraders for DocumentContent/DiagramContent schemaVersion

*medium · recommendation · verdict: corrected*

**Evidence.** document-studio/src/types.ts:18-23 (`schemaVersion: 1` as a literal type), :50-60 (normalizeDocument always writes schemaVersion 1 and silently drops unknown shapes); diagram-studio/src/types.ts:74-80, :164-196 (deserializeDiagram ignores schemaVersion and drops edges whose endpoints are missing); DocumentEditor.tsx:43,54,94 (hard-coded schemaVersion: 1)

**Detail.** Content versioning lives in the studio packages, not the storage layer, which is the right separation. Today, though, the readers ignore schemaVersion and normalise lossily. Unknown node types and attributes from a newer version would be dropped and then re-saved over the original. Requirements: (1) Each studio package owns `migrateDocumentContent(raw): DocumentContentLatest` / `migrateDiagramContent`, with an ordered UPGRADERS[n] mapping n to n+1, pure and synchronous, in packages/document-studio/src/schema/ and packages/diagram-studio/src/schema/. (2) Call the upgrader at every read boundary: editor load, backup import (optionally) and exporters. Write the upgraded form only on the next real save, which bumps the item version normally. Never mass-rewrite in an IDB upgrade. (3) If content.schemaVersion is greater than the supported version, open read-only and refuse to save, rather than normalising and overwriting. (4) Leave snapshots at their original version and upgrade them on restore. (5) Replace the `1` literals with a CURRENT_*_SCHEMA constant. (6) Tests: frozen JSON fixtures for every historical version (taken from real v0.1 documents and diagrams, including images, tables and every shape kind), asserting upgrade(fixture_vN) deep-equals expected_latest; idempotence (upgrading latest is the identity); a 'newer version stays read-only' test; and a round-trip through the DOCX exporter for document fixtures.

**Verifier.** The literal schemaVersion: 1 is confirmed (document-studio/src/types.ts:19, :55; DocumentEditor.tsx:43, :54, :94), and deserializeDiagram ignores schemaVersion and drops dangling edges and unlisted node fields (diagram-studio/src/types.ts:164-196). Correction: normalizeDocument (:50-59) does NOT drop unknown node shapes. It passes r.doc through verbatim whenever doc.type === 'doc', and drops only unknown top-level fields. The real loss happens in Tiptap and is much worse than dropping single nodes. In @tiptap/core 3.33.1 (node_modules/@tiptap/core/dist/index.js:618-626), schema.nodeFromJSON throws on any unknown node or mark type. The error is caught, and the editor falls back to createNodeFromContent(''), an EMPTY document. enableContentCheck is not set anywhere in document-studio. See the missed item.

**Recommendation.** Before any 0.3/0.4 content change, add the fixtures and the read-only guard for newer versions. Use the first real schema change (for example, sections and footnotes in Document Studio) as the first UPGRADERS[1].

### STOR-5 — Backup import validation gaps: records that pass validation can crash list() or land in Trash

*medium · bug · verdict: corrected*

**Evidence.** indexeddb.ts:340-344 (only id, kind, version and title are checked); :113 (`b.updatedAt.localeCompare`); :111 (`i.deletedAt === null`); :335 (only rejects schemaVersion > SCHEMA_VERSION). Scratchpad probe output: importing 2 items without updatedAt gave `list() threw: Cannot read properties of undefined (reading 'localeCompare')`. An item without deletedAt gave `list [] / trash list 1`. `schemaVersion -5 accepted`

**Detail.** A hand-edited, truncated or older backup can poison the database. If an item lacks updatedAt or createdAt, every list() for that kind throws, so the Files and Home pages break. That persists until the item is purged, which the UI cannot do because the list cannot render. An item lacking deletedAt (undefined) is treated as trashed. content is not validated at all. Version records are not checked for createdAt, version, title or content, or for kind matching the parent item's kind, so a 'diagram' version that points at a document id goes into diagram_versions. Unknown extra fields are stored verbatim. JSON.parse runs on the whole file in memory (SettingsPage.tsx:47).

**Verifier.** The validation gaps are real (indexeddb.ts:340-344 checks only id, kind, version and title; :335 accepts a negative schemaVersion, which my probe confirmed). An item without deletedAt lands in Trash (probe: live 0, trash 1). The crash claim is overstated, though. list() uses only updatedAt in its sort comparator (:113), not createdAt. Whether it throws depends on the order the comparator is called in. My probe with 3 good items plus 1 item lacking updatedAt threw when the bad item's id was '0' and did NOT throw when its id was 'zzzz'. So it is 'list() may throw for that kind, depending on key order', not 'every list() throws', and a missing createdAt does not affect list(). When it does throw, useItems.reload (apps/web/src/lib/storage.ts:17-20) has no catch, so the page stays in 'loading' and the rejection goes unhandled. Severity medium is fine.

**Recommendation.** Validate every field of WorkspaceItem and ItemVersion (string ISO dates, deletedAt string|null, boolean favorite, integer version >= 1, schemaVersion an integer >= 1). Normalize missing optional fields to defaults instead of rejecting the file. Run content through normalizeDocument/deserializeDiagram-style validators. Make list() sort defensively. Add tests for each malformed shape.

### STOR-6 — Re-importing the same backup duplicates diverged items every time

*medium · bug · verdict: confirmed*

**Evidence.** indexeddb.ts:278-286 (the match is by original id only, and copies get a fresh uuid). Probe: importing the same diverged backup twice reported `{copied:1}` both times, and the titles became ['R','R (restored)','R (restored)']

**Detail.** Import is not idempotent for diverged items. Each restore of the same file adds another '(restored)' copy plus re-keyed copies of all its versions. A user who retries a restore, or restores on every launch after a scare, multiplies their data.

**Verifier.** Reproduced with my own fake-indexeddb probe. Two imports of the same diverged backup each returned {copied:1, versionsAdded:1}, and the titles became ['R','R (restored)','R (restored)']. The cause is indexeddb.ts:278-286.

**Recommendation.** Record the provenance on the copy, for example restoredFrom: {itemId, version, updatedAt} on the item (an additive field, no store change needed), or keep a meta/import-log store keyed by source id+version. Skip the item when an equivalent copy already exists. Add a test that imports the same file twice and expects the second report to be all 'skipped'.

### STOR-8 — Write-loss windows in autosave: 600 ms debounce, async flush on pagehide/unmount, no retry after an error

*medium · risk · verdict: confirmed*

**Evidence.** apps/web/src/lib/storage.ts:53 (AUTOSAVE_DELAY_MS 600); :184-194 (visibilitychange/pagehide/unmount call `void flush()`, which is async); :96 (flush first awaits any in-flight save before starting its own tx); :117-121 (on a non-conflict error, edits stay in pending.current but nothing reschedules a save); :74-84 (storage.get has no .catch, so a rejected DB open leaves status 'loading' forever)

**Detail.** The browser does not wait for promises started in pagehide, so an IndexedDB transaction opened there can be dropped when the tab or process is killed. This is most likely on Android/Capacitor and on window close. Because flush awaits the in-flight save first, the final transaction opens even later. visibilitychange 'hidden' fires earlier and usually covers tab switches, but a crash or kill inside the 600 ms window loses the edits. After a QuotaExceededError (a realistic outcome given STOR-10), the hook shows 'error' and keeps the edits in memory, but they are only retried on the next keystroke or hide. There is no beforeunload guard while status is 'pending', 'saving' or 'error'. I did not reproduce a loss in a browser; this assessment comes from reading the code.

**Verifier.** storage.ts:53 has the 600 ms delay. :184-194 call void flush() in visibilitychange, pagehide and unmount. :96 awaits inFlight first. :117-121 keep pending on error with no reschedule. :74-84 storage.get(...).then has no catch. There is no beforeunload anywhere (grep). The auditor rightly labels this code-reading, not a reproduced loss. One more race: two flushes that await the same inFlight (for example a visibilitychange flush and Cmd+S saveNow) both resume. The second one starts storage.save with version.current not yet updated by the first, and gets a ConflictError against its own write (:96-103). This is low probability and not reproduced.

**Recommendation.** Add a beforeunload prompt while pending, saving or error. Retry with backoff on non-conflict errors. Show quota errors explicitly. Catch get() failures and show an error state. Consider writing a small crash-recovery draft (the pending patch) on every change to a separate 'drafts' store in v2 and reconciling it on next open. For Capacitor, flush on the App 'pause' event.

### STOR-9 — The 'blocking' handler reloads during schema upgrades with no flush, and there are no blocked/terminated handlers

*medium · risk · verdict: confirmed*

**Evidence.** indexeddb.ts:73-76 (`blocking() { location.reload() }`); openDB at :69-77 sets no `blocked` or `terminated` callbacks; apps/web/vite.config.ts:13 (`registerType: 'autoUpdate'`)

**Detail.** When a tab running a newer build opens v2, every older tab reloads immediately. The reload triggers pagehide, whose async flush (STOR-8) races the unload, so up to 600 ms of debounced edits, or a save that failed with an error, can be lost in the old tab. If an old tab cannot reload (a non-window context), the new tab's open stays blocked with no UI, because there is no `blocked` callback. There is a second, unverified risk: if the reloaded tab is served the old precached bundle, it would call openDB(name, 1) against a v2 database and get a VersionError. dbPromise would then reject and every storage call fails, with no UI handling it. Whether autoUpdate's skipWaiting/clientsClaim prevents this depends on timing I did not test.

**Verifier.** indexeddb.ts:73-76 calls location.reload() in blocking. The openDB options set no blocked or terminated callbacks. vite.config.ts:13 has registerType 'autoUpdate'. The stale-bundle VersionError scenario is correctly marked as unverified.

**Recommendation.** In blocking(): flush pending edits first (expose a registry of open editors), then call db.close() and show a 'New version, reload to continue' banner instead of a hard reload. Add a `blocked` handler that tells the user to close other tabs, and a `terminated` handler. Handle a dbPromise rejection with a clear 'app updated, reload' screen. Test the v1-to-v2 upgrade with two open connections in fake-indexeddb.

### STOR-12 — Multi-tab behaviour: per-item conflicts are detected, but lists are not synced and trash/favorite cause editor conflicts

*low · partial · verdict: confirmed*

**Evidence.** apps/web/src/lib/storage.ts:7-11 (notifyStorageChanged only notifies listeners in the same JS realm; grep finds no BroadcastChannel or storage events); indexeddb.ts:202 (trash/restore bump version); ItemRow.tsx:25-28 (favorite toggle saves with the latest version); storage.ts:110-116 (a ConflictError blocks autosave until the user resolves it)

**Detail.** Two tabs editing the same item get a correct ConflictError with a 'save copy' or 'load latest' choice, so there is no silent overwrite. However, the Files and Home lists in other tabs go stale until navigation. Favoriting or trashing a document in tab A while it is open in tab B bumps its version, so B's next keystroke raises a conflict even though the content never changed. That is a false-positive conflict which forces the user to choose.

**Verifier.** notifyStorageChanged is a module-level Set (storage.ts:7-11), and grep finds no BroadcastChannel or storage event. ItemRow.tsx:24-28 saves favorite with the latest version, and save always bumps version (indexeddb.ts:168). setDeleted bumps version (:202). An open editor in another tab then hits ConflictError (storage.ts:111-116).

**Recommendation.** Broadcast changes over a BroadcastChannel('dcos-storage') carrying {kind,id,version}. On receiving one, refresh lists, and in editors with no pending edits silently adopt the new version. For metadata-only changes (favorite, deletedAt), either use a separate metaVersion or let save() rebase when the stored change did not touch title or content.

### STOR-7 — Version pruning: keeps 49 not 50, prunes manual snapshots, and restoreVersion never prunes

*low · bug · verdict: confirmed*

**Evidence.** indexeddb.ts:175-176 (add, then prune in the same tx, so getAll already includes the new version); :317 (`versions.length + 1 - MAX_VERSIONS_PER_ITEM`); :319-321 (only 'create' is excluded, contradicting the comment at :22 'oldest automatic snapshots are pruned first'); :230 (restoreVersion adds without prune). Probe: 'versions kept after 60 manual saves 49', then 'after 5 restores 54'

**Detail.** The '+1' double-counts the snapshot that was just added. Manual (Cmd+S) snapshots are pruned on the same footing as auto ones. Repeated restores grow history without bound, and with embedded images (STOR-10) every snapshot is a full copy of the document.

**Verifier.** In indexeddb.ts:175-176 the add happens before prune in the same tx, so :317's `+1` double-counts. :320 excludes only 'create', which contradicts the comment at :22. restoreVersion (:221-242) never prunes. Probe: 'kept 49' after 60 manual saves, then 'after restores 54' after 5 restores.

**Recommendation.** Use `versions.length - MAX`. Prune 'auto' snapshots first, then 'restore', then 'manual', and never 'create'. Call prune from restoreVersion. Add a test asserting exactly MAX versions are kept and that manual snapshots survive while auto ones exist.

### STOR-1 — Schema inventory: DB 'digital-classroom-os' v1, 5 object stores

*info · info · verdict: confirmed*

**Evidence.** packages/local-storage/src/indexeddb.ts:19 (SCHEMA_VERSION = 1), :25-31 (DcosDB), :44-52 (MIGRATIONS[0]), :68 (default dbName); docs/DATABASE.md:9-17

**Detail.** Stores: documents (keyPath 'id', no indexes, value WorkspaceItem<DocumentContent>), diagrams (keyPath 'id', no indexes, value WorkspaceItem<DiagramContent>), document_versions and diagram_versions (keyPath 'id', index 'by_item' on itemId, value ItemVersion), meta (keyPath 'key', value {key,value}; only 'deviceId' is stored, indexeddb.ts:84-101). WorkspaceItem = {id, kind:'document'|'diagram', title, content, version, createdAt, updatedAt (ISO), deletedAt|null, ownerDeviceId, favorite, templateId|null, lastSnapshotAt|null} (types.ts:4-21). ItemVersion = {id, itemId, kind, version, title, content (full copy), createdAt, reason:'manual'|'auto'|'restore'|'create'} (types.ts:25-34). Content payloads carry their own schemaVersion: 1, separate from the DB version (document-studio/src/types.ts:18-23, diagram-studio/src/types.ts:74-80). No store has indexes on updatedAt, deletedAt or favorite.

**Verifier.** indexeddb.ts:19 SCHEMA_VERSION=1, :25-31 DcosDB, :44-52 MIGRATIONS[0] creates exactly 5 stores (by_item index only on *_versions), :68 default name 'digital-classroom-os'; meta holds only deviceId (:84-101). types.ts:4-34 match. document-studio/src/types.ts:18-23 and diagram-studio/src/types.ts:74-80 carry schemaVersion: 1. docs/DATABASE.md:9-17 matches.

**Recommendation.** Treat this table as the frozen v1 contract. Every future migration must leave these 5 stores, their keyPaths and the by_item index unchanged.

### STOR-2 — IDs, versioning, snapshots, soft delete and migration mechanism

*info · works · verdict: confirmed*

**Evidence.** ids.ts:2-11 (crypto.randomUUID, with a getRandomValues v4 fallback); indexeddb.ts:121-144 (create writes the item and a 'create' version in one tx), :146-181 (save), :20-23 (AUTO_SNAPSHOT_INTERVAL_MS 10 min, MAX_VERSIONS_PER_ITEM 50), :189-204 (trash/restore set deletedAt and bump version), :206-213 (purge hard-deletes item + versions), :70-72 (upgrade loop runs MIGRATIONS[v] for v in oldVersion..SCHEMA_VERSION-1); `npx vitest run` in packages/local-storage: 10 passed

**Detail.** IDs are client-generated UUIDv4. Ids are only re-minted by duplicate(), by import of a diverged item, and by version records that come with a diverged import. version starts at 1 and is incremented by save, trash, restore and restoreVersion. save() reads the stored version in the same readwrite transaction and throws ConflictError on a mismatch, so it never overwrites silently (save at :146-181, ConflictError in errors.ts:4-14). Snapshots are taken on create, on an explicit Cmd+S (reason 'manual'), automatically on a content or title change when 10 minutes have passed since lastSnapshotAt, and before a restoreVersion (reason 'restore'). Migrations follow 'index i upgrades i to i+1, never edit a shipped migration', and they run inside IndexedDB's versionchange transaction. MIGRATIONS[v](db) only receives the db, not the upgrade transaction, so a future migration cannot read or rewrite existing records (for example to backfill a field or move images) without a signature change.

**Verifier.** ids.ts:2-11 uses randomUUID with a v4 getRandomValues fallback. create is one tx (:139-142). save reads, checks and writes in one readwrite tx and throws ConflictError (:146-181). Trash and restore bump version (:202). purge deletes versions via by_item (:206-213). The upgrade loop is at :70-71, and MIGRATIONS is typed (db)=>void (:44), so it gets no upgrade transaction. Re-ran `npx vitest run` in packages/local-storage: 10 passed.

**Recommendation.** Change the migration signature to (db, tx, oldVersion) so data migrations can use the upgrade transaction (idb passes `transaction` as the 3rd argument of upgrade()). Keep MIGRATIONS[0] byte-for-byte as it is.

### STOR-3 — Backup file format, import semantics and conflict detection

*info · works · verdict: confirmed*

**Evidence.** types.ts:55-71; indexeddb.ts:244-262 (exportBackup, one readonly tx over all stores), :264-299 (importBackup), :331-351 (validateBackup); SettingsPage.tsx:38-55 (exports as classroom-os-backup-YYYY-MM-DD.json, which includes trashed items)

**Detail.** Format: {format:'dcos-backup', schemaVersion (= the DB SCHEMA_VERSION), exportedAt, deviceId, items[], versions[]}, as plain JSON with images inline as base64. Import runs in one readwrite transaction (all or nothing). An item whose id is unknown is added with its id kept. If the id exists with the same version and updatedAt, the item is skipped. If it exists and differs, a copy is added under a new uuid, titled '<title> (restored)', and that item's versions are re-keyed to the copy. Versions are imported only for items that were added or copied. Conflict detection uses only (version, updatedAt), not a content hash. meta.deviceId is not restored, so this device keeps its own id and imported items keep their foreign ownerDeviceId.

**Verifier.** exportBackup is one readonly tx and includes trashed items (:244-262). importBackup is one readwrite tx (:269-297). The match is by id plus (version, updatedAt) (:278). A diverged item becomes a new uuid titled '(restored)' (:282-285). Versions are imported only for ids in idMap (:289-290), and meta/deviceId is not restored. SettingsPage.tsx:38-55 matches the filename and the JSON.parse.

**Recommendation.** Keep the never-overwrite rule. See STOR-6/STOR-13 for idempotency and versioning fixes.

### Found by the verifier (missed by the auditor)

- HIGH: A document containing any node or mark type unknown to the current schema loads as a completely blank document, and the user's next keystroke saves that blank over the original. Evidence: node_modules/@tiptap/core/dist/index.js:618-626 (createNodeFromContent catches the nodeFromJSON error, logs '[tiptap warn]: Invalid content.' and returns createNodeFromContent("")). DocumentEditor.tsx:37-45 passes initial.doc with no enableContentCheck (grep finds none). storage.ts:81 sets lastSavedContent from the stored content, so the first edit in the blank editor differs and is autosaved with the correct version (no ConflictError). This will happen as soon as 0.3 adds footnote, comment, equation or textbox nodes and an older build opens the document: a stale PWA tab before autoUpdate, an older Tauri or Capacitor build, or a downgrade. Only a prior snapshot can recover it. Fix: enable enableContentCheck plus a contentError handler that opens read-only, and gate on content.schemaVersion.
- LOW: SettingsPage exportBackup (apps/web/src/pages/SettingsPage.tsx:38-43) has no try/catch. It builds the whole backup in memory and then JSON.stringify's it (including every base64 image across every snapshot, see STOR-7/10), so a failure such as out-of-memory on a large store becomes an unhandled rejection with no toast. The user believes they have a backup when they do not.
- LOW: useItems.reload (apps/web/src/lib/storage.ts:17-20) has no error handling. Any list() rejection (DB open failure, VersionError from STOR-9, or the comparator crash in STOR-5) leaves loading=true forever and produces an unhandled rejection. Together with the missing catch on storage.get (storage.ts:74), there is no UI path that tells the user storage is unavailable.

## Document engine

The Document Studio is a thin, well-built layer on Tiptap 3.33.1 / ProseMirror (prosemirror-model 1.25.13). Its schema is StarterKit (headings 1-4), TextStyleKit (color, backgroundColor, fontFamily, fontSize, lineHeight), multicolor Highlight, TextAlign, TableKit, block Image with base64 allowed, Sub/Superscript, CharacterCount, Placeholder, and three custom extensions: PageBreak (an atom block), TableOfContents (an atom block with a React node view) and SearchReplace (a decoration plugin). Documents are saved as {schemaVersion:1, doc: ProseMirror JSON, page, mode}, autosaved on every transaction. Export goes three ways: DOCX through the MIT 'docx' library (9.15.3), PDF through the browser print engine in an iframe, and TXT. The most serious engine-level finding is about data safety, not missing features. Tiptap's default enableContentCheck:false means any unknown node type (for example a 0.3 node opened by a stale cached PWA bundle) makes the whole document load as an empty doc, and the next keystroke autosaves over the stored content. I verified this against the installed source and with a probe. DOCX export is honest but lossy: it silently drops non-paragraph children of list items and nested tables, ignores list start, column widths, lineHeight and list/quote alignment, writes the TOC as static text, maps highlight to shading, and embeds only png/jpg/gif/bmp data-URL images. The editor shows one continuous sheet, not pages, and its footer preview always says 'Page 1'. For Release 0.3, the official Tiptap features for Pages, DOCX Conversion, Comments, Compare and Tracked Changes are all paid platform features (tiptap.dev/pricing), so each needs an OSS substitute or a custom build. Most of 0.3 is achievable with MIT/Apache/BSD parts and the docx library, which already supports footnotes, sections/columns, comments, tracked runs, text boxes, floating images and TOC fields. True Word-fidelity pagination (split paragraphs and table rows, per-page footnotes, columns inside sections, freely positioned shapes) is not realistic in a browser flow editor and should be scoped as a 'paged view' plus print-accurate output. Tiptap/ProseMirror should stay the engine. Lexical and Slate have no pagination, comments or DOCX advantage. OnlyOffice (AGPL-3.0) and Collabora (MPL-2.0) need a server and would break the offline-first PWA and the preserve-IDs/data requirement.

| ID | Severity | Status | Finding | Verdict |
|---|---|---|---|---|
| DOCU-10 | high | recommendation | True multi-page pagination: feasible only as a visual 'paged view'; Word-level layout not realistic | confirmed |
| DOCU-2 | high | risk | Unknown/invalid node in stored JSON silently loads an EMPTY document, and the next edit autosaves over the original | confirmed |
| DOCU-22 | high | info | Plain statement: what is NOT realistically achievable at Word-level fidelity in a browser editor | confirmed |
| DOCU-12 | medium | recommendation | Section breaks and multi-column layout | confirmed |
| DOCU-14 | medium | risk | Citations/bibliography: citation-js is MIT but its CSL formatter depends on citeproc (CPAL-1.0 OR AGPL) | confirmed |
| DOCU-16 | medium | recommendation | Comments (and track changes) need custom builds; Word-compatible track changes is XL | confirmed |
| DOCU-17 | medium | recommendation | Text boxes, shapes and image text-wrap | confirmed |
| DOCU-19 | medium | recommendation | DOCX import: mammoth (BSD-2-Clause) is the pragmatic base, but it is semantic, not layout-faithful | confirmed |
| DOCU-20 | medium | recommendation | ODT import/export | confirmed |
| DOCU-3 | medium | risk | schemaVersion is a literal 1 with no migration pipeline | confirmed |
| DOCU-4 | medium | partial | DOCX exporter fidelity gaps (silent drops and approximations) | confirmed |
| DOCU-7 | medium | risk | Images stored inline as base64 inside document JSON | confirmed |
| DOCU-11 | low | recommendation | Rulers, indents and tab stops | confirmed |
| DOCU-13 | low | recommendation | Footnotes/endnotes | confirmed |
| DOCU-15 | low | recommendation | Equations: editor side solved by MIT parts; native Word equations (OMML) on export is the hard part | corrected |
| DOCU-18 | low | recommendation | Paragraph and character styles | confirmed |
| DOCU-5 | low | partial | Editor has no pages: one continuous sheet, header shown once, footer preview hard-coded to 'Page 1' | confirmed |
| DOCU-6 | low | partial | PDF export depends on the browser print engine; header/footer margin boxes are Chromium 131+ only | confirmed |
| DOCU-9 | low | recommendation | Ribbon UI and tabbed multiple open documents | confirmed |
| DOCU-1 | info | info | Engine, schema and stored content shape (baseline description) | confirmed |
| DOCU-21 | info | recommendation | Engine choice: keep Tiptap 3 / ProseMirror | confirmed |
| DOCU-8 | info | info | Official Tiptap Pages, Conversion (DOCX), Comments, Compare and Tracked Changes are paid; core editor is MIT | corrected |

### DOCU-10 — True multi-page pagination: feasible only as a visual 'paged view'; Word-level layout not realistic

*high · recommendation · verdict: confirmed*

**Evidence.** Official: paid (DOCU-8). OSS: tiptap-pagination-plus 3.1.0 MIT (npm view; repo github.com/RomikMakavana/tiptap-pagination-plus, single maintainer; README config pageHeight/pageWidth/margins/header/footer per page; table handling needs companion tiptap-table-plus 3.1.0 MIT); tiptap-extension-pagination 2.1.4 ISC (last modified 2025-03, targets Tiptap 2 by version line); pagedjs 0.4.3 MIT (last modified 2024-10) for print-side pagination.

**Detail.** ProseMirror is a single contenteditable flow. 'Pages' in OSS extensions are made with decorations or spacers that push content past page boundaries. That works for blocks, but splitting one long paragraph or one table row across a page edge, widow/orphan control, keep-with-next, per-page footnote areas, and section-specific page sizes are either unsupported or fragile. I have not verified how tiptap-pagination-plus handles long paragraphs; that needs a spike. Its table support needs its own table extension, which may conflict with the existing TableKit schema, and replacing it would risk existing tables. The PDF path (browser print) already paginates correctly, so editor pagination is a preview problem, not an output problem.

**Verifier.** npm view: tiptap-pagination-plus 3.1.0 MIT, peer @tiptap/core '^2.0.0 || ^3.0.0', last modified 2026-04-28. tiptap-extension-pagination 2.1.4 ISC has peer @tiptap/core ^2.11.5, so it is Tiptap 2 only (stated outright in its peers, not just inferred from the version). pagedjs 0.4.3 MIT, last modified 2024-10-04. The feasibility judgement is reasonable and the auditor flags it as needing a spike.

**Recommendation.** Phase it. (a) 0.3: 1-2 day spike of tiptap-pagination-plus against the 4 templates plus a 30-page doc, without replacing TableKit. If it fails, build a custom decoration-based paged view (measure block heights, insert page-gap widget decorations, per-page header/footer/page number). Effort L, risk high. (b) Offer 'Print layout preview' using the existing print HTML in an iframe (optionally pagedjs) as the exact view. Effort S-M. Say plainly that the editor's page breaks are approximate and the PDF/DOCX are authoritative. Word-identical live pagination is not achievable.

### DOCU-2 — Unknown/invalid node in stored JSON silently loads an EMPTY document, and the next edit autosaves over the original

*high · risk · verdict: confirmed*

**Evidence.** src/DocumentEditor.tsx:37-45 (useEditor without enableContentCheck/onContentError; onUpdate -> onChange every transaction). node_modules/@tiptap/core/src/Editor.ts:107 'enableContentCheck: false' default; src/helpers/createNodeFromContent.ts:40-64: schema.nodeFromJSON throws -> console.warn('[tiptap warn]: Invalid content.') -> 'return createNodeFromContent('', schema, options)'. Probe (scratchpad probe.mjs) with doc [paragraph 'keep me', {type:'footnote'}] printed 'RangeError: Unknown node type: footnote' and then took the empty-string fallback (in Node it then failed only for lack of window). apps/web/src/pages/DocumentPage.tsx:43 wires onChange to updateContent (debounced autosave, apps/web/src/lib/storage.ts:56). types.ts:56 also replaces any doc whose type !== 'doc' with a blank doc.

**Detail.** One unknown node or mark anywhere throws away the whole document, not just that node. Release 0.3 will add many node types (footnote, equation, comment mark, section, textBox, etc.). That makes this likely in practice: a PWA tab still running a cached 0.2 bundle opens a document that a 0.3 tab saved, or a migration bug or partial write produces bad JSON. The user sees an empty page, types, and the debounced autosave persists the blank doc over the real content. Version snapshots (Ctrl+S) only help if the user made one. This goes against the non-negotiable 'preserve data'.

**Verifier.** DocumentEditor.tsx:37-45 calls useEditor without enableContentCheck or onContentError, and onUpdate calls onChange with e.getJSON(). node_modules/@tiptap/core/src/Editor.ts:107 defaults to 'enableContentCheck: false'. createNodeFromContent.ts:56-63 catches the error, logs console.warn('[tiptap warn]: Invalid content.') and returns createNodeFromContent('', ...), so the whole doc becomes empty. DocumentPage.tsx:43 wires onChange to updateContent. The cited storage.ts:56 is the doc comment; AUTOSAVE_DELAY_MS=600 is at :53. Small detail: onUpdate only fires on a doc-changing transaction, so the blank doc overwrites the stored one on the user's first edit, not on load, exactly as the auditor says. types.ts:56 also falls back to a blank doc when doc.type !== 'doc'. High severity is justified given the preserve-data rule.

**Recommendation.** Before adding any 0.3 node: set enableContentCheck:true with an onContentError handler that makes the editor read-only, shows a recovery banner, and blocks onChange (no autosave) for that session. Store a max schema/app version on each record and refuse to edit (open read-only) when record.schemaVersion is newer than the app. Add a Vitest case that loads a doc with an unknown node and asserts that no save is emitted. Effort S. Do this before 0.3.

### DOCU-22 — Plain statement: what is NOT realistically achievable at Word-level fidelity in a browser editor

*high · info · verdict: confirmed*

**Evidence.** Derived from DOCU-10, -12, -13, -15, -16, -17, -19; mammoth README limitations; Tiptap pricing (Pages/Tracked Changes paid).

**Detail.** Not realistic with free components in this architecture: (1) live editor pagination identical to Word, including mid-paragraph/table-row splits, widow/orphan rules, and per-page footnote areas; (2) balanced multi-column sections inside paginated view; (3) freely positioned or floating shapes and text boxes with tight/through wrap and z-layering; (4) Word-compatible track changes covering formatting, moves and tables; (5) lossless DOCX/ODT round-trip of arbitrary real-world files (fonts, spacing, table styles, fields, SmartArt, equations); (6) editable Word equations without building a LaTeX->OMML mapper. Achievable at a 'good student-document' level: ribbon, tabs, rulers/indents, section breaks (export-exact, editor-approximate), footnotes (endnote display in editor, real in DOCX), citations, KaTeX equations, comments, image float wrap, anchored text boxes, named styles, DOCX/ODT import of structure and export of the supported schema.

**Verifier.** This is a synthesis of the findings above. It is consistent with the evidence I verified (Tiptap pricing, the mammoth README, docx typings, the single-flow editor).

**Recommendation.** Write these limits into the PRD for 0.3 so the 'no fake features' rule holds. Label paged view as approximate and PDF/DOCX as authoritative, and import as 'content and structure'. Add a real-file validation corpus as the acceptance gate for DOCX/ODT claims.

### DOCU-12 — Section breaks and multi-column layout

*medium · recommendation · verdict: confirmed*

**Evidence.** types.ts:7-15 page settings are global; docx typings expose SectionType (5 matches) and column options (7 'readonly column' matches) in node_modules/docx/dist/index.d.ts; docx.ts:340-361 currently emits one section.

**Detail.** Export is straightforward: docx sections with their own page size, orientation, margins, headers and columns. In the editor, a section must be modelled either as a 'sectionBreak' atom carrying the next section's settings (closest to Word, and simplest to keep backward compatible: no break means today's single section) or as a wrapping 'section' node. Wrapping would restructure every existing doc, so avoid it. Columns can be shown with CSS columns on a region, but combining columns with editor pagination (DOCU-10) and balancing columns per page is not realistic to Word fidelity.

**Verifier.** types.ts:7-15 holds the global PageSettings. docx.ts:340-361 builds a single sections entry. The sectionBreak-atom recommendation is sound for backward compatibility.

**Recommendation.** Use a 'sectionBreak' atom node with attrs {type: nextPage|continuous, page settings, columns}, and migrate the v1 global 'page' to the first section (DOCU-3). Render columns with CSS columns between breaks. Export via docx sections. Effort L, risk medium-high (interaction with pagination).

### DOCU-14 — Citations/bibliography: citation-js is MIT but its CSL formatter depends on citeproc (CPAL-1.0 OR AGPL)

*medium · risk · verdict: confirmed*

**Evidence.** npm view: citation-js 0.9.0 MIT; @citation-js/plugin-csl 0.9.0 MIT with dependencies { citeproc: '^2.4.6', '@citation-js/date' }; citeproc 2.4.63 license 'CPAL-1.0 OR AGPL-1.0' (last modified 2023-04).

**Detail.** Formatting APA/MLA/IEEE/Chicago from CSL styles in JS in practice means citeproc-js. Both CPAL-1.0 and AGPL are OSI-approved, so this is free and open source, not paid. But CPAL carries attribution and source-availability obligations, including for network use, and AGPL is copyleft. Whether that fits 'free/open-source only' is a licensing-policy decision for the owner, not a technical blocker. I am not a lawyer; flag for review. Parsing BibTeX/RIS/DOI with citation-js core plugins is MIT.

**Verifier.** npm view: @citation-js/plugin-csl 0.9.0 MIT, depends on citeproc ^2.4.6. citeproc 2.4.63 is 'CPAL-1.0 OR AGPL-1.0', last modified 2023-04-17. The licensing caveat is accurate. Note that the second option is AGPL-1.0 (an old Affero licence), not AGPL-3.0.

**Recommendation.** Option A: accept citeproc under CPAL, with an attribution notice in About and the unmodified library. Gives full CSL style coverage. Effort M. Option B: MIT-only. Use citation-js for parsing and write formatters for 3-4 styles students actually need (APA 7, MLA 9, IEEE, Harvard). Effort M-L, lower fidelity on edge cases. In both cases, model a 'citation' inline atom (refIds, locator) plus a 'bibliography' block generated from a per-document library stored in DocumentContent (new optional field, DOCU-3). Export to DOCX as plain formatted text (Word-native citation fields are not worth it).

### DOCU-16 — Comments (and track changes) need custom builds; Word-compatible track changes is XL

*medium · recommendation · verdict: confirmed*

**Evidence.** Paid in Tiptap (DOCU-8). docx typings: CommentRangeStart, 'readonly comments', InsertedTextRun, DeletedTextRun present. prosemirror-changeset 2.4.6 MIT (npm view). mammoth README: 'By default, comments are ignored' and, with a style map, 'Comments will be appended to the end of the document' (readme lines 321-340).

**Detail.** Comments: a 'comment' mark with a threadId, threads stored in DocumentContent.comments (author, text, resolved, replies), a side panel anchored by mark position. Export to DOCX comments is supported by the library. On import, mammoth only appends comment text at the end, so anchors are lost unless word/comments.xml is parsed ourselves. Effort M-L, risk medium (overlapping ranges and copy/paste of marks). Track changes: a suggestion mode that turns insertions into an 'insertion' mark and deletions into a 'deletion' mark instead of deleting, plus accept/reject, needs careful transaction filtering (tables, lists, paste, IME). Compare between versions can use prosemirror-changeset to diff two snapshots. Export via InsertedTextRun/DeletedTextRun covers text only. Formatting changes and structural moves at Word fidelity are not realistic.

**Verifier.** index.d.ts has class CommentRangeStart, InsertedTextRun and DeletedTextRun. prosemirror-changeset 2.4.6 MIT. The mammoth README says 'By default, comments are ignored' (line 323) and that comments are appended to the end of the document (339-340). Tiptap pricing confirms Comments and Tracked Changes are paid.

**Recommendation.** 0.3: comments only (M-L). Defer track changes to after Yjs (0.6), where y-prosemirror snapshot diffing (MIT) can provide 'compare versions'. Scope suggestion mode to text insert/delete (XL, high risk).

### DOCU-17 — Text boxes, shapes and image text-wrap

*medium · recommendation · verdict: confirmed*

**Evidence.** Image is a block node, always centered (contentCss.ts:37; docx.ts:162-163). docx typings: class Textbox and TextWrappingType (3 matches) available. mammoth README: text box contents become 'a separate paragraph that appears after the paragraph containing the text box' (line 39-40).

**Detail.** Image wrap (float left/right with square wrap) is realistic: add attrs {align, wrap: inline|square|none} rendered with CSS float and exported as a docx floating image with TextWrappingType.SQUARE. Effort M, low-medium risk; 'tight' and 'through' wrap are not achievable. Text boxes and shapes anchored to a paragraph, flowing as floated blocks with a border and their own content, are achievable (node with content 'block+', CSS float). Effort M-L. Freely positioned objects at absolute page coordinates, behind/in-front-of-text layering, and drawing-canvas shapes inside the text flow are not realistically achievable in a contenteditable flow editor without a full layout engine. Shapes are better inserted as Diagram Studio SVG/PNG embeds (0.4 'insert diagrams into documents').

**Verifier.** contentCss.ts:37 makes img display:block with margin auto, and docx.ts:162-163 centres images. index.d.ts has class Textbox. The mammoth README at 39-40 says text box contents become a separate paragraph after the containing paragraph.

**Recommendation.** Do image float/wrap (M) and a paragraph-anchored floating textBox node (M-L). Route shapes through Diagram Studio embeds stored as asset references (DOCU-7). Do not promise absolute positioning.

### DOCU-19 — DOCX import: mammoth (BSD-2-Clause) is the pragmatic base, but it is semantic, not layout-faithful

*medium · recommendation · verdict: confirmed*

**Evidence.** npm view mammoth: 1.13.0 BSD-2-Clause, modified 2026-09-26. README (npm view mammoth readme): headings by style 'rather than attempting to exactly copy the styling (font, text size, colour, etc.)' (line 10); table formatting such as borders 'is currently ignored' (26); supports footnotes/endnotes, bold/italic/underline/strike/sup/sub (29-33); text boxes appended after the paragraph (39-40); comments ignored by default (323); underline ignored by default (288). docx-preview 0.4.1 Apache-2.0 (render-only alternative). jszip is already in the workspace (node_modules/jszip, used by docx.test.ts:1).

**Detail.** mammoth -> HTML -> editor.commands.setContent / generateJSON gives clean structure: headings, lists, tables, images, links, footnotes. It loses fonts, sizes, colours, alignment and spacing unless custom-mapped, plus table styling, page size/margins/orientation, headers/footers (I did not see them listed as supported in the README; unverified), section/column layout, text-box positioning, comment anchors and equations. Round-tripping a Word-made document will visibly reflow. Full OOXML parsing into this schema (custom, or by adapting docx-preview's parser) gives better fidelity but is XL. The '@eigenpal/docx-js-editor' MIT package is deprecated (renamed) and is a separate editor, not a converter for this schema.

**Verifier.** npm view: mammoth 1.13.0 BSD-2-Clause, modified 2026-09-26. docx-preview 0.4.1 Apache-2.0. Grepping the mammoth README for 'header' and 'footer' finds nothing, which supports the auditor's cautious 'not listed as supported'. Lines 286-291 show underline needs an explicit mapping. I did not verify the @eigenpal deprecation claim.

**Recommendation.** 0.3: mammoth with a curated styleMap, plus a small JSZip post-pass over word/document.xml (sectPr page size/margins/orientation, w:jc alignment, header/footer text) to fill PageSettings. Effort M-L. Validate with a corpus of 10-20 real student and university .docx files, and record per-file what was lost, in tests/acceptance. Say plainly in the UI that import keeps content and structure, not exact layout.

### DOCU-20 — ODT import/export

*medium · recommendation · verdict: confirmed*

**Evidence.** npm view odf-kit: 0.14.5 Apache-2.0, modified 2026-10-20, description 'Convert HTML, Markdown, TipTap JSON, Lexical JSON, DOCX and XLSX into ODF. Works in Node.js and browsers'. README (cdn.jsdelivr.net/npm/odf-kit@0.14.5/README.md): tiptapToOdt() with unknownNodeHandler; odtToHtml(); page size/margins/headers/footers/tables/lists/images; footnotes not mentioned; repo github.com/GitHubNewbie0/odf-kit; maintainer count not stated. simple-odf 3.0.3 MIT, last modified 2023-01 (stale).

**Detail.** odf-kit is the only active JS library found that covers both directions and takes Tiptap JSON directly. But it is 0.x and seems to be a single-maintainer project (inferred from the repo owner; not verified), so it is a supply-chain and bus-factor risk. ODT is plain XML (content.xml/styles.xml/meta.xml in a zip). Since we fully control our schema, writing our own ODT exporter with JSZip is feasible and auditable (Effort M for the current node set, growing with styles, footnotes and sections). Import via odtToHtml -> Tiptap parse matches the mammoth path.

**Verifier.** npm view: odf-kit 0.14.5 Apache-2.0, modified 2026-10-20, dependencies fflate and marked. The README tiptapToOdt and odtToHtml claims are not re-fetched; the auditor cites a jsDelivr URL for them. The bus-factor caveat is labelled as inferred.

**Recommendation.** Prototype with odf-kit behind an adapter interface, pin the exact version, review the code, and validate output in LibreOffice with real files. Keep a fallback plan for an in-house ODF writer (M). ODT import: odf-kit odtToHtml -> generateJSON (M), with the same loss reporting as DOCU-19.

### DOCU-3 — schemaVersion is a literal 1 with no migration pipeline

*medium · risk · verdict: confirmed*

**Evidence.** src/types.ts:19 'schemaVersion: 1;' (literal type); types.ts:54-55 normalizeDocument always writes schemaVersion: 1 regardless of input; DocumentEditor.tsx:43,54,94 always emit schemaVersion: 1.

**Detail.** Release 0.3 changes the document model: per-section page settings instead of the single global 'page', a named-style registry, comment threads, citation library, footnotes. normalizeDocument cannot tell a v1 record from a future one, and it would stamp a newer record as v1 on save, which turns a downgrade into silent corruption.

**Verifier.** types.ts:19 'schemaVersion: 1;' is a literal type. types.ts:55 always writes 1. DocumentEditor.tsx:43, :54 and :94 all emit schemaVersion: 1. No migration code exists in the package.

**Recommendation.** Widen it to schemaVersion: number and add migrate(raw) -> latest that runs ordered, pure, unit-tested steps (v1->v2: wrap page settings into sections[0], keep existing node JSON byte-identical). Keep each record's id unchanged. Never down-convert. Pair this with the read-only guard in DOCU-2. Effort S-M.

### DOCU-4 — DOCX exporter fidelity gaps (silent drops and approximations)

*medium · partial · verdict: confirmed*

**Evidence.** src/export/docx.ts: list items keep only paragraph and nested-list children (lines 180-192), so image/codeBlock/table/blockquote inside a listItem (schema allows 'paragraph block*') are dropped; table cells keep only Paragraph results (205-207), so nested tables are dropped (tableCell is 'block+'); list paragraphs and blockquote paragraphs ignore textAlign (184-189, 240-246); orderedList attrs.start is ignored (numbering instance always starts at 1, lines 176,188); table colwidth ignored, always width 100% (218); textStyle.lineHeight ignored (112-121); 'code' mark -> Courier New only (98-100); highlight -> w:shd shading, not w:highlight (107-110); image always centered inline (162-163), only data:image/(png|jpe?g|gif|bmp) embedded, anything else becomes '[Image: alt]' italic placeholder (62-70,153-155); TOC -> static 'Table of Contents' H2 + indented heading text with no page numbers/links/field (279-284); headings clamped to 1-4 (230); header/footer plain text only (353-358). docx.test.ts:29-41 covers only flat cases, so none of the drops above is tested.

**Detail.** Lost or changed when exporting to DOCX: (1) content that the editor allows but the exporter discards with no warning: blocks inside list items, nested tables; (2) formatting that is approximated: alignment inside lists and quotes, numbered-list start, column widths, line height, highlight as shading (Word's highlight UI will not recognise it), inline code shading; (3) structure: TOC as static text, not a Word TOC field, so it never updates in Word; images always centred and inline with no wrap. The print/PDF path renders the live DOM, so it has none of these drops. TXT export intentionally omits images and the TOC (text.ts:39-41).

**Verifier.** I checked every line of docx.ts. list() at 180-192 handles only nested lists and paragraphs, so other children are silently dropped. tableBlock at 205-207 keeps only Paragraph results, so nested tables are dropped. List and quote paragraphs set no alignment (184-189, 240-246). No list start is read (176, 188). Width is 100% (218). lineHeight is not read (112-121). Code mark maps to Courier New only (98-100). Highlight maps to shading (107-110). Images are always centred (162-163). The data-URL regex is at 62-70 and the placeholder at 153-155. TOC is static text (279-284). Headings are clamped (230). Header/footer are plain text (353-358). Tests at docx.test.ts:13-43 cover only flat cases. Also, docx 9 ships a TableOfContents class (7 matches in index.d.ts), so a real TOC field is available.

**Recommendation.** Make blocks()/list() recursive over all block children, and support nested tables (docx TableCell accepts Table). Map start through numbering instances, colwidth through columnWidths, lineHeight through spacing.line. Use docx TableOfContents (field; Word asks to update on open) or keep the static list plus a field. Emit w:highlight for the standard Word highlight colours and fall back to shading otherwise. Add a round-trip test fixture for every node type in the schema so a new node cannot be silently dropped (assert text survives). Effort M.

### DOCU-7 — Images stored inline as base64 inside document JSON

*medium · risk · verdict: confirmed*

**Evidence.** src/image.ts:24-42 (data URL up to 1600px); extensions/index.ts:26 Image allowBase64:true; DocumentEditor.tsx:43 full e.getJSON() on every transaction; docx.ts:62-70 relies on data URLs.

**Detail.** Every image is held inside the doc JSON, so each autosave serialises megabytes, version snapshots duplicate all images, and the planned 0.6 Yjs collaboration would carry the image bytes inside the CRDT update log. Inserting diagrams (0.4 'insert diagrams into documents') makes this worse.

**Verifier.** image.ts:24-42 produces data URLs. index.ts:26 sets allowBase64:true. DocumentEditor.tsx:43 calls getJSON() on every update, which is debounced 600ms before the write. Medium severity is reasonable.

**Recommendation.** For 0.3, add an asset store (Blob in IndexedDB keyed by id) and new image src form 'asset:<id>', resolved by a node view. Keep reading data: URLs forever (no forced migration), and have the exporters resolve both. Effort M.

### DOCU-11 — Rulers, indents and tab stops

*low · recommendation · verdict: confirmed*

**Evidence.** No indent/tab attributes in current schema (schema probe: paragraph attrs only textAlign via TextAlign; textStyle attrs listed in DOCU-1). docx typings include tabStops and indent (node_modules/docx/dist/index.d.ts, grep 'tabStops' found).

**Detail.** A horizontal ruler is a React component over the paper whose markers edit new paragraph attrs (indentLeft, indentRight, firstLine, tabStops[]). Real tab characters need a new inline 'tab' node, because ProseMirror collapses \t, and CSS layout of tab stops needs a custom node view or computed widths. A vertical ruler only makes sense with pagination.

**Verifier.** TextAlign applies only to heading and paragraph (index.ts:24), and there are no indent or tab attributes. The recommendation is reasonable. I did not re-grep tabStops.

**Recommendation.** Add indent attrs plus a horizontal ruler (Effort M, low risk; DOCX export via docx indent). Tab stops with a tab node (Effort M-L, medium risk). Vertical ruler deferred until DOCU-10.

### DOCU-13 — Footnotes/endnotes

*low · recommendation · verdict: confirmed*

**Evidence.** tiptap-footnotes 4.0.1 MIT, peerDependencies @tiptap/core ^3.0.0 and @tiptap/pm ^3.0.0, repo github.com/buttondown/tiptap-footnotes (npm view). docx typings: class FootnoteReferenceRun and 'readonly footnotes' present. mammoth README lists 'Footnotes and endnotes' as supported (npm view mammoth readme, line 29).

**Detail.** An MIT Tiptap 3 footnote extension exists. It renders footnotes as a numbered list at the end of the document with reference marks, which is endnote-style in the editor. DOCX export can produce real Word footnotes, and mammoth can import them. Footnotes at the bottom of each page in the editor depend on true pagination and are not realistic. Print can show them as endnotes, or use paged.js float:footnote (untested).

**Verifier.** npm view: tiptap-footnotes 4.0.1 MIT, peer @tiptap/core ^3.0.0 and @tiptap/pm ^3.0.0. index.d.ts has class FootnoteReferenceRun (1 match). The mammoth README lists footnotes as supported.

**Recommendation.** Spike tiptap-footnotes, or write a ~300-line equivalent so the schema stays under your control. Export to docx footnotes. Effort M, risk low-medium. Say in the UI that the editor shows notes at document end.

### DOCU-15 — Equations: editor side solved by MIT parts; native Word equations (OMML) on export is the hard part

*low · recommendation · verdict: corrected*

**Evidence.** npm view: @tiptap/extension-mathematics 3.33.1 MIT; katex 0.19.1 MIT; mathlive 0.111.4 MIT; temml 0.14.0 MIT. docx typings include MathFraction etc. (grep 'class MathFraction' = 1).

**Detail.** Inline and block math with LaTeX source and KaTeX rendering are an official MIT extension, so drop-in (Effort S). MathLive can provide a visual equation editor popover (Effort M; it is large, so lazy-load it). PDF works through KaTeX HTML/CSS (the KaTeX CSS and fonts must also go into the print iframe). DOCX: the docx library can build OMML from its Math* classes, but there is no LaTeX->OMML converter in the stack. Writing a LaTeX-subset -> docx Math mapper is L. Embedding a rendered PNG/SVG plus the LaTeX as alt text is S but not editable in Word. Whether the MathML->OMML XSLT shipped with Office can be redistributed is unclear; not verified, do not rely on it.

**Verifier.** The licences are right: mathematics 3.33.1, katex 0.19.1 and mathlive 0.111.4 are all MIT, and docx has class MathFraction. It is not a plain drop-in, though. @tiptap/extension-mathematics 3.33.1 declares peer katex '^0.16.4 || ^0.17.0 || ^0.18.0', and the current katex 0.19.1 is outside that range. katex must be pinned to 0.18.x, or the install will hit a peer conflict and an untested version. It is still Effort S, but this caveat must be stated.

**Recommendation.** 0.3: @tiptap/extension-mathematics plus KaTeX, store LaTeX in attrs, DOCX export as image plus alt LaTeX, documented as such. Later: a LaTeX-subset -> OMML mapper (fractions, scripts, roots, matrices, Greek) for editable Word equations. Import of Word equations through mammoth is not supported, so they would be lost (unverified; check with a sample file).

### DOCU-18 — Paragraph and character styles

*low · recommendation · verdict: confirmed*

**Evidence.** Current formatting is all direct: textStyle attrs color/fontSize/fontFamily/backgroundColor/lineHeight (schema probe) and heading levels 1-4 (extensions/index.ts:19). docx.ts:329-333 defines only document defaults, no named styles.

**Detail.** Named styles fit ProseMirror well: a 'styleId' attr on paragraph/heading (paragraph styles) and on a new 'charStyle' mark (character styles), plus a style registry in DocumentContent (id, name, basedOn, run and paragraph props). It is rendered by generating CSS classes from the registry and exported to docx paragraphStyles/characterStyles. Mapping headings to built-in Heading1-4 keeps the TOC and Word navigation working. Existing direct formatting stays as-is, because direct formatting overrides style, as in Word.

**Verifier.** docx.ts:329-333 defines only styles.default.document. Headings are clamped to 1-4. The recommendation is reasonable.

**Recommendation.** Effort M-L, risk medium (style UI and inheritance). Ship built-in styles first (Normal, Title, Subtitle, Heading 1-4, Quote, Caption, Code), then user-defined ones. DOCX import can map Word style names through a mammoth styleMap.

### DOCU-5 — Editor has no pages: one continuous sheet, header shown once, footer preview hard-coded to 'Page 1'

*low · partial · verdict: confirmed*

**Evidence.** src/DocumentEditor.tsx:144 "page.pageNumbers ? 'Page 1' : ''"; 176-180 one .dcos-paper with min-height: var(--paper-h) (pageCss 212-224); pageBreak is only a dashed marker (contentCss.ts:44-45).

**Detail.** Page size and margins apply to a single growing sheet. The header and footer render once, at the top and bottom of the whole document, and the footer always reads 'Page 1' however long the document is. Real page numbers exist only in print (@page counter) and DOCX (PAGE/NUMPAGES fields). The 'no fake/placeholder features' rule makes the static 'Page 1' a small honesty issue.

**Verifier.** DocumentEditor.tsx:144 hard-codes 'Page 1'. Lines 176-180 render a single .dcos-paper. pageCss at 212-224 sets min-height var(--paper-h). The page break is a dashed marker (contentCss.ts:44-45).

**Recommendation.** Until real pagination lands (DOCU-10), show 'Page numbers: on' instead of 'Page 1', or compute an estimated page count from scrollHeight and label it as an estimate.

### DOCU-6 — PDF export depends on the browser print engine; header/footer margin boxes are Chromium 131+ only

*low · partial · verdict: confirmed*

**Evidence.** src/export/print.ts:31-36 uses @page @top-center/@bottom-center with counter(page)/counter(pages); comment at print.ts:46 'Header/footer margin boxes need Chromium 131+'; cleanClone strips editing artefacts (8-17). The TOC node view prints heading text only, without page numbers (tableOfContents.tsx:43-61).

**Detail.** The PDF keeps real, selectable text and exact pagination in Chromium. In engines without @page margin-box support, the header, footer and page numbers are silently missing. I did not check current Safari/Firefox support myself. The code comment is the only evidence. The printed TOC has no page numbers. Native Tauri/Capacitor (0.8) will need a separate check of WebView print behaviour.

**Verifier.** print.ts:31-36 uses @page @top-center and @bottom-center with counter(page) and counter(pages). The Chromium 131+ note is at print.ts:46 and cleanClone at 8-17. The TOC node view (tableOfContents.tsx:43-61) shows heading text only. Like the auditor, I did not check browser support beyond the code comment.

**Recommendation.** Feature-detect, and warn in the export menu when margin boxes are unsupported. For TOC page numbers in PDF, use CSS target-counter() (Chromium supports it in print). Pair it with the stable heading IDs from @tiptap/extension-table-of-contents (MIT) or unique-id. Effort S-M.

### DOCU-9 — Ribbon UI and tabbed multiple open documents

*low · recommendation · verdict: confirmed*

**Evidence.** src/ui/Toolbar.tsx (423 lines, simple/advanced modes, all commands via editor.chain()); DocumentEditor.tsx:17-24 'Read once on mount. Remount (change key) to load different content.'

**Detail.** A ribbon is pure UI over the existing command set: Home (Toolbar commands), Insert (table/image/page break/TOC/equation/footnote), Layout (PageSetupDialog plus sections/columns), References (TOC/footnotes/citations), Review (comments/track changes), View (rulers/zoom/paged view). Tabbed documents need one Editor instance per open tab (kept mounted and hidden) or a serialise/restore on tab switch, because DocumentEditor reads initialContent only once. Hash routes and document IDs need not change; tabs can be a UI layer over /documents/:id.

**Verifier.** DocumentEditor.tsx:16-18 says 'Read once on mount. Remount (change key) to load different content.' and useState(() => normalizeDocument(initialContent)) is at :24. The recommendation is sound. I did not count the Toolbar.tsx lines.

**Recommendation.** Effort M, low risk. Keep the simple mode (students) as a collapsed ribbon. Cap open tabs (for example 8) because of memory with image-heavy docs. Flush pending autosave on tab switch and close.

### DOCU-1 — Engine, schema and stored content shape (baseline description)

*info · info · verdict: confirmed*

**Evidence.** packages/document-studio/package.json (tiptap ^3.0.0, docx ^9.5.0); installed @tiptap/core 3.33.1, docx 9.15.3, prosemirror-model 1.25.13 (node_modules/*/package.json). src/extensions/index.ts:16-35; src/types.ts:17-23,50-60; src/DocumentEditor.tsx:37-45. Schema probe with StarterKit+TableKit+Image+TextStyleKit: NODES paragraph,blockquote,bulletList,codeBlock,doc,hardBreak,heading,horizontalRule,listItem,orderedList,text,table,tableCell,tableHeader,tableRow,image; MARKS link,textStyle,bold,code,italic,strike,underline; listItem 'paragraph block*'; tableCell 'block+'; image group 'block'; textStyle attrs backgroundColor,color,fontFamily,fontSize,lineHeight. The real schema adds highlight, subscript, superscript, pageBreak and tableOfContents.

**Detail.** The engine is Tiptap 3 on ProseMirror with a React binding (useEditor/EditorContent). documentExtensions() is the single schema source, with the comment 'only add, never remove' (extensions/index.ts:15). Custom extensions: PageBreak (atom block div[data-type=page-break], Mod-Enter; pageBreak.ts:12-38), TableOfContents (atom block with a React node view that lists headings live and stores nothing; tableOfContents.tsx:66-90), SearchReplace (plugin state plus inline decorations, per-textblock matching; searchReplace.ts:24-83). Stored record: {schemaVersion:1, doc: JSONContent, page:{size A4|Letter, orientation, margins mm, header, footer (plain strings), pageNumbers}, mode:'simple'|'advanced'}. Images are block nodes whose src is a base64 data URL, downscaled to 1600px with WebP converted (image.ts:27-43). Page settings are global to the document. There are no sections, styles, IDs on nodes, or comments/annotations.

**Verifier.** package.json deps match (tiptap ^3.0.0, docx ^9.5.0). extensions/index.ts:15 has the 'only add, never remove' comment and lines 16-35 list the extensions as described (heading levels [1,2,3,4] at :19, Image allowBase64 at :26). types.ts:17-23 is the DocumentContent shape and :50-60 is normalizeDocument. pageBreak.ts:12-38 is an atom block with Mod-Enter. tableOfContents.tsx:66-90 is an atom with a React node view. image.ts:27-43 downscales to 1600px and converts WebP. I did not re-run the schema probe.

**Recommendation.** Treat this JSON shape as the v1 contract. Every 0.3 feature must be added as new optional attrs or new node/mark types plus a versioned migration (see DOCU-3), never as renames of the existing nodes, marks or attrs.

### DOCU-21 — Engine choice: keep Tiptap 3 / ProseMirror

*info · recommendation · verdict: confirmed*

**Evidence.** Licenses (npm view): lexical 0.53.0 MIT, @lexical/yjs MIT, slate 0.147.4 MIT, @tiptap/y-tiptap 3.3.0 MIT, prosemirror-changeset MIT. ONLYOFFICE DocumentServer AGPL-3.0 (github.com/ONLYOFFICE/DocumentServer); Collabora Online MPL-2.0 (collaboraoffice.com licensing page, Wikipedia), both server-side office engines.

**Detail.** Switching engines would force a migration of every stored doc (the preserve-data rule) and gain nothing for 0.3. Lexical and Slate have no pagination, comments, track changes or DOCX advantage, and their ecosystems for these features are thinner than ProseMirror's, which also has mature collaboration (y-prosemirror) and change tracking (prosemirror-changeset). OnlyOffice (AGPL-3.0) and Collabora (MPL-2.0) would give near-Word fidelity, including pagination and native DOCX/ODT, but they are heavy server processes. That conflicts with offline-first PWA and Android, the documents would live in their format rather than the current JSON, and OnlyOffice's AGPL adds copyleft obligations. A Tauri-only sidecar might be possible in 0.8, but not for the web build.

**Verifier.** The reasoning is consistent with the repo and with the licences above. I did not re-check the OnlyOffice AGPL-3.0 and Collabora MPL-2.0 licences in this pass, but they match the public licences I know of.

**Recommendation.** Keep Tiptap/ProseMirror. Put investment into: schema safety (DOCU-2/3), a per-node exporter test matrix (DOCU-4), and the OSS or custom pieces above. Re-evaluate only if Word-exact layout becomes a hard requirement, and then as an optional desktop-only LibreOffice-based import/convert path, not a replacement editor.

### DOCU-8 — Official Tiptap Pages, Conversion (DOCX), Comments, Compare and Tracked Changes are paid; core editor is MIT

*info · info · verdict: corrected*

**Evidence.** https://tiptap.dev/pricing (fetched 2026-11-13): 'The Tiptap Editor is open source (MIT) and free'; 'Only platform features and cloud documents are priced'. Pages ('Page-based layouts') in Team/Business/Enterprise; Comments, 'Import DOCX and Markdown', 'Export DOCX - PDF - ODT - EPUB - Markdown' in Start and above (paid plans); Compare in Team+; 'Tracked Changes' is a separate add-on with custom pricing. https://tiptap.dev/docs/pages/getting-started/install.md (Pages is a Pro package needing a subscription/trial). npm view: @tiptap/extension-mathematics, -table-of-contents, -unique-id, -drag-handle, -details all 3.33.1 MIT.

**Detail.** The task's premise is confirmed. Pagination, DOCX/ODT conversion, comments, snapshot compare and track changes cannot use Tiptap's official packages under the free-only rule. These formerly-Pro extensions are now MIT and usable: Mathematics (KaTeX), TableOfContents, UniqueID, DragHandle, Details.

**Verifier.** The tiptap.dev/pricing fetch confirms 'The Tiptap Editor is open source (MIT) and free'. Pages is Team and above. Comments and Import/Export DOCX are in Start and above (Start costs $59/mo, and the only free option is a 30-day trial). Compare versions is Team and above. Tracked Changes is a custom-priced add-on. npm view confirms Mathematics, TableOfContents, UniqueID, DragHandle and Details are all 3.33.1 MIT. The correction is to the 'drop-in' reading: @tiptap/extension-drag-handle 3.33.1 has peerDependencies on @tiptap/y-tiptap, @tiptap/extension-collaboration and @tiptap/extension-node-range, so it pulls in collaboration packages. @tiptap/extension-mathematics has peer katex '^0.16.4 || ^0.17.0 || ^0.18.0'. I did not fetch the Pages install doc.

**Recommendation.** Do not depend on @tiptap-pro/* or the Tiptap private registry. Build on the MIT extensions above plus the OSS libraries named in DOCU-10..21.

### Found by the verifier (missed by the auditor)

- Peer-version trap for the equation plan. @tiptap/extension-mathematics 3.33.1 declares peer katex '^0.16.4 || ^0.17.0 || ^0.18.0' (npm view), but katex latest is 0.19.1. Installing katex@latest breaks the peer range, so katex must be pinned to 0.18.x. The same applies to KaTeX CSS and fonts in the print iframe.
- @tiptap/extension-drag-handle 3.33.1 has peerDependencies on @tiptap/y-tiptap ^3.0.7, @tiptap/extension-collaboration 3.33.1 and @tiptap/extension-node-range 3.33.1 (npm view). Adopting it in 0.3 pulls in the Yjs collaboration stack before 0.6, so DOCU-8's 'usable' should carry that caveat.
- The DOCX TOC gap has a free fix inside the existing dependency. docx 9 exports a TableOfContents class (7 matches in node_modules/docx/dist/index.d.ts), which can emit a real Word TOC field instead of the static text at docx.ts:279-284. The fix is cheap, so DOCU-4's TOC item rates low effort.
- Image formats and data URLs. readImageFile converts only WebP (image.ts:34-39). Any data URL that does not match /^data:image\/(png|jpe?g|gif|bmp)/ (docx.ts:63) becomes '[Image: ...]' in the DOCX, and so does any non-data src, for example a remote http image pasted into the editor, since the Image node accepts any src. A remote image also breaks the offline-first promise. This is plausible but I did not test paste behaviour; low severity.
- In runStyle (docx.ts:107-119), the highlight mark and textStyle.backgroundColor both write s.shading, so whichever mark comes later in the marks array silently wins. When both are present, one colour is lost. Low severity, verified by reading the code.

## Diagram engine

The Diagram Studio (packages/diagram-studio/src, about 1,500 lines of source) is a controlled React Flow 12 editor. Installed: @xyflow/react 12.12.1 (MIT), html-to-image 1.11.11 (MIT, pinned), jspdf 4.2.1 (MIT). It has one custom node type, 'shape'. Each shape node draws one of 12 ShapeKinds as pixel-space SVG, puts an HTML label over it, and has 4 loose 'source' handles. Edges are standard React Flow edges, styled from ConnectorData through styledEdge(). History is a 150-entry snapshot UndoStack of {nodes, edges}. A snapshot is pushed before each change (drag start, resize start, connect, reconnect, onBeforeDelete, inspector focus or click, label commit). So label typing does NOT snapshot per keystroke, and undo after inspector edits works. Serialization is a whitelist tagged schemaVersion: 1 with tolerant deserialization, but it never checks the version and has no migration step. Layout is a band-based tidy tree that rewrites edge handles. All exports go through html-to-image. The SVG export is HTML wrapped in a foreignObject (not true vector), and the PDF is a 3x raster. Confirmed bugs, all moderate or small: undo does not revert autoLayout; inspector focus wipes the redo stack; arrow-key moves are not undoable; Tab and Enter are taken over on toolbar buttons; an old cached build would silently drop newer fields; large exports can exceed WebKit canvas limits. Every Release 0.4 item can be built with free libraries: React Flow core sub-flows, zIndex, the free Rotatable Node and NodeResizer examples, d3-hierarchy (ISC), dagre (MIT), and our own orthogonal router. elkjs (EPL-2.0 OR GPL-3.0) and libavoid-js (LGPL-2.1) are usable but need a licence decision. React Flow Pro examples (helper lines, undo/redo, copy/paste, editable edge, shapes, selection grouping) must not be copied.

| ID | Severity | Status | Finding | Verdict |
|---|---|---|---|---|
| DIAG-6 | high | risk | No schemaVersion check or migration; an older build silently drops fields from newer data | corrected |
| DIAG-12 | medium | recommendation | 0.4: 100+ shapes, using a data-driven shape registry | corrected |
| DIAG-13 | medium | recommendation | 0.4: groups, layers, z-order, lock | confirmed |
| DIAG-15 | medium | recommendation | 0.4: orthogonal and automatic rerouting connectors (licences) | corrected |
| DIAG-17 | medium | recommendation | 0.4: editable project format (.dcosdiagram) | confirmed |
| DIAG-18 | medium | recommendation | 0.4: inserting diagrams into documents and presentations | confirmed |
| DIAG-5 | medium | bug | Tab and Enter shortcuts take over keyboard focus navigation | confirmed |
| DIAG-7 | medium | partial | SVG export is HTML in a foreignObject, not true vector art; PDF is a raster | confirmed |
| DIAG-8 | medium | risk | Large-diagram raster export can exceed canvas area limits (iOS/WebKit) | corrected |
| DIAG-10 | low | partial | Copy/paste and IDs: in-memory clipboard, fixed paste offset, 32-bit random IDs | confirmed |
| DIAG-11 | low | partial | Edge labels can only be edited in the inspector; layout overwrites custom edge handles | confirmed |
| DIAG-14 | low | recommendation | 0.4: rotation, distribute, properties panel | confirmed |
| DIAG-16 | low | recommendation | 0.4: automatic layouts (tree, layered, radial mind map, grid) | confirmed |
| DIAG-2 | low | bug | Undo does not restore settings.autoLayout after Arrange | confirmed |
| DIAG-3 | low | bug | Focusing an inspector field pushes an empty snapshot and clears redo | confirmed |
| DIAG-4 | low | bug | Moving nodes with the arrow keys cannot be undone | corrected |
| DIAG-9 | low | risk | Every drag frame serializes and stringifies the whole diagram | confirmed |
| DIAG-1 | info | info | Engine and data model overview | confirmed |
| DIAG-19 | info | info | Licence posture of the current stack and Pro-example boundaries | corrected |

### DIAG-6 — No schemaVersion check or migration; an older build silently drops fields from newer data

*high · risk · verdict: corrected*

**Evidence.** types.ts:137-161 (serialize whitelists node fields id/position/width/height/data/zIndex and always writes schemaVersion 1); types.ts:164-197 (deserialize ignores c.schemaVersion); grep shows no diagram migration code; the PWA service worker can serve an older cached bundle

**Detail.** 0.4 will add parentId, rotation, locked, layer, opacity and similar fields. If a stale 0.1 bundle, such as a cached PWA on a second device after import, opens a 0.4 diagram, it loads it, emit() runs on mount (DiagramEditor.tsx:122), and autosave writes it back as schemaVersion 1 without the new top-level node fields. Fields stored inside data survive because they are spread through. Unknown shape kinds render as an empty SVG (shapes.tsx:35-88 has no default case). Edges with unknown types fall back to React Flow defaults.

**Verifier.** The mechanics are confirmed. serializeDiagram (types.ts:137-161) whitelists id, position, width, height, data and zIndex, and hard-codes schemaVersion 1. deserializeDiagram (164-197) never reads schemaVersion. node.data is spread, so fields inside data survive. ShapeSvg's switch (shapes.tsx:35-88) has no default case, so an unknown kind renders an empty <svg>. grep finds no diagram migration code; the only 'migrat' match is the DB upgrade in packages/local-storage/src/indexeddb.ts. Two corrections. The PWA uses registerType:'autoUpdate' (apps/web/vite.config.ts:13), so a stale bundle mostly means a tab left open from before an update, or another device that has not updated yet; Settings and Files have backup import paths. And today the risk is latent, since no newer schema exists yet. It is a forward-compatibility blocker that must be fixed before 0.4 ships new fields. 'High' is acceptable as a pre-0.4 gating priority, but not as a present-day bug.

**Recommendation.** Before 0.4: add migrateDiagram(raw) with a version ladder (1 to 2 to ...). If schemaVersion is greater than the supported version, open the diagram read-only and disable autosave. Put the new fields in a versioned shape so the deserializer keeps unknown keys (pass through an extras bag). Render a visible 'unknown shape' placeholder. Add round-trip tests with fixtures.

### DIAG-12 — 0.4: 100+ shapes, using a data-driven shape registry

*medium · recommendation · verdict: corrected*

**Evidence.** shapes.tsx:3-16,30-94 (hard-coded switch); types.ts:3-15 (closed ShapeKind union); types.ts:86-114

**Detail.** Today each shape needs 4 edits: the type union, the defaults, the switch case and the label inset. That does not scale to 100+ shapes in the basic, flowchart, UML (class, actor, lifeline, package, component, note), ER (entity, attribute, relationship, weak entity), network (server, cloud, router), BPMN (task, gateways, start, intermediate and end events, pool or lane, data object) and academic (axes, beaker, Venn) categories.

**Verifier.** The hard-coded closed union and switch are confirmed (types.ts:3-15, shapes.tsx:35-88, labelInset shapes.tsx:97-116, shapeDefaults types.ts:86-114). The count is off. A visible shape also needs a SHAPE_CATALOG entry (shapes.tsx:3-16) for palette name and hint, which makes up to 5 places. shapeDefaults has a default case, so a defaults entry is optional. The recommendation stands.

**Recommendation.** Build a registry: ShapeDef{ id:'bpmn.gateway.exclusive', category, name, keywords, defaultSize, defaultStyle, path(w,h) returning SVG path or elements, labelInset, ports?, aspectLock?, compartments? }. Keep the 12 existing kinds as IDs that alias the legacy names so stored data does not change. Make the node type generic and look shapes up by ID. Add searchable palette categories. Draw icons for network shapes yourself, or take them from MIT/ISC sets such as lucide (ISC). Do not copy draw.io stencils without checking their licence. UML classes and ER entities need multi-compartment nodes, which means structured data (attributes and methods), not one label. Effort: L (1.5-3 weeks for 100 shapes with tests). Risk: medium, because of label fitting.

### DIAG-13 — 0.4: groups, layers, z-order, lock

*medium · recommendation · verdict: confirmed*

**Evidence.** https://reactflow.dev/examples (Sub Flow = free; 'Parent Child Relation' and 'Selection Grouping' = Pro); types.ts:54-61 (zIndex already persisted, no UI)

**Detail.** Groups: React Flow core supports parentId with positions relative to the parent, extent:'parent', and a requirement that parents come before children in the array. This is MIT and documented in the free Sub Flow example. Grouping and ungrouping must convert between absolute and relative positions. React Flow 12 has getNodesBounds, and internals.positionAbsolute is available through useInternalNode or getInternalNode. Z-order: node.zIndex already round-trips. Bring forward and send back are a simple renumbering. Lock: set node.draggable=false, connectable/deletable=false, and selectable optionally. Persist it as a locked flag and derive the React Flow props from it. Layers: add a diagram-level layers[] {id,name,visible,locked} and node.layerId. Derive hidden or draggable from the layer, and base zIndex on layer order.

**Verifier.** I re-fetched https://reactflow.dev/examples. Sub Flow is free (MIT). Parent Child Relation and Selection Grouping are Pro. zIndex round-trips through types.ts:60,146,178, with no UI for it. The design advice (parentId, extent, parent-before-child order, locked flag mapped to draggable, connectable and deletable) matches React Flow 12 core APIs.

**Recommendation.** Write the grouping logic yourself. Do not copy the Pro example code. Extend the schema (v2) with parentId, locked, layerId and layers. Effort: M (1-1.5 weeks). Risk: medium, because nested-group coordinate maths and undo are the hard parts. Add tests for group, ungroup, nested drag and delete-with-children.

### DIAG-15 — 0.4: orthogonal and automatic rerouting connectors (licences)

*medium · recommendation · verdict: corrected*

**Evidence.** npm view: libavoid-js 0.5.0-beta.5 LGPL-2.1-or-later; elkjs 0.12.1 'EPL-2.0 OR GPL-3.0-or-later'; https://reactflow.dev/examples (Editable Edge = Pro)

**Detail.** React Flow's smoothstep and step edges are orthogonal, but they do not route around obstacles. libavoid-js, a WASM port of Adaptagrams libavoid, does real obstacle-avoiding orthogonal routing. It is LGPL-2.1, which is acceptable if loaded as a separate, replaceable module (dynamic import of an unmodified package with the licence and source notice kept). However, it is a beta with a WASM payload, and LGPL obligations are not trivial in Tauri or Capacitor bundles. ELK's layered algorithm routes orthogonal edges, but only as part of a full layout, not incremental rerouting. EPL-2.0 is a weak copyleft at file level: using the unmodified library from MIT code is generally fine, but it is not MIT. Get a policy decision on it. I am not a lawyer.

**Verifier.** Licences re-checked with npm view: libavoid-js 0.5.0-beta.5 LGPL-2.1-or-later, elkjs 0.12.1 'EPL-2.0 OR GPL-3.0-or-later'. Editable Edge is Pro. Omission: the examples page also lists an 'Edge Routing' example as Pro, and it overlaps directly with obstacle-avoiding orthogonal routing. It must also go on the do-not-copy list. The LGPL and EPL guidance is a reasonable non-lawyer summary and correctly asks for a policy decision.

**Recommendation.** Stage 1: build a custom edge with user-editable orthogonal waypoints (stored in edge.data.points) and a simple MIT-licensed own router, for example A* on a sparse grid around node bounding boxes (with an optional MIT helper library), computed on drag stop. Stage 2: optionally add libavoid-js behind a feature flag once licence compliance is documented. Effort: L (2-3 weeks). Risk: high for quality and performance. Do not copy the Pro Editable Edge code.

### DIAG-17 — 0.4: editable project format (.dcosdiagram)

*medium · recommendation · verdict: confirmed*

**Evidence.** types.ts:74-80 (DiagramContent with schemaVersion: 1 already exists); see DIAG-6

**Detail.** The stored content is already JSON with a version tag. A file format only needs a wrapper: {format:'dcos-diagram', schemaVersion, app:{name,version}, id, title, createdAt, updatedAt, content: DiagramContent, assets?:{id:dataURL}}. Import must run migrateDiagram and validate the data, for example with zod (MIT) or a hand-written guard. When an imported ID already exists, either create a new item or ask whether to replace it, without silently overwriting. JSON with embedded images as data URLs is simpler than a ZIP. jszip is MIT or GPL-3.0, at the user's choice, and is fine if a ZIP is needed later.

**Verifier.** DiagramContent with schemaVersion: 1 is at types.ts:74-80. zod is MIT (npm view, 4.6.7). jszip 3.10.2 is '(MIT OR GPL-3.0-or-later)'. The wrapper design is a reasonable recommendation and depends on fixing DIAG-6.

**Recommendation.** Effort: S (2-3 days) once migrations exist. Risk: low. Add round-trip tests for 0.1 files, 0.4 files and files from a future version (the last should open read-only).

### DIAG-18 — 0.4: inserting diagrams into documents and presentations

*medium · recommendation · verdict: confirmed*

**Evidence.** export.ts (only DOM-based capture, needs a mounted editor); packages/document-studio uses Tiptap 3

**Detail.** Embedding needs to render a diagram without mounting the editor, which the current export cannot do (export.ts:27-31 needs the live .react-flow__viewport). The recommended model is a Tiptap atom node, diagramEmbed{diagramId, snapshotSvg or assetId, width, caption, sourceVersion}. It shows the stored SVG snapshot, an 'Edit diagram' action opens #/diagram/:id, and an 'Update' action re-renders it when the source version is newer than sourceVersion. DOCX export must use a PNG fallback (docx ImageRun) because Word's SVG support needs a PNG fallback and does not handle foreignObject. PPTX (0.5, pptxgenjs is MIT) can take PNG or SVG. All of this depends on the native SVG serializer in DIAG-7.

**Verifier.** export.ts:27-31 needs a live .react-flow__viewport (viewportOf), and every export takes the mounted flow element, so headless rendering for embeds is impossible today. pptxgenjs 4.0.1 is MIT (npm view). The PNG-fallback advice for DOCX is sound, and it is required in any case because foreignObject content would not render in Word.

**Recommendation.** Build the model-to-SVG renderer first (DIAG-7), then the Tiptap node and the snapshot refresh. Effort: M (1 week, after DIAG-7). Risk: medium, because of stale snapshots and deleted source diagrams. Show a 'source missing' state and keep the snapshot.

### DIAG-5 — Tab and Enter shortcuts take over keyboard focus navigation

*medium · bug · verdict: confirmed*

**Evidence.** DiagramEditor.tsx:93-96 (isTyping only exempts INPUT/TEXTAREA/SELECT/contentEditable), 325-341 (keydown on the outer div calls preventDefault for 'tab'/'enter' when one node is selected), 366

**Detail.** While one node is selected, pressing Tab on a toolbar or palette button adds a child node instead of moving focus. Pressing Enter on a focused button, such as Fit or Undo, adds a sibling and cancels the button's own activation. This is a keyboard accessibility regression, and the 0.4 ribbon and properties panel will make it worse.

**Verifier.** isTyping (DiagramEditor.tsx:93-96) exempts only INPUT, TEXTAREA, SELECT and contentEditable, so BUTTON is not exempt. onKeyDown (339-340) calls preventDefault and stopPropagation for Tab and Enter when one node is selected. The handler sits on the outer div at line 366, which wraps the toolbar (368) and the shape palette buttons (457-486). It is worse than reported: the Menu component renders its items inline, with no portal (packages/ui/src/components.tsx:214-233). So Enter on the Arrange and Export menu items also adds a sibling instead of running the action, which blocks keyboard export via Enter whenever one node is selected. The inspector panel is unaffected, because it stops propagation (DiagramEditor.tsx:531). Medium severity is justified.

**Recommendation.** Only handle the tree shortcuts when focus is inside the canvas: e.target is within .react-flow and is not a button. Better still, attach the handler to the ReactFlow wrapper rather than the whole editor.

### DIAG-7 — SVG export is HTML in a foreignObject, not true vector art; PDF is a raster

*medium · partial · verdict: confirmed*

**Evidence.** export.ts:42-47 (toSvg with skipFonts); node_modules/html-to-image/lib/util.js:212-226 (svg > foreignObject > cloned HTML); export.ts:50-60 (PDF embeds a toPng at pixelRatio 3)

**Detail.** Labels and the shape layout are XHTML inside a foreignObject, with fonts skipped. Inkscape and Office (Word/PowerPoint) do not render foreignObject content, so the result shows blank or missing labels and is unusable for print or academic submission. The PDF has no selectable text and a large file size.

**Verifier.** export.ts:42-47 calls toSvg with skipFonts. html-to-image lib/util.js:208-226 (nodeToDataURL) builds svg > foreignObject > cloned DOM. The PDF embeds toPng at pixelRatio 3 (export.ts:50-60). Even the shape SVGs are nested inside the XHTML in the foreignObject, so nothing is native top-level vector. Inkscape and Office not rendering HTML foreignObject is well-established general knowledge, but it was not re-tested here.

**Recommendation.** Write a native SVG serializer from the model. Shapes are already pixel-space SVG (ShapeSvg can be rendered with renderToStaticMarkup). Turn labels into <text>/<tspan> elements with simple word-wrap, compute edge paths with @xyflow/system's getSmoothStepPath/getBezierPath/getStraightPath, and add <marker> defs. Build the PDF from that SVG with svg2pdf.js (MIT) plus jsPDF so it is vector. Medium effort (3-5 days). This also gives clean SVG for embedding diagrams in documents and slides.

### DIAG-8 — Large-diagram raster export can exceed canvas area limits (iOS/WebKit)

*medium · risk · verdict: corrected*

**Evidence.** export.ts:36-40 (PNG pixelRatio 2), 52 (PDF pixelRatio 3); node_modules/html-to-image/lib/util.js:139-147 (clamps only each side to 16384, not total area)

**Detail.** A 4000x3000 px diagram exported to PDF needs a 12000x9000 canvas (108 Mpx). WebKit, which runs Safari, iOS and the Capacitor iOS WebView, caps canvas area at about 16.7 Mpx. Past that, toPng returns a blank image or throws. This is likely from general WebKit knowledge but was not tested here. Bounds come only from getNodesBounds(nodes) (export.ts:10), so edge labels or routes more than 40 px outside the node bounds get clipped.

**Verifier.** html-to-image clamps each side to 16384 only (lib/util.js:139-147), with no area check, and the bounds come only from getNodesBounds(nodes) plus 40 px padding (export.ts:4-24), so edge geometry outside the node box gets clipped. Confirmed. Correction: the roughly 16.7 Mpx (4096x4096-equivalent) canvas-area cap applies to iOS and iPadOS WebKit, so mobile Safari and a Capacitor iOS WebView. It does not apply to desktop Safari, or to the macOS WKWebView a Tauri build would use, which allow much larger canvases. The 4000x3000 to 12000x9000 (108 Mpx) arithmetic is right. Not tested here; risk/medium is reasonable.

**Recommendation.** Work out pixelRatio from a maximum pixel area, for example min(requested, sqrt(16e6/(w*h))), and tell the user when it was reduced. Include edge label boxes in the bounds. The native SVG path in DIAG-7 avoids the problem for SVG and PDF.

### DIAG-10 — Copy/paste and IDs: in-memory clipboard, fixed paste offset, 32-bit random IDs

*low · partial · verdict: confirmed*

**Evidence.** DiagramEditor.tsx:68-70 (newId = prefix + randomUUID().slice(0,8)), 106, 241-257

**Detail.** Pasting remaps node and edge IDs correctly and keeps only internal edges. Limits: the clipboard is a ref inside the component, so it is lost on navigation and cannot paste between diagrams or apps. Repeated pastes stack at the same +40 offset. IDs carry 32 random bits with no collision check, which carries low but non-zero risk once diagrams are merged or imported. There is no Cut (Ctrl+X). Existing IDs must be kept as-is under the 0.4 rules.

**Verifier.** newId uses randomUUID().slice(0,8), which is 8 hex digits or 32 bits, with no collision check (DiagramEditor.tsx:68-70). The clipboard is a useRef (106). Paste uses a fixed +40 offset from the stored positions, so repeated pastes stack on top of each other (257, 241-251). Only edges internal to the selection are copied (255, 245-247). onKeyDown has no 'x' (cut) handler (333-341).

**Recommendation.** Use the system clipboard with a custom MIME type, plus a JSON text fallback. Increase the offset on each paste. Generate full UUIDs or nanoid (MIT) for new elements only and keep existing IDs unchanged. Add Cut.

### DIAG-11 — Edge labels can only be edited in the inspector; layout overwrites custom edge handles

*low · partial · verdict: confirmed*

**Evidence.** Inspector.tsx:115-125 (label Input only); DiagramEditor.tsx has no onEdgeDoubleClick or custom edgeTypes; layout.ts:122-123 forces b/t or r/l handles on every laid-out edge; layout.ts:38-41 keeps only the first parent per node

**Detail.** There is no on-canvas editing of edge labels, and the labels cannot be dragged or repositioned. Running Arrange rewires flowchart branches, for example a 'No' branch that leaves from the right side. Back-edges and merge nodes, the second parent of a node, are ignored by the tree layout. The layout is fine for trees but poor for general flowcharts.

**Verifier.** The edge label is only an Input in the inspector (Inspector.tsx:115-125). There is no onEdgeDoubleClick and no edgeTypes in DiagramEditor.tsx (489-523). layout.ts:122-123 overwrites the handles of every edge whose endpoints were both placed, which includes non-tree back-edges and second-parent edges. layout.ts:38-41 keeps only the first parent per target.

**Recommendation.** 0.4: add a custom edge type using EdgeLabelRenderer (free in the core library) for inline label editing, plus a draggable label offset stored in edge data. Keep the tidy tree for mind maps and org charts. Use dagre or ELK layered layout for general graphs (DIAG-16).

### DIAG-14 — 0.4: rotation, distribute, properties panel

*low · recommendation · verdict: confirmed*

**Evidence.** https://reactflow.dev/examples (Rotatable Node = free, Node Resizer = free, Helper Lines = Pro); DiagramEditor.tsx:260-283 (align exists, no distribute); Inspector.tsx:51-100 (no geometry fields)

**Detail.** Rotation: the free Rotatable Node example applies a CSS transform rotate to the node content, with a d3-drag (ISC) handle. React Flow does not know about rotation, so handles, bounds and MiniMap use the unrotated box, and edges attach at the unrotated handle positions. Export must apply the transform as well. Distribute: sort the selection by x or y and spread the gaps evenly, about 30 lines next to align(). Properties panel: x and y come from node.position (convert to absolute for children). w and h from node.width and node.height. Rotation, opacity and shadow (an SVG filter or CSS drop-shadow) become new data fields, and font family and size extend ShapeData. Edit numeric fields with snapshot-on-commit (blur or Enter), not per keystroke (see DIAG-3).

**Verifier.** The examples page lists Rotatable Node and Node Resizer as free, and Helper Lines as Pro. align() exists with no distribute (DiagramEditor.tsx:260-283). NodeInspector has no geometry fields (Inspector.tsx:51-100). d3-drag 3.0.1 is ISC (npm view). The point that React Flow ignores rotation for handles and bounds is accurate, because node geometry has no rotation field.

**Recommendation.** Rotation: M effort, medium risk, because the connection points need rotating. Compute handle positions yourself or accept approximate attachment, and document the limit. Distribute and the properties panel: S-M effort, low risk. Smart guides (helper lines) are Pro as an example, so implement them from scratch if wanted.

### DIAG-16 — 0.4: automatic layouts (tree, layered, radial mind map, grid)

*low · recommendation · verdict: confirmed*

**Evidence.** layout.ts:24-125 (tree only); npm view: d3-hierarchy 3.1.3 ISC, @dagrejs/dagre 3.1.3 MIT, d3-force 3.0.1 ISC, elkjs EPL-2.0 OR GPL-3.0; https://reactflow.dev/examples (Dagre Tree and Elkjs Tree free; Auto Layout, Force Layout and Dynamic Layouting Pro)

**Detail.** Radial mind map: d3-hierarchy's tree() with size([2*PI, radius]) and separation, then convert polar to Cartesian. Grid layout: trivial, rows and columns from a count and the maximum cell size. Layered flowcharts: @dagrejs/dagre (MIT) fits an MIT-preferred policy, and ELK gives better results but is EPL. Force layout for concept maps: d3-force (ISC). Keep the current layoutTree for compatibility, because templates call it at templates.ts:41-46.

**Verifier.** npm view: d3-hierarchy 3.1.3 ISC, @dagrejs/dagre 3.1.3 MIT, d3-force 3.0.1 ISC. On the examples page, Dagre Tree and Elkjs Tree are free, and Auto Layout, Force Layout and Dynamic Layouting are Pro. layout.ts is tree-only. templates.ts:44 calls layoutTree, inside the cited 41-46 range.

**Recommendation.** Use d3-hierarchy for tree and radial layouts, @dagrejs/dagre for layered graphs and grid code written in-house. Add ELK later only if the policy allows EPL. Run layouts in a Web Worker for large graphs. Effort: S-M (3-5 days). Risk: low.

### DIAG-2 — Undo does not restore settings.autoLayout after Arrange

*low · bug · verdict: confirmed*

**Evidence.** DiagramEditor.tsx:72-75 (Snapshot = nodes+edges only), 181-191 (applyLayout sets settings.autoLayout), 225 (addChild re-lays out when autoLayout != 'none')

**Detail.** Repro: choose Arrange > Tree top-to-bottom, then press Ctrl+Z. Nodes return to their old positions, but autoLayout stays 'TB'. The next Tab (add child) runs relayout() on the whole graph again, which undoes the user's manual arrangement.

**Verifier.** Snapshot is {nodes, edges} only (DiagramEditor.tsx:72-75). restore() (129-135) never touches settings. applyLayout sets autoLayout: dir at line 190, after snapshot() at 186. addChild re-lays out the whole graph when autoLayout !== 'none' (225). Undoing an Arrange therefore leaves auto-arrange on, and the next Tab or Enter re-arranges everything.

**Recommendation.** Add settings, or at least autoLayout, to Snapshot, and restore it in restore().

### DIAG-3 — Focusing an inspector field pushes an empty snapshot and clears redo

*low · bug · verdict: confirmed*

**Evidence.** Inspector.tsx:61 and :120 call onPatch({}, {snapshot:true}) on focus; DiagramEditor.tsx:285-287 snapshots before checking for an empty patch; history.ts:14 push() sets future=[]

**Detail.** Clicking into the Text or Label field without typing adds a no-op undo step (Ctrl+Z appears to do nothing) and throws away the redo stack. Clicking a swatch that is already selected does the same, because set() always snapshots.

**Verifier.** Inspector.tsx:61 and :120 call onPatch({}, {snapshot:true}) on focus. patchNodes and patchEdges (DiagramEditor.tsx:285-289, 291-292) call snapshot() before the empty-patch early return. history.ts:14 clears future in push(). Swatch onPick calls set(), which always snapshots (Inspector.tsx:53, 29), even when the picked colour is already applied. Severity low is fair.

**Recommendation.** Snapshot lazily: on focus, remember a pending baseline, and push it only on the first real change. Skip patches whose values equal the current ones.

### DIAG-4 — Moving nodes with the arrow keys cannot be undone

*low · bug · verdict: corrected*

**Evidence.** DiagramEditor.tsx:498 only snapshots onNodeDragStart; node_modules/@xyflow/react/dist/esm/index.js:2093-2099 (moveSelectedNodes on arrow keys, nodesFocusable defaults to true)

**Detail.** React Flow moves the selected nodes by 1 or 4 grid steps on arrow keys. That path does not go through drag start, so no snapshot is pushed. Ctrl+Z then jumps back past all the keyboard moves to the previous snapshot. Mouse drag of a multi-selection is fine: in @xyflow/system 0.0.84 (dist/esm/index.js:2265-2275), onNodeDragStart also fires for selection drags.

**Verifier.** The gist holds: snapshots only come from onNodeDragStart (DiagramEditor.tsx:498) and the other explicit calls. Keyboard moves go through moveSelectedNodes, which never fires onNodeDragStart, and the app's onKeyDown (325-342) does not handle arrow keys. The cite needs correcting. In @xyflow/react 12.12.1, dist/esm/index.js:2093-2099 is the NodesSelection (multi-selection rectangle) handler. The usual path, a single focused and selected node, is in NodeWrapper at index.js:2312-2324. nodesFocusable defaults to true (index.js:3337). The selection-drag claim is right: @xyflow/system 0.0.84 dist/esm/index.js:2265-2275 fires onNodeDragStart for drags without a nodeId too.

**Recommendation.** Snapshot in onNodesChange when a position change arrives with dragging===false outside a drag. Or handle arrow keys yourself, with coalescing.

### DIAG-9 — Every drag frame serializes and stringifies the whole diagram

*low · risk · verdict: confirmed*

**Evidence.** DiagramEditor.tsx:119-122 (emit on every nodes/edges change, including drag positions and selection); apps/web/src/lib/storage.ts:138-142 (JSON.stringify on each call)

**Detail.** During a drag or resize, React Flow updates node positions every pointermove frame. Each update rebuilds the serialized content and runs a full JSON.stringify. Costs grow with node count, and every ShapeNode re-renders when editingId changes, because context bypasses memo (DiagramEditor.tsx:148). This is fine at a few hundred nodes. Large diagrams were not benchmarked, so the size of the impact is uncertain.

**Verifier.** useEffect(emit, [nodes, edges, settings, emit]) (DiagramEditor.tsx:122) serializes on every nodes or edges state change, including drag frames and selection. updateContent JSON.stringify-s the whole content on each call (apps/web/src/lib/storage.ts updateContent). The actions useMemo depends on editingId (148), so every memo'd ShapeNode that consumes the context re-renders when editing starts or stops. The impact is unmeasured, as the auditor says.

**Recommendation.** Skip emit while a node is dragging or resizing (check change.dragging or resizing) and emit on drag stop. Move editingId out of the shared context, or use a selector store.

### DIAG-1 — Engine and data model overview

*info · info · verdict: confirmed*

**Evidence.** packages/diagram-studio/src/DiagramEditor.tsx:65,98-122,489-523; ShapeNode.tsx:16-21,56-87; shapes.tsx:3-16,30-94; types.ts:3-80,117-131

**Detail.** The editor is a controlled ReactFlow using useNodesState/useEdgesState. nodeTypes={shape}. ConnectionMode.Loose, snap grid [10,10], elevateEdgesOnSelect. Node = Node<ShapeData,'shape'>, where ShapeData holds shape, fill, stroke, strokeWidth, textColor, fontSize, dashed, bold and label. Edge = Edge<ConnectorData{color,width,dashed,arrow}>. Every change runs emit(), which calls serializeDiagram and then onChange. The web app (apps/web/src/lib/storage.ts:53,138-146) debounces saves by 600 ms and skips content that has not changed. There are 12 shapes in a hard-coded switch: rectangle, rounded, ellipse, circle, diamond, parallelogram, hexagon, triangle, cylinder, document, note and text. A label is edited with a textarea after a double-click or F2, and Enter commits it as a single snapshot.

**Verifier.** Checked DiagramEditor.tsx:65 (nodeTypes {shape}), 98-122 (useNodesState/useEdgesState, emit via useEffect at 122), 489-523 (ConnectionMode.Loose 509, snapGrid [10,10] 512, elevateEdgesOnSelect 520). types.ts:3-80 has the ShapeKind union and the ShapeData/ConnectorData shapes. shapes.tsx:30-94 has the 12-case switch. ShapeNode.tsx:16-21 has 4 handles, all type="source". LabelEditor (ShapeNode.tsx:31-48) commits on Enter or blur through updateNodeData, which snapshots once (DiagramEditor.tsx:140-146). storage.ts has AUTOSAVE_DELAY_MS=600 and updateContent JSON.stringify-compares against lastSavedContent. UndoStack is constructed with 150 (DiagramEditor.tsx:105). One small point: non-test source is about 1,600 lines (1,733 total minus the 130-line test), not about 1,500.

**Recommendation.** Keep React Flow 12 (MIT) as the engine for 0.4. It is a good fit for node-graph diagrams. Replace the switch with a data-driven shape registry (see DIAG-12).

### DIAG-19 — Licence posture of the current stack and Pro-example boundaries

*info · info · verdict: corrected*

**Evidence.** node -e package.json reads: @xyflow/react 12.12.1 MIT, html-to-image 1.11.11 MIT, jspdf 4.2.1 MIT; https://reactflow.dev/examples Pro flags

**Detail.** The React Flow library itself is MIT, with no proOptions in use (DiagramEditor.tsx:489-523 leaves hideAttribution unset, so the attribution stays, which is correct). Pro covers only example source code and support. These Pro examples overlap with 0.4 features: Helper Lines, Undo and Redo, Copy and Paste, Auto Layout, Parent Child Relation, Selection Grouping, Editable Edge, Shapes, Dynamic Layouting, Expand and Collapse, Force Layout and Freehand Draw. The existing UndoStack and paste code are original work, which is fine.

**Verifier.** Installed versions and licences confirmed from node_modules package.json: @xyflow/react 12.12.1 MIT, @xyflow/system 0.0.84 MIT, html-to-image 1.11.11 MIT (pinned exactly in packages/diagram-studio/package.json:11), jspdf 4.2.1 MIT. No proOptions on the <ReactFlow> element (DiagramEditor.tsx:489-523). The Pro list is incomplete. The examples page also marks Edge Routing, Node Position Animation, Collaborative (relevant to 0.6 Yjs) and Server Side Image Creation (relevant to DIAG-18 headless rendering) as Pro, so those must not be copied either.

**Recommendation.** Implement the overlapping features from the core API docs only, and record this in docs (clean-room note). Keep the html-to-image 1.11.11 pin (a newer 1.11.13 exists, but the pin is deliberate) until the native SVG export replaces it.

### Found by the verifier (missed by the auditor)

- Enter is hijacked on the Arrange and Export dropdown items too, not only toolbar buttons. packages/ui/src/components.tsx:214-233 renders the Menu items inline, with no portal, inside the editor's outer div, where onKeyDown is attached (DiagramEditor.tsx:366). With one node selected, Enter on 'PDF' or 'Tree: top to bottom' runs preventDefault and addSibling (DiagramEditor.tsx:340) instead of the item's click, so keyboard users cannot export with Enter. This adds to DIAG-5.
- React Flow Pro examples the auditor did not list: 'Edge Routing' (overlaps 0.4 orthogonal and obstacle routing), 'Collaborative' (overlaps 0.6 Yjs), 'Server Side Image Creation' (overlaps the headless diagram render needed for document embeds) and 'Node Position Animation'. Source: https://reactflow.dev/examples, re-fetched today. These need to go on the do-not-copy list.
- There are no interaction or component tests for DiagramEditor. packages/diagram-studio/src/diagram.test.ts only covers UndoStack, layoutTree, serialization and templates (describe/it at lines 7-118). The undo, keyboard-shortcut, inspector-snapshot and export paths (DIAG-2 to DIAG-5, DIAG-8) have no automated coverage. Before 0.4 adds groups, rotation and layers on the same code, it would help to add tests of the history and serialization contracts, for example round-trip tests that preserve unknown fields.
- Opening an older or partial diagram causes a write-back even if the user changes nothing. deserializeDiagram fills defaults (types.ts:170-177, 196), emit() runs on mount (DiagramEditor.tsx:122), and updateContent writes whenever the normalized JSON differs from lastSavedContent (apps/web/src/lib/storage.ts updateContent). Any normalization change in a future build therefore silently rewrites stored diagrams on first open. That is relevant to the 'preserve data, incremental migrations' rule and makes the DIAG-6 risk wider than stale bundles alone.

## Tests

I re-ran all three suites today from /Users/yaswanth/college os without changing anything. `npx vitest run` (Vitest v5.1.0) gave 3 files and 37/37 tests passing in 265ms. `npx tsc -p tsconfig.json` exited 0. `cd backend && .venv/bin/python -m pytest -q` gave 3 passed in 0.25s. These match docs/audit/baseline-test-run.md. The suites are good but narrow. They test pure logic and the storage adapter in Node (fake-indexeddb): IndexedDbAdapter CRUD, versions, trash and backup, DOCX XML substrings, the print HTML string, text flattening, the diagram UndoStack, tree layout, serialization and templates. Nothing renders React and there is no DOM environment: vitest.config.ts uses environment 'node' and only collects packages/*/src/**/*.test.ts. That means apps/web and any .test.tsx file are never collected, and jsdom, @testing-library, Playwright and a coverage provider are not installed. The most important untested code is: the useEditableItem autosave/conflict/flush hook (the only thing between typing and IndexedDB), the search/replace plugin, the TOC node, the DocumentEditor and DiagramEditor components, diagram export.ts (PNG/SVG/PDF), normalizeDocument, the ThemeProvider, and any IndexedDB schema upgrade path. There is only one migration (SCHEMA_VERSION = 1), so no v1→v2 upgrade test is possible yet, but no harness exists for one either. Several PRD §11 criteria marked ✅ in CHECKLIST.md rest only on one hand-check in Chromium. "Local data survives application restart ✅" is backed by a test that reopens a fake-indexeddb connection, which cannot detect browser eviction, and incident S-1 shows exactly that eviction. Before any Release 0.3 work, a regression net should exist: (1) frozen v0.1.0 content fixtures plus load tests, (2) DOCX golden/structural tests, (3) a jsdom-based hook and editor test layer, (4) Playwright smoke and offline tests in Chromium, Firefox and WebKit run in CI, (5) a migration-test harness, and (6) a coverage baseline with @vitest/coverage-v8@5.1.0.

| ID | Severity | Status | Finding | Verdict |
|---|---|---|---|---|
| TEST-14 | high | recommendation | Proposed pre-0.3 regression gate (ordered) | confirmed |
| TEST-2 | high | risk | Vitest config silently excludes apps/web and any .test.tsx file; no DOM environment | confirmed |
| TEST-3 | high | missing | useEditableItem autosave/conflict/flush hook has zero tests | confirmed |
| TEST-4 | high | missing | No frozen v0.1.0 content fixtures; content normalizers and the DB upgrade path are untested | confirmed |
| TEST-5 | high | bug | 'Survives restart ✅' evidence cannot detect browser storage eviction (incident S-1) | confirmed |
| TEST-9 | high | recommendation | No browser end-to-end tests; propose Playwright smoke + offline suite (Apache-2.0) | confirmed |
| TEST-10 | medium | partial | Backup import edge cases beyond the happy path are untested | corrected |
| TEST-13 | medium | partial | Acceptance checklist ✅ items backed only by manual evidence | confirmed |
| TEST-6 | medium | partial | DOCX tests assert XML substrings only; no golden files, no schema validation, many marks/nodes uncovered | confirmed |
| TEST-7 | medium | missing | Search/replace plugin, TOC node, PageBreak and print in a real browser are untested | confirmed |
| TEST-8 | medium | missing | Diagram editor interactions and export.ts (PNG/SVG/PDF) have no automated tests | confirmed |
| TEST-11 | low | missing | React UI layer (pages, AppShell, ThemeProvider, toasts, dialogs) has no tests | confirmed |
| TEST-12 | low | recommendation | No coverage measurement; how to add @vitest/coverage-v8 (not installed) | confirmed |
| TEST-1 | info | works | Re-run results: 37/37 Vitest, tsc clean, 3/3 pytest (matches baseline) | confirmed |

### TEST-14 — Proposed pre-0.3 regression gate (ordered)

*high · recommendation · verdict: confirmed*

**Evidence.** Synthesis of TEST-2 through TEST-13. The current suite (37 Vitest + 3 pytest) has no fixtures, no DOM tests and no browser tests. Owner non-negotiables: preserve features, routes, document/diagram IDs and data, with incremental migrations.

**Detail.** The order follows the risk of losing data during 0.3/0.4 changes.

**Verifier.** This is a synthesis with no new factual claims, and it is consistent with the verified findings above. Every proposed tool is free/open source: Playwright Apache-2.0, jsdom 31.0.0 MIT (npm view), @testing-library/react 16.3.3 (peers react ^18||^19), and @vitest/coverage-v8 5.1.0.

**Recommendation.** Required before the first 0.3 commit: (1) Capture the tests/fixtures/v0.1.0 content and backup fixtures from the running v0.1.0 app, and add the load/normalize/round-trip tests plus the IndexedDB v1-open harness (TEST-4). (2) Add DOCX golden files for every fixture, plus an independent re-parse (TEST-6). (3) Change the Vitest include and environment, and add the useEditableItem tests (TEST-2, TEST-3). (4) Add Playwright 1.65.0 against `vite preview` with these specs: document create→edit→reload→export, diagram create→edit→reload→export, offline via context.setOffline(true) after the SW is ready, backup export→wipe→import, fixtures-by-original-id, and persistent-context restart (TEST-5, TEST-9). Chromium runs per PR and Firefox and WebKit nightly or before release. (5) Add search/replace, TOC and backup edge-case units (TEST-7, TEST-10). (6) Record a coverage baseline (TEST-12). Then, each 0.3 change must keep (1)–(4) green, and any intended change to the golden or fixture output needs an explicit snapshot update in review. Python: keep pytest, but the backend is a skeleton (3 tests: /health, /api/v1/info, CORS) and is not on the data path yet.

### TEST-2 — Vitest config silently excludes apps/web and any .test.tsx file; no DOM environment

*high · risk · verdict: confirmed*

**Evidence.** vitest.config.ts:5 `include: ['packages/*/src/**/*.test.ts', 'tests/**/*.test.ts']` and vitest.config.ts:6 `environment: 'node'`. `ls node_modules | grep -iE 'jsdom|happy-dom|testing-library|playwright|coverage'` returned nothing. node_modules/@vitest contains only `spy`. tests/unit/ and tests/integration/ hold only .gitkeep.

**Detail.** A component test written as Foo.test.tsx, or any test placed under apps/web/src, would never be collected and would not fail CI. Vitest would just not run it. Even if it were collected, there is no DOM environment, so React, Tiptap and React Flow cannot mount. This explains why no UI test exists at all.

**Verifier.** vitest.config.ts:5 has include ['packages/*/src/**/*.test.ts','tests/**/*.test.ts'] and :6 has environment 'node'. node_modules/@vitest contains only 'spy'. Grepping node_modules for jsdom, happy-dom, testing-library, playwright and coverage returns nothing. tests/unit and tests/integration are empty apart from .gitkeep, and `find` turns up only the 3 .test.ts files. A *.test.tsx file, or any test under apps/, would not be collected.

**Recommendation.** Widen include to `['apps/*/src/**/*.test.{ts,tsx}','packages/*/src/**/*.test.{ts,tsx}','tests/**/*.test.{ts,tsx}']`. Keep 'node' as the default and opt DOM files in per file with `// @vitest-environment jsdom`, or use Vitest projects with a separate 'dom' project. Add these devDependencies, all free/OSS: jsdom@31.0.0 (MIT), @testing-library/react@16.3.3 (MIT), @testing-library/user-event (MIT). Exclude e2e/** from Vitest so Playwright specs are not picked up.

### TEST-3 — useEditableItem autosave/conflict/flush hook has zero tests

*high · missing · verdict: confirmed*

**Evidence.** apps/web/src/lib/storage.ts:59-196. It has debounce (L135 `setTimeout(() => void flush(), AUTOSAVE_DELAY_MS)`), in-flight serialization (L81), ConflictError handling that blocks autosave and keeps pending edits (L111-116), non-conflict error retention (L118-120), selection-only no-op (L144), resolveConflict 'save-copy'/'load-latest' (L163-186), and flush on visibilitychange, pagehide and unmount (L185-193). No test file exists under apps/web, and vitest.config.ts:5 does not include apps/.

**Detail.** This hook is the only code path between user edits and IndexedDB. CHECKLIST.md:14 marks 'Autosave works ✅' with only a browser observation that the status read "Saved on this device". Release 0.3 brings tabbed multiple open documents, which means several hook instances and concurrent flushes, and then Yjs. Both will rework this logic with no safety net. Untested behaviours include: two rapid edits making a single write; an edit arriving during an in-flight save being written after it; a stale version raising conflict without losing pending content; 'save-copy' creating '(my copy)' with the pending content; unmount flushing pending edits; and an error status keeping the edits and retrying on the next schedule.

**Verifier.** Every cited line in apps/web/src/lib/storage.ts checks out: useEditableItem L59, in-flight await L96 and version ref L80, conflict handling L111-116, error retention L118-120, schedule setTimeout L135, selection no-op L142, resolveConflict L159-181, visibilitychange/pagehide/unmount flush L184-194. The selection no-op is at L142 rather than L144, and the auditor's 'L81 in-flight serialization' really points at L96 (`if (inFlight.current) await inFlight.current`). No test exists under apps/. CHECKLIST.md:14 confirms the browser-only evidence.

**Recommendation.** Add apps/web/src/lib/storage.test.tsx (jsdom + fake-indexeddb/auto + renderHook + vi.useFakeTimers()). Cases: (a) debounce coalesces N updates into 1 save and the version goes up by exactly 1; (b) identical content does not write; (c) a second adapter instance bumps the version, the next flush sets status 'conflict', blocks further schedules, and keeps pending; (d) resolveConflict('save-copy') creates the copy and the original stays at the stored content; (e) resolveConflict('load-latest') discards the edits; (f) unmount and dispatching 'pagehide' or visibilitychange=hidden persist pending edits; (g) a failing save (non-cloneable content) gives status 'error' with the edits retained. To make the module-level `storage` singleton injectable, the hook may need a small refactor. That is acceptable but must happen in a separate commit.

### TEST-4 — No frozen v0.1.0 content fixtures; content normalizers and the DB upgrade path are untested

*high · missing · verdict: confirmed*

**Evidence.** packages/local-storage/src/indexeddb.ts:19 `SCHEMA_VERSION = 1`, MIGRATIONS has one entry (L44-52), and the upgrade loop is at L70-72. packages/document-studio/src/types.ts:50-60 normalizeDocument always emits `schemaVersion: 1` and has no version dispatch. packages/diagram-studio/src/types.ts:75/139 hard-code schemaVersion 1. normalizeDocument is not referenced in any test file: docx.test.ts imports only createEmptyDocument and the templates. diagram.test.ts tests deserializeDiagram only on templates and synthetic garbage.

**Detail.** Release 0.3/0.4 will add new Tiptap nodes (footnotes, citations, equations, comments, sections, columns, text boxes), new diagram fields (groups, layers, rotation, locks), and new IndexedDB stores. The non-negotiable is that existing IDs and data keep loading. There are no fixtures captured from v0.1.0 and no test that opens a version-1 database with a newer SCHEMA_VERSION. Without these, regressions will only show up in a user's browser. The current tests use today's templates, which change with the code, so they cannot detect drift.

**Verifier.** indexeddb.ts:19 sets SCHEMA_VERSION = 1. MIGRATIONS (L44-52) has one entry, and the upgrade loop is at L70-72. document-studio types.ts:50-60 normalizeDocument always emits schemaVersion 1 with no dispatch on version. diagram-studio types.ts:75/134/139 hard-code 1. No test file imports normalizeDocument: docx.test.ts:5 imports only createEmptyDocument and the DocumentContent type.

**Recommendation.** Before any 0.3 change, commit tests/fixtures/v0.1.0/. Include: (1) documents/*.json, i.e. the raw WorkspaceItem records exported via exportBackup() from the real app, one per template plus a 'kitchen-sink' document using every node and mark in extensions/index.ts (headings, every list type, table with header, image base64, pageBreak, tableOfContents, codeBlock, highlight multicolor, sub/sup, textStyle color/fontSize, link, textAlign); (2) diagrams/*.json covering every ShapeKind, every connector arrow/dash/type, and zIndex; (3) backup-v1.json, a full dcos-backup with versions and a trashed item. Mark these files read-only by convention, enforced with a CODEOWNERS entry or a checksum test. Tests: (a) normalizeDocument(fixture) deep-equals a stored expected snapshot; (b) every fixture loads into a headless Tiptap Editor built from createExtensions() with `enableContentCheck: true`, without throwing or dropping nodes, comparing editor.getJSON() to the fixture; (c) deserializeDiagram, then serializeDiagram, is idempotent and keeps every node and edge id; (d) a migration harness that creates a DB at version 1 with fake-indexeddb, writes the v1 fixtures, reopens with the current SCHEMA_VERSION, and asserts that every id, title, version and content is preserved and listVersions still works; (e) importBackup(backup-v1.json) into an empty DB and into a populated DB.

### TEST-5 — 'Survives restart ✅' evidence cannot detect browser storage eviction (incident S-1)

*high · bug · verdict: confirmed*

**Evidence.** tests/acceptance/CHECKLIST.md:34 'Local data survives application restart | ✅ | Unit: reopen DB connection; Browser: reload'. packages/local-storage/src/indexeddb.test.ts:29-34 closes and reopens the same fake-indexeddb DB in one process. apps/web/src/lib/storage.ts:31-38 calls persist() only once, gated on persistRequested. Incident S-1 (2026-11-13): IndexedDB and localStorage for localhost:5173 were empty after a desktop-app restart while persisted() === false.

**Detail.** The unit test proves the adapter re-reads its own data. It cannot model the browser evicting best-effort storage. The ✅ therefore overstates what was verified, and a real data-loss incident happened under that ✅. No test checks when navigator.storage.persist() is requested, and the Settings 'Make storage persistent' path (apps/web/src/pages/SettingsPage.tsx:25-105) has no test either.

**Verifier.** CHECKLIST.md:34 reads 'Unit: reopen DB connection; Browser: reload'. indexeddb.test.ts:29-34 closes and reopens a fake-indexeddb DB in the same process. storage.ts:31-39 has a module-level persistRequested flag. requestPersistentStorage is called only from NewItemDialog.tsx:32 (item creation) and SettingsPage.tsx:100 (the manual button). Nothing tests either call site.

**Recommendation.** Downgrade CHECKLIST.md:34 to 🟡 and cite S-1. Add: (a) a jsdom unit test that stubs navigator.storage and asserts persist() is requested at app start or first load, not only on create, once that fix lands; (b) a Playwright test using a persistent context (chromium.launchPersistentContext with a userDataDir in a temp dir) that creates items, closes the browser, relaunches with the same userDataDir and asserts the items are still there; (c) a check that `await page.evaluate(() => navigator.storage.persisted())` is true after the app requests it. Browsers may refuse persistence, so assert the UI warns when it is false rather than asserting it is always true. Note that real eviction cannot be forced deterministically in tests, so (b) checks restart durability only. Eviction must also be mitigated in the product, for example with backup prompts.

### TEST-9 — No browser end-to-end tests; propose Playwright smoke + offline suite (Apache-2.0)

*high · recommendation · verdict: confirmed*

**Evidence.** `npm view @playwright/test version license` returned '1.65.0', 'Apache-2.0'. CHECKLIST.md:47 says 'Web application passes browser tests | 🟡 Chromium by hand; automated browser tests not yet added'. CHECKLIST.md:15/35 say the offline/airplane-mode run has not been done. docs/TESTING.md 'Next' already plans Playwright and context.setOffline(true).

**Detail.** PRD §11 Platforms requires 'Web application passes browser tests' and §12 requires offline, persistence and regression tests. The app uses a hash router, so deep links like /#/documents/<id> are easy to drive. The PWA service worker only exists in a production build, so the offline test must run against `vite preview`, not the dev server.

**Verifier.** `npm view @playwright/test version license` returned 1.65.0 and Apache-2.0. CHECKLIST.md:47, :15 and :35 match. docs/TESTING.md:34-37 'Next' lists Playwright in Chromium/WebKit/Firefox and context.setOffline(true). PRD §11 starts at docs/PRD.md:502 and §12 QA at :543, listing offline tests (:550), data persistence tests (:551) and regression tests (:554).

**Recommendation.** How to add it: run `npm i -D @playwright/test@1.65.0` at the root, then `npx playwright install --with-deps chromium firefox webkit` (in CI, cache ~/.cache/ms-playwright). Create playwright.config.ts with `webServer: { command: 'npm run build && npm run preview -- --port 4173 --strictPort', url: 'http://localhost:4173', reuseExistingServer: !process.env.CI }`, `use.baseURL`, and projects chromium, firefox, webkit, plus a 'mobile-chromium' project using devices['Pixel 7'] for the Capacitor target. Add `"test:e2e": "playwright test"` and a CI job. Specs in e2e/: (1) document.spec: create from each template, type and format, wait for the 'Saved on this device' status, reload, assert content; rename; export DOCX/TXT and check the download name, size > 0 and that the zip contains word/document.xml; print → page.pdf in Chromium only. (2) diagram.spec, as in TEST-8. (3) offline.spec: load once, wait for `navigator.serviceWorker.ready`, call `context.setOffline(true)`, reload, then create, edit, reload and reopen both a document and a diagram, and assert no failed requests except intentional ones. (4) backup.spec: export the backup download, clear storage via context.clearCookies plus evaluate indexedDB.deleteDatabase, or use a new context, import the file through the setInputFiles chooser, and assert the items and ids return. (5) conflict.spec: open the same document in two pages, edit both, and assert the conflict UI with save-copy. (6) fixtures.spec: seed IndexedDB with the v0.1.0 fixtures (TEST-4) via addInitScript/evaluate, then open each by its original id route and assert it renders. (7) restart.spec using launchPersistentContext (TEST-5). Run the whole suite in Chromium on every PR and all three engines nightly or before release, because WebKit is the closest proxy for the Safari and iOS IndexedDB behaviour that matters for offline-first.

### TEST-10 — Backup import edge cases beyond the happy path are untested

*medium · partial · verdict: corrected*

**Evidence.** indexeddb.test.ts:87-115 covers an empty-device round trip, a divergent copy, an identical skip, a wrong format and schemaVersion 99. Not covered: packages/local-storage/src/indexeddb.ts validateBackup (L330-351) accepts items without checking content, updatedAt or deletedAt; the import loop (L270-296) handles trashed items, version records whose itemId is not in items (`continue`, L286), and re-imported version id collisions (`if (await store.get(id)) continue`, L289).

**Detail.** Restore is the main mitigation for eviction (S-1), and 0.6 sync and 0.8 SQLite will reuse this format. Untested cases: a backup containing trashed items (do they stay trashed?); importing the same backup twice (idempotence, versionsAdded = 0 the second time); the 'copied' path re-mapping version itemIds to copyId; orphan versions being ignored; a backup with schemaVersion < current once v2 exists; items with missing content or updatedAt; a large backup (for example 500 items with images) completing inside one transaction; and a failure mid-import rolling back the whole import.

**Verifier.** The gist is right but the line numbers are off. importBackup runs L264-299, with the item loop at L271-287 and the version loop at L288-296. The orphan-version `continue` is at L290 (not L286). The collision `if (await store.get(id)) continue` is at L293 (not L289), and it only applies when targetId === v.itemId (L292); copied items get fresh uuids. validateBackup is L331-351 and does not check content, updatedAt or deletedAt. The existing tests (indexeddb.test.ts:87-115) cover the empty-device round trip, the identical skip (L104), the divergent copy, a wrong format and schemaVersion 99. Idempotence/versionsAdded, trashed items, orphan versions and rollback on mid-import failure are untested, as stated.

**Recommendation.** Extend indexeddb.test.ts with: double import is idempotent; trashed item round-trip; copied item versions point to copyId and listVersions(copyId) is non-empty; orphan version ignored; rollback on a malformed record mid-list (no partial import); and backup-v1.json fixture import (TEST-4). If missing content is meant to be rejected, add that to validateBackup in a separate code change, test-first.

### TEST-13 — Acceptance checklist ✅ items backed only by manual evidence

*medium · partial · verdict: confirmed*

**Evidence.** tests/acceptance/CHECKLIST.md: L12 creation, L13 editing (find & replace all), L14 autosave, L23 flowcharts, L25 connectors and L28 PNG/PDF exports are ✅ with Browser evidence only. L15/L35 offline, L16 DOCX in Word and L17 PDF in Safari/Firefox are 🟡. Last run 2026-11-12 in Chromium only (L4-6). PRD §12 (docs/PRD.md, 'Every module must include … Offline tests … Regression tests') and release gates 'All P0 acceptance tests pass'.

**Detail.** Six ✅ criteria have no repeatable evidence and rest on one manual Chromium session on the dev server, not the production PWA build. Row 34 is overstated (TEST-5). Row 26 (undo/redo) cites a generic unit test that does not exercise the editor (TEST-8).

**Verifier.** CHECKLIST.md rows 12, 13, 14, 23, 25 and 28 are ✅ on Browser evidence only. Row 24 also cites a unit test (no overlaps in tree templates), and row 26 cites UndoStack. L4 says checks were done by hand in Chromium on the dev server, and L6 says last run 2026-11-12. The PRD §12 lines and the 'All P0 acceptance tests pass' gate at PRD.md:560 match. One addition: row 37 ('Interrupted saves') is also weaker than its ✅ suggests (see missed).

**Recommendation.** Map each checklist row to a named automated test id, e.g. `e2e/document.spec.ts › autosave survives reload`, and add a CHECKLIST column 'Automated test'. Allow ✅ only when that test passes in CI. Keep manual-only checks (Word/LibreOffice open, Safari print) as explicitly labelled pre-release steps with a date and browser/OS version recorded.

### TEST-6 — DOCX tests assert XML substrings only; no golden files, no schema validation, many marks/nodes uncovered

*medium · partial · verdict: confirmed*

**Evidence.** packages/document-studio/src/export/docx.test.ts:55-75 uses `toContain` checks on word/document.xml. L90-95 checks templates only for `document.length > 100`. docx.ts handles bold/italic/underline/strike/code/subscript/superscript/highlight/textStyle and paragraph/heading/lists/blockquote/codeBlock/horizontalRule/image/table/pageBreak/tableOfContents (`grep -no "case '...'" docx.ts`), but the sample (L13-43) covers only bold, textStyle, link, heading, lists, table, pageBreak, image and blockquote. CHECKLIST.md:16 says 'Not yet opened in Microsoft Word'.

**Detail.** italic, underline, strike, code, sub/sup, highlight, codeBlock, horizontalRule and tableOfContents export are not asserted. The substring checks would still pass if the XML were malformed elsewhere, if element order changed, or if numbering.xml/styles.xml references broke. No test re-opens the file with a second reader. Release 0.3 adds DOCX+ODT import and export, so a reliable byte-level regression oracle is needed first.

**Verifier.** docx.test.ts:55-75 uses only toContain on XML strings, and L90-95 only checks document.length > 100. docx.ts has mark cases at L86-112 (bold, italic, underline, strike, code, subscript, superscript, highlight, textStyle) and node cases at L226-279. One small refinement: the sample includes a link mark (L26) but no assertion checks it. Link export (docx.ts:132-137, ExternalHyperlink) is therefore exercised but not verified. CHECKLIST.md:16 confirms the file was never opened in Word.

**Recommendation.** Add a golden-file suite. For each v0.1.0 fixture (TEST-4), build the DOCX, unzip it with JSZip, canonicalise the XML parts (document.xml, styles.xml, numbering.xml, header*/footer*, [Content_Types].xml, _rels) by pretty-printing and stripping volatile attributes such as rsid, docProps dates and random image names, then compare to committed files under tests/golden/docx/<fixture>/ using toMatchFileSnapshot. Updates require the reviewer to run `vitest -u` deliberately. Add a per-mark/per-node table test for the uncovered types. Add structural validation by round-tripping through an independent free parser, e.g. mammoth (BSD-2) to HTML, asserting text and heading order survive. Optionally add a CI job that converts with LibreOffice headless (`soffice --headless --convert-to pdf`, MPL-2.0) on ubuntu-latest and fails on a non-zero exit. Opening in Microsoft Word stays a manual release step (docs/TESTING.md step 1).

### TEST-7 — Search/replace plugin, TOC node, PageBreak and print in a real browser are untested

*medium · missing · verdict: confirmed*

**Evidence.** packages/document-studio/src/extensions/searchReplace.ts:24 `export function findMatches(doc, term, caseSensitive)`, with stepSearch L100, replaceCurrent L107 and replaceAll L118. tableOfContents.tsx:20 `export function collectHeadings(doc)`. pageBreak.ts:18-22 parseHTML/renderHTML. None is imported by any test file. print.ts is tested only as a string (docx.test.ts:107-114). CHECKLIST.md:17 'not yet exported by hand in Safari/Firefox'.

**Detail.** findMatches and collectHeadings are pure ProseMirror functions and can be tested in Node with a schema from `getSchema(createExtensions())` from @tiptap/core. replaceAll position mapping is classic bug territory: a replacement of a different length, matches across marks, a case-insensitive replacement count. The print path, an iframe with @page margin boxes, can only be checked in a real browser. Chromium's page.pdf() can confirm it renders and has the expected page count, though Chromium's support for @page margin boxes should be checked before asserting header text.

**Verifier.** searchReplace.ts has findMatches at L24, stepSearch L100, replaceCurrent L107 and replaceAll L118. collectHeadings is at tableOfContents.tsx:20, and pageBreak.ts parseHTML/renderHTML are at about L18-24. No test imports any of them. print is tested only as a string at docx.test.ts:107-114, and CHECKLIST.md:17 matches. The auditor rightly left the Chromium @page margin-box support question open.

**Recommendation.** Add packages/document-studio/src/extensions/searchReplace.test.ts. Cover: matches across text nodes split by marks, case sensitivity, an empty term, and replaceAll with longer and shorter replacements returning the right count and leaving no stale matches. Run it with a headless `new Editor({ extensions, content })` under jsdom. Add tableOfContents.test.ts for collectHeadings levels, ordering and empty-heading handling. Add a PageBreak HTML round-trip (getHTML() → setContent()). Print becomes a Playwright case (TEST-9).

### TEST-8 — Diagram editor interactions and export.ts (PNG/SVG/PDF) have no automated tests

*medium · missing · verdict: confirmed*

**Evidence.** packages/diagram-studio/src/DiagramEditor.tsx (551 lines), Inspector.tsx (155), ShapeNode.tsx (87) and export.ts (61) have no test. export.ts:36-60 exportPng/exportSvg/exportPdf depend on html-to-image and a live `.react-flow__viewport` (L27-30). CHECKLIST.md:25-28 marks Connectors, Undo/redo, Save/reopen and PNG/PDF exports ✅ on browser evidence. 'Undo and redo' cites only the generic UndoStack unit (diagram.test.ts:8-24), not the editor wiring.

**Detail.** Release 0.4 rewrites this area: groups, layers, rotation, orthogonal routing, a properties panel. Right now nothing would catch a broken keyboard shortcut (⌘Z, Tab-to-add-child), a connector detaching, handles leaking into exports (export.ts:7 EXCLUDED list), or an empty-diagram export error. html-to-image needs real layout, so jsdom is not suitable for export.

**Verifier.** Line counts are exact: DiagramEditor 551, Inspector 155, ShapeNode 87, export.ts 61. export.ts has the EXCLUDED list at L7, viewportOf `.react-flow__viewport` at L27-31, exportPng at L36 with the empty-diagram throw at L37. diagram.test.ts tests UndoStack only generically. CHECKLIST.md:25-28 rows are browser-backed.

**Recommendation.** Cover this in Playwright, Chromium first. Open a template diagram, drag a node, connect two handles, press ⌘/Ctrl+Z and ⌘/Ctrl+Shift+Z and assert positions, press Tab on a tree node and assert a child appears. Reload and assert node/edge count and viewport via the serialized IndexedDB record read with page.evaluate. Export PNG/SVG/PDF via page.waitForEvent('download'). Assert: PNG magic bytes and width ≈ (bounds + 80) × 2; SVG contains no 'react-flow__handle'; PDF starts with '%PDF' and has 1 page. Add a Vitest unit for captureOptions bounds and padding by exporting it or testing it via exportPng with a mocked html-to-image.

### TEST-11 — React UI layer (pages, AppShell, ThemeProvider, toasts, dialogs) has no tests

*low · missing · verdict: confirmed*

**Evidence.** apps/web/src/{App.tsx, components/*.tsx, pages/*.tsx}, packages/ui/src/{components.tsx 259 lines, theme.tsx 63, toast.tsx 43, download.ts 20} and packages/document-studio/src/ui/{Toolbar.tsx 423, FindReplaceBar.tsx, PageSetupDialog.tsx, Popover.tsx} have no tests. theme.tsx:16-17/48-49 read and write localStorage in try/catch, and L25/32 use matchMedia.

**Detail.** These are lower risk than the storage and content paths, but the 0.3 ribbon replaces Toolbar.tsx entirely, and route and ID preservation is non-negotiable. The ThemeProvider's guarded localStorage and matchMedia fallback is easy to cover in jsdom.

**Verifier.** Line counts are exact: components.tsx 259, theme.tsx 63, toast.tsx 43, download.ts 20, Toolbar.tsx 423. theme.tsx has localStorage at L17/L49 and matchMedia at L25/L32. No tests exist for any of these.

**Recommendation.** After TEST-2, add light jsdom tests: ThemeProvider (stored 'dark' is applied, a throwing localStorage still renders, the system preference listener works); a route table test asserting every v0.1.0 hash route (/, documents, diagrams, files, settings and per-id editor routes) still resolves; and a PageSetupDialog test asserting the emitted page settings. Keep broad UI coverage in Playwright rather than snapshotting the toolbar DOM, which 0.3 will replace anyway.

### TEST-12 — No coverage measurement; how to add @vitest/coverage-v8 (not installed)

*low · recommendation · verdict: confirmed*

**Evidence.** `ls node_modules/@vitest` shows only 'spy'. `npm view @vitest/coverage-v8 version peerDependencies` returned version '5.1.0', peerDependencies { vitest: '5.1.0', '@vitest/browser': '5.1.0' }. The root devDependency is vitest ^5.1.0 (package.json).

**Detail.** Without a baseline number, you cannot show that 0.3 work kept or improved coverage of the storage and content code. Judging from the file list above, coverage is roughly limited to packages/local-storage/src/indexeddb.ts, document-studio export/*.ts, and diagram-studio history/layout/types/templates. All .tsx files and apps/web are at 0%. I did not measure this, because no coverage provider is installed.

**Verifier.** `npm view @vitest/coverage-v8` returned version 5.1.0 with peers vitest 5.1.0 and @vitest/browser 5.1.0. One addition: peerDependenciesMeta marks @vitest/browser as optional, so only vitest@5.1.0 is required. Root package.json has vitest ^5.1.0. No coverage provider is installed.

**Recommendation.** `npm i -D @vitest/coverage-v8@5.1.0` (MIT, pinned to the same version as vitest). Add to vitest.config.ts: `coverage: { provider: 'v8', include: ['apps/web/src/**','packages/*/src/**'], exclude: ['**/*.test.*'], reporter: ['text','html','lcov'] }` and a `test:coverage` script. Do not gate CI on a global percentage at first. Instead set per-file thresholds for the critical modules (packages/local-storage/src/**, apps/web/src/lib/storage.ts, document-studio/src/types.ts and export/**, diagram-studio/src/types.ts) at, say, 90% lines, and ratchet up from there.

### TEST-1 — Re-run results: 37/37 Vitest, tsc clean, 3/3 pytest (matches baseline)

*info · works · verdict: confirmed*

**Evidence.** Commands run today from /Users/yaswanth/college os. `npx vitest run` printed 'RUN v5.1.0 … Test Files 3 passed (3) Tests 37 passed (37) Duration 265ms'. `npx tsc -p tsconfig.json` printed 'tsc exit 0'. `cd backend && .venv/bin/python -m pytest -q` printed '3 passed in 0.25s'. Verbose reporter: 20 tests in packages/diagram-studio/src/diagram.test.ts, 10 in packages/local-storage/src/indexeddb.test.ts, 7 in packages/document-studio/src/export/docx.test.ts. CI (.github/workflows/ci.yml) runs typecheck, npm test, build, licenses, audit and pytest.

**Detail.** The baseline is green and reproducible, and the counts match docs/audit/baseline-test-run.md. CI already gates on these commands, so any new suites added to `npm test` or as new CI steps will be enforced.

**Verifier.** I re-ran everything from /Users/yaswanth/college os. `npx vitest run --reporter=verbose` gave v5.1.0, 3 files, 37/37 passing (217ms this run versus 265ms; the time varies run to run). The per-file counts match: diagram 20, indexeddb 10, docx 7. `npx tsc -p tsconfig.json` exited 0, and that tsconfig's include covers apps/web/src and packages/*/src. backend `.venv/bin/python -m pytest -q` gave 3 passed in 0.23s. .github/workflows/ci.yml runs typecheck, test, build, licenses, `npm audit --omit=dev --audit-level=high` and pytest -q.

**Recommendation.** Keep this as the recorded baseline. Add each new suite below as its own CI step: test:unit, test:dom, test:e2e.

### Found by the verifier (missed by the auditor)

- CHECKLIST.md:37 marks 'Interrupted saves do not corrupt existing documents' ✅, but the evidence is weak (medium). It rests on indexeddb.test.ts:47-54, which forces a DataCloneError by passing a function value to fake-indexeddb. That shows a rejected put leaves the old record intact. It does not simulate a tab/app being killed mid-transaction, and it does not cover the realistic loss window: edits held only in memory in useEditableItem's pending ref during the 600 ms debounce (storage.ts:53, 66, 135). Flush on pagehide/visibilitychange is fire-and-forget async (storage.ts:185-186) and may not finish before the page is torn down. No test or manual check covers that window.
- The multi-tab schema-upgrade path is untested (medium, relevant to the 0.3 tabbed documents and any SCHEMA_VERSION 2). indexeddb.ts:73-76 has a `blocking()` handler that calls location.reload() when another tab upgrades. No test opens two connections at different versions, and nothing checks that pending edits are flushed before the reload. fake-indexeddb can model versionchange/blocking in Node, so this could be tested read-only today.
- requestPersistentStorage has an untested behaviour that bears on incident S-1 (low-medium). The module-level `persistRequested` flag (storage.ts:31, 36-37) means that once one request is made in a session, every later call returns false without calling navigator.storage.persist() again. That includes the explicit Settings 'Make storage persistent' button (SettingsPage.tsx:100-105). So a user who creates an item and then clicks the button gets no second request. Nothing tests this.
- The DOCX hyperlink export is exercised but never asserted (low). The test sample adds a link mark (docx.test.ts:26) and docx.ts:132-137 emits an ExternalHyperlink, but no assertion checks for the href or for a relationship entry in word/_rels/document.xml.rels. A broken link export would still pass.
- Backend test coverage is minimal (low). The only test module is backend/tests/test_api.py, with 3 tests covering /health and /api/v1/info. That is adequate for a skeleton, but there is no contract test pinning the API shape that later sync (0.6) will depend on.

## Dependencies and licences

The dependency baseline is in good shape. Every direct dependency in the five npm workspaces is permissively licensed (MIT/ISC/Apache-2.0/OFL-1.1), installed versions satisfy their declared ranges, the production audit is clean ('npm audit --omit=dev': found 0 vulnerabilities), and the 6 dev advisories (deepmerge/glob/minimatch via vite-plugin-pwa -> workbox-build) are build-time only. One caveat on that: npm's suggested fix is a downgrade to vite-plugin-pwa@1.1.0, so it should not be applied. Two old major-version pins are worth noting: lucide-react 0.460.0 (latest 1.72.0) and the Capacitor ^7 ranges (latest 8.6.2). The highest-risk items in the current tree are two shipped libraries with stale releases: html-to-image (last release 1.11.13 on 2025-02-14, and the repo pins 1.11.11) and html2canvas 1.4.1 (2022, an optional dependency of jspdf). The licence script works but has a latent bug. It reads every package's licence from the hoisted node_modules copy, because 'npm ls --json' has no 'path' field without --long. As a result, the shipped nanoid@6.0.2 and pako@2.2.0 are checked against the dev-only nanoid@3.3.20 and pako@1.0.11. The licences happen to match today. The script also scans only @dcos/web: apps/desktop, apps/android and backend/ are outside the npm workspaces and are never installed or checked. For the 0.3-0.8 candidates, most are permissive and maintained, but four need decisions. (1) citation-js bibliography formatting depends on citeproc, licensed CPAL-1.0 OR AGPL-1.0, which the policy disallows. (2) elkjs is EPL-2.0 OR GPL-3.0-or-later. (3) libavoid-js is LGPL-2.1-or-later and still in beta. (4) @tiptap/extension-mathematics only accepts katex up to ^0.18, while latest katex is 0.19.1. Several candidates are effectively unmaintained: pdf-lib (2021), dagre (2019), y-webrtc and y-indexeddb (2023), pptxgenjs (mid-2025). Tiptap's pricing page confirms that Pages (pagination), Comments, DOCX import/export conversion and snapshot compare are paid platform features (Start $49-59/mo and up; Pages only on Team and above), and tracked changes is a custom-priced add-on. Collaboration, collaboration-caret, mathematics, unique-id, drag-handle and table-of-contents are MIT on npm. So Release 0.3 pagination, comments, track changes and DOCX import must be built in-house or from other open-source libraries such as mammoth (BSD-2-Clause) and docx (MIT).

| ID | Severity | Status | Finding | Verdict |
|---|---|---|---|---|
| DEPE-2 | high | risk | citation-js bibliography formatting pulls in citeproc (CPAL-1.0 OR AGPL-1.0), which the licence policy disallows | confirmed |
| DEPE-3 | high | risk | elkjs is EPL-2.0 OR GPL-3.0-or-later, and libavoid-js is LGPL-2.1-or-later (beta); both are outside the policy | confirmed |
| DEPE-4 | high | info | Tiptap Pages, Comments, DOCX conversion and tracked changes are confirmed paid; the needed open-source Tiptap extensions are MIT | confirmed |
| DEPE-10 | medium | risk | Native-shell pins are a major behind, and the SQLite plugins for 0.8 require Capacitor 8 | corrected |
| DEPE-5 | medium | risk | @tiptap/extension-mathematics peer range excludes the current katex release | confirmed |
| DEPE-6 | medium | bug | Licence script reads licences from the hoisted copy, not the resolved one | confirmed |
| DEPE-7 | medium | partial | Licence allow-list and DUAL_OK mapping are sound but narrow; coverage excludes the desktop, Android and backend shells | confirmed |
| DEPE-8 | medium | risk | Shipped image and PDF export depends on stale libraries: html-to-image (pinned below latest, no release for 21 months) and html2canvas (2022) | corrected |
| DEPE-11 | low | info | Yjs stack: core is maintained, but y-webrtc and y-indexeddb have not been published since 2023, and y-websocket moved its server out | confirmed |
| DEPE-12 | low | recommendation | Candidate libraries for 0.3-0.7 that are permissive and maintained, plus stale ones to avoid | confirmed |
| DEPE-13 | low | partial | lucide-react pinned to a pre-1.0 line that is now a major behind | corrected |
| DEPE-9 | low | info | Dev-only advisories come from vite-plugin-pwa's Workbox build chain; npm's suggested fix is a downgrade | confirmed |
| DEPE-1 | info | works | Direct dependency inventory: all permissive, installed versions match ranges, production audit clean | confirmed |

### DEPE-2 — citation-js bibliography formatting pulls in citeproc (CPAL-1.0 OR AGPL-1.0), which the licence policy disallows

*high · risk · verdict: confirmed*

**Evidence.** 'npm view @citation-js/plugin-csl dependencies' -> {"citeproc":"^2.4.6",...}; 'npm view citeproc version license' -> {"version":"2.4.63","license":"CPAL-1.0 OR AGPL-1.0"}. @citation-js/core 0.9.0 itself is MIT. scripts/license-report.mjs:8 ALLOWED has neither licence.

**Detail.** Release 0.3 needs a citation and bibliography feature. @citation-js/core and plugin-bibtex (moo, @citation-js/date/name) are MIT. However, rendering formatted bibliographies in a CSL style (APA, IEEE, ...) goes through @citation-js/plugin-csl, which bundles citeproc-js. citeproc-js is dual-licensed CPAL-1.0 / AGPL-1.0, both copyleft with attribution or network clauses. The licence script would correctly fail CI, but the dependency would block the feature as planned.

**Verifier.** 'npm view @citation-js/plugin-csl' returns dependencies {citeproc:'^2.4.6', '@citation-js/date':'^0.5.0'}, version 0.9.0, licence MIT. 'npm view citeproc' returns 2.4.63 with licence 'CPAL-1.0 OR AGPL-1.0'. Neither licence is in ALLOWED (scripts/license-report.mjs:8) or DUAL_OK (line 10).

**Recommendation.** Before committing to citation-js for formatting, decide one of these: (a) use @citation-js/core with plugin-bibtex/plugin-doi for parsing only (MIT), and write a small in-house formatter for a fixed set of styles; (b) get legal sign-off to accept CPAL-1.0 and add an explicit exception to the policy; or (c) look for another permissive CSL engine. I did not verify that a maintained permissive one exists. Do not add a broad DUAL_OK entry for this licence.

### DEPE-3 — elkjs is EPL-2.0 OR GPL-3.0-or-later, and libavoid-js is LGPL-2.1-or-later (beta); both are outside the policy

*high · risk · verdict: confirmed*

**Evidence.** 'npm view elkjs version license' -> 0.12.1, 'EPL-2.0 OR GPL-3.0-or-later'. 'npm view libavoid-js version license' -> 0.5.0-beta.5, 'LGPL-2.1-or-later', last publish 2026-02-23. scripts/license-report.mjs:8 ALLOWED excludes both.

**Detail.** Release 0.4 plans orthogonal routing and radial/grid layouts. The common layout and routing engines here are weak-copyleft: EPL-2.0 is file-level copyleft, and LGPL in a bundled web/WASM app raises relinking obligations. The PRD's 'permissive only' policy (DEPENDENCIES.md:3) excludes them. libavoid-js is also still pre-release. The permissive alternatives are maintained: @dagrejs/dagre 3.1.3 (MIT) and d3-hierarchy 3.1.3 (ISC).

**Verifier.** elkjs is 0.12.1 under 'EPL-2.0 OR GPL-3.0-or-later'. libavoid-js is 0.5.0-beta.5 under 'LGPL-2.1-or-later', with time.modified 2026-02-23. Neither is in the allow-list. DEPENDENCIES.md:3 states the permissive-licence policy.

**Recommendation.** Use @dagrejs/dagre (layered) and d3-hierarchy (tree/radial) for layouts. Implement orthogonal edge routing in-house (React Flow's smoothstep edge plus an obstacle-avoiding A* grid router), or record an explicit policy exception for EPL-2.0 if ELK is required. Do not use the unscoped 'dagre' package: its last publish was 0.8.5 on 2019-12-03.

### DEPE-4 — Tiptap Pages, Comments, DOCX conversion and tracked changes are confirmed paid; the needed open-source Tiptap extensions are MIT

*high · info · verdict: confirmed*

**Evidence.** https://tiptap.dev/pricing.md says the editor is 'open source (MIT) and free'. Page-based layouts are on Team/Business/Enterprise only. Comments and DOCX import/export are on all paid plans (Start $49/mo annual, $59 monthly, and up). Tracked changes is a custom-priced add-on. There is no free plan, only a 30-day trial. https://tiptap.dev/docs/pages/getting-started/overview describes Pages as @tiptap-pro/extension-pages, which requires @tiptap-pro/extension-convert-kit; DOCX export is @tiptap-pro/extension-export-docx. Separately, 'npm view' shows @tiptap/extension-collaboration, -collaboration-caret, -mathematics, -unique-id, -drag-handle and -table-of-contents 3.33.1 all licensed MIT.

**Detail.** The claim is verified. Under the no-paid-SaaS rule, Release 0.3's true multi-page layout, comments, track changes and DOCX import cannot use Tiptap Pro. They have to be built on open-source ProseMirror/Tiptap. The current DEPENDENCIES.md:14 note ('Open-source extensions only, no Tiptap Pro/Cloud') is correct. In Tiptap 3, collaboration-cursor was renamed to collaboration-caret (npm latest for -cursor is 2.26.2, a v2-only line).

**Verifier.** Re-fetched https://tiptap.dev/pricing.md. Start is $59/mo ($49 annual), Team $179 ($149), Business $1,199 ($999), Enterprise custom. Pages is on Team, Business and Enterprise only. Comments and DOCX import/export are on all paid plans. Tracked changes is a paid add-on with custom pricing. There is no free plan, only a 30-day trial, and the editor itself is MIT. @tiptap/extension-collaboration-cursor latest is 2.26.2. I did not re-fetch the Pages docs URL.

**Recommendation.** Plan in-house work for pagination (a page-box layout over ProseMirror decorations, or a print CSS engine), comments (marks plus a side store), and track changes (insert/delete marks). Use mammoth for DOCX import and the existing 'docx' for export. Use @tiptap/extension-collaboration-caret, not -cursor. Add a lint or CI check (for example grepping package-lock.json for '@tiptap-pro/') so a Pro package cannot slip in, since those packages come from a private registry.

### DEPE-10 — Native-shell pins are a major behind, and the SQLite plugins for 0.8 require Capacitor 8

*medium · risk · verdict: corrected*

**Evidence.** apps/android/package.json:10-15 '@capacitor/android','@capacitor/core','@capacitor/cli': '^7.0.0'; 'npm view @capacitor/core version' -> 8.6.2. 'npm view @capacitor-community/sqlite peerDependencies' -> { '@capacitor/core': '>=8.0.0' } (latest 8.1.1); @capacitor-community/sqlite@7.0.3 accepts >=7.0.0. apps/desktop/package.json:11 '@tauri-apps/cli': '^2.0.0' (latest 2.12.4, Apache-2.0 OR MIT); @tauri-apps/plugin-sql 2.6.0 (MIT OR Apache-2.0) needs @tauri-apps/api ^2.12.0. Neither shell is a workspace, and neither appears in package-lock.json.

**Detail.** These packages have never been installed or locked, so their versions are unresolved. Capacitor-community sqlite also pulls in jeep-sqlite 2.8.0 (MIT) with sql.js (MIT), @stencil/core and localforage for its web fallback. All are permissive, but they would duplicate the IndexedDB layer on the web.

**Verifier.** The citation should be apps/android/package.json:11-17, not 10-15: @capacitor/android and @capacitor/core are ^7.0.0 under dependencies at lines 12-13, and @capacitor/cli ^7.0.0 is a devDependency at line 16. @capacitor/core latest is 8.6.2. @capacitor-community/sqlite 8.1.1 needs @capacitor/core '>=8.0.0', and 7.0.3 accepts '>=7.0.0'. apps/desktop/package.json:12 (not 11) has '@tauri-apps/cli': '^2.0.0'. I did not re-check the Tauri plugin-sql or jeep-sqlite details.

**Recommendation.** For 0.8, choose Capacitor 8 + @capacitor-community/sqlite 8.x, or stay on 7 with sqlite 7.0.3. Bring both shells into the lockfile, either as workspaces or with their own lockfiles, so 'npm ci' and the licence gate cover them. Keep IndexedDB as the web StorageAdapter, and use SQLite only in native shells behind the existing adapter interface.

### DEPE-5 — @tiptap/extension-mathematics peer range excludes the current katex release

*medium · risk · verdict: confirmed*

**Evidence.** 'npm view @tiptap/extension-mathematics peerDependencies' -> { katex: '^0.16.4 || ^0.17.0 || ^0.18.0', '@tiptap/pm': '3.33.1', '@tiptap/core': '3.33.1' }; 'npm view katex version' -> 0.19.1; 'npm view katex@0.18 version' -> latest 0.18.11.

**Detail.** 'npm i katex' without a range would install 0.19.1 and produce an ERESOLVE peer conflict with the MIT Tiptap mathematics extension. mathlive 0.111.4 (MIT, no runtime dependencies, published 2026-10-31) is a reasonable visual equation editor to pair with it.

**Verifier.** @tiptap/extension-mathematics peerDependencies has katex '^0.16.4 || ^0.17.0 || ^0.18.0', and 'npm view katex version' returns 0.19.1. That a bare install would fail with ERESOLVE is inferred from npm 7+ peer handling and was not tested, since installing is forbidden.

**Recommendation.** Install katex@^0.18.11 alongside @tiptap/extension-mathematics@3.33.1, and pin it until Tiptap widens the peer range. Ship the KaTeX fonts locally (the PWA is offline-first) and check them against the precache size budget.

### DEPE-6 — Licence script reads licences from the hoisted copy, not the resolved one

*medium · bug · verdict: confirmed*

**Evidence.** scripts/license-report.mjs:12 runs 'npm ls --all --omit=dev --json' (no --long). Its JSON nodes contain only ['version','resolved','overridden','dependencies'] (checked with node -e on the output), so info.path is always undefined, and line 26 falls back to join('node_modules', name). package-lock.json has nested production copies node_modules/docx/node_modules/nanoid 6.0.2, docx/node_modules/@types/node 26.6.6, docx/node_modules/undici-types 8.9.0 and fast-png/node_modules/pako 2.2.0, while the hoisted copies are dev-only nanoid 3.3.20, @types/node 22.20.5, undici-types 6.21.0 and pako 1.0.11.

**Detail.** The report labels each row with the nested version but reads the licence from a different, dev-only version. Today the licences coincide (MIT, and (MIT AND Zlib)), so the output is accidentally correct. If a nested production copy ever relicenses, the gate would check the wrong file and pass silently. Separately, line 27 joins legacy 'licenses' arrays with ' OR ' and no parentheses, so they never match a DUAL_OK key. That fails closed, which is safe but noisy.

**Verifier.** I re-ran 'npm ls --all --omit=dev --json -w @dcos/web'. The union of node keys is exactly [version, resolved, overridden, dependencies], with no path, so line 26 always reads node_modules/<name>. package-lock.json has the shipped nested copies docx/node_modules/nanoid 6.0.2, docx/node_modules/@types/node 26.6.6, docx/node_modules/undici-types 8.9.0 and fast-png/node_modules/pako 2.2.0 '(MIT AND Zlib)'. The hoisted copies are dev-only: nanoid 3.3.20, @types/node 22.20.5, undici-types 6.21.0 and pako 1.0.11. The line 27 claim about legacy 'licenses' arrays being joined with ' OR ' and no parentheses is also correct.

**Recommendation.** Run 'npm ls --all --omit=dev --json --long', which includes 'path', or resolve each package with createRequire from its parent's path. Even simpler, read package-lock.json 'packages' entries, which carry 'license' and their exact install path, and skip those with dev:true.

### DEPE-7 — Licence allow-list and DUAL_OK mapping are sound but narrow; coverage excludes the desktop, Android and backend shells

*medium · partial · verdict: confirmed*

**Evidence.** scripts/license-report.mjs:8 ALLOWED = MIT, ISC, Apache-2.0, BSD-2/3-Clause, 0BSD, OFL-1.1, Unlicense, CC0-1.0, BlueOak-1.0.0, Python-2.0, Zlib. Line 10 maps DUAL_OK by exact string to the permissive branch. Line 12 scans only '-w @dcos/web'. Root package.json:7-13 workspaces omit apps/desktop and apps/android; package-lock.json has no @capacitor or @tauri-apps entries, and node_modules/@capacitor does not exist. backend/requirements.txt (fastapi, uvicorn) is not scanned. .github/workflows/ci.yml runs 'npm run licenses' but never diffs the regenerated docs/THIRD_PARTY_NOTICES.md.

**Detail.** The allow-list contains only permissive licences, and every DUAL_OK entry picks a permissive branch: jszip MIT, dompurify Apache-2.0, pako MIT AND Zlib. Exact-match DUAL_OK fails closed for unknown expressions, which is good. Two judgement calls need a written rationale. First, rgbcolor's 'MIT OR SEE LICENSE IN FEEL-FREE.md' is mapped to MIT; the FEEL-FREE.md text is a non-standard 'feel free to use' grant, so choosing the MIT branch is fine. Second, Python-2.0 is on the list although no npm dependency needs it. Coverage gaps: (1) the Tauri and Capacitor JS deps and their native Rust and Gradle dependency trees are never scanned; (2) Python backend licences are never scanned; (3) the notices file is rewritten in CI but stale committed notices are not detected, and the embedded date means it always differs. Also, docx declares @types/node as a runtime dependency, so @types/* packages appear in the 'production' notices (THIRD_PARTY_NOTICES.md rows @types/node 26.6.6 and others). They are type-only and nothing ships.

**Verifier.** license-report.mjs:8, 10 and 12 match the description. Root workspaces (package.json:7-13) omit apps/desktop and apps/android. 'grep -c capacitor|tauri package-lock.json' returns 0, and node_modules/@capacitor does not exist. backend/requirements.txt (fastapi, uvicorn[standard]) is not scanned. ci.yml:21 runs 'npm run licenses' with no git diff check. THIRD_PARTY_NOTICES.md line 3 embeds a date (2026-11-12) and lines 63-72 list @types/* packages. rgbcolor's licence string is listed at NOTICES:115.

**Recommendation.** Before 0.8, add apps/desktop and apps/android to workspaces, or give each its own lockfile, and extend the gate to them plus 'cargo deny' / 'pip-licenses' for the native and backend trees. In CI, regenerate the notices and run 'git diff --exit-code docs/THIRD_PARTY_NOTICES.md', with the date removed or made stable. Exclude @types/* from the notices. Keep DUAL_OK exact-match, and add new entries only with a comment naming the package.

### DEPE-8 — Shipped image and PDF export depends on stale libraries: html-to-image (pinned below latest, no release for 21 months) and html2canvas (2022)

*medium · risk · verdict: corrected*

**Evidence.** packages/diagram-studio/package.json:11 'html-to-image': '1.11.11'. 'npm view html-to-image time' -> last 1.11.13 on 2025-02-14. 'npm outdated' shows 1.11.11 -> 1.11.13. jspdf optionalDependencies (node_modules/jspdf/package.json) include html2canvas ^1.0.0-rc.5 and canvg; html2canvas latest 1.4.1 was published 2022-01-22. docs/THIRD_PARTY_NOTICES.md lists html2canvas 1.4.1 and canvg 3.0.11. packages/diagram-studio/src/export.ts:54 lazy-loads jspdf, and no use of jspdf.html() or html2canvas was found by grep.

**Detail.** There are no advisories today. However, Release 0.4 will lean heavily on these exports (100+ shapes, rotation, shadows), and the core rasteriser has had no release since Feb 2025, two patch releases ahead of the pinned version. html2canvas and canvg are pulled in as jspdf optional deps and end up in the notices. Vite probably excludes them from the main bundle unless jspdf.html()/addSvgAsImage is used, but I did not verify this from the build output.

**Verifier.** The core facts hold: diagram-studio/package.json:11 pins 1.11.11, 1.11.13 was published 2025-02-14T01:43, html2canvas 1.4.1 was published 2022-01-22, and export.ts:54 lazy-loads jspdf. The guess that 'Vite probably excludes them' is wrong. apps/web/dist/assets contains separate chunks html2canvas-CnvX2C7f.js (199 KB), index.es-BfFE6h9D.js (151 KB, canvg) and purify.es-Dqk5qvad.js (29 KB). dist/sw.js lists all three in its precache, because apps/web/vite.config globPatterns is '**/*.{js,css,html,svg,woff2}' (line 26). So the stale html2canvas and canvg code ships and is downloaded to every PWA install, even though nothing calls jspdf.html(). Severity stays medium.

**Recommendation.** Evaluate 1.11.13 against the export tests and pin it deliberately. As a fallback, keep a native SVG serializer path, since React Flow nodes are DOM. Check the build manifest to confirm whether html2canvas or canvg chunks are emitted; if they are not needed, consider aliasing them out.

### DEPE-11 — Yjs stack: core is maintained, but y-webrtc and y-indexeddb have not been published since 2023, and y-websocket moved its server out

*low · info · verdict: confirmed*

**Evidence.** npm view: yjs 13.6.33 MIT (modified 2026-09-23); @tiptap/y-tiptap 3.3.0 MIT (dependency of @tiptap/extension-collaboration 3.33.1, which also requires yjs ^13); y-prosemirror 1.3.7 last publish 2025-07-03; y-websocket 3.1.0 MIT, with the server split into @y/websocket-server 0.1.5; y-webrtc 10.3.0 last publish 2023-12-28; y-indexeddb 9.0.12 last publish 2023-11-02.

**Detail.** Everything is MIT, so there is no licence issue. Tiptap 3 collaboration uses @tiptap/y-tiptap rather than y-prosemirror directly, so adding y-prosemirror separately risks two ProseMirror bindings. y-indexeddb and y-webrtc are small and widely used but effectively frozen. y-webrtc also needs a signalling server, and its defaults point at public servers, which conflicts with offline/self-hosted goals.

**Verifier.** Last publishes per npm: y-webrtc 10.3.0 on 2023-12-28, y-indexeddb 9.0.12 on 2023-11-02, y-prosemirror 1.3.7 on 2025-07-03. @tiptap/extension-collaboration's dependencies include '@tiptap/y-tiptap': '^3.0.7' and yjs '^13'. I did not re-check the y-websocket server split or y-webrtc's default signalling servers.

**Recommendation.** Use yjs + @tiptap/extension-collaboration(+caret) + y-indexeddb for local persistence, with a self-hosted @y/websocket-server in the FastAPI deployment, or a Python y-py/pycrdt server. Avoid adding y-prosemirror directly. If y-webrtc is used, configure a self-hosted signalling URL.

### DEPE-12 — Candidate libraries for 0.3-0.7 that are permissive and maintained, plus stale ones to avoid

*low · recommendation · verdict: confirmed*

**Evidence.** npm view (version, licence, last activity): mammoth 1.13.0 BSD-2-Clause (deps lop BSD-2, jszip dual, underscore/xmlbuilder/@xmldom/xmldom MIT, dingbat-to-unicode BSD-2); katex 0.19.1 MIT; mathlive 0.111.4 MIT; pdfjs-dist 6.5.438 Apache-2.0 (2026-11-01); pdf-lib 1.17.1 MIT, last publish 2021-11-06; pptxgenjs 4.0.1 MIT, last publish 2025-06-26 (runtime deps include the stub package 'https' 1.0.0 ISC and @types/node); chart.js 4.6.1 MIT; recharts 3.10.1 MIT (pulls in @reduxjs/toolkit, immer, react-redux); echarts 6.1.0 Apache-2.0 (zrender 6.1.0 BSD-3-Clause); @playwright/test 1.65.0 Apache-2.0; jszip 3.10.2 (MIT OR GPL-3.0-or-later); fflate 0.8.3 MIT (already shipped via docx); dompurify 3.4.17 (MPL-2.0 OR Apache-2.0, already shipped via jspdf); d3-hierarchy 3.1.3 ISC; @dagrejs/dagre 3.1.3 MIT; odf-kit 0.14.5 Apache-2.0 (pre-1.0, not evaluated in depth).

**Detail.** All of these pass the current allow-list, including through the existing DUAL_OK entries for jszip and dompurify. Maintenance concerns: pdf-lib is unmaintained (5 years), so PDF Studio editing should consider a maintained fork, which I have not verified. pptxgenjs is 17 months since its last release. Neither mammoth nor any library I checked offers full-fidelity ODT import. odf-kit is pre-1.0 and was not validated against real files, so the 'DOCX+ODT import/export validated with real files' goal is unproven.

**Verifier.** I spot-checked part of the list. mammoth is 1.13.0, BSD-2-Clause. pdf-lib 1.17.1 last published 2021-11-06, dagre 0.8.5 on 2019-12-03, pptxgenjs 4.0.1 on 2025-06-26. The remaining versions and licences are plausible but were not all re-checked.

**Recommendation.** Use mammoth for DOCX import, pdfjs-dist for viewing, chart.js or echarts for slide charts (chart.js is lighter and pulls no Redux), @playwright/test for the real-file round-trip tests, and fflate rather than jszip for new zip work, since it is already in the bundle. Treat ODT and PDF editing as spikes with real-file fixtures before committing. Use DOMPurify to sanitise any imported DOCX/HTML before it enters Tiptap.

### DEPE-13 — lucide-react pinned to a pre-1.0 line that is now a major behind

*low · partial · verdict: corrected*

**Evidence.** packages/ui/package.json:9 and apps/web/package.json:17 'lucide-react': '^0.460.0'. 'npm outdated' shows Current 0.460.0 / Wanted 0.460.0 / Latest 1.72.0, latest published 2026-11-11.

**Detail.** For 0.x versions, caret ranges lock the minor, so no upgrades are picked up, including any icon renames or new icons needed for the ribbon UI (Release 0.3). The licence remains ISC.

**Verifier.** The citation should be packages/ui/package.json:10, not :9. apps/web/package.json:17 is correct. Current, Wanted and Latest are 0.460.0 / 0.460.0 / 1.72.0. I did not check the 2026-11-11 publish date.

**Recommendation.** Upgrade both workspaces together to ^1.x in a dedicated change. Check for renamed icon exports through typecheck, and keep a single shared version in @dcos/ui.

### DEPE-9 — Dev-only advisories come from vite-plugin-pwa's Workbox build chain; npm's suggested fix is a downgrade

*low · info · verdict: confirmed*

**Evidence.** 'npm audit': deepmerge >=4.2.0 GHSA-gcqx-w48m-w2h4 -> @rollup/plugin-node-resolve -> workbox-build -> vite-plugin-pwa >=1.2.0; glob 9.0.0-14.0.1 GHSA-3g3m-2fjr-6pw4 (moderate); minimatch 7.0.0-11.0.0 GHSA-g3hv-75wg-m249 (moderate); '6 vulnerabilities (2 low, 4 moderate)'; 'fix available via npm audit fix --force / Will install vite-plugin-pwa@1.1.0, which is a breaking change'. ci.yml gates with 'npm audit --omit=dev --audit-level=high'.

**Detail.** This matches DEPENDENCIES.md:13 and baseline-test-run.md. All of it is build-time code that runs on the developer or CI machine with trusted input. 'npm audit fix --force' would downgrade the PWA plugin by a major version.

**Verifier.** 'npm audit' shows the deepmerge >=4.2.0 -> @rollup/plugin-node-resolve -> workbox-build -> vite-plugin-pwa >=1.2.0 chain, plus glob 9.0.0-14.0.1 and minimatch 7.0.0-11.0.0 (both moderate), totalling '6 vulnerabilities (2 low, 4 moderate)'. The suggested fix is 'Will install vite-plugin-pwa@1.1.0, which is a breaking change'. ci.yml:22 runs 'npm audit --omit=dev --audit-level=high'.

**Recommendation.** Do not run 'npm audit fix --force'. Optionally add npm 'overrides' for glob/minimatch once workbox-build accepts patched ranges, and re-check at each release.

### DEPE-1 — Direct dependency inventory: all permissive, installed versions match ranges, production audit clean

*info · works · verdict: confirmed*

**Evidence.** package.json:21-29, apps/web/package.json:12-28, packages/document-studio/package.json:8-22, packages/diagram-studio/package.json:8-12, packages/local-storage/package.json:8, packages/ui/package.json:8-9. 'npm ls --depth=0 --workspaces' output: react/react-dom 19.3.1 (^19.0.0), react-router-dom 7.18.5 (^7.0.0), @fontsource-variable/inter 5.3.0 (OFL-1.1), lucide-react 0.460.0 (^0.460.0, ISC), clsx 2.1.1, idb 8.0.4 (ISC), @tiptap/* 3.33.1 (^3.0.0, MIT), docx 9.15.3 (^9.5.0), @xyflow/react 12.12.1 (^12.4.0), html-to-image 1.11.11 (exact), jspdf 4.2.1 (^4.2.1), vite 8.3.8, @vitejs/plugin-react 6.3.0, tailwindcss/@tailwindcss/vite 4.3.5, vite-plugin-pwa 2.0.0; root dev: @types/node 22.20.5, typescript 5.7.3 (~5.7.0), vitest 5.1.0, fake-indexeddb 6.2.8 (Apache-2.0), jszip 3.10.2 ((MIT OR GPL-3.0-or-later)). The npm view 'time.modified' timestamps for nearly all of these fall between 2026-10 and 2026-11. 'npm audit --omit=dev' -> 'found 0 vulnerabilities'.

**Detail.** Every direct dependency is permissive, and nearly all show npm registry activity within the last month. 'npm outdated --workspaces' reports only html-to-image (1.11.11 -> 1.11.13), lucide-react (0.460.0 -> 1.72.0) and, at the root, @types/node (22 -> 26) and typescript (5.7.3 -> 7.0.2). Note that npm's 'time.modified' records a metadata change, not necessarily a publish. Real last-publish dates were checked separately with 'npm view <pkg> time'.

**Verifier.** Manifests match: root package.json:24-32 devDeps (the cited 21-29 is off by about 3 lines), packages/diagram-studio/package.json:11 pins html-to-image to exactly 1.11.11, and packages/ui/package.json:9-10 has clsx and lucide. 'npm audit --omit=dev' prints 'found 0 vulnerabilities'. 'npm outdated --workspaces' lists only html-to-image and lucide-react; root 'npm outdated' adds @types/node (22.20.5 -> 26.6.6) and typescript (5.7.3 -> 7.0.2). All of this matches.

**Recommendation.** No action is needed on the baseline. In DEPENDENCIES.md, record the installed versions rather than '19.x'/'3.x' so future audits can see drift.

### Found by the verifier (missed by the auditor)

- Unused jspdf optional dependencies ship in the offline precache. apps/web/dist/assets/html2canvas-CnvX2C7f.js (199,398 bytes), index.es-BfFE6h9D.js (canvg, 151,418 bytes) and purify.es-Dqk5qvad.js (29,023 bytes) are emitted as lazy chunks and listed in apps/web/dist/sw.js, because apps/web/vite.config globPatterns '**/*.{js,css,html,svg,woff2}' (line 26) has no exclusions. That is about 380 KB of code that is never called (grep finds no jspdf.html or html2canvas use outside export.ts:54's dynamic import of jspdf) and is downloaded on every PWA install. It also brings the 2022-era html2canvas into the shipped surface. A globIgnores entry, or aliasing these modules out, would avoid it.
- The licence gate is not reproducible against the committed notices. ci.yml:21 runs 'npm run licenses', which overwrites docs/THIRD_PARTY_NOTICES.md (line 3 has a 'Generated ... on 2026-11-12' date), and nothing checks 'git diff --exit-code'. A dependency bump can therefore merge with stale committed notices. The auditor raised this point only inside DEPE-7; I am repeating it here because it is the actionable CI fix.

## Correctness and code quality

I read every file in scope and checked the claims by tracing the code. For the diagram serializer I also ran a round-trip script (esbuild bundle in the scratchpad, nothing written to the repo); all 10 templates came back byte-identical, so opening a diagram does not cause a spurious write. The biggest problem is in version history. Every Ctrl/Cmd+S writes a 'manual' snapshot even when nothing changed, the key handler ignores auto-repeat, and prune() evicts the oldest non-'create' versions, including manual and 'Before restore' ones. Holding or repeatedly pressing Ctrl+S can therefore wipe the whole history. Next, useEditableItem has three weak spots: edits pending when the editor unmounts are dropped silently if the item is in a conflict or error state; the title input is overwritten from the save result while the user is still typing (trailing spaces vanish, an empty title becomes 'Untitled', keystrokes made during a save get reverted); and overlapping snapshot flushes can raise a false 'changed in another window' conflict against the editor's own save. ItemRow's favorite toggle, and trash/restore, increment the same version counter as content edits. With the item open in another tab, this produces a spurious conflict banner whose 'Discard mine' button throws away real edits. DOCX export silently drops any block inside a list item other than paragraphs and sub-lists, as well as nested tables, and ignores the ordered-list start number. Diagram undo does not restore settings.autoLayout, so after undoing an Arrange, the next Tab re-lays out the whole diagram. The trash route that merges documents and diagrams is correct. Search breaks on text whose lowercase form is longer than the original (Turkish İ). Lower-severity items concern performance (list() reads full content), the schema-upgrade reload path, and print-iframe cleanup.

| ID | Severity | Status | Finding | Verdict |
|---|---|---|---|---|
| CODE-1 | high | bug | Ctrl/Cmd+S always writes a manual version (no change check, no key-repeat guard), and prune evicts manual and 'Before restore' versions | confirmed |
| CODE-2 | medium | bug | Pending edits are silently discarded when leaving the editor in conflict or error state | confirmed |
| CODE-3 | medium | bug | Title input is overwritten from the save result while the user types (spaces trimmed, empty title becomes 'Untitled', in-flight keystrokes reverted) | confirmed |
| CODE-4 | medium | bug | DOCX export silently drops content inside list items and nested tables, and ignores the ordered-list start number | confirmed |
| CODE-5 | medium | bug | Overlapping flushes can save with a stale version and raise a false conflict against the editor's own save | confirmed |
| CODE-6 | medium | bug | Favorite, trash and restore increment the content version, so an editor open in another tab hits a false conflict | confirmed |
| CODE-10 | low | risk | Schema-upgrade 'blocking' handler reloads the page without flushing pending edits or closing the connection | confirmed |
| CODE-11 | low | risk | list() reads full item content (including base64 images) and stringifies it on every list refresh | corrected |
| CODE-12 | low | bug | Find shortcut and mode toggle write a document version; print iframe cleanup depends on afterprint | confirmed |
| CODE-7 | low | bug | Undo does not restore settings.autoLayout, and addChild re-lays out every tree in the diagram | confirmed |
| CODE-8 | low | bug | Inspector focus pushes an undo snapshot even without an edit, creating no-op undos and clearing redo | confirmed |
| CODE-9 | low | bug | Find/replace computes wrong ranges when lowercasing changes string length (e.g. Turkish İ) | confirmed |
| CODE-13 | info | works | Trash route merging both kinds is correct | confirmed |

### CODE-1 — Ctrl/Cmd+S always writes a manual version (no change check, no key-repeat guard), and prune evicts manual and 'Before restore' versions

*high · bug · verdict: confirmed*

**Evidence.** apps/web/src/pages/DocumentPage.tsx:17-22 and DiagramPage.tsx:16-21 (keydown handler calls saveNow() without checking e.repeat); apps/web/src/lib/storage.ts:98 (`if (blocked.current || (!patch && !opts.snapshot)) return;` lets a snapshot through with an empty patch) and :196 (saveNow = flush({snapshot:true})); packages/local-storage/src/indexeddb.ts:173-176 (opts.snapshot always adds a version), :314-323 (prune keeps only reason==='create' and deletes the oldest of everything else, including 'manual' and 'restore'), MAX_VERSIONS_PER_ITEM=50 at :23

**Detail.** Every Ctrl+S runs storage.save with patch {} and snapshot:true. That increments the version, sets updatedAt (so the list shows 'Edited just now') and adds a full content copy as a 'manual' version, even when nothing changed. Holding Ctrl+S auto-repeats at about 30/s, so in under 2 seconds roughly 50 snapshots are written. prune() then deletes the oldest non-create versions, which removes every earlier autosave, manual save and 'Before restore' entry. Repro: open a document with history, use Version history > Restore (this creates 'Before restore'), then hold Ctrl+S for about 2 seconds. Version history now shows only 'Created' plus about 49 identical 'Saved version' rows, and the restore can no longer be undone. Students who press Ctrl+S out of habit do the same thing more slowly.

**Verifier.** Checked DocumentPage.tsx:17-26 and DiagramPage.tsx:16-25. Neither keydown handler checks e.repeat or whether anything changed. storage.ts:98 lets {snapshot:true} through with a null patch, :103 saves `patch ?? {}`, and :196 defines saveNow = flush({snapshot:true}). In indexeddb.ts, :168-169 always bump version and updatedAt, :173-175 always add a 'manual' version when opts.snapshot is set, and prune at :314-323 filters out only reason==='create', so 'manual' and 'restore' rows are evicted oldest-first. The comment at :22 ('oldest automatic snapshots are pruned first') contradicts the code. The only test (indexeddb.test.ts:56-60) does not exercise pruning. One caveat on the hold-Ctrl+S repro: when saves take longer than the ~33 ms key-repeat interval, three or more queued saveNow calls hit the CODE-5 race and end in a ConflictError banner, not 49 snapshots. The outcome depends on timing, but repeated manual saves still evict restore points either way.

**Recommendation.** Ignore e.repeat in the shortcut handler. Skip creating a manual snapshot when content and title equal the latest version (compare against lastSavedContent or a stored hash). In prune(), protect 'restore' versions and the most recent N 'manual' versions, or prune autosaves first and manual saves only past a separate cap. Add a test that 60 consecutive snapshot saves keep the 'restore' version.

### CODE-2 — Pending edits are silently discarded when leaving the editor in conflict or error state

*medium · bug · verdict: confirmed*

**Evidence.** apps/web/src/lib/storage.ts:98 (flush returns early when blocked.current, so a conflict state never writes pending), :117-121 (on non-conflict errors pending is kept but nothing retries until the next edit), :189-193 (the unmount cleanup calls `void flush()`; any rejection or conflict then only does setState on an unmounted component); apps/web/src/components/EditorFrame.tsx:54-56 (the Back link navigates with no unsaved-changes guard) and :80 (the banner tells the user their edits are kept)

**Detail.** Repro A (conflict): open a document in two tabs and type in tab 1, then type in tab 2. Tab 2 shows 'Changed elsewhere' and keeps the edits in pending.current. If the user clicks the Back arrow or a sidebar link instead of one of the banner buttons, the component unmounts, flush() returns immediately because blocked is set, and the edits are gone with no prompt. Repro B (error): a save fails with something other than a conflict, for example QuotaExceededError after inserting large images, which is likely given S-1, where persist() is not granted. The badge says 'Not saved'. The user navigates away, the unmount flush fails again, the error is swallowed, and the edits are lost. Nothing intercepts beforeunload while status is pending, error or conflict.

**Verifier.** storage.ts:98 returns early when blocked.current is set, so the unmount cleanup at :192 (`void flush()`) writes nothing while a conflict is open and pending.current is dropped. In the error state, the unmount flush does retry once (:118 kept pending); if that retry fails, the catch only calls setState on an unmounted component. The repo has no beforeunload handler and no router blocker (grep found none). EditorFrame.tsx:54-56 is a plain Link, and :80 tells the user their edits 'have not been written over it'. The error badge text at :21 says 'retrying on next edit'.

**Recommendation.** Block navigation while status is 'conflict' or 'error' (react-router's useBlocker plus a beforeunload handler) and offer 'Save as copy' there. On unmount with blocked or failed pending edits, write them to a recovery store (for example a 'drafts' object store keyed by item id) and offer them on the next open. Retry 'error' saves with backoff instead of waiting for the next edit.

### CODE-3 — Title input is overwritten from the save result while the user types (spaces trimmed, empty title becomes 'Untitled', in-flight keystrokes reverted)

*medium · bug · verdict: confirmed*

**Evidence.** apps/web/src/lib/storage.ts:106 (`setItem(saved)` after every save, including title saves) and :152 (rename optimistically sets item.title); packages/local-storage/src/indexeddb.ts:165 (`patch.title.trim() || 'Untitled'`); apps/web/src/components/EditorFrame.tsx:57-60 (controlled input value={title} where title = item.title, passed in DocumentPage.tsx:35 and DiagramPage.tsx:35)

**Detail.** The title input is controlled by item.title, and every successful save replaces item with the stored record. Repro 1: type 'Lab report ' and pause for more than 600 ms. The autosave stores 'Lab report' and the input loses the trailing space, so the next word becomes 'Lab report1'. Repro 2: select the whole title and delete it to retype. After 600 ms the input jumps to 'Untitled'. Repro 3: keep typing while a save is in flight. setItem(saved) reverts the input to the older title, and the next onChange is built from that reverted value, so the newer characters that were pending are lost.

**Verifier.** EditorFrame.tsx:57-60 makes the title input controlled by item.title. storage.ts:152 sets it optimistically, then :106 replaces it with setItem(saved), and indexeddb.ts:165 stores `patch.title.trim() || 'Untitled'`. Trailing spaces are therefore trimmed and an empty title becomes 'Untitled' after the 600 ms debounce. In the in-flight case, the newer title is still in pending and its timer still fires. The keystroke is lost permanently only if the user types again before that save lands, because the next onChange builds on the reverted value. Content-only saves also call setItem(saved), which can revert a title typed during them.

**Recommendation.** Keep a local draft state for the title input, separate from item.title. Do not apply saved.title to the UI while a newer title is pending (pending.current?.title !== undefined). Trim and apply 'Untitled' only on blur or commit, not on every debounced save.

### CODE-4 — DOCX export silently drops content inside list items and nested tables, and ignores the ordered-list start number

*medium · bug · verdict: confirmed*

**Evidence.** packages/document-studio/src/export/docx.ts:175-196 (list() handles only child.type bulletList/orderedList/paragraph; every other block in a listItem is skipped), :205-207 (table cells keep only `b instanceof Paragraph`, so a nested Table is dropped), :176/188 (ordered numbering always restarts at 1; node.attrs.start is never read). Schema: node_modules/@tiptap/extension-list/dist/index.js:447 `content: "paragraph block*"` for listItem. The TXT exporter does honour start (export/text.ts:19).

**Detail.** Tiptap list items accept any block after the first paragraph: code blocks, images, blockquotes, tables, headings. Repro: in a numbered list item press Enter, then Shift+Tab or use the toolbar to insert an image or code block inside the item, and export to .docx. The image or code is missing from the Word file and no warning is shown. Likewise, an ordered list starting at 5 (attrs.start=5) exports as 1, 2, 3, while TXT export shows 5, 6, 7. This is wrong output in the format students submit, and it matters for the 0.3 'DOCX validated with real files' goal.

**Verifier.** docx.ts:175-196: list() handles only bulletList, orderedList and paragraph children of a list item, so every other block (image, codeBlock, blockquote, heading, table) is skipped silently. :205-207 keeps only Paragraph instances in table cells, so a nested Table is dropped. :176 and :188 use a fresh numbering instance per list, and attrs.start is never read, while text.ts:19 does honour start. The Tiptap listItem schema `content: "paragraph block*"` is at node_modules/@tiptap/extension-list/dist/index.js:447. Images are block nodes here (extensions/index.ts:26 uses the standard Image extension).

**Recommendation.** In list(), fall back to blocks([child], ctx) for any other child type, indented to the list level. Map attrs.start using a per-instance numbering override (docx supports the start option on numbering levels) or separate numbering configs. In tableBlock, keep Table children, or flatten them with a visible note. Add round-trip tests for these cases to docx.test.ts.

### CODE-5 — Overlapping flushes can save with a stale version and raise a false conflict against the editor's own save

*medium · bug · verdict: confirmed*

**Evidence.** apps/web/src/lib/storage.ts:96 (`if (inFlight.current) await inFlight.current;` lets every waiter resume together), :103 (version.current is read when each run starts), :124-126 (inFlight.current is overwritten by each new run and reset to null by an older one)

**Detail.** When two or more flushes wait on the same in-flight save, they all resume after it finishes. The first takes pending and starts save R2 with version v1. A second waiter with snapshot:true (Ctrl+S), or one that finds pending again, starts R3 with the same version.current=v1 before R2 has updated it. IndexedDB serialises the two transactions, so R3 sees v2 and throws ConflictError. blocked becomes true, the banner says the document 'was changed in another window', and autosave stops. Repro (timing-dependent, PLAUSIBLE): with a large document (embedded images make each save slow), hold Ctrl+S or press it three times quickly while an autosave is in flight. A second effect: inFlight.current=null set by an older flush can clear a newer run's handle, so a later flush skips waiting entirely. I did not reproduce this in a browser; it follows from the control flow.

**Verifier.** Traced storage.ts:90-127. Flush A awaits its own `run`, and flushes B and C await the same R1. A resumes first and sets inFlight=null. B then starts R2 and C starts R3 synchronously, both carrying the version.current that R1 just wrote. R3 reads the version R2 committed and throws ConflictError (:111-116), which shows the false 'changed in another window' banner. When R2 finishes, B sets inFlight=null while R3 is still running, which clobbers the handle. A small detail is wrong: the auditor says R2 and R3 both use 'v1'. Both actually use the post-R1 version (v2). The race needs three or more overlapping flushes, for example rapid Ctrl+S, or Ctrl+S plus the debounce timer plus visibilitychange. I did not reproduce it in a browser.

**Recommendation.** Serialise saves through one promise chain (`queue = queue.then(doSave)`), read version.current inside the queued step, and merge snapshot requests into the next queued save instead of running them in parallel. Add a unit test with a fake adapter that delays save().

### CODE-6 — Favorite, trash and restore increment the content version, so an editor open in another tab hits a false conflict

*medium · bug · verdict: confirmed*

**Evidence.** apps/web/src/components/ItemRow.tsx:24-28 (get followed by save({favorite}, full.version)); packages/local-storage/src/indexeddb.ts:167-168 (a favorite-only patch still sets version+1 and updatedAt) and :202 (setDeleted also sets version+1); apps/web/src/lib/storage.ts:111-116 (any version mismatch blocks autosave and shows the conflict banner)

**Detail.** In one window this cannot happen, because editor routes are outside AppShell (App.tsx:21-22). With two tabs or windows, or later with Tauri multi-window or tabbed documents (planned for 0.3): tab A edits a document, and tab B stars it on the Dashboard. Tab A's next autosave then fails with ConflictError and shows 'This document was changed in another window'. The content was not changed. 'Discard mine, load latest' throws away real typing, and 'Keep my edits as a copy' forks the document unnecessarily. Favorite also bumps updatedAt, which reorders 'Recent work' as if the file had been edited. ItemRow's get-then-save is itself non-atomic, but on a mismatch it only shows an error toast.

**Verifier.** ItemRow.tsx:24-28 does get() then save({favorite}, full.version). indexeddb.ts:167-169 bumps version and updatedAt even for a favorite-only patch, and :202 does the same in setDeleted (trash and restore). Any version mismatch puts the editor into conflict (storage.ts:111-116). Editor routes sit outside AppShell (App.tsx:21-22), so this needs two tabs or windows. Favorite also reorders 'Last edited' and 'Recent' because updatedAt changes.

**Recommendation.** Store metadata (favorite, deletedAt) under a separate metaVersion, or have save() ignore version checks for metadata-only patches and leave version/updatedAt alone. Add an atomic adapter method such as setFavorite(kind,id,value) that does the read-modify-write in one transaction. Before 0.3 tabbed documents, also broadcast changes (BroadcastChannel) so open editors can reconcile instead of conflicting.

### CODE-10 — Schema-upgrade 'blocking' handler reloads the page without flushing pending edits or closing the connection

*low · risk · verdict: confirmed*

**Evidence.** packages/local-storage/src/indexeddb.ts:73-76 (`blocking() { location.reload(); }`), no `blocked`/`terminated` handlers; apps/web/vite.config.ts:13 (`registerType: 'autoUpdate'`, which also reloads open clients when a new service worker takes control); apps/web/src/lib/storage.ts:185-188 (only an async flush on pagehide)

**Detail.** This path has not run yet because SCHEMA_VERSION=1, but every planned release (0.3 to 0.8) adds stores or migrations. When a new tab opens with v2, every older tab reloads immediately. An editor with an unsaved debounce (up to 600 ms of typing, or a pending conflict or error from CODE-2) only gets an async IndexedDB write started in pagehide, which the browser may cancel. Without a `blocked` callback, the upgrading tab also gives no feedback if an old tab cannot reload. Severity is low because no migration exists yet; the risk grows with each release.

**Verifier.** indexeddb.ts:73-76 calls location.reload() in blocking(). No blocked or terminated callback is passed to openDB. vite.config.ts:13 sets registerType: 'autoUpdate'. storage.ts:185-188 only starts an async flush on pagehide or visibilitychange. SCHEMA_VERSION=1 at :19, so this path has never run. Low severity is appropriate.

**Recommendation.** In blocking(): flush editors synchronously first (expose a global flushAll), close the db, then reload or show a 'New version ready, click to reload' banner instead of forcing a reload. Add a blocked() handler that tells the user to close other tabs. Use the vite-plugin-pwa 'prompt' mode, or gate the autoUpdate reload on the save status not being pending.

### CODE-11 — list() reads full item content (including base64 images) and stringifies it on every list refresh

*low · risk · verdict: corrected*

**Evidence.** packages/local-storage/src/indexeddb.ts:107-114 (db.getAll on the full store) and :54-57 (summarize runs JSON.stringify(content) for every item to compute sizeBytes); apps/web/src/lib/storage.ts:9-11 and :109 (notifyStorageChanged after every title save reloads all lists); apps/web/src/pages/FilesPage.tsx:12-13 and Dashboard.tsx:15-16 (both kinds always loaded)

**Detail.** Images are embedded as data URLs of up to 1600 px (document-studio/src/image.ts:1, 34-40), so a semester of documents with photos can mean tens of MB deserialised and re-stringified each time the Dashboard or Files page mounts or any title changes. sizeBytes is also a UTF-16 character count, not bytes. The Presentations, PDF and Notebook stores planned for 0.5 to 0.7 will multiply this. No measurements were taken; this is a scaling fragility, not an observed failure.

**Verifier.** Correct: indexeddb.ts:107-114 uses getAll over full records, :54-57 runs JSON.stringify on each item's content for sizeBytes, and sizeBytes is a UTF-16 .length, not bytes. FilesPage.tsx:12-13 and Dashboard.tsx:15-16 always load both kinds, and image.ts allows data URLs up to MAX_DIMENSION 1600. Correction: the claim that 'any title change reloads all lists' does not hold within one window. notifyStorageChanged (storage.ts:109) only reaches mounted useItems listeners, and list pages are unmounted while an editor route is open (App.tsx:14-22). The real cost falls on every Dashboard or Files mount and on every row action (ItemRow run() at :17), each of which reloads both kinds in full. This is unmeasured, so it stays a scaling risk.

**Recommendation.** Persist a summary (title, updatedAt, favorite, deletedAt, sizeBytes) in a separate 'summaries' store or index, updated inside save/create/trash transactions, and have list() read only that. Compute size with new Blob([json]).size at save time.

### CODE-12 — Find shortcut and mode toggle write a document version; print iframe cleanup depends on afterprint

*low · bug · verdict: confirmed*

**Evidence.** packages/document-studio/src/DocumentEditor.tsx:49-55 (any page or mode change calls onChange with full content) and :83-87 (Ctrl/Cmd+F calls setMode('advanced')); DocumentEditor.tsx:81-92 (Ctrl+F and Ctrl+P are handled only when focus is inside the editor wrapper); packages/document-studio/src/export/print.ts:60-63 and :71-80 (the iframe is removed and the promise resolved only in afterprint; the timeout restores the title but never removes the iframe)

**Detail.** (a) Pressing Ctrl+F in a 'simple' document saves the document with mode:'advanced'. This increments the version, marks it edited, and in multi-tab use can trigger CODE-6-style conflicts; the UI preference is stored as document data. (b) With focus in the title input or toolbar, Ctrl+P goes to the browser and prints the whole app UI rather than the document. (c) If an engine does not fire afterprint for an iframe window, the hidden iframe holding a full copy of the document, including images, is never removed and printDocument() never resolves. Whether current Safari and Firefox fire afterprint here is UNVERIFIED, so (c) is uncertain.

**Verifier.** DocumentEditor.tsx:47-55 calls onChange whenever page or mode changes, and :83-86 calls setMode('advanced') on Ctrl/Cmd+F. In a 'simple' document that writes a save; when the document is already advanced, React skips the effect. The onKeyDown at :81-92 is a wrapper handler, so Ctrl+P with focus outside it falls through to browser print. In print.ts, :60-63 removes the iframe and resolves only in cleanup, which only afterprint triggers (:71-74). The fallback timeout at :78-80 restores only the title, and the code's own comment at :77 says some engines don't fire afterprint for iframes. Part (c) stays uncertain, as the auditor says.

**Recommendation.** Keep the editor mode outside DocumentContent (per-user preference), or keep it in the document but stop opening Find from changing it. Register Ctrl+P at page level in DocumentPage, as Ctrl+S is. In printDocument, always remove the iframe in the timeout fallback (or on the next focus event) and resolve the promise there.

### CODE-7 — Undo does not restore settings.autoLayout, and addChild re-lays out every tree in the diagram

*low · bug · verdict: confirmed*

**Evidence.** packages/diagram-studio/src/DiagramEditor.tsx:72-75 (Snapshot = {nodes, edges} only), :129-135 (restore sets nodes and edges but not settings), :190 (applyLayout sets settings.autoLayout), :225 (addChild runs layoutTree on all nodes and edges whenever autoLayout !== 'none'); layout.ts:52-57 (every connected root is re-laid out)

**Detail.** Repro: Arrange > Tree: top to bottom, then Ctrl+Z. The positions are restored but autoLayout stays 'TB'. Select a node and press Tab. The whole diagram, including other trees the user positioned by hand, snaps back to the tree layout. The same happens in templates created with autoLayout (tree, mindmap, org chart): after dragging nodes by hand, any Tab or Enter re-lays out everything. Undo does recover the positions, but the user cannot tell why.

**Verifier.** DiagramEditor.tsx:72-75 defines Snapshot as {nodes, edges}. restore at :129-135 does not touch settings. applyLayout at :190 sets settings.autoLayout, and addChild at :225 re-lays out everything whenever autoLayout !== 'none'. Tab and Enter are bound at :339-340 (Enter goes to addSibling, which calls addChild when the node has a parent). layout.ts:52-57 lays out every connected root.

**Recommendation.** Include settings, or at least autoLayout, in history snapshots. Have addChild re-lay out only the subtree rooted at the parent's root. When the user drags a node in an auto-layout diagram, switch autoLayout to 'none' and show a toast.

### CODE-8 — Inspector focus pushes an undo snapshot even without an edit, creating no-op undos and clearing redo

*low · bug · verdict: confirmed*

**Evidence.** packages/diagram-studio/src/Inspector.tsx:61 and :120 (`onFocus={() => onPatch({}, { snapshot: true })}`); DiagramEditor.tsx:285-287 (patchNodes calls snapshot() before the empty-patch early return); history.ts:14 (push clears the future stack)

**Detail.** Repro: make a change, press Ctrl+Z, then click into the shape's Text box in the inspector without typing. The redo stack is cleared, and Ctrl+Y no longer redoes. Each focus without an edit also adds an identical snapshot, so later undos take extra presses that appear to do nothing.

**Verifier.** Inspector.tsx:61 (node Text textarea) and :120 (connector Label input) both call onPatch({}, {snapshot:true}) on focus. patchNodes (DiagramEditor.tsx:285-287) and patchEdges (:291-293) call snapshot() before the empty-patch return, and history.ts:14 clears the future stack on push. The note's line references are right, except that :120 is the edge inspector, which goes through patchEdges.

**Recommendation.** Record the pre-edit state on focus but push it only on the first actual change (a dirty flag per focus session), or push on blur only if the label changed.

### CODE-9 — Find/replace computes wrong ranges when lowercasing changes string length (e.g. Turkish İ)

*low · bug · verdict: confirmed*

**Evidence.** packages/document-studio/src/extensions/searchReplace.ts:41-44 (the index into the lowercased `hay` is used to look up `positions`, which is built from the original text); `node -e 'console.log("İstanbul city".toLowerCase().length, "İstanbul city".length)'` prints `14 13`

**Detail.** In case-insensitive mode, any character whose lowercase form is longer (U+0130 'İ' becomes 'i̇') shifts every later match in that paragraph. Repro: a paragraph containing 'İstanbul city'; search for 'city'. The match index (10) points one character too far right, and positions[13] is undefined, so `to` is NaN. The highlight is wrong or Decoration.inline throws, and Replace calls tr.insertText with NaN, which throws a RangeError or replaces the wrong characters.

**Verifier.** searchReplace.ts:41-44 indexes the lowercased `hay` but looks the offset up in `positions`, which is built from the original text. Ran node: '"İstanbul city".toLowerCase().length' gives 14, '.length' gives 13, and indexOf('city') in the lowercased string gives 10, one past the original index 9. positions[13] is undefined, so `to` is NaN. Whether Decoration.inline or insertText then throws or misbehaves was not verified, and the auditor already hedges on this.

**Recommendation.** Lowercase each character separately and record the original index for every UTF-16 unit of the lowered output, or compare with localeCompare/Intl.Collator on equal-length windows. Add a test using 'İ'.

### CODE-13 — Trash route merging both kinds is correct

*info · works · verdict: confirmed*

**Evidence.** apps/web/src/App.tsx:18 (`<FilesPage kind="document" trash />`); apps/web/src/pages/FilesPage.tsx:12-13, 20-21 (the trash view merges docs.items and diagrams.items and loads both), :60 and :79 (the 'New' button is hidden in trash); apps/web/src/components/ItemRow.tsx:68-69 (restore and purge use item.kind, not the page's kind)

**Detail.** Although the route passes kind='document', the trash view lists, restores and purges diagrams correctly, because every action uses the row's own item.kind. The only effect of kind='document' in trash is invisible: nothing reads it on that path. Opening a trashed item by direct URL still loads and autosaves it (useEditableItem does not check deletedAt), which is a minor gap.

**Verifier.** App.tsx:18 passes kind='document' with trash. FilesPage.tsx:20-21 merges both kinds when trash is set, and :60 and :79 hide the New button in trash. ItemRow.tsx:68-69 and FilesPage.tsx:39 use item.kind / purging.kind. useEditableItem (storage.ts:72-88) never checks deletedAt, so a trashed item opened by URL can still be edited and autosaved.

**Recommendation.** No fix needed. Optionally make `kind` optional when trash is true to avoid confusion, and show a 'This item is in the trash — Restore' banner when deletedAt is set in the editor.

### Found by the verifier (missed by the auditor)

- (low/medium) Restoring a version from inside the editor can silently discard unsaved edits. The VersionHistory Restore button (EditorFrame.tsx:132-139) calls storage.restoreVersion directly, then onRestored(), which bumps the remount key (DocumentPage.tsx:9-11, DiagramPage.tsx:9-10). The unmounting editor's cleanup flush (storage.ts:192) then tries to save any pending edits with the old version.current, because restoreVersion bumped the version (indexeddb.ts:235). The save throws ConflictError, and the catch only calls setState on the unmounted component. Pending edits occur here whenever the hook was in 'error' state (pending is kept at :118) or the 600 ms debounce had not fired. Those edits are not in the 'Before restore' snapshot either, because restoreVersion snapshots the stored record (indexeddb.ts:230), not the pending edits. This is the same root cause as CODE-2, reached by another route.
- (low) Pruning has no test coverage, and its comment contradicts the code. indexeddb.ts:22 says 'oldest automatic snapshots are pruned first', but prune (:319-322) evicts manual and restore versions as well. The only version test (indexeddb.test.ts:56-60) checks create and manual reasons and never reaches MAX_VERSIONS_PER_ITEM=50. The 0.3+ roadmap depends on version history, so this gap matters for CODE-1.
- (low) setDeleted (indexeddb.ts:199-201) and restoreVersion (:225-227) throw NotFoundError inside a readwrite transaction without calling tx.abort() or awaiting tx.done, unlike save (:152-160), which aborts explicitly. Nothing has been written at that point, so the transaction auto-commits harmlessly. The error handling is still inconsistent, though, and could leave unhandled tx.done rejections once writes are added before the check in future migrations. Low confidence on practical impact.
