import type { ReactNode } from 'react';
import { LIBRARY_RENDERERS } from './library/renderers';
import { SHAPE_DEFS, shapeDef } from './shapeRegistry';
import { imageShapeSvg, shapeOpacity } from './shapePresentation';
import type { ShapeData, ShapeKind } from './types';

/** The shape library, in order: every registered kind that has a catalog entry. */
export const SHAPE_CATALOG: Array<{ shape: ShapeKind; name: string; hint: string }> = SHAPE_DEFS.filter((d) => d.catalog).map((d) => ({
  shape: d.kind,
  name: d.catalog!.name,
  hint: d.catalog!.hint,
}));

/** Starting text for shapes whose label has structure. */
export const DEFAULT_LABELS: Partial<Record<ShapeKind, string>> = Object.fromEntries(SHAPE_DEFS.filter((d) => d.defaultLabel !== undefined).map((d) => [d.kind, d.defaultLabel]));

/** What a shape renderer gets: the size in pixels, the stroke inset and the common SVG paint attributes. */
export interface ShapeGeometry {
  w: number;
  h: number;
  /** Half the stroke width plus half a pixel: draw this far inside the box so the outline is not clipped. */
  i: number;
  common: { fill: string; stroke: string; strokeWidth: number; strokeDasharray: string | undefined; strokeLinejoin: 'round' };
  /** The shape's data, for kinds drawn from more than the common paint (an image shape's picture). Optional. */
  data?: ShapeData;
}

/**
 * Draws one shape kind as plain SVG elements in pixel coordinates (no HTML), so the same renderer serves the canvas
 * and a vector SVG export.
 */
export type ShapeRenderer = (g: ShapeGeometry) => ReactNode;

const rect: ShapeRenderer = ({ w, h, i, common }) => <rect x={i} y={i} width={w - 2 * i} height={h - 2 * i} rx={2} {...common} />;
const ellipse: ShapeRenderer = ({ w, h, i, common }) => <ellipse cx={w / 2} cy={h / 2} rx={w / 2 - i} ry={h / 2 - i} {...common} />;

export const SHAPE_RENDERERS: Partial<Record<ShapeKind, ShapeRenderer>> = {
  rectangle: rect,
  rounded: ({ w, h, i, common }) => <rect x={i} y={i} width={w - 2 * i} height={h - 2 * i} rx={Math.min(14, h / 4)} {...common} />,
  ellipse,
  circle: ellipse,
  diamond: ({ w, h, i, common }) => <polygon points={`${w / 2},${i} ${w - i},${h / 2} ${w / 2},${h - i} ${i},${h / 2}`} {...common} />,
  parallelogram: ({ w, h, i, common }) => {
    const o = Math.min(w * 0.18, 32);
    return <polygon points={`${o},${i} ${w - i},${i} ${w - o},${h - i} ${i},${h - i}`} {...common} />;
  },
  hexagon: ({ w, h, i, common }) => {
    const o = Math.min(w * 0.18, h / 2);
    return <polygon points={`${o},${i} ${w - o},${i} ${w - i},${h / 2} ${w - o},${h - i} ${o},${h - i} ${i},${h / 2}`} {...common} />;
  },
  triangle: ({ w, h, i, common }) => <polygon points={`${w / 2},${i} ${w - i},${h - i} ${i},${h - i}`} {...common} />,
  cylinder: ({ w, h, i, common }) => {
    const rx = w / 2 - i;
    const ry = Math.min(14, h / 6);
    return (
      <>
        <path d={`M${i},${ry + i} A${rx},${ry} 0 0 1 ${w - i},${ry + i} V${h - ry - i} A${rx},${ry} 0 0 1 ${i},${h - ry - i} Z`} {...common} />
        <path d={`M${i},${ry + i} A${rx},${ry} 0 0 0 ${w - i},${ry + i}`} {...common} fill="none" />
      </>
    );
  },
  document: ({ w, h, i, common }) => {
    const wave = Math.min(14, h * 0.15);
    return <path d={`M${i},${i} H${w - i} V${h - wave - i} C${w * 0.75},${h - 2.2 * wave} ${w * 0.25},${h + 0.6 * wave} ${i},${h - wave - i} Z`} {...common} />;
  },
  note: ({ w, h, i, common }) => {
    const f = Math.min(18, w / 5, h / 5);
    return (
      <>
        <path d={`M${i},${i} H${w - f - i} L${w - i},${f + i} V${h - i} H${i} Z`} {...common} />
        <path d={`M${w - f - i},${i} V${f + i} H${w - i}`} {...common} fill="none" />
      </>
    );
  },
  // Compartment dividers are drawn by the node body, which knows where the text lines fall.
  umlClass: ({ w, h, i, common }) => <rect x={i} y={i} width={w - 2 * i} height={h - 2 * i} rx={1} {...common} />,
  erEntity: ({ w, h, i, common }) => <rect x={i} y={i} width={w - 2 * i} height={h - 2 * i} rx={6} {...common} />,
  actor: ({ w, h, i, common }) => {
    const cx = w / 2;
    const head = Math.min(w, h) * 0.14;
    const top = i + 2;
    const neck = top + head * 2;
    const hip = neck + (h - 24) * 0.32;
    const foot = h - 26;
    const arms = neck + head * 0.8;
    return (
      <>
        <circle cx={cx} cy={top + head} r={head} {...common} />
        <path d={`M${cx},${neck} V${hip} M${cx - w * 0.32},${arms} H${cx + w * 0.32} M${cx},${hip} L${cx - w * 0.26},${foot} M${cx},${hip} L${cx + w * 0.26},${foot}`} {...common} fill="none" />
      </>
    );
  },
  package: ({ w, h, i, common }) => {
    const tabW = Math.min(w * 0.4, 70);
    const tabH = Math.min(18, h * 0.2);
    return (
      <>
        <rect x={i} y={i} width={tabW} height={tabH} {...common} />
        <rect x={i} y={tabH} width={w - 2 * i} height={h - tabH - i} {...common} />
      </>
    );
  },
  group: ({ w, h }) => <rect x={0} y={0} width={w} height={h} fill="transparent" stroke="none" />,
  image: ({ w, h, data }) => imageShapeSvg(data, w, h),
  // schema 3 (G-SHAPES): BPMN, UML, network and timeline shapes (library/renderers.tsx).
  ...LIBRARY_RENDERERS,
  // @phase5:shapes — renderers for new shape kinds.
};

/** A shape from a newer version: a visible placeholder rather than nothing. */
const placeholder: ShapeRenderer = ({ w, h, i }) => (
  <>
    <rect x={i} y={i} width={w - 2 * i} height={h - 2 * i} rx={6} fill="#f8fafc" stroke="#94a3b8" strokeWidth={1.5} strokeDasharray="5 4" />
    <text x={w / 2} y={14} textAnchor="middle" fontSize={10} fill="#64748b">
      unknown shape
    </text>
  </>
);

interface Props {
  shape: ShapeKind;
  width: number;
  height: number;
  fill: string;
  stroke: string;
  strokeWidth: number;
  dashed?: boolean;
  className?: string;
  /** The shape's data: its picture (image shapes) and opacity. Optional. */
  data?: ShapeData;
}

/** Draws a shape in real pixel coordinates so corners and curves never stretch when resized. */
export function ShapeSvg({ shape, width: w, height: h, fill, stroke, strokeWidth, dashed, className = 'dcos-shape-svg', data }: Props) {
  if (shape === 'text') return null;
  const i = strokeWidth / 2 + 0.5;
  const common = { fill, stroke, strokeWidth, strokeDasharray: dashed ? '6 5' : undefined, strokeLinejoin: 'round' as const };
  const el = (SHAPE_RENDERERS[shape] ?? placeholder)({ w, h, i, common, data });
  const opacity = shapeOpacity(data);
  return (
    <svg className={className} width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden style={opacity === undefined ? undefined : { opacity }}>
      {el}
    </svg>
  );
}

/** Text area inside a shape, inset so labels stay within diamonds, triangles and cylinders. */
export function labelInset(shape: ShapeKind): React.CSSProperties {
  return shapeDef(shape)?.labelInset ?? { inset: '6px 10px' };
}
