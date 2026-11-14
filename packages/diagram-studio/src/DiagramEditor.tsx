import { Button, cn, downloadBlob, safeFileName } from '@dcos/ui';
import { Background, BackgroundVariant, ConnectionLineType, ConnectionMode, Controls, MiniMap, Panel, ReactFlow, ReactFlowProvider, useReactFlow, ViewportPortal, type NodeTypes } from '@xyflow/react';
import { FileJson, ShieldAlert } from 'lucide-react';
import { useCallback, useId, useImperativeHandle, useMemo, useRef, type DragEvent, type Ref } from 'react';
import { connectCss } from './connect/css';
import { ConnectActionsContext } from './connect/context';
import { useConnect } from './connect/useConnect';
import { diagramCss } from './diagramCss';
import { edgeTypes, MarkerDefs, MarkerScopeContext } from './edges';
import type { EditorController } from './editor/controller';
import { ExportMenu } from './editor/ExportMenu';
import { CanvasContext } from './editor/canvasContext';
import { CanvasOverlays, LockedInspector } from './editor/CanvasOverlays';
import { createMutations } from './editor/mutations';
import { useCanvas } from './editor/useCanvas';
import { DRAG_MIME, ShapeLibrary } from './editor/ShapeLibrary';
import { handleShortcut, inDialog } from './editor/shortcuts';
import { ToolbarGroups } from './editor/Toolbar';
import { useDiagramState, type Snapshot } from './editor/useDiagramState';
import { useEditorToast } from './editor/fullscreenToasts';
import { EdgeInspector, NodeInspector } from './Inspector';
import { addShapeInContainer, dropIntoContainers } from './library/editorActions';
import { QuickConnect } from './QuickConnect';
import { DiagramActionsContext, ShapeNode as ShapeNodeView, type DiagramActions } from './ShapeNode';
import type { Connector, DiagramContent, ShapeData, ShapeKind, ShapeNode } from './types';

const nodeTypes: NodeTypes = { shape: ShapeNodeView };

export interface DiagramEditorProps {
  /** Read once on mount. Remount (change `key`) to load different content. */
  initialContent: unknown;
  title: string;
  onChange?: (content: DiagramContent) => void;
  /** Gives a host (such as the document's diagram dialog) access to the current diagram and its renders. */
  apiRef?: Ref<DiagramEditorApi>;
  /** The host can open a diagram file (.dcosdiagram or diagrams.net) as a new diagram; adds "Open file…" to the menu. */
  onOpenFile?: () => void;
}

export interface RenderedImage {
  blob: Blob;
  /** Natural size in CSS pixels; the PNG itself is pixelRatio times larger. */
  width: number;
  height: number;
  /** The pixel ratio used: the one asked for, or less when the diagram is too large for a canvas at that ratio. */
  pixelRatio?: number;
}

export interface DiagramEditorApi {
  /** The diagram to save. For a protected diagram, the content the editor was given, unchanged. */
  getContent(): DiagramContent;
  /** True when the diagram was saved by a newer app version and opened read-only; it must not be saved over. */
  isReadOnly(): boolean;
  /** Renders the whole diagram (not just the visible part) without selection chrome. */
  renderPng(pixelRatio?: number): Promise<RenderedImage>;
  renderSvg(): Promise<Blob>;
  renderPdf(): Promise<Blob>;
}

export function DiagramEditor(props: DiagramEditorProps) {
  return (
    <ReactFlowProvider>
      <style>{diagramCss}</style>
      <style>{connectCss}</style>
      <Editor {...props} />
    </ReactFlowProvider>
  );
}

/**
 * The editor screen. State and history live in `useDiagramState`, every change in `createMutations`; the toolbar,
 * selection actions, keyboard shortcuts, export formats, inspector sections and shapes are registries that features
 * add entries to (see editor/ and the `@phase5:` markers).
 */
function Editor({ initialContent, title, onChange, apiRef, onOpenFile }: DiagramEditorProps) {
  const state = useDiagramState(initialContent, onChange);
  const { initial, original, readOnly, nodes, edges, settings, editingId, setEditingId, setNodes, setEdges, selectedNodes, selectedEdges, snapshot } = state;
  const clipboard = useRef<Snapshot | null>(null);
  const wrapper = useRef<HTMLDivElement>(null);
  const rf = useReactFlow<ShapeNode, Connector>();
  const { toast, overlay: fullscreenToasts } = useEditorToast(); // @phase5:canvas — toasts stay visible in full screen
  const mutations = createMutations({ state, rf, toast, wrapper, clipboard });
  const connect = useConnect({ state, toast }); // @phase5:connect
  // @phase5:canvas (G-CANVAS) — layers, locks, groups, clipboard, view. Applied position changes move bend points (G-CONNECT).
  const canvas = useCanvas({ state, mutations, rf, toast, wrapper, clipboard, onApplied: connect.onPositionChanges });
  const markerScope = `dcos${useId().replace(/[^a-zA-Z0-9]/g, '')}`;

  // Label editing on the canvas (ShapeNode). Stable callbacks so shapes re-render only when their own props change.
  const updateNodeData = useCallback(
    (id: string, patch: Partial<ShapeData>) => {
      if (readOnly) return;
      snapshot();
      setNodes((ns) => ns.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...patch } } : n)));
    },
    [readOnly, snapshot, setNodes],
  );
  const editLabel = useCallback((id: string | null) => setEditingId(readOnly ? null : id), [readOnly, setEditingId]);
  const actions = useMemo<DiagramActions>(() => ({ snapshot, updateNodeData, editingId, setEditingId: editLabel, readOnly }), [snapshot, updateNodeData, editingId, editLabel, readOnly]);

  /** Clears selection and editing chrome, waits for the canvas to repaint, then hands over the flow element. */
  const prepareCapture = async () => {
    const el = wrapper.current;
    if (!el) throw new Error('The diagram is not on screen');
    setNodes((ns) => ns.map((n) => (n.selected ? { ...n, selected: false } : n)));
    setEdges((es) => es.map((x) => (x.selected ? { ...x, selected: false } : x)));
    setEditingId(null);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    // Bounds are measured on the canvas: shapes inside groups at their canvas position, hidden shapes left out.
    const ns = rf
      .getNodes()
      .filter((n) => !n.hidden)
      .map((n) => (n.parentId ? { ...n, parentId: undefined, position: rf.getInternalNode(n.id)?.internals.positionAbsolute ?? n.position } : n));
    return { el, ns };
  };

  const ctx: EditorController = { ...state, ...mutations, ...canvas.controls, rf, toast, title, single: selectedNodes.length === 1, prepareCapture, onOpenFile };

  useImperativeHandle(
    apiRef,
    () => ({
      getContent: () => (readOnly ? (original as DiagramContent) : state.serialize()),
      isReadOnly: () => readOnly,
      // @phase5:export — drawn from the diagram's content by the vector renderer (vector/), not captured from the canvas.
      renderPng: async (pixelRatio = 2) => {
        const { renderDiagramPng } = await import('./vector/raster');
        const r = await renderDiagramPng(state.serialize(), { scale: pixelRatio });
        return { blob: r.blob, width: r.width, height: r.height, pixelRatio: r.pixelRatio };
      },
      renderSvg: async () => {
        const { renderDiagramSvg } = await import('./vector/renderSvg');
        return new Blob([renderDiagramSvg(state.serialize(), { title }).svg], { type: 'image/svg+xml' });
      },
      renderPdf: async () => {
        const { renderDiagramPdf } = await import('./vector/pdf');
        return (await renderDiagramPdf(state.serialize(), { title })).blob;
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const onDrop = (e: DragEvent) => {
    const shape = e.dataTransfer.getData(DRAG_MIME) as ShapeKind;
    if (!shape || readOnly) return;
    e.preventDefault();
    addShapeInContainer(ctx, shape, rf.screenToFlowPosition({ x: e.clientX, y: e.clientY })); // @phase5:shapes (G-SHAPES) — joins a container there.
  };

  // @phase5:canvas (G-CANVAS) — locked shapes get the Unlock panel; inspector patches skip locked shapes.
  const inspector = readOnly ? null : selectedNodes.length > 0 ? (
    <CanvasContext.Provider value={ctx}>
      {ctx.allSelectedLocked ? <LockedInspector ctx={ctx} /> : <NodeInspector nodes={selectedNodes} onPatch={ctx.patchNodes} onTextFocus={state.onTextFocus} />}
    </CanvasContext.Provider>
  ) : selectedEdges.length > 0 ? (
    <EdgeInspector edges={selectedEdges} onPatch={mutations.patchEdges} onTextFocus={state.onTextFocus} />
  ) : null;

  return (
    <DiagramActionsContext.Provider value={actions}>
      <MarkerScopeContext.Provider value={markerScope}>
        <ConnectActionsContext.Provider value={connect.actions}>
        <div ref={canvas.rootRef} className="dcos-canvas-root flex h-full flex-col" onKeyDown={(e) => handleShortcut('bubble', e, ctx)} onKeyDownCapture={(e) => handleShortcut('capture', e, ctx)}>
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
          {fullscreenToasts}
          <div className="flex items-center border-b border-border bg-surface">
            <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto px-2 py-1.5 [scrollbar-width:thin]" role="toolbar" aria-label="Diagram tools">
              <ToolbarGroups ctx={ctx} />
            </div>
            <div className="shrink-0 border-l border-border px-2 py-1.5">
              <ExportMenu ctx={ctx} />
            </div>
          </div>

          <div className="flex min-h-0 flex-1 flex-col md:flex-row">
            <ShapeLibrary readOnly={readOnly} onAdd={(shape) => addShapeInContainer(ctx, shape)} /* @phase5:shapes (G-SHAPES) */ />

            <div ref={wrapper} className="relative min-h-0 flex-1" onDragOver={(e) => e.dataTransfer.types.includes(DRAG_MIME) && e.preventDefault()} onDrop={onDrop}>
              <ReactFlow<ShapeNode, Connector>
                className="dcos-flow"
                nodes={canvas.nodes /* @phase5:canvas */}
                edges={connect.flowEdges}
                nodeTypes={nodeTypes}
                edgeTypes={edgeTypes}
                onNodesChange={canvas.onNodesChange /* @phase5:canvas — groups move, resize and select as one */}
                onEdgesChange={state.onEdgesChange}
                onConnect={mutations.onConnect}
                onReconnect={mutations.onReconnect}
                // @phase5:connect — floating connections dropped on a shape, bends that follow their shapes, label editing.
                onConnectEnd={connect.onConnectEnd}
                onReconnectStart={connect.onReconnectStart}
                onReconnectEnd={connect.onReconnectEnd}
                onNodeDragStop={(_, n, ns) => {
                  // @phase5:shapes (G-SHAPES) — shapes dropped in a pool, lane or boundary join it (a group dragged by one of
                  // its shapes joins as the group: @phase5:canvas).
                  dropIntoContainers(ctx, [...new Set((ns.length ? ns : [n]).map((x) => canvas.controls.dragTargetOf(x.id)))].map((id) => ({ id })));
                }}
                onEdgeDoubleClick={(_, e) => editLabel(e.id)}
                onNodeDragStart={() => snapshot()}
                onBeforeDelete={async ({ nodes: gone, edges: lost }) => {
                  // Not while a dialog has the keyboard (Delete or Backspace on its buttons is not meant for the canvas).
                  if (readOnly || inDialog(document.activeElement, canvas.rootRef.current)) return false;
                  // Only when something goes (Delete on a locked shape removes nothing and is no undo step).
                  if (gone.length || lost.length) snapshot();
                  return true;
                }}
                onNodeDoubleClick={(_, n) => ctx.editLabel(n.id) /* @phase5:canvas — not for locked shapes */}
                onPaneClick={() => setEditingId(null)}
                onMoveEnd={(_, vp) => {
                  // Remembered and saved with the next real edit; moving the view is not an edit itself.
                  state.viewport.current = vp;
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
                <ViewportPortal>
                  <MarkerDefs edges={edges} />
                </ViewportPortal>
                {settings.showGrid && <Background variant={BackgroundVariant.Dots} gap={20} size={1.3} color="#c4c8d4" />}
                <Controls showInteractive={false} position="bottom-left" />
                <CanvasOverlays ctx={ctx} /* @phase5:canvas — Layers panel, shortcut help */ />
                <MiniMap<ShapeNode> pannable zoomable position="bottom-right" style={{ width: 150, height: 96 }} nodeColor={(n) => (n.data.fill === 'transparent' ? '#cbd5e1' : n.data.fill)} nodeStrokeColor="#94a3b8" />
                {selectedNodes.length === 1 && selectedEdges.length === 0 && !editingId && !readOnly && (
                  <QuickConnect node={selectedNodes[0]} nodes={nodes} onCreate={(dir, shape) => mutations.quickCreate(dir, shape)} onDrop={mutations.quickDrop} />
                )}
                {inspector && !ctx.layersOpen && (
                  // Phones: floating panel (not while the Layers panel is open: both would not fit side by side; @phase5).
                  // Wider screens get the docked panel beside the canvas instead.
                  <Panel position="top-right" className="md:hidden">
                    <div className={cn('max-h-[calc(100vh-220px)] w-60 overflow-y-auto rounded-xl border border-border bg-surface p-3.5 text-fg shadow-lg')} onKeyDown={(e) => e.stopPropagation()}>
                      {inspector}
                    </div>
                  </Panel>
                )}
                {nodes.length === 0 && !readOnly && (
                  <Panel position="top-center">
                    <div className="mt-16 max-w-sm rounded-xl border border-dashed border-slate-300 bg-white/90 px-5 py-4 text-center text-sm text-slate-600 shadow-sm">
                      <div className="font-semibold text-slate-900">Start your diagram</div>
                      Click a shape on the left (or drag it here). Drag from a shape's edge dot to connect it. Double-click to type.
                    </div>
                  </Panel>
                )}
              </ReactFlow>
            </div>
            {inspector && (
              // Docked like diagrams.net's Format panel, so it never covers the drawing or the quick-connect arrows.
              <aside aria-label="Format" className="hidden w-64 shrink-0 overflow-y-auto border-l border-border bg-surface p-3.5 text-fg md:block" onKeyDown={(e) => e.stopPropagation()}>
                {inspector}
              </aside>
            )}
          </div>
        </div>
        </ConnectActionsContext.Provider>
      </MarkerScopeContext.Provider>
    </DiagramActionsContext.Provider>
  );
}
