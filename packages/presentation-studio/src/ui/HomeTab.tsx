import { Menu, Select } from '@dcos/ui';
import { useEditorState } from '@tiptap/react';
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Baseline,
  Bold,
  ClipboardPaste,
  Copy,
  CopyPlus,
  Italic,
  Layers,
  List,
  ListOrdered,
  Lock,
  Plus,
  Scissors,
  Strikethrough,
  Trash2,
  Underline,
} from 'lucide-react';
import { modKey } from '../editor/SlidesPanel';
import { allHaveMark, clearParagraphAlign, clearTextStyleAttr, listKindOf, setListEverywhere, setMarkEverywhere } from '../editor/richText';
import { fontSizePx } from '../render/RichText';
import { resolveColor } from '../themes';
import { plainTextOf, THEME_COLOR_SLOTS, type Autofit, type Color, type TextAlign, type TextElement, type ThemeColorSlot, type VerticalAlign } from '../types';
import type { RibbonContext } from './context';
import { LayoutMenu } from './LayoutPicker';
import { ColorSwatches, Group, Popover, STANDARD_COLORS, ToolButton } from './parts';

/** Fonts every platform has (or has a metric match for), so slides look the same in exports. */
export const FONT_NAMES = ['Arial', 'Verdana', 'Tahoma', 'Trebuchet MS', 'Georgia', 'Times New Roman', 'Courier New'];
export const FONT_SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 44, 48, 54, 60, 66, 72, 80, 96];

const SLOT_NAMES: Record<ThemeColorSlot, string> = {
  dark1: 'Text',
  light1: 'Background',
  dark2: 'Text 2',
  light2: 'Background 2',
  accent1: 'Accent 1',
  accent2: 'Accent 2',
  accent3: 'Accent 3',
  accent4: 'Accent 4',
  accent5: 'Accent 5',
  accent6: 'Accent 6',
  hyperlink: 'Link',
};

/** One value for all targets, or '' when they differ. */
function common<T>(values: T[]): T | '' {
  return values.length && values.every((v) => v === values[0]) ? values[0] : '';
}

const ptOf = (size: unknown): number | null => {
  const px = fontSizePx(size);
  return px === null ? null : Math.round((px * 72) / 96);
};

const ALIGN_ICONS: Record<TextAlign, typeof AlignLeft> = { left: AlignLeft, center: AlignCenter, right: AlignRight, justify: AlignJustify };
const ALIGN_LABELS: Record<TextAlign, string> = { left: 'Align left', center: 'Centre', right: 'Align right', justify: 'Justify' };

/** Whether rich text holds at least one character a mark could sit on (hard breaks alone hold none). */
export const holdsText = (doc: TextElement['text']) => /[^\n]/.test(plainTextOf(doc));

/**
 * Why Underline and Strikethrough are off for a selected box with no text. Unlike Bold and Italic they have no
 * box-level style (PRESENTATION_V1_VOCABULARY.textStyleFields is frozen), so they only mark text that exists; while
 * editing, the text editor applies them to what is typed next.
 */
export const EMPTY_BOX_MARK_HINT = 'type some text in the box first (double-click it to edit), then underline or strike it through';

/**
 * The Home tab: clipboard, new slide, font, paragraph and arrange. Formatting applies to the selected text while a
 * text box is being edited, and to whole text boxes when they are selected on the slide.
 */
export function HomeTab(ctx: RibbonContext) {
  const { editor, textTargets: targets, content, selected } = ctx;
  const theme = content.theme;
  const live = useEditorState({
    editor,
    selector: ({ editor: ed }) =>
      ed
        ? {
            bold: ed.isActive('bold'),
            italic: ed.isActive('italic'),
            underline: ed.isActive('underline'),
            strike: ed.isActive('strike'),
            bullet: ed.isActive('bulletList'),
            ordered: ed.isActive('orderedList'),
            align: (['left', 'center', 'right', 'justify'] as const).find((a) => ed.isActive({ textAlign: a })) ?? null,
            fontFamily: (ed.getAttributes('textStyle').fontFamily as string | undefined) ?? null,
            fontSize: (ed.getAttributes('textStyle').fontSize as string | undefined) ?? null,
          }
        : null,
  });
  const hasText = targets.length > 0;
  const style = (k: keyof TextElement['style']) => common(targets.map((t) => JSON.stringify(t.style[k])));

  // ── State shown ──
  const boxBold = targets.every((t) => t.style.bold || allHaveMark(t.text, 'bold'));
  const boxItalic = targets.every((t) => t.style.italic || allHaveMark(t.text, 'italic'));
  // Underline and strikethrough exist only as marks on text, so selected boxes without text can't take them (see
  // EMPTY_BOX_MARK_HINT) and don't count when deciding whether the boxes that have text are all marked.
  const markable = targets.filter((t) => holdsText(t.text));
  const marksOff = !editor && hasText && markable.length === 0;
  const state = live ?? {
    bold: hasText && boxBold,
    italic: hasText && boxItalic,
    underline: markable.length > 0 && markable.every((t) => allHaveMark(t.text, 'underline')),
    strike: markable.length > 0 && markable.every((t) => allHaveMark(t.text, 'strike')),
    bullet: hasText && targets.every((t) => listKindOf(t.text) === 'bullet'),
    ordered: hasText && targets.every((t) => listKindOf(t.text) === 'ordered'),
    align: null,
    fontFamily: null,
    fontSize: null,
  };
  const boxAlign = common(targets.map((t) => t.style.align));
  const align: TextAlign | '' = live?.align ?? boxAlign;
  const boxFont = common(targets.map((t) => t.style.font));
  const font = live?.fontFamily ?? boxFont;
  const boxSize = common(targets.map((t) => t.style.fontSize));
  const size = live?.fontSize ? ptOf(live.fontSize) ?? '' : boxSize;

  // ── Commands ──
  type Simple = 'bold' | 'italic' | 'underline' | 'strike';
  const toggle = (mark: Simple) => {
    if (editor) {
      const c = editor.chain().focus();
      (mark === 'bold' ? c.toggleBold() : mark === 'italic' ? c.toggleItalic() : mark === 'underline' ? c.toggleUnderline() : c.toggleStrike()).run();
      return;
    }
    if (mark === 'bold' || mark === 'italic') {
      const on = mark === 'bold' ? boxBold : boxItalic;
      ctx.formatBoxes((t) => ({ ...t, style: { ...t.style, [mark]: !on }, text: setMarkEverywhere(t.text, mark, false) }));
    } else {
      if (marksOff) return;
      const on = mark === 'underline' ? state.underline : state.strike;
      ctx.formatBoxes((t) => ({ ...t, text: setMarkEverywhere(t.text, mark, !on) }));
    }
  };
  const setFont = (value: string) => {
    if (editor) {
      if (!value) editor.chain().focus().unsetFontFamily().run();
      else editor.chain().focus().setFontFamily(value === 'heading' ? theme.fonts.heading : value === 'body' ? theme.fonts.body : value).run();
      return;
    }
    if (value) ctx.formatBoxes((t) => ({ ...t, style: { ...t.style, font: value }, text: clearTextStyleAttr(t.text, 'fontFamily') }));
  };
  const setSize = (pt: number) => {
    if (!Number.isFinite(pt) || pt <= 0) return;
    if (editor) editor.chain().focus().setFontSize(`${pt}pt`).run();
    else ctx.formatBoxes((t) => ({ ...t, style: { ...t.style, fontSize: pt }, text: clearTextStyleAttr(t.text, 'fontSize') }));
  };
  const setColor = (value: string | null) => {
    if (editor) {
      if (value === null) editor.chain().focus().unsetColor().run();
      else editor.chain().focus().setColor(value.startsWith('#') ? value : resolveColor({ theme: value as ThemeColorSlot }, theme)).run();
      return;
    }
    const color: Color = value === null ? { theme: 'dark1' } : value.startsWith('#') ? value : { theme: value as ThemeColorSlot };
    ctx.formatBoxes((t) => ({ ...t, style: { ...t.style, color }, text: clearTextStyleAttr(t.text, 'color') }));
  };
  const setAlign = (a: TextAlign) => {
    if (editor) editor.chain().focus().setTextAlign(a).run();
    else ctx.formatBoxes((t) => ({ ...t, style: { ...t.style, align: a }, text: clearParagraphAlign(t.text) }));
  };
  const setList = (kind: 'bullet' | 'ordered') => {
    if (editor) {
      const c = editor.chain().focus();
      (kind === 'bullet' ? c.toggleBulletList() : c.toggleOrderedList()).run();
      return;
    }
    const on = kind === 'bullet' ? state.bullet : state.ordered;
    ctx.formatBoxes((t) => ({ ...t, text: setListEverywhere(t.text, on ? 'none' : kind) }));
  };

  const fontOptions = [...FONT_NAMES];
  if (font && font !== 'heading' && font !== 'body' && !fontOptions.includes(font)) fontOptions.push(font);
  const sizeOptions = [...FONT_SIZES];
  if (typeof size === 'number' && !sizeOptions.includes(size)) sizeOptions.push(size), sizeOptions.sort((a, b) => a - b);
  const one = selected.length === 1;
  const none = selected.length === 0;
  const allLocked = !none && selected.every((e) => e.locked);
  // Aligning, distributing and rotating never move locked objects: with only locked ones selected they do nothing.
  const fixed = selected.every((e) => e.locked);
  const mod = modKey();

  return (
    <>
      <Group label="Clipboard">
        <ToolButton label="Paste" shortcut={`${mod}V`} onClick={ctx.paste} disabled={!ctx.canPaste || !ctx.slide}>
          <ClipboardPaste size={16} />
        </ToolButton>
        <ToolButton label="Cut" shortcut={`${mod}X`} onClick={ctx.cut} disabled={none || !!editor}>
          <Scissors size={16} />
        </ToolButton>
        <ToolButton label="Copy" shortcut={`${mod}C`} onClick={ctx.copy} disabled={none || !!editor}>
          <Copy size={16} />
        </ToolButton>
        <ToolButton label="Duplicate" shortcut={`${mod}D`} onClick={ctx.duplicate} disabled={none || !!editor}>
          <CopyPlus size={16} />
        </ToolButton>
      </Group>
      <Group label="Slides">
        <ToolButton label="New slide" text="New slide" onClick={() => ctx.newSlide()}>
          <Plus size={16} />
        </ToolButton>
        <LayoutMenu content={content} onPick={(id) => ctx.newSlide(id)} />
      </Group>
      <Group label="Font">
        <Select
          aria-label="Font"
          value={font}
          disabled={!hasText}
          onChange={(e) => setFont(e.target.value)}
          className="h-8 w-36 py-0 text-xs"
        >
          {font === '' && <option value="">{hasText ? 'Mixed' : 'Font'}</option>}
          <option value="heading">Headings ({theme.fonts.heading})</option>
          <option value="body">Body ({theme.fonts.body})</option>
          {fontOptions.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </Select>
        <Select aria-label="Font size" value={size === '' ? '' : String(size)} disabled={!hasText} onChange={(e) => setSize(Number(e.target.value))} className="h-8 w-[4.5rem] py-0 text-xs">
          {size === '' && <option value="">{hasText ? '–' : 'Size'}</option>}
          {sizeOptions.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>
        <ToolButton label="Bold" shortcut={`${mod}B`} pressed={state.bold} disabled={!hasText} onClick={() => toggle('bold')}>
          <Bold size={16} />
        </ToolButton>
        <ToolButton label="Italic" shortcut={`${mod}I`} pressed={state.italic} disabled={!hasText} onClick={() => toggle('italic')}>
          <Italic size={16} />
        </ToolButton>
        <ToolButton
          label="Underline"
          shortcut={`${mod}U`}
          pressed={state.underline}
          disabled={!hasText || marksOff}
          {...(marksOff ? { title: `Underline: ${EMPTY_BOX_MARK_HINT}` } : {})}
          onClick={() => toggle('underline')}
        >
          <Underline size={16} />
        </ToolButton>
        <ToolButton
          label="Strikethrough"
          pressed={state.strike}
          disabled={!hasText || marksOff}
          {...(marksOff ? { title: `Strikethrough: ${EMPTY_BOX_MARK_HINT}` } : {})}
          onClick={() => toggle('strike')}
        >
          <Strikethrough size={16} />
        </ToolButton>
        <Popover
          label="Text colour"
          trigger={({ open, toggle: t }) => (
            <ToolButton label="Text colour" aria-expanded={open} aria-haspopup="dialog" disabled={!hasText} onClick={t}>
              <Baseline size={16} />
            </ToolButton>
          )}
        >
          {(close) => (
            <ColorSwatches
              automaticLabel="Automatic"
              theme={THEME_COLOR_SLOTS.filter((s) => s !== 'hyperlink').map((slot) => ({ label: `${SLOT_NAMES[slot]} (${theme.colors[slot]})`, value: slot, css: theme.colors[slot] }))}
              standard={STANDARD_COLORS}
              onPick={(v) => {
                setColor(v);
                close();
              }}
            />
          )}
        </Popover>
      </Group>
      <Group label="Paragraph">
        <ToolButton label="Bullets" pressed={state.bullet} disabled={!hasText} onClick={() => setList('bullet')}>
          <List size={16} />
        </ToolButton>
        <ToolButton label="Numbering" pressed={state.ordered} disabled={!hasText} onClick={() => setList('ordered')}>
          <ListOrdered size={16} />
        </ToolButton>
        {(['left', 'center', 'right', 'justify'] as const).map((a) => {
          const Icon = ALIGN_ICONS[a];
          return (
            <ToolButton key={a} label={ALIGN_LABELS[a]} pressed={hasText && align === a} disabled={!hasText} onClick={() => setAlign(a)}>
              <Icon size={16} />
            </ToolButton>
          );
        })}
        <Select
          aria-label="Vertical alignment"
          value={style('verticalAlign') ? JSON.parse(style('verticalAlign') as string) : ''}
          disabled={!hasText}
          onChange={(e) => ctx.formatBoxes((t) => ({ ...t, style: { ...t.style, verticalAlign: e.target.value as VerticalAlign } }))}
          className="h-8 w-24 py-0 text-xs"
        >
          {!style('verticalAlign') && <option value="">{hasText ? 'Mixed' : 'Position'}</option>}
          <option value="top">Top</option>
          <option value="middle">Middle</option>
          <option value="bottom">Bottom</option>
        </Select>
        <Select
          aria-label="Autofit"
          value={style('autofit') ? JSON.parse(style('autofit') as string) : ''}
          disabled={!hasText}
          onChange={(e) => ctx.formatBoxes((t) => ({ ...t, style: { ...t.style, autofit: e.target.value as Autofit } }))}
          className="h-8 w-44 py-0 text-xs"
        >
          {!style('autofit') && <option value="">{hasText ? 'Mixed' : 'Autofit'}</option>}
          <option value="shrink">Shrink text on overflow</option>
          <option value="resize">Resize box to fit text</option>
          <option value="none">Do not autofit</option>
        </Select>
      </Group>
      <Group label="Arrange">
        <Menu
          trigger={(p) => (
            <button
              type="button"
              {...p}
              aria-haspopup="menu"
              disabled={none || !!editor}
              onMouseDown={(e) => e.preventDefault()}
              className="inline-flex h-8 shrink-0 items-center gap-1 rounded-md px-1.5 text-xs text-fg hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-accent disabled:pointer-events-none disabled:opacity-40"
            >
              <Layers size={16} />
              Arrange
            </button>
          )}
          items={[
            { label: 'Bring to front', hint: `${mod}⇧]`, onSelect: () => ctx.reorder('front'), disabled: !ctx.canReorder('front') },
            { label: 'Bring forward', hint: `${mod}]`, onSelect: () => ctx.reorder('forward'), disabled: !ctx.canReorder('forward') },
            { label: 'Send backward', hint: `${mod}[`, onSelect: () => ctx.reorder('backward'), disabled: !ctx.canReorder('backward') },
            { label: 'Send to back', hint: `${mod}⇧[`, onSelect: () => ctx.reorder('back'), disabled: !ctx.canReorder('back') },
            { label: one ? 'Align left (to slide)' : 'Align left', onSelect: () => ctx.align('left'), disabled: fixed },
            { label: one ? 'Align centre (to slide)' : 'Align centre', onSelect: () => ctx.align('center'), disabled: fixed },
            { label: one ? 'Align right (to slide)' : 'Align right', onSelect: () => ctx.align('right'), disabled: fixed },
            { label: one ? 'Align top (to slide)' : 'Align top', onSelect: () => ctx.align('top'), disabled: fixed },
            { label: one ? 'Align middle (to slide)' : 'Align middle', onSelect: () => ctx.align('middle'), disabled: fixed },
            { label: one ? 'Align bottom (to slide)' : 'Align bottom', onSelect: () => ctx.align('bottom'), disabled: fixed },
            { label: 'Distribute horizontally', onSelect: () => ctx.distribute('horizontal'), disabled: selected.length < 3 || fixed },
            { label: 'Distribute vertically', onSelect: () => ctx.distribute('vertical'), disabled: selected.length < 3 || fixed },
            { label: 'Rotate right 90°', onSelect: () => ctx.rotateBy(90), disabled: fixed },
            { label: 'Rotate left 90°', onSelect: () => ctx.rotateBy(-90), disabled: fixed },
          ]}
        />
        <ToolButton label="Lock" pressed={allLocked} disabled={none} onClick={() => ctx.setLocked(!allLocked)}>
          <Lock size={16} />
        </ToolButton>
        <ToolButton label="Delete" shortcut="Del" disabled={none || !!editor} onClick={ctx.remove}>
          <Trash2 size={16} />
        </ToolButton>
      </Group>
    </>
  );
}
