import { Button, cn, IconButton, Input, Menu, Separator } from '@dcos/ui';
import type { Editor } from '@tiptap/core';
import { useEditorState } from '@tiptap/react';
import { ChevronDown, FileInput, FolderOpen, ImagePlus, Link2, ListTree, Minus, ScissorsLineDashed, Table, Workflow } from 'lucide-react';
import { useEffect, useState } from 'react';
import { normalizeLinkInput } from '../../links';
import { Popover } from '../Popover';
import { OPEN_LINK_EVENT, type RibbonContext } from './context';
import { Group } from './parts';
import { useDiagramInsert } from './useDiagramInsert';
import { InsertObjectControls } from '../insert/InsertControls'; // G-INSERT

function LinkButton({ editor }: { editor: Editor }) {
  const [url, setUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const active = useEditorState({ editor, selector: ({ editor: e }) => e.isActive('link') });
  const prefill = () => {
    setUrl(editor.getAttributes('link').href ?? '');
    setError(null);
  };
  useEffect(() => {
    window.addEventListener(OPEN_LINK_EVENT, prefill);
    return () => window.removeEventListener(OPEN_LINK_EVENT, prefill);
  });
  return (
    <Popover
      openOn={OPEN_LINK_EVENT}
      trigger={({ toggle, open }) => (
        <IconButton
          label="Link (Ctrl+K)"
          active={active}
          aria-expanded={open}
          onClick={() => {
            prefill();
            toggle();
          }}
        >
          <Link2 size={16} />
        </IconButton>
      )}
    >
      {(close) => (
        <form
          className="grid w-80 gap-1.5"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            if (!url.trim()) {
              editor.chain().focus().extendMarkRange('link').unsetLink().run();
              close();
              return;
            }
            const result = normalizeLinkInput(url, editor.schema);
            if ('error' in result) {
              setError(result.error);
              return;
            }
            editor.chain().focus().extendMarkRange('link').setLink({ href: result.href }).run();
            close();
          }}
        >
          <div className="flex gap-2">
            <Input
              autoFocus
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                setError(null);
              }}
              placeholder="example.com or https://…"
              aria-label="Link address"
              aria-invalid={!!error}
              aria-describedby={error ? 'dcos-link-error' : undefined}
              className="h-8"
            />
            <Button size="sm" variant="primary" type="submit">
              {url.trim() ? 'Apply' : 'Remove'}
            </Button>
          </div>
          {error && (
            <p id="dcos-link-error" role="alert" className="text-xs text-danger">
              {error}
            </p>
          )}
        </form>
      )}
    </Popover>
  );
}

function TableButton({ editor }: { editor: Editor }) {
  const [hover, setHover] = useState<[number, number]>([0, 0]);
  return (
    <Popover
      trigger={({ toggle, open }) => (
        <IconButton label="Insert table" aria-expanded={open} onClick={toggle}>
          <Table size={16} />
        </IconButton>
      )}
    >
      {(close) => (
        <div>
          <div className="mb-1.5 text-xs text-muted">{hover[0] ? `${hover[0]} × ${hover[1]} table` : 'Choose size'}</div>
          <div className="grid grid-cols-8 gap-0.5" onMouseLeave={() => setHover([0, 0])}>
            {Array.from({ length: 64 }, (_, i) => {
              const r = Math.floor(i / 8) + 1;
              const c = (i % 8) + 1;
              const on = r <= hover[0] && c <= hover[1];
              return (
                <button
                  key={i}
                  type="button"
                  aria-label={`${r} by ${c} table`}
                  onMouseEnter={() => setHover([r, c])}
                  onFocus={() => setHover([r, c])}
                  onClick={() => {
                    editor.chain().focus().insertTable({ rows: r, cols: c, withHeaderRow: true }).run();
                    close();
                  }}
                  className={cn('h-4 w-4 rounded-[3px] border', on ? 'border-accent bg-accent-soft' : 'border-border bg-surface-2')}
                />
              );
            })}
          </div>
        </div>
      )}
    </Popover>
  );
}

function DiagramMenu({ editor, diagramHost, textWidthPx }: RibbonContext) {
  const d = useDiagramInsert(editor, diagramHost, textWidthPx);
  if (!diagramHost) return null;
  return (
    <Menu
      trigger={(p) => (
        <Button size="sm" variant="ghost" icon={<Workflow size={15} />} disabled={d.busy} aria-label="Insert diagram" {...p}>
          Diagram <ChevronDown size={13} />
        </Button>
      )}
      items={[
        ...diagramHost.templates.map((t) => ({ label: `New ${t.name.toLowerCase()}`, icon: <Workflow size={14} />, onSelect: () => d.fromTemplate(t.id, t.name) })),
        { label: 'From my diagrams…', icon: <FolderOpen size={14} />, onSelect: d.fromLibrary },
        { label: 'Import diagrams.net…', icon: <FileInput size={14} />, onSelect: d.importFile },
      ]}
    />
  );
}

/** Insert: links, pictures, tables, rules, breaks, the table of contents and diagrams. */
export function InsertTab(ctx: RibbonContext) {
  const { editor, advanced, onInsertImage } = ctx;
  const chain = () => editor.chain().focus();
  return (
    <>
      <Group label="Links and media">
        <LinkButton editor={editor} />
        <IconButton label="Insert image" onClick={onInsertImage}>
          <ImagePlus size={16} />
        </IconButton>
        <TableButton editor={editor} />
        {/* @phase4:insert-media — equations, shapes and text boxes go here. */}
        {/* G-INSERT: equation, shape and text box (Advanced; their tools show for any selected one in both modes). */}
        {advanced && <InsertObjectControls editor={editor} />}
      </Group>
      <Separator vertical />
      <Group label="Page elements">
        <IconButton label="Horizontal line" onClick={() => chain().setHorizontalRule().run()}>
          <Minus size={16} />
        </IconButton>
        {advanced && (
          <>
            <IconButton label="Page break (Ctrl+Enter)" onClick={() => chain().setPageBreak().run()}>
              <ScissorsLineDashed size={16} />
            </IconButton>
            <IconButton label="Table of contents" onClick={() => chain().insertTableOfContents().run()}>
              <ListTree size={16} />
            </IconButton>
          </>
        )}
      </Group>
      {ctx.diagramHost && (
        <>
          <Separator vertical />
          <Group label="Diagrams">
            <DiagramMenu {...ctx} />
          </Group>
        </>
      )}
      {/* @phase4:insert — add further Insert tab groups here. */}
    </>
  );
}
