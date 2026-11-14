import { Handle, NodeResizer, Position, type NodeProps } from '@xyflow/react';
import { createContext, memo, useContext, useEffect, useRef, useState } from 'react';
import { HANDLE_IDS, shapeDef, type HandleId } from './shapeRegistry';
import { labelBoxStyle, labelTextStyle, RotatedBody } from './shapePresentation';
import { labelInset, ShapeSvg } from './shapes';
import { COMPARTMENT_SHAPES, splitCompartments, type ShapeData, type ShapeNode as ShapeNodeType } from './types';

/** UML class / ER entity body: header band, then compartments separated by full-width dividers. */
function CompartmentBody({ data }: { data: ShapeData }) {
  const { header, sections } = splitCompartments(data.label);
  const er = data.shape === 'erEntity';
  const line = { borderTop: `${Math.max(1, data.strokeWidth)}px solid ${data.stroke}` };
  return (
    <div className="dcos-compartments" style={{ color: data.textColor, fontSize: data.fontSize }}>
      <div className="dcos-compartment-header" style={{ fontWeight: 700, background: er ? `${data.stroke}1a` : undefined }}>
        {header || <span className="dcos-label-placeholder">Name</span>}
      </div>
      {sections.map((rows, i) => (
        <div key={i} className="dcos-compartment" style={line}>
          {rows.map((row, j) => {
            const key = /^(PK|FK)\b/.exec(row.trim())?.[1];
            return (
              <div key={j} className="dcos-compartment-row" style={{ fontWeight: key === 'PK' ? 700 : 400, textDecoration: key === 'PK' ? 'underline' : undefined }}>
                {row || '\u00a0'}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

export interface DiagramActions {
  snapshot: () => void;
  updateNodeData: (id: string, patch: Partial<ShapeData>) => void;
  editingId: string | null;
  setEditingId: (id: string | null) => void;
  /** The diagram is protected (saved by a newer app version): no resizing or label editing. */
  readOnly: boolean;
}

export const DiagramActionsContext = createContext<DiagramActions | null>(null);
const useActions = () => useContext(DiagramActionsContext)!;

const HANDLE_POSITION: Record<HandleId, Position> = { t: Position.Top, r: Position.Right, b: Position.Bottom, l: Position.Left };
const HANDLES = HANDLE_IDS.map((id) => ({ id, position: HANDLE_POSITION[id] }));

function LabelEditor({ id, data, onDone }: { id: string; data: ShapeData; onDone: () => void }) {
  const { updateNodeData } = useActions();
  const [value, setValue] = useState(data.label);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  const commit = () => {
    if (value !== data.label) updateNodeData(id, { label: value });
    onDone();
  };
  return (
    <textarea
      ref={ref}
      aria-label="Shape text"
      className="nodrag nopan nowheel dcos-label-editor"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Escape') {
          // Inside a modal <dialog>, Escape's default action would close the whole dialog.
          e.preventDefault();
          onDone();
        }
        // Structured labels (UML, ER) are multi-line: Enter adds a line, Ctrl/⌘+Enter finishes.
        const multiline = COMPARTMENT_SHAPES.has(data.shape);
        if (e.key === 'Enter' && (multiline ? e.metaKey || e.ctrlKey : !e.shiftKey)) {
          e.preventDefault();
          commit();
        }
      }}
      style={{
        color: data.textColor,
        fontSize: data.fontSize,
        fontWeight: data.bold ? 700 : 500,
        ...(COMPARTMENT_SHAPES.has(data.shape) ? { textAlign: 'left', padding: 6, fontFamily: 'ui-monospace, Menlo, Consolas, monospace' } : {}),
      }}
    />
  );
}

export const ShapeNode = memo(function ShapeNode({ id, data, selected, width, height }: NodeProps<ShapeNodeType>) {
  const { snapshot, editingId, setEditingId, readOnly } = useActions();
  const editing = editingId === id && !readOnly;
  const w = width ?? 160;
  const h = height ?? 70;
  return (
    <div className="dcos-shape" style={{ width: w, height: h }}>
      <NodeResizer
        isVisible={selected && !editing && !readOnly}
        minWidth={40}
        minHeight={30}
        keepAspectRatio={!!shapeDef(data.shape)?.keepAspectRatio}
        onResizeStart={snapshot}
        lineClassName="dcos-resize-line"
        handleClassName="dcos-resize-handle"
      />
      {/* @phase5:drawio-render — `data` gives image shapes their picture and every shape its opacity; labelBoxStyle and
          labelTextStyle place and set the text, and RotatedBody turns the body, as diagrams.net files describe them
          (shapePresentation.tsx). */}
      <RotatedBody rotation={data.rotation}>
      <ShapeSvg shape={data.shape} width={w} height={h} fill={data.fill} stroke={data.stroke} strokeWidth={data.strokeWidth} dashed={data.dashed} data={data} />
      <div className="dcos-shape-label" style={{ ...labelInset(data.shape), ...labelBoxStyle(data) }}>
        {editing ? (
          <LabelEditor id={id} data={data} onDone={() => setEditingId(null)} />
        ) : COMPARTMENT_SHAPES.has(data.shape) ? (
          <CompartmentBody data={data} />
        ) : (
          <span style={{ color: data.textColor, fontSize: data.fontSize, fontWeight: data.bold ? 700 : 500, ...labelTextStyle(data) }}>
            {data.label || (selected ? <span className="dcos-label-placeholder">Double-click to type</span> : null)}
          </span>
        )}
      </div>
      </RotatedBody>
      {HANDLES.map((handle) => (
        <Handle key={handle.id} id={handle.id} type="source" position={handle.position} className="dcos-handle" />
      ))}
    </div>
  );
});
