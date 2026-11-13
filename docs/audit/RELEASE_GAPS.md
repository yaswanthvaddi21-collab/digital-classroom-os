# Release gaps — v0.2.0 Stable readiness (Phase 1)

Audited commit `ea7f316`, 2026-11-13. This document answers one question: **what stands between the current code and a release that can honestly be called "v0.2.0 Stable"?** Evidence for every item is in [PROJECT_AUDIT.md](PROJECT_AUDIT.md) (risk ids) and [FEATURE_STATUS.md](FEATURE_STATUS.md).

**Size:** S = up to a day · M = a few days · L = one to two weeks · XL = more than two weeks.

## 1. The scope decision (needed before Phase 2)

The release brief lists 15 phases. Today's code covers phases 2–6 (storage, documents, diagrams, integration) on one platform (web/PWA). **Phases 7–10 and most of 12 have no code at all:** presentations, notebook, PDF Studio, classrooms, assignments, accounts, roles, collaboration, sync, and the desktop and Android builds. Each of those is XL on its own. Together they are several months of work, and some need things this machine doesn't have: Rust and the Android SDK for native builds, and Windows for Windows verification.

There are two honest ways to define v0.2.0:

| Option | What "v0.2.0 Stable" means | Work to stable |
|---|---|---|
| **A. Narrow scope** (recommended) | Document Studio + Diagram Studio + local-first storage, **web/PWA only**, with every blocking gap in §2 closed. The rest of the brief becomes the roadmap for v0.3+, in the brief's order | Roughly 2–3 weeks: §2 items are mostly S, plus the manual DOCX checks and a first CI run |
| **B. Full brief** | Everything in phases 4–12 shipped and verified on web, macOS, Windows and Android | Many months; needs toolchains, devices and accounts not available today. "v0.2.0" would mean something very different from v0.1.0 |

Under either option, the brief's rules forbid exposing unfinished modules. So option A ships no presentation, notebook, PDF or classroom entries, as today.

## 2. Blocking gaps for any stable release of the current scope

Each item either can lose work, misleads the user, or breaks the "no fake functionality / no misleading claims" rules.

| # | Gap | Evidence | Size |
|---|---|---|---|
| RG-1 | **A draft from an earlier session can be silently replaced** by a later conflict or failure draft | STOR-R1 (probe) | S |
| RG-2 | **Storage-full is hidden**: the badge says "retrying" after retries stop, and a failure to keep a draft isn't shown | STOR-R2 (probe) | S |
| RG-3 | **A failed pre-upgrade safety copy locks the user out** (no export, no recovery path) on the v0.1.0 → v0.2.0 upgrade every existing user goes through | STOR-R5 (probe) | S–M |
| RG-4 | **HTML injection through the page header/footer into the print page** | DS-1 (checked by hand) | S |
| RG-5 | **Unvalidated page settings** crash the editor or silently break PDF/DOCX | DS-2 (probe) | S |
| RG-6 | **diagrams.net import drops content without a warning** (links, tooltips, properties, groups, layers, waypoints, styling), and **hidden layers are imported as visible** | DS-R1 (verified), DS-R2 (probe) | S–M |
| RG-7 | **"Go to Dashboard" on the error screen does nothing** | WEB-1 (checked by hand) | S |
| RG-8 | **Errors inside the diagram dialog are invisible** (toasts behind the modal), so buttons appear to do nothing | WEB-2 (verified from code) | S |
| RG-9 | **The Dashboard tells a user with data that they have none** when storage can't be read | WEB-4 | S |
| RG-10 | **A menu item that only shows a hint toast** ("SVG or PDF…" in the document's Diagram tab) | DS-8 | S |
| RG-11 | **Overstated claims in docs and UI**, to be fixed or reworded: quick connect "works with touch" (the palette doesn't); "importing the same file twice adds nothing"; page setup implying PDF parity; ARCHITECTURE's "import reports anything it had to approximate"; DEPLOYMENT's desktop build steps; Firefox "covered in CI" | DS-R5, STOR-R6, DS-5, DS-R1, BP-3, BP-1 | S |
| RG-12 | **DOCX never opened in Microsoft Word or LibreOffice.** Either verify (dated results for each golden fixture plus a document with a diagram) or say plainly that it's untested | DS-4 | S (needs Word or LibreOffice) |
| RG-13 | **CI has never run.** A green run across unit, e2e (including Firefox), build, licences, audit and backend is needed, or Firefox must be stated as untested | BP-1; needs a remote (Phase 2, with approval) | S |
| RG-14 | **Release metadata**: versions are still 0.1.0 everywhere (About would say 0.1.0); no project LICENSE; no `v0.2.0` tag (tagging belongs to Phase 15) | WEB-9, BP-7 | S (licence choice is yours) |
| RG-15 | **`.gitignore` misses `.env*`, `*.db`, `*.sqlite`** | BP-6 | S (Phase 2) |

## 3. Strongly recommended for v0.2.0 (not blocking)

| # | Gap | Evidence | Size |
|---|---|---|---|
| RR-1 | Attachment cleanup, so storage and backups stop growing forever | STOR-R3, TD-1 | M |
| RR-2 | Move inline images to attachments (stops 50× duplication across versions) | STOR-R4, TD-2 | L |
| RR-3 | Inline or flag web images on paste (offline-first; DOCX placeholder behind a success toast) | DS-3 | M |
| RR-4 | Cap the export pixel ratio and add a 500-node browser test (render, drag, export) | DS-R4, TD-19 | S |
| RR-5 | Recover from a diagram with missing data, and from a failed preview load | WEB-3, WEB-10 | S |
| RR-6 | Web Content-Security-Policy | WEB-6 | S |
| RR-7 | Accessibility: dark-mode danger contrast, menu keyboard pattern, mobile drawer Escape and focus | WEB-7, WEB-8 | S–M |
| RR-8 | Quick-connect palette usable with touch and keyboard | DS-R5, DS-R6 | S–M |
| RR-9 | Label SVG export honestly ("for web browsers"), or build a true vector exporter | DS-R3 | S / M |
| RR-10 | Backup validator checks content shape; import prunes to 50 versions | STOR-R7, STOR-R6 | S |
| RR-11 | Handle a document purged in another tab (stop retrying; offer "save as new") | STOR-R8 | S |
| RR-12 | DOCX fidelity: line height, column widths, list alignment, highlight, a real table-of-contents field | DS-6, TD-10 | M |

## 4. Gaps against the full brief (scope option B)

None of these is exposed in the UI today, so none is a "fake feature". They are absent.

| Brief phase | Missing | Size | Notes |
|---|---|---|---|
| 3 | User ownership, permissions, privacy model | XL | Needs accounts (phase 9) first; today ownership is a device id |
| 4 | Comments; equations; columns; sections; text boxes; shapes; rulers; line spacing and indentation controls; DOCX import; ODT export/import; real pagination | XL in total | Line spacing/indent S–M; equations M (KaTeX, MIT); DOCX import L (mammoth, BSD-2, already a dev dependency); comments, columns, sections, pagination each L; no mature permissive ODT writer exists, so ODT means a custom writer (L) |
| 5 | Group/ungroup, lock, layers/z-order, distribute, full-screen, rotation, waypoints, BPMN, UML beyond class, radial mind maps, network icons | XL in total | Waypoints and groups need a schema 3 change; each must keep saved diagrams compatible |
| 7 | Presentation Studio (slides, layouts, themes, masters, notes, presenter mode, transitions, PPTX/PDF export) | XL | `pptxgenjs` (MIT) is a candidate for PPTX; verifying in PowerPoint/Keynote needs that software |
| 8 | Digital Notebook; PDF Studio (reader, search, thumbnails, annotations, page operations) | XL | PDF.js (Apache-2.0), pdf-lib (MIT) are candidates |
| 9 | Accounts, roles, classrooms, subjects, assignments, submissions, grading, announcements | XL | Backend has two endpoints and no authentication today |
| 10 | Sharing, permissions, presence, live cursors, concurrent editing, reconnection | XL | Yjs (MIT) plus a local WebSocket host; needs several devices to test |
| 11 | Security review of auth, sessions, uploads, LAN access; performance at scale | L | Most of it depends on phases 9–10 existing |
| 12 | macOS, Windows, Android builds tested on real installs | L each | Needs Rust, the Android SDK, a Windows machine, signing identities; the Tauri config currently fails to build (missing icons) and its CSP would break diagram export |

## 5. What I need from you

1. **Scope:** option A or B (§1).
2. **The diagrams.net screenshot** the brief refers to. It has never arrived.
3. **Git identity:** the name and email to use for commits from now on. Existing commits carry a placeholder; rewriting them is possible but optional.
4. **Project licence:** for example MIT, Apache-2.0 or proprietary. Needed for RG-14.
5. **GitHub:** a private repository to connect in Phase 2. Nothing is pushed without your approval.
6. **DOCX verification:** Microsoft Word access, or permission to install LibreOffice (free) for RG-12.
7. **Native toolchains, only if the platforms stay in scope:** permission to install Rust and the Android SDK, and access to a Windows machine.

## 6. Status after Phase 2 (Git, backup and data safety)

Scope decision: **option B, the full brief** (owner, 2026-11-13).

| Item | Status | Where |
|---|---|---|
| RG-3 failed safety copy locks the user out (STOR-R5) | ✅ Fixed: recovery screen; no upgrade without a backup | [DATA_SAFETY_REPORT.md](../DATA_SAFETY_REPORT.md) §5 |
| RG-15 `.gitignore` misses secrets and databases | ✅ Fixed | DATA_SAFETY_REPORT §2 |
| RG-11 overstated claims | 🟡 Restore wording and "last backup" wording fixed (STOR-R6, STOR-R9); the other claims remain for their phases | DATA_SAFETY_REPORT §4 |
| RR-10 backup validation and import pruning (STOR-R7, STOR-R6) | ✅ Fixed | DATA_SAFETY_REPORT §4 |
| New: half-upgraded database after a failing migration | ✅ Fixed | DATA_SAFETY_REPORT §5 |
| New: two tabs upgrading at once could remove the safety copy | ✅ Fixed | DATA_SAFETY_REPORT §5 |
| RG-13 CI has never run | ⬜ Needs a remote; prepared in [GIT_WORKFLOW.md](../GIT_WORKFLOW.md) §7, waiting for the owner | — |
| RG-14 release metadata, licence | ⬜ Waiting for the owner's licence choice; versions are bumped in Phase 14 | — |
| RG-1, RG-2 and the other storage items | ⬜ Phase 3 | — |

## 7. Status after Phase 3 (architecture and storage hardening)

| Item | Status | Where |
|---|---|---|
| RG-1 a draft from an earlier session can be replaced (STOR-R1) | ✅ Fixed: drafts per editor session; Settings lists every draft | [ADR 0004](../adr/0004-autosave-and-drafts.md) |
| RG-2 storage-full is hidden (STOR-R2) | ✅ Fixed: failures classified; honest status; storage-full notice with what was kept | ADR 0004 |
| RR-1 attachments never cleaned up (STOR-R3) | ✅ Fixed: provably safe clean-up (references, 24 h grace, one transaction) | [ADR 0008](../adr/0008-attachments.md) |
| RR-2 images copied into every version (STOR-R4) | ✅ Fixed for new versions: large images stored once, restored byte for byte. Document content itself is unchanged (Phase 4) | [ADR 0005](../adr/0005-version-history.md) |
| RR-11 edits to an item deleted in another tab (STOR-R8) | ✅ Fixed: deleted notice at once; Save as a new item; orphan drafts recoverable | [ADR 0010](../adr/0010-soft-delete-and-recovery.md) |
| TD-3, TD-4, TD-5, TD-6, TD-7 (drafts, error classes, adapter injection, unguarded handlers, emergency drafts and preference sync) | ✅ Fixed | ADRs 0001, 0004, 0009 |
| Ownership and permissions | Decided: device ownership now; explicit per-item sharing with accounts (phases 9–10); privacy enforced by an e2e test | [ADR 0002](../adr/0002-identity-ownership-privacy.md) |
| TD-2 images inline in document content | ⬜ Phase 4 (a document-format decision) | — |
