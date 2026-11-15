/**
 * Editable diagram data inside a diagram's PNG picture, as Document Studio writes it into DOCX and ODT (Phase 6,
 * ADR 0013): the diagram's own file (the `.dcosdiagram` envelope `{ format: 'dcos-diagram', version, title, diagram }`)
 * in a compressed iTXt chunk with the keyword `dcos-diagram`, right after IHDR, plus a pHYs chunk so other apps show
 * the 2× preview at its real size. Other apps ignore the chunk and show the picture.
 *
 * The package boundary keeps presentation-studio from importing document-studio, so this is the writing half of
 * document-studio/src/export/diagramPng.ts, kept byte-compatible: tests/integration/presentation-export.test.ts reads
 * what this writes with document-studio's readDiagramFromPng and diagram-studio's parseNativeFile.
 */
import { zlibSync } from 'fflate';

/** document-studio DIAGRAM_PNG_KEYWORD = diagram-studio NATIVE_FORMAT. */
export const DIAGRAM_PNG_KEYWORD = 'dcos-diagram';
/** document-studio DIAGRAM_PNG_VERSION = diagram-studio NATIVE_VERSION. */
export const DIAGRAM_PNG_VERSION = 1;
/** document-studio DIAGRAM_PNG_MAX_BYTES. */
export const DIAGRAM_PNG_MAX_BYTES = 64 * 1024 * 1024;

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const CSS_DPI = 96;

let crcTable: Uint32Array | null = null;
function crc32(parts: Uint8Array[]): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (const p of parts) for (let i = 0; i < p.length; i++) c = crcTable[(c ^ p[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const latin1 = (s: string) => Uint8Array.from(s, (ch) => ch.charCodeAt(0) & 0xff);

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

function chunkBytes(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  const t = latin1(type);
  view.setUint32(0, data.length);
  out.set(t, 4);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32([t, data]));
  return out;
}

/** Whether the bytes start with the PNG signature. */
export const isPng = (b: Uint8Array) => b.length >= 8 && SIGNATURE.every((v, i) => b[i] === v);

/** The chunks of a well-formed PNG (type and data), or null. */
function chunks(png: Uint8Array): Array<{ type: string; data: Uint8Array }> | null {
  if (!isPng(png)) return null;
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  const out: Array<{ type: string; data: Uint8Array }> = [];
  let at = 8;
  while (at + 12 <= png.length) {
    const length = view.getUint32(at);
    if (length > png.length - at - 12) return null;
    const type = String.fromCharCode(...png.subarray(at + 4, at + 8));
    out.push({ type, data: png.subarray(at + 8, at + 8 + length) });
    at += 12 + length;
    if (type === 'IEND') break;
  }
  return out[0]?.type === 'IHDR' && out[out.length - 1]?.type === 'IEND' ? out : null;
}

/** Pixel width and height from a PNG's IHDR, or null. */
export function pngSize(png: Uint8Array): { width: number; height: number } | null {
  const c = chunks(png)?.[0];
  if (!c || c.data.length < 8) return null;
  const v = new DataView(c.data.buffer, c.data.byteOffset, 8);
  return { width: v.getUint32(0), height: v.getUint32(4) };
}

const keywordOf = (data: Uint8Array) => {
  const end = data.indexOf(0);
  return end > 0 && end < 80 ? String.fromCharCode(...data.subarray(0, end)) : null;
};

/**
 * A copy of `png` carrying the diagram (its stored Diagram Studio content and title) and a pHYs chunk for
 * `pixelRatio`. Throws when `png` is not a PNG, the diagram is not an object, or the data is larger than 64 MB.
 */
export function embedDiagramInPng(png: Uint8Array, diagram: unknown, title: string, pixelRatio = 2): Uint8Array {
  const list = chunks(png);
  if (!list) throw new Error('The preview is not a valid PNG image.');
  if (!diagram || typeof diagram !== 'object' || Array.isArray(diagram)) throw new Error('The diagram data is not a Classroom OS diagram.');
  const text = JSON.stringify({ format: DIAGRAM_PNG_KEYWORD, version: DIAGRAM_PNG_VERSION, title, diagram });
  const utf8 = new TextEncoder().encode(text);
  if (utf8.length > DIAGRAM_PNG_MAX_BYTES) throw new RangeError('The diagram is too large to embed in its picture.');
  const ratio = Number.isFinite(pixelRatio) && pixelRatio > 0 ? pixelRatio : 2;
  const header = concat([latin1(DIAGRAM_PNG_KEYWORD), Uint8Array.of(0, 1, 0, 0, 0)]);
  const itxt = chunkBytes('iTXt', concat([header, zlibSync(utf8, { level: 9 })]));
  const perMetre = Math.round((ratio * CSS_DPI) / 0.0254);
  const phys = new Uint8Array(9);
  new DataView(phys.buffer).setUint32(0, perMetre);
  new DataView(phys.buffer).setUint32(4, perMetre);
  phys[8] = 1;
  const parts: Uint8Array[] = [Uint8Array.from(SIGNATURE)];
  for (const c of list) {
    if (c.type === 'pHYs') continue;
    if (c.type === 'iTXt' && keywordOf(c.data) === DIAGRAM_PNG_KEYWORD) continue;
    parts.push(chunkBytes(c.type, c.data));
    if (c.type === 'IHDR') parts.push(chunkBytes('pHYs', phys), itxt);
  }
  return concat(parts);
}
