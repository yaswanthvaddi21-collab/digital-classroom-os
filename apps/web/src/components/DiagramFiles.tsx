import { useToast } from '@dcos/ui';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { notifyStorageChanged, requestPersistentStorage, storage } from '../lib/storage';
import { itemHref } from '../modules';

/** Classroom OS diagram files (.dcosdiagram). */
export const NATIVE_DIAGRAM_ACCEPT = '.dcosdiagram,.json,application/json,application/vnd.dcos.diagram+json';
/** Any diagram file the app opens: its own, or diagrams.net / draw.io. */
export const ANY_DIAGRAM_ACCEPT = `${NATIVE_DIAGRAM_ACCEPT},.drawio,.xml,.dio,application/xml,text/xml`;

/** Reads a file chosen by the user. Must be called from a click so the file picker may open. */
export function chooseTextFile(accept: string): Promise<{ text: string; name: string } | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = async () => {
      const file = input.files?.[0];
      resolve(file ? { text: await file.text(), name: file.name.replace(/\.(dcosdiagram|json|drawio|xml|dio)$/i, '') } : null);
    };
    input.addEventListener('cancel', () => resolve(null));
    input.click();
  });
}

/**
 * Opens a diagram file as a NEW diagram (never merged into an existing one) and goes to it. A file that cannot be
 * opened is refused with the reason, and nothing is created.
 */
export function useOpenDiagramFile() {
  const toast = useToast();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const open = async (accept: string = ANY_DIAGRAM_ACCEPT) => {
    const file = await chooseTextFile(accept);
    if (!file) return;
    setBusy(true);
    try {
      const { readDiagramFile } = await import('@dcos/diagram-studio');
      const r = readDiagramFile(file.text);
      const title = r.title ?? file.name;
      const item = await storage.create('diagram', { title, content: r.content, templateId: null });
      notifyStorageChanged({ kind: 'diagram', id: item.id });
      void requestPersistentStorage();
      if (r.kind === 'native') toast(`Opened “${title}” as a new diagram (${r.nodes} shapes, ${r.edges} connectors).`, 'success');
      else
        toast(
          r.notes.length ? `Imported ${r.nodes} shapes and ${r.edges} connectors. Note: ${r.notes.join(' ')}` : `Imported ${r.nodes} shapes and ${r.edges} connectors.`,
          r.notes.length ? 'info' : 'success',
        );
      navigate(itemHref('diagram', item.id));
    } catch (err) {
      toast(`Could not open “${file.name}”: ${err instanceof Error ? err.message : String(err)}`, 'error');
    } finally {
      setBusy(false);
    }
  };
  return { open, busy };
}
