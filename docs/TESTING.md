# Testing

## Commands

```bash
npm test              # all TypeScript unit and integration tests (Vitest)
npm run test:e2e      # Playwright browser tests (builds and serves the app on :4173)
npm run test:upgrade  # real-browser upgrade from v0.1.0 (builds the v0.1.0 tag; see docs/BACKUP_AND_RECOVERY.md §2.4)
npm run typecheck     # strict TypeScript across apps and packages
npm run build         # production build (also checks the PWA precache)
npm run check         # all three
npm run licenses      # licence policy check + docs/THIRD_PARTY_NOTICES.md
cd backend && .venv/bin/pytest
```

## What is covered

| Suite | File | Covers |
|---|---|---|
| Storage | `packages/local-storage/src/indexeddb.test.ts` | create/list/get, simulated restart, version increments, stale-write rejection, aborted-write integrity, version snapshots and reversible restore, trash/restore/purge, duplicate, backup round-trip, no-overwrite import, malformed backup rejection |
| Document export | `packages/document-studio/src/export/docx.test.ts` | DOCX package contents (headings, alignment, marks, colours and named colours, sizes, lists, tables with column widths and row spans, page break, image media, header/footer, page numbers), highlight mapped to Word's colours, line spacing, a real table-of-contents field with the same bookmarks on every export, unsafe links, every template exports, print page safety (`</style>` in a header) and margin-box support detection, text export markers (also inside table cells), export toast wording |
| Document compatibility | `packages/document-studio/src/compat.test.ts`, `safety.test.ts` | the frozen v0.1.0 vocabulary equals a rebuilt v0.1.0 schema; every v0.1.0 fixture, template and backup item stays schema 1 and opens editable; each kind of novelty gives schema 2; invalid page settings, layout fields, modes and content fields open protected with the stored input unchanged |
| Ribbon and controls | `packages/document-studio/src/ui/ribbon/Ribbon.test.tsx`, `ui/ribbon/format/format.test.tsx`, `ui/ribbon/layout/LayoutTab.test.tsx`, `ui/insert/InsertObjects.test.tsx`, `review/Review.test.tsx` | which tabs show in each mode, every control on its tab and its effect, keyboard tab navigation, link box (DS-7), PDF menu wording (DS-5), diagram without data (WEB-3) and failed previews (WEB-10); styles, line spacing, colours, font size, list styles, Paragraph dialog (only changed fields applied), ruler by keyboard and drag; paper size, orientation and margin guards for every section, sections, header/footer and page-number dialogs; equation dialog and object bars; comments panel, language, spell check, find options, word count |
| Paragraph formatting | `packages/document-studio/src/extensions/paragraphFormat.test.ts`, `export/docx/format.test.ts` | line spacing, spacing, indents (hanging clamp, list rule, half-inch steps, shortcuts), named styles and list styles: commands, undo, save/reload, HTML clipboard, schema 2; DOCX `w:spacing`, `w:ind`, `w:pStyle`, styles.xml looks, numbering formats, glyphs and start numbers (nested lists included), continuation-paragraph indents |
| Page layout | `packages/document-studio/src/layout.test.ts`, `export/layout-export.test.ts` | paper sizes, section resolution and inheritance, inserting and splitting at breaks, round trips, labels and nested breaks, invalid values open protected; DOCX sections (types, orientation, columns, `pgNumType`, empty sections dropped with their restart carried), header/footer tab stops and first page; print CSS counters, named pages (`@page name:first`), section wrappers; text markers |
| Equations, shapes, text boxes, pictures | `packages/document-studio/src/extensions/insertObjects.test.ts`, `export/insertExport.test.ts` | KaTeX rendering with unsafe commands not run, LaTeX round trips, inserting next to a selected object, shapes (attributes checked, label escaped into the SVG), text boxes, picture alignment and captions, schema 2; DOCX OMML, picture and LaTeX-text fallbacks, colour and mark losses reported, shape pictures, one-cell and floating tables, Caption paragraphs |
| Review | `packages/document-studio/src/review/review.test.ts` | comment mark (overlap, undo, paste keeps known ids, refusal of code blocks, lone equations and line breaks), stored threads validated, undo never restoring a mark without a thread, DOCX comments with ranges, replies and resolved state, `w:lang`, print rule, TXT appendix, whole-word find, word count |
| Cross-feature | `packages/document-studio/src/crossFeature.test.ts` | an equation in a table cell, comments on a heading and a list item, a text box holding a list and a picture, a two-column section with a picture, a styled list across a section break: the first three through save and copy/paste; each through DOCX and ODT, and through TXT and print where the case uses them (not the comment case in print, the section case in TXT or the list case in print) |
| Pasted pictures and previews | `packages/document-studio/src/extensions/remoteImages.test.ts`, `extensions/previewCache.test.ts`, `links.test.ts` | pasted web pictures fetched once and stored (end of document, empty document, with autolinks, in a table cell) or kept and marked; nothing fetched on open; no credentials or referrer; preview cache sharing, failures retried, LRU revocation; link input normalisation and allowed schemes |
| ODT | `packages/document-studio/src/export/odt.test.ts` | package order and well-formed parts, each feature, toast wording for what ODT leaves out, page layout and formatting round trips, quotes and code blocks kept apart, a heading inside a list item, sized column widths read back, files laid out as other word processors write them, refusal of non-ODT files |
| Import | `packages/document-studio/src/import/docx.test.ts`, `import/word-files.test.ts`, `apps/web/src/components/ImportDocument.test.tsx` | DOCX import of every template exported to Word, 11 real Word files from mammoth's test suite (`tests/fixtures/docx-import`, BSD-2), styles, picture alignment and captions, language, the 512 MB unpack guard, a missing link relationship, link notes, layout and list notes; the import dialog and report |
| Open-items tabs, preferences | `apps/web/src/components/OpenTabs.test.tsx`, `apps/web/src/lib/preferences.test.ts` | switching, closing, the 12-item limit, damaged storage ignored; Your name and Spell check preferences with wrong types ignored |
| Diagrams | `packages/diagram-studio/src/diagram.test.ts` | undo/redo semantics and cap, tree layout (positions, centring, LR, untouched loose nodes, cycles), serialization round-trip, dangling-edge cleanup, defaults, markers, template integrity, no overlaps in tree templates |
| diagrams.net | `packages/diagram-studio/src/drawio.test.ts` | import of plain and compressed files, shapes, UML/ER containers, edges, approximation notes, export round-trip |
| Quick connect | `packages/diagram-studio/src/quickConnectGeometry.test.ts` | placement without overlap, connection rules (no duplicates or self-links), facing handles, keyboard directions |
| Document safety | `packages/document-studio/src/safety.test.ts`, `DocumentEditor.test.tsx`, `extensions/extensions.test.ts` | migration, validation, read-only protected view, editor smoke tests, search across Unicode case changes |
| Embedded diagram export | `packages/document-studio/src/export/diagram-export.test.ts` | DOCX picture at document size with aspect ratio kept, never wider than the text, a clear note when a preview is missing, plain-text placeholder |
| Web storage hook | `apps/web/src/lib/storage.test.tsx` | debounced saves, no-op saves skipped, renames, conflicts and both resolutions, flush on unmount and hide, Ctrl/⌘+S versions, title kept while typing, retries then recoverable drafts, cross-tab updates |
| Upgrade safety | `tests/integration/v0.1.0-fixtures.test.ts` | a real v0.1.0 database upgrades to v2 without loss; every v0.1.0 document still opens |
| DOCX golden files | `tests/integration/docx-golden.test.ts` | exported DOCX XML (document, styles, numbering, rels, content types, headers, footers) of the 6 v0.1.0 fixtures matches reviewed snapshots in `tests/golden/docx/`; the same XML on a repeat export after other exports; mammoth reads every paragraph, heading, list item, table cell and image |
| Phase 4 goldens | `tests/integration/docx-format-golden.test.ts`, `docx-layout-golden.test.ts`, `kitchen-sink-v2-golden.test.ts` | snapshots in `tests/golden/docx-format/`, `docx-layout/`, `docx-v2/` and `odt-v2/`: formatting (styles, numbering), page layout (every `w:sectPr`, 5 headers, 5 footers), and one v2 document using every Phase 4 feature exported to DOCX (17 parts) and ODT (4 parts), with feature-by-feature XML assertions, the exact DOCX and ODT toast text, a mammoth re-read and an ODT re-import |
| Storage hardening | `packages/local-storage/src/hardening.test.ts`, `blobs.test.ts` | drafts per session, not-found errors, attachment clean-up, version compaction, atomic multi-purge |
| App storage hardening | `apps/web/src/lib/storage-hardening.test.tsx`, `platform.test.ts`, `preferences.test.ts`, `components/EditorFrame.test.tsx`, `pages/settings/SettingsPages.test.tsx` | honest save status, storage full, deleted elsewhere, drafts UI, emergency copies, cross-tab trash and purge, clean-up scheduling, adapter injection |
| Package boundaries | `tests/integration/boundaries.test.ts` | each package imports only the `@dcos` packages it is allowed to (Document Studio never imports Diagram Studio); no paid Tiptap Pro packages |
| Backend | `backend/tests/test_api.py` | health, info, CORS allow-list |

Browser tests (`e2e/`, Playwright) run in Chromium, WebKit and mobile Chromium, plus Firefox in CI: navigation and settings, document editing and export, diagram editing, embedded diagrams (insert, double-click edit, resize, DOCX), diagrams.net import/export, quick connect (click, drag, palette, keyboard, zoom/pan, undo/redo, touch), diagram safety in documents (Escape never discards work without asking, cut/copy/paste keep the whole diagram, inserting next to a selected diagram keeps it), storage problems (`save-problems`, `cross-tab`, `unsaved-drafts`), a privacy test that fails on any request to another origin (`privacy`), and Chromium-only storage tests (offline after first visit, data survives a browser restart, embedding while offline, another tab upgrading the database). Firefox does not launch on the local macOS 27 machine, so it is covered only in CI.

Phase 4 browser tests, in Chromium and WebKit, plus Firefox in CI (the `*-document.spec.ts` files also run on mobile Chromium):

| Spec | Covers |
|---|---|
| `e2e/ribbon-document.spec.ts` | the ribbon tabs in Simple and Advanced with keyboard navigation; links without `https://` and refused `javascript:` links (DS-7); pasted web pictures stored or marked (DS-3); a pasted diagram without data offers Remove (WEB-3, DS-8); the PDF menu wording (DS-5) |
| `e2e/home-formatting.spec.ts` | named styles, line spacing and the Paragraph dialog saved as schema 2 and kept after reload; the ruler by drag and keyboard; list styles shown by the browser and kept in DOCX; custom colours and sizes through copy and paste; phone width |
| `e2e/insert-document.spec.ts` | equations with live preview, double-click editing, bundled KaTeX fonts and native Word equations; equations in the print page (Chromium); shapes resized and exported as pictures; text boxes floated and exported as floating one-cell tables; picture alignment and captions; copy and paste of all of these |
| `e2e/layout-document.spec.ts` | paper size, a landscape two-column section, header/footer parts and page numbers saved and exported as Word sections; continuous sections; print wrappers and named pages; a landscape page in a Chromium PDF |
| `e2e/review.spec.ts` | a comment under the name from Settings, reply, resolve, reload and Word export; comments not printed and the document back to schema 1 after the last comment is deleted; spell check remembered and document language saved; Match case, Whole words and word count; the comments panel at phone width |
| `e2e/files-tabs-templates.spec.ts` | Word import as a new document with its report; a non-document file refused; ODT export imported back as the same document; open-items tabs (keyboard, reload, close, phone width); the new templates open and export to Word |
| `e2e/phase4-integration-document.spec.ts` | the curated Simple mode and full Advanced mode; every ribbon tab and control reachable at phone width; an equation in a table cell and a comment on a heading, saved and exported to Word |

A few tests are skipped by condition: the PDF and print-frame checks and one clipboard test outside Chromium (WebKit, and Firefox in CI), and the touch quick-connect test on non-touch projects.

IndexedDB tests run in Node against `fake-indexeddb`.

## Manual acceptance

[`tests/acceptance/CHECKLIST.md`](../tests/acceptance/CHECKLIST.md) tracks PRD §11. Before a release, also:

1. Open an exported `.docx` in Microsoft Word (Windows and macOS), Apple Pages and LibreOffice, and an exported `.odt` in LibreOffice. Record results in [DOCUMENT_COMPATIBILITY.md](DOCUMENT_COMPATIBILITY.md) §8. Done on 2026-11-13/14 for Pages (16 samples) and Word for Mac (2 of 16); Word for Windows, LibreOffice, the other 14 files in Word and ODT are still to do.
2. Save as PDF from Chrome, Safari and Firefox; check margins, header and footer parts, page numbers, columns and per-section orientation (only per-section orientation is verified automatically, in Chromium).
3. Load the app once, switch the device to airplane mode, reload, and create/edit/reopen a document and a diagram.
4. Export a backup, clear site data, restore, and confirm everything returns.

## Next

- Per-file coverage thresholds for storage and export code.
- Opening exported DOCX and ODT files in other word processors: manual. Done for Apple Pages (16 DOCX samples) and Word for Mac (2 of 16); LibreOffice, Word for Windows and ODT still pending.
- Validating exported DOCX and ODT against the OOXML and ODF schemas.
