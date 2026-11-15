# Digital Classroom OS Advanced Edition: product roadmap

This document is the top-level plan for taking Digital Classroom OS from its current state (HEAD `edc2672`, manifest version 0.1.0) to "Digital Classroom OS Advanced Edition v1.0.0 Stable". It states the product vision, records the audited current state of all nine modules and the shared infrastructure, reports the verification of commit `fe3275a`, and defines the 16 Advanced Edition phases (AE-P1 to AE-P16) with their scope, entry and exit gates and owner approval points. It also owns the list of owner decisions (D-NN). It is the AE-P1 report for the owner.

**Status: AE-P1 draft for owner approval (2026-11-15)**

Related documents in this folder:
[Module 01 Document Studio](MODULE_01_DOCUMENT_STUDIO_PRD.md) ·
[Module 02 Diagram Studio](MODULE_02_DIAGRAM_STUDIO_PRD.md) ·
[Module 03 Presentation Studio](MODULE_03_PRESENTATION_STUDIO_PRD.md) ·
[Module 04 Digital Notebook](MODULE_04_DIGITAL_NOTEBOOK_PRD.md) ·
[Module 05 PDF Studio](MODULE_05_PDF_STUDIO_PRD.md) ·
[Module 06 Classroom Hub](MODULE_06_CLASSROOM_HUB_PRD.md) ·
[Module 07 Collaboration](MODULE_07_COLLABORATION_PRD.md) ·
[Module 08 File Manager](MODULE_08_FILE_MANAGER_PRD.md) ·
[Module 09 Dashboard](MODULE_09_DASHBOARD_PRD.md) ·
[System architecture](SYSTEM_ARCHITECTURE.md) ·
[Database and sync architecture](DATABASE_AND_SYNC_ARCHITECTURE.md) ·
[Dependency and licence plan](DEPENDENCY_AND_LICENCE_PLAN.md) ·
[Module dependency map](MODULE_DEPENDENCY_MAP.md) ·
[Acceptance criteria](ACCEPTANCE_CRITERIA.md) ·
[Security and privacy plan](SECURITY_AND_PRIVACY_PLAN.md) ·
[Risk register](RISK_REGISTER.md) ·
[Release strategy](RELEASE_STRATEGY.md)

---

## 1. Product vision

From the owner's brief (§2), paraphrased: one unified, offline-capable academic productivity system in which students and teachers can create documents, design diagrams, build presentations, keep digital notebooks, read and edit PDFs, organise academic files, run classrooms and assignments, collaborate in real time, work offline, and synchronise selected work between devices. All modules work inside one workspace; the goal is one product, not nine separate tools.

Fixed constraints from the brief that shape every phase:

| Constraint | Source | Consequence for the plan |
|---|---|---|
| Local-first; core editing works offline | brief §6 | Network features (M06, M07) are additions on top of the local store, never a dependency of editing |
| Web, macOS, Windows and Android | brief §3 | One web codebase (apps/web) wrapped by Tauri 2 and Capacitor 7; native work is concentrated in AE-P14 |
| IndexedDB in browsers, SQLite for native local storage | brief §3 | D-12 decides when SQLite arrives; IndexedDB stays the web store |
| FastAPI only where network services are needed | brief §3 | Accounts and sync live on an optional classroom host (ADR-0020, proposed) |
| Free and open-source dependencies; no mandatory paid SaaS; no AI | brief §11 | Every library is a candidate until reviewed in [DEPENDENCY_AND_LICENCE_PLAN](DEPENDENCY_AND_LICENCE_PLAN.md) |
| One phase at a time, owner approval between phases | brief §13 | §5 of this document |
| Do not rewrite working modules | brief §3 | v0.2 work is kept and re-verified, not replaced |

## 2. How to read this plan

### 2.1 Status words

| Word | Meaning |
|---|---|
| **Done** | Implemented, with a test file and a recorded passing run. The recorded run is the local full verification of 2026-11-15 (docs/audit/RELEASE_GAPS.md §11, "Final verification", lines 257-265). Nothing was re-run in AE-P1. |
| **Partial** | Some of it exists; the evidence column says which part. |
| **Stub** | A placeholder or scaffold only (README, empty `__init__.py`, unbuilt configuration). |
| **Absent** | Nothing exists. |
| **Unverified** | Cannot be determined; the reason is given. |

"Done" means "Done (v0.2)". It does not mean the item meets its Advanced acceptance criterion: every Done item carries "re-verify: yes" in [ACCEPTANCE_CRITERIA](ACCEPTANCE_CRITERIA.md) and must pass in its AE phase.

### 2.2 Two phase numberings

- **AE-P1 … AE-P16** are the Advanced Edition phases defined in this document (brief §12).
- **"v0.2 Phase n"** is the earlier programme ("v0.2.0 Stable"); its commit messages say "Phase n". This document never writes "Phase 7" on its own.

| v0.2 phase | Commit(s) | Date | Maps to |
|---|---|---|---|
| v0.2 Phase 1 audit (docs only) | 2ccff35 | 2026-11-13 | AE-P1 (superseded by this audit) |
| v0.2 Phase 2 Git, backup and data safety | dbbce17 | 2026-11-13 | AE-P2 |
| v0.2 Phase 3 architecture and storage hardening | 2669868 | 2026-11-13 | AE-P3 |
| v0.2 Phase 4 Document Studio | fe3275a, then 206e080 | 2026-11-13, 2026-11-14 | AE-P4 |
| v0.2 Phase 5 Diagram Studio | 8f772ba | 2026-11-14 | AE-P5 |
| v0.2 Phase 6 document–diagram integration | 650cf63 | 2026-11-14 | AE-P4, AE-P5, AE-P12 (INT-01) |
| MIT licence and GitHub Pages deploy | 468ab89 | 2026-11-15 | AE-P2 |
| v0.2 Phase 7 Presentation Studio | edc2672 | 2026-11-15 | AE-P6 |

Earlier commits on main: 20d3f4d (v0.1.0 baseline, tagged `v0.1.0-baseline`), 8766e18, ff53b49, f50b0d4, 2448a6c, ea7f316. All 15 commits are linear (git log).

### 2.3 Identifiers

Module requirement IDs are `<PFX>-FR|NFR|UX|IF-NNN` (DOC, DGM, PRS, NBK, PDF, CLS, COL, FIL, DSH). Acceptance criteria are `AC-<PFX>-NNN` and mirror the requirement number. Cross-cutting prefixes: SYS, SYN, SEC, PERF, A11Y, PLT, REL, DEP, INT. Risks are R-NNN ([RISK_REGISTER](RISK_REGISTER.md)); owner decisions are D-NN (§6 below); shared services are SVC-<NAME> ([SYSTEM_ARCHITECTURE](SYSTEM_ARCHITECTURE.md)); integration contracts are INT-01 … INT-09 ([MODULE_DEPENDENCY_MAP](MODULE_DEPENDENCY_MAP.md)). Existing TD-NN and RG-NN keep their numbers.

---

## 3. Current state

Repository facts at audit time (2026-11-15):

| Fact | Value | Evidence |
|---|---|---|
| HEAD | `edc2672` = origin/main; branch `advanced/phase1-audit` has no commits of its own | git log, git branch -a |
| Tags and releases | only `v0.1.0-baseline` (→ 20d3f4d), and it exists only in the local repository: `git ls-remote --tags origin` lists no tags. No v0.2.0 tag; no GitHub release | git tag; git ls-remote; gh release list |
| Manifest version | 0.1.0 everywhere (package.json:3, apps/*, packages/*, tauri.conf.json:4, Cargo.toml:3, backend/api/main.py:15) | — |
| Repository | PUBLIC (owner's choice, not yet recorded: D-01); `main` not protected; Dependabot security updates off; secret scanning and push protection on; private vulnerability reporting off | gh repo view; gh api (2026-11-15) |
| Deploy | Pages publishes every push to main, not gated on CI (.github/workflows/pages.yml:6-9); run 43676035951 deployed edc2672 (success, 2026-11-15T04:16Z). The `github-pages` environment accepts deployments from the branch `main` only (one custom deployment-branch policy). The live page was not fetched in AE-P1 | gh run list; gh api …/environments/github-pages/deployment-branch-policies (2026-11-15) |
| CI | web and backend jobs pass; e2e job failed on main for 468ab89 (run 43669491390) and edc2672 (run 43676035968); main has never been green | gh run list |
| PR #1 | `ci/browser-test-fixes` (2731876, 4983af4): open, mergeable, unmerged, 54 test-only files; run 43709861278 (on 2731876): 494 passed, 2 failed, 1 flaky; run 43719093806 (on 4983af4) was in progress at audit time and, when re-checked during the AE-P1 fact-check, had completed with **success** at 2026-11-15T13:48Z: web (132 files, 1997 tests), e2e (497 passed, 44 skipped, 0 failed, all four Playwright projects including Firefox and Linux WebKit) and backend (3) jobs green. This is the PR branch, not main | gh pr view 1; gh run view 43719093806 |
| Last full local verification | 2026-11-15: Vitest 132 files / 1997 tests; coverage 90.06% lines, 86.91% statements; Playwright 350 passed / 27 skipped / 0 failed (Chromium, WebKit, mobile Chromium); upgrade test 82/82; backend 3/3; npm audit 0; Firefox not run | RELEASE_GAPS.md:257-265 |
| Storage | IndexedDB `digital-classroom-os`, SCHEMA_VERSION 3, 10 stores; item kinds `document`, `diagram`, `presentation` (closed union) | indexeddb.ts:46, :58-72; types.ts:5-7 |
| Code size | 53,647 non-test TS/TSX lines; 20 files over 500 lines | wc -l |

### 3.1 Modules and infrastructure

Requirement counts are taken from the canonical requirement lists that each module PRD copies.

| Area | Overall status | Requirement counts (Done / Partial / Absent / other) | Key evidence and main gaps |
|---|---|---|---|
| **M01 Document Studio** (DOC) | **Partial** | 52 IDs: 28 / 20 / 4 | packages/document-studio (31 test files; 451 test declarations by strict grep, MODULE_01 §Current state; the canonical brief says about 469); fe3275a, 206e080, 650cf63. Absent: footnotes (DOC-FR-069), track changes (082), citations (084), reference tools (085). No on-screen pagination (DOC-FR-004). DOCX checked in Word for Mac 2 of 16 files; ODT never opened elsewhere |
| **M02 Diagram Studio** (DGM) | **Partial** | 58 IDs: 48 / 6 / 4 | packages/diagram-studio (66 source files, 29 test files); 8f772ba, 650cf63. Absent: concept maps (012), smart guides (081), reusable components (084), multiple pages (085). No .drawio file has been opened in diagrams.net (TD-46; RELEASE_GAPS.md:170); Quick Connect reference never arrived (RELEASE_GAPS.md:78) |
| **M03 Presentation Studio** (PRS) | **Partial** | 28 IDs: 16 / 9 / 3 | packages/presentation-studio (32 test files); edc2672; ADR 0014. Absent: grouping (029), animation timeline (044), real-application verification (062). PPTX never opened in PowerPoint, Keynote or LibreOffice (TD-55) |
| **M04 Digital Notebook** (NBK) | **Absent** | 18 IDs: 0 / 0 / 18 | packages/notebook/README.md is a 4-line stub ("Not started"); no notebook kind (types.ts:5-7); a 'notebook' kind in a backup is rejected (indexeddb.test.ts:272-282) |
| **M05 PDF Studio** (PDF) | **Absent** | 19 IDs: 0 / 0 / 19 | packages/pdf-studio/README.md stub; pdf.js and pdf-lib not installed. PDF exists only as output (jsPDF, svg2pdf.js, browser print) |
| **M06 Classroom Hub** (CLS) | **Absent** (infrastructure Stub) | 27 IDs: 0 / 1 / 26 | packages/classroom and packages/assignments are README stubs; backend/classroom and backend/authentication hold an empty `__init__.py` and a README. CLS-FR-023 Partial: the studios exist but have no classroom link. The "Assignment" quick-start tile (Dashboard.tsx:108-127) is a document template only |
| **M07 Collaboration** (COL) | **Absent** (local parts only) | 18 IDs: 2 / 3 / 13 | Done: privacy by construction (COL-FR-017; e2e/privacy.spec.ts) and offline editing (COL-FR-018; ADR 0001). Partial: local comments, per-device history, local optimistic concurrency (indexeddb.ts:735-776). No Yjs; packages/sync-engine is a README stub |
| **M08 File Manager** (FIL) | **Partial** | 19 IDs: 5 / 10 / 4 | A flat list (ItemListPage.tsx:30-43, 136-154). Done: favourites, trash, restore, backup, restore from backup. Absent: folders, nested folders, tags, previews (no folder or tag field in types.ts:9-29) |
| **M09 Dashboard** (DSH) | **Partial** | 29 IDs: 4 / 15 / 9 / 1 Unverified | apps/web/src/pages/Dashboard.tsx (no unit test file). Done: favourites, quick actions, light theme, preserved baseline. Absent: assignments, deadlines, activity timeline, classroom and subject panels, notebook/PDF/assignment search, customisable workspace. DSH-UX-040 "premium design" Unverified (subjective; no design review) |
| Local storage (IndexedDB) | Done | — | packages/local-storage, 109 tests; ADRs 0001–0010 |
| Item/kind registry (SVC-ITEM) | Done (3 kinds) | — | indexeddb.ts:199-211; kinds.test.ts. A new kind needs an append-only migration and a SCHEMA_VERSION bump |
| Migrations with safety copies | Done (IndexedDB only) | — | indexeddb.ts:511-549; ADR 0006; upgrade test 82/82 (Chromium) |
| Reversible migrations | Partial | — | No down-migrations; reversal via safety copy or backup only (BACKUP_AND_RECOVERY.md:75-77) |
| Attachments (SVC-BLOB) | Done | — | SHA-256 dedup, unique `by_sha256` (indexeddb.ts:256); ADR 0008. No size cap; caller-supplied MIME type |
| Backup and restore (SVC-BACKUP) | Done | — | Format 2 (backup.ts:6); all-or-nothing validation; never overwrites; not encrypted or signed (ADR 0007) |
| Cross-tab coordination | Done | — | BroadcastChannel `dcos-storage`, Web Locks; ADR 0009 |
| Native storage (SQLite) | Absent | — | Seam only: apps/web/src/lib/platform.ts:15-32 (`setStorageFactory`, :23-26); storage.ts:318-319 disables upgrade recovery for non-IndexedDB adapters |
| Identity, accounts, roles, permissions | Absent | — | ownerDeviceId only (types.ts:21-22); ADR 0002 is a plan |
| Sync (LAN or remote, SVC-SYNC) | Stub | — | No sync code: packages/sync-engine/README.md ("Not started") and backend/synchronization (README and empty `__init__.py`) only |
| Backend | Stub | — | GET /health and GET /api/v1/info only, no auth, 3 tests, unpinned dependencies (backend/api/main.py:46-54; backend/requirements.txt; TD-32, TD-35); unchanged since 20d3f4d (git log -- backend) |
| Design system (SVC-UI) | Partial | — | 14 colour tokens plus font family (packages/ui/src/tokens.css); 51 arbitrary px font sizes; dark danger button 2.77:1 |
| App shell | Partial | — | Routing, settings, PWA Done. ErrorBoundary never resets (RG-7/TD-23, ErrorBoundary.tsx:36); SVG-only PWA icon (TD-27) |
| Web/PWA platform | Done (Chromium, WebKit, mobile Chromium) | — | Firefox unverified; offline tested in Chromium only (e2e/storage.chromium-only.spec.ts) |
| Desktop (Tauri 2) | Stub | — | Never built; src-tauri/icons/ empty; no Cargo.lock (TD-30); service worker would register in webviews (TD-31) |
| Android (Capacitor 7) | Stub | — | No native project; `<a download>` will not work in the webview (TD-28) |
| CI | Partial | — | e2e red on main; no permissions block; tag-pinned actions; coverage floors not enforced (TD-33); no native jobs |
| Deploy | Done but ungated | — | pages.yml |
| Dependencies and licences | Partial | — | npm production licence gate Done (142 packages, THIRD_PARTY_NOTICES.md:5-19). No SBOM; Python, Rust and shells not covered |
| Lint and format | Absent | — | No ESLint, Prettier, EditorConfig or Python linter |
| Accessibility testing | Partial | — | Keyboard and role tests; no axe; no screen-reader run |
| Performance | Absent (targets); Partial (diagram time limits) | — | tests/integration/large-diagram.test.ts:17-19; no defined targets (brief §10) |
| Security | Partial | — | Strong local import validation. No web CSP (TD-29); no auth; .drawio import uncapped (drawio.ts:280); ODT expansion (TD-39); imports on main thread (TD-40) |
| Git and release | Partial | — | No v0.2.0 tag; placeholder author on all commits (TD-34); no branch protection; newest backup bundle heads main=650cf63 (no bundle after edc2672) |

### 3.2 Integration contracts today

| ID | Contract | State |
|---|---|---|
| INT-01 | Editable diagrams in documents | Done (650cf63; ADR 0013) |
| INT-02 | Diagrams in presentations | Done (edc2672; hosts.ts:40; tests/integration/presentation-hosts.test.ts) |
| INT-03 | Attach documents to assignments | Absent |
| INT-04 | Submit presentations and PDFs to classrooms | Absent |
| INT-05 | Organise all files through File Manager | Partial (flat list of 3 kinds) |
| INT-06 | Open recent work from the dashboard | Partial (recent by updatedAt, Dashboard.tsx:130-168) |
| INT-07 | Attach notebook content to documents | Absent |
| INT-08 | Share documents and diagrams through Collaboration | Absent |
| INT-09 | Global search across all content | Partial (title filter, ItemListPage.tsx:34-35) |

### 3.3 Documents found to be stale

These are recorded so that no planning document repeats them. AE-P1 changes nothing outside this folder; corrections are scheduled for AE-P2.

| Document | Stale statement | Fact |
|---|---|---|
| README.md:5, :35; docs/DEPLOYMENT.md:18; FEATURE_STATUS.md:34, :206; RELEASE_GAPS.md §11 headings; TECHNICAL_DEBT headings | v0.2 Phase 7 "not committed or deployed" | edc2672 is on origin/main; Pages run 43676035951 deployed it |
| docs/GIT_WORKFLOW.md:5-16, §7 | "Remote: none", "Private", "CI has never run", gh not installed | Repo is PUBLIC, CI has run, gh is installed |
| docs/TESTING.md:66, :68, :80, :117 | "plus Firefox in CI", "CI has not run" | The Firefox e2e job fails on CI |
| docs/DATABASE.md:43; ADR 0006 §6; ADR 0007 §2 | diagram schema 2; document schema up to 2 | document 3 (migrate.ts:13), diagram 3 (types.ts:221) |
| docs/DATABASE.md:49-125 | SQLite DDL | Missing presentations, drafts, item_index, blobRefs; different attachments model |
| docs/SECURITY.md:3 | "Phase 0–1", "until a public release" | The repo is public and the app is live |
| FEATURE_STATUS rows 61, 176; DiagramEditor line references | open defects; lines from ea7f316 | Row 61 fixed (SettingsPages.tsx:73-87, :162-168). Row 176: the storage-error defect is fixed (Dashboard.tsx:142-150), but its empty DataSafetyCard defect is still open (Dashboard.tsx:22-58: with no items and storage not persisted, only the title "Protect your work" renders; DSH-FR-011). DiagramEditor.tsx now has 287 lines |
| TECHNICAL_DEBT TD-1, TD-36, TD-37 | open | Fixed in code |
| Stub package and native READMEs | old phase numbers | AE numbering applies |
| backups/README.md | lists 2 entries | The folder has 18 entries, including README.md and the owner's brief (ls -A, 2026-11-15) |
| tests/acceptance/CHECKLIST.md | last run 2026-11-12 | Not updated for v0.2 Phases 4–7 |

---

## 4. AE-P1 report: verification of fe3275a

The brief (§16) asks that commit `fe3275a` is checked against the repository and not assumed complete.

- **Commit:** fe3275a "Phase 4: Document Studio (formatting, layout, insert, review, files)", 2026-11-13. 232 files, +29,972/−1,370.
- **What it changed:**
  - Removed ui/Toolbar.tsx (438 lines) and the single export/docx.ts (423 lines).
  - Added the export/docx/ and export/odt/ registries, import/ (docx.ts, odt.ts), review/ (comments, language, word count, find/replace), ui/ribbon/ (Home, Insert, Layout, Review), compat.ts, pageLayout.ts and sections.ts.
  - Added apps/web OpenTabs and ImportDocument, 7 e2e specs, 11 mammoth DOCX fixtures, and the docx-format, docx-layout and docx-v2 goldens.
  - Its own commit message said Word and Pages had not been tested.
- **Follow-up 206e080 (2026-11-14):** docs only, 32 files, +177/−15. It added docs/compatibility/phase4-2026-11-14/: 16 DOCX files opened in Apple Pages, with 4 layout differences; Word for Mac 16.115 checked 2 of 16, read-only and unlicensed, stopped by its privacy notice at the owner's choice. It updated DOCUMENT_COMPATIBILITY §8, RG-12 (partly closed), ADR 0011 and README.
- **Still true today:**
  - The RELEASE_GAPS §8 and FEATURE_STATUS v0.2 Phase 4 claims were spot-checked against the code and are present: RG-4 (print.ts:10, :177); RG-5 (types.ts:128; useSection.ts:41, :85); DS-5 (printSupport.ts:11); RR-3 (remoteImages.ts); TD-14 (previewCache.ts); TD-38 (export/docx/index.ts:118-122); TD-39 caps (import/odt.ts:523-541).
  - Since fe3275a, only 650cf63 (v0.2 Phase 6; 41 package files, +4,499/−210) has changed the package. edc2672 did not touch it.
  - FEATURE_STATUS counts: 27 implemented, 16 partial, 0 broken, 0 missing (FEATURE_STATUS.md:28). FEATURE_STATUS has no rows for track changes, citations, footnote authoring or reference tools. The Advanced brief adds these, and all are Absent.
- **Left open:**
  - RG-12: 14 of 16 DOCX files not checked in Word; no Word for Windows; no LibreOffice; no ODT ever opened elsewhere.
  - TD-53: v0.2 Phase 6 exports opened in Pages only.
  - No on-screen pagination.
  - PDF only through the print dialog; headers, footers and page numbers need Chromium 131+.
  - Lossy DOCX import.
  - TD-2 inline images; TD-38 private docx property; TD-39 ODT expansion; TD-40 main-thread imports; TD-41 raw-XML formatting note.
  - APA/MLA template formatting (an owner decision from v0.2 Phase 4).
  - No user-defined styles or templates.
- **Verdict:** fe3275a is a genuine, substantial delivery of v0.2 Phase 4. It is **not** a complete Advanced M01: the four Review/Insert bullets (DOC-FR-069, -082, -084, -085) are Absent and five Layout bullets (DOC-FR-041, -042, -044, -045, -046) are Partial.

### 4.1 What AE-P1 did and did not do

- Did: read the repository, git history and GitHub state (gh), and wrote the 18 documents in this folder, plus an index (README.md). Seven area audits were consolidated into one canonical planning brief, which every document follows.
- A fact-check pass on 2026-11-15 re-read the cited files, git and gh state and corrected line numbers and counts in these documents. It found one change after the audit snapshot: PR #1's CI run 43719093806 completed green (§3).
- Did not: run any test suite, build, Playwright or dev server; fetch the live Pages site; change any file outside `docs/advanced-edition/`; commit, push, tag or change branches. All "Done" statuses rest on test files and the recorded run of 2026-11-15.

---

## 5. Phase plan

### 5.1 The per-phase gate (brief §13)

Every phase from AE-P2 to AE-P16 runs these ten steps in order. A phase does not start until the previous one is approved, and no two module phases run at the same time.

| Step | Brief wording | What it produces in this project |
|---|---|---|
| 1 | Audit | Re-check the phase's requirement IDs at the current HEAD; update their statuses with `path:line` evidence; take and verify a repository backup bundle (with an off-machine copy, R-037) |
| 2 | Define requirements | Confirm the phase's AC list in [ACCEPTANCE_CRITERIA](ACCEPTANCE_CRITERIA.md), including "re-verify: yes" items from v0.2; record any owner scope decision (D-NN) |
| 3 | Design architecture | Move the phase's proposed ADRs to Accepted (new files in docs/adr from ADR-0015 onwards), with owner approval where they change data formats |
| 4 | Implement | Work on a phase branch (proposed `advanced/ae-pN-<topic>`); append-only migrations behind safety copies; no change to frozen vocabularies |
| 5 | Test | Unit, integration, browser (Chromium, Firefox, WebKit, mobile), persistence, offline, import/export, upgrade, accessibility and performance checks as the ACs require; external application checks with dated records |
| 6 | Review | Diff review of every changed file against brief §8 (code quality rules); cross-review of data-format changes |
| 7 | Fix | Fix review findings; a failed AC is fixed or reported, never skipped (brief §13) |
| 8 | Document | Update FEATURE_STATUS, TECHNICAL_DEBT, RELEASE_GAPS successors, module PRD statuses, ADRs, user-facing docs |
| 9 | Report | A phase report: AC results with evidence, waivers, known limitations, risks changed, decisions needed next |
| 10 | Request approval | Owner approval; no push, tag or deploy without it (brief §14) |

### 5.2 Common entry and exit gates

**Entry (every phase):**
- The previous phase is approved by the owner.
- From AE-P3 onwards: CI is green on main for all jobs (web, e2e including Firefox, backend). AE-P2 is the phase that first makes main green (its exit gate), so it cannot require it on entry.
- A verified backup bundle of the repository has been taken.
- The decisions listed as blocking for the phase are answered.

**Exit (every phase):**
- Every AC assigned to the phase passes with recorded evidence, or the owner explicitly waives it and the waiver is disclosed in the known limitations.
- Items that were Done in v0.2 pass their Advanced AC ("re-verify: yes"). Earlier commits are a head start, not a pass.
- Docs are updated and a phase report is written.
- The owner approves.

**Approval gate (every phase):** the owner approves (a) the start of the phase, (b) any data-format change (DB version, content schema, backup format), (c) any push to main (because main deploys to the live site until D-02 changes this), and (d) the phase exit. Release-specific approvals are in [RELEASE_STRATEGY](RELEASE_STRATEGY.md) §12.

### 5.3 Phase summary

| Phase | Name | Earlier work | Blocking decisions | Main risks (full list in §5.4) | Proposed version at exit (D-06) |
|---|---|---|---|---|---|
| AE-P1 | Complete project audit | 2ccff35 (superseded) | — | R-020 | — |
| AE-P2 | Git, backup and data safety | dbbce17, 468ab89 | D-01–D-06, D-23, D-38, D-39 | R-001, R-002, R-019, R-031 | 0.2.0 |
| AE-P3 | Architecture and shared design system | 2669868; ADRs 0001–0014 | D-07, D-09, D-10, D-11, D-12 (design), D-23, D-24, D-25, D-27, D-29, D-30, D-32, D-35, D-38 | R-003, R-004, R-006, R-012, R-025 | 0.3.0 |
| AE-P4 | Advanced Document Studio (M01) | fe3275a, 206e080, 650cf63 | D-08, D-18, D-22 | R-009, R-010, R-011, R-013 | 0.4.0 |
| AE-P5 | Advanced Diagram Studio (M02) | 8f772ba, 650cf63, 2448a6c, f50b0d4 | D-21, D-22 | R-014, R-015, R-016 | 0.5.0 |
| AE-P6 | Advanced Presentation Studio (M03) | edc2672 | D-19, D-22 | R-017, R-018 | 0.6.0 |
| AE-P7 | Digital Notebook (M04) | none (platform reused) | D-10, D-17 | R-021, R-022 | 0.7.0 |
| AE-P8 | PDF Studio (M05) | none (PDF output libraries) | D-20 | R-023, R-024, R-030, R-101 to R-104 | 0.8.0 |
| AE-P9 | Classroom Hub (M06) | backend skeleton (20d3f4d) | D-13, D-14, D-37, D-45–D-49 | R-005, R-007, R-026, R-027 | 0.9.0 |
| AE-P10 | Collaboration Workspace (M07) | local concurrency, drafts | D-14, D-15, D-16, D-50–D-53 | R-007, R-008, R-028, R-029 | see RELEASE_STRATEGY §3.3 |
| AE-P11 | Advanced File Manager (M08) | trash, favourites, backup, flat list | D-33, D-34, D-42, D-43 | R-003 | see RELEASE_STRATEGY §3.3 |
| AE-P12 | Unified Dashboard and integration (M09) | Dashboard.tsx; INT-01, INT-02 | D-17, D-31, D-44 | R-021 | see RELEASE_STRATEGY §3.3 |
| AE-P13 | Security and performance | — | D-26, D-34 | R-005, R-025 | see RELEASE_STRATEGY §3.3 |
| AE-P14 | Web, macOS, Windows, Android verification | shells as configuration | D-12, D-22, D-28, D-30 | R-032, R-033 | see RELEASE_STRATEGY §3.3 |
| AE-P15 | Final QA and Release Candidate | — | D-40, D-41 | R-021, R-035 | 1.0.0-rc.N |
| AE-P16 | v1.0.0 Stable | — | owner's publish approval | R-093, R-094, R-095 | 1.0.0 |

D-36 (scope cuts) can be raised at any phase. The version column is proposed under D-06; D-06(b) as written ("0.3.x … 0.9.x") does not cover twelve phases, and [RELEASE_STRATEGY](RELEASE_STRATEGY.md) §3.3 sets out the options.

### 5.4 Phase detail

#### AE-P1: Complete project audit

- **Goal:** audit the repository and write the 18 planning documents.
- **Existing work:** 2ccff35 (v0.2 audit of ea7f316; superseded).
- **Remaining scope:** this phase.
- **Entry gate:** owner's brief received (backups/advanced-edition-brief-20261115.md); branch `advanced/phase1-audit` from main at edc2672.
- **Exit gate:** the 18 documents are consistent with each other and with the canonical planning brief; owner approval.
- **Approval gate:** owner approves the documents, the phase plan and the answers (or deferrals) to the AE-P2 decisions D-01 to D-06, D-23, D-38 and D-39.
- **Risks:** R-020.

#### AE-P2: Git, backup and data safety

- **Goal:** a safe, recorded, green baseline before any feature work.
- **Existing work:** dbbce17 (v0.2 Phase 2: bundles, tarballs, .gitignore, data safety report); 468ab89 (MIT licence and Pages deploy).
- **Remaining scope:**
  - Merge PR #1 (D-03) and reach a green CI run on main including Firefox (RG-13). PR #1's run 43719093806 passed all jobs on its branch on 2026-11-15 (§3); main itself has never been green.
  - Gate the Pages deploy on CI (D-02).
  - Branch protection and Dependabot security updates (D-05).
  - Record the public-repository authorisation with a date (D-01).
  - Real git identity for new commits (D-04); history left alone unless the owner decides otherwise.
  - A backup bundle after edc2672, verified, with an off-machine copy; update backups/README.md.
  - Correct the stale documents in §3.3.
  - Tag v0.2.0 and bump manifests if D-06 says so ([RELEASE_STRATEGY](RELEASE_STRATEGY.md) §3).
  - SECURITY.md reporting channel (D-39).
  - CI hardening TD-33: permissions block, SHA-pinned actions, timeouts, coverage floors (D-38).
  - Update TD-1, TD-36 and TD-37 in the register.
- **Entry gate:** AE-P1 approved; decisions D-01 to D-06, D-39 answered (D-23 and D-38 may be answered here or in AE-P3).
- **Exit gate:** CI green on main (all jobs, all four Playwright projects); deploy gated; docs accurate; AC-REL items for AE-P2 pass.
- **Approval gate:** each push to main, the v0.2.0 tag (if any), branch protection changes, and phase exit.
- **Risks:** R-001, R-002, R-019, R-031, R-035, R-037, R-038, R-096, R-099.

#### AE-P3: Architecture and shared design system

- **Goal:** shared foundations before any new module is built.
- **Existing work:** 2669868 (v0.2 Phase 3 storage hardening; ADRs 0001–0010), ADRs 0011–0014.
- **Remaining scope:**
  - Accept ADR-0015 to ADR-0018 and ADR-0024, and settle the ADR-0019 native-storage design under D-12 (all proposed in [SYSTEM_ARCHITECTURE](SYSTEM_ARCHITECTURE.md) and [DATABASE_AND_SYNC_ARCHITECTURE](DATABASE_AND_SYNC_ARCHITECTURE.md)).
  - DB v4 migration: metaUpdatedAt, lastOpenedAt, folderId and tagIds, optional ownerUserId, tombstones, folders and tags stores, activity store (D-35, D-11, D-32). Covered by the upgrade test and the safety copy.
  - Backup format 3 design, with format 2 still readable.
  - Adapter conformance suite (SYS-010).
  - SVC-REF, SVC-ORG and SVC-SEARCH interfaces (interfaces only).
  - Design tokens and new components; contrast fixes (D-09); skip link; accessible drawer (TD-25); ErrorBoundary reset (RG-7/TD-23).
  - Lint and format (D-24); axe (D-25).
  - Performance harness and baselines PERF-001 to PERF-014 on agreed reference hardware (D-29).
  - Web CSP (D-23).
  - Split storage.ts and indexeddb.ts by responsibility without behaviour change; unify the duplicated file pickers and escape helpers.
  - Remove dead code if D-27 approves (TD-42, TD-35).
- **Entry gate:** AE-P2 approved; CI green; decisions listed in §5.3 answered.
- **Exit gate:** v3→v4 upgrade verified in a real browser (upgrade test extended, scripts/upgrade-test.mjs:64-65 store lists updated); conformance suite green; baselines recorded; AC-SYS and AC-A11Y for this phase pass.
- **Approval gate:** DB v4 and backup format 3 designs before implementation; any visible look change (D-09); phase exit.
- **Risks:** R-003, R-004, R-006, R-012, R-025, R-034, R-036, R-040, R-082, R-093, R-097.

#### AE-P4: Complete Advanced Document Studio (M01)

- **Goal:** all DOC-FR requirements meet AC-DOC.
- **Existing work:** fe3275a, 206e080, 650cf63 (statuses in §3.1 and [MODULE_01](MODULE_01_DOCUMENT_STUDIO_PRD.md)).
- **Remaining scope:**
  - Footnotes and endnotes (DOC-FR-069), track changes (082), citations and bibliography (084), cross-references (085), caption numbering and list of figures (067). These need DOCUMENT_SCHEMA 4 and DOCX/ODT writers; reading them back from DOCX needs a custom OOXML reader, because mammoth reads neither comments nor tracked changes.
  - On-screen pagination (DOC-FR-004) per D-18, which also affects DOC-FR-041, 042, 044, 045, 046 and 068.
  - Generated PDF per D-18; TXT import; user styles, templates and fonts (D-18).
  - Pictures as attachments (TD-2, D-08).
  - Imports in a worker (TD-40); TD-38, TD-39, TD-41; DOCX import fidelity.
  - External checks: Word (all 16 samples, Mac and Windows), LibreOffice for DOCX and ODT, OOXML and ODF schema validation (TD-11, RG-12, TD-53).
  - PERF-003, PERF-004, PERF-009.
  - A Simple/Advanced mode policy for the new controls.
- **Entry gate:** AE-P3 approved (DB v4 and SVC-BLOB extensions in place); D-08, D-18 answered; D-22 access to Word/LibreOffice arranged or the corresponding AC waived in advance.
- **Exit gate:** AC-DOC all pass, with dated external-check records.
- **Approval gate:** DOCUMENT_SCHEMA 4 before implementation; phase exit.
- **Risks:** R-009, R-010, R-011, R-013, R-050, R-051, R-052, R-053, R-098.

#### AE-P5: Advanced Diagram Studio (M02)

- **Goal:** all DGM-FR requirements meet AC-DGM.
- **Existing work:** 8f772ba, 650cf63, plus 2448a6c and f50b0d4.
- **Remaining scope:**
  - Concept maps (DGM-FR-012); Venn depth (008).
  - Smart guides (081), original code; presentation-studio/src/editor/guides.ts may be adapted.
  - Reusable components and user library (084); multiple pages (085, schema 4).
  - General layout (080) per D-21; obstacle-aware routing (067).
  - Editor controls for shape properties (082, TD-43), colour picker and saved styles (083).
  - Context-aware Quick Connect palette; Quick Connect reference (D-22).
  - External diagrams.net round trip with real diagrams.net files (TD-46).
  - .drawio size and inflate caps.
  - Longer node and edge ids for collaboration (R-015).
  - Remove TD-42 (if D-27 approved).
  - PERF-006 measured.
- **Entry gate:** AE-P4 approved; D-21 answered; D-22 diagrams.net access arranged.
- **Exit gate:** AC-DGM all pass.
- **Approval gate:** DIAGRAM_SCHEMA 4 before implementation; phase exit.
- **Risks:** R-014, R-015, R-016, R-054, R-055, R-056, R-057, R-098.

#### AE-P6: Advanced Presentation Studio (M03)

- **Goal:** all PRS-FR requirements meet AC-PRS.
- **Existing work:** edc2672 (ADR 0014).
- **Remaining scope:**
  - Grouping (PRS-FR-029), selection pane (028), animation timeline (044), exit and emphasis effects (043): PRESENTATION_SCHEMA 2 plus a migration.
  - Masters per D-19 (PptxGenJS supports one master, TD-56).
  - Editing UI for cell merge and split (022; the schema-1 vocabulary already stores merged cells, so no schema change); crop handles; user templates.
  - Real-application checks (062): PowerPoint, Keynote, LibreOffice; playback of transitions and animations (TD-55).
  - PDF fonts (061, TD-57).
  - Presenter mode on real hardware (041, TD-58).
  - Firefox (TD-62).
  - Presentations added to the privacy and offline e2e.
  - PERF-007; slide-list virtualisation.
- **Entry gate:** AE-P5 approved; D-19 answered; D-22 application access arranged.
- **Exit gate:** AC-PRS all pass.
- **Approval gate:** PRESENTATION_SCHEMA 2 before implementation; phase exit.
- **Risks:** R-017, R-018, R-060, R-061, R-062, R-098, R-100.

#### AE-P7: Digital Notebook (M04)

- **Goal:** a new `notebook` item kind meeting AC-NBK.
- **Existing work:** none for the module. Reused: Tiptap 3 extension set and DOCX/print export (M01), autosave, drafts, version history, favourites, trash, KaTeX.
- **Remaining scope:** NBK-FR-001 to NBK-FR-022 (001–018 from the brief; 019–022 added by [MODULE_04](MODULE_04_DIGITAL_NOTEBOOK_PRD.md)); the notebook kind and its migration (ADR-0015 (a)); ADR-0025 content model; ink layer; first SVC-SEARCH indexer; SVC-ORG subjects; INT-07; PDF export.
- **Entry gate:** AE-P6 approved; D-10 and D-17 answered.
- **Exit gate:** AC-NBK pass, including offline, persistence, upgrade and import/export tests.
- **Approval gate:** the new DB version before implementation; phase exit.
- **Risks:** R-021, R-022, R-063, R-064, R-065, R-066.

#### AE-P8: PDF Studio (M05)

- **Goal:** a new `pdf` item kind meeting AC-PDF.
- **Existing work:** none for the module; PDF output libraries (jsPDF 4.2.1, svg2pdf.js 2.8.1).
- **Remaining scope:** PDF-FR-001 to PDF-FR-025 (001–019 from the brief; 020–025 added by [MODULE_05](MODULE_05_PDF_STUDIO_PRD.md)); the pdf kind; ADR-0017 and ADR-0023; dependency reviews of pdf.js and pdf-lib (candidates); OCR evaluation report (PDF-FR-016, evaluation only); PERF-010; backup format 3 for large files.
- **Entry gate:** AE-P7 approved; D-20 answered; dependency reviews accepted.
- **Exit gate:** AC-PDF pass, including tests on real-world PDFs (forms, scanned, encrypted, large) and exported files checked in an independent PDF reader.
- **Approval gate:** new dependencies; the new DB version; backup format 3; phase exit.
- **Risks:** R-023, R-024, R-030, R-101, R-102, R-103, R-104.

#### AE-P9: Classroom Hub (M06)

- **Goal:** an optional, self-hosted classroom host with accounts, classrooms and assignments meeting AC-CLS.
- **Existing work:** backend skeleton (20d3f4d); design DDL only (docs/DATABASE.md:56-112, stale).
- **Remaining scope:** all CLS-FR requirements; ADR-0020 (accounts, roles, sessions, Argon2id); classroom host persistence on SQLite; SVC-SYNC item exchange and operation queue (ADR-0021 part 1); INT-03, INT-04; client classroom cache; student data protection; pinned Python (D-37).
- **Entry gate:** AE-P8 approved; D-13, D-14, D-37 and D-45 to D-49 answered.
- **Exit gate:** AC-CLS and the AC-SEC for this phase pass; a security review of the host.
- **Approval gate:** the host deployment model; any network exposure; phase exit.
- **Risks:** R-005, R-007, R-026, R-027, R-076 to R-080.

#### AE-P10: Collaboration Workspace (M07)

- **Goal:** explicit sharing and live co-editing on the local network meeting AC-COL.
- **Existing work:** local concurrency (ADR 0003) and drafts only.
- **Remaining scope:** all COL-FR requirements; ADR-0022 spike (transports, secure-context constraints); Yjs integration for documents (D-16); awareness; share, invite, revoke; reconnection and conflict recovery; INT-08; PERF-012.
- **Entry gate:** AE-P9 approved; D-14, D-15, D-16 and D-50 to D-53 answered; spike result accepted.
- **Exit gate:** AC-COL pass, including multi-device and network-cut tests.
- **Approval gate:** new dependencies (Yjs family, candidates); transport choice; phase exit.
- **Risks:** R-007, R-008, R-028, R-029, R-070 to R-075.

#### AE-P11: Advanced File Manager (M08)

- **Goal:** folders, tags, previews and bulk operations across all kinds meeting AC-FIL.
- **Existing work:** trash, favourites and backup (v0.2 Phase 2/3); the flat list.
- **Remaining scope:** folder and tag UI (data from AE-P3); previews; multi-select bulk operations; persisted and tested filters and sorting; import into folders and drag-and-drop; export from the list; version history from the list; a true storage breakdown (bytes, including attachments and versions; R-040); trash retention (D-33); backup scheduling (D-34); INT-05.
- **Entry gate:** AE-P10 approved; D-33, D-34, D-42, D-43 answered.
- **Exit gate:** AC-FIL pass.
- **Approval gate:** phase exit.
- **Risks:** R-003, R-040, R-081, R-083 to R-086.

#### AE-P12: Unified Dashboard and cross-module integration (M09)

- **Goal:** one workspace entry point and end-to-end verification of INT-01 to INT-09.
- **Existing work:** Dashboard.tsx; INT-01, INT-02.
- **Remaining scope:** all DSH-FR requirements; global search entry and index across all kinds (INT-09); activity timeline; classroom and subject panels; customisable workspace; app-level shortcuts; INT-06; end-to-end verification of INT-01 to INT-09; diagram and slide provenance (SVC-REF).
- **Entry gate:** AE-P11 approved; D-17, D-31, D-44 answered.
- **Exit gate:** AC-DSH and AC-INT pass.
- **Approval gate:** phase exit.
- **Risks:** R-021, R-087 to R-092, R-099.

#### AE-P13: Security and performance

- **Goal:** the whole system passes AC-SEC and AC-PERF.
- **Remaining scope:** threat model review; penetration-style tests of the classroom host; CSP; import caps; backup encryption (D-34); SBOM (D-26); dependency re-review; full PERF run against the AE-P3 baselines; memory profiling; accessibility audit.
- **Entry gate:** AE-P12 approved; D-26 answered.
- **Exit gate:** AC-SEC and AC-PERF pass; no open critical or high finding.
- **Approval gate:** phase exit.
- **Risks:** R-005, R-025, R-034, R-036.

#### AE-P14: Web, macOS, Windows and Android verification

- **Goal:** built, installable and tested builds on every target platform (PLT-001 to PLT-008).
- **Existing work:** Tauri 2 and Capacitor 7 configuration only.
- **Remaining scope:** make Tauri and Capacitor build (icons, lock files, shells in the licence and audit gates, TD-30); platform detection so the service worker is not registered in webviews (TD-31); native save, print and share (TD-28); native storage per D-12; signing per D-28; CI build jobs; device testing on PLT-001 to PLT-008 ([RELEASE_STRATEGY](RELEASE_STRATEGY.md) §8).
- **Entry gate:** AE-P13 approved; D-12, D-28, D-30 answered; D-22 Windows machine and Android device available.
- **Exit gate:** AC-PLT pass on real machines and devices, with dated records.
- **Approval gate:** installing toolchains on the machine; any signing purchase; phase exit.
- **Risks:** R-032, R-033, R-039, R-094, R-095.

#### AE-P15: Final QA and Release Candidate

- **Goal:** a release candidate that meets every brief §15 item except the final publish.
- **Remaining scope:** full regression; manual acceptance checklist rebuilt; external compatibility evidence complete; known limitations written; reproducible builds (locked Rust and Python dependencies); `v1.0.0-rc.N` per [RELEASE_STRATEGY](RELEASE_STRATEGY.md) §5.
- **Entry gate:** AE-P14 approved; D-40, D-41 answered.
- **Exit gate:** all brief §15 items pass apart from the final publish (release checklist, [RELEASE_STRATEGY](RELEASE_STRATEGY.md) §6).
- **Approval gate:** each RC tag; RC distribution to testers; phase exit.
- **Risks:** R-021, R-035, R-098.

#### AE-P16: Digital Classroom OS v1.0.0 Stable

- **Goal:** publish v1.0.0.
- **Remaining scope:** owner approval; tag `v1.0.0` on the approved RC commit; GitHub release with checksums and SBOM; a deploy of the release tag only; rollback plan in place.
- **Entry gate:** AE-P15 approved with no open critical or high issue and no known data-loss bug.
- **Exit gate:** owner's explicit approval to publish (brief §15).
- **Approval gate:** publication itself.
- **Risks:** R-093, R-094, R-095.

### 5.5 Ordering rationale and critical path

- Data-format work is front-loaded in AE-P3 (DB v4, tombstones, metaUpdatedAt, folders and tags, backup format 3 design) so that later module phases add kinds instead of reshaping existing records, and so sync (AE-P9, AE-P10) has the fields it needs (R-008).
- The design system comes before new screens (R-006, R-036).
- Each content-kind addition (AE-P7 notebook, AE-P8 pdf) is a separate DB migration unless the owner chooses to batch them (ADR-0015 (a) alternative).
- Networked work (AE-P9, AE-P10) is late because it depends on identity, permissions and the sync fields, and it carries the highest security risk.
- AE-P14 depends on owner-supplied hardware and signing decisions (D-22, D-28); arranging these early avoids a late block (R-032, R-098).
- Critical path (as in [MODULE_DEPENDENCY_MAP](MODULE_DEPENDENCY_MAP.md) §5.3): AE-P2 green CI → AE-P3 DB v4 and SVC interfaces → AE-P8 PDF kind and backup format 3 → AE-P9 identity and sync → AE-P10 → AE-P12 integration → AE-P14 platforms → AE-P15 RC → AE-P16. The other phases are off this path but still run one at a time in brief order.

### 5.6 Scope-cut candidates (D-36)

If the schedule requires it, these are candidates to defer to after 1.0, each to be disclosed as a known limitation: OCR (beyond the evaluation), WebRTC transport, remote sync, multiple diagram pages, the animation timeline, citations. Deferral needs the owner's decision and a corresponding AC waiver.

---

## 6. Owner decisions (D-NN)

"Blocks" names the earliest phase that needs the answer. Proposed defaults are proposals only; none is decided by this document. D-01 to D-39 come from the canonical planning brief; D-40 and D-41 come from the release strategy; D-42 to D-53 number the questions that the module PRDs asked this roadmap to add.

| ID | Decision | Options / proposed default | Blocks |
|---|---|---|---|
| D-01 | Repository visibility | The repo is PUBLIC by the owner's explicit choice, against the brief's "private unless authorised". **Record the authorisation** (dated, in AE-P2) | AE-P2 |
| D-02 | Live GitHub Pages site during development | (a) keep deploying every push to main (today; failing CI was deployed twice); (b) **gate the deploy on green CI** (proposed); (c) deploy only from release tags. Each DB migration reaches every visitor at once | AE-P2 |
| D-03 | PR #1 | Merge once CI is green (proposed) and require green CI including Firefox before AE-P2 exits. Its run 43719093806 on 4983af4 was green on 2026-11-15 (§3); merging still needs the owner's approval, and main must then pass on its own run | AE-P2 |
| D-04 | Git identity and history | Provide a real author name and email for future commits. Leave the placeholder history alone, because rewriting needs a force-push to a public repo (proposed: leave it) | AE-P2 |
| D-05 | Branch protection and Dependabot security updates on main | Proposed: yes | AE-P2 |
| D-06 | Versioning | (a) tag `v0.2.0` now to close the old programme and bump manifests (About shows 0.1.0); (b) go 0.3.x … 0.9.x per AE phase, then 1.0.0-rc.N in AE-P15 and 1.0.0 in AE-P16 (proposed: (a) and (b)). See RELEASE_STRATEGY §3 for the commit to tag and the numbering beyond AE-P9 | AE-P2 |
| D-07 | Reversible migrations | Accept "safety copy plus backup, older builds fail closed" as "reversible where practical", or require down-migrations | AE-P3 |
| D-08 | Move document pictures to attachments (TD-2) | Proposed: yes in AE-P4. Means DOCUMENT_SCHEMA 4 | AE-P4 |
| D-09 | Design-system token changes that alter the live look (contrast fixes) | Proposed: yes | AE-P3 |
| D-10 | Shared rich-text package for Notebook | Extract `@dcos/rich-text` (proposed) or allow notebook to depend on document-studio | AE-P3/P7 |
| D-11 | File organisation model | Folders with a single parent plus tags (proposed), or tags only, or multiple parents. Subjects as a folder type? | AE-P3 |
| D-12 | Native storage | Option A: IndexedDB in the webview for the first native builds. Option B: SQLite adapters plus a first-launch migration (brief preference) | AE-P3 design, AE-P14 |
| D-13 | Classroom host and accounts | A self-hosted FastAPI host with SQLite on a teacher or school machine, optional for personal use (proposed). Who runs it, on what OS? Should the desktop app bundle it as a sidecar? | AE-P9 |
| D-14 | LAN security | HTTPS with locally trusted certificates for browser clients versus native-only LAN collaboration (ADR-0022) | AE-P9/P10 |
| D-15 | Remote sync | LAN-only for v1.0.0 (proposed), or an optional self-hosted internet-reachable relay. No paid SaaS either way | AE-P10 |
| D-16 | Live co-editing scope | Documents only for v1.0.0 (proposed), or also presentations and diagrams | AE-P10 |
| D-17 | Global search scope | Titles plus full content of all kinds (proposed), PDF text included, trash excluded | AE-P7/P12 |
| D-18 | M01 scope | Real on-screen pagination? Track changes, citations (which styles), footnotes, cross-references? Generated PDF versus the print dialog? TXT import? User styles and templates, bundled open fonts? APA/MLA templates at schema 2? | AE-P4 |
| D-19 | M03 scope | Grouping, a selection pane, an animation timeline, exit and emphasis effects (all need PRESENTATION_SCHEMA 2)? Multiple masters (PptxGenJS supports one master; a custom writer would be needed)? User templates? PPTX import? Embedded PDF fonts? | AE-P6 |
| D-20 | M05 scope | Lossy compression allowed? OCR stays evaluation-only (proposed)? Maximum PDF size and per-attachment cap (DATABASE_AND_SYNC §3.6 proposes 200 MB on the web)? Does a local neural-network OCR engine such as Tesseract count as "AI" under brief §11 (proposed: yes, so it stays out of v1.0.0; DEPENDENCY_AND_LICENCE_PLAN §4.5)? | AE-P8 |
| D-21 | M02 scope | Multiple pages and reusable components (schema 4)? Layout engine (dagre or original versus a licence exception)? Concept-map and Venn depth? | AE-P5 |
| D-22 | External compatibility checks | Provide licensed Word (Mac and/or Windows), allow LibreOffice to be installed, PowerPoint/Keynote access, diagrams.net desktop, a Windows machine and an Android device. Supply the diagrams.net Quick Connect reference or accept the current behaviour | AE-P4/P5/P6/P14 |
| D-23 | Web CSP | A meta CSP on Pages now (proposed), or move to a host that can send headers | AE-P2/P3 |
| D-24 | Lint and format | Adopt now, accepting a one-off formatting diff (proposed), or for new code only | AE-P3 |
| D-25 | `@axe-core/playwright` (candidate; reported as MPL-2.0, licence to verify) licence approval | — | AE-P3 |
| D-26 | SBOM format and coverage | CycloneDX covering npm, Python and Rust (proposed) | AE-P13 |
| D-27 | Remove dead code and empty placeholders | TD-42 (a public API change) and TD-35 empty backend packages | AE-P3 |
| D-28 | Native signing | Apple Developer ID and notarisation (yearly fee), a Windows code-signing certificate (cost), an Android keystore. Or ship unsigned builds with warnings for v1.0.0 | AE-P14 |
| D-29 | Reference hardware for performance targets and approval of the PERF numbers | — | AE-P3 |
| D-30 | Platform matrix and minimum versions | PLT-001 to PLT-008 (RELEASE_STRATEGY §8.1) | AE-P3/P14 |
| D-31 | Dashboard panels for modules that do not exist yet | Hide until the module ships (proposed) | AE-P12 |
| D-32 | "Recent" meaning | Last opened (proposed, using lastOpenedAt) or last edited | AE-P3 |
| D-33 | Trash retention | Keep forever (today) or purge automatically after N days | AE-P11 |
| D-34 | Backups | Include preferences, tabs and drafts? Scheduled or automatic backups on desktop? Passphrase encryption required once classroom data exists? | AE-P11/P13 |
| D-35 | Tombstones and metaUpdatedAt in DB v4 before any sync work | Proposed: yes | AE-P3 |
| D-36 | Scope cuts | If the schedule requires it, candidates to defer to after 1.0: OCR, WebRTC, remote sync, multiple diagram pages, animation timeline, citations | Any |
| D-37 | Python version | 3.12 (CI) as the pinned version (proposed); pin the dependencies | AE-P9 |
| D-38 | Coverage floors and the upgrade test in CI | Proposed: run `test:coverage` in CI; add the upgrade test as a scheduled or manual job | AE-P2/P3 |
| D-39 | Security reporting channel for the public repo | Enable GitHub private vulnerability reporting (proposed; it is off today, gh api 2026-11-15) | AE-P2 |
| D-40 | Native distribution channels for v1.0.0 | (a) GitHub Releases only: .dmg, .msi/NSIS installer, signed APK (proposed for v1.0.0); (b) also store distribution (Mac App Store, Microsoft Store, Google Play), which adds store review, store accounts and, for Play, an AAB and a target-API policy. See RELEASE_STRATEGY §8 | AE-P15 |
| D-41 | Where release candidates of the web app are tested | (a) RC built and served locally and on testers' machines only, Pages stays on the last approved build (proposed); (b) a separate preview deployment; (c) deploy the RC to the live Pages site. Option (c) puts RC migrations on every visitor's data (R-002, R-093) | AE-P15 |
| D-42 | UI wording "Favorites" versus British "Favourites" (raised by MODULE_08) | Keep the existing UI strings until approved; if changed, change strings and e2e selectors together (e2e/backup-restore.spec.ts:169) | AE-P11 |
| D-43 | A generic "file" item kind for arbitrary files such as images or spreadsheets (raised by MODULE_08) | Out of scope for v1.0.0 unless approved (MODULE_08 default); if approved, stored as SVC-BLOB attachments with a new kind and migration | AE-P11 (design in AE-P3) |
| D-44 | A personal due-date field on items for the Deadlines panel (raised by MODULE_09, DSH-FR-008) | Assignment due dates only (default), or an additive personal due-date field | AE-P12 (field in AE-P3 if approved) |
| D-45 | Deadline rule for queued offline submissions (raised by MODULE_06) | Host receive time only, or the client's recorded submit time within a grace window (device clocks can be wrong) | AE-P9 |
| D-46 | Admin access to submissions and grades (MODULE_06) | Admins see metadata only, or also content and grades | AE-P9 |
| D-47 | Retention and export of student data on the classroom host after archive or deletion (MODULE_06) | The owner confirms which data-protection rules apply to the schools that will use it; this plan does not interpret law | AE-P9 |
| D-48 | Grading scales (MODULE_06) | Numeric score and free label only, or also weighted categories and letter-grade mapping | AE-P9 |
| D-49 | Teacher templates distributed as materials (MODULE_06) | Copied into the student's workspace automatically on "Start work", or on request | AE-P9 |
| D-50 | Former collaborator's copy after revocation (MODULE_07) | Keeps a private read-only copy of the last state, or the cached copy is removed with notice (a device cannot be forced to delete data it already has) | AE-P10 |
| D-51 | View-only links without a host account (MODULE_07) | Named accounts only (MODULE_07 assumption), or anonymous view links | AE-P10 |
| D-52 | Offline duration that triggers a pre-merge snapshot and review notice (MODULE_07) | A threshold to be set by the owner | AE-P10 |
| D-53 | Shared items' host data in host backups and retention after sharing stops (MODULE_07) | Included by default or not; retention period | AE-P10 |

---

## 7. Approval requested at the end of AE-P1

1. Approve the 18 documents as the plan of record (or list changes).
2. Answer, or explicitly defer, the AE-P2 decisions: D-01, D-02, D-03, D-04, D-05, D-06, D-39, and preferably D-23 and D-38.
3. Approve the start of AE-P2.

No AE-P2 work starts before this approval.
