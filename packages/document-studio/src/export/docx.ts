import type { JSONContent } from '@tiptap/core';
import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  Footer,
  Header,
  HeadingLevel,
  ImageRun,
  LevelFormat,
  PageBreak,
  PageNumber,
  PageOrientation,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  type IRunOptions,
  type ParagraphChild,
} from 'docx';
import { paperSize, type DocumentContent } from '../types';

const MM_TO_TWIP = 56.6929;
const twip = (mm: number) => Math.round(mm * MM_TO_TWIP);

const HEADINGS = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3, HeadingLevel.HEADING_4];
const ALIGN: Record<string, (typeof AlignmentType)[keyof typeof AlignmentType]> = {
  left: AlignmentType.LEFT,
  center: AlignmentType.CENTER,
  right: AlignmentType.RIGHT,
  justify: AlignmentType.JUSTIFIED,
};

/** Normalises CSS colours (#rgb, #rrggbb, rgb()) to the RRGGBB form Word expects. */
export function toHex(color: unknown): string | undefined {
  if (typeof color !== 'string') return undefined;
  const c = color.trim();
  let m = /^#([0-9a-f]{3})$/i.exec(c);
  if (m) return m[1].split('').map((x) => x + x).join('').toUpperCase();
  m = /^#([0-9a-f]{6})$/i.exec(c);
  if (m) return m[1].toUpperCase();
  m = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(c);
  if (m) return [m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, '0')).join('').toUpperCase();
  return undefined;
}

/** CSS font-size ("14pt", "16px") to Word half-points. */
export function toHalfPoints(size: unknown): number | undefined {
  if (typeof size !== 'string') return undefined;
  const m = /^([\d.]+)\s*(pt|px)?$/.exec(size.trim());
  if (!m) return undefined;
  const n = Number(m[1]);
  const pt = m[2] === 'px' ? n * 0.75 : n;
  return Math.round(pt * 2);
}

function dataUrlToBytes(src: string): { data: Uint8Array; type: 'png' | 'jpg' | 'gif' | 'bmp' } | null {
  const m = /^data:image\/(png|jpe?g|gif|bmp);base64,(.+)$/i.exec(src);
  if (!m) return null;
  const bin = atob(m[2]);
  const data = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) data[i] = bin.charCodeAt(i);
  const t = m[1].toLowerCase();
  return { data, type: t === 'jpeg' ? 'jpg' : (t as 'png' | 'jpg' | 'gif' | 'bmp') };
}

interface Ctx {
  /** Usable text width in pixels (96 dpi), for scaling images. */
  contentWidthPx: number;
  listInstance: number;
  headings: Array<{ level: number; text: string }>;
}

type RunStyle = { -readonly [K in keyof IRunOptions]?: IRunOptions[K] };

function runStyle(marks: JSONContent['marks'] = []): RunStyle {
  const s: RunStyle = {};
  for (const mark of marks) {
    const a = mark.attrs ?? {};
    switch (mark.type) {
      case 'bold':
        s.bold = true;
        break;
      case 'italic':
        s.italics = true;
        break;
      case 'underline':
        s.underline = {};
        break;
      case 'strike':
        s.strike = true;
        break;
      case 'code':
        s.font = 'Courier New';
        break;
      case 'subscript':
        s.subScript = true;
        break;
      case 'superscript':
        s.superScript = true;
        break;
      case 'highlight': {
        const fill = toHex(a.color) ?? 'FFF59D';
        s.shading = { type: ShadingType.CLEAR, fill, color: 'auto' };
        break;
      }
      case 'textStyle': {
        const color = toHex(a.color);
        if (color) s.color = color;
        const size = toHalfPoints(a.fontSize);
        if (size) s.size = size;
        if (typeof a.fontFamily === 'string' && a.fontFamily) s.font = a.fontFamily.split(',')[0].replace(/['"]/g, '').trim();
        const bg = toHex(a.backgroundColor);
        if (bg) s.shading = { type: ShadingType.CLEAR, fill: bg, color: 'auto' };
        break;
      }
    }
  }
  return s;
}

function inlines(nodes: JSONContent[] = [], extra: RunStyle = {}): ParagraphChild[] {
  const out: ParagraphChild[] = [];
  for (const n of nodes) {
    if (n.type === 'text') {
      const style = { ...extra, ...runStyle(n.marks) };
      const link = n.marks?.find((m) => m.type === 'link');
      if (link?.attrs?.href) {
        out.push(
          new ExternalHyperlink({
            link: String(link.attrs.href),
            children: [new TextRun({ ...style, text: n.text ?? '', style: 'Hyperlink' })],
          }),
        );
      } else {
        out.push(new TextRun({ ...style, text: n.text ?? '' }));
      }
    } else if (n.type === 'hardBreak') {
      out.push(new TextRun({ break: 1 }));
    }
  }
  return out;
}

function imageParagraph(node: JSONContent, ctx: Ctx): Paragraph {
  const src = String(node.attrs?.src ?? '');
  const img = dataUrlToBytes(src);
  if (!img) {
    return new Paragraph({ children: [new TextRun({ text: `[Image: ${node.attrs?.alt || src.slice(0, 60)}]`, italics: true, color: '888888' })] });
  }
  let width = Number(node.attrs?.width) || 480;
  let height = Number(node.attrs?.height) || Math.round(width * 0.66);
  if (width > ctx.contentWidthPx) {
    height = Math.round((height * ctx.contentWidthPx) / width);
    width = ctx.contentWidthPx;
  }
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [
      new ImageRun({
        type: img.type,
        data: img.data,
        transformation: { width, height },
        altText: { name: 'image', description: String(node.attrs?.alt ?? ''), title: String(node.attrs?.title ?? '') },
      }),
    ],
  });
}

function list(node: JSONContent, ctx: Ctx, level: number, ordered: boolean): Paragraph[] {
  const instance = ++ctx.listInstance;
  const out: Paragraph[] = [];
  for (const item of node.content ?? []) {
    let first = true;
    for (const child of item.content ?? []) {
      if (child.type === 'bulletList' || child.type === 'orderedList') {
        out.push(...list(child, ctx, Math.min(level + 1, 8), child.type === 'orderedList'));
      } else if (child.type === 'paragraph') {
        out.push(
          new Paragraph({
            children: inlines(child.content),
            // Continuation paragraphs in the same item are indented but not numbered.
            ...(first ? { numbering: { reference: ordered ? 'dcos-ordered' : 'dcos-bullet', level, instance } } : { indent: { left: 720 * (level + 1) } }),
          }),
        );
        first = false;
      }
    }
  }
  return out;
}

function tableBlock(node: JSONContent, ctx: Ctx): Table {
  const rows = (node.content ?? []).map(
    (row) =>
      new TableRow({
        tableHeader: (row.content ?? []).every((c) => c.type === 'tableHeader'),
        children: (row.content ?? []).map((cell) => {
          const isHeader = cell.type === 'tableHeader';
          const children = blocks(cell.content ?? [], { ...ctx, contentWidthPx: ctx.contentWidthPx / Math.max(1, row.content?.length ?? 1) }).filter(
            (b): b is Paragraph => b instanceof Paragraph,
          );
          return new TableCell({
            columnSpan: Number(cell.attrs?.colspan) || 1,
            rowSpan: Number(cell.attrs?.rowspan) || 1,
            shading: isHeader ? { type: ShadingType.CLEAR, fill: 'F1F1F4', color: 'auto' } : undefined,
            margins: { top: 60, bottom: 60, left: 100, right: 100 },
            children: children.length ? children : [new Paragraph({})],
          });
        }),
      }),
  );
  return new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE } });
}

function blocks(nodes: JSONContent[], ctx: Ctx): Array<Paragraph | Table> {
  const out: Array<Paragraph | Table> = [];
  for (const node of nodes) {
    const align = ALIGN[String(node.attrs?.textAlign ?? '')];
    switch (node.type) {
      case 'paragraph':
        out.push(new Paragraph({ children: inlines(node.content), alignment: align }));
        break;
      case 'heading': {
        const level = Math.min(Math.max(Number(node.attrs?.level) || 1, 1), 4);
        out.push(new Paragraph({ heading: HEADINGS[level - 1], children: inlines(node.content), alignment: align }));
        break;
      }
      case 'bulletList':
      case 'orderedList':
        out.push(...list(node, ctx, 0, node.type === 'orderedList'));
        break;
      case 'blockquote':
        for (const child of node.content ?? []) {
          if (child.type === 'paragraph') {
            out.push(
              new Paragraph({
                children: inlines(child.content, { color: '555555' }),
                indent: { left: 720 },
                border: { left: { style: BorderStyle.SINGLE, size: 18, color: 'C7C7D1', space: 12 } },
              }),
            );
          } else {
            out.push(...blocks([child], ctx));
          }
        }
        break;
      case 'codeBlock': {
        const lines = (node.content ?? []).map((t) => t.text ?? '').join('').split('\n');
        for (const line of lines) {
          out.push(
            new Paragraph({
              shading: { type: ShadingType.CLEAR, fill: 'F4F4F6', color: 'auto' },
              spacing: { after: 0 },
              children: [new TextRun({ text: line, font: 'Courier New', size: 20 })],
            }),
          );
        }
        break;
      }
      case 'horizontalRule':
        out.push(new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'BBBBBB', space: 1 } }, children: [] }));
        break;
      case 'image':
        out.push(imageParagraph(node, ctx));
        break;
      case 'table':
        out.push(tableBlock(node, ctx));
        out.push(new Paragraph({}));
        break;
      case 'pageBreak':
        out.push(new Paragraph({ children: [new PageBreak()] }));
        break;
      case 'tableOfContents':
        out.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun('Table of Contents')] }));
        for (const h of ctx.headings) {
          out.push(new Paragraph({ indent: { left: 360 * (h.level - 1) }, spacing: { after: 60 }, children: [new TextRun(h.text)] }));
        }
        break;
      default:
        if (node.content) out.push(...blocks(node.content, ctx));
    }
  }
  return out;
}

function collectHeadingText(doc: JSONContent) {
  const out: Array<{ level: number; text: string }> = [];
  const walk = (n: JSONContent) => {
    if (n.type === 'heading') {
      const text = (n.content ?? []).map((c) => c.text ?? '').join('').trim();
      if (text) out.push({ level: Number(n.attrs?.level) || 1, text });
      return;
    }
    n.content?.forEach(walk);
  };
  walk(doc);
  return out;
}

const listLevels = (ordered: boolean) =>
  Array.from({ length: 9 }, (_, level) => ({
    level,
    format: ordered ? [LevelFormat.DECIMAL, LevelFormat.LOWER_LETTER, LevelFormat.LOWER_ROMAN][level % 3] : LevelFormat.BULLET,
    text: ordered ? `%${level + 1}.` : ['•', '◦', '▪'][level % 3],
    alignment: AlignmentType.LEFT,
    style: { paragraph: { indent: { left: 720 * (level + 1), hanging: 360 } } },
  }));

export function buildDocx(content: DocumentContent, title = 'Document'): Document {
  const page = content.page;
  const paper = paperSize(page);
  const contentWidthMm = paper.width - page.margins.left - page.margins.right;
  const ctx: Ctx = { contentWidthPx: Math.round((contentWidthMm / 25.4) * 96), listInstance: 0, headings: collectHeadingText(content.doc) };

  const footerChildren: ParagraphChild[] = [];
  if (page.footer) footerChildren.push(new TextRun(page.footer));
  if (page.footer && page.pageNumbers) footerChildren.push(new TextRun('    '));
  if (page.pageNumbers) footerChildren.push(new TextRun({ children: ['Page ', PageNumber.CURRENT, ' of ', PageNumber.TOTAL_PAGES] }));

  return new Document({
    title,
    creator: 'Digital Classroom OS',
    styles: {
      default: {
        document: { run: { font: 'Calibri', size: 24 }, paragraph: { spacing: { after: 160, line: 324 } } },
      },
    },
    numbering: {
      config: [
        { reference: 'dcos-bullet', levels: listLevels(false) },
        { reference: 'dcos-ordered', levels: listLevels(true) },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            // Word expects portrait dimensions plus an orientation flag; it swaps them itself.
            size: {
              width: twip(Math.min(paper.width, paper.height)),
              height: twip(Math.max(paper.width, paper.height)),
              orientation: page.orientation === 'landscape' ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT,
            },
            margin: { top: twip(page.margins.top), right: twip(page.margins.right), bottom: twip(page.margins.bottom), left: twip(page.margins.left) },
          },
        },
        headers: page.header
          ? { default: new Header({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: page.header, color: '666666', size: 18 })] })] }) }
          : undefined,
        footers: footerChildren.length
          ? { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: footerChildren })] }) }
          : undefined,
        children: blocks(content.doc.content ?? [], ctx),
      },
    ],
  });
}

export async function exportDocx(content: DocumentContent, title: string): Promise<Blob> {
  return Packer.toBlob(buildDocx(content, title));
}
