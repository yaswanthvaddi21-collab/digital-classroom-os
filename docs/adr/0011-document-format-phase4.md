# 0011 — Document format in Phase 4: additive vocabulary, content stored in the document, reported approximations

**Status:** Accepted in Phase 4.

## Context

Phase 4 adds a large set of Document Studio features: paragraph formatting and named styles, list styles, sections with their own orientation, columns and page numbering, header and footer parts, equations, shapes, text boxes, picture alignment and captions, comments, a document language, DOCX and ODT import, and ODT export. Each one changes what a stored document can contain.

Three constraints shape how. Saved documents must keep opening, and v0.1.0 must still open everything that does not use a new feature (schema 1, [ADR 0006](0006-migrations-and-safety-copies.md), [ADR 0007](0007-backup-format.md)). A version must never rewrite or drop content it does not understand. And the exports must not claim a fidelity that has not been checked: no exported file has been opened in Microsoft Word, Apple Pages or LibreOffice yet ([DOCUMENT_COMPATIBILITY.md](../DOCUMENT_COMPATIBILITY.md) §8).

## Decision

1. **Schema 2 is decided by a frozen v0.1.0 vocabulary.** `compat.ts` holds `V010_VOCABULARY`: every node and mark type of v0.1.0 with each attribute's default, the top-level content fields, the page fields, paper sizes, orientations, margin keys and editing modes, taken from tag `v0.1.0-baseline`. It is never edited. `contentSchemaFor()` returns 2 when a document uses anything outside it (a new node or mark type, a new attribute with a non-default value, a new page setting with a non-default value, a new top-level field, an unknown mode), and 1 otherwise. So a new feature makes documents schema 2 automatically, and only the documents that use it. Every attribute added to a v0.1.0 node or mark defaults to null and is rendered only when set, so documents that do not use a feature store exactly what they stored before.

2. **Extensions are additive, and stored content is never rewritten on open.** Extensions are only added to `documentExtensions()`, never removed. Content this version cannot represent (an unknown node, mark, attribute value, page setting, mode or top-level field) opens in the protected read-only view, built from a display copy, and the stored original is not touched (`prepareDocument()`). Values the code reads leniently, such as a stored hanging indent larger than the left indent, are limited when shown and exported but kept as stored. Pictures already in a document are never fetched or changed when it opens (`remoteImages.test.ts`).

3. **New document-level data is a registered top-level content field.** `CONTENT_FIELDS` in `types.ts` lists each field with a check and a default. Phase 4 adds two: `comments` (threads) and `language` (a BCP 47 tag). A field at its default is not written, so it does not make the document schema 2. An invalid value opens the protected view.

4. **Comments are stored in the document content.** The `comment` mark carries only a `commentId`; the threads (author, time, text, replies, resolved, edited time) are in the document's `comments` field. Comments therefore travel with the document through versions, backups and exports, need no new store or database migration, and are covered by the content checks above. A comment needs non-blank text that can carry the mark (`canCommentOn`), so no thread is created without an anchor. The author is the "Your name" preference, kept on the device and written into each thread.

5. **Sections are break nodes, not wrappers.** A section break is an atom block node `sectionBreak` at the top level. The first section's settings come from the page settings; each break holds only what changes (orientation, columns, column spacing, number format, number start), with null meaning "same as before". This keeps the body a flat list of blocks, so existing commands, copy and paste and the other exporters are unaffected; `resolveSections()` works out the sections when needed. A break nested in a table, list or quote has no effect and is marked as such on screen and reported in the DOCX export.

6. **Equations are stored as LaTeX.** `inlineMath` and `blockMath` come from `@tiptap/extension-mathematics` with KaTeX (trust off, size and expansion limits), rendered in the editor and in print with KaTeX's bundled CSS and fonts. The DOCX export converts the LaTeX to native Word equations (OMML) with the `docx` library's own `latexToMath` rather than mapping KaTeX's MathML, as first planned. Anything outside its subset becomes a picture of the rendering with the LaTeX as alt text, or the LaTeX as text when the browser cannot draw the picture.

7. **Exports are native where the format allows, otherwise approximated, and every approximation is reported.** Each exporter is a set of registries (DOCX node, inline, mark, run-wrapper and document contributors and asynchronous preparers; ODT node, inline, mark and paragraph contributors; print CSS and DOM changes; text node and inline handlers), so a feature adds its own output. An `ExportReport` collects each approximation, and the export toast names it with a count. Chosen approximations: shapes are pictures in DOCX and text in ODT; text boxes are one-cell (or floating) tables in DOCX, not Word text boxes, and their content in ODT; ODT has no comments or sections yet. The ODT exporter also reports any node, mark, attribute, page setting or document field it has no handler for, so a later feature is never dropped silently. Small deliberate mappings that lose nothing visible are listed in DOCUMENT_COMPATIBILITY.md instead of the toast.

8. **ODT is written by the app's own exporter, zipped with fflate.** No mature permissively licensed ODT writer was available ([RELEASE_GAPS.md](../audit/RELEASE_GAPS.md) §4). `export/odt/` writes `content.xml`, `styles.xml`, `meta.xml` and the manifest, with the uncompressed `mimetype` first, using fflate (MIT, already used by Diagram Studio). `import/odt.ts` reads what it writes and reports the rest.

9. **Import creates a new document.** DOCX (through mammoth, BSD-2-Clause, now a runtime dependency of Document Studio) and ODT files are never merged into an existing document. Everything that is not imported is listed in a report shown after the import.

10. **Images stay inline in document content (TD-2 not changed).** Phase 4 made no decision to move images out of the document. Pictures are still stored as data URLs inside the content, and pasted web pictures are now fetched and stored inline the same way (or kept and marked when the fetch fails). Version history stores large images once ([ADR 0005](0005-version-history.md)), which removes most of the duplication across versions, but the live document and every backup still carry each image inline. Moving images to the `attachments` store would be a new content form that v0.1.0 cannot read; it remains open.

## Consequences

- A document that uses no Phase 4 feature stays schema 1, so v0.1.0 can still read it. The four new templates use only v0.1.0 vocabulary for this reason, so the APA and MLA templates lack double spacing and hanging indents (an owner decision is pending).
- The default layout fields are filled into the page settings on load and written on the next save. v0.1.0 ignores unknown page fields, so this does not affect it.
- Comment threads whose text is deleted stay in the document, so undo can restore them; they are listed in the panel and left out of exports (reported).
- On screen, sections, columns and page boundaries are labelled but not laid out; the DOCX export writes them as Word sections and print lays them out (how Word and Pages show them is untested, DOCUMENT_COMPATIBILITY.md §8). The UI says so.
- Users see what each export approximated, but the fidelity of the native constructs in Word, Pages and LibreOffice is unverified until the check in DOCUMENT_COMPATIBILITY.md §8 is done.
- The ODT exporter and importer are the app's own code, so their correctness rests on the app's tests and round trips until checked in another word processor.

## Verification

- `packages/document-studio/src/compat.test.ts`: the vocabulary matches a rebuilt v0.1.0 schema; every v0.1.0 fixture, template and backup item stays schema 1 and opens editable; each kind of novelty gives schema 2.
- `safety.test.ts`, `layout.test.ts`, `review/review.test.ts`: invalid page settings, modes, layout fields, comment threads and languages open protected with the stored input unchanged.
- Feature tests that each feature marks schema 2 and round-trips through save, HTML copy and paste, and undo: `extensions/paragraphFormat.test.ts`, `extensions/insertObjects.test.ts`, `layout.test.ts`, `review/review.test.ts`, `crossFeature.test.ts`.
- Export goldens: `tests/integration/docx-golden.test.ts`, `docx-format-golden.test.ts`, `docx-layout-golden.test.ts` and `kitchen-sink-v2-golden.test.ts` (DOCX and ODT, with the exact toast text); `export/odt.test.ts` for ODT round trips.
- e2e: `e2e/review.spec.ts` and `e2e/layout-document.spec.ts` check that removing the last comment or section break returns the stored document to schema 1.
