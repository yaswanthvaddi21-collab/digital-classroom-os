import { Button, Dialog, Input, Select } from '@dcos/ui';
import { useState } from 'react';
import { isColumnSpacing, isPageNumberStart, MAX_COLUMN_SPACING, MAX_PAGE_NUMBER_START, NUMBER_FORMAT_LABELS, NUMBER_FORMATS, type NumberFormat } from '../../../pageLayout';
import type { BreakType, SectionBreakAttrs } from '../../../sections';
import type { Orientation, PageSettings } from '../../../types';
import { columnWidthMm, MIN_COLUMN_MM, orientationProblem, type SectionInfo } from './useSection';

const SAME = '';

/**
 * Settings of the section holding the cursor. The first section's are the page settings; a later section's are
 * stored on its break, where "Same as the previous section" leaves a setting to continue from the section before.
 */
export function SectionDialog({
  page,
  info,
  onApply,
  onRemove,
  onClose,
}: {
  page: PageSettings;
  info: SectionInfo;
  onApply: (patch: Partial<SectionBreakAttrs>) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const first = !info.break;
  const own = info.break?.attrs;
  const cur = info.current;
  const [breakType, setBreakType] = useState<BreakType>(own?.breakType ?? 'nextPage');
  const [orientation, setOrientation] = useState<string>(first ? cur.orientation : (own?.orientation ?? SAME));
  const [columns, setColumns] = useState<string>(first ? String(cur.columns) : own?.columns ? String(own.columns) : SAME);
  const [spacing, setSpacing] = useState<string>(first ? String(cur.columnSpacing) : own?.columnSpacing !== null && own?.columnSpacing !== undefined ? String(own.columnSpacing) : SAME);
  const [format, setFormat] = useState<string>(first ? cur.numberFormat : (own?.numberFormat ?? SAME));
  const [restart, setRestart] = useState(first || own?.numberStart !== null);
  const [start, setStart] = useState(String(first ? (cur.numberStart ?? 1) : (own?.numberStart ?? 1)));

  const continuous = !first && breakType === 'continuous';
  const spacingOk = spacing === SAME || isColumnSpacing(Number(spacing));
  const startOk = !restart || continuous || (start.trim() !== '' && isPageNumberStart(Number(start)));
  // Columns too narrow for text are refused (worked out with what the section would use).
  const effOrientation = (continuous || orientation === SAME ? cur.orientation : orientation) as Orientation;
  const effColumns = columns === SAME ? cur.columns : Number(columns);
  const effSpacing = spacing === SAME || !spacingOk ? cur.columnSpacing : Number(spacing);
  const narrow = effColumns > 1 && columnWidthMm(page, effOrientation, effColumns, effSpacing) < MIN_COLUMN_MM;
  const orientationBad = !continuous && orientation !== SAME && !!orientationProblem(page, orientation as Orientation);
  const ok = spacingOk && startOk && !narrow && !orientationBad;

  const apply = () => {
    const patch: Partial<SectionBreakAttrs> = {
      columns: columns === SAME ? null : Number(columns),
      columnSpacing: spacing === SAME ? null : Number(spacing),
    };
    if (!first) patch.breakType = breakType;
    if (continuous) Object.assign(patch, { orientation: null, numberFormat: null, numberStart: null });
    else {
      patch.orientation = orientation === SAME ? null : (orientation as Orientation);
      patch.numberFormat = format === SAME ? null : (format as NumberFormat);
      patch.numberStart = restart ? Number(start) : null;
    }
    onApply(patch);
    onClose();
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={first ? `Section 1 of ${info.count}` : `Section ${info.index + 1} of ${info.count}`}
      description={first ? 'The first section uses the page settings. Section breaks (Layout ▸ Breaks) start further sections.' : 'This section starts at the section break before it.'}
      footer={
        <>
          {!first && (
            <Button
              variant="danger"
              className="mr-auto"
              onClick={() => {
                onRemove();
                onClose();
              }}
            >
              Remove section break
            </Button>
          )}
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!ok} onClick={apply}>
            Apply
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        {!first && (
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium">Section starts</span>
            <Select value={breakType} onChange={(e) => setBreakType(e.target.value as BreakType)} className="h-9">
              <option value="nextPage">On a new page (next page)</option>
              <option value="continuous">On the same page (continuous)</option>
            </Select>
          </label>
        )}
        {continuous && <p className="-mt-2 text-xs text-muted">A continuous section changes only the columns; orientation and page numbering continue from the section before.</p>}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium">Orientation</span>
            <Select value={continuous ? SAME : orientation} disabled={continuous} onChange={(e) => setOrientation(e.target.value)} className="h-9">
              {!first && <option value={SAME}>Same as the previous section</option>}
              {(['portrait', 'landscape'] as const).map((o) => {
                const problem = o !== cur.orientation && orientationProblem(page, o);
                return (
                  <option key={o} value={o} disabled={!!problem} title={problem || undefined}>
                    {o === 'portrait' ? 'Portrait' : 'Landscape'}
                    {problem ? ' — margins too wide' : ''}
                  </option>
                );
              })}
            </Select>
          </label>
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium">Columns</span>
            <Select value={columns} onChange={(e) => setColumns(e.target.value)} className="h-9">
              {!first && <option value={SAME}>Same as the previous section</option>}
              <option value="1">One</option>
              <option value="2">Two</option>
              <option value="3">Three</option>
            </Select>
          </label>
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium">Space between columns (mm)</span>
            <Input
              type="number"
              min={0}
              max={MAX_COLUMN_SPACING}
              step={0.5}
              value={spacing}
              placeholder={first ? undefined : 'Same as before'}
              aria-invalid={!spacingOk}
              onChange={(e) => setSpacing(e.target.value)}
            />
          </label>
        </div>
        {!spacingOk && (
          <p role="alert" className="text-xs text-danger">
            Enter a spacing from 0 to {MAX_COLUMN_SPACING} mm.
          </p>
        )}
        {narrow && (
          <p role="alert" className="text-xs text-danger">
            The columns would be narrower than {MIN_COLUMN_MM} mm. Use fewer columns, less spacing or smaller margins.
          </p>
        )}

        <fieldset className="grid gap-2" disabled={continuous}>
          <legend className="mb-1 text-sm font-medium">Page numbering</legend>
          {!first && (
            <div className="flex flex-wrap gap-4 text-sm">
              <label className="flex items-center gap-2">
                <input type="radio" name="dcos-numbering" checked={!restart} onChange={() => setRestart(false)} />
                Continue from the previous section
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" name="dcos-numbering" checked={restart} onChange={() => setRestart(true)} />
                Restart
              </label>
            </div>
          )}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="grid gap-1.5 text-sm">
              <span>{first ? 'First page number' : 'Restart at'}</span>
              <Input type="number" min={0} max={MAX_PAGE_NUMBER_START} step={1} value={start} disabled={!restart || continuous} aria-invalid={!startOk} onChange={(e) => setStart(e.target.value)} />
            </label>
            <label className="grid gap-1.5 text-sm">
              <span>Number format</span>
              <Select value={continuous ? SAME : format} onChange={(e) => setFormat(e.target.value)} className="h-9">
                {!first && <option value={SAME}>Same as the previous section</option>}
                {NUMBER_FORMATS.map((f) => (
                  <option key={f} value={f}>
                    {NUMBER_FORMAT_LABELS[f]}
                  </option>
                ))}
              </Select>
            </label>
          </div>
        </fieldset>
        <p className="text-xs text-muted">
          Columns are written to Word (.docx) exports and show in print/PDF; the editor shows one column. A section&apos;s orientation and numbering are written to Word exports and show in PDFs from a recent Chrome or Edge.
        </p>
      </div>
    </Dialog>
  );
}
