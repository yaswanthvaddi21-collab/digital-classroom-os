import type { ShapePreset } from '../types';

/**
 * SVG path data for each preset shape in a w × h box, following the PPTX preset geometry outlines with their default
 * adjustments (so a shape looks the same here as in PowerPoint and Keynote). Pure; used by the slide renderer,
 * thumbnails and, later, the PDF export.
 */
export function shapePath(preset: ShapePreset, w: number, h: number): string {
  const p = (pts: Array<[number, number]>) => `M${pts.map(([x, y]) => `${r(x)},${r(y)}`).join(' L')} Z`;
  const ss = Math.min(w, h);
  switch (preset) {
    case 'rect':
      return p([[0, 0], [w, 0], [w, h], [0, h]]);
    case 'roundRect': {
      const k = ss * 0.16667;
      return `M${r(k)},0 H${r(w - k)} A${r(k)},${r(k)} 0 0 1 ${r(w)},${r(k)} V${r(h - k)} A${r(k)},${r(k)} 0 0 1 ${r(w - k)},${r(h)} H${r(k)} A${r(k)},${r(k)} 0 0 1 0,${r(h - k)} V${r(k)} A${r(k)},${r(k)} 0 0 1 ${r(k)},0 Z`;
    }
    case 'ellipse':
      return `M0,${r(h / 2)} A${r(w / 2)},${r(h / 2)} 0 1 1 ${r(w)},${r(h / 2)} A${r(w / 2)},${r(h / 2)} 0 1 1 0,${r(h / 2)} Z`;
    case 'triangle':
      return p([[w / 2, 0], [w, h], [0, h]]);
    case 'rtTriangle':
      return p([[0, 0], [w, h], [0, h]]);
    case 'diamond':
      return p([[w / 2, 0], [w, h / 2], [w / 2, h], [0, h / 2]]);
    case 'parallelogram': {
      const k = ss * 0.25;
      return p([[k, 0], [w, 0], [w - k, h], [0, h]]);
    }
    case 'trapezoid': {
      const k = ss * 0.25;
      return p([[k, 0], [w - k, 0], [w, h], [0, h]]);
    }
    case 'pentagon':
      return p([[w / 2, 0], [w, h * 0.382], [w * 0.809, h], [w * 0.191, h], [0, h * 0.382]]);
    case 'hexagon': {
      const k = ss * 0.25;
      return p([[k, 0], [w - k, 0], [w, h / 2], [w - k, h], [k, h], [0, h / 2]]);
    }
    case 'octagon': {
      const k = ss * 0.29289;
      return p([[k, 0], [w - k, 0], [w, k], [w, h - k], [w - k, h], [k, h], [0, h - k], [0, k]]);
    }
    case 'chevron': {
      const k = ss * 0.5;
      return p([[0, 0], [w - k, 0], [w, h / 2], [w - k, h], [0, h], [k, h / 2]]);
    }
    case 'rightArrow': {
      const head = Math.min(w, ss * 0.5);
      return p([[0, h * 0.25], [w - head, h * 0.25], [w - head, 0], [w, h / 2], [w - head, h], [w - head, h * 0.75], [0, h * 0.75]]);
    }
    case 'leftArrow': {
      const head = Math.min(w, ss * 0.5);
      return p([[w, h * 0.25], [head, h * 0.25], [head, 0], [0, h / 2], [head, h], [head, h * 0.75], [w, h * 0.75]]);
    }
    case 'upArrow': {
      const head = Math.min(h, ss * 0.5);
      return p([[w * 0.25, h], [w * 0.25, head], [0, head], [w / 2, 0], [w, head], [w * 0.75, head], [w * 0.75, h]]);
    }
    case 'downArrow': {
      const head = Math.min(h, ss * 0.5);
      return p([[w * 0.25, 0], [w * 0.25, h - head], [0, h - head], [w / 2, h], [w, h - head], [w * 0.75, h - head], [w * 0.75, 0]]);
    }
    case 'leftRightArrow': {
      const head = Math.min(w / 2, ss * 0.5);
      return p([[0, h / 2], [head, 0], [head, h * 0.25], [w - head, h * 0.25], [w - head, 0], [w, h / 2], [w - head, h], [w - head, h * 0.75], [head, h * 0.75], [head, h]]);
    }
    case 'line':
      return `M0,0 L${r(w)},${r(h)}`;
    case 'star5': {
      const pts: Array<[number, number]> = [];
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const rad = i % 2 ? 0.382 : 1;
        pts.push([w / 2 + (w / 2) * rad * Math.cos(a), h / 2 + (h / 2) * rad * Math.sin(a) * 1.05 + h * 0.025]);
      }
      return p(pts);
    }
    case 'plus': {
      const k = ss * 0.25;
      return p([[k, 0], [w - k, 0], [w - k, k], [w, k], [w, h - k], [w - k, h - k], [w - k, h], [k, h], [k, h - k], [0, h - k], [0, k], [k, k]]);
    }
    case 'heart':
      return `M${r(w / 2)},${r(h * 0.25)} C${r(w * 0.5)},${r(-h * 0.05)} ${r(-w * 0.15)},${r(h * 0.05)} ${r(w * 0.08)},${r(h * 0.45)} L${r(w / 2)},${r(h)} L${r(w * 0.92)},${r(h * 0.45)} C${r(w * 1.15)},${r(h * 0.05)} ${r(w * 0.5)},${r(-h * 0.05)} ${r(w / 2)},${r(h * 0.25)} Z`;
    case 'wedgeRectCallout':
      return p([[0, 0], [w, 0], [w, h * 0.8], [w * 0.4, h * 0.8], [w * 0.2, h], [w * 0.25, h * 0.8], [0, h * 0.8]]);
    case 'wedgeRoundRectCallout': {
      const bh = h * 0.8;
      const k = Math.min(w, bh) * 0.16667;
      return `M${r(k)},0 H${r(w - k)} A${r(k)},${r(k)} 0 0 1 ${r(w)},${r(k)} V${r(bh - k)} A${r(k)},${r(k)} 0 0 1 ${r(w - k)},${r(bh)} H${r(w * 0.4)} L${r(w * 0.2)},${r(h)} L${r(w * 0.25)},${r(bh)} H${r(k)} A${r(k)},${r(k)} 0 0 1 0,${r(bh - k)} V${r(k)} A${r(k)},${r(k)} 0 0 1 ${r(k)},0 Z`;
    }
  }
}

/** Whether a preset is an open line (stroked only, never filled, no text). */
export const isLinePreset = (preset: ShapePreset) => preset === 'line';

/** The box inside a shape where its text goes (insets for shapes whose outline is far from the box). */
export function shapeTextBox(preset: ShapePreset, w: number, h: number): { x: number; y: number; w: number; h: number } {
  switch (preset) {
    case 'ellipse':
      return { x: w * 0.146, y: h * 0.146, w: w * 0.708, h: h * 0.708 };
    case 'triangle':
      return { x: w * 0.25, y: h * 0.5, w: w * 0.5, h: h * 0.5 };
    case 'diamond':
      return { x: w * 0.25, y: h * 0.25, w: w * 0.5, h: h * 0.5 };
    case 'wedgeRectCallout':
    case 'wedgeRoundRectCallout':
      return { x: 0, y: 0, w, h: h * 0.8 };
    default:
      return { x: 0, y: 0, w, h };
  }
}

const r = (v: number) => Math.round(v * 100) / 100;
