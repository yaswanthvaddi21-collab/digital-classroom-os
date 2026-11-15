import { describe, expect, it } from 'vitest';
import { createPresentation } from '../create';
import { layoutIdFor } from '../layouts';
import { emptyRichText, type PresentationContent, type ShapeElement } from '../types';
import { alignElements, canReorder, distributeElements, reorderElements } from './arrange';

const shape = (id: string, x: number, y: number, w = 100, h = 50, extra: Partial<ShapeElement> = {}): ShapeElement => ({
  id,
  type: 'shape',
  x,
  y,
  w,
  h,
  rotation: 0,
  preset: 'rect',
  fill: { type: 'solid', color: '#cccccc' },
  line: null,
  ...extra,
});

function slideWith(...elements: ShapeElement[]): PresentationContent {
  const p = createPresentation('blank');
  p.slides = [{ id: 's', layoutId: layoutIdFor('blank'), elements, notes: emptyRichText() }];
  return p;
}
const ids = (p: PresentationContent) => p.slides[0].elements.map((e) => e.id);
const el = (p: PresentationContent, id: string) => p.slides[0].elements.find((e) => e.id === id)!;

describe('stacking order', () => {
  const p = slideWith(shape('a', 0, 0), shape('b', 0, 0), shape('c', 0, 0), shape('d', 0, 0));
  it('brings to front and sends to back, keeping the selection in its order', () => {
    expect(ids(reorderElements(p, 's', ['a', 'c'], 'front'))).toEqual(['b', 'd', 'a', 'c']);
    expect(ids(reorderElements(p, 's', ['b', 'd'], 'back'))).toEqual(['b', 'd', 'a', 'c']);
  });
  it('moves forward and backward past one unselected object', () => {
    expect(ids(reorderElements(p, 's', ['a'], 'forward'))).toEqual(['b', 'a', 'c', 'd']);
    expect(ids(reorderElements(p, 's', ['b', 'c'], 'forward'))).toEqual(['a', 'd', 'b', 'c']);
    expect(ids(reorderElements(p, 's', ['d'], 'backward'))).toEqual(['a', 'b', 'd', 'c']);
  });
  it('changes nothing at the ends, and says so', () => {
    expect(reorderElements(p, 's', ['d'], 'front')).toBe(p);
    expect(reorderElements(p, 's', ['a'], 'backward')).toBe(p);
    expect(reorderElements(p, 's', ['x'], 'front')).toBe(p);
    const els = p.slides[0].elements;
    expect(canReorder(els, ['d'], 'front')).toBe(false);
    expect(canReorder(els, ['d'], 'back')).toBe(true);
    expect(canReorder(els, ['a'], 'backward')).toBe(false);
    expect(canReorder(els, ['a', 'b'], 'back')).toBe(false);
    expect(canReorder(els, [], 'front')).toBe(false);
  });
});

describe('align', () => {
  it('aligns one object to the slide', () => {
    const p = slideWith(shape('a', 10, 10));
    expect(el(alignElements(p, 's', ['a'], 'center'), 'a')).toMatchObject({ x: 430 });
    expect(el(alignElements(p, 's', ['a'], 'right'), 'a')).toMatchObject({ x: 860 });
    expect(el(alignElements(p, 's', ['a'], 'middle'), 'a')).toMatchObject({ y: 245 });
    expect(el(alignElements(p, 's', ['a'], 'bottom'), 'a')).toMatchObject({ y: 490 });
  });
  it('aligns several objects to the box around them, by what is seen (rotated boxes), and never moves a locked one', () => {
    const p = slideWith(shape('a', 100, 100), shape('b', 300, 200, 100, 50, { rotation: 90 }), shape('c', 500, 50, 100, 50, { locked: true }));
    const left = alignElements(p, 's', ['a', 'b', 'c'], 'left');
    expect(el(left, 'a').x).toBe(100);
    // b turned 90° is 50 wide and 100 tall around its centre (350, 225): its visible left edge is at 325.
    expect(el(left, 'b').x).toBe(300 - 225);
    expect(el(left, 'c').x).toBe(500);
    const top = alignElements(p, 's', ['a', 'b', 'c'], 'top');
    expect(el(top, 'a').y).toBe(50);
    expect(el(top, 'b').y).toBe(200 - 125);
    expect(alignElements(p, 's', ['a', 'c'], 'top')).not.toBe(p);
    expect(alignElements(slideWith(shape('a', 430, 0)), 's', ['a'], 'center')).toEqual(slideWith(shape('a', 430, 0)));
  });
});

describe('distribute', () => {
  it('makes the gaps between three or more objects equal, the outer two staying put', () => {
    const p = slideWith(shape('a', 0, 0, 100), shape('c', 600, 0, 100), shape('b', 150, 0, 50));
    const next = distributeElements(p, 's', ['a', 'b', 'c'], 'horizontal');
    expect(el(next, 'a').x).toBe(0);
    expect(el(next, 'c').x).toBe(600);
    // (700 - 250) / 2 = 225 gap: b goes to 100 + 225.
    expect(el(next, 'b').x).toBe(325);
    const v = distributeElements(slideWith(shape('a', 0, 0, 10, 10), shape('b', 0, 15, 10, 10), shape('c', 0, 100, 10, 10)), 's', ['a', 'b', 'c'], 'vertical');
    expect(el(v, 'b').y).toBe(50);
  });
  it('leaves fewer than three objects alone', () => {
    const p = slideWith(shape('a', 0, 0), shape('b', 300, 0));
    expect(distributeElements(p, 's', ['a', 'b'], 'horizontal')).toBe(p);
  });
});
