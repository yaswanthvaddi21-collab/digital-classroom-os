# Advanced Edition planning documents

This folder holds the AE-P1 (Phase 1 of the Advanced Edition) audit and plan for taking Digital Classroom OS from HEAD `edc2672` to "Digital Classroom OS Advanced Edition v1.0.0 Stable". The owner's brief that asked for these documents is kept verbatim in `backups/advanced-edition-brief-20261115.md` (git-ignored, this machine only). Nothing in this folder changes application code; every statement that something exists or works cites a file and line, a test, a commit or a dated record.

**Status: AE-P1 approved by the owner on 2026-11-15; plan of record. Decisions D-NN stay open until recorded as decided.** The documents were written in parallel, fact-checked against the code, then cross-checked for consistency (see "Consolidation record" below).

---

## 1. The 18 documents

| # | Document | What it is |
|---|---|---|
| 1 | [ADVANCED_EDITION_PRODUCT_ROADMAP.md](ADVANCED_EDITION_PRODUCT_ROADMAP.md) | Top-level plan: current state, the fe3275a verification, phases AE-P1 to AE-P16 with gates, and the owner decisions D-01 to D-53 |
| 2 | [MODULE_01_DOCUMENT_STUDIO_PRD.md](MODULE_01_DOCUMENT_STUDIO_PRD.md) | M01 Advanced Document Studio (DOC): Partial today; footnotes, track changes, citations and reference tools Absent |
| 3 | [MODULE_02_DIAGRAM_STUDIO_PRD.md](MODULE_02_DIAGRAM_STUDIO_PRD.md) | M02 Advanced Diagram Studio (DGM): Partial; concept maps, smart guides, components and multiple pages Absent |
| 4 | [MODULE_03_PRESENTATION_STUDIO_PRD.md](MODULE_03_PRESENTATION_STUDIO_PRD.md) | M03 Advanced Presentation Studio (PRS): Partial; grouping, animation timeline and real-application checks Absent |
| 5 | [MODULE_04_DIGITAL_NOTEBOOK_PRD.md](MODULE_04_DIGITAL_NOTEBOOK_PRD.md) | M04 Digital Notebook (NBK): Absent (README stub); a new `notebook` kind |
| 6 | [MODULE_05_PDF_STUDIO_PRD.md](MODULE_05_PDF_STUDIO_PRD.md) | M05 PDF Studio (PDF): Absent (README stub); a new `pdf` kind; PDF exists only as output today |
| 7 | [MODULE_06_CLASSROOM_HUB_PRD.md](MODULE_06_CLASSROOM_HUB_PRD.md) | M06 Classroom Hub (CLS): Absent; packages and backend folders are stubs; the optional classroom host |
| 8 | [MODULE_07_COLLABORATION_PRD.md](MODULE_07_COLLABORATION_PRD.md) | M07 Collaboration Workspace (COL): Absent apart from local properties (privacy, offline, local comments and history) |
| 9 | [MODULE_08_FILE_MANAGER_PRD.md](MODULE_08_FILE_MANAGER_PRD.md) | M08 Advanced File Manager (FIL): Partial (flat list); owns the SVC-ORG contract (FIL-IF-001) |
| 10 | [MODULE_09_DASHBOARD_PRD.md](MODULE_09_DASHBOARD_PRD.md) | M09 Unified Dashboard and Workspace (DSH): Partial; owns the SVC-SEARCH contract (DSH-IF-001) |
| 11 | [SYSTEM_ARCHITECTURE.md](SYSTEM_ARCHITECTURE.md) | Architecture today and target: shared services SVC-*, package boundaries, SYS/A11Y/PERF requirements, proposed ADR-0015 to ADR-0025 |
| 12 | [DATABASE_AND_SYNC_ARCHITECTURE.md](DATABASE_AND_SYNC_ARCHITECTURE.md) | IndexedDB v3 today; DB v4+ store plan, migration rules, backup format 3, native SQLite options, host data model, sync (SYN) and co-editing |
| 13 | [DEPENDENCY_AND_LICENCE_PLAN.md](DEPENDENCY_AND_LICENCE_PLAN.md) | Current dependencies and licence gates, review policy, candidate libraries per phase (all "licence to verify"), SBOM plan, DEP requirements |
| 14 | [MODULE_DEPENDENCY_MAP.md](MODULE_DEPENDENCY_MAP.md) | Which module uses which service and module; owns integration contracts INT-01 to INT-09 and the host contracts; build order and critical path |
| 15 | [ACCEPTANCE_CRITERIA.md](ACCEPTANCE_CRITERIA.md) | Cross-cutting criteria (AC-SYS, SYN, SEC, A11Y, PERF, DEP, PLT, REL, INT), a per-module summary and the phase and release gate checklists |
| 16 | [SECURITY_AND_PRIVACY_PLAN.md](SECURITY_AND_PRIVACY_PLAN.md) | Current posture, threat model, permission matrix, student data protection, SEC requirements and security testing |
| 17 | [RISK_REGISTER.md](RISK_REGISTER.md) | 90 risks (R-001 to R-040, R-050 to R-057, R-060 to R-066, R-070 to R-104) with likelihood, impact, owner phase and status; owns R-NNN numbering |
| 18 | [RELEASE_STRATEGY.md](RELEASE_STRATEGY.md) | Versioning, branches and tags, RC process, brief §15 checklist, reproducibility, platform matrix PLT-001 to PLT-008, signing, rollback, REL requirements |
| + | [GOOGLE_DRIVE_INTEGRATION_PLAN.md](GOOGLE_DRIVE_INTEGRATION_PLAN.md) | Owner's request of 2026-11-15, planning only: optional Google Drive integration (GDR) with `drive.file` and the Picker, the web token model, architecture, scope justification, security review, phases GDR-0 to GDR-9, tests, Google Cloud setup; risks R-113 to R-127 and decisions D-54 to D-66 are defined there |

## 2. How to read them

1. Start with the **roadmap**: §3 (current state), §4 (fe3275a verification), §5 (phases) and §6 (decisions).
2. Then the **module PRD** for the phase in question. Every PRD has a "Current state" section and the 12 sections the brief requires (objectives, user stories, functional, non-functional and UI/UX requirements, data model, technical architecture, dependencies, interface contracts, acceptance criteria, test strategy, known risks).
3. For anything shared between modules, go to the document that owns it (table below). A PRD references a shared service or contract; it never defines its own copy.
4. Use **ACCEPTANCE_CRITERIA** §5 for the gate checklists and **RISK_REGISTER** for the risks a phase owns.

Where two documents could disagree, this is the owner of each topic:

| Topic | Owning document |
|---|---|
| Phases, phase scope and gates; owner decisions D-NN | ADVANCED_EDITION_PRODUCT_ROADMAP §5, §6 |
| Module requirements and the wording of module criteria (AC-DOC … AC-DSH) | The module PRD §3–§5 and §10 (ACCEPTANCE_CRITERIA §4 only summarises) |
| Cross-cutting criteria (AC-SYS, AC-SYN, AC-SEC, AC-A11Y, AC-PERF, AC-DEP, AC-PLT, AC-REL, AC-INT) | ACCEPTANCE_CRITERIA §2 |
| List of shared services and their state; SVC-ACT event names; package boundaries | SYSTEM_ARCHITECTURE §5, §6.2 |
| SVC-ORG contract (`OrganisationService`) | MODULE_08 §9.1 (FIL-IF-001) |
| SVC-SEARCH contract (`SearchService`, `TextExtractor`); each studio's extractor is wrapped as one `TextExtractor` | MODULE_09 §9.1 (DSH-IF-001) |
| Sharing and co-editing client contracts | MODULE_07 §9 (COL-IF-001, COL-IF-002) |
| Integration contracts INT-01 to INT-09 and host contracts (`ClassroomHost`, `NotebookHost`, `ShareHost`, `PreviewProvider`) | MODULE_DEPENDENCY_MAP §4 |
| Stores, keys, indexes, DB versions, item record fields | DATABASE_AND_SYNC_ARCHITECTURE §3 |
| Classroom host entities / sharing host entities | MODULE_06 §6.1 / MODULE_07 §6.1 (DATABASE_AND_SYNC_ARCHITECTURE §6 is the overview with a name mapping) |
| Permission matrix | SECURITY_AND_PRIVACY_PLAN §5.4 (MODULE_06 §7.4 is a summary) |
| Library candidates and licence status | DEPENDENCY_AND_LICENCE_PLAN §2, §6 |
| Risk numbers and ratings | RISK_REGISTER |
| Versions, tags, REL and PLT requirements | RELEASE_STRATEGY |

## 3. Status vocabulary

Feature and requirement statuses (roadmap §2.1):

| Word | Meaning |
|---|---|
| **Done** | Implemented, with a test file and a recorded passing run (the local full verification of 2026-11-15, docs/audit/RELEASE_GAPS.md:257-265). "Done" means "Done (v0.2)": it still has to pass its Advanced criterion ("re-verify: yes") |
| **Partial** | Some of it exists; the evidence column says exactly which part |
| **Stub** | A placeholder or scaffold only (README, empty `__init__.py`, unbuilt configuration) |
| **Absent** | Nothing exists |
| **Unverified** | Cannot be determined; the reason is given |

Risk statuses are different words (Open, Realised, Mitigating, Closed; RISK_REGISTER §1). Proposals are marked "Proposed, needs approval". A library that is not installed is always a "candidate, licence to verify". Nothing was run in AE-P1 (no tests, builds, Playwright or dev servers).

## 4. Identifier schemes

| Scheme | Meaning | Defined in |
|---|---|---|
| AE-P1 … AE-P16 | Advanced Edition phases (brief §12). The earlier programme is always written "v0.2 Phase n"; a bare "Phase n" is not used | Roadmap §2.2, §5 |
| M01 … M09 | Modules | Roadmap §3.1 |
| `<PFX>-FR-NNN`, `-NFR-NNN`, `-UX-NNN`, `-IF-NNN` | Module requirements; PFX = DOC, DGM, PRS, NBK, PDF, CLS, COL, FIL, DSH. Rows marked "(new)" were added beyond the brief's bullet list | Each PRD |
| `AC-<PFX>-NNN` | Acceptance criterion mirroring a requirement: FR n → AC n; NFR n → 500 + n; UX n → 700 + n; IF n → 900 + n. A letter suffix splits one requirement (AC-DOC-069a/b); a range row (AC-DGM-020 … 031) is one criterion per ID | ACCEPTANCE_CRITERIA §1.1 |
| SYS-NNN, SYN-NNN, A11Y-NNN, PERF-NNN | Architecture, data, sync, accessibility and performance requirements (SYS-001 … 029 and 060 … 079 in SYSTEM_ARCHITECTURE; SYS-030 … 059 and SYN in DATABASE_AND_SYNC) | SYSTEM_ARCHITECTURE §1 |
| SEC-NNN, DEP-NNN, PLT-NNN, REL-NNN | Security, dependency, platform and release requirements | SECURITY plan §8; DEPENDENCY plan §9; RELEASE_STRATEGY §8.1, §13 |
| SVC-<NAME> | 16 shared services: ITEM, STORE, BLOB, REF, ORG, SEARCH, ACT, HOST, IO, BACKUP, ID, PERM, SYNC, COLLAB, UI, PLAT | SYSTEM_ARCHITECTURE §5 |
| INT-01 … INT-09 | Cross-module integration contracts (brief §5); criteria AC-INT-01 … 09 | MODULE_DEPENDENCY_MAP §4 |
| R-NNN | Risks. R-041 … R-049, R-058, R-059 and R-067 … R-069 are unused; new risks start at R-105 | RISK_REGISTER §5 |
| D-NN | Owner decisions D-01 … D-53 | Roadmap §6 |
| ADR 00NN / ADR-00NN | Existing accepted ADRs 0001 … 0014 in docs/adr are written "ADR 00NN"; proposed ADR-0015 … ADR-0025 (not yet files) are written "ADR-00NN" | SYSTEM_ARCHITECTURE §11 |
| TD-NN, RG-NN | Existing technical-debt and release-gap items; numbers unchanged | docs/audit/TECHNICAL_DEBT.md, RELEASE_GAPS.md |

## 5. Owner decisions

The roadmap §6 holds the options, proposed defaults and the phase each decision blocks. None is decided by these documents.

| ID | Decision (one line) |
|---|---|
| D-01 | Record the dated authorisation for the public repository |
| D-02 | Live Pages site during development: keep deploying every push, gate the deploy on green CI (proposed), or deploy only from tags |
| D-03 | Merge PR #1 (its branch run 43719093806 was green) and require green CI including Firefox before AE-P2 exits |
| D-04 | Real git identity for new commits; leave the placeholder history alone (proposed) |
| D-05 | Branch protection and Dependabot security updates on main |
| D-06 | Versioning: tag v0.2.0 and bump manifests; how phases map to 0.x versions (RELEASE_STRATEGY §3.3) |
| D-07 | Accept "safety copy plus backup, older builds fail closed" as reversible migrations, or require down-migrations |
| D-08 | Move document pictures to attachments (TD-2, DOCUMENT_SCHEMA 4) |
| D-09 | Design-token changes that alter the live look (contrast fixes) |
| D-10 | Shared `@dcos/rich-text` package for Notebook, or let notebook depend on document-studio |
| D-11 | File organisation model: single-parent folders plus tags (proposed), tags only, or multiple parents; subjects as a folder type |
| D-12 | Native storage: webview IndexedDB first, or SQLite adapters plus a first-launch migration |
| D-13 | Classroom host and accounts: who runs it, on what OS; bundled as a desktop sidecar or not |
| D-14 | LAN security: HTTPS with locally trusted certificates for browsers, or native-only LAN collaboration |
| D-15 | Remote sync: LAN-only for v1.0.0 (proposed) or an optional self-hosted relay |
| D-16 | Live co-editing scope: documents only for v1.0.0 (proposed), or also presentations and diagrams |
| D-17 | Global search scope: titles plus full content of all kinds, PDF text included, trash excluded (proposed) |
| D-18 | M01 scope: on-screen pagination, track changes, citations and styles, footnotes, cross-references, generated PDF, TXT import, user styles and fonts |
| D-19 | M03 scope: grouping, selection pane, timeline, effects, multiple masters, user templates, PPTX import, embedded PDF fonts |
| D-20 | M05 scope: lossy compression, OCR evaluation-only, maximum PDF size, and whether local OCR counts as "AI" |
| D-21 | M02 scope: multiple pages, reusable components, layout engine licence, concept-map and Venn depth |
| D-22 | External checks: provide Word, LibreOffice, PowerPoint/Keynote, diagrams.net, a Windows machine, an Android device and the Quick Connect reference |
| D-23 | Web CSP: meta CSP on Pages now (proposed), or move to a host that can send headers |
| D-24 | Lint and format: adopt now with a one-off formatting diff (proposed), or for new code only |
| D-25 | Approve `@axe-core/playwright` (candidate; reported MPL-2.0, licence to verify) as a test-only tool |
| D-26 | SBOM format and coverage (CycloneDX for npm, Python and Rust proposed) |
| D-27 | Remove dead code and empty placeholders (TD-42 public API, TD-35 empty backend packages) |
| D-28 | Native signing: paid certificates and notarisation, or unsigned builds with warnings for v1.0.0 |
| D-29 | Reference hardware for performance targets and approval of the PERF numbers |
| D-30 | Platform matrix and minimum versions (PLT-001 to PLT-008) |
| D-31 | Hide dashboard panels for modules that do not exist yet (proposed) |
| D-32 | Meaning of "Recent": last opened (proposed) or last edited |
| D-33 | Trash retention: keep forever (today) or purge after N days |
| D-34 | Backups: include preferences, tabs and drafts; scheduled backups; passphrase encryption once classroom data exists |
| D-35 | Tombstones and `metaUpdatedAt` in DB v4 before any sync work (proposed: yes) |
| D-36 | Scope cuts to after 1.0 if needed: OCR, WebRTC, remote sync, multiple diagram pages, animation timeline, citations |
| D-37 | Python version: pin 3.12 (as CI) and pin dependencies (proposed) |
| D-38 | Coverage floors and the upgrade test in CI |
| D-39 | Security reporting channel: enable GitHub private vulnerability reporting (off today) |
| D-40 | Native distribution for v1.0.0: GitHub Releases only (proposed) or also app stores |
| D-41 | Where web release candidates are tested: locally only (proposed), a preview deployment, or the live site |
| D-42 | UI wording "Favorites" versus "Favourites" (MODULE_08) |
| D-43 | A generic "file" item kind for arbitrary files (MODULE_08; out of scope unless approved) |
| D-44 | A personal due-date field on items for the Deadlines panel (MODULE_09) |
| D-45 | Deadline rule for queued offline submissions: host receive time, or client time within a grace window (MODULE_06) |
| D-46 | Whether admins may read submission content and grades, or metadata only (MODULE_06) |
| D-47 | Retention and export of student data on the classroom host after archive or deletion (MODULE_06) |
| D-48 | Grading scales beyond a numeric score and a free label (MODULE_06) |
| D-49 | Whether teacher templates are copied into the student's workspace automatically on "Start work" (MODULE_06) |
| D-50 | What a former collaborator keeps after access is revoked (MODULE_07) |
| D-51 | View-only links without a host account (MODULE_07; proposed: no) |
| D-52 | Offline duration that triggers a pre-merge snapshot and review notice (MODULE_07) |
| D-53 | Shared items' data in host backups and its retention after sharing stops (MODULE_07) |

Decisions D-54 to D-66 (Google Drive) are listed in GOOGLE_DRIVE_INTEGRATION_PLAN §10.2; D-54 and D-55 must be decided before any Drive code.

Decisions needed to start AE-P2: D-01 to D-06 and D-39, preferably also D-23 and D-38 (roadmap §7).

## 6. Consolidation record (2026-11-15)

The cross-document review made these changes inside this folder only:

- **Risk numbers:** M01 and M02 used R-054/R-055 for the release risks that the register numbers R-097/R-098, and left their own risks unnumbered; M05 used placeholders PDF-RISK-A to D. All now use the register's numbers (R-050 to R-057, R-101 to R-104). The register now lists the eight still-unnumbered plan risks (DEPENDENCY §10, SECURITY §11) for numbering from R-105 at AE-P2.
- **Acceptance criteria:** missing criteria added for PRS-UX-001/004/006/007/009, PRS-IF-002/005, NBK-UX-002/004 … 007, NBK-IF-001, PDF-NFR-002/006/007/010/012, PDF-UX-002 … 005/007 … 009 and PDF-IF-001 … 005. The PRDs and ACCEPTANCE_CRITERIA now state the same canonical rule and the same default browser set for "e2e"; evidence types in the ACCEPTANCE §4 summaries now match the PRD rows.
- **Shared services:** SYSTEM_ARCHITECTURE's sketches of SVC-ORG, SVC-SEARCH and SVC-ACT disagreed with MODULE_08 and MODULE_09 (different interface names, method shapes and event names); they now use one set of names. Module search extractors are wrapped as one `TextExtractor`; SVC-SEARCH lives in the proposed `packages/search`, as SYSTEM_ARCHITECTURE §6.2 says.
- **Host contracts:** `ClassroomHost` (map) and `ClassroomWorkspaceHost` (MODULE_06), two `NotebookHost` shapes, two `PreviewProvider` shapes and two `ShareHost` vocabularies are now one each.
- **Stores and host data:** store keys, indexes and fields for `folders`, `tags`, `tombstones`, `activity`, `previews`, search, `sync_outbox`, `sync_state`, `sync_conflicts` and `collab_updates` now match between DATABASE_AND_SYNC, MODULE_06, MODULE_07, MODULE_08 and MODULE_09; share modes are `live`/`item-sync` everywhere; host-table names are mapped to the PRD entities.
- **Phases and gates:** the common entry gate required green CI "from AE-P2", which AE-P2 cannot meet (it makes main green); now "from AE-P3". AE-P7 and AE-P8 scopes cover the added requirements (NBK-FR-019 … 022, PDF-FR-020 … 025). Extractor criteria moved to the studio phases, as the dependency map plans. The roadmap critical path now matches the map.
- **Statuses and claims:** sync is "Stub" everywhere; cell merge is no longer said to need PRESENTATION_SCHEMA 2; a Dependabot mitigation that assumed alerts were on was corrected; bare "Phase 1" is now "AE-P1"; stale line references (types.ts, indexeddb.ts, platform.ts) and ADR 0002 section references were corrected.
