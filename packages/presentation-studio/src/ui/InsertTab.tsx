import { Plus, Type } from 'lucide-react';
import { InsertGroups } from '../elements/InsertGroups';
import type { RibbonContext } from './context';
import { LayoutMenu } from './LayoutPicker';
import { Group, ToolButton } from './parts';

/**
 * The Insert tab: new slides and text boxes (Round 2a); pictures, shapes, tables, charts and diagrams (Round 2b
 * CONTENT, elements/InsertGroups.tsx).
 */
export function InsertTab(ctx: RibbonContext) {
  return (
    <>
      <Group label="Slides">
        <ToolButton label="New slide" text="New slide" onClick={() => ctx.newSlide()}>
          <Plus size={16} />
        </ToolButton>
        <LayoutMenu content={ctx.content} onPick={(id) => ctx.newSlide(id)} />
      </Group>
      <Group label="Text">
        <ToolButton label="Text box" text="Text box" onClick={ctx.insertTextBox} disabled={!ctx.slide}>
          <Type size={16} />
        </ToolButton>
      </Group>
      {/* CONTENT (Round 2b): pictures, shapes, tables, charts and diagrams, each with a working insert flow. */}
      {ctx.contentTools && <InsertGroups tools={ctx.contentTools} hasSlide={!!ctx.slide} />}
    </>
  );
}
