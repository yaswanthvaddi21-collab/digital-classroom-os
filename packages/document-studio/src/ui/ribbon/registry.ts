import type { ComponentType } from 'react';
import { DiagramRibbon } from '../DiagramRibbon';
import type { RibbonContext } from './context';
import { HomeTab } from './HomeTab';
import { InsertTab } from './InsertTab';
import { LayoutTab } from './LayoutTab';
import { ReviewTab } from './ReviewTab';

export interface RibbonTab {
  id: string;
  label: string;
  /** Tabs only appear when they have something to show (e.g. Layout has only Advanced controls). */
  hasContent(ctx: RibbonContext): boolean;
  Content: ComponentType<RibbonContext>;
}

/** The ribbon's tabs, in order. */
export const RIBBON_TABS: RibbonTab[] = [
  { id: 'home', label: 'Home', hasContent: () => true, Content: HomeTab },
  { id: 'insert', label: 'Insert', hasContent: () => true, Content: InsertTab },
  { id: 'layout', label: 'Layout', hasContent: (c) => c.advanced, Content: LayoutTab },
  { id: 'review', label: 'Review', hasContent: (c) => c.advanced, Content: ReviewTab },
  { id: 'diagram', label: 'Diagram', hasContent: (c) => !!c.diagramHost, Content: DiagramRibbon },
  // @phase4:ribbon-tabs — register new tabs here (or widen a tab's hasContent when it gains Simple-mode controls).
];

export const visibleTabs = (ctx: RibbonContext) => RIBBON_TABS.filter((t) => t.hasContent(ctx));
