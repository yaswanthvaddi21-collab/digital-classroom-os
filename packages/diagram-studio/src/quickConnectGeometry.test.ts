import { describe, expect, it } from 'vitest';
import { anchorPoint, canConnect, directionFromKey, facingHandles, placeNew, QUICK_GAP, type Box } from './quickConnectGeometry';

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
