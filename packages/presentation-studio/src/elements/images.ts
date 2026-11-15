/**
 * Pictures from files (the Insert tab, Replace, paste and drop), stored through the app's image host as attachments.
 * The picture keeps only its attachment id (ADR 0014). Very large photos are made smaller first, and formats other
 * than PNG, JPEG and GIF (WebP, BMP, SVG…) are stored as PNG, so PowerPoint and Keynote can show every picture.
 */
import type { PresentationImageHost } from '../hosts';

export const MAX_PICTURE_BYTES = 15 * 1024 * 1024;
/** Longest side a stored picture keeps (enough for a full-screen slide at 2× density). */
export const MAX_PICTURE_SIDE = 2400;
const KEPT_TYPES = /^image\/(png|jpeg|gif)$/;

export interface DecodedPicture {
  width: number;
  height: number;
  /** Re-encodes the picture at a size, as PNG or JPEG. */
  encode(width: number, height: number, type: 'image/png' | 'image/jpeg'): Promise<Blob>;
  close(): void;
}

/** Decodes a picture in the browser (an <img> from an object URL, drawn to a canvas only when it must be re-encoded). */
export async function browserDecode(file: Blob): Promise<DecodedPicture> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('This file is not a picture this browser can read.'));
      el.src = url;
    });
    // SVG files without a size report 0: give them a usable one.
    const width = img.naturalWidth || 800;
    const height = img.naturalHeight || 600;
    return {
      width,
      height,
      encode: (w, h, type) =>
        new Promise<Blob>((resolve, reject) => {
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(w));
          canvas.height = Math.max(1, Math.round(h));
          const ctx = canvas.getContext('2d');
          if (!ctx) return reject(new Error('The picture could not be converted.'));
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('The picture could not be converted.'))), type, type === 'image/jpeg' ? 0.88 : undefined);
        }),
      close: () => URL.revokeObjectURL(url),
    };
  } catch (err) {
    URL.revokeObjectURL(url);
    throw err;
  }
}

/** The decoder pictures go through (tests put a fake one here: jsdom cannot decode pictures). */
export const pictureDecoder: { decode: (b: Blob) => Promise<DecodedPicture> } = { decode: browserDecode };

export interface PreparedPicture {
  blob: Blob;
  mimeType: string;
  width: number;
  height: number;
}

/**
 * A picture file made ready to store: refused when it is not a picture or larger than 15 MB; made smaller when its
 * longest side is over MAX_PICTURE_SIDE; converted to PNG when it is not PNG, JPEG or GIF.
 */
export async function preparePicture(file: Blob, decode: (b: Blob) => Promise<DecodedPicture> = pictureDecoder.decode): Promise<PreparedPicture> {
  if (!file.type.startsWith('image/')) throw new Error('Choose a picture file (PNG, JPEG, GIF, WebP, SVG…).');
  if (file.size > MAX_PICTURE_BYTES) throw new Error('This picture is larger than 15 MB.');
  const pic = await decode(file);
  try {
    const scale = Math.min(1, MAX_PICTURE_SIDE / Math.max(pic.width, pic.height));
    const width = Math.max(1, Math.round(pic.width * scale));
    const height = Math.max(1, Math.round(pic.height * scale));
    if (scale >= 1 && KEPT_TYPES.test(file.type)) return { blob: file, mimeType: file.type, width, height };
    const type = file.type === 'image/jpeg' ? 'image/jpeg' : 'image/png';
    return { blob: await pic.encode(width, height, type), mimeType: type, width, height };
  } finally {
    pic.close();
  }
}

/** Prepares and stores a picture; resolves with what an image element needs. */
export async function storePicture(host: PresentationImageHost, file: Blob, decode?: (b: Blob) => Promise<DecodedPicture>) {
  const p = await preparePicture(file, decode);
  const stored = await host.putAttachment(p.blob, p.mimeType);
  return { attachmentId: stored.id, mimeType: stored.mimeType || p.mimeType, width: p.width, height: p.height };
}

/** The picture files in a clipboard or drag-and-drop transfer. */
export function pictureFiles(data: DataTransfer | null | undefined): File[] {
  if (!data) return [];
  const files = Array.from(data.files ?? []);
  if (!files.length && data.items) for (const item of Array.from(data.items)) if (item.kind === 'file') {
    const f = item.getAsFile();
    if (f) files.push(f);
  }
  return files.filter((f) => f.type.startsWith('image/'));
}

/** Opens the system file picker for pictures (must run inside a click). Resolves with the chosen file, or null. */
export function choosePictureFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.addEventListener('cancel', () => resolve(null));
    input.click();
  });
}

/** A file name without its extension, as a starting point for alt text ("" for generic camera or clipboard names). */
export function altFromFileName(name: string | undefined): string {
  const base = (name ?? '').replace(/\.[a-z0-9]+$/i, '').replace(/[_-]+/g, ' ').trim();
  if (!base || /^(image|img|dsc|pxl|screenshot|screen shot|photo|pasted|clipboard)(\b|\d)/i.test(base) || /^[\d\s.]+$/.test(base)) return '';
  return base;
}
