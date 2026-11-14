import { describe, expect, it } from 'vitest';
import { schema3Reason, schemaFor } from '../compat';
import { validateDiagram } from '../native';
import { deserializeDiagram, serializeDiagram, DEFAULT_CONNECTOR, DEFAULT_SETTINGS, styledEdge, type Connector, type ShapeNode } from '../types';
import { attach, attachmentOf, insertWaypoint, moveWaypoint, offsetWaypoints, portAttachment, portIdOf, removeWaypoint, setLabel, setLabelPosition, setWaypoints, withData } from './edgeChanges';
import { paletteMove } from './paletteNav';
import { floatingConnection } from './useConnect';

const style = { fill: '#ffffff', stroke: '#334155', strokeWidth: 2, textColor: '#0f172a', fontSize: 14, dashed: false, bold: false };
const node = (id: string, x: number, y = 0): ShapeNode => ({ id, type: 'shape', position: { x, y }, width: 100, height: 60, data: { ...style, shape: 'rectangle', label: id } });
const edge = (over: Partial<Connector> = {}): Connector =>
  styledEdge({ id: 'e', source: 'a', target: 'b', sourceHandle: 'r', targetHandle: 'l', type: 'smoothstep', data: { ...DEFAULT_CONNECTOR }, ...over });
const save = (e: Connector) => serializeDiagram([node('a', 0), node('b', 300)], [e], null, { ...DEFAULT_SETTINGS });

describe('attaching connector ends', () => {
  it('stores the four side points as schema-2 handles and corners as schema-3 ports', () => {
    const top = attach(edge(), 'source', portAttachment('top')!);
    expect(top.sourceHandle).toBe('t');
    expect(top.data).not.toHaveProperty('sourcePort');
    expect(save(top).schemaVersion).toBe(2);

    const corner = attach(edge(), 'target', portAttachment('bottom-left')!);
    expect(corner.data!.targetPort).toEqual({ x: 0, y: 1 });
    expect(corner.targetHandle).toBe('l'); // kept as the fallback for older builds and React Flow
    expect(save(corner).schemaVersion).toBe(3);
    expect(schema3Reason(save(corner))).toMatch(/data field targetPort/);
  });

  it('makes an end float, and back to a handle without leaving anything behind', () => {
    const floating = attach(edge(), 'source', { kind: 'perimeter' });
    expect(attachmentOf(floating, 'source')).toEqual({ kind: 'perimeter' });
    expect(save(floating).edges[0].data.sourcePort).toBe('perimeter');
    expect(save(floating).schemaVersion).toBe(3);
    const back = attach(floating, 'source', { kind: 'handle', handle: 'b' });
    expect(back.data).not.toHaveProperty('sourcePort');
    expect(back.sourceHandle).toBe('b');
    expect(save(back)).toEqual(save(edge({ sourceHandle: 'b' })));
    expect(save(back).schemaVersion).toBe(2);
  });

  it('moves an end to another shape', () => {
    const moved = attach(edge(), 'target', { kind: 'perimeter' }, 'c');
    expect(moved.target).toBe('c');
    expect(moved.data!.targetPort).toBe('perimeter');
  });

  it('returns the same connector when nothing changes', () => {
    const e = edge();
    expect(attach(e, 'source', { kind: 'handle', handle: 'r' })).toBe(e);
    const f = attach(e, 'source', { kind: 'perimeter' });
    expect(attach(f, 'source', { kind: 'perimeter' })).toBe(f);
    const g = attach(e, 'source', portAttachment('top-left')!);
    expect(attach(g, 'source', portAttachment('top-left')!)).toBe(g);
    expect(setLabel(edge({ label: 'x' }), 'x').label).toBe('x');
    expect(withData(e, { color: DEFAULT_CONNECTOR.color })).toBe(e);
  });

  it('names attachments by their fixed point', () => {
    expect(portIdOf(attachmentOf(edge(), 'source'))).toBe('right');
    expect(portIdOf({ kind: 'port', point: { x: 1, y: 0 } })).toBe('top-right');
    expect(portIdOf({ kind: 'port', point: { x: 0.25, y: 0 } })).toBeNull(); // e.g. from a diagrams.net file
    expect(attachmentOf(edge({ sourceHandle: null }), 'source')).toEqual({ kind: 'handle', handle: 't' });
  });
});

describe('bend points and the label', () => {
  it('adds, moves and removes bend points; none left removes the field', () => {
    let e = insertWaypoint(edge(), 0, { x: 150, y: 20 });
    e = insertWaypoint(e, 1, { x: 200, y: 80 });
    e = insertWaypoint(e, 1, { x: 170, y: 50 });
    expect(e.data!.waypoints).toEqual([
      { x: 150, y: 20 },
      { x: 170, y: 50 },
      { x: 200, y: 80 },
    ]);
    e = moveWaypoint(e, 2, { x: 210, y: 90 });
    expect(e.data!.waypoints![2]).toEqual({ x: 210, y: 90 });
    e = removeWaypoint(removeWaypoint(removeWaypoint(e, 0), 0), 0);
    expect(e.data).not.toHaveProperty('waypoints');
    expect(save(e).schemaVersion).toBe(2);
    expect(offsetWaypoints([{ x: 1, y: 2 }], { x: 10, y: -2 })).toEqual([{ x: 11, y: 0 }]);
  });

  it('saves bend points and label positions as schema 3 and reads them back', () => {
    const e = setLabelPosition(setWaypoints(edge({ label: 'Yes' }), [{ x: 150, y: 200 }]), 0.25);
    const stored = save(e);
    expect(stored.schemaVersion).toBe(3);
    expect(stored.edges[0].data).toMatchObject({ waypoints: [{ x: 150, y: 200 }], labelPosition: 0.25 });
    expect(validateDiagram(stored)).toBeNull();
    const reopened = deserializeDiagram(JSON.parse(JSON.stringify(stored)));
    expect(serializeDiagram(reopened.nodes, reopened.edges, null, reopened.settings)).toEqual(stored);
    // The middle is the default and leaves no trace.
    expect(setLabelPosition(e, 0.5).data).not.toHaveProperty('labelPosition');
    expect(schemaFor(save(setLabelPosition(edge(), 0.5)))).toBe(2);
  });

  it('sets and clears the label', () => {
    expect(setLabel(edge(), 'No').label).toBe('No');
    expect(setLabel(edge({ label: 'No' }), '').label).toBeUndefined();
  });

  it('every attachment the editor can store passes .dcosdiagram validation', () => {
    for (const a of [{ kind: 'perimeter' as const }, portAttachment('top-right')!, portAttachment('bottom-left')!]) {
      const stored = save(attach(attach(edge(), 'source', a), 'target', a));
      expect(validateDiagram(stored)).toBeNull();
    }
  });
});

describe('a connection dropped on a shape body floats', () => {
  const nodes = [node('a', 0), node('b', 300), node('c', 0, 300)];
  const from = { isValid: null, fromNode: { id: 'a' }, fromHandle: { id: 'r' } } as unknown as Parameters<typeof floatingConnection>[0];

  it('creates a connector whose target floats, leaving from the handle the drag began on', () => {
    const e = floatingConnection(from, 'b', nodes, [], 'smoothstep', () => 'e1')!;
    expect(e).toMatchObject({ id: 'e1', source: 'a', target: 'b', sourceHandle: 'r', targetHandle: 'l', type: 'smoothstep' });
    expect(e.data!.targetPort).toBe('perimeter');
    const below = floatingConnection({ ...from, fromHandle: null } as typeof from, 'c', nodes, [], 'straight', () => 'e2')!;
    expect(below).toMatchObject({ sourceHandle: 'b', targetHandle: 't', type: 'straight' }); // facing handles
  });

  it('does nothing when React Flow made the connection, over nothing, on the same shape, or twice', () => {
    expect(floatingConnection({ ...from, isValid: true } as typeof from, 'b', nodes, [], 'smoothstep')).toBeNull();
    expect(floatingConnection({ ...from, isValid: false } as typeof from, 'b', nodes, [], 'smoothstep')).toBeNull();
    expect(floatingConnection(from, null, nodes, [], 'smoothstep')).toBeNull();
    expect(floatingConnection(from, 'a', nodes, [], 'smoothstep')).toBeNull();
    expect(floatingConnection(from, 'zz', nodes, [], 'smoothstep')).toBeNull();
    const first = floatingConnection(from, 'b', nodes, [], 'smoothstep')!;
    expect(floatingConnection(from, 'b', nodes, [first], 'smoothstep')).toBeNull();
  });
});

describe('Quick Connect palette keys', () => {
  // 15 shapes in 5 columns: rows 0-4, 5-9, 10-14.
  it('moves through the grid', () => {
    expect(paletteMove(0, 'ArrowRight', 15)).toBe(1);
    expect(paletteMove(14, 'ArrowRight', 15)).toBe(0);
    expect(paletteMove(0, 'ArrowLeft', 15)).toBe(14);
    expect(paletteMove(2, 'ArrowDown', 15)).toBe(7);
    expect(paletteMove(12, 'ArrowDown', 15)).toBe(2);
    expect(paletteMove(7, 'ArrowUp', 15)).toBe(2);
    expect(paletteMove(2, 'ArrowUp', 15)).toBe(12);
    expect(paletteMove(5, 'Home', 15)).toBe(0);
    expect(paletteMove(5, 'End', 15)).toBe(14);
    expect(paletteMove(5, 'a', 15)).toBeNull();
  });

  it('handles a last row that is not full', () => {
    // 13 shapes: the last row holds 10, 11, 12.
    expect(paletteMove(4, 'ArrowUp', 13)).toBe(9);
    expect(paletteMove(1, 'ArrowUp', 13)).toBe(11);
    expect(paletteMove(9, 'ArrowDown', 13)).toBe(4);
    expect(paletteMove(0, 'ArrowDown', 0)).toBeNull();
  });
});

describe('clearing a label (Round 3)', () => {
  it('drops the label position with the label, so the diagram goes back to schema 2', () => {
    const moved = setLabelPosition(setLabel(edge(), 'Yes'), 0.2);
    expect(save(moved).schemaVersion).toBe(3);
    const cleared = setLabel(moved, '');
    expect(cleared.label).toBeUndefined();
    expect(cleared.data).not.toHaveProperty('labelPosition');
    expect(save(cleared).schemaVersion).toBe(2);
  });
});
