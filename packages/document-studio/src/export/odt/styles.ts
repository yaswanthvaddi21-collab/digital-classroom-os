import { isLanguageTag } from '../../review/language';
import { WORD_SINGLE_LINE } from '../../extensions/paragraphFormat';
import { PARAGRAPH_STYLE_LOOKS, type StyleLook } from '../../paragraphStyles';
import { layoutOf, type HeaderFooterParts, type NumberFormat, type PageLayout } from '../../pageLayout';
import { paperSize, type PageSettings } from '../../types';
import { propsEl } from './context';
import { cm, el, odfText, xmlns } from './xml';

/** Body line height: CSS 1.5 over Carlito/Calibri's single line (1.2207 em), as in the DOCX export. */
export const BODY_LINE_HEIGHT = '123%';

export const FONT_FACES =
  '<office:font-face-decls>' +
  '<style:font-face style:name="Calibri" svg:font-family="Calibri" style:font-family-generic="swiss" style:font-pitch="variable"/>' +
  '<style:font-face style:name="Courier New" svg:font-family="&apos;Courier New&apos;" style:font-family-generic="modern" style:font-pitch="fixed"/>' +
  '</office:font-face-decls>';

const textProps = (p: Record<string, string>) => propsEl('style:text-properties', p);
const paraProps = (p: Record<string, string>) => propsEl('style:paragraph-properties', p);
const size = (pt: number) => ({ 'fo:font-size': `${pt}pt`, 'style:font-size-asian': `${pt}pt`, 'style:font-size-complex': `${pt}pt` });
const bold = { 'fo:font-weight': 'bold', 'style:font-weight-asian': 'bold', 'style:font-weight-complex': 'bold' };

function style(name: string, display: string, family: string, parent: string | null, body: string, extra: Record<string, string | number> = {}) {
  return el('style:style', { 'style:name': name, 'style:display-name': display !== name ? display : undefined, 'style:family': family, 'style:parent-style-name': parent ?? undefined, ...extra }, body);
}

/** Text width of the page in centimetres (for the table of contents' right tab stop). */
function textWidthCm(page: PageSettings) {
  return (paperSize(page).width - page.margins.left - page.margins.right) / 10;
}

/** ODF style names of the named paragraph styles (paragraphStyle attribute), as word processors call them. */
export const ODT_PARAGRAPH_STYLES = { title: 'Title', subtitle: 'Subtitle', caption: 'Caption' } as const;

const ASIAN = ['zh', 'ja', 'ko'];
const COMPLEX = ['ar', 'he', 'fa', 'ur', 'hi', 'bn', 'ta', 'te', 'th'];

/**
 * The document language (a BCP 47 tag) as ODF text properties: language and country, for the script the language
 * is written in (Western, Asian or complex). Nothing when the document has no language, as in the DOCX export:
 * the word processor then uses its own.
 */
export function languageProps(language: unknown): Record<string, string> {
  if (!isLanguageTag(language)) return {};
  const [primary, ...rest] = language.split('-');
  const lang = primary.toLowerCase();
  const country = rest.find((x) => /^([A-Za-z]{2}|\d{3})$/.test(x))?.toUpperCase();
  const script = rest.find((x) => /^[A-Za-z]{4}$/.test(x));
  const kind = ASIAN.includes(lang) ? 'asian' : COMPLEX.includes(lang) ? 'complex' : 'western';
  const name = (p: string) => (kind === 'western' ? `fo:${p}` : `style:${p}-${kind}`);
  return {
    [name('language')]: lang,
    ...(country ? { [name('country')]: country } : {}),
    ...(script ? { [name('script')]: `${script[0].toUpperCase()}${script.slice(1).toLowerCase()}` } : {}),
  };
}

/** A named paragraph style with the editor's look for Title, Subtitle or Caption (paragraphStyles.ts). */
function lookStyle(name: string, l: StyleLook): string {
  const pt = (em: number) => `${Math.round(em * l.sizePt * 100) / 100}pt`;
  return style(
    name,
    name,
    'paragraph',
    'Standard',
    paraProps({ 'fo:margin-top': pt(l.marginTopEm), 'fo:margin-bottom': pt(l.marginBottomEm), 'fo:line-height': `${Math.round((l.lineHeight / WORD_SINGLE_LINE) * 100)}%` }) +
      textProps({ ...size(l.sizePt), 'fo:color': l.color, ...(l.bold ? bold : {}), ...(l.italic ? { 'fo:font-style': 'italic', 'style:font-style-asian': 'italic', 'style:font-style-complex': 'italic' } : {}) }),
    { 'style:next-style-name': 'Standard', 'style:class': name === 'Caption' ? 'extra' : 'chapter' },
  );
}

/** The named styles every exported document uses, matching the editor's look (contentCss.ts). */
function namedStyles(page: PageSettings, language?: unknown): string {
  const width = textWidthCm(page).toFixed(3);
  const headings = [20, 15, 13, 12]
    .map((pt, i) =>
      style(`Heading_20_${i + 1}`, `Heading ${i + 1}`, 'paragraph', 'Heading', textProps(size(pt)), { 'style:default-outline-level': i + 1, 'style:next-style-name': 'Standard', 'style:class': 'text' }),
    )
    .join('');
  const contents = [1, 2, 3, 4]
    .map((level) =>
      style(
        `Contents_20_${level}`,
        `Contents ${level}`,
        'paragraph',
        'Standard',
        el(
          'style:paragraph-properties',
          { 'fo:margin-left': `${(level - 1) * 0.5}cm`, 'fo:margin-bottom': '0.1cm' },
          el('style:tab-stops', {}, el('style:tab-stop', { 'style:position': `${width}cm`, 'style:type': 'right', 'style:leader-style': 'dotted', 'style:leader-text': '.' })),
        ),
        { 'style:class': 'index' },
      ),
    )
    .join('');
  return (
    '<office:styles>' +
    el(
      'style:default-style',
      { 'style:family': 'paragraph' },
      paraProps({ 'fo:margin-top': '0cm', 'fo:margin-bottom': '0.282cm', 'fo:line-height': BODY_LINE_HEIGHT, 'style:writing-mode': 'lr-tb' }) +
        textProps({ 'style:font-name': 'Calibri', ...size(12), ...languageProps(language) }),
    ) +
    el('style:default-style', { 'style:family': 'graphic' }, el('style:graphic-properties', { 'fo:wrap-option': 'no-wrap' })) +
    style('Standard', 'Standard', 'paragraph', null, '', { 'style:class': 'text' }) +
    style('Heading', 'Heading', 'paragraph', 'Standard', paraProps({ 'fo:margin-top': '0.42cm', 'fo:margin-bottom': '0.14cm', 'fo:keep-with-next': 'always', 'fo:line-height': '100%' }) + textProps({ ...bold, 'fo:color': '#111114' }), {
      'style:next-style-name': 'Standard',
      'style:class': 'text',
    }) +
    headings +
    style(
      'Quotations',
      'Quotations',
      'paragraph',
      'Standard',
      paraProps({ 'fo:margin-left': '0.6cm', 'fo:padding-left': '0.35cm', 'fo:border-left': '2.25pt solid #c7c7d1', 'fo:border-right': 'none', 'fo:border-top': 'none', 'fo:border-bottom': 'none' }) +
        textProps({ 'fo:color': '#555555' }),
      { 'style:class': 'html' },
    ) +
    style(
      'Preformatted_20_Text',
      'Preformatted Text',
      'paragraph',
      'Standard',
      paraProps({ 'fo:margin-top': '0cm', 'fo:margin-bottom': '0cm', 'fo:background-color': '#f4f4f6', 'fo:line-height': '100%' }) + textProps({ 'style:font-name': 'Courier New', ...size(10) }),
      { 'style:class': 'html' },
    ) +
    style('Table_20_Contents', 'Table Contents', 'paragraph', 'Standard', paraProps({ 'fo:margin-top': '0cm', 'fo:margin-bottom': '0cm' }), { 'style:class': 'extra' }) +
    style('Table_20_Heading', 'Table Heading', 'paragraph', 'Table_20_Contents', textProps({ ...bold }), { 'style:class': 'extra' }) +
    style('Horizontal_20_Line', 'Horizontal Line', 'paragraph', 'Standard', paraProps({ 'fo:margin-top': '0.2cm', 'fo:margin-bottom': '0.4cm', 'fo:border-bottom': '0.75pt solid #cfcfd6', 'fo:padding': '0cm' }) + textProps(size(4)), {
      'style:class': 'html',
    }) +
    style('Contents_20_Heading', 'Contents Heading', 'paragraph', 'Standard', paraProps({ 'fo:margin-bottom': '0.2cm' }) + textProps({ ...bold, ...size(13) }), { 'style:class': 'index' }) +
    contents +
    Object.entries(ODT_PARAGRAPH_STYLES).map(([id, name]) => lookStyle(name, PARAGRAPH_STYLE_LOOKS[id as keyof typeof ODT_PARAGRAPH_STYLES])).join('') +
    style('Header', 'Header', 'paragraph', 'Standard', paraProps({ 'fo:text-align': 'center', 'fo:margin-bottom': '0cm' }) + textProps({ ...size(9), 'fo:color': '#666666' }), { 'style:class': 'extra' }) +
    style('Footer', 'Footer', 'paragraph', 'Standard', paraProps({ 'fo:text-align': 'center', 'fo:margin-bottom': '0cm' }) + textProps({ ...size(9), 'fo:color': '#666666' }), { 'style:class': 'extra' }) +
    style('Source_20_Text', 'Source Text', 'text', null, textProps({ 'style:font-name': 'Courier New', 'fo:background-color': '#f1f1f4' })) +
    style('Internet_20_link', 'Internet link', 'text', null, textProps({ 'fo:color': '#3b49df', 'style:text-underline-style': 'solid', 'style:text-underline-width': 'auto', 'style:text-underline-color': 'font-color' })) +
    style('Visited_20_Internet_20_Link', 'Visited Internet Link', 'text', null, textProps({ 'fo:color': '#5b2a86', 'style:text-underline-style': 'solid', 'style:text-underline-width': 'auto', 'style:text-underline-color': 'font-color' })) +
    style('Graphics', 'Graphics', 'graphic', null, el('style:graphic-properties', { 'text:anchor-type': 'as-char', 'style:vertical-pos': 'top', 'style:vertical-rel': 'baseline' })) +
    '</office:styles>'
  );
}

/** ODF number formats of the page number formats (G-LAYOUT). */
export const ODF_PAGE_NUMBER_FORMATS: Record<NumberFormat, string> = { decimal: '1', lowerRoman: 'i', upperRoman: 'I', lowerLetter: 'a', upperLetter: 'A' };

/** The page number as fields, worded as chosen ("Page 3 of 10", "Page 3" or "3"), as the DOCX export writes it. */
function pageNumberFields(layout: PageLayout): string {
  const format = layout.pageNumberFormat === 'decimal' ? '' : ` style:num-format="${ODF_PAGE_NUMBER_FORMATS[layout.pageNumberFormat]}"`;
  const current = `<text:page-number${format} text:select-page="current">1</text:page-number>`;
  if (layout.pageNumberText === 'number') return current;
  if (layout.pageNumberText === 'page') return `Page ${current}`;
  return `Page ${current} of <text:page-count${format}>1</text:page-count>`;
}

/**
 * One header or footer line. Text only in the centre is a centred paragraph (as before parts existed); otherwise a
 * centre and a right tab stop place the left, centre and right parts, as in the DOCX export. Null when it is empty.
 */
function partsParagraph(parts: HeaderFooterParts, styleName: 'Header' | 'Footer', tabbed: string, numberAt: keyof HeaderFooterParts | null, number: string): string | null {
  const part = (k: keyof HeaderFooterParts) => {
    let out = parts[k] ? odfText(parts[k], { atStart: k === 'left' }) : '';
    if (numberAt === k) out += (parts[k] ? odfText('    ', { atStart: false }) : '') + number;
    return out;
  };
  const [left, center, right] = [part('left'), part('center'), part('right')];
  if (!left && !center && !right) return null;
  if (!left && !right) return el('text:p', { 'text:style-name': styleName }, center);
  return el('text:p', { 'text:style-name': tabbed }, `${left}<text:tab/>${center}${right ? `<text:tab/>${right}` : ''}`);
}

/**
 * styles.xml: named styles, the page layout (size, orientation, margins, page number format, text columns) and the
 * master page with the header and footer (left, centre and right parts; a different first page). The editor draws
 * the header in the middle of the top margin and the footer in the middle of the bottom one; ODF puts them inside
 * the margins' box, so the page margin is halved and the header area takes the other half, which keeps the text
 * where it is in the editor.
 */
export function stylesXml(page: PageSettings, language?: unknown): string {
  const paper = paperSize(page);
  const m = page.margins;
  const layout = layoutOf(page);
  const number = page.pageNumbers ? pageNumberFields(layout) : '';
  const header: HeaderFooterParts = { left: layout.headerLeft, center: page.header, right: layout.headerRight };
  const footer: HeaderFooterParts = { left: layout.footerLeft, center: page.footer, right: layout.footerRight };
  const fp = layout.firstPage;
  const widthCm = textWidthCm(page).toFixed(3);
  const tabs = el('style:tab-stops', {}, el('style:tab-stop', { 'style:position': `${(Number(widthCm) / 2).toFixed(3)}cm`, 'style:type': 'center' }) + el('style:tab-stop', { 'style:position': `${widthCm}cm`, 'style:type': 'right' }));
  const tabbed = (name: string, parent: string) => el('style:style', { 'style:name': name, 'style:family': 'paragraph', 'style:parent-style-name': parent }, el('style:paragraph-properties', { 'fo:text-align': 'start' }, tabs));
  const at = page.pageNumbers ? layout.pageNumberAlign : null;
  const h = partsParagraph(header, 'Header', 'MP1', null, '');
  const f = partsParagraph(footer, 'Footer', 'MP2', at, number);
  // The first page's own header and footer; empty parts are written as an empty paragraph, so it shows nothing there.
  const fh = fp ? partsParagraph(fp.header, 'Header', 'MP1', null, '') ?? '<text:p text:style-name="Header"/>' : null;
  const ff = fp ? partsParagraph(fp.footer, 'Footer', 'MP2', page.pageNumbers && fp.pageNumbers ? layout.pageNumberAlign : null, number) ?? '<text:p text:style-name="Footer"/>' : null;
  const hasHeader = !!h || (!!fp && fh !== '<text:p text:style-name="Header"/>');
  const hasFooter = !!f || (!!fp && ff !== '<text:p text:style-name="Footer"/>');
  const half = (mm: number) => cm(mm / 2);
  const columns = layout.columns > 1 ? el('style:columns', { 'fo:column-count': layout.columns, 'fo:column-gap': cm(layout.columnSpacing) }) : '';
  const pageLayout = el(
    'style:page-layout',
    { 'style:name': 'pm1' },
    el(
      'style:page-layout-properties',
      {
        'fo:page-width': cm(paper.width),
        'fo:page-height': cm(paper.height),
        'style:print-orientation': page.orientation,
        'style:num-format': ODF_PAGE_NUMBER_FORMATS[layout.pageNumberFormat],
        'fo:margin-top': hasHeader ? half(m.top) : cm(m.top),
        'fo:margin-bottom': hasFooter ? half(m.bottom) : cm(m.bottom),
        'fo:margin-left': cm(m.left),
        'fo:margin-right': cm(m.right),
        'style:writing-mode': 'lr-tb',
      },
      columns,
    ) +
      el('style:header-style', {}, hasHeader ? el('style:header-footer-properties', { 'fo:min-height': half(m.top), 'fo:margin-bottom': '0cm', 'style:dynamic-spacing': 'false' }) : '') +
      el('style:footer-style', {}, hasFooter ? el('style:header-footer-properties', { 'fo:min-height': half(m.bottom), 'fo:margin-top': '0cm', 'style:dynamic-spacing': 'false' }) : ''),
  );
  const master = el(
    'style:master-page',
    { 'style:name': 'Standard', 'style:page-layout-name': 'pm1' },
    (hasHeader ? el('style:header', {}, h ?? '<text:p text:style-name="Header"/>') : '') +
      (hasHeader && fh ? el('style:header-first', {}, fh) : '') +
      (hasFooter ? el('style:footer', {}, f ?? '<text:p text:style-name="Footer"/>') : '') +
      (hasFooter && ff ? el('style:footer-first', {}, ff) : ''),
  );
  const automatic = pageLayout + tabbed('MP1', 'Header') + tabbed('MP2', 'Footer');
  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    `<office:document-styles${xmlns('office', 'style', 'text', 'table', 'draw', 'fo', 'xlink', 'svg', 'number')} office:version="1.3">` +
    FONT_FACES +
    namedStyles(page, language) +
    `<office:automatic-styles>${automatic}</office:automatic-styles>` +
    `<office:master-styles>${master}</office:master-styles>` +
    '</office:document-styles>'
  );
}
