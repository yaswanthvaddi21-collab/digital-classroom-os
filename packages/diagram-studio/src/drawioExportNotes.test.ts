// @vitest-environment jsdom
/**
 * A .drawio export never changes a diagram silently (plan rule 3, DS-R1): everything the file cannot hold is named in
 * the export toast. Since G-DRAWIO, groups, hidden shapes, locks, layers and the other Round 1 fields are written for
 * real (drawio-phase5.test.ts), so only what diagrams.net itself cannot hold is named.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { drawioExportNotes, fromDrawio, toDrawio } from './drawio';
import type { EditorController } from './editor/controller';
import { EXPORT_FORMATS, runExport } from './editor/ExportMenu';
import { diagramTemplates } from './templates';
import { deserializeDiagram, serializeDiagram, type DiagramContent } from './types';

afterEach(() => vi.restoreAllMocks());

const flowchart = () => diagramTemplates.find((t) => t.id === 'flowchart')!.build();
const save = (d: DiagramContent) => {
  const s = deserializeDiagram(d);
  return serializeDiagram(s.nodes, s.edges, s.viewport, s.settings, s.layers);
};

/** A group holding a hidden child (the verifier's probe), plus every other Round 1 field. */
function schema3(): DiagramContent {
  const d = flowchart();
  d.layers = [
    { id: 'base', name: 'Base', visible: true, locked: false },
    { id: 'notes', name: 'Notes', visible: false, locked: true },
  ];
  d.nodes.unshift({ id: 'grp', position: { x: 500, y: 0 }, width: 300, height: 200, data: { ...d.nodes[0].data, shape: 'group', label: '' } });
  Object.assign(d.nodes[1], { parentId: 'grp', position: { x: 10, y: 10 }, hidden: true, locked: true, layer: 'notes' });
  Object.assign(d.nodes[1].data, { label: 'Hidden' });
  Object.assign(d.nodes[3].data, { rotation: 45, link: 'https://example.com', tooltip: 'Check this', properties: { marks: '5' } });
  Object.assign(d.edges[0].data, { waypoints: [{ x: 1, y: 2 }], labelPosition: 0.75, sourcePort: 'perimeter' });
  Object.assign(d.edges[1].data, { targetPort: { x: 0.5, y: 0 } });
  return save(d);
}

describe('drawioExportNotes', () => {
  it.each(diagramTemplates.map((t) => [t.id, t] as const))('%s (schema 2) exports with no notes', (_, t) => {
    expect(drawioExportNotes(t.build())).toEqual([]);
  });

  // G-DRAWIO (Phase 5 round 2) mapped every Round 1 field to diagrams.net, so only what the format cannot hold is left.
  it('names only what diagrams.net cannot hold, with counts', () => {
    // The hidden child is on the layer “notes” while its group is on the first layer: diagrams.net puts a group's
    // shapes on the group's layer.
    expect(drawioExportNotes(schema3())).toEqual([
      "1 shape inside a group was written on the layer of its group: in diagrams.net a group's shapes share its layer.",
    ]);
  });

  it('counts in the plural', () => {
    const d = flowchart();
    d.nodes[0].data.properties = { 'two words': 'x', label: 'y', ok: 'z' };
    expect(drawioExportNotes(d)).toEqual([
      '2 custom properties were left out: diagrams.net cannot store their names (a name must start with a letter and hold only letters, digits, dots, hyphens and underscores; id, label, link, tooltip and placeholders are reserved).',
    ]);
  });

  it('names kinds, line types and fields from a newer version', () => {
    const d = flowchart();
    (d.nodes[0].data as { shape: string }).shape = 'hologram';
    (d.nodes[1].data as unknown as Record<string, unknown>).sparkle = 3;
    (d.edges[0] as { type: string }).type = 'zigzag';
    expect(drawioExportNotes(d)).toEqual([
      '1 shape of a kind this version does not know was written as a rectangle.',
      '1 connector of a line type this version does not know was written as rounded elbow lines.',
      'Settings from a newer version on 1 shape or connector were left out.',
    ]);
  });
});

describe('groups in .drawio files', () => {
  it('a group cell is written invisible, as it is drawn here', () => {
    const xml = toDrawio(schema3());
    const cell = new DOMParser().parseFromString(xml, 'text/xml').querySelector('mxCell[id="grp"]')!;
    expect(cell.getAttribute('style')).toMatch(/fillColor=none;strokeColor=none;$/);
  });

  it('a group comes back from the file as a group, with its hidden, locked child inside it', () => {
    const { content, report } = fromDrawio(toDrawio(schema3()));
    // Nothing is flattened; hidden content is named, as any import names it (DS-R2).
    expect(report.notes).toEqual(['1 shape hidden in the file was imported hidden: “Hidden”. “Show hidden shapes” in the Layers panel shows it.', 'The layer “Notes” is hidden in the file, so it was imported as a hidden layer.']);
    const grp = content.nodes.find((n) => n.id === 'grp')!;
    expect(grp.data.shape).toBe('group');
    const child = content.nodes.find((n) => n.parentId === 'grp')!;
    expect(child).toMatchObject({ position: { x: 10, y: 10 }, hidden: true, locked: true });
  });
});

describe('the editor’s .drawio export toast', () => {
  const ctx = (content: DiagramContent, toast = vi.fn()) => ({ title: 'T', readOnly: false, serialize: () => content, toast }) as unknown as EditorController;
  const drawio = EXPORT_FORMATS.find((f) => f.id === 'drawio')!;
  const download = () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:x');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  };

  it('lists what was left out, as information', async () => {
    download();
    const toast = vi.fn();
    await runExport(ctx(schema3(), toast), drawio);
    expect(toast).toHaveBeenCalledTimes(1);
    const [message, tone] = toast.mock.calls[0];
    expect(tone).toBe('info');
    expect(message).toMatch(/^Exported for diagrams\.net\. 1 shape inside a group was written on the layer of its group/);
    expect(message).not.toMatch(/hidden|flattened|left out/);
  });

  it('is a plain success when nothing was left out', async () => {
    download();
    const toast = vi.fn();
    await runExport(ctx(flowchart(), toast), drawio);
    expect(toast).toHaveBeenCalledWith('Exported for diagrams.net', 'success');
  });
});
