import { useMemo } from 'react';
import type { ChartElement, PresentationTheme } from '../types';
import { layoutChart } from './chart';

/**
 * A chart drawn from its data (layoutChart), in slide pixels: used on the canvas, in thumbnails and in the slide show.
 * Decorative for assistive technology: the object's name on the canvas (and the alt text in exports) describes it.
 */
export function ChartSvg({ el, theme }: { el: ChartElement; theme: PresentationTheme }) {
  const g = useMemo(() => layoutChart(el, theme), [el, theme]);
  return (
    <svg width={g.width} height={g.height} viewBox={`0 0 ${g.width} ${g.height}`} aria-hidden="true" data-chart={el.chartType} style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible' }} fontFamily={g.fontFamily}>
      {g.items.map((p, i) => {
        switch (p.kind) {
          case 'rect':
            return <rect key={i} x={p.x} y={p.y} width={p.w} height={p.h} fill={p.fill} data-role={p.role} />;
          case 'line':
            return <line key={i} x1={p.x1} y1={p.y1} x2={p.x2} y2={p.y2} stroke={p.stroke} strokeWidth={p.width} data-role={p.role} />;
          case 'path':
            return <path key={i} d={p.d} fill={p.fill} stroke={p.stroke} strokeWidth={p.width} strokeLinejoin="round" data-role={p.role} />;
          case 'circle':
            return <circle key={i} cx={p.cx} cy={p.cy} r={p.r} fill={p.fill} stroke={p.stroke} strokeWidth={p.width} data-role={p.role} />;
          case 'text':
            return (
              <text key={i} x={p.x} y={p.y} fontSize={p.size} textAnchor={p.anchor} fill={p.fill} fontWeight={p.bold ? 700 : undefined} data-role={p.role}>
                {p.text}
              </text>
            );
        }
      })}
    </svg>
  );
}
