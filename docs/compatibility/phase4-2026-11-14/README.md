# Phase 4 DOCX check in Microsoft Word and Apple Pages (2026-11-13/14)

This records what two word processors actually did with the 16 DOCX samples exported by commit `fe3275a`. It is the evidence behind [DOCUMENT_COMPATIBILITY.md §8](../../DOCUMENT_COMPATIBILITY.md#8-results-in-microsoft-word-and-apple-pages). Nothing here is a claim about other versions or about LibreOffice, which was not tested.

## What was tested and how

**Samples.** The real export functions (`buildDocx`) wrote the samples from these sources:

| File | Source |
|---|---|
| 01-format | `tests/golden/docx-format/format.fixture.json` |
| 02-layout-sections | `tests/golden/docx-layout/sections.json` |
| 03-insert, 04-review, 05-cross-feature | built in the sample script with the editor's own content (equations, shapes, text boxes, pictures; comments; cross-feature cases) |
| 06-kitchen-sink-v2 | `tests/golden/v2/kitchen-sink-v2.json` |
| 07-kitchen-sink-v0.1.0 | `tests/fixtures/v0.1.0/documents/kitchen-sink.json` |
| 10–18 | the nine document templates |

**Reference.** `expected-from-docx-xml.txt` lists what each file contains, read from its own XML: paragraphs, tables, equations (`m:oMath`), drawings, links, a table of contents, comments, headers, footers, and each section's orientation, columns, break type and page numbering.

**Microsoft Word for Mac 16.115.**
- No Microsoft 365 licence is active on this Mac, so Word opens files read-only. A banner says "Subscription Required to Edit and Save", and Save As PDF is refused.
- Each file was opened with `open -a "Microsoft Word"`. Word's object model was queried by AppleScript (`word-object-model/`), and the pages were viewed in Print Layout (`screenshots/word-*`).
- After 2 files the Mac's screen locked. When it was unlocked, Word showed its "Powering your experiences" privacy notice, which needs the owner's acknowledgement. The owner chose to skip the rest of the Word check.
- **Word therefore covers 2 of 16 files (01, 02) fully, plus object-model counts for 03.**

**Apple Pages (Pages Creator Studio, macOS 27.2.1).**
- Each file was opened with `open -a`. Pages' page, table and picture counts were read by AppleScript, the file was exported to PDF (`pages-pdf/`), and the PDF pages were inspected.
- Files were closed without saving.
- 04-review was also viewed in the Pages window to see its comments (`screenshots/pages-04-review-comments.jpg`).

**Not checkable here.**
- Comment text, authors, replies and resolved state in Pages: its comment pop-ups don't draw while the app is in the background.
- Whether either app honours a two-column layout in sections whose text is shorter than one column.

## Microsoft Word 16.115 (read-only)

| File | Opened | Result |
|---|---|---|
| 01-format | Yes, no repair prompt, 1 page | **Matches.** <ul><li>Word recognises the styles by name: Title, Subtitle, Heading 1–4, Quote, Caption, Code, List Paragraph.</li><li>Line spacing 1.15 (13.8 pt "multiple") and double.</li><li>Indents on both sides and a first-line indent.</li><li>The quote border, the code font and shading, the small italic centred caption, and the custom text colour and highlight.</li><li>List markers exactly as exported: ▪, – (nested), →, iii., iv., A., I., a., 1.</li></ul> |
| 02-layout-sections | Yes, 4 pages, 4 sections | **Matches.** <ul><li>P1 portrait cover: first-page header "COVER" and no page number.</li><li>P2 portrait: header "Physics / Lab report / Asha R." (left, centre, right) and footer "Draft … Page ii" (lower Roman).</li><li>P3 landscape: "Page 1", where numbering restarts; the continuous two-column section follows on the same page.</li><li>P4 portrait: "Page B" (capital letters, continuing).</li><li>The two columns can't be seen because the text is short.</li></ul> |
| 03-insert | Yes, 2 pages | Object model only: 2 tables and 10 inline pictures, matching the XML's 10 drawings (6 shapes, the equation outside the subset, 3 pictures). Not viewed. |
| 04–18 | Not checked | The check stopped (see above). |

## Apple Pages

| File | Opened | Pages | Result |
|---|---|---|---|
| 01-format | Yes | 1 | **Matches** the Word result above: styles, spacing, indents, quote, code, caption, colour, highlight, every list marker. The highlight box is taller than the text line (cosmetic). |
| 02-layout-sections | Yes | **5** (Word: 4) | Page numbering is correct: cover with none, ii, 1, 2, C. The left/centre/right headers and footers and the first-page header are correct. **Differences:** <ul><li>The landscape section is shown portrait.</li><li>The continuous section break starts a new page.</li><li>On the pages of the landscape section, the centre and right header parts sit too far right, because their tab stops were set for landscape width.</li></ul> |
| 03-insert | Yes | 2 | <ul><li>All 5 Word equations render as equations: E = mc², the cube root, the quadratic formula, the sum and the matrix. The equation outside the subset (the arc over AB) shows as its picture.</li><li>The 6 shapes show as pictures. The inline text box, the left- and right-aligned pictures with their captions, and "Page x of 2" are correct.</li><li>**Differences:** the floating text box sits above its paragraph instead of the text wrapping beside it. "coloured x + y" is black; the export toast already reports that equation colours are lost.</li></ul> |
| 04-review | Yes | 1 | Pages lists **4 comments**, anchored on the heading, "an open comment", "a resolved one" and the list item. The file has 6 comment entries: 4 threads and 2 replies. Pages shows the commented ranges highlighted. Text, authors, replies and resolved state weren't viewable (see above). |
| 05-cross-feature | Yes | 2 | <ul><li>Equations in a table cell, the styled list (I., nested d.) continuing after the break as II., the text box holding a list and a picture, and two columns with a picture and an equation are all correct.</li><li>**Differences:** the landscape section is portrait. The footer reads "Page 1 of 1" on both pages: Pages' total-pages field appears to count per section once numbering restarts (the file has 2 pages). In 03, with no restart, it shows "1 of 2" and "2 of 2".</li></ul> |
| 06-kitchen-sink-v2 | Yes | 6 | <ul><li>Pages fills in the table-of-contents field with its own page numbers.</li><li>Correct: formatting (1.5 spacing, colour, highlight, 13.5 pt, hanging, first-line and right indents), lists (▪, – nested, continuation paragraph, IV./V. from IV, nested b.), quote, code, caption, the three-part header, page numbers (cover none, ii, 1, 2, C, D), inline, display and in-cell equations, shapes as pictures, the right-aligned picture and caption, the table caption, the link, and two- and three-column layouts.</li><li>**Differences:** same as 02, 03 and 05. The landscape section is portrait, the continuous three-column section starts a new page, and the floating text box doesn't wrap.</li></ul> |
| 07-kitchen-sink-v0.1.0 | Yes | 3 | **Matches.** <ul><li>A landscape document, the table of contents with page numbers, and every mark: bold, italic, underline, strike, code, sub, super, highlight, font and colour, link.</li><li>Centred and right alignment, nested bullets (• ◦), ordered from 3 with a nested a., the quote, code block, horizontal rule, table with a header row and a merged cell, the page break, and "Header text" / "Footer text Page x of 3".</li><li>The file's single picture is a 1×1-pixel test image, invisible by design.</li></ul> |
| 10-template-blank | Yes | 1 | Matches: an empty page with "Page 1 of 1". |
| 11-template-assignment | Yes | 1 | Matches: centred title block, rule, headings, italic prompt, numbered references. |
| 12-template-lab-report | Yes | 2 | Matches: title block, bullet and numbered lists, the 4-column observations table, page numbers. |
| 13-template-essay | Yes | 1 | Matches. |
| 14-template-project-report | Yes | 3 | Matches: page header, page breaks; the table of contents is filled in by Pages (1, 3, …). |
| 15-template-research-paper | Yes | 4 | Matches: title page, centred section headings, the results table, the references page. |
| 16-template-mla-essay | Yes | 2 | Matches the template: header "Your Last Name", centred title, Works Cited page. |
| 17-template-cover-page | Yes | 2 | Matches: cover page with details table, then the writing page. |
| 18-template-formal-letter | Yes | 1 | Matches. |

**Earlier failure, not reproduced.** In the first attempt (2026-11-13), Pages showed "05-cross-feature.docx can't be opened right now. Pages couldn't read the file." That file differs from today's only in its creation timestamp (`docProps/core.xml`), and the same copy opens normally with `open -a`. The failure came from the earlier script opening a path Pages had no sandbox access to, not from the file.

## Summary

- **Pages opened all 16 files** with no errors or repair prompts. Text, styles, lists, tables, pictures, captions, equations (native for the documented subset), comment anchors, headers and footers, page-number formats and restarts, and the table of contents all came through.
- **What Pages does differently:**
  - Per-section orientation: a landscape section is shown portrait.
  - A continuous section break starts a new page.
  - Floating text boxes don't wrap their text.
  - After a numbering restart, the total-pages field counts per section.
  - The cosmetic differences noted above.
- **Word** showed 01 and 02 correctly, including sections, orientation, page-number restarts and formats, and three-part headers. Files 03–18 were not checked in Word.
