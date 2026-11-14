# Document compatibility

What Document Studio writes when it exports a document, what it reads when it imports one, and what older versions of the app can open. This describes the code at the end of Phase 4. Design decisions are in [ADR 0011](adr/0011-document-format-phase4.md); the module layout is in [ARCHITECTURE.md](ARCHITECTURE.md#document-studio).

**Evidence.** Every statement below rests on the export and import code in `packages/document-studio/src` and on automated tests: XML assertions, golden snapshots of the exported XML, a re-read of every exported DOCX by an independent parser (mammoth), and round trips through the app's own importers (§7). On 2026-11-13/14 the 16 sample DOCX files were opened in **Apple Pages (all 16)** and **Microsoft Word for Mac 16.115 (2 of 16, read-only)**; §8 has the results. No ODT file has been opened in another word processor, nothing has been tested in LibreOffice or Word for Windows, and no file has been validated against the OOXML or ODF schemas.

## 1. Terms

| Term | Meaning |
|---|---|
| **Native** | Written as the format's own construct (for example a Word section, a Word comment or a Word equation). |
| **Approximation** | Written as something else that keeps the content (for example a shape as a picture). The export toast says so. |
| **Left out** | Not written. The export toast says so, except where this page lists it as a silent mapping. |
| **Silent mapping** | A deliberate conversion that loses nothing the user can see in the editor, or that is too small for a toast. Listed in this page instead. |

The export toast is built by `exportToast()` in `export/report.ts`. With nothing to report it reads "Exported Word document" (or "Exported OpenDocument text") as a success. Otherwise it reads "Exported Word document." followed by one sentence per kind of approximation, with counts, as an information toast. §4 lists every sentence.

## 2. Older versions of the app

Stored documents carry a content schema number (`schemaVersion`).

- **Schema 1** is what v0.1.0 could store. The vocabulary of v0.1.0 (every node and mark type, each attribute and its default, the top-level fields, the page fields, the paper sizes A4 and Letter, the orientations, the margin keys and the two editing modes) is frozen in `compat.ts` (`V010_VOCABULARY`).
- **Schema 2** is anything outside that vocabulary: an embedded diagram (since Release 0.2), and every Phase 4 feature that stores something new. `contentSchemaFor()` decides this on every save, so the number follows the content: deleting the last comment or section break makes the document schema 1 again (tested in `e2e/review.spec.ts` and `e2e/layout-document.spec.ts`).

What makes a document schema 2:

| Schema 2 | Stays schema 1 |
|---|---|
| A node type v0.1.0 did not have: `diagram`, `inlineMath`, `blockMath`, `shape`, `textBox`, `sectionBreak` | Fonts, font sizes (including custom sizes), text and highlight colours (including custom colours): these use attributes v0.1.0 already had |
| A mark type v0.1.0 did not have: `comment` | Headings 1–4, Quote and Code styles: nodes v0.1.0 already had |
| A new attribute with a value other than its default: line spacing, spacing before or after, indents, the Title/Subtitle/Caption style, bullet style, number format, picture alignment or caption | A new attribute left at its default (null) |
| A page setting v0.1.0 did not have, set to a non-default value: A3, A5 or Legal paper, header and footer left/right parts, a different first page, columns, page number format, start, position or wording | Page settings at their defaults; the default layout fields are filled in on load and written on the next save, which v0.1.0 ignores |
| A top-level field: `comments` (when not empty) or `language` (when set) | An ordered list start number (`orderedList.start` existed in v0.1.0) |

**Compatibility rule.** v0.1.0 understands schema 1 only. It refuses a whole backup file whose `schemaVersion` (the highest content schema in it) is above 1 ([ADR 0007](adr/0007-backup-format.md)), and it cannot open a database written by a newer version ([ADR 0006](adr/0006-migrations-and-safety-copies.md)). So a document that uses any feature in the left column reaches v0.1.0 only after that feature is removed. All built-in templates, including the four added in Phase 4, are schema 1 (tested in `compat.test.ts`).

**This version, opening content it does not understand.** A node type, mark, attribute value, page setting, editing mode or top-level field that this version does not know opens the document in the protected read-only view, with the reason. The stored original is never changed when a document is opened (`prepareDocument()` in `safety.ts`). Tested in `safety.test.ts`, `layout.test.ts` and `review/review.test.ts`.

## 3. Export, feature by feature

DOCX is built with the `docx` library (`export/docx/`). ODT is written by the app's own exporter (`export/odt/`). Print/PDF is the browser's print dialog on a copy of the editor page (`export/print.ts`, `export/printLayout.ts`). TXT is `export/text.ts`.

In the DOCX column, the automated checks are XML-level. What Word and Pages actually showed is in §8: Pages was checked with all 16 samples, Word with two (formatting and lists; sections, page numbering and headers and footers). A row is not "verified in Word" unless §8 says so.

### 3.1 Text and paragraphs

| Feature | DOCX | ODT | Print/PDF | TXT |
|---|---|---|---|---|
| Bold, italic, underline, strike, sub/superscript, inline code | Native | Native | As on screen | Text only |
| Fonts | Native (font name; fonts are not embedded) | Native (font name) | As on screen | Text only |
| Font size, custom sizes | Native (half points) | Native | As on screen | Text only |
| Text colour, custom colour | Native (`w:color`). Named, `hsl()` and `rgb()` colours are converted | Native | As on screen | Text only |
| Highlight, custom highlight | **Approximation:** the nearest of Word's 16 highlight colours; exact matches are kept. Toast: "1 highlight colour was changed to Word's nearest highlight colour". A text background colour (not a highlight) is written as shading | Native | As on screen | Text only |
| Alignment | Native, including list and quote paragraphs | Native | As on screen | — |
| Line spacing (1.0, 1.15, 1.5, 2.0, custom) | Native: `w:line` = multiple × 240, auto. Body text with no setting is written as 295 (CSS 1.5 ÷ Calibri's single line of 1.2207). Silent: a line height pasted in as text style becomes paragraph spacing, the largest in the paragraph; a stored line spacing replaces it | Native (`fo:line-height`) | As on screen | — |
| Spacing before and after | Native (twips) | Native | As on screen | — |
| Indents: left, right, first line, hanging | Native (`w:ind`). List paragraphs take only left and right indents, as in the editor. Silent: a stored hanging indent larger than the left indent is written limited to the left indent (stored JSON is kept as stored) | Native | As on screen | — |
| Named styles: Normal, Title, Subtitle, Heading 1–4, Quote, Caption, Code | Native: real styles in `styles.xml` with sizes, colours and spacing worked out from the editor's look, referenced by `w:pStyle` (also in table cells) | Native: Title, Subtitle and Caption as named ODF styles; headings as `Heading N`; quotes in the `Quotations` style and code in `Preformatted Text` | As on screen | Text only |
| Quotes and code blocks | Native styles | Each quote and each code block is an ODF section named "Quotation N" or "Code N", so neighbouring ones stay apart on re-import. Inside a list item no section is written (ODF allows none there) | As on screen | Text only |
| Document language | Native: `w:lang` in the document defaults (`eastAsia` for zh, ja, ko; `bidi` for ar, he, fa, ur) | Native (`fo:language` and country in the default style) | Silent: the print page has no `lang` attribute | — |

### 3.2 Lists

| Feature | DOCX | ODT | Print/PDF | TXT |
|---|---|---|---|---|
| Bulleted and numbered lists, nesting | Native, a numbering instance per list | Native | As on screen | Markers and indents |
| Bullet glyphs (disc, circle, square, dash, arrow) | Native (`w:lvlText` glyph). A styled list uses its glyph on every level of its own definition | Native (`text:bullet-char`) | CSS list markers | The chosen glyph |
| Number formats (1, a, A, i, I) and start number | Native (`w:numFmt`, start and `startOverride`), nested lists included | Native (`style:num-format`, `text:start-value`). **Approximation:** nested lists at the same level with different styles share the first one's style ("1 nested list's bullet or number style was written as that of the first list at its level (ODT lists share one style per level)") | CSS | The chosen format and start |
| Table inside a list | Native | **Approximation:** written after the list ("1 table inside a list was written after the list, as lists in ODT files cannot hold tables") | As on screen | Tab-separated rows |

### 3.3 Tables, pictures, links, table of contents, diagrams

| Feature | DOCX | ODT | Print/PDF | TXT |
|---|---|---|---|---|
| Tables, merged cells, header row | Native. Column widths come from the widths set in the editor; cells after a row span sit in their own column. Silent: a table wider than the text is scaled to fit | Native, with column widths | As on screen | One tab-separated row per line; images, equations, lists and the table of contents inside a cell keep their text form |
| Pictures (PNG, JPEG, GIF, BMP) | Native, scaled to the text (or column) width | Native | As on screen | `[Image: alt]` |
| Pictures in other formats (WebP, SVG data URLs) | **Placeholder:** "1 image in a format Word cannot show was written as a placeholder" | Native (ODT can hold SVG and WebP) | As on screen | `[Image: alt]` |
| Pasted web pictures that could not be stored (marked "Not saved for offline use" in the editor) | **Placeholder** `[Image not saved for offline use: alt — url]`: "1 image was not saved for offline use and was written as a placeholder" | Placeholder, same sentence | The picture loads from the web, if online; the badge is not printed | `[Image: alt]` |
| Picture alignment (left, centre, right) and caption | Native: paragraph alignment and keep-with-next, then a paragraph in the Caption style. Silent: the caption also carries direct formatting (10 pt italic, #4B4B55) matching the editor | Native | As on screen (figure and caption) | `[Image: alt]` then the caption line |
| Links | Native for http, https, mailto and other allowed schemes; scheme-less stored links get `https://`. Disallowed addresses (`javascript:`, `data:`) and `#anchors` are written as text: "1 link with an unsupported address was written as plain text" | Same rule and sentence | As on screen | Text only |
| Table of contents | Native: a real Word TOC field over Heading 1–4, with the current entries as its cached result. **Approximation:** "The table of contents was written without page numbers; they are added when its field is updated in Word". Silent: a table of contents inside a table cell is written as plain paragraphs | Native: an ODF index with the current entries (plain paragraphs inside a table cell). "The table of contents was written without page numbers; they are added when it is updated in your word processor" | As on screen, without page numbers | "Table of Contents" and the headings, indented by level |
| Page breaks | Native | Native (a paragraph with a page break after it) | Native | Form feed |
| Embedded diagrams | The PNG preview. Without a preview: placeholder, "1 diagram has no preview and was written as a placeholder" | Same | The preview | `[Diagram: title]` |

### 3.4 Equations, shapes and text boxes

| Feature | DOCX | ODT | Print/PDF | TXT |
|---|---|---|---|---|
| Equations (inline and display, LaTeX) | **Native** Word equations (OMML: `m:oMath`, display ones in `m:oMathPara`), converted by the `docx` library's `latexToMath`. The subset it reads is listed at the top of `export/docx/insert.ts` (fractions, scripts, roots, large operators, functions, `\left…\right`, accents, braces, boxes, font commands, `\text`, Greek and symbols, matrix, cases and aligned). Outside the subset: **picture** of the editor's rendering with the LaTeX as alt text ("1 equation Word cannot edit natively was written as a picture"); where the browser cannot draw that picture, the **LaTeX as text** ("1 equation could not be converted and was written as its LaTeX text"). `\color` and `\textcolor` are dropped ("1 equation lost its colours (Word equations are written in one colour)"). A link or bold on an inline equation is dropped ("1 equation lost its link or text formatting (Word equations take neither)"). Silent: `\label` is dropped, `\tag{n}` becomes Word's `#(n)` numbering, display/text style commands are ignored | **Approximation:** the LaTeX as text, `$…$` or `$$…$$` ("1 equation is not supported in ODT files yet and was written as text") | KaTeX rendering, with the KaTeX CSS and bundled fonts in the print page | `$latex$` inline, `$$latex$$` on its own line |
| Shapes (rectangle, rounded rectangle, ellipse, line, arrow, callout) | **Approximation:** a PNG drawn at 2× from the same SVG as on screen, at the shape's size and alignment, with alt text ("1 shape was written as a picture"). When it cannot be drawn: `[Shape: label]` placeholder ("1 shape could not be drawn and was written as a placeholder") | **Approximation:** `[Shape: label]` as text ("1 shape is not supported in ODT files yet and was written as text") | The SVG, as on screen | `[Shape: label]` |
| Text boxes (border, fill, width, in line or floated) | **Approximation:** a **one-cell table** (not a Word text box) with the box's border, fill and width; a floated box is a floating table (`w:tblpPr`, left or right). "1 text box was written as a one-cell table". A box inside a table cell or another box is written in line | **Approximation:** the box's content in place, without the box ("1 text box is not supported in ODT files yet; its text was kept") | As on screen | The box's content in place |

### 3.5 Page layout

| Feature | DOCX | ODT | Print/PDF | TXT |
|---|---|---|---|---|
| Paper size A3, A4, A5, Letter, Legal; orientation; margins | Native (`w:pgSz`, `w:pgMar`) | Native (page layout) | Native (`@page size`) | — |
| Section breaks (next page, continuous) | **Native** Word sections (`w:type` nextPage or continuous). Silent: an empty section (one at the very start, or an empty one followed by a next-page section) is dropped, as print drops it; its page-number restart carries to the next section unless that one restarts itself. A break inside a table, list or quote is left out: "1 section break inside a table, list or quote was left out" | **Approximation:** a next-page break becomes a page break ("1 section break was written as a page break (sections with their own page layout are not supported in ODT files yet)"); a continuous one is left out ("1 continuous section break was left out (sections are not supported in ODT files yet)") | A wrapper per section with its columns, and a CSS named page per orientation; next-page sections start a new page | `[Section break: next page]` plus a form feed, or `[Section break: continuous]` |
| Orientation per section | Native (`w:pgSz w:orient` per section) | Left out (part of the section sentences above) | CSS named pages. **Verified only in Chromium** | — |
| Columns (1–3, spacing) | Native (`w:cols`), per section; pictures and tables fit one column | The first section's columns only, as page-style columns for the whole document; later sections' columns are part of the section sentences above | CSS `column-count` per section | — |
| Header and footer, left/centre/right parts | Native: one paragraph with centre and right tab stops at each section's text width (a centre-only header stays a centred paragraph, as in v0.1.0) | Native | CSS page margin boxes. **Need a recent Chromium (131+)**; Safari and Firefox leave them out | Not included |
| Different first page | Native (`w:titlePg`, first header and footer; empty ones written as empty paragraphs) | Native (`style:header-first`, `style:footer-first`, ODF 1.3) | `@page :first` margin boxes (Chromium) | — |
| Page numbers: format (1, i, I, a, A), start, position, wording ("Page 1 of 9", "Page 1", "1") | Native (`PAGE` and `NUMPAGES` fields, `w:pgNumType` fmt and start per section). Silent: the total in "Page 1 of N" counts every page and is written as 1, 2, 3 (also said in the Page numbers dialog) | Native. When the document does not start with a paragraph: "The starting page number was left out: in ODT files it is set on the first paragraph, and this document starts with something else" | CSS counters; restarts per section use their own counters. **Not verified in a browser** (only the print CSS is checked) | Not included |

### 3.6 Review

| Feature | DOCX | ODT | Print/PDF | TXT |
|---|---|---|---|---|
| Comments, replies, resolved state | **Native** Word comments: author (or "Unknown author" when no name is set), initials, date, one paragraph per line, the range around the commented text (across paragraphs, links and table cells). Replies are linked to their parent (`commentsExtended.xml`, `w15:paraIdParent`) and resolved threads are marked `w15:done`. **Approximation:** the `docx` library writes the resolved state only when the document has at least one reply, so otherwise "1 resolved comment was written as an open comment". Comments on deleted text: "1 comment on deleted text was left out". Silent: a range covers text runs only | **Left out:** "Comments are not supported in ODT files yet and were left out (the commented text was kept)" | Not printed (no highlight, no threads) | A "Comments" list after the text: quoted text, author, date, replies, resolved state, and comments on deleted text |
| Spell-check setting | Not part of the file | Not part of the file | — | — |

## 4. Export toast sentences

These are the exact sentences (one occurrence shown; counts above one use the plural). The source is `NOTES` in `export/report.ts` and `ODT_NOTES` in `export/odt/notes.ts`, except the ODT list sentences (`export/odt/lists.ts`) and the ODT starting-page-number and page-setting sentences (`export/odt/index.ts`). `tests/integration/kitchen-sink-v2-golden.test.ts` pins the complete toast text for both formats.

**DOCX** ("Exported Word document. …")

- "1 image was not saved for offline use and was written as a placeholder"
- "1 image in a format Word cannot show was written as a placeholder"
- "1 diagram has no preview and was written as a placeholder"
- "1 link with an unsupported address was written as plain text"
- "1 highlight colour was changed to Word's nearest highlight colour"
- "The table of contents was written without page numbers; they are added when its field is updated in Word"
- "1 comment on deleted text was left out"
- "1 resolved comment was written as an open comment"
- "1 equation Word cannot edit natively was written as a picture"
- "1 equation could not be converted and was written as its LaTeX text"
- "1 equation lost its colours (Word equations are written in one colour)"
- "1 equation lost its link or text formatting (Word equations take neither)"
- "1 shape was written as a picture"
- "1 shape could not be drawn and was written as a placeholder"
- "1 text box was written as a one-cell table"
- "1 section break inside a table, list or quote was left out"

**ODT** ("Exported OpenDocument text. …"): the shared sentences for remote images, diagram previews and links above, plus

- "1 image in a format ODT files cannot hold was written as a placeholder"
- "The table of contents was written without page numbers; they are added when it is updated in your word processor"
- "Comments are not supported in ODT files yet and were left out (the commented text was kept)"
- "1 equation is not supported in ODT files yet and was written as text", and the same form for shapes
- "1 text box is not supported in ODT files yet; its text was kept"
- "1 section break was written as a page break (sections with their own page layout are not supported in ODT files yet)"
- "1 continuous section break was left out (sections are not supported in ODT files yet)"
- "1 nested list's bullet or number style was written as that of the first list at its level (ODT lists share one style per level)"
- "1 table inside a list was written after the list, as lists in ODT files cannot hold tables"
- "The starting page number was left out: in ODT files it is set on the first paragraph, and this document starts with something else"
- Generic sentences for anything a later feature adds before the ODT exporter learns it, so it is never dropped silently: a node type ("1 “x” item is not supported in ODT files yet and was left out"), a mark, an attribute ("The “x” setting of y items is not supported in ODT files yet and was left out"), a page setting or a document field.

**Print/PDF.** The export menu says the browser's print dialog is used ("choose “Save as PDF”") and that the header, footer and page numbers need a recent Chrome or Edge. Where the browser is detected as lacking page margin boxes (Safari, Firefox, iOS browsers; `export/printSupport.ts`, by user agent), the menu says so, and printing a page that has a header, footer or page numbers shows: "This browser's print dialog leaves out the header, footer and page numbers. They need a recent Chrome or Edge."

## 5. Import

Import always creates a **new** document; it never changes an existing one. Entry points: "Import Word document" on the Documents list and "Import a file" in the New dialog (`apps/web/src/components/ImportDocument.tsx`). The format is recognised from the file's contents, not its name. An older `.doc` file, a file that is not a document, a damaged file, and a package that would unpack to more than 512 MB are refused with a readable message. The import runs on the main thread, so a large file blocks the tab while it imports.

After an import with anything to report, an "Imported with notes" dialog lists one sentence per kind of loss (most from `IMPORT_NOTES` in `import/common.ts`, a few written in `import/docx.ts` and `import/odt.ts`).

### 5.1 DOCX import (mammoth)

| Read | Reported, not imported (dialog sentence, one occurrence) |
|---|---|
| Headings (levels 5–6 become 4: "1 heading below level 4 was imported as a level 4 heading") | Comments ("1 comment was not imported") |
| Paragraphs; bold, italic, underline, strikethrough, sub/superscript | Equations ("1 equation was not imported") |
| Paragraph alignment (centre, right, justify) | Charts, drawing shapes |
| Title, Subtitle, Caption, Quote and Intense Quote styles | Text boxes: their text becomes ordinary paragraphs ("The text of 1 text box was imported as ordinary paragraphs") |
| Lists (as 1, 2, 3 and default bullets) | List numbering formats and start numbers ("List numbering formats and start numbers were not imported (lists are numbered 1, 2, 3)") |
| Tables with merged cells and header rows | Fonts, text sizes, text colours, highlighting, paragraph spacing and indents (named in one sentence, e.g. "Fonts and text sizes were not imported") |
| Links (the editor's own link check decides; refused ones become text: "1 link with an unsupported address was imported as plain text") | Section breaks ("1 section break was not imported; the whole document uses one page layout") and section columns |
| Embedded pictures (inlined as data URLs), picture alignment (left, as in a Word paragraph with no alignment or a left one; centre; right), captions in the Caption style; a page break in the middle of a paragraph splits the paragraph there | Page number format and start; a different first page; left/centre/right header and footer parts ("…was imported as one centred line") |
| Page breaks; the table of contents (as a live table of contents) | Pictures in EMF, WMF or TIFF (replaced by a visible note); linked pictures |
| Footnotes and endnotes, as a numbered "Notes" list at the end | Tracked changes are accepted ("Tracked changes were accepted (insertions kept, deletions removed)") |
| Page size (nearest size this app has, with a note when it differs), orientation, margins, header and footer text, page numbers | Word styles this app does not have are named |
| The document language (`w:lang` in the document defaults) | |

Coverage: `import/docx.test.ts`, `import/word-files.test.ts` (11 Word files from mammoth's own test suite, BSD-2, in `tests/fixtures/docx-import`), `apps/web/src/components/ImportDocument.test.tsx`, and `e2e/files-tabs-templates.spec.ts`.

### 5.2 ODT import

Reads everything the ODT export writes: paragraphs, headings, marks, colours, fonts and sizes, alignment, line spacing, spacing and indents (from a paragraph's own automatic style only), Title/Subtitle/Caption and styles based on them, lists with glyphs, number formats and start numbers (a heading later in a list item stays a heading), tables with merged cells and sized column widths (equal widths stay unsized), pictures with alignment and captions, links, page breaks, the table of contents, quotes and code blocks written as "Quotation N" / "Code N" sections, page size, orientation, margins, header and footer parts, a different first page, page number format, start and position, columns (up to 3; "The 4 text columns were imported as 3, the most this app has"), and the language of the default paragraph style.

Reported, not imported: comments (`office:annotation`), footnotes and endnotes (imported as notes at the end), text boxes (their text is kept), embedded objects, drawing shapes, linked or unsupported pictures, headings below level 4 (imported as level 4), tracked changes, section columns and other indexes (imported as plain text).

Coverage: `export/odt.test.ts` (round trips of every template and of the Phase 4 features, plus two hand-written packages laid out as other word processors write them) and `e2e/files-tabs-templates.spec.ts` (export, then import, gives the same document).

## 6. Print and PDF

PDF is made by the browser: the export opens the print dialog on a hidden copy of the page, and the user chooses "Save as PDF". The text stays selectable. No PDF file is produced by the app itself.

- Plain CSS, expected to work in any browser: text, formatting, tables, pictures, shapes, text boxes, columns per section, page breaks and next-page section breaks. Equations print with KaTeX's CSS and bundled fonts; the automated print-page check for them runs in Chromium only.
- Needs page margin boxes (Chromium 131 or later; not Safari or Firefox): header and footer parts, page numbers with their format, start and position, and the first page's own header and footer.
- Verified only in Chromium (Playwright's Chromium, by reading the PDF's page sizes): a section's own orientation (CSS named pages). WebKit and Firefox were not checked. Restarted page numbers (custom CSS counters) are checked only as print CSS, in no browser.
- Comments are never printed. The "Not saved for offline use" badge is not printed.
- The editor screen is not paginated: it shows one continuous sheet in one column, with section breaks as labelled lines and the footer page number as "#". The Layout tab's "How layout prints" note and the Section dialog say this.

## 7. Tests that pin each format

| Format | Test | What it pins |
|---|---|---|
| DOCX, v0.1.0 content | `tests/integration/docx-golden.test.ts`, snapshots in `tests/golden/docx/<fixture>/` | `document.xml`, `styles.xml`, numbering, rels, content types, headers and footers for the 6 v0.1.0 fixtures; the same XML on a repeat export; mammoth reads every paragraph, heading, list item, table cell and image |
| DOCX, formatting | `tests/integration/docx-format-golden.test.ts`, `tests/golden/docx-format/` | Named styles, spacing, indents, colours, sizes, bullet glyphs and number formats (`document.xml`, `numbering.xml`, `styles.xml`); mammoth reads every paragraph and list item |
| DOCX, page layout | `tests/integration/docx-layout-golden.test.ts`, `tests/golden/docx-layout/` | A different first page, header and footer parts, roman/restarted/letter page numbers, landscape and two-column sections: body with every `w:sectPr`, 5 headers, 5 footers |
| DOCX and ODT, every Phase 4 feature | `tests/integration/kitchen-sink-v2-golden.test.ts`, fixture `tests/golden/v2/kitchen-sink-v2.json`, snapshots in `tests/golden/docx-v2/kitchen-sink/` and `tests/golden/odt-v2/kitchen-sink/` | 17 DOCX parts (including comments and commentsExtended) and 4 ODT parts; feature-by-feature XML assertions; the exact DOCX and ODT toast text; mammoth re-read; ODT re-import |
| DOCX, unit | `export/docx.test.ts`, `export/docx/format.test.ts`, `export/layout-export.test.ts`, `export/insertExport.test.ts`, `review/review.test.ts`, `crossFeature.test.ts` | XML for each feature and fallback, toast wording, deterministic output |
| ODT | `export/odt.test.ts` | Package order (uncompressed `mimetype` first), well-formed parts, each feature, toast wording, round trips |
| Print/PDF | `export/docx.test.ts` ("print page safety", "print support"), `export/layout-export.test.ts`, `e2e/layout-document.spec.ts`, `e2e/insert-document.spec.ts` | Escaping of header and footer text, margin-box CSS, section wrappers and named pages, a landscape page in a Chromium PDF, KaTeX in the print page (Chromium) |
| TXT | `export/docx.test.ts` ("text export never drops content silently", table cells), `export/layout-export.test.ts`, `export/insertExport.test.ts`, `review/review.test.ts` | Exact text output, markers, the comments appendix |

Snapshots change only by a reviewed update (`npx vitest run -u`).

## 8. Results in Microsoft Word and Apple Pages

Checked on 2026-11-13/14 with the 16 DOCX samples exported by commit `fe3275a`. Per-file results, Pages PDFs, Word screenshots and the expected structure of each file are in [compatibility/phase4-2026-11-14/](compatibility/phase4-2026-11-14/README.md). Only what is listed here was seen; anything else is untested.

**Apple Pages (Pages Creator Studio, macOS 27.2.1): all 16 files opened**, with no error or repair prompt.

| Area | Seen in Pages |
|---|---|
| Paragraph formatting, named styles, colours, highlight, font sizes | As exported (01, 06, 07) |
| Lists: bullet glyphs, number formats, start numbers, nesting, continuation paragraphs | As exported (01, 05, 06, 07, templates) |
| Tables: header rows, merged cells, column widths, equations in cells | As exported (05, 06, 07, 12, 15, 17) |
| Pictures: left/centre/right alignment, captions | As exported (03, 06) |
| Equations (OMML subset) | Render as equations (03, 05, 06). The equation outside the subset shows as its picture. Equation colour is lost, as the export toast says |
| Shapes | Shown as pictures, as exported (03, 06) |
| Text boxes | In-line ones as exported. **Floating ones sit above their paragraph instead of the text wrapping beside them** (03, 06) |
| Comments | Anchored on the right text (04: 4 threads; the file holds 4 threads and 2 replies). Comment text, authors, replies and resolved state could not be viewed |
| Headers and footers (left/centre/right parts, first page) | As exported (02, 06, 07, templates) |
| Page-number formats and restarts | As exported (02: ii, 1, 2, C; 06: ii, 1, 2, C, D) |
| Section orientation | **A landscape section after a portrait one is shown portrait** (02, 05, 06). A landscape document is shown landscape (07). On such pages the centre and right header parts sit too far right, because their tab stops were set for landscape width |
| Continuous section breaks | **Start a new page in Pages** (02, 06) |
| Columns | Two and three columns shown (05, 06) |
| "Page x of y" | Correct without a restart (03, templates). **After a numbering restart, Pages' total counts per section ("Page 1 of 1" on both pages of 05)** |
| Table of contents | Pages fills in the field with its own page numbers (06, 07, 14) |

**Microsoft Word for Mac 16.115: 2 of 16 files checked.** No licence is active, so Word opens files read-only and refuses to save PDFs. After two files, Word's "Powering your experiences" privacy notice blocked further opening, and the owner chose to skip the rest.
- **01-format** matches: styles by name, line spacing 1.15 and double, indents, quote, code, caption, colours, every list marker.
- **02-layout-sections** matches: 4 pages; a portrait cover with only the first-page header; "Page ii" in lower-case Roman; a landscape section restarting at "Page 1"; a portrait appendix at "Page B"; headers in three parts.
- **03-insert** was read through Word's object model only (2 tables, 10 pictures).
- Comments, equations, text boxes, shapes, the table of contents and the templates **have not been seen in Word**.

**Not tested:** Word for Windows, LibreOffice, Google Docs, and any ODT file in another word processor.

## 9. Known limitations

**Not verified**

- Word has been checked with only 2 of the 16 DOCX samples, LibreOffice and Word for Windows not at all, no ODT file has been opened in another word processor, and nothing has been validated against the OOXML or ODF schemas (§8).
- In Apple Pages: a landscape section after a portrait one is shown portrait, a continuous section break starts a new page, floating text boxes don't wrap their text, and after a numbering restart "Page x of y" counts per section (§8).
- Print orientation per section is verified only in Chromium; restarted page numbers in print are not verified in any browser.
- ODT uses ODF 1.3 `header-first`/`footer-first`, which older LibreOffice versions may not read (not checked).

**Editor**

- No real pagination on screen: one continuous sheet, one column, approximate page markers only (§6).
- PDF goes through the browser's print dialog; header, footer and page numbers need a recent Chromium.
- Shapes cannot be rotated or placed freely (block-level, aligned left, centre or right); a shape's label is plain text in one size.
- Pasting HTML from other sites does not turn `<figure>`/`<figcaption>` into a caption; only this app's own captions round-trip.
- A pasted web picture is fetched once; most sites refuse cross-site reads, so many stay marked "Not saved for offline use" and export as placeholders.
- Whether the browser's spell checker follows the document language depends on the browser and its installed dictionaries.
- Undo history is in memory only. Undoing "add comment" leaves the thread under "On deleted text" until deleted; deleting a thread cannot be undone (by design).
- Copying commented text within a document gives one thread over two places; DOCX makes one range from the first to the last.
- The APA and MLA templates lack double spacing, hanging indents in the reference lists and MLA's right-aligned running head. They are kept at schema 1 so v0.1.0 can open them; changing that is an owner decision.

**DOCX export**

- Equations outside `latexToMath`'s subset become pictures (or LaTeX text when the browser cannot draw the picture; reported).
- Shapes are pictures and text boxes are one-cell tables (reported).
- Resolved comments stay open in documents without replies (reported).
- Deterministic table-of-contents bookmarks rely on an internal property of `docx` 9.15.3 (`Body.headingBookmarkIds`); after a `docx` upgrade the determinism tests would flag a change.

**ODT export**

- No comments, no native equations (LaTeX text), no shapes (text), no text boxes (content kept), no real sections: per-section orientation, columns and page-number restarts are not written (all reported).

**DOCX import**

- Phase 4 layout and list settings are not imported (page number format and start, first page, header and footer parts, list formats and start numbers; all reported), nor fonts, sizes, colours, highlighting, spacing and indents (reported).
- The formatting sentence is worked out from the raw XML, so it can name formatting that was in fact imported (for example a caption's own formatting).
- Private-use characters U+E000 and U+E001 in the document's own text are read as internal alignment and page-break markers.
- Word writes a default language into almost every file, so most imported Word documents get a document language and become schema 2 (§2) without a note.

**ODT import (round trip through the app's own export)**

- A table cell's own alignment comes back as paragraph alignment (same look).
- A line height set as text style comes back as paragraph line spacing.
- Quotes and code blocks inside a list item are written without a section, so two in a row can merge on re-import.
- Repeated rows and columns are capped per row (50) and per cell (64) but not in total; a small crafted file can produce a very large table and exhaust memory.
