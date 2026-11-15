# Module 03: Advanced Presentation Studio (PRD)

This document defines what the Advanced Presentation Studio (module M03, requirement prefix PRS) must do to meet the Advanced Edition brief, records exactly how much of it already exists in `packages/presentation-studio` (committed in edc2672, v0.2 Phase 7), and sets the requirements, contracts, acceptance criteria and tests that AE-P6 must satisfy. Most of the module exists. The gaps are grouping, a selection pane, an animation timeline, exit and emphasis effects, multiple masters, cell merge, PDF fonts, presenter mode on real hardware, and any check of the exports in a real presentation application.

**Status:** AE-P1 draft for owner approval (2026-11-15)

**Related documents (this folder):** [Roadmap](ADVANCED_EDITION_PRODUCT_ROADMAP.md) · [System architecture](SYSTEM_ARCHITECTURE.md) · [Database and sync](DATABASE_AND_SYNC_ARCHITECTURE.md) · [Dependencies and licences](DEPENDENCY_AND_LICENCE_PLAN.md) · [Module dependency map](MODULE_DEPENDENCY_MAP.md) · [Acceptance criteria](ACCEPTANCE_CRITERIA.md) · [Security and privacy](SECURITY_AND_PRIVACY_PLAN.md) · [Risk register](RISK_REGISTER.md) · [Release strategy](RELEASE_STRATEGY.md) · [M01 Document Studio](MODULE_01_DOCUMENT_STUDIO_PRD.md) · [M02 Diagram Studio](MODULE_02_DIAGRAM_STUDIO_PRD.md) · [M06 Classroom Hub](MODULE_06_CLASSROOM_HUB_PRD.md) · [M08 File Manager](MODULE_08_FILE_MANAGER_PRD.md) · [M09 Dashboard](MODULE_09_DASHBOARD_PRD.md)

**Phase naming.** "AE-P6" is the Advanced Edition phase that completes this module. "v0.2 Phase 7" is the earlier programme's phase that built the current package (commit edc2672). The two are never shortened to "Phase 6" or "Phase 7".

**Evidence base.** Code read at HEAD edc2672 on branch `advanced/phase1-audit`. Nothing was run in AE-P1. "Done" means implemented, with a test file and the recorded passing run of 2026-11-15 (RELEASE_GAPS.md §11, lines 251-264: Vitest 132 files / 1997 tests; Playwright 350 passed / 27 skipped / 0 failed in Chromium, WebKit and mobile Chromium; Firefox not run). Paths below are relative to `packages/presentation-studio/src/` unless they start with another root.

---

## Current state

Copied from the canonical planning brief §2 (M03). Package root: `packages/presentation-studio/src/`, committed in edc2672.

| ID | Bullet | Status | Evidence / limits |
|---|---|---|---|
| PRS-FR-001 | Create, duplicate, delete | Done | editor/model.ts:34-61 |
| PRS-FR-002 | Reorder | Done | model.ts:71-83. Touch users reorder through the menu only |
| PRS-FR-003 | Navigator | Done | SlidesPanel.tsx:287. No outline or sorter view; not virtualised |
| PRS-FR-004 | Layouts | Done (8 fixed) | types.ts:398. Layouts cannot be added (TD-60) |
| PRS-FR-005 | Master slides | Partial | One master only; PPTX copies master objects onto each layout (TD-56) |
| PRS-FR-006 | Themes and templates | Partial | 6 themes, 5 templates. No user templates; no PPTX or .potx import |
| PRS-FR-007 | Slide size 16:9 and 4:3 (beyond the brief) | Done | types.ts:20-25 |
| PRS-FR-020 | Text boxes | Done | TextBoxEditor.tsx. Autofit is measured only on the slide shown (TD-61) |
| PRS-FR-021 | Images | Done | ImageElement uses `attachmentId` (types.ts:226). Crop is typed per side |
| PRS-FR-022 | Tables | Partial | No merge or split of cells |
| PRS-FR-023 | Charts | Done | 5 types (types.ts:327). Native PPTX charts never seen drawn by any application (TD-55) |
| PRS-FR-024 | Shapes | Done | 23 presets |
| PRS-FR-025 | Diagrams | Done | hosts.ts:40; EditorPage.tsx:25-28. The diagram is **copied**, not linked |
| PRS-FR-026 | Backgrounds | Done | design/BackgroundDialog.tsx |
| PRS-FR-027 | Alignment guides | Done | editor/guides.ts:113-195 |
| PRS-FR-028 | Layers (z-order, lock, pane) | Partial | Z-order and lock Done. No selection pane; `ElementBase.name` is never set by the UI |
| PRS-FR-029 | Grouping | **Absent** | ELEMENT_TYPES (types.ts:378) has no group type |
| PRS-FR-040 | Speaker notes | Done | NotesPane.tsx |
| PRS-FR-041 | Presenter mode | Partial | show/PresenterView.tsx; BroadcastChannel. Never tried on real hardware or in webviews (TD-58) |
| PRS-FR-042 | Transitions | Done (6) | show/effects.ts. No auto-advance |
| PRS-FR-043 | Object animations | Partial | Entrance effects only (TD-59) |
| PRS-FR-044 | Animation timeline | **Absent** | Order buttons only (show/ShowTabs.tsx:210-218) |
| PRS-FR-045 | Keyboard navigation | Done | show/keys.ts:20-55 |
| PRS-FR-046 | Full screen | Partial | Full screen asserted in Chromium tests only; the show falls back to filling the window |
| PRS-FR-060 | PPTX export | Partial | pptxgenjs 4.0.1 plus fflate post-processing. Structure tested; xmllint on 66 parts |
| PRS-FR-061 | PDF export | Partial | WinAnsi fonts only, other characters become "?" (TD-57); diagrams drawn as PNG |
| PRS-FR-062 | Verify with real presentation apps | **Absent** | Not opened in PowerPoint, Keynote, LibreOffice or Google Slides. Quick Look showed slide 1 only (docs/compatibility/phase7-2026-11-15) |
| PRS-FR-063 | No non-functional controls | Done | Host gating (useContentTools.tsx:216-542) |

- Schema: PRESENTATION_SCHEMA 1, frozen (compat.ts:14). The canonical brief says grouping, a timeline, exit or emphasis effects and cell merge all need schema 2; the code shows cell merge does not (next point).
  - **Conflict with the code (reported, AE-P1 fact-check):** cell merge does **not** need schema 2. The frozen schema-1 vocabulary already lists `colSpan`, `rowSpan` and `merged` for table cells (compat.ts:62; types.ts:292-296), and stored merged cells are drawn and kept (elements/table.ts:6-7, :68). Only the editing UI to create a merge is missing (TD-60). Grouping, per-object hide, and exit or emphasis effects do need schema 2.
- The privacy e2e (e2e/privacy.spec.ts) and the offline e2e do not cover presentations. (Checked in AE-P1: `grep -n presentation e2e/privacy.spec.ts e2e/storage.chromium-only.spec.ts` finds nothing.)
- No large-presentation measurement exists.

**What earlier commits already deliver for AE-P6.** edc2672 (v0.2 Phase 7, ADR 0014) delivered every Done and Partial row above. It is a head start, not a pass: every Done row must be re-verified against its AC-PRS criterion in AE-P6 ("re-verify: yes" below). edc2672 is on origin/main and was deployed by Pages run 43676035951 (2026-11-15T04:16Z); README.md:5, :35 and docs/DEPLOYMENT.md:18 still call it "not committed or deployed" (stale, scheduled for correction in AE-P2).

---

## 1. Product objectives

1. Let students and teachers build, present and hand in slide presentations entirely offline, with no account and no network call.
2. Close the brief's gaps without breaking what exists: grouping, a layers/selection pane, an animation timeline, exit and emphasis effects (grouping, per-object hide and the new effect classes need PRESENTATION_SCHEMA 2; the timeline needs it only if an object may carry several animations, §3.3), cell merge (no schema change, §3.2), and the scope of masters and templates that D-19 decides.
3. Make the exports trustworthy outside the app: PPTX that opens and plays in real presentation applications, and PDF that keeps non-Latin text, both with dated external-check records (PRS-FR-062).
4. Keep every existing presentation readable: schema-1 content opens unchanged; content from a newer build opens in the protected read-only view (safety.ts:230 `preparePresentation`).
5. Keep the module a good citizen of the platform: diagrams through SVC-HOST, pictures through SVC-BLOB, items through SVC-ITEM, text into SVC-SEARCH, references through SVC-REF. No module-private copy of a shared service.
6. Meet measured performance targets (PERF-007, PERF-008) instead of assumed ones.

Out of scope for M03: live co-editing of presentations (D-16 proposes documents only for v1.0.0), AI features, paid services, Tiptap Pro.

## 2. User stories

| # | As a … | I want to … | So that … | Requirements |
|---|---|---|---|---|
| US-PRS-01 | student | start from a template, add slides, reorder and hide them | I can structure a talk quickly | PRS-FR-001…006, PRS-FR-008 |
| US-PRS-02 | student | group a title, picture and caption and move them as one | my slides stay aligned while I edit | PRS-FR-029 |
| US-PRS-03 | student | see every object on a slide in a list, rename, hide and reorder them | I can select objects hidden behind others | PRS-FR-028 |
| US-PRS-04 | teacher | build a step-by-step reveal with entrance, emphasis and exit effects and see them on a timeline | I control the pace of a lesson | PRS-FR-043, PRS-FR-044 |
| US-PRS-05 | teacher | present on a projector while I see notes, the next slide and a timer on my laptop | I can teach from my notes | PRS-FR-040, PRS-FR-041, PRS-FR-046 |
| US-PRS-06 | student | insert a diagram I made in Diagram Studio and edit it in place | I don't redraw it | PRS-FR-025 (INT-02) |
| US-PRS-07 | student | export to PPTX and open it in PowerPoint, Keynote or LibreOffice on a school computer | I can present anywhere | PRS-FR-060, PRS-FR-062 |
| US-PRS-08 | student writing in Hindi, Greek or Chinese | export a PDF handout with my text intact | the handout is readable | PRS-FR-061 |
| US-PRS-09 | student | submit a presentation to a classroom assignment | the teacher grades exactly what I sent | INT-04 (M06) |
| US-PRS-10 | user with a keyboard or screen reader | build and run a presentation without a mouse | the tool is usable for me | PRS-FR-045, PRS-UX-*, A11Y-001 |
| US-PRS-11 | user with an old cached build | open a presentation saved by a newer build without damaging it | my work is never lost | PRS-NFR-002 |
| US-PRS-12 | teacher | save my own presentation as a template | every class deck starts with my design | PRS-FR-006 (D-19) |

## 3. Functional requirements

Status words: Done, Partial, Stub, Absent, Unverified (brief §0.2). "Done" never means Advanced-complete. ID blocks: Slides 001–019, Editing 020–039, Tools 040–059, Export 060–079 (brief §4.2). Rows marked "(new)" are additions in the reserved gaps.

### 3.1 Slides (001–019)

| ID | Requirement | Current status | Evidence / gap | AE-P6 work |
|---|---|---|---|---|
| PRS-FR-001 | Create, duplicate and delete slides, singly and as a multi-selection, each as one undo step | Done | editor/model.ts:34 `addSlide`, :52 `duplicateSlides`, :61 `deleteSlides`; SlidesPanel.tsx:66-68; editor/model.test.ts; e2e/presentation-editor.spec.ts | Re-verify |
| PRS-FR-002 | Reorder slides by drag, keyboard (Alt+arrows) and menu, including on touch | Done | model.ts:71 `moveSlides`, :83 `moveSlidesBy`; SlidesPanel.tsx:150, :192-222 | Touch drag is absent (menu only); decide whether touch drag is required (UX, not a new decision ID) |
| PRS-FR-003 | Slide navigator with thumbnails; outline view and slide-sorter grid | Done (thumbnail list) | SlidesPanel.tsx:287 (`role="listbox"`), memoised thumbnails at :47 | Add virtualisation for PERF-007; outline and sorter views are a scope question under D-19 |
| PRS-FR-004 | Multiple slide layouts; change layout keeps content by placeholder id | Done (8 fixed) | types.ts:398-399 `LayoutKind` / `LAYOUT_KINDS`; layouts.ts:7-16; design/model.ts:282 `changeLayout` | Adding and renaming layouts (TD-60) per D-19 |
| PRS-FR-005 | Master slides: edit master background, placeholders and decorations; changes flow to layouts and slides; multiple masters if D-19 approves | Partial | One master (design/MasterView.tsx; design/model.ts:373, :465, :502, :514). The content model already stores `masters: SlideMaster[]` and each layout has a `masterId` (types.ts:401-420, :441-451), so more than one master needs no schema change: the schema-1 vocabulary has `masters` and `masterId` (compat.ts:15, :25-26), and safety.ts:171-190 accepts several masters with unique ids and checks each layout's `masterId` against them (read in AE-P1; no test with two masters exists). The editor cannot add or rename a master (TD-60), and master view opens on `masters[0]` (design/MasterView.tsx:159). PPTX writes one master and copies its decorations onto each layout (TD-56) | Per D-19: multiple masters need a custom PPTX master writer (PptxGenJS 4.0.1 supports one master) |
| PRS-FR-006 | Themes and templates: built-in themes, built-in templates, custom theme colours and fonts, user-saved templates, PPTX/.potx import if D-19 approves | Partial | themes.ts:12 (6 themes); templates.ts:17-41 (5 templates); design/model.ts:57-63 (`custom` theme). No user templates; no import (ADR 0014 decision 8) | User templates and PPTX import per D-19 |
| PRS-FR-007 | Slide size 16:9 and 4:3 (beyond the brief) | Done | types.ts:20-25 `SLIDE_SIZES`; design/model.ts:115 `setSlideSize` | Re-verify |
| PRS-FR-008 (new) | Hide slides from the show; hidden slides are still exported and marked hidden in PPTX (beyond the brief) | Done | editor/model.ts:104 `setSlidesHidden`; types.ts:438 `Slide.hidden`; PPTX `show="0"` checked (docs/compatibility/phase7-2026-11-15/README.md) | Re-verify |

### 3.2 Editing (020–039)

| ID | Requirement | Current status | Evidence / gap | AE-P6 work |
|---|---|---|---|---|
| PRS-FR-020 | Rich text boxes with autofit options | Done | editor/TextBoxEditor.tsx; editor/textExtensions.ts; editor/richText.ts; richText.test.ts. Autofit measured only on the slide shown (TD-61) | Fix TD-61 (measure off-screen or at load) |
| PRS-FR-021 | Pictures: insert, paste, drop, crop, fit, alt text; stored as attachments | Done | types.ts:224-230 `ImageElement.attachmentId`; elements/images.ts (15 MB cap, 2400 px downscale); useContentTools.tsx:216-361. Crop typed per side, no handles (TD-60) | Crop handles |
| PRS-FR-022 | Tables: insert, edit, rows/columns, header and banding, fills, borders, merge and split cells | Partial | types.ts:319; elements/table.ts; elements/table.test.ts. Merged cells in stored content are drawn and kept but cannot be created (TD-60; elements/table.ts:6-7) | Create merge/split in the editor. No schema change: `colSpan`, `rowSpan` and `merged` are already in the schema-1 vocabulary (compat.ts:62; types.ts:292-296) |
| PRS-FR-023 | Charts: bar, column, line, pie, doughnut, stacked; native PPTX charts with an embedded workbook | Done | types.ts:327-328 (5 types), :348-349 (`stacked` for bar and column); elements/chart.ts; chart.test.ts; pptx.test.ts | Native charts must be seen drawn in a real application (PRS-FR-062, TD-55) |
| PRS-FR-024 | Shapes: 23 presets with text, fill, line, arrowheads, flips | Done | types.ts:238-265 `SHAPE_PRESETS`; render/shapePaths.ts. Picture fills of shapes are written to PPTX as a colour | Re-verify |
| PRS-FR-025 | Diagrams: create, insert from template, library or .drawio file; edit in place; embedded as an editable copy (INT-02) | Done | hosts.ts:40 `PresentationDiagramHost`; apps/web/src/pages/EditorPage.tsx:25-28; tests/integration/presentation-hosts.test.ts; presentation-export.test.ts. Copied, not linked | Add `sourceRef` provenance and "update from source" through SVC-REF (ADR-0018, AE-P12); external check of the PPTX diagram |
| PRS-FR-026 | Slide backgrounds: solid, gradient, picture; apply to all | Done | types.ts:43-52; design/BackgroundDialog.tsx; design/model.ts:136, :154; export/background-fit.test.ts. Two-stop gradients only in the dialog | Re-verify |
| PRS-FR-027 | Alignment guides: slide edges and centre, other objects, equal spacing; Alt disables | Done | editor/guides.ts:113 `guidesFor`, :146 `spacingFor`, :177 `snapMove`, :195 `snapResize`; guides.test.ts. Resize snapping only for unrotated objects | Re-verify; M02 may adapt this code for DGM-FR-081 |
| PRS-FR-028 | Layers: z-order, lock, and a selection pane that lists, names, hides and reorders objects | Partial | editor/arrange.ts:10-18; ui/HomeTab.tsx:323-355; model.ts:173 `setLocked`. No pane; `ElementBase.name` (types.ts:200) is read by Canvas.tsx:106 and export/pptx.ts:142 but never set by the UI | Selection pane; per-object hide (needs a schema-2 field) |
| PRS-FR-029 | Group and ungroup objects; nested groups; resize and rotate a group; groups exported as PPTX group shapes | **Absent** | types.ts:376-378: `ELEMENT_TYPES` = text, image, shape, table, chart, diagram | New `group` element type, PRESENTATION_SCHEMA 2 |
| PRS-FR-030 (new) | Resize several selected objects together | Absent | TD-60 | Implement with grouping geometry |

### 3.3 Presentation tools (040–059)

| ID | Requirement | Current status | Evidence / gap | AE-P6 work |
|---|---|---|---|---|
| PRS-FR-040 | Speaker notes per slide; exported to PPTX notes and to "PDF with speaker notes" | Done | types.ts:434 `Slide.notes`; editor/NotesPane.tsx; model.ts:117 `setNotes`; e2e/presentation-export.spec.ts. Ctrl/⌘+Z in notes undoes notes only (TD-60) | Re-verify |
| PRS-FR-041 | Presenter mode: current and next slide, notes, timer, clock, controls; second window or in-page | Partial | show/PresenterView.tsx:103-109; show/channel.ts (BroadcastChannel); apps/web/src/pages/PresenterPage.tsx; show/channel.test.ts; e2e/presentation-show.spec.ts (Chromium, WebKit). Never tried on a projector, second screen, phone, tablet or webview (TD-58) | Dated real-hardware record (D-22 devices) |
| PRS-FR-042 | Slide transitions (6 effects), direction, speed, apply to all, preview; reduced motion turns them into cuts | Done (6) | types.ts:177; show/effects.ts:56-66, :106-109; show/ShowTabs.tsx:106-145; effects.test.ts | Playback in a real application (PRS-FR-062) |
| PRS-FR-043 | Object animations: entrance, emphasis and exit effects; triggers on click, with previous, after previous; duration and delay | Partial | Entrance only: types.ts:160 `AnimationEffect` = appear, fade, fly-in, zoom, wipe; :161 triggers; show/sequence.ts; export/timing.ts:82 (PowerPoint preset ids). Exit and emphasis absent (TD-59) | Schema 2; PPTX `p:timing` for the new classes |
| PRS-FR-044 | Animation timeline: a pane listing every animation on the slide in order, with trigger, start offset and duration, editable by drag and keyboard, with order badges on the canvas | **Absent** | show/ShowTabs.tsx:210-218 has only "Animation N of M" with Earlier/Later | Timeline pane; may need schema 2 only if multiple animations per object are allowed (today `ElementBase.animation` is a single `Animation`, types.ts:202) |
| PRS-FR-045 | Keyboard navigation in the show, the navigator and the canvas | Done | show/keys.ts:20-55; show/useShowFeatures.tsx:148-151; SlidesPanel.tsx:148-178; Canvas.tsx:476, :494 | Re-verify, plus Firefox |
| PRS-FR-046 | Full-screen show; falls back to filling the window where full screen is refused, and says so | Partial | show/fullscreen.ts:12-49; show/SlideShow.tsx:237-270; full screen asserted in Chromium only (TD-58); Firefox not run (TD-62); PR #1 (unmerged) makes Linux WebKit refuse full screen in specs | Firefox and WebKit evidence; webviews in AE-P14 |
| PRS-FR-047 (new) | Auto-advance and rehearsed timings (beyond the brief) | Absent | TD-59 | Scope under D-19; deferral candidate under D-36 |

### 3.4 Export (060–079)

| ID | Requirement | Current status | Evidence / gap | AE-P6 work |
|---|---|---|---|---|
| PRS-FR-060 | PPTX export that keeps text, layouts, master, charts, tables, pictures, diagrams (with editable data), notes, transitions and animations; every approximation named in the export message | Partial | export/pptx.ts (pptxgenjs 4.0.1 exact), export/pptxPost.ts (fflate), export/timing.ts, export/drawingml.ts; pptx.test.ts (25 cases), timing.test.ts, edge-cases.test.ts; xmllint on 66 parts (compatibility README). Approximations: TD-56 | Group shapes, new animation classes, multiple masters (D-19); external checks |
| PRS-FR-061 | PDF export (slides; slides with notes) with selectable text that keeps every character the user typed | Partial | export/pdf.ts (`pdfSafeText`), export/slideSvg.ts, export/layoutText.ts; pdf.test.ts. Standard PDF fonts only: characters outside WinAnsi become "?"; justified drawn left; diagrams as PNG (TD-57) | Embed fonts (candidate open fonts, bundled locally, R-030) per D-19 |
| PRS-FR-062 | Exports verified in real presentation applications, with dated records | **Absent** | docs/compatibility/phase7-2026-11-15/README.md "Not checked": no PowerPoint (not installed), Keynote did not respond (the `keynote/` folder is empty), LibreOffice and Google Slides not tried; Quick Look slide 1 only; PDFs opened in macOS PDFKit only | PowerPoint (Windows and/or Mac), Keynote, LibreOffice Impress; animation and transition playback; PDF in an independent reader (D-22) |
| PRS-FR-063 | No control is shown that does nothing; unavailable controls are hidden or disabled with the reason | Done | useContentTools.tsx:216-542 (host gating); ExportMenu.tsx:57-59; HomeTab.tsx (disabled with reason; HomeTab.test.tsx) | Every new AE-P6 control obeys this |
| PRS-FR-064 (new) | PPTX import into a new presentation, with an import report (beyond the brief) | Absent | ADR 0014 decision 8: "there is no presentation import"; FIL-FR-013 lists no PPTX import | Scope under D-19; if approved, parse off the main thread with size and inflate caps (SEC) |

## 4. Non-functional requirements

| ID | Requirement | Current status | Evidence / gap |
|---|---|---|---|
| PRS-NFR-001 | Performance: a 150-slide presentation opens in ≤ 3 s and switches slides in ≤ 150 ms (PERF-007); heap ≤ 500 MB with one document, diagram and presentation open (PERF-008). **Proposed targets, to be measured** on the reference hardware (D-29) | Absent | No large-presentation test or measurement exists; the slide list is not virtualised |
| PRS-NFR-002 | Data safety: schema-1 content opens unchanged; newer or damaged content opens read-only with a download of the original; a schema-2 build writes schema 1 whenever the content uses no schema-2 feature | Partial | Done for schema 1: compat.ts:14 (frozen vocabulary), :94 `presentationNovelty`; safety.ts:163, :230, :247; safety.test.ts. "Lowest schema per save" exists for documents and diagrams; for presentations `presentationSchemaFor` returns the literal 1 (compat.ts:271), so the schema-2 selector must be written |
| PRS-NFR-003 | Autosave, drafts, version history, trash and backup behave as for every kind (SVC-STORE, SVC-BACKUP) | Done | Platform: apps/web/src/lib/storage.ts:689-692; packages/local-storage/src/backup.ts:14 (`presentation: 1`); e2e/presentation-cross-feature.spec.ts (save, reload, version restore, trash, backup into empty profile) |
| PRS-NFR-004 | Privacy: creating, editing, showing and exporting a presentation makes no request to another origin | Partial | A grep for `fetch(`, `XMLHttpRequest`, `WebSocket` and `sendBeacon` in packages/presentation-studio/src finds none outside tests (AE-P1). Not covered by e2e/privacy.spec.ts (no mention of presentations) |
| PRS-NFR-005 | Offline: the editor, show and exports work offline after the first visit | Partial | PWA precache includes the pptxgen chunk (apps/web/vite.config.ts:37-38). e2e/storage.chromium-only.spec.ts covers documents and diagrams only |
| PRS-NFR-006 | Browser support per PLT-001…003 (Chromium, Firefox, Safari/WebKit) and webviews per PLT-005…007 | Partial | Chromium, WebKit and mobile Chromium recorded 2026-11-15. Firefox never passed (TD-62; PR #1 unmerged); webviews never built |
| PRS-NFR-007 | Export honesty: every export reports what it approximated or dropped; nothing is silently lost | Done | export/report.ts; `exportToastText` (ExportMenu.tsx); pptx.test.ts, pdf.test.ts |
| PRS-NFR-008 | Input limits: pictures ≤ 15 MB, downscaled over 2400 px; tables up to 30 × 12 on insert; any future PPTX import capped in size and decompressed size (SEC) | Partial | elements/images.ts:8; images-diagram.test.ts:39-43. No import exists yet |
| PRS-NFR-009 | Package boundary: the package imports only `@dcos/ui`; storage, diagrams and pictures come through hosts | Done | tests/integration/boundaries.test.ts:16 |
| PRS-NFR-010 | Accessibility: WCAG 2.2 AA (A11Y-001) for the editor; the show respects `prefers-reduced-motion` | Partial | Keyboard paths tested (show.test.tsx; e2e/presentation-export.spec.ts "menu from the keyboard alone"); reduced motion handled (show/effects.ts:106-109; show/useShowFeatures.tsx:49). No axe run (D-25); no screen-reader pass |
| PRS-NFR-011 | Identifiers: slides and elements keep full random UUIDs so that a future merge or sync cannot collide | Partial | create.ts:15-19 `newId` uses `crypto.randomUUID`. Limits: where it is missing the fallback is `id-<time>-<8 random base-36 characters>`, not a UUID; no test calls `newId` itself (the unit tests inject their own id makers, e.g. model.test.ts:26) |

## 5. UI/UX requirements

| ID | Requirement | Current status | Evidence / notes |
|---|---|---|---|
| PRS-UX-001 | The ribbon keeps its existing tabs and grouping; new controls go into the tab where users expect them (Home: arrange and group; Animations: timeline) | Done (existing tabs) | ui/HomeTab.tsx; show/ShowTabs.tsx |
| PRS-UX-002 | Selection pane: a side panel listing the current slide's objects front to back, with rename, hide/show, lock, drag to reorder, and group nesting shown as a tree | Absent | Needs PRS-FR-028/029 |
| PRS-UX-003 | Animation timeline: a pane with one row per animation, trigger icon, start offset and duration bars, play from here; canvas badges show the order number | Absent | Needs PRS-FR-044 |
| PRS-UX-004 | Every control reachable and operable by keyboard; menus use the shared `Menu` keyboard pattern (packages/ui/src/components.tsx:283-370) | Partial | Existing controls tested; new panes must be |
| PRS-UX-005 | Touch: every editing action has a touch path (long press menu, handles); touch reordering of slides by drag if PRS-FR-002 requires it | Partial | Touch specs: e2e/presentation-*-touch.spec.ts (mobile Chromium only); no WebKit touch automation |
| PRS-UX-006 | Light and dark themes for the editor chrome; slides render in their own theme colours in both | Partial | The chrome uses the shared tokens (packages/ui/src/tokens.css). No presentation test or e2e spec checks the app's dark theme (grep, AE-P1). Inherits the dark danger contrast defect (2.77:1) until AE-P3 (ADR-0024) |
| PRS-UX-007 | Unavailable features are disabled with the reason, never hidden silently and never inert (mirrors PRS-FR-063) | Done | HomeTab.tsx disabled buttons with reason; ui/HomeTab.test.tsx:48 |
| PRS-UX-008 | Export dialog shows what will be approximated before the user exports when the presentation contains such content | Partial | Today the message is shown after export (toast) |
| PRS-UX-009 | Uses SVC-UI components and tokens from AE-P3 (Tabs, Tooltip, Popover, Drawer); popovers height-capped (TD-64) | Partial | presentation-studio `ui/parts.tsx` popovers are not height-capped (TD-64) |

## 6. Data model

### 6.1 Today (PRESENTATION_SCHEMA 1, frozen)

- Item: a `WorkspaceItem` of kind `'presentation'` (packages/local-storage/src/types.ts:5-29), in the `presentations` store with versions in `presentation_versions` (indexeddb.ts:58-72, DB v3). Content schema limit for backups: `MAX_CONTENT_SCHEMA_BY_KIND.presentation = 1` (backup.ts:14).
- Content: `PresentationContent { schemaVersion: 1; size; themeId; theme; masters: SlideMaster[]; layouts: SlideLayout[]; slides: Slide[] }` (types.ts:441-451).
- `Slide { id; layoutId; background?; elements: SlideElement[]; notes: RichTextDoc; transition?; hidden? }` (types.ts:426-439).
- `SlideElement` = text | image | shape | table | chart | diagram (types.ts:376-378). `ElementBase` has `x, y, w, h, rotation, locked?, name?, animation?, placeholderId?` (types.ts:191-205); one `Animation` per element.
- Binary data: pictures and diagram previews are SVC-BLOB attachments referenced by id strings in content (`ImageElement.attachmentId`, types.ts:226; hosts.ts:60-68); attachment clean-up finds them by walking content (indexeddb.ts:114-118, :1105-1124).
- Ids: full UUIDs (create.ts:15-17).

### 6.2 Proposed for AE-P6 (PRESENTATION_SCHEMA 2; Proposed, needs approval via D-19)

Additive only. A schema-2 build writes schema 1 whenever the content uses none of these.

```ts
// New element type (PRS-FR-029). Children keep their own coordinates in slide space.
interface GroupElement extends ElementBase {
  type: 'group';
  children: SlideElement[];          // may contain groups; depth cap to be set (proposed 8)
}

// ElementBase additions
interface ElementBase {
  // existing fields unchanged …
  hidden?: boolean;                  // selection-pane hide (PRS-FR-028); exported as hidden in PPTX
  animations?: Animation[];          // only if PRS-FR-044 allows several effects per object;
                                     // `animation` (schema 1) stays readable and is migrated on write
}

// Animation additions (PRS-FR-043)
type AnimationClass = 'entrance' | 'emphasis' | 'exit';
interface Animation {
  // existing fields unchanged …
  class?: AnimationClass;            // missing = 'entrance' (schema 1 meaning)
  effect: AnimationEffect | EmphasisEffect | ExitEffect;
}

// Table cells (PRS-FR-022): no schema change. colSpan, rowSpan and merged are already in PRESENTATION_V1_VOCABULARY
// (compat.ts:62; types.ts:292-296); only the editing UI that creates a merge is new.

// Diagram provenance (ADR-0018, AE-P12): optional, additive.
interface DiagramElement { /* existing */ sourceRef?: ItemRef }
```

Migration: `migrate.ts` gains a 1→2 upgrader that is a number change only (as document-studio migrate.ts:18-23 does). `compat.ts` keeps `PRESENTATION_V1_VOCABULARY` frozen and adds a frozen V2 vocabulary; `presentationSchemaFor` returns 1 or 2. `MAX_CONTENT_SCHEMA_BY_KIND.presentation` becomes 2. No IndexedDB version change is needed for content-schema changes.

Multiple masters: the array shape already exists (§6.1) and is in the schema-1 vocabulary (compat.ts:15, :25-26); safety.ts:171-190 already accepts several masters (read, not tested). If D-19 approves multiple masters, AE-P6 adds a test with two masters, the editor actions to add and rename a master, and the PPTX writer work (TD-56); no schema change is expected.

## 7. Technical architecture

**Today.** `@dcos/presentation-studio` is a workspace package (package.json:7-14) that imports only `@dcos/ui`. It is loaded lazily by the module registry (apps/web/src/modules.tsx:74-82) and receives `diagramHost` and `imageHost` through `EditorProps` (modules.tsx:10-25), built in apps/web (`useDiagramHost`, EditorPage.tsx:25-28; `presentationImageHost`, apps/web/src/lib/presentationHosts.ts:8). Folders: `editor/` (canvas, navigator, notes, guides, history), `elements/` (content tools, tables, charts, diagrams, pictures), `design/` (themes, masters, backgrounds, templates), `show/` (slide show, presenter view, effects, sequence, BroadcastChannel), `export/` (lazy chunk: PptxGenJS, fflate post-processing, jsPDF + svg2pdf.js), `render/` (shared SVG/HTML renderer). The presenter window is a separate route (apps/web/src/App.tsx:53). Exports run on the main thread.

**Changes for AE-P6.**

| Area | Change | Shared service |
|---|---|---|
| Schema 2 | Group type, hidden flag, animation classes, optional `animations[]`, migration and vocabulary as in §6.2 | SVC-ITEM, SVC-BACKUP (schema limit) |
| Editing | Group geometry (move, resize, rotate of a group; hit testing; guides against group bounds); multi-resize; crop handles; cell merge | — |
| Panes | Selection pane and animation timeline as new components using SVC-UI primitives | SVC-UI |
| Show | Sequence builder (show/sequence.ts) extended for emphasis and exit classes; reduced-motion rules extended | — |
| PPTX | Group shapes (`p:grpSp`), new `p:timing` presets, multiple masters only through a custom post-processed master writer (D-19, R-018) | SVC-IO |
| PDF | Font embedding with locally bundled open fonts (no CDN, R-030), selected by script coverage | SVC-IO |
| Performance | Virtualised slide list; off-screen autofit measurement (TD-61); measurement harness from AE-P3 | — |
| Search | A text extractor (slide text, notes, chart labels, table cells, titles) registered with SVC-SEARCH | SVC-SEARCH |
| References | `sourceRef` on diagrams, "update from source" (AE-P12) | SVC-REF |
| Import (if D-19) | PPTX reader in a Web Worker with size and inflate caps | SVC-IO, SEC |

## 8. Dependencies

### 8.1 Modules and services

| Depends on | Why | Contract |
|---|---|---|
| M02 Diagram Studio | Diagrams on slides | INT-02 via SVC-HOST (`PresentationDiagramHost`, structurally equal to document-studio `DiagramHost`, tests/integration/presentation-hosts.test.ts) |
| Platform (local-storage, apps/web) | Items, versions, drafts, attachments, backup | SVC-ITEM, SVC-STORE, SVC-BLOB, SVC-BACKUP |
| packages/ui | Components and tokens | SVC-UI (AE-P3 extensions) |
| AE-P3 | Measurement harness, axe (D-25), design tokens, SVC-REF/SVC-SEARCH interfaces | — |

| Used by | Why | Contract |
|---|---|---|
| M06 Classroom Hub | Submitting presentations | INT-04 via SVC-REF (`snapshot`), SVC-BLOB, SVC-PERM |
| M08 File Manager | Listing, previews, import | INT-05 |
| M09 Dashboard | Recent work, global search | INT-06, INT-09 (SVC-SEARCH extractor) |
| M07 Collaboration | Co-editing only if D-16 extends scope beyond documents | INT-08 (not planned for M03 in v1.0.0) |

### 8.2 Libraries

Installed (versions from package-lock.json): pptxgenjs 4.0.1 (exact), jspdf 4.2.1, svg2pdf.js 2.8.1 (exact), fflate 0.8.3, @tiptap/* 3.33.1. Each is already in the production licence gate (THIRD_PARTY_NOTICES.md).

Candidates (no versions; licence, maintenance and security to verify in DEPENDENCY_AND_LICENCE_PLAN.md):

| Need | Candidate | Licence (reported, to verify) | Note |
|---|---|---|---|
| PDF font embedding | Open fonts with wide script coverage (for example the Noto family), bundled locally, used through jsPDF's font API | OFL-1.1, to verify | Size cost; subset per script; never fetched from a CDN (R-030) |
| Slide-list virtualisation | Original code, or `@tanstack/react-virtual` | MIT, to verify | Prefer original code if small |
| Accessibility checks | `@axe-core/playwright` | MPL-2.0, needs D-25 | Shared with all modules |
| PPTX import (only if D-19) | Original reader over fflate (installed) | — | No new dependency proposed |

## 9. API/interface contracts

Existing contracts (unchanged unless stated):

```ts
// packages/presentation-studio/src/hosts.ts:40-52 — SVC-HOST, INT-02
interface PresentationDiagramHost {
  templates: Array<{ id: string; name: string }>;
  edit(current: PresentationEmbeddedDiagram | null, start?: PresentationDiagramStart): Promise<PresentationEmbeddedDiagram | null>;
  pickFromLibrary(): Promise<PresentationDiagramStart | null>;
  importFile(): Promise<PresentationDiagramStart | null>;
  loadPreview(previewId: string): Promise<Blob | undefined>;
  toDrawio(source: unknown, title: string): Promise<string>;
  renderPreview?(source: unknown, title?: string): Promise<PresentationRenderedDiagramPreview | null>;
  storePreview?(image: Blob): Promise<string>;
  settle?(diagram: PresentationEmbeddedDiagram, applied: boolean): void;
  diagramFromShapes?(get: (type: string) => string): Promise<PresentationEmbeddedDiagram | null>;
}

// hosts.ts:64-69 — SVC-BLOB through a host
interface PresentationImageHost {
  putAttachment(data: Blob, mimeType: string): Promise<StoredPicture>;   // { id, mimeType, sizeBytes }
  loadAttachment(id: string): Promise<Blob | undefined>;
}

// export/index.ts:19 — SVC-IO
type ExportFormatId = 'pptx' | 'pdf' | 'pdf-notes';
function exportPresentation(format: ExportFormatId, content: PresentationContent,
  opts: ExportHosts & { title: string }): Promise<ExportResult>;            // { blob, fileName, message, notes }

// index.ts — schema and safety
function migratePresentation(raw: unknown): MigratePresentationResult;
function presentationSchemaFor(content: unknown): 1;                       // becomes 1 | 2 in AE-P6
function preparePresentation(raw: unknown): PreparedPresentation;          // protected view for newer/damaged content
```

Proposed interface requirements (IDs PRS-IF-NNN; criteria AC-PRS-9NN):

| ID | Contract | Status |
|---|---|---|
| PRS-IF-001 | `PresentationDiagramHost` stays structurally assignable to and from document-studio `DiagramHost` | Done (presentation-hosts.test.ts) |
| PRS-IF-002 | `exportPresentation` returns a report listing every approximation; it never throws without a readable message | Done (export/index.ts:18-27; ExportMenu.test.tsx) |
| PRS-IF-003 | Text extractor for SVC-SEARCH: `extractPresentationText(content: PresentationContent): { title?: string; body: string; parts: Array<{ slideId: string; text: string }> }`, pure and synchronous, exported from the package without pulling the export chunk. The app registers it with SVC-SEARCH by wrapping it as one DSH-IF-001 `TextExtractor` (MODULE_09 §9.1), mapping its parts to `ExtractedField` entries with a `locator`; there is no module-specific search interface. | Absent (AE-P6, consumed in AE-P12) |
| PRS-IF-004 | References: a `DiagramElement.sourceRef` uses the `ItemRef` type defined by SVC-REF (ADR-0018); M03 defines no reference type of its own | Absent (AE-P12) |
| PRS-IF-005 | Submission packaging for INT-04 uses SVC-REF `snapshot` mode; M03 provides no submission API of its own | Absent (AE-P9) |

Permission checks for anything crossing a host boundary are SVC-PERM's; M03 adds none.

## 10. Acceptance criteria

This table is the canonical wording of the module's criteria; [ACCEPTANCE_CRITERIA.md](ACCEPTANCE_CRITERIA.md) §4 only summarises them and owns the cross-cutting criteria (AC-SYS, AC-SEC, AC-PERF, AC-INT and others) (ACCEPTANCE_CRITERIA §1.2). A change to a criterion here is made in ACCEPTANCE_CRITERIA §4 in the same edit. Phase for all rows: AE-P6 unless stated. "Re-verify" = yes for items already Done in v0.2.

| AC | Verifies | Criterion | Evidence type | Phase | Re-verify |
|---|---|---|---|---|---|
| AC-PRS-001 | PRS-FR-001 | Creating, duplicating (one and several) and deleting slides each undo and redo in one step, and survive reload | unit + e2e (Chromium, Firefox, WebKit) | AE-P6 | yes |
| AC-PRS-002 | PRS-FR-002 | Slides reorder by drag, Alt+arrow keys and menu; order survives reload and appears in PPTX and PDF | unit + e2e (3 browsers + mobile Chromium) | AE-P6 | yes |
| AC-PRS-003 | PRS-FR-003 | Navigator lists every slide with a thumbnail, is keyboard operable, and stays responsive at 150 slides (PERF-007) | e2e + measurement | AE-P6 | yes |
| AC-PRS-004 | PRS-FR-004 | Each of the 8 layouts can be applied; change layout keeps placeholder content by id | unit + e2e | AE-P6 | yes |
| AC-PRS-005 | PRS-FR-005 | Editing the master changes every slide that uses it; the PPTX opened in PowerPoint shows the master as a master (scope per D-19) | unit + external application check (dated) | AE-P6 | yes |
| AC-PRS-006 | PRS-FR-006 | Every built-in theme and template opens editable at schema 1 in both sizes; user templates work if D-19 approves | unit + e2e | AE-P6 | yes |
| AC-PRS-007 | PRS-FR-007 | Switching 16:9 ↔ 4:3 rescales objects by the documented rules and the exports use the new size | unit | AE-P6 | yes |
| AC-PRS-008 | PRS-FR-008 | Hidden slides are skipped in the show, kept in PPTX with `show="0"`, and left out of the PDF | unit + e2e | AE-P6 | yes |
| AC-PRS-020 | PRS-FR-020 | Text boxes edit rich text; "resize to fit" heights are correct on slides not currently shown (TD-61 closed) | unit + e2e | AE-P6 | yes |
| AC-PRS-021 | PRS-FR-021 | Pictures insert by file, paste and drop in Chromium, Firefox and WebKit; crop by handles and by numbers; files over 15 MB are refused with a message | unit + e2e (3 browsers) | AE-P6 | yes |
| AC-PRS-022 | PRS-FR-022 | Cells can be merged and split; merged cells round-trip through save, PPTX and PDF | unit + e2e + external application check | AE-P6 | no |
| AC-PRS-023 | PRS-FR-023 | All 5 chart types render on screen, in PDF, and as native charts in PowerPoint and LibreOffice (dated record) | unit + external application check | AE-P6 | yes |
| AC-PRS-024 | PRS-FR-024 | All 23 shape presets render identically on screen, in PDF and (by visual comparison) in PPTX | unit + external application check | AE-P6 | yes |
| AC-PRS-025 | PRS-FR-025 | A diagram inserted from each source (new, template, library, .drawio file) edits in place; the PPTX picture carries the editable `dcos-diagram` data and imports back into Diagram Studio | integration + e2e | AE-P6 | yes |
| AC-PRS-026 | PRS-FR-026 | Solid, gradient and picture backgrounds apply to one and to all slides and export with the same fit | unit + external application check | AE-P6 | yes |
| AC-PRS-027 | PRS-FR-027 | Guides snap to slide edges and centre, other objects and equal spacing; Alt disables snapping; works for groups | unit + e2e | AE-P6 | yes |
| AC-PRS-028 | PRS-FR-028 | The selection pane lists all objects front to back; rename, hide, lock and reorder from the pane are saved and exported (names as PPTX object names) | unit + e2e | AE-P6 | no |
| AC-PRS-029 | PRS-FR-029 | Objects group and ungroup (nested allowed); a group moves, resizes and rotates as one; groups export as PPTX group shapes and are seen as groups in PowerPoint | unit + e2e + external application check | AE-P6 | no |
| AC-PRS-030 | PRS-FR-030 | Several selected objects resize together proportionally | unit + e2e | AE-P6 | no |
| AC-PRS-040 | PRS-FR-040 | Notes save per slide, appear in the presenter view, in PPTX notes slides and in "PDF with speaker notes" | unit + e2e | AE-P6 | yes |
| AC-PRS-041 | PRS-FR-041 | Presenter view drives the audience window on a real second screen or projector, on macOS and Windows, with a dated record; the handshake failure path never shows notes to the audience without the user's choice | e2e + manual on real hardware (dated) | AE-P6 (webviews: AE-P14) | yes |
| AC-PRS-042 | PRS-FR-042 | All 6 transitions play in the show; reduced motion makes them cuts; PowerPoint plays the exported transitions (dated) | unit + external application check | AE-P6 | yes |
| AC-PRS-043 | PRS-FR-043 | Entrance, emphasis and exit effects play in the show in the defined order and PowerPoint plays the exported `p:timing` the same way (dated) | unit + e2e + external application check | AE-P6 | partly (entrance: yes) |
| AC-PRS-044 | PRS-FR-044 | The timeline lists every animation on the slide with trigger, offset and duration; reordering and retiming there changes the show and the PPTX; fully keyboard operable | unit + e2e | AE-P6 | no |
| AC-PRS-045 | PRS-FR-045 | Every documented show key works in Chromium, Firefox and WebKit | unit + e2e (3 browsers) | AE-P6 | yes |
| AC-PRS-046 | PRS-FR-046 | The show enters full screen in Chromium, Firefox and desktop Safari, and falls back with a message where refused | e2e + manual (Safari) | AE-P6 | yes |
| AC-PRS-047 | PRS-FR-047 | Auto-advance timings play in the show and export to PPTX (only if in scope under D-19) | unit + external application check | AE-P6 | no |
| AC-PRS-060 | PRS-FR-060 | The sample presentation (all element types, notes, transitions, animations, groups) exports to PPTX that passes xmllint on every part and opens without a repair prompt in PowerPoint and LibreOffice Impress (dated) | integration + external application check | AE-P6 | yes |
| AC-PRS-061 | PRS-FR-061 | PDF export keeps Latin, Greek, Cyrillic, Devanagari and CJK sample text as selectable text (no "?"), verified in an independent PDF reader (dated) | unit + external application check | AE-P6 | yes |
| AC-PRS-062 | PRS-FR-062 | Dated records exist in docs/compatibility for PowerPoint, Keynote and LibreOffice (owner may waive any unavailable application under D-22, disclosed in known limitations) | external application check (dated) | AE-P6 | no |
| AC-PRS-063 | PRS-FR-063 | A test enumerates every ribbon and menu control and proves each either acts or is disabled with a reason | unit + e2e | AE-P6 | yes |
| AC-PRS-064 | PRS-FR-064 | (Only if D-19 approves) PPTX import creates a new presentation with an import report; oversized or zip-bomb files are refused within caps | unit + integration | AE-P6 | no |
| AC-PRS-501 | PRS-NFR-001 | PERF-007 and PERF-008 measured on the reference hardware and within the approved targets | measurement | AE-P6 | no |
| AC-PRS-502 | PRS-NFR-002 | A schema-2 presentation opens read-only in the schema-1 build (via the upgrade test) and content using no schema-2 feature is still saved as schema 1 | unit + upgrade test (real browser) | AE-P6 | partly |
| AC-PRS-503 | PRS-NFR-003 | Save, reload, version restore, trash, restore and backup into an empty profile keep the presentation intact | e2e | AE-P6 | yes |
| AC-PRS-504 | PRS-NFR-004 | e2e/privacy.spec.ts covers creating, editing, showing and exporting a presentation, with zero cross-origin requests | e2e (3 browsers) | AE-P6 | no |
| AC-PRS-505 | PRS-NFR-005 | After the first visit, a presentation can be opened, edited, shown and exported offline | e2e (Chromium; others where Playwright supports offline) | AE-P6 | no |
| AC-PRS-506 | PRS-NFR-006 | All presentation e2e specs pass in CI on Chromium, Firefox and WebKit | e2e (CI) | AE-P6 | no |
| AC-PRS-507 | PRS-NFR-007 | Every approximation in the PPTX and PDF writers has a test asserting its message | unit | AE-P6 | yes |
| AC-PRS-508 | PRS-NFR-008 | Oversized pictures and (if any) import files are refused with a message before decoding | unit | AE-P6 | yes |
| AC-PRS-509 | PRS-NFR-009 | boundaries.test.ts passes with presentation-studio importing only `@dcos/ui` | unit | AE-P6 | yes |
| AC-PRS-510 | PRS-NFR-010 | axe reports no serious or critical violation on editor, show and presenter view (if D-25 approves); keyboard-only script completes a full build-and-present task | e2e + manual | AE-P6 | partly |
| AC-PRS-511 | PRS-NFR-011 | New slides and elements get UUIDs; the fallback path is covered by a test | unit | AE-P6 | yes |
| AC-PRS-701 | PRS-UX-001 | Existing ribbon tabs keep their names and order; every control added in AE-P6 sits in the tab PRS-UX-001 names (arrange and group on Home, timeline on Animations), checked in a dated UI review | unit (ribbon tests) + manual (dated) | AE-P6 | yes |
| AC-PRS-702 | PRS-UX-002 | Selection pane meets the PRS-UX-002 description, keyboard and screen-reader operable | e2e + manual | AE-P6 | no |
| AC-PRS-703 | PRS-UX-003 | Timeline pane meets the PRS-UX-003 description; canvas badges match the order | e2e | AE-P6 | no |
| AC-PRS-704 | PRS-UX-004 | A keyboard-only script reaches and operates every editor control, including the selection pane and timeline; menus follow the shared `Menu` keyboard pattern | e2e + manual | AE-P6 | partly |
| AC-PRS-705 | PRS-UX-005 | Every editing action in AC-PRS-001…030 has a touch path tested in mobile Chromium | e2e (mobile Chromium) | AE-P6 | partly |
| AC-PRS-706 | PRS-UX-006 | Editor chrome, show and presenter view are checked in the app's light and dark themes (dated screenshots); chrome text and controls meet the AE-P3 contrast targets, so the 2.77:1 dark danger defect is gone | e2e (screenshots) + manual (dated) | AE-P6 | no |
| AC-PRS-707 | PRS-UX-007 | Covered by AC-PRS-063 (every control acts or is disabled with a reason) | unit + e2e | AE-P6 | yes |
| AC-PRS-708 | PRS-UX-008 | Exporting content that will be approximated shows the list before the file is written | e2e | AE-P6 | no |
| AC-PRS-709 | PRS-UX-009 | New panes use SVC-UI components and tokens; no presentation popover extends past the viewport at phone, tablet and desktop widths (TD-64 closed) | unit + e2e | AE-P6 | no |
| AC-PRS-901 | PRS-IF-001 | presentation-hosts.test.ts passes both assignability directions | integration | AE-P6 | yes |
| AC-PRS-902 | PRS-IF-002 | Each export format, forced to fail in a unit test, returns or throws a readable message; every approximation is listed in the report (with AC-PRS-507) | unit | AE-P6 | yes |
| AC-PRS-903 | PRS-IF-003 | The extractor returns all slide, note, table and chart text for the sample presentation and does not import the export chunk | unit | AE-P6 | no |
| AC-PRS-904 | PRS-IF-004 | A diagram with `sourceRef` whose source is deleted renders normally and shows a "source missing" state for "update from source" | unit + e2e | AE-P12 | no |
| AC-PRS-905 | PRS-IF-005 | Covered by AC-INT-04: a submitted presentation is an SVC-REF `snapshot`; M03 exposes no submission API of its own | e2e + integration | AE-P9 | no |

## 11. Test strategy

| Kind | Today | Add in AE-P6 |
|---|---|---|
| Unit (Vitest) | 32 test files in the package, about 390 cases by static count (e.g. editor.test.tsx 45, content.test.tsx 29, show.test.tsx 26, pptx.test.ts 25) | Group geometry, hit testing, z-order inside groups; schema-2 vocabulary and `presentationSchemaFor` (1 vs 2); migration 1→2; animation classes in show/sequence.ts; timeline model; extractor |
| Integration | tests/integration/presentation-export.test.ts, presentation-hosts.test.ts, boundaries.test.ts | PPTX golden for groups and new timing; schema-2 backup validation through local-storage backup.ts |
| Browser (Playwright) | 10 specs e2e/presentation-*.spec.ts (about 38 tests) plus menu-height.spec.ts; Chromium, WebKit, mobile Chromium; Firefox only in CI, failing (PR #1) | Selection pane, grouping, timeline; Firefox green in CI (depends on PR #1 / D-03) |
| End-to-end | e2e/presentation-cross-feature.spec.ts (save, reload, version restore, trash, show, three exports, backup into an empty profile) | Extend with groups, timeline and schema-2 content |
| Persistence | Platform tests (local-storage 109 tests) plus cross-feature e2e | Schema-2 save/reload; old-build read-only via scripts/upgrade-test.mjs |
| Offline | None for presentations | Add presentations to e2e/storage.chromium-only.spec.ts (AC-PRS-505) |
| Privacy | None for presentations | Add to e2e/privacy.spec.ts (AC-PRS-504) |
| Import/export | Structure tests, xmllint on 66 parts (recorded), PDFKit only | Dated external checks: PowerPoint, Keynote, LibreOffice Impress, an independent PDF reader; animation/transition playback; non-Latin PDF text |
| Regression | Round 3 regression tests (fail-before logs lost, R-035) | Keep the sample generator script in the repository (today it is kept only in the session scratchpad, `phase7/final/samples-script/`, per docs/compatibility/phase7-2026-11-15/README.md) so external checks can be repeated |
| Accessibility | Keyboard tests; reduced motion | axe on editor/show/presenter (D-25); screen-reader pass before AE-P15 |
| Performance | None | 150-slide fixture; PERF-007/008 measured with the AE-P3 harness, before and after virtualisation |

## 12. Known risks

From the register (brief §10):

| Risk | Why it matters here |
|---|---|
| R-017 | PPTX never opened in PowerPoint or Keynote; native charts and `p:timing` may be rejected (TD-55) |
| R-018 | PptxGenJS's one-master limit (TD-56) blocks multiple masters without a custom writer |
| R-001 | Firefox never green; presentation specs changed by unmerged PR #1 |
| R-002 / R-003 | A schema-2 build deployed to Pages reaches every visitor at once; cached older builds open schema-2 presentations read-only |
| R-030 | Embedded PDF fonts must be bundled, never fetched from a CDN |
| R-034 | No performance baseline for presentations |
| R-035 | Round 3 fail-before logs and the Round 3 samples were lost when the scratchpad was cleared; the final sample-generation script is still kept only in the scratchpad (compatibility README), so it can be lost the same way |
| R-036 | New panes inherit design-system accessibility debts unless AE-P3 lands first |
| R-039 | Presenter mode and full screen in webviews (TD-58) |
| R-020 | Confusion between "v0.2 Phase 7" (this package) and "AE-P6" (its completion) |
| R-098 | External compatibility checks depend on software the owner must provide (D-22: PowerPoint, Keynote, LibreOffice); without it AC-PRS-062 cannot pass |
| R-099 | Features between phases reach public users through the live site (main deploys to Pages); new AE-P6 controls must obey PRS-FR-063 before they are merged |
| R-100 | pptxgenjs 4.0.1 is pinned exactly and its output is post-processed by exact pattern (DEPENDENCIES.md:76) |

Module-specific risks. RISK_REGISTER.md §3.7 and §5 have registered these with the numbers proposed here (R-060 to R-062). R-062 overlaps the general external-check risk R-098; it is kept because it names the specific gap.

| Proposed ID | Risk | L | I | Mitigation |
|---|---|---|---|---|
| R-060 | Group geometry (rotation inside rotated groups, resize of mixed content) is harder than it looks and can corrupt layout on export | M | M | Pure geometry module with property-style unit tests; PPTX group transforms checked in PowerPoint |
| R-061 | Font embedding makes the PDF export chunk and the PWA precache much larger (precache limit 6 MiB per file, apps/web/vite.config.ts:40) | M | M | Subset fonts per script; load on demand; measure (PERF-002) |
| R-062 | No access to PowerPoint or Keynote (PowerPoint not installed; Keynote did not respond on 2026-11-15) leaves PRS-FR-062 unmeetable | H | H | Owner decision D-22; LibreOffice as a minimum; disclose any waiver |
