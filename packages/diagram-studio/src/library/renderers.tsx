import type { ReactNode } from 'react';
import type { ShapeGeometry, ShapeRenderer } from '../shapes';
import { ICON_LABEL, LANE_BAND, LIFELINE_HEAD, POOL_BAND, type LibraryShapeKind } from './kinds';

/*
 * Renderers for the Phase 5 library kinds. Like every entry of SHAPE_RENDERERS they draw plain SVG in pixel
 * coordinates, so the canvas and a vector SVG export share them. All artwork here is original: simple geometric
 * drawings, not copied from any other product's icons.
 */

const circle = ({ w, h, i, common }: ShapeGeometry, extra = 0) => <circle cx={w / 2} cy={h / 2} r={Math.max(1, Math.min(w, h) / 2 - i - extra)} {...common} />;

const diamond = ({ w, h, i, common }: ShapeGeometry) => <polygon points={`${w / 2},${i} ${w - i},${h / 2} ${w / 2},${h - i} ${i},${h / 2}`} {...common} />;

/** A pool or lane: the outline and the divider of its title band (narrower in small previews). */
const swimlane =
  (fullBand: number): ShapeRenderer =>
  ({ w, h, i, common }) => {
    const b = Math.min(fullBand, w * 0.08);
    return (
      <>
        <rect x={i} y={i} width={w - 2 * i} height={h - 2 * i} {...common} />
        <path d={`M${b},${i} V${h - i}`} {...common} fill="none" />
      </>
    );
  };

/** Marks drawn inside a gateway, in the stroke colour. */
const gatewayMark = (g: ShapeGeometry, mark: 'x' | 'plus' | 'circle'): ReactNode => {
  const { w, h, common } = g;
  const cx = w / 2;
  const cy = h / 2;
  const s = Math.min(w, h) * 0.17;
  const line = { stroke: common.stroke, strokeWidth: Math.max(2, common.strokeWidth * 1.5), strokeLinecap: 'round' as const, fill: 'none' };
  if (mark === 'x') return <path d={`M${cx - s},${cy - s} L${cx + s},${cy + s} M${cx + s},${cy - s} L${cx - s},${cy + s}`} {...line} />;
  if (mark === 'plus') return <path d={`M${cx},${cy - s * 1.25} V${cy + s * 1.25} M${cx - s * 1.25},${cy} H${cx + s * 1.25}`} {...line} />;
  return <circle cx={cx} cy={cy} r={s * 1.2} {...line} />;
};
const gateway =
  (mark: 'x' | 'plus' | 'circle'): ShapeRenderer =>
  (g) => (
    <>
      {diamond(g)}
      {gatewayMark(g, mark)}
    </>
  );

/**
 * A network icon: drawn in a square at the top of the box (0..100 units), with the label band below. `u` maps the
 * 0..100 icon units to pixels; strokes keep their real width at every size.
 */
type IconDraw = (u: (x: number, y: number) => string, s: (n: number) => number, g: ShapeGeometry) => ReactNode;
const netIcon =
  (draw: IconDraw): ShapeRenderer =>
  (g) => {
    const { w, h, i } = g;
    const labelBand = Math.min(ICON_LABEL, h * 0.24);
    const size = Math.max(4, Math.min(w, h - labelBand) - 2 * i);
    const ox = (w - size) / 2;
    const oy = i;
    const s = (n: number) => (n * size) / 100;
    const u = (x: number, y: number) => `${ox + s(x)},${oy + s(y)}`;
    return draw(u, s, g);
  };
/** Detail lines inside an icon: stroke colour, no fill. */
const detail = (g: ShapeGeometry) => ({ stroke: g.common.stroke, strokeWidth: Math.max(1, g.common.strokeWidth * 0.75), fill: 'none', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const });
const box = (u: (x: number, y: number) => string, x: number, y: number, w: number, h: number) => `M${u(x, y)} L${u(x + w, y)} L${u(x + w, y + h)} L${u(x, y + h)} Z`;

export const LIBRARY_RENDERERS: Record<LibraryShapeKind, ShapeRenderer> = {
  // ── BPMN ──────────────────────────────────────────────────────────────────────────────────────────
  bpmnPool: swimlane(POOL_BAND),
  bpmnLane: swimlane(LANE_BAND),
  bpmnStart: (g) => circle(g),
  bpmnIntermediate: (g) => (
    <>
      {circle(g)}
      {circle({ ...g, common: { ...g.common, fill: 'none' } }, Math.max(3, g.common.strokeWidth + 2))}
    </>
  ),
  bpmnEnd: (g) => circle(g),
  bpmnTask: ({ w, h, i, common }) => <rect x={i} y={i} width={w - 2 * i} height={h - 2 * i} rx={Math.min(12, h / 5)} {...common} />,
  bpmnSubprocess: ({ w, h, i, common }) => {
    const m = Math.min(14, h / 5);
    const x = w / 2 - m / 2;
    const y = h - i - m - 4;
    return (
      <>
        <rect x={i} y={i} width={w - 2 * i} height={h - 2 * i} rx={Math.min(12, h / 5)} {...common} />
        <rect x={x} y={y} width={m} height={m} fill="none" stroke={common.stroke} strokeWidth={Math.max(1, common.strokeWidth * 0.75)} />
        <path d={`M${w / 2},${y + 3} V${y + m - 3} M${x + 3},${y + m / 2} H${x + m - 3}`} stroke={common.stroke} strokeWidth={Math.max(1, common.strokeWidth * 0.75)} fill="none" />
      </>
    );
  },
  bpmnExclusive: gateway('x'),
  bpmnParallel: gateway('plus'),
  bpmnInclusive: gateway('circle'),
  bpmnDataObject: ({ w, h, i, common }) => {
    const f = Math.min(14, w / 3, h / 3);
    return (
      <>
        <path d={`M${i},${i} H${w - f - i} L${w - i},${f + i} V${h - i} H${i} Z`} {...common} />
        <path d={`M${w - f - i},${i} V${f + i} H${w - i}`} {...common} fill="none" />
      </>
    );
  },
  bpmnDataStore: ({ w, h, i, common }) => {
    const rx = w / 2 - i;
    const ry = Math.min(9, h / 7);
    const top = ry + i;
    return (
      <>
        <path d={`M${i},${top} A${rx},${ry} 0 0 1 ${w - i},${top} V${h - ry - i} A${rx},${ry} 0 0 1 ${i},${h - ry - i} Z`} {...common} />
        <path d={`M${i},${top} A${rx},${ry} 0 0 0 ${w - i},${top} M${i},${top + 6} A${rx},${ry} 0 0 0 ${w - i},${top + 6} M${i},${top + 12} A${rx},${ry} 0 0 0 ${w - i},${top + 12}`} {...common} fill="none" />
      </>
    );
  },
  // ── UML ───────────────────────────────────────────────────────────────────────────────────────────
  umlLifeline: ({ w, h, i, common }) => {
    const head = Math.min(LIFELINE_HEAD, h * 0.2);
    return (
      <>
        <path d={`M${w / 2},${head} V${h - i}`} stroke={common.stroke} strokeWidth={Math.max(1, common.strokeWidth * 0.75)} strokeDasharray="6 5" fill="none" />
        <rect x={i} y={i} width={w - 2 * i} height={head - i} rx={2} {...common} />
      </>
    );
  },
  umlActivation: ({ w, h, i, common }) => <rect x={i} y={i} width={w - 2 * i} height={h - 2 * i} {...common} />,
  umlInitial: (g) => circle(g),
  umlFinal: (g) => {
    const r = Math.min(g.w, g.h) / 2 - g.i;
    return (
      <>
        <circle cx={g.w / 2} cy={g.h / 2} r={Math.max(1, r)} fill="#ffffff" stroke={g.common.stroke} strokeWidth={Math.max(1.5, g.common.strokeWidth)} />
        <circle cx={g.w / 2} cy={g.h / 2} r={Math.max(1, r * 0.62)} fill={g.common.fill} stroke="none" />
      </>
    );
  },
  umlFork: ({ w, h, i, common }) => <rect x={i} y={i} width={Math.max(1, w - 2 * i)} height={Math.max(1, h - 2 * i)} rx={1} {...common} />,
  umlBoundary: ({ w, h, i, common }) => <rect x={i} y={i} width={w - 2 * i} height={h - 2 * i} {...common} />,
  // ── Network icons ─────────────────────────────────────────────────────────────────────────────────
  netServer: netIcon((u, _s, g) => (
    <>
      <path d={box(u, 28, 4, 44, 92)} {...g.common} />
      <path d={`M${u(36, 18)} L${u(64, 18)} M${u(36, 30)} L${u(64, 30)} M${u(36, 42)} L${u(64, 42)}`} {...detail(g)} />
      <path d={`M${u(36, 80)} L${u(46, 80)}`} {...detail(g)} />
      <path d={`M${u(58, 80)} L${u(60, 80)}`} {...detail(g)} strokeWidth={Math.max(3, g.common.strokeWidth * 2)} />
    </>
  )),
  netDesktop: netIcon((u, _s, g) => (
    <>
      <path d={box(u, 8, 8, 84, 58)} {...g.common} />
      <path d={box(u, 15, 15, 70, 44)} {...detail(g)} />
      <path d={`M${u(44, 66)} L${u(40, 84)} L${u(60, 84)} L${u(56, 66)}`} {...g.common} />
      <path d={`M${u(28, 90)} L${u(72, 90)}`} {...detail(g)} strokeWidth={Math.max(2, g.common.strokeWidth * 1.5)} />
    </>
  )),
  netLaptop: netIcon((u, _s, g) => (
    <>
      <path d={box(u, 18, 18, 64, 46)} {...g.common} />
      <path d={box(u, 24, 24, 52, 34)} {...detail(g)} />
      <path d={`M${u(6, 70)} L${u(94, 70)} L${u(86, 82)} L${u(14, 82)} Z`} {...g.common} />
    </>
  )),
  netRouter: netIcon((u, s, g) => (
    <>
      <path d={`M${u(8, 42)} A${s(42)},${s(14)} 0 0 1 ${u(92, 42)} L${u(92, 60)} A${s(42)},${s(14)} 0 0 1 ${u(8, 60)} Z`} {...g.common} />
      <path d={`M${u(8, 42)} A${s(42)},${s(14)} 0 0 0 ${u(92, 42)}`} {...detail(g)} />
      <path d={`M${u(30, 42)} L${u(70, 42)} M${u(64, 38)} L${u(70, 42)} L${u(64, 46)} M${u(36, 38)} L${u(30, 42)} L${u(36, 46)}`} {...detail(g)} />
    </>
  )),
  netSwitch: netIcon((u, _s, g) => (
    <>
      <path d={box(u, 4, 34, 92, 32)} {...g.common} />
      {[0, 1, 2, 3, 4, 5].map((k) => (
        <path key={k} d={box(u, 12 + k * 13, 50, 8, 8)} {...detail(g)} />
      ))}
      <path d={`M${u(12, 42)} L${u(36, 42)}`} {...detail(g)} />
    </>
  )),
  netFirewall: netIcon((u, _s, g) => (
    <>
      <path d={box(u, 8, 18, 84, 66)} {...g.common} />
      <path
        d={[
          `M${u(8, 40)} L${u(92, 40)}`,
          `M${u(8, 62)} L${u(92, 62)}`,
          `M${u(36, 18)} L${u(36, 40)}`,
          `M${u(64, 18)} L${u(64, 40)}`,
          `M${u(22, 40)} L${u(22, 62)}`,
          `M${u(50, 40)} L${u(50, 62)}`,
          `M${u(78, 40)} L${u(78, 62)}`,
          `M${u(36, 62)} L${u(36, 84)}`,
          `M${u(64, 62)} L${u(64, 84)}`,
        ].join(' ')}
        {...detail(g)}
      />
    </>
  )),
  netCloud: netIcon((u, _s, g) => (
    <path d={`M${u(26, 78)} C${u(8, 78)} ${u(6, 56)} ${u(22, 52)} C${u(20, 34)} ${u(42, 26)} ${u(52, 38)} C${u(60, 22)} ${u(86, 28)} ${u(82, 48)} C${u(98, 50)} ${u(96, 78)} ${u(76, 78)} Z`} {...g.common} />
  )),
  netDatabase: netIcon((u, s, g) => (
    <>
      <path d={`M${u(18, 20)} A${s(32)},${s(10)} 0 0 1 ${u(82, 20)} L${u(82, 80)} A${s(32)},${s(10)} 0 0 1 ${u(18, 80)} Z`} {...g.common} />
      <path d={`M${u(18, 20)} A${s(32)},${s(10)} 0 0 0 ${u(82, 20)} M${u(18, 40)} A${s(32)},${s(10)} 0 0 0 ${u(82, 40)} M${u(18, 60)} A${s(32)},${s(10)} 0 0 0 ${u(82, 60)}`} {...detail(g)} />
    </>
  )),
  netMobile: netIcon((u, _s, g) => (
    <>
      <path d={box(u, 30, 6, 40, 88)} {...g.common} />
      <path d={box(u, 35, 15, 30, 62)} {...detail(g)} />
      <path d={`M${u(46, 86)} L${u(54, 86)}`} {...detail(g)} />
    </>
  )),
  netPrinter: netIcon((u, _s, g) => (
    <>
      <path d={box(u, 28, 12, 44, 28)} {...g.common} />
      <path d={box(u, 10, 38, 80, 36)} {...g.common} />
      <path d={box(u, 28, 62, 44, 26)} {...g.common} />
      <path d={`M${u(36, 70)} L${u(64, 70)} M${u(36, 78)} L${u(56, 78)} M${u(76, 48)} L${u(80, 48)}`} {...detail(g)} />
    </>
  )),
  netAccessPoint: netIcon((u, s, g) => (
    <>
      <path d={box(u, 22, 64, 56, 22)} {...g.common} />
      <path d={`M${u(50, 64)} L${u(50, 44)}`} {...detail(g)} />
      <path d={`M${u(38, 38)} A${s(14)},${s(14)} 0 0 1 ${u(62, 38)} M${u(28, 28)} A${s(26)},${s(26)} 0 0 1 ${u(72, 28)} M${u(18, 18)} A${s(38)},${s(38)} 0 0 1 ${u(82, 18)}`} {...detail(g)} />
      <path d={`M${u(32, 75)} L${u(34, 75)} M${u(42, 75)} L${u(44, 75)}`} {...detail(g)} strokeWidth={Math.max(3, g.common.strokeWidth * 1.5)} />
    </>
  )),
  // ── Timelines ─────────────────────────────────────────────────────────────────────────────────────
  timelineDate: ({ w, h, i, common }) => <rect x={i} y={i} width={w - 2 * i} height={h - 2 * i} rx={(h - 2 * i) / 2} {...common} />,
};
