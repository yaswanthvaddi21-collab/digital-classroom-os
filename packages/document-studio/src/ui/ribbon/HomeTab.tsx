import { IconButton, Select, Separator } from '@dcos/ui';
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
  Italic,
  List,
  ListOrdered,
  Quote,
  Redo2,
  Strikethrough,
  Subscript,
  Superscript,
  Underline,
  Undo2,
} from 'lucide-react';
import { applyNamedStyle, currentNamedStyle, NAMED_STYLES, type NamedStyleId } from '../../extensions/paragraphFormat';
import { HIGHLIGHT_COLORS, Popover, TEXT_COLORS } from '../Popover';
import type { RibbonContext } from './context';
import { ColorPanel } from './format/ColorPanel';
import { BulletStyleMenu, CustomFontSize, IndentControls, LineSpacingControl, NumberFormatMenu } from './format/ParagraphControls';
import { Group } from './parts';

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

/** Home: undo, paragraph styles, fonts, character formatting, colours, lists and alignment. */
export function HomeTab({ editor, advanced }: RibbonContext) {
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
      align: (['left', 'center', 'right', 'justify'] as const).find((a) => e.isActive({ textAlign: a })) ?? 'left',
      // G-FORMAT: the named style at the cursor (Normal, Title, Subtitle, Heading 1–4, Quote, Caption, Code).
      style: currentNamedStyle(e),
      color: (e.getAttributes('textStyle').color as string | undefined) ?? null,
      highlight: (e.getAttributes('highlight').color as string | undefined) ?? null,
      font: (e.getAttributes('textStyle').fontFamily as string | undefined) ?? '',
      size: (e.getAttributes('textStyle').fontSize as string | undefined) ?? '',
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    }),
  });
  const chain = () => editor.chain().focus();

  return (
    <>
      <Group label="Undo">
        <IconButton label="Undo (Ctrl+Z)" disabled={!s.canUndo} onClick={() => chain().undo().run()}>
          <Undo2 size={16} />
        </IconButton>
        <IconButton label="Redo (Ctrl+Shift+Z)" disabled={!s.canRedo} onClick={() => chain().redo().run()}>
          <Redo2 size={16} />
        </IconButton>
      </Group>
      <Separator vertical />
      <Group label="Styles" className="gap-1">
        {/* @phase4:format-styles — named paragraph styles go here. */}
        <Select aria-label="Text style" value={s.style} onChange={(e) => applyNamedStyle(editor, e.target.value as NamedStyleId)} className="w-32">
          {NAMED_STYLES.map((st) => (
            <option key={st.id} value={st.id}>
              {st.label}
            </option>
          ))}
        </Select>
      </Group>
      {advanced && (
        <Group label="Font" className="gap-1">
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
            {(SIZES.includes(s.size) ? SIZES : [...SIZES, s.size]).map((sz) => (
              <option key={sz} value={sz}>
                {sz ? sz.replace('pt', '') : 'Size'}
              </option>
            ))}
          </Select>
          {/* @phase4:format-font — custom font size goes here. */}
          <CustomFontSize editor={editor} />
        </Group>
      )}
      <Separator vertical />
      <Group label="Character formatting">
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
          trigger={({ toggle, open }) => (
            <IconButton label="Text colour" aria-expanded={open} onClick={toggle}>
              <Baseline size={16} />
            </IconButton>
          )}
        >
          {(close) => (
            <ColorPanel
              colors={TEXT_COLORS}
              clearLabel="Default colour"
              label="Custom text colour"
              current={s.color}
              onPick={(c) => (chain().setColor(c).run(), close())}
              onLive={(c) => editor.chain().setColor(c).run()}
              onClear={() => (chain().unsetColor().run(), close())}
            />
          )}
        </Popover>
        <Popover
          trigger={({ toggle, open }) => (
            <IconButton label="Highlight" aria-expanded={open} onClick={toggle}>
              <Highlighter size={16} />
            </IconButton>
          )}
        >
          {(close) => (
            <ColorPanel
              colors={HIGHLIGHT_COLORS}
              clearLabel="No highlight"
              label="Custom highlight colour"
              current={s.highlight}
              onPick={(c) => (chain().setHighlight({ color: c }).run(), close())}
              onLive={(c) => editor.chain().setHighlight({ color: c }).run()}
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
        {/* @phase4:format-character — custom text and highlight colours go here. */}
      </Group>
      <Separator vertical />
      <Group label="Paragraph">
        <IconButton label="Bulleted list" active={s.bullet} onClick={() => chain().toggleBulletList().run()}>
          <List size={16} />
        </IconButton>
        {advanced && <BulletStyleMenu editor={editor} />}
        <IconButton label="Numbered list" active={s.ordered} onClick={() => chain().toggleOrderedList().run()}>
          <ListOrdered size={16} />
        </IconButton>
        {advanced && <NumberFormatMenu editor={editor} />}
        <IconButton label="Quote" active={s.quote} onClick={() => chain().toggleBlockquote().run()}>
          <Quote size={16} />
        </IconButton>
        {/* @phase4:format-paragraph — list styles, indentation and spacing go here. */}
        {advanced && <IndentControls editor={editor} />}
      </Group>
      <Separator vertical />
      <Group label="Alignment">
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
        {/* @phase4:format-alignment — line spacing goes here. */}
        <LineSpacingControl editor={editor} />
      </Group>
      {/* @phase4:format — add further Home tab groups here. */}
    </>
  );
}
