# M08 Advanced File Manager: product requirements

This document specifies Module 08 (prefix FIL), the Advanced File Manager. It is the single organisation layer for every workspace item kind (documents, diagrams, presentations today; notebooks and PDFs once they exist): folders, nested folders, tags, favourites, recent, trash, bulk operations, previews, import and export from the list, backup and restore, version history from the list, and a true storage overview. Folders, tags and subjects are defined here as the shared service **SVC-ORG**, which the Notebook (M04), Classroom Hub (M06), Dashboard (M09) and Global Search (SVC-SEARCH, owned by M09) consume. No other module may build its own folder or tag model. The current "File Manager" is a flat list of three kinds, and this PRD records exactly what exists and what remains.

Status: AE-P1 draft for owner approval (2026-11-15)

Related documents in this folder:
[Product roadmap](./ADVANCED_EDITION_PRODUCT_ROADMAP.md) ·
[M09 Dashboard PRD](./MODULE_09_DASHBOARD_PRD.md) ·
[M04 Digital Notebook PRD](./MODULE_04_DIGITAL_NOTEBOOK_PRD.md) ·
[M05 PDF Studio PRD](./MODULE_05_PDF_STUDIO_PRD.md) ·
[M06 Classroom Hub PRD](./MODULE_06_CLASSROOM_HUB_PRD.md) ·
[System architecture](./SYSTEM_ARCHITECTURE.md) ·
[Database and sync architecture](./DATABASE_AND_SYNC_ARCHITECTURE.md) ·
[Module dependency map](./MODULE_DEPENDENCY_MAP.md) ·
[Acceptance criteria](./ACCEPTANCE_CRITERIA.md) ·
[Security and privacy plan](./SECURITY_AND_PRIVACY_PLAN.md) ·
[Dependency and licence plan](./DEPENDENCY_AND_LICENCE_PLAN.md) ·
[Risk register](./RISK_REGISTER.md) ·
[Release strategy](./RELEASE_STRATEGY.md)

Phase names follow the canonical brief: **AE-P1 … AE-P16** are Advanced Edition phases; "v0.2 Phase n" refers to the earlier programme. File Manager data foundations are built in **AE-P3** (DB v4, SVC-ORG interfaces) and the user-facing module in **AE-P11**.

---

## Current state

The current "File Manager" is a flat list: `apps/web/src/pages/ItemListPage.tsx:30-43, 136-154` and `docs/audit/FEATURE_STATUS.md:175`. One component, `ItemListPage`, serves every list view (`ItemListPage.tsx:14`: per kind, `files`, `recent`, `favorites`, `trash`), routed in `apps/web/src/App.tsx:30-36`.

| ID | Requirement | Status | Evidence / notes |
|---|---|---|---|
| FIL-FR-001 | Folders | **Absent** | No field in WorkspaceItem (`packages/local-storage/src/types.ts:9-29`) |
| FIL-FR-002 | Nested folders | **Absent** | — |
| FIL-FR-003 | Tags | **Absent** | — |
| FIL-FR-004 | Favourites | Done | `ItemRow.tsx:53-60`; metadata-only change |
| FIL-FR-005 | Recent | Partial | Means last *edited* (`ItemListPage.tsx:17,37`); no lastOpenedAt |
| FIL-FR-006 | Trash | Done | ADR 0010; `e2e/document.spec.ts:42-46`. No retention policy |
| FIL-FR-007 | Restore from trash | Done | — |
| FIL-FR-008 | Global search | Partial | Title substring, current list only |
| FIL-FR-009 | Filters | Partial | Kind chips on /files only; untested |
| FIL-FR-010 | Sorting | Partial | 3 orders; not remembered; untested |
| FIL-FR-011 | Previews | **Absent** | — |
| FIL-FR-012 | Bulk operations | Partial | Empty trash only (purgeMany) |
| FIL-FR-013 | Import | Partial | DOCX, ODT, .dcosdoc, .drawio, .dcosdiagram and backup JSON. No PPTX, PDF or generic files; no drag-and-drop |
| FIL-FR-014 | Export | Partial | Inside the editors and whole-workspace backup only |
| FIL-FR-015 | Backup | Done | Settings; `e2e/backup-restore.spec.ts:85`; ADR 0007. Manual only; preferences not included |
| FIL-FR-016 | Restore from backup | Done | Never overwrites |
| FIL-FR-017 | Version history | Partial | Inside the editor only; no preview or compare |
| FIL-FR-018 | Storage usage | Partial | `navigator.storage.estimate`. `sizeBytes` is the JSON character count of the content only (`indexeddb.ts:298`) |
| FIL-FR-019 | Reliable and recoverable | Partial | True for the operations that exist |

"Done" means Done for v0.2, with a test file and the recorded local run of 2026-11-15 (RELEASE_GAPS.md §11). Nothing was re-run in AE-P1. Every Done item must be re-verified against its AC-FIL criterion in AE-P11 ("re-verify: yes").

What earlier commits already delivered for this module: trash, restore and purge (ADR 0010: accepted in v0.1.0, extended in v0.2 Phase 3, `2669868`), favourites as metadata (`indexeddb.ts:808-810, 827-840`), backup format 2 and never-overwrite restore (ADR 0007: accepted in Release 0.2, hardened in v0.2 Phases 2 and 3), per-item version history (ADR 0005), and the flat list with title search, kind chips and three sort orders. The flat list itself has very low unit coverage: `apps/web/src/pages/ItemListPage.tsx` 1 of 70 lines in `coverage/lcov.info` (file dated 2026-11-15); list search, sort and the kind chips have no test in `e2e/` or any unit test file (grep, 2026-11-15).

---

## 1. Product objectives

| # | Objective | Measured by |
|---|---|---|
| O1 | Give every item kind one organisation model (folders, nested folders, tags, subjects as a folder role) that every module uses. | SVC-ORG used by M04, M06, M09 and SVC-SEARCH; no module-private folder or tag model (INT-05) |
| O2 | Make every file operation reliable and recoverable: nothing is lost by a move, tag, trash, bulk action, import or restore. | AC-FIL-019 family; every destructive step has a confirmation and a recovery path |
| O3 | Let a student find work quickly in a library of thousands of items. | PERF-001, PERF-011 (proposed targets, to be measured); filters and sort persisted |
| O4 | Show honest storage information: real bytes, split by kind, versions, attachments, drafts and safety copies. | AC-FIL-018; R-040 closed |
| O5 | Keep the existing behaviour that works (soft delete, never-overwrite restore, metadata changes that do not count as edits). | Regression ACs for FIL-FR-004/006/007/015/016 with "re-verify: yes" |
| O6 | Stay local-first and private: organisation data lives on the device and works offline. | AC-FIL-504, AC-FIL-507 |

Out of scope for M08: content editing (studios), classroom submission (M06), sharing and permissions (M07), and the search engine itself (SVC-SEARCH, owned by M09). Generic non-workspace files ("any file") are not a kind today; whether to add one is an open owner question (D-43, see §12).

---

## 2. User stories

| ID | As a … | I want to … | So that … | Requirements |
|---|---|---|---|---|
| US-FIL-01 | student | create folders such as "Physics" and nest "Lab reports" inside | my work is arranged by subject and topic | FIL-FR-001, 002, 020 |
| US-FIL-02 | student | mark a folder as a subject | the Notebook and the Dashboard show the same subjects | FIL-FR-021 |
| US-FIL-03 | student | tag items "exam", "draft", "group project" across folders | I can find related work that lives in different folders | FIL-FR-003 |
| US-FIL-04 | student | star important items | they appear in Favourites and on the Dashboard | FIL-FR-004 |
| US-FIL-05 | student | see what I opened most recently, not only what I edited | I can return to something I was reading | FIL-FR-005 |
| US-FIL-06 | student | delete items and folders without fear | I can restore them from the trash, in their original place | FIL-FR-006, 007 |
| US-FIL-07 | student | search, filter by kind, tag, folder, date and favourite, and sort | I find an item in a large library | FIL-FR-008, 009, 010 |
| US-FIL-08 | student | see a thumbnail of a diagram, first slide or document page | I recognise items without opening them | FIL-FR-011 |
| US-FIL-09 | student | select many items and move, tag, star, trash, restore or export them at once | tidying up does not take one click per item | FIL-FR-012 |
| US-FIL-10 | student | drag a DOCX or .drawio file into a folder | it is imported straight into that folder | FIL-FR-013 |
| US-FIL-11 | student | export an item or a selection from the list | I do not need to open each editor | FIL-FR-014 |
| US-FIL-12 | student | back up and restore the whole workspace including folders and tags | my organisation survives a new device or a cleared browser | FIL-FR-015, 016 |
| US-FIL-13 | student | open an item's version history from the list and preview a version | I can recover an older state without opening the editor first | FIL-FR-017 |
| US-FIL-14 | student | see how much space each kind, its versions and its pictures use | I know what to clean up when storage runs low | FIL-FR-018 |
| US-FIL-15 | teacher | keep class materials in folders | I can attach them to assignments by reference later (M06, SVC-REF) | FIL-FR-001, INT-03 |

---

## 3. Functional requirements

M08 IDs run from 001. The 19 IDs from the canonical brief are fixed; FIL-FR-020 onwards are added in AE-P1 and are derived from brief bullets ("Folder hierarchy", "All file operations must be reliable and recoverable") or marked "(beyond the brief)".

| ID | Requirement | Detail | Current status | Evidence (for anything not Absent) | Phase | Decision |
|---|---|---|---|---|---|---|
| FIL-FR-001 | Folders | User can create, rename and delete folders; every item has at most one parent folder or sits at the root. Folders are organisation entities, not ItemKinds (ADR-0015 (b), proposed). | **Absent** | `types.ts:9-29` has no folder field; no folder store in `indexeddb.ts:58-72` | Data AE-P3; UI AE-P11 | D-11 |
| FIL-FR-002 | Nested folders | Folders can contain folders to a proposed maximum depth of 16. A move that would create a cycle is refused with a message. Breadcrumbs show the path. | **Absent** | — | AE-P3 / AE-P11 | D-11 |
| FIL-FR-003 | Tags | Many-to-many tags with a name and a colour from the design-system palette. Create, rename, recolour, delete (removal from items is one transaction). | **Absent** | — | AE-P3 / AE-P11 | D-11 |
| FIL-FR-004 | Favourites | Star and unstar any item (and, proposed, folders). Metadata only: does not change `version` or `updatedAt`; moves `metaUpdatedAt` once DB v4 exists. | Done | `ItemRow.tsx:25-26,52-60`; `types.ts:176` setFavorite; `indexeddb.ts:808-810, 827-840` (metadata write: favourite only, `version` and `updatedAt` untouched); `e2e/document.spec.ts:40,49-51`; `e2e/backup-restore.spec.ts:169-173` (set before backup), `:209` (still set after restore) | Re-verify AE-P11 | — |
| FIL-FR-005 | Recent | "Recent" lists items by the meaning chosen in D-32 (proposed: last opened, using `lastOpenedAt`, written outside the content version). | Partial | `ItemListPage.tsx:17,37`: top 50 by `updatedAt`. No open timestamp is stored | AE-P3 (field) / AE-P11 | D-32 |
| FIL-FR-006 | Trash | Soft delete for items and folders. Trashing a folder trashes its subtree as one unit. Retention per D-33. | Done (items) | ADR 0010; `ItemListPage.tsx:21-22,40,129-133`; `ItemRow.tsx:76`; `e2e/document.spec.ts:42-46`; `e2e/cross-tab.spec.ts:14-26`. No folders; no retention | Re-verify + folders AE-P11 | D-33 |
| FIL-FR-007 | Restore from trash | Restore puts an item back in its original folder; if that folder is gone or trashed, the item goes to the root and the user is told. Restoring a folder restores its subtree. | Done (items) | `ItemRow.tsx:71`; `e2e/document.spec.ts:46`; `e2e/presentation-cross-feature.spec.ts:227` | Re-verify + folders AE-P11 | — |
| FIL-FR-008 | Global search | The list's search box queries **SVC-SEARCH** (owned by M09) scoped to the current folder, view or the whole workspace. No second search engine in M08. | Partial | `ItemListPage.tsx:34-35`: title substring over the current list only; no test found | AE-P7 (first indexer) / AE-P12 | D-17 |
| FIL-FR-009 | Filters | Filter by kind, tag (any/all), folder subtree, favourite, date edited/opened/created ranges and, once M06 exists, classroom-linked state. Filters combine with search. | Partial | `ItemListPage.tsx:33,136-154`: kind chips on /files only; untested | AE-P11 | — |
| FIL-FR-010 | Sorting | Sort by name, date edited, date created, date opened, size and kind, ascending or descending; remembered per view per device. Folders listed before items. | Partial | `ItemListPage.tsx:16,36-42,90-96`: 3 orders, descending only, not persisted, no sort on Recent; no test found | AE-P11 | — |
| FIL-FR-011 | Previews | Thumbnail per item in grid view and a preview pane in list view, produced by per-kind preview providers through SVC-HOST-style injection and cached as attachments (SVC-BLOB). | **Absent** | `ItemRow.tsx:28-41` shows kind icon, title, time and size only | AE-P11 | — |
| FIL-FR-012 | Bulk operations | Multi-select (click, Shift-range, Ctrl/Cmd, Select all, keyboard, touch long-press). Bulk move, tag/untag, favourite/unfavourite, trash, restore, delete forever, export. Each bulk operation is all-or-nothing. | Partial | Empty trash only: `ItemListPage.tsx:129-133` → `purgeItems` (`apps/web/src/lib/storage.ts:260`) → `purgeMany` in one transaction (`types.ts:183`); `storage-hardening.test.tsx:416-443` | AE-P11 | — |
| FIL-FR-013 | Import | Import from the File Manager into the current folder, by button or drag-and-drop, dispatched through the SVC-IO import registry by content sniffing. Every loss is reported (existing import-notes pattern). | Partial | Documents `ImportDocument.tsx` via `ItemListPage.tsx:108-112`; diagrams `ItemListPage.tsx:51-68,97-107`; backup JSON `SettingsPages.tsx:246-300`. No PPTX, PDF or generic files; no drag-and-drop; only on per-kind pages, not /files | AE-P11 (PPTX per D-19, PDF in AE-P8) | D-19, D-20 |
| FIL-FR-014 | Export | Export one item (each kind's native and interchange formats, via SVC-IO) or a selection (proposed: one ZIP of native files, or a partial backup) from the list. | Partial | Per-item exports inside editors only; whole-workspace backup `SettingsPages.tsx:234-244`; downloads via `packages/ui/src/download.ts` | AE-P11 | — |
| FIL-FR-015 | Backup | Whole-workspace backup includes folders, tags, item organisation fields and tombstones (backup format 3, proposed in ADR-0017). Manual; scheduled backups per D-34. | Done (format 2, items only) | `SettingsPages.tsx:229-281`; `backup.ts:6`; `e2e/backup-restore.spec.ts:85`; ADR 0007. Preferences not included | Format 3 AE-P3 design, AE-P8/AE-P11 | D-34 |
| FIL-FR-016 | Restore from backup | Never overwrites; all-or-nothing validation; format 2 files still import; folder and tag conflicts resolved by id, with "(restored)" copies on divergence, as for items. | Done (format 2) | `backup.ts` validateBackup; `indexeddb.ts:930-1008` (importBackup); `e2e/backup-restore.spec.ts:85` | Re-verify + format 3 | D-34 |
| FIL-FR-017 | Version history | Open an item's history from the list (row menu or bulk-free action), preview a version read-only, restore it. Compare is a candidate per kind, not required. | Partial | `EditorFrame.tsx:398-472` (list and restore inside the editor); `packages/local-storage/src/kinds.test.ts:111,133` (restoreVersion); `e2e/presentation-cross-feature.spec.ts:210-211` (dialog opens); `EditorFrame.test.tsx:167-177` (load-failure message only); ADR 0005. No preview, compare, naming or deletion; not reachable from the list | AE-P11 | — |
| FIL-FR-018 | Storage usage | Storage page and File Manager summary show real byte counts per kind, split into current content, versions, attachments, drafts and safety copies, against `navigator.storage.estimate()` quota. | Partial | `SettingsPages.tsx:64-227` (estimate at :81); `Dashboard.tsx:187-195` counts only. `sizeBytes` = `JSON.stringify(content).length` (`indexeddb.ts:296-299`): characters, not bytes; excludes attachments and versions | AE-P11 | — |
| FIL-FR-019 | Reliable and recoverable | Every operation is atomic (one IndexedDB transaction per user action), reversible (undo toast for moves, tags, favourite and trash; trash for deletions; confirmation for purge), and safe across tabs (BroadcastChannel notification, optimistic concurrency for content). | Partial | Purge confirmation `ItemListPage.tsx:187-209`; all-or-nothing `purgeMany`; error toasts `ItemRow.tsx:15-23`; drafts (`apps/web/src/pages/settings/UnsavedDrafts.tsx`). Folders, moves, tags and bulk actions do not exist yet | AE-P3 / AE-P11 | D-07 |
| FIL-FR-020 | Move items and folders | Move by menu, drag-and-drop and keyboard ("Move to…" dialog with folder tree). Moves are metadata: they do not bump content `version` or `updatedAt`. | **Absent** | `FEATURE_STATUS.md:175` ("no folders or move") | AE-P11 | D-11 |
| FIL-FR-021 | Subjects as a folder role | A folder may carry `role: 'subject'` (ADR-0016, proposed). Subjects are the shared concept for Notebook subjects (NBK-FR-002), Dashboard subject overview (DSH-FR-013) and the mapping to classroom subjects (M06, D-11). | **Absent** | — | AE-P3 (model) / AE-P7 (first consumer) | D-11 |
| FIL-FR-022 | All kinds organised | Every current and future content kind (notebook, pdf; ADR-0015 (a)) appears in the File Manager with folder, tag, favourite, trash, preview, import and export support from the day the kind ships. | Partial | 3 kinds via `MODULE_LIST` (`apps/web/src/modules.tsx:38-109`); no notebook or pdf kind (`types.ts:5-7`) | AE-P7, AE-P8, AE-P11 | — |
| FIL-FR-023 | Open-tab and dashboard consistency | Organisation changes made in one tab or view appear in every other open view, open tabs strip and the Dashboard without reload. | Partial | Items: BroadcastChannel `dcos-storage` (`apps/web/src/lib/storage.ts:166-179`); `e2e/cross-tab.spec.ts`. No organisation entities yet | AE-P11 | — |
| FIL-FR-024 | Duplicate (existing, kept) | Duplicate an item into the same folder with the same tags. | Done (no folder) | `ItemRow.tsx:75`; `types.ts:177` duplicate; `indexeddb.ts:812-816`; `packages/local-storage/src/indexeddb.test.ts:94`, `kinds.test.ts:100` | Re-verify AE-P11 | — |
| FIL-FR-025 | Empty and error states | Each view has an empty state with a next action; a read failure says nothing was changed, never shows an empty list. | Partial | Empty states and a read-failure alert exist (`ItemListPage.tsx:159-179, 214-235`), so a failure never shows an empty list. The alert does not say that nothing was changed (`:161`; compare `Dashboard.tsx:148`). No test: `ItemListPage.tsx` 1 of 70 lines covered (`coverage/lcov.info`) | AE-P11 | — |

Rules that apply to every requirement above:

- Organisation metadata (folderId, tagIds, favourite, trash) never counts as an edit. It moves `metaUpdatedAt` (DB v4, ADR-0015, proposed) and never `version` or `updatedAt` (today's rule, `types.ts:17`).
- The File Manager never decides an owner question. Where a requirement depends on D-11, D-17, D-19, D-20, D-32, D-33 or D-34, the default in brackets is the roadmap's proposal and is not adopted until the owner answers.

---

## 4. Non-functional requirements

| ID | Requirement | Target / rule | Linked cross-cutting IDs |
|---|---|---|---|
| FIL-NFR-001 | Atomicity | Each user action (one move, one bulk operation, one tag deletion, one folder trash) is one transaction: all or nothing. A failure leaves data unchanged and says so. | SYS (DATABASE_AND_SYNC_ARCHITECTURE) |
| FIL-NFR-002 | Performance | File Manager list for 5,000 items: first rows visible and interactive within the PERF-001 budget (≤ 1.5 s p95 warm, proposed target, to be measured). Search through SVC-SEARCH within PERF-011 (≤ 300 ms p95 over 5,000 items, proposed target, to be measured). Bulk move of 500 items ≤ 2 s (proposed target, to be measured, reference hardware per D-29). | PERF-001, PERF-011 |
| FIL-NFR-003 | Scalability of rendering | Lists over 200 rows are virtualised; previews load lazily and never block the list. | PERF-001 |
| FIL-NFR-004 | Offline | Every File Manager function except network-backed classroom states works offline. | ADR 0001; PLT |
| FIL-NFR-005 | Upgrade safety | DB v4 adds organisation stores and fields additively, behind the existing safety copy (ADR 0006). Items with no `folderId` sit at the root; no `tagIds` means no tags. Older builds fail closed (VersionError) and never corrupt data. | R-003, R-004, PERF-014 |
| FIL-NFR-006 | Backup compatibility | Backup format 3 must keep all-or-nothing validation and never-overwrite import; builds must still import format 2. | ADR-0017 (proposed) |
| FIL-NFR-007 | Privacy | No organisation operation makes a network request. Tag and folder names stay on the device unless the user shares an item (M07) or submits it (M06). | SEC; `e2e/privacy.spec.ts` to be extended |
| FIL-NFR-008 | Integrity | No folder cycles; no dangling `folderId` (repair to root on read, with a logged activity entry); tag ids on items always exist or are dropped on read with a repair note. | SYS |
| FIL-NFR-009 | Accessibility | WCAG 2.2 AA (A11Y-001, proposed). Every action, including drag-and-drop and multi-select, has a keyboard path; the tree is an ARIA tree; selections are announced. | A11Y-001 |
| FIL-NFR-010 | Honest numbers | Every size shown is bytes, computed the same way everywhere; estimates are labelled as estimates. | R-040 |

---

## 5. UI/UX requirements

| ID | Requirement | Status |
|---|---|---|
| FIL-UX-001 | Layout: folder tree (collapsible) on the left at ≥ 1024 px; breadcrumbs above the list; list or grid toggle; preview pane optional at ≥ 1280 px. At phone width the tree becomes a "Folders" screen and breadcrumbs collapse to "Back to <parent>". | Absent |
| FIL-UX-002 | Views kept: Files (all), per kind, Recent, Favourites, Trash remain reachable from the sidebar at their current routes (`App.tsx:30-36`) so existing links and e2e routes keep working. Folder views use a new route (proposed `#/files/f/<folderId>`). | Partial (routes exist) |
| FIL-UX-003 | Selection model: checkbox per row (visible on hover/focus and always on touch), Shift-click range, Ctrl/Cmd-click toggle, Ctrl/Cmd+A, Escape clears. A selection bar shows the count and the bulk actions. | Absent |
| FIL-UX-004 | Drag and drop: items and folders onto folders in the list, tree or breadcrumbs; files from the OS onto a folder to import. A drop target is highlighted; an invalid drop (cycle) shows why. Keyboard alternative: "Move to…" dialog. | Absent |
| FIL-UX-005 | Undo: moves, tag changes, favourite and trash show a toast with Undo for at least 8 s (proposed). | Absent (trash has restore, not undo) |
| FIL-UX-006 | Confirmation only for irreversible actions (delete forever, empty trash, deleting a tag in use), stating what will happen and that it cannot be undone. | Partial: Done for delete forever and Empty trash (`ItemListPage.tsx:187-209`; exercised by `e2e/cross-tab.spec.ts:25-26`); tags do not exist yet |
| FIL-UX-007 | Tags shown as chips using design tokens; colours meet contrast rules from ADR-0024 (proposed). | Absent |
| FIL-UX-008 | Storage overview: stacked bar per kind with versions, attachments, drafts and safety copies; actions "Free up space" (existing) and "Empty trash". | Partial (`SettingsPages.tsx:64-227`) |
| FIL-UX-009 | Loading and error states use the design-system Skeleton/Spinner (ADR-0024 component list), never a blank card. | Partial (text "Loading…", `ItemListPage.tsx:163-164`) |
| FIL-UX-010 | Mobile: long-press selects; row menu holds Move, Tag, Favourite, Trash, Export, History. | Absent |
| FIL-UX-011 | Copy uses British spelling in prose ("favourites"); existing UI strings "Favorite"/"Favorites" are kept until the owner approves a wording change, because e2e specs select them by name (`e2e/backup-restore.spec.ts:169`). | Partial: UI copy uses US spelling today (`navigation.tsx:43`; `ItemRow.tsx:26,54`; `Dashboard.tsx:174`; `ItemListPage.tsx:225-226`); any wording change waits on D-42 |

All new controls come from `packages/ui` once ADR-0024 adds Tabs, Tooltip, Checkbox, Popover, Skeleton and a DataTable/list with multi-select (AE-P3). R-006 applies if AE-P11 starts before then.

---

## 6. Data model

All structures are **proposed** (ADR-0015, ADR-0016, ADR-0017; Proposed, needs approval). They land in DB v4 in AE-P3. The canonical schema is in [DATABASE_AND_SYNC_ARCHITECTURE.md](./DATABASE_AND_SYNC_ARCHITECTURE.md); if it differs, that document wins.

### 6.1 Item fields added in DB v4 (additive)

| Field | Type | Missing means | Moves `version`/`updatedAt`? | Purpose |
|---|---|---|---|---|
| `folderId` | `string \| null` | root | No (moves `metaUpdatedAt`) | FIL-FR-001, 020 |
| `tagIds` | `string[]` | no tags | No | FIL-FR-003 |
| `metaUpdatedAt` | ISO string | `updatedAt` | — | orders metadata changes for sync (R-008, D-35) |
| `lastOpenedAt` | ISO string \| null | never opened (fall back to `updatedAt` for "Recent") | No; stored outside the content version | FIL-FR-005, D-32 |
| `ownerUserId` | string? | the device's own user (ADR 0002 plan) | No | future M06/M07 |

`ItemSummary` (`types.ts:31`) gains the same fields so lists never read content (today's `item_index` store, `indexeddb.ts:58-72`, `:690-700`).

### 6.2 New stores (DB v4)

| Store | Key | Indexes (proposed) | Notes |
|---|---|---|---|
| `folders` | `id` | `by_parent`, `by_role` | `{ id, name, parentId: string \| null, role: 'folder' \| 'subject', colour?, createdAt, updatedAt, metaUpdatedAt, deletedAt, trashedWith?: string, ownerDeviceId }` |
| `tags` | `id` | `by_name` (unique, case-folded) | `{ id, name, colour, createdAt, updatedAt, metaUpdatedAt }` |
| `tombstones` | `[kind, id]` | `by_purgedAt` | written when an item or folder (`kind: 'folder'`) is purged; consumed by future sync (SYS-034, ADR-0021) |
| `activity` | `id` | `by_at` | SVC-ACT, capped (SYS-046); File Manager writes `org.move`, `org.tag`, `item.trash`, `item.restore`, `item.import` and `item.export` entries |
| (cache) | — | — | Preview thumbnails are attachments (SVC-BLOB) referenced from a small `previews` store, `{ kind, itemId, version, attachmentId }` (DATABASE_AND_SYNC_ARCHITECTURE §3.3), so a thumbnail is regenerated only when the version changes. |

### 6.3 Storage accounting

Proposed: `sizeBytes` becomes a UTF-8 byte count (`new TextEncoder().encode(json).byteLength`) computed in `summarize` (`indexeddb.ts:296-299`), and a separate `StorageUsage` report (§9) adds versions, attachments (from `Blob.size`), drafts and safety copies. Whether to keep the field name `sizeBytes` with corrected meaning or add `contentBytes` is an implementation choice recorded in the AE-P3 ADR.

### 6.4 Trash semantics for folders

- Trashing folder F sets `deletedAt` on F and on every descendant folder and item that is not already trashed, and stamps them `trashedWith = F.id`.
- Restoring F restores exactly the entries stamped with F's id; items trashed earlier on their own stay in the trash.
- Purging F purges its stamped subtree in one transaction (extends `purgeMany`).

### 6.5 Backup format 3 (proposed, ADR-0017)

A ZIP container (fflate 0.8.3 is installed) with a JSON manifest that adds `folders`, `tags` and `tombstones` to the format-2 item, version and attachment data. Folders and tags follow the same never-overwrite rule as items. Format 2 files still import; an item from format 2 lands at the root with no tags.

---

## 7. Technical architecture

```
apps/web (M08 UI)                          shared services
┌───────────────────────────────┐          ┌─────────────────────────────────┐
│ FileManagerPage (from         │──uses───▶│ SVC-ORG  folders, tags, subjects│
│ ItemListPage), FolderTree,    │          │ SVC-ITEM item model, kinds      │
│ SelectionBar, MoveDialog,     │──uses───▶│ SVC-SEARCH (owned by M09)       │
│ PreviewPane, StorageOverview  │          │ SVC-IO   import/export registry │
└──────────────┬────────────────┘          │ SVC-BLOB attachments, previews  │
               │                           │ SVC-BACKUP format 2/3           │
               ▼                           │ SVC-ACT  activity log           │
  apps/web/src/lib (split per AE-P3:       │ SVC-HOST preview providers      │
  storage.ts → organisation.ts,            └──────────────┬──────────────────┘
  search.ts, usage.ts …)                                  ▼
                                           packages/local-storage
                                           StorageAdapter (IndexedDB now,
                                           SQLite proposed, ADR-0019)
```

- **Placement.** SVC-ORG persistence lives in `packages/local-storage` (new adapter methods, §9) so any adapter, including a future SQLite adapter, must implement it and pass the shared adapter conformance suite (SYS-010). The File Manager UI lives in `apps/web`. No studio package imports the File Manager; studios receive organisation data only through the app (host injection pattern, boundaries enforced by `tests/integration/boundaries.test.ts`).
- **One list component.** The existing single list component (`ItemListPage.tsx:20`) is kept as the base so all views behave the same, but split into smaller files (brief §8 rules; R-006).
- **Previews.** A preview registry keyed by kind, injected by `apps/web/src/modules.tsx`: diagrams through `renderDiagramPreview` (`packages/diagram-studio/src/index.ts:11`), presentations through the slide renderer used for export (`packages/presentation-studio/src/export/slideSvg.ts:295`), documents through a text excerpt plus first picture (proposed), notebooks and PDFs from M04/M05 (PDF first page via the M05 engine, ADR-0023). Generation runs off the critical path (idle callback or worker) and results are cached as attachments.
- **Search.** The search box calls SVC-SEARCH with a scope (folder subtree, view, all). Until the index exists (AE-P7/AE-P12) the existing title filter is the fallback.
- **Import/export.** The File Manager calls the SVC-IO registries; it owns only the routing ("into this folder") and the drop zone. Off-main-thread parsing per TD-40.
- **Cross-tab.** Every organisation write posts on BroadcastChannel `dcos-storage` (`apps/web/src/lib/storage.ts:166-179`) with an `org` payload; lists refresh incrementally.
- **Native.** Drag-and-drop from the OS and save dialogs go through SVC-PLAT (TD-28); `<a download>` will not work in webviews.

---

## 8. Dependencies

### 8.1 Modules and services

| Depends on | Why | State today |
|---|---|---|
| SVC-ITEM, SVC-STORE | item model, kind registry, adapter | Done (3 kinds) |
| DB v4 migration (AE-P3) | folders, tags, metadata fields, tombstones, activity | Absent |
| SVC-ORG (defined here, ADR-0016) | folders, tags, subjects | Absent |
| SVC-SEARCH (M09) | search box, filters on content | Absent (title filter only) |
| SVC-BLOB | preview cache; storage accounting | Done (ADR 0008) |
| SVC-IO | import/export registries and loss report | Partial, per studio |
| SVC-BACKUP | backup format 3 | Done (format 2) |
| SVC-ACT | activity entries for organisation actions | Absent |
| SVC-UI (ADR-0024) | tree, checkbox, data table, skeleton, popover | Partial |
| SVC-PLAT | OS drag-and-drop, native save | Partial (TD-28) |
| M04, M05 | new kinds and their previews | Absent |
| M06 | classroom subject mapping (D-11); submission refs | Absent |

Consumers of M08 / SVC-ORG: M04 (subjects, tags NBK-FR-013, favourites NBK-FR-014), M06 (materials by link), M09 (subject overview DSH-FR-013, favourites, storage overview DSH-FR-010), SVC-SEARCH (folder/tag filters). Contract INT-05 in [MODULE_DEPENDENCY_MAP.md](./MODULE_DEPENDENCY_MAP.md).

### 8.2 Libraries

| Library | Use | Status |
|---|---|---|
| idb | IndexedDB access | Installed (8.0.4) |
| fflate | backup format 3 ZIP; multi-item export ZIP | Installed (0.8.3) |
| lucide-react | icons | Installed (0.460.0) |
| A list virtualisation library (for example `@tanstack/react-virtual`) | FIL-NFR-003 | Candidate, licence to verify; original code is the alternative |
| A drag-and-drop helper (for example `@dnd-kit/core`) | FIL-UX-004 | Candidate, licence to verify; native HTML5 drag-and-drop plus keyboard dialog is the alternative |
| MiniSearch or FlexSearch | via SVC-SEARCH only | Candidate, licence to verify (owned by M09) |

No library is adopted in AE-P1. Every candidate goes through [DEPENDENCY_AND_LICENCE_PLAN.md](./DEPENDENCY_AND_LICENCE_PLAN.md).

---

## 9. API/interface contracts

All interfaces are proposed. SVC-REF, SVC-BLOB and SVC-PERM are referenced, not redefined. Names are illustrative TypeScript; the AE-P3 implementation may rename members but must keep the semantics.

### 9.1 FIL-IF-001: SVC-ORG (defined by M08; shared)

```ts
type FolderRole = 'folder' | 'subject';

interface Folder {
  id: string;
  name: string;
  parentId: string | null;      // null = root
  role: FolderRole;
  colour?: string;               // design-system token name, not a raw hex
  createdAt: string;
  updatedAt: string;
  metaUpdatedAt: string;
  deletedAt: string | null;
  trashedWith?: string;          // id of the folder whose trash action trashed this one
  ownerDeviceId: string;
}

interface Tag { id: string; name: string; colour: string; createdAt: string; updatedAt: string; metaUpdatedAt: string; }

type ItemKey = { kind: ItemKind; id: string };

interface OrganisationService {
  listFolders(opts?: { trashed?: boolean; role?: FolderRole }): Promise<Folder[]>;
  createFolder(input: { name: string; parentId: string | null; role?: FolderRole }): Promise<Folder>;
  renameFolder(id: string, name: string): Promise<void>;
  setFolderRole(id: string, role: FolderRole): Promise<void>;
  /** Refuses a move that would make a folder its own ancestor (OrgCycleError) or exceed max depth. */
  moveFolder(id: string, parentId: string | null): Promise<void>;
  /** Items and folders in one transaction; all or nothing. Metadata only. */
  moveItems(items: ItemKey[], folderId: string | null): Promise<void>;
  trashFolder(id: string): Promise<void>;     // subtree, stamped trashedWith
  restoreFolder(id: string): Promise<void>;   // exactly the stamped subtree
  purgeFolders(ids: string[]): Promise<void>; // subtree, writes tombstones

  listTags(): Promise<Tag[]>;
  createTag(input: { name: string; colour: string }): Promise<Tag>;
  updateTag(id: string, patch: Partial<Pick<Tag, 'name' | 'colour'>>): Promise<void>;
  deleteTag(id: string): Promise<{ itemsUpdated: number }>; // removes from all items, one transaction
  setTags(items: ItemKey[], change: { add?: string[]; remove?: string[] }): Promise<void>;

  /** Writes lastOpenedAt without touching version or updatedAt. */
  markOpened(item: ItemKey, at?: string): Promise<void>;
}
```

### 9.2 FIL-IF-002: StorageAdapter additions and StorageUsage (packages/local-storage)

```ts
interface StorageAdapter /* existing, types.ts:162-209 */ {
  // existing setFavorite/trash/restore/purgeMany keep their contracts
  setFavoriteMany(items: ItemKey[], favorite: boolean): Promise<void>;
  trashMany(items: ItemKey[]): Promise<void>;
  restoreMany(items: ItemKey[]): Promise<void>;
  org: OrganisationService;
  storageUsage(): Promise<StorageUsage>;
}

interface StorageUsage {
  byKind: Record<ItemKind, { items: number; contentBytes: number; versionBytes: number; versions: number }>;
  attachments: { count: number; bytes: number; unreferencedBytes: number };
  drafts: { count: number; bytes: number };
  safetyCopies: { names: string[]; bytesEstimate: number | null };
  trash: { items: number; bytes: number };
  quota: { usage: number | null; quota: number | null; persisted: boolean | null }; // navigator.storage
  computedAt: string;
}
```

Every new adapter method is added to the shared adapter conformance suite (SYS-010).

### 9.3 List query used by the UI

```ts
interface FileQuery {
  scope: { type: 'all' } | { type: 'folder'; folderId: string | null; recursive: boolean }
       | { type: 'recent' } | { type: 'favourites' } | { type: 'trash' };
  kinds?: ItemKind[];
  tagIds?: { ids: string[]; mode: 'any' | 'all' };
  favourite?: boolean;
  dateRange?: { field: 'updatedAt' | 'createdAt' | 'lastOpenedAt'; from?: string; to?: string };
  text?: string;                  // delegated to SVC-SEARCH when the index exists
  sort: { field: 'title' | 'updatedAt' | 'createdAt' | 'lastOpenedAt' | 'size' | 'kind'; direction: 'asc' | 'desc' };
}
```

The persisted per-view sort and filter preference is a per-device convenience in `localStorage` (like `dcos.openTabs`), wrapped in try/catch and never required for correctness.

### 9.4 Preview provider (SVC-HOST pattern)

```ts
interface PreviewProvider<C = unknown> {
  kind: ItemKind;
  /** Pure: same content and options, same image. Must not fetch from the network. */
  render(content: C, opts: { width: number; height: number; theme: 'light' | 'dark' }): Promise<Blob | null>;
}
```

Results stored through SVC-BLOB `putAttachment` (deduplicated by SHA-256, ADR 0008), so identical thumbnails cost one record.

### 9.5 Import/export (via SVC-IO)

```ts
interface FileManagerImport {
  importFiles(files: File[], target: { folderId: string | null; tagIds?: string[] }): Promise<ImportOutcome[]>;
}
interface ImportOutcome { fileName: string; item?: ItemKey; notes: string[]; error?: string }
```

The File Manager never parses formats itself; it hands each file to the SVC-IO registry and places the result.

### 9.6 Services referenced, not defined here

- **SVC-REF** (ADR-0018): File Manager shortcuts and "Attach to assignment" produce `ItemRef { mode: 'link' }`; a dangling reference renders "missing item" and never crashes.
- **SVC-SEARCH** (M09 PRD §9): queries and results.
- **SVC-PERM** (ADR-0020): only applies when a reference crosses a host boundary (M06/M07); the local File Manager has no permission checks because there is one local user.
- **SVC-ACT**: event shape owned by SYSTEM_ARCHITECTURE; File Manager emits `org.move`, `org.tag`, `item.trash`, `item.restore`, `item.import`, `item.export`.

---

## 10. Acceptance criteria

Numbers mirror the requirement IDs (§4.3 of the canonical brief): NFR criteria use 500 + n, UX criteria 700 + n, interface criteria 900 + n (FIL-IF-NNN, §9). Unless a row names browsers, "e2e" means the Chromium, Firefox and WebKit Playwright projects (ACCEPTANCE_CRITERIA §1.3), plus mobile Chromium for phone-width and touch checks; a criterion is not met while Firefox is not green in CI (R-001, D-03). This table is the canonical wording of the module's criteria; [ACCEPTANCE_CRITERIA.md](ACCEPTANCE_CRITERIA.md) §4 only summarises them and owns the cross-cutting criteria (AC-SYS, AC-SEC, AC-PERF, AC-INT and others) (ACCEPTANCE_CRITERIA §1.2). A change to a criterion here is made in ACCEPTANCE_CRITERIA §4 in the same edit. "Re-verify: yes" marks v0.2-Done items that must be checked again.

| AC ID | Verifies | Criterion | Evidence type | Phase | Re-verify |
|---|---|---|---|---|---|
| AC-FIL-001 | FIL-FR-001 | Create, rename and delete a folder; an item created in a folder is listed there after reload and in a backup round trip. | unit + e2e (Chromium, WebKit, Firefox) | AE-P11 (data AE-P3) | — |
| AC-FIL-002 | FIL-FR-002 | Folders nest to depth 16; a move that would create a cycle is refused with a message and changes nothing. | unit + e2e | AE-P11 | — |
| AC-FIL-003 | FIL-FR-003 | Create, rename, recolour and delete tags; deleting a tag removes it from every item in one transaction; filter by tag returns exactly the tagged items. | unit + e2e | AE-P11 | — |
| AC-FIL-004 | FIL-FR-004 | Starring changes neither `version` nor `updatedAt`, appears in Favourites and the Dashboard, survives reload and backup. | unit + e2e | AE-P11 | yes |
| AC-FIL-005 | FIL-FR-005 | Opening an item without editing moves it to the top of Recent (if D-32 = last opened) and does not change `updatedAt`. | unit + e2e | AE-P11 (field AE-P3) | — |
| AC-FIL-006a | FIL-FR-006 | Trashing an item hides it from all non-trash views and keeps its versions; it is listed in Trash. | e2e | AE-P11 | yes |
| AC-FIL-006b | FIL-FR-006 | Trashing a folder trashes its whole subtree as one unit; the trash shows the folder with its count. | unit + e2e | AE-P11 | — |
| AC-FIL-006c | FIL-FR-006 | Retention behaves as D-33 decides (keep forever, or purge after N days with notice). | unit | AE-P11 | — |
| AC-FIL-007 | FIL-FR-007 | Restore returns an item to its original folder; if that folder is gone it goes to the root and the user is told; restoring a folder restores exactly its stamped subtree. | unit + e2e | AE-P11 | yes |
| AC-FIL-008 | FIL-FR-008 | The list search uses SVC-SEARCH, honours the current scope and matches content (per D-17), not only titles. | integration + e2e | AE-P12 | — |
| AC-FIL-009 | FIL-FR-009 | Each filter (kind, tag any/all, folder subtree, favourite, date ranges) and their combinations return exactly the expected items on a seeded library. | unit + e2e | AE-P11 | — |
| AC-FIL-010 | FIL-FR-010 | All sort fields work in both directions, folders first, and the choice is remembered per view after reload. | unit + e2e | AE-P11 | — |
| AC-FIL-011 | FIL-FR-011 | Each shipped kind shows a thumbnail generated without network access; a thumbnail is regenerated only when the item's version changes; a failed render shows the kind icon. | unit + e2e | AE-P11 | — |
| AC-FIL-012 | FIL-FR-012 | Select by mouse, keyboard and touch; each bulk action applies to all selected items or, on an injected failure, to none. | unit + e2e (incl. mobile Chromium) | AE-P11 | — |
| AC-FIL-013 | FIL-FR-013 | Importing (button and drag-and-drop) a DOCX, ODT, .dcosdoc, .drawio and .dcosdiagram into a folder places the new item in that folder, with the same loss notes as today. | e2e | AE-P11 | yes (existing importers) |
| AC-FIL-014 | FIL-FR-014 | Export one item and a selection from the list; the selection export opens and re-imports with the same content. | e2e + import/export | AE-P11 | — |
| AC-FIL-015 | FIL-FR-015 | A backup contains items, versions, attachments, folders, tags and tombstones; it is validated all-or-nothing. | unit + e2e | AE-P11 (format AE-P3/AE-P8) | yes |
| AC-FIL-016a | FIL-FR-016 | Restoring into an empty profile reproduces folders, tags and placement; restoring into a populated profile never overwrites and creates "(restored)" copies on divergence. | e2e (Chromium, WebKit, Firefox) | AE-P11 | yes |
| AC-FIL-016b | FIL-FR-016 | A format-2 backup still imports; items land at the root with no tags. | integration | AE-P3 | — |
| AC-FIL-017 | FIL-FR-017 | Version history opens from the list; a version can be previewed read-only and restored; restoring keeps a pre-restore copy (ADR 0005). | e2e | AE-P11 | yes |
| AC-FIL-018 | FIL-FR-018 | Storage overview totals match an independent byte count on a seeded workspace (content as UTF-8 bytes, versions, attachments, drafts) within 1 %. | integration + measurement | AE-P11 | — |
| AC-FIL-019 | FIL-FR-019 | For every organisation action, an injected transaction failure leaves the data exactly as before and shows an error that says nothing changed; move, tag, favourite and trash offer Undo. | unit + e2e | AE-P11 | — |
| AC-FIL-020 | FIL-FR-020 | Move by menu, drag-and-drop and keyboard dialog; a move changes no content `version`. | e2e | AE-P11 | — |
| AC-FIL-021 | FIL-FR-021 | A folder marked as subject appears in Notebook subject lists and the Dashboard subject overview with the same id. | integration | AE-P7 / AE-P12 | — |
| AC-FIL-022 | FIL-FR-022 | Notebook and PDF items support folder, tag, favourite, trash, preview, import and export in the File Manager on the day each kind ships. | e2e | AE-P7, AE-P8 | — |
| AC-FIL-023 | FIL-FR-023 | A move or tag change in tab A appears in tab B's list and on the Dashboard without reload. | e2e (cross-tab) | AE-P11 | — |
| AC-FIL-024 | FIL-FR-024 | Duplicate keeps folder and tags; title gets the existing " (copy)" suffix (`indexeddb.ts:815`). | unit | AE-P11 | yes |
| AC-FIL-025 | FIL-FR-025 | A storage read failure on any File Manager view shows the "nothing changed" alert, never an empty list. | unit | AE-P11 | — |
| AC-FIL-501 | FIL-NFR-001 | Each bulk operation runs in one transaction (verified with fake-indexeddb failure injection). | unit | AE-P3 / AE-P11 | — |
| AC-FIL-502 | FIL-NFR-002 | List of 5,000 items meets PERF-001; scoped search meets PERF-011; bulk move of 500 items meets its target, on D-29 reference hardware. | measurement | AE-P11 / AE-P13 | — |
| AC-FIL-503 | FIL-NFR-003 | A list of more than 200 rows renders only the visible rows (virtualised), and scrolling stays responsive while previews load lazily. | unit + e2e (Chromium) + measurement | AE-P11 | — |
| AC-FIL-504 | FIL-NFR-004 | All File Manager actions work with the network off. | e2e (offline, Chromium) | AE-P11 | — |
| AC-FIL-505 | FIL-NFR-005 | v3→v4 upgrade on 1,000 items keeps every item at the root with no tags, makes a safety copy and meets PERF-014; an older build fails closed. | upgrade test (real browser) | AE-P3 | — |
| AC-FIL-506 | FIL-NFR-006 | Format 3 round trip and format 2 import both pass the never-overwrite tests. | integration | AE-P3 / AE-P8 | — |
| AC-FIL-507 | FIL-NFR-007 | `e2e/privacy.spec.ts` extended with folder, tag, bulk, import and export flows finds no cross-origin request. | e2e | AE-P11 | — |
| AC-FIL-508 | FIL-NFR-008 | Corrupted organisation data (cycle, dangling folderId, unknown tag id) is repaired on read without data loss and logged. | unit | AE-P3 | — |
| AC-FIL-509 | FIL-NFR-009 | Keyboard-only path for every action; tree uses ARIA tree semantics; automated axe check (if D-25 approves) has no serious violations. | e2e + manual screen-reader pass | AE-P11 / AE-P15 | — |
| AC-FIL-510 | FIL-NFR-010 | Every displayed size is computed by one function and labelled bytes or "estimate". | unit | AE-P11 | — |
| AC-FIL-701 … 711 | FIL-UX-001 … 011 | Each UX requirement verified at 375, 768, 1024 and 1440 px in light and dark themes. | e2e (screenshots) + manual | AE-P11 | 702, 706: yes |
| AC-FIL-901 | FIL-IF-001 (§9.1 SVC-ORG) | The OrganisationService contract passes the shared adapter conformance suite for every adapter. | unit (conformance) | AE-P3 | — |
| AC-FIL-902 | FIL-IF-002 (§9.2 StorageUsage) | `storageUsage()` matches AC-FIL-018 on every adapter. | unit (conformance) | AE-P11 | — |

---

## 11. Test strategy

| Level | Scope | Location (proposed) | Notes |
|---|---|---|---|
| Unit | SVC-ORG operations, cycle detection, trash subtree stamping, tag deletion, query filtering and sorting, byte accounting | `packages/local-storage/src/org.test.ts`, `apps/web/src/pages/files/*.test.tsx` | Today `ItemListPage.tsx` has 1/70 lines covered; add a per-file coverage floor for the new organisation code and enforce `test:coverage` in CI (D-38) |
| Integration | Backup format 3 and format 2 import; preview providers per kind; SVC-SEARCH scope filters; conformance suite (SYS-010) | `tests/integration/` | Conformance suite runs against IndexedDB now and SQLite later |
| Browser (component) | Selection model, tree keyboard navigation, drag-and-drop fallbacks | Vitest + jsdom where possible | Drag-and-drop end-to-end needs Playwright |
| End-to-end | Folder lifecycle; bulk actions; import into folder by drop; export selection; restore into empty and populated profiles; cross-tab updates | `e2e/files-*.spec.ts` | Chromium, WebKit, Firefox (after PR #1 / D-03), mobile Chromium for touch |
| Persistence | Reload, browser relaunch (Chromium-only spec today, `e2e/storage.chromium-only.spec.ts:27`) with folders and tags | e2e | — |
| Offline | Every organisation action with `context.setOffline(true)` | e2e (Chromium) | Extend the existing offline spec |
| Import/export | Each importer reached from the File Manager; selection export round trip | e2e + integration | Existing importers are re-verified, not re-written |
| Upgrade / migration | v3→v4 with 1,000 items; older build fails closed | `scripts/upgrade-test.mjs` (update hard-coded store lists at :64-65) | Chromium only today; propose CI scheduled job (D-38) |
| Regression | All current list behaviour: routes, empty states, error alert, purge confirmation, favourite metadata rule | unit + e2e | Write the missing tests for list search, sort and kind filter **before** changing `ItemListPage` |
| Accessibility | Keyboard paths, ARIA tree, focus after bulk actions, announced counts, contrast of tag chips | e2e + axe (D-25) + manual screen reader (AE-P15) | A11Y-001 |
| Performance | 1,000 and 5,000-item libraries: list render, scroll, search, bulk move | measurement harness from AE-P3 | PERF-001, PERF-011 proposed targets, to be measured |
| Security / privacy | No network calls; import size caps applied via SVC-IO; tag and folder names escaped wherever rendered | e2e privacy spec, unit | SEC items in SECURITY_AND_PRIVACY_PLAN |

---

## 12. Known risks

### 12.1 From the risk register (canonical seed)

| ID | Risk | Why it matters for M08 |
|---|---|---|
| R-003 | DB v4 and later migrations on live users' data; older and cached builds fail closed | Folders, tags and metadata fields arrive in DB v4 on the live Pages site |
| R-004 | No down-migrations | DB v4 is additive, but the File Manager is the first heavy user of new stores |
| R-006 | Design-system work multiplies inconsistencies if modules start before packages/ui is extended | Tree, checkbox, data table and skeleton are missing today |
| R-008 | Sync correctness: no tombstones; metadata changes do not move updatedAt | Moves and tags are metadata; `metaUpdatedAt` and tombstones are required before M07 (D-35) |
| R-019 | Documentation drift | FEATURE_STATUS row 175 and stale rows must not be repeated |
| R-021 | Scope size | M08 is late (AE-P11) but its data model is needed in AE-P3 |
| R-024 | Large PDFs exceed backup format 2 | Backup format 3 is a prerequisite for a reliable full-workspace backup |
| R-034 | No performance baselines | List and search performance unmeasured |
| R-036 | Accessibility debts inherited | Mobile drawer and contrast defects affect every File Manager screen |
| R-040 | `sizeBytes` is a character count | The storage overview would mislead until fixed |

### 12.2 Module-specific risks (numbered in RISK_REGISTER.md as R-081 to R-086, in this order)

| ID | Risk | L | I | Mitigation |
|---|---|---|---|---|
| R-081 | Folder trash semantics confuse users (item trashed alone vs with its folder) | M | M | `trashedWith` stamping; restore message names what came back; e2e for both paths |
| R-082 | Organisation model chosen in D-11 changes after AE-P3 ships DB v4 | M | H | Decide D-11 before AE-P3 exit; keep `folderId` and `tagIds` additive so a later "multiple parents" option is a further additive migration |
| R-083 | Preview generation slows the list on low-end devices or large items | M | M | Lazy, cached, off-main-thread rendering; size caps; icon fallback |
| R-084 | Drag-and-drop from the OS behaves differently in Tauri and Android webviews | H | M | Keyboard/menu alternatives always present; SVC-PLAT adapters; AE-P14 device tests |
| R-085 | Renaming the UI string "Favorites" to "Favourites" breaks e2e selectors and user habit | L | L | Owner decision D-42; change strings and tests together |
| R-086 | No "generic file" kind, while the brief lists "Files" in search and "Import" in File Manager | M | M | Owner question D-43: whether arbitrary files (images, spreadsheets) become an item kind stored as attachments. Default: out of scope for v1.0.0 unless approved |

### 12.3 Owner decisions this module waits on

D-07 (reversibility), D-11 (organisation model), D-17 (search scope), D-19 (PPTX import), D-20 (PDF limits), D-25 (axe), D-29 (reference hardware), D-32 (Recent meaning), D-33 (trash retention), D-34 (backups), D-35 (tombstones and metaUpdatedAt in DB v4), D-42 ("Favorites" wording) and D-43 (generic "file" kind). D-42 and D-43 were raised by this PRD and numbered in the roadmap's decision list.
