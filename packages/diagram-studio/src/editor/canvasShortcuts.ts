import type { KeyboardEvent } from 'react';
import type { EditorController } from './controller';
import { topSelected } from './canvasModel';
import type { Shortcut } from './shortcuts';

const mod = (e: KeyboardEvent) => e.metaKey || e.ctrlKey;
const key = (e: KeyboardEvent) => e.key.toLowerCase();
const plain = (e: KeyboardEvent) => !e.metaKey && !e.ctrlKey && !e.altKey;
const anySelected = (ctx: EditorController) => ctx.selectedNodes.length > 0;

/**
 * G-CANVAS shortcuts (bubble phase), added to SHORTCUTS at its `@phase5:shortcuts` marker. Keys a browser also uses
 * (Ctrl+G find next, Ctrl+L address bar, Ctrl+± page zoom) are taken only while the editor has focus, and the
 * selection ones only when something is selected, so the browser keeps them otherwise.
 */
export const CANVAS_SHORTCUTS: Shortcut[] = [
  { id: 'cut', keys: 'Mod+X', description: 'Cut the selected shapes', consume: false, match: (e, ctx) => mod(e) && !e.shiftKey && key(e) === 'x' && anySelected(ctx), run: (ctx) => ctx.cut() },
  {
    id: 'ungroup',
    keys: 'Mod+Shift+G',
    description: 'Ungroup',
    match: (e, ctx) => mod(e) && e.shiftKey && key(e) === 'g' && ctx.selectedNodes.some((n) => n.data.shape === 'group'),
    run: (ctx) => ctx.ungroup(),
  },
  { id: 'group', keys: 'Mod+G', description: 'Group the selected shapes', match: (e, ctx) => mod(e) && !e.shiftKey && key(e) === 'g' && topSelected(ctx.nodes).length > 1, run: (ctx) => ctx.group() },
  { id: 'lock', keys: 'Mod+L', description: 'Lock or unlock the selected shapes', match: (e, ctx) => mod(e) && !e.shiftKey && key(e) === 'l' && anySelected(ctx), run: (ctx) => ctx.toggleLock() },
  { id: 'to-front', keys: 'Mod+Shift+]', description: 'Bring to front', match: (e, ctx) => mod(e) && e.shiftKey && e.code === 'BracketRight' && anySelected(ctx), run: (ctx) => ctx.zOrder('front') },
  { id: 'to-back', keys: 'Mod+Shift+[', description: 'Send to back', match: (e, ctx) => mod(e) && e.shiftKey && e.code === 'BracketLeft' && anySelected(ctx), run: (ctx) => ctx.zOrder('back') },
  { id: 'forward', keys: 'Mod+]', description: 'Bring forward', match: (e, ctx) => mod(e) && !e.shiftKey && e.code === 'BracketRight' && anySelected(ctx), run: (ctx) => ctx.zOrder('forward') },
  { id: 'backward', keys: 'Mod+[', description: 'Send backward', match: (e, ctx) => mod(e) && !e.shiftKey && e.code === 'BracketLeft' && anySelected(ctx), run: (ctx) => ctx.zOrder('backward') },
  { id: 'zoom-in', keys: 'Mod+=', description: 'Zoom in', match: (e) => mod(e) && (e.key === '=' || e.key === '+'), run: (ctx) => ctx.zoomIn() },
  { id: 'zoom-out', keys: 'Mod+-', description: 'Zoom out', match: (e) => mod(e) && (e.key === '-' || e.key === '_'), run: (ctx) => ctx.zoomOut() },
  { id: 'zoom-reset', keys: 'Mod+0', description: 'Zoom to 100%', match: (e) => mod(e) && (e.key === '0' || e.code === 'Digit0'), run: (ctx) => ctx.zoomReset() },
  { id: 'fit', keys: 'Shift+1', description: 'Fit the diagram to the screen', match: (e) => e.shiftKey && plain(e) && e.code === 'Digit1', run: (ctx) => ctx.fitView() },
  { id: 'fullscreen', keys: 'Mod+Shift+F', description: 'Full screen on or off', match: (e, ctx) => mod(e) && e.shiftKey && key(e) === 'f' && ctx.canFullscreen, run: (ctx) => void ctx.toggleFullscreen() },
  { id: 'help', keys: '?', description: 'Show these keyboard shortcuts', match: (e) => e.key === '?' && !e.metaKey && !e.ctrlKey, run: (ctx) => ctx.setHelpOpen(true) },
];
