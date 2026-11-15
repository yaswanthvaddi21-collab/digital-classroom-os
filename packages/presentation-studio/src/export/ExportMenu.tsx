import { Button, downloadBlob, Menu, useToast } from '@dcos/ui';
import { ChevronDown, Download, FileText, Presentation } from 'lucide-react';
import { useState } from 'react';
import type { PresentationDiagramHost, PresentationImageHost } from '../hosts';
import type { PresentationContent } from '../types';
import type { ExportFormatId } from './index';

export interface ExportMenuProps {
  /** The presentation as it is now (read when an export starts). */
  getContent: () => PresentationContent;
  title: string;
  imageHost?: PresentationImageHost;
  diagramHost?: Pick<PresentationDiagramHost, 'renderPreview'>;
}

/** The toast for a finished export: the message and, when anything was approximated, each note. */
export function exportToastText(message: string, notes: string[]) {
  return notes.length ? `${message}. ${notes.join(' ')}` : `${message}.`;
}

/**
 * The Export menu in the ribbon: PowerPoint, PDF and PDF with speaker notes. The export code (PptxGenJS, jsPDF,
 * svg2pdf) is loaded on first use. Items that cannot produce a file (no slides; every slide hidden, for PDF) are
 * disabled rather than failing.
 */
export function ExportMenu({ getContent, title, imageHost, diagramHost }: ExportMenuProps) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const content = getContent();
  const hasSlides = content.slides.length > 0;
  const hasVisible = content.slides.some((s) => !s.hidden);

  const run = async (format: ExportFormatId) => {
    if (busy) return;
    setBusy(true);
    try {
      const { exportPresentation } = await import('./index');
      const result = await exportPresentation(format, getContent(), { title, imageHost, diagramHost });
      downloadBlob(result.blob, result.fileName);
      toast(exportToastText(result.message, result.notes), result.notes.length ? 'info' : 'success');
    } catch (err) {
      toast(`Export failed: ${err instanceof Error ? err.message : String(err)}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Menu
      align="end"
      trigger={(p) => (
        <Button size="sm" variant="primary" icon={<Download size={14} />} aria-label={busy ? 'Exporting…' : 'Export'} disabled={busy} {...p}>
          <span className="hidden sm:inline">{busy ? 'Exporting…' : 'Export'}</span> <ChevronDown size={13} />
        </Button>
      )}
      items={[
        { label: 'PowerPoint (.pptx)', icon: <Presentation size={14} />, disabled: !hasSlides, onSelect: () => void run('pptx') },
        { label: 'PDF', icon: <FileText size={14} />, hint: 'one page per slide', disabled: !hasVisible, onSelect: () => void run('pdf') },
        { label: 'PDF with speaker notes', icon: <FileText size={14} />, hint: 'notes pages', disabled: !hasVisible, onSelect: () => void run('pdf-notes') },
      ]}
    />
  );
}
