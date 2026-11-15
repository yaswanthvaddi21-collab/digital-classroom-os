import { EditorContent, useEditor } from '@tiptap/react';
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import type { RichTextDoc } from '../types';
import { cleanRichText } from './richText';
import { slideTextExtensions } from './textExtensions';

const STORAGE_KEY = 'dcos.presentation.notesHeight';
export const NOTES_MIN = 56;
export const NOTES_MAX = 480;

function storedHeight(fallback: number): number {
  try {
    const v = Number(localStorage.getItem(STORAGE_KEY));
    return Number.isFinite(v) && v >= NOTES_MIN && v <= NOTES_MAX ? v : fallback;
  } catch {
    return fallback;
  }
}

function storeHeight(h: number) {
  try {
    localStorage.setItem(STORAGE_KEY, String(Math.round(h)));
  } catch {
    // Private windows may refuse storage; the height then lasts for this visit only.
  }
}

/** The notes editor of one slide (remounted for each slide, so its own undo never reaches another slide's notes). */
function NotesEditor({ notes, label, onChange, onFocusChange }: { notes: RichTextDoc; label: string; onChange: (doc: RichTextDoc) => void; onFocusChange: (focused: boolean) => void }) {
  const last = useRef(notes);
  const handler = useRef({ onChange, onFocusChange });
  handler.current = { onChange, onFocusChange };
  const editor = useEditor({
    extensions: slideTextExtensions('Click to add speaker notes'),
    content: notes,
    editorProps: { attributes: { 'aria-label': label, 'aria-multiline': 'true', role: 'textbox', class: 'min-h-full' } },
    onUpdate: ({ editor: ed }) => {
      const doc = cleanRichText(ed.getJSON());
      last.current = doc;
      handler.current.onChange(doc);
    },
    onFocus: () => handler.current.onFocusChange(true),
    onBlur: () => handler.current.onFocusChange(false),
  });
  // Notes changed from outside (undo, redo): show them.
  useEffect(() => {
    if (!editor || notes === last.current) return;
    last.current = notes;
    editor.commands.setContent(notes, { emitUpdate: false });
  }, [editor, notes]);
  return <EditorContent editor={editor} className="dcos-notes h-full text-sm text-fg" />;
}

/**
 * Speaker notes of the current slide: rich text (Ctrl+B, Ctrl+I, Ctrl+U, "- " for bullets, "1. " for numbering), in a
 * pane whose height is dragged or set with the arrow keys on its handle, and remembered on this device.
 */
export function NotesPane({ slideId, slideNumber, notes, onChange, onFocusChange, compact }: { slideId: string; slideNumber: number; notes: RichTextDoc; onChange: (slideId: string, doc: RichTextDoc) => void; onFocusChange: (focused: boolean) => void; compact: boolean }) {
  const [height, setHeight] = useState(() => storedHeight(compact ? 88 : 128));
  const drag = useRef<{ y: number; h: number } | null>(null);
  const set = (h: number) => {
    const v = Math.max(NOTES_MIN, Math.min(NOTES_MAX, Math.round(h)));
    setHeight(v);
    storeHeight(v);
  };
  const onKey = (e: KeyboardEvent) => {
    const step = e.shiftKey ? 64 : 16;
    if (e.key === 'ArrowUp') set(height + step);
    else if (e.key === 'ArrowDown') set(height - step);
    else if (e.key === 'Home') set(NOTES_MAX);
    else if (e.key === 'End') set(NOTES_MIN);
    else return;
    e.preventDefault();
  };
  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    drag.current = { y: e.clientY, h: height };
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (drag.current) set(drag.current.h + (drag.current.y - e.clientY));
  };
  const end = () => {
    drag.current = null;
  };
  return (
    <section aria-label="Speaker notes" className="flex shrink-0 flex-col border-t border-border bg-surface" style={{ height }}>
      <div
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize speaker notes"
        aria-valuenow={height}
        aria-valuemin={NOTES_MIN}
        aria-valuemax={NOTES_MAX}
        tabIndex={0}
        onKeyDown={onKey}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={end}
        onPointerCancel={end}
        className="group flex h-2.5 shrink-0 cursor-row-resize touch-none items-center justify-center focus-visible:outline-2 focus-visible:outline-accent"
      >
        <span className="h-1 w-10 rounded-full bg-border group-hover:bg-muted" />
      </div>
      <div className="flex min-h-0 flex-1 flex-col px-4 pb-2">
        <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Speaker notes</h2>
        <div className="min-h-0 flex-1 cursor-text overflow-y-auto">
          <NotesEditor key={slideId} notes={notes} label={`Speaker notes for slide ${slideNumber}`} onChange={(doc) => onChange(slideId, doc)} onFocusChange={onFocusChange} />
        </div>
      </div>
    </section>
  );
}
