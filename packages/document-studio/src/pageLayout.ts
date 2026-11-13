/**
 * Page layout settings added in Release 0.2 (Phase 4, Layout tab): columns, page number format, start and position,
 * header and footer parts (left / centre / right) and a different first page. They are stored as optional fields of
 * the page settings, each with a default; a document that leaves them all at their defaults stays content schema 1.
 *
 * This module is a leaf (it imports no values), because types.ts builds DEFAULT_PAGE and PAGE_FIELD_CHECKS from it.
 */

/** Page number formats, as Word names them (w:pgNumType w:fmt). */
export const NUMBER_FORMATS = ['decimal', 'lowerRoman', 'upperRoman', 'lowerLetter', 'upperLetter'] as const;
export type NumberFormat = (typeof NUMBER_FORMATS)[number];

/** How each format is shown in the UI. */
export const NUMBER_FORMAT_LABELS: Record<NumberFormat, string> = {
  decimal: '1, 2, 3',
  lowerRoman: 'i, ii, iii',
  upperRoman: 'I, II, III',
  lowerLetter: 'a, b, c',
  upperLetter: 'A, B, C',
};

/** The matching CSS counter styles (print). */
export const NUMBER_FORMAT_CSS: Record<NumberFormat, string> = {
  decimal: 'decimal',
  lowerRoman: 'lower-roman',
  upperRoman: 'upper-roman',
  lowerLetter: 'lower-alpha',
  upperLetter: 'upper-alpha',
};

export const PART_ALIGNS = ['left', 'center', 'right'] as const;
export type PartAlign = (typeof PART_ALIGNS)[number];

/** What the page number reads: "Page 3 of 9", "Page 3" or "3". */
export const PAGE_NUMBER_TEXTS = ['pageOfTotal', 'page', 'number'] as const;
export type PageNumberText = (typeof PAGE_NUMBER_TEXTS)[number];
export const PAGE_NUMBER_TEXT_LABELS: Record<PageNumberText, string> = { pageOfTotal: 'Page 1 of 9', page: 'Page 1', number: '1' };

/** Text in the three positions of a header or footer. */
export interface HeaderFooterParts {
  left: string;
  center: string;
  right: string;
}

/** The first page's own header and footer ("Different first page"). */
export interface FirstPageSettings {
  header: HeaderFooterParts;
  footer: HeaderFooterParts;
  /** Whether the page number is shown on the first page. */
  pageNumbers: boolean;
}

/** Layout fields of the page settings (all optional in stored content; see LAYOUT_DEFAULTS). */
export interface PageLayoutFields {
  /** Text columns of the first section (1–3). Later sections set their own with a section break. */
  columns?: number;
  /** Space between columns, in millimetres. */
  columnSpacing?: number;
  /** Page number format of the first section. */
  pageNumberFormat?: NumberFormat;
  /** Number of the first page. */
  pageNumberStart?: number;
  /** Footer position of the page number. */
  pageNumberAlign?: PartAlign;
  pageNumberText?: PageNumberText;
  /** Left and right parts of the header and footer; `header` and `footer` are the centre parts. */
  headerLeft?: string;
  headerRight?: string;
  footerLeft?: string;
  footerRight?: string;
  /** The first page's own header and footer, or null when it has the same as every other page. */
  firstPage?: FirstPageSettings | null;
}

export type PageLayout = Required<PageLayoutFields>;

export const DEFAULT_COLUMN_SPACING = 12.7;
export const MAX_COLUMNS = 3;
export const MAX_COLUMN_SPACING = 50;
export const MAX_PAGE_NUMBER_START = 9999;

export const LAYOUT_DEFAULTS: PageLayout = {
  columns: 1,
  columnSpacing: DEFAULT_COLUMN_SPACING,
  pageNumberFormat: 'decimal',
  pageNumberStart: 1,
  pageNumberAlign: 'center',
  pageNumberText: 'pageOfTotal',
  headerLeft: '',
  headerRight: '',
  footerLeft: '',
  footerRight: '',
  firstPage: null,
};

export const emptyParts = (): HeaderFooterParts => ({ left: '', center: '', right: '' });
export const emptyFirstPage = (): FirstPageSettings => ({ header: emptyParts(), footer: emptyParts(), pageNumbers: false });

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const oneOf = <T extends string>(list: readonly T[]) => (v: unknown): v is T => typeof v === 'string' && (list as readonly string[]).includes(v);
export const isNumberFormat = oneOf(NUMBER_FORMATS);
export const isPartAlign = oneOf(PART_ALIGNS);
export const isPageNumberText = oneOf(PAGE_NUMBER_TEXTS);
export const isColumnCount = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 1 && (v as number) <= MAX_COLUMNS;
export const isColumnSpacing = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= MAX_COLUMN_SPACING;
export const isPageNumberStart = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0 && (v as number) <= MAX_PAGE_NUMBER_START;

const text = (what: string) => (v: unknown) => (typeof v === 'string' ? null : `the ${what} is not text`);

function partsProblem(v: unknown, what: string): string | null {
  if (!isObject(v)) return `the ${what} is not valid`;
  const extra = Object.keys(v).filter((k) => !(PART_ALIGNS as readonly string[]).includes(k));
  if (extra.length) return `the ${what} includes unknown fields (${extra.join(', ')})`;
  for (const k of PART_ALIGNS) if (v[k] !== undefined && typeof v[k] !== 'string') return `the ${what} is not text`;
  return null;
}

/** Checks for the layout fields (merged into PAGE_FIELD_CHECKS). A check returns a problem, or null. */
export const LAYOUT_FIELD_CHECKS: Record<string, (value: unknown) => string | null> = {
  columns: (v) => (isColumnCount(v) ? null : `the number of columns (${JSON.stringify(v)}) is not 1, 2 or 3`),
  columnSpacing: (v) => (isColumnSpacing(v) ? null : `the column spacing (${JSON.stringify(v)}) is not a valid size`),
  pageNumberFormat: (v) => (isNumberFormat(v) ? null : `page number format ${JSON.stringify(v)} is not one this version knows`),
  pageNumberStart: (v) => (isPageNumberStart(v) ? null : `the first page number (${JSON.stringify(v)}) is not valid`),
  pageNumberAlign: (v) => (isPartAlign(v) ? null : `page number position ${JSON.stringify(v)} is not valid`),
  pageNumberText: (v) => (isPageNumberText(v) ? null : `page number text ${JSON.stringify(v)} is not one this version knows`),
  headerLeft: text('left header'),
  headerRight: text('right header'),
  footerLeft: text('left footer'),
  footerRight: text('right footer'),
  firstPage: (v) => {
    if (v === null) return null;
    if (!isObject(v)) return 'the first page settings are not valid';
    const extra = Object.keys(v).filter((k) => !['header', 'footer', 'pageNumbers'].includes(k));
    if (extra.length) return `the first page settings include unknown fields (${extra.join(', ')})`;
    if (v.header !== undefined) {
      const p = partsProblem(v.header, 'first page header');
      if (p) return p;
    }
    if (v.footer !== undefined) {
      const p = partsProblem(v.footer, 'first page footer');
      if (p) return p;
    }
    if (v.pageNumbers !== undefined && typeof v.pageNumbers !== 'boolean') return 'the first page number setting is not on or off';
    return null;
  },
};

/** The page settings' layout fields with defaults filled in (values that fail their check fall back too). */
export function layoutOf(page: PageLayoutFields): PageLayout {
  const raw = page as Record<string, unknown>;
  const out = { ...LAYOUT_DEFAULTS } as Record<string, unknown>;
  for (const key of Object.keys(LAYOUT_DEFAULTS)) {
    if (raw[key] !== undefined && !LAYOUT_FIELD_CHECKS[key](raw[key])) out[key] = raw[key];
  }
  const fp = out.firstPage as Partial<FirstPageSettings> | null;
  if (fp) {
    out.firstPage = {
      header: { ...emptyParts(), ...fp.header },
      footer: { ...emptyParts(), ...fp.footer },
      pageNumbers: fp.pageNumbers === true,
    };
  }
  return out as unknown as PageLayout;
}

/** A page number as text in a format (for on-screen previews): 4 → "iv", "D", … */
export function formatNumber(n: number, format: NumberFormat): string {
  if (format === 'decimal' || n <= 0) return String(n);
  if (format === 'lowerRoman' || format === 'upperRoman') {
    const table: Array<[number, string]> = [
      [1000, 'm'], [900, 'cm'], [500, 'd'], [400, 'cd'], [100, 'c'], [90, 'xc'], [50, 'l'], [40, 'xl'], [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i'],
    ];
    let rest = n;
    let s = '';
    for (const [v, r] of table) while (rest >= v) (s += r), (rest -= v);
    return format === 'upperRoman' ? s.toUpperCase() : s;
  }
  // Letters as Word and CSS count them: a … z, aa … zz.
  let rest = n;
  let s = '';
  while (rest > 0) {
    rest -= 1;
    s = String.fromCharCode(97 + (rest % 26)) + s;
    rest = Math.floor(rest / 26);
  }
  return format === 'upperLetter' ? s.toUpperCase() : s;
}
