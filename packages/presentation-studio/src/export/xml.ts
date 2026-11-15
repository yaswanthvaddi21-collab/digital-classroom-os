/**
 * Small XML helpers for the PPTX post-processing and the PDF's slide SVG. Pure.
 */

/** Characters XML 1.0 forbids (control characters other than tab, line feed and carriage return; lone surrogates). */
// eslint-disable-next-line no-control-regex
const INVALID_XML = /[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]|[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g;

/** Text or an attribute value escaped for XML, with characters XML cannot hold removed. */
export function esc(value: unknown): string {
  return String(value ?? '')
    .replace(INVALID_XML, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** A number for SVG/XML output: finite, at most 2 decimals. */
export const num = (v: number) => (Number.isFinite(v) ? String(Math.round(v * 100) / 100) : '0');

/** An integer for OOXML attributes. */
export const int = (v: number) => String(Number.isFinite(v) ? Math.round(v) : 0);

/** '#rrggbb' → 'RRGGBB' (the form OOXML and PptxGenJS use). */
export const hex6 = (color: string) => color.replace('#', '').toUpperCase();

/** Bytes as base64 (no data: prefix). Works in browsers and Node without Buffer. */
export function base64(bytes: Uint8Array): string {
  let out = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) out += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  return btoa(out);
}

/** A data: URL for bytes of a MIME type. */
export const dataUrl = (bytes: Uint8Array, mimeType: string) => `data:${mimeType};base64,${base64(bytes)}`;
