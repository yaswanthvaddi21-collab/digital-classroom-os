import { Button, IconButton, Menu, Select, Separator } from '@dcos/ui';
import { ChevronDown, Columns2, Hash, Info, PanelsTopLeft, ScissorsLineDashed, SeparatorHorizontal, Settings2 } from 'lucide-react';
import { useState } from 'react';
import { MAX_COLUMNS } from '../../../pageLayout';
import { PAPER_LABELS, type Orientation, type PageSettings, type PageSize } from '../../../types';
import { Popover } from '../../Popover';
import type { RibbonContext } from '../context';
import { Group } from '../parts';
import { HeaderFooterDialog } from './HeaderFooterDialog';
import { PageNumbersDialog } from './PageNumbersDialog';
import { SectionDialog } from './SectionDialog';
import { applyToSection, columnWidthMm, layoutProblem, MIN_COLUMN_MM, orientationProblem, useSection } from './useSection';

/** Paper size (whole document), orientation and columns (the section holding the cursor), and breaks. */
export function PageLayoutControls({ editor, page, onPageChange }: RibbonContext) {
  const info = useSection(editor, page);
  const { current } = info;
  const continuous = current.breakType === 'continuous';
  const set = (patch: Parameters<typeof applyToSection>[4]) => applyToSection(editor, page, onPageChange, info, patch);
  const sectionName = info.count > 1 ? ` (section ${info.index + 1})` : '';

  return (
    <>
      <Select
        aria-label="Paper size"
        value={page.size}
        onChange={(e) => {
          const next = { ...page, size: e.target.value as PageSize };
          // A forced change (a script or a stale control) is refused like the disabled option.
          if (!layoutProblem(next, info.breaks)) onPageChange?.(next);
        }}
        className="h-8 w-auto text-[13px]"
        disabled={!onPageChange}
      >
        {Object.entries(PAPER_LABELS).map(([id, label]) => {
          const problem = id !== page.size ? layoutProblem({ ...page, size: id as PageSize }, info.breaks) : null;
          return (
            <option key={id} value={id} disabled={!!problem} title={problem ? `${label.long}: ${problem}` : label.long}>
              {label.short}
              {problem ? (/columns/.test(problem) ? ' — too narrow' : ' — margins too wide') : ''}
            </option>
          );
        })}
      </Select>
      <Select
        aria-label={`Orientation${sectionName}`}
        title={continuous ? 'A continuous section keeps the orientation of the section before it' : undefined}
        value={current.orientation}
        disabled={continuous}
        onChange={(e) => set({ orientation: e.target.value as Orientation })}
        className="h-8 w-auto text-[13px]"
      >
        {(['portrait', 'landscape'] as const).map((o) => {
          const problem = o !== current.orientation && orientationProblem(page, o);
          return (
            <option key={o} value={o} disabled={!!problem} title={problem || undefined}>
              {o === 'portrait' ? 'Portrait' : 'Landscape'}
              {problem ? ' — margins too wide' : ''}
            </option>
          );
        })}
      </Select>
      <Select aria-label={`Columns${sectionName}`} value={String(current.columns)} onChange={(e) => set({ columns: Number(e.target.value) })} className="h-8 w-auto text-[13px]">
        {Array.from({ length: MAX_COLUMNS }, (_, i) => i + 1).map((n) => {
          const narrow = n > 1 && columnWidthMm(page, current.orientation, n, current.columnSpacing) < MIN_COLUMN_MM;
          return (
            <option key={n} value={n} disabled={narrow && n !== current.columns}>
              {n === 1 ? 'One column' : `${n} columns`}
              {narrow ? ' — too narrow' : ''}
            </option>
          );
        })}
      </Select>
      <Menu
        trigger={(p) => (
          <Button size="sm" variant="ghost" icon={<SeparatorHorizontal size={15} />} aria-label="Breaks" {...p}>
            Breaks <ChevronDown size={13} />
          </Button>
        )}
        items={[
          { label: 'Page break', icon: <ScissorsLineDashed size={14} />, hint: 'Ctrl+Enter', onSelect: () => editor.chain().focus().setPageBreak().run() },
          { label: 'Section break (next page)', icon: <SeparatorHorizontal size={14} />, onSelect: () => editor.chain().focus().insertSectionBreak({ breakType: 'nextPage' }).run() },
          { label: 'Section break (continuous)', icon: <Columns2 size={14} />, onSelect: () => editor.chain().focus().insertSectionBreak({ breakType: 'continuous' }).run() },
        ]}
      />
    </>
  );
}

function LayoutHelp() {
  return (
    <Popover
      align="end"
      trigger={({ toggle, open }) => (
        <IconButton label="How layout prints" aria-expanded={open} onClick={toggle}>
          <Info size={16} />
        </IconButton>
      )}
    >
      {() => (
        <div className="grid w-80 max-w-[calc(100vw-2rem)] gap-2 text-xs" role="note" aria-label="How layout prints">
          <p className="font-semibold text-fg">What shows where</p>
          <ul className="grid list-disc gap-1 pl-4 text-muted">
            <li>The editor shows one continuous sheet in one column. Section breaks are marked with a labelled line; columns, page boundaries and page numbers are written to Word (.docx) exports and appear in print/PDF.</li>
            <li>Word (.docx): real sections, columns, orientation, page numbering and headers/footers.</li>
            <li>PDF / print: columns work in every browser. Headers, footers, page numbers, and a section&apos;s own orientation or numbering need a recent Chrome or Edge.</li>
          </ul>
        </div>
      )}
    </Popover>
  );
}

/** Header and footer, page numbers and the current section's settings. */
export function LayoutGroups({ editor, page, onPageChange }: RibbonContext) {
  const info = useSection(editor, page);
  const [open, setOpen] = useState<null | 'headerFooter' | 'numbers' | 'section'>(null);
  const apply = (p: PageSettings) => onPageChange?.(p);
  return (
    <>
      <Separator vertical />
      <Group label="Header and footer" className="gap-1">
        <Button size="sm" variant="ghost" icon={<PanelsTopLeft size={15} />} onClick={() => setOpen('headerFooter')} disabled={!onPageChange}>
          Header &amp; footer
        </Button>
        <Button size="sm" variant="ghost" icon={<Hash size={15} />} onClick={() => setOpen('numbers')} disabled={!onPageChange}>
          Page numbers
        </Button>
      </Group>
      <Separator vertical />
      <Group label="Section" className="gap-1.5">
        <span className="whitespace-nowrap text-xs text-muted" aria-live="polite">
          Section {info.index + 1} of {info.count}
        </span>
        <Button size="sm" variant="ghost" icon={<Settings2 size={15} />} onClick={() => setOpen('section')} aria-label={`Section ${info.index + 1} settings`}>
          Section
        </Button>
        <LayoutHelp />
      </Group>
      {open === 'headerFooter' && <HeaderFooterDialog page={page} onApply={apply} onClose={() => setOpen(null)} />}
      {open === 'numbers' && <PageNumbersDialog page={page} onApply={apply} onClose={() => setOpen(null)} />}
      {open === 'section' && (
        <SectionDialog
          page={page}
          info={info}
          onApply={(patch) => applyToSection(editor, page, onPageChange, info, patch)}
          onRemove={() => {
            const at = info.break?.pos;
            if (at === undefined) return;
            editor
              .chain()
              .focus()
              .command(({ tr }) => {
                const node = tr.doc.nodeAt(at);
                if (!node || node.type.name !== 'sectionBreak') return false;
                tr.delete(at, at + node.nodeSize);
                return true;
              })
              .run();
          }}
          onClose={() => setOpen(null)}
        />
      )}
    </>
  );
}
