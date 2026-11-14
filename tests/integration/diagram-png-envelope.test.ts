/**
 * The editable diagram data a PNG preview carries (document-studio export/diagramPng.ts, Phase 6, ADR 0013) is
 * diagram-studio's own .dcosdiagram file, so the strict native reader opens it, and refuses what it must refuse.
 */
import { describe, expect, it } from 'vitest';
import { diagramTemplates, NATIVE_FORMAT, NATIVE_MAX_BYTES, NATIVE_VERSION, NativeDiagramError, parseNativeFile, toNativeFile, type DiagramContent } from '@dcos/diagram-studio';
import { DIAGRAM_PNG_KEYWORD, DIAGRAM_PNG_MAX_BYTES, DIAGRAM_PNG_VERSION, diagramPngEnvelope, embedDiagramInPng, readDiagramFromPng } from '@dcos/document-studio';
import { zlibSync } from 'fflate';
import { crc32 } from 'node:zlib';

/** A 1×1 PNG. */
function tinyPng(): Uint8Array {
  const chunk = (type: string, data: Uint8Array) => {
    const out = new Uint8Array(12 + data.length);
    const v = new DataView(out.buffer);
    v.setUint32(0, data.length);
    out.set(Buffer.from(type, 'latin1'), 4);
    out.set(data, 8);
    v.setUint32(8 + data.length, crc32(Buffer.concat([Buffer.from(type, 'latin1'), data])));
    return out;
  };
  const ihdr = Uint8Array.of(0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlibSync(Uint8Array.of(0, 255, 255, 255, 255))), chunk('IEND', new Uint8Array(0))]);
}

const flowchart = () => diagramTemplates.find((t) => t.id === 'flowchart')!.build() as DiagramContent;

describe('diagram data in PNG previews', () => {
  it('uses the native file format, version and size limit', () => {
    expect(DIAGRAM_PNG_KEYWORD).toBe(NATIVE_FORMAT);
    expect(DIAGRAM_PNG_VERSION).toBe(NATIVE_VERSION);
    expect(DIAGRAM_PNG_MAX_BYTES).toBe(NATIVE_MAX_BYTES);
  });

  it('a file written by toNativeFile round-trips through a PNG and opens with parseNativeFile', () => {
    const d = flowchart();
    const png = embedDiagramInPng(tinyPng(), toNativeFile(d, 'Flowchart'));
    const read = readDiagramFromPng(png)!;
    const opened = parseNativeFile(read.text);
    expect(opened.title).toBe('Flowchart');
    expect(opened.content).toEqual(parseNativeFile(toNativeFile(d, 'Flowchart')).content);
  });

  it("document-studio's own envelope (which cannot import diagram-studio) is one parseNativeFile accepts", () => {
    const d = flowchart();
    const read = readDiagramFromPng(embedDiagramInPng(tinyPng(), diagramPngEnvelope(d as unknown as Record<string, unknown>, 'Flow', '0.2.0')))!;
    expect(parseNativeFile(read.text)).toMatchObject({ title: 'Flow', content: { nodes: expect.any(Array) } });
  });

  it('a diagram from a newer version is carried byte for byte, and the native reader refuses it with its message', () => {
    const newer = { ...flowchart(), schemaVersion: 99 };
    const text = toNativeFile(newer as DiagramContent, 'Future');
    const read = readDiagramFromPng(embedDiagramInPng(tinyPng(), text))!;
    expect(read.text).toBe(text);
    expect(() => parseNativeFile(read.text)).toThrow(NativeDiagramError);
    expect(() => parseNativeFile(read.text)).toThrow(/newer/);
  });
});
