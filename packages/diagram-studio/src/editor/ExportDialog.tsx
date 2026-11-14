import { Button, cn, Dialog, Select } from '@dcos/ui';
import { Download } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { cappedPixelRatio } from '../export';
import type { DiagramContent } from '../types';
import type { ImageExportRequest, ImageFormat } from '../vector/exportFile';
import { MAX_TILES, PAGE_SIZES, planPdf, type PdfOrientation, type PdfPageSize, type PdfScaleMode } from '../vector/pdf';
import { buildScene, sceneViewBox } from '../vector/renderSvg';

/** A row of choices that look like a segmented control and behave as native radio buttons (keyboard included). */
function Choice<T extends string | number>({ legend, name, value, options, onChange }: { legend: string; name: string; value: T; options: Array<{ value: T; label: ReactNode; disabled?: boolean }>; onChange: (v: T) => void }) {
  return (
    <fieldset className="min-w-0">
      <legend className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">{legend}</legend>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => (
          <label
            key={String(o.value)}
            className={cn(
              'flex min-h-9 cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-sm has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent/40',
              value === o.value ? 'border-accent bg-accent-soft text-accent' : 'border-border bg-surface',
              o.disabled && 'cursor-not-allowed opacity-50',
            )}
          >
            <input type="radio" className="sr-only" name={name} value={String(o.value)} checked={value === o.value} disabled={o.disabled} onChange={() => onChange(o.value)} />
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

const fmt = (n: number) => Math.round(n).toLocaleString('en-US');

export interface ExportDialogProps {
  open: boolean;
  onClose: () => void;
  /** The diagram as it is now (read when the dialog opens). */
  content: DiagramContent;
  /** Ids of the selected shapes and connectors when the dialog opened. */
  selection: { nodes: string[]; edges: string[] };
  onExport: (req: ImageExportRequest) => Promise<void>;
}

/**
 * Export options (diagrams.net's export dialogs, in one): format, whole diagram or selection, PNG scale and
 * background, PDF page size, orientation and fitting or tiling. Shows the resulting image size or page count before
 * exporting.
 */
export function ExportDialog({ open, onClose, content, selection, onExport }: ExportDialogProps) {
  const hasSelection = selection.nodes.length > 0;
  const [format, setFormat] = useState<ImageFormat>('png');
  const [only, setOnly] = useState<'all' | 'selection'>(hasSelection ? 'selection' : 'all');
  const [scale, setScale] = useState(2);
  const [background, setBackground] = useState<'white' | 'transparent'>('white');
  const [page, setPage] = useState<PdfPageSize>('fit');
  const [orientation, setOrientation] = useState<PdfOrientation>('auto');
  const [mode, setMode] = useState<PdfScaleMode>('fit-page');
  const [busy, setBusy] = useState(false);

  const useSelection = only === 'selection' && hasSelection;
  const size = useMemo(() => {
    const scene = buildScene(content, useSelection ? { selection } : {});
    return scene.nodes.length ? sceneViewBox(scene) : null;
  }, [content, selection, useSelection]);

  let summary = '';
  let problem = '';
  if (!size) problem = useSelection ? 'Nothing selected is shown on the canvas.' : 'The diagram is empty.';
  else if (format === 'png') {
    const ratio = cappedPixelRatio(size.width, size.height, scale);
    summary = `${fmt(size.width * ratio)} × ${fmt(size.height * ratio)} pixels`;
    if (ratio < scale) summary += ` (lowered to ${ratio}×: the largest image a browser can draw is 16.7 million pixels)`;
  } else if (format === 'svg') summary = `${fmt(size.width)} × ${fmt(size.height)}, vector`;
  else {
    try {
      const plan = planPdf(size.width, size.height, { page, orientation, mode }, size);
      const pages = plan.pages.length;
      summary = `${pages} ${pages === 1 ? 'page' : 'pages'}, ${fmt(plan.pageWidth / 72 * 25.4)} × ${fmt(plan.pageHeight / 72 * 25.4)} mm${plan.scale < 0.75 ? `, scaled to ${Math.round((plan.scale / 0.75) * 100)}%` : ''}`;
    } catch (err) {
      problem = err instanceof Error ? err.message : String(err);
    }
  }

  const run = async () => {
    setBusy(true);
    try {
      await onExport({
        format,
        ...(useSelection ? { selection } : {}),
        ...(format !== 'pdf' ? { background } : {}),
        ...(format === 'png' ? { scale } : {}),
        ...(format === 'pdf' ? { page, orientation, mode } : {}),
      });
      onClose();
    } finally {
      setBusy(false);
    }
  };

  const nSel = selection.nodes.length;
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Export diagram"
      description="Vector SVG and PDF keep text selectable; PNG is an image."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" icon={<Download size={14} />} disabled={busy || !!problem} onClick={() => void run()}>
            {busy ? 'Exporting…' : `Export ${format.toUpperCase()}`}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4" onKeyDown={(e) => e.stopPropagation()}>
        <Choice
          legend="Format"
          name="dcos-export-format"
          value={format}
          onChange={setFormat}
          options={[
            { value: 'png', label: 'PNG image' },
            { value: 'svg', label: 'SVG (vector)' },
            { value: 'pdf', label: 'PDF (vector)' },
          ]}
        />
        <Choice
          legend="Include"
          name="dcos-export-scope"
          value={useSelection ? 'selection' : 'all'}
          onChange={setOnly}
          options={[
            { value: 'all', label: 'Whole diagram' },
            { value: 'selection', label: hasSelection ? `Selection only (${nSel} ${nSel === 1 ? 'shape' : 'shapes'})` : 'Selection only (nothing selected)', disabled: !hasSelection },
          ]}
        />
        {format === 'png' && (
          <Choice
            legend="Size"
            name="dcos-export-scale"
            value={scale}
            onChange={setScale}
            options={[
              { value: 1, label: '1×' },
              { value: 2, label: '2× (sharp)' },
              { value: 3, label: '3× (print)' },
            ]}
          />
        )}
        {format !== 'pdf' && (
          <Choice
            legend="Background"
            name="dcos-export-background"
            value={background}
            onChange={setBackground}
            options={[
              { value: 'white', label: 'White' },
              { value: 'transparent', label: 'Transparent' },
            ]}
          />
        )}
        {format === 'pdf' && (
          <>
            <div className="flex flex-wrap gap-4">
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted">Page size</span>
                <Select value={page} onChange={(e) => setPage(e.target.value as PdfPageSize)} aria-label="Page size">
                  <option value="fit">Diagram size (one page)</option>
                  <option value="a4">{PAGE_SIZES.a4.name}</option>
                  <option value="letter">{PAGE_SIZES.letter.name}</option>
                </Select>
              </label>
              {page !== 'fit' && (
                <label className="flex flex-col gap-1.5 text-sm">
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted">Orientation</span>
                  <Select value={orientation} onChange={(e) => setOrientation(e.target.value as PdfOrientation)} aria-label="Orientation">
                    <option value="auto">Automatic</option>
                    <option value="portrait">Portrait</option>
                    <option value="landscape">Landscape</option>
                  </Select>
                </label>
              )}
            </div>
            {page !== 'fit' && (
              <Choice
                legend="Fit"
                name="dcos-export-fit"
                value={mode}
                onChange={setMode}
                options={[
                  { value: 'fit-page', label: 'Fit to one page' },
                  { value: 'actual-size', label: `Actual size (split across pages, up to ${MAX_TILES})` },
                ]}
              />
            )}
          </>
        )}
        <p className="text-sm text-muted" role="status" aria-live="polite">
          {problem ? <span className="text-danger">{problem}</span> : summary}
        </p>
      </div>
    </Dialog>
  );
}
