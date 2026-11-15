/**
 * What an export could not keep exactly, counted while it runs and said in plain sentences in the export toast
 * ("Exported PowerPoint. 1 picture is not on this device and is shown as a frame."). Nothing is ever claimed that
 * the file does not do: there is no PPTX import, so no note says a PPTX can be opened again in Classroom OS.
 */

export type ExportNoteKind =
  | 'missingPicture'
  | 'convertedPicture'
  | 'pictureFill'
  | 'missingDiagram'
  | 'diagramPicture'
  | 'diagramRedrawn'
  | 'rotatedFrame'
  | 'transitionSpeed'
  | 'masterAsLayouts'
  | 'hiddenSkipped'
  | 'noMotion'
  | 'fontSubstituted'
  | 'unsupportedCharacters'
  | 'justified'
  | 'mergedBorders'
  | 'tableOnLayout';

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export class ExportReport {
  private counts = new Map<ExportNoteKind, number>();
  private fonts = new Set<string>();

  add(kind: ExportNoteKind, n = 1) {
    if (n > 0) this.counts.set(kind, (this.counts.get(kind) ?? 0) + n);
  }
  /** Once: a note that is true or not, not counted. */
  flag(kind: ExportNoteKind) {
    this.counts.set(kind, 1);
  }
  font(family: string) {
    this.fonts.add(family);
    this.flag('fontSubstituted');
  }
  count(kind: ExportNoteKind) {
    return this.counts.get(kind) ?? 0;
  }

  /** The notes as sentences, in a stable order. */
  sentences(): string[] {
    const out: string[] = [];
    const n = (k: ExportNoteKind) => this.counts.get(k) ?? 0;
    if (n('hiddenSkipped')) out.push(`${plural(n('hiddenSkipped'), 'hidden slide was', 'hidden slides were')} left out.`);
    if (n('noMotion')) out.push('Transitions and animations are not part of a PDF.');
    if (n('missingPicture')) out.push(`${plural(n('missingPicture'), 'picture is', 'pictures are')} not on this device and ${n('missingPicture') === 1 ? 'is' : 'are'} shown as a frame with ${n('missingPicture') === 1 ? 'its' : 'their'} description.`);
    if (n('convertedPicture')) out.push(`${plural(n('convertedPicture'), 'picture was', 'pictures were')} converted to PNG.`);
    if (n('pictureFill')) out.push(`${plural(n('pictureFill'), 'shape filled with a picture is', 'shapes filled with a picture are')} filled with a plain colour instead.`);
    if (n('diagramPicture')) out.push(`${plural(n('diagramPicture'), 'diagram was', 'diagrams were')} written as ${n('diagramPicture') === 1 ? 'a picture' : 'pictures'}, with the diagram's data kept inside ${n('diagramPicture') === 1 ? 'it' : 'them'}.`);
    if (n('diagramRedrawn')) out.push(`${plural(n('diagramRedrawn'), 'diagram', 'diagrams')} had no stored picture and ${n('diagramRedrawn') === 1 ? 'was' : 'were'} drawn again for the export.`);
    if (n('missingDiagram')) out.push(`${plural(n('missingDiagram'), 'diagram has', 'diagrams have')} no picture on this device and ${n('missingDiagram') === 1 ? 'is' : 'are'} shown as a frame.`);
    if (n('rotatedFrame')) out.push(`${plural(n('rotatedFrame'), 'rotated table or chart is', 'rotated tables or charts are')} written upright (PowerPoint cannot rotate them).`);
    if (n('transitionSpeed')) out.push('Transition durations are written as PowerPoint\'s fast, medium or slow speed.');
    if (n('masterAsLayouts')) out.push('The master\'s objects are written onto each layout, so changing the master in PowerPoint does not change the layouts.');
    if (n('fontSubstituted')) out.push(`Text is drawn with the PDF's standard fonts (Helvetica, Times or Courier) instead of ${[...this.fonts].sort().join(', ')}, so lines may break differently.`);
    if (n('unsupportedCharacters')) out.push(`${plural(n('unsupportedCharacters'), 'text uses', 'texts use')} characters the PDF's standard fonts cannot show, so ${n('unsupportedCharacters') === 1 ? 'it' : 'they'} may not appear correctly; export PowerPoint for ${n('unsupportedCharacters') === 1 ? 'it' : 'them'}.`);
    if (n('justified')) out.push('Justified text is aligned left in the PDF.');
    if (n('mergedBorders')) out.push('Borders of merged table cells follow their top-left cell.');
    if (n('tableOnLayout')) out.push(`${plural(n('tableOnLayout'), 'table', 'tables')} on a master or layout ${n('tableOnLayout') === 1 ? 'was' : 'were'} left out (PowerPoint layouts made by this export cannot hold tables).`);
    return out;
  }
}

/** What an export hands back: the file and what to say about it. */
export interface ExportResult {
  blob: Blob;
  fileName: string;
  /** "Exported PowerPoint (12 slides)". */
  message: string;
  notes: string[];
}
