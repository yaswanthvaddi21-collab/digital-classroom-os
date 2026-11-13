import { Button, downloadBlob, Menu, safeFileName, Separator } from '@dcos/ui';
import { NodeSelection } from '@tiptap/pm/state';
import { useEditorState } from '@tiptap/react';
import { ChevronDown, Download, FileInput, FolderOpen, Maximize2, Pencil, Plus, Trash2, Workflow } from 'lucide-react';
import { DIAGRAM_DATA_MISSING, fitSize, hasDiagramSource, RELOADED_NOT_APPLIED, type DiagramAttrs } from '../extensions/diagramEmbed';
import type { RibbonContext } from './ribbon/context';
import { useDiagramInsert } from './ribbon/useDiagramInsert';

/** The Diagram tab: create, insert, import and manage diagrams embedded in the document. */
export function DiagramRibbon({ editor, diagramHost: host, textWidthPx: maxWidth }: RibbonContext) {
  const d = useDiagramInsert(editor, host, maxWidth);
  const selected = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      const sel = e.state.selection;
      return sel instanceof NodeSelection && sel.node.type.name === 'diagram' ? (sel.node.attrs as DiagramAttrs) : null;
    },
  });
  if (!host) return null;

  const setWidth = (fraction: number | 'original') => {
    if (!selected) return;
    const target = fraction === 'original' ? selected.naturalWidth : maxWidth * fraction;
    editor.chain().focus().updateAttributes('diagram', fitSize(selected.naturalWidth, selected.naturalHeight, target, maxWidth)).run();
  };

  return (
    <>
      <Menu
        trigger={(p) => (
          <Button size="sm" variant="ghost" icon={<Plus size={15} />} disabled={d.busy} {...p}>
            New diagram <ChevronDown size={13} />
          </Button>
        )}
        items={host.templates.map((t) => ({ label: t.name, icon: <Workflow size={14} />, onSelect: () => d.fromTemplate(t.id, t.name) }))}
      />
      <Button size="sm" variant="ghost" icon={<FolderOpen size={15} />} disabled={d.busy} onClick={d.fromLibrary}>
        From my diagrams
      </Button>
      <Button size="sm" variant="ghost" icon={<FileInput size={15} />} disabled={d.busy} onClick={d.importFile}>
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
            disabled={d.busy}
            onClick={() =>
              void d.run(async () => {
                // A diagram without its data (e.g. a malformed paste) cannot be opened; say so instead of a stuck dialog.
                if (!hasDiagramSource(selected)) throw new Error(DIAGRAM_DATA_MISSING);
                const next = await host.edit(selected);
                if (next && editor.isDestroyed) throw new Error(RELOADED_NOT_APPLIED);
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
                  void d.run(async () => {
                    const blob = selected.previewId ? await host.loadPreview(selected.previewId) : undefined;
                    if (!blob) throw new Error('This diagram has no preview yet. Edit it once to render one.');
                    downloadBlob(blob, `${safeFileName(selected.title || 'Diagram')}.png`);
                  }),
              },
              {
                label: 'diagrams.net (.drawio)',
                disabled: !hasDiagramSource(selected),
                onSelect: () =>
                  void d.run(async () => {
                    const xml = await host.toDrawio(selected.source, selected.title || 'Diagram');
                    downloadBlob(new Blob([xml], { type: 'application/vnd.jgraph.mxfile' }), `${safeFileName(selected.title || 'Diagram')}.drawio`);
                  }),
              },
            ]}
          />
          <Button size="sm" variant="ghost" icon={<Trash2 size={15} />} className="text-danger" onClick={() => editor.chain().focus().deleteSelection().run()}>
            Remove
          </Button>
        </>
      )}
      {!selected && <span className="hidden px-2 text-xs text-muted lg:inline">Select a diagram in the document to edit, resize or download it.</span>}
    </>
  );
}
