/**
 * Editable diagram data inside PNG previews (Phase 6, ADR 0013): the iTXt 'dcos-diagram' chunk and pHYs density.
 */
import { zlibSync } from 'fflate';
import { crc32 } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { DIAGRAM_PNG_KEYWORD, diagramPngEnvelope, embedDiagramInPng, isPng, pngChunks, readDiagramFromPng } from './diagramPng';

const SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const latin1 = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0));
const concat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) (out.set(p, at), (at += p.length));
  return out;
};
/** A chunk with a correct CRC (node:zlib's crc32, independent of the code under test). */
function chunk(type: string, data: Uint8Array, crc?: number): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const v = new DataView(out.buffer);
  v.setUint32(0, data.length);
  out.set(latin1(type), 4);
  out.set(data, 8);
  v.setUint32(8 + data.length, crc ?? crc32(concat(latin1(type), data)));
  return out;
}
/** A real w×h RGBA PNG (one IDAT), plus any extra chunks after IHDR. */
function makePng(w = 4, h = 3, extra: Uint8Array[] = []): Uint8Array {
  const ihdr = new Uint8Array(13);
  const v = new DataView(ihdr.buffer);
  v.setUint32(0, w);
  v.setUint32(4, h);
  ihdr.set([8, 6, 0, 0, 0], 8);
  const raw = new Uint8Array(h * (1 + w * 4)).map((_, i) => (i % (1 + w * 4) === 0 ? 0 : (i * 37) & 0xff));
  return concat(Uint8Array.from(SIG), chunk('IHDR', ihdr), ...extra, chunk('IDAT', zlibSync(raw)), chunk('IEND', new Uint8Array(0)));
}
const itxt = (keyword: string, flag: number, method: number, body: Uint8Array) => chunk('iTXt', concat(latin1(keyword), Uint8Array.of(0, flag, method, 0, 0), body));
const withChunk = (png: Uint8Array, c: Uint8Array) => {
  const iend = png.length - 12;
  return concat(png.subarray(0, iend), c, png.subarray(iend));
};

const diagram = { schemaVersion: 3, nodes: [{ id: 'a', position: { x: 0, y: 0 }, width: 120, height: 60, data: { shape: 'rectangle', label: 'Start → Ende' } }], edges: [], viewport: null, settings: {} };
const envelope = diagramPngEnvelope(diagram, 'Anmeldung – Ablauf', '0.2.0');

describe('embedDiagramInPng / readDiagramFromPng', () => {
  it('round-trips the envelope, keeps the image data, and every chunk has a valid CRC', () => {
    const png = makePng();
    const before = png.slice();
    const out = embedDiagramInPng(png, envelope);
    expect(png).toEqual(before); // the input is not changed
    expect(isPng(out)).toBe(true);
    const chunks = pngChunks(out)!;
    expect(chunks.map((c) => c.type)).toEqual(['IHDR', 'pHYs', 'iTXt', 'IDAT', 'IEND']);
    expect(chunks.every((c) => c.crcOk)).toBe(true);
    expect(chunks.find((c) => c.type === 'IDAT')!.data).toEqual(pngChunks(png)!.find((c) => c.type === 'IDAT')!.data);
    const read = readDiagramFromPng(out)!;
    expect(read.envelope).toEqual(envelope);
    expect(JSON.parse(read.text)).toEqual(envelope);
    expect(read.envelope.title).toBe('Anmeldung – Ablauf');
  });

  it('accepts the envelope as JSON text and returns that text unchanged', () => {
    const text = JSON.stringify(envelope, null, 2);
    expect(readDiagramFromPng(embedDiagramInPng(makePng(), text))!.text).toBe(text);
  });

  it('stores the data compressed with zlib under the dcos-diagram keyword', () => {
    const big = diagramPngEnvelope({ ...diagram, nodes: Array.from({ length: 200 }, (_, i) => ({ ...diagram.nodes[0], id: `n${i}` })) }, 'Big');
    const out = embedDiagramInPng(makePng(), big);
    const c = pngChunks(out)!.find((x) => x.type === 'iTXt')!;
    expect(new TextDecoder().decode(c.data.subarray(0, DIAGRAM_PNG_KEYWORD.length))).toBe('dcos-diagram');
    expect([...c.data.subarray(DIAGRAM_PNG_KEYWORD.length, DIAGRAM_PNG_KEYWORD.length + 5)]).toEqual([0, 1, 0, 0, 0]);
    expect(c.data.length).toBeLessThan(JSON.stringify(big).length / 4);
  });

  it('writes pHYs for a 2x preview as 192 dpi (and for other pixel ratios to match)', () => {
    const phys = (png: Uint8Array) => {
      const d = pngChunks(png)!.find((c) => c.type === 'pHYs')!.data;
      const v = new DataView(d.buffer, d.byteOffset, d.byteLength);
      return [v.getUint32(0), v.getUint32(4), d[8]];
    };
    // 192 dpi = 192 / 0.0254 m = 7559 pixels per metre; unit 1 = metre.
    expect(phys(embedDiagramInPng(makePng(), envelope))).toEqual([7559, 7559, 1]);
    expect(phys(embedDiagramInPng(makePng(), envelope, { pixelRatio: 1 }))).toEqual([3780, 3780, 1]);
    expect(phys(embedDiagramInPng(makePng(), envelope, { pixelRatio: 1.5 }))).toEqual([5669, 5669, 1]);
  });

  it('replaces an earlier diagram chunk and pHYs, and keeps other chunks', () => {
    const software = chunk('tEXt', concat(latin1('Software'), Uint8Array.of(0), latin1('test')));
    const oldPhys = chunk('pHYs', Uint8Array.of(0, 0, 0x0b, 0x13, 0, 0, 0x0b, 0x13, 1));
    const png = makePng(4, 3, [oldPhys, software]);
    const once = embedDiagramInPng(png, envelope);
    const twice = embedDiagramInPng(once, diagramPngEnvelope(diagram, 'Second'), { pixelRatio: 1 });
    const types = pngChunks(twice)!.map((c) => c.type);
    expect(types.filter((t) => t === 'pHYs')).toHaveLength(1);
    expect(types.filter((t) => t === 'iTXt')).toHaveLength(1);
    expect(types).toContain('tEXt');
    expect(readDiagramFromPng(twice)!.envelope.title).toBe('Second');
  });

  it('refuses to write into something that is not a PNG, or data that is not a diagram envelope', () => {
    expect(() => embedDiagramInPng(new Uint8Array([1, 2, 3]), envelope)).toThrow(/not a valid PNG/);
    expect(() => embedDiagramInPng(makePng().subarray(0, 40), envelope)).toThrow(/not a valid PNG/);
    expect(() => embedDiagramInPng(makePng(), '{"format":"something-else","version":1,"diagram":{}}')).toThrow(/not a Classroom OS diagram/);
    expect(() => embedDiagramInPng(makePng(), 'not json')).toThrow(/not a Classroom OS diagram/);
    expect(() => embedDiagramInPng(makePng(), envelope, { pixelRatio: 0 })).toThrow(RangeError);
    expect(() => embedDiagramInPng(makePng(), envelope, { pixelRatio: Number.NaN })).toThrow(RangeError);
  });
});

describe('readDiagramFromPng ignores damaged or unsafe data (never throws)', () => {
  const good = () => embedDiagramInPng(makePng(), envelope);
  const json = (s: string) => new TextEncoder().encode(s);

  it('a picture without the chunk, or bytes that are not a PNG', () => {
    expect(readDiagramFromPng(makePng())).toBeNull();
    expect(readDiagramFromPng(new Uint8Array(0))).toBeNull();
    expect(readDiagramFromPng(json('{"format":"dcos-diagram"}'))).toBeNull();
  });

  it('a truncated file, or a chunk whose length runs past the end', () => {
    const png = good();
    expect(readDiagramFromPng(png.subarray(0, png.length - 20))).toBeNull();
    const lying = png.slice();
    new DataView(lying.buffer).setUint32(33 + 21, 0x7fffffff); // the iTXt chunk (after IHDR 25 and pHYs 21 bytes) claims 2 GB
    expect(readDiagramFromPng(lying)).toBeNull();
  });

  it('a chunk whose CRC does not match (one byte of the compressed data flipped)', () => {
    const png = good();
    const c = pngChunks(png)!.find((x) => x.type === 'iTXt')!;
    const at = c.data.byteOffset + c.data.length - 3;
    const bad = png.slice();
    bad[at] ^= 0xff;
    expect(pngChunks(bad)!.find((x) => x.type === 'iTXt')!.crcOk).toBe(false);
    expect(readDiagramFromPng(bad)).toBeNull();
  });

  it('damaged compressed data with a valid CRC', () => {
    const body = zlibSync(json(JSON.stringify(envelope)));
    const broken = body.slice(0, body.length - 8); // ends mid-stream
    expect(readDiagramFromPng(withChunk(makePng(), itxt('dcos-diagram', 1, 0, broken)))).toBeNull();
    expect(readDiagramFromPng(withChunk(makePng(), itxt('dcos-diagram', 1, 0, Uint8Array.of(1, 2, 3, 4, 5, 6))))).toBeNull();
    expect(readDiagramFromPng(withChunk(makePng(), itxt('dcos-diagram', 1, 7, body)))).toBeNull(); // unknown method
    expect(readDiagramFromPng(withChunk(makePng(), itxt('dcos-diagram', 2, 0, body)))).toBeNull(); // unknown flag
  });

  it('text that is not UTF-8, not JSON, or JSON that is not a diagram envelope', () => {
    const wrap = (b: Uint8Array) => withChunk(makePng(), itxt('dcos-diagram', 1, 0, zlibSync(b)));
    expect(readDiagramFromPng(wrap(Uint8Array.of(0xff, 0xfe, 0x7b)))).toBeNull();
    expect(readDiagramFromPng(wrap(json('{not json')))).toBeNull();
    expect(readDiagramFromPng(wrap(json('{"format":"dcos-diagram","version":1}')))).toBeNull(); // no diagram
    expect(readDiagramFromPng(wrap(json('{"format":"dcos-diagram","version":0,"diagram":{}}')))).toBeNull();
    expect(readDiagramFromPng(wrap(json('{"format":"mxfile","version":1,"diagram":{}}')))).toBeNull();
    expect(readDiagramFromPng(wrap(json('[1,2]')))).toBeNull();
  });

  it('an oversized chunk: a small compressed chunk that inflates past the limit is dropped', () => {
    // 8 MB of spaces inside the title compress to a few kilobytes ("zip bomb").
    const huge = JSON.stringify(diagramPngEnvelope(diagram, ' '.repeat(8 * 1024 * 1024)));
    const png = withChunk(makePng(), itxt('dcos-diagram', 1, 0, zlibSync(json(huge), { level: 9 })));
    expect(png.length).toBeLessThan(64 * 1024);
    expect(readDiagramFromPng(png, 1024 * 1024)).toBeNull();
    // The same chunk within the limit reads normally, so the limit (not damage) is what refused it.
    expect(readDiagramFromPng(png, 16 * 1024 * 1024)!.envelope.title).toHaveLength(8 * 1024 * 1024);
    // Uncompressed text larger than the limit is refused too.
    expect(readDiagramFromPng(withChunk(makePng(), itxt('dcos-diagram', 0, 0, json(huge))), 1024 * 1024)).toBeNull();
  });

  it('other text chunks (another keyword, tEXt) are ignored; an uncompressed dcos-diagram iTXt is read', () => {
    const text = JSON.stringify(envelope);
    expect(readDiagramFromPng(withChunk(makePng(), itxt('mxfile', 1, 0, zlibSync(json(text)))))).toBeNull();
    expect(readDiagramFromPng(withChunk(makePng(), chunk('tEXt', concat(latin1('dcos-diagram'), Uint8Array.of(0), json(text)))))).toBeNull();
    expect(readDiagramFromPng(withChunk(makePng(), itxt('dcos-diagram', 0, 0, json(text))))!.envelope).toEqual(envelope);
  });

  it('a damaged first chunk does not hide a good second one', () => {
    const bad = itxt('dcos-diagram', 1, 0, Uint8Array.of(9, 9, 9));
    const goodChunk = itxt('dcos-diagram', 1, 0, zlibSync(json(JSON.stringify(envelope))));
    expect(readDiagramFromPng(withChunk(withChunk(makePng(), bad), goodChunk))!.envelope).toEqual(envelope);
  });
});
