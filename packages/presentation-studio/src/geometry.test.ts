import { describe, expect, it } from 'vitest';
import {
  boxCenter,
  boxFromPoints,
  clampBox,
  containsBox,
  containsPoint,
  emuToPx,
  fitPicture,
  fitScale,
  intersects,
  normalizeRotation,
  ptToPx,
  pxToEmu,
  pxToInches,
  pxToPt,
  resizeAroundCenter,
  rotatedBounds,
  rotatePoint,
  roundBox,
  unionBounds,
} from './geometry';
import { isLinePreset, shapePath, shapeTextBox } from './render/shapePaths';
import { SHAPE_PRESETS } from './types';

const close = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThan(1e-9);

describe('units', () => {
  it('converts pixels to EMU, inches and points (96 px = 1 in = 914400 EMU = 72 pt)', () => {
    expect(pxToEmu(96)).toBe(914400);
    expect(pxToEmu(960)).toBe(9144000);
    expect(pxToEmu(540)).toBe(5143500);
    expect(emuToPx(9525)).toBe(1);
    expect(pxToInches(960)).toBe(10);
    expect(pxToPt(96)).toBe(72);
    expect(ptToPx(72)).toBe(96);
  });
});

describe('boxes and rotation', () => {
  it('normalises rotation into 0–359', () => {
    expect(normalizeRotation(-90)).toBe(270);
    expect(normalizeRotation(720)).toBe(0);
    expect(normalizeRotation(NaN)).toBe(0);
  });

  it('rotates points clockwise on screen and gives the bounds of a rotated box', () => {
    const p = rotatePoint({ x: 10, y: 0 }, { x: 0, y: 0 }, 90);
    close(p.x, 0);
    close(p.y, 10);
    expect(rotatedBounds({ x: 0, y: 0, w: 100, h: 50 }, 0)).toEqual({ x: 0, y: 0, w: 100, h: 50 });
    const b = rotatedBounds({ x: 0, y: 0, w: 100, h: 50 }, 90);
    close(b.w, 50);
    close(b.h, 100);
    close(boxCenter(b).x, 50);
    close(boxCenter(b).y, 25);
  });

  it('unions, intersects and contains', () => {
    expect(unionBounds([])).toEqual({ x: 0, y: 0, w: 0, h: 0 });
    expect(unionBounds([{ x: 0, y: 0, w: 10, h: 10 }, { x: 20, y: 5, w: 10, h: 20 }])).toEqual({ x: 0, y: 0, w: 30, h: 25 });
    expect(intersects({ x: 0, y: 0, w: 10, h: 10 }, { x: 10, y: 0, w: 5, h: 5 })).toBe(false);
    expect(intersects({ x: 0, y: 0, w: 10, h: 10 }, { x: 9, y: 9, w: 5, h: 5 })).toBe(true);
    expect(containsBox({ x: 0, y: 0, w: 10, h: 10 }, { x: 2, y: 2, w: 8, h: 8 })).toBe(true);
    expect(containsPoint({ x: 0, y: 0, w: 10, h: 10 }, { x: 11, y: 0 })).toBe(false);
    expect(boxFromPoints({ x: 10, y: 10 }, { x: 0, y: 5 })).toEqual({ x: 0, y: 5, w: 10, h: 5 });
  });

  it('clamps, resizes around the centre and rounds', () => {
    expect(clampBox({ x: 950, y: -5, w: 20, h: 20 }, { x: 0, y: 0, w: 960, h: 540 })).toEqual({ x: 940, y: 0, w: 20, h: 20 });
    expect(clampBox({ x: 50, y: 50, w: 2000, h: 20 }, { x: 0, y: 0, w: 960, h: 540 })).toMatchObject({ x: 0 });
    expect(resizeAroundCenter({ x: 0, y: 0, w: 10, h: 10 }, 20, 4)).toEqual({ x: -5, y: 3, w: 20, h: 4 });
    expect(roundBox({ x: 0.4, y: 0.6, w: 1.5, h: 2.49 })).toEqual({ x: 0, y: 1, w: 2, h: 2 });
  });

  it('fits a slide into a frame, letterboxed and centred', () => {
    expect(fitScale({ width: 960, height: 540 }, { width: 480, height: 480 })).toEqual({ scale: 0.5, offsetX: 0, offsetY: 105 });
    expect(fitScale({ width: 960, height: 540 }, { width: 4000, height: 4000 }, 2).scale).toBe(2);
    expect(fitScale({ width: 960, height: 540 }, { width: -1, height: 10 }).scale).toBe(0);
  });

  it('fits pictures: contain, cover and stretch', () => {
    expect(fitPicture({ width: 200, height: 100 }, { w: 100, h: 100 }, 'contain')).toEqual({ x: 0, y: 25, w: 100, h: 50 });
    expect(fitPicture({ width: 200, height: 100 }, { w: 100, h: 100 }, 'cover')).toEqual({ x: -50, y: 0, w: 200, h: 100 });
    expect(fitPicture({ width: 200, height: 100 }, { w: 100, h: 100 }, 'stretch')).toEqual({ x: 0, y: 0, w: 100, h: 100 });
    expect(fitPicture({ width: 0, height: 0 }, { w: 30, h: 10 }, 'contain')).toEqual({ x: 0, y: 0, w: 30, h: 10 });
  });
});

describe('shape outlines', () => {
  it('every preset has an outline with only finite coordinates, and a text box inside its own box', () => {
    for (const preset of SHAPE_PRESETS) {
      const d = shapePath(preset, 120, 80);
      expect(d.length).toBeGreaterThan(5);
      expect(d).not.toMatch(/NaN|Infinity|undefined/);
      const tb = shapeTextBox(preset, 120, 80);
      expect(tb.x).toBeGreaterThanOrEqual(0);
      expect(tb.x + tb.w).toBeLessThanOrEqual(120);
      expect(tb.y + tb.h).toBeLessThanOrEqual(80);
    }
    expect(shapePath('line', 10, 0)).toBe('M0,0 L10,0');
    expect(isLinePreset('line')).toBe(true);
    expect(isLinePreset('rect')).toBe(false);
  });
});
