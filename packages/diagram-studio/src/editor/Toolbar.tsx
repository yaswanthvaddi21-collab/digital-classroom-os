import { Button, IconButton, Menu, Select, Separator } from '@dcos/ui';
import { ChevronDown, Copy, CornerDownRight, Grid3x3, Magnet, Maximize, Network, Plus, Redo2, Trash2, Undo2 } from 'lucide-react';
import { Fragment, type ReactNode } from 'react';
import type { EdgeLineType } from '../types';
import { arrangeMenuItems, TIMELINE_TOOLBAR_GROUP } from '../library/editorActions';
import { CANVAS_TOOLBAR_GROUPS } from './canvasActions';
import type { EditorController } from './controller';
import { selectionActionsFor } from './selectionActions';

/** One run of toolbar controls; groups are separated by a divider. `visible` false hides the group and its divider. */
export interface ToolbarGroup {
  id: string;
  visible?: (ctx: EditorController) => boolean;
  render: (ctx: EditorController) => ReactNode;
}

export const TOOLBAR_GROUPS: ToolbarGroup[] = [
  {
    id: 'history',
    render: (ctx) => (
      <>
        <IconButton label="Undo (Ctrl+Z)" disabled={ctx.readOnly || !ctx.history.current.canUndo} onClick={ctx.undo}>
          <Undo2 size={16} />
        </IconButton>
        <IconButton label="Redo (Ctrl+Shift+Z)" disabled={ctx.readOnly || !ctx.history.current.canRedo} onClick={ctx.redo}>
          <Redo2 size={16} />
        </IconButton>
      </>
    ),
  },
  {
    id: 'edit',
    render: (ctx) => (
      <>
        <IconButton label="Duplicate (Ctrl+D)" disabled={ctx.readOnly || !ctx.selectedNodes.length} onClick={ctx.duplicate}>
          <Copy size={16} />
        </IconButton>
        <IconButton label="Delete (Del)" disabled={ctx.readOnly || (!ctx.selectedNodes.length && !ctx.selectedEdges.length)} onClick={ctx.deleteSelected}>
          <Trash2 size={16} />
        </IconButton>
      </>
    ),
  },
  {
    id: 'tree',
    render: (ctx) => (
      <>
        <IconButton label="Add child (Tab)" disabled={ctx.readOnly || !ctx.single} onClick={() => ctx.addChild()}>
          <CornerDownRight size={16} />
        </IconButton>
        <IconButton label="Add sibling (Enter)" disabled={ctx.readOnly || !ctx.single} onClick={ctx.addSibling}>
          <Plus size={16} />
        </IconButton>
        <Menu
          trigger={(p) => (
            <Button size="sm" variant="ghost" icon={<Network size={15} />} disabled={ctx.readOnly} {...p}>
              <span className="hidden sm:inline">Arrange</span> <ChevronDown size={13} />
            </Button>
          )}
          items={[
            { label: 'Tree: top to bottom', onSelect: () => ctx.applyLayout('TB') },
            { label: 'Tree: left to right', onSelect: () => ctx.applyLayout('LR') },
            ...arrangeMenuItems(ctx), // @phase5:shapes (G-SHAPES) — mind map and timeline layouts (library/editorActions.tsx).
            {
              label: ctx.settings.autoLayout === 'none' ? 'Auto-arrange is off' : 'Turn off auto-arrange',
              disabled: ctx.settings.autoLayout === 'none',
              onSelect: () => ctx.changeSettings((s) => ({ ...s, autoLayout: 'none' })),
            },
          ]}
        />
      </>
    ),
  },
  {
    id: 'selection',
    visible: (ctx) => selectionActionsFor(ctx).length > 0,
    render: (ctx) =>
      selectionActionsFor(ctx).map((a) => (
        <IconButton key={a.id} label={a.label} onClick={() => a.run(ctx)}>
          {a.icon}
        </IconButton>
      )),
  },
  {
    id: 'canvas',
    render: (ctx) => (
      <>
        <IconButton label={ctx.settings.showGrid ? 'Hide grid' : 'Show grid'} active={ctx.settings.showGrid} disabled={ctx.readOnly} onClick={() => ctx.changeSettings((s) => ({ ...s, showGrid: !s.showGrid }))}>
          <Grid3x3 size={16} />
        </IconButton>
        <IconButton
          label={ctx.settings.snapToGrid ? 'Snap to grid: on' : 'Snap to grid: off'}
          active={ctx.settings.snapToGrid}
          disabled={ctx.readOnly}
          onClick={() => ctx.changeSettings((s) => ({ ...s, snapToGrid: !s.snapToGrid }))}
        >
          <Magnet size={16} />
        </IconButton>
        <IconButton label="Fit diagram to screen" onClick={ctx.fitView}>
          <Maximize size={16} />
        </IconButton>
      </>
    ),
  },
  {
    id: 'connector',
    render: (ctx) => (
      <Select
        aria-label="Line style for new connectors"
        title="Line style for new connectors"
        value={ctx.lineType}
        disabled={ctx.readOnly}
        onChange={(e) => ctx.changeSettings((s) => ({ ...s, connector: e.target.value as EdgeLineType }))}
      >
        <option value="smoothstep">New lines: Elbow</option>
        <option value="step">New lines: Orthogonal</option>
        <option value="straight">New lines: Straight</option>
        <option value="default">New lines: Curved</option>
      </Select>
    ),
  },
  TIMELINE_TOOLBAR_GROUP, // @phase5:shapes (G-SHAPES) — "Add event" while the diagram has a timeline.
  // @phase5:toolbar — new groups (full-screen, layers, z-order …), in display order.
  ...CANVAS_TOOLBAR_GROUPS, // @phase5:canvas (G-CANVAS) — Order menu; select several, Layers, full screen, shortcuts (canvasActions.tsx).
];

/** The toolbar's controls: each visible group, with a divider between groups. */
export function ToolbarGroups({ ctx }: { ctx: EditorController }) {
  const groups = TOOLBAR_GROUPS.filter((g) => !g.visible || g.visible(ctx));
  return (
    <>
      {groups.map((g, i) => (
        <Fragment key={g.id}>
          {i > 0 && <Separator vertical />}
          {g.render(ctx)}
        </Fragment>
      ))}
    </>
  );
}
