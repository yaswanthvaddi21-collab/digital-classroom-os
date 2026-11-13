import { Button, Dialog, Input, Select } from '@dcos/ui';
import { useState } from 'react';
import {
  isPageNumberStart,
  layoutOf,
  MAX_PAGE_NUMBER_START,
  NUMBER_FORMAT_LABELS,
  NUMBER_FORMATS,
  PAGE_NUMBER_TEXT_LABELS,
  PAGE_NUMBER_TEXTS,
  type NumberFormat,
  type PageNumberText,
  type PartAlign,
} from '../../../pageLayout';
import type { PageSettings } from '../../../types';

/** Page numbers: on or off, position in the footer, wording, format and the first number. */
export function PageNumbersDialog({ page, onApply, onClose }: { page: PageSettings; onApply: (p: PageSettings) => void; onClose: () => void }) {
  const layout = layoutOf(page);
  const [show, setShow] = useState(page.pageNumbers);
  const [align, setAlign] = useState<PartAlign>(layout.pageNumberAlign);
  const [text, setText] = useState<PageNumberText>(layout.pageNumberText);
  const [format, setFormat] = useState<NumberFormat>(layout.pageNumberFormat);
  const [start, setStart] = useState(String(layout.pageNumberStart));
  const startValue = Number(start);
  const startOk = start.trim() !== '' && isPageNumberStart(startValue);

  return (
    <Dialog
      open
      onClose={onClose}
      title="Page numbers"
      description="Numbers appear in the footer in Word and in PDFs from a recent Chrome or Edge."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={!startOk}
            onClick={() => {
              onApply({ ...page, pageNumbers: show, pageNumberAlign: align, pageNumberText: text, pageNumberFormat: format, pageNumberStart: startValue });
              onClose();
            }}
          >
            Apply
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} className="h-4 w-4 accent-[var(--dc-accent)]" />
          Show page numbers in the footer
        </label>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium">Position</span>
            <Select value={align} disabled={!show} onChange={(e) => setAlign(e.target.value as PartAlign)} className="h-9">
              <option value="left">Left</option>
              <option value="center">Centre</option>
              <option value="right">Right</option>
            </Select>
          </label>
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium">Text</span>
            <Select value={text} disabled={!show} onChange={(e) => setText(e.target.value as PageNumberText)} className="h-9">
              {PAGE_NUMBER_TEXTS.map((t) => (
                <option key={t} value={t}>
                  {PAGE_NUMBER_TEXT_LABELS[t]}
                </option>
              ))}
            </Select>
          </label>
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium">Number format</span>
            <Select value={format} onChange={(e) => setFormat(e.target.value as NumberFormat)} className="h-9">
              {NUMBER_FORMATS.map((f) => (
                <option key={f} value={f}>
                  {NUMBER_FORMAT_LABELS[f]}
                </option>
              ))}
            </Select>
          </label>
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium">Start at</span>
            <Input
              type="number"
              min={0}
              max={MAX_PAGE_NUMBER_START}
              step={1}
              value={start}
              aria-invalid={!startOk}
              aria-describedby={startOk ? undefined : 'dcos-page-start-error'}
              onChange={(e) => setStart(e.target.value)}
            />
          </label>
        </div>
        {!startOk && (
          <p id="dcos-page-start-error" role="alert" className="text-xs text-danger">
            Enter a whole number from 0 to {MAX_PAGE_NUMBER_START}.
          </p>
        )}
        <ul className="grid list-disc gap-1 pl-5 text-xs text-muted">
          <li>Format and start apply to the first section. A section break can restart the numbering or change its format (Layout ▸ Section).</li>
          <li>“of 9” counts every page of the document and is written as 1, 2, 3.</li>
        </ul>
      </div>
    </Dialog>
  );
}
