# M09 Unified Dashboard and Workspace: product requirements

This document specifies Module 09 (prefix DSH), the Unified Dashboard and Workspace. It upgrades the existing dashboard (`apps/web/src/pages/Dashboard.tsx`) into the home screen for every module: continue working, recent work per kind, favourites, quick actions, assignments and deadlines, an activity timeline, storage and backup status, and classroom and subject overviews. M09 also owns **Global Search (SVC-SEARCH)**, the one search service for all kinds, which the File Manager (FIL-FR-008), the Notebook (NBK-FR-012) and every other module use. It sets the workspace-level user experience (themes, responsive layout, customisation, app-level shortcuts, accessible navigation) on top of the shared design system (SVC-UI). Everything the current dashboard does well must keep working (DSH-UX-048).

Status: AE-P1 draft for owner approval (2026-11-15)

Related documents in this folder:
[Product roadmap](./ADVANCED_EDITION_PRODUCT_ROADMAP.md) ·
[M08 File Manager PRD](./MODULE_08_FILE_MANAGER_PRD.md) ·
[M04 Digital Notebook PRD](./MODULE_04_DIGITAL_NOTEBOOK_PRD.md) ·
[M05 PDF Studio PRD](./MODULE_05_PDF_STUDIO_PRD.md) ·
[M06 Classroom Hub PRD](./MODULE_06_CLASSROOM_HUB_PRD.md) ·
[M07 Collaboration PRD](./MODULE_07_COLLABORATION_PRD.md) ·
[System architecture](./SYSTEM_ARCHITECTURE.md) ·
[Database and sync architecture](./DATABASE_AND_SYNC_ARCHITECTURE.md) ·
[Module dependency map](./MODULE_DEPENDENCY_MAP.md) ·
[Acceptance criteria](./ACCEPTANCE_CRITERIA.md) ·
[Security and privacy plan](./SECURITY_AND_PRIVACY_PLAN.md) ·
[Dependency and licence plan](./DEPENDENCY_AND_LICENCE_PLAN.md) ·
[Risk register](./RISK_REGISTER.md) ·
[Release strategy](./RELEASE_STRATEGY.md)

Phase names follow the canonical brief: **AE-P1 … AE-P16** are Advanced Edition phases; "v0.2 Phase n" refers to the earlier programme. Design-system and shell foundations are built in **AE-P3**, the first search indexer in **AE-P7**, and the module itself, with global search and cross-module verification, in **AE-P12**.

---

## Current state

Main file: `apps/web/src/pages/Dashboard.tsx` (202 lines). It has no unit test file of its own; four Dashboard rendering tests live in `apps/web/src/presentation-shell.test.tsx:87-126`, two more in the same file test its exports `QUICK_START` and `storedSentence` (`:76`, `:82`), and the `#/` route is checked by `e2e/navigation.spec.ts:5,27-28`. Coverage: 29 of 32 lines (`coverage/lcov.info`, file dated 2026-11-15). Shell: `apps/web/src/components/AppShell.tsx`; design system: `packages/ui`.

| Group | IDs and status |
|---|---|
| Dashboard | DSH-FR-001 continue working: Partial (8 mixed recent items; open tabs not used) |
| Dashboard | DSH-FR-002 recent documents, 003 recent diagrams, 004 recent presentations: Partial (one mixed list) |
| Dashboard | DSH-FR-005 favourites: Done (6 items) |
| Dashboard | DSH-FR-006 quick actions: Done (no double-click guard, Dashboard.tsx:118) |
| Dashboard | DSH-FR-007 upcoming assignments, 008 deadlines, 009 activity timeline: Absent |
| Dashboard | DSH-FR-010 storage overview: Partial (counts only) |
| Dashboard | DSH-FR-011 backup status: Partial (DataSafetyCard can render empty) |
| Dashboard | DSH-FR-012 classroom overview, 013 subject overview: Absent |
| Global search | DSH-FR-020 documents, 021 diagrams, 022 presentations, 026 files: Partial (title only, per list) |
| Global search | DSH-FR-023 notebooks, 024 PDFs, 025 assignments: Absent |
| UX | DSH-UX-040 premium design: Unverified (subjective; no design review) |
| UX | DSH-UX-041 light theme: Done |
| UX | DSH-UX-042 dark theme: Partial (dark danger button 2.77:1) |
| UX | DSH-UX-043 responsive: Partial (no tablet checks) |
| UX | DSH-UX-044 customisable workspace: Absent |
| UX | DSH-UX-045 shortcuts: Partial (editor-level only) |
| UX | DSH-UX-046 accessible navigation: Partial (no skip link; drawer lacks Escape, focus trap and dialog role, TD-25) |
| UX | DSH-UX-047 consistent design system: Partial |
| UX | DSH-UX-048 preserve existing dashboard functions: Done (baseline that must not regress) |

Global search is owned by M09 (SVC-SEARCH). FIL-FR-008 and NBK-FR-012 use the same service. No second search engine is specified anywhere.

"Done" means Done for v0.2 with the recorded local run of 2026-11-15 (RELEASE_GAPS.md §11); nothing was re-run in AE-P1. Every Done item is re-verified against its AC-DSH criterion in AE-P12 ("re-verify: yes"). Integration contracts INT-06 (open recent work from the dashboard) and INT-09 (search all content) are Partial today (MODULE_DEPENDENCY_MAP).

---

## 1. Product objectives

| # | Objective | Measured by |
|---|---|---|
| O1 | Let a user resume work in one click, from the place they left it, across every kind. | DSH-FR-001…004; INT-06 |
| O2 | Make one search box find any item by title or content, across every kind that exists, offline. | DSH-FR-020…031; INT-09; PERF-011 (proposed target, to be measured) |
| O3 | Show the state of the user's academic work at a glance: what is due, what changed, what is at risk (storage, backup). | DSH-FR-007…013 |
| O4 | Never regress what works today: quick start, recent work, favourites, data-safety card, counts, error-not-empty behaviour. | DSH-UX-048 and its regression ACs |
| O5 | Provide a consistent, accessible, responsive workspace (themes, shortcuts, navigation) on the shared design system. | DSH-UX-040…050; A11Y-001 |
| O6 | Show only working features: panels for modules that do not exist are hidden (D-31, proposed). | DSH-FR-014 |

Out of scope for M09: the classroom data itself (M06 owns it; the dashboard reads the client cache), content editing, organisation (M08 / SVC-ORG), and per-kind text extraction logic beyond the contract (each module supplies its extractor).

---

## 2. User stories

| ID | As a … | I want to … | So that … | Requirements |
|---|---|---|---|---|
| US-DSH-01 | student | see what I was working on, including tabs I left open | I continue in one click | DSH-FR-001 |
| US-DSH-02 | student | see recent documents, diagrams and presentations (and notebooks and PDFs once they exist) in separate groups | I find the right kind quickly | DSH-FR-002…004, 015 |
| US-DSH-03 | student | keep my favourites on the home screen | important work is always one click away | DSH-FR-005 |
| US-DSH-04 | student | start a lab report, flowchart or lecture deck from a template in one click | I start without setup | DSH-FR-006 |
| US-DSH-05 | student | see upcoming assignments and deadlines from my classes | I do not miss a submission | DSH-FR-007, 008 |
| US-DSH-06 | student | see a timeline of what I changed, imported, restored or submitted | I can trace my work | DSH-FR-009 |
| US-DSH-07 | student | see whether my work is protected (persistent storage, last backup) and how much space it uses | I act before data is lost | DSH-FR-010, 011 |
| US-DSH-08 | teacher | see an overview of my classrooms (submissions waiting, announcements) | I know what to review | DSH-FR-012 |
| US-DSH-09 | student | see my subjects with their recent items and due work | my work is organised by subject | DSH-FR-013 |
| US-DSH-10 | student | press one shortcut and search titles and contents of everything | I find a fact I wrote weeks ago | DSH-FR-020…031, DSH-UX-045 |
| US-DSH-11 | student | arrange, hide or pin dashboard panels | the home screen fits how I work | DSH-UX-044 |
| US-DSH-12 | keyboard or screen-reader user | skip to content, navigate the drawer and search without a mouse | I can use the app fully | DSH-UX-046 |
| US-DSH-13 | existing user | find everything where it was | the upgrade does not cost me time | DSH-UX-048 |

---

## 3. Functional requirements

ID blocks (canonical brief §4.2): Dashboard 001–019, Search 020–039, UX 040–059. The IDs from the canonical brief are fixed. Added IDs use free numbers in the right block and are marked "added in AE-P1"; UX requirements are in §5.

### 3.1 Dashboard (001–019)

| ID | Requirement | Detail | Current status | Evidence (anything not Absent) | Phase | Decision |
|---|---|---|---|---|---|---|
| DSH-FR-001 | Continue working | A "Continue" strip of the user's open tabs (up to 12) and the most recently opened items, each opening the item where it was left (editor route). | Partial | `Dashboard.tsx:130-168` "Recent work": first 8 of `listAll`, newest `updatedAt` (`indexeddb.ts:696-700`). Open tabs exist (`apps/web/src/lib/openTabs.ts:15`, `getOpenTabs` :46) but the dashboard does not use them | AE-P12 (lastOpenedAt AE-P3) | D-32 |
| DSH-FR-002 | Recent documents | Per-kind recent group, default 5 items, "View all" to the kind list sorted by the D-32 meaning. | Partial | One mixed list (`Dashboard.tsx:165`); per-kind list at `#/documents` sorted by last edit (`ItemListPage.tsx:41`) | AE-P12 | D-32 |
| DSH-FR-003 | Recent diagrams | As DSH-FR-002 for diagrams. | Partial | Same as DSH-FR-002 | AE-P12 | D-32 |
| DSH-FR-004 | Recent presentations | As DSH-FR-002 for presentations. | Partial | `Dashboard.tsx:165`; `presentation-shell.test.tsx:88` ("counts presentations and lists them with the others") | AE-P12 | D-32 |
| DSH-FR-005 | Favourites | Up to 6 favourite items (and, if M08 adds it, favourite folders), "View all" to `#/favorites`. | Done | `Dashboard.tsx:84,172-186`. No dedicated test of the panel (audit); favourite toggling covered by `e2e/backup-restore.spec.ts:169-173` | Re-verify AE-P12 | — |
| DSH-FR-006 | Quick actions | "New <kind>" for every shipped kind; quick-start templates; actions guarded against double activation (one item per activation). | Done (no guard) | `Dashboard.tsx:99-105` (New per module), `:69-90, 108-127` (quick start, missing templates left out); `presentation-shell.test.tsx:76,96,110`; `e2e/navigation.spec.ts:27-28`. `create()` at `Dashboard.tsx:118` has no busy guard | AE-P12 (guard AE-P3 if trivial) | — |
| DSH-FR-007 | Upcoming assignments | Assignments from joined classrooms (M06 client cache), sorted by due date, with submission state; opens the assignment or the draft item (SVC-REF link). Hidden until M06 ships (D-31). | **Absent** | — | AE-P12 (after AE-P9) | D-31, D-13 |
| DSH-FR-008 | Deadlines | A combined deadline list (assignment due dates; personal deadlines only if the owner approves a personal due-date field, D-44). Overdue items highlighted. | **Absent** | No date or deadline fields in `WorkspaceItem` (`types.ts:9-29`) | AE-P12 | D-31, D-44 |
| DSH-FR-009 | Activity timeline | Chronological list from SVC-ACT: created, edited (coalesced per session), imported, exported, restored, moved, trashed, submitted, graded. Filter by kind; capped history. | **Absent** | No activity store (`indexeddb.ts:58-72`) | AE-P12 (store AE-P3) | — |
| DSH-FR-010 | Storage overview | Compact summary of the M08 storage report (`StorageUsage`): bytes used vs quota, largest kinds, link to Settings → Storage. | Partial | `Dashboard.tsx:187-195` (`storedSentence`, counts only; tested `presentation-shell.test.tsx:82`). Quota only in Settings (`SettingsPages.tsx:81`) | AE-P12 (data AE-P11) | — |
| DSH-FR-011 | Backup status | Always shows a sentence and, when needed, an action: persistence state, last backup age, reminder per `backupReminderDays`; never an empty card. Scheduled backup status per D-34. | Partial | `Dashboard.tsx:22-58` `DataSafetyCard`. With storage not persisted and no items, only the title "Protect your work" renders (conditions at `:28-29, :36, :39, :42, :44, :49`). `lastBackupAt` is written after the download is started, so it records the export, not a confirmed saved file (`SettingsPages.tsx:237-239`). No test of the card | AE-P12 (empty-card fix AE-P3) | D-34 |
| DSH-FR-012 | Classroom overview | For students: joined classrooms, new announcements, pending work. For teachers: classrooms, submissions waiting for review, upcoming deadlines. Data from the M06 client cache; permission-checked on the host (SVC-PERM). Hidden until M06 ships. | **Absent** | `packages/classroom/README.md` ("Not started") | AE-P12 | D-31, D-13 |
| DSH-FR-013 | Subject overview | Subjects (SVC-ORG folders with `role: 'subject'`, FIL-FR-021) with item counts, recent items and due work; mapped classroom subjects per D-11. | **Absent** | No subject concept in data model or UI | AE-P12 (model AE-P3) | D-11 |
| DSH-FR-014 | Only working panels (added in AE-P1) | A panel for a module or service that does not exist is not shown (no placeholder or "coming soon"). | Done (v0.2) | Quick-start entries whose template is missing are left out (`Dashboard.tsx:86-90`; `presentation-shell.test.tsx:76`); sidebar lists only working modules (`apps/web/src/navigation.tsx:29-37`; `presentation-shell.test.tsx:70`) | Re-verify AE-P12 | D-31 |
| DSH-FR-015 | Recent notebooks and PDFs (added in AE-P1) | Per-kind recent groups for notebook and pdf kinds from the day each ships. | **Absent** | No notebook or pdf kind (`types.ts:5-7`) | AE-P7, AE-P8 | — |
| DSH-FR-016 | Loading state (added in AE-P1) | Each panel shows a skeleton while loading; no blank card. | Partial | `Dashboard.tsx:151` waits for `!loading` but renders nothing in the recent card while loading | AE-P12 | — |
| DSH-FR-017 | Read-failure honesty (added in AE-P1; preserved behaviour) | When storage cannot be read, the dashboard says nothing was changed or removed, never shows an empty dashboard. Applies per panel. | Done | `Dashboard.tsx:142-150`; `presentation-shell.test.tsx:117` | Re-verify AE-P12 | — |
| DSH-FR-018 | Panel isolation (added in AE-P1) | A crash in one panel shows an error in that panel only; the rest of the dashboard and the shell keep working, and "Try again" resets the panel. | Absent | Two error boundaries exist, neither per panel: one around the whole shell and all routes (`App.tsx:26-28`), one around the editor (`EditorPage.tsx:83`). Neither resets (`ErrorBoundary.tsx:33-36`, RG-7/TD-23) | AE-P3 (boundary) / AE-P12 | — |

### 3.2 Global search, SVC-SEARCH (020–039)

| ID | Requirement | Detail | Current status | Evidence | Phase | Decision |
|---|---|---|---|---|---|---|
| DSH-FR-020 | Search documents | Titles and full text (paragraphs, headings, tables, captions, comments, equations as LaTeX source) via the document extractor. | Partial | Title substring per list view (`ItemListPage.tsx:34-35`) | AE-P12 | D-17 |
| DSH-FR-021 | Search diagrams | Titles, shape and connector labels, custom property values. | Partial | Same as DSH-FR-020 | AE-P12 | D-17 |
| DSH-FR-022 | Search presentations | Titles, slide text, table cells, chart titles and series names, speaker notes. | Partial | Same; `e2e/navigation.spec.ts:26` only checks the search field is visible | AE-P12 | D-17 |
| DSH-FR-023 | Search notebooks | Notebook, section, chapter and page titles; page text; bookmarks (NBK-FR-012). | **Absent** | — | AE-P7 (first indexer) | D-17 |
| DSH-FR-024 | Search PDFs | Titles and extracted text layer via pdf.js (M05); scanned pages only if OCR is adopted (D-20). | **Absent** | — | AE-P8 / AE-P12 | D-17, D-20 |
| DSH-FR-025 | Search assignments | Assignment titles, descriptions and announcements from the M06 client cache, filtered by SVC-PERM rules already applied on the host. | **Absent** | — | AE-P12 (after AE-P9) | D-17 |
| DSH-FR-026 | Search files | All items in the File Manager scope, including folder and tag names (SVC-ORG). | Partial | `#/files` title search over 3 kinds (`ItemListPage.tsx:33-35`) | AE-P12 | D-17 |
| DSH-FR-027 | App-wide search entry (added in AE-P1) | A search field in the app header and a command palette opened by Ctrl/Cmd+K from anywhere except text inputs inside editors (where the editor's own find stays). Ctrl/Cmd+K is already bound in the document editor to "Insert or edit a link" (`packages/document-studio/src/DocumentEditor.tsx:211-216`; listed at `SettingsPages.tsx:321`), so the key choice or the editor binding must be settled before AE-P12. | **Absent** | Header has title, offline badge and theme switcher only (`AppShell.tsx:109-118`) | AE-P12 | — |
| DSH-FR-028 | Local search index (added in AE-P1) | Inverted index in a local store, updated on save, rebuilt on demand and after a backup restore; never sent anywhere. | **Absent** | No index; no search library installed (lockfile) | AE-P7 (first indexer) / AE-P12 | D-17 |
| DSH-FR-029 | Results UI (added in AE-P1) | Results grouped by kind, with title, snippet with the match highlighted, location (folder path, slide or page number), and filters by kind, tag and folder; full keyboard navigation; opening a result goes to the match where the editor supports it. | **Absent** | — | AE-P12 | — |
| DSH-FR-030 | Scope rules (added in AE-P1) | Trash excluded by default with an "Include trash" toggle; drafts and version history excluded (proposed); results update when items change. | **Absent** | — | AE-P12 | D-17 |
| DSH-FR-031 | Consistency after delete (added in AE-P1) | A purged item disappears from the index in the same user action; restored backups are indexed before results are claimed complete ("Indexing… n of m" shown). | **Absent** | — | AE-P12 | — |

### 3.3 Preserved dashboard functions (detail for DSH-UX-048)

The baseline that must not regress. Each row is covered by AC-DSH-748 (§10).

| # | Function today | Evidence |
|---|---|---|
| P1 | Time-of-day greeting and one-line description; `#/` resolves (v0.1.0 route) | `Dashboard.tsx:13-16, 94-98`; `e2e/navigation.spec.ts:5` |
| P2 | "New <kind>" button for each module, first one primary, opening the New dialog | `Dashboard.tsx:99-105, 199`; `presentation-shell.test.tsx:96` |
| P3 | Quick start: 6 template tiles with unique labels; a missing template is left out, never a dead button | `Dashboard.tsx:69-90, 108-127`; `presentation-shell.test.tsx:76,110`; `e2e/navigation.spec.ts:28` |
| P4 | Recent work: 8 items with "View all" when there are more | `Dashboard.tsx:130-141, 165` |
| P5 | Empty state with a "New document" action | `Dashboard.tsx:151-163` |
| P6 | Read-failure alert instead of an empty dashboard | `Dashboard.tsx:142-150`; `presentation-shell.test.tsx:117` |
| P7 | Data-safety card: persistence request, backup reminder, "Back up now" link | `Dashboard.tsx:22-58` |
| P8 | Favourites panel: 6 items, "View all" | `Dashboard.tsx:172-186` |
| P9 | "Stored on this device" sentence over every module | `Dashboard.tsx:60-67, 187-195`; `presentation-shell.test.tsx:82` |
| P10 | Item row actions on the dashboard (favourite, duplicate, move to trash) with toasts | `ItemRow.tsx:26, 53-78` |
| P11 | Works offline and with no account | ADR 0001; `e2e/storage.chromium-only.spec.ts:7` |

---

## 4. Non-functional requirements

| ID | Requirement | Target / rule | Linked IDs |
|---|---|---|---|
| DSH-NFR-001 | Dashboard performance | Usable after a warm start with 1,000 items in ≤ 1.5 s p95 (PERF-001, proposed target, to be measured). Cold first load ≤ 4 s on the reference connection with the entry chunk size tracked (PERF-002; today's index chunk 479,352 bytes, from an unverified build). | PERF-001, PERF-002 |
| DSH-NFR-002 | Search performance | Query over 5,000 items ≤ 300 ms p95 (PERF-011, proposed target, to be measured); typing never blocks input (query debounced, index queries off the main thread where the library allows). | PERF-011 |
| DSH-NFR-003 | Index cost | Incremental index update after a save adds no more than 50 ms p95 to the save path and runs after the durable write (proposed target, to be measured); full rebuild of 5,000 items shows progress and can be cancelled. Index memory measured within the PERF-008 heap budget. | PERF-005, PERF-008 |
| DSH-NFR-004 | Offline | Every dashboard panel and search work offline. Classroom panels show the cached state with its age ("Updated 2 h ago"). | ADR 0001 |
| DSH-NFR-005 | Privacy | Dashboard and search make no network request for local data; the index stays on the device and is excluded from shared or submitted content. Classroom data is shown only to users whose host-side permissions allow it. | SEC, SVC-PERM, R-007 |
| DSH-NFR-006 | Resilience | A failing panel or a corrupt index never blocks the dashboard: the panel shows an error, search falls back to title filtering and offers "Rebuild index". | DSH-FR-018 |
| DSH-NFR-007 | Upgrade safety | New stores (activity, search index, layout if stored in the DB) are additive, behind the safety copy; a missing or older index is rebuilt, never migrated in place. | R-003, ADR 0006 |
| DSH-NFR-008 | Accessibility | WCAG 2.2 AA (A11Y-001, proposed); keyboard-only paths; `prefers-reduced-motion` respected in the shell. | A11Y-001 |
| DSH-NFR-009 | Consistency | Dashboard, File Manager and search show the same counts, sizes and "recent" order for the same data. | FIL-NFR-010, D-32 |

---

## 5. UI/UX requirements

| ID | Requirement | Current status | Evidence / gap | Phase |
|---|---|---|---|---|
| DSH-UX-040 | Premium modern design (brief: "Premium modern SaaS design"). Made testable as: a design review against ADR-0024 tokens and components, recorded with dated screenshots in light and dark at 375, 768, 1024 and 1440 px, approved by the owner. | **Unverified** | Subjective; no design review exists. Inter Variable font and cards exist (`apps/web/src/index.css:2`; `packages/ui/src/components.tsx`) | AE-P12 (review), AE-P3 (tokens) |
| DSH-UX-041 | Light theme | Done | `packages/ui/src/tokens.css:8-23`; `packages/ui/src/theme.tsx`; `packages/ui/src/theme.test.tsx`; `e2e/navigation.spec.ts:40-47` (theme preference survives reload; the spec switches to dark). Known gap that AC-DSH-741 will catch: light-theme Badge text is 4.01:1 (danger), 4.08:1 (warning) and 4.27:1 (success) against its tinted background on a white surface, below the 4.5:1 AA level for small text (computed in this check from `tokens.css:8-23` and `packages/ui/src/components.tsx:128-135`) | Re-verify AE-P12; badge fix AE-P3 (D-09) |
| DSH-UX-042 | Dark theme meeting contrast rules | Partial | Works (`tokens.css:25-40`; flash prevented by `index.html:9-16`). The dark danger button, white text on #f87171 (`components.tsx:28`, `tokens.css:38`), is 2.77:1. Dark-theme badges compute at 5.2:1 or higher (this check) | AE-P3 (D-09) |
| DSH-UX-043 | Responsive layout at phone, tablet and desktop widths with no sideways scroll | Partial | `AppShell.tsx:95-106` (md drawer); `e2e/navigation.spec.ts:36-37` checks no sideways scroll at phone width (mobile Chromium project), but on the presentation editor, not the dashboard; no tablet checks | AE-P12 |
| DSH-UX-044 | Customisable workspace: show, hide and reorder dashboard panels; choose density; reset to default. Stored per device (§6.3). | **Absent** | Preferences hold 4 fields only (`apps/web/src/lib/preferences.ts:4-10`) | AE-P12 |
| DSH-UX-045 | Keyboard shortcuts: app-level (search Ctrl/Cmd+K, new item, go to Dashboard/Files/Recent/Favourites/Trash, help "?"), listed in Settings → Shortcuts and in a help overlay; no conflict with editor or browser shortcuts. | Partial | Editor-level only: Ctrl/Cmd+S (`EditorPage.tsx:43-53`), Ctrl+Alt+arrows tabs (`OpenTabs.tsx:11-14,37-50`), reference list (`SettingsPages.tsx:305-410`) | AE-P12 |
| DSH-UX-046 | Accessible navigation: skip link; mobile drawer with Escape, focus trap, `role="dialog"` and focus return; landmarks; visible focus. | Partial | `nav aria-label="Main"` (`AppShell.tsx:26`); drawer is a plain div (`AppShell.tsx:99-106`, TD-25); no skip link | AE-P3 |
| DSH-UX-047 | Consistent design system: every dashboard and search control comes from `packages/ui` and uses tokens (no arbitrary px font sizes). | Partial | 14 colour tokens plus font family; 51 arbitrary px sizes across the codebase; missing Tabs, Tooltip, Checkbox, Switch, Popover, Skeleton, DataTable (audit) | AE-P3 (ADR-0024) / AE-P12 |
| DSH-UX-048 | Preserve existing dashboard functions (§3.3 P1–P11) | Done (baseline) | §3.3 | Regression gate in every phase from AE-P3 |
| DSH-UX-049 | Reduced motion in the shell (added in AE-P1) | Absent | No `prefers-reduced-motion` handling in `packages/ui/src` or `apps/web/src` (grep, 2026-11-15); the presentation show (`packages/presentation-studio/src/show/effects.ts`) and the diagram canvas CSS (`packages/diagram-studio/src/diagramCss.ts`) handle it separately | AE-P3 |
| DSH-UX-050 | Recoverable errors (added in AE-P1): the shell's error screen offers a working "Go to Dashboard" that resets the boundary, and the sidebar stays usable | Partial | `ErrorBoundary.tsx:14-41`; `:36` changes the hash but does not reset (RG-7/TD-23). The boundary wraps `AppShell` (`App.tsx:26-28`), so a page crash also replaces the sidebar | AE-P3 |

Layout proposal (default, before customisation):

| Area (≥ 1024 px) | Panels |
|---|---|
| Header row | Greeting, "New" split button, search field |
| Main column (2/3) | Continue (open tabs + recently opened), Recent by kind (tabs or grouped list), Activity timeline |
| Side column (1/3) | Data safety and backup status, Upcoming deadlines and assignments (M06), Favourites, Storage overview |
| Below | Subjects overview; Classroom overview (M06) |

At phone width panels stack in the same order; the user's order (DSH-UX-044) overrides it. Panels for absent modules are not rendered (DSH-FR-014, D-31). Any change to the live look needs owner approval under D-09 (the roadmap's AE-P3 approval gate names "any visible look change (D-09)"). The canonical brief's ADR-0024 text says D-27 here, but its decision list gives D-27 to dead-code removal; D-09 is used in this PRD.

---

## 6. Data model

All structures are **proposed** and owned by the documents named. If [DATABASE_AND_SYNC_ARCHITECTURE.md](./DATABASE_AND_SYNC_ARCHITECTURE.md) differs, it wins.

### 6.1 Read by the dashboard (owned elsewhere)

| Data | Source | Owner |
|---|---|---|
| Item summaries incl. `favorite`, `updatedAt`, `lastOpenedAt`, `folderId`, `tagIds`, `sizeBytes` | `item_index` store; DB v4 fields (ADR-0015) | SVC-ITEM / M08 |
| Open tabs | `localStorage` key `dcos.openTabs` (`apps/web/src/lib/openTabs.ts`) | apps/web shell |
| Storage report | `StorageUsage` (M08 PRD §9.2) | M08 |
| Persistence and backup state | `useDataSafety` (`apps/web/src/lib/storage.ts:289-305`), meta `lastBackupAt` (`:283-287`) | SVC-BACKUP |
| Subjects | SVC-ORG folders with `role: 'subject'` | M08 |
| Classrooms, assignments, deadlines, announcements | `classroom_cache` store keyed by host and entity id (ADR-0015 (c)) | M06 |
| Activity | `activity` store, capped (DB v4) | SVC-ACT |

### 6.2 Owned by M09: search index

| Store (proposed) | Key | Content |
|---|---|---|
| `search_docs` | `kind:itemId` | `{ kind, itemId, version, title, folderPath, tagNames, fields: { name, text }[], indexedAt, extractorVersion }` |
| `search_index` | library-defined | Serialised index (MiniSearch or FlexSearch, candidates, licence to verify) or an original inverted index, chunked to keep each record small |
| meta `searchIndexVersion` | — | Bumped when extractors or tokenisation change, which triggers a background rebuild |

Rules: the index is derived data. It is excluded from backups (rebuilt after restore), never migrated in place (rebuilt), and keyed by item `version` so a stale entry is detected. Trash entries are kept but flagged, so the "Include trash" toggle needs no rebuild.

### 6.3 Owned by M09: workspace layout (per device)

```ts
interface DashboardLayout {
  version: 1;
  panels: Array<{ id: DashboardPanelId; visible: boolean; size?: 'normal' | 'wide' }>; // order = array order
  density: 'comfortable' | 'compact';
  recentGrouping: 'mixed' | 'by-kind';
}
```

Stored in `localStorage` (like `dcos.preferences`, `preferences.ts:13`), read with try/catch and a default on failure. Whether it travels in backups follows D-34.

---

## 7. Technical architecture

```
AppShell (header: search field, Ctrl/Cmd+K palette; sidebar; skip link)
   │
   ├── Dashboard page
   │     PanelRegistry ── each panel: { id, requires, load(), render() }
   │       Continue, RecentByKind, Favourites, QuickActions, DataSafety,
   │       StorageOverview, Activity, Deadlines*, Assignments*, Classrooms*, Subjects
   │       (* registered only when M06 is present: D-31)
   │     Per-panel error boundary with reset (DSH-FR-018)
   │
   └── Search UI (palette + results page #/search?q=…)
              │
              ▼
        SVC-SEARCH (proposed packages/search, composed by apps/web;
                    contract DSH-IF-001 owned by M09)
          Indexer ◀── storage change events (BroadcastChannel dcos-storage)
          TextExtractor registry ◀── one per kind, injected from modules.tsx
          Query engine (candidate library or original code), runs in a worker
              │
              ▼
        packages/local-storage (search stores; activity; item_index)
```

- **Placement.** SVC-SEARCH lives in the proposed `packages/search` package (SYSTEM_ARCHITECTURE §6.2: it may import only `local-storage` types), is composed by `apps/web`, and keeps its stores in `packages/local-storage`. M09 owns the contract (DSH-IF-001) and the search UI. Extractors are pure functions exported by each studio package (no React, no DOM), registered by `apps/web/src/modules.tsx`, so studio packages never import each other (`tests/integration/boundaries.test.ts`).
- **Indexing.** After a durable save, the shell posts the item key; the indexer (in a Web Worker, TD-40 pattern) loads the content, runs the extractor and updates the index. Metadata-only changes (favourite, move, tag) update only the cheap fields. Purge removes the entry in the same user action (DSH-FR-031).
- **Cross-tab.** One tab holds a Web Lock `dcos-search-index:<db>` (proposed name) while writing; others read. Fallback without Web Locks: indexing per tab with version checks.
- **Dashboard data.** Panels read through existing hooks (`useItems`, `useDataSafety`) plus new hooks for activity, storage usage, subjects and the classroom cache. Each panel loads independently, so a slow panel does not delay others.
- **Continue working.** Combines `getOpenTabs()` with items sorted by `lastOpenedAt`; `markOpened` (SVC-ORG, M08 PRD §9.1) is called by `EditorPage` when an item opens.
- **Shell fixes in AE-P3.** Skip link, drawer semantics (TD-25), resettable error boundary (RG-7/TD-23), reduced motion, contrast fixes (D-09), design tokens (ADR-0024).
- **Native.** No dashboard feature depends on platform APIs except storage estimates; on native adapters the storage overview uses the adapter's own figures (SVC-PLAT).

---

## 8. Dependencies

### 8.1 Modules and services

| Depends on | Why | State today |
|---|---|---|
| SVC-ITEM / SVC-STORE | item summaries, kinds | Done (3 kinds) |
| DB v4 (AE-P3): `lastOpenedAt`, `metaUpdatedAt`, `activity` store | Continue, Recent, timeline | Absent |
| M08 / SVC-ORG | subjects, folder paths, tag names; `markOpened`; `StorageUsage` | Absent (M08 PRD) |
| SVC-ACT | activity timeline | Absent |
| SVC-BACKUP | backup status | Done (format 2) |
| SVC-UI (ADR-0024) | Skeleton, Tabs, Popover, Drawer, skip link, ErrorBoundary reset | Partial |
| M01, M02, M03 | text extractors (new pure exports) | Absent (extractors) |
| M04, M05 | notebook and PDF extractors (PDF text via pdf.js, ADR-0023) | Absent |
| M06 | classroom cache: assignments, deadlines, announcements, classroom overview | Absent |
| SVC-PERM | classroom data visibility (host-side) | Absent |
| SVC-REF | search results and dashboard entries as `ItemRef { mode: 'link' }` | Absent |

Contracts: INT-06 and INT-09 in [MODULE_DEPENDENCY_MAP.md](./MODULE_DEPENDENCY_MAP.md).

### 8.2 Libraries

| Library | Use | Status |
|---|---|---|
| MiniSearch or FlexSearch (reported as MIT and Apache-2.0 in the canonical brief §5; not checked against the packages) | SVC-SEARCH query engine | Candidates, not installed, licence to verify; original inverted index is the alternative |
| idb | stores | Installed (8.0.4) |
| react, react-router-dom | UI, routes (`#/search`) | Installed (19.3.1, 7.18.5) |
| lucide-react | icons | Installed (0.460.0) |
| `@axe-core/playwright` (reported as MPL-2.0 in the canonical brief, D-25) | automated accessibility checks | Candidate, not installed, licence to verify; needs licence approval (D-25) |

No library is adopted in AE-P1. All candidates go through [DEPENDENCY_AND_LICENCE_PLAN.md](./DEPENDENCY_AND_LICENCE_PLAN.md).

---

## 9. API/interface contracts

All proposed. SVC-REF, SVC-BLOB and SVC-PERM are referenced and not redefined.

### 9.1 DSH-IF-001: SVC-SEARCH (defined by M09; shared)

```ts
type SearchableKind = ItemKind | 'assignment' | 'announcement'; // classroom entities come from the M06 cache

interface ExtractedField { name: 'title' | 'body' | 'notes' | 'labels' | 'comments' | 'meta'; text: string; locator?: string } // locator: slide id, page number, node id

/** Pure, synchronous or async; no DOM, no network. One per kind, exported by the owning package. */
interface TextExtractor<C = unknown> {
  kind: ItemKind;
  extractorVersion: number;          // bump to trigger reindex
  extract(content: C): ExtractedField[] | Promise<ExtractedField[]>;
}

interface SearchQuery {
  text: string;
  kinds?: SearchableKind[];
  folderId?: string | null; recursive?: boolean;   // SVC-ORG scope (used by FIL-FR-008)
  tagIds?: string[];
  includeTrash?: boolean;                          // default false (D-17)
  limit?: number; offset?: number;
}

interface SearchHit {
  ref: ItemRef;                                    // SVC-REF, mode 'link'
  score: number;
  field: ExtractedField['name'];
  snippet: { text: string; highlights: Array<[start: number, end: number]> };
  locator?: string;
  trashed: boolean;
}

interface SearchService {
  query(q: SearchQuery): Promise<{ hits: SearchHit[]; total: number; complete: boolean }>;
  indexItem(key: { kind: ItemKind; id: string }): Promise<void>;
  removeItem(key: { kind: ItemKind; id: string }): Promise<void>;
  rebuild(opts?: { signal?: AbortSignal; onProgress?: (done: number, total: number) => void }): Promise<void>;
  status(): Promise<{ indexed: number; total: number; version: number; building: boolean }>;
  registerExtractor(x: TextExtractor): void;
}
```

`complete: false` tells the UI that indexing is still running, so it never claims "no results" falsely. Classroom entities are searchable only from the local cache, which holds only what the host's SVC-PERM checks already returned.

### 9.2 DSH-IF-002: Dashboard panel contract

```ts
type DashboardPanelId =
  | 'continue' | 'recent' | 'favourites' | 'quick-actions' | 'data-safety' | 'storage'
  | 'activity' | 'deadlines' | 'assignments' | 'classrooms' | 'subjects';

interface DashboardPanel {
  id: DashboardPanelId;
  title: string;
  /** Returns false when the module or service it needs is not present: the panel is then not registered (D-31). */
  available(): boolean;
  render(): React.ReactNode;          // wrapped in a per-panel error boundary with reset
}
```

### 9.3 Activity (consumer view of SVC-ACT)

```ts
interface ActivityEvent {
  id: string;
  at: string;                          // device time, advisory
  type: ActivityType;                  // SYSTEM_ARCHITECTURE §5.1 (item.*, org.*, backup.*, class.*, share.*)
  ref?: ItemRef;                       // SVC-REF; dangling refs render "missing item"
  detail?: Record<string, string | number>;
}
interface ActivityReader { list(opts: { since?: string; limit: number; types?: ActivityType[] }): Promise<ActivityEvent[]> }
```

The event shape is owned by SYSTEM_ARCHITECTURE (SVC-ACT); this is the subset M09 reads. Edits are coalesced per item per session so a timeline is not flooded by autosaves (600 ms debounce, `storage.ts:689`).

### 9.4 Continue working

```ts
interface ContinueEntry { ref: ItemRef; source: 'open-tab' | 'recently-opened'; lastOpenedAt: string | null }
function continueWorking(limit: number): Promise<ContinueEntry[]>; // open tabs first, then lastOpenedAt, de-duplicated
```

---

## 10. Acceptance criteria

Numbers mirror requirement IDs; NFR criteria use 500 + n, UX criteria 700 + n, interface criteria 900 + n (DSH-IF-NNN, §9) (canonical brief §4.3). Unless a row names browsers, "e2e" means the Chromium, Firefox and WebKit Playwright projects (ACCEPTANCE_CRITERIA §1.3), plus mobile Chromium for phone-width and touch checks; a criterion is not met while Firefox is not green in CI (R-001, D-03). This table is the canonical wording of the module's criteria; [ACCEPTANCE_CRITERIA.md](ACCEPTANCE_CRITERIA.md) §4 only summarises them and owns the cross-cutting criteria (AC-SYS, AC-SEC, AC-PERF, AC-INT and others) (ACCEPTANCE_CRITERIA §1.2). A change to a criterion here is made in ACCEPTANCE_CRITERIA §4 in the same edit.

| AC ID | Verifies | Criterion | Evidence type | Phase | Re-verify |
|---|---|---|---|---|---|
| AC-DSH-001 | DSH-FR-001 | Open tabs and recently opened items appear in "Continue", de-duplicated, in the right order; each opens the item. | unit + e2e | AE-P12 | — |
| AC-DSH-002 | DSH-FR-002 | Recent documents group lists only documents in D-32 order; "View all" goes to the documents list in the same order. | unit + e2e | AE-P12 | — |
| AC-DSH-003 | DSH-FR-003 | As AC-DSH-002 for diagrams. | unit + e2e | AE-P12 | — |
| AC-DSH-004 | DSH-FR-004 | As AC-DSH-002 for presentations. | unit + e2e | AE-P12 | — |
| AC-DSH-005 | DSH-FR-005 | Starring an item shows it in Favourites (max 6, "View all" beyond); unstarring removes it; neither changes `updatedAt`. | unit + e2e | AE-P12 | yes |
| AC-DSH-006 | DSH-FR-006 | Each quick action and quick-start tile creates exactly one item even on double-click or double Enter, and opens it. | unit + e2e | AE-P12 | yes |
| AC-DSH-007 | DSH-FR-007 | With a seeded classroom cache, upcoming assignments show in due-date order with submission state; without M06 the panel is absent. | integration + e2e | AE-P12 | — |
| AC-DSH-008 | DSH-FR-008 | Deadlines list combines all sources, highlights overdue items, and shows the cache age when offline. | unit + e2e | AE-P12 | — |
| AC-DSH-009 | DSH-FR-009 | Create, edit, import, restore, move and trash actions each appear once in the timeline; repeated autosaves in one session coalesce to one entry. | unit + e2e | AE-P12 | — |
| AC-DSH-010 | DSH-FR-010 | The storage panel's total equals the M08 `StorageUsage` total and links to Settings → Storage. | unit | AE-P12 | — |
| AC-DSH-011 | DSH-FR-011 | In every combination of persistence state, item count and backup age, the data-safety card shows at least one sentence; the action shown matches the state. | unit (state table) | AE-P3 / AE-P12 | — |
| AC-DSH-012 | DSH-FR-012 | Teacher and student overviews show only classrooms the user belongs to, from the cache; no data from other classrooms appears. | integration + e2e (two accounts) | AE-P12 | — |
| AC-DSH-013 | DSH-FR-013 | Each subject folder appears with its item count and recent items; the same subject ids appear in the Notebook. | integration + e2e | AE-P12 | — |
| AC-DSH-014 | DSH-FR-014 | No panel, link or button refers to a module that is not present in the build. | unit + e2e | AE-P12 | yes |
| AC-DSH-015 | DSH-FR-015 | Notebook and PDF recent groups appear the day each kind ships. | e2e | AE-P7, AE-P8 | — |
| AC-DSH-016 | DSH-FR-016 | Each panel shows a skeleton while loading (slowed storage in test). | unit | AE-P12 | — |
| AC-DSH-017 | DSH-FR-017 | With storage reads failing, the dashboard shows the "nothing was changed" alert and no empty state. | unit | AE-P12 | yes |
| AC-DSH-018 | DSH-FR-018 | A panel that throws shows an error in its slot; the other panels and the sidebar stay usable; "Try again" re-renders it. | unit + e2e | AE-P3 / AE-P12 | — |
| AC-DSH-020 | DSH-FR-020 | A word that appears only in a document's body (and in a table cell, a caption and a comment) finds that document. | integration (seeded corpus) | AE-P12 | — |
| AC-DSH-021 | DSH-FR-021 | A shape label and a connector label find their diagram. | integration | AE-P12 | — |
| AC-DSH-022 | DSH-FR-022 | Slide text, a table cell and speaker notes find their presentation, with the slide as locator. | integration | AE-P12 | — |
| AC-DSH-023 | DSH-FR-023 | Notebook page text finds the page, with its section and chapter. | integration | AE-P7 | — |
| AC-DSH-024 | DSH-FR-024 | Text in a PDF's text layer finds the PDF and page number. | integration (real-world PDFs) | AE-P8 / AE-P12 | — |
| AC-DSH-025 | DSH-FR-025 | Assignment titles and descriptions in the cache are found; nothing outside the user's classrooms is. | integration | AE-P12 | — |
| AC-DSH-026 | DSH-FR-026 | Folder and tag names find the items they contain or label. | integration | AE-P12 | — |
| AC-DSH-027 | DSH-FR-027 | Ctrl/Cmd+K opens the search palette from any non-editor view and from the editor chrome; Escape closes it and returns focus. | e2e (Chromium, WebKit, Firefox) | AE-P12 | — |
| AC-DSH-028 | DSH-FR-028 | Saving an item updates its search results within 2 s (proposed target, to be measured); "Rebuild index" reproduces the same results. | integration + e2e | AE-P7 / AE-P12 | — |
| AC-DSH-029 | DSH-FR-029 | Results are grouped by kind, highlight the match, and are fully keyboard-navigable; opening a result lands on the match where the editor supports it. | e2e | AE-P12 | — |
| AC-DSH-030 | DSH-FR-030 | Trashed items are excluded unless "Include trash" is on; drafts and versions never appear. | unit | AE-P12 | — |
| AC-DSH-031 | DSH-FR-031 | After a purge, the item is not returned by any query; after a backup restore, results report `complete: false` until indexing finishes. | unit + e2e | AE-P12 | — |
| AC-DSH-501 | DSH-NFR-001 | PERF-001 and PERF-002 met on D-29 reference hardware with a 1,000-item profile. | measurement | AE-P12 / AE-P13 | — |
| AC-DSH-502 | DSH-NFR-002 | PERF-011 met over 5,000 items; typing latency in the search field not degraded. | measurement | AE-P12 / AE-P13 | — |
| AC-DSH-503 | DSH-NFR-003 | Indexing adds ≤ 50 ms p95 to the save path; heap within PERF-008. | measurement | AE-P12 | — |
| AC-DSH-504 | DSH-NFR-004 | All panels and search work with the network off. | e2e (offline) | AE-P12 | — |
| AC-DSH-505 | DSH-NFR-005 | `e2e/privacy.spec.ts`, extended to dashboard and search flows, finds no cross-origin request. | e2e | AE-P12 | — |
| AC-DSH-506 | DSH-NFR-006 | A corrupted index store leads to title-only results with a "Rebuild index" action, not an error screen. | unit | AE-P12 | — |
| AC-DSH-507 | DSH-NFR-007 | Upgrade from a build without search stores creates them and rebuilds the index without touching item data. | upgrade test (real browser) | AE-P7 | — |
| AC-DSH-508 | DSH-NFR-008 | Covered by AC-DSH-746 and AC-A11Y criteria. | e2e + manual | AE-P12 / AE-P15 | — |
| AC-DSH-509 | DSH-NFR-009 | Counts, sizes and recent order agree between Dashboard, File Manager and search on one seeded profile. | e2e | AE-P12 | — |
| AC-DSH-740 | DSH-UX-040 | Owner-approved design review with dated screenshots (light and dark; 375, 768, 1024, 1440 px). | manual (dated) | AE-P12 | — |
| AC-DSH-741 | DSH-UX-041 | Light theme: all dashboard and search text meets AA contrast. | e2e + axe (D-25) | AE-P12 | yes |
| AC-DSH-742 | DSH-UX-042 | Dark theme: all text and controls meet AA, including the danger button and badges. | measurement (contrast) + e2e | AE-P3 | — |
| AC-DSH-743 | DSH-UX-043 | No sideways scroll and no clipped controls at 375, 768, 1024 and 1440 px. | e2e (incl. a tablet viewport) | AE-P12 | — |
| AC-DSH-744 | DSH-UX-044 | Hide, show, reorder and reset panels; the layout survives reload; a corrupt stored layout falls back to the default. | unit + e2e | AE-P12 | — |
| AC-DSH-745 | DSH-UX-045 | Every app-level shortcut works, is listed in Settings → Shortcuts and the help overlay, and does nothing while typing in an editor. | e2e | AE-P12 | — |
| AC-DSH-746 | DSH-UX-046 | Skip link reaches main content; drawer closes with Escape, traps focus, has dialog role and returns focus; screen-reader pass recorded (VoiceOver, NVDA, TalkBack). | e2e + manual (dated) | AE-P3 / AE-P15 | — |
| AC-DSH-747 | DSH-UX-047 | Dashboard and search use only `packages/ui` components and tokens (static check for arbitrary px font sizes in their files). | unit (static) | AE-P12 | — |
| AC-DSH-748 | DSH-UX-048 | Every preserved function P1–P11 (§3.3) still works; the existing tests (`presentation-shell.test.tsx:87-126`, `e2e/navigation.spec.ts`) pass unchanged or with a recorded, owner-visible reason. | unit + e2e | Every phase from AE-P3 | yes |
| AC-DSH-749 | DSH-UX-049 | With reduced motion requested, shell transitions are removed. | e2e (emulated media) | AE-P3 | — |
| AC-DSH-750 | DSH-UX-050 | After a forced render error, "Go to Dashboard" shows the working dashboard without a reload. | unit + e2e | AE-P3 | — |
| AC-DSH-901 | DSH-IF-001 (§9.1 SVC-SEARCH) | Each shipped kind registers an extractor that passes a shared extractor test (pure, deterministic, no network, all text fields covered). | unit | AE-P7 / AE-P12 | — |
| AC-DSH-902 | DSH-IF-002 (§9.2 panel contract) | A panel whose `available()` is false is never rendered. | unit | AE-P12 | — |

---

## 11. Test strategy

| Level | Scope | Location (proposed) | Notes |
|---|---|---|---|
| Unit | Panels (state tables for DataSafety, Continue, Recent grouping), layout persistence, shortcut map, search query building and scope rules | `apps/web/src/pages/dashboard/*.test.tsx`, `apps/web/src/lib/search/*.test.ts` | `Dashboard.tsx` has no test file; write characterisation tests for P1–P11 **before** refactoring |
| Integration | Extractors per kind on the existing goldens (`tests/golden/*`); index build and update; classroom cache filtering | `tests/integration/search-*.test.ts` | Seeded corpus with known words per field |
| Browser | Palette focus handling, drawer focus trap, skip link | Vitest + jsdom, then Playwright | — |
| End-to-end | Resume from Continue; per-kind recent; search across kinds; panel customisation; offline dashboard | `e2e/dashboard-*.spec.ts`, `e2e/search-*.spec.ts` | Chromium, WebKit, Firefox (after PR #1, D-03), mobile Chromium; add a tablet viewport |
| Persistence | Layout and index survive reload and browser relaunch | e2e (Chromium-only relaunch today) | — |
| Offline | Dashboard and search with the network off | extend `e2e/storage.chromium-only.spec.ts` | Presentations are not covered by the offline spec today; add them |
| Import/export | Imported and restored items become searchable; purged items vanish | e2e | Backup restore → `complete: false` → results |
| Upgrade | New search and activity stores created additively; index rebuilt | `scripts/upgrade-test.mjs` | Update hard-coded store lists (:64-65) |
| Regression | P1–P11 baseline; v0.1.0 routes (`e2e/navigation.spec.ts:4-17`) | unit + e2e | Gate in every phase |
| Accessibility | Keyboard-only flows, landmarks, contrast in both themes, reduced motion | e2e + axe (D-25) + manual screen readers (AE-P15) | A11Y-001 |
| Performance | PERF-001, 002, 011; index cost on save; heap | AE-P3 harness, D-29 hardware | All numbers are proposed targets, to be measured |
| Security / privacy | No network for local data; escaped snippets (search highlights must not use raw HTML); classroom data limited to the user's classrooms | e2e privacy spec; unit for snippet rendering | Snippets rendered as text with highlight ranges, never `dangerouslySetInnerHTML` |

---

## 12. Known risks

### 12.1 From the risk register (canonical seed)

| ID | Risk | Why it matters for M09 |
|---|---|---|
| R-003 | DB migrations on live users' data | New activity and search stores |
| R-006 | Design-system work multiplies inconsistencies | The dashboard is the most visible screen |
| R-007 | Student data exposure | Classroom overview and assignment search show classroom data on possibly shared devices |
| R-019 | Documentation drift | FEATURE_STATUS row 176 is stale (the storage error is fixed, `Dashboard.tsx:142-150`) |
| R-021 | Scope size | M09 depends on M04–M08; AE-P12 is late |
| R-034 | No performance baselines | Dashboard load and search time are unmeasured |
| R-036 | Accessibility debts inherited | Contrast, drawer, skip link |
| R-040 | `sizeBytes` is a character count | The storage panel would mislead until M08 fixes it |

### 12.2 Module-specific risks (numbered in RISK_REGISTER.md as R-087 to R-092, in this order)

| ID | Risk | L | I | Mitigation |
|---|---|---|---|---|
| R-087 | Search index grows too large or slows saves on low-end devices and large libraries | M | M | Worker indexing, chunked records, measured against PERF-005/008/011; title-only fallback |
| R-088 | Index drifts from data (missed events across tabs, crash mid-update) and returns stale or missing results | M | M | Version-keyed entries, Web Lock for writers, `complete` flag, "Rebuild index", rebuild after restore |
| R-089 | Snippets render user content as HTML (XSS in the user's own tab or from imported files) | L | H | Text-only snippets with highlight ranges; unit test with markup in content; no web CSP today (R-025) |
| R-090 | "Premium design" cannot be accepted objectively | H | L | DSH-UX-040 made testable as an owner-approved dated design review |
| R-091 | Dashboard customisation adds complexity before core panels are stable | M | L | Ship fixed default layout first in AE-P12, customisation last; reset always available |
| R-092 | Ctrl/Cmd+K conflicts with an editor or browser shortcut: it is already the document editor's "Insert or edit a link" (`DocumentEditor.tsx:211-216`) | M | L | Palette shortcut ignored inside editor text; listed and tested per editor (AC-DSH-745) |

### 12.3 Owner decisions this module waits on

D-09 (contrast changes on the live look), D-11 (subjects), D-13 (classroom host), D-17 (search scope), D-20 (PDF OCR), D-25 (axe), D-29 (reference hardware), D-31 (hide panels for absent modules), D-32 (Recent meaning), D-34 (backups and preferences in backups), D-44 (personal due-date field for DSH-FR-008, raised by this PRD and numbered in the roadmap's decision list).
