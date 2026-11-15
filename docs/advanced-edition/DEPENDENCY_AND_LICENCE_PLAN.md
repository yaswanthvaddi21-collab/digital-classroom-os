# Dependency and licence plan

This plan records which third-party software Digital Classroom OS uses today, how each dependency is reviewed, which libraries are candidates for the Advanced Edition modules, how a Software Bill of Materials (SBOM) will be produced, and how the no-paid-SaaS and no-AI rules of brief §11 are enforced. It owns the DEP-NNN requirements; their acceptance criteria (AC-DEP-NNN) are listed in [ACCEPTANCE_CRITERIA.md](ACCEPTANCE_CRITERIA.md). Every library named for a future module is a **candidate — verify licence, maintenance, security before adoption**. No candidate is approved by this document.

**Status: AE-P1 draft for owner approval (2026-11-15)**

Related documents: [ADVANCED_EDITION_PRODUCT_ROADMAP.md](ADVANCED_EDITION_PRODUCT_ROADMAP.md) (owner decisions D-NN) · [SYSTEM_ARCHITECTURE.md](SYSTEM_ARCHITECTURE.md) (SYS-012 unused dependencies, SYS-020 no third-party CDNs) · [DATABASE_AND_SYNC_ARCHITECTURE.md](DATABASE_AND_SYNC_ARCHITECTURE.md) · [SECURITY_AND_PRIVACY_PLAN.md](SECURITY_AND_PRIVACY_PLAN.md) · [ACCEPTANCE_CRITERIA.md](ACCEPTANCE_CRITERIA.md) · [RISK_REGISTER.md](RISK_REGISTER.md) · [RELEASE_STRATEGY.md](RELEASE_STRATEGY.md) (SBOM and checksums with releases) · [MODULE_DEPENDENCY_MAP.md](MODULE_DEPENDENCY_MAP.md) · module PRDs [M01](MODULE_01_DOCUMENT_STUDIO_PRD.md) · [M02](MODULE_02_DIAGRAM_STUDIO_PRD.md) · [M03](MODULE_03_PRESENTATION_STUDIO_PRD.md) · [M04](MODULE_04_DIGITAL_NOTEBOOK_PRD.md) · [M05](MODULE_05_PDF_STUDIO_PRD.md) · [M06](MODULE_06_CLASSROOM_HUB_PRD.md) · [M07](MODULE_07_COLLABORATION_PRD.md) · [M08](MODULE_08_FILE_MANAGER_PRD.md) · [M09](MODULE_09_DASHBOARD_PRD.md)

Evidence base: repository at HEAD `edc2672` on branch `advanced/phase1-audit`; `package-lock.json` (lockfileVersion 3) read with small Node one-liners; package `package.json` files; docs/DEPENDENCIES.md; docs/THIRD_PARTY_NOTICES.md; scripts/license-report.mjs; .github/workflows/ci.yml; backend/requirements*.txt; apps/desktop/src-tauri/Cargo.toml; the local backend virtual environment's package metadata. Nothing was installed, built or audited in AE-P1; `npm run licenses` and `npm audit` were **not** re-run. Results quoted from earlier runs carry their date.

---

## 1. Current state at a glance

| Area | Status | Evidence |
|---|---|---|
| npm production licence gate | **Done** | `scripts/license-report.mjs` writes docs/THIRD_PARTY_NOTICES.md and fails on any licence outside the allow-list; CI runs it and fails if the notices file changes (`.github/workflows/ci.yml:21-22`). Recorded result: 142 production packages, "Packages needing review: none" (THIRD_PARTY_NOTICES.md:5-19; RELEASE_GAPS.md §11, 2026-11-15) |
| Tiptap Pro block | **Done** | `license-report.mjs:38`, `:64-67` fail the gate on any `@tiptap-pro/*` package; `tests/integration/boundaries.test.ts:44-45` also checks the lockfile for `@tiptap-pro/` |
| npm production vulnerability gate | **Done** | `npm audit --omit=dev --audit-level=high` in CI (`ci.yml:23`); 0 vulnerabilities recorded 2026-11-15 after the `image-size` override (DEPENDENCIES.md:85; `package.json:47-49`) |
| Dependency review record | **Partial** | docs/DEPENDENCIES.md has licence, version, purpose and notes per dependency, but no maintenance, security, performance or sustainability columns as brief §11 requires |
| Dev and build tooling licences | **Partial** | Not in the licence report (the script skips `dev` and `devOptional`, `license-report.mjs:28`). AE-P1 scan: 524 dev-only lockfile entries, all with a licence field; 12 MPL-2.0 (lightningcss 1.33.0 and its 11 platform binaries, via Tailwind 4) and 1 CC-BY-4.0 (caniuse-lite); build-time only |
| Python (classroom host skeleton) | **Partial** | Licences listed by hand only (DEPENDENCIES.md:27). Unpinned ranges, no lock file (TD-32). Not in any licence or vulnerability gate |
| Rust (Tauri shell) | **Absent** | `apps/desktop/src-tauri/Cargo.toml` declares `tauri = "2"`, `tauri-build = "2"`, `serde = "1"`, `serde_json = "1"`; no `Cargo.lock`; never built (TD-30) |
| Native-shell npm packages | **Absent** | `apps/desktop` (`@tauri-apps/cli ^2.0.0`) and `apps/android` (`@capacitor/* ^7.0.0`) are outside the npm workspaces (`package.json:7-14`) and the lockfile; not installed, licence-checked or audited (TD-30) |
| SBOM | **Absent** | No CycloneDX or SPDX file anywhere; brief §11 requires one (`docs/PRD.md:578` mentions it as a plan only) |
| Unused production dependency | **Partial** | `html-to-image` 1.11.11 is used only by dead code in `packages/diagram-studio/src/export.ts`, still exported from `index.ts:6` (TD-42) |
| Dependabot security updates | **Absent** | Disabled on the repository (gh, 2026-11-15); `.github/` has only `workflows/` (no `dependabot.yml`) |
| Paid SaaS in the product | **Done** (none present) | No service client in the lockfile; `e2e/privacy.spec.ts` fails on any cross-origin request for documents, diagrams and backup (presentations not covered, see SECURITY_AND_PRIVACY_PLAN) |
| AI in the product | **Done** (none present; the automated check is Absent, DEP-006) | Lockfile scan for openai, anthropic, langchain, @google/gen*, transformers, onnx, tensorflow, ollama, web-llm: no match. Source grep for AI API hosts: no match (AE-P1, 2026-11-15) |
| Runtime CDN use | **Done** (none present) | Inter font bundled (`@fontsource-variable/inter`); KaTeX CSS bundled inline (`document-studio/src/extensions/insertCss.ts:3`) with its fonts precached (DEPENDENCIES.md:43, v0.2 Phase 4 table); no CDN host in source (grep). See SYS-020 |

---

## 2. Current direct dependencies

Installed versions come from `package-lock.json`; licences come from the lockfile's `license` field, cross-checked against THIRD_PARTY_NOTICES.md and docs/DEPENDENCIES.md. A version marked "exact" is pinned without a range in `package.json`.

### 2.1 Production npm dependencies (shipped in the web build)

| Package | Declared range | Declared by | Installed | Licence | Purpose | Notes |
|---|---|---|---|---|---|---|
| react, react-dom | ^19.0.0 | apps/web; peer of every studio and ui | 19.3.1 | MIT | UI | |
| react-router-dom | ^7.0.0 | apps/web | 7.18.5 | MIT | Routing | Hash router (`App.tsx:22`) so the app works from a sub-path and in native shells |
| lucide-react | ^0.460.0 | apps/web, packages/ui | 0.460.0 | ISC | Icons | |
| clsx | ^2.1.1 | packages/ui | 2.1.1 | MIT | Class names | `cn()` is plain clsx (TD-48) |
| @fontsource-variable/inter | ^5.1.0 | apps/web | 5.3.0 | OFL-1.1 | Bundled UI font | OFL permits bundling; no Google Fonts request |
| idb | ^8.0.0 | packages/local-storage | 8.0.4 | ISC | IndexedDB wrapper | A dev-only idb 7.1.1 also exists at top level via workbox |
| @tiptap/core, /pm, /react, /starter-kit, /extensions, /extension-highlight, -subscript, -superscript, -text-align, -text-style | ^3.0.0 | document-studio, presentation-studio | 3.33.1 | MIT | Rich-text engine (ProseMirror) | Open-source extensions only; Pro blocked by the gate |
| @tiptap/extension-image, -table | ^3.0.0 | document-studio | 3.33.1 | MIT | Pictures, tables | |
| @tiptap/extension-mathematics | 3.33.1 (exact) | document-studio | 3.33.1 | MIT | Equations | Pinned to match the installed Tiptap (DEPENDENCIES.md:42, v0.2 Phase 4 table) |
| katex | ^0.18.11 | document-studio | 0.18.11 | MIT | Equation rendering | Run with `trust` off (`extensions/equation.ts:13`) |
| docx | ^9.15.3 | document-studio | 9.15.3 | MIT | DOCX export | TD-38: TOC bookmarks rely on a private property of 9.15.3 (`export/docx/index.ts:118-122`) |
| mammoth | ^1.13.0 | document-studio (runtime), root (dev) | 1.13.0 | BSD-2-Clause | DOCX import | Cannot read comments or tracked changes (R-010) |
| fflate | ^0.8.3 | document-studio, diagram-studio, presentation-studio | 0.8.3 | MIT | ZIP and deflate (ODT, .drawio, PPTX post-processing) | Candidate container for backup format 3 (ADR-0017, proposed) |
| @xyflow/react | ^12.4.0 | diagram-studio | 12.12.1 | MIT | Diagram canvas | No `proOptions` in source (AE-P1 grep of packages/ and apps/web/src); attribution kept (docs/audit/FINDINGS.md:1454-1456). React Flow Pro examples must not be copied |
| jspdf | ^4.2.1 | diagram-studio, presentation-studio | 4.2.1 | MIT | PDF writing | 3.x had critical advisories; 4.2.1+ required (DEPENDENCIES.md:19). Lazy-loaded |
| svg2pdf.js | 2.8.1 (exact) | diagram-studio, presentation-studio | 2.8.1 | MIT | Vector PDF from SVG | Upgrade deliberately; re-run export tests |
| pptxgenjs | 4.0.1 (exact) | presentation-studio | 4.0.1 | MIT | PPTX export | Output post-processed by exact pattern (`export/pptxPost.ts`); "no release for about 17 months" (DEPENDENCIES.md:76); one slide master only (TD-56); R-100 |
| html-to-image | 1.11.11 (exact) | diagram-studio | 1.11.11 | MIT | Legacy diagram capture | **Dead code only** (TD-42); removal proposed under D-27 |

### 2.2 Transitive production packages that need a note

| Package | Version | Licence | Reached through | Note |
|---|---|---|---|---|
| jszip | 3.10.2 | (MIT OR GPL-3.0-or-later) | mammoth, pptxgenjs | Used under MIT (`license-report.mjs` DUAL_OK) |
| dompurify | 3.4.17 | (MPL-2.0 OR Apache-2.0) | jspdf (optional dependency) | Used under Apache-2.0; aliased out of the build together with html2canvas and canvg (`apps/web/vite.config.ts:17`) |
| pako | 1.0.11 and 2.2.0 | (MIT AND Zlib) | jszip (1.0.11); jspdf via fast-png (2.2.0) | Both permissive |
| rgbcolor | 1.0.1 | MIT OR SEE LICENSE IN FEEL-FREE.md | canvg (via jspdf) | Mapped to MIT in DUAL_OK |
| duck | 0.1.12 | BSD-2-Clause (licence field says "BSD") | mammoth via lop | Recorded in `REVIEWED` after reading its LICENSE file (`license-report.mjs:19-21`) |
| image-size | 2.1.0 | MIT | pptxgenjs (declares ^1.2.1) | Forced by `"overrides": { "image-size": "^2.0.4" }` (`package.json:47-49`) for two high advisories in 1.2.1; pptxgenjs never loads it in browsers (DEPENDENCIES.md:78, :85) |
| @xmldom/xmldom | 0.8.15 | MIT | mammoth | Already installed; a candidate worker-safe XML parser for AE-P4 (§6) |
| @types/node, undici-types | 22.20.5 and 6.21.0 (through pptxgenjs); 26.6.6 and 8.9.0 (nested under docx) | MIT | pptxgenjs, docx | Type declarations counted as production by the lockfile; `@types/*` is skipped by the report (`license-report.mjs:30`), undici-types is not |

### 2.3 Development, build and test dependencies (not shipped)

| Package | Declared | Installed | Licence | Purpose |
|---|---|---|---|---|
| vite | ^8.3.0 (apps/web) | 8.3.8 | MIT | Build |
| @vitejs/plugin-react | ^6.3.0 | 6.3.0 | MIT | Build |
| tailwindcss, @tailwindcss/vite | ^4.0.0 | 4.3.5 | MIT | Styling (brings lightningcss, MPL-2.0, build-time) |
| vite-plugin-pwa | ^2.0.0 | 2.0.0 | MIT | Service worker (Workbox 7.4.1) |
| typescript | ~5.7.0 | 5.7.3 | Apache-2.0 | Type checking |
| vitest, @vitest/coverage-v8 | ^5.1.0 | 5.1.0 | MIT | Unit and integration tests |
| jsdom | ^31.0.0 | 31.0.0 | MIT | Test DOM |
| fake-indexeddb | ^6.0.0 | 6.2.8 | Apache-2.0 | Storage tests |
| @playwright/test | ^1.65.0 | 1.65.0 | Apache-2.0 | Browser tests |
| @testing-library/dom, /react, /user-event | ^10.4.2, ^16.3.3, ^14.6.10 | same | MIT | Component tests |
| @types/node, @types/react, @types/react-dom | ^22.10.0, ^19.0.0 | 22.20.5, 19.3.0 | MIT | Types |
| jszip, mammoth (root) | ^3.10.1, ^1.13.0 | 3.10.2, 1.13.0 | as above | Tests re-read exported files |

### 2.4 Dependencies outside every gate

| Ecosystem | Declared | Resolved | Licence | Gate coverage |
|---|---|---|---|---|
| Python host, runtime (`backend/requirements.txt`) | `fastapi>=0.115,<1`, `uvicorn[standard]>=0.30,<1` | Local venv (Python 3.9.6): fastapi 0.128.8, uvicorn 0.39.0, pydantic 2.13.5, starlette 0.49.3. CI (Python 3.12) resolves its own versions on each run | fastapi MIT, uvicorn BSD-3-Clause, pydantic MIT, starlette BSD-3-Clause (read from the venv's package metadata in AE-P1) | None. No lock file (TD-32) |
| Python host, dev (`requirements-dev.txt`) | `pytest>=8,<9`, `httpx>=0.27,<1` | venv: pytest 8.4.2, httpx 0.28.1 | MIT, BSD-3-Clause (venv metadata) | None |
| Rust (Tauri) | tauri 2, tauri-build 2, serde 1, serde_json 1 | Not resolved (no Cargo.lock) | tauri reported as MIT OR Apache-2.0 (DEPENDENCIES.md:32); others to verify | None |
| Tauri CLI (npm) | @tauri-apps/cli ^2.0.0 | Not installed | to verify | None |
| Capacitor (npm) | @capacitor/core, /android, /cli ^7.0.0 | Not installed | reported MIT (DEPENDENCIES.md:33), to verify on install | None |
| Android Gradle | No native project (`apps/android/android` absent) | — | — | None |

The venv versions differ from what CI installs, which is the reproducibility problem TD-32 and R-026 describe.

---

## 3. Existing controls and their limits

| Control | Where | What it does | Limit |
|---|---|---|---|
| Allow-list | `license-report.mjs:7` | MIT, ISC, Apache-2.0, BSD-2-Clause, BSD-3-Clause, 0BSD, OFL-1.1, Unlicense, CC0-1.0, BlueOak-1.0.0, Python-2.0, Zlib | Production npm only |
| Dual-licence map | `license-report.mjs:9-16` | Exact SPDX strings mapped to the permissive option used | Each new dual licence needs a code change and review |
| Reviewed exceptions | `license-report.mjs:19-21` | Exact `name@version` with non-SPDX licence fields | Version bump re-triggers review (intended) |
| Tiptap Pro block | `license-report.mjs:38`, `:64-67` | Fails on `@tiptap-pro/*` | No equivalent for other "pro" packages (React Flow Pro is code, not a package) |
| Notices freshness | `ci.yml:21-22` | `git diff --exit-code docs/THIRD_PARTY_NOTICES.md` | Names and SPDX ids only, no licence texts or copyright lines |
| Vulnerability gate | `ci.yml:23` | `npm audit --omit=dev --audit-level=high` | npm production only; moderate advisories pass |
| Overrides | `package.json:47-49` | Forces fixed transitive versions | Each override must be documented (DEPENDENCIES.md:85 does this for image-size) |
| Exact pins | package.json files | pptxgenjs, svg2pdf.js, html-to-image, @tiptap/extension-mathematics | Exact pins also block security patch releases; upgrades are manual |

---

## 4. Policy

### 4.1 Review criteria (brief §11)

Every new direct dependency, and every major-version upgrade of an existing one, gets a review record **before** it is merged. The record answers each criterion with dated evidence:

| Criterion | What is checked | Evidence required | Flag (needs owner attention) |
|---|---|---|---|
| Licence | SPDX id in `package.json` (or `pyproject`/`Cargo.toml`) **and** the shipped LICENSE file; licences of its own production dependencies | The two sources agree; `npm run licenses` (or the Python/Rust equivalent) passes | Any licence outside §4.2 class A; a non-SPDX field; a licence that changed between versions |
| Maintenance status | Date of latest release; release cadence over 24 months; open security issues; number of active maintainers; whether the repository is archived | Dates and counts as at the review date | No release for 18 months or more (proposed threshold); archived; single maintainer for a core dependency |
| Security | Published advisories (GitHub Advisory Database, OSV) for the version; `npm audit`/`pip-audit`/`cargo audit` result; whether it parses untrusted input; whether it uses `eval`, `new Function`, dynamic code or network access | Scanner output and a note on input handling | Any unfixed high or critical advisory; `eval` required at run time; network access not under app control |
| Compatibility | Browser and WebView support (Chromium, Firefox, WebKit, Android WebView, WKWebView, WebView2); ESM; Web Worker support; peer dependency ranges (for example Tiptap 3.33, React 19); CSP needs (`worker-src`, `wasm-unsafe-eval`) | A spike or test in the target environments | Needs `unsafe-eval`; no worker support; peer range excludes installed versions |
| Performance | Added bundle size (minified and gzip) to the entry chunk and to its lazy chunk; memory and CPU for the module's PERF target | Build size report; a measurement against the PERF baseline (AE-P3) | Adds to the entry chunk instead of a lazy chunk; misses a PERF target |
| Long-term sustainability | Funding or organisation behind it; number of dependents; available forks; how hard it would be to replace (size of our integration surface) | Short note | No replacement path and high integration surface |

Records are kept in docs/DEPENDENCIES.md (extended with the missing columns in AE-P2/AE-P3). A dependency without a complete record does not pass the phase gate (AC-DEP-003).

### 4.2 Licence classes

| Class | Licences | Rule |
|---|---|---|
| A — allowed | MIT, ISC, Apache-2.0, BSD-2-Clause, BSD-3-Clause, 0BSD, Zlib, Unlicense, CC0-1.0, BlueOak-1.0.0, Python-2.0, OFL-1.1 (fonts) | Allowed in shipped code (current allow-list) |
| B — allowed when the permissive option is used | Dual licences with one class-A option (jszip, dompurify, rgbcolor today) | Recorded in DUAL_OK with the option used |
| C — owner approval required | MPL-2.0, EPL-2.0, LGPL (any), CC-BY (data files), any licence not listed | Needs a dated owner decision. Existing cases: `@axe-core/playwright` (MPL-2.0, D-25, test-only); elkjs (EPL-2.0) and libavoid-js (LGPL-2.1), outside policy unless D-21 approves; lightningcss (MPL-2.0, build-time only, recorded here, not shipped) |
| D — refused | GPL and AGPL as the only option, SSPL, BUSL, "Commons Clause", proprietary, paid "Pro" tiers (Tiptap Pro, React Flow Pro code), licences that forbid commercial use | Never in shipped code. Not in build tooling either unless the owner approves |

The public repository itself is MIT (LICENSE, 468ab89). Class C and D rules apply to shipped code first; build and test tooling is reported (DEP-016) and follows class C for anything new.

### 4.3 Pinning and upgrades

- Ranges (`^`) are normal; the lockfile pins resolved versions and `npm ci` installs them (`pages.yml` and `ci.yml` use `npm ci`).
- Exact pins are allowed only with a written reason and a named test set to re-run on upgrade (today: pptxgenjs, svg2pdf.js, html-to-image, @tiptap/extension-mathematics).
- Every `overrides` entry has a dated reason and a removal condition (image-size today).
- Python dependencies are pinned with hashes in a lock file before the classroom host gains its first real endpoint (AE-P9; D-37; TD-32). Rust gets a committed `Cargo.lock` and the native-shell npm packages join a lockfile before the first native build (AE-P14; TD-30).
- Major upgrades of Tiptap, React, Vite, docx, pptxgenjs, pdf.js (once adopted) and Yjs (once adopted) are separate pull requests with their own review record.

### 4.4 No paid SaaS

1. No feature may require a paid or proprietary online service, account or API key to work. Every module works offline after the first visit (brief §6; SYS-014).
2. Optional network features (classroom host, LAN collaboration, optional remote relay under D-15) run on **self-hosted, free software** that the school or teacher controls.
3. No telemetry, analytics, crash-reporting or error-tracking service, hosted or self-hosted, is added without an owner decision. None exists today.
4. Runtime assets (fonts, OCR language data, the PDF.js worker, CMaps and standard fonts) are bundled or served from the app's own origin, never from a third-party CDN (SYS-020; R-030).
5. Development infrastructure is allowed where it is free for this project and not needed by users: GitHub (repository, Actions, Pages) is used today. The app does not depend on GitHub at run time; the web build runs from any static host.
6. Costs that are not SaaS are owner decisions and are listed openly: Apple Developer Program and Windows code-signing certificates (D-28), devices and licensed office software for compatibility checks (D-22).

### 4.5 No AI in the initial product

1. No machine-learning model, AI API client, AI SDK or AI-generated content feature ships in v1.0.0 (brief §11).
2. Browser spellcheck (`spellcheck` attribute, `DocumentEditor.tsx:128`, `:173`) is the browser's own feature and is not counted as AI added by the product.
3. **Open question for the owner:** Tesseract 4 and later recognise text with an LSTM neural network. OCR is scoped as **evaluation only** (PDF-FR-016, ADR-0023). Whether a local neural-network OCR engine counts as "AI" under brief §11 must be answered before OCR leaves evaluation (proposed: treat it as AI and keep it out of v1.0.0 unless the owner rules otherwise; this question is part of D-20 in the roadmap).
4. No "integration points" for AI are built in v1.0.0. The existing service boundaries (SVC-IO, SVC-SEARCH, host injection) are the natural places for an optional later integration, and nothing in this plan prevents one.
5. Check: the lockfile scan and source grep in §1 are repeated as an automated CI check (AC-DEP-006).

---

## 5. Removals and clean-ups

| Item | Action | Phase | Decision | Criterion |
|---|---|---|---|---|
| html-to-image 1.11.11 and the legacy `export.ts` path (TD-42) | Remove the exports from `packages/diagram-studio/src/index.ts:6`, delete `export.ts`, drop the dependency, regenerate notices | AE-P3 or AE-P5 | D-27 (public API change) | AC-DGM-124, AC-DEP-011 |
| dompurify, html2canvas, canvg (jsPDF optional renderers) | Keep the aliases (`vite.config.ts:17`); record them in the SBOM as present in the lockfile but not shipped | AE-P13 | — | AC-DEP-008 |
| `@tiptap/pm` in presentation-studio | AE-P1 audit found no direct import; it is probably required as a peer of `@tiptap/core`/`@tiptap/react`. Confirm, and document the reason or remove | AE-P3 | — | AC-DEP-011 |
| image-size override | Remove when pptxgenjs declares a fixed range, or when pptxgenjs is replaced | When pptxgenjs changes | — | AC-DEP-012 |
| Empty backend packages (TD-35) | Not a dependency matter; tracked under SYS-011 | AE-P3 | D-27 | AC-SYS-011 |

---

## 6. Candidate libraries per upcoming module

Every row is a **candidate — verify licence, maintenance, security before adoption**. "Reported licence" is what the canonical planning brief or project docs report; it has **not** been checked in an installed package in AE-P1. "To verify" means nothing is recorded. No version numbers are given because none of these packages is installed (AE-P1 lockfile scan: no pdf.js, pdf-lib, Yjs or y-*, SQLite driver or plugin, tesseract.js, search library, ESLint, Prettier or axe).

### 6.1 AE-P2 and AE-P3: tooling and shared foundations

| Candidate | Purpose | Reported licence | Phase | Decision | Specific checks |
|---|---|---|---|---|---|
| ESLint with typescript-eslint | Linting (SYS-009) | MIT (to verify) | AE-P3 | D-24 | Flat config; rule set does not need type-aware lint on every file if CI time matters |
| Prettier | Formatting (SYS-009) | MIT (to verify) | AE-P3 | D-24 | One-off formatting diff accepted by the owner |
| ruff | Python lint and format | MIT (to verify) | AE-P3/AE-P9 | D-24, D-37 | Runs on Python 3.12 |
| @axe-core/playwright | Automated accessibility checks (A11Y-004) | MPL-2.0 (to verify) — **class C** | AE-P3 | D-25 | Test-only; never shipped |
| tailwind-merge | Resolve conflicting classes in `cn()` (TD-48, SYS-064) | MIT (to verify) | AE-P3 | ADR-0024 | Tailwind 4 support; bundle size |
| knip or depcheck | Unused dependency check (SYS-012) | to verify | AE-P3 | — | Understands npm workspaces and Vite aliases |
| @cyclonedx/cyclonedx-npm | npm SBOM (§8) | Apache-2.0 (to verify) | AE-P13 (trial in AE-P2) | D-26 | Workspace support; `--omit dev`; output validates against the CycloneDX schema |
| Web Worker bundling | Off-main-thread imports (SYS-016) | Vite built-in (no new package) | AE-P3 | — | CSP `worker-src` |

### 6.2 AE-P4: Document Studio (M01)

| Candidate | Purpose | Reported licence | Decision | Specific checks |
|---|---|---|---|---|
| Own OOXML reader on fflate + an XML parser (no new package) | Read comments, tracked changes, footnotes and fields from DOCX (mammoth cannot; R-010) | fflate MIT (installed) | D-18 | Preferred: no new dependency |
| @xmldom/xmldom (already installed through mammoth) | Worker-safe XML parsing (DOMParser is not available in workers) | MIT (installed, THIRD_PARTY_NOTICES) | — | Becomes a **direct** dependency, so it needs its own review record; entity expansion limits |
| A CSL citation processor (for example citeproc-js) and CSL style and locale files | Citations and bibliography (DOC-FR-084) | to verify — the processor's and the style files' licences must both be checked; a share-alike or copyleft licence would be class C | D-18 (which styles) | Alternative: original code for APA and MLA only. Style data must be bundled, never fetched |
| Bundled open fonts (for example Noto or Liberation families) | Font choice (DOC-FR-020), PDF output, multilingual text | to verify (OFL-1.1 expected for some, to verify per family) | D-18 | Size per family; subset where possible |
| Programmatic PDF for documents: jsPDF + svg2pdf.js (installed) with a layout engine of our own, or pdf-lib (see §6.5) | Generated PDF instead of the print dialog | jsPDF and svg2pdf.js MIT (installed) | D-18 | Fidelity against the print path; fonts |
| xmllint (libxml2) or a WASM build of it | OOXML and ODF schema validation in tests (TD-11) | to verify | — | Test-only; the ECMA-376 and OASIS schema files carry their own terms (to verify) |

### 6.3 AE-P5: Diagram Studio (M02)

| Candidate | Purpose | Reported licence | Decision | Specific checks |
|---|---|---|---|---|
| @dagrejs/dagre | General layered layout (DGM-FR-080) | MIT (maintenance to verify) | D-21 | Release activity; bundle size; deterministic output |
| Original layout and routing code | Same, plus obstacle-aware routing (DGM-FR-067) | — | D-21 | Effort estimate |
| elkjs | Layout | EPL-2.0 — **class C, outside policy unless D-21** | D-21 | — |
| libavoid-js | Orthogonal routing | LGPL-2.1 — **class C, outside policy unless D-21** | D-21 | — |
| Bundled font for PDF text outside WinAnsi | Non-Latin labels in PDF (TD-45) | to verify | — | Shared with M03 (TD-57) |
| Smart guides | DGM-FR-081 | Original code adapted from `presentation-studio/src/editor/guides.ts`; **React Flow's Pro "helper lines" example must not be copied** | — | — |

### 6.4 AE-P6 and AE-P7: Presentation Studio (M03) and Digital Notebook (M04)

| Candidate | Purpose | Reported licence | Decision | Specific checks |
|---|---|---|---|---|
| pptxgenjs 4.0.1 (installed) or a custom PPTX writer on fflate | Multiple masters (TD-56), groups, timing | MIT (installed) | D-19 | PptxGenJS supports one master; a custom writer means owning OOXML output |
| Bundled fonts embedded in slide PDFs | TD-57 | to verify | D-19 | Same font set as M01/M02 |
| perfect-freehand | Ink strokes in the notebook (ADR-0025) | MIT (to verify) | — | Output is path data only; pressure input on Android WebView |
| MiniSearch | SVC-SEARCH index (first indexer in AE-P7) | MIT (to verify) | D-17 | Incremental updates; serialisable index; memory at 5,000 items (PERF-011) |
| FlexSearch | Alternative for SVC-SEARCH | Apache-2.0 (to verify) | D-17 | Same checks; worker support |
| `@dcos/rich-text` (extracted from document-studio, no new third-party package) | Shared rich-text extensions | — | D-10 | Boundary test |

### 6.5 AE-P8: PDF Studio (M05)

| Candidate | Purpose | Reported licence | Decision | Specific checks |
|---|---|---|---|---|
| pdfjs-dist (Mozilla pdf.js) | Rendering, text layer, search, thumbnails (ADR-0023) | Apache-2.0 (to verify) | — | Runs in a worker; `isEvalSupported: false`; CSP needs (`worker-src`, possibly `wasm-unsafe-eval` for image decoders, to verify); bundled CMaps and standard fonts; Android WebView support; bundle size |
| pdf-lib | Page operations, annotation writing, AcroForm filling | MIT (to verify) | — | **Maintenance must be verified**: it appears to have had no recent releases. Compare maintained forks (for example `@cantoo/pdf-lib`, to verify) and record the result (R-023) |
| tesseract.js and its language data | OCR **evaluation only** (PDF-FR-016) | Apache-2.0 (to verify); language data licence to verify | D-20 (and the AI question in §4.5) | Language data self-hosted, never fetched from a CDN at run time (R-030); size; accuracy |
| Lossless compression | PDF-FR-013 | pdf-lib object streams (if adopted) | D-20 | Lossy image downsampling only with owner approval |
| Origin Private File System | Large blobs on the web | Browser API (no package) | ADR-0017 | Safari and WebView support |

### 6.6 AE-P9: Classroom Hub (M06) host and client

| Candidate | Purpose | Reported licence | Decision | Specific checks |
|---|---|---|---|---|
| argon2-cffi | Password hashing (ADR-0020) | MIT (to verify) | D-13 | Wheels for the host OS chosen under D-13 |
| Python standard library `sqlite3` | Host persistence | Part of Python (PSF licence, to verify); SQLite itself reported public domain, to verify | D-13 | No new package if plain SQL migrations are used |
| SQLAlchemy and Alembic | ORM and migrations, if plain SQL is not enough | to verify | — | Only if justified; adds two large dependencies |
| python-multipart | Form and file uploads in FastAPI | to verify | — | Upload size limits |
| A login rate limiter (library or own middleware) | AC-CLS-044 | to verify | — | Own middleware preferred if small |
| A QR code generator (Python or JS) and a QR reader for pairing | Pairing by QR (CLS-FR-020) | to verify | D-14 | Readers that wrap proprietary mobile SDKs are class D |
| mkcert or an equivalent local CA tool | Locally trusted HTTPS for the host (D-14) | to verify | D-14 | A setup tool, not a runtime dependency |
| pip-audit | Python vulnerability gate | to verify | D-37 | Works from the hashed lock file |

### 6.7 AE-P10: Collaboration Workspace (M07)

| Candidate | Purpose | Reported licence | Decision | Specific checks |
|---|---|---|---|---|
| yjs | CRDT for live co-editing (ADR-0021/0022) | MIT (to verify) | D-16 | Document size growth; garbage collection; snapshot export to JSON |
| y-prosemirror or @tiptap/extension-collaboration and -collaboration-cursor | Tiptap binding | MIT (to verify) | D-16 | **Confirm they are not Tiptap Pro and support Tiptap 3.33** (R-029) |
| y-indexeddb | Offline persistence of shared documents | MIT (to verify) | — | Store isolation from the main database |
| y-protocols (awareness) | Presence and cursors | to verify | — | — |
| pycrdt and pycrdt-websocket | LAN relay inside the FastAPI host | MIT (to verify) | D-14 | Protocol compatibility with yjs |
| y-websocket server | Alternative relay as a separate process | MIT (to verify) | D-14 | Adds a Node process on the host |
| y-webrtc | Peer-to-peer transport | MIT (to verify) | D-15 | Needs a self-hosted signalling server |
| Automerge | Alternative CRDT (record only) | MIT (to verify) | — | For the ADR comparison |

### 6.8 AE-P11 and AE-P12: File Manager (M08) and Dashboard (M09)

No new third-party package is required by the PRDs. Previews reuse the studios' renderers; search uses the SVC-SEARCH candidate chosen in AE-P7; drag-and-drop and command palette use platform APIs and `@dcos/ui`. If a list virtualisation or drag-and-drop library is proposed, it goes through §4.1 (licence to verify).

### 6.9 AE-P13 and AE-P14: security, performance and native platforms

| Candidate | Purpose | Reported licence | Decision | Specific checks |
|---|---|---|---|---|
| hash-wasm or an equivalent Argon2 WASM build | Passphrase key derivation for encrypted backups, if PBKDF2 (WebCrypto, no package) is not chosen | to verify | D-34 | CSP `wasm-unsafe-eval`; speed on Android |
| fast-check | Property-based tests for parsers and sync | to verify | — | Test-only |
| OWASP ZAP | Dynamic scan of the classroom host | to verify | — | Test tool, not shipped |
| OSV-Scanner | One vulnerability scanner across npm, PyPI, crates.io, Maven | to verify | D-26 | Works offline against a downloaded database? to verify |
| cargo-audit | Rust advisories | to verify | — | Needs Cargo.lock |
| tauri-plugin-sql, or rusqlite behind own Tauri commands | Native SQLite on desktop (ADR-0019 option B) | MIT/Apache-2.0 (to verify); rusqlite MIT (to verify) | D-12 | Bundled SQLite build licence (SQLite is public domain, to verify per build) |
| @capacitor-community/sqlite | Native SQLite on Android | MIT (to verify) | D-12 | Capacitor 7 support; encryption features not required |
| Official Tauri plugins (dialog, fs) and Capacitor plugins (Filesystem, Share) | Native save, print and share (TD-28) | to verify | — | Least-privilege capabilities |
| Tauri stronghold or keyring plugin; an Android Keystore plugin | Session token storage on native (ADR-0020) | to verify | D-13 | Maintenance; platform coverage |
| CycloneDX tools for Python, Rust and Gradle | SBOM coverage beyond npm (§8) | to verify | D-26 | — |

---

## 7. Vulnerability management

| Ecosystem | Today | Proposed gate | Phase |
|---|---|---|---|
| npm production | `npm audit --omit=dev --audit-level=high` in CI (`ci.yml:23`) | Keep; add Dependabot security updates (D-05) | AE-P2 |
| npm dev and build | Not gated | Weekly report (not blocking); moderate or higher in build tools reviewed at each phase gate | AE-P3 |
| Python | None | `pip-audit` (candidate) on the hashed lock file, blocking at high | AE-P9 |
| Rust | None | `cargo audit` (candidate) on Cargo.lock, blocking at high | AE-P14 |
| Android (Gradle, Capacitor) | None | Scanner chosen in AE-P14 (candidate: OSV-Scanner) | AE-P14 |

Proposed response times after an advisory is known (to be approved with the severity scale in RELEASE_STRATEGY §6.2): critical — fix or mitigate before the next deploy and within 7 days; high — within 30 days; moderate — next phase gate. An advisory that cannot be fixed (for example through an exact pin) needs a written reachability note, as was done for image-size (DEPENDENCIES.md:85).

---

## 8. SBOM plan

### 8.1 Format (D-26)

- **Proposed:** CycloneDX in JSON, using the current specification version supported by all chosen generators at adoption (to verify in AE-P13).
- **Alternative:** SPDX 2.3 (or later) in JSON. Both are open standards; the choice depends on generator coverage for npm, Python, Rust and Gradle.
- One SBOM per deliverable, then merged into one release SBOM:

| SBOM | Contents | Source of truth | Available from |
|---|---|---|---|
| `web` | npm production packages shipped in `apps/web/dist` | `package-lock.json` | AE-P2 trial; required AE-P13 |
| `web-build-tools` | npm dev and build packages (separate, informational) | `package-lock.json` | AE-P13 |
| `classroom-host` | Python packages | hashed lock file (after TD-32) | AE-P9 |
| `desktop` | Rust crates and the Tauri npm CLI, plus the `web` SBOM | `Cargo.lock` plus the shell's npm lock (after TD-30) | AE-P14 |
| `android` | Gradle dependencies and Capacitor npm packages, plus the `web` SBOM | Gradle lock plus npm lock | AE-P14 |

### 8.2 Required fields

Every component: name, version, package URL (purl), SPDX licence expression as **used** (for dual licences, the chosen option, with the full expression recorded), hash (from the lockfile integrity value where available), supplier where known, and whether it is shipped or build-only. Document metadata: app version, git commit, build date (UTC), generator name and version, and the D-26 format version. Dependency relationships (the graph) are included.

### 8.3 Generation with free tools (all candidates, licence to verify)

| Ecosystem | Candidate generator | Precondition |
|---|---|---|
| npm | `@cyclonedx/cyclonedx-npm` (run with `npx`, production only for the `web` SBOM) | none: the lockfile exists |
| Python | `cyclonedx-py` (CycloneDX Python tooling) | hashed lock file (TD-32, D-37) |
| Rust | `cargo-cyclonedx` | `Cargo.lock` (TD-30) |
| Android | CycloneDX Gradle plugin | generated Android project (AE-P14) |
| Merge and validation | `cyclonedx-cli` (validate, merge) or an equivalent | — |
| Alternative for all | `syft` (SBOM from a directory or build output) | — |

The exact command lines are fixed in AE-P13 after a trial; they are not given here because no tool has been run.

### 8.4 Where it runs and where it is stored

1. **CI on every push to main** (from AE-P13): generate the SBOMs, validate them against the schema, and fail if any component lacks a licence or if a licence is outside §4.2 classes A and B without a recorded owner decision. Kept as a workflow artifact.
2. **Release tags** (RC and stable, RELEASE_STRATEGY §7.2): the merged SBOM is attached to the GitHub release next to the SHA-256 checksums, and a copy is committed under `docs/sbom/<version>/` (proposed; part of D-26) so it stays with the history.
3. **Licence report from the SBOM:** THIRD_PARTY_NOTICES.md becomes a view of the SBOM covering all ecosystems, so there is one source for licences.
4. **Cross-check:** the npm component count in the `web` SBOM equals the production package count in THIRD_PARTY_NOTICES.md (142 at the last recorded run) or the difference is explained (for example `@types/*`, which the report skips).

### 8.5 Licence texts in distributed builds

THIRD_PARTY_NOTICES.md lists names and SPDX ids only. Whether the web build carries the copyright notices that MIT, BSD and Apache-2.0 require (for example through banner comments preserved by the minifier) is **Unverified**. Proposed (DEP-015): generate a `third-party-licences.txt` with full licence texts and copyright lines from the SBOM at build time, ship it with the web build and the native packages, and link it from Settings → About.

---

## 9. DEP requirements

| ID | Requirement | Status today | Evidence | Phase | Criterion |
|---|---|---|---|---|---|
| DEP-001 | Every shipped npm package passes the licence gate in CI (§4.2 classes A or B, or a recorded owner decision) | Done | `license-report.mjs`; `ci.yml:21-22`; 142 packages, none needing review (2026-11-15) | every phase | AC-DEP-001 |
| DEP-002 | Python, Rust, native-shell npm and Android dependencies are covered by the same licence gate | Absent | §2.4 | AE-P9 (Python), AE-P14 (Rust, shells, Android) | AC-DEP-002 |
| DEP-003 | Every new direct dependency and every major upgrade has a §4.1 review record before merge | Partial | DEPENDENCIES.md lacks maintenance, security, performance, sustainability columns | AE-P2 (template), every phase | AC-DEP-003 |
| DEP-004 | Class C licences enter only with a dated owner decision; class D never ships | Partial | Allow-list enforces A and B for npm production; classes not written down until this plan | AE-P2 | AC-DEP-004 |
| DEP-005 | No feature requires a paid or proprietary online service; no telemetry or crash-reporting service | Done (by construction) | No service client in lockfile; `e2e/privacy.spec.ts` | every phase | AC-DEP-005 |
| DEP-006 | No AI model, AI API client or AI feature ships in v1.0.0; checked automatically | Partial: no AI package or AI API host today (AE-P1 scan); the automated check is Absent | AE-P1 lockfile scan and grep | AE-P3 (check) | AC-DEP-006 |
| DEP-007 | No runtime asset is fetched from a third-party CDN | Done | Fonts and KaTeX CSS bundled; no CDN hosts in source | every phase (owned by SYS-020) | AC-SYS-020 |
| DEP-008 | A validated SBOM in the D-26 format is produced for every deliverable and attached to every release | Absent | §1 | AE-P13 (CI), AE-P16 (release) | AC-DEP-008 |
| DEP-009 | Vulnerability gates block high and critical advisories in every ecosystem that ships | Partial (npm production only) | `ci.yml:23` | AE-P2 (npm), AE-P9 (Python), AE-P14 (Rust, Android) | AC-DEP-009 |
| DEP-010 | Dependabot security updates (or an equivalent) are enabled on the repository | Absent | gh, 2026-11-15 | AE-P2 (D-05) | AC-DEP-010 |
| DEP-011 | No unused production dependency (detail and check owned by SYS-012) | Partial | html-to-image (TD-42) | AE-P3 | AC-SYS-012, AC-DEP-011 |
| DEP-012 | Every exact pin and override has a written reason, a removal condition and a named re-test set | Done for the current pins and override | DEPENDENCIES.md:76-85 | every phase | AC-DEP-012 |
| DEP-013 | Installs are reproducible from lock files in every ecosystem (`npm ci`, hashed Python lock, `Cargo.lock`, Gradle lock) | Partial (npm only) | TD-30, TD-32 | AE-P9, AE-P14; release check REL-021 | AC-DEP-013 |
| DEP-014 | No paid "Pro" package or Pro example code (Tiptap Pro, React Flow Pro) | Partial: Tiptap Pro gate Done; React Flow Pro code excluded by review only (no automated check) | `license-report.mjs:38,64-67`; `boundaries.test.ts:44-45`; no `proOptions` | every phase | AC-DEP-014 |
| DEP-015 | Full licence texts and copyright notices ship with every distributed build and are reachable from the About page | Unverified | §8.5 | AE-P13 | AC-DEP-015 |
| DEP-016 | Dev and build tool licences are reported (not necessarily gated) and class C build tools are recorded | Absent | lightningcss MPL-2.0, caniuse-lite CC-BY-4.0 (AE-P1 scan) | AE-P13 | AC-DEP-016 |
| DEP-017 | Every dependency's maintenance and advisory status is re-reviewed before the release candidate | Absent | — | AE-P13, AE-P15 | AC-DEP-017 |

---

## 10. Known risks

From [RISK_REGISTER.md](RISK_REGISTER.md):

| Risk | Relevance here | Mitigation in this plan |
|---|---|---|
| R-013 | TOC bookmarks rely on a private docx 9.15.3 property (TD-38) | Major docx upgrades are separate PRs with the M01 golden tests (§4.3) |
| R-016 | Layout engines outside licence policy (elkjs, libavoid-js) | Class C rule (§4.2); D-21 |
| R-023 | pdf-lib maintenance status; malformed-PDF security | §6.5 checks; fork comparison recorded before adoption |
| R-026 | Python version drift and unpinned dependencies (TD-32) | DEP-013; D-37 |
| R-029 | Yjs and Tiptap 3.33 binding compatibility | §6.7 checks; AE-P10 spike |
| R-030 | OCR or font assets from third-party CDNs | §4.4 rule 4; SYS-020 |
| R-032 | Native shells unbuilt; no lock files | DEP-002, DEP-013 |
| R-100 | Exactly pinned, slow-moving dependencies (pptxgenjs, image-size override) | DEP-012; maintenance threshold in §4.1; D-19 custom writer option |

Plan-specific risks (proposed, not yet numbered; RISK_REGISTER §5 assigns new risks from R-105 onwards, and R-101 to R-104 are M05 risks):

- **Licence drift on upgrade.** A package can change licence between versions. Mitigation: the gate runs on every CI build and the review record names the version reviewed.
- **SBOM tooling gaps across four ecosystems.** One generator may not cover all. Mitigation: per-deliverable SBOMs and a merge step (§8.1); `syft` as fallback.
- **Exact pins block security patches.** Mitigation: Dependabot alerts, once enabled under D-05 (they are off today, §1), report advisories for pinned packages; DEP-012 requires a re-test set so upgrades are cheap.
- **"AI" scope ambiguity for OCR.** Mitigation: §4.5 item 3; owner answer under D-20.

## 11. Owner decisions referenced

D-05 (Dependabot), D-10 (shared rich-text package), D-12 (native storage), D-13 (classroom host), D-14 (LAN security), D-15 (remote sync), D-16 (co-editing scope), D-17 (search scope), D-18 (M01 scope: fonts, citations, generated PDF), D-19 (M03 scope: masters), D-20 (M05 scope: compression, OCR, and the AI question in §4.5), D-21 (diagram layout engine licence), D-22 (external applications), D-24 (lint and format), D-25 (`@axe-core/playwright`, MPL-2.0), D-26 (SBOM format and coverage), D-27 (dead code removal), D-28 (signing costs), D-34 (backup encryption), D-37 (Python version). This plan decides none of them.
