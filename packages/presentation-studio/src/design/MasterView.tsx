import type { Editor } from '@tiptap/core';
import { cn, useToast } from '@dcos/ui';
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Baseline,
  Bold,
  BringToFront,
  ImagePlus,
  Italic,
  Minus,
  Paintbrush,
  Redo2,
  SendToBack,
  Square,
  SquareDashed,
  Trash2,
  Type,
  Undo2,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { newId } from '../create';
import { canReorder, type ZOrder } from '../editor/arrange';
import { Canvas, type CanvasCommands } from '../editor/Canvas';
import { copyElements, hasClipboardElements, readPasteEvent, rememberedElements, rememberElements, writeElementsToEvent } from '../editor/clipboard';
import { cloneElement } from '../editor/model';
import { clearParagraphAlign, clearTextStyleAttr } from '../editor/richText';
import { modKey } from '../editor/SlidesPanel';
import type { EditorModel } from '../editor/useEditorModel';
import type { PresentationImageHost } from '../hosts';
import { textStyle } from '../layouts';
import { SlideView } from '../render/SlideView';
import {
  emptyRichText,
  richTextFromPlain,
  THEME_COLOR_SLOTS,
  type Color,
  type ImageElement,
  type PresentationContent,
  type ShapeElement,
  type Slide,
  type SlideElement,
  type SlideLayout,
  type TextAlign,
  type TextElement,
  type TextStyle,
  type ThemeColorSlot,
  type VerticalAlign,
} from '../types';
import { ContextMenu, type ContextMenuItem, type ContextMenuState } from '../ui/ContextMenu';
import { FONT_NAMES, FONT_SIZES } from '../ui/HomeTab';
import { ColorSwatches, Group, Popover, STANDARD_COLORS, ToolButton } from '../ui/parts';
import { Ribbon } from '../ui/Ribbon';
import { PICTURE_TYPES } from './BackgroundDialog';
import {
  addDecorations,
  addPlaceholder,
  removeFromTarget,
  reorderDecorations,
  setShowMasterDecorations,
  slidesUsing,
  targetOf,
  updateDecorations,
  updatePlaceholder,
  type MasterTarget,
} from './model';
import { pictureSize } from './pictures';

/** Canvas ids of placeholders in master view (decorations keep their own ids). */
export const PH = 'ph:';
const isPh = (id: string) => id.startsWith(PH);
const phId = (id: string) => id.slice(PH.length);
const MV_LAYOUT = '__master-view__';
/** Master view formats whole text boxes only, so it does not follow the live text editor. */
const noEditor = (editor: Editor | null) => void editor;

/**
 * The master or a layout as a slide the canvas can edit: its decorations, then its placeholders as text boxes that
 * fill themselves (so the canvas draws their prompt). A layout shows its master's background and decorations behind
 * (not editable here) unless it hides them. With `promptText` the prompts are the text (for the thumbnails, which
 * never draw prompts).
 */
export function masterViewSlide(content: PresentationContent, target: MasterTarget, promptText = false): { content: PresentationContent; slide: Slide } | null {
  const t = targetOf(content, target);
  if (!t) return null;
  const layout = target.kind === 'layout' ? (t as SlideLayout) : null;
  const masterId = layout ? layout.masterId : t.id;
  const stand: SlideLayout = {
    id: MV_LAYOUT,
    masterId,
    name: t.name,
    kind: 'blank',
    ...(layout?.background ? { background: layout.background } : {}),
    placeholders: t.placeholders,
    decorations: [],
    showMasterDecorations: layout ? layout.showMasterDecorations : false,
  };
  const placeholders: TextElement[] = t.placeholders.map((p) => ({
    id: PH + p.id,
    type: 'text',
    x: p.x,
    y: p.y,
    w: p.w,
    h: p.h,
    rotation: 0,
    placeholderId: p.id,
    text: promptText ? richTextFromPlain(p.prompt) : emptyRichText(),
    style: p.style,
  }));
  return {
    content: { ...content, layouts: [stand] },
    slide: { id: `mv:${t.id}`, layoutId: MV_LAYOUT, elements: [...t.decorations, ...placeholders], notes: emptyRichText() },
  };
}

const SLOT_NAMES: Partial<Record<ThemeColorSlot, string>> = { dark1: 'Text', light1: 'Background', dark2: 'Text 2', light2: 'Background 2' };
const ALIGNS: Array<[TextAlign, string, typeof AlignLeft]> = [
  ['left', 'Align left', AlignLeft],
  ['center', 'Centre', AlignCenter],
  ['right', 'Align right', AlignRight],
  ['justify', 'Justify', AlignJustify],
];

export interface MasterViewProps {
  model: EditorModel;
  imageHost?: PresentationImageHost;
  wide: boolean;
  target: MasterTarget;
  onTarget: (t: MasterTarget) => void;
  onClose: () => void;
  undo: () => void;
  redo: () => void;
  openBackground: (target: MasterTarget) => void;
}

/**
 * Master view: the slide master and its layouts in a list, the chosen one on the canvas. Placeholders can be moved,
 * resized and formatted; decorations (text, shapes, pictures) added, edited, arranged and removed; layouts get text
 * placeholders and can hide the master's decorations. Every change is one step in the editor's single undo history,
 * and flows to the slides that use the master or layout (design/model.ts).
 */
export function MasterView({ model, imageHost, wide, target, onTarget, onClose, undo, redo, openBackground }: MasterViewProps) {
  const content = model.state.content;
  const toast = useToast();
  const view = useMemo(() => masterViewSlide(content, target), [content, target]);
  const [selection, setSelection] = useState<string[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [caretAt, setCaretAt] = useState<{ x: number; y: number } | null>(null);
  const [menu, setMenu] = useState<ContextMenuState | null>(null);
  const [focus, setFocus] = useState(0);
  const session = useRef(0);
  const file = useRef<HTMLInputElement>(null);

  // A target that went away (undo of an added layout…) falls back to the master.
  useEffect(() => {
    if (!view && content.masters[0]) onTarget({ kind: 'master', id: content.masters[0].id });
  }, [view, content.masters, onTarget]);

  const elements = view?.slide.elements ?? [];
  const sel = selection.filter((id) => elements.some((e) => e.id === id));
  const selected = elements.filter((e) => sel.includes(e.id));
  const editing = editingId && elements.some((e) => e.id === editingId) ? editingId : null;
  useEffect(() => {
    if (editingId && !editing) setEditingId(null);
  }, [editingId, editing]);

  const decorationIds = (ids: string[]) => ids.filter((id) => !isPh(id));
  const selectedDecorations = () => {
    const t = targetOf(model.latest().content, target);
    return t ? t.decorations.filter((d) => sel.includes(d.id)) : [];
  };
  const isLayout = target.kind === 'layout';
  const removable = (ids: string[]) => ids.filter((id) => !isPh(id) || isLayout);

  const stopEdit = () => {
    setEditingId(null);
    setCaretAt(null);
    model.endGroup({ dropIfUnchanged: true });
    setFocus((n) => n + 1);
  };

  const remove = (ids = sel) => {
    const gone = removable(ids);
    if (!gone.length) return;
    if (editing) stopEdit();
    model.apply((c) => removeFromTarget(c, target, { placeholders: gone.filter(isPh).map(phId), decorations: decorationIds(gone) }));
    setSelection([]);
  };

  const addDecoration = (els: SlideElement[], offset = 0) => {
    if (!els.length) return [];
    if (editing) stopEdit();
    const copies = els.map((e) => {
      const c = cloneElement(e, newId);
      return { ...c, x: Math.round(c.x + offset), y: Math.round(c.y + offset) } as SlideElement;
    });
    model.apply((c) => addDecorations(c, target, copies));
    setSelection(copies.map((c) => c.id));
    setFocus((n) => n + 1);
    return copies.map((c) => c.id);
  };

  const reorder = (how: ZOrder) => model.apply((c) => reorderDecorations(c, target, decorationIds(sel), how));
  const canOrder = (how: ZOrder) => {
    const t = targetOf(content, target);
    return !!t && decorationIds(sel).length > 0 && canReorder(t.decorations, decorationIds(sel), how);
  };

  const setLocked = (locked: boolean) =>
    model.apply((c) =>
      updateDecorations(c, target, decorationIds(sel), (e) => {
        if (!!e.locked === locked) return e;
        if (locked) return { ...e, locked: true };
        const { locked: _drop, ...rest } = e;
        void _drop;
        return rest as SlideElement;
      }),
    );

  const menuItems = (): ContextMenuItem[] => {
    const decs = selectedDecorations();
    const mod = modKey();
    const allLocked = decs.length > 0 && decs.every((d) => d.locked);
    return [
      { label: 'Cut', hint: `${mod}X`, disabled: !decs.length, onSelect: () => (copyElements(decs), remove(decs.map((d) => d.id))) },
      { label: 'Copy', hint: `${mod}C`, disabled: !decs.length, onSelect: () => copyElements(decs) },
      { label: 'Paste', hint: `${mod}V`, disabled: !hasClipboardElements(), onSelect: () => addDecoration(rememberedElements(), 16) },
      { label: 'Duplicate', hint: `${mod}D`, disabled: !decs.length, onSelect: () => addDecoration(decs, 16) },
      { label: 'Delete', hint: 'Del', disabled: !removable(sel).length, danger: true, onSelect: () => remove() },
      { label: 'Bring to front', disabled: !canOrder('front'), onSelect: () => reorder('front'), separator: true },
      { label: 'Bring forward', disabled: !canOrder('forward'), onSelect: () => reorder('forward') },
      { label: 'Send backward', disabled: !canOrder('backward'), onSelect: () => reorder('backward') },
      { label: 'Send to back', disabled: !canOrder('back'), onSelect: () => reorder('back') },
      { label: allLocked ? 'Unlock' : 'Lock', disabled: !decs.length, onSelect: () => setLocked(!allLocked), separator: true },
      { label: 'Select all', hint: `${mod}A`, disabled: !elements.length, onSelect: () => setSelection(elements.map((e) => e.id)) },
    ];
  };

  const commands: CanvasCommands = {
    copy: () => {
      const decs = selectedDecorations();
      if (decs.length) rememberElements(decs);
    },
    cut: () => {
      const decs = selectedDecorations();
      if (!decs.length) return;
      rememberElements(decs);
      remove(decs.map((d) => d.id));
    },
    copyToEvent: (e) => {
      const decs = selectedDecorations();
      if (decs.length) writeElementsToEvent(e, decs);
    },
    pasteFromEvent: (e) => {
      const got = readPasteEvent(e);
      if (!got) return false;
      if (got.kind === 'elements') addDecoration(got.elements, 16);
      else insertText(richTextFromPlain(got.text.replace(/\r\n?/g, '\n')), false);
      return true;
    },
    paste: () => addDecoration(rememberedElements(), 16),
    duplicate: () => addDecoration(selectedDecorations(), 16),
    remove: () => remove(),
    selectAll: () => setSelection(elements.map((e) => e.id)),
    nudge: (dx, dy) =>
      model.apply(
        (c) => {
          let next = updateDecorations(c, target, decorationIds(sel), (e) => (e.locked ? e : { ...e, x: Math.round(e.x + dx), y: Math.round(e.y + dy) }));
          for (const id of sel.filter(isPh)) next = updatePlaceholder(next, target, phId(id), (p) => ({ ...p, x: Math.round(p.x + dx), y: Math.round(p.y + dy) }));
          return next;
        },
        { group: `mv-nudge:${target.id}:${sel.join(',')}` },
      ),
    bringForward: (toFront) => reorder(toFront ? 'front' : 'forward'),
    sendBackward: (toBack) => reorder(toBack ? 'back' : 'backward'),
    menuItems,
  };

  // ── Inserting decorations ───────────────────────────────────────────────────────────────────────

  const { width: W, height: H } = content.size;
  const insertText = (doc = emptyRichText(), edit = true) => {
    const w = Math.round(W / 3);
    const h = 44;
    const el: TextElement = { id: newId(), type: 'text', x: Math.round((W - w) / 2), y: Math.round((H - h) / 2), w, h, rotation: 0, text: doc, style: textStyle({ autofit: 'resize' }) };
    if (editing) stopEdit();
    model.apply((c) => addDecorations(c, target, [el]));
    setSelection([el.id]);
    if (edit) {
      session.current += 1;
      setEditingId(el.id);
    } else setFocus((n) => n + 1);
  };
  const insertShape = (preset: 'rect' | 'line') => {
    const el: ShapeElement =
      preset === 'rect'
        ? { id: newId(), type: 'shape', preset, x: Math.round(W / 2 - 100), y: Math.round(H / 2 - 50), w: 200, h: 100, rotation: 0, fill: { type: 'solid', color: { theme: 'accent1' } }, line: null }
        : { id: newId(), type: 'shape', preset, x: Math.round(W / 2 - 150), y: Math.round(H / 2), w: 300, h: 0, rotation: 0, fill: { type: 'none' }, line: { color: { theme: 'accent1' }, width: 2, dash: 'solid' } };
    addDecoration([el]);
  };
  const insertPicture = async (f: File | undefined) => {
    if (!f || !imageHost) return;
    if (!PICTURE_TYPES.includes(f.type)) return toast('Choose a PNG, JPEG, GIF or WebP picture.', 'error');
    const size = await pictureSize(f);
    if (!size) return toast('This picture could not be read.', 'error');
    try {
      const stored = await imageHost.putAttachment(f, f.type);
      const scale = Math.min(1, (W * 0.3) / size.width, (H * 0.3) / size.height);
      const w = Math.max(1, Math.round(size.width * scale));
      const h = Math.max(1, Math.round(size.height * scale));
      const el: ImageElement = { id: newId(), type: 'image', x: Math.round((W - w) / 2), y: Math.round((H - h) / 2), w, h, rotation: 0, attachmentId: stored.id, mimeType: f.type, naturalWidth: size.width, naturalHeight: size.height, fit: 'contain', alt: f.name.replace(/\.[^.]+$/, '') };
      addDecoration([el]);
    } catch (err) {
      toast(`The picture could not be stored: ${err instanceof Error ? err.message : String(err)}`, 'error');
    }
  };
  const insertPlaceholder = () => {
    if (target.kind !== 'layout') return;
    const r = addPlaceholder(model.latest().content, target.id);
    if (!r.id) return;
    if (editing) stopEdit();
    model.apply(() => r.content);
    setSelection([PH + r.id]);
    setFocus((n) => n + 1);
  };

  // ── Text formatting (placeholders and decoration text boxes, as whole boxes) ─────────────────────

  const textTargets = selected.filter((e): e is TextElement => e.type === 'text');
  const hasText = textTargets.length > 0 && !editing;
  const formatStyle = (change: (s: TextStyle) => TextStyle, clean?: (doc: TextElement['text']) => TextElement['text']) => {
    const ids = textTargets.map((t) => t.id);
    model.apply((c) => {
      let next = c;
      for (const id of ids.filter(isPh)) next = updatePlaceholder(next, target, phId(id), (p) => ({ ...p, style: change(p.style) }));
      return updateDecorations(next, target, decorationIds(ids), (e) => (e.type === 'text' ? { ...e, style: change(e.style), text: clean ? clean(e.text) : e.text } : e));
    });
  };
  const common = <T,>(values: T[]): T | '' => (values.length && values.every((v) => JSON.stringify(v) === JSON.stringify(values[0])) ? values[0] : '');
  const font = common(textTargets.map((t) => t.style.font));
  const size = common(textTargets.map((t) => t.style.fontSize));
  const align = common(textTargets.map((t) => t.style.align));
  const vAlign = common(textTargets.map((t) => t.style.verticalAlign));
  const bold = hasText && textTargets.every((t) => t.style.bold);
  const italic = hasText && textTargets.every((t) => t.style.italic);
  const theme = content.theme;
  const fontOptions = font && font !== 'heading' && font !== 'body' && !FONT_NAMES.includes(font) ? [...FONT_NAMES, font] : FONT_NAMES;
  const sizeOptions = typeof size === 'number' && !FONT_SIZES.includes(size) ? [...FONT_SIZES, size].sort((a, b) => a - b) : FONT_SIZES;

  const t = targetOf(content, target);
  const layout = target.kind === 'layout' ? (t as SlideLayout | undefined) : undefined;
  const mod = modKey();
  const masterTab = (
    <>
      <Group label="Master view">
        <ToolButton label="Close master view" text="Close master view" onClick={onClose}>
          <X size={16} />
        </ToolButton>
      </Group>
      <Group label="Insert">
        <ToolButton label="Text box" text="Text box" onClick={() => insertText()}>
          <Type size={16} />
        </ToolButton>
        <ToolButton label="Rectangle" onClick={() => insertShape('rect')}>
          <Square size={16} />
        </ToolButton>
        <ToolButton label="Line" onClick={() => insertShape('line')}>
          <Minus size={16} />
        </ToolButton>
        {imageHost && (
          <ToolButton label="Picture" onClick={() => file.current?.click()}>
            <ImagePlus size={16} />
          </ToolButton>
        )}
        {layout && (
          <ToolButton label="Text placeholder" text="Placeholder" onClick={insertPlaceholder}>
            <SquareDashed size={16} />
          </ToolButton>
        )}
      </Group>
      <Group label="Text">
        <select
          aria-label="Font"
          value={font}
          disabled={!hasText}
          onChange={(e) => e.target.value && formatStyle((s) => ({ ...s, font: e.target.value }), (d) => clearTextStyleAttr(d, 'fontFamily'))}
          className="h-8 w-36 rounded-md border border-border bg-surface px-1 text-xs disabled:opacity-40"
        >
          {font === '' && <option value="">{hasText ? 'Mixed' : 'Font'}</option>}
          <option value="heading">Headings ({theme.fonts.heading})</option>
          <option value="body">Body ({theme.fonts.body})</option>
          {fontOptions.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
        <select
          aria-label="Font size"
          value={size === '' ? '' : String(size)}
          disabled={!hasText}
          onChange={(e) => {
            const pt = Number(e.target.value);
            if (pt > 0) formatStyle((s) => ({ ...s, fontSize: pt }), (d) => clearTextStyleAttr(d, 'fontSize'));
          }}
          className="h-8 w-[4.5rem] rounded-md border border-border bg-surface px-1 text-xs disabled:opacity-40"
        >
          {size === '' && <option value="">{hasText ? '–' : 'Size'}</option>}
          {sizeOptions.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <ToolButton label="Bold" pressed={bold} disabled={!hasText} onClick={() => formatStyle((s) => ({ ...s, bold: !bold }))}>
          <Bold size={16} />
        </ToolButton>
        <ToolButton label="Italic" pressed={italic} disabled={!hasText} onClick={() => formatStyle((s) => ({ ...s, italic: !italic }))}>
          <Italic size={16} />
        </ToolButton>
        <Popover
          label="Text colour"
          trigger={({ open, toggle }) => (
            <ToolButton label="Text colour" aria-expanded={open} aria-haspopup="dialog" disabled={!hasText} onClick={toggle}>
              <Baseline size={16} />
            </ToolButton>
          )}
        >
          {(close) => (
            <ColorSwatches
              automaticLabel="Automatic"
              theme={THEME_COLOR_SLOTS.filter((s) => s !== 'hyperlink').map((slot) => ({ label: `${SLOT_NAMES[slot] ?? slot.replace('accent', 'Accent ')} (${theme.colors[slot]})`, value: slot, css: theme.colors[slot] }))}
              standard={STANDARD_COLORS}
              onPick={(v) => {
                const color: Color = v === null ? { theme: 'dark1' } : v.startsWith('#') ? v : { theme: v as ThemeColorSlot };
                formatStyle((s) => ({ ...s, color }), (d) => clearTextStyleAttr(d, 'color'));
                close();
              }}
            />
          )}
        </Popover>
        {ALIGNS.map(([a, label, Icon]) => (
          <ToolButton key={a} label={label} pressed={hasText && align === a} disabled={!hasText} onClick={() => formatStyle((s) => ({ ...s, align: a }), clearParagraphAlign)}>
            <Icon size={16} />
          </ToolButton>
        ))}
        <select
          aria-label="Vertical alignment"
          value={vAlign}
          disabled={!hasText}
          onChange={(e) => e.target.value && formatStyle((s) => ({ ...s, verticalAlign: e.target.value as VerticalAlign }))}
          className="h-8 w-24 rounded-md border border-border bg-surface px-1 text-xs disabled:opacity-40"
        >
          {vAlign === '' && <option value="">{hasText ? 'Mixed' : 'Position'}</option>}
          <option value="top">Top</option>
          <option value="middle">Middle</option>
          <option value="bottom">Bottom</option>
        </select>
      </Group>
      <Group label="Background">
        <ToolButton label="Format background" text="Background" onClick={() => openBackground(target)}>
          <Paintbrush size={16} />
        </ToolButton>
        {layout && (
          <ToolButton label="Hide master graphics" pressed={!layout.showMasterDecorations} onClick={() => model.apply((c) => setShowMasterDecorations(c, layout.id, !layout.showMasterDecorations))}>
            <SquareDashed size={16} className="opacity-60" />
          </ToolButton>
        )}
      </Group>
      <Group label="Arrange">
        <ToolButton label="Bring to front" disabled={!canOrder('front')} onClick={() => reorder('front')}>
          <BringToFront size={16} />
        </ToolButton>
        <ToolButton label="Send to back" disabled={!canOrder('back')} onClick={() => reorder('back')}>
          <SendToBack size={16} />
        </ToolButton>
        <ToolButton label="Delete" shortcut="Del" disabled={!removable(sel).length || !!editing} onClick={() => remove()}>
          <Trash2 size={16} />
        </ToolButton>
      </Group>
    </>
  );

  // ── The list of the master and its layouts ──────────────────────────────────────────────────────

  const master = target.kind === 'master' ? content.masters.find((m) => m.id === target.id) : content.masters.find((m) => m.id === layout?.masterId);
  const targets: Array<{ target: MasterTarget; label: string; name: string; indent: boolean }> = master
    ? [
        { target: { kind: 'master', id: master.id }, label: `Slide master: ${master.name}, used by all ${content.slides.length === 1 ? '1 slide' : `${content.slides.length} slides`}`, name: 'Slide master', indent: false },
        ...content.layouts
          .filter((l) => l.masterId === master.id)
          .map((l) => {
            const n = slidesUsing(content, l.id).length;
            return { target: { kind: 'layout', id: l.id } as MasterTarget, label: `${l.name} layout, ${n === 0 ? 'not used' : n === 1 ? 'used by 1 slide' : `used by ${n} slides`}`, name: l.name, indent: true };
          }),
      ]
    : [];
  const index = Math.max(0, targets.findIndex((x) => x.target.id === target.id && x.target.kind === target.kind));
  const options = useRef<Array<HTMLButtonElement | null>>([]);
  const onListKey = (e: KeyboardEvent) => {
    const last = targets.length - 1;
    const to = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? index + 1 : e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? index - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? last : null;
    if (to === null) return;
    e.preventDefault();
    const next = targets[Math.max(0, Math.min(last, to))];
    choose(next.target);
    requestAnimationFrame(() => options.current[targets.indexOf(next)]?.focus());
  };
  const choose = (next: MasterTarget) => {
    if (editing) stopEdit();
    setSelection([]);
    onTarget(next);
  };
  const thumbWidth = wide ? 160 : 112;

  const t2 = targetOf(content, target);
  const users = target.kind === 'layout' ? slidesUsing(content, target.id).length : content.slides.length;

  return (
    <>
      <Ribbon
        tabs={[{ id: 'master', label: 'Slide Master', content: masterTab }]}
        active="master"
        onTab={() => undefined}
        leading={
          <>
            <ToolButton label="Undo" shortcut={`${mod}Z`} onClick={() => (editing && stopEdit(), undo())} disabled={!model.canUndo}>
              <Undo2 size={16} />
            </ToolButton>
            <ToolButton label="Redo" shortcut={mod === '⌘' ? '⌘⇧Z' : 'Ctrl+Y'} onClick={() => (editing && stopEdit(), redo())} disabled={!model.canRedo}>
              <Redo2 size={16} />
            </ToolButton>
          </>
        }
      />
      <div className="flex min-h-0 flex-1 flex-col md:flex-row" data-master-view="">
        <div
          role="listbox"
          aria-label="Slide master and layouts"
          aria-orientation={wide ? 'vertical' : 'horizontal'}
          onKeyDown={onListKey}
          className="flex shrink-0 gap-2 overflow-x-auto border-b border-border bg-surface p-2 md:w-56 md:flex-col md:overflow-y-auto md:overflow-x-hidden md:border-b-0 md:border-r"
        >
          {targets.map((x, i) => {
            const thumb = masterViewSlide(content, x.target, true);
            const current = i === index;
            return (
              <button
                key={`${x.target.kind}:${x.target.id}`}
                ref={(el) => {
                  options.current[i] = el;
                }}
                type="button"
                role="option"
                aria-selected={current}
                aria-label={x.label}
                tabIndex={current ? 0 : -1}
                onClick={() => choose(x.target)}
                className={cn('flex shrink-0 flex-col gap-1 rounded-lg p-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-accent', current ? 'bg-accent-soft' : 'hover:bg-surface-2', x.indent && wide && 'ml-4')}
              >
                <span className={cn('w-fit overflow-hidden rounded border shadow-xs', current ? 'border-accent' : 'border-border')}>
                  {thumb && <SlideView content={thumb.content} slide={thumb.slide} scale={(x.indent || !wide ? thumbWidth : thumbWidth + 16) / content.size.width} imageHost={imageHost} />}
                </span>
                <span className="max-w-[10rem] truncate text-[11px] text-muted">{x.name}</span>
              </button>
            );
          })}
        </div>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <p className="shrink-0 border-b border-border bg-surface-2/60 px-3 py-1.5 text-xs text-muted" role="status">
            {t2 ? `Editing ${target.kind === 'master' ? 'the slide master' : `the “${t2.name}” layout`} (${users === 1 ? '1 slide uses it' : `${users} slides use it`}). Changes apply to those slides, except where a slide was changed on its own.` : ''}
          </p>
          {view && (
            <Canvas
              content={view.content}
              slide={view.slide}
              slideNumber={1}
              label={target.kind === 'master' ? 'Objects on the slide master' : `Objects on the ${t2?.name ?? ''} layout`}
              canRotate={(el) => !isPh(el.id)}
              selection={sel}
              editingId={editing}
              imageHost={imageHost}
              onSelect={setSelection}
              onGeometry={(g) =>
                model.apply((c) => {
                  let next = c;
                  for (const [id, b] of g) {
                    const box = { x: Math.round(b.x), y: Math.round(b.y), w: Math.max(0, Math.round(b.w)), h: Math.max(0, Math.round(b.h)) };
                    if (isPh(id)) next = updatePlaceholder(next, target, phId(id), (p) => (p.x === box.x && p.y === box.y && p.w === box.w && p.h === box.h ? p : { ...p, ...box }));
                    else
                      next = updateDecorations(next, target, [id], (e) => {
                        const rotation = b.rotation === undefined ? e.rotation : Math.round(b.rotation) % 360;
                        return e.x === box.x && e.y === box.y && e.w === box.w && e.h === box.h && e.rotation === rotation ? e : { ...e, ...box, rotation };
                      });
                  }
                  return next;
                })
              }
              onStartEdit={(id, at) => {
                if (isPh(id)) return; // a placeholder's text belongs to the slides; its look is set with the Text group
                session.current += 1;
                setSelection([id]);
                setCaretAt(at ?? null);
                setEditingId(id);
              }}
              onStopEdit={stopEdit}
              onText={(id, doc) => model.apply((c) => updateDecorations(c, target, [id], (e) => (e.type === 'text' ? { ...e, text: doc } : e)), { group: `mv-text:${id}:${session.current}` })}
              onNeedHeight={(id, h) =>
                model.apply((c) => updateDecorations(c, target, [id], (e) => (e.type === 'text' && e.style.autofit === 'resize' && Math.abs(e.h - h) > 1 ? { ...e, h: Math.round(h) } : e)), { group: `mv-text:${id}:${session.current}` })
              }
              onFit={(heights) =>
                model.apply((c) => updateDecorations(c, target, [...heights.keys()].filter((id) => !isPh(id)), (e) => (e.type === 'text' && e.style.autofit === 'resize' && heights.has(e.id) ? { ...e, h: heights.get(e.id)! } : e)), { amend: true })
              }
              onEditor={noEditor}
              caretAt={caretAt}
              commands={commands}
              onContextMenu={(x, y, items, returnFocus) => setMenu({ x, y, items, label: 'Object', returnFocus })}
              focusRequest={focus}
            />
          )}
        </div>
      </div>
      <input
        ref={file}
        type="file"
        accept={PICTURE_TYPES.join(',')}
        aria-label="Picture file"
        className="hidden"
        onChange={(e) => {
          void insertPicture(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      <ContextMenu menu={menu} onClose={() => setMenu(null)} />
    </>
  );
}
