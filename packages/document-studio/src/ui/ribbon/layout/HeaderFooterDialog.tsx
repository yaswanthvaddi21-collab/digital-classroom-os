import { Button, Dialog, Input } from '@dcos/ui';
import { useState } from 'react';
import { emptyFirstPage, layoutOf, type HeaderFooterParts } from '../../../pageLayout';
import type { PageSettings } from '../../../types';

const POSITIONS = [
  ['left', 'Left'],
  ['center', 'Centre'],
  ['right', 'Right'],
] as const;

function PartsFields({ legend, parts, onChange, idPrefix }: { legend: string; parts: HeaderFooterParts; onChange: (p: HeaderFooterParts) => void; idPrefix: string }) {
  return (
    <fieldset className="grid gap-1.5">
      <legend className="mb-1 text-sm font-medium">{legend}</legend>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {POSITIONS.map(([k, label]) => (
          <label key={k} className="grid gap-1 text-xs text-muted" htmlFor={`${idPrefix}-${k}`}>
            {label}
            <Input id={`${idPrefix}-${k}`} aria-label={`${legend}: ${label.toLowerCase()}`} value={parts[k]} onChange={(e) => onChange({ ...parts, [k]: e.target.value })} />
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** Header and footer text in three positions, and an optional different first page. */
export function HeaderFooterDialog({ page, onApply, onClose }: { page: PageSettings; onApply: (p: PageSettings) => void; onClose: () => void }) {
  const layout = layoutOf(page);
  const [header, setHeader] = useState<HeaderFooterParts>({ left: layout.headerLeft, center: page.header, right: layout.headerRight });
  const [footer, setFooter] = useState<HeaderFooterParts>({ left: layout.footerLeft, center: page.footer, right: layout.footerRight });
  const [first, setFirst] = useState(layout.firstPage ?? emptyFirstPage());
  const [different, setDifferent] = useState(!!layout.firstPage);

  return (
    <Dialog
      open
      onClose={onClose}
      title="Header and footer"
      description="Printed at the top and bottom of every page in Word and in PDFs from a recent Chrome or Edge. The editor previews them above and below the page."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            onClick={() => {
              onApply({
                ...page,
                header: header.center,
                headerLeft: header.left,
                headerRight: header.right,
                footer: footer.center,
                footerLeft: footer.left,
                footerRight: footer.right,
                firstPage: different ? first : null,
              });
              onClose();
            }}
          >
            Apply
          </Button>
        </>
      }
    >
      <div className="grid gap-5">
        <PartsFields legend="Header" idPrefix="dcos-hf-header" parts={header} onChange={setHeader} />
        <PartsFields legend="Footer" idPrefix="dcos-hf-footer" parts={footer} onChange={setFooter} />
        <p className="-mt-2 text-xs text-muted">Page numbers are set under Layout ▸ Page numbers.</p>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={different} onChange={(e) => setDifferent(e.target.checked)} className="h-4 w-4 accent-[var(--dc-accent)]" />
          Different first page
        </label>
        {different && (
          <div className="grid gap-4 rounded-lg border border-border p-3">
            <p className="text-xs text-muted">The first page gets its own header and footer (leave them empty for a title page).</p>
            <PartsFields legend="First page header" idPrefix="dcos-hf-first-header" parts={first.header} onChange={(h) => setFirst({ ...first, header: h })} />
            <PartsFields legend="First page footer" idPrefix="dcos-hf-first-footer" parts={first.footer} onChange={(f) => setFirst({ ...first, footer: f })} />
            <label className={`flex items-center gap-2 text-sm ${page.pageNumbers ? '' : 'text-muted'}`}>
              <input
                type="checkbox"
                checked={first.pageNumbers}
                disabled={!page.pageNumbers}
                aria-describedby={page.pageNumbers ? undefined : 'dcos-hf-first-number-hint'}
                onChange={(e) => setFirst({ ...first, pageNumbers: e.target.checked })}
                className="h-4 w-4 accent-[var(--dc-accent)]"
              />
              Show the page number on the first page
            </label>
            {!page.pageNumbers && (
              <p id="dcos-hf-first-number-hint" className="-mt-2 text-xs text-muted">
                Page numbers are off. Turn them on under Layout ▸ Page numbers first.
              </p>
            )}
          </div>
        )}
      </div>
    </Dialog>
  );
}
