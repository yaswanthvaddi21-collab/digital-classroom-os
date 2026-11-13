import { Button } from '@dcos/ui';
import { Ruler } from 'lucide-react';
import { PAPER_LABELS } from '../../types';
import type { RibbonContext } from './context';
import { LayoutGroups, PageLayoutControls } from './layout/LayoutControls'; // G-LAYOUT
import { Group } from './parts';

/** Layout: page size, orientation, margins, header and footer. */
export function LayoutTab(ctx: RibbonContext) {
  const { page, onPageSetup } = ctx;
  return (
    <>
      <Group label="Page setup" className="gap-2">
        <Button size="sm" variant="ghost" icon={<Ruler size={15} />} onClick={onPageSetup} aria-label="Page setup: size, margins, header and footer">
          Page setup
        </Button>
        <span className="whitespace-nowrap text-xs text-muted">
          {PAPER_LABELS[page.size]?.short ?? page.size}, {page.orientation}
        </span>
        {/* @phase4:layout-page — page size, columns and breaks go here. */}
        {/* G-LAYOUT: paper size, orientation and columns (of the current section), breaks. */}
        <PageLayoutControls {...ctx} />
      </Group>
      {/* @phase4:layout — add further Layout tab groups here. */}
      {/* G-LAYOUT: header and footer, page numbers, sections. */}
      <LayoutGroups {...ctx} />
    </>
  );
}
