import type { KeyboardEvent } from 'react';
import { directionFromKey } from '../quickConnectGeometry';
import type { EditorController } from './controller';
import { CANVAS_SHORTCUTS } from './canvasShortcuts';

/**
 * Keyboard shortcuts. The editor runs the first entry whose `match` accepts a key press (and none at all while the
 * diagram is read-only or a text field has focus). Entries without `match` are handled elsewhere (React Flow) and
 * are listed only so a shortcut help can show every key.
 */
export interface Shortcut {
  id: string;
  /** As shown to the user; `Mod` is Ctrl, or ⌘ on Apple devices. */
  keys: string;
  description: string;
  /** 'capture' runs before React Flow sees the key (needed for keys React Flow also handles). Default 'bubble'. */
  phase?: 'capture' | 'bubble';
  match?: (e: KeyboardEvent, ctx: EditorController) => boolean;
  run?: (ctx: EditorController, e: KeyboardEvent) => void;
  /** Stop the browser's own action and other handlers. Default true. */
  consume?: boolean;
}

export function isTyping(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
}

/** Tree shortcuts (Tab, Enter, F2) belong to the canvas; on buttons and menus they keep their normal meaning (audit DIAG-5). */
export function onCanvas(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  return !!el?.closest('.react-flow') && !el.closest('button, a, [role="menuitem"], .react-flow__panel');
}

const ARROWS = new Set(['arrowup', 'arrowdown', 'arrowleft', 'arrowright']);
const mod = (e: KeyboardEvent) => e.metaKey || e.ctrlKey;
const key = (e: KeyboardEvent) => e.key.toLowerCase();
/** Tree shortcuts need the canvas focused and exactly one shape selected. */
const treeKey = (k: string) => (e: KeyboardEvent, ctx: EditorController) => key(e) === k && onCanvas(e.target) && ctx.selectedNodes.length === 1;

/** When each editor (keyed by its history) last recorded an undo step for arrow-key moves. */
const lastArrowSnapshot = new WeakMap<object, number>();

export const SHORTCUTS: Shortcut[] = [
  // Capture phase, in order.
  {
    id: 'quick-connect',
    keys: 'Alt+Shift+Arrow',
    description: 'Add a connected shape in that direction',
    phase: 'capture',
    match: (e, ctx) => e.altKey && e.shiftKey && directionFromKey(e.key) !== null && ctx.selectedNodes.length === 1,
    run: (ctx, e) => ctx.quickCreate(directionFromKey(e.key)!),
  },
  {
    // Runs before React Flow moves nodes with the arrow keys, so the move can be undone (audit DIAG-4).
    id: 'nudge',
    keys: 'Arrow keys',
    description: 'Move the selected shapes',
    phase: 'capture',
    consume: false,
    match: (e, ctx) => ARROWS.has(key(e)) && ctx.selectedNodes.length > 0 && onCanvas(e.target),
    run: (ctx) => {
      // One undo step per burst of arrow presses.
      if (Date.now() - (lastArrowSnapshot.get(ctx.history) ?? 0) > 800) ctx.snapshot();
      lastArrowSnapshot.set(ctx.history, Date.now());
    },
  },
  // Bubble phase, in order.
  { id: 'undo', keys: 'Mod+Z', description: 'Undo', match: (e) => mod(e) && key(e) === 'z' && !e.shiftKey, run: (ctx) => ctx.undo() },
  { id: 'redo', keys: 'Mod+Shift+Z or Mod+Y', description: 'Redo', match: (e) => (mod(e) && key(e) === 'z' && e.shiftKey) || (mod(e) && key(e) === 'y'), run: (ctx) => ctx.redo() },
  { id: 'duplicate', keys: 'Mod+D', description: 'Duplicate the selected shapes', match: (e) => mod(e) && key(e) === 'd', run: (ctx) => ctx.duplicate() },
  { id: 'copy', keys: 'Mod+C', description: 'Copy the selected shapes', consume: false, match: (e) => mod(e) && key(e) === 'c', run: (ctx) => ctx.copy() },
  // @phase5:canvas (G-CANVAS) — not consumed, so the paste event can bring shapes copied in another diagram or tab.
  { id: 'paste', keys: 'Mod+V', description: 'Paste', consume: false, match: (e) => mod(e) && key(e) === 'v', run: (ctx, e) => ctx.pasteFromClipboard(e) },
  { id: 'select-all', keys: 'Mod+A', description: 'Select all shapes and connectors', match: (e) => mod(e) && key(e) === 'a', run: (ctx) => ctx.selectAll() },
  // @phase5:shortcuts — new shortcuts (bubble phase; put capture-phase ones with the capture entries above).
  ...CANVAS_SHORTCUTS, // @phase5:canvas (G-CANVAS) — cut, group, lock, order, zoom, full screen, help (canvasShortcuts.ts).
  {
    // @phase5:connect — the label of a selected connector (double-clicking the connector does the same).
    id: 'edit-connector-label',
    keys: 'F2 or Enter',
    description: 'Edit the label of the selected connector',
    match: (e, ctx) => (key(e) === 'f2' || key(e) === 'enter') && onCanvas(e.target) && ctx.selectedEdges.length === 1 && ctx.selectedNodes.length === 0,
    run: (ctx) => ctx.editLabel(ctx.selectedEdges[0].id),
  },
  { id: 'add-child', keys: 'Tab', description: 'Add a child to the selected shape', match: treeKey('tab'), run: (ctx) => ctx.addChild() },
  { id: 'add-sibling', keys: 'Enter', description: 'Add a sibling to the selected shape', match: treeKey('enter'), run: (ctx) => ctx.addSibling() },
  { id: 'edit-label', keys: 'F2', description: 'Edit the text of the selected shape', match: treeKey('f2'), run: (ctx) => ctx.editLabel(ctx.selectedNodes[0].id) },
  // Handled by React Flow; listed for the shortcut help.
  { id: 'delete', keys: 'Delete or Backspace', description: 'Delete the selection' },
  { id: 'multi-select', keys: 'Shift, Ctrl or ⌘ + click', description: 'Add to the selection' },
];

/**
 * Keys pressed in a dialog over the editor (Export options, the shortcut help) belong to that dialog, not the diagram
 * behind it. A dialog that holds the editor itself (a diagram edited inside a document) does not count: there the
 * canvas has the keyboard as usual. `root` is the editor's own element.
 */
export function inDialog(target: EventTarget | null, root: Element | null) {
  const el = target as HTMLElement | null;
  const dialog = el?.closest?.('dialog, [role="dialog"]');
  return !!dialog && !(root && dialog.contains(root));
}

/** Runs the first matching shortcut for this phase. */
export function handleShortcut(phase: 'capture' | 'bubble', e: KeyboardEvent, ctx: EditorController) {
  if (ctx.readOnly || isTyping(e.target) || inDialog(e.target, e.currentTarget as Element)) return;
  for (const s of SHORTCUTS) {
    if ((s.phase ?? 'bubble') !== phase || !s.match || !s.run || !s.match(e, ctx)) continue;
    if (s.consume !== false) {
      e.preventDefault();
      e.stopPropagation();
    }
    s.run(ctx, e);
    return;
  }
}
