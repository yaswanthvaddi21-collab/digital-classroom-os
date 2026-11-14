export { DocumentEditor, type DocumentEditorProps } from './DocumentEditor';
export * from './types';
export { documentTemplates, type DocumentTemplate } from './templates';
export {
  DIAGRAM_PHASE6_ATTRS,
  diagramAlign,
  diagramAltText,
  diagramCaption,
  documentExtensions,
  fitSize,
  type DiagramAttrs,
  type DiagramHost,
  type DiagramStart,
  type EmbeddedDiagram,
  type RenderedDiagramPreview,
} from './extensions';
// Phase 6 (ADR 0013): editable diagram data inside PNG previews (iTXt 'dcos-diagram') and their pHYs density.
export {
  DIAGRAM_PNG_KEYWORD,
  DIAGRAM_PNG_MAX_BYTES,
  DIAGRAM_PNG_VERSION,
  diagramPngEnvelope,
  embedDiagramInPng,
  isPng,
  pngChunks,
  readDiagramFromPng,
  type DiagramPngEnvelope,
  type DiagramPngPayload,
  type PngChunk,
} from './export/diagramPng';
export { buildDocx, diagramPreviewIds, exportDocx } from './export/docx';
// G-FILES: ODT export, and DOCX/ODT import into a new document.
export { buildOdt, exportOdt, ODT_MIME } from './export/odt';
export {
  IMPORT_ACCEPT,
  importDcosdoc,
  importDocumentFile,
  importDocx,
  importOdt,
  ImportReport,
  importSummary,
  withStoredAttachments,
  type ImportedAttachment,
  type ImportResult,
} from './import';
// Phase 6 (ADR 0013): the per-document native file, and how exports treat embedded diagrams.
export { DCOSDOC_EXTENSION, DCOSDOC_FORMAT, DCOSDOC_MAX_BYTES, DCOSDOC_MIME, DCOSDOC_VERSION, exportDcosdoc, type DcosdocFile } from './export/dcosdoc';
export { diagramLabels, DRAWN_DIAGRAM_SCHEMA, isNewerDiagram, type DiagramExportOptions } from './export/diagramAssets';
export { buildPrintHtml, collectPrintDiagrams, printDocument, type PrintDiagram } from './export/print';
export { documentToText } from './export/text';
export { ExportReport, exportToast, NOTES, type ExportNote } from './export/report';
export { documentContentCss } from './contentCss';
export { contentSchemaFor, DOCUMENT_SCHEMA, migrateDocument, schemaFor } from './migrate';
export { contentNovelty, docNovelty, V010_VOCABULARY, V020_VOCABULARY, type Vocabulary } from './compat';
export { prepareDocument, validateDoc } from './safety';
// G-REVIEW: comment threads (stored in the content's `comments` field) and the document language.
export { commentAnchors, commentsAppendix, commentsProblem, orderThreads, type CommentReply, type CommentThread } from './review/comments';
export { DOCUMENT_LANGUAGES, isLanguageTag, languageLabel } from './review/language';
// G-LAYOUT: page layout fields (columns, page numbers, header/footer parts, first page) and sections, for other exporters.
export * from './pageLayout';
export { readBreakAttrs, resolveSections, SECTION_BREAK, splitSections, topLevelBreaks, type BreakType, type ResolvedSection, type SectionBreakAttrs } from './sections';
