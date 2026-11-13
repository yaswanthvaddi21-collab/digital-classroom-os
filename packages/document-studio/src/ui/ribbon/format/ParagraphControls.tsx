import { Button, cn, IconButton, Input } from '@dcos/ui';
import type { Editor } from '@tiptap/core';
import { useEditorState } from '@tiptap/react';
import { ArrowUpDown, ChevronDown, IndentDecrease, IndentIncrease, Pilcrow } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import {
  BULLET_STYLES,
  bulletStyleOf,
  listAt,
  MAX_LIST_START,
  NUMBER_FORMATS,
  numberFormatOf,
} from '../../../extensions/listStyles';
import { currentBlock, formatOf, LINE_SPACING_LIMITS, LINE_SPACING_PRESETS } from '../../../extensions/paragraphFormat';
import { Popover } from '../../Popover';
import { ParagraphDialog } from './ParagraphDialog';
import { readNumber } from './units';

const SPACING_LABELS: Record<number, string> = { 1: '1.0', 1.15: '1.15', 1.5: '1.5', 2: '2.0' };

/** A choice inside a format popover: a toggle button showing whether it is the current setting. */
function Choice({ pressed, onClick, children, label }: { pressed: boolean; onClick: () => void; children: ReactNode; label?: string }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      aria-label={label}
      onClick={onClick}
      className={cn('flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-[13px] hover:bg-surface-2', pressed ? 'bg-accent-soft font-medium text-accent' : 'text-fg')}
    >
      {children}
    </button>
  );
}

/** Line spacing (1.0, 1.15, 1.5, 2.0 or a custom multiple) and the way to the Paragraph dialog. */
export function LineSpacingControl({ editor }: { editor: Editor }) {
  const [dialog, setDialog] = useState(false);
  const current = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      const block = currentBlock(e.state);
      return block ? formatOf(block.node.attrs).lineSpacing : undefined;
    },
  });
  const [custom, setCustom] = useState('');
  const [error, setError] = useState(false);
  return (
    <>
      <Popover
        trigger={({ toggle, open }) => (
          <IconButton label="Line and paragraph spacing" aria-expanded={open} onClick={toggle}>
            <ArrowUpDown size={16} />
          </IconButton>
        )}
      >
        {(close) => (
          <div role="group" aria-label="Line spacing" className="grid w-52 gap-0.5">
            <Choice pressed={current === null} onClick={() => (editor.chain().focus().setLineSpacing(null).run(), close())}>
              Default
            </Choice>
            {LINE_SPACING_PRESETS.map((v) => (
              <Choice key={v} pressed={current === v} label={`Line spacing ${SPACING_LABELS[v]}`} onClick={() => (editor.chain().focus().setLineSpacing(v).run(), close())}>
                {SPACING_LABELS[v]}
              </Choice>
            ))}
            <form
              className="mt-1 grid gap-1 border-t border-border pt-2"
              onSubmit={(e) => {
                e.preventDefault();
                const v = readNumber(custom);
                const ok = v !== null && v >= LINE_SPACING_LIMITS.min && v <= LINE_SPACING_LIMITS.max;
                setError(!ok);
                if (ok) {
                  editor.chain().focus().setLineSpacing(v).run();
                  close();
                }
              }}
            >
              <label className="grid gap-1 text-xs text-muted">
                Custom line spacing
                <div className="flex gap-1.5">
                  <Input
                    type="number"
                    min={LINE_SPACING_LIMITS.min}
                    max={LINE_SPACING_LIMITS.max}
                    step={0.05}
                    placeholder={current && !(LINE_SPACING_PRESETS as readonly number[]).includes(current) ? String(current) : 'e.g. 1.25'}
                    aria-label="Custom line spacing"
                    value={custom}
                    aria-invalid={error || undefined}
                    onChange={(e) => setCustom(e.target.value)}
                    className="h-8 px-2"
                  />
                  <Button size="sm" type="submit">
                    Set
                  </Button>
                </div>
              </label>
              {error && (
                <span role="alert" className="text-xs text-danger">
                  Enter a number from {LINE_SPACING_LIMITS.min} to {LINE_SPACING_LIMITS.max}.
                </span>
              )}
            </form>
            <button
              type="button"
              onClick={() => {
                close();
                setDialog(true);
              }}
              className="mt-1 rounded-md border-t border-border px-2 pb-1 pt-2 text-left text-[13px] text-fg hover:bg-surface-2"
            >
              Paragraph settings…
            </button>
          </div>
        )}
      </Popover>
      {dialog && <ParagraphDialog editor={editor} onClose={() => setDialog(false)} />}
    </>
  );
}

/** Increase and decrease indent (list items are demoted and promoted, as in Word), and the Paragraph dialog. */
export function IndentControls({ editor }: { editor: Editor }) {
  const [dialog, setDialog] = useState(false);
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({ canIndent: e.can().increaseIndent(), canOutdent: e.can().decreaseIndent() }),
  });
  return (
    <>
      <IconButton label="Decrease indent (Ctrl+Shift+M)" disabled={!s.canOutdent} onClick={() => editor.chain().focus().decreaseIndent().run()}>
        <IndentDecrease size={16} />
      </IconButton>
      <IconButton label="Increase indent (Ctrl+M)" disabled={!s.canIndent} onClick={() => editor.chain().focus().increaseIndent().run()}>
        <IndentIncrease size={16} />
      </IconButton>
      <IconButton label="Paragraph settings" onClick={() => setDialog(true)}>
        <Pilcrow size={16} />
      </IconButton>
      {dialog && <ParagraphDialog editor={editor} onClose={() => setDialog(false)} />}
    </>
  );
}

/** The bullet glyph menu shown beside the Bulleted list button. */
export function BulletStyleMenu({ editor }: { editor: Editor }) {
  const current = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      const list = listAt(e.state, 'bulletList');
      return list ? bulletStyleOf(list.node.attrs.bulletStyle) : undefined;
    },
  });
  return (
    <Popover
      trigger={({ toggle, open }) => (
        <IconButton label="Bullet style" aria-expanded={open} onClick={toggle} className="min-w-5 px-0.5">
          <ChevronDown size={12} />
        </IconButton>
      )}
    >
      {(close) => (
        <div role="group" aria-label="Bullet style" className="grid w-44 gap-0.5">
          <Choice pressed={current === null} onClick={() => (editor.chain().focus().setBulletStyle(null).run(), close())}>
            <span className="w-5 text-center" aria-hidden>
              •
            </span>
            Default (by level)
          </Choice>
          {BULLET_STYLES.map((b) => (
            <Choice key={b.id} pressed={current === b.id} onClick={() => (editor.chain().focus().setBulletStyle(b.id).run(), close())}>
              <span className="w-5 text-center" aria-hidden>
                {b.glyph}
              </span>
              {b.label}
            </Choice>
          ))}
        </div>
      )}
    </Popover>
  );
}

/** The number format menu shown beside the Numbered list button, with the list's start number. */
export function NumberFormatMenu({ editor }: { editor: Editor }) {
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      const list = listAt(e.state, 'orderedList');
      return list ? { format: numberFormatOf(list.node.attrs.numberFormat), start: Number(list.node.attrs.start) || 1 } : null;
    },
  });
  const [start, setStart] = useState('');
  const [error, setError] = useState(false);
  return (
    <Popover
      trigger={({ toggle, open }) => (
        <IconButton label="Numbering format" aria-expanded={open} onClick={toggle} className="min-w-5 px-0.5">
          <ChevronDown size={12} />
        </IconButton>
      )}
    >
      {(close) => (
        <div role="group" aria-label="Numbering format" className="grid w-48 gap-0.5">
          <Choice pressed={!!s && s.format === null} onClick={() => (editor.chain().focus().setNumberFormat(null).run(), close())}>
            Default (by level)
          </Choice>
          {NUMBER_FORMATS.map((f) => (
            <Choice key={f.id} pressed={s?.format === f.id} onClick={() => (editor.chain().focus().setNumberFormat(f.id).run(), close())}>
              {f.label}
            </Choice>
          ))}
          <form
            className="mt-1 grid gap-1 border-t border-border pt-2"
            onSubmit={(e) => {
              e.preventDefault();
              const n = readNumber(start);
              const ok = n !== null && Number.isInteger(n) && n >= 1 && n <= MAX_LIST_START;
              setError(!ok);
              if (ok) {
                editor.chain().focus().setListStart(n).run();
                close();
              }
            }}
          >
            <label className="grid gap-1 text-xs text-muted">
              Start numbering at
              <div className="flex gap-1.5">
                <Input
                  type="number"
                  min={1}
                  max={MAX_LIST_START}
                  step={1}
                  disabled={!s}
                  placeholder={s ? String(s.start) : '—'}
                  aria-label="Start numbering at"
                  value={start}
                  aria-invalid={error || undefined}
                  onChange={(e) => setStart(e.target.value)}
                  className="h-8 px-2"
                />
                <Button size="sm" type="submit" disabled={!s}>
                  Set
                </Button>
              </div>
            </label>
            {!s && <span className="text-xs text-muted">Place the cursor in a numbered list.</span>}
            {error && (
              <span role="alert" className="text-xs text-danger">
                Enter a whole number from 1 to {MAX_LIST_START}.
              </span>
            )}
          </form>
        </div>
      )}
    </Popover>
  );
}

/** Any font size in points (1–400), as Word's size box allows; the presets stay in the size list. */
export function CustomFontSize({ editor }: { editor: Editor }) {
  const size = useEditorState({ editor, selector: ({ editor: e }) => (e.getAttributes('textStyle').fontSize as string | undefined) ?? '' });
  const [text, setText] = useState<string | null>(null);
  const shown = text ?? (/^[\d.]+pt$/.test(size) ? size.replace('pt', '') : '');
  /** Enter applies and returns to the text; leaving the field applies without taking the focus back. */
  const apply = (refocus: boolean) => {
    if (text === null) return;
    const n = readNumber(text);
    setText(null);
    if (n === null) return;
    const pt = Math.round(Math.min(400, Math.max(1, n)) * 2) / 2;
    (refocus ? editor.chain().focus() : editor.chain()).setFontSize(`${pt}pt`).run();
  };
  return (
    <Input
      type="number"
      min={1}
      max={400}
      step={0.5}
      aria-label="Custom font size (pt)"
      title="Custom font size (pt): type a size and press Enter"
      placeholder="pt"
      value={shown}
      onChange={(e) => setText(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          apply(true);
        }
        if (e.key === 'Escape') setText(null);
      }}
      onBlur={() => apply(false)}
      className="h-8 w-14 px-1.5 text-[13px]"
    />
  );
}
