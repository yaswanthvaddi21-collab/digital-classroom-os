/**
 * Schema-3 shape data fields that came with diagrams.net import and export (Phase 5, G-DRAWIO): opacity, font family,
 * text alignment and the picture of an `image` shape. Like every schema-3 field they are optional and absent by
 * default, and a value that is not valid is ignored (left out on load), never a crash. Readers are registered in
 * SHAPE_DATA_READERS (model.ts); drawing is in shapePresentation.tsx; the diagrams.net mapping in drawioFeatures.ts.
 */

/** Text alignment across the shape. Centre is the default and is not stored. */
export type TextAlign = 'left' | 'right';
/** Text alignment down the shape. Middle is the default and is not stored. */
export type VerticalAlign = 'top' | 'bottom';

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Opacity of a shape's fill and outline in percent, as diagrams.net stores it. 100 (opaque) is the default. */
export function readOpacity(v: unknown): number | undefined {
  if (!finite(v) || v < 0) return undefined;
  const r = Math.round(v * 10) / 10;
  return r >= 100 ? undefined : r;
}

/** Longest font family name kept. */
export const MAX_FONT_FAMILY = 120;

/**
 * A font family as a CSS value: names, spaces, commas, hyphens, dots and quotes only (so it can never close the
 * style it is written into, here or in a diagrams.net style string).
 */
export function readFontFamily(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const s = v.trim();
  return s && s.length <= MAX_FONT_FAMILY && /^[\p{L}\p{N} ,.'"_-]+$/u.test(s) ? s : undefined;
}

export function readTextAlign(v: unknown): TextAlign | undefined {
  return v === 'left' || v === 'right' ? v : undefined;
}

export function readVerticalAlign(v: unknown): VerticalAlign | undefined {
  return v === 'top' || v === 'bottom' ? v : undefined;
}

/** Largest picture kept, in characters of its data: URL (about 6 MB of image data). */
export const MAX_IMAGE_CHARS = 8_000_000;

const IMAGE_URL = /^data:image\/(png|jpeg|jpg|gif|webp|bmp|svg\+xml)(;base64)?,/i;

/**
 * The picture of an image shape: a data: URL of a raster image or SVG. Pictures are embedded, never fetched (the app
 * works offline), so web addresses are not kept. An SVG picture is drawn through an <image> element, where browsers
 * run no scripts and load nothing.
 */
export function readImage(v: unknown): string | undefined {
  if (typeof v !== 'string' || v.length > MAX_IMAGE_CHARS) return undefined;
  const m = IMAGE_URL.exec(v);
  if (!m) return undefined;
  const payload = v.slice(m[0].length);
  if (!payload) return undefined;
  if (m[2] && !/^[A-Za-z0-9+/]+=*$/.test(payload)) return undefined;
  return v;
}
