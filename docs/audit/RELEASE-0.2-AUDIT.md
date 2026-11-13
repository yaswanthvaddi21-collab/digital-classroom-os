# Release 0.2 — Foundation audit

**Subject:** Digital Classroom OS v0.1.0 (commit `20d3f4d`, tag `v0.1.0-baseline`)
**Date:** 2026-11-13
**Method:** I ran all existing checks myself. Eight independent auditors then covered architecture, functionality, storage, the document engine, the diagram engine, tests, dependencies and code quality. Each auditor's findings went to a separate verifier, who re-checked every claim against the code, the installed library source, npm metadata or the vendor's site, and tried to refute it.
**Result:** 147 findings (124 confirmed, 22 corrected in detail, 1 unverifiable, 0 refuted), plus 29 more the verifiers found. Every finding, with file:line evidence, is in [FINDINGS.md](FINDINGS.md).
**Status:** Read-only audit. No application code was changed. Nothing below has been done yet; the plan waits for your approval.

---

## Contents

1. [Architecture report](#1-architecture-report)
2. [Functionality inventory](#2-functionality-inventory)
3. [Database and storage report](#3-database-and-storage-report)
4. [Editor engine analysis](#4-editor-engine-analysis)
5. [Test report](#5-test-report)
6. [Dependency and licence report](#6-dependency-and-licence-report)
7. [Data migration plan](#7-data-migration-plan) (full plan: [MIGRATION-PLAN.md](MIGRATION-PLAN.md))
8. [Backup confirmation](#8-backup-confirmation)
9. [Recommended changes](#9-recommended-changes)
10. [Release 0.3 task breakdown](#10-release-03-task-breakdown) (full plan: [RELEASE-0.3-PLAN.md](RELEASE-0.3-PLAN.md))
11. [Decisions needed from you](#11-decisions-needed-from-you)

---

## Executive summary

The foundation is sound and small (about 5.8k lines). Package boundaries are clean and one-way. Persistence goes through a single swappable `StorageAdapter`. Every save is transactional and version-checked. All dependencies are permissively licensed, and the production audit shows 0 vulnerabilities. Everything on your must-preserve list exists and works.

The audit found **one critical and several high-severity data-safety problems**. All of them must be fixed **before** any Release 0.3 work, because 0.3 is exactly what would trigger them:

| # | Problem | Why it matters now | Evidence |
|---|---|---|---|
| **C-1** | **A document containing any element the editor doesn't recognise opens blank, and the user's next keystroke saves the blank page over the original.** | 0.3 adds footnotes, comments, equations and sections. A 0.3 document opened in a still-cached older app (or another device not yet updated) would be destroyed by one keystroke. Diagrams have a milder version of the same problem: an older build silently drops newer fields. | DOCU-2, DIAG-6, STOR-17. I confirmed it in `@tiptap/core/src/helpers/createNodeFromContent.ts:56-63`. The app never sets `enableContentCheck`. |
| **H-1** | **Browser storage can be wiped and the app does little to prevent it.** It asks the browser for persistent storage only when you create an item. The Settings button can report "browser declined" without ever asking. Nothing reminds anyone to back up. | This already happened: incident S-1. The dev browser's database was empty this morning. | STOR-4, FUNC-29, ARCH-5, TEST-5 |
| **H-2** | **Holding or repeating Ctrl/⌘+S can erase version history.** Each press writes a "manual" version even with no changes. Pruning then deletes the oldest manual and "before restore" versions. | Version history is a promised safety net. | CODE-1, STOR-7 |
| **H-3** | **Unsaved edits can be silently lost**: when you leave an editor that is showing a conflict or a save error, and when you restore an old version while edits are still pending. | Silent data loss. | CODE-2, missed finding under code quality |
| **H-4** | **Starring, trashing or restoring an item counts as a content edit.** It bumps the version and "last edited" time. If the item is open in another window, that window shows a false "changed elsewhere" conflict, and its "Discard mine" button throws away real edits. | Gets worse with tabbed documents (0.3) and collaboration (0.6). | CODE-6, FUNC-4, STOR-12 |
| **H-5** | **No content-version upgrade path.** `schemaVersion` is the literal `1` everywhere, with no upgraders and no "newer than this app" guard. | Every 0.3/0.4 schema change needs it. | DOCU-3, DIAG-6, STOR-17, TEST-4 |
| **H-6** | **Backups are tied to the database version and import is fragile.** The first new store will make older apps reject every new backup. Malformed files pass validation. Re-importing the same backup duplicates items each time. | Backup is the recovery path for H-1 and the bridge to SQLite in 0.8. | STOR-5, STOR-6, STOR-13 |
| **H-7** | **No safety net for regressions.** No saved v0.1.0 data fixtures, no UI or browser tests, and the autosave hook (the only code between typing and the database) has zero tests. Two ✅ marks in the acceptance checklist were overstated. | The rule is "preserve first, validate second": that needs automated proof. | TEST-2, TEST-3, TEST-4, TEST-5 |

My recommendation is to finish **Release 0.2 as a stabilisation release** that fixes the issues above and adds the regression net, before any 0.3 feature work. That work is listed in §9. Some of it needs a one-time IndexedDB v1→v2 migration, detailed in [MIGRATION-PLAN.md](MIGRATION-PLAN.md).

---

## 1. Architecture report

**Shape.** npm-workspaces monorepo with 5 real workspaces: `apps/web`, `packages/ui`, `packages/local-storage`, `packages/document-studio`, `packages/diagram-studio`. Packages are consumed as TypeScript source (no per-package build). Dependency direction is one-way: the app uses all four packages, the studios use only `@dcos/ui`, and nothing imports the app or `local-storage` (ARCH-1). `backend/` is a FastAPI skeleton. `apps/desktop` (Tauri 2) and `apps/android` (Capacitor 7) are config only and have never been built, and are outside the npm workspaces. The six later-phase packages are README-only.

**Runtime flow.** `HashRouter` → `AppShell` (sidebar + header) for list pages. Editor routes are full-screen and sit outside the shell. Each editor page uses `useEditableItem(kind, id)` (`apps/web/src/lib/storage.ts`), which loads the item, debounces saves by 600 ms, writes with optimistic concurrency, and flushes when the page is hidden or the editor unmounts. Editors are storage-agnostic: they take `initialContent` and emit `onChange`. Theme tokens are CSS variables in `apps/web/src/index.css`, mapped into Tailwind.

**Routes today** (all must keep working): `#/`, `#/documents`, `#/diagrams`, `#/trash`, `#/settings`, `#/documents/:uuid`, `#/diagrams/:uuid`. Anything else redirects to `#/`.

**Against the target navigation** (corrected count, ARCH-2):

| Section | Exists as a route | Exists partly | Missing |
|---|---|---|---|
| Workspace | Dashboard, Documents, Diagrams | — | Presentations, Notebook, PDF Studio |
| Academic | — | — | Assignments, Classroom, Calendar, Shared Workspace |
| Management | Trash | Recent Files, Favorites (Dashboard sections only) | File Manager |
| Settings | — | Appearance, Storage, Backup & Restore (cards on one page), About (info card) | General, Keyboard Shortcuts |

All new routes can be added as siblings without breaking any existing URL. Keep `#/documents` and `#/diagrams`, add `#/files`, `#/recent` and `#/favorites` as new views over all kinds, and make `#/settings` a layout route with child pages.

**Architectural debt that the roadmap will hit:**

- **Item kind is hard-coded** as a two-way `document | diagram` choice in about 10 places, including the IndexedDB store mapping. That mapping would silently route a third kind into the diagrams store and still compile (ARCH-4). Needs a typed module registry before Presentations or Notebook.
- **Not ready for tabbed editing.** Editors are route-scoped pages that remount to reload, and `Ctrl+S` is a window-level listener per page. Tabs need an open-documents layer above the router (ARCH-7).
- **The ribbon is a rewrite of the toolbar layer**, not a re-skin. The 423-line `Toolbar.tsx` calls editor commands inline. A typed command registry is the right first step (ARCH-8).
- **No code-splitting.** Both editors, Tiptap and React Flow are in one 1.32 MB entry chunk (ARCH-9).
- **Storage is created at import time** with no injection point for SQLite (ARCH-6). `list()` reads every full record, including base64 images, just to show a list (STOR-11).
- `DocumentPage` and `DiagramPage` are line-for-line duplicates. `FilesPage` serves three screens (ARCH-11). Design tokens live in the app, not the design system (ARCH-10).

## 2. Functionality inventory

Each feature was checked against the code and the acceptance checklist. ✅ works · 🟡 works with stated limits · ❌ absent. Details are in FINDINGS.md under FUNC-*.

**Must-preserve features**

| Feature | State | Limits |
|---|---|---|
| Dashboard | ✅ | Greeting, 4 quick-start tiles, recent (8), favorites (6), storage card. No "view all". |
| Navigation | ✅ | 7 routes above. The sidebar also shows 5 **non-functional "Coming next" entries**, which break your no-placeholder rule (FUNC-2). |
| Document creation | ✅ | 5 templates (blank, assignment, lab report, essay, project report). |
| Document editing | 🟡 | Simple and Advanced toolbars. Headings H1–H4 only. No styles, line spacing or indents. "Link (Ctrl+K)" advertises a shortcut that doesn't exist (FUNC-9). Opening Find switches the document to Advanced mode and saves that as an edit (CODE-12). |
| Diagram creation | ✅ | 10 templates. |
| Flowchart editor | 🟡 | 12 shapes, 4 fixed connection points, elbow/straight/curved lines, no obstacle avoidance. Tab/Enter shortcuts also fire on toolbar buttons and menu items, which blocks keyboard use (DIAG-5). |
| Tree diagram editor | 🟡 | Tidy top-down / left-right layout, Tab = child, Enter = sibling. Undoing "Arrange" leaves auto-arrange on (DIAG-2). |
| Local persistence | 🟡 | Transactional and version-checked, but see H-1 to H-4. |
| Recent work | 🟡 | Ordering is distorted because starring or trashing counts as an edit (FUNC-4). |
| Favorites | 🟡 | Works. The same version-bump side effects apply. |
| Trash and restore | ✅ | Soft delete, restore, delete forever with confirmation. A trashed item opened by URL can still be edited (FUNC-6). |
| Theme preference | ✅ | light, dark or system. Stored in localStorage only, so it isn't in backups. |
| Exports | 🟡 | Documents: DOCX (lossy, see §4), PDF via the print dialog, TXT. Diagrams: PNG 2×, SVG (HTML inside `foreignObject`, **not true vector**), PDF (a raster image). |
| Document / diagram IDs | ✅ | UUID v4, never reused. They appear in URLs and backups and must stay frozen. |

**Other existing features:** version history (with the H-2 flaw), backup export/restore (with H-6), find & replace (breaks on characters like Turkish İ, CODE-9), page setup, live table of contents, page breaks, word count, offline badge, PWA install with offline shell (not yet tested offline), conflict banner.

**Not present, and nothing pretends otherwise in code** (FUNC-20, FUNC-25): ribbon, real pagination (the "page" is one tall sheet whose footer always says "Page 1", FUNC-10), rulers, sections, columns, footnotes, citations, equations, comments, track changes, styles, text boxes, image wrapping, DOCX/ODT import, ODT export, tabs. In diagrams: groups, layers, lock, z-order UI, rotation, distribute, numeric geometry, orthogonal routing, radial and grid layouts, UML/ER/BPMN shapes, project file format, embedding in documents. Also missing: Presentations, Notebook, PDF Studio, Assignments, Classroom, Calendar, collaboration, and the desktop and Android builds.

## 3. Database and storage report

**Engine:** IndexedDB via `idb` 8, database `digital-classroom-os`, schema version 1.

| Store | Key | Index | Holds |
|---|---|---|---|
| `documents` | `id` | — | `WorkspaceItem<DocumentContent>` |
| `diagrams` | `id` | — | `WorkspaceItem<DiagramContent>` |
| `document_versions` | `id` | `by_item` | version snapshots |
| `diagram_versions` | `id` | `by_item` | version snapshots |
| `meta` | `key` | — | `deviceId` |

**Records.** `WorkspaceItem { id (UUID v4), kind, title, content, version, createdAt, updatedAt, deletedAt|null, ownerDeviceId, favorite, templateId, lastSnapshotAt }`. Content is Tiptap JSON plus page settings, or a React Flow node/edge list. Both carry `schemaVersion: 1`.

**What is solid** (STOR-1–3): read-check-write in one transaction, `ConflictError` on stale writes, soft delete, an append-only `MIGRATIONS` array, and backup import that never overwrites (diverged items come in as copies). All of this is covered by 10 passing tests.

**Risks, all verified:**

| ID | Risk | Severity |
|---|---|---|
| STOR-4 | Eviction (S-1): persistence requested only on create; the Settings button can lie; no backup reminders | high |
| DOCU-2 / C-1 | Unknown content loads blank, and the next edit overwrites | critical |
| CODE-1, STOR-7 | Pruning keeps 49 not 50, evicts manual and restore versions, and is skipped on restore | high / low |
| STOR-5 | Import validates only id, kind, version and title. Probes showed missing `deletedAt` sends items to Trash, missing `updatedAt` can crash the list, and negative schema versions are accepted | medium |
| STOR-6 | Re-importing the same backup adds another "(restored)" copy every time | medium |
| STOR-13 | Backup `schemaVersion` equals the database version, so v1 apps will reject all v2 backups. Kinds are hard-coded | medium |
| STOR-8, CODE-5 | Autosave loss windows: 600 ms debounce, fire-and-forget flush on page hide, no retry after errors, overlapping flushes can cause false conflicts | medium |
| STOR-9 | A schema upgrade in another tab force-reloads this tab without saving pending edits | medium |
| STOR-10 | Images are base64 inside content, copied into every snapshot. A ≤1600 px image of up to 15 MB is embedded as-is (about 20 MB as base64) | medium |
| STOR-11 | Lists read full content, including images | medium |
| STOR-12 | No cross-tab change notification | low |

**The SQLite target (0.8)** is designed in `docs/DATABASE.md`. Nothing is implemented, and the native shells have never been built.

## 4. Editor engine analysis

### Document Studio: Tiptap 3.33.1 / ProseMirror (MIT)

Extensions: StarterKit (H1–H4), TextStyleKit, multicolour Highlight, TextAlign, TableKit, Image (base64), Sub/Superscript, CharacterCount, Placeholder, plus three custom ones (PageBreak, live TableOfContents, SearchReplace).

**Verdict: keep Tiptap/ProseMirror** (DOCU-21). Lexical and Slate offer no pagination, comment or DOCX advantage. OnlyOffice (AGPL-3.0) and Collabora (MPL-2.0) are server-based, which would break offline use and the preserve-data rule.

**Important constraint, verified on tiptap.dev/pricing:** Tiptap's official **Pages (pagination), Comments, DOCX import/export, Compare and Tracked Changes are paid** platform features. The cheapest plan with comments is $49–59/month, Pages needs Team or above, and Tracked Changes is a custom-priced add-on (DOCU-8, DEPE-4). Under your no-paid-services rule, each of these must be built from open-source parts. The free MIT extensions we can use: Mathematics, TableOfContents, UniqueID, Collaboration (+caret).

**DOCX export fidelity gaps** (DOCU-4, CODE-4). It silently drops non-paragraph content inside list items (images, tables, code) and nested tables. It ignores the list start number, column widths, line height and alignment in lists and quotes. The TOC is static text (the `docx` library has a real TOC field we can use). Highlight and background colour collide. Only data-URL PNG, JPEG, GIF and BMP images are exported. **No exported file has been opened in Word yet.**

**Feasibility of Release 0.3 with free components only:**

| Feature | Approach | Effort | Risk |
|---|---|---|---|
| Ribbon (Home/Insert/Layout/References/Review/View) | Command registry, then ribbon components; the current toolbar stays as Simple mode | M | low |
| Tabbed documents | Open-documents provider plus tab bar; the URL is the active tab | M | medium |
| Multi-page view | Spike `tiptap-pagination-plus` (MIT, one maintainer); fallback is a custom decoration-based paged view. Plus an exact "print layout preview" | L | **high** |
| Rulers / indents | Indent attributes plus horizontal ruler; tab stops later | M | low |
| Styles | Built-in paragraph and character styles first, user styles later | M–L | medium |
| Section breaks / columns | `sectionBreak` node; v1 page settings become section 1; DOCX sections | L | medium-high |
| Footnotes | `tiptap-footnotes` 4.0.1 (MIT) or ~300 lines of our own; DOCX footnotes | M | low-medium |
| Equations | `@tiptap/extension-mathematics` + **KaTeX pinned to 0.18.x** (the extension rejects 0.19). Export to DOCX as an image with LaTeX alt text first; native Word equations later | S–M | low |
| Citations / bibliography | `@citation-js/core` (MIT) parses, but its formatter needs **citeproc (CPAL-1.0 or AGPL-1.0)**, which is outside policy. Recommend our own formatters for APA 7, MLA 9, IEEE and Harvard | M–L | medium |
| Comments | Custom mark plus a side store; DOCX comments export | M–L | medium |
| Track changes | **Defer to 0.6** (built on Yjs snapshots). Word-compatible tracking is XL | XL | high |
| Text boxes / shapes / image wrap | Image float attributes; paragraph-anchored text box; shapes via diagram embeds (needs 0.4 SVG renderer) | M–L | medium |
| DOCX import | `mammoth` 1.13 (BSD-2) for content, plus a small pass for page size and margins; sanitise with DOMPurify. Keeps content and structure, not exact layout | M–L | medium |
| ODT | `odf-kit` 0.14.5 (Apache-2.0, young project) behind an adapter, validated in LibreOffice; fallback is our own ODF writer | M | medium |

**Not realistically achievable at Word fidelity in a browser editor** (DOCU-22). These must be stated in the UI so no feature is faked:
- Live pagination will be approximate. The PDF and DOCX output are authoritative.
- Footnotes appear at the end of the document while editing.
- No freely positioned shapes anywhere on the page.
- DOCX import keeps content and structure, not exact layout.
- Track changes is not in 0.3.

### Diagram Studio: React Flow 12.12.1 (MIT)

One generic `shape` node type with 12 SVG shapes drawn at real pixel size, 4 loose connection points, a snapshot undo stack (150 steps), a tidy-tree layout, and whitelist serialization.

**Verdict: keep React Flow** (DIAG-1). Verified bugs, all low-to-medium:
- Undo doesn't revert auto-arrange.
- Focusing the inspector clears redo.
- Arrow-key moves can't be undone.
- Tab/Enter are hijacked on buttons and menus.
- Panning the view counts as an edit.
- Large raster exports can exceed iOS canvas limits.
- **SVG export is not true vector and PDF is a raster.** A model-to-SVG renderer would fix both and also enables embedding diagrams in documents and slides (DIAG-7, DIAG-18).

**0.4 with free components:**
- Shape registry for 100+ shapes, keeping the 12 existing names as aliases.
- Groups via React Flow sub-flows (free); layers, lock and z-order in our own code.
- Rotation (free core example).
- Layouts: `d3-hierarchy` (ISC) for tree and radial, `@dagrejs/dagre` (MIT) for layered.
- Orthogonal routing: our own A* grid router.

**Licence flags:** `elkjs` is EPL-2.0 OR GPL-3.0 and `libavoid-js` is LGPL-2.1 (beta). Both are outside policy without an exception. Several React Flow **Pro** examples overlap our roadmap and must not be copied: helper lines, editable edge, edge routing, selection grouping, parent-child relation, auto layout, collaborative, and server-side image creation (DIAG-13–19).

## 5. Test report

**Recorded baseline** ([baseline-test-run.md](baseline-test-run.md); re-run independently by two auditors with the same results):

| Check | Result |
|---|---|
| `npm run typecheck` | ✅ exit 0 |
| `npm test` (Vitest 5.1.0) | ✅ 37/37: diagram logic 20, IndexedDB adapter 10, DOCX/print/text export 7 |
| `npm run build` | ✅ 18 precache entries, 2.31 MB |
| Backend `pytest` | ✅ 3/3 |
| Licence gate | ✅ 101 production packages, all within policy |
| `npm audit --omit=dev` | ✅ 0 vulnerabilities |
| `npm audit` (all) | 6 dev-only advisories (2 low, 4 moderate) in vite-plugin-pwa's build chain. npm's suggested "fix" is a downgrade, so it should **not** be applied |

**What the suite cannot catch** (TEST-2–13):
- Vitest only collects `packages/*/src/**/*.test.ts` in a Node environment. Anything under `apps/` or named `.test.tsx` is silently ignored, and there is no DOM environment.
- **Zero tests** for:
  - the autosave/conflict hook
  - search & replace, the TOC node and page breaks
  - both editor components and all diagram exports
  - content normalizers and the database upgrade path
  - the theme, routes and settings
- No saved v0.1.0 fixtures to prove old data still loads.
- DOCX tests check XML substrings only. No golden files, and no file has been opened in Word.
- No browser (Playwright) or offline tests. Six ✅ rows in the acceptance checklist rest on one manual check in Chromium.

**Corrections to my own earlier claims.** The audit found two acceptance-checklist rows I marked ✅ that were overstated:
- "Local data survives application restart" was tested by reopening a fake database in the same process, which cannot detect eviction. S-1 proved eviction happens.
- "Interrupted saves do not corrupt documents" only proved a rejected write leaves the old record intact. It doesn't cover the 600 ms of edits held in memory.

`docs/ARCHITECTURE.md` and a code comment (`indexeddb.ts:22`) also said 50 versions are kept with automatic ones pruned first, and neither is true (STOR-7). I have corrected both checklist rows and ARCHITECTURE.md. The code comment will be fixed together with the code in 0.2-A4.

## 6. Dependency and licence report

Every **direct dependency is permissive** (MIT, ISC, Apache-2.0, OFL-1.1 for the bundled Inter font). Installed versions match their ranges, and the production audit is clean (DEPE-1).

**Issues in the current tree:**
- **License script bug** (DEPE-6): it reads each package's licence from the hoisted copy, not the copy that actually ships. Two shipped packages (`nanoid` 6, `pako` 2) were checked against their dev-only copies. Their licences happen to match. Fix: read `package-lock.json` entries instead.
- **About 380 KB of never-called code is precached** for every install (DEPE-8): jsPDF's optional `html2canvas` (last release 2022), `canvg` and `dompurify` chunks.
- **Stale pins:**
  - `html-to-image` is pinned to 1.11.11, and the project hasn't released since February 2025.
  - `lucide-react` is 0.460, while 1.72 is current.
  - The Capacitor ^7 ranges should move to 8, which the SQLite plugin needs (DEPE-10).
- **The licence gate doesn't cover** `apps/desktop`, `apps/android` or `backend/`. CI regenerates `THIRD_PARTY_NOTICES.md` without checking whether it changed (DEPE-7).

**Candidates for 0.3–0.8** (versions and licences from npm, 2026-11-13):

| Use | Package | Licence | Note |
|---|---|---|---|
| DOCX import | mammoth 1.13.0 | BSD-2-Clause | maintained |
| Equations | @tiptap/extension-mathematics 3.33.1, katex **0.18.x** | MIT | pin KaTeX ≤0.18 |
| Equation input | mathlive 0.111.4 | MIT | optional |
| Footnotes | tiptap-footnotes 4.0.1 | MIT | or our own |
| Paged view | tiptap-pagination-plus 3.1.0 | MIT | spike first; single maintainer |
| ODT | odf-kit 0.14.5 | Apache-2.0 | young; adapter + validation |
| Citations | @citation-js/core 0.9.0 | MIT | **formatter dependency citeproc is CPAL/AGPL**, outside policy |
| PDF viewing | pdfjs-dist 6.5.x | Apache-2.0 | maintained |
| PDF editing | pdf-lib 1.17.1 | MIT | **no release since 2021**; spike |
| Slides export | pptxgenjs 4.0.1 | MIT | last release mid-2025 |
| Slide charts | chart.js | MIT | lighter than echarts |
| Collaboration | yjs 13.6, @tiptap/extension-collaboration(+caret) | MIT | y-webrtc and y-indexeddb not published since 2023 |
| Diagram layout | d3-hierarchy 3.1.3 (ISC), @dagrejs/dagre 3.1.3 (MIT) | permissive | do **not** use the unscoped `dagre` (2019) |
| Diagram layout / routing | elkjs 0.12.1, libavoid-js 0.5 beta | **EPL-2.0/GPL-3.0, LGPL-2.1** | needs a policy exception |
| E2E tests | @playwright/test 1.65.0 | Apache-2.0 | — |
| Coverage | @vitest/coverage-v8 5.1.0 | MIT | — |
| Native storage | @tauri-apps/plugin-sql, @capacitor-community/sqlite 8.x | MIT/Apache | Capacitor 8 needed |

## 7. Data migration plan

Summary below. The full plan, with procedures and tests, is in **[MIGRATION-PLAN.md](MIGRATION-PLAN.md)**.

1. **Frozen contract.** The 5 v1 stores, their keys and index, every item UUID, the template IDs, the routes, and the existing node, mark, shape and handle names are never renamed or reshaped. New things are only ever added.
2. **Fixtures first.** Commit v0.1.0 document, diagram and backup fixtures, and test that every future build loads them unchanged.
3. **Content upgraders.** Add ordered, pure `migrateDocument` and `migrateDiagram` functions. Content from a newer app version opens **read-only** with a banner, and autosave is off. Turn on Tiptap's content check so invalid content can never load blank.
4. **IndexedDB v2** (one upgrade, in 0.2):
   - Add `item_index` for fast lists, `attachments` for images, `drafts` for crash recovery, and new meta keys.
   - The migration function gets the upgrade transaction.
   - The index is backfilled from existing records inside the upgrade. Existing records are not touched.
5. **Safety copy before upgrading.** Before opening v2, the app copies the whole v1 database to a separate `digital-classroom-os-backup-v1` database, and only then upgrades.
6. **Backup format v2.** Format version is independent of the database version. Per-store sections. v1 backups stay importable forever. Imports are idempotent and fully validated.
7. **Images to attachments.** Done lazily on open/save, after all exporters can resolve `asset:` references. `data:` URLs keep working forever.
8. **New kinds** (Presentations, Notebook and so on): later appended migrations through a typed kind→store map.
9. **SQLite (0.8).** One adapter contract test suite that both IndexedDB and SQLite must pass. Data moves via the backup file with IDs kept exactly.

## 8. Backup confirmation

| Backup | Location | Verified |
|---|---|---|
| Full source tree at v0.1.0 (excludes node_modules, dist, .venv, .git) | `backups/source-v0.1.0-2026-11-13.tar.gz`, 171 files, SHA-256 `5669d4129e5c24da86ccddab35635d808b07d77378af01946bc87fb81acf1f76` | ✅ listed and hashed |
| Git baseline | commit `20d3f4d`, annotated tag `v0.1.0-baseline` | ✅ |
| Local database (IndexedDB at `http://localhost:5173`, dev browser) | `backups/indexeddb-localhost5173-2026-11-13.json` | ⚠️ **Empty.** The origin's IndexedDB and localStorage had been cleared before the audit began. Only test data I created on 2026-11-12 was affected. This is incident S-1, the basis of H-1. |

`backups/` is git-ignored. If you used the app in **your own browser** (Chrome or Safari), that data is in a different browser profile I can't reach. Export it from **Settings → Backup and restore → Export backup** before any upgrade.

The baseline commit uses a placeholder git identity ("Digital Classroom OS"), because this repo has no `user.name`/`user.email` configured. Tell me which identity to use and I'll amend it.

## 9. Recommended changes

These finish **Release 0.2**. They are ordered and none of them adds a 0.3 feature. Effort: S ≤ 1 day, M 2–4 days, L 1–2 weeks.

**0.2-A — Data safety (blocking)**

| # | Change | Fixes | Effort |
|---|---|---|---|
| A1 | Enable Tiptap content checking. Invalid or newer content opens read-only with a recovery banner, and autosave is blocked | C-1 (DOCU-2) | S |
| A2 | `migrateDocument` / `migrateDiagram` pipelines, a `schemaVersion: number` field, and a read-only guard for newer versions. No silent write-back when content is merely normalised on open | H-5 (DOCU-3, DIAG-6) | S–M |
| A3 | Request persistent storage at startup; persistence status banner; fix the Settings button; `lastBackupAt` and backup reminders | H-1 (STOR-4) | S |
| A4 | Ctrl/⌘+S ignores key repeat and no-change saves. Pruning keeps exactly 50, removes auto snapshots first, and never removes create, restore or the latest manual versions | H-2 (CODE-1, STOR-7) | S |
| A5 | Metadata (favorite, trash) updates no longer bump the content version or `updatedAt`; atomic `setFavorite` | H-4 (CODE-6, FUNC-4) | S–M |
| A6 | Serialise saves through one queue; retry with backoff on errors; protect unsaved edits on exit (leave-page prompt, `drafts` store for recovery); flush before version restore | H-3 (CODE-2, CODE-5, STOR-8) | M |
| A7 | Backup format v2 (independent version, per-store sections, full validation, idempotent re-import, error toasts) | H-6 (STOR-5/6/13) | M |
| A8 | IndexedDB v2 migration as specified in MIGRATION-PLAN.md, with the pre-upgrade safety copy and safe handling of other open tabs | STOR-9/11/14, ARCH-6 | M |
| A9 | Cross-tab change notifications (BroadcastChannel) | STOR-12 | S |

**0.2-B — Regression net (blocking, written before A1–A9 land)**

| # | Change | Effort |
|---|---|---|
| B1 | v0.1.0 fixtures (every template, a document using every node and mark, every diagram shape and connector, a full backup) plus load/round-trip tests | S–M |
| B2 | Vitest DOM layer (jsdom + Testing Library); include `apps/**` and `.tsx` files; tests for the autosave hook, search/replace, TOC and theme | M |
| B3 | Playwright smoke tests in Chromium, Firefox and WebKit against the production build: create→edit→reload→export for both editors, an offline run, and a persistent-profile restart test | M |
| B4 | DOCX golden files plus an independent re-parse; a manual Word and LibreOffice check, recorded with dates | M |
| B5 | Coverage baseline with per-file thresholds for storage and serialization; acceptance checklist rows linked to named tests | S |

**0.2-C — Correctness fixes (non-blocking, same release)**
- Title input reverting while typing (CODE-3).
- DOCX: list item content and nested tables, list start numbers, a real Word TOC field, the highlight/background clash (CODE-4, DOCU-4).
- Diagrams:
  - Tab/Enter only when focus is on the canvas (DIAG-5).
  - Undo covers auto-arrange (DIAG-2).
  - Inspector undo steps only on real changes (DIAG-3).
  - Arrow-key moves can be undone (DIAG-4).
  - Panning the view is not an edit (FUNC-28).
- Documents and print:
  - Find no longer changes the document's mode (CODE-12).
  - Search works with characters like İ (CODE-9).
  - Print iframe is always cleaned up (CODE-12).
- Trash banner for trashed items opened by URL (FUNC-6).

**0.2-D — Honesty, architecture and design system (non-blocking)**
- **Remove the 5 "Coming next" sidebar placeholders.** Each module gets a nav entry the day it works. Fix the "Ctrl+K" label (FUNC-9) and the version string in Settings.
- Typed module registry and a single route/nav table (ARCH-3/4). Merge the two editor pages and the list page into generic components (ARCH-11). Code-split by route (ARCH-9). Move design tokens into `@dcos/ui` (ARCH-10).
- Implement the target navigation **only for what exists**: Dashboard, Documents, Diagrams, File Manager (all kinds), Recent, Favorites, Trash; Settings → General, Appearance, Storage, Backup & Restore, Keyboard Shortcuts, About. Academic modules appear when built.
- Dependencies and CI:
  - Fix the licence script (read the lock file).
  - Stop precaching unused jsPDF chunks.
  - Add the native shells and backend to the licence gate; check the notices file for changes in CI.
  - Lint rule enforcing package boundaries.
  - A CI check that no paid `@tiptap-pro` package slips in.

## 10. Release 0.3 task breakdown

Summary below. The full breakdown, with dependencies, acceptance tests and stated limitations, is in **[RELEASE-0.3-PLAN.md](RELEASE-0.3-PLAN.md)**. Release 0.3 starts only after 0.2-A and 0.2-B are done.

| Epic | Contents | Effort |
|---|---|---|
| 3.1 Command registry & ribbon | Home / Insert / Layout / References / Review / View; Simple mode = today's toolbar on the same commands | M |
| 3.2 Tabbed documents | Open-items provider, tab bar, per-tab autosave, URL = active tab | M |
| 3.3 Paged view & print preview | Pagination spike → paged view; exact print-layout preview; "approximate" label | L |
| 3.4 Rulers, indents, styles | Ruler, paragraph indents, built-in paragraph and character styles | M–L |
| 3.5 Tables & images | Column widths, cell shading, nested tables; images in the attachments store, float/wrap | M |
| 3.6 Sections & columns | `sectionBreak` node, per-section page setup and columns (content schema v2) | L |
| 3.7 References | Footnotes, live TOC with page numbers in PDF, citations and bibliography (APA/MLA/IEEE/Harvard) | L |
| 3.8 Equations | KaTeX-based inline and block math; DOCX as image + LaTeX | S–M |
| 3.9 Review | Comments (side panel, DOCX export), spelling toggle, compare two versions (read-only diff) | L |
| 3.10 Text boxes | Paragraph-anchored text box (shapes arrive with 0.4 diagram embeds) | M |
| 3.11 Import / export | DOCX import (mammoth) with loss report; DOCX export fidelity; ODT import/export via adapter; real-file corpus | L |
| 3.12 View | Zoom, navigation pane (heading outline), ruler toggle | S–M |

**Explicitly not in 0.3:**
- track changes (0.6)
- freely positioned shapes
- Word-identical live pagination
- native Word equations (OMML)

## 11. Decisions needed from you

1. **Approve Release 0.2 as a stabilisation release** (§9 A–D) before any 0.3 feature work. This includes the IndexedDB v1→v2 migration (with the pre-upgrade safety copy).
2. **Licence exceptions.** I recommend **no exception** for any of these:
   - citeproc (CPAL/AGPL): build our own formatters for 4 citation styles instead.
   - elkjs (EPL) and libavoid-js (LGPL): use dagre/d3 and our own router instead.
3. **Accept the honest limits** in §4: approximate paged view, footnotes at the end while editing, DOCX import of content rather than layout, equations exported as images first, and track changes in 0.6.
4. **Remove the "Coming next" sidebar placeholders** now, per your no-placeholder rule.
5. **Git identity** for commits.
