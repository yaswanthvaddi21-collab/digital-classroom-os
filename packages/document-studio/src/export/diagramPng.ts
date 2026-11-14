/**
 * Editable diagram data inside a PNG preview (Phase 6, ADR 0013), the way diagrams.net makes "editable PNG" files.
 *
 * A diagram exported to Word or OpenDocument is written as its PNG preview. `embedDiagramInPng` adds the diagram's
 * own file (the `.dcosdiagram` envelope of diagram-studio native.ts: `{ format: 'dcos-diagram', version, app, title,
 * diagram }`) to that PNG as a compressed iTXt chunk with the keyword `dcos-diagram`, so importing the file back into
 * Classroom OS can restore an editable diagram. Other apps ignore the chunk and show the picture. It also writes a
 * pHYs chunk so other apps show a 2x preview at its real size (192 dpi).
 *
 * Pure functions on bytes. Reading never throws: a missing, damaged (bad CRC, bad compression, bad JSON) or
 * oversized chunk gives null, never an error or a partly read diagram.
 */
import { Unzlib, zlibSync } from 'fflate';

/** iTXt keyword, and the envelope's `format` (diagram-studio NATIVE_FORMAT; tests/integration checks they match). */
export const DIAGRAM_PNG_KEYWORD = 'dcos-diagram';
/** Newest envelope version written (diagram-studio NATIVE_VERSION). */
export const DIAGRAM_PNG_VERSION = 1;
/** Largest envelope written or read, compressed or not (diagram-studio NATIVE_MAX_BYTES). */
export const DIAGRAM_PNG_MAX_BYTES = 64 * 1024 * 1024;
/** CSS pixels per inch: a PNG with pixelRatio 2 is written at 192 dpi. */
const CSS_DPI = 96;

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** The diagram's own file, as diagram-studio's toNativeFile writes it. */
export interface DiagramPngEnvelope {
  format: typeof DIAGRAM_PNG_KEYWORD;
  version: number;
  app?: string;
  title?: string;
  diagram: Record<string, unknown>;
}

export interface DiagramPngPayload {
  /** The envelope's JSON text, exactly as stored (for diagram-studio parseNativeFile, which checks it strictly). */
  text: string;
  envelope: DiagramPngEnvelope;
}

export interface PngChunk {
  type: string;
  data: Uint8Array;
  /** Whether the stored CRC matches the chunk's type and data. */
  crcOk: boolean;
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

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
const typeName = (b: Uint8Array) => String.fromCharCode(...b);

/** Whether the bytes start with the PNG signature. */
export function isPng(bytes: Uint8Array): boolean {
  return bytes.length >= 8 && SIGNATURE.every((b, i) => bytes[i] === b);
}

/**
 * The chunks of a PNG, up to and including IEND, or null when the bytes are not a well-formed PNG (no signature,
 * a chunk running past the end, IHDR not first, or no IEND). Chunk data are views into `png`, not copies.
 */
export function pngChunks(png: Uint8Array): PngChunk[] | null {
  if (!isPng(png)) return null;
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  const chunks: PngChunk[] = [];
  let at = 8;
  while (at + 12 <= png.length) {
    const length = view.getUint32(at);
    if (length > png.length - at - 12) return null;
    const type = png.subarray(at + 4, at + 8);
    const data = png.subarray(at + 8, at + 8 + length);
    const crc = view.getUint32(at + 8 + length);
    chunks.push({ type: typeName(type), data, crcOk: crc32([type, data]) === crc });
    at += 12 + length;
    if (chunks[chunks.length - 1].type === 'IEND') break;
  }
  if (chunks[0]?.type !== 'IHDR' || chunks[chunks.length - 1]?.type !== 'IEND') return null;
  return chunks;
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

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

/** The keyword of an iTXt/tEXt/zTXt chunk (Latin-1, up to the first NUL), or null. */
function keywordOf(data: Uint8Array): string | null {
  const end = data.indexOf(0);
  return end > 0 && end < 80 ? typeName(data.subarray(0, end)) : null;
}

/** A pHYs chunk for a picture drawn at `pixelRatio` device pixels per CSS pixel (2 → 192 dpi). */
function physChunk(pixelRatio: number): Uint8Array {
  const perMetre = Math.round((pixelRatio * CSS_DPI) / 0.0254);
  const data = new Uint8Array(9);
  const view = new DataView(data.buffer);
  view.setUint32(0, perMetre);
  view.setUint32(4, perMetre);
  data[8] = 1; // unit: metre
  return chunkBytes('pHYs', data);
}

/** The envelope for a diagram's stored content (what diagram-studio's toNativeFile writes). */
export function diagramPngEnvelope(diagram: Record<string, unknown>, title: string, app?: string): DiagramPngEnvelope {
  return { format: DIAGRAM_PNG_KEYWORD, version: DIAGRAM_PNG_VERSION, ...(app ? { app } : {}), title, diagram };
}

function readEnvelope(text: string): DiagramPngEnvelope | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isObj(raw) || raw.format !== DIAGRAM_PNG_KEYWORD || !Number.isInteger(raw.version) || (raw.version as number) < 1 || !isObj(raw.diagram)) return null;
  return raw as unknown as DiagramPngEnvelope;
}

/**
 * A copy of `png` carrying the diagram's envelope (an object, or its JSON text) in a compressed iTXt chunk, and a
 * pHYs chunk for `pixelRatio` (default 2, i.e. 192 dpi). An earlier `dcos-diagram` chunk and pHYs chunk are replaced;
 * the image data is unchanged. Throws when `png` is not a well-formed PNG, the envelope is not a diagram envelope,
 * or it is larger than DIAGRAM_PNG_MAX_BYTES.
 */
export function embedDiagramInPng(png: Uint8Array, envelope: DiagramPngEnvelope | string, opts: { pixelRatio?: number } = {}): Uint8Array {
  const chunks = pngChunks(png);
  if (!chunks) throw new Error('The preview is not a valid PNG image.');
  const text = typeof envelope === 'string' ? envelope : JSON.stringify(envelope);
  if (!readEnvelope(text)) throw new Error('The diagram data to embed is not a Classroom OS diagram.');
  const utf8 = new TextEncoder().encode(text);
  if (utf8.length > DIAGRAM_PNG_MAX_BYTES) throw new RangeError('The diagram is too large to embed in its picture (the limit is 64 MB).');
  const ratio = opts.pixelRatio ?? 2;
  if (!Number.isFinite(ratio) || ratio <= 0) throw new RangeError(`Invalid pixel ratio ${String(opts.pixelRatio)}.`);
  // keyword NUL, compression flag 1, method 0 (zlib), empty language tag NUL, empty translated keyword NUL, text.
  const header = concat([latin1(DIAGRAM_PNG_KEYWORD), Uint8Array.of(0, 1, 0, 0, 0)]);
  const itxt = chunkBytes('iTXt', concat([header, zlibSync(utf8, { level: 9 })]));

  const parts: Uint8Array[] = [Uint8Array.from(SIGNATURE)];
  for (const c of chunks) {
    if (c.type === 'pHYs') continue;
    if (c.type === 'iTXt' && keywordOf(c.data) === DIAGRAM_PNG_KEYWORD) continue;
    parts.push(chunkBytes(c.type, c.data));
    // pHYs must come before the image data; the diagram goes right after it, so readers find it without the pixels.
    if (c.type === 'IHDR') parts.push(physChunk(ratio), itxt);
  }
  return concat(parts);
}

/** Inflates zlib data, giving up (null) as soon as the output passes `limit` bytes or the data is damaged. */
function inflateLimited(data: Uint8Array, limit: number): Uint8Array | null {
  const out: Uint8Array[] = [];
  let total = 0;
  let done = false;
  let over = false;
  try {
    const inflater = new Unzlib((chunk, final) => {
      total += chunk.length;
      if (total > limit) {
        over = true;
        throw new RangeError('too large');
      }
      out.push(chunk);
      if (final) done = true;
    });
    // Small input slices bound how much one push can inflate before the limit is checked (deflate expands at most
    // about 1032:1), so a tiny "zip bomb" chunk cannot allocate gigabytes.
    const SLICE = 4096;
    for (let at = 0; at < data.length; at += SLICE) inflater.push(data.subarray(at, Math.min(data.length, at + SLICE)), at + SLICE >= data.length);
    if (!data.length) inflater.push(new Uint8Array(0), true);
  } catch {
    return null;
  }
  return done && !over ? concat(out) : null;
}

/**
 * The diagram envelope a PNG carries (see embedDiagramInPng), or null when it has none or it cannot be read safely:
 * not a PNG, a bad CRC, an unknown compression, damaged or oversized data, text that is not UTF-8 JSON, or JSON that
 * is not a diagram envelope. Never throws. The diagram itself is not validated here: pass `text` to diagram-studio's
 * parseNativeFile, which checks it strictly and refuses newer versions.
 */
export function readDiagramFromPng(png: Uint8Array, limit = DIAGRAM_PNG_MAX_BYTES): DiagramPngPayload | null {
  try {
    const chunks = pngChunks(png);
    if (!chunks) return null;
    for (const c of chunks) {
      if (c.type !== 'iTXt' || !c.crcOk || keywordOf(c.data) !== DIAGRAM_PNG_KEYWORD) continue;
      let at = DIAGRAM_PNG_KEYWORD.length + 1;
      const compressed = c.data[at];
      const method = c.data[at + 1];
      at += 2;
      const langEnd = c.data.indexOf(0, at);
      if (langEnd < 0) continue;
      const transEnd = c.data.indexOf(0, langEnd + 1);
      if (transEnd < 0) continue;
      const body = c.data.subarray(transEnd + 1);
      if (body.length > limit) continue;
      let utf8: Uint8Array | null;
      if (compressed === 0) utf8 = body;
      else if (compressed === 1 && method === 0) utf8 = inflateLimited(body, limit);
      else continue;
      if (!utf8) continue;
      let text: string;
      try {
        text = new TextDecoder('utf-8', { fatal: true }).decode(utf8);
      } catch {
        continue;
      }
      const envelope = readEnvelope(text);
      if (envelope) return { text, envelope };
    }
  } catch {
    // Never throw on file data.
  }
  return null;
}

/**
 * Device pixels per CSS pixel recorded in a PNG's pHYs chunk (2 for a 192 dpi preview), or null when the PNG has no
 * usable pHYs chunk (no chunk, a bad CRC, an unknown unit or a nonsensical density).
 */
export function pngPixelRatio(png: Uint8Array): number | null {
  const phys = pngChunks(png)?.find((c) => c.type === 'pHYs');
  if (!phys || !phys.crcOk || phys.data.length !== 9 || phys.data[8] !== 1) return null;
  const view = new DataView(phys.data.buffer, phys.data.byteOffset, 9);
  const x = view.getUint32(0);
  if (!x || x !== view.getUint32(4)) return null;
  const ratio = (x * 0.0254) / CSS_DPI;
  // 7559 per metre is 2 (192 dpi), not 1.99996: a ratio this close to a hundredth is that hundredth. Any other ratio
  // (a large preview drawn at less than 2×, say 1.4923) is kept as it is, so the natural size worked out from it is
  // the diagram's own (rounding it to 1.49 made a 3000 px wide diagram come back 3005 px wide; Round 3).
  const near = Math.round(ratio * 100) / 100;
  const value = Math.abs(ratio - near) < 0.0005 ? near : ratio;
  return value >= 0.25 && value <= 16 ? value : null;
}

/**
 * A copy of `png` without its `dcos-diagram` chunk (the picture stays exactly the same), for storing an imported
 * diagram's preview: the diagram's data is kept in the document, so the picture need not carry it twice. Returns the
 * input unchanged when it has no such chunk or is not a well-formed PNG.
 */
export function withoutDiagramData(png: Uint8Array): Uint8Array {
  const chunks = pngChunks(png);
  if (!chunks || !chunks.some((c) => c.type === 'iTXt' && keywordOf(c.data) === DIAGRAM_PNG_KEYWORD)) return png;
  const parts: Uint8Array[] = [Uint8Array.from(SIGNATURE)];
  for (const c of chunks) if (!(c.type === 'iTXt' && keywordOf(c.data) === DIAGRAM_PNG_KEYWORD)) parts.push(chunkBytes(c.type, c.data));
  return concat(parts);
}
