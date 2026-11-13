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
  { shape: 'umlClass', name: 'UML class', hint: 'Name, attributes, methods' },
  { shape: 'erEntity', name: 'ER entity', hint: 'Table and its fields' },
  { shape: 'actor', name: 'Actor', hint: 'User or role (use case)' },
  { shape: 'package', name: 'Package', hint: 'Group of classes or modules' },
];

/** Starting text for shapes whose label has structure. */
export const DEFAULT_LABELS: Partial<Record<ShapeKind, string>> = {
  umlClass: 'ClassName\n+ attribute: Type\n--\n+ method(): Type',
  erEntity: 'Entity\nPK id\nname\nFK other_id',
  actor: 'Actor',
  package: 'package',
};

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
    case 'umlClass':
    case 'erEntity':
      // Compartment dividers are drawn by the node body, which knows where the text lines fall.
      el = <rect x={i} y={i} width={w - 2 * i} height={h - 2 * i} rx={shape === 'erEntity' ? 6 : 1} {...common} />;
      break;
    case 'actor': {
      const cx = w / 2;
      const head = Math.min(w, h) * 0.14;
      const top = i + 2;
      const neck = top + head * 2;
      const hip = neck + (h - 24) * 0.32;
      const foot = h - 26;
      const arms = neck + head * 0.8;
      el = (
        <>
          <circle cx={cx} cy={top + head} r={head} {...common} />
          <path d={`M${cx},${neck} V${hip} M${cx - w * 0.32},${arms} H${cx + w * 0.32} M${cx},${hip} L${cx - w * 0.26},${foot} M${cx},${hip} L${cx + w * 0.26},${foot}`} {...common} fill="none" />
        </>
      );
      break;
    }
    case 'package': {
      const tabW = Math.min(w * 0.4, 70);
      const tabH = Math.min(18, h * 0.2);
      el = (
        <>
          <rect x={i} y={i} width={tabW} height={tabH} {...common} />
          <rect x={i} y={tabH} width={w - 2 * i} height={h - tabH - i} {...common} />
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
    case 'actor':
      return { inset: 'auto 0 0 0', height: 22, alignItems: 'flex-end' };
    case 'package':
      return { inset: '22% 8px 6px 8px' };
    case 'umlClass':
    case 'erEntity':
      return { inset: '0', alignItems: 'stretch', justifyContent: 'flex-start' };
    default:
      return { inset: '6px 10px' };
  }
}
