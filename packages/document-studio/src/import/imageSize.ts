/**
 * The pixel size of a PNG, JPEG, GIF, BMP or WebP picture, read from its header (no decoding, works anywhere).
 * Returns null for other formats or damaged headers.
 */
export function imageSize(bytes: Uint8Array): { width: number; height: number } | null {
  const b = bytes;
  const u16be = (i: number) => (b[i] << 8) | b[i + 1];
  const u16le = (i: number) => b[i] | (b[i + 1] << 8);
  const u32be = (i: number) => ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;
  const i32le = (i: number) => b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24);
  const ok = (w: number, h: number) => (w > 0 && h > 0 && w < 100_000 && h < 100_000 ? { width: w, height: h } : null);
  if (b.length >= 24 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return ok(u32be(16), u32be(20));
  if (b.length >= 10 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return ok(u16le(6), u16le(8));
  if (b.length >= 26 && b[0] === 0x42 && b[1] === 0x4d) return ok(Math.abs(i32le(18)), Math.abs(i32le(22)));
  if (b.length >= 30 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) {
    const kind = String.fromCharCode(b[12], b[13], b[14], b[15]);
    if (kind === 'VP8X') return ok(1 + (b[24] | (b[25] << 8) | (b[26] << 16)), 1 + (b[27] | (b[28] << 8) | (b[29] << 16)));
    if (kind === 'VP8 ') return ok(u16le(26) & 0x3fff, u16le(28) & 0x3fff);
    if (kind === 'VP8L') {
      const bits = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24);
      return ok((bits & 0x3fff) + 1, ((bits >> 14) & 0x3fff) + 1);
    }
    return null;
  }
  if (b.length >= 4 && b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) {
        i++;
        continue;
      }
      const marker = b[i + 1];
      // Start-of-frame markers (baseline, progressive …), not DHT/JPG/DAC.
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) return ok(u16be(i + 7), u16be(i + 5));
      if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01 || marker === 0xff) {
        i += marker === 0xff ? 1 : 2;
        continue;
      }
      i += 2 + u16be(i + 2);
    }
  }
  return null;
}

/** Bytes as a base64 data URL. */
export function toDataUrl(bytes: Uint8Array, mime: string): string {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return `data:${mime};base64,${btoa(bin)}`;
}
