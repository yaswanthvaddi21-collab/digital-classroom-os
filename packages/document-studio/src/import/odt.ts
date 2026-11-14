/**
 * ODT import: reads an OpenDocument text file (content.xml, styles.xml, pictures) into a new document. Covers what
 * the ODT export writes — paragraphs, headings, bold/italic/underline/strike/sub/superscript, colours, fonts and
 * sizes, alignment, lists, tables (with merged cells), pictures, links, page breaks, the table of contents, page
 * size, margins, header and footer — and reports anything else it could not bring in.
 */
import type { JSONContent } from '@tiptap/core';
import { strFromU8 } from 'fflate';
import { BULLET_STYLES, type NumberFormat } from '../extensions/listStyles';
import { formatOf, type ParagraphStyleName } from '../extensions/paragraphFormat';
import { isAllowedHref } from '../links';
import { MAX_COLUMN_SPACING, MAX_COLUMNS, MAX_PAGE_NUMBER_START, PART_ALIGNS, type HeaderFooterParts, type NumberFormat as PageNumberFormat, type PageNumberText, type PartAlign } from '../pageLayout';
import { isLanguageTag } from '../review/language';
import { diagramNodes } from '../export/diagramAssets';
import { attachCaptions, IMPORT_NOTES, ImportReport, importedContent, lengthMm, lengthPt, pageFromGeometry, unpack, type ImportedAttachment, type ImportResult } from './common';
import { diagramFromPicture, previewIds } from './diagrams';
import { imageSize, toDataUrl } from './imageSize';

const NS = {
  office: 'urn:oasis:names:tc:opendocument:xmlns:office:1.0',
  style: 'urn:oasis:names:tc:opendocument:xmlns:style:1.0',
  text: 'urn:oasis:names:tc:opendocument:xmlns:text:1.0',
  table: 'urn:oasis:names:tc:opendocument:xmlns:table:1.0',
  draw: 'urn:oasis:names:tc:opendocument:xmlns:drawing:1.0',
  fo: 'urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0',
  xlink: 'http://www.w3.org/1999/xlink',
  svg: 'urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0',
  dc: 'http://purl.org/dc/elements/1.1/',
  manifest: 'urn:oasis:names:tc:opendocument:xmlns:manifest:1.0',
};
type Prefix = keyof typeof NS;

const ODT_MIME = 'application/vnd.oasis.opendocument.text';

/** The editor's default bullet glyphs and number formats by nesting level (as the ODT export writes them). */
const DEFAULT_BULLETS = ['•', '◦', '▪'];
const DEFAULT_FORMATS = ['1', 'a', 'i'];
const ODF_NUMBER_FORMATS: Record<string, NumberFormat> = { '1': 'decimal', a: 'lower-alpha', A: 'upper-alpha', i: 'lower-roman', I: 'upper-roman' };
/** Named paragraph styles (and the styles derived from them) that are the editor's Title, Subtitle and Caption. */
const PARAGRAPH_STYLE_NAMES: Record<string, ParagraphStyleName> = { title: 'title', subtitle: 'subtitle', caption: 'caption' };
const SHOWN_IMAGES: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', bmp: 'image/bmp', svg: 'image/svg+xml', webp: 'image/webp' };

const is = (n: Node | null | undefined, prefix: Prefix, local: string): boolean => !!n && n.nodeType === 1 && (n as Element).namespaceURI === NS[prefix] && (n as Element).localName === local;
const attr = (e: Element, prefix: Prefix, local: string) => e.getAttributeNS(NS[prefix], local);
const children = (e: Element) => Array.from(e.childNodes);
const childElements = (e: Element) => Array.from(e.children);
const first = (e: Element | null | undefined, prefix: Prefix, local: string) => (e ? childElements(e).find((c) => is(c, prefix, local)) ?? null : null);

interface StyleDef {
  family: string;
  parent: string | null;
  automatic: boolean;
  displayName: string;
  para: Record<string, string>;
  text: Record<string, string>;
  listStyle: string | null;
  masterPage: string | null;
  outlineLevel: number | null;
  /** Table column properties (style:column-width …), for table-column styles. */
  column: Record<string, string>;
}

/** Each level of a list style: bullets (with their glyph) or numbers (with their ODF format: 1, a, A, i, I). */
type ListLevels = Map<number, { kind: 'bullet'; glyph: string } | { kind: 'number'; format: string }>;

function propsOf(e: Element | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!e) return out;
  for (const a of Array.from(e.attributes)) {
    const prefix = (Object.keys(NS) as Prefix[]).find((p) => NS[p] === a.namespaceURI);
    if (prefix) out[`${prefix}:${a.localName}`] = a.value;
  }
  return out;
}

function parseXml(xml: string, part: string): Document {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error(`The file is damaged (${part} is not valid XML)`);
  return doc;
}

class Styles {
  readonly defs = new Map<string, StyleDef>();
  readonly lists = new Map<string, ListLevels>();
  readonly fonts = new Map<string, string>();

  add(root: Element | null, automatic: boolean) {
    if (!root) return;
    for (const e of childElements(root)) {
      if (is(e, 'style', 'style')) {
        const name = attr(e, 'style', 'name');
        if (!name) continue;
        const family = attr(e, 'style', 'family') ?? '';
        const level = Number(attr(e, 'style', 'default-outline-level'));
        this.defs.set(`${family}:${name}`, {
          family,
          parent: attr(e, 'style', 'parent-style-name'),
          automatic,
          displayName: attr(e, 'style', 'display-name') ?? name,
          para: propsOf(first(e, 'style', 'paragraph-properties')),
          text: propsOf(first(e, 'style', 'text-properties')),
          listStyle: attr(e, 'style', 'list-style-name'),
          masterPage: attr(e, 'style', 'master-page-name'),
          column: propsOf(first(e, 'style', 'table-column-properties')),
          outlineLevel: Number.isFinite(level) && level > 0 ? level : null,
        });
      } else if (is(e, 'text', 'list-style')) {
        const name = attr(e, 'style', 'name');
        if (!name) continue;
        const levels: ListLevels = new Map();
        for (const lvl of childElements(e)) {
          const n = Number(attr(lvl, 'text', 'level')) || 1;
          const format = attr(lvl, 'style', 'num-format');
          if (is(lvl, 'text', 'list-level-style-number') && format) levels.set(n, { kind: 'number', format });
          else levels.set(n, { kind: 'bullet', glyph: attr(lvl, 'text', 'bullet-char') ?? '' });
        }
        this.lists.set(name, levels);
      }
    }
  }

  addFonts(root: Element | null) {
    for (const e of root ? childElements(root) : []) {
      if (!is(e, 'style', 'font-face')) continue;
      const name = attr(e, 'style', 'name');
      const family = (attr(e, 'svg', 'font-family') ?? name ?? '').replace(/^['"]|['"]$/g, '');
      if (name && family) this.fonts.set(name, family);
    }
  }

  /** The style and its ancestors, nearest first. */
  chain(family: string, name: string | null): StyleDef[] {
    const out: StyleDef[] = [];
    const seen = new Set<string>();
    let current = name;
    while (current && !seen.has(current) && out.length < 32) {
      seen.add(current);
      const def = this.defs.get(`${family}:${current}`);
      if (!def) break;
      out.push(def);
      current = def.parent;
    }
    return out;
  }

  /** A property from the nearest style in the chain that sets it. */
  prop(chain: StyleDef[], kind: 'para' | 'text', key: string): string | undefined {
    for (const s of chain) if (s[kind][key] !== undefined) return s[kind][key];
    return undefined;
  }

  names(chain: StyleDef[]) {
    return chain.map((s) => s.displayName.replace(/_20_/g, ' '));
  }
}

/** Text formatting (ODF text properties) as editor marks. */
function marksFrom(props: Record<string, string>, styles: Styles): NonNullable<JSONContent['marks']> {
  const marks: NonNullable<JSONContent['marks']> = [];
  const weight = props['fo:font-weight'];
  if (weight && (weight === 'bold' || Number(weight) >= 600)) marks.push({ type: 'bold' });
  if (props['fo:font-style'] === 'italic' || props['fo:font-style'] === 'oblique') marks.push({ type: 'italic' });
  const underline = props['style:text-underline-style'];
  if (underline && underline !== 'none') marks.push({ type: 'underline' });
  const strike = props['style:text-line-through-style'];
  if (strike && strike !== 'none') marks.push({ type: 'strike' });
  const position = (props['style:text-position'] ?? '').trim().split(/\s+/)[0];
  if (position === 'super' || (position.endsWith('%') && parseFloat(position) > 0)) marks.push({ type: 'superscript' });
  else if (position === 'sub' || (position.endsWith('%') && parseFloat(position) < 0)) marks.push({ type: 'subscript' });
  const bg = props['fo:background-color'];
  if (bg && /^#[0-9a-f]{6}$/i.test(bg)) marks.push({ type: 'highlight', attrs: { color: bg.toLowerCase() } });
  const textStyle: Record<string, string> = {};
  const color = props['fo:color'];
  if (color && /^#[0-9a-f]{6}$/i.test(color) && props['style:use-window-font-color'] !== 'true') textStyle.color = color.toLowerCase();
  const size = props['fo:font-size'];
  if (size && /(pt|cm|mm|in|px)$/.test(size)) {
    const mm = lengthMm(size);
    if (mm) textStyle.fontSize = `${Math.round(((mm * 72) / 25.4) * 2) / 2}pt`;
  }
  const font = props['style:font-name'] ? styles.fonts.get(props['style:font-name']) ?? props['style:font-name'] : props['fo:font-family']?.replace(/^['"]|['"]$/g, '');
  if (font) textStyle.fontFamily = font;
  if (Object.keys(textStyle).length) marks.push({ type: 'textStyle', attrs: textStyle });
  return marks;
}

/** Merges two mark lists; the later one wins for marks of the same type (textStyle attributes are combined). */
function mergeMarks(base: NonNullable<JSONContent['marks']>, add: NonNullable<JSONContent['marks']>) {
  const out = [...base];
  for (const m of add) {
    const i = out.findIndex((o) => o.type === m.type);
    if (i < 0) out.push(m);
    else out[i] = m.type === 'textStyle' ? { type: 'textStyle', attrs: { ...out[i].attrs, ...m.attrs } } : m;
  }
  return out;
}

const ALIGN: Record<string, string> = { left: 'left', start: '', center: 'center', right: 'right', end: 'right', justify: 'justify' };

interface Ctx {
  styles: Styles;
  files: Record<string, Uint8Array>;
  mimes: Map<string, string>;
  report: ImportReport;
  notes: JSONContent[][];
  counts: Record<string, number>;
  /** Phase 6: previews of the diagrams restored from pictures, and the ids they are given. */
  attachments: ImportedAttachment[];
  nextPreviewId: () => string;
}

const count = (ctx: Ctx, key: string, n = 1) => (ctx.counts[key] = (ctx.counts[key] ?? 0) + n);

/** Output of a paragraph-level element before grouping: code lines and quote paragraphs are joined afterwards. */
type Piece = { block: JSONContent } | { code: string } | { quote: JSONContent };

class Inline {
  readonly items: JSONContent[] = [];
  private softSpace = true;

  text(raw: string, marks: JSONContent['marks'], hard = false) {
    let t = raw;
    if (!hard) {
      t = t.replace(/[ \t\r\n]+/g, ' ');
      if (this.softSpace && t.startsWith(' ')) t = t.slice(1);
      if (!t) return;
      this.softSpace = t.endsWith(' ');
    } else this.softSpace = false;
    if (!t) return;
    this.items.push({ type: 'text', text: t, ...(marks?.length ? { marks } : {}) });
  }

  node(n: JSONContent) {
    this.items.push(n);
    this.softSpace = n.type === 'hardBreak';
  }

  get empty() {
    return !this.items.length;
  }
}

/** Reads paragraph content. Pictures and text boxes are block-level in the editor: they are returned separately. */
function inlineContent(e: Element, ctx: Ctx, out: Inline, marks: NonNullable<JSONContent['marks']>, flush: (blocks: JSONContent[]) => void) {
  for (const n of children(e)) {
    if (n.nodeType === 3) {
      out.text(n.nodeValue ?? '', marks);
      continue;
    }
    if (n.nodeType !== 1) continue;
    const c = n as Element;
    if (is(c, 'text', 'span')) {
      const chain = ctx.styles.chain('text', attr(c, 'text', 'style-name'));
      const names = ctx.styles.names(chain);
      const code = names.some((x) => /^(Source Text|Source_20_Text)$/i.test(x));
      // A code span's own font is the code look, not a font choice.
      const own = code ? [] : marksFrom(Object.assign({}, ...chain.map((s) => s.text).reverse()), ctx.styles);
      inlineContent(c, ctx, out, mergeMarks(marks, code ? [...own, { type: 'code' }] : own), flush);
    } else if (is(c, 'text', 'a')) {
      const href = attr(c, 'xlink', 'href') ?? '';
      if (href && !href.startsWith('#') && isAllowedHref(href)) inlineContent(c, ctx, out, mergeMarks(marks, [{ type: 'link', attrs: { href } }]), flush);
      else {
        if (href && !href.startsWith('#')) count(ctx, 'unsafe-link');
        inlineContent(c, ctx, out, marks, flush);
      }
    } else if (is(c, 'text', 's')) out.text(' '.repeat(Math.max(1, Math.min(1000, Number(attr(c, 'text', 'c')) || 1))), marks, true);
    else if (is(c, 'text', 'tab')) out.text('\t', marks, true);
    else if (is(c, 'text', 'line-break')) out.node({ type: 'hardBreak' });
    else if (is(c, 'text', 'note')) {
      const body = first(c, 'text', 'note-body');
      const citation = (first(c, 'text', 'note-citation')?.textContent ?? String(ctx.notes.length + 1)).trim();
      ctx.notes.push(body ? blocksOf(body, ctx) : []);
      count(ctx, 'footnotes');
      out.text(citation, [...marks, { type: 'superscript' }], true);
    } else if (is(c, 'office', 'annotation')) count(ctx, 'comments');
    else if (is(c, 'office', 'annotation-end') || is(c, 'text', 'soft-page-break') || /^(bookmark|bookmark-start|bookmark-end|reference-mark|reference-mark-start|reference-mark-end|change|change-start|change-end|toc-mark|toc-mark-start|toc-mark-end|alphabetical-index-mark|alphabetical-index-mark-start|alphabetical-index-mark-end)$/.test(c.localName) && c.namespaceURI === NS.text) {
      // Positions only; nothing to import.
    } else if (is(c, 'draw', 'frame') || is(c, 'draw', 'a')) {
      const blocks = is(c, 'draw', 'a') ? childElements(c).flatMap((f) => (is(f, 'draw', 'frame') ? frame(f, ctx) : [])) : frame(c, ctx);
      if (blocks.length) flush(blocks);
    } else if (c.namespaceURI === NS.draw) count(ctx, 'shapes');
    else inlineContent(c, ctx, out, marks, flush); // fields (page number, date …) and anything else: keep their text
  }
}

/** A draw:image's picture bytes (stored in the package or inline), its media type from the manifest, and its address. */
function pictureData(image: Element, ctx: Ctx): { data?: Uint8Array; mime?: string; href: string; linked: boolean } {
  const href = attr(image, 'xlink', 'href') ?? '';
  const binary = first(image, 'office', 'binary-data');
  if (binary) {
    try {
      const bin = atob((binary.textContent ?? '').replace(/\s+/g, ''));
      return { data: Uint8Array.from(bin, (ch) => ch.charCodeAt(0)), href, linked: false };
    } catch {
      return { href, linked: false };
    }
  }
  if (href && !/^[a-z][a-z0-9+.-]*:/i.test(href)) {
    const path = href.replace(/^\.\//, '');
    return { data: ctx.files[path], mime: ctx.mimes.get(path), href, linked: false };
  }
  return { href, linked: !!href };
}

/**
 * A draw:frame: a picture, a text box (its paragraphs) or an embedded object (its preview picture). Phase 6: a frame
 * holding a PNG that carries a Classroom OS diagram (export/diagramPng.ts; the ODT export writes it after the SVG of
 * the same drawing) comes back as an editable diagram.
 */
function frame(f: Element, ctx: Ctx): JSONContent[] {
  const image = first(f, 'draw', 'image');
  const textBox = first(f, 'draw', 'text-box');
  const object = first(f, 'draw', 'object') ?? first(f, 'draw', 'object-ole');
  if (textBox) {
    count(ctx, 'text-boxes');
    return blocksOf(textBox, ctx);
  }
  if (object) count(ctx, 'objects');
  if (!image) {
    if (!object) count(ctx, 'shapes');
    return [];
  }
  const alt = (first(f, 'svg', 'title')?.textContent ?? '').trim();
  const title = (first(f, 'svg', 'desc')?.textContent ?? '').trim();
  const wMm = lengthMm(attr(f, 'svg', 'width'));
  for (const candidate of childElements(f).filter((c) => is(c, 'draw', 'image'))) {
    const got = pictureData(candidate, ctx);
    if (!got.data || sniff(got.data) !== 'image/png') continue;
    // The frame's title is the diagram's title; its description, when there is one, the diagram's alt text.
    const diagram = diagramFromPicture(got.data, { id: ctx.nextPreviewId(), widthPx: wMm ? (wMm / 25.4) * 96 : null, maxWidthPx: Number.POSITIVE_INFINITY, alt: title, title: alt });
    if (diagram) {
      ctx.attachments.push(diagram.attachment);
      return [{ type: 'diagram', attrs: diagram.attrs }];
    }
  }
  const { data, mime, href, linked } = pictureData(image, ctx);
  if (linked) {
    count(ctx, 'linked-image');
    return [];
  }
  if (!data) {
    count(ctx, 'image-format');
    return [];
  }
  const ext = (/\.([a-z0-9]+)$/i.exec(href)?.[1] ?? '').toLowerCase();
  const type = mime && Object.values(SHOWN_IMAGES).includes(mime) ? mime : SHOWN_IMAGES[ext] ?? sniff(data);
  if (!type) {
    count(ctx, 'image-format');
    return [{ type: 'paragraph', content: [{ type: 'text', text: `[Picture not imported${alt ? `: ${alt}` : ''} — ${ext ? ext.toUpperCase() : 'unknown'} format]`, marks: [{ type: 'italic' }] }] }];
  }
  const hMm = lengthMm(attr(f, 'svg', 'height'));
  const natural = imageSize(data);
  const width = wMm ? Math.round((wMm / 25.4) * 96) : natural?.width ?? null;
  const height = hMm ? Math.round((hMm / 25.4) * 96) : natural && width ? Math.round((width * natural.height) / natural.width) : null;
  return [{ type: 'image', attrs: { src: toDataUrl(data, type), alt: alt || null, title: title || null, width, height } }];
}

function sniff(b: Uint8Array): string | undefined {
  if (b[0] === 0x89 && b[1] === 0x50) return 'image/png';
  if (b[0] === 0xff && b[1] === 0xd8) return 'image/jpeg';
  if (b[0] === 0x47 && b[1] === 0x49) return 'image/gif';
  return undefined;
}

/** A text:p or text:h as pieces: page breaks, the paragraph (split around pictures), code lines or quote paragraphs. */
function paragraphPieces(e: Element, ctx: Ctx, heading: boolean): Piece[] {
  const styleName = attr(e, 'text', 'style-name');
  const chain = ctx.styles.chain('paragraph', styleName);
  const names = ctx.styles.names(chain);
  const prop = (key: string) => ctx.styles.prop(chain, 'para', key);
  const pieces: Piece[] = [];
  if (prop('fo:break-before') === 'page') pieces.push({ block: { type: 'pageBreak' } });

  // Direct formatting of the whole paragraph (its automatic style) applies to all of its text.
  const auto = chain[0]?.automatic ? chain[0].text : {};
  const base = marksFrom(auto, ctx.styles);
  const align = ALIGN[prop('fo:text-align') ?? ''] || null;
  const isCode = !heading && names.some((n) => /^(Preformatted Text|Preformatted_20_Text)$/i.test(n));
  const isQuote = !heading && names.some((n) => /^(Quotations|Quote)$/i.test(n));
  const isRule = !heading && names.some((n) => /^(Horizontal Line|Horizontal_20_Line)$/i.test(n));
  // Spacing, line spacing and indents set on the paragraph itself (its automatic style); a named style's own are not
  // the paragraph's formatting. Title, Subtitle and Caption (and styles based on them) are the editor's named styles.
  const format = paragraphFormatFrom(chain[0]?.automatic ? chain[0].para : {});
  const named = heading || isCode || isQuote ? null : (names.map((n) => PARAGRAPH_STYLE_NAMES[n.toLowerCase()]).find(Boolean) ?? null);
  let level = 1;
  if (heading) {
    const raw = Number(attr(e, 'text', 'outline-level')) || chain.find((s) => s.outlineLevel)?.outlineLevel || 1;
    if (raw > 4) count(ctx, 'deep-heading');
    level = Math.min(Math.max(raw, 1), 4);
  }

  let inline = new Inline();
  let produced = false;
  const emit = () => {
    const content = inline.items;
    inline = new Inline();
    produced = true;
    if (isCode) pieces.push({ code: content.map((n) => (n.type === 'hardBreak' ? '\n' : n.text ?? '')).join('') });
    else if (isRule && !content.length) pieces.push({ block: { type: 'horizontalRule' } });
    else {
      const attrs = heading ? { level, textAlign: align, ...format } : { textAlign: align, ...format, ...(named ? { paragraphStyle: named } : {}) };
      const node: JSONContent = { type: heading ? 'heading' : 'paragraph', attrs, ...(content.length ? { content } : {}) };
      pieces.push(isQuote ? { quote: node } : { block: node });
    }
  };
  inlineContent(e, ctx, inline, base, (blocks) => {
    if (!inline.empty) emit();
    produced = true;
    // A picture takes the alignment of the paragraph holding it (centred is the editor's default).
    // Phase 6: a restored diagram too.
    for (const b of blocks) pieces.push({ block: (b.type === 'image' || b.type === 'diagram') && (align === 'left' || align === 'right') ? { ...b, attrs: { ...b.attrs, align } } : b });
  });
  const breakBefore = pieces.length > 0 && 'block' in pieces[0] && pieces[0].block.type === 'pageBreak';
  const breakAfter = prop('fo:break-after') === 'page';
  if (!inline.empty) emit();
  // An empty paragraph that only carries a page break is the break itself (as the ODT export writes it).
  else if (!produced && !breakBefore && !breakAfter) emit();
  if (breakAfter) pieces.push({ block: { type: 'pageBreak' } });
  return pieces;
}

/**
 * Joins consecutive code lines into one code block and consecutive quote paragraphs into one quote. Inside a quote
 * section (`inQuote`) the quote paragraphs are the quote's own paragraphs, not a quote of their own.
 */
function group(pieces: Piece[], inQuote = false): JSONContent[] {
  const out: JSONContent[] = [];
  let code: string[] | null = null;
  const endCode = () => {
    if (!code) return;
    const text = code.join('\n');
    out.push({ type: 'codeBlock', attrs: { language: null }, ...(text ? { content: [{ type: 'text', text }] } : {}) });
    code = null;
  };
  for (const p of pieces) {
    if ('code' in p) {
      (code ??= []).push(p.code);
      continue;
    }
    endCode();
    const last = out.at(-1);
    if ('quote' in p && inQuote) out.push(p.quote);
    else if ('quote' in p) {
      if (last?.type === 'blockquote') last.content!.push(p.quote);
      else out.push({ type: 'blockquote', content: [p.quote] });
    } else out.push(p.block);
  }
  endCode();
  return out;
}

/** G-FORMAT paragraph formatting from ODF paragraph properties: line spacing (a percentage), spacing and indents. */
function paragraphFormatFrom(props: Record<string, string>): Record<string, number> {
  const lineHeight = props['fo:line-height'];
  const f = formatOf({
    lineSpacing: lineHeight && /^[\d.]+%$/.test(lineHeight) ? parseFloat(lineHeight) / 100 : null,
    spaceBefore: lengthPt(props['fo:margin-top']),
    spaceAfter: lengthPt(props['fo:margin-bottom']),
    indentLeft: lengthPt(props['fo:margin-left']),
    indentRight: lengthPt(props['fo:margin-right']),
    indentFirstLine: lengthPt(props['fo:text-indent']),
  });
  // No indent is stored as none (as the editor does), and a hanging indent cannot reach left of the page edge.
  if (!f.indentLeft) f.indentLeft = null;
  if (!f.indentRight) f.indentRight = null;
  if (!f.indentFirstLine) f.indentFirstLine = null;
  else if (f.indentFirstLine < 0 && -f.indentFirstLine > (f.indentLeft ?? 0)) f.indentFirstLine = f.indentLeft ? -f.indentLeft : null;
  return Object.fromEntries(Object.entries(f).filter(([, v]) => v !== null)) as Record<string, number>;
}

function listBlock(e: Element, ctx: Ctx, depth: number, inherited: string | null): JSONContent[] {
  let styleName = attr(e, 'text', 'style-name') ?? inherited;
  if (!styleName) {
    // The list style may come from the first paragraph's style instead.
    const p = e.getElementsByTagNameNS(NS.text, 'p')[0];
    const chain = p ? ctx.styles.chain('paragraph', attr(p, 'text', 'style-name')) : [];
    styleName = chain.find((s) => s.listStyle)?.listStyle ?? null;
  }
  const level = (styleName && ctx.styles.lists.get(styleName)?.get(depth + 1)) || (styleName && ctx.styles.lists.get(styleName)?.get(1)) || null;
  const kind = level?.kind ?? 'bullet';
  // The bullet glyph and number format (G-FORMAT list styles), when they are not the editor's default for the level.
  const bulletStyle = level?.kind === 'bullet' && level.glyph !== DEFAULT_BULLETS[depth % 3] ? BULLET_STYLES.find((b) => b.glyph === level.glyph)?.id ?? null : null;
  const numberFormat = level?.kind === 'number' && level.format !== DEFAULT_FORMATS[depth % 3] ? ODF_NUMBER_FORMATS[level.format] ?? null : null;
  let start = 1;
  const items: JSONContent[] = [];
  childElements(e)
    .filter((c) => is(c, 'text', 'list-item') || is(c, 'text', 'list-header'))
    .forEach((item, i) => {
      if (i === 0) start = Number(attr(item, 'text', 'start-value')) || 1;
      const content: JSONContent[] = [];
      for (const c of childElements(item)) {
        if (is(c, 'text', 'list')) content.push(...listBlock(c, ctx, depth + 1, styleName));
        else content.push(...blocksOf(c, ctx));
      }
      // A list item starts with a paragraph in the editor.
      // A heading that starts an item (another word processor's list) becomes the item's paragraph.
      if (content[0]?.type === 'heading') {
        const { level: _level, ...attrs } = content[0].attrs ?? {};
        content[0] = { ...content[0], type: 'paragraph', attrs };
      }
      if (content[0]?.type !== 'paragraph') content.unshift({ type: 'paragraph' });
      // List paragraphs take no first-line or hanging indent: the marker already hangs (as in paragraphFormat.ts).
      const plain = (b: JSONContent): JSONContent => (b.type === 'paragraph' && b.attrs?.indentFirstLine != null ? { ...b, attrs: { ...b.attrs, indentFirstLine: null } } : b);

      // Only the first block of an item must be a paragraph (done above); a heading later in the item stays a heading.
      items.push({ type: 'listItem', content: content.map(plain) });
    });
  if (!items.length) return [];
  return kind === 'number'
    ? [{ type: 'orderedList', attrs: { start, type: null, ...(numberFormat ? { numberFormat } : {}) }, content: items }]
    : [{ type: 'bulletList', ...(bulletStyle ? { attrs: { bulletStyle } } : {}), content: items }];
}

/**
 * Column widths in pixels from the table's table:table-column styles, or null when the columns are not sized: some
 * width is missing, or all columns are equal (the ODT export writes equal columns for a table nobody resized).
 */
function columnWidths(e: Element, ctx: Ctx): number[] | null {
  const widths: number[] = [];
  for (const c of childElements(e)) {
    const cols = is(c, 'table', 'table-columns') || is(c, 'table', 'table-header-columns') ? childElements(c) : [c];
    for (const col of cols) {
      if (!is(col, 'table', 'table-column')) continue;
      const times = Math.min(Math.max(Number(attr(col, 'table', 'number-columns-repeated')) || 1, 1), 64);
      const def = ctx.styles.chain('table-column', attr(col, 'table', 'style-name'))[0];
      const mm = lengthMm(def?.column['style:column-width']);
      for (let i = 0; i < times; i++) widths.push(mm ? Math.round((mm * 96) / 25.4) : NaN);
    }
  }
  if (!widths.length || widths.some((w) => !(w > 0))) return null;
  return widths.every((w) => Math.abs(w - widths[0]) <= 1) ? null : widths;
}

function tableBlock(e: Element, ctx: Ctx): JSONContent[] {
  const rows: JSONContent[] = [];
  const widths = columnWidths(e, ctx);
  const addRow = (row: Element, header: boolean) => {
    const repeat = Math.min(Math.max(Number(attr(row, 'table', 'number-rows-repeated')) || 1, 1), 50);
    const cells: JSONContent[] = [];
    let column = 0;
    for (const c of childElements(row)) {
      const times = Math.min(Math.max(Number(attr(c, 'table', 'number-columns-repeated')) || 1, 1), 64);
      // A covered cell (under a cell spanning columns or rows) takes a column too.
      if (is(c, 'table', 'covered-table-cell')) column += times;
      if (!is(c, 'table', 'table-cell')) continue;
      const content = blocksOf(c, ctx);
      const colspan = Number(attr(c, 'table', 'number-columns-spanned')) || 1;
      for (let i = 0; i < times; i++) {
        const own = widths?.slice(column, column + colspan);
        cells.push({
          type: header ? 'tableHeader' : 'tableCell',
          attrs: { colspan, rowspan: Number(attr(c, 'table', 'number-rows-spanned')) || 1, colwidth: own && own.length === colspan ? own : null },
          content: content.length ? structuredClone(content) : [{ type: 'paragraph' }],
        });
        // The covered cells that follow a spanning cell are counted as they come.
        column += 1;
      }
    }
    for (let i = 0; i < repeat; i++) rows.push({ type: 'tableRow', content: structuredClone(cells) });
  };
  const walk = (parent: Element, header: boolean) => {
    for (const c of childElements(parent)) {
      if (is(c, 'table', 'table-row')) addRow(c, header);
      else if (is(c, 'table', 'table-header-rows')) walk(c, true);
      else if (is(c, 'table', 'table-rows') || is(c, 'table', 'table-row-group')) walk(c, header);
    }
  };
  walk(e, false);
  // Trailing rows a spreadsheet-style repeat padded out with nothing are dropped.
  while (rows.length > 1 && rows.at(-1)!.content!.every((cell) => JSON.stringify(cell.content) === '[{"type":"paragraph"}]')) rows.pop();
  return rows.length ? [{ type: 'table', content: rows }] : [];
}

/** Block content of an element (office:text, a cell, a list item, a section …). */
function blocksOf(parent: Element, ctx: Ctx, inQuote = false): JSONContent[] {
  const pieces: Piece[] = [];
  const els = is(parent, 'text', 'p') || is(parent, 'text', 'h') ? [parent] : childElements(parent);
  for (const c of els) {
    if (is(c, 'text', 'p')) pieces.push(...paragraphPieces(c, ctx, false));
    else if (is(c, 'text', 'h')) pieces.push(...paragraphPieces(c, ctx, true));
    else if (is(c, 'text', 'list')) pieces.push(...listBlock(c, ctx, 0, null).map((block) => ({ block })));
    else if (is(c, 'table', 'table')) pieces.push(...tableBlock(c, ctx).map((block) => ({ block })));
    else if (is(c, 'text', 'table-of-content')) pieces.push({ block: { type: 'tableOfContents' } });
    else if (is(c, 'text', 'section')) {
      if (ctx.styles.prop(ctx.styles.chain('section', attr(c, 'text', 'style-name')), 'para', 'fo:column-count')) count(ctx, 'columns');
      // The ODT export puts each quote in a section named "Quotation N": everything in it (paragraphs, lists,
      // headings, nested quotes) is that one quote. Other sections are read as their content; being read on their
      // own, their code lines and quote paragraphs are never joined with those of a neighbouring section.
      const inner = blocksOf(c, ctx, /^Quotation \d+$/.test(attr(c, 'text', 'name') ?? ''));
      if (/^Quotation \d+$/.test(attr(c, 'text', 'name') ?? '') && inner.length) pieces.push({ block: { type: 'blockquote', content: inner } });
      else pieces.push(...inner.map((block) => ({ block })));
    } else if (/^(alphabetical-index|illustration-index|table-index|object-index|user-index|bibliography)$/.test(c.localName) && c.namespaceURI === NS.text) {
      count(ctx, 'indexes');
      const body = first(c, 'text', 'index-body');
      if (body) pieces.push(...blocksOf(body, ctx).map((block) => ({ block })));
    } else if (is(c, 'draw', 'frame')) pieces.push(...frame(c, ctx).map((block) => ({ block })));
    else if (c.namespaceURI === NS.draw) count(ctx, 'shapes');
    else if (is(c, 'text', 'soft-page-break') || is(c, 'text', 'sequence-decls') || is(c, 'text', 'variable-decls') || is(c, 'text', 'user-field-decls') || is(c, 'office', 'forms')) continue;
    else if (is(c, 'text', 'tracked-changes')) count(ctx, 'tracked-changes');
    else if (is(c, 'text', 'index-title')) pieces.push(...blocksOf(c, ctx).map((block) => ({ block })));
  }
  return group(pieces, inQuote);
}

interface HeaderFooterRead {
  parts: HeaderFooterParts;
  /** Where the page number is, and how it reads ("Page 3 of 9", "Page 3" or "3"); null when there is none. */
  number: { at: PartAlign; text: PageNumberText; format: string | null } | null;
}

const PAGE = '\u0000';
const COUNT = '\u0001';
const TAB = '\u0002';

/**
 * A header or footer: its text in the left, centre and right parts (split at tabs, as word processors lay out
 * headers; text without tabs is placed by its paragraph's alignment) and the page number field, if any. Several
 * paragraphs are joined with spaces.
 */
function readHeaderFooter(e: Element | null, styles: Styles): HeaderFooterRead {
  const empty = { parts: { left: '', center: '', right: '' }, number: null };
  if (!e) return empty;
  let format: string | null = null;
  const read = (n: Node): string => {
    if (n.nodeType === 3) return (n.nodeValue ?? '').replace(/[ \t\r\n]+/g, ' ');
    if (n.nodeType !== 1) return '';
    const el = n as Element;
    if (is(el, 'text', 'page-number')) {
      format ??= attr(el, 'style', 'num-format');
      return PAGE;
    }
    if (is(el, 'text', 'page-count')) return COUNT;
    if (is(el, 'text', 's')) return ' '.repeat(Number(attr(el, 'text', 'c')) || 1);
    if (is(el, 'text', 'tab')) return TAB;
    return children(el).map(read).join('');
  };
  const paragraphs = Array.from(e.getElementsByTagNameNS(NS.text, 'p'));
  const line = paragraphs.map((p) => read(p)).join(' ');
  if (!line.replace(/[\s\u0002]/g, '')) return empty;
  const groups = line.split(TAB);
  const parts: HeaderFooterParts = { left: '', center: '', right: '' };
  if (groups.length === 1) {
    const align = styles.prop(styles.chain('paragraph', paragraphs[0] ? attr(paragraphs[0], 'text', 'style-name') : null), 'para', 'fo:text-align');
    parts[align === 'right' || align === 'end' ? 'right' : align === 'center' ? 'center' : 'left'] = groups[0];
  } else {
    parts.left = groups[0];
    parts.center = groups[1];
    parts.right = groups.slice(2).join(' ');
  }
  let number: HeaderFooterRead['number'] = null;
  for (const at of PART_ALIGNS) {
    const m = new RegExp(`\\s*(page\\s*)?${PAGE}(\\s*(?:of|/)\\s*${COUNT})?`, 'i').exec(parts[at]);
    if (m && !number) {
      number = { at, text: m[2] ? 'pageOfTotal' : m[1] ? 'page' : 'number', format };
      parts[at] = parts[at].replace(m[0], ' ');
    }
    parts[at] = parts[at].replace(/[\u0000\u0001]/g, '').replace(/\s+/g, ' ').trim();
  }
  return { parts, number };
}

const ODF_PAGE_FORMATS: Record<string, PageNumberFormat> = { '1': 'decimal', i: 'lowerRoman', I: 'upperRoman', a: 'lowerLetter', A: 'upperLetter' };

function readPage(stylesDoc: Document | null, contentStyles: Styles, firstParagraphStyle: string | null, report: ImportReport) {
  if (!stylesDoc) return pageFromGeometry(null, {}, report);
  const masters = Array.from(stylesDoc.getElementsByTagNameNS(NS.style, 'master-page'));
  const chain = contentStyles.chain('paragraph', firstParagraphStyle);
  const wanted = chain.find((s) => s.masterPage)?.masterPage ?? 'Standard';
  const named = (name: string | null) => (name ? masters.find((m) => attr(m, 'style', 'name') === name) ?? null : null);
  let master = named(wanted) ?? masters[0] ?? null;
  // A first page with a page style of its own (a title page) that is followed by the document's page style: that
  // next style is the document's, and the first one gives the different first page.
  let firstMaster: Element | null = null;
  const next = master ? named(attr(master, 'style', 'next-style-name')) : null;
  if (master && next && next !== master) {
    firstMaster = master;
    master = next;
  }
  const layoutName = master ? attr(master, 'style', 'page-layout-name') : null;
  const layout = Array.from(stylesDoc.getElementsByTagNameNS(NS.style, 'page-layout')).find((l) => attr(l, 'style', 'name') === layoutName) ?? null;
  const props = first(layout, 'style', 'page-layout-properties');
  const header = first(master, 'style', 'header');
  const footer = first(master, 'style', 'footer');
  const area = (kind: 'header-style' | 'footer-style') => {
    const p = first(first(layout, 'style', kind), 'style', 'header-footer-properties');
    if (!p) return 0;
    return (lengthMm(attr(p, 'fo', 'min-height')) ?? lengthMm(attr(p, 'svg', 'height')) ?? 0) + (lengthMm(attr(p, 'fo', kind === 'header-style' ? 'margin-bottom' : 'margin-top')) ?? 0);
  };
  const h = readHeaderFooter(header, contentStyles);
  const f = readHeaderFooter(footer, contentStyles);
  // The page number is a footer setting in the editor: one in the header is placed in the footer, at the same side.
  const number = f.number ?? h.number;
  const extra: Parameters<typeof pageFromGeometry>[1] = {
    header: h.parts.center,
    footer: f.parts.center,
    pageNumbers: !!number,
    headerLeft: h.parts.left,
    headerRight: h.parts.right,
    footerLeft: f.parts.left,
    footerRight: f.parts.right,
  };
  if (number) {
    extra.pageNumberAlign = number.at;
    extra.pageNumberText = number.text;
  }
  // A different first page: ODF 1.3's header-first / footer-first, or a first page style of its own.
  const firstHeader = firstMaster ? first(firstMaster, 'style', 'header') : first(master, 'style', 'header-first');
  const firstFooter = firstMaster ? first(firstMaster, 'style', 'footer') : first(master, 'style', 'footer-first');
  if (firstMaster || firstHeader || firstFooter) {
    const fh = firstHeader ? readHeaderFooter(firstHeader, contentStyles) : firstMaster ? { parts: { left: '', center: '', right: '' }, number: null } : h;
    const ff = firstFooter ? readHeaderFooter(firstFooter, contentStyles) : firstMaster ? { parts: { left: '', center: '', right: '' }, number: null } : f;
    extra.firstPage = { header: fh.parts, footer: ff.parts, pageNumbers: !!(ff.number ?? fh.number) };
    if (!number && (ff.number ?? fh.number)) {
      // Only the first page shows a page number: the setting is on, and the other pages' footer keeps none … which
      // the editor cannot say, so the number is shown on every page.
      extra.pageNumbers = true;
      extra.pageNumberAlign = (ff.number ?? fh.number)!.at;
      extra.pageNumberText = (ff.number ?? fh.number)!.text;
      report.add('first-page-number', 'The page number shown only on the first page is shown on every page', 'The page number shown only on the first page is shown on every page');
    }
  }
  const startRaw = Number(contentStyles.prop(chain, 'para', 'style:page-number'));
  if (Number.isInteger(startRaw) && startRaw >= 0 && startRaw <= MAX_PAGE_NUMBER_START && startRaw !== 1) extra.pageNumberStart = startRaw;
  if (!props) return pageFromGeometry(null, extra, report);
  const format = (number?.format ?? attr(props, 'style', 'num-format')) || '1';
  if (ODF_PAGE_FORMATS[format]) extra.pageNumberFormat = ODF_PAGE_FORMATS[format];
  const columns = first(props, 'style', 'columns');
  const count = Number(columns ? attr(columns, 'fo', 'column-count') : 1);
  if (Number.isInteger(count) && count > 1) {
    if (count > MAX_COLUMNS) IMPORT_NOTES.columnCount(report, count, MAX_COLUMNS);
    extra.columns = Math.min(count, MAX_COLUMNS);
    const gap = lengthMm(attr(columns!, 'fo', 'column-gap'));
    if (gap !== null) extra.columnSpacing = Math.min(Math.max(Math.round(gap * 10) / 10, 0), MAX_COLUMN_SPACING);
  }
  const mm = (name: string) => lengthMm(attr(props, 'fo', name));
  const width = mm('page-width') ?? 0;
  const height = mm('page-height') ?? 0;
  const orientation = attr(props, 'style', 'print-orientation');
  const margins = {
    // ODF puts the header and footer inside the page margins' box: the text starts below the header area.
    top: (mm('margin-top') ?? 20) + (header ? area('header-style') : 0),
    bottom: (mm('margin-bottom') ?? 20) + (footer ? area('footer-style') : 0),
    left: mm('margin-left') ?? 20,
    right: mm('margin-right') ?? 20,
  };
  return pageFromGeometry({ width, height, landscape: orientation ? orientation === 'landscape' : undefined, margins }, extra, report);
}

/**
 * The document language: the default paragraph style's language (Western, else Asian, else complex script), as a
 * BCP 47 tag such as "en-GB". Null when the file sets none (or "no language").
 */
function documentLanguage(stylesDoc: Document | null): string | null {
  const defaults = stylesDoc ? Array.from(stylesDoc.getElementsByTagNameNS(NS.style, 'default-style')).find((d) => attr(d, 'style', 'family') === 'paragraph') : undefined;
  const props = first(defaults, 'style', 'text-properties');
  if (!props) return null;
  for (const [lang, country] of [
    [attr(props, 'fo', 'language'), attr(props, 'fo', 'country')],
    [attr(props, 'style', 'language-asian'), attr(props, 'style', 'country-asian')],
    [attr(props, 'style', 'language-complex'), attr(props, 'style', 'country-complex')],
  ]) {
    if (!lang || /^(zxx|none|qlt)$/i.test(lang)) continue;
    const tag = country && !/^none$/i.test(country) ? `${lang.toLowerCase()}-${country.toUpperCase()}` : lang.toLowerCase();
    if (isLanguageTag(tag)) return tag;
  }
  return null;
}

/** Reads an .odt file into a new document. Throws a readable error for files that are not OpenDocument text. */
export function importOdt(bytes: Uint8Array, fileName = 'Imported document'): ImportResult {
  const files = unpack(bytes, 'This is not an OpenDocument file (it could not be opened as a zip package)');
  const mimetype = files.mimetype ? strFromU8(files.mimetype).trim() : '';
  if (mimetype && mimetype !== ODT_MIME && mimetype !== 'application/vnd.oasis.opendocument.text-template') {
    throw new Error('This OpenDocument file is not a text document (spreadsheets and presentations cannot be imported here)');
  }
  if (!files['content.xml']) throw new Error('This is not an OpenDocument text file (content.xml is missing)');
  const content = parseXml(strFromU8(files['content.xml']), 'content.xml');
  const stylesDoc = files['styles.xml'] ? parseXml(strFromU8(files['styles.xml']), 'styles.xml') : null;
  const report = new ImportReport();
  const styles = new Styles();
  const fontRoot = (d: Document | null) => (d ? d.getElementsByTagNameNS(NS.office, 'font-face-decls')[0] ?? null : null);
  styles.addFonts(fontRoot(stylesDoc));
  styles.addFonts(fontRoot(content));
  if (stylesDoc) {
    styles.add(stylesDoc.getElementsByTagNameNS(NS.office, 'styles')[0] ?? null, false);
    styles.add(stylesDoc.getElementsByTagNameNS(NS.office, 'automatic-styles')[0] ?? null, false);
  }
  styles.add(content.getElementsByTagNameNS(NS.office, 'automatic-styles')[0] ?? null, true);
  const mimes = new Map<string, string>();
  if (files['META-INF/manifest.xml']) {
    const manifest = parseXml(strFromU8(files['META-INF/manifest.xml']), 'manifest.xml');
    for (const entry of Array.from(manifest.getElementsByTagNameNS(NS.manifest, 'file-entry'))) {
      const path = attr(entry, 'manifest', 'full-path');
      const type = attr(entry, 'manifest', 'media-type');
      if (path && type) mimes.set(path, type);
    }
  }

  const body = content.getElementsByTagNameNS(NS.office, 'text')[0];
  if (!body) throw new Error('This OpenDocument file has no text body');
  const ctx: Ctx = { styles, files, mimes, report, notes: [], counts: {}, attachments: [], nextPreviewId: previewIds('odt') };
  const blocks = blocksOf(body, ctx);
  if (ctx.notes.length) {
    blocks.push({ type: 'paragraph', content: [{ type: 'text', text: 'Notes', marks: [{ type: 'bold' }] }] });
    blocks.push({ type: 'orderedList', attrs: { start: 1, type: null }, content: ctx.notes.map((n) => ({ type: 'listItem', content: n[0]?.type === 'paragraph' ? n : [{ type: 'paragraph' }, ...n] })) });
  }
  const c = ctx.counts;
  if (c.comments) IMPORT_NOTES.comments(report, c.comments);
  if (c.footnotes) IMPORT_NOTES.footnotes(report, c.footnotes);
  if (c['text-boxes']) IMPORT_NOTES.textBoxes(report, c['text-boxes']);
  if (c.objects) report.add('objects', '1 embedded object (formula or chart) was imported as its picture, or left out if it had none', '{n} embedded objects (formulas or charts) were imported as their pictures, or left out if they had none', c.objects);
  if (c.shapes) IMPORT_NOTES.shapes(report, c.shapes);
  if (c['image-format']) IMPORT_NOTES.imageFormat(report, c['image-format']);
  if (c['linked-image']) IMPORT_NOTES.linkedImage(report, c['linked-image']);
  if (c['deep-heading']) IMPORT_NOTES.deepHeading(report, c['deep-heading']);
  if (c['unsafe-link']) IMPORT_NOTES.unsafeLink(report, c['unsafe-link']);
  if (c['tracked-changes']) IMPORT_NOTES.trackedChanges(report);
  if (c.columns) IMPORT_NOTES.columns(report);
  if (c.indexes) report.add('indexes', '1 index was imported as plain text', '{n} indexes were imported as plain text', c.indexes);

  const language = documentLanguage(stylesDoc);
  // The first paragraph or heading (in document order) carries the page style and the first page's number.
  const firstP = Array.from(body.getElementsByTagNameNS(NS.text, '*')).find((e) => e.localName === 'p' || e.localName === 'h');
  const page = readPage(stylesDoc, styles, firstP ? attr(firstP, 'text', 'style-name') : null, report);
  const metaTitle = files['meta.xml'] ? (parseXml(strFromU8(files['meta.xml']), 'meta.xml').getElementsByTagNameNS(NS.dc, 'title')[0]?.textContent ?? '').trim() : '';
  const title = metaTitle || fileName.replace(/\.(odt|ott)$/i, '') || 'Imported document';
  const imported = importedContent(attachCaptions({ type: 'doc', content: blocks }), page, language);
  // Only the previews of diagrams that made it into the document (all of them, unless the file is damaged).
  const used = new Set(diagramNodes(imported.doc).map((n) => n.attrs?.previewId));
  const kept = ctx.attachments.filter((a) => used.has(a.id));
  return { content: imported, title, report, format: 'odt', ...(kept.length ? { attachments: kept } : {}) };
}
