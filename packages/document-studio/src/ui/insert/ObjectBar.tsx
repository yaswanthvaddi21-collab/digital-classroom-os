import { Button, IconButton, Select, Separator, cn } from '@dcos/ui';
import type { Editor } from '@tiptap/core';
import { NodeSelection } from '@tiptap/pm/state';
import { useEditorState } from '@tiptap/react';
import { AlignCenter, AlignLeft, AlignRight, Pencil, Trash2 } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { writeEquation } from '../../extensions/equation';
import { imageAlign, imageCaption } from '../../extensions/figureImage';
import { safeColor, type Alignment } from '../../extensions/objectAttrs';
import { deleteNodeAt, updateNodeAt } from '../../extensions/objectCommands';
import { onObjectEditRequest } from '../../extensions/objectRequests';
import { readShape, SHAPE_KINDS, SHAPE_LABELS, SHAPE_MAX, SHAPE_MIN, shapeHasText } from '../../extensions/shapeModel';
import { readTextBox, TEXT_BOX_MAX, TEXT_BOX_MIN, TEXT_BOX_WRAP_LABELS, TEXT_BOX_WRAPS } from '../../extensions/textBox';
import type { RibbonContext } from '../ribbon/context';
import { EquationDialog, type EquationTarget } from './EquationDialog';

type Selected = { kind: 'inlineMath' | 'blockMath' | 'shape' | 'image' | 'textBox'; pos: number; attrs: Record<string, unknown> } | null;

/** The object the selection is on: a selected equation, shape or picture, or the text box the cursor is in. */
export function selectedObject(editor: Editor): Selected {
  if (!editor || editor.isDestroyed) return null;
  const sel = editor.state.selection;
  if (sel instanceof NodeSelection) {
    const name = sel.node.type.name;
    if (name === 'inlineMath' || name === 'blockMath' || name === 'shape' || name === 'image') return { kind: name, pos: sel.from, attrs: sel.node.attrs };
  }
  const $from = sel.$from;
  for (let d = $from.depth; d > 0; d--) if ($from.node(d).type.name === 'textBox') return { kind: 'textBox', pos: $from.before(d), attrs: $from.node(d).attrs };
  return null;
}

/** A text field that changes the document when the user is done (Enter or leaving the field), not on every key. */
function CommitInput({ value, onCommit, label, className, type = 'text', placeholder, min, max }: { value: string; onCommit: (v: string) => void; label: string; className?: string; type?: string; placeholder?: string; min?: number; max?: number }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = () => draft !== value && onCommit(draft);
  return (
    <input
      aria-label={label}
      title={label}
      type={type}
      min={min}
      max={max}
      value={draft}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          commit();
        }
        if (e.key === 'Escape') setDraft(value);
      }}
      className={cn('h-7 rounded-md border border-border bg-surface px-2 text-xs text-fg placeholder:text-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/40', className)}
    />
  );
}

/** A colour picker with a "none" choice (for fills and outlines). */
function ColorField({ label, value, onChange, noneLabel }: { label: string; value: string; onChange: (c: string) => void; noneLabel: string }) {
  const none = value === 'none';
  return (
    <span className="flex items-center gap-1">
      <input
        type="color"
        aria-label={label}
        title={label}
        value={none ? '#ffffff' : value}
        onChange={(e) => onChange(safeColor(e.target.value, '#000000', false))}
        className={cn('h-7 w-8 cursor-pointer rounded border border-border bg-surface p-0.5', none && 'opacity-40')}
      />
      <label className="flex items-center gap-1 text-xs text-muted">
        <input type="checkbox" checked={none} onChange={(e) => onChange(e.target.checked ? 'none' : '#ffffff')} />
        {noneLabel}
      </label>
    </span>
  );
}

function AlignButtons({ value, onChange }: { value: Alignment; onChange: (a: Alignment) => void }) {
  const items: Array<{ id: Alignment; label: string; icon: ReactNode }> = [
    { id: 'left', label: 'Align left', icon: <AlignLeft size={15} /> },
    { id: 'center', label: 'Centre', icon: <AlignCenter size={15} /> },
    { id: 'right', label: 'Align right', icon: <AlignRight size={15} /> },
  ];
  return (
    <>
      {items.map((i) => (
        <IconButton key={i.id} label={i.label} active={value === i.id} onClick={() => onChange(i.id)}>
          {i.icon}
        </IconButton>
      ))}
    </>
  );
}

/**
 * The bar floats over the top edge of the page area instead of taking room under the ribbon: appearing when an
 * object is selected, it must not move the document (the second click of a double-click would land elsewhere).
 */
function Bar({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="relative z-20 h-0">
      <div
        className="absolute inset-x-0 top-0 flex items-center gap-1 overflow-x-auto [&>*]:shrink-0 whitespace-nowrap border-y border-border bg-surface/95 px-2 py-1 text-xs shadow-sm backdrop-blur-sm [scrollbar-width:thin]"
        role="toolbar"
        aria-label={label}
      >
        <span className="shrink-0 px-1.5 font-medium text-muted">{label}</span>
        {children}
      </div>
    </div>
  );
}

const Field = ({ label, children }: { label: string; children: ReactNode }) => (
  <span className="flex items-center gap-1">
    <span className="text-muted">{label}</span>
    {children}
  </span>
);

const OUTLINE_WIDTHS = [0, 1, 2, 3, 4, 6, 8];

/**
 * Contextual tools under the ribbon for the selected equation, shape or picture, or the text box the cursor is in
 * (like the table tools). Also hosts the equation dialog, which the Insert tab, a double-click on an equation and
 * Enter on a selected one open.
 */
export function ObjectBar({ editor }: RibbonContext) {
  const selected = useEditorState({ editor, selector: ({ editor: e }) => selectedObject(e) });
  const [dialog, setDialog] = useState<EquationTarget | null>(null);

  useEffect(
    () =>
      onObjectEditRequest(editor, (request) => {
        if (!editor.isEditable) return;
        setDialog(request.kind === 'equation' ? { mode: 'edit', pos: request.pos } : { mode: 'insert', display: request.display });
      }),
    [editor],
  );

  const host = dialog && <EquationDialog editor={editor} target={dialog} onClose={() => setDialog(null)} />;
  if (!selected || !editor.isEditable) return host;
  const { kind, pos, attrs } = selected;
  const set = (patch: Record<string, unknown>) => updateNodeAt(editor, pos, kind, patch);
  const remove = (label: string) => (
    <Button size="sm" variant="ghost" className="text-danger" icon={<Trash2 size={14} />} onClick={() => deleteNodeAt(editor, pos, kind)}>
      {label}
    </Button>
  );

  let bar: ReactNode = null;
  if (kind === 'inlineMath' || kind === 'blockMath') {
    const display = kind === 'blockMath';
    bar = (
      <Bar label="Equation">
        <Button size="sm" variant="ghost" icon={<Pencil size={14} />} onClick={() => setDialog({ mode: 'edit', pos })}>
          Edit equation…
        </Button>
        <Button size="sm" variant="ghost" onClick={() => writeEquation(editor, String(attrs.latex ?? ''), !display, pos)}>
          {display ? 'Make inline' : 'Make display'}
        </Button>
        <Separator vertical />
        {remove('Delete equation')}
      </Bar>
    );
  } else if (kind === 'shape') {
    const s = readShape(attrs);
    bar = (
      <Bar label="Shape">
        <Select aria-label="Shape kind" value={s.kind} onChange={(e) => set({ kind: e.target.value })} className="h-7 text-xs">
          {SHAPE_KINDS.map((k) => (
            <option key={k} value={k}>
              {SHAPE_LABELS[k]}
            </option>
          ))}
        </Select>
        {s.kind !== 'line' && <ColorField label="Fill colour" value={s.fill} noneLabel="No fill" onChange={(fill) => set({ fill })} />}
        <ColorField label="Outline colour" value={s.stroke} noneLabel={s.kind === 'line' ? 'Hidden' : 'No outline'} onChange={(stroke) => set({ stroke })} />
        <Select aria-label="Outline width" value={String(s.strokeWidth)} onChange={(e) => set({ strokeWidth: Number(e.target.value) })} className="h-7 text-xs">
          {[...new Set([...OUTLINE_WIDTHS, s.strokeWidth])].sort((a, b) => a - b).map((w) => (
            <option key={w} value={w}>
              {w} px
            </option>
          ))}
        </Select>
        <Separator vertical />
        <Field label="W">
          <CommitInput label="Shape width in pixels" type="number" min={SHAPE_MIN} max={SHAPE_MAX} value={String(s.width)} onCommit={(v) => Number(v) && set({ width: Math.round(Math.min(SHAPE_MAX, Math.max(SHAPE_MIN, Number(v)))) })} className="w-16" />
        </Field>
        <Field label="H">
          <CommitInput label="Shape height in pixels" type="number" min={SHAPE_MIN} max={SHAPE_MAX} value={String(s.height)} onCommit={(v) => Number(v) && set({ height: Math.round(Math.min(SHAPE_MAX, Math.max(SHAPE_MIN, Number(v)))) })} className="w-16" />
        </Field>
        {shapeHasText(s.kind) && <CommitInput label="Shape text" value={s.text} placeholder="Text in the shape" onCommit={(text) => set({ text })} className="w-40" />}
        <Separator vertical />
        <AlignButtons value={s.align} onChange={(align) => set({ align })} />
        <Separator vertical />
        {remove('Delete shape')}
      </Bar>
    );
  } else if (kind === 'image') {
    bar = (
      <Bar label="Picture">
        <AlignButtons value={imageAlign(attrs)} onChange={(align) => set({ align })} />
        <Separator vertical />
        <CommitInput label="Caption" value={imageCaption(attrs)} placeholder="Caption (e.g. Figure 1. …)" onCommit={(c) => set({ caption: c.trim() || null })} className="w-56" />
        <CommitInput label="Alternative text" value={String(attrs.alt ?? '')} placeholder="Describe the picture" onCommit={(alt) => set({ alt: alt.trim() || null })} className="w-44" />
        <Separator vertical />
        {remove('Delete picture')}
      </Bar>
    );
  } else if (kind === 'textBox') {
    const b = readTextBox(attrs);
    bar = (
      <Bar label="Text box">
        <Select aria-label="Text wrapping" value={b.float} onChange={(e) => set({ float: e.target.value })} className="h-7 text-xs">
          {TEXT_BOX_WRAPS.map((w) => (
            <option key={w} value={w}>
              {TEXT_BOX_WRAP_LABELS[w]}
            </option>
          ))}
        </Select>
        <Field label="Width">
          <CommitInput
            label="Text box width in pixels"
            type="number"
            min={TEXT_BOX_MIN}
            max={TEXT_BOX_MAX}
            value={b.width === null ? '' : String(b.width)}
            placeholder="Auto"
            onCommit={(v) => set({ width: v.trim() && Number(v) ? Math.round(Math.min(TEXT_BOX_MAX, Math.max(TEXT_BOX_MIN, Number(v)))) : null })}
            className="w-20"
          />
        </Field>
        <ColorField label="Fill colour" value={b.fill} noneLabel="No fill" onChange={(fill) => set({ fill })} />
        <ColorField label="Border colour" value={b.borderColor} noneLabel="No border" onChange={(borderColor) => set({ borderColor })} />
        <Select aria-label="Border width" value={String(b.borderWidth)} onChange={(e) => set({ borderWidth: Number(e.target.value) })} className="h-7 text-xs">
          {[...new Set([0, 1, 2, 3, 4, b.borderWidth])].sort((x, y) => x - y).map((w) => (
            <option key={w} value={w}>
              {w} px
            </option>
          ))}
        </Select>
        <Separator vertical />
        {remove('Delete text box')}
      </Bar>
    );
  }
  return (
    <>
      {bar}
      {host}
    </>
  );
}
