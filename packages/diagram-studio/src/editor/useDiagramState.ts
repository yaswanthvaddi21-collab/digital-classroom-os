import { useEdgesState, useNodesState, type Viewport } from '@xyflow/react';
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { TextEditSession, UndoStack } from '../history';
import type { PatchOpts } from '../Inspector';
import { deserializeDiagram, DIAGRAM_SCHEMA, diagramSchemaOf, serializeDiagram, type Connector, type DiagramContent, type DiagramLayer, type DiagramSettings, type ShapeNode } from '../types';

export interface Snapshot {
  nodes: ShapeNode[];
  edges: Connector[];
  /** Included so undoing an Arrange also turns auto-arrange back off (audit DIAG-2). */
  settings?: DiagramSettings;
  /** schema 3: the diagram's layers (undefined = none). Present in every snapshot the editor takes. */
  layers?: DiagramLayer[];
}

/**
 * The editor's state: the diagram (nodes, edges, settings), label editing, undo history, and the change report to
 * the host. Every mutation goes through `snapshot()` (or `recordInspectorChange()`) first, so it can be undone.
 */
export function useDiagramState(initialContent: unknown, onChange: ((content: DiagramContent) => void) | undefined) {
  const [initial] = useState(() => deserializeDiagram(initialContent));
  // Fixed at mount, like `initial`: a protected diagram is handed back exactly as it came (unknown fields included).
  const [original] = useState(() => initialContent);
  const [readOnly] = useState(() => diagramSchemaOf(initialContent) > DIAGRAM_SCHEMA);
  const [nodes, setNodes, onNodesChange] = useNodesState<ShapeNode>(initial.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Connector>(initial.edges);
  const [settings, setSettings] = useState<DiagramSettings>(initial.settings);
  const [layers, setLayers] = useState<DiagramLayer[] | undefined>(initial.layers);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [, rerender] = useReducer((x: number) => x + 1, 0);
  const history = useRef(new UndoStack<Snapshot>(150));
  const viewport = useRef<Viewport | null>(initial.viewport);

  const current = useRef<Snapshot>({ nodes, edges });
  current.current = { nodes, edges };
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const layersRef = useRef(layers);
  layersRef.current = layers;
  /** Everything an undo step restores. */
  const capture = (): Snapshot => ({ ...current.current, settings: settingsRef.current, layers: layersRef.current });

  /** The diagram as it would be saved now. */
  const serialize = useCallback(() => serializeDiagram(current.current.nodes, current.current.edges, viewport.current, settingsRef.current, layersRef.current), []);

  // Only real changes are reported: opening, selecting, panning and zooming are not edits (audit FUNC-28).
  // Compared without the viewport, which is saved along with real edits but never triggers a save itself.
  // The diagram is serialised once per change (audit DS-R8).
  const withoutViewport = (c: DiagramContent) => JSON.stringify({ ...c, viewport: null });
  // Computed once (a useRef argument would be evaluated, and the diagram serialised, on every render).
  const [opened] = useState(() => withoutViewport(serializeDiagram(initial.nodes, initial.edges, null, initial.settings, initial.layers)));
  const lastEmitted = useRef(opened);
  const emit = useCallback(() => {
    if (readOnly) return;
    const content = serialize();
    const json = withoutViewport(content);
    if (json === lastEmitted.current) return;
    lastEmitted.current = json;
    onChangeRef.current?.(content);
  }, [readOnly, serialize]);
  useEffect(emit, [nodes, edges, settings, layers, emit]);

  // ── History ──────────────────────────────────────────────────────────────
  /** Inspector text fields: typing in one is a single undo step, recorded from the state before it (audit DIAG-3). */
  const textEdit = useRef(new TextEditSession<Snapshot>());
  const snapshot = useCallback(() => {
    if (readOnly) return;
    textEdit.current.invalidate();
    history.current.push(capture());
    rerender();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readOnly]);
  const restore = (s: Snapshot | undefined) => {
    if (!s) return;
    setNodes(s.nodes);
    setEdges(s.edges);
    if (s.settings) setSettings(s.settings);
    if ('layers' in s) setLayers(s.layers);
    setEditingId(null);
    textEdit.current.invalidate();
    rerender();
  };
  const undo = () => !readOnly && restore(history.current.undo(capture()));
  const redo = () => !readOnly && restore(history.current.redo(capture()));

  /** Pushes the undo step for an inspector change, unless it continues a text edit that already has one. */
  const recordInspectorChange = (opts: PatchOpts) => {
    const step = textEdit.current.stepFor(capture(), opts.snapshot);
    if (!step) return;
    history.current.push(step);
    rerender();
  };
  /** Focus remembers the state, but an undo step is created only if the text actually changes. */
  const onTextFocus = (focused: boolean) => {
    if (focused) textEdit.current.begin(capture());
    else textEdit.current.end();
  };

  const selectedNodes = nodes.filter((n) => n.selected);
  const selectedEdges = edges.filter((e) => e.selected);
  // A different selection means a different field: an earlier focus no longer describes "before this edit".
  const selectionKey = `${selectedNodes.map((n) => n.id).join()}|${selectedEdges.map((e) => e.id).join()}`;
  useEffect(() => textEdit.current.invalidate(), [selectionKey]);

  return {
    initial,
    original,
    readOnly,
    nodes,
    setNodes,
    onNodesChange,
    edges,
    setEdges,
    onEdgesChange,
    settings,
    setSettings,
    settingsRef,
    layers,
    setLayers,
    editingId,
    setEditingId,
    selectedNodes,
    selectedEdges,
    history,
    viewport,
    current,
    serialize,
    snapshot,
    undo,
    redo,
    recordInspectorChange,
    onTextFocus,
  };
}

export type DiagramState = ReturnType<typeof useDiagramState>;
