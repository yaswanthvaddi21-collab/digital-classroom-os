import type { ExportReport } from '../report';

/**
 * What the user calls each kind of content, for the export toast: [one, several]. Types not listed are named by
 * their type ("1 “mysteryBlock” item").
 */
const KIND_NAMES: Record<string, [string, string]> = {
  inlineMath: ['equation', 'equations'],
  blockMath: ['equation', 'equations'],
  shape: ['shape', 'shapes'],
  textBox: ['text box', 'text boxes'],
  sectionBreak: ['section break', 'section breaks'],
};
/** The report key of a kind (equations count together, inline or not). */
const kindKey = (type: string) => (KIND_NAMES[type] ? KIND_NAMES[type][0] : type);

function kind(type: string): { one: string; many: string } {
  const named = KIND_NAMES[type];
  return named ? { one: `1 ${named[0]}`, many: `{n} ${named[1]}` } : { one: `1 “${type}” item`, many: `{n} “${type}” items` };
}

/** What the export toast calls each formatting mark it cannot write. */
const MARK_NAMES: Record<string, string> = {
  comment: 'Comments are not supported in ODT files yet and were left out (the commented text was kept)',
};

/** Document-level fields (CONTENT_FIELDS) as the toast names them. */
const FIELD_NAMES: Record<string, string> = {
  comments: 'Comments are not supported in ODT files yet and were left out (the commented text was kept)',
};

/** What the ODT export writes approximately or leaves out, worded for the export toast. */
export const ODT_NOTES = {
  /** A block or inline node type the ODT export has no handler for. */
  unsupportedNode: (r: ExportReport, type: string, keptContent: boolean) => {
    const k = kind(type);
    return keptContent
      ? r.add(`odt-node:${kindKey(type)}`, `${k.one} is not supported in ODT files yet; its text was kept`, `${k.many} are not supported in ODT files yet; their text was kept`)
      : r.add(`odt-node:${kindKey(type)}`, `${k.one} is not supported in ODT files yet and was left out`, `${k.many} are not supported in ODT files yet and were left out`);
  },
  /** A node without a handler, written as its plain-text form (the TXT export's), e.g. an equation's LaTeX. */
  writtenAsText: (r: ExportReport, type: string) => {
    const k = kind(type);
    r.add(`odt-text:${kindKey(type)}`, `${k.one} is not supported in ODT files yet and was written as text`, `${k.many} are not supported in ODT files yet and were written as text`);
  },
  unsupportedMark: (r: ExportReport, type: string) => {
    const text = MARK_NAMES[type] ?? `“${type}” formatting is not supported in ODT files yet and was left out`;
    // Once per sentence: comments are both a mark and a document field, and get one sentence for both.
    r.once(`odt-said:${text}`, (rr) => rr.add(`odt-mark:${type}`, text, text));
  },
  unsupportedField: (r: ExportReport, field: string) => {
    const text = FIELD_NAMES[field] ?? `The document's “${field}” are not supported in ODT files yet and were left out`;
    r.once(`odt-said:${text}`, (rr) => rr.add(`odt-field:${field}`, text, text));
  },
  unsupportedAttr: (r: ExportReport, type: string, attr: string) =>
    r.once(`odt-attr:${type}.${attr}`, (rr) =>
      rr.add(`odt-attr:${type}.${attr}`, `The “${attr}” setting of ${type} items is not supported in ODT files yet and was left out`, `The “${attr}” setting of ${type} items is not supported in ODT files yet and was left out`),
    ),
  unsupportedImage: (r: ExportReport) =>
    r.add('odt-image-format', '1 image in a format ODT files cannot hold was written as a placeholder', '{n} images in formats ODT files cannot hold were written as placeholders'),
  tocPageNumbers: (r: ExportReport) =>
    r.add(
      'odt-toc-page-numbers',
      'The table of contents was written without page numbers; they are added when it is updated in your word processor',
      'The table of contents was written without page numbers; they are added when it is updated in your word processor',
    ),
  /** Section breaks: ODT sections with their own page layout are not written yet (G-LAYOUT; Round 3). */
  sectionAsPageBreak: (r: ExportReport) =>
    r.add(
      'odt-section-page',
      '1 section break was written as a page break (sections with their own page layout are not supported in ODT files yet)',
      '{n} section breaks were written as page breaks (sections with their own page layout are not supported in ODT files yet)',
    ),
  sectionContinuous: (r: ExportReport) =>
    r.add(
      'odt-section-continuous',
      '1 continuous section break was left out (sections are not supported in ODT files yet)',
      '{n} continuous section breaks were left out (sections are not supported in ODT files yet)',
    ),
};
