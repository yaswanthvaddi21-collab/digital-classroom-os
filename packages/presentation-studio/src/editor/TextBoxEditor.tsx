import type { Editor } from '@tiptap/core';
import { EditorContent, useEditor } from '@tiptap/react';
import { useEffect, useLayoutEffect, useRef, type CSSProperties } from 'react';
import { textCss } from '../render/SlideView';
import type { PresentationTheme, RichTextDoc, TextElement } from '../types';
import { cleanRichText } from './richText';
import { slideTextExtensions } from './textExtensions';

export interface TextBoxEditorProps {
  el: TextElement;
  theme: PresentationTheme;
  /** The placeholder's prompt, shown while the box is empty. */
  prompt?: string;
  /** Where the box was double-clicked, to put the caret there (screen coordinates). */
  caretAt?: { x: number; y: number } | null;
  /** Every change of the text, as schema-1 rich text. */
  onText: (doc: RichTextDoc) => void;
  /** 'Resize box to fit text': the height the text needs (slide px). */
  onNeedHeight: (height: number) => void;
  /** The live editor while it is mounted (the ribbon formats through it), null when it goes. */
  onEditor: (editor: Editor | null) => void;
  /** Escape: stop editing. */
  onExit: () => void;
}

/**
 * The one Tiptap editor on the slide, mounted only on the text box being edited (every other box is drawn by
 * RichText). It shows the text exactly where and how the box shows it, in slide pixels inside the scaled stage.
 */
export function TextBoxEditor({ el, theme, prompt, caretAt, onText, onNeedHeight, onEditor, onExit }: TextBoxEditorProps) {
  const last = useRef<RichTextDoc>(el.text);
  const handlers = useRef({ onText, onNeedHeight, onExit });
  handlers.current = { onText, onNeedHeight, onExit };
  const autofit = useRef(el.style.autofit);
  autofit.current = el.style.autofit;
  const inner = useRef<HTMLDivElement>(null);

  const measure = () => {
    if (autofit.current !== 'resize' || !inner.current) return;
    const [t, , b] = el.style.padding;
    const needed = Math.ceil(inner.current.scrollHeight + t + b);
    if (needed > 0) handlers.current.onNeedHeight(needed);
  };

  const editor = useEditor({
    extensions: slideTextExtensions(prompt),
    content: el.text,
    editorProps: {
      attributes: { 'aria-label': prompt ? `Text: ${prompt}` : 'Text', 'aria-multiline': 'true', role: 'textbox', spellcheck: 'true' },
      handleKeyDown: (_view, e) => {
        if (e.key !== 'Escape') return false;
        e.preventDefault();
        handlers.current.onExit();
        return true;
      },
    },
    onUpdate: ({ editor: ed }) => {
      const doc = cleanRichText(ed.getJSON());
      last.current = doc;
      handlers.current.onText(doc);
      requestAnimationFrame(measure);
    },
  });

  // The text changed from outside (box-level formatting from the ribbon): show it.
  useEffect(() => {
    if (!editor || el.text === last.current) return;
    last.current = el.text;
    editor.commands.setContent(el.text, { emitUpdate: false });
  }, [editor, el.text]);

  useEffect(() => {
    if (!editor) return;
    onEditor(editor);
    // Put the caret where the box was double-clicked, else at the end of the text.
    let placed = false;
    if (caretAt) {
      try {
        const at = editor.view.posAtCoords({ left: caretAt.x, top: caretAt.y });
        if (at) {
          editor.chain().focus().setTextSelection(at.pos).run();
          placed = true;
        }
      } catch {
        // No layout to measure (an engine without elementFromPoint): the caret goes to the end instead.
      }
    }
    if (!placed) editor.commands.focus('end');
    return () => onEditor(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  // Measured again when the box's style (a font size from the ribbon) or width changes, not only on typing.
  useLayoutEffect(measure, [el.style, el.w]); // eslint-disable-line react-hooks/exhaustive-deps

  const style: CSSProperties = { ...textCss(el.style, theme), width: '100%', height: '100%', boxSizing: 'border-box', overflow: 'visible', cursor: 'text' };
  return (
    <div style={style} className="dcos-slide-text" onPointerDown={(e) => e.stopPropagation()} onContextMenu={(e) => e.stopPropagation()}>
      <div ref={inner}>
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
