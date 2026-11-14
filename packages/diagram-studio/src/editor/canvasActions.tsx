import { Button, IconButton, Menu } from '@dcos/ui';
import { AlignHorizontalSpaceBetween, AlignVerticalSpaceBetween, ArrowDownToLine, ArrowUpToLine, ChevronDown, Group, Keyboard, Layers, Lock, LockOpen, Maximize2, Minimize2, SquareDashedMousePointer, SquareStack, Ungroup } from 'lucide-react';
import { topSelected } from './canvasModel';
import type { EditorController } from './controller';
import type { SelectionAction } from './selectionActions';
import type { ToolbarGroup } from './Toolbar';

const movable = (ctx: EditorController) => topSelected(ctx.nodes).filter((n) => !ctx.isLocked(n.id));

/** G-CANVAS selection actions (toolbar icons while they apply), added at the `@phase5:selection-actions` marker. */
export const CANVAS_SELECTION_ACTIONS: SelectionAction[] = [
  {
    id: 'distribute-horizontal',
    label: 'Distribute horizontally',
    icon: <AlignHorizontalSpaceBetween size={16} />,
    when: (ctx) => !ctx.readOnly && movable(ctx).length >= 3,
    run: (ctx) => ctx.distribute('horizontal'),
  },
  {
    id: 'distribute-vertical',
    label: 'Distribute vertically',
    icon: <AlignVerticalSpaceBetween size={16} />,
    when: (ctx) => !ctx.readOnly && movable(ctx).length >= 3,
    run: (ctx) => ctx.distribute('vertical'),
  },
  { id: 'group', label: 'Group (Ctrl+G)', icon: <Group size={16} />, when: (ctx) => !ctx.readOnly && topSelected(ctx.nodes).length >= 2, run: (ctx) => ctx.group() },
  {
    id: 'ungroup',
    label: 'Ungroup (Ctrl+Shift+G)',
    icon: <Ungroup size={16} />,
    when: (ctx) => !ctx.readOnly && ctx.selectedNodes.some((n) => n.data.shape === 'group' && !n.locked), // a locked group stays a group
    run: (ctx) => ctx.ungroup(),
  },
  { id: 'lock', label: 'Lock (Ctrl+L)', icon: <Lock size={16} />, when: (ctx) => !ctx.readOnly && ctx.selectedNodes.some((n) => !n.locked), run: (ctx) => ctx.lock(true) },
  { id: 'unlock', label: 'Unlock (Ctrl+L)', icon: <LockOpen size={16} />, when: (ctx) => !ctx.readOnly && ctx.selectedNodes.some((n) => n.locked), run: (ctx) => ctx.lock(false) },
];

/** G-CANVAS toolbar groups, added at the `@phase5:toolbar` marker. */
export const CANVAS_TOOLBAR_GROUPS: ToolbarGroup[] = [
  {
    id: 'order',
    visible: (ctx) => !ctx.readOnly && ctx.selectedNodes.length > 0,
    render: (ctx) => (
      <Menu
        trigger={(p) => (
          <Button size="sm" variant="ghost" icon={<SquareStack size={15} />} aria-label="Order" title="Stacking order" {...p}>
            <span className="hidden sm:inline">Order</span> <ChevronDown size={13} />
          </Button>
        )}
        items={[
          { label: 'Bring to front', hint: 'Ctrl+Shift+]', icon: <ArrowUpToLine size={14} />, onSelect: () => ctx.zOrder('front') },
          { label: 'Bring forward', hint: 'Ctrl+]', onSelect: () => ctx.zOrder('forward') },
          { label: 'Send backward', hint: 'Ctrl+[', onSelect: () => ctx.zOrder('backward') },
          { label: 'Send to back', hint: 'Ctrl+Shift+[', icon: <ArrowDownToLine size={14} />, onSelect: () => ctx.zOrder('back') },
        ]}
      />
    ),
  },
  {
    id: 'view',
    render: (ctx) => (
      <>
        {!ctx.readOnly && (
          <IconButton label={ctx.selectMode ? 'Select several: on (tap shapes to add or remove them)' : 'Select several (tap shapes to add or remove them)'} active={ctx.selectMode} onClick={() => ctx.setSelectMode(!ctx.selectMode)}>
            <SquareDashedMousePointer size={16} />
          </IconButton>
        )}
        {!ctx.readOnly && (
          <IconButton label="Layers" active={ctx.layersOpen} onClick={() => ctx.setLayersOpen(!ctx.layersOpen)}>
            <Layers size={16} />
          </IconButton>
        )}
        {ctx.canFullscreen && (
          <IconButton label={ctx.fullscreen ? 'Exit full screen (Ctrl+Shift+F)' : 'Full screen (Ctrl+Shift+F)'} active={ctx.fullscreen} onClick={() => void ctx.toggleFullscreen()}>
            {ctx.fullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </IconButton>
        )}
        <IconButton label="Keyboard shortcuts (?)" onClick={() => ctx.setHelpOpen(true)}>
          <Keyboard size={16} />
        </IconButton>
      </>
    ),
  },
];
