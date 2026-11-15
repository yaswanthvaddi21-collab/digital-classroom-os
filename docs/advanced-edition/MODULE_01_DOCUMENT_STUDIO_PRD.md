# Module 01: Advanced Document Studio (PRD)

This document defines what the Advanced Document Studio (module M01, prefix DOC) must do to meet the owner's Advanced Edition brief (Module 01), records how much of it already exists in `packages/document-studio` after the v0.2 programme, and lists the remaining work, acceptance criteria, tests and risks for phase AE-P4. It is a planning document: nothing here has been built or re-run in AE-P1.

**Status:** AE-P1 draft for owner approval (2026-11-15)

**Audited at:** HEAD `edc2672` on branch `advanced/phase1-audit` (no commits of its own). No test suite, build or browser was run for this document; every "Done" relies on a test file plus the recorded local verification of 2026-11-15 (RELEASE_GAPS.md §11, lines 251-264).

**Related documents (this folder):**
[Roadmap](ADVANCED_EDITION_PRODUCT_ROADMAP.md) ·
[Module 02 Diagram Studio](MODULE_02_DIAGRAM_STUDIO_PRD.md) ·
[Module 03 Presentation Studio](MODULE_03_PRESENTATION_STUDIO_PRD.md) ·
[Module 04 Digital Notebook](MODULE_04_DIGITAL_NOTEBOOK_PRD.md) ·
[Module 05 PDF Studio](MODULE_05_PDF_STUDIO_PRD.md) ·
[Module 07 Collaboration](MODULE_07_COLLABORATION_PRD.md) ·
[Module 08 File Manager](MODULE_08_FILE_MANAGER_PRD.md) ·
[Module 09 Dashboard](MODULE_09_DASHBOARD_PRD.md) ·
[System architecture](SYSTEM_ARCHITECTURE.md) ·
[Database and sync](DATABASE_AND_SYNC_ARCHITECTURE.md) ·
[Dependencies and licences](DEPENDENCY_AND_LICENCE_PLAN.md) ·
[Module dependency map](MODULE_DEPENDENCY_MAP.md) ·
[Acceptance criteria](ACCEPTANCE_CRITERIA.md) ·
[Security and privacy](SECURITY_AND_PRIVACY_PLAN.md) ·
[Risk register](RISK_REGISTER.md) ·
[Release strategy](RELEASE_STRATEGY.md)

**Conventions.** Status words are **Done**, **Partial**, **Stub**, **Absent** and **Unverified**, as defined in the canonical planning brief. "Done" means Done in v0.2 with a test file and the 2026-11-15 recorded run; it does not mean the item meets its Advanced acceptance criterion. Every Done item carries "re-verify: yes" and must pass its AC-DOC criterion again in AE-P4. Phases are written AE-P1 … AE-P16 (new programme) or "v0.2 Phase n" (earlier programme). Paths without a prefix are relative to `packages/document-studio/src/`.

---

## Current state

### What earlier commits delivered towards AE-P4

| Commit | Date | What it delivered for M01 |
|---|---|---|
| 20d3f4d | 2026-11-13 (baseline, tag `v0.1.0-baseline`) | v0.1.0 Document Studio foundation (A4/Letter, basic formatting, DOCX export) |
| f50b0d4, ff53b49, ea7f316 | 2026-11-13 | v0.2 stabilisation; first editable diagrams in documents; review fixes |
| fe3275a | 2026-11-13 | v0.2 Phase 4 Document Studio: ribbon, formatting, layout, insert, review, DOCX/ODT export and import (see the verification summary below) |
| 206e080 | 2026-11-14 | Docs only: Apple Pages and Word for Mac check of the DOCX exports |
| 650cf63 | 2026-11-14 | v0.2 Phase 6 document–diagram integration (INT-01): editable diagram embeds, `.dcosdoc`, diagram clipboard (41 package files, +4,499/−210) |
| edc2672 | 2026-11-15 | v0.2 Phase 7 Presentation Studio: does **not** touch `packages/document-studio` (`git log fe3275a..edc2672 -- packages/document-studio` lists only 650cf63) |

These commits are a head start for AE-P4, not a pass. Every Done row below must pass its AC-DOC criterion again.

### Status table (copied from the canonical planning brief §2, M01)

| ID | Brief bullet | Status | Key evidence / limits |
|---|---|---|---|
| DOC-FR-001 | Rich-text editing | Done | extensions/index.ts:34-74; extensions.test.ts; e2e/document.spec.ts, home-formatting.spec.ts |
| DOC-FR-002 | Simple and Advanced modes | Done | ui/ribbon/registry.ts:18-25; Ribbon.test.tsx. The mode only filters the ribbon, and it is saved in the document |
| DOC-FR-003 | Multiple open documents | Partial | apps/web/src/lib/openTabs.ts:15 (12 tabs). One editor visible at a time; no split view |
| DOC-FR-004 | Multi-page layout | Partial | DocumentEditor.tsx:308-320 draws one continuous sheet. Real pages exist only in print, DOCX and ODT (DOCUMENT_COMPATIBILITY §6, §9) |
| DOC-FR-005 | Autosave | Done | apps/web/src/lib/storage.ts:689; ADR 0004 |
| DOC-FR-006 | Undo/redo | Done | StarterKit UndoRedo (extensions/index.ts:35). History lives in memory only |
| DOC-FR-007 | Version history | Done (list/restore) | EditorFrame.tsx:398-472; ADR 0005. No preview or compare |
| DOC-FR-008 | Find and replace | Done | extensions/searchReplace.ts:13-138; e2e/review.spec.ts:144. No regex |
| DOC-FR-009 | Word count | Done | review/wordCount.ts; review.test.ts |
| DOC-FR-010 | Spellcheck | Done | browser spellcheck (DocumentEditor.tsx:97); e2e/review.spec.ts:125 |
| DOC-FR-020 | Font families | Partial | HomeTab.tsx:30-38: 6 system fonts, Advanced mode only, none bundled |
| DOC-FR-021 | Font sizes | Done | HomeTab.tsx:39; custom size 1–400 pt |
| DOC-FR-022 | Font colours | Done | ColorPanel.tsx; Word matched (phase4 compatibility README) |
| DOC-FR-023 | Highlighting | Done | maps to Word's 16 highlight colours (TD-10) |
| DOC-FR-024 | Paragraph formatting | Done | paragraphFormat.ts; paragraphFormat.test.ts |
| DOC-FR-025 | Line spacing | Done | ParagraphControls.tsx:14-36 |
| DOC-FR-026 | Indentation | Done | paragraphFormat.ts; docx/format.test.ts |
| DOC-FR-027 | Headings and named styles | Done (fixed set) | paragraphStyles.ts:30-33. No user-defined styles; no H5–H6 |
| DOC-FR-028 | Bullets and numbering | Done | extensions/listStyles.ts |
| DOC-FR-029 | Rulers | Partial | Ruler.tsx: horizontal only, Advanced mode only; no tab stops |
| DOC-FR-030 | Page margins | Done | PageSetupDialog.tsx; types.ts:128 |
| DOC-FR-040 | A4, A3, A5, Letter, Legal | Done | types.ts:9, :41-46 |
| DOC-FR-041 | Portrait and landscape | Partial | Per-section orientation is not shown on screen; ODT has one orientation for the whole document; Pages draws a landscape section as portrait |
| DOC-FR-042 | Columns | Partial | pageLayout.ts:56-121. Screen always shows one column; ODT keeps the first section only |
| DOC-FR-043 | Page breaks | Done | extensions/pageBreak.ts |
| DOC-FR-044 | Section breaks | Partial | sectionBreak.ts. Not laid out on screen; ODT and DOCX import are lossy |
| DOC-FR-045 | Headers and footers | Partial | HeaderFooterDialog.tsx. In PDF they need Chromium 131+ (printSupport.ts:11) |
| DOC-FR-046 | Page numbers | Partial | PageNumbersDialog.tsx. Screen shows "#"; print needs Chromium 131+ |
| DOC-FR-047 | Different first page | Done | pageLayout.ts:73-156; DOCX w:titlePg |
| DOC-FR-060 | Tables | Done | TableKit; docx and odt tests |
| DOC-FR-061 | Images | Partial | image.ts (15 MB cap). No wrapping; pictures stored inline as data URLs (TD-2) |
| DOC-FR-062 | Shapes | Partial | shapeModel.ts:4: 6 kinds, block-level. DOCX gets a picture; ODT gets text |
| DOC-FR-063 | Text boxes | Partial | textBox.ts. DOCX writes a one-cell table |
| DOC-FR-064 | Equations | Partial | equation.ts:13 (KaTeX). Native Word maths for a subset only; dropped on import |
| DOC-FR-065 | Hyperlinks | Done | links.ts:24-36; links.test.ts |
| DOC-FR-066 | Diagrams | Done | diagramEmbed.tsx:109-122; ADR 0013; 650cf63 (seen in Pages only) |
| DOC-FR-067 | Captions | Partial | Pictures and diagrams only. No automatic numbering; no list of figures |
| DOC-FR-068 | Table of contents | Partial | tableOfContents.tsx. No page numbers on screen or in print |
| DOC-FR-069 | Footnotes and references | **Absent** | Only import turns notes into an end list (import/docx.ts:189-200) |
| DOC-FR-080 | Comments and replies | Done (in-app) | review/comments.ts; e2e/review.spec.ts:43. File-format carriage is tracked under DOC-FR-100/101 |
| DOC-FR-081 | Resolve comments | Done | CommentsPanel.tsx |
| DOC-FR-082 | Track changes | **Absent** | grep finds nothing. DOCX import accepts tracked changes |
| DOC-FR-083 | Document language | Done | review/language.ts (22 languages) |
| DOC-FR-084 | Citation management | **Absent** | grep finds nothing |
| DOC-FR-085 | Reference tools | **Absent** | Only the TOC exists |
| DOC-FR-100 | DOCX | Partial | Export is broad, with reported approximations. Import (mammoth) is lossy. External checks: Pages 16/16, Word for Mac 2/16; no Word for Windows, no LibreOffice, no OOXML schema validation |
| DOC-FR-101 | ODT | Partial | Own writer and reader round-trip. **Never opened in another application** |
| DOC-FR-102 | PDF | Partial | Export only, through the browser print dialog (DocumentEditor.tsx:226-248). No PDF import |
| DOC-FR-103 | TXT | Partial | Export Done (export/text.ts). **No import** (import/index.ts:17) |
| DOC-FR-104 | .dcosdoc (beyond the brief) | Done | export/dcosdoc.ts; dcosdoc.test.ts. Missing from README (no mention anywhere in README.md). FEATURE_STATUS mentions it only in its v0.2 Phase 6 rows (FEATURE_STATUS.md:15, :189), not in its Import row (:105); the brief's "missing from FEATURE_STATUS" is corrected here |
| DOC-FR-105 | Preserve editable content | Partial | Diagrams round-trip. Shapes, text boxes and some equations degrade; every loss is reported |
| DOC-FR-106 | No unverified Word claims | Done | README.md:24; DOCUMENT_COMPATIBILITY §8–§9 |

Totals for the brief's bullets (plus DOC-FR-104): 52 rows: 28 Done (including the qualified "Done (…)" rows), 20 Partial, 4 Absent, 0 Stub. These counts are this document's own tally of the table above; FEATURE_STATUS.md:28 uses a different row set (27 implemented, 16 partial, 0 broken, 0 missing) and has **no rows** for track changes, citations, footnote authoring or reference tools.

Test inventory: 31 test files in the package. A strict grep (lines that start with `it(`, `test(` or `it.each(…)(`, each `.each` counted once) finds 451 test declarations; the canonical brief's looser count is about 469. Plus integration goldens (`tests/integration/docx-golden`, `docx-format-golden`, `docx-layout-golden`, `kitchen-sink-v2-golden`, `phase6-cross-feature`, `v0.1.0-fixtures`) and 34 `test(` declarations in the seven document specs (document, home-formatting, insert-document, layout-document, phase4-integration-document, review, ribbon-document), 7 more in `files-tabs-templates.spec.ts`, and 26 in `e2e/diagram-embed*.spec.ts` (the brief's "about 37" is a rounded figure for the document specs). Content schema: `DOCUMENT_SCHEMA = 3` (migrate.ts:13). New marks or nodes (footnote, tracked change, citation) mean schema 4, and older builds then open those documents read-only.

### fe3275a verification summary

- **Commit:** fe3275a "Phase 4: Document Studio (formatting, layout, insert, review, files)", 2026-11-13. 232 files, +29,972/−1,370.
- **What it changed:**
  - Removed `ui/Toolbar.tsx` (438 lines) and the single `export/docx.ts` (423 lines).
  - Added the `export/docx/` and `export/odt/` registries, `import/` (docx.ts, odt.ts), `review/` (comments, language, word count, find/replace), `ui/ribbon/` (Home, Insert, Layout, Review), `compat.ts`, `pageLayout.ts` and `sections.ts`.
  - Added apps/web OpenTabs and ImportDocument, 7 e2e specs, 11 mammoth DOCX fixtures, and the docx-format, docx-layout and docx-v2 goldens.
  - Its own commit message said Word and Pages had not been tested.
- **Follow-up 206e080 (2026-11-14):** docs only. 32 files, +177/−15. It added `docs/compatibility/phase4-2026-11-14/`: 16 DOCX files opened in Apple Pages, with 4 layout differences; Word for Mac 16.115 checked 2 of 16, read-only and unlicensed, stopped by its privacy notice at the owner's choice. It updated DOCUMENT_COMPATIBILITY §8, RG-12 (partly closed), ADR 0011 and README.
- **Still true today:**
  - The RELEASE_GAPS §8 and FEATURE_STATUS v0.2 Phase 4 claims were spot-checked against the code and are present: RG-4 (export/print.ts:10, :177); RG-5 (types.ts:128; ui/ribbon/layout/useSection.ts:41, :85); DS-5 (export/printSupport.ts:11); RR-3 (extensions/remoteImages.ts); TD-14 (extensions/previewCache.ts); TD-38 (export/docx/index.ts:118-122); TD-39 caps (import/odt.ts:523-541).
  - Since fe3275a, only 650cf63 (v0.2 Phase 6; 41 package files, +4,499/−210) has changed the package. edc2672 did not touch it.
  - FEATURE_STATUS counts: 27 implemented, 16 partial, 0 broken, 0 missing (FEATURE_STATUS.md:28). FEATURE_STATUS has no rows for track changes, citations, footnote authoring or reference tools. The Advanced brief adds these, and all are Absent.
- **Left open:**
  - RG-12: 14 of 16 DOCX files not checked in Word; no Word for Windows; no LibreOffice; no ODT ever opened elsewhere.
  - TD-53: v0.2 Phase 6 exports opened in Pages only.
  - No on-screen pagination.
  - PDF only through the print dialog; headers, footers and numbers need Chromium 131+.
  - Lossy DOCX import.
  - TD-2: inline images. TD-38: private docx property. TD-39: ODT expansion. TD-40: main-thread imports. TD-41: raw-XML formatting note.
  - APA/MLA template formatting (an owner decision from v0.2 Phase 4).
  - No user-defined styles or templates.
- **Verdict:** fe3275a is a genuine, substantial delivery of v0.2 Phase 4. It is **not** a complete Advanced M01. The four Review/Insert bullets (footnotes, track changes, citation management, reference tools) are Absent and five Layout bullets (orientation, columns, section breaks, headers and footers, page numbers) are Partial.

### Stale statements to avoid (scheduled for correction in AE-P2)

- README.md:5, :35 and FEATURE_STATUS.md:34, :206 call v0.2 Phase 7 uncommitted; edc2672 is on origin/main. (The brief cites FEATURE_STATUS.md:31; that line is only the Presentation Studio count row, and the "uncommitted working tree" wording is at :34 and :206.)
- README.md's Document Studio section and FEATURE_STATUS's Import row do not mention `.dcosdoc` (exists since 650cf63).
- docs/DATABASE.md:43 and ADR 0007 §2 give document schema "up to 2"; the code has 3 (migrate.ts:13).

---

## 1. Product objectives

1. **A dependable word processor for academic work** offline and on every supported platform (PLT-001…008), for students and teachers writing assignments, reports, essays and letters.
2. **Close the four Absent bullets** (DOC-FR-069 footnotes, DOC-FR-082 track changes, DOC-FR-084 citations, DOC-FR-085 reference tools) to a depth the owner sets under D-18, and finish caption numbering and a list of figures (DOC-FR-067).
3. **Make page layout visible and reliable**: decide on on-screen pagination (DOC-FR-004, D-18), then make orientation, columns, section breaks, headers, footers, page numbers and TOC page numbers (DOC-FR-041/042/044/045/046/068) behave the same on screen, in PDF and in DOCX/ODT as far as each format allows.
4. **Prove file compatibility with dated external checks**, not internal round trips: Word (Mac and Windows), LibreOffice and schema validation for DOCX and ODT (DOC-FR-100/101, RG-12, TD-11, TD-53). Never claim more than the evidence shows (DOC-FR-106).
5. **Produce PDF without depending on one browser's print features**, or disclose clearly where it does (DOC-FR-102, D-18).
6. **Keep everything that works today working**: no regression of the 28 Done rows in the status table, the protected read-only view, the never-overwrite rules and the loss reports.
7. **Prepare the document for the rest of the Advanced Edition**: text extraction for global search (SVC-SEARCH), provenance for embedded diagrams (SVC-REF), pictures as attachments (SVC-BLOB, D-08), a reusable rich-text vocabulary for the Notebook (D-10), and a content model that can later carry live co-editing (SVC-COLLAB, D-16).

Out of scope for M01: PDF import and PDF editing (M05 PDF Studio); classroom submission (M06, INT-03); live co-editing (M07, INT-08); file organisation (M08).

## 2. User stories

| ID | As a… | I want… | So that… | Requirements |
|---|---|---|---|---|
| US-DOC-01 | student | to write and format an assignment from a template without learning every tool | I can hand in neat work quickly | DOC-FR-001, 002, 012, 020–028 |
| US-DOC-02 | student | to see real pages as I type | I know how long my essay is and where pages break | DOC-FR-004, 041–046 |
| US-DOC-03 | student | to add footnotes, citations and a bibliography in APA or MLA style | my research paper meets the marking guide | DOC-FR-069, 084, 085 |
| US-DOC-04 | teacher | to suggest edits with track changes and comments, and have the student accept or reject them | feedback is precise and the student keeps control | DOC-FR-080–082 |
| US-DOC-05 | teacher | to open a student's Word file, review it and send it back as Word | I can work with students who use Microsoft Word | DOC-FR-100, 105 |
| US-DOC-06 | student | to export a PDF with headers, footers and page numbers from any supported browser or the desktop app | my PDF looks the same as on screen | DOC-FR-045, 046, 102 |
| US-DOC-07 | student | to number figures and tables automatically and refer to them in the text | my references stay right after I move things | DOC-FR-067, 085 |
| US-DOC-08 | any user | to never lose work, and to restore or compare earlier versions | I can recover from mistakes | DOC-FR-005–007, 011 |
| US-DOC-09 | any user | to know exactly what an import or export changed | I am not surprised by missing content | DOC-FR-105, 106 |
| US-DOC-10 | teacher | to insert and edit diagrams inside a document and update them from the original diagram | diagrams stay consistent across my materials | DOC-FR-066, DOC-IF-006 (INT-01) |
| US-DOC-11 | student on a phone | to read and make small edits | I can work away from a computer | DOC-UX-003 |
| US-DOC-12 | keyboard or screen-reader user | to reach every control without a mouse | I can use the studio fully | DOC-UX-002, DOC-NFR-008 |

## 3. Functional requirements

Each row keeps the canonical ID and status. "Gap" says what AE-P4 must add; "Decision" names the owner decision that bounds it. New requirements use free numbers in the right block and are marked "(new)" or "(beyond the brief)".

### 3.1 Editing (001–019)

| ID | Requirement | Status | Evidence | Gap to close in AE-P4 | Decision |
|---|---|---|---|---|---|
| DOC-FR-001 | Rich-text editing: bold, italic, underline, strike, code, sub/superscript, links, block types | Done | extensions/index.ts:34-74; extensions.test.ts (17); DocumentEditor.test.tsx; e2e/document.spec.ts, home-formatting.spec.ts | Re-verify incl. Firefox (never green on CI, R-001) | — |
| DOC-FR-002 | Simple and Advanced modes | Done | ui/ribbon/registry.ts:18-25; HomeTab.tsx:90,172,192,196,201; Ribbon.test.tsx (17); e2e/phase4-integration-document.spec.ts | Written policy deciding which new controls (footnotes, citations, track changes, styles) appear in Simple mode; mode switch is stored as a content edit today | D-18 |
| DOC-FR-003 | Multiple open documents | Partial | apps/web/src/lib/openTabs.ts:15 (MAX_OPEN_TABS = 12); components/OpenTabs.tsx; OpenTabs.test.tsx (8); e2e/files-tabs-templates.spec.ts | Exists: up to 12 tabs, one editor on screen. Missing: side-by-side view (scope to confirm); fix the known shortcut bug after another window closes the shown tab (FEATURE_STATUS.md:99, found by reading the code) | D-18 |
| DOC-FR-004 | Multi-page layout | Partial | DocumentEditor.tsx:308-320 (one sheet); DOCUMENT_COMPATIBILITY §6, §9; print via export/print.ts, printLayout.ts | Exists: pages in print, DOCX, ODT. Missing: on-screen pages, if D-18 requires them (R-009) | D-18 |
| DOC-FR-005 | Autosave | Done | apps/web/src/lib/storage.ts:689 (600 ms), :690 retries; DocumentEditor.tsx:128-147; e2e/save-problems.spec.ts; ADR 0004 | Measure against PERF-005 | D-29 |
| DOC-FR-006 | Undo and redo | Done | extensions/index.ts:35 (StarterKit UndoRedo); HomeTab.tsx | History is lost on remount (version restore, taking another tab's save); disclose or keep it. Deleting a comment thread is not undoable by design | — |
| DOC-FR-007 | Version history | Done (list/restore) | apps/web/src/components/EditorFrame.tsx:398-472; EditorFrame.test.tsx; ADR 0005 | Read-only preview before restore; compare is a new scope question (shared with FIL-FR-017) | D-18 |
| DOC-FR-008 | Find and replace | Done | extensions/searchReplace.ts:13-138; ui/FindReplaceBar.tsx; review.test.ts; e2e/review.spec.ts:144 | No regex; a match cannot cross blocks. Regex only if the owner adds it | D-18 |
| DOC-FR-009 | Word count | Done | review/wordCount.ts; CharacterCount (extensions/index.ts:47); review.test.ts; e2e/review.spec.ts:144 | Make the dialog and status bar count pictures and diagrams the same way (today they differ) | — |
| DOC-FR-010 | Spellcheck where supported | Done | DocumentEditor.tsx:97,128,173; apps/web/src/lib/preferences.ts; e2e/review.spec.ts:125 | Browser dictionary only; record per-platform behaviour in AE-P14 (webviews) | — |
| DOC-FR-011 (beyond the brief) | Protected read-only view for newer or invalid content; never saved over | Done | safety.ts:48 prepareDocument; DocumentEditor.tsx:52-62; safety.test.ts (14), compat.test.ts (26) | Must cover schema 4 content in schema-3 builds (the live cached build) | — |
| DOC-FR-012 (beyond the brief) | Built-in document templates | Done | templates.ts:45-298 (9 templates, ids at :47-264: blank, assignment, lab report, essay, project report, research paper, MLA essay, cover page, formal letter) | APA/MLA layout (double spacing, hanging indents, running head) waits for D-18; user-saved templates are D-18 | D-18 |

### 3.2 Formatting (020–039)

| ID | Requirement | Status | Evidence | Gap to close in AE-P4 | Decision |
|---|---|---|---|---|---|
| DOC-FR-020 | Font families | Partial | ui/ribbon/HomeTab.tsx:30-38 (default plus Arial, Calibri, Georgia, Times New Roman, Verdana, Courier New), :90 (Advanced only) | Exists: 6 system fonts by name. Missing: bundled open fonts served from the app origin, a fallback rule per platform, free font-name input; DOCX/ODT name fonts without embedding | D-18 |
| DOC-FR-021 | Font sizes | Done | HomeTab.tsx:39 (9–32 pt); ParagraphControls.tsx CustomFontSize (1–400 pt); format.test.tsx; e2e/home-formatting.spec.ts | Re-verify | — |
| DOC-FR-022 | Font colours | Done | ui/ribbon/format/ColorPanel.tsx; export/docx/colors.ts; format.test.tsx; Word match recorded in docs/compatibility/phase4-2026-11-14/README.md | Re-verify | — |
| DOC-FR-023 | Highlighting | Done | extensions/index.ts:40 (Highlight, multicolour); ColorPanel.tsx; DOCX w:highlight nearest of 16 colours (TD-10) | Re-verify | — |
| DOC-FR-024 | Paragraph formatting | Done | extensions/paragraphFormat.ts; ParagraphDialog.tsx; paragraphFormat.test.ts (20); format.test.tsx (10) | Re-verify | — |
| DOC-FR-025 | Line spacing | Done | ui/ribbon/format/ParagraphControls.tsx:19 (1.0/1.15/1.5/2.0 labels), :36 LineSpacingControl; tests/golden/docx-format | Re-verify | — |
| DOC-FR-026 | Indentation | Done | paragraphFormat.ts; HomeTab.tsx:201; Ruler.tsx; docx/format.test.ts (13) | Re-verify | — |
| DOC-FR-027 | Headings and named styles | Done (fixed set) | paragraphStyles.ts:23-33 (looks for Heading 1–4, Title, Subtitle, Caption); style list Normal, Title, Subtitle, Heading 1–4, Quote, Caption, Code (HomeTab.tsx:57; StarterKit headings limited to 1–4 at extensions/index.ts:36); tests/golden/docx-format/word_styles.xml | User-defined and modified styles, Heading 5–6: only if D-18 adds them (schema 4) | D-18 |
| DOC-FR-028 | Bullets and numbering | Done | extensions/listStyles.ts; docx/format.test.ts | ODT: nested lists at one level take the first list's style (reported); fix or keep disclosed | — |
| DOC-FR-029 | Rulers | Partial | ui/ribbon/format/Ruler.tsx:37,243; DocumentEditor.tsx:372; format.test.tsx | Exists: horizontal ruler with margin and indent markers, keyboard operable, Advanced only, hidden at phone width. Missing: tab stops, vertical ruler (scope) | D-18 |
| DOC-FR-030 | Page margins | Done | ui/PageSetupDialog.tsx; types.ts:128 normalizePage; useSection.ts:85; LayoutTab.test.tsx | Re-verify | — |
| DOC-FR-031 (new) | User-defined styles and saved templates | Absent | — | Only if D-18 approves; needs a style store in content (schema 4) and DOCX/ODT style writers | D-18 |

### 3.3 Layout (040–059)

| ID | Requirement | Status | Evidence | Gap to close in AE-P4 | Decision |
|---|---|---|---|---|---|
| DOC-FR-040 | A4, A3, A5, Letter, Legal | Done | types.ts:9, :41-46; layout.test.ts; layout-export.test.ts | Re-verify | — |
| DOC-FR-041 | Portrait and landscape | Partial | ui/ribbon/layout/useSection.ts:41; DOCX w:orient; e2e/layout-document.spec.ts (Chromium print) | Exists: whole-document and per-section orientation in DOCX and Chromium print. Missing: per-section orientation on screen (depends on DOC-FR-004); ODT has one orientation; external checks (Pages shows landscape as portrait) | D-18, D-22 |
| DOC-FR-042 | Columns | Partial | pageLayout.ts:56-121; DOCX w:cols; print column-count; layout-export.test.ts (19) | Exists: 1–3 columns in DOCX and print. Missing: columns on screen; ODT writes only the first section's columns; no external app has shown two columns (sample too short) | D-18, D-22 |
| DOC-FR-043 | Page breaks | Done | extensions/pageBreak.ts:12,28; DOCX w:br; ODT break-after; e2e/insert-document.spec.ts | On screen a dashed marker, not a new sheet (changes with DOC-FR-004) | D-18 |
| DOC-FR-044 | Section breaks | Partial | extensions/sectionBreak.ts:23,102; sections.ts; export/docx/sections.ts; tests/golden/docx-layout | Exists: next-page and continuous breaks in DOCX and print. Missing: on-screen layout; ODT continuous breaks dropped; DOCX import drops section breaks; break inside table/list/quote has no effect | D-18 |
| DOC-FR-045 | Headers and footers | Partial | ui/ribbon/layout/HeaderFooterDialog.tsx; ui/PaperChrome.tsx; export/print.ts:10, :177; export/printSupport.ts:11 | Exists: three-part headers/footers in DOCX, ODT and Chromium 131+ print. Missing: PDF in Safari, Firefox and webviews (DOC-FR-102); per-page display on screen | D-18 |
| DOC-FR-046 | Page numbers | Partial | ui/ribbon/layout/PageNumbersDialog.tsx; DOCX PAGE/NUMPAGES, pgNumType | Exists: formats 1/i/I/a/A, start, per-section restart in DOCX. Missing: real numbers on screen ("#" today); print restarts checked as CSS only; non-Chromium PDF | D-18 |
| DOC-FR-047 | Different first page | Done | pageLayout.ts:73-156; export/docx/sections.ts (w:titlePg); export/odt/styles.ts (header-first) | ODT header-first never checked in LibreOffice; DOCX import drops the setting (reported) | D-22 |

### 3.4 Insert (060–079)

| ID | Requirement | Status | Evidence | Gap to close in AE-P4 | Decision |
|---|---|---|---|---|---|
| DOC-FR-060 | Tables | Done | extensions/index.ts:42 TableKit; ui/ribbon/TableBar.tsx; docx.test.ts; odt.test.ts | No table caption object (see DOC-FR-067) | — |
| DOC-FR-061 | Images | Partial | image.ts (15 MB cap, 1600 px downscale); extensions/figureImage.ts; extensions/remoteImages.ts; insertObjects.test.ts (24), remoteImages.test.ts (8); export/docx/images.ts:9-32 | Exists: insert, align, caption, alt. Missing: pictures as attachments (TD-2, D-08, schema 4); text wrapping and free positioning (scope); DOCX accepts only PNG, JPEG, GIF and BMP data URLs, so other formats (for example SVG, WebP) become a reported placeholder (export/docx/images.ts:10, :30-32) | D-08, D-18 |
| DOC-FR-062 | Shapes | Partial | extensions/shapeModel.ts:4 (6 kinds); extensions/shape.tsx; insertExport.test.ts (17) | Exists: block-level shapes. Missing: native DrawingML shapes in DOCX (picture today), ODT shapes (text today), rotation and positioning (scope) | D-18 |
| DOC-FR-063 | Text boxes | Partial | extensions/textBox.ts; insertExport.test.ts; e2e/insert-document.spec.ts | Exists: inline or floated boxes. Missing: native DOCX text box (one-cell table today), ODT box, DOCX import (becomes paragraphs) | D-18 |
| DOC-FR-064 | Equations | Partial | extensions/equation.ts:13 (KaTeX, trust off); ui/insert/EquationDialog.tsx; export/docx/insert.ts:38, :65 (docx's `latexToMath`) | Exists: LaTeX equations; native Word maths for the latexToMath subset. Missing: wider OMML coverage, ODT MathML, equation import from DOCX/ODT | D-18 |
| DOC-FR-065 | Hyperlinks | Done | links.ts:24-36; links.test.ts (5) | Re-verify; in-document anchors used by DOC-FR-085 | — |
| DOC-FR-066 | Diagrams | Done | extensions/diagramEmbed.tsx:109-122; ui/DiagramRibbon.tsx; diagramNode.test.tsx (27), diagram-roundtrip.test.ts (17); e2e/diagram-embed*.spec.ts; ADR 0013; 650cf63 | Exported diagrams seen in Pages only (TD-53). Add provenance and "update from source" (SVC-REF, INT-01) | D-22 |
| DOC-FR-067 | Captions | Partial | extensions/figureImage.ts:8-55; extensions/diagramEmbed.tsx:112,122; paragraphStyles.ts:33 | Exists: captions on pictures and diagrams; Caption style. Missing: automatic Figure/Table numbering, table captions, captions on equations/shapes/text boxes, list of figures and tables, DOCX SEQ fields | D-18 |
| DOC-FR-068 | Table of contents | Partial | extensions/tableOfContents.tsx; DOCX TOC field (docx.test.ts) | Exists: live TOC from Heading 1–4; DOCX/ODT fields. Missing: page numbers on screen and in print/PDF (depends on DOC-FR-004 and DOC-FR-102) | D-18 |
| DOC-FR-069 | Footnotes and references where supported | **Absent** | Only import turns notes into an end list (import/docx.ts:189-200; import/odt.ts:270-273) | Footnote and endnote nodes, numbering, placement on screen and in print, DOCX `footnotes.xml`/`endnotes.xml`, ODT `text:note`, import as real notes (custom OOXML reader, R-010). Schema 4 | D-18 |

### 3.5 Review (080–099)

| ID | Requirement | Status | Evidence | Gap to close in AE-P4 | Decision |
|---|---|---|---|---|---|
| DOC-FR-080 | Comments and replies | Done (in-app) | review/comments.ts:21-60; review/commentMark.ts; review/CommentsPanel.tsx; review/docx.ts; review.test.ts (29), Review.test.tsx (11); e2e/review.spec.ts:43 | File formats: ODT export omits comments; DOCX and ODT import drop them; comment text never checked in Word. Authors are free text (identity comes with SVC-ID in M07) | D-22 |
| DOC-FR-081 | Resolve comments | Done | review/comments.ts:21; CommentsPanel.tsx; e2e/review.spec.ts:43 | DOCX writes a resolved thread as open when the document has no replies (reported; review/docx.ts:119-122); no external app confirmed resolved state | D-22 |
| DOC-FR-082 | Track changes where supported | **Absent** | grep finds nothing; DOCX import accepts tracked changes (DOCUMENT_COMPATIBILITY §5.1) | Suggestion mode recording insertions, deletions and formatting changes with author and time; accept/reject one or all; DOCX `w:ins`/`w:del` export and import (custom OOXML reader); ODT `text:tracked-changes` (scope). Schema 4 | D-18 |
| DOC-FR-083 | Document language | Done | review/language.ts:7-33 (22 languages); DOCX w:lang; ODT fo:language; e2e/review.spec.ts:125 | Re-verify | — |
| DOC-FR-084 | Citation management | **Absent** | grep finds nothing; templates contain hand-written reference lists | A per-document source list, in-text citations, bibliography generation in the styles D-18 names (at least APA and MLA proposed), DOCX output as fields or plain text (to decide), no network lookups by default (privacy). Schema 4 | D-18 |
| DOC-FR-085 | Reference tools | **Absent** | Only the TOC exists (extensions/tableOfContents.tsx) | Cross-references to headings, figures, tables, equations and notes that update; bookmarks; list of figures (with DOC-FR-067); index (scope). DOCX REF/PAGEREF fields | D-18 |
| DOC-FR-086 (new) | Comments carried in ODT and imported from DOCX/ODT | Absent | ODT export omits comments; mammoth does not read comments | Needed for US-DOC-05; requires the custom OOXML reader shared with DOC-FR-082 | D-18 |

### 3.6 File compatibility (100–119)

| ID | Requirement | Status | Evidence | Gap to close in AE-P4 | Decision |
|---|---|---|---|---|---|
| DOC-FR-100 | DOCX | Partial | export/docx/ (index.ts, sections.ts, insert.ts); import/docx.ts (mammoth); tests/integration/docx-golden, docx-format-golden, docx-layout-golden, kitchen-sink-v2-golden; import/word-files.test.ts (7 tests over the 11 Word-made fixtures in tests/fixtures/docx-import); docs/compatibility/phase4-2026-11-14/README.md (Pages 16/16, Word for Mac 16.115 2/16) | All 16 samples (and new schema 4 features) checked in Word for Mac and Word for Windows; LibreOffice check; OOXML schema validation in tests (TD-11); import fidelity for fonts, sizes, colours, spacing, lists, sections, comments, notes, tracked changes, equations; import in a worker (TD-40); TD-38 private property | D-22 |
| DOC-FR-101 | ODT | Partial | export/odt/ (own writer, fflate); import/odt.ts; export/odt.test.ts (20); tests/golden/odt-v2 | Opened in LibreOffice (first ever external check); ODF schema validation; comments, sections, equations, shapes, text boxes; total repeat-count cap (TD-39) | D-22 |
| DOC-FR-102 | PDF | Partial | export/print.ts, printLayout.ts, printSupport.ts:11; DocumentEditor.tsx:226-248; e2e/layout-document.spec.ts | Exists: print dialog "Save as PDF", selectable text, Chromium 131+ for headers/footers/numbers. Missing: a generated PDF file or an equivalent native print path on Safari, Firefox, Tauri and Android WebView (`window.print` is reported not to work in Android WebView; Unverified until AE-P14, because no native shell has been built); completion feedback. No PDF import (M05) | D-18 |
| DOC-FR-103 | TXT | Partial | export/text.ts; docx.test.ts "text export never drops content silently"; import/index.ts:17 (no .txt) | TXT import (encoding detection, paragraphs from blank lines) if D-18 approves | D-18 |
| DOC-FR-104 (beyond the brief) | `.dcosdoc` native file | Done | export/dcosdoc.ts; import/dcosdoc.ts; DocumentEditor.tsx:287-300; dcosdoc.test.ts (6); apps/web ImportDocument.diagrams.test.tsx | Document it in README/FEATURE_STATUS (AE-P2); carry attachments once D-08 lands | — |
| DOC-FR-105 | Preserve editable content during import/export | Partial | export/report.ts:17,112; import/common.ts IMPORT_NOTES; DOCUMENT_COMPATIBILITY §3–§5, §9 | Diagrams round-trip; shapes, text boxes, some equations degrade; DOCX import loses most formatting. Every loss stays reported; the loss list must shrink per D-18 scope | D-18 |
| DOC-FR-106 | Do not claim complete Word compatibility without verification | Done | README.md:24; DOCUMENT_COMPATIBILITY §8–§9; ADR 0011 | Every compatibility statement in docs and UI cites a dated external check | — |
| DOC-FR-107 (new) | Imports bounded and off the main thread | Partial | DOCX/ODT unpack guard 512 MB (import/common.ts:61); ODT caps of 64 and 50 (import/odt.ts:523-541); dialog caps 50 MB / 100 MB (apps/web/src/components/ImportDocument.tsx:13,15) | Run DOCX, ODT and `.dcosdoc` parsing in a Web Worker (TD-40); total ODT repeat cap (TD-39) | — |

## 4. Non-functional requirements

Performance numbers are **proposed targets, to be measured** on the reference hardware agreed under D-29. Nothing has been measured for documents today.

| ID | Requirement | Target / rule | Today | Links |
|---|---|---|---|---|
| DOC-NFR-001 | Open speed | 50-page document with 20 images editable in ≤ 1.5 s (proposed) | Not measured | PERF-003 |
| DOC-NFR-002 | Typing latency | ≤ 50 ms p95 keystroke latency on a 200-page document (proposed); must hold with on-screen pagination if adopted | Not measured; no large-document fixture | PERF-004, R-009 |
| DOC-NFR-003 | Autosave latency | Last edit to durable write ≤ 600 ms + 250 ms p95 (proposed) | Constants only (storage.ts:689-690) | PERF-005 |
| DOC-NFR-004 | Import responsiveness | 10 MB DOCX in ≤ 5 s with the UI responsive (worker) (proposed) | Imports on main thread (TD-40) | PERF-009 |
| DOC-NFR-005 | Memory | Within the PERF-008 budget with a document, a diagram and a presentation open | Not measured; inline images inflate content (TD-2) | PERF-008 |
| DOC-NFR-006 | Data safety | No silent overwrite; content newer than the build opens read-only; schema bumps follow ADR 0011 (lowest schema the content needs) | Done for schema 1–3 (safety.ts, compat.ts) | SYS, R-003 |
| DOC-NFR-007 | Offline and privacy | Editing, autosave, export and import make no network request; the only exception (fetching pasted web pictures, extensions/remoteImages.ts) stays explicit and user-triggered; fonts and citation styles ship with the app (R-030) | Partial: e2e/privacy.spec.ts:19-36 covers creating, typing, autosave, embedding a diagram and DOCX and TXT export; not ODT, `.dcosdoc` or print export, and no import | SEC, ADR 0002 |
| DOC-NFR-008 | Accessibility | WCAG 2.2 AA (proposed, A11Y-001): every ribbon control reachable by keyboard with a visible focus and an accessible name; editor content exposes headings, lists, tables and notes to assistive technology | Keyboard tests exist (Ribbon.test.tsx); no axe; no screen-reader run | A11Y-001, D-25 |
| DOC-NFR-009 | Honest export | Every approximation or loss is listed in the export/import report; nothing is dropped silently | Done (export/report.ts, import/common.ts) | DOC-FR-105 |
| DOC-NFR-010 | Platform support | Works on PLT-001…008 per the approved matrix; per-platform limits (print, downloads) are shown to the user | Chromium, WebKit, mobile Chromium tested; Firefox never green (R-001); webviews never built | PLT, D-30 |
| DOC-NFR-011 | Security of imports | Size and expansion caps on every format; parsed XML/HTML stays in inert documents; KaTeX trust off | Partial (see DOC-FR-107; import/docx.ts:503) | SEC, R-025 |
| DOC-NFR-012 | Maintainability | No new file over 500 lines without a recorded reason; package boundaries kept (tests/integration/boundaries.test.ts) | DocumentEditor.tsx 489, import/odt.ts 831 lines | brief §8 |

## 5. UI/UX requirements

| ID | Requirement | Today |
|---|---|---|
| DOC-UX-001 | The ribbon (Home, Insert, Layout, Review, Diagram) uses SVC-UI tokens and components; new controls follow the same patterns (menus, dialogs, toasts) | Ribbon exists (ui/ribbon/); design system Partial (14 colour tokens only) |
| DOC-UX-002 | Every control has a keyboard path and an accessible name; shortcuts listed in Settings → Shortcuts | Partial: shortcuts list is reference only (apps/web/src/pages/settings/SettingsPages.tsx:305-410) |
| DOC-UX-003 | At phone width the editor stays usable for reading and small edits; ruler hidden; ribbon scrolls; no sideways page scroll | Partial: the mobile-chromium project runs every spec whose name contains `document` (playwright.config.ts:26); comments panel at phone width in e2e/review.spec.ts:173 |
| DOC-UX-004 | Simple mode shows a curated core; Advanced shows all. Each new feature is assigned to a mode by the policy under DOC-FR-002 | Done for existing controls (ui/ribbon/registry.ts:18-25; Ribbon.test.tsx) |
| DOC-UX-005 | Save state is always visible (saved, saving, problem with reason) | Done (EditorFrame status, ADR 0004; e2e/save-problems.spec.ts) |
| DOC-UX-006 | Import and export reports use one consistent toast/dialog format listing each loss | Done (export/report.ts; IMPORT_NOTES) |
| DOC-UX-007 | Track changes, comments, footnotes and citations have a review pane or panel consistent with CommentsPanel; changes are colour-coded with a non-colour cue (underline/strike) | Absent |
| DOC-UX-008 | Page view (if D-18 adopts pagination) shows separate sheets with real headers, footers, numbers and columns; a "continuous" view remains available for long editing | Absent |
| DOC-UX-009 | Dark theme: the page stays white (print-like) while the chrome follows the theme; contrast defects fixed via SVC-UI (dark danger 2.77:1) | Partial: paper is always white (contentCss.ts:7; DocumentEditor.tsx:476); dark danger contrast not fixed; no recorded dark-theme review |
| DOC-UX-010 | Limits that depend on the platform (PDF headers need Chromium 131+, download in webviews) are stated next to the control, not only in docs | Partial: the PDF export menu item and a toast say so (toast at DocumentEditor.tsx:227; menu description at :246) |

## 6. Data model

### 6.1 Today (schema 3)

- **Item:** a `WorkspaceItem` of kind `'document'` (packages/local-storage/src/types.ts:5-29) in the `documents` store, versions in `document_versions` (IndexedDB `SCHEMA_VERSION = 3`, indexeddb.ts:46). Item metadata has no folder, tags, owner user or `lastOpenedAt`.
- **Content:** `DocumentContent` (types.ts:27-38): `schemaVersion`, `doc` (Tiptap/ProseMirror JSON), `page: PageSettings` (size, orientation, margins in mm, header, footer, pageNumbers, plus `PageLayoutFields` from pageLayout.ts: columns, number format, header/footer parts, first page), `mode: 'simple' | 'advanced'`, optional `comments: CommentThread[]`, optional `language` (BCP 47).
- **Schema rule:** each document is stored under the lowest schema its content needs (`schemaFor`, migrate.ts:30-41): 1 = v0.1.0 vocabulary (`V010_VOCABULARY`, compat.ts:12), 2 = v0.2 Phase 4/5 vocabulary (`V020_VOCABULARY`, compat.ts:68), 3 = v0.2 Phase 6 additions (diagram embed attributes). Upgraders are number changes only (migrate.ts:18-23).
- **Binary data:** diagram previews live in the attachments store (SVC-BLOB, ADR 0008) by `svgPreviewId`/preview id; pictures are still data URLs inside `doc` (TD-2). Version compaction moves data URLs longer than 16,384 characters to attachments as `dcos-blob:<id>` inside version records only (packages/local-storage/src/blobs.ts:4-12).
- **Files:** `.dcosdoc` (export/dcosdoc.ts; 100 MB cap; refuses newer files).

### 6.2 Proposed for AE-P4 (DOCUMENT_SCHEMA 4; all **Proposed, needs approval**)

All additions are optional fields or new node/mark types registered in a new frozen vocabulary `V030_VOCABULARY` in compat.ts, so documents that do not use them stay at schema 1–3 and remain editable in older builds.

| Addition | Shape (proposed) | For |
|---|---|---|
| Footnote / endnote node | inline atom `footnote { id, kind: 'foot' \| 'end' }` with block content | DOC-FR-069 |
| Tracked change marks | `insertion { id, author, authorId?, at }`, `deletion { … }`; formatting changes as `formatChange { id, before }` (scope) | DOC-FR-082 |
| Track changes switch | `trackChanges?: boolean` top-level | DOC-FR-082 |
| Sources and citations | top-level `sources?: Source[]` (CSL-JSON-like fields: id, type, authors, title, year, container, publisher, URL, DOI); inline `citation { sourceIds, locator?, prefix?, suffix? }`; block `bibliography { style }`; top-level `citationStyle?` | DOC-FR-084 |
| Cross-references and bookmarks | inline `crossRef { targetId, show: 'number' \| 'text' \| 'page' }`; `bookmark` anchors via stable block ids | DOC-FR-085 |
| Caption numbering | caption attrs `{ label: 'Figure' \| 'Table' \| 'Equation', numbered: boolean }`; block `listOfFigures { label }` | DOC-FR-067 |
| User styles | top-level `styles?: NamedStyle[]` (scope D-18) | DOC-FR-031 |
| Pictures as attachments | image attr `attachmentId` replacing `src` data URL (D-08); a non-additive change that needs a content migration and a safety copy (R-004) | DOC-FR-061, TD-2 |
| Diagram provenance | embed attr `sourceRef?: ItemRef` (SVC-REF, ADR-0018) | DOC-FR-066, INT-01 |
| Comment author identity | `authorId?` beside free-text author, filled once SVC-ID exists | DOC-FR-080, M07 |

Rules: stable block ids are needed by cross-references, comments, tracked changes and future co-editing; generate them with full UUIDs (not short ids). Backups stay format 2 until format 3 (ADR-0017) and must carry schema 4 documents; `MAX_CONTENT_SCHEMA_BY_KIND.document` (packages/local-storage/src/backup.ts:14) rises to 4 in the same change.

## 7. Technical architecture

### 7.1 Today

- **Package:** `@dcos/document-studio` 0.1.0: 23,866 TS/TSX lines in `src/`, of which 16,181 are non-test (wc -l). Main parts: `DocumentEditor.tsx` (editor shell, export menu), `extensions/` (Tiptap extension set; extensions/index.ts:25 says extensions may only be added), `ui/ribbon/` (registry-driven tabs), `review/`, `export/docx/` and `export/odt/` (format registries), `export/print.ts` (print HTML), `export/text.ts`, `export/dcosdoc.ts`, `import/` (mammoth-based DOCX, own ODT reader, `.dcosdoc`), `compat.ts` / `migrate.ts` / `safety.ts` (schema and protected view).
- **App wiring:** apps/web/src/modules.tsx registers the kind; `EditorPage`/`EditorFrame` provide autosave, conflicts, versions and trash (SVC-STORE, ADR 0003–0005); `useDiagramHost` supplies the `DiagramHost` (SVC-HOST, ADR 0013); `ImportDocument.tsx` handles file import into a new item.
- **Boundaries:** document-studio imports only `@dcos/ui` among workspace packages and never imports diagram-studio (tests/integration/boundaries.test.ts); diagrams arrive through the host.

### 7.2 Proposed changes (each **Proposed, needs approval**)

| Area | Proposal | Notes |
|---|---|---|
| On-screen pagination (if D-18) | A page-layout view that measures rendered blocks and places them on page sheets, computing page boundaries, headers/footers, numbers, columns and per-section orientation; the ProseMirror document stays one flow. Spike first (R-009) | No library chosen; candidates only after the spike. Must keep DOC-NFR-002 |
| Generated PDF (if D-18) | Either a print path through SVC-PLAT on each platform (Tauri print, Android print) with feature detection, or a generated PDF from the pagination layout using the PDF engine chosen in ADR-0023 / the installed jsPDF + svg2pdf.js | Fonts must be embedded for non-WinAnsi text (compare TD-45, TD-57) |
| Custom OOXML reader | A reader for `document.xml`, `comments.xml`, `footnotes.xml`, `endnotes.xml` and `w:ins`/`w:del`, either beside mammoth or replacing it for those parts | mammoth reads neither comments nor tracked changes (R-010) |
| Workers | Run DOCX/ODT/`.dcosdoc` parsing in a Web Worker (TD-40); keep DOMParser use where workers lack it via a worker-safe XML parser (candidate, to verify) | CSP must allow worker sources (D-23) |
| Rich-text sharing | Extract the extension set into `@dcos/rich-text` without behaviour change, or export it from document-studio (D-10, ADR-0025) | Boundary test must allow it (R-022) |
| Search extractor | `documentText(content)` exported for SVC-SEARCH (exists in part as `documentToText`, export/text.ts) | INT-09 |
| Provenance | SVC-REF `sourceRef` on embeds; "update from source" action through DiagramHost | INT-01 |
| Co-editing readiness | Keep content as schema-versioned JSON; stable block ids; no editor state that cannot be rebuilt from content | ADR-0021/0022, D-16 |

## 8. Dependencies

### 8.1 Modules and shared services

| Depends on | Why | State |
|---|---|---|
| M02 Diagram Studio via SVC-HOST (DiagramHost) | Diagram embeds, previews, `.drawio` from embeds | Done (INT-01, ADR 0013) |
| SVC-ITEM, SVC-STORE, SVC-BACKUP | Item, autosave, versions, trash, backup | Done (IndexedDB) |
| SVC-BLOB | Diagram previews; pictures after D-08 | Done; pictures Absent |
| SVC-REF | Diagram provenance; links to other items | Absent (ADR-0018, AE-P3) |
| SVC-IO | Import/export registries and loss reports | Partial (per studio) |
| SVC-SEARCH | Full-text document search | Absent (AE-P7 first indexer, AE-P12 global) |
| SVC-PLAT | Save dialog, print, share on native shells (TD-28) | Partial |
| SVC-UI | Ribbon, dialogs, tokens | Partial |
| SVC-ID / SVC-COLLAB | Comment authors, live co-editing (M07) | Absent |
| M05 PDF Studio engine | Possible generated PDF (ADR-0023) | Absent |

Consumers of M01: M04 Notebook (rich-text vocabulary, print/DOCX export; INT-07), M06 Classroom (documents attached and submitted; INT-03), M07 Collaboration (INT-08), M08 File Manager and M09 Dashboard (lists, previews, search; INT-05, INT-06, INT-09).

### 8.2 Libraries

Installed (from package-lock.json; ranges in packages/document-studio/package.json): `@tiptap/*` 3.33.1 (`@tiptap/extension-mathematics` exact 3.33.1), `docx` 9.15.3, `mammoth` 1.13.0, `katex` 0.18.11, `fflate` 0.8.3. All are in the passing licence gate (docs/THIRD_PARTY_NOTICES.md; 142 production packages, none needing review).

Candidates (none installed; every one needs licence, maintenance, security and compatibility review in [DEPENDENCY_AND_LICENCE_PLAN](DEPENDENCY_AND_LICENCE_PLAN.md); licences are as reported, **licence to verify**):

| Need | Candidate(s) | Note |
|---|---|---|
| Citation formatting | Original formatters for the approved styles (recommended in docs/audit/RELEASE-0.2-AUDIT.md:161), optionally with `@citation-js/core` for parsing (recorded as MIT in FINDINGS.md:988, licence to verify) | citation-js's CSL formatter plugin depends on `citeproc`, recorded as "CPAL-1.0 OR AGPL-1.0" (FINDINGS.md:984-988, DOCU-14, `npm view` at the v0.2 audit), which is outside policy (licence to verify). CSL style and locale files: licence to verify (no source recorded in the repository); only bundle what is approved. See DEPENDENCY_AND_LICENCE_PLAN.md:211 |
| Bundled open fonts | Fonts under OFL (e.g. metric-compatible families; names and licences to verify) served from the app origin | No third-party CDN (R-030); D-18 |
| Pagination | Original code first (spike); any paging library only as a candidate after the spike, licence to verify | R-009 |
| Generated PDF | Installed jsPDF 4.2.1 + svg2pdf.js 2.8.1, or the ADR-0023 engine | D-18 |
| Worker-safe XML parsing | A small XML parser for workers (candidate to name in the dependency plan, licence to verify) | TD-40 |
| Schema validation (tests only) | ECMA-376 and ODF schemas with xmllint (xmllint was used for PPTX parts in v0.2 Phase 7) | TD-11; schema files' terms to verify |
| Live co-editing (later) | Yjs, `@tiptap/extension-collaboration`, `y-prosemirror` (reported MIT, licence to verify; confirm not Tiptap Pro and Tiptap 3.33 support) | ADR-0022, R-029, D-16 |

## 9. API/interface contracts

Shared services are referenced, never re-defined: SVC-REF (`ItemRef`), SVC-BLOB (attachments), SVC-PERM (permission checks) and SVC-IO (reports) are owned by [SYSTEM_ARCHITECTURE](SYSTEM_ARCHITECTURE.md) and [MODULE_DEPENDENCY_MAP](MODULE_DEPENDENCY_MAP.md).

**DOC-IF-001 Editor component (exists, DocumentEditor.tsx:32-46).**

```ts
interface DocumentEditorProps {
  initialContent: unknown;            // read once on mount; remount with a new key to reload
  title: string;
  onChange: (content: DocumentContent) => void;
  diagramHost?: DiagramHost;          // SVC-HOST; enables the Diagram tab
  authorName?: string;                // comment author (free text today)
  spellcheck?: boolean;
  onSpellcheckChange?: (on: boolean) => void;
}
```

Proposed additions (AE-P4): `imageHost?: ImageHost` (SVC-BLOB pictures, D-08), `identity?: { userId: string; name: string }` (SVC-ID, once it exists), `onNavigateRef?: (ref: ItemRef) => void` (SVC-REF).

**DOC-IF-002 DiagramHost (exists, extensions/diagramEmbed.tsx:61-86; SVC-HOST, ADR 0013).** `templates`, `edit(current, start?)`, `pickFromLibrary()`, `importFile()`, `loadPreview(previewId)`, `toDrawio(source, title)`, optional `renderPreview(source, title?)`, optional `storePreview(image)`. It is structurally equal to Presentation Studio's `PresentationDiagramHost` (tests/integration/presentation-hosts.test.ts). Proposed: optional `resolveSource?(ref: ItemRef): Promise<EmbeddedDiagram | null>` for "update from source".

**DOC-IF-003 Content and schema (exists).** `DOCUMENT_SCHEMA`, `schemaFor`, `contentSchemaFor`, `migrateDocument` (migrate.ts), `prepareDocument`, `validateDoc` (safety.ts), `V010_VOCABULARY`, `V020_VOCABULARY` (compat.ts). Contract: `prepareDocument(raw)` returns `editable` only when the content is valid and not newer than the build; otherwise a protected display that is never saved.

**DOC-IF-004 Import/export (exists; part of SVC-IO).** `importDocumentFile`, `importDocx`, `importOdt`, `importDcosdoc` returning `ImportResult` with an `ImportReport`; `buildDocx`/`exportDocx`, `buildOdt`/`exportOdt`, `documentToText`, `exportDcosdoc`, `printDocument`; `ExportReport`/`exportToast` (export/report.ts). Proposed shape for the shared registry (SVC-IO):

```ts
interface FormatHandler<C> {
  id: 'docx' | 'odt' | 'pdf' | 'txt' | 'dcosdoc';
  canImport: boolean; canExport: boolean;
  maxImportBytes: number;                     // DOC-FR-107
  import?(file: Blob, signal?: AbortSignal): Promise<{ content: C; report: LossReport }>; // runs in a worker
  export?(content: C, ctx: ExportContext): Promise<{ blob: Blob; report: LossReport }>;
}
```

`LossReport` is the SVC-IO type; this module adds entries, it does not define its own report type.

**DOC-IF-005 Text extraction for search (proposed; SVC-SEARCH).** `extractDocumentText(content: DocumentContent): { title?: string; body: string; headings: string[] }`, pure and worker-safe, built on `documentToText`. The app registers it with SVC-SEARCH by wrapping it as one DSH-IF-001 `TextExtractor` (MODULE_09 §9.1), mapping its parts to `ExtractedField` entries with a `locator`; there is no module-specific search interface. Includes footnotes, captions and comments (D-17 decides whether comments are indexed).

**DOC-IF-006 Diagram provenance (proposed; SVC-REF, INT-01).** Diagram embed attribute `sourceRef?: ItemRef` with `mode: 'embed-copy'`; a dangling reference shows a "source missing" state and never removes the embed.

**DOC-IF-007 Rich-text vocabulary for Notebook (proposed; D-10, INT-07).** `richTextExtensions(options): Extension[]` and the frozen vocabulary exported from `@dcos/rich-text` (or document-studio). Contract: no behaviour change for documents; the notebook adds no new marks (ADR-0025).

**DOC-IF-008 Picture storage (proposed; SVC-BLOB, D-08).** `ImageHost { put(blob: Blob): Promise<{ attachmentId: string }>; get(id: string): Promise<Blob | undefined> }`, mirroring the presentation image host (apps/web/src/lib/presentationHosts.ts:8).

**DOC-IF-009 PDF output (proposed; SVC-PLAT).** `exportPdf(content, options): Promise<{ blob?: Blob; printed?: boolean; report: LossReport }>`; the platform adapter decides between a generated file and a native print path, and the report states which features (headers, numbers) were kept.

## 10. Acceptance criteria

This table is the canonical wording of the module's criteria; [ACCEPTANCE_CRITERIA.md](ACCEPTANCE_CRITERIA.md) §4 only summarises them and owns the cross-cutting criteria (AC-SYS, AC-SEC, AC-PERF, AC-INT and others) (ACCEPTANCE_CRITERIA §1.2). A change to a criterion here is made in ACCEPTANCE_CRITERIA §4 in the same edit. Evidence types: unit, integration, e2e (browsers named), external application check (dated), measurement, manual. "Browsers" means the PLT-001…003 web projects (Chromium, Firefox, WebKit) unless stated. All criteria belong to **AE-P4** unless stated. Criteria for scope that D-18 removes are waived by that decision and listed in the known limitations.

### 10.1 Functional

| AC | Criterion | Evidence | Re-verify |
|---|---|---|---|
| AC-DOC-001 | Every inline mark and block type in the extension set can be applied, removed, saved, reloaded and round-tripped through DOCX and ODT without change | unit + e2e (browsers) | yes |
| AC-DOC-002a | Simple mode shows only the documented core controls; Advanced shows all; switching mode changes nothing in content except `mode` | unit + e2e (browsers) | yes |
| AC-DOC-002b | A written Simple/Advanced policy assigns every new AE-P4 control to a mode, and the ribbon matches it | unit (registry snapshot) + manual review | — |
| AC-DOC-003 | With 12 documents open as tabs, editing each and switching by mouse and Ctrl+Alt+arrows saves all 12 edits; tab shortcuts keep working after another window closes the shown tab | e2e (browsers) | yes (partial) |
| AC-DOC-004a | (if D-18 adopts on-screen pagination) Page view shows separate sheets; for the reference corpus the page count on screen equals the print/PDF page count | e2e (browsers) + measurement | — |
| AC-DOC-004b | For the 16 reference samples, print/PDF and DOCX page counts are recorded against Word and LibreOffice, with differences listed | external application check (dated) | — |
| AC-DOC-005 | After an edit, content is durable within the PERF-005 target; a crash before that restores the draft | e2e (Chromium) + measurement | yes |
| AC-DOC-006 | Each ribbon command is undone and redone as one step, including table, diagram, footnote, citation and tracked-change commands | unit | yes |
| AC-DOC-007a | Versions can be listed and restored; a restore keeps a pre-restore copy | unit + e2e | yes |
| AC-DOC-007b | A version can be previewed read-only before restoring | e2e (browsers) | — |
| AC-DOC-008 | Find and replace supports case and whole-word options; replace-all is one undo step; matches inside tables, captions and footnotes are found | unit + e2e | yes |
| AC-DOC-009 | Word, character and paragraph counts match fixture texts; dialog and status bar agree on pictures and diagrams | unit | yes |
| AC-DOC-010 | The spellcheck toggle is remembered; the editor's `lang` follows the document language | e2e (browsers) | yes |
| AC-DOC-011 | A schema-4 document opened in a schema-3 build (and a newer-than-build document in any build) opens read-only, offers a download of the original, and is never written | integration + upgrade test (Chromium) | yes |
| AC-DOC-012 | Every built-in template opens editable at the lowest schema it needs; APA/MLA formatting follows D-18 | unit | yes |
| AC-DOC-020 | Every offered font renders on each supported platform (bundled or a declared fallback) and is named in DOCX and ODT; bundled fonts load from the app origin and offline | e2e (browsers) + privacy e2e | — |
| AC-DOC-021 | Preset and custom sizes (1–400 pt) survive save, DOCX and ODT | unit + e2e | yes |
| AC-DOC-022 | Text colours from presets, picker and hex survive save and DOCX/ODT, and show correctly in Word and LibreOffice | unit + external application check (dated) | yes |
| AC-DOC-023 | Highlights survive save; DOCX maps to Word's 16 colours and the report says so | unit + external application check (dated) | yes |
| AC-DOC-024 | Spacing before/after, alignment and indents survive save, DOCX and ODT | unit (goldens) | yes |
| AC-DOC-025 | Line spacing presets and custom values survive save, DOCX and ODT and match in Word and LibreOffice | unit + external application check (dated) | yes |
| AC-DOC-026 | Indents set by dialog, ruler and keyboard survive save and export | unit + e2e | yes |
| AC-DOC-027 | Each named style is written as a real style in DOCX/ODT and recognised by name in Word and LibreOffice | unit + external application check (dated) | yes |
| AC-DOC-028 | Every bullet and number format, start number and nesting level survives DOCX/ODT and shows as exported in Word and LibreOffice | unit + external application check (dated) | yes |
| AC-DOC-029 | Ruler margin and indent markers work by mouse and keyboard; tab stops if in scope (D-18) | unit + e2e | yes (partial) |
| AC-DOC-030 | Margins that leave less than 20 mm of text width or height (types.ts:70, :102) are refused with a reason in every section | unit | yes |
| AC-DOC-031 | (if D-18) A user style can be created, applied, modified and is written to DOCX/ODT | unit + e2e | — |
| AC-DOC-040 | Each paper size is correct in print/PDF, DOCX and ODT dimensions | unit + e2e (Chromium PDF) | yes |
| AC-DOC-041 | Per-section orientation shows on screen (if pagination), in PDF on every supported platform and in DOCX; ODT limit disclosed | e2e + external application check (dated) | — |
| AC-DOC-042 | Two- and three-column sections show on screen (if pagination), in PDF and in Word/LibreOffice with a long sample | e2e + external application check (dated) | — |
| AC-DOC-043 | A page break starts a new page on screen (if pagination), in PDF, DOCX and ODT | e2e | yes |
| AC-DOC-044 | Next-page and continuous section breaks behave the same in PDF, DOCX and (where supported) ODT; DOCX import keeps them | unit + e2e + external application check (dated) | — |
| AC-DOC-045 | Three-part headers and footers appear on every page of the PDF on every supported platform, or the limit is shown before export | e2e (browsers) + manual (native) | — |
| AC-DOC-046 | Page numbers in every format, start value and restart appear correctly on screen (if pagination), in PDF and in Word/LibreOffice | e2e + external application check (dated) | — |
| AC-DOC-047 | A different first-page header/footer shows in PDF, Word and LibreOffice | e2e + external application check (dated) | yes |
| AC-DOC-060 | Tables with merged cells, widths and header rows survive save, DOCX and ODT and show in Word/LibreOffice | unit + external application check (dated) | yes |
| AC-DOC-061a | (D-08) Pictures are stored as attachments; existing documents migrate behind a safety copy with no visible change | integration + upgrade test | — |
| AC-DOC-061b | Pictures up to the cap insert, resize, align, caption and export; refused files say why | unit + e2e | yes (partial) |
| AC-DOC-062 | Shapes export as the documented form (native or picture) with the report saying which | unit + external application check (dated) | — |
| AC-DOC-063 | Text boxes export as the documented form and DOCX import keeps their text | unit | — |
| AC-DOC-064 | Equations in the supported LaTeX subset become native Word maths; others become pictures with a report entry; ODT form per D-18 | unit + external application check (dated) | — |
| AC-DOC-065 | Only http, https, mailto and in-document links are accepted; refused links are written as text | unit | yes |
| AC-DOC-066 | Embedded diagrams stay editable after DOCX, ODT and `.dcosdoc` round trips and show in Word and LibreOffice | integration + external application check (dated) | yes |
| AC-DOC-067 | Figure and table captions number automatically, renumber on move, and a list of figures/tables generates and updates | unit + e2e | — |
| AC-DOC-068 | The TOC shows correct page numbers in PDF (and on screen if pagination) and updates in Word/LibreOffice | e2e + external application check (dated) | — |
| AC-DOC-069a | Footnotes and endnotes can be inserted, edited, deleted and renumber automatically | unit + e2e (browsers) | — |
| AC-DOC-069b | Notes export to DOCX and ODT as real notes, show in Word and LibreOffice, and import back as notes | integration + external application check (dated) | — |
| AC-DOC-080 | Comment threads with replies can be added, edited, deleted and navigated; DOCX comments show their text in Word | unit + e2e + external application check (dated) | yes |
| AC-DOC-081 | Resolved state survives save and DOCX, and Word shows it as resolved | unit + external application check (dated) | yes |
| AC-DOC-082a | With tracking on, insertions, deletions (and formatting changes if in scope) are recorded with author and time; accept/reject one or all works and is undoable | unit + e2e (browsers) | — |
| AC-DOC-082b | Tracked changes export to DOCX, show as changes in Word and LibreOffice, and import back as changes | integration + external application check (dated) | — |
| AC-DOC-083 | The document language is written to DOCX and ODT and applied to the editor | unit + e2e | yes |
| AC-DOC-084a | Sources can be added, edited and deleted; citations insert in text; a bibliography generates in each approved style and matches reference fixtures | unit | — |
| AC-DOC-084b | Citations and bibliography survive DOCX/ODT export in the documented form; no network request is made | integration + privacy e2e | — |
| AC-DOC-085 | Cross-references to headings, figures, tables and notes update after edits and export as DOCX fields that Word updates | unit + external application check (dated) | — |
| AC-DOC-086 | Comments are written to ODT and read from DOCX and ODT imports | integration + external application check (dated) | — |
| AC-DOC-100a | All reference DOCX samples (the 16 v0.2 samples plus AE-P4 samples) are opened in Word for Mac and Word for Windows, with differences recorded | external application check (dated) | — |
| AC-DOC-100b | Every exported DOCX validates against the ECMA-376 schemas in tests | integration | — |
| AC-DOC-100c | DOCX import of the fixture corpus keeps fonts, sizes, colours, spacing, lists, sections, comments, notes and tracked changes, or reports each loss | integration | — |
| AC-DOC-101a | Every exported ODT validates against the ODF schema and opens in LibreOffice, with differences recorded | integration + external application check (dated) | — |
| AC-DOC-101b | ODT round trip keeps every feature the writer supports | integration | yes (partial) |
| AC-DOC-102 | A PDF with headers, footers and page numbers is produced on every supported platform, or the missing features are shown before export; the PDF opens in an independent reader | e2e + external application check (dated) | — |
| AC-DOC-103a | TXT export never drops content silently | unit | yes |
| AC-DOC-103b | (if D-18) TXT import in UTF-8 and UTF-16 creates paragraphs from blank lines | unit + e2e | — |
| AC-DOC-104 | `.dcosdoc` round trip keeps everything, including diagrams, previews and (after D-08) pictures; newer files are refused | unit + e2e | yes |
| AC-DOC-105 | For every format, a kitchen-sink document's import/export report lists every loss and no loss is unreported | integration (goldens) | yes |
| AC-DOC-106 | Every compatibility statement in README, docs and UI cites a dated external check | manual review | yes |
| AC-DOC-107 | DOCX/ODT/`.dcosdoc` parsing runs off the main thread; oversized or over-expanding files are refused with a reason | unit + e2e | — |

### 10.2 Non-functional, UX and interface

| AC | Criterion | Evidence | Phase | Re-verify |
|---|---|---|---|---|
| AC-DOC-501 | DOC-NFR-001 met (PERF-003) | measurement | AE-P4, AE-P13 | — |
| AC-DOC-502 | DOC-NFR-002 met (PERF-004) | measurement | AE-P4, AE-P13 | — |
| AC-DOC-503 | DOC-NFR-003 met (PERF-005) | measurement | AE-P4 | — |
| AC-DOC-504 | DOC-NFR-004 met (PERF-009) | measurement | AE-P4 | — |
| AC-DOC-505 | DOC-NFR-005 within PERF-008 | measurement (Chromium) | AE-P13 | — |
| AC-DOC-506 | No silent overwrite; v3→v4 upgrade keeps every document and older builds fail closed | upgrade test + integration | AE-P4 | yes |
| AC-DOC-507 | Privacy e2e passes for creating, editing, exporting and importing documents with every AE-P4 feature | e2e (Chromium, WebKit, Firefox) | AE-P4 | yes |
| AC-DOC-508 | Automated accessibility check (if D-25) shows no serious violations on the editor; keyboard-only path completes US-DOC-01/03/04 | e2e + manual (screen reader before AE-P15) | AE-P4, AE-P15 | — |
| AC-DOC-509 | Loss reporting covered by AC-DOC-105 | integration | AE-P4 | yes |
| AC-DOC-510 | Document specs pass on every PLT web project and on native shells in AE-P14 | e2e + manual (devices) | AE-P4, AE-P14 | yes |
| AC-DOC-511 | Import caps and inert parsing proven by malicious fixtures (zip bomb, repeat expansion, script content) | unit | AE-P4, AE-P13 | — |
| AC-DOC-512 | DOC-NFR-012 met: no new package file over 500 lines without a recorded reason; tests/integration/boundaries.test.ts passes | integration + manual review | AE-P4 | yes (boundaries) |
| AC-DOC-701…710 | Each DOC-UX-001…010 item checked in a recorded UI review with screenshots in light and dark, desktop and phone | manual (dated) + e2e where scriptable | AE-P4 | yes for Done items |
| AC-DOC-901 | DocumentEditor props unchanged for existing callers; new props optional | typecheck + unit | AE-P4 | yes |
| AC-DOC-902 | DiagramHost and PresentationDiagramHost stay structurally equal | integration (presentation-hosts.test.ts) | AE-P4 | yes |
| AC-DOC-903 | `prepareDocument` contract holds for schema 1–4 fixtures | unit | AE-P4 | yes |
| AC-DOC-904 | Format handlers report through the SVC-IO type | unit | AE-P4 | — |
| AC-DOC-905 | `extractDocumentText` returns body, headings, captions and notes for fixtures, in a worker, and is registered as a DSH-IF-001 `TextExtractor` | unit | AE-P4 (indexed from AE-P7; MODULE_DEPENDENCY_MAP §5.2) | — |
| AC-DOC-906 | A dangling `sourceRef` shows a missing-source state and keeps the embed | unit + e2e | AE-P12 | — |
| AC-DOC-907 | Documents render identically before and after rich-text extraction (goldens unchanged) | integration | AE-P3/AE-P7 | — |
| AC-DOC-908 | Image host round trip stores one attachment per distinct picture | integration | AE-P4 | — |
| AC-DOC-909 | `exportPdf` reports which features were kept on each platform | unit + manual (native) | AE-P4, AE-P14 | — |

## 11. Test strategy

Nothing below was run in AE-P1. The last recorded full run is 2026-11-15 (RELEASE_GAPS.md §11).

| Kind | Exists today | Add in AE-P4 |
|---|---|---|
| Unit | 31 files in the package, 451 test declarations by strict grep (e.g. docx.test.ts 30, review.test.ts 29, diagramNode.test.tsx 27, compat.test.ts 26, insertObjects.test.ts 24, paragraphFormat.test.ts 20, Ribbon.test.tsx 17) | Footnotes, tracked changes, citations, cross-references, caption numbering, styles, pagination layout maths, worker import entry points, text extraction |
| Integration | tests/integration docx-golden (6), docx-format-golden (3), docx-layout-golden (5), kitchen-sink-v2-golden (8), phase6-cross-feature (4), v0.1.0-fixtures (3); boundaries.test.ts | Schema-4 goldens; OOXML/ODF schema validation (TD-11); custom OOXML reader corpus; kitchen-sink v3 for every new feature |
| Browser (component) | DocumentEditor.test.tsx, Ribbon.test.tsx, Review.test.tsx, LayoutTab.test.tsx (jsdom) | Review pane, citation dialog, page view components |
| End-to-end | home-formatting, insert-document, layout-document, phase4-integration-document, review, ribbon-document, files-tabs-templates, document, diagram-embed* (run locally in Chromium, WebKit and mobile Chromium for document/touch specs; Firefox is a Playwright project (playwright.config.ts:24) that was not run locally and fails on CI; PR #1, unmerged, changes the import line of every document spec and the assertions in home-formatting and insert-document) | US-DOC-01…10 flows in Chromium, Firefox and WebKit; green on CI including Firefox (R-001) |
| Persistence | apps/web storage tests; reloads in e2e; storage.chromium-only.spec.ts:27 relaunch | Reload and relaunch with schema-4 content; D-08 migration with safety copy |
| Offline | storage.chromium-only.spec.ts:7 (Chromium only) | Offline editing with bundled fonts and citation styles in Chromium, WebKit and Firefox |
| Import/export | Goldens above; import/word-files.test.ts (11 mammoth fixtures); dated external checks: Pages 16/16, Word for Mac 2/16 (2026-11-13/14), v0.2 Phase 6 sample in Pages only (2026-11-14) | Dated Word (Mac, Windows) and LibreOffice checks of all samples (D-22); real-world teacher DOCX corpus with permission and no personal data |
| Regression | Goldens; v0.1.0 fixtures; Round 3 † tests (fail-before logs lost, R-035) | Keep fail-before evidence in the repository for every AE-P4 fix |
| Upgrade | scripts/upgrade-test.mjs 82/82 (Chromium, 2026-11-15) | v3→v4 with documents using every schema-3 feature; older build fails closed |
| Accessibility | Keyboard tests (Ribbon.test.tsx; e2e keyboard paths) | axe in e2e if D-25; keyboard-only US flows; screen-reader pass before AE-P15 |
| Performance | None for documents | Harness from AE-P3: PERF-003, 004, 005, 009 with 50- and 200-page fixtures |
| Security | Import guards tests (common.ts caps, ODT caps, KaTeX trust off) | Malicious-file fixtures (AC-DOC-511); privacy e2e for every new feature |

## 12. Known risks

From the register (canonical §10 of the planning brief; mitigations live in [RISK_REGISTER](RISK_REGISTER.md)):

| ID | Risk | L | I | Why it matters for M01 |
|---|---|---|---|---|
| R-009 | On-screen pagination in ProseMirror is a large redesign | H | M | DOC-FR-004 and six dependent Partial rows |
| R-010 | Track changes, citations and footnotes need schema 4 and a custom OOXML reader | H | M | DOC-FR-069, 082, 084, 086 |
| R-011 | Word and LibreOffice compatibility unproven | H | H | DOC-FR-100, 101, 106 |
| R-013 | TOC bookmarks rely on a private docx 9.15.3 property (TD-38) | M | L | Any docx upgrade |
| R-003 | Migrations on live users' data; older and cached builds fail closed | M | H | Schema 4 documents become read-only in the cached live build |
| R-004 | No down-migrations; first non-additive migration (TD-2) untested | M | H | D-08 picture move |
| R-001 | CI e2e never passed on main; Firefox unverified | H | H | All document e2e |
| R-022 | Package boundary versus rich-text reuse | M | M | D-10, INT-07 |
| R-025 | No web CSP; ODT expansion is a denial-of-service risk | M | M | DOC-FR-107 |
| R-029 | Yjs/y-prosemirror compatibility with Tiptap 3.33 unverified | M | M | Future co-editing of documents (D-16) |
| R-030 | Fonts or other assets fetched from third-party CDNs | M | M | DOC-FR-020, 084 |
| R-034 | No performance baselines | H | M | DOC-NFR-001…005 |
| R-035 | Lost evidence (Round 3 fail-before logs) | M | M | Regression claims |
| R-036 | Accessibility debts inherited by new screens | H | M | Review pane, dialogs |
| R-039 | WebView differences (print, downloads) | H | M | DOC-FR-102 on native shells |
| R-097 | Users stay on long-cached PWA builds (RISK_REGISTER) | M | M | Schema-4 documents open read-only in a cached schema-3 build until the user accepts the update (DOC-FR-011) |
| R-098 | External compatibility checks depend on software and devices the owner must provide (D-22; RISK_REGISTER) | H | H | AC-DOC-022…028, 060, 066, 069b, 080-086, 100a, 101a and 102 need Word, LibreOffice and an independent PDF reader |

Module-specific risks. RISK_REGISTER.md §5 numbered them R-050…R-053 in the order below (the draft labels M01-a…d are kept for traceability).

| ID | Risk | L | I | Mitigation (proposed) |
|---|---|---|---|---|
| R-050 (M01-a) | Simple mode fills up as Advanced features are added, losing the "simple" promise | M | M | AC-DOC-002b policy before new controls are built |
| R-051 (M01-b) | PDF quality depends on the browser (headers, footers and page numbers need Chromium 131+, printSupport.ts:11; `window.print` is reported not to work in Android WebView, Unverified until AE-P14); users on Safari, Firefox or native shells get PDFs without headers or numbers | H | M | D-18 decision on generated PDF; DOC-IF-009; disclosure in UI (DOC-UX-010) |
| R-052 (M01-c) | Teachers import real Word files and judge the studio by lossy import, even though each loss is reported | H | M | AC-DOC-100c corpus; custom OOXML reader; clear report wording |
| R-053 (M01-d) | Citation styles are large and detailed; partial style support produces bibliographies that markers reject | M | M | D-18 limits styles; fixtures from published style guides; label "approximate" until verified |

Owner decisions this module waits on: D-08, D-10, D-16, D-17, D-18, D-22, D-25, D-29, D-30, D-36 (citations are a deferral candidate).
