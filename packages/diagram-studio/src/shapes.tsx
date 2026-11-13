import type { ShapeKind } from './types';

export const SHAPE_CATALOG: Array<{ shape: ShapeKind; name: string; hint: string }> = [
  { shape: 'rounded', name: 'Process', hint: 'Step or action' },
  { shape: 'rectangle', name: 'Rectangle', hint: 'Box / tree node' },
  { shape: 'ellipse', name: 'Start / End', hint: 'Terminator' },
  { shape: 'diamond', name: 'Decision', hint: 'Yes / No branch' },
  { shape: 'parallelogram', name: 'Input / Output', hint: 'Data in or out' },
  { shape: 'circle', name: 'Circle', hint: 'Connector, Venn set' },
  { shape: 'hexagon', name: 'Preparation', hint: 'Setup step' },
  { shape: 'cylinder', name: 'Database', hint: 'Stored data' },
  { shape: 'document', name: 'Document', hint: 'Report or file' },
  { shape: 'triangle', name: 'Triangle', hint: 'Merge / extract' },
  { shape: 'note', name: 'Sticky note', hint: 'Comment' },
  { shape: 'text', name: 'Text', hint: 'Free label' },
];

interface Props {
  shape: ShapeKind;
  width: number;
  height: number;
  fill: string;
  stroke: string;
  strokeWidth: number;
  dashed?: boolean;
  className?: string;
}

/** Draws a shape in real pixel coordinates so corners and curves never stretch when resized. */
export function ShapeSvg({ shape, width: w, height: h, fill, stroke, strokeWidth, dashed, className = 'dcos-shape-svg' }: Props) {
  if (shape === 'text') return null;
  const i = strokeWidth / 2 + 0.5;
  const common = { fill, stroke, strokeWidth, strokeDasharray: dashed ? '6 5' : undefined, strokeLinejoin: 'round' as const };
  let el: React.ReactNode;
  switch (shape) {
    case 'rectangle':
      el = <rect x={i} y={i} width={w - 2 * i} height={h - 2 * i} rx={2} {...common} />;
      break;
    case 'rounded':
      el = <rect x={i} y={i} width={w - 2 * i} height={h - 2 * i} rx={Math.min(14, h / 4)} {...common} />;
      break;
    case 'ellipse':
    case 'circle':
      el = <ellipse cx={w / 2} cy={h / 2} rx={w / 2 - i} ry={h / 2 - i} {...common} />;
      break;
    case 'diamond':
      el = <polygon points={`${w / 2},${i} ${w - i},${h / 2} ${w / 2},${h - i} ${i},${h / 2}`} {...common} />;
      break;
    case 'parallelogram': {
      const o = Math.min(w * 0.18, 32);
      el = <polygon points={`${o},${i} ${w - i},${i} ${w - o},${h - i} ${i},${h - i}`} {...common} />;
      break;
    }
    case 'hexagon': {
      const o = Math.min(w * 0.18, h / 2);
      el = <polygon points={`${o},${i} ${w - o},${i} ${w - i},${h / 2} ${w - o},${h - i} ${o},${h - i} ${i},${h / 2}`} {...common} />;
      break;
    }
    case 'triangle':
      el = <polygon points={`${w / 2},${i} ${w - i},${h - i} ${i},${h - i}`} {...common} />;
      break;
    case 'cylinder': {
      const rx = w / 2 - i;
      const ry = Math.min(14, h / 6);
      el = (
        <>
          <path d={`M${i},${ry + i} A${rx},${ry} 0 0 1 ${w - i},${ry + i} V${h - ry - i} A${rx},${ry} 0 0 1 ${i},${h - ry - i} Z`} {...common} />
          <path d={`M${i},${ry + i} A${rx},${ry} 0 0 0 ${w - i},${ry + i}`} {...common} fill="none" />
        </>
      );
      break;
    }
    case 'document': {
      const wave = Math.min(14, h * 0.15);
      el = <path d={`M${i},${i} H${w - i} V${h - wave - i} C${w * 0.75},${h - 2.2 * wave} ${w * 0.25},${h + 0.6 * wave} ${i},${h - wave - i} Z`} {...common} />;
      break;
    }
    case 'note': {
      const f = Math.min(18, w / 5, h / 5);
      el = (
        <>
          <path d={`M${i},${i} H${w - f - i} L${w - i},${f + i} V${h - i} H${i} Z`} {...common} />
          <path d={`M${w - f - i},${i} V${f + i} H${w - i}`} {...common} fill="none" />
        </>
      );
      break;
    }
    default:
      // A shape from a newer version: draw a visible placeholder rather than nothing.
      el = (
        <>
          <rect x={i} y={i} width={w - 2 * i} height={h - 2 * i} rx={6} fill="#f8fafc" stroke="#94a3b8" strokeWidth={1.5} strokeDasharray="5 4" />
          <text x={w / 2} y={14} textAnchor="middle" fontSize={10} fill="#64748b">
            unknown shape
          </text>
        </>
      );
  }
  return (
    <svg className={className} width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden>
      {el}
    </svg>
  );
}

/** Text area inside a shape, inset so labels stay within diamonds, triangles and cylinders. */
export function labelInset(shape: ShapeKind): React.CSSProperties {
  switch (shape) {
    case 'diamond':
      return { inset: '22% 18%' };
    case 'triangle':
      return { inset: '40% 20% 6% 20%' };
    case 'parallelogram':
    case 'hexagon':
      return { inset: '4px 18%' };
    case 'cylinder':
      return { inset: '22% 8% 10% 8%' };
    case 'document':
      return { inset: '6px 8px 18% 8px' };
    case 'ellipse':
    case 'circle':
      return { inset: '12% 14%' };
    default:
      return { inset: '6px 10px' };
  }
}
