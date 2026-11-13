import { Button, cn, IconButton, Input, Select, Separator } from '@dcos/ui';
import type { Editor } from '@tiptap/core';
import { useEditorState } from '@tiptap/react';
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Baseline,
  Bold,
  Code,
  Highlighter,
  ImagePlus,
  Italic,
  Link2,
  List,
  ListOrdered,
  ListTree,
  Minus,
  Quote,
  Redo2,
  Ruler,
  ScissorsLineDashed,
  Search,
  SpellCheck,
  Strikethrough,
  Subscript,
  Superscript,
  Table,
  Underline,
  Undo2,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import type { EditorMode } from '../types';
import { HIGHLIGHT_COLORS, Popover, Swatches, TEXT_COLORS } from './Popover';

const FONTS = [
  { label: 'Default font', value: '' },
  { label: 'Arial', value: 'Arial' },
  { label: 'Calibri', value: 'Calibri' },
  { label: 'Georgia', value: 'Georgia' },
  { label: 'Times New Roman', value: 'Times New Roman' },
  { label: 'Verdana', value: 'Verdana' },
  { label: 'Courier New', value: 'Courier New' },
];
const SIZES = ['', '9pt', '10pt', '11pt', '12pt', '14pt', '16pt', '18pt', '20pt', '24pt', '32pt'];

function Group({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('flex shrink-0 items-center gap-0.5', className)}>{children}</div>;
}

function LinkButton({ editor }: { editor: Editor }) {
  const [url, setUrl] = useState('');
  return (
    <Popover
      trigger={({ toggle }) => (
        <IconButton
          label="Link (Ctrl+K)"
          active={editor.isActive('link')}
          onClick={() => {
            setUrl(editor.getAttributes('link').href ?? '');
            toggle();
          }}
        >
          <Link2 size={16} />
        </IconButton>
      )}
    >
      {(close) => (
        <form
          className="flex w-72 gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const href = url.trim();
            if (href) editor.chain().focus().extendMarkRange('link').setLink({ href }).run();
            else editor.chain().focus().extendMarkRange('link').unsetLink().run();
            close();
          }}
        >
          <Input autoFocus value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com" aria-label="Link address" className="h-8" />
          <Button size="sm" variant="primary" type="submit">
            {url.trim() ? 'Apply' : 'Remove'}
          </Button>
        </form>
      )}
    </Popover>
  );
}

function TableButton({ editor }: { editor: Editor }) {
  const [hover, setHover] = useState<[number, number]>([0, 0]);
  return (
    <Popover
      trigger={({ toggle }) => (
        <IconButton label="Insert table" onClick={toggle}>
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

export interface ToolbarProps {
  editor: Editor;
  mode: EditorMode;
  onModeChange: (m: EditorMode) => void;
  onInsertImage: () => void;
  onToggleFind: () => void;
  onPageSetup: () => void;
  spellcheck: boolean;
  onToggleSpellcheck: () => void;
  exportMenu: ReactNode;
}

export function Toolbar({ editor, mode, onModeChange, onInsertImage, onToggleFind, onPageSetup, spellcheck, onToggleSpellcheck, exportMenu }: ToolbarProps) {
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      underline: e.isActive('underline'),
      strike: e.isActive('strike'),
      code: e.isActive('code'),
      sub: e.isActive('subscript'),
      sup: e.isActive('superscript'),
      bullet: e.isActive('bulletList'),
      ordered: e.isActive('orderedList'),
      quote: e.isActive('blockquote'),
      table: e.isActive('table'),
      align: (['left', 'center', 'right', 'justify'] as const).find((a) => e.isActive({ textAlign: a })) ?? 'left',
      block: e.isActive('heading', { level: 1 })
        ? 'h1'
        : e.isActive('heading', { level: 2 })
          ? 'h2'
          : e.isActive('heading', { level: 3 })
            ? 'h3'
            : e.isActive('heading', { level: 4 })
              ? 'h4'
              : e.isActive('codeBlock')
                ? 'code'
                : 'p',
      font: (e.getAttributes('textStyle').fontFamily as string | undefined) ?? '',
      size: (e.getAttributes('textStyle').fontSize as string | undefined) ?? '',
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
      canMerge: e.can().mergeCells(),
      canSplit: e.can().splitCell(),
    }),
  });
  const advanced = mode === 'advanced';
  const chain = () => editor.chain().focus();

  const setBlock = (v: string) => {
    if (v === 'p') chain().setParagraph().run();
    else if (v === 'code') chain().toggleCodeBlock().run();
    else chain().toggleHeading({ level: Number(v.slice(1)) as 1 | 2 | 3 | 4 }).run();
  };

  return (
    <div className="border-b border-border bg-surface">
      <div className="flex items-center">
      <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto px-2 py-1.5 [scrollbar-width:thin]" role="toolbar" aria-label="Formatting">
        <Group>
          <IconButton label="Undo (Ctrl+Z)" disabled={!s.canUndo} onClick={() => chain().undo().run()}>
            <Undo2 size={16} />
          </IconButton>
          <IconButton label="Redo (Ctrl+Shift+Z)" disabled={!s.canRedo} onClick={() => chain().redo().run()}>
            <Redo2 size={16} />
          </IconButton>
        </Group>
        <Separator vertical />
        <Select aria-label="Text style" value={s.block} onChange={(e) => setBlock(e.target.value)} className="w-32">
          <option value="p">Normal text</option>
          <option value="h1">Heading 1</option>
          <option value="h2">Heading 2</option>
          <option value="h3">Heading 3</option>
          <option value="h4">Heading 4</option>
          <option value="code">Code block</option>
        </Select>
        {advanced && (
          <>
            <Select
              aria-label="Font"
              value={s.font}
              onChange={(e) => (e.target.value ? chain().setFontFamily(e.target.value).run() : chain().unsetFontFamily().run())}
              className="w-36"
            >
              {FONTS.map((f) => (
                <option key={f.label} value={f.value}>
                  {f.label}
                </option>
              ))}
            </Select>
            <Select
              aria-label="Font size"
              value={s.size}
              onChange={(e) => (e.target.value ? chain().setFontSize(e.target.value).run() : chain().unsetFontSize().run())}
              className="w-20"
            >
              {SIZES.map((sz) => (
                <option key={sz} value={sz}>
                  {sz ? sz.replace('pt', '') : 'Size'}
                </option>
              ))}
            </Select>
          </>
        )}
        <Separator vertical />
        <Group>
          <IconButton label="Bold (Ctrl+B)" active={s.bold} onClick={() => chain().toggleBold().run()}>
            <Bold size={16} />
          </IconButton>
          <IconButton label="Italic (Ctrl+I)" active={s.italic} onClick={() => chain().toggleItalic().run()}>
            <Italic size={16} />
          </IconButton>
          <IconButton label="Underline (Ctrl+U)" active={s.underline} onClick={() => chain().toggleUnderline().run()}>
            <Underline size={16} />
          </IconButton>
          <IconButton label="Strikethrough" active={s.strike} onClick={() => chain().toggleStrike().run()}>
            <Strikethrough size={16} />
          </IconButton>
          <Popover
            trigger={({ toggle }) => (
              <IconButton label="Text colour" onClick={toggle}>
                <Baseline size={16} />
              </IconButton>
            )}
          >
            {(close) => (
              <Swatches
                colors={TEXT_COLORS}
                clearLabel="Default colour"
                onPick={(c) => (chain().setColor(c).run(), close())}
                onClear={() => (chain().unsetColor().run(), close())}
              />
            )}
          </Popover>
          <Popover
            trigger={({ toggle }) => (
              <IconButton label="Highlight" onClick={toggle}>
                <Highlighter size={16} />
              </IconButton>
            )}
          >
            {(close) => (
              <Swatches
                colors={HIGHLIGHT_COLORS}
                clearLabel="No highlight"
                onPick={(c) => (chain().setHighlight({ color: c }).run(), close())}
                onClear={() => (chain().unsetHighlight().run(), close())}
              />
            )}
          </Popover>
          {advanced && (
            <>
              <IconButton label="Subscript" active={s.sub} onClick={() => chain().toggleSubscript().run()}>
                <Subscript size={16} />
              </IconButton>
              <IconButton label="Superscript" active={s.sup} onClick={() => chain().toggleSuperscript().run()}>
                <Superscript size={16} />
              </IconButton>
              <IconButton label="Inline code" active={s.code} onClick={() => chain().toggleCode().run()}>
                <Code size={16} />
              </IconButton>
            </>
          )}
        </Group>
        <Separator vertical />
        <Group>
          <IconButton label="Bulleted list" active={s.bullet} onClick={() => chain().toggleBulletList().run()}>
            <List size={16} />
          </IconButton>
          <IconButton label="Numbered list" active={s.ordered} onClick={() => chain().toggleOrderedList().run()}>
            <ListOrdered size={16} />
          </IconButton>
          <IconButton label="Quote" active={s.quote} onClick={() => chain().toggleBlockquote().run()}>
            <Quote size={16} />
          </IconButton>
        </Group>
        <Separator vertical />
        <Group>
          {(
            [
              ['left', AlignLeft, 'Align left'],
              ['center', AlignCenter, 'Centre'],
              ['right', AlignRight, 'Align right'],
              ['justify', AlignJustify, 'Justify'],
            ] as const
          ).map(([a, Icon, label]) => (
            <IconButton key={a} label={label} active={s.align === a} onClick={() => chain().setTextAlign(a).run()}>
              <Icon size={16} />
            </IconButton>
          ))}
        </Group>
        <Separator vertical />
        <Group>
          <LinkButton editor={editor} />
          <IconButton label="Insert image" onClick={onInsertImage}>
            <ImagePlus size={16} />
          </IconButton>
          <TableButton editor={editor} />
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
        {advanced && (
          <>
            <Separator vertical />
            <Group>
              <IconButton label="Find and replace (Ctrl+F)" onClick={onToggleFind}>
                <Search size={16} />
              </IconButton>
              <IconButton label={spellcheck ? 'Spell check on' : 'Spell check off'} active={spellcheck} onClick={onToggleSpellcheck}>
                <SpellCheck size={16} />
              </IconButton>
              <IconButton label="Page setup: size, margins, header and footer" onClick={onPageSetup}>
                <Ruler size={16} />
              </IconButton>
            </Group>
          </>
        )}
      </div>
        <div className="flex shrink-0 items-center gap-2 border-l border-border px-2 py-1.5">
          <div role="radiogroup" aria-label="Editor mode" className="flex rounded-lg border border-border bg-surface-2 p-0.5 text-xs font-medium">
            {(['simple', 'advanced'] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={mode === m}
                onClick={() => onModeChange(m)}
                className={cn('rounded-md px-2.5 py-1 capitalize', mode === m ? 'bg-surface text-fg shadow-xs' : 'text-muted hover:text-fg')}
              >
                {m}
              </button>
            ))}
          </div>
          {exportMenu}
        </div>
      </div>

      {s.table && (
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
          <Separator vertical />
          <Button size="sm" variant="ghost" className="text-danger" onClick={() => chain().deleteTable().run()}>
            Delete table
          </Button>
        </div>
      )}
    </div>
  );
}
