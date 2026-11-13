import { Button, downloadBlob, Menu, safeFileName, Separator, useToast } from '@dcos/ui';
import type { Editor } from '@tiptap/core';
import { NodeSelection } from '@tiptap/pm/state';
import { useEditorState } from '@tiptap/react';
import { ChevronDown, Download, FileInput, FolderOpen, Maximize2, Pencil, Plus, Trash2, Workflow } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { fitSize, type DiagramAttrs, type DiagramHost, type DiagramStart } from '../extensions/diagramEmbed';
import type { EditorMode } from '../types';
import { ModeToggle } from './Toolbar';

interface Props {
  editor: Editor;
  host: DiagramHost;
  /** Text width of the page in CSS pixels; inserted diagrams never exceed it. */
  maxWidth: number;
  mode: EditorMode;
  onModeChange: (m: EditorMode) => void;
  exportMenu: ReactNode;
}

/** The Diagram tab: create, insert, import and manage diagrams embedded in the document. */
export function DiagramRibbon({ editor, host, maxWidth, mode, onModeChange, exportMenu }: Props) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const selected = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      const sel = e.state.selection;
      return sel instanceof NodeSelection && sel.node.type.name === 'diagram' ? (sel.node.attrs as DiagramAttrs) : null;
    },
  });

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

  /** Opens the diagram editor and places the result. Call inside `run`, which guards against double clicks. */
  const editAndInsert = async (start?: DiagramStart) => {
    const diagram = await host.edit(null, start);
    if (diagram) {
      editor.chain().focus().insertDiagram(diagram, maxWidth).run();
      toast('Diagram added. Double-click it to edit.', 'success');
    }
  };
  const insert = (start?: DiagramStart) => run(() => editAndInsert(start));

  const setWidth = (fraction: number | 'original') => {
    if (!selected) return;
    const target = fraction === 'original' ? selected.naturalWidth : maxWidth * fraction;
    editor.chain().focus().updateAttributes('diagram', fitSize(selected.naturalWidth, selected.naturalHeight, target, maxWidth)).run();
  };

  return (
    <div className="flex items-center border-b border-border bg-surface">
      <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto px-2 py-1.5 [scrollbar-width:thin]" role="toolbar" aria-label="Diagram">
        <Menu
          trigger={(p) => (
            <Button size="sm" variant="ghost" icon={<Plus size={15} />} disabled={busy} {...p}>
              New diagram <ChevronDown size={13} />
            </Button>
          )}
          items={host.templates.map((t) => ({ label: t.name, icon: <Workflow size={14} />, onSelect: () => void insert({ templateId: t.id, title: t.name }) }))}
        />
        <Button
          size="sm"
          variant="ghost"
          icon={<FolderOpen size={15} />}
          disabled={busy}
          onClick={() =>
            void run(async () => {
              const start = await host.pickFromLibrary();
              if (start) await editAndInsert(start);
            })
          }
        >
          From my diagrams
        </Button>
        <Button
          size="sm"
          variant="ghost"
          icon={<FileInput size={15} />}
          disabled={busy}
          onClick={() =>
            void run(async () => {
              const start = await host.importFile();
              if (start) await editAndInsert(start);
            })
          }
        >
          Import diagrams.net
        </Button>

        {selected && (
          <>
            <Separator vertical />
            <span className="px-1 text-xs font-medium text-muted">Selected diagram</span>
            <Button
              size="sm"
              variant="ghost"
              icon={<Pencil size={15} />}
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const next = await host.edit(selected);
                  if (next) editor.chain().focus().updateAttributes('diagram', { ...next, ...fitSize(next.naturalWidth, next.naturalHeight, selected.width, maxWidth) }).run();
                })
              }
            >
              Edit
            </Button>
            <Menu
              trigger={(p) => (
                <Button size="sm" variant="ghost" icon={<Maximize2 size={15} />} {...p}>
                  Size <ChevronDown size={13} />
                </Button>
              )}
              items={[
                { label: 'Small', onSelect: () => setWidth(0.4) },
                { label: 'Medium', onSelect: () => setWidth(0.7) },
                { label: 'Full width', onSelect: () => setWidth(1) },
                { label: 'Original size', hint: `${selected.naturalWidth} px`, onSelect: () => setWidth('original') },
              ]}
            />
            <Menu
              trigger={(p) => (
                <Button size="sm" variant="ghost" icon={<Download size={15} />} {...p}>
                  Download <ChevronDown size={13} />
                </Button>
              )}
              items={[
                {
                  label: 'PNG image',
                  onSelect: () =>
                    void run(async () => {
                      const blob = selected.previewId ? await host.loadPreview(selected.previewId) : undefined;
                      if (!blob) throw new Error('This diagram has no preview yet. Edit it once to render one.');
                      downloadBlob(blob, `${safeFileName(selected.title || 'Diagram')}.png`);
                    }),
                },
                {
                  label: 'diagrams.net (.drawio)',
                  onSelect: () =>
                    void run(async () => {
                      const xml = await host.toDrawio(selected.source, selected.title || 'Diagram');
                      downloadBlob(new Blob([xml], { type: 'application/vnd.jgraph.mxfile' }), `${safeFileName(selected.title || 'Diagram')}.drawio`);
                    }),
                },
                { label: 'SVG or PDF…', hint: 'Edit → Export', onSelect: () => toast('Open the diagram (Edit), then use Export for SVG or PDF.', 'info') },
              ]}
            />
            <Button size="sm" variant="ghost" icon={<Trash2 size={15} />} className="text-danger" onClick={() => editor.chain().focus().deleteSelection().run()}>
              Remove
            </Button>
          </>
        )}
        {!selected && <span className="hidden px-2 text-xs text-muted lg:inline">Select a diagram in the document to edit, resize or download it.</span>}
      </div>
      <div className="flex shrink-0 items-center gap-2 border-l border-border px-2 py-1.5">
        <ModeToggle mode={mode} onModeChange={onModeChange} />
        {exportMenu}
      </div>
    </div>
  );
}
