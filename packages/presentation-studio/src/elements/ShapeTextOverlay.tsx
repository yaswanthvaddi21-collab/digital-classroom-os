import type { Editor } from '@tiptap/core';
import { TextBoxEditor } from '../editor/TextBoxEditor';
import { shapeTextBox } from '../render/shapePaths';
import type { PresentationTheme, RichTextDoc, ShapeElement, TextElement } from '../types';

/**
 * The text editor of a shape, in slide pixels over the shape's text area (turned with the shape). The same text box
 * editor as text boxes, so typing, the ribbon's text formatting and Escape behave the same.
 */
export function ShapeTextOverlay({
  shape,
  text,
  theme,
  caretAt,
  onText,
  onNeedHeight,
  onEditor,
  onExit,
}: {
  shape: ShapeElement;
  text: TextElement;
  theme: PresentationTheme;
  caretAt: { x: number; y: number } | null;
  onText: (doc: RichTextDoc) => void;
  onNeedHeight: (h: number) => void;
  onEditor: (editor: Editor | null) => void;
  onExit: () => void;
}) {
  const tb = shapeTextBox(shape.preset, shape.w, shape.h);
  return (
    <div
      data-shape-text-editor={shape.id}
      style={{ position: 'absolute', left: shape.x, top: shape.y, width: shape.w, height: shape.h, transform: shape.rotation ? `rotate(${shape.rotation}deg)` : undefined, pointerEvents: 'none' }}
    >
      <div style={{ position: 'absolute', left: tb.x, top: tb.y, width: tb.w, height: tb.h, pointerEvents: 'auto' }}>
        <TextBoxEditor el={text} theme={theme} prompt="Type text in the shape" caretAt={caretAt} onText={onText} onNeedHeight={onNeedHeight} onEditor={onEditor} onExit={onExit} />
      </div>
    </div>
  );
}
