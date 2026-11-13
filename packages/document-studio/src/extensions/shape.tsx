import { mergeAttributes, Node } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer, type ReactNodeViewProps } from '@tiptap/react';
import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { NodeSelection } from '@tiptap/pm/state';
import { blockInsertPos, findInserted } from './objectCommands';
import { safeNumber } from './objectAttrs';
import { newShapeAttrs, readShape, SHAPE_DEFAULTS, SHAPE_MAX, SHAPE_MIN, shapeLabel, shapeSvg, svgDataUrl, type ShapeKind } from './shapeModel';

export * from './shapeModel';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    shape: {
      /** Inserts a shape of this kind (after the selection when something is selected) and selects it. */
      insertShape: (kind: ShapeKind) => ReturnType;
    };
  }
}

function ShapeView({ node, selected, updateAttributes, editor, getPos }: ReactNodeViewProps) {
  const s = readShape(node.attrs);
  const [drag, setDrag] = useState<{ width: number; height: number } | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const width = drag?.width ?? s.width;
  const height = drag?.height ?? s.height;
  const svg = shapeSvg({ ...node.attrs, width, height });

  const startResize = (e: ReactPointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const [x0, y0, w0, h0] = [e.clientX, e.clientY, s.width, s.height];
    const maxW = Math.max(SHAPE_MIN, box.current?.parentElement?.clientWidth ?? SHAPE_MAX);
    const size = (ev: PointerEvent) => ({
      width: Math.round(Math.min(maxW, Math.max(SHAPE_MIN, w0 + ev.clientX - x0))),
      height: Math.round(Math.min(SHAPE_MAX, Math.max(SHAPE_MIN, h0 + ev.clientY - y0))),
    });
    const move = (ev: PointerEvent) => setDrag(size(ev));
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setDrag(null);
      updateAttributes(size(ev));
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  return (
    <NodeViewWrapper className={`dcos-shape${selected ? ' is-selected' : ''}`} data-type="shape" data-align={s.align} data-drag-handle="">
      <div
        ref={box}
        className="dcos-shape-box"
        role="img"
        aria-label={shapeLabel(node.attrs)}
        style={{ width, height }}
        // Select the shape as a whole, so the shape tools apply to it.
        onMouseDown={(e) => {
          if (e.button !== 0 || (e.target as HTMLElement).classList.contains('dcos-shape-handle')) return;
          const pos = getPos();
          if (typeof pos === 'number') editor.commands.setNodeSelection(pos);
        }}
      >
        <span className="dcos-shape-svg" dangerouslySetInnerHTML={{ __html: svg }} />
        {selected && editor.isEditable && <span className="dcos-shape-handle" data-resize-handle="" onPointerDown={startResize} aria-hidden />}
      </div>
    </NodeViewWrapper>
  );
}

const SHAPE_ATTRS = ['kind', 'width', 'height', 'fill', 'stroke', 'strokeWidth', 'text', 'align'] as const;
const dataName = (k: string) => `data-${k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;

/**
 * A drawn shape (rectangle, rounded rectangle, ellipse, line, arrow or callout) with fill, outline, an optional text
 * label and a size; resized with the handle or from the shape tools. Exported to Word as a picture of the shape.
 */
export const Shape = Node.create({
  name: 'shape',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    // Every attribute travels through copy and paste as a data-* attribute (numbers are read back as numbers).
    const numeric = new Set(['width', 'height', 'strokeWidth']);
    return Object.fromEntries(
      SHAPE_ATTRS.map((k) => [
        k,
        {
          default: SHAPE_DEFAULTS[k],
          parseHTML: (el: HTMLElement) => {
            const v = el.getAttribute(dataName(k));
            if (v === null) return SHAPE_DEFAULTS[k];
            return numeric.has(k) ? safeNumber(v, k === 'strokeWidth' ? 0 : SHAPE_MIN, k === 'strokeWidth' ? 12 : SHAPE_MAX, SHAPE_DEFAULTS[k] as number) : v;
          },
          renderHTML: (attrs: Record<string, unknown>) => ({ [dataName(k)]: String(attrs[k] ?? '') }),
        },
      ]),
    );
  },

  parseHTML() {
    return [{ tag: 'div[data-type="shape"]' }];
  },

  renderHTML({ HTMLAttributes, node }) {
    // A picture of the shape inside, so other applications show it when it is pasted there.
    const s = readShape(node.attrs);
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'shape' }), ['img', { src: svgDataUrl(shapeSvg(node.attrs)), alt: shapeLabel(node.attrs), width: String(s.width), height: String(s.height) }]];
  },

  renderText({ node }) {
    // As plain text (the clipboard's text/plain), as in the TXT export.
    return `\n[Shape: ${shapeLabel(node.attrs)}]\n`;
  },

  addNodeView() {
    return ReactNodeViewRenderer(ShapeView);
  },

  addCommands() {
    return {
      insertShape:
        (kind) =>
        ({ state, chain }) => {
          // After the selection or the cursor's paragraph (never splitting its text, nor replacing a selected object).
          const at = blockInsertPos(state);
          let first = 0;
          return chain()
            .command(({ tr }) => {
              first = tr.steps.length;
              return true;
            })
            .insertContentAt(at, { type: this.name, attrs: newShapeAttrs(kind) })
            .command(({ tr }) => {
              // Select the new shape, so its tools show at once.
              const pos = findInserted(tr, first, this.name);
              if (pos >= 0) tr.setSelection(NodeSelection.create(tr.doc, pos));
              return true;
            })
            .run();
        },
    };
  },
});
