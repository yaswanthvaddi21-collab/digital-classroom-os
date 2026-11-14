import type { JSONContent } from '@tiptap/core';
import { imageAlign, imageCaption } from '../../extensions/figureImage';
import { isRemoteImageSrc } from '../../extensions/remoteImages';
import { imageSize } from '../../import/imageSize';
import { diagramPicture, noteDiagram } from '../diagramAssets';
import { NOTES } from '../report';
import type { OdtCtx } from './context';
import { ODT_NOTES } from './notes';
import { ODT_PARAGRAPH_STYLES } from './styles';
import { el, esc, odfText, pxToCm } from './xml';

/** Picture formats an OpenDocument text file can hold, by data-URL type, with the file extension used. */
const FORMATS: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/gif': 'gif', 'image/bmp': 'bmp', 'image/svg+xml': 'svg', 'image/webp': 'webp' };

export function dataUrlBytes(src: string): { data: Uint8Array; mime: string } | null {
  const m = /^data:([a-z0-9.+/-]+)(;[^,]*)?,(.*)$/is.exec(src);
  if (!m) return null;
  const mime = m[1].toLowerCase();
  if (!FORMATS[mime]) return null;
  const base64 = /;base64/i.test(m[2] ?? '');
  try {
    if (base64) {
      const bin = atob(m[3]);
      const data = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) data[i] = bin.charCodeAt(i);
      return { data, mime: mime === 'image/jpg' ? 'image/jpeg' : mime };
    }
    return { data: new TextEncoder().encode(decodeURIComponent(m[3])), mime };
  } catch {
    return null;
  }
}

const placeholder = (ctx: OdtCtx, text: string) => el('text:p', { 'text:style-name': ctx.styles.paragraph(ctx.paragraphStyle, {}, { 'fo:font-style': 'italic', 'fo:color': '#888888' }) }, esc(text));

/**
 * Stores the picture in the package and returns a paragraph holding it, aligned as in the editor (centred unless the
 * picture says otherwise). `alt` is the text alternative (svg:title, as word processors read it); `desc` a longer
 * description (svg:desc).
 */
function framed(ctx: OdtCtx, data: Uint8Array, mime: string, widthPx: number, heightPx: number, name: string, alt: string, desc: string, align = 'center'): string {
  return framedImages(ctx, [{ data, mime }], widthPx, heightPx, name, alt, desc, align);
}

/**
 * The same with several images of one picture in one frame, best first: an application shows the first it can
 * (LibreOffice writes an SVG followed by its PNG fallback this way). Bytes stored before (a copy of the same diagram)
 * are not stored again: the frames share one Pictures/ entry.
 */
function framedImages(ctx: OdtCtx, images: Array<{ data: Uint8Array; mime: string }>, widthPx: number, heightPx: number, name: string, alt: string, desc: string, align = 'center'): string {
  const stored = (ctx.storedPictures ??= new WeakMap());
  const paths = images.map(({ data, mime }) => {
    const known = stored.get(data);
    if (known) return { path: known, mime };
    const path = `Pictures/${String(++ctx.ids.picture).padStart(4, '0')}.${FORMATS[mime]}`;
    ctx.pictures.set(path, { data, mime });
    stored.set(data, path);
    return { path, mime };
  });
  let w = widthPx;
  let h = heightPx;
  if (w > ctx.contentWidthPx) {
    h = (h * ctx.contentWidthPx) / w;
    w = ctx.contentWidthPx;
  }
  const frameStyle = ctx.styles.get('graphic', 'fr', el('style:graphic-properties', { 'style:vertical-pos': 'top', 'style:vertical-rel': 'baseline', 'fo:border': 'none' }), {
    'style:parent-style-name': 'Graphics',
  });
  const frame = el(
    'draw:frame',
    { 'draw:style-name': frameStyle, 'draw:name': `${name} ${++ctx.ids.frame}`, 'text:anchor-type': 'as-char', 'svg:width': pxToCm(w), 'svg:height': pxToCm(h), 'draw:z-index': 0 },
    paths.map(({ path, mime }) => el('draw:image', { 'xlink:href': path, 'xlink:type': 'simple', 'xlink:show': 'embed', 'xlink:actuate': 'onLoad', 'draw:mime-type': mime })).join('') +
      (alt ? el('svg:title', {}, esc(alt)) : '') +
      (desc ? el('svg:desc', {}, esc(desc)) : ''),
  );
  return el('text:p', { 'text:style-name': ctx.styles.paragraph(ctx.paragraphStyle, { 'fo:text-align': align }) }, frame);
}

/** A picture's caption (G-INSERT) as a paragraph in the Caption style under it, aligned with the picture. */
function caption(node: JSONContent, ctx: OdtCtx, align: string): string {
  const text = imageCaption(node.attrs);
  if (!text) return '';
  return el('text:p', { 'text:style-name': ctx.styles.paragraph(ODT_PARAGRAPH_STYLES.caption, { 'fo:text-align': align }) }, odfText(text, { atStart: true }));
}

export function imageBlock(node: JSONContent, ctx: OdtCtx): string {
  const src = String(node.attrs?.src ?? '');
  const alt = String(node.attrs?.alt ?? '').trim();
  const picture = dataUrlBytes(src);
  if (!picture) {
    if (isRemoteImageSrc(src)) {
      NOTES.remoteImage(ctx.report);
      return placeholder(ctx, `[Image not saved for offline use${alt ? `: ${alt}` : ''} — ${src.length > 120 ? `${src.slice(0, 117)}…` : src}]`) + caption(node, ctx, imageAlign(node.attrs));
    }
    ODT_NOTES.unsupportedImage(ctx.report);
    return placeholder(ctx, `[Image${alt ? `: ${alt}` : ''} — format not supported in ODT files]`) + caption(node, ctx, imageAlign(node.attrs));
  }
  const natural = imageSize(picture.data);
  const width = Number(node.attrs?.width) || natural?.width || 480;
  const height = Number(node.attrs?.height) || (natural ? Math.round((width * natural.height) / natural.width) : Math.round(width * 0.66));
  const align = imageAlign(node.attrs);
  return framed(ctx, picture.data, picture.mime, width, height, 'Image', alt, String(node.attrs?.title ?? ''), align) + caption(node, ctx, align);
}

/**
 * An embedded diagram: its picture at the size shown in the document, aligned like a picture and followed by its
 * caption. Phase 6 (ADR 0013): the vector drawing (SVG) first and the PNG as the fallback in one frame, the PNG carrying
 * the diagram's editable data, a missing preview redrawn from the data (diagramAssets.ts). The title is the frame's
 * svg:title (as before); alt text, when set, its svg:desc.
 */
export function diagramBlock(node: JSONContent, ctx: OdtCtx): string {
  const a = node.attrs ?? {};
  const title = String(a.title || 'Diagram');
  const align = imageAlign(a);
  const picture = diagramPicture(a, ctx.assets, ctx.diagramRenders, (ctx.diagramPictures ??= new Map()));
  noteDiagram(ctx.report, picture);
  if (!picture) return placeholder(ctx, `[Diagram: ${title} — preview not available]`) + caption(node, ctx, align);
  const naturalW = Number(a.naturalWidth) || 400;
  const naturalH = Number(a.naturalHeight) || 300;
  const width = Math.min(Number(a.width) || naturalW, ctx.contentWidthPx);
  const images = [...(picture.svg ? [{ data: picture.svg, mime: 'image/svg+xml' }] : []), { data: picture.png, mime: 'image/png' }];
  const desc = typeof a.alt === 'string' ? a.alt.trim() : '';
  return framedImages(ctx, images, width, Math.round((width * naturalH) / naturalW), 'Diagram', title, desc, align) + caption(node, ctx, align);
}
