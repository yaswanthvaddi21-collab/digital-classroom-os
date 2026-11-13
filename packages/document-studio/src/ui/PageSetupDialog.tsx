import { Button, Dialog, Input, Select } from '@dcos/ui';
import { useState } from 'react';
import { PAGE_FIELD_CHECKS, PAPER_LABELS, type PageSettings } from '../types';
import { layoutProblem } from './ribbon/layout/useSection';

const PRESETS: Record<string, PageSettings['margins']> = {
  Normal: { top: 25.4, right: 25.4, bottom: 25.4, left: 25.4 },
  Narrow: { top: 12.7, right: 12.7, bottom: 12.7, left: 12.7 },
  Wide: { top: 25.4, right: 50.8, bottom: 25.4, left: 50.8 },
  'University (binding)': { top: 25.4, right: 25.4, bottom: 25.4, left: 38.1 },
};

const clamp = (n: number) => Math.min(Math.max(Number.isFinite(n) ? n : 0, 0), 80);

export function PageSetupDialog({
  page,
  breaks = [],
  onApply,
  onClose,
}: {
  page: PageSettings;
  /** Attributes of the document's section breaks: every section must keep room for text. */
  breaks?: ReadonlyArray<Record<string, unknown>>;
  onApply: (p: PageSettings) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<PageSettings>(page);
  const set = (patch: Partial<PageSettings>) => setDraft((d) => ({ ...d, ...patch }));
  const setMargin = (k: keyof PageSettings['margins'], v: string) => setDraft((d) => ({ ...d, margins: { ...d.margins, [k]: clamp(parseFloat(v)) } }));
  // G-LAYOUT: with A5 (and landscape pages) the margins can leave no room for text; such a page would reopen protected.
  const problem = PAGE_FIELD_CHECKS.margins(draft.margins, draft as unknown as Record<string, unknown>) ?? layoutProblem(draft, breaks);

  return (
    <Dialog
      open
      onClose={onClose}
      title="Page setup"
      description="Applies to the editor, PDF and DOCX exports."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={!!problem}
            onClick={() => {
              onApply(draft);
              onClose();
            }}
          >
            Apply
          </Button>
        </>
      }
    >
      <div className="grid gap-5">
        {/* @phase4:layout-dialog — further page settings (columns, numbering) go here. */}
        {problem && (
          <p role="alert" className="text-sm text-danger">
            {/^section \d/.test(problem)
              ? `${problem[0].toUpperCase()}${problem.slice(1)}. Make the margins smaller or choose a larger paper size.`
              : 'The margins leave no room for text on this paper. Make them smaller or choose a larger paper size.'}
          </p>
        )}
        <div className="grid grid-cols-2 gap-3">
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium">Paper size</span>
            <Select value={draft.size} onChange={(e) => set({ size: e.target.value as PageSettings['size'] })} className="h-9">
              {Object.entries(PAPER_LABELS).map(([id, label]) => (
                <option key={id} value={id}>
                  {label.long}
                </option>
              ))}
            </Select>
          </label>
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium">Orientation</span>
            <Select value={draft.orientation} onChange={(e) => set({ orientation: e.target.value as PageSettings['orientation'] })} className="h-9">
              <option value="portrait">Portrait</option>
              <option value="landscape">Landscape</option>
            </Select>
          </label>
        </div>

        <fieldset className="grid gap-2">
          <legend className="mb-1.5 text-sm font-medium">Margins (mm)</legend>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(PRESETS).map(([name, m]) => (
              <Button key={name} size="sm" variant={JSON.stringify(m) === JSON.stringify(draft.margins) ? 'primary' : 'secondary'} onClick={() => set({ margins: { ...m } })}>
                {name}
              </Button>
            ))}
          </div>
          <div className="grid grid-cols-4 gap-2">
            {(['top', 'bottom', 'left', 'right'] as const).map((k) => (
              <label key={k} className="grid gap-1 text-xs capitalize text-muted">
                {k}
                <Input type="number" min={0} max={80} step={0.5} value={draft.margins[k]} onChange={(e) => setMargin(k, e.target.value)} />
              </label>
            ))}
          </div>
        </fieldset>

        <div className="grid gap-3">
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium">Header text</span>
            <Input value={draft.header} onChange={(e) => set({ header: e.target.value })} placeholder="e.g. Physics Lab Report — Group B" />
          </label>
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium">Footer text</span>
            <Input value={draft.footer} onChange={(e) => set({ footer: e.target.value })} placeholder="e.g. Your name, roll number" />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={draft.pageNumbers} onChange={(e) => set({ pageNumbers: e.target.checked })} className="h-4 w-4 accent-[var(--dc-accent)]" />
            Show page numbers in the footer
          </label>
        </div>
      </div>
    </Dialog>
  );
}
