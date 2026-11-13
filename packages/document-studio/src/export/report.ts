/**
 * What an export could not write exactly. Every exporter (DOCX, print, text, and later ODT) adds a note for each
 * approximation or placeholder it writes, and the export toast tells the user, e.g.
 * "Exported Word document. 2 images were not saved for offline use and were written as placeholders."
 *
 * Notes are keyed by id, so the same kind of approximation is counted, not repeated.
 */
export interface ExportNote {
  id: string;
  count: number;
  /** Sentence for one occurrence, e.g. "1 equation was written as an image". */
  one: string;
  /** Sentence for several, with {n} for the count, e.g. "{n} equations were written as images". */
  many: string;
}

export class ExportReport {
  private readonly notes = new Map<string, ExportNote>();

  private readonly seen = new Set<string>();

  /** Records an occurrence once per distinct `key` (e.g. one highlight colour, however many runs use it). */
  once(key: string, record: (r: ExportReport) => void) {
    if (this.seen.has(key)) return;
    this.seen.add(key);
    record(this);
  }

  /** Records one (or `count`) occurrences of an approximation. */
  add(id: string, one: string, many: string, count = 1) {
    if (count <= 0) return;
    const note = this.notes.get(id);
    if (note) note.count += count;
    else this.notes.set(id, { id, count, one, many });
  }

  count(id: string) {
    return this.notes.get(id)?.count ?? 0;
  }

  get list(): ExportNote[] {
    return [...this.notes.values()];
  }

  get empty() {
    return this.notes.size === 0;
  }

  /** The notes as sentences, in the order they were first recorded. */
  sentences(): string[] {
    return this.list.map((n) => (n.count === 1 ? n.one : n.many.replace('{n}', String(n.count))));
  }
}

/** Common notes, shared so every exporter words them the same way. */
export const NOTES = {
  remoteImage: (r: ExportReport, count = 1) =>
    r.add('remote-image', '1 image was not saved for offline use and was written as a placeholder', '{n} images were not saved for offline use and were written as placeholders', count),
  unsupportedImage: (r: ExportReport, count = 1) =>
    r.add('unsupported-image', '1 image in a format Word cannot show was written as a placeholder', '{n} images in formats Word cannot show were written as placeholders', count),
  missingDiagramPreview: (r: ExportReport, count = 1) =>
    r.add('diagram-preview', '1 diagram has no preview and was written as a placeholder', '{n} diagrams have no preview and were written as placeholders', count),
  unsafeLink: (r: ExportReport, count = 1) =>
    r.add('unsafe-link', '1 link with an unsupported address was written as plain text', '{n} links with unsupported addresses were written as plain text', count),
  highlightColour: (r: ExportReport, count = 1) =>
    r.add('highlight-colour', "1 highlight colour was changed to Word's nearest highlight colour", "{n} highlight colours were changed to Word's nearest highlight colours", count),
  tocPageNumbers: (r: ExportReport) =>
    // Says only what the file contains: how a given Word version prompts for the update has not been checked.
    r.add('toc-page-numbers', 'The table of contents was written without page numbers; they are added when its field is updated in Word', 'The table of contents was written without page numbers; they are added when its field is updated in Word'),
  // G-REVIEW: comments whose text was deleted (kept in the document so undo restores them) have nothing to attach to.
  commentsLeftOut: (r: ExportReport, count = 1) =>
    r.add('comments-left-out', '1 comment on deleted text was left out', '{n} comments on deleted text were left out', count),
  resolvedCommentsOpen: (r: ExportReport, count = 1) =>
    r.add('resolved-comments-open', '1 resolved comment was written as an open comment', '{n} resolved comments were written as open comments', count),
  // @phase4:export-notes — add shared notes for new features here.
  // G-INSERT: equations Word cannot take natively, shapes (pictures in Word) and text boxes (one-cell tables in Word).
  equationPicture: (r: ExportReport, count = 1) =>
    r.add('equation-picture', '1 equation Word cannot edit natively was written as a picture', '{n} equations Word cannot edit natively were written as pictures', count),
  equationText: (r: ExportReport, count = 1) =>
    r.add('equation-text', '1 equation could not be converted and was written as its LaTeX text', '{n} equations could not be converted and were written as their LaTeX text', count),
  shapePicture: (r: ExportReport, count = 1) => r.add('shape-picture', '1 shape was written as a picture', '{n} shapes were written as pictures', count),
  shapePlaceholder: (r: ExportReport, count = 1) =>
    r.add('shape-placeholder', '1 shape could not be drawn and was written as a placeholder', '{n} shapes could not be drawn and were written as placeholders', count),
  textBoxTable: (r: ExportReport, count = 1) => r.add('text-box-table', '1 text box was written as a one-cell table', '{n} text boxes were written as one-cell tables', count),
  equationColour: (r: ExportReport, count = 1) =>
    r.add('equation-colour', '1 equation lost its colours (Word equations are written in one colour)', '{n} equations lost their colours (Word equations are written in one colour)', count),
  // Round 3: Word equations take no character formatting or links, so those on an inline equation are left out.
  equationMarks: (r: ExportReport, count = 1) =>
    r.add('equation-marks', '1 equation lost its link or text formatting (Word equations take neither)', '{n} equations lost their links or text formatting (Word equations take neither)', count),
  // G-LAYOUT: a section break inside a table, list or quote cannot start a section; it is shown on screen as such.
  nestedSectionBreak: (r: ExportReport, count = 1) =>
    r.add('nested-section-break', '1 section break inside a table, list or quote was left out', '{n} section breaks inside tables, lists or quotes were left out', count),
};

/**
 * The toast after an export: "Exported Word document." plus one sentence per approximation.
 * Returns the toast kind too, so approximations are shown as information rather than plain success.
 */
export function exportToast(what: string, report?: ExportReport): { message: string; kind: 'success' | 'info' } {
  const sentences = report?.sentences() ?? [];
  if (!sentences.length) return { message: `Exported ${what}`, kind: 'success' };
  return { message: `Exported ${what}. ${sentences.map((s) => s[0].toUpperCase() + s.slice(1)).join('. ')}.`, kind: 'info' };
}
