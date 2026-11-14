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

## 8. Status after Phase 4 (Document Studio)

Feature by feature, see [FEATURE_STATUS.md](FEATURE_STATUS.md) (Document Studio table) and [DOCUMENT_COMPATIBILITY.md](../DOCUMENT_COMPATIBILITY.md). Format decisions: [ADR 0011](../adr/0011-document-format-phase4.md).

| Item | Status | Where |
|---|---|---|
| RG-4 HTML injection through the header/footer into the print page (DS-1) | ✅ Fixed: `cssString()` escapes `<` and `>` as CSS escapes; tested with `</style><img onerror>` in the header and in a left header part | `export/print.ts`; `export/docx.test.ts`, `export/layout-export.test.ts` |
| RG-5 unvalidated page settings (DS-2) | ✅ Fixed: every stored page setting and layout field is checked; unknown values (e.g. a paper size this version doesn't know) open the protected view with the stored original unchanged; the dialogs refuse margins that leave no room for text in any section | `types.ts`, `pageLayout.ts`, `ui/ribbon/layout/useSection.ts`; `safety.test.ts`, `layout.test.ts`, `LayoutTab.test.tsx` |
| RG-10 menu item that only shows a hint toast (DS-8) | ✅ Removed | `ui/DiagramRibbon.tsx`; `Ribbon.test.tsx`, `e2e/ribbon-document.spec.ts` |
| RG-11 overstated claims | 🟡 The page-setup/PDF part (DS-5) is fixed: the export menu says the print dialog is used and that header, footer and page numbers need a recent Chrome or Edge, and Safari/Firefox get a toast when printing. The other claims remain for their phases | `ui/ExportMenu.tsx`, `export/printSupport.ts` |
| RG-12 DOCX never opened in Word or LibreOffice (DS-4) | 🟡 **Partly closed (2026-11-13/14).** All 16 DOCX samples were opened in Apple Pages: everything renders except four differences (landscape sections shown portrait, continuous breaks start a new page, floating text boxes don't wrap, "Page x of y" after a restart). Microsoft Word for Mac (unlicensed, read-only) was checked with 2 of 16 files, which match; the rest was skipped at the owner's choice after Word's privacy notice blocked it. Still open: the remaining 14 files in Word, Word for Windows, LibreOffice, and ODT in any other word processor | DOCUMENT_COMPATIBILITY.md §8; [compatibility/phase4-2026-11-14](../compatibility/phase4-2026-11-14/README.md) |
| RR-3 web images on paste (DS-3) | 🟡 Done as far as the browser allows: a pasted web picture is fetched once (no cookies or referrer) and stored as a data URL; when the site refuses, which is common, it is kept, visibly marked "Not saved for offline use", and counted in the export toasts. Nothing is fetched when a document opens | `extensions/remoteImages.ts`; `remoteImages.test.ts`, `e2e/ribbon-document.spec.ts` |
| RR-5 missing diagram data, failed preview load (WEB-3, WEB-10) | ✅ Fixed | `extensions/diagramEmbed.tsx`, `extensions/previewCache.ts`; `Ribbon.test.tsx`, `previewCache.test.ts` |
| RR-12 DOCX fidelity (DS-6, TD-10) | ✅ Fixed in the XML (line height, column widths, list alignment, highlight, a real table-of-contents field). Seen in Pages (all 16 samples) and in Word for 01-format and 02-layout-sections (DOCUMENT_COMPATIBILITY.md §8) | `export/docx/`; DOCUMENT_COMPATIBILITY.md §3, §8 |
| RR-2 / TD-2 images inline in document content | ⬜ Not changed in Phase 4 (no decision to move them was made); version history stores large images once since Phase 3 | ADR 0011 §10 |
| DS-7 unvalidated hrefs; scheme-less links | ✅ Fixed: only allowed schemes are exported; the link box adds `https://` | `links.ts`; `links.test.ts`, `docx.test.ts` |
| DS-9 export toasts assume `<a download>` and `print()` | ⬜ Unchanged; belongs with the native shells (TD-28) | — |
| DS-10 preview cache never revokes URLs (TD-14) | ✅ Fixed | `extensions/previewCache.ts` |
| TD-8, TD-12, TD-13, TD-14 | ✅ Fixed | [TECHNICAL_DEBT.md](TECHNICAL_DEBT.md), status after Phase 4 |
| TD-9, TD-11 | 🟡 Improved; see TECHNICAL_DEBT.md | — |

**§4, brief phase 4.** Implemented, with the limits listed in FEATURE_STATUS.md: comments, equations, columns, sections, text boxes, shapes, a ruler, line spacing and indentation controls, named styles, list styles, five paper sizes, header and footer parts, page number formats, a document language, DOCX import, and ODT export and import. Still missing: real pagination on screen. Approximated in exports and reported to the user: shapes (pictures in DOCX, text in ODT), text boxes (one-cell tables in DOCX), equations outside Word's subset, and in ODT comments, equations and sections.

**Still open in Document Studio** (beyond RG-12): no on-screen pagination; PDF only through the browser print dialog, with header, footer and page numbers needing Chromium 131+; the DOCX import leaves out Phase 4 layout and list settings (reported) and has small silent losses; the ODT import's total table size is unbounded (TD-39); the APA and MLA templates lack double spacing and hanging indents until the owner decides whether templates may be schema 2. The full list is DOCUMENT_COMPATIBILITY.md §9.

## 9. Status after Phase 5 (Diagram Studio)

Working tree on top of `206e080`, not yet committed. Feature by feature, see [FEATURE_STATUS.md](FEATURE_STATUS.md) (Diagram Studio table). Format decisions: [ADR 0012](../adr/0012-diagram-format-phase5.md); exports and their approximations: [DIAGRAM_EXPORTS.md](../DIAGRAM_EXPORTS.md). "Where" names the code, the tests and, where there are any, the debt items.

| Item | Status | Where |
|---|---|---|
| RG-6 diagrams.net import drops content silently; hidden layers imported visible (DS-R1, DS-R2) | ✅ Fixed in code: links, tooltips, properties, groups, layers, hidden cells, bend points, rotation, opacity, fonts, alignment, embedded pictures and swimlanes are kept, and everything else is named in a counted note (`IMPORT_NOTES`). Only one page is imported: the app always takes the first (there is no page picker; `fromDrawio` accepts `{ page }`), and the other pages are named in a note. Hidden shapes and layers stay hidden and are named. Hidden connectors, and connectors on hidden layers, are shown, with a note. **Not checked against diagrams.net:** the corpus is hand-written from the file format, and no file known to be saved by diagrams.net itself is in the tests | `drawio.ts`, `drawioFeatures.ts`; `tests/integration/drawio-corpus.test.ts`, `drawio-phase5.test.ts`, `e2e/diagram-drawio-features.spec.ts` |
| DS-R7 connectors to diagrams.net groups dropped with a wrong reason | ✅ Fixed: groups are imported as groups, so the connectors stay; loose connectors get the right reason and plural | `drawio-corpus.test.ts` 'groups and containers', 'connectors' |
| RG-8 errors inside the document's diagram dialog are invisible (WEB-2) | ⬜ Unchanged. The dialog is still a native modal and `packages/ui/src/toast.tsx` is unchanged, so "Add at least one shape…" and save errors still render outside the top layer (from reading the code). Phase 5 shows toasts inside the editor only while it is full screen (`editor/fullscreenToasts.tsx`). In the document's diagram dialog outside full screen, the editor's own toasts are invisible as well: export notes (including the pixel ratio used), export errors, the cut and ungroup notes, paste errors, connection notes and the timeline note about removed lines (from reading the code) | TD-24 |
| RG-11 overstated claims, diagram parts (DS-R5, DS-R1) | 🟡 The diagram parts are now true or reworded: the palette works by touch (covered on mobile Chromium only; README says so) and ARCHITECTURE's import claim is backed by `IMPORT_NOTES`. The DEPLOYMENT desktop steps (BP-3) and Firefox "covered in CI" (BP-1) remain | README.md, ARCHITECTURE.md |
| RR-4 export pixel ratio; 500-node browser test (DS-R4, TD-19) | ✅ Fixed: PNG capped at 16,777,216 pixels and 16,384 px per side, with the ratio used stated in the toast and the Export options dialog; generated 500- and 2000-shape diagrams | `vector/raster.ts`, `export.ts` `cappedPixelRatio`; `e2e/diagram-large.spec.ts` (render, drag, save, PNG, Chromium and WebKit), `tests/integration/large-diagram.test.ts` |
| RR-8 quick-connect palette by touch and keyboard (DS-R5, DS-R6) | ✅ Fixed: roving focus, arrow keys, Home/End, Enter, Escape; long press opens the palette without adding a copy. Touch is automated in mobile Chromium only, not WebKit | `QuickConnect.tsx`, `connect/paletteNav.ts`; `e2e/diagram-palette-quick-connect-touch.spec.ts` |
| RR-9 SVG export is HTML in `foreignObject` (DS-R3) | ✅ Fixed: a model-to-SVG renderer (no `foreignObject`, HTML or CSS classes) feeds the SVG, the PNG and a vector PDF with real text. Approximated: label fonts (Helvetica metrics instead of Inter), clipping by line, PDF text outside WinAnsi. The SVG and PDF were not opened in office or design tools | `vector/`; `vector/renderSvg.test.tsx`, `tests/golden/diagram-v3/kitchen-sink-v3.svg`, `e2e/diagram-export.spec.ts` |
| DS-R8 each change serialised the diagram twice | ✅ Fixed: one serialisation per real change | `editor/useDiagramState.ts`; `useDiagramState.test.tsx` |
| TD-47 keyboard in the document's diagram dialog (found in Phase 5) | ✅ Fixed: the dialog check `inDialog` treated the `<dialog>` that holds the editor like Export options, so shortcuts, Delete/Backspace and copy/paste did nothing there (a regression within Phase 5; the Diagrams page was not affected). `inDialog(target, root)` now ignores a dialog that contains the editor's root. Copy and cut inside that dialog are not tested | `editor/shortcuts.ts`, `editor/useCanvas.ts` `inEditor`, `DiagramEditor.tsx` `onBeforeDelete`; `canvas.test.tsx` (Ctrl+D, paste, Delete), `e2e/diagram-embed.spec.ts` (duplicate, delete, undo; Chromium and WebKit, failed before the fix) |
| TD-15 to TD-22, TD-24; new TD-42 to TD-48 (TD-47 fixed) | See [TECHNICAL_DEBT.md](TECHNICAL_DEBT.md), status after Phase 5 and new debt from Phase 5 | — |

**Verification (2026-11-14).** Three fixes were made after the first full Phase 5 run, each with tests:

- Copy and Ctrl+V are ignored while focus is in a dialog over the editor (Export options, the shortcut help), so nothing is pasted behind it (`editor/useCanvas.ts` `inEditor`; `canvas.test.tsx` 'a paste while focus is on a dialog button does not paste shapes behind the dialog').
- Timeline Arrange and Add event show a toast with the number of plain lines removed between dates that are no longer neighbours, and Undo restores them (`library/editorActions.tsx` `noteRemovedAxis`; `layouts.test.ts`; the toast and Undo are tested in `library/editor.test.tsx` for Arrange only).
- The Format panel's new-property row is a grid. The Add property button sat about 50 px outside the panel and the value field was 26 px wide, in Chromium and WebKit: the shared `Input` is `w-full` and `cn` does not merge Tailwind classes, so `w-20` could not override it (TD-48). `e2e/diagram-canvas.spec.ts` now asserts that the row fits. Found by investigating a flaky WebKit test with a trace; afterwards it passed 20/20 repeats.

The run after these fixes, before the dialog-host fix (TD-47): typecheck clean; Vitest 77 files, 1306 tests passed, coverage 86.25% lines / 83.37% statements; build passes; Playwright on Chromium, WebKit and mobile Chromium 251 passed, 18 skipped (profile-limited by design), 0 failed; upgrade test 54/54; licences: 138 production packages, and the only strings that are not plain MIT were already present before Phase 5; `npm audit --omit=dev` 0 vulnerabilities; backend 3/3. The WebKit group-drag test (formerly flaky) passed 8/8 repeats. No diagrams.net or other external-app check has been done.

Final rerun after the dialog-host fix (same day): typecheck clean; vitest 77 files, 1307 tests passed, coverage 86.25% lines / 83.38% statements; build passes; Playwright 253 passed, 18 skipped, 0 failed (chromium, webkit, mobile-chromium); upgrade test 54/54; licences 138 production packages; npm audit --omit=dev 0 vulnerabilities; backend 3/3.

**§4, brief phase 5.** Implemented, with the limits listed in FEATURE_STATUS.md: group/ungroup, lock, layers and z-order, distribute, full screen, bend points, connection points, BPMN, UML sequence/activity/state/use case, radial and two-sided mind maps, network icons, timelines, cut and the system clipboard between diagrams and tabs, and the `.dcosdiagram` file. Schema 3 is used only by diagrams that need it ([ADR 0012](../adr/0012-diagram-format-phase5.md)); backups accept it. **Rotation** is only partly there: it is kept, drawn and exported from imported files, but the editor has no control to set it (the same holds for opacity, font family, text alignment and pictures).

**Still open in Diagram Studio:**

- **No external diagrams.net check has been done.** Neither the exported `.drawio` files (including the golden `kitchen-sink-v3.drawio`) nor the BPMN (`mxgraph.bpmn.event`, `gateway2`) and network (`mxgraph.networks.*`) stencil names were opened in diagrams.net; the round trips are checked only by our own importer. Needs diagrams.net (web or desktop) and a dated record, like DOCUMENT_COMPATIBILITY.md §8 for Word.
- SVG and PDF exports not opened in office or design tools; PDF labels with characters outside WinAnsi (Greek, CJK, emoji) may not show.
- Touch flows automated only in mobile Chromium; Firefox only in CI, which has never run (RG-13).
- Copied shapes reach other apps and Document Studio as JSON text (TD-44).
- No obstacle avoidance; connectors always under shapes; lanes do not resize with their pool; BPMN event symbols (timer, message) not drawn.
- Timeline Arrange and Add event delete any straight, unlabelled line without arrows or bend points that joins dates that are no longer next to each other, treating it as an old axis piece. A toast says how many lines were removed and Undo brings them back; a label, an arrow or a bend keeps a line (`library/timeline.ts` `isAxisSegment`; `layouts.test.ts`; the toast is checked for Arrange only, in `editor.test.tsx`).

## 10. Status after Phase 6 (document–diagram integration)

Working tree on top of `8f772ba`, not yet committed. Built in three rounds (foundation; four groups in parallel, each checked by a separate verifier; integration). Feature by feature, see [FEATURE_STATUS.md](FEATURE_STATUS.md) (the Embed rows); decisions in [ADR 0013](../adr/0013-document-diagram-integration.md); debt in [TECHNICAL_DEBT.md](TECHNICAL_DEBT.md) (status after Phase 6).

| Item | Status | Where |
|---|---|---|
| RG-8 errors inside the document's diagram dialog are invisible (WEB-2) | ✅ Fixed: toasts are shown inside the top modal dialog and are announced (role status, alert for errors); the dialog's own save errors and "Add at least one shape" are an alert inside it. Checked in Chromium and WebKit with `elementFromPoint` on the toast. Not tried with a real screen reader | `packages/ui/src/toast.tsx`, `apps/web/src/components/DiagramDialogs.tsx`; `toast.test.tsx`, `DiagramDialogs.test.tsx`, `e2e/diagram-embed-dialog.spec.ts`; TD-24 |
| Brief: insert, save, reopen, edit (double-click) | ✅ Also double-tap, Enter and F2, through one helper with the same guards; focus returns to the document | `extensions/diagramEmbed.tsx` `openDiagramEditor`; `diagramNode.test.tsx`, `e2e/diagram-embed-node*.spec.ts` |
| Brief: editable data kept apart from previews | ✅ `source` in the document, PNG previews as attachments; a missing preview is drawn again from the data and stored without an undo step | `diagramNode.test.tsx`, `e2e/diagram-embed-node.spec.ts` |
| Brief: aspect ratio and dimensions | ✅ Width plus aspect ratio on any page, column, cell, phone and in print; inserts and pastes in a container use its share of the page (the same stored size on a phone as on a desktop, Round 3) | `diagramClipboard.test.ts`, `phase6-cross-feature.test.ts`, `e2e/diagram-embed-node*.spec.ts` |
| Brief: save diagram changes without damaging the document | ✅ One undo step, text around untouched; an edit that comes back after the document was reloaded or the diagram removed is not applied, and since Round 3 its edits stay offered for recovery instead of being lost | `DiagramHost.settle`; `diagramNode.test.tsx`, `DiagramDialogs.test.tsx` |
| Brief: copy, cut, paste; multiple diagrams | ✅ Within and across documents, twice in a row, table cell, list item, text box, undo/redo, Diagram Studio ↔ document (TD-44 fixed), other apps get text and a picture | `diagramClipboard.test.ts`, `e2e/diagram-embed-clipboard.spec.ts`, `e2e/diagram-embed-safety.spec.ts` |
| Brief: preserve diagrams in exports where supported | ✅ DOCX and ODT: SVG with PNG fallback, the PNG carrying the editable diagram, so importing the file back gives editable diagrams with alignment, caption, alt text and size; print uses the SVG; TXT lists labels; `.dcosdoc` keeps everything. 🟡 The DOCX sample was checked in Pages (both diagrams complete and unstretched, caption and alt text kept; docs/compatibility/phase6-2026-11-14); not opened in Word or LibreOffice yet | `diagram-roundtrip.test.ts`, `ImportDocument.diagrams.test.tsx`, `phase6-cross-feature.test.ts`, `e2e/diagram-embed-export.spec.ts`; TD-53 |
| Brief: recover | ✅ Unsaved dialog edits survive a reload, a closed tab, an editor that went away and a save that could not be applied; version, trash and backup restore keep every preview. A kept dialog edit is stored as a schema-2 document (a note, the diagram before, the edited diagram), so builds before Phase 6, which offer it as unsaved document changes, recover it as an editable "(recovered)" copy | `diagram-dialog-drafts.test.tsx`, `phase6-cross-feature.test.ts`, `e2e/diagram-embed-dialog.spec.ts`, `e2e/backup-restore.spec.ts` |

**Round 3 (integration) fixes, each with a regression test that fails without it unless marked "no test":** Save no longer removes the dialog's draft before the diagram is in the document (new `DiagramHost.settle`); the recovery offer reads its draft again (no duplicate when another tab recovered it), has "Later", fits a phone (no test), and focus returns to the document after a recovered save; text typed in the Selected diagram bar goes to the diagram it was typed for when another diagram is clicked next; a paste at phone width no longer shrinks the stored size (fit only inside containers, as a share of the page; the ribbon insert uses the same rule, no test of its own); copying text selected inside Diagram Studio stops Ctrl+V from pasting older shapes; a pasted diagram's lost preview is drawn once (the clipboard plugin's second redraw was removed); the read-ahead of previews for the clipboard skips the selection a document opens with (it took the place of the view's own load, so a failed load showed no "preview unavailable", Ribbon.test WEB-10); DOCX import reads descriptions in single quotes or holding `>` (such files failed to import) and keeps a cropped picture's own proportions; "Import document" and "Import a file" name `.dcosdoc` (no test); a `.dcosdoc` whose pictures cannot be read is saved with no picture ids; a large diagram's natural size survives DOCX/ODT exactly; imported diagram sizes are bounded; print drops the screen-reader hint and uses the plain title; the toast area moves out of a dialog removed while open before the next toast; menus follow the keyboard menu pattern (TD-25, menus only).

**Investigated, not dismissed:** `e2e/backup-restore.spec.ts` failed in Chromium and WebKit (also in the Round 2 verifier's run). A trace and a probe showed why: the new diagram is selected after its insert, and the browser hands a click's caret to the editor a few milliseconds later (`selectionchange` is async), so the test's typing replaced the diagram; and since Phase 6 no longer splits that paragraph, End reached only the end of a wrapped line. The test now waits for the selection to move (as `diagram-embed-safety.spec.ts` already did) and places the caret after the text; the product behaviour (typing straight after an insert replaces the selected diagram, as in Phase 5) is TD-49.

**Verification (2026-11-14, Round 3), run alone on the final tree:** typecheck clean; Vitest 93 files, 1504 tests passed, coverage 87.9% lines / 84.92% statements; build passes; Playwright on Chromium, WebKit and mobile Chromium (`--workers=4`) 294 passed, 18 skipped (profile-limited by design), 0 failed (the first full run failed only `backup-restore.spec.ts` in Chromium and WebKit, investigated above); upgrade test 54/54; licences: 138 production packages, unchanged; `npm audit --omit=dev` 0 vulnerabilities; backend 3/3. Firefox not run.

**Final verification (2026-11-14, after the cross-feature review, on the committed tree):**
- The last fix stores dialog drafts as a schema-2 document, so builds before Phase 6 recover them as an editable copy instead of an empty document.
- Typecheck is clean, and the build passes.
- Vitest: 93 files, 1505 tests passed. Coverage is 87.92% lines and 84.93% statements.
- Playwright (`--workers=4`):
  - The first full run gave 293 passed, 1 failed and 18 skipped. The failure was the WebKit run of the tabs test in `files-tabs-templates.spec.ts`, while macOS system processes held the load average at about 80.
  - That test then passed 5 times out of 5 on WebKit.
  - A full re-run at low load gave 294 passed, 18 skipped and 0 failed.
- Other checks: upgrade test 54/54; licences unchanged at 138 production packages; `npm audit --omit=dev` 0 vulnerabilities; backend 3/3.
- Firefox was not run.
- The DOCX sample was opened in Apple Pages ([results](../compatibility/phase6-2026-11-14/README.md)). Word and LibreOffice have not opened any Phase 6 sample.

**Still open after Phase 6:**

- Only Pages has opened a Phase 6 export (the DOCX sample, 2026-11-14). Word and LibreOffice have not, and the ODT two-image frame has not been opened in any other app (TD-53).
- Firefox not run (TD-54); WebKit touch is emulated.
- No SVG preview is stored; exports draw it each time (TD-50). A recovered edit of identical copies may land on another copy (TD-51).
- Typing straight after inserting a diagram replaces it (TD-49).
