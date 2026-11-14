import type { CSSProperties, ReactNode } from 'react';
import type { ShapeData } from './types';

/*
 * How the diagrams.net presentation fields (shapeStyleFields.ts) are drawn: opacity, font family, text alignment and
 * the picture of an image shape. Plain values and SVG elements, so the canvas (ShapeNode / ShapeSvg) and a vector
 * export draw them the same way.
 */

/** Opacity of the shape's fill and outline as a CSS/SVG value (0..1), or undefined when opaque. Text stays opaque, as in diagrams.net. */
export function shapeOpacity(data: Pick<ShapeData, 'opacity'> | undefined): number | undefined {
  return data?.opacity === undefined ? undefined : data.opacity / 100;
}

const JUSTIFY = { left: 'flex-start', right: 'flex-end' } as const;
const ALIGN = { top: 'flex-start', bottom: 'flex-end' } as const;

/** Extra style for the label box of a shape: where the text sits. Empty for the defaults (centred, middle). */
export function labelBoxStyle(data: Pick<ShapeData, 'textAlign' | 'verticalAlign'>): CSSProperties {
  const s: CSSProperties = {};
  if (data.textAlign) {
    s.justifyContent = JUSTIFY[data.textAlign];
    s.textAlign = data.textAlign;
  }
  if (data.verticalAlign) s.alignItems = ALIGN[data.verticalAlign];
  return s;
}

/** Extra style for the text of a shape: the font family the file named (the device's fallback font if it is not installed). */
export function labelTextStyle(data: Pick<ShapeData, 'fontFamily'>): CSSProperties {
  return data.fontFamily ? { fontFamily: data.fontFamily } : {};
}

/** SVG text-anchor and the x position (in a box `w` wide, with padding `pad`) for a shape's text alignment. */
export function svgTextAnchor(data: Pick<ShapeData, 'textAlign'>, w: number, pad = 10): { anchor: 'start' | 'middle' | 'end'; x: number } {
  if (data.textAlign === 'left') return { anchor: 'start', x: pad };
  if (data.textAlign === 'right') return { anchor: 'end', x: w - pad };
  return { anchor: 'middle', x: w / 2 };
}

/**
 * The picture of an image shape as SVG, scaled into the box keeping its proportions (diagrams.net's default). Without
 * a picture (one the app could not keep), a dashed frame says so instead of drawing nothing.
 */
export function imageShapeSvg(data: Pick<ShapeData, 'image'> | undefined, w: number, h: number): ReactNode {
  if (data?.image) return <image href={data.image} x={0} y={0} width={w} height={h} preserveAspectRatio="xMidYMid meet" />;
  return (
    <>
      <rect x={1} y={1} width={Math.max(0, w - 2)} height={Math.max(0, h - 2)} rx={4} fill="#f8fafc" stroke="#94a3b8" strokeWidth={1.5} strokeDasharray="5 4" />
      <text x={w / 2} y={Math.min(h / 2, 18)} textAnchor="middle" fontSize={10} fill="#64748b">
        picture
      </text>
    </>
  );
}

/**
 * Draws a shape's body (outline and text) turned by its rotation about the centre, as diagrams.net draws a rotated
 * cell. Connection handles and resize handles stay on the unturned box, so connectors still attach at the box's sides.
 */
export function RotatedBody({ rotation, children }: { rotation: number | undefined; children: ReactNode }) {
  if (!rotation) return <>{children}</>;
  return (
    <div className="dcos-shape-rotated" style={{ position: 'absolute', inset: 0, transform: `rotate(${rotation}deg)`, transformOrigin: '50% 50%' }}>
      {children}
    </div>
  );
}
