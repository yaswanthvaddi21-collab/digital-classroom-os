# Phase 7 presentation samples (2026-11-15)

These are the exports to open in presentation software and PDF readers. They are evidence for [ADR 0014](../../adr/0014-presentation-studio.md), [RELEASE_GAPS.md](../../audit/RELEASE_GAPS.md) §11 and TD-55 in [TECHNICAL_DEBT.md](../../audit/TECHNICAL_DEBT.md).

They replace the Round 3 samples. Those were saved in the session scratchpad (`phase7/samples/`), which a Mac restart cleared on 2026-11-15, so they no longer exist.

## How they were made

On 2026-11-15, after the four final Phase 7 fixes (presenter window under throttled timers, tall menus, Underline/Strikethrough on empty boxes, PDF text outside WinAnsi). The tree is the uncommitted Phase 7 work on top of `468ab89`.

- **Build:** the production build (`npm run build`), served with `npm run preview` on a port of its own.
- **Browser:** Chromium (Playwright 1.65.0, chromium-1254), 1440 × 900, macOS 27.2.1.
- **Method:** a Playwright script drove the real UI the way a user would: ribbon, dialogs, inspector, keyboard and mouse. It made one presentation and downloaded the three exports with the editor's own Export menu.
- **Script location:** the script was kept outside the repository, in the session scratchpad (`phase7/final/samples-script/`).
- **Console:** no console errors were logged during the run.

## The presentation

It starts from the **Lecture** template (quick start "Lecture slides"). The presentation has 8 slides at 16:9 (960 × 540 px).

| Feature | Where it is |
|---|---|
| Theme | **Midnight**, chosen from the Design tab's theme gallery. |
| Custom master | In master view, the slide master's title size was changed to **40 pt**. A **rectangle** was added and turned into a thin accent band (200 × 8 px at the bottom right). The band is on every slide, next to the template's left accent bar and its footer text. |
| Layout change | Slide 2 changed from Title and content to **Two content**. Its bullets moved into the left column, and the right column is an empty placeholder. |
| Gradient background | Slide 2: the **Warm gradient** (green to yellow). |
| Picture background | Slide 3: a 640 × 360 PNG of a sky, a field and a round yellow sun. If the sun looks oval, the picture is stretched. |
| Formatted text | Slide 7: a text box at 24 pt reading "Plain, **bold**, *italic* and <u>underlined</u> text: Grüße, café, 20 °C." The formatting was typed with ⌘B, ⌘I and ⌘U while editing. |
| Image | Slide 7: a 320 × 180 PNG in four coloured quarters (red, yellow, blue, green), placed at 384 × 216, with alt text "Four coloured quarters standing for parts of a cell". |
| Chart | Slide 7: a column chart with the default data (Class A and Class B over Weeks 1–4). |
| Table | Slide 8: 3 rows × 2 columns (Organelle / Job; Nucleus / Holds the DNA; Mitochondrion / Releases energy). |
| Shape | Slide 8: a rounded rectangle filled with the theme's accent 2, containing the text "Cell membrane". |
| Diagram | Slide 8: a diagram made from the app's **Flowchart** template in the diagram editor (it decides whether N is odd or even; its title stays "Flowchart") and inserted on the slide. |
| Speaker notes | Slides 1, 2 and 4 keep the template's notes. Slides 7 and 8 have new notes. |
| Transitions | Slide 2 Push (from the left), slide 3 Wipe, slide 7 Fade, slide 8 Zoom. All at medium speed. |
| Object animations | Slide 7: the picture fades in on a click, the chart flies in after it, and the text box wipes in on the next click. Slide 8: the shape zooms in on a click, and the diagram fades in with it. |
| Hidden slide | Slide 5 ("Summary") is hidden in the slide show. |

## The samples

| File | What it holds | Expected |
|---|---|---|
| `phase7-sample.pptx` | PowerPoint export (PptxGenJS 4.0.1 plus the app's post-processing). | **8 slides**, slide 5 hidden. Slide 1 is "The living cell" on the dark Midnight background with the left accent bar, the footer and the bottom-right band. Slide 2 has the green-to-yellow gradient, its bullets in the left column and a Push transition. Slide 3 shows the sky picture filling the slide, with a round sun, and a Wipe transition. Slide 7 has the quartered picture, a native, editable column chart and the formatted line (bold, italic and underlined runs at 24 pt). On a click, the picture fades in and the chart then flies in after it; another click wipes in the text. Slide 8 has a native table, a rounded rectangle with text and the flowchart as a picture. On a click, the shape zooms in and the flowchart fades in with it. Speaker notes appear on slides 1, 2, 4, 7 and 8. Titles use the master's 40 pt, except on slides 1 and 6, whose Title slide layout keeps its own 44 pt. |
| `phase7-sample.pdf` | PDF, one page per slide. | **7 pages** at 720 × 405 pt; the hidden slide 5 is left out. The text is real text in the standard PDF fonts (Helvetica), and pictures, chart, table, shape and diagram are drawn as they appear on screen. No motion. |
| `phase7-sample-notes.pdf` | PDF with speaker notes. | **7 portrait pages** at 540 × 720 pt (7.5 × 10 in, PowerPoint's notes page). Each has the slide at the top, framed, with "Slide N" and its notes below. Slides 3 and 6 have no notes. |

The export toasts were:

- PowerPoint: "Exported PowerPoint (8 slides). 1 diagram was written as a picture, with the diagram's data kept inside it. The master's objects are written onto each layout, so changing the master in PowerPoint does not change the layouts." (TD-56)
- PDF: "Exported PDF (7 slides). 1 hidden slide was left out. Transitions and animations are not part of a PDF. Text is drawn with the PDF's standard fonts (Helvetica, Times or Courier) instead of Trebuchet MS, so lines may break differently." (TD-57)
- PDF with speaker notes: "Exported PDF with speaker notes (7 pages).", then the same three notes as the PDF toast.

## Checks done here (2026-11-15)

**PPTX structure (unzipped).**

| Check | Result |
|---|---|
| Well-formed XML (`xmllint --noout`) | All **66 XML and .rels parts** of the PPTX, and the 12 parts of the chart's embedded workbook (`ppt/embeddings/Microsoft_Excel_Worksheet1.xlsx`). None reported an error. |
| Content types | Every `Override` in `[Content_Types].xml` names a part that exists, and every part has a type. |
| `p:transition` | Present on slides 2 (`p:push dir="l"`), 3 (`p:wipe`), 7 (`p:fade`) and 8 (`p:zoom`). Each sits straight after `p:clrMapOvr`, in schema order. |
| `p:timing` | Present on slides 7 and 8, after the transition. Slide 7 has 3 `presetClass="entr"` effects (Fade on click, Fly in after previous, Wipe on click). Slide 8 has 2 (Zoom on click, Fade with previous). |
| Hidden slide | Slide 5 has `<p:sld … show="0">`. |
| Text runs | Slide 7's text box has separate runs with `b="1"`, `i="1"` and `u="sng"`, all at `sz="2400"`. |
| Chart, table and shape | `ppt/charts/chart1.xml` and its workbook are present. Slide 8 has an `<a:tbl>` with the six typed cells and a `prst="roundRect"` shape with "Cell membrane". |
| Diagram | `ppt/media/image-8-1.png` (1180 × 1440) carries the editable diagram in its `dcos-diagram` chunk. |
| Picture background | Slide 3's `p:bg` uses `blipFill` with `a:stretch`. The picture has the slide's own 16:9 shape, so `srcRect` is empty (no crop needed). |
| Notes | 8 notes slides. The notes typed for slides 7 and 8 are in their notes slides. |
| Alt text | The picture's `descr` is its alt text, and the diagram's is "Flowchart". |

**PDFs (content streams inflated, and every page drawn with macOS PDFKit).**

| Check | Result |
|---|---|
| Pages | 7 pages in each PDF, at the sizes above. |
| Text | All text is single-byte WinAnsi `Tj` text, with no 16-bit strings. "Grüße", "café", "°C" and the typographic apostrophe are kept. |
| Slides 7 and 8 as drawn | Match the editor: bold, italic and underline show; the picture quarters are not stretched; the chart has axes and a legend; the table header row is filled. |
| Slide 3 | The sun is round. |
| Notes pages | The notes are laid out below each slide. |

**Quick Look** (`qlmanage -t`) drew slide 1 of the PPTX correctly: the Midnight background, the accent bar, the band, the title and subtitle, in Trebuchet MS. Quick Look draws no native charts and ignores timing, so it is not a check of slides 7–8 or of the motion.

## Not checked

- PowerPoint is not installed on this Mac (TD-55).
- No other app (LibreOffice, Google Slides) opened the PPTX.
- The PDFs were not opened in Acrobat; only PDFKit and the structure checks above were used.
- Playing the transitions and animations in another app.
- Keynote: not checked yet. Keynote did not respond when the check was tried, so it has not opened these files; the owner decides how the check is done (TD-55).
