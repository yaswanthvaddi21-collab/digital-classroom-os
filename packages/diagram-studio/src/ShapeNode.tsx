import { Handle, NodeResizer, Position, type NodeProps } from '@xyflow/react';
import { createContext, memo, useContext, useEffect, useRef, useState } from 'react';
import { labelInset, ShapeSvg } from './shapes';
import type { ShapeData, ShapeNode as ShapeNodeType } from './types';

export interface DiagramActions {
  snapshot: () => void;
  updateNodeData: (id: string, patch: Partial<ShapeData>) => void;
  editingId: string | null;
  setEditingId: (id: string | null) => void;
}

export const DiagramActionsContext = createContext<DiagramActions | null>(null);
const useActions = () => useContext(DiagramActionsContext)!;

const HANDLES = [
  { id: 't', position: Position.Top },
  { id: 'r', position: Position.Right },
  { id: 'b', position: Position.Bottom },
  { id: 'l', position: Position.Left },
];

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
        if (e.key === 'Escape') onDone();
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          commit();
        }
      }}
      style={{ color: data.textColor, fontSize: data.fontSize, fontWeight: data.bold ? 700 : 500 }}
    />
  );
}

export const ShapeNode = memo(function ShapeNode({ id, data, selected, width, height }: NodeProps<ShapeNodeType>) {
  const { snapshot, editingId, setEditingId } = useActions();
  const editing = editingId === id;
  const w = width ?? 160;
  const h = height ?? 70;
  return (
    <div className="dcos-shape" style={{ width: w, height: h }}>
      <NodeResizer
        isVisible={selected && !editing}
        minWidth={40}
        minHeight={30}
        keepAspectRatio={data.shape === 'circle'}
        onResizeStart={snapshot}
        lineClassName="dcos-resize-line"
        handleClassName="dcos-resize-handle"
      />
      <ShapeSvg shape={data.shape} width={w} height={h} fill={data.fill} stroke={data.stroke} strokeWidth={data.strokeWidth} dashed={data.dashed} />
      <div className="dcos-shape-label" style={labelInset(data.shape)}>
        {editing ? (
          <LabelEditor id={id} data={data} onDone={() => setEditingId(null)} />
        ) : (
          <span style={{ color: data.textColor, fontSize: data.fontSize, fontWeight: data.bold ? 700 : 500 }}>
            {data.label || (selected ? <span className="dcos-label-placeholder">Double-click to type</span> : null)}
          </span>
        )}
      </div>
      {HANDLES.map((handle) => (
        <Handle key={handle.id} id={handle.id} type="source" position={handle.position} className="dcos-handle" />
      ))}
    </div>
  );
});
