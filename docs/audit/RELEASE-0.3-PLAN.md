# Release 0.3 — Document Studio: task breakdown

**Status:** proposed and awaiting approval. **Starts only after** Release 0.2 items A (data safety) and B (regression net) in [RELEASE-0.2-AUDIT.md §9](RELEASE-0.2-AUDIT.md#9-recommended-changes) are done.

**Effort:** S ≤ 1 day · M 2–4 days · L 1–2 weeks · XL > 2 weeks.
**Feature rule:** a feature is complete only when it works, persists, survives reload, exports as described, and has tests. If a feature has a limit, the UI says so. Nothing is shown that doesn't work.

## Ground rules for every task

- **Schema.** New node, mark and attribute names only. Never rename `paragraph`, `heading`, `image`, `table*`, `pageBreak`, `tableOfContents`, `textStyle`, `highlight`, etc. Any change to stored content goes through `migrateDocument` (1 → 2) with fixture tests ([MIGRATION-PLAN.md §5](MIGRATION-PLAN.md#5-content-schema-upgrades)).
- **Exporters.** Every new node or mark needs a DOCX mapping, a print/PDF rendering and a TXT rendering, **or** an explicit, tested "exported as …" fallback. The per-node exporter test matrix fails when a new node type has no mapping.
- **Commands.** All editing actions go through the command registry (task 3.1.1), so the ribbon, Simple mode, keyboard shortcuts and Settings → Keyboard Shortcuts all show the same thing.
- **No paid components.** No `@tiptap-pro/*`, no Tiptap Platform features. CI checks the lock file for them.
- **Licences.** Only packages within the allow-list. Each new dependency gets a row in `docs/DEPENDENCIES.md` in the same change.

## Epics

### 3.1 Command registry and ribbon (M)

| Task | Detail | Size |
|---|---|---|
| 3.1.1 | `DocumentCommand { id, label, icon, shortcut?, isActive(editor), isEnabled(editor), run(editor, args?) }` registry; move every existing toolbar action into it unchanged | M |
| 3.1.2 | `@dcos/ui` Ribbon, RibbonTab, RibbonGroup, SplitButton, Gallery components (keyboard-accessible, collapsible, responsive) | M |
| 3.1.3 | Advanced mode = ribbon with Home, Insert, Layout, References, Review and View tabs, each showing only commands that work in that release | S |
| 3.1.4 | Simple mode = today's toolbar, re-rendered from the same commands, so existing users keep the same layout | S |
| 3.1.5 | Fix the "Ctrl+K" label by adding the shortcut; populate Settings → Keyboard Shortcuts from the registry | S |

**Acceptance:** every command from v0.1.0 is reachable in both modes; switching modes never changes the document; there are Playwright checks for each ribbon tab.

### 3.2 Multiple open documents and tabs (M)

| Task | Detail | Size |
|---|---|---|
| 3.2.1 | `OpenItemsProvider` above the router: one controller per `kind:id`, replacing per-page `useEditableItem` | M |
| 3.2.2 | Tab bar in a workspace layout route; keep the 8 most recent editors mounted but hidden; the URL `#/documents/:id` is the active tab, so existing links still work | M |
| 3.2.3 | Shortcut manager scoped to the active tab (Ctrl/⌘+S, +W close, +Tab switch) | S |
| 3.2.4 | Closing a tab or the window with unsaved/error/conflict status prompts; pending edits go to `drafts` | S |

**Acceptance:** open 5 documents, edit each, close and reopen them, and every edit is kept. Deep links still open the right document.

### 3.3 Paged view and print layout preview (L, high risk)

| Task | Detail | Size |
|---|---|---|
| 3.3.1 | **Spike (2 days):** try `tiptap-pagination-plus` 3.1.0 (MIT) on the 5 templates plus a 30-page fixture with tables and images, alongside the existing TableKit. Decide go/no-go with a written result | S |
| 3.3.2a | If go: integrate it, with per-page header, footer and page number | M |
| 3.3.2b | If no-go: build our own paged view with decorations (measure block heights, insert page-gap widgets, page headers/footers/numbers; tables split only between rows) | L |
| 3.3.3 | Print Layout Preview: an exact view using the existing print HTML in an iframe; feature-detect `@page` margin boxes and warn when they're unsupported | M |
| 3.3.4 | Status bar shows the actual page count, replacing the fixed "Page 1" | S |

**Stated limitation (shown in the UI):** editor page breaks are approximate. The PDF/print and DOCX output are authoritative.

### 3.4 Rulers, indents and styles (M–L)

| Task | Detail | Size |
|---|---|---|
| 3.4.1 | Paragraph indent attributes (left, right, first-line, hanging) plus a horizontal ruler with draggable markers; DOCX `indent` | M |
| 3.4.2 | Line spacing and space before/after; DOCX `spacing` | S |
| 3.4.3 | Built-in paragraph styles (Normal, Title, Subtitle, Heading 1–4, Quote, Caption, Code) and character styles (Emphasis, Strong, Code); exported as named DOCX styles | M |
| 3.4.4 | User-defined styles (stored in document content v2), and a style gallery in the Home tab | M |

### 3.5 Advanced tables and images (M)

| Task | Detail | Size |
|---|---|---|
| 3.5.1 | Export column widths, cell shading, vertical alignment and nested tables to DOCX; header-row repeat | M |
| 3.5.2 | Images in the `attachments` store (`asset:` sources), with resolvers in every exporter, per MIGRATION-PLAN §6 | M |
| 3.5.3 | Image float/wrap attributes (inline, float left or right with wrap, top-and-bottom), alignment and captions; DOCX floating images | M |

### 3.6 Sections and columns (L) — content schema 1 → 2

| Task | Detail | Size |
|---|---|---|
| 3.6.1 | `migrateDocument` 1 → 2: `page` becomes `sections[0]`; fixture tests | S |
| 3.6.2 | `sectionBreak` atom node `{ type: nextPage \| continuous, page, columns }`, Layout tab controls | M |
| 3.6.3 | Columns rendered with CSS columns between section breaks, in the editor and print | M |
| 3.6.4 | DOCX multi-section output with per-section size, orientation, margins and columns | M |

### 3.7 References (L)

| Task | Detail | Size |
|---|---|---|
| 3.7.1 | Footnotes: evaluate `tiptap-footnotes` 4.0.1 (MIT) or write our own; DOCX native footnotes; print as page-bottom notes where the browser supports it, otherwise endnotes (stated) | M |
| 3.7.2 | Table of contents: stable heading IDs (`@tiptap/extension-unique-id`, MIT); real Word TOC field in DOCX; page numbers in PDF via `target-counter()` | M |
| 3.7.3 | Citations: a per-document source library (book, article, website, report); a `citation` inline node; parsing with `@citation-js/core` (MIT) only | M |
| 3.7.4 | Bibliography block generated in APA 7, MLA 9, IEEE or Harvard by **our own formatters** (no citeproc, which is CPAL/AGPL); exported as formatted text | M |

### 3.8 Equations (S–M)

| Task | Detail | Size |
|---|---|---|
| 3.8.1 | `@tiptap/extension-mathematics` 3.33.1 with **KaTeX pinned to 0.18.x**; inline and block math; KaTeX fonts bundled for offline use | S |
| 3.8.2 | Equation editor popover with LaTeX input and a live preview (MathLive optional) | S |
| 3.8.3 | DOCX: equation exported as an image with the LaTeX as alt text (stated); print renders the KaTeX output. Native Word equations are a later task | S |

### 3.9 Review (L)

| Task | Detail | Size |
|---|---|---|
| 3.9.1 | Comments: a `comment` mark with a thread ID, threads stored in document content v2, side panel, resolve and reopen; DOCX comments export | L |
| 3.9.2 | Spelling: browser spell-check toggle (already exists) moved into the Review tab; language setting | S |
| 3.9.3 | Compare: choose two versions from history and show a read-only diff (`prosemirror-changeset`, MIT) | M |
| — | **Track changes deferred to 0.6** (needs Yjs snapshots). Not shown in 0.3 | — |

### 3.10 Text boxes (M)

| Task | Detail | Size |
|---|---|---|
| 3.10.1 | `textBox` node anchored to a paragraph (float left or right, width, border, fill); DOCX `Textbox` | M |
| — | Shapes inside documents arrive in 0.4 through diagram embeds. No freely positioned shapes (stated) | — |

### 3.11 Import and export (L)

| Task | Detail | Size |
|---|---|---|
| 3.11.1 | **Real-file corpus**: 15–20 real student and university `.docx` files and 5 `.odt` files under `tests/corpus/`, with permission to use; record what each loses | S |
| 3.11.2 | DOCX import: `mammoth` 1.13 (BSD-2) with a style map → HTML → DOMPurify → Tiptap; JSZip pass for page size, margins, orientation and header/footer text; import loss report shown to the user | L |
| 3.11.3 | DOCX export fidelity: everything from audit DOCU-4 and CODE-4; golden files; a manual Word and LibreOffice check recorded per release | M |
| 3.11.4 | ODT export and import with `odf-kit` (Apache-2.0) behind an `OdfAdapter`, exact version pinned and code reviewed; validated in LibreOffice; fallback is our own ODF writer if it fails | M |
| 3.11.5 | PDF: print preview (3.3.3); filename from the title; warning on browsers without margin boxes | S |

**Stated limitation:** imports keep content and structure, not exact Word layout.

### 3.12 View (S–M)

| Task | Detail | Size |
|---|---|---|
| 3.12.1 | Zoom (50–200%, fit width), saved per user | S |
| 3.12.2 | Navigation pane: heading outline, click to jump, collapsible | S |
| 3.12.3 | Show/hide ruler; paged view vs. web view toggle | S |

## Order and dependencies

```
0.2-A + 0.2-B ─┬─► 3.1 commands/ribbon ─┬─► 3.4 ─► 3.9 ─► 3.12
               │                        ├─► 3.8
               │                        └─► 3.7.2
               ├─► 3.2 tabs
               ├─► 3.6.1 schema v2 ─► 3.6 sections ─► 3.3 paged view
               │                   ├─► 3.7 footnotes/citations
               │                   └─► 3.9.1 comments
               ├─► 3.5.2 attachments ─► 3.5.3 ─► 3.10
               └─► 3.11.1 corpus ─► 3.11.2–3.11.4
```

Suggested sequence of milestones (each one ends in a commit with all tests passing):
1. 3.1 + 3.2
2. 3.6.1 + 3.5
3. 3.4 + 3.8 + 3.12
4. 3.7
5. 3.11
6. 3.6 + 3.3
7. 3.9 + 3.10

Pagination comes late on purpose. It depends on sections and is the highest-risk item, and the spike result may change its scope.

## Release 0.3 acceptance (in addition to 0.2's)

| Criterion | Automated test |
|---|---|
| Create, edit, save, reopen, in both modes | `e2e/document.spec.ts` |
| Every v0.1.0 fixture still opens identically | `fixtures.test.ts` |
| Multi-page view shows correct page count for the 30-page fixture (±1) | `e2e/paged.spec.ts` |
| DOCX export of every fixture matches its golden file; corpus files open in Word and LibreOffice (manual, recorded) | `docx.golden.test.ts` + `tests/acceptance/MANUAL-CHECKS.md` |
| DOCX import of every corpus file completes, with a loss report | `import.corpus.test.ts` |
| PDF print preview matches page size, margins, header/footer | `e2e/print.spec.ts` (Chromium), manual for Safari and Firefox |
| Offline: all of the above with the network disabled after first load | `e2e/offline.spec.ts` |
