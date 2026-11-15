# Module 04: Advanced Digital Notebook (PRD)

This document specifies the Digital Notebook (module M04, requirement prefix NBK): a structured academic notebook organised by subject, with sections, chapters and pages of rich-text notes, ink drawing, attachments, bookmarks, tags, search and PDF export. Nothing of the module exists yet; `packages/notebook` holds only a README. The design here deliberately reuses what the platform already has (the item model and kind registry, autosave, drafts, versions, trash, backup, content-addressed attachments, and Document Studio's Tiptap 3 extension set and print path) instead of building a second copy of any of them. It is the input to AE-P7.

**Status:** AE-P1 draft for owner approval (2026-11-15)

**Related documents (this folder):** [Roadmap](ADVANCED_EDITION_PRODUCT_ROADMAP.md) · [System architecture](SYSTEM_ARCHITECTURE.md) · [Database and sync](DATABASE_AND_SYNC_ARCHITECTURE.md) · [Dependencies and licences](DEPENDENCY_AND_LICENCE_PLAN.md) · [Module dependency map](MODULE_DEPENDENCY_MAP.md) · [Acceptance criteria](ACCEPTANCE_CRITERIA.md) · [Security and privacy](SECURITY_AND_PRIVACY_PLAN.md) · [Risk register](RISK_REGISTER.md) · [Release strategy](RELEASE_STRATEGY.md) · [M01 Document Studio](MODULE_01_DOCUMENT_STUDIO_PRD.md) · [M05 PDF Studio](MODULE_05_PDF_STUDIO_PRD.md) · [M08 File Manager](MODULE_08_FILE_MANAGER_PRD.md) · [M09 Dashboard](MODULE_09_DASHBOARD_PRD.md)

**Phase naming.** AE-P7 is the Advanced Edition phase that builds this module. The stub README `packages/notebook/README.md` says "Phase 2"; that is the old PRD numbering and is stale (brief §0.5).

**Evidence base.** Code read at HEAD edc2672 on branch `advanced/phase1-audit`. Nothing was run in AE-P1.

---

## Current state

Copied from the canonical planning brief §2 (M04).

**Absent.** `packages/notebook/README.md` is a 4-line stub saying "Not started". There is no notebook kind (packages/local-storage/src/types.ts:5-7). A 'notebook' kind in a backup is not imported: indexeddb.test.ts:271-284 asserts that such records are counted as `unsupported` (checked in AE-P1).

| ID | Requirement | Status |
|---|---|---|
| NBK-FR-001 | Multiple notebooks | Absent |
| NBK-FR-002 | Subject-wise organisation | Absent |
| NBK-FR-003 | Chapters and sections | Absent |
| NBK-FR-004 | Rich-text notes | Absent |
| NBK-FR-005 | Tables | Absent |
| NBK-FR-006 | Images | Absent |
| NBK-FR-007 | Equations | Absent |
| NBK-FR-008 | Highlighting | Absent |
| NBK-FR-009 | Drawing and annotations | Absent |
| NBK-FR-010 | Attachments | Absent |
| NBK-FR-011 | Bookmarks | Absent |
| NBK-FR-012 | Global search (notebook use of SVC-SEARCH) | Absent |
| NBK-FR-013 | Tags (SVC-ORG) | Absent |
| NBK-FR-014 | Favourites | Absent |
| NBK-FR-015 | Autosave | Absent |
| NBK-FR-016 | Offline access | Absent |
| NBK-FR-017 | PDF export | Absent |
| NBK-FR-018 | Subject/chapter navigation | Absent |

Reusable infrastructure that is already Done: the Tiptap 3 extension set and DOCX/print export (M01), autosave, drafts, version history, favourites and trash (platform), and KaTeX.

**Fact-check note (AE-P1):** "Done" above is the brief's wording. In M01 the DOCX export (DOC-FR-100) and PDF through the print dialog (DOC-FR-102) are **Partial**: DOCX was checked in Word for Mac for 2 of 16 samples only, and print headers, footers and page numbers need Chromium 131+. A notebook built on them inherits those limits.

**What earlier commits deliver for AE-P7.** No module code. The reusable parts listed above come from v0.2 Phase 3 (2669868, storage hardening), v0.2 Phase 4 (fe3275a, the Document Studio extension set) and v0.2 Phase 7 (edc2672, which proved that a third kind can be added through one migration, DB v3).

---

## 1. Product objectives

1. Give each student one place per subject for course notes, organised as notebooks → sections → chapters → pages, that works offline and needs no account.
2. Reuse the platform: a notebook is an ordinary workspace item (SVC-ITEM) with autosave, drafts, versions, trash and backup; pages use the document rich-text vocabulary; pictures and attached files are SVC-BLOB attachments; subjects and tags are SVC-ORG; search is SVC-SEARCH. No second editor, store, search engine or folder system.
3. Support handwriting and sketching on top of typed notes (an ink layer) without changing the rich-text vocabulary.
4. Make notes portable: PDF export of a page, chapter, section or notebook; copy a page into a document (INT-07).
5. Keep existing data safe: adding the notebook kind is one append-only migration behind a safety copy; older builds fail closed and never damage a notebook.

Out of scope: live co-editing (M07, D-16), handwriting recognition, OCR (M05 evaluates OCR only), AI features, paid services.

## 2. User stories

| # | As a … | I want to … | So that … | Requirements |
|---|---|---|---|---|
| US-NBK-01 | student | keep a separate notebook for each subject, inside that subject's folder | my notes for Physics never mix with History | NBK-FR-001, -002 |
| US-NBK-02 | student | split a notebook into sections and chapters that follow my syllabus, and reorder them | I find a lecture's notes quickly | NBK-FR-003, -018 |
| US-NBK-03 | student | type formatted notes with headings, lists, tables, pictures, highlights and equations | my notes look like the lecture | NBK-FR-004…008 |
| US-NBK-04 | student with a tablet and pen | draw diagrams and annotate typed notes with a stylus or finger | I can capture what is on the board | NBK-FR-009 |
| US-NBK-05 | student | attach the lecture PDF and the worksheet to the page they belong to, and open them | everything for a lesson is together | NBK-FR-010 (opens in M05) |
| US-NBK-06 | student revising | bookmark key pages and jump to them, and tag pages "exam" | revision is fast | NBK-FR-011, -013 |
| US-NBK-07 | student | search all my notebooks (and everything else) for "photosynthesis" | I find every place I wrote about it | NBK-FR-012 (SVC-SEARCH) |
| US-NBK-08 | student | export a chapter to PDF and print it | I can revise on paper or hand it in | NBK-FR-017 |
| US-NBK-09 | student | copy a page of notes into an essay document | I don't retype it | NBK-FR-022 (INT-07) |
| US-NBK-10 | student | trust that a crash, closed tab or full disk never loses a page | I keep using it | NBK-FR-015, -019, NBK-NFR-002 |
| US-NBK-11 | student | mark notebooks as favourites and see them on the dashboard | my active notebooks are one click away | NBK-FR-014 |

## 3. Functional requirements

All requirements are **Absent** today (no module code). The "Reuses" column names the existing, already-Done infrastructure each one builds on, with evidence; those parts are Done for other kinds, not for notebooks. NBK-FR-019 onwards are additions in the free numbers (brief §4.2: M04 runs 001 onwards).

| ID | Requirement | Current status | Reuses (evidence) | Notes |
|---|---|---|---|---|
| NBK-FR-001 | Create, rename, duplicate, trash, restore and purge any number of notebooks | Absent | SVC-ITEM: `StorageAdapter.create/duplicate/trash/restore/purge` (packages/local-storage/src/types.ts:162-209); kind registry (indexeddb.ts:204-208) | Needs the `notebook` kind (§6) |
| NBK-FR-002 | Subject-wise organisation: each notebook lives in a subject; subjects list their notebooks | Absent | SVC-ORG (ADR-0016, proposed: a subject is a folder with `role: 'subject'`) | Depends on D-11 and the AE-P3 `folders` store. If D-11 chooses tags only, subjects become tags; this PRD does not decide |
| NBK-FR-003 | Sections, chapters and pages inside a notebook: add, rename, reorder (drag and keyboard), move between parents, delete with undo | Absent | — | Tree in content (ADR-0025) |
| NBK-FR-004 | Rich-text notes on each page | Absent | Document vocabulary: `documentExtensions()` (packages/document-studio/src/extensions/index.ts:26-74), publicly exported (document-studio/src/index.ts) | Reuse path decided by D-10 (§7.2) |
| NBK-FR-005 | Tables | Absent | TableKit in the same extension set (extensions/index.ts:42) | — |
| NBK-FR-006 | Images: insert, paste, drop, resize, caption | Absent | FigureImage (extensions/index.ts:44; document-studio src/image.ts:1-2: 15 MB cap, 1600 px downscale) | Document pictures are inline data URLs today (TD-2). Notebook pictures should be SVC-BLOB attachments; that depends on D-08 (DOCUMENT_SCHEMA 4) or a notebook-specific image node. This PRD does not decide; see R-063 |
| NBK-FR-007 | Equations, inline and block | Absent | Equations extension, KaTeX with trust off (document-studio extensions/equation.ts:13, :28-35) | — |
| NBK-FR-008 | Highlighting in several colours | Absent | Highlight multicolour (extensions/index.ts:40); colour panel UI (document-studio ui/ribbon/format/ColorPanel.tsx) | — |
| NBK-FR-009 | Drawing and annotations: freehand ink (pen, highlighter, eraser, colours, widths) as a layer over each page, with pen pressure where the device reports it; undo; selection and move of strokes | Absent | — | New: per-page ink layer, vector strokes as JSON (ADR-0025). Candidate: `perfect-freehand` (§8) |
| NBK-FR-010 | Attachments: attach any file to a page; list, open, download, remove; PDFs open in PDF Studio | Absent | SVC-BLOB `putAttachment`/`getAttachment` with SHA-256 dedup (indexeddb.ts:1010-1045; ADR 0008) | Needs the size cap and MIME sniffing that ADR-0017 adds (SEC). Opening a PDF uses SVC-REF `link` to an M05 item or a read-only view (§7.4) |
| NBK-FR-011 | Bookmarks: bookmark a page or a heading inside a page; bookmark list; jump to bookmark; bookmarks survive moving the page | Absent | — | Content-level anchors keyed by stable page id and node id (ADR-0025) |
| NBK-FR-012 | Global search: notebook titles, page titles, page text and attachment names appear in SVC-SEARCH results, with a jump to the page | Absent | SVC-SEARCH is Absent (title filter only, apps/web/src/pages/ItemListPage.tsx:34-35) | AE-P7 builds the first SVC-SEARCH indexer (brief §9); M09 owns the global entry point (AE-P12). No notebook-private search engine |
| NBK-FR-013 | Tags on notebooks (and, if D-11 extends it, on pages) | Absent | SVC-ORG tags (ADR-0016, proposed) | Item-level tags come from SVC-ORG. Page-level tags would be content data; raise under D-11 if wanted |
| NBK-FR-014 | Favourite notebooks | Absent | `setFavorite` metadata-only change (types.ts:176; indexeddb.ts:808-810, :826-841); Dashboard favourites (apps/web/src/pages/Dashboard.tsx:172-186) | Works as soon as the kind exists |
| NBK-FR-015 | Autosave with retries, conflict detection and drafts | Absent | `useEditableItem` (apps/web/src/lib/storage.ts:714); 600 ms debounce, retries 1/3/10 s (storage.ts:689-692); drafts (indexeddb.ts:1055-1080); ADR 0003, 0004 | See NBK-NFR-001 on whole-notebook saves |
| NBK-FR-016 | Offline access: create, edit, draw and export notebooks with no network after the first visit | Absent | PWA precache (apps/web/vite.config.ts:22-43); ADR 0001 | Notebook chunk must be precached; e2e offline test |
| NBK-FR-017 | PDF export of a page, chapter, section or whole notebook, with ink drawn as vectors and equations rendered | Absent | M01 print path: `buildPrintHtml`, `printDocument` (document-studio export/print.ts:173, :202; exported from index.ts) | Per ADR-0025: M01 print path, or the M05 engine if one is chosen (ADR-0023). Print-dialog limits apply (headers/footers need Chromium 131+, printSupport.ts:11) |
| NBK-FR-018 | Navigation between subjects, notebooks, sections, chapters and pages: a tree panel, breadcrumbs, previous/next page, keyboard shortcuts, and reopening at the last page | Absent | Open tabs (apps/web/src/lib/openTabs.ts:15, 12 tabs) | Last-open page per notebook is a per-device preference, not content |
| NBK-FR-019 (new) | Version history of a notebook: list, restore (whole notebook); a page restored from an older version as a copy (beyond the brief; platform parity) | Absent | Version history (indexeddb.ts:778-806, :876-911; ADR 0005; 50 per item, 10-minute auto snapshots) | Restoring a single page from a version is notebook-specific UI over the same versions |
| NBK-FR-020 (new) | Backup and restore include notebooks, their attachments and ink (beyond the brief; platform parity) | Absent | SVC-BACKUP (backup.ts; ADR 0007) | Needs `notebook` in `MAX_CONTENT_SCHEMA_BY_KIND` (backup.ts:14). Large attachments push towards backup format 3 (ADR-0017, R-024) |
| NBK-FR-021 (new) | Notebook templates: blank, lecture notes, lab notebook, revision notes (beyond the brief) | Absent | Template mechanism in the module registry (`ModuleDef.templates`, apps/web/src/modules.tsx:38-52) | Templates create schema-1 content only |
| NBK-FR-022 (new) | Copy a page (or selection) into a new or existing document, and insert notebook content into a document (INT-07, beyond the M04 bullet list) | Absent | Shared rich-text vocabulary makes this a JSON copy | INT-07: SVC-REF (`embed-copy` or `link`) and a proposed NotebookHost (SVC-HOST). Owned by M01 as consumer (MODULE_DEPENDENCY_MAP.md) |

## 4. Non-functional requirements

All proposed; performance numbers are **proposed targets, to be measured** with the AE-P3 harness on the reference hardware (D-29).

| ID | Requirement | Current status |
|---|---|---|
| NBK-NFR-001 | Performance: a notebook of 300 pages (20 images, 50 pages with ink) opens to the last page in ≤ 1.5 s; switching pages ≤ 150 ms; keystroke latency within PERF-004; autosave within PERF-005. Saving must not serialise the whole notebook on every keystroke if that breaks PERF-005 (see §6.3) | Absent |
| NBK-NFR-002 | Data safety: the DB migration that adds the kind runs only after a verified safety copy (indexeddb.ts:511-549); an older build fails closed (VersionError) and changes nothing; a notebook from a newer build opens read-only | Absent (mechanism Done for 3 kinds) |
| NBK-NFR-003 | Privacy: no request to another origin while creating, editing, drawing, attaching, searching or exporting | Absent (extend e2e/privacy.spec.ts) |
| NBK-NFR-004 | Offline: as NBK-FR-016, verified by e2e | Absent |
| NBK-NFR-005 | Accessibility: WCAG 2.2 AA (A11Y-001); the tree, page list and toolbar are keyboard operable; ink has a keyboard-accessible alternative (typed note) and strokes have an accessible summary ("drawing, 12 strokes") | Absent |
| NBK-NFR-006 | Input limits: pictures as in M01 (15 MB); attachments capped per file (value set in ADR-0017); total notebook content size capped with a clear message | Absent |
| NBK-NFR-007 | Package boundary: `@dcos/notebook` imports only what tests/integration/boundaries.test.ts allows after D-10 | Absent. Note: boundaries.test.ts:28-29 fails as soon as a package gains a `src/` folder without an `ALLOWED` entry, so this is enforced automatically |
| NBK-NFR-008 | Identifiers: sections, chapters, pages, bookmarks and strokes use full random UUIDs, generated as in `packages/local-storage/src/ids.ts` (whose fallback uses `getRandomValues`). Do not copy presentation-studio create.ts:15-19, whose fallback is not a UUID (PRS-NFR-011 is Partial), and do not use truncated ids like the diagram ids (R-015) | Absent |
| NBK-NFR-009 | Browser support per PLT-001…003; touch and pen input on mobile Chromium and, when built, Android (PLT-007) | Absent |

## 5. UI/UX requirements

| ID | Requirement | Current status |
|---|---|---|
| NBK-UX-001 | Three-pane layout on desktop: subject/notebook tree, section-chapter-page tree, page; collapses to one pane with a back button at phone width; no horizontal page scroll | Absent |
| NBK-UX-002 | The page editor uses the same ribbon groups and keyboard shortcuts as Document Studio for the same actions, so a user who knows one knows the other; layout-only controls (page setup, section breaks, columns, table of contents) are not shown | Absent |
| NBK-UX-003 | Ink mode is an explicit toggle; in ink mode a finger or pen draws and two fingers scroll; palm rejection where the browser reports pointer type `pen` | Absent |
| NBK-UX-004 | Breadcrumb "Subject › Notebook › Section › Chapter › Page" always visible; previous/next page controls | Absent |
| NBK-UX-005 | Empty states for a new subject, notebook, section and page that say what to do next | Absent |
| NBK-UX-006 | Uses SVC-UI tokens and components (AE-P3, ADR-0024): Tabs, Tooltip, Drawer with Escape and focus trap; light and dark themes | Absent |
| NBK-UX-007 | No control is shown that does nothing (same rule as PRS-FR-063); ink controls are hidden on devices with no pointer input only if detection is reliable, otherwise disabled with the reason | Absent |

## 6. Data model

All of this is **Proposed, needs approval** (ADR-0015 for the kind, ADR-0016 for subjects and tags, ADR-0017 for attachments, ADR-0025 for the content model).

### 6.1 The kind

- `ItemKind` gains `'notebook'` (append-only; packages/local-storage/src/types.ts:5-7), with `ITEM_KINDS` and the `STORES` registry entry `{ items: 'notebooks', versions: 'notebook_versions' }` (indexeddb.ts:204-208).
- One append-only migration creates the two stores (DB v5 under ADR-0015, after DB v4 in AE-P3; ADR-0015 also evaluates batching notebook and pdf into one migration). `SCHEMA_VERSION` is bumped (indexeddb.ts:46).
- `MAX_CONTENT_SCHEMA_BY_KIND.notebook = 1` (backup.ts:14).
- scripts/upgrade-test.mjs:64-65 hard-codes the item and version stores and must be updated in the same change.
- indexeddb.test.ts:271-284 uses `'notebook'` as its example of an unknown kind; that test must switch to another unknown kind name, deliberately.
- Module entry in apps/web/src/modules.tsx (`route: 'notebooks'`, frozen once shipped).
- Item metadata from DB v4 (AE-P3): `folderId` (the subject folder), `tagIds`, `lastOpenedAt`, `metaUpdatedAt`.

### 6.2 Content (NOTEBOOK_SCHEMA 1)

```ts
interface NotebookContent {
  schemaVersion: 1;
  /** Highest document-vocabulary schema used by any page; lets an older build refuse safely. */
  pageVocabularySchema: number;            // e.g. 3 today (DOCUMENT_SCHEMA, document-studio migrate.ts:13)
  sections: NotebookSection[];             // ordered
  bookmarks: NotebookBookmark[];
  settings: { pageStyle: 'plain' | 'lined' | 'grid' | 'dotted'; defaultPen?: InkPen };
}

interface NotebookSection { id: string; title: string; colour?: string; chapters: NotebookChapter[] }
interface NotebookChapter { id: string; title: string; pages: NotebookPage[] }

interface NotebookPage {
  id: string;                              // UUID; stable across moves (bookmarks, search hits, references)
  title: string;
  createdAt: string;
  updatedAt: string;                       // page-level, for "recently edited pages" and search ranking
  doc: JSONContent;                        // Tiptap JSON using the document vocabulary; no new marks (ADR-0025)
  ink?: InkLayer;                          // optional
  attachments: PageAttachment[];
}

interface InkLayer { width: number; strokes: InkStroke[] }   // page-relative coordinates
interface InkStroke {
  id: string;
  tool: 'pen' | 'highlighter';
  colour: string;                          // hex
  size: number;
  points: Array<[x: number, y: number, pressure?: number]>;  // raw input; outline computed at render time
}

interface PageAttachment {
  id: string;
  attachmentId: string;                    // SVC-BLOB id, as its own string value so clean-up finds it
  fileName: string;
  mimeType: string;                        // sniffed, not trusted from the caller (ADR-0017)
  sizeBytes: number;
  ref?: ItemRef;                           // SVC-REF link when the file is also a PDF Studio item
}

interface NotebookBookmark { id: string; pageId: string; nodeId?: string; label: string; createdAt: string }
```

- Attachment references follow the existing rule that content holds the id as its own string value, which the clean-up walk finds (indexeddb.ts:114-118, :1105-1124; presentation-studio hosts.ts:60-63 states the same rule).
- `doc` validation reuses document-studio's `validateDoc` / `prepareDocument` (exported from document-studio/src/index.ts) or their extracted equivalents (D-10). A page whose `doc` needs a newer document schema than this build supports opens read-only, like a document does today.

### 6.3 Open design point inside ADR-0025: one record or many

ADR-0025 proposes one notebook item holding the whole tree. Consequences to measure in AE-P7 before the ADR is accepted:

- Every autosave writes the whole notebook; every version snapshot copies it (50 per item). Version compaction moves only inline `data:` strings over 16 KB out of versions (local-storage blobs.ts:12, :78), not text or ink.
- Optimistic concurrency is per item: two tabs editing different pages of one notebook conflict (ADR 0003 resolves by "keep my edits as a copy", which would copy the whole notebook).

Alternative to record in the ADR: pages as separate records in a `notebook_pages` store keyed by notebook id, with the notebook item holding only the tree. This makes versions, conflicts and backup per page, at the cost of a second store and changes to SVC-BACKUP, trash and purge. This PRD does not choose; it requires NBK-NFR-001 and NBK-NFR-002 to hold either way.

## 7. Technical architecture

### 7.1 Package and app wiring

- New workspace package `@dcos/notebook` (`packages/notebook/`, added to package.json workspaces, which today have six entries, apps/web and five packages, package.json:7-14).
- Editor component `NotebookEditor` loaded lazily through `ModuleDef.loadEditor` (apps/web/src/modules.tsx:38-52), receiving `initialContent`, `onChange` and hosts through `EditorProps` (modules.tsx:10-28), like the other three studios. Storage, attachments and diagrams come through hosts (SVC-HOST); the package does not import local-storage.
- Folders mirror the existing studios: `tree/` (sections, chapters, pages model and panel), `page/` (rich-text page editor), `ink/` (stroke capture, rendering, eraser hit tests), `attachments/`, `bookmarks/`, `export/` (lazy), `search/` (text extractor), `compat.ts`, `migrate.ts`, `safety.ts`.

### 7.2 Rich-text reuse (D-10)

| Option | What it means | Effect on boundaries.test.ts |
|---|---|---|
| (a) Extract `@dcos/rich-text` (proposed in ADR-0025) | Move the extension set, its vocabulary (compat.ts), `validateDoc` and print helpers into a new package, without behaviour change; document-studio, notebook (and later presentation-studio's own set, editor/textExtensions.ts) import it | New entries: `'rich-text': ['@dcos/ui']`; document-studio and notebook allowed `@dcos/rich-text`. Moving code out of document-studio needs its full test suite and the DOCX/ODT goldens to pass unchanged |
| (b) Notebook depends on document-studio | Import `documentExtensions` (already public, document-studio/src/index.ts) | `notebook: ['@dcos/ui', '@dcos/document-studio']`. Pulls the whole document editor package into the notebook's dependency graph |

Either way, the notebook configures the shared set without page breaks, section breaks or the table of contents in its UI, but keeps their schema loaded so that content copied between documents and notebooks round-trips without loss (INT-07).

### 7.3 Ink

Pointer Events capture with `pointerType` and `pressure`; strokes stored as raw points (§6.2); outlines computed at render time (candidate `perfect-freehand`) and drawn as SVG paths over the page, so the PDF export can use the same SVG. Erasing removes whole strokes (stroke eraser) in v1; a partial eraser is a later option.

### 7.4 Attachments and PDFs

Files go through SVC-BLOB (`putAttachment`) with the ADR-0017 size cap and MIME sniffing. A PDF attachment opens either (i) in M05 as a linked PDF item (SVC-REF `link`, created on first open, sharing the same attachment bytes, so no duplicate storage), or (ii) in a read-only M05 viewer component. Which one is decided with M05 in AE-P8; until M05 exists, attachments download only. Native platforms need the save/share adapters in SVC-PLAT (TD-28).

### 7.5 Search

AE-P7 builds the first SVC-SEARCH indexer as a shared service in the proposed `packages/search` (SYSTEM_ARCHITECTURE §6.2; contract DSH-IF-001 in MODULE_09 §9.1), not inside this package. The notebook contributes a pure extractor (NBK-IF-002) returning per-page text so a hit can open the right page.

### 7.6 Export

PDF through the M01 print path in v1 (print dialog; limits as DOC-FR-102), building print HTML from page JSON plus ink SVG. If ADR-0023 brings a PDF engine, a generated PDF can follow. DOCX export of a page or chapter can reuse M01's DOCX writer through INT-07 (copy to a document, then export), so the notebook does not need its own DOCX writer.

## 8. Dependencies

### 8.1 Modules and services

| Depends on | Why | Phase |
|---|---|---|
| AE-P3 | DB v4 metadata (`folderId`, `tagIds`, `lastOpenedAt`), `folders`/`tags` stores, SVC-ORG and SVC-SEARCH interfaces, SVC-REF interface, design tokens | Before AE-P7 |
| M01 Document Studio | Rich-text vocabulary, validation, print path (D-10) | AE-P4 changes to the vocabulary (DOCUMENT_SCHEMA 4 under D-08/D-18) flow into notebooks |
| SVC-ITEM, SVC-STORE, SVC-BLOB, SVC-BACKUP, SVC-HOST, SVC-UI | Platform | Done / Partial |
| SVC-ORG | Subjects (NBK-FR-002), tags (NBK-FR-013) | AE-P3 |
| SVC-SEARCH | NBK-FR-012 | First indexer in AE-P7 |
| M05 PDF Studio | Opening attached PDFs | AE-P8 |

| Used by | Why | Contract |
|---|---|---|
| M01 | Notebook content in documents | INT-07 |
| M08 File Manager | Listing notebooks in subject folders | INT-05 |
| M09 Dashboard | Recent notebooks, subject overview, search | INT-06, INT-09; DSH-FR-013, DSH-FR-023 |
| M06 Classroom Hub | Notebook pages submitted as work (as a document copy or snapshot) | INT-03 via SVC-REF `snapshot` |

### 8.2 Libraries

Installed and reused (versions from package-lock.json): @tiptap/* 3.33.1, katex 0.18.11, fflate 0.8.3, idb 8.0.4 (through local-storage only).

Candidates (no versions; licence, maintenance and security to verify in DEPENDENCY_AND_LICENCE_PLAN.md):

| Need | Candidate | Licence (reported, to verify) |
|---|---|---|
| Ink stroke outlines | `perfect-freehand` | MIT, to verify |
| Search index | MiniSearch or FlexSearch (shared SVC-SEARCH decision, not notebook-specific) | MIT / Apache-2.0, to verify |
| Tree drag and drop | Original code over Pointer Events (preferred), or a small MIT library if justified | — |

## 9. API/interface contracts

M04 defines no private version of any shared service. References use SVC-REF's `ItemRef` (ADR-0018); attachments use SVC-BLOB; permissions (only relevant once shared or submitted) use SVC-PERM.

| ID | Contract | Status |
|---|---|---|
| NBK-IF-001 | Editor props: the notebook editor accepts the shared `EditorProps` (apps/web/src/modules.tsx:10-28) plus a `NotebookAttachmentHost` | Absent |
| NBK-IF-002 | Search extractor for SVC-SEARCH, wrapped by the app as a DSH-IF-001 `TextExtractor` (locator = page id) | Absent |
| NBK-IF-003 | NotebookHost for INT-07 (provider side), so M01 can pick a notebook page without importing the notebook package | Absent |
| NBK-IF-004 | Schema and safety functions, matching the shape the other studios export | Absent |

```ts
// NBK-IF-001 — attachments through SVC-BLOB, same shape as presentation-studio PresentationImageHost (hosts.ts:64-69)
interface NotebookAttachmentHost {
  putAttachment(data: Blob, fileName: string): Promise<{ id: string; mimeType: string; sizeBytes: number }>; // host sniffs MIME
  loadAttachment(id: string): Promise<Blob | undefined>;
  open?(attachment: PageAttachment): Promise<void>;       // M05 when available; download otherwise
}

// NBK-IF-002 — pure, synchronous, no editor import
function extractNotebookText(content: NotebookContent): {
  body: string;
  parts: Array<{ pageId: string; path: string /* "Section › Chapter › Page" */; text: string }>;
};

// NBK-IF-003 — M04 provides the INT-07 NotebookHost owned by MODULE_DEPENDENCY_MAP §4.2 (pickPage, open,
// optional sourceStatus); M01 consumes it through SVC-HOST and returns document-vocabulary JSON plus provenance
interface NotebookHost {
  pickPage(): Promise<{ ref: ItemRef; pageId: string; doc: JSONContent; title: string } | null>;
  open(ref: ItemRef): void;
  sourceStatus?(ref: ItemRef, copiedAtVersion: number): Promise<'same' | 'newer' | 'missing'>;
}

// NBK-IF-004
const NOTEBOOK_SCHEMA = 1;
function notebookSchemaFor(content: unknown): number;          // lowest schema the content needs
function migrateNotebook(raw: unknown): { content: NotebookContent; from: number };
function prepareNotebook(raw: unknown): { content: NotebookContent | null; readOnly: boolean; problem?: string };
```

## 10. Acceptance criteria

This table is the canonical wording of the module's criteria; [ACCEPTANCE_CRITERIA.md](ACCEPTANCE_CRITERIA.md) §4 only summarises them and owns the cross-cutting criteria (AC-SYS, AC-SEC, AC-PERF, AC-INT and others) (ACCEPTANCE_CRITERIA §1.2). A change to a criterion here is made in ACCEPTANCE_CRITERIA §4 in the same edit. Phase for every row: AE-P7. No row needs "re-verify", because nothing is Done for notebooks; platform parts they rely on are re-verified through these criteria.

| AC | Verifies | Criterion | Evidence type |
|---|---|---|---|
| AC-NBK-001 | NBK-FR-001 | Notebooks can be created, renamed, duplicated, trashed, restored and purged; each survives reload | unit + e2e (Chromium, Firefox, WebKit) |
| AC-NBK-002 | NBK-FR-002 | A notebook created inside a subject appears under that subject in the notebook tree, File Manager and Dashboard subject overview, and moving it to another subject is undoable | integration + e2e |
| AC-NBK-003 | NBK-FR-003 | Sections, chapters and pages can be added, renamed, reordered by drag and by keyboard, and moved between parents; order survives reload | unit + e2e |
| AC-NBK-004 | NBK-FR-004 | Every formatting action available in Document Studio's Home tab works on a notebook page and the result is identical JSON to the same action in a document | unit + e2e |
| AC-NBK-005 | NBK-FR-005 | Tables insert and edit as in documents | unit |
| AC-NBK-006 | NBK-FR-006 | Pictures insert by file, paste and drop; over-limit files are refused with a message; stored as attachments if D-08 (or the notebook alternative) is approved | unit + e2e |
| AC-NBK-007 | NBK-FR-007 | Inline and block equations render with KaTeX (trust off) and print in the PDF | unit + e2e |
| AC-NBK-008 | NBK-FR-008 | Highlights in each colour save, reload and print | unit |
| AC-NBK-009 | NBK-FR-009 | Pen, highlighter and eraser strokes are captured with mouse, touch (mobile Chromium) and pen where available; undo works; strokes survive reload and appear in PDF export | unit + e2e + manual (pen device, dated) |
| AC-NBK-010 | NBK-FR-010 | Files attach to a page, dedupe by content (same file twice = one attachment), open or download, and are removed by clean-up only after the page no longer refers to them | unit + integration + e2e |
| AC-NBK-011 | NBK-FR-011 | Bookmarks to a page and to a heading jump correctly after the page is moved to another chapter | unit + e2e |
| AC-NBK-012 | NBK-FR-012 | Searching a word that appears only in a page body finds that page and opens it at the hit; trashed notebooks are excluded by default (D-17) | integration + e2e |
| AC-NBK-013 | NBK-FR-013 | Tags added to a notebook are listed, filterable and searchable through SVC-ORG | integration + e2e |
| AC-NBK-014 | NBK-FR-014 | Favouriting a notebook does not change its version or `updatedAt`, and it appears in Favourites and on the Dashboard | unit + e2e |
| AC-NBK-015 | NBK-FR-015 | Edits save within PERF-005; a forced save failure shows the status and retries; a conflict from another tab offers both resolutions; an emergency draft restores after a killed tab | unit + e2e |
| AC-NBK-016 | NBK-FR-016 | After the first visit, a notebook can be opened, edited, drawn on and exported with the network offline | e2e (Chromium; others where supported) |
| AC-NBK-017 | NBK-FR-017 | A page, a chapter, a section and a whole notebook export to PDF with text, pictures, equations and ink; the PDF is checked in an independent PDF reader (dated) | e2e + external application check |
| AC-NBK-018 | NBK-FR-018 | From any page, the user reaches any other page by tree, breadcrumbs and previous/next using only the keyboard; reopening a notebook returns to the last page | e2e |
| AC-NBK-019 | NBK-FR-019 | Restoring an older version restores the notebook; restoring one page from a version creates a copy of that page | unit + e2e |
| AC-NBK-020 | NBK-FR-020 | A backup with notebooks, ink and attachments restores into an empty profile byte-identical in content and attachments; restoring never overwrites | integration + e2e |
| AC-NBK-021 | NBK-FR-021 | Each template creates schema-1 content that opens editable | unit |
| AC-NBK-022 | NBK-FR-022 | A page copied into a document keeps all text formatting, tables, pictures and equations, and the document exports to DOCX without new loss notes | integration + e2e |
| AC-NBK-501 | NBK-NFR-001 | Notebook open, page switch, keystroke and autosave measured on the reference fixture and within the approved targets | measurement |
| AC-NBK-502 | NBK-NFR-002 | scripts/upgrade-test.mjs upgrades a v3/v4 database with data to the notebook version behind a safety copy, and the previous build fails closed on the upgraded database | upgrade test (real browser) |
| AC-NBK-503 | NBK-NFR-003 | e2e/privacy.spec.ts covers notebooks with zero cross-origin requests | e2e (3 browsers) |
| AC-NBK-504 | NBK-NFR-004 | Same check as AC-NBK-016, run as part of e2e/storage.chromium-only.spec.ts | e2e (Chromium) |
| AC-NBK-505 | NBK-NFR-005 | axe reports no serious or critical violation (if D-25 approves); keyboard-only script completes create → write → bookmark → export | e2e + manual |
| AC-NBK-506 | NBK-NFR-006 | Over-limit attachments and pictures are refused before storage, with a message | unit |
| AC-NBK-507 | NBK-NFR-007 | boundaries.test.ts passes with the `ALLOWED` entry chosen under D-10 | unit |
| AC-NBK-508 | NBK-NFR-008 | All new ids are UUIDs (test over a generated notebook) | unit |
| AC-NBK-509 | NBK-NFR-009 | All notebook e2e specs pass in CI on Chromium, Firefox and WebKit; ink specs pass on mobile Chromium | e2e (CI) |
| AC-NBK-701 | NBK-UX-001 | Layout works at 375 px and 1280 px with no horizontal page scroll | e2e (mobile Chromium + desktop) |
| AC-NBK-702 | NBK-UX-002 | A test lists the page editor's ribbon groups and shortcuts and compares them with Document Studio's for the same actions; page-layout controls (page setup, section breaks, columns, table of contents) are absent | unit + e2e |
| AC-NBK-703 | NBK-UX-003 | In ink mode one finger draws and two fingers scroll (mobile Chromium) | e2e + manual (device, dated) |
| AC-NBK-704 | NBK-UX-004 | The breadcrumb shows the full path on every page and each part navigates; previous/next move through pages across chapter and section boundaries | e2e |
| AC-NBK-705 | NBK-UX-005 | A new subject, notebook, section and page each show an empty state that names the next action | e2e |
| AC-NBK-706 | NBK-UX-006 | The notebook screens use SVC-UI components and tokens (no local copies), Drawer closes on Escape and traps focus, and a dated check covers light and dark themes | unit + e2e + manual (dated) |
| AC-NBK-707 | NBK-UX-007 | A test enumerates every notebook control and proves each either acts or is disabled with a reason (as AC-PRS-063) | unit + e2e |
| AC-NBK-901 | NBK-IF-001 | The notebook editor mounts through the shared `EditorProps` like the other studios, and stores and loads attachments only through `NotebookAttachmentHost` (SVC-BLOB) | unit + integration |
| AC-NBK-902 | NBK-IF-002 | The extractor returns every page's text with its path and does not import the editor | unit |
| AC-NBK-903 | NBK-IF-003 | M01 inserts a notebook page through NotebookHost without importing `@dcos/notebook` (boundary test) | integration |
| AC-NBK-904 | NBK-IF-004 | A notebook saved with an unknown newer schema, or a page needing a newer document schema, opens read-only and offers the original data for download | unit + e2e |

## 11. Test strategy

| Kind | Plan |
|---|---|
| Unit | Tree model (add, move, delete, reorder, undo); content validation and `notebookSchemaFor`; ink capture, simplification and hit testing; bookmark resolution after moves; extractor; attachment reference rules |
| Integration | Kind registry: notebook in every operation of local-storage (extend kinds.test.ts `describe.each`); backup round trip with attachments; SVC-SEARCH indexing; INT-07 with document-studio; boundaries.test.ts |
| Browser (Playwright) | Chromium, Firefox, WebKit; mobile Chromium for touch and ink; drag reordering in the tree |
| End-to-end | Subject → notebook → chapter → page → text, picture, equation, ink, attachment → bookmark → search → PDF export → backup → restore into an empty profile |
| Persistence | Reload, browser relaunch (Chromium), version restore, trash/restore |
| Offline | Extend e2e/storage.chromium-only.spec.ts with a notebook |
| Import/export | PDF export opened in an independent reader (dated); copy to document then DOCX export (INT-07) |
| Regression | Golden notebook JSON fixture per schema version; DOCX goldens unchanged if `@dcos/rich-text` is extracted (D-10) |
| Upgrade | scripts/upgrade-test.mjs extended (store lists at :64-65) |
| Accessibility | Keyboard-only scripts; axe (D-25); screen-reader pass before AE-P15 |
| Performance | 300-page fixture with ink and pictures; measured before acceptance of the ADR-0025 storage shape (§6.3) |

## 12. Known risks

From the register (brief §10):

| Risk | Why it matters here |
|---|---|
| R-021 | Scope size: Notebook is one of several new modules on one maintainer machine |
| R-022 | Package boundary versus rich-text reuse (D-10) |
| R-003 | The migration that adds the notebook kind reaches every Pages visitor at once; cached builds fail closed |
| R-024 | Attachments (lecture PDFs) can exceed backup format 2 limits |
| R-036 | New screens inherit the design-system accessibility debts unless AE-P3 lands first |
| R-006 | Building the notebook UI before packages/ui is extended multiplies inconsistencies |
| R-034 | No baseline to compare notebook performance against until AE-P3's harness exists |

Module-specific risks. RISK_REGISTER.md §3.7 and §5 have registered these with the numbers proposed here (R-063 to R-066).

| Proposed ID | Risk | L | I | Mitigation |
|---|---|---|---|---|
| R-063 | Notebook pictures inherit TD-2 (inline data URLs) if D-08 is not approved, bloating every save, version and backup | H | M | Decide D-08 before AE-P7, or give notebooks an attachment-backed image node within the shared vocabulary |
| R-064 | One-record notebooks (ADR-0025) make autosave, versions and conflicts scale with notebook size | M | H | Measure early (§6.3); keep the per-page store alternative open in the ADR |
| R-065 | Pen and touch behaviour differs across browsers and webviews (pressure, palm rejection, scrolling); automated tests cover mobile Chromium only | H | M | Manual dated device checks; fall back to mouse/touch drawing without pressure |
| R-066 | Changes to the shared rich-text vocabulary in AE-P4 (DOCUMENT_SCHEMA 4) silently change notebook pages | M | M | `pageVocabularySchema` field and shared golden tests across both consumers |
