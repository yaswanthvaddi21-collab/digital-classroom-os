import { describe, expect, it } from 'vitest';
import { anchorPoint, canConnect, directionFromKey, facingHandles, placeNew, QUICK_GAP, quickObstacles, type Box } from './quickConnectGeometry';

const box = (id: string, x: number, y: number, width = 100, height = 50): Box => ({ id, x, y, width, height });
const size = { width: 100, height: 50 };

describe('placeNew', () => {
  const src = box('s', 0, 0);

  it('places the new shape beside the source, centred, one gap away, in every direction', () => {
    expect(placeNew(src, 'right', size, [src])).toEqual({ x: 100 + QUICK_GAP, y: 0 });
    expect(placeNew(src, 'left', size, [src])).toEqual({ x: -QUICK_GAP - 100, y: 0 });
    expect(placeNew(src, 'bottom', size, [src])).toEqual({ x: 0, y: 50 + QUICK_GAP });
    expect(placeNew(src, 'top', size, [src])).toEqual({ x: 0, y: -QUICK_GAP - 50 });
  });

  it('centres shapes of a different size on the source', () => {
    expect(placeNew(src, 'right', { width: 80, height: 110 }, [src])).toEqual({ x: 160, y: -30 });
  });

  it('moves further out instead of overlapping existing shapes', () => {
    const blocker = box('b', 160, 0);
    const pos = placeNew(src, 'right', size, [src, blocker]);
    expect(pos.y).toBe(0);
    expect(pos.x).toBeGreaterThanOrEqual(blocker.x + blocker.width + 16);
    const again = placeNew(src, 'right', size, [src, blocker, box('c', pos.x, pos.y)]);
    expect(again.x).toBeGreaterThan(pos.x);
  });
});

describe('canConnect', () => {
  const ids = new Set(['a', 'b', 'c']);
  const edges = [{ source: 'a', target: 'b' }];
  it('refuses self links, duplicates (either way round) and missing shapes', () => {
    expect(canConnect(edges, ids, 'a', 'a')).toEqual({ ok: false, reason: 'self' });
    expect(canConnect(edges, ids, 'a', 'b')).toEqual({ ok: false, reason: 'duplicate' });
    expect(canConnect(edges, ids, 'b', 'a')).toEqual({ ok: false, reason: 'duplicate' });
    expect(canConnect(edges, ids, 'a', 'zzz')).toEqual({ ok: false, reason: 'missing' });
    expect(canConnect(edges, ids, 'a', 'c')).toEqual({ ok: true });
  });
});

describe('geometry helpers', () => {
  it('picks facing connection points', () => {
    expect(facingHandles(box('a', 0, 0), box('b', 300, 10))).toEqual({ sourceHandle: 'r', targetHandle: 'l' });
    expect(facingHandles(box('a', 0, 300), box('b', 10, 0))).toEqual({ sourceHandle: 't', targetHandle: 'b' });
  });
  it('finds side anchors and keyboard directions', () => {
    expect(anchorPoint(box('a', 10, 20), 'right')).toEqual({ x: 110, y: 45 });
    expect(anchorPoint(box('a', 10, 20), 'top')).toEqual({ x: 60, y: 20 });
    expect(directionFromKey('ArrowLeft')).toBe('left');
    expect(directionFromKey('a')).toBeNull();
  });
});

describe('Quick Connect next to a shape in a lane or group (Round 3)', () => {
  it('does not treat the containers the source sits in as obstacles, so the new shape stays beside it', () => {
    const nodes = [
      { id: 'pool', x: 0, y: 0, width: 700, height: 300 },
      { id: 'lane', parentId: 'pool', x: 30, y: 0, width: 670, height: 300 },
      { id: 't1', parentId: 'lane', x: 90, y: 100, width: 130, height: 80 },
      { id: 'other', x: 400, y: 100, width: 100, height: 80, hidden: true },
    ];
    expect(quickObstacles(nodes, 't1').map((n) => n.id)).toEqual([]);
    const at = placeNew(nodes[2], 'right', { width: 130, height: 80 }, quickObstacles(nodes, 't1'));
    expect(at.x + 130).toBeLessThan(700); // inside the lane, not pushed past the pool
    // Without the exclusion the pool and lane push it out (the Round 2 behaviour).
    expect(placeNew(nodes[2], 'right', { width: 130, height: 80 }, nodes).x).toBeGreaterThanOrEqual(700);
  });
});
