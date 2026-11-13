/**
 * DOCX import: converts a Word document into a new document with mammoth (BSD-2-Clause), which reads headings,
 * paragraphs, bold/italic/underline/strikethrough/sub/superscript, lists, tables (with merged cells), links and
 * embedded pictures. On top of mammoth: paragraph alignment, page breaks, the table of contents, page size,
 * margins, header and footer text and page numbers; and a report of what could not be imported (comments,
 * equations, fonts and colours …), worked out from the file itself.
 */
import type { JSONContent } from '@tiptap/core';
import { DOMParser as PMDOMParser } from '@tiptap/pm/model';
import { strFromU8, strToU8, zipSync, type Zippable } from 'fflate';
import { isAllowedHref } from '../links';
import { documentSchema } from '../schema';
import { paperSize } from '../types';
import { attachCaptions, IMPORT_NOTES, ImportReport, importedContent, pageFromGeometry, unpack, type ImportResult } from './common';
import { imageSize } from './imageSize';

/** Private-use characters that carry what mammoth's HTML cannot (alignment, page breaks) through the conversion. */
const ALIGN_MARK = '\uE000';
const BREAK_MARK = '\uE001';
const ALIGN_CODES: Record<string, string> = { center: 'c', right: 'r', end: 'r', both: 'j', distribute: 'j' };
const ALIGN_NAMES: Record<string, string> = { c: 'center', r: 'right', j: 'justify' };

/** Pictures a browser shows (others, such as EMF, WMF and TIFF from Office, are replaced by a note). */
const SHOWN = /^data:image\/(png|jpe?g|gif|bmp|webp|svg\+xml);base64,/i;

const TWIP_MM = 25.4 / 1440;

const STYLE_MAP = [
  'u => u',
  // Word's Title, Subtitle and Caption are the editor's named paragraph styles (G-FORMAT).
  "p[style-name='Title'] => p.dcos-style-title:fresh",
  "p[style-name='Subtitle'] => p.dcos-style-subtitle:fresh",
  "p[style-name='Caption'] => p.dcos-style-caption:fresh",
  "p[style-name='Quote'] => blockquote > p:fresh",
  "p[style-name='Intense Quote'] => blockquote > p:fresh",
  "p[style-name='HTML Preformatted'] => pre:separator('\\n')",
  "p[style-name='Code'] => pre:separator('\\n')",
  "r[style-name='HTML Code'] => code",
  "p[style-name='TOC Heading'] => p.dcos-toc-title:fresh",
  ...Array.from({ length: 9 }, (_, i) => [`p[style-name='toc ${i + 1}'] => p.dcos-toc-entry:fresh`, `p[style-name='TOC ${i + 1}'] => p.dcos-toc-entry:fresh`]).flat(),
];

interface MammothElement {
  type: string;
  children?: MammothElement[];
  alignment?: string | null;
  breakType?: string;
  value?: string;
}
interface Mammoth {
  convertToHtml(input: unknown, options: unknown): Promise<{ value: string; messages: Array<{ type: string; message: string }> }>;
  transforms: { paragraph(f: (p: MammothElement) => MammothElement): unknown; run(f: (r: MammothElement) => MammothElement): unknown };
}

const textRun = (value: string): MammothElement =>
  ({ type: 'run', children: [{ type: 'text', value }], styleId: null, styleName: null, isBold: false, isUnderline: false, isItalic: false, isStrikethrough: false, isAllCaps: false, isSmallCaps: false, verticalAlignment: 'baseline', font: null, fontSize: null, highlight: null }) as MammothElement;

/** Marks aligned paragraphs and page breaks with private-use characters, read back from the HTML afterwards. */
function transform(m: Mammoth) {
  const paragraphs = m.transforms.paragraph((p) => {
    const code = p.alignment ? ALIGN_CODES[p.alignment] : undefined;
    if (code && p.children?.length) p.children.unshift(textRun(ALIGN_MARK + code));
    return p;
  }) as (e: MammothElement) => MammothElement;
  const breaks = m.transforms.run((r) => {
    if (r.children?.some((c) => c.type === 'break' && c.breakType === 'page')) {
      r.children = r.children.map((c) => (c.type === 'break' && c.breakType === 'page' ? { type: 'text', value: BREAK_MARK } : c));
    }
    return r;
  }) as (e: MammothElement) => MammothElement;
  return (doc: MammothElement) => breaks(paragraphs(doc));
}

const BLOCK = 'P,H1,H2,H3,H4,H5,H6,LI,PRE,TD,TH';
const blockOf = (n: Node): HTMLElement | null => (n.parentElement ? n.parentElement.closest<HTMLElement>(BLOCK) : null);

/** Turns the alignment and page-break markers into the editor's HTML (text-align, page-break divs). */
function applyMarkers(body: HTMLElement) {
  const walker = body.ownerDocument.createTreeWalker(body, 4 /* NodeFilter.SHOW_TEXT */);
  const texts: Text[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) if (/[\uE000\uE001]/.test(n.nodeValue ?? '')) texts.push(n as Text);
  for (const t of texts) {
    const block = blockOf(t);
    let value = t.nodeValue ?? '';
    const align = new RegExp(`${ALIGN_MARK}([crj])`).exec(value);
    if (align) {
      value = value.replace(align[0], '');
      if (block && /^(P|H\d)$/.test(block.tagName)) block.style.textAlign = ALIGN_NAMES[align[1]];
    }
    if (value.includes(BREAK_MARK)) {
      // Before the paragraph when the break comes first in it, otherwise after it.
      const blockText = (block?.textContent ?? '').replace(new RegExp(`${ALIGN_MARK}[crj]`, 'g'), '');
      const before = blockText.replace(BREAK_MARK, '').trim() === '' || blockText.trimStart().startsWith(BREAK_MARK);
      const div = body.ownerDocument.createElement('div');
      div.setAttribute('data-type', 'page-break');
      const after = blockText.slice(blockText.indexOf(BREAK_MARK) + 1).trim() !== '';
      if (!before && after && block && block.parentElement && /^(P|H\d)$/.test(block.tagName)) {
        // A break in the middle of a paragraph: the paragraph is split there, as Word shows it (the text after the
        // break starts the next page), instead of joining the words on either side.
        const at = value.indexOf(BREAK_MARK);
        t.nodeValue = value.slice(0, at) + value.slice(at + 1).split(BREAK_MARK).join('');
        const range = body.ownerDocument.createRange();
        range.setStart(t, at);
        range.setEnd(block, block.childNodes.length);
        const rest = block.cloneNode(false) as HTMLElement;
        rest.append(range.extractContents());
        block.after(div, rest);
        continue;
      }
      value = value.split(BREAK_MARK).join('');
      t.nodeValue = value;
      if (block && block.parentElement && !/^(TD|TH|LI)$/.test(block.tagName)) {
        if (before) block.before(div);
        else block.after(div);
        if (!(block.textContent ?? '').trim() && !block.querySelector('img')) block.remove();
      } else if (block) block.append(div);
      else body.append(div);
    } else t.nodeValue = value;
  }
}

function cleanHtml(body: HTMLElement, textWidthPx: number, counts: Record<string, number>) {
  const doc = body.ownerDocument;
  const count = (k: string, n = 1) => (counts[k] = (counts[k] ?? 0) + n);
  applyMarkers(body);

  // Headings below level 4: the editor has four levels.
  for (const h of Array.from(body.querySelectorAll('h5, h6'))) {
    const h4 = doc.createElement('h4');
    h4.innerHTML = h.innerHTML;
    h4.setAttribute('style', h.getAttribute('style') ?? '');
    h.replaceWith(h4);
    count('deep-heading');
  }

  // Footnotes and endnotes: mammoth lists them at the end; the "↑" links back are removed and the list is titled.
  const notes = Array.from(body.querySelectorAll('li[id^="footnote-"], li[id^="endnote-"]'));
  if (notes.length) {
    count('footnotes', notes.length);
    const list = notes[0].parentElement;
    if (list) {
      const title = doc.createElement('p');
      title.innerHTML = '<strong>Notes</strong>';
      list.before(title);
    }
  }
  for (const a of Array.from(body.querySelectorAll('a[href^="#footnote-ref-"], a[href^="#endnote-ref-"]'))) a.remove();
  for (const note of notes) {
    // Without the "↑" links, note text keeps the spaces around it: trim them.
    for (const p of Array.from(note.querySelectorAll('p'))) {
      const texts = Array.from(p.childNodes).filter((n) => n.nodeType === 3);
      if (texts[0]) texts[0].nodeValue = (texts[0].nodeValue ?? '').trimStart();
      if (texts.at(-1)) texts.at(-1)!.nodeValue = (texts.at(-1)!.nodeValue ?? '').trimEnd();
    }
  }
  // In-document anchors and bookmarks have nowhere to point in the editor: keep their text only.
  // Addresses the editor does not allow (e.g. javascript:) become plain text, counted for the report; the editor's own
  // link check decides, so what the report says matches what is imported.
  for (const a of Array.from(body.querySelectorAll('a'))) {
    const href = a.getAttribute('href') ?? '';
    if (!href || href.startsWith('#')) a.replaceWith(...Array.from(a.childNodes));
    else if (!isAllowedHref(href)) {
      counts['unsafe-link'] = (counts['unsafe-link'] ?? 0) + 1;
      a.replaceWith(...Array.from(a.childNodes));
    }
  }

  // The table of contents: Word's cached entries become the editor's live table of contents.
  const entries = Array.from(body.querySelectorAll('p.dcos-toc-entry'));
  if (entries.length) {
    const toc = doc.createElement('div');
    toc.setAttribute('data-type', 'table-of-contents');
    const firstEntry = entries[0];
    const prev = firstEntry.previousElementSibling;
    if (prev && (prev.classList.contains('dcos-toc-title') || /^\s*(table of )?contents\s*$/i.test(prev.textContent ?? ''))) prev.remove();
    firstEntry.before(toc);
    for (const e of entries) e.remove();
  }
  for (const t of Array.from(body.querySelectorAll('p.dcos-toc-title'))) t.removeAttribute('class');
  for (const p of Array.from(body.querySelectorAll('p[class^="dcos-style-"]'))) {
    p.setAttribute('data-paragraph-style', p.className.slice('dcos-style-'.length));
    p.removeAttribute('class');
  }

  // Pictures: sized for the page (Word's own size is not in mammoth's output, so the picture's own size, made to fit).
  for (const img of Array.from(body.querySelectorAll('img'))) {
    const src = img.getAttribute('src') ?? '';
    if (!SHOWN.test(src)) {
      const kind = /^data:image\/(?:x-)?([a-z0-9.+-]+)/i.exec(src)?.[1]?.toUpperCase() ?? 'unknown';
      const alt = img.getAttribute('alt') ?? '';
      const note = doc.createElement('em');
      note.textContent = `[Picture not imported${alt ? `: ${alt}` : ''} — ${kind} format]`;
      const p = doc.createElement('p');
      p.append(note);
      img.replaceWith(p);
      count(src.startsWith('data:') ? 'image-format' : 'linked-image');
      continue;
    }
    // The picture's alignment is its paragraph's (G-INSERT; centred is the editor's default). A Word paragraph with
    // no alignment, or an explicit left/start one (neither gets a marker), is on the left in Word, so the picture is too.
    const align = img.closest('p')?.style.textAlign;
    if (align === 'right') img.setAttribute('data-align', 'right');
    else if (!align || align === 'left') img.setAttribute('data-align', 'left');
    try {
      const bytes = Uint8Array.from(atob(src.slice(src.indexOf(',') + 1)), (c) => c.charCodeAt(0));
      const size = imageSize(bytes);
      if (size) {
        const width = Math.min(size.width, textWidthPx);
        img.setAttribute('width', String(Math.round(width)));
        img.setAttribute('height', String(Math.round((width * size.height) / size.width)));
      }
    } catch {
      // Unreadable size: the editor shows the picture at its own size.
    }
  }

  // Pictures are blocks in the editor: a paragraph holding only pictures is replaced by them (otherwise an empty
  // paragraph would be left in front of each one).
  for (const p of Array.from(body.querySelectorAll('p'))) {
    const imgs = Array.from(p.querySelectorAll('img'));
    if (!imgs.length || (p.textContent ?? '').trim() || Array.from(p.querySelectorAll('*')).some((e) => e.tagName !== 'IMG' && !e.querySelector('img'))) continue;
    p.replaceWith(...imgs);
  }

  // docx writers (this app included) end every table with an empty paragraph, as Word requires; it is not content.
  for (const table of Array.from(body.querySelectorAll('table'))) {
    const next = table.nextElementSibling;
    if (next?.tagName === 'P' && !next.textContent && !next.children.length) next.remove();
  }
}

/** The text of a header or footer part; Word's page number fields become the page numbers setting. */
function headerFooterText(xml: string | undefined): { text: string; pageNumbers: boolean } {
  if (!xml) return { text: '', pageNumbers: false };
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  let pageNumbers = false;
  const parts: string[] = [];
  for (const p of Array.from(doc.getElementsByTagNameNS('*', 'p'))) {
    let text = '';
    let instr = '';
    let state: 'none' | 'code' | 'result' = 'none';
    let skip = false;
    const walk = (n: Element) => {
      for (const c of Array.from(n.children)) {
        const name = c.localName;
        if (name === 'fldSimple') {
          const code = c.getAttributeNS(c.namespaceURI, 'instr') ?? c.getAttribute('w:instr') ?? '';
          if (/\b(PAGE|NUMPAGES|SECTIONPAGES)\b/.test(code)) {
            pageNumbers = true;
            text += '\u0000';
          } else walk(c);
        } else if (name === 'fldChar') {
          const type = c.getAttributeNS(c.namespaceURI, 'fldCharType') ?? c.getAttribute('w:fldCharType');
          if (type === 'begin') {
            state = 'code';
            instr = '';
          } else if (type === 'separate') {
            state = 'result';
            skip = /\b(PAGE|NUMPAGES|SECTIONPAGES)\b/.test(instr);
            if (skip) {
              pageNumbers = true;
              text += '\u0000';
            }
          } else if (type === 'end') {
            if (state === 'code' && /\b(PAGE|NUMPAGES|SECTIONPAGES)\b/.test(instr)) {
              pageNumbers = true;
              text += '\u0000';
            }
            state = 'none';
            skip = false;
          }
        } else if (name === 'instrText') instr += c.textContent ?? '';
        else if (name === 't') {
          if (!(state === 'result' && skip) && state !== 'code') text += c.textContent ?? '';
        } else if (name === 'tab') text += ' ';
        else walk(c);
      }
    };
    walk(p);
    parts.push(text);
  }
  const text = parts
    .join(' ')
    .replace(/\s*(?:page\s*)?\u0000(?:\s*(?:of|\/)\s*\u0000)?/gi, ' ')
    .replace(/\u0000/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return { text, pageNumbers };
}

/** Counts of features in the Word body that the import leaves out or simplifies, for the report. */
function survey(xml: string, report: ImportReport) {
  const n = (re: RegExp) => (xml.match(re) ?? []).length;
  const comments = n(/<w:commentReference\b/g);
  if (comments) IMPORT_NOTES.comments(report, comments);
  const equations = n(/<m:oMath[\s>]/g);
  if (equations) IMPORT_NOTES.equations(report, equations);
  const charts = n(/<c:chart\b/g);
  if (charts) IMPORT_NOTES.charts(report, charts);
  const textBoxes = Math.max(n(/<wps:txbx\b/g), n(/<v:textbox\b/g));
  if (textBoxes) IMPORT_NOTES.textBoxes(report, textBoxes);
  const shapes = n(/<wps:wsp\b/g) - n(/<wps:wsp\b[^>]*>(?:(?!<\/wps:wsp>)[\s\S])*?<wps:txbx\b/g);
  if (shapes > 0) IMPORT_NOTES.shapes(report, shapes);
  if (/<w:(ins|del)\b/.test(xml)) IMPORT_NOTES.trackedChanges(report);
  const sections = n(/<w:pPr>(?:(?!<\/w:pPr>)[\s\S])*?<w:sectPr\b/g);
  if (sections) IMPORT_NOTES.sections(report, sections);
  if (/<w:cols\b[^>]*w:num="([2-9]|\d\d)"/.test(xml)) IMPORT_NOTES.columns(report);
  const kinds: string[] = [];
  if (/<w:rFonts\b/.test(xml)) kinds.push('fonts');
  if (/<w:sz\b/.test(xml)) kinds.push('text sizes');
  if (/<w:color w:val="(?!auto"|000000")/.test(xml)) kinds.push('text colours');
  if (/<w:highlight\b/.test(xml) || /<w:rPr>(?:(?!<\/w:rPr>)[\s\S])*?<w:shd\b[^>]*w:fill="(?!auto")/.test(xml)) kinds.push('highlighting');
  if (/<w:pPr>(?:(?!<\/w:pPr>)[\s\S])*?<w:(ind|spacing)\b/.test(xml)) kinds.push('paragraph spacing and indents');
  IMPORT_NOTES.formatting(report, kinds);
}

function attrOf(e: Element | null | undefined, name: string): string | null {
  if (!e) return null;
  return e.getAttribute(`w:${name}`) ?? e.getAttributeNS(e.namespaceURI, name);
}

/** Page size, margins, header and footer from the document's (last) section. */
function readPage(files: Record<string, Uint8Array>, documentXml: string, report: ImportReport) {
  const doc = new DOMParser().parseFromString(documentXml, 'application/xml');
  const body = doc.getElementsByTagNameNS('*', 'body')[0];
  const sect = body ? Array.from(body.children).filter((c) => c.localName === 'sectPr').at(-1) : undefined;
  const child = (name: string) => (sect ? Array.from(sect.children).find((c) => c.localName === name) : undefined);
  const size = child('pgSz');
  const mar = child('pgMar');
  const twips = (e: Element | undefined, name: string) => {
    const v = Number(attrOf(e, name));
    return Number.isFinite(v) ? Math.abs(v) * TWIP_MM : null;
  };
  // Header and footer: the default ones of the last section, found through the document's relationships.
  const rels = files['word/_rels/document.xml.rels'] ? new DOMParser().parseFromString(strFromU8(files['word/_rels/document.xml.rels']), 'application/xml') : null;
  const partFor = (kind: 'headerReference' | 'footerReference') => {
    const ref = sect ? Array.from(sect.children).find((c) => c.localName === kind && (attrOf(c, 'type') ?? 'default') === 'default') : undefined;
    const id = ref ? ref.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id') ?? ref.getAttribute('r:id') : null;
    const rel = id && rels ? Array.from(rels.getElementsByTagNameNS('*', 'Relationship')).find((r) => r.getAttribute('Id') === id) : undefined;
    const target = rel?.getAttribute('Target');
    if (!target) return undefined;
    const path = target.startsWith('/') ? target.slice(1) : `word/${target}`;
    return files[path] ? strFromU8(files[path]) : undefined;
  };
  const headerXml = partFor('headerReference');
  const footerXml = partFor('footerReference');
  const header = headerFooterText(headerXml);
  const footer = headerFooterText(footerXml);
  // What the page settings cannot take from Word (yet) is reported rather than dropped silently.
  const numType = child('pgNumType');
  const fmt = attrOf(numType, 'fmt');
  if ((fmt && fmt !== 'decimal') || attrOf(numType, 'start') !== null) IMPORT_NOTES.pageNumbering(report);
  if (child('titlePg') && attrOf(child('titlePg'), 'val') !== '0' && attrOf(child('titlePg'), 'val') !== 'false') IMPORT_NOTES.firstPage(report);
  if ([headerXml, footerXml].some((x) => x && /<w:(p)?tab\b/.test(x.replace(/<w:tabs>[\s\S]*?<\/w:tabs>/g, '')))) IMPORT_NOTES.headerParts(report);
  const extra = { header: header.text, footer: footer.text, pageNumbers: header.pageNumbers || footer.pageNumbers };
  const width = twips(size, 'w');
  const height = twips(size, 'h');
  if (!width || !height) return pageFromGeometry(null, extra, report);
  const orient = attrOf(size, 'orient');
  return pageFromGeometry(
    {
      width,
      height,
      landscape: orient ? orient === 'landscape' : undefined,
      margins: { top: twips(mar, 'top') ?? 25.4, right: twips(mar, 'right') ?? 25.4, bottom: twips(mar, 'bottom') ?? 25.4, left: twips(mar, 'left') ?? 25.4 },
    },
    extra,
    report,
  );
}

/** The document's default proofing language (w:lang in styles.xml's document defaults), as a BCP 47 tag. */
function documentLanguage(files: Record<string, Uint8Array>): string | null {
  const xml = files['word/styles.xml'] ? strFromU8(files['word/styles.xml']) : '';
  const defaults = /<w:docDefaults>[\s\S]*?<\/w:docDefaults>/.exec(xml)?.[0] ?? '';
  const lang = /<w:lang\b[^>]*>/.exec(defaults)?.[0] ?? '';
  // The language of Western text, else East Asian, else right-to-left text (how the DOCX export writes each).
  for (const name of ['val', 'eastAsia', 'bidi']) {
    const value = new RegExp(`w:${name}="([^"]+)"`).exec(lang)?.[1];
    if (value && /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8}){0,3}$/.test(value)) return value;
  }
  return null;
}

/** Reads a .docx file into a new document. Throws a readable error for files that are not Word documents. */
export async function importDocx(bytes: Uint8Array, fileName = 'Imported document'): Promise<ImportResult> {
  const files = unpack(bytes, 'This is not a Word .docx file. Older .doc files cannot be imported: save it as .docx first');
  const documentXml = files['word/document.xml'] ? strFromU8(files['word/document.xml']) : null;
  if (!documentXml) throw new Error('This is not a Word document (word/document.xml is missing)');
  const report = new ImportReport();
  const page = readPage(files, documentXml, report);

  const mod = (await import('mammoth')) as unknown as Mammoth & { default?: Mammoth };
  const mammoth = mod.default ?? mod;
  // mammoth reads any w:tblHeader as a header row, even one switched off (w:val="off", as this app and Word write
  // for ordinary rows): those are removed first, so only real header rows become header cells.
  // A hyperlink whose relationship is missing from document.xml.rels (a damaged or hand-made file) made mammoth throw:
  // such links lose their (unknown) address and keep their text.
  const relsXml = files['word/_rels/document.xml.rels'] ? strFromU8(files['word/_rels/document.xml.rels']) : '';
  const relIds = new Set([...relsXml.matchAll(/\bId="([^"]+)"/g)].map((m) => m[1]));
  const fixed = documentXml
    .replace(/<w:tblHeader w:val="(?:off|false|0)"\s*\/>/g, '')
    .replace(/(<w:hyperlink\b[^>]*?)\s+r:id="([^"]*)"/g, (all, start: string, id: string) => (relIds.has(id) ? all : start));
  // mammoth gets the parts unpacked above, packed again without compression: what it reads is what was size-checked
  // (it unpacks with its own zip reader, which would not stop at the stated sizes).
  const parts: Zippable = {};
  for (const [path, data] of Object.entries({ ...files, 'word/document.xml': strToU8(fixed) })) parts[path] = [data, { level: 0 }];
  const source = zipSync(parts);
  const buffer = source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength) as ArrayBuffer;
  // Node's build of mammoth reads `buffer`, the browser's `arrayBuffer`.
  const input: Record<string, unknown> = { arrayBuffer: buffer };
  const NodeBuffer = (globalThis as { Buffer?: { from(b: ArrayBuffer): unknown } }).Buffer;
  if (NodeBuffer) input.buffer = NodeBuffer.from(buffer);
  const { value: html, messages } = await mammoth.convertToHtml(input, {
    styleMap: STYLE_MAP,
    includeDefaultStyleMap: true,
    ignoreEmptyParagraphs: false,
    externalFileAccess: false,
    transformDocument: transform(mammoth),
  });

  const counts: Record<string, number> = {};
  const htmlDoc = new DOMParser().parseFromString(`<!doctype html><html><body>${html}</body></html>`, 'text/html');
  const paper = paperSize(page);
  cleanHtml(htmlDoc.body, Math.round(((paper.width - page.margins.left - page.margins.right) / 25.4) * 96), counts);
  const parsed = PMDOMParser.fromSchema(documentSchema()).parse(htmlDoc.body, { preserveWhitespace: true });
  const doc = attachCaptions(parsed.toJSON() as JSONContent);

  survey(documentXml, report);
  // List numbering: mammoth numbers every list 1, 2, 3 with default bullets. Start numbers and level-0 formats other
  // than plain numbers or bullets are reported.
  const numbering = files['word/numbering.xml'] ? strFromU8(files['word/numbering.xml']) : '';
  const usedNum = /<w:numPr>/.test(documentXml);
  if (usedNum && (/<w:startOverride w:val="(?!1")\d+"/.test(numbering) || /<w:lvl w:ilvl="0"[^>]*>\s*<w:start w:val="(?!1")\d+"/.test(numbering) || /<w:lvl w:ilvl="0"[^>]*>(?:(?!<\/w:lvl>)[\s\S])*?<w:numFmt w:val="(?:upperRoman|lowerRoman|upperLetter|lowerLetter)"/.test(numbering)))
    IMPORT_NOTES.listNumbering(report);
  if (counts.footnotes) IMPORT_NOTES.footnotes(report, counts.footnotes);
  if (counts['deep-heading']) IMPORT_NOTES.deepHeading(report, counts['deep-heading']);
  if (counts['image-format']) IMPORT_NOTES.imageFormat(report, counts['image-format']);
  if (counts['unsafe-link']) IMPORT_NOTES.unsafeLink(report, counts['unsafe-link']);
  // Styles mammoth does not know are read as ordinary paragraphs and text: say which.
  const styles = new Set<string>();
  const other = new Set<string>();
  for (const m of messages) {
    const style = /Unrecognised (?:paragraph|run|table) style: '([^']+)'/.exec(m.message);
    const element = /An unrecognised element was ignored: (\S+)/.exec(m.message);
    if (style) {
      if (!/^(List Paragraph|Normal|Default Paragraph Font|Hyperlink|Table Grid|Table Normal|No Spacing|Body Text|Caption|footnote reference|endnote reference)$/i.test(style[1])) styles.add(style[1]);
    } else if (element) {
      // Equations, charts and shapes are counted above from the file itself.
      // (Names come as "prefix:name", or "{namespace}name" for namespaces mammoth does not know.)
      if (!/^(m|c|wps|wpg|wpc|v|o|w10|mc):|\{[^}]*(\/math|\/chart|wordprocessingShape|wordprocessingGroup|wordprocessingCanvas|:vml|:office:office|markup-compatibility)[^}]*\}/.test(element[1])) other.add(element[1]);
    } else if (/external image/i.test(m.message)) counts['linked-image'] = (counts['linked-image'] ?? 0) + 1;
    else if (!/^Image of type .* is unlikely to display/.test(m.message)) other.add(m.message);
  }
  if (styles.size) {
    const names = [...styles].slice(0, 5).map((s) => `“${s}”`).join(', ') + (styles.size > 5 ? '…' : '');
    report.add('styles', `Text in 1 Word style (${names}) was imported with ordinary formatting`, `Text in {n} Word styles (${names}) was imported with ordinary formatting`, styles.size);
  }
  if (counts['linked-image']) IMPORT_NOTES.linkedImage(report, counts['linked-image']);
  if (other.size) report.add('other', '1 other kind of content could not be read and was left out', '{n} other kinds of content could not be read and were left out', other.size);

  const core = files['docProps/core.xml'] ? new DOMParser().parseFromString(strFromU8(files['docProps/core.xml']), 'application/xml') : null;
  const metaTitle = (core?.getElementsByTagNameNS('http://purl.org/dc/elements/1.1/', 'title')[0]?.textContent ?? '').trim();
  const title = metaTitle && metaTitle !== 'Document' ? metaTitle : fileName.replace(/\.(docx|dotx|docm)$/i, '') || 'Imported document';
  return { content: importedContent(doc, page, documentLanguage(files)), title, report, format: 'docx' };
}
