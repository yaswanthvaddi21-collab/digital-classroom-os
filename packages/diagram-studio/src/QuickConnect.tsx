import { NodeToolbar, Position, useReactFlow, ViewportPortal } from '@xyflow/react';
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { anchorPoint, DIRECTIONS, placeNew, type Box, type Direction } from './quickConnectGeometry';
import { SHAPE_CATALOG, ShapeSvg } from './shapes';
import { shapeDefaults, type ShapeKind, type ShapeNode } from './types';

const POSITION: Record<Direction, Position> = { top: Position.Top, right: Position.Right, bottom: Position.Bottom, left: Position.Left };
const LABEL: Record<Direction, string> = { top: 'above', right: 'to the right', bottom: 'below', left: 'to the left' };
const ROTATE: Record<Direction, number> = { top: -90, right: 0, bottom: 90, left: 180 };
/** Shapes offered in the quick palette, in diagrams.net's spirit: the common ones first. */
const PALETTE: ShapeKind[] = ['rounded', 'rectangle', 'ellipse', 'diamond', 'parallelogram', 'circle', 'hexagon', 'cylinder', 'document', 'note', 'triangle', 'text', 'umlClass', 'erEntity', 'actor'];
const DRAG_THRESHOLD = 5;
const PALETTE_W = 168;
const PALETTE_H = 104;

/**
 * Screen position for the palette beside its arrow. Rendered in a portal because the canvas clips its contents;
 * flips to the other side or slides along the edge so it always stays on screen.
 */
function palettePosition(dir: Direction, arrow: DOMRect): CSSProperties {
  const gap = 6;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let x: number;
  let y: number;
  if (dir === 'left' || dir === 'right') {
    x = dir === 'right' ? arrow.right + gap : arrow.left - gap - PALETTE_W;
    if (x + PALETTE_W > vw - 8) x = arrow.left - gap - PALETTE_W;
    if (x < 8) x = arrow.right + gap;
    y = arrow.top + arrow.height / 2 - PALETTE_H / 2;
  } else {
    y = dir === 'bottom' ? arrow.bottom + gap : arrow.top - gap - PALETTE_H;
    if (y + PALETTE_H > vh - 8) y = arrow.top - gap - PALETTE_H;
    if (y < 8) y = arrow.bottom + gap;
    x = arrow.left + arrow.width / 2 - PALETTE_W / 2;
  }
  return { position: 'fixed', left: Math.max(8, Math.min(x, vw - PALETTE_W - 8)), top: Math.max(8, Math.min(y, vh - PALETTE_H - 8)), width: PALETTE_W };
}

export interface QuickConnectProps {
  node: ShapeNode;
  nodes: ShapeNode[];
  /** Click (or Enter): new shape in that direction, connected. `shape` comes from the palette; otherwise a copy. */
  onCreate: (dir: Direction, shape?: ShapeKind) => void;
  /** Drag released over a shape (`targetId`) or over empty canvas (`at`, flow coordinates). */
  onDrop: (dir: Direction, targetId: string | null, at: { x: number; y: number }) => void;
}

const boxOf = (n: ShapeNode): Box => ({ id: n.id, x: n.position.x, y: n.position.y, width: n.width ?? n.measured?.width ?? 160, height: n.height ?? n.measured?.height ?? 70 });

function Arrow() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden>
      <path d="M4 10.2h9.2V5.5L21 12l-7.8 6.5v-4.7H4z" fill="currentColor" />
    </svg>
  );
}

/**
 * draw.io-style quick connect around the selected shape: four blue arrows (click to add a connected shape,
 * drag onto a shape to connect it), a shape palette on hover or focus, and a preview of what will happen.
 * Rendered with NodeToolbar, so arrows keep their size and follow the shape through zoom, pan, moves and resizes.
 */
export function QuickConnect({ node, nodes, onCreate, onDrop }: QuickConnectProps) {
  const rf = useReactFlow();
  const [hover, setHover] = useState<{ dir: Direction; shape?: ShapeKind } | null>(null);
  const [palette, setPalette] = useState<Direction | null>(null);
  const [drag, setDrag] = useState<{ dir: Direction; at: { x: number; y: number }; target: string | null } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressed = useRef<{ dir: Direction; x: number; y: number; moved: boolean } | null>(null);
  const arrows = useRef<Partial<Record<Direction, HTMLButtonElement | null>>>({});
  const refocusing = useRef(false);
  const [paletteStyle, setPaletteStyle] = useState<CSSProperties | null>(null);
  useLayoutEffect(() => {
    const el = palette ? arrows.current[palette] : null;
    setPaletteStyle(el && palette ? palettePosition(palette, el.getBoundingClientRect()) : null);
  }, [palette]);

  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);
  // Moving to another shape resets everything.
  useEffect(() => {
    setHover(null);
    setPalette(null);
    setDrag(null);
  }, [node.id]);

  const source = boxOf(node);
  const clearTimer = () => timer.current && clearTimeout(timer.current);
  const enter = (dir: Direction) => {
    clearTimer();
    setHover((h) => (h?.dir === dir ? h : { dir }));
    timer.current = setTimeout(() => setPalette(dir), 350);
  };
  const leave = () => {
    clearTimer();
    timer.current = setTimeout(() => {
      setHover(null);
      setPalette(null);
    }, 200);
  };

  const targetAt = (clientX: number, clientY: number) => {
    for (const el of document.elementsFromPoint(clientX, clientY)) {
      const n = (el as HTMLElement).closest?.('.react-flow__node');
      const id = n?.getAttribute('data-id');
      if (id && id !== node.id) return id;
    }
    return null;
  };

  const onPointerDown = (dir: Direction) => (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    pressed.current = { dir, x: e.clientX, y: e.clientY, moved: false };
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const p = pressed.current;
    if (!p) return;
    if (!p.moved && Math.hypot(e.clientX - p.x, e.clientY - p.y) < DRAG_THRESHOLD) return;
    p.moved = true;
    clearTimer();
    setPalette(null);
    setDrag({ dir: p.dir, at: rf.screenToFlowPosition({ x: e.clientX, y: e.clientY }), target: targetAt(e.clientX, e.clientY) });
  };
  const onPointerUp = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const p = pressed.current;
    pressed.current = null;
    if (!p) return;
    (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
    if (!p.moved) onCreate(p.dir);
    else onDrop(p.dir, targetAt(e.clientX, e.clientY), rf.screenToFlowPosition({ x: e.clientX, y: e.clientY }));
    setDrag(null);
    setHover(null);
  };

  // What the hovered arrow (or palette shape) would create, shown as a dashed outline.
  const ghost = (() => {
    if (!hover || drag) return null;
    const d = hover.shape ? shapeDefaults(hover.shape) : { width: source.width, height: source.height };
    const pos = placeNew(source, hover.dir, { width: d.width, height: d.height }, nodes.map(boxOf));
    return { ...pos, width: d.width, height: d.height };
  })();
  const targetBox = drag?.target ? nodes.find((n) => n.id === drag.target) : undefined;
  const from = drag ? anchorPoint(source, drag.dir) : null;

  return (
    <>
      {DIRECTIONS.map((dir) => (
        <NodeToolbar key={dir} nodeId={node.id} isVisible position={POSITION[dir]} offset={22} className={`dcos-qc dcos-qc-${dir}`}>
          <div className="dcos-qc-group" onPointerEnter={() => enter(dir)} onPointerLeave={leave}>
            <button
              ref={(el) => void (arrows.current[dir] = el)}
              type="button"
              className="dcos-qc-arrow nodrag nopan"
              aria-label={`Add a connected shape ${LABEL[dir]}`}
              title={`Click to add a connected shape ${LABEL[dir]}. Drag onto a shape to connect it.`}
              style={{ transform: `rotate(${ROTATE[dir]}deg)` }}
              onPointerDown={onPointerDown(dir)}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={() => ((pressed.current = null), setDrag(null))}
              onClick={(e) => {
                // Pointer clicks are handled in onPointerUp; this is the keyboard path (Enter / Space).
                if (e.detail === 0) onCreate(dir);
              }}
              onFocus={() => {
                // Focus coming back from Escape in the palette must not reopen it.
                if (refocusing.current) return void (refocusing.current = false);
                setHover({ dir });
                setPalette(dir);
              }}
              onKeyDown={(e) => {
                e.stopPropagation();
                // Only when there is something to close: otherwise Escape keeps its normal meaning (closing a dialog).
                if (e.key === 'Escape' && (palette || hover)) {
                  e.preventDefault();
                  setPalette(null);
                  setHover(null);
                }
              }}
            >
              <Arrow />
            </button>
            {palette === dir &&
              paletteStyle &&
              createPortal(
              <div
                role="menu"
                aria-label={`Shapes to add ${LABEL[dir]}`}
                className="dcos-qc-palette"
                style={paletteStyle}
                onPointerEnter={clearTimer}
                onPointerLeave={leave}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === 'Escape') {
                    e.preventDefault();
                    setPalette(null);
                    setHover(null);
                    refocusing.current = true;
                    arrows.current[dir]?.focus();
                    refocusing.current = false;
                  }
                }}
              >
                {PALETTE.map((shape) => {
                  const d = shapeDefaults(shape);
                  const name = SHAPE_CATALOG.find((s) => s.shape === shape)?.name ?? shape;
                  return (
                    <button
                      key={shape}
                      type="button"
                      role="menuitem"
                      aria-label={`Add ${name} ${LABEL[dir]}`}
                      title={name}
                      className="dcos-qc-shape"
                      onPointerEnter={() => setHover({ dir, shape })}
                      onFocus={() => setHover({ dir, shape })}
                      onClick={() => {
                        setPalette(null);
                        setHover(null);
                        onCreate(dir, shape);
                      }}
                    >
                      {shape === 'text' ? (
                        <span className="text-[11px] font-semibold">Aa</span>
                      ) : (
                        <ShapeSvg className="block overflow-visible" shape={shape} width={24} height={Math.max(12, Math.min(22, (d.height / d.width) * 24))} fill={d.fill} stroke={d.stroke} strokeWidth={1.2} />
                      )}
                    </button>
                  );
                })}
              </div>,
              document.body,
            )}
          </div>
        </NodeToolbar>
      ))}

      <ViewportPortal>
        {ghost && <div className="dcos-qc-ghost" style={{ transform: `translate(${ghost.x}px, ${ghost.y}px)`, width: ghost.width, height: ghost.height }} aria-hidden />}
        {drag && from && (
          <svg className="dcos-qc-preview" aria-hidden>
            {targetBox && (
              <rect x={targetBox.position.x - 4} y={targetBox.position.y - 4} width={(targetBox.width ?? 160) + 8} height={(targetBox.height ?? 70) + 8} rx="8" className="dcos-qc-target" />
            )}
            <line x1={from.x} y1={from.y} x2={drag.at.x} y2={drag.at.y} />
            <circle cx={drag.at.x} cy={drag.at.y} r="5" />
          </svg>
        )}
      </ViewportPortal>
    </>
  );
}
