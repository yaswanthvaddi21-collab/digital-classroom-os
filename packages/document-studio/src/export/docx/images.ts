import type { JSONContent } from '@tiptap/core';
import { ImageRun, Paragraph, TextRun } from 'docx';
import { isRemoteImageSrc } from '../../extensions/remoteImages';
import { diagramAltText, diagramPicture, noteDiagram } from '../diagramAssets';
import { NOTES } from '../report';
import type { Ctx } from './context';
import { pictureLook } from './insert'; // G-INSERT

function dataUrlToBytes(src: string): { data: Uint8Array; type: 'png' | 'jpg' | 'gif' | 'bmp' } | null {
  const m = /^data:image\/(png|jpe?g|gif|bmp);base64,(.+)$/i.exec(src);
  if (!m) return null;
  const bin = atob(m[2]);
  const data = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) data[i] = bin.charCodeAt(i);
  const t = m[1].toLowerCase();
  return { data, type: t === 'jpeg' ? 'jpg' : (t as 'png' | 'jpg' | 'gif' | 'bmp') };
}

const placeholder = (text: string) => new Paragraph({ children: [new TextRun({ text, italics: true, color: '888888' })] });

export function imageParagraph(node: JSONContent, ctx: Ctx): Paragraph {
  const src = String(node.attrs?.src ?? '');
  const img = dataUrlToBytes(src);
  if (!img) {
    const alt = String(node.attrs?.alt ?? '').trim();
    // A picture on another website (pasted from the web, not stored in the document): say so, with its address.
    if (isRemoteImageSrc(src)) {
      NOTES.remoteImage(ctx.report);
      return placeholder(`[Image not saved for offline use${alt ? `: ${alt}` : ''} — ${src.length > 120 ? `${src.slice(0, 117)}…` : src}]`);
    }
    NOTES.unsupportedImage(ctx.report);
    return placeholder(`[Image${alt ? `: ${alt}` : ''} — format not supported in Word documents]`);
  }
  let width = Number(node.attrs?.width) || 480;
  let height = Number(node.attrs?.height) || Math.round(width * 0.66);
  if (width > ctx.contentWidthPx) {
    height = Math.round((height * ctx.contentWidthPx) / width);
    width = ctx.contentWidthPx;
  }
  return new Paragraph({
    ...pictureLook(node), // G-INSERT: the picture's alignment (centre by default), kept with its caption
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

/**
 * Embedded diagram: its picture at the size shown in the document (aspect ratio preserved), aligned like a picture
 * (its caption follows, see nodes.ts). Phase 6 (ADR 0013): the vector drawing (SVG) with the PNG as the fallback for
 * applications without SVG (asvg:svgBlip), the PNG carrying the diagram's editable data, a missing preview redrawn
 * from the data (diagramAssets.ts), the alt text as the description, and an honest note in the export report.
 */
export function diagramParagraph(node: JSONContent, ctx: Ctx): Paragraph {
  const a = node.attrs ?? {};
  const title = String(a.title || 'Diagram');
  const picture = diagramPicture(a, ctx.assets, ctx.diagramRenders, (ctx.diagramPictures ??= new Map()));
  noteDiagram(ctx.report, picture);
  if (!picture) return new Paragraph({ ...pictureLook(node), children: [new TextRun({ text: `[Diagram: ${title} — preview not available]`, italics: true, color: '888888' })] });
  const naturalW = Number(a.naturalWidth) || 400;
  const naturalH = Number(a.naturalHeight) || 300;
  const width = Math.min(Number(a.width) || naturalW, ctx.contentWidthPx);
  const height = Math.round((width * naturalH) / naturalW);
  const altText = { name: 'diagram', description: diagramAltText(a), title };
  const transformation = { width, height };
  const run = picture.svg
    ? new ImageRun({ type: 'svg', data: picture.svg, fallback: { type: 'png', data: picture.png }, transformation, altText })
    : new ImageRun({ type: 'png', data: picture.png, transformation, altText });
  return new Paragraph({ ...pictureLook(node), children: [run] });
}

/** Collects the attachment ids of all embedded diagram previews in a document. */
export function diagramPreviewIds(doc: JSONContent): string[] {
  const ids = new Set<string>();
  const walk = (n: JSONContent) => {
    if (n.type === 'diagram' && n.attrs?.previewId) ids.add(String(n.attrs.previewId));
    n.content?.forEach(walk);
  };
  walk(doc);
  return [...ids];
}
