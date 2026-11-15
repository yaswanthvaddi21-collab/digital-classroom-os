# Presentation Studio (`@dcos/presentation-studio`)

Slide presentations for Classroom OS (Phase 7, [ADR 0014](../../docs/adr/0014-presentation-studio.md)).

**Status: Phase 7 complete in the working tree (Rounds 1–3).** Presentations are created from five templates (New
and quick start), edited, saved with version history, trashed and restored, backed up and restored, played as a slide
show with a presenter view, and exported to PowerPoint (.pptx) and PDF. Content from a newer version, or damaged
content, opens read-only and is never changed. PowerPoint, Keynote and LibreOffice have not opened the exports yet
(the Keynote check is not done: Keynote did not respond, and the owner decides; the samples to open are in
`docs/compatibility/phase7-2026-11-15/`); see `docs/audit/FEATURE_STATUS.md` for what is partial.

The package imports only `@dcos/ui` (checked by `tests/integration/boundaries.test.ts`). The app supplies what it
needs through hosts (`src/hosts.ts`): pictures through `PresentationImageHost`, diagrams through
`PresentationDiagramHost` (the same shape as Document Studio's `DiagramHost`).

| Where | What |
|---|---|
| `src/types.ts`, `compat.ts`, `migrate.ts`, `safety.ts` | The content model (schema 1), its frozen vocabulary, migration and protected view |
| `src/themes.ts`, `layouts.ts`, `create.ts`, `templates.ts` | Built-in themes, the master and its eight layouts, `createPresentation`, the template list (`./templates` is a light entry point) |
| `src/render/` | `SlideView`, the one renderer for thumbnails, the canvas, the slide show and the read-only view |
| `src/PresentationEditor.tsx`, `editor/`, `ui/` | The editor: slide list, canvas with smart guides, text boxes (Tiptap), notes, ribbon, one undo history |
| `src/design/` | Design tab: themes, slide size, backgrounds, change layout, master view, templates |
| `src/elements/` | Pictures, shapes, tables, charts (hand-written SVG renderer and data grid), diagrams, the inspector, placeholders |
| `src/show/` | Slide show, transitions and builds (Web Animations), Transitions/Animations/Slide Show tabs, presenter window over a `BroadcastChannel` |
| `src/export/` | PPTX (PptxGenJS 4.0.1 plus post-processing) and vector PDF (svg2pdf.js and jsPDF), loaded on first use; the Export menu |

Tests sit next to the code (`*.test.ts(x)`); the cross-group case is `src/cross-feature.test.tsx` and
`e2e/presentation-cross-feature.spec.ts`. See `docs/TESTING.md`.
