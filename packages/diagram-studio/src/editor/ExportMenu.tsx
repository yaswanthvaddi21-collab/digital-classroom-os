import { Button, downloadBlob, Menu, safeFileName } from '@dcos/ui';
import { ChevronDown, Download, FileImage, FileJson, FileText, FolderOpen, SlidersHorizontal } from 'lucide-react';
import { lazy, Suspense, useState, type ReactNode } from 'react';
import { drawioExportNotes, toDrawio } from '../drawio';
import { NATIVE_EXTENSION, NATIVE_MIME, toNativeFile } from '../native';
import type { DiagramContent } from '../types';
import type { ImageExportRequest } from '../vector/exportFile';
import type { EditorController } from './controller';

/** What an export did. `notes` name each approximation; the toast lists them ("Exported PNG. …"). */
export interface ExportOutcome {
  message: string;
  notes?: string[];
}

/** One entry of the Export menu. `run` downloads the file and says what it did; a thrown error is shown as a failure. */
export interface ExportFormat {
  id: string;
  label: string;
  icon: ReactNode;
  hint?: string;
  /** Hidden when it returns false (for example when the host provides no way to do it). */
  available?: (ctx: EditorController) => boolean;
  /** Opens the export options dialog instead of running directly. */
  dialog?: true;
  run: (ctx: EditorController) => Promise<ExportOutcome | null>;
}

/**
 * Downloads an image export named after the diagram (G-EXPORT): drawn from the diagram's content by the vector
 * renderer, not captured from the canvas, so it needs no repaint and never includes editing chrome. Notes name
 * every omission or approximation, and a lowered PNG resolution (audit DS-R4).
 */
async function downloadImage(content: DiagramContent, title: string, req: ImageExportRequest): Promise<ExportOutcome> {
  const { exportDiagramImage } = await import('../vector/exportFile');
  const r = await exportDiagramImage(content, title, req);
  downloadBlob(r.blob, `${safeFileName(title)}.${r.extension}`);
  return { message: r.message, notes: r.notes };
}
const captured = (ctx: EditorController, req: ImageExportRequest) => downloadImage(ctx.serialize(), ctx.title, req);

/** Loaded on first use, with the vector renderer it plans with. */
const ExportDialog = lazy(() => import('./ExportDialog').then((m) => ({ default: m.ExportDialog })));

export const EXPORT_FORMATS: ExportFormat[] = [
  { id: 'png', label: 'PNG image (high resolution)', icon: <FileImage size={14} />, run: (ctx) => captured(ctx, { format: 'png' }) },
  { id: 'svg', label: 'SVG image', icon: <FileImage size={14} />, hint: 'vector', run: (ctx) => captured(ctx, { format: 'svg' }) },
  { id: 'pdf', label: 'PDF', icon: <FileText size={14} />, hint: 'vector', run: (ctx) => captured(ctx, { format: 'pdf' }) },
  {
    id: 'drawio',
    label: 'diagrams.net / draw.io (.drawio)',
    icon: <FileJson size={14} />,
    run: async (ctx) => {
      const content = ctx.serialize();
      const xml = toDrawio(content, ctx.title);
      downloadBlob(new Blob([xml], { type: 'application/vnd.jgraph.mxfile' }), `${safeFileName(ctx.title)}.drawio`);
      // Everything the file cannot hold is named in the toast (never a silent approximation).
      return { message: 'Exported for diagrams.net', notes: drawioExportNotes(content) };
    },
  },
  {
    id: 'native',
    label: 'Classroom OS diagram (.dcosdiagram)',
    icon: <FileJson size={14} />,
    hint: 'editable',
    run: async (ctx) => {
      // A protected diagram is written exactly as it was given, so nothing from a newer version is lost.
      const content = ctx.readOnly ? (ctx.original as DiagramContent) : ctx.serialize();
      downloadBlob(new Blob([toNativeFile(content, ctx.title)], { type: NATIVE_MIME }), `${safeFileName(ctx.title)}${NATIVE_EXTENSION}`);
      return { message: 'Exported Classroom OS diagram file' };
    },
  },
  // @phase5:export — new formats and options, in menu order.
  {
    // G-EXPORT: PNG scale and background, PDF page size and tiling, selection only (ExportDialog.tsx).
    id: 'image-options',
    label: 'Export options…',
    icon: <SlidersHorizontal size={14} />,
    hint: 'size, pages, selection',
    dialog: true,
    run: async () => null,
  },
  {
    // Opens a .dcosdiagram or diagrams.net file as a new diagram (the host creates it). Shown only when the host can.
    id: 'open-file',
    label: 'Open file…',
    icon: <FolderOpen size={14} />,
    hint: 'new diagram',
    available: (ctx) => !!ctx.onOpenFile,
    run: async (ctx) => {
      ctx.onOpenFile?.();
      return null;
    },
  },
];

/** Runs one export and reports it in a toast: success, success with notes (information), or the error. */
export async function runExport(ctx: EditorController, format: ExportFormat) {
  try {
    const outcome = await format.run(ctx);
    if (!outcome) return;
    const notes = outcome.notes ?? [];
    ctx.toast(notes.length ? `${outcome.message}. ${notes.join(' ')}` : outcome.message, notes.length ? 'info' : 'success');
  } catch (err) {
    ctx.toast(`Export failed: ${err instanceof Error ? err.message : String(err)}`, 'error');
  }
}

export function ExportMenu({ ctx }: { ctx: EditorController }) {
  // The options dialog reads the diagram and the selection when it opens.
  const [options, setOptions] = useState<{ content: DiagramContent; selection: { nodes: string[]; edges: string[] } } | null>(null);
  return (
    <>
      <Menu
        align="end"
        trigger={(p) => (
          <Button size="sm" variant="primary" icon={<Download size={14} />} aria-label="Export" {...p}>
            <span className="hidden sm:inline">Export</span> <ChevronDown size={13} />
          </Button>
        )}
        items={EXPORT_FORMATS.filter((f) => !f.available || f.available(ctx)).map((f) => ({
          label: f.label,
          icon: f.icon,
          hint: f.hint,
          onSelect: () =>
            f.dialog
              ? setOptions({ content: ctx.serialize(), selection: { nodes: ctx.selectedNodes.map((n) => n.id), edges: ctx.selectedEdges.map((e) => e.id) } })
              : void runExport(ctx, f),
        }))}
      />
      {options && (
        <Suspense fallback={null}>
          <ExportDialog
            open
            onClose={() => setOptions(null)}
            content={options.content}
            selection={options.selection}
            onExport={(req) => runExport(ctx, { id: 'image-options', label: 'Export options', icon: null, run: () => downloadImage(options.content, ctx.title, req) })}
          />
        </Suspense>
      )}
    </>
  );
}
