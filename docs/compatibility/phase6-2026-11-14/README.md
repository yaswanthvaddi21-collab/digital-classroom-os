# Phase 6 embedded-diagram samples, checked in Apple Pages (2026-11-14)

This records what Apple Pages did with the Phase 6 DOCX sample. It is evidence for [DOCUMENT_COMPATIBILITY.md](../../DOCUMENT_COMPATIBILITY.md) and [ADR 0013](../../adr/0013-document-diagram-integration.md). It says nothing about Word, LibreOffice or other versions of Pages, which were not tested (TD-53).

## The samples

The Round 3 integrator made these files from the real app in Chromium, on the uncommitted Phase 6 tree on top of `8f772ba`. The document is the Assignment template with two embedded diagrams:

1. **Flowchart** ("Odd or even"): aligned right, with the caption "Figure 1. Odd or even: a flowchart" and the alt text "Flowchart that reads a number and prints whether it is odd or even". 590 × 720 px.
2. **Mind map** ("Photosynthesis"): centred, no caption. 602 × 560 px, the full text width.

| File | What it holds |
|---|---|
| `phase6-sample.docx` | Each diagram is an SVG with a PNG fallback (`asvg:svgBlip`). The PNG carries the editable diagram in an iTXt chunk named `dcos-diagram`. |
| `phase6-sample.odt` | Each frame holds the SVG and then the PNG (two `draw:image`). |
| `phase6-sample.pdf` | The app's print output, saved with Chromium's PDF printer. |
| `phase6-sample.dcosdoc` | The Classroom OS document file: content schema 3 and both preview pictures. |

## Apple Pages (Pages Creator Studio, macOS 27.2.1)

**How it was checked.**
- `phase6-sample.docx` was opened with `open -a`.
- AppleScript read the page and picture counts and each picture's description, exported the file to PDF (`pages-pdf/phase6-sample-docx.pdf`), and closed it without saving.
- The PDF pages were then rendered to images and viewed.

| Check | Result |
|---|---|
| Opens | Yes. No error or repair prompt. |
| Pages | 3 (cover and text, flowchart, mind map). |
| Pictures | 2. Their descriptions are "Flowchart" plus the alt text above, and "Mind map". |
| Drawings | Both diagrams are complete and sharp, at their own proportions, not stretched or letterboxed. |
| Caption | "Figure 1. Odd or even: a flowchart" is below the flowchart, small and italic, aligned right. |
| Alignment | The flowchart is 590 of the 602 px text width, so its right alignment shows only as a 12 px shift. |

AppleScript reports a picture size of 0 × 0 for inline pictures, so the size was judged from the rendered pages.

## Not checked

- Word: it is unlicensed on this Mac (read-only) and blocked by its privacy notice; see the [Phase 4 check](../phase4-2026-11-14/README.md).
- LibreOffice is not installed, so the ODT sample was not opened in another app.
- Whether a DOCX saved again by Pages or Word still carries the editable data in its PNG.
- Importing these files back into the app is covered by automated tests, not this check: `e2e/diagram-embed-export.spec.ts` and `tests/integration/phase6-cross-feature.test.ts`.
