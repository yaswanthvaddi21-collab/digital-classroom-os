import type { Editor } from '@tiptap/core';
import { EditorContent, useEditor } from '@tiptap/react';
import { useEffect, useLayoutEffect, useRef, type CSSProperties } from 'react';
import { cleanRichText } from '../editor/richText';
import { slideTextExtensions } from '../editor/textExtensions';
import { textCss } from '../render/SlideView';
import { resolveColor } from '../themes';
import type { PresentationTheme, RichTextDoc, TableElement, TextStyle } from '../types';
import { cellBox, nextCell, type CellRange, type CellRef } from './table';

/** The text style a cell shows: the table's text style, with the header row's colour and bold header/first column. */
export function cellTextStyle(t: TableElement, at: CellRef): TextStyle {
  const s = t.style;
  const cell = t.rows[at.row]?.cells[at.col];
  const header = s.headerRow && at.row === 0;
  const first = s.firstColumn && at.col === 0;
  return {
    ...s.text,
    align: cell?.align ?? s.text.align,
    verticalAlign: cell?.verticalAlign ?? s.text.verticalAlign,
    bold: header || first || s.text.bold,
    color: header ? s.headerTextColor : s.text.color,
    autofit: 'none',
  };
}

/**
 * Editing a table's cells in place: every cell can be clicked (Shift+click selects a range for fill and borders), the
 * active cell holds the one text editor. Tab and Shift+Tab move between cells (Tab in the last cell adds a row),
 * Escape stops editing.
 */
export function TableOverlay({
  table,
  theme,
  cell,
  range,
  session,
  onCell,
  onText,
  onNeedHeight,
  onAddRow,
  onEditor,
  onExit,
}: {
  table: TableElement;
  theme: PresentationTheme;
  cell: CellRef;
  range: CellRange;
  session: number;
  onCell: (cell: CellRef, extend: boolean) => void;
  onText: (doc: RichTextDoc) => void;
  onNeedHeight: (h: number) => void;
  onAddRow: () => void;
  onEditor: (editor: Editor | null) => void;
  onExit: () => void;
}) {
  const active = cellBox(table, cell);
  const many = range.r0 !== range.r1 || range.c0 !== range.c1;
  const cells: Array<{ ref: CellRef; box: ReturnType<typeof cellBox> }> = [];
  table.rows.forEach((row, r) => row.cells.forEach((c, col) => !c.merged && cells.push({ ref: { row: r, col }, box: cellBox(table, { row: r, col }) })));
  return (
    <div
      data-table-editor={table.id}
      role="group"
      aria-label={`Table cells, row ${cell.row + 1} of ${table.rows.length}, column ${cell.col + 1} of ${table.columns.length}`}
      style={{ position: 'absolute', left: table.x, top: table.y, width: table.w, height: table.h, transform: table.rotation ? `rotate(${table.rotation}deg)` : undefined, pointerEvents: 'none' }}
    >
      {cells.map(({ ref, box }) => {
        const inRange = many && ref.row >= range.r0 && ref.row <= range.r1 && ref.col >= range.c0 && ref.col <= range.c1;
        const isActive = ref.row === cell.row && ref.col === cell.col;
        return (
          <div
            key={`${ref.row}:${ref.col}`}
            data-cell={`${ref.row}:${ref.col}`}
            aria-hidden
            onPointerDown={(e) => {
              if (isActive) return;
              e.stopPropagation();
              e.preventDefault();
              onCell(ref, e.shiftKey);
            }}
            // The press must not move the focus to the page: the newly active cell's editor takes it.
            onMouseDown={(e) => e.preventDefault()}
            style={{ position: 'absolute', left: box.x, top: box.y, width: box.w, height: box.h, pointerEvents: isActive ? 'none' : 'auto', cursor: 'text', background: inRange ? 'rgba(79,70,229,0.16)' : undefined }}
          />
        );
      })}
      <div style={{ position: 'absolute', left: active.x, top: active.y, width: active.w, minHeight: active.h, pointerEvents: 'auto', outline: '2px solid #4f46e5', outlineOffset: -1 }}>
        <CellEditor
          key={`${session}:${cell.row}:${cell.col}`}
          table={table}
          cell={cell}
          theme={theme}
          onText={onText}
          onNeedHeight={onNeedHeight}
          onEditor={onEditor}
          onTab={(back) => {
            const next = nextCell(table, cell, back);
            if (next) onCell(next, false);
            else if (!back) onAddRow();
          }}
          onExit={onExit}
        />
      </div>
    </div>
  );
}

function CellEditor({
  table,
  cell,
  theme,
  onText,
  onNeedHeight,
  onEditor,
  onTab,
  onExit,
}: {
  table: TableElement;
  cell: CellRef;
  theme: PresentationTheme;
  onText: (doc: RichTextDoc) => void;
  onNeedHeight: (h: number) => void;
  onEditor: (editor: Editor | null) => void;
  onTab: (back: boolean) => void;
  onExit: () => void;
}) {
  const data = table.rows[cell.row].cells[cell.col];
  const last = useRef<RichTextDoc>(data.text);
  const handlers = useRef({ onText, onNeedHeight, onTab, onExit });
  handlers.current = { onText, onNeedHeight, onTab, onExit };
  const inner = useRef<HTMLDivElement>(null);
  const style = cellTextStyle(table, cell);
  const box = cellBox(table, cell);

  const measure = () => {
    const el = inner.current;
    if (!el) return;
    const [t, , b] = style.padding;
    const needed = Math.ceil(el.scrollHeight + t + b);
    if (el.scrollHeight > 0 && needed > box.h + 1) handlers.current.onNeedHeight(needed);
  };

  const editor = useEditor({
    extensions: slideTextExtensions(),
    content: data.text,
    editorProps: {
      attributes: { 'aria-label': `Cell, row ${cell.row + 1}, column ${cell.col + 1}`, 'aria-multiline': 'true', role: 'textbox', spellcheck: 'true' },
      handleKeyDown: (_view, e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          handlers.current.onExit();
          return true;
        }
        if (e.key === 'Tab' && !e.ctrlKey && !e.metaKey && !e.altKey) {
          e.preventDefault();
          handlers.current.onTab(e.shiftKey);
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor: ed }) => {
      const doc = cleanRichText(ed.getJSON());
      last.current = doc;
      handlers.current.onText(doc);
      requestAnimationFrame(measure);
    },
  });

  useEffect(() => {
    if (!editor || data.text === last.current) return;
    last.current = data.text;
    editor.commands.setContent(data.text, { emitUpdate: false });
  }, [editor, data.text]);

  useEffect(() => {
    if (!editor) return;
    onEditor(editor);
    // Focus now (Tiptap's focus command waits a frame), so keys typed right after Tab land in this cell.
    try {
      editor.view.focus();
    } catch {
      // Not attached yet: the focus command below still focuses it.
    }
    editor.commands.focus('end');
    return () => onEditor(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  useLayoutEffect(measure, [table.style, box.w]); // eslint-disable-line react-hooks/exhaustive-deps

  const css: CSSProperties = { ...textCss(style, theme), color: resolveColor(style.color, theme), width: '100%', minHeight: box.h, boxSizing: 'border-box', overflow: 'visible', cursor: 'text' };
  return (
    <div style={css} className="dcos-slide-text" onPointerDown={(e) => e.stopPropagation()} onContextMenu={(e) => e.stopPropagation()}>
      <div ref={inner}>
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
