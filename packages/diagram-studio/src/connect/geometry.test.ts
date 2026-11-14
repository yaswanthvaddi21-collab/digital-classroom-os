import { getBezierPath, getSmoothStepPath, getStraightPath, Position } from '@xyflow/react';
import { describe, expect, it } from 'vitest';
import {
  connectorGeometry,
  handleEnd,
  insertHandles,
  nearestAlong,
  orthogonalRoute,
  outlinePoint,
  pointAlong,
  polylineLength,
  portPoint,
  PORTS,
  resolveEnds,
  routeThrough,
  samplePath,
  sideOf,
  storedLabelPosition,
  type ConnectorEnd,
  type PathFn,
  type Rect,
} from './geometry';

const box: Rect = { x: 100, y: 100, width: 200, height: 100 }; // centre (200, 150)
const close = (a: { x: number; y: number }, b: { x: number; y: number }, eps = 0.01) => {
  expect(a.x).toBeCloseTo(b.x, -Math.log10(eps));
  expect(a.y).toBeCloseTo(b.y, -Math.log10(eps));
};
const end = (x: number, y: number, position: Position): ConnectorEnd => ({ x, y, position });
const smoothstep: PathFn = (g) => {
  const [p, x, y] = getSmoothStepPath(g);
  return [p, x, y];
};

describe('outlines', () => {
  it('meets a rectangle on the side facing the other point', () => {
    close(outlinePoint('rectangle', box, { x: 600, y: 150 }), { x: 300, y: 150 });
    close(outlinePoint('rectangle', box, { x: 200, y: -500 }), { x: 200, y: 100 });
    close(outlinePoint('rectangle', box, { x: 400, y: 250 }), { x: 300, y: 200 }); // through the corner
    close(outlinePoint('rectangle', box, { x: 200, y: 150 }), { x: 200, y: 100 }); // centre: the top
  });

  it('follows ellipses, diamonds, triangles, hexagons and parallelograms', () => {
    // Ellipse at 45° from the centre in box units: (cos, sin)·radii / √2.
    const e = outlinePoint('ellipse', box, { x: 300, y: 200 });
    expect(((e.x - 200) / 100) ** 2 + ((e.y - 150) / 50) ** 2).toBeCloseTo(1, 6);
    // Diamond: the point on the line between the right and bottom vertices.
    const d = outlinePoint('diamond', box, { x: 300, y: 200 });
    expect(Math.abs(d.x - 200) / 100 + Math.abs(d.y - 150) / 50).toBeCloseTo(1, 6);
    // Triangle (apex at the top middle): straight right from the centre meets the right slope, inside the box.
    const t = outlinePoint('triangle', box, { x: 900, y: 150 });
    expect(t.y).toBeCloseTo(150);
    expect(t.x).toBeCloseTo(250); // the slope from (200,100) to (300,200) at y = 150
    // Hexagon: straight right is the right vertex.
    close(outlinePoint('hexagon', box, { x: 900, y: 150 }), { x: 300, y: 150 });
    // Parallelogram (slanted by 32 px): straight up meets the top edge.
    close(outlinePoint('parallelogram', box, { x: 200, y: 0 }), { x: 200, y: 100 });
    // A kind from a newer version uses its box.
    close(outlinePoint('futureKind', box, { x: 600, y: 150 }), { x: 300, y: 150 });
  });

  it('names the side a point is on, and resolves corners towards the other end', () => {
    expect(sideOf({ x: 300, y: 150 }, box)).toBe(Position.Right);
    expect(sideOf({ x: 100, y: 160 }, box)).toBe(Position.Left);
    expect(sideOf({ x: 220, y: 100 }, box)).toBe(Position.Top);
    expect(sideOf({ x: 220, y: 200 }, box)).toBe(Position.Bottom);
    expect(sideOf({ x: 300, y: 100 }, box, { x: 900, y: 140 })).toBe(Position.Right);
    expect(sideOf({ x: 300, y: 100 }, box, { x: 210, y: -400 })).toBe(Position.Top);
  });

  it('projects fixed points onto the outline; side middles equal the side handles', () => {
    close(portPoint('rectangle', box, { x: 1, y: 0 }), { x: 300, y: 100 });
    close(portPoint('rectangle', box, { x: 0.25, y: 1 }), { x: 150, y: 200 });
    const ne = portPoint('ellipse', box, { x: 1, y: 0 });
    expect(((ne.x - 200) / 100) ** 2 + ((ne.y - 150) / 50) ** 2).toBeCloseTo(1, 6);
    close(portPoint('diamond', box, { x: 0.5, y: 0 }), { x: 200, y: 100 });
    close(portPoint('rectangle', box, { x: 0.5, y: 0.5 }), { x: 200, y: 150 });
    expect(PORTS).toHaveLength(8);
    expect(PORTS.filter((p) => p.handle).map((p) => p.handle)).toEqual(['t', 'r', 'b', 'l']);
    for (const p of PORTS.filter((q) => q.handle)) {
      const h = handleEnd(box, p.handle);
      const q = portPoint('rectangle', box, p.point);
      expect(Math.hypot(h.x - q.x, h.y - q.y)).toBeCloseTo(5); // React Flow's handle sits half its 10 px outside
    }
  });
});

describe('floating ends (automatic repositioning)', () => {
  const left: Rect = { x: 0, y: 0, width: 100, height: 60 }; // centre (50, 30)
  const right = (dx: number, dy: number): Rect => ({ x: dx, y: dy, width: 100, height: 60 });
  const input = (b: Rect, port?: 'perimeter' | { x: number; y: number }) => ({ box: b, kind: 'rectangle', handle: handleEnd(b, 'r'), port });

  it('re-picks the side as the other shape moves around', () => {
    const sides = [
      [right(400, 0), Position.Right, Position.Left],
      [right(0, 400), Position.Bottom, Position.Top],
      [right(-400, 0), Position.Left, Position.Right],
      [right(0, -400), Position.Top, Position.Bottom],
    ] as const;
    for (const [b, s, t] of sides) {
      const r = resolveEnds(input(left, 'perimeter'), input(b, 'perimeter'));
      expect([r.source.position, r.target.position]).toEqual([s, t]);
    }
  });

  it('places both floating ends on the line between the centres', () => {
    const b = right(300, 200); // centre (350, 230)
    const r = resolveEnds(input(left, 'perimeter'), input(b, 'perimeter'));
    const cross = (p: { x: number; y: number }) => (p.x - 50) * (230 - 30) - (p.y - 30) * (350 - 50);
    expect(Math.abs(cross(r.source))).toBeLessThan(1e-6);
    expect(Math.abs(cross(r.target))).toBeLessThan(1e-6);
    expect(r.source.x).toBeCloseTo(95, 0); // leaves through the bottom near the right corner (dx 300, dy 200)
    expect(r.source.y).toBeCloseTo(60);
  });

  it('aims a floating end at the fixed other end, or at the nearest bend point', () => {
    const b = right(400, 0);
    const fixedTarget = resolveEnds(input(left, 'perimeter'), { ...input(b), handle: handleEnd(b, 't') });
    expect(fixedTarget.target).toEqual(handleEnd(b, 't'));
    expect(fixedTarget.source.position).toBe(Position.Right);
    const viaBend = resolveEnds(input(left, 'perimeter'), input(b, 'perimeter'), [{ x: 50, y: 300 }]);
    close(viaBend.source, { x: 50, y: 60 }); // straight down to the bend
    expect(viaBend.source.position).toBe(Position.Bottom);
    expect(viaBend.target.position).toBe(Position.Bottom); // the bend is below the target too
  });

  it('keeps a fixed corner port on the corner', () => {
    const b = right(400, 0);
    const r = resolveEnds(input(left, { x: 1, y: 1 }), input(b, 'perimeter'));
    close(r.source, { x: 100, y: 60 });
    expect(r.source.position).toBe(Position.Right); // the corner faces the target on the right
  });
});

describe('routes through bend points', () => {
  const s = end(100, 100, Position.Right);
  const t = end(400, 300, Position.Left);
  const isOrthogonal = (pts: Array<{ x: number; y: number }>) => pts.slice(1).every((p, i) => Math.abs(p.x - pts[i].x) < 1e-6 || Math.abs(p.y - pts[i].y) < 1e-6);

  it('keeps every turn of an orthogonal line at a right angle, wherever the bends are', () => {
    const cases = [[{ x: 250, y: 50 }], [{ x: 50, y: 400 }], [{ x: 250, y: 50 }, { x: 300, y: 350 }], [{ x: 500, y: 300 }], [{ x: 133, y: 277 }, { x: 47, y: 12 }, { x: 512, y: 333 }]];
    for (const w of cases) {
      const legs = orthogonalRoute(s, t, w);
      expect(legs).toHaveLength(w.length + 1);
      const all = legs.flat();
      expect(isOrthogonal(all), JSON.stringify(w)).toBe(true);
      // Starts at s, ends at t, passes through every bend point.
      expect(all[0]).toEqual({ x: 100, y: 100, position: Position.Right });
      expect(all[all.length - 1]).toMatchObject({ x: 400, y: 300 });
      for (const p of w) expect(all.some((q) => q.x === p.x && q.y === p.y)).toBe(true);
    }
  });

  it('leaves and enters straight out of the shapes when the bend lies ahead', () => {
    const legs = orthogonalRoute(s, t, [{ x: 250, y: 200 }]);
    const all = legs.flat();
    expect(all[1]).toMatchObject({ y: 100 }); // the first run is horizontal (right side)
    expect(all[all.length - 2]).toMatchObject({ y: 300 }); // the last run is horizontal (left side)
  });

  it('draws straight, orthogonal, elbow and curved lines through the bends', () => {
    const w = [{ x: 250, y: 50 }];
    const straight = routeThrough('straight', s, t, w);
    expect(samplePath(straight.path)).toEqual([
      { x: 100, y: 100 },
      { x: 250, y: 50 },
      { x: 400, y: 300 },
    ]);
    expect(routeThrough('step', s, t, w).path).not.toContain('Q');
    expect(routeThrough('smoothstep', s, t, w).path).toContain('Q');
    const curved = routeThrough('default', s, t, w);
    expect(curved.path.match(/C/g)).toHaveLength(2);
    expect(nearestAlong(samplePath(curved.path), { x: 250, y: 50 }).distance).toBeLessThan(0.5); // passes through the bend
    expect(routeThrough('futureType', s, t, w).path).toBe(straight.path);
  });
});

describe('paths, label positions and handles', () => {
  it('reads the paths React Flow writes', () => {
    const g = { sourceX: 0, sourceY: 0, targetX: 200, targetY: 100, sourcePosition: Position.Right, targetPosition: Position.Left };
    expect(samplePath(getStraightPath(g)[0])).toEqual([
      { x: 0, y: 0 },
      { x: 200, y: 100 },
    ]);
    const step = samplePath(getSmoothStepPath({ ...g, borderRadius: 0 })[0]);
    expect(step[0]).toEqual({ x: 0, y: 0 });
    expect(step[step.length - 1]).toEqual({ x: 200, y: 100 });
    const bez = samplePath(getBezierPath(g)[0]);
    expect(bez.length).toBeGreaterThan(10);
    expect(bez[bez.length - 1]).toEqual({ x: 200, y: 100 });
    expect(samplePath('m10,10 l5,0 v5 h-5 z')).toEqual([
      { x: 10, y: 10 },
      { x: 15, y: 10 },
      { x: 15, y: 15 },
      { x: 10, y: 15 },
      { x: 10, y: 10 },
    ]);
  });

  it('finds points along a line and the nearest point to the pointer', () => {
    const line = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
    ];
    expect(polylineLength(line)).toBe(200);
    expect(pointAlong(line, 0.25)).toEqual({ x: 50, y: 0 });
    expect(pointAlong(line, 0.75)).toEqual({ x: 100, y: 50 });
    expect(pointAlong(line, 2)).toEqual({ x: 100, y: 100 });
    const n = nearestAlong(line, { x: 130, y: 60 });
    expect(n.t).toBeCloseTo(0.8);
    expect(n.point).toEqual({ x: 100, y: 60 });
    expect(n.distance).toBe(30);
  });

  it('stores label positions rounded, and the middle as absent', () => {
    expect(storedLabelPosition(0.12345)).toBe(0.123);
    expect(storedLabelPosition(0.5)).toBeUndefined();
    expect(storedLabelPosition(-1)).toBe(0);
    expect(storedLabelPosition(3)).toBe(1);
  });

  it('puts "add a bend" handles in the middle of each stretch, away from the label', () => {
    const legs = [
      [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
      [
        { x: 100, y: 0 },
        { x: 100, y: 100 },
      ],
    ];
    expect(insertHandles(legs, null)).toEqual([
      { x: 50, y: 0 },
      { x: 100, y: 50 },
    ]);
    expect(insertHandles(legs, { x: 52, y: 2 })[0]).toEqual({ x: 25, y: 0 });
  });
});

describe('connectorGeometry', () => {
  const a: Rect = { x: 0, y: 0, width: 100, height: 60 };
  const b: Rect = { x: 300, y: 200, width: 100, height: 60 };
  const ends = (port?: 'perimeter') => ({
    source: { box: a, kind: 'rectangle', handle: handleEnd(a, 'r'), port },
    target: { box: b, kind: 'rectangle', handle: handleEnd(b, 'l'), port },
  });

  it('draws a connector without schema-3 fields exactly as the line type does', () => {
    const g = connectorGeometry({ type: 'smoothstep', ...ends(), pathFn: smoothstep });
    const [path, lx, ly] = getSmoothStepPath({ sourceX: 105, sourceY: 30, targetX: 295, targetY: 230, sourcePosition: Position.Right, targetPosition: Position.Left });
    expect(g.path).toBe(path);
    expect([g.labelX, g.labelY]).toEqual([lx, ly]);
  });

  it('puts the label at its position along the line', () => {
    const g = connectorGeometry({ type: 'straight', ...ends(), labelPosition: 0, pathFn: (x) => getStraightPath(x).slice(0, 3) as [string, number, number] });
    expect([g.labelX, g.labelY]).toEqual([105, 30]);
    const h = connectorGeometry({ type: 'straight', ...ends(), labelPosition: 1, pathFn: (x) => getStraightPath(x).slice(0, 3) as [string, number, number] });
    expect([h.labelX, h.labelY]).toEqual([295, 230]);
  });

  it('routes through bend points from floating ends, with one leg per stretch', () => {
    const g = connectorGeometry({ type: 'step', ...ends('perimeter'), waypoints: [{ x: 200, y: 30 }], pathFn: smoothstep });
    expect(g.legs).toHaveLength(2);
    expect(g.source).toMatchObject({ x: 100, y: 30, position: Position.Right });
    expect(g.target.position).toBe(Position.Top);
    expect(g.target).toMatchObject({ x: 327.5, y: 200 }); // towards the bend, through the top
    expect(g.path.startsWith('M100,30')).toBe(true);
  });
});
