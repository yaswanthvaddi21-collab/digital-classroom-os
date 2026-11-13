export { DocumentEditor, type DocumentEditorProps } from './DocumentEditor';
export * from './types';
export { documentTemplates, type DocumentTemplate } from './templates';
export { documentExtensions, fitSize, type DiagramAttrs, type DiagramHost, type DiagramStart, type EmbeddedDiagram } from './extensions';
export { buildDocx, diagramPreviewIds, exportDocx } from './export/docx';
// G-FILES: ODT export, and DOCX/ODT import into a new document.
export { buildOdt, exportOdt, ODT_MIME } from './export/odt';
export { IMPORT_ACCEPT, importDocumentFile, importDocx, importOdt, ImportReport, importSummary, type ImportResult } from './import';
export { buildPrintHtml, printDocument } from './export/print';
export { documentToText } from './export/text';
export { ExportReport, exportToast, NOTES, type ExportNote } from './export/report';
export { documentContentCss } from './contentCss';
export { contentSchemaFor, DOCUMENT_SCHEMA, migrateDocument, schemaFor } from './migrate';
export { contentNovelty, docNovelty, V010_VOCABULARY } from './compat';
export { prepareDocument, validateDoc } from './safety';
// G-REVIEW: comment threads (stored in the content's `comments` field) and the document language.
export { commentAnchors, commentsAppendix, commentsProblem, orderThreads, type CommentReply, type CommentThread } from './review/comments';
export { DOCUMENT_LANGUAGES, isLanguageTag, languageLabel } from './review/language';
// G-LAYOUT: page layout fields (columns, page numbers, header/footer parts, first page) and sections, for other exporters.
export * from './pageLayout';
export { readBreakAttrs, resolveSections, SECTION_BREAK, splitSections, topLevelBreaks, type BreakType, type ResolvedSection, type SectionBreakAttrs } from './sections';
