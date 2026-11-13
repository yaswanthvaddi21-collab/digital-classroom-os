# Project audit — v0.2.0 Stable readiness (Phase 1)

| | |
|---|---|
| Date | 2026-11-13 |
| Commit audited | `ea7f316` on `main` (working tree clean at the time of the audit, before these documents were added) |
| Scope | Whole repository, read-only. No application code was changed in this phase |
| Method | Five area audits (storage, documents, diagrams, app shell and integration, platform/backend/security), each by an independent reviewer reading the code and running probes. Every claim of "broken" or high/critical severity was re-checked by a second reviewer trying to refute it. Headline items were checked again by hand. Baseline verification suite run end to end |
| Companion documents | [FEATURE_STATUS.md](FEATURE_STATUS.md) · [TECHNICAL_DEBT.md](TECHNICAL_DEBT.md) · [RELEASE_GAPS.md](RELEASE_GAPS.md) |

## 1. Summary

Digital Classroom OS today is a **web/PWA application with two working modules: Document Studio and Diagram Studio**, built on a careful local-first storage layer. Within that scope the work is solid. All 211 unit and integration tests pass, and 56 browser-test runs (26 tests across Chromium, WebKit and mobile Chromium) pass, with 3 skipped by design; Firefox has not run. Saved v0.1.0 data is protected by frozen fixtures and a verified upgrade path. Concurrent tabs and backup imports cannot silently overwrite work. The UI has no placeholder modules or "coming soon" entries.

The release brief describes a much larger product. **Presentations, notebooks, PDF Studio, classrooms, assignments, accounts, roles, collaboration and sync have no code at all**, only README files in empty packages. The backend is a two-endpoint skeleton with no authentication. The desktop (Tauri) and Android (Capacitor) apps are configuration only: they have never been built, and this machine has no Rust toolchain. None of these are exposed in the UI, so nothing pretends to work. But a "v0.2.0 Stable" containing them is many months of work, not a stabilisation release. **The scope of v0.2.0 needs a decision before Phase 2** (see [RELEASE_GAPS.md](RELEASE_GAPS.md) §1).

Within the existing scope the audit found **no critical issues and no confirmed high-severity issues** after verification. One high was downgraded to medium. It found 18 medium and 27 low issues. A small set of them should block a stable release because they can lose work, mislead the user, or break the "no fake functionality" rule. Each is small (hours, not weeks). They are listed in [RELEASE_GAPS.md](RELEASE_GAPS.md) §2.

## 2. Repository and git

| Item | Finding |
|---|---|
| Branch / tags | `main` only. Tag `v0.1.0-baseline` |
| Commits | 6. `20d3f4d` baseline → `8766e18` audit docs → `ff53b49` 0.2 stabilisation → `f50b0d4` diagram integration → `2448a6c` quick connect → `ea7f316` review fixes |
| `f50b0d4` | Verified: present, intact (`git fsck` clean), 55 files changed (+2687/−249). Hybrid diagram integration: UML/ER shapes, diagrams.net import/export, editable diagrams in documents |
| `ea7f316` | Verified: present, intact, 32 files changed (+2095/−359). Fixes for 14 confirmed review findings, docs update, new e2e specs |
| Working tree | Clean at the time of the audit (no uncommitted changes before these four documents were added) |
| Remote | **None configured.** CI (`.github/workflows/ci.yml`) has therefore never run |
| Author identity | **Placeholder on every commit** (`Digital Classroom OS <noreply@anthropic.com>`). No `user.name`/`user.email` configured |
| Secrets | None found in the working tree or in the full history of all 6 commits (keys, tokens, PEM blocks, `AKIA`/`ghp_`/`sk-` patterns, `.env`). The only "password" hits are design notes about future Argon2id hashing |
| `.gitignore` | Covers `node_modules`, `dist`, `coverage`, `test-results`, `playwright-report`, `backups/`, `.venv`, `backend/*.db`, Tauri `target`/`gen`, the generated Android project. **Missing:** `.env`, `.env.*`, `*.db`/`*.sqlite` outside `backend/` |
| Licence | **No project `LICENSE` file** and no `license` field in the root `package.json`. Only `Cargo.toml` says MIT |
| Version metadata | Every manifest (root, web, Tauri, Cargo, backend API) still says **0.1.0**. Settings → About would show "Version 0.1.0" |
| Local backups | `backups/` (ignored) holds the source tarball and IndexedDB export from the Release 0.2 audit |

## 3. Architecture

```
apps/web (React 19, Vite 8, Tailwind 4, HashRouter, PWA)   ← the only shipped platform
  ├─ @dcos/document-studio   Tiptap 3 editor, DOCX / print-PDF / TXT export, diagram embed node
  ├─ @dcos/diagram-studio    React Flow 12 editor, quick connect, diagrams.net import/export, PNG/SVG/PDF
  ├─ @dcos/local-storage     StorageAdapter + IndexedDB (schema v2), backup format 2
  └─ @dcos/ui                design tokens, components, toasts, theme
apps/desktop (Tauri 2)      config only, never built        apps/android (Capacitor 7)  config only, never generated
backend/ (FastAPI)          /health and /api/v1/info only; auth/classroom/sync packages are empty
packages/{presentation-studio, notebook, pdf-studio, classroom, assignments, sync-engine}   README only
```

- **Package boundaries** are enforced by a test: Document Studio never imports Diagram Studio, and the app supplies a `DiagramHost`.
- **Editors** load through a plain dynamic import with error boundaries.
- **Persistence** goes through one `StorageAdapter` interface, implemented once (IndexedDB). It is a module-level singleton, so a future SQLite adapter (Tauri/Capacitor) needs a small injection change.
- **No runtime network access:** fonts are bundled and there are no analytics. The only `fetch` reads a `data:` URL.

## 4. Area findings

### 4.1 Storage, data safety, local-first (brief phases 2–3)

**Strong:**
- UUID v4 identifiers.
- Each save is checked and written in one IndexedDB transaction, and a stale version raises `ConflictError`. A probe confirmed two concurrent connections: one wins, the other gets a conflict.
- Soft delete and trash. Favourite/trash changes don't bump the version.
- Version history capped at 50 with protected entries.
- A serialised autosave queue with retries and drafts.
- Cross-tab adoption with a hold while dialogs are open.
- A localStorage emergency draft when another tab upgrades the database.
- An append-only v1→v2 migration with a verified safety copy.
- Backup format 2: validated, all-or-nothing, never overwrites, idempotent, carries attachments.

**Weak, all found by probes:**

| Id | Sev. | Issue |
|---|---|---|
| STOR-R1 | medium | **One draft slot per item.** An unrecovered draft from an earlier session is replaced by a later conflict or failure draft. If the user then closes the tab, the first draft is gone |
| STOR-R2 | medium | **Storage full is not reported.** After the retries stop, the badge still says "Not saved — retrying." The quota error is only in screen-reader text, and a failure to keep a draft is not surfaced |
| STOR-R3 | medium | **Attachments are never deleted.** Every edit that changes a diagram's preview stores a new PNG (identical bytes are deduplicated). Purging a document leaves its attachments, and backups export every orphan. Storage grows without bound |
| STOR-R4 | medium | **Inline images are copied into each of up to 50 versions** (a 1 MB image costs about 50 MB). This speeds up quota exhaustion |
| STOR-R5 | medium | **A failed pre-upgrade safety copy** (e.g. a v0.1.0 user near quota) makes every call fail, including export. The v1 data stays intact, but the user has no way out in the app |
| STOR-R6 | low | Restore text says "importing the same file twice adds nothing", which is false after a local edit (one copy is added). Import does not prune to 50 versions |
| STOR-R7 | low | The backup validator accepts any `content` value (string, array or null import as blank items) |
| STOR-R8 | low | Edits to an item purged in another tab retry, then land in a draft nothing can show |
| STOR-R9 | low | "Last backup" is recorded when the download starts, not when the file is saved |
| STOR-R10 | low | Data at rest and backups are unencrypted plain JSON, including trash and full history. Nothing claims otherwise |

**Ownership and permissions:** only `ownerDeviceId` exists, and it is never read. There are no users, roles or permissions. **Multi-user collaboration does not exist**, so the brief's rule "collaboration must never silently overwrite another user's work" cannot be checked yet. The same-device equivalents (tabs, backup import) are protected.

### 4.2 Document Studio (brief phase 4)

A thin, coherent Tiptap/ProseMirror layer. It has Simple and Advanced modes, five templates, find and replace, a live table of contents, page setup (A4/Letter, orientation, margins, single-line header and footer, page numbers), tables with merge/split, images, links and embedded diagrams. Load safety is good: content from a newer app, or content that fails validation, opens read-only and is never saved over.

**Exports:**

| Format | State |
|---|---|
| DOCX | Real, and covered by golden XML snapshots plus a mammoth re-parse. **Never opened in Microsoft Word or LibreOffice.** Silently loses line height, column widths, list alignment and named colours, and writes a static table of contents |
| PDF | The browser print dialog. Header, footer and page numbers need `@page` margin boxes (Chromium 131+), and errors are swallowed |
| TXT | Fine, but drops images and the table of contents without a marker |
| ODT | Not implemented (not claimed) |

**Missing outright** (no UI pretends otherwise): comments, equations, columns, sections, text boxes, shapes, rulers, line-spacing and indentation controls, real pagination, and any import (DOCX, ODT, HTML).

| Id | Sev. | Issue |
|---|---|---|
| DS-1 | medium | **HTML injection in print/PDF.** Header and footer text goes into the print page's `<style>` without escaping `<`. A header containing `</style><img onerror=…>` (e.g. from a crafted backup) runs script in a same-origin iframe. Typing `</style>` also breaks printing. *Checked by hand: `cssString` escapes only `\`, `"` and newlines* |
| DS-2 | medium | **Page settings are never validated** and the schema version doesn't cover them. A non-string header makes PDF silently fail, non-numeric margins make DOCX throw, and an unknown paper size crashes the editor |
| DS-3 | medium | **Images pasted from the web stay remote URLs.** They break offline and become `[Image: url]` text in DOCX, behind a success toast |
| DS-4 | medium | DOCX compatibility has never been checked in Word or LibreOffice (see §5) |
| DS-5 | low | Page setup implies PDF parity, but header, footer and page numbers depend on the engine |
| DS-6 | low | DOCX loses formatting the editor shows (line height, column widths, list alignment, highlight vs background) |
| DS-7 | low | DOCX writes unvalidated `href`s from stored JSON (e.g. `javascript:` from a crafted file). Scheme-less links become relative |
| DS-8 | low | The Diagram tab's **"SVG or PDF…" menu item only shows a toast**. It is a dead-end menu entry |
| DS-9 | low | Export success toasts assume `<a download>` and `print()` work. They won't in the native shells without adapters |
| DS-10 | low | The diagram preview cache never revokes object URLs, and a failed load stays cached for the session |

### 4.3 Diagram Studio, Quick Connect, diagrams.net (brief phase 5)

A single React Flow editor:
- **Shapes and connectors:** 16 SVG shapes; 4 connector types (elbow, orthogonal, straight, curved); 11 marker kinds, including UML and crow's-foot.
- **Editing:** snapshot undo/redo; tidy-tree layout; align; multi-select; copy/paste/duplicate (in-memory).
- **Templates:** 11, covering flowchart, tree, mind map, org chart, hierarchy, process, timeline, Venn, network, UML class and ER.
- **Exports:** PNG (2×), SVG, PDF and `.drawio`.
- **Saved data:** v0.1.0 diagrams round-trip unchanged; newer diagrams open read-only.

**Quick Connect is real and well tested with a mouse.** Four arrows stay fixed-size through zoom, pan and moves. Click adds a connected shape without overlap. Dragging connects to a shape, or onto empty canvas adds one. The hover palette shows a preview, Alt+Shift+Arrow works, and undo/redo covers each action. Touch is tested for tap-to-create only. **The palette cannot be used with touch:** a long-press both opens it and creates a shape. It is also impractical to reach by keyboard, because it is portalled to the end of the document and has no arrow-key navigation.

**diagrams.net:** our own exports round-trip exactly (one test per template). Import maps shapes, styles, UML/ER stacks, tables and swimlanes, and warns about unknown shapes, swimlanes, tables, images, extra pages and unattached connectors.

| Id | Sev. | Issue |
|---|---|---|
| DS-R1 | medium (high before verification) | **Import silently drops** links, tooltips, custom properties, groups, layers, waypoints, rotation, opacity, gradients, fonts and rich text, with no warning. A repo test even asserts an empty notes list for a file with a link and custom properties. The docs claim import "reports anything it had to approximate", which is false |
| DS-R2 | medium | **Hidden layers and cells are imported as visible** (e.g. a teacher's hidden "answers" layer), with no warning |
| DS-R3 | medium | "SVG" export is HTML inside `foreignObject`. Word, slide tools and vector editors may show it blank |
| DS-R4 | medium | The PNG/PDF pixel ratio is not capped. Large diagrams can exceed canvas limits (Safari ~16.7 MP) and export blank |
| DS-R5 | low | The README says quick connect "works with touch", but the palette doesn't (see above) |
| DS-R6 | low | The quick-connect palette is not practically keyboard-reachable |
| DS-R7 | low | Connectors to draw.io groups are dropped with a wrong reason and wrong pluralisation |
| DS-R8 | low | Each node change serialises the whole diagram twice. That's fine at 500 nodes and janky at about 5000 |

**Missing** (no fake controls): group/ungroup, lock, layers/z-order UI, distribute, full-screen, rotation, waypoints, BPMN shapes, and UML beyond class diagrams. Copy/paste uses an in-memory clipboard, with no cut and no system clipboard.

**Performance:** model code is fast. In jsdom, 500 nodes import in 54 ms and 5000 in 354 ms. Rendering and export at 500+ nodes have never been measured, and there is no large-diagram test.

The **reference diagrams.net screenshot** mentioned in the brief has never been received, so visual parity with it could not be checked.

### 4.4 App shell and document–diagram integration (brief phase 6)

**Navigation and settings are real:**
- Every route and nav item leads to a working screen: Dashboard, Documents, Diagrams, Files, Recent, Favourites, Trash and six settings pages.
- Each settings page does something real.
- Every shortcut listed on the Shortcuts page is wired.

**PWA:** the service worker precaches the whole shell and fonts, an update prompt saves work first, and offline use is tested (Chromium).

**Embedded diagrams meet the brief's list:**
- separate source and preview
- aspect ratio kept
- double-click to edit
- copy, cut and paste (unit and e2e tests)
- multiple diagrams
- export to DOCX, print and TXT
- an honest placeholder for a missing preview

| Id | Sev. | Issue |
|---|---|---|
| WEB-1 | medium | **"Go to Dashboard" on the app-level error screen does nothing.** The boundary never resets, so the URL changes and the error stays. *Checked by hand* |
| WEB-2 | medium | **Toasts raised inside the modal diagram dialog are hidden** behind the top layer. For example, "Add at least one shape…" makes "Insert into document" appear to do nothing. *Confirmed from code and top-layer semantics; not yet seen in a browser* |
| WEB-3 | low | A diagram node whose `source` is null (malformed paste) opens a dialog stuck on "Opening…" with an enabled Save that does nothing |
| WEB-4 | medium | **If storage can't be read, the Dashboard says "Nothing here yet" and "0 documents"**, telling a user with data that they have none |
| WEB-5 | medium | **The Tauri CSP blocks the `data:` fetch** that diagram export and embedding use. Not observable until a desktop build exists |
| WEB-6 | low | No Content-Security-Policy for the web/PWA build |
| WEB-7 | low | Dark-mode danger buttons have 2.77:1 contrast. Warning and success badges are below AA at 12 px |
| WEB-8 | low | Menus have no arrow-key navigation. The mobile drawer has no Escape or focus trap |
| WEB-9 | low | About will say 0.1.0 |
| WEB-10 | low | A failed preview load is cached, leaving "Loading diagram…" forever |

### 4.5 Backend, platforms, CI, dependencies (brief phases 7–12, current state)

- **Backend:** FastAPI with `/health` and `/api/v1/info` (phase 0, no capabilities), a CORS allow-list and no authentication. 3/3 tests pass. The documented run command binds `0.0.0.0` and leaves `/docs` public (low impact today).
- **Not started (README only, not in the UI):** authentication, roles, sharing, presence, sync, classroom, assignments, Presentation Studio, Notebook, PDF Studio.
- **Desktop (Tauri 2):** configuration only. The `icons/` folder is empty although the config lists five icons, so a build fails. There is no `Cargo.lock` and no updater or signing. The shell is not in the npm workspace or lockfile. Rust is not installed.
- **Android (Capacitor 7):** configuration only. The native project has never been generated.
- **CI:** well formed. It runs typecheck, unit tests, build, the licence gate with a notices drift check, a production `npm audit`, four Playwright projects (three browser engines: Chromium, Firefox, WebKit, plus mobile Chromium) and backend pytest. **But it has never run (no remote).** Coverage thresholds are configured but not enforced in CI. Actions are pinned to tags, not SHAs.

| Id | Sev. | Issue |
|---|---|---|
| BP-1 | medium | **Firefox and all e2e coverage is described as "in CI", but CI has never run** (no remote), and Firefox doesn't launch locally. Firefox support is unverified |
| BP-2 | medium | **The Tauri CSP blocks the `data:` fetch** used by diagram export and embedding (same issue as WEB-5) |
| BP-3 | low | **The desktop build can't succeed as committed**: `icons/` is empty while five icons are listed, `@tauri-apps/cli` isn't installed (not a workspace), no Rust. `docs/DEPLOYMENT.md` still describes desktop installers |
| BP-4 | low | The backend CORS allow-list misses the Windows Tauri (`http://tauri.localhost`) and Android Capacitor (`https://localhost`) origins. Latent: no client calls the backend yet |
| BP-5 | low | The documented backend command binds `0.0.0.0` with no authentication and public `/docs`. Minimal exposure today (version and time only) |
| BP-6 | low | `.gitignore` misses `.env*`, `*.db`, `*.sqlite` outside `backend/` |
| BP-7 | low | All manifests and the backend API report version 0.1.0 |
| BP-8 | low | 6 build-only advisories (4 moderate, 2 low) in `vite-plugin-pwa → workbox-build`; the suggested fix is a major downgrade |

- **Dependencies:** all 106 production packages pass the licence allow-list, and the notices file is current (regenerated byte-identical). Production `npm audit` finds 0 vulnerabilities. There are 6 build-only advisories (4 moderate, 2 low) in `vite-plugin-pwa → workbox-build` (glob, minimatch, deepmerge). The suggested fix is a major downgrade, so the right action is to accept and document it.

## 5. Baseline verification (run 2026-11-13 on `ea7f316`)

| Check | Command | Result |
|---|---|---|
| Typecheck | `npx tsc -p tsconfig.json --noEmit` | ✅ 0 errors |
| Unit + integration | `npx vitest run` | ✅ 17 files, **211/211** passed |
| Coverage | `npx vitest run --coverage` | Lines 64.9%, statements 62.2%, branches 55.7%, functions 49.9% |
| Production build | `npm run build` | ✅ 2.1 MB `dist`. The service worker precaches 19 entries (2.05 MB). Largest chunk 782 KB (document editor) |
| Licence gate | `npm run licenses` | ✅ 106 production packages, all allowed |
| Vulnerabilities | `npm audit --omit=dev` / `npm audit` | ✅ 0 production / 6 build-only (4 moderate, 2 low) |
| Browser tests | `playwright test` — chromium, webkit, mobile-chromium | ✅ **56 passed**, 3 skipped by design |
| Browser tests | `playwright test --project=firefox` | ❌ Firefox does not launch on this machine ("Could not find profile folder"). An environment problem, not an app failure. **Firefox has never passed anywhere** |
| Backend | `pytest -q` (Python 3.9 venv) | ✅ 3/3 passed. CI uses 3.12 |
| DOCX in Word / LibreOffice | manual | ⬜ Never done; Word is not available here |
| Desktop / Android builds | — | ⬜ Impossible today (no Rust toolchain, Android project not generated) |

## 6. Counts

| Area | Implemented | Partial | Broken | Missing | Risks (med / low) |
|---|---|---|---|---|---|
| Storage | 15 | 6 | 0 | 1 | 5 / 5 |
| Documents | 19 | 10 | 0 | 11 | 4 / 6 |
| Diagrams | 29 | 13 | 0 | 7 | 4 / 4 |
| App shell + integration | 20 | 7 | 1 | 1 | 4 / 6 |
| Platform, backend, security | 7 | 7 | 0 | 12 | 2 / 6 |

The one broken item is toast visibility inside modal dialogs. Storage's "unbounded growth" was reported as broken and downgraded to partial on verification. One high (DS-R1) was downgraded to medium. There are no critical issues. WEB-5 and BP-2 are the same issue seen from two areas, so there are 18 unique medium risks.

## 7. Limitations of this audit

- **No Microsoft Word or LibreOffice check.** DOCX was not opened in either: Word isn't available here, and the brief rules out installing tools in this phase.
- **Some findings are not browser-verified.** WEB-2 (hidden toasts) and DS-R6 (keyboard palette) were confirmed from code. They'll get browser tests when fixed.
- **No desktop or Android verification.** Neither shell can be built here, so WEB-5/BP-2 is inferred from the CSP and the export code.
- **Large-diagram rendering and export were not measured.** Only model-level timings exist.
- **Firefox is unverified** until CI runs.
- **Probes stayed out of the repo.** They lived in a temporary folder outside the repository; their results are quoted in the findings above.
