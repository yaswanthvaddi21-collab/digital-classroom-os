# Technical debt — v0.2.0 Stable readiness (Phase 1)

Audited commit `ea7f316`, 2026-11-13. Debt here means structural problems that make later work slower or riskier. Defects with user-visible symptoms are in [PROJECT_AUDIT.md](PROJECT_AUDIT.md); what blocks the release is in [RELEASE_GAPS.md](RELEASE_GAPS.md). Items found by more than one area audit are merged.

**Effort:** S = up to a day · M = a few days · L = one to two weeks · XL = more.

## Storage and data

| # | Debt | Where | Impact | Effort |
|---|---|---|---|---|
| TD-1 | **No attachment cleanup.** `StorageAdapter` has no `deleteAttachment`, purge leaves attachments, and every embedded-diagram edit stores a new PNG | `packages/local-storage/src/indexeddb.ts` (putAttachment/purge/export), `apps/web/src/components/DiagramDialogs.tsx` | IndexedDB and every backup grow without bound. This raises the chance of hitting quota or eviction (incident S-1 in the Release 0.2 audit) | M |
| TD-2 | **Images stored inline as data URLs** inside content, and so inside every version snapshot | `packages/document-studio/src/image.ts`, `indexeddb.ts` versionOf | Up to 50× duplication per image, large `JSON.stringify` on every edit, faster quota exhaustion. The planned images-to-attachments migration (Release 0.2 audit, step 7) is not done | L |
| TD-3 | **One draft slot per item**, and no list of pending drafts | `indexeddb.ts` saveDraft (key `kind:id`), `apps/web/src/lib/storage.ts` | Drafts can be overwritten. They are invisible unless that exact item is opened, and they are not in backups | M |
| TD-4 | **Every failure handled the same way** (quota, not found, transient) | `apps/web/src/lib/storage.ts` save queue | Terminal errors are retried, the status text claims retrying when nothing is scheduled, and the user is never told the storage is full | S |
| TD-5 | **Storage singleton created at import**, with no adapter injection | `apps/web/src/lib/storage.ts` | A SQLite adapter for Tauri/Capacitor cannot be chosen without editing this module | S |
| TD-6 | **Unguarded async handlers** in settings and version history | `apps/web/src/pages/settings/SettingsPages.tsx`, `EditorFrame.tsx` VersionHistory | Failures become unhandled rejections or an endless "Loading…" | S |
| TD-7 | **Emergency localStorage drafts never cleaned up**; preferences neither synced across tabs nor backed up | `apps/web/src/lib/storage.ts`, `apps/web/src/lib/preferences.ts` | Stale entries consume the 5 MB localStorage budget; settings are lost when site data is cleared | S |
| TD-8 | **Page settings and editor mode are outside content validation and schema versioning** | `packages/document-studio/src/types.ts`, `migrate.ts` | Invalid values crash the editor or break exports; a future page feature can't be detected as "newer" | S |

## Document Studio

| # | Debt | Where | Impact | Effort |
|---|---|---|---|---|
| TD-9 | **Print HTML built by string templates** | `packages/document-studio/src/export/print.ts` | Source of the header/footer injection (DS-1). It is also meant to be the base for native PDF later | S |
| TD-10 | **DOCX exporter fidelity gaps**: line height, column widths, list alignment, highlight vs shading, static table of contents, remote images | `packages/document-studio/src/export/docx.ts` | Silent formatting loss in the most important export | M |
| TD-11 | **DOCX tests check stability, not correctness**: golden snapshots of our own XML plus a heading-only mammoth check; no OOXML validation; no diagram or schema-2 fixture | `tests/integration/docx-golden.test.ts` | A Word-incompatible structure would pass every test | S |
| TD-12 | **No component tests** for Toolbar, PageSetupDialog, FindReplaceBar or the Simple/Advanced gating | `packages/document-studio/src/ui/*` | No automated check that each control has an effect | M |
| TD-13 | **TXT export drops images and the table of contents without a marker** | `packages/document-studio/src/export/text.ts` | Content silently disappears; inconsistent with the diagram placeholder | S |
| TD-14 | **Diagram preview object URLs never revoked**; failures cached at module level | `packages/document-studio/src/extensions/diagramEmbed.tsx` | Memory grows over long sessions; one transient failure leaves "Loading…" until reload | S |

## Diagram Studio

| # | Debt | Where | Impact | Effort |
|---|---|---|---|---|
| TD-15 | **`DiagramEditor.tsx` is a 785-line component** mixing history, mutations, shortcuts, export and layout | `packages/diagram-studio/src/DiagramEditor.tsx` | Group, lock, z-order and distribute would all land here; hard to test without a browser | M |
| TD-16 | **Only four fixed connection handles and no waypoint model** | `ShapeNode.tsx`, `types.ts` SerializedEdge | diagrams.net waypoints and perimeter points can't be represented, so import/export stays lossy. Routing upgrades need a schema 3 change | L |
| TD-17 | **Missing editor primitives**: group/ungroup, lock, z-order/layers, distribute, full-screen, rotation | `packages/diagram-studio/src` (absent) | Brief phase 5 items. diagrams.net groups and layers are flattened on import | L |
| TD-18 | **Clipboard is an in-memory ref per editor**: no cut, no system clipboard | `DiagramEditor.tsx` | Shapes can't move between diagrams or into documents; Ctrl+X does nothing | M |
| TD-19 | **No large-diagram test** (render, drag, export, import) | `packages/diagram-studio/src/*.test.ts`, `e2e/diagram.spec.ts` | Scale and export-size limits are unknown | S |
| TD-20 | **`fromDrawio` builds child lists by copying arrays** (quadratic on large flat files) | `packages/diagram-studio/src/drawio.ts` | Part of the 354 ms import time at 5000 cells; worse beyond | S |
| TD-21 | **A separate `<marker>` per decorated edge end** instead of shared definitions | `packages/diagram-studio/src/edges.tsx` | Extra DOM: 500 markers for 500 default edges, more with two-ended markers. Ids are unique, so this is size, not correctness | S |
| TD-22 | **SVG export is HTML in `foreignObject`** (html-to-image), not a model-to-SVG renderer | `packages/diagram-studio/src/export.ts` | Not portable to office and design tools | M |

## App shell and UI

| # | Debt | Where | Impact | Effort |
|---|---|---|---|---|
| TD-23 | **A single top-level error boundary wraps the whole shell** and never resets | `apps/web/src/App.tsx`, `components/ErrorBoundary.tsx` | A crash in any list or settings page removes navigation; only a reload recovers | S |
| TD-24 | **Toast host isn't aware of modal dialogs** | `packages/ui/src/toast.tsx` | Feedback raised while a native modal is open is invisible (and inert for assistive technology) | S |
| TD-25 | **Menus without the keyboard menu pattern; mobile drawer without dialog semantics** | `packages/ui/src/components.tsx`, `apps/web/src/components/AppShell.tsx` | Accessibility gaps that every new menu inherits | S |
| TD-26 | **No i18n layer**; English strings hard-coded everywhere | `apps/web/src/**`, `packages/*/src/**` | Localisation later touches every component; dates already follow the browser locale | L |
| TD-27 | **PWA manifest has only an SVG icon**; no apple-touch-icon or theme-color | `apps/web/vite.config.ts`, `apps/web/index.html` | Weaker install experience on iOS and some Android launchers | S |
| TD-28 | **Downloads rely on `<a download>`** and PDF on `window.print()` | `packages/ui/src/download.ts`, `export/print.ts` | Will not work in Tauri/Capacitor webviews without native save and print adapters | M |
| TD-29 | **No web Content-Security-Policy** | `apps/web/index.html`, deployment docs | No defence in depth against a future injection bug | S |

## Platforms, build and repository

| # | Debt | Where | Impact | Effort |
|---|---|---|---|---|
| TD-30 | **Native shells outside the npm workspace and lockfile**; no `Cargo.lock`; Tauri icons missing | `package.json` workspaces, `apps/desktop`, `apps/android` | Non-reproducible native builds; licence and audit gates don't cover the Tauri CLI, Capacitor or Rust crates; the desktop build fails as committed | M |
| TD-31 | **No platform detection**: the service worker would register inside native webviews | `apps/web/src/main.tsx`, `components/SystemBanners.tsx` | Offline and update behaviour in the shells is undefined | S |
| TD-32 | **Python dependencies unpinned** (ranges, no lock); local venv 3.9 vs CI 3.12 | `backend/requirements*.txt`, `.github/workflows/ci.yml` | Drift between local and CI runs | S |
| TD-33 | **CI hardening**: no `permissions` block, actions pinned to tags not SHAs, no timeouts or concurrency, coverage thresholds never enforced | `.github/workflows/ci.yml`, `vitest.config.ts` | Weaker supply-chain posture; coverage floors are decorative | S |
| TD-34 | **Placeholder git identity and no remote** | git config, all 6 commits | No real authorship; CI never triggered | S |
| TD-35 | **Empty backend packages** (`authentication`, `classroom`, `synchronization`) | `backend/*/__init__.py` | Clutter that can read as progress | S |
| TD-36 | **No project LICENSE** (Cargo.toml says MIT, nothing else does) | repository root | The project's own licence is undefined for a release | S |
| TD-37 | **`.gitignore` misses `.env*`, `*.db`, `*.sqlite`** outside `backend/` | `.gitignore` | A future secret or local database could be committed by `git add -A` | S |

## Notes

- **Build-chain advisories.** The 6 `npm audit` advisories are in `vite-plugin-pwa → workbox-build`, which is build time only. npm's suggested fix is a major downgrade. Track upstream rather than downgrade; `SECURITY.md` already records this.
- **Earlier debt is already paid.** Several items from the Release 0.2 audit were fixed in `ff53b49`–`ea7f316`: version pruning, the save queue, drafts, cross-tab sync, the safety copy and backup format 2. They are not repeated here.

## Status after Phase 4 (Document Studio)

| # | Status | Where |
|---|---|---|
| TD-2 images inline as data URLs | ⬜ Not changed. Phase 4 kept images inline in document content, and pasted web pictures are now stored inline too. Version history stores large images once (Phase 3), but the live document and backups still carry each image | [ADR 0011](../adr/0011-document-format-phase4.md) §10, [ADR 0005](../adr/0005-version-history.md) |
| TD-8 page settings and mode outside validation and schema versioning | ✅ Fixed: every page setting, layout field, mode and content field is checked; unknown values open the protected view; `contentSchemaFor()` covers the body, page and top-level fields through the frozen v0.1.0 vocabulary | `types.ts`, `pageLayout.ts`, `compat.ts`; ADR 0011 §1–3 |
| TD-9 print HTML built by string templates | 🟡 The injection is fixed (`cssString()` escapes `<` and `>`; tested with `</style>`), and print rules and DOM changes are registries (`PRINT_CSS`, `PRINT_DOM`). The page is still assembled as a string | `export/print.ts` |
| TD-10 DOCX fidelity gaps | ✅ Fixed in the XML: line spacing, column widths (with row spans), list and quote alignment, highlight as `w:highlight`, named colours, a real table-of-contents field; remote pictures are stored or written as reported placeholders. Seen in Apple Pages for all 16 samples and in Word for 2 (DOCUMENT_COMPATIBILITY.md §8) | `export/docx/`; [DOCUMENT_COMPATIBILITY.md](../DOCUMENT_COMPATIBILITY.md) §3, §8 |
| TD-11 DOCX tests check stability, not correctness | 🟡 Better: mammoth now checks every paragraph, list item, table cell and image; schema-2 goldens for formatting, layout and a v2 kitchen sink (DOCX and ODT); export is deterministic. Still no OOXML or ODF schema validation and no Word, Pages or LibreOffice check | `tests/integration/*golden*.test.ts`; DOCUMENT_COMPATIBILITY.md §7 |
| TD-12 no component tests for the toolbar and dialogs | ✅ Fixed: ribbon, format, layout, insert and review component tests, including Simple/Advanced gating, Page setup guards and the find options | `ui/ribbon/**/*.test.tsx`, `ui/insert/InsertObjects.test.tsx`, `review/Review.test.tsx` |
| TD-13 TXT export drops images and the table of contents | ✅ Fixed, inside table cells too | `export/text.ts` |
| TD-14 diagram preview URLs never revoked; failures cached | ✅ Fixed: reference-counted cache, failures never cached, unused URLs revoked least recently used first | `extensions/previewCache.ts` |

New debt from Phase 4:

| # | Debt | Where | Impact | Effort |
|---|---|---|---|---|
| TD-38 | **Deterministic TOC bookmarks rely on a private `docx` 9.15.3 property** (`Body.headingBookmarkIds`, set through a cast) | `export/docx/index.ts` | A `docx` upgrade that renames it brings back session-wide ids; the determinism tests would fail and flag it | S |
| TD-39 | **ODT import has no overall cap on repeated rows and columns** (50 per row, 64 per cell, unbounded in total) | `import/odt.ts` | A small crafted file can build a very large table and exhaust memory | S |
| TD-40 | **Imports run on the main thread** | `import/` | A large file blocks the tab while it imports | M |
| TD-41 | **The DOCX import's formatting note is worked out from raw XML**, and private-use characters carry alignment and page breaks through mammoth | `import/docx.ts` | The note can name formatting that was imported; U+E000/U+E001 in a document's own text are misread | S |

## Status after Phase 5 (Diagram Studio)

Working tree on top of `206e080`, not yet committed.

| # | Status | Where |
|---|---|---|
| TD-15 `DiagramEditor.tsx` is a 785-line component | ✅ Fixed: about 290 lines of wiring. State, canvas features, pure model operations, mutations, shortcuts, toolbar and export are separate modules behind registries and one `EditorController`, each with tests. The largest pieces are now `editor/useCanvas.ts` (about 670 lines, one hook) and `editor/canvasModel.ts` (about 700 lines, pure functions) | `editor/`; `canvas.test.tsx`, `canvasModel.test.ts`, `mutations.test.ts`, `useDiagramState.test.tsx` |
| TD-16 four fixed handles, no waypoint model | ✅ Fixed in schema 3: eight fixed points (side handles plus corner ports), floating perimeter ends, bend points and label positions, mapped to and from diagrams.net | `connect/geometry.ts`, `model.ts`, `drawioFeatures.ts`; `connect/*.test.ts`, `drawio-phase5.test.ts`, `e2e/diagram-connect.spec.ts`; ADR 0012 |
| TD-17 missing editor primitives | 🟡 Group/ungroup, lock, layers and z-order, distribute and full screen are implemented and tested. Rotation is stored, drawn and exported but cannot be set in the editor (TD-43) | `editor/canvasModel.ts`, `editor/useCanvas.ts`; `e2e/diagram-canvas.spec.ts` |
| TD-18 in-memory clipboard, no cut | 🟡 Cut and the system clipboard between diagrams and tabs work (copy/paste events, async Clipboard API fallback; tested on the Diagrams page). Copy, cut and Ctrl+V are ignored while focus is in a dialog over the editor such as Export options, so nothing is pasted behind it (`canvas.test.tsx` tests the paste). The document's diagram dialog, which holds the editor, does not count (TD-47, fixed): a paste there is unit-tested, copy and cut there are not. Shapes still cannot be pasted into a document: Document Studio sees only the JSON text (TD-44) | `editor/useCanvas.ts` `inEditor`, `editor/shortcuts.ts` `inDialog`, `canvasModel.ts` `toClipboardPayload`; `canvas.test.tsx`, `e2e/diagram-canvas.spec.ts` (Diagrams page) |
| TD-19 no large-diagram test | ✅ Fixed: 500 and 2000 generated shapes (load, save, layout, `.drawio` and `.dcosdiagram` round trips) and a 500-shape browser test (render, drag, save, PNG). Render and drag frame rates are not measured | `tests/integration/large-diagram.test.ts`, `tests/fixtures/diagrams/large.ts`, `e2e/diagram-large.spec.ts` |
| TD-20 `fromDrawio` child lists copied per cell | ✅ Fixed: lists are appended in place | `drawio.ts` |
| TD-21 one `<marker>` per edge end | ✅ Fixed: one shared definition per marker kind and colour (`MarkerDefs`); the 500-shape test checks there are at most 10 and none dangle | `edges.tsx`; `e2e/diagram-markers.spec.ts`, `e2e/diagram-large.spec.ts` |
| TD-22 SVG export is HTML in `foreignObject` | ✅ Fixed: model-to-SVG renderer for SVG, PNG and a vector PDF. The old capture code is still in the package (TD-42) | `vector/`; DIAGRAM_EXPORTS.md |
| TD-24 toast host not aware of modal dialogs | ⬜ Unchanged (RG-8). Full screen has its own workaround (`editor/fullscreenToasts.tsx`); the document's diagram dialog does not, so outside full screen the editor's Phase 5 messages there (export notes and the pixel ratio used, the cut, ungroup and paste messages, the timeline note, "Full screen is not available here.") are invisible too (from reading the code) | `packages/ui/src/toast.tsx` |

New debt from Phase 5:

| # | Debt | Where | Impact | Effort |
|---|---|---|---|---|
| TD-42 | **The html-to-image capture is dead but still public.** `exportPng`, `exportSvg`, `exportPdf`, `renderPng`, `renderPdf` and `exportSize` in `export.ts` are exported from the package index, and only `renderPng` and `renderPdf` are tested (`export.test.ts`), but nothing calls them; `prepareCapture` in the editor controller is unused. `cappedPixelRatio` and `resolutionNote`, which the vector exports use, live in the same file | `packages/diagram-studio/src/export.ts`, `index.ts`, `editor/controller.ts`, `DiagramEditor.tsx` | Two export paths to maintain, and a host could still produce `foreignObject` SVG and raster PDF. html-to-image stays a production dependency | S |
| TD-43 | **Presentation fields have no editor controls**: rotation, opacity, font family, text alignment and image shapes are only read from files | `Inspector.tsx`, `editor/canvasSections.tsx`, `shapeRegistry.ts` ('no picture picker yet') | Users can keep and move what a `.drawio` brings but cannot create or change it; brief phase 5 rotation is only partly met | S–M |
| TD-44 | **The clipboard's text copy is the diagram JSON.** Other apps, and Document Studio (which does not read `application/x-dcos-diagram`), receive JSON text when shapes are pasted (from reading the code; not probed in a browser) | `editor/canvasModel.ts` `CLIPBOARD_MIME`, `editor/useCanvas.ts` | Pasting shapes into a document or a text field inserts a block of JSON | S |
| TD-45 | **PDF export uses only jsPDF's built-in fonts** (Helvetica, Courier; WinAnsi) | `vector/pdf.ts`, `vector/textLayout.ts` | Labels in Greek, CJK, emoji and similar may not appear in the PDF (stated in the toast); embedding a font is needed for full Unicode | M |
| TD-46 | **diagrams.net mappings unverified outside our own importer**: stencil names for BPMN and network shapes were written from memory, and the import corpus is hand-written | `library/defs.ts`, `drawioFeatures.ts`, `tests/fixtures/drawio/` | A mapping error would pass every test; files may look different in diagrams.net | S (needs diagrams.net) |
| TD-47 | ✅ **Fixed in Phase 5. `inDialog()` matched any ancestor dialog**, including the document's `<dialog>` that hosts the editor, not only dialogs opened over the editor (Export options, the shortcut help). So in a document's New/Edit diagram dialog the keyboard shortcuts, Delete/Backspace and copy/paste did nothing (a regression within Phase 5; at `206e080` `isTyping` was the only check). Now `inDialog(target, root)` ignores a dialog that contains the editor's own root; `handleShortcut`, `useCanvas.ts` `inEditor` and `DiagramEditor.tsx` `onBeforeDelete` pass the root | `editor/shortcuts.ts`, `editor/useCanvas.ts`, `DiagramEditor.tsx`; host `apps/web/src/components/DiagramDialogs.tsx`; `canvas.test.tsx` 'inside the dialog that hosts it…' (Ctrl+D, paste, Delete), `e2e/diagram-embed.spec.ts` 'inside the document's diagram dialog the editor keeps its keyboard…' (duplicate, delete, undo; Chromium and WebKit, failed before the fix) | None left. Copy and cut inside the document dialog are not tested | S (done) |
| TD-48 | **`cn` does not merge Tailwind classes** (it is plain `clsx`), so a class passed to a shared component cannot override a conflicting default. Found in Phase 5: `w-20` could not narrow the shared `Input` (`w-full`), which pushed the Format panel's Add property button about 50 px outside the panel and left the value field 26 px wide (Chromium and WebKit). That row is now a grid (`editor/canvasSections.tsx`; asserted in `e2e/diagram-canvas.spec.ts`); other call sites were not audited | `packages/ui/src/components.tsx` `cn` | An override that silently does nothing can break a layout without any error | S |
