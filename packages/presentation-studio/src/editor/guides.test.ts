import { describe, expect, it } from 'vitest';
import { guidesFor, snapMove, snapResize, spacingFor } from './guides';

const SLIDE = { width: 960, height: 540 };

describe('snapMove', () => {
  it('snaps a box to the slide centre lines and draws them across the slide', () => {
    // A 100 × 50 box whose centre is 3 px right and 2 px below the slide centre (480, 270).
    const r = snapMove({ x: 433, y: 247, w: 100, h: 50 }, [], SLIDE, 6);
    expect([r.dx, r.dy]).toEqual([-3, -2]);
    expect(r.guides).toEqual(
      expect.arrayContaining([
        { axis: 'x', pos: 480, from: 0, to: 540 },
        { axis: 'y', pos: 270, from: 0, to: 960 },
      ]),
    );
  });

  it('snaps to the slide edges', () => {
    const r = snapMove({ x: 4, y: 535 - 50, w: 100, h: 50 }, [], SLIDE, 6);
    expect([r.dx, r.dy]).toEqual([-4, 5]);
  });

  it('does not snap beyond the threshold', () => {
    const r = snapMove({ x: 300, y: 100, w: 100, h: 50 }, [], SLIDE, 6);
    expect([r.dx, r.dy]).toEqual([0, 0]);
    expect(r.guides).toEqual([]);
  });

  it("snaps to another object's edges and centre, with a guide spanning both", () => {
    const other = { x: 600, y: 300, w: 200, h: 100 };
    // Left edge 4 px right of the other's left edge, far away vertically.
    const r = snapMove({ x: 604, y: 50, w: 80, h: 40 }, [other], SLIDE, 6);
    expect(r.dx).toBe(-4);
    expect(r.guides).toContainEqual({ axis: 'x', pos: 600, from: 50, to: 400 });
    // Centre to centre: 700.
    const c = snapMove({ x: 662, y: 50, w: 80, h: 40 }, [other], SLIDE, 6);
    expect(c.dx).toBe(-2);
    expect(c.guides.some((g) => g.axis === 'x' && g.pos === 700)).toBe(true);
    // Right edge to the other's left edge (touching).
    const t = snapMove({ x: 523, y: 310, w: 80, h: 40 }, [other], SLIDE, 6);
    expect(t.dx).toBe(-3);
  });

  it('takes the nearest line when several are within reach', () => {
    const r = snapMove({ x: 102, y: 0, w: 50, h: 50 }, [{ x: 100, y: 200, w: 10, h: 10 }, { x: 105, y: 300, w: 10, h: 10 }], SLIDE, 6);
    expect(r.dx).toBe(-2);
  });

  it('snaps to the same gap as two neighbours in the row and shows the equal gaps', () => {
    const a = { x: 100, y: 100, w: 100, h: 100 };
    const b = { x: 250, y: 100, w: 100, h: 100 }; // gap 50 after a
    // Moving box placed 47 px after b: snaps to a gap of 50 (not near any edge or centre line).
    const r = snapMove({ x: 397, y: 120, w: 60, h: 60 }, [a, b], SLIDE, 6);
    expect(r.dx).toBe(3);
    expect(r.spacing).toHaveLength(1);
    expect(r.spacing[0]).toMatchObject({ axis: 'x', gap: 50 });
    expect(r.spacing[0].segments.map((s) => [s.from, s.to])).toEqual([
      [200, 250],
      [350, 400],
    ]);
  });

  it('snaps to the middle between two neighbours', () => {
    const a = { x: 100, y: 100, w: 100, h: 100 };
    const b = { x: 500, y: 100, w: 100, h: 100 };
    // Room between them: 200…500; a 100 wide box fits centred at 300 (x = 300). Start 4 px off.
    const r = snapMove({ x: 304, y: 140, w: 100, h: 20 }, [a, b], SLIDE, 6);
    expect(r.dx).toBe(-4);
    expect(spacingFor({ x: 300, y: 140, w: 100, h: 20 }, [a, b])[0].segments.map((s) => [s.from, s.to])).toEqual([
      [200, 300],
      [400, 500],
    ]);
  });

  it('works the same way for columns (vertical spacing)', () => {
    const a = { x: 100, y: 10, w: 100, h: 50 };
    const b = { x: 100, y: 90, w: 100, h: 50 }; // gap 30
    const r = snapMove({ x: 120, y: 172, w: 40, h: 40 }, [a, b], SLIDE, 6);
    expect(r.dy).toBe(-2);
    expect(r.spacing.find((s) => s.axis === 'y')?.gap).toBe(30);
  });

  it('ignores objects outside the row for equal spacing', () => {
    const a = { x: 100, y: 400, w: 100, h: 100 };
    const b = { x: 250, y: 400, w: 100, h: 100 };
    expect(spacingFor({ x: 400, y: 100, w: 60, h: 60 }, [a, b])).toEqual([]);
  });
});

describe('guidesFor', () => {
  it('merges guides at one position into one line spanning all of them', () => {
    const g = guidesFor({ x: 100, y: 200, w: 50, h: 50 }, [{ x: 100, y: 0, w: 10, h: 10 }, { x: 100, y: 400, w: 10, h: 10 }], SLIDE);
    expect(g.filter((x) => x.axis === 'x' && x.pos === 100)).toEqual([{ axis: 'x', pos: 100, from: 0, to: 410 }]);
  });
});

describe('snapResize', () => {
  it('snaps only the edges being dragged', () => {
    const other = { x: 500, y: 0, w: 100, h: 100 };
    const r = snapResize({ x: 100, y: 100, w: 396, h: 100 }, { right: true }, [other], SLIDE, 6);
    expect(r.box).toEqual({ x: 100, y: 100, w: 400, h: 100 });
    expect(r.guides).toContainEqual({ axis: 'x', pos: 500, from: 0, to: 200 });
    const l = snapResize({ x: 3, y: 100, w: 100, h: 100 }, { left: true, top: true }, [], SLIDE, 6);
    expect(l.box).toEqual({ x: 0, y: 100, w: 103, h: 100 });
  });

  it('never snaps a box below its minimum size', () => {
    const r = snapResize({ x: 100, y: 100, w: 5, h: 5 }, { right: true }, [{ x: 100, y: 300, w: 10, h: 10 }], SLIDE, 6, 4);
    expect(r.box.w).toBeGreaterThanOrEqual(4);
  });
});
