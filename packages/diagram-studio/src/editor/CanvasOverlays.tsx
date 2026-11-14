import { Button, cn, Dialog, IconButton, Input, Kbd, Menu } from '@dcos/ui';
import { Panel } from '@xyflow/react';
import { Ellipsis, Eye, EyeOff, Lock, LockOpen, Plus, X } from 'lucide-react';
import { useState } from 'react';
import type { EditorController } from './controller';
import { SHORTCUTS } from './shortcuts';

/** Styles of the canvas features: lock badge, locked shapes without resize handles, the full-screen editor. */
export const canvasCss = `
.react-flow__node.dcos-locked .react-flow__resize-control { display: none; }
.react-flow__node.dcos-locked.selected::after {
  content: ''; position: absolute; top: -11px; right: -11px; width: 20px; height: 20px; border-radius: 9999px; pointer-events: none;
  border: 1.5px solid #6366f1; box-shadow: 0 1px 3px rgba(15, 23, 42, .2);
  background: #fff url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%234f46e5' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='4' y='11' width='16' height='10' rx='2'/%3E%3Cpath d='M8 11V7a4 4 0 0 1 8 0v4'/%3E%3C/svg%3E") center / 12px no-repeat;
}
.dcos-canvas-root:fullscreen { background: var(--dc-bg, #fff); }
.dcos-canvas-root:-webkit-full-screen { background: var(--dc-bg, #fff); width: 100%; height: 100%; }
`;

const isApple = () => typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent);
/** A registry key description for this device: `Mod` is ⌘ on Apple devices and Ctrl elsewhere. */
export const keysFor = (keys: string) => keys.replace(/Mod/g, isApple() ? '⌘' : 'Ctrl');

/** The keyboard shortcut help: every entry of the shortcut registry, so it never falls behind the keys. */
export function ShortcutHelp({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} title="Keyboard shortcuts" description="For the diagram editor. Press ? to show this list.">
      {/* Keys pressed in here belong to the dialog, not the canvas behind it. */}
      <div onKeyDown={(e) => e.key !== 'Escape' && e.stopPropagation()}>
        <table className="w-full text-left text-[13px]" aria-label="Keyboard shortcuts">
          <tbody>
            {SHORTCUTS.map((s) => (
              <tr key={s.id} className="border-b border-border last:border-0">
                <td className="py-1.5 pr-4 align-top">
                  <Kbd>{keysFor(s.keys)}</Kbd>
                </td>
                <td className="py-1.5 align-top">{s.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Dialog>
  );
}

function LayerRow({ ctx, id }: { ctx: EditorController; id: string }) {
  const ops = ctx.layerOps;
  const layer = ops.list.find((l) => l.id === id)!;
  const index = ops.list.indexOf(layer);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(layer.name);
  const current = ops.current === id;
  const label = layer.name || 'Untitled layer';
  const commit = () => {
    setRenaming(false);
    ops.rename(id, name);
  };
  return (
    <li className={cn('flex items-center gap-0.5 rounded-lg px-1 py-0.5', current && 'bg-accent-soft')} aria-current={current ? 'true' : undefined}>
      <IconButton label={layer.visible ? `Hide ${label}` : `Show ${label}`} onClick={() => ops.toggleVisible(id)}>
        {layer.visible ? <Eye size={15} /> : <EyeOff size={15} className="text-muted" />}
      </IconButton>
      <IconButton label={layer.locked ? `Unlock ${label}` : `Lock ${label}`} onClick={() => ops.toggleLocked(id)}>
        {layer.locked ? <Lock size={15} /> : <LockOpen size={15} className="text-muted" />}
      </IconButton>
      {renaming ? (
        <Input
          autoFocus
          aria-label={`Name of ${label}`}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') {
              e.preventDefault();
              setName(layer.name);
              setRenaming(false);
            }
          }}
          className="h-7 min-w-0 flex-1"
        />
      ) : (
        <button
          type="button"
          className={cn('min-w-0 flex-1 truncate rounded-md px-1.5 py-1 text-left text-[13px] hover:bg-surface-2', !layer.visible && 'text-muted')}
          title="New shapes go to the current layer. Double-click to rename."
          aria-label={`${label}${current ? ' (current layer)' : ''}`}
          onClick={() => ops.setCurrent(id)}
          onDoubleClick={() => {
            setName(layer.name);
            setRenaming(true);
          }}
        >
          {label}
        </button>
      )}
      <Menu
        align="end"
        trigger={(p) => (
          <IconButton label={`More for ${label}`} {...p}>
            <Ellipsis size={15} />
          </IconButton>
        )}
        items={[
          {
            label: 'Rename…',
            onSelect: () => {
              setName(layer.name);
              setRenaming(true);
            },
          },
          { label: 'Move up', disabled: index === ops.list.length - 1, onSelect: () => ops.move(id, 'up') },
          { label: 'Move down', disabled: index === 0, onSelect: () => ops.move(id, 'down') },
          { label: 'Move selection here', disabled: !ctx.selectedNodes.length, onSelect: () => ops.moveSelection(id) },
          { label: ops.canDelete(id) ? 'Delete layer' : 'Delete layer (only when empty)', danger: true, disabled: !ops.canDelete(id), onSelect: () => ops.remove(id) },
        ]}
      />
    </li>
  );
}

/** The Layers panel: top layer first, as diagrams.net lists them. */
export function LayersPanel({ ctx }: { ctx: EditorController }) {
  const ops = ctx.layerOps;
  return (
    <section aria-label="Layers" className="w-64 max-w-[calc(100vw-2rem)] rounded-xl border border-border bg-surface p-2.5 text-fg shadow-lg" onKeyDown={(e) => e.stopPropagation()}>
      <div className="mb-1.5 flex items-center gap-1">
        <h2 className="flex-1 pl-1 text-sm font-semibold">Layers</h2>
        <IconButton label="Add layer" onClick={ops.add}>
          <Plus size={15} />
        </IconButton>
        <IconButton label="Close layers" onClick={() => ctx.setLayersOpen(false)}>
          <X size={15} />
        </IconButton>
      </div>
      <ul className="grid gap-0.5">
        {[...ops.list].reverse().map((l) => (
          <LayerRow key={l.id} ctx={ctx} id={l.id} />
        ))}
      </ul>
      {ops.hiddenShapes > 0 && (
        <div className="mt-2 flex items-center gap-2 rounded-lg bg-surface-2 px-2 py-1.5 text-[12px]">
          <EyeOff size={14} className="shrink-0 text-muted" />
          <span className="flex-1">{ops.hiddenShapes === 1 ? '1 shape is hidden.' : `${ops.hiddenShapes} shapes are hidden.`}</span>
          <Button size="sm" variant="ghost" onClick={ops.showHiddenShapes}>
            Show hidden shapes
          </Button>
        </div>
      )}
      <p className="mt-2 px-1 text-[11px] leading-snug text-muted">Hidden layers are not shown or exported as images. Shapes on a locked layer cannot be selected.</p>
    </section>
  );
}

/** Shown in place of the Format panel when every selected shape is locked. */
export function LockedInspector({ ctx }: { ctx: EditorController }) {
  const n = ctx.selectedNodes.length;
  const own = ctx.selectedNodes.some((x) => x.locked);
  const viaGroup = ctx.selectedNodes.some((x) => !x.locked);
  return (
    <div className="grid gap-3">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <Lock size={15} /> {n > 1 ? `${n} locked shapes` : 'Locked shape'}
      </div>
      <p className="text-[13px] text-muted">A locked shape cannot be moved, resized, edited or deleted. Unlock it to change it.</p>
      {viaGroup && <p className="text-[13px] text-muted">{n > 1 ? 'Some of these are' : 'It is'} inside a locked group: select the group and unlock it.</p>}
      {own && (
        <Button size="sm" icon={<LockOpen size={14} />} onClick={() => ctx.lock(false)}>
          Unlock
        </Button>
      )}
    </div>
  );
}

/** Canvas overlays: the Layers panel (inside React Flow) and the shortcut help. */
export function CanvasOverlays({ ctx }: { ctx: EditorController }) {
  return (
    <>
      <style>{canvasCss}</style>
      {ctx.layersOpen && !ctx.readOnly && (
        <Panel position="top-left">
          <LayersPanel ctx={ctx} />
        </Panel>
      )}
      <ShortcutHelp open={ctx.helpOpen} onClose={() => ctx.setHelpOpen(false)} />
    </>
  );
}
