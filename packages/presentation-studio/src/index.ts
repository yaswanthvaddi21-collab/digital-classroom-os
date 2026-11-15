// Presentation Studio (Phase 7, ADR 0014). The package imports only @dcos/ui; storage and Diagram Studio come in
// through the hosts in hosts.ts.
export { PresentationEditor, slideLabel, type PresentationEditorProps } from './PresentationEditor';
export * from './types';
export * from './hosts';
export * from './geometry';
export { THEMES, DEFAULT_THEME_ID, themeById, resolveColor, resolveFont, cssFontFamily, isHexColor } from './themes';
export { createLayouts, createMaster, DEFAULT_MASTER_ID, LAYOUT_NAMES, layoutIdFor, textStyle } from './layouts';
export { createPresentation, createSlide, newId, TEMPLATE_IDS, type CreateOptions } from './create';
export { presentationTemplates, type PresentationTemplate } from './templates';
export { migratePresentation, presentationSchemaOf, type MigratePresentationResult } from './migrate';
export { PRESENTATION_V1_VOCABULARY, presentationNovelty, presentationSchemaFor } from './compat';
export { displaySafe, elementProblem, preparePresentation, presentationProblems, type PreparedPresentation } from './safety';
export { SlideView, ElementView, decorationsOf, effectiveBackground, type SlideViewProps } from './render/SlideView';
export { RichText, safeHref, fontSizePx } from './render/RichText';
export { shapePath, shapeTextBox, isLinePreset } from './render/shapePaths';
export { useAttachmentUrl, type AttachmentUrl } from './render/attachments';
// Exports (Phase 7 EXPORT): export/** — the editor's Export menu loads export/index.ts (buildPptx, buildPdf,
// exportPresentation) on first use, so PptxGenJS, jsPDF and svg2pdf stay out of the editor chunk. Not re-exported here
// on purpose: a static re-export would pull them into every importer.
export { exportToastText } from './export/ExportMenu';
// CONTENT (Round 2b): the chart renderer (also for the PDF export), cell text styles, and putting recovered diagram
// edits back into a stored presentation (the app's diagram dialog recovery).
export { layoutChart, chartSvgMarkup, seriesColor, sliceColor, isRoundChart, formatValue, niceScale, type ChartGraphic, type ChartPrimitive } from './elements/chart';
export { cellTextStyle } from './elements/TableOverlay';
export { applyRecoveredPresentationDiagram, type RecoveredDiagramBase } from './elements/diagram';
// SHOW (Round 2b): the presenter window (the app's #/presentations/presenter/:session route) and the build order of a
// slide's animations (the slide show's grouping of on click / with previous / after previous, for exports).
export { PresenterWindow, type PresenterWindowProps } from './show/PresenterWindow';
export { buildSteps, type BuildStep, type BuildEffect } from './show/sequence';
