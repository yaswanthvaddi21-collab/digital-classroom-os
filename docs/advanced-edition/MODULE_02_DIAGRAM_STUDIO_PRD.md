# Module 02: Advanced Diagram Studio (PRD)

This document defines what the Advanced Diagram Studio (module M02, prefix DGM) must do to meet the owner's Advanced Edition brief (Module 02), records how much of it already exists in `packages/diagram-studio` after the v0.2 programme, and lists the remaining work, acceptance criteria, tests and risks for phase AE-P5. It is a planning document: nothing here has been built or re-run in AE-P1.

**Status:** AE-P1 draft for owner approval (2026-11-15)

**Audited at:** HEAD `edc2672` on branch `advanced/phase1-audit` (no commits of its own). No test suite, build or browser was run for this document; every "Done" relies on a test file plus the recorded local verification of 2026-11-15 (RELEASE_GAPS.md §11, lines 251-264).

**Related documents (this folder):**
[Roadmap](ADVANCED_EDITION_PRODUCT_ROADMAP.md) ·
[Module 01 Document Studio](MODULE_01_DOCUMENT_STUDIO_PRD.md) ·
[Module 03 Presentation Studio](MODULE_03_PRESENTATION_STUDIO_PRD.md) ·
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

**Conventions.** Status words are **Done**, **Partial**, **Stub**, **Absent** and **Unverified**, as defined in the canonical planning brief. "Done" means Done in v0.2 with a test file and the 2026-11-15 recorded run; it does not mean the item meets its Advanced acceptance criterion. Every Done item carries "re-verify: yes" and must pass its AC-DGM criterion again in AE-P5. Phases are written AE-P1 … AE-P16 (new programme) or "v0.2 Phase n" (earlier programme). Paths without a prefix are relative to `packages/diagram-studio/src/`.

---

## Current state

### What earlier commits delivered towards AE-P5

`git log -- packages/diagram-studio` lists seven commits:

| Commit | Date | What it delivered for M02 |
|---|---|---|
| 20d3f4d | 2026-11-13 (baseline, tag `v0.1.0-baseline`) | v0.1.0 Diagram Studio foundation |
| ff53b49 | 2026-11-13 | v0.2 stabilisation (data safety, regression net) |
| f50b0d4 | 2026-11-13 | UML/ER shapes, first diagrams.net import, editable diagrams in documents |
| 2448a6c | 2026-11-13 | draw.io-style Quick Connect |
| ea7f316 | 2026-11-13 | Review fixes: storage safety, diagram embeds, draw.io import |
| 8f772ba | 2026-11-14 | v0.2 Phase 5 Diagram Studio: canvas, connectors, shape library, draw.io features, vector export (ADR 0012) |
| 650cf63 | 2026-11-14 | v0.2 Phase 6 document–diagram integration: preview rendering, clipboard format (ADR 0013, INT-01) |

edc2672 (v0.2 Phase 7) did not modify the package; Presentation Studio uses it only through `PresentationDiagramHost` (INT-02). These commits are a head start for AE-P5, not a pass.

Package size: 66 non-test source files (13,019 lines) and 29 test files (5,557 lines) in `src/` (wc -l). `DiagramEditor.tsx` now has 287 lines; FEATURE_STATUS line references such as `DiagramEditor.tsx:711-750` point to ea7f316 and are stale.

### Status table (copied from the canonical planning brief §2, M02)

| ID | Bullet | Status | Evidence / limits |
|---|---|---|---|
| DGM-FR-001 | Flowcharts | Done | templates.ts:91-113; library/categories.ts:21-38 |
| DGM-FR-002 | Tree | Done | layout.ts:29 layoutTree |
| DGM-FR-003 | Mind maps | Done | library/mindmap.ts:144 |
| DGM-FR-004 | UML | Done (5 types) | class, sequence, activity, state, use case. No component or deployment diagrams |
| DGM-FR-005 | ER | Done | erEntity compartments; crow's-foot markers |
| DGM-FR-006 | Org charts | Done (generic boxes) | templates.ts:139-147 |
| DGM-FR-007 | Network | Done | kinds.ts:30-40. Stencil names not checked in diagrams.net (TD-46) |
| DGM-FR-008 | Venn | Partial | Template only (templates.ts:178-194) |
| DGM-FR-009 | Timelines | Done | library/timeline.ts:94 |
| DGM-FR-010 | Business process (BPMN) | Done (approximations) | kinds.ts:10-21. Lanes do not resize; no event symbols |
| DGM-FR-011 | Hierarchical | Done | templates.ts:149-157 |
| DGM-FR-012 | Concept maps | **Absent** | grep finds nothing |
| DGM-FR-020…031 | Infinite canvas, zoom/pan, grid/snap, minimap, full screen, multi-select, group, lock, layers, align/distribute, copy/paste, shortcuts | Done (all 12) | DiagramEditor.tsx:193-252; canvasModel.ts; e2e/diagram-canvas.spec.ts. The minimap is hidden at 640 px and below |
| DGM-FR-040…047 | Quick Connect: arrows, click-create, drag-connect, palette, preview, auto-position, zoom tracking, keyboard/touch | Done (all 8) | QuickConnect.tsx; e2e/quick-connect*.spec.ts. **Fidelity to the "supplied" diagrams.net reference is Unverified: the reference never arrived (RELEASE_GAPS.md:78).** Touch is automated in mobile Chromium only. The palette has 12 fixed shapes and does not change with context |
| DGM-FR-060…066 | Straight, curved, elbow, orthogonal, arrowheads (11), connection points (8 plus floating), labels (1 per connector) | Done | edges.tsx:70-87; connect/geometry.ts |
| DGM-FR-067 | Automatic rerouting | Partial | Floating ends only; no obstacle avoidance |
| DGM-FR-080 | Automatic layouts | Partial | Tree, mind map and timeline only |
| DGM-FR-081 | Smart guides | **Absent** | Grid snap only. presentation-studio/src/editor/guides.ts can be adapted; do not copy React Flow's Pro example |
| DGM-FR-082 | Shape properties | Partial | No editor controls for position, size, rotation, opacity, font or alignment (TD-43) |
| DGM-FR-083 | Custom styles | Partial | Fixed palettes (Inspector.tsx:22-24); 8 connector presets |
| DGM-FR-084 | Reusable components | **Absent** | No user library or "save as template" |
| DGM-FR-085 | Multiple pages | **Absent** | DiagramContent has no pages; import takes page 1 with a note (drawio.ts:404-422) |
| DGM-FR-086 | Templates | Done | 18 built-in, 7 of them schema 3 |
| DGM-FR-100 | Import .drawio | Done (internal corpus) | drawio.ts:272-391; drawio-corpus.test.ts (10 hand-written fixtures). **No file saved by diagrams.net itself has been tested (TD-46)** |
| DGM-FR-101 | Import diagrams.net XML | Done (same caveat) | drawio.ts:375-382 |
| DGM-FR-102 | Export editable .drawio | Partial | Round-trip checked by our own importer only. **Never opened in diagrams.net (RELEASE_GAPS.md:170)** |
| DGM-FR-103 | Preserve metadata | Done | drawioFeatures.ts:327-431 |
| DGM-FR-104 | Links and custom properties | Done | Dropped on connectors, with a note |
| DGM-FR-105 | Swimlanes and ER tables | Done (approximations, each noted) | drawio.ts:516-583 |
| DGM-FR-106 | Report unsupported elements | Done | drawioFeatures.ts:48-87 (about 40 counted kinds) |
| DGM-FR-120 | PNG | Done | vector/raster.ts (16,777,216 px cap; the cap constants are defined in export.ts:11-12 and imported by raster.ts:7) |
| DGM-FR-121 | SVG | Done | vector/renderSvg.tsx:627 |
| DGM-FR-122 | PDF | Done | vector/pdf.ts:62. WinAnsi fonts only (TD-45) |
| DGM-FR-123 | Native .dcosdiagram | Done | native.ts:20-26 (64 MB cap) |

- Schema: `DIAGRAM_SCHEMA = 3` (types.ts:221), chosen per save (ADR 0012): content that uses only the schema-2 vocabulary (compat.ts `SCHEMA2_VOCABULARY`) is stored as 2; newer content opens read-only (editor/useDiagramState.ts:24). Adding pages or styles means schema 4.
- Node and edge ids are "n-"/"e-" plus 8 hex characters (editor/mutations.ts:13), which is weak for merging.
- Performance: pass/fail time limits only (tests/integration/large-diagram.test.ts:17-19; e2e/diagram-large.spec.ts at 500 shapes). Nothing is measured.
- Security gap: a `.drawio` import has no size cap and no inflate output cap (drawio.ts:280; native.ts:230-242 applies the 64 MB check only to the JSON path).
- TD-42: a dead html-to-image export is still public (index.ts:6).

Tally of the 58 brief bullets (the grouped rows expanded): 48 Done (including qualified "Done (…)" rows), 6 Partial (008, 067, 080, 082, 083, 102), 4 Absent (012, 081, 084, 085), and the Quick Connect umbrella "reproduce the supplied diagrams.net interaction" Unverified (DGM-FR-048 below).

### Stale statements to avoid (scheduled for correction in AE-P2)

- docs/DATABASE.md:43 and ADR 0006 §6 say diagram schema 2; the code has 3 (types.ts:221).
- FEATURE_STATUS diagram rows cite ea7f316 line numbers (for example DiagramEditor.tsx:711-750, QuickConnect.tsx:151-241).
- FEATURE_STATUS.md:200 says the Tauri CSP breaks diagram PNG/SVG export through export.ts:33; that refers to the dead html-to-image path (TD-42). Whether the current vector path works in Tauri is Unverified, because the desktop shell has never been built.

---

## 1. Product objectives

1. **A professional diagram editor for teaching and coursework**: every diagram type in the brief, drawn quickly with Quick Connect and the shape library, offline, on every supported platform.
2. **Close the four Absent bullets**: concept maps (DGM-FR-012), smart guides (DGM-FR-081), reusable components (DGM-FR-084) and multiple pages (DGM-FR-085), within the scope the owner sets under D-21.
3. **Finish the Partial bullets**: Venn depth (DGM-FR-008), obstacle-aware rerouting (DGM-FR-067), general automatic layout (DGM-FR-080), full shape-property controls (DGM-FR-082, TD-43) and saved custom styles (DGM-FR-083).
4. **Prove diagrams.net compatibility with dated external checks**: export opened and edited in diagrams.net, and real files saved by diagrams.net imported (DGM-FR-100…102, TD-46, D-22). Settle Quick Connect fidelity against a supplied reference, or record the owner's acceptance of the current behaviour (DGM-FR-048, D-22).
5. **Measure, not just bound, performance** at the PERF-006 sizes.
6. **Harden imports** (size and inflate caps) and **prepare for collaboration** (longer ids, page model, stable references), without breaking documents and presentations that embed diagrams (INT-01, INT-02).
7. **Keep everything that works today working**, including the read-only view for newer diagrams and every loss note.

Out of scope for M02: live co-editing of diagrams (M07; D-16 proposes documents only for v1.0.0); embedding behaviour inside documents and slides (owned by M01/M03 through INT-01/INT-02, but the host contract is defined here).

## 2. User stories

| ID | As a… | I want… | So that… | Requirements |
|---|---|---|---|---|
| US-DGM-01 | student | to build a flowchart by clicking the blue arrows and picking shapes | I spend time on content, not on dragging | DGM-FR-001, 040–047 |
| US-DGM-02 | teacher | to open a `.drawio` file a colleague made in diagrams.net, edit it and send it back | I can work with people who use diagrams.net | DGM-FR-100–106 |
| US-DGM-03 | student | to make a concept map with labelled links between ideas | I can revise a topic visually | DGM-FR-012, 066 |
| US-DGM-04 | teacher | to keep several related diagrams as pages in one file | a lesson's diagrams stay together | DGM-FR-085 |
| US-DGM-05 | teacher | to save a set of shapes as my own component and reuse it | I draw the same lab apparatus once | DGM-FR-084 |
| US-DGM-06 | any user | to see alignment guides while dragging | my diagram looks tidy without a grid | DGM-FR-081 |
| US-DGM-07 | any user | to tidy a messy diagram automatically, with lines that avoid shapes | large diagrams stay readable | DGM-FR-067, 080 |
| US-DGM-08 | any user | to set exact size, position, rotation, opacity, font and alignment, and save a style | I get consistent results | DGM-FR-082, 083 |
| US-DGM-09 | student | to export PNG, SVG or PDF that keeps non-Latin labels | I can hand in diagrams in my own language | DGM-FR-120–122 |
| US-DGM-10 | tablet user | to use Quick Connect and multi-select by touch | I can draw without a mouse | DGM-FR-047 |
| US-DGM-11 | keyboard user | to create, connect and move shapes from the keyboard | I can use the studio without a pointer | DGM-FR-031, 047 |
| US-DGM-12 | document or slide author | to edit a diagram inside my document or slide and update it from the original | my materials stay consistent | DGM-IF-002, DGM-IF-007 (INT-01/02) |

## 3. Functional requirements

Each row keeps the canonical ID and status; the grouped rows of the status table are expanded into their individual IDs in the canonical order. New requirements use free numbers in the right block and are marked "(new)" or "(beyond the brief)".

### 3.1 Diagram types (001–019)

| ID | Requirement | Status | Evidence | Gap to close in AE-P5 | Decision |
|---|---|---|---|---|---|
| DGM-FR-001 | Flowcharts | Done | templates.ts:91-113; library/categories.ts:21-38; e2e/diagram.spec.ts; e2e/diagram-shapes.spec.ts:208 | Re-verify | — |
| DGM-FR-002 | Tree diagrams | Done | templates.ts:115-123; layout.ts:29 layoutTree; diagram.test.ts | Re-verify | — |
| DGM-FR-003 | Mind maps | Done | templates.ts:125-137; library/templates.ts:42,289; library/mindmap.ts:144; library/layouts.test.ts; e2e/diagram-shapes.spec.ts:128 | Re-verify | — |
| DGM-FR-004 | UML diagrams | Done (5 types) | templates.ts:196; library/templates.ts:291-294; library/kinds.ts:23-28 | Component, deployment, object, package diagram templates (scope) | D-21 |
| DGM-FR-005 | ER diagrams | Done | templates.ts:215; types.ts erEntity compartments; crow's-foot markers; drawio.test.ts | Entities are text compartments, not per-row cells; keep or extend (scope) | D-21 |
| DGM-FR-006 | Organisational charts | Done (generic boxes) | templates.ts:139-147; layoutTree | Role/photo cards (scope) | D-21 |
| DGM-FR-007 | Network diagrams | Done | library/kinds.ts:30-40; library/categories.ts:84-100; templates.ts:232-236 | Exported `mxgraph.networks.*` names checked in diagrams.net (TD-46) | D-22 |
| DGM-FR-008 | Venn diagrams | Partial | templates.ts:178-194 (three translucent circles); library/categories.ts:111-115 | Exists: template and circles. Missing (per D-21): a Venn tool that adds and arranges sets and labels regions | D-21 |
| DGM-FR-009 | Timelines | Done | library/timeline.ts:94; templates.ts:171-176; layouts.test.ts; e2e/diagram-shapes.spec.ts:158 | Re-verify (Arrange may remove lines between non-neighbours, with toast and undo) | — |
| DGM-FR-010 | Business process diagrams | Done (approximations) | library/kinds.ts:10-21; library/containers.ts; library/templates.ts:290 | Lanes resize with their pool; event symbols (timer, message) (scope) | D-21 |
| DGM-FR-011 | Hierarchical diagrams | Done | templates.ts:149-157; layout.ts:29 | Re-verify | — |
| DGM-FR-012 | Concept maps | **Absent** | grep finds nothing in packages, apps or docs | Template plus category at minimum; labelled-link conventions; layout via DGM-FR-080 (depth per D-21) | D-21 |
| DGM-FR-013 (beyond the brief) | Searchable shape library | Done | library/categories.ts:20-116 (9 categories), :150 searchShapes; e2e/diagram-shapes.spec.ts:97 | Add concept-map, Venn and user-component categories | — |

### 3.2 Canvas (020–039)

| ID | Requirement | Status | Evidence | Gap to close in AE-P5 | Decision |
|---|---|---|---|---|---|
| DGM-FR-020 | Infinite canvas | Done | DiagramEditor.tsx:193-245 (no translateExtent/nodeExtent) | Re-verify | — |
| DGM-FR-021 | Zoom and pan | Done | DiagramEditor.tsx:239-240 (0.1–4), :250 Controls; editor/canvasShortcuts.ts:31-34; e2e/diagram-canvas.spec.ts:215 | Re-verify | — |
| DGM-FR-022 | Grid and snapping | Done | DiagramEditor.tsx:234-235 (10 px), :249; editor/Toolbar.tsx:88-98 | Object snapping is DGM-FR-081 | — |
| DGM-FR-023 | Minimap | Done | DiagramEditor.tsx:252; diagramCss.ts:38 (hidden at ≤ 640 px) | Decide phone behaviour (UX) | — |
| DGM-FR-024 | Full-screen mode | Done | editor/useCanvas.ts:46-57, 566-577; canvasShortcuts.ts:35; e2e/diagram-canvas.spec.ts:215 | Full screen on CI is Unverified: the e2e job is red on main, and PR #1 (unmerged) records that a full-screen Firefox window is screen-sized and that headless Linux WebKit can leave full-screen requests unfinished for slide shows (its docs/TESTING.md change); webviews in AE-P14 | — |
| DGM-FR-025 | Multiple selections | Done | DiagramEditor.tsx:241; shortcuts.ts:75; useCanvas.ts:188-221; e2e/diagram-canvas-touch.spec.ts | Touch multi-select automated in mobile Chromium only | — |
| DGM-FR-026 | Group and ungroup | Done | editor/canvasModel.ts:75, :116, :139; canvasShortcuts.ts:18-25; e2e/diagram-canvas.spec.ts:33,83 | Resizing a group does not scale text (decide) | — |
| DGM-FR-027 | Lock and unlock | Done | canvasModel.ts:170; useCanvas.ts:277; canvasShortcuts.ts:26; e2e/diagram-canvas.spec.ts:109 | Re-verify | — |
| DGM-FR-028 | Layers | Done | model.ts:9-14 DiagramLayer; canvasModel.ts:256-345; CanvasOverlays.tsx:126; e2e/diagram-canvas.spec.ts:139 | Connectors have no layer and draw under shapes (decide with multi-page model) | — |
| DGM-FR-029 | Align and distribute | Done | editor/selectionActions.tsx:21-27; mutations.ts:237; canvasModel.ts:187; e2e/diagram-canvas.spec.ts:205 | Distribute uses equal gaps (diagrams.net uses equal centres); document or add both | — |
| DGM-FR-030 | Copy and paste | Done | shortcuts.ts:71-74; canvasShortcuts.ts:17; useCanvas.ts:377-554; editor/clipboard.test.ts; e2e/diagram-canvas.spec.ts:270 | Cut inside the document's diagram dialog untested (docs/audit/TECHNICAL_DEBT.md:133, TD-18); in Firefox on CI, synthetic copy and paste events lost their data until the PR #1 test fix (unmerged) | — |
| DGM-FR-031 | Keyboard shortcuts | Done | editor/shortcuts.ts:44-92; canvasShortcuts.ts:16-37; CanvasOverlays.tsx:25 ShortcutHelp | Add shortcuts for new features; keep the help in sync | — |

### 3.3 Quick Connect (040–059)

| ID | Requirement | Status | Evidence | Gap to close in AE-P5 | Decision |
|---|---|---|---|---|---|
| DGM-FR-040 | Four directional blue arrows | Done | QuickConnect.tsx:246; diagramCss.ts:48-55; e2e/quick-connect.spec.ts:43 | Compare with reference (DGM-FR-048) | D-22 |
| DGM-FR-041 | Click-to-create | Done | QuickConnect.tsx:191, 270; mutations.ts:296; quickConnectGeometry.ts:49; e2e/quick-connect.spec.ts:43 | Re-verify | — |
| DGM-FR-042 | Drag-to-connect | Done | QuickConnect.tsx:192; mutations.ts:319; quickConnectGeometry.ts:70; e2e/quick-connect.spec.ts:121 | Re-verify | — |
| DGM-FR-043 | Floating shape palette | Done | QuickConnect.tsx:25-44, :297; shapeRegistry.ts:193-205 (12 shapes); e2e/quick-connect.spec.ts:151 | Context-aware palette is DGM-FR-049 | — |
| DGM-FR-044 | Connection preview | Done | QuickConnect.tsx:197-198, :345, :347; diagramCss.ts:63-67 | Re-verify | — |
| DGM-FR-045 | Automatic positioning | Done | quickConnectGeometry.ts:38, :49; mutations.ts:283; quickConnectGeometry.test.ts; e2e/diagram-native-file.spec.ts:110 | Re-verify; also use smart guides when placing | — |
| DGM-FR-046 | Zoom and pan tracking | Done | QuickConnect.tsx:67; e2e/quick-connect.spec.ts:79 | Re-verify | — |
| DGM-FR-047 | Keyboard and touch support | Done | shortcuts.ts:46-53; QuickConnect.tsx:16 (450 ms long press), :69-72, :163; connect/paletteNav.ts; e2e/diagram-palette-quick-connect-touch.spec.ts:11,76; e2e/quick-connect-touch.spec.ts:5 | Touch automated in mobile Chromium only; no WebKit touch project; no real device (AE-P14) | D-30 |
| DGM-FR-048 (new) | Reproduce the supplied diagrams.net interaction (the brief's umbrella line) | Unverified | The reference screenshot never arrived (RELEASE_GAPS.md:78); none in backups/ | Owner supplies the reference (screenshot or recording), then a dated side-by-side comparison; or the owner records acceptance of the current behaviour | D-22 |
| DGM-FR-049 (new) | Context-aware Quick Connect palette | Absent | shapeRegistry.ts:193-205 QUICK_PALETTE is fixed | Palette offers shapes from the diagram's dominant category (BPMN, UML, network, ER) plus recent shapes | D-21 |

### 3.4 Connectors (060–079)

| ID | Requirement | Status | Evidence | Gap to close in AE-P5 | Decision |
|---|---|---|---|---|---|
| DGM-FR-060 | Straight | Done | edges.tsx:70; types.ts:89-91; Toolbar.tsx:117 | Re-verify | — |
| DGM-FR-061 | Curved | Done | edges.tsx:73; connect/geometry.ts:320 | Re-verify | — |
| DGM-FR-062 | Elbow | Done | edges.tsx:72 (smoothstep, default); connect/geometry.ts:301 | Re-verify | — |
| DGM-FR-063 | Orthogonal | Done | edges.tsx:71; connect/geometry.ts:255; e2e/diagram-connect.spec.ts:143 | Re-verify | — |
| DGM-FR-064 | Arrowheads | Done | types.ts:95-108 (MARKER_KINDS: 11 values including `none`, so 10 end decorations); edges.tsx:88-95 MarkerDefs; Inspector.tsx:232-250; e2e/diagram-markers.spec.ts | Re-verify | — |
| DGM-FR-065 | Connection points | Done | connect/geometry.ts:141 (8 ports), :182 (floating perimeter ends); model.ts:27; e2e/diagram-connect.spec.ts:105 | Ends on rotated shapes follow the unrotated outline; library kinds use the bounding box | — |
| DGM-FR-066 | Labels | Done | connect/ConnectorEdge.tsx:96, :139; types.ts:122; e2e/diagram-connect.spec.ts:190 | One label per connector; multiple labels (scope, schema 4) | D-21 |
| DGM-FR-067 | Automatic rerouting | Partial | connect/geometry.ts:182; connect/edgeChanges.ts; edgeChanges.test.ts; e2e/diagram-connect.spec.ts:67 | Exists: floating ends re-pick sides; bend points follow drags. Missing: obstacle-avoiding orthogonal routing; reroute after layout | D-21 |

### 3.5 Advanced features (080–099)

| ID | Requirement | Status | Evidence | Gap to close in AE-P5 | Decision |
|---|---|---|---|---|---|
| DGM-FR-080 | Automatic layouts | Partial | layout.ts:29; library/mindmap.ts:144; library/timeline.ts:94; Toolbar.tsx:54-70 | Exists: tree, mind map, timeline. Missing: general layered/force layout for arbitrary diagrams (dagre or original code; elkjs and libavoid-js only with a licence exception) | D-21 |
| DGM-FR-081 | Smart guides | **Absent** | grep finds only the drawio attribute `guides="1"` (drawio.ts:226) | Edge, centre and equal-spacing guides while dragging and resizing; Alt disables; adapted from presentation-studio editor/guides.ts:113-195 (original code), never from React Flow's Pro example | — |
| DGM-FR-082 | Shape properties | Partial | Inspector.tsx:91-156; editor/canvasSections.tsx:189-192 | Exists: text, fill, border, text size/bold/colour, lock, layer, link, tooltip, custom properties. Missing: position and size fields, rotation, opacity, font family, alignment, picture controls (fields already stored, TD-43) | — |
| DGM-FR-083 | Custom styles | Partial | Inspector.tsx:22-24 (12 fills, 10 strokes, 8 text colours); library/presets.tsx:17-26 (8 connector presets) | Free colour picker; copy/paste style; named saved styles; default style per diagram (schema 4 if stored in content) | D-21 |
| DGM-FR-084 | Reusable components | **Absent** | grep finds no user library, scratchpad or "save as template" | Save selection as a component and a diagram as a user template; a per-device user library included in backup; import/export of a library file (format to decide) | D-21 |
| DGM-FR-085 | Multiple pages | **Absent** | types.ts:179-187 (no pages); drawio.ts:404-422 imports one page with a note; `{page}` option never passed (ItemListPage.tsx:56, DiagramDialogs.tsx:129, native.ts:236); drawio.ts:225 writes one `<diagram>` | Page list with add, rename, reorder, delete; import and export all pages; embeds name a page (INT-01/02). Schema 4 | D-21 |
| DGM-FR-086 | Diagram templates | Done | templates.ts:89-241 (blank plus 11); library/templates.ts:288-295 (6); 7 schema 3 (library/templates.ts:301); e2e/diagram-shapes.spec.ts:208 | User templates are DGM-FR-084 | — |
| DGM-FR-087 (beyond the brief) | Read-only view for newer diagrams; never saved over | Done | editor/useDiagramState.ts:24; compat.ts schemaFor; tests/integration/diagram-schema.test.ts; ADR 0012 | Must hold for schema 4 diagrams in the schema-3 (cached live) build | — |

### 3.6 draw.io compatibility (100–119)

| ID | Requirement | Status | Evidence | Gap to close in AE-P5 | Decision |
|---|---|---|---|---|---|
| DGM-FR-100 | Import .drawio | Done (internal corpus) | drawio.ts:272-391; tests/integration/drawio-corpus.test.ts (21 tests, 10 hand-written fixtures in tests/fixtures/drawio) | Corpus of real files saved by diagrams.net (desktop and web, compressed and plain); all pages (DGM-FR-085) | D-22 |
| DGM-FR-101 | Import supported diagrams.net XML | Done (same caveat) | drawio.ts:375-382 (`mxfile` and bare `mxGraphModel`), :350-357 (`UserObject`/`object` wrappers), :396 fromDrawio; native.ts:230-241 | As DGM-FR-100 | D-22 |
| DGM-FR-102 | Export editable .drawio | Partial | drawio.ts:147-230 toDrawio; ExportMenu.tsx:50; drawio.test.ts; tests/golden/diagram-v3/kitchen-sink-v3.drawio | Exists: export round-tripped by our importer. Missing: dated check that exports open and edit correctly in diagrams.net, incl. BPMN and network stencil names (TD-46, RELEASE_GAPS.md:170) | D-22 |
| DGM-FR-103 | Preserve supported metadata | Done | drawioFeatures.ts:327-431; drawio.ts:460-480; drawio-phase5.test.ts; e2e/diagram-drawio-features.spec.ts | External confirmation via DGM-FR-102 check | D-22 |
| DGM-FR-104 | Preserve links and custom properties | Done | drawio.ts:129-138, :350-357; model.ts:49-73 (isSafeLink, ≤ 200 properties); tests/fixtures/drawio/links-properties.drawio | Links/properties on connectors dropped with a note (drawioFeatures.ts:73); keep or support (schema 4) | D-21 |
| DGM-FR-105 | Handle swimlanes and ER tables | Done (approximations, each noted) | drawio.ts:516-583; drawioFeatures.ts:76-77, :119-120; fixtures swimlanes.drawio, tables.drawio | Title band side, lane colour, per-row table cells (scope) | D-21 |
| DGM-FR-106 | Report unsupported elements | Done | drawioFeatures.ts:48-87 (about 40 counted kinds); drawio.ts:114-126 drawioExportNotes; drawioExportNotes.test.ts | Keep every new approximation counted | — |
| DGM-FR-107 (new) | Bounded diagram imports | Absent | No `.drawio` size check (DiagramFiles.tsx:13-24 and DiagramDialogs.tsx:26-37 read `file.text()`); `inflateSync` with no output cap (drawio.ts:280); 64 MB check (counted in characters) on the JSON path only (native.ts:197, reached through readDiagramFile at :231-233) | File-size cap before reading, inflate output cap, cell-count cap, parsing in a worker (TD-40) | — |

### 3.7 Export (120–139)

| ID | Requirement | Status | Evidence | Gap to close in AE-P5 | Decision |
|---|---|---|---|---|---|
| DGM-FR-120 | PNG | Done | vector/raster.ts (1×/2×/3×) with the caps from export.ts:11-12 (16,777,216 px, 16,384 px per side) via cappedPixelRatio (raster.ts:7), :49 pngLossNotes; e2e/diagram-export.spec.ts:131; e2e/diagram-large.spec.ts | Per-page export (DGM-FR-085) | — |
| DGM-FR-121 | SVG | Done | vector/renderSvg.tsx:627 (no foreignObject); renderSvg.test.tsx (30); tests/golden/diagram-v3/kitchen-sink-v3.svg; e2e/diagram-export.spec.ts:49 | Opened in office/design tools (RELEASE_GAPS.md:171) | D-22 |
| DGM-FR-122 | PDF | Done | vector/pdf.ts:62 planPdf (fit, A4 or Letter; fit or tiling; MAX_TILES = 100 at :33) via svg2pdf.js 2.8.1 and jspdf 4.2.1; e2e/diagram-export.spec.ts:96,113 | Embed fonts for non-WinAnsi labels (TD-45); one page per diagram page | — |
| DGM-FR-123 | Native editable format | Done | native.ts:20-26 (`dcos-diagram`, version 1, `.dcosdiagram`, 64 MB); native.test.ts; e2e/diagram-native-file.spec.ts (5) | Native version 2 for pages and components | D-21 |
| DGM-FR-124 (new) | Remove the dead html-to-image export from the public API | Absent (TD-42 open) | index.ts:6 exports exportPng/exportSvg/exportPdf/renderPng/renderPdf/exportSize from export.ts (export.ts:95-134); no caller in apps/web or the other packages (grep; `renderPng` in DiagramDialogs.tsx:421 is the DiagramEditorApi method, not this function). export.ts also holds live helpers (cappedPixelRatio, resolutionNote, MAX_CANVAS_PIXELS/SIDE at :11-33) imported by vector/raster.ts:7 and editor/ExportDialog.tsx:4 | Remove the dead functions and the html-to-image dependency if D-27 approves; move the live helpers out of export.ts first | D-27 |

## 4. Non-functional requirements

Performance numbers are **proposed targets, to be measured** on the reference hardware agreed under D-29.

| ID | Requirement | Target / rule | Today | Links |
|---|---|---|---|---|
| DGM-NFR-001 | Pan/zoom smoothness | ≥ 30 fps on a 1,000-shape diagram (proposed) | Not measured; 500-shape e2e is pass/fail | PERF-006 |
| DGM-NFR-002 | Open time | 2,000-shape diagram opens in ≤ 3 s (proposed) | 2,000 shapes tested outside the browser only (large-diagram.test.ts) | PERF-006 |
| DGM-NFR-003 | Import/export speed | `.drawio` and `.dcosdiagram` of 2,000 shapes within limits recorded as measurements, not only bounds | Bounds only: fromDrawio < 12,000 ms at 2,000 shapes (large-diagram.test.ts:17-19) | PERF-006 |
| DGM-NFR-004 | Memory | Within PERF-008 with a document, diagram and presentation open | Not measured | PERF-008 |
| DGM-NFR-005 | Data safety | No silent overwrite; newer schemas open read-only; schema chosen per save (ADR 0012) | Done for schemas 1–3 | R-003 |
| DGM-NFR-006 | Import safety | Size, inflate and cell caps; parsing off the main thread; unsafe link schemes dropped with a note | Links Done (model.ts:49-73); caps Absent (DGM-FR-107) | SEC, R-025 |
| DGM-NFR-007 | Identifier strength | New node, edge, page and component ids use ≥ 122 random bits (full UUID); existing short ids stay valid | 32 random bits (mutations.ts:13) | R-015 |
| DGM-NFR-008 | Offline and privacy | No network request while editing, importing or exporting | Partial: e2e/privacy.spec.ts:38-48 covers creating, editing, autosave and PNG, PDF and SVG export; not `.drawio` or `.dcosdiagram` export, and no import | SEC |
| DGM-NFR-009 | Accessibility | WCAG 2.2 AA (proposed, A11Y-001); keyboard path for create, connect, select, move, resize, style; shapes have accessible names; reduced motion respected | Keyboard Quick Connect and shortcuts Done; reduced motion in diagramCss.ts:69; no axe; no screen-reader run | A11Y-001, D-25 |
| DGM-NFR-010 | Platform support | Works on the approved PLT matrix; touch verified on a real device | Chromium, WebKit, mobile Chromium; Firefox never green on CI | PLT, D-30 |
| DGM-NFR-011 | Licence policy | No Pro-licensed React Flow code; layout/routing libraries within policy unless D-21 grants an exception | Done: no `proOptions` anywhere in packages/diagram-studio/src (grep); docs/DEPENDENCIES.md:17 records MIT and the attribution link kept visible | DEP, R-016 |
| DGM-NFR-012 | Maintainability | Split `editor/canvasModel.ts` (865 lines) and `editor/useCanvas.ts` (714 lines) before adding pages and components | Over the 500-line guide | brief §8 |

## 5. UI/UX requirements

| ID | Requirement | Today |
|---|---|---|
| DGM-UX-001 | Toolbar, inspector and dialogs use SVC-UI tokens and components | Partial (design system Partial) |
| DGM-UX-002 | Every action has a keyboard path; the shortcut help ("?") lists all of them | Partial: the "?" help lists every registered shortcut (CanvasOverlays.tsx:25; editor/shortcuts.ts:44-92; canvasShortcuts.ts:16-37; e2e/diagram-canvas.spec.ts:215); no audit has checked that every action has a keyboard path |
| DGM-UX-003 | Quick Connect arrows, palette and preview stay readable at every zoom and in dark theme | Partial: arrows keep their size through zoom and pan (QuickConnect.tsx:67; e2e/quick-connect.spec.ts:79); dark theme not tested (the canvas is always light, DiagramEditor.tsx:244) |
| DGM-UX-004 | A page bar (tabs at the bottom, like diagrams.net) for multiple pages, with keyboard navigation | Absent |
| DGM-UX-005 | Inspector shows exact fields (x, y, w, h, rotation, opacity, font, alignment) with units and validation | Absent (TD-43) |
| DGM-UX-006 | Smart guides are thin, high-contrast lines with distance labels; they never block selection | Absent |
| DGM-UX-007 | Import notes appear in one consistent dialog listing counted items; export notes appear in the toast | Done (ItemListPage.tsx, DiagramFiles.tsx, DiagramDialogs.tsx) |
| DGM-UX-008 | At phone width: no minimap, toolbar scrolls, Quick Connect usable by long press; tablet layout checked | Partial (no tablet checks) |
| DGM-UX-009 | User library panel beside the shape library, with search, rename, delete and drag to canvas | Absent |
| DGM-UX-010 | Dark theme keeps diagram colours as authored (paper white) while the chrome follows the theme | Partial: the canvas is always drawn in light mode (`colorMode="light"`, DiagramEditor.tsx:244); the chrome in dark theme has no recorded review |

## 6. Data model

### 6.1 Today (schema 3)

- **Item:** a `WorkspaceItem` of kind `'diagram'` in the `diagrams` store; versions in `diagram_versions` (IndexedDB `SCHEMA_VERSION = 3`). Previews of embedded diagrams live in the attachments store (SVC-BLOB) and belong to the host document or presentation, not to the diagram item.
- **Content:** `DiagramContent` (types.ts:179-187): `schemaVersion`, `nodes: SerializedNode[]`, `edges: SerializedEdge[]`, `viewport | null`, `settings` (`snapToGrid`, `showGrid`, `autoLayout`, optional `connector` line type; types.ts:141-147), optional `layers: DiagramLayer[]` (model.ts:9-14: id, name, visible, locked).
- **Shapes:** `ShapeKind` (types.ts:9-32): 16 schema-2 kinds plus `group`, `image` and 30 library kinds (library/kinds.ts:8-43). Shape data holds style, text, link, tooltip, up to 200 custom properties, rotation, opacity, font, alignment, ports; schema-3 fields at their default are left out (types.ts:232-234).
- **Connectors:** source/target ids, handles, line type (`smoothstep`, `step`, `straight`, `default`), label, label position, markers (11 kinds), waypoints (≤ 500, model.ts:30-32).
- **Ids:** `n-`/`e-` plus 8 hex characters (editor/mutations.ts:13).
- **Files:** `.dcosdiagram` (native.ts: format `dcos-diagram`, version 1, 64 MB); `.drawio` (one `<diagram>` page).
- **Embedded form:** inside documents and slides, a copy of `DiagramContent` plus preview ids (ADR 0013, ADR 0014). The diagram PNGs written into DOCX, ODT and PPTX exports carry the editable data in a compressed iTXt `dcos-diagram` chunk (document-studio export/diagramPng.ts:6, :15; presentation-studio export/diagramPng.ts:1-9).

### 6.2 Proposed for AE-P5 (DIAGRAM_SCHEMA 4; all **Proposed, needs approval**, scope per D-21)

| Addition | Shape (proposed) | For |
|---|---|---|
| Pages | `pages?: Array<{ id, name, nodes, edges, layers?, viewport, background? }>` with `activePageId`; absent `pages` = today's single page (top-level nodes/edges), so schema-3 content keeps working | DGM-FR-085 |
| Saved styles | `styles?: Array<{ id, name, target: 'shape' \| 'connector', style }>`; shapes may reference `styleId` | DGM-FR-083 |
| Connector extras | multiple labels; links/properties on connectors (if D-21) | DGM-FR-066, 104 |
| User components | not in diagram content: a per-device library (proposed store or meta entry, owned by [DATABASE_AND_SYNC_ARCHITECTURE](DATABASE_AND_SYNC_ARCHITECTURE.md)), each component a fragment `{ id, name, nodes, edges, thumbnailAttachmentId }`; included in backup | DGM-FR-084 |
| User templates | an ordinary diagram item flagged as a template (`templateId` exists on WorkspaceItem) or a library entry; to decide with ADR-0015 | DGM-FR-084 |
| Ids | new ids as full UUIDs; old short ids accepted | DGM-NFR-007 |
| Embed page reference | embeds record `pageId` when taken from a multi-page diagram; provenance through SVC-REF (`ItemRef`, mode `embed-copy`) | INT-01, INT-02 |

Rules: a new frozen vocabulary (`SCHEMA3_VOCABULARY`) is added in compat.ts so that only diagrams using schema-4 features are stored as 4 (ADR 0012 pattern); `MAX_CONTENT_SCHEMA_BY_KIND.diagram` (packages/local-storage/src/backup.ts:14) and Document/Presentation Studio's "drawn diagram schema" checks rise in the same change; the native file version rises to 2 only for content that needs it.

## 7. Technical architecture

### 7.1 Today

- **Package:** `@dcos/diagram-studio` 0.1.0 on React Flow (`@xyflow/react` 12.12.1, MIT; no `proOptions`). Main parts: `DiagramEditor.tsx` (287 lines) and `editor/` (canvas model, hooks, shortcuts, inspector sections), `connect/` (geometry, connector edge, palette navigation), `QuickConnect.tsx` and `quickConnectGeometry.ts`, `library/` (kinds, categories, containers, layouts, templates), `drawio.ts` and `drawioFeatures.ts`, `vector/` (renderSvg, raster, pdf), `native.ts`, `compat.ts`, `preview.ts`.
- **App wiring:** apps/web/src/modules.tsx:64-71 registers the kind; import from ItemListPage.tsx:55, DiagramFiles.tsx:40 and DiagramDialogs.tsx:127; DiagramDialogs hosts the editor inside documents and slides with draft recovery (SVC-HOST).
- **Boundaries:** document-studio and presentation-studio never import diagram-studio; they use host interfaces implemented in apps/web (tests/integration/boundaries.test.ts; presentation-hosts.test.ts).

### 7.2 Proposed changes (each **Proposed, needs approval**)

| Area | Proposal | Notes |
|---|---|---|
| Pages | A page layer in the editor state; React Flow shows one page at a time; undo history per diagram with page switches recorded | Schema 4; split canvasModel/useCanvas first (DGM-NFR-012) |
| Smart guides | Extract the pure guide maths from presentation-studio/src/editor/guides.ts into a shared, framework-free module (or copy with attribution inside the repository); hook into React Flow drag and resize | Original code only (R-016) |
| Layout and routing | A `LayoutEngine` interface with the existing tree/mind map/timeline engines plus a general layered engine (candidate dagre, or original code); obstacle-aware orthogonal routing as original code unless D-21 grants a licence exception | R-016 |
| User library | Library store via SVC-STORE; components inserted as copied fragments with new ids | DGM-FR-084 |
| Import hardening | Caps and worker parsing behind one `readDiagramFile` entry (DGM-FR-107) | TD-40 |
| PDF fonts | Embed a bundled open font in jsPDF for non-WinAnsi labels | TD-45; font served from the app origin (R-030) |
| Search extractor | `extractDiagramText` for SVC-SEARCH (labels, connector labels, properties) | INT-09 |
| Co-editing readiness | Full UUID ids, stable page ids, no derived data stored in content | ADR-0021; diagrams are not in the v1.0.0 co-editing scope proposed by D-16 |

## 8. Dependencies

### 8.1 Modules and shared services

| Depends on | Why | State |
|---|---|---|
| SVC-ITEM, SVC-STORE, SVC-BACKUP | Item, autosave, versions, trash, backup | Done (IndexedDB) |
| SVC-BLOB | Pictures in diagrams (`image` kind); component thumbnails; host previews | Done |
| SVC-IO | Loss notes (drawioFeatures IMPORT_NOTES, export notes) | Partial (per studio) |
| SVC-UI | Toolbar, inspector, dialogs | Partial |
| SVC-SEARCH | Diagram text in global search | Absent |
| SVC-REF | Provenance of embeds; page references | Absent (ADR-0018) |
| SVC-PLAT | Native save dialog for exports (TD-28) | Partial |
| presentation-studio guides | Source of the smart-guide maths (DGM-FR-081) | Done in M03 (editor/guides.ts:113-195) |

Consumers of M02: M01 through `DiagramHost` (INT-01), M03 through `PresentationDiagramHost` (INT-02), M04 Notebook (drawing is a separate ink layer, not a diagram), M06 (diagrams submitted; INT-04 via SVC-REF), M07 (sharing, INT-08), M08/M09 (lists, previews, search).

### 8.2 Libraries

Installed (package-lock.json): `@xyflow/react` 12.12.1 (range ^12.4.0), `jspdf` 4.2.1, `svg2pdf.js` 2.8.1 (exact), `fflate` 0.8.3, `html-to-image` 1.11.11 (exact; used only by the dead export path, TD-42). All are in the passing licence gate.

Candidates (none installed; review in [DEPENDENCY_AND_LICENCE_PLAN](DEPENDENCY_AND_LICENCE_PLAN.md); licences as reported, **licence to verify**):

| Need | Candidate(s) | Note |
|---|---|---|
| General layered layout | `@dagrejs/dagre` (reported MIT; maintenance to verify) or original code | D-21 |
| Layout/routing beyond that | elkjs (reported EPL-2.0), libavoid-js (reported LGPL-2.1) | Outside policy unless D-21 grants an exception (R-016) |
| PDF fonts for non-Latin labels | A bundled OFL font (family and licence to verify) loaded into jsPDF | TD-45, R-030 |
| Worker-safe XML parsing for `.drawio` | A small XML parser usable in workers (candidate to name, licence to verify) | DGM-FR-107 |
| Collaboration (later) | Yjs (reported MIT, licence to verify) | ADR-0021/0022; D-16 |

## 9. API/interface contracts

Shared services are referenced, never re-defined: SVC-REF (`ItemRef`), SVC-BLOB, SVC-PERM and SVC-IO are owned by [SYSTEM_ARCHITECTURE](SYSTEM_ARCHITECTURE.md) and [MODULE_DEPENDENCY_MAP](MODULE_DEPENDENCY_MAP.md).

**DGM-IF-001 Editor component (exists, DiagramEditor.tsx:29-58).**

```ts
interface DiagramEditorProps {
  initialContent: unknown;                 // read once on mount
  title: string;
  onChange?: (content: DiagramContent) => void;
  apiRef?: Ref<DiagramEditorApi>;          // used by the document/slide diagram dialog
  onOpenFile?: () => void;                 // host opens .dcosdiagram / diagrams.net files
}
interface DiagramEditorApi {
  getContent(): DiagramContent;            // unchanged content for a protected diagram
  isReadOnly(): boolean;
  renderPng(pixelRatio?: number): Promise<RenderedImage>;
  renderSvg(): Promise<Blob>;
  renderPdf(): Promise<Blob>;
}
```

Proposed additions: `componentLibrary?: ComponentLibrary` (DGM-IF-006), `initialPageId?: string`, and in the API `getPages(): Array<{ id: string; name: string }>` and `renderPng/renderSvg(pageId?)`.

**DGM-IF-002 Host contracts used by other modules (exist in M01 and M03; SVC-HOST).** `DiagramHost` (document-studio/src/extensions/diagramEmbed.tsx:61-86) and `PresentationDiagramHost` (presentation-studio/src/hosts.ts:40) are implemented in apps/web using this package's editor, `toDrawio` and `renderDiagramPreview`. Contract: hosts never write back a diagram from a newer schema; previews are content-addressed attachments.

**DGM-IF-003 diagrams.net (exists, drawio.ts).**

```ts
function fromDrawio(text: string, options?: { page?: number }): { content: DiagramContent; report: DrawioImportReport };
function toDrawio(content: DiagramContent, title?: string): string;
function drawioPages(text: string): string[];       // drawio.ts:376
function drawioExportNotes(content: DiagramContent): string[];
interface DrawioImportReport { title: string; nodes: number; edges: number; notes: string[] }
```

Proposed: `fromDrawio(text, { pages: 'all' | number[], limits })` returning all pages for schema 4; `toDrawio` writing one `<diagram>` per page; notes reported through the SVC-IO loss-report type.

**DGM-IF-004 File reading (exists, native.ts:230-242).** `readDiagramFile(text): DiagramFileImport` tells native and diagrams.net files apart by content. Proposed: `readDiagramFile(file: Blob, limits: { maxBytes: number; maxInflatedBytes: number; maxCells: number }, signal?: AbortSignal): Promise<DiagramFileImport>` running in a worker (DGM-FR-107).

**DGM-IF-005 Preview rendering (exists, preview.ts:12-39).** `renderDiagramPreview(source, { title?, scale? }): Promise<DiagramPreview | null>` returns `{ png, svg, width, height, pixelRatio, readOnly, … }` without changing `source`; newer diagrams are drawn as far as the build can, read-only. Proposed: `pageId?` option.

**DGM-IF-006 Component library (proposed).**

```ts
interface ComponentLibrary {
  list(): Promise<Array<{ id: string; name: string; thumbnail?: string /* attachment id */ }>>;
  get(id: string): Promise<{ nodes: SerializedNode[]; edges: SerializedEdge[] } | undefined>;
  save(name: string, fragment: { nodes: SerializedNode[]; edges: SerializedEdge[] }): Promise<string>;
  rename(id: string, name: string): Promise<void>;
  remove(id: string): Promise<void>;
}
```

Implemented by apps/web over SVC-STORE and SVC-BLOB; the package stays storage-free.

**DGM-IF-007 Provenance (proposed; SVC-REF, INT-01/02).** Embeds carry `sourceRef?: ItemRef` (`mode: 'embed-copy'`, optional `pageId`); "update from source" re-reads the item through the host; a missing source never removes the embed.

**DGM-IF-008 Layout engine (proposed).** `interface LayoutEngine { id: string; label: string; applies(content): boolean; layout(nodes, edges, options): { positions: Map<string, XYPosition>; notes: string[] } }`; locked shapes never move (today's rule).

**DGM-IF-009 Text extraction for search (proposed; SVC-SEARCH).** `extractDiagramText(content): { labels: string[]; connectorLabels: string[]; properties: string[] }`, pure and worker-safe. The app registers it with SVC-SEARCH by wrapping it as one DSH-IF-001 `TextExtractor` (MODULE_09 §9.1), mapping its parts to `ExtractedField` entries with a `locator`; there is no module-specific search interface.

**DGM-IF-010 Clipboard format (exists, editor/canvasModel.ts:624, :626, :668, :860; index.ts:13 exports `CLIPBOARD_FORMAT`, `CLIPBOARD_MIME`, `diagramFromClipboard`, `NEWER_SHAPES_MESSAGE`).** Read for a document's paste through apps/web/src/components/diagramClipboardHost.ts; document-studio itself only recognises the MIME type (extensions/diagramClipboard.ts:20), because the boundary test forbids it to import diagram-studio. Contract: newer clipboard content is refused with `NEWER_SHAPES_MESSAGE`.

## 10. Acceptance criteria

This table is the canonical wording of the module's criteria; [ACCEPTANCE_CRITERIA.md](ACCEPTANCE_CRITERIA.md) §4 only summarises them and owns the cross-cutting criteria (AC-SYS, AC-SEC, AC-PERF, AC-INT and others) (ACCEPTANCE_CRITERIA §1.2). A change to a criterion here is made in ACCEPTANCE_CRITERIA §4 in the same edit. "Browsers" means the PLT-001…003 web projects (Chromium, Firefox, WebKit) unless stated. All criteria belong to **AE-P5** unless stated. Criteria for scope that D-21 removes are waived by that decision and listed in the known limitations.

### 10.1 Functional

| AC | Criterion | Evidence | Re-verify |
|---|---|---|---|
| AC-DGM-001 … AC-DGM-003, AC-DGM-004a, AC-DGM-005, AC-DGM-006, AC-DGM-007a, AC-DGM-009 … AC-DGM-011 | Each template of the type (flowchart, tree, mind map, UML class/sequence/activity/state/use case, ER, org chart, network, timeline, BPMN, hierarchy) opens editable, saves, reloads, and round-trips through `.dcosdiagram` and `.drawio` with only documented notes (one criterion per type, same wording) | unit + e2e (browsers) | yes |
| AC-DGM-004b | UML component and deployment templates exist if D-21 adds them | unit | — |
| AC-DGM-007b | Network and BPMN stencil names in exported `.drawio` render as the intended shapes in diagrams.net | external application check (dated) | — |
| AC-DGM-008 | Venn: sets can be added and removed with automatic arrangement and region labels, per D-21 depth | unit + e2e | — |
| AC-DGM-012 | A concept-map template and category exist; labelled links and layout work; round trip through `.drawio` | unit + e2e (browsers) | — |
| AC-DGM-013 | Shape search finds shapes by name and keyword in every category, including user components | unit + e2e | yes |
| AC-DGM-020 … AC-DGM-031 | Each canvas function (infinite canvas, zoom/pan, grid/snap, minimap, full screen, multi-select, group, lock, layers, align/distribute, copy/paste, shortcuts) works by mouse, keyboard and (where applicable) touch, and its result survives save and reload (one criterion per ID) | unit + e2e (browsers; touch in mobile Chromium and a real device in AE-P14) | yes |
| AC-DGM-040 … AC-DGM-047 | Each Quick Connect behaviour (arrows, click-create, drag-connect, palette, preview, auto-position, zoom tracking, keyboard/touch) works at zoom 0.1, 1 and 4, is one undo step, and works inside groups (one criterion per ID) | e2e (browsers; touch as above) | yes |
| AC-DGM-048 | Quick Connect is compared side by side with the owner-supplied diagrams.net reference and differences are recorded, or the owner's acceptance of current behaviour is recorded with a date | external application check (dated) or manual (owner record) | — |
| AC-DGM-049 | In BPMN, UML, network and ER diagrams the palette offers that category's shapes | unit + e2e | — |
| AC-DGM-060 … AC-DGM-066 | Each connector feature (straight, curved, elbow, orthogonal, 11 arrowheads, 8 ports plus floating ends, label) renders identically on canvas, SVG, PNG, PDF and `.drawio` (one criterion per ID) | unit (goldens) + e2e | yes |
| AC-DGM-067 | After a move or layout, orthogonal connectors are rerouted so that no segment crosses an unrelated shape in the reference fixtures | unit + e2e | — |
| AC-DGM-080 | A general layout arranges any connected diagram without overlaps in the fixtures; locked shapes never move; undo restores | unit + e2e | — |
| AC-DGM-081 | Dragging or resizing shows edge, centre and equal-spacing guides and snaps to them; Alt disables snapping | unit + e2e (browsers) | — |
| AC-DGM-082 | Position, size, rotation, opacity, font family and alignment can be set in the inspector and survive save, SVG, PDF and `.drawio` | unit + e2e | — |
| AC-DGM-083 | Any colour can be chosen; a style can be copied, pasted, saved by name and applied | unit + e2e | — |
| AC-DGM-084 | A selection can be saved as a component, found in the user library, inserted with new ids, renamed and deleted; a diagram can be saved as a user template; both survive backup and restore | unit + e2e + integration (backup) | — |
| AC-DGM-085a | Pages can be added, renamed, reordered and deleted; each keeps its own viewport and layers; undo covers page actions | unit + e2e (browsers) | — |
| AC-DGM-085b | A multi-page `.drawio` imports all pages and exports back with all pages; a schema-4 diagram opens read-only in a schema-3 build | integration + upgrade test | — |
| AC-DGM-086 | All built-in templates open editable at the lowest schema they need | unit | yes |
| AC-DGM-087 | A newer-schema diagram opens read-only, is never written, and is drawn as far as the build can | integration | yes |
| AC-DGM-100a | The internal corpus imports with exactly the documented notes | integration (drawio-corpus) | yes |
| AC-DGM-100b | A corpus of at least 10 files saved by diagrams.net (compressed and plain, covering every brief diagram type) imports with every loss reported | integration + external application check (dated, provenance recorded) | — |
| AC-DGM-101 | Bare `mxGraphModel` XML and `UserObject`/`object` wrappers import as in AC-DGM-100a/b | integration | yes |
| AC-DGM-102 | Every template and the kitchen-sink diagram exported as `.drawio` opens in diagrams.net, edits, saves and re-imports with no new loss | external application check (dated) + integration | — |
| AC-DGM-103 | Rotation, opacity, font, alignment, lock, pictures, ports, label positions, bend points and layers survive both directions | integration + AC-DGM-102 check | yes |
| AC-DGM-104 | Links, tooltips and custom properties on shapes survive both directions; unsafe schemes are dropped with a note | integration | yes |
| AC-DGM-105 | Swimlanes and tables import as the documented approximations, each with its note | integration | yes |
| AC-DGM-106 | Every element the importer or exporter cannot keep is counted in a note; no element disappears without one (checked against the corpus) | integration | yes |
| AC-DGM-107 | Oversized files, inflate bombs and cell floods are refused with a reason before memory grows past the cap; parsing does not block the UI | unit + e2e | — |
| AC-DGM-120 | PNG at 1×, 2× and 3×, white or transparent, within the canvas caps; loss notes shown | unit + e2e (browsers) | yes |
| AC-DGM-121 | SVG has no foreignObject, matches the golden, and opens in at least one independent viewer | unit (golden) + external application check (dated) | yes |
| AC-DGM-122 | PDF fit and tiling work; non-Latin labels (Greek, CJK sample) render with an embedded font | unit + e2e + external application check (dated) | yes (partial) |
| AC-DGM-123 | `.dcosdiagram` round trip keeps everything; files over 64 MB and newer versions are refused | unit + e2e | yes |
| AC-DGM-124 | (if D-27) The html-to-image exports are gone from `index.ts` and the dependency is removed; licence notices regenerated | unit + licence gate | — |

### 10.2 Non-functional, UX and interface

| AC | Criterion | Evidence | Phase | Re-verify |
|---|---|---|---|---|
| AC-DGM-501 | DGM-NFR-001 met (PERF-006 frame rate) | measurement (Chromium; WebKit recorded) | AE-P5, AE-P13 | — |
| AC-DGM-502 | DGM-NFR-002 met (PERF-006 open time) | measurement | AE-P5, AE-P13 | — |
| AC-DGM-503 | Import/export times at 500 and 2,000 shapes recorded as measurements against the baseline | measurement | AE-P5 | — |
| AC-DGM-504 | Memory within PERF-008 | measurement (Chromium) | AE-P13 | — |
| AC-DGM-505 | v3→v4 upgrade keeps every diagram; older builds fail closed; diagrams without schema-4 features stay at 2 or 3 | upgrade test + integration | AE-P5 | yes |
| AC-DGM-506 | Covered by AC-DGM-107 plus a malicious-file fixture set | unit | AE-P5, AE-P13 | — |
| AC-DGM-507 | All new ids are full UUIDs; old short ids still load | unit | AE-P5 | — |
| AC-DGM-508 | Privacy e2e passes for diagrams with every AE-P5 feature, including user library and pages | e2e (Chromium, WebKit, Firefox) | AE-P5 | yes |
| AC-DGM-509 | Keyboard-only completion of US-DGM-01, 04, 05, 08; axe check (if D-25) without serious violations | e2e + manual (screen reader before AE-P15) | AE-P5, AE-P15 | — |
| AC-DGM-510 | Diagram specs pass on every PLT web project; touch on a real tablet in AE-P14 | e2e + manual (device, dated) | AE-P5, AE-P14 | yes |
| AC-DGM-511 | Licence gate passes; no React Flow Pro code; any layout library approved under D-21 | licence gate + manual review | AE-P5 | yes |
| AC-DGM-512 | canvasModel.ts and useCanvas.ts split without behaviour change (all diagram tests green before and after) | unit + e2e | AE-P5 | — |
| AC-DGM-701 … AC-DGM-710 | Each DGM-UX-001…010 item checked in a recorded UI review with screenshots in light and dark, desktop, tablet and phone | manual (dated) + e2e where scriptable | AE-P5 | yes for Done items |
| AC-DGM-901 | DiagramEditor props and API unchanged for existing callers; new members optional | typecheck + unit | AE-P5 | yes |
| AC-DGM-902 | DiagramHost and PresentationDiagramHost keep working with multi-page diagrams (embed names a page) | integration (presentation-hosts.test.ts) + e2e (diagram-embed*) | AE-P5 | yes |
| AC-DGM-903 | `fromDrawio`/`toDrawio` contracts hold for single- and multi-page files | integration | AE-P5 | yes |
| AC-DGM-904 | `readDiagramFile` enforces limits and runs in a worker | unit | AE-P5 | — |
| AC-DGM-905 | `renderDiagramPreview` never changes its input, including schema-4 sources in a schema-3 build | unit | AE-P5 | yes |
| AC-DGM-906 | ComponentLibrary implementation passes a contract test over SVC-STORE | integration | AE-P5 | — |
| AC-DGM-907 | A dangling `sourceRef` shows a missing-source state and keeps the embed | unit + e2e | AE-P12 | — |
| AC-DGM-908 | Each LayoutEngine leaves locked shapes in place and reports notes | unit | AE-P5 | — |
| AC-DGM-909 | `extractDiagramText` returns all labels and properties for fixtures, in a worker, and is registered as a DSH-IF-001 `TextExtractor` | unit | AE-P5 (indexed from AE-P7; MODULE_DEPENDENCY_MAP §5.2) | — |
| AC-DGM-910 | Clipboard payloads from a newer build are refused with the documented message | unit | AE-P5 | yes |

## 11. Test strategy

Nothing below was run in AE-P1. The last recorded full run is 2026-11-15 (RELEASE_GAPS.md §11).

| Kind | Exists today | Add in AE-P5 |
|---|---|---|
| Unit | 29 files in the package (370 test declarations by a strict grep of lines starting with `it(`, `test(` or `it.each(…)(`), e.g. renderSvg.test.tsx (30), drawio.test.ts, library/layouts.test.ts, quickConnectGeometry.test.ts, edgeChanges.test.ts, clipboard.test.ts, native.test.ts | Pages model, guides, layout engines, routing, styles, component library, caps, id generation |
| Integration | tests/integration: drawio-corpus (21 tests), diagram-schema, diagram-kitchen-sink-v3-golden, diagram-png-envelope, diagram-clipboard, diagram-export-labels, large-diagram (500/2,000 shapes); presentation-hosts | Real diagrams.net corpus; schema-4 goldens; multi-page round trips; host contract with pages |
| Browser (component) | canvas.test.tsx and other jsdom tests | Inspector property fields, page bar, library panel |
| End-to-end | 25 specs `e2e/diagram*.spec.ts` and `quick-connect*.spec.ts` (81 test declarations) run locally in Chromium and WebKit; touch specs in mobile Chromium; Firefox is a Playwright project (playwright.config.ts:24) not run locally and failing on CI. PR #1 (unmerged) changes the import line of every one of these specs and the assertions in diagram-export and diagram-embed. Of the 25 specs, the 8 `diagram-embed*` specs test INT-01 | User stories US-DGM-01…12 in Chromium, Firefox and WebKit; green CI including Firefox (R-001) |
| Persistence | Save/reload in e2e; local-storage tests; diagram-native-file.spec.ts | Pages, styles and user library across reload and browser relaunch |
| Offline | storage.chromium-only.spec.ts:46 (embedding a diagram offline, Chromium) | Offline diagram editing, import and export in all three engines |
| Import/export | Internal `.drawio` corpus; golden SVG/drawio/json; PDF/PNG e2e. No external check recorded for diagrams.net or SVG viewers | Dated diagrams.net checks (AC-DGM-007b, 100b, 102); independent PDF and SVG viewers (D-22) |
| Regression | Goldens (tests/golden/diagram-v3); v0.1.0 fixtures; template round trips | Keep fail-before evidence in the repository for every fix (R-035) |
| Upgrade | scripts/upgrade-test.mjs 82/82 (Chromium, 2026-11-15); its store lists are hard-coded (:64-65) | v3→v4 with diagrams using every schema-3 feature |
| Accessibility | Keyboard Quick Connect (diagram-palette-quick-connect-touch.spec.ts:11); shortcut tests; reduced motion in diagramCss.ts:69 | axe if D-25; keyboard-only flows; screen-reader pass before AE-P15 |
| Performance | Time bounds only (large-diagram.test.ts:17-19; renderSvg.test.tsx:328-331; diagram-large.spec.ts at 500 shapes) | PERF-006 measurements at 1,000 and 2,000 shapes in a real browser, recorded against the AE-P3 baseline |
| Security | Link-scheme tests (model.ts isSafeLink) | Inflate bomb, oversized file and cell-flood fixtures (AC-DGM-107) |

## 12. Known risks

From the register (canonical §10 of the planning brief; mitigations live in [RISK_REGISTER](RISK_REGISTER.md)):

| ID | Risk | L | I | Why it matters for M02 |
|---|---|---|---|---|
| R-014 | diagrams.net mapping errors pass every internal test (TD-46); Quick Connect reference missing | H | M | DGM-FR-048, 100–106 |
| R-015 | 32-bit node and edge ids collide under merging | M | M | DGM-NFR-007; future sharing |
| R-016 | Layout engines outside licence policy tempt shortcuts | M | M | DGM-FR-067, 080 |
| R-003 | Migrations on live users' data; cached builds fail closed | M | H | Schema-4 diagrams become read-only in the cached live build, including inside documents and slides |
| R-001 | CI e2e never passed on main; Firefox and Linux WebKit unverified | H | H | Diagram specs changed by PR #1 |
| R-025 | `.drawio` and ODT expansion are denial-of-service risks; no web CSP | M | M | DGM-FR-107 |
| R-030 | Fonts fetched from third-party CDNs | M | M | PDF font embedding (TD-45) |
| R-034 | No performance baselines | H | M | DGM-NFR-001…004 |
| R-036 | Accessibility debts inherited by new screens | H | M | Page bar, library panel, inspector |
| R-019 | Documentation drift (stale ea7f316 line numbers in FEATURE_STATUS) | H | M | Later phases citing wrong evidence |
| R-097 | Users stay on long-cached PWA builds (RISK_REGISTER) | M | M | Schema-4 diagrams, and documents or slides that embed them, open read-only in a cached schema-3 build until the user accepts the update |
| R-098 | External compatibility and device checks depend on software and devices the owner must provide (D-22; RISK_REGISTER) | H | H | AC-DGM-007b, 048, 100b, 102, 121, 122 and 510 need diagrams.net, independent SVG/PDF viewers and real touch devices |

Module-specific risks. RISK_REGISTER.md §5 numbered them R-054…R-057 in the order below (the draft labels M02-a…d are kept for traceability).

| ID | Risk | L | I | Mitigation (proposed) |
|---|---|---|---|---|
| R-054 (M02-a) | The dead html-to-image export (TD-42) stays public, so a host could produce foreignObject SVG and raster PDF again | L | M | D-27 removal; AC-DGM-124 |
| R-055 (M02-b) | Diagram PDFs drop non-WinAnsi labels (TD-45), which matters for multilingual classrooms | H | M | Embedded open font; AC-DGM-122 |
| R-056 (M02-c) | Adding pages changes how embeds reference diagrams; documents and slides could show the wrong page after an update from source | M | M | `pageId` in embeds; AC-DGM-902 |
| R-057 (M02-d) | Touch interactions are automated only in mobile Chromium; real iPad/Android behaviour may differ | M | M | Device checks in AE-P14 (AC-DGM-510) |

Owner decisions this module waits on: D-16, D-17, D-21, D-22, D-25, D-27, D-29, D-30, D-36 (multiple pages are a deferral candidate).
