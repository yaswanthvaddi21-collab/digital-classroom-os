import { Button, cn, downloadBlob, IconButton, Menu, safeFileName, Separator, useToast } from '@dcos/ui';
import {
  addEdge,
  Background,
  BackgroundVariant,
  ConnectionLineType,
  ConnectionMode,
  Controls,
  MiniMap,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  reconnectEdge,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type NodeTypes,
  type Viewport,
} from '@xyflow/react';
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignStartHorizontal,
  AlignStartVertical,
  ChevronDown,
  Copy,
  CornerDownRight,
  Download,
  FileImage,
  FileJson,
  FileText,
  Grid3x3,
  Magnet,
  Maximize,
  Network,
  Plus,
  Redo2,
  ShieldAlert,
  Trash2,
  Undo2,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type DragEvent, type KeyboardEvent } from 'react';
import { diagramCss } from './diagramCss';
import { exportPdf, exportPng, exportSvg } from './export';
import { UndoStack } from './history';
import { EdgeInspector, NodeInspector, type EdgePatch, type PatchOpts } from './Inspector';
import { layoutTree, type LayoutDirection } from './layout';
import { DiagramActionsContext, ShapeNode as ShapeNodeView, type DiagramActions } from './ShapeNode';
import { SHAPE_CATALOG, ShapeSvg } from './shapes';
import {
  DEFAULT_CONNECTOR,
  deserializeDiagram,
  serializeDiagram,
  shapeDefaults,
  styledEdge,
  type Connector,
  type DiagramContent,
  type DiagramSettings,
  type ShapeData,
  type ShapeKind,
  type ShapeNode,
  DIAGRAM_SCHEMA,
  diagramSchemaOf,
} from './types';

const nodeTypes: NodeTypes = { shape: ShapeNodeView };
const DRAG_MIME = 'application/x-dcos-shape';

let counter = 0;
const newId = (prefix: string) =>
  `${prefix}-${typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID().slice(0, 8) : `${Date.now().toString(36)}${(++counter).toString(36)}`}`;

interface Snapshot {
  nodes: ShapeNode[];
  edges: Connector[];
  /** Included so undoing an Arrange also turns auto-arrange back off (audit DIAG-2). */
  settings?: DiagramSettings;
}

export interface DiagramEditorProps {
  /** Read once on mount. Remount (change `key`) to load different content. */
  initialContent: unknown;
  title: string;
  onChange: (content: DiagramContent) => void;
}

export function DiagramEditor(props: DiagramEditorProps) {
  return (
    <ReactFlowProvider>
      <style>{diagramCss}</style>
      <Editor {...props} />
    </ReactFlowProvider>
  );
}

function isTyping(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
}

/** Tree shortcuts (Tab, Enter, F2) belong to the canvas; on buttons and menus they keep their normal meaning (audit DIAG-5). */
function onCanvas(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  return !!el?.closest('.react-flow') && !el.closest('button, a, [role="menuitem"], .react-flow__panel');
}

const ARROWS = new Set(['arrowup', 'arrowdown', 'arrowleft', 'arrowright']);

function Editor({ initialContent, title, onChange }: DiagramEditorProps) {
  const [initial] = useState(() => deserializeDiagram(initialContent));
  const readOnly = diagramSchemaOf(initialContent) > DIAGRAM_SCHEMA;
  const [nodes, setNodes, onNodesChange] = useNodesState<ShapeNode>(initial.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Connector>(initial.edges);
  const [settings, setSettings] = useState<DiagramSettings>(initial.settings);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [, rerender] = useReducer((x: number) => x + 1, 0);
  const history = useRef(new UndoStack<Snapshot>(150));
  const clipboard = useRef<Snapshot | null>(null);
  const viewport = useRef<Viewport | null>(initial.viewport);
  const wrapper = useRef<HTMLDivElement>(null);
  const rf = useReactFlow<ShapeNode, Connector>();
  const toast = useToast();

  const current = useRef<Snapshot>({ nodes, edges });
  current.current = { nodes, edges };
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  // Only real changes are reported: opening, selecting, panning and zooming are not edits (audit FUNC-28).
  // Compared without the viewport, which is saved along with real edits but never triggers a save itself.
  const lastEmitted = useRef(JSON.stringify(serializeDiagram(initial.nodes, initial.edges, null, initial.settings)));
  const emit = useCallback(() => {
    if (readOnly) return;
    const json = JSON.stringify(serializeDiagram(current.current.nodes, current.current.edges, null, settingsRef.current));
    if (json === lastEmitted.current) return;
    lastEmitted.current = json;
    onChangeRef.current(serializeDiagram(current.current.nodes, current.current.edges, viewport.current, settingsRef.current));
  }, [readOnly]);
  useEffect(emit, [nodes, edges, settings, emit]);

  // ── History ──────────────────────────────────────────────────────────────
  const snapshot = useCallback(() => {
    history.current.push({ ...current.current, settings: settingsRef.current });
    rerender();
  }, []);
  /** Inspector focus records the pre-edit state here; it becomes an undo step only if something changes (audit DIAG-3). */
  const baseline = useRef<Snapshot | null>(null);
  const lastArrowSnapshot = useRef(0);
  const restore = (s: Snapshot | undefined) => {
    if (!s) return;
    setNodes(s.nodes);
    setEdges(s.edges);
    if (s.settings) setSettings(s.settings);
    setEditingId(null);
    baseline.current = null;
    rerender();
  };
  const undo = () => restore(history.current.undo({ ...current.current, settings: settingsRef.current }));
  const redo = () => restore(history.current.redo({ ...current.current, settings: settingsRef.current }));

  // ── Mutations ────────────────────────────────────────────────────────────
  const updateNodeData = useCallback(
    (id: string, patch: Partial<ShapeData>) => {
      snapshot();
      setNodes((ns) => ns.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...patch } } : n)));
    },
    [snapshot, setNodes],
  );

  const actions = useMemo<DiagramActions>(() => ({ snapshot, updateNodeData, editingId, setEditingId }), [snapshot, updateNodeData, editingId]);

  const selectedNodes = nodes.filter((n) => n.selected);
  const selectedEdges = edges.filter((e) => e.selected);

  const viewCenter = () => {
    const r = wrapper.current?.getBoundingClientRect();
    return r ? rf.screenToFlowPosition({ x: r.left + r.width / 2, y: r.top + r.height / 2 }) : { x: 0, y: 0 };
  };

  const addShape = (shape: ShapeKind, at?: { x: number; y: number }) => {
    const { width, height, ...style } = shapeDefaults(shape);
    const c = at ?? viewCenter();
    const node: ShapeNode = {
      id: newId('n'),
      type: 'shape',
      position: { x: Math.round(c.x - width / 2), y: Math.round(c.y - height / 2) },
      width,
      height,
      selected: true,
      data: { ...style, label: shape === 'text' ? 'Text' : '' },
    };
    snapshot();
    setNodes((ns) => [...ns.map((n) => ({ ...n, selected: false })), node]);
    setEdges((es) => es.map((e) => ({ ...e, selected: false })));
    setEditingId(node.id);
  };

  const relayout = (ns: ShapeNode[], es: Connector[], dir: LayoutDirection) => {
    const laid = layoutTree(ns, es, dir);
    return { nodes: laid.nodes, edges: laid.edges };
  };

  const applyLayout = (dir: LayoutDirection) => {
    if (!edges.length) {
      toast('Connect shapes first — auto-layout arranges connected trees', 'info');
      return;
    }
    snapshot();
    const laid = relayout(nodes, edges, dir);
    setNodes(laid.nodes);
    setEdges(laid.edges);
    setSettings((s) => ({ ...s, autoLayout: dir }));
    requestAnimationFrame(() => rf.fitView({ padding: 0.2, duration: 300, maxZoom: 1.2 }));
  };

  const addChild = (parentId?: string) => {
    const parent = nodes.find((n) => n.id === (parentId ?? (selectedNodes.length === 1 ? selectedNodes[0].id : '')));
    if (!parent) return;
    const dir = settings.autoLayout === 'LR' ? 'LR' : 'TB';
    const childEdges = edges.filter((e) => e.source === parent.id);
    const childCount = childEdges.length;
    // New children match their siblings' look; the first child copies the parent.
    const model = nodes.find((n) => n.id === childEdges[0]?.target) ?? parent;
    const w = model.width ?? 160;
    const h = model.height ?? 70;
    const child: ShapeNode = {
      id: newId('n'),
      type: 'shape',
      position: dir === 'TB' ? { x: parent.position.x + childCount * (w + 40), y: parent.position.y + h + 80 } : { x: parent.position.x + w + 80, y: parent.position.y + childCount * (h + 30) },
      width: w,
      height: h,
      selected: true,
      data: { ...model.data, label: '' },
    };
    const edge = styledEdge({
      id: newId('e'),
      source: parent.id,
      target: child.id,
      sourceHandle: dir === 'TB' ? 'b' : 'r',
      targetHandle: dir === 'TB' ? 't' : 'l',
      type: 'smoothstep',
      data: { ...DEFAULT_CONNECTOR },
    });
    snapshot();
    let ns = [...nodes.map((n) => ({ ...n, selected: false })), child];
    let es = [...edges, edge];
    if (settings.autoLayout !== 'none') ({ nodes: ns, edges: es } = relayout(ns, es, settings.autoLayout));
    setNodes(ns);
    setEdges(es);
    setEditingId(child.id);
  };

  const addSibling = () => {
    if (selectedNodes.length !== 1) return;
    const parentEdge = edges.find((e) => e.target === selectedNodes[0].id);
    if (parentEdge) addChild(parentEdge.source);
    else {
      const n = selectedNodes[0];
      addShape(n.data.shape, { x: n.position.x + (n.width ?? 160) * 1.5 + 40, y: n.position.y + (n.height ?? 70) / 2 });
    }
  };

  const pasteSnapshot = (src: Snapshot, offset: number) => {
    if (!src.nodes.length) return;
    const ids = new Map(src.nodes.map((n) => [n.id, newId('n')]));
    const copies = src.nodes.map((n) => ({ ...n, id: ids.get(n.id)!, position: { x: n.position.x + offset, y: n.position.y + offset }, selected: true }));
    const copiedEdges = src.edges
      .filter((e) => ids.has(e.source) && ids.has(e.target))
      .map((e) => ({ ...e, id: newId('e'), source: ids.get(e.source)!, target: ids.get(e.target)!, selected: false }));
    snapshot();
    setNodes((ns) => [...ns.map((n) => ({ ...n, selected: false })), ...copies]);
    setEdges((es) => [...es.map((e) => ({ ...e, selected: false })), ...copiedEdges]);
  };

  const duplicate = () => pasteSnapshot({ nodes: selectedNodes, edges }, 30);
  const copy = () => {
    if (selectedNodes.length) clipboard.current = { nodes: selectedNodes, edges: edges.filter((e) => selectedNodes.some((n) => n.id === e.source) && selectedNodes.some((n) => n.id === e.target)) };
  };
  const paste = () => clipboard.current && pasteSnapshot(clipboard.current, 40);
  const deleteSelected = () => void rf.deleteElements({ nodes: selectedNodes, edges: selectedEdges });

  const align = (kind: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom') => {
    if (selectedNodes.length < 2) return;
    const box = selectedNodes.map((n) => ({ id: n.id, x: n.position.x, y: n.position.y, w: n.width ?? 0, h: n.height ?? 0 }));
    const minX = Math.min(...box.map((b) => b.x));
    const maxX = Math.max(...box.map((b) => b.x + b.w));
    const minY = Math.min(...box.map((b) => b.y));
    const maxY = Math.max(...box.map((b) => b.y + b.h));
    snapshot();
    setNodes((ns) =>
      ns.map((n) => {
        if (!n.selected) return n;
        const w = n.width ?? 0;
        const h = n.height ?? 0;
        const p = { ...n.position };
        if (kind === 'left') p.x = minX;
        if (kind === 'center') p.x = (minX + maxX) / 2 - w / 2;
        if (kind === 'right') p.x = maxX - w;
        if (kind === 'top') p.y = minY;
        if (kind === 'middle') p.y = (minY + maxY) / 2 - h / 2;
        if (kind === 'bottom') p.y = maxY - h;
        return { ...n, position: p };
      }),
    );
  };

  /** Pushes an undo step for an inspector change: the focus baseline if there is one, else the current state. */
  const recordInspectorChange = (opts: PatchOpts) => {
    if (baseline.current) {
      history.current.push(baseline.current);
      baseline.current = null;
      rerender();
    } else if (opts.snapshot) {
      snapshot();
    }
  };

  const patchNodes = (patch: Partial<ShapeData>, opts: PatchOpts) => {
    if (!Object.keys(patch).length) {
      // Focus on a text field: remember the state, but do not create an undo step yet.
      if (opts.snapshot) baseline.current = { ...current.current, settings: settingsRef.current };
      return;
    }
    const keys = Object.keys(patch) as Array<keyof ShapeData>;
    if (selectedNodes.every((n) => keys.every((k) => n.data[k] === patch[k]))) return; // nothing would change
    recordInspectorChange(opts);
    setNodes((ns) => ns.map((n) => (n.selected ? { ...n, data: { ...n.data, ...patch } } : n)));
  };

  const patchEdges = (patch: EdgePatch, opts: PatchOpts) => {
    if (!Object.keys(patch).length) {
      if (opts.snapshot) baseline.current = { ...current.current, settings: settingsRef.current };
      return;
    }
    recordInspectorChange(opts);
    setEdges((es) =>
      es.map((e) =>
        e.selected
          ? styledEdge({
              ...e,
              ...(patch.type ? { type: patch.type } : {}),
              ...(patch.label !== undefined ? { label: patch.label || undefined } : {}),
              data: { ...DEFAULT_CONNECTOR, ...e.data, ...patch.data },
            })
          : e,
      ),
    );
  };

  // ── React Flow handlers ──────────────────────────────────────────────────
  const onConnect = (c: Connection) => {
    snapshot();
    setEdges((es) => addEdge(styledEdge({ ...c, id: newId('e'), type: 'smoothstep', data: { ...DEFAULT_CONNECTOR } }), es));
  };
  const onReconnect = (oldEdge: Connector, c: Connection) => {
    snapshot();
    setEdges((es) => reconnectEdge(oldEdge, c, es));
  };

  const onDrop = (e: DragEvent) => {
    const shape = e.dataTransfer.getData(DRAG_MIME) as ShapeKind;
    if (!shape) return;
    e.preventDefault();
    addShape(shape, rf.screenToFlowPosition({ x: e.clientX, y: e.clientY }));
  };

  /** Runs before React Flow moves nodes with the arrow keys, so the move can be undone (audit DIAG-4). */
  const onKeyDownCapture = (e: KeyboardEvent) => {
    if (readOnly || isTyping(e.target) || !ARROWS.has(e.key.toLowerCase()) || !selectedNodes.length || !onCanvas(e.target)) return;
    // One undo step per burst of arrow presses.
    if (Date.now() - lastArrowSnapshot.current > 800) snapshot();
    lastArrowSnapshot.current = Date.now();
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (readOnly || isTyping(e.target)) return;
    const mod = e.metaKey || e.ctrlKey;
    const key = e.key.toLowerCase();
    const handled = () => {
      e.preventDefault();
      e.stopPropagation();
    };
    if (mod && key === 'z' && !e.shiftKey) return handled(), undo();
    if ((mod && key === 'z' && e.shiftKey) || (mod && key === 'y')) return handled(), redo();
    if (mod && key === 'd') return handled(), duplicate();
    if (mod && key === 'c') return copy();
    if (mod && key === 'v') return handled(), paste();
    if (mod && key === 'a') return handled(), setNodes((ns) => ns.map((n) => ({ ...n, selected: true })));
    if (!onCanvas(e.target) || selectedNodes.length !== 1) return;
    if (key === 'tab') return handled(), addChild();
    if (key === 'enter') return handled(), addSibling();
    if (key === 'f2') return handled(), setEditingId(selectedNodes[0].id);
  };

  // ── Export ───────────────────────────────────────────────────────────────
  const runExport = async (kind: 'png' | 'svg' | 'pdf') => {
    const el = wrapper.current;
    if (!el) return;
    try {
      setNodes((ns) => ns.map((n) => (n.selected ? { ...n, selected: false } : n)));
      setEdges((es) => es.map((x) => (x.selected ? { ...x, selected: false } : x)));
      setEditingId(null);
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const ns = rf.getNodes();
      const blob = kind === 'png' ? await exportPng(el, ns) : kind === 'svg' ? await exportSvg(el, ns) : await exportPdf(el, ns);
      downloadBlob(blob, `${safeFileName(title)}.${kind}`);
      toast(`Exported ${kind.toUpperCase()}`, 'success');
    } catch (err) {
      toast(`Export failed: ${err instanceof Error ? err.message : String(err)}`, 'error');
    }
  };

  const single = selectedNodes.length === 1;

  return (
    <DiagramActionsContext.Provider value={actions}>
      <div className="flex h-full flex-col" onKeyDown={onKeyDown} onKeyDownCapture={onKeyDownCapture}>
        {readOnly && (
          <div role="alert" className="flex flex-wrap items-center gap-3 border-b border-warning/30 bg-warning/10 px-4 py-3 text-sm">
            <ShieldAlert size={18} className="shrink-0 text-warning" />
            <div className="min-w-0 flex-1">
              <div className="font-semibold">Opened read-only to protect this diagram</div>
              <p className="text-muted">It was saved by a newer version of Classroom OS. Update the app on this device to edit it. Nothing has been changed.</p>
            </div>
            <Button
              size="sm"
              icon={<FileJson size={14} />}
              onClick={() => downloadBlob(new Blob([JSON.stringify(initialContent, null, 2)], { type: 'application/json' }), `${safeFileName(title)} (original data).json`)}
            >
              Download original data
            </Button>
          </div>
        )}
        <div className="flex items-center border-b border-border bg-surface">
        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto px-2 py-1.5 [scrollbar-width:thin]" role="toolbar" aria-label="Diagram tools">
          <IconButton label="Undo (Ctrl+Z)" disabled={!history.current.canUndo} onClick={undo}>
            <Undo2 size={16} />
          </IconButton>
          <IconButton label="Redo (Ctrl+Shift+Z)" disabled={!history.current.canRedo} onClick={redo}>
            <Redo2 size={16} />
          </IconButton>
          <Separator vertical />
          <IconButton label="Duplicate (Ctrl+D)" disabled={!selectedNodes.length} onClick={duplicate}>
            <Copy size={16} />
          </IconButton>
          <IconButton label="Delete (Del)" disabled={!selectedNodes.length && !selectedEdges.length} onClick={deleteSelected}>
            <Trash2 size={16} />
          </IconButton>
          <Separator vertical />
          <IconButton label="Add child (Tab)" disabled={!single} onClick={() => addChild()}>
            <CornerDownRight size={16} />
          </IconButton>
          <IconButton label="Add sibling (Enter)" disabled={!single} onClick={addSibling}>
            <Plus size={16} />
          </IconButton>
          <Menu
            trigger={(p) => (
              <Button size="sm" variant="ghost" icon={<Network size={15} />} {...p}>
                <span className="hidden sm:inline">Arrange</span> <ChevronDown size={13} />
              </Button>
            )}
            items={[
              { label: 'Tree: top to bottom', onSelect: () => applyLayout('TB') },
              { label: 'Tree: left to right', onSelect: () => applyLayout('LR') },
              {
                label: settings.autoLayout === 'none' ? 'Auto-arrange is off' : 'Turn off auto-arrange',
                disabled: settings.autoLayout === 'none',
                onSelect: () => setSettings((s) => ({ ...s, autoLayout: 'none' })),
              },
            ]}
          />
          {selectedNodes.length > 1 && (
            <>
              <Separator vertical />
              <IconButton label="Align left" onClick={() => align('left')}>
                <AlignStartVertical size={16} />
              </IconButton>
              <IconButton label="Align centre" onClick={() => align('center')}>
                <AlignCenterVertical size={16} />
              </IconButton>
              <IconButton label="Align right" onClick={() => align('right')}>
                <AlignEndVertical size={16} />
              </IconButton>
              <IconButton label="Align top" onClick={() => align('top')}>
                <AlignStartHorizontal size={16} />
              </IconButton>
              <IconButton label="Align middle" onClick={() => align('middle')}>
                <AlignCenterHorizontal size={16} />
              </IconButton>
              <IconButton label="Align bottom" onClick={() => align('bottom')}>
                <AlignEndHorizontal size={16} />
              </IconButton>
            </>
          )}
          <Separator vertical />
          <IconButton label={settings.showGrid ? 'Hide grid' : 'Show grid'} active={settings.showGrid} onClick={() => setSettings((s) => ({ ...s, showGrid: !s.showGrid }))}>
            <Grid3x3 size={16} />
          </IconButton>
          <IconButton label={settings.snapToGrid ? 'Snap to grid: on' : 'Snap to grid: off'} active={settings.snapToGrid} onClick={() => setSettings((s) => ({ ...s, snapToGrid: !s.snapToGrid }))}>
            <Magnet size={16} />
          </IconButton>
          <IconButton label="Fit diagram to screen" onClick={() => rf.fitView({ padding: 0.2, duration: 300, maxZoom: 1.2 })}>
            <Maximize size={16} />
          </IconButton>
        </div>
          <div className="shrink-0 border-l border-border px-2 py-1.5">
            <Menu
              align="end"
              trigger={(p) => (
                <Button size="sm" variant="primary" icon={<Download size={14} />} aria-label="Export" {...p}>
                  <span className="hidden sm:inline">Export</span> <ChevronDown size={13} />
                </Button>
              )}
              items={[
                { label: 'PNG image (high resolution)', icon: <FileImage size={14} />, onSelect: () => void runExport('png') },
                { label: 'SVG image', icon: <FileImage size={14} />, onSelect: () => void runExport('svg') },
                { label: 'PDF', icon: <FileText size={14} />, onSelect: () => void runExport('pdf') },
              ]}
            />
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          <aside aria-label="Shapes" className="flex shrink-0 gap-1 overflow-x-auto border-b border-border bg-surface p-2 md:w-[88px] md:flex-col md:overflow-y-auto md:border-b-0 md:border-r">
            {SHAPE_CATALOG.map((s) => {
              const d = shapeDefaults(s.shape);
              const pw = 44;
              const ph = Math.max(18, Math.min(34, (d.height / d.width) * pw));
              return (
                <button
                  key={s.shape}
                  type="button"
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData(DRAG_MIME, s.shape);
                    e.dataTransfer.effectAllowed = 'copy';
                  }}
                  onClick={() => addShape(s.shape)}
                  title={`${s.name} — ${s.hint}. Click or drag onto the canvas.`}
                  className="flex w-[68px] shrink-0 cursor-grab flex-col items-center gap-1 rounded-lg px-1 py-1.5 text-[10.5px] leading-tight text-muted hover:bg-surface-2 hover:text-fg active:cursor-grabbing md:w-auto"
                >
                  <span className="flex h-9 items-center justify-center">
                    {s.shape === 'text' ? (
                      <span className="text-base font-semibold text-fg">Aa</span>
                    ) : (
                      <ShapeSvg className="block overflow-visible" shape={s.shape} width={pw} height={ph} fill={d.fill} stroke={d.stroke} strokeWidth={1.5} />
                    )}
                  </span>
                  {s.name}
                </button>
              );
            })}
          </aside>

          <div ref={wrapper} className="relative min-h-0 flex-1" onDragOver={(e) => e.dataTransfer.types.includes(DRAG_MIME) && e.preventDefault()} onDrop={onDrop}>
            <ReactFlow<ShapeNode, Connector>
              className="dcos-flow"
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onReconnect={onReconnect}
              onNodeDragStart={snapshot}
              onBeforeDelete={async () => {
                snapshot();
                return true;
              }}
              onNodeDoubleClick={(_, n) => setEditingId(n.id)}
              onPaneClick={() => setEditingId(null)}
              onMoveEnd={(_, vp) => {
                // Remembered and saved with the next real edit; moving the view is not an edit itself.
                viewport.current = vp;
              }}
              nodesDraggable={!readOnly}
              nodesConnectable={!readOnly}
              edgesReconnectable={!readOnly}
              elementsSelectable={!readOnly}
              deleteKeyCode={readOnly ? null : ['Delete', 'Backspace']}
              connectionMode={ConnectionMode.Loose}
              connectionLineType={ConnectionLineType.SmoothStep}
              snapToGrid={settings.snapToGrid}
              snapGrid={[10, 10]}
              defaultViewport={initial.viewport ?? undefined}
              fitView={!initial.viewport}
              fitViewOptions={{ padding: 0.2, maxZoom: 1.2 }}
              minZoom={0.1}
              maxZoom={4}
              multiSelectionKeyCode={['Meta', 'Control', 'Shift']}
              elevateEdgesOnSelect
              zoomOnDoubleClick={false}
              colorMode="light"
            >
              {settings.showGrid && <Background variant={BackgroundVariant.Dots} gap={20} size={1.3} color="#c4c8d4" />}
              <Controls showInteractive={false} position="bottom-left" />
              <MiniMap<ShapeNode> pannable zoomable position="bottom-right" nodeColor={(n) => (n.data.fill === 'transparent' ? '#cbd5e1' : n.data.fill)} nodeStrokeColor="#94a3b8" />
              {(selectedNodes.length > 0 || selectedEdges.length > 0) && (
                <Panel position="top-right">
                  <div
                    className={cn('max-h-[calc(100vh-220px)] w-60 overflow-y-auto rounded-xl border border-border bg-surface p-3.5 text-fg shadow-lg')}
                    onKeyDown={(e) => e.stopPropagation()}
                  >
                    {selectedNodes.length > 0 ? <NodeInspector nodes={selectedNodes} onPatch={patchNodes} /> : <EdgeInspector edges={selectedEdges} onPatch={patchEdges} />}
                  </div>
                </Panel>
              )}
              {nodes.length === 0 && (
                <Panel position="top-center">
                  <div className="mt-16 max-w-sm rounded-xl border border-dashed border-slate-300 bg-white/90 px-5 py-4 text-center text-sm text-slate-600 shadow-sm">
                    <div className="font-semibold text-slate-900">Start your diagram</div>
                    Click a shape on the left (or drag it here). Drag from a shape's edge dot to connect it. Double-click to type.
                  </div>
                </Panel>
              )}
            </ReactFlow>
          </div>
        </div>
      </div>
    </DiagramActionsContext.Provider>
  );
}
