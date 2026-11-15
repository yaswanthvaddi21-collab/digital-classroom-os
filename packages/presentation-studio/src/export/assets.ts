/**
 * Pictures for the exports: attachments loaded through the app's image host, checked by their bytes (never by a
 * stored MIME type alone), and turned into PNG where a format needs it. Pictures are always handed to PptxGenJS and
 * svg2pdf as data, never as URLs, so nothing is fetched (the desktop build's CSP blocks fetching data:/blob: URLs).
 */
import type { PresentationDiagramHost, PresentationImageHost } from '../hosts';
import type { DiagramElement as DiagramEl } from '../types';
import { embedDiagramInPng, isPng, pngSize } from './diagramPng';

/** Draws picture bytes (any format the browser shows, SVG included) as a PNG of at most `maxSide` px, or null. */
export type Rasterize = (bytes: Uint8Array, mimeType: string, maxSide: number) => Promise<Uint8Array | null>;

/** What an export needs from the app. Everything is optional: missing pictures are reported, never invented. */
export interface ExportHosts {
  imageHost?: PresentationImageHost;
  /** Draws a diagram whose stored preview is missing (the app's useDiagramHost().renderPreview). */
  diagramHost?: Pick<PresentationDiagramHost, 'renderPreview'>;
  /** Defaults to the browser canvas (browserRasterize). */
  rasterize?: Rasterize;
}

export type PictureType = 'png' | 'jpeg' | 'gif' | 'svg' | 'other';

/** The picture format from the bytes. */
export function sniff(bytes: Uint8Array): PictureType {
  if (isPng(bytes)) return 'png';
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpeg';
  if (bytes.length > 5 && String.fromCharCode(...bytes.subarray(0, 4)) === 'GIF8') return 'gif';
  const head = new TextDecoder().decode(bytes.subarray(0, Math.min(bytes.length, 1024)));
  if (/<svg[\s>]/i.test(head)) return 'svg';
  return 'other';
}

export const MIME: Record<'png' | 'jpeg' | 'gif', string> = { png: 'image/png', jpeg: 'image/jpeg', gif: 'image/gif' };

/** A loaded picture ready for a format. */
/** A JPEG's pixel size from its frame header (SOFn), or null. */
export function jpegSize(b: Uint8Array): { width: number; height: number } | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null;
  let i = 2;
  while (i + 3 < b.length) {
    if (b[i] !== 0xff) return null;
    const marker = b[i + 1];
    if (marker === 0xff) {
      i += 1; // fill byte
      continue;
    }
    // Markers without a length.
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2;
      continue;
    }
    if (marker === 0xd9 || marker === 0xda) return null; // end of image, or the scan before any frame header
    const len = (b[i + 2] << 8) | b[i + 3];
    // SOF0–SOF15, except DHT (C4), JPG (C8) and DAC (CC).
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      if (i + 8 >= b.length) return null;
      const height = (b[i + 5] << 8) | b[i + 6];
      const width = (b[i + 7] << 8) | b[i + 8];
      return width > 0 && height > 0 ? { width, height } : null;
    }
    if (len < 2) return null;
    i += 2 + len;
  }
  return null;
}

/** A GIF's logical screen size, or null. */
export function gifSize(b: Uint8Array): { width: number; height: number } | null {
  if (b.length < 10) return null;
  const width = b[6] | (b[7] << 8);
  const height = b[8] | (b[9] << 8);
  return width > 0 && height > 0 ? { width, height } : null;
}

export interface Picture {
  bytes: Uint8Array;
  type: 'png' | 'jpeg' | 'gif';
  /** Pixel size, when known. */
  width?: number;
  height?: number;
  /** Converted to PNG from a format the target cannot hold (SVG, WebP…). */
  converted: boolean;
}

/** The browser's canvas rasterizer (null when there is no DOM or the picture cannot be drawn). */
export const browserRasterize: Rasterize = async (bytes, mimeType, maxSide) => {
  if (typeof document === 'undefined' || typeof Image === 'undefined' || typeof URL.createObjectURL !== 'function') return null;
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: mimeType || 'application/octet-stream' }));
  try {
    const img = new Image();
    img.decoding = 'async';
    const loaded = new Promise<boolean>((resolve) => {
      img.onload = () => resolve(true);
      img.onerror = () => resolve(false);
    });
    img.src = url;
    if (!(await loaded)) return null;
    const w0 = img.naturalWidth || 0;
    const h0 = img.naturalHeight || 0;
    if (!(w0 > 0 && h0 > 0)) return null;
    const k = Math.min(1, maxSide / Math.max(w0, h0));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(w0 * k));
    canvas.height = Math.max(1, Math.round(h0 * k));
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    return blob ? new Uint8Array(await blob.arrayBuffer()) : null;
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
};

/** Loads attachments once per export. */
export class AssetLoader {
  private bytes = new Map<string, Promise<Uint8Array | null>>();
  private pictures = new Map<string, Promise<Picture | null>>();
  constructor(private hosts: ExportHosts) {}

  /** The attachment's bytes, or null when there is no host or it is not on this device. */
  load(id: string | undefined | null): Promise<Uint8Array | null> {
    if (!id || !this.hosts.imageHost) return Promise.resolve(null);
    let p = this.bytes.get(id);
    if (!p) {
      const host = this.hosts.imageHost;
      p = host.loadAttachment(id).then(
        async (blob) => (blob ? new Uint8Array(await blob.arrayBuffer()) : null),
        () => null,
      );
      this.bytes.set(id, p);
    }
    return p;
  }

  /**
   * A picture in a format both PPTX and the PDF can hold (PNG or JPEG; GIF when `gif` is allowed). Anything else is
   * drawn as PNG (`converted`), or null when it cannot be.
   */
  picture(id: string | undefined | null, opts: { gif: boolean }): Promise<Picture | null> {
    const key = `${id}|${opts.gif}`;
    let p = this.pictures.get(key);
    if (!p) {
      p = this.load(id).then(async (bytes) => {
        if (!bytes) return null;
        const type = sniff(bytes);
        if (type === 'png') return { bytes, type, ...(pngSize(bytes) ?? {}), converted: false };
        // The size is read for every format: a picture background is fitted (cover or contain) from it (Round 3: JPEG
        // backgrounds came out stretched in the PDF without it).
        if (type === 'jpeg') return { bytes, type, ...(jpegSize(bytes) ?? {}), converted: false };
        if (type === 'gif' && opts.gif) return { bytes, type, ...(gifSize(bytes) ?? {}), converted: false };
        const rasterize = this.hosts.rasterize ?? browserRasterize;
        const png = await rasterize(bytes, type === 'svg' ? 'image/svg+xml' : type === 'gif' ? 'image/gif' : '', 4096).catch(() => null);
        return png && isPng(png) ? { bytes: png, type: 'png' as const, ...(pngSize(png) ?? {}), converted: true } : null;
      });
      this.pictures.set(key, p);
    }
    return p;
  }

  /**
   * A diagram's picture: its stored PNG preview, else one drawn by the diagram host. With `embed`, the diagram's own
   * data goes inside the PNG (editable when imported back into Classroom OS, as in DOCX/ODT).
   */
  async diagram(el: DiagramEl, embed: boolean): Promise<{ png: Uint8Array; editable: boolean; redrawn: boolean } | null> {
    let base = await this.load(el.previewId || null);
    let redrawn = false;
    if (!base || !isPng(base)) {
      base = null;
      const render = this.hosts.diagramHost?.renderPreview;
      if (render) {
        try {
          const drawn = await render(el.source, el.title || undefined);
          const bytes = drawn ? new Uint8Array(await drawn.png.arrayBuffer()) : null;
          if (bytes && isPng(bytes)) {
            base = bytes;
            redrawn = true;
          }
        } catch {
          base = null;
        }
      }
    }
    if (!base) return null;
    if (!embed) return { png: base, editable: false, redrawn };
    const size = pngSize(base);
    const ratio = size && el.naturalWidth > 0 ? size.width / el.naturalWidth : 2;
    try {
      return { png: embedDiagramInPng(base, el.source, el.title ?? '', ratio), editable: true, redrawn };
    } catch {
      return { png: base, editable: false, redrawn };
    }
  }
}
