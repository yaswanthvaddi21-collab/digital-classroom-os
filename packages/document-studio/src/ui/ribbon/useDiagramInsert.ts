import { useToast } from '@dcos/ui';
import type { Editor } from '@tiptap/core';
import { useState } from 'react';
import { DIAGRAM_NOT_PLACED, diagramRoomAt, RELOADED_NOT_INSERTED, type DiagramHost, type DiagramStart } from '../../extensions/diagramEmbed';

/**
 * Creating and inserting diagrams, shared by the Insert tab and the Diagram tab. `run` guards against double
 * clicks and reports errors; every await can outlive the editor (the document reloaded meanwhile), so success is
 * never reported into a dead editor.
 */
export function useDiagramInsert(editor: Editor, host: DiagramHost | undefined, maxWidth: number) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setBusy(false);
    }
  };

  /** Opens the diagram editor and places the result. Call inside `run`. */
  const editAndInsert = async (start?: DiagramStart) => {
    if (!host) return;
    if (editor.isDestroyed) throw new Error(RELOADED_NOT_INSERTED);
    const diagram = await host.edit(null, start);
    if (diagram && editor.isDestroyed) {
      host.settle?.(diagram, false);
      throw new Error(RELOADED_NOT_INSERTED);
    }
    if (diagram) {
      // Inside a table cell, list item or text box: that container's share of the page's text width (Round 3).
      const room = diagramRoomAt(editor.view, editor.state.selection.from, maxWidth);
      const placed = editor.chain().focus().insertDiagram(diagram, room > 0 ? Math.min(room, maxWidth) : maxWidth).run();
      // The host keeps the dialog's edits until it hears they are in the document (Phase 6 DIALOG).
      host.settle?.(diagram, placed);
      if (!placed) throw new Error(DIAGRAM_NOT_PLACED);
      toast('Diagram added. Double-click or double-tap it, or select it and press Enter, to edit it.', 'success');
    }
  };

  return {
    busy,
    run,
    editAndInsert,
    fromTemplate: (templateId: string, title: string) => void run(() => editAndInsert({ templateId, title })),
    fromLibrary: () =>
      void run(async () => {
        const start = await host?.pickFromLibrary();
        if (start) await editAndInsert(start);
      }),
    importFile: () =>
      void run(async () => {
        const start = await host?.importFile();
        if (start) await editAndInsert(start);
      }),
  };
}
