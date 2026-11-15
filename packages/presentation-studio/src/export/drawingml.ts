/**
 * DrawingML text bodies for the PPTX, written by us rather than by PptxGenJS: its text writer puts one <a:pPr> per
 * run inside a paragraph (invalid OOXML when a paragraph has several differently formatted runs), drops the object
 * name of placeholder text and reorders margins. Every text body in the file comes from here and replaces a marker
 * in the PptxGenJS output (pptxPost.ts). Element order follows ECMA-376 (CT_TextParagraphProperties,
 * CT_TextCharacterProperties). Pure.
 */
import { pxToEmu } from '../geometry';
import type { Autofit, VerticalAlign } from '../types';
import type { TextParagraph, TextRun } from './richRuns';
import { esc, hex6, int } from './xml';

const PT = 96 / 72;

/** Hyperlinks need relationships in the part that holds the text: `add` gives the relationship id for a URL. */
export interface LinkRels {
  add(url: string): string;
}

/** A link collector writing ids `rIdDcosL1`, `rIdDcosL2`… (unique beside PptxGenJS's numeric ids). */
export function linkRels(): LinkRels & { entries: Array<{ id: string; url: string }> } {
  const entries: Array<{ id: string; url: string }> = [];
  return {
    entries,
    add(url) {
      const found = entries.find((e) => e.url === url);
      if (found) return found.id;
      const id = `rIdDcosL${entries.length + 1}`;
      entries.push({ id, url });
      return id;
    },
  };
}

/** Line spacing as a DrawingML percentage: PowerPoint's 100 % is about 1.15 × the font size for the theme fonts. */
export const lineSpacingPct = (multiple: number) => Math.round(Math.min(9.99, Math.max(0.3, multiple / 1.15)) * 100000);

const sz = (pt: number) => int(Math.min(4000, Math.max(1, pt)) * 100);

function runProps(r: Pick<TextRun, 'sizePt' | 'family' | 'color' | 'bold' | 'italic'> & Partial<TextRun>, links: LinkRels | null, tag = 'a:rPr'): string {
  let a = ` lang="en-US" sz="${sz(r.sizePt)}"`;
  if (r.bold) a += ' b="1"';
  if (r.italic) a += ' i="1"';
  if (r.underline) a += ' u="sng"';
  if (r.strike) a += ' strike="sngStrike"';
  if (r.sup) a += ' baseline="30000"';
  else if (r.sub) a += ' baseline="-25000"';
  a += ' dirty="0"';
  let inner = `<a:solidFill><a:srgbClr val="${hex6(r.color)}"/></a:solidFill>`;
  if (r.highlight) inner += `<a:highlight><a:srgbClr val="${hex6(r.highlight)}"/></a:highlight>`;
  const face = esc(r.family);
  inner += `<a:latin typeface="${face}"/><a:ea typeface="${face}"/><a:cs typeface="${face}"/>`;
  if (r.href && links) inner += `<a:hlinkClick r:id="${links.add(r.href)}"/>`;
  return `<${tag}${a}>${inner}</${tag}>`;
}

const ALIGN = { left: 'l', center: 'ctr', right: 'r', justify: 'just' } as const;

/** One paragraph as <a:p>. */
export function paragraphXml(p: TextParagraph, lineSpacing: number, links: LinkRels | null): string {
  const first = p.runs.find((r) => r.kind === 'text') ?? p.end;
  const em = first.sizePt * PT;
  let pPr = `<a:pPr algn="${ALIGN[p.align] ?? 'l'}"`;
  let bullet = '<a:buNone/>';
  if (p.list) {
    const hang = (p.list.kind === 'number' ? 1.4 : 1.2) * em;
    const level = Math.min(8, p.list.level);
    pPr += ` marL="${pxToEmu((level + 1) * hang)}" indent="${p.list.marker ? -pxToEmu(hang) : 0}"${level ? ` lvl="${level}"` : ''}`;
    if (p.list.marker)
      bullet =
        p.list.kind === 'number'
          ? `<a:buFont typeface="+mj-lt"/><a:buAutoNum type="arabicPeriod"${p.list.start !== 1 ? ` startAt="${p.list.start}"` : ''}/>`
          : `<a:buFont typeface="Arial"/><a:buChar char="${esc(['•', '–', '•'][p.list.level % 3])}"/>`;
  } else pPr += ' marL="0" indent="0"';
  pPr += `><a:lnSpc><a:spcPct val="${lineSpacingPct(lineSpacing)}"/></a:lnSpc>${bullet}</a:pPr>`;
  let body = '';
  for (const r of p.runs) {
    if (r.kind === 'break') body += `<a:br>${runProps(r, null)}</a:br>`;
    else if (r.text) body += `<a:r>${runProps(r, links)}<a:t>${esc(r.text)}</a:t></a:r>`;
  }
  return `<a:p>${pPr}${body}${runProps(p.end, null, 'a:endParaRPr')}</a:p>`;
}

export interface BodyOptions {
  /** Inner margins in px: top, right, bottom, left. */
  padding: [number, number, number, number];
  verticalAlign: VerticalAlign;
  autofit: Autofit;
  /** 'shrink': the scale at which the text fits (normAutofit fontScale). */
  fontScale?: number;
  lineSpacing: number;
}

/** The text body of a shape (<p:txBody>), with the box's margins, anchor and autofit. */
export function shapeTextBody(paras: TextParagraph[], o: BodyOptions, links: LinkRels | null): string {
  const [t, r, b, l] = o.padding.map((v) => pxToEmu(Math.max(0, v)));
  const anchor = o.verticalAlign === 'middle' ? 'ctr' : o.verticalAlign === 'bottom' ? 'b' : 't';
  let fit = '';
  if (o.autofit === 'shrink') fit = o.fontScale && o.fontScale < 0.999 ? `<a:normAutofit fontScale="${Math.round(o.fontScale * 100000)}"/>` : '<a:normAutofit/>';
  else if (o.autofit === 'resize') fit = '<a:spAutoFit/>';
  return `<p:txBody><a:bodyPr wrap="square" lIns="${l}" tIns="${t}" rIns="${r}" bIns="${b}" rtlCol="0" anchor="${anchor}">${fit}</a:bodyPr><a:lstStyle/>${paras.map((p) => paragraphXml(p, o.lineSpacing, links)).join('')}</p:txBody>`;
}

/** The text body of a table cell (<a:txBody>); margins and anchor are on the cell (a:tcPr). */
export function cellTextBody(paras: TextParagraph[], lineSpacing: number, links: LinkRels | null): string {
  return `<a:txBody><a:bodyPr/><a:lstStyle/>${paras.map((p) => paragraphXml(p, lineSpacing, links)).join('')}</a:txBody>`;
}

/** Speaker notes: the notes placeholder's paragraphs (<p:txBody>), kept as paragraphs, bold, italic and links. */
export function notesTextBody(paras: TextParagraph[], links: LinkRels | null): string {
  return `<p:txBody><a:bodyPr/><a:lstStyle/>${paras.map((p) => paragraphXml(p, 1.15, links)).join('')}</p:txBody>`;
}
