import { Button, Separator } from '@dcos/ui';
import { useEditorState } from '@tiptap/react';
import type { RibbonContext } from './context';

/** Contextual table tools, shown under the ribbon while the cursor is in a table. */
export function TableBar({ editor, advanced }: RibbonContext) {
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({ table: e.isActive('table'), canMerge: e.can().mergeCells(), canSplit: e.can().splitCell() }),
  });
  if (!s.table) return null;
  const chain = () => editor.chain().focus();
  return (
    <div className="flex items-center gap-1 overflow-x-auto border-t border-border bg-surface-2/60 px-2 py-1 text-xs" role="toolbar" aria-label="Table">
      <span className="px-1.5 font-medium text-muted">Table</span>
      <Button size="sm" variant="ghost" onClick={() => chain().addRowBefore().run()}>
        Row above
      </Button>
      <Button size="sm" variant="ghost" onClick={() => chain().addRowAfter().run()}>
        Row below
      </Button>
      <Button size="sm" variant="ghost" onClick={() => chain().addColumnBefore().run()}>
        Column left
      </Button>
      <Button size="sm" variant="ghost" onClick={() => chain().addColumnAfter().run()}>
        Column right
      </Button>
      <Separator vertical />
      <Button size="sm" variant="ghost" onClick={() => chain().deleteRow().run()}>
        Delete row
      </Button>
      <Button size="sm" variant="ghost" onClick={() => chain().deleteColumn().run()}>
        Delete column
      </Button>
      {advanced && (
        <>
          <Separator vertical />
          <Button size="sm" variant="ghost" disabled={!s.canMerge} onClick={() => chain().mergeCells().run()}>
            Merge cells
          </Button>
          <Button size="sm" variant="ghost" disabled={!s.canSplit} onClick={() => chain().splitCell().run()}>
            Split cell
          </Button>
          <Button size="sm" variant="ghost" onClick={() => chain().toggleHeaderRow().run()}>
            Header row
          </Button>
        </>
      )}
      {/* @phase4:table — table tools go here. */}
      <Separator vertical />
      <Button size="sm" variant="ghost" className="text-danger" onClick={() => chain().deleteTable().run()}>
        Delete table
      </Button>
    </div>
  );
}
