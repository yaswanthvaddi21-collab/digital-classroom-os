/**
 * Document Studio's exports and Diagram Studio agree (Phase 6, ADR 0013, group EXPORT):
 * - the newest diagram schema the exporters treat as "drawn by this version" is Diagram Studio's own;
 * - the labels plain-text export lists are exactly those of the shapes the picture draws (hidden shapes and shapes on
 *   hidden layers left out in both);
 * - the data a DOCX export puts in a diagram's picture opens with Diagram Studio's strict native reader.
 */
import { DIAGRAM_SCHEMA, diagramTemplates, parseNativeFile, type DiagramContent } from '@dcos/diagram-studio';
import { createEmptyDocument, diagramLabels, DRAWN_DIAGRAM_SCHEMA, exportDocx, readDiagramFromPng } from '@dcos/document-studio';
import { strFromU8, unzipSync, zlibSync } from 'fflate';
import { crc32 } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { buildScene } from '../../packages/diagram-studio/src/vector/renderSvg';

function png(w: number, h: number): Uint8Array {
  const chunk = (type: string, data: Uint8Array) => {
    const out = new Uint8Array(12 + data.length);
    const v = new DataView(out.buffer);
    v.setUint32(0, data.length);
    out.set(Buffer.from(type, 'latin1'), 4);
    out.set(data, 8);
    v.setUint32(8 + data.length, crc32(Buffer.concat([Buffer.from(type, 'latin1'), data])));
    return out;
  };
  const ihdr = new Uint8Array(13);
  new DataView(ihdr.buffer).setUint32(0, w);
  new DataView(ihdr.buffer).setUint32(4, h);
  ihdr.set([8, 0, 0, 0, 0], 8);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlibSync(new Uint8Array((w + 1) * h))), chunk('IEND', new Uint8Array(0))]);
}

const template = (id: string) => diagramTemplates.find((t) => t.id === id)!.build() as DiagramContent;
const oneLine = (label: string) =>
  label
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && l !== '--')
    .join(' · ');

describe('exports agree with Diagram Studio', () => {
  it('know the same newest diagram schema', () => {
    expect(DRAWN_DIAGRAM_SCHEMA).toBe(DIAGRAM_SCHEMA);
  });

  it('list the labels of exactly the shapes the picture draws', () => {
    for (const t of diagramTemplates) {
      const content = t.build() as DiagramContent;
      const drawn = buildScene(content).nodes.map((n) => oneLine(n.data.label ?? '')).filter(Boolean);
      const listed = diagramLabels(content).filter((l) => !l.includes(' → '));
      expect(listed.slice().sort(), t.id).toEqual(drawn.slice().sort());
    }
    // With a hidden shape, a hidden layer and a shape grouped on a hidden layer.
    const base = template('flowchart');
    const [first, second, third] = base.nodes;
    const content: DiagramContent = {
      ...base,
      schemaVersion: 3,
      layers: [
        { id: 'l1', name: 'Base', visible: true, locked: false },
        { id: 'l2', name: 'Hidden', visible: false, locked: false },
      ],
      nodes: [
        { ...first, hidden: true },
        { ...second, layer: 'l2' },
        { ...third, id: 'grp', data: { ...third.data, shape: 'group', label: '' } as DiagramContent['nodes'][number]['data'], layer: 'l2' },
        { ...third, id: 'kid', parentId: 'grp', position: { x: 5, y: 5 } },
        ...base.nodes.slice(3),
      ],
    };
    const drawn = buildScene(content).nodes.map((n) => oneLine(n.data.label ?? '')).filter(Boolean);
    const listed = diagramLabels(content).filter((l) => !l.includes(' → '));
    expect(listed.slice().sort()).toEqual(drawn.slice().sort());
    expect(listed).not.toContain(oneLine(first.data.label));
    expect(listed).not.toContain(oneLine(second.data.label));
  });

  it('put data in the DOCX picture that Diagram Studio opens', async () => {
    const diagram = template('flowchart');
    const content = {
      ...createEmptyDocument(),
      schemaVersion: 2,
      doc: { type: 'doc', content: [{ type: 'diagram', attrs: { source: diagram, previewId: 'p', naturalWidth: 300, naturalHeight: 200, width: 300, height: 200, title: 'Flow' } }] },
    };
    const file = new Uint8Array(await (await exportDocx(content, 'D', async () => new Blob([png(600, 400) as BlobPart]))).arrayBuffer());
    const zip = unzipSync(file);
    const media = Object.keys(zip).find((f) => f.startsWith('word/media/'))!;
    const payload = readDiagramFromPng(zip[media])!;
    const opened = parseNativeFile(payload.text);
    expect(opened.title).toBe('Flow');
    expect(opened.content.nodes.map((n) => n.data.label)).toEqual(diagram.nodes.map((n) => n.data.label));
    expect(strFromU8(zip['word/document.xml'])).toContain('descr="Flow"');
  });
});
