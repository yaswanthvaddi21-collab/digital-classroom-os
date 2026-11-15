/**
 * Pure geometry for slides: boxes, rotation, fitting a slide into a frame, and unit conversions for exports.
 * All values are CSS pixels unless a name says otherwise.
 */

export interface Point {
  x: number;
  y: number;
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** PPTX length units (English Metric Units). */
export const EMU_PER_INCH = 914400;
export const PX_PER_INCH = 96;
export const EMU_PER_PX = EMU_PER_INCH / PX_PER_INCH; // 9525
export const PT_PER_INCH = 72;

export const pxToEmu = (px: number) => Math.round(px * EMU_PER_PX);
export const emuToPx = (emu: number) => emu / EMU_PER_PX;
export const pxToInches = (px: number) => px / PX_PER_INCH;
export const pxToPt = (px: number) => (px * PT_PER_INCH) / PX_PER_INCH;
export const ptToPx = (pt: number) => (pt * PX_PER_INCH) / PT_PER_INCH;

export const boxCenter = (b: Box): Point => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });
export const boxRight = (b: Box) => b.x + b.w;
export const boxBottom = (b: Box) => b.y + b.h;

/** Degrees to 0–359 (whole and fractional degrees kept). */
export function normalizeRotation(deg: number): number {
  if (!Number.isFinite(deg)) return 0;
  const r = deg % 360;
  return r < 0 ? r + 360 : r;
}

/** Rotates `p` around `c` by `deg` degrees clockwise (screen coordinates, y down). */
export function rotatePoint(p: Point, c: Point, deg: number): Point {
  const a = (deg * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const dx = p.x - c.x;
  const dy = p.y - c.y;
  return { x: c.x + dx * cos - dy * sin, y: c.y + dx * sin + dy * cos };
}

/** The four corners of a box rotated by `deg` around its centre: top-left, top-right, bottom-right, bottom-left. */
export function rotatedCorners(b: Box, deg: number): Point[] {
  const c = boxCenter(b);
  return [
    { x: b.x, y: b.y },
    { x: b.x + b.w, y: b.y },
    { x: b.x + b.w, y: b.y + b.h },
    { x: b.x, y: b.y + b.h },
  ].map((p) => (deg ? rotatePoint(p, c, deg) : p));
}

/** The axis-aligned box around a box rotated by `deg` around its centre. */
export function rotatedBounds(b: Box, deg: number): Box {
  if (!normalizeRotation(deg)) return { ...b };
  return boundsOfPoints(rotatedCorners(b, deg));
}

export function boundsOfPoints(points: Point[]): Box {
  if (!points.length) return { x: 0, y: 0, w: 0, h: 0 };
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

/** The smallest box around all of `boxes` (an empty box at 0,0 for none). */
export function unionBounds(boxes: Box[]): Box {
  if (!boxes.length) return { x: 0, y: 0, w: 0, h: 0 };
  let x1 = Infinity;
  let y1 = Infinity;
  let x2 = -Infinity;
  let y2 = -Infinity;
  for (const b of boxes) {
    x1 = Math.min(x1, b.x);
    y1 = Math.min(y1, b.y);
    x2 = Math.max(x2, b.x + b.w);
    y2 = Math.max(y2, b.y + b.h);
  }
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

/** Whether two boxes overlap (touching edges do not count). */
export const intersects = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
/** Whether `inner` lies wholly inside `outer`. */
export const containsBox = (outer: Box, inner: Box) => inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.w <= outer.x + outer.w && inner.y + inner.h <= outer.y + outer.h;
export const containsPoint = (b: Box, p: Point) => p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;

/** The box between two corner points, whichever way they were dragged (marquee selection). */
export function boxFromPoints(a: Point, b: Point): Box {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) };
}

/**
 * The scale and offset that fit a slide of `slide` size wholly inside `frame`, centred (letterboxed). Never larger
 * than `maxScale`; never negative.
 */
export function fitScale(slide: { width: number; height: number }, frame: { width: number; height: number }, maxScale = Infinity) {
  const scale = Math.max(0, Math.min(frame.width / slide.width, frame.height / slide.height, maxScale));
  return { scale, offsetX: (frame.width - slide.width * scale) / 2, offsetY: (frame.height - slide.height * scale) / 2 };
}

/** The size of a picture fitted into a box: 'contain' fits inside, 'cover' fills (cropping), 'stretch' fills exactly. */
export function fitPicture(natural: { width: number; height: number }, box: { w: number; h: number }, fit: 'contain' | 'cover' | 'stretch'): Box {
  if (fit === 'stretch' || natural.width <= 0 || natural.height <= 0) return { x: 0, y: 0, w: box.w, h: box.h };
  const s = fit === 'contain' ? Math.min(box.w / natural.width, box.h / natural.height) : Math.max(box.w / natural.width, box.h / natural.height);
  const w = natural.width * s;
  const h = natural.height * s;
  return { x: (box.w - w) / 2, y: (box.h - h) / 2, w, h };
}

/** Moves a box so it stays inside `area` as far as it fits (a box larger than the area keeps its top-left inside). */
export function clampBox(b: Box, area: Box): Box {
  const x = Math.min(Math.max(b.x, area.x), Math.max(area.x, area.x + area.w - b.w));
  const y = Math.min(Math.max(b.y, area.y), Math.max(area.y, area.y + area.h - b.h));
  return { ...b, x, y };
}

/** A box resized to `w` × `h` around the same centre. */
export function resizeAroundCenter(b: Box, w: number, h: number): Box {
  const c = boxCenter(b);
  return { x: c.x - w / 2, y: c.y - h / 2, w, h };
}

/** Rounds a box to whole pixels (stored positions are whole numbers). */
export const roundBox = (b: Box): Box => ({ x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.w), h: Math.round(b.h) });
