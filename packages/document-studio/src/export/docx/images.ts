import type { JSONContent } from '@tiptap/core';
import { AlignmentType, ImageRun, Paragraph, TextRun } from 'docx';
import { isRemoteImageSrc } from '../../extensions/remoteImages';
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

/** Embedded diagram: its rendered preview, at the size shown in the document (aspect ratio preserved). */
export function diagramParagraph(node: JSONContent, ctx: Ctx): Paragraph {
  const a = node.attrs ?? {};
  const title = String(a.title || 'Diagram');
  const bytes = a.previewId ? ctx.assets.get(String(a.previewId)) : undefined;
  if (!bytes) {
    NOTES.missingDiagramPreview(ctx.report);
    return placeholder(`[Diagram: ${title} — preview not available]`);
  }
  const naturalW = Number(a.naturalWidth) || 400;
  const naturalH = Number(a.naturalHeight) || 300;
  const width = Math.min(Number(a.width) || naturalW, ctx.contentWidthPx);
  const height = Math.round((width * naturalH) / naturalW);
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new ImageRun({ type: 'png', data: bytes, transformation: { width, height }, altText: { name: 'diagram', description: title, title } })],
  });
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
