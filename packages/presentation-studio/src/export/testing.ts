/**
 * Test helpers for the exports (not used by the app): real PNG and JPEG bytes and an in-memory image host.
 */
import { zlibSync } from 'fflate';
import type { PresentationImageHost } from '../hosts';

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const v = new DataView(out.buffer);
  v.setUint32(0, data.length);
  const td = new Uint8Array(4 + data.length);
  td.set([...type].map((c) => c.charCodeAt(0)), 0);
  td.set(data, 4);
  out.set(td, 4);
  v.setUint32(8 + data.length, crc32(td));
  return out;
}

/** A solid-colour RGB PNG of w × h pixels. */
export function solidPng(w: number, h: number, rgb: [number, number, number] = [37, 99, 235]): Uint8Array {
  const ihdr = new Uint8Array(13);
  const v = new DataView(ihdr.buffer);
  v.setUint32(0, w);
  v.setUint32(4, h);
  ihdr.set([8, 2, 0, 0, 0], 8);
  const raw = new Uint8Array(h * (1 + w * 3));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) raw.set(rgb, y * (1 + w * 3) + 1 + x * 3);
  const parts = [Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a), chunk('IHDR', ihdr), chunk('IDAT', zlibSync(raw)), chunk('IEND', new Uint8Array(0))];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

/** An image host holding `files` (attachment id → bytes); every other id is "not on this device". */
export function memoryImageHost(files: Record<string, Uint8Array | string>): PresentationImageHost & { loads: string[] } {
  const loads: string[] = [];
  return {
    loads,
    async putAttachment() {
      throw new Error('read-only test host');
    },
    async loadAttachment(id: string) {
      loads.push(id);
      const f = files[id];
      if (f === undefined) return undefined;
      return new Blob([typeof f === 'string' ? f : (f as BlobPart)]);
    },
  };
}
