import { useStoreApi, type NodeChange, type ReactFlowInstance } from '@xyflow/react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type RefObject } from 'react';
import type { PatchOpts } from '../Inspector';
import type { LayoutDirection } from '../layout';
import type { Connector, ShapeData, ShapeNode } from '../types';
import {
  addLayer,
  byIdOf,
  centredOn,
  clipboardForms,
  CLIPBOARD_MIME,
  distributeNodes,
  documentDiagramsFromHtml,
  fitGroups,
  groupSelection,
  isGroup,
  layerIdOf,
  layerIsEmpty,
  layersOrImplicit,
  moveLayer,
  moveToLayer,
  normalizeLayers,
  readClipboardPayload,
  redirectDrag,
  redirectSelection,
  removeEmptyGroups,
  renderNodes,
  scaleGroupResize,
  setLocked,
  toClipboardPayload,
  topSelected,
  ungroupSelection,
  updateLayer,
  withDescendantIds,
  zOrderNodes,
  type DistributeAxis,
  type DragRedirect,
  type GroupResize,
  type ZOrderOp,
} from './canvasModel';
import { isContainer, settleIntoContainers } from '../library/containers';
import { alignNodes, newId, type AlignKind, type Mutations } from './mutations';
import { inDialog, isTyping } from './shortcuts';
import type { DiagramState, Snapshot } from './useDiagramState';

type FsDocument = Document & { webkitFullscreenEnabled?: boolean; webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => Promise<void> | void };
type FsElement = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void };

const fsDoc = () => (typeof document === 'undefined' ? null : (document as FsDocument));
/** Full screen works here (the standard API, or Safari's prefixed one). */
export const fullscreenSupported = () => {
  const d = fsDoc();
  return !!d && !!(d.fullscreenEnabled || d.webkitFullscreenEnabled);
};
const fullscreenElement = () => {
  const d = fsDoc();
  return d ? (d.fullscreenElement ?? d.webkitFullscreenElement ?? null) : null;
};

/** Whether a paste event brings any data (some browsers list no types for an empty clipboard, others give ''). */
function carriesData(data: DataTransfer | null, get: (type: string) => string): boolean {
  if (!data) return false;
  if ((data.types?.length ?? 0) > 0 || (data.files?.length ?? 0) > 0) return true;
  return !!(get('text/plain') || get('text/html'));
}

/** How long a finger rests on a shape before it is added to (or taken out of) the selection. */
export const LONG_PRESS_MS = 500;

export interface CanvasDeps {
  state: DiagramState;
  mutations: Mutations;
  rf: ReactFlowInstance<ShapeNode, Connector>;
  toast: (message: string, tone?: 'success' | 'error' | 'info') => void;
  wrapper: RefObject<HTMLDivElement | null>;
  clipboard: RefObject<Snapshot | null>;
  /** Called with the node changes the editor applied (after redirection) and the nodes before them. */
  onApplied?: (changes: NodeChange<ShapeNode>[], before: readonly ShapeNode[]) => void;
}

/**
 * Phase 5 canvas features (G-CANVAS) for one editor: what React Flow is given (layers, locks, stacking order), how its
 * changes are redirected for groups, full screen, the system clipboard, touch multi-select, the Layers panel and the
 * shortcut help. `controls` joins the editor controller: some entries replace mutations of the same name so locks,
 * groups and edges are respected (select all, copy, duplicate, align, inspector patches, label editing, arrange).
 */
export function useCanvas({ state, mutations, rf, toast, wrapper, clipboard, onApplied }: CanvasDeps) {
  const { readOnly, nodes, edges, layers, setLayers, setNodes, setEdges, snapshot, selectedNodes, settings, recordInspectorChange, initial } = state;
  const store = useStoreApi<ShapeNode, Connector>();
  const rootRef = useRef<HTMLDivElement>(null);

  // ── What React Flow draws ──────────────────────────────────────────────
  const [cache] = useState(() => new WeakMap<ShapeNode, { sig: string; out: ShapeNode }>());
  const rendered = useMemo(() => renderNodes(nodes, layers, cache), [nodes, layers, cache]);
  const renderedById = useMemo(() => byIdOf(rendered), [rendered]);
  const latest = useRef({ nodes, edges, rendered: renderedById });
  latest.current = { nodes, edges, rendered: renderedById };
  const isLocked = useCallback((id: string) => latest.current.rendered.get(id)?.draggable === false, []);

  // Shapes that a layer hides or locks cannot stay selected.
  useEffect(() => {
    const drop = rendered.filter((n) => n.selected && (n.hidden || n.selectable === false)).map((n) => n.id);
    if (drop.length) setNodes((ns) => ns.map((n) => (drop.includes(n.id) ? { ...n, selected: false } : n)));
  }, [rendered, setNodes]);

  // ── React Flow's changes, redirected for groups ────────────────────────
  const entered = useRef(new Set<string>());
  const onAppliedRef = useRef(onApplied);
  onAppliedRef.current = onApplied;
  const drags = useRef(new Map<string, DragRedirect>());
  const resizes = useRef(new Map<string, GroupResize>());
  const dragTargets = useRef(new Map<string, string>());
  /** The pointer: where it went down (on the canvas) and where it is now (on screen), for group drags. */
  const pointer = useRef<{ downFlow?: { x: number; y: number }; now?: { x: number; y: number } }>({});
  useEffect(() => {
    const down = (e: PointerEvent) => {
      pointer.current = { downFlow: rf.screenToFlowPosition({ x: e.clientX, y: e.clientY }), now: { x: e.clientX, y: e.clientY } };
    };
    const move = (e: PointerEvent) => {
      if (pointer.current.downFlow) pointer.current.now = { x: e.clientX, y: e.clientY };
    };
    window.addEventListener('pointerdown', down, true);
    window.addEventListener('pointermove', move, true);
    return () => {
      window.removeEventListener('pointerdown', down, true);
      window.removeEventListener('pointermove', move, true);
    };
  }, [rf]);
  /** The shape a drag of `id` actually moved: its group when the drag was carried out on the group. */
  const dragTargetOf = useCallback((id: string) => dragTargets.current.get(id) ?? id, []);
  const onNodesChange = useCallback(
    (changes: NodeChange<ShapeNode>[]) => {
      if (readOnly) return state.onNodesChange(changes);
      const { nodes: ns, rendered: flags } = latest.current;
      const drill = !store.getState().userSelectionActive;
      const sel = redirectSelection(changes, ns, entered.current, drill, (id) => flags.get(id)?.selectable !== false);
      entered.current = sel.entered;
      // React Flow measured the dragged shape against its group's position in its own store: use the same origin.
      const originOf = (gid: string) => store.getState().nodeLookup.get(gid)?.internals.positionAbsolute;
      const pointerDelta = () => {
        const p = pointer.current;
        if (!p.downFlow || !p.now) return undefined;
        const now = rf.screenToFlowPosition(p.now);
        return { x: now.x - p.downFlow.x, y: now.y - p.downFlow.y };
      };
      let cs = redirectDrag(sel.changes, ns, entered.current, drags.current, (id) => flags.get(id)?.draggable !== false, originOf, pointerDelta, state.settings.snapToGrid ? 10 : undefined);
      // Remember which group a drag on a shape inside it moved (for drop-into-container at the end of the drag).
      for (const c of sel.changes) {
        if (c.type !== 'position' || !c.dragging) continue;
        const r = drags.current.get(c.id);
        if (r) dragTargets.current.set(c.id, r.target);
        else dragTargets.current.delete(c.id);
      }
      cs = scaleGroupResize(cs, ns, resizes.current);
      cs = removeEmptyGroups(cs, ns);
      state.onNodesChange(cs);
      onAppliedRef.current?.(cs, ns);
      const removed = new Set(cs.filter((c) => c.type === 'remove').map((c) => c.id));
      const extraRemoved = [...removed].filter((id) => !changes.some((c) => c.type === 'remove' && c.id === id));
      if (extraRemoved.length) setEdges((es) => es.filter((e) => !removed.has(e.source) && !removed.has(e.target)));
      // A group fits its shapes again once a move or resize inside it ends.
      const ends = cs.filter((c) => (c.type === 'position' && c.dragging === false) || (c.type === 'dimensions' && c.resizing === false));
      if (!ends.length || !ns.some((x) => x.parentId)) return;
      const byId = byIdOf(ns);
      const ended = ends.map((c) => (c.type === 'position' || c.type === 'dimensions' ? byId.get(c.id)?.parentId : undefined)).filter((p): p is string => !!p && isGroup(byId.get(p)));
      if (ended.length) setNodes((cur) => fitGroups(cur, ended));
    },
    [readOnly, state, store, setNodes, setEdges, rf],
  );

  // ── Selection ──────────────────────────────────────────────────────────
  /** Shapes (top level only: a group stands for what it holds) and connectors that are drawn and selectable. */
  const selectAll = () => {
    if (readOnly) return;
    const flags = latest.current.rendered;
    const drawn = (id: string) => {
      const r = flags.get(id);
      return !!r && !r.hidden;
    };
    const want = (n: ShapeNode) => {
      const r = flags.get(n.id);
      return drawn(n.id) && r?.selectable !== false && !(n.parentId && flags.has(n.parentId));
    };
    setNodes((ns) => ns.map((n) => (!!n.selected === want(n) ? n : { ...n, selected: want(n) })));
    setEdges((es) => es.map((e) => (!!e.selected === (drawn(e.source) && drawn(e.target)) ? e : { ...e, selected: drawn(e.source) && drawn(e.target) })));
  };

  const [selectMode, setSelectModeState] = useState(false);
  const selectModeRef = useRef(false);
  const setSelectMode = (on: boolean) => {
    selectModeRef.current = on;
    setSelectModeState(on);
    store.setState({ multiSelectionActive: on });
  };
  useEffect(() => () => store.setState({ multiSelectionActive: false }), [store]);

  /** Long press (touch): adds the shape (or its group) to the selection, or takes it out. */
  const toggleSelected = useCallback(
    (id: string) => {
      const { nodes: ns, rendered: flags } = latest.current;
      const redirected = redirectSelection([{ id, type: 'select', selected: true }], ns, entered.current, false, (x) => flags.get(x)?.selectable !== false);
      const pick = redirected.changes.find((c) => c.type === 'select');
      const target = pick?.type === 'select' ? pick.id : id;
      if (flags.get(target)?.selectable === false) return;
      setNodes((cur) => cur.map((n) => (n.id === target ? { ...n, selected: !n.selected } : n)));
    },
    [setNodes],
  );

  useEffect(() => {
    const el = wrapper.current;
    if (!el || readOnly) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let start = { x: 0, y: 0 };
    let suppressUntil = 0;
    const clear = () => {
      if (timer) clearTimeout(timer);
      timer = null;
    };
    const down = (e: PointerEvent) => {
      if (selectModeRef.current) store.setState({ multiSelectionActive: true });
      if (e.pointerType !== 'touch') return;
      const nodeEl = (e.target as Element | null)?.closest?.('.react-flow__node');
      const id = nodeEl?.getAttribute('data-id');
      if (!id) return;
      start = { x: e.clientX, y: e.clientY };
      clear();
      timer = setTimeout(() => {
        timer = null;
        toggleSelected(id);
        suppressUntil = Date.now() + 1000;
        navigator.vibrate?.(10);
      }, LONG_PRESS_MS);
    };
    const move = (e: PointerEvent) => {
      if (timer && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 10) clear();
    };
    // The click that ends a long press must not replace the selection.
    const click = (e: Event) => {
      if (Date.now() < suppressUntil) {
        suppressUntil = 0;
        e.stopPropagation();
        e.preventDefault();
      }
    };
    const menu = (e: Event) => {
      if (timer || Date.now() < suppressUntil) e.preventDefault();
    };
    el.addEventListener('pointerdown', down, true);
    el.addEventListener('pointermove', move, true);
    el.addEventListener('pointerup', clear, true);
    el.addEventListener('pointercancel', clear, true);
    el.addEventListener('click', click, true);
    el.addEventListener('contextmenu', menu, true);
    return () => {
      clear();
      el.removeEventListener('pointerdown', down, true);
      el.removeEventListener('pointermove', move, true);
      el.removeEventListener('pointerup', clear, true);
      el.removeEventListener('pointercancel', clear, true);
      el.removeEventListener('click', click, true);
      el.removeEventListener('contextmenu', menu, true);
    };
  }, [wrapper, readOnly, store, toggleSelected]);

  // ── Locks, groups, order, distribute ───────────────────────────────────
  const unlockedSelected = selectedNodes.filter((n) => !isLocked(n.id));
  /** Every selected shape is locked (its own lock, or the lock of a group it is in): the Format panel offers Unlock. */
  const allSelectedLocked = selectedNodes.length > 0 && unlockedSelected.length === 0 && selectedNodes.every((n) => n.locked || isLocked(n.id));

  const lock = (locked: boolean) => {
    if (readOnly || !selectedNodes.some((n) => !!n.locked !== locked)) return;
    snapshot();
    setNodes((ns) => setLocked(ns, locked));
    if (locked) state.setEditingId(null);
  };
  const toggleLock = () => lock(selectedNodes.some((n) => !n.locked));

  const group = () => {
    if (readOnly) return;
    const out = groupSelection(nodes, newId('n'));
    if (!out) return;
    snapshot();
    setNodes(out);
    setEdges((es) => es.map((e) => (e.selected ? { ...e, selected: false } : e)));
  };
  const ungroup = () => {
    if (readOnly) return;
    const r = ungroupSelection(nodes);
    if (!r) {
      if (selectedNodes.some((n) => isGroup(n) && n.locked)) toast('A locked group cannot be ungrouped. Unlock it first.', 'info');
      return;
    }
    const removed = new Set(r.removed);
    const dropped = edges.filter((e) => removed.has(e.source) || removed.has(e.target)).length;
    snapshot();
    setNodes(r.nodes);
    if (dropped) {
      setEdges((es) => es.filter((e) => !removed.has(e.source) && !removed.has(e.target)));
      toast(dropped === 1 ? '1 connector to the group was removed with it.' : `${dropped} connectors to the group were removed with it.`, 'info');
    }
  };

  const zOrder = (op: ZOrderOp) => {
    if (readOnly) return;
    const ids = new Set(topSelected(nodes).map((n) => n.id));
    if (!ids.size) return;
    const out = zOrderNodes(nodes, ids, op);
    if (out === nodes) return;
    snapshot();
    setNodes(out);
  };

  const distribute = (axis: DistributeAxis) => {
    const ids = new Set(
      topSelected(nodes)
        .filter((n) => !isLocked(n.id))
        .map((n) => n.id),
    );
    if (readOnly || ids.size < 3) return;
    snapshot();
    setNodes((ns) => distributeNodes(ns, ids, axis));
  };

  /** Align, leaving locked shapes where they are. */
  const align = (kind: AlignKind) => {
    if (readOnly || unlockedSelected.length < 2) return;
    const fixed = new Set(selectedNodes.filter((n) => isLocked(n.id)).map((n) => n.id));
    snapshot();
    setNodes((ns) =>
      alignNodes(
        ns.map((n) => (fixed.has(n.id) ? { ...n, selected: false } : n)),
        kind,
      ).map((n) => (fixed.has(n.id) ? { ...n, selected: true } : n)),
    );
  };

  /** Arrange (auto-layout) never moves a locked shape. */
  const keepLocked = (run: () => void) => {
    const fixed = new Map(nodes.filter((n) => isLocked(n.id)).map((n) => [n.id, n.position]));
    run();
    if (!fixed.size) return;
    setNodes((ns) => ns.map((n) => (fixed.has(n.id) && (n.position.x !== fixed.get(n.id)!.x || n.position.y !== fixed.get(n.id)!.y) ? { ...n, position: fixed.get(n.id)! } : n)));
  };
  const applyLayout = (dir: LayoutDirection) => keepLocked(() => mutations.applyLayout(dir));
  const addChild = (parentId?: string) => keepLocked(() => mutations.addChild(parentId));
  const addSibling = () => keepLocked(() => mutations.addSibling());

  /** Inspector changes reach unlocked shapes only. */
  const patchNodes = (patch: Partial<ShapeData>, opts: PatchOpts) => {
    if (readOnly || !Object.keys(patch).length) return;
    const targets = selectedNodes.filter((n) => !isLocked(n.id));
    const keys = Object.keys(patch) as Array<keyof ShapeData>;
    if (!targets.length || targets.every((n) => keys.every((k) => n.data[k] === patch[k]))) return;
    recordInspectorChange(opts);
    const ids = new Set(targets.map((n) => n.id));
    setNodes((ns) => ns.map((n) => (ids.has(n.id) ? { ...n, data: { ...n.data, ...patch } } : n)));
  };
  const editLabel = (id: string | null) => {
    if (id && isLocked(id)) return;
    mutations.editLabel(id);
  };

  /** Selected shapes with everything inside them, and the connectors between those. */
  const selectionWithContents = (): Snapshot => {
    const ids = withDescendantIds(
      selectedNodes.map((n) => n.id),
      nodes,
    );
    return { nodes: nodes.filter((n) => ids.has(n.id)), edges: edges.filter((e) => ids.has(e.source) && ids.has(e.target)) };
  };
  const duplicate = () => mutations.pasteSnapshot({ nodes: selectionWithContents().nodes, edges }, 30);

  // ── Clipboard: in memory, and the system clipboard for other diagrams and tabs ──
  const [instance] = useState(() => newId('editor'));
  const serial = useRef(0);
  /** Clipboard data (JSON, readable text, HTML) waiting for the copy or cut event that follows the key press. */
  const pendingCopy = useRef<ReturnType<typeof clipboardForms> | null>(null);
  const pendingPaste = useRef(false);
  /** The in-memory copy may be older than the system clipboard (the window lost focus since). */
  const stale = useRef(false);

  const writeSystemClipboard = async ({ json, text, html }: ReturnType<typeof clipboardForms>) => {
    const clip = typeof navigator !== 'undefined' ? navigator.clipboard : undefined;
    if (!clip) return;
    try {
      if (typeof ClipboardItem !== 'undefined' && clip.write) {
        const custom = `web ${CLIPBOARD_MIME}`;
        const supports = (ClipboardItem as unknown as { supports?: (t: string) => boolean }).supports?.(custom) ?? false;
        const blob = (value: string, type: string) => new Blob([value], { type });
        // Readable text for other apps; the JSON travels in the custom type where the browser allows it, and always
        // inside the HTML (Phase 6), so pages of this app (diagrams and documents) can paste the shapes.
        await clip.write([new ClipboardItem({ 'text/plain': blob(text, 'text/plain'), 'text/html': blob(html, 'text/html'), ...(supports ? { [custom]: blob(json, custom) } : {}) })]);
        return;
      }
    } catch {
      // fall through to plain text
    }
    try {
      // Only plain text can be written here: the JSON, so the shapes can still be pasted (other apps see the JSON).
      await clip.writeText(json);
    } catch {
      // Not allowed here: the copy stays in memory for this diagram.
    }
  };

  const copySelection = (): boolean => {
    if (!selectedNodes.length) return false;
    clipboard.current = selectionWithContents();
    stale.current = false;
    const payload = toClipboardPayload(nodes, edges, instance, ++serial.current, settings);
    if (!payload) return true;
    const forms = clipboardForms(payload);
    pendingCopy.current = forms;
    // No copy event followed the key press (Safari, without editable content): write through the async API.
    setTimeout(() => {
      if (pendingCopy.current !== forms) return;
      pendingCopy.current = null;
      void writeSystemClipboard(forms);
    }, 0);
    return true;
  };
  const copy = () => void copySelection();
  const cut = () => {
    if (readOnly || !copySelection()) return;
    const kept = selectedNodes.filter((n) => isLocked(n.id)).length;
    mutations.deleteSelected();
    if (kept) toast(kept === 1 ? 'The locked shape was copied but not removed.' : `${kept} locked shapes were copied but not removed.`, 'info');
  };

  const viewCenter = () => {
    const r = wrapper.current?.getBoundingClientRect();
    return r ? rf.screenToFlowPosition({ x: r.left + r.width / 2, y: r.top + r.height / 2 }) : { x: 0, y: 0 };
  };

  /** Ctrl+V: the in-memory copy right away when it is current; otherwise the paste event brings the system clipboard. */
  const pasteFromClipboard = (e?: ReactKeyboardEvent) => {
    if (readOnly) return;
    if (clipboard.current && !stale.current) {
      e?.preventDefault();
      mutations.paste();
      return;
    }
    pendingPaste.current = true;
    setTimeout(() => {
      if (!pendingPaste.current) return;
      pendingPaste.current = false;
      mutations.paste(); // no paste event came: the in-memory copy, if any
    }, 150);
  };

  // Listeners read the newest controls through this ref.
  const live = useRef({ copySelection, pasteForeign: (_: { nodes: ShapeNode[]; edges: Connector[] }) => {}, paste: mutations.paste, toast });
  live.current = {
    copySelection,
    pasteForeign: (d) => {
      const placed = centredOn(d.nodes, d.edges, viewCenter());
      mutations.pasteSnapshot(placed, 0);
    },
    paste: mutations.paste,
    toast,
  };

  useEffect(() => {
    if (readOnly) return;
    const inEditor = () => {
      const a = document.activeElement;
      return !!rootRef.current && !!a && rootRef.current.contains(a) && !isTyping(a) && !inDialog(a, rootRef.current);
    };
    const onCopy = (e: ClipboardEvent) => {
      if (!inEditor()) {
        // Something else was copied (a document, a text field): the in-memory shapes are no longer what the user copied
        // last, so Ctrl+V must read the system clipboard (Phase 6).
        stale.current = true;
        return;
      }
      if (!e.clipboardData) return;
      // Text the user selected (in the shortcut help, a panel, a label) is copied as text, not replaced by shapes.
      const text = typeof window.getSelection === 'function' ? window.getSelection()?.toString() : '';
      if (text) {
        pendingCopy.current = null;
        // That text is now what the user copied last: Ctrl+V must not paste the older in-memory shapes (Round 3).
        stale.current = true;
        return;
      }
      if (!pendingCopy.current && !(e.type === 'copy' && live.current.copySelection())) return;
      const forms = pendingCopy.current;
      pendingCopy.current = null;
      if (!forms) return;
      // Phase 6: other apps get the shape labels as text (and HTML); the JSON is in its own type (and the HTML carrier).
      e.clipboardData.setData('text/plain', forms.text);
      e.clipboardData.setData('text/html', forms.html);
      e.clipboardData.setData(CLIPBOARD_MIME, forms.json);
      e.preventDefault();
    };
    const onPaste = (e: ClipboardEvent) => {
      if (!inEditor()) return;
      const wasPending = pendingPaste.current;
      pendingPaste.current = false;
      const data = e.clipboardData;
      const get = (type: string) => {
        try {
          return data?.getData(type) ?? '';
        } catch {
          return '';
        }
      };
      let payload: ReturnType<typeof readClipboardPayload> = null;
      let fromDocument: ReturnType<typeof documentDiagramsFromHtml> = null;
      try {
        payload = readClipboardPayload(get);
        // Phase 6: a diagram copied from a document pastes as its shapes (newer versions refused with the same message).
        if (!payload) fromDocument = documentDiagramsFromHtml(get('text/html'));
      } catch (err) {
        e.preventDefault();
        live.current.toast(err instanceof Error ? err.message : String(err), 'error');
        return;
      }
      if (payload) {
        e.preventDefault();
        const own = payload.source === instance && payload.serial === serial.current && !!clipboard.current;
        if (own) live.current.paste();
        else live.current.pasteForeign(payload.diagram);
        // Only this editor's own latest copy makes the in-memory shapes current again; after pasting something copied
        // elsewhere, the next Ctrl+V must read the system clipboard again (not this editor's older copy).
        stale.current = !own;
        return;
      }
      if (fromDocument) {
        e.preventDefault();
        live.current.pasteForeign(fromDocument);
        stale.current = true;
        return;
      }
      // Phase 6: the in-memory copy is used only when the paste event carries nothing at all. Anything else on the
      // clipboard (text, a picture, a web page) is newer than those shapes and is not shapes: say so, paste nothing.
      if (!carriesData(data, get)) {
        if (wasPending) live.current.paste();
        return;
      }
      live.current.toast('The clipboard holds no shapes to paste.', 'info');
    };
    const markStale = () => {
      stale.current = true;
    };
    const onVisibility = () => document.visibilityState === 'hidden' && markStale();
    document.addEventListener('copy', onCopy);
    document.addEventListener('cut', onCopy);
    document.addEventListener('paste', onPaste);
    window.addEventListener('blur', markStale);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('copy', onCopy);
      document.removeEventListener('cut', onCopy);
      document.removeEventListener('paste', onPaste);
      window.removeEventListener('blur', markStale);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [readOnly, instance, clipboard]);

  // ── View ───────────────────────────────────────────────────────────────
  const zoomIn = () => void rf.zoomIn({ duration: 150 });
  const zoomOut = () => void rf.zoomOut({ duration: 150 });
  const zoomReset = () => void rf.zoomTo(1, { duration: 150 });

  const [fullscreen, setFullscreen] = useState(false);
  const canFullscreen = useMemo(fullscreenSupported, []);
  useEffect(() => {
    const sync = () => setFullscreen(!!rootRef.current && fullscreenElement() === rootRef.current);
    document.addEventListener('fullscreenchange', sync);
    document.addEventListener('webkitfullscreenchange', sync);
    return () => {
      document.removeEventListener('fullscreenchange', sync);
      document.removeEventListener('webkitfullscreenchange', sync);
    };
  }, []);
  const toggleFullscreen = async () => {
    const el = rootRef.current as FsElement | null;
    const d = fsDoc();
    if (!el || !d) return;
    try {
      if (fullscreenElement()) await (d.exitFullscreen ? d.exitFullscreen() : d.webkitExitFullscreen?.());
      else await (el.requestFullscreen ? el.requestFullscreen() : el.webkitRequestFullscreen?.());
    } catch {
      toast('Full screen is not available here.', 'error');
    }
  };

  const [helpOpen, setHelpOpen] = useState(false);
  const [layersOpen, setLayersOpen] = useState(false);

  // ── Layers ─────────────────────────────────────────────────────────────
  const layerList = layersOrImplicit(layers);
  const [currentLayer, setCurrentLayer] = useState<string | null>(null);
  const activeLayer = currentLayer && layerList.some((l) => l.id === currentLayer) ? currentLayer : layerList[0].id;

  const commitLayers = (next: typeof layerList, ns: ShapeNode[] = nodes) => {
    if (readOnly) return;
    // Shapes are placed by the layers as they are now, so reordering never moves a shape to another layer.
    const norm = normalizeLayers(ns, next, layerList);
    snapshot();
    setLayers(norm.layers);
    setNodes(norm.nodes);
  };
  const layerOps = {
    add: () => {
      const id = newId('layer');
      commitLayers(addLayer(layers, id));
      setCurrentLayer(id);
    },
    rename: (id: string, name: string) => {
      const l = layerList.find((x) => x.id === id);
      if (l && name.trim() && name !== l.name) commitLayers(updateLayer(layerList, id, { name: name.trim() }));
    },
    toggleVisible: (id: string) => commitLayers(updateLayer(layerList, id, { visible: !layerList.find((l) => l.id === id)?.visible })),
    toggleLocked: (id: string) => commitLayers(updateLayer(layerList, id, { locked: !layerList.find((l) => l.id === id)?.locked })),
    move: (id: string, dir: 'up' | 'down') => {
      const next = moveLayer(layerList, id, dir);
      if (next !== layerList) commitLayers(next);
    },
    canDelete: (id: string) => layerList.length > 1 && layerIsEmpty(nodes, layerList, id),
    remove: (id: string) => {
      if (layerList.length > 1 && layerIsEmpty(nodes, layerList, id)) commitLayers(layerList.filter((l) => l.id !== id));
    },
    moveSelection: (id: string) => {
      const byId = byIdOf(nodes);
      if (!selectedNodes.length || selectedNodes.every((n) => layerIdOf(n, layerList, byId) === id)) return;
      commitLayers(layerList, moveToLayer(nodes, id));
    },
    /** Shapes hidden one by one (diagrams.net files can hide cells), which no layer shows. */
    hiddenShapes: nodes.filter((n) => n.hidden).length,
    showHiddenShapes: () => {
      if (readOnly || !nodes.some((n) => n.hidden)) return;
      snapshot();
      setNodes((ns) => ns.map((n) => (n.hidden ? (({ hidden: _h, ...rest }) => rest)(n) : n)));
    },
    setCurrent: setCurrentLayer,
    current: activeLayer,
    list: layerList,
    of: (n: ShapeNode) => layerIdOf(n, layerList, byIdOf(nodes)),
  };

  // Shapes added on the canvas go to the current layer (pasted and connected shapes keep the layer they came with).
  const seen = useRef<Set<string> | null>(null);
  seen.current ??= new Set(initial.nodes.map((n) => n.id));
  // A pasted shape that names a layer this diagram does not have (deleted since the copy, or copied from another
  // diagram) goes to the current layer, or names none when the diagram has no layers: a dangling id would save the
  // diagram as schema 3 for nothing.
  useLayoutEffect(() => {
    const fresh = nodes.filter((n) => !seen.current!.has(n.id));
    fresh.forEach((n) => seen.current!.add(n.id));
    if (readOnly || !fresh.length) return;
    const known = new Set((layers ?? []).map((l) => l.id));
    const dangling = new Set(fresh.filter((n) => n.layer !== undefined && !known.has(n.layer)).map((n) => n.id));
    const toCurrent = layers?.length && activeLayer !== layers[0].id ? new Set(fresh.filter((n) => n.layer === undefined && !n.parentId).map((n) => n.id)) : new Set<string>();
    // A pasted or duplicated shape that lands in a pool, lane or system boundary joins it (@phase5:shapes).
    const loose = fresh.filter((n) => !n.parentId && !n.hidden).map((n) => n.id);
    const anyContainer = loose.length > 0 && nodes.some(isContainer);
    if (!dangling.size && !toCurrent.size && !anyContainer) return;
    setNodes((ns) => {
      const out = ns.map((n) => {
        if (dangling.has(n.id)) {
          if (layers?.length && !n.parentId) return { ...n, layer: activeLayer };
          const { layer: _l, ...rest } = n;
          return rest;
        }
        return toCurrent.has(n.id) ? { ...n, layer: activeLayer } : n;
      });
      return anyContainer ? settleIntoContainers(out, loose) : out;
    });
  }, [nodes, layers, activeLayer, readOnly, setNodes]);

  const controls = {
    // replacements of mutations with the same name
    selectAll,
    copy,
    duplicate,
    align,
    applyLayout,
    addChild,
    addSibling,
    patchNodes,
    editLabel,
    // new
    cut,
    pasteFromClipboard,
    group,
    ungroup,
    lock,
    toggleLock,
    isLocked,
    dragTargetOf,
    allSelectedLocked,
    zOrder,
    distribute,
    zoomIn,
    zoomOut,
    zoomReset,
    canFullscreen,
    fullscreen,
    toggleFullscreen,
    selectMode,
    setSelectMode,
    helpOpen,
    setHelpOpen,
    layersOpen,
    setLayersOpen,
    layerOps,
  };

  return { nodes: rendered, onNodesChange, rootRef, controls };
}

export type CanvasControls = ReturnType<typeof useCanvas>['controls'];
